/**
 * @file engagement-manager.js
 * @description Tracks user engagement with slide content to gate navigation.
 * 
 * Stateless manager — all state is stored in StateManager's 'engagement' domain.
 * Pure progress/formatting functions are in engagement-progress.js.
 * Requirement evaluation strategies are in requirement-strategies.js.
 * Component registration and tracking methods are in engagement-trackers.js.
 * 
 * @version 2.2.0
 */

import { eventBus } from '../core/event-bus.js';
import { logger } from '../utilities/logger.js';
import stateManager from '../state/index.js';
import * as NavigationState from '../navigation/NavigationState.js';
import strategies, { validTypes, getTrackedFieldDefaults } from './requirement-strategies.js';
import {
    calculateProgress,
    formatTimeHuman,
    formatInteractionId,
    mergeWithDefaults,
    stripDefaultValues
} from './engagement-progress.js';
import * as trackers from './engagement-trackers.js';

class EngagementManager {
    constructor() {
        this.domain = 'engagement';
        this.isInitialized = false;
        this.courseConfig = null;
        this._timeTrackingIntervals = new Map();
    }

    /**
     * Subscribes to events needed for dynamic tracking.
     * @param {object} courseConfig - The course configuration object
     */
    initialize(courseConfig) {
        if (this.isInitialized) return;

        if (!courseConfig || !courseConfig.structure) {
            throw new Error('[EngagementManager] courseConfig with structure is REQUIRED');
        }

        this.courseConfig = courseConfig;

        eventBus.on('flag:updated', this._handleFlagUpdate.bind(this));
        eventBus.on('flag:removed', this._handleFlagUpdate.bind(this));

        eventBus.on('interaction:recorded', (interaction) => {
            const currentSlideId = NavigationState.getCurrentSlideId();
            if (currentSlideId) {
                const isCorrect = interaction.result === 'correct';
                this.trackInteraction(currentSlideId, interaction.id, true, isCorrect);
            }
        });

        this.isInitialized = true;
        logger.debug('[EngagementManager] Initialized (refactored v2.2)');
    }

    // =========================================================================
    // Slide Lifecycle
    // =========================================================================

    /**
     * Gets engagement requirements for a slide from course config.
     * @private
     */
    _getRequirementsFromConfig(slideId) {
        if (!this.courseConfig || !this.courseConfig.structure) {
            throw new Error(`[EngagementManager] CRITICAL: courseConfig not available when looking up slide: ${slideId}`);
        }

        const findSlide = (items) => {
            for (const item of items) {
                if (item.id === slideId) return item;
                if (item.children) {
                    const found = findSlide(item.children);
                    if (found) return found;
                }
            }
            return null;
        };

        const slide = findSlide(this.courseConfig.structure);
        if (!slide) {
            throw new Error(`[EngagementManager] CRITICAL: Slide "${slideId}" not found in courseConfig.structure`);
        }

        if (!slide.engagement) {
            throw new Error(`[EngagementManager] CRITICAL: Slide "${slideId}" has no engagement config in courseConfig`);
        }

        return slide.engagement;
    }

    /**
     * Initializes engagement tracking for a slide.
     * Preserves existing completion state if slide was already completed.
     */
    initSlide(slideId, requirements) {
        if (!slideId || typeof slideId !== 'string') {
            throw new Error('[EngagementManager] slideId must be a non-empty string');
        }

        if (!requirements || typeof requirements !== 'object') {
            throw new Error(`[EngagementManager] Slide "${slideId}" has invalid engagement requirements`);
        }

        const isRequired = requirements.required || false;

        if (!isRequired) {
            logger.debug(`[EngagementManager] Slide "${slideId}" does not require tracking, skipping state initialization`);
            eventBus.emit('engagement:initialized', { slideId, requirements });
            return;
        }

        const state = this._getState();
        const existingState = state[slideId];
        const wasCompleted = existingState?.complete === true;

        if (wasCompleted) {
            state[slideId].required = true;
            logger.debug(`[EngagementManager] Slide "${slideId}" was already completed`);
        } else if (existingState) {
            state[slideId].required = true;
            logger.debug(`[EngagementManager] Slide "${slideId}" has existing progress, preserving tracked data`);
        } else {
            state[slideId] = {
                required: true,
                tracked: getTrackedFieldDefaults(),
                complete: false
            };
            logger.debug(`[EngagementManager] Initialized tracking for: ${slideId}`);
        }

        this._setState(state);
        this._startTimeTrackingIfNeeded(slideId, requirements);
        eventBus.emit('engagement:initialized', { slideId, requirements });
    }

