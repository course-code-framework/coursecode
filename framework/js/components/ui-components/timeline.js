/**
 * Timeline Layout Pattern
 * 
 * CSS-only component - no JavaScript behavior, just schema for discovery and validation.
 * Vertical timeline with alternating content and connecting lines.
 */

export const schema = {
    type: 'timeline',
    description: 'Vertical timeline with alternating content cards',
    example: `<div data-component="timeline">
  <div class="timeline-item"><div class="timeline-marker"></div><div class="timeline-date">2024</div><div class="timeline-content"><h3>Project Launch</h3><p>Initial release with core features.</p></div></div>
  <div class="timeline-item"><div class="timeline-marker"></div><div class="timeline-date">2025</div><div class="timeline-content"><h3>Major Update</h3><p>Added interactive components and LMS support.</p></div></div>
  <div class="timeline-item"><div class="timeline-marker"></div><div class="timeline-date">2026</div><div class="timeline-content"><h3>AI Integration</h3><p>Automated course authoring with AI assistance.</p></div></div>
</div>`,
    properties: {
        style: {
            type: 'string',
            enum: ['default', 'icon', 'compact'],
            default: 'default',
            description: 'Visual style variant (data-timeline-style attribute)'
        }
    },
    structure: {
        container: '[data-component="timeline"]',
        children: {
            item: { selector: '.timeline-item', required: true, minItems: 1 },
            content: { selector: '.timeline-content', parent: '.timeline-item', required: true },
            marker: { selector: '.timeline-marker', parent: '.timeline-item' },
            date: { selector: '.timeline-date', parent: '.timeline-item' }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssOnly: true,
    cssFile: 'components/timeline.css'
};

/** No-op initializer — CSS-only component, registered for consistency. */
export function init() {}
