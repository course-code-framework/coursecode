/**
 * @file state-domains.js
 * @description Domain state CRUD operations with append-only semantics.
 * @internal Only used by state-manager.js
 */

import { deepClone } from '../utilities/utilities.js';
import { eventBus } from '../core/event-bus.js';
import { logger } from '../utilities/logger.js';

// Domains that use append-only semantics (each setDomainState call adds a new record)
const APPEND_ONLY_DOMAINS = new Set([
    'interactions'
]);

export class DomainStore {
    /**
     * @param {import('./transaction-log.js').TransactionLog} txLog
     */
    constructor(txLog) {
        this.state = {};
        this._txLog = txLog;
    }

    /**
     * Retrieves a deep-cloned copy of the entire state.
     */
    getState() {
        return deepClone(this.state);
    }

    /**
     * Retrieves a deep-cloned copy of a specific domain.
     * @param {string} domain - The top-level key for the state domain
     */
    getDomainState(domain) {
        if (typeof domain !== 'string' || domain.trim() === '') {
            throw new Error('StateManager: domain must be a non-empty string');
        }
        return this.state[domain] ? deepClone(this.state[domain]) : undefined;
    }

    /**
     * Sets the state for a specific domain.
     * Append-only domains append a new record; normal domains replace.
     *
     * @param {string} domain
     * @param {any} value
     * @param {object} [meta={}]
     * @returns {object|undefined} For append-only domains, the appended record with index
     */
    setDomainState(domain, value, meta = {}) {
        if (typeof domain !== 'string' || domain.trim() === '') {
            throw new Error('StateManager: domain must be a non-empty string');
        }

        let result;
        if (APPEND_ONLY_DOMAINS.has(domain)) {
            if (!Array.isArray(this.state[domain])) {
                this.state[domain] = [];
            }
            const index = this.state[domain].length;
            result = { ...value, _index: index };
            this.state[domain].push(result);
            logger.debug(`[StateManager] Appended to ${domain} at index ${index}`);
        } else {
            this.state[domain] = value;
            logger.debug(`[StateManager] State updated for domain: ${domain}`);
        }

        this._txLog.record(domain, APPEND_ONLY_DOMAINS.has(domain) ? 'append' : 'set', {
            size: JSON.stringify(value).length
        });

        eventBus.emit('state:changed', { domain, value: result || value, meta });

        return result;
    }

    /**
     * Clears all state.
     */
    clearState() {
        this.state = {};
    }
}
