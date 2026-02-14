/**
 * Stats/Metrics Layout Pattern
 * 
 * CSS-only component for displaying important numbers/statistics.
 */

export const schema = {
    type: 'stats',
    description: 'Statistics/metrics display with large numbers',
    example: `<div data-component="stats">
  <div class="stat"><span class="stat-value">150+</span><span class="stat-label">Active Courses</span></div>
  <div class="stat"><span class="stat-value">98%</span><span class="stat-label">Completion Rate</span></div>
  <div class="stat"><span class="stat-value">4.9</span><span class="stat-label">Average Rating</span></div>
</div>`,
    properties: {},
    structure: {
        container: '[data-component="stats"]',
        children: {
            stat: { selector: '.stat', required: true, minItems: 1 },
            value: { selector: '.stat-value', parent: '.stat', required: true },
            label: { selector: '.stat-label', parent: '.stat' }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssOnly: true,
    cssFile: 'components/stats.css'
};

/** No-op initializer — CSS-only component, registered for consistency. */
export function init() {}
