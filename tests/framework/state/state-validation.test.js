import { describe, it, expect, vi, beforeEach } from 'vitest';

// We mock import.meta.env.DEV as true for most tests
vi.stubGlobal('import', { meta: { env: { DEV: true } } });

// Mock logger and eventBus
vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

vi.mock('../../../framework/js/core/event-bus.js', () => {
    const mockBus = { emit: vi.fn(), on: vi.fn(() => () => {}), off: vi.fn() };
    return { eventBus: mockBus, EventBus: vi.fn(() => mockBus) };
});

const { StateValidator } = await import('../../../framework/js/state/state-validation.js');
const { logger } = await import('../../../framework/js/utilities/logger.js');

describe('StateValidator', () => {
    let validator;

    beforeEach(() => {
        vi.clearAllMocks();
        validator = new StateValidator();
    });

    // ─── schemaVersion ──────────────────────────────────────────────

    describe('schemaVersion', () => {
        it('reports current schema version', () => {
            expect(validator.schemaVersion).toBeTypeOf('number');
            expect(validator.schemaVersion).toBeGreaterThan(0);
        });
    });

    // ─── setCourseValidationConfig ──────────────────────────────────

    describe('setCourseValidationConfig', () => {
        it('accepts valid config with structure', () => {
            expect(() => validator.setCourseValidationConfig({
                structure: [{ id: 'slide-1' }]
            })).not.toThrow();
        });

        it('throws on null config', () => {
            expect(() => validator.setCourseValidationConfig(null)).toThrow('must be an object');
        });

        it('throws on config without structure array', () => {
            expect(() => validator.setCourseValidationConfig({})).toThrow('must include a structure array');
        });

        it('collects slide IDs from nested sections', () => {
            validator.setCourseValidationConfig({
                structure: [
                    { id: 'slide-1' },
                    { id: 'section-1', children: [{ id: 'slide-2' }, { id: 'slide-3' }] }
                ]
            });
            // Validate by testing that a state with these slide IDs passes validation
            const state = {
                _meta: { schemaVersion: validator.schemaVersion },
                navigation: { visitedSlides: ['slide-1', 'slide-2', 'slide-3'] }
            };
            const result = validator.validateAndMigrateState(state);
            expect(result.navigation.visitedSlides).toEqual(['slide-1', 'slide-2', 'slide-3']);
        });

        it('collects objective IDs', () => {
            validator.setCourseValidationConfig({
                structure: [{ id: 'slide-1' }],
                objectives: [{ id: 'obj-pass' }, { id: 'obj-complete' }]
            });
            // Objectives are stored internally; we validate by checking validation doesn't fail
            expect(() => validator.validateAndMigrateState({
                _meta: { schemaVersion: validator.schemaVersion }
            })).not.toThrow();
        });
    });

    // ─── createFreshState ───────────────────────────────────────────

    describe('createFreshState', () => {
        it('includes _meta with schemaVersion', () => {
            const state = validator.createFreshState();
            expect(state._meta.schemaVersion).toBe(validator.schemaVersion);
        });

        it('includes createdAt timestamp', () => {
            const state = validator.createFreshState();
            const date = new Date(state._meta.createdAt);
            expect(date.getTime()).not.toBeNaN();
        });
    });

    // ─── hydrateStateFromLMS ────────────────────────────────────────
    // CRITICAL: This is the first thing that runs on course resume.
    // Getting this wrong means data loss or crash on return visits.

    describe('hydrateStateFromLMS', () => {
        it('returns fresh state for ab-initio entry', () => {
            const mockLMS = {
                getEntryMode: () => 'ab-initio',
                getSuspendData: vi.fn()
            };
            const state = validator.hydrateStateFromLMS(mockLMS);
            expect(state._meta).toBeDefined();
            expect(mockLMS.getSuspendData).not.toHaveBeenCalled();
        });

        it('restores state from suspend_data on resume', () => {
            validator.setCourseValidationConfig({ structure: [{ id: 'slide-1' }] });
            const savedState = {
                _meta: { schemaVersion: validator.schemaVersion },
                navigation: { currentSlide: 'slide-1' }
            };
            const mockLMS = {
                getEntryMode: () => 'resume',
                getSuspendData: () => savedState
            };
            const state = validator.hydrateStateFromLMS(mockLMS);
            expect(state.navigation.currentSlide).toBe('slide-1');
        });

        it('returns fresh state when resume but no suspend_data', () => {
            const mockLMS = {
                getEntryMode: () => 'resume',
                getSuspendData: () => null
            };
            const state = validator.hydrateStateFromLMS(mockLMS);
            expect(state._meta).toBeDefined();
        });

        it('throws when LMS getEntryMode fails', () => {
            const mockLMS = {
                getEntryMode: () => { throw new Error('LMS not ready'); }
            };
            expect(() => validator.hydrateStateFromLMS(mockLMS)).toThrow('Cannot read entry mode');
        });
    });

    // ─── validateAndMigrateState ────────────────────────────────────

    describe('validateAndMigrateState', () => {
        beforeEach(() => {
            validator.setCourseValidationConfig({
                structure: [
                    { id: 'slide-1' },
                    { id: 'slide-2' },
                    { id: 'slide-3' }
                ]
            });
        });

        it('passes through valid state with correct schema version', () => {
            const state = {
                _meta: { schemaVersion: validator.schemaVersion },
                navigation: { currentSlide: 'slide-1', visitedSlides: ['slide-1', 'slide-2'] }
            };
            const result = validator.validateAndMigrateState(state);
            expect(result.navigation.currentSlide).toBe('slide-1');
        });

        it('adds _meta to state without it', () => {
            // Without validation config, no _meta = adds one
            const noConfigValidator = new StateValidator();
            const result = noConfigValidator.validateAndMigrateState({});
            expect(result._meta).toBeDefined();
            expect(result._meta.schemaVersion).toBe(validator.schemaVersion);
        });

        it('filters out invalid slide IDs from visitedSlides', () => {
            const state = {
                _meta: { schemaVersion: validator.schemaVersion },
                navigation: { visitedSlides: ['slide-1', 'nonexistent', 'slide-2'] }
            };
            const result = validator.validateAndMigrateState(state);
            expect(result.navigation.visitedSlides).toEqual(['slide-1', 'slide-2']);
        });

        it('filters engagement state for removed slides', () => {
            const state = {
                _meta: { schemaVersion: validator.schemaVersion },
                engagement: {
                    'slide-1': { complete: true },
                    'deleted-slide': { complete: false }
                }
            };
            const result = validator.validateAndMigrateState(state);
            expect(result.engagement['slide-1']).toBeDefined();
            expect(result.engagement['deleted-slide']).toBeUndefined();
        });

        it('validates assessment state', () => {
            const state = {
                _meta: { schemaVersion: validator.schemaVersion },
                'assessment_quiz-1': {
                    session: { responses: {} }
                }
            };
            const result = validator.validateAndMigrateState(state);
            expect(result['assessment_quiz-1']).toBeDefined();
        });

        it('handles newer schema version gracefully', () => {
            const state = {
                _meta: { schemaVersion: validator.schemaVersion + 99 }
            };
            // In dev mode this calls logger.fatal (handleStateMismatch)
            const result = validator.validateAndMigrateState(state);
            expect(logger.fatal).toHaveBeenCalled();
        });
    });

    // ─── _validateInteractionResponsesState ─────────────────────────

    describe('interaction response validation', () => {
        it('preserves valid interaction responses', () => {
            validator.setCourseValidationConfig({ structure: [{ id: 'slide-1' }] });
            const state = {
                _meta: { schemaVersion: validator.schemaVersion },
                interactionResponses: {
                    'q1': { response: 'a', isCorrect: true },
                    'q2': { response: 'b', isCorrect: false }
                }
            };
            const result = validator.validateAndMigrateState(state);
            expect(Object.keys(result.interactionResponses)).toHaveLength(2);
        });

        it('filters out non-object interaction responses', () => {
            validator.setCourseValidationConfig({ structure: [{ id: 'slide-1' }] });
            const state = {
                _meta: { schemaVersion: validator.schemaVersion },
                interactionResponses: {
                    'q1': { response: 'a' },
                    'q2': null,
                    'q3': 'invalid'
                }
            };
            const result = validator.validateAndMigrateState(state);
            expect(Object.keys(result.interactionResponses)).toHaveLength(1);
        });
    });
});
