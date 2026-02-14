/**
 * @file AssessmentFactory.js
 * @description Internal factory for creating assessment instances.
 * Encapsulates the State-UI-Actions wiring pattern.
 *
 * This file should NOT be imported directly by course authors.
 * Use the public API in assessment-manager.js instead.
 */

import { eventBus } from '../core/event-bus.js';
import stateManager from '../state/index.js';
import { createAssessmentState } from './AssessmentState.js';
import { createAssessmentUI } from './AssessmentUI.js';
import { createAssessmentActions } from './AssessmentActions.js';
import { shuffleArray } from '../utilities/utilities.js';
import * as AppUI from '../app/AppUI.js';
import { getVisitedSlides } from '../navigation/NavigationState.js';

// Import from the central interaction type catalog
// This provides unified access to built-in and custom interaction types
import { getCreator, getMetadata, isRegistered } from '../core/interaction-catalog.js';
import { logger } from '../utilities/logger.js';

/**
 * Get interaction type info from the registry.
 * Returns { creator, metadata } or null if type is not registered.
 * @param {string} type - Interaction type name
 * @returns {{ creator: function, metadata: object }|null}
 */
function getInteractionTypeInfo(type) {
    if (!isRegistered(type)) {
        return null;
    }
    return {
        creator: getCreator(type),
        metadata: getMetadata(type)
    };
}

/**
 * Selects questions from question banks according to configuration.
 * @private
 * @param {Array} questionBanks - Array of bank configurations
 * @returns {Array} Selected questions with metadata
 */
function _selectQuestionsFromBanks(questionBanks) {
    const selectedQuestions = [];

    questionBanks.forEach(bank => {
        const { id: bankId, questions, selectCount } = bank;

        // Handle 'all' case - select all questions without randomization
        if (selectCount === 'all') {
            questions.forEach((q, idx) => {
                selectedQuestions.push({
                    ...q,
                    _meta: {
                        bankId,
                        originalIndex: idx
                    }
                });
            });
            return;
        }

        // Randomize and select N questions
        const shuffled = shuffleArray(questions);
        const selected = shuffled.slice(0, selectCount);

        selected.forEach((q, _idx) => {
            const originalIndex = questions.indexOf(q);
            selectedQuestions.push({
                ...q,
                _meta: {
                    bankId,
                    originalIndex
                }
            });
        });
    });

    return selectedQuestions;
}

/**
 * Required interface for all question instances.
 * This documents the contract that interaction components must fulfill.
 */
const REQUIRED_METHODS = {
    'render': 'function',           // render(container) - Renders question to DOM
    'getResponse': 'function',      // getResponse() - Returns current user response
    'setResponse': 'function',      // setResponse(value) - Sets response programmatically
    'evaluate': 'function',         // evaluate(response) - Returns {correct: boolean}
};

/**
 * Optional methods that interaction components may implement:
 * - reset(): function - Clears user input
 * - checkAnswer(): function - Shows immediate feedback
 * - showHint(): function - Displays hint to user
 * - getCorrectAnswer(): function - Returns the correct answer for automation/review
 */

/**
 * Validates that a question instance implements the required interface.
 * @private
 * @throws {Error} If any required method is missing
 */
function _validateQuestionInstance(instance, questionConfig, assessmentId) {
    const errors = [];

    for (const [methodName, expectedType] of Object.entries(REQUIRED_METHODS)) {
        if (typeof instance[methodName] !== expectedType) {
            errors.push(`Missing required method '${methodName}' (expected ${expectedType}, got ${typeof instance[methodName]})`);
        }
    }

    if (errors.length > 0) {
        const errorMessage = `[AssessmentFactory:${assessmentId}] Question type '${questionConfig.type}' (ID: ${questionConfig.id}) has invalid interface:\n  - ${errors.join('\n  - ')}`;
        logger.error(errorMessage, { domain: 'assessment', operation: 'validateQuestionInstance', assessmentId, questionType: questionConfig.type, questionId: questionConfig.id });
        throw new Error(errorMessage);
    }
}

/**
 * Creates a question instance with SCORM persistence methods.
 * Attaches metadata to the instance for type-specific formatting.
 * @private
 */
