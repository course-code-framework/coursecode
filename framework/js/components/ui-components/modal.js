/**
 * @file modal.js
 * @description Dynamic modal management system with audio support.
 *
 * Usage:
 *   import * as Modal from './modal.js';
 *
 *   // In main application entry point:
 *   Modal.setup();
 *
 *   // To show a modal:
 *   Modal.show({
 *     title: 'My Title',
 *     body: '<p>My content.</p>',
 *     footer: '<button data-action="close-modal">Close</button>',
 *     config: { closeOnBackdrop: true, closeOnEscape: true },
 *     audio: { 
 *       src: 'audio/modal-narration.mp3', 
 *       autoplay: true,
 *       required: true,           // Audio must complete before modal counts as viewed
 *       completionThreshold: 0.9  // 90% listened = complete
 *     },
 *     onOpen: () => console.log('Modal opened!'),
 *     onClose: () => console.log('Modal closed!'),
 *   });
 * 
 * Declarative Audio:
 *   <button data-modal-trigger="my-modal" 
 *           data-audio-src="audio/modal.mp3"
 *           data-audio-required="true"
 *           data-audio-threshold="0.9">
 */

import { iconManager } from '../../utilities/icons.js';
import { announceToScreenReader } from './index.js';
import { trapFocus } from '../../utilities/utilities.js';
import audioManager from '../../managers/audio-manager.js';
import engagementManager from '../../engagement/engagement-manager.js';
import * as NavigationState from '../../navigation/NavigationState.js';
import * as AudioPlayer from './audio-player.js';
import { eventBus } from '../../core/event-bus.js';
import { logger } from '../../utilities/logger.js';
import { renderCompactPlayer } from './audio-player.js';

// Schema for validation, linting, and AI-assisted authoring
export const schema = {
    type: 'modal-trigger',
    description: 'Dynamic modal with audio support and focus trapping',
    example: '<button data-component=\'modal-trigger\' data-title=\'Welcome\' data-body=\'<p>This modal supports rich content, audio narration, and focus trapping for accessibility.</p>\' class=\'btn btn-primary\'>Open Modal</button>',
    properties: {
        closeOnBackdrop: { type: 'boolean', default: true, description: 'Close when clicking backdrop' },
        closeOnEscape: { type: 'boolean', default: true, description: 'Close on Escape key' },
        hideCloseButton: { type: 'boolean', default: false, description: 'Hide the X close button' }
    },
    structure: {
        trigger: '[data-modal-trigger], [data-component="modal-trigger"]',
        modal: '#global-modal',
        backdrop: '.modal-backdrop'
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/modals.css',
    engagementTracking: 'viewAllModals',
    emitsEvents: ['modal:opened', 'modal:closed']
};

let modalElement = null;
let modalTitle = null;
let modalBody = null;
let modalFooter = null;
let backdropElement = null;

let activeConfig = {};
let previousFocus = null;
let isInitialized = false;
let currentModalId = null; // Track current modal for audio completion
let audioCompletedHandler = null; // Audio completion event handler
let currentSlideId = null; // Track slide ID for engagement tracking

/**
 * Checks if the modal is currently visible.
 * @returns {boolean}
 */
function isVisible() {
    return modalElement && modalElement.classList.contains('active');
}

/**
 * Initializes the modal system. Must be called once on app startup.
 */
export function setup() {
    if (isInitialized) {
        return;
    }

    modalElement = document.getElementById('global-modal');
    backdropElement = document.querySelector('.modal-backdrop');

    // Inject standard close icon
    if (modalElement) {
        const closeBtn = modalElement.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.innerHTML = iconManager.getIcon('x');
        }
    }

    if (!modalElement || !backdropElement) {
        logger.fatal('Modal elements (#global-modal, .modal-backdrop) not found in the DOM.', { domain: 'ui', operation: 'Modal.setup' });
        return;
    }

    modalTitle = document.getElementById('global-modal-title');
    modalBody = document.getElementById('global-modal-body');
    modalFooter = document.getElementById('global-modal-footer');

    // Close button handler (delegated to handle dynamic content)
    modalElement.addEventListener('click', (event) => {
        if (event.target.closest('[data-action="close-modal"]')) {
            hide();
        }
    });

    // Backdrop click handler
    backdropElement.addEventListener('click', () => {
        if (activeConfig.closeOnBackdrop) {
            hide();
        }
    });

    // Global Escape key handler
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isVisible() && activeConfig.closeOnEscape) {
            hide();
        }
    });

    isInitialized = true;
}

