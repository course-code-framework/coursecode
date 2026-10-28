/**
 * @file api-interactions.js
 * Interaction discovery, state access, mutation, and evaluation methods
 * for the CourseCodeAutomation API.
 */

import interactionRegistry from '../managers/interaction-registry.js';
import { courseConfig } from '../../../course/course-config.js';
import { dispatchInteractionChecked, getInteractionState, recordInteractionResult } from '../components/interactions/interaction-base.js';
import { logger } from '../utilities/logger.js';

/** True when a response carries no answer ([], {}, and objects of blank values included). */
export function isEmptyResponse(value) {
    if (value === null || value === undefined || value === '') return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.values(value).every(isEmptyResponse);
    return false;
}

/** Question objects carry the specific type (e.g. multiple-choice-single); registry entries often don't. */
function interactionType(entry) {
    return entry.instance?.type || entry.type || '';
}

function toValueList(value) {
    return (Array.isArray(value) ? value : [value]).map(String);
}

/**
 * Reject a response the interaction can't represent, and map documented
 * shorthand onto what the interaction expects. Interactions ignore unknown
 * values when restoring saved state (so a course update can't break a
 * learner's slide), which would otherwise make a mistyped automation response
 * silently select nothing.
 *
 * @param {Object} entry - Interaction registry entry
 * @param {*} requested - Response passed to setResponse
 * @param {*} before - getResponse() before setting, for types validated up front
 * @returns {*} The response to apply
 * @throws {Error} If the response can't be applied
 */
function normalizeResponse(entry, requested, before) {
    const type = interactionType(entry);
    if (type === 'sequencing') {
        if (!Array.isArray(requested)) throw new Error('Sequencing responses must be an array of item IDs.');
        const known = toValueList(before ?? []).sort();
        const given = toValueList(requested).sort();
        if (known.length && JSON.stringify(known) !== JSON.stringify(given)) {
            throw new Error(`Response must list every item ID exactly once. Item IDs: ${known.join(', ')}`);
        }
        return requested;
    }
    if (type === 'fill-in' && requested && typeof requested === 'object' && !Array.isArray(requested)
        && before && typeof before === 'object') {
        // Inputs are named "<interactionId>_<blankId>"; accept the bare blank id too
        const prefix = `${entry.id}_`;
        const inputNames = Object.keys(before);
        const normalized = {};
        const unknown = [];
        for (const [key, value] of Object.entries(requested)) {
            const name = inputNames.includes(key) ? key : inputNames.includes(prefix + key) ? prefix + key : null;
            if (name) normalized[name] = value;
            else unknown.push(key);
        }
        if (unknown.length) {
            const blankIds = inputNames.map(name => (name.startsWith(prefix) ? name.slice(prefix.length) : name));
            throw new Error(`Unknown blank ${unknown.map(k => `"${k}"`).join(', ')}. Blank IDs: ${blankIds.join(', ')}`);
        }
        return normalized;
    }
    return requested;
}

function findAppliedProblem(entry, requested, applied) {
    if (isEmptyResponse(requested)) return null;
    if (interactionType(entry).startsWith('multiple-choice')) {
        const selected = toValueList(applied ?? []);
        const missing = toValueList(requested).filter(value => !selected.includes(value));
        if (missing.length) {
            const container = document.querySelector(`[data-interaction-id="${CSS.escape(entry.id)}"]`);
            const choices = container
                ? Array.from(container.querySelectorAll('input[type="radio"], input[type="checkbox"]')).map(input => input.value)
                : [];
            return `Unknown choice ${missing.map(v => `"${v}"`).join(', ')}.${choices.length ? ` Choices: ${choices.join(', ')}` : ''}`;
        }
        return null;
    }
    if (isEmptyResponse(applied)) {
        return 'The interaction did not accept this response. Check the response format with coursecode_interaction_catalog.';
    }
    return null;
}

/**
 * Set a response on an interaction instance and verify it took effect.
 * Shared with assessment automation, whose questions aren't in the registry.
 *
 * @param {{id: string, type?: string, instance: Object}} entry
 * @param {*} response
 * @param {Function} logTrace - Shared trace logger
 */
export function applyResponse(entry, response, logTrace) {
    const interactionId = entry.id;
    if (typeof entry.instance.setResponse !== 'function') {
        throw new Error(`CourseCodeAutomation: Interaction "${interactionId}" does not support setResponse`);
    }

    const canRead = typeof entry.instance.getResponse === 'function';
    try {
        const before = canRead ? entry.instance.getResponse() : undefined;
        const normalized = normalizeResponse(entry, response, before);

        entry.instance.setResponse(normalized);

        const notApplied = canRead ? findAppliedProblem(entry, response, entry.instance.getResponse()) : null;
        if (notApplied) throw new Error(notApplied);
        logTrace('setResponse', { interactionId, response });
    } catch (error) {
        logTrace('setResponse:error', { interactionId, response, error: error.message });
        throw new Error(`CourseCodeAutomation: Failed to set response for "${interactionId}": ${error.message}`);
    }
}

/**
 * Creates interaction API methods bound to the shared logTrace function.
 * @param {Function} logTrace - Shared trace logger
 * @returns {Object} Interaction API methods
 */
