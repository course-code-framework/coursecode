/**
 * @file flip-card.js
 * @description Flip card component with accessibility and engagement tracking.
 * 
 * Usage:
 *   <div class="flip-card" data-component="flip-card" data-flip-card-id="card-1">
 *     <div class="flip-card-inner">
 *       <div class="flip-card-front">Front Content</div>
 *       <div class="flip-card-back">Back Content</div>
 *     </div>
 *   </div>
 * 
 * For engagement tracking, use the viewAllFlipCards requirement:
 *   engagement: {
 *     required: true,
 *     requirements: [{ type: 'viewAllFlipCards' }]
 *   }
 * 
 * Each flip card must have a unique data-flip-card-id attribute for tracking.
 */

export const schema = {
    type: 'flip-card',
    description: 'Interactive flip card with front/back content',
    example: `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
  <div class="flip-card" data-component="flip-card">
    <div class="flip-card-inner">
      <div class="flip-card-front"><span class="flip-card-icon">🎯</span><h3 class="flip-card-title">Click to Flip</h3><p class="text-sm text-muted">Front side</p></div>
      <div class="flip-card-back"><h3 class="flip-card-title">Answer</h3><p class="flip-card-text">This is the back side content.</p></div>
    </div>
  </div>
  <div class="flip-card" data-component="flip-card">
    <div class="flip-card-inner">
      <div class="flip-card-front"><span class="flip-card-icon">💡</span><h3 class="flip-card-title">Key Concept</h3><p class="text-sm text-muted">Click to reveal</p></div>
      <div class="flip-card-back bg-secondary"><h3 class="flip-card-title">Definition</h3><p class="flip-card-text">The concept explained in detail.</p></div>
    </div>
  </div>
</div>`,
    properties: {
        flipCardId: { type: 'string', required: true, dataAttribute: 'data-flip-card-id' }
    },
    structure: {
        container: '[data-component="flip-card"]',
        children: {
            inner: { selector: '.flip-card-inner', required: true },
            front: { selector: '.flip-card-front', required: true },
            back: { selector: '.flip-card-back', required: true }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/flip-cards.css',
    engagementTracking: 'viewAllFlipCards',
    emitsEvents: ['flipcard:flipped']
};

import engagementManager from '../../engagement/engagement-manager.js';
import * as NavigationState from '../../navigation/NavigationState.js';
import { announceToScreenReader } from './index.js';
import { logger } from '../../utilities/logger.js';

/**
 * Initializes all flip card components within a container.
 * Call this once per slide to register all flip cards for engagement tracking.
 * 
 * @param {HTMLElement|string} root - Container element or selector
 * @returns {Object} API for controlling flip cards
 */
export function initFlipCards(root) {
    const container = typeof root === 'string' ? document.querySelector(root) : root;
    if (!container) {
        logger.fatal('UIComponents.initFlipCards: container not found', { domain: 'ui', operation: 'initFlipCards' });
        return;
    }

    const flipCards = Array.from(container.querySelectorAll('[data-component="flip-card"], .flip-card'));
    
    if (flipCards.length === 0) {
        logger.debug('[FlipCards] No flip cards found in container');
        return { destroy: () => {} };
    }

    // Validate: All flip cards should have unique IDs for tracking
    const cardIds = [];
    const errors = [];
    
    flipCards.forEach((card, index) => {
        const cardId = card.dataset.flipCardId;
        if (!cardId) {
            errors.push(`Flip card ${index + 1} is missing data-flip-card-id attribute.`);
        } else if (cardIds.includes(cardId)) {
            errors.push(`Duplicate flip card ID: "${cardId}". Each flip card must have a unique ID.`);
        } else {
            cardIds.push(cardId);
        }
    });

    if (errors.length > 0) {
        logger.fatal(`UIComponents.initFlipCards: Invalid structure:\n${errors.join('\n')}`, { domain: 'ui', operation: 'initFlipCards' });
        return;
    }

    // Register flip cards with engagement manager
    const currentSlideId = NavigationState.getCurrentSlideId();
    if (currentSlideId) {
        engagementManager.registerFlipCards(currentSlideId, cardIds);
    }

    // Initialize each flip card
    flipCards.forEach(card => {
        init(card);
    });

    return {
        /**
         * Programmatically flip a card by ID
         * @param {string} cardId - The flip card ID
         * @param {boolean} [flipped=true] - Whether to flip to back (true) or front (false)
         */
        flipCard(cardId, flipped = true) {
            const card = container.querySelector(`[data-flip-card-id="${cardId}"]`);
            if (card) {
                if (flipped) {
                    card.classList.add('is-flipped');
                } else {
                    card.classList.remove('is-flipped');
                }
                card.setAttribute('aria-expanded', String(flipped));
                
                // Track the flip for engagement
                if (flipped) {
                    const slideId = NavigationState.getCurrentSlideId();
                    if (slideId) {
                        engagementManager.trackFlipCardView(slideId, cardId);
                    }
                }
            }
        },

        /**
         * Get IDs of all flipped cards
         * @returns {string[]} Array of flipped card IDs
         */
        getFlippedCards() {
            return flipCards
                .filter(card => card.classList.contains('is-flipped'))
                .map(card => card.dataset.flipCardId);
        },

        /**
         * Reset all cards to unflipped state
         */
        resetAll() {
            flipCards.forEach(card => {
                card.classList.remove('is-flipped');
                card.setAttribute('aria-expanded', 'false');
            });
        },

        /**
         * Destroy event listeners
         */
        destroy() {
            // Individual card cleanup is handled by init
            // This is mainly for consistency with other component APIs
        }
    };
}

/**
 * Initializes a single flip card component.
 * Ensures the card has a tabindex for keyboard accessibility and handles click/keyboard events.
 * Note: Flip card registration for engagement tracking is handled by ui-initializer
 * after all flip cards on the slide are initialized.
 * @param {HTMLElement} element - The flip card container element.
 */
export function init(element) {
    if (!element) return;

    const cardId = element.dataset.flipCardId;

    // Ensure the card is keyboard focusable if not already set
    if (!element.hasAttribute('tabindex')) {
        element.setAttribute('tabindex', '0');
    }

    // Set initial ARIA attributes
    if (!element.hasAttribute('aria-expanded')) {
        element.setAttribute('aria-expanded', 'false');
    }
    if (!element.hasAttribute('role')) {
        element.setAttribute('role', 'button');
    }

    // Toggle flip state
    const toggleFlip = (e) => {
        // Prevent default if it's a keydown event to avoid scrolling
        if (e.type === 'keydown') {
            e.preventDefault();
        }
        element.classList.toggle('is-flipped');
        
        const isFlipped = element.classList.contains('is-flipped');
        element.setAttribute('aria-expanded', String(isFlipped));

        // Track flip for engagement when card is flipped to back
        if (isFlipped && cardId) {
            const slideId = NavigationState.getCurrentSlideId();
            if (slideId) {
                engagementManager.trackFlipCardView(slideId, cardId);
            }
        }

        // Announce state change for screen readers
        const action = isFlipped ? 'Card flipped to reveal back' : 'Card flipped to show front';
        announceToScreenReader(action);
    };

    // Click listener
    element.addEventListener('click', toggleFlip);

    // Keyboard listener (Enter or Space)
    element.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            toggleFlip(e);
        }
    });
}
