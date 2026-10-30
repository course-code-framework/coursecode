#!/usr/bin/env node
/**
 * Runs the CourseCode CLI for the author's project. Claude Code (.mcp.json) and
 * Codex (mcp.json) both start the MCP server through this file, and skills may
 * run other CLI commands through it.
 *
 * Project folder: COURSECODE_PROJECT_DIR, else the working directory. Codex
 * starts plugin servers inside the plugin's install folder, so when the working
 * directory is the plugin itself the launcher uses the shell's PWD instead. The
 * MCP server can still switch to the client's workspace root once it connects.
 *
 * CLI: COURSECODE_CLI (a framework checkout's bin/cli.js), else the project's
 * own coursecode dependency so tools match the course's framework version, else
 * a runtime bundled into a packaged plugin, else the published CLI through npx,
 * pinned to an exact version as Anthropic's plugin directory requires.
 * The CLI runs with COURSECODE_PLUGIN=1 so the MCP server can tell the agent to
 * create projects with --plugin (no duplicate Claude Code server).
 * FALLBACK_VERSION must match package.json and both plugin manifests
 * (tests/lib/claude-plugin.test.js checks this). Spawning node/npx from here
 * rather than from the MCP config keeps the plugin working on Windows, where npx
 * is a .cmd shim. The minimum Node.js version in main() must match package.json
 * engines and hooks/check-node.cmd (tests/lib/plugin-manifests.test.js checks this).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FALLBACK_VERSION = '0.4.4';
const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function isInside(dir, parent) {
    const relative = path.relative(parent, dir);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
}

// cmd.exe runs the npx shim, so quote arguments it would otherwise split
function quoteForCmd(arg) {
    return /^[\w@./:=-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '""')}"`;
}

export function resolveLaunch({ cwd = process.cwd(), env = process.env, pluginRoot = PLUGIN_ROOT, platform = process.platform, args = [] } = {}) {
    let projectRoot = cwd;
    if (env.COURSECODE_PROJECT_DIR) {
        projectRoot = path.resolve(cwd, env.COURSECODE_PROJECT_DIR);
        if (!fs.statSync(projectRoot, { throwIfNoEntry: false })?.isDirectory()) {
            throw new Error(`COURSECODE_PROJECT_DIR is not a directory: ${projectRoot}`);
        }
    } else if (isInside(cwd, pluginRoot) && env.PWD && !isInside(env.PWD, pluginRoot) && fs.existsSync(env.PWD)) {
        projectRoot = env.PWD;
    }

    const devCli = env.COURSECODE_CLI && fs.existsSync(env.COURSECODE_CLI) ? env.COURSECODE_CLI : null;
    const cli = devCli ?? [
        path.join(projectRoot, 'node_modules', 'coursecode', 'bin', 'cli.js'),
        path.join(pluginRoot, 'runtime', 'node_modules', 'coursecode', 'bin', 'cli.js')
    ].find(file => fs.existsSync(file));

    if (cli) return { command: process.execPath, args: [cli, ...args], cwd: projectRoot, shell: false };
    const npxArgs = ['-y', `coursecode@${FALLBACK_VERSION}`, ...args];
    return platform === 'win32'
        ? { command: 'npx', args: npxArgs.map(quoteForCmd), cwd: projectRoot, shell: true }
        : { command: 'npx', args: npxArgs, cwd: projectRoot, shell: false };
}

function main() {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 22 || (major === 22 && minor < 15)) {
        // Claude Code shows MCP server stderr in /mcp, so say exactly what to do
        console.error(`[coursecode] CourseCode needs Node.js 22.15 or later, but this is Node.js ${process.versions.node}. Ask your AI tool to set up CourseCode, which can install it for you, or install the current LTS from https://nodejs.org/. Then restart your AI tool.`);
        process.exit(1);
    }

    let target;
    try {
        target = resolveLaunch({ args: process.argv.slice(2) });
    } catch (error) {
        console.error(`[coursecode] ${error.message}`);
        process.exit(1);
    }

    const child = spawn(target.command, target.args, {
        cwd: target.cwd,
        env: { ...process.env, COURSECODE_PLUGIN: '1' },
        stdio: 'inherit',
        shell: target.shell
    });
    child.on('error', (error) => {
        console.error(`[coursecode] Failed to start CourseCode: ${error.message}`);
        process.exit(1);
    });
    child.on('exit', (code, signal) => {
        process.exit(signal ? 1 : (code ?? 0));
    });
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, () => child.kill(signal));
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) main();
