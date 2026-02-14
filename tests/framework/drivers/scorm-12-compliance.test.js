import { describe, it, expect, beforeEach } from 'vitest';
import {
    mapStatusTo12,
    mapStatusTo2004,
    convertTimeFormat2004To12
} from '../../../framework/js/drivers/scorm-12-driver.js';
import { Scorm12Driver } from '../../../framework/js/drivers/scorm-12-driver.js';

// ─── SCORM 1.2 Compliance Tests ─────────────────────────────────────
//
// These tests verify conformance to the SCORM 1.2 Run-Time Environment
// specification. The expected values below are defined by the standard.
//
// Key differences from SCORM 2004 that MUST be correct:
//   1. Single cmi.core.lesson_status vs dual completion/success
//   2. cmi.core.* prefix (not cmi.*)
//   3. cmi.interactions.n.student_response (not learner_response)
//   4. 4096 character limit on cmi.suspend_data
//   5. No cmi.score.scaled
//   6. No cmi.progress_measure
//   7. Time format HHHH:MM:SS.SS (not ISO 8601)
//   8. cmi.core.lesson_location (not cmi.location)
//   9. Objectives use single .status (not completion_status + success_status)

// ═════════════════════════════════════════════════════════════════════
// SCORM 1.2 Data Model Reference (from the spec)
// ═════════════════════════════════════════════════════════════════════

const SCORM_12_SPEC = {
    // 3.4.4 - cmi.core.lesson_status
    lessonStatus: {
        element: 'cmi.core.lesson_status',
        vocabulary: ['passed', 'completed', 'failed', 'incomplete', 'browsed', 'not attempted']
    },

    // 3.4.2 - cmi.core.lesson_location (SPM 255 chars)
    lessonLocation: {
        element: 'cmi.core.lesson_location',
        spm: 255
    },

    // 3.4.5 - cmi.core.score
    score: {
        raw: 'cmi.core.score.raw',
        min: 'cmi.core.score.min',
        max: 'cmi.core.score.max'
        // NOTE: no 'scaled' — doesn't exist in 1.2
    },

    // 3.4.6 - cmi.core.session_time (HHHH:MM:SS.SS)
    sessionTime: {
        element: 'cmi.core.session_time',
        // Format: HHHH:MM:SS.SS (hours 4-digit, optional decimal seconds)
        regex: /^\d{4}:\d{2}:\d{2}(\.\d{1,2})?$/
    },

    // 3.4.10 - cmi.suspend_data (SPM 4096 chars)
    suspendData: {
        element: 'cmi.suspend_data',
        spm: 4096
    },

    // 3.4.9 - cmi.interactions.n
    interactions: {
        prefix: 'cmi.interactions',
        id: 'id',
        type: 'type',
        studentResponse: 'student_response',  // NOT learner_response (that's 2004)
        result: 'result',
        time: 'time',                         // NOT timestamp (that's 2004)
        weighting: 'weighting',
        latency: 'latency',
        correctResponses: 'correct_responses'
    },

    // 3.4.7 - cmi.objectives.n
    objectives: {
        prefix: 'cmi.objectives',
        id: 'id',
        status: 'status',  // single field, NOT completion_status + success_status
        statusVocabulary: ['passed', 'completed', 'failed', 'incomplete', 'browsed', 'not attempted'],
        score: {
            raw: 'score.raw',
            min: 'score.min',
            max: 'score.max'
        }
    },

    // SCORM 2004 ↔ 1.2 Status Mapping
    // The SCORM 2004 internal model uses two fields (completion + success).
    // SCORM 1.2 uses one field (lesson_status). This is the spec-defined mapping.
    statusMapping: {
        // 2004 → 1.2
        to12: {
            'completed+passed':  'passed',
            'completed+failed':  'failed',
            'completed+unknown': 'completed',
            'incomplete+any':    'incomplete',
            'not attempted+any': 'not attempted'
        },
        // 1.2 → 2004
        to2004: {
            'passed':        { completion: 'completed', success: 'passed' },
            'failed':        { completion: 'completed', success: 'failed' },
            'completed':     { completion: 'completed', success: 'unknown' },
            'incomplete':    { completion: 'incomplete', success: 'unknown' },
            'browsed':       { completion: 'incomplete', success: 'unknown' },
            'not attempted': { completion: 'not attempted', success: 'unknown' }
        }
    },

    // SCORM 1.2 Time Format
    // HHHH:MM:SS — SCORM 2004 uses PT{hours}H{min}M{sec}S (ISO 8601)
    timeConversions: {
        'PT1H30M45S':  '0001:30:45',
        'PT2H':        '0002:00:00',
        'PT15M':       '0000:15:00',
        'PT30S':       '0000:00:30',
        'PT100H':      '0100:00:00',
        'PT0H0M0S':    '0000:00:00'
    }
};

