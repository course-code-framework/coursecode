/**
 * Course Channel - Generic pub/sub transport for course-to-course communication
 * 
 * Content-agnostic message relay. The framework provides only the pipe:
 * send, receive, reconnect. Message interpretation is left to consumer code.
 * 
 * Configuration in course-config.js:
 *   environment: {
 *       channel: {
 *           endpoint: 'https://relay.example.com',
 *           channelId: 'my-session-123'
 *       }
 *   }
 * 
 * Sending:
 *   import { sendChannelMessage } from './utilities/course-channel.js';
 *   sendChannelMessage({ type: 'navigate', slideId: 'slide-03' });
 * 
 * Receiving (via EventBus):
 *   eventBus.on('channel:message', (data) => { ... });
 */

import { eventBus } from '../core/event-bus.js';
import { logger } from './logger.js';

// ── Cloud meta tag reader ───────────────────────────────────────────
function getMetaContent(name) {
    const el = document.querySelector(`meta[name="${name}"]`);
    return el ? el.getAttribute('content') : null;
}

// Connection state
let _config = null;
let _eventSource = null;
let _reconnectTimer = null;
let _reconnectDelay = 1000;

const MAX_RECONNECT_DELAY = 30000;
const RECONNECT_BACKOFF = 2;

/**
 * Build the full URL for the channel endpoint
 */
function getChannelUrl() {
    const base = _config.endpoint.replace(/\/+$/, '');
    return `${base}/${encodeURIComponent(_config.channelId)}`;
}

/**
 * Send a message to the channel
 * @param {Object} data - Any JSON-serializable payload
 */
export async function sendChannelMessage(data) {
    if (!_config?.endpoint || !_config?.channelId) {
        logger.warn('[CourseChannel] Cannot send — channel not configured');
        return;
    }

    const url = getChannelUrl();

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (_config.apiKey) headers['Authorization'] = `Bearer ${_config.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            logger.warn('[CourseChannel] Send failed:', response.status);
        }
    } catch (e) {
        logger.warn('[CourseChannel] Network error sending:', e.message);
    }
}

/**
 * Check if the channel is currently connected (SSE stream open)
 * @returns {boolean}
 */
export function isChannelConnected() {
    return _eventSource?.readyState === EventSource.OPEN;
}

/**
 * Connect the SSE listener for incoming messages
 */
function connect() {
    if (_eventSource) {
        _eventSource.close();
    }

    let url = getChannelUrl();
    // EventSource doesn't support custom headers, so pass token as URL param
    if (_config.apiKey) {
        const sep = url.includes('?') ? '&' : '?';
        url += `${sep}token=${encodeURIComponent(_config.apiKey)}`;
    }
    logger.debug('[CourseChannel] Connecting to:', url);

    _eventSource = new EventSource(url);

    _eventSource.onopen = () => {
        _reconnectDelay = 1000; // Reset backoff on successful connect
        logger.debug('[CourseChannel] Connected');
        eventBus.emit('channel:connected');
    };

    _eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            eventBus.emit('channel:message', data);
        } catch (e) {
            logger.warn('[CourseChannel] Failed to parse message:', e.message);
        }
    };

    _eventSource.onerror = () => {
        // EventSource auto-reconnects, but if it closes we handle it
        if (_eventSource.readyState === EventSource.CLOSED) {
            logger.warn('[CourseChannel] Connection closed, reconnecting...');
            eventBus.emit('channel:disconnected');
            scheduleReconnect();
        }
    };
}

/**
 * Schedule a reconnection with exponential backoff
 */
function scheduleReconnect() {
    if (_reconnectTimer) return;

    _reconnectTimer = setTimeout(() => {
        _reconnectTimer = null;
        connect();
    }, _reconnectDelay);

    logger.debug(`[CourseChannel] Reconnecting in ${_reconnectDelay}ms`);
    _reconnectDelay = Math.min(_reconnectDelay * RECONNECT_BACKOFF, MAX_RECONNECT_DELAY);
}

/**
 * Emergency send via sendBeacon (for page unload)
 */
function emergencySend(data) {
    if (!_config?.endpoint || !_config?.channelId) return;

    const url = getChannelUrl();
    const body = JSON.stringify(data);

    // When apiKey is configured, use fetch+keepalive to include auth header
    // (sendBeacon doesn't support custom headers)
    if (_config.apiKey) {
        try {
            fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${_config.apiKey}`
                },
                body,
                keepalive: true
            });
        } catch {
            // Silent fail on unload
        }
    } else {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
    }
}

/**
 * Clean up on page unload
 */
function handleUnload() {
    if (_eventSource) {
        _eventSource.close();
        _eventSource = null;
    }
    if (_reconnectTimer) {
        clearTimeout(_reconnectTimer);
        _reconnectTimer = null;
    }
}

/**
 * Initialize the course channel if configured
 * @param {Object} courseConfig - The course configuration object
 */
export function initCourseChannel(courseConfig) {
    // Priority chain: meta tags (cloud-injected) → config (self-hosted) → disabled
    const metaEndpoint = getMetaContent('cc-channel-endpoint');
    const metaChannelId = getMetaContent('cc-channel-id');
    let config;
    if (metaEndpoint && metaChannelId) {
        // Both required — endpoint alone without a channel ID is useless
        config = { endpoint: metaEndpoint, channelId: metaChannelId, apiKey: getMetaContent('cc-api-key') };
    } else {
        config = courseConfig.environment?.channel;
    }

    _config = config;

    if (!config?.endpoint || !config?.channelId) {
        logger.debug('[CourseChannel] Not configured, skipping initialization');
        return;
    }

    logger.info('[CourseChannel] Initialized — channel:', config.channelId);

    // Open SSE listener
    connect();

    // Expose emergency send for consumer code that needs unload-safe delivery
    window.addEventListener('pagehide', handleUnload);

    // Expose sendChannelMessage globally for course-author convenience
    if (window.CourseCode) {
        window.CourseCode.sendChannelMessage = sendChannelMessage;
        window.CourseCode.isChannelConnected = isChannelConnected;
    }
}

// Re-export emergencySend for advanced consumers
export { emergencySend };
