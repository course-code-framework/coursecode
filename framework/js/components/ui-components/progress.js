/**
 * @file progress.js
 * @description Handles progress bar components.
 *
 * Usage (Declarative):
 * <div class="progress-bar" data-component="progress" id="my-progress" data-initial-value="25">
 *   <div class="progress-bar-fill"></div>
 *   <span class="progress-bar-text">25%</span>
 * </div>
 *
 * Usage (Imperative):
 * import { updateProgress } from '...';
 * updateProgress('my-progress', 50);
 */

export const schema = {
    type: 'progress',
    description: 'Animated progress bar with percentage display',
    example: `<div class="progress-bar" data-component="progress" id="preview-progress" data-initial-value="65">
  <div class="progress-bar-fill" style="width: 65%"></div>
  <span class="progress-bar-text">65%</span>
</div>`,
    properties: {
        initialValue: { type: 'number', default: 0, dataAttribute: 'data-initial-value' }
    },
    structure: {
        container: '[data-component="progress"]',
        children: {
            fill: { selector: '.progress-bar-fill', required: true },
            text: { selector: '.progress-bar-text', required: false }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/engagement.css',
    engagementTracking: null,
    emitsEvents: []
};

/**
 * Sets the value of a progress bar.
 * @param {HTMLElement|string} elementOrId - The progress bar container element or its ID.
 * @param {number} value - The progress value (0-100).
 */
import { logger } from '../../utilities/logger.js';

export function updateProgress(elementOrId, value) {
    const element = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (!element) {
        logger.error('updateProgress: Element not found.', elementOrId);
        return;
    }

    const fill = element.querySelector('.progress-bar-fill');
    const text = element.querySelector('.progress-bar-text');
    const clampedValue = Math.max(0, Math.min(100, value));

    element.style.setProperty('--progress-percent', `${clampedValue}%`);
    element.setAttribute('aria-valuenow', clampedValue);

    if (fill) {
        fill.style.width = `${clampedValue}%`;
    }
    if (text) {
        text.textContent = `${Math.round(clampedValue)}%`;
    }
}

/**
 * Initializes a progress bar component, setting its initial value.
 * @param {HTMLElement} element - The progress bar container element.
 */
export function init(element) {
    if (!element) {
        logger.fatal('initProgress: element not found.', { domain: 'ui', operation: 'initProgress' });
        return;
    }

    const initialValue = parseFloat(element.dataset.initialValue) || 0;
    updateProgress(element, initialValue);

    return {
        update: (value) => updateProgress(element, value),
        destroy: () => {} // No listeners to remove
    };
}
