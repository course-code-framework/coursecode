/**
 * @file tooltip.js
 * @description Enhanced tooltip system using event delegation.
 * 
 * ARCHITECTURE:
 * Uses event delegation on document.body - no initialization needed!
 * Just add data-tooltip attribute to any element and it works automatically.
 *
 * FEATURES:
 * - Automatic - no init() calls needed
 * - Works with dynamically added/changed elements
 * - Smart show delay (500ms default, configurable via data-tooltip-delay)
 * - Position control (data-tooltip-position)
 * - Theme variants (data-tooltip-theme)
 * - Multi-line support (use \\n or <br> in content)
 * - Max-width control (data-tooltip-width)
 * - Accessible (keyboard focusable, aria-describedby)
 * - Smooth position-aware animations
 * - Auto-hides on scroll, resize, and Escape key
 *
 * USAGE:
 * Basic:
 *   <button data-tooltip="Click to submit">Submit</button>
 *
 * With options:
 *   <span data-tooltip="Line 1\\nLine 2" 
 *         data-tooltip-position="top"
 *         data-tooltip-delay="500"
 *         data-tooltip-theme="light"
 *         data-tooltip-width="300">Hover me</span>
 *
 * Instant tooltip (no delay):
 *   <span data-tooltip="Instant!" data-tooltip-delay="0">Hover</span>
 *
 * POSITIONS: top, bottom, left, right (default: top)
 * THEMES: dark (default), light
 * DELAY: milliseconds (default: 500ms, use 0 for instant)
 * WIDTH: pixels (default: 280)
 */

export const schema = {
    type: 'tooltip',
    description: 'Declarative tooltip via data-tooltip attribute',
    example: `<p>Hover over any of the highlighted terms below:</p>
<p>
  <span data-tooltip="HyperText Markup Language" data-tooltip-position="top" style="text-decoration: underline; cursor: help;">HTML</span> provides structure,
  <span data-tooltip="Cascading Style Sheets" data-tooltip-position="bottom" style="text-decoration: underline; cursor: help;">CSS</span> handles styling, and
  <span data-tooltip="A programming language for the web" data-tooltip-position="right" style="text-decoration: underline; cursor: help;">JavaScript</span> adds interactivity.
</p>
<p>Icon tooltips work inline with text<span class="tooltip-icon" data-tooltip="This is a tooltip icon — great for contextual help."></span> and scale with font size.</p>
<h3 style="margin-top: 1em;">Heading with info<span class="tooltip-icon" data-tooltip="Icons inherit the surrounding font size."></span></h3>`,
    properties: {
        tooltip: { type: 'string', required: true, dataAttribute: 'data-tooltip' },
        position: { type: 'string', enum: ['top', 'bottom', 'left', 'right'], default: 'top', dataAttribute: 'data-tooltip-position' },
        theme: { type: 'string', enum: ['dark', 'light'], default: 'dark', dataAttribute: 'data-tooltip-theme' },
        delay: { type: 'number', default: 500, dataAttribute: 'data-tooltip-delay' },
        width: { type: 'number', default: 280, dataAttribute: 'data-tooltip-width' }
    },
    structure: {
        container: '[data-tooltip]',
        children: {}
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/tooltip.css',
    engagementTracking: null,
    emitsEvents: []
};

let tooltipElement = null;
let arrowElement = null;
let showTimeout = null;
let hideTimeout = null;
let currentTarget = null;
let isInitialized = false;
let suppressUntil = 0;  // Timestamp until which tooltips are suppressed

// Default timing constants (ms)
const DEFAULT_SHOW_DELAY = 500;  // Time before tooltip appears
const DEFAULT_HIDE_DELAY = 0;    // Hide immediately (was 100ms, felt laggy)
const POPUP_SUPPRESS_DURATION = 300;  // Suppress tooltips briefly after popup opens

/**
 * Creates the shared tooltip element and appends it to the body.
 */
function ensureTooltipElement() {
    if (tooltipElement) return;

    tooltipElement = document.createElement('div');
    tooltipElement.className = 'tooltip-container';
    tooltipElement.setAttribute('role', 'tooltip');
    tooltipElement.id = 'shared-tooltip';
    
    // Create arrow element
    arrowElement = document.createElement('div');
    arrowElement.className = 'tooltip-arrow';
    tooltipElement.appendChild(arrowElement);
    
    document.body.appendChild(tooltipElement);
}

/**
 * Finds the closest ancestor (or self) with a data-tooltip attribute.
 * @param {HTMLElement} element - Starting element
 * @returns {HTMLElement|null} Element with data-tooltip or null
 */
function findTooltipTarget(element) {
    return element?.closest('[data-tooltip]');
}

/**
 * Processes tooltip text for line breaks.
 * Converts \n to <br> for multi-line display.
 * @param {string} text - The tooltip text
 * @returns {string} HTML-safe text with line breaks
 */
function processTooltipText(text) {
    if (!text) return '';

    // Escape HTML to prevent XSS, then convert line breaks
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    // Convert \n to <br> for multi-line support
    return escaped.replace(/\\n|\n/g, '<br>');
}

/**
 * Shows and positions the tooltip.
 * @param {HTMLElement} targetElement - The element the tooltip is for.
 */
function showTooltip(targetElement) {
    if (!tooltipElement) ensureTooltipElement();

    // Clear any pending hide
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }

    const text = targetElement.getAttribute('data-tooltip');
    if (!text) return;

    currentTarget = targetElement;

    // Apply theme
    const theme = targetElement.dataset.tooltipTheme || 'dark';
    tooltipElement.classList.remove('tooltip-theme-dark', 'tooltip-theme-light');
    tooltipElement.classList.add(`tooltip-theme-${theme}`);

    // Apply custom width if specified
    const customWidth = targetElement.dataset.tooltipWidth;
    if (customWidth) {
        tooltipElement.style.maxWidth = `${customWidth}px`;
    } else {
        tooltipElement.style.maxWidth = ''; // Reset to CSS default
    }

    // Set content with line break support (preserve arrow element)
    // Create a text node or use innerHTML for the content, then append arrow
    const contentHtml = processTooltipText(text);
    tooltipElement.innerHTML = contentHtml;
    
    // Re-create and append arrow element (since innerHTML replaced it)
    arrowElement = document.createElement('div');
    arrowElement.className = 'tooltip-arrow';
    tooltipElement.appendChild(arrowElement);
    
    tooltipElement.classList.add('active');

    // Link tooltip to target for accessibility
    targetElement.setAttribute('aria-describedby', 'shared-tooltip');

    positionTooltip(targetElement);
}

