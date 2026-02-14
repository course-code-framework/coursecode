/**
 * @file NavigationUI.js
 * @description Renders and manages the UI components for course navigation.
 * @author Seth
 * @version 1.2.0
 */

import { logger } from '../utilities/logger.js';
import { iconManager } from '../utilities/icons.js';

// Cache DOM elements for performance
const navMenu = document.getElementById('menu');
const prevButton = document.getElementById('prevBtn');
const nextButton = document.getElementById('nextBtn');
const engagementIndicator = document.getElementById('engagement-indicator');
const engagementProgress = engagementIndicator?.querySelector('.engagement-progress');
const engagementCheckmark = engagementIndicator?.querySelector('.engagement-checkmark');

// Header progress elements
const headerProgress = document.getElementById('header-progress');
const headerProgressText = headerProgress?.querySelector('.header-progress-text');
const headerProgressFill = headerProgress?.querySelector('.header-progress-fill');
const headerProgressBar = headerProgress?.querySelector('.header-progress-bar');

// Track if DOM has been validated
let isDOMValidated = false;

/**
 * Validates that required DOM elements are present.
 * @private
 * @throws {Error} If required DOM elements are missing
 */
function _ensureDOMReady() {
    const missing = [];
    if (!navMenu) missing.push('#menu');
    if (!prevButton) missing.push('#prevBtn');
    if (!nextButton) missing.push('#nextBtn');

    if (missing.length > 0) {
        logger.fatal(`NavigationUI: Required DOM elements not found: ${missing.join(', ')}. Check framework/index.html.`, { domain: 'navigation', operation: 'NavigationUI._ensureDOMReady' });
        return;
    }

    // Inject icons into prev/next buttons using iconManager
    // Insert chevron-left at the start of prevButton
    prevButton.insertAdjacentHTML('afterbegin', iconManager.getIcon('chevron-left'));

    // Append chevron-right at the end of nextButton
    nextButton.insertAdjacentHTML('beforeend', iconManager.getIcon('chevron-right'));

    isDOMValidated = true;
}

/**
 * Renders the navigation sidebar menu based on the hierarchical menu tree structure.
 * @param {object[]} menuTree - The hierarchical menu tree from getMenuTree().
 * @param {string[]} visitedSlides - An array of slide IDs that have been visited.
 * @param {Map<string, {allowed: boolean, message: string|null}>} accessibilityMap - A map of slide accessibility states.
 * @throws {Error} If parameters are invalid or DOM elements are missing
 */
export function renderMenu(menuTree, visitedSlides, accessibilityMap = new Map()) {
    // Validate DOM on first use
    if (!isDOMValidated) {
        _ensureDOMReady();
    }

    // Validate parameters
    if (!Array.isArray(menuTree)) {
        throw new Error('NavigationUI.renderMenu: menuTree must be an array');
    }
    if (!Array.isArray(visitedSlides)) {
        throw new Error('NavigationUI.renderMenu: visitedSlides must be an array');
    }
    if (!(accessibilityMap instanceof Map)) {
        throw new Error('NavigationUI.renderMenu: accessibilityMap must be a Map');
    }

    navMenu.innerHTML = `<ul class="nav-list">${renderMenuItems(menuTree, visitedSlides, accessibilityMap)}</ul>`;

    // Add or update sidebar footer with settings & exit button
    const sidebar = navMenu.closest('.sidebar');
    if (sidebar) {
        let sidebarFooter = sidebar.querySelector('.nav-sidebar-footer');
        if (!sidebarFooter) {
            sidebarFooter = document.createElement('div');
            sidebarFooter.className = 'nav-sidebar-footer';

            // Horizontal footer bar: exit left, settings icons right
            sidebarFooter.innerHTML = `
                <button class="sidebar-exit-link" data-action="exit-course" data-testid="nav-sidebar-exit" data-tooltip="Exit Course">
                    ${iconManager.getIcon('log-out', { size: 'sm' })}
                    <span>Exit</span>
                </button>
                <div class="sidebar-settings-icons">
                    <button class="sidebar-icon-btn" data-action="toggle-theme" data-testid="sidebar-theme-toggle" data-tooltip="Toggle Dark Mode">
                        ${iconManager.getIcon('moon', { size: 'sm' })}
                    </button>
                    <button class="sidebar-icon-btn" data-action="toggle-font-size" data-testid="sidebar-font-size-toggle" data-tooltip="Toggle Font Size">
                        <span class="icon-text">A+</span>
                    </button>
                    <button class="sidebar-icon-btn" data-action="toggle-contrast" data-testid="sidebar-contrast-toggle" data-tooltip="Toggle High Contrast">
                        ${iconManager.getIcon('contrast', { size: 'sm' })}
                    </button>
                </div>
            `;
            sidebar.appendChild(sidebarFooter);
        }
    }

    // Tooltips auto-initialize via event delegation - no manual init needed

    // Add event listeners for collapsible sections
    const sectionToggles = navMenu.querySelectorAll('.section-toggle');
    sectionToggles.forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            const section = toggle.closest('.nav-section');
            const isExpanded = section.classList.toggle('expanded');
            toggle.setAttribute('aria-expanded', isExpanded);
        });
    });
}

