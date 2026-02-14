/**
 * @file lms-connection.js
 * @description Manages LMS connection lifecycle using format-specific drivers.
 * Handles initialization, termination, keep-alive, and emergency save on unload.
 * Provides semantic passthrough to the active driver.
 *
 * INTERNAL: This is an internal module. External code should use stateManager
 * as the sole public API for state operations.
 */

import { logger } from '../utilities/logger.js';
import { eventBus } from '../core/event-bus.js';
import stateManager from './state-manager.js';
import { createDriver } from '../drivers/driver-factory.js';
import { classifyLmsError } from './lms-error-utils.js';

/**
 * Get the LMS format using runtime detection.
 * Priority: <meta name="lms-format"> → build-time env → 'cmi5' default.
 *
 * The meta tag is the primary mechanism — it's stamped into index.html at
 * build/packaging time so a single universal build can serve any format.
 * The cloud (or ZIP packaging) can re-stamp it without re-running Vite.
 */
function getLMSFormat() {
    // 1. Runtime: <meta name="lms-format"> in the HTML (stamped at build or by cloud)
    if (typeof document !== 'undefined') {
        const metaEl = document.querySelector('meta[name="lms-format"]');
        if (metaEl?.content) {
            return metaEl.content;
        }
    }

    // 2. Build-time: Vite define (still useful for preview server / dev builds)
    if (import.meta.env.LMS_FORMAT) {
        return import.meta.env.LMS_FORMAT;
    }

    // 3. Default
    return 'cmi5';
}

class LMSConnection {
    constructor() {
        // Create the appropriate driver based on format
        this.format = getLMSFormat();
        this.driver = null; // Lazy initialization via async _getDriver()

        // Keep-alive interval handle
        this.keepAliveInterval = null;

        // Session timing
        this.sessionStartTime = 0;

        // Compatibility profile (influences timeout behavior and guardrails)
        this.compatibilityMode = 'auto';

        // Operation diagnostics
        this.diagnostics = {
            profile: 'balanced',
            lastSuccessAt: null,
            operationCounts: {
                commitSuccess: 0,
                commitFailure: 0,
                terminateSuccess: 0,
                terminateFailure: 0
            }
        };
    }

    /**
     * Gets the driver instance, creating it lazily if needed.
     * Must be called after initialize() for non-SCORM2004 formats.
     * @returns {LMSDriver} The driver instance
     * @throws {Error} If driver not initialized
     */
    _getDriver() {
        if (!this.driver) {
            throw new Error('[LMSConnection] Driver not initialized. Call initialize() first.');
        }
        return this.driver;
    }

    // ============================================================================
    // Public API
    // ============================================================================

    /**
     * Gets the current LMS format.
     * @returns {string} 'scorm2004' | 'scorm1.2' | 'cmi5' | 'lti'
     */
    getFormat() {
        return this.format;
    }

    /**
     * Checks if connected to LMS.
     * @returns {boolean}
     */
    get isConnected() {
        return this.driver?.isConnected() ?? false;
    }

    /**
     * Checks if session is terminated.
     * @returns {boolean}
     */
    get isTerminated() {
        return this.driver?.isTerminated() ?? false;
    }

    /**
     * Gets session start time.
     * @returns {number} Timestamp
     */
    get sessionStart() {
        return this.sessionStartTime;
    }

    /**
     * Initializes the LMS connection.
     * @returns {Promise<boolean>} True if connected
     */
    async initialize() {
        this.sessionStartTime = Date.now();

        // Create driver asynchronously (allows dynamic import for cmi5/scorm12)
        this.driver = await createDriver(this.format);
        logger.debug(`[LMSConnection] Created ${this.format} driver`);

        const result = await this.driver.initialize();

        if (result) {
            this._startKeepAlive();
            logger.debug(`[LMSConnection] Initialized with ${this.format} driver`);
        }

        return result;
    }

    /**
     * Terminates the LMS connection.
     * @returns {Promise<boolean>} True if successful
     */
    async terminate() {
        this._stopKeepAlive();

        const driver = this._getDriver();
        const timeoutMs = this._getOperationTimeoutMs('terminate');
        try {
            const result = await this._withTimeout(driver.terminate(), timeoutMs, 'terminate');
            this._markOperationSuccess('terminate');
            return result;
        } catch (error) {
            this._markOperationFailure('terminate', error);
            throw error;
        }
    }

