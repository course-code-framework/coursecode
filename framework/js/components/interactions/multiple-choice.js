import AccessibilityManager from '../../managers/accessibility-manager.js';
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

// Metadata for multiple-choice interaction type
export const metadata = {
    creator: 'createMultipleChoiceQuestion',
    scormType: 'choice',
    showCheckAnswer: true,
    isAnswered: (response) => {
        return Array.isArray(response) && response.length > 0;
    },
    getCorrectAnswer: (config) => {
        if (config.multiple) {
            return JSON.stringify(config.choices.filter(c => c.correct).map(c => c.value));
        }
        return config.correctAnswer || '';
    },
    formatCorrectAnswer: (question, correctAnswer) => {
        let html = '<ul class="list-disc pl-4 m-0">';
        const correctAnswers = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
        const choices = question.choices || [];

        correctAnswers.forEach(answer => {
            const choice = choices.find(c => c.value === answer || c.correct);
            if (choice) {
                html += `<li class="correct-item">${choice.text}</li>`;
            } else {
                html += `<li class="correct-item">${answer}</li>`;
            }
        });
        html += '</ul>';
        return html;
    },
    formatUserResponse: (question, response) => {
        let html = '<ul class="list-disc pl-4 m-0">';
        const userAnswers = Array.isArray(response) ? response : [response];
        const choices = question.choices || [];

        userAnswers.forEach(answer => {
            const choice = choices.find(c => c.value === answer);
            if (choice) {
                html += `<li class="response-item">${choice.text}</li>`;
            } else {
                html += `<li class="response-item">${answer}</li>`;
            }
        });
        html += '</ul>';
        return html;
    }
};

// Schema for validation, linting, and AI-assisted authoring
export const schema = {
    type: 'multiple-choice',
    description: 'Single or multi-select question with radio buttons or checkboxes',
    scormType: 'choice',
    example: `<div class="interaction multiple-choice" data-interaction-id="demo-mc">
  <div class="question-prompt"><h3>Which planet is closest to the Sun?</h3></div>
  <div class="radio-group">
    <label class="radio-option"><input type="radio" name="demo-mc" value="a"> <span class="radio-custom"></span><div class="radio-label"><span>Venus</span></div></label>
    <label class="radio-option"><input type="radio" name="demo-mc" value="b"> <span class="radio-custom"></span><div class="radio-label"><span>Mercury</span></div></label>
    <label class="radio-option"><input type="radio" name="demo-mc" value="c"> <span class="radio-custom"></span><div class="radio-label"><span>Mars</span></div></label>
  </div>
  <div class="interaction-controls"><button class="btn btn-primary" disabled>Check Answer</button></div>
</div>`,
    properties: {
        choices: {
            type: 'array',
            required: true,
            minItems: 2,
            description: 'Array of choice options',
            itemSchema: {
                value: { type: 'string', required: true },
                text: { type: 'string', required: true },
                correct: { type: 'boolean', description: 'For multi-select mode' },
                description: { type: 'string' }
            }
        },
        correctAnswer: {
            type: 'string',
            requiredUnless: 'multiple',
            description: 'Value of correct choice (single-select mode)'
        },
        multiple: {
            type: 'boolean',
            default: false,
            description: 'Enable multi-select mode'
        }
    }
};

