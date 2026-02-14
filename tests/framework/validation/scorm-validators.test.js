import { describe, it, expect } from 'vitest';
import {
    formatLearnerResponseForScorm,
    generateScormTimestamp,
    isValidISO8601Timestamp,
    isValidISO8601Duration,
    validateEnum,
    validateNumeric,
    validateArray,
    validateStringArray,
    validateRequiredFields,
    formatValidationError,
    validateInteractionType,
    validateInteractionResult,
    validateCompletionStatus,
    validateSuccessStatus,
    SCORM_INTERACTION_TYPES,
    SCORM_INTERACTION_RESULTS,
    SCORM_COMPLETION_STATUS,
    SCORM_SUCCESS_STATUS
} from '../../../framework/js/validation/scorm-validators.js';

// ─── SCORM 2004 Learner Response Formatting ─────────────────────────
// These tests verify compliance with SCORM 2004 4th Edition RTE spec
// Section 4.2.9 (cmi.interactions.n.learner_response)

describe('formatLearnerResponseForScorm', () => {
    describe('true-false', () => {
        it('formats boolean true → "true"', () => {
            expect(formatLearnerResponseForScorm('true-false', true)).toBe('true');
        });

        it('formats boolean false → "false"', () => {
            expect(formatLearnerResponseForScorm('true-false', false)).toBe('false');
        });

        it('normalizes string "TRUE" → "true"', () => {
            expect(formatLearnerResponseForScorm('true-false', 'TRUE')).toBe('true');
        });

        it('normalizes string "False" → "false"', () => {
            expect(formatLearnerResponseForScorm('true-false', 'False')).toBe('false');
        });

        it('returns empty for invalid true-false value', () => {
            expect(formatLearnerResponseForScorm('true-false', 'yes')).toBe('');
        });
    });

    describe('choice', () => {
        it('formats single choice array', () => {
            expect(formatLearnerResponseForScorm('choice', ['a'])).toBe('a');
        });

        it('formats multi-choice array with [,] delimiter', () => {
            expect(formatLearnerResponseForScorm('choice', ['a', 'b', 'c'])).toBe('a[,]b[,]c');
        });

        it('passes through string choice', () => {
            expect(formatLearnerResponseForScorm('choice', 'a')).toBe('a');
        });

        it('returns empty for non-string non-array', () => {
            expect(formatLearnerResponseForScorm('choice', 42)).toBe('');
        });
    });

    describe('matching', () => {
        it('formats object pairs with [.] and [,] delimiters', () => {
            const response = { source1: 'target1', source2: 'target2' };
            const result = formatLearnerResponseForScorm('matching', response);
            expect(result).toBe('source1[.]target1[,]source2[.]target2');
        });

        it('filters out null/empty values from matching pairs', () => {
            const response = { source1: 'target1', source2: null, source3: '' };
            const result = formatLearnerResponseForScorm('matching', response);
            expect(result).toBe('source1[.]target1');
        });

        it('parses JSON string matching response', () => {
            const json = JSON.stringify({ a: '1', b: '2' });
            const result = formatLearnerResponseForScorm('matching', json);
            expect(result).toBe('a[.]1[,]b[.]2');
        });
    });

    describe('sequencing', () => {
        it('formats array with [,] delimiter', () => {
            expect(formatLearnerResponseForScorm('sequencing', ['step1', 'step2', 'step3'])).toBe('step1[,]step2[,]step3');
        });

        it('parses JSON array string', () => {
            const json = JSON.stringify(['a', 'b']);
            expect(formatLearnerResponseForScorm('sequencing', json)).toBe('a[,]b');
        });
    });

    describe('fill-in / long-fill-in', () => {
        it('returns string response as-is', () => {
            expect(formatLearnerResponseForScorm('fill-in', 'my answer')).toBe('my answer');
        });

        it('formats fill-in object values with [,] delimiter', () => {
            const response = { blank1: 'hello', blank2: 'world' };
            expect(formatLearnerResponseForScorm('fill-in', response)).toBe('hello[,]world');
        });

        it('converts number to string for fill-in', () => {
            expect(formatLearnerResponseForScorm('fill-in', 42)).toBe('42');
        });
    });

    describe('numeric', () => {
        it('formats number value', () => {
            expect(formatLearnerResponseForScorm('numeric', 42)).toBe('42');
        });

        it('formats exact range object', () => {
            expect(formatLearnerResponseForScorm('numeric', { exact: 3.14 })).toBe('3.14');
        });

        it('formats min:max range per SCORM spec', () => {
            expect(formatLearnerResponseForScorm('numeric', { min: 1, max: 10 })).toBe('1[:10]');
        });
    });

    describe('likert', () => {
        it('formats string value', () => {
            expect(formatLearnerResponseForScorm('likert', 'strongly_agree')).toBe('strongly_agree');
        });

        it('extracts first value from object', () => {
            expect(formatLearnerResponseForScorm('likert', { q1: 'agree' })).toBe('agree');
        });
    });

    describe('null/undefined handling', () => {
        it('returns empty string for null', () => {
            expect(formatLearnerResponseForScorm('choice', null)).toBe('');
        });

        it('returns empty string for undefined', () => {
            expect(formatLearnerResponseForScorm('choice', undefined)).toBe('');
        });
    });
});

