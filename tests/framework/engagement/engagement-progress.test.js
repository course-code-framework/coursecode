import { describe, it, expect } from 'vitest';
import {
    calculateProgress,
    buildTooltip,
    formatTimeHuman,
    formatInteractionId,
    mergeWithDefaults,
    stripDefaultValues
} from '../../../framework/js/engagement/engagement-progress.js';

// ─── calculateProgress ─────────────────────────────────────────────

describe('calculateProgress', () => {
    const mockStrategies = {
        viewAllTabs: {
            evaluate: (req, tracked) => ({
                met: tracked.tabsViewed?.length >= tracked.tabsTotal,
            }),
            progress: (req, tracked) => {
                const total = tracked.tabsTotal || 0;
                return total > 0 ? (tracked.tabsViewed?.length || 0) / total : 0;
            },
            label: (req, tracked) => {
                return `View all tabs (${tracked.tabsViewed?.length || 0}/${tracked.tabsTotal || 0})`;
            }
        },
        scrollDepth: {
            evaluate: (req, tracked) => ({
                met: tracked.scrollDepth >= (req.percentage || 95),
            }),
            progress: (req, tracked) => Math.min(1, tracked.scrollDepth / (req.percentage || 95)),
            label: () => 'Scroll down'
        }
    };

    it('returns 100% when all requirements met', () => {
        const tracked = { tabsViewed: ['t1', 't2', 't3'], tabsTotal: 3 };
        const requirements = [{ type: 'viewAllTabs' }];
        const result = calculateProgress('slide-1', tracked, requirements, mockStrategies, {});
        expect(result.percentage).toBe(100);
        expect(result.items[0].complete).toBe(true);
    });

    it('returns 0% when no progress', () => {
        const tracked = { tabsViewed: [], tabsTotal: 3 };
        const requirements = [{ type: 'viewAllTabs' }];
        const result = calculateProgress('slide-1', tracked, requirements, mockStrategies, {});
        expect(result.percentage).toBe(0);
        expect(result.items[0].complete).toBe(false);
    });

    it('calculates partial progress correctly', () => {
        const tracked = { tabsViewed: ['t1'], tabsTotal: 2 };
        const requirements = [{ type: 'viewAllTabs' }];
        const result = calculateProgress('slide-1', tracked, requirements, mockStrategies, {});
        expect(result.percentage).toBe(50);
    });

    it('averages progress across multiple requirements', () => {
        const tracked = { tabsViewed: ['t1', 't2'], tabsTotal: 2, scrollDepth: 50 };
        const requirements = [
            { type: 'viewAllTabs' },
            { type: 'scrollDepth', percentage: 100 }
        ];
        const result = calculateProgress('slide-1', tracked, requirements, mockStrategies, {});
        // tabs: 100%, scroll: 50% → average 75%
        expect(result.percentage).toBe(75);
    });

    it('returns 100% for empty requirements', () => {
        const result = calculateProgress('slide-1', {}, [], mockStrategies, {});
        expect(result.percentage).toBe(100);
    });

    it('uses custom message from requirement when provided', () => {
        const tracked = { tabsViewed: [], tabsTotal: 3 };
        const requirements = [{ type: 'viewAllTabs', message: 'Explore everything' }];
        const result = calculateProgress('slide-1', tracked, requirements, mockStrategies, {});
        expect(result.items[0].label).toBe('Explore everything');
    });
});

// ─── buildTooltip ───────────────────────────────────────────────────

describe('buildTooltip', () => {
    it('shows progress percentage for empty items', () => {
        expect(buildTooltip([], 50)).toBe('Slide Progress: 50%');
    });

    it('shows progress percentage for null items', () => {
        expect(buildTooltip(null, 75)).toBe('Slide Progress: 75%');
    });

    it('shows "All requirements complete" at 100%', () => {
        const items = [{ label: 'Done', complete: true }];
        expect(buildTooltip(items, 100)).toBe('All requirements complete');
    });

    it('shows single incomplete label', () => {
        const items = [{ label: 'View all tabs', complete: false }];
        expect(buildTooltip(items, 50)).toBe('View all tabs');
    });

    it('joins two incomplete labels with "and"', () => {
        const items = [
            { label: 'View all tabs', complete: false },
            { label: 'Scroll down', complete: false }
        ];
        expect(buildTooltip(items, 0)).toBe('View all tabs and Scroll down');
    });

    it('uses Oxford comma for 3+ incomplete labels', () => {
        const items = [
            { label: 'A', complete: false },
            { label: 'B', complete: false },
            { label: 'C', complete: false }
        ];
        expect(buildTooltip(items, 0)).toBe('A, B, and C');
    });

    it('only shows incomplete items in tooltip', () => {
        const items = [
            { label: 'Done', complete: true },
            { label: 'Still going', complete: false }
        ];
        expect(buildTooltip(items, 50)).toBe('Still going');
    });
});

// ─── formatTimeHuman ────────────────────────────────────────────────

describe('formatTimeHuman', () => {
    it('formats seconds < 60', () => {
        expect(formatTimeHuman(45)).toBe('45 seconds');
    });

    it('formats 1 second (singular)', () => {
        expect(formatTimeHuman(1)).toBe('1 second');
    });

    it('formats exact minutes', () => {
        expect(formatTimeHuman(120)).toBe('2 minutes');
    });

    it('formats 1 minute (singular)', () => {
        expect(formatTimeHuman(60)).toBe('1 minute');
    });

    it('formats mixed minutes and seconds', () => {
        expect(formatTimeHuman(90)).toBe('1m 30s');
    });
});

