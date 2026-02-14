import stateManager from '../state/index.js';
import * as CourseHelpers from '../utilities/course-helpers.js';
import * as NavigationActions from '../navigation/NavigationActions.js';
import * as NavigationState from '../navigation/NavigationState.js';
import * as AssessmentManager from '../managers/assessment-manager.js';
import commentManager from '../managers/comment-manager.js';
import { eventBus } from '../core/event-bus.js';
import { courseConfig } from '../../../course/course-config.js';
import { showNotification, getCompletionModalData } from './AppUI.js';
import { announceToScreenReader } from '../components/ui-components/index.js';
import * as AppState from './AppState.js';

import { shouldBypassGating } from '../navigation/navigation-helpers.js';
import { logger } from '../utilities/logger.js';

// Re-export UI functions for use by other modules
export { showNotification };


/**
 * Initializes the AppActions module by setting up event handlers for exit buttons.
 */
export function initAppActions() {
    _initEventListeners();

    // Listen for navigation events to handle timing and completion
    eventBus.on('navigation:beforeChange', ({ fromSlideId }) => endSessionTimer(fromSlideId));
    eventBus.on('navigation:changed', ({ toSlideId }) => startSessionTimer(toSlideId));
    eventBus.on('navigation:completeCheck', checkCompletion);

    logger.debug('AppActions initialized.');
}

/**
 * Sets up a global event listener for all application-level actions.
 * @private
 */
function _initEventListeners() {
    document.body.addEventListener('click', async (event) => {
        const actionTarget = event.target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;

        switch (action) {
            case 'exit-course':
                await _handleExitClick();
                break;
            case 'confirm-exit':
                await exit();
                break;
            case 'confirm-complete':
                await _completeAndExit();
                break;
            case 'confirm-restart':
                await restartCourse();
                break;
            case 'refresh-page':
                window.location.reload();
                break;

            case 'provide-feedback':
                _handleProvideFeedback();
                break;
        }
    });
}



async function _handleProvideFeedback() {

    const feedback = prompt('Please provide feedback about your learning experience:');
    if (feedback) {
        commentManager.addComment(feedback, 'course-feedback');
        announceToScreenReader('Thank you for your feedback!');
    }
}


/**
 * Checks if the course completion criteria have been met.
 * Delegates to appropriate managers to determine completion status.
 *
 * Criteria:
 * 1. User is on the last slide or a summary slide (NavigationManager)
 * 2. All assessments with completion requirements have met those requirements (AssessmentManager)
 *
 * If all criteria are met, it updates the state and shows the completion modal.
 * @returns {Promise<boolean>} True if the course is complete, otherwise false.
 */
export async function checkCompletion() {
    const onCompletionSlide = NavigationActions.isOnLastSlide();
    const currentCompletionStatus = stateManager.getCompletion() || 'incomplete';

    // If not on a completion slide, we don't process completion/success status yet.
    if (!onCompletionSlide) {
        const currentSuccessStatus = currentCompletionStatus === 'completed'
            ? (stateManager.getSuccess() || 'unknown')
            : 'unknown';

        eventBus.emit('course:statusChanged', {
            completionStatus: currentCompletionStatus,
            successStatus: currentSuccessStatus,
            isOnLastSlide: false
        });
        return false;
    }

    // If already marked as completed, no need to re-evaluate.
    if (currentCompletionStatus === 'completed') {
        eventBus.emit('course:statusChanged', {
            completionStatus: 'completed',
            successStatus: stateManager.getSuccess() || 'unknown',
            isOnLastSlide: true
        });
        return true;
    }

    // On a completion slide, so evaluate final status.
    const assessmentSlides = await CourseHelpers.getSlidesByType('assessment');
    const assessmentConfigs = await CourseHelpers.getAssessmentConfigs();

    // Completion is based on submission requirements.
    const assessmentsRequiringSubmission = assessmentSlides.filter(s =>
        assessmentConfigs.get(s.assessmentId)?.completionRequirements?.requireSubmission
    );

    const allSubmitted = assessmentsRequiringSubmission.every(s =>
        AssessmentManager.meetsCompletionRequirements(s.assessmentId, { requireSubmission: true })
    );

    const completionStatus = allSubmitted ? 'completed' : 'incomplete';

    // Success is based on passing requirements.
    const assessmentsRequiringPass = assessmentSlides.filter(s =>
        assessmentConfigs.get(s.assessmentId)?.completionRequirements?.requirePass
    );

    let successStatus = 'unknown';
    if (assessmentsRequiringPass.length > 0) {
        const allPassed = assessmentsRequiringPass.every(s =>
            AssessmentManager.meetsCompletionRequirements(s.assessmentId, { requirePass: true })
        );
        successStatus = allPassed ? 'passed' : 'failed';
        // Note: Course score reporting is handled by ScoreManager (configure in course-config.js)
    } else if (completionStatus === 'completed') {
        // If the course is completed and no assessments required passing, then success is 'passed'.
        successStatus = 'passed';
    }

    // Persist the determined completion and success statuses.
    stateManager.reportCompletion(completionStatus);
    stateManager.reportSuccess(successStatus);

    // Flush critical completion status to LMS immediately
    // Course completion is a critical action - don't rely on debounce
    await stateManager.flush();

    logger.debug(`[AppActions] checkCompletion: completionStatus=${completionStatus}, successStatus=${successStatus}`);

    eventBus.emit('course:statusChanged', {
        completionStatus,
        successStatus,
        isOnLastSlide: true
    });

    // Return true only if the course is actually complete
    return completionStatus === 'completed';
}

