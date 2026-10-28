/**
 * preview-export.js - Generate static preview with embedded stub LMS
 * 
 * Builds the course (unless --skip-build), then outputs a deploy-ready
 * folder with an embedded stub LMS player for sharing previews.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { parseManifest, parseCmi5Manifest, sanitizeIdentifier } from './manifest-parser.js';
import { generateStubPlayer } from './stub-player.js';
import { getContentExport } from './export-content.js';
import { validateProject } from './project-utils.js';
import { isPreviewOnlyBuildFile } from './manifest/manifest-factory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Marker file written into every export so re-exports can safely replace it. */
export const EXPORT_MARKER_FILE = '.coursecode-preview-export';

/** Must match PASSWORD_HASH_ITERATIONS in lib/stub-player/login-screen.js */
const PASSWORD_HASH_ITERATIONS = 100000;

/**
 * Derive a salted password hash for the preview's soft access gate.
 *
 * Uses PBKDF2-SHA-256 with a random per-export salt so precomputed tables
 * don't apply. The stub player derives the same value via Web Crypto.
 * NOTE: this is only an access gate — the exported course files are public.
 *
 * @param {string} password - Plaintext password
 * @param {string} [salt] - Hex salt (random if omitted)
 * @returns {{ hash: string, salt: string }}
 */
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_HASH_ITERATIONS, 32, 'sha256').toString('hex');
    return { hash, salt };
}

