/**
 * @file document-gallery.js
 * @description Sidebar document gallery with auto-discovered thumbnails.
 * Renders a collapsible gallery section below the navigation menu.
 * Documents open in the existing lightbox on click.
 *
 * Config (in course-config.js → navigation.documentGallery):
 *   enabled: boolean       — Master toggle
 *   directory: string      — Path relative to course/ for auto-discovery
 *   label: string          — Gallery section header label
 *   icon: string           — Lucide icon name for header
 *   allowDownloads: boolean — Show download button in lightbox
 *   fileTypes: string[]    — File extensions to include
 */

import { iconManager } from '../utilities/icons.js';
import { logger } from '../utilities/logger.js';
import { open as openLightbox } from '../components/ui-components/lightbox.js';

/** @type {HTMLElement|null} */
let galleryContainer = null;

/** @type {boolean} */
let isExpanded = false;

/** @type {object|null} */
let galleryConfig = null;

/**
 * Initialize the document gallery.
 * @param {object} courseConfig - Full course configuration object
 */
export async function init(courseConfig) {
    galleryConfig = courseConfig.navigation?.documentGallery;

    if (!galleryConfig?.enabled) {
        logger.debug('[DocumentGallery] Disabled or not configured');
        return;
    }

    galleryContainer = document.getElementById('sidebar-gallery');
    if (!galleryContainer) {
        logger.warn('[DocumentGallery] #sidebar-gallery element not found');
        return;
    }

    // Fetch the gallery manifest
    const items = await _fetchManifest();
    if (!items || items.length === 0) {
        logger.debug('[DocumentGallery] No documents found');
        return;
    }

    // Render the gallery
    _render(items);

    // Show the gallery container
    galleryContainer.removeAttribute('hidden');

    // Listen for sidebar close to reset gallery state
    _setupSidebarResetListener();

    logger.debug(`[DocumentGallery] Initialized with ${items.length} items`);
}

/**
 * Fetch the gallery manifest from the build output.
 * @returns {Promise<object[]|null>} Array of document items or null
 */
async function _fetchManifest() {
    try {
        const response = await fetch('./_gallery-manifest.json');
        if (!response.ok) {
            // Manifest doesn't exist yet (dev mode or no docs) — not an error
            logger.debug('[DocumentGallery] No gallery manifest found (this is normal in dev mode)');
            return null;
        }
        const manifest = await response.json();
        return manifest.items || [];
    } catch (_error) {
        logger.debug('[DocumentGallery] Could not load gallery manifest');
        return null;
    }
}

/**
 * Render the gallery header and thumbnail grid.
 * @param {object[]} items - Array of document items from manifest
 */
function _render(items) {
    const label = galleryConfig.label || 'Resources';
    const iconName = galleryConfig.icon || 'file-text';

    const headerIcon = iconManager.getIcon(iconName, { size: 'sm' });
    const chevronIcon = iconManager.getIcon('chevron-down', { size: 'sm' });

    galleryContainer.innerHTML = `
        <button class="sidebar-gallery-header" 
                aria-expanded="false" 
                aria-controls="sidebar-gallery-content"
                data-testid="gallery-toggle">
            <span class="sidebar-gallery-header-icon" aria-hidden="true">${headerIcon}</span>
            <span class="sidebar-gallery-header-label">${label}</span>
            <span class="sidebar-gallery-header-count">(${items.length})</span>
            <span class="sidebar-gallery-header-chevron" aria-hidden="true">${chevronIcon}</span>
        </button>
        <div id="sidebar-gallery-content" class="sidebar-gallery-content" role="region" aria-label="${label}">
            <div class="sidebar-gallery-grid">
                ${items.map(item => _renderItem(item)).join('')}
            </div>
        </div>
    `;

    // Wire up toggle
    const header = galleryContainer.querySelector('.sidebar-gallery-header');
    header.addEventListener('click', _toggleGallery);
}

/**
 * Render a single gallery item thumbnail.
 * @param {object} item - Document item { src, type, label, thumbnail? }
 * @returns {string} HTML string for the item
 */
function _renderItem(item) {
    const thumbHtml = _renderThumbnail(item);
    const displayLabel = item.label || _formatFilename(item.src);
    const downloadHtml = galleryConfig.allowDownloads
        ? `<a class="sidebar-gallery-download" href="${item.src}" download title="Download" aria-label="Download ${displayLabel}">${iconManager.getIcon('download', { size: 'xs' })}</a>`
        : '';

    // Use a button for accessibility — lightbox opens on click
    return `
        <button class="sidebar-gallery-item" 
                data-action="gallery-open"
                data-gallery-src="${item.src}"
                data-gallery-type="${item.type}"
                data-testid="gallery-item-${_slugify(item.src)}"
                title="${displayLabel}"
                type="button">
            <div class="sidebar-gallery-thumb">
                ${thumbHtml}
                ${downloadHtml}
            </div>
            <span class="sidebar-gallery-label">${displayLabel}</span>
        </button>
    `;
}

/**
 * Render the thumbnail content based on document type.
 * @param {object} item - Document item
 * @returns {string} HTML for the thumbnail interior
 */
