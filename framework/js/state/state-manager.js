/**
 * @file state-manager.js
 * @description Sole public API for all state and LMS operations.
 *
 * This is the ONLY module that callers should import for state or LMS access.
 * Internally composes focused modules:
 *   - DomainStore: domain CRUD with append-only semantics
 *   - CommitScheduler: auto-batched commit lifecycle
 *   - StateValidator: hydration, migration, validation
 *   - TransactionLog: ring buffer for debugging
 *
 * LMS communication flows through lmsConnection (internal, not exported).
 */

import { eventBus } from '../core/event-bus.js';
import lmsConnection from './lms-connection.js';
import xapiStatementService from './xapi-statement-service.js';
import { logger } from '../utilities/logger.js';

import { TransactionLog } from './transaction-log.js';
import { StateValidator } from './state-validation.js';
import { DomainStore } from './state-domains.js';
import { CommitScheduler } from './state-commits.js';

const VALID_COMPLETION_STATUSES = new Set(['completed', 'incomplete', 'not attempted', 'unknown']);
const VALID_SUCCESS_STATUSES = new Set(['passed', 'failed', 'unknown']);
const ISO_8601_DURATION_PATTERN = /^P(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)$/;

/**
 * Formats milliseconds as ISO 8601 duration for SCORM 2004.
 * @param {number} milliseconds
 * @returns {string} ISO 8601 duration string
 */
function formatISO8601Duration(milliseconds) {
    if (!milliseconds || milliseconds < 0) return 'PT0S';

    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let duration = 'PT';
    if (hours > 0) duration += `${hours}H`;
    if (minutes > 0) duration += `${minutes}M`;
    if (seconds > 0 || (hours === 0 && minutes === 0)) duration += `${seconds}S`;
    return duration;
}

class StateManager {
    constructor() {
        this.isInitialized = false;
        this.isTerminated = false;

        // Compose internal modules
        this._txLog = new TransactionLog();
        this._validator = new StateValidator();
        this._domains = new DomainStore(this._txLog);
        this._commits = new CommitScheduler(lmsConnection, this._domains, this._txLog);
    }

    // =================================================================
    // Connection Lifecycle (absorbed from main.js)
    // =================================================================

    /**
     * Initializes the LMS connection, lifecycle handlers, and xAPI service.
     * Call this BEFORE initialize().
     * @returns {Promise<boolean>} True if connected
     */
    async initializeConnection() {
        const connected = await lmsConnection.initialize();
        if (!connected) {
            throw new Error('LMS initialization failed. Cannot start course without LMS connection.');
        }

        lmsConnection.setupLifecycleHandlers();

        // Initialize xAPI service — no-op for SCORM drivers (they don't implement xAPI methods)
        xapiStatementService.initialize(lmsConnection.getDriver());

        logger.debug('[StateManager] LMS connection established');
        return true;
    }

    // =================================================================
    // Validation Config
    // =================================================================

    /**
     * Sets the course configuration used for state validation.
     * Must be called BEFORE initialize().
     */
    setCourseValidationConfig(config) {
        if (this.isInitialized) {
            throw new Error('StateManager: setCourseValidationConfig() must be called before initialize()');
        }
        this._validator.setCourseValidationConfig(config);
    }

    // =================================================================
    // State Initialization
    // =================================================================

    /**
     * Initializes the StateManager and hydrates state from LMS.
     * Call initializeConnection() first.
     */
    initialize() {
        if (this.isInitialized) {
            throw new Error('StateManager: Already initialized. Do not call initialize() more than once.');
        }

        this._checkCapabilities();

        this._domains.state = this._validator.hydrateStateFromLMS(lmsConnection);
        this.isInitialized = true;

        logger.debug('[StateManager] Initialized and state hydrated from LMS');
        eventBus.emit('state:initialized', this.getState());
    }

    // =================================================================
    // Domain State CRUD (delegates to DomainStore)
    // =================================================================