/**
 * Sets the flag indicating a legitimate exit is occurring.
 * This is called by any intentional exit action to signal to the 'beforeunload'
 * guard that it should allow the page to unload.
 */
export function setExitFlag() {
    AppState.setExitIntentional(true);
}

/**
 * Finalizes the current slide's progress before exiting.
 * Marks the current slide as visited and updates the progress measure.
 * @private
 */
function _finalizeCurrentSlideProgress() {
    const currentSlideId = NavigationState.getCurrentSlideId();
    if (currentSlideId) {
        NavigationState.addVisitedSlide(currentSlideId);

        // Update progress measure one final time before exit
        const slides = NavigationActions.getAllSlides();
        if (slides) {
            const totalSequentialSlides = slides.filter(s =>
                s.navigation?.sequence?.included !== false
            ).length;
            stateManager.updateProgressMeasure(totalSequentialSlides);
        }
    }
}

/**
 * Exits the course, saving the current state (suspend data).
 */
export async function exit() {
    setExitFlag();
    AppState.setExitInProgress(true);

    // Mark the current slide as visited before exiting
    // This ensures that if the user exits from the last slide, it counts toward progress
    _finalizeCurrentSlideProgress();

    const exitResult = await stateManager.exitCourseWithSuspend();

    if (exitResult) {
        eventBus.emit('ui:lockCourseForExit');
    } else {
        showNotification('We were unable to finalize the session automatically. Please close this window manually.', 'warning', 6000);
    }
}

/**
 * Gathers final feedback/rating and exits the course after marking it as complete.
 * This is called when the user explicitly clicks "Complete & Exit" in the completion modal.
 */
async function _completeAndExit() {
    setExitFlag();
    AppState.setExitInProgress(true);

    // Mark the current slide as visited before exiting
    // This ensures the final slide counts toward progress
    _finalizeCurrentSlideProgress();

    // CRITICAL: Ensure completion status is set to 'completed' when user explicitly completes
    // This handles edge cases where checkCompletion() may not have set it (e.g., dev bypass)
    const currentStatus = stateManager.getCompletion();
    if (currentStatus !== 'completed') {
        logger.debug('[AppActions] Setting completion status to completed on explicit user completion');
        stateManager.reportCompletion('completed');
        
        // Also set success status if not already set
        const currentSuccess = stateManager.getSuccess();
        if (!currentSuccess || currentSuccess === 'unknown') {
            stateManager.reportSuccess('passed');
        }
    }

    // Gather feedback and rating from the completion modal
    const { rating, comment } = getCompletionModalData();

    if (rating) {
        commentManager.addRating(rating);
    }

    if (comment) {
        commentManager.addComment(comment, 'course-completion');
    }

    // DEFENSIVE: Force an immediate commit after setting all completion data
    // This ensures completion + feedback is persisted even if subsequent operations fail
    await stateManager.flush();

    // Show saving indicator and give LMS time to persist before terminating
    _exitWithSavingDelay();
}

/**
 * Performs the actual exit with a brief delay to ensure LMS persistence.
 * Shows a "Saving..." indicator to prevent users from closing prematurely.
 * @private
 */
