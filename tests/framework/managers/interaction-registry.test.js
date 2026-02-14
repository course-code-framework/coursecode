import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Dependencies ─────────────────────────────────────────────

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

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

import { eventBus } from '../../../framework/js/core/event-bus.js';
import interactionRegistry from '../../../framework/js/managers/interaction-registry.js';


beforeEach(() => {
    vi.clearAllMocks();
    interactionRegistry.clear();
});


// ─── register ───────────────────────────────────────────────────────

describe('InteractionRegistry: register', () => {
    it('registers a valid interaction', () => {
        const config = { id: 'q1', type: 'multiple-choice', prompt: 'What?' };
        const instance = { evaluate: vi.fn() };

        interactionRegistry.register(config, instance);

        const all = interactionRegistry.getAll();
        expect(all).toHaveLength(1);
        expect(all[0].id).toBe('q1');
        expect(all[0].type).toBe('multiple-choice');
        expect(all[0].instance).toBe(instance);
    });

    it('emits interaction:registered event', () => {
        const config = { id: 'q1', type: 'true-false', prompt: 'Yes?' };
        const instance = { evaluate: vi.fn() };

        interactionRegistry.register(config, instance);

        expect(eventBus.emit).toHaveBeenCalledWith(
            'interaction:registered',
            expect.objectContaining({ id: 'q1' })
        );
    });

    it('throws when config is missing', () => {
        expect(() => interactionRegistry.register(null, {})).toThrow('configuration or ID is missing');
    });

    it('throws when id is missing', () => {
        expect(() => interactionRegistry.register({}, {})).toThrow('configuration or ID is missing');
    });

    it('throws on duplicate id', () => {
        const config = { id: 'q1', type: 'true-false' };
        interactionRegistry.register(config, {});

        expect(() => interactionRegistry.register(config, {})).toThrow('already registered');
    });

    it('emits interaction:registry:error on invalid config', () => {
        try { interactionRegistry.register(null, {}); } catch { /* expected */ }

        expect(eventBus.emit).toHaveBeenCalledWith(
            'interaction:registry:error',
            expect.objectContaining({ operation: 'register' })
        );
    });

    it('emits interaction:registry:error on duplicate id', () => {
        interactionRegistry.register({ id: 'q1', type: 'tf' }, {});
        try { interactionRegistry.register({ id: 'q1', type: 'tf' }, {}); } catch { /* expected */ }

        expect(eventBus.emit).toHaveBeenCalledWith(
            'interaction:registry:error',
            expect.objectContaining({
                operation: 'register',
                context: expect.objectContaining({ interactionId: 'q1' })
            })
        );
    });

    it('stores config and description (prompt) on registration', () => {
        const config = { id: 'q1', type: 'fill-in', prompt: 'Enter name:' };
        interactionRegistry.register(config, {});

        const all = interactionRegistry.getAll();
        expect(all[0].description).toBe('Enter name:');
        expect(all[0].config).toBe(config);
    });
});


// ─── getAll ─────────────────────────────────────────────────────────

describe('InteractionRegistry: getAll', () => {
    it('returns empty array before any registration', () => {
        expect(interactionRegistry.getAll()).toEqual([]);
    });

    it('returns all registered interactions', () => {
        interactionRegistry.register({ id: 'q1', type: 'tf' }, {});
        interactionRegistry.register({ id: 'q2', type: 'choice' }, {});

        expect(interactionRegistry.getAll()).toHaveLength(2);
    });
});


// ─── clear ──────────────────────────────────────────────────────────

describe('InteractionRegistry: clear', () => {
    it('removes all registered interactions', () => {
        interactionRegistry.register({ id: 'q1', type: 'tf' }, {});
        interactionRegistry.register({ id: 'q2', type: 'choice' }, {});
        interactionRegistry.clear();

        expect(interactionRegistry.getAll()).toEqual([]);
    });

    it('resets isReady flag', () => {
        interactionRegistry.setReady();
        expect(interactionRegistry.isReady).toBe(true);

        interactionRegistry.clear();
        expect(interactionRegistry.isReady).toBe(false);
    });

    it('allows re-registration after clear', () => {
        interactionRegistry.register({ id: 'q1', type: 'tf' }, {});
        interactionRegistry.clear();

        // Same id should be allowed after clear
        interactionRegistry.register({ id: 'q1', type: 'tf' }, {});
        expect(interactionRegistry.getAll()).toHaveLength(1);
    });
});


// ─── setReady ───────────────────────────────────────────────────────

describe('InteractionRegistry: setReady', () => {
    it('sets isReady flag', () => {
        expect(interactionRegistry.isReady).toBe(false);
        interactionRegistry.setReady();
        expect(interactionRegistry.isReady).toBe(true);
    });

    it('emits interaction:registry:ready event with all interactions', () => {
        interactionRegistry.register({ id: 'q1', type: 'tf' }, {});
        interactionRegistry.register({ id: 'q2', type: 'choice' }, {});
        interactionRegistry.setReady();

        expect(eventBus.emit).toHaveBeenCalledWith(
            'interaction:registry:ready',
            expect.arrayContaining([
                expect.objectContaining({ id: 'q1' }),
                expect.objectContaining({ id: 'q2' })
            ])
        );
    });
});
