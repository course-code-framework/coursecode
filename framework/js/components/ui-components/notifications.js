/**
 * @file notifications.js
 * @description Notification system with event delegation.
 */

export const schema = {
    type: 'notification-trigger',
    description: 'Declarative notification trigger',
    example: `<button data-action="show-notification" data-type="success" data-message="Your progress has been saved!" class="btn btn-primary" style="margin-right: 8px;">Success</button>
<button data-action="show-notification" data-type="warning" data-message="You have unsaved changes." class="btn btn-secondary" style="margin-right: 8px;">Warning</button>
<button data-action="show-notification" data-type="error" data-message="Connection lost. Please try again." class="btn btn-secondary">Error</button>`,
    properties: {
        type: { type: 'string', enum: ['info', 'success', 'warning', 'error'], default: 'info', dataAttribute: 'data-type' },
        message: { type: 'string', required: true, dataAttribute: 'data-message' }
    },
    structure: {
        container: '[data-action="show-notification"]',
        children: {}
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/notifications.css',
    engagementTracking: null,
    emitsEvents: []
};

import { announceToScreenReader } from './index.js';
import { logger } from '../../utilities/logger.js';

let notificationContainer = null;
let notificationId = 0;
let initialized = false;

export function setup() {
    if (initialized) return;

    notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        logger.fatal('Notification container with ID "notification-container" not found in DOM.', { domain: 'ui', operation: 'Notifications.setup' });
        return;
    }

    // Add a single, permanent delegated click listener
    notificationContainer.addEventListener('click', (event) => {
        const closeButton = event.target.closest('[data-action="dismiss-notification"]');
        if (closeButton) {
            const notification = closeButton.closest('.notification');
            if (notification) {
                dismissNotification(notification.id);
            }
        }
    });

    initialized = true;
}

/**
 * Initializes declarative notification triggers in a container using event delegation.
 * @param {HTMLElement} container
 */
export function init(container) {
    // Use event delegation to handle dynamically rendered content
    container.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-action="show-notification"]');
        if (trigger) {
            const type = trigger.dataset.type || 'info';
            const message = trigger.dataset.message || 'Notification';
            showNotification(message, type);
        }
    });
}

export function showNotification(message, type = 'info', duration = 5000, options = {}) {
    if (!initialized) {
        setup();
    }

    if (!message || typeof message !== 'string') {
        throw new Error('Notification message must be a non-empty string');
    }

    const id = `notification-${++notificationId}`;
    const notification = document.createElement('div');

    notification.id = id;
    notification.className = `notification notification-${type}`;
    notification.setAttribute('role', type === 'error' ? 'alert' : 'status');
    notification.setAttribute('data-testid', `notification-${type}`);

    const dismissible = options.dismissible !== false;
    const closeButton = dismissible ? `
        <button class="notification-close" data-action="dismiss-notification" aria-label="Close notification" data-testid="notification-close">×</button>
    ` : '';

    notification.innerHTML = `
        <span class="notification-message">${message}</span>
        ${closeButton}
    `;

    notificationContainer.appendChild(notification);

    if (duration > 0) {
        setTimeout(() => dismissNotification(id), duration);
    }

    announceToScreenReader(message, type === 'error' ? 'assertive' : 'polite');

    return id;
}

export function dismissNotification(id) {
  const notification = document.getElementById(id);
  if (!notification) return;

  notification.style.animation = 'notificationSlideOut 0.3s ease-out forwards';
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 300);
}

export function clearAllNotifications() {
  if (!notificationContainer) return;
  const notifications = notificationContainer.querySelectorAll('.notification');
  notifications.forEach(notification => dismissNotification(notification.id));
}

export function showSuccess(message, duration = 4000, options = {}) {
  return showNotification(message, 'success', duration, options);
}

export function showWarning(message, duration = 6000, options = {}) {
  return showNotification(message, 'warning', duration, options);
}

export function showError(message, duration = 8000, options = {}) {
  return showNotification(message, 'error', duration, options);
}

export function showInfo(message, duration = 5000, options = {}) {
  return showNotification(message, 'info', duration, options);
}
