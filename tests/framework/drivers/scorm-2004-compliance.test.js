import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Scorm2004Driver } from '../../../framework/js/drivers/scorm-2004-driver.js';
import LZString from 'lz-string';

// ─── SCORM 2004 4th Edition Compliance Tests ─────────────────────────
//
// These tests verify conformance to the SCORM 2004 4th Edition specification.
// The expected values below are defined by the standard, NOT derived from
// our driver implementation. If a test fails, it means our driver disagrees
// with the spec — the test is right, the driver is wrong.
//
// Reference: SCORM 2004 4th Edition Run-Time Environment (RTE) Data Model

// ═════════════════════════════════════════════════════════════════════
// SCORM 2004 Data Model Elements (from the spec)
// ═════════════════════════════════════════════════════════════════════

const SCORM_2004_SPEC = {
    // RTE 4.2.15 - cmi.completion_status
    completionStatus: {
        element: 'cmi.completion_status',
        vocabulary: ['completed', 'incomplete', 'not attempted', 'unknown']
    },

    // RTE 4.2.21 - cmi.success_status
    successStatus: {
        element: 'cmi.success_status',
        vocabulary: ['passed', 'failed', 'unknown']
    },

    // RTE 4.2.17 - cmi.exit
    exit: {
        element: 'cmi.exit',
        vocabulary: ['time-out', 'suspend', 'logout', 'normal', '']
    },

    // RTE 4.2.19 - cmi.location (SPM 1000 characters)
    location: {
        element: 'cmi.location'
    },

    // RTE 4.2.20 - cmi.progress_measure (0.0 to 1.0)
    progressMeasure: {
        element: 'cmi.progress_measure',
        range: [0.0, 1.0]
    },

    // RTE 4.2.22 - cmi.session_time (ISO 8601 duration)
    sessionTime: {
        element: 'cmi.session_time'
    },

    // RTE 4.2.14 - cmi.score
    score: {
        raw: 'cmi.score.raw',
        scaled: 'cmi.score.scaled',        // -1.0 to 1.0
        min: 'cmi.score.min',
        max: 'cmi.score.max'
    },

    // RTE 4.2.23 - cmi.suspend_data (SPM 64000 characters)
    suspendData: {
        element: 'cmi.suspend_data',
        spm: 64000
    },

    // RTE 4.2.11 - cmi.interactions.n
    interactions: {
        prefix: 'cmi.interactions',
        // Required elements
        id: 'id',
        type: 'type',
        // Type vocabulary (RTE 4.2.11.2)
        typeVocabulary: [
            'true-false', 'choice', 'fill-in', 'long-fill-in',
            'likert', 'matching', 'performance', 'sequencing',
            'numeric', 'other'
        ],
        // Optional elements
        learnerResponse: 'learner_response',  // NOT student_response (that's 1.2)
        result: 'result',
        resultVocabulary: ['correct', 'incorrect', 'unanticipated', 'neutral'],
        timestamp: 'timestamp',
        description: 'description',
        weighting: 'weighting',
        latency: 'latency',
        correctResponses: 'correct_responses',
        objectives: 'objectives'
    },

    // RTE 4.2.6 - cmi.objectives.n
    objectives: {
        prefix: 'cmi.objectives',
        id: 'id',
        completionStatus: 'completion_status',
        successStatus: 'success_status',
        score: {
            raw: 'score.raw',
            scaled: 'score.scaled',
            min: 'score.min',
            max: 'score.max'
        },
        description: 'description',
        progressMeasure: 'progress_measure'
    }
};

// ═════════════════════════════════════════════════════════════════════
// Test Harness
// ═════════════════════════════════════════════════════════════════════

function createTestableDriver() {
    const driver = new Scorm2004Driver();
    const writes = [];
    const reads = {};

    driver._isConnected = true;
    driver._isTerminated = false;

    driver._setValue = (key, value) => {
        writes.push({ key, value });
        reads[key] = value;
    };

    driver._getValue = (key) => {
        return reads[key] || '';
    };

    driver._cmiCache = {
        entry: 'ab-initio',
        bookmark: '',
        completionStatus: 'unknown',
        successStatus: 'unknown',
        scoreRaw: null, scoreScaled: null, scoreMin: null, scoreMax: null,
        progressMeasure: null,
        interactions: [],
        interactionsCount: 0,
        objectives: [],
        objectivesCount: 0,
        objectiveIdToIndex: new Map()
    };

    return { driver, writes, reads };
}

