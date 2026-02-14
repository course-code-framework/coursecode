/**
 * @file interaction-base.js
 * @description Shared utilities and patterns for all interaction components.
 * Eliminates duplication and ensures consistent error handling across interactions.
 */

import InteractionManager from '../../managers/interaction-manager.js';
import interactionRegistry from '../../managers/interaction-registry.js';
import stateManager from '../../state/index.js';

import engagementManager from '../../engagement/engagement-manager.js';
import * as NavigationState from '../../navigation/NavigationState.js';
import { iconManager } from '../../utilities/icons.js';
import { logger } from '../../utilities/logger.js';
import { escapeHTML } from '../../utilities/utilities.js';
import { formatLearnerResponseForScorm } from '../../validation/scorm-validators.js';

/**
 * Validate a configuration object against an interaction schema.
 * Each interaction passes its own schema directly to avoid circular imports.
 * @param {object} config - The interaction configuration to validate
 * @param {object} interactionSchema - The schema object (from the interaction's export)
 * @param {object} [baseProps] - Optional base schema properties to merge (defaults to baseSchema)
 * @throws {Error} If validation fails
 * @returns {true} If validation passes
 */
export function validateAgainstSchema(config, interactionSchema, baseProps = null) {
    if (!config || typeof config !== 'object') {
        throw new Error(`Invalid interaction config: expected object, got ${typeof config}`);
    }

    if (!interactionSchema || !interactionSchema.properties) {
        throw new Error('Invalid schema: must have properties object');
    }

    // Merge base properties with interaction-specific properties
    const schema = {
        ...interactionSchema,
        properties: {
            ...baseProps,
            ...interactionSchema.properties
        }
    };

    const errors = [];

    // Validate each property defined in the schema
    for (const [propName, propDef] of Object.entries(schema.properties)) {
        const value = config[propName];
        const isPresent = value !== undefined && value !== null && value !== '';

        // Check required
        if (propDef.required && !isPresent) {
            // Handle requiredUnless condition
            if (propDef.requiredUnless && config[propDef.requiredUnless]) {
                continue; // Skip - alternative condition satisfied
            }
            errors.push(`Missing required property: "${propName}"`);
            continue;
        }

        // Skip validation if not present and not required
        if (!isPresent) continue;

        // Type checking
        const expectedTypes = Array.isArray(propDef.type) ? propDef.type : [propDef.type];
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (!expectedTypes.includes(actualType)) {
            errors.push(`Property "${propName}" expected ${expectedTypes.join(' or ')}, got ${actualType}`);
            continue;
        }

        // Array-specific validation
        if (actualType === 'array') {
            if (propDef.minItems && value.length < propDef.minItems) {
                errors.push(`Property "${propName}" must have at least ${propDef.minItems} items`);
            }
        }

        // Enum validation
        if (propDef.enum && !propDef.enum.includes(value)) {
            errors.push(`Property "${propName}" must be one of: ${propDef.enum.join(', ')}`);
        }
    }

    if (errors.length > 0) {
        throw new Error(`Invalid ${type} configuration:\n  - ${errors.join('\n  - ')}`);
    }

    return true;
}

// Domain key for storing live interaction responses in suspend_data
const RESPONSES_DOMAIN = 'interactionResponses';

/**
 * Saves the current response state for an interaction.
 * Called on every response change (selection, input, etc.) for live state tracking.
 * Silently skips if stateManager is not initialized (e.g., during static validation).
 * @param {string} id - The interaction ID
 * @param {*} response - The current response value
 * @param {boolean} submitted - Whether the interaction has been submitted (Check Answer clicked)
 */
export function saveInteractionState(id, response, submitted = false) {
    // Silently skip if stateManager not initialized (static validation, early creation)
    if (!stateManager.isInitialized) {
        return;
    }
    try {
        const state = stateManager.getDomainState(RESPONSES_DOMAIN) || {};
        state[id] = { response, submitted };
        stateManager.setDomainState(RESPONSES_DOMAIN, state, { source: 'interaction-base' });
    } catch (error) {
        logger.warn(`[interaction-base] Failed to save interaction state for "${id}":`, error.message);
    }
}

