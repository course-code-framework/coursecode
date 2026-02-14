/**
 * @file checkbox-group.js
 * @description Handles a group of checkboxes, aggregating their values and emitting change events.
 */

export const schema = {
    type: 'checkbox-group',
    description: 'Group of checkboxes with aggregated value tracking',
    example: `<div data-component="checkbox-group" class="checkbox-group">
  <div class="checkbox-option"><input type="checkbox" value="html" id="cb-html" checked><label for="cb-html" class="checkbox-label">HTML &amp; CSS</label></div>
  <div class="checkbox-option"><input type="checkbox" value="js" id="cb-js"><label for="cb-js" class="checkbox-label">JavaScript</label></div>
  <div class="checkbox-option"><input type="checkbox" value="a11y" id="cb-a11y"><label for="cb-a11y" class="checkbox-label">Accessibility</label></div>
</div>`,
    properties: {},
    structure: {
        container: '[data-component="checkbox-group"]',
        children: {
            checkbox: { selector: 'input[type="checkbox"]', required: true, minItems: 1 }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/checkbox-group.css',
    engagementTracking: null,
    emitsEvents: ['checkbox-group:change']
};

import { logger } from '../../utilities/logger.js';

export function init(element) {
    if (!element) {
        logger.fatal('CheckboxGroup: Container element is required', { domain: 'ui', operation: 'initCheckboxGroup' });
        return;
    }

    const checkboxes = element.querySelectorAll('input[type="checkbox"]');

    if (checkboxes.length === 0) {
        logger.fatal('CheckboxGroup: No checkbox inputs found in container', { domain: 'ui', operation: 'initCheckboxGroup' });
        return;
    }

    const handleChange = () => {
        const checked = Array.from(checkboxes).filter(cb => cb.checked);
        const values = checked.map(cb => cb.value);
        
        // Try to find labels. 
        // 1. Look for .checkbox-label inside the closest .checkbox-option (Framework convention)
        // 2. Look for associated <label> (Standard HTML)
        // 3. Use value
        const labels = checked.map(cb => {
            const option = cb.closest('.checkbox-option');
            if (option) {
                const labelEl = option.querySelector('.checkbox-label');
                if (labelEl) return labelEl.textContent;
            }
            if (cb.labels && cb.labels.length > 0) return cb.labels[0].textContent;
            return cb.value;
        });

        const event = new CustomEvent('checkbox-group:change', {
            bubbles: true,
            detail: {
                values: values,
                labels: labels,
                count: checked.length,
                // Helper for simple display
                value: labels.join(', ') 
            }
        });
        element.dispatchEvent(event);
    };

    checkboxes.forEach(cb => {
        cb.addEventListener('change', handleChange);
    });

    return {
        destroy: () => {
            checkboxes.forEach(cb => {
                cb.removeEventListener('change', handleChange);
            });
        }
    };
}
