/**
 * @file NavigationActions.js
 * @description Handles user interactions for course navigation and coordinates between state and UI.
 * @author Seth
 * @version 2.0.0
 */

import * as NavigationState from './NavigationState.js';
import * as NavigationUI from './NavigationUI.js';
import {
    shouldBypassEngagement
} from './navigation-helpers.js';
import {
    isSlideInSequence,
    validateSlideAccess,
    validateNavigationFrom
} from './navigation-validators.js';
import stateManager from '../state/index.js';
import * as CourseHelpers from '../utilities/course-helpers.js';
import * as AssessmentManager from '../managers/assessment-manager.js';
import * as AppActions from '../app/AppActions.js';
import * as AppUI from '../app/AppUI.js';
import { eventBus } from '../core/event-bus.js';
import engagementManager from '../engagement/engagement-manager.js';
import { logger } from '../utilities/logger.js';


let slides = [];
let menuTree = [];
let viewManager;
let assessmentConfigs = new Map();
let navigationLocked = false;
let isInitialized = false;

// Navigation queue for handling async navigation requests
const navigationQueue = [];
let isNavigating = false;

// Engagement progress handlers for current slide
let currentEngagementProgressHandler = null;
let currentEngagementCompleteHandler = null;

// ===== ERROR HANDLING =====

/**
 * Creates a standardized navigation error and emits error event.
 * Use this for actual system errors, NOT for expected user-facing blocks.
 * @private
 * @param {string} operation - The operation that failed
 * @param {string} message - Error message
 * @param {object} context - Additional context for debugging
 * @returns {Error} The created error object
 */
function _createNavigationError(operation, message, context = {}) {
    const error = new Error(`Navigation failed: ${message}`);
    logger.error(error.message, { domain: 'navigation', operation, stack: error.stack, ...context });
    return error;
}

/**
 * Creates a navigation block error WITHOUT emitting to error reporter.
 * Use this for expected user-facing blocks (gating conditions, sequence exclusions)
 * where the user is simply trying to access locked content.
 * @private
 * @param {string} message - User-facing message (already shown via notification)
 * @returns {Error} The created error object
 */
function _createNavigationBlockError(message) {
    return new Error(`Navigation blocked: ${message}`);
}

// ===== INITIALIZATION =====

/**
 * Initializes the navigation actions module.
 * Caches the course slide data and sets up event listeners for navigation controls.
 * @param {object[]} courseSlides - The course slide configuration array from `course-config.js`.
 * @param {object} viewManagerInstance - The view manager instance.
 * @param {object[]} courseMenuTree - The hierarchical menu tree from getMenuTree().
 * @param {Map} courseAssessmentConfigs - A map of assessment configurations from getAssessmentConfigs().
 */
