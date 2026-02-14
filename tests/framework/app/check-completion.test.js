/**
 * @file check-completion.test.js
 * @description Unit tests for AppActions.checkCompletion()
 *
 * checkCompletion() is the critical function that marks a course as completed.
 * It evaluates: isOnLastSlide + all assessments with requireSubmission/requirePass.
 *
 * GAP: This was never unit-tested before. The E2E tests only checked that
 * the completion property EXISTS, never its value.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to create mock references that persist across vi.mock calls
const mocks = vi.hoisted(() => ({
    stateManager: {
        getCompletion: vi.fn(() => 'incomplete'),
        getSuccess: vi.fn(() => 'unknown'),
        reportCompletion: vi.fn(),
        reportSuccess: vi.fn(),
        flush: vi.fn(() => Promise.resolve()),
    },
    navigationActions: {
        isOnLastSlide: vi.fn(() => false),
        getCurrentSlide: vi.fn(),
    },
    courseHelpers: {
        getSlidesByType: vi.fn(async () => []),
        getAssessmentConfigs: vi.fn(async () => new Map()),
    },
    assessmentManager: {
        meetsCompletionRequirements: vi.fn(() => false),
    },
    eventBus: {
        on: vi.fn(),
        emit: vi.fn(),
    },
}));

// The test is at: tests/framework/app/check-completion.test.js
// AppActions.js is at: framework/js/app/AppActions.js
//   - from test, relative path = ../../../framework/js/app/AppActions.js ✓
// AppActions imports:
//   '../state/index.js'        → framework/js/state/index.js
//   '../utilities/course-helpers.js' → framework/js/utilities/course-helpers.js
//   '../navigation/NavigationActions.js' → framework/js/navigation/NavigationActions.js
//   '../managers/assessment-manager.js'  → framework/js/managers/assessment-manager.js
//   '../core/event-bus.js'     → framework/js/core/event-bus.js
//   '../../../course/course-config.js' → course/course-config.js (from framework/js/app/)
//   '../app/AppUI.js'          → framework/js/app/AppUI.js
//   '../app/AppState.js'       → framework/js/app/AppState.js
//   '../navigation/NavigationState.js'  
//   '../navigation/navigation-helpers.js'
//   '../managers/comment-manager.js'
//   '../components/ui-components/index.js'
//   '../utilities/logger.js'

// vi.mock paths are resolved relative to the TEST FILE
// From tests/framework/app/, ../../../ = repo root
// So paths like ../../../framework/js/... are correct ✓
// The course-config.js import in AppActions is '../../../course/course-config.js'
// relative to framework/js/app/ → resolves to course/course-config.js
// From the test file: ../../../course/course-config.js → also resolves to course/course-config.js ✓

vi.mock('../../../framework/js/state/index.js', () => ({
    default: mocks.stateManager
}));

vi.mock('../../../framework/js/navigation/NavigationActions.js', () => mocks.navigationActions);

vi.mock('../../../framework/js/utilities/course-helpers.js', () => mocks.courseHelpers);

vi.mock('../../../framework/js/managers/assessment-manager.js', () => mocks.assessmentManager);

vi.mock('../../../framework/js/core/event-bus.js', () => ({
    eventBus: mocks.eventBus,
}));

vi.mock('../../../framework/js/app/AppUI.js', () => ({
    showNotification: vi.fn(),
    getCompletionModalData: vi.fn(),
}));

vi.mock('../../../framework/js/app/AppState.js', () => ({}));

vi.mock('../../../framework/js/navigation/NavigationState.js', () => ({}));

vi.mock('../../../framework/js/navigation/navigation-helpers.js', () => ({
    shouldBypassGating: vi.fn(() => false),
}));

vi.mock('../../../framework/js/managers/comment-manager.js', () => ({
    default: { addComment: vi.fn() }
}));

vi.mock('../../../framework/js/components/ui-components/index.js', () => ({
    announceToScreenReader: vi.fn()
}));

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() }
}));

// course-config.js: AppActions imports from '../../../course/course-config.js'
// relative to framework/js/app/AppActions.js → resolves to <root>/course/course-config.js
// From test at tests/framework/app/ → ../../../course/course-config.js also resolves to <root>/course/course-config.js
vi.mock('../../../course/course-config.js', () => ({
    courseConfig: { structure: [] }
}));


describe('checkCompletion()', () => {
    let checkCompletion;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Reset defaults
        mocks.stateManager.getCompletion.mockReturnValue('incomplete');
        mocks.stateManager.getSuccess.mockReturnValue('unknown');
        mocks.navigationActions.isOnLastSlide.mockReturnValue(false);
        mocks.courseHelpers.getSlidesByType.mockResolvedValue([]);
        mocks.courseHelpers.getAssessmentConfigs.mockResolvedValue(new Map());

        // Dynamic import to pick up fresh mocks
        const module = await import('../../../framework/js/app/AppActions.js');
        checkCompletion = module.checkCompletion;
    });

    // ── Not on last slide ─────────────────────────────────────────────────────

    it('should return false when NOT on last slide', async () => {
        mocks.navigationActions.isOnLastSlide.mockReturnValue(false);

        const result = await checkCompletion();
        expect(result).toBe(false);
        expect(mocks.stateManager.reportCompletion).not.toHaveBeenCalled();
    });

    it('should emit statusChanged with current status when not on last slide', async () => {
        mocks.navigationActions.isOnLastSlide.mockReturnValue(false);
        mocks.stateManager.getCompletion.mockReturnValue('incomplete');

        await checkCompletion();

        expect(mocks.eventBus.emit).toHaveBeenCalledWith('course:statusChanged', {
            completionStatus: 'incomplete',
            successStatus: 'unknown',
            isOnLastSlide: false
        });
    });

    // ── Already completed ─────────────────────────────────────────────────────

    it('should return true (cached) when already completed', async () => {
        mocks.navigationActions.isOnLastSlide.mockReturnValue(true);
        mocks.stateManager.getCompletion.mockReturnValue('completed');
        mocks.stateManager.getSuccess.mockReturnValue('passed');

        const result = await checkCompletion();
        expect(result).toBe(true);
        expect(mocks.stateManager.reportCompletion).not.toHaveBeenCalled();
    });

    it('should emit statusChanged with existing status when already completed', async () => {
        mocks.navigationActions.isOnLastSlide.mockReturnValue(true);
        mocks.stateManager.getCompletion.mockReturnValue('completed');
        mocks.stateManager.getSuccess.mockReturnValue('passed');

        await checkCompletion();

        expect(mocks.eventBus.emit).toHaveBeenCalledWith('course:statusChanged', {
            completionStatus: 'completed',
            successStatus: 'passed',
            isOnLastSlide: true
        });
    });

    // ── On last slide, no assessments ─────────────────────────────────────────

    it('should complete course when on last slide with no assessments', async () => {
        mocks.navigationActions.isOnLastSlide.mockReturnValue(true);

        const result = await checkCompletion();

        expect(result).toBe(true);
        expect(mocks.stateManager.reportCompletion).toHaveBeenCalledWith('completed');
        expect(mocks.stateManager.reportSuccess).toHaveBeenCalledWith('passed');
        expect(mocks.stateManager.flush).toHaveBeenCalled();
    });

    // ── On last slide, assessment submitted + passed ─────────────────────────

    it('should set success=passed when assessment is submitted AND passed', async () => {
        mocks.navigationActions.isOnLastSlide.mockReturnValue(true);
        mocks.courseHelpers.getSlidesByType.mockResolvedValue([
            { assessmentId: 'exam-1' }
        ]);
        mocks.courseHelpers.getAssessmentConfigs.mockResolvedValue(new Map([
            ['exam-1', { completionRequirements: { requireSubmission: true, requirePass: true } }]
        ]));
        mocks.assessmentManager.meetsCompletionRequirements.mockReturnValue(true);

        const result = await checkCompletion();

        expect(result).toBe(true);
        expect(mocks.stateManager.reportCompletion).toHaveBeenCalledWith('completed');
        expect(mocks.stateManager.reportSuccess).toHaveBeenCalledWith('passed');
    });

    // ── Assessment requirePass but failed ────────────────────────────────────

    it('should set success=failed when assessment has requirePass but learner failed', async () => {
        mocks.navigationActions.isOnLastSlide.mockReturnValue(true);
        mocks.courseHelpers.getSlidesByType.mockResolvedValue([
            { assessmentId: 'exam-1' }
        ]);
        mocks.courseHelpers.getAssessmentConfigs.mockResolvedValue(new Map([
            ['exam-1', { completionRequirements: { requireSubmission: true, requirePass: true } }]
        ]));

        mocks.assessmentManager.meetsCompletionRequirements.mockImplementation((_id, criteria) => {
            if (criteria.requireSubmission) return true;
            if (criteria.requirePass) return false;
            return false;
        });

        const result = await checkCompletion();

        expect(result).toBe(true); // Course is "completed" (submitted), but success is "failed"
        expect(mocks.stateManager.reportCompletion).toHaveBeenCalledWith('completed');
        expect(mocks.stateManager.reportSuccess).toHaveBeenCalledWith('failed');
    });

    // ── Assessment not submitted ─────────────────────────────────────────────

    it('should set completion=incomplete when assessment requires submission but is NOT submitted', async () => {
        mocks.navigationActions.isOnLastSlide.mockReturnValue(true);
        mocks.courseHelpers.getSlidesByType.mockResolvedValue([
            { assessmentId: 'exam-1' }
        ]);
        mocks.courseHelpers.getAssessmentConfigs.mockResolvedValue(new Map([
            ['exam-1', { completionRequirements: { requireSubmission: true } }]
        ]));
        mocks.assessmentManager.meetsCompletionRequirements.mockReturnValue(false);

        const result = await checkCompletion();

        expect(result).toBe(false);
        expect(mocks.stateManager.reportCompletion).toHaveBeenCalledWith('incomplete');
    });

    // ── No assessments require passing → automatic success ───────────────────

    it('should set success=passed when completed and no assessments require passing', async () => {
        mocks.navigationActions.isOnLastSlide.mockReturnValue(true);
        mocks.courseHelpers.getSlidesByType.mockResolvedValue([
            { assessmentId: 'quiz-1' }
        ]);
        mocks.courseHelpers.getAssessmentConfigs.mockResolvedValue(new Map([
            ['quiz-1', { completionRequirements: { requireSubmission: true, requirePass: false } }]
        ]));
        mocks.assessmentManager.meetsCompletionRequirements.mockReturnValue(true);

        const result = await checkCompletion();

        expect(result).toBe(true);
        expect(mocks.stateManager.reportCompletion).toHaveBeenCalledWith('completed');
        expect(mocks.stateManager.reportSuccess).toHaveBeenCalledWith('passed');
    });

    // ── flush() is called after reportCompletion ─────────────────────────────

    it('should call flush() after reporting completion', async () => {
        mocks.navigationActions.isOnLastSlide.mockReturnValue(true);

        const callOrder = [];
        mocks.stateManager.reportCompletion.mockImplementation(() => callOrder.push('reportCompletion'));
        mocks.stateManager.reportSuccess.mockImplementation(() => callOrder.push('reportSuccess'));
        mocks.stateManager.flush.mockImplementation(() => { callOrder.push('flush'); return Promise.resolve(); });

        await checkCompletion();

        expect(callOrder).toEqual(['reportCompletion', 'reportSuccess', 'flush']);
    });

    // ── Multiple assessments ─────────────────────────────────────────────────

    it('should require ALL assessments with requireSubmission to be submitted', async () => {
        mocks.navigationActions.isOnLastSlide.mockReturnValue(true);
        mocks.courseHelpers.getSlidesByType.mockResolvedValue([
            { assessmentId: 'exam-1' },
            { assessmentId: 'exam-2' }
        ]);
        mocks.courseHelpers.getAssessmentConfigs.mockResolvedValue(new Map([
            ['exam-1', { completionRequirements: { requireSubmission: true } }],
            ['exam-2', { completionRequirements: { requireSubmission: true } }]
        ]));

        mocks.assessmentManager.meetsCompletionRequirements.mockImplementation((id) => {
            return id === 'exam-1';
        });

        const result = await checkCompletion();

        expect(result).toBe(false);
        expect(mocks.stateManager.reportCompletion).toHaveBeenCalledWith('incomplete');
    });
});
