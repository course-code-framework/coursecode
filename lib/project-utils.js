/**
 * Project Utilities
 * 
 * Shared helpers used across multiple CLI commands and lib/ modules.
 * Single source of truth for project validation and common utilities.
 */

import fs from 'fs';
import path from 'path';

// =============================================================================
// PROJECT VALIDATION
// =============================================================================

/**
 * Validate that the current working directory is a valid CourseCode project.
 * Consolidates 6 former copies into one with options.
 * 
 * @param {Object} [options={}]
 * @param {boolean} [options.frameworkDev=false] - Expect framework repo layout
 * @param {boolean} [options.warnMissingRc=false] - Warn if .coursecoderc.json is missing
 * @returns {{ coursePath: string, viteConfig: string|null }} Resolved paths
 */
export function validateProject(options = {}) {
    const { frameworkDev = false, warnMissingRc = false } = options;
    const cwd = process.cwd();

    if (frameworkDev) {
        const hasTemplateCourse = fs.existsSync(path.join(cwd, 'template', 'course'));
        const hasFrameworkDir = fs.existsSync(path.join(cwd, 'framework'));
        const hasViteDevConfig = fs.existsSync(path.join(cwd, 'vite.framework-dev.config.js'));

        if (!hasTemplateCourse || !hasFrameworkDir || !hasViteDevConfig) {
            console.error(`
❌ Not a valid CourseCode framework repository.

   Missing required paths:
   ${!hasTemplateCourse ? '   - template/course/' : ''}
   ${!hasFrameworkDir ? '   - framework/' : ''}
   ${!hasViteDevConfig ? '   - vite.framework-dev.config.js' : ''}

   Run this command from the framework source repository root.
`);
            process.exit(1);
        }

        return {
            coursePath: path.join(cwd, 'template', 'course'),
            viteConfig: 'vite.framework-dev.config.js'
        };
    }

    const hasCourseDir = fs.existsSync(path.join(cwd, 'course'));
    const hasFrameworkDir = fs.existsSync(path.join(cwd, 'framework'));

    if (!hasCourseDir || !hasFrameworkDir) {
        // Detect framework repo for helpful error message
        const isFrameworkRepo = fs.existsSync(path.join(cwd, 'lib', 'preview-server.js')) &&
            fs.existsSync(path.join(cwd, 'template', 'course'));

        if (isFrameworkRepo) {
            console.error(`
❌ Detected framework source repository.

   Use --framework-dev flag to run in framework development mode:
   
   coursecode preview --framework-dev
`);
        } else {
            console.error(`
❌ Not a valid CourseCode project directory.

   Missing required directories:
   ${!hasCourseDir ? '   - course/' : ''}
   ${!hasFrameworkDir ? '   - framework/' : ''}

   Run this command from a CourseCode project root, or create a new project:
   
   coursecode create my-course
`);
        }
        process.exit(1);
    }

    if (warnMissingRc && !fs.existsSync(path.join(cwd, '.coursecoderc.json'))) {
        console.warn(`
⚠️  No .coursecoderc.json found. This project may not have been created with the CourseCode CLI.
   Framework upgrades may not work correctly.
`);
    }

    return {
        coursePath: path.join(cwd, 'course'),
        viteConfig: null
    };
}

/**
 * Validate that a specific course path contains a course-config.js.
 * Used by export-content which takes an explicit path rather than using cwd.
 * 
 * @param {string} coursePath - Path to course directory (absolute or relative)
 * @param {Object} [options={}]
 * @param {boolean} [options.silent=false] - Return null instead of exiting on error
 * @returns {string|null} Resolved absolute path, or null if silent and invalid
 */
export function validateCoursePath(coursePath, options = {}) {
    const { silent = false } = options;
    const cwd = process.cwd();
    const fullCoursePath = path.isAbsolute(coursePath) ? coursePath : path.join(cwd, coursePath);

    if (!fs.existsSync(path.join(fullCoursePath, 'course-config.js'))) {
        if (silent) return null;
        console.error(`
❌ Could not find course-config.js in ${fullCoursePath}

   Make sure you're running this command from a CourseCode project root,
   or specify the correct path with --course-path.
`);
        process.exit(1);
    }

    return fullCoursePath;
}

// =============================================================================
// HTML UTILITIES
// =============================================================================

/**
 * Escape HTML special characters in a string.
 * @param {string} str - Input string
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// =============================================================================
// MIME TYPES
// =============================================================================

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.xml': 'application/xml',
    '.xsd': 'application/xml',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip'
};

/**
 * Get MIME type for a file path based on extension.
 * @param {string} filePath
 * @returns {string}
 */
export function getMimeType(filePath) {
    return mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

// =============================================================================
// FILE SERVING
// =============================================================================

/**
 * Serve a static file over HTTP with proper Content-Type and Content-Length.
 * @param {string} filePath - Absolute path to file
 * @param {import('http').ServerResponse} res
 */
export function serveFile(filePath, res) {
    fs.stat(filePath, (statErr, stats) => {
        if (statErr) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            res.writeHead(200, {
                'Content-Type': getMimeType(filePath),
                'Content-Length': stats.size,
                'Accept-Ranges': 'bytes'
            });
            res.end(data);
        });
    });
}

// =============================================================================
// COURSE STRUCTURE HELPERS
// =============================================================================

/**
 * Count total slides in a course structure (including nested sections).
 * @param {Array} items - Structure array
 * @returns {number}
 */
export function countSlides(items) {
    let count = 0;
    for (const item of items) {
        if (item.type === 'slide' || item.type === 'assessment') {
            count++;
        } else if (item.children) {
            count += countSlides(item.children);
        }
    }
    return count;
}

/**
 * Find a slide by ID in a nested structure.
 * @param {Array} items - Structure array
 * @param {string} id - Slide ID to find
 * @returns {object|null}
 */
export function findSlideById(items, id) {
    for (const item of items) {
        if (item.id === id) return item;
        if (item.children) {
            const found = findSlideById(item.children, id);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Collect all slide IDs from a nested structure into a flat array.
 * @param {Array} items - Structure array
 * @returns {Array<{id: string, title: string, type: string}>}
 */
export function collectSlideIds(items) {
    const slides = [];
    for (const item of items) {
        if (item.type === 'slide' || item.type === 'assessment') {
            slides.push({ id: item.id, title: item.title || item.id, type: item.type });
        }
        if (item.children) {
            slides.push(...collectSlideIds(item.children));
        }
    }
    return slides;
}
