/**
 * @file engagement-progress.js
 * @description Pure functions for calculating engagement progress,
 * building tooltips, and serializing/deserializing engagement state.
 * No side effects or state manager dependencies.
 *
 * Tracked field defaults are derived from strategy declarations in
 * requirement-strategies.js — no hardcoded field lists here.
 */

import { getTrackedFieldDefaults } from './requirement-strategies.js';

/**
 * Calculates progress with partial completion support.
 * @param {string} slideId - The slide identifier
 * @param {object} tracked - The tracked data
 * @param {array} requirements - The requirements array
 * @param {object} strategies - The requirement strategies map
 * @param {object} ctx - The strategy context
 * @returns {object} Progress summary with percentage, items, and tooltip
 */
export function calculateProgress(slideId, tracked, requirements, strategies, ctx) {
    const items = [];
    let totalProgress = 0;

    for (const req of requirements) {
        const strategy = strategies[req.type];
        const result = strategy.evaluate(req, tracked, ctx);
        const requirementProgress = result.met ? 1 : strategy.progress(req, tracked, result, ctx);
        const dynamicLabel = req.message || strategy.label(req, tracked, result, ctx);

        items.push({
            type: req.type,
            label: dynamicLabel,
            complete: result.met
        });

        totalProgress += requirementProgress;
    }

    const percentage = requirements.length > 0
        ? Math.round((totalProgress / requirements.length) * 100)
        : 100;

    const tooltip = buildTooltip(items, percentage);

    return { percentage, items, tooltip };
}

/**
 * Builds a tooltip string from progress items.
 * @param {array} items - Progress items with labels and completion status
 * @param {number} percentage - Completion percentage
 * @returns {string} Tooltip text
 */
export function buildTooltip(items, percentage) {
    if (!items || items.length === 0) {
        return `Slide Progress: ${percentage}%`;
    }

    if (percentage === 100) {
        return 'All requirements complete';
    }

    const incomplete = items.filter(item => !item.complete);
    if (incomplete.length === 0) {
        return 'All requirements complete';
    }

    const labels = incomplete.map(item => item.label);

    if (labels.length === 1) {
        return labels[0];
    } else if (labels.length === 2) {
        return `${labels[0]} and ${labels[1]}`;
    } else {
        return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
    }
}

/**
 * Formats seconds into a human-friendly string.
 * @param {number} seconds - Time in seconds
 * @returns {string} Human-readable time string (e.g., "2 minutes", "45 seconds")
 */
export function formatTimeHuman(seconds) {
    if (seconds < 60) {
        return `${seconds} second${seconds === 1 ? '' : 's'}`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) {
        return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }
    return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Formats an interaction ID into a human-readable label.
 * Converts kebab-case IDs like "system-architecture-dd" to "System Architecture Dd".
 * @param {string} interactionId - The interaction identifier
 * @returns {string} Human-readable label
 */
export function formatInteractionId(interactionId) {
    if (!interactionId) return 'interaction';

    return interactionId
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Merges stored engagement state with default values.
 * Defaults are derived from strategy field declarations — no hardcoded list.
 * @param {object} state - The raw state from storage
 * @returns {object} State with defaults filled in
 */
export function mergeWithDefaults(state) {
    const fieldDefaults = getTrackedFieldDefaults();
    const merged = {};

    for (const [slideId, slideState] of Object.entries(state)) {
        const tracked = {};
        for (const [key, defaultVal] of Object.entries(fieldDefaults)) {
            const stored = slideState.tracked?.[key];
            if (stored !== undefined && stored !== null) {
                tracked[key] = stored;
            } else {
                // Deep-clone defaults so slides don't share array/object references
                tracked[key] = Array.isArray(defaultVal) ? [] :
                    (typeof defaultVal === 'object' && defaultVal !== null) ? { ...defaultVal } :
                    defaultVal;
            }
        }
        merged[slideId] = {
            required: slideState.required || false,
            tracked,
            complete: slideState.complete || false
        };
    }

    return merged;
}

/**
 * Strips default values from engagement state to reduce storage size.
 * Uses strategy field declarations to determine what constitutes a "default".
 * @param {object} state - The full engagement state
 * @returns {object} Optimized state with defaults removed
 */
export function stripDefaultValues(state) {
    const fieldDefaults = getTrackedFieldDefaults();
    const optimized = {};

    for (const [slideId, slideState] of Object.entries(state)) {
        const optimizedSlide = {
            required: slideState.required
        };

        if (slideState.tracked) {
            const tracked = {};

            for (const [key, defaultVal] of Object.entries(fieldDefaults)) {
                const val = slideState.tracked[key];
                if (val === undefined || val === null) continue;

                // Only include if value differs from default
                if (Array.isArray(defaultVal)) {
                    if (val.length > 0) tracked[key] = val;
                } else if (typeof defaultVal === 'object' && defaultVal !== null) {
                    if (Object.keys(val).length > 0) tracked[key] = val;
                } else if (typeof defaultVal === 'boolean') {
                    if (val) tracked[key] = val;
                } else if (typeof defaultVal === 'number') {
                    if (val > 0) tracked[key] = val;
                }
            }

            if (Object.keys(tracked).length > 0) {
                optimizedSlide.tracked = tracked;
            }
        }

        optimizedSlide.complete = slideState.complete || false;

        optimized[slideId] = optimizedSlide;
    }

    return optimized;
}
