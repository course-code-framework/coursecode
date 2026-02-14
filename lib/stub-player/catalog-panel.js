/**
 * stub-player/catalog-panel.js - Tabbed Catalog Panel
 *
 * Browsable catalog of UI components, interactions, and assets
 * with rendered previews for components and interactions.
 */

/**
 * Generate the catalog panel HTML (static shell -- data loaded dynamically)
 */
export function generateCatalogPanel() {
    return `
    <div id="stub-player-catalog-panel">
        <div class="catalog-header">
            <div class="catalog-tabs">
                <button class="catalog-tab active" data-catalog-tab="components">🧩 Components</button>
                <button class="catalog-tab" data-catalog-tab="interactions">📝 Interactions</button>
                <button class="catalog-tab" data-catalog-tab="icons">🎨 Icons</button>
                <button class="catalog-tab" data-catalog-tab="assets">📦 Assets</button>
            </div>
            <button id="stub-player-catalog-close" class="catalog-close-btn">✕</button>
        </div>

        <div class="catalog-body">
            <!-- Components Tab -->
            <div class="catalog-tab-content active" data-catalog-content="components">
                <div class="catalog-list" id="catalog-component-list">
                    <div class="catalog-loading">Loading components...</div>
                </div>
            </div>

            <!-- Interactions Tab -->
            <div class="catalog-tab-content" data-catalog-content="interactions">
                <div class="catalog-list" id="catalog-interaction-list">
                    <div class="catalog-loading">Loading interactions...</div>
                </div>
            </div>

            <!-- Icons Tab -->
            <div class="catalog-tab-content" data-catalog-content="icons">
                <div class="catalog-list" id="catalog-icon-list">
                    <div class="catalog-loading">Loading icons...</div>
                </div>
            </div>

            <!-- Assets Tab -->
            <div class="catalog-tab-content" data-catalog-content="assets">
                <div class="catalog-list" id="catalog-asset-list">
                    <div class="catalog-loading">Loading assets...</div>
                </div>
                <div class="catalog-dropzone" id="catalog-dropzone">
                    Drop files here to upload to course assets
                </div>
            </div>
        </div>

        <!-- Preview pane (shows rendered component/interaction) -->
        <div class="catalog-preview-pane" id="catalog-preview-pane" style="display:none;">
            <div class="catalog-preview-header">
                <span id="catalog-preview-title">Preview</span>
                <button id="catalog-preview-close" class="catalog-close-btn">✕</button>
            </div>
            <iframe id="catalog-preview-frame" sandbox="allow-scripts allow-same-origin"></iframe>
            <div class="catalog-preview-code">
                <div class="catalog-preview-code-header">
                    <span>HTML</span>
                    <button id="catalog-preview-copy" class="catalog-copy-btn" title="Copy HTML">📋</button>
                </div>
                <pre id="catalog-preview-code-block"><code></code></pre>
            </div>
        </div>
    </div>
    `;
}

/**
 * Initialize catalog panel event handlers
 */
