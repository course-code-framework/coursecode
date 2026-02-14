import { describe, it, expect } from 'vitest';
import { classifyLmsError } from '../../../framework/js/state/lms-error-utils.js';

describe('classifyLmsError', () => {
    it('classifies timeout errors', () => {
        expect(classifyLmsError(new Error('commit timed out after 5000ms'))).toBe('timeout');
    });

    it('classifies network errors', () => {
        expect(classifyLmsError(new Error('Failed to fetch resource'))).toBe('network');
    });

    it('classifies SCORM API errors', () => {
        expect(classifyLmsError(new Error('SCORM commit failed'))).toBe('scorm-api');
    });

    it('classifies validation errors', () => {
        expect(classifyLmsError(new Error('invalid completion status'))).toBe('validation');
    });

    it('classifies session errors', () => {
        expect(classifyLmsError(new Error('session expired'))).toBe('session');
    });

    it('falls back to unknown', () => {
        expect(classifyLmsError(new Error('something odd happened'))).toBe('unknown');
    });
});

