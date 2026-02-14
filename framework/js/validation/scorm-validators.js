/**
 * @file scorm-validators.js
 * @description SCORM 2004 4th Edition data format constants and validation utilities.
 * Ensures data conforms to SCORM 2004 specifications.
 */

/**
 * SCORM 2004 4th Edition valid interaction types.
 * @constant {string[]}
 */
export const SCORM_INTERACTION_TYPES = [
    'true-false',
    'choice',
    'fill-in',
    'long-fill-in',
    'matching',
    'performance',
    'sequencing',
    'likert',
    'numeric',
    'other'
];

/**
 * SCORM 2004 4th Edition valid interaction result values.
 * @constant {string[]}
 */
export const SCORM_INTERACTION_RESULTS = [
    'correct',
    'incorrect',
    'unanticipated',
    'neutral'
];

// ============================================================================
// SCORM 2004 Learner Response Formatting
// ============================================================================

/**
 * Formats a learner response for SCORM 2004 cmi.interactions.n.learner_response.
 * SCORM 2004 requires specific string formats for each interaction type.
 * 
 * Format requirements by type:
 * - true-false: "true" or "false" (literal strings)
 * - choice: "a[,]b[,]c" (short identifiers separated by [,])
 * - matching: "source1[.]target1[,]source2[.]target2" (pairs with [.] separator)
 * - sequencing: "item1[,]item2[,]item3" (ordered items separated by [,])
 * - fill-in: plain text string
 * - numeric: numeric string
 * - likert: single character or short identifier
 * - other: any string representation
 * 
 * @param {string} interactionType - The SCORM interaction type
 * @param {*} response - The internal response format (varies by type)
 * @returns {string} SCORM 2004 compliant learner_response string
 * @example
 * formatLearnerResponseForScorm('true-false', true) // "true"
 * formatLearnerResponseForScorm('matching', {pair1: 'match1', pair2: 'match2'}) // "pair1[.]match1[,]pair2[.]match2"
 * formatLearnerResponseForScorm('sequencing', ['a', 'b', 'c']) // "a[,]b[,]c"
 * formatLearnerResponseForScorm('choice', ['a', 'b']) // "a[,]b"
 */
