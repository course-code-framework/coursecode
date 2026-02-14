/**
 * @file AppState.js
 * @description Manages the global application state for the course.
 * This is the "State" component of the State-UI-Actions pattern for the app/ directory.
 * Holds in-memory application-level state (UI state, flags, etc.) - NOT course data.
 * Course data persistence is handled by StateManager in managers/.
 * 
 * @author Seth
 * @version 3.0.0
 */

import { deepClone } from '../utilities/utilities.js';
import { logger } from '../utilities/logger.js';

/**
 * Internal application state object.
 * All state is kept private and accessed through getter/setter functions.
 * @private
 */
const state = {
    // Initialization
    isInitialized: false,
    initializationError: null,

    // Modal Management
    currentModal: null,
    modalStack: [],

    // UI State
    loadingVisible: true,
    sidebarCollapsed: true,

    // Exit Flow
    courseExitLocked: false,
    exitInProgress: false,
    isExitIntentional: false,
};

/**
 * Initializes the application state.
 * @throws {Error} If already initialized
 */
export function initAppState() {
    if (state.isInitialized) {
        throw new Error('AppState: Already initialized. Do not call initAppState() more than once.');
    }

    state.isInitialized = true;
    logger.debug('[AppState] Initialized');
}

/**
 * Gets the entire application state (deep clone for immutability).
 * @returns {object} A deep clone of the current state
 */
export function getState() {
    return deepClone(state);
}

// =============================================================================
// Initialization State
// =============================================================================

/**
 * Checks if the application has been initialized.
 * @returns {boolean} True if initialized
 */
export function isInitialized() {
    return state.isInitialized;
}

/**
 * Sets an initialization error.
 * @param {Error|string} error - The error that occurred during initialization
 */
export function setInitializationError(error) {
    state.initializationError = error instanceof Error ? error : new Error(String(error));
}

/**
 * Gets the initialization error if one occurred.
 * @returns {Error|null} The initialization error or null
 */
export function getInitializationError() {
    return state.initializationError;
}

// =============================================================================
// Modal Management
// =============================================================================

/**
 * Sets the currently active modal.
 * @param {string|null} modalId - The ID of the modal or null to clear
 */
export function setCurrentModal(modalId) {
    if (modalId && state.currentModal !== modalId) {
        // Push previous modal to stack if exists
        if (state.currentModal) {
            state.modalStack.push(state.currentModal);
        }
    }
    state.currentModal = modalId;
}

/**
 * Gets the currently active modal ID.
 * @returns {string|null} The current modal ID or null
 */
export function getCurrentModal() {
    return state.currentModal;
}

/**
 * Clears the current modal (on close).
 */
export function clearCurrentModal() {
    state.currentModal = null;
}

/**
 * Pops and returns the previous modal from the stack.
 * @returns {string|null} The previous modal ID or null
 */
export function popModalStack() {
    return state.modalStack.pop() || null;
}

// =============================================================================
// UI State
// =============================================================================

/**
 * Sets the loading indicator visibility state.
 * @param {boolean} visible - Whether loading indicator should be visible
 */
export function setLoadingVisible(visible) {
    state.loadingVisible = !!visible;
}

/**
 * Gets the loading indicator visibility state.
 * @returns {boolean} True if loading is visible
 */
export function isLoadingVisible() {
    return state.loadingVisible;
}

/**
 * Sets the sidebar collapsed state.
 * @param {boolean} collapsed - Whether sidebar should be collapsed
 */
export function setSidebarCollapsed(collapsed) {
    state.sidebarCollapsed = !!collapsed;
}

/**
 * Gets the sidebar collapsed state.
 * @returns {boolean} True if sidebar is collapsed
 */
export function isSidebarCollapsed() {
    return state.sidebarCollapsed;
}

/**
 * Toggles the sidebar collapsed state.
 * @returns {boolean} The new collapsed state
 */
export function toggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    return state.sidebarCollapsed;
}

// =============================================================================
// Exit Flow State
// =============================================================================

/**
 * Sets whether the course is locked for exit (no more navigation allowed).
 * @param {boolean} locked - Whether course should be locked
 */
export function setCourseExitLocked(locked) {
    state.courseExitLocked = !!locked;
}

/**
 * Gets whether the course is locked for exit.
 * @returns {boolean} True if locked for exit
 */
export function isCourseExitLocked() {
    return state.courseExitLocked;
}

/**
 * Sets whether an exit is currently in progress.
 * @param {boolean} inProgress - Whether exit is in progress
 */
export function setExitInProgress(inProgress) {
    state.exitInProgress = !!inProgress;
}

/**
 * Gets whether an exit is in progress.
 * @returns {boolean} True if exit in progress
 */
export function isExitInProgress() {
    return state.exitInProgress;
}

/**
 * Sets whether the page unload is intentional.
 * This is the flag for the 'beforeunload' guard.
 * @param {boolean} isIntentional - Whether the exit is intentional
 */
export function setExitIntentional(isIntentional) {
    state.isExitIntentional = !!isIntentional;
}

/**
 * Gets whether the page unload is intentional.
 * @returns {boolean} True if the exit is intentional
 */
export function isExitIntentional() {
    return state.isExitIntentional;
}
