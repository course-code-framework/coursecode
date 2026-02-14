/**
 * @file embed-frame.js
 * @description Sandboxed iframe component for embedding custom HTML/JS apps.
 * 
 * Provides CSS isolation and JS sandboxing for custom interactive elements.
 * Communicates with the parent frame via postMessage for state persistence
 * and engagement tracking.
 *
 * Usage (Declarative):
 * <div data-component="embed-frame"
 *      data-src="assets/widgets/my-app.html"
 *      data-embed-id="custom-widget"
 *      data-aspect-ratio="16/9">
 * </div>
 *
 * PostMessage API (from embedded content):
 * // Set a flag (triggers engagement re-evaluation)
 * parent.postMessage({ type: 'coursecode:flag', key: 'widget-complete', value: true }, '*');
 * 
 * // Request resize (auto-height mode)
 * parent.postMessage({ type: 'coursecode:resize', height: 400 }, '*');
 * 
 * // Log a message to the console (for debugging)
 * parent.postMessage({ type: 'coursecode:log', level: 'info', message: 'Widget initialized' }, '*');
 */

export const schema = {
    type: 'embed-frame',
    description: 'Sandboxed iframe for custom HTML/JS apps',
    example: `<div data-component="embed-frame" data-src="widgets/my-app.html" data-embed-id="custom-widget" data-aspect-ratio="16/9">
  <p style="color: #64748b; font-size: 0.875rem; font-style: italic;">📦 Sandboxed iframe renders dynamically — embeds custom HTML/JS with postMessage API.</p>
</div>`,
    properties: {
        src: { type: 'string', required: true, dataAttribute: 'data-src' },
        embedId: { type: 'string', required: true, dataAttribute: 'data-embed-id' },
        aspectRatio: { type: 'string', dataAttribute: 'data-aspect-ratio' }
    },
    structure: {
        container: '[data-component="embed-frame"]',
        children: {}  // Content is dynamically rendered
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/embed-frame.css',
    engagementTracking: null,
    emitsEvents: ['embed-frame:initialized', 'embed-frame:ready', 'embed-frame:flag']
};

import { logger } from '../../utilities/logger.js';
import { eventBus } from '../../core/event-bus.js';
import flagManager from '../../managers/flag-manager.js';

/**
 * Initializes an embed-frame component.
 * @param {HTMLElement} container - The container element with data-component="embed-frame"
 */
export function init(container) {
    if (!container) {
        logger.fatal('initEmbedFrame: container not found.', { domain: 'ui', operation: 'initEmbedFrame' });
        return;
    }

    const src = container.dataset.src;
    const embedId = container.dataset.embedId;
    const aspectRatio = container.dataset.aspectRatio || null;

    if (!src) {
        logger.fatal('initEmbedFrame: data-src attribute is required.', { domain: 'ui', operation: 'initEmbedFrame' });
        return;
    }

    if (!embedId) {
        logger.fatal('initEmbedFrame: data-embed-id attribute is required.', { domain: 'ui', operation: 'initEmbedFrame' });
        return;
    }

    // Mark as initialized
    if (container.dataset.embedInitialized === 'true') {
        logger.debug('[EmbedFrame] Already initialized:', embedId);
        return { destroy: () => { } };
    }
    container.dataset.embedInitialized = 'true';

    // Build the iframe
    const wrapper = document.createElement('div');
    wrapper.className = 'embed-frame-wrapper';

    if (aspectRatio) {
        wrapper.style.aspectRatio = aspectRatio;
    }

    const iframe = document.createElement('iframe');
    iframe.className = 'embed-frame-iframe';
    iframe.src = _resolvePath(src);
    // SECURITY NOTE: 'allow-same-origin' is required for postMessage to work reliably
    // when the embedded widget is loaded from the same origin (local assets).
    // Without it, the iframe gets an opaque origin ('null') which breaks postMessage
    // in some browsers. The trade-off is that same-origin iframes CAN access the
    // parent's DOM, cookies, and localStorage. This is acceptable because:
    //   1. embed-frame is for author-controlled widgets, not untrusted user content
    //   2. We validate event.source to ensure messages come from the correct iframe
    //   3. For untrusted content, authors should use an external URL (cross-origin)
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('title', `Embedded content: ${embedId}`);
    iframe.setAttribute('data-testid', `embed-frame-${embedId}`);

    // For auto-height mode (no aspect ratio)
    if (!aspectRatio) {
        wrapper.classList.add('embed-frame-auto-height');
    }

    wrapper.appendChild(iframe);
    container.appendChild(wrapper);

    // Message handler for postMessage communication
    const messageHandler = (event) => {
        // Validate the message came from this iframe
        if (event.source !== iframe.contentWindow) {
            return;
        }

        const data = event.data;
        if (!data || typeof data !== 'object' || !data.type) {
            return;
        }

        // Only handle coursecode: prefixed messages
        if (!data.type.startsWith('coursecode:')) {
            return;
        }

        const action = data.type.replace('coursecode:', '');

        switch (action) {
            case 'flag':
                handleFlagMessage(data, embedId);
                break;
            case 'resize':
                handleResizeMessage(data, wrapper, aspectRatio);
                break;
            case 'log':
                handleLogMessage(data, embedId);
                break;
            case 'ready':
                handleReadyMessage(embedId);
                break;
            default:
                logger.warn(`[EmbedFrame] Unknown message type: ${data.type}`, { embedId });
        }
    };

    window.addEventListener('message', messageHandler);

    // Emit initialization event
    eventBus.emit('embed-frame:initialized', { embedId, src });
    logger.debug('[EmbedFrame] Initialized:', { embedId, src, aspectRatio });

    return {
        destroy: () => {
            window.removeEventListener('message', messageHandler);
            logger.debug('[EmbedFrame] Destroyed:', embedId);
        }
    };
}

/**
 * Handles flag messages from embedded content.
 * @param {object} data - Message data with key and value
 * @param {string} embedId - The embed ID for logging
 */
function handleFlagMessage(data, embedId) {
    const { key, value } = data;

    if (typeof key !== 'string' || key.trim() === '') {
        logger.error('[EmbedFrame] Invalid flag key:', { embedId, key });
        return;
    }

    try {
        flagManager.setFlag(key, value);
        logger.debug('[EmbedFrame] Flag set via postMessage:', { embedId, key, value });
        eventBus.emit('embed-frame:flag', { embedId, key, value });
    } catch (error) {
        logger.error('[EmbedFrame] Failed to set flag:', { embedId, key, error: error.message });
    }
}

/**
 * Handles resize messages from embedded content (auto-height mode).
 * @param {object} data - Message data with height
 * @param {HTMLElement} wrapper - The wrapper element
 * @param {string|null} aspectRatio - The configured aspect ratio
 */
function handleResizeMessage(data, wrapper, aspectRatio) {
    // Only allow resize in auto-height mode
    if (aspectRatio) {
        logger.warn('[EmbedFrame] Resize ignored - aspect ratio is fixed');
        return;
    }

    const { height } = data;
    if (typeof height !== 'number' || height < 50 || height > 5000) {
        logger.warn('[EmbedFrame] Invalid resize height:', height);
        return;
    }

    wrapper.style.height = `${height}px`;
    logger.debug('[EmbedFrame] Resized to:', height);
}

/**
 * Handles log messages from embedded content.
 * @param {object} data - Message data with level and message
 * @param {string} embedId - The embed ID for context
 */
function handleLogMessage(data, embedId) {
    const { level = 'info', message } = data;
    const prefix = `[EmbedFrame:${embedId}]`;

    switch (level) {
        case 'debug':
            logger.debug(prefix, message);
            break;
        case 'info':
            logger.info(prefix, message);
            break;
        case 'warn':
            logger.warn(prefix, message);
            break;
        case 'error':
            logger.error(prefix, message);
            break;
        default:
            logger.info(prefix, message);
    }
}

/**
 * Handles ready messages from embedded content.
 * @param {string} embedId - The embed ID
 */
function handleReadyMessage(embedId) {
    logger.debug('[EmbedFrame] Embed ready:', embedId);
    eventBus.emit('embed-frame:ready', { embedId });
}

/**
 * Resolves embed path relative to course/assets/.
 * Follows the same pattern as audio-manager and video-player.
 * @param {string} src - The source path
 * @returns {string} Resolved path
 */
function _resolvePath(src) {
    // Already absolute URL or protocol-relative
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
        return src;
    }

    // Already has leading slash (absolute path from root)
    if (src.startsWith('/')) {
        return src;
    }

    // Already uses ./ or ../ relative paths
    if (src.startsWith('./') || src.startsWith('../')) {
        return src;
    }

    // Otherwise, assume relative to course/assets/
    return `./course/${src}`;
}
