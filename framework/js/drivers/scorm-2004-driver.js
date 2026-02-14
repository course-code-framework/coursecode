/**
 * @file scorm-2004-driver.js
 * @description SCORM 2004 4th Edition driver implementation using pipwerks wrapper.
 * Extends ScormDriverBase for shared pipwerks initialization and connection management.
 *
 * Handles direct communication with the LMS API (API_1484_11).
 * Uses the industry-standard pipwerks SCORM wrapper for battle-tested
 * API discovery across complex iframe/opener hierarchies.
 */

import { ScormDriverBase } from './scorm-driver-base.js';
import { eventBus } from '../core/event-bus.js';
import { logger } from '../utilities/logger.js';
import LZString from 'lz-string';

/**
 * SCORM 2004 4th Edition Driver
 * Communicates with window.API_1484_11 via the pipwerks SCORM wrapper.
 */
export class Scorm2004Driver extends ScormDriverBase {
    constructor() {
        super();
        this._isRecovered = false; // Flag for "Already Initialized" recovery

        // CMI cache — populated at init, updated on writes
        this._cmiCache = {
            entry: null,
            bookmark: '',
            completionStatus: 'unknown',
            successStatus: 'unknown',
            learnerId: '',
            learnerName: '',
            objectives: {},               // Cached objectives keyed by ID
            objectiveIdToIndex: new Map(), // Maps objective ID → CMI index
            interactions: [],              // Cached interactions array
            interactionsCount: 0           // Current count for append operations
        };
    }

    // ============================================================================
    // Interface Implementation
    // ============================================================================

    getFormat() {
        return 'scorm2004';
    }

    getCapabilities() {
        return {
            supportsObjectives: true,
            supportsInteractions: true,
            supportsComments: true,
            supportsEmergencySave: false,
            maxSuspendDataBytes: 64000,
            asyncCommit: false
        };
    }

    /**
     * Initializes the SCORM 2004 connection using pipwerks.
     * Handles the standard Initialize() call and recovers gracefully from Error 103.
     * @returns {Promise<boolean>} True if connected (fresh or recovered)
     */
    async initialize() {
        if (this._isConnected) {
            logger.error('Scorm2004Driver.initialize() called more than once.', { domain: 'scorm', operation: 'Initialize (redundant call)' });
            return true;
        }

        await this._initPipwerks('2004');

        let result = false;
        let error = null;

        // Get API handle for potential recovery
        const api = this._scorm.API.getHandle();

        // Wrap init() in try-catch because some API adapters
        // throw exceptions instead of returning "false" when already initialized.
        try {
            result = this._scorm.init();
        } catch (e) {
            logger.warn('[Scorm2004Driver] pipwerks init() threw an error:', e);
            if (e.message && (e.message.includes('Already initialized') || e.message.includes('103'))) {
                error = { code: '103', message: e.message };
            } else {
                throw e;
            }
        }

        if (!result && !error) {
            error = this._getScormError();
        }

        // Handle Error 103 (Already Initialized) gracefully
        if (!result || error) {
            if (error && (error.code === '103' || error.code === 103 || (error.message && error.message.includes('Already initialized')))) {
                logger.warn('[Scorm2004Driver] Session already initialized (Error 103). Recovering session...');

                if (api) {
                    logger.debug('[Scorm2004Driver] Session is active (Error 103). Forcing recovery.');

                    // Mark pipwerks connection as active for recovery
                    this._scorm.connection.isActive = true;

                    this._isConnected = true;
                    this._isRecovered = true;
                    this._populateCache();
                    return true;
                } else {
                    logger.error('[Scorm2004Driver] Could not get raw API handle for recovery.');
                }
            }

            const msg = error ? `SCORM initialization failed: ${error.message}` : 'SCORM initialization failed';
            logger.error(msg, { domain: 'scorm', operation: 'Initialize', ...error });
            throw new Error(msg);
        }

        this._isConnected = true;
        this._populateCache();
        logger.debug('[Scorm2004Driver] Initialize() completed successfully via pipwerks');
        return true;
    }

    /**
     * Terminates the SCORM 2004 connection.
     * Overrides base to provide detailed SCORM error reporting.
     */
    async terminate() {
        if (!this._isConnected || this._isTerminated) {
            return true;
        }

        const success = this._scorm.quit();
        this._isTerminated = success;

        if (!success) {
            const error = this._getScormError();
            const msg = error ? `SCORM termination failed: ${error.message}` : 'SCORM termination failed';
            logger.error(msg, { domain: 'scorm', operation: 'Terminate', ...error });
            throw new Error(msg);
        }

        return true;
    }

