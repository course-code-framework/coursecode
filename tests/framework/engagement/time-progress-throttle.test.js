/**
 * Regression test: timeOnSlide tracking evaluates every 100ms but must not
 * emit engagement:progress (which triggers a full navigation sync) on every
 * tick — at most about once per second.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const domains = {};
    return {
        domains,
        stateManager: {
            getDomainState: vi.fn(key => domains[key]),
            setDomainState: vi.fn((key, value) => { domains[key] = value; })
        },
        eventBus: { emit: vi.fn(), on: vi.fn() }
    };
});

vi.mock('../../../framework/js/state/index.js', () => ({ default: mocks.stateManager }));
vi.mock('../../../framework/js/core/event-bus.js', () => ({ eventBus: mocks.eventBus }));
vi.mock('../../../framework/js/navigation/NavigationState.js', () => ({ getCurrentSlideId: () => 'slide1' }));
vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import engagementManager from '../../../framework/js/engagement/engagement-manager.js';

describe('timeOnSlide progress events', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        vi.stubGlobal('window', { CourseCode: { interactionRegistry: { getAll: () => [] } } });
        for (const key of Object.keys(mocks.domains)) delete mocks.domains[key];
        mocks.eventBus.emit.mockClear();

        engagementManager.isInitialized = false;
        engagementManager.courseConfig = {
            structure: [{
                id: 'slide1',
                engagement: { required: true, requirements: [{ type: 'timeOnSlide', minSeconds: 10 }] }
            }]
        };
        // Timer started now (as AppActions.startSessionTimer would)
        mocks.domains.sessionData = { slideDurations: {}, slideStartTimes: { slide1: Date.now() } };
    });

    afterEach(() => {
        engagementManager._stopTimeTracking('slide1');
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('emits progress at most once per second while time accrues', () => {
        engagementManager.initSlide('slide1', engagementManager.courseConfig.structure[0].engagement);
        vi.advanceTimersByTime(5_000);

        const progressEvents = mocks.eventBus.emit.mock.calls.filter(([event]) => event === 'engagement:progress');
        expect(progressEvents.length).toBeGreaterThanOrEqual(4);
        expect(progressEvents.length).toBeLessThanOrEqual(6);
    });

    it('still detects completion promptly', () => {
        engagementManager.initSlide('slide1', engagementManager.courseConfig.structure[0].engagement);
        vi.advanceTimersByTime(10_200);

        const completeEvents = mocks.eventBus.emit.mock.calls.filter(([event]) => event === 'engagement:complete');
        expect(completeEvents).toHaveLength(1);
    });
});
