import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock Dependencies ─────────────────────────────────────────────
// vi.mock factories are hoisted above all imports, so we cannot reference
// module-level const/let variables. Instead, define shared state on globalThis.

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
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

let flagManager;

beforeEach(async () => {
    vi.clearAllMocks();
    stateManager._reset();
    stateManager.getDomainState.mockReturnValue(null);
    eventBus._reset();
    vi.resetModules();

    vi.doMock('../../../framework/js/utilities/logger.js', () => ({
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
    }));
    vi.doMock('../../../framework/js/state/index.js', () => ({ default: stateManager }));
    vi.doMock('../../../framework/js/core/event-bus.js', () => ({ eventBus }));

    const mod = await import('../../../framework/js/managers/flag-manager.js');
    flagManager = mod.default;
});


// ─── Initialization ─────────────────────────────────────────────────

describe('FlagManager: initialization', () => {
    it('initializes and loads existing flags from state', () => {
        stateManager.getDomainState.mockReturnValue({ myFlag: true });

        flagManager.initialize();
        expect(flagManager.isInitialized).toBe(true);
        expect(flagManager.getFlag('myFlag')).toBe(true);
    });

    it('initializes with empty state', () => {
        flagManager.initialize();
        expect(flagManager.isInitialized).toBe(true);
    });

    it('throws on double initialization', () => {
        flagManager.initialize();
        expect(() => flagManager.initialize()).toThrow('Already initialized');
    });
});


// ─── Set / Get / Remove ─────────────────────────────────────────────

describe('FlagManager: set / get / remove', () => {
    beforeEach(() => {
        flagManager.initialize();
    });

    it('sets and gets a flag', () => {
        flagManager.setFlag('moduleComplete', true);
        expect(flagManager.getFlag('moduleComplete')).toBe(true);
    });

    it('sets a flag with any value type', () => {
        flagManager.setFlag('level', 'expert');
        expect(flagManager.getFlag('level')).toBe('expert');

        flagManager.setFlag('count', 42);
        expect(flagManager.getFlag('count')).toBe(42);
    });

    it('getFlag returns undefined for non-existent flag', () => {
        expect(flagManager.getFlag('nonexistent')).toBeUndefined();
    });

    it('overwrites existing flag value', () => {
        flagManager.setFlag('toggle', false);
        flagManager.setFlag('toggle', true);
        expect(flagManager.getFlag('toggle')).toBe(true);
    });

    it('removes a flag', () => {
        flagManager.setFlag('temp', 'value');
        flagManager.removeFlag('temp');
        expect(flagManager.getFlag('temp')).toBeUndefined();
    });

    it('removing a non-existent flag is a no-op', () => {
        expect(() => flagManager.removeFlag('nonexistent')).not.toThrow();
    });
});


// ─── State Persistence ──────────────────────────────────────────────

describe('FlagManager: state persistence', () => {
    beforeEach(() => {
        flagManager.initialize();
    });

    it('persists flags to stateManager on set', () => {
        flagManager.setFlag('myFlag', true);
        expect(stateManager.setDomainState).toHaveBeenCalledWith(
            'flags',
            expect.objectContaining({ myFlag: true }),
            expect.any(Object)
        );
    });

    it('persists flags to stateManager on remove', () => {
        flagManager.setFlag('temp', 'value');
        stateManager.setDomainState.mockClear();

        flagManager.removeFlag('temp');
        expect(stateManager.setDomainState).toHaveBeenCalledWith(
            'flags',
            expect.not.objectContaining({ temp: 'value' }),
            expect.any(Object)
        );
    });
});


// ─── Events ─────────────────────────────────────────────────────────

describe('FlagManager: events', () => {
    beforeEach(() => {
        flagManager.initialize();
    });

    it('emits flag:updated event on set', () => {
        const emitted = [];
        eventBus.on('flag:updated', (data) => emitted.push(data));

        flagManager.setFlag('doneReading', true);

        expect(emitted).toHaveLength(1);
        expect(emitted[0].key).toBe('doneReading');
        expect(emitted[0].value).toBe(true);
    });

    it('emits flag:removed event on remove', () => {
        flagManager.setFlag('temp', 'value');

        const emitted = [];
        eventBus.on('flag:removed', (data) => emitted.push(data));

        flagManager.removeFlag('temp');

        expect(emitted).toHaveLength(1);
        expect(emitted[0].key).toBe('temp');
    });
});


// ─── getAllFlags ─────────────────────────────────────────────────────

describe('FlagManager: getAllFlags', () => {
    beforeEach(() => {
        flagManager.initialize();
    });

    it('returns all current flags', () => {
        flagManager.setFlag('a', 1);
        flagManager.setFlag('b', 2);

        const all = flagManager.getAllFlags();
        expect(all).toEqual({ a: 1, b: 2 });
    });

    it('returns a copy (not a reference)', () => {
        flagManager.setFlag('safe', true);
        const all = flagManager.getAllFlags();
        all.safe = false;

        expect(flagManager.getFlag('safe')).toBe(true);
    });
});
