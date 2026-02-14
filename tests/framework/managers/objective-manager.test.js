import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock Dependencies ─────────────────────────────────────────────
// vi.mock factories are hoisted — shared state must live inside the factory.

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

vi.mock('../../../framework/js/utilities/utilities.js', () => ({
    deepClone: vi.fn((obj) => JSON.parse(JSON.stringify(obj)))
}));

vi.mock('../../../framework/js/state/index.js', () => {
    const store = {};
    return {
        default: {
            getDomainState: vi.fn((key) => store[key] ?? null),
            setDomainState: vi.fn((key, val) => { store[key] = val; }),
            _store: store,
            _reset: () => { for (const k of Object.keys(store)) delete store[k]; }
        }
    };
});

vi.mock('../../../framework/js/core/event-bus.js', () => {
    const handlers = {};
    return {
        eventBus: {
            on: vi.fn((event, cb) => {
                if (!handlers[event]) handlers[event] = [];
                handlers[event].push(cb);
                return () => { handlers[event] = handlers[event].filter(h => h !== cb); };
            }),
            emit: vi.fn((event, data) => {
                (handlers[event] || []).forEach(cb => cb(data));
            }),
            _handlers: handlers,
            _reset: () => { for (const k of Object.keys(handlers)) delete handlers[k]; }
        }
    };
});

import stateManager from '../../../framework/js/state/index.js';
import { eventBus } from '../../../framework/js/core/event-bus.js';

let objectiveManager;

beforeEach(async () => {
    vi.clearAllMocks();
    stateManager._reset();
    stateManager.getDomainState.mockReturnValue(null);
    stateManager.setDomainState.mockImplementation(() => {});
    eventBus._reset();
    vi.resetModules();

    vi.doMock('../../../framework/js/utilities/logger.js', () => ({
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
    }));
    vi.doMock('../../../framework/js/utilities/utilities.js', () => ({
        deepClone: vi.fn((obj) => JSON.parse(JSON.stringify(obj)))
    }));
    vi.doMock('../../../framework/js/state/index.js', () => ({ default: stateManager }));
    vi.doMock('../../../framework/js/core/event-bus.js', () => ({ eventBus }));

    const mod = await import('../../../framework/js/managers/objective-manager.js');
    objectiveManager = mod.default;
});


// ─── Initialization ─────────────────────────────────────────────────

describe('ObjectiveManager: initialization', () => {
    it('initializes with empty config', () => {
        objectiveManager.initialize([]);
        expect(objectiveManager.isInitialized).toBe(true);
        expect(objectiveManager.getObjectives()).toEqual([]);
    });

    it('throws on double initialization', () => {
        objectiveManager.initialize([]);
        expect(() => objectiveManager.initialize([])).toThrow('Already initialized');
    });

    it('seeds objectives from config', () => {
        objectiveManager.initialize([
            { id: 'obj-1' },
            { id: 'obj-2' }
        ]);

        const objectives = objectiveManager.getObjectives();
        expect(objectives).toHaveLength(2);
        expect(objectives[0].id).toBe('obj-1');
        expect(objectives[0].completion_status).toBe('incomplete');
        expect(objectives[0].success_status).toBe('unknown');
    });

    it('uses initial statuses from config', () => {
        objectiveManager.initialize([
            { id: 'obj-1', initialCompletion: 'completed', initialSuccess: 'passed', initialScore: 95 }
        ]);

        const obj = objectiveManager.getObjective('obj-1');
        expect(obj.completion_status).toBe('completed');
        expect(obj.success_status).toBe('passed');
        expect(obj.score).toBe(95);
    });

    it('restores persisted objectives from state', () => {
        stateManager.getDomainState.mockReturnValue({
            'obj-1': { id: 'obj-1', completion_status: 'completed', success_status: 'passed', score: 85 }
        });

        objectiveManager.initialize([{ id: 'obj-1' }]);

        const obj = objectiveManager.getObjective('obj-1');
        expect(obj.completion_status).toBe('completed');
        expect(obj.score).toBe(85);
    });

    it('does not overwrite persisted objectives with config defaults', () => {
        stateManager.getDomainState.mockReturnValue({
            'obj-1': { id: 'obj-1', completion_status: 'completed', success_status: 'passed', score: 100 }
        });

        objectiveManager.initialize([{ id: 'obj-1' }]);

        const obj = objectiveManager.getObjective('obj-1');
        expect(obj.completion_status).toBe('completed');
        expect(obj.score).toBe(100);
    });
});


