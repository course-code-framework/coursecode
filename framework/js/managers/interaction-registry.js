/**
 * @file interaction-registry.js
 * @description Runtime registry for currently rendered interaction component instances.
 * Separate from InteractionManager which handles SCORM persistence.
 * 
 * This registry tracks interactions on the CURRENT SLIDE ONLY and is cleared on navigation.
 * It provides a live reference to interaction instances for:
 * - EngagementManager: counting interactions for completion requirements
 * - Automation API: programmatic testing and manipulation
 * 
 * NOTE: This registry is NOT used by runtime-linter. The linter performs static analysis
 * by rendering slides to detached DOM and querying for [data-interaction-id] elements.
 */

import { eventBus } from '../core/event-bus.js';
import { logger } from '../utilities/logger.js';

class InteractionRegistry {
    constructor() {
        this.registry = new Map();
        this.isReady = false;
    }

    /**
     * Registers an interaction component instance when it is rendered.
     * @param {object} config - The interaction configuration object
     * @param {object} questionObj - The live interaction instance with methods like evaluate()
     * @throws {Error} If configuration is invalid or duplicate ID detected
     */
    register(config, questionObj) {
        if (!config || !config.id) {
            const error = new Error('[InteractionRegistry] Cannot register interaction: configuration or ID is missing.');
            eventBus.emit('interaction:registry:error', {
                domain: 'interaction-registry',
                operation: 'register',
                message: error.message,
                stack: error.stack,
                context: { config }
            });
            throw error;
        }

        if (this.registry.has(config.id)) {
            const error = new Error(`[InteractionRegistry] Interaction with ID "${config.id}" is already registered. Duplicate interaction IDs are not allowed. Each interaction must have a unique ID.`);
            eventBus.emit('interaction:registry:error', {
                domain: 'interaction-registry',
                operation: 'register',
                message: error.message,
                stack: error.stack,
                context: { interactionId: config.id }
            });
            throw error;
        }

        const registration = {
            id: config.id,
            type: config.type,
            description: config.prompt,
            config: config,
            instance: questionObj,
        };

        this.registry.set(config.id, registration);
        eventBus.emit('interaction:registered', registration);
    }

    /**
     * Retrieves all registered interactions for the current slide.
     * @returns {Array<object>} Array of registered interaction objects with their instances and configs
     */
    getAll() {
        return Array.from(this.registry.values());
    }

    /**
     * Clears the registry. Should be called before rendering a new slide.
     */
    clear() {
        this.registry.clear();
        this.isReady = false;
        logger.debug('[InteractionRegistry] Registry cleared.');
    }

    /**
     * Marks the registry as ready after all interactions have been registered.
     * Emits an event that other managers can listen to.
     */
    setReady() {
        this.isReady = true;
        eventBus.emit('interaction:registry:ready', this.getAll());
        logger.debug(`[InteractionRegistry] Registry ready. ${this.registry.size} interactions registered.`);
    }
}

const instance = new InteractionRegistry();
export default instance;
