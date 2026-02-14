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
    }

    // =========================================================================
    // Interface Implementation
    // =========================================================================

    getFormat() {
        return 'scorm1.2';
    }

    getCapabilities() {
        return {
            supportsObjectives: true,
            supportsInteractions: true,
            supportsComments: false,   // SCORM 1.2 comments are read-only
            supportsEmergencySave: false,
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
            const raw = parseFloat(rawStr);
            if (isNaN(raw)) return null;
            const minStr = this._scorm.get('cmi.core.score.min');
            const maxStr = this._scorm.get('cmi.core.score.max');
            return {
                scaled: raw / 100,
                raw,
                min: minStr ? parseFloat(minStr) : 0,
                max: maxStr ? parseFloat(maxStr) : 100
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
        if (min !== undefined) this._rawSet('cmi.core.score.min', String(min));
        if (max !== undefined) this._rawSet('cmi.core.score.max', String(max));
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

        // SCORM 1.2 objectives support: id, score.raw, score.min, score.max, status
        // But NOT success_status or completion_status separately
        // We write what we can
        const index = this._getOrCreateObjectiveIndex(objective.id);

        if (objective.score !== null && objective.score !== undefined) {
            this._rawSet(`cmi.objectives.${index}.score.raw`, String(objective.score));
            this._rawSet(`cmi.objectives.${index}.score.min`, '0');
            this._rawSet(`cmi.objectives.${index}.score.max`, '100');

            // Map success_status to 1.2 objective status
            if (objective.success_status === 'passed') {
                this._rawSet(`cmi.objectives.${index}.status`, 'passed');
            } else if (objective.success_status === 'failed') {
                this._rawSet(`cmi.objectives.${index}.status`, 'failed');
            }
        }

        if (objective.completion_status === 'completed' && !objective.success_status) {
            this._rawSet(`cmi.objectives.${index}.status`, 'completed');
        }
    }

    reportInteraction(interaction) {
        if (!interaction || !interaction.id || !interaction.type) {
            throw new Error('Scorm12Driver: interaction.id and interaction.type are required');
        }

        const index = this._cache.interactionsCount;

        // SCORM 1.2 interaction fields
        this._rawSet(`cmi.interactions.${index}.id`, interaction.id);
        this._rawSet(`cmi.interactions.${index}.type`, interaction.type);

        if (interaction.learner_response !== undefined && interaction.learner_response !== null && interaction.learner_response !== '') {
            this._rawSet(`cmi.interactions.${index}.student_response`, interaction.learner_response);
        }
        if (interaction.result) {
            this._rawSet(`cmi.interactions.${index}.result`, interaction.result);
        }
        if (interaction.timestamp) {
            this._rawSet(`cmi.interactions.${index}.time`, interaction.timestamp);
        }
        if (interaction.weighting !== undefined && interaction.weighting !== null) {
            this._rawSet(`cmi.interactions.${index}.weighting`, String(interaction.weighting));
        }
        if (interaction.latency) {
            this._rawSet(`cmi.interactions.${index}.latency`, interaction.latency);
        }

        // correct_responses
        if (interaction.correct_responses && Array.isArray(interaction.correct_responses)) {
            interaction.correct_responses.forEach((item, patternIndex) => {
                const patternValue = (typeof item === 'object' && item !== null && 'pattern' in item)
                    ? item.pattern
                    : item;
                this._rawSet(`cmi.interactions.${index}.correct_responses.${patternIndex}.pattern`, patternValue);
            });
        }

        // objectives
        if (interaction.objectives && Array.isArray(interaction.objectives)) {
            interaction.objectives.forEach((objectiveId, objIndex) => {
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
        const data = this._scorm.get('cmi.suspend_data') || '';

        if (!data) {
            return null;
        }

        const jsonString = LZString.decompressFromUTF16(data);
        if (!jsonString) {
            logger.warn('[Scorm12Driver] Failed to decompress suspend_data');
            return null;
        }

        try {
            const parsed = JSON.parse(jsonString);
            return this._expandDietState(parsed);
        } catch (error) {
            logger.error('[Scorm12Driver] Failed to parse suspend_data:', error);
            throw new Error(`Failed to parse suspend data: ${error.message}`);
        }
    }

    setSuspendData(data) {
        if (data === undefined || data === null) {
            throw new Error('Cannot set suspend data: data is null or undefined');
        }

        // STRICT DIET MODE: Always prune, never adaptive
        const dietData = this._createDietState(data);

        const serialized = JSON.stringify(dietData);
        const compressed = LZString.compressToUTF16(serialized);

        const compressedSizeKB = (compressed.length / 1024).toFixed(2);
        logger.debug(`[Scorm12Driver] Diet suspend_data: ${compressedSizeKB}KB compressed`);

        if (compressed.length > 4000) {
            logger.error(`[Scorm12Driver] ⚠️ CRITICAL: Strict diet still exceeds 4KB! (${compressedSizeKB}KB)`);
            eventBus.emit('suspend-data:critical', { bytes: compressed.length, format: 'scorm1.2' });
        }

        this._rawSet('cmi.suspend_data', compressed);
        return true;
    }

    // =========================================================================
    // Strict Diet Mode Implementation
    // =========================================================================

    _createDietState(fullState) {
        const diet = {};

        // Use cached bookmark (the authoritative location)
        const currentSlide = this._cache.bookmark || null;

        if (fullState.navigation) {
            diet.nav = {
                cur: currentSlide,
                vis: fullState.navigation.visitedSlides
            };
        }

        if (fullState.accessibility) {
            diet.acc = fullState.accessibility;
        }

        if (fullState.flags && Object.keys(fullState.flags).length > 0) {
            diet.flg = fullState.flags;
        }

        if (fullState.engagement) {
            diet.eng = {};
            for (const [slideId, slideState] of Object.entries(fullState.engagement)) {
                diet.eng[slideId] = { c: slideState.complete ? 1 : 0 };
            }
        }

        if (fullState.interactionResponses && currentSlide) {
            if (fullState.interactionResponses[currentSlide]) {
                diet.int = { [currentSlide]: fullState.interactionResponses[currentSlide] };
            }
        }

        for (const [key, value] of Object.entries(fullState)) {
            if (key.startsWith('assessment_')) {
                diet[`as_${key.substring(11)}`] = value;
            }
        }

        return diet;
    }

    _expandDietState(dietState) {
        const expanded = {};

        if (dietState.nav) {
            expanded.navigation = {
                currentSlide: dietState.nav.cur,
                visitedSlides: dietState.nav.vis || []
            };
        }

        if (dietState.acc) {
            expanded.accessibility = dietState.acc;
        }

        if (dietState.flg) {
            expanded.flags = dietState.flg;
        }

        if (dietState.eng) {
            expanded.engagement = {};
            for (const [slideId, slideState] of Object.entries(dietState.eng)) {
                expanded.engagement[slideId] = {
                    complete: slideState.c === 1,
                    tracked: {}
                };
            }
        }

        if (dietState.int) {
            expanded.interactionResponses = dietState.int;
        }

        for (const [key, value] of Object.entries(dietState)) {
            if (key.startsWith('as_')) {
                expanded[`assessment_${key.substring(3)}`] = value;
            }
        }

        return expanded;
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

        // Read interactions count for append tracking
        try {
            const parsed = parseInt(this._scorm.get('cmi.interactions._count') || '0', 10);
            this._cache.interactionsCount = isNaN(parsed) ? 0 : parsed;
        } catch (_e) {
            this._cache.interactionsCount = 0;
        }
    }

    /**
     * Objective index tracking (same pattern as SCORM 2004 but 1.2-native).
     */
    _objectiveIdToIndex = new Map();

    _getOrCreateObjectiveIndex(objectiveId) {
        if (this._objectiveIdToIndex.has(objectiveId)) {
            return this._objectiveIdToIndex.get(objectiveId);
        }

        const newIndex = this._objectiveIdToIndex.size;
        this._rawSet(`cmi.objectives.${newIndex}.id`, objectiveId);
        this._objectiveIdToIndex.set(objectiveId, newIndex);

        return newIndex;
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
            logger.warn(`[Scorm12Driver] Failed to sync lesson_status to: ${lessonStatus}`);
        }
    }
}

// Exported for unit testing
export {
    mapStatusTo12,
    mapStatusTo2004,
    convertTimeFormat2004To12
};
