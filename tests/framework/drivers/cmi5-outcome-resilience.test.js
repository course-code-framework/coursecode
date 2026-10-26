import { describe, it, expect, vi, afterEach } from 'vitest';
import Cmi5 from '@xapi/cmi5';
import { Cmi5Driver } from '../../../framework/js/drivers/cmi5-driver.js';

// Exercises the REAL @xapi/cmi5 library (not a mock) so the driver is held to
// the library's own mastery-score check: pass() throws "Learner has not met
// Mastery Score" when launchData.masteryScore is set and the score is missing
// or below it.

const PARAMETERS = {
    fetch: 'https://lms.example.com/cmi5/fetch',
    endpoint: 'https://lms.example.com/xapi',
    actor: { mbox: 'mailto:learner@example.com' },
    registration: '00000000-0000-4000-8000-000000000001',
    activityId: 'https://example.com/course/au/1'
};

async function createDriverWithRealLibrary(launchDataOverrides = {}) {
    const cmi5 = new Cmi5(PARAMETERS);
    cmi5.getAuthTokenFromLMS = vi.fn().mockResolvedValue('temporary-auth-token');
    cmi5.getLaunchDataFromLMS = vi.fn().mockResolvedValue({
        launchMode: 'Normal',
        moveOn: 'CompletedAndPassed',
        masteryScore: 0.8,
        contextTemplate: {},
        ...launchDataOverrides
    });
    cmi5.getLearnerPreferencesFromLMS = vi.fn().mockResolvedValue({});
    const statements = [];
    cmi5.sendXapiStatement = vi.fn(async statement => {
        statements.push(statement);
    });
    await cmi5.initialize();
    statements.length = 0;

    const setState = vi.fn().mockResolvedValue(undefined);
    cmi5.xapi.setState = setState;

    const driver = new Cmi5Driver();
    driver._cmi5 = cmi5;
    driver._isConnected = true;
    driver._mock = false;

    const verbs = () => statements.map(statement => statement.verb.id.split('/').pop());
    return { driver, cmi5, statements, verbs, setState };
}

describe('cmi5 outcomes against the real @xapi/cmi5 mastery check', () => {
    it('library precondition: pass() without a score throws when masteryScore is set', async () => {
        const { cmi5 } = await createDriverWithRealLibrary();
        expect(() => cmi5.pass()).toThrow(/Mastery Score/);
    });

    it('does not wedge commits when a pass is reported with no score under a masteryScore', async () => {
        const { driver, verbs } = await createDriverWithRealLibrary();
        driver.reportCompletion('completed');
        driver.reportSuccess('passed');

        await expect(driver.commit()).resolves.toBe(true);
        await expect(driver.commit()).resolves.toBe(true);

        // Completed is sent; Passed is withheld until a score can satisfy mastery.
        expect(verbs()).toEqual(['completed']);

        driver.reportScore({ scaled: 0.9 });
        await driver.commit();
        expect(verbs()).toEqual(['completed', 'passed']);
    });

    it('sends Failed (with the score) when a reported pass is below the masteryScore', async () => {
        const { driver, statements, verbs } = await createDriverWithRealLibrary();
        driver.reportSuccess('passed');
        driver.reportScore({ scaled: 0.5 });

        await driver.commit();

        expect(verbs()).toEqual(['failed']);
        expect(statements[0].result).toMatchObject({ success: false, score: { scaled: 0.5 } });
        expect(driver._sentSuccessStatus).toBe('failed');

        // Not re-sent on every commit.
        await driver.commit();
        expect(verbs()).toEqual(['failed']);
    });

    it('sends Passed with the score and mastery extension when the score meets mastery', async () => {
        const { driver, statements, verbs } = await createDriverWithRealLibrary();
        driver.reportSuccess('passed');
        driver.reportScore({ scaled: 0.85 });

        await driver.commit();

        expect(verbs()).toEqual(['passed']);
        expect(statements[0].result.score).toEqual({ scaled: 0.85 });
        expect(statements[0].context.extensions['https://w3id.org/xapi/cmi5/context/extensions/masteryscore']).toBe(0.8);
    });

    it('sends a scoreless Passed when no masteryScore was supplied', async () => {
        const { driver, verbs } = await createDriverWithRealLibrary({ masteryScore: undefined });
        driver.reportSuccess('passed');

        await driver.commit();

        expect(verbs()).toEqual(['passed']);
    });

    it('always sends Terminated even when an outcome statement fails', async () => {
        const { driver, cmi5, verbs } = await createDriverWithRealLibrary();
        driver.reportCompletion('completed');
        const original = cmi5.sendXapiStatement;
        cmi5.sendXapiStatement = vi.fn(async statement => {
            if (statement.verb.id.endsWith('/completed')) throw new Error('LRS 500');
            return original(statement);
        });

        await expect(driver.terminate()).resolves.toBe(true);

        expect(verbs()).toEqual(['terminated']);
        expect(driver.isTerminated()).toBe(true);
    });

    it('always sends Terminated even when state persistence fails', async () => {
        const { driver, verbs, setState } = await createDriverWithRealLibrary();
        setState.mockRejectedValue(new Error('LRS unavailable'));
        driver.setSuspendData({ navigation: { visitedSlides: ['a'] } });

        await expect(driver.terminate()).resolves.toBe(true);
        expect(verbs()).toEqual(['terminated']);
    });
});

