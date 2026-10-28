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
import { buildResultsActionButton } from './assessment-results.js';
import { shuffleArray } from '../utilities/utilities.js';
import * as AppUI from '../app/AppUI.js';
import { getVisitedSlides } from '../navigation/NavigationState.js';
import { computeQuestionSetPrefixSignatures, computeQuestionSetSignature } from './question-set-signature.js';

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
                    // Index-keyed responses cannot be safely paired with a
                    // filtered question list. Restart only the in-progress
                    // session and preserve the learner's submitted summaries.
                    logger.warn(`[AssessmentFactory] ${errorMessage} Restarting the in-progress attempt safely.`);
                    eventBus.emit('state:recovered', {
                        domain: 'assessment',
                        message: errorMessage,
                        context: { assessmentId, missingIds },
                        action: 'restarted_changed_assessment'
                    });

                    const replacementQuestions = _selectNewQuestions();
                    const existingSession = assessmentState.getSession() || {};
                    assessmentState.updateSession({
                        ...existingSession,
                        currentView: 'intro',
                        currentQuestionIndex: 0,
                        startTime: null,
                        submitted: false,
                        responses: {},
                        selectedQuestions: replacementQuestions.map(question => question.id),
                        reviewReached: false
                    }, 'assessment-state:course-update').catch(error => {
                        logger.error(`Failed to persist safe assessment restart: ${error.message}`, {
                            domain: 'assessment',
                            operation: 'recover-changed-questions',
                            assessmentId,
                            stack: error.stack
                        });
                    });
                    return replacementQuestions;
                }
            }

            return savedQuestionIds
                .map(id => questionMap.get(id))
                .filter(q => q !== undefined); // Filter out any missing questions
        }

        return _selectNewQuestions();
    }

    function _selectNewQuestions() {
        if (config.questionBanks && Array.isArray(config.questionBanks) && config.questionBanks.length > 0) {
            let selected = _selectQuestionsFromBanks(config.questionBanks);
            if (config.settings?.randomizeQuestions) selected = shuffleArray(selected);
            return selected;
        }

        if (config.settings?.randomizeQuestions && Array.isArray(config.questions)) {
            return shuffleArray(config.questions);
        }
        return config.questions || [];
    }

    /**
     * Fixed-order (non-randomized) assessments key in-progress responses by
     * question index without persisting the question order. The session keeps
     * a compact signature of that order instead; this verifies it on resume so
     * a course update that inserted, removed, reordered or retyped questions
     * can never score a saved answer against a different question.
     *
     * - Signature matches: resume as-is.
     * - No signature (session saved before signatures existed): assume the
     *   question set is unchanged, as before, and stamp the current signature.
     * - Questions only appended after the stored set: every stored index still
     *   refers to the same question, so resume and re-stamp.
     * - Anything else: the stored data can't map answers to questions, so the
     *   in-progress attempt restarts at the intro. Attempt number, attempt
     *   counts and submitted results (summary) are preserved.
     *
     * State mutations apply synchronously; only persistence is fire-and-forget.
     * @param {Array} questions - The questions this instance renders, in order
     */
    function _reconcileFixedQuestionSet(questions) {
        if (!assessmentState.hasActiveAttempt()) return;

        const logFailure = error => {
            logger.error(`Failed to persist question set signature: ${error.message}`, {
                domain: 'assessment', operation: 'reconcile-question-set', assessmentId, stack: error.stack
            });
        };

        const prefixSignatures = computeQuestionSetPrefixSignatures(questions);
        const currentSignature = computeQuestionSetSignature(questions);
        const storedSignature = assessmentState.getQuestionSetSignature();

        if (storedSignature === currentSignature) return;

        if (storedSignature === null) {
            assessmentState.setQuestionSetSignature(currentSignature).catch(logFailure);
            return;
        }

        const session = assessmentState.getSession() || {};
        const storedCount = prefixSignatures.indexOf(storedSignature) + 1;
        const responseIndices = Object.keys(session.responses || {}).map(Number);
        const notStarted = responseIndices.length === 0 && (session.currentView || 'intro') === 'intro';
        if (notStarted) {
            // Nothing recorded against the old questions yet
            assessmentState.setQuestionSetSignature(currentSignature).catch(logFailure);
            return;
        }

        const isAppendOnly = storedCount > 0 &&
            responseIndices.every(index => Number.isInteger(index) && index >= 0 && index < storedCount);
        if (isAppendOnly) {
            logger.info(`[AssessmentFactory:${assessmentId}] ${questions.length - storedCount} question(s) were appended since this attempt started; keeping saved answers.`);
            assessmentState.setQuestionSetSignature(currentSignature).catch(logFailure);
            return;
        }

        const message = `Assessment "${assessmentId}" questions were added, removed or reordered since the learner started this attempt. ` +
            'Saved answers cannot be matched to questions, so the in-progress attempt was restarted.';
        logger.warn(`[AssessmentFactory] ${message}`);
        eventBus.emit('state:recovered', {
            domain: 'assessment',
            message,
            context: { assessmentId, storedSignature, currentSignature },
            action: 'restarted_changed_assessment'
        });
        assessmentState.updateSession({
            currentView: 'intro',
            currentQuestionIndex: 0,
            startTime: null,
            submitted: false,
            responses: {},
            reviewReached: false,
            qsig: currentSignature
        }, 'assessment-state:course-update').catch(logFailure);
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

        // Initialize summary if this is first time rendering (fire-and-forget)
        if (!summary) {
            assessmentState.updateSummary({ attempts: 0 }).catch(error => {
                logger.error(`Failed to initialize summary: ${error.message}`, { domain: 'assessment', operation: 'initialize-summary', assessmentId });
            });
            // Use optimistic local value until persist completes
            summary = { attempts: 0 };
        }

        // Returning from remedial content after a failed attempt starts the
        // next attempt (Intro screen). This must happen BEFORE questions are
        // resolved so a randomized assessment draws a new selection, and it
        // persists a real new-attempt session so a reload doesn't fall back to
        // the old results. An attempt already in progress is left alone.
        // We don't increment attempts here; submit does that.
        const fromSlide = context.fromSlide;
        const remedialSlideIds = config.settings?.remedialSlideIds || [];
        const isReturningFromRemedial = fromSlide && remedialSlideIds.includes(fromSlide);
        if (isReturningFromRemedial && summary?.lastResults && !summary.lastResults.passed && !assessmentState.hasActiveAttempt()) {
            const reselect = config.settings?.randomizeOnRetake !== false &&
                Boolean(config.questionBanks || config.settings?.randomizeQuestions);
            const previousSelection = assessmentState.getSelectedQuestions();
            const logFailure = error => {
                logger.error(`Failed to start attempt after remedial review: ${error.message}`, {
                    domain: 'assessment', operation: 'remedial-return', assessmentId, stack: error.stack
                });
            };
            // State mutations apply synchronously (before question resolution
            // below); only persistence is fire-and-forget.
            assessmentState.startNewAttemptSession().catch(logFailure);
            if (!reselect && previousSelection) {
                assessmentState.setSelectedQuestions(previousSelection).catch(logFailure);
            }
        }

        const session = assessmentState.getSession();

        // Resolve active questions for this session
        activeQuestions = _resolveActiveQuestions();

        // Persist every randomized order, including direct question arrays.
        // Responses are keyed by index, so resume must reconstruct the exact
        // same question order or answers can be scored against another item.
        const requiresPersistedOrder = Boolean(
            config.questionBanks || config.settings?.randomizeQuestions
        );
        if (requiresPersistedOrder && !session?.selectedQuestions) {
            assessmentState.setSelectedQuestions(activeQuestions).catch(error => {
                logger.error(`Failed to persist selected questions: ${error.message}`, {
                    domain: 'assessment',
                    operation: 'persist-selected-questions',
                    assessmentId,
                    stack: error.stack
                });
            });
        }
        if (!requiresPersistedOrder) {
            _reconcileFixedQuestionSet(activeQuestions);
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

        // Determine initial view and set footer visibility.
        // An attempt started after the last submission (retake in progress)
        // takes precedence over the previous attempt's results.
        const savedResults = summary?.lastResults;
        if (assessmentState.hasActiveAttempt()) {
            // Restore in-progress session (re-read: question resolution may
            // have restarted a session whose questions changed)
            let currentView = assessmentState.getCurrentView();

            // Guard against a stored question index that no longer exists
            // (e.g. questions removed in a course update).
            if (currentView === 'question') {
                const storedIndex = assessmentState.getCurrentQuestionIndex();
                const lastIndex = activeQuestions.length - 1;
                if (lastIndex < 0) {
                    currentView = 'intro';
                } else if (storedIndex > lastIndex || storedIndex < 0) {
                    logger.warn(`[AssessmentFactory:${assessmentId}] Stored question index ${storedIndex} is out of range (${activeQuestions.length} questions). Clamping.`);
                    assessmentState.setCurrentQuestionIndex(Math.min(Math.max(storedIndex, 0), lastIndex)).catch(error => {
                        logger.error(`Failed to persist clamped question index: ${error.message}`, { domain: 'assessment', operation: 'clamp-question-index', assessmentId });
                    });
                }
            }

            if (currentView === 'question' || currentView === 'review') {
                AppUI.hideFooter();
            } else {
                AppUI.showFooter();
            }
            viewManager.showView(currentView);
            return;
        }

        if (savedResults) {
            // Show completed results (summary only - details not persisted to save space)
            // Prepare display data since we don't have full details anymore
            const displayData = _prepareResumedResultsDisplayData(savedResults, finalConfig);
            AppUI.showFooter();
            viewManager.showView('results', displayData);
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

        // Reconstruct minimal results object for display
        // Note: detailed question-by-question review not available on resume (only summary)
        const resultsForDisplay = {
            attemptNumber: resultsSummary.attemptNumber,
            totalQuestions: resultsSummary.totalQuestions,
            correctCount: resultsSummary.correctCount,
            scorePercentage: resultsSummary.scorePercentage,
            passingScore: resultsSummary.passingScore,
            passed: resultsSummary.passed,
            details: null  // Not available after resume - only summary stats
        };

        // Determine action button with the same rules as live results. Retake
        // limits live under config.settings (attemptsBeforeRemedial,
        // attemptsBeforeRestart, allowRetake, remedialSlideIds).
        const actionButton = buildResultsActionButton(config.settings || {}, {
            passed: resultsSummary.passed,
            currentAttempts,
            visitedSlides: getVisitedSlides() || []
        });

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
