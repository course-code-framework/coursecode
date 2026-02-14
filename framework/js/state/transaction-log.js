/**
 * @file transaction-log.js
 * @description Ring buffer for recording state transactions. Used for debugging.
 * @internal Only used by state-manager.js
 */

const DEFAULT_SIZE = 50;

export class TransactionLog {
    constructor(size = DEFAULT_SIZE) {
        this._buffer = new Array(size);
        this._size = size;
        this._head = 0;
        this._count = 0;
    }

    record(domain, action, meta = {}) {
        this._buffer[this._head] = {
            domain,
            action,
            timestamp: Date.now(),
            ...meta
        };
        this._head = (this._head + 1) % this._size;
        if (this._count < this._size) this._count++;
    }

    getRecent(n = 10) {
        const count = Math.min(n, this._count);
        const entries = [];
        for (let i = 0; i < count; i++) {
            const idx = (this._head - 1 - i + this._size) % this._size;
            entries.push(this._buffer[idx]);
        }
        return entries;
    }

    toArray() {
        return this.getRecent(this._count);
    }
}
