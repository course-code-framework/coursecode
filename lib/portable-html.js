/**
 * Portable HTML build support.
 *
 * The Vite plugin collapses generated JavaScript and CSS. The export command
 * then embeds CourseCode's copied runtime assets and writes the final single
 * HTML file outside the temporary build directory.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { getMimeType, validateProject } from './project-utils.js';

const PORTABLE_BUILD_PREFIX = '.coursecode-portable-build-';

export function createPortableHtmlPlugin() {
    return viteSingleFile({
        removeViteModuleLoader: true,
        useRecommendedBuildConfig: true
    });
}

function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: process.cwd(),
            stdio: 'inherit',
            shell: process.platform === 'win32',
            ...options
        });
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`));
        });
    });
}

function walkFiles(rootDir) {
    const files = [];
    if (!fs.existsSync(rootDir)) return files;

    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
        const absolute = path.join(rootDir, entry.name);
        if (entry.isDirectory()) files.push(...walkFiles(absolute));
        else if (entry.isFile()) files.push(absolute);
    }
    return files;
}

function toDataUrl(filePath) {
    const mimeType = getMimeType(filePath);
    const base64 = fs.readFileSync(filePath).toString('base64');
    return `data:${mimeType};base64,${base64}`;
}

function addAssetAliases(map, canonicalPath, dataUrl) {
    const canonical = canonicalPath.replace(/\\/g, '/').replace(/^\.\//, '');
    map[canonical] = dataUrl;
}

export function collectPortableAssets(buildDir) {
    const map = {};
    const courseAssetsDir = path.join(buildDir, 'course', 'assets');
    for (const filePath of walkFiles(courseAssetsDir)) {
        const canonical = path.relative(buildDir, filePath).replace(/\\/g, '/');
        addAssetAliases(map, canonical, toDataUrl(filePath));
    }

    for (const filename of ['_gallery-manifest.json']) {
        const filePath = path.join(buildDir, filename);
        if (fs.existsSync(filePath)) addAssetAliases(map, filename, toDataUrl(filePath));
    }
    return map;
}

function replaceDirectAssetReferences(html, assetMap) {
    const aliases = [];
    for (const canonical of Object.keys(assetMap)) {
        aliases.push([`./${canonical}`, assetMap[canonical]], [canonical, assetMap[canonical]]);
        if (canonical.startsWith('course/assets/')) {
            const relative = canonical.slice('course/assets/'.length);
            aliases.push([`./assets/${relative}`, assetMap[canonical]], [`assets/${relative}`, assetMap[canonical]]);
        }
    }
    aliases.sort((a, b) => b[0].length - a[0].length);

    let result = html;
    for (const [alias, dataUrl] of aliases) {
        result = result.split(alias).join(dataUrl);
    }
    return result;
}

export function assemblePortableHtml(indexHtml, assetMap) {
    const serializedMap = JSON.stringify(assetMap).replace(/</g, '\\u003c');
    const bootstrap = `<script>window.__COURSECODE_PORTABLE_ASSETS__=${serializedMap};</script>`;
    let html = replaceDirectAssetReferences(indexHtml, assetMap);

    const firstModule = html.search(/<script\b[^>]*type=["']module["']/i);
    if (firstModule >= 0) {
        html = `${html.slice(0, firstModule)}${bootstrap}\n${html.slice(firstModule)}`;
    } else if (html.includes('</head>')) {
        html = html.replace('</head>', `${bootstrap}\n</head>`);
    } else {
        throw new Error('Portable build is missing a document head or module entry point');
    }

    return html
        .replace(/<title([^>]*)>(.*?)<\/title>/i, '<title$1>$2</title>')
        .replace(/<html([^>]*)>/i, '<html$1 data-coursecode-portable="true">');
}

export function validatePortableHtml(html) {
    const problems = [];
    if (!html.includes('data-coursecode-portable="true"')) problems.push('portable marker missing');
    if (!html.includes('__COURSECODE_PORTABLE_ASSETS__')) problems.push('embedded asset map missing');
    if (/<script\b[^>]+src=["'](?!data:|https?:|\/\/)/i.test(html)) problems.push('external local script remains');
    if (/<link\b[^>]+href=["'](?!data:|https?:|\/\/|#)/i.test(html)) problems.push('external local stylesheet remains');
    if (/\b(?:src|href|poster)=["'](?:\.\/)?course\/assets\//i.test(html)) problems.push('unembedded course asset remains');
    if (problems.length > 0) throw new Error(`Portable HTML validation failed: ${problems.join('; ')}`);
}

function safeFilename(value) {
    return String(value || 'course')
        .trim()
        .replace(/[<>:"/\\|?*]/g, '-')
        .replace(/\s+/g, '_') || 'course';
}

async function loadCourseConfig(coursePath) {
    const url = `${pathToFileURL(path.join(coursePath, 'course-config.js')).href}?portable=${Date.now()}`;
    const module = await import(url);
    return module.courseConfig || module.default || {};
}

function assertPortableBuildSupport(rootDir) {
    const configPath = path.join(rootDir, 'vite.config.js');
    const configSource = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    if (configSource.includes('COURSECODE_PORTABLE_HTML') && configSource.includes('COURSECODE_OUT_DIR')) return;

    throw new Error(
        'This project\'s vite.config.js predates portable HTML export. ' +
        'Run "coursecode upgrade --configs", review the generated config backup, and try again.'
    );
}

export async function exportPortableHtml(options = {}) {
    const { coursePath } = validateProject();
    const rootDir = process.cwd();
    assertPortableBuildSupport(rootDir);
    const config = await loadCourseConfig(coursePath);
    const title = config.metadata?.title || 'Course';
    const outputPath = path.resolve(options.output || `${safeFilename(title)}.html`);
    const buildDirName = `${PORTABLE_BUILD_PREFIX}${process.pid}`;
    const buildDir = path.join(rootDir, buildDirName);

    if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true, force: true });

    console.log('\n📄 Building portable HTML course...\n');
    try {
        const env = {
            ...process.env,
            COURSECODE_PORTABLE_HTML: 'true',
            COURSECODE_OUT_DIR: buildDirName,
            LMS_FORMAT: 'standalone'
        };

        if (options.lint === false) {
            await runCommand('npx', ['vite', 'build'], { env });
        } else {
            await runCommand('npm', ['run', 'build'], { env });
        }

        const indexPath = path.join(buildDir, 'index.html');
        if (!fs.existsSync(indexPath)) throw new Error('Portable build did not produce index.html');

        const assetMap = collectPortableAssets(buildDir);
        const html = assemblePortableHtml(fs.readFileSync(indexPath, 'utf8'), assetMap);
        validatePortableHtml(html);

        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, html, 'utf8');

        const sizeMB = fs.statSync(outputPath).size / 1024 / 1024;
        const sizeWarning = sizeMB >= 50
            ? '\n   ⚠ Large portable file: test sharing limits and browser startup time.'
            : '';
        console.log(`\n✅ Portable HTML exported\n\n   Output: ${outputPath}\n   Size: ${sizeMB.toFixed(2)} MB${sizeWarning}\n\n   Open the file directly in a modern browser; no LMS or server is required.\n`);
        return { outputPath, sizeBytes: fs.statSync(outputPath).size, assetCount: Object.keys(assetMap).length };
    } finally {
        if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true, force: true });
    }
}
