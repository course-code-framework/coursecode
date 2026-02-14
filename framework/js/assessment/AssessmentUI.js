/**
 * AssessmentUI - Manages all DOM interactions for an assessment.
 *
 * This module is responsible for rendering all views of the assessment,
 * including the intro screen, questions, review screen, and results. It uses
 * the ViewManager to efficiently switch between these views without re-rendering
 * the entire DOM.
 */

import { createViewManager } from '../utilities/view-manager.js';
import { iconManager } from '../utilities/icons.js';
import * as Modal from '../components/ui-components/modal.js';
import { logger } from '../utilities/logger.js';

/**
 * Shows a modal when there are unanswered questions and submission is attempted.
 * Modal behavior adapts based on whether submission is allowed:
 * - If blocked: Shows informational message with only "Go Back" button
 * - If allowed: Shows confirmation with "Go Back" and "Submit Anyway" buttons
 * 
 * @param {Array<number>} unansweredIndices - Array of 0-based question indices that are unanswered
 * @param {boolean} allowSubmission - Whether submission with unanswered questions is allowed
 * @param {Function} onConfirm - Callback to execute if user confirms submission (only called if allowSubmission is true)
 * @returns {void}
 */
function showUnansweredModal(unansweredIndices, allowSubmission, onConfirm) {
    const count = unansweredIndices.length;
    const questionText = count === 1 ? 'question' : 'questions';
    const questionNumbers = unansweredIndices.map(i => i + 1).join(', ');

    let clickHandler = null;

    // Adapt modal content based on whether submission is allowed
    const modalConfig = allowSubmission ? {
        // Confirmation mode: User can choose to submit with unanswered questions
        title: 'Unanswered Questions',
        body: `
            <p class="mb-3">You have <strong>${count} unanswered ${questionText}</strong> (${questionNumbers}).</p>
            <p class="mb-3">Unanswered questions will be marked as incorrect.</p>
            <p class="font-bold">Do you want to submit anyway?</p>
        `,
        footer: `
            <button class="btn btn-secondary" data-action="dismiss-unanswered-modal" data-testid="modal-unanswered-cancel">Go Back</button>
            <button class="btn btn-primary" data-action="confirm-unanswered-submit" data-testid="modal-unanswered-confirm">Submit Anyway</button>
        `
    } : {
        // Blocked mode: Submission not allowed, must answer all questions
        title: 'All Questions Required',
        body: `
            <p class="mb-3">You must answer all questions before submitting.</p>
            <p class="mb-3">You have <strong>${count} unanswered ${questionText}</strong> (${questionNumbers}).</p>
            <p class="font-bold">Please go back and complete all questions.</p>
        `,
        footer: `
            <button class="btn btn-primary" data-action="dismiss-unanswered-modal" data-testid="modal-unanswered-dismiss">Go Back</button>
        `
    };

    // Show modal using singleton API
    Modal.show({
        ...modalConfig,
        config: {
            closeOnBackdrop: true,
            closeOnEscape: true,
        },
        onOpen: () => {
            // Set up click handler after modal is rendered
            const modalElement = document.getElementById('global-modal');
            if (!modalElement) return;

            clickHandler = (event) => {
                const target = event.target.closest('[data-action]');
                if (!target) return;

                const action = target.dataset.action;

                if (action === 'confirm-unanswered-submit' && allowSubmission) {
                    Modal.hide();
                    onConfirm();
                } else if (action === 'dismiss-unanswered-modal') {
                    Modal.hide();
                }
            };

            modalElement.addEventListener('click', clickHandler);
        },
        onClose: () => {
            // Cleanup listener when modal closes
            const modalElement = document.getElementById('global-modal');
            if (modalElement && clickHandler) {
                modalElement.removeEventListener('click', clickHandler);
            }
        }
    });
}

