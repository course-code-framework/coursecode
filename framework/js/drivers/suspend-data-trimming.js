/**
 * @file suspend-data-trimming.js
 * @description Progressive suspend_data trimming shared by size-limited SCORM drivers.
 *
 * Each tier is cumulative and removes data that is either persisted natively
 * elsewhere or can safely fall back to defaults on resume, so the state that
 * resume genuinely depends on survives as long as possible. Readers need no
 * special handling: a trimmed domain is simply absent and managers start it
 * from their defaults.
 */

/** Error code attached when state cannot fit even after the last tier. */
export const SUSPEND_DATA_OVERFLOW = 'SUSPEND_DATA_OVERFLOW';

/**
 * Error code attached when stored suspend_data was read but cannot be decoded.
 * State hydration recovers from this (fresh start, LMS value preserved);
 * any other read failure still fails closed.
 */
export const SUSPEND_DATA_CORRUPT = 'SUSPEND_DATA_CORRUPT';

// Domains that resume genuinely depends on. The last tier keeps only these
// (plus assessment_* domains) so location, completion gates, objectives,
// in-progress assessments and interaction answers survive.
const RESUME_CORE_DOMAINS = new Set([
    '_meta',
    'navigation',
    'engagement',
    'objectives',
    'interactionResponses',
    'flags',
    'accessibility',
    'sessionData'
]);

function omitDomains(state, domains) {
    const trimmed = { ...state };
    for (const domain of domains) delete trimmed[domain];
    return trimmed;
}

/** Removes archived attempt_N summaries and per-question result lists (never read on resume). */
function dropAttemptHistory(state) {
    const trimmed = { ...state };
    for (const [key, value] of Object.entries(state)) {
        if (!key.startsWith('assessment_') || !value?.summary || typeof value.summary !== 'object') continue;
        const summary = {};
        for (const [summaryKey, summaryValue] of Object.entries(value.summary)) {
            if (/^attempt_\d+$/.test(summaryKey)) continue;
            summary[summaryKey] = summaryValue;
        }
        if (summary.lastResults && typeof summary.lastResults === 'object') {
            const { questionResults: _questionResults, ...lastResults } = summary.lastResults;
            summary.lastResults = lastResults;
        }
        trimmed[key] = { ...value, summary };
    }
    return trimmed;
}

/** Removes transient slide timers and media positions. */
function dropTransientTiming(state) {
    const trimmed = omitDomains(state, ['audio', 'video']);
    if (trimmed.sessionData && typeof trimmed.sessionData === 'object') {
        const { slideStartTimes: _slideStartTimes, ...sessionData } = trimmed.sessionData;
        trimmed.sessionData = sessionData;
    }
    return trimmed;
}

function keepResumeCore(state) {
    return Object.fromEntries(
        Object.entries(state).filter(([key]) =>
            RESUME_CORE_DOMAINS.has(key) || key.startsWith('assessment_')
        )
    );
}

/**
 * Cumulative trimming tiers. The append-only `interactions` history is
 * dropped first: it is already written to native cmi.interactions and nothing
 * reads it back on resume.
 */
export const SUSPEND_TRIM_TIERS = Object.freeze([
    { name: 'no-interaction-history', trim: state => omitDomains(state, ['interactions']) },
    { name: 'no-attempt-history', trim: dropAttemptHistory },
    { name: 'no-transient-timing', trim: dropTransientTiming },
    { name: 'resume-core', trim: keepResumeCore }
]);

/**
 * Applies tiers 0..tier cumulatively. Always returns a new top-level object.
 * @param {object} state
 * @param {number} tier - Index into SUSPEND_TRIM_TIERS
 * @returns {object}
 */
export function trimSuspendState(state, tier) {
    let trimmed = { ...state };
    const lastTier = Math.min(tier, SUSPEND_TRIM_TIERS.length - 1);
    for (let i = 0; i <= lastTier; i++) {
        trimmed = SUSPEND_TRIM_TIERS[i].trim(trimmed);
    }
    return trimmed;
}

/** Creates the overflow error thrown when no tier fits. */
export function createSuspendOverflowError(format, length, limit) {
    const error = new Error(
        `${format} suspend_data exceeds the ${limit}-character limit (${length}) even after trimming to resume-critical state`
    );
    error.code = SUSPEND_DATA_OVERFLOW;
    error.bytes = length;
    error.limit = limit;
    return error;
}
