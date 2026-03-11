import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use a fresh EventBus instance per test (not the singleton)
import { EventBus } from '../framework/js/core/event-bus.js';

// Mock dependencies — logger and generateId
vi.mock('../framework/js/utilities/logger.js', () => ({
    logger: {
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        info: vi.fn()
    }
}));

vi.mock('../framework/js/utilities/utilities.js', () => ({
    generateId: vi.fn((prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`)
}));

describe('EventBus error cascade prevention', () => {
    let bus;

    beforeEach(() => {
        bus = new EventBus();
        vi.clearAllMocks();
    });

    it('handles circular references in :error event data without throwing', () => {
        const listener = vi.fn();
        bus.on('scorm:error', listener);

        const data = { domain: 'scorm', operation: 'GetValue' };
        data.self = data; // circular reference

        expect(() => bus.emit('scorm:error', data)).not.toThrow();
        expect(listener).toHaveBeenCalledWith(data);
    });

    it('handles raw Error objects in :error event data without throwing', () => {
        const listener = vi.fn();
        bus.on('scorm:error', listener);

        const error = new Error('SCORM 403');
        error.code = 403;
        const data = { domain: 'scorm', operation: 'GetValue', error };

        expect(() => bus.emit('scorm:error', data)).not.toThrow();
        expect(listener).toHaveBeenCalledWith(data);
    });

    it('suppresses recursive :error emissions (re-entrancy guard)', () => {
        // Listener emits another :error event — should be suppressed
        const innerListener = vi.fn();
        bus.on('inner:error', innerListener);

        bus.on('outer:error', () => {
            bus.emit('inner:error', { message: 'recursive' });
        });

        bus.emit('outer:error', { message: 'original' });

        // Inner listener should NOT be called because the re-entrancy guard suppresses it
        expect(innerListener).not.toHaveBeenCalled();
    });

    it('re-enables error emission after the original :error completes', () => {
        const listener = vi.fn();
        bus.on('test:error', listener);

        bus.emit('test:error', { message: 'first' });
        bus.emit('test:error', { message: 'second' });

        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('handles listener that throws without breaking other listeners', () => {
        const listener1 = vi.fn(() => { throw new Error('listener boom'); });
        const listener2 = vi.fn();

        bus.on('test:event', listener1);
        bus.on('test:event', listener2);

        expect(() => bus.emit('test:event', { data: 1 })).not.toThrow();
        expect(listener2).toHaveBeenCalled();
    });

    it('handles unserializable data in :error events gracefully', () => {
        const listener = vi.fn();
        bus.on('test:error', listener);

        // BigInt is not serializable by JSON.stringify
        const data = { value: BigInt(42) };

        expect(() => bus.emit('test:error', data)).not.toThrow();
        expect(listener).toHaveBeenCalledWith(data);
    });

    it('does not affect non-error events', () => {
        const listener = vi.fn();
        bus.on('state:changed', listener);

        const data = { domain: 'navigation', slide: 'intro' };
        bus.emit('state:changed', data);

        expect(listener).toHaveBeenCalledWith(data);
    });

    it('truncates oversized error data', async () => {
        const { logger } = await import('../framework/js/utilities/logger.js');
        const listener = vi.fn();
        bus.on('test:error', listener);

        // Create data that will produce a very large JSON string
        const data = { big: 'x'.repeat(10000) };
        bus.emit('test:error', data);

        // The logger should have been called with truncated output
        const loggedData = logger.error.mock.calls[0][1];
        expect(loggedData.length).toBeLessThan(10000);
        expect(loggedData).toContain('...[truncated]');
    });
});