    /**
     * Gets driver capabilities.
     * @returns {Object} Capabilities declaration
     */
    getCapabilities() {
        return this._getDriver().getCapabilities();
    }

    // --- Semantic Reads (passthrough to driver) ---

    getEntryMode() {
        return this._getDriver().getEntryMode();
    }

    getBookmark() {
        return this._getDriver().getBookmark();
    }

    getCompletion() {
        return this._getDriver().getCompletion();
    }

    getSuccess() {
        return this._getDriver().getSuccess();
    }

    getScore() {
        return this._getDriver().getScore();
    }

    getLearnerInfo() {
        return this._getDriver().getLearnerInfo();
    }

    // --- Semantic Writes (passthrough to driver) ---

    setBookmark(location) {
        return this._getDriver().setBookmark(location);
    }

    reportScore(score) {
        return this._getDriver().reportScore(score);
    }

    reportCompletion(status) {
        return this._getDriver().reportCompletion(status);
    }

    reportSuccess(status) {
        return this._getDriver().reportSuccess(status);
    }

    reportProgress(measure) {
        return this._getDriver().reportProgress(measure);
    }

    reportSessionTime(duration) {
        return this._getDriver().reportSessionTime(duration);
    }

    reportObjective(objective) {
        return this._getDriver().reportObjective(objective);
    }

    reportInteraction(interaction) {
        return this._getDriver().reportInteraction(interaction);
    }

    setExitMode(mode) {
        return this._getDriver().setExitMode(mode);
    }

    // --- Data Persistence ---

    /**
     * Commits buffered writes to the LMS.
     * @returns {Promise<boolean>} True if successful
     */
    async commit() {
        const timeoutMs = this._getOperationTimeoutMs('commit');
        try {
            const result = await this._withTimeout(this._getDriver().commit(), timeoutMs, 'commit');
            this._markOperationSuccess('commit');
            return result;
        } catch (error) {
            this._markOperationFailure('commit', error);
            throw error;
        }
    }

    /**
     * Gets parsed suspend_data from the LMS.
     * @returns {object|null} Parsed suspend data
     */
    getSuspendData() {
        return this._getDriver().getSuspendData();
    }

    /**
     * Sets suspend_data in the LMS.
     * @param {object} data - The data to store
     * @returns {boolean} True if successful
     */
    setSuspendData(data) {
        return this._getDriver().setSuspendData(data);
    }

    /**
     * Gets cmi5 launch data (moveOn, masteryScore, etc.).
     * Only available for cmi5 format.
     * @returns {Object|null} Launch data or null if not available/not cmi5
     */
    getLaunchData() {
        const driver = this.driver;
        if (!driver || typeof driver.getLaunchData !== 'function') {
            return null;
        }
        return driver.getLaunchData();
    }

    /**
     * Gets the underlying driver instance.
     * Used by xAPI statement service to access driver-specific methods.
     * @returns {LMSDriver|null} The driver instance or null if not initialized
     */
    getDriver() {
        return this.driver;
    }

    /**
     * Sets compatibility mode to tune reliability behavior by LMS profile.
     * Must be called before initialize() for deterministic startup behavior.
     * @param {'auto'|'balanced'|'strict-scorm12'|'conservative-scorm2004'|'modern-http'} mode
     */
    setCompatibilityMode(mode = 'auto') {
        const validModes = new Set([
            'auto',
            'balanced',
            'strict-scorm12',
            'conservative-scorm2004',
            'modern-http'
        ]);

        if (!validModes.has(mode)) {
            throw new Error(`[LMSConnection] Invalid compatibility mode "${mode}". Expected one of: ${Array.from(validModes).join(', ')}`);
        }

        this.compatibilityMode = mode;
    }

    getCompatibilityMode() {
        return this.compatibilityMode;
    }

    getDiagnostics() {
        return { ...this.diagnostics, operationCounts: { ...this.diagnostics.operationCounts } };
    }

    // ============================================================================
    // Lifecycle Handlers
    // ============================================================================

