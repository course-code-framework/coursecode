/**
 * @file index.js
 * @description Entry point for the automation module.
 * Initializes and exposes the CourseCodeAutomation API on window.
 * 
 * This entire module is ONLY loaded in development/testing mode when:
 * 1. import.meta.env.MODE !== 'production'
 * 2. courseConfig.environment.automation.enabled === true
 * 
 * In production builds, Vite's tree-shaking will completely eliminate this code.
 */

import CourseCodeAutomationAPI from './api.js';
import { eventBus } from '../core/event-bus.js';
import { logger } from '../utilities/logger.js';

/**
 * Initializes the automation system
 * - Exposes window.CourseCodeAutomation API
 * - Sets up event listeners for tracking
 */
export function initializeAutomation() {
    logger.debug('[Automation] Initializing automation system...');

    // Expose the API globally
    window.CourseCodeAutomation = CourseCodeAutomationAPI;

    // Log when interactions are registered
    eventBus.on('interaction:registered', ({ id, type }) => {
        logger.debug(`[Automation] ✓ Registered: ${id} (${type || 'unknown'})`);
    });

    logger.debug('[Automation] ✓ Automation system initialized');
    logger.debug('[Automation] window.CourseCodeAutomation API is now available');
    logger.debug('[Automation] Use window.CourseCodeAutomation.getVersion() for feature info');

    // Emit initialization event
    eventBus.emit('automation:initialized', {
        version: CourseCodeAutomationAPI.getVersion()
    });
}