export async function init(courseSlides, viewManagerInstance, courseMenuTree = [], courseAssessmentConfigs = new Map()) {
    if (!courseSlides || !Array.isArray(courseSlides)) {
        throw new Error('NavigationActions.init() requires a valid slides array');
    }
    if (!viewManagerInstance) {
        throw new Error('NavigationActions.init() requires a valid viewManager instance');
    }

    slides = courseSlides;
    viewManager = viewManagerInstance;
    menuTree = courseMenuTree;
    assessmentConfigs = courseAssessmentConfigs;
    navigationLocked = false;
    isInitialized = true;

    // Initialize NavigationState (no longer needs slides parameter)
    NavigationState.initializeNavigationState();

    // Store slides reference in NavigationState for getCurrentSlideId()
    NavigationState.setSlidesReference(courseSlides);

    // Render the menu on initialization
    const visitedSlides = NavigationState.getVisitedSlides();
    const accessibilityMap = checkAllSlidesAccessibility();
    NavigationUI.renderMenu(menuTree, visitedSlides, accessibilityMap);

    // Set up a single delegated event listener for all navigation controls
    document.body.addEventListener('click', (event) => {
        const actionTarget = event.target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;

        if (navigationLocked) {
            event.preventDefault();
            return;
        }

        switch (action) {
            case 'nav-menu-item':
                _handleMenuClick(event);
                break;
            case 'nav-prev':
                _handlePrevClick();
                break;
            case 'nav-next':
                _handleNextClick();
                break;
        }
    });

    // Re-sync navigation when state changes that might affect gating
    // Listen for state changes in domains that affect gating (assessment_*, objectives, flags)
    eventBus.on('state:changed', ({ domain }) => {
        // Only re-sync if the changed domain could affect gating conditions
        if (domain.startsWith('assessment_') || domain === 'objectives' || domain === 'flags') {
            sync();
        }
    });

    eventBus.on('ui:lockCourseForExit', () => {
        navigationLocked = true;
    });

    // Determine initial slide based on session type
    // - RESUME (cmi.entry === 'resume'): Use cmi.location (SCORM standard bookmark)
    // - FIRST LAUNCH (cmi.entry !== 'resume'): Use slide 0 (default start)
    let initialSlideId = null;
    const resumeSlideId = NavigationState.getResumeSlideId();

    if (resumeSlideId) {
        // RESUME: cmi.location contains bookmark (NavigationState already validated it's not empty)
        logger.debug('[NavigationActions] Resume session. Using cmi.location bookmark:', resumeSlideId);

        // Validate that the bookmarked slide exists in current course structure
        const resumeSlideIndex = await CourseHelpers.getSlideIndex(resumeSlideId);
        if (resumeSlideIndex === null || resumeSlideIndex === undefined) {
            // Bookmark references non-existent slide (course structure changed or corrupted)
            const errorMessage = `Invalid bookmark in cmi.location: slide "${resumeSlideId}" not found in course structure. ` +
                'This indicates the course structure has changed since the bookmark was created.';
            const errorContext = {
                resumeSlideId,
                availableSlides: slides.map(s => s.id).slice(0, 10), // First 10 for debugging
                totalSlides: slides.length
            };

            if (import.meta.env.DEV) {
                // Dev mode: FAIL FAST to help developers identify stale data issues
                throw _createNavigationError('resume', errorMessage, errorContext);
            } else {
                // Production mode: Gracefully recover by starting from the beginning
                logger.warn(`[NavigationActions] ${errorMessage} Reverting to slide 0.`);
                eventBus.emit('state:recovered', {
                    domain: 'navigation',
                    message: errorMessage,
                    context: errorContext,
                    action: 'reverted_to_slide_0'
                });
                // Fall through to FIRST LAUNCH behavior
                const initialIndex = 0;
                NavigationState.setCurrentSlideIndex(initialIndex);
                initialSlideId = slides[initialIndex]?.id;
                NavigationState.clearResumeSlideId();
            }
        } else {
            initialSlideId = resumeSlideId;
            // Update internal state to match cmi.location
            NavigationState.setCurrentSlideIndex(resumeSlideIndex);

            // Clear resume flag after processing
            NavigationState.clearResumeSlideId();
        }
    } else {
        // FIRST LAUNCH: Start at beginning (currentSlideIndex defaults to 0 in NavigationState)
        const initialIndex = NavigationState.getCurrentSlideIndex();
        initialSlideId = slides[initialIndex]?.id;
        logger.debug('[NavigationActions] First launch. Starting at slide index:', initialIndex);
    }

    if (!initialSlideId) {
        throw _createNavigationError(
            'initial-load',
            'Could not determine initial slide. Check course-config.js structure.',
            { resumeSlideId, currentIndex: NavigationState.getCurrentSlideIndex() }
        );
    }

    try {
        // Navigate to initial slide and set bookmark
        // Pass updateBookmark=true to ensure cmi.location is set after initialization completes
        // This is critical for both first launch (set initial bookmark) and resume (confirm successful navigation)
        await goToSlide(initialSlideId, {}, true);
    } catch (error) {
        // Check if this is a navigation block (gating/sequence issue on resume)
        const isBlockError = error.message?.includes('Navigation blocked:');

        if (isBlockError && resumeSlideId) {
            // Resume attempted to navigate to a now-gated slide
            // This should NOT happen in normal operation - it indicates:
            // 1. Course structure changed after learner started
            // 2. Prerequisite state was lost/corrupted
            // 3. A bug in bookmark setting (bookmark set before gating check)

            if (import.meta.env.DEV) {
                // DEV MODE: FAIL FAST to help identify the root cause
                // The bookmark should NEVER be set to a slide that gating would block
                throw _createNavigationError(
                    'resume',
                    'BOOKMARK INCONSISTENCY: cmi.location="' + resumeSlideId + '" points to a gated slide. ' +
                    'This indicates either: (1) course structure changed after learner started, ' +
                    '(2) prerequisite state was lost, or (3) a bug in bookmark setting. ' +
                    'Original error: ' + error.message,
                    {
                        bookmarkedSlide: resumeSlideId,
                        blockReason: error.message
                    }
                );
            }

            // PRODUCTION: Gracefully recover by finding the first accessible slide
            // BUT still report this as an error - it indicates LMS/course state corruption
            logger.warn(`[NavigationActions] Bookmarked slide "${initialSlideId}" is now gated. Finding first accessible slide.`);

            const fallbackSlide = _findFirstAccessibleSlide();
            if (fallbackSlide) {
                // Report this anomaly - graceful recovery doesn't mean it's not a problem
                logger.error(`Bookmark inconsistency: cmi.location="${initialSlideId}" points to a gated slide. Recovered to "${fallbackSlide.id}".`, {
                    domain: 'navigation', operation: 'resume',
                    bookmarkedSlide: initialSlideId, fallbackSlide: fallbackSlide.id,
                    blockReason: error.message, action: 'graceful_recovery'
                });

                eventBus.emit('state:recovered', {
                    domain: 'navigation',
                    message: `Bookmarked slide "${initialSlideId}" is no longer accessible. Starting from "${fallbackSlide.id}".`,
                    context: {
                        originalSlide: initialSlideId,
                        fallbackSlide: fallbackSlide.id,
                        reason: 'gating-condition-on-resume'
                    },
                    action: 'reverted_to_accessible_slide'
                });

                // Try navigating to the fallback slide
                await goToSlide(fallbackSlide.id, {}, true);
                logger.debug('NavigationActions initialized (with fallback to accessible slide).');
                return; // Success with fallback
            }

            // No accessible slides found - this is a course configuration error
            throw _createNavigationError(
                'initial-load',
                'No accessible slides found. Check course gating configuration.',
                { originalSlide: initialSlideId }
            );
        }

        // For other errors, emit and re-throw
        logger.error(error.message, { domain: 'navigation', operation: 'initial-load', stack: error.stack, slideId: initialSlideId });
        throw error;
    }

    logger.debug('NavigationActions initialized.');
}

