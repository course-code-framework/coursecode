import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger — EventBus imports it, and logger imports eventBus (circular).
// We break the cycle by mocking the logger module.
vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn()
    }
}));

const { EventBus } = await import('../../../framework/js/core/event-bus.js');

describe('EventBus', () => {
    let bus;

    beforeEach(() => {
        bus = new EventBus();
    });

    // ─── on / emit ──────────────────────────────────────────────────

    describe('on / emit', () => {
        it('calls registered listener on emit', () => {
            const fn = vi.fn();
            bus.on('test', fn);
            bus.emit('test', 'payload');
            expect(fn).toHaveBeenCalledWith('payload');
        });

        it('supports multiple listeners on same event', () => {
            const fn1 = vi.fn();
            const fn2 = vi.fn();
            bus.on('test', fn1);
            bus.on('test', fn2);
            bus.emit('test');
            expect(fn1).toHaveBeenCalledOnce();
            expect(fn2).toHaveBeenCalledOnce();
        });

        it('returns unsubscribe function', () => {
            const fn = vi.fn();
            const unsub = bus.on('test', fn);
            unsub();
            bus.emit('test');
            expect(fn).not.toHaveBeenCalled();
        });

        it('emit returns false when no listeners', () => {
            expect(bus.emit('ghost')).toBe(false);
        });

        it('emit returns true when listeners exist', () => {
            bus.on('test', vi.fn());
            expect(bus.emit('test')).toBe(true);
        });
    });

    // ─── Error isolation ────────────────────────────────────────────
    // CRITICAL: One broken listener must NOT prevent others from firing.
    // In a real LMS, this prevents one tracking event from killing course functionality.

    describe('error isolation', () => {
        it('continues calling listeners after one throws', () => {
            const badListener = () => { throw new Error('💥'); };
            const goodListener = vi.fn();

            bus.on('test', badListener);
            bus.on('test', goodListener);

            bus.emit('test');
            expect(goodListener).toHaveBeenCalledOnce();
        });
    });

    // ─── once ───────────────────────────────────────────────────────

    describe('once', () => {
        it('fires exactly once then auto-removes', () => {
            const fn = vi.fn();
            bus.once('test', fn);
            bus.emit('test');
            bus.emit('test');
            expect(fn).toHaveBeenCalledOnce();
        });
    });

    // ─── off ────────────────────────────────────────────────────────

    describe('off', () => {
        it('removes listener by reference', () => {
            const fn = vi.fn();
            bus.on('test', fn);
            bus.off('test', fn);
            bus.emit('test');
            expect(fn).not.toHaveBeenCalled();
        });

        it('no-op for unknown event', () => {
            expect(() => bus.off('nonexistent', vi.fn())).not.toThrow();
        });
    });

    // ─── emitAsync ──────────────────────────────────────────────────

    describe('emitAsync', () => {
        it('awaits async listeners', async () => {
            const results = [];
            bus.on('test', async () => {
                await new Promise(r => setTimeout(r, 10));
                results.push('async');
            });
            await bus.emitAsync('test');
            expect(results).toEqual(['async']);
        });

        it('isolates errors in async listeners', async () => {
            const fn = vi.fn();
            bus.on('test', async () => { throw new Error('async fail'); });
            bus.on('test', fn);
            await bus.emitAsync('test');
            expect(fn).toHaveBeenCalledOnce();
        });
    });

    // ─── clear ──────────────────────────────────────────────────────

    describe('clear', () => {
        it('clears specific event', () => {
            bus.on('eventA', vi.fn());
            bus.on('eventB', vi.fn());
            bus.clear('eventA');
            expect(bus.getListenerCount('eventA')).toBe(0);
            expect(bus.getListenerCount('eventB')).toBe(1);
        });

        it('clears all events', () => {
            bus.on('eventA', vi.fn());
            bus.on('eventB', vi.fn());
            bus.clear();
            expect(bus.getListenerCount('eventA')).toBe(0);
            expect(bus.getListenerCount('eventB')).toBe(0);
        });
    });

    // ─── getListenerCount ───────────────────────────────────────────

    describe('getListenerCount', () => {
        it('returns 0 for unknown event', () => {
            expect(bus.getListenerCount('nope')).toBe(0);
        });

        it('tracks after add/remove', () => {
            const fn = vi.fn();
            bus.on('test', fn);
            expect(bus.getListenerCount('test')).toBe(1);
            bus.off('test', fn);
            expect(bus.getListenerCount('test')).toBe(0);
        });
    });
});
