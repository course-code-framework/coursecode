/**
 * @file carousel.js
 * @description A simple, accessible image carousel/slider component.
 *
 * Usage (Declarative):
 * <div class="carousel" data-component="carousel" id="my-carousel">
 *   <div class="carousel-track">
 *     <div class="carousel-slide">...</div>
 *     <div class="carousel-slide">...</div>
 *   </div>
 *   <button class="carousel-button prev" data-action="prev-slide" aria-label="Previous Slide">&#10094;</button>
 *   <button class="carousel-button next" data-action="next-slide" aria-label="Next Slide">&#10095;</button>
 *   <div class="carousel-dots"></div>
 * </div>
 */

// Schema for validation, linting, and AI-assisted authoring
export const schema = {
    type: 'carousel',
    description: 'Accessible image carousel/slider with dot navigation',
    example: `<div data-component="carousel">
  <div class="carousel-track">
    <div class="carousel-slide active"><div class="card no-hover"><div class="card-body"><h3>Slide 1</h3><p>First slide content with important information.</p></div></div></div>
    <div class="carousel-slide"><div class="card no-hover"><div class="card-body"><h3>Slide 2</h3><p>Second slide with additional details.</p></div></div></div>
    <div class="carousel-slide"><div class="card no-hover"><div class="card-body"><h3>Slide 3</h3><p>Third slide wrapping up the sequence.</p></div></div></div>
  </div>
  <button class="carousel-button prev" data-action="prev-slide" aria-label="Previous Slide">&#10094;</button>
  <button class="carousel-button next" data-action="next-slide" aria-label="Next Slide">&#10095;</button>
  <div class="carousel-dots"></div>
</div>`,
    properties: {
        autoPlay: { type: 'boolean', default: false, description: 'Auto-advance slides' },
        interval: { type: 'number', default: 5000, description: 'Auto-advance interval in ms' }
    },
    structure: {
        container: '[data-component="carousel"]',
        children: {
            track: { selector: '.carousel-track', required: true },
            slide: { selector: '.carousel-slide', parent: '.carousel-track', required: true, minItems: 1 },
            prevButton: { selector: '[data-action="prev-slide"]' },
            nextButton: { selector: '[data-action="next-slide"]' },
            dots: { selector: '.carousel-dots' }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/carousel.css',
    engagementTracking: null,
    emitsEvents: ['carousel:slide-changed']
};

import { logger } from '../../utilities/logger.js';

/**
 * Initializes a carousel component.
 * @param {HTMLElement} container - The main container for the carousel.
 */
export function init(container) {
    if (!container) {
        logger.fatal('initCarousel: container not found.', { domain: 'ui', operation: 'initCarousel' });
        return;
    }

    const track = container.querySelector('.carousel-track');
    const slides = Array.from(container.querySelectorAll('.carousel-slide'));
    const prevButton = container.querySelector('[data-action="prev-slide"]');
    const nextButton = container.querySelector('[data-action="next-slide"]');
    const dotsContainer = container.querySelector('.carousel-dots');

    if (!track || !slides.length) {
        logger.fatal('initCarousel: A track and slides are required. Ensure carousel HTML structure is correct with .carousel-track and .carousel-slide elements.', { domain: 'ui', operation: 'initCarousel' });
        return;
    }

    let currentIndex = 0;

    const updateCarousel = () => {
        // Move the track
        track.style.transform = `translateX(-${currentIndex * 100}%)`;

        // Update buttons
        if (prevButton) {
            prevButton.disabled = currentIndex === 0;
        }
        if (nextButton) {
            nextButton.disabled = currentIndex === slides.length - 1;
        }

        // Update dots
        if (dotsContainer) {
            const dots = Array.from(dotsContainer.children);
            dots.forEach((dot, index) => {
                dot.classList.toggle('active', index === currentIndex);
            });
        }
        
        // Update slide visibility for screen readers
        slides.forEach((slide, index) => {
            slide.setAttribute('aria-hidden', index !== currentIndex);
        });
    };

    const goToSlide = (index) => {
        if (index < 0 || index >= slides.length) return;
        currentIndex = index;
        updateCarousel();
    };

    // Create dot indicators
    if (dotsContainer) {
        dotsContainer.innerHTML = '';
        slides.forEach((_, index) => {
            const dot = document.createElement('button');
            dot.className = 'carousel-dot';
            dot.setAttribute('aria-label', `Go to slide ${index + 1}`);
            dot.addEventListener('click', () => goToSlide(index));
            dotsContainer.appendChild(dot);
        });
    }

    const clickHandler = (event) => {
        const actionTarget = event.target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;
        if (action === 'next-slide') {
            goToSlide(currentIndex + 1);
        } else if (action === 'prev-slide') {
            goToSlide(currentIndex - 1);
        }
    };

    container.addEventListener('click', clickHandler);

    // Initialize state
    updateCarousel();

    return {
        destroy: () => {
            container.removeEventListener('click', clickHandler);
        }
    };
}
