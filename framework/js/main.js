// NOTE: Both SCORM 1.2 and SCORM 2004 drivers use pipwerks wrapper (dynamically imported)
// cmi5 uses @xapi/cmi5. No script loading needed here.

// Import core framework modules
import { eventBus } from './core/event-bus.js';

import * as CourseHelpers from './utilities/course-helpers.js';
import { createViewManager } from './utilities/view-manager.js';
import { courseConfig } from '../../course/course-config.js';
import { customIcons } from '../../course/icons.js';

// Import the central interaction type catalog (auto-discovers built-in + custom interactions)
import { getCreator, getRegisteredTypes } from './core/interaction-catalog.js';

// Import managers
import stateManager from './state/index.js';

import objectiveManager from './managers/objective-manager.js';
import interactionManager from './managers/interaction-manager.js';
import interactionRegistry from './managers/interaction-registry.js';
import * as AssessmentManager from './managers/assessment-manager.js';
import flagManager from './managers/flag-manager.js';
import accessibilityManager from './managers/accessibility-manager.js';
import engagementManager from './engagement/engagement-manager.js';

import commentManager from './managers/comment-manager.js';
import audioManager from './managers/audio-manager.js';
import videoManager from './managers/video-manager.js';
import * as NavigationActions from './navigation/NavigationActions.js';
import * as DocumentGallery from './navigation/document-gallery.js';
import * as AppState from './app/AppState.js';
import * as AppUI from './app/AppUI.js';
import * as AppActions from './app/AppActions.js';

// Interaction creators are auto-discovered via interaction-catalog.js
// No explicit imports needed - use getCreator('type') or window.CourseCode.createTypeQuestion

// Import UI components (programmatic APIs only - initialization handled by component-catalog)
import * as Modal from './components/ui-components/modal.js';
import * as AudioPlayer from './components/ui-components/audio-player.js';
import { announceToScreenReader } from './components/ui-components/index.js';
import { showNotification } from './components/ui-components/notifications.js';
import { updateProgress } from './components/ui-components/progress.js';

// Import utilities
import { ScrollTracker } from './utilities/scroll-tracker.js';
import { logger } from './utilities/logger.js';
import { iconManager } from './utilities/icons.js';
import { breakpointManager } from './utilities/breakpoint-manager.js';
import { initErrorReporter } from './utilities/error-reporter.js';
import { initDataReporter } from './utilities/data-reporter.js';
import { initCourseChannel } from './utilities/course-channel.js';
import { canvasSlide } from './utilities/canvas-slide.js';

// Expose framework modules globally IMMEDIATELY for bundled course slides
// This MUST happen before any slide code executes (which happens during glob import)
window.logger = logger;
window.CourseCode = {
    // Managers
    stateManager,
    objectiveManager,
    interactionManager,
    interactionRegistry,
    AssessmentManager,
    flagManager,
    accessibilityManager,
    commentManager,
    audioManager,
    videoManager,
    scoreManager: null, // Will be set during initialization if scoring is configured

    // Actions
    NavigationActions,
    AppActions,
    AppState,

    // Interaction creators (dynamically from catalog - includes built-in + custom)
    ...Object.fromEntries(
        getRegisteredTypes()
            .filter(type => type !== 'multiple-choice-single') // Skip alias
            .map(type => {
                const pascalName = type.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
                    .replace(/^[a-z]/, c => c.toUpperCase());
                return [`create${pascalName}Question`, getCreator(type)];
            })
    ),

    // UI components (programmatic APIs)
    Modal,
    announceToScreenReader,
    showNotification,
    updateProgress,

    // Utilities
    iconManager,
    breakpointManager,
    canvasSlide,

    // Core
    eventBus,
    courseConfig
};

// --- Conditional Automation Module Loading ---
// The automation API is ONLY loaded when explicitly enabled via course config.
// During production builds (vite build), Vite replaces import.meta.env.MODE with 'production'
// and tree-shaking removes this entire block if the condition is always false.
//
// Safety: When import.meta.env is undefined (non-Vite environments), we allow automation
// only if explicitly enabled in config. This supports SCORM desktop testing apps.
const buildMode = import.meta?.env?.MODE;
const isProductionBuild = buildMode === 'production';
const automationEnabled = courseConfig.environment?.automation?.enabled === true;

// Store automation initialization promise for coordination
let automationInitPromise = null;

