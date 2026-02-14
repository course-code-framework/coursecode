import {
    validateAgainstSchema,
    createInteractionEventHandler,
    renderInteractionControls,
    displayFeedback,
    clearFeedback,
    normalizeInitialResponse,
    validateContainer,
    registerCoreInteraction
} from './interaction-base.js';

// Metadata for numeric interaction type
export const metadata = {
    creator: 'createNumericQuestion',
    scormType: 'numeric',
    showCheckAnswer: true,
    isAnswered: (response) => {
        return response !== null && response !== undefined && String(response).trim().length > 0;
    },
    getCorrectAnswer: (config) => JSON.stringify(config.correctRange || {}),
    formatCorrectAnswer: (question, correctAnswer) => {
        let html = '';
        if (question.correctRange) {
            if (question.correctRange.exact !== undefined) {
                html += `<p class="correct-item">${question.correctRange.exact}</p>`;
            } else if (question.correctRange.min !== undefined && question.correctRange.max !== undefined) {
                html += `<p class="correct-item">${question.correctRange.min} - ${question.correctRange.max}</p>`;
            }
        } else {
            html += `<p class="correct-item">${correctAnswer}</p>`;
        }
        return html;
    },
    formatUserResponse: (question, response) => `<p class="response-item">${response}</p>`
};

// Schema for validation, linting, and AI-assisted authoring
export const schema = {
    type: 'numeric',
    description: 'Numeric input with exact or range-based validation',
    scormType: 'numeric',
    example: `<div class="interaction numeric fill-in-stacked" data-interaction-id="demo-num">
  <div class="question-prompt"><h3>What year was the xAPI specification released?</h3></div>
  <div class="fill-in-container">
    <div class="fill-in-item">
      <div class="numeric-input-wrapper">
        <input type="number" class="fill-in-stacked-input" placeholder="Enter a number..." step="any">
      </div>
    </div>
  </div>
  <div class="interaction-controls"><button class="btn btn-primary" disabled>Check Answer</button></div>
</div>`,
    properties: {
        correctRange: {
            type: 'object',
            required: true,
            description: 'Correct answer spec (exact value OR min/max range)',
            valueSchema: {
                exact: { type: 'number' },
                min: { type: 'number' },
                max: { type: 'number' }
            }
        },
        tolerance: {
            type: 'number',
            default: 0,
            description: 'Acceptable margin for exact values'
        },
        units: {
            type: 'string',
            description: 'Display units (e.g., "km", "%")'
        }
    },
    notes: 'correctRange requires either "exact" or both "min" and "max"'
};