// ─── SCORM Timestamp ────────────────────────────────────────────────

describe('generateScormTimestamp', () => {
    it('returns YYYY-MM-DDTHH:MM:SS format (no milliseconds, no Z)', () => {
        const ts = generateScormTimestamp();
        // Must match exactly: 4-2-2T2:2:2
        expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    });

    it('does not contain milliseconds', () => {
        const ts = generateScormTimestamp();
        expect(ts).not.toContain('.');
    });

    it('does not contain Z suffix', () => {
        const ts = generateScormTimestamp();
        expect(ts).not.toContain('Z');
    });
});

// ─── ISO 8601 Validators ────────────────────────────────────────────

describe('isValidISO8601Timestamp', () => {
    it('accepts valid ISO timestamp', () => {
        expect(isValidISO8601Timestamp('2025-01-15T10:30:00')).toBe(true);
    });

    it('accepts full ISO with Z', () => {
        expect(isValidISO8601Timestamp('2025-01-15T10:30:00.000Z')).toBe(true);
    });

    it('rejects non-string', () => {
        expect(isValidISO8601Timestamp(12345)).toBe(false);
    });

    it('rejects gibberish', () => {
        expect(isValidISO8601Timestamp('not-a-date')).toBe(false);
    });
});

describe('isValidISO8601Duration', () => {
    it('accepts PT1H30M', () => {
        expect(isValidISO8601Duration('PT1H30M')).toBe(true);
    });

    it('accepts PT0S', () => {
        expect(isValidISO8601Duration('PT0S')).toBe(true);
    });

    it('accepts P1DT2H', () => {
        expect(isValidISO8601Duration('P1DT2H')).toBe(true);
    });

    it('accepts fractional seconds PT1.5S', () => {
        expect(isValidISO8601Duration('PT1.5S')).toBe(true);
    });

    it('rejects bare "P" (empty duration)', () => {
        expect(isValidISO8601Duration('P')).toBe(false);
    });

    it('rejects bare "PT" (empty time)', () => {
        expect(isValidISO8601Duration('PT')).toBe(false);
    });

    it('rejects non-string', () => {
        expect(isValidISO8601Duration(42)).toBe(false);
    });

    it('rejects random string', () => {
        expect(isValidISO8601Duration('5 minutes')).toBe(false);
    });
});

// ─── SCORM Enum Validators ──────────────────────────────────────────