// ─── formatInteractionId ────────────────────────────────────────────

describe('formatInteractionId', () => {
    it('converts kebab-case to title case', () => {
        expect(formatInteractionId('system-architecture-dd')).toBe('System Architecture Dd');
    });

    it('converts underscore-separated to title case', () => {
        expect(formatInteractionId('drag_drop_quiz')).toBe('Drag Drop Quiz');
    });

    it('returns "interaction" for empty input', () => {
        expect(formatInteractionId('')).toBe('interaction');
    });

    it('returns "interaction" for null', () => {
        expect(formatInteractionId(null)).toBe('interaction');
    });
});

// ─── mergeWithDefaults / stripDefaultValues roundtrip ───────────────
// This is CRITICAL: data integrity through serialize/deserialize cycle

describe('mergeWithDefaults', () => {
    it('fills in all default tracked fields for empty state', () => {
        const state = { 'slide-1': { complete: false } };
        const merged = mergeWithDefaults(state);

        expect(merged['slide-1'].tracked.tabsViewed).toEqual([]);
        expect(merged['slide-1'].tracked.tabsTotal).toBe(0);
        expect(merged['slide-1'].tracked.scrollDepth).toBe(0);
        expect(merged['slide-1'].tracked.audioComplete).toBe(false);
        expect(merged['slide-1'].tracked.interactionsCompleted).toEqual({});
    });

    it('preserves existing values', () => {
        const state = {
            'slide-1': {
                tracked: { tabsViewed: ['t1'], tabsTotal: 3, scrollDepth: 50 },
                complete: true
            }
        };
        const merged = mergeWithDefaults(state);

        expect(merged['slide-1'].tracked.tabsViewed).toEqual(['t1']);
        expect(merged['slide-1'].tracked.tabsTotal).toBe(3);
        expect(merged['slide-1'].tracked.scrollDepth).toBe(50);
        expect(merged['slide-1'].complete).toBe(true);
    });
});

describe('stripDefaultValues', () => {
    it('removes zero/empty/false defaults', () => {
        const state = {
            'slide-1': {
                required: true,
                tracked: {
                    tabsViewed: [],
                    tabsTotal: 0,
                    scrollDepth: 0,
                    audioComplete: false,
                    interactionsCompleted: {}
                },
                complete: false
            }
        };
        const stripped = stripDefaultValues(state);
        expect(stripped['slide-1'].tracked).toBeUndefined();
    });

    it('preserves non-default values', () => {
        const state = {
            'slide-1': {
                required: true,
                tracked: {
                    tabsViewed: ['t1'],
                    tabsTotal: 3,
                    scrollDepth: 80,
                    audioComplete: true,
                    interactionsCompleted: {}
                },
                complete: true
            }
        };
        const stripped = stripDefaultValues(state);
        expect(stripped['slide-1'].tracked.tabsViewed).toEqual(['t1']);
        expect(stripped['slide-1'].tracked.tabsTotal).toBe(3);
        expect(stripped['slide-1'].tracked.scrollDepth).toBe(80);
        expect(stripped['slide-1'].tracked.audioComplete).toBe(true);
    });

    it('preserves completion status', () => {
        const state = {
            'slide-1': { required: false, tracked: {}, complete: true }
        };
        const stripped = stripDefaultValues(state);
        expect(stripped['slide-1'].complete).toBe(true);
    });
});

describe('mergeWithDefaults → stripDefaultValues roundtrip', () => {
    it('preserves data through serialize/deserialize cycle', () => {
        const original = {
            'slide-1': {
                required: true,
                tracked: {
                    tabsViewed: ['tab-1', 'tab-2'],
                    tabsTotal: 3,
                    scrollDepth: 75,
                    audioComplete: true
                },
                complete: false
            }
        };

        const stripped = stripDefaultValues(original);
        const restored = mergeWithDefaults(stripped);

        // Key assertion: no data loss through the cycle
        expect(restored['slide-1'].tracked.tabsViewed).toEqual(['tab-1', 'tab-2']);
        expect(restored['slide-1'].tracked.tabsTotal).toBe(3);
        expect(restored['slide-1'].tracked.scrollDepth).toBe(75);
        expect(restored['slide-1'].tracked.audioComplete).toBe(true);
        expect(restored['slide-1'].complete).toBe(false);
    });

    it('roundtrip with all-default state produces equivalent state', () => {
        const allDefaults = {
            'slide-1': {
                required: false,
                tracked: {
                    tabsViewed: [],
                    tabsTotal: 0,
                    scrollDepth: 0,
                    audioComplete: false,
                    interactionsCompleted: {}
                },
                complete: false
            }
        };

        const stripped = stripDefaultValues(allDefaults);
        const restored = mergeWithDefaults(stripped);

        expect(restored['slide-1'].tracked.tabsViewed).toEqual([]);
        expect(restored['slide-1'].tracked.tabsTotal).toBe(0);
        expect(restored['slide-1'].complete).toBe(false);
    });
});
