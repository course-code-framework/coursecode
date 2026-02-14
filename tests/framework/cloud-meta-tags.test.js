/**
 * Cloud Config Meta Tag Priority Chain Tests
 *
 * Tests that all three external communication utilities (error-reporter,
 * data-reporter, course-channel) correctly implement the priority chain:
 *   1. <meta name="cc-*"> tags (cloud-injected) — highest priority
 *   2. environment.* in course-config.js — self-hosted fallback
 *   3. Skip — feature disabled
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOM + browser API simulation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** @type {Map<string, string>} Simulated meta tags */
let metaTags = new Map();

function installBrowserMocks() {
    // Meta tag simulation
    if (!globalThis.document) globalThis.document = {};
    globalThis.document.querySelector = vi.fn((selector) => {
        const match = selector.match(/meta\[name="([^"]+)"\]/);
        if (!match) return null;
        const name = match[1];
        if (!metaTags.has(name)) return null;
        return { getAttribute: (attr) => attr === 'content' ? metaTags.get(name) : null };
    });

    // Navigator — userAgent is read-only in Node, so use defineProperty
    try { Object.defineProperty(globalThis.navigator, 'userAgent', { value: 'vitest/1.0', configurable: true }); }
    catch { /* already defined or not writable — fine, Node has a default */ }
    if (!globalThis.navigator.sendBeacon) {
        globalThis.navigator.sendBeacon = vi.fn(() => true);
    }

    // Window
    if (!globalThis.window) globalThis.window = globalThis;
    try { Object.defineProperty(globalThis.window, 'location', { value: { href: 'http://localhost:4173/test' }, configurable: true, writable: true }); }
    catch { /* already writable */ }
    globalThis.window.addEventListener = vi.fn();
    globalThis.window.CourseCode = {};
}

function setMetaTags(tags) {
    metaTags = new Map(Object.entries(tags));
}