describe('validateEnum', () => {
    it('accepts valid value', () => {
        const result = validateEnum('passed', ['passed', 'failed']);
        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
    });

    it('rejects invalid value with descriptive error', () => {
        const result = validateEnum('maybe', ['passed', 'failed'], 'success_status');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('maybe');
        expect(result.error).toContain('success_status');
    });
});

describe('validateNumeric', () => {
    it('accepts number', () => {
        expect(validateNumeric(42).valid).toBe(true);
    });

    it('accepts numeric string', () => {
        expect(validateNumeric('3.14').valid).toBe(true);
    });

    it('rejects non-numeric string', () => {
        const result = validateNumeric('abc', 'score');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('score');
    });
});

describe('validateArray', () => {
    it('accepts array', () => {
        expect(validateArray([1, 2, 3]).valid).toBe(true);
    });

    it('rejects non-array', () => {
        expect(validateArray('not array').valid).toBe(false);
    });
});

describe('validateStringArray', () => {
    it('accepts string array', () => {
        expect(validateStringArray(['a', 'b']).valid).toBe(true);
    });

    it('rejects mixed array', () => {
        expect(validateStringArray(['a', 42]).valid).toBe(false);
    });

    it('rejects non-array', () => {
        expect(validateStringArray('string').valid).toBe(false);
    });
});

describe('validateRequiredFields', () => {
    it('passes when all fields present', () => {
        const result = validateRequiredFields({ a: 1, b: 2 }, ['a', 'b']);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('fails listing missing fields', () => {
        const result = validateRequiredFields({ a: 1 }, ['a', 'b', 'c']);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(2);
        expect(result.errors[0]).toContain('b');
        expect(result.errors[1]).toContain('c');
    });

    it('treats empty string as missing', () => {
        const result = validateRequiredFields({ a: '' }, ['a']);
        expect(result.valid).toBe(false);
    });

    it('treats null as missing', () => {
        const result = validateRequiredFields({ a: null }, ['a']);
        expect(result.valid).toBe(false);
    });
});

// ─── SCORM Convenience Validators ───────────────────────────────────

describe('SCORM convenience validators', () => {
    it('validateInteractionType accepts all standard types', () => {
        for (const type of SCORM_INTERACTION_TYPES) {
            expect(validateInteractionType(type).valid).toBe(true);
        }
    });

    it('validateInteractionType rejects invalid type', () => {
        expect(validateInteractionType('essay').valid).toBe(false);
    });

    it('validateInteractionResult accepts all standard results', () => {
        for (const result of SCORM_INTERACTION_RESULTS) {
            expect(validateInteractionResult(result).valid).toBe(true);
        }
    });

    it('validateCompletionStatus accepts all valid statuses', () => {
        for (const status of SCORM_COMPLETION_STATUS) {
            expect(validateCompletionStatus(status).valid).toBe(true);
        }
    });

    it('validateCompletionStatus rejects invalid status', () => {
        expect(validateCompletionStatus('done').valid).toBe(false);
    });

    it('validateSuccessStatus accepts all valid statuses', () => {
        for (const status of SCORM_SUCCESS_STATUS) {
            expect(validateSuccessStatus(status).valid).toBe(true);
        }
    });

    it('validateSuccessStatus rejects invalid status', () => {
        expect(validateSuccessStatus('maybe').valid).toBe(false);
    });
});

// ─── formatValidationError ──────────────────────────────────────────

describe('formatValidationError', () => {
    it('formats errors with bullet list', () => {
        const result = formatValidationError(['Error 1', 'Error 2']);
        expect(result).toContain('Validation failed');
        expect(result).toContain('- Error 1');
        expect(result).toContain('- Error 2');
    });

    it('includes context when provided', () => {
        const result = formatValidationError(['Bad'], 'interaction #3');
        expect(result).toContain('for interaction #3');
    });

    it('uses custom prefix', () => {
        const result = formatValidationError(['Oops'], '', 'Save failed');
        expect(result).toContain('Save failed');
    });
});
