/**
 * @file preview-routes-api.js
 * Read-only API routes for the preview server.
 * Handles config, theme, stage, outline, refs, catalog, assessments,
 * content, component preview, stub-player assets, SSE, and MCP endpoints.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { generateContentHtml } from './stub-player/content-generator.js';
import { parseCourse } from './course-parser.js';
import { getComponentCatalog, getInteractionCatalog, getIconCatalog, getWorkflowStatus, getRefsStatus, buildCourse } from './authoring-api.js';
import { getAllIcons, getAllSchemas } from './schema-extractor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {Object} ctx - Shared server context
 * @param {Object} ctx.paths - { coursePath, viteConfig }
 * @param {string} ctx.distDir - Path to dist/
 * @param {Object} ctx.buildState - { errors, warnings, lastBuildTime, lastBuildSuccess }
 * @param {Set} ctx.sseClients - SSE client connections
 * @param {Function} ctx.getMimeType - MIME type resolver
 * @param {Function} ctx.findSlideById - Locate slide in structure
 * @param {Function} ctx.countSlides - Count total slides
 * @param {Function} ctx.collectSlideIds - Get all slide IDs
 * @param {Function} ctx.simpleMarkdownToHtml - Markdown converter
 * @param {Function} ctx.getExampleHtml - Component example HTML
 * @param {Function} ctx.parseAndSaveFiles - Multipart file parser
 * @param {Function} ctx.serveFile - Static file serving
 */
