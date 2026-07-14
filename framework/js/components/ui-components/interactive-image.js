/**
 * @file interactive-image.js
 * @description Interactive image component with hotspots that open modals and track engagement.
 * Supports integration with Accordion for side-by-side interaction.
 */

export const schema = {
    type: 'interactive-image',
    description: 'Image with clickable hotspots for modals or accordion integration',
    example: `<div data-component="interactive-image" class="interactive-image-container">
  <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='250' fill='%23f1f5f9'%3E%3Crect width='400' height='250' rx='8'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-family='system-ui' font-size='14'%3EInteractive Diagram%3C/text%3E%3C/svg%3E" alt="Interactive diagram" class="interactive-image-img">
  <button data-hotspot-id="feature-a" data-title="Feature A" data-body="Details about Feature A" class="hotspot" style="position: absolute; top: 30%; left: 25%; width: 24px; height: 24px; border-radius: 50%; background: #3b82f6; border: 2px solid white; cursor: pointer;" aria-label="Feature A"></button>
  <button data-hotspot-id="feature-b" data-title="Feature B" data-body="Details about Feature B" class="hotspot" style="position: absolute; top: 60%; left: 65%; width: 24px; height: 24px; border-radius: 50%; background: #f59e0b; border: 2px solid white; cursor: pointer;" aria-label="Feature B"></button>
</div>`,
    properties: {
        accordionId: { type: 'string', dataAttribute: 'data-accordion-id' }
    },
    structure: {
        container: '[data-component="interactive-image"]',
        children: {
            hotspot: { selector: '[data-hotspot-id]', required: true, minItems: 1 }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'interactions/interactive-image.css',
    engagementTracking: 'viewAllHotspots',
    emitsEvents: []
};

import * as Modal from './modal.js';
import engagementManager from '../../engagement/engagement-manager.js';
import * as NavigationState from '../../navigation/NavigationState.js';
import { logger } from '../../utilities/logger.js';
import { eventBus } from '../../core/event-bus.js';

/**
 * Initializes interactive image components.
 * @param {HTMLElement} root - The container element (or selector).
 * @param {object} options - Configuration options.
 */
export function init(root, _options = {}) {
    const container = typeof root === 'string' ? document.querySelector(root) : root;
    if (!container) return;

    // The data-component attribute is the author-facing contract. Normalize
    // the internal CSS hooks so documented minimal markup positions hotspots
    // against the image instead of an unrelated ancestor.
    container.classList.add('interactive-image-container');
    container.querySelector(':scope > img')?.classList.add('interactive-image-img');

    const hotspots = Array.from(container.querySelectorAll('[data-hotspot-id]'));
    if (!hotspots.length) return;

    const currentSlideId = NavigationState.getCurrentSlideId();
    const imageId = container.id || `interactive-image-${Math.random().toString(36).substr(2, 9)}`;
    const accordionId = container.dataset.accordionId;
    const cleanups = [];

    // Setup Accordion Integration if ID is provided
    let accordionElement = null;
    if (accordionId) {
        accordionElement = document.getElementById(accordionId);
        if (accordionElement) {
            cleanups.push(setupAccordionIntegration(hotspots, accordionElement, accordionId));
        } else {
            logger.warn(`[InteractiveImage] Accordion #${accordionId} not found for image ${imageId}`);
        }
    }

    hotspots.forEach(hotspot => {
        // Add accessibility attributes
        hotspot.setAttribute('role', 'button');
        hotspot.setAttribute('tabindex', '0');
        if (!hotspot.getAttribute('aria-label')) {
            hotspot.setAttribute('aria-label', hotspot.dataset.title || 'View details');
        }

        const handleClick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const id = hotspot.dataset.hotspotId;

            // If accordion is linked, toggle it instead of modal
            if (accordionElement) {
                const button = accordionElement.querySelector(`[data-panel="${id}"]`);
                if (button) {
                    button.click(); // Simulate click to toggle
                }
            } else {
                // Default Modal Behavior
                const title = hotspot.dataset.title || 'Details';
                const body = hotspot.dataset.body || hotspot.innerHTML;

                Modal.show({
                    title: title,
                    body: body,
                    footer: '<button class="btn btn-primary" data-action="close-modal">Close</button>',
                    config: { closeOnBackdrop: true, closeOnEscape: true }
                });
            }

            // Mark as viewed visually
            hotspot.classList.add('viewed');

            // Track engagement
            if (currentSlideId && typeof engagementManager.trackInteractiveImageView === 'function') {
                engagementManager.trackInteractiveImageView(currentSlideId, id);
            }
        };

        const handleKeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                handleClick(e);
            }
        };

        hotspot.addEventListener('click', handleClick);
        hotspot.addEventListener('keydown', handleKeydown);
        cleanups.push(() => {
            hotspot.removeEventListener('click', handleClick);
            hotspot.removeEventListener('keydown', handleKeydown);
        });
    });

    logger.debug(`[InteractiveImage] Initialized ${hotspots.length} hotspots for ${imageId}`);
    return {
        destroy: () => cleanups.forEach(cleanup => cleanup())
    };
}

