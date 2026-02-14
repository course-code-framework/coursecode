import { describe, it, expect, beforeEach } from 'vitest';
import { LtiDriver } from '../../../framework/js/drivers/lti-driver.js';

// ─── LTI 1.3 Specification Compliance Tests ──────────────────────────
//
// Tests verify conformance to the IMS LTI 1.3 specification and the
// IMS Assignment and Grade Services (AGS) 2.0 specification.
//
// References:
//   - LTI 1.3: https://www.imsglobal.org/spec/lti/v1p3
//   - AGS 2.0: https://www.imsglobal.org/spec/lti-ags/v2p0

// ═════════════════════════════════════════════════════════════════════
// LTI 1.3 / AGS 2.0 Specification Reference
// ═════════════════════════════════════════════════════════════════════

const LTI_SPEC = {
    // ── LTI 1.3 JWT Claims (Section 5.1) ──
    // These claim URIs are defined by the IMS spec. Using wrong URIs
    // means the tool won't validate against conformant platforms.
    claims: {
        messageType:    'https://purl.imsglobal.org/spec/lti/claim/message_type',
        version:        'https://purl.imsglobal.org/spec/lti/claim/version',
        deploymentId:   'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
        resourceLink:   'https://purl.imsglobal.org/spec/lti/claim/resource_link',
        roles:          'https://purl.imsglobal.org/spec/lti/claim/roles',
        context:        'https://purl.imsglobal.org/spec/lti/claim/context',
        launchPresentation: 'https://purl.imsglobal.org/spec/lti/claim/launch_presentation',
        targetLinkUri:  'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
        ags:            'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'
    },

    // ── Required Message Type (Section 5.1.1) ──
    requiredMessageType: 'LtiResourceLinkRequest',

    // ── Required Version ──
    requiredVersion: '1.3.0',

    // ── Required Claims for Resource Link Launch ──
    requiredClaims: [
        'sub',  // Subject (user ID) — standard JWT claim
        'https://purl.imsglobal.org/spec/lti/claim/message_type',
        'https://purl.imsglobal.org/spec/lti/claim/version',
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
        'https://purl.imsglobal.org/spec/lti/claim/resource_link'  // must have .id
    ],

    // ── AGS 2.0 Score Payload (Section 6.1) ──
    agsScore: {
        contentType: 'application/vnd.ims.lis.v1.score+json',

        // activityProgress vocabulary (Section 6.1.2)
        activityProgressVocabulary: [
            'Initialized', 'Started', 'InProgress', 'Submitted', 'Completed'
        ],

        // gradingProgress vocabulary (Section 6.1.3)
        gradingProgressVocabulary: [
            'FullyGraded', 'Pending', 'PendingManual', 'Failed', 'NotReady'
        ],

        // Required fields in score payload
        requiredFields: ['userId', 'activityProgress', 'gradingProgress', 'timestamp']
    },

    // ── LTI Roles (Section 5.3.7) ──
    // Common role URIs (subset of full spec)
    roleUris: {
        learner:    'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
        instructor: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'
    }
};

// ═════════════════════════════════════════════════════════════════════
// Tests: JWT Claim Validation
// The driver must reject launches missing required claims.
// ═════════════════════════════════════════════════════════════════════

