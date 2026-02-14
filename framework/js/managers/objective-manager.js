/**
 * @file objective-manager.js
 * @description Manages learning objectives. It is the single source of truth for
 * all objective-related data and persists its state through the StateManager.
 */

import { deepClone } from '../utilities/utilities.js';
import { logger } from '../utilities/logger.js';
import stateManager from '../state/index.js';
import { eventBus } from '../core/event-bus.js';

class ObjectiveManager {
    constructor() {
        this.objectives = {};
        this.isInitialized = false;
        this.earlyQueue = []; // Queue for calls made before initialization
        this.DOMAIN_KEY = 'objectives';
        this.SOURCE = 'objective-manager';
        this.criteriaConfig = []; // Store objectives with criteria
    }

    /**
     * Initializes the manager by loading state from the StateManager and setting up objectives from config.
     * @param {Array<object>} [objectivesConfig] - Optional array of objective configurations from course-config.js
     * @throws {Error} If already initialized
     */
    initialize(objectivesConfig = []) {
        if (this.isInitialized) {
            throw new Error('ObjectiveManager: Already initialized. Do not call initialize() more than once.');
        }

        // Build set of configured objective IDs for validation
        const configuredIds = new Set(objectivesConfig.map(obj => obj.id));

        // Load from stateManager domain (transparently routed to CMI by stateManager)
        const storedObjectives = stateManager.getDomainState(this.DOMAIN_KEY);
        if (storedObjectives && typeof storedObjectives === 'object') {
            // Validate stored objectives against current config
            const storedIds = Object.keys(storedObjectives);
            const orphanedIds = storedIds.filter(id => !configuredIds.has(id));
            
            if (orphanedIds.length > 0 && objectivesConfig.length > 0) {
                // Found objectives in storage that aren't in current config
                const message = `Found ${orphanedIds.length} stored objective(s) not in current config: ${orphanedIds.join(', ')}. ` +
                    'These may be from a previous version of the course.';
                
                if (import.meta.env.DEV) {
                    // Dev mode: Warn about orphaned objectives (could indicate config issue)
                    logger.warn(`[ObjectiveManager] ${message}`);
                }
                // In both modes, we keep orphaned objectives in CMI (can't remove from LMS)
                // but they won't affect course logic since they're not in config
            }
            
            this.objectives = storedObjectives;
        }

        // Mark the manager initialized before seeding new objectives so SCORM syncs work immediately
        this.isInitialized = true;

        // Initialize objectives from config if provided (only if they don't exist)
        if (objectivesConfig.length > 0) {
            objectivesConfig.forEach(objective => {
                if (!this.objectives[objective.id]) {
                    // OPTIMIZATION: Do NOT store description - it's in course-config.js
                    this.setObjective({
                        id: objective.id,
                        completion_status: objective.initialCompletion ?? 'incomplete',
                        success_status: objective.initialSuccess ?? 'unknown',
                        score: objective.initialScore ?? null
                    });
                }
            });
            logger.debug(`[ObjectiveManager] Initialized ${objectivesConfig.length} objective(s) from configuration.`);

            // Enable automatic criteria tracking
            this.enableCriteriaTracking(objectivesConfig);
        }
        logger.debug('[ObjectiveManager] Initialized with objectives:', this.objectives);

        // Process any calls that were queued before initialization was complete
        this._processEarlyQueue();
    }

    /**
     * Processes and executes method calls that were queued before the manager was initialized.
     * @private
     */
    _processEarlyQueue() {
        if (this.earlyQueue.length > 0) {
            logger.debug(`[ObjectiveManager] Processing ${this.earlyQueue.length} early-queued call(s).`);
            this.earlyQueue.forEach(({ method, args }) => {
                if (typeof this[method] === 'function') {
                    this[method](...args);
                }
            });
            this.earlyQueue = []; // Clear the queue
        }
    }

    /**
     * Retrieves all objectives.
     * @returns {Array<object>} A deep-cloned array of all objective objects.
     */
    getObjectives() {
        return deepClone(Object.values(this.objectives));
    }

