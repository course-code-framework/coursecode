/**
 * @file video-manager.js
 * @description Singleton manager for video playback in SCORM courses.
 * Handles video for slides and standalone players with position persistence
 * and completion tracking for gating requirements.
 * 
 * Features:
 * - Single video instance per context
 * - Position persistence via stateManager
 * - Completion tracking with configurable threshold
 * - Event-based state communication
 * - Native HTML5 video support
 * 
 * @author Framework
 * @version 1.0.0
 */

import { eventBus } from '../core/event-bus.js';
import stateManager from '../state/index.js';
import { logger } from '../utilities/logger.js';
import {
    DEFAULT_MEDIA_COMPLETION_THRESHOLD,
    normalizeCompletionThreshold
} from '../utilities/media-utils.js';

/**
 * @typedef {Object} VideoState
 * @property {string|null} currentSrc - Current video source URL
 * @property {string|null} contextId - Current context identifier
 * @property {string} contextType - Type of context ('slide' | 'standalone')
 * @property {number} position - Current playback position in seconds
 * @property {boolean} isPlaying - Whether video is currently playing
 * @property {boolean} isMuted - Whether video is muted
 * @property {number} duration - Total duration of current video
 * @property {number} volume - Volume level (0-1)
 * @property {boolean} required - Whether video completion is required for gating
 * @property {number} completionThreshold - Percentage (0-1) required for completion
 * @property {boolean} isCompleted - Whether video has reached completion threshold
 */

/**
 * @typedef {Object} VideoConfig
 * @property {string} src - Video file source path (relative to course/assets/)
 * @property {string} [poster] - Poster image path
 * @property {string} [captions] - VTT captions file path
 * @property {boolean} [autoplay=false] - Whether to autoplay when loaded
 * @property {boolean} [required=false] - Whether completion is required for gating
 * @property {number} [completionThreshold=0.95] - Percentage (0-1) required for completion
 */

class VideoManager {
    constructor() {
        /** @type {boolean} */
        this.isInitialized = false;

        /** @type {VideoState} */
        this.state = {
            currentSrc: null,
            contextId: null,
            contextType: 'slide',
            position: 0,
            isPlaying: false,
            isMuted: false,
            duration: 0,
            volume: 1,
            required: false,
            completionThreshold: DEFAULT_MEDIA_COMPLETION_THRESHOLD,
            isCompleted: false
        };

        /** @type {Map<string, number>} - Stores positions for each context */
        this.positionCache = new Map();

        /** @type {Map<string, boolean>} - Stores completion status for each context */
        this.completionCache = new Map();

        /** @type {number} - Tracks max position reached (handles seeks/replays) */
        this.maxPositionReached = 0;

        /** @type {number|null} */
        this.updateInterval = null;

        /** @type {HTMLVideoElement|null} */
        this.activeVideo = null;
    }

    /**
     * Initializes the VideoManager. Must be called once during app startup.
     */
    initialize() {
        if (this.isInitialized) {
            logger.warn('[VideoManager] Already initialized');
            return;
        }

        // Restore persisted state
        this._hydrateFromState();

        this.isInitialized = true;
        logger.debug('[VideoManager] Initialized');

        eventBus.emit('video:initialized');
    }

    /**
     * Attaches event listeners to a video element for state tracking.
     * Unlike AudioManager, VideoManager doesn't own the video element -
     * each video-player component owns its own video element.
     * @param {HTMLVideoElement} video - The video element to attach to
     * @param {string} contextId - The context identifier
     * @param {VideoConfig} config - Video configuration
     */
    attachVideo(video, contextId, config) {
        this._requireInitialized();

        if (!video || !(video instanceof HTMLVideoElement)) {
            throw new Error('VideoManager.attachVideo: video element is required');
        }
        if (!contextId) {
            throw new Error('VideoManager.attachVideo: contextId is required');
        }

        const savedPosition = this._getSavedPosition(contextId);

        video._videoManagerState = {
            currentSrc: config.src,
            contextId,
            contextType: config.contextType || 'standalone',
            duration: 0,
            position: 0,
            required: config.required || false,
            completionThreshold: normalizeCompletionThreshold(config.completionThreshold),
            isCompleted: this._isContextCompleted(contextId),
            maxPositionReached: savedPosition
        };

        // Set up event listeners
        this._setupVideoListeners(video, contextId, savedPosition);

        if (!this.activeVideo) {
            this._activateVideo(video);
        }

        // Emit loadStart event
        eventBus.emit('video:loadStart', {
            contextId,
            contextType: video._videoManagerState.contextType,
            src: config.src
        });

        logger.debug(`[VideoManager] Attached video: ${contextId}`);
    }

