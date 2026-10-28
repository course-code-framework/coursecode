/**
 * @file cmi5-driver.js
 * @description cmi5 driver implementation using @xapi/cmi5 package.
 * Extends HttpDriverBase for shared mock state, suspend data, and semantic interface.
 *
 * The @xapi/cmi5 package handles:
 * - Authentication via fetch URL
 * - Launch data retrieval
 * - cmi5-defined statements (Initialized, Completed, Passed, Failed, Terminated)
 * - Statement timing and duration calculations
 *
 * This driver adds:
 * - xAPI statement methods (objectives, interactions, assessments, slides)
 * - suspend_data persistence via xAPI State API
 * - Bookmark persistence via xAPI State API
 * - Emergency save via authenticated keepalive fetch
 */

import { HttpDriverBase } from './http-driver-base.js';
import { logger } from '../utilities/logger.js';

// @xapi/cmi5 is dynamically imported in initialize() to avoid bundling for non-cmi5 builds

// State document IDs for xAPI State API
const STATE_ID_SUSPEND_DATA = 'https://w3id.org/xapi/cmi5/state/suspend_data';
const STATE_ID_BOOKMARK = 'https://w3id.org/xapi/cmi5/state/bookmark';

// cmi5-defined statement vocabulary (mirrors @xapi/cmi5) for unload-time statements
const CMI5_CATEGORY = { id: 'https://w3id.org/xapi/cmi5/context/categories/cmi5' };
const MOVE_ON_CATEGORY = { id: 'https://w3id.org/xapi/cmi5/context/categories/moveon' };
const MASTERY_SCORE_EXTENSION = 'https://w3id.org/xapi/cmi5/context/extensions/masteryscore';
const LIFECYCLE_VERBS = {
    completed: { id: 'http://adlnet.gov/expapi/verbs/completed', display: { 'en-US': 'completed' } },
    passed: { id: 'http://adlnet.gov/expapi/verbs/passed', display: { 'en-US': 'passed' } },
    failed: { id: 'http://adlnet.gov/expapi/verbs/failed', display: { 'en-US': 'failed' } },
    terminated: { id: 'http://adlnet.gov/expapi/verbs/terminated', display: { 'en-US': 'terminated' } }
};

// Browsers cap the combined body size of in-flight keepalive requests at 64KiB.
const KEEPALIVE_BUDGET_BYTES = 60 * 1024;

function byteLength(text) {
    return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length * 3;
}

function isClientRejection(error) {
    const status = error?.response?.status ?? error?.status;
    return Number.isInteger(status) && status >= 400 && status < 500;
}

