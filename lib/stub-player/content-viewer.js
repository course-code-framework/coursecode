/**
 * stub-player/content-viewer.js - Content viewer panel component
 * 
 * Generates the content viewer panel HTML and handles client-side interactions.
 */

/**
 * Generate content viewer panel HTML
 * @param {Object} options
 * @param {boolean} options.isLive - Whether this is live mode (shows refresh button)
 * Note: Content is populated dynamically by JS, this just creates the container
 */
export function generateContentViewer({ isLive }) {
    return `
    <div id="stub-player-content-panel">
        <div id="stub-player-content-resize-handle"></div>
        <div id="stub-player-content-panel-header">
            <h3>📄 Course Review</h3>
            <div class="header-buttons">
                <label class="checkbox-label" title="Show narration text">
                    <input type="checkbox" id="stub-player-show-narration" checked> Narration
                </label>
                ${isLive ? '<button id="stub-player-content-refresh" title="Refresh content from source">🔄 Refresh</button>' : ''}
                <button id="stub-player-content-print" title="Print content">🖨️ Print</button>
                <button id="stub-player-content-new-window" title="Open in new window">↗ New Window</button>
                <button id="stub-player-content-panel-close">Close</button>
            </div>
        </div>
        <div id="stub-player-content-body">
            <div class="content-loading">Loading content...</div>
        </div>
    </div>
    `;
}

/**
 * Initialize Content Viewer Handlers
 */
export function createContentViewerHandlers(context) {
    // isLive comes from context when passed by app.js (detected from window.location)

    // Panel elements
    const contentPanel = document.getElementById('stub-player-content-panel');
    const contentBody = document.getElementById('stub-player-content-body');
    const closeBtn = document.getElementById('stub-player-content-panel-close');
    const refreshBtn = document.getElementById('stub-player-content-refresh');
    const printBtn = document.getElementById('stub-player-content-print');
    const newWindowBtn = document.getElementById('stub-player-content-new-window');
    const showNarrationCheck = document.getElementById('stub-player-show-narration');
    const resizeHandle = document.getElementById('stub-player-content-resize-handle');

    // Close handler
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            contentPanel.classList.remove('visible');
        });
    }

    // Refresh handler
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadContent();
        });
    }

    // Print handler
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            const printContent = contentBody.innerHTML;
            const printWin = window.open('', '_blank');
            printWin.document.write(`
                <html>
                    <head>
                        <title>Course Content Review</title>
                        <link rel="stylesheet" href="/__stub-player/styles.css">
                        <style>
                            body { padding: 20px; font-family: sans-serif; }
                            @media print {
                                button { display: none; }
                            }
                        </style>
                    </head>
                    <body>
                        ${printContent}
                        <script>
                            window.onload = function() { window.print(); window.close(); }
                        </script>
                    </body>
                </html>
            `);
            printWin.document.close();
        });
    }

    // New Window handler
    if (newWindowBtn) {
        newWindowBtn.addEventListener('click', () => {
            window.open('/__content-view', '_blank');
        });
    }

    // Narration toggle
    if (showNarrationCheck) {
        showNarrationCheck.addEventListener('change', (e) => {
            if (contentBody) {
                contentBody.classList.toggle('hide-narration', !e.target.checked);
            }
        });
    }

    // Resize Handler
    if (resizeHandle) {
        let startX, startWidth;

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = parseInt(document.defaultView.getComputedStyle(contentPanel).width, 10);
            document.documentElement.addEventListener('mousemove', doDrag, false);
            document.documentElement.addEventListener('mouseup', stopDrag, false);
            e.preventDefault();
        });

        function doDrag(e) {
            const width = startWidth - (e.clientX - startX); // Dragging left increases width
            if (width > 300 && width < window.innerWidth - 100) {
                contentPanel.style.width = width + 'px';
            }
        }

        function stopDrag() {
            isResizing = false;
            document.documentElement.removeEventListener('mousemove', doDrag, false);
            document.documentElement.removeEventListener('mouseup', stopDrag, false);
        }
    }

    // Core load function
    async function loadContent() {
        if (!contentBody) return;

        // Use preloaded content if available (for static exports)
        if (context.initialContent) {
            contentBody.innerHTML = context.initialContent;
            context.initialContent = null; // Clear so subsequent refreshes (if any) might fetch? 
            // Actually in static export refresh doesn't make sense unless refreshing from... what?
            // If live, we probably prefer fetch.
            return;
        }

        const showNarration = showNarrationCheck ? showNarrationCheck.checked : true;

        contentBody.innerHTML = '<div class="content-loading">Loading content...</div>';

        try {
            const response = await fetch('/__content?includeNarration=' + showNarration);
            if (response.ok) {
                const html = await response.text();
                contentBody.innerHTML = html;
                // Re-apply narration visibility class
                contentBody.classList.toggle('hide-narration', !showNarration);
            } else {
                contentBody.innerHTML = '<div class="content-error">Failed to load content</div>';
            }
        } catch (err) {
            contentBody.innerHTML = '<div class="content-error">Error: ' + err.message + '</div>';
        }
    }

    return {
        loadContent
    };
}
