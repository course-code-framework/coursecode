import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const zip = path.join(root, 'artifacts', 'codex-plugin', `coursecode-${version}-codex.zip`);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-codex-smoke-'));
const evidence = path.join(root, 'artifacts', 'codex-plugin', 'smoke');
fs.mkdirSync(evidence, { recursive: true });
const report = { package: path.basename(zip), checks: [], reviewCases: 'Not run as agent prompts; this is a protocol/CLI integration test.' };
let preview;
let client;
let transport;
let previewLog = '';

function run(command, args, cwd = temp) {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' && command === 'npm', maxBuffer: 20 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
    return result.stdout;
}
function passed(name, details = {}) {
    report.checks.push({ name, status: 'passed', ...details });
    console.log(`PASS ${name}`);
}
async function call(name, args = {}) {
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 90000 });
    assert(!result.isError, `${name}: ${JSON.stringify(result)}`);
    return result.structuredContent ?? result.content;
}

try {
    assert(fs.existsSync(zip), 'Run npm run plugin:pack first.');
    const inventory = run('unzip', ['-Z1', zip]).split('\n').filter(Boolean);
    assert(inventory.length <= 5000, 'Public plugin ZIP must contain at most 5,000 entries.');
    assert(inventory.every(item => item.startsWith('coursecode/') && !item.split('/').includes('..')));
    assert(!inventory.some(item => /(^|\/)(\.env|\.app\.json|marketplace\.json|\.claude-plugin|\.git)(\/|$)/.test(item)));
    run('unzip', ['-q', zip, '-d', temp]);
    const plugin = path.join(temp, 'coursecode');
    const manifest = JSON.parse(fs.readFileSync(path.join(plugin, 'plugin.json'), 'utf8'));
    const ui = manifest.extensions['com.openai'].interface;
    assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
    assert.equal(manifest.version, version);
    assert.equal(ui.category, 'Education & Research');
    assert(ui.shortDescription.length <= 30);
    assert(ui.displayName.length <= 30);
    assert(ui.defaultPrompt.length <= 3 && ui.defaultPrompt.every(prompt => prompt.length <= 128));
    const review = manifest.extensions['com.openai'].review.test_cases;
    assert.equal(review.positive.length, 5);
    assert.equal(review.negative.length, 3);
    const skills = fs.readdirSync(path.join(plugin, 'skills'));
    assert.deepEqual(skills.sort(), ['build-slides', 'new-course', 'outline', 'publish', 'review', 'setup']);
    assert(!['.claude-plugin', '.mcp.json', 'hooks'].some(name => fs.existsSync(path.join(plugin, name))));
    const icon = fs.readFileSync(path.join(plugin, ui.logo));
    assert.equal(icon.subarray(1, 4).toString(), 'PNG');
    assert.equal(icon.readUInt32BE(16), 256);
    assert.equal(icon.readUInt32BE(20), 256);
    assert(icon.length < 5 * 1024 * 1024);
    passed('Extracted archive layout, listing, skills, review cases, and icon', { files: inventory.length });

    const launcher = path.join(plugin, 'mcp', 'coursecode-mcp.mjs');
    const bundledCli = path.join(plugin, 'runtime', 'node_modules', 'coursecode', 'bin', 'cli.js');
    const project = path.join(temp, 'sample course');
    fs.mkdirSync(project);
    const bundledVersion = run(process.execPath, [launcher, 'version'], project);
    assert(bundledVersion.includes(version));
    run(process.execPath, [launcher, 'create', '.', '--no-install'], project);
    const packagePath = path.join(project, 'package.json');
    const projectPackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    projectPackage.devDependencies.coursecode = `file:${path.join(plugin, 'runtime', 'coursecode.tgz')}`;
    fs.writeFileSync(packagePath, `${JSON.stringify(projectPackage, null, 2)}\n`);
    run('npm', ['install', '--no-audit', '--no-fund'], project);
    passed('Bundled bootstrap creates a project with installed dependencies');

    const listener = net.createServer();
    await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    // Exercise the pruned packaged dependencies even after project setup. The
    // launcher's project-version preference is covered by the focused tests.
    transport = new StdioClientTransport({ command: process.execPath, args: [bundledCli, 'mcp', '--port', String(port)], cwd: project, stderr: 'pipe' });
    let mcpLog = '';
    transport.stderr?.on('data', chunk => { mcpLog += chunk.toString(); });
    client = new Client({ name: 'coursecode-plugin-smoke', version: '1.0.0' });
    try { await client.connect(transport); } catch (error) { throw new Error(`${error.message}\n${mcpLog}`); }
    const { tools } = await client.listTools();
    for (const tool of tools) for (const key of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) assert.equal(typeof tool.annotations?.[key], 'boolean', `${tool.name}.${key}`);
    await call('coursecode_workflow_status');
    const components = await call('coursecode_component_catalog');
    assert(JSON.stringify(components).includes('tabs'));
    passed('MCP startup, tool discovery, workflow status, and component catalog', { tools: tools.length });

    const missingPreview = await client.callTool({ name: 'coursecode_errors', arguments: {} });
    assert(missingPreview.isError);
    assert.equal(missingPreview.structuredContent?.code, 'preview_not_running');
    passed('Missing Preview returns an actionable error');

    preview = spawn(process.execPath, [bundledCli, 'preview', '--port', String(port)], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    for (const stream of [preview.stdout, preview.stderr]) stream.on('data', chunk => { previewLog += chunk.toString(); });
    const deadline = Date.now() + 90000;
    let ready = false;
    while (Date.now() < deadline) {
        if (preview.exitCode !== null) throw new Error(`Preview exited:\n${previewLog}`);
        try {
            const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
            if (response.ok) { ready = true; break; }
        } catch { /* wait for first build */ }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert(ready, `Preview did not become ready:\n${previewLog}`);
    const state = await call('coursecode_state');
    assert(state.toc?.length > 0);
    await call('coursecode_navigate', { slideId: 'example-interactions-showcase' });
    const wrong = await call('coursecode_interact', { interactionId: 'framework-components-mc', response: 'a' });
    assert.equal(wrong.correct, false);
    const right = await call('coursecode_interact', { interactionId: 'framework-components-mc', response: 'c' });
    assert.equal(right.correct, true);
    passed('Preview navigation and incorrect/correct interaction evaluation', { wrong, right });

    for (const [name, width, height] of [['desktop', 1280, 720], ['mobile', 375, 812]]) {
        await call('coursecode_viewport', { width, height });
        const shot = await client.callTool({ name: 'coursecode_screenshot', arguments: {} }, undefined, { timeout: 90000 });
        assert(!shot.isError);
        const img = shot.content.find(item => item.type === 'image');
        assert(img?.data);
        fs.writeFileSync(path.join(evidence, `${name}.jpg`), Buffer.from(img.data, 'base64'));
    }
    await call('coursecode_viewport', { width: 1280, height: 720 });
    passed('Desktop and mobile screenshots');

    const slidePath = path.join(project, 'course', 'slides', 'example-interactions-showcase.js');
    const slide = fs.readFileSync(slidePath, 'utf8');
    fs.writeFileSync(slidePath, slide.replace('class="stack-lg"', 'class="stack-lg codex-smoke-invalid-class"'));
    const invalid = await call('coursecode_lint');
    assert(JSON.stringify(invalid).includes('codex-smoke-invalid-class'));
    fs.writeFileSync(slidePath, slide);
    const clean = await call('coursecode_lint');
    assert.equal(clean.passed, true, JSON.stringify(clean));
    const diagnostics = await call('coursecode_errors');
    passed('Static lint detects and clears an invalid class; live diagnostics respond', { diagnostics });

    const buildOutput = run(process.execPath, [bundledCli, 'build', '--format', 'scorm1.2'], project);
    const exports = fs.readdirSync(project).filter(name => name.endsWith('.zip'));
    assert(exports.length === 1, `Expected one ZIP; found ${exports.length}\n${buildOutput}`);
    const exportedPath = path.join(project, exports[0]);
    const exportedFiles = run('unzip', ['-Z1', exportedPath]).split('\n');
    assert(exportedFiles.includes('imsmanifest.xml'));
    assert(exportedFiles.includes('index.html'));
    fs.copyFileSync(exportedPath, path.join(evidence, exports[0]));
    passed('Local SCORM 1.2 Export includes manifest and course HTML', { artifact: exports[0] });
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.error = error.stack;
    console.error(error.stack);
    process.exitCode = 1;
} finally {
    await client?.close().catch(() => {});
    await transport?.close().catch(() => {});
    if (preview && preview.exitCode === null) {
        try {
            if (process.platform === 'win32') preview.kill('SIGTERM');
            else process.kill(-preview.pid, 'SIGTERM');
        } catch { /* already exited */ }
    }
    fs.writeFileSync(path.join(evidence, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(evidence, 'preview.log'), previewLog);
    fs.rmSync(temp, { recursive: true, force: true });
    console.log(`Evidence: ${evidence}`);
}
