/**
 * E2E: Course Completion, Score Reporting, & Assessment Lifecycle
 *
 * Tests the full happy path and failure paths:
 *   - Course completion marking
 *   - Exact score values via LMS API
 *   - Failed assessment → incomplete course
 *   - Assessment re-attempt flow
 *   - Interaction CMI recording after assessment submission
 *   - Session resume with assessment state
 *
 * Uses the template course which has:
 *   - Assessment: example-final-exam (2 questions, passingScore: 50, requirePass: true)
 *   - Scoring: type 'average', source 'assessment:example-final-exam'
 *   - Last slide: example-summary (gated behind passing exam)
 *   - Q1: MCQ (choice-0 = correct), Q2: fill-in (3 blanks)
 *
 * Each describe block gets its own browser for full state isolation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchBrowser, loadCourse, URL } from './helpers/setup.js';
import {
    goToSlide, getCurrentSlide, waitForReady,
    lmsReset, lmsScore, lmsCompletion, lmsInteractions,
    waitForLmsScore, waitForLmsCompletion
} from './helpers/automation.js';


// ── DOM Helpers ──────────────────────────────────────────────────────────────

/** Click a button matching `[data-testid]` inside the iframe. */
async function clickTestId(frame, testId) {
    await frame.evaluate((id) => {
        const btn = document.querySelector(`[data-testid="${id}"]`);
        if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); }
    }, testId);
}

/** Click the first matching `[data-action]` element. */
async function clickAction(frame, action) {
    await frame.evaluate((act) => {
        const el = document.querySelector(`[data-action="${act}"]`);
        if (el) { el.scrollIntoView({ block: 'center' }); el.click(); }
    }, action);
}

/** Answer Q1 (MCQ): click the correct choice (index 0) or wrong choice (index 1). */
async function answerMCQ(frame, correct = true) {
    const index = correct ? 0 : 1;
    await frame.evaluate((idx) => {
        const choice = document.querySelector(`[data-testid="coursecode-fundamentals-choice-${idx}"]`)
            || document.querySelectorAll('.choice-option')[idx];
        if (choice) { choice.scrollIntoView({ block: 'center' }); choice.click(); }
    }, index);
    await new Promise(r => setTimeout(r, 300));
}