describe('cmi5 sent-flag persistence', () => {
    it('persists sentComplete immediately, before a later Passed failure', async () => {
        const { driver, cmi5, setState } = await createDriverWithRealLibrary({ masteryScore: undefined });
        driver.reportCompletion('completed');
        driver.reportSuccess('passed');
        const original = cmi5.sendXapiStatement;
        cmi5.sendXapiStatement = vi.fn(async statement => {
            if (statement.verb.id.endsWith('/passed')) throw new Error('LRS 503');
            return original(statement);
        });

        await expect(driver.commit()).rejects.toThrow('LRS 503');

        const bookmarkWrites = setState.mock.calls
            .map(([request]) => request)
            .filter(request => request.stateId.endsWith('/bookmark'));
        expect(bookmarkWrites.at(-1).state).toMatchObject({ sentComplete: true, sentResult: false });
    });

    it('treats an LMS rejection of an unconfirmed unload-time Completed as already recorded', async () => {
        const { driver, cmi5 } = await createDriverWithRealLibrary();
        driver._completionStatus = 'completed';
        driver._unconfirmedOutcomes = { complete: true, result: null };
        cmi5.sendXapiStatement = vi.fn().mockRejectedValue({ message: 'Forbidden', response: { status: 403 } });

        await expect(driver.commit()).resolves.toBe(true);
        expect(driver._sentComplete).toBe(true);
        expect(driver._unconfirmedOutcomes).toBeNull();
    });
});

describe('cmi5 HTTP dirty-flag race', () => {
    it('keeps suspend_data dirty when it changes while a save is in flight', async () => {
        const { driver, setState } = await createDriverWithRealLibrary();
        let release;
        setState.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));

        driver.setSuspendData({ version: 1 });
        const pending = driver._persistState();
        driver.setSuspendData({ version: 2 });
        release();
        await pending;

        expect(driver._suspendDataDirty).toBe(true);
        await driver._persistState();
        expect(setState.mock.calls.at(-1)[0].state).toEqual({ version: 2 });
        expect(driver._suspendDataDirty).toBe(false);
    });

    it('re-marks suspend_data dirty when the save fails', async () => {
        const { driver, setState } = await createDriverWithRealLibrary();
        setState.mockRejectedValueOnce(new Error('offline'));
        driver.setSuspendData({ version: 1 });

        await expect(driver._persistState()).rejects.toThrow('offline');
        expect(driver._suspendDataDirty).toBe(true);
    });
});

