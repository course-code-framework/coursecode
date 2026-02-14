import {
    createInteractionEventHandler,
    renderInteractionControls,
    normalizeInitialResponse,
    validateContainer,
    parseResponse,
    registerCoreInteraction
} from './interaction-base.js';
import { escapeHTML } from '../../utilities/utilities.js';

/**
 * Normalizes text for comparison: trims and collapses whitespace
 * @param {string} text - The text to normalize
 * @returns {string} Normalized text
 */
function normalizeText(text) {
    return (text || '').trim().replace(/\s+/g, ' ');
}

/**
 * Calculates Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Number of edits (insertions, deletions, substitutions)
 */
function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = Array(b.length + 1).fill(null)
        .map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,      // deletion
                matrix[j - 1][i] + 1,      // insertion
                matrix[j - 1][i - 1] + cost // substitution
            );
        }
    }
    return matrix[b.length][a.length];
}

/**
 * Checks if a response matches any correct answer
 * @param {string} response - User's response
 * @param {string|string[]} correct - Correct answer(s)
 * @param {boolean} caseSensitive - Whether to match case
 * @param {number} typoTolerance - Max Levenshtein distance to accept (0 = exact match)
 * @returns {boolean} True if response matches any correct answer
 */
function matchesAnswer(response, correct, caseSensitive, typoTolerance = 0) {
    const normalizedResponse = normalizeText(response);
    const correctAnswers = Array.isArray(correct) ? correct : [correct];

    return correctAnswers.some(answer => {
        const normalizedAnswer = normalizeText(answer);

        // Apply case normalization if not case sensitive
        const compareResponse = caseSensitive ? normalizedResponse : normalizedResponse.toLowerCase();
        const compareAnswer = caseSensitive ? normalizedAnswer : normalizedAnswer.toLowerCase();

        // Exact match check first
        if (compareResponse === compareAnswer) {
            return true;
        }

        // If typo tolerance is set, check Levenshtein distance
        if (typoTolerance > 0) {
            const distance = levenshteinDistance(compareResponse, compareAnswer);
            return distance <= typoTolerance;
        }

        return false;
    });
}

// Metadata for fill-in interaction type
export const metadata = {
    creator: 'createFillInQuestion',
    scormType: 'fill-in',
    showCheckAnswer: true,
    isAnswered: (response) => {
        if (!response || typeof response !== 'object') return false;
        return Object.values(response).some(val => val && String(val).trim().length > 0);
    },
    getCorrectAnswer: (config) => {
        if (!config.blanks || typeof config.blanks !== 'object') {
            return '';
        }
        return JSON.stringify(Object.fromEntries(
            Object.entries(config.blanks).map(([key, blank]) => [
                `${config.id}_${key}`,
                Array.isArray(blank.correct) ? blank.correct[0] : blank.correct
            ])
        ));
    },
    formatCorrectAnswer: (question, _correctAnswer) => {
        let html = '<ul class="list-disc pl-4 m-0">';
        if (question.blanks && typeof question.blanks === 'object') {
            Object.entries(question.blanks).forEach(([key, blank]) => {
                html += `<li class="correct-item"><strong>${key}:</strong> ${blank.correct}</li>`;
            });
        }
        html += '</ul>';
        return html;
    },
    formatUserResponse: (question, response) => {
        let html = '<ul class="list-disc pl-4 m-0">';
        const responseObj = parseResponse(response, 'object') || {};
        Object.entries(responseObj).forEach(([key, value]) => {
            html += `<li class="response-item"><strong>${key}:</strong> ${value}</li>`;
        });
        html += '</ul>';
        return html;
    }
};

// Schema for validation, linting, and AI-assisted authoring
export const schema = {
    type: 'fill-in',
    description: 'Text input with fill-in-the-blank support',
    scormType: 'fill-in',
    example: `<div class="interaction fill-in fill-in-inline" data-interaction-id="demo-fi">
  <div class="fill-in-template">
    <p>The capital of France is <input type="text" class="fill-in-inline-input" placeholder="..." style="min-width:80px;"> and the capital of Japan is <input type="text" class="fill-in-inline-input" placeholder="..." style="min-width:80px;">.</p>
  </div>
  <div class="interaction-controls"><button class="btn btn-primary" disabled>Check Answer</button></div>
</div>`,
    properties: {
        blanks: {
            type: 'object',
            required: true,
            description: 'Map of blank IDs to their correct answers',
            valueSchema: {
                correct: { type: ['string', 'array'], required: true },
                typoTolerance: { type: 'number', default: 0 },
                hint: { type: 'string' }
            }
        },
        template: {
            type: 'string',
            description: 'HTML template with {{blankId}} placeholders (inline mode)'
        },
        caseSensitive: {
            type: 'boolean',
            default: false,
            description: 'Require exact case match'
        }
    },
    notes: 'Requires either template (inline) or just blanks (stacked mode)'
};

