import { describe, it, expect } from 'vitest';
import {
    flattenStructure,
    registerInteractionId,
    validateGlobalConfig,
    validateAssessmentConfig,
    validateQuestionConfig,
    validateEngagement,
    validateRequirementConfig,
    validateGatingConditions,
    formatLintResults
} from '../../lib/validation-rules.js';

// ─── flattenStructure ───────────────────────────────────────────────

describe('flattenStructure', () => {
    it('returns empty array for empty structure', () => {
        expect(flattenStructure([])).toEqual([]);
    });

    it('flattens flat slides', () => {
        const structure = [
            { id: 'slide-1', component: 'slides/intro.js' },
            { id: 'slide-2', component: 'slides/topic.js' }
        ];
        expect(flattenStructure(structure)).toEqual(structure);
    });

    it('extracts slides from nested sections', () => {
        const structure = [
            {
                id: 'section-1',
                children: [
                    { id: 'slide-1', component: 'slides/a.js' },
                    { id: 'slide-2', component: 'slides/b.js' }
                ]
            }
        ];
        const result = flattenStructure(structure);
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('slide-1');
        expect(result[1].id).toBe('slide-2');
    });

    it('handles mixed flat slides and sections', () => {
        const structure = [
            { id: 'slide-1', component: 'slides/intro.js' },
            {
                id: 'section-1',
                children: [
                    { id: 'slide-2', component: 'slides/a.js' }
                ]
            },
            { id: 'slide-3', component: 'slides/outro.js' }
        ];
        const result = flattenStructure(structure);
        expect(result).toHaveLength(3);
        expect(result.map(s => s.id)).toEqual(['slide-1', 'slide-2', 'slide-3']);
    });

    it('skips items without component or children (section headers)', () => {
        const structure = [
            { id: 'header', title: 'Section' },
            { id: 'slide-1', component: 'slides/a.js' }
        ];
        expect(flattenStructure(structure)).toHaveLength(1);
    });
});

// ─── registerInteractionId ──────────────────────────────────────────

describe('registerInteractionId', () => {
    it('registers a new ID without error', () => {
        const registry = new Map();
        const errors = [];
        registerInteractionId('q1', 'slide-1', 'DOM', registry, errors);
        expect(registry.has('q1')).toBe(true);
        expect(errors).toHaveLength(0);
    });

    it('detects duplicate IDs across different sources', () => {
        const registry = new Map();
        const errors = [];
        registerInteractionId('q1', 'slide-1', 'DOM', registry, errors);
        registerInteractionId('q1', 'slide-2', 'Assessment', registry, errors);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Duplicate ID "q1"');
        expect(errors[0]).toContain('slide-1');
        expect(errors[0]).toContain('slide-2');
    });

    it('ignores empty or falsy IDs', () => {
        const registry = new Map();
        const errors = [];
        registerInteractionId('', 'slide-1', 'DOM', registry, errors);
        registerInteractionId(null, 'slide-1', 'DOM', registry, errors);
        registerInteractionId(undefined, 'slide-1', 'DOM', registry, errors);
        expect(registry.size).toBe(0);
        expect(errors).toHaveLength(0);
    });
});

// ─── validateGlobalConfig ───────────────────────────────────────────

describe('validateGlobalConfig', () => {
    it('returns empty warnings for valid config', () => {
        const config = { objectives: [] };
        const slides = [{ id: 'slide-1', component: 'slides/intro.js' }];
        const result = validateGlobalConfig(config, slides);
        expect(result.warnings).toHaveLength(0);
    });

    it('detects orphaned slide files', () => {
        const config = {};
        const slides = [{ id: 'slide-1', component: 'slides/intro.js' }];
        const diskFiles = new Set(['slides/intro.js', 'slides/orphan.js']);
        const result = validateGlobalConfig(config, slides, diskFiles);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('orphan.js');
    });

    it('collects objective IDs', () => {
        const config = {
            objectives: [
                { id: 'obj-pass', criteria: { type: 'assessmentPassed' } },
                { id: 'obj-visit', criteria: { type: 'slideVisited', slideId: 'slide-1' } }
            ]
        };
        const slides = [{ id: 'slide-1', component: 'slides/intro.js' }];
        const result = validateGlobalConfig(config, slides);
        expect(result.objectiveIds.has('obj-pass')).toBe(true);
        expect(result.objectiveIds.has('obj-visit')).toBe(true);
    });

    it('warns on objective with missing id', () => {
        const config = { objectives: [{ criteria: { type: 'assessmentPassed' } }] };
        const result = validateGlobalConfig(config, []);
        expect(result.warnings.some(w => w.includes("missing required 'id'"))).toBe(true);
    });

    it('warns on slideVisited criteria with invalid slideId', () => {
        const config = {
            objectives: [{ id: 'obj-1', criteria: { type: 'slideVisited', slideId: 'nonexistent' } }]
        };
        const slides = [{ id: 'slide-1', component: 'slides/a.js' }];
        const result = validateGlobalConfig(config, slides);
        expect(result.warnings.some(w => w.includes('invalid slideId'))).toBe(true);
    });
});