// Only load automation if:
// 1. NOT a production build AND
// 2. Explicitly enabled in course config
if (!isProductionBuild && automationEnabled) {
    logger.debug('[Framework] Automation mode enabled (MODE:', buildMode || 'undefined', ')');

    // Dynamic import ensures the automation code is loaded on-demand
    // Store the promise so initializeCourseApplication can wait for it
    automationInitPromise = import('./automation/index.js').then(({ initializeAutomation }) => {
        initializeAutomation();
        logger.debug('[Framework] Automation initialization complete');
    }).catch(error => {
        logger.error('[Framework] Failed to load automation module:', error);
    });
}

// --- Global Form Submission Guard ---
// This listener prevents accidental form submissions, which cause a full page reload
// and lead to SCORM re-initialization errors (error 103). This is a critical
// safeguard for the single-page application architecture of the course.
window.addEventListener('submit', (event) => {
    // Prevent the default submission behavior that reloads the page.
    event.preventDefault();

    const form = event.target;
    const submitter = event.submitter;

    // Construct submitter context for developer debugging.
    let submitterInfo = 'N/A (Submission not triggered by a button)';
    if (submitter) {
        const type = submitter.getAttribute('type');
        const tag = submitter.tagName.toLowerCase();
        submitterInfo = `Tag: <${tag}>, Type: "${type || 'submit (default)'}", Text: "${submitter.textContent.trim()}"`;
    }

    // preventDefault() already blocks the dangerous action above.
    // logger.fatal throws in DEV for visibility, logs warning in PROD to avoid crashing.
    logger.fatal('Form submission blocked to prevent SCORM data corruption.', {
        domain: 'framework',
        operation: 'formSubmissionGuard',
        form: form.id || '(no id)',
        submitter: submitterInfo,
        fix: 'Ensure all <button> elements inside <form> have type="button". Use data-action pattern instead of form submissions.'
    });
});

// --- Global Anchor Tag Click Guard ---
// This listener prevents accidental navigation from <a> tags, which would also
// cause a page reload and corrupt the SCORM session.
window.addEventListener('click', (event) => {
    const anchor = event.target.closest('a');

    // If the click was not on an anchor tag, do nothing.
    if (!anchor) {
        return;
    }

    // Allow links designed to open in a new tab.
    if (anchor.target === '_blank') {
        return;
    }

    // Allow lightbox triggers - they handle their own click behavior
    if (anchor.dataset.component === 'lightbox') {
        return;
    }

    // Get the href to check its value.
    const href = anchor.getAttribute('href');

    // Allow hash-only anchors (in-page scrolling, e.g., #features)
    if (href && href.startsWith('#')) {
        return;
    }

    // Allow links inside lightbox containers (e.g., markdown content links)
    if (anchor.closest('.lightbox-markdown') || anchor.closest('.lightbox-content')) {
        // For external links, force open in new tab for safety
        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
            event.preventDefault();
            window.open(href, '_blank', 'noopener,noreferrer');
        }
        return;
    }

    // If the href is empty, '#' or a real URL, and it's not a new tab, it's a problem.
    // We prevent the default action to stop the navigation/reload.
    event.preventDefault();

    // preventDefault() already blocks the dangerous action above.
    // logger.fatal throws in DEV for visibility, logs warning in PROD to avoid crashing.
    logger.fatal('Anchor tag navigation blocked to prevent SCORM data corruption.', {
        domain: 'framework',
        operation: 'anchorClickGuard',
        href: href || '(not set)',
        text: anchor.textContent.trim(),
        fix: 'Use NavigationActions.goToSlide(slideId) for internal navigation, or <button type="button"> with data-action pattern.'
    });
});

