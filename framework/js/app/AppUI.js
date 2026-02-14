import * as Modal from '../components/ui-components/modal.js';

import { setup as initNotifications, showNotification as showNotificationComponent } from '../components/ui-components/notifications.js';
import { eventBus } from '../core/event-bus.js';
import { courseConfig } from '../../../course/course-config.js';
import { logger } from '../utilities/logger.js';
import * as AppState from './AppState.js';
import { createLikertQuestion } from '../components/interactions/likert.js';
import { iconManager } from '../utilities/icons.js';
import { shouldBypassGating } from '../navigation/navigation-helpers.js';

// The HTML for the completion modal's feedback section is complex, so it's defined here as a template.
const completionFeedbackTemplate = `
  <div class="completion-feedback-container">
    <div id="completion-rating-section" class="feedback-section" hidden>
      <div id="completion-rating-container"></div>
    </div>
    <div id="completion-comments-section" class="feedback-section" hidden>
      <label for="completion-comments-textarea">Leave a comment (optional):</label>
      <textarea id="completion-comments-textarea" class="feedback-textarea" rows="4" data-testid="completion-comments"></textarea>
    </div>
  </div>
`;

// Store the active rating interaction instance
let activeRatingInteraction = null;

const MODAL_DEFINITIONS = {
    exit: {
        title: 'Exit Course',
        body: `
            <p>Are you sure you want to exit the course?</p>
            <p><strong>Your progress will be saved automatically.</strong> You can resume exactly where you left off when you return.</p>
        `,
        footer: `
            <button class="btn btn-secondary" data-action="close-modal" data-testid="modal-exit-cancel">Cancel</button>
            <button class="btn btn-primary" data-action="confirm-exit" data-testid="modal-exit-confirm">Exit Course</button>
        `,
        config: {
            closeOnBackdrop: true,
            closeOnEscape: true,
        }
    },
    complete: {
        title: 'Course Complete!',
        body: `
            <p><strong>Congratulations!</strong> You have successfully completed this course.</p>
            <p>Your completion status and final score have been recorded in the Learning Management System.</p>
            <p>When you click "Complete & Exit" below, this window will close and you will be returned to the LMS.</p>
            ${completionFeedbackTemplate}
        `,
        footer: `
            <button class="btn btn-secondary" data-action="close-modal" data-testid="modal-complete-cancel">Cancel</button>
            <button class="btn btn-primary" data-action="confirm-complete" data-testid="modal-complete-confirm">Complete & Exit</button>
        `,
        config: {
            closeOnBackdrop: true,
            closeOnEscape: true,
        }
    },
    postExit: {
        title: 'Session Closed',
        body: `
            <p>Your progress has been saved in the LMS. It is now safe to close this window.</p>
            <p>If this window does not close automatically, please close it manually and return to the LMS.</p>
        `,
        footer: '',
        config: {
            closeOnBackdrop: false,
            closeOnEscape: false,
            hideCloseButton: true,
        }
    },
    restart: {
        title: 'Restart Course',
        body: `
            <p class="font-bold text-error">Are you sure you want to restart the entire course?</p>
            <p>This will permanently erase ALL of your progress, including assessment scores and engagement history. This action cannot be undone.</p>
        `,
        footer: `
            <button class="btn btn-secondary" data-action="close-modal" data-testid="modal-restart-cancel">Cancel</button>
            <button class="btn btn-primary" data-action="confirm-restart" data-testid="modal-restart-confirm">Restart Course</button>
        `,
        config: {
            closeOnBackdrop: true,
            closeOnEscape: true,
        }
    }
};

const appContainer = document.getElementById('app');
const loadingIndicator = document.getElementById('loading');
const footer = document.querySelector('.app-footer');
const exitButton = document.getElementById('exitBtn');
const prevButton = document.getElementById('prevBtn');
const nextButton = document.getElementById('nextBtn');



// Sidebar elements - cached after initialization
let sidebarToggle = null;
let sidebar = null;
let sidebarBackdrop = null;

// Footer display state - used to restore original display value
let originalFooterDisplay = null;

