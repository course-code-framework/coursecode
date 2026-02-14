import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Dependencies ─────────────────────────────────────────────

vi.mock('../../../framework/js/navigation/navigation-helpers.js', () => ({
    evaluateGatingCondition: vi.fn(),
    shouldBypassGating: vi.fn(() => false)
}));

vi.mock('../../../framework/js/managers/assessment-manager.js', () => ({
    meetsCompletionRequirements: vi.fn(() => false)
}));

import { evaluateGatingCondition, shouldBypassGating } from '../../../framework/js/navigation/navigation-helpers.js';
import * as AssessmentManager from '../../../framework/js/managers/assessment-manager.js';
import { isSlideInSequence, validateSlideAccess, validateNavigationFrom } from '../../../framework/js/navigation/navigation-validators.js';


beforeEach(() => {
    vi.clearAllMocks();
    shouldBypassGating.mockReturnValue(false);
    evaluateGatingCondition.mockReturnValue(false);
});


// ─── isSlideInSequence ──────────────────────────────────────────────

describe('isSlideInSequence', () => {
    const stateManager = {};
    const assessmentConfigs = new Map();

    it('returns false for null slide', () => {
        expect(isSlideInSequence(null, stateManager, assessmentConfigs)).toBe(false);
    });

    it('returns true for slide with no sequence or gating config', () => {
        expect(isSlideInSequence({}, stateManager, assessmentConfigs)).toBe(true);
    });

    // ── Smart Default: hidden + gating → sequence inclusion ──

    describe('smart default (hidden + gating)', () => {
        it('includes slide when all gating conditions are met', () => {
            evaluateGatingCondition.mockReturnValue(true);
            const slide = {
                menu: { hidden: true },
                navigation: {
                    gating: {
                        conditions: [{ type: 'stateFlag', key: 'test' }]
                    }
                }
            };
            expect(isSlideInSequence(slide, stateManager, assessmentConfigs)).toBe(true);
        });

        it('excludes slide when gating conditions are not met', () => {
            evaluateGatingCondition.mockReturnValue(false);
            const slide = {
                menu: { hidden: true },
                navigation: {
                    gating: {
                        conditions: [{ type: 'stateFlag', key: 'test' }]
                    }
                }
            };
            expect(isSlideInSequence(slide, stateManager, assessmentConfigs)).toBe(false);
        });

        it('uses "any" mode when configured', () => {
            evaluateGatingCondition
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true);
            const slide = {
                menu: { hidden: true },
                navigation: {
                    gating: {
                        mode: 'any',
                        conditions: [
                            { type: 'stateFlag', key: 'a' },
                            { type: 'stateFlag', key: 'b' }
                        ]
                    }
                }
            };
            expect(isSlideInSequence(slide, stateManager, assessmentConfigs)).toBe(true);
        });

        it('does not apply smart default when slide is not hidden', () => {
            const slide = {
                navigation: {
                    gating: {
                        conditions: [{ type: 'stateFlag', key: 'test' }]
                    }
                }
            };
            // No sequence config + not hidden → always included
            expect(isSlideInSequence(slide, stateManager, assessmentConfigs)).toBe(true);
        });
    });

    // ── Explicit sequence config ──

    describe('explicit sequence config', () => {
        it('includes by default when includeByDefault is not false', () => {
            const slide = { navigation: { sequence: {} } };
            expect(isSlideInSequence(slide, stateManager, assessmentConfigs)).toBe(true);
        });

        it('excludes when includeByDefault is false and no includeWhen', () => {
            const slide = { navigation: { sequence: { includeByDefault: false } } };
            expect(isSlideInSequence(slide, stateManager, assessmentConfigs)).toBe(false);
        });

        it('includes when includeWhen conditions are all met', () => {
            evaluateGatingCondition.mockReturnValue(true);
            const slide = {
                navigation: {
                    sequence: {
                        includeWhen: [{ type: 'stateFlag', key: 'unlocked' }]
                    }
                }
            };
            expect(isSlideInSequence(slide, stateManager, assessmentConfigs)).toBe(true);
        });

        it('excludes when includeWhen condition fails', () => {
            evaluateGatingCondition.mockReturnValue(false);
            const slide = {
                navigation: {
                    sequence: {
                        includeWhen: [{ type: 'stateFlag', key: 'unlocked' }]
                    }
                }
            };
            expect(isSlideInSequence(slide, stateManager, assessmentConfigs)).toBe(false);
        });

        it('excludes when skipUntil conditions are not met', () => {
            evaluateGatingCondition.mockReturnValue(false);
            const slide = {
                navigation: {
                    sequence: {
                        skipUntil: [{ type: 'stateFlag', key: 'ready' }]
                    }
                }
            };
            expect(isSlideInSequence(slide, stateManager, assessmentConfigs)).toBe(false);
        });

        it('includes when skipUntil conditions are met', () => {
            evaluateGatingCondition.mockReturnValue(true);
            const slide = {
                navigation: {
                    sequence: {
                        skipUntil: [{ type: 'stateFlag', key: 'ready' }]
                    }
                }
            };
            expect(isSlideInSequence(slide, stateManager, assessmentConfigs)).toBe(true);
        });
    });
});


// ─── validateSlideAccess ────────────────────────────────────────────

