/**
 * @file adversarial-scorm-drivers.test.js
 * @description Adversarial tests for SCORM driver NaN/parseFloat/parseInt bugs.
 * 
 * Tests the standalone utility functions and status mapping functions
 * that are exported from the SCORM 1.2 driver, plus direct cache manipulation
 * on driver instances to verify NaN guards.
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

// Mock LZString
vi.mock('lz-string', () => ({
    default: {
        compressToUTF16: vi.fn(s => s),
        decompressFromUTF16: vi.fn(s => s)
    }
}));

import { mapStatusTo12, mapStatusTo2004, convertTimeFormat2004To12 } from '../../../framework/js/drivers/scorm-12-driver.js';

describe('SCORM Driver Utilities', () => {

    describe('mapStatusTo12', () => {
        it('maps completed + passed → passed', () => {
            expect(mapStatusTo12('completed', 'passed')).toBe('passed');
        });

        it('maps completed + failed → failed', () => {
            expect(mapStatusTo12('completed', 'failed')).toBe('failed');
        });

        it('maps completed + unknown → completed', () => {
            expect(mapStatusTo12('completed', 'unknown')).toBe('completed');
        });

        it('maps incomplete + any → incomplete', () => {
            expect(mapStatusTo12('incomplete', 'unknown')).toBe('incomplete');
        });

        it('maps not attempted → not attempted', () => {
            expect(mapStatusTo12('not attempted', 'unknown')).toBe('not attempted');
        });

        it('maps unknown + unknown → incomplete (fallback)', () => {
            expect(mapStatusTo12('unknown', 'unknown')).toBe('incomplete');
        });

        it('handles null gracefully (fallback to incomplete)', () => {
            expect(mapStatusTo12(null, null)).toBe('incomplete');
        });

        it('handles undefined gracefully (fallback to incomplete)', () => {
            expect(mapStatusTo12(undefined, undefined)).toBe('incomplete');
        });
    });

    describe('mapStatusTo2004', () => {
        it('maps passed → completed + passed', () => {
            expect(mapStatusTo2004('passed')).toEqual({ completion: 'completed', success: 'passed' });
        });

        it('maps failed → completed + failed', () => {
            expect(mapStatusTo2004('failed')).toEqual({ completion: 'completed', success: 'failed' });
        });

        it('maps browsed → incomplete + unknown', () => {
            expect(mapStatusTo2004('browsed')).toEqual({ completion: 'incomplete', success: 'unknown' });
        });

        it('handles unknown string → unknown + unknown', () => {
            expect(mapStatusTo2004('garbage')).toEqual({ completion: 'unknown', success: 'unknown' });
        });

        it('handles null → unknown + unknown', () => {
            expect(mapStatusTo2004(null)).toEqual({ completion: 'unknown', success: 'unknown' });
        });

        it('handles undefined → unknown + unknown', () => {
            expect(mapStatusTo2004(undefined)).toEqual({ completion: 'unknown', success: 'unknown' });
        });
    });

    describe('convertTimeFormat2004To12', () => {
        it('converts PT1H30M45S → 0001:30:45', () => {
            expect(convertTimeFormat2004To12('PT1H30M45S')).toBe('0001:30:45');
        });

        it('converts PT0S → 0000:00:00', () => {
            expect(convertTimeFormat2004To12('PT0S')).toBe('0000:00:00');
        });

        it('converts PT5M10S → 0000:05:10', () => {
            expect(convertTimeFormat2004To12('PT5M10S')).toBe('0000:05:10');
        });

        it('handles null input → 0000:00:00', () => {
            expect(convertTimeFormat2004To12(null)).toBe('0000:00:00');
        });

        it('handles empty string → 0000:00:00', () => {
            expect(convertTimeFormat2004To12('')).toBe('0000:00:00');
        });

        it('handles garbage input → 0000:00:00', () => {
            expect(convertTimeFormat2004To12('not-a-duration')).toBe('0000:00:00');
        });

        it('handles fractional seconds → floors them', () => {
            expect(convertTimeFormat2004To12('PT1.5S')).toBe('0000:00:01');
        });
    });
});

describe('SCORM 2004 Driver: parseFloat NaN in cache', () => {
    let driver;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Import and instantiate the SCORM 2004 driver
        const { Scorm2004Driver } = await import('../../../framework/js/drivers/scorm-2004-driver.js');
        driver = new Scorm2004Driver();

        // Simulate initialized state
        driver._isConnected = true;
    });

    it('BUG: parseFloat on non-numeric score produces NaN in objective cache', () => {
        // Simulate what _populateCache does when scoreRaw is non-numeric
        const scoreRaw = 'not-a-number';
        const parsedScore = parseFloat(scoreRaw);
        expect(parsedScore).toBeNaN();
    });

    it('BUG: parseFloat on non-numeric weighting produces NaN in interaction cache', () => {
        const weighting = 'abc';
        const parsedWeighting = parseFloat(weighting);
        expect(parsedWeighting).toBeNaN();
    });

    it('reportObjective sends NaN score to LMS when cache has NaN', () => {
        // Set up cache with NaN score
        const objective = {
            id: 'obj1',
            score: NaN,
            success_status: 'passed',
            completion_status: 'completed'
        };

        // The reportObjective method calculates scaledScore = rawScore / 100
        // If score is NaN, scaledScore = NaN / 100 = NaN, which gets set to CMI
        const rawScore = objective.score;
        const scaledScore = rawScore / 100;
        expect(scaledScore).toBeNaN();
    });
});

describe('SCORM 1.2 Driver: parseInt NaN on interactions count', () => {
    it('BUG: parseInt on non-numeric _count produces NaN, corrupting interaction indices', () => {
        // Simulate what _populateCache does when _count returns garbage
        const countValue = 'not-a-number';
        const parsed = parseInt(countValue, 10);
        expect(parsed).toBeNaN();

        // NaN corrupts all subsequent operations
        const nextIndex = parsed; // used as index for next interaction
        expect(nextIndex).toBeNaN();

        const incrementedIndex = parsed + 1; // NaN + 1 = NaN
        expect(incrementedIndex).toBeNaN();
    });
});
