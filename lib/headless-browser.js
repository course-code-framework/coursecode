/**
 * Persistent Headless Browser for MCP Runtime Tools
 * 
 * Manages a long-lived headless Chrome instance that loads the preview URL.
 * All runtime tools (state, navigate, interact, reset, screenshot) execute
 * directly in the browser via page.evaluate(), replacing the old WebSocket relay.
 * 
 * Uses puppeteer-core with the system-installed Chrome — no bundled browser.
 */

import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Find the Chrome executable on the current platform.
 * @returns {string|null} Path to Chrome or null if not found
 */
function findChrome() {
    // Allow explicit override
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
        return process.env.CHROME_PATH;
    }

    const platform = os.platform();
    const candidates = [];

    if (platform === 'darwin') {
        candidates.push(
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
        );
    } else if (platform === 'linux') {
        candidates.push(
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/snap/bin/chromium'
        );
    } else if (platform === 'win32') {
        const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
        const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        candidates.push(
            path.join(programFiles, 'Google/Chrome/Application/chrome.exe'),
            path.join(programFilesX86, 'Google/Chrome/Application/chrome.exe'),
            path.join(localAppData, 'Google/Chrome/Application/chrome.exe')
        );
    }

    return candidates.find(p => fs.existsSync(p)) || null;
}

/**
 * Persistent headless browser manager.
 * Singleton — one browser per MCP server session.
 */
class HeadlessBrowser {
    constructor() {
        this.browser = null;
        this.page = null;
        this.courseFrame = null;
        this.port = null;
        this.chromePath = null;
        this._sseReloadListener = null;
        this._reconnectTimer = null;
        this._stopped = false;
        this._consoleLogs = [];
        this._viewport = { width: 1280, height: 720 };
        /** @type {Promise<void>|null} Tracks an in-flight reload so tool calls wait for it */
        this._reloadPromise = null;
    }

    /**
     * Launch headless Chrome and navigate to the preview URL.
     * @param {number} port - Preview server port
     * @returns {Promise<void>}
     */
    async launch(port) {
        this.port = port;
        this.chromePath = findChrome();

        if (!this.chromePath) {
            throw new Error(
                'Chrome not found. Install Google Chrome or set CHROME_PATH environment variable.\n' +
                '  macOS: Install from https://www.google.com/chrome/\n' +
                '  Linux: apt install google-chrome-stable\n' +
                '  Windows: Install from https://www.google.com/chrome/'
            );
        }

        this._stopped = false;
        this.browser = await puppeteer.launch({
            executablePath: this.chromePath,
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-extensions',
                '--no-first-run',
                '--mute-audio'
            ]
        });

        this.page = await this.browser.newPage();
        await this.page.setViewport(this._viewport);

        // Capture console warnings and errors
        this._consoleLogs = [];
        this.page.on('console', msg => {
            const type = msg.type();
            if (type === 'warning' || type === 'error') {
                this._consoleLogs.push({
                    type,
                    text: msg.text(),
                    time: new Date().toISOString()
                });
                // Cap buffer
                if (this._consoleLogs.length > 50) this._consoleLogs.shift();
            }
        });

        // Navigate to preview and wait for course to load
        await this._navigateToPreview();

