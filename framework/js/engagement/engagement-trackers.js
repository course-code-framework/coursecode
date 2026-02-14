/**
 * @file engagement-trackers.js
 * @description Component registration and engagement tracking methods.
 * These are mixed into EngagementManager's prototype to keep the manager slim.
 *
 * Uses factory functions to eliminate boilerplate — all generated methods
 * follow the same validate → getState → update → save → emit pattern.
 */

import { logger } from '../utilities/logger.js';

// =========================================================================
// Factory Functions
// =========================================================================

/**
 * Creates a batch registration function that sets tracked[totalField] = ids.length.
 */
function makeRegister(totalField, label) {
    // Derive the viewed field name from the total field (e.g., 'tabsTotal' → 'tabsViewed')
    const viewedField = totalField.replace('Total', 'Viewed');
    return function (slideId, ids) {
        if (!slideId || !Array.isArray(ids)) return;
        const state = this._getState();
        if (!state[slideId]) return;
        state[slideId].tracked[totalField] = ids.length;
        // Reset viewed array on re-registration to prevent viewed > total inconsistency
        state[slideId].tracked[viewedField] = [];
        this._setState(state);
        logger.debug(`[EngagementManager] Registered ${ids.length} ${label}: ${slideId}`);
        this._checkAndEmitProgress(slideId);
    };
}

/**
 * Creates an incremental registration function that adds to total and inits viewed array.
 */
function makeRegisterIncremental(totalField, viewedField, label) {
    return function (slideId, ids) {
        if (!slideId || !Array.isArray(ids)) return;
        const state = this._getState();
        if (!state[slideId]) return;
        state[slideId].tracked[totalField] = (state[slideId].tracked[totalField] || 0) + ids.length;
        if (!state[slideId].tracked[viewedField]) {
            state[slideId].tracked[viewedField] = [];
        }
        this._setState(state);
        logger.debug(`[EngagementManager] Registered ${ids.length} ${label}: ${slideId}`);
        this._checkAndEmitProgress(slideId);
    };
}

/**
 * Creates an array-push tracker that deduplicates and logs progress.
 * @param {string} viewedField - tracked[viewedField] array to push into
 * @param {string} [totalField] - tracked[totalField] for progress logging (optional)
 * @param {string} label - human-readable label for debug logs
 */
function makeArrayTracker(viewedField, totalField, label) {
    return function (slideId, itemId) {
        if (!slideId || !itemId) return;
        const state = this._getState();
        if (!state[slideId]) return;
        const tracked = state[slideId].tracked;
        if (!tracked[viewedField]) tracked[viewedField] = [];
        if (!tracked[viewedField].includes(itemId)) {
            tracked[viewedField].push(itemId);
            this._setState(state);
            const progress = totalField ? ` (${tracked[viewedField].length}/${tracked[totalField]})` : '';
            logger.debug(`[EngagementManager] ${label}: ${itemId}${progress}`);
            this._checkAndEmitProgress(slideId);
        }
    };
}

/**
 * Creates a boolean-flag tracker that sets tracked[field] = true once.
 */
function makeBoolTracker(field, label) {
    return function (slideId) {
        if (!slideId) return;
        const state = this._getState();
        if (!state[slideId]) return;
        if (!state[slideId].tracked[field]) {
            state[slideId].tracked[field] = true;
            this._setState(state);
            logger.debug(`[EngagementManager] ${label}: ${slideId}`);
            this._checkAndEmitProgress(slideId);
        }
    };
}

// =========================================================================
// Generated Registration Methods
// =========================================================================

export const registerTabs = makeRegister('tabsTotal', 'tabs');
export const registerAccordion = makeRegister('accordionPanelsTotal', 'accordion panels');
export const registerFlipCards = makeRegister('flipCardsTotal', 'flip cards');
export const registerTimeline = makeRegister('timelineEventsTotal', 'timeline events');
export const registerModals = makeRegister('modalsTotal', 'modals');

export const registerInteractiveImage = makeRegisterIncremental(
    'interactiveImageHotspotsTotal', 'interactiveImageHotspotsViewed', 'hotspots'
);
export const registerLightbox = makeRegisterIncremental(
    'lightboxesTotal', 'lightboxesViewed', 'lightboxes'
);

// =========================================================================
// Special-Case Registration
// =========================================================================

