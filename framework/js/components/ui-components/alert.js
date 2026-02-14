/**
 * @file alert.js
 * @description Handles dismissible, in-page alerts.
 *
 * Usage (Declarative):
 * <div class="alert alert-warning" data-component="alert">
 *   <p>This is a warning message.</p>
 *   <button class="alert-close" data-action="dismiss-alert" aria-label="Dismiss alert">&times;</button>
 * </div>
 */

export const schema = {
    type: 'alert',
    description: 'Dismissible in-page alert message',
    example: `<div class="alert alert-warning" data-component="alert">
  <p><strong>Important:</strong> Please review the course requirements before proceeding.</p>
  <button class="alert-close" data-action="dismiss-alert" aria-label="Dismiss alert">&times;</button>
</div>`,
    properties: {},
    structure: {
        container: '[data-component="alert"]',
        children: {
            close: { selector: '[data-action="dismiss-alert"]', required: false }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/callouts.css',
    engagementTracking: null,
    emitsEvents: []
};

import { iconManager } from '../../utilities/icons.js';
import { logger } from '../../utilities/logger.js';

/**
 * Initializes a dismissible alert component.
 * @param {HTMLElement} alertElement - The alert container element.
 * @returns {object} An object with a `destroy` method.
 */
export function init(alertElement) {
    if (!alertElement) {
        logger.fatal('initAlert: alertElement not found.', { domain: 'ui', operation: 'initAlert' });
        return;
    }

    const closeButton = alertElement.querySelector('[data-action="dismiss-alert"]');

    // Inject standardize icon if button exists
    if (closeButton) {
        closeButton.innerHTML = iconManager.getIcon('x');
    }

    if (!closeButton) {
        // If there's no close button, there's nothing to initialize.
        return {
            destroy: () => { }
        };
    }

    const dismiss = () => {
        alertElement.style.opacity = '0';
        alertElement.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out, max-height 0.3s 0.1s, padding 0.3s 0.1s, margin 0.3s 0.1s';
        alertElement.style.transform = 'scaleY(0.8)';
        alertElement.style.maxHeight = '0';
        alertElement.style.paddingTop = '0';
        alertElement.style.paddingBottom = '0';
        alertElement.style.marginTop = '0';
        alertElement.style.marginBottom = '0';
        alertElement.style.borderWidth = '0';


        // Remove from DOM after transition
        setTimeout(() => {
            alertElement.remove();
        }, 400);
    };

    closeButton.addEventListener('click', dismiss);

    return {
        destroy: () => {
            closeButton.removeEventListener('click', dismiss);
        }
    };
}
