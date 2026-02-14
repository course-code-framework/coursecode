/**
 * preview-export.js - Generate static preview with embedded stub LMS
 * 
 * Builds the course (unless --skip-build), then outputs a deploy-ready
 * folder with an embedded stub LMS player for sharing previews.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { parseManifest, parseCmi5Manifest, sanitizeIdentifier } from './manifest-parser.js';
import { generateStubPlayer } from './stub-player.js';
import { getContentExport } from './export-content.js';
import { validateProject } from './project-utils.js';

/**
 * Hash a password using SHA-256
 * @param {string} password - Plaintext password
 * @returns {string} - Hex-encoded SHA-256 hash
 */
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}


/**
 * Run a command and return a promise
 */
function runCommand(cmd, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd: process.cwd(),
            stdio: 'inherit',
            shell: true,
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
function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
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

    // Create output directory
    const outputPath = path.resolve(outputDir);
    if (fs.existsSync(outputPath)) {
        fs.rmSync(outputPath, { recursive: true });
    }
    fs.mkdirSync(outputPath, { recursive: true });

    // Copy course files directly to output (not in subdirectory)
    // This preserves absolute paths that Vite generates
    console.log('   Copying course files...');
    copyDirSync(distDir, outputPath);

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
    const stubPlayerSrc = path.join(process.cwd(), 'lib', 'stub-player');
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
    const playerHtml = generateStubPlayer({
        title: options.title || manifest.title,
        launchUrl: '_course.html',
        storageKey,
        passwordHash: options.password ? hashPassword(options.password) : null,
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
        ? '\n   🔒 Password protected (hashed)\n'
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