    /**
     * Commits buffered writes to the LMS.
     * Overrides base to handle Error 103 recovery mode.
     */
    async commit() {
        this._ensureInitialized();

        if (this._isTerminated) {
            if (import.meta.env.DEV) {
                logger.warn('[Scorm2004Driver] Ignoring commit() - SCORM session already terminated');
            }
            return false;
        }

        if (this._isRecovered) {
            return this._commitRecovered();
        }

        const success = this._scorm.save();

        if (!success) {
            logger.error('[Scorm2004Driver] Commit failed.');
            const error = this._getScormError();
            this._throwScormError('Commit', 'SCORM commit failed', error);
        }

        return true;
    }

    /**
     * Sends a keep-alive ping to the LMS to maintain session.
     * Uses a read-only GetValue call that doesn't affect state.
     */
    ping() {
        if (!this._isConnected || this._isTerminated) {
            return;
        }

        try {
            if (this._isRecovered) {
                const api = this._scorm.API.getHandle();
                if (api) api.GetValue('cmi.mode');
            } else {
                this._scorm.get('cmi.mode');
            }
        } catch (e) {
            logger.warn('[Scorm2004Driver] Keep-alive ping failed:', e);
        }
    }

    // ============================================================================
    // Semantic Reads
    // ============================================================================

    getEntryMode() {
        return this._cmiCache.entry || '';
    }

    getBookmark() {
        return this._cmiCache.bookmark || '';
    }

    getCompletion() {
        return this._cmiCache.completionStatus || 'unknown';
    }

    getSuccess() {
        return this._cmiCache.successStatus || 'unknown';
    }

    getScore() {
        const scaledStr = this._getValueOptional('cmi.score.scaled');
        if (scaledStr === null) return null;
        const scaled = parseFloat(scaledStr);
        if (isNaN(scaled)) return null;
        const rawStr = this._getValueOptional('cmi.score.raw');
        const minStr = this._getValueOptional('cmi.score.min');
        const maxStr = this._getValueOptional('cmi.score.max');
        return {
            scaled,
            raw: rawStr !== null ? parseFloat(rawStr) : scaled * 100,
            min: minStr !== null ? parseFloat(minStr) : 0,
            max: maxStr !== null ? parseFloat(maxStr) : 100
        };
    }

    getLearnerInfo() {
        return {
            id: this._cmiCache.learnerId,
            name: this._cmiCache.learnerName
        };
    }

    // ============================================================================
    // Semantic Writes
    // ============================================================================

    setBookmark(location) {
        this._setValue('cmi.location', location);
        this._cmiCache.bookmark = location;
    }

    reportScore({ raw, scaled, min, max }) {
        if (raw !== undefined) this._setValue('cmi.score.raw', String(raw));
        if (scaled !== undefined) this._setValue('cmi.score.scaled', String(scaled));
        if (min !== undefined) this._setValue('cmi.score.min', String(min));
        if (max !== undefined) this._setValue('cmi.score.max', String(max));
    }

    reportCompletion(status) {
        this._setValue('cmi.completion_status', status);
        this._cmiCache.completionStatus = status;
    }

    reportSuccess(status) {
        this._setValue('cmi.success_status', status);
        this._cmiCache.successStatus = status;
    }

    reportProgress(measure) {
        this._setValue('cmi.progress_measure', String(measure));
    }

    reportSessionTime(duration) {
        this._setValue('cmi.session_time', duration);
    }

    reportObjective(objective) {
        if (!objective || !objective.id) return;

        const index = this._getOrCreateObjectiveIndex(objective.id);

        if (objective.success_status) {
            this._setValue(`cmi.objectives.${index}.success_status`, objective.success_status);
        }
        if (objective.completion_status) {
            this._setValue(`cmi.objectives.${index}.completion_status`, objective.completion_status);
        }
        if (objective.score !== null && objective.score !== undefined) {
            const rawScore = objective.score;
            const scaledScore = rawScore / 100;
            this._setValue(`cmi.objectives.${index}.score.raw`, String(rawScore));
            this._setValue(`cmi.objectives.${index}.score.scaled`, String(scaledScore));
            this._setValue(`cmi.objectives.${index}.score.min`, '0');
            this._setValue(`cmi.objectives.${index}.score.max`, '100');
        }
        if (objective.progress_measure !== null && objective.progress_measure !== undefined) {
            this._setValue(`cmi.objectives.${index}.progress_measure`, String(objective.progress_measure));
        }
        if (objective.description) {
            this._setValue(`cmi.objectives.${index}.description`, objective.description);
        }

        // Update cache
        this._cmiCache.objectives[objective.id] = { ...objective };
    }

