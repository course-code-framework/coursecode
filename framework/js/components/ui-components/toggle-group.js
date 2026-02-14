/**
 * @file toggle-group.js
 * @description Handles a group of toggle switches, aggregating their values and emitting change events.
 */

export const schema = {
    type: 'toggle-group',
    description: 'Group of toggle switches with aggregated value tracking',
    example: `<div data-component="toggle-group">
  <label class="toggle-switch"><input type="checkbox" data-label="Notifications" checked><span class="toggle-slider"></span><span class="toggle-label">Notifications</span></label>
  <label class="toggle-switch"><input type="checkbox" data-label="Dark Mode"><span class="toggle-slider"></span><span class="toggle-label">Dark Mode</span></label>
  <label class="toggle-switch"><input type="checkbox" data-label="Auto-Save" checked><span class="toggle-slider"></span><span class="toggle-label">Auto-Save</span></label>
</div>`,
    properties: {},
    structure: {
        container: '[data-component="toggle-group"]',
        children: {
            toggle: { selector: 'input[type="checkbox"]', required: true, minItems: 1 }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/toggle.css',
    engagementTracking: null,
    emitsEvents: ['toggle:change']
};

import { logger } from '../../utilities/logger.js';

export function init(element) {
    if (!element) {
        logger.fatal('ToggleGroup: Container element is required', { domain: 'ui', operation: 'initToggleGroup' });
        return;
    }

    const toggles = element.querySelectorAll('input[type="checkbox"]');
    
    if (toggles.length === 0) {
        logger.fatal('ToggleGroup: No checkbox inputs found in container', { domain: 'ui', operation: 'initToggleGroup' });
        return;
    }

    const handleChange = (e) => {
        const target = e.target;
        const label = target.dataset.label || target.nextElementSibling?.nextElementSibling?.textContent || 'Toggle';
        const status = target.checked ? 'enabled' : 'disabled';
        
        const event = new CustomEvent('toggle:change', {
            bubbles: true,
            detail: {
                label: label,
                checked: target.checked,
                status: status,
                value: `${label} is now ${status}`
            }
        });
        element.dispatchEvent(event);
    };

    toggles.forEach(toggle => {
        toggle.addEventListener('change', handleChange);
    });

    return {
        destroy: () => {
            toggles.forEach(toggle => {
                toggle.removeEventListener('change', handleChange);
            });
        }
    };
}
