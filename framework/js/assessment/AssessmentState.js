/**
 * @file AssessmentState.js
 * @description Manages all state interactions for a single assessment instance.
 * This module provides a factory to create a state manager for an assessment,
 * encapsulating all interactions with the global StateManager.
 */

import { deepClone } from '../utilities/utilities.js';
import { logger } from '../utilities/logger.js';

/**
 * Utility function to get domain key for an assessment.
 * Centralizes the domain key pattern used throughout the assessment system.
 * @param {string} assessmentId - The unique ID of the assessment
 * @returns {string} The domain key for state manager
 */
function getAssessmentDomainKey(assessmentId) {
    return `assessment_${assessmentId}`;
}

/**
 * Creates a state management object for a single assessment instance.
 * All state is persisted through the stateManager - no in-memory state cache.
 * This ensures a single source of truth and prevents desynchronization.
 *
 * @param {object} config - The assessment's configuration object, must include an `id`.
 * @param {object} stateManager - The global state manager instance.
 * @returns {object} An assessment-specific state management object.
 */
export function createAssessmentState(config, stateManager) {
    if (!config || !config.id) {
        const errorMessage = 'AssessmentState requires a config object with an id';
        logger.error(errorMessage, { domain: 'assessment', operation: 'createAssessmentState' });
        throw new Error(errorMessage);
    }
    if (!stateManager) {
        const errorMessage = `[AssessmentState:${config.id}] StateManager instance is required`;
        logger.error(errorMessage, { domain: 'assessment', operation: 'createAssessmentState', assessmentId: config.id });
        throw new Error(errorMessage);
    }

    const DOMAIN_KEY = getAssessmentDomainKey(config.id);
    const SOURCE = 'assessment-state';

    // Default session structure (used for initialization only)
    const DEFAULT_SESSION = {
        currentView: 'intro', // 'intro', 'question', 'review', 'results'
        currentQuestionIndex: 0,
        startTime: null,
        submitted: false,
        attemptNumber: 1,
        responses: {},
        selectedQuestions: null, // Array of question IDs only (for bank mode) - NOT full configs to save space
        reviewReached: false, // True once user reaches review screen (allows jump to review)
        // qsig (string, non-randomized assessments only): compact signature of
        // the question order the index-keyed responses belong to. Stamped when
        // an attempt starts; left out of the defaults so it costs nothing until set.
    };

    function _getAssessmentDomainState() {
        return stateManager.getDomainState(DOMAIN_KEY) || {};
    }

    async function _setAssessmentDomainState(domainState, source = SOURCE) {
        await stateManager.setDomainState(DOMAIN_KEY, domainState, { source });
    }

    function _ensureSessionExists() {
        const domainState = _getAssessmentDomainState();
        if (!domainState.session) {
            domainState.session = { ...DEFAULT_SESSION };
        }
        return domainState;
    }

    function _resolveAttemptNumber(summaryRecord) {
        if (summaryRecord?.attempts > 0) {
            return summaryRecord.attempts + 1;
        }
        return 1;
    }

    // === Summary Operations ===

    function getSummary() {
        const domainState = _getAssessmentDomainState();
        return domainState.summary ? deepClone(domainState.summary) : null;
    }

    async function updateSummary(patch = {}, source = SOURCE) {
        const domainState = _getAssessmentDomainState();
        const currentSummary = domainState.summary || {};
        domainState.summary = { ...currentSummary, ...patch };
        await _setAssessmentDomainState(domainState, source);
    }

    // === Session Operations ===

    function getSession() {
        const domainState = _getAssessmentDomainState();
        return domainState.session ? deepClone(domainState.session) : null;
    }

    async function initializeSession() {
        const domainState = _ensureSessionExists();
        await _setAssessmentDomainState(domainState, `${SOURCE}:init`);
    }

    async function updateSession(patch = {}, source = SOURCE) {
        const domainState = _ensureSessionExists();
        domainState.session = { ...domainState.session, ...patch };
        await _setAssessmentDomainState(domainState, source);
    }

    async function clearSession(source = `${SOURCE}:clear`) {
        const domainState = _getAssessmentDomainState();
        delete domainState.session;
        await _setAssessmentDomainState(domainState, source);
    }

    /**
     * Replaces the session with a fresh, not-yet-started attempt (intro view).
     * The attempt number is stamped from the summary so the session is
     * recognisably newer than summary.lastResults and takes precedence over
     * the previous attempt's results on resume. Summary (attempt counts,
     * lastResults, attempt history) is left untouched.
     */
    async function startNewAttemptSession(source = `${SOURCE}:new-attempt`) {
        const domainState = _getAssessmentDomainState();
        domainState.session = {
            ...DEFAULT_SESSION,
            responses: {},
            attemptNumber: _resolveAttemptNumber(domainState.summary)
        };
        await _setAssessmentDomainState(domainState, source);
    }

    /**
     * Whether the persisted session is an attempt started after the last
     * submitted result (e.g. a retake in progress). Such a session must win
     * over summary.lastResults when choosing the view to restore.
     * @returns {boolean}
     */
    function hasActiveAttempt() {
        const session = getSession();
        if (!session || session.submitted) return false;

        const lastResults = getSummary()?.lastResults;
        if (!lastResults) return true;

        // Sessions without a newer attempt number are leftovers of the
        // attempt whose results are already stored.
        return (session.attemptNumber || 0) > (lastResults.attemptNumber || 0);
    }

    // === State Property Getters ===

    function getCurrentView() {
        const session = getSession();
        return session?.currentView || 'intro';
    }

    function getCurrentQuestionIndex() {
        const session = getSession();
        return session?.currentQuestionIndex || 0;
    }

    function getStartTime() {
        const session = getSession();
        return session?.startTime || null;
    }

    function isSubmitted() {
        const session = getSession();
        return session?.submitted || false;
    }

    function getAttemptNumber() {
        const session = getSession();
        const summary = getSummary();
        if (session?.attemptNumber) {
            return session.attemptNumber;
        }
        return _resolveAttemptNumber(summary);
    }

    function getLastResults() {
        const summary = getSummary();
        return summary?.lastResults || null;
    }

    // === State Property Setters ===

    async function setCurrentView(view, source = `${SOURCE}:view`) {
        await updateSession({ currentView: view }, source);
    }

    async function setCurrentQuestionIndex(index, source = `${SOURCE}:question`) {
        await updateSession({ currentQuestionIndex: index }, source);
    }

    async function setStartTime(timestamp, source = `${SOURCE}:start`) {
        await updateSession({ startTime: timestamp }, source);
    }

    async function setSubmitted(submitted, source = `${SOURCE}:submit`) {
        await updateSession({ submitted }, source);
    }

    async function setAttemptNumber(attemptNumber, source = `${SOURCE}:attempt`) {
        await updateSession({ attemptNumber }, source);
    }

    // === Response Operations ===

    function getResponse(questionIndex) {
        const session = getSession();
        if (!session?.responses) {
            return null;
        }
        const key = String(questionIndex);
        if (!Object.prototype.hasOwnProperty.call(session.responses, key)) {
            return null;
        }
        return deepClone(session.responses[key]);
    }

    async function saveResponse(questionIndex, response) {
        const key = String(questionIndex);
        const storedResponse = response === undefined ? null : deepClone(response);

        const domainState = _ensureSessionExists();
        domainState.session.responses = domainState.session.responses || {};
        domainState.session.responses[key] = storedResponse;

        await _setAssessmentDomainState(domainState, `${SOURCE}:response`);
    }

    // === Question Set Signature Operations ===

    /**
     * Signature of the question order the session's index-keyed responses
     * were recorded against (see question-set-signature.js). Null for
     * sessions saved before signatures existed.
     * @returns {string|null}
     */
    function getQuestionSetSignature() {
        const session = getSession();
        return typeof session?.qsig === 'string' ? session.qsig : null;
    }

    async function setQuestionSetSignature(signature, source = `${SOURCE}:question-set`) {
        await updateSession({ qsig: signature }, source);
    }

    // === Selected Questions Operations ===

    function getSelectedQuestions() {
        const session = getSession();
        return session?.selectedQuestions ? deepClone(session.selectedQuestions) : null;
    }

    async function setSelectedQuestions(questions) {
        const domainState = _ensureSessionExists();
        if (questions === null) {
            domainState.session.selectedQuestions = null;
            await _setAssessmentDomainState(domainState, `${SOURCE}:selected-questions`);
            return;
        }

        if (!Array.isArray(questions)) {
            throw new Error(`[AssessmentState:${config.id}] setSelectedQuestions expects an array or null`);
        }

        // CRITICAL: Only store question IDs to meet SCORM suspend_data size limits
        // Many LMS implementations restrict cmi.suspend_data to 4096 characters
        // Storing full question configs (~7KB) exceeds this limit and causes SCORM error 409
        // Question IDs (~100-200 bytes) stay well within limits
        // Full configs are reconstructed from slide config on resume
        domainState.session.selectedQuestions = questions.map((q, index) => {
            if (typeof q === 'string') {
                return q;
            }
            if (q && typeof q.id === 'string') {
                return q.id;
            }
            throw new Error(`[AssessmentState:${config.id}] selectedQuestions[${index}] must be a question object with id or a string ID`);
        });
        await _setAssessmentDomainState(domainState, `${SOURCE}:selected-questions`);
    }

    async function archiveDiscardedResponses(questionConfigs, responses) {
        // OPTIMIZATION: Only archive if feature is enabled in config
        // Defaults to disabled to reduce suspend_data bloat
        const enableArchive = config.settings?.archiveDiscardedAttempts || false;
        
        if (!enableArchive) {
            logger.debug(`[AssessmentState:${config.id}] Discarded attempt archive disabled (to enable, set settings.archiveDiscardedAttempts: true)`);
            return;
        }
        
        const domainState = _getAssessmentDomainState();
        
        // Create archive array if it doesn't exist
        if (!domainState.discardedAttempts) {
            domainState.discardedAttempts = [];
        }
        
        // Archive current attempt data (minimal - only IDs and responses, not full question text)
        const archiveEntry = {
            timestamp: Date.now(),
            attemptNumber: getAttemptNumber(),
            // OPTIMIZATION: Store only question IDs and metadata, not full text
            questions: questionConfigs.map(q => ({
                id: q.id,
                type: q.type,
                bankId: q._meta?.bankId,
                originalIndex: q._meta?.originalIndex
            })),
            responses: deepClone(responses)
        };
        
        domainState.discardedAttempts.push(archiveEntry);
        
        // Limit archive size to prevent SCORM data bloat (keep last 5)
        if (domainState.discardedAttempts.length > 5) {
            domainState.discardedAttempts = domainState.discardedAttempts.slice(-5);
        }
        
        await _setAssessmentDomainState(domainState, `${SOURCE}:archive`);
        logger.debug(`[AssessmentState:${config.id}] Archived discarded attempt #${archiveEntry.attemptNumber}`);
    }

    function getDiscardedAttempts() {
        const domainState = _getAssessmentDomainState();
        return domainState.discardedAttempts ? deepClone(domainState.discardedAttempts) : [];
    }

    return {
        // Summary operations
        getSummary,
        updateSummary,

        // Session operations
        getSession,
        initializeSession,
        updateSession,
        clearSession,
        startNewAttemptSession,
        hasActiveAttempt,

        // State property getters
        getCurrentView,
        getCurrentQuestionIndex,
        getStartTime,
        isSubmitted,
        getAttemptNumber,
        getLastResults,

        // State property setters
        setCurrentView,
        setCurrentQuestionIndex,
        setStartTime,
        setSubmitted,
        setAttemptNumber,

        // Response operations
        getResponse,
        saveResponse,

        // Question set signature (non-randomized resume safety)
        getQuestionSetSignature,
        setQuestionSetSignature,

        // Selected questions operations
        getSelectedQuestions,
        setSelectedQuestions,

        // Discarded attempts archive
        archiveDiscardedResponses,
        getDiscardedAttempts,
    };
}
