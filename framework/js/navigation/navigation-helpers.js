/**
 * @file navigation-helpers.js
 * @description Pure utility functions for navigation logic.
 * These functions have no side effects and don't depend on module state.
 * @author Seth
 * @version 1.0.0
 */

import { courseConfig } from '../../../course/course-config.js';

/**
 * Checks if gating should be bypassed.
 * 
 * Bypass conditions (any of):
 * 1. Development mode + disableGating config = true
 * 2. URL parameter ?skipGating=true (for static preview exports)
 * 3. Global flag window.__SCORM_PREVIEW_SKIP_GATING (set by stub player)
 * 
 * @returns {boolean} True if gating should be bypassed
 */
export function shouldBypassGating() {
    // Test override: force gating on regardless of other flags
    if (window.__FORCE_GATING === true) return false;

    // Check URL parameter (works in any mode - for preview exports)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('skipGating') === 'true') {
        return true;
    }
    
    // Check global flag (set by stub LMS player)
    if (window.__SCORM_PREVIEW_SKIP_GATING === true) {
        return true;
    }
    
    // Check dev mode config
    const buildMode = import.meta?.env?.MODE;
    const isProductionBuild = buildMode === 'production';
    const devGatingDisabled = courseConfig.environment?.development?.disableGating === true;
    return !isProductionBuild && devGatingDisabled;
}

/**
 * Checks if engagement requirements should be bypassed in development mode.
 * Semantically clearer alias for shouldBypassGating.
 * @returns {boolean} True if engagement checks should be bypassed
 */
export function shouldBypassEngagement() {
    return shouldBypassGating();
}

/**
 * Evaluates a single gating condition against current course state.
 * This is a pure function that takes all dependencies as parameters.
 * 
 * @param {object} condition - The condition to evaluate
 * @param {object} stateManager - StateManager instance for reading course state
 * @param {Map} assessmentConfigs - Map of assessment configurations
 * @returns {boolean} True if the condition is met
 * @throws {Error} If condition type is unknown
 */
export function evaluateGatingCondition(condition, stateManager, assessmentConfigs) {
    if (!condition || typeof condition !== 'object') {
        return false;
    }

    switch (condition.type) {
        case 'objectiveStatus': {
            const objective = stateManager.getDomainState('objectives')?.[condition.objectiveId];
            if (!objective) return false;

            // Check completion_status if specified
            if (condition.completion_status !== undefined) {
                return objective.completion_status === condition.completion_status;
            }

            // Check success_status if specified
            if (condition.success_status !== undefined) {
                return objective.success_status === condition.success_status;
            }

            // No valid field specified
            return false;
        }

        case 'assessmentStatus': {
            // Read from the per-assessment domain (e.g., 'assessment_final-exam')
            const assessmentDomain = stateManager.getDomainState(`assessment_${condition.assessmentId}`);
            if (!assessmentDomain) return false;

            const summary = assessmentDomain.summary;
            if (!summary || !summary.lastResults) return false;

            const passed = summary.lastResults.passed;

            switch (condition.requires) {
                case 'completed':
                    return summary.submitted === true;
                case 'passed':
                    return passed === true;
                case 'failed':
                    return summary.submitted === true && passed === false;
                default:
                    return false;
            }
        }

        case 'assessmentAttempts': {
            // Read from the per-assessment domain
            const assessmentDomain = stateManager.getDomainState(`assessment_${condition.assessmentId}`);
            if (!assessmentDomain) return false;

            const summary = assessmentDomain.summary;
            const attempts = summary?.attempts || 0;

            if (condition.min !== undefined && attempts < condition.min) return false;
            if (condition.max !== undefined && attempts > condition.max) return false;
            return true;
        }

        case 'assessmentConfig': {
            const config = assessmentConfigs.get(condition.assessmentId);
            if (!config) return false;

            // Helper to get nested property value
            const getPropertyValue = (obj, path) => path.split('.').reduce((o, k) => (o || {})[k], obj);
            const value = getPropertyValue(config, condition.property);

            if (value === undefined) return false;

            if (condition.equals !== undefined) {
                return value === condition.equals;
            }
            if (condition.greaterThan !== undefined) {
                return typeof value === 'number' && value > condition.greaterThan;
            }
            if (condition.lessThan !== undefined) {
                return typeof value === 'number' && value < condition.lessThan;
            }
            // If just checking for property existence
            return true;
        }

        case 'stateFlag': {
            const flags = stateManager.getDomainState('flags');
            const value = flags?.[condition.key];
            if (condition.equals !== undefined) {
                return value === condition.equals;
            }
            if (condition.exists !== undefined) {
                return condition.exists ? value !== undefined : value === undefined;
            }
            return !!value;
        }

        case 'timeOnSlide': {
            const minSeconds = condition.minSeconds;
            if (typeof minSeconds !== 'number' || !Number.isFinite(minSeconds) || minSeconds <= 0) {
                return false;
            }
            const sessionData = stateManager.getDomainState('sessionData');
            const slideDurations = sessionData?.slideDurations || {};
            const slideDurationMs = slideDurations[condition.slideId] || 0;
            const totalSeconds = slideDurationMs / 1000;
            return totalSeconds >= minSeconds;
        }

        case 'custom': {
            // Custom conditions can use a function or reference custom state
            if (typeof condition.evaluate === 'function') {
                return condition.evaluate(stateManager);
            }
            return false;
        }

        default:
            throw new Error(`Unknown gating condition type: ${condition.type}. Valid types: objectiveStatus, assessmentStatus, assessmentAttempts, assessmentConfig, stateFlag, timeOnSlide, custom.`);
    }
}