    /**
     * Activates a rendered video, pausing and saving the previous context so
     * playback and completion events cannot be attributed to another player.
     * @private
     * @param {HTMLVideoElement} video
     */
    _activateVideo(video) {
        const localState = video?._videoManagerState;
        if (!localState || this.activeVideo === video) return;

        const previousVideo = this.activeVideo;
        if (previousVideo) {
            if (Number.isFinite(previousVideo.currentTime)) {
                this.state.position = previousVideo.currentTime;
            }
            this._savePosition();
            if (!previousVideo.paused) {
                previousVideo.pause();
            }
        }

        this._stopPositionUpdates();
        this.activeVideo = video;
        this.maxPositionReached = localState.maxPositionReached;
        this.state = {
            currentSrc: localState.currentSrc,
            contextId: localState.contextId,
            contextType: localState.contextType,
            position: video.currentTime || localState.position || 0,
            isPlaying: !video.paused,
            isMuted: video.muted,
            duration: Number.isFinite(video.duration) && video.duration > 0
                ? video.duration
                : localState.duration,
            volume: video.volume,
            required: localState.required,
            completionThreshold: localState.completionThreshold,
            isCompleted: localState.isCompleted
        };
    }

    /**
     * Sets up event listeners on a video element.
     * @private
     * @param {HTMLVideoElement} video - The video element
     * @param {string} contextId - The context identifier
     * @param {number} savedPosition - Saved position to restore
     */
    _setupVideoListeners(video, contextId, savedPosition) {
        // Store reference for cleanup
        video._videoManagerContextId = contextId;
        video._videoManagerListeners = {};

        const listeners = video._videoManagerListeners;
        const localState = video._videoManagerState;

        listeners.loadedmetadata = () => {
            if (Number.isFinite(video.duration) && video.duration > 0) {
                localState.duration = video.duration;
            }

            // Restore position if we have one saved
            if (savedPosition > 0 && savedPosition < video.duration) {
                video.currentTime = savedPosition;
                localState.position = savedPosition;
                localState.maxPositionReached = savedPosition;
            }

            if (this.activeVideo === video) {
                this.state.duration = localState.duration;
                this.state.position = localState.position;
                this.maxPositionReached = localState.maxPositionReached;
            }

            eventBus.emit('video:loaded', {
                src: localState.currentSrc,
                duration: localState.duration,
                contextId,
                contextType: localState.contextType
            });
        };

        listeners.play = () => {
            this._activateVideo(video);
            this.state.isPlaying = true;
            this._startPositionUpdates(video);
            eventBus.emit('video:play', {
                contextId,
                contextType: localState.contextType
            });
        };

        listeners.pause = () => {
            localState.position = video.currentTime;
            if (this.activeVideo === video) {
                this.state.position = video.currentTime;
                this.state.isPlaying = false;
                this._stopPositionUpdates();
                this._savePosition();
            }
            eventBus.emit('video:pause', {
                contextId,
                contextType: localState.contextType,
                position: localState.position
            });
        };

        listeners.ended = () => {
            this._activateVideo(video);
            localState.position = video.duration;
            localState.maxPositionReached = video.duration;
            this.state.isPlaying = false;
            this.state.position = video.duration;
            this.maxPositionReached = video.duration;
            this._stopPositionUpdates();

            // Mark as completed when video ends
            this._checkAndMarkCompleted();

            eventBus.emit('video:ended', { contextId });
        };

        listeners.timeupdate = () => {
            localState.position = video.currentTime;

            // Track max position for completion calculation
            if (video.currentTime > localState.maxPositionReached) {
                localState.maxPositionReached = video.currentTime;
            }

            if (this.activeVideo === video) {
                this.state.position = video.currentTime;
                this.maxPositionReached = localState.maxPositionReached;
                this._checkAndMarkCompleted();
            }
        };

        listeners.volumechange = () => {
            if (this.activeVideo === video) {
                this.state.volume = video.volume;
                this.state.isMuted = video.muted;
                this._persistMuteState();
            }
        };

        listeners.error = () => {
            const error = video.error;
            const errorMessage = error ? `${error.code}: ${error.message}` : 'Unknown error';

            if (this.activeVideo === video) {
                this.state.isPlaying = false;
                this._stopPositionUpdates();
            }

            logger.error(`[VideoManager] Video playback error: ${errorMessage}`, { domain: 'video', operation: 'playback', src: localState.currentSrc, contextId });
        };

        // Attach all listeners
        for (const [event, handler] of Object.entries(listeners)) {
            video.addEventListener(event, handler);
        }

        // Apply persisted mute state
        video.muted = this.state.isMuted;
    }