    reportInteraction(interaction) {
        if (!interaction || !interaction.id || !interaction.type) {
            throw new Error('Scorm2004Driver: interaction.id and interaction.type are required');
        }

        const index = this._cmiCache.interactionsCount;

        // Write required fields
        this._setValue(`cmi.interactions.${index}.id`, interaction.id);
        this._setValue(`cmi.interactions.${index}.type`, interaction.type);

        // Write optional fields
        if (interaction.learner_response !== undefined && interaction.learner_response !== null && interaction.learner_response !== '') {
            this._setValue(`cmi.interactions.${index}.learner_response`, interaction.learner_response);
        }
        if (interaction.result) {
            this._setValue(`cmi.interactions.${index}.result`, interaction.result);
        }
        if (interaction.timestamp) {
            this._setValue(`cmi.interactions.${index}.timestamp`, interaction.timestamp);
        }
        if (interaction.description) {
            this._setValue(`cmi.interactions.${index}.description`, interaction.description);
        }
        if (interaction.weighting !== undefined && interaction.weighting !== null) {
            this._setValue(`cmi.interactions.${index}.weighting`, String(interaction.weighting));
        }
        if (interaction.latency) {
            this._setValue(`cmi.interactions.${index}.latency`, interaction.latency);
        }

        // Write correct_responses
        if (interaction.correct_responses && Array.isArray(interaction.correct_responses)) {
            interaction.correct_responses.forEach((item, patternIndex) => {
                const patternValue = (typeof item === 'object' && item !== null && 'pattern' in item)
                    ? item.pattern
                    : item;
                this._setValue(`cmi.interactions.${index}.correct_responses.${patternIndex}.pattern`, patternValue);
            });
        }

        // Write objectives
        if (interaction.objectives && Array.isArray(interaction.objectives)) {
            interaction.objectives.forEach((objectiveId, objIndex) => {
                this._setValue(`cmi.interactions.${index}.objectives.${objIndex}.id`, objectiveId);
            });
        }

        // Update cache
        const result = { ...interaction, _index: index };
        this._cmiCache.interactions.push(result);
        this._cmiCache.interactionsCount++;

        logger.debug(`[Scorm2004Driver] Appended interaction "${interaction.id}" at index ${index}`);
        return result;
    }

    setExitMode(mode) {
        // 'suspend' → 'suspend', 'normal' → '' (empty string = normal exit)
        this._setValue('cmi.exit', mode === 'suspend' ? 'suspend' : '');
    }

    // ============================================================================
    // Suspend Data
    // ============================================================================

    /**
     * Gets and parses suspend_data from the LMS.
     * @returns {object|null} Parsed suspend data or null
     */
    getSuspendData() {
        const data = this._getValue('cmi.suspend_data');

        logger.debug('[Scorm2004Driver] getSuspendData() called');
        logger.debug(`[Scorm2004Driver] Raw suspend_data length: ${data ? data.length : 0}`);

        if (!data) {
            logger.debug('[Scorm2004Driver] No suspend_data found');
            return null;
        }

        // Decompress lz-string data
        const jsonString = LZString.decompressFromUTF16(data);
        if (!jsonString) {
            logger.warn('[Scorm2004Driver] Failed to decompress suspend_data - may be corrupted');
            return null;
        }

        try {
            const parsed = JSON.parse(jsonString);
            logger.debug(`[Scorm2004Driver] Successfully parsed suspend_data with ${Object.keys(parsed).length} domain(s)`);
            return parsed;
        } catch (error) {
            const msg = `Failed to parse suspend data as JSON: ${error.message}`;
            logger.error(msg, { domain: 'scorm', operation: 'GetSuspendData', stack: error.stack });
            throw new Error(msg);
        }
    }

