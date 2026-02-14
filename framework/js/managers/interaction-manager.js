/**
 * @file interaction-manager.js
 * @description Manages student interactions for SCORM persistence.
 * This is the single source of truth for all interaction data and persists
 * its state through the StateManager.
 */

import { logger } from '../utilities/logger.js';

import { deepClone, generateId } from '../utilities/utilities.js';
import stateManager from '../state/index.js';
import { eventBus } from '../core/event-bus.js';
import {
    SCORM_INTERACTION_TYPES as _SCORM_INTERACTION_TYPES,
    SCORM_INTERACTION_RESULTS as _SCORM_INTERACTION_RESULTS,
    isValidISO8601Timestamp,
    isValidISO8601Duration,
    validateInteractionType,
    validateInteractionResult,
    validateNumeric,
    validateStringArray,
    validateRequiredFields,
    formatValidationError,
    generateScormTimestamp
} from '../validation/scorm-validators.js';

/**
 * @typedef {Object} InteractionData
 * @property {string} [id] - Unique identifier (auto-generated if not provided)
 * @property {string} type - SCORM interaction type
 * @property {string} [learner_response] - The learner's response
 * @property {string} [result] - Result of the interaction
 * @property {string} [description] - Description of the interaction
 * @property {string} [timestamp] - ISO 8601 timestamp
 * @property {number} [weighting] - Weight of the interaction
 * @property {string} [latency] - ISO 8601 duration format
 * @property {string[]} [correct_responses] - Array of correct response patterns
 * @property {string[]} [objectives] - Array of linked objective IDs
 */

class InteractionManager {
    constructor() {
        this.interactions = [];
        this.isInitialized = false;
        this.DOMAIN_KEY = 'interactions';
        this.SOURCE = 'interaction-manager';
    }

    /**
     * Initializes the manager by loading state from the StateManager.
     * @throws {Error} If already initialized
     */
    initialize() {
        if (this.isInitialized) {
            throw new Error('InteractionManager: Already initialized. Do not call initialize() more than once.');
        }

        // Load interactions via stateManager domain API
        // stateManager transparently routes to cmi.interactions.n.*
        this.interactions = stateManager.getDomainState(this.DOMAIN_KEY) || [];

        this.isInitialized = true;
        logger.debug('InteractionManager initialized.', this.interactions);
    }

    /**
     * Retrieves all interactions.
     * @returns {Array<object>} A deep-cloned array of all interaction objects.
     */
    getAllInteractions() {
        return deepClone(this.interactions);
    }

    /**
     * Retrieves a single interaction by its ID.
     * @param {string} id - The unique identifier for the interaction.
     * @returns {object|null} A deep-cloned interaction object or null if not found.
     */
    getInteraction(id) {
        const interaction = this.interactions.find(i => i.id === id);
        return interaction ? deepClone(interaction) : null;
    }

    /**
     * Validates interaction data against SCORM 2004 4th Edition specification.
     * @private
     * @param {InteractionData} data - The interaction data to validate
     * @throws {Error} If validation fails with detailed error messages
     */
    _validateInteractionData(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('[InteractionManager] Interaction data must be a non-null object');
        }

        const errors = [];

        // Validate required field: type
        const requiredCheck = validateRequiredFields(data, ['type']);
        if (!requiredCheck.valid) {
            errors.push(...requiredCheck.errors);
        } else {
            // Only validate type value if field is present
            const typeCheck = validateInteractionType(data.type);
            if (!typeCheck.valid) {
                errors.push(typeCheck.error);
            }
        }

        // Validate result if provided
        if (data.result) {
            const resultCheck = validateInteractionResult(data.result);
            if (!resultCheck.valid) {
                errors.push(resultCheck.error);
            }
        }

        // Validate timestamp format if provided
        if (data.timestamp && !isValidISO8601Timestamp(data.timestamp)) {
            errors.push(`Invalid timestamp "${data.timestamp}". Must be ISO 8601 format`);
        }

        // Validate weighting if provided
        if (data.weighting !== undefined && data.weighting !== null) {
            const weightCheck = validateNumeric(data.weighting, 'weighting');
            if (!weightCheck.valid) {
                errors.push(weightCheck.error);
            }
        }

        // Validate latency format if provided (ISO 8601 duration)
        if (data.latency && !isValidISO8601Duration(data.latency)) {
            errors.push(`Invalid latency "${data.latency}". Must be ISO 8601 duration format (e.g., "PT1H30M")`);
        }