// ─── validateAssessmentConfig ───────────────────────────────────────

describe('validateAssessmentConfig', () => {
    function runValidation(config, objectiveIds = new Set()) {
        const errors = [];
        const warnings = [];
        const registry = new Map();
        validateAssessmentConfig(config, 'test-slide', objectiveIds, errors, warnings, registry);
        return { errors, warnings };
    }

    it('errors on missing assessment id', () => {
        const { errors } = runValidation({ questions: [{ id: 'q1', type: 'true-false', prompt: 'T?', weight: 1, correctAnswer: true }] });
        expect(errors.some(e => e.includes("missing required 'id'"))).toBe(true);
    });

    it('errors when no questions and no questionBanks', () => {
        const { errors } = runValidation({ id: 'quiz-1' });
        expect(errors.some(e => e.includes("must have either 'questions' or 'questionBanks'"))).toBe(true);
    });

    it('errors when both questions and questionBanks present', () => {
        const { errors } = runValidation({
            id: 'quiz-1',
            questions: [{ id: 'q1', type: 'true-false', prompt: 'T?', weight: 1, correctAnswer: true }],
            questionBanks: [{ id: 'bank-1', selectCount: 1, questions: [{ id: 'q2', type: 'true-false', prompt: 'X?', weight: 1, correctAnswer: false }] }]
        });
        expect(errors.some(e => e.includes("cannot have both"))).toBe(true);
    });

    it('validates passingScore range', () => {
        const { errors } = runValidation({
            id: 'quiz-1',
            questions: [{ id: 'q1', type: 'true-false', prompt: 'T?', weight: 1, correctAnswer: true }],
            settings: { passingScore: 150 }
        });
        expect(errors.some(e => e.includes('passingScore must be 0-100'))).toBe(true);
    });

    it('validates passingScore type', () => {
        const { errors } = runValidation({
            id: 'quiz-1',
            questions: [{ id: 'q1', type: 'true-false', prompt: 'T?', weight: 1, correctAnswer: true }],
            settings: { passingScore: 'high' }
        });
        expect(errors.some(e => e.includes('passingScore must be a number'))).toBe(true);
    });

    it('errors on invalid assessmentObjective', () => {
        const { errors } = runValidation({
            id: 'quiz-1',
            questions: [{ id: 'q1', type: 'true-false', prompt: 'T?', weight: 1, correctAnswer: true }],
            assessmentObjective: 'nonexistent-obj'
        }, new Set(['real-obj']));
        expect(errors.some(e => e.includes('invalid assessmentObjective'))).toBe(true);
    });

    it('validates attempts ordering: restart must be > remedial', () => {
        const { errors } = runValidation({
            id: 'quiz-1',
            questions: [{ id: 'q1', type: 'true-false', prompt: 'T?', weight: 1, correctAnswer: true }],
            settings: { attemptsBeforeRestart: 2, attemptsBeforeRemedial: 3 }
        });
        expect(errors.some(e => e.includes('attemptsBeforeRestart'))).toBe(true);
    });

    it('errors on remedial attempts without remedialSlideIds', () => {
        const { errors } = runValidation({
            id: 'quiz-1',
            questions: [{ id: 'q1', type: 'true-false', prompt: 'T?', weight: 1, correctAnswer: true }],
            settings: { attemptsBeforeRemedial: 2 }
        });
        expect(errors.some(e => e.includes('no remedialSlideIds'))).toBe(true);
    });

    it('warns on remedialSlideIds without attemptsBeforeRemedial', () => {
        const { warnings } = runValidation({
            id: 'quiz-1',
            questions: [{ id: 'q1', type: 'true-false', prompt: 'T?', weight: 1, correctAnswer: true }],
            settings: { remedialSlideIds: ['slide-review'] }
        });
        expect(warnings.some(w => w.includes("won't be used"))).toBe(true);
    });

    it('skips question validation when _hasRuntimeQuestions is true', () => {
        const { errors } = runValidation({
            id: 'quiz-1',
            _hasRuntimeQuestions: true
        });
        // Should not error about missing questions
        expect(errors.some(e => e.includes("must have either 'questions'"))).toBe(false);
    });

    it('validates question bank structure', () => {
        const { errors } = runValidation({
            id: 'quiz-1',
            questionBanks: [{
                id: 'bank-1',
                // missing selectCount
                questions: [{ id: 'q1', type: 'true-false', prompt: 'T?', weight: 1, correctAnswer: true }]
            }]
        });
        expect(errors.some(e => e.includes("missing required 'selectCount'"))).toBe(true);
    });

    it('errors when selectCount exceeds available questions', () => {
        const { errors } = runValidation({
            id: 'quiz-1',
            questionBanks: [{
                id: 'bank-1',
                selectCount: 10,
                questions: [{ id: 'q1', type: 'true-false', prompt: 'T?', weight: 1, correctAnswer: true }]
            }]
        });
        expect(errors.some(e => e.includes('exceeds available questions'))).toBe(true);
    });
});

