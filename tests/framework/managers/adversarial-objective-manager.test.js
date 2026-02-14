/**
 * @file adversarial-objective-manager.test.js
 * @description Adversarial tests for objective-manager.js
 *
 * These tests probe edge cases and boundary conditions to find bugs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../framework/js/utilities/utilities.js', () => ({
    deepClone: (obj) => JSON.parse(JSON.stringify(obj))
}));

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
    }
}));

const mockDomainState = {};
const mockStateManager = {
    getDomainState: vi.fn((key) => mockDomainState[key] || null),
    setDomainState: vi.fn((key, value) => { mockDomainState[key] = value; })
};

vi.mock('../../../framework/js/state/index.js', () => ({
    default: mockStateManager
}));

const eventHandlers = {};
const mockEventBus = {
    emit: vi.fn(),
    on: vi.fn((event, handler) => {
        if (!eventHandlers[event]) eventHandlers[event] = [];
        eventHandlers[event].push(handler);
    }),
    off: vi.fn()
};

vi.mock('../../../framework/js/core/event-bus.js', () => ({
    eventBus: mockEventBus
}));

// Helper to fire events
function fireEvent(event, data) {
    (eventHandlers[event] || []).forEach(fn => fn(data));
}

// Fresh ObjectiveManager for each test
async function createFreshManager() {
    vi.resetModules();
    const mod = await import('../../../framework/js/managers/objective-manager.js');
    return mod.default;
}

// =========================================================================
// BUG PROBE: NaN score bypasses setScore validation
// =========================================================================
// setScore checks `typeof score !== 'number' || score < 0 || score > 100`
// NaN passes typeof check and NaN < 0 === false and NaN > 100 === false.

describe('BUG PROBE: NaN score in setScore', () => {
    it('NaN passes typeof number check and evades range guard', async () => {
        const manager = await createFreshManager();
        manager.initialize([{ id: 'obj-1' }]);

        // NaN is typeof 'number'
        expect(typeof NaN).toBe('number');
        // NaN < 0 is false, NaN > 100 is false — both comparisons fail
        expect(NaN < 0).toBe(false);
        expect(NaN > 100).toBe(false);

        // So the guard `typeof score !== 'number' || score < 0 || score > 100`
        // evaluates to: false || false || false = false — NaN is accepted!
        // FIXED: isNaN guard now catches NaN
        expect(() => manager.setScore('obj-1', NaN)).toThrow('Score must be a number between 0 and 100');
    });
});

// =========================================================================
// BUG PROBE: setSuccessStatus bypasses setScore validation
// =========================================================================
// setSuccessStatus(id, status, score) directly sets score without validation.

describe('BUG PROBE: setSuccessStatus score bypass', () => {
    it('negative score through setSuccessStatus is now validated', async () => {
        const manager = await createFreshManager();
        manager.initialize([{ id: 'obj-1' }]);

        // FIXED: setSuccessStatus now routes score through setScore validation
        expect(() => manager.setSuccessStatus('obj-1', 'passed', -50)).toThrow('Score must be a number between 0 and 100');
    });

    it('NaN score through setSuccessStatus is now validated', async () => {
        const manager = await createFreshManager();
        manager.initialize([{ id: 'obj-1' }]);

        // FIXED: setSuccessStatus now routes score through setScore validation
        expect(() => manager.setSuccessStatus('obj-1', 'passed', NaN)).toThrow('Score must be a number between 0 and 100');
    });
});

// =========================================================================
// BUG PROBE: No validation of success_status or completion_status values
// =========================================================================

describe('BUG PROBE: invalid status values accepted', () => {
    it('setSuccessStatus rejects invalid status values', async () => {
        const manager = await createFreshManager();
        manager.initialize([{ id: 'obj-1' }]);

        // FIXED: validated against allowed values
        expect(() => manager.setSuccessStatus('obj-1', 'maybe')).toThrow('Invalid success_status');
    });

    it('setCompletionStatus rejects invalid status values', async () => {
        const manager = await createFreshManager();
        manager.initialize([{ id: 'obj-1' }]);

        // FIXED: validated against allowed values
        expect(() => manager.setCompletionStatus('obj-1', 'sorta')).toThrow('Invalid completion_status');
    });
});

// =========================================================================
// BUG PROBE: allSlidesVisited with empty slideIds auto-completes
// =========================================================================
// [].every(...) is vacuously true — objective completes on first slide visit.

describe('BUG PROBE: allSlidesVisited with empty slideIds', () => {
    it('empty slideIds array does not auto-complete objective', async () => {
        const manager = await createFreshManager();
        manager.initialize([{
            id: 'obj-visit',
            criteria: {
                type: 'allSlidesVisited',
                slideIds: [] // Empty!
            }
        }]);

        // Set up navigation state
        mockDomainState['navigation'] = { visitedSlides: [] };

        // Visit any slide
        fireEvent('view:change', { view: 'some-slide' });

        const obj = manager.getObjective('obj-visit');
        expect(obj.completion_status).toBe('incomplete');
    });
});

// =========================================================================
// BUG PROBE: timeOnSlide with minSeconds = 0 or undefined
// =========================================================================
// criteria.minSeconds || 0 → if minSeconds is 0, this evaluates to 0.
// totalSeconds >= 0 is always true, so objective completes immediately.

describe('BUG PROBE: timeOnSlide with zero minSeconds', () => {
    it('minSeconds = 0 does not complete objective', async () => {
        const manager = await createFreshManager();
        manager.initialize([{
            id: 'obj-time',
            criteria: {
                type: 'timeOnSlide',
                slideId: 'target-slide',
                minSeconds: 0
            }
        }]);

        mockDomainState['sessionData'] = { slideDurations: {} };

        // Visit target slide with zero time spent
        fireEvent('view:change', { view: 'target-slide' });

        const obj = manager.getObjective('obj-time');
        expect(obj.completion_status).toBe('incomplete');
    });

    it('missing minSeconds does not complete objective', async () => {
        const manager = await createFreshManager();
        manager.initialize([{
            id: 'obj-time-2',
            criteria: {
                type: 'timeOnSlide',
                slideId: 'target-slide'
                // minSeconds is undefined
            }
        }]);

        mockDomainState['sessionData'] = { slideDurations: {} };
        fireEvent('view:change', { view: 'target-slide' });

        const obj = manager.getObjective('obj-time-2');
        expect(obj.completion_status).toBe('incomplete');
    });
});

// =========================================================================
// BUG PROBE: enableCriteriaTracking stacks event listeners
// =========================================================================
// Each call registers new handlers — no guard or cleanup.

describe('BUG PROBE: enableCriteriaTracking listener stacking', () => {
    it('second call does NOT register duplicate event handlers', async () => {
        const manager = await createFreshManager();
        manager.initialize([{
            id: 'obj-flag',
            criteria: { type: 'flag', key: 'testFlag' }
        }]);

        const viewChangeBefore = (eventHandlers['view:change'] || []).length;
        const flagUpdatedBefore = (eventHandlers['flag:updated'] || []).length;

        // Call again — should be a no-op thanks to dedup guard
        manager.enableCriteriaTracking([{
            id: 'obj-flag',
            criteria: { type: 'flag', key: 'testFlag' }
        }]);

        const viewChangeAfter = (eventHandlers['view:change'] || []).length;
        const flagUpdatedAfter = (eventHandlers['flag:updated'] || []).length;

        // FIXED: no new handlers registered
        expect(viewChangeAfter).toBe(viewChangeBefore);
        expect(flagUpdatedAfter).toBe(flagUpdatedBefore);
    });
});

// =========================================================================
// BUG PROBE: setObjective emits score event for NaN
// =========================================================================
// if (typeof updated.score === 'number') → NaN is typeof number.

describe('BUG PROBE: setObjective emits score event for NaN', () => {
    it('NaN score is rejected by setObjective', async () => {
        const manager = await createFreshManager();
        manager.initialize([{ id: 'obj-1' }]);

        mockEventBus.emit.mockClear();

        expect(() => manager.setObjective({ id: 'obj-1', score: NaN })).toThrow('Score must be a number between 0 and 100');

        const scoreEvents = mockEventBus.emit.mock.calls.filter(
            c => c[0] === 'objective:score:updated'
        );
        expect(scoreEvents).toHaveLength(0);
    });
});