describe('LTI 1.3 Spec: JWT Claim Validation', () => {
    let driver;

    beforeEach(() => {
        driver = new LtiDriver();
    });

    function validClaims() {
        return {
            sub: 'user-123',
            [LTI_SPEC.claims.messageType]: LTI_SPEC.requiredMessageType,
            [LTI_SPEC.claims.version]: LTI_SPEC.requiredVersion,
            [LTI_SPEC.claims.deploymentId]: 'deploy-1',
            [LTI_SPEC.claims.resourceLink]: { id: 'link-1' }
        };
    }

    it('accepts valid claims with all required fields', () => {
        expect(() => driver._validateLtiClaims(validClaims())).not.toThrow();
    });

    it('rejects wrong message_type (spec requires LtiResourceLinkRequest)', () => {
        const claims = validClaims();
        claims[LTI_SPEC.claims.messageType] = 'LtiDeepLinkingRequest';

        expect(() => driver._validateLtiClaims(claims)).toThrow('message type');
    });

    it('rejects wrong version (spec requires 1.3.0)', () => {
        const claims = validClaims();
        claims[LTI_SPEC.claims.version] = '1.2.0';

        expect(() => driver._validateLtiClaims(claims)).toThrow('version');
    });

    it('rejects missing deployment_id', () => {
        const claims = validClaims();
        delete claims[LTI_SPEC.claims.deploymentId];

        expect(() => driver._validateLtiClaims(claims)).toThrow('deployment_id');
    });

    it('rejects missing resource_link.id', () => {
        const claims = validClaims();
        claims[LTI_SPEC.claims.resourceLink] = {}; // missing .id

        expect(() => driver._validateLtiClaims(claims)).toThrow('resource_link');
    });

    it('rejects missing sub claim', () => {
        const claims = validClaims();
        delete claims.sub;

        expect(() => driver._validateLtiClaims(claims)).toThrow('sub');
    });

    it('uses spec-defined claim namespace URIs (not custom strings)', () => {
        // Verify the driver checks the exact IMS spec URIs
        const claims = validClaims();

        // These must be the spec-defined URIs, not our own invention
        expect(LTI_SPEC.claims.messageType).toBe('https://purl.imsglobal.org/spec/lti/claim/message_type');
        expect(LTI_SPEC.claims.version).toBe('https://purl.imsglobal.org/spec/lti/claim/version');
        expect(LTI_SPEC.claims.deploymentId).toBe('https://purl.imsglobal.org/spec/lti/claim/deployment_id');
        expect(LTI_SPEC.claims.resourceLink).toBe('https://purl.imsglobal.org/spec/lti/claim/resource_link');

        // And the driver accepts them
        expect(() => driver._validateLtiClaims(claims)).not.toThrow();
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: Launch Data Extraction
// Verifies the driver reads claims from spec-defined namespaces
// ═════════════════════════════════════════════════════════════════════

describe('LTI 1.3 Spec: Launch Data Claim Extraction', () => {
    it('extracts roles from spec-defined claim namespace', () => {
        const driver = new LtiDriver();
        driver._isConnected = true;
        driver._mock = false;
        driver._claims = {
            sub: 'user-123',
            name: 'Test User',
            [LTI_SPEC.claims.roles]: ['Learner'],
            [LTI_SPEC.claims.resourceLink]: { id: 'link-1' },
            [LTI_SPEC.claims.context]: { id: 'ctx-1', title: 'Test Course' },
            [LTI_SPEC.claims.launchPresentation]: { return_url: 'https://lms.example.com/return' }
        };

        const launchData = driver.getLaunchData();
        expect(launchData.userId).toBe('user-123');
        expect(launchData.roles).toEqual(['Learner']);
        expect(launchData.resourceLinkId).toBe('link-1');
        expect(launchData.contextId).toBe('ctx-1');
        expect(launchData.contextTitle).toBe('Test Course');
        expect(launchData.returnUrl).toBe('https://lms.example.com/return');
    });
});

// ═════════════════════════════════════════════════════════════════════
// Tests: AGS 2.0 Score Reporting
// ═════════════════════════════════════════════════════════════════════

describe('LTI 1.3 Spec: AGS Score Payload', () => {
    let driver, capturedRequests;

    beforeEach(() => {
        driver = new LtiDriver();
        driver._isConnected = true;
        driver._mock = false;
        driver._claims = { sub: 'user-123' };
        driver._agsLineItemUrl = 'https://lms.example.com/lineitems/1';
        driver._accessToken = 'test-token';

        capturedRequests = [];

        // Mock fetch to capture AGS requests
        globalThis.fetch = async (url, options) => {
            capturedRequests.push({
                url,
                method: options?.method,
                headers: options?.headers,
                body: options?.body ? JSON.parse(options.body) : null
            });
            return { ok: true, status: 200 };
        };
    });

    it('posts score to /scores endpoint (AGS Section 6.1)', async () => {
        driver._score = 0.85;
        driver._completionStatus = 'completed';
        driver._successStatus = 'passed';

        await driver._postScore();

        expect(capturedRequests[0].url).toBe('https://lms.example.com/lineitems/1/scores');
        expect(capturedRequests[0].method).toBe('POST');
    });

    it('uses spec-defined content-type header', async () => {
        driver._score = 0.85;
        driver._completionStatus = 'completed';
        driver._successStatus = 'passed';

        await driver._postScore();

        expect(capturedRequests[0].headers['Content-Type']).toBe(LTI_SPEC.agsScore.contentType);
    });

    it('includes userId in score payload', async () => {
        driver._score = 0.85;
        driver._completionStatus = 'completed';
        driver._successStatus = 'passed';

        await driver._postScore();

        expect(capturedRequests[0].body.userId).toBe('user-123');
    });

    it('maps scoreGiven as score * 100 (percentage)', async () => {
        driver._score = 0.85;
        driver._completionStatus = 'completed';
        driver._successStatus = 'passed';

        await driver._postScore();

        expect(capturedRequests[0].body.scoreGiven).toBe(85);
        expect(capturedRequests[0].body.scoreMaximum).toBe(100);
    });

    it('activityProgress is a spec-valid value', async () => {
        driver._score = 0.85;
        driver._completionStatus = 'completed';
        driver._successStatus = 'passed';

        await driver._postScore();

        expect(LTI_SPEC.agsScore.activityProgressVocabulary).toContain(
            capturedRequests[0].body.activityProgress
        );
    });

    it('activityProgress = "Completed" when completion is "completed"', async () => {
        driver._score = 0.85;
        driver._completionStatus = 'completed';
        driver._successStatus = 'passed';

        await driver._postScore();

        expect(capturedRequests[0].body.activityProgress).toBe('Completed');
    });

    it('activityProgress = "InProgress" when not completed', async () => {
        driver._score = 0.5;
        driver._completionStatus = 'incomplete';
        driver._successStatus = 'unknown';

        await driver._postScore();

        expect(capturedRequests[0].body.activityProgress).toBe('InProgress');
    });

    it('gradingProgress is a spec-valid value', async () => {
        driver._score = 0.85;
        driver._completionStatus = 'completed';
        driver._successStatus = 'passed';

        await driver._postScore();

        expect(LTI_SPEC.agsScore.gradingProgressVocabulary).toContain(
            capturedRequests[0].body.gradingProgress
        );
    });

    it('gradingProgress = "FullyGraded" when success is known', async () => {
        driver._score = 0.85;
        driver._completionStatus = 'completed';
        driver._successStatus = 'passed';

        await driver._postScore();

        expect(capturedRequests[0].body.gradingProgress).toBe('FullyGraded');
    });

    it('gradingProgress = "NotReady" when success is unknown', async () => {
        driver._score = 0.5;
        driver._completionStatus = 'incomplete';
        driver._successStatus = 'unknown';

        await driver._postScore();

        expect(capturedRequests[0].body.gradingProgress).toBe('NotReady');
    });

    it('includes ISO 8601 timestamp', async () => {
        driver._score = 0.85;
        driver._completionStatus = 'completed';
        driver._successStatus = 'passed';

        await driver._postScore();

        // Must be a valid ISO 8601 timestamp
        const ts = capturedRequests[0].body.timestamp;
        expect(new Date(ts).toISOString()).toBe(ts);
    });

    it('does not post score when no score is set', async () => {
        driver._score = null;
        driver._completionStatus = 'completed';

        await driver._postScore();

        expect(capturedRequests).toHaveLength(0);
    });

    it('does not post score when no AGS endpoint configured', async () => {
        driver._score = 0.85;
        driver._agsLineItemUrl = null;

        await driver._postScore();

        expect(capturedRequests).toHaveLength(0);
    });
});