// ─── validateQuestionConfig ─────────────────────────────────────────

describe('validateQuestionConfig', () => {
    function runValidation(question) {
        const errors = [];
        const registry = new Map();
        validateQuestionConfig(question, 'Q1', errors, registry);
        return errors;
    }

    it('errors on missing required fields', () => {
        const errors = runValidation({});
        expect(errors.some(e => e.includes("missing required 'type'"))).toBe(true);
        expect(errors.some(e => e.includes("missing required 'prompt'"))).toBe(true);
        expect(errors.some(e => e.includes("missing required 'weight'"))).toBe(true);
        expect(errors.some(e => e.includes("missing required 'id'"))).toBe(true);
    });

    it('errors on zero or negative weight', () => {
        const errors = runValidation({ id: 'q1', type: 'true-false', prompt: 'T?', weight: 0, correctAnswer: true });
        expect(errors.some(e => e.includes('weight must be positive'))).toBe(true);
    });

    it('errors on true-false without boolean correctAnswer', () => {
        const errors = runValidation({ id: 'q1', type: 'true-false', prompt: 'T?', weight: 1, correctAnswer: 'yes' });
        expect(errors.some(e => e.includes('correctAnswer must be boolean'))).toBe(true);
    });

    it('errors on multiple-choice without choices array', () => {
        const errors = runValidation({ id: 'q1', type: 'multiple-choice', prompt: 'Pick', weight: 1, correctAnswer: 'a' });
        expect(errors.some(e => e.includes('must have at least one choice'))).toBe(true);
    });

    it('errors on numeric without correctAnswer', () => {
        const errors = runValidation({ id: 'q1', type: 'numeric', prompt: 'How many?', weight: 1 });
        expect(errors.some(e => e.includes("missing required 'correctAnswer'"))).toBe(true);
    });

    it('accepts valid multiple-choice question', () => {
        const errors = runValidation({
            id: 'q1',
            type: 'multiple-choice',
            prompt: 'Pick one',
            weight: 1,
            correctAnswer: 'a',
            choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }]
        });
        expect(errors).toHaveLength(0);
    });
});

// ─── validateEngagement ─────────────────────────────────────────────