export function createMultipleChoiceQuestion(config) {
    validateAgainstSchema(config, schema);

    const { id, prompt, choices, correctAnswer, multiple = false, controlled = false } = config;

    // Validate choices array
    if (!Array.isArray(choices) || choices.length === 0) {
        throw new Error(`Multiple choice question "${id}" must have at least one choice`);
    }

    // Validate correctAnswer for single-select mode
    if (!multiple && !correctAnswer) {
        throw new Error(`Single-select multiple choice question "${id}" must have correctAnswer defined`);
    }

    let _container = null;

    const questionObj = {
        id,
        type: multiple ? 'multiple-choice-multiple' : 'multiple-choice-single',

        render: (container, initialResponse = null) => {
            validateContainer(container, id);
            _container = container;

            // Normalize initial response to array format
            const initialValue = normalizeInitialResponse(initialResponse);
            const initialValues = Array.isArray(initialValue) ? initialValue :
                (initialValue ? [initialValue] : []);

            let html = `
                <div class="interaction multiple-choice" data-interaction-id="${id}">
                    <div class="question-prompt">
                        <h3>${prompt}</h3>
                    </div>
                    <div class="${multiple ? 'checkbox-group' : 'radio-group'}">
            `;

            choices.forEach((choice, index) => {
                const inputType = multiple ? 'checkbox' : 'radio';
                const choiceId = `${id}_choice_${index}`;
                const optionClass = multiple ? 'checkbox-option' : 'radio-option';
                const customClass = multiple ? 'checkbox-custom' : 'radio-custom';
                const labelClass = multiple ? 'checkbox-label' : 'radio-label';
                const isChecked = initialValues.includes(choice.value);

                html += `
                    <label class="${optionClass}" role="option" aria-selected="${isChecked}">
                        <input
                          type="${inputType}"
                          id="${choiceId}"
                          name="${id}_choice"
                          value="${choice.value}"
                          ${choice.correct ? 'data-correct="true"' : ''}
                          ${isChecked ? 'checked' : ''}
                          aria-describedby="${id}_feedback ${choiceId}_description"
                          aria-label="${choice.text}"
                          tabindex="0"
                          data-testid="${id}-choice-${index}"
                        />
                        <span class="${customClass}"></span>
                        <div class="${labelClass}">
                          <span data-editable-choice data-edit-for-interaction="${id}" data-choice-index="${index}">${choice.text}</span>
                          ${choice.description ? `<div id="${choiceId}_description" class="radio-description">${choice.description}</div>` : ''}
                        </div>
                    </label>
                `;
            });

            html += `
                    </div>
                    ${renderInteractionControls(id, controlled)}
                    ${renderFeedbackContainer(id)}
                </div>
            `;

            container.innerHTML = html;

            // Setup ARIA state management and keyboard navigation
            setupAccessibility(container, questionObj);

            // Attach event handler only in uncontrolled mode
            if (!controlled) {
                const correctPattern = multiple
                    ? JSON.stringify(choices.filter(c => c.correct).map(c => c.value))
                    : correctAnswer;

                container.addEventListener('click', createInteractionEventHandler(questionObj, {
                    ...config,
                    scormType: 'choice',
                    correctPattern
                }));
            }
        },

        evaluate: (selectedValues) => {
            if (!selectedValues || !Array.isArray(selectedValues) || selectedValues.length === 0) {
                const _correctValues = multiple ? choices.filter(c => c.correct).map(c => c.value) : [correctAnswer];
                return {
                    score: 0,
                    correct: false,
                    response: multiple ? JSON.stringify([]) : '',
                    error: 'No answer selected'
                };
            }

            if (multiple) {
                const correctValues = choices.filter(c => c.correct).map(c => c.value);
                const allCorrect = correctValues.every(v => selectedValues.includes(v)) &&
                    selectedValues.every(v => correctValues.includes(v));
                const score = allCorrect ? 1 : (selectedValues.filter(v => correctValues.includes(v)).length / correctValues.length);

                return {
                    score,
                    correct: allCorrect,
                    response: JSON.stringify(selectedValues)
                };
            } else {
                const isCorrect = selectedValues.length === 1 && selectedValues[0] === correctAnswer;
                return {
                    score: isCorrect ? 1 : 0,
                    correct: isCorrect,
                    response: selectedValues[0] || ''
                };
            }
        },

        checkAnswer: () => {
            validateContainer(_container, id);

            const inputs = _container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
            const selectedValues = Array.from(inputs)
                .filter(input => input.checked)
                .map(input => input.value);

            if (selectedValues.length === 0) {
                const errorMsg = 'Please select an answer before checking.';
                displayFeedback(_container, id, errorMsg, 'error');
                AccessibilityManager.announce(errorMsg, 'assertive');
                return null;
            }

            const evaluation = questionObj.evaluate(selectedValues);

            if (evaluation.correct) {
                const successMsg = 'Correct! Well done.';
                displayFeedback(_container, id, successMsg, 'correct');
                AccessibilityManager.announce(successMsg);
            } else {
                const selectedText = selectedValues.map(value =>
                    choices.find(c => c.value === value)?.text || value
                ).join(', ');

                const expectedText = multiple
                    ? choices.filter(c => c.correct).map(c => c.text).join(', ')
                    : (choices.find(c => c.value === correctAnswer)?.text || correctAnswer);

                const errorMsg = `Incorrect. You selected: ${selectedText}. Expected: ${expectedText}`;
                displayFeedback(_container, id, errorMsg, 'incorrect');
                AccessibilityManager.announce(errorMsg);
            }

            return evaluation;
        },

        reset: () => {
            validateContainer(_container, id);

            const inputs = _container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
            const choiceItems = _container.querySelectorAll('.radio-option, .checkbox-option');

            inputs.forEach(input => {
                input.checked = false;
                input.setAttribute('aria-checked', 'false');
            });

            choiceItems.forEach(item => {
                item.setAttribute('aria-selected', 'false');
                item.classList.remove('selected');
            });

            clearFeedback(_container, id);
            AccessibilityManager.announce('Question reset. All selections cleared.');
        },

        setResponse: (response) => {
            validateContainer(_container, id);

            // Normalize response to array
            const responseArray = Array.isArray(response) ? response : (response ? [response] : []);

            const inputs = _container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
            if (inputs.length === 0) {
                throw new Error(`No input elements found for multiple choice question "${id}"`);
            }

            inputs.forEach(input => {
                input.checked = responseArray.includes(input.value);
            });

            updateAriaStates(_container);
        },

        getResponse: () => {
            validateContainer(_container, id);

            const selectedInputs = _container.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked');
            return Array.from(selectedInputs).map(input => input.value);
        },

        getCorrectAnswer: () => {
            if (multiple) {
                return choices.filter(c => c.correct).map(c => c.value);
            }
            return correctAnswer;
        }
    };

    // For uncontrolled interactions, register with the central registry for lifecycle mgmt
    if (!controlled) {
        registerCoreInteraction(config, questionObj);
    }

    return questionObj;
}

/**
 * Updates ARIA states for all choice items based on input checked state
 */
function updateAriaStates(container) {
    const choiceItems = container.querySelectorAll('.radio-option, .checkbox-option');

    choiceItems.forEach(item => {
        const input = item.querySelector('input');
        if (!input) return;

        const isSelected = input.checked;
        item.setAttribute('aria-selected', isSelected.toString());

        if (isSelected) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

/**
 * Sets up accessibility features including ARIA state management and keyboard navigation
 */
function setupAccessibility(container, questionObj) {
    const inputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');

    inputs.forEach(input => {
        // Update ARIA states on change
        input.addEventListener('change', () => updateAriaStates(container));

        // Enhanced keyboard support
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (questionObj.type === 'multiple-choice-multiple') {
                    input.checked = !input.checked;
                } else {
                    input.checked = true;
                }
                updateAriaStates(container);
                input.dispatchEvent(new Event('change'));
            }
        });
    });

    // Initialize ARIA states
    updateAriaStates(container);
}

