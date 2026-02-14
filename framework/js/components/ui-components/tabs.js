/**
 * @file tabs.js
 * @description Accessible tab interface with keyboard navigation and event delegation.
 * 
 * Usage example:
 *   <div class="tabs" id="feature-tabs">
 *     <button class="tab-button" data-action="select-tab" data-tab="overview" aria-controls="overview-panel">Overview</button>
 *     <div id="overview-panel" class="tab-content">...</div>
 *   </div>
 *   UIComponents.initTabs('#feature-tabs', { buttonSelector: '.tab-button', panelSelector: '.tab-content' });
 * 
 * For audio in tabs, use the standalone audio player component inside the tab panel:
 *   <div id="overview-panel" class="tab-content">
 *     <div data-component="audio-player" data-audio-id="overview-audio" 
 *          data-audio-src="audio/overview.mp3" data-audio-required="true"></div>
 *     <p>Panel content...</p>
 *   </div>
 */

import { announceToScreenReader } from './index.js';
import { validateTabActions } from '../../validation/html-validators.js';
import engagementManager from '../../engagement/engagement-manager.js';
import * as NavigationState from '../../navigation/NavigationState.js';
import { logger } from '../../utilities/logger.js';

// Schema for validation, linting, and AI-assisted authoring
export const schema = {
    type: 'tabs',
    description: 'Accessible tab interface with keyboard navigation',
    example: `<div data-component="tabs">
  <div class="tab-list" role="tablist">
    <button class="tab-button active" data-action="select-tab" data-tab="overview" role="tab">Overview</button>
    <button class="tab-button" data-action="select-tab" data-tab="details" role="tab">Details</button>
    <button class="tab-button" data-action="select-tab" data-tab="resources" role="tab">Resources</button>
  </div>
  <div id="overview" class="tab-content active" role="tabpanel"><p>This is the overview panel with introductory content.</p></div>
  <div id="details" class="tab-content" role="tabpanel" hidden><p>Detailed information goes here with supporting data.</p></div>
  <div id="resources" class="tab-content" role="tabpanel" hidden><p>Links, downloads, and additional resources.</p></div>
</div>`,
    properties: {
        buttonSelector: { type: 'string', default: '[role="tab"], .tab-button', description: 'Selector for tab buttons' },
        panelSelector: { type: 'string', default: '[role="tabpanel"], .tab-content', description: 'Selector for tab panels' },
        panelRoot: { type: 'string', description: 'Optional selector for panel container if different from tab container' },
        activeClass: { type: 'string', default: 'active', description: 'CSS class for active state' }
    },
    structure: {
        container: '[data-component="tabs"]',
        children: {
            button: { selector: '[data-action="select-tab"]', required: true, minItems: 1 },
            panel: { selector: '.tab-content, [role="tabpanel"]', required: true }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/tabs.css',
    engagementTracking: 'viewAllTabs',
    emitsEvents: ['tab:selected']
};

export function init(root, options = {}) {
    const container = resolveRoot(root);
    if (!container) {
        logger.fatal('UIComponents.initTabs: container not found', { domain: 'ui', operation: 'initTabs' });
        return;
    }

    // Read config from data attributes if no options are passed, allowing declarative setup
    const buttonSelector = options.buttonSelector || container.dataset.buttonSelector || '[role="tab"], .tab-button';
    const panelSelector = options.panelSelector || container.dataset.panelSelector || '[role="tabpanel"], .tab-content';
    const panelRoot = resolveRoot(options.panelRoot || container.dataset.panelRoot) || container;
    const activeClass = options.activeClass || container.dataset.activeClass || 'active';
    const onChange = typeof options.onChange === 'function' ? options.onChange : null;

    const buttons = Array.from(container.querySelectorAll(buttonSelector));
    const panels = Array.from(panelRoot.querySelectorAll(panelSelector));

    if (!buttons.length) {
        logger.fatal('UIComponents.initTabs: no tab buttons found', { domain: 'ui', operation: 'initTabs' });
        return;
    }

    // Get current slide ID for engagement tracking
    const currentSlideId = NavigationState.getCurrentSlideId();
    
    // ALWAYS register tabs (engagement manager checks if tracking needed)
    if (currentSlideId) {
        const tabIds = buttons.map(btn => 
            btn.getAttribute('aria-controls') || btn.dataset.tab
        ).filter(Boolean);
        engagementManager.registerTabs(currentSlideId, tabIds);
    }

    // Validate that buttons have required data-action attributes
    const validation = validateTabActions(container);
    if (!validation.valid) {
        const errorDetails = validation.errors.map((error, index) => 
            `  Tab button ${index + 1}: ${error.message}\n    Expected: ${error.context.expected}\n    Fix: ${error.context.fix}`
        ).join('\n');
        logger.fatal(`UIComponents.initTabs: Some tab buttons are missing data-action attributes.\n${errorDetails}`, { domain: 'ui', operation: 'initTabs' });
        return;
    }

    // Validate that all buttons have corresponding panels
    const missingPanels = [];
    buttons.forEach((btn, index) => {
        const targetId = btn.getAttribute('aria-controls') || btn.dataset.tab;
        if (!targetId) {
            missingPanels.push(`Button ${index + 1} is missing data-tab or aria-controls attribute.`);
        } else {
            // Use CSS.escape if available, otherwise simple fallback or assume safe ID
            const escapedId = CSS.escape ? CSS.escape(targetId) : targetId;
            const panel = panelRoot.querySelector(`#${escapedId}`);
            if (!panel) {
                missingPanels.push(`Panel not found for button ${index + 1} (target ID: #${targetId}).`);
            }
        }
    });

    if (missingPanels.length > 0) {
        logger.fatal(`UIComponents.initTabs: Invalid structure in #${container.id || 'tabs'}:\n${missingPanels.join('\n')}`, { domain: 'ui', operation: 'initTabs' });
        return;
    }

  function activateTab(button, announce = true, track = true) {
    if (!button) return;

    const targetPanelId = button.getAttribute('aria-controls') || button.dataset.tab || '';
    const escapedId = safeSelector(targetPanelId);
    const targetPanel = targetPanelId && escapedId ? panelRoot.querySelector(`#${escapedId}`) : null;

    buttons.forEach(btn => {
      btn.classList.remove(activeClass);
      btn.setAttribute('aria-selected', 'false');
      btn.setAttribute('tabindex', btn === button ? '0' : '-1');
    });

    panels.forEach(panel => {
      panel.classList.remove(activeClass);
      panel.setAttribute('hidden', 'hidden');
    });

    button.classList.add(activeClass);
    button.setAttribute('aria-selected', 'true');

    if (targetPanel) {
      targetPanel.classList.add(activeClass);
      targetPanel.removeAttribute('hidden');
    }

    // ALWAYS track tab view (engagement manager ignores if not tracking)
    const slideId = NavigationState.getCurrentSlideId();
    if (track && slideId && targetPanelId) {
        engagementManager.trackTabView(slideId, targetPanelId);
        engagementManager.saveActiveTab(slideId, targetPanelId);
    }

    if (announce) {
      announceToScreenReader(`Switched to ${button.textContent.trim()} tab`);
    }

    if (onChange) {
      onChange({
        tabId: targetPanelId,
        button,
        panel: targetPanel
      });
    }
  }

  function handleClick(event) {
    const button = event.target.closest('[data-action="select-tab"]');
    if (button && buttons.includes(button)) {
      event.preventDefault();
      activateTab(button);
    }
  }

  function handleKeydown(event) {
    const currentButton = event.target.closest('[data-action="select-tab"]');
    if (!currentButton || !buttons.includes(currentButton)) return;

    const currentIndex = buttons.indexOf(currentButton);
    if (currentIndex === -1) return;

    let targetIndex = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      targetIndex = (currentIndex + 1) % buttons.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      targetIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = buttons.length - 1;
    }

    if (targetIndex !== null) {
      event.preventDefault();
      const targetButton = buttons[targetIndex];
      targetButton.focus();
      activateTab(targetButton);
    }
  }

  container.addEventListener('click', handleClick);
  container.addEventListener('keydown', handleKeydown);

  // Restore saved tab selection, falling back to the authored default
  const savedTabId = currentSlideId ? engagementManager.getActiveTab(currentSlideId) : null;
  const savedButton = savedTabId
      ? buttons.find(btn => (btn.getAttribute('aria-controls') || btn.dataset.tab) === savedTabId)
      : null;
  const activeButton = savedButton || buttons.find(btn => btn.classList.contains(activeClass)) || buttons[0];
  buttons.forEach(btn => btn.setAttribute('tabindex', btn === activeButton ? '0' : '-1'));
  panels.forEach(panel => panel.setAttribute('hidden', 'hidden'));
  activateTab(activeButton, false, false); // Don't announce, don't track via activateTab

  // Track initially active tab for engagement progress (like accordion does for open panels).
  // Users who see the active tab content should get credit for viewing it.
  if (currentSlideId && activeButton) {
      const activeTabId = activeButton.getAttribute('aria-controls') || activeButton.dataset.tab;
      if (activeTabId) {
          engagementManager.trackTabView(currentSlideId, activeTabId);
      }
  }

  return {
    activate: (buttonOrId) => {
      const button = typeof buttonOrId === 'string'
        ? buttons.find(btn => btn.dataset.tab === buttonOrId || btn.getAttribute('aria-controls') === buttonOrId)
        : buttonOrId;
      activateTab(button);
    },
    destroy: () => {
      container.removeEventListener('click', handleClick);
      container.removeEventListener('keydown', handleKeydown);
    }
  };
}

function resolveRoot(ref) {
  if (!ref) return null;
  if (ref instanceof Element) return ref;
  if (typeof ref === 'string') return document.querySelector(ref);
  return null;
}

function safeSelector(value) {
  if (!value) return '';
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
