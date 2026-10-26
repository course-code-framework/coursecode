// @vitest-environment jsdom
/**
 * Regression tests for assessment attempt/results state:
 * - Retake must not loop back to stale results (randomized + question banks)
 * - Reload mid-retake restores the in-progress attempt, not old results
 * - Resumed results honour settings.attemptsBeforeRestart / allowRetake
 * - Floating-point score boundaries (29/50 vs passingScore 58)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const domains = {};
    return {
        domains,
        stateManager: {
            getDomainState: vi.fn(key => (domains[key] ? JSON.parse(JSON.stringify(domains[key])) : undefined)),
            setDomainState: vi.fn((key, value) => { domains[key] = JSON.parse(JSON.stringify(value)); }),
            getLaunchData: vi.fn(() => null),
            flush: vi.fn(() => Promise.resolve())
        },
        visitedSlides: [],
        goToSlide: vi.fn(),
        shuffleCalls: { count: 0 }
    };
});

vi.mock('../../../framework/js/state/index.js', () => ({ default: mocks.stateManager }));
vi.mock('../../../framework/js/app/AppUI.js', () => ({
    hideFooter: vi.fn(),
    showFooter: vi.fn(),
    showNotification: vi.fn()
}));
vi.mock('../../../framework/js/navigation/NavigationState.js', () => ({
    getVisitedSlides: () => mocks.visitedSlides,
    getCurrentSlideId: () => 'exam-slide'
}));
vi.mock('../../../framework/js/navigation/NavigationActions.js', () => ({
    goToSlide: (...args) => mocks.goToSlide(...args)
}));
vi.mock('../../../framework/js/utilities/course-helpers.js', () => ({ getSlideById: vi.fn() }));
vi.mock('../../../framework/js/managers/objective-manager.js', () => ({
    default: { setCompletionStatus: vi.fn(), setSuccessStatus: vi.fn() }
}));
vi.mock('../../../framework/js/managers/interaction-manager.js', () => ({ default: { record: vi.fn() } }));
vi.mock('../../../framework/js/managers/accessibility-manager.js', () => ({ default: { announce: vi.fn() } }));
vi.mock('../../../framework/js/components/ui-components/modal.js', () => ({ show: vi.fn(), hide: vi.fn() }));
vi.mock('../../../framework/js/utilities/icons.js', () => ({ iconManager: { getIcon: () => '' } }));
vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));
vi.mock('../../../framework/js/utilities/view-manager.js', () => ({
    // Minimal view manager: renders the requested view into the container
    createViewManager(container) {
        const views = {};
        let current = null;
        return {
            registerView: (name, view) => { views[name] = view; },
            async showView(name, options) {
                const el = await views[name].render(options);
                container.innerHTML = '';
                container.appendChild(el);
                current = name;
            },
            getCurrentView: () => current,
            getContainer: () => container
        };
    }
}));
vi.mock('../../../framework/js/utilities/utilities.js', async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        // Deterministic "shuffle": rotate by the number of shuffles so far
        shuffleArray: (array) => {
            mocks.shuffleCalls.count++;
            const shift = mocks.shuffleCalls.count % array.length;
            return [...array.slice(shift), ...array.slice(0, shift)];
        }
    };
});

import { catalogInteraction } from '../../../framework/js/core/interaction-catalog.js';
import { createAssessmentInstance } from '../../../framework/js/assessment/AssessmentFactory.js';
import {
    roundPercentage,
    resolvePassingScore,
    formatScoreForDisplay,
    buildResultsActionButton
} from '../../../framework/js/assessment/assessment-results.js';

// A minimal controlled question type: response is a string, correct when it equals q.answer
catalogInteraction('fake-question', {
    creator: (q) => {
        let response = null;
        return {
            render(container) { container.innerHTML = `<div class="question-prompt"><h3>${q.prompt}</h3></div>`; },
            getResponse: () => response,
            setResponse: (value) => { response = value; },
            evaluate: (value) => ({ correct: value === q.answer, score: value === q.answer ? 1 : 0 }),
            reset: () => { response = null; }
        };
    },
    metadata: {
        scormType: 'other',
        isAnswered: (value) => value !== null && value !== undefined
    }
});

const DOMAIN = 'assessment_exam';

function makeQuestions(count, prefix = 'q') {
    return Array.from({ length: count }, (_, i) => ({
        id: `${prefix}${i + 1}`,
        type: 'fake-question',
        prompt: `Question ${i + 1}`,
        answer: 'right',
        weight: 1
    }));
}

function baseConfig(overrides = {}) {
    return {
        id: 'exam',
        title: 'Exam',
        questionBanks: [{ id: 'bank', questions: makeQuestions(6), selectCount: 3 }],
        settings: {
            passingScore: 80,
            allowReview: true,
            showProgress: false,
            allowRetake: true,
            ...overrides.settings
        },
        review: { requireAllAnswered: false },
        resultsDisplay: { showQuestions: false },
        ...overrides.config
    };
}

async function flush() {
    await new Promise(resolve => setTimeout(resolve, 0));
}

async function click(container, action) {
    const button = container.querySelector(`[data-action="${action}"]`);
    expect(button, `button [data-action="${action}"]`).toBeTruthy();
    button.click();
    await flush();
}

function renderAssessment(config, context = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    createAssessmentInstance(config).render(container, context);
    return container;
}

describe('assessment retake state model', () => {
    beforeEach(() => {
        for (const key of Object.keys(mocks.domains)) delete mocks.domains[key];
        mocks.visitedSlides.length = 0;
        mocks.shuffleCalls.count = 0;
        mocks.goToSlide.mockReset();
        document.body.innerHTML = '';
    });

    function seedFailedAttempt(config, selected = ['q1', 'q2', 'q3']) {
        mocks.domains[DOMAIN] = {
            summary: {
                attempts: 1,
                submitted: true,
                lastResults: { attemptNumber: 1, totalQuestions: 3, correctCount: 1, scorePercentage: 33.33, passed: false }
            },
            session: {
                currentView: 'results',
                submitted: true,
                attemptNumber: 1,
                responses: { 0: 'right' },
                selectedQuestions: selected
            }
        };
        return config;
    }

    it('Retake on a question-bank assessment reaches the intro with a new selection, not stale results', async () => {
        const config = seedFailedAttempt(baseConfig());
        let rerendered = null;
        // Simulate the slide re-rendering (new assessment instance) on goToSlide
        mocks.goToSlide.mockImplementation(async () => {
            document.body.innerHTML = '';
            rerendered = renderAssessment(config);
            await flush();
        });

        const container = renderAssessment(config);
        await flush();
        expect(container.textContent).toContain('Assessment Results');

        const shufflesBefore = mocks.shuffleCalls.count;
        await click(container, 'retake');

        expect(mocks.goToSlide).toHaveBeenCalledTimes(1);
        expect(rerendered.querySelector('[data-action="start"]')).toBeTruthy();
        expect(rerendered.textContent).not.toContain('Assessment Results');

        const domain = mocks.domains[DOMAIN];
        // Summary/history preserved for attempt limits and gating
        expect(domain.summary.attempts).toBe(1);
        expect(domain.summary.lastResults.passed).toBe(false);
        // New attempt session with a fresh randomized selection
        expect(domain.session.attemptNumber).toBe(2);
        expect(domain.session.submitted).toBe(false);
        expect(mocks.shuffleCalls.count).toBeGreaterThan(shufflesBefore);
        expect(domain.session.selectedQuestions).toHaveLength(3);
        expect(domain.session.selectedQuestions).not.toEqual(['q1', 'q2', 'q3']);
    });

    it('reload mid-retake restores the in-progress attempt instead of the previous results', async () => {
        const config = seedFailedAttempt(baseConfig({ settings: { randomizeOnRetake: false } }));

        const container = renderAssessment(config);
        await flush();
        await click(container, 'retake');
        expect(mocks.goToSlide).not.toHaveBeenCalled();
        expect(container.querySelector('[data-action="start"]')).toBeTruthy();

        await click(container, 'start');
        expect(mocks.domains[DOMAIN].session.currentView).toBe('question');
        // Same questions kept (randomizeOnRetake: false) and persisted for resume
        expect(mocks.domains[DOMAIN].session.selectedQuestions).toEqual(['q1', 'q2', 'q3']);

        // Reload: a brand new instance must resume the question view
        document.body.innerHTML = '';
        const reloaded = renderAssessment(config);
        await flush();
        expect(reloaded.textContent).not.toContain('Assessment Results');
        expect(reloaded.querySelector('[data-action="next"]')).toBeTruthy();
        expect(reloaded.querySelector('[data-action="retake"]')).toBeNull();
    });

    it('returning from remedial content persists a new attempt so a reload does not show old results', async () => {
        const config = seedFailedAttempt(baseConfig({ settings: { remedialSlideIds: ['remedial'] } }));

        const container = renderAssessment(config, { fromSlide: 'remedial' });
        await flush();
        expect(container.querySelector('[data-action="start"]')).toBeTruthy();
        expect(mocks.domains[DOMAIN].session.attemptNumber).toBe(2);

        document.body.innerHTML = '';
        const reloaded = renderAssessment(config);
        await flush();
        expect(reloaded.querySelector('[data-action="start"]')).toBeTruthy();
    });

    it('a stale session without a newer attempt number still shows the stored results', async () => {
        const config = baseConfig();
        mocks.domains[DOMAIN] = {
            summary: { attempts: 1, submitted: true, lastResults: { attemptNumber: 1, totalQuestions: 3, correctCount: 0, scorePercentage: 0, passed: false } },
            session: { currentView: 'intro', submitted: false, attemptNumber: 1, selectedQuestions: ['q1', 'q2', 'q3'] }
        };
        const container = renderAssessment(config);
        await flush();
        expect(container.textContent).toContain('Assessment Results');
    });
});

describe('resumed results honour config.settings', () => {
    beforeEach(() => {
        for (const key of Object.keys(mocks.domains)) delete mocks.domains[key];
        mocks.visitedSlides.length = 0;
        document.body.innerHTML = '';
    });

    function seed(attempts) {
        mocks.domains[DOMAIN] = {
            summary: {
                attempts,
                submitted: true,
                lastResults: { attemptNumber: attempts, totalQuestions: 3, correctCount: 1, scorePercentage: 33.33, passed: false }
            },
            session: { submitted: true, attemptNumber: attempts, selectedQuestions: ['q1', 'q2', 'q3'] }
        };
    }

    it('requires a course restart once attemptsBeforeRestart is reached', async () => {
        seed(2);
        const container = renderAssessment(baseConfig({ settings: { attemptsBeforeRestart: 2 } }));
        await flush();
        expect(container.querySelector('[data-action="restart-course"]')).toBeTruthy();
        expect(container.querySelector('[data-action="retake"]')).toBeNull();
    });

    it('sends the learner to remedial content once attemptsBeforeRemedial is reached', async () => {
        seed(1);
        const container = renderAssessment(baseConfig({ settings: { attemptsBeforeRemedial: 1, remedialSlideIds: ['remedial'] } }));
        await flush();
        expect(container.querySelector('[data-action="go-to-remedial"]')).toBeTruthy();
    });

    it('offers no retake when allowRetake is false', async () => {
        seed(1);
        const container = renderAssessment(baseConfig({ settings: { allowRetake: false } }));
        await flush();
        expect(container.querySelector('[data-action="retake"]')).toBeNull();
        expect(container.querySelector('[data-action="restart-course"]')).toBeNull();
    });
});

describe('score rounding at the passing boundary', () => {
    beforeEach(() => {
        for (const key of Object.keys(mocks.domains)) delete mocks.domains[key];
        mocks.stateManager.getLaunchData.mockReturnValue(null);
        document.body.innerHTML = '';
    });

    it('rounds floating-point noise away before comparing', () => {
        expect((29 / 50) * 100).not.toBe(58);
        expect(roundPercentage((29 / 50) * 100)).toBe(58);
        expect(resolvePassingScore({ passingScore: 70 }, { masteryScore: 0.58 })).toBe(58);
        expect(resolvePassingScore({ passingScore: 70 }, null)).toBe(70);
    });

    it('29/50 passes a 58% passing score when submitted', async () => {
        const questions = makeQuestions(50);
        const responses = {};
        questions.forEach((_q, i) => { responses[i] = i < 29 ? 'right' : 'wrong'; });
        mocks.domains[DOMAIN] = {
            summary: { attempts: 0 },
            session: { currentView: 'review', submitted: false, attemptNumber: 1, responses }
        };

        const container = renderAssessment({
            ...baseConfig({ settings: { passingScore: 58 } }),
            questionBanks: undefined,
            questions
        });
        await flush();
        await click(container, 'submit');

        const { lastResults } = mocks.domains[DOMAIN].summary;
        expect(lastResults.scorePercentage).toBe(58);
        expect(lastResults.passed).toBe(true);
        expect(container.textContent).toContain('Passed');
    });

    it('cmi5 masteryScore 0.58 is not inflated by floating-point conversion', async () => {
        mocks.stateManager.getLaunchData.mockReturnValue({ masteryScore: 0.58 });
        const questions = makeQuestions(50);
        const responses = {};
        questions.forEach((_q, i) => { responses[i] = i < 29 ? 'right' : 'wrong'; });
        mocks.domains[DOMAIN] = {
            summary: { attempts: 0 },
            session: { currentView: 'review', submitted: false, attemptNumber: 1, responses }
        };

        const container = renderAssessment({ ...baseConfig(), questionBanks: undefined, questions });
        await flush();
        await click(container, 'submit');
        expect(mocks.domains[DOMAIN].summary.lastResults.passed).toBe(true);
    });

    it('results display never contradicts the pass/fail outcome', () => {
        expect(formatScoreForDisplay(79.6, 80)).toBe('79.6');
        expect(formatScoreForDisplay(79.99, 80)).toBe('79.99');
        expect(formatScoreForDisplay(80, 80)).toBe('80');
        expect(formatScoreForDisplay(66.67, 80)).toBe('67');
        expect(formatScoreForDisplay(72.6, 72.5)).toBe('73');
    });

    it('shared retake rules: restart only applies to failed attempts', () => {
        expect(buildResultsActionButton({ attemptsBeforeRestart: 1 }, { passed: true, currentAttempts: 3 })).toBeNull();
        expect(buildResultsActionButton({ attemptsBeforeRestart: 1 }, { passed: false, currentAttempts: 1 }).action).toBe('restart-course');
        // allowRetake defaults to true
        expect(buildResultsActionButton({}, { passed: false, currentAttempts: 1 }).action).toBe('retake');
    });
});

describe('restored question index guard', () => {
    beforeEach(() => {
        for (const key of Object.keys(mocks.domains)) delete mocks.domains[key];
        document.body.innerHTML = '';
    });

    it('clamps an out-of-range stored question index instead of throwing', async () => {
        mocks.domains[DOMAIN] = {
            summary: { attempts: 0 },
            session: { currentView: 'question', currentQuestionIndex: 7, submitted: false, attemptNumber: 1, responses: {} }
        };
        const container = renderAssessment({ ...baseConfig(), questionBanks: undefined, questions: makeQuestions(3) });
        await flush();
        expect(container.textContent).toContain('Question 3');
        expect(mocks.domains[DOMAIN].session.currentQuestionIndex).toBe(2);
    });
});