/**
 * Sets up bi-directional sync between image hotspots and accordion panels.
 */
function setupAccordionIntegration(hotspots, accordionElement, accordionId) {
    // Map hotspots by ID for quick access
    const hotspotMap = new Map(hotspots.map(h => [h.dataset.hotspotId, h]));

    // 1. Listen for Accordion Toggles (via EventBus)
    const handleAccordionToggle = (data) => {
        if (data.accordionId !== accordionId) return;

        const hotspot = hotspotMap.get(data.panelId);
        if (hotspot) {
            if (data.isOpen) {
                hotspot.classList.add('active');
                hotspot.classList.add('viewed'); // Opening accordion counts as viewing

                // Also track engagement if opened via accordion
                const currentSlideId = NavigationState.getCurrentSlideId();
                if (currentSlideId && typeof engagementManager.trackInteractiveImageView === 'function') {
                    engagementManager.trackInteractiveImageView(currentSlideId, data.panelId);
                }
            } else {
                hotspot.classList.remove('active');
            }
        }
    };

    eventBus.on('accordion:toggled', handleAccordionToggle);

    // 2. Hover Effects (Accordion Button -> Image Hotspot)
    const buttons = accordionElement.querySelectorAll('[data-panel]');
    const buttonCleanups = [];
    buttons.forEach(btn => {
        const panelId = btn.dataset.panel;
        const hotspot = hotspotMap.get(panelId);

        if (hotspot) {
            const highlight = () => hotspot.classList.add('highlighted');
            const unhighlight = () => hotspot.classList.remove('highlighted');
            btn.addEventListener('mouseenter', highlight);
            btn.addEventListener('mouseleave', unhighlight);
            btn.addEventListener('focus', highlight);
            btn.addEventListener('blur', unhighlight);
            buttonCleanups.push(() => {
                btn.removeEventListener('mouseenter', highlight);
                btn.removeEventListener('mouseleave', unhighlight);
                btn.removeEventListener('focus', highlight);
                btn.removeEventListener('blur', unhighlight);
            });
        }
    });

    // 3. Click Outside to Deselect
    // Closes any open accordion panel if clicking outside the accordion.
    // Note: Hotspots stop propagation, so clicking a hotspot won't trigger this.
    // Clicking the image background (which bubbles) WILL trigger this, effectively deselecting.
    const handleOutsideClick = (e) => {
        // Check if click is inside accordion
        const isInsideAccordion = accordionElement.contains(e.target);

        if (!isInsideAccordion) {
            // Find currently open panel button
            const openButton = accordionElement.querySelector('.accordion-button[aria-expanded="true"]');
            if (openButton) {
                openButton.click(); // Simulate click to close
            }
        }
    };

    const cleanupListeners = () => {
        document.removeEventListener('click', safeHandleOutsideClick);
        eventBus.off('accordion:toggled', handleAccordionToggle);
        buttonCleanups.forEach(cleanup => cleanup());
    };

    const safeHandleOutsideClick = (e) => {
        handleOutsideClick(e);
    };

    document.addEventListener('click', safeHandleOutsideClick);
    return cleanupListeners;
}
