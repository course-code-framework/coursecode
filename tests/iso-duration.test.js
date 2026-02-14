import { describe, it, expect } from 'vitest';
import { formatISO8601Duration } from '../framework/js/state/index.js';

describe('formatISO8601Duration', () => {
    it('formats hours, minutes, seconds', () => {
        // 1h 30m 0s = 5400000ms
        expect(formatISO8601Duration(5400000)).toBe('PT1H30M');
    });

    it('formats seconds only', () => {
        expect(formatISO8601Duration(45000)).toBe('PT45S');
    });

    it('formats zero', () => {
        expect(formatISO8601Duration(0)).toBe('PT0S');
    });

    it('formats null as PT0S', () => {
        expect(formatISO8601Duration(null)).toBe('PT0S');
    });

    it('formats negative as PT0S', () => {
        expect(formatISO8601Duration(-1)).toBe('PT0S');
    });

    it('formats undefined as PT0S', () => {
        expect(formatISO8601Duration(undefined)).toBe('PT0S');
    });

    it('formats full duration with all components', () => {
        // 2h 15m 30s = 8130000ms
        expect(formatISO8601Duration(8130000)).toBe('PT2H15M30S');
    });

    it('formats minutes and seconds (no hours)', () => {
        // 5m 10s = 310000ms
        expect(formatISO8601Duration(310000)).toBe('PT5M10S');
    });

    it('formats exactly one hour', () => {
        expect(formatISO8601Duration(3600000)).toBe('PT1H');
    });
});
