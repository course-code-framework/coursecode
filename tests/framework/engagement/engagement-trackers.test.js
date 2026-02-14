import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * @file engagement-trackers.test.js
 * @description Tests for the factory-generated tracker functions.
 *
 * These functions are designed to be mixed into EngagementManager's prototype,
 * so they use `this._getState()`, `this._setState()`, and `this._checkAndEmitProgress()`.
 * We create a mock context that provides these methods.
 */

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

import {
    registerTabs,
    registerAccordion,
    registerFlipCards,
    registerTimeline,
    registerModals,
    registerInteractiveImage,
    registerLightbox,
    registerFlipCard,
    trackTabView,
    trackAccordionPanel,
    trackFlipCardView,
    trackTimelineView,
    trackInteractiveImageView,
    trackLightboxView,
    trackModalView,
    trackSlideAudioComplete,
    trackSlideVideoComplete,
    trackInteraction,
    trackScrollDepth,
    saveActiveTab,
    getActiveTab,
    isSlideVideoComplete,
    isSlideAudioComplete
} from '../../../framework/js/engagement/engagement-trackers.js';


// ─── Mock Context ───────────────────────────────────────────────────
// Simulates the EngagementManager `this` context that tracker functions expect.

function createMockContext(initialState = {}) {
    const state = initialState;
    return {
        _getState: vi.fn(() => state),
        _setState: vi.fn(),
        _checkAndEmitProgress: vi.fn()
    };
}

function makeSlideState(overrides = {}) {
    return {
        tracked: {
            tabsTotal: 0,
            tabsViewed: [],
            accordionPanelsTotal: 0,
            accordionPanelsViewed: [],
            flipCardsTotal: 0,
            flipCardsViewed: [],
            timelineEventsTotal: 0,
            timelineEventsViewed: [],
            modalsTotal: 0,
            modalsViewed: [],
            interactiveImageHotspotsTotal: 0,
            interactiveImageHotspotsViewed: [],
            lightboxesTotal: 0,
            lightboxesViewed: [],
            interactionsCompleted: {},
            scrollDepth: 0,
            audioComplete: false,
            videoComplete: false,
            ...overrides
        }
    };
}


// ─── Batch Registration (makeRegister) ──────────────────────────────

describe('Batch registration methods', () => {
    it('registerTabs sets tabsTotal', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        registerTabs.call(ctx, 'slide-1', ['tab-a', 'tab-b', 'tab-c']);
        expect(ctx._setState).toHaveBeenCalled();
        expect(ctx._getState()['slide-1'].tracked.tabsTotal).toBe(3);
    });

    it('registerAccordion sets accordionPanelsTotal', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        registerAccordion.call(ctx, 'slide-1', ['p1', 'p2']);
        expect(ctx._getState()['slide-1'].tracked.accordionPanelsTotal).toBe(2);
    });

    it('registerFlipCards sets flipCardsTotal', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        registerFlipCards.call(ctx, 'slide-1', ['fc1']);
        expect(ctx._getState()['slide-1'].tracked.flipCardsTotal).toBe(1);
    });

    it('registerTimeline sets timelineEventsTotal', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        registerTimeline.call(ctx, 'slide-1', ['e1', 'e2', 'e3', 'e4']);
        expect(ctx._getState()['slide-1'].tracked.timelineEventsTotal).toBe(4);
    });

    it('registerModals sets modalsTotal', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        registerModals.call(ctx, 'slide-1', ['m1', 'm2']);
        expect(ctx._getState()['slide-1'].tracked.modalsTotal).toBe(2);
    });

    it('emits progress check after registration', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        registerTabs.call(ctx, 'slide-1', ['t1']);
        expect(ctx._checkAndEmitProgress).toHaveBeenCalledWith('slide-1');
    });

    it('no-ops for null slideId', () => {
        const ctx = createMockContext({});
        registerTabs.call(ctx, null, ['t1']);
        expect(ctx._setState).not.toHaveBeenCalled();
    });

    it('no-ops for non-array ids', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        registerTabs.call(ctx, 'slide-1', 'not-an-array');
        expect(ctx._setState).not.toHaveBeenCalled();
    });

    it('no-ops for unknown slide', () => {
        const ctx = createMockContext({});
        registerTabs.call(ctx, 'unknown-slide', ['t1']);
        expect(ctx._setState).not.toHaveBeenCalled();
    });
});


// ─── Incremental Registration (makeRegisterIncremental) ─────────────