/**
 * Initializes the AppUI module. This should be called once the DOM is ready.
 * It prepares the modal and notification systems.
 */
export function initAppUI() {
    Modal.setup();

    initNotifications();

    logger.debug('AppUI initialized: Dynamic Modal and Notification systems are ready.');

    _initSidebarToggle();
    logger.debug('Sidebar toggle initialized.');

    _initBranding();
    logger.debug('Branding initialized.');

    // Initialize footer button icons
    _initFooterButtonIcons();

    // Tooltips auto-initialize via event delegation - no manual init needed

    // Listen for requests to prepare and show the completion modal
    eventBus.on('ui:prepareCompletionModal', ({ promptForComments: _promptForComments, promptForRating: _promptForRating }) => {
        // This event is now handled dynamically when the 'complete' modal is shown.
        // The content is already part of the modal definition. We just need to show/hide sections.
        // This logic will be triggered within the onOpen callback for the completion modal.
    });

    eventBus.on('ui:showModal', showModal);
    eventBus.on('ui:hideModal', hideModal);



    eventBus.on('ui:lockCourseForExit', _lockApplicationForExit);

    // Listen for course status changes to update exit button appearance
    eventBus.on('course:statusChanged', _handleCourseStatusChanged);

    // Global Error Listener for SCORM Connection Issues
    // This bridges the gap between low-level connection errors and user awareness.
    eventBus.on('scorm:error', (errorData) => {
        // Only notify for critical connection/save errors that affect data persistence
        // We filter out minor warnings or handled recoveries to avoid noise.
        const criticalOperations = ['Commit', 'SetValue', 'Initialize', 'Terminate'];

        if (criticalOperations.includes(errorData.operation)) {
            logger.error('[AppUI] Critical SCORM Error detected:', JSON.stringify(errorData, null, 2));

            // Format a user-friendly message
            let userMessage = 'Connection error: Your progress may not be saved.';

            if (errorData.operation === 'Commit' || errorData.operation === 'SetValue') {
                userMessage = 'Failed to save progress. Please check your internet connection.';
            } else if (errorData.operation === 'Initialize') {
                userMessage = 'Course failed to connect to the LMS. Progress will not be tracked.';
            }

            showNotificationComponent(userMessage, 'error', 5000);
        }
    });


}

/**
 * Hides the loading indicator after the course has finished initializing.
 */
export function hideLoadingIndicator() {
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
        AppState.setLoadingVisible(false);
    }
}

/**
 * Displays a modal by its key from the modal definitions.
 * @param {string} modalKey - The key of the modal in MODAL_DEFINITIONS (e.g., 'exit', 'complete').
 */
export function showModal(modalKey) {
    const definition = MODAL_DEFINITIONS[modalKey];
    if (!definition) {
        throw new Error(`[AppUI] Modal definition not found for key: ${modalKey}`);
    }

    // Special handling for completion modal to show/hide feedback sections
    if (modalKey === 'complete') {
        definition.onOpen = () => {
            const completionFeatures = courseConfig.completion || {};
            const ratingSection = document.getElementById('completion-rating-section');
            const commentsSection = document.getElementById('completion-comments-section');

            if (ratingSection && completionFeatures.promptForRating) {
                ratingSection.hidden = false;
                _initCompletionModal();
            }
            if (commentsSection && completionFeatures.promptForComments) {
                commentsSection.hidden = false;
            }
        };
    }

    AppState.setCurrentModal(modalKey);
    Modal.show(definition);
}

/**
 * Closes the currently active modal.
 */
export function hideModal() {
    AppState.clearCurrentModal();
    Modal.hide();
}

/**
 * Displays a notification message.
 * @param {string} message - The message to display.
 * @param {string} [type='info'] - The type of notification ('info', 'success', 'warning', 'error').
 * @param {number} [duration=5000] - How long the notification should be visible (in ms).
 */
export function showNotification(message, type = 'info', duration = 5000) {
    showNotificationComponent(message, type, duration);
}

