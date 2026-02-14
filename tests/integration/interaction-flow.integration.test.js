import { describe, it, expect, beforeEach } from 'vitest';
import { DomainStore } from '../../framework/js/state/state-domains.js';
import { CommitScheduler } from '../../framework/js/state/state-commits.js';
import { StateValidator } from '../../framework/js/state/state-validation.js';
import { TransactionLog } from '../../framework/js/state/transaction-log.js';

// ─── Interaction Flow Integration Tests ─────────────────────────────
// Tests the SCORM cmi.interactions compliance through the full pipeline.
// Interactions are the most dangerous data type:
//   1. Append-only semantics (SCORM prohibits overwriting learner responses)
//   2. Dual-write: suspend_data (for restore) + native CMI (for LMS reporting)
//   3. Must survive multiple session cycles without losing entries

function createMockLMS() {
    let stored = null;
    const interactionsReported = [];

    return {
        setSuspendData(data) {
            stored = JSON.parse(JSON.stringify(data));
            return true;
        },
        getSuspendData() {
            return stored ? JSON.parse(JSON.stringify(stored)) : null;
        },
        commit() { return true; },
        getEntryMode() { return stored ? 'resume' : 'ab-initio'; },
        getBookmark() { return ''; },
        getCapabilities() {
            return {
                supportsObjectives: true,
                supportsInteractions: true,
                supportsComments: false,
                supportsEmergencySave: false,
                maxSuspendDataBytes: 0,
                asyncCommit: false
            };
        },
        getFormat() { return 'scorm2004'; },
        reportInteraction(interaction) {
            interactionsReported.push(structuredClone(interaction));
        },
        reportObjective() {},
        reportProgress() {},

        // Inspection
        get _interactionsReported() { return interactionsReported; },
        get _stored() { return stored; }
    };
}

