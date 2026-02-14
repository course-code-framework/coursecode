/**
 * Hero Layout Pattern
 * 
 * CSS-only component - no JavaScript behavior, just schema for discovery and validation.
 * Full-width impactful intro slides with background support and overlays.
 */

export const schema = {
    type: 'hero',
    description: 'Full-width hero section with background image support',
    example: `<div data-component="hero" class="hero-gradient">
  <div class="hero-content">
    <span class="hero-badge">New Course</span>
    <h2 class="hero-title">Welcome to the Course</h2>
    <p class="hero-subtitle">Learn everything you need to know.</p>
    <div class="hero-cta"><button class="btn btn-primary">Get Started</button></div>
  </div>
</div>`,
    properties: {
        bgImage: {
            type: 'string',
            description: 'Background image URL (data-bg-image attribute)'
        },
        variant: {
            type: 'string',
            enum: ['default', 'overlay', 'overlay-light', 'dark', 'gradient', 'split'],
            default: 'default',
            description: 'Visual style variant (add as class, e.g., hero-overlay)'
        }
    },
    structure: {
        container: '[data-component="hero"]',
        children: {
            content: { selector: '.hero-content' },
            title: { selector: '.hero-title, h1' },
            subtitle: { selector: '.hero-subtitle' },
            cta: { selector: '.hero-cta' }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssOnly: true,
    cssFile: 'components/hero.css'
};

/** No-op initializer — CSS-only component, registered for consistency. */
export function init() {}
