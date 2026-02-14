/**
 * Error Reporter - Optional external error reporting via webhook
 * 
 * Sends framework errors to a configured endpoint (e.g., Cloudflare Worker)
 * for email notifications. Disabled by default; enable in course-config.js.
 * 
 * Flood protection:
 *   - Per-error dedup: same error key won't be sent twice within 60 seconds
 *   - Batching: errors arriving within a 2-second window are combined into one request
 *   - Global rate cap: max 10 reports per rolling 60-second window
 *   - Re-entrancy guard: reporter's own log messages don't trigger new reports
 * 
 * Configuration in course-config.js:
 *   environment: {
 *       errorReporting: {
 *           endpoint: 'https://your-worker.workers.dev/errors',
 *           // Optional: API key for endpoint authentication
 *           apiKey: 'your-shared-api-key',
 *           // Optional: include course/learner context
 *           includeContext: true
 *       }
 *   }
 */

import { eventBus } from '../core/event-bus.js';
import { logger } from './logger.js';

// ── Per-error dedup ─────────────────────────────────────────────────
const recentErrors = new Map();
const DEBOUNCE_MS = 60000; // Don't send same error more than once per minute

// ── Batching ────────────────────────────────────────────────────────
const BATCH_WINDOW_MS = 2000; // Collect errors for 2 seconds before sending
let pendingBatch = [];         // Accumulated payloads waiting to flush
let batchTimer = null;         // setTimeout handle for the current window

// ── Global rate cap ─────────────────────────────────────────────────
const MAX_SENDS_PER_WINDOW = 10;
const RATE_WINDOW_MS = 60000;
const sendTimestamps = [];     // Timestamps of recent sends

// ── Re-entrancy guard ───────────────────────────────────────────────
let _isReporting = false;

// ── Cloud meta tag reader ───────────────────────────────────────────
function getMetaContent(name) {
    const el = document.querySelector(`meta[name="${name}"]`);
    return el ? el.getAttribute('content') : null;
}

/**
 * Generate a unique key for an error to detect duplicates
 */
function getErrorKey(errorData) {
    const domain = errorData.domain || 'unknown';
    const operation = errorData.operation || 'unknown';
    const message = errorData.message || String(errorData);
    return `${domain}:${operation}:${message}`;
}

/**
 * Check if this error was recently reported
 */
function wasRecentlyReported(errorKey) {
    const lastReported = recentErrors.get(errorKey);
    if (!lastReported) return false;
    return (Date.now() - lastReported) < DEBOUNCE_MS;
}

/**
 * Mark an error as recently reported
 */
function markAsReported(errorKey) {
    recentErrors.set(errorKey, Date.now());
    
    // Clean up old entries periodically
    if (recentErrors.size > 100) {
        const now = Date.now();
        for (const [key, timestamp] of recentErrors.entries()) {
            if (now - timestamp > DEBOUNCE_MS) {
                recentErrors.delete(key);
            }
        }
    }
}

/**
 * Check whether we've hit the global rate cap
 */
function isRateLimited() {
    const now = Date.now();
    // Prune timestamps outside the rolling window
    while (sendTimestamps.length > 0 && now - sendTimestamps[0] > RATE_WINDOW_MS) {
        sendTimestamps.shift();
    }
    return sendTimestamps.length >= MAX_SENDS_PER_WINDOW;
}

/**
 * Queue an error for batched sending.
 * Errors are collected for BATCH_WINDOW_MS then flushed in a single request.
 */
function enqueueError(errorData, config, courseConfig) {
    // Normalize error data — some emitters pass strings instead of objects
    const normalizedError = typeof errorData === 'string' 
        ? { domain: 'unknown', operation: 'unknown', message: errorData }
        : errorData;
    
    // Skip user-facing errors (expected behavior, not system errors)
    if (normalizedError.userFacing === true) {
        logger.debug('[ErrorReporter] Skipping user-facing error (not a system error):', normalizedError.message);
        return;
    }
    
    const errorKey = getErrorKey(normalizedError);
    
    // Skip if recently reported (even across batches)
    if (wasRecentlyReported(errorKey)) {
        logger.debug('[ErrorReporter] Skipping duplicate error:', errorKey);
        return;
    }
    
    // Global rate cap check
    if (isRateLimited()) {
        logger.debug('[ErrorReporter] Rate limited, dropping error:', errorKey);
        return;
    }

    // Build payload entry
    const payload = {
        domain: normalizedError.domain || 'unknown',
        operation: normalizedError.operation || 'unknown',
        message: normalizedError.message || String(errorData),
        stack: normalizedError.stack,
        context: normalizedError.context
    };

    // Mark as reported immediately so duplicates within the same batch are dropped
    markAsReported(errorKey);

    pendingBatch.push(payload);

    // Store config/courseConfig for the flush (same for all errors in a session)
    if (!batchTimer) {
        batchTimer = setTimeout(() => flushBatch(config, courseConfig), BATCH_WINDOW_MS);
    }
}

/**
 * Flush the pending batch as a single request to the endpoint.
 */
