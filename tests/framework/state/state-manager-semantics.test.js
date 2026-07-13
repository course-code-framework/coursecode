import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    lmsConnection: {
        reportObjective: vi.fn(),
        reportInteraction: vi.fn(),
        setBookmark: vi.fn(),
        reportCompletion: vi.fn(),
        reportSuccess: vi.fn(),
        reportScore: vi.fn(),
        reportProgress: vi.fn()
    }
}));

vi.mock('../../../framework/js/state/lms-connection.js', () => ({
    default: mocks.lmsConnection
}));
vi.mock('../../../framework/js/state/xapi-statement-service.js', () => ({
    default: { initialize: vi.fn() }
}));
vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock('../../../framework/js/core/event-bus.js', () => ({
    eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}));

import stateManager from '../../../framework/js/state/state-manager.js';

describe('StateManager semantic-domain validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        stateManager.isInitialized = true;
        stateManager.isTerminated = false;
        stateManager._domains.clearState();
        stateManager._commits.scheduleCommit = vi.fn();
        stateManager._commits.commitToLMS = vi.fn().mockResolvedValue(true);
    });

    it('rejects invalid objective state before mutating the domain store', () => {
        expect(() => stateManager.setDomainState('objectives', {
            objective1: { completion_status: 'almost' }
        })).toThrow('invalid objective completion status');

        expect(stateManager.getDomainState('objectives')).toBeUndefined();
        expect(mocks.lmsConnection.reportObjective).not.toHaveBeenCalled();
        expect(stateManager._commits.scheduleCommit).not.toHaveBeenCalled();
    });

    it('reports valid objective state after storing it', () => {
        const objectives = {
            objective1: {
                completion_status: 'not attempted',
                success_status: 'unknown',
                score: 0
            }
        };

        stateManager.setDomainState('objectives', objectives);

        expect(stateManager.getDomainState('objectives')).toEqual(objectives);
        expect(mocks.lmsConnection.reportObjective).toHaveBeenCalledWith({
            id: 'objective1',
            ...objectives.objective1
        });
    });

    it('clears both suspend-data domains and learner-facing LMS progress', async () => {
        stateManager.setDomainState('objectives', {
            objective1: { completion_status: 'completed', success_status: 'passed', score: 100 }
        });

        await stateManager.clearAllData();

        expect(mocks.lmsConnection.reportObjective).toHaveBeenLastCalledWith({
            id: 'objective1',
            completion_status: 'incomplete',
            success_status: 'unknown',
            score: 0,
            progress_measure: 0
        });
        expect(mocks.lmsConnection.setBookmark).toHaveBeenCalledWith('');
        expect(mocks.lmsConnection.reportCompletion).toHaveBeenCalledWith('incomplete');
        expect(mocks.lmsConnection.reportSuccess).toHaveBeenCalledWith('unknown');
        expect(mocks.lmsConnection.reportProgress).toHaveBeenCalledWith(0);
        expect(stateManager.getState()).toEqual({});
        expect(stateManager._commits.commitToLMS).toHaveBeenCalledOnce();
    });

    it('excludes remedial and inactive conditional slides from LMS progress', () => {
        stateManager.setDomainState('navigation', {
            visitedSlides: ['intro', 'remedial-1', 'conditional-hidden']
        });

        const progress = stateManager.updateProgressMeasure(2, ['intro', 'summary']);

        expect(progress).toBe(0.5);
        expect(mocks.lmsConnection.reportProgress).toHaveBeenLastCalledWith(0.5);
    });
});
