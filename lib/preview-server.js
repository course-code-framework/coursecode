/**
 * preview-server.js - Live preview with stub LMS + Vite build watch
 * 
 * Runs Vite in build watch mode to output to dist/, then serves dist/ with
 * a stub SCORM API wrapper. Includes live reload via Server-Sent Events.
 * 
 * Supports two modes:
 * - Course project mode: expects course/ and framework/ at cwd
 * - Framework dev mode: expects template/course/ and framework/ at cwd (use --framework-dev)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

import { generateStubPlayer } from './stub-player.js';
import { encodeUriPath } from './manifest/xml-utils.js';
import { generateContentHtml } from './stub-player/content-generator.js';
import { parseElements, resolveElementByPath } from './course-parser.js';
import { getComponentCatalog, getInteractionCatalog } from './authoring-api.js';
import { handleApiRoutes } from './preview-routes-api.js';
import { handleEditingRoutes } from './preview-routes-editing.js';
import { handleLmsRoutes, createLmsStore } from './preview-routes-lms.js';
import {
    validateProject, escapeHtml, getMimeType, serveFile,
    countSlides, findSlideById, collectSlideIds, resolveWithinRoot
} from './project-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Find an element by its structural path in HTML.
 * Uses course-parser's universal element parsing for consistency across all tools.
 */
function findElementByPath(html, targetPath) {
    const elements = parseElements(html);
    return resolveElementByPath(elements, targetPath);
}



/**
 * Simple markdown-to-HTML conversion for outline display.
 */