    /**
     * Cleans up engagement tracking when leaving a slide.
     */
    cleanupSlide(slideId) {
        if (!slideId) return;

        this._stopTimeTracking(slideId);

        const evaluation = this.evaluateRequirements(slideId);

        if (!evaluation.complete) {
            eventBus.emit('engagement:incomplete', {
                slideId,
                unmetRequirements: evaluation.unmetRequirements
            });
        }

        logger.debug(`[EngagementManager] Cleaned up: ${slideId}`, evaluation);
    }

    // =========================================================================
    // Time Tracking
    // =========================================================================

    /** @private */
    _startTimeTrackingIfNeeded(slideId, requirements) {
        this._stopTimeTracking(slideId);

        if (!requirements.required) return;

        const hasTimeRequirement = requirements.requirements?.some(
            req => req.type === 'timeOnSlide'
        );

        if (!hasTimeRequirement) return;

        const state = this._getState();
        if (state[slideId]?.complete) {
            logger.debug(`[EngagementManager] Slide "${slideId}" already complete, skipping time tracking`);
            return;
        }

        logger.debug(`[EngagementManager] Starting time tracking for: ${slideId}`);

        const intervalId = setInterval(() => {
            const evaluation = this.evaluateRequirements(slideId);
            if (!evaluation.complete) {
                eventBus.emit('engagement:progress', {
                    slideId,
                    complete: false,
                    progress: evaluation.progress
                });
            } else {
                this._stopTimeTracking(slideId);
            }
        }, 100);

        this._timeTrackingIntervals.set(slideId, intervalId);
    }

    /** @private */
    _stopTimeTracking(slideId) {
        const intervalId = this._timeTrackingIntervals.get(slideId);
        if (intervalId) {
            clearInterval(intervalId);
            this._timeTrackingIntervals.delete(slideId);
            logger.debug(`[EngagementManager] Stopped time tracking for: ${slideId}`);
        }
    }

    // =========================================================================
    // Queries
    // =========================================================================

    isSlideComplete(slideId) {
        return this.evaluateRequirements(slideId).complete;
    }

    getSlideState(slideId) {
        const state = this._getState();
        return state[slideId] || null;
    }

    getProgress(slideId) {
        const slideState = this.getSlideState(slideId);
        if (!slideState) return null;
        const requirementsConfig = this._getRequirementsFromConfig(slideId);
        const requirements = requirementsConfig?.requirements || [];
        return calculateProgress(slideId, slideState.tracked, requirements, strategies, this._buildContext(slideId));
    }

    // =========================================================================
    // Evaluation
    // =========================================================================