/**
 * Retrieves the saved response state for an interaction.
 * Used during render to restore previous selections.
 * Returns null if stateManager is not initialized (e.g., during static validation).
 * @param {string} id - The interaction ID
 * @returns {{ response: *, submitted: boolean } | null} The saved state or null if none exists
 */
export function getInteractionState(id) {
    // Silently return null if stateManager not initialized (static validation, early creation)
    if (!stateManager.isInitialized) {
        return null;
    }
    try {
        const state = stateManager.getDomainState(RESPONSES_DOMAIN) || {};
        return state[id] || null;
    } catch (error) {
        logger.warn(`[interaction-base] Failed to get interaction state for "${id}":`, error.message);
        return null;
    }
}

/**
 * Validates that required config properties exist.
 * @throws {Error} If required properties are missing
 */
export function validateInteractionConfig(config, requiredProps) {
    if (!config || typeof config !== 'object') {
        throw new Error('Interaction config must be an object');
    }

    if (!config.id || typeof config.id !== 'string') {
        throw new Error('Interaction must have a valid string id');
    }

    if (!config.prompt || typeof config.prompt !== 'string') {
        throw new Error(`Interaction "${config.id}" must have a valid prompt`);
    }

    for (const prop of requiredProps) {
        if (config[prop] === undefined) {
            throw new Error(`Interaction "${config.id}" is missing required property: ${prop}`);
        }
    }
}

/**
 * Creates a standardized interaction event handler that uses event delegation.
 * Handles check-answer, reset, and custom actions.
 */
export function createInteractionEventHandler(questionObj, config, customHandlers = {}) {
    return function handleInteractionEvent(event) {
        const actionTarget = event.target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;

        // Only handle actions for this interaction
        if (actionTarget.dataset.interaction !== config.id) return;

        switch (action) {
            case 'check-answer':
                const evaluation = questionObj.checkAnswer();
                if (!evaluation) return; // checkAnswer handles error display

                // NEW: Track for engagement
                const currentSlideId = NavigationState.getCurrentSlideId();
                if (currentSlideId) {
                    engagementManager.trackInteraction(
                        currentSlideId,
                        config.id,
                        true, // completed
                        evaluation.correct
                    );
                }

                // Only record to InteractionManager if NOT in controlled mode
                if (!config.controlled) {
                    recordInteractionResult(config, evaluation);
                }
                break;

            case 'reset':
                questionObj.reset();
                break;

            case 'show-hint':
                if (questionObj.showHint) {
                    questionObj.showHint();
                }
                break;

            default:
                // Check for custom handlers
                if (customHandlers[action]) {
                    customHandlers[action](event, actionTarget);
                }
                break;
        }
    };
}

/**
 * Records interaction result to InteractionManager with proper SCORM type mapping.
 * Also marks the interaction as submitted in the response state.
 * 
 * Formats the learner_response according to SCORM 2004 4th Edition requirements.
 * Each interaction type has specific format requirements:
 * - true-false: "true" or "false"
 * - matching: "source[.]target[,]source[.]target"
 * - sequencing: "item[,]item[,]item"
 * - choice: "a[,]b[,]c"
 * - fill-in: plain text
 */
export function recordInteractionResult(config, evaluation) {
    // Mark as submitted in state (for restoration purposes)
    saveInteractionState(config.id, evaluation.response, true);

    // Format the response according to SCORM 2004 requirements
    const scormType = config.scormType || 'other';
    const formattedResponse = formatLearnerResponseForScorm(scormType, evaluation.response);

    // Format correct_responses using the same SCORM format as learner_response
    // This is critical for types like 'matching' which require source[.]target format
    let formattedCorrectResponses;
    if (evaluation.correctResponses) {
        formattedCorrectResponses = evaluation.correctResponses;
    } else if (config.correctPattern) {
        // Format the correctPattern using the same formatter as learner_response
        formattedCorrectResponses = [formatLearnerResponseForScorm(scormType, config.correctPattern)];
    } else {
        formattedCorrectResponses = [''];
    }

    const interactionData = {
        id: config.id,
        type: scormType,
        learner_response: formattedResponse,
        result: evaluation.correct ? 'correct' : 'incorrect',
        correct_responses: formattedCorrectResponses,
        description: config.prompt
    };

    try {
        InteractionManager.record(interactionData);
    } catch (error) {
        logger.error(`Failed to record interaction "${config.id}": ${error.message}`, { domain: 'interaction', operation: 'record', stack: error.stack, interactionId: config.id });
        throw error; // Re-throw to prevent silent failures
    }
}