describe('validateSlideAccess', () => {
    const stateManager = {};
    const assessmentConfigs = new Map();

    it('allows access when dev bypass is active', () => {
        shouldBypassGating.mockReturnValue(true);
        const slide = {
            navigation: {
                gating: { conditions: [{ type: 'stateFlag', key: 'test' }] }
            }
        };
        const result = validateSlideAccess(slide, stateManager, assessmentConfigs);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe('dev-bypass');
    });

    it('allows access when no gating configured', () => {
        const result = validateSlideAccess({}, stateManager, assessmentConfigs);
        expect(result.allowed).toBe(true);
    });

    it('allows access for null slide', () => {
        const result = validateSlideAccess(null, stateManager, assessmentConfigs);
        expect(result.allowed).toBe(true);
    });

    it('allows access when gating has empty conditions', () => {
        const slide = { navigation: { gating: { conditions: [] } } };
        const result = validateSlideAccess(slide, stateManager, assessmentConfigs);
        expect(result.allowed).toBe(true);
    });

    it('blocks access when gating conditions fail (mode: all)', () => {
        evaluateGatingCondition.mockReturnValue(false);
        const slide = {
            navigation: {
                gating: {
                    conditions: [{ type: 'stateFlag', key: 'test' }],
                    message: 'Complete the previous section first.'
                }
            }
        };
        const result = validateSlideAccess(slide, stateManager, assessmentConfigs);
        expect(result.allowed).toBe(false);
        expect(result.message).toBe('Complete the previous section first.');
        expect(result.reason).toBe('gating-failed');
    });

    it('uses default message when none configured', () => {
        evaluateGatingCondition.mockReturnValue(false);
        const slide = {
            navigation: {
                gating: { conditions: [{ type: 'stateFlag', key: 'test' }] }
            }
        };
        const result = validateSlideAccess(slide, stateManager, assessmentConfigs);
        expect(result.message).toBe('This content is currently locked.');
    });

    it('allows access when any condition passes (mode: any)', () => {
        evaluateGatingCondition
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(true);
        const slide = {
            navigation: {
                gating: {
                    mode: 'any',
                    conditions: [
                        { type: 'stateFlag', key: 'a' },
                        { type: 'stateFlag', key: 'b' }
                    ]
                }
            }
        };
        const result = validateSlideAccess(slide, stateManager, assessmentConfigs);
        expect(result.allowed).toBe(true);
    });

    it('allows access when all conditions pass (mode: all)', () => {
        evaluateGatingCondition.mockReturnValue(true);
        const slide = {
            navigation: {
                gating: {
                    conditions: [
                        { type: 'stateFlag', key: 'a' },
                        { type: 'stateFlag', key: 'b' }
                    ]
                }
            }
        };
        const result = validateSlideAccess(slide, stateManager, assessmentConfigs);
        expect(result.allowed).toBe(true);
        expect(result.message).toBeNull();
    });
});


// ─── validateNavigationFrom ─────────────────────────────────────────

describe('validateNavigationFrom', () => {
    const assessmentConfigs = new Map();

    it('allows navigation when dev bypass is active', () => {
        shouldBypassGating.mockReturnValue(true);
        const slide = { type: 'assessment', assessmentId: 'quiz' };
        assessmentConfigs.set('quiz', {
            completionRequirements: { blockNavigation: true, requirePass: true }
        });
        const result = validateNavigationFrom(slide, assessmentConfigs);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe('dev-bypass');
    });

    it('allows navigation for null slide', () => {
        const result = validateNavigationFrom(null, assessmentConfigs);
        expect(result.allowed).toBe(true);
    });

    it('allows navigation for non-assessment slides', () => {
        const result = validateNavigationFrom({ type: 'content' }, assessmentConfigs);
        expect(result.allowed).toBe(true);
    });

    it('allows navigation when blockNavigation is not set', () => {
        assessmentConfigs.set('quiz', {
            completionRequirements: { requirePass: true }
        });
        const slide = { type: 'assessment', assessmentId: 'quiz' };
        const result = validateNavigationFrom(slide, assessmentConfigs);
        expect(result.allowed).toBe(true);
    });

    it('blocks navigation when assessment requirements not met (requirePass)', () => {
        AssessmentManager.meetsCompletionRequirements.mockReturnValue(false);
        assessmentConfigs.set('quiz', {
            completionRequirements: { blockNavigation: true, requirePass: true }
        });
        const slide = { type: 'assessment', assessmentId: 'quiz' };
        const result = validateNavigationFrom(slide, assessmentConfigs);
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('pass');
        expect(result.reason).toBe('assessment-incomplete');
    });

    it('blocks navigation when assessment requirements not met (requireSubmission)', () => {
        AssessmentManager.meetsCompletionRequirements.mockReturnValue(false);
        assessmentConfigs.set('quiz', {
            completionRequirements: { blockNavigation: true, requireSubmission: true }
        });
        const slide = { type: 'assessment', assessmentId: 'quiz' };
        const result = validateNavigationFrom(slide, assessmentConfigs);
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('submit');
    });

    it('allows navigation when assessment requirements are met', () => {
        AssessmentManager.meetsCompletionRequirements.mockReturnValue(true);
        assessmentConfigs.set('quiz', {
            completionRequirements: { blockNavigation: true, requirePass: true }
        });
        const slide = { type: 'assessment', assessmentId: 'quiz' };
        const result = validateNavigationFrom(slide, assessmentConfigs);
        expect(result.allowed).toBe(true);
    });

    it('uses generic message when no specific requirement', () => {
        AssessmentManager.meetsCompletionRequirements.mockReturnValue(false);
        assessmentConfigs.set('quiz', {
            completionRequirements: { blockNavigation: true }
        });
        const slide = { type: 'assessment', assessmentId: 'quiz' };
        const result = validateNavigationFrom(slide, assessmentConfigs);
        expect(result.message).toContain('complete the assessment');
    });
});
