import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    assemblePortableHtml,
    collectPortableAssets,
    validatePortableHtml
} from '../../lib/portable-html.js';

const temporaryDirectories = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

describe('portable HTML assembly', () => {
    it('embeds copied course assets under a canonical portable path', () => {
        const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-portable-test-'));
        temporaryDirectories.push(buildDir);
        const imagePath = path.join(buildDir, 'course', 'assets', 'images', 'sample.svg');
        fs.mkdirSync(path.dirname(imagePath), { recursive: true });
        fs.writeFileSync(imagePath, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');

        const assets = collectPortableAssets(buildDir);

        expect(assets['course/assets/images/sample.svg']).toMatch(/^data:image\/svg\+xml;base64,/);
        expect(Object.keys(assets)).toEqual(['course/assets/images/sample.svg']);
    });

    it('injects the asset map before the module and leaves no local asset reference', () => {
        const source = '<!doctype html><html><head><link href="data:text/css;base64,eA=="></head><body><img src="./course/assets/a.png"><script type="module">window.ready=true</script></body></html>';
        const output = assemblePortableHtml(source, {
            'course/assets/a.png': 'data:image/png;base64,AAAA'
        });

        expect(output).toContain('data-coursecode-portable="true"');
        expect(output.indexOf('__COURSECODE_PORTABLE_ASSETS__')).toBeLessThan(output.indexOf('window.ready=true'));
        expect(output).not.toContain('src="./course/assets/a.png"');
        expect(() => validatePortableHtml(output)).not.toThrow();
    });

    it('rejects a result that still depends on a neighboring local file', () => {
        const invalid = '<html data-coursecode-portable="true"><head><script>window.__COURSECODE_PORTABLE_ASSETS__={}</script></head><body><script src="assets/app.js"></script></body></html>';
        expect(() => validatePortableHtml(invalid)).toThrow(/external local script remains/);
    });
});
