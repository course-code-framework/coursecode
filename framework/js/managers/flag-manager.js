/**
 * @file flag-manager.js
 * @description Manages global flags for the course. It provides a simple API
 * for setting and retrieving boolean flags, persisting the entire flags object
 * as a single domain in the StateManager.
 */

import stateManager from '../state/index.js';
import { logger } from '../utilities/logger.js';
import { eventBus } from '../core/event-bus.js';
import { deepClone } from '../utilities/utilities.js';

class FlagManager {
    constructor() {
        this.flags = {};
        this.isInitialized = false;
        this.DOMAIN_KEY = 'flags';
        this.SOURCE = 'flag-manager';
    }

    /**
     * Initializes the manager by loading flags from the StateManager.
     * @throws {Error} If already initialized
     */
    initialize() {
        if (this.isInitialized) {
            throw new Error('FlagManager: Already initialized. Do not call initialize() more than once.');
        }
        const persistedFlags = stateManager.getDomainState(this.DOMAIN_KEY);
        if (persistedFlags && typeof persistedFlags === 'object') {
            this.flags = persistedFlags;
        }
        this.isInitialized = true;
        logger.debug('FlagManager initialized.', this.flags);
    }

    /**
     * Retrieves all flags.
     * @returns {object} A deep-cloned object of all flags.
     */
    getAllFlags() {
        return deepClone(this.flags);
    }

    /**
     * Retrieves a single flag by its key.
     * @param {string} key - The key for the flag.
     * @returns {any} The value of the flag, or undefined if not found.
     */
    getFlag(key) {
        const val = this.flags[key];
        return (val && typeof val === 'object') ? deepClone(val) : val;
    }

    /**
     * Sets a flag's value and persists the change.
     * @param {string} key - The key for the flag.
     * @param {any} value - The value to set for the flag.
     * @throws {Error} If key is not a non-empty string
     */
    setFlag(key, value) {
        if (typeof key !== 'string' || key.trim() === '') {
            throw new Error('FlagManager: setFlag requires a non-empty string key.');
        }

        this.flags[key] = value;

        stateManager.setDomainState(this.DOMAIN_KEY, this.flags, { source: this.SOURCE });
        eventBus.emit('flag:updated', { key, value });
    }

    /**
     * Removes a flag and persists the change.
     * @param {string} key - The key for the flag to remove.
     */
    removeFlag(key) {
        if (this.flags.hasOwnProperty(key)) {
            delete this.flags[key];
            stateManager.setDomainState(this.DOMAIN_KEY, this.flags, { source: this.SOURCE });
            eventBus.emit('flag:removed', { key });
        }
    }
}

const instance = new FlagManager();
export default instance;
