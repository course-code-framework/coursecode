// @vitest-environment jsdom
/**
 * Regression tests for interaction components:
 * - drag-drop / matching stay interactive after a response is restored
 * - drag-drop zone-to-zone move leaves no duplicate in the bank
 * - drag-drop distractors and multi-item zones are winnable
 * - sequencing / likert don't stack Check Answer handlers on re-render
 * - sequencing never starts in the correct order
 * - multiple-choice shows every correct answer and doesn't expose them in the DOM
 * - fill-in results escape learner text
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../framework/js/managers/interaction-manager.js', () => ({ default: { record: vi.fn() } }));
vi.mock('../../../framework/js/managers/interaction-registry.js', () => ({ default: { register: vi.fn() } }));
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

import { createDragDropQuestion } from '../../../framework/js/components/interactions/drag-drop.js';
import { createMatchingQuestion } from '../../../framework/js/components/interactions/matching.js';
import { createSequencingQuestion } from '../../../framework/js/components/interactions/sequencing.js';
import { createLikertQuestion } from '../../../framework/js/components/interactions/likert.js';
import {
    createMultipleChoiceQuestion,
    metadata as multipleChoiceMetadata
} from '../../../framework/js/components/interactions/multiple-choice.js';
import { metadata as fillInMetadata } from '../../../framework/js/components/interactions/fill-in.js';

beforeEach(() => {
    document.body.innerHTML = '';
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    // jsdom has no CSS.escape; ids used here are plain identifiers
    if (!globalThis.CSS?.escape) {
        globalThis.CSS = { escape: (value) => String(value).replace(/[^\w-]/g, ch => `\\${ch}`) };
    }
});

function mount() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    return container;
}

function bankItem(container, itemId) {
    return container.querySelector(`.drag-items .drag-item[data-item-id="${itemId}"]`);
}

function zoneItem(container, zoneId, itemId) {
    return container.querySelector(`.drop-zone[data-zone-id="${zoneId}"] .drag-item[data-item-id="${itemId}"]`);
}

function isBankItemVisible(item) {
    return item.style.display !== 'none' && !item.classList.contains('hidden');
}

function keyboardSelectAndDrop(item, zone) {
    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

const dragDropConfig = {
    id: 'dd',
    prompt: 'Sort',
    controlled: true,
    items: [
        { id: 'a', content: 'Alpha' },
        { id: 'b', content: 'Beta' },
        { id: 'c', content: 'Gamma' }
    ],
    dropZones: [
        { id: 'z1', label: 'Zone 1', accepts: ['a'] },
        { id: 'z2', label: 'Zone 2', accepts: ['b'] },
        { id: 'z3', label: 'Zone 3', accepts: ['c'] }
    ]
};

describe('drag-drop', () => {
    it('restored placements stay draggable, keyboard-movable and removable', () => {
        const container = mount();
        const question = createDragDropQuestion(dragDropConfig);
        question.render(container);
        question.setResponse({ a: 'z2' });

        const placed = zoneItem(container, 'z2', 'a');
        expect(placed).toBeTruthy();
        expect(placed.draggable).toBe(true);
        expect(placed.querySelector('.remove-item')).toBeTruthy();
        expect(isBankItemVisible(bankItem(container, 'a'))).toBe(false);

        // Keyboard move to another zone works (listeners attached)
        keyboardSelectAndDrop(placed, container.querySelector('.drop-zone[data-zone-id="z1"]'));
        expect(question.getResponse()).toEqual({ a: 'z1' });

        // Remove button returns it to the bank
        zoneItem(container, 'z1', 'a').querySelector('.remove-item').click();
        expect(question.getResponse()).toEqual({});
        expect(isBankItemVisible(bankItem(container, 'a'))).toBe(true);
    });

    it('items placed by the initial render can be returned to the bank', () => {
        const container = mount();
        const question = createDragDropQuestion(dragDropConfig);
        question.render(container, { a: 'z1' });

        zoneItem(container, 'z1', 'a').querySelector('.remove-item').click();
        expect(isBankItemVisible(bankItem(container, 'a'))).toBe(true);
    });

    it('moving an item from zone to zone leaves no duplicate in the bank', () => {
        const container = mount();
        const question = createDragDropQuestion(dragDropConfig);
        question.render(container);

        keyboardSelectAndDrop(bankItem(container, 'a'), container.querySelector('.drop-zone[data-zone-id="z1"]'));
        expect(isBankItemVisible(bankItem(container, 'a'))).toBe(false);

        keyboardSelectAndDrop(zoneItem(container, 'z1', 'a'), container.querySelector('.drop-zone[data-zone-id="z2"]'));
        expect(zoneItem(container, 'z1', 'a')).toBeNull();
        expect(zoneItem(container, 'z2', 'a')).toBeTruthy();
        expect(isBankItemVisible(bankItem(container, 'a'))).toBe(false);
        expect(question.getResponse()).toEqual({ a: 'z2' });
    });

    it('reset brings back items hidden by the initial render', () => {
        const container = mount();
        const question = createDragDropQuestion(dragDropConfig);
        question.render(container, { a: 'z1' });
        question.reset();
        expect(isBankItemVisible(bankItem(container, 'a'))).toBe(true);
        expect(question.getResponse()).toEqual({});
    });

    it('distractor items (no target zone) do not make the question unwinnable', () => {
        const question = createDragDropQuestion({
            ...dragDropConfig,
            items: [...dragDropConfig.items, { id: 'distractor', content: 'Nope' }]
        });
        expect(question.evaluate({ a: 'z1', b: 'z2', c: 'z3' }).correct).toBe(true);
        expect(question.evaluate({ a: 'z1', b: 'z2', c: 'z3', distractor: 'z1' }).correct).toBe(false);
        expect(question.evaluate({ a: 'z1', b: 'z2' }).correct).toBe(false);
    });

    it('a zone accepting several items defaults to holding all of them', () => {
        const container = mount();
        const question = createDragDropQuestion({
            ...dragDropConfig,
            dropZones: [
                { id: 'z1', label: 'Zone 1', accepts: ['a', 'b'] },
                { id: 'z3', label: 'Zone 3', accepts: ['c'] }
            ]
        });
        question.render(container);
        const zone1 = container.querySelector('.drop-zone[data-zone-id="z1"]');
        expect(zone1.dataset.maxItems).toBe('2');

        keyboardSelectAndDrop(bankItem(container, 'a'), zone1);
        keyboardSelectAndDrop(bankItem(container, 'b'), zone1);
        keyboardSelectAndDrop(bankItem(container, 'c'), container.querySelector('.drop-zone[data-zone-id="z3"]'));
        expect(question.evaluate(question.getResponse()).correct).toBe(true);
    });
});

describe('matching', () => {
    const config = {
        id: 'm',
        prompt: 'Match',
        controlled: true,
        pairs: [
            { id: 'p1', text: 'One', match: 'Uno' },
            { id: 'p2', text: 'Two', match: 'Dos' }
        ]
    };

    it('restored deferred-mode matches can still be changed', () => {
        const container = mount();
        const question = createMatchingQuestion(config);
        question.render(container);
        question.setResponse({ p1: 'Dos' });

        const item = container.querySelector('.matching-item[data-item-id="p1"]');
        const target = container.querySelector('.matching-target[data-match-id="p2"]');
        expect(item.disabled).toBe(false);
        expect(target.disabled).toBe(false);

        // Clicking a matched item unmatches it
        item.click();
        expect(question.getResponse()).toEqual({});
    });
});

describe('re-render does not stack click handlers', () => {
    it('sequencing: Check Answer runs once after setResponse/reset', () => {
        const container = mount();
        const question = createSequencingQuestion({
            id: 'seq',
            prompt: 'Order',
            items: [{ id: 'x', text: 'X' }, { id: 'y', text: 'Y' }, { id: 'z', text: 'Z' }],
            correctOrder: ['x', 'y', 'z']
        });
        question.render(container);
        question.setResponse(['z', 'y', 'x']);
        question.reset();

        const checkSpy = vi.spyOn(question, 'checkAnswer');
        container.querySelector('[data-action="check-answer"]').click();
        expect(checkSpy).toHaveBeenCalledTimes(1);
    });

    it('likert: Check Answer runs once after setResponse', () => {
        const container = mount();
        const question = createLikertQuestion({
            id: 'lk',
            prompt: 'Rate',
            scale: [{ value: 1, text: 'Low' }, { value: 2, text: 'High' }],
            questions: [{ id: 's1', text: 'Statement' }]
        });
        question.render(container);
        question.setResponse({ s1: '2' });
        question.setResponse({ s1: '1' });

        const checkSpy = vi.spyOn(question, 'checkAnswer');
        container.querySelector('[data-action="check-answer"]').click();
        expect(checkSpy).toHaveBeenCalledTimes(1);
        // Numeric scale values restore from string responses
        expect(question.getResponse()).toEqual({ s1: '1' });
    });
});

describe('sequencing shuffle', () => {
    it('never presents the correct order up front', () => {
        const spy = vi.spyOn(Math, 'random').mockReturnValue(0.999); // Fisher-Yates identity
        try {
            const container = mount();
            const question = createSequencingQuestion({
                id: 'seq2',
                prompt: 'Order',
                controlled: true,
                items: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
                correctOrder: ['a', 'b']
            });
            question.render(container);
            expect(question.getResponse()).not.toEqual(['a', 'b']);
            expect([...question.getResponse()].sort()).toEqual(['a', 'b']);
        } finally {
            spy.mockRestore();
        }
    });
});

describe('multiple-choice', () => {
    const multiConfig = {
        id: 'mc',
        prompt: 'Pick',
        multiple: true,
        controlled: true,
        choices: [
            { value: 'a', text: 'Apple', correct: true },
            { value: 'b', text: 'Banana' },
            { value: 'c', text: 'Cherry', correct: true }
        ]
    };

    it('formatCorrectAnswer lists every correct choice for multi-select', () => {
        const correct = multipleChoiceMetadata.getCorrectAnswer(multiConfig);
        const html = multipleChoiceMetadata.formatCorrectAnswer(multiConfig, correct);
        expect(html).toContain('Apple');
        expect(html).toContain('Cherry');
        expect(html).not.toContain('Banana');
    });

    it('formatCorrectAnswer shows the configured answer for single-select', () => {
        const single = { ...multiConfig, multiple: false, correctAnswer: 'b' };
        const html = multipleChoiceMetadata.formatCorrectAnswer(single, multipleChoiceMetadata.getCorrectAnswer(single));
        expect(html).toContain('Banana');
        expect(html).not.toContain('Apple');
    });

    it('does not expose correct answers in the rendered DOM', () => {
        const container = mount();
        const question = createMultipleChoiceQuestion(multiConfig);
        question.render(container);
        expect(container.querySelector('[data-correct]')).toBeNull();
        expect(question.evaluate(['a', 'c']).correct).toBe(true);
    });
});

describe('fill-in results', () => {
    it('escapes learner text in formatUserResponse', () => {
        const html = fillInMetadata.formatUserResponse({ id: 'fi' }, { blank1: '<img src=x onerror=alert(1)>' });
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });
});