/**
 * Initializes a single declarative modal trigger.
 * @param {HTMLElement} trigger 
 */
export function init(trigger) {
    trigger.addEventListener('click', () => {
        const title = trigger.dataset.title || 'Modal';
        let body = trigger.dataset.body || '';
        let footer = trigger.dataset.footer || '<button class="btn btn-secondary" data-action="close-modal">Close</button>';

        // If body/footer starts with #, try to find element and use its HTML
        // Handle both regular elements and <template> elements
        if (body.startsWith('#')) {
            const el = document.querySelector(body);
            if (el) {
                if (el.tagName === 'TEMPLATE') {
                    // For <template> elements, clone content and extract HTML
                    const tempDiv = document.createElement('div');
                    tempDiv.appendChild(el.content.cloneNode(true));
                    body = tempDiv.innerHTML;
                } else {
                    body = el.innerHTML;
                }
            }
        }
        if (footer.startsWith('#')) {
            const el = document.querySelector(footer);
            if (el) {
                if (el.tagName === 'TEMPLATE') {
                    const tempDiv = document.createElement('div');
                    tempDiv.appendChild(el.content.cloneNode(true));
                    footer = tempDiv.innerHTML;
                } else {
                    footer = el.innerHTML;
                }
            }
        }

        // Check for audio configuration on trigger
        const audioSrc = trigger.dataset.audioSrc;
        const audioConfig = audioSrc ? {
            src: audioSrc,
            autoplay: trigger.dataset.audioAutoplay === 'true',
            required: trigger.dataset.audioRequired === 'true',
            completionThreshold: parseFloat(trigger.dataset.audioThreshold) || 0.95
        } : null;

        // Get modal ID for tracking (from trigger id or generate one)
        const modalId = trigger.dataset.modalId || trigger.id || `modal-${Date.now()}`;

        show({
            title,
            body,
            footer,
            audio: audioConfig,
            modalId,
            config: {
                closeOnBackdrop: trigger.dataset.closeOnBackdrop !== 'false',
                closeOnEscape: trigger.dataset.closeOnEscape !== 'false'
            }
        });
    });
}

/**
 * Shows the global modal with dynamic content.
 * @param {object} options - The modal configuration.
 * @param {string} options.title - The text for the modal title.
 * @param {string} options.body - The HTML string for the modal body.
 * @param {string} [options.footer] - The HTML string for the modal footer.
 * @param {string} [options.modalId] - Unique identifier for this modal (for engagement tracking).
 * @param {object} [options.config] - Behavior configuration.
 * @param {boolean} [options.config.closeOnBackdrop=true] - If true, clicking the backdrop closes the modal.
 * @param {boolean} [options.config.closeOnEscape=true] - If true, pressing Escape closes the modal.
 * @param {boolean} [options.config.hideCloseButton=false] - If true, hides the modal's close (X) button.
 * @param {object} [options.audio] - Audio configuration for modal narration.
 * @param {string} options.audio.src - Audio file source path.
 * @param {boolean} [options.audio.autoplay=true] - Whether to autoplay the audio.
 * @param {boolean} [options.audio.required=false] - Whether audio must complete for modal engagement.
 * @param {number} [options.audio.completionThreshold=0.95] - Percentage (0-1) for completion.
 * @param {Function} [options.onOpen] - Callback executed when the modal opens.
 * @param {Function} [options.onClose] - Callback executed when the modal closes.
 */
