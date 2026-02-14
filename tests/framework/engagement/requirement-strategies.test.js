import { describe, it, expect } from 'vitest';
import strategies, { validTypes } from '../../../framework/js/engagement/requirement-strategies.js';

// ─── Strategy catalog completeness ──────────────────────────────────

describe('strategy catalog', () => {
    it('exports all expected strategy types', () => {
        const expected = [
            'viewAllTabs', 'viewAllPanels', 'viewAllFlipCards', 'viewAllHotspots', 'viewAllModals', 'viewAllLightboxes',
            'interactionComplete', 'allInteractionsComplete',
            'scrollDepth', 'timeOnSlide',
            'flag', 'allFlags',
            'slideAudioComplete', 'audioComplete', 'modalAudioComplete',
            'slideVideoComplete', 'videoComplete'
        ];
        for (const type of expected) {
            expect(strategies[type]).toBeDefined();
            expect(strategies[type].evaluate).toBeTypeOf('function');
            expect(strategies[type].progress).toBeTypeOf('function');
            expect(strategies[type].label).toBeTypeOf('function');
        }
    });

    it('validTypes matches strategy keys', () => {
        expect(validTypes.sort()).toEqual(Object.keys(strategies).sort());
    });
});

// ─── viewAll factory strategies ─────────────────────────────────────

describe('viewAllTabs strategy', () => {
    const strategy = strategies.viewAllTabs;

    it('evaluates as met when all tabs viewed', () => {
        const tracked = { tabsViewed: ['t1', 't2', 't3'], tabsTotal: 3 };
        expect(strategy.evaluate({ type: 'viewAllTabs' }, tracked).met).toBe(true);
    });

    it('evaluates as not met when incomplete', () => {
        const tracked = { tabsViewed: ['t1'], tabsTotal: 3 };
        expect(strategy.evaluate({ type: 'viewAllTabs' }, tracked).met).toBe(false);
    });

    it('evaluates as not met when total is 0', () => {
        const tracked = { tabsViewed: [], tabsTotal: 0 };
        expect(strategy.evaluate({ type: 'viewAllTabs' }, tracked).met).toBe(false);
    });

    it('returns fractional progress', () => {
        const tracked = { tabsViewed: ['t1'], tabsTotal: 4 };
        expect(strategy.progress({ type: 'viewAllTabs' }, tracked)).toBe(0.25);
    });

    it('returns 0 progress when total is 0', () => {
        const tracked = { tabsViewed: [], tabsTotal: 0 };
        expect(strategy.progress({ type: 'viewAllTabs' }, tracked)).toBe(0);
    });

    it('generates label with count', () => {
        const tracked = { tabsViewed: ['t1'], tabsTotal: 3 };
        expect(strategy.label({ type: 'viewAllTabs' }, tracked)).toBe('View all tabs (1/3)');
    });
});

// ─── interactionComplete ────────────────────────────────────────────

describe('interactionComplete strategy', () => {
    const strategy = strategies.interactionComplete;

    it('evaluates completed interaction as met', () => {
        const tracked = { interactionsCompleted: { 'q1': { completed: true, correct: false } } };
        const result = strategy.evaluate({ type: 'interactionComplete', interactionId: 'q1' }, tracked);
        expect(result.met).toBe(true);
    });

    it('evaluates missing interaction as not met', () => {
        const tracked = { interactionsCompleted: {} };
        const result = strategy.evaluate({ type: 'interactionComplete', interactionId: 'q1' }, tracked);
        expect(result.met).toBe(false);
    });

    it('requireCorrect=true requires both completed AND correct', () => {
        const tracked = { interactionsCompleted: { 'q1': { completed: true, correct: false } } };
        const result = strategy.evaluate({ type: 'interactionComplete', interactionId: 'q1', requireCorrect: true }, tracked);
        expect(result.met).toBe(false);
    });

    it('requireCorrect=true passes when completed and correct', () => {
        const tracked = { interactionsCompleted: { 'q1': { completed: true, correct: true } } };
        const result = strategy.evaluate({ type: 'interactionComplete', interactionId: 'q1', requireCorrect: true }, tracked);
        expect(result.met).toBe(true);
    });

    it('progress is 0 or 1 (binary)', () => {
        expect(strategy.progress({}, {}, { met: false })).toBe(0);
        expect(strategy.progress({}, {}, { met: true })).toBe(1);
    });
});

// ─── scrollDepth ────────────────────────────────────────────────────

describe('scrollDepth strategy', () => {
    const strategy = strategies.scrollDepth;

    it('defaults required percentage to 95', () => {
        const result = strategy.evaluate({ type: 'scrollDepth' }, { scrollDepth: 95 });
        expect(result.met).toBe(true);
    });

    it('uses custom percentage requirement', () => {
        const result = strategy.evaluate({ type: 'scrollDepth', percentage: 50 }, { scrollDepth: 40 });
        expect(result.met).toBe(false);
    });

    it('tracks fractional progress', () => {
        const progress = strategy.progress({ type: 'scrollDepth', percentage: 100 }, { scrollDepth: 50 });
        expect(progress).toBe(0.5);
    });

    it('caps progress at 1', () => {
        const progress = strategy.progress({ type: 'scrollDepth', percentage: 50 }, { scrollDepth: 100 });
        expect(progress).toBe(1);
    });
});

// ─── timeOnSlide ────────────────────────────────────────────────────

