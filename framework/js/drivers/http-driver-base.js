/**
 * @file http-driver-base.js
 * @description Base class for HTTP-based LMS drivers (cmi5, LTI).
 * Consolidates shared mock state management, suspend data caching,
 * semantic reads/writes, and commit logic.
 *
 * Subclasses must implement:
 * - getFormat()
 * - getCapabilities()
 * - initialize()
 * - terminate()
 * - emergencySave()
 * - getLearnerInfo()
 * - getLaunchData()
 * - _loadMockState()
 * - _saveMockState()
 * - _persistState()
 */

import { eventBus } from '../core/event-bus.js';
import { logger } from '../utilities/logger.js';

export class HttpDriverBase {
    constructor() {
        this._isConnected = false;
        this._isTerminated = false;
        this._mock = false;
        this._mockState = {};
        this._devApi = null;

        // Local caches for synchronous access (pre-fetched on initialize)
        this._suspendDataCache = null;
        this._bookmarkCache = null;
        this._suspendDataDirty = false;
        this._bookmarkDirty = false;

        // Cached status values
        this._completionStatus = 'unknown';
        this._successStatus = 'unknown';
        this._score = null;
    }

    // =========================================================================
    // Interface: Lifecycle Queries
    // =========================================================================

    isConnected() {
        return this._isConnected;
    }

    isTerminated() {
        return this._isTerminated;
    }

    /**
     * Keep-alive ping — no-op for HTTP-based drivers (stateless).
     */
    ping() {
        // HTTP-based drivers use stateless requests — no session keep-alive needed
    }

    // =========================================================================
    // Interface: Commit
    // =========================================================================

    async commit() {
        this._ensureInitialized();

        if (this._isTerminated) {
            return false;
        }

        if (this._mock) {
            this._saveMockState();
            return true;
        }

        await this._persistState();
        return true;
    }

    // =========================================================================
    // Interface: Semantic Reads
    // =========================================================================

    getEntryMode() {
        return this._bookmarkCache ? 'resume' : 'ab-initio';
    }

    getBookmark() {
        return this._bookmarkCache || '';
    }

    getCompletion() {
        return this._completionStatus;
    }

    getSuccess() {
        return this._successStatus;
    }

    getScore() {
        if (this._score === null) return null;
        const raw = Math.round(this._score * 100 * 100) / 100;
        return { scaled: this._score, raw, min: 0, max: 100 };
    }

    // =========================================================================
    // Interface: Semantic Writes
    // =========================================================================

    setBookmark(location) {
        this._bookmarkCache = location;
        this._bookmarkDirty = true;
        if (this._mock) this._saveMockState();
    }

    reportScore({ raw, scaled, min: _min, max: _max }) {
        if (scaled !== undefined) {
            this._score = scaled;
        } else if (raw !== undefined) {
            this._score = raw / 100;
        }
    }

    reportCompletion(status) {
        this._completionStatus = status;
    }

    reportSuccess(status) {
        this._successStatus = status;
    }

    reportProgress(_measure) {
        // HTTP-based drivers don't have a native progress_measure
    }

    reportSessionTime(_duration) {
        // Session time handled by protocol-specific mechanisms
    }

    reportObjective(_objective) {
        // Objectives stored via suspend_data only
    }

    reportInteraction(_interaction) {
        // Interactions stored via suspend_data only
    }

    setExitMode(_mode) {
        // HTTP-based drivers don't have an exit mode concept
    }

    // =========================================================================
    // Interface: Suspend Data
    // =========================================================================

    getSuspendData() {
        this._ensureInitialized();

        if (this._mock) {
            return this._mockState.suspendData || null;
        }

        return this._suspendDataCache;
    }

    setSuspendData(data) {
        this._ensureInitialized();

        if (data === undefined || data === null) {
            throw new Error('Cannot set suspend_data: data is null or undefined');
        }

        if (this._mock) {
            this._mockState.suspendData = data;
            this._saveMockState();
            return true;
        }

        this._suspendDataCache = data;
        this._suspendDataDirty = true;

        const sizeKB = (JSON.stringify(data).length / 1024).toFixed(2);
        logger.debug(`[${this.constructor.name}] suspend_data cached: ${sizeKB}KB`);

        eventBus.emit('suspend-data:size', {
            bytes: JSON.stringify(data).length,
            kilobytes: parseFloat(sizeKB),
            format: this.getFormat()
        });

        return true;
    }

    // =========================================================================
    // Shared Mock Helpers
    // =========================================================================

    /**
     * Shared mock terminate flow — logs completion/success/failure/terminated
     * statements and calls devApi.terminate(). Returns true.
     */
    _terminateMock() {
        this._saveMockState();
        if (this._completionStatus === 'completed') {
            this._logMockStatement('completed', { verb: 'completed' });
        }
        if (this._successStatus === 'passed') {
            this._logMockStatement('passed', { verb: 'passed', score: this._score });
        } else if (this._successStatus === 'failed') {
            this._logMockStatement('failed', { verb: 'failed', score: this._score });
        }
        this._logMockStatement('terminated', { verb: 'terminated' });
        if (this._devApi) {
            this._devApi.terminate();
        }
        this._isTerminated = true;
        logger.debug(`[${this.constructor.name}] Mock session terminated`);
        return true;
    }

    _logMockStatement(type, data) {
        const statement = { type, data, timestamp: new Date().toISOString() };
        logger.debug(`[${this.constructor.name}] Mock ${type} statement:`, statement);
        eventBus.emit('xapi:statement', statement);
        if (this._devApi && typeof this._devApi.recordStatement === 'function') {
            this._devApi.recordStatement(statement);
        }
    }

    // =========================================================================
    // Internal Utilities
    // =========================================================================

    _ensureInitialized() {
        if (!this._isConnected) {
            throw new Error(`${this.getFormat()} not initialized. Call initialize() first.`);
        }
    }
}
