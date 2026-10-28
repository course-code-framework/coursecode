import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    lmsConnection: {
        getCapabilities: vi.fn(() => ({ supportsObjectives: true, supportsInteractions: true, maxSuspendDataBytes: 4096 })),
        getFormat: vi.fn(() => 'scorm1.2'),
        getEntryMode: vi.fn(() => 'resume'),
        getSuspendData: vi.fn(() => null),
        setSuspendData: vi.fn(),
        commit: vi.fn().mockResolvedValue(true),
        terminate: vi.fn().mockResolvedValue(true),
        setExitMode: vi.fn(),
        reportSessionTime: vi.fn(),
        reportObjective: vi.fn(),
        reportInteraction: vi.fn(),
        sessionStart: Date.now()
    }
}));

vi.mock('../../../framework/js/state/lms-connection.js', () => ({
    default: mocks.lmsConnection
}));
vi.mock('../../../framework/js/state/xapi-statement-service.js', () => ({
    default: { initialize: vi.fn() }
}));
vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));
vi.mock('../../../framework/js/core/event-bus.js', () => ({
    eventBus: { emit: vi.fn(), emitAsync: vi.fn().mockResolvedValue(true), on: vi.fn(), off: vi.fn() }
}));

import stateManager from '../../../framework/js/state/state-manager.js';
import { eventBus } from '../../../framework/js/core/event-bus.js';

function resetManager() {
    stateManager.isInitialized = false;
    stateManager.isTerminated = false;
    stateManager._terminationPromise = null;
    stateManager._validator.hydrationError = null;
    stateManager._commits._suspendHold = null;
    stateManager._commits._autoBatchDirty = false;
    stateManager._commits._autoBatchSuspendDirty = false;
    stateManager._domains.clearState();
}

describe('StateManager: suspend_data overflow never blocks exit', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetManager();
        mocks.lmsConnection.getSuspendData.mockReturnValue(null);
    });

    it('exitCourseWithSuspend reaches terminate when suspend_data cannot fit', async () => {
        const overflow = Object.assign(new Error('exceeds the 4096-character limit'), { code: 'SUSPEND_DATA_OVERFLOW' });
        mocks.lmsConnection.setSuspendData.mockImplementation(() => { throw overflow; });
        stateManager.initialize();
        stateManager.setDomainState('flags', { big: true });

        await expect(stateManager.exitCourseWithSuspend()).resolves.toBe(true);

        expect(mocks.lmsConnection.commit).toHaveBeenCalled();
        expect(mocks.lmsConnection.setExitMode).toHaveBeenCalledWith('suspend');
        expect(mocks.lmsConnection.terminate).toHaveBeenCalledOnce();
        expect(stateManager.isTerminated).toBe(true);
    });
});

describe('StateManager: corrupted suspend_data does not lock the learner out', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetManager();
        mocks.lmsConnection.setSuspendData.mockReset();
        const corrupt = Object.assign(new Error('SCORM 1.2 resume state cannot be safely restored'), { code: 'SUSPEND_DATA_CORRUPT' });
        mocks.lmsConnection.getSuspendData.mockImplementation(() => { throw corrupt; });
    });

    it('starts fresh, emits state:recovered, and does not overwrite the LMS value on open', async () => {
        expect(() => stateManager.initialize()).not.toThrow();
        expect(stateManager.getState()._meta).toBeDefined();
        expect(eventBus.emit).toHaveBeenCalledWith('state:recovered', expect.objectContaining({
            domain: 'suspend_data',
            action: 'started_fresh_preserving_lms_state'
        }));

        // Opening the course: launch slide, timers, engagement registration, seeded objectives.
        stateManager.setDomainState('navigation', { visitedSlides: ['intro'] });
        stateManager.setDomainState('sessionData', { slideDurations: {} });
        stateManager.setDomainState('engagement', { intro: { required: true, complete: false, tracked: {} } });
        stateManager.setDomainState('objectives', { obj1: { completion_status: 'incomplete', success_status: 'unknown', score: null } });
        await stateManager.flush();
        stateManager.prepareEmergencySave();

        expect(mocks.lmsConnection.commit).toHaveBeenCalled();
        expect(mocks.lmsConnection.setSuspendData).not.toHaveBeenCalled();
    });

    it('resumes writing suspend_data once the learner makes progress', async () => {
        stateManager.initialize();
        stateManager.setDomainState('navigation', { visitedSlides: ['intro', 'lesson-1'] });
        await stateManager.flush();

        expect(mocks.lmsConnection.setSuspendData).toHaveBeenCalledOnce();
    });

    it('still fails closed when the LMS read itself fails (progress may be intact)', () => {
        mocks.lmsConnection.getSuspendData.mockImplementation(() => {
            throw new Error('Failed to get value for "cmi.suspend_data": General exception');
        });
        expect(() => stateManager.initialize()).toThrow(/General exception/);
    });
});
