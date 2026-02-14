import { describe, it, expect, beforeEach } from 'vitest';
import { DomainStore } from '../../framework/js/state/state-domains.js';
import { CommitScheduler } from '../../framework/js/state/state-commits.js';
import { StateValidator } from '../../framework/js/state/state-validation.js';
import { TransactionLog } from '../../framework/js/state/transaction-log.js';

// ─── Navigation State Integration Tests ─────────────────────────────
// Tests the dual-path persistence model:
//   - Bookmark: stored via cmi.location (driver.setBookmark/getBookmark)
//   - Visited slides: stored via suspend_data.navigation
//
// These two paths must agree on resume. If they diverge, the learner
// either loses progress or lands on the wrong slide.

function createMockLMS() {
    let stored = null;
    let bookmark = '';
    let completion = 'unknown';
    let success = 'unknown';
    let progress = 0;

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
        getBookmark() { return bookmark; },
        setBookmark(loc) { bookmark = loc; },
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
        reportCompletion(s) { completion = s; },
        reportSuccess(s) { success = s; },
        reportProgress(m) { progress = m; },
        reportInteraction() {},
        reportObjective() {},

        // Inspection
        get _bookmark() { return bookmark; },
        get _completion() { return completion; },
        get _success() { return success; },
        get _progress() { return progress; },
        get _stored() { return stored; }
    };
}

describe('Navigation State Persistence', () => {
    let mockLMS, txLog, domains, commits, validator;

    beforeEach(() => {
        mockLMS = createMockLMS();
        txLog = new TransactionLog();
        domains = new DomainStore(txLog);
        commits = new CommitScheduler(mockLMS, domains, txLog);
        validator = new StateValidator();
    });

    it('persists visited slides through suspend_data roundtrip', () => {
        domains.setDomainState('navigation', {
            visitedSlides: ['intro', 'module-1', 'module-2']
        });
        commits.commitToLMS();

        const restored = validator.hydrateStateFromLMS(mockLMS);
        expect(restored.navigation.visitedSlides).toEqual(['intro', 'module-1', 'module-2']);
    });

    it('bookmark and visited slides are independent', () => {
        // Set bookmark to slide-3
        mockLMS.setBookmark('slide-3');

        // But only visited slides 1 and 2 in suspend_data
        domains.setDomainState('navigation', { visitedSlides: ['slide-1', 'slide-2'] });
        commits.commitToLMS();

        // On restore: bookmark says slide-3, but visited only has 1,2
        const restored = validator.hydrateStateFromLMS(mockLMS);
        expect(mockLMS._bookmark).toBe('slide-3');
        expect(restored.navigation.visitedSlides).toEqual(['slide-1', 'slide-2']);
        // This divergence is valid — user navigated to slide-3 but
        // the commit happened before visitedSlides was updated
    });

    it('accumulates visited slides across sessions', () => {
        // Session 1
        domains.setDomainState('navigation', { visitedSlides: ['s1', 's2'] });
        commits.commitToLMS();

        // Session 2
        const state = validator.hydrateStateFromLMS(mockLMS);
        const domains2 = new DomainStore(new TransactionLog());
        domains2.state = state;
        domains2.setDomainState('navigation', {
            visitedSlides: [...state.navigation.visitedSlides, 's3', 's4']
        });
        new CommitScheduler(mockLMS, domains2, new TransactionLog()).commitToLMS();

        // Session 3
        const final = validator.hydrateStateFromLMS(mockLMS);
        expect(final.navigation.visitedSlides).toEqual(['s1', 's2', 's3', 's4']);
    });

    it('persists engagement state alongside navigation', () => {
        domains.setDomainState('navigation', { visitedSlides: ['s1', 's2'] });
        domains.setDomainState('engagement', {
            's1': { complete: true, tracked: { scrollDepth: 100 } },
            's2': { complete: false, tracked: { scrollDepth: 30 } }
        });
        commits.commitToLMS();

        const restored = validator.hydrateStateFromLMS(mockLMS);
        expect(restored.navigation.visitedSlides).toHaveLength(2);
        expect(restored.engagement.s1.complete).toBe(true);
        expect(restored.engagement.s2.complete).toBe(false);
    });
});

describe('State Validation on Restore', () => {
    it('filters invalid slide IDs from visitedSlides on restore', () => {
        const mockLMS = createMockLMS();
        const txLog = new TransactionLog();
        const domains = new DomainStore(txLog);
        const commits = new CommitScheduler(mockLMS, domains, txLog);
        const validator = new StateValidator();

        // Configure validator with known slide IDs
        validator.setCourseValidationConfig({
            structure: [{ id: 's1' }, { id: 's2' }, { id: 's3' }]
        });

        // Store state with some slides that no longer exist
        domains.setDomainState('navigation', {
            visitedSlides: ['s1', 's2', 'deleted-slide', 's3', 'removed-slide']
        });
        commits.commitToLMS();

        const restored = validator.hydrateStateFromLMS(mockLMS);
        // Should filter out the non-existent slide IDs
        expect(restored.navigation.visitedSlides).toEqual(['s1', 's2', 's3']);
    });

    it('filters invalid slide IDs from engagement state on restore', () => {
        const mockLMS = createMockLMS();
        const txLog = new TransactionLog();
        const domains = new DomainStore(txLog);
        const commits = new CommitScheduler(mockLMS, domains, txLog);
        const validator = new StateValidator();

        validator.setCourseValidationConfig({
            structure: [{ id: 's1' }, { id: 's2' }]
        });

        domains.setDomainState('engagement', {
            's1': { complete: true, tracked: {} },
            's2': { complete: false, tracked: {} },
            'deleted': { complete: true, tracked: {} }
        });
        commits.commitToLMS();

        const restored = validator.hydrateStateFromLMS(mockLMS);
        expect(Object.keys(restored.engagement)).toEqual(['s1', 's2']);
    });

    it('preserves assessment state across sessions with validation', () => {
        const mockLMS = createMockLMS();
        const txLog = new TransactionLog();
        const domains = new DomainStore(txLog);
        const commits = new CommitScheduler(mockLMS, domains, txLog);
        const validator = new StateValidator();

        validator.setCourseValidationConfig({
            structure: [{ id: 'quiz-1' }]
        });

        domains.setDomainState('assessment_quiz-1', {
            score: 85,
            passed: true,
            attempts: 2,
            responses: { q1: 'a', q2: 'b', q3: 'c' }
        });
        commits.commitToLMS();

        const restored = validator.hydrateStateFromLMS(mockLMS);
        expect(restored['assessment_quiz-1'].score).toBe(85);
        expect(restored['assessment_quiz-1'].passed).toBe(true);
        expect(restored['assessment_quiz-1'].attempts).toBe(2);
        expect(restored['assessment_quiz-1'].responses).toEqual({ q1: 'a', q2: 'b', q3: 'c' });
    });
});
