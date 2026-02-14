/**
 * @file bug-audit.test.js
 * @description Tests for real bugs found during source code audit.
 * Each test documents the bug, its impact, and the correct behavior.
 *
 * Bugs 1 & 2 (objective-manager) are in bug-audit-objectives.test.js
 * because they conflict with the score-manager mock of objective-manager.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shared mock factories (hoisted)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

vi.mock('../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

vi.mock('../../framework/js/state/index.js', () => {
    const store = {};
    return {
        default: {
            getDomainState: vi.fn((key) => store[key] ?? null),
            setDomainState: vi.fn((key, val) => { store[key] = val; }),
            reportScore: vi.fn(),
            flush: vi.fn(() => Promise.resolve()),
            _store: store,
            _reset: () => { for (const k of Object.keys(store)) delete store[k]; }
        }
    };
});

vi.mock('../../framework/js/core/event-bus.js', () => {
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

vi.mock('../../framework/js/managers/objective-manager.js', () => ({
    default: { getObjective: vi.fn(() => null) }
}));

import stateManager from '../../framework/js/state/index.js';
import { eventBus } from '../../framework/js/core/event-bus.js';


// ═══════════════════════════════════════════════════════════════════════
// Bug 3: score-manager allows double-init after null config
// ═══════════════════════════════════════════════════════════════════════

describe('BUG: score-manager double-init bypass', () => {
    let scoreManager;

    beforeEach(async () => {
        vi.clearAllMocks();
        stateManager._reset();
        stateManager.getDomainState.mockReturnValue(null);
        eventBus._reset();
        vi.resetModules();

        vi.doMock('../../framework/js/utilities/logger.js', () => ({
            logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
        }));
        vi.doMock('../../framework/js/state/index.js', () => ({ default: stateManager }));
        vi.doMock('../../framework/js/core/event-bus.js', () => ({ eventBus }));
        vi.doMock('../../framework/js/managers/objective-manager.js', () => ({
            default: { getObjective: vi.fn(() => null) }
        }));

        const mod = await import('../../framework/js/managers/score-manager.js');
        scoreManager = mod.default;
    });

    it('should throw on second initialize() even if first was called with null', () => {
        scoreManager.initialize(null);

        expect(() => {
            scoreManager.initialize({
                type: 'average',
                sources: ['assessment:quiz']
            });
        }).toThrow(/already initialized/i);
    });
});


// ═══════════════════════════════════════════════════════════════════════
// Bug 4: xapi-statement-service can't parse HH:MM:SS timeSpent
// ═══════════════════════════════════════════════════════════════════════

describe('BUG: xapi-statement-service timeSpent parsing', () => {
    let service, driver;

    beforeEach(async () => {
        vi.clearAllMocks();
        eventBus._reset();
        vi.resetModules();

        vi.doMock('../../framework/js/utilities/logger.js', () => ({
            logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
        }));
        vi.doMock('../../framework/js/core/event-bus.js', () => ({ eventBus }));

        const mod = await import('../../framework/js/state/xapi-statement-service.js');
        service = mod.default;

        driver = {
            sendObjectiveStatement: vi.fn(() => Promise.resolve()),
            sendInteractionStatement: vi.fn(() => Promise.resolve()),
            sendAssessmentStatement: vi.fn(() => Promise.resolve()),
            sendSlideStatement: vi.fn(() => Promise.resolve())
        };
        service.initialize(driver);
    });

    it('should parse HH:MM:SS timeSpent correctly', () => {
        eventBus.emit('assessment:submitted', {
            assessmentId: 'long-exam',
            results: {
                scorePercentage: 90,
                passed: true,
                totalQuestions: 50,
                correctCount: 45,
                attemptNumber: 1,
                timeSpent: '1:05:30'
            }
        });

        expect(driver.sendAssessmentStatement).toHaveBeenCalledWith(
            expect.objectContaining({ duration: 'PT1H5M30S' })
        );
    });

    it('should still parse MM:SS timeSpent correctly', () => {
        eventBus.emit('assessment:submitted', {
            assessmentId: 'short-quiz',
            results: {
                scorePercentage: 80,
                passed: true,
                totalQuestions: 10,
                correctCount: 8,
                attemptNumber: 1,
                timeSpent: '5:30'
            }
        });

        expect(driver.sendAssessmentStatement).toHaveBeenCalledWith(
            expect.objectContaining({ duration: 'PT5M30S' })
        );
    });
});


// ═══════════════════════════════════════════════════════════════════════
// Bug 5: NaN score when scorePercentage is missing
// ═══════════════════════════════════════════════════════════════════════

describe('BUG: xapi-statement-service NaN score', () => {
    let service, driver;

    beforeEach(async () => {
        vi.clearAllMocks();
        eventBus._reset();
        vi.resetModules();

        vi.doMock('../../framework/js/utilities/logger.js', () => ({
            logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
        }));
        vi.doMock('../../framework/js/core/event-bus.js', () => ({ eventBus }));

        const mod = await import('../../framework/js/state/xapi-statement-service.js');
        service = mod.default;

        driver = {
            sendObjectiveStatement: vi.fn(() => Promise.resolve()),
            sendInteractionStatement: vi.fn(() => Promise.resolve()),
            sendAssessmentStatement: vi.fn(() => Promise.resolve()),
            sendSlideStatement: vi.fn(() => Promise.resolve())
        };
        service.initialize(driver);
    });

    it('should send undefined score when scorePercentage is missing', () => {
        eventBus.emit('assessment:submitted', {
            assessmentId: 'quiz',
            results: {
                passed: true,
                totalQuestions: 5,
                correctCount: 5,
                attemptNumber: 1,
            }
        });

        const sentData = driver.sendAssessmentStatement.mock.calls[0][0];
        expect(sentData.score).toBeUndefined();
    });

    it('should send correct score when scorePercentage is 0', () => {
        eventBus.emit('assessment:submitted', {
            assessmentId: 'quiz',
            results: {
                scorePercentage: 0,
                passed: false,
                totalQuestions: 5,
                correctCount: 0,
                attemptNumber: 1,
            }
        });

        const sentData = driver.sendAssessmentStatement.mock.calls[0][0];
        expect(sentData.score).toBe(0);
    });
});
