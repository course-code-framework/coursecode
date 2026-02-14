/**
 * stub-player/header-bar.js - Header bar component
 * 
 * Generates the header bar HTML with all control buttons.
 */

const HEADER_ICON_PATHS = {
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    edit: '<path d="M13 21h8"/><path d="m15 5 4 4"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    review: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    debug: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
    guide: '<path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/>',
    config: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
    interactions: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    catalog: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
    slideId: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    skipGating: '<circle cx="15" cy="12" r="3"/><rect width="20" height="14" x="2" y="5" rx="7"/>',
    reset: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'
};

function renderHeaderIcon(name, className = 'header-icon') {
    const path = HEADER_ICON_PATHS[name];
    if (!path) return '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}" aria-hidden="true">${path}</svg>`;
}

function renderCourseCodeLogo(className = 'header-logo') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 18 100 64" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" class="${className}" aria-hidden="true"><polyline points="25,22 5,50 25,78"/><polyline points="75,22 95,50 75,78"/><path d="M50,28 C40,28 33,36 33,45 C33,52 38,56 42,60 L42,65 L58,65 L58,60 C62,56 67,52 67,45 C67,36 60,28 50,28" stroke-width="4"/><line x1="44" y1="70" x2="56" y2="70" stroke-width="4"/><line x1="46" y1="75" x2="54" y2="75" stroke-width="4"/></svg>`;
}

const SHOW_SLIDE_ID_STORAGE_KEY = 'coursecode-showSlideId';
const SKIP_GATING_STORAGE_KEY = 'coursecode-skipGating';

/**
 * Generate header bar HTML
 * @param {Object} options
 * @param {boolean} options.isLive - Whether this is live mode
 * @param {boolean} options.hasContent - Whether content viewer should be shown
 */
export function generateHeaderBar({ isLive, hasContent }) {
    return `
    <div id="stub-player-header">
        <div class="header-content">
            <span class="label">
                ${renderCourseCodeLogo('header-logo')}
                CourseCode
            </span>
            ${isLive ? '<span id="stub-player-slide-id" class="slide-id-badge" title="Current slide ID"></span>' : ''}
            <div class="spacer"></div>
            ${isLive ? `<button id="stub-player-edit-mode-btn" class="visible" title="Edit text in course">${renderHeaderIcon('edit')} <span class="btn-label">Edit</span></button>` : ''}
            ${hasContent ? `<button id="stub-player-content-btn" title="Review content">${renderHeaderIcon('review')} <span class="btn-label">Review</span></button>` : ''}
            ${isLive ? `<button id="stub-player-debug-btn" title="Debug panel">${renderHeaderIcon('debug')} <span class="btn-label">Debug</span><span id="stub-player-header-error-badge-inline"></span></button>` : ''}
            <div class="more-menu-wrap">
                <button id="stub-player-more-btn" title="More tools">${renderHeaderIcon('more')} <span class="btn-label">More</span></button>
                <div id="stub-player-more-menu" class="more-menu">
                    ${isLive ? `<button id="stub-player-status-btn" class="menu-item" title="Workflow guide">${renderHeaderIcon('guide', 'header-icon menu-icon')} Guide</button>` : ''}
                    ${isLive ? `<button id="stub-player-config-btn" class="menu-item" title="Course config">${renderHeaderIcon('config', 'header-icon menu-icon')} Config</button>` : ''}
                    ${isLive ? `<button id="stub-player-interactions-btn" class="menu-item" title="Interactions">${renderHeaderIcon('interactions', 'header-icon menu-icon')} Interactions</button>` : ''}
                    ${isLive ? `<button id="stub-player-catalog-btn" class="menu-item" title="Component catalog">${renderHeaderIcon('catalog', 'header-icon menu-icon')} UI Catalog</button>` : ''}
                    ${isLive ? `<div class="menu-divider"></div>
                    <div class="menu-toggle-row" title="Show or hide current slide ID in header">
                        <span class="menu-toggle-label-wrap">${renderHeaderIcon('slideId', 'header-icon menu-icon')} <span id="stub-player-show-slide-id-label">Show Slide ID: On</span></span>
                        <input type="checkbox" id="stub-player-show-slide-id" class="menu-toggle-input" checked aria-label="Show Slide ID">
                        <button id="stub-player-show-slide-id-toggle" class="config-toggle on" type="button" role="switch" aria-checked="true" aria-label="Show Slide ID"></button>
                    </div>` : ''}
                    <div class="menu-toggle-row" title="Skip navigation gating">
                        <span class="menu-toggle-label-wrap">${renderHeaderIcon('skipGating', 'header-icon menu-icon')} <span id="stub-player-skip-gating-label">Skip Gating: On</span></span>
                        <input type="checkbox" id="stub-player-skip-gating" class="menu-toggle-input" checked aria-label="Skip Gating">
                        <button id="stub-player-skip-gating-toggle" class="config-toggle on" type="button" role="switch" aria-checked="true" aria-label="Skip Gating"></button>
                    </div>
                    <button id="stub-player-reset-btn" class="menu-item danger-item" title="Reset progress">${renderHeaderIcon('reset', 'header-icon menu-icon')} Reset Progress</button>
                </div>
            </div>
        </div>
        <button class="toggle-btn" id="stub-player-header-toggle" title="Minimize preview" aria-label="Minimize preview">${renderHeaderIcon('minimize')}</button>
    </div>
    <div id="stub-player-confirm-dialog" class="confirm-dialog">
        <div class="confirm-content">
            <h3 id="stub-player-confirm-title">Confirm</h3>
            <p id="stub-player-confirm-message"></p>
            <div class="confirm-actions">
                <button id="stub-player-confirm-cancel">Cancel</button>
                <button id="stub-player-confirm-ok" class="btn-primary">OK</button>
            </div>
        </div>
    </div>
    `;
}

/**
 * Initialize Header Bar Handlers
 * @param {Object} callbacks
 * @param {Function} callbacks.onToggle - (isCollapsed) => void
 * @param {Function} callbacks.onDebug - () => void
 * @param {Function} callbacks.onConfig - () => void
 * @param {Function} callbacks.onContent - () => void
 * @param {Function} callbacks.onInteract - () => void
 * @param {Function} callbacks.onEdit - () => void
 * @param {Function} callbacks.onReset - () => void
 * @param {Function} callbacks.onSkipGating - (enabled) => void
 * @param {Function} callbacks.onStatus - () => void
 */
export function createHeaderBarHandlers(callbacks) {
    const { onToggle, onDebug, onConfig, onContent, onInteract, onCatalog, onEdit, onReset, onSkipGating, onStatus } = callbacks;
    const closeMoreMenu = () => {
        document.getElementById('stub-player-more-menu')?.classList.remove('visible');
    };
    const updateSlideIdVisibility = (isVisible) => {
        const header = document.getElementById('stub-player-header');
        if (!header) return;
        header.classList.toggle('hide-slide-id', !isVisible);
    };

    // Header Toggle
    const toggleBtn = document.getElementById('stub-player-header-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const header = document.getElementById('stub-player-header');
            const iframe = document.getElementById('stub-player-course-frame');
            const moreMenu = document.getElementById('stub-player-more-menu');

            header.classList.toggle('collapsed');
            const isCollapsed = header.classList.contains('collapsed');
            if (iframe) iframe.classList.toggle('header-collapsed', isCollapsed);
            if (moreMenu) moreMenu.classList.remove('visible');
            toggleBtn.innerHTML = isCollapsed
                ? `${renderHeaderIcon('maximize')}`
                : `${renderHeaderIcon('minimize')}`;
            toggleBtn.title = isCollapsed ? 'Restore preview' : 'Minimize preview';
            toggleBtn.setAttribute('aria-label', isCollapsed ? 'Restore preview' : 'Minimize preview');

            if (onToggle) onToggle(isCollapsed);
        });
    }

    // More Menu
    const moreBtn = document.getElementById('stub-player-more-btn');
    const moreMenu = document.getElementById('stub-player-more-menu');
    if (moreBtn && moreMenu) {
        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moreMenu.classList.toggle('visible');
        });

        document.addEventListener('click', (e) => {
            if (!moreMenu.contains(e.target) && !moreBtn.contains(e.target)) {
                moreMenu.classList.remove('visible');
            }
        });
    }

    // Show Slide ID
    const showSlideIdCheckbox = document.getElementById('stub-player-show-slide-id');
    const showSlideIdToggle = document.getElementById('stub-player-show-slide-id-toggle');
    const showSlideIdLabel = document.getElementById('stub-player-show-slide-id-label');
    if (showSlideIdCheckbox) {
        const persisted = (() => {
            try {
                const stored = localStorage.getItem(SHOW_SLIDE_ID_STORAGE_KEY);
                return stored !== 'false';
            } catch {
                return true;
            }
        })();
        showSlideIdCheckbox.checked = persisted;

        const syncSlideIdUi = () => {
            if (showSlideIdToggle) {
                showSlideIdToggle.classList.toggle('on', showSlideIdCheckbox.checked);
                showSlideIdToggle.setAttribute('aria-checked', showSlideIdCheckbox.checked ? 'true' : 'false');
            }
            if (showSlideIdLabel) {
                showSlideIdLabel.textContent = `Show Slide ID: ${showSlideIdCheckbox.checked ? 'On' : 'Off'}`;
            }
            updateSlideIdVisibility(showSlideIdCheckbox.checked);
        };

        syncSlideIdUi();

        if (showSlideIdToggle) {
            const toggleShowSlideId = () => {
                showSlideIdCheckbox.checked = !showSlideIdCheckbox.checked;
                showSlideIdCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            };
            showSlideIdToggle.addEventListener('click', toggleShowSlideId);
            showSlideIdToggle.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleShowSlideId();
                }
            });
        }

        showSlideIdCheckbox.addEventListener('change', () => {
            try {
                localStorage.setItem(SHOW_SLIDE_ID_STORAGE_KEY, showSlideIdCheckbox.checked ? 'true' : 'false');
            } catch {
                // ignore storage failures
            }
            syncSlideIdUi();
        });
    }

    // Skip Gating (persisted in localStorage)
    const skipGatingCheckbox = document.getElementById('stub-player-skip-gating');
    const skipGatingToggle = document.getElementById('stub-player-skip-gating-toggle');
    const skipGatingLabel = document.getElementById('stub-player-skip-gating-label');
    if (skipGatingCheckbox) {
        // Restore persisted state (defaults to true / skip on)
        const persistedSkip = (() => {
            try {
                const stored = localStorage.getItem(SKIP_GATING_STORAGE_KEY);
                return stored !== 'false';
            } catch {
                return true;
            }
        })();
        skipGatingCheckbox.checked = persistedSkip;

        const syncSkipToggleUi = () => {
            if (!skipGatingToggle) return;
            skipGatingToggle.classList.toggle('on', skipGatingCheckbox.checked);
            skipGatingToggle.setAttribute('aria-checked', skipGatingCheckbox.checked ? 'true' : 'false');
            if (skipGatingLabel) {
                skipGatingLabel.textContent = `Skip Gating: ${skipGatingCheckbox.checked ? 'On' : 'Off'}`;
            }
        };

        syncSkipToggleUi();

        if (skipGatingToggle) {
            const toggleSkip = () => {
                skipGatingCheckbox.checked = !skipGatingCheckbox.checked;
                skipGatingCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            };
            skipGatingToggle.addEventListener('click', toggleSkip);
            skipGatingToggle.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleSkip();
                }
            });
        }

        skipGatingCheckbox.addEventListener('change', (e) => {
            if (!e.target.checked) {
                // Unchecking = enabling gating, show confirmation
                showConfirmDialog({
                    title: 'Enable Gating?',
                    message: 'This will reset course progress and enforce navigation locks.',
                    confirmLabel: 'Confirm',
                    confirmClass: 'btn-primary',
                    onConfirm: () => {
                        try { localStorage.setItem(SKIP_GATING_STORAGE_KEY, 'false'); } catch {}
                        if (onSkipGating) onSkipGating(false);
                        syncSkipToggleUi();
                    },
                    onCancel: () => {
                        e.target.checked = true; // Revert
                        syncSkipToggleUi();
                    }
                });
            } else {
                // Checking = skip gating
                try { localStorage.setItem(SKIP_GATING_STORAGE_KEY, 'true'); } catch {}
                if (onSkipGating) onSkipGating(true);
                syncSkipToggleUi();
            }
        });
    }

    // Reset Button
    const resetBtn = document.getElementById('stub-player-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            closeMoreMenu();
            showConfirmDialog({
                title: 'Reset Progress?',
                message: 'This will clear all course progress. This cannot be undone.',
                confirmLabel: 'Reset',
                confirmClass: 'btn-danger',
                onConfirm: () => {
                    if (onReset) onReset();
                }
            });
        });
    }

    // Panel Buttons
    if (onDebug) document.getElementById('stub-player-debug-btn')?.addEventListener('click', onDebug);
    if (onConfig) document.getElementById('stub-player-config-btn')?.addEventListener('click', () => { closeMoreMenu(); onConfig(); });
    if (onContent) document.getElementById('stub-player-content-btn')?.addEventListener('click', onContent);
    if (onInteract) document.getElementById('stub-player-interactions-btn')?.addEventListener('click', () => { closeMoreMenu(); onInteract(); });
    if (onCatalog) document.getElementById('stub-player-catalog-btn')?.addEventListener('click', () => { closeMoreMenu(); onCatalog(); });
    if (onEdit) document.getElementById('stub-player-edit-mode-btn')?.addEventListener('click', onEdit);
    if (onStatus) document.getElementById('stub-player-status-btn')?.addEventListener('click', () => { closeMoreMenu(); onStatus(); });

    // Setup Confirm Dialog Handlers
    setupConfirmDialog();
}

// Dialog Logic
let pendingConfirmCallback = null;
let pendingCancelCallback = null;

function setupConfirmDialog() {
    const okBtn = document.getElementById('stub-player-confirm-ok');
    const cancelBtn = document.getElementById('stub-player-confirm-cancel');
    const dialog = document.getElementById('stub-player-confirm-dialog');

    if (okBtn) {
        okBtn.addEventListener('click', () => {
            dialog.classList.remove('visible');
            if (pendingConfirmCallback) {
                pendingConfirmCallback();
                pendingConfirmCallback = null;
                pendingCancelCallback = null;
            }
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            dialog.classList.remove('visible');
            if (pendingCancelCallback) {
                pendingCancelCallback();
            }
            pendingConfirmCallback = null;
            pendingCancelCallback = null;
        });
    }
}

export function showConfirmDialog({ title, message, confirmLabel = 'Confirm', confirmClass = 'btn-primary', onConfirm, onCancel }) {
    document.getElementById('stub-player-confirm-title').textContent = title;
    document.getElementById('stub-player-confirm-message').textContent = message;
    const confirmBtn = document.getElementById('stub-player-confirm-ok');
    confirmBtn.textContent = confirmLabel;
    confirmBtn.className = confirmClass;
    pendingConfirmCallback = onConfirm;
    pendingCancelCallback = onCancel;
    document.getElementById('stub-player-confirm-dialog').classList.add('visible');
}

export function updateSlideId(id) {
    const badge = document.getElementById('stub-player-slide-id');
    if (badge) {
        badge.textContent = id;
        badge.title = 'Current slide: ' + id;
    }
}
