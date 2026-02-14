/**
 * @file proxy-driver.js
 * @description LMS driver for externally-hosted courses using postMessage bridge.
 * 
 * Used by courses deployed to CDN when LMS has a proxy package installed.
 * All LMS API calls are relayed via postMessage to the parent proxy frame,
 * which bridges to the actual LMS API using pipwerks.
 * 
 * Pre-fetches all needed values during initialize() for synchronous access,
 * eliminating the broken _sendMessageSync hack.
 */

import { logger } from '../utilities/logger.js';

// Message timeout (ms) — if proxy doesn't respond, something is wrong
const MESSAGE_TIMEOUT = 5000;

/**
 * ProxyDriver — LMSDriver implementation via postMessage
 */
export class ProxyDriver {
    constructor(baseFormat = 'scorm1.2') {
        this._baseFormat = baseFormat; // 'scorm1.2' or 'scorm2004'
        this._isConnected = false;
        this._isTerminated = false;
        this._msgId = 0;
        this._pending = new Map(); // id -> { resolve, reject, timeout }

        // Origin of the parent proxy frame (set during initialize)
        // Used for postMessage origin validation
        this._parentOrigin = '*'; // Fallback — overridden with real origin when available

        // Pre-fetched cache populated during initialize()
        this._cache = {
            entry: '',
            bookmark: '',
            learnerId: '',
            learnerName: '',
            completion: 'unknown',
            success: 'unknown'
        };

        this._suspendDataCache = null;

        // Listen for responses from proxy bridge
        this._handleMessage = this._handleMessage.bind(this);
        window.addEventListener('message', this._handleMessage);
    }

    // =========================================================================
    // Interface Implementation
    // =========================================================================

    getFormat() {
        return `${this._baseFormat}-proxy`;
    }

    isConnected() {
        return this._isConnected;
    }

    isTerminated() {
        return this._isTerminated;
    }

    getCapabilities() {
        // Mirror base format capabilities, but note async commit
        const isScorm2004 = this._baseFormat === 'scorm2004';
        return {
            supportsObjectives: true,
            supportsInteractions: true,
            supportsComments: isScorm2004,
            supportsEmergencySave: false,
            maxSuspendDataBytes: isScorm2004 ? 65536 : 4096,
            asyncCommit: true // postMessage is inherently async
        };
    }

    async initialize() {
        if (this._isConnected) {
            logger.warn('ProxyDriver: Already initialized');
            return true;
        }

        // Must be in an iframe
        if (window.parent === window) {
            throw new Error('ProxyDriver: Not running in iframe - proxy mode requires parent frame');
        }

        // Derive expected parent origin from document.referrer
        // The referrer is the LMS/proxy page that loaded this iframe
        try {
            if (document.referrer) {
                const referrerUrl = new URL(document.referrer);
                this._parentOrigin = referrerUrl.origin;
                logger.debug('ProxyDriver: Parent origin from referrer:', this._parentOrigin);
            } else {
                logger.warn('ProxyDriver: No document.referrer available — using wildcard origin. Some LMS strip the Referer header.');
            }
        } catch {
            logger.warn('ProxyDriver: Could not parse document.referrer — using wildcard origin');
        }

        try {
            const result = await this._sendMessage('Initialize');
            if (result === true || result === 'true') {
                this._isConnected = true;
                logger.info('ProxyDriver: Connected via proxy bridge');

                // Pre-fetch all needed values for synchronous access
                await this._prefetch();

                return true;
            }
            throw new Error('ProxyDriver: Initialize returned false');
        } catch (error) {
            logger.error('ProxyDriver: Initialize failed', error);
            throw error;
        }
    }

    async terminate() {
        if (this._isTerminated) {
            logger.warn('ProxyDriver: Already terminated');
            return true;
        }

        if (!this._isConnected) {
            logger.warn('ProxyDriver: Cannot terminate - not connected');
            return false;
        }

        try {
            const result = await this._sendMessage('Terminate');
            this._isTerminated = true;
            this._isConnected = false;
            window.removeEventListener('message', this._handleMessage);
            logger.info('ProxyDriver: Terminated');
            return result === true || result === 'true';
        } catch (error) {
            logger.error('ProxyDriver: Terminate failed', error);
            this._isTerminated = true;
            this._isConnected = false;
            throw error;
        }
    }

