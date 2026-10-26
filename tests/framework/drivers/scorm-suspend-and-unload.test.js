import { describe, expect, it, vi } from 'vitest';
import LZString from 'lz-string';
import {
    Scorm2004Driver,
    decodeScorm2004SuspendState,
    encodeScorm2004SuspendState
} from '../../../framework/js/drivers/scorm-2004-driver.js';
import { Scorm12Driver } from '../../../framework/js/drivers/scorm-12-driver.js';
import { ProxyDriver } from '../../../framework/js/drivers/proxy-driver.js';

function create2004Driver(initialSuspendData = '') {
    const driver = new Scorm2004Driver();
    const values = { 'cmi.suspend_data': initialSuspendData };
    driver._isConnected = true;
    driver._setValue = vi.fn((key, value) => { values[key] = value; });
    driver._getValue = key => values[key] || '';
    return { driver, values };
}

describe('SCORM 2004 suspend_data encoding', () => {
    it('writes a prefixed ASCII-only encoding and round-trips Unicode state', () => {
        const { driver, values } = create2004Driver();
        const state = { note: 'Résumé 日本語 \u0085', nested: { complete: true } };

        driver.setSuspendData(state);

        expect(values['cmi.suspend_data']).toMatch(/^CC04:/);
        expect([...values['cmi.suspend_data']].every(char => char.charCodeAt(0) <= 127)).toBe(true);
        expect(driver.getSuspendData()).toEqual(state);
    });

    it('still reads legacy UTF-16 lz-string state', () => {
        const state = { navigation: { visitedSlides: ['a', 'b'] } };
        const { driver } = create2004Driver(LZString.compressToUTF16(JSON.stringify(state)));

        expect(driver.getSuspendData()).toEqual(state);
    });

    it('marks undecodable state as corrupt so hydration can recover', () => {
        expect(() => decodeScorm2004SuspendState('CC04:@@not-valid@@')).toThrow(
            expect.objectContaining({ code: 'SUSPEND_DATA_CORRUPT' })
        );
    });

    it('trims optional data instead of failing when state exceeds 64000 characters', () => {
        const { driver, values } = create2004Driver();
        const noise = Array.from({ length: 30000 }, (_, i) => ((i * 7919) % 104729).toString(36)).join('');
        const state = {
            navigation: { visitedSlides: ['a', 'b'] },
            interactions: [{ id: 'q1', learner_response: noise }]
        };
        expect(encodeScorm2004SuspendState(state).length).toBeGreaterThan(64000);

        driver.setSuspendData(state);

        expect(values['cmi.suspend_data'].length).toBeLessThanOrEqual(64000);
        expect(driver.getSuspendData()).toEqual({ navigation: { visitedSlides: ['a', 'b'] } });
    });

    it('throws a coded overflow without writing when resume-core state cannot fit', () => {
        const { driver } = create2004Driver();
        const noise = Array.from({ length: 30000 }, (_, i) => ((i * 7919) % 104729).toString(36)).join('');

        expect(() => driver.setSuspendData({ flags: { noise } })).toThrow(
            expect.objectContaining({ code: 'SUSPEND_DATA_OVERFLOW' })
        );
        expect(driver._setValue).not.toHaveBeenCalled();
    });
});

describe('ProxyDriver suspend_data', () => {
    it('writes the ASCII-safe SCORM 2004 encoding through the bridge', () => {
        const driver = new ProxyDriver('scorm2004');
        driver._isConnected = true;
        driver._sendSetValue = vi.fn();

        driver.setSuspendData({ navigation: { visitedSlides: ['a'] } });

        const [, value] = driver._sendSetValue.mock.calls[0];
        expect(value).toMatch(/^CC04:/);
        expect(decodeScorm2004SuspendState(value)).toEqual({ navigation: { visitedSlides: ['a'] } });
    });

    it('surfaces corrupt prefetched state as SUSPEND_DATA_CORRUPT instead of failing initialization', async () => {
        const driver = new ProxyDriver('scorm2004');
        driver._isConnected = true;
        driver._sendMessage = vi.fn(async (_method, key) => (key === 'cmi.suspend_data' ? 'CC04:@@corrupt@@' : ''));

        await driver._prefetch();
        expect(() => driver.getSuspendData()).toThrow(expect.objectContaining({ code: 'SUSPEND_DATA_CORRUPT' }));
    });
});

describe('SCORM emergencySave on pagehide', () => {
    function createScorm(overrides = {}) {
        return {
            save: vi.fn(() => true),
            quit: vi.fn(() => true),
            ...overrides
        };
    }

    it.each([
        ['SCORM 1.2', () => new Scorm12Driver()],
        ['SCORM 2004', () => new Scorm2004Driver()]
    ])('%s commits and terminates synchronously', (_label, createDriver) => {
        const driver = createDriver();
        driver._isConnected = true;
        driver._scorm = createScorm();

        driver.emergencySave();

        expect(driver._scorm.save).toHaveBeenCalledOnce();
        expect(driver._scorm.quit).toHaveBeenCalledOnce();
        expect(driver.isTerminated()).toBe(true);
    });

    it('still terminates when the emergency commit fails, then reports the failure', () => {
        const driver = new Scorm12Driver();
        driver._isConnected = true;
        driver._scorm = createScorm({ save: vi.fn(() => false) });

        expect(() => driver.emergencySave()).toThrow(/emergency commit failed/);
        expect(driver._scorm.quit).toHaveBeenCalledOnce();
        expect(driver.isTerminated()).toBe(true);
    });

    it('makes a later async terminate a no-op (no double LMSFinish)', async () => {
        const driver = new Scorm12Driver();
        driver._isConnected = true;
        driver._scorm = createScorm();

        driver.emergencySave();
        await driver.terminate();

        expect(driver._scorm.quit).toHaveBeenCalledOnce();
    });
});
