import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock Dependencies ─────────────────────────────────────────────
// ScoreManager is a singleton that imports stateManager, eventBus, objectiveManager,
// and logger. We mock all of them to test calculation logic in isolation.

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

vi.mock('../../../framework/js/core/event-bus.js', () => {
    const handlers = {};
    return {
        eventBus: {
            on: vi.fn((event, cb) => {
                if (!handlers[event]) handlers[event] = [];
                handlers[event].push(cb);
                return () => { handlers[event] = handlers[event].filter(h => h !== cb); };
            }),
            emit: vi.fn((event, data) => {
                (handlers[event] || []).forEach(cb => cb(data));
            }),
            _handlers: handlers,
            _reset: () => { Object.keys(handlers).forEach(k => delete handlers[k]); }
        }
    };
});

vi.mock('../../../framework/js/state/index.js', () => {
    const store = {};
    return {
        default: {
            getDomainState: vi.fn((key) => store[key] || null),
            setDomainState: vi.fn((key, val) => { store[key] = val; }),
            reportScore: vi.fn(),
            flush: vi.fn(() => Promise.resolve()),
            _store: store,
            _reset: () => { Object.keys(store).forEach(k => delete store[k]); }
        }
    };
});

vi.mock('../../../framework/js/managers/objective-manager.js', () => ({
    default: {
        getObjective: vi.fn(() => null)
    }
}));

import { eventBus } from '../../../framework/js/core/event-bus.js';
import stateManager from '../../../framework/js/state/index.js';
import objectiveManager from '../../../framework/js/managers/objective-manager.js';

// We need a fresh ScoreManager instance for each test since it's a singleton
// that guards against double-init. Import the class indirectly.
// The module exports a singleton, so we re-create manually.
let ScoreManager;

beforeEach(async () => {
    vi.clearAllMocks();
    stateManager._reset();
    eventBus._reset();

    // Re-import to get a fresh singleton
    vi.resetModules();

    // Re-setup mocks after resetModules
    vi.doMock('../../../framework/js/utilities/logger.js', () => ({
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
    }));
    vi.doMock('../../../framework/js/core/event-bus.js', () => ({ eventBus }));
    vi.doMock('../../../framework/js/state/index.js', () => ({ default: stateManager }));
    vi.doMock('../../../framework/js/managers/objective-manager.js', () => ({ default: objectiveManager }));

    const mod = await import('../../../framework/js/managers/score-manager.js');
    ScoreManager = mod.default;
});


// ─── Config Validation ──────────────────────────────────────────────

describe('ScoreManager: config validation', () => {
    it('marks as initialized even when config is null (scoring disabled)', () => {
        ScoreManager.initialize(null);
        expect(ScoreManager.isInitialized).toBe(true);
    });

    it('marks as initialized even when type is "none" (scoring disabled)', () => {
        ScoreManager.initialize({ type: 'none' });
        expect(ScoreManager.isInitialized).toBe(true);
    });

    it('marks as initialized even when type is null (scoring disabled)', () => {
        ScoreManager.initialize({ type: null });
        expect(ScoreManager.isInitialized).toBe(true);
    });

    it('throws on invalid scoring type', () => {
        expect(() => ScoreManager.initialize({
            type: 'bogus', sources: ['assessment:q1']
        })).toThrow('Invalid scoring type');
    });

    it('throws when sources array is missing', () => {
        expect(() => ScoreManager.initialize({ type: 'average' }))
            .toThrow('non-empty "sources" array');
    });

    it('throws when sources array is empty', () => {
        expect(() => ScoreManager.initialize({ type: 'average', sources: [] }))
            .toThrow('non-empty "sources" array');
    });

    it('throws on weighted sources without {id, weight} format', () => {
        expect(() => ScoreManager.initialize({
            type: 'weighted', sources: ['assessment:q1']
        })).toThrow('requires sources with {id, weight}');
    });

    it('throws when weighted sources weights do not sum to 1.0', () => {
        expect(() => ScoreManager.initialize({
            type: 'weighted',
            sources: [
                { id: 'assessment:q1', weight: 0.3 },
                { id: 'assessment:q2', weight: 0.3 }
            ]
        })).toThrow('not 1.0');
    });

    it('accepts weighted sources that sum to 1.0 within tolerance', () => {
        expect(() => ScoreManager.initialize({
            type: 'weighted',
            sources: [
                { id: 'assessment:q1', weight: 0.6 },
                { id: 'assessment:q2', weight: 0.4 }
            ]
        })).not.toThrow();
    });

    it('throws when custom type has no calculate function', () => {
        expect(() => ScoreManager.initialize({
            type: 'custom', sources: ['assessment:q1']
        })).toThrow('requires "calculate" function');
    });

    it('throws on double initialization', () => {
        ScoreManager.initialize({ type: 'average', sources: ['assessment:q1'] });
        expect(() => ScoreManager.initialize({ type: 'average', sources: ['assessment:q1'] }))
            .toThrow('Already initialized');
    });
});