export function createAssessmentUI(config, stateManager, questionInstances) {
    // FAIL FAST validation of critical parameters
    if (!config || !config.id) {
        throw new Error('[AssessmentUI] config with id is required');
    }

    const { settings, review, resultsDisplay } = config;

    function renderIntroScreen() {
        const summary = stateManager.getSummary();
        // Summary should always exist after Factory initialization
        const currentAttempts = summary?.attempts || 0;
        const attemptsBeforeRemedial = settings.attemptsBeforeRemedial;
        const attemptsBeforeRestart = settings.attemptsBeforeRestart;

        let attemptsInfo = '';
        if (currentAttempts > 0) {
            if (attemptsBeforeRestart && currentAttempts >= attemptsBeforeRestart) {
                // Already at restart threshold - shouldn't reach here normally
                attemptsInfo = ` | <strong>Attempts:</strong> ${currentAttempts} (course retake is required)`;
            } else if (attemptsBeforeRemedial && currentAttempts >= attemptsBeforeRemedial) {
                // In remedial phase
                if (attemptsBeforeRestart) {
                    const remainingBeforeRestart = attemptsBeforeRestart - currentAttempts;
                    attemptsInfo = ` | <strong>Attempts:</strong> ${currentAttempts} (${remainingBeforeRestart} before a course retake will be required)`;
                } else {
                    attemptsInfo = ` | <strong>Attempts:</strong> ${currentAttempts}`;
                }
            } else if (attemptsBeforeRemedial) {
                // Before remedial threshold
                const remainingBeforeRemedial = attemptsBeforeRemedial - currentAttempts;
                attemptsInfo = ` | <strong>Attempts:</strong> ${currentAttempts} (${remainingBeforeRemedial} before additional review will be required)`;
            } else if (attemptsBeforeRestart) {
                // Only restart configured, no remedial
                const remainingBeforeRestart = attemptsBeforeRestart - currentAttempts;
                attemptsInfo = ` | <strong>Attempts:</strong> ${currentAttempts} (${remainingBeforeRestart} before a course retake will be required)`;
            } else {
                // No limits configured
                attemptsInfo = ` | <strong>Attempts:</strong> ${currentAttempts}`;
            }
        }

        const introEl = document.createElement('div');
        introEl.className = 'content-medium stack-lg pt-6';
        // Optional icon displayed before title
        const iconHtml = config.icon
            ? `<span class="mr-2" style="display: inline-flex; align-items: center;" aria-hidden="true">${iconManager.getIcon(config.icon, { size: 'xl' })}</span>`
            : '';
        // Optional HTML description displayed below title
        const descriptionHtml = config.description
            ? `<div class="text-muted">${config.description}</div>`
            : '';

        introEl.innerHTML = `
        <div class="card no-hover text-center stack-md">
            <h1 class="text-2xl font-bold flex items-center justify-center">${iconHtml}${config.title || 'Assessment'}</h1>
            ${descriptionHtml}
            <div class="bg-gray-50 border rounded p-4 text-sm">
                <p class="m-0"><strong>Questions:</strong> ${config.questions.length} | <strong>Passing Score:</strong> ${settings.passingScore}%${attemptsInfo}</p>
            </div>
            <div class="flex justify-center">
                <button data-action="start" class="btn btn-primary btn-lg" data-testid="assessment-start">Start Assessment</button>
            </div>
        </div>
    `;
        return introEl;
    }

    function renderQuestion() {
        const questionIndex = stateManager.getCurrentQuestionIndex();
        const questionInstance = questionInstances[questionIndex];

        if (!questionInstance) {
            const errorMessage = `[AssessmentUI:${config.id}] Question instance not found for index ${questionIndex} (assessment has ${questionInstances.length} questions)`;
            logger.error(errorMessage, { domain: 'assessment', operation: 'renderQuestion', assessmentId: config.id, questionIndex });
            throw new Error(errorMessage);
        }

        const questionEl = document.createElement('div');
        questionEl.className = 'content-medium';

        // Create card wrapper for consistent styling
        const cardWrapper = document.createElement('div');
        cardWrapper.className = 'card no-hover stack-md';

        // Add title
        const titleEl = document.createElement('h1');
        titleEl.className = 'text-xl font-bold m-0';
        titleEl.textContent = config.title || 'Assessment';
        cardWrapper.appendChild(titleEl);

        // Add progress indicator
        if (settings.showProgress) {
            const progressEl = document.createElement('p');
            progressEl.className = 'text-muted text-sm m-0';
            progressEl.textContent = `Question ${questionIndex + 1} of ${config.questions.length}`;
            cardWrapper.appendChild(progressEl);
        }

        // Create a container for the question content
        const questionContent = document.createElement('div');
        questionInstance.render(questionContent);

        // Restore saved response after DOM is created
        questionInstance.restoreFromSCORM();
        cardWrapper.appendChild(questionContent);

        // Add navigation
        const navEl = createNavigation();
        navEl.className = 'flex justify-between items-center mt-6 pt-4 border-top';
        cardWrapper.appendChild(navEl);

        questionEl.appendChild(cardWrapper);

        return questionEl;
    }

    function createNavigation() {
        const navEl = document.createElement('div');
        // Class name set in renderQuestion to avoid duplication/conflict

        const currentIndex = stateManager.getCurrentQuestionIndex();
        const isFirstQuestion = currentIndex === 0;
        const isLastQuestion = currentIndex === config.questions.length - 1;

        const session = stateManager.getSession();
        const reviewReached = session?.reviewReached || false;

        const prevButton = `<button class="btn btn-secondary" data-action="prev" data-testid="assessment-nav-prev" ${isFirstQuestion ? 'disabled' : ''}>Previous</button>`;
        const nextButtonLabel = isLastQuestion ? (settings.allowReview ? 'Review' : 'Submit') : 'Next';
        const nextButton = `<button class="btn btn-primary" data-action="next" data-testid="assessment-nav-next">${nextButtonLabel}</button>`;

        // Show Jump to Review button once user has reached review screen
        const jumpToReviewButton = reviewReached && settings.allowReview
            ? '<button class="btn btn-secondary" data-action="jump-to-review" data-testid="assessment-jump-to-review">Jump to Review</button>'
            : '';

        let progressIndicator = '';
        if (settings.showProgress) {
            // Simplified progress for nav bar since it's also at top
            progressIndicator = `<span class="text-sm text-muted">Question ${currentIndex + 1} / ${config.questions.length}</span>`;
        }

        navEl.innerHTML = `${prevButton}${progressIndicator}<div class="flex gap-2">${jumpToReviewButton}${nextButton}</div>`;
        return navEl;
    }

    function renderReviewScreen() {
        const reviewEl = document.createElement('div');
        reviewEl.className = 'content-medium';

        const session = stateManager.getSession();
        if (!session) {
            throw new Error(`Assessment '${config.id}' has no session - state corrupted`);
        }
        const responses = session.responses || {};

        // Use metadata's isAnswered method to properly check each interaction type
        const allAnswered = config.questions.every((q, index) => {
            const metadata = questionInstances[index].metadata;
            return metadata.isAnswered(responses[index]);
        });

        const questionsHtml = config.questions.map((q, index) => {
            const response = responses[index];
            const metadata = questionInstances[index].metadata;
            const isAnswered = metadata.isAnswered(response);
            const statusClass = isAnswered ? 'bg-success text-white' : 'bg-gray-200 text-muted';
            const statusText = isAnswered ? 'Answered' : 'Not Answered';

            // Use prompt property (standard across all interaction types)
            const questionText = q.prompt || q.questionText || 'Question';
            const displayText = questionText.length > 60 ? questionText.substring(0, 60) + '...' : questionText;

            return `
        <li class="flex justify-between items-center p-3 bg-gray-50 rounded">
          <div class="flex items-center gap-3 flex-1">
            <span class="font-bold text-muted">Q${index + 1}</span>
            <span class="text-sm">${displayText}</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs px-2 py-1 rounded ${statusClass}">${statusText}</span>
            <button class="btn btn-sm btn-outline-secondary" data-action="review-question" data-question-index="${index}" data-testid="assessment-review-question-${index}">Edit</button>
          </div>
        </li>
      `;
        }).join('');

        reviewEl.innerHTML = `
      <div class="card no-hover stack-md">
        <div>
            <h2 class="text-xl font-bold m-0">Review Your Answers</h2>
            <p class="text-muted m-0">Please review your answers before submitting the assessment.</p>
        </div>
        
        <ul class="list-none stack-sm m-0 p-0">${questionsHtml}</ul>
        
        ${!allAnswered && review.requireAllAnswered ? '<div class="callout callout-danger">You must answer all questions before submitting.</div>' : ''}
        
        <div class="flex justify-between mt-4 pt-4 border-top">
          <button class="btn btn-secondary" data-action="back-to-questions" data-testid="assessment-back-to-questions">Back to Questions</button>
          <button class="btn btn-primary" data-action="submit" data-testid="assessment-submit" ${!allAnswered && review.requireAllAnswered ? 'disabled' : ''}>Submit Assessment</button>
        </div>
      </div>
    `;
        return reviewEl;
    }

    function renderResultsScreen(results) {
        if (!results) {
            const el = document.createElement('div');
            el.textContent = 'No results to display.';
            return el;
        }

        const resultsEl = document.createElement('div');
        resultsEl.className = 'content-medium';

        const { totalQuestions, correctCount, scorePercentage, passed, details } = results;

        let detailsHtml = '';
        if (resultsDisplay.showQuestions && details) {
            detailsHtml = details.map((detail, index) => {
                if (!detail) return '';
                const qConfig = config.questions[index];
                const isCorrect = detail.correct;
                const correctnessClass = isCorrect ? 'text-success' : 'text-error';
                const correctnessIcon = isCorrect ? '✔' : '✖';
                const bgClass = isCorrect ? 'bg-green-50' : 'bg-red-50';

                // Use prompt property (standard across all interaction types)
                const questionText = qConfig.prompt || qConfig.questionText || `Question ${index + 1}`;

                // Get metadata from question instance
                const metadata = questionInstances[index].metadata;

                let responseHtml = '';
                if (resultsDisplay.showUserResponses && detail.response !== null && detail.response !== undefined) {
                    responseHtml += `<div class="mt-2 p-3 bg-gray-50 rounded"><p class="text-xs font-bold text-muted uppercase mb-2 mt-0">Your Answer</p><div class="text-sm">${metadata.formatUserResponse(qConfig, detail.response)}</div></div>`;
                }

                // Show correct answer based on whether student got it right or wrong
                const shouldShowCorrect = (isCorrect && resultsDisplay.showCorrectAnswers) ||
                    (!isCorrect && resultsDisplay.showIncorrectAnswers);

                if (shouldShowCorrect) {
                    const correctAnswer = metadata.getCorrectAnswer(qConfig);
                    responseHtml += `<div class="mt-2 p-3 bg-green-50 rounded"><p class="text-xs font-bold text-success uppercase mb-2 mt-0">Correct Answer</p><div class="text-sm">${metadata.formatCorrectAnswer(qConfig, correctAnswer)}</div></div>`;
                }

                return `
          <li class="p-4 rounded ${bgClass}">
            <div class="flex gap-3 items-start">
              <span class="font-bold text-muted">Q${index + 1}</span>
              <div class="flex-1 stack-sm">
                <div class="flex justify-between">
                    <span class="font-semibold">${questionText}</span>
                    ${resultsDisplay.showCorrectness ? `<span class="${correctnessClass} font-bold">${correctnessIcon}</span>` : ''}
                </div>
                ${responseHtml}
              </div>
            </div>
          </li>
        `;
            }).join('');
        }

        // Render action button (provided by Actions layer with all business logic)
        let actionButtonHtml = '';
        if (results.actionButton) {
            const btn = results.actionButton;

            let messageHtml = '';
            if (btn.message) {
                const calloutClass = `callout callout-${btn.messageType || 'info'}`;
                const title = btn.type === 'restart' ? 'Maximum Attempts Reached' : 'Review Recommended';
                messageHtml = `
                    <div class="${calloutClass}">
                        <p class="font-bold">${title}</p>
                        <p>${btn.message}</p>
                    </div>
                `;
            }

            let attemptsHtml = '';
            if (btn.attemptsMessage) {
                attemptsHtml = `<p class="text-muted mt-2 text-sm text-center">${btn.attemptsMessage}</p>`;
            }

            actionButtonHtml = `
                <div class="stack-md mt-6 pt-4 border-top">
                    ${messageHtml}
                    <div class="flex justify-center">
                        <button data-action="${btn.action}" class="btn btn-primary btn-lg" data-testid="assessment-${btn.action}">
                            ${btn.label}
                        </button>
                    </div>
                    ${attemptsHtml}
                </div>
            `;
        }

        resultsEl.innerHTML = `
      <div class="card no-hover stack-lg">
        <div class="text-center stack-sm">
            <h2 class="text-2xl font-bold m-0">Assessment Results</h2>
            <p class="text-xl ${passed ? 'text-success' : 'text-error'} font-bold m-0">${passed ? 'Passed' : 'Failed'}</p>
        </div>

        <div class="cols-3 gap-4">
            <div class="p-3 bg-gray-50 rounded text-center border">
                <div class="text-xs font-bold text-muted uppercase">Score</div>
                <div class="text-xl font-bold">${scorePercentage.toFixed(0)}%</div>
            </div>
            <div class="p-3 bg-gray-50 rounded text-center border">
                <div class="text-xs font-bold text-muted uppercase">Correct</div>
                <div class="text-xl font-bold">${correctCount} / ${totalQuestions}</div>
            </div>
            <div class="p-3 bg-gray-50 rounded text-center border">
                <div class="text-xs font-bold text-muted uppercase">Time</div>
                <div class="text-xl font-bold">${results.timeSpent || '--:--'}</div>
            </div>
        </div>

        ${detailsHtml ? `<ul class="list-none stack-sm m-0 p-0">${detailsHtml}</ul>` : ''}
        ${actionButtonHtml}
      </div>
    `;
        return resultsEl;
    }

    function initialize(container) {
        const viewManager = createViewManager(container, 'assessment');
        viewManager.registerView('intro', {
            render: renderIntroScreen
        });
        viewManager.registerView('question', {
            render: renderQuestion
        });
        viewManager.registerView('review', {
            render: renderReviewScreen
        });
        viewManager.registerView('results', {
            render: renderResultsScreen
        });

        return viewManager;
    }

    return {
        initialize,
        showUnansweredModal: (unansweredIndices, allowSubmission, onConfirm) =>
            showUnansweredModal(unansweredIndices, allowSubmission, onConfirm),
    };
}
