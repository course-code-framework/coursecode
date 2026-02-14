/**
 * @file utilities.js
 * @description Core utility functions for the SCORM framework.
 * These are pure, stateless helper functions.
 */

/**
 * Format duration in milliseconds to a human-readable string.
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "2m 30s")
 */
export function formatDuration(ms) {
    if (!ms || ms < 0) {
        return '0s';
    }

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Deep clone an object (handles primitives, arrays, objects, and Dates).
 * @param {*} obj - Value to clone
 * @returns {*} Cloned value
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    if (Array.isArray(obj)) {
        return obj.map(item => deepClone(item));
    }
    
    const clonedObj = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            clonedObj[key] = deepClone(obj[key]);
        }
    }
    return clonedObj;
}

/**
 * Generate a unique ID with optional prefix.
 * @param {string} prefix - Optional prefix for the ID
 * @returns {string} Unique ID (format: prefix-timestamp-random)
 */
export function generateId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Escape HTML entities in text.
 * @param {string} text - Text to escape
 * @returns {string} Text with HTML entities escaped
 */
export function escapeHTML(text) {
    if (typeof text !== 'string') {
        return '';
    }
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Check if an element is fully visible in the viewport.
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} True if element is fully visible within viewport
 */
export function isElementVisible(element) {
    if (!element || !(element instanceof HTMLElement)) {
        return false;
    }

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= viewportHeight &&
        rect.right <= viewportWidth
    );
}

/**
 * Scroll element into view with smooth behavior.
 * @param {HTMLElement} element - Element to scroll to
 * @param {Object} options - ScrollIntoView options
 */
export function scrollToElement(element, options = {}) {
    if (!element || !(element instanceof HTMLElement)) {
        return;
    }

    const defaultOptions = {
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest'
    };

    element.scrollIntoView({ ...defaultOptions, ...options });
}

/**
 * Get all focusable elements within a container.
 * @param {HTMLElement} container - Container element
 * @returns {Array<HTMLElement>} Array of focusable elements
 */
export function getFocusableElements(container) {
    if (!container || !(container instanceof HTMLElement)) {
        return [];
    }

    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll(selector));
}

/**
 * Trap focus within a container (for modals, dialogs).
 * Returns a cleanup function that must be called to remove the trap.
 * @param {HTMLElement} container - Container to trap focus in
 * @returns {Function} Cleanup function to remove trap
 */
export function trapFocus(container) {
    if (!container || !(container instanceof HTMLElement)) {
        throw new Error('trapFocus: container must be a valid HTMLElement');
    }

    const focusableElements = getFocusableElements(container);
    if (focusableElements.length === 0) {
        return () => { };
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e) => {
        if (e.key !== 'Tab') {
            return;
        }

        if (e.shiftKey) {
            if (document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        } else {
            if (document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    };

    container.addEventListener('keydown', handleTabKey);
    firstElement.focus();

    return () => {
        container.removeEventListener('keydown', handleTabKey);
    };
}

/**
 * Format a number as a percentage string.
 * @param {number} value - Value to format (0-1 if isDecimal=true, 0-100 if isDecimal=false)
 * @param {boolean} isDecimal - True if value is 0-1, false if 0-100
 * @returns {string} Formatted percentage (e.g., "75%")
 */
export function formatPercentage(value, isDecimal = true) {
    if (typeof value !== 'number' || isNaN(value)) {
        return '0%';
    }
    const percent = isDecimal ? value * 100 : value;
    return `${Math.round(percent)}%`;
}

/**
 * Wait for a condition to be true, checking at regular intervals.
 * @param {Function} condition - Function that returns true when condition is met
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @param {number} interval - Check interval in milliseconds
 * @returns {Promise<void>} Resolves when condition is met, rejects on timeout
 */
export function waitFor(condition, timeout = 5000, interval = 100) {
    if (!condition || typeof condition !== 'function') {
        return Promise.reject(new Error('waitFor: condition must be a function'));
    }
    if (timeout <= 0) {
        return Promise.reject(new Error('waitFor: timeout must be positive'));
    }
    if (interval <= 0) {
        return Promise.reject(new Error('waitFor: interval must be positive'));
    }

    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const check = () => {
            try {
                if (condition()) {
                    resolve();
                } else if (Date.now() - startTime >= timeout) {
                    reject(new Error('Timeout waiting for condition'));
                } else {
                    setTimeout(check, interval);
                }
            } catch (error) {
                reject(new Error(`Condition check failed: ${error.message}`));
            }
        };

        check();
    });
}

/**
 * Deep merge multiple objects (mutates target object).
 * Plain objects are merged recursively; other values are overwritten.
 * @param {Object} target - The target object to merge into (will be mutated)
 * @param {...Object} sources - The source objects to merge from
 * @returns {Object} The merged target object
 */
export function deepMerge(target, ...sources) {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
        throw new Error('deepMerge: target must be a plain object');
    }

    if (sources.length === 0) {
        return target;
    }

    const source = sources.shift();

    if (source && typeof source === 'object' && !Array.isArray(source)) {
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                const sourceValue = source[key];
                const targetValue = target[key];

                if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
                    // Recursive merge for plain objects
                    if (!targetValue || typeof targetValue !== 'object' || Array.isArray(targetValue)) {
                        target[key] = {};
                    }
                    deepMerge(target[key], sourceValue);
                } else {
                    // Direct assignment for primitives, arrays, and other types
                    target[key] = sourceValue;
                }
            }
        }
    }

    return deepMerge(target, ...sources);
}

/**
 * Shuffle an array using Fisher-Yates algorithm (creates new array).
 * @param {Array} array - Array to shuffle
 * @returns {Array} New shuffled array
 */
export function shuffleArray(array) {
    if (!Array.isArray(array)) {
        throw new Error('shuffleArray: input must be an array');
    }

    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