// ═════════════════════════════════════════════════════════════════════
// Tests: Data Model Element Names
// Verify our driver writes to the correct CMI paths per the spec
// ═════════════════════════════════════════════════════════════════════

describe('SCORM 2004 Spec: Data Model Element Names', () => {
    it('writes completion_status to the spec-defined element', () => {
        const { driver, writes } = createTestableDriver();
        driver.reportCompletion('completed');

        expect(writes[0].key).toBe(SCORM_2004_SPEC.completionStatus.element);
    });

    it('writes success_status to the spec-defined element', () => {
        const { driver, writes } = createTestableDriver();
        driver.reportSuccess('passed');

        expect(writes[0].key).toBe(SCORM_2004_SPEC.successStatus.element);
    });

    it('writes location (bookmark) to the spec-defined element', () => {
        const { driver, writes } = createTestableDriver();
        driver.setBookmark('slide-5');

        expect(writes[0].key).toBe(SCORM_2004_SPEC.location.element);
    });

    it('writes progress_measure to the spec-defined element', () => {
        const { driver, writes } = createTestableDriver();
        driver.reportProgress(0.75);

        expect(writes[0].key).toBe(SCORM_2004_SPEC.progressMeasure.element);
    });

    it('writes session_time to the spec-defined element', () => {
        const { driver, writes } = createTestableDriver();
        driver.reportSessionTime('PT1H30M');

        expect(writes[0].key).toBe(SCORM_2004_SPEC.sessionTime.element);
    });

    it('writes exit to the spec-defined element', () => {
        const { driver, writes } = createTestableDriver();
        driver.setExitMode('suspend');

        expect(writes[0].key).toBe(SCORM_2004_SPEC.exit.element);
    });

    it('writes score fields to spec-defined elements', () => {
        const { driver, writes } = createTestableDriver();
        driver.reportScore({ raw: 85, scaled: 0.85, min: 0, max: 100 });

        const keys = writes.map(w => w.key);
        expect(keys).toContain(SCORM_2004_SPEC.score.raw);
        expect(keys).toContain(SCORM_2004_SPEC.score.scaled);
        expect(keys).toContain(SCORM_2004_SPEC.score.min);
        expect(keys).toContain(SCORM_2004_SPEC.score.max);
    });

    it('writes suspend_data to the spec-defined element', () => {
        const { driver, writes } = createTestableDriver();
        driver.setSuspendData({ test: true });

        expect(writes[0].key).toBe(SCORM_2004_SPEC.suspendData.element);
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: Data Model Value Vocabularies
// Verify values conform to the spec-defined vocabularies
// ═════════════════════════════════════════════════════════════════════

describe('SCORM 2004 Spec: Value Vocabularies', () => {
    it('reportCompletion writes only spec-valid completion values', () => {
        for (const validStatus of SCORM_2004_SPEC.completionStatus.vocabulary) {
            const { driver, writes } = createTestableDriver();
            driver.reportCompletion(validStatus);
            expect(SCORM_2004_SPEC.completionStatus.vocabulary).toContain(writes[0].value);
        }
    });

    it('reportSuccess writes only spec-valid success values', () => {
        for (const validStatus of SCORM_2004_SPEC.successStatus.vocabulary) {
            const { driver, writes } = createTestableDriver();
            driver.reportSuccess(validStatus);
            expect(SCORM_2004_SPEC.successStatus.vocabulary).toContain(writes[0].value);
        }
    });

    it('setExitMode("suspend") writes a spec-valid exit value', () => {
        const { driver, writes } = createTestableDriver();
        driver.setExitMode('suspend');
        expect(SCORM_2004_SPEC.exit.vocabulary).toContain(writes[0].value);
    });

    it('setExitMode("normal") writes empty string (spec-valid)', () => {
        const { driver, writes } = createTestableDriver();
        driver.setExitMode('normal');
        expect(SCORM_2004_SPEC.exit.vocabulary).toContain(writes[0].value);
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: Score Constraints (RTE 4.2.14)
// cmi.score.scaled: -1.0 to 1.0
// All score values must be written as strings
// ═════════════════════════════════════════════════════════════════════

describe('SCORM 2004 Spec: Score Constraints', () => {
    it('writes all score values as strings (SCORM 2004 requirement)', () => {
        const { driver, writes } = createTestableDriver();
        driver.reportScore({ raw: 85, scaled: 0.85, min: 0, max: 100 });

        for (const write of writes) {
            expect(typeof write.value).toBe('string');
        }
    });

    it('only writes provided score fields (omits undefined)', () => {
        const { driver, writes } = createTestableDriver();
        driver.reportScore({ raw: 85 });

        const keys = writes.map(w => w.key);
        expect(keys).toContain(SCORM_2004_SPEC.score.raw);
        expect(keys).not.toContain(SCORM_2004_SPEC.score.scaled);
        expect(keys).not.toContain(SCORM_2004_SPEC.score.min);
        expect(keys).not.toContain(SCORM_2004_SPEC.score.max);
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: Interaction Data Model (RTE 4.2.11)
// ═════════════════════════════════════════════════════════════════════

describe('SCORM 2004 Spec: Interaction Element Names', () => {
    it('writes interaction fields to spec-defined element paths', () => {
        const { driver, writes } = createTestableDriver();
        const spec = SCORM_2004_SPEC.interactions;

        driver.reportInteraction({
            id: 'q1',
            type: 'true-false',
            learner_response: 'true',
            result: 'correct',
            timestamp: '2026-02-08T22:00:00Z',
            description: 'Test question',
            weighting: 1,
            latency: 'PT10S'
        });

        const keys = writes.map(w => w.key);
        // Verify each field uses the spec-defined sub-element name
        expect(keys).toContain(`${spec.prefix}.0.${spec.id}`);
        expect(keys).toContain(`${spec.prefix}.0.${spec.type}`);
        expect(keys).toContain(`${spec.prefix}.0.${spec.learnerResponse}`);
        expect(keys).toContain(`${spec.prefix}.0.${spec.result}`);
        expect(keys).toContain(`${spec.prefix}.0.${spec.timestamp}`);
        expect(keys).toContain(`${spec.prefix}.0.${spec.description}`);
        expect(keys).toContain(`${spec.prefix}.0.${spec.weighting}`);
        expect(keys).toContain(`${spec.prefix}.0.${spec.latency}`);
    });

    it('uses "learner_response" NOT "student_response" (2004 vs 1.2)', () => {
        const { driver, writes } = createTestableDriver();
        driver.reportInteraction({ id: 'q1', type: 'true-false', learner_response: 'true' });

        const keys = writes.map(w => w.key);
        expect(keys).toContain('cmi.interactions.0.learner_response');
        expect(keys).not.toContain('cmi.interactions.0.student_response');
    });

    it('auto-increments interaction index (append-only per spec)', () => {
        const { driver, writes } = createTestableDriver();
        driver.reportInteraction({ id: 'q1', type: 'true-false' });
        driver.reportInteraction({ id: 'q2', type: 'choice' });

        expect(writes.find(w => w.key === 'cmi.interactions.0.id').value).toBe('q1');
        expect(writes.find(w => w.key === 'cmi.interactions.1.id').value).toBe('q2');
    });

    it('writes correct_responses.n.pattern per spec', () => {
        const { driver, writes } = createTestableDriver();
        driver.reportInteraction({
            id: 'q1', type: 'choice',
            correct_responses: [{ pattern: 'a[,]b' }]
        });

        expect(writes.find(w => w.key === 'cmi.interactions.0.correct_responses.0.pattern').value)
            .toBe('a[,]b');
    });

    it('writes objectives.n.id per spec', () => {
        const { driver, writes } = createTestableDriver();
        driver.reportInteraction({
            id: 'q1', type: 'choice',
            objectives: ['obj-1', 'obj-2']
        });

        expect(writes.find(w => w.key === 'cmi.interactions.0.objectives.0.id').value).toBe('obj-1');
        expect(writes.find(w => w.key === 'cmi.interactions.0.objectives.1.id').value).toBe('obj-2');
    });

    it('weighting is written as string', () => {
        const { driver, writes } = createTestableDriver();
        driver.reportInteraction({ id: 'q1', type: 'choice', weighting: 2 });
        expect(writes.find(w => w.key === 'cmi.interactions.0.weighting').value).toBe('2');
    });

    it('rejects interaction missing required id', () => {
        const { driver } = createTestableDriver();
        expect(() => driver.reportInteraction({ type: 'true-false' })).toThrow();
    });

    it('rejects interaction missing required type', () => {
        const { driver } = createTestableDriver();
        expect(() => driver.reportInteraction({ id: 'q1' })).toThrow();
    });

    it('skips null/undefined/empty learner_response', () => {
        const { driver, writes } = createTestableDriver();
        driver.reportInteraction({ id: 'q1', type: 'true-false', learner_response: null });
        expect(writes.find(w => w.key === 'cmi.interactions.0.learner_response')).toBeUndefined();
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: Objective Data Model (RTE 4.2.6)
// ═════════════════════════════════════════════════════════════════════

describe('SCORM 2004 Spec: Objective Element Names', () => {
    it('writes objective fields to spec-defined element paths', () => {
        const { driver, writes } = createTestableDriver();
        const spec = SCORM_2004_SPEC.objectives;

        driver.reportObjective({
            id: 'obj_1',
            completion_status: 'completed',
            success_status: 'passed',
            score: 90,
            description: 'Unit 1'
        });

        const keys = writes.map(w => w.key);
        expect(keys).toContain(`${spec.prefix}.0.${spec.id}`);
        expect(keys).toContain(`${spec.prefix}.0.${spec.completionStatus}`);
        expect(keys).toContain(`${spec.prefix}.0.${spec.successStatus}`);
        expect(keys).toContain(`${spec.prefix}.0.${spec.score.raw}`);
        expect(keys).toContain(`${spec.prefix}.0.${spec.score.scaled}`);
        expect(keys).toContain(`${spec.prefix}.0.${spec.description}`);
    });

    it('reuses index for same objective ID (spec: n is unique per id)', () => {
        const { driver, writes } = createTestableDriver();
        driver.reportObjective({ id: 'obj_1', completion_status: 'incomplete' });
        driver.reportObjective({ id: 'obj_1', completion_status: 'completed' });

        // Same index used both times
        const completionWrites = writes.filter(w => w.key === 'cmi.objectives.0.completion_status');
        expect(completionWrites).toHaveLength(2);
        expect(completionWrites[1].value).toBe('completed');

        // No index 1 created
        expect(writes.filter(w => w.key.startsWith('cmi.objectives.1'))).toHaveLength(0);
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: Suspend Data (RTE 4.2.23)
// ═════════════════════════════════════════════════════════════════════

describe('SCORM 2004 Spec: Suspend Data', () => {
    it('writes compressed data to cmi.suspend_data (decompressible)', () => {
        const { driver, reads } = createTestableDriver();
        const testData = { navigation: { visitedSlides: ['s1'] } };

        driver.setSuspendData(testData);
        const compressed = reads[SCORM_2004_SPEC.suspendData.element];

        // Must be decompressible back to original
        const json = LZString.decompressFromUTF16(compressed);
        expect(JSON.parse(json)).toEqual(testData);
    });

    it('roundtrips through setSuspendData → getSuspendData', () => {
        const { driver } = createTestableDriver();
        const testData = { _meta: { schemaVersion: 3 }, nav: { slides: ['a', 'b'] } };

        driver.setSuspendData(testData);
        expect(driver.getSuspendData()).toEqual(testData);
    });

    it('rejects null/undefined (spec: data type is characterstring)', () => {
        const { driver } = createTestableDriver();
        expect(() => driver.setSuspendData(null)).toThrow();
        expect(() => driver.setSuspendData(undefined)).toThrow();
    });

    it('returns null when no suspend_data exists', () => {
        const { driver } = createTestableDriver();
        expect(driver.getSuspendData()).toBeNull();
    });

    it('achieves compression on repetitive data (must fit 64KB SPM)', () => {
        const { driver, reads } = createTestableDriver();
        const largeState = {};
        for (let i = 0; i < 100; i++) {
            largeState[`slide_${i}`] = { complete: true, tracked: { scrollDepth: 100 } };
        }

        driver.setSuspendData(largeState);
        const compressed = reads[SCORM_2004_SPEC.suspendData.element];
        expect(compressed.length).toBeLessThan(JSON.stringify(largeState).length);
    });
});
