import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

/** Runtime (non-type) names declared by a .d.ts file. */
function declaredValueExports(dtsPath) {
    const source = fs.readFileSync(dtsPath, 'utf8');
    const names = new Set();
    for (const match of source.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) {
        names.add(match[1]);
    }
    for (const match of source.matchAll(/^export\s+\{([^}]+)\}\s+from/gm)) {
        for (const part of match[1].split(',')) {
            const name = part.trim().split(/\s+as\s+/).pop();
            if (name) names.add(name);
        }
    }
    if (/^export\s+default\s/m.test(source)) names.add('default');
    return [...names];
}

const entries = Object.entries(pkg.exports);

describe('package exports and type declarations', () => {
    it.each(entries)('%s declares types that exist on disk', (_subpath, target) => {
        expect(target.types, 'missing "types" condition').toBeTruthy();
        expect(fs.existsSync(path.join(repoRoot, target.types))).toBe(true);
        expect(fs.existsSync(path.join(repoRoot, target.default))).toBe(true);
    });

    it.each(entries)('%s implements every value declared in its .d.ts', async (_subpath, target) => {
        const mod = await import(pathToFileURL(path.join(repoRoot, target.default)).href);
        for (const name of declaredValueExports(path.join(repoRoot, target.types))) {
            expect(mod, `${target.types} declares ${name}`).toHaveProperty(name);
        }
    });

    it('declares lintCourse as async', async () => {
        const dts = fs.readFileSync(path.join(repoRoot, 'lib/index.d.ts'), 'utf8');
        expect(dts).toMatch(/export function lintCourse\([^)]*\): Promise</);
        const { lintCourse } = await import('../../lib/index.js');
        expect(lintCourse({}, '/nonexistent')).toBeInstanceOf(Promise);
    });
});
