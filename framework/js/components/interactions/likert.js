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

// Metadata for likert interaction type
export const metadata = {
    creator: 'createLikertQuestion',
    scormType: 'likert',
    showCheckAnswer: true,
    isAnswered: (response) => {
        // Response is object { qId: value, ... }
        // Must have at least one answer? Or all?
        // Usually all questions in a likert group should be answered.
        if (!response || typeof response !== 'object') return false;
        return Object.keys(response).length > 0;
    },
    getCorrectAnswer: (config) => {
        return JSON.stringify(config.correctAnswers || {});
    },
    formatCorrectAnswer: (question, correctAnswer) => {
        // For surveys, there might be no correct answer
        if (!correctAnswer || Object.keys(correctAnswer).length === 0) {
            return '<p class="correct-item">No correct answer (Survey)</p>';
        }
        let html = '<ul class="list-disc pl-4 m-0">';
        const answers = typeof correctAnswer === 'string' ? JSON.parse(correctAnswer) : correctAnswer;

        Object.entries(answers).forEach(([qId, val]) => {
            const q = question.questions.find(q => q.id === qId);
            const s = question.scale.find(s => s.value === val);
            if (q && s) {
                html += `<li class="correct-item">${q.text}: <strong>${s.text}</strong></li>`;
            }
        });
        html += '</ul>';
        return html;
    },
    formatUserResponse: (question, response) => {
        let html = '<ul class="list-disc pl-4 m-0">';
        const answers = typeof response === 'string' ? JSON.parse(response) : response;

        Object.entries(answers).forEach(([qId, val]) => {
            const q = question.questions.find(q => q.id === qId);
            const s = question.scale.find(s => s.value === val);
            if (q) {
                html += `<li class="response-item">${q.text}: <strong>${s ? s.text : val}</strong></li>`;
            }
        });
        html += '</ul>';
        return html;
    }
};

// Schema for validation, linting, and AI-assisted authoring
export const schema = {
    type: 'likert',
    description: 'Likert scale survey with configurable rating points',
    scormType: 'likert',
    example: `<div class="interaction likert" data-interaction-id="demo-likert">
  <div class="question-prompt"><h3>Rate your experience</h3></div>
  <div class="likert-container">
    <table class="likert-table" role="presentation">
      <thead>
        <tr>
          <th class="likert-header-question">Statement</th>
          <th class="likert-header-option">Disagree</th>
          <th class="likert-header-option">Neutral</th>
          <th class="likert-header-option">Agree</th>
        </tr>
      </thead>
      <tbody>
        <tr class="likert-row even" role="radiogroup">
          <td class="likert-question-text">The content was clear</td>
          <td class="likert-option"><input type="radio" name="demo-q1" value="1"></td>
          <td class="likert-option"><input type="radio" name="demo-q1" value="2"></td>
          <td class="likert-option"><input type="radio" name="demo-q1" value="3" checked></td>
        </tr>
        <tr class="likert-row odd" role="radiogroup">
          <td class="likert-question-text">The pace was appropriate</td>
          <td class="likert-option"><input type="radio" name="demo-q2" value="1"></td>
          <td class="likert-option"><input type="radio" name="demo-q2" value="2" checked></td>
          <td class="likert-option"><input type="radio" name="demo-q2" value="3"></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>`,
    properties: {
        scale: {
            type: 'array',
            required: true,
            minItems: 2,
            description: 'Rating scale options',
            itemSchema: {
                value: { type: ['string', 'number'], required: true },
                text: { type: 'string', required: true }
            }
        },
        questions: {
            type: 'array',
            required: true,
            minItems: 1,
            description: 'Statements to rate',
            itemSchema: {
                id: { type: 'string', required: true },
                text: { type: 'string', required: true }
            }
        },
        correctAnswers: {
            type: 'object',
            description: 'Optional map of questionId to correct value (omit for survey mode)'
        }
    }
};

