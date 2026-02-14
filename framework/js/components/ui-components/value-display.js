/**
 * @file value-display.js
 * @description A generic component that updates its text content based on events from another element.
 * 
 * Usage:
 * <div data-component="value-display" 
 *      data-source="#my-input" 
 *      data-event="change" 
 *      data-key="value" 
 *      data-format="You selected: {value}">
 * </div>
 */

export const schema = {
    type: 'value-display',
    description: 'Updates text content based on events from another element',
    example: `<div>
  <label for="preview-slider" style="display: block; margin-bottom: 8px; font-weight: 500;">Adjust value:</label>
  <input type="range" id="preview-slider" min="0" max="100" value="50" style="width: 100%;">
  <div data-component="value-display" data-source="#preview-slider" data-event="input" data-key="value" data-format="Current value: {value}%" style="margin-top: 8px; color: #64748b;">Current value: 50%</div>
</div>`,
    properties: {
        source: { type: 'string', required: true, dataAttribute: 'data-source' },
        event: { type: 'string', default: 'change', dataAttribute: 'data-event' },
        key: { type: 'string', default: 'value', dataAttribute: 'data-key' },
        format: { type: 'string', default: '{value}', dataAttribute: 'data-format' },
        hideEmpty: { type: 'boolean', default: false, dataAttribute: 'data-hide-empty' }
    },
    structure: {
        container: '[data-component="value-display"]',
        children: {}
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: null,
    engagementTracking: null,
    emitsEvents: []
};

import { logger } from '../../utilities/logger.js';

export function init(element) {
    const sourceSelector = element.dataset.source;
    if (!sourceSelector) {
        logger.warn('[ValueDisplay] No data-source provided', element);
        return;
    }

    // We need to find the source. If it's not in the DOM yet, we might need to wait or look in the same container.
    // For now, assume document-level query or closest container.
    // Using document.querySelector allows linking across the page.
    let sourceElement = null;
    if (sourceSelector.startsWith('#')) {
        sourceElement = document.getElementById(sourceSelector.substring(1));
    } else {
        sourceElement = document.querySelector(sourceSelector);
    }
    
    if (!sourceElement) {
        logger.fatal(`[ValueDisplay] Source element not found: ${sourceSelector}`, { domain: 'ui', operation: 'initValueDisplay' });
        return;
    }

    const eventName = element.dataset.event || 'change';
    const valueKey = element.dataset.key || 'value';
    const format = element.dataset.format || '{value}';
    const hideEmpty = element.dataset.hideEmpty === 'true';

    const updateText = (data) => {
        if ((data === '' || data === null || data === undefined) && hideEmpty) {
            element.textContent = '';
            return;
        }

        let text = format;
        
        if (typeof data === 'object' && data !== null) {
            // Replace all keys in the format string
            Object.keys(data).forEach(key => {
                const val = data[key];
                // Handle arrays by joining them
                const displayVal = Array.isArray(val) ? val.join(', ') : val;
                text = text.replace(new RegExp(`{${key}}`, 'g'), displayVal);
            });
            // Also try to replace {value} with the object itself if it wasn't an object with keys
            // but here we assume data IS the object containing keys.
        } else {
            text = text.replace('{value}', data);
        }
        
        element.textContent = text;
    };

    const handleEvent = (e) => {
        let data;

        // Priority 1: Event Detail (Custom Events)
        if (e.detail) {
            // If valueKey is specified and exists in detail, use it.
            // Otherwise, use the whole detail object to allow multi-key formatting.
            if (valueKey !== 'value' && e.detail[valueKey] !== undefined) {
                data = e.detail[valueKey];
            } else {
                data = e.detail;
            }
        }
        // Priority 2: Event Target Property (Native Inputs)
        else if (e.target && e.target[valueKey] !== undefined) {
            data = e.target[valueKey];
        }
        // Priority 3: Direct property on source element (fallback)
        else if (sourceElement[valueKey] !== undefined) {
            data = sourceElement[valueKey];
        }

        updateText(data);
    };

    sourceElement.addEventListener(eventName, handleEvent);

    // Initial state check? 
    // If the source has a value property, we can try to set it initially.
    // But for custom components, the value might not be on the DOM element directly.
    // We'll skip initial set for now unless we want to read DOM attributes.
    
    return {
        destroy: () => {
            sourceElement.removeEventListener(eventName, handleEvent);
        }
    };
}