/**
 * Recursively checks if all children (slides) in a section are locked.
 * @private
 * @param {object[]} children - Array of child items (can include nested sections).
 * @param {Map<string, {allowed: boolean, message: string|null}>} accessibilityMap - A map of slide accessibility states.
 * @returns {boolean} True if all children are locked, false otherwise.
 */
function areAllChildrenLocked(children, accessibilityMap) {
    if (!children || children.length === 0) {
        return false;
    }

    let allLocked = true;
    let hasSlides = false;

    for (const child of children) {
        if (child.type === 'section') {
            // Recursively check nested sections
            if (!areAllChildrenLocked(child.children || [], accessibilityMap)) {
                allLocked = false;
                break;
            }
        } else {
            // It's a slide - check if it's accessible
            hasSlides = true;
            const access = accessibilityMap.get(child.id);
            if (!access || access.allowed !== false) {
                // At least one child is accessible
                allLocked = false;
                break;
            }
        }
    }

    // Only return true if we found slides and they're all locked
    return hasSlides && allLocked;
}

/**
 * Recursively renders menu items (sections and slides).
 * @private
 * @param {object[]} items - Array of menu items (sections or slides).
 * @param {string[]} visitedSlides - Array of visited slide IDs.
 * @param {Map<string, {allowed: boolean, message: string|null}>} accessibilityMap - A map of slide accessibility states.
 * @returns {string} HTML string for the menu items.
 */
function renderMenuItems(items, visitedSlides, accessibilityMap) {
    return items.map(item => {
        if (item.type === 'section') {
            const expandedClass = item.defaultExpanded ? 'expanded' : '';
            const collapsibleClass = item.collapsible !== false ? 'collapsible' : '';

            // Check if all children are locked
            const allChildrenLocked = areAllChildrenLocked(item.children || [], accessibilityMap);
            const allLockedClass = allChildrenLocked ? 'all-children-locked' : '';

            // Debug logging
            if (allChildrenLocked) {
                logger.debug(`[NavigationUI] Section "${item.label}" (${item.id}) has all children locked`);
            }

            return `
                <li class="nav-section ${expandedClass} ${collapsibleClass} ${allLockedClass}" data-section-id="${item.id}" data-testid="nav-section-${item.id}">
                    <button class="section-toggle" aria-expanded="${item.defaultExpanded}" aria-controls="section-${item.id}" data-testid="nav-section-toggle-${item.id}">
                        ${item.icon ? `<span class="section-icon" aria-hidden="true">${iconManager.getIcon(item.icon)}</span>` : ''}
                        <span class="section-label">${item.label}</span>
                        <span class="toggle-indicator" aria-hidden="true">${iconManager.getIcon('chevron-right')}</span>
                    </button>
                    <ul class="section-children" id="section-${item.id}">
                        ${renderMenuItems(item.children || [], visitedSlides, accessibilityMap)}
                    </ul>
                </li>
            `;
        } else {
            // Slide item
            const visitedClass = visitedSlides.includes(item.id) ? 'visited' : '';
            const access = accessibilityMap.get(item.id);
            const isLocked = access && access.allowed === false;
            const lockedClass = isLocked ? 'locked' : '';
            const ariaDisabled = isLocked ? 'aria-disabled="true"' : '';
            const tabIndex = isLocked ? 'tabindex="-1"' : '';

            // Use JS tooltip via data-tooltip attribute (no .tooltip class needed)
            const tooltipData = isLocked && access.message ? `data-tooltip="${access.message}"` : '';
            const ariaLabel = isLocked && access.message
                ? `aria-label="Go to ${item.label} (${access.message})"`
                : `aria-label="Go to ${item.label}"`;

            return `
                <li class="nav-item ${visitedClass} ${lockedClass}" data-slide-id="${item.id}" data-slide-index="${item.slideIndex}" data-action="nav-menu-item" data-testid="nav-menu-item-${item.id}">
                    <button type="button" ${ariaLabel} ${ariaDisabled} ${tabIndex} ${tooltipData}>
                        ${item.icon ? `<span class="slide-icon" aria-hidden="true">${iconManager.getIcon(item.icon)}</span>` : ''}
                        <span class="slide-label">${item.label}</span>
                        ${isLocked ? `<span class="lock-icon" aria-hidden="true">${iconManager.getIcon('lock')}</span>` : ''}
                    </button>
                </li>
            `;
        }
    }).join('');
}

