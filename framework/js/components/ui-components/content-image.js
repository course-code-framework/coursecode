/**
 * Content Image Layout Pattern
 * 
 * CSS-only component for text with diagram/screenshot side by side.
 */

export const schema = {
    type: 'content-image',
    description: 'Two-column layout with text and image',
    example: `<div data-component="content-image">
  <div>
    <h3>Visual Learning</h3>
    <p>Pair text with images for a clear, engaging layout. The image column adapts to the content automatically.</p>
  </div>
  <div>
    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='200' fill='%23e2e8f0'%3E%3Crect width='320' height='200' rx='8'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-family='system-ui' font-size='14'%3EImage Placeholder%3C/text%3E%3C/svg%3E" alt="Placeholder">
  </div>
</div>`,
    properties: {
        reverse: {
            type: 'boolean',
            default: false,
            description: 'Reverse column order (add .reverse class)'
        }
    },
    structure: {
        container: '[data-component="content-image"]',
        children: {
            image: { selector: 'img', required: true }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssOnly: true,
    cssFile: 'components/content-image.css'
};

/** No-op initializer — CSS-only component, registered for consistency. */
export function init() {}
