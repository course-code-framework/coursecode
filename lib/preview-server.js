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
import path from 'path';
import http from 'http';
import { spawn, exec } from 'child_process';
import { fileURLToPath } from 'url';

import { generateStubPlayer } from './stub-player.js';
import { generateContentHtml } from './stub-player/content-generator.js';
import { parseElements, resolveElementByPath } from './course-parser.js';
import { getComponentCatalog, getInteractionCatalog } from './authoring-api.js';
import { handleApiRoutes } from './preview-routes-api.js';
import { handleEditingRoutes } from './preview-routes-editing.js';
import { handleLmsRoutes, createLmsStore } from './preview-routes-lms.js';
import {
    validateProject, escapeHtml, getMimeType, serveFile,
    countSlides, findSlideById, collectSlideIds
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
function simpleMarkdownToHtml(md) {
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

function inlineFormat(text) {
    return escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
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



// ============================================================================
// Main Server
// ============================================================================

export async function previewServer(options = {}) {
    const frameworkDev = options.frameworkDev || false;
    const paths = validateProject({ frameworkDev });
    const title = options.title || getCourseTitle(paths.coursePath);
    const previewPort = parseInt(options.port || '4173', 10);
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

    // Resolve Vite binary — on Unix, spawn directly to avoid zombie /bin/sh
    // processes that survive when we kill the parent PID. On Windows, .cmd files
    // require shell: true (no zombie risk since Windows doesn't fork /bin/sh).
    const isWindows = process.platform === 'win32';
    const viteBin = path.join(process.cwd(), 'node_modules', '.bin', 'vite');
    const viteArgs = ['build', '--watch', '--mode', 'development', '--logLevel', 'warn'];
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
    const viteProcess = spawn(viteBin, viteArgs, {
        cwd: process.cwd(),
        stdio: ['inherit', 'pipe', 'pipe'],
        env,
        shell: isWindows
    });

    let initialBuildDone = false;

    viteProcess.stdout.on('data', (data) => {
        const output = data.toString();
        process.stdout.write(output);
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
    await new Promise((resolve) => {
        const indexPath = path.join(distDir, 'index.html');
        let attempts = 0;
        const maxAttempts = 120;

        const checkReady = setInterval(() => {
            attempts++;
            if (fs.existsSync(indexPath)) {
                clearInterval(checkReady);
                initialBuildDone = true;
                resolve();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkReady);
                console.error('⚠️  Build timeout - index.html not found');
                initialBuildDone = true;
                resolve();
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
    const stubHtml = generateStubPlayer({
        title,
        launchUrl: '/course/index.html',
        storageKey,
        password: null,
        isLive: true,
        liveReload: true,
        courseContent,
        isDesktop: options.desktop || false
    });

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

        // LMS routes (state sync + testing API)
        if (handleLmsRoutes(ctx, req, res, url)) return;

        // API routes (read-only)
        if (await handleApiRoutes(ctx, req, res, url)) return;

        // Editing routes (mutations)
        if (handleEditingRoutes(ctx, req, res, url)) return;

        // Serve stub player for root
        if (url === '/' || url === '/index.html') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(stubHtml);
            return;
        }

        // Serve files from dist/ for /course/* requests
        if (url.startsWith('/course/')) {
            const relativePath = url.slice('/course/'.length) || 'index.html';
            const filePath = path.join(distDir, relativePath);
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

                    const src = `course/assets/docs/${file}`;
                    const baseName = path.basename(file, path.extname(file));

                    let thumbnail = null;
                    for (const thumbExt of ['png', 'jpg', 'jpeg', 'webp']) {
                        const thumbFile = `${baseName}_thumbnail.${thumbExt}`;
                        if (thumbnailFiles.has(thumbFile)) {
                            thumbnail = `course/assets/docs/${thumbFile}`;
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

    const startListening = (retried = false) => {
        server.listen(previewPort, () => {
            console.log(`
✅ Preview server running!

   🎯 Open: http://localhost:${previewPort}
   
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

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE' && !retried) {
                console.warn(`\n⚠️  STALE PROCESS DETECTED — port ${previewPort} is already in use.`);
                console.warn('   Killing stale process and retrying...');
                exec(`lsof -ti :${previewPort}`, (_, stdout) => {
                    const pids = (stdout || '').trim();
                    if (pids) console.warn(`   Killed PID(s): ${pids.split('\n').join(', ')}`);
                    exec(`lsof -ti :${previewPort} | xargs kill -9 2>/dev/null`, () => {
                        setTimeout(() => {
                            server.close();
                            startListening(true);
                        }, 500);
                    });
                });
            } else if (err.code === 'EADDRINUSE') {
                console.error(`\n❌ Port ${previewPort} is still in use after retry. Kill it manually:\n   lsof -ti :${previewPort} | xargs kill -9`);
                process.exit(1);
            } else {
                throw err;
            }
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
        format: process.env.LMS_FORMAT || null
    };
    previewServer(options);
}