/**
 * Finds the first slide that is accessible (passes gating conditions).
 * @private
 * @returns {object|null} The first accessible slide, or null if none found
 */
function _findFirstAccessibleSlide() {
    for (const slide of slides) {
        // Check if slide is in sequence
        if (!isSlideInSequence(slide, stateManager, assessmentConfigs)) {
            continue;
        }

        // Check if slide passes gating conditions
        const accessCheck = validateSlideAccess(slide, stateManager, assessmentConfigs);
        if (accessCheck.allowed) {
            return slide;
        }
    }
    return null;
}

/**
 * Throws an error if NavigationActions has not been initialized.
 * @private
 */
function _requireInitialized() {
    if (!isInitialized) {
        throw new Error('NavigationActions not initialized. Call init() first.');
    }
}

/**
 * Indicates whether NavigationActions has finished initialization.
 * @returns {boolean}
 */
export function isReady() {
    return isInitialized;
}


// ===== ENGAGEMENT TRACKING =====

/**
 * Updates the engagement indicator UI for the current slide.
 * Shows/hides the indicator and updates progress based on slide config.
 * @private
 * @param {object} slide - The current slide object
 */
function _updateEngagementIndicator(slide) {
    if (!slide || !slide.engagement) {
        NavigationUI.hideEngagementIndicator();
        return;
    }

    const engagement = slide.engagement;

    // Show indicator if engagement is required (showIndicator defaults to true)
    const showIndicator = engagement.showIndicator ?? true;
    if (engagement.required && showIndicator) {
        const progress = engagementManager.getProgress(slide.id);
        if (progress) {
            NavigationUI.showEngagementIndicator(progress);
        }
    } else {
        NavigationUI.hideEngagementIndicator();
    }
}

/**
 * Sets up engagement tracking event listeners for the current slide.
 * Cleans up previous listeners and attaches new ones for progress updates.
 * @private
 * @param {object} slide - The current slide object
 */
function _setupEngagementListeners(slide) {
    // Clean up previous listeners if they exist
    if (currentEngagementProgressHandler) {
        eventBus.off('engagement:progress', currentEngagementProgressHandler);
    }
    if (currentEngagementCompleteHandler) {
        eventBus.off('engagement:complete', currentEngagementCompleteHandler);
    }

    // Set up listeners if engagement tracking is required (regardless of indicator visibility)
    if (slide && slide.engagement && slide.engagement.required) {
        // Progress handler - updates indicator and navigation state in real-time
        currentEngagementProgressHandler = ({ slideId, progress }) => {
            if (slideId === slide.id) {
                // Update indicator if visible (defaults to true)
                if (slide.engagement.showIndicator ?? true) {
                    NavigationUI.showEngagementIndicator(progress);
                }
                // Always sync navigation state since completion affects sidebar/buttons
                sync();
            }
        };

        // Complete handler - triggers when all requirements are met
        currentEngagementCompleteHandler = ({ slideId }) => {
            if (slideId === slide.id) {
                // Trigger completion animation directly
                NavigationUI.triggerEngagementCompleteAnimation();

                // Update indicator if visible (defaults to true)
                if (slide.engagement.showIndicator ?? true) {
                    const progress = engagementManager.getProgress(slideId);
                    if (progress) {
                        NavigationUI.showEngagementIndicator(progress);
                    }
                }
                // Always sync navigation state to enable next button and unlock sidebar items
                sync();
            }
        };

        eventBus.on('engagement:progress', currentEngagementProgressHandler);
        eventBus.on('engagement:complete', currentEngagementCompleteHandler);

        // Time tracking is now handled by EngagementManager internally
        // It emits engagement:progress events which we listen to above
    }
}


