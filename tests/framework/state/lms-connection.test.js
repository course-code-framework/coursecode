import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

vi.mock('../../../framework/js/core/event-bus.js', () => ({
    eventBus: { emit: vi.fn(), on: vi.fn(() => () => {}), off: vi.fn() }
}));

vi.mock('../../../framework/js/drivers/driver-factory.js', () => ({
    createDriver: vi.fn()
}));

const { LMSConnection } = await import('../../../framework/js/state/lms-connection.js');
const { eventBus } = await import('../../../framework/js/core/event-bus.js');
const { logger } = await import('../../../framework/js/utilities/logger.js');
const { default: stateManager } = await import('../../../framework/js/state/state-manager.js');

describe('LMSConnection diagnostics and compatibility', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    function createDriverStub(overrides = {}) {
        return {
            initialize: vi.fn().mockResolvedValue(true),
            terminate: vi.fn().mockResolvedValue(true),
            commit: vi.fn().mockResolvedValue(true),
            isConnected: vi.fn(() => true),
            isTerminated: vi.fn(() => false),
            ...overrides
        };
    }

    it('records successful commit/terminate diagnostics', async () => {
        const conn = new LMSConnection();
        conn.format = 'scorm2004';
        conn.driver = createDriverStub();

        await conn.commit();
        await conn.terminate();

        const diagnostics = conn.getDiagnostics();
        expect(diagnostics.operationCounts.commitSuccess).toBe(1);
        expect(diagnostics.operationCounts.terminateSuccess).toBe(1);
        expect(diagnostics.lastSuccessAt).toBeTruthy();
    });

    it('emits classified operation failure on timeout', async () => {
        const conn = new LMSConnection();
        conn.format = 'scorm2004';
        conn.setCompatibilityMode('strict-scorm12'); // commit timeout 5s
        conn.driver = createDriverStub({
            commit: vi.fn(() => new Promise(() => {}))
        });

        const pending = conn.commit();
        // Prevent unhandled rejection noise while fake timers advance.
        pending.catch(() => {});
        await vi.advanceTimersByTimeAsync(5001);

        await expect(pending).rejects.toThrow(/timed out/i);
        expect(eventBus.emit).toHaveBeenCalledWith(
            'lms:operationFailed',
            expect.objectContaining({
                operation: 'commit',
                classification: 'timeout'
            })
        );
        expect(logger.error).toHaveBeenCalledWith(
            '[LMSConnection] commit failed',
            expect.objectContaining({
                domain: 'lms',
                operation: 'commit',
                classification: 'timeout',
                format: 'scorm2004',
                profile: 'strict-scorm12'
            })
        );
    });

    it('resolves compatibility profile from auto mode', async () => {
        const conn = new LMSConnection();
        conn.format = 'scorm1.2';
        conn.driver = createDriverStub();

        await conn.commit();

        expect(conn.getDiagnostics().profile).toBe('strict-scorm12');
    });

    it('treats cmi5-remote as modern-http profile', async () => {
        const conn = new LMSConnection();
        conn.format = 'cmi5-remote';
        conn.driver = createDriverStub();

        await conn.commit();

        expect(conn.getDiagnostics().profile).toBe('modern-http');
    });

    it('reports emergency staging failures with structured production-visible context', () => {
        const addEventListener = vi.fn();
        vi.stubGlobal('window', { addEventListener });
        vi.spyOn(stateManager, 'prepareEmergencySave').mockImplementation(() => {
            throw new Error('state serialization failed');
        });

        const conn = new LMSConnection();
        conn.format = 'scorm1.2';
        conn.driver = createDriverStub({ emergencySave: vi.fn() });
        conn.setupLifecycleHandlers();

        const pagehideHandler = addEventListener.mock.calls.find(([event]) => event === 'pagehide')[1];
        pagehideHandler();

        expect(logger.error).toHaveBeenCalledWith(
            '[LMSConnection] Failed to stage emergency state',
            expect.objectContaining({
                domain: 'state',
                operation: 'prepareEmergencySave',
                format: 'scorm1.2',
                error: 'state serialization failed'
            })
        );
        expect(conn.driver.emergencySave).toHaveBeenCalledOnce();
    });

    it('reports driver emergency-save failures with structured context', () => {
        const addEventListener = vi.fn();
        vi.stubGlobal('window', { addEventListener });
        vi.spyOn(stateManager, 'prepareEmergencySave').mockImplementation(() => {});

        const conn = new LMSConnection();
        conn.format = 'scorm2004';
        conn.driver = createDriverStub({
            emergencySave: vi.fn(() => {
                throw new Error('LMS commit rejected');
            })
        });
        conn.setupLifecycleHandlers();

        const pagehideHandler = addEventListener.mock.calls.find(([event]) => event === 'pagehide')[1];
        pagehideHandler();

        expect(logger.error).toHaveBeenCalledWith(
            '[LMSConnection] Driver emergency save failed',
            expect.objectContaining({
                domain: 'lms',
                operation: 'emergencySave',
                format: 'scorm2004',
                error: 'LMS commit rejected'
            })
        );
    });

    it('does not start an overlapping commit after a timeout while the first request still runs', async () => {
        const conn = new LMSConnection();
        conn.format = 'scorm2004';
        conn.setCompatibilityMode('strict-scorm12'); // commit timeout 5s
        let releaseFirst;
        const commit = vi.fn()
            .mockImplementationOnce(() => new Promise(resolve => { releaseFirst = resolve; }))
            .mockResolvedValue(true);
        conn.driver = createDriverStub({ commit });

        const first = conn.commit();
        first.catch(() => {});
        await vi.advanceTimersByTimeAsync(5001);
        await expect(first).rejects.toThrow(/timed out/i);

        const second = conn.commit();
        await vi.advanceTimersByTimeAsync(10);
        expect(commit).toHaveBeenCalledTimes(1);

        releaseFirst(true);
        await expect(second).resolves.toBe(true);
        expect(commit).toHaveBeenCalledTimes(2);
    });

    it('chains terminate after an in-flight commit', async () => {
        const conn = new LMSConnection();
        conn.format = 'cmi5';
        const order = [];
        let releaseCommit;
        conn.driver = createDriverStub({
            commit: vi.fn(() => new Promise(resolve => { releaseCommit = () => { order.push('commit'); resolve(true); }; })),
            terminate: vi.fn(async () => { order.push('terminate'); return true; })
        });

        const committing = conn.commit();
        const terminating = conn.terminate();
        await vi.advanceTimersByTimeAsync(0);
        expect(conn.driver.terminate).not.toHaveBeenCalled();

        releaseCommit();
        await committing;
        await terminating;
        expect(order).toEqual(['commit', 'terminate']);
    });

    it('finishes the session through the driver unload transport on pagehide', () => {
        const addEventListener = vi.fn();
        vi.stubGlobal('window', { addEventListener });
        vi.spyOn(stateManager, 'prepareEmergencySave').mockImplementation(() => {});
        const exitSpy = vi.spyOn(stateManager, 'exitCourseWithSuspend');

        let terminated = false;
        const conn = new LMSConnection();
        conn.format = 'scorm1.2';
        conn.driver = createDriverStub({
            emergencySave: vi.fn(() => { terminated = true; }),
            isTerminated: vi.fn(() => terminated)
        });
        conn.keepAliveInterval = setInterval(() => {}, 1000);
        conn.setupLifecycleHandlers();

        const pagehideHandler = addEventListener.mock.calls.find(([event]) => event === 'pagehide')[1];
        pagehideHandler();
        pagehideHandler();

        expect(stateManager.prepareEmergencySave).toHaveBeenCalledOnce();
        expect(conn.driver.emergencySave).toHaveBeenCalledOnce();
        expect(conn.keepAliveInterval).toBeNull();
        expect(exitSpy).not.toHaveBeenCalled();
    });
});

