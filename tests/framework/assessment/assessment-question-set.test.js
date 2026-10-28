// @vitest-environment jsdom
/**
 * Regression tests: resuming a NON-randomized assessment after a course update
 * changed its questions. Responses are keyed by question index and the order
 * is not persisted, so the session carries a compact question-set signature
 * (session.qsig). Saved answers must never be scored against a different
 * question.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LZString from 'lz-string';

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
    computeQuestionSetSignature,
    computeQuestionSetPrefixSignatures
} from '../../../framework/js/assessment/question-set-signature.js';

// A minimal controlled question type: response is a string, correct when it equals q.answer
catalogInteraction('fake-question-qs', {
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

function question(id) {
    return { id, type: 'fake-question-qs', prompt: `Prompt ${id}`, answer: 'right', weight: 1 };
}

function questions(...ids) {
    return ids.map(question);
}

function fixedConfig(qs, settings = {}) {
    return {
        id: 'exam',
        title: 'Exam',
        questions: qs,
        settings: { passingScore: 80, allowReview: true, showProgress: false, allowRetake: true, ...settings },
        review: { requireAllAnswered: false },
        resultsDisplay: { showQuestions: true }
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

function renderAssessment(config) {
    document.body.innerHTML = '';
    const container = document.createElement('div');
    document.body.appendChild(container);
    createAssessmentInstance(config).render(container);
    return container;
}

const ORIGINAL = questions('q1', 'q2', 'q3');

/** In-progress attempt 2 (attempt 1 failed) answered against ORIGINAL. */
function seedInProgress({ qsig = computeQuestionSetSignature(ORIGINAL), view = 'question', index = 1, responses = { 0: 'right', 1: 'wrong' } } = {}) {
    const session = {
        currentView: view,
        currentQuestionIndex: index,
        startTime: 1000,
        submitted: false,
        attemptNumber: 2,
        responses,
        selectedQuestions: null,
        reviewReached: view === 'review'
    };
    if (qsig !== null) session.qsig = qsig; // null = legacy session saved before signatures
    mocks.domains[DOMAIN] = {
        summary: {
            attempts: 1,
            submitted: true,
            lastResults: {
                attemptNumber: 1, totalQuestions: 3, correctCount: 1, scorePercentage: 33.33, passingScore: 80, passed: false,
                questionResults: [{ id: 'q1', correct: true }, { id: 'q2', correct: false }, { id: 'q3', correct: false }]
            }
        },
        session
    };
}

function expectSafeRestart(container, newQuestions) {
    const { session, summary } = mocks.domains[DOMAIN];
    expect(container.querySelector('[data-action="start"]')).toBeTruthy();
    expect(session.currentView).toBe('intro');
    expect(session.responses).toEqual({});
    expect(session.currentQuestionIndex).toBe(0);
    expect(session.reviewReached).toBe(false);
    expect(session.qsig).toBe(computeQuestionSetSignature(newQuestions));
    // Same attempt, history and attempt counts untouched
    expect(session.attemptNumber).toBe(2);
    expect(summary.attempts).toBe(1);
    expect(summary.lastResults.attemptNumber).toBe(1);
    expect(summary.lastResults.passed).toBe(false);
}