describe('Incremental registration methods', () => {
    it('registerInteractiveImage adds to total incrementally', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        registerInteractiveImage.call(ctx, 'slide-1', ['h1', 'h2']);
        expect(ctx._getState()['slide-1'].tracked.interactiveImageHotspotsTotal).toBe(2);

        registerInteractiveImage.call(ctx, 'slide-1', ['h3']);
        expect(ctx._getState()['slide-1'].tracked.interactiveImageHotspotsTotal).toBe(3);
    });

    it('registerLightbox adds to total incrementally', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        registerLightbox.call(ctx, 'slide-1', ['lb1']);
        expect(ctx._getState()['slide-1'].tracked.lightboxesTotal).toBe(1);
    });

    it('initializes viewed array on first call', () => {
        const state = makeSlideState();
        delete state.tracked.interactiveImageHotspotsViewed;
        const ctx = createMockContext({ 'slide-1': state });
        registerInteractiveImage.call(ctx, 'slide-1', ['h1']);
        expect(Array.isArray(ctx._getState()['slide-1'].tracked.interactiveImageHotspotsViewed)).toBe(true);
    });
});


// ─── Array Trackers (makeArrayTracker) ──────────────────────────────

describe('Array tracker methods', () => {
    it('trackTabView appends tab to viewed list', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState({ tabsTotal: 3 }) });
        trackTabView.call(ctx, 'slide-1', 'tab-a');
        expect(ctx._getState()['slide-1'].tracked.tabsViewed).toContain('tab-a');
    });

    it('trackTabView deduplicates', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState({ tabsTotal: 3 }) });
        trackTabView.call(ctx, 'slide-1', 'tab-a');
        trackTabView.call(ctx, 'slide-1', 'tab-a');
        expect(ctx._getState()['slide-1'].tracked.tabsViewed).toHaveLength(1);
    });

    it('trackTabView does not trigger setState or progress on duplicate', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState({ tabsTotal: 3 }) });
        trackTabView.call(ctx, 'slide-1', 'tab-a');
        ctx._setState.mockClear();
        ctx._checkAndEmitProgress.mockClear();

        trackTabView.call(ctx, 'slide-1', 'tab-a');
        expect(ctx._setState).not.toHaveBeenCalled();
        expect(ctx._checkAndEmitProgress).not.toHaveBeenCalled();
    });

    it('trackAccordionPanel appends panel', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState({ accordionPanelsTotal: 2 }) });
        trackAccordionPanel.call(ctx, 'slide-1', 'panel-1');
        expect(ctx._getState()['slide-1'].tracked.accordionPanelsViewed).toContain('panel-1');
    });

    it('trackModalView appends modal', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState({ modalsTotal: 2 }) });
        trackModalView.call(ctx, 'slide-1', 'modal-1');
        expect(ctx._getState()['slide-1'].tracked.modalsViewed).toContain('modal-1');
    });

    it('no-ops for null slideId', () => {
        const ctx = createMockContext({});
        trackTabView.call(ctx, null, 'tab-a');
        expect(ctx._setState).not.toHaveBeenCalled();
    });

    it('no-ops for null itemId', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        trackTabView.call(ctx, 'slide-1', null);
        expect(ctx._setState).not.toHaveBeenCalled();
    });
});


// ─── Boolean Trackers (makeBoolTracker) ─────────────────────────────

describe('Boolean tracker methods', () => {
    it('trackSlideAudioComplete sets audioComplete', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        trackSlideAudioComplete.call(ctx, 'slide-1');
        expect(ctx._getState()['slide-1'].tracked.audioComplete).toBe(true);
        expect(ctx._setState).toHaveBeenCalled();
        expect(ctx._checkAndEmitProgress).toHaveBeenCalledWith('slide-1');
    });

    it('trackSlideVideoComplete sets videoComplete', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        trackSlideVideoComplete.call(ctx, 'slide-1');
        expect(ctx._getState()['slide-1'].tracked.videoComplete).toBe(true);
    });

    it('is idempotent — no setState on second call', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        trackSlideAudioComplete.call(ctx, 'slide-1');
        ctx._setState.mockClear();
        ctx._checkAndEmitProgress.mockClear();

        trackSlideAudioComplete.call(ctx, 'slide-1');
        expect(ctx._setState).not.toHaveBeenCalled();
        expect(ctx._checkAndEmitProgress).not.toHaveBeenCalled();
    });

    it('no-ops for null slideId', () => {
        const ctx = createMockContext({});
        trackSlideAudioComplete.call(ctx, null);
        expect(ctx._setState).not.toHaveBeenCalled();
    });
});


// ─── Special-Case: trackInteraction ─────────────────────────────────