// ─── Helpers ────────────────────────────────────────────────────────
// Inject scores through the real event pathway instead of setting cachedScores directly.

function submitAssessment(id, scorePercentage) {
    eventBus.emit('assessment:submitted', {
        assessmentId: id,
        results: { scorePercentage }
    });
}

function updateObjectiveScore(id, score) {
    eventBus.emit('objective:score:updated', {
        objectiveId: id,
        score
    });
}


// ─── Average Formula ────────────────────────────────────────────────

describe('ScoreManager: average formula', () => {
    it('calculates average of available scores', () => {
        ScoreManager.initialize({ type: 'average', sources: ['assessment:q1', 'assessment:q2'] });
        submitAssessment('q1', 80);
        submitAssessment('q2', 60);

        const result = ScoreManager.getCurrentScore();
        expect(result.raw).toBe(70);
        expect(result.scaled).toBe(0.7);
    });

    it('calculates average with partial scores (only one available)', () => {
        ScoreManager.initialize({ type: 'average', sources: ['assessment:q1', 'assessment:q2'] });
        submitAssessment('q1', 90);

        const result = ScoreManager.getCurrentScore();
        expect(result.raw).toBe(90);
    });

    it('returns null when no scores available', () => {
        ScoreManager.initialize({ type: 'average', sources: ['assessment:q1'] });
        expect(ScoreManager.getCurrentScore()).toBeNull();
    });

    it('handles a score of 0 correctly', () => {
        ScoreManager.initialize({ type: 'average', sources: ['assessment:q1', 'assessment:q2'] });
        submitAssessment('q1', 0);
        submitAssessment('q2', 100);

        const result = ScoreManager.getCurrentScore();
        expect(result.raw).toBe(50);
    });
});


// ─── Weighted Formula ───────────────────────────────────────────────

describe('ScoreManager: weighted formula', () => {
    it('calculates weighted average', () => {
        ScoreManager.initialize({
            type: 'weighted',
            sources: [
                { id: 'assessment:final', weight: 0.6 },
                { id: 'assessment:midterm', weight: 0.4 }
            ]
        });
        submitAssessment('final', 90);
        submitAssessment('midterm', 70);

        const result = ScoreManager.getCurrentScore();
        expect(result.raw).toBe(82); // 90*0.6 + 70*0.4 = 54 + 28 = 82
    });

    it('normalizes weights when only some scores available', () => {
        ScoreManager.initialize({
            type: 'weighted',
            sources: [
                { id: 'assessment:final', weight: 0.6 },
                { id: 'assessment:midterm', weight: 0.4 }
            ]
        });
        submitAssessment('final', 80);

        const result = ScoreManager.getCurrentScore();
        // Only final available: 80 * 0.6 / 0.6 = 80
        expect(result.raw).toBe(80);
    });

    it('returns null when no weighted scores available', () => {
        ScoreManager.initialize({
            type: 'weighted',
            sources: [
                { id: 'assessment:final', weight: 0.6 },
                { id: 'assessment:midterm', weight: 0.4 }
            ]
        });
        expect(ScoreManager.getCurrentScore()).toBeNull();
    });
});