/**
 * Schedules the tooltip to show after the configured delay.
 * @param {HTMLElement} targetElement - The element the tooltip is for.
 */
function scheduleShow(targetElement) {
    // Clear any pending hide (user moved back to element)
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
    
    // If already showing for this target, don't re-schedule
    if (currentTarget === targetElement && tooltipElement?.classList.contains('active')) {
        return;
    }
    
    // Clear any pending show
    if (showTimeout) {
        clearTimeout(showTimeout);
        showTimeout = null;
    }
    
    // Use custom delay or default
    const delay = parseInt(targetElement.dataset.tooltipDelay, 10);
    const actualDelay = !isNaN(delay) ? delay : DEFAULT_SHOW_DELAY;

    if (actualDelay > 0) {
        showTimeout = setTimeout(() => {
            showTooltip(targetElement);
        }, actualDelay);
    } else {
        showTooltip(targetElement);
    }
}

/**
 * Hides the tooltip with optional delay.
 * @param {boolean} immediate - If true, hide immediately without delay
 */
function hideTooltip(immediate = false) {
    // Clear any pending show
    if (showTimeout) {
        clearTimeout(showTimeout);
        showTimeout = null;
    }
    
    // Clear any existing hide timeout
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }

    if (!tooltipElement) return;
    
    const doHide = () => {
        tooltipElement.classList.remove('active');
        
        // Clean up aria reference
        if (currentTarget) {
            currentTarget.removeAttribute('aria-describedby');
            currentTarget = null;
        }
    };
    
    if (immediate) {
        doHide();
    } else {
        // Brief delay before hiding prevents flicker when moving between elements
        hideTimeout = setTimeout(doHide, DEFAULT_HIDE_DELAY);
    }
}

/**
 * Calculates and sets the position of the tooltip relative to the target element.
 * @param {HTMLElement} targetElement - The element to position the tooltip against.
 */