    /**
     * Retrieves a single objective by its ID.
     * @param {string} id - The unique identifier for the objective.
     * @returns {object|null} A deep-cloned objective object or null if not found.
     */
    getObjective(id) {
        if (!id || !this.objectives[id]) {
            return null;
        }
        return deepClone(this.objectives[id]);
    }

    /**
     * Creates or updates an objective.
     * @param {object} objectiveData - The data for the objective.
     * @param {string} objectiveData.id - The unique identifier for the objective.
     * @param {string} [objectiveData.success_status] - The success status ('passed', 'failed', 'unknown').
     * @param {string} [objectiveData.completion_status] - The completion status ('completed', 'incomplete').
     * @param {number} [objectiveData.score] - The score (0-100).
     * @param {string} [objectiveData.description] - A description of the objective.
     * @returns {object|undefined} The updated objective object, or undefined if queued before initialization.
     * @throws {Error} If objectiveData is missing or id is not provided
     */
    setObjective(objectiveData) {
        if (!this.isInitialized) {
            this.earlyQueue.push({ method: 'setObjective', args: [objectiveData] });
            return;
        }

        const { id } = objectiveData;
        if (!id) {
            throw new Error('ObjectiveManager: setObjective requires an id.');
        }

        if (objectiveData.score !== undefined && objectiveData.score !== null) {
            const score = objectiveData.score;
            if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
                throw new Error(`ObjectiveManager: Score must be a number between 0 and 100, got ${score}`);
            }
        }

        const existing = this.objectives[id] || { id };
        const updated = { ...existing, ...objectiveData };

        this.objectives[id] = updated;

        // Persist via stateManager domain (transparently routed to CMI by stateManager)
        stateManager.setDomainState(this.DOMAIN_KEY, this.objectives, { source: this.SOURCE });

        eventBus.emit('objective:updated', updated);

        // Emit specific score event if score was updated (for ScoreManager)
        if (typeof updated.score === 'number' && Number.isFinite(updated.score)) {
            eventBus.emit('objective:score:updated', {
                objectiveId: id,
                score: updated.score
            });
        }

