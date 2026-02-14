/**
 * @file collapse.js
 * @description Handles "Show More/Less" or collapsible content sections.
 *
 * Usage (Declarative):
 * <div data-component="collapse">
 *   <div class="collapse-panel" id="transcript-panel">
 *     <p>Long content goes here...</p>
 *   </div>
 *   <button class="collapse-trigger" data-action="toggle-collapse" aria-controls="transcript-panel" aria-expanded="false">
 *     <span class="collapse-text-show">Show Transcript</span>
 *     <span class="collapse-text-hide">Hide Transcript</span>
 *   </button>
 * </div>
 */

export const schema = {
    type: 'collapse',
    description: 'Collapsible content section with show/hide toggle',
    example: `<div data-component="collapse">
  <button class="btn btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="preview-collapse" aria-expanded="false">
    <span class="collapse-text-show">Show Details</span><span class="collapse-text-hide">Hide Details</span>
  </button>
  <div class="collapse-panel mt-3" id="preview-collapse">
    <div class="p-4 bg-gray-100 rounded"><p>This content is hidden by default. Click the button above to toggle visibility.</p></div>
  </div>
</div>`,
    properties: {},
    structure: {
        container: '[data-component="collapse"]',
        children: {
            panel: { selector: '.collapse-panel', required: true },
            trigger: { selector: '[data-action="toggle-collapse"]', required: true }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/collapse.css',
    engagementTracking: null,
    emitsEvents: ['collapse:toggle']
};

import { logger } from '../../utilities/logger.js';

/**
 * Initializes a collapse component.
 * @param {HTMLElement} container - The main container for the collapse component.
 * @returns {object} An object with a `destroy` method.
 */
export function init(container) {
    if (!container) {
        logger.fatal('initCollapse: container not found.', { domain: 'ui', operation: 'initCollapse' });
        return;
    }

    const trigger = container.querySelector('[data-action="toggle-collapse"]');
    if (!trigger) {
        logger.fatal('initCollapse: No trigger found with data-action="toggle-collapse". Ensure collapse trigger button exists.', { domain: 'ui', operation: 'initCollapse' });
        return;
    }

    const panelId = trigger.getAttribute('aria-controls');
    const panel = panelId ? container.querySelector(`#${panelId}`) : null;

    if (!panel) {
        logger.fatal(`initCollapse: No panel found with ID "${panelId}". Ensure trigger's aria-controls matches panel ID.`, { domain: 'ui', operation: 'initCollapse' });
        return;
    }

    const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
    panel.style.maxHeight = isExpanded ? `${panel.scrollHeight}px` : '0';
    container.classList.toggle('expanded', isExpanded);

    const toggle = () => {
        const currentlyExpanded = trigger.getAttribute('aria-expanded') === 'true';
        
        trigger.setAttribute('aria-expanded', !currentlyExpanded);
        container.classList.toggle('expanded', !currentlyExpanded);

        if (!currentlyExpanded) {
            // Expanding
            panel.style.display = 'block'; // Make it visible before calculating scrollHeight
            panel.style.maxHeight = `${panel.scrollHeight}px`;
        } else {
            // Collapsing
            panel.style.maxHeight = '0';
        }
    };

    // Handle transition end to set display: none for accessibility and performance
    panel.addEventListener('transitionend', () => {
        if (trigger.getAttribute('aria-expanded') === 'false') {
            panel.style.display = 'none';
        }
    });
    
    // Ensure panel is correctly displayed or hidden on init
    if (trigger.getAttribute('aria-expanded') === 'false') {
        panel.style.display = 'none';
    } else {
        panel.style.display = 'block';
    }


    trigger.addEventListener('click', toggle);

    return {
        destroy: () => {
            trigger.removeEventListener('click', toggle);
        }
    };
}
