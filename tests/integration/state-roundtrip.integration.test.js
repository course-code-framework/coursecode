import { describe, it, expect, beforeEach } from 'vitest';
import { DomainStore } from '../../framework/js/state/state-domains.js';
import { CommitScheduler } from '../../framework/js/state/state-commits.js';
import { StateValidator } from '../../framework/js/state/state-validation.js';
import { TransactionLog } from '../../framework/js/state/transaction-log.js';

// ─── State Roundtrip Integration Tests ──────────────────────────────
// Tests the full data pipeline:
//   setDomainState() → DomainStore → setSuspendData(state) → commit()
//   → [page reload] →
//   getSuspendData() → validateAndMigrateState() → DomainStore.state
//
// These wire real modules together with a mock LMS that behaves like
// a real SCORM 2004 LMS (stores suspend_data as JSON string).

/**
 * Mock LMS connection that simulates suspend_data storage.
 * Mimics the real LMS behavior: JSON.stringify on write, JSON.parse on read.
 */
function createMockLMS(options = {}) {
    let stored = null;
    let commitCount = 0;
    const sets = [];

    return {
        // Storage
        setSuspendData(data) {
            // Real LMS stores as string — simulate the serialize boundary
            stored = JSON.parse(JSON.stringify(data));
            sets.push(structuredClone(data));
            return true;
        },
        getSuspendData() {
            return stored ? JSON.parse(JSON.stringify(stored)) : null;
        },

        // Lifecycle
        commit() { commitCount++; return true; },
        getEntryMode() { return stored ? 'resume' : 'ab-initio'; },
        getBookmark() { return options.bookmark || ''; },
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

        // Passthrough no-ops
        reportInteraction() {},
        reportObjective() {},
        reportProgress() {},

        // Inspection
        get _commitCount() { return commitCount; },
        get _sets() { return sets; },
        get _stored() { return stored; }
    };
}