describe('validateEngagement', () => {
    it('errors when engagement is missing entirely', () => {
        const errors = [];
        const warnings = [];
        const result = validateEngagement({ id: 'slide-1', component: 'slides/a.js' }, errors, warnings);
        expect(result).toBe(false);
        expect(errors.some(e => e.includes("missing required 'engagement'"))).toBe(true);
    });

    it('errors when required=true but no requirements array', () => {
        const errors = [];
        const warnings = [];
        validateEngagement({ id: 'slide-1', engagement: { required: true } }, errors, warnings);
        expect(errors.some(e => e.includes('no requirements array'))).toBe(true);
    });

    it('warns when required=true but requirements array is empty', () => {
        const errors = [];
        const warnings = [];
        validateEngagement({ id: 'slide-1', engagement: { required: true, requirements: [] } }, errors, warnings);
        expect(warnings.some(w => w.includes('empty requirements array'))).toBe(true);
    });

    it('errors on invalid engagement mode', () => {
        const errors = [];
        const warnings = [];
        validateEngagement({
            id: 'slide-1',
            engagement: { required: true, mode: 'some', requirements: [{ type: 'scrollDepth', percentage: 80 }] }
        }, errors, warnings);
        expect(errors.some(e => e.includes('invalid engagement.mode'))).toBe(true);
    });

    it('accepts valid engagement config', () => {
        const errors = [];
        const warnings = [];
        const result = validateEngagement({
            id: 'slide-1',
            engagement: { required: true, mode: 'all', requirements: [{ type: 'scrollDepth', percentage: 80 }] }
        }, errors, warnings);
        expect(result).toBe(true);
        expect(errors).toHaveLength(0);
    });

    it('accepts required: false with no requirements', () => {
        const errors = [];
        const warnings = [];
        const result = validateEngagement({
            id: 'slide-1',
            engagement: { required: false }
        }, errors, warnings);
        expect(result).toBe(true);
        expect(errors).toHaveLength(0);
    });
});

// ─── validateRequirementConfig ──────────────────────────────────────

describe('validateRequirementConfig', () => {
    function runValidation(requirement, engagementTrackingMap = {}) {
        const errors = [];
        const warnings = [];
        validateRequirementConfig('slide-1', requirement, errors, warnings, engagementTrackingMap);
        return { errors, warnings };
    }

    it('skips validation for component-linked types in engagementTrackingMap', () => {
        const { errors, warnings } = runValidation(
            { type: 'viewAllTabs' },
            { viewAllTabs: 'tabs' }
        );
        expect(errors).toHaveLength(0);
        expect(warnings).toHaveLength(0);
    });

    it('errors on interactionComplete without interactionId', () => {
        const { errors } = runValidation({ type: 'interactionComplete' });
        expect(errors.some(e => e.includes('without interactionId'))).toBe(true);
    });

    it('errors on scrollDepth without percentage', () => {
        const { errors } = runValidation({ type: 'scrollDepth' });
        expect(errors.some(e => e.includes('without percentage'))).toBe(true);
    });

    it('errors on scrollDepth with out-of-range percentage', () => {
        const { errors } = runValidation({ type: 'scrollDepth', percentage: 150 });
        expect(errors.some(e => e.includes('must be 0-100'))).toBe(true);
    });

    it('errors on timeOnSlide without seconds', () => {
        const { errors } = runValidation({ type: 'timeOnSlide' });
        expect(errors.some(e => e.includes('without valid seconds'))).toBe(true);
    });

    it('errors on videoComplete without videoId', () => {
        const { errors } = runValidation({ type: 'videoComplete' });
        expect(errors.some(e => e.includes('without videoId'))).toBe(true);
    });

    it('errors on audioComplete without audioId', () => {
        const { errors } = runValidation({ type: 'audioComplete' });
        expect(errors.some(e => e.includes('without audioId'))).toBe(true);
    });

    it('errors on modalAudioComplete without modalId', () => {
        const { errors } = runValidation({ type: 'modalAudioComplete' });
        expect(errors.some(e => e.includes('without modalId'))).toBe(true);
    });

    it('errors on flag without key', () => {
        const { errors } = runValidation({ type: 'flag' });
        expect(errors.some(e => e.includes('without key'))).toBe(true);
    });

    it('errors on allFlags without flags array', () => {
        const { errors } = runValidation({ type: 'allFlags' });
        expect(errors.some(e => e.includes('without flags array'))).toBe(true);
    });

    it('errors on allFlags with empty flags array', () => {
        const { errors } = runValidation({ type: 'allFlags', flags: [] });
        expect(errors.some(e => e.includes('empty flags array'))).toBe(true);
    });

    it('warns on unknown requirement type', () => {
        const { warnings } = runValidation({ type: 'doABackflip' });
        expect(warnings.some(w => w.includes('unknown requirement type'))).toBe(true);
    });

    it('accepts valid scrollDepth requirement', () => {
        const { errors } = runValidation({ type: 'scrollDepth', percentage: 80 });
        expect(errors).toHaveLength(0);
    });

    it('accepts allInteractionsComplete with no extra props', () => {
        const { errors, warnings } = runValidation({ type: 'allInteractionsComplete' });
        expect(errors).toHaveLength(0);
        expect(warnings).toHaveLength(0);
    });
});

