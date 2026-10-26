import { describe, expect, it, vi } from 'vitest';
import {
    Scorm12Driver,
    createScorm12DietState,
    decodeScorm12SuspendState,
    encodeScorm12SuspendState,
    encodeScorm12SuspendStateWithinLimit,
    expandScorm12DietState,
    SUSPEND_DATA_OVERFLOW
} from '../../../framework/js/drivers/scorm-12-driver.js';
import { eventBus } from '../../../framework/js/core/event-bus.js';

/**
 * Realistic state for a 20-question quiz after two attempts: the append-only
 * interactions history, archived attempt summaries and slide timers that
 * previously pushed SCORM 1.2 suspend_data past 4096 characters.
 */
function createTwoAttemptQuizState() {
    const slides = Array.from({ length: 24 }, (_, i) => `module-${Math.floor(i / 6) + 1}-slide-${i + 1}`);
    const questionIds = Array.from({ length: 20 }, (_, i) => `quiz-question-${i + 1}`);
    const interactions = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
        questionIds.forEach((id, i) => {
            interactions.push({
                id: `final-exam_${id}_attempt${attempt}`,
                type: 'choice',
                learner_response: `choice-${(i + attempt) % 4}`,
                result: (i + attempt) % 3 === 0 ? 'incorrect' : 'correct',
                description: `Question ${i + 1}: Which option best describes the scenario ${i}?`,
                timestamp: `2026-05-0${attempt}T10:${String(10 + i).padStart(2, '0')}:00.000Z`,
                weighting: 1,
                latency: `PT${20 + i}S`,
                correct_responses: [`choice-${i % 4}`],
                objectives: ['final-exam-objective'],
                _index: interactions.length
            });
        });
    }
    const questionResults = questionIds.map((id, i) => ({ id, correct: i % 3 !== 0 }));
    const summaryFor = attemptNumber => ({
        attemptNumber,
        totalQuestions: 20,
        correctCount: 13 + attemptNumber,
        scorePercentage: 65 + attemptNumber * 5,
        passed: attemptNumber === 2,
        questionResults
    });

    return {
        _meta: { schemaVersion: 1, courseVersion: '1.0.0', createdAt: '2026-05-01T10:00:00.000Z' },
        navigation: { visitedSlides: slides },
        engagement: Object.fromEntries(slides.map(id => [id, { complete: true, tracked: { viewedTabs: ['a', 'b'] } }])),
        objectives: { 'final-exam-objective': { completion_status: 'completed', success_status: 'passed', score: 75 } },
        interactions,
        interactionResponses: { 'knowledge-check-1': { response: 'b', submitted: true } },
        assessment_final_exam: {
            summary: {
                attempts: 2,
                submitted: true,
                lastResults: summaryFor(2),
                attempt_1: summaryFor(1),
                attempt_2: summaryFor(2)
            },
            session: { responses: Object.fromEntries(questionIds.map((id, i) => [id, `choice-${i % 4}`])) }
        },
        sessionData: {
            slideDurations: Object.fromEntries(slides.map((id, i) => [id, 30000 + i * 1371])),
            slideStartTimes: Object.fromEntries(slides.map((id, i) => [id, 1777000000000 + i * 99991]))
        }
    };
}

function createDriver() {
    const driver = new Scorm12Driver();
    driver._scorm = { set: vi.fn(() => true) };
    driver._cache.bookmark = 'module-4-slide-24';
    return driver;
}

