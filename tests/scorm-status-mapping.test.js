import { describe, it, expect } from 'vitest';
import {
    mapStatusTo12,
    mapStatusTo2004
} from '../framework/js/drivers/scorm-12-driver.js';

describe('SCORM Status Mapping: 2004 → 1.2', () => {
    it('completed + passed → "passed"', () => {
        expect(mapStatusTo12('completed', 'passed')).toBe('passed');
    });

    it('completed + failed → "failed"', () => {
        expect(mapStatusTo12('completed', 'failed')).toBe('failed');
    });

    it('completed + unknown → "completed"', () => {
        expect(mapStatusTo12('completed', 'unknown')).toBe('completed');
    });

    it('incomplete + any → "incomplete"', () => {
        expect(mapStatusTo12('incomplete', 'unknown')).toBe('incomplete');
        expect(mapStatusTo12('incomplete', 'passed')).toBe('incomplete');
    });

    it('not attempted + any → "not attempted"', () => {
        expect(mapStatusTo12('not attempted', 'unknown')).toBe('not attempted');
    });

    it('unknown + any → "incomplete" (default)', () => {
        expect(mapStatusTo12('unknown', 'unknown')).toBe('incomplete');
    });
});

describe('SCORM Status Mapping: 1.2 → 2004', () => {
    it('"passed" → { completed, passed }', () => {
        expect(mapStatusTo2004('passed')).toEqual({ completion: 'completed', success: 'passed' });
    });

    it('"failed" → { completed, failed }', () => {
        expect(mapStatusTo2004('failed')).toEqual({ completion: 'completed', success: 'failed' });
    });

    it('"completed" → { completed, unknown }', () => {
        expect(mapStatusTo2004('completed')).toEqual({ completion: 'completed', success: 'unknown' });
    });

    it('"incomplete" → { incomplete, unknown }', () => {
        expect(mapStatusTo2004('incomplete')).toEqual({ completion: 'incomplete', success: 'unknown' });
    });

    it('"not attempted" → { not attempted, unknown }', () => {
        expect(mapStatusTo2004('not attempted')).toEqual({ completion: 'not attempted', success: 'unknown' });
    });

    it('"browsed" → { incomplete, unknown }', () => {
        expect(mapStatusTo2004('browsed')).toEqual({ completion: 'incomplete', success: 'unknown' });
    });

    it('unknown string → { unknown, unknown }', () => {
        expect(mapStatusTo2004('garbage')).toEqual({ completion: 'unknown', success: 'unknown' });
    });
});

describe('Status Mapping Roundtrip', () => {
    const roundtrip = (completion, success) => {
        const lesson12 = mapStatusTo12(completion, success);
        return mapStatusTo2004(lesson12);
    };

    it('completed + passed roundtrips', () => {
        const result = roundtrip('completed', 'passed');
        expect(result.completion).toBe('completed');
        expect(result.success).toBe('passed');
    });

    it('completed + failed roundtrips', () => {
        const result = roundtrip('completed', 'failed');
        expect(result.completion).toBe('completed');
        expect(result.success).toBe('failed');
    });

    it('incomplete + unknown roundtrips', () => {
        const result = roundtrip('incomplete', 'unknown');
        expect(result.completion).toBe('incomplete');
    });
});