function clearMetaTags() {
    metaTags.clear();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shared mocks (hoisted)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

vi.mock('../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

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

import { eventBus } from '../../framework/js/core/event-bus.js';


// ═══════════════════════════════════════════════════════════════════════
// Error Reporter
// ═══════════════════════════════════════════════════════════════════════

describe('error-reporter: cloud meta tag priority chain', () => {
    let initErrorReporter, isUserReportingEnabled;
    let fetchSpy;

    beforeEach(async () => {
        vi.clearAllMocks();
        eventBus._reset();
        vi.resetModules();
        clearMetaTags();
        installBrowserMocks();

        fetchSpy = vi.fn(() => Promise.resolve({ ok: true }));
        globalThis.fetch = fetchSpy;

        vi.doMock('../../framework/js/utilities/logger.js', () => ({
            logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
        }));
        vi.doMock('../../framework/js/core/event-bus.js', () => ({ eventBus }));

        const mod = await import('../../framework/js/utilities/error-reporter.js');
        initErrorReporter = mod.initErrorReporter;
        isUserReportingEnabled = mod.isUserReportingEnabled;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('uses meta tag endpoint when cc-error-endpoint is present', () => {
        setMetaTags({ 'cc-error-endpoint': 'https://cloud.example.com/errors' });

        initErrorReporter({ environment: {} });

        // Should have subscribed to events (endpoint is configured)
        expect(eventBus.on).toHaveBeenCalledWith('log:error', expect.any(Function));
    });

    it('falls back to config when no meta tags present', () => {
        initErrorReporter({
            environment: {
                errorReporting: { endpoint: 'https://self-hosted.example.com/errors' }
            }
        });

        expect(eventBus.on).toHaveBeenCalledWith('log:error', expect.any(Function));
    });

    it('disables when both meta tags and config are absent', () => {
        initErrorReporter({ environment: {} });

        expect(eventBus.on).not.toHaveBeenCalled();
        expect(isUserReportingEnabled()).toBe(false);
    });

    it('meta tag wins when both meta tag and config are present', async () => {
        vi.useFakeTimers();

        setMetaTags({ 'cc-error-endpoint': 'https://cloud.example.com/errors' });

        initErrorReporter({
            environment: {
                errorReporting: { endpoint: 'https://self-hosted.example.com/errors' }
            }
        });

        eventBus.emit('log:error', { domain: 'test', operation: 'priority', message: 'priority test' });

        // Advance past the 2-second batch window
        await vi.advanceTimersByTimeAsync(2100);

        expect(fetchSpy).toHaveBeenCalled();
        const [url] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://cloud.example.com/errors');
    });

    it('includes Authorization: Bearer header when cc-api-key is present', async () => {
        vi.useFakeTimers();

        setMetaTags({
            'cc-error-endpoint': 'https://cloud.example.com/errors',
            'cc-api-key': 'sk_live_test123'
        });

        initErrorReporter({ environment: {} });

        eventBus.emit('log:error', { domain: 'test', operation: 'auth', message: 'auth test' });

        await vi.advanceTimersByTimeAsync(2100);

        expect(fetchSpy).toHaveBeenCalled();
        const [, options] = fetchSpy.mock.calls[0];
        expect(options.headers['Authorization']).toBe('Bearer sk_live_test123');
    });

    it('includes licenseId and courseId attribution in payloads', async () => {
        vi.useFakeTimers();

        setMetaTags({
            'cc-error-endpoint': 'https://cloud.example.com/errors',
            'cc-license-id': 'lic_xyz',
            'cc-course-id': 'course_456'
        });

        initErrorReporter({ environment: {} });

        eventBus.emit('log:error', { domain: 'test', operation: 'attr', message: 'attr test' });

        await vi.advanceTimersByTimeAsync(2100);

        expect(fetchSpy).toHaveBeenCalled();
        const [, options] = fetchSpy.mock.calls[0];
        const body = JSON.parse(options.body);
        expect(body.licenseId).toBe('lic_xyz');
        expect(body.courseId).toBe('course_456');
    });

    it('omits attribution fields when meta tags not present', async () => {
        vi.useFakeTimers();

        initErrorReporter({
            environment: {
                errorReporting: { endpoint: 'https://self-hosted.example.com/errors' }
            }
        });

        eventBus.emit('log:error', { domain: 'test', operation: 'noattr', message: 'no attr' });

        await vi.advanceTimersByTimeAsync(2100);

        expect(fetchSpy).toHaveBeenCalled();
        const [, options] = fetchSpy.mock.calls[0];
        const body = JSON.parse(options.body);
        expect(body.licenseId).toBeUndefined();
        expect(body.courseId).toBeUndefined();
    });
});


// ═══════════════════════════════════════════════════════════════════════
// Data Reporter
// ═══════════════════════════════════════════════════════════════════════

describe('data-reporter: cloud meta tag priority chain', () => {
    let initDataReporter;
    let fetchSpy;

    beforeEach(async () => {
        vi.clearAllMocks();
        eventBus._reset();
        vi.resetModules();
        clearMetaTags();
        installBrowserMocks();

        fetchSpy = vi.fn(() => Promise.resolve({ ok: true }));
        globalThis.fetch = fetchSpy;

        vi.doMock('../../framework/js/utilities/logger.js', () => ({
            logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
        }));
        vi.doMock('../../framework/js/core/event-bus.js', () => ({ eventBus }));

        const mod = await import('../../framework/js/utilities/data-reporter.js');
        initDataReporter = mod.initDataReporter;
    });

    it('uses meta tag endpoint when cc-data-endpoint is present', () => {
        setMetaTags({ 'cc-data-endpoint': 'https://cloud.example.com/data' });

        initDataReporter({ environment: {} });

        expect(eventBus.on).toHaveBeenCalledWith('assessment:submitted', expect.any(Function));
    });

    it('falls back to config when no meta tags present', () => {
        initDataReporter({
            environment: {
                dataReporting: { endpoint: 'https://self-hosted.example.com/data' }
            }
        });

        expect(eventBus.on).toHaveBeenCalledWith('assessment:submitted', expect.any(Function));
    });

    it('disables when both meta tags and config are absent', () => {
        initDataReporter({ environment: {} });

        expect(eventBus.on).not.toHaveBeenCalled();
    });

    it('meta tag wins when both meta tag and config are present', async () => {
        vi.useFakeTimers();

        setMetaTags({ 'cc-data-endpoint': 'https://cloud.example.com/data' });

        initDataReporter({
            environment: {
                dataReporting: { endpoint: 'https://self-hosted.example.com/data', batchSize: 1 }
            }
        });

        // Queue a record
        eventBus.emit('assessment:submitted', {
            assessmentId: 'quiz-1',
            results: { scorePercentage: 90, passed: true, attemptNumber: 1, totalQuestions: 10, correctCount: 9 }
        });

        // Advance past the default flush interval
        await vi.advanceTimersByTimeAsync(31000);

        expect(fetchSpy).toHaveBeenCalled();
        const [url] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://cloud.example.com/data');

        vi.useRealTimers();
    });

    it('includes Authorization: Bearer header when cc-api-key is present', async () => {
        vi.useFakeTimers();

        setMetaTags({
            'cc-data-endpoint': 'https://cloud.example.com/data',
            'cc-api-key': 'sk_live_data_key'
        });

        initDataReporter({ environment: {} });

        eventBus.emit('assessment:submitted', {
            assessmentId: 'quiz-auth',
            results: { scorePercentage: 80, passed: true, attemptNumber: 1, totalQuestions: 5, correctCount: 4 }
        });

        await vi.advanceTimersByTimeAsync(31000);

        expect(fetchSpy).toHaveBeenCalled();
        const [, options] = fetchSpy.mock.calls[0];
        expect(options.headers['Authorization']).toBe('Bearer sk_live_data_key');

        vi.useRealTimers();
    });

    it('includes licenseId and courseId attribution in payloads', async () => {
        vi.useFakeTimers();

        setMetaTags({
            'cc-data-endpoint': 'https://cloud.example.com/data',
            'cc-license-id': 'lic_data_test',
            'cc-course-id': 'course_data_789'
        });

        initDataReporter({ environment: {} });

        eventBus.emit('assessment:submitted', {
            assessmentId: 'quiz-attr',
            results: { scorePercentage: 75, passed: true, attemptNumber: 1, totalQuestions: 4, correctCount: 3 }
        });

        await vi.advanceTimersByTimeAsync(31000);

        expect(fetchSpy).toHaveBeenCalled();
        const [, options] = fetchSpy.mock.calls[0];
        const body = JSON.parse(options.body);
        expect(body.licenseId).toBe('lic_data_test');
        expect(body.courseId).toBe('course_data_789');

        vi.useRealTimers();
    });
});


// ═══════════════════════════════════════════════════════════════════════
// Course Channel
// ═══════════════════════════════════════════════════════════════════════

describe('course-channel: cloud meta tag priority chain', () => {
    let initCourseChannel, sendChannelMessage;
    let fetchSpy;

    beforeEach(async () => {
        vi.clearAllMocks();
        eventBus._reset();
        vi.resetModules();
        clearMetaTags();
        installBrowserMocks();

        fetchSpy = vi.fn(() => Promise.resolve({ ok: true }));
        globalThis.fetch = fetchSpy;

        // EventSource mock — must be a constructor function (not arrow)
        globalThis.EventSource = function MockEventSource(url) {
            this.url = url;
            this.readyState = 1; // OPEN
            this.close = vi.fn();
            this.onopen = null;
            this.onmessage = null;
            this.onerror = null;
            // Track calls for assertions
            globalThis.EventSource._lastInstance = this;
            globalThis.EventSource._calls.push(url);
        };
        globalThis.EventSource.OPEN = 1;
        globalThis.EventSource.CLOSED = 2;
        globalThis.EventSource._calls = [];
        globalThis.EventSource._lastInstance = null;

        vi.doMock('../../framework/js/utilities/logger.js', () => ({
            logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
        }));
        vi.doMock('../../framework/js/core/event-bus.js', () => ({ eventBus }));

        const mod = await import('../../framework/js/utilities/course-channel.js');
        initCourseChannel = mod.initCourseChannel;
        sendChannelMessage = mod.sendChannelMessage;
    });

    it('uses meta tag endpoint when both cc-channel-endpoint and cc-channel-id present', () => {
        setMetaTags({
            'cc-channel-endpoint': 'https://cloud.example.com/channel',
            'cc-channel-id': 'session-abc123'
        });

        initCourseChannel({ environment: {} });

        expect(globalThis.EventSource._calls.length).toBe(1);
        const sseUrl = globalThis.EventSource._calls[0];
        expect(sseUrl).toContain('cloud.example.com/channel');
        expect(sseUrl).toContain('session-abc123');
    });

    it('falls back to config when no meta tags present', () => {
        initCourseChannel({
            environment: {
                channel: {
                    endpoint: 'https://self-hosted.example.com/channel',
                    channelId: 'local-session'
                }
            }
        });

        expect(globalThis.EventSource._calls.length).toBe(1);
        const sseUrl = globalThis.EventSource._calls[0];
        expect(sseUrl).toContain('self-hosted.example.com');
    });

    it('disables when both meta tags and config are absent', () => {
        initCourseChannel({ environment: {} });

        expect(globalThis.EventSource._calls.length).toBe(0);
    });

    it('requires both endpoint AND channelId meta tags — endpoint alone is not enough', () => {
        setMetaTags({
            'cc-channel-endpoint': 'https://cloud.example.com/channel'
            // cc-channel-id intentionally missing
        });

        initCourseChannel({ environment: {} });

        expect(globalThis.EventSource._calls.length).toBe(0);
    });

    it('meta tag wins when both meta tag and config are present', () => {
        setMetaTags({
            'cc-channel-endpoint': 'https://cloud.example.com/channel',
            'cc-channel-id': 'cloud-session'
        });

        initCourseChannel({
            environment: {
                channel: {
                    endpoint: 'https://self-hosted.example.com/channel',
                    channelId: 'local-session'
                }
            }
        });

        const sseUrl = globalThis.EventSource._calls[0];
        expect(sseUrl).toContain('cloud.example.com');
        expect(sseUrl).toContain('cloud-session');
        expect(sseUrl).not.toContain('self-hosted');
    });

    it('includes api key as URL param on SSE and Authorization header on POST', async () => {
        setMetaTags({
            'cc-channel-endpoint': 'https://cloud.example.com/channel',
            'cc-channel-id': 'session-auth',
            'cc-api-key': 'sk_live_channel_key'
        });

        initCourseChannel({ environment: {} });

        // SSE: api key as URL param (EventSource doesn't support headers)
        const sseUrl = globalThis.EventSource._calls[0];
        expect(sseUrl).toContain('token=sk_live_channel_key');

        // POST: Authorization header
        await sendChannelMessage({ type: 'test', data: 'hello' });
        expect(fetchSpy).toHaveBeenCalled();
        const [, options] = fetchSpy.mock.calls[0];
        expect(options.headers['Authorization']).toBe('Bearer sk_live_channel_key');
    });
});