// ═════════════════════════════════════════════════════════════════════
// Tests: Status Mapping (2004 ↔ 1.2)
// The most critical compliance surface — wrong mapping = wrong LMS status
// ═════════════════════════════════════════════════════════════════════

describe('SCORM 1.2 Spec: Status Mapping (2004 → 1.2)', () => {
    it('completed+passed → "passed"', () => {
        expect(mapStatusTo12('completed', 'passed')).toBe(
            SCORM_12_SPEC.statusMapping.to12['completed+passed']
        );
    });

    it('completed+failed → "failed"', () => {
        expect(mapStatusTo12('completed', 'failed')).toBe(
            SCORM_12_SPEC.statusMapping.to12['completed+failed']
        );
    });

    it('completed+unknown → "completed"', () => {
        expect(mapStatusTo12('completed', 'unknown')).toBe(
            SCORM_12_SPEC.statusMapping.to12['completed+unknown']
        );
    });

    it('incomplete → "incomplete" regardless of success', () => {
        const expected = SCORM_12_SPEC.statusMapping.to12['incomplete+any'];
        expect(mapStatusTo12('incomplete', 'unknown')).toBe(expected);
        expect(mapStatusTo12('incomplete', 'passed')).toBe(expected);
        expect(mapStatusTo12('incomplete', 'failed')).toBe(expected);
    });

    it('"not attempted" → "not attempted"', () => {
        expect(mapStatusTo12('not attempted', 'unknown')).toBe(
            SCORM_12_SPEC.statusMapping.to12['not attempted+any']
        );
    });

    it('all outputs are valid lesson_status values', () => {
        const valid = SCORM_12_SPEC.lessonStatus.vocabulary;
        expect(valid).toContain(mapStatusTo12('completed', 'passed'));
        expect(valid).toContain(mapStatusTo12('completed', 'failed'));
        expect(valid).toContain(mapStatusTo12('completed', 'unknown'));
        expect(valid).toContain(mapStatusTo12('incomplete', 'unknown'));
        expect(valid).toContain(mapStatusTo12('not attempted', 'unknown'));
    });
});

describe('SCORM 1.2 Spec: Status Mapping (1.2 → 2004)', () => {
    for (const [status12, expected2004] of Object.entries(SCORM_12_SPEC.statusMapping.to2004)) {
        it(`"${status12}" → completion=${expected2004.completion}, success=${expected2004.success}`, () => {
            expect(mapStatusTo2004(status12)).toEqual(expected2004);
        });
    }
});

