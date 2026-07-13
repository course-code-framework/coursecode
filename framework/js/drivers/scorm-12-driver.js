/**
 * @file scorm-12-driver.js
 * @description SCORM 1.2 driver implementation using pipwerks wrapper.
 * Extends ScormDriverBase for shared pipwerks initialization and connection management.
 *
 * Handles communication with the LMS API and element mapping from 2004 to 1.2.
 * Implements Strict Diet Mode to stay within 4KB suspend_data limit.
 *
 * Uses the industry-standard pipwerks SCORM wrapper for battle-tested
 * API discovery across complex iframe/opener hierarchies.
 */

import { ScormDriverBase } from './scorm-driver-base.js';
import { eventBus } from '../core/event-bus.js';
import { logger } from '../utilities/logger.js';
import LZString from 'lz-string';
import { serializeInteractionForScorm12 } from '../validation/scorm-validators.js';

const SCORM12_SUSPEND_PREFIX = 'CC12:';

function parseFiniteNumber(value, fallback = null) {
    if (value === null || value === undefined || String(value).trim() === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNonNegativeInteger(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

// =============================================================================
// Status Mapping
// =============================================================================

/**
 * Maps SCORM 2004 completion_status + success_status to SCORM 1.2 lesson_status.
 * SCORM 1.2 has a single combined status field.
 */
function mapStatusTo12(completionStatus, successStatus) {
    if (completionStatus === 'completed') {
        if (successStatus === 'passed') return 'passed';
        if (successStatus === 'failed') return 'failed';
        return 'completed';
    }

    if (completionStatus === 'incomplete') return 'incomplete';
    if (completionStatus === 'not attempted') return 'not attempted';

    return 'incomplete';
}

/**
 * Maps SCORM 1.2 lesson_status to SCORM 2004 completion + success status.
 */
function mapStatusTo2004(lessonStatus) {
    switch (lessonStatus) {
        case 'passed':
            return { completion: 'completed', success: 'passed' };
        case 'failed':
            return { completion: 'completed', success: 'failed' };
        case 'completed':
            return { completion: 'completed', success: 'unknown' };
        case 'incomplete':
            return { completion: 'incomplete', success: 'unknown' };
        case 'not attempted':
            return { completion: 'not attempted', success: 'unknown' };
        case 'browsed':
            return { completion: 'incomplete', success: 'unknown' };
        default:
            return { completion: 'unknown', success: 'unknown' };
    }
}

function mapObjectiveStatusTo12(completionStatus, successStatus) {
    if (successStatus === 'passed') return 'passed';
    if (successStatus === 'failed') return 'failed';
    return mapStatusTo12(completionStatus, successStatus);
}

// =============================================================================
// Time Format Conversion
// =============================================================================

/**
 * Converts ISO 8601 duration (SCORM 2004) to HHHH:MM:SS (SCORM 1.2).
 */
function convertTimeFormat2004To12(iso8601) {
    if (!iso8601 || typeof iso8601 !== 'string') return '0000:00:00';

    const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (!match) return '0000:00:00';

    const hours = parseInt(match[1] || 0, 10);
    const minutes = parseInt(match[2] || 0, 10);
    const seconds = Math.floor(parseFloat(match[3] || 0));

    const hStr = hours.toString().padStart(4, '0');
    const mStr = minutes.toString().padStart(2, '0');
    const sStr = seconds.toString().padStart(2, '0');

    return `${hStr}:${mStr}:${sStr}`;
}

/**
 * Converts a SCORM 2004 timestamp to the SCORM 1.2 interaction time format.
 * SCORM 1.2 stores only the time-of-day portion in cmi.interactions.n.time.
 */
function convertTimestamp2004To12(timestamp) {
    if (!timestamp || typeof timestamp !== 'string') return '00:00:00';
    const match = timestamp.match(/(?:T|^)(\d{2}):(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}:${match[3]}` : '00:00:00';
}

/**
 * Produces the compact suspend-data representation used by SCORM 1.2.
 * Version 2 is lossless: the previous diet silently discarded objective,
 * engagement, response, metadata, and extension-domain state on every save.
 */
function createScorm12DietState(fullState, currentSlide = null) {
    const state = { ...fullState };
    if (fullState.navigation && currentSlide) {
        state.navigation = { ...fullState.navigation, currentSlide };
    }
    return { v: 2, s: state };
}

function expandScorm12DietState(dietState) {
    if (dietState?.v === 2 && dietState.s && typeof dietState.s === 'object') {
        return dietState.s;
    }

    // Backward-compatible reader for packages published with the original
    // lossy diet representation.
    const expanded = {};

    if (dietState.nav) {
        expanded.navigation = {
            currentSlide: dietState.nav.cur,
            visitedSlides: dietState.nav.vis || []
        };
    }
    if (dietState.acc) expanded.accessibility = dietState.acc;
    if (dietState.flg) expanded.flags = dietState.flg;

    if (dietState.eng) {
        expanded.engagement = {};
        for (const [slideId, slideState] of Object.entries(dietState.eng)) {
            expanded.engagement[slideId] = {
                complete: slideState.c === 1,
                tracked: {}
            };
        }
    }

    if (dietState.int) expanded.interactionResponses = dietState.int;

    for (const [key, value] of Object.entries(dietState)) {
        if (key.startsWith('as_')) expanded[`assessment_${key.substring(3)}`] = value;
    }

    return expanded;
}

function encodeScorm12SuspendState(state) {
    return SCORM12_SUSPEND_PREFIX + LZString.compressToEncodedURIComponent(JSON.stringify(state));
}

function decodeScorm12SuspendState(value) {
    if (value.startsWith(SCORM12_SUSPEND_PREFIX)) {
        const decoded = LZString.decompressFromEncodedURIComponent(
            value.slice(SCORM12_SUSPEND_PREFIX.length)
        );
        if (!decoded) throw new Error('SCORM 1.2 suspend_data is corrupted or truncated');
        return JSON.parse(decoded);
    }

    // Read legacy UTF-16 CourseCode state without writing it back until a
    // successful, explicit commit migrates it to the ASCII-safe format.
    const legacy = LZString.decompressFromUTF16(value);
    if (!legacy) throw new Error('SCORM 1.2 suspend_data is corrupted or uses an unsupported encoding');
    return JSON.parse(legacy);
}

// =============================================================================
// SCORM 1.2 Driver Class (using pipwerks)
// =============================================================================

export class Scorm12Driver extends ScormDriverBase {
    constructor() {
        super();

        // Cache for combined status (1.2 uses single field)
        this._statusCache = {
            completion: 'unknown',
            success: 'unknown'
        };

        // Semantic cache populated at init
        this._cache = {
            entry: '',
            bookmark: '',
            learnerId: '',
            learnerName: '',
            interactionsCount: 0
        };
        this._objectiveIdToIndex = new Map();
        this._objectivesCount = 0;
        this._supportsObjectives = false;
        this._supportsInteractions = false;
        this._scoreChildren = new Set(['raw']);
    }

    // =========================================================================
    // Interface Implementation
    // =========================================================================

    getFormat() {
        return 'scorm1.2';
    }

    getCapabilities() {
        return {
            supportsObjectives: this._supportsObjectives,
            supportsInteractions: this._supportsInteractions,
            supportsComments: false,   // SCORM 1.2 comments are read-only
            supportsEmergencySave: true,
            maxSuspendDataBytes: 4096,
            asyncCommit: false
        };
    }

    /**
     * Initializes the SCORM 1.2 connection using pipwerks.
     */
    async initialize() {
        if (this._isConnected) {
            return true;
        }

        await this._initPipwerks('1.2');

        const success = this._scorm.init();

        if (!success) {
            throw new Error('[Scorm12Driver] pipwerks LMSInitialize failed - cannot find SCORM 1.2 API');
        }

        this._isConnected = true;
        this._populateCache();

        logger.debug('[Scorm12Driver] LMSInitialize() completed successfully via pipwerks');
        return true;
    }

    /**
     * Sends a keep-alive ping to the LMS.
     */
    ping() {
        if (!this._isConnected || this._isTerminated) {
            return;
        }

        try {
            this._scorm.get('cmi.core.lesson_mode');
        } catch (e) {
            logger.warn('[Scorm12Driver] Keep-alive ping failed:', e);
        }
    }

    // =========================================================================
    // Semantic Reads
    // =========================================================================

    getEntryMode() {
        return this._cache.entry;
    }

    getBookmark() {
        return this._cache.bookmark;
    }

    getCompletion() {
        return this._statusCache.completion;
    }

    getSuccess() {
        return this._statusCache.success;
    }

    getScore() {
        try {
            const rawStr = this._scorm.get('cmi.core.score.raw');
            if (!rawStr) return null;
            const raw = parseFiniteNumber(rawStr);
            if (raw === null) return null;
            const minStr = this._scoreChildren.has('min') ? this._scorm.get('cmi.core.score.min') : '';
            const maxStr = this._scoreChildren.has('max') ? this._scorm.get('cmi.core.score.max') : '';
            return {
                scaled: raw / 100,
                raw,
                min: parseFiniteNumber(minStr, 0),
                max: parseFiniteNumber(maxStr, 100)
            };
        } catch (_e) {
            return null;
        }
    }

    getLearnerInfo() {
        return {
            id: this._cache.learnerId,
            name: this._cache.learnerName
        };
    }

    // =========================================================================
    // Semantic Writes
    // =========================================================================

    setBookmark(location) {
        this._rawSet('cmi.core.lesson_location', location);
        this._cache.bookmark = location;
    }

    reportScore({ raw, min, max }) {
        // SCORM 1.2 doesn't have scaled score — silently ignored
        if (raw !== undefined) this._rawSet('cmi.core.score.raw', String(raw));
        if (min !== undefined && this._scoreChildren.has('min')) this._rawSet('cmi.core.score.min', String(min));
        if (max !== undefined && this._scoreChildren.has('max')) this._rawSet('cmi.core.score.max', String(max));
    }

    reportCompletion(status) {
        this._statusCache.completion = status;
        this._syncLessonStatus();
    }

    reportSuccess(status) {
        this._statusCache.success = status;
        this._syncLessonStatus();
    }

    reportProgress(_measure) {
        // SCORM 1.2 has no progress_measure — silently ignored
    }

    reportSessionTime(duration) {
        const converted = convertTimeFormat2004To12(duration);
        this._rawSet('cmi.core.session_time', converted);
    }

    reportObjective(objective) {
        if (!objective || !objective.id) return;
        if (!this._supportsObjectives) return;

        // SCORM 1.2 objectives support: id, score.raw, score.min, score.max, status
        // But NOT success_status or completion_status separately
        // We write what we can
        const index = this._getOrCreateObjectiveIndex(objective.id);

        if (objective.score !== null && objective.score !== undefined) {
            this._rawSet(`cmi.objectives.${index}.score.raw`, String(objective.score));
            this._rawSet(`cmi.objectives.${index}.score.min`, '0');
            this._rawSet(`cmi.objectives.${index}.score.max`, '100');
        }

        if (objective.completion_status !== undefined || objective.success_status !== undefined) {
            this._rawSet(
                `cmi.objectives.${index}.status`,
                mapObjectiveStatusTo12(objective.completion_status, objective.success_status)
            );
        }
    }

    reportInteraction(interaction) {
        if (!interaction || !interaction.id || !interaction.type) {
            throw new Error('Scorm12Driver: interaction.id and interaction.type are required');
        }

        if (!this._supportsInteractions) {
            return { ...interaction, _index: null, nativeCmiSkipped: true };
        }

        const serializedInteraction = serializeInteractionForScorm12(interaction);

        const index = this._cache.interactionsCount;

        // SCORM 1.2 interaction fields
        this._rawSet(`cmi.interactions.${index}.id`, serializedInteraction.id);
        this._rawSet(`cmi.interactions.${index}.type`, serializedInteraction.type);

        if (serializedInteraction.learner_response !== '') {
            this._rawSet(`cmi.interactions.${index}.student_response`, serializedInteraction.learner_response);
        }
        if (serializedInteraction.result) {
            this._rawSet(`cmi.interactions.${index}.result`, serializedInteraction.result);
        }
        if (interaction.timestamp) {
            this._rawSet(`cmi.interactions.${index}.time`, convertTimestamp2004To12(interaction.timestamp));
        }
        if (interaction.weighting !== undefined && interaction.weighting !== null) {
            this._rawSet(`cmi.interactions.${index}.weighting`, String(interaction.weighting));
        }
        if (interaction.latency) {
            this._rawSet(`cmi.interactions.${index}.latency`, convertTimeFormat2004To12(interaction.latency));
        }

        // correct_responses
        if (serializedInteraction.correct_responses && Array.isArray(serializedInteraction.correct_responses)) {
            serializedInteraction.correct_responses.forEach((item, patternIndex) => {
                const patternValue = (typeof item === 'object' && item !== null && 'pattern' in item)
                    ? item.pattern
                    : item;
                this._rawSet(`cmi.interactions.${index}.correct_responses.${patternIndex}.pattern`, patternValue);
            });
        }

        // objectives
        if (serializedInteraction.objectives && Array.isArray(serializedInteraction.objectives)) {
            serializedInteraction.objectives.forEach((objectiveId, objIndex) => {
                this._rawSet(`cmi.interactions.${index}.objectives.${objIndex}.id`, objectiveId);
            });
        }

        this._cache.interactionsCount++;

        const result = { ...interaction, _index: index };
        logger.debug(`[Scorm12Driver] Appended interaction "${interaction.id}" at index ${index}`);
        return result;
    }

    setExitMode(mode) {
        this._rawSet('cmi.core.exit', mode === 'suspend' ? 'suspend' : '');
    }

    // =========================================================================
    // Suspend Data (with Strict Diet Mode)
    // =========================================================================

    getSuspendData() {
        const data = this._rawGet('cmi.suspend_data');

        if (!data) {
            return null;
        }

        try {
            const parsed = decodeScorm12SuspendState(data);
            return this._expandDietState(parsed);
        } catch (error) {
            logger.error('[Scorm12Driver] Failed to decode suspend_data:', error);
            throw new Error(`SCORM 1.2 resume state cannot be safely restored: ${error.message}`);
        }
    }

    setSuspendData(data) {
        if (data === undefined || data === null) {
            throw new Error('Cannot set suspend data: data is null or undefined');
        }

        // STRICT DIET MODE: Always prune, never adaptive
        const dietData = createScorm12DietState(data, this._cache.bookmark || null);

        const compressed = encodeScorm12SuspendState(dietData);

        const compressedSizeKB = (compressed.length / 1024).toFixed(2);
        logger.debug(`[Scorm12Driver] Diet suspend_data: ${compressedSizeKB}KB compressed`);

        if (compressed.length > 4000) {
            logger.error(`[Scorm12Driver] ⚠️ CRITICAL: Strict diet still exceeds 4KB! (${compressedSizeKB}KB)`);
            eventBus.emit('suspend-data:critical', { bytes: compressed.length, format: 'scorm1.2' });
        }
        if (compressed.length > 4096) {
            throw new Error(`SCORM 1.2 suspend_data exceeds the 4096-character limit (${compressed.length})`);
        }

        this._rawSet('cmi.suspend_data', compressed);
        return true;
    }

    // =========================================================================
    // Strict Diet Mode Implementation
    // =========================================================================

    _createDietState(fullState) {
        return createScorm12DietState(fullState, this._cache.bookmark || null);
    }

    _expandDietState(dietState) {
        return expandScorm12DietState(dietState);
    }

    // =========================================================================
    // Private Helpers
    // =========================================================================

    /**
     * Populates the semantic cache at init time.
     */
    _populateCache() {
        // Read entry mode
        const entryRaw = this._scorm.get('cmi.core.entry') || '';
        // SCORM 1.2 entry: 'ab-initio', 'resume', ''
        this._cache.entry = entryRaw;

        // Read bookmark
        this._cache.bookmark = this._scorm.get('cmi.core.lesson_location') || '';

        // Read learner info
        this._cache.learnerId = this._scorm.get('cmi.core.student_id') || '';
        this._cache.learnerName = this._scorm.get('cmi.core.student_name') || '';

        // Read combined status
        const lessonStatus = this._scorm.get('cmi.core.lesson_status');
        this._statusCache = mapStatusTo2004(lessonStatus);

        const scoreChildren = this._readChildren('cmi.core.score._children');
        this._scoreChildren = new Set(['raw', ...scoreChildren]);

        const topLevelChildren = this._readChildren('cmi._children');
        this._supportsObjectives = topLevelChildren.has('objectives');
        this._supportsInteractions = topLevelChildren.has('interactions');

        // Read interactions count for append tracking
        try {
            if (!this._supportsInteractions) throw new Error('interactions unsupported');
            this._cache.interactionsCount = parseNonNegativeInteger(
                this._scorm.get('cmi.interactions._count') || '0'
            );
        } catch (_e) {
            this._cache.interactionsCount = 0;
        }

        this._objectiveIdToIndex.clear();
        try {
            if (!this._supportsObjectives) throw new Error('objectives unsupported');
            this._objectivesCount = parseNonNegativeInteger(
                this._scorm.get('cmi.objectives._count') || '0'
            );
        } catch (_e) {
            this._objectivesCount = 0;
        }
        for (let i = 0; i < this._objectivesCount; i++) {
            try {
                const id = this._scorm.get(`cmi.objectives.${i}.id`) || '';
                if (id) this._objectiveIdToIndex.set(id, i);
            } catch (_e) {
                // Preserve the LMS-reported count even if one optional row is unreadable.
            }
        }
    }

    /**
     * Objective index tracking (same pattern as SCORM 2004 but 1.2-native).
     */
    _getOrCreateObjectiveIndex(objectiveId) {
        if (this._objectiveIdToIndex.has(objectiveId)) {
            return this._objectiveIdToIndex.get(objectiveId);
        }

        const newIndex = this._objectivesCount;
        this._rawSet(`cmi.objectives.${newIndex}.id`, objectiveId);
        this._objectiveIdToIndex.set(objectiveId, newIndex);
        this._objectivesCount++;

        return newIndex;
    }

    _readChildren(key) {
        try {
            return new Set(
                String(this._scorm.get(key) || '')
                    .split(',')
                    .map(value => value.trim())
                    .filter(Boolean)
            );
        } catch (_error) {
            return new Set();
        }
    }

    _rawGet(key12) {
        const value = this._scorm.get(key12);
        const code = Number(this._scorm.debug?.getCode?.() || 0);
        if (code !== 0) {
            const info = this._scorm.debug?.getInfo?.(code) || `SCORM error ${code}`;
            throw new Error(`Failed to get value for "${key12}": ${info}`);
        }
        return value || '';
    }

    /**
     * Low-level raw SCORM 1.2 set. No mapping, no translation.
     */
    _rawSet(key12, value) {
        if (this._isTerminated) {
            if (import.meta.env.DEV) {
                logger.warn(`[Scorm12Driver] Ignoring setValue('${key12}') - session terminated`);
            }
            return;
        }

        const stringValue = typeof value === 'string' ? value : String(value);
        const success = this._scorm.set(key12, stringValue);

        if (!success) {
            logger.error(`[Scorm12Driver] LMSSetValue('${key12}') failed`);
            throw new Error(`Failed to set value for "${key12}"`);
        }
    }

    /**
     * Syncs the combined lesson_status to the LMS.
     */
    _syncLessonStatus() {
        if (this._isTerminated) {
            if (import.meta.env.DEV) {
                logger.warn('[Scorm12Driver] Ignoring _syncLessonStatus() - session terminated');
            }
            return;
        }

        const lessonStatus = mapStatusTo12(this._statusCache.completion, this._statusCache.success);
        const success = this._scorm.set('cmi.core.lesson_status', lessonStatus);

        if (!success) {
            throw new Error(`[Scorm12Driver] Failed to sync lesson_status to: ${lessonStatus}`);
        }
    }
}

// Exported for unit testing
export {
    mapStatusTo12,
    mapStatusTo2004,
    mapObjectiveStatusTo12,
    convertTimeFormat2004To12,
    convertTimestamp2004To12,
    createScorm12DietState,
    expandScorm12DietState,
    encodeScorm12SuspendState,
    decodeScorm12SuspendState
};