    /**
     * Detaches event listeners from a video element.
     * @param {HTMLVideoElement} video - The video element
     */
    detachVideo(video) {
        if (!video || !video._videoManagerListeners) return;

        const localState = video._videoManagerState;
        const wasActive = this.activeVideo === video;

        // Save position before detaching
        if (wasActive) {
            this.state.position = Number.isFinite(video.currentTime)
                ? video.currentTime
                : this.state.position;
            this._savePosition();
        }

        // Remove all listeners
        for (const [event, handler] of Object.entries(video._videoManagerListeners)) {
            video.removeEventListener(event, handler);
        }

        delete video._videoManagerListeners;
        delete video._videoManagerContextId;
        delete video._videoManagerState;

        // Clear state if this was the active video
        if (wasActive) {
            this._stopPositionUpdates();
            this.activeVideo = null;
            this._resetActiveState();
        }

        eventBus.emit('video:unloaded', { contextType: localState?.contextType || 'standalone' });
        logger.debug('[VideoManager] Detached video');
    }

    /** @private */
    _resetActiveState() {
        const { isMuted, volume } = this.state;
        this.state = {
            currentSrc: null,
            contextId: null,
            contextType: 'standalone',
            position: 0,
            isPlaying: false,
            isMuted,
            duration: 0,
            volume,
            required: false,
            completionThreshold: DEFAULT_MEDIA_COMPLETION_THRESHOLD,
            isCompleted: false
        };
        this.maxPositionReached = 0;
    }

    /**
     * Gets the current video state.
     * @returns {VideoState}
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Gets the current playback position as a percentage.
     * @returns {number} Percentage (0-100)
     */
    getProgressPercentage() {
        if (!this.state.duration || !isFinite(this.state.duration)) return 0;
        return (this.state.position / this.state.duration) * 100;
    }

    /**
     * Checks if video is currently loaded.
     * @returns {boolean}
     */
    hasVideo() {
        return !!this.state.currentSrc;
    }

    /**
     * Checks if the current video has been completed.
     * @returns {boolean}
     */
    isCurrentVideoCompleted() {
        return this.state.isCompleted;
    }

    /**
     * Checks if video for a specific context has been completed.
     * @param {string} contextId - The context identifier
     * @returns {boolean}
     */
    isVideoCompleted(contextId) {
        return this._isContextCompleted(contextId);
    }

    // =================================================================
    // Private Methods
    // =================================================================

    /**
     * Throws if not initialized.
     * @private
     */
    _requireInitialized() {
        if (!this.isInitialized) {
            throw new Error('VideoManager: Not initialized. Call initialize() first.');
        }
    }

    /**
     * Starts periodic position updates for UI.
     * @private
     * @param {HTMLVideoElement} video - The video element
     */
    _startPositionUpdates(video) {
        this._stopPositionUpdates();
        this.updateInterval = setInterval(() => {
            if (!video || video.paused) {
                this._stopPositionUpdates();
                return;
            }

            let duration = this.state.duration;
            if (!isFinite(duration) && isFinite(video.duration)) {
                duration = video.duration;
                this.state.duration = duration;
            }

            eventBus.emit('video:progress', {
                position: this.state.position,
                duration: duration,
                percentage: this.getProgressPercentage()
            });
        }, 250);
    }

