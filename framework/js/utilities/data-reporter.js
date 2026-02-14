/**
 * Data Reporter - Optional external learning data reporting via webhook
 * 
 * Batches important learning records (assessments, objectives, interactions) and
 * sends them to a configured endpoint. Works across all LMS formats.
 * 
 * Configuration in course-config.js:
 *   environment: {
 *       dataReporting: {
 *           endpoint: 'https://your-endpoint.workers.dev/data',
 *           batchSize: 10,           // Flush after N records (default: 10)
 *           flushInterval: 30000,    // Or flush every N ms (default: 30000)
 *           includeContext: true     // Include course metadata (default: true)
 *       }
 *   }
 */

import { eventBus } from '../core/event-bus.js';
import { logger } from './logger.js';

// ── Cloud meta tag reader ───────────────────────────────────────────
function getMetaContent(name) {
    const el = document.querySelector(`meta[name="${name}"]`);
    return el ? el.getAttribute('content') : null;
}

// Batching state
let batch = [];
let flushTimer = null;

// Configuration
let _config = null;
let _courseConfig = null;
let _licenseId = null;
let _courseId = null;

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_FLUSH_INTERVAL = 30000; // 30 seconds

/**
 * Queue a record for batched sending
 * @param {string} type - Record type: 'assessment', 'objective', 'interaction', 'session'
 * @param {Object} data - Record data
 */
function queueRecord(type, data) {
    if (!_config?.endpoint) return;

    const record = {
        type,
        data,
        timestamp: new Date().toISOString()
    };

    batch.push(record);
    logger.debug(`[DataReporter] Queued ${type} record (${batch.length} in batch)`);

    const batchSize = _config.batchSize || DEFAULT_BATCH_SIZE;

    // Flush if batch size reached
    if (batch.length >= batchSize) {
        flush();
        return;
    }

    // Schedule flush on timer if not already scheduled
    if (!flushTimer) {
        const interval = _config.flushInterval || DEFAULT_FLUSH_INTERVAL;
        flushTimer = setTimeout(() => {
            flush();
        }, interval);
    }
}

/**
 * Flush the current batch to the endpoint
 */
async function flush() {
    if (batch.length === 0) return;

    // Clear timer
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }

    // Take all records, empty batch
    const records = batch.splice(0);
    const payload = buildPayload(records);

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (_config.apiKey) headers['Authorization'] = `Bearer ${_config.apiKey}`;

        const response = await fetch(_config.endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            logger.debug(`[DataReporter] Batch sent successfully (${records.length} records)`);
        } else {
            logger.warn(`[DataReporter] Failed to send batch: ${response.status}`);
            // Re-queue failed records at front of batch
            batch.unshift(...records);
        }
    } catch (e) {
        logger.warn(`[DataReporter] Network error sending batch: ${e.message}`);
        // Re-queue failed records
        batch.unshift(...records);
    }
}

/**
 * Emergency flush using sendBeacon (for page unload)
 */