// ─── CRUD Operations ────────────────────────────────────────────────

describe('ObjectiveManager: CRUD', () => {
    beforeEach(() => {
        objectiveManager.initialize([{ id: 'obj-1' }]);
    });

    it('getObjective returns null for non-existent id', () => {
        expect(objectiveManager.getObjective('nonexistent')).toBeNull();
    });

    it('getObjective returns null for falsy id', () => {
        expect(objectiveManager.getObjective(null)).toBeNull();
        expect(objectiveManager.getObjective('')).toBeNull();
    });

    it('setObjective creates a new objective', () => {
        objectiveManager.setObjective({ id: 'obj-new', completion_status: 'incomplete' });
        expect(objectiveManager.getObjective('obj-new')).not.toBeNull();
    });

    it('setObjective updates an existing objective', () => {
        objectiveManager.setObjective({ id: 'obj-1', score: 75 });
        expect(objectiveManager.getObjective('obj-1').score).toBe(75);
    });

    it('setObjective throws without id', () => {
        expect(() => objectiveManager.setObjective({})).toThrow('requires an id');
    });

    it('setObjective persists to stateManager', () => {
        objectiveManager.setObjective({ id: 'obj-1', score: 50 });
        expect(stateManager.setDomainState).toHaveBeenCalledWith(
            'objectives',
            expect.objectContaining({ 'obj-1': expect.objectContaining({ score: 50 }) }),
            { source: 'objective-manager' }
        );
    });

    it('setObjective emits objective:updated event', () => {
        const emitted = [];
        eventBus.on('objective:updated', (data) => emitted.push(data));

        objectiveManager.setObjective({ id: 'obj-1', completion_status: 'completed' });

        expect(emitted).toHaveLength(1);
        expect(emitted[0].id).toBe('obj-1');
        expect(emitted[0].completion_status).toBe('completed');
    });

    it('setObjective emits objective:score:updated when score is set', () => {
        const emitted = [];
        eventBus.on('objective:score:updated', (data) => emitted.push(data));

        objectiveManager.setObjective({ id: 'obj-1', score: 88 });

        expect(emitted).toHaveLength(1);
        expect(emitted[0].objectiveId).toBe('obj-1');
        expect(emitted[0].score).toBe(88);
    });

    it('getObjectives returns deep clones', () => {
        const objectives = objectiveManager.getObjectives();
        objectives[0].score = 999;
        expect(objectiveManager.getObjective('obj-1').score).not.toBe(999);
    });
});


// ─── Helper Methods ─────────────────────────────────────────────────

describe('ObjectiveManager: helper methods', () => {
    beforeEach(() => {
        objectiveManager.initialize([{ id: 'obj-1' }]);
    });

    it('setSuccessStatus updates success_status', () => {
        objectiveManager.setSuccessStatus('obj-1', 'passed');
        expect(objectiveManager.getObjective('obj-1').success_status).toBe('passed');
    });

    it('setSuccessStatus optionally sets score', () => {
        objectiveManager.setSuccessStatus('obj-1', 'passed', 92);
        const obj = objectiveManager.getObjective('obj-1');
        expect(obj.success_status).toBe('passed');
        expect(obj.score).toBe(92);
    });

    it('setSuccessStatus throws for non-existent objective', () => {
        expect(() => objectiveManager.setSuccessStatus('bogus', 'passed')).toThrow('not found');
    });

    it('setCompletionStatus updates completion_status', () => {
        objectiveManager.setCompletionStatus('obj-1', 'completed');
        expect(objectiveManager.getObjective('obj-1').completion_status).toBe('completed');
    });

    it('setCompletionStatus throws for non-existent objective', () => {
        expect(() => objectiveManager.setCompletionStatus('bogus', 'completed')).toThrow('not found');
    });

    it('setScore sets a valid score', () => {
        objectiveManager.setScore('obj-1', 77);
        expect(objectiveManager.getObjective('obj-1').score).toBe(77);
    });

    it('setScore throws for non-existent objective', () => {
        expect(() => objectiveManager.setScore('bogus', 50)).toThrow('not found');
    });

    it('setScore throws for out-of-range score', () => {
        expect(() => objectiveManager.setScore('obj-1', 150)).toThrow('between 0 and 100');
        expect(() => objectiveManager.setScore('obj-1', -5)).toThrow('between 0 and 100');
    });

    it('setScore throws for non-number score', () => {
        expect(() => objectiveManager.setScore('obj-1', 'high')).toThrow('between 0 and 100');
    });

    it('setScore accepts boundary values 0 and 100', () => {
        objectiveManager.setScore('obj-1', 0);
        expect(objectiveManager.getObjective('obj-1').score).toBe(0);

        objectiveManager.setScore('obj-1', 100);
        expect(objectiveManager.getObjective('obj-1').score).toBe(100);
    });
});