export async function show({ title, body, footer = '', modalId = null, config = {}, audio = null, onOpen, onClose }) {
    if (!isInitialized) {
        throw new Error('Modal system not initialized. Call setup() first.');
    }

    // Generate modal ID if not provided
    currentModalId = modalId || `modal-${Date.now()}`;

    // Store config for this active session
    activeConfig = {
        closeOnBackdrop: config.closeOnBackdrop !== false,
        closeOnEscape: config.closeOnEscape !== false,
        hideCloseButton: config.hideCloseButton === true,
        audio,
        modalId: currentModalId,
        onOpen,
        onClose,
    };

    // Show/hide the close button based on config
    const closeBtn = modalElement.querySelector('.modal-close');
    if (closeBtn) {
        closeBtn.style.display = activeConfig.hideCloseButton ? 'none' : '';
    }

    // Populate content
    modalTitle.textContent = title;
    modalBody.innerHTML = body;

    // If audio is present, prepend compact audio player to footer
    if (audio && audio.src) {
        const compactAudioHtml = renderCompactPlayer();
        modalFooter.innerHTML = compactAudioHtml + footer;
    } else {
        modalFooter.innerHTML = footer;
    }

    // Save current focus
    previousFocus = document.activeElement;

    // Save the current slide ID (for engagement tracking)
    currentSlideId = NavigationState.getCurrentSlideId();

    // Track modal view for engagement (if this modal is registered for tracking)
    if (currentSlideId && currentModalId) {
        engagementManager.trackModalView(currentSlideId, currentModalId);
    }

    // Handle audio: load modal audio
    // Note: Due to singleton audio element, slide audio and modal audio are mutually exclusive
    // (enforced by runtime-linter - a slide cannot have both)
    if (audioManager.isReady() && audio && audio.src) {
        const audioContextId = `modal-${currentModalId}`;
        try {
            await audioManager.load({
                src: audio.src,
                autoplay: audio.autoplay === true,
                required: audio.required || false,
                completionThreshold: audio.completionThreshold || 0.95
            }, audioContextId, 'modal');

            logger.debug(`[Modal] Loaded modal audio: ${audioContextId}`);

            // Initialize event listeners AFTER audio is loaded
            if (modalFooter) {
                AudioPlayer.initAudioControlsInContainer(modalFooter);
            }
        } catch (err) {
            logger.warn('[Modal] Failed to load modal audio:', err.message);
        }

        // If audio is required, listen for completion
        if (audio.required) {
            audioCompletedHandler = ({ contextId }) => {
                if (contextId === audioContextId && currentSlideId) {
                    engagementManager.trackModalAudioComplete(currentSlideId, currentModalId);
                }
            };
            eventBus.on('audio:completed', audioCompletedHandler);
        }
    }

    // Show modal and backdrop
    backdropElement.classList.add('active');
    modalElement.classList.add('active');
    modalElement.setAttribute('aria-hidden', 'false');

    // Focus first focusable element
    setTimeout(() => {
        const focusable = modalElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length > 0) {
            focusable[0].focus();
        }
    }, 100);

    // Setup focus trap
    modalElement._focusTrapCleanup = trapFocus(modalElement);

    if (activeConfig.onOpen) {
        activeConfig.onOpen(modalElement);
    }

    announceToScreenReader(`Modal opened: ${title}`);
}

/**
 * Hides the global modal.
 */
export function hide() {
    if (!isInitialized || !modalElement.classList.contains('active')) {
        return;
    }

    modalElement.classList.remove('active');
    modalElement.setAttribute('aria-hidden', 'true');
    backdropElement.classList.remove('active');

    // Clean up focus trap
    if (modalElement._focusTrapCleanup && typeof modalElement._focusTrapCleanup === 'function') {
        modalElement._focusTrapCleanup();
        modalElement._focusTrapCleanup = null;
    }

    // Clean up audio completion listener
    if (audioCompletedHandler) {
        eventBus.off('audio:completed', audioCompletedHandler);
        audioCompletedHandler = null;
    }

    // Clean up audio state update listeners from modal footer
    if (modalFooter._audioStateUpdateCleanup && typeof modalFooter._audioStateUpdateCleanup === 'function') {
        modalFooter._audioStateUpdateCleanup();
        modalFooter._audioStateUpdateCleanup = null;
    }

    // Handle audio: unload modal audio
    // Note: No slide audio to restore (they're mutually exclusive, enforced by runtime-linter)
    if (audioManager.isReady() && activeConfig.audio) {
        audioManager.unload();
        logger.debug('[Modal] Unloaded modal audio');
    }

    // Restore focus
    if (previousFocus) {
        previousFocus.focus();
        previousFocus = null;
    }

    // Fire onClose callback
    if (activeConfig.onClose) {
        activeConfig.onClose(modalElement);
    }

    // Clear content and config for next use
    modalTitle.textContent = '';
    modalBody.innerHTML = '';
    modalFooter.innerHTML = '';
    currentModalId = null;
    activeConfig = {};

    announceToScreenReader('Modal closed');
}