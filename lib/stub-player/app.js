/**
 * stub-player/app.js - Main Application Entry Point
 * 
 * Orchestrates all stub player components, initializes LMS API,
 * and handles global state/events.
 */

import {
    cmiData,
    logError,
    logXapiStatement,
    setUiCallbacks,
    initializeLMS
} from './lms-api.js';

import { createHeaderBarHandlers, updateSlideId } from './header-bar.js';
import { createDebugPanelHandlers } from './debug-panel.js';
import { createConfigPanelHandlers } from './config-panel.js';
import { createContentViewerHandlers } from './content-viewer.js';
import { createInteractionsPanelHandlers } from './interactions-panel.js';
import { createCatalogPanelHandlers } from './catalog-panel.js';
import { createOutlineModeHandlers } from './outline-mode.js';
import { createLoginHandlers } from './login-screen.js';
import { createEditModeHandlers } from './edit-mode.js';
import { initInteractionEditor } from './interaction-editor.js';

// Global Configuration (injected by server into window.STUB_CONFIG)
const config = window.STUB_CONFIG || {};
const IS_LIVE = config.isLive || false;
const LAUNCH_URL = config.launchUrl || '/';
const START_SLIDE = config.startSlide || null;
// State
let isInitialized = false;

// =============================================================================
// INITIALIZATION
// =============================================================================

function init() {
    console.log('[App] Initializing Stub Player...');

    // Initialize LMS APIs on window (SCORM 1.2, 2004, cmi5)
    initializeLMS();

    // Login Screen
    createLoginHandlers({
        onLogin: () => {
            loadCourse();
        }
    });

    // If no login required (or already handled), load course immediately handled by login-screen logic normally
    // But login-screen.js might need to be checked if it auto-hides.
    // Actually, stub-player.js logic was: if login needed, show it, else loadCourse.
    // For now, let's assume login handlers handle the "Start" flow.
    // Check if we need to auto-start if no login required?
    // login-screen.js handles this check usually. 
    // Wait, createLoginHandlers usually returns success check?
    // Let's rely on callback.


    // UI Panels & Exclusivity Management
    const panels = {
        debug: { el: document.getElementById('stub-player-debug-panel'), load: null },
        config: { el: document.getElementById('stub-player-config-panel'), load: () => handlers.config.loadConfig() },
        content: { el: document.getElementById('stub-player-content-panel'), load: () => handlers.content.loadContent() },
        interactions: { el: document.getElementById('stub-player-interactions-panel'), load: () => handlers.interactions.loadInteractions() },
        catalog: { el: document.getElementById('stub-player-catalog-panel'), load: () => handlers.catalog.loadCatalog() }
    };

    function closeAllPanels(except = null) {
        for (const [key, panel] of Object.entries(panels)) {
            if (key !== except && panel.el) {
                panel.el.classList.remove('visible');
            }
        }
    }

    function togglePanel(name) {
        closeAllPanels(name);
        if (panels[name] && panels[name].el) {
            panels[name].el.classList.toggle('visible');
            if (panels[name].el.classList.contains('visible') && panels[name].load) {
                panels[name].load();
            }
        }
    }

    // Context for child modules
    const context = {
        getCmiData: () => cmiData,
        navigateToSlide: (id) => {
            const frame = document.getElementById('stub-player-course-frame');
            if (frame && frame.contentWindow) {
                navigateToSlide(frame.contentWindow, id);
            }
        },
        isLive: IS_LIVE,
        loadCourse: () => loadCourse()
    };

    // Initialize Module Handlers
    const handlers = {
        debug: createDebugPanelHandlers(), // Debug panel handles its own internal logic, we trigger visibility via header
        config: createConfigPanelHandlers ? createConfigPanelHandlers(context) : null,
        content: createContentViewerHandlers ? createContentViewerHandlers(context) : null,
        interactions: createInteractionsPanelHandlers ? createInteractionsPanelHandlers(context) : null,
        catalog: createCatalogPanelHandlers ? createCatalogPanelHandlers(context) : null,
        outline: createOutlineModeHandlers ? createOutlineModeHandlers(context) : null
    };

    // Stage-aware: check if we should show dashboard instead of course
    if (IS_LIVE && handlers.outline) {
        handlers.outline.checkStage().then(active => {
            // If dashboard didn't activate, load course now
            if (!active && !document.getElementById('stub-player-login-screen')?.classList.contains('visible')) {
                loadCourse();
            }
        });
    }

    // Header Bar
    createHeaderBarHandlers({
        onToggle: (isCollapsed) => {
            if (isCollapsed) closeAllPanels();
        },
        onDebug: () => togglePanel('debug'),
        onConfig: () => togglePanel('config'),
        onContent: () => togglePanel('content'),
        onInteract: () => togglePanel('interactions'),
        onCatalog: () => togglePanel('catalog'),
        onEdit: () => { /* Edit logic internal to stub-player.js? Or moved? */ },
        onReset: () => doReset(),
        onSkipGating: (enabled) => {
            if (enabled) {
                loadCourse(); // Reload to apply skip
            } else {
                doReset(); // Reset to enforce gating
            }
        },
        onStatus: () => {
            if (handlers.outline) handlers.outline.toggle();
        }
    });

    // Register LMS API Callbacks to update UI
    setUiCallbacks({
        onSlideNavigation: (slideId) => {
            // Update header badge when cmi.location changes
            updateSlideId(slideId);
        }
    });

    // Initial Course Load (if no login screen or dashboard active)
    if (!IS_LIVE && !document.getElementById('stub-player-login-screen')?.classList.contains('visible')) {
        loadCourse();
    }

    // Setup outside click listener
    setupOutsideClickListener(panels);

    // Setup Edit Mode logic (if live)
    if (IS_LIVE) setupEditMode();
}