/**
 * Resolves the next slide that should appear in the sequential flow, skipping
 * any slides that are currently excluded by sequence rules.
 * @private
 * @param {number} currentIndex - Index of the current slide.
 * @returns {{index: number|null, slide: object|null, accessCheck: {allowed: boolean, message: string|null}}}
 */
function _getNextIncludedSlideInfo(currentIndex) {
    for (let i = currentIndex + 1; i < slides.length; i++) {
        const candidate = slides[i];
        if (!isSlideInSequence(candidate, stateManager, assessmentConfigs)) {
            continue;
        }

        return {
            index: i,
            slide: candidate,
            accessCheck: validateSlideAccess(candidate, stateManager, assessmentConfigs),
        };
    }

    return {
        index: null,
        slide: null,
        accessCheck: { allowed: true, message: null },
    };
}

/**
 * Resolves the previous slide in the sequential flow, skipping excluded slides.
 * @private
 * @param {number} currentIndex - Index of the current slide.
 * @returns {{index: number|null, slide: object|null, accessCheck: {allowed: boolean, message: string|null}}}
 */
function _getPreviousIncludedSlideInfo(currentIndex) {
    for (let i = currentIndex - 1; i >= 0; i--) {
        const candidate = slides[i];
        if (!isSlideInSequence(candidate, stateManager, assessmentConfigs)) {
            continue;
        }

        return {
            index: i,
            slide: candidate,
            accessCheck: validateSlideAccess(candidate, stateManager, assessmentConfigs),
        };
    }

    return {
        index: null,
        slide: null,
        accessCheck: { allowed: true, message: null },
    };
}


/**
 * Handles click events on the navigation menu, delegating to `navigateToSlide`.
 * @private
 * @param {Event} event - The DOM click event.
 */
function _handleMenuClick(event) {
    event.preventDefault();
    const target = event.target.closest('[data-action="nav-menu-item"]');
    if (!target) return;

    // Do not navigate if the item is locked
    // Check both .locked class and aria-disabled attribute for robustness
    const link = target.querySelector('button');
    if (target.classList.contains('locked') || (link && link.getAttribute('aria-disabled') === 'true')) {
        // Tooltip will show on hover to explain why it's locked
        return;
    }

    const slideId = target.dataset.slideId;
    if (slideId) {
        goToSlide(slideId).catch(error => {
            // Error is already emitted via eventBus in goToSlide, 
            // but we catch it here to prevent unhandled promise rejection
            logger.warn('Navigation failed:', error.message);
        });
    }
}

/**
 * Handles clicks on the 'previous' button.
 * @private
 */
function _handlePrevClick() {
    goToPreviousAvailableSlide().catch(error => {
        logger.warn('Navigation failed:', error.message);
    });
}

/**
 * Handles clicks on the 'next' button.
 * @private
 */
function _handleNextClick() {
    goToNextAvailableSlide().catch(error => {
        logger.warn('Navigation failed:', error.message);
    });
}



/**
 * Navigates to a specific slide by its ID, handling all accessibility and timing logic.
 * This is the primary and sole function for all course navigation.
 * Uses a queue to serialize navigation requests and prevent race conditions.
 * @param {string} slideId - The ID of the slide to navigate to.
 * @param {object} [context={}] - An optional context object to pass to the slide's render function.
 */
export async function goToSlide(slideId, context = {}, updateBookmark = true) {
    _requireInitialized();

    // Queue the navigation request to prevent race conditions
    return new Promise((resolve, reject) => {
        navigationQueue.push({ slideId, context, updateBookmark, resolve, reject });
        _processNavigationQueue();
    });
}

/**
 * Processes the navigation queue, executing one navigation request at a time.
 * @private
 */
async function _processNavigationQueue() {
    if (isNavigating || navigationQueue.length === 0) {
        return;
    }

    isNavigating = true;
    const { slideId, context, updateBookmark, resolve, reject } = navigationQueue.shift();

    try {
        await _performNavigation(slideId, context, updateBookmark);
        resolve();
    } catch (error) {
        reject(error);
    } finally {
        isNavigating = false;
        _processNavigationQueue(); // Process next request in queue
    }
}

/**
 * Performs the actual navigation to a slide. This is the internal implementation.
 * @private
 * @param {string} slideId - The ID of the slide to navigate to.
 * @param {object} [context={}] - An optional context object to pass to the slide's render function.
 */