function emergencyFlush() {
    if (batch.length === 0 || !_config?.endpoint) return;

    const records = batch.splice(0);
    const payload = buildPayload(records);
    const body = JSON.stringify(payload);

    // sendBeacon doesn't support custom headers, so when apiKey is configured
    // we use fetch with keepalive (unload-safe) to include the auth header
    if (_config.apiKey) {
        try {
            fetch(_config.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${_config.apiKey}`
                },
                body,
                keepalive: true
            });
            logger.debug(`[DataReporter] Emergency flush: ${records.length} records sent via fetch+keepalive`);
        } catch {
            logger.warn('[DataReporter] Emergency flush: fetch+keepalive failed');
        }
    } else {
        const blob = new Blob([body], { type: 'application/json' });
        const sent = navigator.sendBeacon(_config.endpoint, blob);
        if (sent) {
            logger.debug(`[DataReporter] Emergency flush: ${records.length} records sent via sendBeacon`);
        } else {
            logger.warn('[DataReporter] Emergency flush: sendBeacon failed');
        }
    }
}

/**
 * Build the payload with optional course context
 */
function buildPayload(records) {
    const payload = {
        records,
        sentAt: new Date().toISOString()
    };

    if (_config.includeContext !== false && _courseConfig) {
        payload.course = {
            title: _courseConfig.metadata?.title,
            version: _courseConfig.metadata?.version,
            id: _courseConfig.metadata?.id
        };
    }

    // Cloud attribution context (license and course IDs for engine routing)
    if (_licenseId) payload.licenseId = _licenseId;
    if (_courseId) payload.courseId = _courseId;

    return payload;
}

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * Handle assessment submission
 */
function handleAssessmentSubmitted({ assessmentId, results }) {
    if (!assessmentId || !results) return;

    queueRecord('assessment', {
        assessmentId,
        score: results.scorePercentage,
        passed: results.passed,
        attemptNumber: results.attemptNumber,
        totalQuestions: results.totalQuestions,
        correctCount: results.correctCount,
        timeSpent: results.timeSpent
    });
}

/**
 * Handle objective updates - only report meaningful changes
 */
function handleObjectiveUpdated(objective) {
    if (!objective?.id) return;

    // Only report completed objectives or pass/fail status changes
    const isComplete = objective.completion_status === 'completed';
    const hasFinalResult = objective.success_status === 'passed' || objective.success_status === 'failed';

    if (!isComplete && !hasFinalResult) {
        return; // Skip intermediate updates
    }

    queueRecord('objective', {
        objectiveId: objective.id,
        completion_status: objective.completion_status,
        success_status: objective.success_status,
        score: objective.score
    });
}

/**
 * Handle interaction recorded (submitted answers only)
 */
function handleInteractionRecorded(interaction) {
    if (!interaction?.id) return;

    queueRecord('interaction', {
        interactionId: interaction.id,
        type: interaction.type,
        result: interaction.result,
        learner_response: interaction.learner_response
    });
}

/**
 * Handle session termination - flush remaining records
 */
function handleBeforeTerminate() {
    // Attempt async flush first
    flush().catch(() => {
        // Fall back to emergency sendBeacon
        emergencyFlush();
    });
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize data reporting if configured
 * @param {Object} courseConfig - The course configuration object
 */
export function initDataReporter(courseConfig) {
    // Never send data during local dev — the preview server and dev command
    // inject VITE_COURSECODE_LOCAL into the Vite build env, which is auto-exposed
    // to client code. Production builds via `coursecode build` don't set this.
    if (import.meta.env.VITE_COURSECODE_LOCAL) {
        logger.debug('[DataReporter] Disabled in local dev mode');
        return;
    }

    // Priority chain: meta tags (cloud-injected) → config (self-hosted) → disabled
    const metaEndpoint = getMetaContent('cc-data-endpoint');
    let config;
    if (metaEndpoint) {
        config = { endpoint: metaEndpoint, apiKey: getMetaContent('cc-api-key') };
    } else {
        config = courseConfig.environment?.dataReporting;
    }

    _config = config;
    _courseConfig = courseConfig;

    // Cloud attribution (present when launched via LTI/cmi5)
    _licenseId = getMetaContent('cc-license-id');
    _courseId = getMetaContent('cc-course-id');

    // Disabled if no endpoint configured
    if (!config?.endpoint) {
        logger.debug('[DataReporter] Not configured, skipping initialization');
        return;
    }

    logger.info('[DataReporter] Initialized with endpoint:', config.endpoint);

    // Subscribe to important events
    eventBus.on('assessment:submitted', handleAssessmentSubmitted);
    eventBus.on('objective:updated', handleObjectiveUpdated);
    eventBus.on('interaction:recorded', handleInteractionRecorded);
    eventBus.on('session:beforeTerminate', handleBeforeTerminate);

    // Emergency flush on page hide (catches tab close, navigation away)
    if (typeof window !== 'undefined') {
        window.addEventListener('pagehide', emergencyFlush);
        window.addEventListener('beforeunload', emergencyFlush);
    }
}
