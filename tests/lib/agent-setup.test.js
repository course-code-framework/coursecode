import { describe, expect, it, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeAgentSetup, AGENTS_MD } from '../../lib/agent-setup.js';

const temporary = [];
function project() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-agent-setup-'));
    temporary.push(dir);
    return dir;
}
const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf-8');
afterEach(() => temporary.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

describe('AI tool settings for course projects', () => {
    it('writes MCP settings for each tool and the shared agent instructions', () => {
        const dir = project();
        expect(writeAgentSetup(dir).sort()).toEqual(['.codex/config.toml', '.cursor/mcp.json', '.mcp.json', '.vscode/mcp.json', 'AGENTS.md', 'CLAUDE.md']);

        expect(JSON.parse(read(dir, '.mcp.json')).mcpServers.coursecode).toEqual({ command: 'node', args: ['node_modules/coursecode/bin/cli.js', 'mcp'] });
        expect(JSON.parse(read(dir, '.cursor/mcp.json')).mcpServers.coursecode.env).toEqual({ COURSECODE_PROJECT_DIR: '${workspaceFolder}' });
        expect(JSON.parse(read(dir, '.vscode/mcp.json')).servers.coursecode.type).toBe('stdio');
        expect(read(dir, '.codex/config.toml')).toContain('[mcp_servers.coursecode]\ncommand = "node"\nargs = ["node_modules/coursecode/bin/cli.js", "mcp"]');
        expect(read(dir, 'AGENTS.md')).toBe(AGENTS_MD);
        expect(read(dir, 'CLAUDE.md')).toBe('@AGENTS.md\n');
    });

    it('skips the Claude Code project server when the plugin provides it', () => {
        const dir = project();
        expect(writeAgentSetup(dir, { plugin: true }).sort()).toEqual(['.codex/config.toml', '.cursor/mcp.json', '.vscode/mcp.json', 'AGENTS.md', 'CLAUDE.md']);
        expect(fs.existsSync(path.join(dir, '.mcp.json'))).toBe(false);
    });

    it('adds to existing settings without overwriting them', () => {
        const dir = project();
        fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'other' } } }));
        fs.mkdirSync(path.join(dir, '.codex'));
        fs.writeFileSync(path.join(dir, '.codex', 'config.toml'), 'model = "gpt-5"\n');
        fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Team rules\n');

        writeAgentSetup(dir);

        expect(Object.keys(JSON.parse(read(dir, '.mcp.json')).mcpServers)).toEqual(['other', 'coursecode']);
        expect(read(dir, '.codex/config.toml')).toMatch(/^model = "gpt-5"\n\n# Codex reads/);
        expect(read(dir, 'AGENTS.md')).toBe('# Team rules\n');
    });

    it('is idempotent and leaves unparseable JSON alone', () => {
        const dir = project();
        fs.mkdirSync(path.join(dir, '.vscode'));
        fs.writeFileSync(path.join(dir, '.vscode', 'mcp.json'), '{ // comments\n}');
        writeAgentSetup(dir);

        expect(writeAgentSetup(dir)).toEqual([]);
        expect(read(dir, '.vscode/mcp.json')).toBe('{ // comments\n}');
    });
});
