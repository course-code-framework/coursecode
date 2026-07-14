import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';
import {
    flattenStructure,
    validateGlobalConfig,
    validateEngagement,
    validateGatingConditions,
    validateAssessmentConfig,
    validateRequirementConfig,
    formatLintResults
} from '../../lib/validation-rules.js';
import {
    validateButtonVariants,
    validateDirectAssetReferences,
    validateInteractionAssetReferences,
    validateInteractionSchema,
    validateMenuIcons
} from '../../lib/build-linter.js';
import { parseSlideSource } from '../../lib/course-parser.js';

const temporaryDirectories = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

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

describe('interaction and asset validation', () => {
    it('rejects a hotspot image with the wrong schema type', () => {
        const source = `createHotspotQuestion({
            id: 'hotspot-1',
            prompt: 'Select a region',
            image: 'assets/images/diagram.svg',
            hotspots: [{ id: 'a', pos: [1, 2, 3, 4], correct: true, label: 'A' }]
        })`;
        const [interaction] = parseSlideSource(source, 'slide-1').interactions;
        const errors = [];

        validateInteractionSchema('slide-1', interaction, errors);

        expect(errors).toContain('Slide "slide-1" interaction "hotspot-1" property "image" must be object, got string.');
    });

    it('validates nested required properties and minimum array items', () => {
        const source = `createHotspotQuestion({
            id: 'hotspot-1', prompt: 'Select a region', image: { alt: 'Diagram' }, hotspots: []
        })`;
        const [interaction] = parseSlideSource(source, 'slide-1').interactions;
        const errors = [];

        validateInteractionSchema('slide-1', interaction, errors);

        expect(errors.some(error => error.includes('image" is missing required property "src"'))).toBe(true);
        expect(errors.some(error => error.includes('hotspots" must contain at least 1 item'))).toBe(true);
    });

    it('validates map values and multi-type schema definitions', () => {
        const source = `createFillInQuestion({
            id: 'fill-1', prompt: 'Complete it', blanks: {
                valid: { correct: ['one', 'two'] },
                invalid: { typoTolerance: 1 }
            }
        })`;
        const [interaction] = parseSlideSource(source, 'slide-1').interactions;
        const errors = [];

        validateInteractionSchema('slide-1', interaction, errors);

        expect(errors).toEqual([
            'Slide "slide-1" interaction "fill-1" property "blanks".invalid is missing required property "correct".'
        ]);
    });

    it('validates enum values when they are statically known', () => {
        const source = `createMatchingQuestion({
            id: 'match-1', prompt: 'Match', feedbackMode: 'later',
            pairs: [{ id: 'a', text: 'A', match: 'B' }, { id: 'b', text: 'B', match: 'A' }]
        })`;
        const [interaction] = parseSlideSource(source, 'slide-1').interactions;
        const errors = [];

        validateInteractionSchema('slide-1', interaction, errors);

        expect(errors).toContain(
            'Slide "slide-1" interaction "match-1" property "feedbackMode" must be one of: immediate, deferred.'
        );
    });

    it('rejects broken direct HTML aliases and accepts existing canonical assets', () => {
        const coursePath = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-lint-assets-'));
        temporaryDirectories.push(coursePath);
        const imagePath = path.join(coursePath, 'assets', 'images', 'diagram.svg');
        fs.mkdirSync(path.dirname(imagePath), { recursive: true });
        fs.writeFileSync(imagePath, '<svg></svg>');
        const errors = [];

        validateDirectAssetReferences('slide-1', [
            { attributes: { src: 'assets/images/diagram.svg' } },
            { attributes: { src: 'course/assets/images/diagram.svg' } }
        ], coursePath, errors);

        expect(errors).toEqual([
            'Slide "slide-1": Direct HTML asset path "assets/images/diagram.svg" will not exist in LMS packages. Use "course/assets/images/diagram.svg".'
        ]);
    });

    it('accepts component-relative assets and reports missing files', () => {
        const coursePath = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-lint-assets-'));
        temporaryDirectories.push(coursePath);
        const imagePath = path.join(coursePath, 'assets', 'images', 'diagram.svg');
        fs.mkdirSync(path.dirname(imagePath), { recursive: true });
        fs.writeFileSync(imagePath, '<svg></svg>');
        const errors = [];

        validateInteractionAssetReferences('slide-1', {
            image: { src: 'assets/images/diagram.svg' },
            thumbnail: { src: 'images/missing.svg' }
        }, coursePath, errors);

        expect(errors).toEqual([
            'Slide "slide-1": local course asset not found: course/assets/images/missing.svg'
        ]);
    });

    it('treats a lightbox href as a component-owned course-relative path', () => {
        const coursePath = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-lint-lightbox-'));
        temporaryDirectories.push(coursePath);
        const documentPath = path.join(coursePath, 'assets', 'docs', 'reference.md');
        fs.mkdirSync(path.dirname(documentPath), { recursive: true });
        fs.writeFileSync(documentPath, '# Reference');
        const errors = [];

        validateDirectAssetReferences('slide-1', [{
            attributes: {
                href: 'assets/docs/reference.md',
                'data-component': 'lightbox'
            }
        }], coursePath, errors);

        expect(errors).toEqual([]);
    });

    it('ignores framework module aliases used by audio components', () => {
        const errors = [];

        validateDirectAssetReferences('slide-1', [
            { attributes: { 'data-audio-src': '@slides/example.js#narration' } }
        ], '/course', errors);

        expect(errors).toEqual([]);
    });
});

describe('menu icon validation', () => {
    it('warns for unknown icons while accepting built-in and custom icons', () => {
        const coursePath = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-lint-icons-'));
        temporaryDirectories.push(coursePath);
        fs.writeFileSync(path.join(coursePath, 'icons.js'), `export const customIcons = {\n  'plant-one-line': '<path d="M1 1"/>'\n};\n`);
        const warnings = [];

        validateMenuIcons({
            structure: [
                { type: 'section', id: 'known', menu: { icon: 'book-open' }, children: [] },
                { type: 'section', id: 'custom', menu: { icon: 'plant-one-line' }, children: [] },
                { type: 'section', id: 'unknown', menu: { icon: 'briefcase' }, children: [] }
            ]
        }, coursePath, warnings);

        expect(warnings).toEqual([
            'Unknown menu icon "briefcase" on section "unknown". Add it to course/icons.js or use a registered icon.'
        ]);
    });
});