export function simpleMarkdownToHtml(md) {
    const lines = md.split('\n');
    const html = [];
    let inCodeBlock = false;
    let inList = false;

    for (const line of lines) {
        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                html.push('</code></pre>');
                inCodeBlock = false;
            } else {
                if (inList) { html.push('</ul>'); inList = false; }
                html.push('<pre><code>');
                inCodeBlock = true;
            }
            continue;
        }
        if (inCodeBlock) {
            html.push(escapeHtml(line));
            continue;
        }

        const trimmed = line.trim();
        if (!trimmed) {
            if (inList) { html.push('</ul>'); inList = false; }
            continue;
        }

        const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
        if (headerMatch) {
            if (inList) { html.push('</ul>'); inList = false; }
            const level = headerMatch[1].length;
            html.push(`<h${level}>${inlineFormat(headerMatch[2])}</h${level}>`);
            continue;
        }

        if (trimmed.match(/^[-*]\s+/)) {
            if (!inList) { html.push('<ul>'); inList = true; }
            html.push(`<li>${inlineFormat(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
            continue;
        }

        if (trimmed.match(/^\d+\.\s+/)) {
            if (!inList) { html.push('<ul>'); inList = true; }
            html.push(`<li>${inlineFormat(trimmed.replace(/^\d+\.\s+/, ''))}</li>`);
            continue;
        }

        if (trimmed.match(/^---+$/)) {
            if (inList) { html.push('</ul>'); inList = false; }
            html.push('<hr>');
            continue;
        }

        if (inList) { html.push('</ul>'); inList = false; }
        html.push(`<p>${inlineFormat(trimmed)}</p>`);
    }

    if (inList) html.push('</ul>');
    if (inCodeBlock) html.push('</code></pre>');
    return html.join('\n');
}

/**
 * Whether a (HTML-escaped) markdown link target is safe to use as an href:
 * http(s), mailto, #anchors and scheme-less relative URLs only. Anything with
 * another scheme (javascript:, data:, vbscript:, ...) is rejected.
 */
export function isSafeMarkdownHref(href) {
    const value = String(href).trim();
    if (!value) return false;
    if (/^(https?:|mailto:)/i.test(value)) return true;
    // Reject control characters/whitespace browsers strip when parsing schemes
    if ([...value].some(ch => ch.charCodeAt(0) <= 0x20 || ch.charCodeAt(0) === 0x7f)) return false;
    // Scheme-less (relative, root-relative, ?query, #anchor): no ':' before the first / ? #
    const schemeEnd = value.search(/[/?#]/);
    const head = schemeEnd === -1 ? value : value.slice(0, schemeEnd);
    return !head.includes(':') && !value.startsWith('//');
}

function inlineFormat(text) {
    return escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        // Link text and target are already HTML-escaped above (incl. quotes),
        // so the attribute can't be broken out of; only the scheme is checked.
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => (
            isSafeMarkdownHref(href) ? `<a href="${href.trim()}">${label}</a>` : label
        ));
}

/**
 * Returns example HTML for a given component or interaction type.
 * Dynamically pulls from schema.example via catalog APIs.
 */
function getExampleHtml(type, category) {
    try {
        if (category === 'interaction') {
            const catalog = getInteractionCatalog(type);
            if (catalog.example) return catalog.example;
        } else {
            const catalog = getComponentCatalog(type);
            if (catalog.example) return catalog.example;
            if (catalog.usage) return catalog.usage;
        }
    } catch { /* ignore catalog errors */ }

    return `<div class="callout callout-info"><p>No preview available for <strong>${escapeHtml(type)}</strong>.</p></div>`;
}

/**
 * Parse multipart form-data and save uploaded files to the correct assets subdirectory.
 */
function parseAndSaveFiles(buffer, boundary, assetsDir) {
    const boundaryBuf = Buffer.from('--' + boundary);
    const uploaded = [];
    let pos = 0;

    while (pos < buffer.length) {
        const start = buffer.indexOf(boundaryBuf, pos);
        if (start === -1) break;
        const end = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
        if (end === -1) break;

        const part = buffer.slice(start + boundaryBuf.length, end);
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) { pos = end; continue; }

        const headers = part.slice(0, headerEnd).toString('utf-8');
        const filenameMatch = headers.match(/filename="([^"]+)"/);
        if (!filenameMatch) { pos = end; continue; }

        const filename = path.basename(filenameMatch[1]);
        const fileData = part.slice(headerEnd + 4, part.length - 2);

        const ext = path.extname(filename).toLowerCase();
        let subdir;
        if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif'].includes(ext)) {
            subdir = 'images';
        } else if (['.mp3', '.wav', '.ogg', '.m4a', '.aac'].includes(ext)) {
            subdir = 'audio';
        } else {
            subdir = 'docs';
        }

        const targetDir = path.join(assetsDir, subdir);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        fs.writeFileSync(path.join(targetDir, filename), fileData);
        uploaded.push({ filename, subdir });
        console.log(`   📦 Asset uploaded: ${subdir}/${filename}`);
        pos = end;
    }
    return uploaded;
}


function getCourseTitle(coursePath) {
    const configPath = path.join(coursePath, 'course-config.js');
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const match = content.match(/title:\s*['"`]([^'"`]+)['"`]/);
        return match ? match[1] : 'SCORM Course';
    } catch {
        return 'SCORM Course';
    }
}

export function requiresPreviewMutationToken(method, url) {
    return !['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase()) &&
        url.startsWith('/__') && !url.startsWith('/__lms/');
}

export function hasValidPreviewMutationToken(headers, expectedToken) {
    return Boolean(expectedToken) && headers?.['x-coursecode-preview-token'] === expectedToken;
}

export function parsePreviewPort(value = 4173) {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Preview port must be an integer between 1 and 65535, got "${value}"`);
    }
    return port;
}

// ============================================================================
// Host / Origin validation (DNS-rebinding + cross-site protection)
// ============================================================================

const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];
const WILDCARD_BIND_HOSTS = new Set(['0.0.0.0', '::', '[::]', '']);

/** Normalize a hostname for comparison (lowercase, IPv6 in brackets). */
function normalizeHostname(hostname) {
    const lower = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
    return lower.includes(':') && !lower.startsWith('[') ? `[${lower}]` : lower;
}

/**
 * Whether an address (bind host or socket remote address) is loopback.
 * @param {string} address
 */
export function isLoopbackAddress(address) {
    const value = normalizeHostname(address).replace(/^\[|\]$/g, '');
    return value === 'localhost' || value === '::1' || /^127\.\d+\.\d+\.\d+$/.test(value) ||
        /^::ffff:127\.\d+\.\d+\.\d+$/.test(value);
}

/**
 * Build the set of hostnames the preview server answers to.
 * Always loopback names; plus the explicit --host value when it isn't
 * loopback, or (for wildcard binds like 0.0.0.0) this machine's own
 * interface addresses and hostname. Arbitrary DNS names are never allowed,
 * which is what defeats DNS rebinding.
 *
 * Tunnels and port forwarders (Codespaces, ngrok, reverse proxies) present
 * their own hostname, usually on 80/443. Opt in with a comma-separated
 * COURSECODE_PREVIEW_ALLOWED_HOSTS; those names are accepted on any port.
 *
 * @param {string} [bindHost='127.0.0.1']
 * @param {object} [deps] - Injectable for tests
 * @returns {Set<string>} with an `anyPort` Set of opted-in tunnel hostnames
 */
export function buildAllowedPreviewHosts(bindHost = '127.0.0.1', deps = {}) {
    const allowed = new Set(LOOPBACK_HOSTNAMES);
    const extraHosts = deps.extraHosts ?? process.env.COURSECODE_PREVIEW_ALLOWED_HOSTS ?? '';
    allowed.anyPort = new Set(String(extraHosts).split(',').map(normalizeHostname).filter(Boolean));
    const host = normalizeHostname(bindHost);
    if (WILDCARD_BIND_HOSTS.has(host)) {
        const interfaces = (deps.networkInterfaces || os.networkInterfaces)();
        for (const entries of Object.values(interfaces || {})) {
            for (const entry of entries || []) {
                if (entry?.address) allowed.add(normalizeHostname(entry.address.split('%')[0]));
            }
        }
        const hostname = normalizeHostname((deps.hostname || os.hostname)());
        if (hostname) {
            allowed.add(hostname);
            if (!hostname.endsWith('.local') && !hostname.includes(':')) allowed.add(`${hostname}.local`);
        }
    } else if (host && !isLoopbackAddress(host)) {
        allowed.add(host);
    }
    return allowed;
}

/**
 * Parse a Host header value ("name:port", "[v6]:port", "name").
 * @returns {{ hostname: string, port: number } | null}
 */
function parseHostHeader(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const url = new URL(`http://${value.trim()}`);
        if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
        return { hostname: normalizeHostname(url.hostname), port: url.port ? Number(url.port) : 80 };
    } catch {
        return null;
    }
}

/**
 * Whether a Host header names this preview server.
 * @param {string} hostHeader
 * @param {Set<string>} allowedHosts
 * @param {number} port - Port the server listens on
 */
export function isAllowedPreviewHost(hostHeader, allowedHosts, port) {
    const parsed = parseHostHeader(hostHeader);
    if (!parsed) return false;
    if (allowedHosts.anyPort?.has(parsed.hostname)) return true;
    return parsed.port === Number(port) && allowedHosts.has(parsed.hostname);
}

/**
 * Whether an Origin header belongs to this preview server.
 * @param {string} origin
 * @param {Set<string>} allowedHosts
 * @param {number} port
 */
export function isAllowedPreviewOrigin(origin, allowedHosts, port) {
    if (typeof origin !== 'string') return false;
    let url;
    try {
        url = new URL(origin);
    } catch {
        return false; // includes the opaque "null" origin
    }
    if (allowedHosts.anyPort?.has(normalizeHostname(url.hostname))) return true;
    if (url.protocol !== 'http:') return false;
    return isAllowedPreviewHost(url.host, allowedHosts, port);
}

/**
 * Validate Host (every request) and Origin (state-changing requests) before
 * any route runs. Rejects with 403 and returns false when not allowed.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {{ allowedHosts: Set<string>, port: number }} options
 * @returns {boolean} true if the request may proceed
 */
export function checkPreviewRequestOrigin(req, res, { allowedHosts, port }) {
    const reject = (message) => {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
        return false;
    };

    if (!isAllowedPreviewHost(req.headers.host, allowedHosts, port)) {
        return reject('Host not allowed. Open the preview via http://localhost:' + port +
            ' (or list this hostname in COURSECODE_PREVIEW_ALLOWED_HOSTS).');
    }

    const method = String(req.method || 'GET').toUpperCase();
    const isStateChanging = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const origin = req.headers.origin;
    if (isStateChanging && origin !== undefined && !isAllowedPreviewOrigin(origin, allowedHosts, port)) {
        return reject('Cross-origin request not allowed');
    }
    return true;
}

/**
 * Resolve how to launch Vite without a shell: run its JS entry with the
 * current Node binary. Avoids `.bin/vite(.cmd)` + `shell: true`, which breaks
 * on Windows when the project path contains spaces.
 *
 * @param {string} cwd - Project root
 * @returns {{ command: string, args: string[] }}
 */
export function resolveViteCommand(cwd) {
    let viteEntry = path.join(cwd, 'node_modules', 'vite', 'bin', 'vite.js');
    try {
        const require = createRequire(path.join(cwd, 'package.json'));
        const pkgPath = require.resolve('vite/package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.vite;
        if (bin) viteEntry = path.join(path.dirname(pkgPath), bin);
    } catch {
        // Fall back to the conventional location
    }
    return { command: process.execPath, args: [viteEntry] };
}



// ============================================================================
// Main Server
// ============================================================================

export async function previewServer(options = {}) {
    const frameworkDev = options.frameworkDev || false;
    const paths = validateProject({ frameworkDev });
    const title = options.title || getCourseTitle(paths.coursePath);
    const previewPort = parsePreviewPort(options.port ?? 4173);
    const previewHost = options.host || '127.0.0.1';
    const allowedHosts = buildAllowedPreviewHosts(previewHost);
    const exposedToNetwork = !isLoopbackAddress(previewHost);
    const previewToken = crypto.randomBytes(32).toString('base64url');
    const distDir = path.join(process.cwd(), 'dist');

    console.log('\n🚀 Starting preview server...');
    console.log(`   📂 Course: ${paths.coursePath}`);
    console.log(`   🔨 Build output: ${distDir}`);

    // Build tracking state
    const buildState = {
        errors: [],
        warnings: [],
        lastBuildTime: null,
        lastBuildSuccess: false
    };

    const sseClients = new Set();
    const broadcastReload = () => {
        for (const client of sseClients) {
            client.write('data: reload\n\n');
        }
    };

    // Resolve Vite's JS entry and run it with the current Node binary, without
    // a shell: no zombie /bin/sh on Unix, and no .cmd/shell quoting issues on
    // Windows when the project path contains spaces.
    const vite = resolveViteCommand(process.cwd());
    const viteArgs = [...vite.args, 'build', '--watch', '--mode', 'development', '--logLevel', 'warn'];
    if (paths.viteConfig) {
        viteArgs.push('--config', paths.viteConfig);
    }

    const env = { ...process.env };
    // Expose lib dir so vite.config.js can resolve coursecode utilities
    // even when npm link + Vite's .vite-temp copy breaks normal resolution
    env.COURSECODE_LIB_DIR = __dirname;
    // Signal to framework code that this is a local dev build.
    // Vite auto-exposes VITE_* env vars to client code via import.meta.env.
    // Reporters check this to suppress external reporting locally.
    env.VITE_COURSECODE_LOCAL = 'true';
    // process.execPath is the Electron binary when embedded in the desktop
    // app; make sure it runs Vite as plain Node.
    if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
    if (options.format) {
        const previewFormat = options.format.replace(/-proxy$|-remote$/, '');
        env.LMS_FORMAT = previewFormat;
        if (previewFormat !== options.format) {
            console.log(`   📦 Format: ${options.format} → ${previewFormat} (preview mode)\n`);
        } else {
            console.log(`   📦 Format override: ${options.format}\n`);
        }
    }

    // Start Vite build in watch mode
    const viteProcess = spawn(vite.command, viteArgs, {
        cwd: process.cwd(),
        stdio: ['inherit', 'pipe', 'pipe'],
        env,
        shell: false
    });

    let initialBuildDone = false;
    let viteSpawnError = null;

    viteProcess.on('error', (error) => {
        viteSpawnError = error;
        buildState.lastBuildSuccess = false;
        buildState.errors.push({
            type: 'build',
            message: `Failed to start Vite: ${error.message}`,
            time: new Date().toISOString()
        });
    });

    viteProcess.stdout.on('data', (data) => {
        const output = data.toString();
        process.stdout.write(output);
        if (output.includes('Building...')) {
            buildState.errors = [];
            buildState.warnings = [];
            buildState.lastBuildSuccess = false;
        }
        if (output.includes('Build complete')) {
            buildState.lastBuildTime = new Date().toISOString();
            buildState.lastBuildSuccess = true;
            buildState.errors = [];
            if (initialBuildDone) {
                broadcastReload();
            }
        }
        if (output.includes('warning') || output.includes('Warning')) {
            const lines = output.split('\n').filter(l => l.includes('warning') || l.includes('Warning'));
            for (const line of lines) {
                if (!buildState.warnings.some(w => w.message === line.trim())) {
                    buildState.warnings.push({ type: 'warning', message: line.trim(), time: new Date().toISOString() });
                }
            }
            if (buildState.warnings.length > 20) buildState.warnings = buildState.warnings.slice(-20);
        }
    });

    viteProcess.stderr.on('data', (data) => {
        const output = data.toString();
        process.stderr.write(output);
        if (output.includes('error') || output.includes('Error') || output.includes('ERROR')) {
            buildState.lastBuildSuccess = false;
            buildState.errors.push({
                type: 'build',
                message: output.trim(),
                time: new Date().toISOString()
            });
            if (buildState.errors.length > 10) buildState.errors = buildState.errors.slice(-10);
        }
    });

    // Wait for initial build
    await new Promise((resolve, reject) => {
        const indexPath = path.join(distDir, 'index.html');
        let attempts = 0;
        const maxAttempts = 120;

        const checkReady = setInterval(() => {
            attempts++;
            if (viteSpawnError) {
                clearInterval(checkReady);
                reject(new Error(`Preview build could not start: ${viteSpawnError.message}`));
            } else if (buildState.lastBuildSuccess && fs.existsSync(indexPath)) {
                clearInterval(checkReady);
                initialBuildDone = true;
                resolve();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkReady);
                viteProcess.kill();
                reject(new Error('Preview build timed out before a fresh index.html was produced'));
            }
        }, 500);
    });

    // Generate course content HTML
    let courseContent = null;
    if (options.content !== false) {
        console.log('   Generating course content for viewer...');
        courseContent = await generateContentHtml({
            coursePath: paths.coursePath,
            includeNarration: true
        });
    }

    // Generate stub player HTML
    const storageKey = frameworkDev ? 'scorm_framework_dev' : 'scorm_preview_live';
    const stubConfig = {
        title,
        launchUrl: '/course/index.html',
        storageKey,
        password: null,
        isLive: true,
        liveReload: true,
        courseContent,
        isDesktop: options.desktop || false
    };
    const stubHtml = generateStubPlayer({ ...stubConfig, previewToken });
    // Clients connecting from another machine (only possible with a
    // non-loopback --host) get a page without the write token: they can view
    // the preview but cannot modify course source files.
    const remoteStubHtml = exposedToNetwork ? generateStubPlayer({ ...stubConfig, previewToken: null }) : null;

    // Shared context object passed to route modules
    const ctx = {
        paths,
        distDir,
        buildState,
        sseClients,
        broadcastReload,
        lmsStore: createLmsStore(),
        getMimeType,
        findSlideById,
        countSlides,
        collectSlideIds,
        simpleMarkdownToHtml,
        getExampleHtml,
        parseAndSaveFiles,
        serveFile,
        findElementByPath
    };

    // Create HTTP server and dispatch routes
    const server = http.createServer(async (req, res) => {
        const url = req.url.split('?')[0];

        // Marker so tools (MCP headless browser) can tell this is a CourseCode preview
        res.setHeader('X-CourseCode-Preview', '1');

        // Reject DNS-rebinding (foreign Host) and cross-site state-changing
        // requests (foreign Origin) before any route runs.
        if (!checkPreviewRequestOrigin(req, res, { allowedHosts, port: previewPort })) return;

        // All source/file mutations require a per-process capability token.
        // LMS state synchronization is intentionally exempt: it only touches
        // the in-memory test store and is used directly by E2E helpers.
        const isMutation = requiresPreviewMutationToken(req.method, url);
        if (isMutation && !hasValidPreviewMutationToken(req.headers, previewToken)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid or missing preview mutation token' }));
            return;
        }

        // LMS routes (state sync + testing API)
        if (handleLmsRoutes(ctx, req, res, url)) return;

        // API routes (read-only)
        if (await handleApiRoutes(ctx, req, res, url)) return;

        // Editing routes (mutations)
        if (handleEditingRoutes(ctx, req, res, url)) return;

        // Serve stub player for root
        if (url === '/' || url === '/index.html') {
            const isLocalClient = isLoopbackAddress(req.socket?.remoteAddress || '');
            res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
            res.end(isLocalClient || !remoteStubHtml ? stubHtml : remoteStubHtml);
            return;
        }

        // Serve files from dist/ for /course/* requests
        if (url.startsWith('/course/')) {
            const relativePath = url.slice('/course/'.length) || 'index.html';
            let filePath;
            try {
                filePath = resolveWithinRoot(distDir, relativePath);
            } catch {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }
            serveFile(filePath, res);
            return;
        }

        if (url === '/course') {
            const filePath = path.join(distDir, 'index.html');
            serveFile(filePath, res);
            return;
        }

        // Serve _content-manifest.json from dist/
        if (url === '/_content-manifest.json') {
            const filePath = path.join(distDir, '_content-manifest.json');
            serveFile(filePath, res);
            return;
        }

        // Serve _gallery-manifest.json (generated on-the-fly in dev mode)
        if (url === '/_gallery-manifest.json' || url === '/course/_gallery-manifest.json') {
            const staticPath = path.join(distDir, '_gallery-manifest.json');
            if (fs.existsSync(staticPath)) {
                serveFile(staticPath, res);
                return;
            }

            try {
                const docsDir = path.join(paths.coursePath, 'assets', 'docs');
                if (!fs.existsSync(docsDir)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ items: [] }));
                    return;
                }

                const files = fs.readdirSync(docsDir);
                const thumbnailFiles = new Set(
                    files.filter(f => f.match(/_thumbnail\.(png|jpg|jpeg|webp)$/i))
                );

                const allowedTypes = new Set(['pdf', 'md', 'jpg', 'png']);
                const items = [];

                for (const file of files) {
                    if (file.startsWith('.')) continue;
                    if (file.match(/_thumbnail\.(png|jpg|jpeg|webp)$/i)) continue;

                    const ext = path.extname(file).slice(1).toLowerCase();
                    if (!allowedTypes.has(ext)) continue;

                    let type;
                    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
                        type = 'image';
                    } else if (ext === 'pdf') {
                        type = 'pdf';
                    } else if (ext === 'md') {
                        type = 'markdown';
                    } else {
                        type = 'file';
                    }

                    const src = encodeUriPath(`course/assets/docs/${file}`);
                    const baseName = path.basename(file, path.extname(file));

                    let thumbnail = null;
                    for (const thumbExt of ['png', 'jpg', 'jpeg', 'webp']) {
                        const thumbFile = `${baseName}_thumbnail.${thumbExt}`;
                        if (thumbnailFiles.has(thumbFile)) {
                            thumbnail = encodeUriPath(`course/assets/docs/${thumbFile}`);
                            break;
                        }
                    }

                    const label = baseName
                        .replace(/[_-]/g, ' ')
                        .replace(/\b\w/g, c => c.toUpperCase());

                    items.push({ src, type, label, ...(thumbnail ? { thumbnail } : {}) });
                }

                items.sort((a, b) => a.label.localeCompare(b.label));

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ items }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
            return;
        }

        // 404 for everything else
        res.writeHead(404);
        res.end('Not found');
    });

    const contentNote = options.content !== false ? '   • Content viewer (📄 button in toolbar)\n' : '';

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\n❌ Port ${previewPort} is already in use. Stop that process or choose another port with --port.`);
            viteProcess.kill();
            process.exitCode = 1;
            return;
        }
        throw err;
    });

    const startListening = () => {
        server.listen(previewPort, previewHost, () => {
            const displayHost = previewHost === '127.0.0.1' ? 'localhost' : previewHost;
            if (exposedToNetwork) {
                console.warn(`