function _renderThumbnail(item) {
    switch (item.type) {
        case 'image':
            return `<img class="sidebar-gallery-thumb-img" src="${item.src}" alt="${item.label || ''}" loading="lazy">`;

        case 'pdf':
            if (item.thumbnail) {
                return `<img class="sidebar-gallery-thumb-img" src="${item.thumbnail}" alt="${item.label || 'PDF document'}" loading="lazy">`;
            }
            return `
                <div class="sidebar-gallery-thumb-pdf">
                    <span class="sidebar-gallery-thumb-pdf-icon" aria-hidden="true">
                        ${iconManager.getIcon('file-text', { size: 'lg' })}
                    </span>
                    <span class="sidebar-gallery-thumb-pdf-badge">PDF</span>
                </div>
            `;

        case 'markdown':
            // Markdown thumbnails are rendered async after init
            return `
                <div class="sidebar-gallery-thumb-md" data-md-src="${item.src}">
                    <div class="sidebar-gallery-thumb-md-content">
                        <p style="opacity: 0.5; font-style: italic;">Loading...</p>
                    </div>
                </div>
            `;

        default:
            return `
                <div class="sidebar-gallery-thumb-pdf">
                    <span class="sidebar-gallery-thumb-pdf-icon" aria-hidden="true">
                        ${iconManager.getIcon('file', { size: 'lg' })}
                    </span>
                </div>
            `;
    }
}

/**
 * Toggle gallery expanded/collapsed state.
 */
function _toggleGallery() {
    isExpanded = !isExpanded;

    const sidebar = galleryContainer.closest('.sidebar');

    galleryContainer.classList.toggle('expanded', isExpanded);

    // Update ARIA
    const header = galleryContainer.querySelector('.sidebar-gallery-header');
    header.setAttribute('aria-expanded', String(isExpanded));

    // Inverse collapse: toggle nav visibility
    if (sidebar) {
        sidebar.classList.toggle('gallery-expanded', isExpanded);
    }

    // Load markdown thumbnails on first expand
    if (isExpanded) {
        _loadMarkdownThumbnails();
    }
}

/**
 * Reset gallery to collapsed state.
 * Called when sidebar is closed.
 */
function _resetGallery() {
    if (!isExpanded || !galleryContainer) return;

    isExpanded = false;
    galleryContainer.classList.remove('expanded');

    const header = galleryContainer.querySelector('.sidebar-gallery-header');
    if (header) {
        header.setAttribute('aria-expanded', 'false');
    }

    const sidebar = galleryContainer.closest('.sidebar');
    if (sidebar) {
        sidebar.classList.remove('gallery-expanded');
    }
}

/**
 * Set up listener for sidebar close to reset gallery state.
 * Uses transitionend on the sidebar to detect when it finishes collapsing.
 */
function _setupSidebarResetListener() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    sidebar.addEventListener('transitionend', (event) => {
        // Only respond to the sidebar's own transition (not children)
        if (event.target !== sidebar) return;

        // Check if sidebar is now collapsed
        if (sidebar.classList.contains('collapsed')) {
            _resetGallery();
        }
    });

    // Also handle click-based open/close for gallery items
    galleryContainer.addEventListener('click', (event) => {
        // Ignore clicks on download links
        if (event.target.closest('.sidebar-gallery-download')) return;

        const item = event.target.closest('[data-action="gallery-open"]');
        if (!item) return;

        event.preventDefault();
        const src = item.dataset.gallerySrc;
        const type = item.dataset.galleryType;
        _openInLightbox(src, type);
    });
}

/**
 * Open a document in the lightbox.
 * @param {string} src - Document source path
 * @param {string} type - Document type (pdf, markdown, image)
 */
function _openInLightbox(src) {
    openLightbox(src, '');
}

/**
 * Load and render markdown thumbnails (deferred until gallery is expanded).
 */
async function _loadMarkdownThumbnails() {
    const mdThumbs = galleryContainer.querySelectorAll('[data-md-src]');
    for (const thumb of mdThumbs) {
        const src = thumb.dataset.mdSrc;
        if (thumb.dataset.loaded) continue;
        thumb.dataset.loaded = 'true';

        try {
            const response = await fetch(src);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();

            // Simple markdown-to-HTML for thumbnail preview (first ~500 chars)
            const preview = _simpleMarkdownToHtml(text.slice(0, 500));
            const content = thumb.querySelector('.sidebar-gallery-thumb-md-content');
            if (content) {
                content.innerHTML = preview;
            }
        } catch (_error) {
            const content = thumb.querySelector('.sidebar-gallery-thumb-md-content');
            if (content) {
                content.innerHTML = '<p style=\'opacity: 0.5; font-style: italic;\'>Preview unavailable</p>';
            }
        }
    }
}

/**
 * Simple markdown to HTML converter for thumbnail previews.
 * Only handles basic elements (headings, paragraphs, lists).
 * @param {string} md - Raw markdown text
 * @returns {string} HTML string
 */
function _simpleMarkdownToHtml(md) {
    return md
        .split('\n')
        .map(line => {
            const trimmed = line.trim();
            if (!trimmed) return '';
            if (trimmed.startsWith('# ')) return `<h1>${trimmed.slice(2)}</h1>`;
            if (trimmed.startsWith('## ')) return `<h2>${trimmed.slice(3)}</h2>`;
            if (trimmed.startsWith('### ')) return `<h2>${trimmed.slice(4)}</h2>`;
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return `<li>${trimmed.slice(2)}</li>`;
            if (/^\d+\.\s/.test(trimmed)) return `<li>${trimmed.replace(/^\d+\.\s/, '')}</li>`;
            return `<p>${trimmed}</p>`;
        })
        .join('');
}

/**
 * Format a filename for display (remove extension, replace separators).
 * @param {string} src - File path
 * @returns {string} Formatted display name
 */
function _formatFilename(src) {
    const name = src.split('/').pop();
    return name
        .replace(/\.[^.]+$/, '')        // Remove extension
        .replace(/[_-]/g, ' ')          // Replace separators with spaces
        .replace(/\b\w/g, c => c.toUpperCase()); // Title case
}

/**
 * Create a URL-safe slug from a file path.
 * @param {string} src - File path
 * @returns {string} Slugified string
 */
function _slugify(src) {
    return src
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}