// ─── validateGatingConditions ───────────────────────────────────────

describe('validateGatingConditions', () => {
    function runValidation(gating, objectiveIds = new Set()) {
        const errors = [];
        validateGatingConditions('slide-1', gating, objectiveIds, errors);
        return errors;
    }

    it('errors when no conditions array', () => {
        const errors = runValidation({});
        expect(errors.some(e => e.includes('no conditions array'))).toBe(true);
    });

    it('errors on invalid gating mode', () => {
        const errors = runValidation({
            mode: 'half',
            conditions: [{ type: 'stateFlag', key: 'done' }]
        });
        expect(errors.some(e => e.includes('invalid gating.mode'))).toBe(true);
    });

    it('errors on condition without type', () => {
        const errors = runValidation({ conditions: [{}] });
        expect(errors.some(e => e.includes('without a type'))).toBe(true);
    });

    it('errors on invalid condition type', () => {
        const errors = runValidation({ conditions: [{ type: 'slideVisited' }] });
        expect(errors.some(e => e.includes('invalid gating condition type'))).toBe(true);
        expect(errors[0]).toContain('slideVisited');
    });

    it('errors on objectiveStatus without objectiveId', () => {
        const errors = runValidation({ conditions: [{ type: 'objectiveStatus' }] }, new Set());
        expect(errors.some(e => e.includes('without objectiveId'))).toBe(true);
    });

    it('errors on objectiveStatus with unknown objectiveId', () => {
        const errors = runValidation(
            { conditions: [{ type: 'objectiveStatus', objectiveId: 'fake-obj' }] },
            new Set(['real-obj'])
        );
        expect(errors.some(e => e.includes('unknown objectiveId'))).toBe(true);
    });

    it('errors on assessmentStatus without assessmentId', () => {
        const errors = runValidation({ conditions: [{ type: 'assessmentStatus' }] });
        expect(errors.some(e => e.includes('without assessmentId'))).toBe(true);
    });

    it('errors on stateFlag without key', () => {
        const errors = runValidation({ conditions: [{ type: 'stateFlag' }] });
        expect(errors.some(e => e.includes('without key'))).toBe(true);
    });

    it('errors on timeOnSlide without minSeconds', () => {
        const errors = runValidation({ conditions: [{ type: 'timeOnSlide' }] });
        expect(errors.some(e => e.includes('without minSeconds'))).toBe(true);
    });

    it('errors on custom without callback or evaluate', () => {
        const errors = runValidation({ conditions: [{ type: 'custom' }] });
        expect(errors.some(e => e.includes('without callback'))).toBe(true);
    });

    it('accepts valid gating with all condition types', () => {
        const errors = runValidation({
            mode: 'all',
            conditions: [
                { type: 'objectiveStatus', objectiveId: 'obj-1' },
                { type: 'assessmentStatus', assessmentId: 'quiz-1' },
                { type: 'stateFlag', key: 'ready' },
                { type: 'timeOnSlide', minSeconds: 30 },
                { type: 'custom', evaluate: () => true }
            ]
        }, new Set(['obj-1']));
        expect(errors).toHaveLength(0);
    });
});

// ─── formatLintResults ──────────────────────────────────────────────

describe('formatLintResults', () => {
    it('shows success message when no errors or warnings', () => {
        const output = formatLintResults({ errors: [], warnings: [] });
        expect(output).toContain('✅');
    });

    it('formats errors with numbered list', () => {
        const output = formatLintResults({ errors: ['Bad thing', 'Worse thing'], warnings: [] });
        expect(output).toContain('1. Bad thing');
        expect(output).toContain('2. Worse thing');
        expect(output).toContain('VALIDATION FAILED');
    });

    it('formats warnings with numbered list', () => {
        const output = formatLintResults({ errors: [], warnings: ['Minor issue'] });
        expect(output).toContain('1. Minor issue');
        expect(output).toContain('WARNINGS');
    });

    it('shows both errors and warnings', () => {
        const output = formatLintResults({ errors: ['Error 1'], warnings: ['Warning 1'] });
        expect(output).toContain('VALIDATION FAILED');
        expect(output).toContain('WARNINGS');
    });
});
