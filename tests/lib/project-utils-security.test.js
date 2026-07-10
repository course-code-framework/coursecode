import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { resolveWithinRoot } from '../../lib/project-utils.js';

describe('resolveWithinRoot', () => {
    const root = path.resolve('/tmp/coursecode-dist');

    it('allows files beneath the configured root', () => {
        expect(resolveWithinRoot(root, 'assets/main.js')).toBe(path.join(root, 'assets/main.js'));
    });

    it.each([
        '../package.json',
        '../../../../etc/hosts',
        '%2e%2e/package.json',
        '..%2f..%2fetc%2fhosts'
    ])('rejects traversal path %s', (candidate) => {
        expect(() => resolveWithinRoot(root, candidate)).toThrow(/escapes/);
    });
});
