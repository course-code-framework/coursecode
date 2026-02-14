/**
 * Import Command
 * 
 * Imports a PowerPoint file as a CourseCode presentation course.
 * Uses PowerPoint (via AppleScript on macOS) to export slides as PNGs,
 * extracts text to markdown, and scaffolds a complete course project.
 * 
 * Also supports --slides-dir for pre-exported slide images (no PowerPoint needed).
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { create } from './create.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(__dirname, '..');

// ─── Core Logic ──────────────────────────────────────────────────────────────

/**
 * Import a PowerPoint into an existing course directory (in-place).
 * Pure logic — no process.exit(), no console output.
 * 
 * @param {string} pptxPath - Absolute path to .pptx file
 * @param {string} courseDir - Absolute path to course/ directory (e.g., /project/course)
 * @param {Object} [options]
 * @param {string} [options.slidesDir] - Pre-exported slide images directory (skips PowerPoint export)
 * @returns {Promise<{slideCount: number, sourceFile: string, textExtracted: boolean}>}
 */
export async function importInPlace(pptxPath, courseDir, options = {}) {
    const ext = path.extname(pptxPath).toLowerCase();
    if (ext !== '.pptx') {
        throw new Error('Only .pptx files are supported.');
    }
    if (!fs.existsSync(pptxPath)) {
        throw new Error(`File not found: ${pptxPath}`);
    }

    // ── Acquire slide images ────────────────────────────────────
    let pngFiles;
    let tempDir = null;

    if (options.slidesDir) {
        const slidesDir = path.resolve(options.slidesDir);
        if (!fs.existsSync(slidesDir)) {
            throw new Error(`Slides directory not found: ${slidesDir}`);
        }
        pngFiles = await findExportedPngs(slidesDir);
    } else {
        if (process.platform !== 'darwin') {
            throw new Error(
                'Automated PowerPoint export is only supported on macOS. ' +
                'Export slides to PNG manually and use the slidesDir option.'
            );
        }
        if (!detectPowerPoint()) {
            throw new Error(
                'Microsoft PowerPoint not found. ' +
                'Export slides to PNG manually and use the slidesDir option.'
            );
        }

        tempDir = path.join(PACKAGE_ROOT, '.tmp-slide-export');
        await fsp.mkdir(tempDir, { recursive: true });

        try {
            exportSlidesToPng(pptxPath, tempDir);
        } catch (error) {
            await fsp.rm(tempDir, { recursive: true, force: true });
            throw new Error(`PowerPoint export failed: ${error.message}`);
        }

        pngFiles = await findExportedPngs(tempDir);
    }

    if (pngFiles.length === 0) {
        if (tempDir) await fsp.rm(tempDir, { recursive: true, force: true });
        throw new Error('No slide images found (.png, .jpg, .jpeg).');
    }

    // ── Copy images to assets/slides/ ───────────────────────────
    const assetsDir = path.join(courseDir, 'assets', 'slides');
    await fsp.mkdir(assetsDir, { recursive: true });

    for (const png of pngFiles) {
        const imgExt = path.extname(png.name).toLowerCase();
        const destName = `slide-${String(png.num).padStart(2, '0')}${imgExt}`;
        await fsp.copyFile(png.path, path.join(assetsDir, destName));
    }

    // ── Clear existing slides ───────────────────────────────────
    const slidesDir = path.join(courseDir, 'slides');
    await fsp.mkdir(slidesDir, { recursive: true });
    const existingSlides = await fsp.readdir(slidesDir);
    for (const file of existingSlides) {
        if (file.endsWith('.html') || file.endsWith('.js')) {
            await fsp.unlink(path.join(slidesDir, file));
        }
    }

    // ── Generate slide HTML files ───────────────────────────────
    for (let i = 0; i < pngFiles.length; i++) {
        const slideNum = i + 1;
        const paddedNum = String(slideNum).padStart(2, '0');
        const imgExt = path.extname(pngFiles[i].name).toLowerCase();
        const html = generateSlideHtml(paddedNum, imgExt);
        await fsp.writeFile(
            path.join(slidesDir, `slide-${paddedNum}.html`),
            html,
            'utf-8'
        );
    }

    // ── Extract text to references ──────────────────────────────
    let textExtracted = false;
    try {
        const markdown = await extractText(pptxPath);
        if (markdown) {
            const refsDir = path.join(courseDir, 'references', 'converted');
            await fsp.mkdir(refsDir, { recursive: true });
            await fsp.writeFile(
                path.join(refsDir, `${path.basename(pptxPath, ext)}.md`),
                markdown,
                'utf-8'
            );
            textExtracted = true;
        }
    } catch {
        // Text extraction is best-effort
    }

    // ── Write course-config.js ──────────────────────────────────
    const name = path.basename(pptxPath, ext).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const configContent = generateCourseConfig(name, pngFiles.length);
    await fsp.writeFile(
        path.join(courseDir, 'course-config.js'),
        configContent,
        'utf-8'
    );

    // ── Cleanup ─────────────────────────────────────────────────
    if (tempDir) {
        await fsp.rm(tempDir, { recursive: true, force: true });
    }

    return {
        slideCount: pngFiles.length,
        sourceFile: path.basename(pptxPath),
        textExtracted
    };
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

/**
 * CLI import command — creates a new project and imports PowerPoint into it.
 */
export async function importPresentation(source, options = {}) {
    const sourcePath = path.resolve(source);
    const ext = path.extname(sourcePath).toLowerCase();

    if (ext !== '.pptx') {
        console.error('\n❌ Only .pptx files are supported.\n');
        process.exit(1);
    }

    if (!fs.existsSync(sourcePath)) {
        console.error(`\n❌ File not found: ${sourcePath}\n`);
        process.exit(1);
    }

    const name = options.name || path.basename(sourcePath, ext).toLowerCase().replace(/[^a-z0-9]+/g, '-');

    console.log(`\n📊 Importing PowerPoint: ${path.basename(sourcePath)}`);
    console.log(`   Project name: ${name}\n`);

    // Create blank project (no example slides — they'd just be deleted)
    console.log('   ⏳ Creating course project...\n');
    await create(name, { blank: true, install: options.install });

    const targetDir = path.resolve(process.cwd(), name);
    const courseDir = path.join(targetDir, 'course');

    // Import presentation in-place
    console.log('\n   ⏳ Importing presentation slides...');

    try {
        const result = await importInPlace(sourcePath, courseDir, {
            slidesDir: options.slidesDir
        });

        console.log(`   ✅ ${result.slideCount} presentation slides created`);
        if (result.textExtracted) {
            console.log('   ✅ Text extracted to markdown');
        }

        console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Presentation imported successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   ${result.slideCount} slides from "${result.sourceFile}" → "${name}/"

   Next steps:

   cd ${name}
   coursecode preview       # Preview the presentation
   coursecode build         # Build SCORM/cmi5 package

   Enhance with AI:
   - Add assessments between slides
   - Replace image slides with interactive HTML
   - Add engagement tracking requirements
   - Reference: course/references/converted/ for slide text

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
    } catch (error) {
        console.error(`\n❌ Import failed: ${error.message}\n`);
        process.exit(1);
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Check if Microsoft PowerPoint is installed (macOS)
 */
function detectPowerPoint() {
    const appPaths = [
        '/Applications/Microsoft PowerPoint.app',
        path.join(process.env.HOME, 'Applications/Microsoft PowerPoint.app')
    ];
    return appPaths.some(p => fs.existsSync(p));
}

/**
 * Export PPTX slides to PNG via AppleScript (macOS)
 */
function exportSlidesToPng(pptxPath, outputDir) {
    const script = `
tell application "Microsoft PowerPoint"
    activate
    open POSIX file "${pptxPath}"
    delay 2
    save active presentation in POSIX file "${outputDir}" as save as PNG
    close active presentation saving no
end tell
`;

    try {
        execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
            timeout: 60000,
            stdio: 'pipe'
        });
    } catch (error) {
        throw new Error(`AppleScript failed: ${error.stderr?.toString() || error.message}`);
    }
}

/**
 * Find exported image files in directory, sorted by slide number.
 * Supports PNG, JPG, JPEG.
 */
async function findExportedPngs(dir) {
    const images = [];
    const imageExts = ['.png', '.jpg', '.jpeg'];

    async function scan(scanDir) {
        const entries = await fsp.readdir(scanDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(scanDir, entry.name);
            if (entry.isDirectory()) {
                await scan(fullPath);
            } else {
                const ext = path.extname(entry.name).toLowerCase();
                if (imageExts.includes(ext)) {
                    const match = entry.name.match(/(\d+)/);
                    const num = match ? parseInt(match[1], 10) : 0;
                    images.push({ path: fullPath, name: entry.name, num });
                }
            }
        }
    }

    await scan(dir);

    // If no numbers found, assign sequential numbers by alphabetical order
    if (images.every(img => img.num === 0)) {
        images.sort((a, b) => a.name.localeCompare(b.name));
        images.forEach((img, i) => { img.num = i + 1; });
    } else {
        images.sort((a, b) => a.num - b.num);
    }

    return images;
}

/**
 * Extract text content from PPTX as markdown
 */
async function extractText(pptxPath) {
    const PptxParser = (await import('node-pptx-parser')).default;

    const parser = new PptxParser(pptxPath);
    const textContent = await parser.extractText();

    let markdown = '';
    let slideNum = 0;

    for (const slide of textContent) {
        slideNum++;
        markdown += `# Slide ${slideNum}\n\n`;

        if (slide.text && slide.text.length > 0) {
            for (const text of slide.text) {
                if (text && text.trim()) {
                    markdown += `${text.trim()}\n\n`;
                }
            }
        }

        markdown += '---\n\n';
    }

    return markdown.trim();
}

/**
 * Generate HTML for a single slide (image wrapper)
 */
function generateSlideHtml(paddedNum, imgExt = '.png') {
    return `<img src="assets/slides/slide-${paddedNum}${imgExt}" alt="Slide ${parseInt(paddedNum, 10)}" class="img-contain">
`;
}

/**
 * Generate course-config.js for presentation import
 */
function generateCourseConfig(name, slideCount) {
    const title = name
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

    const slides = [];
    for (let i = 1; i <= slideCount; i++) {
        const padded = String(i).padStart(2, '0');
        slides.push(`        { id: 'slide-${padded}', title: 'Slide ${i}', file: 'slides/slide-${padded}.html' }`);
    }

    return `/**
 * Course Configuration
 * Imported from PowerPoint presentation
 */
export const courseConfig = {
    title: '${title}',
    source: 'powerpoint-import',
    layout: 'presentation',

    navigation: {
        sidebar: { enabled: false },
        breadcrumbs: { enabled: false }
    },

    slideDefaults: {
        contentWidth: 'full'
    },

    structure: [
${slides.join(',\n')}
    ]
};
`;
}