async function _performNavigation(slideId, context = {}, updateBookmark = true) {
    if (navigationLocked) {
        throw _createNavigationError(
            'goToSlide',
            'Navigation is locked. Course is in exit process.',
            { slideId }
        );
    }

    const slideIndex = await CourseHelpers.getSlideIndex(slideId);
    if (slideIndex === null || slideIndex === undefined) {
        throw _createNavigationError(
            'goToSlide',
            `Slide "${slideId}" not found in course structure. Check that the slide ID exists in course-config.js.`,
            {
                slideId,
                availableSlides: slides.map(s => s.id)
            }
        );
    }

    const newSlide = slides[slideIndex];
    if (!newSlide) {
        throw _createNavigationError(
            'goToSlide',
            `Slide at index ${slideIndex} is undefined. This indicates a data consistency issue.`,
            { slideId, slideIndex }
        );
    }

    if (!isSlideInSequence(newSlide, stateManager, assessmentConfigs)) {
        const sequenceMessage = newSlide.navigation?.sequence?.message || 'This content is not available right now.';
        AppActions.showNotification(sequenceMessage, 'info', 3000);
        eventBus.emit('navigation:blocked', {
            slideId: newSlide.id,
            slideIndex,
            message: sequenceMessage,
            reason: 'sequence-excluded',
        });
        // Use block error (not system error) - user is trying to access excluded content
        throw _createNavigationBlockError(sequenceMessage);
    }

    // Check if the destination slide is accessible (gating conditions)
    const accessCheck = validateSlideAccess(newSlide, stateManager, assessmentConfigs);
    if (!accessCheck.allowed) {
        AppActions.showNotification(accessCheck.message, 'info', 3000);
        eventBus.emit('navigation:blocked', {
            slideId: newSlide.id,
            slideIndex: slideIndex,
            message: accessCheck.message,
            reason: 'gating-condition'
        });
        // Use block error (not system error) - user is trying to skip locked content
        throw _createNavigationBlockError(accessCheck.message);
    }

    // Announce that navigation is about to happen and mark the PREVIOUS slide as visited.
    const previousSlideIndex = NavigationState.getCurrentSlideIndex();
    let previousSlideId = null;
    if (previousSlideIndex !== slideIndex) {
        const previousSlide = slides[previousSlideIndex];
        if (previousSlide) {
            previousSlideId = previousSlide.id;
            // Mark the slide we are LEAVING as visited.
            NavigationState.addVisitedSlide(previousSlide.id);
            sync(); // Run sync to update the UI for the slide we just left.

            eventBus.emit('navigation:beforeChange', { fromSlideId: previousSlide.id });
        }
    }

    // Update UI for the NEW slide
    NavigationUI.setActiveItem(newSlide.id);

    // Restore footer visibility before showing new slide
    // Assessments will hide it again if needed during their initialization
    AppUI.showFooter();

    // Update current slide index BEFORE rendering so that declarative components
    // (tabs, accordion, etc.) can correctly use getCurrentSlideId() during initialization.
    // This ensures engagement tracking registers to the correct slide.
    NavigationState.setCurrentSlideIndex(slideIndex);

    // Show the slide view (this calls initSlide which registers interactions)
    await viewManager.showView(newSlide.id, { ...context, fromSlide: previousSlideId });

    // Reset scroll position to top of new slide
    // Users expect to start reading from the top when navigating to a new slide
    const contentArea = document.querySelector('main#content');
    if (contentArea) {
        contentArea.scrollTo(0, 0);
    }

    // Check engagement completion after slide has been initialized
    const canNavigateFrom = validateNavigationFrom(newSlide, assessmentConfigs);
    const nextInfo = _getNextIncludedSlideInfo(slideIndex);
    const isNextAccessible = nextInfo.accessCheck;

    // Check engagement requirements (with dev mode bypass)
    let engagementComplete = true;
    let engagementProgress = null;

    if (!shouldBypassEngagement()) {
        const engagementEvaluation = engagementManager.evaluateRequirements(newSlide.id);
        engagementComplete = engagementEvaluation.complete;
        engagementProgress = engagementEvaluation.progress;
    }

    const nextBlocked = !engagementComplete || !canNavigateFrom.allowed || !isNextAccessible.allowed;
    const nextBlockedMessage = !engagementComplete
        ? engagementProgress?.tooltip
        : (canNavigateFrom.message || isNextAccessible.message);

    NavigationUI.updateNavButtonState({
        isFirstSlide: slideIndex === 0,
        isLastSlide: nextInfo.slide === null,
        nextBlocked,
        nextBlockedMessage,
        engagementProgress: engagementProgress?.percentage ?? null,
    });

    // Update header progress indicator
    const sequentialSlides = slides.filter(s => isSlideInSequence(s, stateManager, assessmentConfigs));
    const currentSequentialIndex = sequentialSlides.findIndex(s => s.id === slideId);
    const visitedCount = NavigationState.getVisitedSlides().filter(id => sequentialSlides.some(s => s.id === id)).length;
    NavigationUI.updateHeaderProgress(currentSequentialIndex >= 0 ? currentSequentialIndex : slideIndex, sequentialSlides.length, visitedCount);

    // NOTE: Do NOT mark the new slide as visited here.
    // Slides are marked as visited when the user LEAVES them,
    // so that cmi.progress_measure accurately reflects completed content, not just entered content.

    // Set up engagement indicator and listeners for the new slide
    _setupEngagementListeners(newSlide);
    _updateEngagementIndicator(newSlide);

    // Update progress measure to reflect slide visit
    // Count only sequential slides (excludes remedial/conditional slides)
    const totalSequentialSlides = slides.filter(s => isSlideInSequence(s, stateManager, assessmentConfigs)).length;
    stateManager.updateProgressMeasure(totalSequentialSlides);

    // Set bookmark as FINAL step after successful navigation
    // We use slide ID as the bookmark value (unique, stable, human-readable)
    // This is done LAST to ensure we only bookmark after we've successfully navigated
    if (updateBookmark) {
        try {
            stateManager.setBookmark(newSlide.id);
        } catch (error) {
            // FAIL FAST, FAIL LOUD: Report via unified logger and re-throw
            logger.error(`Failed to set bookmark: ${error.message}`, {
                domain: 'navigation', operation: 'setBookmark', stack: error.stack,
                slideId: newSlide.id, slideIndex
            });
            throw error; // Re-throw to halt navigation
        }
    }

    // Sync navigation state after slide is fully loaded
    // This ensures button states reflect any engagement tracking that happened during slide render
    sync();

    // Announce that navigation has completed.
    // Include fromSlideId so xapi-statement-service can send 'experienced' statements
    eventBus.emit('navigation:changed', { fromSlideId: previousSlideId, toSlideId: newSlide.id, slideTitle: newSlide.title || null });

    // Announce that a navigation change may trigger a completion check.
    eventBus.emit('navigation:completeCheck');
}

