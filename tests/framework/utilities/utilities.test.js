import { describe, it, expect } from 'vitest';
import {
    deepClone,
    generateId,
    escapeHTML,
    formatPercentage,
    deepMerge,
    shuffleArray
} from '../../../framework/js/utilities/utilities.js';

// ─── deepClone ──────────────────────────────────────────────────────
// Data integrity: cloned state must not leak mutations back to the original

describe('deepClone', () => {
    it('clones primitives', () => {
        expect(deepClone(42)).toBe(42);
        expect(deepClone('hello')).toBe('hello');
        expect(deepClone(true)).toBe(true);
    });

    it('clones nested objects with isolation', () => {
        const original = { a: { b: { c: 1 } } };
        const cloned = deepClone(original);
        cloned.a.b.c = 999;
        expect(original.a.b.c).toBe(1);
    });

    it('clones arrays with isolation', () => {
        const original = [1, [2, 3], [4, [5]]];
        const cloned = deepClone(original);
        cloned[1][0] = 999;
        expect(original[1][0]).toBe(2);
    });

    it('handles null and undefined', () => {
        expect(deepClone(null)).toBe(null);
        expect(deepClone(undefined)).toBe(undefined);
    });

    it('clones Date objects', () => {
        const original = { date: new Date('2025-01-15') };
        const cloned = deepClone(original);
        expect(cloned.date).toEqual(original.date);
    });
});

// ─── generateId ─────────────────────────────────────────────────────

describe('generateId', () => {
    it('generates prefixed IDs', () => {
        const id = generateId('cc');
        expect(id.startsWith('cc-')).toBe(true);
    });

    it('generates unique IDs across calls', () => {
        const ids = new Set();
        for (let i = 0; i < 100; i++) {
            ids.add(generateId('test'));
        }
        expect(ids.size).toBe(100);
    });
});

// ─── escapeHTML ─────────────────────────────────────────────────────
// XSS prevention: all user-derived content displayed in LMS must be escaped

describe('escapeHTML', () => {
    it('escapes angle brackets', () => {
        expect(escapeHTML('<script>alert("xss")</script>')).not.toContain('<script>');
    });

    it('escapes ampersand', () => {
        expect(escapeHTML('a & b')).toContain('&amp;');
    });

    it('escapes quotes', () => {
        const escaped = escapeHTML('"hello" & \'world\'');
        expect(escaped).not.toContain('"hello"');
    });

    it('returns empty string for non-string input', () => {
        expect(escapeHTML(null)).toBe('');
        expect(escapeHTML(undefined)).toBe('');
    });
});

// ─── formatPercentage ───────────────────────────────────────────────

describe('formatPercentage', () => {
    it('formats decimal as percentage string', () => {
        expect(formatPercentage(0.5)).toBe('50%');
    });

    it('handles 0', () => {
        expect(formatPercentage(0)).toBe('0%');
    });

    it('handles 1 (100%)', () => {
        expect(formatPercentage(1)).toBe('100%');
    });
});

// ─── deepMerge ──────────────────────────────────────────────────────
// State management: merging partial updates into existing state

describe('deepMerge', () => {
    it('merges flat objects', () => {
        expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
    });

    it('source values override target', () => {
        expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
    });

    it('merges nested objects recursively', () => {
        const target = { a: { b: 1, c: 2 } };
        const source = { a: { c: 3, d: 4 } };
        const result = deepMerge(target, source);
        expect(result).toEqual({ a: { b: 1, c: 3, d: 4 } });
    });

    it('mutates target in-place (by design for state updates)', () => {
        const target = { a: { b: 1 } };
        const result = deepMerge(target, { a: { c: 2 } });
        // deepMerge mutates target — this is intentional for state management
        expect(target.a.c).toBe(2);
        expect(result).toBe(target);
    });

    it('source arrays replace target arrays', () => {
        const result = deepMerge({ arr: [1, 2] }, { arr: [3] });
        expect(result.arr).toEqual([3]);
    });
});

// ─── shuffleArray ───────────────────────────────────────────────────
// Assessment: randomized questions must contain same items

describe('shuffleArray', () => {
    it('returns array with same elements', () => {
        const input = [1, 2, 3, 4, 5];
        const shuffled = shuffleArray(input);
        expect(shuffled.sort()).toEqual(input.sort());
    });

    it('returns array of same length', () => {
        const input = [1, 2, 3, 4, 5];
        expect(shuffleArray(input)).toHaveLength(5);
    });

    it('does not mutate original array', () => {
        const input = [1, 2, 3, 4, 5];
        const copy = [...input];
        shuffleArray(input);
        expect(input).toEqual(copy);
    });

    it('handles empty array', () => {
        expect(shuffleArray([])).toEqual([]);
    });

    it('handles single element', () => {
        expect(shuffleArray([42])).toEqual([42]);
    });
});
