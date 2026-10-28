/**
 * Regression tests: per-slide time must not include time spent away from the
 * course. Slide start times restored from a previous session are discarded,
 * and the running timer is closed on pagehide/exit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const domains = {};
    const handlers = {};
    return {
        domains,
        handlers,
        windowListeners: {},
        stateManager: {
            getDomainState: vi.fn(key => (domains[key] ? JSON.parse(JSON.stringify(domains[key])) : undefined)),
            setDomainState: vi.fn((key, value) => { domains[key] = JSON.parse(JSON.stringify(value)); })
        },
        eventBus: {
            on: vi.fn((event, handler) => { handlers[event] = handler; }),
            emit: vi.fn()
        },
        currentSlideId: 's1'
    };
});

vi.mock('../../../framework/js/state/index.js', () => ({ default: mocks.stateManager }));
vi.mock('../../../framework/js/core/event-bus.js', () => ({ eventBus: mocks.eventBus }));
vi.mock('../../../framework/js/navigation/NavigationActions.js', () => ({ isOnLastSlide: vi.fn(() => false) }));
vi.mock('../../../framework/js/navigation/NavigationState.js', () => ({
    getCurrentSlideId: () => mocks.currentSlideId,
    addVisitedSlide: vi.fn()
}));
vi.mock('../../../framework/js/utilities/course-helpers.js', () => ({}));
vi.mock('../../../framework/js/managers/assessment-manager.js', () => ({}));
vi.mock('../../../framework/js/managers/comment-manager.js', () => ({ default: {} }));
vi.mock('../../../framework/js/app/AppUI.js', () => ({ showNotification: vi.fn(), getCompletionModalData: vi.fn() }));
vi.mock('../../../framework/js/app/AppState.js', () => ({}));
vi.mock('../../../framework/js/navigation/navigation-helpers.js', () => ({ shouldBypassGating: vi.fn(() => false) }));
vi.mock('../../../framework/js/components/ui-components/index.js', () => ({ announceToScreenReader: vi.fn() }));
vi.mock('../../../framework/js/utilities/logger.js', () => ({ logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('../../../course/course-config.js', () => ({ courseConfig: { structure: [] } }));

import { initAppActions } from '../../../framework/js/app/AppActions.js';

const HOUR = 60 * 60 * 1000;

describe('slide session timers', () => {
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
        for (const key of Object.keys(mocks.domains)) delete mocks.domains[key];
        for (const key of Object.keys(mocks.windowListeners)) delete mocks.windowListeners[key];
        globalThis.document = { body: { addEventListener: vi.fn() } };
        globalThis.window = {
            addEventListener: vi.fn((event, handler) => { mocks.windowListeners[event] = handler; })
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
    });

    it('discards a start time left over from a previous session', () => {
        // Previous session ended (LMS window closed) an hour ago without ending the timer
        mocks.domains.sessionData = {
            slideDurations: { s1: 10_000 },
            slideStartTimes: { s1: Date.now() - HOUR }
        };

        initAppActions();
        expect(mocks.domains.sessionData.slideStartTimes).toEqual({});

        // Resume on the same slide, stay 5 seconds, navigate away
        mocks.handlers['navigation:changed']({ toSlideId: 's1' });
        vi.advanceTimersByTime(5_000);
        mocks.handlers['navigation:beforeChange']({ fromSlideId: 's1' });

        expect(mocks.domains.sessionData.slideDurations.s1).toBe(15_000);
    });

    it('credits the running slide timer on pagehide', () => {
        initAppActions();
        mocks.handlers['navigation:changed']({ toSlideId: 's1' });
        vi.advanceTimersByTime(7_000);

        mocks.windowListeners.pagehide();

        expect(mocks.domains.sessionData.slideDurations.s1).toBe(7_000);
        expect(mocks.domains.sessionData.slideStartTimes.s1).toBeUndefined();

        // Time after the page went away is never added on the next session
        vi.advanceTimersByTime(HOUR);
        mocks.handlers['navigation:beforeChange']({ fromSlideId: 's1' });
        expect(mocks.domains.sessionData.slideDurations.s1).toBe(7_000);
    });
});