    /**
     * Sets suspend_data in the LMS.
     * @param {object} data - The data object to store
     * @returns {boolean} True if successful
     */
    setSuspendData(data) {
        if (data === undefined || data === null) {
            const msg = 'Cannot set suspend data: data is null or undefined';
            logger.error(msg, { domain: 'scorm', operation: 'SetSuspendData', dataType: typeof data });
            throw new Error(msg);
        }

        let serialized;
        let dataSnapshot;
        try {
            dataSnapshot = {
                topLevelKeys: Object.keys(data),
                dataType: typeof data,
                isArray: Array.isArray(data),
                keyCount: Object.keys(data).length
            };

            serialized = JSON.stringify(data);
        } catch (error) {
            const msg = `Failed to serialize suspend data to JSON: ${error.message}`;
            logger.error(msg, { domain: 'scorm', operation: 'SetSuspendData', stack: error.stack, dataSnapshot });
            throw new Error(msg);
        }

        if (typeof serialized !== 'string') {
            const msg = `JSON.stringify returned invalid type: ${typeof serialized}`;
            logger.error(msg, { domain: 'scorm', operation: 'SetSuspendData' });
            throw new Error(msg);
        }

        // Compress using lz-string
        const compressed = LZString.compressToUTF16(serialized);
        const originalSizeKB = (serialized.length / 1024).toFixed(2);
        const compressedSizeKB = (compressed.length / 1024).toFixed(2);
        const compressionRatio = ((1 - compressed.length / serialized.length) * 100).toFixed(1);

        logger.debug(`[Scorm2004Driver] Compressed suspend_data: ${originalSizeKB}KB → ${compressedSizeKB}KB (${compressionRatio}% reduction)`);

        // Emit size event for monitoring
        eventBus.emit('suspend-data:size', {
            bytes: compressed.length,
            kilobytes: parseFloat(compressedSizeKB),
            originalBytes: serialized.length,
            originalKilobytes: parseFloat(originalSizeKB),
            compressionRatio: parseFloat(compressionRatio)
        });

        // Progressive warnings (SCORM 2004 has 64KB limit)
        if (compressed.length > 64000) {
            logger.error(`[Scorm2004Driver] ⚠️ CRITICAL: suspend_data is ${compressedSizeKB}KB compressed (over 64KB). Many LMSs will reject this!`);
            eventBus.emit('suspend-data:critical', { bytes: compressed.length });
        } else if (compressed.length > 32000) {
            logger.warn(`[Scorm2004Driver] ⚠️ WARNING: suspend_data is ${compressedSizeKB}KB compressed (over 32KB). Approaching critical threshold.`);
            eventBus.emit('suspend-data:warning', { bytes: compressed.length });
        } else if (compressed.length > 4096) {
            logger.info(`[Scorm2004Driver] ℹ️ INFO: suspend_data is ${compressedSizeKB}KB compressed (over 4KB).`);
        } else {
            logger.debug(`[Scorm2004Driver] ✓ suspend_data size: ${compressedSizeKB}KB compressed (healthy)`);
        }

        this._setValue('cmi.suspend_data', compressed);
        return true;
    }

    // ============================================================================
    // Private: CMI Low-Level Access
    // ============================================================================

    _getValue(key) {
        this._ensureInitialized();

        if (this._isRecovered) {
            return this._getValueRecovered(key);
        }

        const value = this._scorm.get(key);
        const error = this._getScormError();

        if (error) {
            logger.error(`[Scorm2004Driver] GetValue('${key}') failed. Raw value: "${value}". Error:`, error);
            this._throwScormError('GetValue', `Failed to get value for "${key}"`, error, { key });
        }

        if (key === 'cmi.suspend_data') {
            logger.debug('[Scorm2004Driver] getValue(\'cmi.suspend_data\') called');
            logger.debug(`[Scorm2004Driver]   Length: ${value ? value.length : 0}`);
        }

        return value || '';
    }

    _getValueOptional(key) {
        this._ensureInitialized();

        if (this._isRecovered) {
            return this._getValueOptionalRecovered(key);
        }

        const value = this._scorm.get(key);
        const errorCode = this._scorm.debug.getCode();

        // Error 403 = "Data Model Element Value Not Initialized" - expected for optional fields
        if (errorCode === 403) {
            return null;
        }

        if (errorCode !== 0) {
            const error = {
                code: errorCode,
                message: this._scorm.debug.getInfo(errorCode)
            };
            logger.error(`[Scorm2004Driver] GetValue('${key}') failed. Raw value: "${value}". Error:`, error);
            this._throwScormError('GetValue', `Failed to get value for "${key}"`, error, { key });
        }

        return value || null;
    }

