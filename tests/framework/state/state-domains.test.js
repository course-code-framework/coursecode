import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger and eventBus since DomainStore imports them
vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

vi.mock('../../../framework/js/core/event-bus.js', () => {
    const mockBus = { emit: vi.fn(), on: vi.fn(() => () => {}), off: vi.fn() };
    return { eventBus: mockBus, EventBus: vi.fn(() => mockBus) };
});

const { DomainStore } = await import('../../../framework/js/state/state-domains.js');
const { eventBus } = await import('../../../framework/js/core/event-bus.js');

describe('DomainStore', () => {
    let store;
    let mockTransactionLog;

    beforeEach(() => {
        vi.clearAllMocks();
        mockTransactionLog = { record: vi.fn() };
        store = new DomainStore(mockTransactionLog);
    });

    // ─── Basic CRUD ─────────────────────────────────────────────────

    describe('setDomainState / getDomainState', () => {
        it('sets and gets domain state', () => {
            store.setDomainState('navigation', { currentSlide: 'slide-1' });
            const state = store.getDomainState('navigation');
            expect(state.currentSlide).toBe('slide-1');
        });

        it('returns deep clone (mutations do not leak)', () => {
            store.setDomainState('navigation', { currentSlide: 'slide-1' });
            const state = store.getDomainState('navigation');
            state.currentSlide = 'modified';
            expect(store.getDomainState('navigation').currentSlide).toBe('slide-1');
        });

        it('returns undefined for unknown domain', () => {
            expect(store.getDomainState('nonexistent')).toBeUndefined();
        });

        it('replaces entire domain on set', () => {
            store.setDomainState('navigation', { a: 1, b: 2 });
            store.setDomainState('navigation', { c: 3 });
            const state = store.getDomainState('navigation');
            expect(state.c).toBe(3);
            expect(state.a).toBeUndefined();
        });

        it('emits state:changed event on set', () => {
            store.setDomainState('navigation', { currentSlide: 'slide-1' });
            expect(eventBus.emit).toHaveBeenCalledWith(
                'state:changed',
                expect.objectContaining({ domain: 'navigation' })
            );
        });

        it('records transaction on set', () => {
            store.setDomainState('navigation', { currentSlide: 'slide-1' });
            expect(mockTransactionLog.record).toHaveBeenCalledWith(
                'navigation',
                'set',
                expect.any(Object)
            );
        });
    });

    // ─── Append-only domains (interactions) ─────────────────────────
    // CRITICAL: Interaction data must NEVER be lost via overwrite.
    // LMS spec: cmi.interactions is an append-only array.

    describe('append-only domains (interactions)', () => {
        it('appends to interactions domain instead of replacing', () => {
            store.setDomainState('interactions', { id: 'q1', response: 'a' });
            store.setDomainState('interactions', { id: 'q2', response: 'b' });
            const state = store.getDomainState('interactions');
            expect(Array.isArray(state)).toBe(true);
            expect(state).toHaveLength(2);
        });

        it('preserves data and ordering of appended interactions', () => {
            store.setDomainState('interactions', { id: 'q1', response: 'a' });
            const state = store.getDomainState('interactions');
            expect(state[0].id).toBe('q1');
            expect(state[0].response).toBe('a');
        });

        it('maintains append order across multiple interactions', () => {
            store.setDomainState('interactions', { id: 'q1' });
            store.setDomainState('interactions', { id: 'q2' });
            store.setDomainState('interactions', { id: 'q3' });
            const state = store.getDomainState('interactions');
            expect(state[0].id).toBe('q1');
            expect(state[1].id).toBe('q2');
            expect(state[2].id).toBe('q3');
        });

        it('initializes array on first interaction append', () => {
            store.setDomainState('interactions', { id: 'first', response: 'x' });
            expect(Array.isArray(store.getDomainState('interactions'))).toBe(true);
        });

        it('records append action for interactions', () => {
            store.setDomainState('interactions', { id: 'q1' });
            expect(mockTransactionLog.record).toHaveBeenCalledWith(
                'interactions',
                'append',
                expect.any(Object)
            );
        });
    });

    // ─── Validation ─────────────────────────────────────────────────

    describe('validation', () => {
        it('throws on empty domain name for setDomainState', () => {
            expect(() => store.setDomainState('', { a: 1 })).toThrow();
        });

        it('throws on non-string domain name for setDomainState', () => {
            expect(() => store.setDomainState(42, { a: 1 })).toThrow();
        });

        it('throws on empty domain name for getDomainState', () => {
            expect(() => store.getDomainState('')).toThrow();
        });
    });

    // ─── clearState ─────────────────────────────────────────────────

    describe('clearState', () => {
        it('empties all domains', () => {
            store.setDomainState('navigation', { currentSlide: 'slide-1' });
            store.setDomainState('engagement', { complete: true });
            store.clearState();
            expect(store.getState()).toEqual({});
        });
    });

    // ─── getState ───────────────────────────────────────────────────

    describe('getState', () => {
        it('returns complete state snapshot as deep clone', () => {
            store.setDomainState('navigation', { currentSlide: 'slide-1' });
            store.setDomainState('engagement', { 'slide-1': { complete: true } });
            const all = store.getState();
            expect(all.navigation).toBeDefined();
            expect(all.engagement).toBeDefined();
            // Verify deep clone
            all.navigation.currentSlide = 'modified';
            expect(store.getDomainState('navigation').currentSlide).toBe('slide-1');
        });
    });
});
