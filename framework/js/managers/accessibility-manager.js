/**
 * @file accessibility-manager.js
 * @description Centralizes runtime accessibility preferences and persists them
 * via the StateManager. It is the single source of truth for accessibility state.
 */

import stateManager from '../state/index.js';
import { logger } from '../utilities/logger.js';
import { eventBus } from '../core/event-bus.js';
import { iconManager } from '../utilities/icons.js';
import { isUserReportingEnabled, submitUserReport } from '../utilities/error-reporter.js';
import * as Modal from '../components/ui-components/modal.js';
import * as NavigationState from '../navigation/NavigationState.js';

// Re-export getCurrentSlideId for internal use
const getCurrentSlideId = NavigationState.getCurrentSlideId;

const KNOWN_PREFERENCE_KEYS = new Set([
    'theme',
    'darkMode',
    'fontSize',
    'highContrast',
    'reducedMotion'
]);

const DEFAULT_PREFERENCES = Object.freeze({
    theme: 'light',
    darkMode: false,
    fontSize: 'normal',
    highContrast: false,
    reducedMotion: false,
});

class AccessibilityManager {
    constructor() {
        this.state = { ...DEFAULT_PREFERENCES };
        this.isInitialized = false;
        this.DOMAIN_KEY = 'accessibility';
        this.SOURCE = 'accessibility-manager';

        this.elements = {
            themeToggle: null,
            fontSizeToggle: null,
            highContrastToggle: null,
            reducedMotionToggle: null,
            accessibilityMenu: null,
            accessibilityButton: null,
            reportIssueButton: null,
            reportIssueDivider: null
        };
    }

    /**
     * Initializes the manager by loading state, binding DOM elements, and setting up event listeners.
     * @throws {Error} If already initialized or if initialization fails
     */
    initialize() {
        if (this.isInitialized) {
            throw new Error('AccessibilityManager: Already initialized. Do not call initialize() more than once.');
        }

        try {
            this._loadState();
            this._getDOMElements();
            this._updateUI();
            this._setupEventListeners();
            this._initializeAccessibilityMenu();

            this.isInitialized = true;
            logger.debug('AccessibilityManager Initialized', this.state);
            eventBus.emit('accessibility:initialized', this.state);
        } catch (error) {
            logger.error('[AccessibilityManager] Initialization failed:', error);
            throw error; // Re-throw to prevent silent failures
        }
    }

    /**
     * Updates a specific accessibility preference.
     * @param {string} key - The preference key to set.
     * @param {any} value - The new value for the preference.
     * @throws {Error} If key is not a known preference key
     */
    setPreference(key, value) {
        if (!KNOWN_PREFERENCE_KEYS.has(key)) {
            throw new Error(`AccessibilityManager: Unknown preference key: ${key}`);
        }

        const newState = { ...this.state };

        // Handle theme and darkMode interdependence
        if (key === 'theme') {
            newState.theme = value === 'dark' ? 'dark' : 'light';
            newState.darkMode = newState.theme === 'dark';
        } else if (key === 'darkMode') {
            newState.darkMode = !!value;
            newState.theme = newState.darkMode ? 'dark' : 'light';
        } else {
            newState[key] = value;
        }

        this.state = newState;
        this._updateUI();

        stateManager.setDomainState(this.DOMAIN_KEY, this.state, { source: this.SOURCE });
        eventBus.emit('accessibility:changed', { key, value: this.state[key] });
    }

    /**
     * Returns a copy of the current accessibility state.
     * @returns {object} The current state.
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Announce a message to screen readers.
     * @param {string} message - The message to announce.
     * @param {string} [priority='polite'] - The priority of the announcement ('polite' or 'assertive').
     */
    announce(message, priority = 'polite') {
        if (!message) return;

        let liveRegion = document.getElementById('sr-announcements');

        if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.id = 'sr-announcements';
            liveRegion.setAttribute('role', 'status');
            liveRegion.setAttribute('aria-atomic', 'true');
            liveRegion.className = 'sr-only';
            document.body.appendChild(liveRegion);
        }

        // Set priority and message
        liveRegion.setAttribute('aria-live', 'off'); // Turn off to prevent reading partial updates
        liveRegion.textContent = ''; // Clear previous message

