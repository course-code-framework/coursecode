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

    it('lists the published package in the MCP Registry under the package.json mcpName', () => {
        const { name, version, mcpName } = readJson('package.json');
        const server = readJson('server.json');

        expect(server.name).toBe(mcpName);
        expect(server.version).toBe(version);
        expect(server.description.length).toBeLessThanOrEqual(100);
        expect(server.packages).toEqual([expect.objectContaining({ registryType: 'npm', identifier: name, version, transport: { type: 'stdio' } })]);
        expect(server.packages[0].packageArguments).toEqual([{ type: 'positional', value: 'mcp' }]);
    });

    it('starts the same launcher from both MCP configs', () => {
        const claude = readJson('plugin/.mcp.json').mcpServers.coursecode;
        const codex = readJson('plugin/mcp.json').mcpServers.coursecode;

        expect(claude.args).toEqual(['${CLAUDE_PLUGIN_ROOT}/mcp/coursecode-mcp.mjs', 'mcp']);
        expect(codex.args).toEqual(['${PLUGIN_ROOT}/mcp/coursecode-mcp.mjs', 'mcp']);
    });

    it('keeps the launcher and the session-start check on the package.json Node.js minimum', () => {
        const [, major, minor] = readJson('package.json').engines.node.match(/^>=(\d+)\.(\d+)\.0$/);
        const launcher = fs.readFileSync(new URL('../../plugin/mcp/coursecode-mcp.mjs', import.meta.url), 'utf-8');
        const check = fs.readFileSync(new URL('../../plugin/hooks/check-node.cmd', import.meta.url), 'utf-8');
        const [batch, sh] = check.split('\nBATCH\n');

        expect(launcher).toContain(`major < ${major} || (major === ${major} && minor < ${minor})`);
        expect(batch).toContain(`if %MAJOR% GTR ${major} exit /b 0`);
        expect(batch).toContain(`if %MAJOR% EQU ${major} if %MINOR% GEQ ${minor} exit /b 0`);
        expect(sh).toContain(`[ "$major" -gt ${major} ] || { [ "$major" -eq ${major} ] && [ "$minor" -ge ${minor} ]; }`);
        expect(`${batch}${sh}`.match(/Node\.js \d+\.\d+ or later/g)).toEqual(Array(2).fill(`Node.js ${major}.${minor} or later`));
    });

    it('gives both shells the same session-start message and keeps the check portable', () => {
        const check = fs.readFileSync(new URL('../../plugin/hooks/check-node.cmd', import.meta.url), 'utf-8');
        const [batch, sh] = check.split('\nBATCH\n');
        const message = (text, found) => text.match(new RegExp(`^echo "?(CourseCode: .*?)"?$`, 'm'))[1].replace(found, '<found>');

        expect(message(batch, '%FOUND%')).toBe(message(sh, '$found'));
        expect(check).not.toContain('\r');
        expect(batch).not.toMatch(/^:\w/m);
        expect(fs.readFileSync(new URL('../../.gitattributes', import.meta.url), 'utf-8')).toContain('plugin/hooks/check-node.cmd text eol=lf');
    });

    it('checks Node.js at session start without a Cowork-blocking bin directory', () => {
        const [entry] = readJson('plugin/hooks/hooks.json').hooks.SessionStart;

        expect(entry.hooks).toEqual([{ type: 'command', command: '. "${CLAUDE_PLUGIN_ROOT}/hooks/check-node.cmd"', timeout: 10 }]);
        expect(fs.existsSync(new URL('../../plugin/bin', import.meta.url))).toBe(false);
        expect(fs.readFileSync(new URL('../../scripts/package-codex-plugin.mjs', import.meta.url), 'utf-8')).toMatch(/CLAUDE_ONLY = new Set\(\[[^\]]*'hooks'/);
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
