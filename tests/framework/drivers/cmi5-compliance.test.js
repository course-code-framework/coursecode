import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the @xapi/cmi5 external package — it's dynamically imported in the driver
// but not installed as a dev dependency. We test against our statement output,
// not the xAPI library itself.
vi.mock('@xapi/cmi5', () => ({}));

import { Cmi5Driver } from '../../../framework/js/drivers/cmi5-driver.js';

// ─── cmi5 Specification Compliance Tests ─────────────────────────────
//
// Tests verify conformance to the cmi5 specification (v1.0) and the
// xAPI (Experience API) specification that cmi5 is built on.
//
// The expected values below are defined by these standards:
//   - cmi5 Spec: https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md
//   - xAPI Spec: https://github.com/adlnet/xAPI-Spec
//   - ADL xAPI Vocabulary: http://adlnet.gov/expapi/verbs/
//   - xAPI Activity Types: http://adlnet.gov/expapi/activities/

// ═════════════════════════════════════════════════════════════════════
// cmi5 / xAPI Specification Reference
// ═════════════════════════════════════════════════════════════════════

const CMI5_SPEC = {
    // ── xAPI Verb IRIs (ADL Vocabulary) ──
    // These are the canonical verb identifiers. Using wrong IRIs means
    // statements will be unrecognized by LRS conformance validators.
    verbs: {
        initialized:  'http://adlnet.gov/expapi/verbs/initialized',
        completed:    'http://adlnet.gov/expapi/verbs/completed',
        passed:       'http://adlnet.gov/expapi/verbs/passed',
        failed:       'http://adlnet.gov/expapi/verbs/failed',
        terminated:   'http://adlnet.gov/expapi/verbs/terminated',
        abandoned:    'http://adlnet.gov/expapi/verbs/abandoned',
        answered:     'http://adlnet.gov/expapi/verbs/answered',
        experienced:  'http://adlnet.gov/expapi/verbs/experienced',
        progressed:   'http://adlnet.gov/expapi/verbs/progressed'
    },

    // ── xAPI Activity Types ──
    activityTypes: {
        cmiInteraction: 'http://adlnet.gov/expapi/activities/cmi.interaction',
        objective:      'http://adlnet.gov/expapi/activities/objective',
        assessment:     'http://adlnet.gov/expapi/activities/assessment',
        media:          'http://adlnet.gov/expapi/activities/media',
        course:         'http://adlnet.gov/expapi/activities/course'
    },

    // ── cmi5 moveOn Values (Section 10.0) ──
    moveOnVocabulary: [
        'Passed', 'Completed', 'CompletedAndPassed',
        'CompletedOrPassed', 'NotApplicable'
    ],

    // ── cmi5 launchMode Values (Section 10.0) ──
    launchModeVocabulary: ['Normal', 'Browse', 'Review'],

    // ── xAPI Score (Section 4.1.5) ──
    // result.score.scaled: decimal between -1.0 and 1.0
    scoreRange: { min: -1.0, max: 1.0 },

    // ── cmi5 Context Extensions ──
    contextExtensions: {
        attemptNumber: 'https://w3id.org/xapi/cmi5/context/extensions/attemptNumber',
        sessionId:     'https://w3id.org/xapi/cmi5/context/extensions/sessionid'
    },

    // ── cmi5 State IDs (Section 10.0) ──
    stateIds: {
        bookmark: 'https://w3id.org/xapi/cmi5/state/bookmark'
    },

    // ── xAPI Interaction Types (Section 4.1.4.1) ──
    interactionTypes: [
        'true-false', 'choice', 'fill-in', 'long-fill-in',
        'likert', 'matching', 'performance', 'sequencing',
        'numeric', 'other'
    ],

    // ── xAPI Statement Structure Requirements ──
    // Every statement MUST have: verb.id, verb.display, object.id
    // cmi5 statements MUST have: context.registration, context.contextActivities.parent
    requiredStatementFields: {
        verb: ['id', 'display'],
        object: ['id', 'definition'],
        context: ['registration', 'contextActivities']
    }
};

// ═════════════════════════════════════════════════════════════════════
// Test Harness — Mock cmi5 instance to capture statement payloads
// ═════════════════════════════════════════════════════════════════════

