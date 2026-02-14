/**
 * Features Layout Pattern
 * 
 * CSS-only component for highlighting 3-4 key features with icons.
 */

export const schema = {
    type: 'features',
    description: 'Feature showcase with icons and centered layout',
    example: `<div data-component="features">
  <div class="feature-item"><div class="feature-icon">🚀</div><h3>Fast</h3><p>Lightning-fast performance for all operations.</p></div>
  <div class="feature-item"><div class="feature-icon">🔒</div><h3>Secure</h3><p>Built with security best practices.</p></div>
  <div class="feature-item"><div class="feature-icon">🎨</div><h3>Flexible</h3><p>Customize everything to your needs.</p></div>
</div>`,
    properties: {},
    structure: {
        container: '[data-component="features"]',
        children: {
            item: { selector: '.feature-item', required: true, minItems: 1 },
            icon: { selector: '.feature-icon', parent: '.feature-item' },
            title: { selector: 'h3', parent: '.feature-item' }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssOnly: true,
    cssFile: 'components/features.css'
};

/** No-op initializer — CSS-only component, registered for consistency. */
export function init() {}