function _exitWithSavingDelay() {
    // Show saving indicator
    showNotification('Saving your progress...', 'info', 2000);

    // Brief delay to allow LMS to process the commit
    // This helps with LMSs that have slow backend persistence
    setTimeout(async () => {
        try {
            const exitResult = await stateManager.exitCourseComplete();

            if (exitResult) {
                eventBus.emit('ui:lockCourseForExit');
            } else {
                showNotification('We were unable to finalize the session automatically. Please close this window manually.', 'warning', 6000);
            }
        } catch (error) {
            logger.error(`Failed to complete exit: ${error.message}`, { domain: 'app', operation: 'completeAndExit', stack: error.stack });
            showNotification('We were unable to finalize the session automatically. Please close this window manually.', 'warning', 6000);
        }
    }, 500);
}

/**
 * Handles the initial click on the main exit button.
 * It checks for completion first; if not complete, it shows the exit confirmation modal.
 * In dev mode with gating disabled, allows immediate completion from the last slide.
 * @private
 */
async function _handleExitClick() {
    // Check completion status (handles normal completion flow)
    if (await checkCompletion()) {
        showCompletionModal();
        return;
    }

    // Dev mode override: if gating is disabled and we're on the last slide,
    // show completion modal even if requirements aren't met
    if (shouldBypassGating() && NavigationActions.isOnLastSlide()) {
        showCompletionModal();
        return;
    }

    eventBus.emit('ui:showModal', 'exit');
}


/**
 * Starts tracking time spent on a slide by recording start time in state.
 * If a timer is already running for this slide, it ends the previous session first.
 * @param {string} slideId - The ID of the slide to track.
 */
export function startSessionTimer(slideId) {
    if (!slideId) {
        throw new Error('[AppActions] startSessionTimer called without slideId');
    }

    const sessionData = stateManager.getDomainState('sessionData') || {};
    sessionData.slideStartTimes = sessionData.slideStartTimes || {};
    sessionData.slideDurations = sessionData.slideDurations || {};

    // If there's already a start time, end that session first
    const existingStartTime = sessionData.slideStartTimes[slideId];
    if (existingStartTime) {
        const duration = Date.now() - existingStartTime;
        sessionData.slideDurations[slideId] = (sessionData.slideDurations[slideId] || 0) + duration;
    }

    // Record new start time
    sessionData.slideStartTimes[slideId] = Date.now();
    stateManager.setDomainState('sessionData', sessionData);

    logger.debug(`[AppActions] Session timer started for: ${slideId}`);
}

/**
 * Ends the session timer for a slide and records the duration.
 * @param {string} slideId - The ID of the slide to stop tracking.
 * @returns {number|null} Duration in milliseconds, or null if no timer was active.
 */
export function endSessionTimer(slideId) {
    if (!slideId) {
        throw new Error('[AppActions] endSessionTimer called without slideId');
    }

    const sessionData = stateManager.getDomainState('sessionData') || {};
    sessionData.slideStartTimes = sessionData.slideStartTimes || {};
    sessionData.slideDurations = sessionData.slideDurations || {};

    const startTime = sessionData.slideStartTimes[slideId];
    if (!startTime) {
        return null; // No timer was active - expected behavior
    }

    const duration = Date.now() - startTime;
    sessionData.slideDurations[slideId] = (sessionData.slideDurations[slideId] || 0) + duration;
    delete sessionData.slideStartTimes[slideId];

    stateManager.setDomainState('sessionData', sessionData);
    logger.debug(`[AppActions] Session timer ended for: ${slideId}, duration: ${duration}ms`);
    return duration;
}

/**
 * Calculates the total session duration by summing all slide durations.
 * @returns {number} Total duration in milliseconds.
 */
export function getSessionDuration() {
    const sessionData = stateManager.getDomainState('sessionData') || {};
    const slideDurations = sessionData.slideDurations || {};
    return Object.values(slideDurations).reduce((total, duration) => total + duration, 0);
}

export function showCompletionModal() {
    const completionFeatures = courseConfig.completion || {};
    eventBus.emit('ui:prepareCompletionModal', {
        promptForComments: !!completionFeatures.promptForComments,
        promptForRating: !!completionFeatures.promptForRating,
    });
    eventBus.emit('ui:showModal', 'complete');
}

/**
 * Restarts the course by clearing all SCORM suspend data and reloading the page.
 * This is typically used when a learner has exhausted all assessment attempts.
 * WARNING: This cannot be undone - all progress will be lost.
 */
export async function restartCourse() {
    try {
        // Clear all suspend data
        await stateManager.clearAllData();

        // Reload the page to reinitialize from scratch
        // The beforeunload guard will not trigger since we're explicitly restarting
        window.location.reload();
    } catch (error) {
        logger.error(`Failed to restart course: ${error.message}`, { domain: 'app', operation: 'restartCourse', stack: error.stack });
        throw error;
    }
}