    async commit() {
        this._ensureConnected();
        try {
            const result = await this._sendMessage('Commit');
            return result === true || result === 'true';
        } catch (error) {
            logger.error('ProxyDriver: Commit failed', error);
            throw error;
        }
    }

    ping() {
        if (this._isConnected && !this._isTerminated) {
            this._sendMessage('GetValue', 'cmi.learner_id').catch(() => {
                // Ignore ping errors
            });
        }
    }

    // =========================================================================
    // Semantic Reads (served from pre-fetched cache)
    // =========================================================================

    getEntryMode() {
        return this._cache.entry;
    }

    getBookmark() {
        return this._cache.bookmark;
    }

    getCompletion() {
        return this._cache.completion;
    }

    getSuccess() {
        return this._cache.success;
    }

    getLearnerInfo() {
        return {
            id: this._cache.learnerId,
            name: this._cache.learnerName
        };
    }

    // =========================================================================
    // Semantic Writes (fire-and-forget to proxy)
    // =========================================================================

    setBookmark(location) {
        this._cache.bookmark = location;
        const key = this._baseFormat === 'scorm1.2' ? 'cmi.core.lesson_location' : 'cmi.location';
        this._sendSetValue(key, location);
    }

    reportScore({ raw, scaled, min, max }) {
        const prefix = this._baseFormat === 'scorm1.2' ? 'cmi.core.score' : 'cmi.score';
        if (raw !== undefined) this._sendSetValue(`${prefix}.raw`, String(raw));
        if (min !== undefined) this._sendSetValue(`${prefix}.min`, String(min));
        if (max !== undefined) this._sendSetValue(`${prefix}.max`, String(max));
        if (scaled !== undefined && this._baseFormat === 'scorm2004') {
            this._sendSetValue('cmi.score.scaled', String(scaled));
        }
    }

    reportCompletion(status) {
        this._cache.completion = status;
        if (this._baseFormat === 'scorm1.2') {
            // SCORM 1.2 uses combined lesson_status — proxy bridge handles mapping
            this._sendSetValue('cmi.completion_status', status);
        } else {
            this._sendSetValue('cmi.completion_status', status);
        }
    }

    reportSuccess(status) {
        this._cache.success = status;
        if (this._baseFormat === 'scorm1.2') {
            this._sendSetValue('cmi.success_status', status);
        } else {
            this._sendSetValue('cmi.success_status', status);
        }
    }

    reportProgress(measure) {
        if (this._baseFormat === 'scorm2004') {
            this._sendSetValue('cmi.progress_measure', String(measure));
        }
    }

    reportSessionTime(duration) {
        if (this._baseFormat === 'scorm1.2') {
            // Proxy bridge will handle time format conversion
            this._sendSetValue('cmi.session_time', duration);
        } else {
            this._sendSetValue('cmi.session_time', duration);
        }
    }

    reportObjective(objective) {
        if (!objective || !objective.id) return;
        // Objectives are stored in suspend_data, not via CMI in proxy mode
        // The proxy bridge doesn't relay complex array writes reliably
    }

    reportInteraction(interaction) {
        if (!interaction || !interaction.id) return;
        // Interactions are stored in suspend_data, not via CMI in proxy mode
    }

    setExitMode(mode) {
        const key = this._baseFormat === 'scorm1.2' ? 'cmi.core.exit' : 'cmi.exit';
        this._sendSetValue(key, mode === 'suspend' ? 'suspend' : '');
    }

    // =========================================================================
    // Suspend Data
    // =========================================================================

    getSuspendData() {
        this._ensureConnected();
        return this._suspendDataCache;
    }

    setSuspendData(data) {
        this._ensureConnected();
        const value = JSON.stringify(data);
        this._sendSetValue('cmi.suspend_data', value);
        this._suspendDataCache = data;
        return true;
    }

    // =========================================================================
    // Private: Pre-fetch Strategy (eliminates _sendMessageSync)
    // =========================================================================