/**
 * Resets the navigation state, marking all slides as unvisited and setting the current slide to the first one.
 * Useful for restarting the course or resetting progress.
 */
export function resetNavigation() {
    _requireInitialized();

    // Reset the internal state
    NavigationState.setCurrentSlideIndex(0);
    NavigationState.clearVisitedSlides();

    // Update the UI to reflect the reset state
    NavigationUI.setActiveItem(slides[0]?.id);

    const firstSlide = slides[0];
    const navigationCheck = validateNavigationFrom(firstSlide, assessmentConfigs);
    NavigationUI.updateNavButtonState({
        isFirstSlide: true,
        isLastSlide: slides.length === 1,
        nextBlocked: !navigationCheck.allowed,
        nextBlockedMessage: navigationCheck.message,
    });

    // Optionally, you could also trigger a view refresh
    viewManager.showView(slides[0]?.id);
}

/**
 * Checks the accessibility of all slides based on their gating conditions AND engagement requirements.
 * A slide is inaccessible if:
 * 1. It's excluded by sequence rules
 * 2. Its gating conditions are not met
 * 3. Any previous slide in the sequence has incomplete engagement requirements
 * @returns {Map<string, {allowed: boolean, message: string|null}>} A map of slide accessibility states.
 */
export function checkAllSlidesAccessibility() {
    _requireInitialized();

    const accessibilityMap = new Map();
    const visitedSlides = NavigationState.getVisitedSlides();
    const currentIndex = NavigationState.getCurrentSlideIndex();
    const currentSlide = slides[currentIndex];

    // Build the accessibility map
    slides.forEach((slide, index) => {
        const include = isSlideInSequence(slide, stateManager, assessmentConfigs);

        if (!include) {
            accessibilityMap.set(slide.id, {
                allowed: false,
                message: slide.navigation?.sequence?.message || 'This content is not available right now.'
            });
            return;
        }

        // Check gating conditions
        const accessCheck = validateSlideAccess(slide, stateManager, assessmentConfigs);
        if (!accessCheck.allowed) {
            accessibilityMap.set(slide.id, accessCheck);
            return;
        }

        // Current slide is always accessible (we're already on it)
        if (currentSlide && slide.id === currentSlide.id) {
            accessibilityMap.set(slide.id, { allowed: true, message: null });
            return;
        }

        // Check if any PREVIOUS slide (visited or not) has required engagement
        // If a slide hasn't been visited but has required engagement, it blocks forward navigation
        // Check previous engagement (with dev mode bypass)
        let hasIncompleteEngagement = false;
        let incompleteSlideTitle = null;

        if (!shouldBypassEngagement()) {
            for (let i = 0; i < index; i++) {
                const previousSlide = slides[i];

                // Only check slides that are in sequence
                if (isSlideInSequence(previousSlide, stateManager, assessmentConfigs)) {
                    // Check if this slide has required engagement
                    const slideEngagement = previousSlide.engagement;
                    const hasRequiredEngagement = slideEngagement && slideEngagement.required === true;

                    if (hasRequiredEngagement) {
                        // If visited, check if engagement is complete
                        if (visitedSlides.includes(previousSlide.id)) {
                            const evaluation = engagementManager.evaluateRequirements(previousSlide.id);
                            if (!evaluation.complete) {
                                hasIncompleteEngagement = true;
                                incompleteSlideTitle = previousSlide.title || previousSlide.id;
                                break;
                            }
                        } else {
                            // Not visited but has required engagement - blocks forward navigation
                            hasIncompleteEngagement = true;
                            incompleteSlideTitle = previousSlide.title || previousSlide.id;
                            break;
                        }
                    }
                }
            }
        }

        if (hasIncompleteEngagement) {
            const message = incompleteSlideTitle
                ? `Complete all required content in "${incompleteSlideTitle}" before continuing.`
                : 'Complete all required content on previous slides before continuing.';
            accessibilityMap.set(slide.id, {
                allowed: false,
                message
            });
            return;
        }

        // Slide is accessible
        accessibilityMap.set(slide.id, { allowed: true, message: null });
    });

    return accessibilityMap;
}