/**
 * Displays a user-friendly error modal with support contact information.
 * This is designed for production use when users encounter errors that may affect their progress.
 * 
 * @param {object} options - Error modal configuration
 * @param {string} [options.title='Something Went Wrong'] - Modal title
 * @param {string} options.message - User-friendly error message
 * @param {string} [options.details] - Technical details (shown in collapsible section in dev mode)
 * @param {boolean} [options.showRefresh=true] - Whether to show refresh button
 * @param {boolean} [options.showClose=false] - Whether to show close button (allows dismissing)
 */
export function showErrorModal(options = {}) {
    const {
        title = 'Something Went Wrong',
        message = 'An unexpected error occurred.',
        details = null,
        showRefresh = true,
        showClose = false
    } = options;

    // Get support email from course config
    const supportEmail = courseConfig.support?.email || null;
    const supportPhone = courseConfig.support?.phone || null;

    // Build contact section
    let contactHtml = '';
    if (supportEmail || supportPhone) {
        const contactItems = [];
        if (supportEmail) {
            contactItems.push(`<a href="mailto:${supportEmail}">${supportEmail}</a>`);
        }
        if (supportPhone) {
            contactItems.push(`<a href="tel:${supportPhone}">${supportPhone}</a>`);
        }
        contactHtml = `
            <p class="mt-4"><strong>Need help?</strong> Contact support: ${contactItems.join(' or ')}</p>
        `;
    }

    // Build details section (collapsible, only in dev mode or if explicitly requested)
    let detailsHtml = '';
    if (details && import.meta.env.DEV) {
        detailsHtml = `
            <details class="mt-4">
                <summary class="cursor-pointer text-sm text-gray-600">Technical Details</summary>
                <pre class="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-40">${details}</pre>
            </details>
        `;
    }

    // Build footer buttons
    const footerButtons = [];
    if (showClose) {
        footerButtons.push('<button class="btn btn-secondary" data-action="close-modal" data-testid="modal-error-close">Close</button>');
    }
    if (showRefresh) {
        footerButtons.push('<button class="btn btn-primary" data-action="refresh-page" data-testid="modal-error-refresh">Refresh Page</button>');
    }

    // Show the modal directly (no need for a static definition)
    AppState.setCurrentModal('error');
    Modal.show({
        title,
        body: `
            <div class="callout callout-danger mb-4" role="alert">
                <p>${message}</p>
            </div>
            ${contactHtml}
            ${detailsHtml}
        `,
        footer: footerButtons.join('\n'),
        config: {
            closeOnBackdrop: showClose,
            closeOnEscape: showClose,
            hideCloseButton: !showClose,
        }
    });
}

/**
 * Retrieves the main application container element.
 * @returns {HTMLElement} The application container element.
 */
export function getAppContainer() {
    return appContainer;
}

/**
 * Retrieves completion modal data (rating and comments) entered by the user.
 * @returns {{rating: string|null, comment: string|null}} Object containing rating and comment values.
 */
export function getCompletionModalData() {
    let rating = null;

    if (activeRatingInteraction) {
        const response = activeRatingInteraction.getResponse();
        // Extract the value for the 'overall' question
        if (response && response['overall']) {
            rating = response['overall'];
        }
    }

    const commentTextarea = document.getElementById('completion-comments-textarea');
    const comment = (commentTextarea && commentTextarea.value.trim())
        ? commentTextarea.value
        : null;

    return { rating, comment };
}

/**
 * Initializes the sidebar toggle functionality.
 * @private
 */
function _initSidebarToggle() {
    sidebarToggle = document.getElementById('sidebar-toggle');
    sidebar = document.getElementById('sidebar');
    sidebarBackdrop = document.getElementById('sidebar-backdrop');

    if (!sidebarToggle || !sidebar) {
        throw new Error('Sidebar toggle elements not found.');
    }

    // Inject menu icon
    const toggleIcon = sidebarToggle.querySelector('.toggle-icon');
    if (toggleIcon) {
        toggleIcon.innerHTML = iconManager.getIcon('menu', { size: 'lg' });
    }

    sidebarToggle.addEventListener('click', toggleSidebar);
    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', closeSidebar);
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !sidebar.classList.contains('collapsed')) {
            closeSidebar();
        }
    });
}

