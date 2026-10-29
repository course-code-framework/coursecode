import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveLaunch } from '../../plugin/mcp/coursecode-mcp.mjs';
import { TOOLS } from '../../lib/mcp-prompts.js';

const temporary = [];
function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-plugin-test-'));
    temporary.push(root);
    const cwd = path.join(root, 'project with spaces');
    const pluginRoot = path.join(root, 'plugin');
    fs.mkdirSync(cwd);
    fs.mkdirSync(pluginRoot);
    return { root, cwd, pluginRoot };
}
function cli(root) {
    const file = path.join(root, 'node_modules', 'coursecode', 'bin', 'cli.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '// fixture');
    return file;
}
afterEach(() => temporary.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

const { version } = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
const env = {};

describe('plugin launcher', () => {
    it('prefers the project dependency so the tools match the course version', () => {
        const options = fixture();
        cli(path.join(options.pluginRoot, 'runtime'));
        const local = cli(options.cwd);
        expect(resolveLaunch({ ...options, env, args: ['mcp'] })).toEqual({ command: process.execPath, args: [local, 'mcp'], cwd: options.cwd, shell: false });
    });
    it('uses a bundled runtime and keeps literal arguments', () => {
        const options = fixture();
        const bundled = cli(path.join(options.pluginRoot, 'runtime'));
        const args = ['create', 'a course; echo not-a-command'];
        expect(resolveLaunch({ ...options, env, args })).toEqual({ command: process.execPath, args: [bundled, ...args], cwd: options.cwd, shell: false });
    });
    it('falls back to the pinned published CLI without a project or runtime', () => {
        const options = fixture();
        expect(resolveLaunch({ ...options, env, platform: 'darwin', args: ['mcp'] })).toEqual({ command: 'npx', args: ['-y', `coursecode@${version}`, 'mcp'], cwd: options.cwd, shell: false });
    });
    it('quotes arguments for the Windows npx shim', () => {
        const options = fixture();
        const target = resolveLaunch({ ...options, env, platform: 'win32', args: ['create', 'My Course'] });
        expect(target).toMatchObject({ command: 'npx', shell: true });
        expect(target.args).toEqual(['-y', `coursecode@${version}`, 'create', '"My Course"']);
    });
    it('uses the shell PWD when started inside the plugin install folder', () => {
        const options = fixture();
        const local = cli(options.cwd);
        const target = resolveLaunch({ ...options, cwd: options.pluginRoot, env: { PWD: options.cwd }, args: ['mcp'] });
        expect(target).toMatchObject({ args: [local, 'mcp'], cwd: options.cwd });
    });
    it('honors an explicit project directory', () => {
        const options = fixture();
        cli(options.cwd);
        const target = resolveLaunch({ ...options, cwd: options.pluginRoot, env: { COURSECODE_PROJECT_DIR: '../project with spaces' } });
        expect(target.cwd).toBe(options.cwd);
    });
    it('runs when the host reaches the launcher through a symlinked parent directory', () => {
        const options = fixture();
        const bundled = cli(path.join(options.pluginRoot, 'runtime'));
        fs.writeFileSync(bundled, 'console.log("bundled-runtime-started");');
        fs.mkdirSync(path.join(options.pluginRoot, 'mcp'));
        fs.copyFileSync(fileURLToPath(new URL('../../plugin/mcp/coursecode-mcp.mjs', import.meta.url)), path.join(options.pluginRoot, 'mcp', 'coursecode-mcp.mjs'));
        const link = path.join(options.root, 'linked-plugin');
        fs.symlinkSync(options.pluginRoot, link, process.platform === 'win32' ? 'junction' : 'dir');
        const result = spawnSync(process.execPath, [path.join(link, 'mcp', 'coursecode-mcp.mjs'), 'version'], { cwd: options.cwd, encoding: 'utf8' });
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe('bundled-runtime-started');
    });
});

describe('public MCP operation annotations', () => {
    it('declares all required safety annotations for every operation', () => {
        for (const tool of TOOLS) {
            for (const key of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) {
                expect(typeof tool.annotations[key], `${tool.name}.${key}`).toBe('boolean');
            }
            if (tool.annotations.readOnlyHint) expect(tool.annotations.destructiveHint).toBe(false);
        }
    });
    it('labels state replacement, assessment resets, file output, and paid narration as writes', () => {
        for (const name of ['coursecode_interact', 'coursecode_assessment', 'coursecode_reset', 'coursecode_build', 'coursecode_narration']) {
            expect(TOOLS.find(tool => tool.name === name).annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
        }
        expect(TOOLS.find(tool => tool.name === 'coursecode_narration').annotations.openWorldHint).toBe(true);
        expect(TOOLS.find(tool => tool.name === 'coursecode_screenshot').annotations.readOnlyHint).toBe(false);
    });
});