function isSameOrInside(child, parent) {
    const rel = path.relative(parent, child);
    return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

/** Resolve symlinks for the longest existing prefix of `p` (p need not exist). */
function realpathOrSelf(p) {
    let current = path.resolve(p);
    const rest = [];
    for (;;) {
        try {
            return path.join(fs.realpathSync(current), ...rest);
        } catch {
            const parent = path.dirname(current);
            if (parent === current) return path.resolve(p);
            rest.unshift(path.basename(current));
            current = parent;
        }
    }
}

/**
 * Decide whether it is safe to replace `outputPath` with a fresh export.
 * Throws with a user-facing message when it is not.
 *
 * Always refused (even with force): filesystem root, home dir, the project
 * root or any ancestor of it, and project source/build dirs (course/,
 * framework/, dist/, node_modules/, .git/) or anything inside them.
 * Refused unless `force`: an existing non-empty directory that doesn't look
 * like a previous preview export.
 *
 * @param {string} outputPath - Absolute output path
 * @param {object} [options]
 * @param {string} [options.cwd=process.cwd()] - Project root
 * @param {string} [options.homeDir=os.homedir()]
 * @param {string[]} [options.protectedDirs] - Extra dirs that must not be touched
 * @param {boolean} [options.force=false]
 */
export function assertSafeExportOutput(outputPath, options = {}) {
    const cwd = realpathOrSelf(path.resolve(options.cwd || process.cwd()));
    const homeDir = realpathOrSelf(path.resolve(options.homeDir || os.homedir()));
    const target = realpathOrSelf(path.resolve(outputPath));
    const refuse = (reason) => {
        throw new Error(`Refusing to use "${outputPath}" as the preview export directory: ${reason}`);
    };

    if (path.parse(target).root === target) refuse('it is the filesystem root.');
    if (target === homeDir) refuse('it is your home directory.');
    if (isSameOrInside(cwd, target)) refuse('it is the project directory or one of its parents.');

    const protectedDirs = [
        ...['course', 'framework', 'dist', 'node_modules', '.git'].map(d => path.join(cwd, d)),
        ...(options.protectedDirs || [])
    ].map(d => realpathOrSelf(path.resolve(d)));
    for (const dir of protectedDirs) {
        if (isSameOrInside(target, dir)) {
            refuse(`it is inside the project's ${path.relative(cwd, dir) || dir} directory.`);
        }
    }

    if (!fs.existsSync(target)) return;
    if (!fs.statSync(target).isDirectory()) refuse('it exists and is not a directory.');

    const entries = fs.readdirSync(target);
    if (entries.length === 0) return;
    if (looksLikePreviewExport(target, entries)) return;
    if (options.force) return;
    refuse('it is not empty and does not look like a previous preview export. ' +
        'Choose another --output directory, or pass --force to replace it.');
}

function looksLikePreviewExport(dir, entries) {
    if (entries.includes(EXPORT_MARKER_FILE)) return true;
    // Exports created before the marker file existed
    return entries.includes('_course.html') &&
        entries.includes('index.html') &&
        fs.existsSync(path.join(dir, 'stub-player', 'app-viewer.js'));
}


/**
 * Run a command and return a promise
 */
function runCommand(cmd, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd: process.cwd(),
            stdio: 'inherit',
            shell: process.platform === 'win32',
            ...options
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${cmd} ${args.join(' ')} failed with code ${code}`));
            }
        });

        child.on('error', reject);
    });
}

/**
 * Copy directory recursively
 */
function copyDirSync(src, dest, { skip = () => false, root = src } = {}) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (skip(path.relative(root, srcPath))) continue;

        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath, { skip, root });
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * Main export function
 * @param {object} options - Export options
 */
export async function previewExport(options = {}) {
    const outputDir = options.output || './course-preview';
    const distDir = path.resolve('./dist');

    // Validate we're in a SCORM project
    validateProject();

    // Validate the output location before spending time on a build
    const outputPath = path.resolve(outputDir);
    const assertOutput = () => {
        try {
            assertSafeExportOutput(outputPath, { force: options.force, protectedDirs: [distDir] });
        } catch (error) {
            console.error(`\n❌ ${error.message}\n`);
            process.exit(1);
        }
    };
    assertOutput();

    // Build unless --skip-build
    if (!options.skipBuild) {
        const formatNote = options.format ? ` (${options.format})` : '';
        console.log(`
🔨 Building course${formatNote}...
`);
        try {
            // Pass format via environment variable if specified
            const buildEnv = { ...process.env };
            if (options.format) {
                buildEnv.LMS_FORMAT = options.format;
            }
            await runCommand('npm', ['run', 'build'], { env: buildEnv });
        } catch (_error) {
            console.error(`
❌ Build failed. Fix errors above and try again.
`);
            process.exit(1);
        }
    }

    console.log(`
📦 Generating static preview...
`);

    // Validate dist exists
    if (!fs.existsSync(distDir)) {
        console.error('❌ dist/ folder not found. Run build first or remove --skip-build.');
        process.exit(1);
    }

    // Check for manifest (SCORM or cmi5)
    const scormManifestPath = path.join(distDir, 'imsmanifest.xml');
    const cmi5ManifestPath = path.join(distDir, 'cmi5.xml');

    let manifest;
    if (fs.existsSync(scormManifestPath)) {
        console.log('   Parsing SCORM manifest...');
        const manifestContent = fs.readFileSync(scormManifestPath, 'utf-8');
        manifest = parseManifest(manifestContent);
    } else if (fs.existsSync(cmi5ManifestPath)) {
        console.log('   Parsing cmi5 manifest...');
        const manifestContent = fs.readFileSync(cmi5ManifestPath, 'utf-8');
        manifest = parseCmi5Manifest(manifestContent);
    } else {
        console.error('❌ No manifest found in dist/ (expected imsmanifest.xml or cmi5.xml)');
        process.exit(1);
    }

    console.log(`   Course: ${manifest.title}`);
    console.log(`   Launch: ${manifest.launchFile}`);

    // Create output directory (only ever replacing an empty dir or a previous export)
    assertOutput();
    if (fs.existsSync(outputPath)) {
        fs.rmSync(outputPath, { recursive: true });
    }
    fs.mkdirSync(outputPath, { recursive: true });
    fs.writeFileSync(
        path.join(outputPath, EXPORT_MARKER_FILE),
        'Generated by "coursecode preview --export". This directory is replaced on each export.\n',
        'utf-8'
    );

    // Copy course files directly to output (not in subdirectory)
    // This preserves absolute paths that Vite generates
    console.log('   Copying course files...');
    // Preview-only artifacts (e.g. the content manifest with answer keys) never ship
    copyDirSync(distDir, outputPath, { skip: isPreviewOnlyBuildFile });

    // Generate stub player (overwrites course's index.html)
    // The course's original index.html becomes the launch target
    const originalIndex = path.join(outputPath, 'index.html');
    const courseIndex = path.join(outputPath, '_course.html');

    // Rename course's index.html to _course.html
    if (fs.existsSync(originalIndex)) {
        fs.renameSync(originalIndex, courseIndex);
    }

    // Generate course content markdown (enabled by default, use --no-content to disable)
    let courseContent = null;
    if (options.content !== false) {
        console.log('   Generating course content for viewer...');
        courseContent = await getContentExport({
            coursePath: './course',
            includeNarration: true
        });
    }

    // Copy only viewer-mode stub player files (excludes edit/debug/config/catalog/interactions/outline)
    console.log('   Copying stub player modules...');
    const stubPlayerSrc = path.join(__dirname, 'stub-player');
    const stubPlayerDest = path.join(outputPath, 'stub-player');

    const viewerFiles = ['app-viewer.js', 'lms-api.js', 'header-bar.js', 'content-viewer.js', 'login-screen.js'];
    const viewerStyles = ['_base.css', '_header-bar.css', '_content-viewer.css', '_login-screen.css'];

    fs.mkdirSync(stubPlayerDest, { recursive: true });
    for (const file of viewerFiles) {
        const src = path.join(stubPlayerSrc, file);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(stubPlayerDest, file));
    }

    // Copy viewer-only styles
    const stylesDest = path.join(stubPlayerDest, 'styles');
    fs.mkdirSync(stylesDest, { recursive: true });
    for (const file of viewerStyles) {
        const src = path.join(stubPlayerSrc, 'styles', file);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(stylesDest, file));
    }

    console.log('   Generating stub player...');
    const storageKey = `scorm_preview_${sanitizeIdentifier(manifest.identifier)}`;
    const passwordGate = options.password ? hashPassword(options.password) : null;
    const playerHtml = generateStubPlayer({
        title: options.title || manifest.title,
        launchUrl: '_course.html',
        storageKey,
        passwordHash: passwordGate?.hash || null,
        passwordSalt: passwordGate?.salt || null,
        isLive: false,
        courseContent,       // Include content if generated
        moduleBasePath: './stub-player'
    });

    fs.writeFileSync(path.join(outputPath, 'index.html'), playerHtml, 'utf-8');

    // Add .nojekyll file if requested (required for GitHub Pages)
    if (options.nojekyll) {
        console.log('   Adding .nojekyll file...');
        fs.writeFileSync(path.join(outputPath, '.nojekyll'), '', 'utf-8');
    }

    const passwordNote = options.password
        ? '\n   🔑 Password gate enabled (soft access gate only, not security:\n' +
          '      course files remain publicly downloadable from the deployed folder)\n'
        : '';

    const contentNote = options.content === false
        ? ''
        : '\n   📄 Content viewer enabled\n';

    console.log(`
✅ Preview exported successfully!

   Output: ${outputPath}${passwordNote}${contentNote}
   
   To view locally:
     cd ${outputDir} && npx serve
   
   To deploy:
     Drag the folder to Netlify, or run:
     netlify deploy --dir=${outputDir}
   
   URL Parameters:
     ?skipGating=true  - Bypass navigation locks
     ?debug=true       - Show SCORM debug panel
`);
}
