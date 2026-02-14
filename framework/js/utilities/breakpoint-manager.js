/**
 * Breakpoint Manager - Responsive breakpoint detection and class management
 * ============================================================================
 * 
 * PURPOSE: Dynamically applies breakpoint CSS classes to the <html> element
 * based on viewport width, enabling responsive styles throughout the framework.
 * 
 * BREAKPOINTS (matching design-tokens.css):
 * - Large Desktop: >= 1440px  → adds .bp-min-large-desktop
 * - Desktop:       < 1440px   → adds .bp-max-desktop
 * - Tablet Land:   < 1200px   → adds .bp-max-tablet-landscape
 * - Tablet Port:   < 1024px   → adds .bp-max-tablet-portrait
 * - Mobile Land:   < 768px    → adds .bp-max-mobile-landscape
 * - Mobile Port:   < 480px    → adds .bp-max-mobile-portrait
 * 
 * USAGE:
 *   import { breakpointManager } from './utilities/breakpoint-manager.js';
 *   
 *   // Initialize (called automatically in main.js)
 *   breakpointManager.init();
 *   
 *   // Get current breakpoint name
 *   const bp = breakpointManager.getCurrentBreakpoint(); // e.g., 'tablet-portrait'
 *   
 *   // Check if at or below a breakpoint
 *   if (breakpointManager.isAtMost('tablet-portrait')) { ... }
 *   
 *   // Listen for breakpoint changes
 *   breakpointManager.onChange((newBreakpoint, oldBreakpoint) => {
 *       console.log(`Changed from ${oldBreakpoint} to ${newBreakpoint}`);
 *   });
 * 
 * DEPENDENCIES:
 * - Requires: design-tokens.css breakpoint values
 * - Used by: responsive.css (applies styles based on .bp-* classes)
 * 
 * LMS COMPATIBILITY:
 * - Works reliably in iframe contexts (Litmos, Cornerstone, etc.)
 * - Uses standard DOM APIs (window.innerWidth, resize event)
 * - Passive event listener for performance
 * 
 * LAST UPDATED: 2024-12-10
 * ============================================================================
 */

import { logger } from './logger.js';

/**
 * Breakpoint definitions ordered from largest to smallest
 * Order matters for determining the "current" breakpoint
 */
const BREAKPOINTS = [
    { name: 'large-desktop', minWidth: 1440, className: 'bp-min-large-desktop' },
    { name: 'desktop', maxWidth: 1439, className: 'bp-max-desktop' },
    { name: 'tablet-landscape', maxWidth: 1199, className: 'bp-max-tablet-landscape' },
    { name: 'tablet-portrait', maxWidth: 1023, className: 'bp-max-tablet-portrait' },
    { name: 'mobile-landscape', maxWidth: 767, className: 'bp-max-mobile-landscape' },
    { name: 'mobile-portrait', maxWidth: 479, className: 'bp-max-mobile-portrait' }
];

/**
 * All possible breakpoint class names for easy removal
 */
const ALL_BREAKPOINT_CLASSES = BREAKPOINTS.map(bp => bp.className);

/**
 * Breakpoint Manager singleton
 */
class BreakpointManager {
    constructor() {
        this._initialized = false;
        this._currentBreakpoint = null;
        this._listeners = [];
        this._resizeTimeout = null;
        
        // Bind methods for event listener
        this._handleResize = this._handleResize.bind(this);
    }

    /**
     * Initialize the breakpoint manager
     * Sets up resize listener and applies initial breakpoint classes
     */
    init() {
        if (this._initialized) {
            logger.warn('[BreakpointManager] Already initialized');
            return;
        }

        // Apply initial breakpoint classes
        this._updateBreakpoints();

        // Listen for resize with debouncing for performance
        window.addEventListener('resize', this._handleResize, { passive: true });

        this._initialized = true;
        logger.debug('[BreakpointManager] Initialized, current breakpoint:', this._currentBreakpoint);
    }

    /**
     * Clean up event listeners (useful for testing or cleanup)
     */
    destroy() {
        if (!this._initialized) return;

        window.removeEventListener('resize', this._handleResize);
        
        if (this._resizeTimeout) {
            clearTimeout(this._resizeTimeout);
        }

        // Remove all breakpoint classes
        const html = document.documentElement;
        html.classList.remove(...ALL_BREAKPOINT_CLASSES);

        this._listeners = [];
        this._initialized = false;
        this._currentBreakpoint = null;

        logger.debug('[BreakpointManager] Destroyed');
    }

    /**
     * Handle resize events with debouncing
     * @private
     */
    _handleResize() {
        // Debounce resize events (16ms ≈ 60fps)
        if (this._resizeTimeout) {
            clearTimeout(this._resizeTimeout);
        }

        this._resizeTimeout = setTimeout(() => {
            this._updateBreakpoints();
        }, 16);
    }

