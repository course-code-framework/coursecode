import {
    validateAgainstSchema,
    createInteractionEventHandler,
    renderInteractionControls,
    renderFeedbackContainer,
    displayFeedback,
    clearFeedback,
    normalizeInitialResponse,
    validateContainer,
    registerCoreInteraction
} from './interaction-base.js';
import engagementManager from '../../engagement/engagement-manager.js';
import * as NavigationState from '../../navigation/NavigationState.js';

// Metadata for true-false interaction type
export const metadata = {
    creator: 'createTrueFalseQuestion',
    scormType: 'true-false',
    showCheckAnswer: true,
    isAnswered: (response) => {
        return response !== null && response !== undefined;
    },
    getCorrectAnswer: (config) => config.correctAnswer.toString(),
    formatCorrectAnswer: (question, correctAnswer) => `<p class="correct-item">${correctAnswer}</p>`,
    formatUserResponse: (question, response) => `<p class="response-item">${response}</p>`
};

// Schema for validation, linting, and AI-assisted authoring
export const schema = {
    type: 'true-false',
    description: 'Binary true/false question with radio buttons',
    scormType: 'true-false',
    example: `<div class="interaction true-false" data-interaction-id="demo-tf">
  <div class="question-prompt text-center"><h3>The Earth revolves around the Sun.</h3></div>
  <div class="true-false-options">
    <label><input type="radio" name="demo-tf" value="true"> <span class="tf-label">True</span></label>
    <label><input type="radio" name="demo-tf" value="false"> <span class="tf-label">False</span></label>
  </div>
  <div class="interaction-controls"><button class="btn btn-primary" disabled>Check Answer</button></div>
</div>`,
    properties: {
        correctAnswer: {
            type: 'boolean',
            required: true,
            description: 'The correct answer (true or false)'
        },
        autoCheck: {
            type: 'boolean',
            default: false,
            description: 'Auto-evaluate on selection'
        }
    }
};

export function createTrueFalseQuestion(config) {
    // Validate config on creation
    validateAgainstSchema(config, schema);

    const { id, prompt, correctAnswer, controlled = false, autoCheck = false, feedback = {} } = config;

    let _container = null;

    const questionObj = {
        id,
        type: 'true-false',

        render: (container, initialResponse = null) => {
            validateContainer(container, id);
            _container = container;

            const initialValue = normalizeInitialResponse(initialResponse);

            const html = `
                <div class="interaction true-false" data-interaction-id="${id}">
                    <div class="question-prompt text-center">
                        <h3>${prompt}</h3>
                    </div>
                    <div class="true-false-options">
                        <label>
                            <input type="radio" name="${id}_choice" value="true" ${initialValue === 'true' ? 'checked' : ''} data-testid="${id}-choice-true">
                            <span class="tf-label">True</span>
                        </label>
                        <label>
                            <input type="radio" name="${id}_choice" value="false" ${initialValue === 'false' ? 'checked' : ''} data-testid="${id}-choice-false">
                            <span class="tf-label">False</span>
                        </label>
                    </div>
                    ${autoCheck ? '' : renderInteractionControls(id, controlled)}
                    ${renderFeedbackContainer(id)}
                </div>
            `;

            container.innerHTML = html;

            // Attach event handler only in uncontrolled mode
            if (!controlled) {
                container.addEventListener('click', createInteractionEventHandler(questionObj, {
                    ...config,
                    scormType: 'true-false',
                    correctPattern: correctAnswer.toString()
                }));
            }

            // Auto-check on radio selection if enabled
            if (autoCheck && !controlled) {
                const radios = container.querySelectorAll(`input[name="${id}_choice"]`);
                radios.forEach(radio => {
                    radio.addEventListener('change', () => {
                        const evaluation = questionObj.checkAnswer();

                        // Track engagement when autoCheck triggers evaluation
                        if (evaluation) {
                            const currentSlideId = NavigationState.getCurrentSlideId();
                            if (currentSlideId) {
                                engagementManager.trackInteraction(
                                    currentSlideId,
                                    id,
                                    true, // completed
                                    evaluation.correct
                                );
                            }
                        }

                        if (evaluation && !evaluation.correct) {
                            // Flash incorrect feedback, then reset after 2 seconds
                            setTimeout(() => {
                                questionObj.reset();
                            }, 2000);
                        }
                        // Correct answers stay green (don't reset)
                    });
                });
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

            const correct = response === correctAnswer.toString();
            return {
                score: correct ? 1 : 0,
                correct,
                response
            };
        },

        checkAnswer: () => {
            validateContainer(_container, id);

            const selected = _container.querySelector(`input[name="${id}_choice"]:checked`);

            if (!selected) {
                displayFeedback(_container, id, 'Please select an answer.', 'error');
                return null;
            }

            const response = selected.value;
            const evaluation = questionObj.evaluate(response);

            // Get the selected label for visual feedback
            const selectedLabel = selected.closest('label');

            if (evaluation.correct) {
                const message = feedback.correct || `Correct! The answer is ${correctAnswer}.`;
                displayFeedback(_container, id, message, 'correct');
                if (selectedLabel) {
                    selectedLabel.classList.add('answer-correct');
                    selectedLabel.classList.remove('answer-incorrect');
                }
            } else {
                const message = feedback.incorrect || `Incorrect. The correct answer is ${correctAnswer}.`;
                displayFeedback(_container, id, message, 'incorrect');
                if (selectedLabel) {
                    selectedLabel.classList.add('answer-incorrect');
                    selectedLabel.classList.remove('answer-correct');
                }
            }

            return evaluation;
        },

        reset: () => {
            validateContainer(_container, id);

            const radios = _container.querySelectorAll(`input[name="${id}_choice"]`);
            const labels = _container.querySelectorAll('.true-false-options label');

            radios.forEach(radio => {
                radio.checked = false;
            });

            // Clear answer state classes from labels
            labels.forEach(label => {
                label.classList.remove('answer-correct', 'answer-incorrect');
            });

            clearFeedback(_container, id);
        },

        setResponse: (response) => {
            validateContainer(_container, id);

            if (response === null || response === undefined) {
                return;
            }

            const radio = _container.querySelector(`input[name="${id}_choice"][value="${response}"]`);
            if (!radio) {
                throw new Error(`Invalid response value "${response}" for true-false question "${id}". Must be "true" or "false".`);
            }

            radio.checked = true;
        },

        getResponse: () => {
            validateContainer(_container, id);

            const selected = _container.querySelector(`input[name="${id}_choice"]:checked`);
            return selected ? selected.value : null;
        },

        getCorrectAnswer: () => {
            return correctAnswer.toString();
        }
    };

    // For uncontrolled interactions, register with the central registry for lifecycle mgmt
    if (!controlled) {
        registerCoreInteraction(config, questionObj);
    }

    return questionObj;
}