/**
 * Initializes the interactive elements within the completion modal.
 * This needs to be called each time the completion modal is opened,
 * as its content is now dynamic.
 * @private
 */
function _initCompletionModal() {
    const container = document.getElementById('completion-rating-container');
    if (!container) return;

    // Clear previous content
    container.innerHTML = '';

    // Create the likert interaction
    activeRatingInteraction = createLikertQuestion({
        id: 'course-rating',
        prompt: 'How would you rate this course?',
        scale: [
            { value: '1', text: '1 Star' },
            { value: '2', text: '2 Stars' },
            { value: '3', text: '3 Stars' },
            { value: '4', text: '4 Stars' },
            { value: '5', text: '5 Stars' }
        ],
        questions: [
            { id: 'overall', text: 'Overall Rating' }
        ],
        // No correctAnswers means it's a survey (always correct)
        feedback: {
            correct: 'Thank you for your rating!'
        }
    });

    activeRatingInteraction.render(container);
}

export function toggleSidebar() {
    const isCollapsed = sidebar.classList.toggle('collapsed');
    AppState.setSidebarCollapsed(isCollapsed);
    sidebarToggle.setAttribute('aria-expanded', String(!isCollapsed));
    if (sidebarBackdrop) {
        sidebarBackdrop.classList.toggle('visible', !isCollapsed);
    }
}

export function closeSidebar() {
    sidebar.classList.add('collapsed');
    AppState.setSidebarCollapsed(true);
    sidebarToggle.setAttribute('aria-expanded', 'false');
    if (sidebarBackdrop) {
        sidebarBackdrop.classList.remove('visible');
    }
}

export function openSidebar() {
    sidebar.classList.remove('collapsed');
    sidebarToggle.setAttribute('aria-expanded', 'true');
    if (sidebarBackdrop) {
        sidebarBackdrop.classList.add('visible');
    }
}

export function showFooter() {
    if (!footer) return;
    if (originalFooterDisplay === undefined || originalFooterDisplay === null) {
        originalFooterDisplay = '';
    }
    footer.style.display = originalFooterDisplay;

    // Re-enable sidebar toggle when footer is shown
    if (sidebarToggle) {
        sidebarToggle.disabled = false;
        sidebarToggle.setAttribute('aria-disabled', 'false');
    }
}

export function hideFooter() {
    if (!footer) return;
    if (originalFooterDisplay === undefined || originalFooterDisplay === null) {
        originalFooterDisplay = footer.style.display || '';
    }
    footer.style.display = 'none';

    // Disable sidebar toggle and close sidebar when footer is hidden
    // This prevents navigation during assessment question/review views
    if (sidebarToggle) {
        sidebarToggle.disabled = true;
        sidebarToggle.setAttribute('aria-disabled', 'true');
    }
    closeSidebar();
}

async function _initBranding() {
    const brandContainer = document.getElementById('brand');
    if (!brandContainer) throw new Error('Brand container #brand not found.');

    const { branding = {} } = courseConfig;
    const { logo, logoAlt, courseTitle: brandTitle } = branding;
    const courseTitle = brandTitle || courseConfig.metadata?.title || 'Course';

    let brandHTML = '';

    // For SVG logos, inline them so they can inherit color via currentColor
    if (logo && logo.endsWith('.svg')) {
        try {
            const response = await fetch(logo);
            if (response.ok) {
                const svgText = await response.text();
                // Wrap in a container for styling
                brandHTML += `<span class="logo" role="img" aria-label="${logoAlt || branding.companyName || 'Logo'}">${svgText}</span>`;
            } else {
                // Fallback to img if fetch fails
                brandHTML += `<img src="${logo}" alt="${logoAlt || branding.companyName || 'Logo'}" class="logo" />`;
            }
        } catch {
            // Fallback to img if fetch fails
            brandHTML += `<img src="${logo}" alt="${logoAlt || branding.companyName || 'Logo'}" class="logo" />`;
        }
    } else if (logo) {
        brandHTML += `<img src="${logo}" alt="${logoAlt || branding.companyName || 'Logo'}" class="logo" />`;
    }

    if (courseTitle) {
        brandHTML += `<span class="brand-title">${courseTitle}</span>`;
    }
    brandContainer.innerHTML = brandHTML;
}

