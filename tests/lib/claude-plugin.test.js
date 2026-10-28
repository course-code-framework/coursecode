import { describe, expect, it } from 'vitest';
import fs from 'fs';

const readJson = (relativePath) => JSON.parse(fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf-8'));

describe('Claude Code plugin', () => {
    it('versions the plugin and its npx fallback with the framework package', () => {
        const { version } = readJson('package.json');
        const launcher = fs.readFileSync(new URL('../../plugin/mcp/coursecode-mcp.mjs', import.meta.url), 'utf-8');

        expect(readJson('plugin/.claude-plugin/plugin.json').version).toBe(version);
        expect(launcher).toContain(`const FALLBACK_VERSION = '${version}';`);
    });

    it('keeps the plugin out of the npm package', () => {
        const { files } = readJson('package.json');

        expect(files.some(entry => entry.replace(/^!/, '').startsWith('plugin'))).toBe(false);
    });
});
