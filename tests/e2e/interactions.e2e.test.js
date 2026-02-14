/**
 * E2E: Interaction Types
 * 
 * Tests every interaction type via the Automation API on the interactions
 * showcase slide. Validates correct and incorrect responses using
 * hardcoded known-correct values from the slide source code.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchBrowser, loadCourse } from './helpers/setup.js';
import { goToSlide, getCurrentSlide, setResponse, checkAnswer, listInteractions, automation } from './helpers/automation.js';

describe('Interactions', () => {
    let browser, page, frame;

    beforeAll(async () => {
        browser = await launchBrowser();
        ({ page, frame } = await loadCourse(browser));
        await goToSlide(frame, 'example-interactions-showcase');
    }, 60000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    it('should be on the interactions showcase slide', async () => {
        const current = await getCurrentSlide(frame);
        expect(current).toBe('example-interactions-showcase');
    });

    it('should have interactions registered on this slide', async () => {
        const interactions = await listInteractions(frame);
        expect(interactions.length).toBeGreaterThanOrEqual(6);

        const ids = interactions.map(i => i.id);
        expect(ids).toContain('system-architecture-dd');
        expect(ids).toContain('lms-standards-matching');
        expect(ids).toContain('lms-standards-text');
        expect(ids).toContain('requirements-spec-fillin');
        expect(ids).toContain('efficiency-calculation');
        expect(ids).toContain('framework-components-qa');
    });

    // ─── Drag and Drop ──────────────────────────────────────

    describe('Drag and Drop', () => {
        it('should evaluate correct drag-drop response', async () => {
            // Known-correct from slide source: items → zones
            await setResponse(frame, 'system-architecture-dd', {
                'intro-slide': 'opening',
                'content-slide': 'body',
                'quiz': 'body',
                'assessment': 'closing',
                'summary': 'closing'
            });
            const result = await checkAnswer(frame, 'system-architecture-dd');
            expect(result.correct).toBe(true);
            expect(result.score).toBe(1);
        });

        it('should reject wrong drag-drop response', async () => {
            // Swap zones: put opening items in closing
            await setResponse(frame, 'system-architecture-dd', {
                'intro-slide': 'closing',
                'content-slide': 'closing',
                'quiz': 'opening',
                'assessment': 'opening',
                'summary': 'body'
            });
            const result = await checkAnswer(frame, 'system-architecture-dd');
            expect(result.correct).toBe(false);
            expect(result.score).toBe(0);
        });
    });

    // ─── Matching ────────────────────────────────────────────

    describe('Matching', () => {
        // Known-correct from slide source: pairs[].id → pairs[].match
        const CORRECT_MATCHING = {
            'scorm12': 'Legacy standard',
            'scorm2004': 'Adds sequencing',
            'cmi5': 'xAPI-based',
            'xapi': 'Activity streams'
        };

        it('should evaluate correct matching response', async () => {
            await setResponse(frame, 'lms-standards-matching', CORRECT_MATCHING);
            const result = await checkAnswer(frame, 'lms-standards-matching');
            expect(result.correct).toBe(true);
            expect(result.score).toBe(1);
        });

        it('should evaluate incorrect matching response', async () => {
            // Rotate all answers: each item gets the wrong match
            await setResponse(frame, 'lms-standards-matching', {
                'scorm12': 'Adds sequencing',
                'scorm2004': 'xAPI-based',
                'cmi5': 'Activity streams',
                'xapi': 'Legacy standard'
            });
            const result = await checkAnswer(frame, 'lms-standards-matching');
            expect(result.correct).toBe(false);
            expect(result.score).toBe(0);
        });

        it('should score partial matching correctly', async () => {
            // 2 out of 4 correct
            await setResponse(frame, 'lms-standards-matching', {
                'scorm12': 'Legacy standard',      // correct
                'scorm2004': 'Adds sequencing',     // correct
                'cmi5': 'Activity streams',          // wrong (should be xAPI-based)
                'xapi': 'xAPI-based'                 // wrong (should be Activity streams)
            });
            const result = await checkAnswer(frame, 'lms-standards-matching');
            expect(result.correct).toBe(false);
            expect(result.score).toBe(0.5);
        });

        it('getCorrectResponse should return usable response', async () => {
            // Verify getCorrectResponse returns the same format as what setResponse/evaluate expects
            const correct = await automation(frame, 'getCorrectResponse', 'lms-standards-matching');
            const correctObj = typeof correct === 'string' ? JSON.parse(correct) : correct;
            // Should match our known-correct values
            expect(correctObj).toEqual(CORRECT_MATCHING);
            // Round-trip: pass it directly to setResponse + checkAnswer
            await setResponse(frame, 'lms-standards-matching', correctObj);
            const result = await checkAnswer(frame, 'lms-standards-matching');
            expect(result.correct).toBe(true);
        });
    });

    // ─── Fill-in-Blank (simple text) ─────────────────────────

    describe('Fill-in-Blank (simple text)', () => {
        it('should accept correct fill-in response', async () => {
            // Known-correct from slide: answer accepts ['SCORM', 'cmi5', 'xAPI', ...]
            await setResponse(frame, 'lms-standards-text', { 'lms-standards-text_answer': 'SCORM' });
            const result = await checkAnswer(frame, 'lms-standards-text');
            expect(result.correct).toBe(true);
            expect(result.score).toBe(1);
        });

        it('should accept alternative correct answers', async () => {
            await setResponse(frame, 'lms-standards-text', { 'lms-standards-text_answer': 'cmi5' });
            const result = await checkAnswer(frame, 'lms-standards-text');
            expect(result.correct).toBe(true);
        });

        it('should reject incorrect fill-in response', async () => {
            await setResponse(frame, 'lms-standards-text', { 'lms-standards-text_answer': 'PowerPoint' });
            const result = await checkAnswer(frame, 'lms-standards-text');
            expect(result.correct).toBe(false);
            expect(result.score).toBe(0);
        });

        it('getCorrectResponse should return prefixed keys', async () => {
            const correct = await automation(frame, 'getCorrectResponse', 'lms-standards-text');
            // After framework fix: keys should be prefixed with interaction ID
            expect(correct).toHaveProperty('lms-standards-text_answer');
            // Round-trip: pass directly without transformation
            await setResponse(frame, 'lms-standards-text', correct);
            const result = await checkAnswer(frame, 'lms-standards-text');
            expect(result.correct).toBe(true);
        });
    });

    // ─── Fill-in-Blank (cloze) ───────────────────────────────

    describe('Fill-in-Blank (cloze)', () => {
        it('should evaluate correct cloze response', async () => {
            // Known-correct from slide: format='cmi5', feature='accessibility'
            await setResponse(frame, 'requirements-spec-fillin', {
                'requirements-spec-fillin_format': 'cmi5',
                'requirements-spec-fillin_feature': 'accessibility'
            });
            const result = await checkAnswer(frame, 'requirements-spec-fillin');
            expect(result.correct).toBe(true);
            expect(result.score).toBe(1);
        });

        it('should score partial cloze correctly', async () => {
            // 1 out of 2 correct
            await setResponse(frame, 'requirements-spec-fillin', {
                'requirements-spec-fillin_format': 'cmi5',
                'requirements-spec-fillin_feature': 'wrong answer'
            });
            const result = await checkAnswer(frame, 'requirements-spec-fillin');
            expect(result.correct).toBe(false);
            expect(result.score).toBe(0.5);
        });

        it('should reject all-wrong cloze response', async () => {
            await setResponse(frame, 'requirements-spec-fillin', {
                'requirements-spec-fillin_format': 'wrong',
                'requirements-spec-fillin_feature': 'wrong'
            });
            const result = await checkAnswer(frame, 'requirements-spec-fillin');
            expect(result.correct).toBe(false);
            expect(result.score).toBe(0);
        });

        it('getCorrectResponse should return prefixed keys', async () => {
            const correct = await automation(frame, 'getCorrectResponse', 'requirements-spec-fillin');
            expect(correct).toHaveProperty('requirements-spec-fillin_format');
            expect(correct).toHaveProperty('requirements-spec-fillin_feature');
            // Round-trip
            await setResponse(frame, 'requirements-spec-fillin', correct);
            const result = await checkAnswer(frame, 'requirements-spec-fillin');
            expect(result.correct).toBe(true);
        });
    });

    // ─── Numeric ─────────────────────────────────────────────

    describe('Numeric', () => {
        it('should accept correct numeric response', async () => {
            // Known-correct from slide: exact=16, tolerance=0
            await setResponse(frame, 'efficiency-calculation', 16);
            const result = await checkAnswer(frame, 'efficiency-calculation');
            expect(result.correct).toBe(true);
            expect(result.score).toBe(1);
        });

        it('should reject off-by-one numeric response', async () => {
            await setResponse(frame, 'efficiency-calculation', 15);
            const result = await checkAnswer(frame, 'efficiency-calculation');
            expect(result.correct).toBe(false);
            expect(result.score).toBe(0);
        });

        it('should reject wildly wrong numeric response', async () => {
            await setResponse(frame, 'efficiency-calculation', 999);
            const result = await checkAnswer(frame, 'efficiency-calculation');
            expect(result.correct).toBe(false);
        });
    });

    // ─── Q&A Fill-in ─────────────────────────────────────────

    describe('Q&A Fill-in', () => {
        it('should accept correct QA response', async () => {
            // Known-correct from slide: answer=['cmi5', 'CMI5', 'cmi 5']
            await setResponse(frame, 'framework-components-qa', { 'framework-components-qa_answer': 'cmi5' });
            const result = await checkAnswer(frame, 'framework-components-qa');
            expect(result.correct).toBe(true);
            expect(result.score).toBe(1);
        });

        it('should accept case-variant QA response', async () => {
            await setResponse(frame, 'framework-components-qa', { 'framework-components-qa_answer': 'CMI5' });
            const result = await checkAnswer(frame, 'framework-components-qa');
            expect(result.correct).toBe(true);
        });

        it('should reject incorrect QA response', async () => {
            await setResponse(frame, 'framework-components-qa', { 'framework-components-qa_answer': 'SCORM 1.2' });
            const result = await checkAnswer(frame, 'framework-components-qa');
            expect(result.correct).toBe(false);
            expect(result.score).toBe(0);
        });

        it('getCorrectResponse should return prefixed keys', async () => {
            const correct = await automation(frame, 'getCorrectResponse', 'framework-components-qa');
            expect(correct).toHaveProperty('framework-components-qa_answer');
            // Round-trip
            await setResponse(frame, 'framework-components-qa', correct);
            const result = await checkAnswer(frame, 'framework-components-qa');
            expect(result.correct).toBe(true);
        });
    });

    // ─── API Consistency ─────────────────────────────────────

    describe('API Consistency', () => {
        it('getCorrectResponse output should be directly usable with setResponse', async () => {
            // Test all fill-in types: getCorrectResponse → setResponse → checkAnswer
            // should work WITHOUT any key transformation
            const fillInIds = ['lms-standards-text', 'requirements-spec-fillin', 'framework-components-qa'];
            for (const id of fillInIds) {
                const correct = await automation(frame, 'getCorrectResponse', id);
                await setResponse(frame, id, correct);
                const result = await checkAnswer(frame, id);
                expect(result.correct).toBe(true);
            }
        });
    });
});