function reportInitializationError(error) {
    // Store error in AppState if initialized (defensive - AppState might not be initialized yet)
    try {
        if (AppState.isInitialized()) {
            AppState.setInitializationError(error);
        }
    } catch (e) {
        // AppState not initialized, that's ok - initialization failed early
        if (import.meta.env.DEV) {
            logger.debug('AppState not initialized during error reporting:', e.message);
        }
    }

    // Check if this is a user-facing error (e.g., expired session)
    // These should be shown to the user but NOT reported to error tracking
    const isUserFacing = error.userFacing === true;

    // Report via unified logger (unless user-facing)
    if (!isUserFacing) {
        logger.error(error.message, { domain: 'initialization', operation: 'initializeCourseApplication', stack: error.stack });
    }

    // Determine error type for appropriate messaging
    const isSessionExpired = error.isSessionExpired === true;
    const errorTitle = isSessionExpired ? 'Session Expired' : 'Initialization Error';
    const errorMessage = isSessionExpired
        ? error.message  // Already user-friendly
        : `Failed to initialize course: ${error.message}`;
    const actionMessage = isSessionExpired
        ? 'Close this window and launch the course again from your learning portal.'
        : 'Please refresh the page.';

    // Try to use the error modal if AppUI is initialized
    // Otherwise fall back to inline HTML for early initialization errors
    try {
        if (AppUI.showErrorModal) {
            AppUI.showErrorModal({
                title: errorTitle,
                message: errorMessage,
                details: import.meta.env.DEV && !isSessionExpired ? error.stack : null,
                showRefresh: !isSessionExpired,  // Don't show refresh for expired sessions
                showClose: false
            });
            return;
        }
    } catch (_e) {
        // Modal system not available, fall back to inline HTML
    }

    // Fallback: Inline HTML for early errors before modal system is ready
    const supportEmail = courseConfig.support?.email;
    const supportHtml = !isSessionExpired && supportEmail
        ? `<p>If the problem persists, contact support at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>`
        : !isSessionExpired ? '<p>If the problem persists, contact support.</p>' : '';

    // Use info styling for session expired (expected behavior), error for real errors
    const calloutClass = isSessionExpired ? 'callout-info' : 'callout-danger';

    const content = document.getElementById('content');
    if (content) {
        content.innerHTML = `
          <div class="p-6 callout ${calloutClass}" role="alert" aria-live="assertive">
            <h2>${errorTitle}</h2>
            <p>${errorMessage}</p>
            <p>${actionMessage}</p>
            ${supportHtml}
          </div>
        `;
    }
}

/**
 * Attempt to resize the browser window to configured dimensions.
 * Only works for popup windows - browsers block resize for main windows.
 * Disabled when environment.autoResizeWindow is false.
 */
function resizeWindowToConfig() {
    const autoResize = courseConfig.environment?.autoResizeWindow;

    // Skip if explicitly disabled
    if (autoResize === false) {
        logger.debug('[CourseInit] Window auto-resize disabled by config');
        return;
    }

    // Get dimensions from config object or use defaults
    const width = typeof autoResize === 'object' ? autoResize.width : 1024;
    const height = typeof autoResize === 'object' ? autoResize.height : 768;

    if (!width || !height) return;

    try {
        // Check if we're in a popup window (opener exists) or undersized window
        const isPopup = window.opener !== null ||
            (window.outerWidth < width || window.outerHeight < height);

        if (isPopup) {
            window.resizeTo(width, height);
            // Center the window on screen after resize
            const left = Math.max(0, (screen.width - width) / 2);
            const top = Math.max(0, (screen.height - height) / 2);
            window.moveTo(left, top);
            logger.debug(`[CourseInit] Resized window to ${width}x${height}`);
        }
    } catch (_e) {
        // Browser may block resize - this is expected for security
        logger.debug('[CourseInit] Window resize blocked by browser (expected for non-popup windows)');
    }
}

/**
 * Apply theme variant tokens as data attributes on <html>
 * 
 * This bridges CSS custom properties to data attributes, enabling themes to configure
 * global component styles (tabs, accordions, cards, etc.) via CSS tokens.
 * 
 * Themes set tokens like: --tab-style: pills;
 * This function reads them and applies: data-tab-style="pills" on <html>
 * 
 * HTML-level overrides take precedence (existing data attributes are preserved).
 */
