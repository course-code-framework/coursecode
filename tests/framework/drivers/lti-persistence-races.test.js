import { afterEach, describe, expect, it, vi } from 'vitest';
import { LtiDriver } from '../../../framework/js/drivers/lti-driver.js';

function createDriver() {
    const driver = new LtiDriver();
    driver._isConnected = true;
    driver._mock = false;
    driver._stateEndpoint = '/api/lti/state';
    driver._agsProxyEndpoint = '/api/lti/score';
    driver._claims = {
        iss: 'https://platform.example.com',
        sub: 'user-123',
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id': 'deployment-1',
        'https://purl.imsglobal.org/spec/lti/claim/resource_link': { id: 'resource-1' }
    };
    return driver;
}

function deferredResponse() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve: () => resolve({ ok: true, status: 200 }) };
}

describe('LTI dirty-flag races', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('keeps suspend_data dirty when it changes while a state save is in flight', async () => {
        const driver = createDriver();
        const inFlight = deferredResponse();
        const fetchMock = vi.fn()
            .mockImplementationOnce(() => inFlight.promise)
            .mockResolvedValue({ ok: true, status: 200 });
        vi.stubGlobal('fetch', fetchMock);

        driver.setSuspendData({ version: 1 });
        const saving = driver._persistState();
        driver.setSuspendData({ version: 2 });
        inFlight.resolve();
        await saving;

        expect(driver._suspendDataDirty).toBe(true);
        await driver._persistState();
        expect(JSON.parse(fetchMock.mock.calls.at(-1)[1].body).suspendData).toEqual({ version: 2 });
    });

    it('restores dirty flags when the state save fails', async () => {
        const driver = createDriver();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Unavailable' }));
        driver.setSuspendData({ version: 1 });
        driver.setBookmark('slide-2');

        await expect(driver._persistState()).rejects.toThrow(/State persistence failed/);
        expect(driver._suspendDataDirty).toBe(true);
        expect(driver._bookmarkDirty).toBe(true);
    });

    it('keeps the grade pending when a new score arrives while the AGS post is in flight', async () => {
        const driver = createDriver();
        const agsPost = deferredResponse();
        const fetchMock = vi.fn(url => (url === '/api/lti/score' && fetchMock.mock.calls.length === 1
            ? agsPost.promise
            : Promise.resolve({ ok: true, status: 200 })));
        vi.stubGlobal('fetch', fetchMock);

        driver.reportScore({ scaled: 0.5 });
        const flushing = driver._flushGrade();
        driver.reportScore({ scaled: 0.9 });
        agsPost.resolve();
        await flushing;

        expect(driver._gradeDirty).toBe(true);
        await driver._flushGrade();
        const scorePosts = fetchMock.mock.calls.filter(([url]) => url === '/api/lti/score');
        expect(JSON.parse(scorePosts.at(-1)[1].body).scoreGiven).toBe(90);
        expect(driver._gradeDirty).toBe(false);
    });

    it('re-marks the grade dirty when the AGS post fails', async () => {
        const driver = createDriver();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, statusText: 'Bad Gateway' }));
        driver.reportScore({ scaled: 0.7 });

        await expect(driver._flushGrade()).rejects.toThrow(/AGS proxy rejected score/);
        expect(driver._gradeDirty).toBe(true);
    });
});

describe('LTI emergency save', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('flushes the pending grade with keepalive before state beacons', () => {
        const driver = createDriver();
        const order = [];
        vi.stubGlobal('fetch', vi.fn((url, options) => {
            order.push(`fetch:${url}`);
            expect(options.keepalive).toBe(true);
            expect(options.credentials).toBe('same-origin');
            return Promise.resolve({ ok: true });
        }));
        vi.stubGlobal('navigator', {
            sendBeacon: vi.fn(() => { order.push('beacon'); return true; })
        });
        driver.reportCompletion('completed');
        driver.reportScore({ scaled: 0.8 });
        driver.setSuspendData({ navigation: { visitedSlides: ['a'] } });

        driver.emergencySave();

        expect(order).toEqual(['fetch:/api/lti/score', 'beacon', 'beacon']);
    });

    it('never throws when the keepalive fetch throws synchronously', () => {
        const driver = createDriver();
        vi.stubGlobal('fetch', vi.fn(() => { throw new TypeError('keepalive quota exceeded'); }));
        vi.stubGlobal('navigator', { sendBeacon: vi.fn(() => true) });
        driver.reportScore({ scaled: 0.8 });

        expect(() => driver.emergencySave()).not.toThrow();
        expect(navigator.sendBeacon).toHaveBeenCalled();
    });
});
