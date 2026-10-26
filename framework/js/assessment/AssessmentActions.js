/**
 * AssessmentActions - Handles all user interactions and business logic.
 *
 * This module orchestrates the assessment flow by responding to user actions
 * (e.g., 'next', 'submit'). It uses the AssessmentState module to manage state
 * and triggers UI updates via the ViewManager.
 *
 * This layer is also responsible for managing global UI state (footer visibility).
 */

import { eventBus } from '../core/event-bus.js';
import * as AppUI from '../app/AppUI.js';
import { goToSlide } from '../navigation/NavigationActions.js';
import { getCurrentSlideId, getVisitedSlides } from '../navigation/NavigationState.js';
import { getSlideById } from '../utilities/course-helpers.js';
import objectiveManager from '../managers/objective-manager.js';
import interactionManager from '../managers/interaction-manager.js';

import globalStateManager from '../state/index.js';
import { formatLearnerResponseForScorm } from '../validation/scorm-validators.js';
import { logger } from '../utilities/logger.js';
import accessibilityManager from '../managers/accessibility-manager.js';
import {
    roundPercentage,
    resolvePassingScore,
    formatScoreForDisplay,
    buildResultsActionButton
} from './assessment-results.js';

/**
 * Creates an object containing all action handlers for an assessment.
 * @param {object} stateManager - The assessment-specific state manager.
 * @param {object} uiManager - The assessment-specific UI manager (a view manager instance).
 * @param {Array} questionInstances - An array of all question instances for the assessment.
 * @param {object} config - The assessment's configuration object.
 * @param {object} assessmentUI - The full assessment UI object (for accessing modal methods).
 * @returns {object} An object with an `initialize` method to attach event listeners.
 */
