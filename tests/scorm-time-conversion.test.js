import { describe, it, expect } from 'vitest';
import {
    convertTimeFormat2004To12
} from '../framework/js/drivers/scorm-12-driver.js';

describe('Time Conversion: SCORM 2004 (ISO 8601) → SCORM 1.2 (HHHH:MM:SS)', () => {
    it('PT1H30M45S → 0001:30:45', () => {
        expect(convertTimeFormat2004To12('PT1H30M45S')).toBe('0001:30:45');
    });

    it('PT0S → 0000:00:00', () => {
        expect(convertTimeFormat2004To12('PT0S')).toBe('0000:00:00');
    });

    it('PT45S → 0000:00:45 (seconds only)', () => {
        expect(convertTimeFormat2004To12('PT45S')).toBe('0000:00:45');
    });

    it('PT2H → 0002:00:00 (hours only)', () => {
        expect(convertTimeFormat2004To12('PT2H')).toBe('0002:00:00');
    });

    it('PT30M → 0000:30:00 (minutes only)', () => {
        expect(convertTimeFormat2004To12('PT30M')).toBe('0000:30:00');
    });

    it('PT10H5M3S → 0010:05:03 (properly padded)', () => {
        expect(convertTimeFormat2004To12('PT10H5M3S')).toBe('0010:05:03');
    });

    it('null → 0000:00:00', () => {
        expect(convertTimeFormat2004To12(null)).toBe('0000:00:00');
    });

    it('empty string → 0000:00:00', () => {
        expect(convertTimeFormat2004To12('')).toBe('0000:00:00');
    });

    it('PT1.5S → 0000:00:01 (fractional seconds truncated)', () => {
        expect(convertTimeFormat2004To12('PT1.5S')).toBe('0000:00:01');
    });
});