export async function handleApiRoutes(ctx, req, res, url) {
    const { paths, distDir, buildState, sseClients } = ctx;

    const hasRichAssessmentQuestions = (assessments = []) => {
        for (const assessment of assessments) {
            const firstQuestion = assessment?.questions?.[0];
            if (!firstQuestion) continue;
            const keys = Object.keys(firstQuestion);
            if (keys.some(k => !['id', 'type', 'slideId'].includes(k))) {
                return true;
            }
        }
        return false;
    };

    // SSE endpoint for live reload
    if (url === '/__reload') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        res.write('data: connected\n\n');
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return true;
    }

    // MCP endpoint for build errors and warnings
    if (url === '/__mcp/errors') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify(buildState, null, 2));
        return true;
    }

    // Refresh course content HTML
    if (url === '/__content') {
        generateContentHtml({ coursePath: paths.coursePath, includeNarration: true })
            .then(freshContent => {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
                res.end(freshContent || '');
            })
            .catch(err => {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error generating content: ' + err.message);
            });
        return true;
    }

    // Full page content view
    if (url === '/__content-view') {
        generateContentHtml({ coursePath: paths.coursePath, includeNarration: true })
            .then(freshContent => {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
                res.end(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Course Content Review</title>
    <link rel="stylesheet" href="/__stub-player/styles.css">
    <style>
        body { 
            padding: 40px; 
            max-width: 900px; 
            margin: 0 auto; 
            font-family: system-ui, -apple-system, sans-serif;
            line-height: 1.6;
        }
        @media print {
            body { padding: 20px; }
        }
    </style>
</head>
<body>
    ${freshContent || '<p>No content available</p>'}
</body>
</html>`);
            })
            .catch(err => {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error generating content view: ' + err.message);
            });
        return true;
    }

    // Course config as JSON
    if (url === '/__config') {
        (async () => {
            try {
                const configPath = path.join(paths.coursePath, 'course-config.js');
                const configUrl = `${pathToFileURL(configPath).href}?t=${Date.now()}`;
                const configModule = await import(configUrl);
                const config = configModule.courseConfig || configModule.default;

                const editableConfig = {
                    metadata: config.metadata || {},
                    format: config.format || 'cmi5',
                    layout: config.layout,
                    slideDefaults: config.slideDefaults || {},
                    navigation: {
                        sidebar: config.navigation?.sidebar || {},
                        breadcrumbs: config.navigation?.breadcrumbs || {}
                    },
                    features: config.features || {},
                    scoring: config.scoring || null,
                    support: config.support || {},
                    completion: config.completion || {},
                    environment: config.environment || {},
                    objectives: config.objectives || [],
                    objectiveIds: (config.objectives || []).map(o => ({ id: o.id, description: o.description })),
                    slideIds: ctx.collectSlideIds(config.structure || []),
                    slideCount: ctx.countSlides(config.structure || [])
                };

                res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
                res.end(JSON.stringify(editableConfig, null, 2));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        })();
        return true;
    }

    // Theme palette colors
    if (url === '/__theme') {
        try {
            const paletteTokens = [
                { name: '--palette-gray', label: 'Gray', hint: 'Neutral scale' },
                { name: '--palette-blue', label: 'Blue', hint: 'Primary color' },
                { name: '--palette-blue-light', label: 'Blue Light', hint: 'Info states' },
                { name: '--palette-green', label: 'Green', hint: 'Success states' },
                { name: '--palette-yellow', label: 'Yellow', hint: 'Accent/warnings' },
                { name: '--palette-orange', label: 'Orange', hint: 'Secondary color' },
                { name: '--palette-red', label: 'Red', hint: 'Error/vibrant' }
            ];

            const tokensPath = path.join(process.cwd(), 'framework', 'css', 'design-tokens.css');
            const tokensContent = fs.readFileSync(tokensPath, 'utf-8');
            const themePath = path.join(paths.coursePath, 'theme.css');
            const themeContent = fs.existsSync(themePath) ? fs.readFileSync(themePath, 'utf-8') : '';

            const extractValue = (content, varName) => {
                // Strip CSS block comments so we don't match commented-out values
                const uncommented = content.replace(/\/\*[\s\S]*?\*\//g, '');
                const regex = new RegExp(`${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*([^;]+);`);
                const match = uncommented.match(regex);
                return match ? match[1].trim().split(/\s+/)[0] : null;
            };

            const tokens = paletteTokens.map(token => ({
                name: token.name,
                label: token.label,
                hint: token.hint,
                default: extractValue(tokensContent, token.name),
                override: extractValue(themeContent, token.name),
                get current() { return this.override || this.default; }
            }));

            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
            res.end(JSON.stringify({ tokens }, null, 2));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return true;
    }

    // Slide config by ID
    if (url.startsWith('/__slide-config/')) {
        const slideId = url.slice('/__slide-config/'.length);
        (async () => {
            try {
                const configPath = path.join(paths.coursePath, 'course-config.js');
                const configUrl = `${pathToFileURL(configPath).href}?t=${Date.now()}`;
                const configModule = await import(configUrl);
                const config = configModule.courseConfig || configModule.default;

                const slide = ctx.findSlideById(config.structure || [], slideId);
                if (!slide) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Slide not found: ${slideId}` }));
                    return;
                }

                res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
                res.end(JSON.stringify(slide, null, 2));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        })();
        return true;
    }

    // Assessments from build manifest
    if (url === '/__assessments') {
        try {
            const manifestPath = path.join(distDir, '_content-manifest.json');
            if (!fs.existsSync(manifestPath)) {
                const parsedCourse = await parseCourse(paths.coursePath);
                res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
                res.end(JSON.stringify({ assessments: parsedCourse.assessments || [] }));
                return true;
            }
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            let assessments = manifest.assessments || [];

            // Backward compatibility: older manifests only stored {id,type,slideId} for questions.
            if (!hasRichAssessmentQuestions(assessments)) {
                const parsedCourse = await parseCourse(paths.coursePath);
                assessments = parsedCourse.assessments || [];
            }

            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
            res.end(JSON.stringify({ assessments }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return true;
    }

    // Interaction schemas for editor rendering
    if (url === '/__interaction-schemas') {
        try {
            const schemas = getAllSchemas();
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
            res.end(JSON.stringify({ schemas }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return true;
    }

    // Component/Interaction preview
    if (url.startsWith('/__component-preview')) {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const type = params.get('type');
        const category = params.get('category') || 'component';

        if (!type) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing ?type= parameter');
            return true;
        }

        const exampleHtml = ctx.getExampleHtml(type, category);
        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/course/assets/main.css">
  <style>
    html, body { margin: 0; padding: 0; background: #fff; font-family: system-ui, sans-serif; }
    .preview-wrap { padding: 24px; max-width: 100%; overflow: hidden; }
    .preview-wrap > *:first-child { margin-top: 0; }
  </style>
</head>
<body>
  <div class="preview-wrap">
    ${exampleHtml}
  </div>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
        res.end(html);
        return true;
    }

    // Stage detection
    if (url === '/__stage') {
        getWorkflowStatus()
            .then(status => {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
                res.end(JSON.stringify({
                    stage: status.stage,
                    stageNumber: status.stageNumber,
                    checklist: status.checklist,
                    nextAction: status.nextAction,
                    message: status.message
                }));
            })
            .catch(err => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            });
        return true;
    }

    // Outline (COURSE_OUTLINE.md)
    if (url === '/__outline') {
        try {
            const outlinePath = path.join(paths.coursePath, 'COURSE_OUTLINE.md');
            if (!fs.existsSync(outlinePath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No COURSE_OUTLINE.md found' }));
                return true;
            }
            const raw = fs.readFileSync(outlinePath, 'utf-8');
            const html = ctx.simpleMarkdownToHtml(raw);
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
            res.end(JSON.stringify({ raw, html, path: outlinePath }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return true;
    }

    // Reference document status
    if (url === '/__refs') {
        try {
            const refs = getRefsStatus();
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
            res.end(JSON.stringify(refs));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return true;
    }

    // Component/Interaction/Assets catalog
    if (url === '/__catalog') {
        try {
            const componentData = getComponentCatalog();
            const interactionData = getInteractionCatalog();
            const iconData = getIconCatalog();

            // Build icon map for the gallery (category -> names + SVG content)
            const iconsByCategory = iconData.icons || {};
            // Attach SVG content as a separate _svgs map for rendering
            const allIcons = getAllIcons();
            const svgs = {};
            for (const names of Object.values(iconsByCategory)) {
                for (const name of names) {
                    if (allIcons[name]) svgs[name] = allIcons[name].svg;
                }
            }
            iconsByCategory._svgs = svgs;

            const assetsDir = path.join(paths.coursePath, 'assets');
            const groups = {};
            let totalFiles = 0;

            if (fs.existsSync(assetsDir)) {
                const subdirs = fs.readdirSync(assetsDir, { withFileTypes: true });
                for (const entry of subdirs) {
                    if (entry.isDirectory()) {
                        const subFiles = fs.readdirSync(path.join(assetsDir, entry.name))
                            .filter(f => !f.startsWith('.'));
                        groups[entry.name] = subFiles;
                        totalFiles += subFiles.length;
                    } else if (!entry.name.startsWith('.')) {
                        if (!groups['other']) groups['other'] = [];
                        groups['other'].push(entry.name);
                        totalFiles++;
                    }
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
            res.end(JSON.stringify({
                components: componentData.components || {},
                interactions: interactionData.interactions || {},
                icons: iconsByCategory,
                assets: { groups, totalFiles }
            }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return true;
    }

    // Asset upload
    if (url === '/__assets-upload' && req.method === 'POST') {
        const assetsDir = path.join(paths.coursePath, 'assets');
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(.+)/);

        if (!boundaryMatch) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing multipart boundary' }));
            return true;
        }

        const boundary = boundaryMatch[1];
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            try {
                const buffer = Buffer.concat(chunks);
                const uploaded = ctx.parseAndSaveFiles(buffer, boundary, assetsDir);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, uploaded }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return true;
    }

    // Convert reference files to markdown
    if (url.startsWith('/__refs-convert') && req.method === 'POST') {
        (async () => {
            try {
                const params = new URL(req.url, 'http://localhost').searchParams;
                const overwrite = params.get('overwrite') !== 'false';
                const source = path.join(paths.coursePath, 'references');
                const output = path.join(paths.coursePath, 'references', 'converted');

                const { convert } = await import('./convert.js');

                // Capture console output
                const logs = [];
                const origLog = console.log;
                const origErr = console.error;
                console.log = (...args) => logs.push(args.join(' '));
                console.error = (...args) => logs.push(args.join(' '));

                try {
                    await convert(source, { output, overwrite });
                } finally {
                    console.log = origLog;
                    console.error = origErr;
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, logs }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        })();
        return true;
    }

    // Upload reference files (save directly to course/references/, no subdirs)
    if (url === '/__refs-upload' && req.method === 'POST') {
        const refsDir = path.join(paths.coursePath, 'references');
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(.+)/);

        if (!boundaryMatch) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing multipart boundary' }));
            return true;
        }

        const boundary = boundaryMatch[1];
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            try {
                if (!fs.existsSync(refsDir)) fs.mkdirSync(refsDir, { recursive: true });

                const buffer = Buffer.concat(chunks);
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

                    fs.writeFileSync(path.join(refsDir, filename), fileData);
                    uploaded.push(filename);
                    console.log(`   📄 Reference uploaded: ${filename}`);
                    pos = end;
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, uploaded }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return true;
    }

    // PowerPoint import (in-place into current project)
    if (url === '/__import' && req.method === 'POST') {
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(.+)/);

        if (!boundaryMatch) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing multipart boundary' }));
            return true;
        }

        const boundary = boundaryMatch[1];
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', async () => {
            try {
                const buffer = Buffer.concat(chunks);
                const boundaryBuf = Buffer.from('--' + boundary);

                // Extract the .pptx file from multipart body
                let pptxData = null;
                let pptxName = 'import.pptx';
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
                    if (filenameMatch && filenameMatch[1].toLowerCase().endsWith('.pptx')) {
                        pptxName = path.basename(filenameMatch[1]);
                        pptxData = part.slice(headerEnd + 4, part.length - 2);
                    }
                    pos = end;
                }

                if (!pptxData) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No .pptx file found in upload' }));
                    return;
                }

                // Save to temp file
                const tempPath = path.join(os.tmpdir(), `coursecode-import-${Date.now()}-${pptxName}`);
                fs.writeFileSync(tempPath, pptxData);

                console.log(`   📊 Importing PowerPoint: ${pptxName}`);

                // Import in-place
                const { importInPlace } = await import('./import.js');
                const result = await importInPlace(tempPath, paths.coursePath);

                // Cleanup temp file
                try { fs.unlinkSync(tempPath); } catch {}

                console.log(`   ✅ ${result.slideCount} slides imported from ${pptxName}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    slideCount: result.slideCount,
                    sourceFile: result.sourceFile,
                    textExtracted: result.textExtracted
                }));
            } catch (err) {
                console.error('   ❌ Import failed:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return true;
    }

    // Preview a converted reference file (for dashboard Stage 2 links)
    if (url === '/__stub-player/ref-preview') {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const fileName = params.get('file');
        if (!fileName || fileName.includes('..')) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid file parameter');
            return true;
        }
        const filePath = path.join(paths.coursePath, 'references', 'converted', fileName);
        if (!fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
            return true;
        }
        const raw = fs.readFileSync(filePath, 'utf-8');
        const html = ctx.simpleMarkdownToHtml(raw);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${fileName} – Reference Preview</title>
    <link rel="stylesheet" href="/__stub-player/styles.css">
    <style>
        body { padding: 40px; max-width: 900px; margin: 0 auto; font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; background: var(--color-primary-deep, #0b1628); color: var(--color-gray-200, #d1d5db); }
        h1 { font-size: 18px; color: var(--color-white, #fff); border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; margin-bottom: 24px; }
        pre { background: rgba(0,0,0,0.3); padding: 12px; border-radius: 6px; overflow-x: auto; }
        code { background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 3px; font-size: 13px; }
    </style>
</head>
<body>
    <h1>${fileName}</h1>
    ${html}
</body>
</html>`);
        return true;
    }

    // Stub player static files
    if (url.startsWith('/__stub-player/')) {
        const relativePath = url.slice('/__stub-player/'.length);
        if (relativePath.includes('..')) {
            res.writeHead(403);
            res.end('Forbidden');
            return true;
        }

        const filePath = path.join(__dirname, 'stub-player', relativePath);
        fs.stat(filePath, (err, stats) => {
            if (err || !stats.isFile()) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            const mimeType = relativePath.endsWith('.js') ? 'application/javascript' : ctx.getMimeType(filePath);
            res.writeHead(200, {
                'Content-Type': mimeType,
                'Content-Length': stats.size,
                'Cache-Control': 'no-cache'
            });
            fs.createReadStream(filePath).pipe(res);
        });
        return true;
    }

    // Build course (triggered from dashboard)
    if (url.startsWith('/__build') && req.method === 'POST') {
        (async () => {
            try {
                const params = new URL(req.url, 'http://localhost').searchParams;
                const format = params.get('format') || 'cmi5';
                const result = await buildCourse({ format });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        })();
        return true;
    }


    // Reset (clear storage + redirect)
    if (url === '/__reset') {
        const resetHtml = `<!DOCTYPE html>
<html>
<head><title>Resetting...</title></head>
<body>
<script>
    const skipGating = localStorage.getItem('coursecode-skipGating');
    localStorage.clear();
    if (skipGating) localStorage.setItem('coursecode-skipGating', skipGating);
    window.location.href = '/';
</script>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(resetHtml);
        return true;
    }

    return false;
}
