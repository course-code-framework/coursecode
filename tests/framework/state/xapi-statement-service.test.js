import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock Dependencies ─────────────────────────────────────────────

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

vi.mock('../../../framework/js/core/event-bus.js', () => {
    const handlers = {};
    return {
        eventBus: {
            on: vi.fn((event, cb) => {
                if (!handlers[event]) handlers[event] = [];
                handlers[event].push(cb);
                return () => { handlers[event] = handlers[event].filter(h => h !== cb); };
            }),
            emit: vi.fn((event, data) => {
                (handlers[event] || []).forEach(cb => cb(data));
            }),
            _handlers: handlers,
            _reset: () => { for (const k of Object.keys(handlers)) delete handlers[k]; }
        }
    };
});

import { eventBus } from '../../../framework/js/core/event-bus.js';

let XapiStatementService;
let service;

function createMockDriver() {
    return {
        sendObjectiveStatement: vi.fn(() => Promise.resolve()),
        sendInteractionStatement: vi.fn(() => Promise.resolve()),
        sendAssessmentStatement: vi.fn(() => Promise.resolve()),
        sendSlideStatement: vi.fn(() => Promise.resolve())
    };
}

function createNonXapiDriver() {
    return {
        setSuspendData: vi.fn(),
        commit: vi.fn()
        // No xAPI methods — like a SCORM driver
    };
}

beforeEach(async () => {
    vi.clearAllMocks();
    eventBus._reset();
    vi.resetModules();

    vi.doMock('../../../framework/js/utilities/logger.js', () => ({
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
    }));
    vi.doMock('../../../framework/js/core/event-bus.js', () => ({ eventBus }));

    const mod = await import('../../../framework/js/state/xapi-statement-service.js');
    service = mod.default;
});


// ─── Initialization ─────────────────────────────────────────────────

describe('XapiStatementService: initialization', () => {
    it('initializes with xAPI-capable driver and subscribes to events', () => {
        const driver = createMockDriver();
        service.initialize(driver);

        expect(service._isInitialized).toBe(true);
        expect(eventBus.on).toHaveBeenCalled();
    });

    it('initializes with non-xAPI driver but does not subscribe to events', () => {
        const driver = createNonXapiDriver();
        service.initialize(driver);

        expect(service._isInitialized).toBe(true);
        // on() should not be called because driver has no xAPI support
        expect(eventBus.on).not.toHaveBeenCalled();
    });

    it('warns on double initialization', () => {
        const driver = createMockDriver();
        service.initialize(driver);
        service.initialize(driver); // second call — should just warn, not throw
        expect(service._isInitialized).toBe(true);
    });
});


// ─── Objective Events → xAPI Statements ─────────────────────────────

describe('XapiStatementService: objective events', () => {
    let driver;

    beforeEach(() => {
        driver = createMockDriver();
        service.initialize(driver);
    });

    it('sends "progressed" statement on objective:updated', () => {
        eventBus.emit('objective:updated', {
            id: 'obj-1',
            completion_status: 'incomplete',
            success_status: 'unknown'
        });

        expect(driver.sendObjectiveStatement).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'obj-1', verb: 'progressed' })
        );
    });

    it('sends "completed" verb when completion_status is completed', () => {
        eventBus.emit('objective:updated', {
            id: 'obj-1',
            completion_status: 'completed',
            success_status: 'unknown'
        });

        expect(driver.sendObjectiveStatement).toHaveBeenCalledWith(
            expect.objectContaining({ verb: 'completed' })
        );
    });

    it('sends "passed" verb when success_status is passed', () => {
        eventBus.emit('objective:updated', {
            id: 'obj-1',
            completion_status: 'completed',
            success_status: 'passed'
        });

        // 'passed' takes precedence over 'completed'
        expect(driver.sendObjectiveStatement).toHaveBeenCalledWith(
            expect.objectContaining({ verb: 'passed' })
        );
    });

    it('sends "failed" verb when success_status is failed', () => {
        eventBus.emit('objective:updated', {
            id: 'obj-1',
            success_status: 'failed'
        });

        expect(driver.sendObjectiveStatement).toHaveBeenCalledWith(
            expect.objectContaining({ verb: 'failed' })
        );
    });

    it('converts score from 0-100 to 0-1 scaled', () => {
        eventBus.emit('objective:updated', {
            id: 'obj-1',
            score: 85
        });

        expect(driver.sendObjectiveStatement).toHaveBeenCalledWith(
            expect.objectContaining({ score: 0.85 })
        );
    });

    it('ignores objective events with no id', () => {
        eventBus.emit('objective:updated', {});
        expect(driver.sendObjectiveStatement).not.toHaveBeenCalled();
    });

    it('sends score update on objective:score:updated', () => {
        eventBus.emit('objective:score:updated', { objectiveId: 'obj-1', score: 72 });

        expect(driver.sendObjectiveStatement).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'obj-1', verb: 'progressed', score: 0.72 })
        );
    });

    it('handles objectiveId or id in score event', () => {
        eventBus.emit('objective:score:updated', { id: 'obj-2', score: 60 });

        expect(driver.sendObjectiveStatement).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'obj-2' })
        );
    });
});