        // Force a reflow to ensure the screen reader detects the change
        void liveRegion.offsetWidth;

        liveRegion.setAttribute('aria-live', priority);
        liveRegion.textContent = message;
    }

    /**
     * Sets up keyboard navigation for a container with focusable elements.
     * @param {HTMLElement} container - The container element.
     * @param {Array<HTMLElement>} focusableElements - An array of focusable elements.
     */
    setupKeyboardNav(container, focusableElements) {
        const focusable = Array.from(focusableElements);
        if (focusable.length === 0) return;

        let currentFocusIndex = 0;

        const updateFocusRing = () => {
            focusable.forEach((el, index) => {
                el.classList.toggle('keyboard-focus', index === currentFocusIndex);
            });
        };

        container.addEventListener('keydown', (e) => {
            let newIndex = currentFocusIndex;
            switch (e.key) {
                case 'ArrowRight':
                case 'ArrowDown':
                    e.preventDefault();
                    newIndex = (currentFocusIndex + 1) % focusable.length;
                    break;
                case 'ArrowLeft':
                case 'ArrowUp':
                    e.preventDefault();
                    newIndex = (currentFocusIndex - 1 + focusable.length) % focusable.length;
                    break;
                case 'Home':
                    e.preventDefault();
                    newIndex = 0;
                    break;
                case 'End':
                    e.preventDefault();
                    newIndex = focusable.length - 1;
                    break;
                default:
                    return;
            }
            currentFocusIndex = newIndex;
            focusable[currentFocusIndex].focus();
            updateFocusRing();
        });

        // Initialize focus
        focusable[0].focus();
        updateFocusRing();
    }

    // =================================================================
    // Private Methods
    // =================================================================

    _loadState() {
        const persistedState = stateManager.getDomainState(this.DOMAIN_KEY);
        if (persistedState && typeof persistedState === 'object') {
            this.state = { ...DEFAULT_PREFERENCES, ...persistedState };
        } else {
            this.state = { ...DEFAULT_PREFERENCES };
        }
    }

    _getDOMElements() {
        this.elements.themeToggle = document.getElementById('theme-toggle');
        this.elements.fontSizeToggle = document.getElementById('font-size-toggle');
        this.elements.highContrastToggle = document.getElementById('high-contrast-toggle');
        this.elements.reducedMotionToggle = document.getElementById('reduced-motion-toggle');
        this.elements.accessibilityMenu = document.getElementById('accessibility-menu');
        this.elements.accessibilityButton = document.getElementById('accessibility-button');
        this.elements.reportIssueButton = document.getElementById('report-issue-button');
        this.elements.reportIssueDivider = document.getElementById('report-issue-divider');

        // Set initial static icons
        if (this.elements.accessibilityButton) {
            const iconSpan = this.elements.accessibilityButton.querySelector('span');
            if (iconSpan) {
                // Always use gear icon - this is the settings menu, not the navigation sidebar
                iconSpan.innerHTML = iconManager.getIcon('settings', { size: 'lg' });
            }
        }
        if (this.elements.highContrastToggle) {
            const iconSpan = this.elements.highContrastToggle.querySelector('span');
            if (iconSpan) iconSpan.innerHTML = iconManager.getIcon('eye', { size: 'sm' });
        }
        if (this.elements.reducedMotionToggle) {
            const iconSpan = this.elements.reducedMotionToggle.querySelector('span');
            if (iconSpan) iconSpan.innerHTML = iconManager.getIcon('stop-circle', { size: 'sm' });
        }
        if (this.elements.themeToggle) {
            // Initial state for theme toggle
            const iconSpan = this.elements.themeToggle.querySelector('span');
            const iconName = this.state.theme === 'dark' ? 'sun' : 'moon';
            if (iconSpan) iconSpan.innerHTML = iconManager.getIcon(iconName, { size: 'sm' });
        }

        // Show report issue button if enabled
        if (this.elements.reportIssueButton && isUserReportingEnabled()) {
            this.elements.reportIssueButton.hidden = false;
            if (this.elements.reportIssueDivider) {
                this.elements.reportIssueDivider.hidden = false;
            }
            const iconSpan = this.elements.reportIssueButton.querySelector('span');
            if (iconSpan) iconSpan.innerHTML = iconManager.getIcon('alert-circle', { size: 'sm' });
        }

        // Set exit button icon
        const exitButton = document.getElementById('menu-exit-button');
        if (exitButton) {
            const iconSpan = exitButton.querySelector('span');
            if (iconSpan) iconSpan.innerHTML = iconManager.getIcon('log-out', { size: 'sm' });
        }
    }

    _setupEventListeners() {
        if (this.elements.themeToggle) {
            this.elements.themeToggle.addEventListener('click', () => {
                const newTheme = this.state.theme === 'light' ? 'dark' : 'light';
                this.setPreference('theme', newTheme);
                this.announce(`Switched to ${newTheme} mode`);
            });
        }
        if (this.elements.fontSizeToggle) {
            this.elements.fontSizeToggle.addEventListener('click', () => {
                const newSize = this.state.fontSize === 'normal' ? 'large' : 'normal';
                this.setPreference('fontSize', newSize);
                this.announce(`Font size set to ${newSize}`);
            });
        }
        if (this.elements.highContrastToggle) {
            this.elements.highContrastToggle.addEventListener('click', () => {
                const newValue = !this.state.highContrast;
                this.setPreference('highContrast', newValue);
                this.announce(`High contrast ${newValue ? 'enabled' : 'disabled'}`);
            });
        }
        if (this.elements.reducedMotionToggle) {
            this.elements.reducedMotionToggle.addEventListener('click', () => {
                const newValue = !this.state.reducedMotion;
                this.setPreference('reducedMotion', newValue);
                this.announce(`Animations ${newValue ? 'reduced' : 'enabled'}`);
            });
        }
        if (this.elements.reportIssueButton) {
            this.elements.reportIssueButton.addEventListener('click', () => {
                this._showReportIssueModal();
            });
        }

        // Sidebar settings buttons (duplicate controls for article layout sidebar)
        // These are dynamically added after navigation renders, so use event delegation
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            switch (action) {
                case 'toggle-theme':
                    const newTheme = this.state.theme === 'light' ? 'dark' : 'light';
                    this.setPreference('theme', newTheme);
                    this.announce(`Switched to ${newTheme} mode`);
                    break;
                case 'toggle-font-size':
                    const newSize = this.state.fontSize === 'normal' ? 'large' : 'normal';
                    this.setPreference('fontSize', newSize);
                    this.announce(`Font size set to ${newSize}`);
                    break;
                case 'toggle-contrast':
                    const newContrast = !this.state.highContrast;
                    this.setPreference('highContrast', newContrast);
                    this.announce(`High contrast ${newContrast ? 'enabled' : 'disabled'}`);
                    break;
            }
        });
    }

    _initializeAccessibilityMenu() {
        const { accessibilityButton, accessibilityMenu } = this.elements;
        if (!accessibilityButton || !accessibilityMenu) return;

        let menuOpen = false;

        const toggleMenu = (isOpen) => {
            menuOpen = isOpen;
            accessibilityMenu.hidden = !isOpen;
            accessibilityButton.setAttribute('aria-expanded', String(isOpen));

            if (isOpen) {
                this.announce('Accessibility menu opened');
                const firstButton = accessibilityMenu.querySelector('button');
                firstButton?.focus();
            } else {
                this.announce('Accessibility menu closed');
            }
        };

        accessibilityButton.addEventListener('click', () => toggleMenu(!menuOpen));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && menuOpen) {
                toggleMenu(false);
                accessibilityButton.focus();
            }
        });
        document.addEventListener('click', (e) => {
            if (menuOpen && !accessibilityMenu.contains(e.target) && !accessibilityButton.contains(e.target)) {
                toggleMenu(false);
            }
        });
    }

    _updateUI() {
        const root = document.documentElement;
        if (!root) return;

        root.setAttribute('data-theme', this.state.theme);
        root.setAttribute('data-font-size', this.state.fontSize);
        root.setAttribute('data-high-contrast', String(this.state.highContrast));
        root.setAttribute('data-reduced-motion', String(this.state.reducedMotion));

        this._updateButtonStates();
    }

    _updateButtonStates() {
        const { themeToggle, fontSizeToggle, highContrastToggle, reducedMotionToggle } = this.elements;

        if (themeToggle) {
            const icon = themeToggle.querySelector('span');
            if (icon) {
                const iconName = this.state.theme === 'dark' ? 'sun' : 'moon';
                icon.innerHTML = iconManager.getIcon(iconName, { size: 'sm' });
            }
            themeToggle.setAttribute('aria-label', this.state.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
            themeToggle.classList.toggle('active', this.state.theme === 'dark');
        }
        if (fontSizeToggle) {
            fontSizeToggle.setAttribute('aria-label', this.state.fontSize === 'large' ? 'Decrease font size' : 'Increase font size');
            fontSizeToggle.classList.toggle('active', this.state.fontSize === 'large');
        }
        if (highContrastToggle) {
            highContrastToggle.setAttribute('aria-label', this.state.highContrast ? 'Disable high contrast' : 'Enable high contrast');
            highContrastToggle.classList.toggle('active', this.state.highContrast);
        }
        if (reducedMotionToggle) {
            reducedMotionToggle.setAttribute('aria-label', this.state.reducedMotion ? 'Enable animations' : 'Reduce animations');
            reducedMotionToggle.classList.toggle('active', this.state.reducedMotion);
        }
    }

    /**
     * Show the report issue modal
     * @private
     */
    _showReportIssueModal() {
        const currentSlide = getCurrentSlideId();

        Modal.show({
            title: 'Report an Issue',
            body: `
                <form id="report-issue-form" class="report-issue-form">
                    <p class="text-sm text-muted mb-4">
                        Describe the issue you're experiencing. Your current location and browser information will be included automatically.
                    </p>
                    <div class="form-group">
                        <label for="report-issue-description" class="form-label">Description</label>
                        <textarea 
                            id="report-issue-description" 
                            class="form-control" 
                            rows="5" 
                            placeholder="Please describe what happened or what isn't working correctly..."
                            required
                            aria-describedby="report-issue-help"
                        ></textarea>
                        <small id="report-issue-help" class="form-text text-muted">
                            Be as specific as possible. What were you trying to do? What happened instead?
                        </small>
                    </div>
                    <div id="report-issue-status" class="report-issue-status" hidden></div>
                </form>
            `,
            footer: `
                <button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="report-issue-submit">
                    ${iconManager.getIcon('send', { size: 'sm' })}
                    <span>Submit Report</span>
                </button>
            `,
            config: { closeOnBackdrop: true, closeOnEscape: true },
            onOpen: () => {
                const _form = document.getElementById('report-issue-form');
                const submitBtn = document.getElementById('report-issue-submit');
                const textarea = document.getElementById('report-issue-description');
                const statusDiv = document.getElementById('report-issue-status');

                // Focus the textarea
                textarea?.focus();

                // Handle submit
                submitBtn?.addEventListener('click', async () => {
                    const description = textarea?.value?.trim();

                    if (!description) {
                        statusDiv.textContent = 'Please enter a description of the issue.';
                        statusDiv.className = 'report-issue-status error';
                        statusDiv.hidden = false;
                        textarea?.focus();
                        return;
                    }

                    // Disable button and show loading
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = `
                        <span class="spinner spinner-sm"></span>
                        <span>Submitting...</span>
                    `;

                    const result = await submitUserReport(description, {
                        currentSlide: currentSlide
                    });

                    if (result.success) {
                        statusDiv.textContent = result.message;
                        statusDiv.className = 'report-issue-status success';
                        statusDiv.hidden = false;

                        // Close modal after a short delay
                        setTimeout(() => {
                            Modal.hide();
                        }, 2000);
                    } else {
                        statusDiv.textContent = result.message;
                        statusDiv.className = 'report-issue-status error';
                        statusDiv.hidden = false;

                        // Re-enable button
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = `
                            ${iconManager.getIcon('send', { size: 'sm' })}
                            <span>Submit Report</span>
                        `;
                    }
                });
            }
        });
    }
}

const instance = new AccessibilityManager();
export default instance;




