import { describe, expect, it } from 'vitest';
import { normalizeInteractionResponseForPersistence } from '../../../framework/js/components/interactions/interaction-base.js';

describe('interaction response persistence normalization', () => {
    it('restores structured response types from evaluation JSON', () => {
        expect(normalizeInteractionResponseForPersistence('choice', '["a","b"]')).toEqual(['a', 'b']);
        expect(normalizeInteractionResponseForPersistence('matching', '{"left":"right"}')).toEqual({ left: 'right' });
        expect(normalizeInteractionResponseForPersistence('other', '["hotspot-a"]')).toEqual(['hotspot-a']);
    });

    it('preserves scalar and malformed responses', () => {
        expect(normalizeInteractionResponseForPersistence('choice', 'a')).toBe('a');
        expect(normalizeInteractionResponseForPersistence('fill-in', '{"answer":"text"}')).toBe('{"answer":"text"}');
        expect(normalizeInteractionResponseForPersistence('matching', '{not-json}')).toBe('{not-json}');
    });
});