function positionTooltip(targetElement) {
    const targetRect = targetElement.getBoundingClientRect();
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const preferredPosition = targetElement.dataset.tooltipPosition || 'top';
    const gap = 12; // Space between target and tooltip (includes arrow)

    let top, left;
    let finalPosition = preferredPosition;

    // Calculate position based on preferred position
    switch (preferredPosition) {
        case 'bottom':
            top = targetRect.bottom + gap;
            left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
            break;
        case 'right':
            top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
            left = targetRect.right + gap;
            break;
        case 'left':
            top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
            left = targetRect.left - tooltipRect.width - gap;
            break;
        case 'top':
        default:
            top = targetRect.top - tooltipRect.height - gap;
            left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
            finalPosition = 'top';
            break;
    }

    // Adjust if off-screen
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (left < gap) left = gap;
    if (left + tooltipRect.width > viewportWidth - gap) {
        left = viewportWidth - tooltipRect.width - gap;
    }
    if (top < gap) top = gap;
    if (top + tooltipRect.height > viewportHeight - gap) {
        top = viewportHeight - tooltipRect.height - gap;
    }

    tooltipElement.style.top = `${top + window.scrollY}px`;
    tooltipElement.style.left = `${left + window.scrollX}px`;
    
    // Set position attribute for arrow styling
    tooltipElement.setAttribute('data-position', finalPosition);
}

/**
 * Handles mouseenter/focus events via delegation.
 * @param {Event} event - The mouseenter or focus event
 */
function handleShow(event) {
    // Skip if tooltips are temporarily suppressed (e.g., popup just opened)
    if (Date.now() < suppressUntil) {
        return;
    }
    
    const target = findTooltipTarget(event.target);
    if (target) {
        scheduleShow(target);
    }
}

/**
 * Suppresses tooltips briefly. Called when popups/menus open.
 * Prevents tooltips from appearing when content appears under the cursor.
 */
function suppressTooltips() {
    suppressUntil = Date.now() + POPUP_SUPPRESS_DURATION;
    // Also hide any currently showing tooltip
    hideTooltip(true);
}

/**
 * Sets up a MutationObserver to detect when popup menus become visible.
 * This suppresses tooltips briefly to prevent them from appearing
 * when a menu opens under the cursor.
 */
function observePopupVisibility() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'hidden') {
                const target = mutation.target;
                // If hidden attribute was removed (element became visible)
                if (!target.hidden && target.classList.contains('popup-menu')) {
                    suppressTooltips();
                }
            }
        }
    });
    
    // Observe the entire document for hidden attribute changes
    observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['hidden'],
        subtree: true
    });
}

/**
 * Handles mouseleave/blur events via delegation.
 * @param {Event} event - The mouseleave or blur event
 */
function handleHide(event) {
    const target = findTooltipTarget(event.target);
    
    // Always cancel pending show when leaving any tooltip target
    // This prevents tooltip appearing after mouse has already left
    if (target || showTimeout) {
        if (showTimeout) {
            clearTimeout(showTimeout);
            showTimeout = null;
        }
    }
    
    // Hide if leaving current target OR if no target (mouse left window)
    if ((target && target === currentTarget) || (!target && currentTarget)) {
        hideTooltip();
    }
}

/**
 * Handles scroll events - hides tooltip immediately.
 */
function handleScroll() {
    if (currentTarget || showTimeout) {
        hideTooltip(true);
    }
}

/**
 * Handles resize events - hides tooltip immediately.
 */
function handleResize() {
    if (currentTarget || showTimeout) {
        hideTooltip(true);
    }
}

/**
 * Handles keydown events - Escape hides tooltip.
 * @param {KeyboardEvent} event
 */
function handleKeyDown(event) {
    if (event.key === 'Escape' && (currentTarget || showTimeout)) {
        hideTooltip(true);
    }
}

/**
 * Initializes the delegated event listeners on document.body.
 * Called automatically on module load.
 */
function initDelegatedListeners() {
    if (isInitialized) return;
    
    ensureTooltipElement();
    
    // Use capture phase for mouseenter/mouseleave since they don't bubble
    document.body.addEventListener('mouseenter', handleShow, true);
    document.body.addEventListener('mouseleave', handleHide, true);
    
    // Focus/blur also need capture for delegation
    document.body.addEventListener('focusin', handleShow, true);
    document.body.addEventListener('focusout', handleHide, true);
    
    // Hide on scroll, resize, or Escape (use passive for scroll/resize)
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    window.addEventListener('resize', handleResize, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    
    // Watch for popup menus becoming visible to suppress immediate tooltips
    observePopupVisibility();
    
    isInitialized = true;
}

/**
 * No-op. Tooltip uses event delegation — no per-element init needed.
 * Kept for catalog compliance (components must export init).
 */
export function init(_container) {
	// Ensure delegated listeners are set up (idempotent)
	initDelegatedListeners();

	return {
		destroy: () => { }
	};
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDelegatedListeners);
} else {
    initDelegatedListeners();
}
