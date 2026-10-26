/**
 * @file xapi-statement-service.js
 * @description Format-agnostic event listener that bridges manager events to driver xAPI methods.
 * 
 * This service subscribes to objective, interaction, and assessment events and routes them
 * to the active driver's xAPI statement methods (if available). SCORM drivers don't implement
 * these methods, so this is a no-op for SCORM formats.
 * 
 * This enables rich xAPI learning records for cmi5 without modifying SCORM behavior.
 *
 * Statements are non-blocking. Failed sends are kept in a small bounded
 * in-memory queue and retried after the next successful commit (with
 * backoff) and once more before termination.
 */

import { eventBus } from '../core/event-bus.js';
import { logger } from '../utilities/logger.js';

const RETRY_QUEUE_LIMIT = 50;
const MAX_SEND_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 2000;
const RETRY_MAX_DELAY_MS = 60000;

/** Scales a 0-100 score to 0-1; null/undefined/NaN mean "no score". */
function toScaledScore(score) {
    return typeof score === 'number' && Number.isFinite(score) ? score / 100 : undefined;
}

/** Correctness for xAPI result.success; undefined when it does not apply (likert, survey, neutral). */
function toSuccess(result) {
    if (result === 'correct') return true;
    if (result === 'incorrect' || result === 'wrong') return false;
    return undefined;
}

function createStatementId() {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : undefined;
}

/**
 * xAPI Statement Service
 * Bridges manager events to driver xAPI methods for cmi5 learning records.
 */
class XapiStatementService {
    constructor() {
        this._driver = null;
        this._isInitialized = false;
        this._subscriptions = [];

        // Slide time tracking
        this._currentSlideId = null;
        this._currentSlideTitle = null;
        this._slideEntryTime = null;

        // Failed statements awaiting retry: { method, payload, attempts, label }
        this._retryQueue = [];
        this._retryDelayMs = RETRY_BASE_DELAY_MS;
        this._nextRetryAt = 0;
        this._isRetrying = false;
    }

    /**
     * Initializes the service with the active driver.
     * Only subscribed events if the driver supports xAPI methods.
     * @param {Object} driver - The active LMS driver instance
     */
    initialize(driver) {
        if (this._isInitialized) {
            logger.warn('[XapiStatementService] Already initialized');
            return;
        }

        this._driver = driver;

        // Only subscribe if driver has xAPI methods (cmi5 only)
        if (!this._hasXapiSupport()) {
            logger.debug('[XapiStatementService] Driver does not support xAPI statements, service inactive');
            this._isInitialized = true;
            return;
        }

        logger.info('[XapiStatementService] Initializing xAPI statement bridge');
        this._subscribeToEvents();
        this._isInitialized = true;
    }

    /**
     * Checks if the driver supports xAPI statement methods.
     * @private
     */
    _hasXapiSupport() {
        return (
            this._driver &&
            typeof this._driver.sendObjectiveStatement === 'function' &&
            typeof this._driver.sendInteractionStatement === 'function' &&
            typeof this._driver.sendAssessmentStatement === 'function' &&
            typeof this._driver.sendSlideStatement === 'function'
        );
    }

    /**
     * Subscribes to manager events and routes to xAPI methods.
     * @private
     */
    _subscribeToEvents() {
        // Objective events
        this._subscriptions.push(
            eventBus.on('objective:updated', this._handleObjectiveUpdated.bind(this))
        );
        this._subscriptions.push(
            eventBus.on('objective:score:updated', this._handleObjectiveScoreUpdated.bind(this))
        );

        // Interaction events
        this._subscriptions.push(
            eventBus.on('interaction:recorded', this._handleInteractionRecorded.bind(this))
        );

        // Assessment events
        this._subscriptions.push(
            eventBus.on('assessment:submitted', this._handleAssessmentSubmitted.bind(this))
        );

        // Navigation events for slide tracking
        this._subscriptions.push(
            eventBus.on('navigation:changed', this._handleNavigationChanged.bind(this))
        );

        // Session termination - send pending slide statement before LRS connection closes
        this._subscriptions.push(
            eventBus.on('session:beforeTerminate', this._handleBeforeTerminate.bind(this))
        );

        // A successful commit means the LRS is reachable again: retry failures
        this._subscriptions.push(
            eventBus.on('state:commitSuccess', () => {
                if (Date.now() >= this._nextRetryAt) void this._flushRetryQueue();
            })
        );

        logger.debug('[XapiStatementService] Subscribed to manager events');
    }