function applyThemeVariants() {
    const html = document.documentElement;
    const styles = getComputedStyle(html);

    // Apply course layout from config (before theme variants)
    // Layouts: 'article' (default), 'traditional', 'focused', 'presentation', 'canvas'
    const layout = courseConfig.layout || 'article';
    if (!html.hasAttribute('data-layout')) {
        html.setAttribute('data-layout', layout);
        logger.debug(`[Layout] Applied data-layout="${layout}" from course config`);
    }

    // Apply sidebar enabled state from config
    // For 'traditional' layout, sidebar is always enabled
    // For other layouts, it's controlled by navigation.sidebar.enabled
    const sidebarEnabled = layout === 'traditional'
        ? true
        : (courseConfig.navigation?.sidebar?.enabled ?? false);
    html.setAttribute('data-sidebar-enabled', sidebarEnabled ? 'true' : 'false');
    logger.debug(`[Layout] Applied data-sidebar-enabled="${sidebarEnabled}" from course config`);

    // Nav button visibility — traditional layout always shows buttons
    const showNavButtons = layout === 'traditional'
        ? true
        : (courseConfig.navigation?.footer?.showButtons ?? true);
    html.setAttribute('data-nav-buttons', showNavButtons ? 'true' : 'false');
    logger.debug(`[Layout] Applied data-nav-buttons="${showNavButtons}" from course config`);

    // Header visibility — canvas layout always hides header
    const headerEnabled = layout === 'canvas'
        ? false
        : (courseConfig.navigation?.header?.enabled ?? true);
    html.setAttribute('data-header-enabled', headerEnabled ? 'true' : 'false');
    logger.debug(`[Layout] Applied data-header-enabled="${headerEnabled}" from course config`);

    // Map of CSS token names to their corresponding data attribute names
    const variantTokens = [
        { token: '--tab-style', attr: 'data-tab-style' },
        { token: '--accordion-style', attr: 'data-accordion-style' },
        { token: '--button-shape', attr: 'data-button-shape' },
        { token: '--card-style', attr: 'data-card-style' },
        { token: '--callout-style', attr: 'data-callout-style' },
        { token: '--header-style', attr: 'data-header-style' },
        { token: '--sidebar-style', attr: 'data-sidebar-style' },
        { token: '--footer-style', attr: 'data-footer-style' }
    ];

    for (const { token, attr } of variantTokens) {
        // Only apply if not already set in HTML (HTML overrides theme)
        if (!html.hasAttribute(attr)) {
            const value = styles.getPropertyValue(token).trim();
            if (value) {
                html.setAttribute(attr, value);
                logger.debug(`[ThemeVariants] Applied ${attr}="${value}" from theme token`);
            }
        }
    }
}

