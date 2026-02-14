/**
 * @file dropdown.js
 * @description Custom dropdown management with event delegation.
 * 
 * Usage example:
 *   <div id="role-dropdown">
 *     <button class="dropdown-trigger" data-action="toggle-dropdown">Choose role</button>
 *     <div class="dropdown-menu">
 *       <button class="dropdown-item" data-action="select-item">Engineer</button>
 *     </div>
 *   </div>
 *   UIComponents.initDropdown('role-dropdown', { onChange: (value) => console.log(value) });
 */

export const schema = {
    type: 'dropdown',
    description: 'Custom dropdown select with keyboard navigation',
    example: `<div data-component="dropdown" class="dropdown">
  <button class="dropdown-trigger" aria-haspopup="true" aria-expanded="false">Select an option</button>
  <ul class="dropdown-menu" role="menu">
    <li class="dropdown-item" role="menuitem" tabindex="-1">Introduction</li>
    <li class="dropdown-item" role="menuitem" tabindex="-1">Components</li>
    <li class="dropdown-item" role="menuitem" tabindex="-1">Interactions</li>
  </ul>
</div>`,
    properties: {
        onChange: { type: 'function', description: 'Callback when selection changes' }
    },
    structure: {
        container: '[data-component="dropdown"]',
        children: {
            trigger: { selector: '.dropdown-trigger', required: true },
            menu: { selector: '.dropdown-menu', required: true },
            item: { selector: '.dropdown-item', required: true, minItems: 1 }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/dropdown.css',
    engagementTracking: null,
    emitsEvents: ['dropdown:change']
};

import { validateDropdownActions } from '../../validation/html-validators.js';
import { logger } from '../../utilities/logger.js';

const dropdowns = new Map();

// Global click handler for closing dropdowns (attached once when first dropdown is initialized)
let globalHandlerAttached = false;

function ensureGlobalHandler() {
    if (globalHandlerAttached) return;

    document.addEventListener('click', (event) => {
        // If the click is on a dropdown trigger, let the component handle it
        if (event.target.closest('.dropdown-trigger')) {
            return;
        }

        // Close any dropdown that is open and was not the target of the click
        for (const [id, dropdown] of dropdowns.entries()) {
            if (dropdown.menu.classList.contains('active') && !dropdown.element.contains(event.target)) {
                closeDropdown(id);
            }
        }
    });

    globalHandlerAttached = true;
}

function resolveRoot(ref) {
    if (!ref) return null;
    if (ref instanceof Element) return ref;
    if (typeof ref === 'string') return document.querySelector(ref);
    return null;
}

export function init(root, options = {}) {
    ensureGlobalHandler();

    const dropdown = resolveRoot(root);
    if (!dropdown) {
        logger.fatal(`Dropdown with selector "${root}" not found`, { domain: 'ui', operation: 'initDropdown' });
        return;
    }

    const dropdownId = dropdown.id;
    if (!dropdownId) {
        logger.fatal('Dropdown container element must have an ID.', { domain: 'ui', operation: 'initDropdown' });
        return;
    }

    const trigger = dropdown.querySelector('.dropdown-trigger');
    const menu = dropdown.querySelector('.dropdown-menu');
    const items = dropdown.querySelectorAll('.dropdown-item');

    if (!trigger || !menu) {
        logger.fatal(`Dropdown "${dropdownId}" missing required elements (.dropdown-trigger or .dropdown-menu)`, { domain: 'ui', operation: 'initDropdown' });
        return;
    }

    // Validate that dropdown has required data-action attributes
    const validation = validateDropdownActions(dropdown);
    if (!validation.valid) {
        const errorMessages = validation.errors.map(e => `${e.message}: ${e.context.fix}`).join('; ');
        logger.fatal(`Dropdown "${dropdownId}" validation failed: ${errorMessages}`, { domain: 'ui', operation: 'initDropdown' });
        return;
    }

    const config = {
        onChange: options.onChange || null,
        ...options
    };

    dropdowns.set(dropdownId, { element: dropdown, trigger, menu, items, config });

    // Setup ARIA attributes
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    items.forEach((item) => {
        item.setAttribute('role', 'option');
        item.setAttribute('tabindex', '0');
    });

    // Delegated event listener for the entire dropdown
    dropdown.addEventListener('click', (event) => {
        const actionTarget = event.target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;

        if (action === 'toggle-dropdown') {
            // Close other open dropdowns first
            for (const [id] of dropdowns.entries()) {
                if (id !== dropdownId) closeDropdown(id);
            }
            toggleDropdown(dropdownId);
        } else if (action === 'select-item') {
            const itemIndex = Array.from(items).indexOf(actionTarget);
            if (itemIndex > -1) {
                selectDropdownItem(dropdownId, itemIndex);
            }
        }
    });

    // Keyboard navigation for the menu
    menu.addEventListener('keydown', (event) => handleDropdownKeyboard(dropdownId, event));

    return {
        destroy: () => {
            dropdowns.delete(dropdownId);
        }
    };
}

export function toggleDropdown(dropdownId) {
  const entry = dropdowns.get(dropdownId);
  if (!entry) return;

  const isOpen = entry.menu.classList.contains('active');
  if (isOpen) {
    closeDropdown(dropdownId);
  } else {
    openDropdown(dropdownId);
  }
}

export function openDropdown(dropdownId) {
  const entry = dropdowns.get(dropdownId);
  if (!entry) return;

  // Close any other open dropdowns
  for (const [id] of dropdowns.entries()) {
    if (id !== dropdownId) {
      closeDropdown(id);
    }
  }

  entry.menu.classList.add('active');
  entry.trigger.classList.add('active');
  entry.trigger.setAttribute('aria-expanded', 'true');
}

export function closeDropdown(dropdownId) {
  const entry = dropdowns.get(dropdownId);
  if (!entry) return;

  entry.menu.classList.remove('active');
  entry.trigger.classList.remove('active');
  entry.trigger.setAttribute('aria-expanded', 'false');
}

function selectDropdownItem(dropdownId, index) {
  const entry = dropdowns.get(dropdownId);
  if (!entry) return;

  const { items, trigger, config } = entry;
  const selected = items[index];

  items.forEach(item => item.classList.remove('selected'));
  selected.classList.add('selected');

  const triggerText = trigger.querySelector('.dropdown-text') || trigger;
  triggerText.textContent = selected.textContent;

  closeDropdown(dropdownId);
  trigger.focus(); // Return focus to the trigger

  if (config.onChange) {
    config.onChange(selected.dataset.value || selected.textContent, index);
  }

  // Dispatch a custom event for declarative usage
  const event = new CustomEvent('dropdown:change', {
    bubbles: true,
    detail: {
      value: selected.dataset.value || selected.textContent,
      index: index,
      text: selected.textContent
    }
  });
  entry.element.dispatchEvent(event);
}

function handleDropdownKeyboard(dropdownId, event) {
  const entry = dropdowns.get(dropdownId);
  if (!entry) return;

  const { items, trigger } = entry;
  const currentIndex = Array.from(items).indexOf(document.activeElement);

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      if (currentIndex < items.length - 1) {
        items[currentIndex + 1].focus();
      }
      break;
    case 'ArrowUp':
      event.preventDefault();
      if (currentIndex > 0) {
        items[currentIndex - 1].focus();
      }
      break;
    case 'Escape':
      event.preventDefault();
      closeDropdown(dropdownId);
      trigger.focus();
      break;
    case 'Enter':
    case ' ':
      event.preventDefault();
      if (currentIndex > -1) {
        selectDropdownItem(dropdownId, currentIndex);
      }
      break;
  }
}
