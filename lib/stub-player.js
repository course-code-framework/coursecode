/**
 * stub-player.js - Shared stub LMS player generator
 * 
 * Used by both preview-server.js (live mode) and preview-export.js (static export)
 */
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CSS is loaded lazily inside generateStubPlayer() to filter by mode
const stylesDir = join(__dirname, 'stub-player/styles');
const VIEWER_STYLES = ['_base.css', '_header-bar.css', '_content-viewer.css', '_login-screen.css'];

function loadStyles(isLive) {
    return readdirSync(stylesDir)
        .filter(f => f.endsWith('.css'))
        .filter(f => isLive || VIEWER_STYLES.includes(f))
        .sort()
        .map(f => readFileSync(join(stylesDir, f), 'utf-8'))
        .join('\n');
}

// HTML template modules
import { generateHeaderBar } from './stub-player/header-bar.js';
import { generateDebugPanel } from './stub-player/debug-panel.js';
import { generateConfigPanel } from './stub-player/config-panel.js';
import { generateInteractionsPanel } from './stub-player/interactions-panel.js';
import { generateContentViewer } from './stub-player/content-viewer.js';
import { generateCatalogPanel } from './stub-player/catalog-panel.js';
import { generateOutlineMode } from './stub-player/outline-mode.js';

import { generateLoginScreen } from './stub-player/login-screen.js';

import { generateInteractionEditor } from './stub-player/interaction-editor.js';

import { escapeHtml } from './project-utils.js';

// Re-export for consumers that import from stub-player
export { escapeHtml };


/**
 * Generate the stub LMS player HTML
 * @param {object} config - Configuration for the player
 * @param {string} config.title - Course title
 * @param {string} config.launchUrl - URL to load in iframe (file path or http URL)
 * @param {string} config.storageKey - localStorage key for persistence
 * @param {string} [config.passwordHash] - Optional SHA-256 hash of password for access
 * @param {boolean} [config.isLive] - True for live mode (shows "Live" badge)
 * @param {boolean} [config.liveReload] - True to enable live reload via SSE
 * @param {string} [config.courseContent] - Markdown/HTML content for the content viewer
 * @param {string|number} [config.startSlide] - Slide ID or index to navigate to on load
 * @returns {string} - Complete HTML for the player page
 */
export function generateStubPlayer(config) {
    const { title, launchUrl, storageKey, passwordHash, isLive, liveReload, courseContent, startSlide, isDesktop, moduleBasePath = '/__stub-player' } = config;
    const hasPassword = !!passwordHash;
    const hasContent = !!courseContent;

    const stubPlayerStyles = loadStyles(isLive);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} - Preview</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none' stroke='%23fff' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'><polyline points='25,22 5,50 25,78'/><polyline points='75,22 95,50 75,78'/><path d='M50,28 C40,28 33,36 33,45 C33,52 38,56 42,60 L42,65 L58,65 L58,60 C62,56 67,52 67,45 C67,36 60,28 50,28' stroke-width='6'/><line x1='44' y1='70' x2='56' y2='70' stroke-width='6'/><line x1='46' y1='75' x2='54' y2='75' stroke-width='6'/></svg>">
    <style>
${stubPlayerStyles}
    </style>
</head>
<body>
    ${hasPassword ? generateLoginScreen({ title: escapeHtml(title) }) : ''}
    
    <iframe id="stub-player-course-frame" name="stub-player-course-frame"></iframe>
    
    ${isLive ? generateOutlineMode() : ''}
    
    ${generateHeaderBar({ isLive, hasContent })}
    
    ${isLive ? generateDebugPanel() : ''}
    




    ${hasContent ? generateContentViewer({ isLive }) : ''}

    ${isLive ? generateConfigPanel() : ''}

    ${isLive ? generateInteractionsPanel() : ''}

    ${isLive ? generateCatalogPanel() : ''}

    ${isLive ? generateInteractionEditor() : ''}

    <script>
    // Inject Configuration
    window.STUB_CONFIG = {
        title: ${JSON.stringify(title)},
        launchUrl: ${JSON.stringify(launchUrl)},
        storageKey: ${JSON.stringify(storageKey)},
        passwordHash: ${hasPassword ? JSON.stringify(passwordHash) : 'null'},
        isLive: ${isLive || false},
        liveReload: ${liveReload || false},
        startSlide: ${startSlide !== undefined ? JSON.stringify(startSlide) : 'null'},
        courseContent: ${hasContent ? JSON.stringify(courseContent) : 'null'},
        isDesktop: ${isDesktop || false},
        isCI: ${!!process.env.CI}
    };
    </script>
    <script type="module" src="${moduleBasePath}/${isLive ? 'app' : 'app-viewer'}.js"></script>
    
    ${liveReload ? `
    <script>
    // Live reload via Server-Sent Events
    // Deferred to window.load to prevent "connection interrupted while page was loading" warnings
    (function() {
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 10;
        
        function connect() {
            const eventSource = new EventSource('/__reload');
            
            eventSource.onmessage = function(event) {
                if (event.data === 'reload') {
                    console.log('[Live Reload] Rebuilding complete, reloading course...');
                    // Clear error log before reload to prevent stale errors
                    if (window.stubPlayer?.clearErrors) window.stubPlayer.clearErrors();
                    const frame = document.getElementById('stub-player-course-frame');
                    if (frame) {
                        frame.contentWindow.location.reload();
                    }
                } else if (event.data === 'connected') {
                    reconnectAttempts = 0;
                }
            };
            
            eventSource.onerror = function() {
                eventSource.close();
                reconnectAttempts++;
                if (reconnectAttempts <= maxReconnectAttempts) {
                    setTimeout(connect, 2000);
                } else {
                    console.warn('[Live Reload] Max reconnect attempts reached. Refresh page manually.');
                }
            };
        }
        
        window.addEventListener('load', connect);
    })();
    </script>
    ` : ''}
</body>
</html>`;
}
