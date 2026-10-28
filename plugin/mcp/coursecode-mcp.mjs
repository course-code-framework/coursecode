#!/usr/bin/env node
/**
 * Starts the CourseCode MCP server for the project in the current directory.
 *
 * Prefers the project's own coursecode dependency so tools match the framework
 * version the course was built with. Outside a project, falls back to the
 * published CLI through npx, pinned to an exact version as Anthropic's plugin
 * directory requires. FALLBACK_VERSION must match package.json and
 * .claude-plugin/plugin.json (tests/lib/claude-plugin.test.js checks this).
 * Spawning node/npx from here (rather than from .mcp.json) keeps the plugin
 * working on Windows, where npx is a .cmd shim.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 15)) {
    // Claude Code shows MCP server stderr in /mcp, so say exactly what to do
    console.error(`[coursecode] CourseCode needs Node.js 22.15 or later, but this is Node.js ${process.versions.node}. Install the current LTS from https://nodejs.org/ and restart Claude Code.`);
    process.exit(1);
}

const projectCli = path.join(process.cwd(), 'node_modules', 'coursecode', 'bin', 'cli.js');
// Framework development: run a checkout's CLI everywhere (path to its bin/cli.js)
const devCli = process.env.COURSECODE_CLI;
const FALLBACK_VERSION = '0.1.61';
const args = process.argv.slice(2);

const localCli = devCli && fs.existsSync(devCli) ? devCli : fs.existsSync(projectCli) ? projectCli : null;
const [command, commandArgs, shell] = localCli
    ? [process.execPath, [localCli, 'mcp', ...args], false]
    : ['npx', ['-y', `coursecode@${FALLBACK_VERSION}`, 'mcp', ...args], process.platform === 'win32'];

const child = spawn(command, commandArgs, { stdio: 'inherit', shell });

child.on('error', (error) => {
    console.error(`[coursecode] Failed to start the MCP server: ${error.message}`);
    process.exit(1);
});
child.on('exit', (code, signal) => {
    process.exit(signal ? 1 : (code ?? 0));
});
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
}
