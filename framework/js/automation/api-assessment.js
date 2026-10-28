/**
 * @file api-assessment.js
 * Assessment state and actions for the CourseCodeAutomation API.
 *
 * Actions press the same [data-action] buttons a learner clicks, so the
 * assessment's own validation (unanswered-question checks, review screen,
 * retake limits) runs exactly as it does in the course.
 */

import stateManager from '../state/index.js';
import { getRenderedAssessment } from '../assessment/AssessmentFactory.js';
import { applyResponse, isEmptyResponse } from './api-interactions.js';

/** How long an action may take before automation reports it as stuck. */
const ACTION_TIMEOUT_MS = 5000;
/** DOM quiet period that marks the end of an action's async rendering. */
const QUIET_MS = 150;

function getAssessmentContainer() {
    return document.querySelector('.assessment-navigator[data-assessment-id]');
}

function getOpenModal() {
    const modal = document.getElementById('global-modal');
    if (!modal?.classList.contains('active')) return null;
    return modal.querySelector('[data-action]') ? modal : null;
}

/** Enabled, visible action buttons; an open modal blocks the assessment behind it. */
function getActionButtons() {
    const modal = getOpenModal();
    const scope = modal || getAssessmentContainer();
    if (!scope) return [];
    return Array.from(scope.querySelectorAll('button[data-action]'))
        .filter(button => !button.disabled && !button.closest('[hidden], [aria-hidden="true"]'));
}

function getCurrentQuestion(assessmentId) {
    return getRenderedAssessment(assessmentId)?.getCurrentQuestion() ?? null;
}

function readResponse(instance) {
    try {
        return typeof instance.getResponse === 'function' ? instance.getResponse() : undefined;
    } catch {
        return undefined;
    }
}

function describeAction(button) {
    const index = button.dataset.questionIndex;
    return index !== undefined ? `${button.dataset.action}:${index}` : button.dataset.action;
}

/**
 * Resolves once the clicked button's async handler finishes and the assessment
 * stops re-rendering. Assessment buttons disable themselves while their handler
 * runs; modal buttons don't, and hand off to an async submit, so a short DOM
 * quiet period covers both.
 */
function waitForActionToSettle(button) {
    const watched = [getAssessmentContainer(), document.getElementById('global-modal')].filter(Boolean);
    return new Promise((resolve, reject) => {
        const started = Date.now();
        let lastMutation = Date.now();
        const observer = new MutationObserver(() => { lastMutation = Date.now(); });
        watched.forEach(node => observer.observe(node, { childList: true, subtree: true, attributes: true }));

        const poll = () => {
            const handlerDone = !button.isConnected || !button.disabled;
            if (handlerDone && Date.now() - lastMutation >= QUIET_MS) {
                observer.disconnect();
                resolve();
                return;
            }
            if (Date.now() - started > ACTION_TIMEOUT_MS) {
                observer.disconnect();
                reject(new Error(`CourseCodeAutomation: Assessment action "${button.dataset.action}" did not finish within ${ACTION_TIMEOUT_MS}ms`));
                return;
            }
            setTimeout(poll, 25);
        };
        // Let the click handler disable the button first
        setTimeout(poll, 0);
    });
}

/**
 * Creates assessment API methods bound to the shared logTrace function.
 * @param {Function} logTrace - Shared trace logger
 * @returns {Object} Assessment API methods
 */
export function createAssessmentMethods(logTrace) {
    const methods = {
        /**
         * State of the assessment on the current slide, or null if there is none.
         * @returns {{id: string, view: string|null, questionIndex: number|null, question: Object|null, actions: string[], modalOpen: boolean, attempts: number, lastResults: Object|null}|null}
         */
        getAssessmentState() {
            const container = getAssessmentContainer();
            if (!container) return null;

            const id = container.dataset.assessmentId;
            const domain = stateManager.getDomainState(`assessment_${id}`) || {};
            const view = container.dataset.view || null;
            const current = view === 'question' ? getCurrentQuestion(id) : null;
            const state = {
                id,
                view,
                questionIndex: view === 'question' ? (current?.index ?? domain.session?.currentQuestionIndex ?? null) : null,
                question: current
                    ? { id: current.id, type: current.instance.type, hasResponse: !isEmptyResponse(readResponse(current.instance)) }
                    : null,
                actions: getActionButtons().map(describeAction),
                modalOpen: Boolean(getOpenModal()),
                attempts: domain.summary?.attempts ?? 0,
                lastResults: domain.summary?.lastResults ?? null
            };
            logTrace('getAssessmentState', { id, view });
            return state;
        },

        /**
         * Answer the assessment question on screen. The answer is saved when the
         * learner moves on (next, review, submit) and graded on submit, so this
         * returns no score.
         * @param {string} interactionId - The question's id (state.question.id)
         * @param {*} response - Same formats as setResponse
         * @returns {Object} Assessment state after answering
         */
        answerQuestion(interactionId, response) {
            const container = getAssessmentContainer();
            const current = container ? getCurrentQuestion(container.dataset.assessmentId) : null;
            if (!current) {
                throw new Error('CourseCodeAutomation: No assessment question is showing. Use assessment action "start" (or "next") first.');
            }
            if (current.id !== interactionId) {
                throw new Error(`CourseCodeAutomation: The question on screen is "${current.id}", not "${interactionId}".`);
            }
            applyResponse({ id: current.id, type: current.instance.type, instance: current.instance }, response, logTrace);
            return methods.getAssessmentState();
        },

        /**
         * Press an assessment button (start, next, prev, jump-to-review,
         * review-question, back-to-questions, submit, confirm-unanswered-submit,
         * dismiss-unanswered-modal, retake, go-to-remedial, restart-course).
         * @param {string} action - data-action name
         * @param {Object} [options]
         * @param {number} [options.questionIndex] - Required for review-question
         * @returns {Promise<Object>} Assessment state after the action
         */
        async assessmentAction(action, options = {}) {
            if (!getAssessmentContainer()) {
                throw new Error('CourseCodeAutomation: No assessment on the current slide. Navigate to an assessment slide first.');
            }

            const buttons = getActionButtons();
            const button = buttons.find(candidate =>
                candidate.dataset.action === action &&
                (options.questionIndex === undefined || candidate.dataset.questionIndex === String(options.questionIndex))
            );
            if (!button) {
                const available = buttons.map(describeAction);
                throw new Error(
                    `CourseCodeAutomation: Assessment action "${action}"${options.questionIndex !== undefined ? ` for question ${options.questionIndex}` : ''} is not available here. ` +
                    `Available: ${available.length ? available.join(', ') : 'none'}`
                );
            }

            logTrace('assessmentAction', { action, questionIndex: options.questionIndex });
            button.click();
            await waitForActionToSettle(button);
            return methods.getAssessmentState();
        }
    };
    return methods;
}
