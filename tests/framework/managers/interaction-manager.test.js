import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock Dependencies ─────────────────────────────────────────────

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

vi.mock('../../../framework/js/utilities/utilities.js', () => ({
    deepClone: vi.fn((obj) => JSON.parse(JSON.stringify(obj))),
    generateId: vi.fn((prefix) => `${prefix}-auto-1`)
}));

// NOTE: scorm-validators mock is set up in beforeEach via vi.doMock (after vi.resetModules).
// No top-level vi.mock needed since the module is re-imported each test.

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

let interactionManager;

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
        deepClone: vi.fn((obj) => JSON.parse(JSON.stringify(obj))),
        generateId: vi.fn((prefix) => `${prefix}-auto-1`)
    }));
    vi.doMock('../../../framework/js/validation/scorm-validators.js', () => ({
        SCORM_INTERACTION_TYPES: ['true-false','choice','fill-in','long-fill-in','likert','matching','performance','sequencing','numeric','other'],
        SCORM_INTERACTION_RESULTS: ['correct','incorrect','unanticipated','neutral'],
        isValidISO8601Timestamp: vi.fn((ts) => /^\d{4}-\d{2}-\d{2}T/.test(ts)),
        isValidISO8601Duration: vi.fn((d) => /^PT/.test(d)),
        validateInteractionType: vi.fn((type) => {
            const valid = ['true-false','choice','fill-in','long-fill-in','likert','matching','performance','sequencing','numeric','other'].includes(type);
            return valid ? { valid: true } : { valid: false, error: `Invalid type` };
        }),
        validateInteractionResult: vi.fn((result) => {
            const valid = ['correct','incorrect','unanticipated','neutral'].includes(result);
            return valid ? { valid: true } : { valid: false, error: `Invalid result` };
        }),
        validateNumeric: vi.fn((val) => typeof val === 'number' ? { valid: true } : { valid: false, error: 'numeric' }),
        validateStringArray: vi.fn((arr) => Array.isArray(arr) ? { valid: true } : { valid: false, error: 'array' }),
        validateRequiredFields: vi.fn((data, fields) => {
            const errors = fields.filter(f => !data[f]).map(f => `Missing: ${f}`);
            return errors.length === 0 ? { valid: true } : { valid: false, errors };
        }),
        formatValidationError: vi.fn((errors, ctx) => `Validation failed for ${ctx}: ${errors.join('; ')}`),
        generateScormTimestamp: vi.fn(() => '2026-02-08T22:00:00.000Z')
    }));
    vi.doMock('../../../framework/js/state/index.js', () => ({ default: stateManager }));
    vi.doMock('../../../framework/js/core/event-bus.js', () => ({ eventBus }));

    const mod = await import('../../../framework/js/managers/interaction-manager.js');
    interactionManager = mod.default;
});


// ─── Initialization ─────────────────────────────────────────────────

describe('InteractionManager: initialization', () => {
    it('initializes and loads existing interactions from state', () => {
        stateManager.getDomainState.mockReturnValue([
            { id: 'q1', type: 'true-false', learner_response: 'true' }
        ]);
        interactionManager.initialize();
        expect(interactionManager.isInitialized).toBe(true);
        expect(interactionManager.getAllInteractions()).toHaveLength(1);
    });

    it('initializes with empty state', () => {
        interactionManager.initialize();
        expect(interactionManager.getAllInteractions()).toEqual([]);
    });

    it('throws on double initialization', () => {
        interactionManager.initialize();
        expect(() => interactionManager.initialize()).toThrow('Already initialized');
    });
});


// ─── Validation ─────────────────────────────────────────────────────

describe('InteractionManager: validation', () => {
    beforeEach(() => { interactionManager.initialize(); });

    it('throws when interaction data is null', () => {
        expect(() => interactionManager.record(null)).toThrow();
    });

    it('throws when type is missing', () => {
        expect(() => interactionManager.record({})).toThrow();
    });

    it('throws on invalid type', () => {
        expect(() => interactionManager.record({ type: 'bogus' })).toThrow();
    });

    it('throws on invalid result', () => {
        expect(() => interactionManager.record({ type: 'true-false', result: 'maybe' })).toThrow();
    });
});


// ─── Recording ──────────────────────────────────────────────────────

describe('InteractionManager: recording', () => {
    beforeEach(() => { interactionManager.initialize(); });

    it('records a valid interaction', () => {
        const result = interactionManager.record({
            id: 'q1', type: 'true-false', learner_response: 'true', result: 'correct'
        });
        expect(result.id).toBe('q1');
        expect(result.type).toBe('true-false');
        expect(result.result).toBe('correct');
    });

    it('auto-generates id if not provided', () => {
        const result = interactionManager.record({ type: 'true-false' });
        expect(result.id).toBe('interaction-auto-1');
    });

    it('auto-generates timestamp if not provided', () => {
        const result = interactionManager.record({ type: 'true-false' });
        expect(result.timestamp).toBe('2026-02-08T22:00:00.000Z');
    });

    it('defaults result to neutral', () => {
        const result = interactionManager.record({ type: 'true-false' });
        expect(result.result).toBe('neutral');
    });

    it('persists interaction to stateManager', () => {
        interactionManager.record({ type: 'true-false', id: 'q1' });
        expect(stateManager.setDomainState).toHaveBeenCalledWith(
            'interactions',
            expect.objectContaining({ id: 'q1', type: 'true-false' })
        );
    });

    it('emits interaction:recorded event', () => {
        const emitted = [];
        eventBus.on('interaction:recorded', (data) => emitted.push(data));
        interactionManager.record({ type: 'true-false', id: 'q1' });
        expect(emitted).toHaveLength(1);
        expect(emitted[0].id).toBe('q1');
    });

    it('accumulates interactions in memory', () => {
        interactionManager.record({ type: 'true-false', id: 'q1' });
        interactionManager.record({ type: 'choice', id: 'q2' });
        expect(interactionManager.getAllInteractions()).toHaveLength(2);
    });
});


// ─── Retrieval ──────────────────────────────────────────────────────

describe('InteractionManager: retrieval', () => {
    beforeEach(() => {
        interactionManager.initialize();
        interactionManager.record({ type: 'true-false', id: 'q1' });
        interactionManager.record({ type: 'choice', id: 'q2' });
    });

    it('getInteraction returns specific interaction', () => {
        expect(interactionManager.getInteraction('q1').type).toBe('true-false');
    });

    it('getInteraction returns null for non-existent id', () => {
        expect(interactionManager.getInteraction('nonexistent')).toBeNull();
    });

    it('getAllInteractions returns all interactions', () => {
        expect(interactionManager.getAllInteractions()).toHaveLength(2);
    });
});


// ─── Likert Convenience Method ──────────────────────────────────────

describe('InteractionManager: addLikertInteraction', () => {
    beforeEach(() => { interactionManager.initialize(); });

    it('records a likert interaction with correct type', () => {
        const result = interactionManager.addLikertInteraction({
            id: 'likert-1', response: '4', description: 'Satisfaction?'
        });
        expect(result.type).toBe('likert');
        expect(result.learner_response).toBe('4');
        expect(result.result).toBe('neutral');
    });

    it('throws when id is missing', () => {
        expect(() => interactionManager.addLikertInteraction({ response: '3' })).toThrow('id is required');
    });

    it('throws when response is missing', () => {
        expect(() => interactionManager.addLikertInteraction({ id: 'l1' })).toThrow('response is required');
    });

    it('coerces response to string', () => {
        const result = interactionManager.addLikertInteraction({ id: 'l1', response: 5 });
        expect(result.learner_response).toBe('5');
    });
});
