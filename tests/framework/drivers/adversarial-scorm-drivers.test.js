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
        decompressFromUTF16: vi.fn(s => s),
        compressToEncodedURIComponent: vi.fn(s => s),
        decompressFromEncodedURIComponent: vi.fn(s => s)
    }
}));

import {
    Scorm12Driver,
    mapStatusTo12,
    mapStatusTo2004,
    mapObjectiveStatusTo12,
    convertTimeFormat2004To12,
    createScorm12DietState,
    expandScorm12DietState
} from '../../../framework/js/drivers/scorm-12-driver.js';
import { Scorm2004Driver } from '../../../framework/js/drivers/scorm-2004-driver.js';
import { serializeInteractionForScorm12 } from '../../../framework/js/validation/scorm-validators.js';

describe('SCORM Driver Utilities', () => {

    it('serializes SCORM 2004 interaction syntax into strict SCORM 1.2 vocabulary', () => {
        expect(serializeInteractionForScorm12({
            id: 'q-é',
            type: 'matching',
            learner_response: 'a[.]b[,]c[.]d',
            correct_responses: ['a[.]b[,]c[.]d'],
            result: 'incorrect'
        })).toMatchObject({
            id: 'q-\\u00e9',
            type: 'matching',
            learner_response: 'a.b,c.d',
            correct_responses: ['a.b,c.d'],
            result: 'wrong'
        });

        expect(serializeInteractionForScorm12({
            id: 'tf', type: 'true-false', learner_response: 'true', result: 'correct'
        }).learner_response).toBe('t');
    });

    it('maps objective success even when completion is not separately supplied', () => {
        expect(mapObjectiveStatusTo12(undefined, 'passed')).toBe('passed');
        expect(mapObjectiveStatusTo12(undefined, 'failed')).toBe('failed');
    });

    it('round-trips all SCORM 1.2 progress domains without diet-mode loss', () => {
        const state = {
            _meta: { schemaVersion: 1, courseVersion: '2.0.0' },
            objectives: { obj1: { completion_status: 'completed' } },
            engagement: { slide1: { complete: false, tracked: { tabs: ['a'] } } },
            interactionResponses: { slide1: { q1: 'answer' }, slide2: { q2: 'answer' } },
            assessment_exam: { summary: { attempts: 2 }, session: { responses: { 0: 'a' } } },
            extensionDomain: { preserved: true }
        };

        expect(expandScorm12DietState(createScorm12DietState(state, 'slide1'))).toEqual(state);
    });

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

describe('SCORM 2004 Driver: malformed LMS numeric values', () => {
    it('falls back when optional score fields are malformed', () => {
        const driver = new Scorm2004Driver();
        const values = {
            'cmi.score.scaled': '0.75',
            'cmi.score.raw': '75garbage',
            'cmi.score.min': 'invalid',
            'cmi.score.max': 'invalid'
        };
        driver._getValueOptional = vi.fn(key => values[key] ?? null);

        expect(driver.getScore()).toEqual({ scaled: 0.75, raw: 75, min: 0, max: 100 });
    });

    it('ignores malformed objective scores and interaction weights during hydration', () => {
        const driver = new Scorm2004Driver();
        const values = {
            'cmi.entry': 'resume',
            'cmi.objectives._count': '1',
            'cmi.objectives.0.id': 'objective-1',
            'cmi.objectives.0.score.raw': 'not-a-number',
            'cmi.interactions._count': '1',
            'cmi.interactions.0.id': 'interaction-1',
            'cmi.interactions.0.type': 'choice',
            'cmi.interactions.0.weighting': 'not-a-number'
        };
        driver._getValue = vi.fn(key => values[key] ?? '');
        driver._getValueOptional = vi.fn(key => values[key] ?? null);

        driver._populateCache();

        expect(driver._cmiCache.objectives['objective-1'].score).toBeNull();
        expect(driver._cmiCache.interactions[0]).not.toHaveProperty('weighting');
    });

    it('never overwrites an LMS objective when one existing ID cannot be hydrated', () => {
        const driver = new Scorm2004Driver();
        const values = {
            'cmi.entry': 'resume',
            'cmi.objectives._count': '2',
            'cmi.objectives.0.id': 'objective-1',
            'cmi.objectives.1.id': '',
            'cmi.interactions._count': '0'
        };
        driver._getValue = vi.fn(key => values[key] ?? '');
        driver._getValueOptional = vi.fn(key => values[key] ?? null);
        driver._setValue = vi.fn();
        driver._populateCache();

        driver.reportObjective({ id: 'objective-new', completion_status: 'completed' });

        expect(driver._setValue).toHaveBeenCalledWith('cmi.objectives.2.id', 'objective-new');
        expect(driver._setValue).not.toHaveBeenCalledWith('cmi.objectives.1.id', 'objective-new');
    });

    it.each(['not-a-number', '-1', '1.5', '2garbage'])(
        'normalizes invalid interaction count %s to zero',
        (count) => {
            const driver = new Scorm2004Driver();
            const values = {
                'cmi.entry': 'resume',
                'cmi.objectives._count': '0',
                'cmi.interactions._count': count
            };
            driver._getValue = vi.fn(key => values[key] ?? '');
            driver._getValueOptional = vi.fn(key => values[key] ?? null);

            driver._populateCache();

            expect(driver._cmiCache.interactionsCount).toBe(0);
        }
    );
});

describe('SCORM 1.2 Driver: malformed LMS numeric values', () => {
    it('falls back when optional score bounds are malformed', () => {
        const driver = new Scorm12Driver();
        const values = {
            'cmi.core.score.raw': '80',
            'cmi.core.score.min': 'invalid',
            'cmi.core.score.max': '100garbage'
        };
        driver._scorm = { get: vi.fn(key => values[key] ?? '') };

        expect(driver.getScore()).toEqual({ scaled: 0.8, raw: 80, min: 0, max: 100 });
    });

    it.each(['not-a-number', '-1', '1.5', '2garbage'])(
        'normalizes invalid interaction count %s to zero',
        (count) => {
            const driver = new Scorm12Driver();
            const values = { 'cmi.interactions._count': count };
            driver._scorm = { get: vi.fn(key => values[key] ?? '') };

            driver._populateCache();

            expect(driver._cache.interactionsCount).toBe(0);
        }
    );

    it('reuses objective indices hydrated from the LMS and writes unscored status', () => {
        const values = {
            'cmi._children': 'core,objectives,interactions',
            'cmi.core.score._children': 'raw,min,max',
            'cmi.objectives._count': '1',
            'cmi.objectives.0.id': 'objective-1'
        };
        const driver = new Scorm12Driver();
        driver._scorm = {
            get: vi.fn(key => values[key] ?? ''),
            set: vi.fn(() => true)
        };
        driver._populateCache();

        driver.reportObjective({
            id: 'objective-1',
            completion_status: 'completed',
            success_status: 'passed'
        });

        expect(driver._scorm.set).toHaveBeenCalledWith('cmi.objectives.0.status', 'passed');
        expect(driver._scorm.set).not.toHaveBeenCalledWith('cmi.objectives.1.id', expect.anything());
    });

    it('converts SCORM 2004 interaction timing fields to SCORM 1.2 formats', () => {
        const driver = new Scorm12Driver();
        driver._scorm = { set: vi.fn(() => true) };
        driver._supportsInteractions = true;

        driver.reportInteraction({
            id: 'q1',
            type: 'choice',
            timestamp: '2026-07-12T12:34:56Z',
            latency: 'PT2M3S'
        });

        expect(driver._scorm.set).toHaveBeenCalledWith('cmi.interactions.0.time', '12:34:56');
        expect(driver._scorm.set).toHaveBeenCalledWith('cmi.interactions.0.latency', '0000:02:03');
    });

    it('refuses suspend data that cannot fit the SCORM 1.2 limit', () => {
        const driver = new Scorm12Driver();
        driver._scorm = { set: vi.fn(() => true) };

        expect(() => driver.setSuspendData({ flags: { huge: 'x'.repeat(5000) } }))
            .toThrow(/4096-character limit/);
        expect(driver._scorm.set).not.toHaveBeenCalled();
    });

    it('fails closed when the LMS rejects the suspend_data read', () => {
        const driver = new Scorm12Driver();
        driver._scorm = {
            get: vi.fn(() => ''),
            debug: {
                getCode: vi.fn(() => 101),
                getInfo: vi.fn(() => 'General exception')
            }
        };

        expect(() => driver.getSuspendData()).toThrow(/General exception/);
    });
});
