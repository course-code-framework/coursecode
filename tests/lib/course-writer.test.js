import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { write } from '../../lib/course-writer.js';

let tempDir;

afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
});

describe('course writer source preservation', () => {
    it('preserves imports and surrounding module code while updating config', async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-writer-'));
        fs.writeFileSync(path.join(tempDir, 'package.json'), '{"type":"module"}\n');
        fs.writeFileSync(path.join(tempDir, 'helper.js'), 'export const helper = values => values.length;\n');
        fs.writeFileSync(path.join(tempDir, 'course-config.js'), [
            "import { helper } from './helper.js';",
            '// This import and trailing export must survive visual edits.',
            'export const courseConfig = {',
            "  metadata: { title: 'Original' },",
            '  scoring: { calculate: values => helper(values) }',
            '};',
            "export const sentinel = 'kept';",
            ''
        ].join('\n'));

        const result = await write(tempDir, 'config', 'metadata.title', 'Updated\nTitle');
        expect(result).toEqual({ success: true });

        const source = fs.readFileSync(path.join(tempDir, 'course-config.js'), 'utf8');
        expect(source).toContain("import { helper } from './helper.js';");
        expect(source).toContain("export const sentinel = 'kept';");
        expect(source).toContain('helper(values)');
        expect(source).toContain('Updated\\nTitle');

        const module = await import(`${pathToFileURL(path.join(tempDir, 'course-config.js')).href}?t=${Date.now()}`);
        expect(module.courseConfig.metadata.title).toBe('Updated\nTitle');
        expect(module.courseConfig.scoring.calculate([1, 2, 3])).toBe(3);
        expect(module.sentinel).toBe('kept');
    });

    it('rejects prototype-polluting property paths', async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-writer-'));
        fs.writeFileSync(path.join(tempDir, 'package.json'), '{"type":"module"}\n');
        fs.writeFileSync(path.join(tempDir, 'course-config.js'), 'export const courseConfig = {};\n');

        const result = await write(tempDir, 'config', '__proto__.polluted', true);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Invalid configuration property path/);
        expect({}.polluted).toBeUndefined();
    });

    it('serializes rapid writes without reloading stale module state', async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-writer-'));
        fs.writeFileSync(path.join(tempDir, 'package.json'), '{"type":"module"}\n');
        fs.writeFileSync(path.join(tempDir, 'course-config.js'), [
            'export const courseConfig = {',
            "  metadata: { title: 'Original', version: '1.0.0' }",
            '};',
            ''
        ].join('\n'));

        const results = await Promise.all([
            write(tempDir, 'config', 'metadata.title', 'Updated'),
            write(tempDir, 'config', 'metadata.version', '2.0.0')
        ]);

        expect(results).toEqual([{ success: true }, { success: true }]);
        const module = await import(`${pathToFileURL(path.join(tempDir, 'course-config.js')).href}?t=${Date.now()}`);
        expect(module.courseConfig.metadata).toEqual({ title: 'Updated', version: '2.0.0' });
    });
});
