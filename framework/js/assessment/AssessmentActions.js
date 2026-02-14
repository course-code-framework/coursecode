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

    async function _forceSaveCurrentResponse() {
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
        const summary = stateManager.getSummary();
        // Summary initialized by Factory on first render
        const attemptNumber = (summary?.attempts || 0) + 1;

        await stateManager.clearSession();
        await stateManager.setCurrentView('question');
        await stateManager.setCurrentQuestionIndex(0);
        await stateManager.setStartTime(Date.now());
        await stateManager.setSubmitted(false);
        await stateManager.setAttemptNumber(attemptNumber);

        _manageFooterVisibility('question');
        uiManager.showView('question');
    }

    async function handlePrev() {
        await _forceSaveCurrentResponse();

        const currentIndex = stateManager.getCurrentQuestionIndex();
        if (currentIndex > 0) {
            await stateManager.setCurrentQuestionIndex(currentIndex - 1);
            uiManager.showView('question');
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
                uiManager.showView('review');
            } else {
                // FIX: Route through handleSubmit to ensure unanswered checks are performed
                // previously called submitAssessment() directly, bypassing validation
                await handleSubmit();
            }
        } else {
            await stateManager.setCurrentQuestionIndex(currentIndex + 1);
            uiManager.showView('question');
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
        uiManager.showView('question');
    }

    async function handleBackToQuestions() {
        await _forceSaveCurrentResponse();
        await stateManager.setCurrentView('question');
        _manageFooterVisibility('question');
        uiManager.showView('question');
    }

    async function handleJumpToReview() {
        await _forceSaveCurrentResponse();
        await stateManager.setCurrentView('review');
        _manageFooterVisibility('review');
        uiManager.showView('review');
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

        // Clear session state
        await stateManager.clearSession();
        await stateManager.setCurrentView('intro');
        await stateManager.setCurrentQuestionIndex(0);
        await stateManager.setStartTime(null);
        await stateManager.setSubmitted(false);
        await stateManager.updateSession({ reviewReached: false });

        // Check if we need to re-randomize questions
        const shouldRandomizeOnRetake = settings.randomizeOnRetake !== false;
        // FIX: Also check randomizeQuestions setting for direct mode (no banks)
        const isRandomized = config.questionBanks || settings.randomizeQuestions;

        if (shouldRandomizeOnRetake && isRandomized) {
            // Clear selection to force new randomization
            await stateManager.setSelectedQuestions(null);

            // Navigate back to this slide with refresh flag
            // This will cause slide to create NEW assessment instance
            const currentSlideId = getCurrentSlideId();
            if (currentSlideId) {
                goToSlide(currentSlideId, { refreshAssessment: true });
                return; // Exit - new instance will be created
            }
        }

        // Simple reset - same questions
        _manageFooterVisibility('intro');
        uiManager.showView('intro');
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
        const { attemptsBeforeRemedial, attemptsBeforeRestart, allowRetake } = settings;

        // Determine action button configuration
        let actionButton = null;

        if (!results.passed && allowRetake) {
            // Check if remedial content has already been viewed
            // Use NavigationState directly to get visited slides
            const visitedSlides = getVisitedSlides() || [];

            const hasRemedialSlides = settings.remedialSlideIds && settings.remedialSlideIds.length > 0;
            const remedialViewed = hasRemedialSlides && settings.remedialSlideIds.every(id => visitedSlides.includes(id));

            if (attemptsBeforeRestart && currentAttempts >= attemptsBeforeRestart) {
                actionButton = {
                    type: 'restart',
                    action: 'restart-course',
                    label: 'Restart Course',
                    message: `You have completed ${currentAttempts} attempts. To try again, you must restart the entire course. This will erase all progress.`,
                    messageType: 'warning'
                };
            } else if (attemptsBeforeRemedial && currentAttempts >= attemptsBeforeRemedial && !remedialViewed) {
                actionButton = {
                    type: 'remedial',
                    action: hasRemedialSlides ? 'go-to-remedial' : 'retake',
                    label: hasRemedialSlides ? 'Review Content' : 'Retake Assessment',
                    message: hasRemedialSlides
                        ? 'Please review the recommended content before attempting the assessment again. This will help strengthen your understanding of key concepts.'
                        : 'Please take time to review the course material before attempting the assessment again.',
                    messageType: 'info'
                };
            } else {
                // Standard retake
                let attemptsMessage = null;

                // Check remedial warning first (if applicable and not passed)
                if (attemptsBeforeRemedial) {
                    const remaining = attemptsBeforeRemedial - currentAttempts;
                    if (remaining > 0) {
                        attemptsMessage = remaining > 1
                            ? `${remaining} more attempts before review is recommended.`
                            : 'Content review will be recommended after your next attempt.';
                    }
                }

                // If no remedial warning (either not configured, or we passed it and viewed content), check restart warning
                if (!attemptsMessage && attemptsBeforeRestart) {
                    const remaining = attemptsBeforeRestart - currentAttempts;
                    if (remaining > 0) {
                        attemptsMessage = remaining > 1
                            ? `${remaining} attempts remaining before course restart is required.`
                            : 'This is your final attempt before course restart is required.';
                    }
                }

                actionButton = {
                    type: 'retake',
                    action: 'retake',
                    label: 'Retake Assessment',
                    attemptsMessage
                };
            }
        }

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

        goToSlide(firstRemedialSlide, {
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
        _manageFooterVisibility('results');
        uiManager.showView('results', displayData);

        // Keep full results in memory for this session only (not persisted)
        // This allows detailed review immediately after submission

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

        const scorePercentage = (totalPossibleScore > 0) ? (achievedScore / totalPossibleScore) * 100 : 0;

        // Check for LMS-provided masteryScore override (cmi5 launch data)
        // masteryScore is 0-1 scaled in cmi5 spec, convert to percentage
        const launchData = globalStateManager.getLaunchData();
        const effectivePassingScore = (launchData?.masteryScore !== null && launchData?.masteryScore !== undefined)
            ? launchData.masteryScore * 100
            : (settings.passingScore || 0);

        const passed = scorePercentage >= effectivePassingScore;

        const correctCount = details.filter(d => d.correct).length;

        return {
            attemptNumber,
            totalQuestions,
            correctCount,
            scorePercentage,
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
