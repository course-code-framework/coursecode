import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PUPPETEER_REVISIONS } from 'puppeteer-core';
import { Browser, computeExecutablePath, detectBrowserPlatform } from '@puppeteer/browsers';
import { HeadlessBrowser, ensureDownloadedBrowser } from '../../lib/headless-browser.js';

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
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(undefined)
        };

        await browser.screenshot({ scrollY: 420 });

        expect(content.scrollTop).toBe(420);
    });

    it('clears navigation focus on headings before capturing', async () => {
        const browser = new HeadlessBrowser();
        const heading = { getAttribute: vi.fn().mockReturnValue('-1'), blur: vi.fn() };
        const button = { getAttribute: vi.fn().mockReturnValue(null), blur: vi.fn() };
        browser.browser = {};
        browser.page = { screenshot: vi.fn().mockResolvedValue(Buffer.from('image')) };
        const runWithActive = (active) => (callback) => {
            const originalDocument = globalThis.document;
            globalThis.document = { activeElement: active, body: {} };
            try {
                return callback();
            } finally {
                globalThis.document = originalDocument;
            }
        };
        browser.courseFrame = {
            evaluate: vi.fn()
                .mockResolvedValueOnce(true)
                .mockImplementationOnce(runWithActive(heading))
                .mockResolvedValueOnce(true)
                .mockImplementationOnce(runWithActive(button))
        };

        await browser.screenshot();
        await browser.screenshot();

        expect(heading.blur).toHaveBeenCalledTimes(1);
        expect(button.blur).not.toHaveBeenCalled();
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
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(1400)
        };

        await browser.screenshot({ fullPage: true });

        expect(browser.page.setViewport).toHaveBeenNthCalledWith(1, { width: 1280, height: 1440 });
        expect(browser.page.setViewport).toHaveBeenNthCalledWith(2, { width: 1280, height: 720 });
        expect(iframeScreenshot).toHaveBeenCalledWith({ type: 'jpeg', quality: 50 });
    });
});

describe('HeadlessBrowser breakpoint viewports', () => {
    async function viewportFor(breakpoint) {
        const browser = new HeadlessBrowser();
        browser.browser = {};
        browser.page = { setViewport: vi.fn().mockResolvedValue() };
        browser._ensureCourseFrame = vi.fn().mockResolvedValue();
        browser.courseFrame = {
            evaluate: vi.fn().mockImplementation((callback, name) => {
                const breakpoints = [
                    { name: 'desktop', maxWidth: 1439 },
                    { name: 'tablet-portrait', maxWidth: 1023 },
                    { name: 'mobile-landscape', maxWidth: 767 },
                    { name: 'mobile-portrait', maxWidth: 479 }
                ];
                return breakpoints.find(b => b.name === name) || null;
            })
        };
        return browser.setViewport(breakpoint);
    }

    it('keeps landscape breakpoints at 16:9', async () => {
        expect(await viewportFor('desktop')).toEqual({ width: 1439, height: 809, breakpoint: 'desktop' });
        expect(await viewportFor('mobile-landscape')).toEqual({ width: 767, height: 431, breakpoint: 'mobile-landscape' });
    });

    it('makes portrait breakpoints taller than wide', async () => {
        expect(await viewportFor('mobile-portrait')).toEqual({ width: 479, height: 852, breakpoint: 'mobile-portrait' });
        expect(await viewportFor('tablet-portrait')).toEqual({ width: 1023, height: 1364, breakpoint: 'tablet-portrait' });
    });
});

describe('ensureDownloadedBrowser', () => {
    it('reuses a browser already in the cache without downloading', async () => {
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-browser-cache-'));
        try {
            const expected = computeExecutablePath({
                browser: Browser.CHROMEHEADLESSSHELL,
                buildId: PUPPETEER_REVISIONS['chrome-headless-shell'],
                platform: detectBrowserPlatform(),
                cacheDir
            });
            fs.mkdirSync(path.dirname(expected), { recursive: true });
            fs.writeFileSync(expected, '');
            const log = vi.fn();

            await expect(ensureDownloadedBrowser({ cacheDir, log })).resolves.toBe(expected);
            expect(log).not.toHaveBeenCalled();
        } finally {
            fs.rmSync(cacheDir, { recursive: true, force: true });
        }
    });
});