    /**
     * Sets up lifecycle handlers for page unload/hide events.
     */
    setupLifecycleHandlers() {
        // Layer 4: Auto-Terminate on Unload (Emergency Save)
        window.addEventListener('pagehide', () => {
            if (this.isTerminated) return;

            // Startup Guard: Ignore pagehide events < 2s after startup
            if (Date.now() - this.sessionStartTime < 2000) {
                logger.debug('[LMSConnection] Page unload detected immediately after startup (< 2s). Ignoring.');
                return;
            }

            logger.debug('[LMSConnection] Page unload detected. Attempting emergency save...');

            // Use emergencySave() for any driver that supports it (sendBeacon guaranteed delivery)
            if (this.driver?.emergencySave) {
                try {
                    this.driver.emergencySave();
                    logger.debug('[LMSConnection] Emergency save completed via sendBeacon');
                } catch (e) {
                    logger.debug('[LMSConnection] Emergency save failed:', e.message);
                }
                return;
            }

            // For SCORM formats, use synchronous exitCourseWithSuspend
            try {
                // Delegate to StateManager to save exit status
                const exitPromise = stateManager.exitCourseWithSuspend();
                if (exitPromise && typeof exitPromise.catch === 'function') {
                    exitPromise.catch(e => {
                        logger.debug('[LMSConnection] Best-effort save during unload did not complete:', e.message);
                    });
                }
            } catch (e) {
                logger.debug('[LMSConnection] Best-effort save during unload did not complete:', e.message);
            }
        });
    }

    // ============================================================================
    // Private Helpers
    // ============================================================================

    _startKeepAlive() {
        this._stopKeepAlive();

        // Only SCORM formats need keep-alive (cmi5/LTI use stateless HTTP)
        if (this.format.startsWith('cmi5') || this.format === 'lti') {
            return;
        }

        const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000; // 10 minutes

        this.keepAliveInterval = setInterval(() => {
            if (!this.isConnected || this.isTerminated) {
                this._stopKeepAlive();
                return;
            }
            // Delegate to driver's ping method
            this.driver?.ping?.();
        }, KEEP_ALIVE_INTERVAL);

        logger.debug('[LMSConnection] Keep-alive mechanism started (10m interval)');
    }

    _stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    _resolveCompatibilityProfile() {
        if (this.compatibilityMode !== 'auto') {
            return this.compatibilityMode;
        }

        if (this.format === 'scorm1.2') return 'strict-scorm12';
        if (this.format === 'scorm2004') return 'conservative-scorm2004';
        if (this.format.startsWith('cmi5') || this.format === 'lti') return 'modern-http';
        return 'balanced';
    }

    _getOperationTimeoutMs(operation) {
        const profile = this._resolveCompatibilityProfile();
        this.diagnostics.profile = profile;

        const timeoutMatrix = {
            balanced: { commit: 8000, terminate: 10000 },
            'strict-scorm12': { commit: 5000, terminate: 7000 },
            'conservative-scorm2004': { commit: 7000, terminate: 9000 },
            'modern-http': { commit: 12000, terminate: 15000 }
        };

        const profileTimeouts = timeoutMatrix[profile] || timeoutMatrix.balanced;
        return profileTimeouts[operation] || 8000;
    }

    async _withTimeout(promise, timeoutMs, operation) {
        let timeoutHandle;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new Error(`[LMSConnection] ${operation} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        });

        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            clearTimeout(timeoutHandle);
        }
    }

    _markOperationSuccess(operation) {
        this.diagnostics.lastSuccessAt = new Date().toISOString();
        if (operation === 'commit') {
            this.diagnostics.operationCounts.commitSuccess++;
        } else if (operation === 'terminate') {
            this.diagnostics.operationCounts.terminateSuccess++;
        }
    }

    _markOperationFailure(operation, error) {
        const classification = classifyLmsError(error);
        const message = error?.message || String(error);
        const context = {
            domain: 'lms',
            operation,
            classification,
            format: this.format,
            profile: this.diagnostics.profile,
            stack: error?.stack
        };

        if (operation === 'commit') {
            this.diagnostics.operationCounts.commitFailure++;
        } else if (operation === 'terminate') {
            this.diagnostics.operationCounts.terminateFailure++;
        }

        logger.error(`[LMSConnection] ${operation} failed`, {
            ...context,
            message
        });

        eventBus.emit('lms:operationFailed', {
            operation,
            classification,
            message,
            format: context.format,
            profile: context.profile
        });
    }
}

const lmsConnection = new LMSConnection();
export default lmsConnection;
export { LMSConnection };
