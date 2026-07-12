import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeadlessBrowser } from '../../lib/headless-browser.js';

afterEach(() => {
    vi.useRealTimers();
});

describe('HeadlessBrowser reload scheduling', () => {
    it('coalesces rapid rebuild notifications into one navigation', async () => {
        vi.useFakeTimers();
        const browser = new HeadlessBrowser();
        browser._navigateToPreview = vi.fn().mockResolvedValue();

        browser._scheduleReload();
        browser._scheduleReload();
        browser._scheduleReload();
        const reload = browser._reloadPromise;

        await vi.advanceTimersByTimeAsync(300);
        await reload;

        expect(browser._navigateToPreview).toHaveBeenCalledTimes(1);
        expect(browser._reloadPromise).toBeNull();
    });

    it('queues one follow-up reload when a rebuild arrives during navigation', async () => {
        vi.useFakeTimers();
        const browser = new HeadlessBrowser();
        let finishFirstReload;
        browser._navigateToPreview = vi.fn()
            .mockImplementationOnce(() => new Promise(resolve => { finishFirstReload = resolve; }))
            .mockResolvedValueOnce();

        browser._scheduleReload();
        const reload = browser._reloadPromise;
        await vi.advanceTimersByTimeAsync(300);
        browser._scheduleReload();
        finishFirstReload();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(300);
        await reload;

        expect(browser._navigateToPreview).toHaveBeenCalledTimes(2);
        expect(browser._reloadPromise).toBeNull();
    });
});
