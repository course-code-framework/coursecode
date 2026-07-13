/**
 * @file ui-initializer.js
 * @description Automatically initializes UI components based on data-attributes.
 * Uses the component catalog for dynamic discovery — no hardcoded component list.
 */

import { logger } from './logger.js';
import { getComponentInit, getComponentStyles, isComponentRegistered, getRegisteredComponentTypes } from '../core/component-catalog.js';
import { initNotificationTriggers } from '../components/ui-components/notifications.js';


import engagementManager from '../engagement/engagement-manager.js';
import * as NavigationState from '../navigation/NavigationState.js';

// Track which custom component styles have been injected
const injectedStyles = new Set();

// Component initializers may return an object with destroy(), or a cleanup
// function directly. Keep those handles with the rendered view so ViewManager
// can release document-level listeners and other resources before removing it.
const componentCleanups = new WeakMap();

/**
 * Inject custom component styles into the document head
 * @param {string} type - Component type
 * @param {string} styles - CSS string
 */
function injectStyles(type, styles) {
    if (injectedStyles.has(type) || !styles) return;

    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-component-styles', type);
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
    injectedStyles.add(type);
}

/**
 * Scans a container element for declarative UI components and initializes them.
 * @param {HTMLElement} container - The container element to scan.
 */
export function initializeDeclarativeComponents(container) {
    if (!container || typeof container.querySelectorAll !== 'function') {
        return;
    }

    // Re-initializing the same rendered view should not stack event listeners.
    cleanupDeclarativeComponents(container);

    const components = [
        ...(container.matches?.('[data-component]') ? [container] : []),
        ...container.querySelectorAll('[data-component]')
    ];
    const cleanups = [];

    components.forEach(element => {
        const componentName = element.dataset.component;

        if (!isComponentRegistered(componentName)) {
            logger.warn(`[UI-Initializer] Unknown component: '${componentName}'. Registered: ${getRegisteredComponentTypes().join(', ')}`);
            return;
        }

        // Inject styles for custom components (CSS-in-JS)
        const styles = getComponentStyles(componentName);
        if (styles) {
            injectStyles(componentName, styles);
        }

        // Get and call init function from catalog
        const initializer = getComponentInit(componentName);
        if (initializer && typeof initializer === 'function') {
            try {
                const instance = initializer(element);
                if (typeof instance === 'function') {
                    cleanups.push(instance);
                } else if (instance && typeof instance.destroy === 'function') {
                    cleanups.push(() => instance.destroy());
                }
            } catch (error) {
                logger.error(`[UI-Initializer] Failed to initialize '${componentName}' component: ${error.message}`, { domain: 'ui', operation: 'initializeComponent', stack: error.stack, component: componentName });
            }
        }
        // CSS-only components (no init or no-op init) handled purely by CSS
    });

    // Tooltips auto-initialize via event delegation - no call needed

    // Register all flip cards with engagement manager (batch registration like tabs)
    // This must happen AFTER all flip cards are initialized
    registerFlipCardsForEngagement(container);

    // Register all modals with engagement manager (batch registration)
    // This must happen AFTER all modal triggers are initialized
    registerModalsForEngagement(container);

    // Register hotspots across every interactive image in the rendered view as
    // one batch so revisiting a slide cannot inflate engagement totals.
    registerInteractiveImagesForEngagement(container);

    // Initialize declarative notification triggers (event delegation pattern)
    const notificationInstance = initNotificationTriggers(container);
    if (notificationInstance && typeof notificationInstance.destroy === 'function') {
        cleanups.push(() => notificationInstance.destroy());
    }


    // Register lightbox triggers with engagement manager (batch registration)
    // This must happen AFTER all lightbox triggers are initialized by the catalog
    registerLightboxesForEngagement(container);

    if (cleanups.length > 0) {
        componentCleanups.set(container, cleanups);
    }
}

/**
 * Destroys declarative component instances associated with a rendered view.
 * Cleanup is best-effort so one faulty component cannot prevent the rest from
 * releasing their resources.
 * @param {HTMLElement} container - The rendered view that was initialized.
 */