    /**
     * Handles objective update events.
     * @private
     */
    async _handleObjectiveUpdated(objective) {
        if (!objective?.id) return;

        // Determine verb based on status changes
        let verb = 'progressed';
        if (objective.completion_status === 'completed') {
            verb = 'completed';
        }
        if (objective.success_status === 'passed') {
            verb = 'passed';
        } else if (objective.success_status === 'failed') {
            verb = 'failed';
        }

        await this._send('sendObjectiveStatement', {
            id: objective.id,
            verb: verb,
            name: objective.description || objective.id,
            score: toScaledScore(objective.score)
        }, 'objective statement');
    }

    /**
     * Handles objective score update events.
     * @private
     */
    async _handleObjectiveScoreUpdated({ id, objectiveId, score }) {
        const resolvedId = id || objectiveId;
        if (!resolvedId) return;

        await this._send('sendObjectiveStatement', {
            id: resolvedId,
            verb: 'progressed',
            score: toScaledScore(score)
        }, 'objective score statement');
    }

    /**
     * Handles interaction recorded events.
     * @private
     */
    async _handleInteractionRecorded(interaction) {
        if (!interaction?.id) return;

        await this._send('sendInteractionStatement', {
            id: interaction.id,
            type: interaction.type || 'other',
            response: interaction.learner_response || '',
            correct: toSuccess(interaction.result),
            description: interaction.description || undefined,
            duration: interaction.latency || undefined,
            objectiveId: interaction.objectives?.[0] || undefined
        }, 'interaction statement');
    }

    /**
     * Handles assessment submitted events.
     * @private
     */
    async _handleAssessmentSubmitted({ assessmentId, results }) {
        if (!assessmentId || !results) return;

        // Calculate ISO 8601 duration from timeSpent (MM:SS format)
        let duration;
        if (results.timeSpent) {
            const parts = results.timeSpent.split(':');
            if (parts.length === 3) {
                const hours = parseInt(parts[0], 10);
                const minutes = parseInt(parts[1], 10);
                const seconds = parseInt(parts[2], 10);
                if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
                    duration = `PT${hours}H${minutes}M${seconds}S`;
                }
            } else if (parts.length === 2) {
                const minutes = parseInt(parts[0], 10);
                const seconds = parseInt(parts[1], 10);
                if (!isNaN(minutes) && !isNaN(seconds)) {
                    duration = `PT${minutes}M${seconds}S`;
                }
            }
        }