function sanitizeInitializationMessage(message) {
    return String(message || 'Unknown cmi5 initialization error')
        .replace(/(https?:\/\/[^\s?#]+)\?[^\s)]+/gi, '$1?[redacted]')
        .replace(/(Basic\s+)[A-Za-z0-9+/=._-]+/gi, '$1[redacted]');
}

/**
 * Classify cmi5 initialization failures without exposing launch credentials.
 * Only explicit token-expiry errors are treated as an expired session; generic
 * HTTP 400 and network/fetch failures remain actionable initialization errors.
 */
export function classifyCmi5InitializationError(error) {
    const status = error?.response?.status ?? error?.status ?? null;
    const code = error?.code || null;
    const message = sanitizeInitializationMessage(error?.message);
    const explicitlyExpired = /(?:fetch|token|credential).{0,50}(?:expired|already used|invalid)|(?:expired|already used|invalid).{0,50}(?:fetch|token|credential)/i.test(message);
    const networkFailure = code === 'ERR_NETWORK' ||
        code === 'ECONNABORTED' ||
        /failed to fetch|network error|cors|load failed/i.test(message);

    if (explicitlyExpired) {
        return {
            category: 'session_expired',
            status,
            code,
            message: 'Your session has expired. Please return to the learning management system to resume this course.',
            userFacing: true,
        };
    }

    if (networkFailure) {
        return {
            category: 'network',
            status,
            code,
            message: 'Unable to contact the LMS cmi5 service. Check the LMS launch endpoint, CORS policy, and network connectivity.',
            userFacing: false,
        };
    }

    if (status === 401 || status === 403) {
        return {
            category: 'authentication',
            status,
            code,
            message: `The LMS rejected cmi5 authentication (HTTP ${status}).`,
            userFacing: false,
        };
    }

    if (status) {
        return {
            category: 'http',
            status,
            code,
            message: `The LMS rejected cmi5 initialization (HTTP ${status}): ${message}`,
            userFacing: false,
        };
    }

    return {
        category: 'unknown',
        status,
        code,
        message,
        userFacing: false,
    };
}

/** Return a safe cmi5 return URL, or null for invalid/non-web protocols. */
export function getSafeCmi5ReturnUrl(value) {
    if (!value || typeof value !== 'string') return null;

    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch {
        return null;
    }
}

// =============================================================================
// cmi5 Driver Class
// =============================================================================

export class Cmi5Driver extends HttpDriverBase {
    constructor() {
        super();
        this._cmi5 = null; // @xapi/cmi5 instance

        // Track what statements we've sent (persisted for resume)
        this._sentComplete = false;
        this._sentResult = false;
        this._sentSuccessStatus = null;
        this._outcomeDirty = false;
        this._outcomeFlush = null;
        this._resultSkipLogged = null;

        // Outcome statements sent during an unload whose delivery could not be
        // confirmed. If the LMS rejects the resend on the next launch as a
        // duplicate, the outcome is treated as already recorded.
        this._unconfirmedOutcomes = null;
    }

    // =========================================================================
    // Interface Implementation
    // =========================================================================

    getFormat() {
        return 'cmi5';
    }

    getCapabilities() {
        return {
            supportsObjectives: true,    // via suspend_data
            supportsInteractions: true,  // via suspend_data
            supportsComments: true,      // via suspend_data
            supportsEmergencySave: true,
            maxSuspendDataBytes: 0,      // unlimited (LRS-dependent)
            asyncCommit: true
        };
    }

    /**
     * Initializes the cmi5 connection.
     */
    async initialize() {
        if (this._isConnected) {
            return true;
        }

        // Check for cmi5 dev API (stub player or standalone preview)
        // Search current window and parent frame (stub player injects on parent)
        // Try/catch guards against DOMException in cross-origin iframes
        let devApi = typeof window !== 'undefined' && window.cmi5;
        if (!devApi && typeof window !== 'undefined' && window.parent !== window) {
            try { devApi = window.parent.cmi5; } catch (_e) { /* cross-origin parent */ }
        }
        if (devApi) {
            logger.info('[Cmi5Driver] Using cmi5 development API');
            this._mock = true;
            this._devApi = devApi;
            this._devApi.initialize();
            this._loadMockState();
            this._isConnected = true;
            this._logMockStatement('initialized', { verb: 'initialized' });
            return true;
        }

        // Check for cmi5 launch parameters
        if (!this._hasLaunchParameters()) {
            if (import.meta.env.DEV) {
                logger.info('[Cmi5Driver] No cmi5 launch parameters. Using localStorage mock.');
                this._mock = true;
                this._loadMockState();
                this._isConnected = true;
                this._logMockStatement('initialized', { verb: 'initialized' });
                return true;
            }
            throw new Error('[Cmi5Driver] No cmi5 launch parameters detected. Expected fetch, endpoint, actor, registration, and activityId URL parameters.');
        }

        // Production mode: dynamically import @xapi/cmi5
        try {
            const Cmi5Module = await import('@xapi/cmi5');
            const Cmi5 = Cmi5Module.default || Cmi5Module.Cmi5 || Cmi5Module;

            if (!Cmi5 || typeof Cmi5 !== 'function') {
                throw new Error('Failed to load Cmi5 class from @xapi/cmi5 module');
            }

            if (typeof Cmi5.instance !== 'undefined') {
                this._cmi5 = Cmi5.instance;
            } else if (typeof Cmi5.isCmiAvailable !== 'undefined' && Cmi5.isCmiAvailable) {
                this._cmi5 = new Cmi5();
            } else {
                this._cmi5 = new Cmi5(this._getLaunchParametersFromURL());
            }

            await this._cmi5.initialize();
            await this._prefetchState();

            this._isConnected = true;
            logger.debug('[Cmi5Driver] Initialized via @xapi/cmi5');
            return true;

        } catch (error) {
            if (import.meta.env.DEV) {
                logger.warn('[Cmi5Driver] @xapi/cmi5 unavailable, using mock mode:', error.message);
                this._mock = true;
                this._loadMockState();
                this._isConnected = true;
                return true;
            }

            const diagnostic = classifyCmi5InitializationError(error);
            const logContext = {
                domain: 'cmi5',
                operation: 'initialize',
                category: diagnostic.category,
                status: diagnostic.status,
                code: diagnostic.code,
                userFacing: diagnostic.userFacing,
            };

            if (diagnostic.userFacing) {
                logger.warn('[Cmi5Driver] Session expired during initialization', logContext);
            } else {
                logger.error('[Cmi5Driver] Initialization failed', logContext);
            }

            const initializationError = new Error(`[Cmi5Driver] ${diagnostic.message}`);
            initializationError.code = diagnostic.code;
            initializationError.httpStatus = diagnostic.status;
            initializationError.cmi5Category = diagnostic.category;
            if (diagnostic.userFacing) {
                initializationError.isSessionExpired = true;
                initializationError.userFacing = true;
            }
            throw initializationError;
        }
    }

    /**
     * Terminates the cmi5 session.
     */
    async terminate() {
        if (!this._isConnected || this._isTerminated) {
            return true;
        }

        if (this._mock) {
            return this._terminateMock();
        }

        // State and outcome failures are logged but must never prevent the
        // Terminated statement: without it the LMS keeps the session open.
        let persistError = null;
        try {
            await this._persistState();
        } catch (error) {
            persistError = error;
            logger.error('[Cmi5Driver] Failed to persist state before termination:', error);
        }

        try {
            await this._flushOutcomeStatements();
        } catch (error) {
            logger.error('[Cmi5Driver] Failed to send outcome statements before termination; sending Terminated anyway:', error);
        }

        if (persistError) {
            try {
                await this._persistState();
            } catch (error) {
                logger.error('[Cmi5Driver] Retry of state persistence before termination failed:', error);
            }
        }

        try {
            const returnURL = this._cmi5.getLaunchData?.()?.returnURL || null;
            await this._cmi5.terminate();
            logger.debug('[Cmi5Driver] Sent Terminated statement');

            this._isTerminated = true;
            this._navigateToReturnUrl(returnURL);
            return true;

        } catch (error) {
            logger.error('[Cmi5Driver] Terminate failed:', error);
            throw new Error(`[Cmi5Driver] Termination failed: ${error.message}`);
        }
    }

    /**
     * Emergency save using authenticated keepalive requests for page unload scenarios.
     */
    emergencySave() {
        if (this._mock || this._isTerminated) {
            if (this._mock) {
                this._saveMockState();
            }
            return;
        }

        if (!this._cmi5) {
            logger.warn('[Cmi5Driver] emergencySave called but cmi5 not initialized');
            return;
        }

        const params = this._cmi5.getLaunchParameters();
        if (!params) {
            logger.warn('[Cmi5Driver] emergencySave: No launch parameters available');
            return;
        }

        const endpoint = params.endpoint?.replace(/\/$/, '');
        const authToken = this._cmi5.getAuthToken?.();
        if (!endpoint || !authToken) {
            logger.warn('[Cmi5Driver] Emergency save unavailable because the authenticated LRS connection is incomplete', {
                domain: 'cmi5',
                operation: 'emergencySave',
                hasEndpoint: Boolean(endpoint),
                hasAuthToken: Boolean(authToken)
            });
            return;
        }
        const registration = params.registration;
        const activityId = encodeURIComponent(params.activityId);
        const agent = encodeURIComponent(JSON.stringify(params.actor));
        const stateUrl = stateId =>
            `${endpoint}/activities/state?stateId=${encodeURIComponent(stateId)}&activityId=${activityId}&agent=${agent}&registration=${registration}`;

        // Requests in priority order within the shared keepalive budget:
        // pending Completed/Passed/Failed plus Terminated, then the
        // bookmark, then suspend_data (the largest and least critical).
        const requests = [];
        const { statements, outcomes } = this._buildUnloadStatements(params);
        requests.push({ label: 'statements', method: 'POST', url: `${endpoint}/statements`, body: JSON.stringify(statements) });

        if (outcomes.complete || outcomes.result) {
            this._unconfirmedOutcomes = outcomes;
            this._bookmarkDirty = true;
        }
        if (this._bookmarkDirty) {
            requests.push({ label: 'bookmark', method: 'PUT', url: stateUrl(STATE_ID_BOOKMARK), body: JSON.stringify(this._bookmarkState()) });
        }
        if (this._suspendDataDirty && this._suspendDataCache !== null) {
            requests.push({ label: 'suspend_data', method: 'PUT', url: stateUrl(STATE_ID_SUSPEND_DATA), body: JSON.stringify(this._suspendDataCache) });
        }

        let budget = KEEPALIVE_BUDGET_BYTES;
        for (const request of requests) {
            const size = byteLength(request.body);
            const keepalive = size <= budget;
            if (keepalive) {
                budget -= size;
            } else {
                logger.warn(`[Cmi5Driver] Emergency save: ${request.label} (${size} bytes) exceeds the remaining keepalive budget; sending without keepalive`);
            }
            this._sendAuthenticatedUnloadRequest({ ...request, authToken, keepalive });
        }

        // Terminated has been sent; nothing more may be sent in this session.
        this._isTerminated = true;
    }

    /**
     * Builds the cmi5-defined statements still owed at unload, ending with
     * Terminated. Mirrors the @xapi/cmi5 statement shapes.
     * @returns {{ statements: object[], outcomes: { complete: boolean, result: string|null } }}
     */
    _buildUnloadStatements(params) {
        const launchData = this._cmi5.getLaunchData?.() || {};
        const initializedAt = this._cmi5.getInitializedDate?.();
        const elapsedMs = initializedAt ? Date.now() - new Date(initializedAt).getTime() : 0;
        const duration = `PT${Math.max(0, elapsedMs / 1000).toFixed(2)}S`;
        const masteryScore = this._getMasteryScore();
        const statements = [];
        const outcomes = { complete: false, result: null };

        const lifecycle = (verb, result, extra = {}) => {
            const base = launchData.contextTemplate || {};
            return {
                ...(typeof crypto !== 'undefined' && crypto.randomUUID ? { id: crypto.randomUUID() } : {}),
                actor: params.actor,
                timestamp: new Date().toISOString(),
                verb: LIFECYCLE_VERBS[verb],
                object: { objectType: 'Activity', id: params.activityId },
                result: { ...result, duration },
                context: {
                    ...base,
                    registration: params.registration,
                    contextActivities: {
                        ...(base.contextActivities || {}),
                        category: [
                            ...(base.contextActivities?.category || []),
                            CMI5_CATEGORY,
                            ...(extra.moveOn ? [MOVE_ON_CATEGORY] : [])
                        ]
                    },
                    ...(extra.masteryScore !== undefined
                        ? { extensions: { ...(base.extensions || {}), [MASTERY_SCORE_EXTENSION]: extra.masteryScore } }
                        : {})
                }
            };
        };

        if ((launchData.launchMode || 'Normal') === 'Normal') {
            if (this._completionStatus === 'completed' && !this._sentComplete) {
                statements.push(lifecycle('completed', { completion: true }, { moveOn: true }));
                outcomes.complete = true;
            }
            const resultVerb = this._pendingResultVerb();
            if (resultVerb) {
                statements.push(lifecycle(resultVerb, {
                    ...(this._score !== null ? { score: { scaled: this._score } } : {}),
                    success: resultVerb === 'passed'
                }, { moveOn: true, masteryScore: masteryScore ?? undefined }));
                outcomes.result = resultVerb;
            }
        }

        statements.push(lifecycle('terminated', {}));
        return { statements, outcomes };
    }

    _navigateToReturnUrl(returnURL) {
        if (!returnURL) return;

        const safeReturnURL = getSafeCmi5ReturnUrl(returnURL);
        if (!safeReturnURL) {
            logger.warn('[Cmi5Driver] Ignoring invalid cmi5 returnURL', {
                domain: 'cmi5',
                operation: 'return',
            });
            return;
        }

        if (typeof window === 'undefined' || typeof window.location?.assign !== 'function') return;

        try {
            window.location.assign(safeReturnURL);
        } catch (error) {
            logger.warn('[Cmi5Driver] Unable to navigate to cmi5 returnURL', {
                domain: 'cmi5',
                operation: 'return',
                message: error?.message,
            });
        }
    }

    async commit() {
        const result = await super.commit();
        if (!result || this._mock) return result;
        await this._flushOutcomeStatements();
        return true;
    }

    reportScore(score) {
        super.reportScore(score);
        this._outcomeDirty = true;
    }

    reportCompletion(status) {
        super.reportCompletion(status);
        this._outcomeDirty = true;
    }

    reportSuccess(status) {
        super.reportSuccess(status);
        this._outcomeDirty = true;
    }

    // =========================================================================
    // Semantic Reads (override)
    // =========================================================================

    getLearnerInfo() {
        if (this._cmi5) {
            const params = this._cmi5.getLaunchParameters();
            return {
                id: params?.actor?.mbox || params?.actor?.account?.name || '',
                name: params?.actor?.name || ''
            };
        }
        return { id: 'dev-learner', name: 'Development User' };
    }

    // =========================================================================
    // xAPI Statement Methods (cmi5-specific)
    // =========================================================================

    getLaunchData() {
        if (this._mock) {
            if (this._devApi && typeof this._devApi.getLaunchData === 'function') {
                return this._devApi.getLaunchData();
            }
            return {
                launchMode: 'Normal',
                moveOn: 'NotApplicable',
                masteryScore: null,
                activityId: 'mock-activity-id',
                registration: 'mock-registration-id'
            };
        }

        if (!this._cmi5) {
            return null;
        }

        try {
            const launchData = this._cmi5.getLaunchData();
            const params = this._cmi5.getLaunchParameters();

            return {
                launchMode: launchData?.launchMode || 'Normal',
                moveOn: launchData?.moveOn || 'NotApplicable',
                masteryScore: launchData?.masteryScore ?? null,
                activityId: params?.activityId || null,
                registration: params?.registration || null,
                returnURL: launchData?.returnURL || null,
                entitlementKey: launchData?.entitlementKey || null
            };
        } catch (error) {
            logger.warn('[Cmi5Driver] Error getting launch data:', error.message);
            return null;
        }
    }

    async sendObjectiveStatement(data) {
        if (this._mock) {
            this._logMockStatement('objective', data);
            return;
        }

        if (!this._cmi5) {
            throw new Error('Cannot send objective statement: cmi5 not initialized');
        }

        const params = this._cmi5.getLaunchParameters();

        const verbMap = {
            'completed': 'http://adlnet.gov/expapi/verbs/completed',
            'progressed': 'http://adlnet.gov/expapi/verbs/progressed',
            'passed': 'http://adlnet.gov/expapi/verbs/passed',
            'failed': 'http://adlnet.gov/expapi/verbs/failed'
        };

        const verbId = verbMap[data.verb] || verbMap['progressed'];
        const verbDisplay = data.verb || 'progressed';

        const statement = {
            actor: params.actor,
            verb: {
                id: verbId,
                display: { 'en-US': verbDisplay }
            },
            object: {
                id: this._activityObjectId(params.activityId, 'objectives', data.id),
                definition: {
                    type: 'http://adlnet.gov/expapi/activities/objective',
                    name: data.name ? { 'en-US': data.name } : { 'en-US': data.id }
                }
            },
            context: this._buildAllowedStatementContext(params)
        };

        // null/undefined/NaN mean "no score" — never report them as scaled 0.
        const hasScore = Number.isFinite(data.score);
        if (hasScore || data.duration || ['completed', 'passed', 'failed'].includes(data.verb)) {
            statement.result = {};
            if (hasScore) {
                statement.result.score = { scaled: data.score };
            }
            if (data.duration) {
                statement.result.duration = data.duration;
            }
            if (data.verb === 'completed' || data.verb === 'passed') {
                statement.result.completion = true;
            }
            if (data.verb === 'passed' || data.verb === 'failed') {
                statement.result.success = data.verb === 'passed';
            }
        }

        try {
            await this._cmi5.sendXapiStatement(this._withStatementIdentity(statement, data));
            logger.debug(`[Cmi5Driver] Sent objective statement: ${data.verb} for ${data.id}`);
        } catch (error) {
            logger.error('[Cmi5Driver] Failed to send objective statement:', error);
            throw error;
        }
    }

    async sendInteractionStatement(data) {
        if (this._mock) {
            this._logMockStatement('interaction', data);
            // Forward interaction data to dev API for server-side tracking
            if (this._devApi && typeof this._devApi.recordInteraction === 'function') {
                this._devApi.recordInteraction(data);
            }
            return;
        }

        if (!this._cmi5) {
            throw new Error('Cannot send interaction statement: cmi5 not initialized');
        }

        const params = this._cmi5.getLaunchParameters();

        const interactionTypeMap = {
            'choice': 'choice',
            'true-false': 'true-false',
            'fill-in': 'fill-in',
            'long-fill-in': 'long-fill-in',
            'matching': 'matching',
            'performance': 'performance',
            'sequencing': 'sequencing',
            'likert': 'likert',
            'numeric': 'numeric',
            'other': 'other'
        };

        const statement = {
            actor: params.actor,
            verb: {
                id: 'http://adlnet.gov/expapi/verbs/answered',
                display: { 'en-US': 'answered' }
            },
            object: {
                id: this._activityObjectId(params.activityId, 'interactions', data.id),
                definition: {
                    type: 'http://adlnet.gov/expapi/activities/cmi.interaction',
                    interactionType: interactionTypeMap[data.type] || 'other'
                }
            },
            result: {
                response: String(data.response),
                // Omitted for likert/survey/neutral responses where correctness does not apply
                ...(typeof data.correct === 'boolean' ? { success: data.correct } : {})
            },
            context: this._buildAllowedStatementContext(params)
        };

        if (data.description) {
            statement.object.definition.description = { 'en-US': data.description };
        }

        if (data.duration) {
            statement.result.duration = data.duration;
        }

        if (data.objectiveId) {
            statement.context.contextActivities.other = [{
                id: this._activityObjectId(params.activityId, 'objectives', data.objectiveId),
                definition: { type: 'http://adlnet.gov/expapi/activities/objective' }
            }];
        }

        try {
            await this._cmi5.sendXapiStatement(this._withStatementIdentity(statement, data));
            const outcome = typeof data.correct === 'boolean' ? (data.correct ? 'correct' : 'incorrect') : 'not scored';
            logger.debug(`[Cmi5Driver] Sent interaction statement: ${data.id} (${outcome})`);
        } catch (error) {
            logger.error('[Cmi5Driver] Failed to send interaction statement:', error);
            throw error;
        }
    }

    async sendAssessmentStatement(data) {
        if (this._mock) {
            this._logMockStatement('assessment', data);
            return;
        }

        if (!this._cmi5) {
            throw new Error('Cannot send assessment statement: cmi5 not initialized');
        }

        const params = this._cmi5.getLaunchParameters();

        const statement = {
            actor: params.actor,
            verb: {
                id: 'http://adlnet.gov/expapi/verbs/completed',
                display: { 'en-US': 'completed' }
            },
            object: {
                id: this._activityObjectId(params.activityId, 'assessments', data.id),
                definition: {
                    type: 'http://adlnet.gov/expapi/activities/assessment',
                    name: data.name ? { 'en-US': data.name } : { 'en-US': data.id }
                }
            },
            result: {
                score: {
                    scaled: data.score,
                    raw: data.correctCount,
                    max: data.questionCount,
                    min: 0
                },
                success: data.passed,
                completion: true
            },
            context: this._buildAllowedStatementContext(params, {
                extensions: {
                    'https://w3id.org/xapi/cmi5/context/extensions/attemptNumber': data.attemptNumber
                }
            })
        };

        if (data.duration) {
            statement.result.duration = data.duration;
        }

        try {
            await this._cmi5.sendXapiStatement(this._withStatementIdentity(statement, data));
            logger.debug(`[Cmi5Driver] Sent assessment statement: ${data.id} (${data.passed ? 'passed' : 'failed'}) attempt ${data.attemptNumber}`);
        } catch (error) {
            logger.error('[Cmi5Driver] Failed to send assessment statement:', error);
            throw error;
        }
    }

    async sendSlideStatement(data) {
        if (this._mock) {
            this._logMockStatement('slide', data);
            return;
        }

        if (!this._cmi5) {
            throw new Error('Cannot send slide statement: cmi5 not initialized');
        }

        const params = this._cmi5.getLaunchParameters();

        const statement = {
            actor: params.actor,
            verb: {
                id: 'http://adlnet.gov/expapi/verbs/experienced',
                display: { 'en-US': 'experienced' }
            },
            object: {
                id: this._activityObjectId(params.activityId, 'slides', data.id),
                definition: {
                    type: 'http://adlnet.gov/expapi/activities/media',
                    name: data.title ? { 'en-US': data.title } : { 'en-US': data.id }
                }
            },
            context: this._buildAllowedStatementContext(params)
        };

        if (data.duration) {
            statement.result = {
                duration: data.duration
            };
        }

        try {
            await this._cmi5.sendXapiStatement(this._withStatementIdentity(statement, data));
            logger.debug(`[Cmi5Driver] Sent slide statement: experienced ${data.id} (${data.duration || 'no duration'})`);
        } catch (error) {
            logger.error('[Cmi5Driver] Failed to send slide statement:', error);
            throw error;
        }
    }

    // =========================================================================
    // Private: Launch Parameters
    // =========================================================================

    _hasLaunchParameters() {
        const params = new URLSearchParams(window.location.search);
        return Boolean(
            params.get('fetch') &&
            params.get('endpoint') &&
            params.get('actor') &&
            params.get('registration') &&
            params.get('activityId')
        );
    }

    _getLaunchParametersFromURL() {
        const params = new URLSearchParams(window.location.search);
        const launchParams = {
            fetch: params.get('fetch'),
            endpoint: params.get('endpoint'),
            registration: params.get('registration'),
            activityId: params.get('activityId')
        };

        const actorParam = params.get('actor');
        if (actorParam) {
            try {
                launchParams.actor = JSON.parse(actorParam);
            } catch {
                launchParams.actor = actorParam;
            }
        }

        return launchParams;
    }

    // =========================================================================
    // Private: State Management via xAPI State API
    // =========================================================================

    async _prefetchState() {
        const params = this._cmi5.getLaunchParameters();
        const xapi = this._cmi5.xapi;

        try {
            const response = await xapi.getState({
                agent: params.actor,
                activityId: params.activityId,
                stateId: STATE_ID_SUSPEND_DATA,
                registration: params.registration
            });
            this._suspendDataCache = response.data || null;
            if (this._suspendDataCache) {
                logger.debug('[Cmi5Driver] Loaded suspend_data from State API');
            }
        } catch (error) {
            if (error.response?.status !== 404) {
                throw new Error(`Unable to load suspend_data: ${error.message}`);
            }
            this._suspendDataCache = null;
        }

        try {
            const response = await xapi.getState({
                agent: params.actor,
                activityId: params.activityId,
                stateId: STATE_ID_BOOKMARK,
                registration: params.registration
            });
            const bookmarkData = response.data;
            if (bookmarkData) {
                this._bookmarkCache = bookmarkData.location || null;
                this._completionStatus = bookmarkData.completionStatus || 'unknown';
                this._successStatus = bookmarkData.successStatus || 'unknown';
                this._score = bookmarkData.score ?? null;
                this._sentComplete = bookmarkData.sentComplete || false;
                this._sentResult = bookmarkData.sentResult || false;
                this._sentSuccessStatus = bookmarkData.sentSuccessStatus ||
                    (this._sentResult && ['passed', 'failed'].includes(this._successStatus)
                        ? this._successStatus
                        : null);
                this._unconfirmedOutcomes = bookmarkData.unconfirmedOutcomes || null;
                logger.debug('[Cmi5Driver] Loaded bookmark from State API:', this._bookmarkCache);
            }
        } catch (error) {
            if (error.response?.status !== 404) {
                throw new Error(`Unable to load bookmark state: ${error.message}`);
            }
        }
    }

    async _persistState() {
        const params = this._cmi5.getLaunchParameters();
        const xapi = this._cmi5.xapi;

        // Clear dirty flags before each request (snapshotting the payload) so a
        // write made while the request is in flight stays dirty; re-set them
        // if the request fails.
        if (this._suspendDataDirty && this._suspendDataCache !== null) {
            const suspendData = this._suspendDataCache;
            this._suspendDataDirty = false;
            try {
                await xapi.setState({
                    agent: params.actor,
                    activityId: params.activityId,
                    stateId: STATE_ID_SUSPEND_DATA,
                    registration: params.registration,
                    state: suspendData
                });
                logger.debug('[Cmi5Driver] Persisted suspend_data');
            } catch (error) {
                this._suspendDataDirty = true;
                logger.error('[Cmi5Driver] Failed to persist suspend_data:', error);
                throw error;
            }
        }

        if (this._bookmarkDirty) {
            this._bookmarkDirty = false;
            try {
                await this._persistBookmark();
            } catch (error) {
                this._bookmarkDirty = true;
                throw error;
            }
        }
    }

    _bookmarkState() {
        return {
            location: this._bookmarkCache,
            completionStatus: this._completionStatus,
            successStatus: this._successStatus,
            score: this._score,
            sentComplete: this._sentComplete,
            sentResult: this._sentResult,
            sentSuccessStatus: this._sentSuccessStatus,
            ...(this._unconfirmedOutcomes ? { unconfirmedOutcomes: this._unconfirmedOutcomes } : {})
        };
    }

    async _persistBookmark() {
        const params = this._cmi5.getLaunchParameters();
        const xapi = this._cmi5.xapi;

        try {
            await xapi.setState({
                agent: params.actor,
                activityId: params.activityId,
                stateId: STATE_ID_BOOKMARK,
                registration: params.registration,
                state: this._bookmarkState()
            });
            logger.debug('[Cmi5Driver] Persisted bookmark');
        } catch (error) {
            logger.error('[Cmi5Driver] Failed to persist bookmark:', error);
            throw error;
        }
    }

    /**
     * Persists sent flags immediately after a lifecycle statement succeeds so
     * a later failure cannot cause a duplicate statement on the next launch.
     * A failed write leaves the bookmark dirty for the next commit to retry
     * without blocking the remaining outcome statements.
     */
    async _persistSentFlags() {
        this._bookmarkDirty = false;
        try {
            await this._persistBookmark();
        } catch (error) {
            this._bookmarkDirty = true;
            logger.warn('[Cmi5Driver] Sent flags not yet persisted; will retry on next commit:', error?.message);
        }
    }

    _buildAllowedStatementContext(params, additions = {}) {
        const launchData = this._cmi5.getLaunchData?.() || {};
        const template = launchData.contextTemplate || {};
        const templateActivities = template.contextActivities || {};
        const additionalActivities = additions.contextActivities || {};
        const existingParents = [
            ...(templateActivities.parent || []),
            ...(additionalActivities.parent || [])
        ];
        if (!existingParents.some(activity => activity?.id === params.activityId)) {
            existingParents.push({ id: params.activityId });
        }

        return {
            ...template,
            ...additions,
            registration: params.registration,
            contextActivities: {
                ...templateActivities,
                ...additionalActivities,
                parent: existingParents
            },
            extensions: {
                ...(template.extensions || {}),
                ...(additions.extensions || {})
            }
        };
    }

    /**
     * Applies a caller-supplied statement id and timestamp so a retried
     * statement keeps its original identity and time instead of the retry's.
     */
    _withStatementIdentity(statement, data) {
        if (data?.statementId) statement.id = data.statementId;
        if (data?.timestamp) statement.timestamp = data.timestamp;
        return statement;
    }

    _activityObjectId(activityId, collection, itemId) {
        const base = String(activityId).replace(/\/$/, '');
        return `${base}/${collection}/${encodeURIComponent(String(itemId))}`;
    }

    /**
     * Mastery score from launch data, or null. Mirrors @xapi/cmi5, which treats
     * any value that coerces to a number as a mastery score.
     */
    _getMasteryScore() {
        const raw = this._cmi5?.getLaunchData?.()?.masteryScore;
        if (raw === undefined || Number.isNaN(Number(raw))) return null;
        return Number(raw);
    }

    /**
     * Decides which result verb may be sent for the current success status.
     * When the LMS supplies a masteryScore, cmi5 requires the AU to judge
     * pass/fail against it (and @xapi/cmi5 refuses Passed below mastery), so
     * the score decides. A Passed with no score cannot satisfy a mastery
     * score, so nothing is sent until a score is reported; Failed needs no
     * score.
     * @returns {'passed'|'failed'|null}
     */
    _resolveResultVerb() {
        if (!['passed', 'failed'].includes(this._successStatus)) return null;
        const masteryScore = this._getMasteryScore();
        if (masteryScore === null) return this._successStatus;

        let verb;
        if (this._score === null) {
            verb = this._successStatus === 'failed' ? 'failed' : null;
        } else {
            verb = this._score >= masteryScore ? 'passed' : 'failed';
        }

        if (verb !== this._successStatus) {
            const key = `${this._successStatus}:${this._score}:${masteryScore}`;
            if (this._resultSkipLogged !== key) {
                this._resultSkipLogged = key;
                logger.warn(verb
                    ? `[Cmi5Driver] Reported "${this._successStatus}" overridden to "${verb}": score ${this._score} vs masteryScore ${masteryScore}`
                    : `[Cmi5Driver] Passed not sent: masteryScore ${masteryScore} requires a score but none was reported`);
            }
        }
        return verb;
    }

    /** The result verb still owed to the LMS, or null. */
    _pendingResultVerb() {
        const verb = this._resolveResultVerb();
        if (!verb) return null;
        const pending = !this._sentResult ||
            (this._sentSuccessStatus !== null && this._sentSuccessStatus !== verb);
        return pending ? verb : null;
    }

    async _flushOutcomeStatements() {
        // Serialize flushes: a commit racing terminate must not send the
        // same lifecycle statement twice.
        const run = (this._outcomeFlush || Promise.resolve()).then(() => this._sendPendingOutcomes());
        this._outcomeFlush = run.catch(() => {});
        return run;
    }

    async _sendPendingOutcomes() {
        const pendingCompletion = this._completionStatus === 'completed' && !this._sentComplete;
        const resultVerb = this._mock || !this._cmi5 ? null : this._pendingResultVerb();
        if (this._mock || !this._cmi5 || (!this._outcomeDirty && !pendingCompletion && !resultVerb)) return;

        const launchMode = this._cmi5.getLaunchData?.()?.launchMode || 'Normal';
        if (launchMode !== 'Normal') {
            this._outcomeDirty = false;
            return;
        }

        this._outcomeDirty = false;
        try {
            if (pendingCompletion) {
                await this._sendLifecycleStatement('complete', () => this._cmi5.complete());
                this._sentComplete = true;
                logger.debug('[Cmi5Driver] Sent Completed statement');
                await this._persistSentFlags();
            }

            if (resultVerb) {
                const scoreObj = this._score !== null ? { scaled: this._score } : undefined;
                await this._sendLifecycleStatement('result', () => (resultVerb === 'passed'
                    ? this._cmi5.pass(scoreObj)
                    : this._cmi5.fail(scoreObj)), resultVerb);
                this._sentResult = true;
                this._sentSuccessStatus = resultVerb;
                logger.debug(`[Cmi5Driver] Sent ${resultVerb === 'passed' ? 'Passed' : 'Failed'} statement`);
                await this._persistSentFlags();
            }
        } catch (error) {
            this._outcomeDirty = true;
            throw error;
        }
    }

    /**
     * Sends one lifecycle statement. When an unload-time send of the same
     * outcome could not be confirmed and the LMS now rejects the resend, the
     * earlier statement is assumed recorded rather than failing every commit.
     */
    async _sendLifecycleStatement(kind, send, verb = null) {
        try {
            await send();
        } catch (error) {
            const unconfirmed = kind === 'complete'
                ? this._unconfirmedOutcomes?.complete === true
                : this._unconfirmedOutcomes?.result === verb;
            if (!unconfirmed || !isClientRejection(error)) throw error;
            logger.warn(`[Cmi5Driver] LMS rejected resend of unload-time ${kind} statement; treating it as already recorded`);
        }
        if (this._unconfirmedOutcomes) {
            const remaining = { ...this._unconfirmedOutcomes, [kind]: kind === 'complete' ? false : null };
            this._unconfirmedOutcomes = remaining.complete || remaining.result ? remaining : null;
        }
    }

    _sendAuthenticatedUnloadRequest({ url, method, body, authToken, label, keepalive }) {
        const authorization = /^(Basic|Bearer)\s/i.test(authToken)
            ? authToken
            : `Basic ${authToken}`;
        try {
            fetch(url, {
                method,
                headers: {
                    'Authorization': authorization,
                    'X-Experience-API-Version': '1.0.3',
                    'Content-Type': 'application/json'
                },
                body,
                keepalive
            }).then(response => {
                if (!response.ok) {
                    throw new Error(`${response.status} ${response.statusText || ''}`.trim());
                }
                logger.debug(`[Cmi5Driver] Emergency save: ${label} persisted`);
            }).catch(error => this._logUnloadFailure(label, error));
        } catch (error) {
            this._logUnloadFailure(label, error);
        }
    }

    _logUnloadFailure(label, error) {
        logger.error(`[Cmi5Driver] Emergency save failed for ${label}`, {
            domain: 'cmi5',
            operation: 'emergencySave',
            label,
            error: error?.message,
            stack: error?.stack
        });
    }

    // =========================================================================
    // Private: Development Mode (no real LRS)
    // =========================================================================

    _loadMockState() {
        try {
            if (this._devApi) {
                const state = this._devApi.getState('cmi5_state');
                if (state) {
                    this._mockState = state;
                    this._bookmarkCache = state.bookmark || null;
                    this._completionStatus = state.completionStatus || 'unknown';
                    this._successStatus = state.successStatus || 'unknown';
                    this._score = state.score ?? null;
                    this._sentComplete = state.sentComplete || false;
                    this._sentResult = state.sentResult || false;
                    this._sentSuccessStatus = state.sentSuccessStatus ||
                        (this._sentResult && ['passed', 'failed'].includes(this._successStatus)
                            ? this._successStatus
                            : null);
                }
                this._mockState.suspendData = this._devApi.getState('suspend_data') || null;
                return;
            }

            const stored = localStorage.getItem('cmi5_dev_state');
            if (stored) {
                const parsed = JSON.parse(stored);
                this._mockState = parsed;
                this._bookmarkCache = parsed.bookmark || null;
                this._completionStatus = parsed.completionStatus || 'unknown';
                this._successStatus = parsed.successStatus || 'unknown';
                this._score = parsed.score ?? null;
                this._sentComplete = parsed.sentComplete || false;
                this._sentResult = parsed.sentResult || false;
                this._sentSuccessStatus = parsed.sentSuccessStatus ||
                    (this._sentResult && ['passed', 'failed'].includes(this._successStatus)
                        ? this._successStatus
                        : null);
            }
        } catch (_e) {
            this._mockState = {};
        }
    }

    _saveMockState() {
        try {
            const state = {
                ...this._mockState,
                bookmark: this._bookmarkCache,
                completionStatus: this._completionStatus,
                successStatus: this._successStatus,
                score: this._score,
                sentComplete: this._sentComplete,
                sentResult: this._sentResult,
                sentSuccessStatus: this._sentSuccessStatus
            };

            if (this._devApi) {
                this._devApi.setState('cmi5_state', state);
                if (this._mockState.suspendData) {
                    this._devApi.setState('suspend_data', this._mockState.suspendData);
                }
                return;
            }

            localStorage.setItem('cmi5_dev_state', JSON.stringify(state));
        } catch (e) {
            logger.warn('[Cmi5Driver] Failed to save mock state:', e);
        }
    }
}
