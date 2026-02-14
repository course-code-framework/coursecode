// index.js — UI Components shared utilities

import accessibilityManager from '../../managers/accessibility-manager.js';

/**
 * Announces a message to a screen reader.
 * @param {string} message - The message to announce.
 * @param {string} [priority='polite'] - The assertiveness level ('polite' or 'assertive').
 */
export function announceToScreenReader(message, priority = 'polite') {
  accessibilityManager.announce(message, priority);
}
