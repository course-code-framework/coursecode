import { describe, expect, it } from 'vitest';
import {
    hasValidPreviewMutationToken,
    requiresPreviewMutationToken
} from '../../lib/preview-server.js';

describe('preview mutation authorization', () => {
    it.each([
        ['POST', '/__write'],
        ['POST', '/__assets-upload'],
        ['POST', '/__refs-convert'],
        ['POST', '/__build']
    ])('protects %s %s', (method, url) => {
        expect(requiresPreviewMutationToken(method, url)).toBe(true);
    });

    it('does not protect read-only requests or in-memory LMS synchronization', () => {
        expect(requiresPreviewMutationToken('GET', '/__config')).toBe(false);
        expect(requiresPreviewMutationToken('POST', '/__lms/sync')).toBe(false);
    });

    it('uses a constant header name and exact token match', () => {
        expect(hasValidPreviewMutationToken({ 'x-coursecode-preview-token': 'right' }, 'right')).toBe(true);
        expect(hasValidPreviewMutationToken({ 'x-coursecode-preview-token': 'wrong' }, 'right')).toBe(false);
        expect(hasValidPreviewMutationToken({}, 'right')).toBe(false);
    });
});
