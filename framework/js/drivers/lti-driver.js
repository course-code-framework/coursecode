/**
 * @file lti-driver.js
 * @description LTI 1.3 driver implementation.
 * Extends HttpDriverBase for shared mock state, suspend data, and semantic interface.
 *
 * LTI 1.3 launch flow:
 * 1. A trusted same-origin backend completes OIDC and validates the launch
 * 2. The backend injects validated display claims into the launch HTML
 * 3. State persistence uses a same-origin authenticated endpoint
 * 4. Score reporting uses a same-origin AGS proxy endpoint
 *
 * This driver adds:
 * - Validated-claim extraction from trusted launch HTML
 * - AGS score passback through a server-side proxy on terminate
 * - State persistence via host endpoint
 * - Emergency save via sendBeacon
 */

import { HttpDriverBase } from './http-driver-base.js';
import { logger } from '../utilities/logger.js';

// =============================================================================
// LTI Driver Class
// =============================================================================

export class LtiDriver extends HttpDriverBase {
    constructor() {
        super();

        // JWT claims extracted at launch
        this._claims = null;

        // AGS endpoint (from JWT claims)
        this._agsProxyEndpoint = null;

        // Host state endpoint for suspend_data persistence
        this._stateEndpoint = null;
        this._gradeDirty = false;
        this._gradeFingerprint = null;
    }

    // =========================================================================
    // Interface Implementation
    // =========================================================================

    getFormat() {
        return 'lti';
    }

    getCapabilities() {
        return {
            supportsObjectives: true,    // via suspend_data
            supportsInteractions: true,  // via suspend_data
            supportsComments: true,      // via suspend_data
            supportsEmergencySave: true,
            maxSuspendDataBytes: 0,      // unlimited (host-dependent)
            asyncCommit: true
        };
    }

    /**
     * Initializes the LTI 1.3 connection.
     */
    async initialize() {
        if (this._isConnected) {
            return true;
        }

        // Check for LTI dev API (stub player)
        // Search current window and parent frame (stub player injects on parent)
        // Try/catch guards against DOMException in cross-origin iframes (LMS embeds)
        let devApi = typeof window !== 'undefined' && window.lti;
        if (!devApi && typeof window !== 'undefined' && window.parent !== window) {
            try { devApi = window.parent.lti; } catch (_e) { /* cross-origin parent */ }
        }
        if (devApi) {
            logger.info('[LtiDriver] Using LTI development API');
            this._mock = true;
            this._devApi = devApi;
            this._devApi.initialize();
            this._loadMockState();
            this._isConnected = true;
            this._logMockStatement('initialized', { verb: 'initialized' });
            return true;
        }

        // Check for a server-validated LTI launch context
        if (!this._hasLaunchParameters()) {
            if (import.meta.env.DEV) {
                logger.info('[LtiDriver] No LTI launch parameters. Using localStorage mock.');
                this._mock = true;
                this._loadMockState();
                this._isConnected = true;
                this._logMockStatement('initialized', { verb: 'initialized' });
                return true;
            }
            throw new Error('[LtiDriver] No trusted LTI launch context detected. LTI requires a server-side OIDC backend that injects cc-lti-claims.');
        }

        // Production mode: consume the server-validated launch session
        try {
            await this._processLaunch();
            await this._prefetchState();

            this._isConnected = true;
            logger.debug('[LtiDriver] Initialized via LTI 1.3');
            return true;

        } catch (error) {
            if (import.meta.env.DEV) {
                logger.warn('[LtiDriver] LTI launch failed, using mock mode:', error.message);
                this._mock = true;
                this._loadMockState();
                this._isConnected = true;
                return true;
            }

            throw new Error(`[LtiDriver] Initialization failed: ${error.message}`);
        }
    }

