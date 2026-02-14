/**
 * @file conditional-display.js
 * @description Declarative component for conditionally showing/hiding content based on engagement, flags, and interactions.
 *
 * Usage examples:
 *
 * Simple engagement condition:
 *   <div data-component="conditional" data-condition="engagement.viewAllTabs">
 *     Content shown after all tabs viewed
 *   </div>
 *
 * Flag condition:
 *   <div data-component="conditional" data-condition="flag.intro-complete">
 *     Content shown when flag is set
 *   </div>
 *
 * Multiple conditions (AND):
 *   <div data-component="conditional"
 *        data-conditions="engagement.viewAllTabs,flag.step1-done"
 *        data-mode="all">
 *     Content shown when both conditions met
 *   </div>
 *
 * Inverse (hide when condition met):
 *   <div data-component="conditional"
 *        data-condition="engagement.viewAllTabs"
 *        data-show-when="false">
 *     "Please view all tabs above" message (hidden when tabs viewed)
 *   </div>
 *
 * Custom display mode:
 *   <div data-component="conditional"
 *        data-condition="flag.menu-open"
 *        data-display="flex">
 *     Flexbox container shown when flag set
 *   </div>
 */

export const schema = {
    type: 'conditional',
    description: 'Conditionally show/hide content based on engagement or flags',
    example: `<div style="display: flex; flex-direction: column; gap: 12px;">
  <div data-component="conditional" data-condition="engagement.viewAllTabs" style="padding: 12px; border: 1px dashed #94a3b8; border-radius: 6px; color: #64748b;">
    <p style="margin: 0; font-size: 0.875rem;">🔀 <strong>Conditional block</strong> — this content appears when <code>engagement.viewAllTabs</code> is met.</p>
  </div>
  <div data-component="conditional" data-condition="flag.intro-complete" data-show-when="false" style="padding: 12px; border: 1px dashed #f59e0b; border-radius: 6px; color: #92400e;">
    <p style="margin: 0; font-size: 0.875rem;">🙈 <strong>Inverse block</strong> — this content <em>hides</em> when <code>flag.intro-complete</code> is set.</p>
  </div>
</div>`,
    properties: {
        condition: { type: 'string', dataAttribute: 'data-condition' },
        conditions: { type: 'string', dataAttribute: 'data-conditions' },
        mode: { type: 'string', enum: ['all', 'any'], default: 'all', dataAttribute: 'data-mode' },
        showWhen: { type: 'boolean', default: true, dataAttribute: 'data-show-when' },
        display: { type: 'string', default: 'block', dataAttribute: 'data-display' }
    },
    structure: {
        container: '[data-component="conditional"]',
        children: {}
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: null,
    engagementTracking: null,
    emitsEvents: []
};

import { conditionalDisplay } from '../../utilities/conditional-display.js';
import { logger } from '../../utilities/logger.js';

/**
 * Initializes conditional display for an element.
 *
 * @param {HTMLElement|string} root - The element or selector
 * @param {object} options - Configuration options (optional, can use data attributes)
 * @returns {object} API with cleanup method
 */
export function init(root, options = {}) {
    const element = resolveRoot(root);
    if (!element) {
        logger.fatal('ConditionalDisplay: element not found', { domain: 'ui', operation: 'initConditionalDisplay' });
        return;
    }

    // Check if already initialized (prevent double initialization)
    if (element.dataset.conditionalInitialized === 'true') {
        throw new Error('[ConditionalDisplay] Element already initialized. Each element should only be initialized once.');
    }

    // Mark as initialized
    element.dataset.conditionalInitialized = 'true';

    // Read config from data attributes if no options are passed (declarative mode)
    const condition = options.condition || element.dataset.condition;
    const conditionsAttr = options.conditions || element.dataset.conditions;
    const mode = options.mode || element.dataset.mode || 'all';
    const showWhen = options.showWhen !== undefined
        ? options.showWhen
        : (element.dataset.showWhen !== 'false'); // Default true unless explicitly "false"
    const transition = options.transition !== undefined
        ? options.transition
        : (element.dataset.transition !== 'false'); // Default true
    const display = options.display || element.dataset.display || 'block';

    // Parse conditions
    let conditions;
    if (conditionsAttr) {
        // Multiple conditions from comma-separated string
        conditions = conditionsAttr.split(',').map(c => c.trim());
    } else if (condition) {
        // Single condition
        conditions = condition;
    } else {
        logger.fatal('ConditionalDisplay: No condition specified. Use data-condition or data-conditions attribute.', { domain: 'ui', operation: 'initConditionalDisplay' });
        return;
    }

    // Set up conditional display tracking
    const cleanup = conditionalDisplay.showWhen(element, conditions, {
        mode,
        showWhen,
        transition,
        display,
        initialCheck: true
    });

    // Return API with cleanup that also removes initialized flag
    return {
        destroy: () => {
            cleanup();
            delete element.dataset.conditionalInitialized;
        },
        element
    };
}

/**
 * Resolves a root element reference to an actual DOM element.
 *
 * @param {HTMLElement|string} ref - Element or selector string
 * @returns {HTMLElement|null} Resolved element or null
 */
function resolveRoot(ref) {
    if (!ref) return null;
    if (ref instanceof Element) return ref;
    if (typeof ref === 'string') return document.querySelector(ref);
    return null;
}
