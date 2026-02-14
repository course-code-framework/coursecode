/**
 * Steps Layout Pattern
 * 
 * CSS-only component - no JavaScript behavior, just schema for discovery and validation.
 * Displays numbered step-by-step processes with visual connecting elements.
 */

export const schema = {
    type: 'steps',
    description: 'Numbered step-by-step process display',
    example: `<div data-component="steps">
  <div class="step"><div class="step-number">1</div><div class="step-content"><h3>Plan</h3><p>Define objectives and outline your course structure.</p></div></div>
  <div class="step"><div class="step-number">2</div><div class="step-content"><h3>Build</h3><p>Create slides with content, components, and interactions.</p></div></div>
  <div class="step"><div class="step-number">3</div><div class="step-content"><h3>Deploy</h3><p>Export and upload to your LMS platform.</p></div></div>
</div>`,
    properties: {
        style: {
            type: 'string',
            enum: ['cards', 'connected', 'compact', 'connected-minimal'],
            default: 'cards',
            description: 'Visual style variant (data-style attribute)'
        }
    },
    structure: {
        container: '[data-component="steps"]',
        children: {
            step: { selector: '.step', required: true, minItems: 1 },
            stepNumber: { selector: '.step-number', parent: '.step', required: true },
            stepContent: { selector: '.step-content', parent: '.step', required: true }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssOnly: true,
    cssFile: 'components/steps.css'
};

/** No-op initializer — CSS-only component, registered for consistency. */
export function init() {}