export function formatLearnerResponseForScorm(interactionType, response) {
    // Handle null/undefined
    if (response === null || response === undefined) {
        return '';
    }

    switch (interactionType) {
        case 'true-false':
            // Must be literal "true" or "false" string
            if (typeof response === 'boolean') {
                return response ? 'true' : 'false';
            }
            if (typeof response === 'string') {
                const normalized = response.toLowerCase().trim();
                if (normalized === 'true' || normalized === 'false') {
                    return normalized;
                }
            }
            // Invalid response for true-false - return empty (will fail validation, but that's correct)
            return '';

        case 'choice':
            // Format: identifier[,]identifier[,]identifier
            if (Array.isArray(response)) {
                return response.join('[,]');
            }
            if (typeof response === 'string') {
                // Already a string, might be single choice or already formatted
                return response;
            }
            return '';

        case 'matching':
            // Format: source[.]target[,]source[.]target
            if (typeof response === 'object' && response !== null && !Array.isArray(response)) {
                const pairs = Object.entries(response)
                    .filter(([_key, value]) => value !== null && value !== undefined && String(value).trim() !== '')
                    .map(([source, target]) => `${source}[.]${target}`);
                return pairs.join('[,]');
            }
            if (typeof response === 'string') {
                // Try to parse as JSON and format
                try {
                    const parsed = JSON.parse(response);
                    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                        const pairs = Object.entries(parsed)
                            .filter(([_key, value]) => value !== null && value !== undefined && String(value).trim() !== '')
                            .map(([source, target]) => `${source}[.]${target}`);
                        return pairs.join('[,]');
                    }
                } catch {
                    // Not JSON, return as-is
                    return response;
                }
            }
            return '';

        case 'sequencing':
            // Format: item[,]item[,]item
            if (Array.isArray(response)) {
                return response.join('[,]');
            }
            if (typeof response === 'string') {
                // Try to parse as JSON array
                try {
                    const parsed = JSON.parse(response);
                    if (Array.isArray(parsed)) {
                        return parsed.join('[,]');
                    }
                } catch {
                    // Not JSON, return as-is
                    return response;
                }
            }
            return '';

        case 'fill-in':
        case 'long-fill-in':
            // Plain text string
            if (typeof response === 'object') {
                // fill-in might return {blankId: answer} - join values
                const values = Object.values(response).filter(v => v !== null && v !== undefined);
                return values.join('[,]');
            }
            return String(response);

        case 'numeric':
            // Numeric string or range object
            // SCORM 2004 correct_responses format: "value" or "min[:max]"
            if (typeof response === 'number') {
                return String(response);
            }
            if (typeof response === 'object' && response !== null) {
                // Handle correctRange object: {exact, min, max}
                // Try to parse if it's a JSON string representation
                let rangeObj = response;
                if (typeof response === 'string') {
                    try {
                        rangeObj = JSON.parse(response);
                    } catch {
                        return response; // Return as-is if not parseable
                    }
                }
                
                if (rangeObj.exact !== undefined) {
                    return String(rangeObj.exact);
                }
                if (rangeObj.min !== undefined && rangeObj.max !== undefined) {
                    return `${rangeObj.min}[:${rangeObj.max}]`;
                }
                if (rangeObj.min !== undefined) {
                    return String(rangeObj.min);
                }
                if (rangeObj.max !== undefined) {
                    return String(rangeObj.max);
                }
            }
            if (typeof response === 'string') {
                // Try to parse as JSON for correctRange
                try {
                    const parsed = JSON.parse(response);
                    if (typeof parsed === 'object' && parsed !== null) {
                        if (parsed.exact !== undefined) {
                            return String(parsed.exact);
                        }
                        if (parsed.min !== undefined && parsed.max !== undefined) {
                            return `${parsed.min}[:${parsed.max}]`;
                        }
                        if (parsed.min !== undefined) {
                            return String(parsed.min);
                        }
                        if (parsed.max !== undefined) {
                            return String(parsed.max);
                        }
                    }
                } catch {
                    // Not JSON, return as-is
                    return response;
                }
            }
            return String(response);

        case 'likert':
            // Single identifier or value
            if (typeof response === 'object' && response !== null) {
                // Likert might return {questionId: value} - use first value
                const values = Object.values(response);
                return values.length > 0 ? String(values[0]) : '';
            }
            return String(response);

        case 'performance':
        case 'other':
        default:
            // For other/performance types, convert to string representation
            if (typeof response === 'object') {
                try {
                    // If it's an empty object, return empty string
                    if (Object.keys(response).length === 0) {
                        return '';
                    }
                    return JSON.stringify(response);
                } catch {
                    return '';
                }
            }
            return String(response);
    }
}

/**
 * SCORM 2004 4th Edition valid completion status values.
 * @constant {string[]}
 */
export const SCORM_COMPLETION_STATUS = [
    'completed',
    'incomplete',
    'not attempted',
    'unknown'
];

/**
 * SCORM 2004 4th Edition valid success status values.
 * @constant {string[]}
 */
export const SCORM_SUCCESS_STATUS = [
    'passed',
    'failed',
    'unknown'
];

/**
 * Generates a SCORM 2004 4th Edition compliant timestamp for the current time.
 * SCORM 2004 requires: YYYY-MM-DDTHH:MM:SS (no milliseconds, no Z suffix)
 * 
 * @returns {string} SCORM 2004 compliant timestamp (e.g., "2025-01-15T10:30:00")
 * @example
 * generateScormTimestamp() // "2025-01-15T10:30:00"
 */
