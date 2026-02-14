/**
 * @file api.js
 * @description Public automation API exposed on window.CourseCodeAutomation
 * Provides programmatic control over interactions, navigation, and course state
 * for testing and AI-driven automation.
 * 
 * This module is ONLY loaded in development/testing mode and is completely excluded
 * from production builds via Vite's tree-shaking.
 * 
 * Delegates to domain-specific modules:
 *   api-interactions.js  – discovery, state, mutation, evaluation
 *   api-engagement.js    – engagement, flags, audio
 */

import { logger } from '../utilities/logger.js';
import { eventBus } from '../core/event-bus.js';
import * as NavigationActions from '../navigation/NavigationActions.js';
import { courseConfig } from '../../../course/course-config.js';
import stateManager from '../state/index.js';
import accessibilityManager from '../managers/accessibility-manager.js';
import objectiveManager from '../managers/objective-manager.js';

import { createInteractionMethods } from './api-interactions.js';
import { createEngagementMethods } from './api-engagement.js';

/** Automation trace log for observability */
const automationTrace = [];

/** Framework log buffer — captures structured log:warn and log:error events */
const frameworkLogs = [];
const MAX_FRAMEWORK_LOGS = 100;

eventBus.on('log:warn', (payload) => {
    frameworkLogs.push({ ...payload, timestamp: new Date().toISOString() });
    if (frameworkLogs.length > MAX_FRAMEWORK_LOGS) frameworkLogs.shift();
});
eventBus.on('log:error', (payload) => {
    frameworkLogs.push({ ...payload, timestamp: new Date().toISOString() });
    if (frameworkLogs.length > MAX_FRAMEWORK_LOGS) frameworkLogs.shift();
});

/** Adds an entry to the automation trace log */
function logTrace(action, details) {
    const entry = {
        timestamp: new Date().toISOString(),
        action,
        ...details
    };
    automationTrace.push(entry);
    eventBus.emit('automation:trace', entry);
}

// Build delegated method sets
const interactionMethods = createInteractionMethods(logTrace);
const engagementMethods = createEngagementMethods(logTrace);

/**
 * CourseCodeAutomation API
 * All methods throw errors on failure (no silent failures)
 */
const CourseCodeAutomationAPI = {
    // ===== Discovery & Interaction Methods =====
    listInteractions: interactionMethods.listInteractions,
    getInteractionMetadata: interactionMethods.getInteractionMetadata,
    getResponse: interactionMethods.getResponse,
    getCorrectResponse: interactionMethods.getCorrectResponse,
    setResponse: interactionMethods.setResponse,
    checkAnswer: interactionMethods.checkAnswer,
    checkSlideAnswers() {
        return interactionMethods.checkSlideAnswers.call(
            interactionMethods,
            () => this.getCurrentSlide()
        );
    },

    // ===== Navigation Methods =====

    getToc() {
        const toc = [];
        const flatten = (items) => {
            for (const item of items) {
                if (item.type === 'section') {
                    toc.push({ id: item.id, type: 'section', title: item.menu?.label });
                    if (item.children) flatten(item.children);
                } else {
                    toc.push({ id: item.id, type: item.type, title: item.title, file: item.component });
                }
            }
        };
        flatten(courseConfig.structure);
        logTrace('getToc', { count: toc.length });
        return toc;
    },

    getCurrentSlide() {
        const currentSlide = NavigationActions.getCurrentSlide();
        logTrace('getCurrentSlide', { slideId: currentSlide?.id });
        return currentSlide?.id || null;
    },

    async goToSlide(slideId, context = {}) {
        try {
            await NavigationActions.goToSlide(slideId, context);
            logTrace('goToSlide', { slideId, context });
        } catch (error) {
            logTrace('goToSlide:error', { slideId, context, error: error.message });
            throw new Error(`CourseCodeAutomation: Failed to navigate to "${slideId}": ${error.message}`);
        }
    },

    // ===== Observability Methods =====

    getAutomationTrace() {
        return [...automationTrace];
    },

    clearAutomationTrace() {
        const count = automationTrace.length;
        automationTrace.length = 0;
        logTrace('clearAutomationTrace', { clearedCount: count });
        logger.debug(`[CourseCodeAutomation] Cleared ${count} trace entries`);
    },

    getFrameworkLogs() {
        const logs = frameworkLogs.splice(0);
        logTrace('getFrameworkLogs', { count: logs.length });
        return logs;
    },


    // ===== Engagement Methods =====
    getEngagementState: engagementMethods.getEngagementState,
    getEngagementProgress: engagementMethods.getEngagementProgress,
    markTabViewed: engagementMethods.markTabViewed,
    markFlipCardViewed: engagementMethods.markFlipCardViewed,
    setScrollDepth: engagementMethods.setScrollDepth,
    resetEngagement: engagementMethods.resetEngagement,

    // ===== Flag Management =====
    getFlag: engagementMethods.getFlag,
    setFlag: engagementMethods.setFlag,
    getAllFlags: engagementMethods.getAllFlags,
    removeFlag: engagementMethods.removeFlag,

    // ===== Audio Methods =====
    getAudioState: engagementMethods.getAudioState,
    hasAudio: engagementMethods.hasAudio,
    simulateAudioComplete: engagementMethods.simulateAudioComplete,
    isAudioCompletedForContext: engagementMethods.isAudioCompletedForContext,
    getAudioProgress: engagementMethods.getAudioProgress,

    // ===== LMS State =====

    /**
     * Returns the full LMS data model:
     * - Direct CMI writes: score, completion, success, bookmark
     * - CMI-backed domains: objectives
     * - All suspend_data domains: the full state blob
     */
    getLmsState() {
        const score = stateManager.getScore();
        const completion = stateManager.getCompletion();
        const success = stateManager.getSuccess();
        const bookmark = stateManager.getBookmark();
        const format = stateManager.getFormat();

        // Objectives from ObjectiveManager (driver-agnostic)
        const rawObjectives = objectiveManager.getObjectives();
        const objectives = {};
        for (const obj of rawObjectives) {
            objectives[obj.id] = {
                completion_status: obj.completion_status,
                success_status: obj.success_status,
                score: obj.score ?? null
            };
        }

        // Full suspend_data domains
        const state = stateManager.getState();

        logTrace('getLmsState', { format, hasScore: score !== null });

        return {
            score,
            completion,
            success,
            bookmark,
            format,
            objectives,
            state
        };
    },

    // ===== Accessibility / Theme =====

    /**
     * Set an accessibility preference (theme, highContrast, largeFont, reducedMotion).
     * @param {'theme'|'highContrast'|'largeFont'|'reducedMotion'} key
     * @param {string|boolean} value - 'light'|'dark' for theme, boolean for others
     */
    setAccessibilityPreference(key, value) {
        accessibilityManager.setPreference(key, value);
        logTrace('setAccessibilityPreference', { key, value });
    },

    /**
     * Get current accessibility state (theme, highContrast, largeFont, reducedMotion).
     */
    getAccessibilityState() {
        const state = { ...accessibilityManager.state };
        logTrace('getAccessibilityState', state);
        return state;
    },

    // ===== Version Info =====

    getVersion() {
        return {
            api: '2.2.0',
            phase: 8,
            features: [
                'discovery',
                'state-access',
                'state-mutation',
                'evaluation',
                'navigation',
                'observability',
                'ergonomic-helpers',
                'engagement-tracking',
                'flip-card-tracking',
                'flag-management',
                'audio-state',
                'audio-completion-simulation',
                'framework-logs',
                'lms-state',
                'accessibility-preferences'
            ]
        };
    }
};

export default CourseCodeAutomationAPI;
