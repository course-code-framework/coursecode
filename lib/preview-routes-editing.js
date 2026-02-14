/**
 * @file preview-routes-editing.js
 * HTTP routing layer for editing operations.
 * Dispatches to slide-source-editor.js (template/interaction edits)
 * and course-writer.js (config-object edits).
 */

import {
    editThemeToken,
    editAssessmentSetting,
    editInteractionField,
    editContent,
    editTag,
    FileNotFoundError
} from './slide-source-editor.js';
import { write } from './course-writer.js';

// =============================================================================
// HTTP HELPERS
// =============================================================================

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch (err) { reject(err); }
        });
        req.on('error', reject);
    });
}

function sendJson(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function handleRoute(req, res, handler) {
    parseJsonBody(req).then(handler).catch(err => {
        console.error('Route error:', err);
        sendJson(res, 500, { error: err.message });
    });
}

function sendError(res, err) {
    if (err instanceof FileNotFoundError) {
        sendJson(res, 404, { error: err.message });
    } else {
        sendJson(res, 400, { error: err.message });
    }
}

// =============================================================================
// ROUTE HANDLER
// =============================================================================

/**
 * @param {Object} ctx - Shared server context
 * @param {Object} ctx.paths - { coursePath, viteConfig }
 * @param {string} ctx.distDir - Path to dist/
 * @param {Function} ctx.findElementByPath - HTML element path resolver
 */
export function handleEditingRoutes(ctx, req, res, url) {
    const { paths } = ctx;

    // Theme palette edit
    if (url === '/__theme-edit' && req.method === 'POST') {
        handleRoute(req, res, ({ token, value }) => {
            try {
                const result = editThemeToken(paths.coursePath, token, value);
                console.log(`   🎨 Theme ${result.action}: ${token}${value ? ` = ${value}` : ''}`);
                sendJson(res, 200, { success: true, action: result.action });
            } catch (err) {
                sendError(res, err);
            }
        });
        return true;
    }

    // Assessment settings edit
    if (url === '/__edit-assessment' && req.method === 'POST') {
        handleRoute(req, res, ({ assessmentId, field, value }) => {
            try {
                editAssessmentSetting(paths.coursePath, assessmentId, field, value);
                console.log(`   📝 Assessment setting updated: ${assessmentId} -> settings.${field} = ${JSON.stringify(value)}`);
                sendJson(res, 200, { success: true, message: `Updated settings.${field}` });
            } catch (err) {
                sendError(res, err);
            }
        });
        return true;
    }

    // Interaction edit
    if (url === '/__edit-interaction' && req.method === 'POST') {
        handleRoute(req, res, ({ slideId, interactionId, field, value }) => {
            try {
                editInteractionField(paths.coursePath, slideId, interactionId, field, value);
                sendJson(res, 200, { success: true, message: `Updated ${field} for ${interactionId}` });
            } catch (err) {
                sendError(res, err);
            }
        });
        return true;
    }

    // Content edit (inner text replacement)
    if (url === '/__edit' && req.method === 'POST') {
        handleRoute(req, res, ({ slideFile, editPath, newText }) => {
            try {
                const result = editContent(paths.coursePath, slideFile, editPath, newText, ctx.findElementByPath);
                console.log(`   ✏️  Edit saved: ${slideFile} [${editPath}]`);
                sendJson(res, 200, { success: true, file: result.file });
            } catch (err) {
                sendError(res, err);
            }
        });
        return true;
    }

    // Tag edit (change element tag + classes)
    if (url === '/__edit-tag' && req.method === 'POST') {
        handleRoute(req, res, ({ slideFile, editPath, newTag, newClasses }) => {
            try {
                const result = editTag(paths.coursePath, slideFile, editPath, newTag, newClasses, ctx.findElementByPath);
                console.log(`   🏷️  Tag edit saved: ${slideFile} [${editPath}]`);
                sendJson(res, 200, { success: true, file: result.file });
            } catch (err) {
                sendError(res, err);
            }
        });
        return true;
    }


    // Unified write (course-writer)
    if (url === '/__write' && req.method === 'POST') {
        handleRoute(req, res, async ({ target, id, value }) => {
            if (!target || !id || value === undefined) {
                sendJson(res, 400, { error: 'Missing required fields: target, id, value' });
                return;
            }

            const result = await write(paths.coursePath, target, id, value);

            if (result.success) {
                console.log(`   📝 Write [${target}]: ${id} = ${JSON.stringify(value)}`);
                sendJson(res, 200, { success: true });
            } else {
                sendJson(res, 400, { error: result.error });
            }
        });
        return true;
    }


    return false;
}