// ─── Minimum Formula ────────────────────────────────────────────────

describe('ScoreManager: minimum formula', () => {
    it('returns minimum score', () => {
        ScoreManager.initialize({ type: 'minimum', sources: ['assessment:q1', 'assessment:q2', 'assessment:q3'] });
        submitAssessment('q1', 90);
        submitAssessment('q2', 40);
        submitAssessment('q3', 70);

        const result = ScoreManager.getCurrentScore();
        expect(result.raw).toBe(40);
    });

    it('returns sole score when only one available', () => {
        ScoreManager.initialize({ type: 'minimum', sources: ['assessment:q1', 'assessment:q2'] });
        submitAssessment('q1', 85);

        expect(ScoreManager.getCurrentScore().raw).toBe(85);
    });
});


// ─── Maximum Formula ────────────────────────────────────────────────

describe('ScoreManager: maximum formula', () => {
    it('returns maximum score', () => {
        ScoreManager.initialize({ type: 'maximum', sources: ['assessment:q1', 'assessment:q2'] });
        submitAssessment('q1', 60);
        submitAssessment('q2', 95);

        expect(ScoreManager.getCurrentScore().raw).toBe(95);
    });
});


// ─── Custom Formula ─────────────────────────────────────────────────

describe('ScoreManager: custom formula', () => {
    it('uses the custom calculate function', () => {
        ScoreManager.initialize({
            type: 'custom',
            sources: ['assessment:q1', 'assessment:q2'],
            calculate: (scores) => {
                const vals = Object.values(scores);
                return vals.length > 0 ? Math.max(...vals) : null;
            }
        });
        submitAssessment('q1', 70);
        submitAssessment('q2', 85);

        expect(ScoreManager.getCurrentScore().raw).toBe(85);
    });

    it('returns null when custom function returns null', () => {
        ScoreManager.initialize({
            type: 'custom',
            sources: ['assessment:q1'],
            calculate: () => null
        });
        submitAssessment('q1', 50);

        expect(ScoreManager.getCurrentScore()).toBeNull();
    });

    it('throws when custom function returns non-number', () => {
        ScoreManager.initialize({
            type: 'custom',
            sources: ['assessment:q1'],
            calculate: () => 'bad'
        });

        // Error bubbles synchronously through the event handler chain
        expect(() => submitAssessment('q1', 50)).toThrow('must return a number');
    });

    it('throws when custom function throws', () => {
        ScoreManager.initialize({
            type: 'custom',
            sources: ['assessment:q1'],
            calculate: () => { throw new Error('oops'); }
        });

        // Error bubbles synchronously through the event handler chain
        expect(() => submitAssessment('q1', 50)).toThrow('oops');
    });
});


// ─── Event-Driven Recalculation ─────────────────────────────────────