// ─── Early Queue ────────────────────────────────────────────────────

describe('ObjectiveManager: early queue', () => {
    it('queues setObjective calls before initialization', () => {
        objectiveManager.setObjective({ id: 'early-obj', completion_status: 'completed' });
        expect(objectiveManager.getObjective('early-obj')).toBeNull();

        objectiveManager.initialize([]);

        const obj = objectiveManager.getObjective('early-obj');
        expect(obj).not.toBeNull();
        expect(obj.completion_status).toBe('completed');
    });

    it('queues setSuccessStatus calls before initialization', () => {
        objectiveManager.setSuccessStatus('obj-1', 'passed', 90);
        objectiveManager.initialize([{ id: 'obj-1' }]);

        const obj = objectiveManager.getObjective('obj-1');
        expect(obj.success_status).toBe('passed');
        expect(obj.score).toBe(90);
    });

    it('queues setCompletionStatus calls before initialization', () => {
        objectiveManager.setCompletionStatus('obj-1', 'completed');
        objectiveManager.initialize([{ id: 'obj-1' }]);

        expect(objectiveManager.getObjective('obj-1').completion_status).toBe('completed');
    });

    it('queues setScore calls before initialization', () => {
        objectiveManager.setScore('obj-1', 66);
        objectiveManager.initialize([{ id: 'obj-1' }]);

        expect(objectiveManager.getObjective('obj-1').score).toBe(66);
    });
});


// ─── Criteria Tracking ──────────────────────────────────────────────

