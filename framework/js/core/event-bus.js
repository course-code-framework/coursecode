import { generateId } from '../utilities/utilities.js';
import { logger } from '../utilities/logger.js';

class EventBus {
  constructor() {
    // Event listeners registry
    this.events = {};
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
    if (!this.events[event] || this.events[event].length === 0) {
      return false;
    }

    // Automatically log events that follow the ':error' naming convention
    if (event.endsWith(':error')) {
      logger.error(`[EventBus Error] ${event}:`, JSON.stringify(data, null, 2));
    }

    // Create a copy of listeners to avoid issues if listeners modify the array
    const listeners = [...this.events[event]];
    const onceListeners = [];

    listeners.forEach(listener => {
      try {
        listener.callback(data);

        // Track once listeners for removal
        if (listener.once) {
          onceListeners.push(listener.id);
        }
      } catch (error) {
        // Log the error but don't break other listeners
        logger.error(`[EventBus] Error in listener for '${event}':`, error);
      }
    });

    // Remove once listeners
    onceListeners.forEach(id => this.off(event, id));

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
    if (!this.events[event] || this.events[event].length === 0) {
      return false;
    }

    const listeners = [...this.events[event]];
    const onceListeners = [];

    for (const listener of listeners) {
      try {
        await listener.callback(data);

        if (listener.once) {
          onceListeners.push(listener.id);
        }
      } catch (error) {
        logger.error(`[EventBus] Error in async listener for '${event}':`, error);
      }
    }

    // Remove once listeners
    onceListeners.forEach(id => this.off(event, id));

    return true;
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
