/**
 * @file preview-routes-lms.js
 * Server-side LMS state store and HTTP API for E2E testing.
 * 
 * The stub LMS runs in the browser (parent frame). This module holds a
 * server-side mirror of the LMS state, pushed from the browser via
 * POST /__lms/sync. E2E tests can then query LMS state via HTTP without
 * needing to execute code inside the browser — verifying from the LMS
 * perspective, not the course perspective.
 */

/**
 * Creates a fresh LMS state store.
 * @returns {Object} Server-side LMS state container
 */
export function createLmsStore() {
    return {
        cmiData: null,
        activeFormat: null,
        isInitialized: false,
        isTerminated: false,
        strictMode: false,
        apiLog: [],
        errorLog: [],
        xapiLog: [],
        sessionStartTime: null,
        lastSyncTime: null
    };
}

/**
 * Handle LMS API routes.
 * @param {Object} ctx - Shared server context (must include ctx.lmsStore)
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 * @param {string} url - Parsed URL path
 * @returns {boolean} true if route was handled
 */
export function handleLmsRoutes(ctx, req, res, url) {
    if (!url.startsWith('/__lms/')) return false;

    const store = ctx.lmsStore;
    const route = url.slice('/__lms/'.length);

    // CORS headers for all LMS routes
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }

    // POST: Browser → server state sync
    if (route === 'sync' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                store.cmiData = data.cmiData;
                store.activeFormat = data.activeFormat;
                store.isInitialized = data.isInitialized;
                store.isTerminated = data.isTerminated;
                store.strictMode = data.strictMode;
                store.apiLog = data.apiLog || [];
                store.errorLog = data.errorLog || [];
                store.xapiLog = data.xapiLog || [];
                store.sessionStartTime = data.sessionStartTime;
                store.lastSyncTime = new Date().toISOString();
                json(res, { ok: true });
            } catch (err) {
                json(res, { error: err.message }, 400);
            }
        });
        return true;
    }

    // POST: Reset LMS state
    if (route === 'reset' && req.method === 'POST') {
        Object.assign(store, createLmsStore());
        json(res, { ok: true, message: 'LMS state cleared' });
        return true;
    }

    // POST: Configure LMS
    if (route === 'configure' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const config = JSON.parse(body);
                if (!store.cmiData) store.cmiData = {};

                if (config.learnerId !== undefined) store.cmiData['cmi.learner_id'] = config.learnerId;
                if (config.learnerName !== undefined) store.cmiData['cmi.learner_name'] = config.learnerName;
                if (config.mode !== undefined) store.cmiData['cmi.mode'] = config.mode;
                if (config.credit !== undefined) store.cmiData['cmi.credit'] = config.credit;
                if (config.strictMode !== undefined) store.strictMode = config.strictMode;

                json(res, { ok: true, applied: Object.keys(config) });
            } catch (err) {
                json(res, { error: err.message }, 400);
            }
        });
        return true;
    }

    // All remaining routes are GET
    if (req.method !== 'GET') {
        json(res, { error: 'Method not allowed' }, 405);
        return true;
    }

    if (!store.cmiData) {
        json(res, { error: 'No LMS state available yet. Course has not initialized.' }, 404);
        return true;
    }

    switch (route) {
        case 'state':
            json(res, {
                cmiData: store.cmiData,
                format: store.activeFormat,
                initialized: store.isInitialized,
                terminated: store.isTerminated,
                strict: store.strictMode,
                lastSync: store.lastSyncTime
            });
            break;

        case 'score':
            json(res, {
                raw: parseScoreValue(store.cmiData['cmi.score.raw']),
                scaled: parseScoreValue(store.cmiData['cmi.score.scaled']),
                min: parseScoreValue(store.cmiData['cmi.score.min']),
                max: parseScoreValue(store.cmiData['cmi.score.max'])
            });
            break;

        case 'completion':
            json(res, {
                completion: store.cmiData['cmi.completion_status'] || 'unknown',
                success: store.cmiData['cmi.success_status'] || 'unknown'
            });
            break;

        case 'objectives':
            json(res, {
                objectives: store.cmiData._objectives || {},
                count: Object.keys(store.cmiData._objectives || {}).length
            });
            break;

        case 'interactions':
            json(res, {
                interactions: store.cmiData._interactions || [],
                count: (store.cmiData._interactions || []).length
            });
            break;

        case 'xapi':
            json(res, {
                statements: store.xapiLog,
                count: store.xapiLog.length
            });
            break;

        case 'log':
            json(res, {
                entries: store.apiLog,
                count: store.apiLog.length
            });
            break;

        case 'errors':
            json(res, {
                errors: store.errorLog.filter(e => !e.isWarning),
                warnings: store.errorLog.filter(e => e.isWarning),
                totalErrors: store.errorLog.filter(e => !e.isWarning).length,
                totalWarnings: store.errorLog.filter(e => e.isWarning).length
            });
            break;

        case 'format':
            json(res, {
                format: store.activeFormat,
                strict: store.strictMode
            });
            break;

        case 'session':
            json(res, {
                initialized: store.isInitialized,
                terminated: store.isTerminated,
                format: store.activeFormat,
                strict: store.strictMode,
                sessionStartTime: store.sessionStartTime,
                bookmark: store.cmiData['cmi.location'] || '',
                entry: store.cmiData['cmi.entry'] || '',
                exit: store.cmiData['cmi.exit'] || '',
                sessionTime: store.cmiData['cmi.session_time'] || '',
                totalTime: store.cmiData['cmi.total_time'] || '',
                lastSync: store.lastSyncTime
            });
            break;

        default:
            json(res, { error: `Unknown LMS route: ${route}` }, 404);
    }

    return true;
}

/**
 * Parse a SCORM score string into a number, preserving 0 and null.
 * SCORM stores all values as strings. `"0" || null` would incorrectly discard zero scores.
 */
function parseScoreValue(value) {
    if (value === undefined || value === null || value === '') return null;
    const num = Number(value);
    return isNaN(num) ? null : num;
}

function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(data, null, 2));
}
