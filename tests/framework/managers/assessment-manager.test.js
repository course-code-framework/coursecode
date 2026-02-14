import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock Dependencies ─────────────────────────────────────────────
// vi.mock factories are hoisted — shared state must live inside the factory.

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

vi.mock('../../../framework/js/utilities/utilities.js', () => ({
    deepMerge: vi.fn((...args) => Object.assign({}, ...args))
}));

vi.mock('../../../framework/js/assessment/AssessmentFactory.js', () => ({
    createAssessmentInstance: vi.fn((config) => ({
        id: config.id,
        render: vi.fn(),
        _config: config
    }))
}));

vi.mock('../../../framework/js/state/index.js', () => {
    const store = {};
    return {
        default: {
            getDomainState: vi.fn((key) => store[key] ?? null),
            setDomainState: vi.fn((key, val) => { store[key] = val; }),
            _store: store,
            _reset: () => { for (const k of Object.keys(store)) delete store[k]; }
        }
    };
});

import stateManager from '../../../framework/js/state/index.js';
import {
    createAssessment,
    hasPassedAssessment,
    meetsCompletionRequirements,
    allAssessmentsMeetRequirements,
    getAssessmentScore
} from '../../../framework/js/managers/assessment-manager.js';

beforeEach(() => {
    vi.clearAllMocks();
    stateManager._reset();
});


// ─── createAssessment ───────────────────────────────────────────────

describe('createAssessment', () => {
    it('creates an assessment and returns instance with render()', () => {
        const assessment = createAssessment({ id: 'quiz-1', questions: [{}] });
        expect(assessment.render).toBeDefined();
        expect(typeof assessment.render).toBe('function');
    });

    it('merges overrides into base config', () => {
        const assessment = createAssessment(
            { id: 'quiz-1', questions: [{}] },
            { settings: { passingScore: 90 } }
        );
        expect(assessment._config.settings.passingScore).toBe(90);
    });
});


// ─── hasPassedAssessment ────────────────────────────────────────────

describe('hasPassedAssessment', () => {
    it('throws when assessmentId is missing', () => {
        expect(() => hasPassedAssessment(null)).toThrow('assessmentId is required');
        expect(() => hasPassedAssessment('')).toThrow('assessmentId is required');
    });

    it('returns false when assessment has no state', () => {
        expect(hasPassedAssessment('quiz-1')).toBe(false);
    });

    it('returns false when assessment has no summary', () => {
        stateManager._store['assessment_quiz-1'] = {};
        expect(hasPassedAssessment('quiz-1')).toBe(false);
    });

    it('returns false when assessment is submitted but not passed', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { submitted: true, lastResults: { passed: false } }
        };
        expect(hasPassedAssessment('quiz-1')).toBe(false);
    });

    it('returns false when assessment is passed but not submitted', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { submitted: false, lastResults: { passed: true } }
        };
        expect(hasPassedAssessment('quiz-1')).toBe(false);
    });

    it('returns true when assessment is submitted AND passed', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { submitted: true, lastResults: { passed: true } }
        };
        expect(hasPassedAssessment('quiz-1')).toBe(true);
    });
});


// ─── meetsCompletionRequirements ────────────────────────────────────

describe('meetsCompletionRequirements', () => {
    it('throws when assessmentId is missing', () => {
        expect(() => meetsCompletionRequirements(null)).toThrow('assessmentId is required');
    });

    it('returns false when assessment has no state', () => {
        expect(meetsCompletionRequirements('quiz-1', { requireSubmission: true })).toBe(false);
    });

    it('returns true with empty requirements (no restrictions)', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { submitted: false }
        };
        expect(meetsCompletionRequirements('quiz-1', {})).toBe(true);
    });

    it('fails when requireSubmission is true but not submitted', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { submitted: false }
        };
        expect(meetsCompletionRequirements('quiz-1', { requireSubmission: true })).toBe(false);
    });

    it('passes when requireSubmission is true and submitted', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { submitted: true }
        };
        expect(meetsCompletionRequirements('quiz-1', { requireSubmission: true })).toBe(true);
    });

    it('fails when requirePass is true but not passed', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { submitted: true, lastResults: { passed: false } }
        };
        expect(meetsCompletionRequirements('quiz-1', { requirePass: true })).toBe(false);
    });

    it('passes when requirePass is true and passed', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { submitted: true, lastResults: { passed: true } }
        };
        expect(meetsCompletionRequirements('quiz-1', { requirePass: true })).toBe(true);
    });

    it('checks both requireSubmission and requirePass together', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { submitted: true, lastResults: { passed: true } }
        };
        expect(meetsCompletionRequirements('quiz-1', {
            requireSubmission: true,
            requirePass: true
        })).toBe(true);
    });

    it('fails when submitted but not passed (both required)', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { submitted: true, lastResults: { passed: false } }
        };
        expect(meetsCompletionRequirements('quiz-1', {
            requireSubmission: true,
            requirePass: true
        })).toBe(false);
    });
});