describe('trackInteraction', () => {
    it('stores interaction as object map entry', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        trackInteraction.call(ctx, 'slide-1', 'q1', true, true);
        expect(ctx._getState()['slide-1'].tracked.interactionsCompleted['q1']).toEqual({
            completed: true, correct: true
        });
    });

    it('updates existing interaction', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        trackInteraction.call(ctx, 'slide-1', 'q1', false, false);
        trackInteraction.call(ctx, 'slide-1', 'q1', true, true);
        expect(ctx._getState()['slide-1'].tracked.interactionsCompleted['q1']).toEqual({
            completed: true, correct: true
        });
    });

    it('no-ops for null slideId or interactionId', () => {
        const ctx = createMockContext({});
        trackInteraction.call(ctx, null, 'q1', true, true);
        expect(ctx._setState).not.toHaveBeenCalled();

        trackInteraction.call(ctx, 'slide-1', null, true, true);
        expect(ctx._setState).not.toHaveBeenCalled();
    });
});


// ─── Special-Case: trackScrollDepth ─────────────────────────────────

describe('trackScrollDepth', () => {
    it('sets scroll depth percentage', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        trackScrollDepth.call(ctx, 'slide-1', 50);
        expect(ctx._getState()['slide-1'].tracked.scrollDepth).toBe(50);
    });

    it('high-water mark — only increases', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState({ scrollDepth: 60 }) });
        trackScrollDepth.call(ctx, 'slide-1', 40);
        expect(ctx._getState()['slide-1'].tracked.scrollDepth).toBe(60);
        expect(ctx._setState).not.toHaveBeenCalled();
    });

    it('clamps to 100 max', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        trackScrollDepth.call(ctx, 'slide-1', 150);
        expect(ctx._getState()['slide-1'].tracked.scrollDepth).toBe(100);
    });

    it('clamps to 0 min', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        trackScrollDepth.call(ctx, 'slide-1', -10);
        // -10 > 0 (currentDepth) is false, so no update
        expect(ctx._setState).not.toHaveBeenCalled();
    });

    it('no-ops for non-number percentage', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        trackScrollDepth.call(ctx, 'slide-1', 'fifty');
        expect(ctx._setState).not.toHaveBeenCalled();
    });
});


// ─── Special-Case: registerFlipCard (incremental) ───────────────────

describe('registerFlipCard', () => {
    it('registers a flip card and updates total', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        registerFlipCard.call(ctx, 'slide-1', 'fc-1');
        const tracked = ctx._getState()['slide-1'].tracked;
        expect(tracked.flipCardsRegistered).toContain('fc-1');
        expect(tracked.flipCardsTotal).toBe(1);
    });

    it('deduplicates flip card registrations', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        registerFlipCard.call(ctx, 'slide-1', 'fc-1');
        registerFlipCard.call(ctx, 'slide-1', 'fc-1');
        expect(ctx._getState()['slide-1'].tracked.flipCardsRegistered).toHaveLength(1);
    });

    it('increments total with each unique card', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        registerFlipCard.call(ctx, 'slide-1', 'fc-1');
        registerFlipCard.call(ctx, 'slide-1', 'fc-2');
        expect(ctx._getState()['slide-1'].tracked.flipCardsTotal).toBe(2);
    });
});


// ─── Active Tab Persistence ─────────────────────────────────────────

describe('saveActiveTab / getActiveTab', () => {
    it('roundtrips active tab', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        saveActiveTab.call(ctx, 'slide-1', 'tab-2');
        expect(getActiveTab.call(ctx, 'slide-1')).toBe('tab-2');
    });

    it('returns null when no tab saved', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        expect(getActiveTab.call(ctx, 'slide-1')).toBeNull();
    });

    it('returns null for unknown slide', () => {
        const ctx = createMockContext({});
        expect(getActiveTab.call(ctx, 'unknown')).toBeNull();
    });

    it('returns null for null slideId', () => {
        const ctx = createMockContext({});
        expect(getActiveTab.call(ctx, null)).toBeNull();
    });
});


// ─── Query Methods ──────────────────────────────────────────────────

describe('Query methods', () => {
    it('isSlideVideoComplete returns true when video is complete', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState({ videoComplete: true }) });
        expect(isSlideVideoComplete.call(ctx, 'slide-1')).toBe(true);
    });

    it('isSlideVideoComplete returns false when video not complete', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        expect(isSlideVideoComplete.call(ctx, 'slide-1')).toBe(false);
    });

    it('isSlideVideoComplete returns true for unknown slide', () => {
        const ctx = createMockContext({});
        expect(isSlideVideoComplete.call(ctx, 'unknown')).toBe(true);
    });

    it('isSlideAudioComplete returns true when audio is complete', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState({ audioComplete: true }) });
        expect(isSlideAudioComplete.call(ctx, 'slide-1')).toBe(true);
    });

    it('isSlideAudioComplete returns false when audio not complete', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });
        expect(isSlideAudioComplete.call(ctx, 'slide-1')).toBe(false);
    });
});
