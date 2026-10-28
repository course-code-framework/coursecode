/**
 * Automation responses must fail loudly: a mistyped answer used to select
 * nothing and come back from coursecode_interact with no score and no error.
 *
 * Runs in the node environment with jsdom globals installed by hand: in the
 * jsdom test environment Vite can't resolve the course-config import (there is
 * no course/ in the framework repo) even though it is mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MutationObserver', 'requestAnimationFrame']) {
    globalThis[key] = key === 'window' ? dom.window : dom.window[key];
}
globalThis.CSS = { escape: value => String(value).replace(/["\\]/g, '\\$&') };

const mocks = vi.hoisted(() => ({
    entries: [],
    recordInteractionResult: vi.fn()
}));

vi.mock('../../../framework/js/managers/interaction-registry.js', () => ({
    default: { getAll: () => mocks.entries, register: vi.fn() }
}));
vi.mock('../../../course/course-config.js', () => ({ courseConfig: { environment: {} } }));
vi.mock('../../../framework/js/components/interactions/interaction-base.js', async (importOriginal) => ({
    ...(await importOriginal()),
    getInteractionState: () => null,
    recordInteractionResult: mocks.recordInteractionResult,
    dispatchInteractionChecked: vi.fn()
}));
vi.mock('../../../framework/js/managers/interaction-manager.js', () => ({ default: { record: vi.fn() } }));
vi.mock('../../../framework/js/state/index.js', () => ({
    default: { isInitialized: false, getDomainState: vi.fn(), setDomainState: vi.fn() }
}));
vi.mock('../../../framework/js/engagement/engagement-manager.js', () => ({ default: { trackInteraction: vi.fn() } }));
vi.mock('../../../framework/js/navigation/NavigationState.js', () => ({ getCurrentSlideId: () => null }));
vi.mock('../../../framework/js/managers/accessibility-manager.js', () => ({ default: { announce: vi.fn() } }));
vi.mock('../../../framework/js/utilities/icons.js', () => ({ iconManager: { getIcon: () => '' } }));
vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { createInteractionMethods, isEmptyResponse } from '../../../framework/js/automation/api-interactions.js';
import { createMultipleChoiceQuestion } from '../../../framework/js/components/interactions/multiple-choice.js';
import { createSequencingQuestion } from '../../../framework/js/components/interactions/sequencing.js';
import { createNumericQuestion } from '../../../framework/js/components/interactions/numeric.js';
import { createFillInQuestion } from '../../../framework/js/components/interactions/fill-in.js';

function mount(question, config) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    question.render(container);
    mocks.entries.push({ id: config.id, type: question.type, config, instance: question });
    return question;
}

function mountMultipleChoice() {
    const config = {
        id: 'mc',
        prompt: 'Pick one',
        correctAnswer: 'b',
        choices: [
            { value: 'a', text: 'A' },
            { value: 'b', text: 'B', correct: true }
        ]
    };
    return mount(createMultipleChoiceQuestion(config), config);
}

describe('automation interaction responses', () => {
    let api;

    beforeEach(() => {
        document.body.innerHTML = '';
        mocks.entries.length = 0;
        mocks.recordInteractionResult.mockClear();
        api = createInteractionMethods(vi.fn());
    });

    it('treats empty arrays and objects as no response', () => {
        expect(isEmptyResponse([])).toBe(true);
        expect(isEmptyResponse({})).toBe(true);
        expect(isEmptyResponse('')).toBe(true);
        expect(isEmptyResponse({ cap_city: '', cap_country: '' })).toBe(true);
        expect(isEmptyResponse(0)).toBe(false);
        expect(isEmptyResponse(['a'])).toBe(false);
    });

    it('does not report an untouched multiple-choice question as answered', () => {
        mountMultipleChoice();
        expect(api.listInteractions()[0].hasResponse).toBe(false);
    });

    it('rejects an unknown multiple-choice value and lists the choices', () => {
        mountMultipleChoice();
        expect(() => api.setResponse('mc', 'z')).toThrow(/Unknown choice "z"\. Choices: a, b/);
    });

    it('rejects a response that only partly matches the choices', () => {
        mountMultipleChoice();
        expect(() => api.setResponse('mc', ['b', 'z'])).toThrow(/Unknown choice "z"/);
    });

    it('accepts and scores a valid choice', () => {
        mountMultipleChoice();
        api.setResponse('mc', 'b');
        expect(api.checkAnswer('mc')).toMatchObject({ correct: true });
        expect(mocks.recordInteractionResult).toHaveBeenCalledTimes(1);
    });

    it('refuses to check an unanswered interaction instead of recording a null result', () => {
        mountMultipleChoice();
        expect(() => api.checkAnswer('mc')).toThrow(/no response/);
        expect(mocks.recordInteractionResult).not.toHaveBeenCalled();
    });

    it('rejects sequencing responses that are not a permutation of the items', () => {
        const config = {
            id: 'seq',
            prompt: 'Order',
            items: [{ id: 'one', content: '1' }, { id: 'two', content: '2' }, { id: 'three', content: '3' }],
            correctOrder: ['one', 'two', 'three']
        };
        mount(createSequencingQuestion(config), config);
        expect(() => api.setResponse('seq', 'one')).toThrow(/must be an array/);
        expect(() => api.setResponse('seq', ['one', 'two', 'nope'])).toThrow(/Item IDs: one, three, two/);
        api.setResponse('seq', ['one', 'two', 'three']);
        expect(api.checkAnswer('seq')).toMatchObject({ correct: true });
    });

    it('rejects a response the interaction silently drops', () => {
        const config = { id: 'num', prompt: 'How many?', correctRange: { exact: 4 } };
        mount(createNumericQuestion(config), config);
        expect(() => api.setResponse('num', 'four')).toThrow(/did not accept this response/);
        api.setResponse('num', 4);
        expect(api.checkAnswer('num')).toMatchObject({ correct: true });
    });

    it('accepts bare blank ids for fill-in and rejects unknown blanks', () => {
        const config = {
            id: 'cap',
            template: 'The capital of France is {{city}}.',
            blanks: { city: { correct: 'Paris' } }
        };
        mount(createFillInQuestion(config), config);
        expect(api.listInteractions()[0].hasResponse).toBe(false);
        expect(() => api.setResponse('cap', { town: 'Paris' })).toThrow(/Unknown blank "town"\. Blank IDs: city/);
        api.setResponse('cap', { city: 'Paris' });
        expect(api.getResponse('cap')).toEqual({ cap_city: 'Paris' });
        api.setResponse('cap', { cap_city: 'Lyon' });
        expect(api.getResponse('cap')).toEqual({ cap_city: 'Lyon' });
    });
});