export function createCatalogPanelHandlers() {
    const panel = document.getElementById('stub-player-catalog-panel');
    if (!panel) return {};

    const closeBtn = document.getElementById('stub-player-catalog-close');
    const previewPane = document.getElementById('catalog-preview-pane');
    const previewFrame = document.getElementById('catalog-preview-frame');
    const previewTitle = document.getElementById('catalog-preview-title');
    const previewClose = document.getElementById('catalog-preview-close');
    const previewCopy = document.getElementById('catalog-preview-copy');
    const previewCode = document.querySelector('#catalog-preview-code-block code');

    let catalogData = null;
    let currentPreviewHtml = '';

    // Close button
    closeBtn?.addEventListener('click', () => {
        panel.classList.remove('visible');
    });

    // Tab switching
    panel.querySelectorAll('.catalog-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.catalogTab;
            panel.querySelectorAll('.catalog-tab').forEach(t => t.classList.remove('active'));
            panel.querySelectorAll('.catalog-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const content = panel.querySelector(`[data-catalog-content="${tabName}"]`);
            if (content) content.classList.add('active');
        });
    });

    // Preview close
    previewClose?.addEventListener('click', closePreview);

    // Copy preview code
    previewCopy?.addEventListener('click', () => {
        if (currentPreviewHtml) {
            navigator.clipboard.writeText(currentPreviewHtml).then(() => {
                previewCopy.textContent = '✓';
                setTimeout(() => { previewCopy.textContent = '📋'; }, 1500);
            });
        }
    });

    // Drop zone for assets
    const dropzone = document.getElementById('catalog-dropzone');
    if (dropzone) {
        dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
        dropzone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            dropzone.classList.add('uploading');
            dropzone.textContent = 'Uploading...';

            const formData = new FormData();
            for (const file of e.dataTransfer.files) {
                formData.append('files', file, file.name);
            }

            try {
                const res = await fetch('/__assets-upload', { method: 'POST', body: formData });
                const result = await res.json();
                dropzone.textContent = result.saved
                    ? `✅ Uploaded ${result.saved.length} file(s)`
                    : '❌ Upload failed';
            } catch {
                dropzone.textContent = '❌ Upload failed';
            }

            dropzone.classList.remove('uploading');
            setTimeout(() => { dropzone.textContent = 'Drop files here to upload to course assets'; }, 3000);
            loadCatalog(); // Refresh asset list
        });
    }

    function closePreview() {
        if (previewPane) previewPane.style.display = 'none';
        if (previewFrame) previewFrame.src = 'about:blank';
        currentPreviewHtml = '';
    }

    function showPreview(type, category, displayName) {
        if (!previewPane || !previewFrame) return;
        previewTitle.textContent = displayName || type;
        previewFrame.src = `/__component-preview?type=${encodeURIComponent(type)}&category=${encodeURIComponent(category)}`;
        previewPane.style.display = 'flex';

        // Get the HTML source for the code block
        fetch(`/__component-preview?type=${encodeURIComponent(type)}&category=${encodeURIComponent(category)}`)
            .then(r => r.text())
            .then(html => {
                // Extract content between <div class="preview-wrap"> and its closing </div>
                const match = html.match(/<div class="preview-wrap">\s*([\s\S]*?)\s*<\/div>\s*<\/body/);
                if (match) {
                    currentPreviewHtml = match[1].trim();
                    previewCode.textContent = currentPreviewHtml;
                }
            })
            .catch(() => {});
    }

    function renderComponentList(components) {
        const list = document.getElementById('catalog-component-list');
        if (!list) return;

        const sorted = Object.entries(components).sort((a, b) => a[0].localeCompare(b[0]));
        list.innerHTML = sorted.map(([type, info]) => `
            <div class="catalog-item" data-type="${type}" data-category="component">
                <div class="catalog-item-name">${type}</div>
                ${info.engagementTracking ? `<span class="catalog-badge">${info.engagementTracking}</span>` : ''}
            </div>
        `).join('');

        // Click to preview
        list.querySelectorAll('.catalog-item').forEach(item => {
            item.addEventListener('click', () => {
                list.querySelectorAll('.catalog-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                showPreview(item.dataset.type, 'component', item.dataset.type);
            });
        });
    }

    function renderInteractionList(interactions) {
        const list = document.getElementById('catalog-interaction-list');
        if (!list) return;

        const sorted = Object.entries(interactions).sort((a, b) => a[0].localeCompare(b[0]));
        list.innerHTML = sorted.map(([type, info]) => `
            <div class="catalog-item" data-type="${type}" data-category="interaction">
                <div class="catalog-item-name">${type}</div>
                ${info.description ? `<span class="catalog-description">${info.description}</span>` : ''}
            </div>
        `).join('');

        list.querySelectorAll('.catalog-item').forEach(item => {
            item.addEventListener('click', () => {
                list.querySelectorAll('.catalog-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                showPreview(item.dataset.type, 'interaction', item.dataset.type);
            });
        });
    }

    function renderAssetList(assets) {
        const list = document.getElementById('catalog-asset-list');
        if (!list) return;

        const groups = assets?.groups || {};
        if (Object.keys(groups).length === 0) {
            list.innerHTML = '<div class="catalog-empty">No assets found in course directory.</div>';
            return;
        }

        let html = '';
        const iconMap = { images: '🖼️', audio: '🔊', docs: '📄', widgets: '🧩', video: '🎬' };

        for (const [folder, files] of Object.entries(groups)) {
            if (files.length === 0) continue;
            html += `<div class="catalog-asset-group">
                <div class="catalog-asset-group-header">${iconMap[folder] || '📁'} ${folder} (${files.length})</div>
                ${files.map(f => `<div class="catalog-asset-file">${f}</div>`).join('')}
            </div>`;
        }

        list.innerHTML = html || '<div class="catalog-empty">No assets found.</div>';
    }

    function renderIconList(icons) {
        const list = document.getElementById('catalog-icon-list');
        if (!list) return;

        if (!icons || Object.keys(icons).length === 0) {
            list.innerHTML = '<div class="catalog-empty">No icons found.</div>';
            return;
        }

        let html = '';
        for (const [category, names] of Object.entries(icons)) {
            if (category === '_svgs') continue;
            html += `<div class="catalog-icon-category">
                <div class="catalog-icon-category-header">${category} (${names.length})</div>
                <div class="catalog-icon-grid">
                    ${names.map(name => `
                        <button class="catalog-icon-item" data-icon-name="${name}" title="${name}">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="catalog-icon-svg">${icons._svgs?.[name] || ''}</svg>
                            <span class="catalog-icon-label">${name}</span>
                        </button>
                    `).join('')}
                </div>
            </div>`;
        }

        list.innerHTML = html;

        // Click to copy
        list.querySelectorAll('.catalog-icon-item').forEach(item => {
            item.addEventListener('click', () => {
                const name = item.dataset.iconName;
                const text = `iconManager.getIcon('${name}')`;
                navigator.clipboard.writeText(text).then(() => {
                    item.classList.add('copied');
                    // Show tooltip
                    const tip = document.createElement('span');
                    tip.className = 'catalog-icon-tooltip';
                    tip.textContent = 'Copied!';
                    item.appendChild(tip);
                    setTimeout(() => {
                        item.classList.remove('copied');
                        tip.remove();
                    }, 600);
                });
            });
        });
    }

    async function loadCatalog() {
        try {
            const res = await fetch('/__catalog');
            catalogData = await res.json();

            if (catalogData.components) renderComponentList(catalogData.components);
            if (catalogData.interactions) renderInteractionList(catalogData.interactions);
            if (catalogData.icons) renderIconList(catalogData.icons);
            if (catalogData.assets) renderAssetList(catalogData.assets);
        } catch (err) {
            console.error('[Catalog] Failed to load:', err);
        }
    }

    return { loadCatalog };
}