/**
 * Creates standard interaction controls HTML.
 * Uses utility classes for layout: .flex .flex-wrap .justify-center .gap-3
 * Note: No margin needed - parent .interaction uses gap for spacing
 */
export function renderInteractionControls(id, controlled = false, customButtons = []) {
    if (controlled) return '';

    const buttons = [
        `<button type="button" class="btn btn-success" data-action="check-answer" data-interaction="${id}" data-testid="${id}-check-answer">Check Answer</button>`,
        `<button type="button" class="btn btn-reset" data-action="reset" data-interaction="${id}" data-testid="${id}-reset">Reset</button>`,
        ...customButtons
    ];

    return `<div class="flex flex-wrap justify-center gap-3" data-testid="${id}-controls">${buttons.join('')}</div>`;
}

/**
 * Creates a feedback container with proper ARIA attributes.
 */
export function renderFeedbackContainer(id) {
    return `<div id="${id}_feedback" class="feedback" aria-live="polite" data-testid="${id}-feedback"></div>`;
}

/**
 * Displays feedback in the interaction's feedback element.
 */
export function displayFeedback(container, id, message, type = 'info') {
    if (!container) {
        throw new Error(`Cannot display feedback: container is null for interaction "${id}"`);
    }

    const feedbackEl = container.querySelector(`#${id}_feedback, .feedback, .overall-feedback`);
    if (!feedbackEl) {
        throw new Error(`Feedback element not found for interaction "${id}"`);
    }

    const icon = type === 'correct' ? iconManager.getIcon('check') : type === 'incorrect' ? iconManager.getIcon('x') : '';
    feedbackEl.innerHTML = `<div class="feedback ${type}">${icon} ${escapeHTML(message)}</div>`;
}

/**
 * Clears feedback from an interaction.
 */
export function clearFeedback(container, id) {
    if (!container) return;

    const feedbackEl = container.querySelector(`#${id}_feedback, .feedback, .overall-feedback`);
    if (feedbackEl) {
        feedbackEl.innerHTML = '';
    }
}

/**
 * Validates and normalizes initial response for rendering.
 * Returns null if invalid/empty, or the normalized response.
 */
export function normalizeInitialResponse(response) {
    if (response === null || response === undefined || response === '') {
        return null;
    }
    return response;
}

/**
 * Safely escapes a string for use in a CSS selector.
 * @throws {Error} If CSS.escape is not available and value contains special characters
 */
export function escapeCssSelector(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(value);
    }

    // No fallback - if CSS.escape doesn't exist, throw error
    throw new Error('CSS.escape is not available and is required for safe selector escaping');
}

/**
 * Ensures container is valid before performing operations.
 * @throws {Error} If container is null or not an Element
 */
export function validateContainer(container, interactionId) {
    if (!container) {
        throw new Error(`Container is null for interaction "${interactionId}". Ensure render() was called first.`);
    }

    if (!(container instanceof Element)) {
        throw new Error(`Container must be a DOM Element for interaction "${interactionId}"`);
    }
}

/**
 * Parses a response that could be a string, array, or object.
 * Returns normalized data structure or throws error.
 */
export function parseResponse(response, expectedType = 'any') {
    if (response === null || response === undefined) {
        return null;
    }

    // If it's already the expected type, return it
    if (expectedType === 'array' && Array.isArray(response)) {
        return response;
    }

    if (expectedType === 'object' && typeof response === 'object' && !Array.isArray(response)) {
        return response;
    }

    // Try parsing string as JSON
    if (typeof response === 'string') {
        const trimmed = response.trim();
        if (!trimmed) return null;

        // Try JSON parse
        try {
            const parsed = JSON.parse(trimmed);
            if (expectedType === 'array' && !Array.isArray(parsed)) {
                throw new Error(`Expected array, got ${typeof parsed}`);
            }
            if (expectedType === 'object' && (typeof parsed !== 'object' || Array.isArray(parsed))) {
                throw new Error(`Expected object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`);
            }
            return parsed;
        } catch (parseError) {
            // If JSON parse fails and we need array/object, throw error
            if (expectedType === 'array' || expectedType === 'object') {
                throw new Error(`Failed to parse response as JSON: ${parseError.message}`);
            }
            // For 'any' or 'string', return the string value
            return trimmed;
        }
    }

    return response;
}