/**
 * Manually triggers a sync of the navigation state with the current data.
 * This can be used after bulk updates to the state or slides configuration.
 */
export function sync() {
    _requireInitialized();

    const currentIndex = NavigationState.getCurrentSlideIndex();
    const currentSlide = slides[currentIndex];

    // Re-evaluate all slides' accessibility and update the UI accordingly
    const accessibilityMap = checkAllSlidesAccessibility();
    for (const [slideId, accessCheck] of accessibilityMap.entries()) {
        if (accessCheck.allowed) {
            NavigationUI.markAsUnlocked(slideId);
        } else {
            NavigationUI.markAsLocked(slideId);
        }
    }

    // Update section locked states based on child accessibility
    NavigationUI.updateSectionStates(accessibilityMap);

    // Determine and update the 'visited' status for all slides
    const visitedSlides = NavigationState.getVisitedSlides();
    slides.forEach(slide => {
        const hasBeenVisited = visitedSlides.includes(slide.id);

        if (slide.type === 'assessment') {
            const config = assessmentConfigs.get(slide.assessmentId);
            const requirements = config?.completionRequirements;
            let requirementsMet = false;

            // Only check requirements if they are defined in the assessment's config
            if (requirements) {
                requirementsMet = AssessmentManager.meetsCompletionRequirements(slide.assessmentId, requirements);
            }

            // Mark as "visited" (i.e., show checkmark) only if visited AND requirements are met.
            // If an assessment has no requirements, it cannot get a checkmark.
            if (hasBeenVisited && requirementsMet) {
                NavigationUI.markAsVisited(slide.id);
            } else {
                NavigationUI.markAsUnvisited(slide.id);
            }
        } else {
            // For regular slides, mark as visited if simply visited
            if (hasBeenVisited) {
                NavigationUI.markAsVisited(slide.id);
            } else {
                NavigationUI.markAsUnvisited(slide.id);
            }
        }
    });

    // Check both if we can leave the current slide and if the next slide is accessible
    const canNavigateFrom = validateNavigationFrom(currentSlide, assessmentConfigs);
    const nextInfo = _getNextIncludedSlideInfo(currentIndex);
    const isNextAccessible = nextInfo.accessCheck;

    // Check engagement requirements (with dev mode bypass)
    let engagementComplete = true;
    let engagementProgress = null;

    if (!shouldBypassEngagement()) {
        const engagementEvaluation = engagementManager.evaluateRequirements(currentSlide.id);
        engagementComplete = engagementEvaluation.complete;
        engagementProgress = engagementEvaluation.progress;
    }

    const isFirstSlide = currentIndex === 0;
    const isLastSlide = nextInfo.slide === null;
    const nextBlocked = !engagementComplete || !canNavigateFrom.allowed || !isNextAccessible.allowed;
    const nextBlockedMessage = !engagementComplete
        ? engagementProgress?.tooltip
        : (canNavigateFrom.message || isNextAccessible.message);

    // Update navigation button states with blocking information
    NavigationUI.updateNavButtonState({
        isFirstSlide,
        isLastSlide,
        nextBlocked,
        nextBlockedMessage,
        engagementProgress: engagementProgress?.percentage ?? null,
    });

    // Update header progress indicator
    const sequentialSlides = slides.filter(s => isSlideInSequence(s, stateManager, assessmentConfigs));
    const currentSequentialIndex = sequentialSlides.findIndex(s => s.id === currentSlide.id);
    const visitedCount = NavigationState.getVisitedSlides().filter(id => sequentialSlides.some(s => s.id === id)).length;
    NavigationUI.updateHeaderProgress(currentSequentialIndex >= 0 ? currentSequentialIndex : currentIndex, sequentialSlides.length, visitedCount);
}

/**
 * Moves to the next sequential slide if available.
 * Checks for navigation.controls.nextTarget or exitTarget overrides before using sequential navigation.
 */
