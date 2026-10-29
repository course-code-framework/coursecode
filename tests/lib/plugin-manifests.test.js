import { describe, expect, it } from 'vitest';
import fs from 'fs';

const readJson = (relativePath) => JSON.parse(fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf-8'));

describe('Claude Code and Codex plugin', () => {
    it('versions both manifests and the npx fallback with the framework package', () => {
        const { version } = readJson('package.json');
        const launcher = fs.readFileSync(new URL('../../plugin/mcp/coursecode-mcp.mjs', import.meta.url), 'utf-8');

        expect(readJson('plugin/.claude-plugin/plugin.json').version).toBe(version);
        expect(readJson('plugin/plugin.json').version).toBe(version);
        expect(launcher).toContain(`const FALLBACK_VERSION = '${version}';`);
    });

    it('starts the same launcher from both MCP configs', () => {
        const claude = readJson('plugin/.mcp.json').mcpServers.coursecode;
        const codex = readJson('plugin/mcp.json').mcpServers.coursecode;

        expect(claude.args).toEqual(['${CLAUDE_PLUGIN_ROOT}/mcp/coursecode-mcp.mjs', 'mcp']);
        expect(codex.args).toEqual(['${PLUGIN_ROOT}/mcp/coursecode-mcp.mjs', 'mcp']);
    });

    it('lists the plugin folder in both repository marketplaces', () => {
        const claude = readJson('.claude-plugin/marketplace.json');
        const codex = readJson('.agents/plugins/marketplace.json');

        expect(claude.plugins.find(plugin => plugin.name === 'coursecode').source).toBe('./plugin');
        expect(codex.plugins.find(plugin => plugin.name === 'coursecode').source).toEqual({ source: 'local', path: './plugin' });
        expect(fs.existsSync(new URL('../../plugin/skills/setup/SKILL.md', import.meta.url))).toBe(true);
        expect(readJson('plugin/plugin.json').extensions['com.openai'].onboardingSkill).toBe('./skills/setup/SKILL.md');
    });

    it('keeps the plugin out of the npm package', () => {
        const { files } = readJson('package.json');

        expect(files.some(entry => entry.replace(/^!/, '').startsWith('plugin'))).toBe(false);
    });
});