/**
 * Highlights the active slide in the navigation menu and manages section expansion.
 * Collapses all collapsible sections except the one containing the active slide.
 * @param {string} slideId - The ID of the slide to mark as active.
 * @throws {Error} If slideId is invalid
 */
export function setActiveItem(slideId) {
    if (!slideId || typeof slideId !== 'string') {
        throw new Error(`NavigationUI.setActiveItem: Invalid slideId: ${slideId}`);
    }
    if (!navMenu) return;

    // Find the active item and its parent section
    const activeItem = navMenu.querySelector(`.nav-item[data-slide-id="${slideId}"]`);
    const activeSection = activeItem?.closest('.nav-section');

    // Update active state on all items
    const items = navMenu.querySelectorAll('.nav-item');
    items.forEach(item => {
        const isActive = item.dataset.slideId === slideId;
        item.classList.toggle('active', isActive);
        item.querySelector('button').setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    // Manage section expansion: collapse others, expand the active one
    const sections = navMenu.querySelectorAll('.nav-section.collapsible');
    sections.forEach(section => {
        const toggle = section.querySelector('.section-toggle');
        if (!toggle) return;

        if (section === activeSection) {
            // Expand the section containing the active slide
            section.classList.add('expanded');
            toggle.setAttribute('aria-expanded', 'true');
        } else {
            // Collapse other collapsible sections
            section.classList.remove('expanded');
            toggle.setAttribute('aria-expanded', 'false');
        }
    });
}

/**
 * Updates the enabled/disabled state and ARIA attributes of the previous and next buttons.
 * @param {object} config - Navigation state with isFirstSlide, isLastSlide, nextBlocked, nextBlockedMessage, engagementProgress.
 */
export function updateNavButtonState(config) {
    // New API: config object only
    const { isFirstSlide, isLastSlide, nextBlocked = false, nextBlockedMessage = null, engagementProgress = null } = config;

    // Update previous button (no tooltip - icon is self-explanatory)
    if (prevButton) {
        prevButton.disabled = isFirstSlide;
        prevButton.setAttribute('aria-disabled', String(isFirstSlide));
    }

    // Update next button
    if (nextButton) {
        const shouldDisable = isLastSlide || nextBlocked;
        nextButton.disabled = shouldDisable;
        nextButton.setAttribute('aria-disabled', String(shouldDisable));

        // Manage gated state for progressive ring indicator
        // Only show ring when blocked due to engagement (has progress data and not complete)
        if (nextBlocked && engagementProgress !== null && engagementProgress < 100) {
            nextButton.classList.add('gated');
            nextButton.classList.remove('engagement-complete');
            nextButton.style.setProperty('--engagement-progress', engagementProgress);
        } else if (!nextButton.classList.contains('engagement-complete')) {
            // Clear gated state unless animation is playing
            nextButton.classList.remove('gated');
            nextButton.style.removeProperty('--engagement-progress');
        }

        // Only show tooltip when blocked with a specific message (provides real value)
        // Skip tooltips for normal states - arrow icon is universally understood
        if (nextBlocked && nextBlockedMessage) {
            nextButton.setAttribute('data-tooltip', nextBlockedMessage);
            nextButton.setAttribute('aria-label', `Next (${nextBlockedMessage})`);
        } else {
            nextButton.removeAttribute('data-tooltip');
            nextButton.setAttribute('aria-label', isLastSlide ? 'Next (No next slide)' : 'Next');
        }
    }
}

/**
 * Triggers the completion animation on the next button.
 * Called by the engagement:complete event handler.
 */
export function triggerEngagementCompleteAnimation() {
    if (!nextButton) return;

    nextButton.classList.add('gated', 'engagement-complete');
    nextButton.style.setProperty('--engagement-progress', 100);

    // Remove classes after animation completes
    setTimeout(() => {
        nextButton.classList.remove('gated', 'engagement-complete');
        nextButton.style.removeProperty('--engagement-progress');
    }, 500);
}

/**
 * Adds a 'visited' class to a menu item.
 * @param {string} slideId - The ID of the slide to mark as visited.
 * @throws {Error} If slideId is invalid
 */
export function markAsVisited(slideId) {
    if (!slideId || typeof slideId !== 'string') {
        throw new Error(`NavigationUI.markAsVisited: Invalid slideId: ${slideId}`);
    }
    if (!navMenu) return;
    const item = navMenu.querySelector(`.nav-item[data-slide-id="${slideId}"]`);
    if (item) {
        item.classList.add('visited');
    }
}

/**
 * Removes the 'visited' class from a menu item.
 * @param {string} slideId - The ID of the slide to mark as unvisited.
 * @throws {Error} If slideId is invalid
 */
export function markAsUnvisited(slideId) {
    if (!slideId || typeof slideId !== 'string') {
        throw new Error(`NavigationUI.markAsUnvisited: Invalid slideId: ${slideId}`);
    }
    if (!navMenu) return;
    const item = navMenu.querySelector(`.nav-item[data-slide-id="${slideId}"]`);
    if (item) {
        item.classList.remove('visited');
    }
}

/**
 * Marks a slide as locked (inaccessible) in the navigation menu.
 * @param {string} slideId - The ID of the slide to mark as locked.
 * @throws {Error} If slideId is invalid
 */
export function markAsLocked(slideId) {
    if (!slideId || typeof slideId !== 'string') {
        throw new Error(`NavigationUI.markAsLocked: Invalid slideId: ${slideId}`);
    }
    if (!navMenu) return;
    const item = navMenu.querySelector(`.nav-item[data-slide-id="${slideId}"]`);
    if (item) {
        item.classList.add('locked');
        const link = item.querySelector('button');
        if (link) {
            link.setAttribute('aria-disabled', 'true');
            link.setAttribute('tabindex', '-1');

            // Add lock icon if not already present
            if (!link.querySelector('.lock-icon')) {
                const lockIconSpan = document.createElement('span');
                lockIconSpan.className = 'lock-icon';
                lockIconSpan.setAttribute('aria-hidden', 'true');
                lockIconSpan.innerHTML = iconManager.getIcon('lock');
                link.appendChild(lockIconSpan);
            }
        }
    }
}

/**
 * Removes the locked state from a slide in the navigation menu.
 * @param {string} slideId - The ID of the slide to unlock.
 * @throws {Error} If slideId is invalid
 */
export function markAsUnlocked(slideId) {
    if (!slideId || typeof slideId !== 'string') {
        throw new Error(`NavigationUI.markAsUnlocked: Invalid slideId: ${slideId}`);
    }
    if (!navMenu) return;
    const item = navMenu.querySelector(`.nav-item[data-slide-id="${slideId}"]`);
    if (item) {
        item.classList.remove('locked');
        const link = item.querySelector('button');
        if (link) {
            link.removeAttribute('aria-disabled');
            link.removeAttribute('tabindex');

            // Remove lock icon if present
            const lockIcon = link.querySelector('.lock-icon');
            if (lockIcon) {
                lockIcon.remove();
            }
        }
    }
}

/**
 * Updates the locked state of all sections based on child slide accessibility.
 * A section gets the 'all-children-locked' class if all its child slides are locked.
 * @param {Map<string, {allowed: boolean, message: string|null}>} accessibilityMap - A map of slide accessibility states.
 */
export function updateSectionStates(accessibilityMap) {
    if (!navMenu) return;
    if (!(accessibilityMap instanceof Map)) {
        throw new Error('NavigationUI.updateSectionStates: accessibilityMap must be a Map');
    }

    const sections = navMenu.querySelectorAll('.nav-section');
    sections.forEach(section => {
        // Get all child slides in this section (including nested)
        const childSlides = section.querySelectorAll('.nav-item[data-slide-id]');

        if (childSlides.length === 0) {
            // No slides in section, remove locked state
            section.classList.remove('all-children-locked');
            return;
        }

        // Check if ALL child slides are locked
        let allLocked = true;
        childSlides.forEach(slideItem => {
            const slideId = slideItem.dataset.slideId;
            const access = accessibilityMap.get(slideId);
            // If access is missing or allowed is not false, the slide is accessible
            if (!access || access.allowed !== false) {
                allLocked = false;
            }
        });

        if (allLocked) {
            section.classList.add('all-children-locked');
        } else {
            section.classList.remove('all-children-locked');
        }
    });
}

/**
 * Shows the engagement indicator with current progress.
 * @param {object} progress - Progress object from EngagementManager.getProgress()
 * @param {number} progress.percentage - Completion percentage (0-100)
 * @param {string} progress.tooltip - Pre-built tooltip text
 * @throws {Error} If progress object is invalid
 */
export function showEngagementIndicator(progress) {
    if (!progress || typeof progress.percentage !== 'number') {
        throw new Error('NavigationUI.showEngagementIndicator: Invalid progress object');
    }
    if (!engagementIndicator) return;

    // Show the indicator
    engagementIndicator.hidden = false;

    // Update progress
    updateEngagementProgress(progress.percentage, progress.percentage === 100);

    // Use tooltip from engagement manager
    engagementIndicator.setAttribute('data-tooltip', progress.tooltip);

    // Update aria-live announcement for screen readers
    const percentText = `${progress.percentage}% of content requirements completed`;
    engagementIndicator.setAttribute('aria-label', percentText);
}

/**
 * Hides the engagement indicator.
 */
export function hideEngagementIndicator() {
    if (!engagementIndicator) return;
    engagementIndicator.hidden = true;
}

/**
 * Updates the circular progress indicator.
 * @param {number} percentage - Completion percentage (0-100)
 * @param {boolean} complete - Whether all requirements are met
 */
export function updateEngagementProgress(percentage, complete) {
    if (!engagementProgress || !engagementCheckmark) return;

    // Apply threshold: if percentage is below 15, display as 0 for visual fill
    const displayPercentage = percentage < 5 ? 0 : percentage;

    // Update progress circle (circumference = 2πr, r=14, so ~87.96)
    const circumference = 2 * Math.PI * 14;
    const offset = circumference - (displayPercentage / 100) * circumference;

    engagementProgress.style.strokeDasharray = `${circumference} ${circumference}`;
    engagementProgress.style.strokeDashoffset = `${offset}`;

    // Show/hide checkmark
    if (complete) {
        engagementCheckmark.style.opacity = '1';
        engagementProgress.classList.add('complete');
    } else {
        engagementCheckmark.style.opacity = '0';
        engagementProgress.classList.remove('complete');
    }

    // Update data attribute for CSS targeting
    engagementIndicator?.setAttribute('data-progress', percentage);
    engagementIndicator?.setAttribute('data-complete', complete ? 'true' : 'false');
}

/**
 * Updates the header progress indicator with current slide position.
 * @param {number} currentIndex - Current slide index (0-based)
 * @param {number} totalSlides - Total number of slides in sequence
 * @param {number} [visitedCount] - Optional: number of visited slides for progress bar
 */
export function updateHeaderProgress(currentIndex, totalSlides, visitedCount = null) {
    if (!headerProgress) return;

    // Show the progress indicator
    headerProgress.hidden = false;

    // Update text: "Slide X of Y" (1-based for display)
    if (headerProgressText) {
        headerProgressText.textContent = `Slide ${currentIndex + 1} of ${totalSlides}`;
    }

    // Update progress bar
    if (headerProgressFill && headerProgressBar) {
        // Use visited count if provided, otherwise use current position
        const progressValue = visitedCount !== null ? visitedCount : currentIndex + 1;
        const percentage = totalSlides > 0 ? (progressValue / totalSlides) * 100 : 0;
        headerProgressFill.style.width = `${percentage}%`;

        // Update ARIA
        headerProgressBar.setAttribute('aria-valuenow', Math.round(percentage));
    }
}

/**
 * Hides the header progress indicator.
 */
export function hideHeaderProgress() {
    if (!headerProgress) return;
    headerProgress.hidden = true;
}

/**
 * Provides access to the cached DOM elements.
 * @returns {{navMenu: HTMLElement, prevButton: HTMLElement, nextButton: HTMLElement, engagementIndicator: HTMLElement, headerProgress: HTMLElement}}
 */
export function getElements() {
    return {
        navMenu,
        prevButton,
        nextButton,
        engagementIndicator,
        headerProgress
    };
}
