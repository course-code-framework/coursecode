/**
 * @file NavigationState.js
 * @description Manages the state for course navigation, including slide progression
 * and visited status. It persists its state through the StateManager.
 * 
 * NOTE: currentSlideIndex is NOT persisted - cmi.location is the authoritative bookmark.
 */
import stateManager from '../state/index.js';
import { deepClone as _deepClone } from '../utilities/utilities.js';
import { eventBus } from '../core/event-bus.js';
import { logger } from '../utilities/logger.js';

const DOMAIN_KEY = 'navigation';
const SOURCE = 'navigation-state';

let isInitialized = false;

// Internal state
const state = {
    currentSlideIndex: 0,      // Runtime only, not persisted - cmi.location is authoritative
    visitedSlides: [],         // Array of slide IDs (persisted)
    resumeSlideId: null,       // Runtime only, cleared after processing
};

// Stores reference to slides array for ID lookup
let slidesList = [];

/**
 * Initializes the navigation state from the StateManager.
 * According to SCORM spec, on resume the course should check cmi.location
 * to determine where to start, then use suspend_data for additional state.
 * @throws {Error} If already initialized
 */
export function initializeNavigationState() {
    if (isInitialized) {
        throw new Error('NavigationState: Already initialized. Do not call initializeNavigationState() more than once.');
    }

    const persistedState = stateManager.getDomainState(DOMAIN_KEY);

    // Check resume status via semantic driver reads
    let resumeSlideId = null;
    
    // Read entry mode from driver (ab-initio, resume, etc.)
    const entry = stateManager.getEntryMode();

    if (entry === 'resume') {
        // Read bookmark from driver to determine starting point
        try {
            resumeSlideId = stateManager.getBookmark();
            logger.debug('[NavigationState] Resume detected. Bookmark:', resumeSlideId || '(empty)');

            // Handle empty cmi.location on resume
            // This can happen due to LMS bugs, network issues during previous session,
            // or data corruption. The course itself always sets cmi.location on navigation.
            if (!resumeSlideId) {
                const errorMessage = 
                    'NavigationState: Resume session detected but cmi.location is empty. ' +
                    'This indicates the course failed to set bookmarks during navigation, ' +
                    'or the LMS failed to persist the bookmark. ' +
                    'Check that NavigationActions properly sets cmi.location on every slide change.';
                const errorContext = { key: 'cmi.location', entry, value: resumeSlideId };

                if (import.meta.env.DEV) {
                    // Dev mode: FAIL FAST to help developers identify bookmark issues
                    logger.fatal(errorMessage, { domain: 'state', operation: 'resume', ...errorContext });
                } else {
                    // Production mode: Gracefully recover by treating as first launch
                    // This prevents users from being blocked by LMS data issues
                    logger.warn(`[NavigationState] ${errorMessage} Recovering by starting from beginning.`);
                    eventBus.emit('state:recovered', {
                        domain: 'state',
                        operation: 'resume',
                        message: errorMessage,
                        context: errorContext,
                        action: 'treated_as_first_launch'
                    });
                    // resumeSlideId stays null, which will trigger first-launch behavior
                }
            }
        } catch (locationError) {
            // Handle errors reading cmi.location
            const errorMessage = `Failed to read cmi.location on resume: ${locationError.message}`;
            const errorContext = { key: 'cmi.location', entry };

            if (import.meta.env.DEV) {
                // Dev mode: FAIL FAST
                logger.fatal(errorMessage, { domain: 'state', operation: 'getValue', ...errorContext });
            } else {
                // Production mode: Gracefully recover
                logger.warn(`[NavigationState] ${errorMessage} Recovering by starting from beginning.`);
                eventBus.emit('state:recovered', {
                    domain: 'state',
                    operation: 'getValue',
                    message: errorMessage,
                    context: errorContext,
                    action: 'treated_as_first_launch'
                });
                // resumeSlideId stays null, which will trigger first-launch behavior
            }
        }
    } else {
        // First launch: cmi.location will be empty, use default (slide 0)
        logger.debug('[NavigationState] First launch detected (cmi.entry is not "resume"). Starting from beginning.');
    }

    if (persistedState) {
        logger.debug('[NavigationState] Restoring state from LMS suspend_data:', persistedState);

        // Restore visitedSlides as array of IDs
        // NOTE: currentSlideIndex is NOT restored from suspend_data - cmi.location is authoritative
        if (Array.isArray(persistedState.visitedSlides)) {
            state.visitedSlides = [...persistedState.visitedSlides];
        }
    } else {
        logger.debug('[NavigationState] No persisted state found in suspend_data.');
    }

    // Store resumeSlideId for later resolution (needs slides array which isn't available yet)
    // NavigationActions.init() will handle converting slideId to index
    state.resumeSlideId = resumeSlideId;

    isInitialized = true;
    logger.debug('[NavigationState] Initialized:', state);
};