export function generateScormTimestamp() {
    const date = new Date();
    
    // Format: YYYY-MM-DDTHH:MM:SS (UTC, no milliseconds, no Z suffix)
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Validates if a string is a valid ISO 8601 timestamp.
 * @param {string} timestamp - The timestamp to validate
 * @returns {boolean} True if valid ISO 8601 timestamp
 */
export function isValidISO8601Timestamp(timestamp) {
    if (typeof timestamp !== 'string') {
        return false;
    }

    try {
        const date = new Date(timestamp);
        // Check if it's a valid date and can be converted back to ISO format
        return date.toISOString() === timestamp || !isNaN(date.getTime());
    } catch {
        return false;
    }
}

/**
 * Validates if a string is a valid ISO 8601 duration format.
 * Format: P[nY][nM][nD][T[nH][nM][nS]]
 * @param {string} duration - The duration to validate
 * @returns {boolean} True if valid ISO 8601 duration
 */
export function isValidISO8601Duration(duration) {
    if (typeof duration !== 'string') {
        return false;
    }

    // ISO 8601 duration pattern: P[nY][nM][nD][T[nH][nM][nS]]
    // Each component is optional, but at least one must be present
    const durationPattern = /^P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/;

    // Must match pattern and not be just 'P' or 'PT' (empty duration)
    return durationPattern.test(duration) && duration !== 'P' && duration !== 'PT';
}

/**
 * Validates if a value is in an allowed list of values.
 * @param {*} value - The value to validate
 * @param {Array} allowedValues - Array of allowed values
 * @param {string} [fieldName='value'] - Name of the field for error messaging
 * @returns {{valid: boolean, error: string|null}} Validation result
 */
export function validateEnum(value, allowedValues, fieldName = 'value') {
    if (!allowedValues.includes(value)) {
        return {
            valid: false,
            error: `Invalid ${fieldName} "${value}". Must be one of: ${allowedValues.join(', ')}`
        };
    }
    return { valid: true, error: null };
}

/**
 * Validates if a value is a valid number.
 * @param {*} value - The value to validate
 * @param {string} [fieldName='value'] - Name of the field for error messaging
 * @returns {{valid: boolean, error: string|null}} Validation result
 */
export function validateNumeric(value, fieldName = 'value') {
    const num = Number(value);
    if (isNaN(num)) {
        return {
            valid: false,
            error: `Invalid ${fieldName} "${value}". Must be a number`
        };
    }
    return { valid: true, error: null };
}

/**
 * Validates if a value is an array.
 * @param {*} value - The value to validate
 * @param {string} [fieldName='value'] - Name of the field for error messaging
 * @returns {{valid: boolean, error: string|null}} Validation result
 */
export function validateArray(value, fieldName = 'value') {
    if (!Array.isArray(value)) {
        return {
            valid: false,
            error: `Field "${fieldName}" must be an array`
        };
    }
    return { valid: true, error: null };
}

/**
 * Validates if an array contains only string values.
 * @param {Array} arr - The array to validate
 * @param {string} [fieldName='value'] - Name of the field for error messaging
 * @returns {{valid: boolean, error: string|null}} Validation result
 */
export function validateStringArray(arr, fieldName = 'value') {
    if (!Array.isArray(arr)) {
        return {
            valid: false,
            error: `Field "${fieldName}" must be an array`
        };
    }

    if (arr.some(item => typeof item !== 'string')) {
        return {
            valid: false,
            error: `Field "${fieldName}" must contain only string values`
        };
    }

    return { valid: true, error: null };
}

/**
 * Validates required fields are present in an object.
 * @param {Object} data - The data object to validate
 * @param {string[]} requiredFields - Array of required field names
 * @returns {{valid: boolean, errors: string[]}} Validation result with array of missing fields
 */
export function validateRequiredFields(data, requiredFields) {
    const errors = [];

    for (const field of requiredFields) {
        if (data[field] === undefined || data[field] === null || data[field] === '') {
            errors.push(`Missing required field "${field}"`);
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Creates a detailed validation error message from multiple errors.
 * @param {string[]} errors - Array of error messages
 * @param {string} [context=''] - Optional context (e.g., record ID)
 * @param {string} [prefix='Validation failed'] - Error message prefix
 * @returns {string} Formatted error message
 */
export function formatValidationError(errors, context = '', prefix = 'Validation failed') {
    const contextStr = context ? ` for ${context}` : '';
    return `${prefix}${contextStr}:\n  - ${errors.join('\n  - ')}`;
}

/** Convenience function to validate SCORM interaction type. */
export function validateInteractionType(type) {
    return validateEnum(type, SCORM_INTERACTION_TYPES, 'type');
}

/** Convenience function to validate SCORM interaction result. */
export function validateInteractionResult(result) {
    return validateEnum(result, SCORM_INTERACTION_RESULTS, 'result');
}

/** Convenience function to validate SCORM completion status. */
export function validateCompletionStatus(status) {
    return validateEnum(status, SCORM_COMPLETION_STATUS, 'completion_status');
}

/** Convenience function to validate SCORM success status. */
export function validateSuccessStatus(status) {
    return validateEnum(status, SCORM_SUCCESS_STATUS, 'success_status');
}