function createTestableDriver() {
    const driver = new Cmi5Driver();
    const sentStatements = [];

    // Simulate initialized state with a mock cmi5 instance
    driver._isConnected = true;
    driver._isTerminated = false;
    driver._mock = false; // We want to exercise real statement building

    driver._cmi5 = {
        getLaunchParameters: () => ({
            activityId: 'https://example.com/course/test-course',
            registration: 'reg-uuid-1234',
            actor: { mbox: 'mailto:test@example.com' }
        }),
        getLaunchData: () => ({
            launchMode: 'Normal',
            moveOn: 'CompletedOrPassed',
            masteryScore: 0.8
        }),
        xapi: {
            sendStatement: async (stmt) => {
                sentStatements.push(JSON.parse(JSON.stringify(stmt)));
            },
            setState: async () => {}
        },
        complete: async () => { sentStatements.push({ _lifecycle: 'completed' }); },
        pass: async (score) => { sentStatements.push({ _lifecycle: 'passed', score }); },
        fail: async (score) => { sentStatements.push({ _lifecycle: 'failed', score }); },
        terminate: async () => { sentStatements.push({ _lifecycle: 'terminated' }); }
    };

    return { driver, sentStatements };
}

// ═════════════════════════════════════════════════════════════════════
// Tests: xAPI Verb IRIs
// The verb IRI is how an LRS categorizes what happened. A wrong IRI
// means the statement is meaningless to conformant consumers.
// ═════════════════════════════════════════════════════════════════════

