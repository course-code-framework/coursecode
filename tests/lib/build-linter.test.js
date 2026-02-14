import { describe, it, expect } from 'vitest';
import {
    flattenStructure,
    validateGlobalConfig,
    validateEngagement,
    validateGatingConditions,
    validateAssessmentConfig,
    validateRequirementConfig,
    formatLintResults
} from '../../lib/validation-rules.js';
import { validateButtonVariants } from '../../lib/build-linter.js';

// ─── Build Linter Integration ───────────────────────────────────────
// These tests verify the validation-rules as used by the build linter.
// The actual lintCourse() function requires filesystem access, so we
// test the validation rules directly — the same functions it calls.

describe('validation rules (as used by build linter)', () => {
    describe('validateEngagement', () => {
        it('passes for valid engagement config', () => {
            const slide = {
                id: 'slide-1',
                engagement: {
                    required: true,
                    mode: 'all',
                    requirements: [{ type: 'scrollDepth', percentage: 80 }]
                }
            };
            const errors = [];
            const warnings = [];
            expect(validateEngagement(slide, errors, warnings)).toBe(true);
            expect(errors).toHaveLength(0);
        });

        it('detects invalid engagement mode', () => {
            const slide = {
                id: 'slide-1',
                engagement: {
                    required: true,
                    mode: 'invalid_mode',
                    requirements: [{ type: 'scrollDepth', percentage: 80 }]
                }
            };
            const errors = [];
            const warnings = [];
            validateEngagement(slide, errors, warnings);
            expect(errors.some(e => e.includes('invalid engagement.mode'))).toBe(true);
        });

        it('returns false for slide without engagement config', () => {
            const slide = { id: 'slide-1' };
            const errors = [];
            const warnings = [];
            // validateEngagement returns false when no engagement to process
            expect(validateEngagement(slide, errors, warnings)).toBe(false);
        });
    });

    describe('validateGatingConditions', () => {
        it('detects stateFlag without key', () => {
            const errors = [];
            validateGatingConditions('slide-1', {
                conditions: [{ type: 'stateFlag' }]
            }, new Set(), errors);
            expect(errors.some(e => e.includes('without key'))).toBe(true);
        });

        it('detects scoreThreshold without required fields', () => {
            const errors = [];
            validateGatingConditions('slide-1', {
                conditions: [{ type: 'scoreThreshold' }]
            }, new Set(), errors);
            // scoreThreshold requires both assessmentId and score
            expect(errors.length).toBeGreaterThan(0);
        });

        it('passes for valid gating conditions', () => {
            const errors = [];
            validateGatingConditions('slide-1', {
                conditions: [{ type: 'stateFlag', key: 'hasCompleted' }]
            }, new Set(), errors);
            expect(errors).toHaveLength(0);
        });
    });

    describe('validateAssessmentConfig', () => {
        it('detects assessment without questions', () => {
            const errors = [];
            const warnings = [];
            validateAssessmentConfig(
                { id: 'quiz-1', questions: [], _hasRuntimeQuestions: false },
                'quiz-1',
                new Set(),
                errors,
                warnings,
                new Map()
            );
            expect(errors.some(e => e.includes('question'))).toBe(true);
        });
    });

    describe('formatLintResults', () => {
        it('formats errors and warnings', () => {
            const result = formatLintResults({
                errors: ['Error 1'],
                warnings: ['Warning 1']
            });
            expect(result).toContain('Error 1');
            expect(result).toContain('Warning 1');
        });

        it('shows success for empty results', () => {
            const result = formatLintResults({ errors: [], warnings: [] });
            expect(result).toContain('pass');
        });
    });
});

describe('validateButtonVariants', () => {
    it('warns when btn has no color variant', () => {
        const warnings = [];
        validateButtonVariants('slide-1', '<button class="btn">Click</button>', warnings);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('without a color variant');
    });

    it('passes when btn has a color variant', () => {
        const warnings = [];
        validateButtonVariants('slide-1', '<button class="btn btn-primary">Click</button>', warnings);
        expect(warnings).toHaveLength(0);
    });

    it('warns when btn only has size modifier (no color variant)', () => {
        const warnings = [];
        validateButtonVariants('slide-1', '<button class="btn btn-sm">Click</button>', warnings);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('without a color variant');
    });

    it('passes with outline variant', () => {
        const warnings = [];
        validateButtonVariants('slide-1', '<button class="btn btn-outline-secondary">Click</button>', warnings);
        expect(warnings).toHaveLength(0);
    });

    it('passes with size + color variant together', () => {
        const warnings = [];
        validateButtonVariants('slide-1', '<button class="btn btn-lg btn-danger">Click</button>', warnings);
        expect(warnings).toHaveLength(0);
    });

    it('skips template expressions', () => {
        const warnings = [];
        validateButtonVariants('slide-1', '<button class="btn ${variant}">Click</button>', warnings);
        expect(warnings).toHaveLength(0);
    });

    it('does not warn when btn-primary is used without btn base', () => {
        const warnings = [];
        validateButtonVariants('slide-1', '<button class="btn-primary">Click</button>', warnings);
        expect(warnings).toHaveLength(0);
    });

    it('detects multiple bare btns in one source', () => {
        const warnings = [];
        const source = `
            <button class="btn">One</button>
            <button class="btn btn-sm">Two</button>
        `;
        validateButtonVariants('slide-1', source, warnings);
        expect(warnings).toHaveLength(2);
    });
});
