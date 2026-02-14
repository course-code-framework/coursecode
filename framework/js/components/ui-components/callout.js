/**
 * @file callout.js
 * @description Optional icon hydration for callout.
 *
 * Usage:
 * <aside class="callout callout--warning" data-component="callout" data-icon="auto">
 *   <h4 class="callout__title">Title</h4>
 *   <div class="callout__body"><p>Body text.</p></div>
 * </aside>
 */

import { iconManager } from '../../utilities/icons.js';

export const schema = {
    type: 'callout',
    description: 'Modern callout with optional automatic icon injection',
    example: `<aside class="callout callout--info" data-component="callout" data-icon="auto">
  <h4 class="callout__title">Helpful context</h4>
  <div class="callout__body"><p>Message text.</p></div>
</aside>`,
    properties: {
        icon: {
            type: 'string',
            required: false,
            description: 'Icon name or "auto" (maps from severity).'
        },
        iconSize: {
            type: 'string',
            required: false,
            description: 'Icon size token: xs|sm|md|lg|xl|2xl|3xl (default: sm).'
        },
        iconClass: {
            type: 'string',
            required: false,
            description: 'Optional extra icon class.'
        }
    },
    structure: {
        container: '[data-component="callout"]',
        children: {
            title: { selector: '.callout__title', required: true },
            body: { selector: '.callout__body', required: true },
            icon: { selector: '.callout__icon', required: false }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/callouts.css',
    engagementTracking: null,
    emitsEvents: []
};

const ICON_BY_SEVERITY = Object.freeze({
    neutral: 'info',
    info: 'info',
    success: 'check-circle',
    warning: 'alert-circle',
    danger: 'alert-octagon'
});

function getSeverity(element) {
    if (element.classList.contains('callout--danger')) return 'danger';
    if (element.classList.contains('callout--warning')) return 'warning';
    if (element.classList.contains('callout--success')) return 'success';
    if (element.classList.contains('callout--neutral')) return 'neutral';
    return 'info';
}

function resolveIconName(element, requested) {
    if (requested && requested !== 'auto') return requested;
    const severity = getSeverity(element);
    return ICON_BY_SEVERITY[severity] || 'info';
}

function findTopLevelIconSlot(element) {
    return Array.from(element.children).find((child) => child.classList?.contains('callout__icon')) || null;
}

function ensureIconSlot(element) {
    const existing = findTopLevelIconSlot(element);
    if (existing) {
        existing.setAttribute('aria-hidden', 'true');
        return existing;
    }

    const iconSlot = document.createElement('span');
    iconSlot.className = 'callout__icon';
    iconSlot.setAttribute('aria-hidden', 'true');

    const title = Array.from(element.children).find((child) => child.classList?.contains('callout__title'));
    if (title) {
        element.insertBefore(iconSlot, title);
    } else {
        element.prepend(iconSlot);
    }

    return iconSlot;
}

export function init(element) {
    if (!element?.classList?.contains('callout')) return;

    const requested = (element.dataset.icon || '').trim();
    const existingIconSlot = findTopLevelIconSlot(element);

    // Preserve manual icon markup unless explicit icon hydration is requested.
    if (!requested && existingIconSlot) return;

    // Keep no-icon callouts clean unless icon hydration is requested.
    if (!requested && !existingIconSlot) return;

    const iconName = resolveIconName(element, requested);
    const iconSize = (element.dataset.iconSize || 'sm').trim();
    const iconClass = (element.dataset.iconClass || '').trim();
    const iconSlot = ensureIconSlot(element);

    iconSlot.innerHTML = iconManager.getIcon(iconName, { size: iconSize, class: iconClass });
}