// ─── Interaction Events → xAPI Statements ───────────────────────────

describe('XapiStatementService: interaction events', () => {
    let driver;

    beforeEach(() => {
        driver = createMockDriver();
        service.initialize(driver);
    });

    it('sends interaction statement on interaction:recorded', () => {
        eventBus.emit('interaction:recorded', {
            id: 'q1',
            type: 'true-false',
            learner_response: 'true',
            result: 'correct',
            description: 'Is the sky blue?'
        });

        expect(driver.sendInteractionStatement).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'q1',
                type: 'true-false',
                response: 'true',
                correct: true,
                description: 'Is the sky blue?'
            })
        );
    });

    it('sets correct to false for incorrect results', () => {
        eventBus.emit('interaction:recorded', {
            id: 'q2', type: 'choice', result: 'incorrect'
        });

        expect(driver.sendInteractionStatement).toHaveBeenCalledWith(
            expect.objectContaining({ correct: false })
        );
    });

    it('ignores interactions with no id', () => {
        eventBus.emit('interaction:recorded', {});
        expect(driver.sendInteractionStatement).not.toHaveBeenCalled();
    });
});


// ─── Assessment Events → xAPI Statements ────────────────────────────

describe('XapiStatementService: assessment events', () => {
    let driver;

    beforeEach(() => {
        driver = createMockDriver();
        service.initialize(driver);
    });

    it('sends assessment statement on assessment:submitted', () => {
        eventBus.emit('assessment:submitted', {
            assessmentId: 'final-exam',
            results: {
                scorePercentage: 85,
                passed: true,
                totalQuestions: 10,
                correctCount: 8,
                attemptNumber: 1,
                timeSpent: '05:30'
            }
        });

        expect(driver.sendAssessmentStatement).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'final-exam',
                score: 0.85,
                passed: true,
                questionCount: 10,
                correctCount: 8,
                attemptNumber: 1,
                duration: 'PT5M30S'
            })
        );
    });

    it('handles assessment without timeSpent', () => {
        eventBus.emit('assessment:submitted', {
            assessmentId: 'quiz',
            results: {
                scorePercentage: 50,
                passed: false,
                totalQuestions: 5,
                correctCount: 2,
                attemptNumber: 2
            }
        });

        expect(driver.sendAssessmentStatement).toHaveBeenCalledWith(
            expect.objectContaining({ duration: undefined })
        );
    });

    it('ignores assessment events with no assessmentId', () => {
        eventBus.emit('assessment:submitted', { results: {} });
        expect(driver.sendAssessmentStatement).not.toHaveBeenCalled();
    });

    it('ignores assessment events with no results', () => {
        eventBus.emit('assessment:submitted', { assessmentId: 'quiz' });
        expect(driver.sendAssessmentStatement).not.toHaveBeenCalled();
    });
});


// ─── Slide Duration Tracking ────────────────────────────────────────