    /**
     * Update breakpoint classes on the <html> element
     * @private
     */
    _updateBreakpoints() {
        const width = window.innerWidth;
        const html = document.documentElement;
        const oldBreakpoint = this._currentBreakpoint;

        // Remove all existing breakpoint classes
        html.classList.remove(...ALL_BREAKPOINT_CLASSES);

        // Determine which breakpoint classes to add
        // Multiple classes can be active (cascade down)
        let primaryBreakpoint = null;

        for (const bp of BREAKPOINTS) {
            let shouldAdd = false;

            if (bp.minWidth !== undefined && width >= bp.minWidth) {
                shouldAdd = true;
            } else if (bp.maxWidth !== undefined && width <= bp.maxWidth) {
                shouldAdd = true;
            }

            if (shouldAdd) {
                html.classList.add(bp.className);
                
                // The first matching breakpoint is the "primary" one
                if (!primaryBreakpoint) {
                    primaryBreakpoint = bp.name;
                }
            }
        }

        this._currentBreakpoint = primaryBreakpoint;

        // Notify listeners if breakpoint changed
        if (oldBreakpoint !== this._currentBreakpoint) {
            logger.debug('[BreakpointManager] Breakpoint changed:', oldBreakpoint, '→', this._currentBreakpoint);
            this._notifyListeners(this._currentBreakpoint, oldBreakpoint);
        }
    }

    /**
     * Notify all registered listeners of breakpoint change
     * @private
     */
    _notifyListeners(newBreakpoint, oldBreakpoint) {
        for (const callback of this._listeners) {
            try {
                callback(newBreakpoint, oldBreakpoint);
            } catch (error) {
                logger.error('[BreakpointManager] Listener error:', error);
            }
        }
    }

    /**
     * Get the current primary breakpoint name
     * @returns {string|null} Current breakpoint name (e.g., 'tablet-portrait')
     */
    getCurrentBreakpoint() {
        return this._currentBreakpoint;
    }

    /**
     * Get the current viewport width
     * @returns {number} Current viewport width in pixels
     */
    getViewportWidth() {
        return window.innerWidth;
    }

    /**
     * Check if the current viewport is at or below a specific breakpoint
     * @param {string} breakpointName - Name of breakpoint to check (e.g., 'tablet-portrait')
     * @returns {boolean} True if viewport is at or below the specified breakpoint
     */
    isAtMost(breakpointName) {
        const bp = BREAKPOINTS.find(b => b.name === breakpointName);
        if (!bp || bp.maxWidth === undefined) {
            logger.warn('[BreakpointManager] Unknown breakpoint:', breakpointName);
            return false;
        }
        return window.innerWidth <= bp.maxWidth;
    }

    /**
     * Check if the current viewport is at or above a specific breakpoint
     * @param {string} breakpointName - Name of breakpoint to check (e.g., 'large-desktop')
     * @returns {boolean} True if viewport is at or above the specified breakpoint
     */
    isAtLeast(breakpointName) {
        const bp = BREAKPOINTS.find(b => b.name === breakpointName);
        if (!bp) {
            logger.warn('[BreakpointManager] Unknown breakpoint:', breakpointName);
            return false;
        }
        
        if (bp.minWidth !== undefined) {
            return window.innerWidth >= bp.minWidth;
        }
        // For max-width breakpoints, "at least" means above their threshold
        if (bp.maxWidth !== undefined) {
            return window.innerWidth > bp.maxWidth;
        }
        return false;
    }

    /**
     * Check if viewport matches a mobile breakpoint (portrait or landscape)
     * @returns {boolean} True if viewport is mobile-sized
     */
    isMobile() {
        return this.isAtMost('mobile-landscape');
    }

    /**
     * Check if viewport matches a tablet breakpoint
     * @returns {boolean} True if viewport is tablet-sized
     */
    isTablet() {
        const width = window.innerWidth;
        return width >= 768 && width < 1200;
    }

    /**
     * Check if viewport matches a desktop breakpoint
     * @returns {boolean} True if viewport is desktop-sized
     */
    isDesktop() {
        return window.innerWidth >= 1200;
    }

    /**
     * Register a callback for breakpoint changes
     * @param {Function} callback - Function called with (newBreakpoint, oldBreakpoint)
     * @returns {Function} Unsubscribe function
     */
    onChange(callback) {
        if (typeof callback !== 'function') {
            logger.error('[BreakpointManager] onChange requires a function');
            return () => {};
        }

        this._listeners.push(callback);

        // Return unsubscribe function
        return () => {
            const index = this._listeners.indexOf(callback);
            if (index > -1) {
                this._listeners.splice(index, 1);
            }
        };
    }

    /**
     * Get all breakpoint definitions
     * @returns {Array} Array of breakpoint objects
     */
    getBreakpoints() {
        return [...BREAKPOINTS];
    }

    /**
     * Force a breakpoint update (useful after orientation changes)
     */
    refresh() {
        this._updateBreakpoints();
    }
}

// Export singleton instance
export const breakpointManager = new BreakpointManager();

// Also export class for testing purposes
export { BreakpointManager };
