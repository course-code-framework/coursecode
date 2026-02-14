import { eventBus } from '../core/event-bus.js';
import engagementManager from '../engagement/engagement-manager.js';
import flagManager from '../managers/flag-manager.js';
import * as NavigationState from '../navigation/NavigationState.js';

/**
 * Conditional Display Utility
 *
 * Provides both declarative (component-based) and programmatic (helper function)
 * APIs for showing/hiding content based on conditions like engagement, flags,
 * and interaction completion.
 *
 * @example Programmatic usage
 * import { conditionalDisplay } from '../framework/js/utilities/conditional-display.js';
 * conditionalDisplay.showWhen(element, 'engagement.viewAllTabs');
 */

/**
 * Parses a condition string into a structured condition object.
 *
 * Supported formats:
 * - 'engagement.viewAllTabs'
 * - 'engagement.viewAllPanels'
 * - 'engagement.viewAllFlipCards'
 * - 'engagement.allInteractionsComplete'
 * - 'engagement.scrollDepth'
 * - 'engagement.timeOnSlide'
 * - 'flag.flagName'
 * - 'interaction.interactionId'
 *
 * @param {string} conditionString - The condition string to parse
 * @returns {object} Structured condition object
 */
function parseCondition(conditionString) {
    if (typeof conditionString !== 'string') {
        throw new Error('Condition must be a string');
    }

    const [type, value] = conditionString.split('.');

    switch (type) {
        case 'engagement':
            return { type: 'engagement', requirement: value };
        case 'flag':
            return { type: 'flag', key: value };
        case 'interaction':
            return { type: 'interaction', id: value };
        default:
            throw new Error(`Unknown condition type: ${type}`);
    }
}

/**
 * Evaluates whether a single condition is met.
 *
 * @param {object} condition - The condition to evaluate
 * @param {string} slideId - Current slide ID
 * @returns {boolean} True if condition is met
 */
function evaluateCondition(condition, slideId) {
    switch (condition.type) {
        case 'engagement': {
            const evaluation = engagementManager.evaluateRequirements(slideId);

            if (condition.requirement === 'complete') {
                // Check overall completion
                return evaluation.complete;
            }

            // Check specific requirement type
            const req = evaluation.unmetRequirements.find(r => r.type === condition.requirement);
            return !req; // Not in unmet list = met
        }

        case 'flag': {
            const flagValue = flagManager.getFlag(condition.key);

            if (condition.equals !== undefined) {
                return flagValue === condition.equals;
            }

            return !!flagValue; // Default: check if truthy
        }

        case 'interaction': {
            const engagementState = engagementManager.getSlideState(slideId);
            if (!engagementState) return false;

            const interaction = engagementState.tracked.interactionsCompleted[condition.id];

            if (condition.requireCorrect) {
                return interaction?.completed && interaction?.correct;
            }

            return interaction?.completed || false;
        }

        default:
            throw new Error(`[ConditionalDisplay] Unknown condition type: ${condition.type}. Valid types: engagement, flag, interaction.`);
    }
}

/**
 * Evaluates multiple conditions based on mode (all/any).
 *
 * @param {array} conditions - Array of condition objects
 * @param {string} mode - 'all' (AND) or 'any' (OR)
 * @param {string} slideId - Current slide ID
 * @returns {boolean} True if conditions are met
 */
function evaluateConditions(conditions, mode, slideId) {
    if (mode === 'all') {
        return conditions.every(cond => evaluateCondition(cond, slideId));
    } else if (mode === 'any') {
        return conditions.some(cond => evaluateCondition(cond, slideId));
    }

    throw new Error(`Invalid mode: ${mode}. Must be 'all' or 'any'.`);
}

/**
 * Shows or hides an element with optional transition.
 *
 * @param {HTMLElement} element - The element to show/hide
 * @param {boolean} show - True to show, false to hide
 * @param {object} options - Display options
 */
function setElementVisibility(element, show, options = {}) {
    const {
        transition = true,
        display = 'block',
        onShow = null,
        onHide = null
    } = options;

    // Clean up any pending transitionend handlers to prevent stale listeners
    if (element._conditionalTransitionHandler) {
        element.removeEventListener('transitionend', element._conditionalTransitionHandler);
        element._conditionalTransitionHandler = null;
    }

    if (show) {
        if (transition) {
            element.style.display = display;
            element.classList.remove('conditional-hidden');
            element.classList.add('conditional-visible');
        } else {
            element.style.display = display;
        }

        if (onShow) onShow();
    } else {
        if (transition) {
            element.classList.remove('conditional-visible');
            element.classList.add('conditional-hidden');

            // Wait for transition to complete before setting display:none
            const handleTransitionEnd = () => {
                element.style.display = 'none';
                element.removeEventListener('transitionend', handleTransitionEnd);
                element._conditionalTransitionHandler = null;
            };

            // Store the handler on the element so we can clean it up later
            element._conditionalTransitionHandler = handleTransitionEnd;
            element.addEventListener('transitionend', handleTransitionEnd);
        } else {
            element.style.display = 'none';
        }

        if (onHide) onHide();
    }
}

/**
 * ConditionalDisplay Class
 *
 * Manages conditional visibility of elements based on engagement, flags, and interactions.
 */
class ConditionalDisplay {
    constructor() {
        this.trackedElements = new Map();
    }

