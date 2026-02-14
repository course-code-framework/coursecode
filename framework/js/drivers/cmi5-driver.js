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
 * - Emergency save via sendBeacon
 */

import { HttpDriverBase } from './http-driver-base.js';
import { logger } from '../utilities/logger.js';

// @xapi/cmi5 is dynamically imported in initialize() to avoid bundling for non-cmi5 builds

// State document IDs for xAPI State API
const STATE_ID_SUSPEND_DATA = 'https://w3id.org/xapi/cmi5/state/suspend_data';
const STATE_ID_BOOKMARK = 'https://w3id.org/xapi/cmi5/state/bookmark';

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
        const devApi = typeof window !== 'undefined' && (window.cmi5 || (window.parent !== window && window.parent.cmi5));
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
            logger.info('[Cmi5Driver] No cmi5 launch parameters. Using localStorage mock.');
            this._mock = true;
            this._loadMockState();
            this._isConnected = true;
            this._logMockStatement('initialized', { verb: 'initialized' });
            return true;
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

            const isExpiredToken = error.message?.includes('400') ||
                error.response?.status === 400 ||
                error.message?.includes('fetch');

            if (isExpiredToken) {
                const sessionError = new Error(
                    'Your session has expired. Please return to the learning management system to resume this course.'
                );
                sessionError.isSessionExpired = true;
                sessionError.userFacing = true;
                throw sessionError;
            }

            throw new Error(`[Cmi5Driver] Initialization failed: ${error.message}`);
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

        try {
            await this._persistState();

            if (this._completionStatus === 'completed' && !this._sentComplete) {
                await this._cmi5.complete();
                this._sentComplete = true;
                logger.debug('[Cmi5Driver] Sent Completed statement');
            }

            if (!this._sentResult) {
                const scoreObj = this._score !== null ? { scaled: this._score } : undefined;

                if (this._successStatus === 'passed') {
                    await this._cmi5.pass(scoreObj);
                    this._sentResult = true;
                    logger.debug('[Cmi5Driver] Sent Passed statement');
                } else if (this._successStatus === 'failed') {
                    await this._cmi5.fail(scoreObj);
                    this._sentResult = true;
                    logger.debug('[Cmi5Driver] Sent Failed statement');
                }
            }

            await this._persistSentFlags();
            await this._cmi5.terminate();
            logger.debug('[Cmi5Driver] Sent Terminated statement');

            this._isTerminated = true;
            return true;

        } catch (error) {
            logger.error('[Cmi5Driver] Terminate failed:', error);
            throw new Error(`[Cmi5Driver] Termination failed: ${error.message}`);
        }
    }

    /**
     * Emergency save using sendBeacon for page unload scenarios.
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
        const registration = params.registration;
        const activityId = encodeURIComponent(params.activityId);
        const agent = encodeURIComponent(JSON.stringify(params.actor));
        const stateId = encodeURIComponent(STATE_ID_SUSPEND_DATA);

        if (this._suspendDataDirty && this._suspendDataCache !== null) {
            const suspendDataUrl = `${endpoint}/activities/state?stateId=${stateId}&activityId=${activityId}&agent=${agent}&registration=${registration}`;
            const suspendDataBlob = new Blob([JSON.stringify(this._suspendDataCache)], { type: 'application/json' });

            const suspendSent = navigator.sendBeacon(suspendDataUrl, suspendDataBlob);
            if (suspendSent) {
                logger.debug('[Cmi5Driver] Emergency save: suspend_data sent via sendBeacon');
            } else {
                logger.warn('[Cmi5Driver] Emergency save: sendBeacon failed for suspend_data');
            }
        }

        if (this._bookmarkDirty) {
            const bookmarkStateId = encodeURIComponent(STATE_ID_BOOKMARK);
            const bookmarkUrl = `${endpoint}/activities/state?stateId=${bookmarkStateId}&activityId=${activityId}&agent=${agent}&registration=${registration}`;
            const bookmarkData = {
                location: this._bookmarkCache,
                completionStatus: this._completionStatus,
                successStatus: this._successStatus,
                score: this._score,
                sentComplete: this._sentComplete,
                sentResult: this._sentResult
            };
            const bookmarkBlob = new Blob([JSON.stringify(bookmarkData)], { type: 'application/json' });

            const bookmarkSent = navigator.sendBeacon(bookmarkUrl, bookmarkBlob);
            if (bookmarkSent) {
                logger.debug('[Cmi5Driver] Emergency save: bookmark sent via sendBeacon');
            } else {
                logger.warn('[Cmi5Driver] Emergency save: sendBeacon failed for bookmark');
            }
        }
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
        const xapi = this._cmi5.xapi;

        const verbMap = {
            'completed': 'http://adlnet.gov/expapi/verbs/completed',
            'progressed': 'http://adlnet.gov/expapi/verbs/progressed',
            'passed': 'http://adlnet.gov/expapi/verbs/passed',
            'failed': 'http://adlnet.gov/expapi/verbs/failed'
        };

        const verbId = verbMap[data.verb] || verbMap['progressed'];
        const verbDisplay = data.verb || 'progressed';

        const statement = {
            verb: {
                id: verbId,
                display: { 'en-US': verbDisplay }
            },
            object: {
                id: `${params.activityId}/objectives/${data.id}`,
                definition: {
                    type: 'http://adlnet.gov/expapi/activities/objective',
                    name: data.name ? { 'en-US': data.name } : { 'en-US': data.id }
                }
            },
            context: {
                registration: params.registration,
                contextActivities: {
                    parent: [{ id: params.activityId }]
                }
            }
        };

        if (data.score !== undefined || data.duration) {
            statement.result = {};
            if (data.score !== undefined) {
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
            await xapi.sendStatement(statement);
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
        const xapi = this._cmi5.xapi;

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
            verb: {
                id: 'http://adlnet.gov/expapi/verbs/answered',
                display: { 'en-US': 'answered' }
            },
            object: {
                id: `${params.activityId}/interactions/${data.id}`,
                definition: {
                    type: 'http://adlnet.gov/expapi/activities/cmi.interaction',
                    interactionType: interactionTypeMap[data.type] || 'other'
                }
            },
            result: {
                response: String(data.response),
                success: data.correct
            },
            context: {
                registration: params.registration,
                contextActivities: {
                    parent: [{ id: params.activityId }]
                }
            }
        };

        if (data.description) {
            statement.object.definition.description = { 'en-US': data.description };
        }

        if (data.duration) {
            statement.result.duration = data.duration;
        }

        if (data.objectiveId) {
            statement.context.contextActivities.other = [{
                id: `${params.activityId}/objectives/${data.objectiveId}`,
                definition: { type: 'http://adlnet.gov/expapi/activities/objective' }
            }];
        }

        try {
            await xapi.sendStatement(statement);
            logger.debug(`[Cmi5Driver] Sent interaction statement: ${data.id} (${data.correct ? 'correct' : 'incorrect'})`);
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
        const xapi = this._cmi5.xapi;

        const statement = {
            verb: {
                id: 'http://adlnet.gov/expapi/verbs/completed',
                display: { 'en-US': 'completed' }
            },
            object: {
                id: `${params.activityId}/assessments/${data.id}`,
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
            context: {
                registration: params.registration,
                contextActivities: {
                    parent: [{ id: params.activityId }]
                },
                extensions: {
                    'https://w3id.org/xapi/cmi5/context/extensions/attemptNumber': data.attemptNumber
                }
            }
        };

        if (data.duration) {
            statement.result.duration = data.duration;
        }

        try {
            await xapi.sendStatement(statement);
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
        const xapi = this._cmi5.xapi;

        const statement = {
            verb: {
                id: 'http://adlnet.gov/expapi/verbs/experienced',
                display: { 'en-US': 'experienced' }
            },
            object: {
                id: `${params.activityId}/slides/${data.id}`,
                definition: {
                    type: 'http://adlnet.gov/expapi/activities/media',
                    name: data.title ? { 'en-US': data.title } : { 'en-US': data.id }
                }
            },
            context: {
                registration: params.registration,
                contextActivities: {
                    parent: [{ id: params.activityId }]
                }
            }
        };

        if (data.duration) {
            statement.result = {
                duration: data.duration
            };
        }

        try {
            await xapi.sendStatement(statement);
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
                logger.warn('[Cmi5Driver] Error fetching suspend_data:', error.message);
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
                logger.debug('[Cmi5Driver] Loaded bookmark from State API:', this._bookmarkCache);
            }
        } catch (error) {
            if (error.response?.status !== 404) {
                logger.warn('[Cmi5Driver] Error fetching bookmark:', error.message);
            }
        }
    }

    async _persistState() {
        const params = this._cmi5.getLaunchParameters();
        const xapi = this._cmi5.xapi;

        if (this._suspendDataDirty && this._suspendDataCache !== null) {
            try {
                await xapi.setState({
                    agent: params.actor,
                    activityId: params.activityId,
                    stateId: STATE_ID_SUSPEND_DATA,
                    registration: params.registration,
                    state: this._suspendDataCache
                });
                this._suspendDataDirty = false;
                logger.debug('[Cmi5Driver] Persisted suspend_data');
            } catch (error) {
                logger.error('[Cmi5Driver] Failed to persist suspend_data:', error);
                throw error;
            }
        }

        if (this._bookmarkDirty) {
            await this._persistBookmark();
            this._bookmarkDirty = false;
        }
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
                state: {
                    location: this._bookmarkCache,
                    completionStatus: this._completionStatus,
                    successStatus: this._successStatus,
                    score: this._score,
                    sentComplete: this._sentComplete,
                    sentResult: this._sentResult
                }
            });
            logger.debug('[Cmi5Driver] Persisted bookmark');
        } catch (error) {
            logger.error('[Cmi5Driver] Failed to persist bookmark:', error);
            throw error;
        }
    }

    async _persistSentFlags() {
        this._bookmarkDirty = true;
        await this._persistBookmark();
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
                sentResult: this._sentResult
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