export function createLikertQuestion(config) {
    validateAgainstSchema(config, schema);

    const { id, prompt, scale, questions, correctAnswers, controlled = false } = config;

    // Validate scale and questions
    if (!Array.isArray(scale) || scale.length === 0) {
        throw new Error(`Likert question "${id}" must have at least one scale option`);
    }
    if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error(`Likert question "${id}" must have at least one question`);
    }

    let _container = null;

    const questionObj = {
        id,
        type: 'likert',

        render: (container, initialResponse = null) => {
            validateContainer(container, id);
            _container = container;

            // Parse initial response
            const initialValue = normalizeInitialResponse(initialResponse);
            const initialAnswers = typeof initialValue === 'object' ? initialValue : {};

            let html = `
                <div class="interaction likert" data-interaction-id="${id}">
                    <div class="question-prompt">
                        <h3>${prompt}</h3>
                    </div>
                    <div class="likert-container">
                        <table class="likert-table" role="presentation">
                            <thead>
                                <tr>
                                    <th class="likert-header-question">Statement</th>
            `;

            // Render scale headers
            scale.forEach(option => {
                html += `<th class="likert-header-option">${option.text}</th>`;
            });

            html += `
                                </tr>
                            </thead>
                            <tbody>
            `;

            // Render questions rows
            questions.forEach((q, qIndex) => {
                html += `
                    <tr class="likert-row ${qIndex % 2 === 0 ? 'even' : 'odd'}" role="radiogroup" aria-labelledby="q-label-${q.id}">
                        <td class="likert-question-text" id="q-label-${q.id}">${q.text}</td>
                `;

                scale.forEach(option => {
                    const isChecked = initialAnswers[q.id] === option.value;
                    const inputId = `likert-${id}-${q.id}-${option.value}`;

                    html += `
                        <td class="likert-option">
                            <label for="${inputId}" class="sr-only">${option.text}</label>
                            <input type="radio" 
                                   id="${inputId}" 
                                   name="likert-${id}-${q.id}" 
                                   value="${option.value}"
                                   data-question-id="${q.id}"
                                   ${isChecked ? 'checked' : ''}>
                        </td>
                    `;
                });

                html += '</tr>';
            });

            html += `
                            </tbody>
                        </table>
                    </div>
                    ${renderFeedbackContainer(id)}
                    ${renderInteractionControls(id, controlled)}
                </div>
            `;

            container.innerHTML = html;

            // Attach standard interaction handlers
            container.addEventListener('click', createInteractionEventHandler(questionObj, config));
        },

        getResponse: () => {
            const responses = {};
            if (_container) {
                const inputs = _container.querySelectorAll('input[type="radio"]:checked');
                inputs.forEach(input => {
                    responses[input.dataset.questionId] = input.value;
                });
            }
            return responses;
        },

        setResponse: (response) => {
            if (!response || typeof response !== 'object') return;
            // Re-render to reflect new state
            questionObj.render(_container, response);
        },

        evaluate: (response) => {
            const responses = response && typeof response === 'object' ? response : {};
            const answeredCount = Object.keys(responses).length;
            const totalQuestions = questions.length;

            let isCorrect = true;
            let score = 0;

            // If correctAnswers provided, grade it
            if (correctAnswers) {
                let correctCount = 0;
                Object.entries(correctAnswers).forEach(([qId, correctVal]) => {
                    if (responses[qId] !== correctVal) {
                        isCorrect = false;
                    } else {
                        correctCount++;
                    }
                });
                score = totalQuestions > 0 ? correctCount / totalQuestions : 0;
            } else {
                // Survey mode: always correct if answered (or just 'completed')
                isCorrect = true;
                score = 1;
            }

            return {
                correct: isCorrect,
                score: score,
                response: responses,
                answeredCount,
                totalQuestions
            };
        },

        checkAnswer: () => {
            // Gather responses from DOM
            const responses = questionObj.getResponse();
            const evaluation = questionObj.evaluate(responses);

            const feedbackMsg = evaluation.correct
                ? (config.feedback?.correct || 'Thank you for your feedback.')
                : (config.feedback?.incorrect || 'Please review your answers.');

            displayFeedback(_container, id, feedbackMsg, evaluation.correct ? 'correct' : 'incorrect');
            return { ...evaluation, feedback: feedbackMsg };
        },

        reset: () => {
            clearFeedback(_container, id);
            const inputs = _container.querySelectorAll('input[type="radio"]');
            inputs.forEach(input => input.checked = false);
        },

        showHint: () => {
            // Not applicable for Likert usually
        },

        getCorrectAnswer: () => {
            return correctAnswers ? { ...correctAnswers } : null;
        }
    };

    // For uncontrolled interactions, register with the central registry for lifecycle mgmt
    if (!controlled) {
        registerCoreInteraction(config, questionObj);
    }

    return questionObj;
}
