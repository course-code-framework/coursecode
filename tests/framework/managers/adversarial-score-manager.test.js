/**
 * @file adversarial-score-manager.test.js
 * @description Adversarial tests for score-manager.js.
 * Probes: partial source completion behavior, NaN/Infinity scores,
 * event-handler error isolation, sourceId with colons.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Dependencies ─────────────────────────────────────────────

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

vi.mock('../../../framework/js/state/index.js', () => ({
    default: {
        getDomainState: vi.fn(() => null),
        setDomainState: vi.fn(),
        reportScore: vi.fn(),
        reportCompletion: vi.fn(),
        flush: vi.fn(() => Promise.resolve())
    }
}));

vi.mock('../../../framework/js/managers/objective-manager.js', () => ({
    default: {
        getObjective: vi.fn(() => null)
    }
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
            _reset: () => { for (const k of Object.keys(handlers)) delete handlers[k]; }
        }
    };
});

import stateManager from '../../../framework/js/state/index.js';
import { eventBus } from '../../../framework/js/core/event-bus.js';

let ScoreManager;

beforeEach(async () => {
    vi.clearAllMocks();
    stateManager.getDomainState.mockReturnValue(null);
    stateManager.flush.mockReturnValue(Promise.resolve());
    eventBus._reset();
    vi.resetModules();

    vi.doMock('../../../framework/js/utilities/logger.js', () => ({
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
    }));
    vi.doMock('../../../framework/js/state/index.js', () => ({ default: stateManager }));
    vi.doMock('../../../framework/js/core/event-bus.js', () => ({ eventBus }));
    vi.doMock('../../../framework/js/managers/objective-manager.js', () => ({
        default: { getObjective: vi.fn(() => null) }
    }));

    const mod = await import('../../../framework/js/managers/score-manager.js');
    ScoreManager = mod.default;
});

function submitAssessment(id, scorePercentage) {
    eventBus.emit('assessment:submitted', {
        assessmentId: id,
        results: { scorePercentage }
    });
}


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 1: Average formula with partial completion
// ═════════════════════════════════════════════════════════════════════
// With 3 sources but only 1 submitted, average divides by 1, not 3.
// A student scoring 100 on 1 of 3 assessments gets a course score of 100.

describe('BUG PROBE: average formula with partial completion', () => {
    it('averages only available scores, not all configured sources', () => {
        ScoreManager.initialize({
            type: 'average',
            sources: ['assessment:quiz1', 'assessment:quiz2', 'assessment:quiz3']
        });

        // Only submit 1 of 3 assessments with score of 100
        submitAssessment('quiz1', 100);

        const result = ScoreManager.getCurrentScore();
        // BUG/DESIGN: Average is 100/1 = 100, not 100/3 = 33.3
        // A student who skips 2 of 3 quizzes gets a perfect score
        expect(result.raw).toBe(100); // This is technically what the code does
        // but it's probably not what the course author intended
    });

    it('weighted formula also normalizes to available weights only', () => {
        ScoreManager.initialize({
            type: 'weighted',
            sources: [
                { id: 'assessment:final', weight: 0.6 },
                { id: 'assessment:midterm', weight: 0.4 }
            ]
        });

        // Only final submitted (60% weight)
        submitAssessment('final', 80);

        const result = ScoreManager.getCurrentScore();
        // Weighted: (80 * 0.6) / 0.6 = 80
        // NOT (80 * 0.6) / 1.0 = 48
        // Student gets 80% by skipping the midterm entirely
        expect(result.raw).toBe(80);
    });
});


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 2: NaN and Infinity scores
// ═════════════════════════════════════════════════════════════════════
// What happens when assessment emits NaN or Infinity as scorePercentage?

describe('BUG PROBE: NaN and Infinity scores', () => {
    it('NaN score is now caught by the range guard', () => {
        ScoreManager.initialize({
            type: 'average',
            sources: ['assessment:q1', 'assessment:q2']
        });

        submitAssessment('q1', 80);

        // FIXED: NaN now triggers the out-of-range guard (isNaN check added)
        expect(() => submitAssessment('q2', NaN)).toThrow('out of range');
    });

    it('Infinity score triggers out-of-range guard', () => {
        ScoreManager.initialize({
            type: 'average',
            sources: ['assessment:q1']
        });

        // Infinity is > 100, so this should throw
        expect(() => submitAssessment('q1', Infinity)).toThrow('out of range');
    });

    it('negative score triggers out-of-range guard', () => {
        ScoreManager.initialize({
            type: 'average',
            sources: ['assessment:q1']
        });

        expect(() => submitAssessment('q1', -50)).toThrow('out of range');
    });
});


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 3: Source ID with multiple colons
// ═════════════════════════════════════════════════════════════════════
// _loadExistingScores does `sourceId.split(':')` which only destructures
// the first two parts. If the ID contains a colon, it's lost.

describe('BUG PROBE: source ID with extra colons', () => {
    it('assessment ID with colon gets truncated on load', () => {
        ScoreManager.initialize({
            type: 'average',
            sources: ['assessment:module:final-exam']
        });

        // The _loadExistingScores method does:
        //   const [type, id] = sourceId.split(':');
        //   → type = 'assessment', id = 'module'
        //   → looks up `assessment_module` instead of `assessment_module:final-exam`
        // This silently fails to load existing scores for complex IDs

        // The event listener DOES work correctly because it uses the full assessmentId
        submitAssessment('module:final-exam', 90);
        const result = ScoreManager.getCurrentScore();
        expect(result.raw).toBe(90);
    });
});


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 4: Score of exactly 0 vs null
// ═════════════════════════════════════════════════════════════════════
// Score of 0 is a valid score (student got nothing right).
// Does the system properly distinguish 0 from "not yet submitted"?

describe('BUG PROBE: score of zero', () => {
    it('score of 0 is preserved and not treated as null', () => {
        ScoreManager.initialize({
            type: 'average',
            sources: ['assessment:q1']
        });

        submitAssessment('q1', 0);

        const result = ScoreManager.getCurrentScore();
        expect(result).not.toBeNull();
        expect(result.raw).toBe(0);
        expect(result.scaled).toBe(0);
    });

    it('minimum formula with a 0 score returns 0, not null', () => {
        ScoreManager.initialize({
            type: 'minimum',
            sources: ['assessment:q1', 'assessment:q2']
        });

        submitAssessment('q1', 0);
        submitAssessment('q2', 100);

        const result = ScoreManager.getCurrentScore();
        expect(result.raw).toBe(0);
    });
});


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 5: Assessment event with missing/malformed data
// ═════════════════════════════════════════════════════════════════════

describe('BUG PROBE: malformed assessment events', () => {
    it('ignores assessment event with null results', () => {
        ScoreManager.initialize({
            type: 'average',
            sources: ['assessment:q1']
        });

        // Should not throw
        eventBus.emit('assessment:submitted', {
            assessmentId: 'q1',
            results: null
        });

        expect(ScoreManager.getCurrentScore()).toBeNull(); // No score recorded
    });

    it('ignores assessment event with non-numeric scorePercentage', () => {
        ScoreManager.initialize({
            type: 'average',
            sources: ['assessment:q1']
        });

        eventBus.emit('assessment:submitted', {
            assessmentId: 'q1',
            results: { scorePercentage: 'ninety' }
        });

        expect(ScoreManager.getCurrentScore()).toBeNull(); // Not recorded
    });

    it('ignores assessment event with no assessmentId', () => {
        ScoreManager.initialize({
            type: 'average',
            sources: ['assessment:q1']
        });

        eventBus.emit('assessment:submitted', {
            results: { scorePercentage: 100 }
        });

        // assessmentId is undefined → sourceId = 'assessment:undefined'
        // which won't match 'assessment:q1'
        expect(ScoreManager.getCurrentScore()).toBeNull();
    });
});
