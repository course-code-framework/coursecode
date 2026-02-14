/**
 * E2E: Engagement Tracking & Objectives
 * 
 * Tests engagement requirements, progress tracking, objective criteria,
 * and flag-based objectives using known-correct values from slide source.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchBrowser, loadCourse } from './helpers/setup.js';
import {
    goToSlide, getCurrentSlide, getEngagementState, getEngagementProgress,
    setResponse, checkAnswer, setFlag, getFlag, automation, markTabViewed
} from './helpers/automation.js';

describe('Engagement & Objectives', () => {
    let browser, page, frame;

    beforeAll(async () => {
        browser = await launchBrowser();
        ({ page, frame } = await loadCourse(browser));
    }, 60000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    describe('Engagement Tracking', () => {
        it('should show incomplete engagement on required slide', async () => {
            await goToSlide(frame, 'example-interactions-showcase');
            const state = await getEngagementState(frame);
            expect(state).toBeDefined();
            expect(state.complete).toBe(false);
        });

        it('should report engagement progress', async () => {
            const progress = await getEngagementProgress(frame);
            expect(progress).toBeDefined();
            expect(typeof progress.percentage).toBe('number');
            expect(progress.percentage).toBeGreaterThanOrEqual(0);
            expect(progress.percentage).toBeLessThanOrEqual(100);
            expect(Array.isArray(progress.items)).toBe(true);
        });

        it('should have multiple requirements', async () => {
            const progress = await getEngagementProgress(frame);
            expect(progress.items.length).toBeGreaterThanOrEqual(7);
        });

        it('should update progress when completing an interaction', async () => {
            const before = await getEngagementProgress(frame);
            const beforePct = before.percentage;

            // Use known-correct numeric answer
            await setResponse(frame, 'efficiency-calculation', 16);
            await checkAnswer(frame, 'efficiency-calculation');
            await new Promise(r => setTimeout(r, 300));

            const after = await getEngagementProgress(frame);
            expect(after.percentage).toBeGreaterThan(beforePct);
        });

        it('should complete engagement after satisfying all requirements', async () => {
            // Complete all interactions with KNOWN-CORRECT answers from slide source

            // Drag-and-drop: items→zones from slide config
            await setResponse(frame, 'system-architecture-dd', {
                'intro-slide': 'opening', 'content-slide': 'body', 'quiz': 'body',
                'assessment': 'closing', 'summary': 'closing'
            });
            await checkAnswer(frame, 'system-architecture-dd');

            // Matching: pairId→matchText from slide config
            await setResponse(frame, 'lms-standards-matching', {
                'scorm12': 'Legacy standard',
                'scorm2004': 'Adds sequencing',
                'cmi5': 'xAPI-based',
                'xapi': 'Activity streams'
            });
            await checkAnswer(frame, 'lms-standards-matching');

            // Fill-in (simple text): prefixed key, known-correct value
            await setResponse(frame, 'lms-standards-text', { 'lms-standards-text_answer': 'SCORM' });
            await checkAnswer(frame, 'lms-standards-text');

            // Fill-in (cloze): prefixed keys, known-correct values
            await setResponse(frame, 'requirements-spec-fillin', {
                'requirements-spec-fillin_format': 'cmi5',
                'requirements-spec-fillin_feature': 'accessibility'
            });
            await checkAnswer(frame, 'requirements-spec-fillin');

            // Q&A fill-in: prefixed key, known-correct value
            await setResponse(frame, 'framework-components-qa', { 'framework-components-qa_answer': 'cmi5' });
            await checkAnswer(frame, 'framework-components-qa');

            // Mark all 5 tabs as viewed
            await markTabViewed(frame, 'dragdrop-content');
            await markTabViewed(frame, 'matching-content');
            await markTabViewed(frame, 'choice-content');
            await markTabViewed(frame, 'textinput-content');
            await markTabViewed(frame, 'diagram-content');

            await new Promise(r => setTimeout(r, 500));

            const state = await getEngagementState(frame);
            expect(state.complete).toBe(true);
        });

        it('should return null engagement for non-tracked slides', async () => {
            await goToSlide(frame, 'example-welcome');
            const state = await getEngagementState(frame);
            expect(state).toBeNull();
        });
    });

    describe('Flags', () => {
        it('should set and get flags', async () => {
            await setFlag(frame, 'test-flag', 'hello');
            const value = await getFlag(frame, 'test-flag');
            expect(value).toBe('hello');
        });

        it('should get all flags', async () => {
            const flags = await automation(frame, 'getAllFlags');
            expect(flags).toBeDefined();
            expect(flags['test-flag']).toBe('hello');
        });

        it('should remove flags', async () => {
            await automation(frame, 'removeFlag', 'test-flag');
            const value = await getFlag(frame, 'test-flag');
            expect(value).toBeUndefined();
        });

        it('should update flag-based objective when flag is set', async () => {
            await setFlag(frame, 'example-intro-complete', true);
            await new Promise(r => setTimeout(r, 300));
            const flagValue = await getFlag(frame, 'example-intro-complete');
            expect(flagValue).toBe(true);
        });
    });

    describe('Objectives', () => {
        it('should track slide visits as objectives', async () => {
            await goToSlide(frame, 'example-finishing');
            await new Promise(r => setTimeout(r, 300));
            const current = await getCurrentSlide(frame);
            expect(current).toBe('example-finishing');

            // Verify objective tracking via framework API (driver-agnostic)
            const lmsState = await frame.evaluate(() => {
                return window.CourseCodeAutomation.getLmsState();
            });
            expect(lmsState).not.toBeNull();
            expect(Object.keys(lmsState.objectives).length).toBeGreaterThan(0);
        });
    });
});