    /**
     * Stops periodic position updates.
     * @private
     */
    _stopPositionUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * Checks if completion threshold reached and marks completed.
     * @private
     */
    _checkAndMarkCompleted() {
        if (this.state.isCompleted) return;
        if (!this.state.duration || this.state.duration <= 0) return;

        const completionPercentage = this.maxPositionReached / this.state.duration;

        if (completionPercentage >= this.state.completionThreshold) {
            this.state.isCompleted = true;
            if (this.activeVideo?._videoManagerState) {
                this.activeVideo._videoManagerState.isCompleted = true;
            }
            this._markContextCompleted(this.state.contextId);

            logger.debug(`[VideoManager] Video completed: ${this.state.contextId}`);

            eventBus.emit('video:complete', {
                contextId: this.state.contextId,
                contextType: this.state.contextType,
                required: this.state.required
            });
        }
    }

    /**
     * Saves the current position for the current context.
     * @private
     */
    _savePosition() {
        if (!this.state.contextId || !Number.isFinite(this.state.position)) return;

        this.positionCache.set(this.state.contextId, this.state.position);
        this._persistPositions();
    }

    /**
     * Gets the saved position for a context.
     * @private
     * @param {string} contextId - Context identifier
     * @returns {number} Saved position in seconds (0 if none)
     */
    _getSavedPosition(contextId) {
        return this.positionCache.get(contextId) || 0;
    }

    /**
     * Checks if a context has been completed.
     * @private
     * @param {string} contextId - Context identifier
     * @returns {boolean}
     */
    _isContextCompleted(contextId) {
        return this.completionCache.get(contextId) || false;
    }

    /**
     * Marks a context as completed.
     * @private
     * @param {string} contextId - Context identifier
     */
    _markContextCompleted(contextId) {
        if (!contextId) return;
        this.completionCache.set(contextId, true);
        this._persistCompletions();
    }

    /**
     * Restores state from stateManager on initialization.
     * @private
     */
    _hydrateFromState() {
        try {
            const videoState = stateManager.getDomainState('video');
            if (videoState) {
                // Restore position cache
                if (videoState.positions) {
                    this.positionCache = new Map(Object.entries(videoState.positions));
                }

                // Restore completion cache
                if (videoState.completions) {
                    this.completionCache = new Map(Object.entries(videoState.completions));
                }

                // Restore mute preference
                if (typeof videoState.isMuted === 'boolean') {
                    this.state.isMuted = videoState.isMuted;
                }

                logger.debug('[VideoManager] Hydrated state from stateManager');
            }
        } catch (error) {
            logger.warn('[VideoManager] Failed to hydrate state:', error.message);
        }
    }

    /**
     * Persists position cache to stateManager.
     * @private
     */
    _persistPositions() {
        try {
            const currentState = stateManager.getDomainState('video') || {};
            currentState.positions = Object.fromEntries(this.positionCache);
            stateManager.setDomainState('video', currentState);
        } catch (error) {
            logger.warn('[VideoManager] Failed to persist positions:', error.message);
        }
    }

    /**
     * Persists completion cache to stateManager.
     * @private
     */
    _persistCompletions() {
        try {
            const currentState = stateManager.getDomainState('video') || {};
            currentState.completions = Object.fromEntries(this.completionCache);
            stateManager.setDomainState('video', currentState);
        } catch (error) {
            logger.warn('[VideoManager] Failed to persist completions:', error.message);
        }
    }

    /**
     * Persists mute state to stateManager.
     * @private
     */
    _persistMuteState() {
        try {
            const currentState = stateManager.getDomainState('video') || {};
            currentState.isMuted = this.state.isMuted;
            stateManager.setDomainState('video', currentState);
        } catch (error) {
            logger.warn('[VideoManager] Failed to persist mute state:', error.message);
        }
    }
}

// Export singleton instance
const videoManager = new VideoManager();
export default videoManager;
