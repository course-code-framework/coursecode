/**
 * @file standalone-driver.js
 * @description Local persistence driver for portable, single-file HTML courses.
 */

import { HttpDriverBase } from './http-driver-base.js';
import { logger } from '../utilities/logger.js';

function slug(value) {
    return String(value || 'course')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'course';
}

export class StandaloneDriver extends HttpDriverBase {
    constructor() {
        super();
        const courseId = typeof document !== 'undefined'
            ? (document.querySelector('meta[name="coursecode-id"]')?.content || document.title)
            : 'course';
        this._storageKey = `coursecode-portable:${slug(courseId)}`;
        this._storageAvailable = true;
    }

    getFormat() {
        return 'standalone';
    }

    getCapabilities() {
        return {
            supportsObjectives: true,
            supportsInteractions: true,
            supportsComments: true,
            supportsEmergencySave: true,
            maxSuspendDataBytes: 0,
            asyncCommit: false
        };
    }

    async initialize() {
        if (this._isConnected) return true;
        this._mock = true;
        this._loadMockState();
        this._isConnected = true;
        this._isTerminated = false;
        logger.debug('[StandaloneDriver] Portable course initialized', {
            restoreAvailable: this._storageAvailable,
            resumed: Boolean(this._bookmarkCache)
        });
        return true;
    }

    async terminate() {
        if (!this._isConnected || this._isTerminated) return true;
        this._saveMockState();
        this._isTerminated = true;
        return true;
    }

    emergencySave() {
        this._saveMockState();
    }

    getLearnerInfo() {
        return { id: 'local-learner', name: 'Learner' };
    }

    getLaunchData() {
        return null;
    }

    async _persistState() {
        this._saveMockState();
    }

    _loadMockState() {
        let stored;
        try {
            stored = localStorage.getItem(this._storageKey);
        } catch (error) {
            this._storageAvailable = false;
            logger.warn('[StandaloneDriver] Browser restore storage is unavailable; progress will last for this session only', {
                domain: 'standalone',
                operation: 'loadState',
                error: error.message
            });
            return;
        }

        if (!stored) return;
        try {
            const state = JSON.parse(stored);
            if (!state || typeof state !== 'object') return;

            this._mockState = state;
            this._bookmarkCache = state.bookmark || null;
            this._completionStatus = state.completionStatus || 'unknown';
            this._successStatus = state.successStatus || 'unknown';
            this._score = state.score ?? null;
        } catch (error) {
            this._mockState = {};
            logger.warn('[StandaloneDriver] Ignoring invalid saved progress and starting a new local session', {
                domain: 'standalone',
                operation: 'parseState',
                error: error.message
            });
            try {
                localStorage.removeItem(this._storageKey);
            } catch {
                this._storageAvailable = false;
            }
        }
    }

    _saveMockState() {
        const state = {
            ...this._mockState,
            bookmark: this._bookmarkCache,
            completionStatus: this._completionStatus,
            successStatus: this._successStatus,
            score: this._score
        };
        this._mockState = state;

        if (!this._storageAvailable) return;
        try {
            localStorage.setItem(this._storageKey, JSON.stringify(state));
        } catch (error) {
            this._storageAvailable = false;
            logger.warn('[StandaloneDriver] Could not persist portable course progress', {
                domain: 'standalone',
                operation: 'saveState',
                error: error.message
            });
        }
    }
}