export function cleanupDeclarativeComponents(container) {
    const cleanups = componentCleanups.get(container);
    if (!cleanups) return;

    componentCleanups.delete(container);
    for (const cleanup of [...cleanups].reverse()) {
        try {
            cleanup();
        } catch (error) {
            logger.error(`[UI-Initializer] Component cleanup failed: ${error.message}`, {
                domain: 'ui',
                operation: 'cleanupComponent',
                stack: error.stack
            });
        }
    }
}

/**
 * Registers all flip cards in the container with the engagement manager.
 * This batch registration ensures flipCardsTotal is set correctly after all cards are found.
 * @param {HTMLElement} container - The container to scan for flip cards
 */
function registerFlipCardsForEngagement(container) {
    const flipCards = container.querySelectorAll('[data-component="flip-card"][data-flip-card-id]');
    if (!flipCards.length) return;

    const currentSlideId = NavigationState.getCurrentSlideId();
    if (!currentSlideId) return;

    const cardIds = Array.from(flipCards).map(card => card.dataset.flipCardId).filter(Boolean);
    if (cardIds.length > 0) {
        engagementManager.registerFlipCards(currentSlideId, cardIds);
        logger.debug(`[UI-Initializer] Registered ${cardIds.length} flip cards for engagement tracking`);
    }
}

/**
 * Registers all modal triggers in the container with the engagement manager.
 * This batch registration ensures modalsTotal is set correctly after all triggers are found.
 * @param {HTMLElement} container - The container to scan for modal triggers
 */
function registerModalsForEngagement(container) {
    const modalTriggers = container.querySelectorAll('[data-component="modal-trigger"][data-modal-id]');
    if (!modalTriggers.length) return;

    const currentSlideId = NavigationState.getCurrentSlideId();
    if (!currentSlideId) return;

    const modalIds = Array.from(modalTriggers).map(trigger => trigger.dataset.modalId).filter(Boolean);
    if (modalIds.length > 0) {
        engagementManager.registerModals(currentSlideId, modalIds);
        logger.debug(`[UI-Initializer] Registered ${modalIds.length} modals for engagement tracking`);
    }
}

/**
 * Registers every interactive-image hotspot in the rendered view as one batch.
 * @param {HTMLElement} container - The container to scan for hotspots
 */
function registerInteractiveImagesForEngagement(container) {
    const hotspots = container.querySelectorAll(
        '[data-component="interactive-image"] [data-hotspot-id]'
    );
    if (!hotspots.length) return;

    const currentSlideId = NavigationState.getCurrentSlideId();
    if (!currentSlideId) return;

    const hotspotIds = Array.from(hotspots)
        .map(hotspot => hotspot.dataset.hotspotId)
        .filter(Boolean);
    if (hotspotIds.length > 0) {
        engagementManager.registerInteractiveImages(currentSlideId, hotspotIds);
        logger.debug(`[UI-Initializer] Registered ${hotspotIds.length} interactive-image hotspots for engagement tracking`);
    }
}

/**
 * Registers all lightbox triggers in the container with the engagement manager.
 * This batch registration ensures lightboxesTotal is set correctly after all triggers are found.
 * @param {HTMLElement} container - The container to scan for lightbox triggers
 */
function registerLightboxesForEngagement(container) {
    const lightboxTriggers = container.querySelectorAll('[data-component="lightbox"]');
    if (!lightboxTriggers.length) return;

    const currentSlideId = NavigationState.getCurrentSlideId();
    if (!currentSlideId) return;

    const lightboxIds = Array.from(lightboxTriggers)
        .map(trigger => trigger.id || trigger.dataset.lightboxId)
        .filter(Boolean);
    if (lightboxIds.length > 0) {
        engagementManager.registerLightboxes(currentSlideId, lightboxIds);
        logger.debug(`[UI-Initializer] Registered ${lightboxIds.length} lightboxes for engagement tracking`);
    }
}