        // Listen for SSE reload events to auto-refresh on rebuild
        this._startReloadListener();
    }

    /**
     * Navigate to the preview URL and locate the course iframe.
     * @private
     */
    async _navigateToPreview() {
        // Clear stale console errors from the previous page load.
        // The page.goto() below will trigger teardown console noise from the
        // dying page — we only want post-reload errors.
        this._consoleLogs = [];

        const url = `http://localhost:${this.port}?headless`;
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 3000 });

        // The course runs inside an iframe — find it
        await this._locateCourseFrame();
    }

    /**
     * Find and cache the course iframe reference.
     * The stub player loads the course at /course/index.html in an iframe.
     * @private
     */
    async _locateCourseFrame() {
        // Poll for the course frame — the iframe DOM element exists immediately
        // but its content (/course/index.html) loads asynchronously.
        const startTime = Date.now();
        const timeout = 3000;

        while (Date.now() - startTime < timeout) {
            const frames = this.page.frames();
            this.courseFrame = frames.find(f => f.url().includes('/course/'));
            if (this.courseFrame) break;
            await new Promise(r => setTimeout(r, 200));
        }

        if (!this.courseFrame) {
            throw new Error('Could not locate course iframe in preview page');
        }

        // Wait for the framework to fully initialize (NavigationActions.init() etc.)
        // CourseCodeAutomation exists early but .ready is set after full boot
        await this.courseFrame.waitForFunction(
            () => window.CourseCodeAutomation?.ready === true,
            { timeout: 30000 }
        );
    }

    /**
     * Listen for SSE reload events from the preview server.
     * When Vite rebuilds, refresh the headless browser.
     * @private
     */
    _startReloadListener() {
        const reloadUrl = `http://localhost:${this.port}/__reload`;

        const connect = () => {
            if (this._stopped) return;

            const req = http.get(reloadUrl, (res) => {
                res.on('data', async (chunk) => {
                    if (this._stopped) return;
                    const data = chunk.toString();
                    if (data.includes('data: reload')) {
                        // Track the reload so concurrent tool calls wait for it
                        let resolveReload;
                        this._reloadPromise = new Promise(r => { resolveReload = r; });
                        try {
                            await this._navigateToPreview();
                        } catch (_e) {
                            // Preview may be mid-rebuild, retry will happen on next SSE
                        } finally {
                            this._reloadPromise = null;
                            resolveReload();
                        }
                    }
                });

                res.on('end', () => {
                    if (this._stopped) return;
                    this._reconnectTimer = setTimeout(connect, 1000);
                });
            });

            req.on('error', () => {
                if (this._stopped) return;
                this._reconnectTimer = setTimeout(connect, 2000);
            });

            this._sseReloadListener = req;
        };

        connect();
    }

    /**
     * Execute a function in the course iframe's context.
     * This is how runtime tools call CourseCodeAutomation methods.
     * 
     * @param {Function} fn - Function to evaluate (receives window.CourseCodeAutomation)
     * @param {...*} args - Arguments to pass to the function
     * @returns {Promise<*>} Result of the function
     */
    async evaluate(fn, ...args) {
        this._ensureRunning();
        await this._ensureCourseFrame();
        return this.courseFrame.evaluate(fn, ...args);
    }

    /**
     * Execute a function in the main page context (stub player, NOT the course iframe).
     * Use this to access stub player state like cmiData, apiLog, errorLog.
     * 
     * @param {Function} fn - Function to evaluate in the parent page
     * @param {...*} args - Arguments to pass to the function
     * @returns {Promise<*>} Result of the function
     */
    async evaluateParent(fn, ...args) {
        this._ensureRunning();
        return this.page.evaluate(fn, ...args);
    }

    /**
     * Get and clear buffered console warnings/errors.
     * @returns {Array<{type: string, text: string, time: string}>}
     */
    getConsoleLogs() {
        const logs = this._consoleLogs.slice();
        this._consoleLogs = [];
        return logs;
    }

    /**
     * Set the headless browser viewport size.
     * Accepts either a dimensions object or a named breakpoint string.
     * The viewport persists until explicitly changed again.
     *
     * @param {object|string} sizeOrBreakpoint - {width, height} or breakpoint name
     * @returns {Promise<{width: number, height: number, breakpoint?: string}>} Applied viewport
     */
    async setViewport(sizeOrBreakpoint) {
        this._ensureRunning();

        let width, height, breakpointName;

        if (typeof sizeOrBreakpoint === 'string') {
            // Resolve breakpoint name dynamically from the running course
            breakpointName = sizeOrBreakpoint;
            await this._ensureCourseFrame();
            const bp = await this.courseFrame.evaluate((name) => {
                const bpManager = window.CourseCode?.breakpointManager;
                if (!bpManager) return null;
                const breakpoints = bpManager.getBreakpoints();
                return breakpoints.find(b => b.name === name) || null;
            }, breakpointName);

            if (!bp) {
                // Get available names for error message
                const available = await this.courseFrame.evaluate(() => {
                    const bpManager = window.CourseCode?.breakpointManager;
                    if (!bpManager) return [];
                    return bpManager.getBreakpoints().map(b => b.name);
                });
                throw new Error(
                    `Unknown breakpoint "${breakpointName}". ` +
                    `Available: ${available.join(', ')}`
                );
            }

            // Use the breakpoint's boundary width
            width = bp.maxWidth ?? bp.minWidth;
            // Scale height proportionally from the 16:9 base (1280x720)
            height = Math.round(width * (9 / 16));
        } else {
            width = sizeOrBreakpoint.width;
            height = sizeOrBreakpoint.height;
            if (!width || !height) {
                throw new Error('Viewport requires both width and height, or a breakpoint name string.');
            }
        }

        this._viewport = { width, height };
        await this.page.setViewport(this._viewport);
        // Brief settle for layout reflow
        await new Promise(resolve => setTimeout(resolve, 100));

        return { width, height, ...(breakpointName ? { breakpoint: breakpointName } : {}) };
    }

    /**
     * Get the current viewport dimensions.
     * @returns {{width: number, height: number}}
     */
    getViewport() {
        return { ...this._viewport };
    }

    /**
     * Take a screenshot of the current page.
     *
     * Two quality modes optimize for token efficiency:
     * - normal (default): JPEG@50 (~20-40KB) — quick layout checks
     * - detailed: JPEG@90 (~100-200KB) — close text/element inspection
     *
     * Neither mode changes the viewport. The screenshot captures at the
     * current viewport size. Use setViewport() to change viewport independently.
     *
     * fullPage captures the entire scrollable course content by screenshotting
     * the course iframe element directly (bypasses the stub player chrome).
     *
     * @param {object} options
     * @param {string} [options.slideId] - Navigate to this slide before screenshotting
     * @param {boolean} [options.fullPage=false] - Capture full scrollable content
     * @param {boolean} [options.detailed=false] - Higher JPEG quality for close inspection
     * @returns {Promise<{data: string, mimeType: string}>} Base64-encoded JPEG
     */
    async screenshot(options = {}) {
        this._ensureRunning();

        const { slideId, fullPage = false, detailed = false, scrollY } = options;

        // Quality-only presets — viewport is NOT changed
        const quality = detailed ? 90 : 50;

        // Navigate to specific slide if requested
        if (slideId) {
            await this.evaluate(async (id) => {
                await window.CourseCodeAutomation.goToSlide(id);
            }, slideId);
            // Wait for slide transition
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Scroll within the course iframe if requested
        if (scrollY !== undefined && scrollY > 0) {
            await this._ensureCourseFrame();
            await this.courseFrame.evaluate((y) => {
                const container = document.querySelector('.slide-content')
                    || document.querySelector('[class*="slide"]')
                    || document.documentElement;
                container.scrollTop = y;
            }, scrollY);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        let screenshotBuffer;

        if (fullPage) {
            // For fullPage, measure the iframe content's full scrollable height,
            // temporarily expand the viewport so nothing is clipped, then screenshot.
            await this._ensureCourseFrame();
            const contentHeight = await this.courseFrame.evaluate(() => {
                return Math.max(
                    document.body.scrollHeight,
                    document.documentElement.scrollHeight
                );
            });

            const fullHeight = Math.max(contentHeight, this._viewport.height);
            await this.page.setViewport({ width: this._viewport.width, height: fullHeight });
            await new Promise(resolve => setTimeout(resolve, 200));

            const iframeElement = await this.page.$('iframe');
            if (iframeElement) {
                screenshotBuffer = await iframeElement.screenshot({
                    type: 'jpeg',
                    quality
                });
            } else {
                screenshotBuffer = await this.page.screenshot({
                    type: 'jpeg',
                    quality,
                    fullPage: true
                });
            }

            // Restore viewport height (fullPage temporarily expanded it)
            await this.page.setViewport(this._viewport);
        } else {
            screenshotBuffer = await this.page.screenshot({
                type: 'jpeg',
                quality
            });
        }

        return {
            data: screenshotBuffer.toString('base64'),
            mimeType: 'image/jpeg'
        };
    }

    /**
     * Ensure the browser is running, throw if not.
     * @private
     */
    _ensureRunning() {
        if (!this.browser || !this.page) {
            throw new Error('Headless browser not running. Call launch() first.');
        }
    }

    /**
     * Ensure the course frame reference is still valid (survives page reloads).
     * @private
     */
    async _ensureCourseFrame() {
        // If an SSE-triggered reload is in progress, wait for it to finish.
        // This prevents tool calls from hitting a mid-reinitializing framework
        // ("NavigationActions not initialized" errors after file edits).
        if (this._reloadPromise) {
            await this._reloadPromise;
        }

        try {
            // Check that the frame is still attached AND the framework is ready.
            // The stub player (in-page JS) may reload the iframe before the Node-side
            // SSE handler sets _reloadPromise, so we must also verify readiness here.
            const ready = await this.courseFrame.evaluate(
                () => window.CourseCodeAutomation?.ready === true
            );
            if (!ready) {
                // Frame is attached but framework is reinitializing — wait for it
                await this._locateCourseFrame();
            }
        } catch (_e) {
            // Frame detached (page reloaded), re-locate it
            await this._locateCourseFrame();
        }
    }

    /**
     * Check if the browser is running.
     * @returns {boolean}
     */
    isRunning() {
        return this.browser !== null && this.browser.connected;
    }

    /**
     * Cleanly shut down the browser.
     */
    async shutdown() {
        this._stopped = true;

        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }

        if (this._sseReloadListener) {
            this._sseReloadListener.destroy();
            this._sseReloadListener = null;
        }

        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            this.courseFrame = null;
        }
    }
}

// Singleton instance
const headless = new HeadlessBrowser();
export default headless;
export { findChrome };