// =============================================================================
// COURSE LOADING & NAVIGATION
// =============================================================================

function loadCourse() {
    const frame = document.getElementById('stub-player-course-frame');
    const skipGating = document.getElementById('stub-player-skip-gating')?.checked;
    let url = LAUNCH_URL;
    if (skipGating) url += (url.includes('?') ? '&' : '?') + 'skipGating=true';
    frame.src = url;

    // Inject API on load
    frame.addEventListener('load', handleFrameLoad);
}

function handleFrameLoad() {
    try {
        const frame = document.getElementById('stub-player-course-frame');
        const win = frame.contentWindow;

        // Inject APIs (attached to window.* by initializeLMS() in init())
        win.API_1484_11 = window.API_1484_11;
        win.API = window.API;
        win.cmi5 = window.cmi5;
        win.lti = window.lti;

        if (document.getElementById('stub-player-skip-gating')?.checked) {
            win.__SCORM_PREVIEW_SKIP_GATING = true;
        }

        // Attach console interceptors
        attachConsoleInterceptors(win);

        // Attach xAPI listener
        attachXapiListener(win);

        // Initial Nav
        if (!isInitialized) {
            const urlSlide = new URLSearchParams(window.location.search).get('slide');
            const target = urlSlide || START_SLIDE;
            if (target) {
                navigateToSlide(win, target);
            }
            isInitialized = true;
        }

        // Listen for slide changes to update header
        // We can poll or hook into framework?
        // Framework events are best.
        // See attachXapiListener for pattern.

    } catch (e) {
        console.error('[App] Failed to inject API:', e);
    }
}

// ... Navigation helpers (navigateToSlide, resolveSlideId) ...
function navigateToSlide(contentWindow, slideIdOrIndex) {
    const maxAttempts = 50;
    let attempts = 0;

    function tryNavigate() {
        attempts++;
        try {
            const fw = contentWindow.CourseCode;
            const nav = fw && fw.NavigationActions;

            if (nav && typeof nav.isReady === 'function' && nav.isReady() && typeof nav.goToSlide === 'function') {
                const slideId = resolveSlideId(contentWindow, slideIdOrIndex);
                if (slideId) {
                    nav.goToSlide(slideId, { source: 'preview-url' });
                    // Update header badge
                    updateSlideId(slideId);
                    return;
                }
            }

            if (attempts < maxAttempts) setTimeout(tryNavigate, 100);
        } catch (_e) {
            if (attempts < maxAttempts) setTimeout(tryNavigate, 100);
        }
    }
    setTimeout(tryNavigate, 300);
}