/**
 * Gets the current navigation state.
 * @returns {object} A deep clone of the current state.
 */
export function getNavigationState() {
    return {
        currentSlideIndex: state.currentSlideIndex,
        visitedSlides: [...state.visitedSlides],
        resumeSlideId: state.resumeSlideId
    };
};

/**
 * Gets the current slide index.
 * @returns {number} The index of the current slide.
 */
export function getCurrentSlideIndex() {
    return state.currentSlideIndex;
};

/**
 * Stores the slides array for ID lookup.
 * Called by NavigationActions.init()
 * @param {Array} slides - The course slides array
 * @throws {Error} If slides is not a valid array
 */
export function setSlidesReference(slides) {
    if (!Array.isArray(slides) || slides.length === 0) {
        throw new Error('NavigationState: Invalid slides array. Must be non-empty array.');
    }
    slidesList = slides;
}

/**
 * Gets the current slide ID.
 * @returns {string|null} The ID of the current slide, or null if not available.
 */
export function getCurrentSlideId() {
    const slide = slidesList[state.currentSlideIndex];
    return slide ? slide.id : null;
}

/**
 * Gets the resume slide ID from cmi.location (if course was resumed).
 * This should be checked during initialization to determine starting slide.
 * @returns {string|null} The slide ID to resume to, or null if not resuming.
 */
export function getResumeSlideId() {
    return state.resumeSlideId || null;
}

/**
 * Clears the resume slide ID after it has been processed.
 * @private
 */
export function clearResumeSlideId() {
    state.resumeSlideId = null;
}


/**
 * Sets the current slide index and persists the change.
 * @param {number} index - The new slide index.
 * @throws {Error} If index is invalid or out of bounds
 */
export function setCurrentSlideIndex(index) {
    if (typeof index !== 'number' || index < 0) {
        throw new Error(`NavigationState: Invalid slide index provided: ${index}`);
    }
    if (slidesList.length > 0 && index >= slidesList.length) {
        throw new Error(`NavigationState: Slide index ${index} exceeds bounds (max: ${slidesList.length - 1})`);
    }
    state.currentSlideIndex = index;
    _persistState();
};

/**
 * Gets a copy of the array of visited slide IDs.
 * @returns {string[]} An array of slide IDs.
 */
export function getVisitedSlides() {
    return [...state.visitedSlides];
};

/**
 * Adds a slide ID to the list of visited slides and persists the change.
 * @param {string} slideId - The ID of the slide to mark as visited.
 */
export function addVisitedSlide(slideId) {
    if (!slideId) return;
    
    if (!state.visitedSlides.includes(slideId)) {
        state.visitedSlides.push(slideId);
        _persistState();
    }
};

/**
 * Clears all visited slides from the state.
 */
export function clearVisitedSlides() {
    state.visitedSlides = [];
    _persistState();
};

/**
 * Checks if a slide has been visited.
 * @param {string} slideId - The slide ID to check
 * @returns {boolean} True if the slide has been visited
 */
export function isSlideVisited(slideId) {
    return state.visitedSlides.includes(slideId);
}

/**
 * Gets the total number of slides in the course.
 * @returns {number} The slide count
 */
export function getSlideCount() {
    return slidesList.length;
}

/**
 * Checks if currently on the first slide.
 * @returns {boolean} True if on first slide
 */
export function isFirstSlide() {
    return state.currentSlideIndex === 0;
}

/**
 * Checks if currently on the last slide.
 * @returns {boolean} True if on last slide
 */
export function isLastSlide() {
    return state.currentSlideIndex === slidesList.length - 1;
}

/**
 * Persists the current state to the StateManager.
 * Only visitedSlides is persisted - currentSlideIndex uses cmi.location.
 * @private
 */
function _persistState() {
    // Only persist visitedSlides - cmi.location handles bookmark
    if (state.visitedSlides.length > 0) {
        stateManager.setDomainState(DOMAIN_KEY, { visitedSlides: state.visitedSlides }, { source: SOURCE });
    }
};

