/**
 * @file scorm-driver-base.js
 * @description Base class for pipwerks-based SCORM drivers (2004, 1.2).
 * Consolidates shared pipwerks initialization, connection state, and utilities.
 *
 * Subclasses must implement:
 * - getFormat()
 * - getCapabilities()
 * - initialize() (calls _initPipwerks)
 * - terminate()
 * - commit()
 * - ping()
 * - _populateCache()
 * - All semantic reads/writes
 * - getSuspendData() / setSuspendData()
 */

import { logger } from '../utilities/logger.js';

export class ScormDriverBase {
    constructor() {
        this._isConnected = false;
        this._isTerminated = false;
        this._scorm = null; // Initialized lazily via _initPipwerks()
    }

    // =========================================================================
    // Interface: Connection State
    // =========================================================================

    isConnected() {
        return this._isConnected;
    }

    isTerminated() {
        return this._isTerminated;
    }

    // =========================================================================
    // Shared Initialization
    // =========================================================================

    /**
     * Dynamically imports pipwerks and configures it for the specified SCORM version.
     * Call this from the subclass initialize() method.
     * @param {'2004'|'1.2'} version - SCORM version to force
     * @returns {Promise<void>}
     */
    async _initPipwerks(version) {
        const pipwerksModule = await import('../vendor/pipwerks.js');
        const pipwerks = pipwerksModule.default;

        this._scorm = pipwerks.SCORM;
        this._scorm.version = version;

        // Disable pipwerks auto-handling — we manage status ourselves
        this._scorm.handleCompletionStatus = false;
        this._scorm.handleExitMode = false;
    }

    // =========================================================================
    // Shared Utilities
    // =========================================================================

    _ensureInitialized() {
        if (!this._isConnected) {
            throw new Error(`${this.getFormat()} not initialized. Call initialize() first.`);
        }
    }

    /**
     * Terminates the SCORM connection via pipwerks quit().
     * Used directly by SCORM 1.2; overridden by SCORM 2004 for error details.
     */
    async terminate() {
        if (!this._isConnected || this._isTerminated) {
            return true;
        }

        const success = this._scorm.quit();
        this._isTerminated = success;

        if (!success) {
            throw new Error(`[${this.constructor.name}] SCORM termination failed`);
        }

        return true;
    }

    /**
     * Commits buffered writes via pipwerks save().
     * SCORM 2004 overrides this for recovery mode support.
     */
    async commit() {
        this._ensureInitialized();

        if (this._isTerminated) {
            if (import.meta.env.DEV) {
                logger.warn(`[${this.constructor.name}] Ignoring commit() - SCORM session already terminated`);
            }
            return false;
        }

        const success = this._scorm.save();

        if (!success) {
            throw new Error(`[${this.constructor.name}] SCORM commit failed`);
        }

        return true;
    }

    /**
     * Synchronous best-effort commit and termination for pagehide.
     * StateManager writes the latest suspend_data and exit mode immediately
     * before this call. SCORM API calls are synchronous, so the session is
     * finished here (browsers do not wait for async work during unload); a
     * later terminate() is then a no-op.
     */
    emergencySave() {
        if (!this._isConnected || this._isTerminated) return;

        let saved = false;
        try {
            saved = this._scorm.save();
        } catch (error) {
            logger.error(`[${this.constructor.name}] Emergency commit threw:`, error);
        }

        // Terminate even if the commit failed: Terminate/LMSFinish performs an
        // implicit commit on most LMSs and is the last chance to do so.
        let terminated = false;
        try {
            terminated = this._scorm.quit();
        } catch (error) {
            logger.error(`[${this.constructor.name}] Emergency termination threw:`, error);
        }
        this._isTerminated = terminated;

        if (!saved || !terminated) {
            throw new Error(`[${this.constructor.name}] SCORM emergency ${saved ? 'termination' : 'commit'} failed`);
        }
    }
}
