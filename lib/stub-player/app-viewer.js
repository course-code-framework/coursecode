/**
 * stub-player/app-viewer.js - Viewer-only Entry Point
 *
 * Lightweight stub player for export previews and cloud previews.
 * Excludes all authoring/edit functionality: debug panel, config panel,
 * interactions panel, catalog, outline mode, edit mode.
 *
 * Only imports: lms-api, header-bar, content-viewer, login-screen.
 */

import {
    initializeLMS
} from './lms-api.js';

import { createHeaderBarHandlers } from './header-bar.js';
import { createContentViewerHandlers } from './content-viewer.js';
import { createLoginHandlers } from './login-screen.js';

// Global Configuration (injected by server into window.STUB_CONFIG)
const config = window.STUB_CONFIG || {};
const LAUNCH_URL = config.launchUrl || '/';
const START_SLIDE = config.startSlide || null;
const QUERY = new URLSearchParams(window.location.search);
const SHOW_HEADER = resolveShowHeader();
const INITIAL_SKIP_GATING = resolveInitialSkipGating();

// State
let isInitialized = false;
let contentLoaded = false;

// =============================================================================
// INITIALIZATION
// =============================================================================

function init() {
    // Initialize LMS APIs on window (SCORM 1.2, 2004, cmi5)
    initializeLMS();

    // Login Screen
    createLoginHandlers({
        onLogin: () => loadCourse()
    });

    // Content (Review) Panel
    const contentPanel = document.getElementById('stub-player-content-panel');
    const contentHandlers = contentPanel
        ? createContentViewerHandlers({ initialContent: config.courseContent || null })
        : null;

    document.body.classList.toggle('stub-player-header-hidden', !SHOW_HEADER);

    // Header Bar — viewer mode: Review + More menu (skip gating, reset)
    if (SHOW_HEADER) {
        createHeaderBarHandlers({
            onToggle: () => {},
            onContent: () => {
                if (contentPanel) {
                    contentPanel.classList.toggle('visible');
                    if (contentPanel.classList.contains('visible') && !contentLoaded && contentHandlers) {
                        contentHandlers.loadContent();
                        contentLoaded = true;
                    }
                }
            },
            onReset: () => doReset(),
            onSkipGating: (enabled) => {
                if (enabled) {
                    loadCourse();
                } else {
                    doReset();
                }
            },
            initialSkipGating: INITIAL_SKIP_GATING
        });
    } else if (INITIAL_SKIP_GATING !== null) {
        try {
            localStorage.setItem('coursecode-skipGating', INITIAL_SKIP_GATING ? 'true' : 'false');
        } catch {
            // ignore storage failures
        }
    }

    // Load course if no login screen active
    if (!document.getElementById('stub-player-login-screen')?.classList.contains('visible')) {
        loadCourse();
    }

    // Outside click to close panels
    setupOutsideClickListener(contentPanel);
}

function resolveShowHeader() {
    const previewHeader = QUERY.get('previewHeader');
    if (previewHeader === 'hidden') return false;
    if (previewHeader === 'visible') return true;

    const hideHeader = resolveBooleanQuery('hideHeader');
    if (hideHeader !== null) return !hideHeader;

    return config.showHeader !== false;
}

function resolveInitialSkipGating() {
    const querySkipGating = resolveBooleanQuery('skipGating');
    if (querySkipGating !== null) return querySkipGating;
    return typeof config.skipGating === 'boolean' ? config.skipGating : null;
}

function resolveBooleanQuery(name) {
    const value = QUERY.get(name);
    if (value === null) return null;
    const normalized = value.toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return null;
}

// =============================================================================
// COURSE LOADING & NAVIGATION
// =============================================================================

function loadCourse() {
    const frame = document.getElementById('stub-player-course-frame');
    const skipGating = resolveSkipGating();
    let url = LAUNCH_URL;
    if (skipGating) url += (url.includes('?') ? '&' : '?') + 'skipGating=true';
    frame.src = url;
    frame.addEventListener('load', handleFrameLoad);
}

function handleFrameLoad() {
    try {
        const frame = document.getElementById('stub-player-course-frame');
        const win = frame.contentWindow;

        // Inject LMS APIs
        win.API_1484_11 = window.API_1484_11;
        win.API = window.API;
        win.cmi5 = window.cmi5;
        win.lti = window.lti;

        if (resolveSkipGating()) {
            win.__SCORM_PREVIEW_SKIP_GATING = true;
        }

        // Initial navigation (URL param or config)
        if (!isInitialized) {
            const urlSlide = new URLSearchParams(window.location.search).get('slide');
            const target = urlSlide || START_SLIDE;
            if (target) navigateToSlide(win, target);
            isInitialized = true;
        }
    } catch (e) {
        console.error('[Viewer] Failed to inject API:', e);
    }
}

function resolveSkipGating() {
    if (INITIAL_SKIP_GATING !== null) return INITIAL_SKIP_GATING;
    return document.getElementById('stub-player-skip-gating')?.checked === true;
}

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
    // Viewer previews share an origin between the stub player and course iframe.
    // Match the local /__reset route by clearing course/framework progress too.
    let skipGating = null;
    try { skipGating = localStorage.getItem('coursecode-skipGating'); } catch { /* ignore */ }
    try { localStorage.clear(); } catch { /* ignore */ }
    if (skipGating !== null) {
        try { localStorage.setItem('coursecode-skipGating', skipGating); } catch { /* ignore */ }
    }
    window.location.reload();
}

function setupOutsideClickListener(contentPanel) {
    document.addEventListener('click', (e) => {
        if (contentPanel?.classList.contains('visible')) {
            const clickedInPanel = e.target.closest('#stub-player-content-panel');
            const clickedToggle = e.target.closest('button[id*="-btn"]');
            const clickedHeader = e.target.closest('#stub-player-header');

            if (!clickedInPanel && !clickedToggle && !clickedHeader) {
                contentPanel.classList.remove('visible');
            }
        }
    });

    const iframe = document.getElementById('stub-player-course-frame');
    if (iframe) {
        window.addEventListener('blur', () => {
            setTimeout(() => {
                if (document.activeElement === iframe) {
                    contentPanel?.classList.remove('visible');
                }
            }, 0);
        });
    }
}

// Start
init();
