/**
 * @file adversarial-assessment-manager.test.js
 * @description Adversarial tests for assessment-manager.js
 *
 * These tests probe edge cases and boundary conditions to find bugs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to create mock objects BEFORE vi.mock factory runs
const { mockDomainState, mockStateManager, mockCreateAssessmentInstance } = vi.hoisted(() => {
    const mockDomainState = {};
    return {
        mockDomainState,
        mockStateManager: {
            getDomainState: (key) => mockDomainState[key] ?? null,
            setDomainState: (key, value) => { mockDomainState[key] = value; }
        },
        mockCreateAssessmentInstance: vi.fn(() => ({ render: vi.fn() }))
    };
});

vi.mock('../../../framework/js/utilities/utilities.js', () => ({
    deepMerge: (...args) => Object.assign({}, ...args)
}));

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
    }
}));

vi.mock('../../../framework/js/state/index.js', () => ({
    default: mockStateManager
}));

vi.mock('../../../framework/js/assessment/AssessmentFactory.js', () => ({
    createAssessmentInstance: mockCreateAssessmentInstance
}));

import {
    hasPassedAssessment,
    meetsCompletionRequirements,
    allAssessmentsMeetRequirements,
    getAssessmentScore,
    createAssessment
} from '../../../framework/js/managers/assessment-manager.js';

function setDomainState(assessmentId, state) {
    mockDomainState[`assessment_${assessmentId}`] = state;
}

beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockDomainState).forEach(k => delete mockDomainState[k]);
    mockCreateAssessmentInstance.mockReturnValue({ render: vi.fn() });
});

// =========================================================================
// BUG PROBE: allAssessmentsMeetRequirements with missing assessmentId
// =========================================================================

describe('BUG PROBE: allAssessmentsMeetRequirements with missing assessmentId', () => {
    it('throws when a slide has assessment config but no assessmentId', () => {
        const slides = [{
            // assessmentId is missing!
            assessment: {
                completionRequirements: {
                    requireSubmission: true
                }
            }
        }];

        expect(() => allAssessmentsMeetRequirements(slides)).toThrow('assessmentId is required');
    });
});

// =========================================================================
// BUG PROBE: meetsCompletionRequirements with empty requirements
// =========================================================================

describe('BUG PROBE: meetsCompletionRequirements with empty requirements', () => {
    it('returns true for initialized assessment when requirements are empty', () => {
        setDomainState('ghost', { summary: { submitted: false } });

        const result = meetsCompletionRequirements('ghost', {});
        // Neither requireSubmission nor requirePass is truthy → passes
        expect(result).toBe(true);
    });

    it('returns false for truly uninitialized assessment (no domain state)', () => {
        const result = meetsCompletionRequirements('nonexistent', {});
        expect(result).toBe(false);
    });
});

// =========================================================================
// BUG PROBE: getAssessmentScore with corrupt state
// =========================================================================

describe('BUG PROBE: getAssessmentScore with corrupt state', () => {
    it('returns null for NaN score (validated)', () => {
        setDomainState('q1', {
            summary: { lastResults: { scorePercentage: NaN } }
        });

        // FIXED: NaN is now rejected
        const score = getAssessmentScore('q1');
        expect(score).toBeNull();
    });

    it('returns null for negative score (validated)', () => {
        setDomainState('q2', {
            summary: { lastResults: { scorePercentage: -50 } }
        });

        // FIXED: out-of-range scores return null
        const score = getAssessmentScore('q2');
        expect(score).toBeNull();
    });

    it('returns null for score > 100 (validated)', () => {
        setDomainState('q3', {
            summary: { lastResults: { scorePercentage: 150 } }
        });

        // FIXED: out-of-range scores return null
        const score = getAssessmentScore('q3');
        expect(score).toBeNull();
    });
});

// =========================================================================
// BUG PROBE: hasPassedAssessment with partial state
// =========================================================================

describe('BUG PROBE: hasPassedAssessment with partial state', () => {
    it('returns false when summary exists but lastResults is null', () => {
        setDomainState('quiz', {
            summary: { submitted: true, lastResults: null }
        });

        const result = hasPassedAssessment('quiz');
        expect(result).toBe(false);
    });

    it('returns false when submitted is true but passed is false', () => {
        setDomainState('quiz2', {
            summary: { submitted: true, lastResults: { passed: false } }
        });

        const result = hasPassedAssessment('quiz2');
        expect(result).toBe(false);
    });

    it('returns false when passed is truthy but not exactly true', () => {
        setDomainState('quiz3', {
            summary: { submitted: true, lastResults: { passed: 'yes' } }
        });

        const result = hasPassedAssessment('quiz3');
        expect(result).toBe(false);
    });
});

// =========================================================================
// BUG PROBE: createAssessment overrides can clobber id
// =========================================================================

describe('BUG PROBE: createAssessment with destructive overrides', () => {
    it('overrides can replace id with empty string', () => {
        mockCreateAssessmentInstance.mockImplementation((config) => {
            if (!config.id) throw new Error('Assessment ID required');
            return { render: vi.fn() };
        });

        expect(() => createAssessment(
            { id: 'valid', questions: [{}] },
            { id: '' }
        )).toThrow();
    });
});

// =========================================================================
// BUG PROBE: allAssessmentsMeetRequirements filtering
// =========================================================================

describe('BUG PROBE: allAssessmentsMeetRequirements filtering', () => {
    it('returns true when no slides have active requirements', () => {
        const slides = [
            { assessmentId: 'q1', assessment: {} },
            { assessmentId: 'q2', assessment: { completionRequirements: {} } },
            { assessmentId: 'q3' }
        ];

        const result = allAssessmentsMeetRequirements(slides);
        expect(result).toBe(true);
    });

    it('mixed slides: only those with requirements are checked', () => {
        setDomainState('q2', {
            summary: { submitted: true }
        });

        const slides = [
            { assessmentId: 'q1', assessment: {} },
            {
                assessmentId: 'q2',
                assessment: {
                    completionRequirements: { requireSubmission: true }
                }
            }
        ];

        const result = allAssessmentsMeetRequirements(slides);
        expect(result).toBe(true);
    });
});