describe('timeOnSlide strategy', () => {
    const strategy = strategies.timeOnSlide;
    const makeCtx = (duration = 0, startTime = null) => ({
        slideId: 'slide-1',
        stateManager: {
            getDomainState: () => ({
                slideDurations: { 'slide-1': duration },
                slideStartTimes: startTime ? { 'slide-1': startTime } : {}
            })
        },
        formatTime: (s) => `${s}s`
    });

    it('evaluates as met when accumulated time exceeds threshold', () => {
        const ctx = makeCtx(31000); // 31 seconds
        const result = strategy.evaluate({ type: 'timeOnSlide', minSeconds: 30 }, {}, ctx);
        expect(result.met).toBe(true);
    });

    it('evaluates as not met when time is below threshold', () => {
        const ctx = makeCtx(5000); // 5 seconds
        const result = strategy.evaluate({ type: 'timeOnSlide', minSeconds: 30 }, {}, ctx);
        expect(result.met).toBe(false);
    });
});

// ─── flag strategy ──────────────────────────────────────────────────

describe('flag strategy', () => {
    const strategy = strategies.flag;
    const makeCtx = (flags) => ({
        stateManager: { getDomainState: () => flags }
    });

    it('evaluates truthy flag as met', () => {
        const result = strategy.evaluate({ type: 'flag', key: 'done' }, {}, makeCtx({ done: true }));
        expect(result.met).toBe(true);
    });

    it('evaluates missing flag as not met', () => {
        const result = strategy.evaluate({ type: 'flag', key: 'done' }, {}, makeCtx({}));
        expect(result.met).toBe(false);
    });

    it('supports equals comparison', () => {
        const result = strategy.evaluate({ type: 'flag', key: 'level', equals: 'expert' }, {}, makeCtx({ level: 'expert' }));
        expect(result.met).toBe(true);
    });

    it('equals fails on mismatch', () => {
        const result = strategy.evaluate({ type: 'flag', key: 'level', equals: 'expert' }, {}, makeCtx({ level: 'novice' }));
        expect(result.met).toBe(false);
    });
});

// ─── allFlags strategy ──────────────────────────────────────────────

describe('allFlags strategy', () => {
    const strategy = strategies.allFlags;
    const makeCtx = (flags) => ({
        stateManager: { getDomainState: () => flags }
    });

    it('met when all string flags are truthy', () => {
        const req = { type: 'allFlags', flags: ['a', 'b'] };
        const result = strategy.evaluate(req, {}, makeCtx({ a: true, b: true }));
        expect(result.met).toBe(true);
    });

    it('not met when any flag is missing', () => {
        const req = { type: 'allFlags', flags: ['a', 'b'] };
        const result = strategy.evaluate(req, {}, makeCtx({ a: true }));
        expect(result.met).toBe(false);
    });

    it('supports object flags with equals', () => {
        const req = { type: 'allFlags', flags: [{ key: 'mode', equals: 'dark' }] };
        const result = strategy.evaluate(req, {}, makeCtx({ mode: 'dark' }));
        expect(result.met).toBe(true);
    });

    it('tracks partial progress', () => {
        const req = { type: 'allFlags', flags: ['a', 'b', 'c'] };
        const result = strategy.evaluate(req, {}, makeCtx({ a: true }));
        expect(strategy.progress(req, {}, result)).toBeCloseTo(1 / 3);
    });
});

// ─── audio strategies ───────────────────────────────────────────────

describe('slideAudioComplete strategy', () => {
    const strategy = strategies.slideAudioComplete;

    it('met when audioComplete is true', () => {
        expect(strategy.evaluate({ type: 'slideAudioComplete' }, { audioComplete: true }).met).toBe(true);
    });

    it('not met when audioComplete is false', () => {
        expect(strategy.evaluate({ type: 'slideAudioComplete' }, { audioComplete: false }).met).toBe(false);
    });
});

describe('audioComplete strategy', () => {
    const strategy = strategies.audioComplete;

    it('throws without audioId', () => {
        expect(() => strategy.evaluate({ type: 'audioComplete' }, {})).toThrow('audioId');
    });

    it('met when audioId is in standaloneAudioComplete', () => {
        const tracked = { standaloneAudioComplete: ['narration-1'] };
        expect(strategy.evaluate({ type: 'audioComplete', audioId: 'narration-1' }, tracked).met).toBe(true);
    });

    it('not met when audioId is missing from list', () => {
        const tracked = { standaloneAudioComplete: ['narration-2'] };
        expect(strategy.evaluate({ type: 'audioComplete', audioId: 'narration-1' }, tracked).met).toBe(false);
    });
});

describe('modalAudioComplete strategy', () => {
    const strategy = strategies.modalAudioComplete;

    it('throws without modalId', () => {
        expect(() => strategy.evaluate({ type: 'modalAudioComplete' }, {})).toThrow('modalId');
    });

    it('met when modalId is in modalsAudioComplete', () => {
        const tracked = { modalsAudioComplete: ['modal-1'] };
        expect(strategy.evaluate({ type: 'modalAudioComplete', modalId: 'modal-1' }, tracked).met).toBe(true);
    });
});

// ─── video strategies ───────────────────────────────────────────────

describe('slideVideoComplete strategy', () => {
    const strategy = strategies.slideVideoComplete;

    it('met when videoComplete is true', () => {
        expect(strategy.evaluate({ type: 'slideVideoComplete' }, { videoComplete: true }).met).toBe(true);
    });

    it('not met when videoComplete is false', () => {
        expect(strategy.evaluate({ type: 'slideVideoComplete' }, {}).met).toBe(false);
    });
});

describe('videoComplete strategy', () => {
    const strategy = strategies.videoComplete;

    it('throws without videoId', () => {
        expect(() => strategy.evaluate({ type: 'videoComplete' }, {})).toThrow('videoId');
    });

    it('met when videoId is in standaloneVideoComplete', () => {
        const tracked = { standaloneVideoComplete: ['vid-1'] };
        expect(strategy.evaluate({ type: 'videoComplete', videoId: 'vid-1' }, tracked).met).toBe(true);
    });
});