describe('cmi5 emergency save on unload', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('flushes pending Completed/Passed plus Terminated in one keepalive POST, then state', async () => {
        const { driver } = await createDriverWithRealLibrary();
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);
        driver.reportCompletion('completed');
        driver.reportSuccess('passed');
        driver.reportScore({ scaled: 0.9 });
        driver.setSuspendData({ navigation: { visitedSlides: ['a', 'b'] } });

        driver.emergencySave();

        const [statementsUrl, statementsRequest] = fetchMock.mock.calls[0];
        expect(statementsUrl).toBe('https://lms.example.com/xapi/statements');
        expect(statementsRequest).toMatchObject({ method: 'POST', keepalive: true });
        const statements = JSON.parse(statementsRequest.body);
        expect(statements.map(statement => statement.verb.id.split('/').pop()))
            .toEqual(['completed', 'passed', 'terminated']);
        expect(statements[1].result).toMatchObject({ success: true, score: { scaled: 0.9 } });
        expect(statements.every(statement => statement.context.registration === PARAMETERS.registration)).toBe(true);
        expect(statements[0].context.contextActivities.category).toEqual(expect.arrayContaining([
            { id: 'https://w3id.org/xapi/cmi5/context/categories/moveon' }
        ]));

        const bookmarkCall = fetchMock.mock.calls.find(([url]) => url.includes('bookmark'));
        expect(JSON.parse(bookmarkCall[1].body).unconfirmedOutcomes).toEqual({ complete: true, result: 'passed' });
        expect(fetchMock.mock.calls.some(([url]) => url.includes('suspend_data'))).toBe(true);
        expect(driver.isTerminated()).toBe(true);
    });

    it('sends oversized suspend_data without keepalive so it cannot exhaust the 64KiB budget', async () => {
        const { driver } = await createDriverWithRealLibrary();
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);
        driver.setSuspendData({ blob: 'x'.repeat(70 * 1024) });

        driver.emergencySave();

        const [, statementsRequest] = fetchMock.mock.calls[0];
        expect(statementsRequest.keepalive).toBe(true);
        const suspendCall = fetchMock.mock.calls.find(([url]) => url.includes('suspend_data'));
        expect(suspendCall[1].keepalive).toBe(false);
    });

    it('never throws when fetch throws synchronously', async () => {
        const { driver } = await createDriverWithRealLibrary();
        vi.stubGlobal('fetch', vi.fn(() => { throw new TypeError('quota exceeded'); }));

        expect(() => driver.emergencySave()).not.toThrow();
    });
});

describe('cmi5 statement result fields', () => {
    it('omits result.success for interactions where correctness does not apply', async () => {
        const { driver, statements } = await createDriverWithRealLibrary();
        await driver.sendInteractionStatement({ id: 'survey', type: 'likert', response: '4', correct: undefined });
        await driver.sendInteractionStatement({ id: 'q1', type: 'choice', response: 'a', correct: false });

        expect(statements[0].result).not.toHaveProperty('success');
        expect(statements[1].result.success).toBe(false);
    });

    it('omits result.score for objectives without a score instead of reporting 0', async () => {
        const { driver, statements } = await createDriverWithRealLibrary();
        await driver.sendObjectiveStatement({ id: 'obj', verb: 'progressed', score: null });
        await driver.sendObjectiveStatement({ id: 'obj', verb: 'completed', score: undefined });

        expect(statements[0].result).toBeUndefined();
        expect(statements[1].result).not.toHaveProperty('score');
    });

    it('preserves a retried statement id and original timestamp', async () => {
        const { driver, statements } = await createDriverWithRealLibrary();
        await driver.sendSlideStatement({
            id: 'slide-1',
            statementId: '6f1c1f5e-0d6b-4c55-9b5a-7d7c9b8f0a11',
            timestamp: '2026-01-01T00:00:00.000Z'
        });

        expect(statements[0]).toMatchObject({
            id: '6f1c1f5e-0d6b-4c55-9b5a-7d7c9b8f0a11',
            timestamp: '2026-01-01T00:00:00.000Z'
        });
    });
});