describe('State Roundtrip (DomainStore → Commit → Restore)', () => {
    let mockLMS, txLog, domains, commits, validator;

    beforeEach(() => {
        mockLMS = createMockLMS();
        txLog = new TransactionLog();
        domains = new DomainStore(txLog);
        commits = new CommitScheduler(mockLMS, domains, txLog);
        validator = new StateValidator();
    });

    // ─── Helper: simulate a full session lifecycle ──────────────────
    async function commitState() {
        await commits.commitToLMS();
    }

    function restoreState() {
        return validator.hydrateStateFromLMS(mockLMS);
    }

    // ─── Core roundtrip ─────────────────────────────────────────────

    it('roundtrips a single domain through commit and restore', async () => {
        domains.setDomainState('navigation', { visitedSlides: ['slide-1', 'slide-2'] });
        await commitState();

        const restored = restoreState();
        expect(restored.navigation).toEqual({ visitedSlides: ['slide-1', 'slide-2'] });
    });

    it('roundtrips multiple domains', async () => {
        domains.setDomainState('navigation', { visitedSlides: ['s1'] });
        domains.setDomainState('engagement', { 's1': { complete: true, tracked: {} } });
        domains.setDomainState('flags', { hasSeenIntro: true });
        await commitState();

        const restored = restoreState();
        expect(restored.navigation.visitedSlides).toEqual(['s1']);
        expect(restored.engagement.s1.complete).toBe(true);
        expect(restored.flags.hasSeenIntro).toBe(true);
    });

    it('roundtrips deeply nested state', async () => {
        const complexState = {
            level1: {
                level2: {
                    level3: {
                        value: 'deep',
                        array: [1, 2, { nested: true }]
                    }
                }
            }
        };
        domains.setDomainState('custom', complexState);
        await commitState();

        const restored = restoreState();
        expect(restored.custom).toEqual(complexState);
    });

    it('preserves _meta schema version through roundtrip', async () => {
        domains.setDomainState('navigation', { visitedSlides: [] });
        await commitState();

        const restored = restoreState();
        expect(restored._meta).toBeDefined();
        expect(restored._meta.schemaVersion).toBeGreaterThan(0);
    });

    // ─── Multi-session accumulation ─────────────────────────────────

    it('accumulates state across multiple sessions', async () => {
        // Session 1: visit slide 1
        domains.setDomainState('navigation', { visitedSlides: ['slide-1'] });
        await commitState();

        // Session 2: restore and add slide 2
        const session1State = restoreState();
        const domains2 = new DomainStore(new TransactionLog());
        domains2.state = session1State;
        domains2.setDomainState('navigation', {
            visitedSlides: [...session1State.navigation.visitedSlides, 'slide-2']
        });

        const commits2 = new CommitScheduler(mockLMS, domains2, new TransactionLog());
        await commits2.commitToLMS();

        // Session 3: restore — should have both slides
        const session2State = restoreState();
        expect(session2State.navigation.visitedSlides).toEqual(['slide-1', 'slide-2']);
    });

    // ─── JSON serialization edge cases ──────────────────────────────

    it('drops undefined values during JSON roundtrip', async () => {
        // This is a REAL bug vector — undefined values silently disappear in JSON
        domains.setDomainState('test', {
            exists: 'yes',
            missing: undefined,
            nested: { also: undefined, present: 42 }
        });
        await commitState();

        const restored = restoreState();
        expect(restored.test.exists).toBe('yes');
        expect(restored.test).not.toHaveProperty('missing');
        expect(restored.test.nested).not.toHaveProperty('also');
        expect(restored.test.nested.present).toBe(42);
    });

    it('converts Date objects to strings during roundtrip', async () => {
        const now = new Date();
        domains.setDomainState('timestamps', { created: now });
        await commitState();

        const restored = restoreState();
        // Date becomes ISO string through JSON — this is expected but dangerous
        // if code later does `new Date(restored.timestamps.created)` and expects a Date
        expect(typeof restored.timestamps.created).toBe('string');
        expect(new Date(restored.timestamps.created).getTime()).toBe(now.getTime());
    });

    it('handles empty string values correctly', async () => {
        domains.setDomainState('answers', { q1: '', q2: 'answered', q3: 0, q4: false, q5: null });
        await commitState();

        const restored = restoreState();
        expect(restored.answers.q1).toBe('');
        expect(restored.answers.q2).toBe('answered');
        expect(restored.answers.q3).toBe(0);
        expect(restored.answers.q4).toBe(false);
        expect(restored.answers.q5).toBe(null);
    });

    // ─── Error recovery ─────────────────────────────────────────────

    it('returns fresh state for ab-initio entry (no stored data)', () => {
        // Don't commit anything — fresh launch
        const state = restoreState();
        expect(state._meta).toBeDefined();
        expect(state._meta.schemaVersion).toBeGreaterThan(0);
        // Should have only _meta, no domains
        const keys = Object.keys(state).filter(k => k !== '_meta');
        expect(keys).toHaveLength(0);
    });

    it('handles state with extra unknown domains gracefully', async () => {
        // Simulate a future version adding a new domain
        domains.setDomainState('navigation', { visitedSlides: ['s1'] });
        domains.setDomainState('futureFeature', { data: 'from future version' });
        await commitState();

        const restored = restoreState();
        // Unknown domains should pass through without error
        expect(restored.navigation.visitedSlides).toEqual(['s1']);
        expect(restored.futureFeature).toEqual({ data: 'from future version' });
    });
});

describe('CommitScheduler data integrity', () => {
    it('sends complete state snapshot to setSuspendData', async () => {
        const mockLMS = createMockLMS();
        const txLog = new TransactionLog();
        const domains = new DomainStore(txLog);
        const commits = new CommitScheduler(mockLMS, domains, txLog);

        domains.setDomainState('navigation', { visitedSlides: ['s1', 's2'] });
        domains.setDomainState('flags', { introSeen: true });
        await commits.commitToLMS();

        // Verify the actual data sent to the LMS
        expect(mockLMS._sets).toHaveLength(1);
        const sentData = mockLMS._sets[0];
        expect(sentData.navigation).toEqual({ visitedSlides: ['s1', 's2'] });
        expect(sentData.flags).toEqual({ introSeen: true });
    });

    it('sends updated state on subsequent commits', async () => {
        const mockLMS = createMockLMS();
        const txLog = new TransactionLog();
        const domains = new DomainStore(txLog);
        const commits = new CommitScheduler(mockLMS, domains, txLog);

        domains.setDomainState('flags', { step1: true });
        await commits.commitToLMS();

        domains.setDomainState('flags', { step1: true, step2: true });
        await commits.commitToLMS();

        expect(mockLMS._sets).toHaveLength(2);
        expect(mockLMS._sets[1].flags).toEqual({ step1: true, step2: true });
    });
});