describe('Interaction Flow (Record → Commit → Restore)', () => {
    let mockLMS, txLog, domains, commits, validator;

    beforeEach(() => {
        mockLMS = createMockLMS();
        txLog = new TransactionLog();
        domains = new DomainStore(txLog);
        commits = new CommitScheduler(mockLMS, domains, txLog);
        validator = new StateValidator();
    });

    // ─── Single interaction roundtrip ───────────────────────────────

    it('roundtrips a single interaction through commit and restore', () => {
        const interaction = {
            id: 'q1',
            type: 'true-false',
            learner_response: 'true',
            result: 'correct',
            timestamp: '2026-02-08T22:00:00Z',
            description: 'Is the sky blue?'
        };

        domains.setDomainState('interactions', interaction);
        commits.commitToLMS();

        const restored = validator.hydrateStateFromLMS(mockLMS);
        expect(restored.interactions).toBeDefined();
        expect(Array.isArray(restored.interactions)).toBe(true);
        expect(restored.interactions).toHaveLength(1);
        expect(restored.interactions[0].id).toBe('q1');
        expect(restored.interactions[0].learner_response).toBe('true');
        expect(restored.interactions[0].result).toBe('correct');
    });

    // ─── Multiple interactions ──────────────────────────────────────

    it('accumulates multiple interactions', () => {
        domains.setDomainState('interactions', {
            id: 'q1', type: 'true-false', learner_response: 'true', result: 'correct'
        });
        domains.setDomainState('interactions', {
            id: 'q2', type: 'multiple-choice', learner_response: 'b', result: 'incorrect'
        });
        domains.setDomainState('interactions', {
            id: 'q3', type: 'fill-in', learner_response: 'Paris', result: 'correct'
        });
        commits.commitToLMS();

        const restored = validator.hydrateStateFromLMS(mockLMS);
        expect(restored.interactions).toHaveLength(3);
        expect(restored.interactions.map(i => i.id)).toEqual(['q1', 'q2', 'q3']);
    });

    // ─── Append-only across sessions ────────────────────────────────

    it('preserves interactions across session boundaries (append-only)', () => {
        // Session 1: record 2 interactions
        domains.setDomainState('interactions', { id: 'q1', type: 'true-false', result: 'correct' });
        domains.setDomainState('interactions', { id: 'q2', type: 'true-false', result: 'incorrect' });
        commits.commitToLMS();

        // Session 2: restore and add more
        const session1State = validator.hydrateStateFromLMS(mockLMS);
        const domains2 = new DomainStore(new TransactionLog());
        domains2.state = session1State;

        // Add a new interaction
        domains2.setDomainState('interactions', { id: 'q3', type: 'true-false', result: 'correct' });

        const commits2 = new CommitScheduler(mockLMS, domains2, new TransactionLog());
        commits2.commitToLMS();

        // Session 3: verify all 3 are present
        const session2State = validator.hydrateStateFromLMS(mockLMS);
        expect(session2State.interactions).toHaveLength(3);
        expect(session2State.interactions.map(i => i.id)).toEqual(['q1', 'q2', 'q3']);
    });

    // ─── Interaction with all SCORM fields ──────────────────────────

    it('preserves all SCORM interaction fields through roundtrip', () => {
        const fullInteraction = {
            id: 'assessment_1_q1',
            type: 'choice',
            learner_response: 'a[,]b',
            result: 'correct',
            timestamp: '2026-02-08T22:30:00.000Z',
            description: 'Select all correct answers',
            weighting: 2,
            latency: 'PT45S',
            correct_responses: [{ pattern: 'a[,]b' }],
            objectives: ['obj_unit1']
        };

        domains.setDomainState('interactions', fullInteraction);
        commits.commitToLMS();

        const restored = validator.hydrateStateFromLMS(mockLMS);
        const restoredInteraction = restored.interactions[0];

        expect(restoredInteraction.id).toBe('assessment_1_q1');
        expect(restoredInteraction.type).toBe('choice');
        expect(restoredInteraction.learner_response).toBe('a[,]b');
        expect(restoredInteraction.result).toBe('correct');
        expect(restoredInteraction.timestamp).toBe('2026-02-08T22:30:00.000Z');
        expect(restoredInteraction.description).toBe('Select all correct answers');
        expect(restoredInteraction.weighting).toBe(2);
        expect(restoredInteraction.latency).toBe('PT45S');
        expect(restoredInteraction.correct_responses).toEqual([{ pattern: 'a[,]b' }]);
        expect(restoredInteraction.objectives).toEqual(['obj_unit1']);
    });

    // ─── Edge cases ─────────────────────────────────────────────────

    it('handles interaction with only required fields', () => {
        domains.setDomainState('interactions', { id: 'q1', type: 'true-false' });
        commits.commitToLMS();

        const restored = validator.hydrateStateFromLMS(mockLMS);
        expect(restored.interactions[0].id).toBe('q1');
        expect(restored.interactions[0].type).toBe('true-false');
    });

    it('handles interaction with numeric learner_response', () => {
        domains.setDomainState('interactions', {
            id: 'q1', type: 'numeric', learner_response: 42, result: 'correct'
        });
        commits.commitToLMS();

        const restored = validator.hydrateStateFromLMS(mockLMS);
        expect(restored.interactions[0].learner_response).toBe(42);
    });

    it('handles large number of interactions without data loss', () => {
        // SCORM courses can have 50+ interactions in an assessment
        for (let i = 0; i < 50; i++) {
            domains.setDomainState('interactions', {
                id: `q${i}`,
                type: 'true-false',
                learner_response: i % 2 === 0 ? 'true' : 'false',
                result: i % 3 === 0 ? 'correct' : 'incorrect'
            });
        }
        commits.commitToLMS();

        const restored = validator.hydrateStateFromLMS(mockLMS);
        expect(restored.interactions).toHaveLength(50);

        // Verify no data corruption in the middle
        expect(restored.interactions[25].id).toBe('q25');
        expect(restored.interactions[49].id).toBe('q49');
    });
});