describe('SCORM 1.2 suspend_data overflow trimming', () => {
    it('simulation: a 20-question quiz after two attempts no longer exceeds 4096', () => {
        const state = createTwoAttemptQuizState();
        const formerPayload = encodeScorm12SuspendState({ v: 2, s: state });
        expect(formerPayload.length).toBeGreaterThan(4096);

        const driver = createDriver();
        expect(() => driver.setSuspendData(state)).not.toThrow();

        const written = driver._scorm.set.mock.calls.find(([key]) => key === 'cmi.suspend_data')[1];
        expect(written.length).toBeLessThanOrEqual(4096);
    });

    it('never stores the append-only interactions history (already in cmi.interactions)', () => {
        const state = createTwoAttemptQuizState();
        const expanded = expandScorm12DietState(createScorm12DietState(state, 'slide-1'));
        expect(expanded.interactions).toBeUndefined();
        expect(expanded.assessment_final_exam.summary.attempt_1).toBeDefined();
    });

    it('keeps every resume-critical domain intact after trimming', () => {
        const state = createTwoAttemptQuizState();
        const { encoded, tier } = encodeScorm12SuspendStateWithinLimit(state, 'module-4-slide-24');
        const restored = expandScorm12DietState(decodeScorm12SuspendState(encoded));

        expect(tier).toBeGreaterThanOrEqual(0);
        expect(restored.navigation.visitedSlides).toEqual(state.navigation.visitedSlides);
        expect(restored.navigation.currentSlide).toBe('module-4-slide-24');
        expect(restored.engagement).toEqual(state.engagement);
        expect(restored.objectives).toEqual(state.objectives);
        expect(restored.interactionResponses).toEqual(state.interactionResponses);
        expect(restored.assessment_final_exam.session).toEqual(state.assessment_final_exam.session);
        expect(restored.assessment_final_exam.summary).toMatchObject({
            attempts: 2,
            submitted: true,
            lastResults: { scorePercentage: 75, passed: true }
        });
        expect(restored.sessionData.slideDurations).toEqual(state.sessionData.slideDurations);
    });

    it('trims progressively: attempt history before transient timing before optional domains', () => {
        const state = { ...createTwoAttemptQuizState(), video: { position: 12 }, comments: ['note'] };

        const tier1 = createScorm12DietState(state, null, 1).s;
        expect(tier1.assessment_final_exam.summary.attempt_1).toBeUndefined();
        expect(tier1.assessment_final_exam.summary.lastResults.questionResults).toBeUndefined();
        expect(tier1.sessionData.slideStartTimes).toBeDefined();

        const tier2 = createScorm12DietState(state, null, 2).s;
        expect(tier2.sessionData.slideStartTimes).toBeUndefined();
        expect(tier2.video).toBeUndefined();
        expect(tier2.comments).toEqual(['note']);

        const tier3 = createScorm12DietState(state, null, 3).s;
        expect(tier3.comments).toBeUndefined();
        expect(tier3.navigation).toBeDefined();
    });

    it('emits suspend-data:warning when a trimming tier was needed', () => {
        const state = createTwoAttemptQuizState();
        // Many retakes: archived attempt summaries alone outgrow the limit.
        for (let attempt = 1; attempt <= 40; attempt++) {
            state.assessment_final_exam.summary[`attempt_${attempt}`] = {
                attemptNumber: attempt,
                scorePercentage: (attempt * 37) % 101,
                questionResults: Array.from({ length: 20 }, (_, i) => ({
                    id: `q${i}-${(attempt * 31 + i * 17) % 97}`,
                    correct: ((attempt * 13) + i) % 3 === 0
                }))
            };
        }
        expect(encodeScorm12SuspendStateWithinLimit(state).tier).toBeGreaterThan(0);

        const emit = vi.spyOn(eventBus, 'emit');
        try {
            createDriver().setSuspendData(state);
            expect(emit).toHaveBeenCalledWith('suspend-data:warning', expect.objectContaining({
                format: 'scorm1.2',
                trimTier: expect.any(String)
            }));
        } finally {
            emit.mockRestore();
        }
    });

    it('throws a coded overflow (and emits critical) without writing when even core state cannot fit', () => {
        const emit = vi.spyOn(eventBus, 'emit');
        const driver = createDriver();
        // Random-ish content defeats compression.
        const noise = Array.from({ length: 3000 }, (_, i) => ((i * 7919) % 104729).toString(36)).join('');
        try {
            let thrown;
            try {
                driver.setSuspendData({ flags: { noise } });
            } catch (error) {
                thrown = error;
            }
            expect(thrown?.code).toBe(SUSPEND_DATA_OVERFLOW);
            expect(emit).toHaveBeenCalledWith('suspend-data:critical', expect.objectContaining({ format: 'scorm1.2' }));
            expect(driver._scorm.set).not.toHaveBeenCalled();
        } finally {
            emit.mockRestore();
        }
    });
});