/**
 * Initializes icons for footer buttons using iconManager.
 * @private
 */
function _initFooterButtonIcons() {
    // Exit button icon - insert at the start of button
    if (exitButton) {
        exitButton.insertAdjacentHTML('afterbegin', iconManager.getIcon('log-out'));
    }
}




/**
 * Handles course status changes to update the exit button appearance.
 * When on the last slide with completion requirements met, shows "Complete Course" button.
 * @private
 * @param {object} data - Status change data
 * @param {string} data.completionStatus - Current completion status
 * @param {boolean} data.isOnLastSlide - Whether user is on the last slide
 */
function _handleCourseStatusChanged({ completionStatus, isOnLastSlide }) {
    // In dev mode with gating disabled, always show completion button on last slide
    const bypassGating = shouldBypassGating();
    const showCompletionButton = isOnLastSlide && (completionStatus === 'completed' || bypassGating);

    if (showCompletionButton) {
        _setExitButtonToCompletionMode();
    } else {
        _setExitButtonToNormalMode();
    }
}

/**
 * Animates the exit button content change with a fade transition.
 * @private
 * @param {Function} updateFn - Function that performs the actual DOM updates
 */
function _animateExitButtonChange(updateFn) {
    if (!exitButton) return;

    // Add transition style and fade out
    exitButton.style.transition = 'opacity 150ms ease-out, background-color 200ms ease, border-color 200ms ease';
    exitButton.style.opacity = '0';

    setTimeout(() => {
        // Perform the update while hidden
        updateFn();

        // Fade back in
        exitButton.style.opacity = '1';

        // Clean up inline transition after animation completes
        setTimeout(() => {
            exitButton.style.transition = '';
        }, 200);
    }, 150);
}

/**
 * Updates exit button to completion mode (green success style with trophy icon).
 * @private
 */
function _setExitButtonToCompletionMode() {
    if (!exitButton) return;

    // Skip animation if already in completion mode
    if (exitButton.classList.contains('btn-success')) return;

    _animateExitButtonChange(() => {
        exitButton.innerHTML = iconManager.getIcon('trophy') + 'Complete Course';
        exitButton.classList.remove('btn-secondary');
        exitButton.classList.add('btn-success');
        exitButton.setAttribute('data-tooltip', 'Complete and exit the course');
        exitButton.setAttribute('data-testid', 'nav-complete');
    });
}

/**
 * Reverts exit button to normal mode (secondary style with log-out icon).
 * @private
 */
function _setExitButtonToNormalMode() {
    if (!exitButton) return;

    // Skip animation if already in normal mode
    if (exitButton.classList.contains('btn-secondary')) return;

    _animateExitButtonChange(() => {
        exitButton.innerHTML = iconManager.getIcon('log-out') + 'Exit Course';
        exitButton.classList.remove('btn-success');
        exitButton.classList.add('btn-secondary');
        exitButton.setAttribute('data-tooltip', 'Save progress and exit');
        exitButton.setAttribute('data-testid', 'nav-exit');
    });
}

function _lockApplicationForExit() {
    AppState.setCourseExitLocked(true);
    AppState.setExitInProgress(true);

    if (exitButton) {
        exitButton.removeAttribute('data-action');
        exitButton.innerHTML = iconManager.getIcon('check-circle') + 'Course Complete';
        exitButton.disabled = true;
        exitButton.classList.remove('btn-secondary');
        exitButton.classList.add('btn-success');
    }
    if (prevButton) prevButton.disabled = true;
    if (nextButton) nextButton.disabled = true;
    if (sidebarToggle) sidebarToggle.disabled = true;

    closeSidebar();
    hideModal(); // Hide any active modal
    showModal('postExit'); // Show the final "safe to close" modal
}