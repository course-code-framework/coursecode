/**
 * @file xapi-statement-service.js
 * @description Format-agnostic event listener that bridges manager events to driver xAPI methods.
 * 
 * This service subscribes to objective, interaction, and assessment events and routes them
 * to the active driver's xAPI statement methods (if available). SCORM drivers don't implement
 * these methods, so this is a no-op for SCORM formats.
 * 
 * This enables rich xAPI learning records for cmi5 without modifying SCORM behavior.
 */

import { eventBus } from '../core/event-bus.js';
import { logger } from '../utilities/logger.js';

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

        try {
            await this._driver.sendObjectiveStatement({
                id: objective.id,
                verb: verb,
                name: objective.description || objective.id,
                score: objective.score !== undefined ? objective.score / 100 : undefined
            });
        } catch (error) {
            logger.error('[XapiStatementService] Failed to send objective statement:', error);
            // Don't throw - xAPI statements are non-blocking
        }
    }

    /**
     * Handles objective score update events.
     * @private
     */
    async _handleObjectiveScoreUpdated({ id, objectiveId, score }) {
        const resolvedId = id || objectiveId;
        if (!resolvedId) return;

        try {
            await this._driver.sendObjectiveStatement({
                id: resolvedId,
                verb: 'progressed',
                score: typeof score === 'number' && !isNaN(score) ? score / 100 : undefined
            });
        } catch (error) {
            logger.error('[XapiStatementService] Failed to send objective score statement:', error);
        }
    }

    /**
     * Handles interaction recorded events.
     * @private
     */
    async _handleInteractionRecorded(interaction) {
        if (!interaction?.id) return;

        try {
            await this._driver.sendInteractionStatement({
                id: interaction.id,
                type: interaction.type || 'other',
                response: interaction.learner_response || '',
                correct: interaction.result === 'correct',
                description: interaction.description || undefined,
                duration: interaction.latency || undefined,
                objectiveId: interaction.objectives?.[0] || undefined
            });
        } catch (error) {
            logger.error('[XapiStatementService] Failed to send interaction statement:', error);
        }
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

        try {
            const score = typeof results.scorePercentage === 'number' ? results.scorePercentage / 100 : undefined;
            await this._driver.sendAssessmentStatement({
                id: assessmentId,
                score, // Convert to 0-1 scaled; undefined if not provided
                passed: results.passed,
                questionCount: results.totalQuestions,
                correctCount: results.correctCount,
                attemptNumber: results.attemptNumber,
                duration: duration
            });
        } catch (error) {
            logger.error('[XapiStatementService] Failed to send assessment statement:', error);
        }
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

            try {
                await this._driver.sendSlideStatement({
                    id: fromSlideId,
                    title: this._currentSlideTitle || undefined,
                    verb: 'experienced',
                    duration: duration
                });
            } catch (error) {
                logger.error('[XapiStatementService] Failed to send slide statement:', error);
            }
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

        try {
            await this._driver.sendSlideStatement({
                id: this._currentSlideId,
                title: this._currentSlideTitle || undefined,
                verb: 'experienced',
                duration: duration
            });
            logger.debug(`[XapiStatementService] Sent final slide statement: ${this._currentSlideId}`);
        } catch (error) {
            logger.error('[XapiStatementService] Failed to send final slide statement:', error);
        }

        // Clear tracking to prevent duplicate sends
        this._currentSlideId = null;
        this._currentSlideTitle = null;
        this._slideEntryTime = null;
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
    }
}

// Singleton instance
const xapiStatementService = new XapiStatementService();
export default xapiStatementService;