    /**
     * Shows an element when condition(s) are met.
     *
     * @param {HTMLElement} element - The element to conditionally display
     * @param {string|object|array} conditions - Condition(s) to evaluate
     * @param {object} options - Configuration options
     * @returns {function} Cleanup function to stop tracking
     *
     * @example Simple string condition
     * showWhen(element, 'engagement.viewAllTabs');
     *
     * @example Complex condition object
     * showWhen(element, {
     *   type: 'flag',
     *   key: 'step1-complete',
     *   equals: true
     * });
     *
     * @example Multiple conditions
     * showWhen(element, [
     *   { type: 'engagement', requirement: 'viewAllTabs' },
     *   { type: 'flag', key: 'intro-complete' }
     * ], { mode: 'all' });
     */
    showWhen(element, conditions, options = {}) {
        const {
            mode = 'all',
            showWhen = true, // If false, inverts logic (hide when condition met)
            initialCheck = true,
            transition = true,
            display = 'block',
            onShow = null,
            onHide = null
        } = options;

        // Parse conditions into structured format
        let parsedConditions = [];

        if (typeof conditions === 'string') {
            parsedConditions = [parseCondition(conditions)];
        } else if (Array.isArray(conditions)) {
            parsedConditions = conditions.map(c =>
                typeof c === 'string' ? parseCondition(c) : c
            );
        } else if (typeof conditions === 'object') {
            parsedConditions = [conditions];
        } else {
            throw new Error('Invalid conditions format');
        }

        // Initially hide the element
        element.style.display = 'none';
        element.classList.add('conditional-hidden');

        // Evaluation function
        const checkConditions = () => {
            const slideId = NavigationState.getCurrentSlideId();
            if (!slideId) return;

            const conditionsMet = evaluateConditions(parsedConditions, mode, slideId);
            const shouldShow = showWhen ? conditionsMet : !conditionsMet;

            setElementVisibility(element, shouldShow, {
                transition,
                display,
                onShow,
                onHide
            });
        };

        // Determine which events to listen for based on condition types
        const events = new Set();
        parsedConditions.forEach(cond => {
            switch (cond.type) {
                case 'engagement':
                    events.add('engagement:progress');
                    events.add('engagement:complete');
                    break;
                case 'flag':
                    events.add('flag:updated');
                    events.add('flag:removed');
                    break;
                case 'interaction':
                    events.add('interaction:answered');
                    events.add('interaction:completed');
                    break;
            }
        });

        // Subscribe to relevant events
        const eventHandlers = [];
        events.forEach(eventName => {
            const handler = () => checkConditions();
            eventBus.on(eventName, handler);
            eventHandlers.push({ eventName, handler });
        });

        // Initial check
        if (initialCheck) {
            checkConditions();
        }

        // Store tracking info
        const trackingId = `${Date.now()}-${Math.random()}`;
        this.trackedElements.set(trackingId, {
            element,
            eventHandlers,
            checkConditions
        });

        // Return cleanup function
        return () => {
            const tracked = this.trackedElements.get(trackingId);
            if (tracked) {
                tracked.eventHandlers.forEach(({ eventName, handler }) => {
                    eventBus.off(eventName, handler);
                });
                this.trackedElements.delete(trackingId);
            }
        };
    }

    /**
     * Hides an element when condition(s) are met (inverse of showWhen).
     *
     * @param {HTMLElement} element - The element to conditionally hide
     * @param {string|object|array} conditions - Condition(s) to evaluate
     * @param {object} options - Configuration options
     * @returns {function} Cleanup function
     */
    hideWhen(element, conditions, options = {}) {
        return this.showWhen(element, conditions, {
            ...options,
            showWhen: false
        });
    }

    /**
     * Immediately evaluates conditions and updates element visibility.
     * Does not set up ongoing tracking.
     *
     * @param {HTMLElement} element - The element to update
     * @param {string|object|array} conditions - Condition(s) to evaluate
     * @param {object} options - Configuration options
     * @returns {boolean} Whether conditions were met
     */
    evaluate(element, conditions, options = {}) {
        const {
            mode = 'all',
            showWhen = true,
            transition = false,
            display = 'block',
            onShow = null,
            onHide = null
        } = options;

        // Parse conditions
        let parsedConditions = [];

        if (typeof conditions === 'string') {
            parsedConditions = [parseCondition(conditions)];
        } else if (Array.isArray(conditions)) {
            parsedConditions = conditions.map(c =>
                typeof c === 'string' ? parseCondition(c) : c
            );
        } else {
            parsedConditions = [conditions];
        }

        const slideId = NavigationState.getCurrentSlideId();
        if (!slideId) return false;

        const conditionsMet = evaluateConditions(parsedConditions, mode, slideId);
        const shouldShow = showWhen ? conditionsMet : !conditionsMet;

        setElementVisibility(element, shouldShow, {
            transition,
            display,
            onShow,
            onHide
        });

        return conditionsMet;
    }

    /**
     * Stops tracking all elements.
     * Useful for cleanup when navigating away from a slide.
     */
    cleanup() {
        this.trackedElements.forEach((tracked) => {
            tracked.eventHandlers.forEach(({ eventName, handler }) => {
                eventBus.off(eventName, handler);
            });
        });
        this.trackedElements.clear();
    }
}

// Export singleton instance
export const conditionalDisplay = new ConditionalDisplay();

// Also export helper functions for direct use
export { parseCondition, evaluateCondition, evaluateConditions };