describe('ScoreManager: event-driven recalculation', () => {
    it('updates score when assessment:submitted event fires', () => {
        ScoreManager.initialize({ type: 'average', sources: ['assessment:quiz'] });

        eventBus.emit('assessment:submitted', {
            assessmentId: 'quiz',
            results: { scorePercentage: 85 }
        });

        expect(stateManager.reportScore).toHaveBeenCalledWith(
            expect.objectContaining({ raw: 85, scaled: 0.85 })
        );
    });

    it('updates score when objective:score:updated event fires', () => {
        ScoreManager.initialize({ type: 'average', sources: ['objective:mastery'] });

        eventBus.emit('objective:score:updated', {
            objectiveId: 'mastery',
            score: 92
        });

        expect(stateManager.reportScore).toHaveBeenCalledWith(
            expect.objectContaining({ raw: 92 })
        );
    });

    it('ignores events for unconfigured sources', () => {
        ScoreManager.initialize({ type: 'average', sources: ['assessment:quiz'] });

        eventBus.emit('assessment:submitted', {
            assessmentId: 'other-quiz',
            results: { scorePercentage: 100 }
        });

        expect(stateManager.reportScore).not.toHaveBeenCalled();
    });

    it('emits course:score:updated event after recalculation', () => {
        const emitted = [];
        eventBus.on('course:score:updated', (data) => emitted.push(data));

        ScoreManager.initialize({ type: 'average', sources: ['assessment:quiz'] });

        eventBus.emit('assessment:submitted', {
            assessmentId: 'quiz',
            results: { scorePercentage: 75 }
        });

        expect(emitted).toHaveLength(1);
        expect(emitted[0].raw).toBe(75);
        expect(emitted[0].scaled).toBe(0.75);
    });

    it('flushes state after reporting score', () => {
        ScoreManager.initialize({ type: 'average', sources: ['assessment:quiz'] });

        eventBus.emit('assessment:submitted', {
            assessmentId: 'quiz',
            results: { scorePercentage: 50 }
        });

        expect(stateManager.flush).toHaveBeenCalled();
    });
});


// ─── Score Loading from State ───────────────────────────────────────

describe('ScoreManager: loading existing scores', () => {
    it('loads existing objective scores on init', () => {
        objectiveManager.getObjective.mockReturnValue({ id: 'mastery', score: 88 });

        ScoreManager.initialize({ type: 'average', sources: ['objective:mastery'] });

        const result = ScoreManager.getCurrentScore();
        expect(result.raw).toBe(88);
    });

    it('loads existing assessment scores on init', () => {
        stateManager.getDomainState.mockImplementation((key) => {
            if (key === 'assessment_final') {
                return { summary: { lastResults: { scorePercentage: 72 } } };
            }
            return null;
        });

        ScoreManager.initialize({ type: 'average', sources: ['assessment:final'] });

        const result = ScoreManager.getCurrentScore();
        expect(result.raw).toBe(72);
    });
});


// ─── Public API ─────────────────────────────────────────────────────

describe('ScoreManager: public API', () => {
    it('recalculate() throws when not initialized', () => {
        expect(() => ScoreManager.recalculate()).toThrow('not initialized');
    });

    it('getCurrentScore() returns null when not initialized', () => {
        expect(ScoreManager.getCurrentScore()).toBeNull();
    });

    it('getSourceScores() returns a copy of cached scores', () => {
        ScoreManager.initialize({ type: 'average', sources: ['assessment:q1'] });
        submitAssessment('q1', 55);

        const scores = ScoreManager.getSourceScores();
        expect(scores).toEqual({ 'assessment:q1': 55 });

        // Verify it's a copy — mutating the returned object doesn't affect the manager
        scores['assessment:q1'] = 999;
        expect(ScoreManager.getSourceScores()['assessment:q1']).toBe(55);
    });

    it('getCurrentScore() includes sources snapshot', () => {
        ScoreManager.initialize({ type: 'average', sources: ['assessment:q1', 'assessment:q2'] });
        submitAssessment('q1', 80);
        submitAssessment('q2', 60);

        const result = ScoreManager.getCurrentScore();
        expect(result.sources).toEqual({ 'assessment:q1': 80, 'assessment:q2': 60 });
    });
});


// ─── Out-of-Range Guard ─────────────────────────────────────────────

describe('ScoreManager: out-of-range guard', () => {
    it('throws when custom formula returns score > 100', () => {
        ScoreManager.initialize({
            type: 'custom',
            sources: ['assessment:q1'],
            calculate: () => 150
        });

        // Error bubbles synchronously through the event handler chain
        expect(() => submitAssessment('q1', 50)).toThrow('out of range');
    });

    it('throws when custom formula returns negative score', () => {
        ScoreManager.initialize({
            type: 'custom',
            sources: ['assessment:q1'],
            calculate: () => -10
        });

        // Error bubbles synchronously through the event handler chain
        expect(() => submitAssessment('q1', 50)).toThrow('out of range');
    });
});
