/**
 * @file state-commits.js
 * @description Auto-batched commit scheduling and LMS persistence.
 * @internal Only used by state-manager.js
 */

import { eventBus } from '../core/event-bus.js';
import { logger } from '../utilities/logger.js';
import { classifyLmsError } from './lms-error-utils.js';

// Auto-batch debounce delay in milliseconds
const AUTO_BATCH_DELAY_MS = 500;

export class CommitScheduler {
    /**
     * @param {import('./lms-connection.js').default} lmsConnection
     * @param {import('./state-domains.js').DomainStore} domainStore
     * @param {import('./transaction-log.js').TransactionLog} txLog
     */
    constructor(lmsConnection, domainStore, txLog) {
        this._lms = lmsConnection;
        this._domains = domainStore;
        this._txLog = txLog;

        this._autoBatchTimer = null;
        this._autoBatchDirty = false;
        this._autoBatchSuspendDirty = false;
        this._inFlightCommit = null;
    }

    /**
     * Schedules an auto-batched commit after a debounce delay.
     * @param {boolean} needsSuspendSync - Whether this write requires suspend_data sync
     */
    scheduleCommit(needsSuspendSync) {
        this._autoBatchDirty = true;
        if (needsSuspendSync) {
            this._autoBatchSuspendDirty = true;
        }

        if (this._autoBatchTimer) {
            clearTimeout(this._autoBatchTimer);
        }

        this._autoBatchTimer = setTimeout(() => {
            this._executeCommit();
        }, AUTO_BATCH_DELAY_MS);

        logger.debug(`[StateManager] Auto-batch scheduled (${AUTO_BATCH_DELAY_MS}ms debounce)`);
    }

    /**
     * Immediately flushes any pending auto-batched writes.
     */
    async flush() {
        if (this._autoBatchTimer) {
            clearTimeout(this._autoBatchTimer);
            this._autoBatchTimer = null;
        }

        if (this._autoBatchDirty) {
            logger.debug('[StateManager] Force-flushing pending writes (critical action)');
            await this._executeCommit();
            return;
        }

        // If a commit is currently in-flight, wait for it before continuing.
        if (this._inFlightCommit) {
            await this._inFlightCommit;
        }
    }

    /**
     * Commits state to LMS immediately. Used for critical paths (terminate, clearAllData).
     */
    async commitToLMS() {
        // Critical commits should not race with auto-batch commits.
        if (this._inFlightCommit) {
            await this._inFlightCommit;
        }

        if (this._autoBatchTimer) {
            clearTimeout(this._autoBatchTimer);
            this._autoBatchTimer = null;
        }

        // A critical commit writes full state immediately, so clear pending flags.
        this._autoBatchDirty = false;
        this._autoBatchSuspendDirty = false;

        eventBus.emit('state:commitStart');

        try {
            const stateSnapshot = {
                domains: Object.keys(this._domains.state),
                domainSizes: Object.fromEntries(
                    Object.entries(this._domains.state).map(([key, value]) => [
                        key,
                        JSON.stringify(value).length
                    ])
                ),
                totalSize: JSON.stringify(this._domains.state).length,
                totalSizeKB: (JSON.stringify(this._domains.state).length / 1024).toFixed(2)
            };

            logger.debug('[StateManager] Committing state:', stateSnapshot);

            this._lms.setSuspendData(this._domains.state);
            this._inFlightCommit = this._lms.commit();
            await this._inFlightCommit;
            logger.debug('[StateManager] State committed to LMS');
            eventBus.emit('state:commitSuccess');
            eventBus.emit('state:committed');
            return true;
        } catch (error) {
            const classification = classifyLmsError(error);
            const stateSnapshot = {
                domains: Object.keys(this._domains.state),
                domainSizes: {},
                problematicDomains: [],
                recentTransactions: this._txLog.getRecent(5)
            };

            for (const [key, value] of Object.entries(this._domains.state)) {
                try {
                    const serialized = JSON.stringify(value);
                    stateSnapshot.domainSizes[key] = serialized.length;
                    if (serialized.length > 10000) {
                        stateSnapshot.problematicDomains.push({
                            domain: key,
                            size: serialized.length,
                            sizeKB: (serialized.length / 1024).toFixed(2)
                        });
                    }
                } catch (e) {
                    stateSnapshot.domainSizes[key] = 'SERIALIZATION_FAILED';
                    stateSnapshot.problematicDomains.push({ domain: key, error: e.message });
                }
            }

            logger.error('[StateManager] Commit failed with detailed diagnostics:', { domain: 'state', operation: 'commit', stack: error.stack, stateSnapshot });
            eventBus.emit('state:commitFailed', { error: error.message, classification, stateSnapshot });
            throw error;
        } finally {
            this._inFlightCommit = null;
        }
    }

    // --- Private ---

    async _executeCommit() {
        this._autoBatchTimer = null;

        if (!this._autoBatchDirty) return;

        // Avoid overlapping commits; wait and re-evaluate dirty state.
        if (this._inFlightCommit) {
            await this._inFlightCommit;
            if (!this._autoBatchDirty) return;
        }

        eventBus.emit('state:commitStart');

        // Snapshot then clear dirty flags up-front so writes during await are preserved.
        const needsSuspendSync = this._autoBatchSuspendDirty;
        this._autoBatchDirty = false;
        this._autoBatchSuspendDirty = false;

        try {
            if (needsSuspendSync) {
                this._lms.setSuspendData(this._domains.state);
            }

            this._inFlightCommit = this._lms.commit();
            await this._inFlightCommit;

            logger.debug('[StateManager] Auto-batch committed');
            eventBus.emit('state:commitSuccess');
            eventBus.emit('state:committed');
        } catch (error) {
            const classification = classifyLmsError(error);
            // Preserve failed write intent for a retry.
            this._autoBatchDirty = true;
            if (needsSuspendSync) {
                this._autoBatchSuspendDirty = true;
            }
            logger.error('[StateManager] Auto-batch commit failed:', { domain: 'state', operation: 'autoBatchCommit', stack: error.stack });
            eventBus.emit('state:commitFailed', { error: error.message, classification });
        } finally {
            this._inFlightCommit = null;

            // If writes happened during commit, schedule follow-up commit.
            if (this._autoBatchDirty && !this._autoBatchTimer) {
                this._autoBatchTimer = setTimeout(() => {
                    this._executeCommit();
                }, AUTO_BATCH_DELAY_MS);
            }
        }
    }
}