/** Single flip-card registration (incremental, updates total from registered list). */
export function registerFlipCard(slideId, cardId) {
    if (!slideId || !cardId) return;
    const state = this._getState();
    if (!state[slideId]) return;
    const tracked = state[slideId].tracked;
    if (!tracked.flipCardsRegistered) tracked.flipCardsRegistered = [];
    if (!tracked.flipCardsRegistered.includes(cardId)) {
        tracked.flipCardsRegistered.push(cardId);
        // Use whichever is larger: batch-registered total or incremental count
        tracked.flipCardsTotal = Math.max(tracked.flipCardsTotal || 0, tracked.flipCardsRegistered.length);
        this._setState(state);
        logger.debug(`[EngagementManager] Registered flip card: ${cardId} (total: ${tracked.flipCardsTotal})`);
        this._checkAndEmitProgress(slideId);
    }
}

// =========================================================================
// Generated Tracking Methods
// =========================================================================

export const trackTabView = makeArrayTracker('tabsViewed', 'tabsTotal', 'Tab viewed');
export const trackAccordionPanel = makeArrayTracker('accordionPanelsViewed', 'accordionPanelsTotal', 'Panel viewed');
export const trackFlipCardView = makeArrayTracker('flipCardsViewed', 'flipCardsTotal', 'Flip card viewed');
export const trackTimelineView = makeArrayTracker('timelineEventsViewed', 'timelineEventsTotal', 'Timeline event viewed');
export const trackInteractiveImageView = makeArrayTracker('interactiveImageHotspotsViewed', 'interactiveImageHotspotsTotal', 'Hotspot viewed');
export const trackLightboxView = makeArrayTracker('lightboxesViewed', 'lightboxesTotal', 'Lightbox viewed');
export const trackModalView = makeArrayTracker('modalsViewed', 'modalsTotal', 'Modal viewed');
export const trackStandaloneAudioComplete = makeArrayTracker('standaloneAudioComplete', null, 'Standalone audio completed');
export const trackStandaloneVideoComplete = makeArrayTracker('standaloneVideoComplete', null, 'Standalone video completed');
export const trackModalAudioComplete = makeArrayTracker('modalsAudioComplete', null, 'Modal audio completed');

export const trackSlideAudioComplete = makeBoolTracker('audioComplete', 'Slide audio completed');
export const trackSlideVideoComplete = makeBoolTracker('videoComplete', 'Slide video completed');

// =========================================================================
// Special-Case Tracking
// =========================================================================

/** Interaction tracking — uses object map keyed by interactionId, not array. */
export function trackInteraction(slideId, interactionId, completed, correct) {
    if (!slideId || !interactionId) return;
    const state = this._getState();
    if (!state[slideId]) return;
    state[slideId].tracked.interactionsCompleted[interactionId] = { completed, correct };
    this._setState(state);
    logger.debug(`[EngagementManager] Interaction: ${interactionId} (completed: ${completed}, correct: ${correct})`);
    this._checkAndEmitProgress(slideId);
}

/** Scroll depth — numeric high-water mark, not array/boolean. */
export function trackScrollDepth(slideId, percentage) {
    if (!slideId || typeof percentage !== 'number') return;
    const state = this._getState();
    if (!state[slideId]) return;
    const currentDepth = state[slideId].tracked.scrollDepth;
    if (percentage > currentDepth) {
        state[slideId].tracked.scrollDepth = Math.min(100, Math.max(0, percentage));
        this._setState(state);
        logger.debug(`[EngagementManager] Scroll: ${percentage}% for ${slideId}`);
        this._checkAndEmitProgress(slideId);
    }
}

// =========================================================================
// Active Selection Persistence
// =========================================================================

/** Save the currently active tab so it can be restored on revisit. */
export function saveActiveTab(slideId, tabId) {
    if (!slideId || !tabId) return;
    const state = this._getState();
    if (!state[slideId]) return;
    state[slideId].tracked.activeTab = tabId;
    this._setState(state);
}

/** Get the last active tab for a slide, or null if none saved. */
export function getActiveTab(slideId) {
    if (!slideId) return null;
    const state = this._getState();
    if (!state[slideId]) return null;
    return state[slideId].tracked.activeTab ?? null;
}

// =========================================================================
// Queries
// =========================================================================

export function isSlideVideoComplete(slideId) {
    if (!slideId) return false;
    const state = this._getState();
    if (!state[slideId]) return true;
    return state[slideId].tracked?.videoComplete || false;
}

export function isSlideAudioComplete(slideId) {
    if (!slideId) return false;
    const state = this._getState();
    if (!state[slideId]) return true;
    return state[slideId].tracked?.audioComplete || false;
}