    /** @returns {object} Deep-cloned copy of the entire state */
    getState() {
        this._assertInitialized();
        return this._domains.getState();
    }

    /** @returns {any} Deep-cloned domain state, or undefined */
    getDomainState(domain) {
        this._assertInitialized();
        return this._domains.getDomainState(domain);
    }

    /**
     * Sets domain state and schedules a commit.
     * Append-only domains (interactions) append rather than replace.
     */
    setDomainState(domain, value, meta = {}) {
        if (this.isTerminated) {
            if (import.meta.env.DEV) {
                logger.warn(`[StateManager] Ignoring setDomainState('${domain}') - session already terminated`);
            }
            return;
        }
        this._assertInitialized();

        const result = this._domains.setDomainState(domain, value, meta);

        // Report to driver for format-specific handling
        if (domain === 'objectives' && value) {
            this._reportObjectivesToDriver(value);
        } else if (domain === 'interactions' && value) {
            lmsConnection.reportInteraction(value);
        }

        // Auto-batch: schedule debounced commit
        this._commits.scheduleCommit(true);

        return result;
    }

    /**
     * Clears all suspend data, resetting the course.
     * WARNING: Irreversible — deletes all learner progress.
     */
    async clearAllData() {
        this._assertInitialized();
        this._assertNotTerminated('Cannot clear data after termination.');

        logger.debug('[StateManager] Clearing all suspend data for course restart');
        this._domains.clearState();
        await this._commits.commitToLMS();
        eventBus.emit('state:cleared', { reason: 'course restart' });
    }

    /**
     * Sets LMS compatibility mode (auto/balanced/profiled behaviors).
     * Must be called before initializeConnection() for deterministic startup.
     */
    setCompatibilityMode(mode = 'auto') {
        if (this.isInitialized) {
            throw new Error('StateManager: setCompatibilityMode() must be called before initialize()');
        }
        lmsConnection.setCompatibilityMode(mode);
    }

    // =================================================================
    // Semantic LMS Passthroughs
    // =================================================================

    /** @returns {string} The entry mode (ab-initio, resume, etc.) */
    getEntryMode() {
        this._assertInitialized();
        return lmsConnection.getEntryMode();
    }

    /** @returns {string|null} The current bookmark (slide ID) */
    getBookmark() {
        return lmsConnection.getBookmark();
    }

    /** @param {string} slideId */
    setBookmark(slideId) {
        if (typeof slideId !== 'string' || !slideId.trim()) {
            throw new Error('StateManager: bookmark must be a non-empty string');
        }
        if (slideId.length > 1024) {
            throw new Error('StateManager: bookmark exceeds maximum length (1024)');
        }
        lmsConnection.setBookmark(slideId);
    }

    /** @param {{raw: number, scaled: number, min: number, max: number}} score */
    reportScore(score) {
        this._assertValidScore(score);
        lmsConnection.reportScore(score);
    }

    /** @param {string} status - 'completed' | 'incomplete' */
    reportCompletion(status) {
        this._assertValidCompletionStatus(status);
        lmsConnection.reportCompletion(status);
    }

    /** @param {string} status - 'passed' | 'failed' | 'unknown' */
    reportSuccess(status) {
        this._assertValidSuccessStatus(status);
        lmsConnection.reportSuccess(status);
    }

    /** @returns {string} Current completion status */
    getCompletion() {
        return lmsConnection.getCompletion();
    }

    /** @returns {string} Current success status */
    getSuccess() {
        return lmsConnection.getSuccess();
    }

    getScore() {
        return lmsConnection.getScore();
    }

    /** @returns {string} LMS format (scorm2004, scorm1.2, cmi5, lti) */
    getFormat() {
        return lmsConnection.getFormat();
    }

    /**
     * Gets cmi5 launch data (moveOn, masteryScore, etc.).
     * @returns {Object|null} Launch data or null if not available
     */
    getLaunchData() {
        return lmsConnection.getLaunchData();
    }

