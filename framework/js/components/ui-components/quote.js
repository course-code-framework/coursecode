/**
 * Quote/Testimonial Layout Pattern
 * 
 * CSS-only component for customer quotes, testimonials, citations.
 */

export const schema = {
    type: 'quote',
    description: 'Quote/testimonial display with attribution',
    example: `<div data-component="quote">
  <p class="quote-text">"This framework has transformed how we create training content. It's intuitive, powerful, and makes our courses look professional."</p>
  <div class="quote-attribution"><span class="quote-author">Jane Smith</span><span class="quote-role">Director of Training</span></div>
</div>`,
    properties: {
        variant: {
            type: 'string',
            enum: ['default', 'card', 'accent', 'featured', 'dark'],
            default: 'default',
            description: 'Visual style variant (add as class, e.g., quote-card)'
        }
    },
    structure: {
        container: '[data-component="quote"]',
        children: {
            text: { selector: '.quote-text', required: true },
            attribution: { selector: '.quote-attribution' },
            avatar: { selector: '.quote-avatar' },
            author: { selector: '.quote-author' },
            role: { selector: '.quote-role' }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssOnly: true,
    cssFile: 'components/quote.css'
};

/** No-op initializer — CSS-only component, registered for consistency. */
export function init() {}
