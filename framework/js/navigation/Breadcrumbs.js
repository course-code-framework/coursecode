/**
 * @file Breadcrumbs.js
 * @description Simple text-based breadcrumbs for course navigation.
 * Shows current location in the slide area. Hidden when sidebar is open.
 * Clicking opens the sidebar.
 */

import { eventBus } from '../core/event-bus.js';
import { courseConfig } from '../../../course/course-config.js';
import * as AppUI from '../app/AppUI.js';
import * as NavigationActions from './NavigationActions.js';
import { logger } from '../utilities/logger.js';

// DOM reference
let breadcrumbsElement = null;
let isInitialized = false;

// Cache the structure for path lookups
let structureCache = null;

/**
 * Checks if breadcrumbs are enabled in config.
 * @returns {boolean}
 */
function isEnabled() {
    return courseConfig?.navigation?.breadcrumbs?.enabled === true;
}

/**
 * Builds the path to a slide by searching the structure tree.
 * @param {string} slideId - The target slide ID
 * @returns {Array<{id: string, label: string, type: string}>} Path segments from root to slide
 */
function buildPath(slideId) {
    if (!structureCache) {
        structureCache = courseConfig?.structure || [];
    }

    const path = [];

    function search(nodes, currentPath) {
        for (const node of nodes) {
            if (!node) continue;

            if (node.type === 'section') {
                const sectionLabel = node.menu?.label || node.title || node.id || 'Section';
                const sectionPath = [...currentPath, { id: node.id, label: sectionLabel, type: 'section' }];

                if (node.children) {
                    const found = search(node.children, sectionPath);
                    if (found) return found;
                }
            } else if (node.type === 'slide' || node.type === 'assessment') {
                if (node.id === slideId) {
                    const slideLabel = node.menu?.label || node.title || node.id;
                    return [...currentPath, { id: node.id, label: slideLabel, type: node.type }];
                }
            }
        }
        return null;
    }

    return search(structureCache, path) || [];
}

/**
 * Renders the breadcrumbs HTML.
 * @param {Array<{id: string, label: string, type: string}>} path - Path segments
 * @returns {string} HTML string
 */
function renderBreadcrumbs(path) {
    if (path.length === 0) {
        return '';
    }

    const segments = path.map((segment, index) => {
        const isLast = index === path.length - 1;
        return `<span class="breadcrumbs-segment" ${isLast ? 'aria-current="page"' : ''}>${escapeHtml(segment.label)}</span>`;
    });

    return segments.join('<span class="breadcrumbs-separator" aria-hidden="true">›</span>');
}

/**
 * Escapes HTML entities to prevent XSS.
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Gets the first slide ID from the course structure.
 * @returns {string|null} The first slide ID or null if not found
 */
function getFirstSlideId() {
    if (!structureCache) {
        structureCache = courseConfig?.structure || [];
    }

    function findFirst(nodes) {
        for (const node of nodes) {
            if (!node) continue;
            if (node.type === 'slide') {
                return node.id;
            }
            if (node.type === 'section' && node.children) {
                const found = findFirst(node.children);
                if (found) return found;
            }
        }
        return null;
    }

    return findFirst(structureCache);
}

/**
 * Updates the breadcrumbs display for the given slide.
 * @param {string} slideId - The current slide ID
 */
function update(slideId) {
    if (!isInitialized || !breadcrumbsElement) return;

    const path = buildPath(slideId);
    
    // Hide breadcrumbs on the first slide (no meaningful hierarchy to show)
    const firstSlideId = getFirstSlideId();
    if (slideId === firstSlideId) {
        breadcrumbsElement.classList.add('hidden');
        return;
    }
    
    // Hide breadcrumbs when in an assessment
    const currentNode = path[path.length - 1];
    if (currentNode && currentNode.type === 'assessment') {
        breadcrumbsElement.classList.add('hidden');
        return;
    }
    breadcrumbsElement.classList.remove('hidden');
    
    breadcrumbsElement.innerHTML = renderBreadcrumbs(path);

    // Update aria-label for screen readers
    const pathLabels = path.map(s => s.label).join(' > ');
    breadcrumbsElement.setAttribute('aria-label', `Breadcrumb: ${pathLabels}. Click to open navigation menu.`);
}

/**
 * Handles click on breadcrumbs - opens the sidebar.
 */
function handleClick() {
    if (typeof AppUI.openSidebar === 'function') {
        AppUI.openSidebar();
    } else if (typeof AppUI.toggleSidebar === 'function') {
        AppUI.toggleSidebar();
    }
}

/**
 * Initializes the breadcrumbs component.
 * Creates the DOM element and sets up event listeners.
 */
export function init() {
    if (isInitialized) {
        logger.warn('[Breadcrumbs] Already initialized');
        return;
    }

    if (!isEnabled()) {
        logger.debug('[Breadcrumbs] Disabled in config');
        return;
    }

    // Find the main content area to insert breadcrumbs
    const mainContent = document.getElementById('content');
    if (!mainContent) {
        logger.warn('[Breadcrumbs] Could not find #content element');
        return;
    }

    // Create breadcrumbs element
    breadcrumbsElement = document.createElement('nav');
    breadcrumbsElement.className = 'breadcrumbs';
    breadcrumbsElement.setAttribute('role', 'navigation');
    breadcrumbsElement.setAttribute('aria-label', 'Breadcrumb navigation');
    breadcrumbsElement.setAttribute('tabindex', '0');
    breadcrumbsElement.setAttribute('data-tooltip', 'Click to open navigation menu');

    // Insert at the beginning of main content
    mainContent.insertBefore(breadcrumbsElement, mainContent.firstChild);

    // Handle click to open sidebar
    breadcrumbsElement.addEventListener('click', handleClick);
    breadcrumbsElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
        }
    });

    // Listen for navigation changes
    eventBus.on('navigation:changed', ({ toSlideId }) => {
        update(toSlideId);
    });

    isInitialized = true;
    logger.debug('[Breadcrumbs] Initialized');

    // Update for current slide (breadcrumbs init after navigation)
    if (NavigationActions.isReady()) {
        const currentSlideId = NavigationActions.getCurrentSlideId();
        if (currentSlideId) {
            update(currentSlideId);
        }
    }
}

/**
 * Destroys the breadcrumbs component.
 */
export function destroy() {
    if (breadcrumbsElement) {
        breadcrumbsElement.remove();
        breadcrumbsElement = null;
    }
    isInitialized = false;
    structureCache = null;
}

export default { init, destroy, update };
