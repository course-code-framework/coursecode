import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

import { ProxyDriver } from '../../../framework/js/drivers/proxy-driver.js';
import { logger } from '../../../framework/js/utilities/logger.js';

describe('ProxyDriver lifecycle', () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    let parent;

    beforeEach(() => {
        vi.clearAllMocks();
        parent = { postMessage: vi.fn() };
        globalThis.window = {
            parent,
            location: { ancestorOrigins: [] },
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        };
        globalThis.document = { referrer: '' };
    });

    afterEach(() => {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    });

    it('establishes a nonce-bound parent origin when referrer is unavailable', async () => {
        const driver = new ProxyDriver();
        driver._startListening();
        const handler = globalThis.window.addEventListener.mock.calls[0][1];
        const handshake = driver._establishHandshake('*');
        const request = parent.postMessage.mock.calls[0][0];

        handler({
            source: parent,
            origin: 'https://lms.example',
            data: {
                type: 'scorm-proxy-handshake-response',
                nonce: request.nonce,
                baseFormat: 'scorm1.2'
            }
        });

        await expect(handshake).resolves.toBe(true);
        expect(driver._parentOrigin).toBe('https://lms.example');
    });

    it('removes its message listener after termination', async () => {
        const driver = new ProxyDriver();
        driver._parentOrigin = 'https://lms.example';
        driver._isConnected = true;
        driver._startListening();

        const handler = globalThis.window.addEventListener.mock.calls[0][1];
        const termination = driver.terminate();
        await Promise.resolve();
        const request = parent.postMessage.mock.calls[0][0];
        handler({
            source: parent,
            origin: 'https://lms.example',
            data: {
                type: 'scorm-proxy-response',
                id: request.id,
                result: true
            }
        });

        await expect(termination).resolves.toBe(true);
        expect(globalThis.window.removeEventListener).toHaveBeenCalledWith('message', handler);
    });

    it('cleans up a pending request when postMessage throws synchronously', async () => {
        const driver = new ProxyDriver();
        driver._parentOrigin = 'https://lms.example';
        parent.postMessage.mockImplementation(() => {
            throw new Error('frame detached');
        });

        await expect(driver._sendMessage('Commit')).rejects.toThrow('frame detached');

        expect(driver._pending.size).toBe(0);
    });

    it('maps SCORM 1.2 semantic writes to native 1.2 CMI fields', async () => {
        const driver = new ProxyDriver('scorm1.2');
        driver._isConnected = true;
        driver._supportsInteractions = true;
        driver._sendMessage = vi.fn().mockResolvedValue(true);

        driver.reportCompletion('completed');
        driver.reportSuccess('passed');
        driver.reportSessionTime('PT1H2M3S');
        driver.reportInteraction({
            id: 'q1',
            type: 'choice',
            learner_response: 'a',
            timestamp: '2026-07-12T11:22:33Z',
            latency: 'PT4S',
            result: 'correct'
        });
        await driver.commit();

        const writes = driver._sendMessage.mock.calls
            .filter(call => call[0] === 'SetValue')
            .map(([, key, value]) => [key, value]);
        expect(writes).toContainEqual(['cmi.core.lesson_status', 'passed']);
        expect(writes).toContainEqual(['cmi.core.session_time', '0001:02:03']);
        expect(writes).toContainEqual(['cmi.interactions.0.student_response', 'a']);
        expect(writes).toContainEqual(['cmi.interactions.0.time', '11:22:33']);
        expect(writes).toContainEqual(['cmi.interactions.0.latency', '0000:00:04']);
    });

    it('surfaces rejected fire-and-forget writes at commit', async () => {
        const driver = new ProxyDriver();
        driver._isConnected = true;
        driver._sendMessage = vi.fn((method) => Promise.resolve(method === 'SetValue' ? false : true));

        driver.setBookmark('slide-2');
        await expect(driver.commit()).rejects.toThrow(/rejected SetValue/);
    });

    it('reports emergency transport failures with structured context', () => {
        const driver = new ProxyDriver('scorm1.2');
        driver._isConnected = true;
        driver._parentOrigin = 'https://lms.example';
        parent.postMessage.mockImplementation(() => {
            throw new Error('frame detached');
        });

        driver.emergencySave();

        expect(logger.error).toHaveBeenCalledWith(
            'ProxyDriver: Emergency save message failed',
            expect.objectContaining({
                domain: 'scorm-proxy',
                operation: 'emergencySave',
                format: 'scorm1.2-proxy',
                error: 'frame detached'
            })
        );
    });

    it('fails closed when required resume data cannot be read', async () => {
        const driver = new ProxyDriver('scorm2004');
        driver._sendMessage = vi.fn((_method, key) => {
            if (key === 'cmi.suspend_data') return Promise.reject(new Error('LMS read failed'));
            return Promise.resolve('');
        });

        await expect(driver._prefetch()).rejects.toThrow(/required LMS value cmi\.suspend_data/);
    });

    it('continues when an optional native score field is unavailable', async () => {
        const driver = new ProxyDriver('scorm2004');
        driver._sendMessage = vi.fn((_method, key) => {
            if (key === 'cmi.score.scaled') return Promise.reject(new Error('unsupported'));
            return Promise.resolve('');
        });

        await expect(driver._prefetch()).resolves.toBeUndefined();
        expect(driver.getScore()).toBeNull();
    });
});