function resolveSlideId(contentWindow, slideIdOrIndex) {
    // ... same implementation as before ...
    const asNumber = Number(slideIdOrIndex);
    if (!isNaN(asNumber) && Number.isInteger(asNumber) && asNumber >= 0) {
        if (contentWindow.CourseCode?.NavigationActions?.getAllSlides) {
            const slides = contentWindow.CourseCode.NavigationActions.getAllSlides();
            if (slides && slides[asNumber]) return slides[asNumber].id;
        }
        return null;
    }
    return slideIdOrIndex;
}

// =============================================================================
// UTILS
// =============================================================================

function doReset() {
    window.location.href = '/__reset';
}

function setupOutsideClickListener(panels) {
    // Standard click-outside for clicks in parent document
    document.addEventListener('click', (e) => {
        const visiblePanel = Object.values(panels).find(p => p.el && p.el.classList.contains('visible'));
        if (visiblePanel) {
            const clickedInPanel = e.target.closest('#' + visiblePanel.el.id);
            const clickedToggle = e.target.closest('button[id*="-btn"]');
            const clickedHeader = e.target.closest('#stub-player-header');

            if (!clickedInPanel && !clickedToggle && !clickedHeader) {
                visiblePanel.el.classList.remove('visible');
            }
        }
    });

    // Iframe focus detection - when user clicks inside iframe, it gets focus
    // This handles the case where the iframe covers most of the viewport
    const iframe = document.getElementById('stub-player-course-frame');
    if (iframe) {
        // Use focusin on window to detect when iframe gets focus
        window.addEventListener('blur', () => {
            // Window loses focus when iframe gains it
            setTimeout(() => {
                if (document.activeElement === iframe) {
                    // User clicked inside iframe - close all panels
                    Object.values(panels).forEach(p => {
                        if (p.el) p.el.classList.remove('visible');
                    });
                }
            }, 0);
        });
    }
}

function setupEditMode() {
    createEditModeHandlers({
        getCmiData: () => cmiData
    });

    // Initialize the popup interaction editor
    initInteractionEditor({
        onSave: () => {
            // Refresh the course iframe after saving an interaction
            const frame = document.getElementById('stub-player-course-frame');
            if (frame && frame.contentWindow) {
                frame.contentWindow.location.reload();
            }
        }
    });
}

function attachConsoleInterceptors(win) {
    const output = win.console;
    const origError = output.error;
    const origWarn = output.warn;

    output.error = function (...args) {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        logError('Course Error', msg.substring(0, 500), '', false);
        origError.apply(output, args);
    };

    output.warn = function (...args) {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        const isCV = msg.includes('COURSE VALIDATION');
        logError('Course Warning', msg.substring(0, isCV ? 10000 : 500), '', true);
        origWarn.apply(output, args);
    };

    win.addEventListener('error', function (e) {
        logError('Course Uncaught', e.message || 'Unknown', e.filename ? e.filename.split('/').pop() + ':' + e.lineno : '', false);
    });
}

function attachXapiListener(win) {
    function tryAttach() {
        const fw = win.CourseCode;
        if (fw && fw.eventBus) {
            fw.eventBus.on('xapi:statement', logXapiStatement);
            // Also listen for navigation to trigger config panel update
            fw.eventBus.on('navigation:change', (data) => {
                if (data.to && window.__refreshSlideTab) window.__refreshSlideTab();
            });
            return true;
        }
        return false;
    }

    if (!tryAttach()) {
        let retries = 0;
        const iv = setInterval(() => {
            if (tryAttach() || ++retries > 20) clearInterval(iv);
        }, 200);
    }
}


// Start
init();
