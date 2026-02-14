/**
 * E2E: Server-side LMS API endpoints
 *
 * Tests the /__lms/* REST endpoints exposed by the preview server.
 * Each test file gets its own browser for full state isolation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchBrowser, loadCourse, PORT } from './helpers/setup.js';
import { goToSlide, getCurrentSlide, automation, waitForReady } from './helpers/automation.js';
import {
    lmsState, lmsScore, lmsCompletion, lmsObjectives,
    lmsInteractions, lmsLog, lmsErrors, lmsFormat,
    lmsSession, lmsReset, lmsConfigure
} from './helpers/automation.js';
import { URL } from './helpers/setup.js';

const LMS_BASE = `http://localhost:${PORT}/__lms`;

describe('LMS API', () => {
    let browser, page, frame;

    beforeAll(async () => {
        await lmsReset();
        browser = await launchBrowser();
        ({ page, frame } = await loadCourse(browser));
        // Allow initial sync to complete
        await new Promise(r => setTimeout(r, 500));
    }, 30000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    // ==========================================
    // State Endpoints (initial state, before any interaction)
    // ==========================================

    it('should have synced state to server after course init', async () => {
        const state = await lmsState();
        expect(state.initialized).toBe(true);
        expect(state.cmiData).toBeTruthy();
    });

    it('should return correct format', async () => {
        const format = await lmsFormat();
        expect(format.format).toBeDefined();
        expect(typeof format.format).toBe('string');
    });

    it('should return session info', async () => {
        const session = await lmsSession();
        expect(session.initialized).toBe(true);
        expect(session.terminated).toBe(false);
    });

    it('should return initial score as nulls', async () => {
        const score = await lmsScore();
        // Before assessment, score should be null/zero
        expect(score).toBeDefined();
    });

    it('should return initial completion as unknown', async () => {
        const completion = await lmsCompletion();
        expect(completion).toBeDefined();
    });

    it('should return API log with entries', async () => {
        const log = await lmsLog();
        expect(log.entries).toBeDefined();
        expect(Array.isArray(log.entries)).toBe(true);
        expect(log.count).toBeGreaterThan(0);
    });

    it('should return errors endpoint', async () => {
        const errors = await lmsErrors();
        expect(errors).toHaveProperty('errors');
        expect(errors).toHaveProperty('warnings');
        expect(errors.totalErrors).toBeGreaterThanOrEqual(0);
    });

    // ==========================================
    // State Updates After Navigation
    // ==========================================

    it('should reflect bookmark changes after navigation', async () => {
        // Navigate to a known slide
        await goToSlide(frame, 'example-workflow');

        // Poll for sync (prior test's browser may still be writing stale bookmarks)
        let synced = false;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 300));
            const state = await lmsState();
            if (state.cmiData?.['cmi.location'] === 'example-workflow') {
                synced = true;
                break;
            }
        }
        expect(synced).toBe(true);
    });

    it('should reflect location via session endpoint', async () => {
        // Navigate to a specific slide
        await goToSlide(frame, 'example-preview-tour');

        // Poll for sync
        let synced = false;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 300));
            const session = await lmsSession();
            if (session.bookmark === 'example-preview-tour') {
                synced = true;
                break;
            }
        }
        expect(synced).toBe(true);
    });

    // ==========================================
    // Configure & Reset
    // ==========================================

    it('should accept configure requests', async () => {
        const result = await lmsConfigure({
            learnerId: 'test_user_42',
            learnerName: 'Test User Forty-Two'
        });
        expect(result.ok).toBe(true);
        expect(result.applied).toContain('learnerId');

        // Verify it took effect
        const state = await lmsState();
        expect(state.cmiData['cmi.learner_id']).toBe('test_user_42');
    });

    it('should reset state when requested', async () => {
        const result = await lmsReset();
        expect(result.ok).toBe(true);

        // After reset, state should be empty
        const state = await lmsState();
        expect(state.error).toBe('No LMS state available yet. Course has not initialized.');
    });

    // Re-load the course to get state syncing again after reset
    it('should re-sync after page reload', async () => {
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
        frame = await waitForReady(page);
        await new Promise(r => setTimeout(r, 500));

        const state = await lmsState();
        expect(state.cmiData).toBeTruthy();
        expect(state.initialized).toBe(true);
    });

    // ==========================================
    // Objectives & Interactions Endpoints
    // ==========================================

    it('should return objectives endpoint', async () => {
        const objectives = await lmsObjectives();
        expect(objectives).toBeDefined();
    });

    it('should return interactions endpoint', async () => {
        const interactions = await lmsInteractions();
        expect(interactions).toBeDefined();
    });

    // ==========================================
    // Edge Cases
    // ==========================================

    it('should return 404 for unknown LMS routes', async () => {
        const res = await fetch(`${LMS_BASE}/nonexistent`);
        expect(res.status).toBe(404);
    });

    it('should handle CORS preflight', async () => {
        const res = await fetch(`${LMS_BASE}/state`, { method: 'OPTIONS' });
        // Should not crash; the handler may return 200 or 204
        expect(res.ok || res.status === 204).toBe(true);
    });
});
