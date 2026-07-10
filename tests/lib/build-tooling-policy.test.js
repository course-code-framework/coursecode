import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

describe('build tooling and learner-browser policy', () => {
    it.each(['package.json', 'template/package.json'])('%s uses the supported Vite stack without plugin-legacy', (relativePath) => {
        const pkg = readJson(relativePath);
        expect(pkg.devDependencies.vite).toMatch(/^~8\.1\./);
        expect(pkg.devDependencies['vite-plugin-static-copy']).toMatch(/^\^4\./);
        expect(pkg.devDependencies).not.toHaveProperty('@vitejs/plugin-legacy');
        expect(pkg.devDependencies).not.toHaveProperty('@babel/core');
    });

    it.each(['vite.framework-dev.config.js', 'template/vite.config.js'])('%s encodes one stable modern-browser build', (relativePath) => {
        const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
        expect(source).toContain("['chrome111', 'edge111', 'firefox114', 'safari16.4']");
        expect(source).toContain('target: SUPPORTED_BROWSER_TARGETS');
        expect(source).toContain('rolldownOptions:');
        expect(source).not.toContain('manifest: true');
        expect(source).not.toContain('rollupOptions:');
        expect(source).not.toContain('@vitejs/plugin-legacy');
        expect(source).not.toMatch(/\blegacy\s*\(/);
    });

    it('adapts static-copy v4 path preservation to the generated project layout', () => {
        const templateConfig = fs.readFileSync(path.join(repoRoot, 'template/vite.config.js'), 'utf8');
        const frameworkConfig = fs.readFileSync(path.join(repoRoot, 'vite.framework-dev.config.js'), 'utf8');

        expect(templateConfig).toContain("src: 'course/assets', dest: 'course', rename: { stripBase: 1 }");
        expect(frameworkConfig).toContain("src: 'template/course/assets', dest: 'course', rename: { stripBase: 2 }");
        for (const source of [templateConfig, frameworkConfig]) {
            expect(source).toContain("src: 'schemas/*.{xml,xsd,dtd}', dest: '.', rename: { stripBase: 1 }");
            expect(source).toContain("src: 'schemas/common/*', dest: 'common', rename: { stripBase: 2 }");
            expect(source).toContain("src: 'framework/js/vendor/**/*', dest: 'js/vendor', rename: { stripBase: 3 }");
        }
    });
});