    _setValue(key, value) {
        this._ensureInitialized();

        if (this._isTerminated) {
            if (import.meta.env.DEV) {
                logger.warn(`[Scorm2004Driver] Ignoring setValue('${key}') - SCORM session already terminated`);
            }
            return;
        }

        const stringValue = typeof value === 'string' ? value : String(value);

        if (this._isRecovered) {
            this._setValueRecovered(key, stringValue);
            return;
        }

        const success = this._scorm.set(key, stringValue);

        if (!success) {
            logger.error(`[Scorm2004Driver] SetValue('${key}') failed. Value length: ${stringValue.length}`);
            const error = this._getScormError();
            this._throwScormError('SetValue', `Failed to set value for "${key}"`, error, {
                key,
                valuePreview: stringValue.substring(0, 50)
            });
        }
    }

    // ============================================================================
    // Private: Cache Population
    // ============================================================================

    /**
     * Populates the CMI cache at init time. Single LMS read pass.
     */
    _populateCache() {
        // Read-only scalars
        this._cmiCache.entry = this._getValue('cmi.entry') || '';
        this._cmiCache.bookmark = this._getValue('cmi.location') || '';
        this._cmiCache.completionStatus = this._getValue('cmi.completion_status') || 'unknown';
        this._cmiCache.successStatus = this._getValue('cmi.success_status') || 'unknown';
        this._cmiCache.learnerId = this._getValue('cmi.learner_id') || '';
        this._cmiCache.learnerName = this._getValue('cmi.learner_name') || '';

        // Skip array hydration for fresh sessions
        if (this._cmiCache.entry === 'ab-initio') {
            logger.debug('[Scorm2004Driver] Fresh session — cache initialized empty');
            return;
        }

        // Load objectives from CMI arrays
        let objectivesCount = 0;
        try {
            objectivesCount = parseInt(this._getValue('cmi.objectives._count') || '0', 10);
        } catch (_e) { /* No objectives stored — normal */ }

        for (let i = 0; i < objectivesCount; i++) {
            let id;
            try {
                id = this._getValue(`cmi.objectives.${i}.id`);
            } catch (_e) { continue; }
            if (!id) continue;

            this._cmiCache.objectiveIdToIndex.set(id, i);

            const success_status = this._getValueOptional(`cmi.objectives.${i}.success_status`) || 'unknown';
            const completion_status = this._getValueOptional(`cmi.objectives.${i}.completion_status`) || 'incomplete';

            this._cmiCache.objectives[id] = {
                id,
                success_status,
                completion_status,
                score: null,
                progress_measure: null
            };

            const scoreRaw = this._getValueOptional(`cmi.objectives.${i}.score.raw`);
            if (scoreRaw) {
                const parsed = parseFloat(scoreRaw);
                if (!isNaN(parsed)) {
                    this._cmiCache.objectives[id].score = parsed;
                }
            }

            const progressMeasure = this._getValueOptional(`cmi.objectives.${i}.progress_measure`);
            if (progressMeasure) {
                const parsed = parseFloat(progressMeasure);
                if (!isNaN(parsed)) {
                    this._cmiCache.objectives[id].progress_measure = parsed;
                }
            }

            const description = this._getValueOptional(`cmi.objectives.${i}.description`);
            if (description) {
                this._cmiCache.objectives[id].description = description;
            }
        }

        // Load interactions from CMI arrays
        let interactionsCount = 0;
        try {
            interactionsCount = parseInt(this._getValue('cmi.interactions._count') || '0', 10);
        } catch (_e) { /* No interactions stored — normal */ }
        this._cmiCache.interactionsCount = isNaN(interactionsCount) ? 0 : interactionsCount;

        for (let i = 0; i < interactionsCount; i++) {
            const interaction = { _index: i };

            try { interaction.id = this._getValue(`cmi.interactions.${i}.id`) || ''; } catch (_e) { interaction.id = ''; }
            try { interaction.type = this._getValue(`cmi.interactions.${i}.type`) || ''; } catch (_e) { interaction.type = ''; }

            interaction.learner_response = this._getValueOptional(`cmi.interactions.${i}.learner_response`) || '';
            interaction.result = this._getValueOptional(`cmi.interactions.${i}.result`) || 'neutral';
            interaction.timestamp = this._getValueOptional(`cmi.interactions.${i}.timestamp`) || '';
            interaction.description = this._getValueOptional(`cmi.interactions.${i}.description`) || '';

            const weighting = this._getValueOptional(`cmi.interactions.${i}.weighting`);
            if (weighting) {
                const parsed = parseFloat(weighting);
                if (!isNaN(parsed)) {
                    interaction.weighting = parsed;
                }
            }

            const latency = this._getValueOptional(`cmi.interactions.${i}.latency`);
            if (latency) interaction.latency = latency;

            this._cmiCache.interactions.push(interaction);
        }

        logger.debug(`[Scorm2004Driver] Cache populated: ${objectivesCount} objective(s), ${interactionsCount} interaction(s)`);
    }

