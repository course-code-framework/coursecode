/**
 * @file adversarial-xapi-statement-service.test.js
 * @description Adversarial tests for xapi-statement-service.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    eventBus: {
        emit: vi.fn(),
        on: vi.fn(() => vi.fn())
    },
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock('../../../framework/js/core/event-bus.js', () => ({
    eventBus: mocks.eventBus
}));

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: mocks.logger
}));

import xapiStatementService from '../../../framework/js/state/xapi-statement-service.js';

describe('FIXED: xAPI Statement Service', () => {

    let mockDriver;

    beforeEach(() => {
        vi.clearAllMocks();

        mockDriver = {
            sendObjectiveStatement: vi.fn().mockResolvedValue(undefined),
            sendInteractionStatement: vi.fn().mockResolvedValue(undefined),
            sendAssessmentStatement: vi.fn().mockResolvedValue(undefined),
            sendSlideStatement: vi.fn().mockResolvedValue(undefined)
        };

        xapiStatementService._driver = null;
        xapiStatementService._isInitialized = false;
        xapiStatementService._subscriptions = [];
        xapiStatementService._currentSlideId = null;
        xapiStatementService._slideEntryTime = null;
    });

    describe('_handleObjectiveScoreUpdated', () => {
        it('FIXED: sends undefined score when score is undefined', async () => {
            xapiStatementService._driver = mockDriver;
            xapiStatementService._isInitialized = true;

            await xapiStatementService._handleObjectiveScoreUpdated({
                id: 'obj1',
                score: undefined
            });

            const sentScore = mockDriver.sendObjectiveStatement.mock.calls[0]?.[0]?.score;
            expect(sentScore).toBeUndefined();
        });

        it('FIXED: sends undefined score when score is null', async () => {
            xapiStatementService._driver = mockDriver;
            xapiStatementService._isInitialized = true;

            await xapiStatementService._handleObjectiveScoreUpdated({
                id: 'obj1',
                score: null
            });

            const sentScore = mockDriver.sendObjectiveStatement.mock.calls[0]?.[0]?.score;
            expect(sentScore).toBeUndefined();
        });

        it('sends valid scaled score for numeric input', async () => {
            xapiStatementService._driver = mockDriver;
            xapiStatementService._isInitialized = true;

            await xapiStatementService._handleObjectiveScoreUpdated({
                id: 'obj1',
                score: 85
            });

            const sentScore = mockDriver.sendObjectiveStatement.mock.calls[0]?.[0]?.score;
            expect(sentScore).toBe(0.85);
        });
    });

    describe('_handleAssessmentSubmitted', () => {
        it('FIXED: omits duration for malformed timeSpent', async () => {
            xapiStatementService._driver = mockDriver;
            xapiStatementService._isInitialized = true;

            await xapiStatementService._handleAssessmentSubmitted({
                assessmentId: 'assess1',
                results: {
                    timeSpent: 'abc:def',
                    passed: true,
                    scorePercentage: 90
                }
            });

            const sentDuration = mockDriver.sendAssessmentStatement.mock.calls[0]?.[0]?.duration;
            expect(sentDuration).toBeUndefined();
        });

        it('parses valid HH:MM:SS timeSpent correctly', async () => {
            xapiStatementService._driver = mockDriver;
            xapiStatementService._isInitialized = true;

            await xapiStatementService._handleAssessmentSubmitted({
                assessmentId: 'assess1',
                results: {
                    timeSpent: '01:30:45',
                    passed: true,
                    scorePercentage: 85
                }
            });

            const sentDuration = mockDriver.sendAssessmentStatement.mock.calls[0]?.[0]?.duration;
            expect(sentDuration).toBe('PT1H30M45S');
        });
    });

    describe('_calculateDuration', () => {
        it('returns PT0S for future startTime (safe fallback)', () => {
            const futureTime = Date.now() + 60000;
            const duration = xapiStatementService._calculateDuration(futureTime);
            expect(duration).toBe('PT0S');
        });
    });
});
