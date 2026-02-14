/**
 * @file audio-manager.js
 * @description Singleton manager for audio playback in SCORM courses.
 * Handles narration audio for slides, modals, and tabs with position persistence
 * and completion tracking for gating requirements.
 * 
 * Features:
 * - Single audio instance (one narrator at a time)
 * - Position persistence via stateManager
 * - Completion tracking with configurable threshold
 * - Event-based state communication
 * - Accessibility support (mute state, keyboard controls)
 * 
 * @author Framework
 * @version 2.0.0
 */

import { eventBus } from '../core/event-bus.js';
import stateManager from '../state/index.js';
import { logger } from '../utilities/logger.js';

/**
 * @typedef {Object} AudioState
 * @property {string|null} currentSrc - Current audio source URL
 * @property {string|null} contextId - Current context (slideId, modalId, or tabId)
 * @property {string} contextType - Type of context ('slide' | 'modal' | 'tab')
 * @property {number} position - Current playback position in seconds
 * @property {boolean} isPlaying - Whether audio is currently playing
 * @property {boolean} isMuted - Whether audio is muted
 * @property {number} duration - Total duration of current track
 * @property {number} volume - Volume level (0-1)
 * @property {boolean} required - Whether audio completion is required for gating
 * @property {number} completionThreshold - Percentage (0-1) required for completion
 * @property {boolean} isCompleted - Whether audio has reached completion threshold
 */

/**
 * @typedef {Object} AudioConfig
 * @property {string} src - Audio file source path (relative to course/assets/)
 * @property {boolean} [autoplay=false] - Whether to autoplay when loaded
 * @property {boolean} [required=false] - Whether completion is required for gating
 * @property {number} [completionThreshold=0.95] - Percentage (0-1) required for completion
 */

/** Default completion threshold (95%) */
const DEFAULT_COMPLETION_THRESHOLD = 0.95;

class AudioManager {
    constructor() {
        /** @type {HTMLAudioElement|null} */
        this.audio = null;
        
        /** @type {AudioState} */
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
            completionThreshold: DEFAULT_COMPLETION_THRESHOLD,
            isCompleted: false
        };
        
        /** @type {boolean} */
        this.isInitialized = false;
        
        /** @type {Map<string, number>} - Stores positions for each context */
        this.positionCache = new Map();
        
        /** @type {Map<string, boolean>} - Stores completion status for each context */
        this.completionCache = new Map();
        
        /** @type {number|null} */
        this.updateInterval = null;
        
        /** @type {number} - Tracks max position reached (handles seeks/replays) */
        this.maxPositionReached = 0;
        
        /** @type {boolean} - Flag to ignore errors during intentional source switches */
        this._isSwitchingSource = false;
        
