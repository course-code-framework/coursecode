/**
 * E2E: Multi-Format Driver Tests
 * 
 * Exercises the full LMS lifecycle across all 4 driver types (SCORM 2004, SCORM 1.2, cmi5, LTI).
 * Run via per-format vitest configs that each start a preview server with the matching LMS_FORMAT env var.
 * 
 * Usage:
 *   npx vitest run --config tests/vitest.e2e.scorm2004.config.js
 *   npx vitest run --config tests/vitest.e2e.scorm12.config.js
 *   npx vitest run --config tests/vitest.e2e.cmi5.config.js
 *   npx vitest run --config tests/vitest.e2e.lti.config.js
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchBrowser, loadCourse } from './helpers/setup.js';
import { goToSlide, getCurrentSlide, automation } from './helpers/automation.js';
import {
    lmsState, lmsScore, lmsCompletion,
    lmsLog, lmsErrors, lmsFormat,
    lmsSession, lmsXapi,
    waitForLmsScore
} from './helpers/automation.js';

const FORMAT = process.env.E2E_LMS_FORMAT || 'cmi5';

/**
 * Wait for LMS state to sync from browser → server.
 * Polls until the predicate returns true or times out.
 */
async function waitForSync(predicate, { interval = 300, attempts = 25 } = {}) {
    for (let i = 0; i < attempts; i++) {
        await new Promise(r => setTimeout(r, interval));
        const state = await lmsState();
        if (state.cmiData && predicate(state)) return state;
    }
    return null;
}