        await this._send('sendAssessmentStatement', {
            id: assessmentId,
            score: toScaledScore(results.scorePercentage), // 0-1 scaled; undefined if not provided
            passed: results.passed,
            questionCount: results.totalQuestions,
            correctCount: results.correctCount,
            attemptNumber: results.attemptNumber,
            duration: duration
        }, 'assessment statement');
    }

    /**
     * Handles navigation change events for slide tracking.
     * Sends 'experienced' statement for the previous slide with duration.
     * @private
     */
    async _handleNavigationChanged({ fromSlideId, toSlideId, slideTitle }) {
        // Send statement for previous slide (if any)
        if (fromSlideId && this._slideEntryTime) {
            const duration = this._calculateDuration(this._slideEntryTime);

            await this._send('sendSlideStatement', {
                id: fromSlideId,
                title: this._currentSlideTitle || undefined,
                verb: 'experienced',
                duration: duration
            }, 'slide statement');
        }

        // Track entry time and title for new slide
        this._currentSlideId = toSlideId;
        this._currentSlideTitle = slideTitle || null;
        this._slideEntryTime = Date.now();
    }

    /**
     * Calculates ISO 8601 duration from a start timestamp.
     * @private
     */
    _calculateDuration(startTime) {
        const elapsedMs = Date.now() - startTime;
        const totalSeconds = Math.floor(elapsedMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `PT${hours}H${minutes}M${seconds}S`;
        } else if (minutes > 0) {
            return `PT${minutes}M${seconds}S`;
        } else {
            return `PT${seconds}S`;
        }
    }

    /**
     * Handles session termination by sending the final slide statement.
     * @private
     */
    async _handleBeforeTerminate() {
        await this._sendPendingSlideStatement();
        // Last chance before Terminated: no statements may follow it.
        await this._flushRetryQueue({ final: true });
    }

    /**
     * Sends an 'experienced' statement for the current slide if one is pending.
     * This captures time spent on the final slide before session ends.
     * @private
     */
    async _sendPendingSlideStatement() {
        if (!this._currentSlideId || !this._slideEntryTime || !this._driver) {
            return;
        }

        const duration = this._calculateDuration(this._slideEntryTime);
        const slideId = this._currentSlideId;

        const sent = await this._send('sendSlideStatement', {
            id: slideId,
            title: this._currentSlideTitle || undefined,
            verb: 'experienced',
            duration: duration
        }, 'final slide statement');
        if (sent) logger.debug(`[XapiStatementService] Sent final slide statement: ${slideId}`);

        // Clear tracking to prevent duplicate sends
        this._currentSlideId = null;
        this._currentSlideTitle = null;
        this._slideEntryTime = null;
    }

    /**
     * Sends a statement through the driver. A failure never throws: the
     * statement is queued for retry with its original id and timestamp.
     * @private
     * @returns {Promise<boolean>} True if sent now
     */
    async _send(method, payload, label) {
        const entry = {
            method,
            label,
            attempts: 0,
            payload: {
                ...payload,
                timestamp: payload.timestamp || new Date().toISOString(),
                statementId: payload.statementId || createStatementId()
            }
        };
        return this._attempt(entry);
    }

    /** @private */
    async _attempt(entry, { requeue = true } = {}) {
        entry.attempts++;
        try {
            await this._driver[entry.method](entry.payload);
            return true;
        } catch (error) {
            logger.error(`[XapiStatementService] Failed to send ${entry.label} (attempt ${entry.attempts}):`, error);
            if (requeue) this._requeue([entry]);
            return false;
        }
    }

    /**
     * Adds entries to the bounded retry queue (at the front when re-queuing
     * an interrupted retry batch, preserving order) and backs off.
     * @private
     */
    _requeue(entries, { front = false } = {}) {
        const retryable = entries.filter(entry => {
            if (entry.attempts < MAX_SEND_ATTEMPTS) return true;
            logger.error(`[XapiStatementService] Dropping ${entry.label} after ${entry.attempts} failed attempts`);
            return false;
        });
        this._retryQueue = front ? [...retryable, ...this._retryQueue] : [...this._retryQueue, ...retryable];
        while (this._retryQueue.length > RETRY_QUEUE_LIMIT) {
            const dropped = this._retryQueue.shift();
            logger.error(`[XapiStatementService] Retry queue full (${RETRY_QUEUE_LIMIT}); dropping oldest ${dropped.label}`);
        }
        this._nextRetryAt = Date.now() + this._retryDelayMs;
        this._retryDelayMs = Math.min(this._retryDelayMs * 2, RETRY_MAX_DELAY_MS);
    }

    /**
     * Retries queued statements in their original order. Stops at the first
     * failure (the LRS is likely still unreachable) unless this is the final
     * pre-termination flush, which tries each once and then gives up.
     * @private
     */
    async _flushRetryQueue({ final = false } = {}) {
        if (this._isRetrying || this._retryQueue.length === 0 || !this._driver) return;
        this._isRetrying = true;
        let undelivered = 0;
        try {
            const pending = this._retryQueue.splice(0);
            for (let i = 0; i < pending.length; i++) {
                const sent = await this._attempt(pending[i], { requeue: false });
                if (sent) continue;
                if (final) {
                    undelivered++;
                    continue;
                }
                this._requeue(pending.slice(i), { front: true });
                return;
            }
            this._retryDelayMs = RETRY_BASE_DELAY_MS;
            this._nextRetryAt = 0;
        } finally {
            this._isRetrying = false;
            if (final && undelivered > 0) {
                logger.error(`[XapiStatementService] ${undelivered} statement(s) could not be delivered before termination`);
            }
        }
    }

    /**
     * Cleans up event subscriptions.
     */
    destroy() {
        this._subscriptions.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
        this._subscriptions = [];
        this._driver = null;
        this._isInitialized = false;
        this._currentSlideId = null;
        this._currentSlideTitle = null;
        this._slideEntryTime = null;
        this._retryQueue = [];
        this._retryDelayMs = RETRY_BASE_DELAY_MS;
        this._nextRetryAt = 0;
    }
}

// Singleton instance
const xapiStatementService = new XapiStatementService();
export default xapiStatementService;