describe('XapiStatementService: slide tracking', () => {
    let driver;

    beforeEach(() => {
        driver = createMockDriver();
        service.initialize(driver);
    });

    it('sends "experienced" statement for previous slide on navigation', async () => {
        // Navigate to slide-1 (sets entry time)
        eventBus.emit('navigation:changed', {
            fromSlideId: null,
            toSlideId: 'slide-1',
            slideTitle: 'Introduction'
        });

        // Simulate some time passing
        vi.spyOn(Date, 'now')
            .mockReturnValueOnce(Date.now() + 30000); // 30 seconds later

        // Navigate away from slide-1 to slide-2
        eventBus.emit('navigation:changed', {
            fromSlideId: 'slide-1',
            toSlideId: 'slide-2',
            slideTitle: 'Content'
        });

        expect(driver.sendSlideStatement).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'slide-1',
                title: 'Introduction',
                verb: 'experienced'
            })
        );
    });

    it('does not send statement when there is no fromSlideId', () => {
        eventBus.emit('navigation:changed', {
            fromSlideId: null,
            toSlideId: 'slide-1',
            slideTitle: 'First Slide'
        });

        expect(driver.sendSlideStatement).not.toHaveBeenCalled();
    });

    it('tracks new slide entry time after navigation', () => {
        eventBus.emit('navigation:changed', {
            fromSlideId: null,
            toSlideId: 'slide-1',
            slideTitle: 'Intro'
        });

        expect(service._currentSlideId).toBe('slide-1');
        expect(service._currentSlideTitle).toBe('Intro');
        expect(service._slideEntryTime).not.toBeNull();
    });
});


// ─── Session Termination ────────────────────────────────────────────

describe('XapiStatementService: session termination', () => {
    let driver;

    beforeEach(() => {
        driver = createMockDriver();
        service.initialize(driver);
    });

    it('sends pending slide statement on session:beforeTerminate', async () => {
        // Navigate to a slide
        eventBus.emit('navigation:changed', {
            fromSlideId: null,
            toSlideId: 'slide-last',
            slideTitle: 'Last Slide'
        });

        // Terminate session
        await service._handleBeforeTerminate();

        expect(driver.sendSlideStatement).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'slide-last',
                verb: 'experienced'
            })
        );
    });

    it('clears tracking state after sending final statement', async () => {
        eventBus.emit('navigation:changed', {
            fromSlideId: null,
            toSlideId: 'slide-last',
            slideTitle: 'Last Slide'
        });

        await service._handleBeforeTerminate();

        expect(service._currentSlideId).toBeNull();
        expect(service._slideEntryTime).toBeNull();
    });

    it('is a no-op when no current slide', async () => {
        await service._handleBeforeTerminate();
        expect(driver.sendSlideStatement).not.toHaveBeenCalled();
    });
});


// ─── Duration Calculation ───────────────────────────────────────────

describe('XapiStatementService: _calculateDuration', () => {
    let driver;

    beforeEach(() => {
        driver = createMockDriver();
        service.initialize(driver);
    });

    it('formats seconds-only duration', () => {
        const start = Date.now() - 45000; // 45 seconds ago
        expect(service._calculateDuration(start)).toBe('PT45S');
    });

    it('formats minutes and seconds', () => {
        const start = Date.now() - 150000; // 2 minutes 30 seconds
        expect(service._calculateDuration(start)).toBe('PT2M30S');
    });

    it('formats hours, minutes, and seconds', () => {
        const start = Date.now() - 3725000; // 1 hour 2 minutes 5 seconds
        expect(service._calculateDuration(start)).toBe('PT1H2M5S');
    });

    it('formats zero seconds', () => {
        const start = Date.now();
        expect(service._calculateDuration(start)).toBe('PT0S');
    });
});


// ─── Error Resilience ───────────────────────────────────────────────

describe('XapiStatementService: error resilience', () => {
    it('does not throw when driver method rejects', async () => {
        const driver = createMockDriver();
        driver.sendObjectiveStatement.mockRejectedValue(new Error('Network error'));
        service.initialize(driver);

        // Should not throw — xAPI statements are non-blocking
        eventBus.emit('objective:updated', { id: 'obj-1' });
        // No assertion needed — just verify no uncaught error
    });
});


// ─── Destroy ────────────────────────────────────────────────────────

describe('XapiStatementService: destroy', () => {
    it('cleans up subscriptions and state', () => {
        const driver = createMockDriver();
        service.initialize(driver);

        service.destroy();

        expect(service._isInitialized).toBe(false);
        expect(service._driver).toBeNull();
        expect(service._currentSlideId).toBeNull();
        expect(service._subscriptions).toEqual([]);
    });
});
