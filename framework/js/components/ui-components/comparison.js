/**
 * Comparison Layout Pattern
 * 
 * CSS-only component for side-by-side comparison of two options.
 */

export const schema = {
    type: 'comparison',
    description: 'Side-by-side comparison grid',
    example: `<div data-component="comparison">
  <div class="comparison-item"><h3>Advantages</h3><ul><li>Easy to use</li><li>Fast performance</li><li>Great documentation</li></ul></div>
  <div class="comparison-item"><h3>Limitations</h3><ul><li>Steeper learning curve</li><li>Limited integrations</li><li>Requires modern browser</li></ul></div>
</div>`,
    properties: {},
    structure: {
        container: '[data-component="comparison"]',
        children: {
            item: { selector: '.comparison-item', required: true, minItems: 2 }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssOnly: true,
    cssFile: 'components/comparison.css'
};

/** No-op initializer — CSS-only component, registered for consistency. */
export function init() {}