export function createAssessmentActions(stateManager, uiManager, questionInstances, config, assessmentUI) {
    // FAIL FAST validation of critical parameters
    if (!config || !config.id) {
        throw new Error('[AssessmentActions] config with id is required');
    }
    if (!assessmentUI) {
        throw new Error(`[AssessmentActions:${config.id}] assessmentUI parameter is required`);
    }

    const { settings } = config;
    // All parameters are immutable for this action instance's lifetime

    // Randomized/bank assessments persist their question order so index-keyed
    // responses always resolve to the same questions on resume.
    const requiresPersistedOrder = Boolean(config.questionBanks || settings.randomizeQuestions);

    /**
     * Replaces the session with a fresh attempt while keeping the summary
     * (attempt counts, lastResults, attempt history) intact.
     * @param {boolean} reselectQuestions - Clear the persisted question order so
     *   the next render draws a new randomized selection.
     */
    async function _startNewAttemptSession({ reselectQuestions = false } = {}) {
        await stateManager.startNewAttemptSession();
        if (requiresPersistedOrder) {
            await stateManager.setSelectedQuestions(reselectQuestions ? null : config.questions);
        }
    }

    /**
     * Moves focus into the newly shown assessment view so keyboard and screen
     * reader users don't land on <body> after the DOM swap.
     * @param {string} viewName
     * @param {string} [announcement]
     */
    function _focusView(viewName, announcement) {
        const container = typeof uiManager.getContainer === 'function' ? uiManager.getContainer() : null;
        if (!container) return;

        const target = (viewName === 'question' && container.querySelector('.question-prompt h3, .question-prompt h2'))
            || container.querySelector('h1, h2, h3');
        if (target) {
            if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
        }

        if (announcement) {
            accessibilityManager.announce(announcement);
        }
    }

    function _questionAnnouncement() {
        return `Question ${stateManager.getCurrentQuestionIndex() + 1} of ${config.questions.length}`;
    }

    async function _forceSaveCurrentResponse() {
        // Only a question that is on screen has live input to save. From the
        // review screen (possibly restored after a reload) no question is
        // rendered, and reading it would throw or overwrite the saved answer.
        if (stateManager.getCurrentView() !== 'question') return;

        const currentIndex = stateManager.getCurrentQuestionIndex();
        const questionInstance = questionInstances[currentIndex];
        if (questionInstance && typeof questionInstance.persistToSCORM === 'function') {
            await questionInstance.persistToSCORM();
        }
    }

    function _manageFooterVisibility(viewName) {
        if (viewName === 'question' || viewName === 'review') {
            AppUI.hideFooter();
        } else {
            AppUI.showFooter();
        }
    }

    async function handleStart() {
        // Fresh session for the next attempt number (summary.attempts + 1).
        // Keeps the question order this instance is rendering persisted.
        await _startNewAttemptSession();
        await stateManager.setCurrentView('question');
        await stateManager.setCurrentQuestionIndex(0);
        await stateManager.setStartTime(Date.now());

        _manageFooterVisibility('question');
        await uiManager.showView('question');
        _focusView('question', _questionAnnouncement());
    }

    async function handlePrev() {
        await _forceSaveCurrentResponse();

        const currentIndex = stateManager.getCurrentQuestionIndex();
        if (currentIndex > 0) {
            await stateManager.setCurrentQuestionIndex(currentIndex - 1);
            await uiManager.showView('question');
            _focusView('question', _questionAnnouncement());
        }
    }

    async function handleNext() {
        await _forceSaveCurrentResponse();

        const currentIndex = stateManager.getCurrentQuestionIndex();
        const isLastQuestion = currentIndex === config.questions.length - 1;

        if (isLastQuestion) {
            if (settings.allowReview) {
                await stateManager.updateSession({ reviewReached: true });
                await stateManager.setCurrentView('review');
                _manageFooterVisibility('review');
                await uiManager.showView('review');
                _focusView('review');
            } else {
                // FIX: Route through handleSubmit to ensure unanswered checks are performed
                // previously called submitAssessment() directly, bypassing validation
                await handleSubmit();
            }
        } else {
            await stateManager.setCurrentQuestionIndex(currentIndex + 1);
            await uiManager.showView('question');
            _focusView('question', _questionAnnouncement());
        }
    }

    async function handleReviewQuestion(event) {
        await _forceSaveCurrentResponse();

        const index = parseInt(event.target.closest('[data-question-index]').dataset.questionIndex, 10);
        if (isNaN(index)) {
            const errorMessage = `[AssessmentActions:${config.id}] Invalid question index from review screen`;
            logger.error(errorMessage, { domain: 'assessment', operation: 'handleReviewQuestion', assessmentId: config.id });
            throw new Error(errorMessage);
        }

        await stateManager.setCurrentView('question');
        await stateManager.setCurrentQuestionIndex(index);
        _manageFooterVisibility('question');
        await uiManager.showView('question');
        _focusView('question', _questionAnnouncement());
    }

    async function handleBackToQuestions() {
        await _forceSaveCurrentResponse();
        await stateManager.setCurrentView('question');
        _manageFooterVisibility('question');
        await uiManager.showView('question');
        _focusView('question', _questionAnnouncement());
    }

    async function handleJumpToReview() {
        await _forceSaveCurrentResponse();
        await stateManager.setCurrentView('review');
        _manageFooterVisibility('review');
        await uiManager.showView('review');
        _focusView('review');
    }

    async function handleSubmit() {
        await _forceSaveCurrentResponse();

        // Check for unanswered questions before submission
        // Use the same logic as review screen - delegate to interaction metadata
        const session = stateManager.getSession();
        const responses = session?.responses || {};
        const unansweredIndices = [];

        for (let i = 0; i < config.questions.length; i++) {
            const _question = config.questions[i];
            const response = responses[i];

            // Get metadata from question instance
            const metadata = questionInstances[i].metadata;

            // Use interaction's isAnswered method - it knows best for its type
            if (!metadata || !metadata.isAnswered(response)) {
                unansweredIndices.push(i);
            }
        }

        // Check if unanswered questions exist and how to handle them
        const allowUnanswered = settings.allowUnansweredSubmission === true; // Default false (strict mode)

        if (unansweredIndices.length > 0) {
            // Show modal: informational if blocked, confirmation if allowed
            assessmentUI.showUnansweredModal(
                unansweredIndices,
                allowUnanswered,  // Pass whether submission is allowed
                async () => {
                    // User confirmed submission (only called if allowUnanswered is true)
                    await submitAssessment();
                }
            );
            return;
        }

        // Either no unanswered questions, or allowUnansweredSubmission is true - proceed
        await submitAssessment();
    }

    function handleCheck() {
        const currentIndex = stateManager.getCurrentQuestionIndex();
        const questionInstance = questionInstances[currentIndex];
        if (questionInstance && typeof questionInstance.checkAnswer === 'function') {
            questionInstance.checkAnswer();
        }
    }

    function handleReset() {
        const currentIndex = stateManager.getCurrentQuestionIndex();
        const questionInstance = questionInstances[currentIndex];
        if (questionInstance && typeof questionInstance.reset === 'function') {
            questionInstance.reset();
        }
    }

    function handleHint() {
        const currentIndex = stateManager.getCurrentQuestionIndex();
        const questionInstance = questionInstances[currentIndex];
        if (questionInstance && typeof questionInstance.showHint === 'function') {
            questionInstance.showHint();
        }
    }

    async function handleRetake() {
        // Archive old responses BEFORE clearing session
        const oldSession = stateManager.getSession();
        if (oldSession && oldSession.responses && Object.keys(oldSession.responses).length > 0) {
            await stateManager.archiveDiscardedResponses(config.questions, oldSession.responses);
        }

        // Reset all question instances to clear their internal state
        questionInstances.forEach(questionInstance => {
            if (questionInstance && typeof questionInstance.reset === 'function') {
                try {
                    questionInstance.reset();
                } catch (_e) {
                    // Ignore error if container is null (not rendered yet)
                    // This happens when retaking from results screen without viewing questions
                }
            }
        });

        // Check if we need to re-randomize questions
        const shouldRandomizeOnRetake = settings.randomizeOnRetake !== false;
        // FIX: Also check randomizeQuestions setting for direct mode (no banks)
        const isRandomized = Boolean(config.questionBanks || settings.randomizeQuestions);
        const reselectQuestions = shouldRandomizeOnRetake && isRandomized;

        // Start the next attempt's session. Its attempt number is newer than
        // summary.lastResults, so on re-render/resume the in-progress retake
        // takes precedence over the previous attempt's results screen. The
        // summary (attempt counts, lastResults) is preserved for attempt
        // limits, remedial logic, gating and score reporting.
        await _startNewAttemptSession({ reselectQuestions });

        if (reselectQuestions) {
            // Navigate back to this slide so it creates a NEW assessment
            // instance, which draws a fresh randomized selection because the
            // persisted order was cleared above.
            const currentSlideId = getCurrentSlideId();
            if (currentSlideId) {
                try {
                    await goToSlide(currentSlideId, { refreshAssessment: true });
                    return; // Exit - new instance will be created
                } catch (error) {
                    logger.warn(`[AssessmentActions:${config.id}] Could not re-render for a new question selection; retaking with the current questions. ${error.message}`);
                }
            }
            // Keep the persisted order aligned with the questions still rendered
            await stateManager.setSelectedQuestions(config.questions);
        }

        // Simple reset - same questions
        _manageFooterVisibility('intro');
        await uiManager.showView('intro');
        _focusView('intro');
    }

    function handleRestartCourse() {
        // Show a confirmation modal before restarting.
        // The actual restart logic is handled by a global listener for 'confirm-restart'.
        eventBus.emit('ui:showModal', 'restart');
    }

    function _prepareResultsDisplayData(results) {
        const summary = stateManager.getSummary();
        // Summary always exists after submit
        const currentAttempts = summary?.attempts || 0;

        // Determine action button configuration (shared with resumed results)
        const actionButton = buildResultsActionButton(settings, {
            passed: results.passed,
            currentAttempts,
            visitedSlides: getVisitedSlides() || []
        });

        return {
            ...results,
            actionButton,
            currentAttempts
        };
    }

    async function handleGoToRemedial() {
        const remedialSlideIds = settings.remedialSlideIds || [];
        if (remedialSlideIds.length === 0) {
            const error = new Error('No remedial slides configured');
            logger.error(error.message, { domain: 'assessment', operation: 'handleGoToRemedial', stack: error.stack, assessmentId: config.id });
            throw error;
        }

        // Navigate to first remedial slide
        const firstRemedialSlide = remedialSlideIds[0];

        // Validate slide exists before navigating
        const slide = await getSlideById(firstRemedialSlide);
        if (!slide) {
            const errorMessage = `[AssessmentActions:${config.id}] Remedial slide '${firstRemedialSlide}' not found in course structure`;
            logger.error(errorMessage, { domain: 'assessment', operation: 'handleGoToRemedial', assessmentId: config.id, remedialSlideIds });
            AppUI.showNotification(`Error: Slide '${firstRemedialSlide}' not found`, 'error');
            throw new Error(errorMessage);
        }

        await goToSlide(firstRemedialSlide, {
            fromAssessment: config.id,
            remedialReview: true
        });
    }

    async function submitAssessment() {
        const session = stateManager.getSession();
        if (!session) {
            const errorMessage = `[AssessmentActions:${config.id}] No session data found, cannot submit`;
            logger.error(errorMessage, { domain: 'assessment', operation: 'submitAssessment', assessmentId: config.id });
            throw new Error(errorMessage);
        }

        const attemptNumber = stateManager.getAttemptNumber();
        const finalResults = calculateFinalResults(session.responses || {}, attemptNumber);

        // Calculate time spent
        const startTime = stateManager.getStartTime();
        if (startTime) {
            const endTime = Date.now();
            const durationMs = endTime - startTime;
            const minutes = Math.floor(durationMs / 60000);
            const seconds = Math.floor((durationMs % 60000) / 1000);
            finalResults.timeSpent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        // OPTIMIZATION: Store only summary stats in suspend_data, not full details array
        // The details array can be 2-4KB for large assessments, causing SCORM 409 errors
        // Details are only needed for immediate display; on resume we show summary only
        const resultsSummary = {
            attemptNumber: finalResults.attemptNumber,
            totalQuestions: finalResults.totalQuestions,
            correctCount: finalResults.correctCount,
            scorePercentage: finalResults.scorePercentage,
            passingScore: finalResults.passingScore,
            passed: finalResults.passed,
            // Store only question IDs and correctness, not full details
            questionResults: finalResults.details.map(d => ({
                id: d.questionId,
                correct: d.correct
            }))
        };

        await stateManager.updateSummary({
            lastResults: resultsSummary,
            submitted: true,
            attempts: attemptNumber,
            [`attempt_${attemptNumber}`]: resultsSummary,
        });

        await stateManager.updateSession({
            submitted: true
            // Don't duplicate results in session - summary has it
        });

        // Prepare display data with action buttons and business logic
        // Pass FULL results (with details) for immediate display only
        const displayData = _prepareResultsDisplayData(finalResults);

        await stateManager.setCurrentView('results');

        // Automatically set linked objective if configured
        if (config.assessmentObjective) {
            try {
                objectiveManager.setCompletionStatus(config.assessmentObjective, 'completed');
                objectiveManager.setSuccessStatus(config.assessmentObjective, finalResults.passed ? 'passed' : 'failed');
            } catch (error) {
                const errorMessage = `Failed to update objective '${config.assessmentObjective}' after assessment submission`;
                logger.error(errorMessage, { domain: 'assessment', operation: 'submitAssessment', stack: error.stack, assessmentId: config.id, objective: config.assessmentObjective });
                throw new Error(errorMessage);
            }
        }

        // Record each question response to cmi.interactions for LMS reporting
        // This is separate from suspend_data persistence - purely for analytics/audit
        _recordAssessmentInteractionsToCMI(finalResults, attemptNumber);

        // Emit event for ScoreManager and other systems BEFORE flush
        // ScoreManager listens here and calls reportScore() synchronously
        eventBus.emit('assessment:submitted', {
            assessmentId: config.id,
            results: finalResults
        });

        // Flush critical assessment data + score to LMS immediately
        // Assessment submission is a critical action - don't rely on debounce
        await globalStateManager.flush();

        // Only transition the UI after the assessment outcome, objective, and
        // course score are durably committed. A rendering failure must never
        // prevent the LMS from receiving the learner's submitted result.
        _manageFooterVisibility('results');
        await uiManager.showView('results', displayData);
        _focusView('results', `Assessment results: ${finalResults.passed ? 'Passed' : 'Failed'}. Score ${formatScoreForDisplay(finalResults.scorePercentage, finalResults.passingScore)}%, ${finalResults.correctCount} of ${finalResults.totalQuestions} correct.`);

        if (typeof config.onComplete === 'function') {
            config.onComplete(finalResults);
        }
    }

    function calculateFinalResults(responses, attemptNumber) {
        const totalQuestions = config.questions.length;
        let achievedScore = 0;
        let totalPossibleScore = 0;

        const details = config.questions.map((q, i) => {
            const questionInstance = questionInstances[i];
            const response = responses[i];
            const weight = q.weight;
            totalPossibleScore += weight;

            // Handle missing responses - treat as incorrect
            let evaluation;
            if (response === undefined || response === null) {
                // Unanswered question - mark as incorrect
                evaluation = {
                    correct: false,
                    score: 0,
                    feedback: 'Question was not answered'
                };
            } else {
                evaluation = questionInstance.evaluate(response);
            }

            if (!evaluation || typeof evaluation.correct !== 'boolean') {
                const error = new Error(`Question ${i + 1} (${q.id}) evaluate() returned invalid result`);
                logger.error(error.message, { domain: 'assessment', operation: 'calculateFinalResults', stack: error.stack, assessmentId: config.id, questionIndex: i, questionId: q.id });
                throw error;
            }

            const isCorrect = evaluation.correct;

            if (isCorrect) {
                achievedScore += weight;
            }

            // Include bank metadata if present
            const detail = {
                questionIndex: i,
                questionId: q.id,
                correct: isCorrect,
                response: response,
                weight: weight,
            };

            if (q._meta) {
                detail.bankId = q._meta.bankId;
                detail.originalIndex = q._meta.originalIndex;
            }

            return detail;
        });

        // Round to 2 decimals before comparing: (29 / 50) * 100 is
        // 57.99999999999999 in binary floating point and would fail a 58% pass mark.
        const scorePercentage = (totalPossibleScore > 0) ? roundPercentage((achievedScore / totalPossibleScore) * 100) : 0;

        // Check for LMS-provided masteryScore override (cmi5 launch data)
        // masteryScore is 0-1 scaled in cmi5 spec, convert to percentage (rounded the same way)
        const launchData = globalStateManager.getLaunchData();
        const effectivePassingScore = resolvePassingScore(settings, launchData);

        const passed = scorePercentage >= effectivePassingScore;

        const correctCount = details.filter(d => d.correct).length;

        return {
            attemptNumber,
            totalQuestions,
            correctCount,
            scorePercentage,
            passingScore: effectivePassingScore,
            passed,
            details,
        };
    }

    /**
     * Records assessment question interactions to CMI for LMS reporting.
     * Called after assessment submission to append each question as a CMI interaction.
     * Formats learner_response according to SCORM 2004 4th Edition requirements.
     * @param {Object} finalResults - The calculated results from calculateFinalResults
     * @param {number} attemptNumber - Current attempt number for ID uniqueness
     */
    function _recordAssessmentInteractionsToCMI(finalResults, attemptNumber) {
        if (!interactionManager || typeof interactionManager.record !== 'function') {
            return;
        }

        const questions = config.questions || [];

        finalResults.details.forEach((detail, i) => {
            const question = questions[i];
            if (!question) return;

            const questionInstance = questionInstances[i];
            const scormType = questionInstance?.metadata?.scormType || 'other';

            // Format response according to SCORM 2004 requirements
            const formattedResponse = formatLearnerResponseForScorm(scormType, detail.response);

            // Build unique ID: assessmentId_questionId_attempt-N
            const interactionId = `${config.id}_${detail.questionId}_attempt-${attemptNumber}`;

            try {
                interactionManager.record({
                    id: interactionId,
                    type: scormType,
                    learner_response: formattedResponse,
                    result: detail.correct ? 'correct' : 'incorrect',
                    objectives: config.assessmentObjective ? [config.assessmentObjective] : undefined,
                });
            } catch (err) {
                logger.error(`Failed to record assessment interaction to CMI: ${err.message}`, {
                    domain: 'assessment', operation: 'recordInteractionsToCMI',
                    assessmentId: config.id, questionId: detail.questionId
                });
            }
        });
    }

    function initialize(container) {
        container.addEventListener('click', async (event) => {
            const target = event.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            const actions = {
                'start': handleStart,
                'prev': handlePrev,
                'next': handleNext,
                'review-question': handleReviewQuestion,
                'back-to-questions': handleBackToQuestions,
                'jump-to-review': handleJumpToReview,
                'submit': handleSubmit,
                'check': handleCheck,
                'reset': handleReset,
                'hint': handleHint,
                'retake': handleRetake,
                'restart-course': handleRestartCourse,
                'go-to-remedial': handleGoToRemedial,
            };

            if (actions[action]) {
                event.preventDefault();
                target.disabled = true;
                try {
                    await actions[action](event);
                } catch (error) {
                    const errorMessage = `[AssessmentActions:${config.id}] Error in action '${action}': ${error.message}`;
                    logger.error(errorMessage, { domain: 'assessment', operation: action, assessmentId: config.id, stack: error.stack });
                    throw error;
                } finally {
                    target.disabled = false;
                }
            }
        });
    }

    return {
        initialize,
    };
}
