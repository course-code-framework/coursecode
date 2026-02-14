/**
 * @file assessment-manager.js
 * @description Public API for the assessment system.
 *
 * This is the ONLY assessment file that course authors should import.
 * It provides:
 * - Factory function to create assessment instances
 * - Query utilities to check assessment completion status
 * - Helper functions for gating and course completion logic
 *
 * ARCHITECTURE NOTE:
 * Unlike NavigationActions (singleton), assessments use a factory pattern
 * because multiple assessment instances can exist per course, each with
 * isolated state stored in separate `assessment_${id}` domains.
 */

import { deepMerge } from '../utilities/utilities.js';
import stateManager from '../state/index.js';
import { createAssessmentInstance } from '../assessment/AssessmentFactory.js';
import { logger } from '../utilities/logger.js';

/**
 * Utility function to get domain key for an assessment.
 * @param {string} assessmentId - The unique ID of the assessment
 * @returns {string} The domain key for state manager
 */
function getAssessmentDomainKey(assessmentId) {
    return `assessment_${assessmentId}`;
}

/**
 * Creates an assessment instance with all required wiring.
 *
 * @param {Object} baseConfig - Base assessment configuration
 * @param {string} baseConfig.id - Unique assessment ID (required)
 * @param {string} baseConfig.title - Assessment title
 * @param {Array} baseConfig.questions - Array of question configurations (required)
 * @param {Object} baseConfig.settings - Assessment settings
 * @param {number} baseConfig.settings.passingScore - Passing score percentage (default: 70)
 * @param {boolean} baseConfig.settings.allowReview - Allow review before submit (default: true)
 * @param {boolean} baseConfig.settings.showProgress - Show progress indicator (default: true)
 * @param {boolean} baseConfig.settings.allowRetake - Allow retaking assessment (default: true)
 * @param {Function} baseConfig.onComplete - Callback when assessment is submitted
 * @param {Object} overrides - Optional configuration overrides (default: {})
 *
 * @returns {Object} Assessment instance with render() method
 *
 * @throws {Error} If baseConfig.id is missing
 * @throws {Error} If baseConfig.questions is missing or empty
 * @throws {Error} If stateManager is not available
 * @throws {Error} If any question has invalid configuration
 * @throws {Error} If settings contain invalid values
 *
 * @example
 * const assessment = createAssessment({
 *   id: 'final-exam',
 *   title: 'Final Exam',
 *   questions: [...],
 *   settings: { passingScore: 80 }
 * });
 * assessment.render(containerElement);
 */
export function createAssessment(baseConfig, overrides = {}) {
    // Validate StateManager availability
    if (!stateManager ||
        typeof stateManager.getDomainState !== 'function' ||
        typeof stateManager.setDomainState !== 'function') {
        throw new Error('AssessmentManager: StateManager with domain persistence APIs is required');
    }

    // Merge configuration and delegate to factory (validation happens there)
    const fullConfig = deepMerge({}, baseConfig, overrides);
    return createAssessmentInstance(fullConfig);
}

/**
 * Checks if a specific assessment has been passed.
 *
 * @param {string} assessmentId - The unique ID of the assessment
 * @returns {boolean} True if the assessment has been submitted and passed, false if not initialized or not passed
 * @throws {Error} If assessmentId is not provided
 *
 * @example
 * if (hasPassedAssessment('final-exam')) {
 *   // Unlock next module
 * }
 */
export function hasPassedAssessment(assessmentId) {
    if (!assessmentId) {
        const error = new Error('AssessmentManager.hasPassedAssessment: assessmentId is required');
        logger.error(error.message, { domain: 'assessment', operation: 'hasPassedAssessment', stack: error.stack });
        throw error;
    }

    const domainKey = getAssessmentDomainKey(assessmentId);
    const assessmentDomain = stateManager.getDomainState(domainKey);

    // Assessment hasn't been initialized yet (never visited) - cannot be passed
    if (!assessmentDomain || !assessmentDomain.summary) {
        return false;
    }

    const summary = assessmentDomain.summary;
    return summary.submitted === true && summary.lastResults?.passed === true;
}