export function createNumericQuestion(config) {
    validateAgainstSchema(config, schema);

    const { id, prompt, correctRange, units = '', tolerance = 0, placeholder = '', controlled = false } = config;

    let _container = null;

    const questionObj = {
        id,
        type: 'numeric',

        render: (container, initialResponse = null) => {
            validateContainer(container, id);
            _container = container;

            const initialValue = normalizeInitialResponse(initialResponse) ?? '';

            const html = `
                <div class="interaction numeric fill-in-stacked" data-interaction-id="${id}">
                    <div class="question-prompt">
                        <h3>${prompt}</h3>
                    </div>
                    <div class="fill-in-container">
                        <div class="fill-in-item">
                            <div class="numeric-input-wrapper">
                                <input
                                    type="number"
                                    class="fill-in-stacked-input"
                                    id="${id}_input"
                                    name="${id}_input"
                                    step="any"
                                    value="${initialValue}"
                                    placeholder="${placeholder}"
                                    aria-describedby="${id}_feedback"
                                    aria-label="${prompt}"
                                    ${correctRange.min !== undefined ? `min="${correctRange.min}"` : ''}
                                    ${correctRange.max !== undefined ? `max="${correctRange.max}"` : ''}
                                    data-testid="${id}-input"
                                />
                                ${units ? `<span class="units">${units}</span>` : ''}
                            </div>
                            <div id="${id}_feedback" class="feedback" aria-live="polite"></div>
                        </div>
                    </div>
                    ${renderInteractionControls(id, controlled)}
                    <div class="overall-feedback" id="${id}_overall_feedback" aria-live="polite"></div>
                </div>
            `;

            container.innerHTML = html;

            // Setup Enter key handling
            const input = container.querySelector('input[type="number"]');
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    questionObj.checkAnswer();
                }
            });

            // Attach event handler only in uncontrolled mode
            if (!controlled) {
                container.addEventListener('click', createInteractionEventHandler(questionObj, {
                    ...config,
                    scormType: 'numeric',
                    correctPattern: JSON.stringify(correctRange)
                }));
            }
        },

        evaluate: (response) => {
            if (response === null || response === undefined || response === '') {
                return {
                    score: 0,
                    correct: false,
                    response: '',
                    error: 'No answer provided'
                };
            }

            const value = parseFloat(response);
            if (isNaN(value)) {
                return {
                    score: 0,
                    correct: false,
                    response,
                    error: 'Invalid numeric value'
                };
            }

            let correct = false;

            if (correctRange.exact !== undefined) {
                correct = Math.abs(value - correctRange.exact) <= tolerance;
            } else if (correctRange.min !== undefined && correctRange.max !== undefined) {
                correct = value >= correctRange.min && value <= correctRange.max;
            } else if (correctRange.min !== undefined) {
                correct = value >= correctRange.min;
            } else if (correctRange.max !== undefined) {
                correct = value <= correctRange.max;
            }

            return {
                score: correct ? 1 : 0,
                correct,
                response,
                value
            };
        },

        checkAnswer: () => {
            validateContainer(_container, id);

            const input = _container.querySelector('input[type="number"]');
            if (!input) {
                throw new Error(`Input element not found for numeric question "${id}"`);
            }

            const response = input.value.trim();

            if (response === '') {
                displayFeedback(_container, id, 'Please enter a number.', 'error');
                return null;
            }

            const evaluation = questionObj.evaluate(response);

            if (evaluation.correct) {
                displayFeedback(_container, id, `Correct! ${evaluation.value}${units}`, 'correct');
            } else {
                let expectedText = '';
                if (correctRange.exact !== undefined) {
                    expectedText = `Expected: ${correctRange.exact}${units}`;
                } else if (correctRange.min !== undefined && correctRange.max !== undefined) {
                    expectedText = `Expected: between ${correctRange.min} and ${correctRange.max}${units}`;
                } else if (correctRange.min !== undefined) {
                    expectedText = `Expected: at least ${correctRange.min}${units}`;
                } else if (correctRange.max !== undefined) {
                    expectedText = `Expected: at most ${correctRange.max}${units}`;
                }
                displayFeedback(_container, id, `Incorrect. ${expectedText}`, 'incorrect');
            }

            return evaluation;
        },

        reset: () => {
            validateContainer(_container, id);

            const input = _container.querySelector('input[type="number"]');
            if (input) {
                input.value = '';
            }

            clearFeedback(_container, id);
        },

        setResponse: (response) => {
            validateContainer(_container, id);

            if (response === null || response === undefined) {
                return;
            }

            const input = _container.querySelector('input[type="number"]');
            if (!input) {
                throw new Error(`Input element not found for numeric question "${id}"`);
            }

            input.value = response;
        },

        getResponse: () => {
            validateContainer(_container, id);

            const input = _container.querySelector('input[type="number"]');
            if (!input) {
                throw new Error(`Input element not found for numeric question "${id}"`);
            }

            return input.value || null;
        },

        getCorrectAnswer: () => {
            return correctRange;
        }
    };

    // For uncontrolled interactions, register with the central registry for lifecycle mgmt
    if (!controlled) {
        registerCoreInteraction(config, questionObj);
    }

    return questionObj;
}