// ─── allAssessmentsMeetRequirements ─────────────────────────────────

describe('allAssessmentsMeetRequirements', () => {
    it('throws when argument is not an array', () => {
        expect(() => allAssessmentsMeetRequirements('not-array')).toThrow('must be an array');
    });

    it('returns true for empty array', () => {
        expect(allAssessmentsMeetRequirements([])).toBe(true);
    });

    it('returns true when no assessments have completion requirements', () => {
        expect(allAssessmentsMeetRequirements([
            { assessmentId: 'quiz-1', assessment: {} },
            { assessmentId: 'quiz-2', assessment: { completionRequirements: {} } }
        ])).toBe(true);
    });

    it('returns true when all assessments with requirements are met', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { submitted: true, lastResults: { passed: true } }
        };
        stateManager._store['assessment_quiz-2'] = {
            summary: { submitted: true }
        };

        expect(allAssessmentsMeetRequirements([
            {
                assessmentId: 'quiz-1',
                assessment: { completionRequirements: { requireSubmission: true, requirePass: true } }
            },
            {
                assessmentId: 'quiz-2',
                assessment: { completionRequirements: { requireSubmission: true } }
            }
        ])).toBe(true);
    });

    it('returns false when any assessment requirement is not met', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { submitted: true, lastResults: { passed: true } }
        };
        // quiz-2 not submitted

        expect(allAssessmentsMeetRequirements([
            {
                assessmentId: 'quiz-1',
                assessment: { completionRequirements: { requireSubmission: true, requirePass: true } }
            },
            {
                assessmentId: 'quiz-2',
                assessment: { completionRequirements: { requireSubmission: true } }
            }
        ])).toBe(false);
    });

    it('ignores assessments without completion requirements', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { submitted: true }
        };

        expect(allAssessmentsMeetRequirements([
            {
                assessmentId: 'quiz-1',
                assessment: { completionRequirements: { requireSubmission: true } }
            },
            {
                assessmentId: 'quiz-2',
                assessment: {}
            }
        ])).toBe(true);
    });
});


// ─── getAssessmentScore ─────────────────────────────────────────────

describe('getAssessmentScore', () => {
    it('throws when assessmentId is missing', () => {
        expect(() => getAssessmentScore(null)).toThrow('assessmentId is required');
    });

    it('returns null when assessment has no state', () => {
        expect(getAssessmentScore('quiz-1')).toBeNull();
    });

    it('returns null when assessment has no summary', () => {
        stateManager._store['assessment_quiz-1'] = {};
        expect(getAssessmentScore('quiz-1')).toBeNull();
    });

    it('returns null when assessment has no lastResults', () => {
        stateManager._store['assessment_quiz-1'] = { summary: {} };
        expect(getAssessmentScore('quiz-1')).toBeNull();
    });

    it('returns score percentage when assessment has been submitted', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { lastResults: { scorePercentage: 87 } }
        };
        expect(getAssessmentScore('quiz-1')).toBe(87);
    });

    it('returns null when scorePercentage is not a number', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { lastResults: { scorePercentage: 'high' } }
        };
        expect(getAssessmentScore('quiz-1')).toBeNull();
    });

    it('returns 0 when score is explicitly zero', () => {
        stateManager._store['assessment_quiz-1'] = {
            summary: { lastResults: { scorePercentage: 0 } }
        };
        expect(getAssessmentScore('quiz-1')).toBe(0);
    });
});