function _createQuestionInstance(questionConfig, index, assessmentState, assessmentId) {
    const type = questionConfig.type;
    const typeInfo = getInteractionTypeInfo(type);

    // This should never happen because validation happens first, but guard anyway
    if (!typeInfo) {
        const errorMessage = `[AssessmentFactory:${assessmentId}] Unknown question type: ${type}. Ensure it is registered in the interaction registry.`;
        logger.error(errorMessage, { domain: 'assessment', operation: 'createQuestionInstance', assessmentId, questionType: type });
        throw new Error(errorMessage);
    }

    // Create base instance
    // Assessments use controlled mode: no Check Answer buttons, centralized evaluation/SCORM recording
    // For immediate feedback, use standalone interactions in regular slides instead
    const baseInstance = typeInfo.creator({ ...questionConfig, controlled: true });

    // Validate interface
    _validateQuestionInstance(baseInstance, questionConfig, assessmentId);

    // Wrap with SCORM persistence layer and attach metadata
    return {
        ...baseInstance,
        metadata: typeInfo.metadata, // Attach metadata for AssessmentUI/Actions to use
        async persistToSCORM() {
            const response = baseInstance.getResponse();
            await assessmentState.saveResponse(index, response);
        },
        restoreFromSCORM() {
            const savedResponse = assessmentState.getResponse(index);
            if (savedResponse !== null && savedResponse !== undefined) {
                baseInstance.setResponse(savedResponse);
            }
        }
    };
}

/**
 * Creates a complete assessment instance with all wiring.
 * Follows the State-UI-Actions pattern.
 *
 * @param {Object} config - Assessment configuration (validated by runtime-linter in dev mode)
 * @returns {Object} Assessment instance with render() method
 * @throws {Error} If critical configuration properties are missing
 */
