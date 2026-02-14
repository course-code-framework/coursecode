/**
 * @file lms-error-utils.js
 * @description Shared LMS error classification helpers for diagnostics.
 */

/**
 * Classifies LMS operation errors into stable buckets for telemetry/UI handling.
 * @param {unknown} error
 * @returns {'timeout'|'network'|'scorm-api'|'validation'|'session'|'unknown'}
 */
export function classifyLmsError(error) {
    const message = String(error?.message || error || '').toLowerCase();

    if (message.includes('timed out') || message.includes('timeout')) {
        return 'timeout';
    }

    if (
        message.includes('network') ||
        message.includes('fetch') ||
        message.includes('failed to fetch') ||
        message.includes('socket') ||
        message.includes('connection')
    ) {
        return 'network';
    }

    if (
        message.includes('scorm') ||
        message.includes('lmssetvalue') ||
        message.includes('lmsgetvalue') ||
        message.includes('commit') ||
        message.includes('terminate')
    ) {
        return 'scorm-api';
    }

    if (
        message.includes('invalid') ||
        message.includes('must be') ||
        message.includes('required') ||
        message.includes('out of range')
    ) {
        return 'validation';
    }

    if (
        message.includes('session') ||
        message.includes('already terminated') ||
        message.includes('not initialized') ||
        message.includes('expired')
    ) {
        return 'session';
    }

    return 'unknown';
}

