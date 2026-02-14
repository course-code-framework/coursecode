import { describe, it, expect } from 'vitest';
import { validateDriverInterface } from '../../../framework/js/drivers/driver-interface.js';

// ─── Driver Interface Contract ──────────────────────────────────────
// Every LMS driver (SCORM 1.2, SCORM 2004, cmi5, LTI) MUST implement
// this interface. Missing methods cause silent runtime failures in LMS.

describe('validateDriverInterface', () => {
    // Complete interface as defined in driver-interface.js
    const fullDriver = {
        // Lifecycle
        initialize: () => {},
        terminate: () => {},
        commit: () => {},
        getCapabilities: () => {},
        getFormat: () => {},
        isConnected: () => {},
        isTerminated: () => {},
        // State persistence
        getSuspendData: () => {},
        setSuspendData: () => {},
        // Semantic reads
        getEntryMode: () => {},
        getBookmark: () => {},
        getCompletion: () => {},
        getSuccess: () => {},
        getScore: () => {},
        getLearnerInfo: () => {},
        // Semantic writes
        setBookmark: () => {},
        reportScore: () => {},
        reportCompletion: () => {},
        reportSuccess: () => {},
        reportProgress: () => {},
        reportSessionTime: () => {},
        reportObjective: () => {},
        reportInteraction: () => {},
        setExitMode: () => {}
    };

    it('accepts a complete driver implementation', () => {
        expect(() => validateDriverInterface(fullDriver)).not.toThrow();
    });

    it('throws when a required method is missing', () => {
        const { initialize, ...incomplete } = fullDriver;
        expect(() => validateDriverInterface(incomplete)).toThrow(/initialize/);
    });

    it('throws on the first missing method', () => {
        // Validate it throws with a clear error naming the method
        expect(() => validateDriverInterface({})).toThrow(/missing required method/);
    });

    it('accepts extra methods (extensibility)', () => {
        const extended = { ...fullDriver, customMethod: () => {}, ping: () => {} };
        expect(() => validateDriverInterface(extended)).not.toThrow();
    });

    it('throws when method is a non-function property', () => {
        const broken = { ...fullDriver, initialize: 'not a function' };
        expect(() => validateDriverInterface(broken)).toThrow(/initialize/);
    });

    // ─── Verify categories of required methods ──────────────────────

    it('requires lifecycle methods', () => {
        for (const method of ['initialize', 'terminate', 'commit', 'getCapabilities', 'getFormat']) {
            const driver = { ...fullDriver };
            delete driver[method];
            expect(() => validateDriverInterface(driver), `should require ${method}`).toThrow(method);
        }
    });

    it('requires state persistence methods', () => {
        for (const method of ['getSuspendData', 'setSuspendData']) {
            const driver = { ...fullDriver };
            delete driver[method];
            expect(() => validateDriverInterface(driver), `should require ${method}`).toThrow(method);
        }
    });

    it('requires semantic read methods', () => {
        for (const method of ['getEntryMode', 'getBookmark', 'getCompletion', 'getSuccess', 'getLearnerInfo']) {
            const driver = { ...fullDriver };
            delete driver[method];
            expect(() => validateDriverInterface(driver), `should require ${method}`).toThrow(method);
        }
    });

    it('requires semantic write methods', () => {
        for (const method of ['setBookmark', 'reportScore', 'reportCompletion', 'reportSuccess',
            'reportProgress', 'reportSessionTime', 'reportObjective', 'reportInteraction', 'setExitMode']) {
            const driver = { ...fullDriver };
            delete driver[method];
            expect(() => validateDriverInterface(driver), `should require ${method}`).toThrow(method);
        }
    });
});