/**
 * Creates a fill-in-the-blank question with inline inputs
 * @param {Object} config - Configuration object
 * @param {string} config.id - Unique identifier
 * @param {string} config.template - Template string with {{blankId}} placeholders
 * @param {Object} config.blanks - Object mapping blankId to { correct, placeholder? }
 * @param {boolean} config.caseSensitive - Whether matching is case-sensitive (default: false)
 * @param {string} config.feedback - Optional hint text
 * @param {boolean} config.controlled - Whether to use controlled mode
 * @returns {Object} Question object with render, evaluate, checkAnswer, reset, getResponse, setResponse methods
 * 
 * @example
 * createFillInQuestion({
 *   id: 'capitals',
 *   template: 'The capital of {{country1}} is Paris and the capital of {{country2}} is Tokyo.',
 *   blanks: {
 *     country1: { correct: 'France', placeholder: 'country' },
 *     country2: { correct: 'Japan' }
 *   }
 * });
 */
export function createFillInQuestion(config) {
    // Custom validation for fill-in (supports both template and prompt modes)
    if (!config || typeof config !== 'object') {
        throw new Error('Interaction config must be an object');
    }
    if (!config.id || typeof config.id !== 'string') {
        throw new Error('Interaction must have a valid string id');
    }
    if (!config.blanks || typeof config.blanks !== 'object') {
        throw new Error(`Fill-in question "${config.id}" must have a blanks object`);
    }

    // Determine mode: inline (template) vs stacked (prompt)
    const isInlineMode = !!config.template;
    const isStackedMode = !!config.prompt && !config.template;

    if (!isInlineMode && !isStackedMode) {
        throw new Error(`Fill-in question "${config.id}" must have either a 'template' (inline mode) or 'prompt' (stacked mode)`);
    }

    const { id, template, prompt, blanks, feedback, caseSensitive = false, controlled = false } = config;

    // Validate blanks object
    if (!blanks || typeof blanks !== 'object' || Object.keys(blanks).length === 0) {
        throw new Error(`Fill-in question "${id}" must have at least one blank in the blanks object`);
    }

    let blankIds;

    if (isInlineMode) {
        // Validate that all template placeholders have corresponding blanks
        const placeholderRegex = /\{\{(\w+)\}\}/g;
        const placeholders = [...template.matchAll(placeholderRegex)].map(m => m[1]);

        if (placeholders.length === 0) {
            throw new Error(`Fill-in question "${id}" template must contain at least one {{blankId}} placeholder`);
        }

        placeholders.forEach(placeholder => {
            if (!blanks[placeholder]) {
                throw new Error(`Fill-in question "${id}" is missing blank definition for placeholder "{{${placeholder}}}"`);
            }
        });

        // Store blank IDs in order they appear in template
        blankIds = placeholders;
    } else {
        // Stacked mode: use blanks object keys in definition order
        blankIds = Object.keys(blanks);
    }

    let _container = null;

    const questionObj = {
        id,
        type: 'fill-in',
        blanks,
        blankIds,

        render: (container, initialResponse = null) => {
            validateContainer(container, id);
            _container = container;

            // Parse initial response as object
            const initialValues = normalizeInitialResponse(initialResponse);
            const initialObj = initialValues && typeof initialValues === 'object' ? initialValues : {};

            let html;

            if (isInlineMode) {
                // INLINE MODE: Replace {{placeholders}} with inputs in flowing text
                let templateHtml = template;

                blankIds.forEach((blankId, index) => {
                    const blank = blanks[blankId];
                    const inputName = `${id}_${blankId}`;
                    const initialValue = initialObj[inputName] || '';
                    const placeholder = blank.placeholder || '...';

                    // Calculate approximate width based on correct answer length (use first if array)
                    const correctLength = Array.isArray(blank.correct)
                        ? blank.correct[0].length
                        : blank.correct.length;
                    const minWidth = Math.max(60, Math.min(200, correctLength * 10 + 20));

                    const inputHtml = `<input
                        type="text"
                        class="fill-in-inline-input"
                        id="${id}_${blankId}"
                        name="${inputName}"
                        placeholder="${placeholder}"
                        value="${initialValue}"
                        data-blank-id="${blankId}"
                        data-case-sensitive="${caseSensitive}"
                        data-testid="${id}-blank-${index}"
                        style="min-width: ${minWidth}px;"
                        aria-label="${blankId}"
                    />`;

                    templateHtml = templateHtml.replace(`{{${blankId}}}`, inputHtml);
                });

                html = `
                    <div class="interaction fill-in fill-in-inline" data-interaction-id="${id}">
                        <div class="fill-in-template">
                            ${templateHtml}
                        </div>
                        ${renderInteractionControls(id, controlled, feedback ? [
                    `<button type="button" class="btn btn-info" data-action="show-hint" data-interaction="${id}">Show Hint</button>`
                ] : [])}
                        <div class="overall-feedback" id="${id}_overall_feedback" aria-live="polite"></div>
                    </div>
                `;
            } else {
                // STACKED MODE: Question prompt followed by stacked input fields
                let blanksHtml = '';

                blankIds.forEach((blankId, index) => {
                    const blank = blanks[blankId];
                    const inputName = `${id}_${blankId}`;
                    const initialValue = initialObj[inputName] || '';
                    const placeholder = blank.placeholder || '';
                    const label = blank.label; // Optional - only show if explicitly provided

                    blanksHtml += `
                        <div class="fill-in-item">
                            ${label ? `<label for="${id}_${blankId}">${label}</label>` : ''}
                            <input
                                type="text"
                                class="fill-in-stacked-input"
                                id="${id}_${blankId}"
                                name="${inputName}"
                                placeholder="${placeholder}"
                                value="${initialValue}"
                                data-blank-id="${blankId}"
                                data-case-sensitive="${caseSensitive}"
                                data-testid="${id}-blank-${index}"
                                aria-describedby="${id}_feedback_${index}"
                                ${label ? '' : `aria-label="${blankId}"`}
                            />
                            <div id="${id}_feedback_${index}" class="feedback" aria-live="polite"></div>
                        </div>
                    `;
                });

                html = `
                    <div class="interaction fill-in fill-in-stacked" data-interaction-id="${id}">
                        <div class="question-prompt">
                            <h3>${prompt}</h3>
                        </div>
                        <div class="fill-in-container">
                            ${blanksHtml}
                        </div>
                        ${renderInteractionControls(id, controlled, feedback ? [
                    `<button type="button" class="btn btn-info" data-action="show-hint" data-interaction="${id}">Show Hint</button>`
                ] : [])}
                        <div class="overall-feedback" id="${id}_overall_feedback" aria-live="polite"></div>
                    </div>
                `;
            }

            container.innerHTML = html;

            // Attach event handler only in uncontrolled mode
            if (!controlled) {
                const correctPattern = JSON.stringify(
                    Object.fromEntries(Object.entries(blanks).map(([k, v]) => [k, v.correct]))
                );

                container.addEventListener('click', createInteractionEventHandler(questionObj, {
                    ...config,
                    scormType: 'fill-in',
                    correctPattern
                }, {
                    'show-hint': () => questionObj.showHint()
                }));
            }
        },

        evaluate: (responses) => {
            if (!responses || typeof responses !== 'object') {
                return {
                    score: 0,
                    correct: false,
                    results: blankIds.map(blankId => ({
                        blankId,
                        response: '',
                        correct: false,
                        expected: blanks[blankId].correct
                    })),
                    response: JSON.stringify({}),
                    error: 'Invalid response format'
                };
            }

            let correctCount = 0;
            const results = blankIds.map(blankId => {
                const key = `${id}_${blankId}`;
                const response = responses[key] || '';
                const blank = blanks[blankId];
                const correctAnswers = blank.correct;
                const typoTolerance = blank.typoTolerance || 0;

                const isCorrect = matchesAnswer(response, correctAnswers, caseSensitive, typoTolerance);

                if (isCorrect) correctCount++;

                // For display, show first correct answer
                const displayAnswer = Array.isArray(correctAnswers) ? correctAnswers[0] : correctAnswers;
                return { blankId, response, correct: isCorrect, expected: displayAnswer };
            });

            return {
                score: correctCount / blankIds.length,
                correct: correctCount === blankIds.length,
                results,
                response: JSON.stringify(responses)
            };
        },

        checkAnswer: () => {
            validateContainer(_container, id);

            const inputs = _container.querySelectorAll('input[type="text"]');
            if (inputs.length === 0) {
                throw new Error(`No input elements found for fill-in question "${id}"`);
            }

            const responses = {};

            inputs.forEach(input => {
                responses[input.name] = input.value.trim();
                const blankId = input.dataset.blankId;
                const blank = blanks[blankId];
                const correctAnswers = blank.correct;
                const typoTolerance = blank.typoTolerance || 0;
                const isCaseSensitive = input.dataset.caseSensitive === 'true';

                const isCorrect = matchesAnswer(input.value, correctAnswers, isCaseSensitive, typoTolerance);

                if (isCorrect) {
                    input.classList.add('correct');
                    input.classList.remove('incorrect');
                } else {
                    input.classList.add('incorrect');
                    input.classList.remove('correct');
                }
            });

            const evaluation = questionObj.evaluate(responses);

            // Show overall feedback
            const overallFeedback = _container.querySelector('.overall-feedback');
            if (overallFeedback) {
                if (evaluation.correct) {
                    overallFeedback.innerHTML = '<div class="feedback correct">✓ All answers correct!</div>';
                } else {
                    const incorrectBlanks = evaluation.results
                        .filter(r => !r.correct)
                        .map(r => `<strong>${escapeHTML(r.blankId)}</strong>: "${escapeHTML(String(r.expected))}"`)
                        .join(', ');
                    overallFeedback.innerHTML = `<div class="feedback incorrect">✗ Incorrect. Expected: ${incorrectBlanks}</div>`;
                }
            }

            return evaluation;
        },

        reset: () => {
            validateContainer(_container, id);

            const inputs = _container.querySelectorAll('input[type="text"]');
            inputs.forEach(input => {
                input.value = '';
                input.classList.remove('correct', 'incorrect');
            });

            const overallFeedback = _container.querySelector('.overall-feedback');
            if (overallFeedback) {
                overallFeedback.innerHTML = '';
            }
        },

        showHint: () => {
            validateContainer(_container, id);

            if (!feedback) return;

            const overallFeedback = _container.querySelector('.overall-feedback');
            if (!overallFeedback) {
                throw new Error(`Overall feedback element not found for fill-in question "${id}"`);
            }

            overallFeedback.innerHTML = `<div class="hint">${escapeHTML(feedback)}</div>`;
        },

        setResponse: (response) => {
            validateContainer(_container, id);

            const responseObj = parseResponse(response, 'object');
            if (!responseObj) return;

            const inputs = _container.querySelectorAll('input[type="text"]');
            if (inputs.length === 0) {
                throw new Error(`No input elements found for fill-in question "${id}"`);
            }

            Object.keys(responseObj).forEach(name => {
                const input = _container.querySelector(`input[name="${CSS.escape(name)}"]`);
                if (input) {
                    input.value = responseObj[name];
                }
            });
        },

        getResponse: () => {
            // Return empty response if not yet rendered (for automation API compatibility)
            if (!_container) {
                const emptyResponse = {};
                blankIds.forEach(blankId => {
                    emptyResponse[`${id}_${blankId}`] = '';
                });
                return emptyResponse;
            }

            const responses = {};
            const inputs = _container.querySelectorAll('input[type="text"]');

            if (inputs.length === 0) {
                throw new Error(`No input elements found for fill-in question "${id}"`);
            }

            inputs.forEach(input => {
                responses[input.name] = input.value.trim();
            });

            return responses;
        },

        getCorrectAnswer: () => {
            return Object.fromEntries(
                Object.entries(blanks).map(([key, blank]) => [
                    `${id}_${key}`,
                    Array.isArray(blank.correct) ? blank.correct[0] : blank.correct
                ])
            );
        }
    };

    // For uncontrolled interactions, register with the central registry for lifecycle mgmt
    if (!controlled) {
        registerCoreInteraction(config, questionObj);
    }

    return questionObj;
}
