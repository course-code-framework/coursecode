import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionLog } from '../../../framework/js/state/transaction-log.js';

describe('TransactionLog', () => {
    let log;

    beforeEach(() => {
        log = new TransactionLog(5); // small buffer for easy testing
    });

    // ─── record ─────────────────────────────────────────────────────

    describe('record', () => {
        it('records entries with timestamp', () => {
            log.record('navigation', 'set', { key: 'currentSlide' });
            const entries = log.getRecent(1);
            expect(entries).toHaveLength(1);
            expect(entries[0].domain).toBe('navigation');
            expect(entries[0].action).toBe('set');
            expect(entries[0].key).toBe('currentSlide');
            expect(entries[0].timestamp).toBeTypeOf('number');
        });

        it('records metadata from spread', () => {
            log.record('engagement', 'update', { slideId: 'slide-1', value: 42 });
            const entry = log.getRecent(1)[0];
            expect(entry.slideId).toBe('slide-1');
            expect(entry.value).toBe(42);
        });
    });

    // ─── Ring buffer behavior ───────────────────────────────────────
    // CRITICAL: Must not grow unbounded — LMS sessions can be long

    describe('ring buffer', () => {
        it('wraps around at capacity, preserving most recent', () => {
            for (let i = 0; i < 8; i++) {
                log.record('domain', 'action', { index: i });
            }
            const entries = log.toArray();
            // Buffer size is 5, so only last 5 entries survive
            expect(entries).toHaveLength(5);
            // Most recent first
            expect(entries[0].index).toBe(7);
            expect(entries[4].index).toBe(3);
        });

        it('count never exceeds buffer size', () => {
            for (let i = 0; i < 100; i++) {
                log.record('domain', 'action');
            }
            expect(log.toArray()).toHaveLength(5);
        });
    });

    // ─── getRecent ──────────────────────────────────────────────────

    describe('getRecent', () => {
        it('returns requested number in reverse-chronological order', () => {
            log.record('a', '1');
            log.record('b', '2');
            log.record('c', '3');
            const recent = log.getRecent(2);
            expect(recent).toHaveLength(2);
            expect(recent[0].domain).toBe('c');
            expect(recent[1].domain).toBe('b');
        });

        it('returns all when n > count', () => {
            log.record('a', '1');
            const recent = log.getRecent(100);
            expect(recent).toHaveLength(1);
        });

        it('returns empty for fresh log', () => {
            expect(log.getRecent(10)).toEqual([]);
        });
    });
});