/**
 * Creates evaluation error result for invalid responses.
 */
export function createInvalidEvaluation(_interactionType) {
    return {
        score: 0,
        correct: false,
        response: '',
        error: 'Invalid or missing response'
    };
}

// Debounce delay for auto-saving response state (ms)
const RESPONSE_SAVE_DEBOUNCE_MS = 300;

// Track debounce timers per interaction ID
const _responseDebounceTimers = new Map();

/**
 * Registers an uncontrolled interaction with the InteractionRegistry.
 * This is the single registration point for all standalone interactions.
 * The registry tracks currently rendered interactions for engagement and automation.
 * Also restores any previously saved response state and sets up auto-save on changes.
 * @param {object} config - The interaction configuration.
 * @param {object} questionObj - The live interaction instance.
 */
export function registerCoreInteraction(config, questionObj) {
    // Delegate to the InteractionRegistry (separate from persistence manager)
    interactionRegistry.register(config, questionObj);

    // Defer state restoration and auto-save setup to next frame
    // This ensures the DOM container exists after render() completes
    requestAnimationFrame(() => {
        // Restore previously saved response state if it exists
        const savedState = getInteractionState(config.id);
        if (savedState && savedState.response !== null && savedState.response !== undefined) {
            try {
                if (typeof questionObj.setResponse === 'function') {
                    questionObj.setResponse(savedState.response);
                    logger.debug(`[interaction-base] Restored state for interaction "${config.id}"`);

                    // If it was previously submitted, also restore the feedback state
                    if (savedState.submitted && typeof questionObj.checkAnswer === 'function') {
                        questionObj.checkAnswer();
                    }
                }
            } catch (error) {
                // Silently ignore - container may not exist for controlled interactions
                logger.debug(`[interaction-base] Could not restore state for "${config.id}" (may be controlled):`, error.message);
            }
        }

        // Set up auto-save on response changes (debounced)
        // This listens for change/input events on the interaction container
        // and saves the current response to state for restoration on re-render
        _setupResponseAutoSave(config.id, questionObj);
    });
}

/**
 * Sets up debounced auto-save of response state when the user interacts.
 * Listens for change and input events on the interaction container.
 * @private
 * @param {string} id - The interaction ID
 * @param {object} questionObj - The live interaction instance
 */
function _setupResponseAutoSave(id, questionObj) {
    const container = document.querySelector(`[data-interaction-id="${id}"]`);
    if (!container) {
        // Container not found - this is expected for controlled interactions (assessments)
        // which manage their own state, or during static validation
        return;
    }

    // Debounced save function
    const debouncedSave = () => {
        // Clear any existing timer
        if (_responseDebounceTimers.has(id)) {
            clearTimeout(_responseDebounceTimers.get(id));
        }

        // Set new timer
        const timer = setTimeout(() => {
            try {
                if (typeof questionObj.getResponse === 'function') {
                    const response = questionObj.getResponse();
                    if (response !== null && response !== undefined) {
                        // Get current state to preserve submitted flag
                        const currentState = getInteractionState(id);
                        const submitted = currentState?.submitted || false;
                        saveInteractionState(id, response, submitted);
                    }
                }
            } catch (error) {
                logger.warn(`[interaction-base] Auto-save failed for "${id}":`, error.message);
            }
            _responseDebounceTimers.delete(id);
        }, RESPONSE_SAVE_DEBOUNCE_MS);

        _responseDebounceTimers.set(id, timer);
    };

    // Listen for both change (radios, checkboxes, selects) and input (text fields)
    container.addEventListener('change', debouncedSave);
    container.addEventListener('input', debouncedSave);
}
