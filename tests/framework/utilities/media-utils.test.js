import { describe, expect, it } from 'vitest';
import {
    DEFAULT_MEDIA_COMPLETION_THRESHOLD,
    normalizeCompletionThreshold
} from '../../../framework/js/utilities/media-utils.js';

describe('normalizeCompletionThreshold', () => {
    it.each([
        [0, 0],
        ['0', 0],
        [0.5, 0.5],
        ['1', 1]
    ])('preserves valid threshold %s', (value, expected) => {
        expect(normalizeCompletionThreshold(value)).toBe(expected);
    });

    it.each([undefined, null, '', '   ', 'invalid', '0.5garbage', -0.1, 1.1, Infinity, true, []])(
        'uses the default for invalid threshold %s',
        (value) => {
            expect(normalizeCompletionThreshold(value)).toBe(DEFAULT_MEDIA_COMPLETION_THRESHOLD);
        }
    );
});
