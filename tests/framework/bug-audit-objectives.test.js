/**
 * @file bug-audit-objectives.test.js
 * @description Tests for objective-manager bugs found during source code audit.
 * Separated from bug-audit.test.js because score-manager tests mock objective-manager.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

vi.mock('../../framework/js/utilities/utilities.js', () => ({
    deepClone: vi.fn(obj => JSON.parse(JSON.stringify(obj)))
}));

vi.mock('../../framework/js/state/index.js', () => {
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

vi.mock('../../framework/js/core/event-bus.js', () => {
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

import stateManager from '../../framework/js/state/index.js';
import { eventBus } from '../../framework/js/core/event-bus.js';


// ═══════════════════════════════════════════════════════════════════════
// Bug 1: objective-manager ignores flag:removed events
// ═══════════════════════════════════════════════════════════════════════

describe('BUG: objective-manager ignores flag:removed', () => {
    let objectiveManager;

    beforeEach(async () => {
        vi.clearAllMocks();
        stateManager._reset();
        stateManager.getDomainState.mockReturnValue(null);
        stateManager.setDomainState.mockImplementation(() => {});
        eventBus._reset();
        vi.resetModules();

        vi.doMock('../../framework/js/utilities/logger.js', () => ({
            logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
        }));
        vi.doMock('../../framework/js/state/index.js', () => ({ default: stateManager }));
        vi.doMock('../../framework/js/core/event-bus.js', () => ({ eventBus }));
        vi.doMock('../../framework/js/utilities/utilities.js', () => ({
            deepClone: vi.fn(obj => JSON.parse(JSON.stringify(obj)))
        }));

        const mod = await import('../../framework/js/managers/objective-manager.js');
        objectiveManager = mod.default;
    });

    it('should respond to flag:removed by re-evaluating criteria', () => {
        objectiveManager.initialize([
            { id: 'obj-free', criteria: { type: 'flag', key: 'guided', equals: false } }
        ]);

        // Simulate: flag 'guided' was set, then removed
        // When 'guided' flag is removed, criteria { key: 'guided', equals: false }
        // should evaluate as satisfied (flag doesn't exist = not true = equals false)
        eventBus.emit('flag:removed', { key: 'guided' });

        // The objective manager should have called setDomainState to persist
        // the updated criteria tracking state
        expect(stateManager.setDomainState).toHaveBeenCalled();
    });
});


// ═══════════════════════════════════════════════════════════════════════
// Bug 2: initialScore: 0 is silently dropped
// ═══════════════════════════════════════════════════════════════════════

describe('BUG: initialScore: 0 silently dropped', () => {
    let objectiveManager;

    beforeEach(async () => {
        vi.clearAllMocks();
        stateManager._reset();
        stateManager.getDomainState.mockReturnValue(null);
        stateManager.setDomainState.mockImplementation(() => {});
        eventBus._reset();
        vi.resetModules();

        vi.doMock('../../framework/js/utilities/logger.js', () => ({
            logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
        }));
        vi.doMock('../../framework/js/state/index.js', () => ({ default: stateManager }));
        vi.doMock('../../framework/js/core/event-bus.js', () => ({ eventBus }));
        vi.doMock('../../framework/js/utilities/utilities.js', () => ({
            deepClone: vi.fn(obj => JSON.parse(JSON.stringify(obj)))
        }));

        const mod = await import('../../framework/js/managers/objective-manager.js');
        objectiveManager = mod.default;
    });

    it('should preserve initialScore of 0', () => {
        objectiveManager.initialize([
            { id: 'obj-zero', initialScore: 0 }
        ]);

        const obj = objectiveManager.getObjective('obj-zero');
        expect(obj.score).toBe(0);
    });

    it('should preserve initialCompletion of empty string', () => {
        objectiveManager.initialize([
            { id: 'obj-empty', initialCompletion: '' }
        ]);

        const obj = objectiveManager.getObjective('obj-empty');
        // With ?? fix, empty string is preserved (it's a valid SCORM value: not_attempted)
        // This is intentional — '' is a valid input, should not be replaced by 'incomplete'
        expect(obj.completion_status).toBe('');
    });
});