⚠️  WARNING: preview is bound to ${previewHost}, which is reachable from other machines
   on your network. Anyone who can reach this address can view the course and its
   source (references, answers). Source editing is only enabled for pages opened
   from this machine via http://localhost:${previewPort}. Use the default
   --host 127.0.0.1 unless you need LAN access.`);
            }
            console.log(`
✅ Preview server running!

   🎯 Open: http://${displayHost}:${previewPort}
   🔒 Bound to: ${previewHost}
   
   Features:
   • Live reload - browser updates automatically on rebuild
   • Auto-rebuild on file changes (watch mode)
   • Stub SCORM API with localStorage persistence
   • Debug panel with API log and validation
   • MCP automation bridge (coursecode mcp)
${contentNote}   
   URL Parameters:
   • ?skipGating=true  - Bypass navigation locks
   • ?debug=true       - Open debug panel on load
   
   Press Ctrl+C to stop
`);
        });
    };

    startListening();

    // Handle cleanup
    const cleanup = () => {
        console.log('\n\nShutting down...');
        viteProcess.kill();
        server.close();
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    viteProcess.on('close', (code) => {
        if (code !== 0 && code !== null) {
            console.error(`Vite process exited with code ${code}`);
            server.close();
            process.exit(1);
        }
    });
}

// CLI entry point - allows running directly: node lib/preview-server.js [--framework-dev]
if (process.argv[1] && process.argv[1].endsWith('preview-server.js')) {
    const args = process.argv.slice(2);
    const options = {
        frameworkDev: args.includes('--framework-dev'),
        port: args.find(a => a.startsWith('--port='))?.split('=')[1] || '4173',
        host: args.find(a => a.startsWith('--host='))?.split('=')[1] || '127.0.0.1',
        format: process.env.LMS_FORMAT || null
    };
    previewServer(options);
}