        // Validate correct_responses if provided
        if (data.correct_responses !== undefined && !Array.isArray(data.correct_responses)) {
            errors.push('Field "correct_responses" must be an array');
        }

        // Validate objectives if provided
        if (data.objectives !== undefined) {
            const objCheck = validateStringArray(data.objectives, 'objectives');
            if (!objCheck.valid) {
                errors.push(objCheck.error);
            }
        }

        if (errors.length > 0) {
            const context = data.id ? `interaction "${data.id}"` : 'interaction';
            const errorMsg = '[InteractionManager] ' + formatValidationError(errors, context);
            throw new Error(errorMsg);
        }
    }

    /**
     * Records a new interaction.
     * Uses stateManager's domain API with append-only semantics.
     * stateManager handles all CMI routing transparently.
     * 
     * @param {InteractionData} interactionData - The interaction data conforming to SCORM CMI data model
     * @returns {object} The recorded interaction object, including generated ID and timestamp
     * @throws {Error} If validation fails or state persistence fails
     */
    record(interactionData) {
        // Validate input - this will throw if validation fails
        this._validateInteractionData(interactionData);

        const newInteraction = {
            id: interactionData.id || generateId('interaction'),
            type: interactionData.type,
            learner_response: interactionData.learner_response || '',
            result: interactionData.result || 'neutral',
            description: interactionData.description || '',
            timestamp: interactionData.timestamp || generateScormTimestamp(),
            weighting: interactionData.weighting,
            latency: interactionData.latency,
            correct_responses: interactionData.correct_responses,
            objectives: interactionData.objectives
        };

        // Persist via stateManager domain API (append-only semantics)
        // stateManager transparently routes to cmi.interactions.n.*
        try {
            const result = stateManager.setDomainState(this.DOMAIN_KEY, newInteraction);
            // Update in-memory array with the result (includes _index from stateManager)
            this.interactions.push(result || newInteraction);
        } catch (error) {
            const wrappedError = new Error(`[InteractionManager] Failed to record interaction "${newInteraction.id}": ${error.message}`);
            this._emitError('record', wrappedError, { interactionId: newInteraction.id });
            throw wrappedError;
        }

        eventBus.emit('interaction:recorded', newInteraction);

        return deepClone(newInteraction);
    }

    /**
     * Adds a likert interaction to the LMS.
     * Likert interactions are used for ratings and feedback (1-5 scales, etc).
     * 
     * This method now uses record() internally to ensure consistent validation,
     * error handling, and state management.
     * 
     * @param {object} interaction - The interaction data.
     * @param {string} interaction.id - A unique identifier for the interaction.
     * @param {string} interaction.response - The learner's response.
     * @param {string} interaction.description - A description of the interaction.
     * @returns {object} The recorded interaction object
     * @throws {Error} If InteractionManager is not initialized
     * @throws {Error} If interaction data is invalid
     * @throws {Error} If SCORM sync or state persistence fails
     */
    addLikertInteraction({ id, response, description }) {
        if (!this.isInitialized) {
            const error = new Error('[InteractionManager] Not initialized. Call initialize() first.');
            this._emitError('addLikertInteraction', error, { interactionId: id });
            throw error;
        }
        if (!id || typeof id !== 'string') {
            const error = new Error('[InteractionManager] likert interaction id is required and must be a string');
            this._emitError('addLikertInteraction', error, { interactionId: id });
            throw error;
        }
        if (response === undefined || response === null || String(response).trim() === '') {
            const error = new Error('[InteractionManager] likert interaction response is required');
            this._emitError('addLikertInteraction', error, { interactionId: id });
            throw error;
        }

        // Use record() to ensure consistent validation and state management
        return this.record({
            id: id,
            type: 'likert',
            learner_response: String(response),
            description: description || '',
            result: 'neutral'  // Likert doesn't have right/wrong answers
        });
    }

    /**
     * Logs a standardized error for interaction operations.
     * @private
     * @param {string} operation - The operation that failed
     * @param {Error} error - The error object
     * @param {object} context - Additional context about the error
     */
    _emitError(operation, error, context) {
        logger.error(error.message, { domain: 'interaction', operation, stack: error.stack, ...context });
    }
}

const instance = new InteractionManager();
export default instance;