    /**
     * Gets or creates a CMI objective index for the given ID.
     */
    _getOrCreateObjectiveIndex(objectiveId) {
        if (this._cmiCache.objectiveIdToIndex.has(objectiveId)) {
            return this._cmiCache.objectiveIdToIndex.get(objectiveId);
        }

        const newIndex = this._cmiCache.objectiveIdToIndex.size;
        this._setValue(`cmi.objectives.${newIndex}.id`, objectiveId);
        this._cmiCache.objectiveIdToIndex.set(objectiveId, newIndex);

        return newIndex;
    }

    // ============================================================================
    // Private Helpers
    // ============================================================================

    _getScormError() {
        const code = this._scorm.debug.getCode();

        if (code !== 0) {
            logger.warn(`[Scorm2004Driver] getCode() returned: ${code}`);
        }

        if (code === 0) return null;

        return {
            code,
            message: this._scorm.debug.getInfo(code)
        };
    }

    _throwScormError(operation, message, error, context = {}) {
        const msg = error ? `${message}: ${error.message}` : message;
        logger.error(msg, { domain: 'scorm', operation, ...context, error });
        throw new Error(msg);
    }

    // --- Recovery Mode Helpers ---

    _getValueRecovered(key) {
        try {
            const api = this._scorm.API.getHandle();
            if (!api) throw new Error('SCORM API handle lost during recovery');

            const value = api.GetValue(key);
            const errCode = api.GetLastError ? parseInt(api.GetLastError(), 10) : 0;

            if (errCode !== 0) {
                throw new Error(`SCORM Error ${errCode}`);
            }
            return value || '';
        } catch (e) {
            this._throwScormError('GetValue (Recovered)', `Failed to get value for "${key}"`, e, { key });
        }
    }

    _getValueOptionalRecovered(key) {
        try {
            const api = this._scorm.API.getHandle();
            if (!api) throw new Error('SCORM API handle lost during recovery');

            const value = api.GetValue(key);
            const errCode = api.GetLastError ? parseInt(api.GetLastError(), 10) : 0;

            if (errCode === 403) {
                return null;
            }

            if (errCode !== 0) {
                throw new Error(`SCORM Error ${errCode}`);
            }
            return value || null;
        } catch (e) {
            this._throwScormError('GetValue (Recovered)', `Failed to get value for "${key}"`, e, { key });
        }
    }

    _setValueRecovered(key, value) {
        try {
            const api = this._scorm.API.getHandle();
            if (!api) throw new Error('SCORM API handle lost during recovery');

            const result = api.SetValue(key, value);
            const success = result === 'true' || result === true;

            if (!success) {
                const errCode = api.GetLastError ? parseInt(api.GetLastError(), 10) : 0;
                throw new Error(`SCORM Error ${errCode}`);
            }
        } catch (e) {
            this._throwScormError('SetValue (Recovered)', `Failed to set value for "${key}"`, e, { key });
        }
    }

    _commitRecovered() {
        try {
            const api = this._scorm.API.getHandle();
            if (!api) throw new Error('SCORM API handle lost during recovery');

            const result = api.Commit('');
            const success = result === 'true' || result === true;

            if (!success) {
                const errCode = api.GetLastError ? parseInt(api.GetLastError(), 10) : 0;
                throw new Error(`SCORM Error ${errCode}`);
            }
            return true;
        } catch (e) {
            this._throwScormError('Commit (Recovered)', 'Failed to commit', e);
        }
    }
}