    /**
     * Terminates the LTI session.
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
            await this._flushGrade();

            this._isTerminated = true;
            logger.debug('[LtiDriver] Session terminated');
            return true;

        } catch (error) {
            logger.error('[LtiDriver] Terminate failed:', error);
            throw new Error(`[LtiDriver] Termination failed: ${error.message}`);
        }
    }

    async commit() {
        const result = await super.commit();
        if (!result || this._mock) return result;
        await this._flushGrade();
        return true;
    }

    reportScore(score) {
        super.reportScore(score);
        this._gradeDirty = true;
    }

    reportCompletion(status) {
        super.reportCompletion(status);
        this._gradeDirty = true;
    }

    reportSuccess(status) {
        super.reportSuccess(status);
        this._gradeDirty = true;
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

        if (!this._stateEndpoint) {
            logger.warn('[LtiDriver] emergencySave: No state endpoint configured');
            return;
        }

        const stateKey = this._getStateKey();
        if (!stateKey) return;

        if (this._suspendDataDirty && this._suspendDataCache !== null) {
            const payload = {
                key: stateKey,
                type: 'suspend_data',
                data: this._suspendDataCache
            };
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            const sent = navigator.sendBeacon(this._stateEndpoint, blob);
            if (sent) {
                logger.debug('[LtiDriver] Emergency save: suspend_data sent via sendBeacon');
            } else {
                logger.warn('[LtiDriver] Emergency save: sendBeacon failed for suspend_data');
            }
        }

        if (this._bookmarkDirty) {
            const payload = {
                key: stateKey,
                type: 'bookmark',
                data: {
                    location: this._bookmarkCache,
                    completionStatus: this._completionStatus,
                    successStatus: this._successStatus,
                    score: this._score,
                    gradePending: this._gradeDirty,
                    gradeFingerprint: this._currentGradeFingerprint()
                }
            };
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            const sent = navigator.sendBeacon(this._stateEndpoint, blob);
            if (sent) {
                logger.debug('[LtiDriver] Emergency save: bookmark sent via sendBeacon');
            } else {
                logger.warn('[LtiDriver] Emergency save: sendBeacon failed for bookmark');
            }
        }
    }

    // =========================================================================
    // Semantic Reads (override)
    // =========================================================================

    getLearnerInfo() {
        return {
            id: this._claims?.sub || 'dev-learner',
            name: this._claims?.name || this._claims?.given_name || 'Development User'
        };
    }

    // =========================================================================
    // LTI-specific Methods
    // =========================================================================

    /**
     * Gets LTI launch data.
     */
    getLaunchData() {
        if (this._mock) {
            if (this._devApi && typeof this._devApi.getLaunchData === 'function') {
                return this._devApi.getLaunchData();
            }
            return {
                userId: 'preview_user',
                name: 'Preview User',
                roles: ['Learner'],
                resourceLinkId: 'preview-resource',
                contextId: 'preview-context'
            };
        }

        if (!this._claims) return null;

        return {
            userId: this._claims.sub,
            name: this._claims.name || this._claims.given_name,
            roles: this._claims['https://purl.imsglobal.org/spec/lti/claim/roles'] || [],
            resourceLinkId: this._claims['https://purl.imsglobal.org/spec/lti/claim/resource_link']?.id,
            contextId: this._claims['https://purl.imsglobal.org/spec/lti/claim/context']?.id,
            contextTitle: this._claims['https://purl.imsglobal.org/spec/lti/claim/context']?.title,
            returnUrl: this._claims['https://purl.imsglobal.org/spec/lti/claim/launch_presentation']?.return_url
        };
    }

    // =========================================================================
    // Private: LTI 1.3 Launch Processing
    // =========================================================================

    _hasLaunchParameters() {
        if (typeof window === 'undefined') return false;

        // Raw browser JWT handling is intentionally rejected. A browser cannot
        // safely hold the tool private key or exchange AGS client credentials.
        const params = new URLSearchParams(window.location.search);
        if (params.get('id_token') || params.get('state') || window.location.hash.includes('id_token')) {
            return false;
        }

        return Boolean(document.querySelector('meta[name="cc-lti-claims"]')?.content);
    }

