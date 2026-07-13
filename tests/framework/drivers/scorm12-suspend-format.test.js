import { describe, expect, it } from 'vitest';
import {
    decodeScorm12SuspendState,
    encodeScorm12SuspendState
} from '../../../framework/js/drivers/scorm-12-driver.js';

describe('SCORM 1.2 suspend_data encoding', () => {
    it('uses only ASCII characters and round-trips Unicode course state', () => {
        const state = { learnerNote: 'Résumé 日本語', nested: { complete: true } };
        const encoded = encodeScorm12SuspendState(state);

        expect(encoded).toMatch(/^CC12:/);
        expect([...encoded].every(char => char.charCodeAt(0) <= 127)).toBe(true);
        expect(decodeScorm12SuspendState(encoded)).toEqual(state);
    });

    it('fails closed for corrupt encoded state', () => {
        expect(() => decodeScorm12SuspendState('CC12:not-valid-compressed-state'))
            .toThrow(/corrupted|truncated/);
    });
});
