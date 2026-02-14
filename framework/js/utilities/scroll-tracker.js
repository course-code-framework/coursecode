import engagementManager from '../engagement/engagement-manager.js';

/**
 * ScrollTracker
 * 
 * Tracks scroll depth for a container element using requestAnimationFrame.
 * No throttling needed - rAF naturally limits to ~60fps and is deterministic.
 * 
 * Benefits of rAF approach:
 * - Naturally syncs with browser paint cycle (~16ms/60fps)
 * - No complex throttle/debounce timing to tune
 * - Deterministic behavior - no race conditions
 * - Automatically paused when tab is inactive
 * - No memory leaks from throttle closures
 */
export class ScrollTracker {
    constructor(containerSelector, slideId) {
        this.container = document.querySelector(containerSelector);
        if (!this.container) {
            throw new Error(`[ScrollTracker] Container not found: ${containerSelector}. Ensure the container exists in the DOM before creating ScrollTracker.`);
        }
        
        this.slideId = slideId;
        this.maxDepth = 0;
        this.rafId = null;
        this.isScrolling = false;

        this.handleScroll = () => {
            if (!this.isScrolling) {
                this.isScrolling = true;
                this.rafId = requestAnimationFrame(() => this.updateDepth());
            }
        };

        this.container.addEventListener('scroll', this.handleScroll, { passive: true });
        
        // Check initial depth in case content is short
        this.updateDepth();
    }

    updateDepth() {
        const depth = this.calculateDepth();
        if (depth > this.maxDepth) {
            this.maxDepth = depth;
            engagementManager.trackScrollDepth(this.slideId, depth);
        }
        this.isScrolling = false;
    }

    calculateDepth() {
        const { scrollTop, scrollHeight, clientHeight } = this.container;
        const maxScroll = scrollHeight - clientHeight;
        
        // Handle edge case where content fits without scrolling
        if (maxScroll <= 0) return 100;
        
        return Math.round((scrollTop / maxScroll) * 100);
    }

    destroy() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
        if (this.container) {
            this.container.removeEventListener('scroll', this.handleScroll);
        }
    }
}