describe('fixed-order assessment resume after the question set changes', () => {
    beforeEach(() => {
        for (const key of Object.keys(mocks.domains)) delete mocks.domains[key];
        mocks.visitedSlides.length = 0;
        mocks.goToSlide.mockReset();
        document.body.innerHTML = '';
    });

    it('starting an attempt stamps the question-set signature (and no question order)', async () => {
        const container = renderAssessment(fixedConfig(ORIGINAL));
        await flush();
        await click(container, 'start');
        const { session } = mocks.domains[DOMAIN];
        expect(session.qsig).toBe(computeQuestionSetSignature(ORIGINAL));
        expect(session.selectedQuestions).toBeNull();
    });

    it('unchanged question set resumes the attempt with its answers', async () => {
        seedInProgress();
        const container = renderAssessment(fixedConfig(questions('q1', 'q2', 'q3')));
        await flush();
        expect(container.textContent).toContain('Prompt q2');
        expect(mocks.domains[DOMAIN].session.responses).toEqual({ 0: 'right', 1: 'wrong' });
        expect(mocks.domains[DOMAIN].session.currentQuestionIndex).toBe(1);
    });

    it('reordered questions restart the attempt instead of scoring answers against other questions', async () => {
        seedInProgress();
        const reordered = questions('q2', 'q1', 'q3');
        const container = renderAssessment(fixedConfig(reordered));
        await flush();
        expectSafeRestart(container, reordered);
    });

    it('a removed question restarts the attempt safely', async () => {
        seedInProgress({ view: 'review', responses: { 0: 'right', 1: 'wrong', 2: 'right' } });
        const removed = questions('q1', 'q3');
        const container = renderAssessment(fixedConfig(removed));
        await flush();
        expectSafeRestart(container, removed);
    });

    it('a question inserted before answered questions restarts the attempt safely', async () => {
        seedInProgress();
        const inserted = questions('q1', 'q-new', 'q2', 'q3');
        const container = renderAssessment(fixedConfig(inserted));
        await flush();
        expectSafeRestart(container, inserted);
    });

    it('a changed question type restarts the attempt (response format may differ)', async () => {
        seedInProgress();
        const retyped = questions('q1', 'q2', 'q3');
        retyped[1] = { ...retyped[1], type: 'other-type' };
        catalogInteraction('other-type', {
            creator: () => ({ render() {}, getResponse: () => null, setResponse() {}, evaluate: () => ({ correct: false }) }),
            metadata: { scormType: 'other', isAnswered: v => v != null }
        });
        const container = renderAssessment(fixedConfig(retyped));
        await flush();
        expectSafeRestart(container, retyped);
    });

    it('questions appended at the end keep the saved answers, and scoring uses the right questions', async () => {
        seedInProgress({ view: 'review', responses: { 0: 'right', 1: 'wrong', 2: 'right' } });
        const appended = questions('q1', 'q2', 'q3', 'q4');
        const container = renderAssessment(fixedConfig(appended, { allowUnansweredSubmission: false }));
        await flush();

        const { session } = mocks.domains[DOMAIN];
        expect(session.currentView).toBe('review');
        expect(session.responses).toEqual({ 0: 'right', 1: 'wrong', 2: 'right' });
        expect(session.qsig).toBe(computeQuestionSetSignature(appended));
        expect(container.querySelectorAll('[data-action="review-question"]')).toHaveLength(4);

        // Answer the new question and submit: scores q1 & q3 right, q2 wrong, q4 right
        session.responses[3] = 'right';
        await click(container, 'submit');
        const { lastResults } = mocks.domains[DOMAIN].summary;
        expect(lastResults.attemptNumber).toBe(2);
        expect(lastResults.questionResults).toEqual([
            { id: 'q1', correct: true },
            { id: 'q2', correct: false },
            { id: 'q3', correct: true },
            { id: 'q4', correct: true }
        ]);
    });

    it('legacy saved state without a signature still resumes (and is stamped)', async () => {
        seedInProgress({ qsig: null });
        expect(mocks.domains[DOMAIN].session).not.toHaveProperty('qsig');
        const container = renderAssessment(fixedConfig(questions('q1', 'q2', 'q3')));
        await flush();
        const { session } = mocks.domains[DOMAIN];
        expect(container.textContent).toContain('Prompt q2');
        expect(session.responses).toEqual({ 0: 'right', 1: 'wrong' });
        expect(session.qsig).toBe(computeQuestionSetSignature(ORIGINAL));
    });

    it('a not-yet-started retake is simply re-stamped, without a recovery restart', async () => {
        seedInProgress({ view: 'intro', index: 0, responses: {} });
        const changed = questions('q3', 'q1');
        const container = renderAssessment(fixedConfig(changed));
        await flush();
        expect(container.querySelector('[data-action="start"]')).toBeTruthy();
        expect(mocks.domains[DOMAIN].session.qsig).toBe(computeQuestionSetSignature(changed));
    });

    it('resumed results after a question change show only summary stats, not stale per-question review', async () => {
        seedInProgress();
        mocks.domains[DOMAIN].session = { submitted: true, attemptNumber: 1, responses: { 0: 'right' }, qsig: computeQuestionSetSignature(ORIGINAL) };
        const container = renderAssessment(fixedConfig(questions('q3', 'q2', 'q1')));
        await flush();
        expect(container.textContent).toContain('Assessment Results');
        expect(container.textContent).not.toContain('Prompt q');
    });

    it('randomized assessments keep using the persisted question order (no signature)', async () => {
        const container = renderAssessment(fixedConfig(ORIGINAL, { randomizeQuestions: true }));
        await flush();
        await click(container, 'start');
        const { session } = mocks.domains[DOMAIN];
        expect(session.selectedQuestions).toHaveLength(3);
        expect(session.qsig).toBeUndefined();
    });
});

describe('question-set signature', () => {
    it('is short, deterministic and order/id/type sensitive', () => {
        const sig = computeQuestionSetSignature(ORIGINAL);
        expect(sig).toMatch(/^[0-9a-z]{1,7}$/);
        expect(computeQuestionSetSignature(questions('q1', 'q2', 'q3'))).toBe(sig);
        expect(computeQuestionSetSignature(questions('q2', 'q1', 'q3'))).not.toBe(sig);
        expect(computeQuestionSetSignature(questions('q1', 'q2'))).not.toBe(sig);
        // Entry boundaries matter: ['ab','c'] differs from ['a','bc']
        expect(computeQuestionSetSignature(questions('ab', 'c'))).not.toBe(computeQuestionSetSignature(questions('a', 'bc')));
        expect(computeQuestionSetSignature([])).toMatch(/^[0-9a-z]{1,7}$/);
    });

    it('prefix signatures match the signature of each leading slice', () => {
        const qs = questions('a', 'b', 'c', 'd');
        const prefixes = computeQuestionSetPrefixSignatures(qs);
        expect(prefixes).toHaveLength(4);
        prefixes.forEach((prefix, i) => {
            expect(prefix).toBe(computeQuestionSetSignature(qs.slice(0, i + 1)));
        });
    });

    it('adds only a few bytes to SCORM 1.2 (lz-string) suspend_data', () => {
        const encode = state => LZString.compressToEncodedURIComponent(JSON.stringify({ v: 2, s: state })).length;
        const session = {
            currentView: 'question', currentQuestionIndex: 1, startTime: 1761480000000, submitted: false,
            attemptNumber: 1, responses: { 0: 'b', 1: ['a', 'c'] }, selectedQuestions: null, reviewReached: false
        };
        const without = encode({ assessment_exam: { summary: { attempts: 0 }, session } });
        const withSig = encode({ assessment_exam: { summary: { attempts: 0 }, session: { ...session, qsig: computeQuestionSetSignature(ORIGINAL) } } });
        // ~20 encoded characters per assessment, independent of question count
        expect(withSig - without).toBeLessThanOrEqual(24);
    });
});
