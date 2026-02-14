/**
 * @file state-validation.js
 * @description State hydration, validation, and migration logic.
 * Validates stored LMS state against current course structure.
 * @internal Only used by state-manager.js
 */

import { eventBus } from '../core/event-bus.js';
import { logger } from '../utilities/logger.js';

// =================================================================
// State Schema Version
// =================================================================
// Increment this when the state structure changes in incompatible ways.
const STATE_SCHEMA_VERSION = 1;

// Migration functions keyed by TARGET version number.
// Each migration transforms state from (version - 1) to (version).
const STATE_MIGRATIONS = {
    // No migrations yet - add here when STATE_SCHEMA_VERSION is incremented
};

/**
 * Handles state validation mismatches.
 * - In dev mode: Throws an error with detailed diagnostics
 * - In prod mode: Logs warning and returns the default value for graceful recovery
 */
function handleStateMismatch(domain, message, context, defaultValue) {
    const fullMessage = `[StateManager] State mismatch in "${domain}": ${message}`;

    if (import.meta.env.DEV) {
        logger.fatal(fullMessage, {
            domain: 'state',
            operation: 'validation',
            ...context,
            hint: 'This error occurs when stored LMS data is incompatible with the current course structure. ' +
                'Clear your LMS data or use a fresh learner account to test the updated course.'
        });
    } else {
        logger.warn(`${fullMessage}. Reverting to defaults.`, context);
        eventBus.emit('state:recovered', {
            domain,
            message,
            context,
            action: 'reverted_to_defaults'
        });
        return defaultValue;
    }
}

export class StateValidator {
    constructor() {
        this._validationConfig = null;
    }

    get schemaVersion() {
        return STATE_SCHEMA_VERSION;
    }

    /**
     * Sets the course configuration used for state validation.
     * Must be called BEFORE hydration to enable validation.
     */
    setCourseValidationConfig(config) {
        if (!config || typeof config !== 'object') {
            throw new Error('StateManager: validation config must be an object');
        }
        if (!config.structure || !Array.isArray(config.structure)) {
            throw new Error('StateManager: validation config must include a structure array');
        }

        const slideIds = new Set();
        const interactionIdsBySlide = new Map();

        const processItem = (item) => {
            if (item.id) {
                slideIds.add(item.id);
            }
            if (item.children && Array.isArray(item.children)) {
                item.children.forEach(processItem);
            }
        };
        config.structure.forEach(processItem);

        const objectiveIds = new Set();
        if (config.objectives && Array.isArray(config.objectives)) {
            config.objectives.forEach(obj => {
                if (obj.id) objectiveIds.add(obj.id);
            });
        }

        this._validationConfig = {
            slideIds,
            objectiveIds,
            interactionIdsBySlide,
            courseVersion: config.version || null,
            schemaVersion: STATE_SCHEMA_VERSION
        };

        logger.debug(`[StateManager] Validation config set: ${slideIds.size} slides, ${objectiveIds.size} objectives`);
    }

    /**
     * Creates a fresh state object with schema version.
     */
    createFreshState() {
        return {
            _meta: {
                schemaVersion: STATE_SCHEMA_VERSION,
                createdAt: new Date().toISOString()
            }
        };
    }

    /**
     * Hydrates state from the LMS using semantic driver reads.
     * @param {Object} lmsConnection - The LMS connection instance
     * @returns {Object} The hydrated state
     */
    hydrateStateFromLMS(lmsConnection) {
        let entryMode;
        try {
            entryMode = lmsConnection.getEntryMode();
            logger.debug(`[StateManager] Entry mode: "${entryMode}"`);
        } catch (error) {
            throw new Error(`StateManager: Cannot read entry mode. LMS connection may not be initialized. Error: ${error.message}`);
        }

        if (entryMode === 'ab-initio') {
            logger.debug('[StateManager] Fresh session (ab-initio), starting with empty state');
            return this.createFreshState();
        }

        const suspendData = lmsConnection.getSuspendData();
        if (suspendData) {
            const state = this.validateAndMigrateState(suspendData);
            logger.debug('[StateManager] Hydrated state from suspend_data');
            logger.debug(`[StateManager] Restored ${Object.keys(state).length} domain(s) from previous session`);
            return state;
        }

        if (entryMode === 'resume') {
            logger.warn('[StateManager] Entry mode is "resume" but no suspend_data found. This may indicate a previous session that was not properly saved.');
        } else {
            logger.debug('[StateManager] No suspend_data found, starting with fresh state');
        }
        return this.createFreshState();
    }

