/**
 * Project Utilities
 * 
 * Shared helpers used across multiple CLI commands and lib/ modules.
 * Single source of truth for project validation and common utilities.
 */

import crypto from 'crypto';
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

/**
 * Stable, non-reversible identifier for a course directory. The preview server
 * sends it so the MCP can tell its own project's preview from another one.
 *
 * @param {string} coursePath - Path to the course/ directory
 * @returns {string} 16 hex characters
 */
export function getCourseId(coursePath) {
    let resolved = path.resolve(coursePath);
    try {
        resolved = fs.realpathSync(resolved);
    } catch {
        // Missing directories still get a deterministic id
    }
    return crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 16);
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

/**
 * Escape a string for safe embedding in a JS template literal (backtick
 * string). Neutralizes backslashes, backticks and `${` so the text can never
 * terminate the literal or start an interpolation.
 * @param {string} str
 * @returns {string}
 */
export function escapeTemplateLiteral(str) {
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$\{/g, '\\${');
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
    '.m4a': 'audio/mp4',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.vtt': 'text/vtt',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.xml': 'application/xml',
    '.xsd': 'application/xml',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.wasm': 'application/wasm',
    '.gltf': 'model/gltf+json',
    '.glb': 'model/gltf-binary'
};

/**
 * Get MIME type for a file path based on extension.
 * @param {string} filePath
 * @returns {string}
 */
export function getMimeType(filePath) {
    return mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * Resolve a user-controlled relative path while guaranteeing that the result
 * remains inside the supplied root directory.
 *
 * @param {string} rootDir - Absolute directory that contains all allowed files
 * @param {string} relativePath - URL/path fragment supplied by a caller
 * @returns {string} Safe absolute path
 * @throws {Error} If the path is malformed or escapes rootDir
 */
export function resolveWithinRoot(rootDir, relativePath) {
    if (typeof rootDir !== 'string' || typeof relativePath !== 'string') {
        throw new Error('Root directory and relative path must be strings');
    }

    let decodedPath;
    try {
        decodedPath = decodeURIComponent(relativePath);
    } catch {
        throw new Error('Invalid URL encoding in path');
    }

    if (decodedPath.includes('\0')) {
        throw new Error('Path contains a null byte');
    }

    const root = path.resolve(rootDir);
    const resolved = path.resolve(root, decodedPath.replace(/^[/\\]+/, ''));
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        throw new Error('Path escapes the allowed root directory');
    }

    return resolved;
}

/**
 * Serialize a value as JSON that is safe to embed inside an inline <script>.
 * Escapes `<` (prevents `</script>` / `<!--` breakout) and the U+2028/U+2029
 * line terminators that older JS engines reject inside string literals.
 *
 * @param {*} value
 * @returns {string}
 */
export function jsonForScript(value) {
    const json = JSON.stringify(value);
    if (json === undefined) return 'null';
    return json
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

// =============================================================================
// REQUEST BODIES
// =============================================================================

/** Default cap for JSON request bodies on the preview server. */
export const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024;
/** Default cap for multipart uploads (assets, references). */
export const MAX_UPLOAD_BODY_BYTES = 100 * 1024 * 1024;

/**
 * Error raised when a request body exceeds its configured limit.
 * Carries `statusCode = 413` so route handlers can map it directly.
 */
export class RequestBodyTooLargeError extends Error {
    constructor(limitBytes) {
        super(`Request body exceeds the ${Math.round(limitBytes / (1024 * 1024))}MB limit`);
        this.name = 'RequestBodyTooLargeError';
        this.statusCode = 413;
    }
}

/**
 * Buffer an HTTP request body, rejecting once it exceeds `limitBytes`.
 * Extra data after the limit is drained and discarded, never buffered.
 *
 * @param {import('http').IncomingMessage} req
 * @param {number} [limitBytes=MAX_JSON_BODY_BYTES]
 * @returns {Promise<Buffer>}
 */
export function readRequestBody(req, limitBytes = MAX_JSON_BODY_BYTES) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const fail = (err) => {
            if (settled) return;
            settled = true;
            reject(err);
        };

        const declared = Number(req.headers?.['content-length']);
        if (Number.isFinite(declared) && declared > limitBytes) {
            fail(new RequestBodyTooLargeError(limitBytes));
            req.resume?.();
            return;
        }

        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            if (settled) return;
            size += chunk.length;
            if (size > limitBytes) {
                chunks.length = 0;
                fail(new RequestBodyTooLargeError(limitBytes));
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (settled) return;
            settled = true;
            resolve(Buffer.concat(chunks));
        });
        req.on('error', fail);
    });
}

/**
 * Send a 413 JSON response for an oversized request body.
 * @param {import('http').ServerResponse} res
 * @param {Error} err
 */
export function sendBodyTooLarge(res, err) {
    if (res.headersSent) return;
    res.writeHead(413, { 'Content-Type': 'application/json', 'Connection': 'close' });
    res.end(JSON.stringify({ error: err?.message || 'Request body too large' }));
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
