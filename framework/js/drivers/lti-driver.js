/**
 * @file lti-driver.js
 * @description LTI 1.3 driver implementation.
 * Extends HttpDriverBase for shared mock state, suspend data, and semantic interface.
 *
 * LTI 1.3 launch flow:
 * 1. Platform redirects to tool with id_token (JWT) via OIDC
 * 2. Driver validates JWT using platform's JWKS endpoint
 * 3. State persistence via host-provided state endpoint
 * 4. Score reporting via AGS (Assignment and Grade Services)
 *
 * This driver adds:
 * - JWT validation and claims extraction
 * - AGS score passback on terminate
 * - State persistence via host endpoint
 * - Emergency save via sendBeacon
 */

import { HttpDriverBase } from './http-driver-base.js';
import { logger } from '../utilities/logger.js';

// jose is dynamically imported in initialize() to avoid bundling for non-LTI builds

// =============================================================================
// LTI Driver Class
// =============================================================================

export class LtiDriver extends HttpDriverBase {
    constructor() {
        super();

        // JWT claims extracted at launch
        this._claims = null;

        // AGS endpoint (from JWT claims)
        this._agsEndpoint = null;
        this._agsLineItemUrl = null;
        this._accessToken = null;

        // Host state endpoint for suspend_data persistence
        this._stateEndpoint = null;
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
        const devApi = typeof window !== 'undefined' && (window.lti || (window.parent !== window && window.parent.lti));
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

        // Check for LTI launch parameters
        if (!this._hasLaunchParameters()) {
            logger.info('[LtiDriver] No LTI launch parameters. Using localStorage mock.');
            this._mock = true;
            this._loadMockState();
            this._isConnected = true;
            this._logMockStatement('initialized', { verb: 'initialized' });
            return true;
        }

        // Production mode: validate JWT and extract claims
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
            await this._postScore();

            this._isTerminated = true;
            logger.debug('[LtiDriver] Session terminated');
            return true;

        } catch (error) {
            logger.error('[LtiDriver] Terminate failed:', error);
            this._isTerminated = true;
            throw new Error(`[LtiDriver] Termination failed: ${error.message}`);
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
                    score: this._score
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

        const params = new URLSearchParams(window.location.search);
        return Boolean(
            params.get('id_token') ||
            params.get('state') ||
            window.location.hash.includes('id_token')
        );
    }

    async _processLaunch() {
        const { jwtVerify, createRemoteJWKSet } = await import('jose');

        const params = new URLSearchParams(window.location.search);
        const idToken = params.get('id_token');

        if (!idToken) {
            throw new Error('No id_token found in launch parameters');
        }

        const [headerB64] = idToken.split('.');
        const header = JSON.parse(atob(headerB64));

        const jwksUrl = this._getJwksUrl(header);
        const JWKS = createRemoteJWKSet(new URL(jwksUrl));

        const { payload } = await jwtVerify(idToken, JWKS, {
            algorithms: ['RS256', 'ES256']
        });

        this._validateLtiClaims(payload);
        this._claims = payload;

        const agsEndpoint = payload['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'];
        if (agsEndpoint) {
            this._agsEndpoint = agsEndpoint.lineitems;
            this._agsLineItemUrl = agsEndpoint.lineitem;
            logger.debug('[LtiDriver] AGS endpoint configured:', this._agsEndpoint);
        }

        this._stateEndpoint = this._resolveStateEndpoint();
        logger.debug('[LtiDriver] Launch processed. User:', payload.sub);
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

    _getJwksUrl(_header) {
        const meta = document.querySelector('meta[name="lti-jwks-url"]');
        if (meta) return meta.content;

        if (window.__LTI_CONFIG__?.jwksUrl) return window.__LTI_CONFIG__.jwksUrl;

        throw new Error('JWKS URL not configured. Set via meta tag or window.__LTI_CONFIG__.');
    }

    _resolveStateEndpoint() {
        const meta = document.querySelector('meta[name="lti-state-endpoint"]');
        if (meta) return meta.content;

        if (window.__LTI_CONFIG__?.stateEndpoint) return window.__LTI_CONFIG__.stateEndpoint;

        return '/api/lti/state';
    }

    _getStateKey() {
        if (this._claims) {
            const resourceLink = this._claims['https://purl.imsglobal.org/spec/lti/claim/resource_link']?.id;
            return `${resourceLink}:${this._claims.sub}`;
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

        try {
            const response = await fetch(`${this._stateEndpoint}?key=${encodeURIComponent(stateKey)}`, {
                headers: this._getAuthHeaders()
            });

            if (response.ok) {
                const state = await response.json();
                this._suspendDataCache = state.suspendData || null;
                this._bookmarkCache = state.bookmark || null;
                this._completionStatus = state.completionStatus || 'unknown';
                this._successStatus = state.successStatus || 'unknown';
                this._score = state.score ?? null;
                logger.debug('[LtiDriver] State pre-fetched');
            }
        } catch (error) {
            logger.warn('[LtiDriver] Failed to prefetch state:', error.message);
        }
    }

    async _persistState() {
        if (!this._stateEndpoint) return;

        const stateKey = this._getStateKey();
        if (!stateKey) return;

        const dirty = this._suspendDataDirty || this._bookmarkDirty;
        if (!dirty) return;

        const payload = {
            key: stateKey,
            suspendData: this._suspendDataDirty ? this._suspendDataCache : undefined,
            bookmark: this._bookmarkCache,
            completionStatus: this._completionStatus,
            successStatus: this._successStatus,
            score: this._score
        };

        const response = await fetch(this._stateEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...this._getAuthHeaders()
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`State persistence failed: ${response.status} ${response.statusText}`);
        }

        this._suspendDataDirty = false;
        this._bookmarkDirty = false;
        logger.debug('[LtiDriver] State persisted');
    }

    _getAuthHeaders() {
        if (this._accessToken) {
            return { 'Authorization': `Bearer ${this._accessToken}` };
        }
        return {};
    }

    // =========================================================================
    // Private: AGS Score Passback
    // =========================================================================

    async _postScore() {
        if (!this._agsLineItemUrl || this._score === null) {
            return;
        }

        try {
            const scorePayload = {
                userId: this._claims.sub,
                scoreGiven: this._score * 100,
                scoreMaximum: 100,
                comment: '',
                timestamp: new Date().toISOString(),
                activityProgress: this._completionStatus === 'completed' ? 'Completed' : 'InProgress',
                gradingProgress: this._successStatus !== 'unknown' ? 'FullyGraded' : 'NotReady'
            };

            const scoreUrl = `${this._agsLineItemUrl}/scores`;
            await fetch(scoreUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/vnd.ims.lis.v1.score+json',
                    ...this._getAuthHeaders()
                },
                body: JSON.stringify(scorePayload)
            });

            logger.debug('[LtiDriver] Score posted to AGS:', this._score);

        } catch (error) {
            logger.error('[LtiDriver] Failed to post score to AGS:', error.message);
        }
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
