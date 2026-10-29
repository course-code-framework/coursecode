import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(root, 'artifacts', 'codex-plugin');
const source = path.join(root, 'plugin');
// Claude Code files and repository docs stay out of the Codex package
const CLAUDE_ONLY = new Set(['.claude-plugin', '.mcp.json', 'README.md', 'CODEX.md']);
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'plugin.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) throw new Error('Keep the Codex plugin and framework package versions aligned.');
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-plugin-pack-'));

function run(command, args, cwd = root) {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' && command === 'npm', maxBuffer: 10 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
    return result.stdout;
}

try {
    const pluginDir = path.join(stage, 'coursecode');
    fs.cpSync(source, pluginDir, { recursive: true, filter: file => !CLAUDE_ONLY.has(path.relative(source, file)) });
    fs.copyFileSync(path.join(root, 'LICENSE'), path.join(pluginDir, 'LICENSE'));
    const runtime = path.join(pluginDir, 'runtime');
    fs.mkdirSync(runtime);
    const packed = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', stage]));
    const tarball = path.join(stage, packed[0].filename);
    // The plugin includes an installed runtime; npm is not invoked to start MCP.
    // Only npm's allowlisted framework package files enter the archive.
    fs.copyFileSync(tarball, path.join(runtime, 'coursecode.tgz'));
    fs.writeFileSync(path.join(runtime, 'package.json'), `${JSON.stringify({
        name: 'coursecode-plugin-runtime', version: manifest.version, private: true,
        dependencies: { coursecode: 'file:./coursecode.tgz' }, overrides: pkg.overrides
    }, null, 2)}\n`);
    run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], runtime);
    // Executable shims are not used: the launcher calls node with an exact file.
    // Remove symlinks so ZIP extraction is portable and cannot escape the package.
    function removeLinks(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const target = path.join(dir, entry.name);
            if (entry.isSymbolicLink()) fs.unlinkSync(target);
            else if (entry.isDirectory()) removeLinks(target);
        }
    }
    removeLinks(pluginDir);
    // Ship executable dependency code and licenses, not development-only maps,
    // declarations, tests, or examples. Preserve all CourseCode package files:
    // its template, documentation, schemas, and assets are authoring inputs.
    let omittedDependencyFiles = 0;
    function pruneDependencyExtras(dir, relative = '') {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const rel = path.posix.join(relative, entry.name);
            if (rel === 'coursecode') continue;
            const target = path.join(dir, entry.name);
            if (entry.isDirectory()) pruneDependencyExtras(target, rel);
            else if (entry.isFile() && (
                /(?:\.map|\.d\.(?:ts|cts|mts))$/.test(entry.name)
                || rel.split('/').some(part => ['test', 'tests', '__tests__', 'examples'].includes(part))
            ) && !/^(?:licen[cs]e|copying|notice)/i.test(entry.name)) {
                fs.unlinkSync(target);
                omittedDependencyFiles++;
            }
        }
    }
    pruneDependencyExtras(path.join(runtime, 'node_modules'));
    fs.writeFileSync(path.join(pluginDir, 'BUILD.json'), `${JSON.stringify({
        frameworkVersion: pkg.version,
        source: 'local framework checkout; not a published npm release',
        packageIntegrity: packed[0].integrity,
        platform: process.platform, arch: process.arch,
        nodeVersion: process.versions.node,
        omittedDependencyFiles,
        status: 'development package; public submission preparation incomplete'
    }, null, 2)}\n`);

    fs.mkdirSync(outputRoot, { recursive: true });
    // A local marketplace for installing the packaged build before submission
    const marketplace = path.join(outputRoot, '.agents', 'plugins', 'marketplace.json');
    fs.mkdirSync(path.dirname(marketplace), { recursive: true });
    fs.writeFileSync(marketplace, `${JSON.stringify({
        name: 'coursecode-local',
        interface: { displayName: 'CourseCode Framework (packaged build)' },
        plugins: [{ name: 'coursecode', source: { source: 'local', path: './coursecode' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Education & Research' }]
    }, null, 2)}\n`);
    const destination = path.join(outputRoot, 'coursecode');
    fs.rmSync(destination, { recursive: true, force: true });
    fs.cpSync(pluginDir, destination, { recursive: true });
    const zipPath = path.join(outputRoot, `coursecode-${manifest.version}-codex.zip`);
    // File entries create their parent directories on extraction. Avoid spending
    // the public portal's 5,000-entry budget on redundant directory records.
    const files = [];
    function collectFiles(dir, relative = 'coursecode') {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const target = path.join(dir, entry.name);
            const name = path.posix.join(relative, entry.name);
            if (entry.isDirectory()) collectFiles(target, name);
            else if (entry.isFile()) files.push({ target, name });
            else throw new Error(`Unsupported plugin archive entry: ${name}`);
        }
    }
    collectFiles(destination);
    if (files.length > 5000) throw new Error(`Plugin has ${files.length} files; the public portal limit is 5000.`);
    const output = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const completed = new Promise((resolve, reject) => {
        output.on('close', resolve);
        output.on('error', reject);
        archive.on('error', reject);
        archive.on('warning', reject);
    });
    archive.pipe(output);
    for (const file of files) archive.file(file.target, { name: file.name });
    await archive.finalize();
    await completed;
    console.log(`Packaged ${zipPath} (${files.length} files; omitted ${omittedDependencyFiles} dependency development files)\nLocal marketplace: ${outputRoot}`);
} finally {
    fs.rmSync(stage, { recursive: true, force: true });
}