    async _processLaunch() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('id_token') || params.get('state') || window.location.hash.includes('id_token')) {
            throw new Error('Direct browser OIDC/JWT launches are not supported. Complete LTI OIDC on a trusted backend.');
        }

        this._claims = this._resolveCloudClaims();
        this._validateLtiClaims(this._claims);
        this._stateEndpoint = this._resolveTrustedSameOriginEndpoint(this._resolveStateEndpoint(), 'state');

        const agsUrl = this._resolveCloudAgsEndpoint();
        if (agsUrl) {
            this._agsProxyEndpoint = this._resolveTrustedSameOriginEndpoint(agsUrl, 'AGS proxy');
            logger.debug('[LtiDriver] Same-origin AGS proxy configured:', this._agsProxyEndpoint);
        }

        logger.debug('[LtiDriver] Server-validated launch. User:', this._claims?.sub || 'unknown');
    }

    _validateLtiClaims(claims) {
        const messageType = claims['https://purl.imsglobal.org/spec/lti/claim/message_type'];
        if (messageType !== 'LtiResourceLinkRequest') {
            throw new Error(`Unsupported LTI message type: ${messageType}`);
        }

        const version = claims['https://purl.imsglobal.org/spec/lti/claim/version'];
        if (version !== '1.3.0') {
            throw new Error(`Unsupported LTI version: ${version}`);
        }

        if (!claims['https://purl.imsglobal.org/spec/lti/claim/deployment_id']) {
            throw new Error('Missing required claim: deployment_id');
        }

        if (!claims['https://purl.imsglobal.org/spec/lti/claim/resource_link']?.id) {
            throw new Error('Missing required claim: resource_link.id');
        }

        if (!claims.sub) {
            throw new Error('Missing required claim: sub');
        }
    }

    _resolveStateEndpoint() {
        const meta = document.querySelector('meta[name="lti-state-endpoint"]');
        if (meta) return meta.content;

        return '/api/lti/state';
    }

    _resolveTrustedSameOriginEndpoint(value, label) {
        if (!value) throw new Error(`Missing ${label} endpoint`);
        const endpoint = new URL(value, window.location.origin);
        if (endpoint.origin !== window.location.origin) {
            throw new Error(`${label} endpoint must be same-origin so authentication remains server-controlled`);
        }
        return endpoint.toString();
    }

    /**
     * Resolves LTI claims from server-injected meta tags.
     * Used when OIDC is handled server-side (no JWT in URL).
     */
    _resolveCloudClaims() {
        const meta = document.querySelector('meta[name="cc-lti-claims"]');
        if (meta?.content) {
            try {
                return JSON.parse(meta.content);
            } catch (e) {
                logger.warn('[LtiDriver] Failed to parse cc-lti-claims meta tag:', e.message);
            }
        }

        throw new Error('[LtiDriver] LTI launch detected but no valid server-injected <meta name="cc-lti-claims"> was provided.');
    }

    /**
     * Resolves the same-origin AGS proxy from a server-injected meta tag.
     */
    _resolveCloudAgsEndpoint() {
        const meta = document.querySelector('meta[name="cc-lti-ags"]');
        if (meta?.content) return meta.content;

        return null;
    }

    _getStateKey() {
        if (this._claims) {
            const resourceLink = this._claims['https://purl.imsglobal.org/spec/lti/claim/resource_link']?.id;
            const deploymentId = this._claims['https://purl.imsglobal.org/spec/lti/claim/deployment_id'];
            return JSON.stringify({
                issuer: this._claims.iss,
                deploymentId,
                resourceLinkId: resourceLink,
                userId: this._claims.sub
            });
        }
        return null;
    }

    // =========================================================================
    // Private: State Persistence via Host Endpoint
    // =========================================================================

    async _prefetchState() {
        if (!this._stateEndpoint) return;

        const stateKey = this._getStateKey();
        if (!stateKey) return;

        const response = await fetch(`${this._stateEndpoint}?key=${encodeURIComponent(stateKey)}`, {
            credentials: 'same-origin'
        });
        if (response.status === 404) return;
        if (!response.ok) {
            throw new Error(`State prefetch failed: ${response.status} ${response.statusText || ''}`.trim());
        }

        const state = await response.json();
        this._suspendDataCache = state.suspendData || null;
        this._bookmarkCache = state.bookmark || null;
        this._completionStatus = state.completionStatus || 'unknown';
        this._successStatus = state.successStatus || 'unknown';
        this._score = state.score ?? null;
        this._gradeFingerprint = state.gradeFingerprint || null;
        if (typeof state.gradePending === 'boolean') {
            this._gradeDirty = state.gradePending;
        } else if (this._agsProxyEndpoint && (
            this._score !== null ||
            this._completionStatus === 'completed' ||
            this._successStatus !== 'unknown'
        )) {
            // Upgrade recovery for launches saved before the persistent grade
            // outbox existed. Re-sending an idempotent latest score is safer
            // than permanently missing the grade.
            this._gradeDirty = true;
        }
        logger.debug('[LtiDriver] State pre-fetched');
    }

    async _persistState() {
        if (!this._stateEndpoint) return;

        const stateKey = this._getStateKey();
        if (!stateKey) return;

        const dirty = this._suspendDataDirty || this._bookmarkDirty || this._gradeDirty;
        if (!dirty) return;

        const payload = {
            key: stateKey,
            suspendData: this._suspendDataDirty ? this._suspendDataCache : undefined,
            bookmark: this._bookmarkCache,
            completionStatus: this._completionStatus,
            successStatus: this._successStatus,
            score: this._score,
            gradePending: this._gradeDirty,
            gradeFingerprint: this._currentGradeFingerprint()
        };

        const response = await fetch(this._stateEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`State persistence failed: ${response.status} ${response.statusText}`);
        }

        this._suspendDataDirty = false;
        this._bookmarkDirty = false;
        logger.debug('[LtiDriver] State persisted');
    }

    // =========================================================================
    // Private: AGS Score Passback
    // =========================================================================

    async _postScore() {
        if (!this._agsProxyEndpoint) {
            return false;
        }

        const scorePayload = {
            userId: this._claims.sub,
            comment: '',
            timestamp: new Date().toISOString(),
            activityProgress: this._completionStatus === 'completed' ? 'Completed' : 'InProgress',
            gradingProgress: this._successStatus !== 'unknown' ? 'FullyGraded' : 'NotReady'
        };
        if (this._score !== null) {
            scorePayload.scoreGiven = this._score * 100;
            scorePayload.scoreMaximum = 100;
        }

        const response = await fetch(this._agsProxyEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/vnd.ims.lis.v1.score+json'
            },
            credentials: 'same-origin',
            body: JSON.stringify(scorePayload)
        });

        if (!response.ok) {
            throw new Error(`AGS proxy rejected score: ${response.status} ${response.statusText || ''}`.trim());
        }

        logger.debug('[LtiDriver] Score posted to AGS:', this._score);
        return true;
    }

    async _flushGrade() {
        if (!this._gradeDirty) return;
        if (!this._agsProxyEndpoint) {
            this._gradeDirty = false;
            return;
        }
        await this._postScore();
        this._gradeDirty = false;
        this._gradeFingerprint = this._currentGradeFingerprint();
        // Acknowledge the outbox only after AGS accepts the score. If this
        // persistence fails, the next launch safely retries the latest grade.
        this._bookmarkDirty = true;
        await this._persistState();
    }

    _currentGradeFingerprint() {
        return JSON.stringify({
            score: this._score,
            completionStatus: this._completionStatus,
            successStatus: this._successStatus
        });
    }

    // =========================================================================
    // Private: Development Mode (no LTI platform)
    // =========================================================================

    _loadMockState() {
        try {
            if (this._devApi) {
                const state = this._devApi.getState('lti_state');
                if (state) {
                    this._mockState = state;
                    this._bookmarkCache = state.bookmark || null;
                    this._completionStatus = state.completionStatus || 'unknown';
                    this._successStatus = state.successStatus || 'unknown';
                    this._score = state.score ?? null;
                }
                this._mockState.suspendData = this._devApi.getState('suspend_data') || null;
                return;
            }

            const stored = localStorage.getItem('lti_dev_state');
            if (stored) {
                const parsed = JSON.parse(stored);
                this._mockState = parsed;
                this._bookmarkCache = parsed.bookmark || null;
                this._completionStatus = parsed.completionStatus || 'unknown';
                this._successStatus = parsed.successStatus || 'unknown';
                this._score = parsed.score ?? null;
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
                score: this._score
            };

            if (this._devApi) {
                this._devApi.setState('lti_state', state);
                if (this._mockState.suspendData) {
                    this._devApi.setState('suspend_data', this._mockState.suspendData);
                }
                return;
            }

            localStorage.setItem('lti_dev_state', JSON.stringify(state));
        } catch (e) {
            logger.warn('[LtiDriver] Failed to save mock state:', e);
        }
    }
}