async function flushBatch(config, courseConfig) {
    const batch = pendingBatch;
    pendingBatch = [];
    batchTimer = null;

    if (batch.length === 0) return;

    // Build the request payload
    const request = {
        // If single error, send flat for backward compatibility; otherwise send array
        ...(batch.length === 1
            ? batch[0]
            : { errors: batch, message: `${batch.length} errors`, domain: batch[0].domain, operation: batch[0].operation }),
        
        // Metadata
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent
    };

    // Optionally include course context
    if (config.includeContext !== false) {
        request.course = {
            title: courseConfig.metadata?.title,
            version: courseConfig.metadata?.version,
            id: courseConfig.metadata?.id
        };
    }

    // Cloud attribution context (license and course IDs for engine routing)
    if (_licenseId) request.licenseId = _licenseId;
    if (_courseId) request.courseId = _courseId;

    // Guard re-entrancy: our own logger calls must not trigger new reports
    _isReporting = true;
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(request)
        });

        if (response.ok) {
            sendTimestamps.push(Date.now());
            logger.debug(`[ErrorReporter] Batch of ${batch.length} error(s) reported successfully`);
        } else {
            logger.warn('[ErrorReporter] Failed to report error:', response.status);
        }
    } catch (e) {
        // Silent fail — don't break the course or cause infinite loops
        logger.debug('[ErrorReporter] Network error reporting:', e.message);
    } finally {
        _isReporting = false;
    }
}

// Store config globally for user reports
let _config = null;
let _courseConfig = null;
let _licenseId = null;
let _courseId = null;

/**
 * Check if error reporting is configured and user reports are enabled
 * @returns {boolean}
 */
export function isUserReportingEnabled() {
    return !!(_config?.endpoint && _config?.enableUserReports !== false);
}

/**
 * Submit a user-initiated issue report
 * @param {string} description - User's description of the issue
 * @param {Object} options - Additional options
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function submitUserReport(description, options = {}) {
    if (!_config?.endpoint) {
        return { success: false, message: 'Error reporting is not configured.' };
    }
    
    const payload = {
        type: 'user_report',
        description: description.trim(),
        
        // Metadata
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent
    };
    
    // Include course context
    if (_config.includeContext !== false && _courseConfig) {
        payload.course = {
            title: _courseConfig.metadata?.title,
            version: _courseConfig.metadata?.version,
            id: _courseConfig.metadata?.id
        };
    }

    // Cloud attribution
    if (_licenseId) payload.licenseId = _licenseId;
    if (_courseId) payload.courseId = _courseId;
    
    // Include current slide info if available
    if (options.currentSlide) {
        payload.currentSlide = options.currentSlide;
    }
    
    // Include recent logs if requested and available
    if (options.includeLogs && typeof getRecentLogs === 'function') {
        payload.recentLogs = getRecentLogs();
    }
    
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (_config.apiKey) headers['Authorization'] = `Bearer ${_config.apiKey}`;

        const response = await fetch(_config.endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            logger.debug('[ErrorReporter] User report submitted successfully');
            return { success: true, message: 'Your report has been submitted. Thank you!' };
        } else {
            logger.warn('[ErrorReporter] Failed to submit user report:', response.status);
            return { success: false, message: 'Failed to submit report. Please try again later.' };
        }
    } catch (e) {
        logger.warn('[ErrorReporter] Network error submitting user report:', e.message);
        return { success: false, message: 'Network error. Please check your connection and try again.' };
    }
}

/**
 * Initialize error reporting if configured
 * 
 * @param {Object} courseConfig - The course configuration object
 */
export function initErrorReporter(courseConfig) {
    // Never send reports during local dev — the preview server and dev command
    // inject VITE_COURSECODE_LOCAL into the Vite build env, which is auto-exposed
    // to client code. Production builds via `coursecode build` don't set this.
    if (import.meta.env.VITE_COURSECODE_LOCAL) {
        logger.debug('[ErrorReporter] Disabled in local dev mode');
        return;
    }

    // Priority chain: meta tags (cloud-injected) → config (self-hosted) → disabled
    const metaEndpoint = getMetaContent('cc-error-endpoint');
    let config;
    if (metaEndpoint) {
        config = { endpoint: metaEndpoint, apiKey: getMetaContent('cc-api-key') };
    } else {
        config = courseConfig.environment?.errorReporting;
    }

    // Store for user reports
    _config = config;
    _courseConfig = courseConfig;

    // Cloud attribution (present when launched via LTI/cmi5)
    _licenseId = getMetaContent('cc-license-id');
    _courseId = getMetaContent('cc-course-id');

    // Disabled if not configured or no endpoint
    if (!config?.endpoint) {
        logger.debug('[ErrorReporter] Not configured, skipping initialization');
        return;
    }

    logger.info('[ErrorReporter] Initialized with endpoint:', config.endpoint);

    // Subscribe to unified logger events
    eventBus.on('log:error', (errorData) => {
        if (_isReporting) return; // prevent re-entrancy from our own logger calls
        enqueueError(errorData, config, courseConfig);
    });
    eventBus.on('log:warn', (errorData) => {
        if (_isReporting) return; // prevent re-entrancy from our own logger calls
        enqueueError(errorData, config, courseConfig);
    });
}
