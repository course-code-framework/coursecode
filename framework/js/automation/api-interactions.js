/**
 * @file api-interactions.js
 * Interaction discovery, state access, mutation, and evaluation methods
 * for the CourseCodeAutomation API.
 */

import interactionRegistry from '../managers/interaction-registry.js';
import { courseConfig } from '../../../course/course-config.js';
import { getInteractionState, recordInteractionResult } from '../components/interactions/interaction-base.js';
import { logger } from '../utilities/logger.js';

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
                    type: i.type,
                    description: i.description,
                    hasResponse: response !== null && response !== undefined && response !== '',
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
                type: entry.type,
                description: entry.description,
                hasResponse: response !== null && response !== undefined && response !== '',
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

            if (typeof entry.instance.setResponse !== 'function') {
                throw new Error(`CourseCodeAutomation: Interaction "${interactionId}" does not support setResponse`);
            }

            try {
                entry.instance.setResponse(response);
                logTrace('setResponse', { interactionId, response });
            } catch (error) {
                logTrace('setResponse:error', { interactionId, response, error: error.message });
                throw new Error(`CourseCodeAutomation: Failed to set response for "${interactionId}": ${error.message}`);
            }
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

                const config = entry.config;
                if (!config.controlled) {
                    try {
                        recordInteractionResult(config, evaluation);
                    } catch (recordError) {
                        logger.warn(`[CourseCodeAutomation] Failed to record interaction "${interactionId}" to SCORM: ${recordError.message}`);
                    }
                }

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