export async function goToNextAvailableSlide() {
    _requireInitialized();

    if (navigationLocked) {
        throw _createNavigationError(
            'goToNextAvailableSlide',
            'Navigation is locked. Course is in exit process.',
            {}
        );
    }

    const currentIndex = NavigationState.getCurrentSlideIndex();
    const currentSlide = slides[currentIndex];

    // Check engagement requirements (with dev mode bypass)
    if (!shouldBypassEngagement()) {
        const evaluation = engagementManager.evaluateRequirements(currentSlide.id);

        if (!evaluation.complete) {
            // Don't show notification - the tooltip on the disabled button already shows the message
            eventBus.emit('navigation:blocked', {
                reason: 'engagement_incomplete',
                slideId: currentSlide.id,
                unmetRequirements: evaluation.unmetRequirements
            });
            return;
        }
    }

    const navigationCheck = validateNavigationFrom(currentSlide, assessmentConfigs);
    if (!navigationCheck.allowed) {
        AppActions.showNotification(navigationCheck.message, 'warning', 3000);
        return;
    }

    // Check for custom navigation targets (nextTarget or exitTarget)
    const controls = currentSlide.navigation?.controls;
    const targetSlideId = controls?.nextTarget || controls?.exitTarget;

    if (targetSlideId) {
        // Custom target specified - navigate directly to it
        await goToSlide(targetSlideId);
        return;
    }

    // Default sequential navigation
    const { slide } = _getNextIncludedSlideInfo(currentIndex);
    if (!slide) {
        return; // Already at the end of the active sequence
    }

    await goToSlide(slide.id);
}

/**
 * Moves to the previous sequential slide if available.
 * Checks for navigation.controls.previousTarget override before using sequential navigation.
 */
export async function goToPreviousAvailableSlide() {
    _requireInitialized();

    if (navigationLocked) {
        throw _createNavigationError(
            'goToPreviousAvailableSlide',
            'Navigation is locked. Course is in exit process.',
            {}
        );
    }

    const currentIndex = NavigationState.getCurrentSlideIndex();
    const currentSlide = slides[currentIndex];

    // Check for custom navigation target (previousTarget)
    const controls = currentSlide.navigation?.controls;
    const targetSlideId = controls?.previousTarget;

    if (targetSlideId) {
        // Custom target specified - navigate directly to it
        await goToSlide(targetSlideId);
        return;
    }

    // Default sequential navigation
    const { slide } = _getPreviousIncludedSlideInfo(currentIndex);
    if (!slide) {
        return;
    }

    await goToSlide(slide.id);
}

/**
 * Returns data about the next slide in the active sequence relative to the current slide.
 * @returns {{index: number|null, slide: object|null, accessCheck: {allowed: boolean, message: string|null}}}
 */
export function getNextSequentialSlideInfo() {
    _requireInitialized();

    const currentIndex = NavigationState.getCurrentSlideIndex();
    return _getNextIncludedSlideInfo(currentIndex);
}

/**
 * Returns data about the previous slide in the active sequence relative to the current slide.
 * @returns {{index: number|null, slide: object|null, accessCheck: {allowed: boolean, message: string|null}}}
 */
export function getPreviousSequentialSlideInfo() {
    _requireInitialized();

    const currentIndex = NavigationState.getCurrentSlideIndex();
    return _getPreviousIncludedSlideInfo(currentIndex);
}


/**
 * Gets the list of all slides in the course.
 * @returns {object[]} The array of course slides.
 */
export function getAllSlides() {
    _requireInitialized();
    return slides;
}

/**
 * Gets the current slide object.
 * @returns {object|null} The current slide, or null if not found.
 */
export function getCurrentSlide() {
    _requireInitialized();
    const currentIndex = NavigationState.getCurrentSlideIndex();
    return slides[currentIndex] || null;
}

/**
 * Gets the ID of the current slide.
 * @returns {string|null} The ID of the current slide, or null if not found.
 */
export function getCurrentSlideId() {
    _requireInitialized();
    const currentSlide = getCurrentSlide();
    return currentSlide ? currentSlide.id : null;
}

/**
 * Gets the menu tree structure for the course.
 * @returns {object[]} The hierarchical menu tree array.
 */
export function getMenuTree() {
    _requireInitialized();
    return menuTree;
}

/**
 * Checks if the user is currently on the last slide.
 * @returns {boolean} True if on the last slide, false otherwise.
 */
export function isOnLastSlide() {
    _requireInitialized();
    const nextInfo = getNextSequentialSlideInfo();
    return nextInfo.slide === null;
}

/**
 * @module NavigationActions
 * This module manages the navigation actions within the course player,
 * handling user interactions and coordinating between the application state and the UI.
 *
 * @example
 * import { NavigationActions } from 'path/to/NavigationActions';
 *
 * // Initialize the navigation actions with course data
 * NavigationActions.init(courseSlides, viewManagerInstance, courseMenuTree);
 *
 * // Manually navigate to a specific slide
 * NavigationActions.goToSlide('welcome-slide');
 *
 * // Reset the navigation state (e.g., on course restart)
 * NavigationActions.resetNavigation();
 */
