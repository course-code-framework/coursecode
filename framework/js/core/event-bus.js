import { generateId } from '../utilities/utilities.js';
import { logger } from '../utilities/logger.js';

/**
 * Safely serialize any value for logging. Handles circular references,
 * Error instances, and oversized payloads without throwing.
 */
function safeStringify(data, maxLength = 4096) {
  const seen = new WeakSet();
  try {
    const json = JSON.stringify(data, (key, value) => {
      if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack };
      }
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    }, 2);
    if (json && json.length > maxLength) {
      return json.slice(0, maxLength) + '...[truncated]';
    }
    return json;
  } catch {
    return `[Unserializable: ${typeof data}]`;
  }
}

class EventBus {
  constructor() {
    // Event listeners registry
    this.events = {};
    // Re-entrancy guard — prevents infinite :error → log → :error cascade
    this._emittingError = false;
  }

  /**
   * Subscribe to an event
   * 
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @param {Object} options - Optional configuration
   * @returns {Function} Unsubscribe function
   */
  on(event, callback, options = {}) {
    if (!event || typeof callback !== 'function') {
      throw new Error('Event name and callback are required');
    }

    if (!this.events[event]) {
      this.events[event] = [];
    }

    const listener = {
      callback,
      once: options.once || false,
      id: generateId('listener')
    };

    this.events[event].push(listener);

    // Return unsubscribe function
    return () => this.off(event, listener.id);
  }

  /**
   * Subscribe to an event once (auto-unsubscribe after first trigger)
   * 
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  once(event, callback) {
    return this.on(event, callback, { once: true });
  }

  /**
   * Unsubscribe from an event
   * 
   * @param {string} event - Event name
   * @param {string|Function} listenerIdOrCallback - Listener ID or callback function
   */
  off(event, listenerIdOrCallback) {
    if (!this.events[event]) return;

    if (typeof listenerIdOrCallback === 'string') {
      // Remove by ID
      this.events[event] = this.events[event].filter(
        listener => listener.id !== listenerIdOrCallback
      );
    } else if (typeof listenerIdOrCallback === 'function') {
      // Remove by callback reference
      this.events[event] = this.events[event].filter(
        listener => listener.callback !== listenerIdOrCallback
      );
    }

    // Clean up empty event arrays
    if (this.events[event].length === 0) {
      delete this.events[event];
    }
  }

  /**
   * Emit an event
   * 
   * @param {string} event - Event name
   * @param {*} data - Event data
   * @returns {boolean} True if event had listeners
   */
  emit(event, data) {
    // log:error is the logger transport itself; treating it as another source
    // error would recursively call logger.error().
    const isErrorEvent = event.endsWith(':error') && event !== 'log:error';
    const hasListeners = Boolean(this.events[event]?.length);

    if (!isErrorEvent && !hasListeners) return false;

    // Re-entrancy guard — if we're already inside an :error emit,
    // suppress to prevent infinite cascade
    if (isErrorEvent) {
      if (this._emittingError) {
        logger.warn(`[EventBus] Suppressed recursive error event: ${event}`);
        return false;
      }
      this._emittingError = true;
    }

    try {
      // Automatically log events that follow the ':error' naming convention
      if (isErrorEvent) {
        logger.error(`[EventBus Error] ${event}:`, safeStringify(data));
      }

      if (!hasListeners) return false;

      // Create a copy of listeners to avoid issues if listeners modify the array
      const listeners = [...this.events[event]];

      listeners.forEach(listener => {
        // Remove one-shot listeners before invocation so thrown callbacks and
        // re-entrant emits cannot execute them more than once.
        if (listener.once) {
          this.off(event, listener.id);
        }

        try {
          listener.callback(data);
        } catch (error) {
          // Log the error but don't break other listeners — use safeStringify
          // to prevent a secondary cascade from unserializable error objects
          logger.error(`[EventBus] Error in listener for '${event}':`, safeStringify(error));
        }
      });

    } finally {
      if (isErrorEvent) {
        this._emittingError = false;
      }
    }

    return true;
  }

  /**
   * Emit an event asynchronously
   * 
   * @param {string} event - Event name
   * @param {*} data - Event data
   * @returns {Promise} Resolves when all listeners have been called
   */
  async emitAsync(event, data) {
    const isErrorEvent = event.endsWith(':error') && event !== 'log:error';
    const hasListeners = Boolean(this.events[event]?.length);
    if (!isErrorEvent && !hasListeners) return false;

    if (isErrorEvent && this._emittingError) {
      logger.warn(`[EventBus] Suppressed recursive error event: ${event}`);
      return false;
    }

    if (isErrorEvent) {
      this._emittingError = true;
    }

    try {
      if (isErrorEvent) {
        logger.error(`[EventBus Error] ${event}:`, safeStringify(data));
      }

      if (!hasListeners) return false;

      const listeners = [...this.events[event]];

      for (const listener of listeners) {
        if (listener.once) {
          this.off(event, listener.id);
        }

        try {
          await listener.callback(data);
        } catch (error) {
          logger.error(`[EventBus] Error in async listener for '${event}':`, error);
        }
      }

      return true;
    } finally {
      if (isErrorEvent) {
        this._emittingError = false;
      }
    }
  }

  /**
   * Remove all listeners for an event or all events
   * 
   * @param {string} event - Optional event name (if omitted, clears all)
   */
  clear(event) {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
  }

  /**
   * Get listener count for an event
   * 
   * @param {string} event - Event name
   * @returns {number} Number of listeners
   */
  getListenerCount(event) {
    return this.events[event] ? this.events[event].length : 0;
  }
}

// Create global event bus instance
const eventBus = new EventBus();

export { EventBus, eventBus };
