/**
 * E2E: Course Initialization & State
 * 
 * Verifies the framework boots correctly, the Automation API is available,
 * course structure matches config, and no errors occur during init.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchBrowser, loadCourse } from './helpers/setup.js';
import { getCurrentSlide, automation } from './helpers/automation.js';

describe('Course Initialization', () => {
    let browser, page, frame;

    beforeAll(async () => {
        browser = await launchBrowser();
        ({ page, frame } = await loadCourse(browser));
    }, 60000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    it('should have CourseCodeAutomation API available', async () => {
        const ready = await frame.evaluate(() => window.CourseCodeAutomation?.ready);
        expect(ready).toBe(true);
    });

    it('should report a valid API version', async () => {
        const version = await automation(frame, 'getVersion');
        expect(version).toBeDefined();
        expect(version.api).toBeDefined();
    });

    it('should load to the first slide', async () => {
        const current = await getCurrentSlide(frame);
        expect(current).toBe('example-welcome');
    });

    it('should have the correct course structure', async () => {
        const toc = await automation(frame, 'getToc');
        expect(toc).toBeDefined();
        expect(Array.isArray(toc)).toBe(true);

        const slideIds = toc.map(item => item.id);
        expect(slideIds).toContain('example-welcome');
        expect(slideIds).toContain('example-interactions-showcase');
        expect(slideIds).toContain('example-final-exam');
        expect(slideIds).toContain('example-summary');
    });

    it('should have sections in the structure', async () => {
        const toc = await automation(frame, 'getToc');
        const sections = toc.filter(item => item.type === 'section');
        expect(sections.length).toBeGreaterThanOrEqual(2);
        expect(sections[0].id).toBe('example-getting-started');
    });

    it('should have no console errors after init', async () => {
        const errors = await frame.evaluate(() => {
            const trace = window.CourseCodeAutomation?.getAutomationTrace?.() || [];
            return trace.filter(t => t.action === 'error');
        });
        expect(errors.length).toBe(0);
    });

    it('should have a page title', async () => {
        const title = await page.title();
        expect(title).toBeTruthy();
    });

    it('should have the SCORM API stub available', async () => {
        const apiType = await page.evaluate(() => typeof window.API_1484_11);
        expect(apiType).toBe('object');
    });
});