describe('ObjectiveManager: criteria tracking', () => {
    it('completes objective on slideVisited criteria', () => {
        objectiveManager.initialize([
            { id: 'obj-1', criteria: { type: 'slideVisited', slideId: 'slide-5' } }
        ]);

        eventBus.emit('view:change', { view: 'slide-5' });

        expect(objectiveManager.getObjective('obj-1').completion_status).toBe('completed');
    });

    it('does not complete objective on wrong slideVisited', () => {
        objectiveManager.initialize([
            { id: 'obj-1', criteria: { type: 'slideVisited', slideId: 'slide-5' } }
        ]);

        // The actual implementation may check visited slides via stateManager 
        // rather than just the event payload. If stateManager reports slide-5
        // as visited, the criteria is met regardless of which slide triggered the event.
        // Ensure stateManager does NOT report slide-5 as visited.
        stateManager.getDomainState.mockImplementation((key) => {
            if (key === 'navigation') return { visitedSlides: ['slide-3'] };
            if (key === 'objectives') return null;
            return null;
        });

        eventBus.emit('view:change', { view: 'slide-3' });

        expect(objectiveManager.getObjective('obj-1').completion_status).toBe('incomplete');
    });

    it('completes objective on allSlidesVisited criteria', () => {
        stateManager.getDomainState.mockImplementation((key) => {
            if (key === 'navigation') return { visitedSlides: ['slide-1', 'slide-2'] };
            if (key === 'objectives') return null;
            return null;
        });

        objectiveManager.initialize([
            { id: 'obj-1', criteria: { type: 'allSlidesVisited', slideIds: ['slide-1', 'slide-2', 'slide-3'] } }
        ]);

        eventBus.emit('view:change', { view: 'slide-3' });

        expect(objectiveManager.getObjective('obj-1').completion_status).toBe('completed');
    });

    it('completes objective on flag criteria (truthy)', () => {
        objectiveManager.initialize([
            { id: 'obj-1', criteria: { type: 'flag', key: 'moduleComplete' } }
        ]);

        eventBus.emit('flag:updated', { key: 'moduleComplete', value: true });

        expect(objectiveManager.getObjective('obj-1').completion_status).toBe('completed');
    });

    it('does not complete objective on falsy flag', () => {
        objectiveManager.initialize([
            { id: 'obj-1', criteria: { type: 'flag', key: 'moduleComplete' } }
        ]);

        eventBus.emit('flag:updated', { key: 'moduleComplete', value: false });

        expect(objectiveManager.getObjective('obj-1').completion_status).toBe('incomplete');
    });

    it('completes objective on flag criteria with equals match', () => {
        objectiveManager.initialize([
            { id: 'obj-1', criteria: { type: 'flag', key: 'level', equals: 'expert' } }
        ]);

        eventBus.emit('flag:updated', { key: 'level', value: 'expert' });
        expect(objectiveManager.getObjective('obj-1').completion_status).toBe('completed');
    });

    it('does not complete on flag criteria with wrong equals value', () => {
        objectiveManager.initialize([
            { id: 'obj-1', criteria: { type: 'flag', key: 'level', equals: 'expert' } }
        ]);

        eventBus.emit('flag:updated', { key: 'level', value: 'beginner' });
        expect(objectiveManager.getObjective('obj-1').completion_status).toBe('incomplete');
    });

    it('completes allFlags criteria when all required flags are truthy', () => {
        stateManager.getDomainState.mockImplementation((key) => {
            if (key === 'flags') return { flagA: true, flagB: true };
            if (key === 'objectives') return null;
            return null;
        });

        objectiveManager.initialize([
            { id: 'obj-1', criteria: { type: 'allFlags', flags: ['flagA', 'flagB'] } }
        ]);

        eventBus.emit('flag:updated', { key: 'flagB', value: true });
        expect(objectiveManager.getObjective('obj-1').completion_status).toBe('completed');
    });

    it('does not complete allFlags criteria when flags array is empty', () => {
        stateManager.getDomainState.mockImplementation((key) => {
            if (key === 'flags') return {};
            if (key === 'objectives') return null;
            return null;
        });

        objectiveManager.initialize([
            { id: 'obj-1', criteria: { type: 'allFlags', flags: [] } }
        ]);

        eventBus.emit('flag:updated', { key: 'anything', value: true });
        expect(objectiveManager.getObjective('obj-1').completion_status).toBe('incomplete');
    });

    it('skips already-completed objectives on criteria events', () => {
        objectiveManager.initialize([
            { id: 'obj-1', criteria: { type: 'slideVisited', slideId: 'slide-5' } }
        ]);

        eventBus.emit('view:change', { view: 'slide-5' });
        expect(objectiveManager.getObjective('obj-1').completion_status).toBe('completed');

        stateManager.setDomainState.mockClear();
        eventBus.emit('view:change', { view: 'slide-5' });
        expect(stateManager.setDomainState).not.toHaveBeenCalled();
    });

    it('completes timeOnSlide criteria when enough time accumulated', () => {
        stateManager.getDomainState.mockImplementation((key) => {
            if (key === 'sessionData') return { slideDurations: { 'slide-1': 35000 } };
            if (key === 'objectives') return null;
            return null;
        });

        objectiveManager.initialize([
            { id: 'obj-1', criteria: { type: 'timeOnSlide', slideId: 'slide-1', minSeconds: 30 } }
        ]);

        eventBus.emit('view:change', { view: 'slide-1' });
        expect(objectiveManager.getObjective('obj-1').completion_status).toBe('completed');
    });

    it('does not complete timeOnSlide criteria when insufficient time', () => {
        stateManager.getDomainState.mockImplementation((key) => {
            if (key === 'sessionData') return { slideDurations: { 'slide-1': 10000 } };
            if (key === 'objectives') return null;
            return null;
        });

        objectiveManager.initialize([
            { id: 'obj-1', criteria: { type: 'timeOnSlide', slideId: 'slide-1', minSeconds: 30 } }
        ]);

        eventBus.emit('view:change', { view: 'slide-1' });
        expect(objectiveManager.getObjective('obj-1').completion_status).toBe('incomplete');
    });

    it('completes timeOnSlide criteria when leaving the tracked slide', () => {
        stateManager.getDomainState.mockImplementation((key) => {
            if (key === 'sessionData') return { slideDurations: { 'slide-1': 35000 } };
            if (key === 'objectives') return null;
            return null;
        });

        objectiveManager.initialize([
            { id: 'obj-1', criteria: { type: 'timeOnSlide', slideId: 'slide-1', minSeconds: 30 } }
        ]);

        // Simulate normal navigation away from slide-1 to slide-2.
        eventBus.emit('navigation:changed', { fromSlideId: 'slide-1', toSlideId: 'slide-2' });
        expect(objectiveManager.getObjective('obj-1').completion_status).toBe('completed');
    });
});