    /** @returns {Object} Driver capabilities */
    getCapabilities() {
        return lmsConnection.getCapabilities();
    }

    getLmsDiagnostics() {
        return lmsConnection.getDiagnostics();
    }

    // =================================================================
    // Session Lifecycle
    // =================================================================

    /**
     * Exits with 'suspend' status (user intends to return).
     */
    async exitCourseWithSuspend() {
        this._assertInitialized();
        this._assertNotTerminated('Cannot exit course again.');

        await this._commits.flush();
        this._reportSessionTime();

        logger.debug('[StateManager] Exiting course with suspend status');
        lmsConnection.setExitMode('suspend');
        return await this.terminate();
    }

    /**
     * Exits with 'normal' status (course is finished).
     */
    async exitCourseComplete() {
        this._assertInitialized();
        this._assertNotTerminated('Cannot exit course again.');

        await this._commits.flush();
        this._reportSessionTime();

        logger.debug('[StateManager] Exiting course with normal status');
        lmsConnection.setExitMode('normal');
        return await this.terminate();
    }

    /**
     * Terminates the LMS connection with a final commit.
     */
    async terminate() {
        this._assertInitialized();
        this._assertNotTerminated('Cannot terminate again.');

        logger.debug('[StateManager] Terminating...');

        // Emit BEFORE termination so services can send final xAPI statements
        await eventBus.emitAsync('session:beforeTerminate');

        await this._commits.commitToLMS();
        this.isTerminated = true;

        return await lmsConnection.terminate();
    }

    // =================================================================
    // Progress
    // =================================================================

    /**
     * Updates progress_measure based on visited slides.
     * @param {number} totalSlides - Total sequential slides
     */
    updateProgressMeasure(totalSlides) {
        this._assertInitialized();
        this._assertNotTerminated('Cannot update progress after termination.');
        if (!totalSlides || totalSlides <= 0) {
            throw new Error('StateManager: totalSlides must be provided and greater than 0');
        }

        try {
            const navigationState = this.getDomainState('navigation') || {};
            const visitedSlides = navigationState.visitedSlides || [];
            const visitedCount = visitedSlides.length;

            let progressMeasure = Math.min(visitedCount / totalSlides, 1.0);
            progressMeasure = Math.max(0, Math.min(1, progressMeasure));
            progressMeasure = Math.round(progressMeasure * 100) / 100;

            lmsConnection.reportProgress(progressMeasure);

            logger.debug(`[StateManager] Progress measure updated: ${progressMeasure} (${(progressMeasure * 100).toFixed(0)}%)`);
            logger.debug(`  - Slides visited: ${visitedCount}/${totalSlides}`);

            eventBus.emit('progress:updated', { progressMeasure, visitedSlides: visitedCount, totalSlides });
            return progressMeasure;
        } catch (error) {
            logger.error('[StateManager] Error updating progress_measure:', { domain: 'state', operation: 'updateProgressMeasure', stack: error.stack });
            throw error;
        }
    }

    // =================================================================
    // Commit Control
    // =================================================================

    /**
     * Immediately flushes any pending auto-batched writes.
     */
    async flush() {
        this._assertInitialized();
        await this._commits.flush();
    }

    // =================================================================
    // Debugging
    // =================================================================

    /**
     * Gets recent state transaction log entries.
     * @param {number} [n=10]
     */
    getTransactionLog(n = 10) {
        return this._txLog.getRecent(n);
    }

    // =================================================================
    // Private
    // =================================================================

    _assertInitialized() {
        if (!this.isInitialized) {
            throw new Error('StateManager: Not initialized. Call initialize() first.');
        }
    }

    _assertNotTerminated(msg) {
        if (this.isTerminated) {
            throw new Error(`StateManager: Already terminated. ${msg}`);
        }
    }