/**
 * Checks if an assessment meets its completion requirements.
 * Uses the completionRequirements configuration to determine what's needed.
 *
 * @param {string} assessmentId - The unique ID of the assessment
 * @param {Object} completionRequirements - The completion requirements configuration
 * @param {boolean} completionRequirements.requireSubmission - Whether submission is required
 * @param {boolean} completionRequirements.requirePass - Whether passing is required
 * @returns {boolean} True if the assessment meets its completion requirements, false if not initialized or requirements not met
 * @throws {Error} If assessmentId is not provided
 *
 * @example
 * const requirements = { requireSubmission: true, requirePass: true };
 * if (meetsCompletionRequirements('quiz-1', requirements)) {
 *   // Allow navigation
 * }
 */
export function meetsCompletionRequirements(assessmentId, completionRequirements = {}) {
    if (!assessmentId) {
        const error = new Error('AssessmentManager.meetsCompletionRequirements: assessmentId is required');
        logger.error(error.message, { domain: 'assessment', operation: 'meetsCompletionRequirements', stack: error.stack });
        throw error;
    }

    const domainKey = getAssessmentDomainKey(assessmentId);
    const assessmentDomain = stateManager.getDomainState(domainKey);

    // Assessment hasn't been initialized yet (never visited) - requirements cannot be met
    if (!assessmentDomain || !assessmentDomain.summary) {
        return false;
    }

    const summary = assessmentDomain.summary;

    // Check submission requirement
    if (completionRequirements.requireSubmission && !summary.submitted) {
        return false;
    }

    // Check pass requirement
    if (completionRequirements.requirePass) {
        const passed = summary.lastResults?.passed === true;
        if (!passed) {
            return false;
        }
    }

    return true;
}

/**
 * Checks if all assessments with completion requirements have met those requirements.
 * Used for course completion evaluation.
 *
 * @param {Array<Object>} assessmentSlides - Array of assessment slide entries from CourseHelpers.getSlidesByType('assessment')
 * @returns {boolean} True if all assessments meet their requirements
 * @throws {Error} If assessmentSlides is not an array
 *
 * @example
 * const assessmentSlides = await CourseHelpers.getSlidesByType('assessment');
 * if (allAssessmentsMeetRequirements(assessmentSlides)) {
 *   // Course is complete
 * }
 */
export function allAssessmentsMeetRequirements(assessmentSlides = []) {
    if (!Array.isArray(assessmentSlides)) {
        const error = new Error('AssessmentManager.allAssessmentsMeetRequirements: assessmentSlides must be an array');
        logger.error(error.message, { domain: 'assessment', operation: 'allAssessmentsMeetRequirements', stack: error.stack });
        throw error;
    }

    if (assessmentSlides.length === 0) {
        return true; // No assessments means this criteria is met
    }

    // Filter to only assessments with completion requirements, then check if they meet them
    const assessmentsWithRequirements = assessmentSlides.filter(slide => {
        const reqs = slide.assessment?.completionRequirements;
        return reqs && (reqs.requireSubmission || reqs.requirePass);
    });

    if (assessmentsWithRequirements.length === 0) {
        return true; // No assessments with requirements
    }

    return assessmentsWithRequirements.every(slide =>
        meetsCompletionRequirements(slide.assessmentId, slide.assessment.completionRequirements)
    );
}

/**
 * Gets the score percentage from a submitted assessment.
 *
 * @param {string} assessmentId - The unique ID of the assessment
 * @returns {number|null} Score percentage (0-100) if assessment has been submitted, null otherwise
 * @throws {Error} If assessmentId is not provided
 *
 * @example
 * const score = getAssessmentScore('final-exam');
 * if (score !== null) {
 *   console.log(`Score: ${score}%`);
 * }
 */
export function getAssessmentScore(assessmentId) {
    if (!assessmentId) {
        const error = new Error('AssessmentManager.getAssessmentScore: assessmentId is required');
        logger.error(error.message, { domain: 'assessment', operation: 'getAssessmentScore', stack: error.stack });
        throw error;
    }

    const domainKey = getAssessmentDomainKey(assessmentId);
    const assessmentDomain = stateManager.getDomainState(domainKey);

    // Assessment hasn't been initialized or submitted yet
    if (!assessmentDomain?.summary?.lastResults) {
        return null;
    }

    const scorePercentage = assessmentDomain.summary.lastResults.scorePercentage;
    if (typeof scorePercentage !== 'number' || isNaN(scorePercentage) || scorePercentage < 0 || scorePercentage > 100) {
        return null;
    }
    return scorePercentage;
}
