/**
 * @file accordion.js
 * @description Accessible accordion interface with keyboard navigation and engagement tracking.
 * 
 * Usage:
 *   import { initAccordion } from '../framework/js/components/ui-components/accordion.js';
 *   
 *   initAccordion(root, {
 *     id: 'faq-accordion',
 *     mode: 'single',  // 'single' or 'multi'
 *     items: [
 *       { id: 'panel1', title: 'Question 1', content: '<p>Answer...</p>' },
 *       { id: 'panel2', title: 'Question 2', content: '<p>Answer...</p>' }
 *     ],
 *     defaultOpen: ['panel1']
 *   });
 * 
 * Data Attributes:
 *   data-mode="single"      - Only one panel open at a time
 *   data-mode="multi"       - Multiple panels can be open (default)
 *   data-always-open        - Prevent closing the last open panel (requires at least one open)
 * 
 * Note: Audio is NOT supported on accordions due to multi-panel complexity.
 * Use tabs (single panel visible) or modals for audio content.
 */

import { announceToScreenReader } from './index.js';
import engagementManager from '../../engagement/engagement-manager.js';
import * as NavigationState from '../../navigation/NavigationState.js';
import { eventBus } from '../../core/event-bus.js';
import { logger } from '../../utilities/logger.js';

// Schema for validation, linting, and AI-assisted authoring
export const schema = {
    type: 'accordion',
    description: 'Accessible accordion with keyboard navigation and engagement tracking',
    example: `<div data-component="accordion" id="preview-accordion" data-mode="multi">
  <div class="accordion-item" data-panel-id="getting-started">
    <button class="accordion-button" data-panel="getting-started" data-action="toggle-accordion-panel" aria-expanded="true" aria-controls="preview-accordion-panel-getting-started"><span class="accordion-title">Getting Started</span><span class="accordion-icon"></span></button>
    <div id="preview-accordion-panel-getting-started" class="accordion-content show" role="region"><div class="accordion-body">Learn the basics of course authoring with step-by-step guidance.</div></div>
  </div>
  <div class="accordion-item" data-panel-id="advanced">
    <button class="accordion-button collapsed" data-panel="advanced" data-action="toggle-accordion-panel" aria-expanded="false" aria-controls="preview-accordion-panel-advanced"><span class="accordion-title">Advanced Features</span><span class="accordion-icon"></span></button>
    <div id="preview-accordion-panel-advanced" class="accordion-content" role="region" hidden><div class="accordion-body">Explore components, interactions, and layout patterns.</div></div>
  </div>
  <div class="accordion-item" data-panel-id="publishing">
    <button class="accordion-button collapsed" data-panel="publishing" data-action="toggle-accordion-panel" aria-expanded="false" aria-controls="preview-accordion-panel-publishing"><span class="accordion-title">Publishing</span><span class="accordion-icon"></span></button>
    <div id="preview-accordion-panel-publishing" class="accordion-content" role="region" hidden><div class="accordion-body">Export your course for LMS deployment.</div></div>
  </div>
</div>`,
    properties: {
        mode: { type: 'string', enum: ['single', 'multi'], default: 'multi', description: 'single = one panel open, multi = multiple open' },
        alwaysOpen: { type: 'boolean', default: false, description: 'Prevent closing last open panel (data-always-open attribute)' }
    },
    structure: {
        container: '[data-component="accordion"]',
        children: {
            item: { selector: '.accordion-item', required: true, minItems: 1 },
            button: { selector: '.accordion-button', parent: '.accordion-item', required: true },
            content: { selector: '.accordion-content', parent: '.accordion-item', required: true }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/accordions.css',
    engagementTracking: 'viewAllPanels',
    emitsEvents: ['accordion:toggled']
};


/**
 * Creates and initializes an accordion component
 * @param {HTMLElement|string} root - Container element or selector
 * @param {Object} options - Configuration options
 * @param {string} options.id - Unique accordion ID
 * @param {string} [options.mode='multi'] - 'single' (one open) or 'multi' (multiple open)
 * @param {Array} options.items - Array of {id, title, content}
 * @param {Array} [options.defaultOpen=[]] - Array of panel IDs to open by default
 * @param {Function} [options.onToggle] - Callback when panel toggles
 * @returns {Object} Accordion API
 */
export function init(root, options = {}) {
    const accordionElement = typeof root === 'string' ? document.querySelector(root) : root;
    if (!accordionElement) {
        logger.fatal('UIComponents.initAccordion: container not found', { domain: 'ui', operation: 'initAccordion' });
        return;
    }

    // Configuration is read from the element's ID and data attributes
    const id = accordionElement.id;
    const mode = accordionElement.dataset.mode || 'multi';
    const alwaysOpen = accordionElement.hasAttribute('data-always-open');
    const onToggle = typeof options.onToggle === 'function' ? options.onToggle : null;

    if (!id) {
        logger.fatal('UIComponents.initAccordion: The accordion container element must have an ID.', { domain: 'ui', operation: 'initAccordion' });
        return;
    }
    if (mode !== 'single' && mode !== 'multi') {
        logger.fatal('UIComponents.initAccordion: data-mode attribute must be "single" or "multi"', { domain: 'ui', operation: 'initAccordion' });
        return;
    }

    // HYDRATION: Support simplified syntax
    // If no .accordion-item elements exist, check for children with data-title
    if (accordionElement.querySelectorAll('.accordion-item').length === 0) {
        const simpleItems = Array.from(accordionElement.children).filter(el => el.hasAttribute('data-title'));
        
        if (simpleItems.length > 0) {
            simpleItems.forEach((item, index) => {
                const title = item.getAttribute('data-title');
                // Preserve existing content
                const content = item.innerHTML;
                // Generate a unique ID suffix for this panel
                const uniqueSuffix = `item-${index + 1}`;
                
                const wrapper = document.createElement('div');
                wrapper.className = 'accordion-item';
                wrapper.setAttribute('data-panel-id', uniqueSuffix);
                
                wrapper.innerHTML = `
                    <button class="accordion-button collapsed" data-panel="${uniqueSuffix}" data-action="toggle-accordion-panel">
                        <span class="accordion-title">${title}</span>
                        <span class="accordion-icon"></span>
                    </button>
                    <div id="${id}-panel-${uniqueSuffix}" class="accordion-content" hidden>
                        <div class="accordion-body">${content}</div>
                    </div>
                `;
                
                accordionElement.replaceChild(wrapper, item);
            });
        }
    }

    const buttons = Array.from(accordionElement.querySelectorAll('.accordion-button'));
    const items = Array.from(accordionElement.querySelectorAll('.accordion-item')).map(itemEl => {
        // Try to get ID from the item wrapper first, then fallback to the button inside
        const button = itemEl.querySelector('.accordion-button');
        const id = itemEl.dataset.panelId || button?.dataset.panel;
        
        return {
            id,
            title: itemEl.querySelector('.accordion-title')?.textContent || '',
        };
    });

    if (!buttons.length) {
        // No buttons found, nothing to initialize.
        return {
            destroy: () => {}
        };
    }

    // Validate structure: Check if all buttons have corresponding panels
    const errors = [];
    buttons.forEach((btn, index) => {
        const panelId = btn.dataset.panel;
        if (!panelId) {
            errors.push(`Button ${index + 1} is missing data-panel attribute.`);
            return;
        }
        const content = accordionElement.querySelector(`#${id}-panel-${panelId}`);
        if (!content) {
            errors.push(`Panel content not found for button ${index + 1} (expected id="${id}-panel-${panelId}").`);
        }
    });

    if (errors.length > 0) {
        logger.fatal(`UIComponents.initAccordion: Invalid structure in #${id}:\n${errors.join('\n')}`, { domain: 'ui', operation: 'initAccordion' });
        return;
    }

    // Determine initially open panels by inspecting the DOM
    const openPanels = new Set(
        buttons.filter(btn => btn.getAttribute('aria-expanded') === 'true').map(btn => btn.dataset.panel)
    );

    // Initialize ARIA attributes
    buttons.forEach(btn => {
        const panelId = btn.dataset.panel;
        const content = accordionElement.querySelector(`#${id}-panel-${panelId}`);
        
        if (!btn.hasAttribute('aria-expanded')) {
            btn.setAttribute('aria-expanded', 'false');
        }
        if (!btn.hasAttribute('aria-controls') && content) {
            btn.setAttribute('aria-controls', content.id);
        }
        
        // Ensure content has role="region" and aria-labelledby
        if (content) {
            if (!content.hasAttribute('role')) {
                content.setAttribute('role', 'region');
            }
            if (!content.hasAttribute('aria-labelledby') && btn.id) {
                content.setAttribute('aria-labelledby', btn.id);
            }
        }
    });

    // If alwaysOpen is set and no panels are open, open the first one
    if (alwaysOpen && openPanels.size === 0 && buttons.length > 0) {
        const firstPanelId = buttons[0].dataset.panel;
        const firstContent = accordionElement.querySelector(`#${id}-panel-${firstPanelId}`);
        if (firstPanelId && firstContent) {
            openPanels.add(firstPanelId);
            buttons[0].classList.remove('collapsed');
            buttons[0].setAttribute('aria-expanded', 'true');
            firstContent.classList.add('show');
            firstContent.removeAttribute('hidden');
            logger.debug(`[Accordion] Auto-opened first panel for data-always-open: ${firstPanelId}`);
        }
    }

    // Register with engagement tracking
    const currentSlideId = NavigationState.getCurrentSlideId();
    if (currentSlideId) {
        const panelIds = items.map(item => item.id);
        engagementManager.registerAccordion(currentSlideId, panelIds);
        
        // Track initially open panels for engagement progress.
        // Users who see open content should get credit for viewing it.
        // This tracks panels that are open when the accordion initializes.
        if (openPanels.size > 0) {
            openPanels.forEach(panelId => {
                engagementManager.trackAccordionPanel(currentSlideId, panelId);
            });
            logger.debug(`[Accordion] Tracked ${openPanels.size} initially open panels for engagement: ${Array.from(openPanels).join(', ')}`);
        }
    }

    // Track pending transitions to prevent overlapping animations
    let transitionTimeout = null;

    // Update locked state for always-open accordions
    // When only one panel is open and alwaysOpen is set, mark it as locked (can't close)
    function updateLockedState() {
        if (!alwaysOpen) return;
        
        buttons.forEach(btn => {
            const panelId = btn.dataset.panel;
            const isOpen = openPanels.has(panelId);
            const isLastOpen = isOpen && openPanels.size === 1;
            
            btn.classList.toggle('accordion-locked', isLastOpen);
        });
    }

    // Initialize locked state
    updateLockedState();

    function togglePanel(panelId) {
        const button = accordionElement.querySelector(`[data-panel="${panelId}"]`);
        const content = accordionElement.querySelector(`#${id}-panel-${panelId}`);
        
        if (!button || !content) return;

        // Cancel any pending open actions from rapid clicks
        if (transitionTimeout) {
            clearTimeout(transitionTimeout);
            transitionTimeout = null;
        }

        const isCurrentlyOpen = openPanels.has(panelId);

        if (isCurrentlyOpen) {
            // Case 1: Closing the currently open panel
            // If alwaysOpen is set and this is the last open panel, prevent closing
            if (alwaysOpen && openPanels.size === 1) {
                logger.debug('[Accordion] Cannot close last panel - data-always-open is set');
                announceToScreenReader('At least one panel must remain open');
                return;
            }
            // Action: Close immediately
            closePanel(panelId);
            notifyToggle(panelId, false);
        } else {
            // Case 2: Opening a new panel
            if (mode === 'single' && openPanels.size > 0) {
                // Crossfade: Open new and close old simultaneously
                // Both panels animate at the same time for smooth transition
                const panelsToClose = Array.from(openPanels);
                
                // Start opening new panel first (so it's visible during transition)
                openPanel(panelId);
                notifyToggle(panelId, true);
                
                // Close old panels (animated close is now built into closePanel)
                // Notify for each closed panel so linked components (e.g. interactive-image) can update
                panelsToClose.forEach(openId => {
                    closePanel(openId, false);
                    notifyToggle(openId, false);
                });
            } else {
                // Case 3: Opening panel (Multi mode OR Single mode with nothing open)
                // Action: Open immediately
                openPanel(panelId);
                notifyToggle(panelId, true);
            }
        }
    }

    function notifyToggle(panelId, isOpen) {
        if (currentSlideId && isOpen) {
            engagementManager.trackAccordionPanel(currentSlideId, panelId);
        }

        if (onToggle) {
            onToggle({ panelId, isOpen, mode });
        }

        eventBus.emit('accordion:toggled', {
            accordionId: id,
            panelId: panelId,
            isOpen: isOpen
        });
    }

    function openPanel(panelId, announce = true) {
        const button = accordionElement.querySelector(`[data-panel="${panelId}"]`);
        const content = accordionElement.querySelector(`#${id}-panel-${panelId}`);
        
        if (!button || !content) return;

        openPanels.add(panelId);
        button.classList.remove('collapsed');
        button.setAttribute('aria-expanded', 'true');
        content.classList.add('show');
        content.removeAttribute('hidden');
        
        updateLockedState();

        if (announce) {
            const title = button.querySelector('.accordion-title')?.textContent || 'Panel';
            announceToScreenReader(`${title} expanded`);
        }
    }

    function closePanel(panelId, announce = true) {
        const button = accordionElement.querySelector(`[data-panel="${panelId}"]`);
        const content = accordionElement.querySelector(`#${id}-panel-${panelId}`);
        
        if (!button || !content) return;

        openPanels.delete(panelId);
        button.classList.add('collapsed');
        button.setAttribute('aria-expanded', 'false');
        content.classList.remove('show'); // Starts shrinking + fade animation
        // Don't add hidden yet - let it animate first
        
        updateLockedState();

        if (announce) {
            const title = button.querySelector('.accordion-title')?.textContent || 'Panel';
            announceToScreenReader(`${title} collapsed`);
        }

        // Add hidden after transition completes (matches CSS transition duration)
        setTimeout(() => {
            // Only add hidden if panel is still closed (wasn't re-opened)
            if (!content.classList.contains('show')) {
                content.setAttribute('hidden', 'hidden');
            }
        }, 350); // Matches CSS transition duration
    }

    function openAll() {
        if (mode === 'single') {
            throw new Error('UIComponents.initAccordion: openAll() is not available in single mode. Use mode="multi" or call togglePanel() individually.');
        }
        items.forEach(item => openPanel(item.id, false));
        announceToScreenReader('All panels expanded');
    }

    function closeAll() {
        items.forEach(item => closePanel(item.id, false));
        announceToScreenReader('All panels collapsed');
    }

    const clickHandler = (event) => {
        const button = event.target.closest('[data-action="toggle-accordion-panel"]');
        if (!button) return;

        event.preventDefault();
        const panelId = button.dataset.panel;
        if (panelId) {
            togglePanel(panelId);
        }
    };

    const keydownHandler = (event) => {
        const button = event.target.closest('.accordion-button');
        if (!button) return;

        const currentIndex = buttons.indexOf(button);

        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowRight':
                event.preventDefault();
                const nextIndex = (currentIndex + 1) % buttons.length;
                buttons[nextIndex].focus();
                break;

            case 'ArrowUp':
            case 'ArrowLeft':
                event.preventDefault();
                const prevIndex = (currentIndex - 1 + buttons.length) % buttons.length;
                buttons[prevIndex].focus();
                break;

            case 'Home':
                event.preventDefault();
                buttons[0].focus();
                break;

            case 'End':
                event.preventDefault();
                buttons[buttons.length - 1].focus();
                break;
        }
    };

    accordionElement.addEventListener('click', clickHandler);
    accordionElement.addEventListener('keydown', keydownHandler);

    return {
        togglePanel,
        openPanel,
        closePanel,
        openAll,
        closeAll,
        getOpenPanels: () => Array.from(openPanels),
        destroy: () => {
            accordionElement.removeEventListener('click', clickHandler);
            accordionElement.removeEventListener('keydown', keydownHandler);
        }
    };
}
