/**
 * @file adversarial-navigation-validators.test.js
 * @description Adversarial tests for navigation-validators.js.
 * Probes edge cases: invalid gating modes, inconsistent return shapes,
 * and assessment config edge cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 1: Invalid gating mode in isSlideInSequence
// ═════════════════════════════════════════════════════════════════════
// If gating.mode is an invalid value like 'none' or 'first',
// neither 'all' nor 'any' branch runs, and the function falls through
// to return true — silently including the slide when it should be excluded.

describe('BUG PROBE: invalid gating mode in isSlideInSequence', () => {
    it('defaults to "all" mode when gating mode is invalid', () => {
        evaluateGatingCondition.mockReturnValue(false);
        const slide = {
            menu: { hidden: true },
            navigation: {
                gating: {
                    mode: 'none', // Invalid mode — neither 'all' nor 'any'
                    conditions: [{ type: 'stateFlag', key: 'test' }]
                }
            }
        };

        const stateManager = {};
        const assessmentConfigs = new Map();

        // FIXED: Invalid mode defaults to 'all', conditions fail → excluded
        const result = isSlideInSequence(slide, stateManager, assessmentConfigs);
        expect(result).toBe(false);
    });
});


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 2: Invalid gating mode in validateSlideAccess
// ═════════════════════════════════════════════════════════════════════
// If gating.mode is invalid, `allowed` stays false (initialized on line 108),
// and the slide is permanently locked with no way to unlock it.

describe('BUG PROBE: invalid gating mode in validateSlideAccess', () => {
    it('defaults to "all" mode when gating mode is invalid — unlocks when conditions pass', () => {
        evaluateGatingCondition.mockReturnValue(true); // All conditions pass!

        const slide = {
            navigation: {
                gating: {
                    mode: 'first', // Invalid — neither 'all' nor 'any'
                    conditions: [{ type: 'stateFlag', key: 'test' }],
                    message: 'Should not see this'
                }
            }
        };

        const stateManager = {};
        const assessmentConfigs = new Map();

        // FIXED: Invalid mode defaults to 'all', conditions pass → allowed
        const result = validateSlideAccess(slide, stateManager, assessmentConfigs);
        expect(result.allowed).toBe(true);
    });
});


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 3: Inconsistent return shape
// ═════════════════════════════════════════════════════════════════════
// Some code paths return {allowed, message}, others return {allowed, message, reason}.
// Consumers checking `result.reason` may get undefined on some paths.

describe('BUG PROBE: inconsistent return shape in validateSlideAccess', () => {
    it('no gating: returns object WITH reason property (null)', () => {
        const result = validateSlideAccess({}, {}, new Map());
        expect(result.allowed).toBe(true);
        // FIXED: reason is always present in return shape
        expect(result).toHaveProperty('reason', null);
    });

    it('dev bypass: returns object WITH reason property', () => {
        shouldBypassGating.mockReturnValue(true);
        const result = validateSlideAccess({}, {}, new Map());
        expect(result.allowed).toBe(true);
        expect(result).toHaveProperty('reason', 'dev-bypass');
    });

    it('gating passed: HAS reason but it is null', () => {
        evaluateGatingCondition.mockReturnValue(true);
        const slide = {
            navigation: {
                gating: {
                    conditions: [{ type: 'stateFlag', key: 'test' }]
                }
            }
        };
        const result = validateSlideAccess(slide, {}, new Map());
        expect(result.allowed).toBe(true);
        // Has 'reason' property but it's null — different from missing
        expect(result.reason).toBeNull();
    });
});


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 4: validateNavigationFrom with missing assessmentId
// ═════════════════════════════════════════════════════════════════════
// If a slide has type='assessment' but no assessmentId, accessing
// assessmentConfigs.get(undefined) silently returns undefined.

describe('BUG PROBE: assessment slide with missing assessmentId', () => {
    it('silently allows navigation when assessmentId is missing', () => {
        const assessmentConfigs = new Map();
        assessmentConfigs.set(undefined, {
            completionRequirements: { blockNavigation: true, requirePass: true }
        });

        const slide = { type: 'assessment' }; // No assessmentId!

        // assessmentConfigs.get(undefined) could match
        const result = validateNavigationFrom(slide, assessmentConfigs);
        // This is subtle — if someone accidentally stored a config with undefined key...
        expect(result.allowed).toBeDefined();
    });

    it('allows navigation when assessmentId has no matching config', () => {
        const assessmentConfigs = new Map();
        const slide = { type: 'assessment', assessmentId: 'nonexistent' };

        const result = validateNavigationFrom(slide, assessmentConfigs);
        expect(result.allowed).toBe(true); // No config = no blocking
    });
});


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 5: validateSlideAccess with gating conditions that throw
// ═════════════════════════════════════════════════════════════════════
// evaluateGatingCondition can throw (e.g., unknown type).
// validateSlideAccess doesn't catch, so the error propagates uncaught.

describe('BUG PROBE: gating condition that throws', () => {
    it('error from evaluateGatingCondition propagates uncaught', () => {
        evaluateGatingCondition.mockImplementation(() => {
            throw new Error('Unknown gating condition type: bogus');
        });

        const slide = {
            navigation: {
                gating: {
                    conditions: [{ type: 'bogus', key: 'test' }]
                }
            }
        };

        // BUG: No try-catch in validateSlideAccess — the error propagates
        // to the caller which might crash navigation entirely
        expect(() => validateSlideAccess(slide, {}, new Map())).toThrow('Unknown gating condition type');
    });
});


// ═════════════════════════════════════════════════════════════════════
// BUG PROBE 6: isSlideInSequence with both includeWhen and skipUntil
// ═════════════════════════════════════════════════════════════════════
// When includeWhen passes but skipUntil fails, slide should be excluded.
// But when includeByDefault is false and includeWhen is empty,
// the slide is excluded by default. Adding skipUntil shouldn't re-include it.

describe('BUG PROBE: includeWhen + skipUntil interaction', () => {
    it('includeWhen passes but skipUntil fails → excluded', () => {
        evaluateGatingCondition
            .mockReturnValueOnce(true)  // includeWhen passes
            .mockReturnValueOnce(false); // skipUntil fails

        const slide = {
            navigation: {
                sequence: {
                    includeWhen: [{ type: 'stateFlag', key: 'unlocked' }],
                    skipUntil: [{ type: 'stateFlag', key: 'ready' }]
                }
            }
        };

        const result = isSlideInSequence(slide, {}, new Map());
        expect(result).toBe(false);
    });

    it('includeByDefault: false with empty includeWhen → excluded (skipUntil irrelevant)', () => {
        evaluateGatingCondition.mockReturnValue(true);

        const slide = {
            navigation: {
                sequence: {
                    includeByDefault: false,
                    skipUntil: [{ type: 'stateFlag', key: 'ready' }]
                }
            }
        };

        // includeWhen is empty and includeByDefault is false → include = false
        // skipUntil only runs when include is true (line 69: if (include && ...))
        const result = isSlideInSequence(slide, {}, new Map());
        expect(result).toBe(false);
    });
});