    evaluateRequirements(slideId) {
        const state = this._getState();
        const slideState = state[slideId];

        if (!slideState) {
            try {
                const requirementsConfig = this._getRequirementsFromConfig(slideId);
                const isRequired = requirementsConfig?.required || false;
                return { complete: !isRequired, progress: {}, unmetRequirements: [] };
            } catch (_error) {
                return { complete: true, progress: {}, unmetRequirements: [] };
            }
        }

        const isRequired = slideState.required || false;
        if (!isRequired) {
            return { complete: true, progress: {}, unmetRequirements: [] };
        }

        const requirementsConfig = this._getRequirementsFromConfig(slideId);
        const requirements = requirementsConfig.requirements || [];
        const mode = requirementsConfig.mode || 'all';

        const unmetRequirements = [];

        for (const req of requirements) {
            try {
                const result = this._evaluateRequirement(slideId, req, slideState.tracked);
                if (!result.met) {
                    unmetRequirements.push(result);
                }
            } catch (error) {
                logger.error(`[EngagementManager] Error evaluating requirement for slide "${slideId}": ${error.message}`, { requirement: req });
                // Fail safe: treat as unmet requirement to prevent skipping
                unmetRequirements.push({
                    met: false,
                    requirement: req,
                    progress: 0,
                    reason: `Evaluation Error: ${error.message}`
                });
            }
        }

        const complete = mode === 'all'
            ? unmetRequirements.length === 0
            : unmetRequirements.length < requirements.length;

        if (complete && !slideState.complete) {
            slideState.complete = true;
            this._setState(state);
            eventBus.emit('engagement:complete', { slideId });
        }

        let progress = {};
        try {
            progress = calculateProgress(slideId, slideState.tracked, requirements, strategies, this._buildContext(slideId));
        } catch (error) {
            logger.error(`[EngagementManager] Error calculating progress for slide "${slideId}": ${error.message}`);
        }

        return {
            complete,
            progress,
            unmetRequirements
        };
    }

    /** @private */
    _evaluateRequirement(slideId, requirement, tracked) {
        const strategy = strategies[requirement.type];
        if (!strategy) {
            throw new Error(`[EngagementManager] Unknown requirement type: ${requirement.type}. Valid types: ${validTypes.join(', ')}.`);
        }
        return strategy.evaluate(requirement, tracked, this._buildContext(slideId));
    }

    /** @private */
    _buildContext(slideId) {
        return {
            slideId,
            stateManager,
            interactionRegistry: window.CourseCode?.interactionRegistry,
            formatTime: formatTimeHuman,
            formatInteractionId: formatInteractionId
        };
    }

    // =========================================================================
    // Reset
    // =========================================================================

    resetSlide(slideId) {
        const state = this._getState();
        if (!state[slideId]) return;
        const requirements = this._getRequirementsFromConfig(slideId);
        if (!requirements) {
            throw new Error(`[EngagementManager] No requirements found for slide: ${slideId}. Ensure slide has engagement config in course-config.js.`);
        }
        delete state[slideId];
        this._setState(state);
        this.initSlide(slideId, requirements);
        logger.debug(`[EngagementManager] Reset: ${slideId}`);
    }

    resetAllSlides() {
        this._setState({});
        logger.debug('[EngagementManager] Reset all engagement');
        eventBus.emit('engagement:reset-all');
    }

    // =========================================================================
    // Internal
    // =========================================================================

    /** @private */
    _handleFlagUpdate({ key, value: _value }) {
        const state = this._getState();

        Object.entries(state).forEach(([slideId, slideState]) => {
            const requirementsConfig = this._getRequirementsFromConfig(slideId);
            if (!requirementsConfig || !requirementsConfig.required) return;
            if (slideState.complete) return;

            const hasFlagRequirements = requirementsConfig.requirements?.some(
                req => req.type === 'flag' || req.type === 'allFlags'
            );

            if (hasFlagRequirements) {
                logger.debug(`[EngagementManager] Flag "${key}" updated, re-evaluating: ${slideId}`);
                this._checkAndEmitProgress(slideId);
            }
        });
    }

    /** @private */
    _checkAndEmitProgress(slideId) {
        const evaluation = this.evaluateRequirements(slideId);
        eventBus.emit('engagement:progress', {
            slideId,
            complete: evaluation.complete,
            progress: evaluation.progress
        });
    }

    /** @private */
    _getState() {
        const rawState = stateManager.getDomainState(this.domain) || {};
        return mergeWithDefaults(rawState);
    }

    /** @private */
    _setState(state) {
        try {
            const optimizedState = stripDefaultValues(state);
            stateManager.setDomainState(this.domain, optimizedState);
        } catch (error) {
            logger.error('[EngagementManager] Failed to save state:', { domain: 'engagement', operation: '_setState', stack: error.stack, slideIds: Object.keys(state) });
            throw error;
        }
    }
}

// Mix in tracker methods from engagement-trackers.js
Object.assign(EngagementManager.prototype, trackers);

export default new EngagementManager();