describe('SCORM 1.2 Spec: Status Mapping Round-trip Fidelity', () => {
    it('completed+passed round-trips losslessly', () => {
        const s12 = mapStatusTo12('completed', 'passed');
        const back = mapStatusTo2004(s12);
        expect(back).toEqual({ completion: 'completed', success: 'passed' });
    });

    it('completed+failed round-trips losslessly', () => {
        const s12 = mapStatusTo12('completed', 'failed');
        const back = mapStatusTo2004(s12);
        expect(back).toEqual({ completion: 'completed', success: 'failed' });
    });

    it('completed+unknown round-trips losslessly', () => {
        const s12 = mapStatusTo12('completed', 'unknown');
        const back = mapStatusTo2004(s12);
        expect(back).toEqual({ completion: 'completed', success: 'unknown' });
    });

    // KNOWN SPEC LIMITATION: incomplete+passed is lossy because 1.2 has
    // no way to represent "incomplete but passed"
    it('incomplete+passed is lossy (spec limitation, not a bug)', () => {
        const s12 = mapStatusTo12('incomplete', 'passed');
        const back = mapStatusTo2004(s12);
        expect(back.success).toBe('unknown'); // success info lost
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: Time Format Conversion
// SCORM 2004 → 1.2: PT{n}H{n}M{n}S → HHHH:MM:SS
// ═════════════════════════════════════════════════════════════════════

describe('SCORM 1.2 Spec: Time Format Conversion', () => {
    for (const [iso8601, hmsFormat] of Object.entries(SCORM_12_SPEC.timeConversions)) {
        it(`${iso8601} → ${hmsFormat}`, () => {
            expect(convertTimeFormat2004To12(iso8601)).toBe(hmsFormat);
        });
    }

    it('output matches HHHH:MM:SS format', () => {
        const result = convertTimeFormat2004To12('PT1H30M45S');
        expect(result).toMatch(SCORM_12_SPEC.sessionTime.regex);
    });

    it('truncates fractional seconds (1.2 uses integer seconds by convention)', () => {
        expect(convertTimeFormat2004To12('PT30.5S')).toBe('0000:00:30');
    });

    it('handles null/empty/invalid gracefully', () => {
        expect(convertTimeFormat2004To12(null)).toBe('0000:00:00');
        expect(convertTimeFormat2004To12('')).toBe('0000:00:00');
        expect(convertTimeFormat2004To12('garbage')).toBe('0000:00:00');
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: SCORM 1.2 Data Model Element Names
// Verify the driver writes to 1.2-specific CMI paths (NOT 2004 paths)
// ═════════════════════════════════════════════════════════════════════

describe('SCORM 1.2 Spec: Data Model Element Names', () => {
    let driver;
    let writes;

    beforeEach(() => {
        driver = new Scorm12Driver();
        writes = [];
        driver._rawSet = (key, value) => { writes.push({ key, value }); };
        driver._cache = { bookmark: 'slide-1', interactionsCount: 0, objectiveIdToIndex: new Map(), objectivesCount: 0 };
        driver._statusCache = { completion: 'unknown', success: 'unknown' };
        driver._isConnected = true;
    });

    it('writes bookmark to cmi.core.lesson_location (NOT cmi.location)', () => {
        driver.setBookmark('slide-5');
        expect(writes[0].key).toBe(SCORM_12_SPEC.lessonLocation.element);
        // Verify it's NOT the SCORM 2004 element
        expect(writes[0].key).not.toBe('cmi.location');
    });

    it('writes score to cmi.core.score.* (NOT cmi.score.*)', () => {
        driver.reportScore({ raw: 85, min: 0, max: 100 });
        const keys = writes.map(w => w.key);

        expect(keys).toContain(SCORM_12_SPEC.score.raw);
        expect(keys).toContain(SCORM_12_SPEC.score.min);
        expect(keys).toContain(SCORM_12_SPEC.score.max);

        // Must NOT write SCORM 2004 paths
        expect(keys).not.toContain('cmi.score.raw');
        expect(keys).not.toContain('cmi.score.scaled');
    });

    it('has no cmi.score.scaled (does not exist in 1.2)', () => {
        driver.reportScore({ raw: 85, scaled: 0.85 });
        const keys = writes.map(w => w.key);
        expect(keys).not.toContain('cmi.score.scaled');
        expect(keys).not.toContain('cmi.core.score.scaled');
    });

    it('reportProgress is a no-op (1.2 has no progress_measure)', () => {
        driver.reportProgress(0.5);
        expect(writes).toHaveLength(0);
    });

    it('writes session_time to cmi.core.session_time', () => {
        driver.reportSessionTime('PT1H30M');
        expect(writes[0].key).toBe(SCORM_12_SPEC.sessionTime.element);
    });

    it('session_time output is in HHHH:MM:SS format (not ISO 8601)', () => {
        driver.reportSessionTime('PT1H30M45S');
        expect(writes[0].value).toMatch(SCORM_12_SPEC.sessionTime.regex);
    });
});

describe('SCORM 1.2 Spec: Interaction Element Names', () => {
    let driver, writes;

    beforeEach(() => {
        driver = new Scorm12Driver();
        writes = [];
        driver._rawSet = (key, value) => { writes.push({ key, value }); };
        driver._cache = { bookmark: 'slide-1', interactionsCount: 0, objectiveIdToIndex: new Map(), objectivesCount: 0 };
        driver._isConnected = true;
    });

    it('uses "student_response" NOT "learner_response" (1.2 vs 2004)', () => {
        const spec = SCORM_12_SPEC.interactions;
        driver.reportInteraction({ id: 'q1', type: 'true-false', learner_response: 'true' });

        const keys = writes.map(w => w.key);
        expect(keys).toContain(`${spec.prefix}.0.${spec.studentResponse}`);
        // Must NOT use SCORM 2004 element name
        expect(keys).not.toContain('cmi.interactions.0.learner_response');
    });

    it('uses "time" NOT "timestamp" (1.2 vs 2004)', () => {
        const spec = SCORM_12_SPEC.interactions;
        driver.reportInteraction({ id: 'q1', type: 'true-false', timestamp: '12:00:00' });

        const keys = writes.map(w => w.key);
        expect(keys).toContain(`${spec.prefix}.0.${spec.time}`);
        expect(keys).not.toContain('cmi.interactions.0.timestamp');
    });
});

describe('SCORM 1.2 Spec: Objective Element Names', () => {
    let driver, writes;

    beforeEach(() => {
        driver = new Scorm12Driver();
        writes = [];
        driver._rawSet = (key, value) => { writes.push({ key, value }); };
        driver._cache = { bookmark: 'slide-1', interactionsCount: 0, objectiveIdToIndex: new Map(), objectivesCount: 0 };
        driver._isConnected = true;
    });

    it('uses single .status (NOT .completion_status + .success_status)', () => {
        const spec = SCORM_12_SPEC.objectives;
        driver.reportObjective({ id: 'obj_1', success_status: 'passed', score: 90 });

        const keys = writes.map(w => w.key);
        expect(keys).toContain(`${spec.prefix}.0.${spec.status}`);
        // Must NOT use SCORM 2004 dual-status elements
        expect(keys).not.toContain('cmi.objectives.0.completion_status');
        expect(keys).not.toContain('cmi.objectives.0.success_status');
    });

    it('.status value is from 1.2 vocabulary', () => {
        driver.reportObjective({ id: 'obj_1', success_status: 'passed', score: 90 });

        const statusWrite = writes.find(w => w.key === 'cmi.objectives.0.status');
        expect(SCORM_12_SPEC.objectives.statusVocabulary).toContain(statusWrite.value);
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: Diet State Compression/Expansion (implementation-specific)
// This section tests our compression strategy for fitting within
// the 4096-char suspend_data limit. The roundtrip fidelity of
// learner progress is the concern, not spec compliance.
// ═════════════════════════════════════════════════════════════════════

describe('SCORM 1.2: Diet State Roundtrip (4KB constraint)', () => {
    let driver;

    beforeEach(() => {
        driver = new Scorm12Driver();
        driver._cache = { bookmark: 'slide-3' };
    });

    it('round-trips navigation state', () => {
        const full = { navigation: { visitedSlides: ['s1', 's2', 's3'] } };
        const expanded = driver._expandDietState(driver._createDietState(full));
        expect(expanded.navigation.visitedSlides).toEqual(['s1', 's2', 's3']);
    });

    it('round-trips engagement complete flags', () => {
        const full = {
            engagement: {
                's1': { complete: true, tracked: { scrollDepth: 100 } },
                's2': { complete: false, tracked: { timer: 30 } }
            }
        };
        const expanded = driver._expandDietState(driver._createDietState(full));
        expect(expanded.engagement.s1.complete).toBe(true);
        expect(expanded.engagement.s2.complete).toBe(false);
    });

    it('drops tracked details (intentional for 4KB limit)', () => {
        const full = {
            engagement: { 's1': { complete: true, tracked: { scrollDepth: 100, videoProgress: 0.8 } } }
        };
        const expanded = driver._expandDietState(driver._createDietState(full));
        expect(expanded.engagement.s1.tracked).toEqual({});
    });

    it('round-trips assessment state', () => {
        const full = { 'assessment_quiz1': { score: 90, passed: true, attempts: 1 } };
        const expanded = driver._expandDietState(driver._createDietState(full));
        expect(expanded['assessment_quiz1'].score).toBe(90);
        expect(expanded['assessment_quiz1'].passed).toBe(true);
    });

    it('round-trips flags and accessibility', () => {
        const full = {
            flags: { introSeen: true },
            accessibility: { fontSize: 'large' }
        };
        const expanded = driver._expandDietState(driver._createDietState(full));
        expect(expanded.flags).toEqual({ introSeen: true });
        expect(expanded.accessibility).toEqual({ fontSize: 'large' });
    });
});