    /**
     * Validates loaded state against current course configuration and migrates if needed.
     */
    validateAndMigrateState(loadedState) {
        if (!this._validationConfig) {
            logger.debug('[StateManager] No validation config set, skipping state validation');
            if (!loadedState._meta) {
                loadedState._meta = {
                    schemaVersion: STATE_SCHEMA_VERSION,
                    createdAt: new Date().toISOString()
                };
            }
            return loadedState;
        }

        const { slideIds, objectiveIds: _objectiveIds } = this._validationConfig;
        const storedSchemaVersion = loadedState._meta?.schemaVersion || 0;

        logger.debug(`[StateManager] Validating state: stored schema v${storedSchemaVersion}, current v${STATE_SCHEMA_VERSION}`);

        if (storedSchemaVersion > STATE_SCHEMA_VERSION) {
            return handleStateMismatch(
                '_meta',
                `Stored state has newer schema version (${storedSchemaVersion}) than current (${STATE_SCHEMA_VERSION}). ` +
                'This may indicate the course was downgraded.',
                { storedSchemaVersion, currentSchemaVersion: STATE_SCHEMA_VERSION },
                this.createFreshState()
            );
        }

        if (storedSchemaVersion < STATE_SCHEMA_VERSION) {
            logger.info(`[StateManager] Upgrading state from schema v${storedSchemaVersion} to v${STATE_SCHEMA_VERSION}`);
            loadedState = this._runMigrations(loadedState, storedSchemaVersion, STATE_SCHEMA_VERSION);
        }

        const validatedState = { ...loadedState };

        validatedState._meta = {
            ...loadedState._meta,
            schemaVersion: STATE_SCHEMA_VERSION,
            lastValidatedAt: new Date().toISOString()
        };

        if (loadedState.navigation) {
            validatedState.navigation = this._validateNavigationState(loadedState.navigation, slideIds);
        }
        if (loadedState.engagement) {
            validatedState.engagement = this._validateEngagementState(loadedState.engagement, slideIds);
        }
        if (loadedState.interactionResponses) {
            validatedState.interactionResponses = this._validateInteractionResponsesState(loadedState.interactionResponses);
        }

        for (const key of Object.keys(loadedState)) {
            if (key.startsWith('assessment_')) {
                const assessmentId = key.replace('assessment_', '');
                validatedState[key] = this._validateAssessmentState(loadedState[key], assessmentId);
            }
        }

        return validatedState;
    }

    _runMigrations(state, fromVersion, toVersion) {
        let migratedState = { ...state };

        for (let version = fromVersion + 1; version <= toVersion; version++) {
            const migration = STATE_MIGRATIONS[version];
            if (migration) {
                logger.info(`[StateManager] Running migration to schema v${version}`);
                try {
                    migratedState = migration(migratedState);
                } catch (error) {
                    const errorMessage = `State migration to v${version} failed: ${error.message}`;
                    logger.error(`[StateManager] ${errorMessage}`, error);

                    if (import.meta.env.DEV) {
                        throw new Error(errorMessage);
                    }
                    eventBus.emit('state:recovered', {
                        domain: '_meta',
                        message: errorMessage,
                        context: { fromVersion, toVersion, failedAtVersion: version },
                        action: 'migration_skipped'
                    });
                }
            } else {
                logger.debug(`[StateManager] No migration defined for v${version}, skipping`);
            }
        }

        return migratedState;
    }

    _validateNavigationState(navState, slideIds) {
        if (!navState || typeof navState !== 'object') return navState;

        const validated = { ...navState };

        if (Array.isArray(navState.visitedSlides)) {
            const invalidSlides = navState.visitedSlides.filter(id => !slideIds.has(id));
            if (invalidSlides.length > 0) {
                if (import.meta.env.DEV) {
                    logger.warn(
                        `[StateManager] Navigation state contains ${invalidSlides.length} invalid slide ID(s): ${invalidSlides.join(', ')}. ` +
                        'These slides no longer exist in the course structure and will be removed.'
                    );
                }
                validated.visitedSlides = navState.visitedSlides.filter(id => slideIds.has(id));
            }
        }

        return validated;
    }

    _validateEngagementState(engagementState, slideIds) {
        if (!engagementState || typeof engagementState !== 'object') return engagementState;

        const validated = {};
        const invalidSlides = [];

        for (const [slideId, slideState] of Object.entries(engagementState)) {
            if (slideIds.has(slideId)) {
                validated[slideId] = slideState;
            } else {
                invalidSlides.push(slideId);
            }
        }

        if (invalidSlides.length > 0 && import.meta.env.DEV) {
            logger.warn(
                `[StateManager] Engagement state contains ${invalidSlides.length} invalid slide ID(s): ${invalidSlides.join(', ')}. ` +
                'These slides no longer exist and their engagement data will be discarded.'
            );
        }

        return validated;
    }

    _validateInteractionResponsesState(responsesState) {
        if (!responsesState || typeof responsesState !== 'object') return responsesState;

        const validated = {};
        for (const [id, state] of Object.entries(responsesState)) {
            if (state && typeof state === 'object') {
                validated[id] = state;
            }
        }
        return validated;
    }

    _validateAssessmentState(assessmentState, assessmentId) {
        if (!assessmentState || typeof assessmentState !== 'object') return assessmentState;

        const validated = { ...assessmentState };
        if (validated.session?.responses && typeof validated.session.responses !== 'object') {
            logger.warn(`[StateManager] Assessment "${assessmentId}" has invalid response format. Clearing responses.`);
            validated.session.responses = {};
        }
        return validated;
    }
}
