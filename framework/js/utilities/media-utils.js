/** Default fraction of media that must be consumed for completion. */
export const DEFAULT_MEDIA_COMPLETION_THRESHOLD = 0.95;

/**
 * Normalizes authored media completion thresholds from JS config or data
 * attributes. Values outside the documented 0-1 range fall back to the
 * framework default instead of creating media that can never complete.
 * @param {number|string|null|undefined} value
 * @returns {number}
 */
export function normalizeCompletionThreshold(value) {
    if (value === null || value === undefined) {
        return DEFAULT_MEDIA_COMPLETION_THRESHOLD;
    }

    if (typeof value !== 'number' && typeof value !== 'string') {
        return DEFAULT_MEDIA_COMPLETION_THRESHOLD;
    }

    if (typeof value === 'string' && value.trim() === '') {
        return DEFAULT_MEDIA_COMPLETION_THRESHOLD;
    }

    const parsed = typeof value === 'number' ? value : Number(value.trim());
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
        ? parsed
        : DEFAULT_MEDIA_COMPLETION_THRESHOLD;
}
