import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StandaloneDriver } from '../../../framework/js/drivers/standalone-driver.js';
import { validateDriverInterface } from '../../../framework/js/drivers/driver-interface.js';

function createStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
        clear: () => values.clear()
    };
}

describe('StandaloneDriver', () => {
    beforeEach(() => {
        globalThis.document = {
            title: 'Portable Test Course',
            querySelector: () => ({ content: 'portable-test:1.0' })
        };
        globalThis.localStorage = createStorage();
    });

    afterEach(() => {
        delete globalThis.document;
        delete globalThis.localStorage;
    });

    it('restores bookmark, status, score, and suspend data from local storage', async () => {
        const first = new StandaloneDriver();
        expect(() => validateDriverInterface(first)).not.toThrow();
        expect(first.getFormat()).toBe('standalone');
        await first.initialize();
        first.setBookmark('lesson-2');
        first.reportCompletion('completed');
        first.reportSuccess('passed');
        first.reportScore({ scaled: 0.85 });
        first.setSuspendData({ visited: ['lesson-1', 'lesson-2'] });
        await first.terminate();

        const restored = new StandaloneDriver();
        await restored.initialize();

        expect(restored.getEntryMode()).toBe('resume');
        expect(restored.getBookmark()).toBe('lesson-2');
        expect(restored.getCompletion()).toBe('completed');
        expect(restored.getSuccess()).toBe('passed');
        expect(restored.getScore()).toEqual({ scaled: 0.85, raw: 85, min: 0, max: 100 });
        expect(restored.getSuspendData()).toEqual({ visited: ['lesson-1', 'lesson-2'] });
    });

    it('continues in memory when browser storage is unavailable', async () => {
        globalThis.localStorage = {
            getItem() { throw new Error('blocked'); },
            setItem() { throw new Error('blocked'); }
        };

        const driver = new StandaloneDriver();
        await expect(driver.initialize()).resolves.toBe(true);
        driver.setBookmark('lesson-1');

        expect(driver.getBookmark()).toBe('lesson-1');
        await expect(driver.commit()).resolves.toBe(true);
    });

    it('recovers from corrupted saved progress', async () => {
        const driver = new StandaloneDriver();
        localStorage.setItem(driver._storageKey, '{not-json');

        await driver.initialize();
        driver.setBookmark('fresh-start');

        expect(driver.getBookmark()).toBe('fresh-start');
        expect(JSON.parse(localStorage.getItem(driver._storageKey)).bookmark).toBe('fresh-start');
    });
});
