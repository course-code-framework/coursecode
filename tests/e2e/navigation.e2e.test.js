/**
 * E2E: Navigation System
 * 
 * Verifies sequential navigation, menu navigation, gating enforcement,
 * and bookmark persistence.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchBrowser, loadCourse } from './helpers/setup.js';
import { goToSlide, getCurrentSlide, automation, waitForReady } from './helpers/automation.js';
import { URL } from './helpers/setup.js';

describe('Navigation', () => {
    let browser, page, frame;

    beforeAll(async () => {
        browser = await launchBrowser();
        ({ page, frame } = await loadCourse(browser));
    }, 60000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    describe('Sequential Navigation', () => {
        it('should start on the first slide', async () => {
            const current = await getCurrentSlide(frame);
            expect(current).toBe('example-welcome');
        });

        it('should navigate forward via next button', async () => {
            await frame.evaluate(() => {
                const btn = document.querySelector('[data-testid="nav-next"]');
                if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); }
            });
            await new Promise(r => setTimeout(r, 500));
            const current = await getCurrentSlide(frame);
            expect(current).toBe('example-workflow');
        });

        it('should navigate backward via prev button', async () => {
            await frame.evaluate(() => {
                const btn = document.querySelector('[data-testid="nav-prev"]');
                if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); }
            });
            await new Promise(r => setTimeout(r, 500));
            const current = await getCurrentSlide(frame);
            expect(current).toBe('example-welcome');
        });
    });

    describe('Direct Navigation (Automation API)', () => {
        it('should navigate to a specific slide by ID', async () => {
            await goToSlide(frame, 'example-ui-showcase');
            const current = await getCurrentSlide(frame);
            expect(current).toBe('example-ui-showcase');
        });

        it('should navigate to a different section', async () => {
            await goToSlide(frame, 'example-course-structure');
            await new Promise(r => setTimeout(r, 300));
            const current = await getCurrentSlide(frame);
            expect(current).toBe('example-course-structure');
        });
    });

    describe('Gating Enforcement', () => {
        // The stub player bypasses gating via URL param and window flag.
        // __FORCE_GATING overrides all bypass logic in shouldBypassGating().
        beforeAll(async () => {
            await frame.evaluate(() => { window.__FORCE_GATING = true; });
        });

        afterAll(async () => {
            await frame.evaluate(() => { delete window.__FORCE_GATING; });
        });

        it('should block navigation to gated assessment slide', async () => {
            const before = await getCurrentSlide(frame);
            let threw = false;
            try {
                await goToSlide(frame, 'example-final-exam');
            } catch {
                threw = true;
            }
            const after = await getCurrentSlide(frame);
            // Gating should block and keep us on the same slide.
            expect(threw).toBe(true);
            expect(after).toBe(before);
        });

        it('should block navigation to post-assessment slide', async () => {
            const before = await getCurrentSlide(frame);
            let threw = false;
            try {
                await goToSlide(frame, 'example-summary');
            } catch {
                threw = true;
            }
            const after = await getCurrentSlide(frame);
            expect(threw).toBe(true);
            expect(after).toBe(before);
        });
    });

    describe('Visiting Slides Unlocks Gating', () => {
        afterAll(async () => {
            await frame.evaluate(() => { delete window.__FORCE_GATING; });
        });

        it('should allow assessment after visiting required slides', async () => {
            // Enable gating enforcement
            await frame.evaluate(() => { window.__FORCE_GATING = true; });

            const slidesToVisit = [
                'example-welcome',
                'example-workflow',
                'example-preview-tour',
                'example-course-structure',
                'example-ui-showcase',
                'example-interactions-showcase',
                'example-finishing'
            ];

            for (const slideId of slidesToVisit) {
                await goToSlide(frame, slideId);
                await new Promise(r => setTimeout(r, 200));
            }

            await goToSlide(frame, 'example-final-exam');
            await new Promise(r => setTimeout(r, 500));
            const current = await getCurrentSlide(frame);
            expect(current).toBe('example-final-exam');
        });
    });

    describe('Bookmark Persistence', () => {
        it('should restore position after reload', async () => {
            await goToSlide(frame, 'example-course-structure');
            const before = await getCurrentSlide(frame);
            expect(before).toBe('example-course-structure');

            // Wait for state commit
            await new Promise(r => setTimeout(r, 800));

            // Reload the page
            await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

            // Re-acquire iframe
            frame = await waitForReady(page);

            const after = await getCurrentSlide(frame);
            expect(after).toBe('example-course-structure');
        });
    });
});