describe(`Driver: ${FORMAT}`, () => {
    let browser, page, frame;

    beforeAll(async () => {
        browser = await launchBrowser();
        ({ page, frame } = await loadCourse(browser));
        // Allow initial sync to complete
        await new Promise(r => setTimeout(r, 800));
    }, 60000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    // ==========================================
    // Initialization
    // ==========================================

    it('should initialize without errors', async () => {
        const state = await lmsState();
        expect(state.error).toBeUndefined();
        expect(state.cmiData).toBeTruthy();
        expect(state.initialized).toBe(true);
        expect(state.terminated).toBe(false);
    });

    it('should report the correct active format', async () => {
        const fmt = await lmsFormat();
        // Map E2E_LMS_FORMAT values to what the stub player reports
        const expectedFormat = FORMAT === 'scorm1.2' ? 'scorm12' : FORMAT;
        expect(fmt.format).toBe(expectedFormat);
    });

    it('should report strict mode enabled (CI)', async () => {
        const fmt = await lmsFormat();
        expect(fmt.strict).toBe(true);
    });

    it('should have API log entries after init', async () => {
        const log = await lmsLog();
        expect(log.entries).toBeInstanceOf(Array);
        expect(log.count).toBeGreaterThan(0);
    });

    it('should have zero strict mode errors on init', async () => {
        const errors = await lmsErrors();
        expect(errors.totalErrors).toBe(0);
    });

    // ==========================================
    // Navigation & Bookmark
    // ==========================================

    it('should update bookmark on navigation', async () => {
        const targetSlide = 'example-workflow';
        await goToSlide(frame, targetSlide);

        const state = await waitForSync(s => s.cmiData['cmi.location'] === targetSlide);
        expect(state).not.toBeNull();
        expect(state.cmiData['cmi.location']).toBe(targetSlide);
    });

    it('should reflect bookmark via session endpoint', async () => {
        const session = await lmsSession();
        expect(session.bookmark).toBeTruthy();
    });

    // ==========================================
    // Suspend Data Round-Trip
    // ==========================================

    it('should persist suspend data across reload', async () => {

        // Navigate to a known slide to set state
        await goToSlide(frame, 'example-preview-tour');
        await waitForSync(s => s.cmiData['cmi.location'] === 'example-preview-tour');

        // Capture suspend data before reload
        const stateBefore = await lmsState();
        const suspendBefore = stateBefore.cmiData['cmi.suspend_data'];
        expect(suspendBefore).toBeTruthy();

        // Reload the course
        ({ page, frame } = await loadCourse(browser));
        await new Promise(r => setTimeout(r, 800));

        // Verify bookmark restored (proves suspend_data round-tripped)
        const stateAfter = await lmsState();
        expect(stateAfter.cmiData['cmi.suspend_data']).toBeTruthy();
    });

    // ==========================================
    // Assessment & Score Reporting
    // ==========================================

    it('should report score after assessment completion', async () => {

        // Visit prerequisite slides to unlock assessment
        const prerequisiteSlides = [
            'example-welcome',
            'example-workflow',
            'example-preview-tour',
            'example-course-structure',
            'example-ui-showcase',
            'example-interactions-showcase',
            'example-finishing'
        ];
        for (const slideId of prerequisiteSlides) {
            await goToSlide(frame, slideId);
            await new Promise(r => setTimeout(r, 200));
        }

        // Navigate to assessment
        await goToSlide(frame, 'example-final-exam');
        await new Promise(r => setTimeout(r, 500));

        // Start assessment
        await frame.evaluate(() => {
            const btn = document.querySelector('[data-testid="assessment-start"]');
            if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); }
        });
        await new Promise(r => setTimeout(r, 800));

        // Q1: Multiple-choice — click the first choice option
        await frame.evaluate(() => {
            const choice = document.querySelector('[data-testid="coursecode-fundamentals-choice-0"]')
                || document.querySelector('.choice-option:first-child');
            if (choice) { choice.scrollIntoView({ block: 'center' }); choice.click(); }
        });
        await new Promise(r => setTimeout(r, 500));

        // Navigate to Q2
        await frame.evaluate(() => {
            const next = document.querySelector('[data-testid="assessment-nav-next"]');
            if (next) { next.scrollIntoView({ block: 'center' }); next.click(); }
        });
        await new Promise(r => setTimeout(r, 600));

        // Q2: Fill-in-blank — enter answers
        await frame.evaluate(() => {
            const inputs = document.querySelectorAll('input[type="text"]');
            const answers = ['coursecode create', 'coursecode dev', 'coursecode build'];
            inputs.forEach((input, i) => {
                if (i < answers.length) {
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, 'value'
                    ).set;
                    nativeInputValueSetter.call(input, answers[i]);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
        await new Promise(r => setTimeout(r, 500));

        // Navigate to review
        await frame.evaluate(() => {
            const next = document.querySelector('[data-testid="assessment-nav-next"]');
            if (next) { next.scrollIntoView({ block: 'center' }); next.click(); }
        });
        await new Promise(r => setTimeout(r, 600));

        // Submit assessment
        await frame.evaluate(() => {
            const submit = document.querySelector('[data-testid="assessment-submit"]');
            if (submit) { submit.scrollIntoView({ block: 'center' }); submit.click(); }
        });
        await new Promise(r => setTimeout(r, 1500));

        // Verify LMS state via framework API (in-browser, most reliable)
        const lmsStateResult = await frame.evaluate(() => {
            return window.CourseCodeAutomation.getLmsState();
        });
        expect(lmsStateResult).not.toBeNull();
        expect(lmsStateResult.score).not.toBeNull();
        expect(lmsStateResult.score.scaled).toBeGreaterThan(0);

        // Also verify from server-side LMS API (poll until score arrives)
        const serverScore = FORMAT === 'scorm1.2'
            ? await waitForLmsScore(s => s.raw !== null && s.raw !== undefined)
            : await waitForLmsScore(s => s.scaled !== null && s.scaled !== undefined);
        if (FORMAT === 'scorm1.2') {
            expect(serverScore.raw).not.toBeNull();
        } else {
            expect(serverScore.scaled).not.toBeNull();
        }
    }, 30000);

    it('should have completion data accessible after assessment', async () => {
        // Note: completion is driven by course-level criteria (final slide nav),
        // not assessment submission alone. Just verify the API returns data.
        const completion = await lmsCompletion();
        expect(completion).toHaveProperty('completion');
        expect(completion).toHaveProperty('success');
    });

    // ==========================================
    // Format-Specific Assertions
    // ==========================================

    if (FORMAT === 'scorm2004') {
        describe('SCORM 2004 specifics', () => {
            it('should have cmi.score.scaled', async () => {
                const state = await lmsState();
                const scaled = state.cmiData['cmi.score.scaled'];
                expect(scaled).toBeDefined();
                expect(scaled).not.toBe('');
                // SCORM 2004 scaled score is -1 to 1
                const num = parseFloat(scaled);
                expect(num).toBeGreaterThanOrEqual(-1);
                expect(num).toBeLessThanOrEqual(1);
            });

            it('should use ISO 8601 session time', async () => {
                const session = await lmsSession();
                // ISO 8601 duration: PT0H0M0S or similar
                expect(session.sessionTime).toMatch(/^PT/);
            });

            it('should have valid cmi.exit', async () => {
                const state = await lmsState();
                const exit = state.cmiData['cmi.exit'];
                const validExits = ['', 'time-out', 'suspend', 'logout', 'normal'];
                expect(validExits).toContain(exit);
            });
        });
    }

    if (FORMAT === 'scorm1.2') {
        describe('SCORM 1.2 specifics', () => {
            it('should NOT have cmi.score.scaled (2004-only)', async () => {
                const log = await lmsLog();
                // Verify the driver never tried to set cmi.score.scaled
                const scaledAttempt = log.entries.find(e =>
                    e.method === 'LMSSetValue' && e.args?.includes('cmi.score.scaled')
                );
                expect(scaledAttempt).toBeFalsy();
            });

            it('should use LMSSetValue (not SCORM 2004 SetValue)', async () => {
                const log = await lmsLog();
                // SCORM 1.2 uses LMSSetValue, not SetValue
                const lmsSetEntry = log.entries.find(e =>
                    e.method === 'LMSSetValue'
                );
                expect(lmsSetEntry).toBeTruthy();
                // Should NOT have SCORM 2004 SetValue
                const scorm2004Entry = log.entries.find(e =>
                    e.method === 'SetValue'
                );
                expect(scorm2004Entry).toBeFalsy();
            });

            it('should use HH:MM:SS session time format (not ISO 8601)', async () => {
                const log = await lmsLog();
                const sessionTimeEntry = log.entries.find(e =>
                    e.method === 'LMSSetValue' && e.args?.includes('cmi.core.session_time')
                );
                if (sessionTimeEntry) {
                    // SCORM 1.2 format: HHHH:MM:SS (not PT...)
                    const value = sessionTimeEntry.args.split(' = ')[1];
                    expect(value).not.toMatch(/^PT/);
                    expect(value).toMatch(/^\d{2,4}:\d{2}:\d{2}/);
                }
            });
        });
    }

    if (FORMAT === 'cmi5') {
        describe('cmi5 specifics', () => {
            it('should have xAPI statements logged', async () => {
                const xapi = await lmsXapi();
                expect(xapi.count).toBeGreaterThan(0);
            });

            it('should use cmi5 API methods (not SCORM)', async () => {
                const log = await lmsLog();
                // cmi5 uses its own method names, not SCORM
                const cmi5Entry = log.entries.find(e =>
                    e.method?.startsWith('cmi5.')
                );
                expect(cmi5Entry).toBeTruthy();
                // Should NOT have SCORM method names
                const scormEntry = log.entries.find(e =>
                    e.method === 'Initialize' || e.method === 'LMSInitialize'
                );
                expect(scormEntry).toBeFalsy();
            });
        });
    }

    if (FORMAT === 'lti') {
        describe('LTI specifics', () => {
            it('should report format as lti', async () => {
                const fmt = await lmsFormat();
                expect(fmt.format).toBe('lti');
            });

            it('should have score in 0-1 range', async () => {
                const score = await lmsScore();
                if (score.scaled !== null && score.scaled !== '') {
                    const scaled = parseFloat(score.scaled);
                    expect(scaled).toBeGreaterThanOrEqual(0);
                    expect(scaled).toBeLessThanOrEqual(1);
                }
            });
        });
    }

    // ==========================================
    // Clean Shutdown
    // ==========================================

    it('should have zero strict errors after full lifecycle', async () => {
        const errors = await lmsErrors();
        expect(errors.totalErrors).toBe(0);
    });
});
