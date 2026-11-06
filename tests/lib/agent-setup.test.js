import { describe, expect, it, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeAgentSetup, projectSkill, AGENTS_MD } from '../../lib/agent-setup.js';

const temporary = [];
function project() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-agent-setup-'));
    temporary.push(dir);
    return dir;
}
const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf-8');
const SKILL_FILES = ['outline', 'build-slides', 'review', 'publish']
    .flatMap(name => ['.agents/skills', '.claude/skills'].map(folder => `${folder}/coursecode-${name}/SKILL.md`));
const settingsOnly = files => files.filter(file => !file.includes('/skills/'));
afterEach(() => temporary.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

describe('AI tool settings for course projects', () => {
    it('writes MCP settings for each tool and the shared agent instructions', () => {
        const dir = project();
        const written = writeAgentSetup(dir);
        expect(settingsOnly(written).sort()).toEqual(['.codex/config.toml', '.cursor/mcp.json', '.mcp.json', '.vscode/mcp.json', 'AGENTS.md', 'CLAUDE.md']);
        expect(written.filter(file => file.includes('/skills/')).sort()).toEqual([...SKILL_FILES].sort());

        expect(JSON.parse(read(dir, '.mcp.json')).mcpServers.coursecode).toEqual({ command: 'node', args: ['node_modules/coursecode/bin/cli.js', 'mcp'] });
        expect(JSON.parse(read(dir, '.cursor/mcp.json')).mcpServers.coursecode.env).toEqual({ COURSECODE_PROJECT_DIR: '${workspaceFolder}' });
        expect(JSON.parse(read(dir, '.vscode/mcp.json')).servers.coursecode.type).toBe('stdio');
        expect(read(dir, '.codex/config.toml')).toContain('[mcp_servers.coursecode]\ncommand = "node"\nargs = ["node_modules/coursecode/bin/cli.js", "mcp"]');
        expect(read(dir, 'AGENTS.md')).toBe(AGENTS_MD);
        expect(read(dir, 'CLAUDE.md')).toBe('@AGENTS.md\n');
    });

    it('skips the Claude Code project server and the skills when the plugin provides them', () => {
        const dir = project();
        expect(writeAgentSetup(dir, { plugin: true }).sort()).toEqual(['.codex/config.toml', '.cursor/mcp.json', '.vscode/mcp.json', 'AGENTS.md', 'CLAUDE.md']);
        expect(fs.existsSync(path.join(dir, '.mcp.json'))).toBe(false);
        expect(fs.existsSync(path.join(dir, '.claude', 'skills'))).toBe(false);
        expect(fs.existsSync(path.join(dir, '.agents', 'skills'))).toBe(false);
    });

    it('copies the project-stage plugin skills under coursecode- names', () => {
        const dir = project();
        writeAgentSetup(dir);

        for (const name of ['outline', 'build-slides', 'review', 'publish']) {
            const skill = read(dir, `.claude/skills/coursecode-${name}/SKILL.md`);
            expect(skill).toBe(projectSkill(name));
            expect(read(dir, `.agents/skills/coursecode-${name}/SKILL.md`)).toBe(skill);
            expect(skill).toMatch(new RegExp(`^---\nname: coursecode-${name}\ndescription: `));
            expect(skill).not.toMatch(/`(outline|build-slides|review|publish)` skill/);
        }
        expect(read(dir, '.claude/skills/coursecode-outline/SKILL.md')).toContain('use the `coursecode-build-slides` skill');
        expect(fs.existsSync(path.join(dir, '.claude', 'skills', 'coursecode-setup'))).toBe(false);
        expect(fs.existsSync(path.join(dir, '.claude', 'skills', 'coursecode-new-course'))).toBe(false);
    });

    it('leaves an author-edited skill alone', () => {
        const dir = project();
        fs.mkdirSync(path.join(dir, '.claude', 'skills', 'coursecode-review'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.claude', 'skills', 'coursecode-review', 'SKILL.md'), 'custom\n');

        expect(writeAgentSetup(dir)).not.toContain('.claude/skills/coursecode-review/SKILL.md');
        expect(read(dir, '.claude/skills/coursecode-review/SKILL.md')).toBe('custom\n');
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
