/**
 * Assessment automation presses the same buttons a learner would and waits for
 * the assessment's async handlers, so MCP agents can run a graded quiz.
 *
 * Runs in the node environment with jsdom globals installed by hand (see
 * api-interactions.test.js for why).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'MutationObserver', 'requestAnimationFrame']) {
    globalThis[key] = key === 'window' ? dom.window : dom.window[key];
}

const mocks = vi.hoisted(() => ({ domains: {}, currentQuestion: null }));
vi.mock('../../../framework/js/state/index.js', () => ({
    default: { getDomainState: key => mocks.domains[key] }
}));
vi.mock('../../../framework/js/assessment/AssessmentFactory.js', () => ({
    getRenderedAssessment: () => ({ getCurrentQuestion: () => mocks.currentQuestion })
}));
vi.mock('../../../course/course-config.js', () => ({ courseConfig: { environment: {} } }));
vi.mock('../../../framework/js/managers/interaction-registry.js', () => ({ default: { getAll: () => [] } }));
vi.mock('../../../framework/js/components/interactions/interaction-base.js', () => ({
    getInteractionState: () => null,
    recordInteractionResult: vi.fn(),
    dispatchInteractionChecked: vi.fn()
}));
vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { createAssessmentMethods } from '../../../framework/js/automation/api-assessment.js';

const VIEWS = {
    intro: '<button data-action="start">Start</button>',
    question: '<button data-action="prev" disabled>Previous</button><button data-action="next">Next</button>',
    review: '<button data-action="review-question" data-question-index="0">Edit</button><button data-action="submit">Submit</button>',
    results: '<p>Passed</p>'
};
const NEXT_VIEW = { start: 'question', next: 'review', 'review-question': 'question', submit: 'results' };

/** Minimal stand-in for AssessmentActions: async handlers that disable their button and re-render. */
function mountAssessment({ view = 'intro', handlerDelay = 30 } = {}) {
    const container = document.createElement('div');
    container.className = 'assessment-navigator';
    container.dataset.assessmentId = 'quiz';
    const show = (name) => {
        container.innerHTML = VIEWS[name];
        container.dataset.view = name;
    };
    show(view);
    container.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        button.disabled = true;
        await new Promise(resolve => setTimeout(resolve, handlerDelay));
        if (button.dataset.action === 'submit') {
            mocks.domains.assessment_quiz = { summary: { attempts: 1, lastResults: { passed: true, scorePercentage: 100 } } };
        }
        show(NEXT_VIEW[button.dataset.action]);
    });
    document.body.appendChild(container);
    return container;
}

describe('automation assessment methods', () => {
    let api;

    beforeEach(() => {
        document.body.innerHTML = '';
        mocks.domains = {};
        mocks.currentQuestion = null;
        api = createAssessmentMethods(vi.fn());
    });

    it('returns null when the slide has no assessment', () => {
        expect(api.getAssessmentState()).toBeNull();
    });

    it('reports the view and the enabled actions', () => {
        mountAssessment({ view: 'question' });
        mocks.domains.assessment_quiz = { session: { currentQuestionIndex: 0 }, summary: { attempts: 0 } };
        expect(api.getAssessmentState()).toMatchObject({
            id: 'quiz',
            view: 'question',
            questionIndex: 0,
            question: null,
            actions: ['next'],
            modalOpen: false,
            attempts: 0,
            lastResults: null
        });
    });

    it('runs start → next → submit and waits for each handler to finish', async () => {
        mountAssessment();
        expect((await api.assessmentAction('start')).view).toBe('question');
        expect((await api.assessmentAction('next')).view).toBe('review');
        const done = await api.assessmentAction('submit');
        expect(done).toMatchObject({ view: 'results', attempts: 1, lastResults: { passed: true } });
    });

    it('targets a specific question on the review screen', async () => {
        mountAssessment({ view: 'review' });
        expect((await api.assessmentAction('review-question', { questionIndex: 0 })).view).toBe('question');
    });

    it('names the available actions when one is not', async () => {
        mountAssessment({ view: 'question' });
        await expect(api.assessmentAction('submit')).rejects.toThrow(/not available here\. Available: next/);
        await expect(api.assessmentAction('prev')).rejects.toThrow(/Available: next/);
    });

    it('scopes actions to an open modal', async () => {
        mountAssessment({ view: 'review' });
        const modal = document.createElement('div');
        modal.id = 'global-modal';
        modal.className = 'active';
        modal.innerHTML = '<button data-action="confirm-unanswered-submit">Submit Anyway</button><button data-action="dismiss-unanswered-modal">Go Back</button>';
        document.body.appendChild(modal);
        expect(api.getAssessmentState()).toMatchObject({
            modalOpen: true,
            actions: ['confirm-unanswered-submit', 'dismiss-unanswered-modal']
        });
        modal.classList.remove('active');
        expect(api.getAssessmentState().actions).toEqual(['review-question:0', 'submit']);
    });

    it('answers the question on screen and reports it as answered', () => {
        mountAssessment({ view: 'question' });
        let response = null;
        mocks.currentQuestion = {
            index: 0,
            id: 'q1',
            instance: {
                type: 'true-false',
                setResponse: value => { response = value; },
                getResponse: () => response
            }
        };
        expect(api.getAssessmentState().question).toEqual({ id: 'q1', type: 'true-false', hasResponse: false });
        expect(api.answerQuestion('q1', true).question.hasResponse).toBe(true);
        expect(response).toBe(true);
    });

    it('rejects answers for a question that is not showing', () => {
        mountAssessment({ view: 'intro' });
        expect(() => api.answerQuestion('q1', true)).toThrow(/No assessment question is showing/);
        document.body.innerHTML = '';
        mountAssessment({ view: 'question' });
        mocks.currentQuestion = { index: 0, id: 'q1', instance: { setResponse: vi.fn(), getResponse: () => null } };
        expect(() => api.answerQuestion('q2', true)).toThrow(/question on screen is "q1"/);
    });

    it('fails when there is no assessment to act on', async () => {
        await expect(api.assessmentAction('start')).rejects.toThrow(/No assessment on the current slide/);
    });
});