        return deepClone(updated);
    }

    /**
     * Valid success status values per SCORM spec.
     * @private
     */
    static VALID_SUCCESS_STATUSES = ['passed', 'failed', 'unknown'];

    /**
     * Valid completion status values per SCORM spec.
     * @private
     */
    static VALID_COMPLETION_STATUSES = ['completed', 'incomplete'];

    /**
     * A helper method to specifically update the success status of an objective.
     * @param {string} id - The objective ID.
     * @param {string} success_status - The success status ('passed', 'failed', 'unknown').
     * @param {number|null} [score] - An optional score to set along with the status.
     * @throws {Error} If objective with given ID is not found
     * @throws {Error} If success_status is not a valid value
     */
    setSuccessStatus(id, success_status, score = null) {
        if (!this.isInitialized) {
            this.earlyQueue.push({ method: 'setSuccessStatus', args: [id, success_status, score] });
            return;
        }
        if (!ObjectiveManager.VALID_SUCCESS_STATUSES.includes(success_status)) {
            throw new Error(`ObjectiveManager: Invalid success_status "${success_status}". Must be one of: ${ObjectiveManager.VALID_SUCCESS_STATUSES.join(', ')}`);
        }
        const objective = this.getObjective(id);
        if (!objective) {
            throw new Error(`ObjectiveManager: Objective with id "${id}" not found.`);
        }
        objective.success_status = success_status;
        this.setObjective(objective);
        if (score !== null) {
            // Validate score through setScore's guard (which will persist separately)
            this.setScore(id, score);
        }
    }

    /**
     * A helper method to specifically update the completion status of an objective.
     * @param {string} id - The objective ID.
     * @param {string} completion_status - The completion status ('completed', 'incomplete').
     * @throws {Error} If objective with given ID is not found
     * @throws {Error} If completion_status is not a valid value
     */
    setCompletionStatus(id, completion_status) {
        if (!this.isInitialized) {
            this.earlyQueue.push({ method: 'setCompletionStatus', args: [id, completion_status] });
            return;
        }
        if (!ObjectiveManager.VALID_COMPLETION_STATUSES.includes(completion_status)) {
            throw new Error(`ObjectiveManager: Invalid completion_status "${completion_status}". Must be one of: ${ObjectiveManager.VALID_COMPLETION_STATUSES.join(', ')}`);
        }
        const objective = this.getObjective(id);
        if (!objective) {
            throw new Error(`ObjectiveManager: Objective with id "${id}" not found.`);
        }
        objective.completion_status = completion_status;
        this.setObjective(objective);
    }

    /**
     * A helper method to specifically update the score of an objective.
     * @param {string} id - The objective ID.
     * @param {number} score - The score (0-100).
     * @throws {Error} If objective with given ID is not found
     * @throws {Error} If score is not a number or out of range
     */
    setScore(id, score) {
        if (!this.isInitialized) {
            this.earlyQueue.push({ method: 'setScore', args: [id, score] });
            return;
        }
        const objective = this.getObjective(id);
        if (!objective) {
            throw new Error(`ObjectiveManager: Objective with id "${id}" not found.`);
        }
        if (typeof score !== 'number' || isNaN(score) || score < 0 || score > 100) {
            throw new Error(`ObjectiveManager: Score must be a number between 0 and 100, got ${score}`);
        }
        objective.score = score;
        this.setObjective(objective);
    }

    /**
     * Enables automatic criteria tracking for objectives with built-in criteria.
     * @param {Array<object>} objectivesConfig - Array of objective configurations from course-config.js
     */
    enableCriteriaTracking(objectivesConfig = []) {
        this.criteriaConfig = objectivesConfig.filter(obj => obj.criteria);

        if (this.criteriaConfig.length === 0) {
            logger.debug('[ObjectiveManager] No objectives with built-in criteria found.');
            return;
        }

        // Guard against duplicate listener registration
        if (this._criteriaTrackingEnabled) {
            logger.debug('[ObjectiveManager] Criteria tracking already enabled, updating config only.');
            return;
        }
        this._criteriaTrackingEnabled = true;

        // Listen for view changes to track slide visits
        eventBus.on('view:change', ({ view }) => {
            this._handleSlideVisit(view);
            this._checkTimeBasedObjectives(view);
        });

        // Re-evaluate time-based objectives for the slide just left.
        // Slide durations are finalized on navigation:beforeChange, so fromSlideId
        // is the reliable key to check after navigation completes.
        eventBus.on('navigation:changed', ({ fromSlideId }) => {
            if (fromSlideId) {
                this._checkTimeBasedObjectives(fromSlideId);
            }
        });

        // Listen for flag changes to track flag-based objectives
        eventBus.on('flag:updated', ({ key, value }) => {
            this._checkFlagBasedObjectives(key, value);
        });

        // Also listen for flag removals — a removed flag is effectively undefined/falsy
        eventBus.on('flag:removed', ({ key }) => {
            this._checkFlagBasedObjectives(key, undefined);
        });

        logger.debug(`[ObjectiveManager] Criteria tracking enabled for ${this.criteriaConfig.length} objective(s).`);
    }

    /**
     * Handles slide visit event and checks objectives with visit-based criteria.
     * @private
     * @param {string} slideId - The ID of the visited slide
     */
    _handleSlideVisit(slideId) {
        // Get visited slides from state manager
        const navigationState = stateManager.getDomainState('navigation');
        const visitedSlides = navigationState?.visitedSlides || [];

        // Create a new set of visited slides including the current one for this check
        const allVisitedSlides = new Set([...visitedSlides, slideId]);

        this.criteriaConfig.forEach(objective => {
            // Skip if already completed
            const current = this.objectives[objective.id];
            if (current && current.completion_status === 'completed') {
                return;
            }

            const { criteria } = objective;

            switch (criteria.type) {
                case 'slideVisited': {
                    if (criteria.slideId === slideId) {
                        this.setCompletionStatus(objective.id, 'completed');
                        logger.debug(`[ObjectiveManager] Objective "${objective.id}" completed: slideVisited`);
                    }
                    break;
                }

                case 'allSlidesVisited': {
                    const requiredSlides = criteria.slideIds || [];
                    if (!Array.isArray(requiredSlides) || requiredSlides.length === 0) {
                        logger.warn(`[ObjectiveManager] Objective "${objective.id}" has invalid allSlidesVisited criteria: slideIds must be a non-empty array.`);
                        break;
                    }
                    const allVisited = requiredSlides.every(sid => allVisitedSlides.has(sid));
                    if (allVisited) {
                        this.setCompletionStatus(objective.id, 'completed');
                        logger.debug(`[ObjectiveManager] Objective "${objective.id}" completed: allSlidesVisited`);
                    }
                    break;
                }
            }
        });
    }

    /**
     * Checks if any time-based objectives are met for a given slide.
     * Uses centralized timing data from AppActions (stored in sessionData domain).
     * @private
     * @param {string} slideId - The ID of the slide
     */
    _checkTimeBasedObjectives(slideId) {
        // Get slide durations from centralized session data
        const sessionData = stateManager.getDomainState('sessionData');
        const slideDurations = sessionData?.slideDurations || {};

        this.criteriaConfig.forEach(objective => {
            // Skip if already completed
            const current = this.objectives[objective.id];
            if (current && current.completion_status === 'completed') {
                return;
            }

            const { criteria } = objective;

            if (criteria.type === 'timeOnSlide' && criteria.slideId === slideId) {
                const totalMilliseconds = slideDurations[slideId] || 0;
                const totalSeconds = totalMilliseconds / 1000;
                const minSeconds = criteria.minSeconds;

                if (typeof minSeconds !== 'number' || !Number.isFinite(minSeconds) || minSeconds <= 0) {
                    logger.warn(`[ObjectiveManager] Objective "${objective.id}" has invalid timeOnSlide criteria: minSeconds must be a positive number.`);
                    return;
                }

                if (totalSeconds >= minSeconds) {
                    this.setCompletionStatus(objective.id, 'completed');
                    logger.debug(`[ObjectiveManager] Objective "${objective.id}" completed: timeOnSlide (${totalSeconds.toFixed(1)}s)`);
                }
            }
        });
    }

    /**
     * Checks if any flag-based objectives are met.
     * @private
     * @param {string} flagKey - The key of the flag that was updated
     * @param {any} flagValue - The new value of the flag
     */
    _checkFlagBasedObjectives(flagKey, flagValue) {
        // Get all current flags
        const flags = stateManager.getDomainState('flags') || {};

        this.criteriaConfig.forEach(objective => {
            // Skip if already completed
            const current = this.objectives[objective.id];
            if (current && current.completion_status === 'completed') {
                return;
            }

            const { criteria } = objective;

            if (criteria.type === 'flag') {
                // Single flag check
                if (criteria.key === flagKey) {
                    let isMet = false;

                    if (criteria.equals !== undefined) {
                        isMet = flagValue === criteria.equals;
                    } else {
                        // Default: check if flag is truthy
                        isMet = !!flagValue;
                    }

                    if (isMet) {
                        this.setCompletionStatus(objective.id, 'completed');
                        logger.debug(`[ObjectiveManager] Objective "${objective.id}" completed: flag "${flagKey}" = ${flagValue}`);
                    }
                }
            } else if (criteria.type === 'allFlags') {
                // Multiple flags check - all must be truthy (or match equals values)
                const requiredFlags = criteria.flags || [];
                if (!Array.isArray(requiredFlags) || requiredFlags.length === 0) {
                    logger.warn(`[ObjectiveManager] Objective "${objective.id}" has invalid allFlags criteria: flags must be a non-empty array.`);
                    return;
                }
                const allMet = requiredFlags.every(flagConfig => {
                    const key = typeof flagConfig === 'string' ? flagConfig : flagConfig.key;
                    const value = flags[key];

                    if (typeof flagConfig === 'object' && flagConfig.equals !== undefined) {
                        return value === flagConfig.equals;
                    }
                    return !!value;
                });

                if (allMet) {
                    this.setCompletionStatus(objective.id, 'completed');
                    logger.debug(`[ObjectiveManager] Objective "${objective.id}" completed: allFlags`);
                }
            }
        });
    }
}

const instance = new ObjectiveManager();
export default instance;
