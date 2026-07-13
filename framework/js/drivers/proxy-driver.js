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
import LZString from 'lz-string';
import {
    mapStatusTo12,
    mapObjectiveStatusTo12,
    convertTimeFormat2004To12,
    convertTimestamp2004To12,
    createScorm12DietState,
    expandScorm12DietState,
    encodeScorm12SuspendState,
    decodeScorm12SuspendState
} from './scorm-12-driver.js';
import { serializeInteractionForScorm12 } from '../validation/scorm-validators.js';

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
        this._pendingWrites = [];

        // Origin of the parent proxy frame (set during initialize)
        // Used for postMessage origin validation
        this._parentOrigin = null;

        // Pre-fetched cache populated during initialize()
        this._cache = {
            entry: '',
            bookmark: '',
            learnerId: '',
            learnerName: '',
            completion: 'unknown',
            success: 'unknown'
        };
        this._scoreCache = null;
        this._objectiveIdToIndex = new Map();
        this._objectivesCount = 0;
        this._interactionsCount = 0;
        this._supportsObjectives = this._baseFormat === 'scorm2004';
        this._supportsInteractions = this._baseFormat === 'scorm2004';
        this._scoreChildren = new Set(['raw']);
        this._handshake = null;

        this._suspendDataCache = null;

        this._handleMessage = this._handleMessage.bind(this);
        this._isListening = false;
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
            supportsObjectives: this._supportsObjectives,
            supportsInteractions: this._supportsInteractions,
            supportsComments: isScorm2004,
            supportsEmergencySave: true,
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

        // Referrer is only a target-origin optimization. Some real LMSs use a
        // no-referrer policy, so identity is established with a nonce handshake
        // bound to window.parent and then locked to the response origin.
        let handshakeTarget = '*';
        try {
            if (document.referrer) {
                const referrerUrl = new URL(document.referrer);
                handshakeTarget = referrerUrl.origin;
            } else if (window.location.ancestorOrigins?.[0]) {
                handshakeTarget = new URL(window.location.ancestorOrigins[0]).origin;
            }
        } catch { /* Handshake safely discovers the parent origin. */ }

        this._startListening();
        try {
            await this._establishHandshake(handshakeTarget);
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
            this._isConnected = false;
            this._stopListening('initialization failed');
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
            await this._flushPendingWrites();
            const result = await this._sendMessage('Terminate');
            if (result !== true && result !== 'true') {
                throw new Error('ProxyDriver: LMS Terminate returned false');
            }
            this._isTerminated = true;
            this._isConnected = false;
            this._stopListening('session terminated');
            logger.info('ProxyDriver: Terminated');
            return true;
        } catch (error) {
            logger.error('ProxyDriver: Terminate failed', error);
            throw error;
        }
    }

    async commit() {
        this._ensureConnected();
        try {
            await this._flushPendingWrites();
            const result = await this._sendMessage('Commit');
            if (result !== true && result !== 'true') {
                throw new Error('ProxyDriver: LMS Commit returned false');
            }
            return true;
        } catch (error) {
            logger.error('ProxyDriver: Commit failed', error);
            throw error;
        }
    }

    ping() {
        if (this._isConnected && !this._isTerminated) {
            const key = this._baseFormat === 'scorm1.2' ? 'cmi.core.student_id' : 'cmi.learner_id';
            this._sendMessage('GetValue', key).catch(() => {
                // Ignore ping errors
            });
        }
    }

    emergencySave() {
        if (!this._isConnected || this._isTerminated || !this._parentOrigin) return;
        try {
            window.parent.postMessage({
                type: 'scorm-proxy-request',
                id: null,
                method: 'EmergencySave',
                args: []
            }, this._parentOrigin);
        } catch (error) {
            logger.error('ProxyDriver: Emergency save message failed', {
                domain: 'scorm-proxy',
                operation: 'emergencySave',
                format: this.getFormat(),
                error: error.message,
                stack: error.stack
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

    getScore() {
        return this._scoreCache ? { ...this._scoreCache } : null;
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
        if (min !== undefined && (!this._isScorm12() || this._scoreChildren.has('min'))) {
            this._sendSetValue(`${prefix}.min`, String(min));
        }
        if (max !== undefined && (!this._isScorm12() || this._scoreChildren.has('max'))) {
            this._sendSetValue(`${prefix}.max`, String(max));
        }
        if (scaled !== undefined && this._baseFormat === 'scorm2004') {
            this._sendSetValue('cmi.score.scaled', String(scaled));
        }
        const resolvedRaw = raw ?? (scaled !== undefined ? scaled * 100 : null);
        const resolvedScaled = scaled ?? (raw !== undefined ? raw / 100 : null);
        if (resolvedRaw !== null || resolvedScaled !== null) {
            this._scoreCache = {
                raw: resolvedRaw,
                scaled: resolvedScaled,
                min: min ?? 0,
                max: max ?? 100
            };
        }
    }

    reportCompletion(status) {
        this._cache.completion = status;
        if (this._baseFormat === 'scorm1.2') {
            this._sendSetValue(
                'cmi.core.lesson_status',
                mapStatusTo12(this._cache.completion, this._cache.success)
            );
        } else {
            this._sendSetValue('cmi.completion_status', status);
        }
    }

    reportSuccess(status) {
        this._cache.success = status;
        if (this._baseFormat === 'scorm1.2') {
            this._sendSetValue(
                'cmi.core.lesson_status',
                mapStatusTo12(this._cache.completion, this._cache.success)
            );
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
            this._sendSetValue('cmi.core.session_time', convertTimeFormat2004To12(duration));
        } else {
            this._sendSetValue('cmi.session_time', duration);
        }
    }

    reportObjective(objective) {
        if (!objective || !objective.id) return;
        if (!this._supportsObjectives) return;
        const index = this._getOrCreateObjectiveIndex(objective.id);

        if (this._baseFormat === 'scorm1.2') {
            if (objective.score !== null && objective.score !== undefined) {
                this._sendSetValue(`cmi.objectives.${index}.score.raw`, String(objective.score));
                this._sendSetValue(`cmi.objectives.${index}.score.min`, '0');
                this._sendSetValue(`cmi.objectives.${index}.score.max`, '100');
            }
            if (objective.completion_status !== undefined || objective.success_status !== undefined) {
                this._sendSetValue(
                    `cmi.objectives.${index}.status`,
                    mapObjectiveStatusTo12(objective.completion_status, objective.success_status)
                );
            }
            return;
        }

        if (objective.success_status) this._sendSetValue(`cmi.objectives.${index}.success_status`, objective.success_status);
        if (objective.completion_status) this._sendSetValue(`cmi.objectives.${index}.completion_status`, objective.completion_status);
        if (objective.score !== null && objective.score !== undefined) {
            this._sendSetValue(`cmi.objectives.${index}.score.raw`, String(objective.score));
            this._sendSetValue(`cmi.objectives.${index}.score.scaled`, String(objective.score / 100));
            this._sendSetValue(`cmi.objectives.${index}.score.min`, '0');
            this._sendSetValue(`cmi.objectives.${index}.score.max`, '100');
        }
        if (objective.progress_measure !== null && objective.progress_measure !== undefined) {
            this._sendSetValue(`cmi.objectives.${index}.progress_measure`, String(objective.progress_measure));
        }
        if (objective.description) this._sendSetValue(`cmi.objectives.${index}.description`, objective.description);
    }

    reportInteraction(interaction) {
        if (!interaction || !interaction.id || !interaction.type) return;
        if (!this._supportsInteractions) {
            return { ...interaction, _index: null, nativeCmiSkipped: true };
        }
        const index = this._interactionsCount++;
        const is12 = this._baseFormat === 'scorm1.2';
        const reported = is12 ? serializeInteractionForScorm12(interaction) : interaction;
        const prefix = `cmi.interactions.${index}`;

        this._sendSetValue(`${prefix}.id`, reported.id);
        this._sendSetValue(`${prefix}.type`, reported.type);
        if (reported.learner_response !== undefined && reported.learner_response !== null && reported.learner_response !== '') {
            this._sendSetValue(`${prefix}.${is12 ? 'student_response' : 'learner_response'}`, reported.learner_response);
        }
        if (reported.result) this._sendSetValue(`${prefix}.result`, reported.result);
        if (interaction.timestamp) {
            this._sendSetValue(
                `${prefix}.${is12 ? 'time' : 'timestamp'}`,
                is12 ? convertTimestamp2004To12(interaction.timestamp) : interaction.timestamp
            );
        }
        if (!is12 && interaction.description) this._sendSetValue(`${prefix}.description`, interaction.description);
        if (interaction.weighting !== undefined && interaction.weighting !== null) {
            this._sendSetValue(`${prefix}.weighting`, String(interaction.weighting));
        }
        if (interaction.latency) {
            this._sendSetValue(`${prefix}.latency`, is12 ? convertTimeFormat2004To12(interaction.latency) : interaction.latency);
        }
        reported.correct_responses?.forEach((item, patternIndex) => {
            const pattern = typeof item === 'object' && item !== null && 'pattern' in item ? item.pattern : item;
            this._sendSetValue(`${prefix}.correct_responses.${patternIndex}.pattern`, pattern);
        });
        reported.objectives?.forEach((objectiveId, objectiveIndex) => {
            this._sendSetValue(`${prefix}.objectives.${objectiveIndex}.id`, objectiveId);
        });
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
        const state = this._baseFormat === 'scorm1.2'
            ? createScorm12DietState(data, this._cache.bookmark || null)
            : data;
        const value = this._isScorm12()
            ? encodeScorm12SuspendState(state)
            : LZString.compressToUTF16(JSON.stringify(state));
        const limit = this._baseFormat === 'scorm1.2' ? 4096 : 64000;
        if (value.length > limit) {
            throw new Error(`${this.getFormat()} suspend_data exceeds the ${limit}-character limit (${value.length})`);
        }
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
            suspendData: 'cmi.suspend_data',
            scoreRaw: 'cmi.core.score.raw',
            scoreMin: 'cmi.core.score.min',
            scoreMax: 'cmi.core.score.max',
            objectivesCount: 'cmi.objectives._count',
            interactionsCount: 'cmi.interactions._count',
            children: 'cmi._children',
            scoreChildren: 'cmi.core.score._children'
        } : {
            entry: 'cmi.entry',
            bookmark: 'cmi.location',
            learnerId: 'cmi.learner_id',
            learnerName: 'cmi.learner_name',
            completion: 'cmi.completion_status',
            success: 'cmi.success_status',
            suspendData: 'cmi.suspend_data',
            scoreScaled: 'cmi.score.scaled',
            scoreRaw: 'cmi.score.raw',
            scoreMin: 'cmi.score.min',
            scoreMax: 'cmi.score.max',
            objectivesCount: 'cmi.objectives._count',
            interactionsCount: 'cmi.interactions._count'
        };

        // Fire all reads in parallel
        const results = {};
        const requiredFields = new Set(is12
            ? ['entry', 'bookmark', 'learnerId', 'learnerName', 'status', 'suspendData']
            : ['entry', 'bookmark', 'learnerId', 'learnerName', 'completion', 'success', 'suspendData']);
        const promises = Object.entries(keys).map(async ([fieldName, cmiKey]) => {
            try {
                results[fieldName] = await this._sendMessage('GetValue', cmiKey);
            } catch (error) {
                if (requiredFields.has(fieldName)) {
                    throw new Error(`ProxyDriver: Cannot read required LMS value ${cmiKey}: ${error.message}`);
                }
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
            const supported = new Set(String(results.children || '').split(',').map(value => value.trim()));
            this._supportsObjectives = supported.has('objectives');
            this._supportsInteractions = supported.has('interactions');
            this._scoreChildren = new Set([
                'raw',
                ...String(results.scoreChildren || '').split(',').map(value => value.trim()).filter(Boolean)
            ]);
        } else {
            this._cache.completion = results.completion || 'unknown';
            this._cache.success = results.success || 'unknown';
            this._cache.entry = results.entry || '';
        }

        const parseOptionalNumber = value => {
            if (value === '' || value === null || value === undefined) return NaN;
            return Number(value);
        };
        const raw = parseOptionalNumber(results.scoreRaw);
        const scaled = is12 ? raw / 100 : parseOptionalNumber(results.scoreScaled);
        if (Number.isFinite(raw) || Number.isFinite(scaled)) {
            this._scoreCache = {
                raw: Number.isFinite(raw) ? raw : scaled * 100,
                scaled: Number.isFinite(scaled) ? scaled : raw / 100,
                min: Number.isFinite(parseOptionalNumber(results.scoreMin)) ? Number(results.scoreMin) : 0,
                max: Number.isFinite(parseOptionalNumber(results.scoreMax)) ? Number(results.scoreMax) : 100
            };
        }

        this._objectivesCount = this._supportsObjectives ? this._parseCount(results.objectivesCount) : 0;
        this._interactionsCount = this._supportsInteractions ? this._parseCount(results.interactionsCount) : 0;
        this._objectiveIdToIndex.clear();
        for (let i = 0; i < this._objectivesCount; i++) {
            try {
                const id = await this._sendMessage('GetValue', `cmi.objectives.${i}.id`);
                if (id) this._objectiveIdToIndex.set(id, i);
            } catch {
                // Keep the LMS count authoritative even if one row cannot be read.
            }
        }

        // Parse suspend_data
        if (results.suspendData) {
            try {
                const parsed = is12
                    ? decodeScorm12SuspendState(results.suspendData)
                    : JSON.parse(LZString.decompressFromUTF16(results.suspendData));
                this._suspendDataCache = is12 ? expandScorm12DietState(parsed) : parsed;
            } catch (error) {
                throw new Error(`ProxyDriver: Resume state cannot be safely restored: ${error.message}`);
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

    _startListening() {
        if (this._isListening) return;
        window.addEventListener('message', this._handleMessage);
        this._isListening = true;
    }

    _stopListening(reason) {
        if (this._isListening) {
            window.removeEventListener('message', this._handleMessage);
            this._isListening = false;
        }

        for (const pending of this._pending.values()) {
            clearTimeout(pending.timeout);
            pending.reject(new Error(`ProxyDriver: Request cancelled because ${reason}`));
        }
        this._pending.clear();
        if (this._handshake) {
            clearTimeout(this._handshake.timeout);
            this._handshake.reject(new Error(`ProxyDriver: Handshake cancelled because ${reason}`));
            this._handshake = null;
        }
    }

    _ensureConnected() {
        if (!this._isConnected) {
            throw new Error('ProxyDriver: Not connected');
        }
        if (this._isTerminated) {
            throw new Error('ProxyDriver: Session terminated');
        }
    }

    _parseCount(value) {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
    }

    _isScorm12() {
        return this._baseFormat === 'scorm1.2';
    }

    _establishHandshake(targetOrigin) {
        return new Promise((resolve, reject) => {
            const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const timeout = setTimeout(() => {
                this._handshake = null;
                reject(new Error('ProxyDriver: Timeout waiting for secure proxy handshake'));
            }, MESSAGE_TIMEOUT);

            this._handshake = { nonce, resolve, reject, timeout };
            try {
                window.parent.postMessage({
                    type: 'scorm-proxy-handshake',
                    nonce,
                    baseFormat: this._baseFormat
                }, targetOrigin);
            } catch (error) {
                clearTimeout(timeout);
                this._handshake = null;
                reject(error);
            }
        });
    }

    _getOrCreateObjectiveIndex(objectiveId) {
        if (this._objectiveIdToIndex.has(objectiveId)) {
            return this._objectiveIdToIndex.get(objectiveId);
        }
        const index = this._objectivesCount++;
        this._objectiveIdToIndex.set(objectiveId, index);
        this._sendSetValue(`cmi.objectives.${index}.id`, objectiveId);
        return index;
    }

    /**
     * Fire-and-forget setValue to proxy bridge.
     */
    _sendSetValue(key, value) {
        const write = this._sendMessage('SetValue', key, String(value))
            .then(result => {
                if (result !== true && result !== 'true') {
                    throw new Error(`ProxyDriver: LMS rejected SetValue('${key}')`);
                }
                return true;
            })
            .catch(error => ({ error }));
        this._pendingWrites.push(write);
        return write;
    }

    async _flushPendingWrites() {
        const writes = this._pendingWrites.splice(0);
        if (writes.length === 0) return;
        const results = await Promise.all(writes);
        const failure = results.find(result => result?.error);
        if (failure) throw failure.error;
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

            try {
                window.parent.postMessage({
                    type: 'scorm-proxy-request',
                    id,
                    method,
                    args
                }, this._parentOrigin);
            } catch (error) {
                clearTimeout(timeout);
                this._pending.delete(id);
                reject(error);
            }
        });
    }

    /**
     * Handle response messages from proxy bridge.
     */
    _handleMessage(event) {
        const { data } = event;

        if (data?.type === 'scorm-proxy-handshake-response') {
            if (event.source !== window.parent || !this._handshake || data.nonce !== this._handshake.nonce) return;
            const handshake = this._handshake;
            clearTimeout(handshake.timeout);
            this._handshake = null;
            if (data.baseFormat !== this._baseFormat) {
                handshake.reject(new Error(
                    `ProxyDriver: Proxy package format ${data.baseFormat} does not match course format ${this._baseFormat}`
                ));
                return;
            }
            this._parentOrigin = event.origin;
            handshake.resolve(true);
            return;
        }

        if (!data || data.type !== 'scorm-proxy-response') {
            return;
        }

        // Validate origin when we have a known parent origin
        if (event.source !== window.parent || event.origin !== this._parentOrigin) {
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