        /** @type {Function|null} - Cleanup function for pending load operation */
        this._pendingLoadCleanup = null;
    }

    /**
     * Initializes the AudioManager. Must be called once during app startup.
     * @throws {Error} If already initialized
     */
    initialize() {
        if (this.isInitialized) {
            logger.warn('[AudioManager] Already initialized');
            return;
        }

        // Create the audio element
        this.audio = new Audio();
        this.audio.preload = 'metadata';
        
        // Explicitly set muted to false (some browsers may default differently)
        this.audio.muted = false;
        
        // Set up audio event listeners
        this._setupAudioListeners();
        
        // Restore persisted state (may override muted based on user preference)
        this._hydrateFromState();
        
        this.isInitialized = true;
        logger.debug('[AudioManager] Initialized');
        
        eventBus.emit('audio:initialized');
    }

    /**
     * Sets up event listeners on the audio element.
     * @private
     */
    _setupAudioListeners() {
        const audio = this.audio;

        // Handle duration becoming available (fallback for streaming/chunked responses)
        // Only emits if duration wasn't set by loadedmetadata
        audio.addEventListener('durationchange', () => {
            if (isFinite(audio.duration) && audio.duration > 0 && !this.state.duration) {
                this.state.duration = audio.duration;
                // Re-emit loaded event when we get a valid duration
                eventBus.emit('audio:loaded', {
                    src: this.state.currentSrc,
                    duration: this.state.duration,
                    contextId: this.state.contextId,
                    contextType: this.state.contextType
                });
            }
        });

        audio.addEventListener('loadedmetadata', () => {
            // Only set duration if it's a finite value
            if (isFinite(audio.duration) && audio.duration > 0) {
                this.state.duration = audio.duration;
            }
            this._emitStateChange('loaded');
            eventBus.emit('audio:loaded', {
                src: this.state.currentSrc,
                duration: this.state.duration,
                contextId: this.state.contextId,
                contextType: this.state.contextType
            });
        });

        audio.addEventListener('play', () => {
            this.state.isPlaying = true;
            this._startPositionUpdates();
            this._emitStateChange('play');
            eventBus.emit('audio:play', { 
                contextId: this.state.contextId,
                contextType: this.state.contextType
            });
        });

        audio.addEventListener('pause', () => {
            this.state.isPlaying = false;
            this._stopPositionUpdates();
            this._savePosition();
            this._emitStateChange('pause');
            eventBus.emit('audio:pause', { 
                contextId: this.state.contextId,
                contextType: this.state.contextType,
                position: this.state.position 
            });
        });

        audio.addEventListener('ended', () => {
            this.state.isPlaying = false;
            this.state.position = this.audio.duration;
            this._stopPositionUpdates();
            
            // Mark as completed when audio ends (100% listened)
            this._checkAndMarkCompleted();
            
            this._emitStateChange('ended');
            eventBus.emit('audio:ended', { contextId: this.state.contextId });
        });

        audio.addEventListener('timeupdate', () => {
            this.state.position = audio.currentTime;
            
            // Track max position for completion calculation
            if (audio.currentTime > this.maxPositionReached) {
                this.maxPositionReached = audio.currentTime;
            }
            
            // Check for completion threshold during playback
            this._checkAndMarkCompleted();
        });

        audio.addEventListener('error', (_e) => {
            const error = audio.error;
            
            // Ignore MEDIA_ERR_ABORTED (code 1) during intentional source switches
            // This happens when we change src while audio is loading/playing
            if (this._isSwitchingSource && error?.code === 1) {
                logger.debug('[AudioManager] Ignoring aborted error during source switch');
                return;
            }
            
            const errorMessage = error ? `${error.code}: ${error.message}` : 'Unknown error';
            
            this.state.isPlaying = false;
            this._stopPositionUpdates();
            
            logger.error(`[AudioManager] Audio playback error: ${errorMessage}`, { domain: 'audio', operation: 'playback', src: this.state.currentSrc, contextId: this.state.contextId });
        });

        audio.addEventListener('volumechange', () => {
            // Only sync volume from this listener, NOT muted state.
            // Muted state is managed explicitly via toggleMute()/setMuted() to prevent
            // browser autoplay policies or source changes from overwriting user preference.
            this.state.volume = audio.volume;
            this._emitStateChange('volumechange');
        });
    }

    /**
     * Loads an audio file for playback.
     * @param {AudioConfig} config - Audio configuration
     * @param {string} contextId - The context identifier (slideId, modalId, tabId)
     * @param {string} [contextType='slide'] - The type of context
     * @returns {Promise<void>}
     */
    async load(config, contextId, contextType = 'slide') {
        this._requireInitialized();

        if (!config || !config.src) {
            throw new Error('AudioManager.load: config.src is required');
        }
        if (!contextId) {
            throw new Error('AudioManager.load: contextId is required');
        }

        // Save position of current track before switching
        if (this.state.currentSrc && this.state.contextId !== contextId) {
            this._savePosition();
        }

        // Stop current playback
        this.pause();

        // Resolve the audio path (relative to course/assets/)
        const audioSrc = this._resolvePath(config.src);
        
        // Update state with new audio config
        // IMPORTANT: Reset isPlaying to false since new audio isn't playing yet
        this.state.currentSrc = audioSrc;
        this.state.contextId = contextId;
        this.state.contextType = contextType;
        this.state.duration = 0;
        this.state.isPlaying = false;  // Reset - new audio isn't playing
        this.state.position = 0;       // Reset position for new audio
        this.state.required = config.required || false;
        this.state.completionThreshold = config.completionThreshold ?? DEFAULT_COMPLETION_THRESHOLD;
        this.maxPositionReached = 0;
        
        // Check if already completed (from previous session)
        this.state.isCompleted = this._isContextCompleted(contextId);
        
        // Check for saved position
        const savedPosition = this._getSavedPosition(contextId);
        
        // Emit loadStart event BEFORE setting src (allows UI to show placeholder/loading state)
        eventBus.emit('audio:loadStart', {
            contextId,
            contextType,
            src: audioSrc
        });
        
        // Clean up any pending load operation before starting new one
        if (this._pendingLoadCleanup) {
            this._pendingLoadCleanup();
            this._pendingLoadCleanup = null;
        }
        
        // Set flag to ignore MEDIA_ERR_ABORTED during source switch
        this._isSwitchingSource = true;
        
        return new Promise((resolve, reject) => {
            let resolved = false;
            
            const onLoaded = () => {
                if (resolved) return;
                resolved = true;
                
                // Restore position if we have one saved, otherwise reset to start
                if (savedPosition > 0 && savedPosition < this.audio.duration) {
                    this.audio.currentTime = savedPosition;
                    this.state.position = savedPosition;
                    // Also restore maxPositionReached for correct completion tracking
                    this.maxPositionReached = savedPosition;
                } else {
                    this.audio.currentTime = 0;
                    this.state.position = 0;
                }
                
                // Emit progress event to sync UI with restored position
                eventBus.emit('audio:progress', {
                    position: this.state.position,
                    duration: this.state.duration,
                    percentage: this.getProgressPercentage()
                });
                
                // Re-apply mute state to audio element (browser may have reset it on new source)
                // Do this BEFORE clearing _isSwitchingSource so the volumechange event is ignored
                this.audio.muted = this.state.isMuted;
                
                // NOW clear the switching flag - after mute state is applied
                this._isSwitchingSource = false;
                
                cleanup();
                
                // Autoplay if configured
                if (config.autoplay) {
                    this.play().catch(err => {
                        // Autoplay may be blocked by browser - log but don't fail
                        logger.warn('[AudioManager] Autoplay blocked:', err.message);
                    });
                }
                
                resolve();
            };
            
            const onError = (_e) => {
                const error = this.audio.error;
                
                // Ignore MEDIA_ERR_ABORTED (code 1) - this fires when we switch sources
                if (error?.code === 1) {
                    logger.debug('[AudioManager] Ignoring abort error during load');
                    return; // Don't cleanup or reject - wait for the real load
                }
                
                if (resolved) return;
                resolved = true;
                
                // Clear the switching flag on real error
                this._isSwitchingSource = false;
                cleanup();
                reject(new Error(`Failed to load audio: ${audioSrc}`));
            };
            
            const cleanup = () => {
                this.audio.removeEventListener('canplaythrough', onLoaded);
                this.audio.removeEventListener('error', onError);
                this._pendingLoadCleanup = null;
            };
            
            // Store cleanup function so it can be called if load is cancelled
            this._pendingLoadCleanup = cleanup;
            
            // Add event listeners BEFORE setting src
            this.audio.addEventListener('canplaythrough', onLoaded);
            this.audio.addEventListener('error', onError);
            
            // Set the source and trigger load
            this.audio.src = audioSrc;
            this.audio.load();
            
            // CRITICAL: Check if audio is already ready (cached audio loads synchronously)
            // readyState 4 = HAVE_ENOUGH_DATA, meaning canplaythrough should have fired
            // but sometimes the event doesn't fire for cached audio
            if (this.audio.readyState >= 4) {
                logger.debug('[AudioManager] Audio already ready (cached), resolving immediately');
                onLoaded();
            }
        });
    }

    /**
     * Starts or resumes playback.
     * @returns {Promise<void>}
     */
    async play() {
        this._requireInitialized();
        
        if (!this.state.currentSrc) {
            logger.warn('[AudioManager] No audio loaded');
            return;
        }

        try {
            await this.audio.play();
        } catch (error) {
            // Browser may block autoplay - emit event for UI to show play button
            eventBus.emit('audio:playBlocked', {
                contextId: this.state.contextId,
                reason: error.message
            });
            throw error;
        }
    }

    /**
     * Pauses playback.
     */
    pause() {
        this._requireInitialized();
        
        if (this.audio && !this.audio.paused) {
            this.audio.pause();
        }
    }

    /**
     * Toggles play/pause state.
     * @returns {Promise<void>}
     */
    async togglePlayPause() {
        if (this.state.isPlaying) {
            this.pause();
        } else {
            await this.play();
        }
    }

    /**
     * Restarts the current track from the beginning.
     */
    restart() {
        this._requireInitialized();
        
        if (!this.state.currentSrc) {
            return;
        }

        this.audio.currentTime = 0;
        this.state.position = 0;
        this.maxPositionReached = 0;
        this._clearSavedPosition(this.state.contextId);
        
        // Emit progress event to sync UI immediately
        eventBus.emit('audio:progress', {
            position: 0,
            duration: this.state.duration,
            percentage: 0
        });
        
        eventBus.emit('audio:restart', { contextId: this.state.contextId });
    }

    /**
     * Seeks to a specific position.
     * @param {number} position - Position in seconds
     */
    seek(position) {
        this._requireInitialized();
        
        if (!this.state.currentSrc || !this.audio.duration) {
            return;
        }

        const clampedPosition = Math.max(0, Math.min(position, this.audio.duration));
        this.audio.currentTime = clampedPosition;
        this.state.position = clampedPosition;
        
        eventBus.emit('audio:seek', { 
            contextId: this.state.contextId,
            position: clampedPosition 
        });
    }

    /**
     * Seeks to a percentage of the track duration.
     * @param {number} percentage - Percentage (0-100)
     */
    seekToPercentage(percentage) {
        if (!this.state.duration) return;
        
        const position = (percentage / 100) * this.state.duration;
        this.seek(position);
    }

    /**
     * Toggles mute state.
     */
    toggleMute() {
        this._requireInitialized();
        
        // Update our state first (authoritative)
        this.state.isMuted = !this.state.isMuted;
        // Then sync to audio element
        this.audio.muted = this.state.isMuted;
        this._persistMuteState();
        // Emit state change for UI sync
        this._emitStateChange('volumechange');
    }

    /**
     * Sets the mute state.
     * @param {boolean} muted - Whether to mute
     */
    setMuted(muted) {
        this._requireInitialized();
        
        // Update our state first (authoritative)
        this.state.isMuted = muted;
        // Then sync to audio element
        this.audio.muted = muted;
        this._persistMuteState();
        // Emit state change for UI sync
        this._emitStateChange('volumechange');
    }

    /**
     * Sets the volume.
     * @param {number} volume - Volume level (0-1)
     */
    setVolume(volume) {
        this._requireInitialized();
        
        this.audio.volume = Math.max(0, Math.min(1, volume));
    }

    /**
     * Unloads the current audio and clears state.
     * Called when leaving a slide or closing a modal.
     */
    unload() {
        if (!this.isInitialized) return;

        // Save position before unloading
        this._savePosition();
        
        // Clean up any pending load operation
        if (this._pendingLoadCleanup) {
            this._pendingLoadCleanup();
            this._pendingLoadCleanup = null;
        }
        
        // Save contextType before clearing state (needed for event)
        const contextType = this.state.contextType;
        
        // Stop playback
        this.pause();
        this._stopPositionUpdates();
        
        // Set flag to ignore any MEDIA_ERR_ABORTED during unload
        this._isSwitchingSource = true;
        
        // Clear audio source properly
        // NOTE: Do NOT call this.audio.load() after removing src - it triggers an error event
        // that can interfere with subsequent audio loads on the next slide.
        // Just removing the src attribute is sufficient to abort pending requests and reset.
        this.audio.removeAttribute('src');
        
        // Clear the switching flag after removing src
        this._isSwitchingSource = false;
        
        // Clear state (keep mute preference)
        const wasMuted = this.state.isMuted;
        this.state = {
            currentSrc: null,
            contextId: null,
            contextType: 'slide',
            position: 0,
            isPlaying: false,
            isMuted: wasMuted,
            duration: 0,
            volume: this.state.volume,
            required: false,
            completionThreshold: DEFAULT_COMPLETION_THRESHOLD,
            isCompleted: false
        };
        this.maxPositionReached = 0;
        
        this._emitStateChange('unloaded');
        eventBus.emit('audio:unloaded', { contextType });
    }

    /**
     * Gets the current audio state.
     * @returns {AudioState}
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
     * Checks if audio is currently loaded.
     * @returns {boolean}
     */
    hasAudio() {
        return !!this.state.currentSrc;
    }

    /**
     * Checks if the manager is initialized.
     * @returns {boolean}
     */
    isReady() {
        return this.isInitialized;
    }

    /**
     * Checks if the current audio has been completed.
     * @returns {boolean}
     */
    isCurrentAudioCompleted() {
        return this.state.isCompleted;
    }

    /**
     * Checks if audio for a specific context has been completed.
     * @param {string} contextId - The context identifier
     * @returns {boolean}
     */
    isAudioCompleted(contextId) {
        return this._isContextCompleted(contextId);
    }

    /**
     * Checks if current audio requires completion for gating.
     * @returns {boolean}
     */
    isAudioRequired() {
        return this.state.required;
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
            throw new Error('AudioManager: Not initialized. Call initialize() first.');
        }
    }

    /**
     * Resolves audio path relative to course/assets/.
     * Converts narration sources to their generated .mp3 files:
     * - @slides/X.js → audio/X.mp3 (main slide narration)
     * - @slides/X.js#key → audio/X--key.mp3 (modal/tab narration)
     * @private
     * @param {string} src - Source path
     * @returns {string} Resolved path
     */
    _resolvePath(src) {
        let resolvedSrc = src;
        
        // Convert @slides/X.js or @slides/X.js#key to audio/X.mp3 or audio/X--key.mp3
        if (src.startsWith('@slides/')) {
            // Check for fragment (#key) for modal/tab narration
            const fragmentMatch = src.match(/^@slides\/([\w-]+)\.js(?:#([\w-]+))?$/);
            if (fragmentMatch) {
                const slideName = fragmentMatch[1];
                const key = fragmentMatch[2];
                
                if (key) {
                    // Modal/tab specific audio: slidename--key.mp3
                    resolvedSrc = `audio/${slideName}--${key}.mp3`;
                } else {
                    // Main slide audio: slidename.mp3
                    resolvedSrc = `audio/${slideName}.mp3`;
                }
            }
        }
        
        // If already a full path or URL, return as-is
        if (resolvedSrc.startsWith('http') || resolvedSrc.startsWith('/') || resolvedSrc.startsWith('./')) {
            return this._appendCacheBuster(resolvedSrc);
        }
        // Otherwise, assume relative to course/assets/
        return this._appendCacheBuster(`./course/assets/${resolvedSrc}`);
    }

    /**
     * Appends cache-busting query parameter to URL.
     * Uses build timestamp injected by Vite to ensure CDNs serve fresh assets.
     * @private
     * @param {string} url - The URL to append cache buster to
     * @returns {string} URL with cache buster
     */
    _appendCacheBuster(url) {
        // __BUILD_TIMESTAMP__ is injected by Vite at build time
        const buildTimestamp = typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : Date.now().toString();
        
        // Skip cache busting for data URIs
        if (url.startsWith('data:')) {
            return url;
        }
        
        // Append as query parameter
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}v=${buildTimestamp}`;
    }

    /**
     * Emits a state change event with current state.
     * @private
     * @param {string} reason - Reason for the state change
     */
    _emitStateChange(reason) {
        eventBus.emit('audio:stateChange', {
            state: this.getState(),
            reason
        });
    }

    /**
     * Starts periodic position updates for UI.
     * @private
     */
    _startPositionUpdates() {
        this._stopPositionUpdates();
        this.updateInterval = setInterval(() => {
            // Use audio element's duration directly if state.duration isn't valid
            // This handles cases where duration becomes known after initial load
            let duration = this.state.duration;
            if (!isFinite(duration) && isFinite(this.audio.duration)) {
                duration = this.audio.duration;
                this.state.duration = duration; // Update state with valid duration
            }
            
            eventBus.emit('audio:progress', {
                position: this.state.position,
                duration: duration,
                percentage: this.getProgressPercentage()
            });
        }, 250); // Update 4 times per second
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
     * Saves the current position for the current context.
     * @private
     */
    _savePosition() {
        if (!this.state.contextId || !this.state.position) return;
        
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
     * Clears the saved position for a context.
     * @private
     * @param {string} contextId - Context identifier
     */
    _clearSavedPosition(contextId) {
        this.positionCache.delete(contextId);
        this._persistPositions();
    }

    /**
     * Persists position cache to stateManager.
     * @private
     */
    _persistPositions() {
        try {
            const positions = Object.fromEntries(this.positionCache);
            const audioState = stateManager.getDomainState('audio') || {};
            stateManager.setDomainState('audio', {
                ...audioState,
                positions
            });
        } catch (error) {
            logger.warn('[AudioManager] Failed to persist positions:', error.message);
        }
    }

    /**
     * Persists mute state to stateManager.
     * @private
     */
    _persistMuteState() {
        try {
            const audioState = stateManager.getDomainState('audio') || {};
            stateManager.setDomainState('audio', {
                ...audioState,
                muted: this.state.isMuted
            });
        } catch (error) {
            logger.warn('[AudioManager] Failed to persist mute state:', error.message);
        }
    }

    /**
     * Hydrates state from stateManager on initialization.
     * @private
     */
    _hydrateFromState() {
        try {
            const audioState = stateManager.getDomainState('audio');
            if (!audioState) return;

            // Restore positions
            if (audioState.positions) {
                this.positionCache = new Map(Object.entries(audioState.positions));
            }

            // Restore completion states
            if (audioState.completions) {
                this.completionCache = new Map(Object.entries(audioState.completions));
            }

            // Restore mute state
            if (typeof audioState.muted === 'boolean') {
                this.state.isMuted = audioState.muted;
                this.audio.muted = audioState.muted;
            }

            logger.debug('[AudioManager] State hydrated from storage');
        } catch (error) {
            logger.warn('[AudioManager] Failed to hydrate state:', error.message);
        }
    }

    /**
     * Checks if audio has reached completion threshold and marks it complete.
     * @private
     */
    _checkAndMarkCompleted() {
        if (!this.state.contextId || !this.state.duration || this.state.isCompleted) {
            return;
        }

        // Calculate completion based on max position reached (handles seeks/replays)
        const completionPercentage = this.maxPositionReached / this.state.duration;
        
        if (completionPercentage >= this.state.completionThreshold) {
            this.state.isCompleted = true;
            this._markContextCompleted(this.state.contextId);
            
            logger.debug(`[AudioManager] Audio completed for context: ${this.state.contextId}`);
            
            eventBus.emit('audio:completed', {
                contextId: this.state.contextId,
                contextType: this.state.contextType,
                required: this.state.required
            });
        }
    }

    /**
     * Marks a context's audio as completed.
     * @private
     * @param {string} contextId - Context identifier
     */
    _markContextCompleted(contextId) {
        this.completionCache.set(contextId, true);
        this._persistCompletions();
    }

    /**
     * Checks if a context's audio has been completed.
     * @private
     * @param {string} contextId - Context identifier
     * @returns {boolean}
     */
    _isContextCompleted(contextId) {
        return this.completionCache.get(contextId) || false;
    }

    /**
     * Persists completion cache to stateManager.
     * @private
     */
    _persistCompletions() {
        try {
            const completions = Object.fromEntries(this.completionCache);
            const audioState = stateManager.getDomainState('audio') || {};
            stateManager.setDomainState('audio', {
                ...audioState,
                completions
            });
        } catch (error) {
            logger.warn('[AudioManager] Failed to persist completions:', error.message);
        }
    }

    /**
     * Resets completion state for a specific context.
     * Useful for course retakes.
     * @param {string} contextId - Context identifier
     */
    resetCompletion(contextId) {
        this.completionCache.delete(contextId);
        this._persistCompletions();
        
        if (this.state.contextId === contextId) {
            this.state.isCompleted = false;
        }
    }

    /**
     * Resets all completion states.
     * Useful for full course retakes.
     */
    resetAllCompletions() {
        this.completionCache.clear();
        this._persistCompletions();
        this.state.isCompleted = false;
    }
}

// Create singleton instance
const audioManager = new AudioManager();

export default audioManager;
