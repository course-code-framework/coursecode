import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger and eventBus
vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

vi.mock('../../../framework/js/core/event-bus.js', () => {
    const mockBus = { emit: vi.fn(), on: vi.fn(() => () => {}), off: vi.fn() };
    return { eventBus: mockBus, EventBus: vi.fn(() => mockBus) };
});

const { CommitScheduler } = await import('../../../framework/js/state/state-commits.js');
const { eventBus } = await import('../../../framework/js/core/event-bus.js');

describe('CommitScheduler', () => {
    let scheduler;
    let mockLMS;
    let mockDomainStore;
    let mockTxLog;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();

        mockLMS = {
            setSuspendData: vi.fn(),
            commit: vi.fn().mockResolvedValue(true)
        };
        mockDomainStore = {
            state: { navigation: { currentSlide: 'slide-1' } }
        };
        mockTxLog = {
            record: vi.fn(),
            getRecent: vi.fn().mockReturnValue([])
        };

        scheduler = new CommitScheduler(mockLMS, mockDomainStore, mockTxLog);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ─── scheduleCommit (debouncing) ────────────────────────────────
    // CRITICAL: LMS APIs have rate limits. Batching prevents overwhelming the LMS.

    describe('scheduleCommit', () => {
        it('does NOT commit immediately (debounces)', () => {
            scheduler.scheduleCommit(true);
            expect(mockLMS.commit).not.toHaveBeenCalled();
        });

        it('commits after debounce delay', async () => {
            scheduler.scheduleCommit(true);
            await vi.advanceTimersByTimeAsync(500);
            expect(mockLMS.setSuspendData).toHaveBeenCalledWith(mockDomainStore.state);
            expect(mockLMS.commit).toHaveBeenCalledOnce();
        });

        it('resets debounce on rapid successive calls', async () => {
            scheduler.scheduleCommit(true);
            await vi.advanceTimersByTimeAsync(400);
            scheduler.scheduleCommit(true);
            await vi.advanceTimersByTimeAsync(400);
            // 800ms total but second call reset debounce; only 400ms since last
            expect(mockLMS.commit).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(100);
            expect(mockLMS.commit).toHaveBeenCalledOnce();
        });

        it('only sets suspendData when needsSuspendSync is true', async () => {
            scheduler.scheduleCommit(false); // no suspend sync
            await vi.advanceTimersByTimeAsync(500);
            expect(mockLMS.setSuspendData).not.toHaveBeenCalled();
            expect(mockLMS.commit).toHaveBeenCalledOnce();
        });
    });

    // ─── flush ──────────────────────────────────────────────────────
    // CRITICAL: Must flush before unload/terminate or data is lost.

    describe('flush', () => {
        it('immediately executes pending commit', async () => {
            scheduler.scheduleCommit(true);
            await scheduler.flush();
            // flush calls _executeCommit which is async, but the key thing is
            // the timer is cleared and commit is initiated
            expect(mockLMS.setSuspendData).toHaveBeenCalled();
        });

        it('is no-op when nothing is dirty', async () => {
            await scheduler.flush();
            expect(mockLMS.commit).not.toHaveBeenCalled();
        });
    });

    // ─── commitToLMS (immediate commit) ─────────────────────────────

    describe('commitToLMS', () => {
        it('persists state to LMS', async () => {
            await scheduler.commitToLMS();
            expect(mockLMS.setSuspendData).toHaveBeenCalledWith(mockDomainStore.state);
            expect(mockLMS.commit).toHaveBeenCalledOnce();
        });

        it('emits lifecycle events on success', async () => {
            await scheduler.commitToLMS();
            expect(eventBus.emit).toHaveBeenCalledWith('state:commitStart');
            expect(eventBus.emit).toHaveBeenCalledWith('state:commitSuccess');
            expect(eventBus.emit).toHaveBeenCalledWith('state:committed');
        });

        it('emits state:commitFailed and rethrows on error', async () => {
            mockLMS.commit.mockImplementation(() => { throw new Error('LMS write error'); });
            await expect(scheduler.commitToLMS()).rejects.toThrow('LMS write error');
            expect(eventBus.emit).toHaveBeenCalledWith(
                'state:commitFailed',
                expect.objectContaining({ error: 'LMS write error' })
            );
        });

        it('includes stateSnapshot in failure event for diagnostics', async () => {
            mockLMS.commit.mockImplementation(() => { throw new Error('fail'); });
            await expect(scheduler.commitToLMS()).rejects.toThrow('fail');
            const failCall = eventBus.emit.mock.calls.find(c => c[0] === 'state:commitFailed');
            expect(failCall[1].stateSnapshot).toBeDefined();
            expect(failCall[1].stateSnapshot.domains).toContain('navigation');
        });
    });
});