async function initializeCourseApplication() {
    logger.debug('[CourseInit] Initializing course modules...');

    try {
        // 0. Set document title and description from course config
        if (courseConfig.metadata?.title) {
            document.title = courseConfig.metadata.title;
            const titleElement = document.getElementById('page-title');
            if (titleElement) titleElement.textContent = courseConfig.metadata.title;
        }
        if (courseConfig.metadata?.description) {
            const descElement = document.getElementById('page-description');
            if (descElement) descElement.setAttribute('content', courseConfig.metadata.description);
        }

        // 0a. Initialize error reporter (if configured) - must be early to catch init errors
        initErrorReporter(courseConfig);

        // 0b. Initialize data reporter (if configured) - must be early to capture all events
        initDataReporter(courseConfig);

        // 0c. Initialize course channel (if configured) - pub/sub transport for course-to-course comms
        initCourseChannel(courseConfig);

        // 0d. Validate access control (for external hosting / multi-tenant CDN)
        // This MUST run early before any LMS initialization to reject unauthorized clients
        if (courseConfig.accessControl?.clients) {
            const { validateAccess, showUnauthorizedScreen } = await import('./utilities/access-control.js');
            const accessResult = validateAccess();
            if (!accessResult.valid) {
                logger.warn('[AccessControl] Access denied:', accessResult.error);
                showUnauthorizedScreen(accessResult.error);
                return; // Halt initialization
            }
            if (accessResult.clientId) {
                logger.debug(`[AccessControl] Client authorized: ${accessResult.clientId}`);
            }
        }

        // 0e. Initialize breakpoint manager (must be early - before components render)
        // Applies responsive .bp-* classes to <html> based on viewport width
        breakpointManager.init();

        // 0f. Attempt to resize window to configured dimensions (LMS popup windows)
        resizeWindowToConfig();

        // 0g. Apply theme variant tokens as data attributes (before components render)
        applyThemeVariants();

        // 0h. Register custom icons
        if (customIcons) {
            iconManager.registerAll(customIcons);
            logger.debug('[IconManager] Registered custom icons');
        }

        // 0i. Run static validation in development mode BEFORE any initialization
        // Uses __DEV__ (replaced at build time) instead of runtime check to enable
        // tree-shaking - Rollup sees `if (false)` in prod and eliminates the entire block
        // The typeof check prevents ReferenceError if __DEV__ wasn't defined at build time
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
            try {
                const { lintCourse } = await import('./dev/runtime-linter.js');
                await lintCourse(courseConfig);
            } catch (error) {
                // Linter throws with formatted error message - show it and halt
                reportInitializationError(error);
                throw error;
            }
        }

        // 0j. Wait for automation to initialize (if enabled) before proceeding
        // This ensures interactions can register when they're created
        if (automationInitPromise) {
            logger.debug('[CourseInit] Waiting for automation initialization...');
            await automationInitPromise;
        }

        // 1. LMS connection (required - no fallback)
        // Handles driver init, lifecycle handlers, and xAPI service setup
        stateManager.setCompatibilityMode(courseConfig.environment?.lmsCompatibilityMode || 'auto');
        await stateManager.initializeConnection();

        // 2. Set up state validation config BEFORE initializing stateManager
        // This enables validation of stored LMS data against current course structure.
        // In dev: throws on mismatch to catch stale data issues
        // In prod: gracefully recovers to handle course updates
        stateManager.setCourseValidationConfig({
            structure: courseConfig.structure,
            objectives: courseConfig.objectives,
            version: courseConfig.metadata?.version
        });

        // 3. Initialize state manager (hydrates from LMS with validation)
        stateManager.initialize();

        // 4. Initialize all managers with their configurations
        objectiveManager.initialize(courseConfig.objectives);
        interactionManager.initialize();
        accessibilityManager.initialize();
        flagManager.initialize();
        commentManager.initialize();
        engagementManager.initialize(courseConfig); // Pass courseConfig for requirement lookups
        audioManager.initialize(); // Initialize audio manager for narration support
        videoManager.initialize(); // Initialize video manager for embedded video support

        // Initialize score manager (if course-level scoring is configured)
        // Must happen AFTER objectiveManager to allow loading existing scores
        if (courseConfig.scoring) {
            const scoreManagerModule = await import('./managers/score-manager.js');
            const scoreManager = scoreManagerModule.default;
            scoreManager.initialize(courseConfig.scoring);
            // Expose scoreManager globally for course authors
            window.CourseCode.scoreManager = scoreManager;
        }

        // 5. Initialize course helpers with the course configuration
        CourseHelpers.init(courseConfig);

        // 6. Load course structure
        const slides = await CourseHelpers.getFlattenedSlides();
        const menuTree = await CourseHelpers.getMenuTree();
        const assessmentConfigs = await CourseHelpers.getAssessmentConfigs();

        // 7. Initialize View Manager
        const slideContainer = document.getElementById('slide-container');
        if (!slideContainer) {
            throw new Error('Framework error: #slide-container not found.');
        }
        const viewManager = createViewManager(slideContainer, 'main');

        // Register all slides as views
        slides.forEach(slide => {
            const component = slide.component;

            // REQUIRED: Validate engagement config exists in structure
            if (!slide.engagement) {
                throw new Error(
                    `Slide "${slide.id}" missing required 'engagement' configuration in course-config.js structure. ` +
                    'Add "engagement: { required: false }" to the slide definition in courseConfig.structure.'
                );
            }

            viewManager.registerView(slide.id, {
                render: async (options) => {
                    // 1. Clear registry and initialize engagement for the new slide
                    interactionRegistry.clear();
                    engagementManager.initSlide(slide.id, slide.engagement);

                    const renderContext = {
                        ...options,
                        slideId: slide.id,
                        title: slide.title
                    };

                    // 2. The slide's render function is now responsible for creating and returning its own element
                    let slideElement;
                    try {
                        slideElement = await component.render(null, renderContext);
                    } catch (err) {
                        // Add slide context to error message
                        throw new Error(`Slide "${slide.id}" render() failed: ${err.message}`);
                    }

                    if (!slideElement) {
                        throw new Error(`Slide "${slide.id}" render() returned null/undefined. Must return a DOM element.`);
                    }

                    // 3. Declarative UI components will be initialized by ViewManager after render
                    // (Removed duplicate call here - ViewManager handles it in view-manager.js:84)

                    // 4. Finalize the interaction registry now that rendering is complete
                    interactionRegistry.setReady();

                    // 5. Return the element created by the slide
                    return slideElement;
                },
                onShow: (element, options) => {
                    // Original onShow logic
                    const tracker = new ScrollTracker('main#content', slide.id);
                    element._scrollTracker = tracker;
                    if (component.onShow) component.onShow(element, options);
                },
                onHide: (element) => {
                    // Cleanup scroll tracker
                    if (element._scrollTracker) {
                        element._scrollTracker.destroy();
                        element._scrollTracker = null;
                    }

                    // Cleanup engagement before hiding
                    engagementManager.cleanupSlide(slide.id);
                    if (component.onHide) component.onHide(element);
                },
            });
        });

        // 8. Initialize the main app controller and UI
        AppState.initAppState();
        AppUI.initAppUI();
        AppActions.initAppActions();
        AudioPlayer.setup(); // Initialize audio player UI in footer

        // Listen for view changes to log them
        eventBus.on('view:change', ({ view, context }) => {
            logger.debug(`[ViewManager] View changed to '${view}'`, context);
        });

        // Listen for navigation changes to load/unload slide audio
        // IMPORTANT: Must be registered BEFORE NavigationActions.init() to catch first slide
        let slideAudioCompletedHandler = null;

        eventBus.on('navigation:changed', async ({ toSlideId }) => {
            // Clean up previous slide's audio completion listener
            if (slideAudioCompletedHandler) {
                eventBus.off('audio:completed', slideAudioCompletedHandler);
                slideAudioCompletedHandler = null;
            }

            // Find the slide configuration
            const slide = slides.find(s => s.id === toSlideId);
            if (!slide) return;

            // Check if slide has audio configuration
            if (slide.audio && slide.audio.src) {
                try {
                    await audioManager.load(slide.audio, toSlideId, 'slide');
                    logger.debug(`[AudioManager] Loaded audio for slide: ${toSlideId}`);
                } catch (error) {
                    logger.error(`[AudioManager] Failed to load audio for slide ${toSlideId}:`, error);
                    // Continue - don't let audio errors break navigation
                }

                // Check if slideAudioComplete is required in engagement config
                // This is the new pattern - audio gating is configured via engagement requirements
                const hasSlideAudioRequirement = slide.engagement?.requirements?.some(
                    req => req.type === 'slideAudioComplete'
                );

                if (hasSlideAudioRequirement) {
                    slideAudioCompletedHandler = ({ contextId }) => {
                        if (contextId === toSlideId) {
                            engagementManager.trackSlideAudioComplete(toSlideId);
                        }
                    };
                    eventBus.on('audio:completed', slideAudioCompletedHandler);
                }
            } else {
                // No audio for this slide - unload current audio
                audioManager.unload();
            }
        });

        // Unload audio before navigating away from a slide
        eventBus.on('navigation:beforeChange', () => {
            // Save position and pause (don't fully unload yet - navigation:changed will handle)
            if (audioManager.hasAudio()) {
                audioManager.pause();
            }
        });

        // 9. Initialize Navigation (this will trigger the first slide load)
        await NavigationActions.init(slides, viewManager, menuTree, assessmentConfigs);

        // 10. Initialize Document Gallery (after navigation renders the menu)
        await DocumentGallery.init(courseConfig);

        // 11. Initialize Breadcrumbs (after navigation to catch first slide)
        const { init: initBreadcrumbs } = await import('./navigation/Breadcrumbs.js');
        initBreadcrumbs();

        logger.debug('[CourseInit] Initialization complete');

        // Signal to automation consumers (headless browser) that the framework is fully ready
        if (window.CourseCodeAutomation) {
            window.CourseCodeAutomation.ready = true;
        }

        // Hide loading indicator
        AppUI.hideLoadingIndicator();

        // --- Layer 3: SCORM Best Practice - Passive Beforeunload Warning ---
        // This listener provides a warning but does not block reloads.
        // It is enabled by default in production and disabled by default in development.
        window.addEventListener('beforeunload', (event) => {
            const isProduction = import.meta?.env?.MODE === 'production';
            let guardEnabled = isProduction; // ON in production, OFF in development by default

            // Allow course config to explicitly override the default
            if (courseConfig.environment?.disableBeforeUnloadGuard === true) {
                guardEnabled = false;
            } else if (courseConfig.environment?.disableBeforeUnloadGuard === false) {
                guardEnabled = true; // Explicitly enable it even in dev
            }

            // Automation config can also disable it
            if (courseConfig.environment?.automation?.enabled &&
                courseConfig.environment?.automation?.disableBeforeUnloadGuard) {
                guardEnabled = false;
            }

            // If the guard is disabled for any reason, do nothing.
            if (!guardEnabled) {
                logger.debug('[Framework] Beforeunload warning is disabled.');
                return;
            }

            // If the exit is intentional (via Exit button), allow it silently.
            if (AppState.isExitIntentional()) {
                logger.debug('[Framework] Intentional exit detected, allowing page unload.');
                return;
            }

            // For unintentional exits (F5, browser close, etc.), trigger the browser's native confirmation dialog.
            event.preventDefault();
            event.returnValue = ''; // Required by modern browsers to trigger the dialog.
            logger.warn('[Framework] Unintentional page unload detected. Showing browser confirmation.');
        });

    } catch (error) {
        reportInitializationError(error);
        throw error;
    }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCourseApplication);
} else {
    initializeCourseApplication();
}