/** Answer Q2 (fill-in-blank): fill all 3 inputs with correct or wrong values. */
async function answerFillIn(frame, correct = true) {
    const answers = correct
        ? ['coursecode create', 'coursecode dev', 'coursecode build']
        : ['wrong', 'wrong', 'wrong'];

    await frame.evaluate((vals) => {
        const inputs = document.querySelectorAll('input[type="text"]');
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        inputs.forEach((input, i) => {
            if (i < vals.length) {
                setter.call(input, vals[i]);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }, answers);
    await new Promise(r => setTimeout(r, 300));
}

/** Visit all prerequisite slides to unlock the assessment gating. */
async function visitAllPrerequisites(frame) {
    const slides = [
        'example-welcome', 'example-workflow', 'example-preview-tour',
        'example-course-structure', 'example-ui-showcase',
        'example-interactions-showcase', 'example-finishing'
    ];
    for (const id of slides) {
        await goToSlide(frame, id);
        await new Promise(r => setTimeout(r, 200));
    }
}

/** Full assessment flow: navigate → start → answer Q1 → next → answer Q2 → next(review) → submit. */
async function completeAssessment(frame, { q1Correct = true, q2Correct = true } = {}) {
    await goToSlide(frame, 'example-final-exam');
    await new Promise(r => setTimeout(r, 500));

    // Start
    await clickTestId(frame, 'assessment-start');
    await new Promise(r => setTimeout(r, 800));

    // Q1
    await answerMCQ(frame, q1Correct);

    // Next → Q2
    await clickTestId(frame, 'assessment-nav-next');
    await new Promise(r => setTimeout(r, 600));

    // Q2
    await answerFillIn(frame, q2Correct);

    // Next → review (allowReview: true in template)
    await clickTestId(frame, 'assessment-nav-next');
    await new Promise(r => setTimeout(r, 600));

    // Submit
    await clickTestId(frame, 'assessment-submit');
    await new Promise(r => setTimeout(r, 1500));
}


// ═════════════════════════════════════════════════════════════════════════════
// 1. HAPPY PATH: Complete course with passing assessment (100%)
// ═════════════════════════════════════════════════════════════════════════════
describe('Happy Path: Course Completion with 100% Score', () => {
    let browser, page, frame;

    beforeAll(async () => {
        await lmsReset();
        browser = await launchBrowser();
        ({ page, frame } = await loadCourse(browser));
    }, 60000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    it('should visit all prerequisite slides', async () => {
        await visitAllPrerequisites(frame);
        const current = await getCurrentSlide(frame);
        expect(current).toBe('example-finishing');
    });

    it('should complete assessment with 100% correct answers', async () => {
        await completeAssessment(frame, { q1Correct: true, q2Correct: true });
        const slide = await getCurrentSlide(frame);
        expect(slide).toBe('example-final-exam');
    });

    it('should report exact score values: raw=100, scaled=1, min=0, max=100', async () => {
        const score = await waitForLmsScore(s => s.scaled !== null && s.scaled !== undefined);
        expect(score.raw).toBe(100);
        expect(score.scaled).toBe(1);
        expect(score.min).toBe(0);
        expect(score.max).toBe(100);
    });

    it('should navigate to last slide (example-summary) after passing', async () => {
        await goToSlide(frame, 'example-summary');
        await new Promise(r => setTimeout(r, 500));
        const current = await getCurrentSlide(frame);
        expect(current).toBe('example-summary');
    });

    it('should mark completion=completed and success=passed', async () => {
        const completion = await waitForLmsCompletion(c => c.completion === 'completed');
        expect(completion.completion).toBe('completed');
        expect(completion.success).toBe('passed');
    });

    it('should be visible via in-browser Automation API', async () => {
        const lmsStateData = await frame.evaluate(() => {
            return window.CourseCodeAutomation.getLmsState();
        });
        expect(lmsStateData.completion).toBe('completed');
        expect(lmsStateData.success).toBe('passed');
        expect(lmsStateData.score).not.toBeNull();
        expect(lmsStateData.score.raw).toBe(100);
    });
});


// ═════════════════════════════════════════════════════════════════════════════
// 2. INTERACTION CMI RECORDING
// ═════════════════════════════════════════════════════════════════════════════
describe('Interaction CMI Recording', () => {
    let browser, page, frame;

    beforeAll(async () => {
        await lmsReset();
        browser = await launchBrowser();
        ({ page, frame } = await loadCourse(browser));
        await visitAllPrerequisites(frame);
        await completeAssessment(frame, { q1Correct: true, q2Correct: true });
    }, 60000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    it('should record assessment questions as CMI interactions', async () => {
        const { interactions } = await lmsInteractions();

        expect(interactions).toBeDefined();
        expect(Array.isArray(interactions)).toBe(true);
        // 2 questions → at least 2 interaction records
        expect(interactions.length).toBeGreaterThanOrEqual(2);
    });

    it('should record correct interaction types and results', async () => {
        const { interactions } = await lmsInteractions();

        // MCQ interaction → type 'choice', result 'correct'
        const mcq = interactions.find(i => i.id?.includes('coursecode-fundamentals'));
        expect(mcq).toBeDefined();
        expect(mcq.type).toBe('choice');
        expect(mcq.result).toBe('correct');

        // Fill-in interaction → type 'fill-in', result 'correct'
        const fillin = interactions.find(i => i.id?.includes('coursecode-commands'));
        expect(fillin).toBeDefined();
        expect(fillin.result).toBe('correct');
    });
});


// ═════════════════════════════════════════════════════════════════════════════
// 3. FAILED ASSESSMENT → Course stays incomplete
// ═════════════════════════════════════════════════════════════════════════════
describe('Failed Assessment: Course Stays Incomplete', () => {
    let browser, page, frame;

    beforeAll(async () => {
        await lmsReset();
        browser = await launchBrowser();
        ({ page, frame } = await loadCourse(browser));
        await visitAllPrerequisites(frame);
    }, 60000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    it('should submit assessment with all wrong answers', async () => {
        await completeAssessment(frame, { q1Correct: false, q2Correct: false });
    });

    it('should report score of 0%', async () => {
        const score = await waitForLmsScore(s => s.raw !== null && s.raw !== undefined);
        expect(score.raw).toBe(0);
        expect(score.scaled).toBe(0);
    });

    it('should NOT mark course as completed (requirePass: true)', async () => {
        await new Promise(r => setTimeout(r, 500));
        const completion = await lmsCompletion();
        expect(completion.completion).not.toBe('completed');
        expect(completion.success).not.toBe('passed');
    });

    it('should record failed interactions in CMI', async () => {
        const { interactions } = await lmsInteractions();
        expect(interactions.length).toBeGreaterThanOrEqual(2);

        const mcq = interactions.find(i => i.id?.includes('coursecode-fundamentals'));
        expect(mcq).toBeDefined();
        expect(mcq.result).toBe('incorrect');
    });
});


// ═════════════════════════════════════════════════════════════════════════════
// 4. ASSESSMENT RE-ATTEMPT: Fail → Retake → Pass
// ═════════════════════════════════════════════════════════════════════════════
describe('Assessment Re-Attempt Flow', () => {
    let browser, page, frame;

    beforeAll(async () => {
        await lmsReset();
        browser = await launchBrowser();
        ({ page, frame } = await loadCourse(browser));
        await visitAllPrerequisites(frame);
    }, 60000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    it('should fail the first attempt', async () => {
        await completeAssessment(frame, { q1Correct: false, q2Correct: false });
        const score = await waitForLmsScore(s => s.raw !== null && s.raw !== undefined);
        expect(score.raw).toBe(0);
    }, 30000);

    it('should retake the assessment', async () => {
        await clickAction(frame, 'retake');
        await new Promise(r => setTimeout(r, 500));

        let hasStart = await frame.$('[data-testid="assessment-start"]');
        if (!hasStart) {
            await clickAction(frame, 'go-to-remedial');
            await new Promise(r => setTimeout(r, 800));
            await goToSlide(frame, 'example-final-exam');
            await new Promise(r => setTimeout(r, 800));
        }

        hasStart = await frame.$('[data-testid="assessment-start"]');
        if (!hasStart) {
            await clickAction(frame, 'retake');
            await new Promise(r => setTimeout(r, 800));
        }
    });

    it('should pass the second attempt with 100% correct answers', async () => {
        await clickTestId(frame, 'assessment-start');
        await new Promise(r => setTimeout(r, 800));

        await answerMCQ(frame, true);
        await clickTestId(frame, 'assessment-nav-next');
        await new Promise(r => setTimeout(r, 600));

        await answerFillIn(frame, true);
        await clickTestId(frame, 'assessment-nav-next');
        await new Promise(r => setTimeout(r, 600));

        await clickTestId(frame, 'assessment-submit');
        await new Promise(r => setTimeout(r, 1500));
    });

    it('should update score to 100% after passing on second attempt', async () => {
        const score = await waitForLmsScore(s => s.scaled !== null && s.scaled !== undefined);
        expect(score.raw).toBe(100);
        expect(score.scaled).toBe(1);
    });

    it('should record interactions for both attempts', async () => {
        const { interactions } = await lmsInteractions();

        // Each attempt records 2 questions → at least 4 total
        expect(interactions.length).toBeGreaterThanOrEqual(4);

        // Attempt 1 and attempt 2 should have different IDs
        const attempt1 = interactions.filter(i => i.id?.includes('attempt-1'));
        const attempt2 = interactions.filter(i => i.id?.includes('attempt-2'));
        expect(attempt1.length).toBe(2);
        expect(attempt2.length).toBe(2);
    });

    it('should navigate to summary and complete the course', async () => {
        await goToSlide(frame, 'example-summary');
        await new Promise(r => setTimeout(r, 1500));

        const current = await getCurrentSlide(frame);
        expect(current).toBe('example-summary');

        const completion = await waitForLmsCompletion(c => c.completion === 'completed');
        expect(completion.completion).toBe('completed');
        expect(completion.success).toBe('passed');
    });
});


// ═════════════════════════════════════════════════════════════════════════════
// 5. SESSION RESUME WITH ASSESSMENT STATE
// ═════════════════════════════════════════════════════════════════════════════
describe('Session Resume with Assessment State', () => {
    let browser, page, frame;

    beforeAll(async () => {
        await lmsReset();
        browser = await launchBrowser();
        ({ page, frame } = await loadCourse(browser));
        await visitAllPrerequisites(frame);
    }, 60000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    it('should start assessment and answer first question', async () => {
        await goToSlide(frame, 'example-final-exam');
        await new Promise(r => setTimeout(r, 500));

        await clickTestId(frame, 'assessment-start');
        await new Promise(r => setTimeout(r, 800));

        await answerMCQ(frame, true);
        await new Promise(r => setTimeout(r, 500));

        // Wait for state to be persisted (flush debounce)
        await new Promise(r => setTimeout(r, 2000));
    });

    it('should persist assessment state after page reload', async () => {
        // Reload the page (simulates session resume)
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
        frame = await waitForReady(page);

        // Course should resume at the bookmarked slide
        const current = await getCurrentSlide(frame);
        expect(current).toBeDefined();

        // Verify the LMS state survived
        const lmsStateData = await frame.evaluate(() => {
            return window.CourseCodeAutomation.getLmsState();
        });
        expect(lmsStateData).toBeDefined();
        expect(lmsStateData.state).toBeDefined();

        const assessmentDomain = lmsStateData.state?.['assessment_example-final-exam'];
        expect(assessmentDomain).toBeDefined();
        expect(assessmentDomain.session).toBeDefined();
    });
});


// ═════════════════════════════════════════════════════════════════════════════
// 6. PARTIAL SCORE: Q1 correct + Q2 wrong = 50%
// ═════════════════════════════════════════════════════════════════════════════
describe('Partial Score Reporting (50%)', () => {
    let browser, page, frame;

    beforeAll(async () => {
        await lmsReset();
        browser = await launchBrowser();
        ({ page, frame } = await loadCourse(browser));
        await visitAllPrerequisites(frame);
    }, 60000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    it('should submit with Q1 correct and Q2 wrong', async () => {
        await completeAssessment(frame, { q1Correct: true, q2Correct: false });
    });

    it('should report exact 50% score (1/2 questions, equal weight)', async () => {
        const score = await waitForLmsScore(s => s.scaled !== null && s.scaled !== undefined);
        expect(score.raw).toBe(50);
        expect(score.scaled).toBe(0.5);
        expect(score.min).toBe(0);
        expect(score.max).toBe(100);
    });

    it('should pass (passingScore=50, score=50 → passes on boundary)', async () => {
        await goToSlide(frame, 'example-summary');
        await new Promise(r => setTimeout(r, 1500));

        const current = await getCurrentSlide(frame);
        expect(current).toBe('example-summary');

        const completion = await waitForLmsCompletion(c => c.completion === 'completed');
        expect(completion.completion).toBe('completed');
        expect(completion.success).toBe('passed');
    });
});