    _checkCapabilities() {
        try {
            const caps = lmsConnection.getCapabilities();
            const format = lmsConnection.getFormat();

            if (!caps.supportsObjectives) {
                logger.warn(`[StateManager] ${format} driver does not support objectives — they will be stored in suspend_data only`);
            }
            if (!caps.supportsInteractions) {
                logger.warn(`[StateManager] ${format} driver does not support interactions — they will be stored in suspend_data only`);
            }
            if (caps.maxSuspendDataBytes > 0) {
                logger.debug(`[StateManager] Suspend data limit: ${caps.maxSuspendDataBytes} bytes (${format})`);
            }
            eventBus.emit('state:capabilities', caps);
        } catch (error) {
            logger.debug('[StateManager] Could not check driver capabilities:', error.message);
        }
    }

    _reportObjectivesToDriver(objectives) {
        if (!objectives || typeof objectives !== 'object') return;
        for (const [id, objective] of Object.entries(objectives)) {
            this._assertValidObjective({ id, ...objective });
            lmsConnection.reportObjective({ id, ...objective });
        }
    }

    _reportSessionTime() {
        try {
            const sessionStartTime = lmsConnection.sessionStart;
            if (!sessionStartTime) {
                logger.warn('[StateManager] No session start time available, cannot report session_time');
                return;
            }
            const elapsedMs = Date.now() - sessionStartTime;
            const duration = formatISO8601Duration(elapsedMs);
            if (!ISO_8601_DURATION_PATTERN.test(duration)) {
                throw new Error(`Invalid ISO 8601 session duration generated: ${duration}`);
            }
            lmsConnection.reportSessionTime(duration);
            logger.debug(`[StateManager] Session time reported: ${duration} (${Math.round(elapsedMs / 1000)}s)`);
        } catch (error) {
            logger.warn('[StateManager] Failed to report session_time:', error.message);
        }
    }

    _assertValidScore(score) {
        if (!score || typeof score !== 'object') {
            throw new Error('StateManager: score must be an object');
        }

        const { raw, scaled, min, max } = score;
        if (raw !== undefined && (!Number.isFinite(raw) || raw < 0 || raw > 100)) {
            throw new Error(`StateManager: score.raw must be between 0 and 100, got ${raw}`);
        }
        if (scaled !== undefined && (!Number.isFinite(scaled) || scaled < 0 || scaled > 1)) {
            throw new Error(`StateManager: score.scaled must be between 0 and 1, got ${scaled}`);
        }
        if (min !== undefined && !Number.isFinite(min)) {
            throw new Error(`StateManager: score.min must be numeric, got ${min}`);
        }
        if (max !== undefined && !Number.isFinite(max)) {
            throw new Error(`StateManager: score.max must be numeric, got ${max}`);
        }
    }

    _assertValidCompletionStatus(status) {
        if (!VALID_COMPLETION_STATUSES.has(status)) {
            throw new Error(`StateManager: invalid completion status "${status}"`);
        }
    }

    _assertValidSuccessStatus(status) {
        if (!VALID_SUCCESS_STATUSES.has(status)) {
            throw new Error(`StateManager: invalid success status "${status}"`);
        }
    }

    _assertValidObjective(objective) {
        if (!objective || typeof objective.id !== 'string' || !objective.id.trim()) {
            throw new Error('StateManager: objective.id is required');
        }

        if (objective.score !== undefined && objective.score !== null) {
            if (!Number.isFinite(objective.score) || objective.score < 0 || objective.score > 100) {
                throw new Error(`StateManager: objective.score must be between 0 and 100, got ${objective.score}`);
            }
        }

        if (objective.progress_measure !== undefined && objective.progress_measure !== null) {
            if (!Number.isFinite(objective.progress_measure) || objective.progress_measure < 0 || objective.progress_measure > 1) {
                throw new Error(`StateManager: objective.progress_measure must be between 0 and 1, got ${objective.progress_measure}`);
            }
        }
    }
}

const instance = new StateManager();
export default instance;

// Exported for unit testing
export { formatISO8601Duration };
