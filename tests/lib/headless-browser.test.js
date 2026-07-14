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

describe('HeadlessBrowser screenshots', () => {
    it('scrolls the framework main content container', async () => {
        const browser = new HeadlessBrowser();
        const content = { scrollTop: 0 };
        browser.browser = {};
        browser.page = {
            screenshot: vi.fn().mockResolvedValue(Buffer.from('image'))
        };
        browser.courseFrame = {
            evaluate: vi.fn()
                .mockResolvedValueOnce(true)
                .mockImplementationOnce((callback, y) => {
                    const originalDocument = globalThis.document;
                    globalThis.document = {
                        querySelector: vi.fn(selector => selector === '#content' ? content : null),
                        documentElement: {}
                    };
                    try {
                        callback(y);
                    } finally {
                        globalThis.document = originalDocument;
                    }
                })
        };

        await browser.screenshot({ scrollY: 420 });

        expect(content.scrollTop).toBe(420);
    });

    it('expands full-page captures for main content and preview chrome', async () => {
        const browser = new HeadlessBrowser();
        const iframeScreenshot = vi.fn().mockResolvedValue(Buffer.from('image'));
        const iframe = {
            boundingBox: vi.fn().mockResolvedValue({ height: 680 }),
            screenshot: iframeScreenshot
        };
        browser.browser = {};
        browser.page = {
            setViewport: vi.fn().mockResolvedValue(),
            $: vi.fn().mockResolvedValue(iframe)
        };
        browser.courseFrame = {
            evaluate: vi.fn()
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(1400)
        };

        await browser.screenshot({ fullPage: true });

        expect(browser.page.setViewport).toHaveBeenNthCalledWith(1, { width: 1280, height: 1440 });
        expect(browser.page.setViewport).toHaveBeenNthCalledWith(2, { width: 1280, height: 720 });
        expect(iframeScreenshot).toHaveBeenCalledWith({ type: 'jpeg', quality: 50 });
    });
});
