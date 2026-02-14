/**
 * Checklist Layout Pattern
 * 
 * CSS-only component for task/requirement checklists.
 */

export const schema = {
    type: 'checklist',
    description: 'Checklist with items and completion states',
    example: `<div data-component="checklist">
  <div class="checklist-item completed"><span class="checklist-text">Review course outline</span></div>
  <div class="checklist-item completed"><span class="checklist-text">Create slide content</span></div>
  <div class="checklist-item"><span class="checklist-text">Add interactions and assessments</span></div>
</div>`,
    properties: {
        style: {
            type: 'string',
            enum: ['default', 'cards', 'minimal', 'numbered'],
            default: 'default',
            description: 'Visual style variant (data-checklist-style attribute)'
        }
    },
    structure: {
        container: '[data-component="checklist"]',
        children: {
            item: { selector: '.checklist-item', required: true, minItems: 1 },
            text: { selector: '.checklist-text', parent: '.checklist-item', required: true },
            status: { selector: '.checklist-status', parent: '.checklist-item' }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssOnly: true,
    cssFile: 'components/checklist.css'
};

/** No-op initializer — CSS-only component, registered for consistency. */
export function init() {}
