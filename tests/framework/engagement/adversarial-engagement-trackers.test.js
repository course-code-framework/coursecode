/**
 * @file adversarial-engagement-trackers.test.js
 * @description Adversarial tests for engagement-trackers.js.
 * These tests deliberately probe edge cases the author likely didn't consider.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

import {
    registerTabs,
    registerAccordion,
    registerFlipCards,
    registerInteractiveImage,
    registerFlipCard,
    trackTabView,
    trackAccordionPanel,
    trackFlipCardView,
    trackScrollDepth,
    trackInteraction,
    trackSlideAudioComplete,
    trackSlideVideoComplete,
    isSlideVideoComplete,
    isSlideAudioComplete,
    getActiveTab,
    saveActiveTab
} from '../../../framework/js/engagement/engagement-trackers.js';


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
            flipCardsRegistered: [],
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


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 1: Re-registration overwrites total but NOT viewed array
// ═════════════════════════════════════════════════════════════════════
// If registerTabs is called twice (e.g., after a dynamic re-render),
// the total is reset to the new count but viewed stays stale.
// This creates an inconsistent state where viewed > total.

describe('BUG PROBE: re-registration creates viewed > total inconsistency', () => {
    it('registerTabs: double registration with fewer tabs creates impossible progress', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });

        // First render: 5 tabs
        registerTabs.call(ctx, 'slide-1', ['a', 'b', 'c', 'd', 'e']);
        // User views all 5
        trackTabView.call(ctx, 'slide-1', 'a');
        trackTabView.call(ctx, 'slide-1', 'b');
        trackTabView.call(ctx, 'slide-1', 'c');
        trackTabView.call(ctx, 'slide-1', 'd');
        trackTabView.call(ctx, 'slide-1', 'e');

        const tracked = ctx._getState()['slide-1'].tracked;
        expect(tracked.tabsViewed).toHaveLength(5);
        expect(tracked.tabsTotal).toBe(5);

        // Re-render with only 3 tabs — total resets, but viewed stays at 5
        registerTabs.call(ctx, 'slide-1', ['a', 'b', 'c']);

        // FIXED: Re-registration now resets the viewed array
        expect(tracked.tabsTotal).toBe(3);
        expect(tracked.tabsViewed).toHaveLength(0); // Reset on re-registration
    });

    it('registerAccordion: re-registration resets viewed array', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });

        registerAccordion.call(ctx, 'slide-1', ['p1', 'p2', 'p3']);
        trackAccordionPanel.call(ctx, 'slide-1', 'p1');
        trackAccordionPanel.call(ctx, 'slide-1', 'p2');
        trackAccordionPanel.call(ctx, 'slide-1', 'p3');

        // Re-register with fewer panels
        registerAccordion.call(ctx, 'slide-1', ['p1']);

        const tracked = ctx._getState()['slide-1'].tracked;
        // FIXED: viewed is reset on re-registration
        expect(tracked.accordionPanelsTotal).toBe(1);
        expect(tracked.accordionPanelsViewed).toHaveLength(0);
    });
});


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 2: Tracking before registration
// ═════════════════════════════════════════════════════════════════════
// If trackTabView fires BEFORE registerTabs (race condition in async rendering),
// what happens?

describe('BUG PROBE: tracking before registration', () => {
    it('trackTabView works before registerTabs (total stays 0)', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });

        // Track a tab before any registration
        trackTabView.call(ctx, 'slide-1', 'orphan-tab');

        const tracked = ctx._getState()['slide-1'].tracked;
        // Tab is tracked but total is 0 — progress would be ∞ or NaN
        expect(tracked.tabsViewed).toContain('orphan-tab');
        expect(tracked.tabsTotal).toBe(0);
    });

    it('trackFlipCardView before registerFlipCards — orphan tracking data', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });

        trackFlipCardView.call(ctx, 'slide-1', 'fc-orphan');

        const tracked = ctx._getState()['slide-1'].tracked;
        expect(tracked.flipCardsViewed).toContain('fc-orphan');
        expect(tracked.flipCardsTotal).toBe(0);
    });
});


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 3: isSlideVideoComplete/isSlideAudioComplete with null
// ═════════════════════════════════════════════════════════════════════
// These functions return `true` for unknown slides. If called with null,
// undefined, or empty string, the result is `true` — meaning "complete".
// This could silently bypass engagement requirements.

describe('BUG PROBE: completion queries with invalid slideId', () => {
    it('isSlideVideoComplete returns false for null slideId', () => {
        const ctx = createMockContext({});

        // FIXED: null slideId → returns false (not erroneously true)
        const result = isSlideVideoComplete.call(ctx, null);
        expect(result).toBe(false);
    });

    it('isSlideVideoComplete returns false for undefined slideId', () => {
        const ctx = createMockContext({});
        const result = isSlideVideoComplete.call(ctx, undefined);
        expect(result).toBe(false);
    });

    it('isSlideAudioComplete returns false for empty string slideId', () => {
        const ctx = createMockContext({});
        const result = isSlideAudioComplete.call(ctx, '');
        expect(result).toBe(false);
    });
});


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 4: trackScrollDepth with NaN
// ═════════════════════════════════════════════════════════════════════
// typeof NaN === 'number' is true in JS. The guard `typeof percentage !== 'number'`
// does NOT catch NaN.

describe('BUG PROBE: trackScrollDepth with NaN', () => {
    it('NaN passes the type guard but fails comparison', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState({ scrollDepth: 0 }) });

        // NaN passes typeof check: typeof NaN === 'number' is true
        // But NaN > 0 is false, so no update happens
        trackScrollDepth.call(ctx, 'slide-1', NaN);
        expect(ctx._setState).not.toHaveBeenCalled();
        // This is accidentally safe but the guard is wrong
    });

    it('Infinity passes the type guard and clamps to 100', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState({ scrollDepth: 0 }) });

        // Infinity is typeof 'number', Infinity > 0 is true
        trackScrollDepth.call(ctx, 'slide-1', Infinity);

        // Math.min(100, Math.max(0, Infinity)) === 100
        expect(ctx._getState()['slide-1'].tracked.scrollDepth).toBe(100);
    });
});


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 5: trackInteraction with non-boolean completed/correct
// ═════════════════════════════════════════════════════════════════════
// The function stores whatever you pass — no validation.

describe('BUG PROBE: trackInteraction with non-boolean values', () => {
    it('stores string values without validation', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });

        trackInteraction.call(ctx, 'slide-1', 'q1', 'yes', 'maybe');

        const interaction = ctx._getState()['slide-1'].tracked.interactionsCompleted['q1'];
        // These should be booleans but anything is accepted
        expect(interaction.completed).toBe('yes');
        expect(interaction.correct).toBe('maybe');
    });

    it('stores null values without validation', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });

        trackInteraction.call(ctx, 'slide-1', 'q1', null, null);

        const interaction = ctx._getState()['slide-1'].tracked.interactionsCompleted['q1'];
        expect(interaction.completed).toBeNull();
        expect(interaction.correct).toBeNull();
    });
});


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 6: registerFlipCard total vs registerFlipCards total conflict
// ═════════════════════════════════════════════════════════════════════
// registerFlipCards (batch) sets total from ids.length.
// registerFlipCard (incremental) sets total from flipCardsRegistered.length.
// If both are used, they fight over flipCardsTotal.

describe('BUG PROBE: conflicting batch + incremental flip card registration', () => {
    it('incremental registerFlipCard after batch registerFlipCards preserves batch total', () => {
        const ctx = createMockContext({ 'slide-1': makeSlideState() });

        // Batch: register 3 flip cards
        registerFlipCards.call(ctx, 'slide-1', ['fc1', 'fc2', 'fc3']);
        expect(ctx._getState()['slide-1'].tracked.flipCardsTotal).toBe(3);

        // Now incrementally register one more
        registerFlipCard.call(ctx, 'slide-1', 'fc4');

        // FIXED: total should be max(batch total, incremental count) = max(3, 1) = 3
        // After second incremental: max(3, 2) would be 3, etc.
        const tracked = ctx._getState()['slide-1'].tracked;
        expect(tracked.flipCardsTotal).toBe(3);
    });
});


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 7: getActiveTab with activeTab = 0 or false
// ═════════════════════════════════════════════════════════════════════
// `return state[slideId].tracked.activeTab || null` — the || null
// falsy check would return null for activeTab = 0 or ''

describe('BUG PROBE: getActiveTab with falsy but valid tab values', () => {
    it('returns 0 for activeTab = 0 (falsy coercion fixed)', () => {
        const ctx = createMockContext({
            'slide-1': makeSlideState()
        });
        // Save tab index 0
        ctx._getState()['slide-1'].tracked.activeTab = 0;

        // FIXED: ?? null preserves 0
        const result = getActiveTab.call(ctx, 'slide-1');
        expect(result).toBe(0);
    });

    it('returns empty string for activeTab = empty string', () => {
        const ctx = createMockContext({
            'slide-1': makeSlideState()
        });
        ctx._getState()['slide-1'].tracked.activeTab = '';

        // FIXED: ?? null preserves ''
        const result = getActiveTab.call(ctx, 'slide-1');
        expect(result).toBe('');
    });
});
