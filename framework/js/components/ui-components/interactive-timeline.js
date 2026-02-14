/**
 * @file interactive-timeline.js
 * @description Interactive timeline component with expandable events and engagement tracking.
 * 
 * Usage example:
 *   <div class="interactive-timeline" data-component="interactive-timeline">
 *     <div class="timeline-event" data-event-id="event1">
 *       <div class="timeline-marker"></div>
 *       <div class="timeline-date">2020</div>
 *       <div class="timeline-summary">
 *         <h4>Event Title</h4>
 *         <p>Brief description...</p>
 *       </div>
 *       <div class="timeline-details">
 *         <p>Expanded content revealed on click...</p>
 *       </div>
 *     </div>
 *   </div>
 */

export const schema = {
    type: 'interactive-timeline',
    description: 'Timeline with expandable events and engagement tracking',
    example: `<div data-component="interactive-timeline" class="interactive-timeline">
  <div class="timeline-event active" data-event-id="event-1"><div class="timeline-event-marker"></div><div class="timeline-event-label">Phase 1</div><div class="timeline-event-content"><h3>Discovery</h3><p>Research and planning phase.</p></div></div>
  <div class="timeline-event" data-event-id="event-2"><div class="timeline-event-marker"></div><div class="timeline-event-label">Phase 2</div><div class="timeline-event-content"><h3>Development</h3><p>Building core functionality.</p></div></div>
  <div class="timeline-event" data-event-id="event-3"><div class="timeline-event-marker"></div><div class="timeline-event-label">Phase 3</div><div class="timeline-event-content"><h3>Launch</h3><p>Deployment and go-live.</p></div></div>
</div>`,
    properties: {
        mode: { type: 'string', enum: ['free', 'sequential'], default: 'free', dataAttribute: 'data-timeline-mode' }
    },
    structure: {
        container: '[data-component="interactive-timeline"]',
        children: {
            event: { selector: '.timeline-event', required: true, minItems: 1 }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/interactive-timeline.css',
    engagementTracking: 'viewAllTimelineEvents',
    emitsEvents: ['timeline:event-viewed']
};

import { announceToScreenReader } from './index.js';
import engagementManager from '../../engagement/engagement-manager.js';
import * as NavigationState from '../../navigation/NavigationState.js';
import { eventBus } from '../../core/event-bus.js';
import { logger } from '../../utilities/logger.js';

/**
 * Initializes an interactive timeline component.
 * @param {Element|string} root - The timeline container element or selector
 * @param {object} options - Configuration options
 * @param {string} options.mode - 'free' (any order) or 'sequential' (must view in order)
 * @returns {object} API with activate, deactivate, destroy methods
 */
export function init(root, options = {}) {
    const container = typeof root === 'string' ? document.querySelector(root) : root;
    if (!container) {
        logger.fatal('initInteractiveTimeline: container not found', { domain: 'ui', operation: 'initInteractiveTimeline' });
        return;
    }

    const mode = options.mode || container.dataset.timelineMode || 'free';
    const events = Array.from(container.querySelectorAll('.timeline-event'));

    if (!events.length) {
        logger.fatal('initInteractiveTimeline: no timeline events found', { domain: 'ui', operation: 'initInteractiveTimeline' });
        return;
    }

    // Get current slide ID for engagement tracking
    const currentSlideId = NavigationState.getCurrentSlideId();

    // Register timeline events for engagement tracking
    if (currentSlideId) {
        const eventIds = events.map(ev => ev.dataset.eventId).filter(Boolean);
        engagementManager.registerTimeline(currentSlideId, eventIds);
    }

    // Track which events have been viewed
    const viewedEvents = new Set();
    let lastViewedIndex = -1;

    /**
     * Expands a timeline event to show its details.
     * @param {Element} event - The timeline event element
     * @param {boolean} announce - Whether to announce to screen reader
     */
    function expandEvent(event, announce = true) {
        const eventId = event.dataset.eventId;
        const eventIndex = events.indexOf(event);

        // In sequential mode, check if previous events are viewed
        if (mode === 'sequential' && eventIndex > 0) {
            const previousViewed = events.slice(0, eventIndex).every(
                ev => viewedEvents.has(ev.dataset.eventId)
            );
            if (!previousViewed) {
                announceToScreenReader('Please view previous events first', 'polite');
                return;
            }
        }

        // Collapse other events (single-expand behavior)
        events.forEach(ev => {
            if (ev !== event && ev.classList.contains('expanded')) {
                ev.classList.remove('expanded');
                ev.setAttribute('aria-expanded', 'false');
            }
        });

        // Toggle this event
        const isExpanding = !event.classList.contains('expanded');
        event.classList.toggle('expanded');
        event.setAttribute('aria-expanded', isExpanding ? 'true' : 'false');

        if (isExpanding) {
            // Track view
            if (!viewedEvents.has(eventId)) {
                viewedEvents.add(eventId);
                lastViewedIndex = Math.max(lastViewedIndex, eventIndex);

                // Track in engagement manager
                if (currentSlideId && eventId) {
                    engagementManager.trackTimelineView(currentSlideId, eventId);
                }

                // Emit event for other listeners
                eventBus.emit('timeline:event-viewed', {
                    timelineId: container.id || 'timeline',
                    eventId,
                    eventIndex,
                    viewedCount: viewedEvents.size,
                    totalEvents: events.length
                });
            }

            // Update visual progress
            updateProgress();

            if (announce) {
                const title = event.querySelector('h4, h3, .timeline-title')?.textContent || `Event ${eventIndex + 1}`;
                announceToScreenReader(`Expanded: ${title}. ${viewedEvents.size} of ${events.length} events viewed.`);
            }
        }
    }

    /**
     * Updates the progress indicator if present.
     */
    function updateProgress() {
        const progressEl = container.querySelector('.timeline-progress');
        if (progressEl) {
            progressEl.textContent = `${viewedEvents.size} of ${events.length}`;
            progressEl.setAttribute('aria-valuenow', viewedEvents.size);
            progressEl.setAttribute('aria-valuemax', events.length);
        }

        // Update visual state of markers
        events.forEach((ev, index) => {
            const eventId = ev.dataset.eventId;
            if (viewedEvents.has(eventId)) {
                ev.classList.add('viewed');
            }

            // In sequential mode, mark locked events
            if (mode === 'sequential') {
                const isLocked = index > 0 && !events.slice(0, index).every(
                    prev => viewedEvents.has(prev.dataset.eventId)
                );
                ev.classList.toggle('locked', isLocked);
                ev.setAttribute('aria-disabled', isLocked ? 'true' : 'false');
            }
        });
    }

    /**
     * Handles click events on timeline items.
     */
    function handleClick(e) {
        const event = e.target.closest('.timeline-event');
        if (event && events.includes(event)) {
            e.preventDefault();
            expandEvent(event);
        }
    }

    /**
     * Handles keyboard navigation.
     */
    function handleKeydown(e) {
        const event = e.target.closest('.timeline-event');
        if (!event || !events.includes(event)) return;

        const currentIndex = events.indexOf(event);
        let targetIndex = null;

        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowRight':
                targetIndex = Math.min(currentIndex + 1, events.length - 1);
                break;
            case 'ArrowUp':
            case 'ArrowLeft':
                targetIndex = Math.max(currentIndex - 1, 0);
                break;
            case 'Home':
                targetIndex = 0;
                break;
            case 'End':
                targetIndex = events.length - 1;
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                expandEvent(event);
                return;
        }

        if (targetIndex !== null && targetIndex !== currentIndex) {
            e.preventDefault();
            const targetEvent = events[targetIndex];
            targetEvent.focus();
        }
    }

    // Set up ARIA attributes
    container.setAttribute('role', 'list');
    container.setAttribute('aria-label', container.dataset.timelineLabel || 'Interactive timeline');

    events.forEach((event, index) => {
        event.setAttribute('role', 'listitem');
        event.setAttribute('tabindex', index === 0 ? '0' : '-1');
        event.setAttribute('aria-expanded', 'false');

        // Ensure event has an ID for accessibility
        if (!event.id && event.dataset.eventId) {
            event.id = `timeline-event-${event.dataset.eventId}`;
        }
    });

    // Add event listeners
    container.addEventListener('click', handleClick);
    container.addEventListener('keydown', handleKeydown);

    // Initial progress update
    updateProgress();

    // Return API
    return {
        /**
         * Expands a specific event by ID or index.
         */
        expandEvent(eventIdOrIndex) {
            const event = typeof eventIdOrIndex === 'number'
                ? events[eventIdOrIndex]
                : events.find(ev => ev.dataset.eventId === eventIdOrIndex);
            if (event) expandEvent(event);
        },

        /**
         * Gets the current progress.
         */
        getProgress() {
            return {
                viewed: viewedEvents.size,
                total: events.length,
                percentage: Math.round((viewedEvents.size / events.length) * 100),
                viewedIds: Array.from(viewedEvents)
            };
        },

        /**
         * Cleans up event listeners.
         */
        destroy() {
            container.removeEventListener('click', handleClick);
            container.removeEventListener('keydown', handleKeydown);
        }
    };
}