    /**
     * Pre-fetch all needed values during initialize() for synchronous access.
     * This eliminates the broken _sendMessageSync hack.
     */
    async _prefetch() {
        const is12 = this._baseFormat === 'scorm1.2';

        // Batch all reads in parallel
        const keys = is12 ? {
            entry: 'cmi.core.entry',
            bookmark: 'cmi.core.lesson_location',
            learnerId: 'cmi.core.student_id',
            learnerName: 'cmi.core.student_name',
            status: 'cmi.core.lesson_status',
            suspendData: 'cmi.suspend_data'
        } : {
            entry: 'cmi.entry',
            bookmark: 'cmi.location',
            learnerId: 'cmi.learner_id',
            learnerName: 'cmi.learner_name',
            completion: 'cmi.completion_status',
            success: 'cmi.success_status',
            suspendData: 'cmi.suspend_data'
        };

        // Fire all reads in parallel
        const results = {};
        const promises = Object.entries(keys).map(async ([fieldName, cmiKey]) => {
            try {
                results[fieldName] = await this._sendMessage('GetValue', cmiKey);
            } catch {
                results[fieldName] = '';
            }
        });

        await Promise.all(promises);

        // Populate cache from results
        this._cache.bookmark = results.bookmark || '';
        this._cache.learnerId = results.learnerId || '';
        this._cache.learnerName = results.learnerName || '';

        if (is12) {
            // SCORM 1.2: single lesson_status → split into completion + success
            const status = results.status || '';
            if (status === 'passed') {
                this._cache.completion = 'completed';
                this._cache.success = 'passed';
            } else if (status === 'failed') {
                this._cache.completion = 'completed';
                this._cache.success = 'failed';
            } else if (status === 'completed') {
                this._cache.completion = 'completed';
                this._cache.success = 'unknown';
            } else {
                this._cache.completion = status || 'unknown';
                this._cache.success = 'unknown';
            }
            this._cache.entry = results.entry || '';
        } else {
            this._cache.completion = results.completion || 'unknown';
            this._cache.success = results.success || 'unknown';
            this._cache.entry = results.entry || '';
        }

        // Parse suspend_data
        if (results.suspendData) {
            try {
                this._suspendDataCache = JSON.parse(results.suspendData);
            } catch {
                this._suspendDataCache = null;
            }
        }

        logger.debug('ProxyDriver: Pre-fetch complete', {
            bookmark: this._cache.bookmark,
            completion: this._cache.completion,
            hasSuspendData: this._suspendDataCache !== null
        });
    }

    // =========================================================================
    // Private: postMessage Transport
    // =========================================================================

    _ensureConnected() {
        if (!this._isConnected) {
            throw new Error('ProxyDriver: Not connected');
        }
        if (this._isTerminated) {
            throw new Error('ProxyDriver: Session terminated');
        }
    }

    /**
     * Fire-and-forget setValue to proxy bridge.
     */
    _sendSetValue(key, value) {
        this._sendMessage('SetValue', key, String(value)).catch(err => {
            logger.error(`ProxyDriver: SetValue failed for ${key}`, err);
        });
    }

    /**
     * Send async message to proxy bridge.
     */
    _sendMessage(method, ...args) {
        return new Promise((resolve, reject) => {
            const id = ++this._msgId;

            const timeout = setTimeout(() => {
                this._pending.delete(id);
                reject(new Error(`ProxyDriver: Timeout waiting for ${method} response`));
            }, MESSAGE_TIMEOUT);

            this._pending.set(id, { resolve, reject, timeout });

            window.parent.postMessage({
                type: 'scorm-proxy-request',
                id,
                method,
                args
            }, this._parentOrigin);
        });
    }

    /**
     * Handle response messages from proxy bridge.
     */
    _handleMessage(event) {
        const { data } = event;

        if (!data || data.type !== 'scorm-proxy-response') {
            return;
        }

        // Validate origin when we have a known parent origin
        if (this._parentOrigin !== '*' && event.origin !== this._parentOrigin) {
            logger.warn('ProxyDriver: Rejected message from unexpected origin:', event.origin);
            return;
        }

        const { id, result, error } = data;
        const pending = this._pending.get(id);

        if (!pending) {
            logger.warn(`ProxyDriver: Received response for unknown message ${id}`);
            return;
        }

        clearTimeout(pending.timeout);
        this._pending.delete(id);

        if (error) {
            pending.reject(new Error(error));
        } else {
            pending.resolve(result);
        }
    }
}