export function createInteractionMethods(logTrace) {
    return {
        listInteractions() {
            const interactions = interactionRegistry.getAll();
            const simplifiedList = interactions.map(i => {
                const savedState = getInteractionState(i.id);
                let response = savedState?.response;

                if (response === undefined && typeof i.instance?.getResponse === 'function') {
                    try {
                        response = i.instance.getResponse();
                    } catch {
                        response = undefined;
                    }
                }

                return {
                    id: i.id,
                    type: interactionType(i),
                    description: i.description,
                    hasResponse: !isEmptyResponse(response),
                    isChecked: savedState?.submitted === true
                };
            });
            logTrace('listInteractions', { count: simplifiedList.length });
            return simplifiedList;
        },

        getInteractionMetadata(interactionId) {
            const entry = interactionRegistry.getAll().find(i => i.id === interactionId);
            if (!entry) {
                throw new Error(`CourseCodeAutomation: Interaction "${interactionId}" not found on the current slide`);
            }
            logTrace('getInteractionMetadata', { interactionId });
            const savedState = getInteractionState(entry.id);
            let response = savedState?.response;

            if (response === undefined && typeof entry.instance?.getResponse === 'function') {
                try {
                    response = entry.instance.getResponse();
                } catch {
                    response = undefined;
                }
            }

            return {
                id: entry.id,
                type: interactionType(entry),
                description: entry.description,
                hasResponse: !isEmptyResponse(response),
                isChecked: savedState?.submitted === true
            };
        },

        getResponse(interactionId) {
            const entry = interactionRegistry.getAll().find(i => i.id === interactionId);
            if (!entry || !entry.instance) {
                throw new Error(`CourseCodeAutomation: Interaction "${interactionId}" not found or has no instance`);
            }

            if (typeof entry.instance.getResponse !== 'function') {
                throw new Error(`CourseCodeAutomation: Interaction "${interactionId}" does not support getResponse`);
            }

            const response = entry.instance.getResponse();
            logTrace('getResponse', { interactionId, response });
            return response;
        },

        getCorrectResponse(interactionId) {
            if (!courseConfig.environment?.automation?.exposeCorrectAnswers) {
                throw new Error('CourseCodeAutomation: getCorrectResponse requires automation.exposeCorrectAnswers=true in course config');
            }

            const entry = interactionRegistry.getAll().find(i => i.id === interactionId);
            if (!entry || !entry.instance) {
                throw new Error(`CourseCodeAutomation: Interaction "${interactionId}" not found or has no instance`);
            }

            if (typeof entry.instance.getCorrectAnswer !== 'function') {
                throw new Error(`CourseCodeAutomation: Interaction "${interactionId}" does not support getCorrectAnswer`);
            }

            const correctAnswer = entry.instance.getCorrectAnswer();
            logTrace('getCorrectResponse', { interactionId });
            return correctAnswer;
        },

        setResponse(interactionId, response) {
            const entry = interactionRegistry.getAll().find(i => i.id === interactionId);
            if (!entry || !entry.instance) {
                throw new Error(`CourseCodeAutomation: Interaction "${interactionId}" not found or has no instance`);
            }
            applyResponse(entry, response, logTrace);
        },

        checkAnswer(interactionId) {
            const entry = interactionRegistry.getAll().find(i => i.id === interactionId);
            if (!entry || !entry.instance) {
                throw new Error(`CourseCodeAutomation: Interaction "${interactionId}" not found or has no instance`);
            }

            if (typeof entry.instance.checkAnswer !== 'function') {
                throw new Error(`CourseCodeAutomation: Interaction "${interactionId}" does not support checkAnswer`);
            }

            try {
                const evaluation = entry.instance.checkAnswer();
                logTrace('checkAnswer', { interactionId, evaluation });
                if (!evaluation) {
                    throw new Error('Nothing to check: the interaction has no response. Set one with setResponse first.');
                }

                const config = entry.config;
                if (!config.controlled) {
                    try {
                        recordInteractionResult(config, evaluation);
                    } catch (recordError) {
                        logger.warn(`[CourseCodeAutomation] Failed to record interaction "${interactionId}" to SCORM: ${recordError.message}`);
                    }
                }

                const interactionElement = document.querySelector(`[data-interaction-id="${CSS.escape(interactionId)}"]`);
                dispatchInteractionChecked(interactionElement, evaluation);

                return evaluation;
            } catch (error) {
                logTrace('checkAnswer:error', { interactionId, error: error.message });
                throw new Error(`CourseCodeAutomation: Failed to check answer for "${interactionId}": ${error.message}`);
            }
        },

        checkSlideAnswers(getCurrentSlide) {
            const slideId = getCurrentSlide();
            const slideInteractions = interactionRegistry.getAll();

            if (slideInteractions.length === 0) {
                logTrace('checkSlideAnswers', {
                    slideId,
                    found: 0,
                    message: 'No interactions found on slide'
                });
                return [];
            }

            const results = [];
            for (const interactionInfo of slideInteractions) {
                try {
                    const evaluation = this.checkAnswer(interactionInfo.id);
                    results.push({
                        interactionId: interactionInfo.id,
                        type: interactionInfo.type,
                        evaluation
                    });
                } catch (error) {
                    results.push({
                        interactionId: interactionInfo.id,
                        type: interactionInfo.type,
                        error: error.message
                    });
                }
            }

            logTrace('checkSlideAnswers', {
                slideId,
                total: slideInteractions.length,
                successful: results.filter(r => !r.error).length,
                failed: results.filter(r => r.error).length
            });

            return results;
        }
    };
}