describe('cmi5 Spec: xAPI Verb IRIs', () => {
    it('interaction statements use the "answered" verb IRI', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendInteractionStatement({ id: 'q1', type: 'choice', response: 'a', correct: true });

        expect(sentStatements[0].verb.id).toBe(CMI5_SPEC.verbs.answered);
    });

    it('slide statements use the "experienced" verb IRI', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendSlideStatement({ id: 'slide-1', title: 'Intro' });

        expect(sentStatements[0].verb.id).toBe(CMI5_SPEC.verbs.experienced);
    });

    it('assessment statements use the "completed" verb IRI', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendAssessmentStatement({
            id: 'quiz-1', score: 0.9, passed: true, correctCount: 9,
            questionCount: 10, attemptNumber: 1
        });

        expect(sentStatements[0].verb.id).toBe(CMI5_SPEC.verbs.completed);
    });

    it('objective "completed" statements use the completed verb IRI', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendObjectiveStatement({ id: 'obj-1', verb: 'completed' });

        expect(sentStatements[0].verb.id).toBe(CMI5_SPEC.verbs.completed);
    });

    it('objective "passed" statements use the passed verb IRI', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendObjectiveStatement({ id: 'obj-1', verb: 'passed', score: 0.9 });

        expect(sentStatements[0].verb.id).toBe(CMI5_SPEC.verbs.passed);
    });

    it('objective "failed" statements use the failed verb IRI', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendObjectiveStatement({ id: 'obj-1', verb: 'failed', score: 0.3 });

        expect(sentStatements[0].verb.id).toBe(CMI5_SPEC.verbs.failed);
    });

    it('objective "progressed" statements use the progressed verb IRI', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendObjectiveStatement({ id: 'obj-1', verb: 'progressed' });

        expect(sentStatements[0].verb.id).toBe(CMI5_SPEC.verbs.progressed);
    });

    it('all verb IRIs include display language map', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendInteractionStatement({ id: 'q1', type: 'choice', response: 'a', correct: true });

        expect(sentStatements[0].verb.display).toBeDefined();
        expect(sentStatements[0].verb.display['en-US']).toBeDefined();
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: xAPI Activity Types
// ═════════════════════════════════════════════════════════════════════

describe('cmi5 Spec: xAPI Activity Types', () => {
    it('interaction objects use cmi.interaction activity type', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendInteractionStatement({ id: 'q1', type: 'choice', response: 'a', correct: true });

        expect(sentStatements[0].object.definition.type).toBe(CMI5_SPEC.activityTypes.cmiInteraction);
    });

    it('objective objects use objective activity type', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendObjectiveStatement({ id: 'obj-1', verb: 'completed' });

        expect(sentStatements[0].object.definition.type).toBe(CMI5_SPEC.activityTypes.objective);
    });

    it('assessment objects use assessment activity type', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendAssessmentStatement({
            id: 'quiz-1', score: 0.9, passed: true, correctCount: 9,
            questionCount: 10, attemptNumber: 1
        });

        expect(sentStatements[0].object.definition.type).toBe(CMI5_SPEC.activityTypes.assessment);
    });

    it('slide objects use media activity type', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendSlideStatement({ id: 'slide-1', title: 'Intro' });

        expect(sentStatements[0].object.definition.type).toBe(CMI5_SPEC.activityTypes.media);
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: xAPI Statement Structure
// cmi5 spec Section 9.0 — all statements must include registration
// and parent contextActivity referencing the AU's activityId
// ═════════════════════════════════════════════════════════════════════

describe('cmi5 Spec: Statement Structure Requirements', () => {
    it('all statements include context.registration (cmi5 Section 9.6)', async () => {
        const { driver, sentStatements } = createTestableDriver();

        await driver.sendInteractionStatement({ id: 'q1', type: 'choice', response: 'a', correct: true });
        await driver.sendSlideStatement({ id: 's1', title: 'Slide' });
        await driver.sendObjectiveStatement({ id: 'o1', verb: 'completed' });
        await driver.sendAssessmentStatement({
            id: 'a1', score: 0.9, passed: true, correctCount: 9,
            questionCount: 10, attemptNumber: 1
        });

        for (const stmt of sentStatements) {
            expect(stmt.context.registration).toBe('reg-uuid-1234');
        }
    });

    it('all statements include parent contextActivity (cmi5 Section 9.6.2)', async () => {
        const { driver, sentStatements } = createTestableDriver();
        const activityId = 'https://example.com/course/test-course';

        await driver.sendInteractionStatement({ id: 'q1', type: 'choice', response: 'a', correct: true });
        await driver.sendSlideStatement({ id: 's1', title: 'Slide' });
        await driver.sendObjectiveStatement({ id: 'o1', verb: 'completed' });

        for (const stmt of sentStatements) {
            expect(stmt.context.contextActivities.parent).toBeDefined();
            expect(stmt.context.contextActivities.parent[0].id).toBe(activityId);
        }
    });

    it('object.id follows activityId/type/id pattern', async () => {
        const { driver, sentStatements } = createTestableDriver();
        const activityId = 'https://example.com/course/test-course';

        await driver.sendInteractionStatement({ id: 'q1', type: 'choice', response: 'a', correct: true });
        await driver.sendObjectiveStatement({ id: 'obj1', verb: 'completed' });
        await driver.sendSlideStatement({ id: 'slide1' });
        await driver.sendAssessmentStatement({
            id: 'quiz1', score: 0.9, passed: true, correctCount: 9,
            questionCount: 10, attemptNumber: 1
        });

        expect(sentStatements[0].object.id).toBe(`${activityId}/interactions/q1`);
        expect(sentStatements[1].object.id).toBe(`${activityId}/objectives/obj1`);
        expect(sentStatements[2].object.id).toBe(`${activityId}/slides/slide1`);
        expect(sentStatements[3].object.id).toBe(`${activityId}/assessments/quiz1`);
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: xAPI Interaction Type Vocabulary
// ═════════════════════════════════════════════════════════════════════

describe('cmi5 Spec: Interaction Type Vocabulary', () => {
    for (const type of CMI5_SPEC.interactionTypes) {
        it(`accepts spec-valid interaction type: "${type}"`, async () => {
            const { driver, sentStatements } = createTestableDriver();
            await driver.sendInteractionStatement({ id: 'q1', type, response: 'a', correct: true });

            expect(sentStatements[0].object.definition.interactionType).toBe(type);
        });
    }

    it('falls back to "other" for unknown interaction types', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendInteractionStatement({ id: 'q1', type: 'custom-widget', response: 'x', correct: false });

        expect(sentStatements[0].object.definition.interactionType).toBe('other');
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: xAPI Result Fields
// ═════════════════════════════════════════════════════════════════════

describe('cmi5 Spec: Result Fields', () => {
    it('interaction result includes response and success (xAPI 4.1.5)', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendInteractionStatement({ id: 'q1', type: 'choice', response: 'b', correct: false });

        expect(sentStatements[0].result.response).toBe('b');
        expect(sentStatements[0].result.success).toBe(false);
    });

    it('assessment result includes score (scaled, raw, min, max) per xAPI spec', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendAssessmentStatement({
            id: 'quiz-1', score: 0.85, passed: true,
            correctCount: 17, questionCount: 20, attemptNumber: 2
        });

        const result = sentStatements[0].result;
        expect(result.score.scaled).toBe(0.85);
        expect(result.score.raw).toBe(17);
        expect(result.score.max).toBe(20);
        expect(result.score.min).toBe(0);
        expect(result.success).toBe(true);
        expect(result.completion).toBe(true);
    });

    it('assessment context includes attemptNumber extension (cmi5 spec)', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendAssessmentStatement({
            id: 'quiz-1', score: 0.9, passed: true,
            correctCount: 9, questionCount: 10, attemptNumber: 3
        });

        expect(sentStatements[0].context.extensions[CMI5_SPEC.contextExtensions.attemptNumber]).toBe(3);
    });

    it('objective "passed" sets result.success = true and result.completion = true', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendObjectiveStatement({ id: 'obj-1', verb: 'passed', score: 0.9, duration: 'PT30M' });

        expect(sentStatements[0].result.success).toBe(true);
        expect(sentStatements[0].result.completion).toBe(true);
    });

    it('objective "failed" sets result.success = false', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendObjectiveStatement({ id: 'obj-1', verb: 'failed', score: 0.3 });

        expect(sentStatements[0].result.success).toBe(false);
    });

    it('slide duration is included in result when provided', async () => {
        const { driver, sentStatements } = createTestableDriver();
        await driver.sendSlideStatement({ id: 'slide-1', title: 'Test', duration: 'PT5M' });

        expect(sentStatements[0].result.duration).toBe('PT5M');
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: cmi5 moveOn Vocabulary
// ═════════════════════════════════════════════════════════════════════

describe('cmi5 Spec: moveOn Values', () => {
    it('mock launch data uses spec-valid moveOn value', () => {
        const driver = new Cmi5Driver();
        driver._isConnected = true;
        driver._mock = true;

        const launchData = driver.getLaunchData();
        expect(CMI5_SPEC.moveOnVocabulary).toContain(launchData.moveOn);
    });

    it('mock launch data uses spec-valid launchMode value', () => {
        const driver = new Cmi5Driver();
        driver._isConnected = true;
        driver._mock = true;

        const launchData = driver.getLaunchData();
        expect(CMI5_SPEC.launchModeVocabulary).toContain(launchData.launchMode);
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: cmi5 Lifecycle Statement Order
// cmi5 Section 9.3 — specific order: Initialized → ... → Terminated
// ═════════════════════════════════════════════════════════════════════

describe('cmi5 Spec: Lifecycle Statement Order', () => {
    it('terminate sends Completed before Passed when both apply', async () => {
        const { driver, sentStatements } = createTestableDriver();
        driver._completionStatus = 'completed';
        driver._successStatus = 'passed';
        driver._score = 0.9;
        driver._sentComplete = false;
        driver._sentResult = false;

        await driver.terminate();

        // Completed first, then Passed, then Terminated
        expect(sentStatements[0]._lifecycle).toBe('completed');
        expect(sentStatements[1]._lifecycle).toBe('passed');
        expect(sentStatements[2]._lifecycle).toBe('terminated');
    });

    it('terminate sends Failed (not Passed) when learner failed', async () => {
        const { driver, sentStatements } = createTestableDriver();
        driver._completionStatus = 'completed';
        driver._successStatus = 'failed';
        driver._score = 0.3;
        driver._sentComplete = false;
        driver._sentResult = false;

        await driver.terminate();

        expect(sentStatements[1]._lifecycle).toBe('failed');
    });

    it('does not re-send Completed if already sent', async () => {
        const { driver, sentStatements } = createTestableDriver();
        driver._completionStatus = 'completed';
        driver._successStatus = 'passed';
        driver._score = 0.9;
        driver._sentComplete = true; // already sent
        driver._sentResult = false;

        await driver.terminate();

        // Should only send Passed and Terminated (no duplicate Completed)
        expect(sentStatements[0]._lifecycle).toBe('passed');
        expect(sentStatements[1]._lifecycle).toBe('terminated');
    });

    it('does not re-send result if already sent', async () => {
        const { driver, sentStatements } = createTestableDriver();
        driver._completionStatus = 'completed';
        driver._successStatus = 'passed';
        driver._sentComplete = true;
        driver._sentResult = true; // already sent

        await driver.terminate();

        // Only Terminated
        expect(sentStatements[0]._lifecycle).toBe('terminated');
    });

    it('terminate sends score with Passed statement', async () => {
        const { driver, sentStatements } = createTestableDriver();
        driver._completionStatus = 'completed';
        driver._successStatus = 'passed';
        driver._score = 0.85;
        driver._sentComplete = true;
        driver._sentResult = false;

        await driver.terminate();

        expect(sentStatements[0]._lifecycle).toBe('passed');
        expect(sentStatements[0].score).toEqual({ scaled: 0.85 });
    });
});
