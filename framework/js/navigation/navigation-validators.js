/**
 * @file navigation-validators.js
 * @description Validation functions for navigation access control.
 * All validators return consistent {allowed: boolean, message: string|null, reason?: string} objects.
 * @author Seth
 * @version 1.0.0
 */

import { evaluateGatingCondition, shouldBypassGating } from './navigation-helpers.js';
import * as AssessmentManager from '../managers/assessment-manager.js';

/**
 * Determines whether a slide should be included in the sequential navigation flow.
 * Checks sequence configuration and evaluates dynamic conditions.
 * 
 * SMART DEFAULT: For slides with gating conditions AND hidden from menu (menu.hidden: true),
 * the gating conditions are automatically used for sequence inclusion. This prevents
 * navigation loops when gating is bypassed for testing, without requiring duplicate config.
 * 
 * @param {object} slide - The slide entry containing navigation configuration
 * @param {object} stateManager - StateManager instance for reading state
 * @param {Map} assessmentConfigs - Map of assessment configurations
 * @returns {boolean} True when the slide should be part of the active sequence
 */
export function isSlideInSequence(slide, stateManager, assessmentConfigs) {
    if (!slide) {
        return false;
    }

    const sequence = slide.navigation?.sequence;
    const gating = slide.navigation?.gating;
    const isHiddenFromMenu = slide.menu?.hidden === true;

    // SMART DEFAULT: If no explicit sequence config, but slide has gating AND is hidden,
    // use gating conditions to determine sequence inclusion.
    // This prevents loops when gating is bypassed (e.g., remedial slides).
    if (!sequence && gating?.conditions?.length > 0 && isHiddenFromMenu) {
        const gatingMode = gating.mode || 'all';
        if (gatingMode === 'any') {
            return gating.conditions.some(condition =>
                evaluateGatingCondition(condition, stateManager, assessmentConfigs)
            );
        }
        // Default to 'all' for any mode value (including invalid ones)
        return gating.conditions.every(condition =>
            evaluateGatingCondition(condition, stateManager, assessmentConfigs)
        );
    }

    // No sequence config and no smart default applies = always included
    if (!sequence) {
        return true;
    }

    const includeWhen = sequence.includeWhen || [];
    const skipUntil = sequence.skipUntil || [];
    const includeByDefault = sequence.includeByDefault !== false;

    let include = includeByDefault;

    // Check includeWhen conditions
    if (includeWhen.length > 0) {
        include = includeWhen.every(condition =>
            evaluateGatingCondition(condition, stateManager, assessmentConfigs)
        );
    }

    // Check skipUntil conditions
    if (include && skipUntil.length > 0) {
        const skipSatisfied = skipUntil.every(condition =>
            evaluateGatingCondition(condition, stateManager, assessmentConfigs)
        );
        if (!skipSatisfied) {
            include = false;
        }
    }

    return include;
}

/**
 * Validates whether a slide is accessible based on gating conditions.
 * Checks all configured gating rules and applies dev mode override.
 * 
 * @param {object} slide - The slide entry with navigation configuration
 * @param {object} stateManager - StateManager instance
 * @param {Map} assessmentConfigs - Map of assessment configurations
 * @returns {{allowed: boolean, message: string|null, reason?: string}} Access result
 */
export function validateSlideAccess(slide, stateManager, assessmentConfigs) {
    // Dev mode gating override
    if (shouldBypassGating()) {
        return { allowed: true, message: null, reason: 'dev-bypass' };
    }

    if (!slide || !slide.navigation || !slide.navigation.gating) {
        return { allowed: true, message: null, reason: null };
    }

    const gating = slide.navigation.gating;
    const conditions = gating.conditions || [];

    if (conditions.length === 0) {
        return { allowed: true, message: null, reason: null };
    }

    const mode = gating.mode || 'all';
    let allowed;

    if (mode === 'any') {
        // At least one condition must be met
        allowed = conditions.some(condition =>
            evaluateGatingCondition(condition, stateManager, assessmentConfigs)
        );
    } else {
        // Default to 'all' — all conditions must be met (including invalid mode values)
        allowed = conditions.every(condition =>
            evaluateGatingCondition(condition, stateManager, assessmentConfigs)
        );
    }

    return {
        allowed,
        message: allowed ? null : (gating.message || 'This content is currently locked.'),
        reason: allowed ? null : 'gating-failed'
    };
}

/**
 * Validates whether navigation FROM the current slide is allowed.
 * Checks assessment completion requirements.
 * 
 * @param {object} slide - The slide entry to check
 * @param {Map} assessmentConfigs - Map of assessment configurations
 * @returns {{allowed: boolean, message: string|null, reason?: string}} Navigation permission result
 */
export function validateNavigationFrom(slide, assessmentConfigs) {
    // Dev mode override
    if (shouldBypassGating()) {
        return { allowed: true, message: null, reason: 'dev-bypass' };
    }

    if (!slide) {
        return { allowed: true, message: null };
    }

    // Check if this is an assessment with completion requirements that block navigation
    if (slide.type === 'assessment') {
        const config = assessmentConfigs.get(slide.assessmentId);
        const requirements = config?.completionRequirements;

        // Only block if blockNavigation is explicitly true
        if (requirements?.blockNavigation === true) {
            const requirementsMet = AssessmentManager.meetsCompletionRequirements(
                slide.assessmentId,
                requirements
            );

            if (!requirementsMet) {
                // Build helpful message based on what's required
                let message = 'You must complete the assessment before continuing.';
                if (requirements.requirePass) {
                    message = 'You must pass the assessment before continuing.';
                } else if (requirements.requireSubmission) {
                    message = 'You must submit your assessment before continuing.';
                }

                return { allowed: false, message, reason: 'assessment-incomplete' };
            }
        }
    }

    return { allowed: true, message: null };
}