export function createAssessmentInstance(config) {
    // Config validation done by runtime-linter in dev mode
    // Runtime: only validate that required properties exist (quick check)
    if (!config.id) {
        const error = new Error('Assessment ID required');
        logger.error(error.message, { domain: 'assessment', operation: 'createAssessmentInstance' });
        throw error;
    }
    if (!config.questions && !config.questionBanks) {
        const error = new Error(`Assessment '${config.id}' needs questions or questionBanks`);
        logger.error(error.message, { domain: 'assessment', operation: 'createAssessmentInstance', assessmentId: config.id });
        throw error;
    }

    const assessmentId = config.id;

    // Initialize State layer
    const assessmentState = createAssessmentState(config, stateManager);

    // Determine active questions (from banks or direct config)
    let activeQuestions = config.questions || [];
    let questionInstances = [];
    let finalConfig = config;

    /**
     * Resolves which questions to use for this assessment session.
     * Priority:
     * 1. Persisted selected questions (resume in-progress session)
     * 2. Question banks (new session with randomization)
     * 3. Direct questions array (legacy/simple mode)
     * 
     * In dev mode, throws if persisted question IDs don't match current config.
     * In prod mode, filters out missing questions and continues gracefully.
     */
    function _resolveActiveQuestions() {
        const savedQuestionIds = assessmentState.getSelectedQuestions();

        if (savedQuestionIds && Array.isArray(savedQuestionIds)) {
            // OPTIMIZATION FIX: Reconstruct full question objects from saved IDs
            // This is needed because we now only store IDs to save suspend_data space
            const allQuestions = _getAllAvailableQuestions();
            const questionMap = new Map(allQuestions.map(q => [q.id, q]));
            
            // Check for missing questions (course structure changed)
            const missingIds = savedQuestionIds.filter(id => !questionMap.has(id));
            
            if (missingIds.length > 0) {
                const errorMessage = `Assessment "${assessmentId}" has ${missingIds.length} stored question ID(s) that no longer exist: ${missingIds.join(', ')}. ` +
                    'The assessment questions have changed since the learner started.';
                
                if (import.meta.env.DEV) {
                    // Dev mode: FAIL FAST to help developers catch stale data issues
                    const error = new Error(`[AssessmentFactory] ${errorMessage}`);
                    logger.error(errorMessage, {
                        domain: 'assessment', operation: 'resolve-questions', stack: error.stack,
                        assessmentId, missingIds, storedIds: savedQuestionIds,
                        availableIds: Array.from(questionMap.keys())
                    });
                    throw error;
                } else {
                    // Production mode: Log warning and filter out missing questions
                    // Also emit event so course can potentially track this
                    logger.warn(`[AssessmentFactory] ${errorMessage} Continuing with available questions.`);
                    eventBus.emit('state:recovered', {
                        domain: 'assessment',
                        message: errorMessage,
                        context: { assessmentId, missingIds },
                        action: 'filtered_missing_questions'
                    });
                }
            }

            return savedQuestionIds
                .map(id => questionMap.get(id))
                .filter(q => q !== undefined); // Filter out any missing questions
        }

        if (config.questionBanks && Array.isArray(config.questionBanks) && config.questionBanks.length > 0) {
            // New session with banks: select and optionally randomize
            let selected = _selectQuestionsFromBanks(config.questionBanks);

            if (config.settings?.randomizeQuestions) {
                selected = shuffleArray(selected);
            }

            return selected;
        }

        // Direct mode: use questions array as-is
        if (config.settings?.randomizeQuestions && Array.isArray(config.questions)) {
            return shuffleArray(config.questions);
        }

        return config.questions || [];
    }

    /**
     * Helper to get all available questions from either banks or direct questions array
     */
    function _getAllAvailableQuestions() {
        if (config.questionBanks && Array.isArray(config.questionBanks)) {
            return config.questionBanks.flatMap(bank => bank.questions || []);
        }
        return config.questions || [];
    }

    // Create question instances with SCORM wrappers
    function _initializeQuestionInstances(questions) {
        return questions.map((q, i) =>
            _createQuestionInstance(q, i, assessmentState, assessmentId)
        );
    }

    // Track view manager and actions (initialized on render)
    let viewManager = null;
    let assessmentActions = null;
    let _currentContainer = null;

    /**
     * Renders the assessment to the target container.
     * @param {HTMLElement} targetContainer - DOM element to render into
     * @param {Object} context - Context from ViewManager (contains fromSlide)
     */
    function render(targetContainer, context = {}) {
        if (!targetContainer) {
            const errorMessage = `[AssessmentFactory:${assessmentId}] targetContainer is required for render()`;
            logger.error(errorMessage, { domain: 'assessment', operation: 'render', assessmentId });
            throw new Error(errorMessage);
        }

        targetContainer.className = 'assessment-navigator';
        _currentContainer = targetContainer;

        // Load persisted state
        let summary = assessmentState.getSummary();
        const session = assessmentState.getSession();

        // Initialize summary if this is first time rendering (fire-and-forget)
        if (!summary) {
            assessmentState.updateSummary({ attempts: 0 }).catch(error => {
                logger.error(`Failed to initialize summary: ${error.message}`, { domain: 'assessment', operation: 'initialize-summary', assessmentId });
            });
            // Use optimistic local value until persist completes
            summary = { attempts: 0 };
        }

        // Resolve active questions for this session
        activeQuestions = _resolveActiveQuestions();

        // Persist selection if this is a new bank-based session (fire-and-forget)
        if (config.questionBanks && !session?.selectedQuestions) {
            assessmentState.setSelectedQuestions(activeQuestions).catch(error => {
                logger.error(`Failed to persist selected questions: ${error.message}`, { domain: 'assessment', operation: 'persist-selected-questions', assessmentId });
            });
        }

        // Create question instances based on active questions
        questionInstances = _initializeQuestionInstances(activeQuestions);

        // Update config with active questions for UI/Actions layers
        finalConfig = { ...config, questions: activeQuestions };

        // Initialize UI and Actions with immutable references
        // If questions need to change (retake with randomization), slide creates new assessment instance
        const assessmentUIWithQuestions = createAssessmentUI(finalConfig, assessmentState, questionInstances);
        viewManager = assessmentUIWithQuestions.initialize(targetContainer);
        assessmentActions = createAssessmentActions(
            assessmentState,
            viewManager,
            questionInstances,
            finalConfig,
            assessmentUIWithQuestions  // Pass full UI object for modal access
        );
        assessmentActions.initialize(targetContainer);

        // Check for auto-restart from remedial
        const fromSlide = context.fromSlide;
        const remedialSlideIds = config.settings?.remedialSlideIds || [];
        const isReturningFromRemedial = fromSlide && remedialSlideIds.includes(fromSlide);

        if (isReturningFromRemedial && summary?.lastResults && !summary.lastResults.passed) {
             // Clear session to force a fresh start (Intro screen)
             // We don't increment attempts here; handleStart does that when user clicks Start
             assessmentState.clearSession().then(() => {
                 AppUI.showFooter();
                 viewManager.showView('intro');
             });
             return;
        }

        // Determine initial view and set footer visibility
        const savedResults = summary?.lastResults;
        if (savedResults) {
            // Show completed results (summary only - details not persisted to save space)
            // Prepare display data since we don't have full details anymore
            const displayData = _prepareResumedResultsDisplayData(savedResults, finalConfig);
            AppUI.showFooter();
            viewManager.showView('results', displayData);
            return;
        }

        if (session && !session.submitted) {
            // Restore in-progress session
            const currentView = session.currentView || 'intro';
            if (currentView === 'question' || currentView === 'review') {
                AppUI.hideFooter();
            } else {
                AppUI.showFooter();
            }
            viewManager.showView(currentView);
            return;
        }

        // Start fresh - intro view shows footer
        AppUI.showFooter();
        viewManager.showView('intro');
    }

    /**
     * Prepares display data for results screen when resuming from saved summary.
     * Since we only persist summary stats (not full details), reconstruct what's needed.
     * @param {Object} resultsSummary - Minimal summary saved in suspend_data
     * @param {Object} config - Assessment configuration
     * @returns {Object} Display data for results screen
     */
    function _prepareResumedResultsDisplayData(resultsSummary, config) {
        const summary = assessmentState.getSummary();
        const currentAttempts = summary?.attempts || 0;
        const { attemptsBeforeRemedial, attemptsBeforeRestart, allowRetake, settings: _settings } = config;

        // Reconstruct minimal results object for display
        // Note: detailed question-by-question review not available on resume (only summary)
        const resultsForDisplay = {
            attemptNumber: resultsSummary.attemptNumber,
            totalQuestions: resultsSummary.totalQuestions,
            correctCount: resultsSummary.correctCount,
            scorePercentage: resultsSummary.scorePercentage,
            passed: resultsSummary.passed,
            details: null  // Not available after resume - only summary stats
        };

        // Determine action button (same logic as in AssessmentActions)
        let actionButton = null;

        if (attemptsBeforeRestart && currentAttempts >= attemptsBeforeRestart) {
            actionButton = {
                type: 'restart',
                action: 'restart-course',
                label: 'Restart Course',
                message: `You've completed ${currentAttempts} attempt(s). You must restart the course to try again.`,
                messageType: 'error'
            };
        } else {
            // Check remedial logic
            let showRemedial = false;
            if (attemptsBeforeRemedial && currentAttempts >= attemptsBeforeRemedial && !resultsSummary.passed) {
                const remedialSlideIds = config.settings?.remedialSlideIds || (config.settings?.remedialSlideId ? [config.settings.remedialSlideId] : []);
                
                // Check if remedial content has already been viewed
                const visitedSlides = getVisitedSlides() || [];
                
                const remedialViewed = remedialSlideIds.length > 0 && remedialSlideIds.every(id => visitedSlides.includes(id));

                if (remedialSlideIds.length > 0 && !remedialViewed) {
                    showRemedial = true;
                    actionButton = {
                        type: 'remedial',
                        action: 'go-to-remedial',
                        label: 'Review Content',
                        message: `Please review the content before attempting again (Attempt ${currentAttempts}/${attemptsBeforeRestart || '∞'}).`,
                        messageType: 'warning',
                        attemptsMessage: `Attempts: ${currentAttempts}${attemptsBeforeRestart ? `/${attemptsBeforeRestart}` : ''}`
                    };
                }
            }
            
            // Fallback to standard retake if remedial not shown
            if (!showRemedial && allowRetake !== false && !resultsSummary.passed) {
                actionButton = {
                    type: 'retake',
                    action: 'retake',
                    label: 'Retake Assessment',
                    attemptsMessage: `Attempts: ${currentAttempts}${attemptsBeforeRestart ? `/${attemptsBeforeRestart}` : ''}`
                };
            }
        }

        return {
            ...resultsForDisplay,
            actionButton,
            timeSpent: null  // Time data not preserved after session ends
        };
    }

    return {
        render,
    };
}
