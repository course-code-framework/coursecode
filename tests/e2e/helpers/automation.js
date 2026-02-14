/**
 * Automation API helpers for E2E tests.
 * 
 * Wraps calls to window.CourseCodeAutomation inside the course iframe,
 * providing a clean async interface for test files.
 */

import { PORT, URL } from './setup.js';

/**
 * Call a method on the Automation API inside the course iframe.
 * @param {import('puppeteer-core').Frame} frame - The course iframe
 * @param {string} method - Method name on CourseCodeAutomation
 * @param  {...any} args - Arguments to pass
 * @returns {Promise<any>} Result from the API call
 */
export async function automation(frame, method, ...args) {
    return frame.evaluate((m, ...a) => {
        const api = window.CourseCodeAutomation;
        if (!api) throw new Error('CourseCodeAutomation not available');
        if (typeof api[m] !== 'function') throw new Error(`CourseCodeAutomation.${m} is not a function`);
        return api[m](...a);
    }, method, ...args);
}

/**
 * Navigate to a slide and wait for it to settle.
 */
export async function goToSlide(frame, slideId) {
    await automation(frame, 'goToSlide', slideId);
    // Small delay for slide transition and interaction registration
    await new Promise(r => setTimeout(r, 300));
}

/**
 * Get the current slide ID.
 */
export async function getCurrentSlide(frame) {
    return automation(frame, 'getCurrentSlide');
}

/**
 * Set a response on an interaction.
 */
export async function setResponse(frame, interactionId, response) {
    return automation(frame, 'setResponse', interactionId, response);
}

/**
 * Check an interaction's answer. Returns { correct, score, feedback }.
 */
export async function checkAnswer(frame, interactionId) {
    return automation(frame, 'checkAnswer', interactionId);
}

/**
 * Get the correct response for an interaction (requires exposeCorrectAnswers).
 */
export async function getCorrectResponse(frame, interactionId) {
    return automation(frame, 'getCorrectResponse', interactionId);
}

/**
 * List interactions on the current slide.
 */
export async function listInteractions(frame) {
    return automation(frame, 'listInteractions');
}

/**
 * Get engagement state for the current slide.
 */
export async function getEngagementState(frame) {
    return automation(frame, 'getEngagementState');
}

/**
 * Get engagement progress for the current slide.
 */
export async function getEngagementProgress(frame) {
    return automation(frame, 'getEngagementProgress');
}

/**
 * Check all answers on the current (or specified) slide.
 */
export async function checkSlideAnswers(frame, slideId) {
    return automation(frame, 'checkSlideAnswers', slideId);
}

/**
 * Set a flag value.
 */
export async function setFlag(frame, key, value) {
    return automation(frame, 'setFlag', key, value);
}

/**
 * Get a flag value.
 */
export async function getFlag(frame, key) {
    return automation(frame, 'getFlag', key);
}

/**
 * Mark a tab as viewed (for engagement tracking).
 */
export async function markTabViewed(frame, tabId) {
    return automation(frame, 'markTabViewed', tabId);
}

/**
 * Reset engagement tracking for the current slide.
 */
export async function resetEngagement(frame) {
    return automation(frame, 'resetEngagement');
}

/**
 * Get the automation trace log.
 */
export async function getAutomationTrace(frame) {
    return automation(frame, 'getAutomationTrace');
}

/**
 * Clear localStorage in the course iframe (for fresh state).
 */
export async function clearState(frame) {
    await frame.evaluate(() => {
        localStorage.clear();
    });
}

/**
 * Wait for the course iframe to load and ALL subsystems to be ready.
 * Verifies both the Automation API and NavigationActions are initialized
 * to avoid the race condition where ready=true but navigation isn't set up.
 */
export async function waitForReady(page) {
    const iframeElement = await page.waitForSelector('#stub-player-course-frame', { timeout: 10000 });
    const frame = await iframeElement.contentFrame();
    if (!frame) throw new Error('Could not get iframe content frame');
    await frame.waitForSelector('#loading[aria-hidden="true"]', { timeout: 15000 });
    await frame.waitForFunction(() => {
        const api = window.CourseCodeAutomation;
        if (!api?.ready) return false;
        // Verify navigation is actually initialized by attempting getCurrentSlide
        try {
            return typeof api.getCurrentSlide() === 'string';
        } catch {
            return false;
        }
    }, { timeout: 10000 });
    return frame;
}

// ==========================================
// Server-Side LMS API Helpers
// ==========================================
// These query the preview server's /__lms/ endpoints directly via HTTP,
// allowing E2E tests to verify LMS state from the server perspective
// without needing to execute code inside the browser iframe.

const LMS_BASE = `http://localhost:${PORT}/__lms`;

async function lmsFetch(path) {
    const res = await fetch(`${LMS_BASE}/${path}`);
    return res.json();
}

/** Full CMI data model snapshot from the server. */
export async function lmsState() {
    return lmsFetch('state');
}

/** Score values (raw, scaled, min, max). */
export async function lmsScore() {
    return lmsFetch('score');
}

/** Completion + success status. */
export async function lmsCompletion() {
    return lmsFetch('completion');
}

/** All objectives with scores. */
export async function lmsObjectives() {
    return lmsFetch('objectives');
}

/** All interaction records. */
export async function lmsInteractions() {
    return lmsFetch('interactions');
}

/** xAPI statement log (cmi5). */
export async function lmsXapi() {
    return lmsFetch('xapi');
}

/** API call log. */
export async function lmsLog() {
    return lmsFetch('log');
}

/** LMS error/warning log. */
export async function lmsErrors() {
    return lmsFetch('errors');
}

/** Active LMS format. */
export async function lmsFormat() {
    return lmsFetch('format');
}

/** Session info (initialized, terminated, duration). */
export async function lmsSession() {
    return lmsFetch('session');
}

/** Reset LMS state on the server. */
export async function lmsReset() {
    const res = await fetch(`${LMS_BASE}/reset`, { method: 'POST' });
    return res.json();
}

/** Configure LMS (learner info, mode, strict). */
export async function lmsConfigure(config) {
    const res = await fetch(`${LMS_BASE}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
    return res.json();
}

// ==========================================
// Polling Helpers (anti-flake)
// ==========================================

/**
 * Poll the server-side LMS score endpoint until a predicate passes or timeout.
 * Replaces fragile fixed-delay patterns that cause flaky tests.
 * @param {(score: object) => boolean} predicate - Return true when score is ready
 * @param {object} [opts]
 * @param {number} [opts.interval=300] - ms between polls
 * @param {number} [opts.attempts=25] - max polls before giving up
 * @returns {Promise<object>} The score object that passed the predicate
 */
export async function waitForLmsScore(predicate, { interval = 300, attempts = 25 } = {}) {
    for (let i = 0; i < attempts; i++) {
        await new Promise(r => setTimeout(r, interval));
        const score = await lmsScore();
        if (predicate(score)) return score;
    }
    // Return last result so the caller's expect() gives a useful diff
    return lmsScore();
}

/**
 * Poll the server-side LMS completion endpoint until a predicate passes.
 */
export async function waitForLmsCompletion(predicate, { interval = 300, attempts = 25 } = {}) {
    for (let i = 0; i < attempts; i++) {
        await new Promise(r => setTimeout(r, interval));
        const completion = await lmsCompletion();
        if (predicate(completion)) return completion;
    }
    return lmsCompletion();
}
