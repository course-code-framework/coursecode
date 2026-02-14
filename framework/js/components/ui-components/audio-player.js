/**
 * @file audio-player.js
 * @description Audio player UI component for course narration.
 * 
 * Three usage modes:
 * 1. Slide-level: Renders in navigation footer via #audio-player element (auto-managed)
 * 2. Modal: Compact controls in modal footer via renderCompactPlayer()
 * 3. Standalone: Inline via data-component="audio-player" (author-placed, supports gating)
 * 
 * Standalone Usage:
 *   <div data-component="audio-player"
 *        data-audio-id="intro-narration"
 *        data-audio-src="audio/intro.mp3"
 *        data-audio-compact="false">
 *   </div>
 * 
 * Engagement config for gating (three distinct types):
 *   - Slide audio:      { type: 'slideAudioComplete', message: '...' }
 *   - Standalone audio: { type: 'audioComplete', audioId: 'intro-narration', message: '...' }
 *   - Modal audio:      { type: 'modalAudioComplete', modalId: 'details-modal', message: '...' }
 * 
 * Controls:
 * - Play/Pause toggle
 * - Restart (back to beginning)
 * - Progress bar (clickable for seeking) - full mode only
 * - Mute toggle
 * - Current time / Duration display - full mode only
 * 
 * @author Framework
 * @version 2.0.0
 */

export const schema = {
    type: 'audio-player',
    description: 'Audio player with progress bar and controls',
    example: `<div data-component="audio-player" data-audio-id="intro-narration" data-audio-src="audio/intro.mp3">
  <p style="color: #64748b; font-size: 0.875rem; font-style: italic;">🎧 Audio player renders dynamically with play/pause, progress bar, and mute controls.</p>
</div>`,
    properties: {
        audioId: { type: 'string', required: true, dataAttribute: 'data-audio-id' },
        audioSrc: { type: 'string', required: true, dataAttribute: 'data-audio-src' },
        compact: { type: 'boolean', default: false, dataAttribute: 'data-audio-compact' }
    },
    structure: {
        container: '[data-component="audio-player"]',
        children: {}  // Content is dynamically rendered
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/audio-player.css',
    engagementTracking: 'audioComplete',
    emitsEvents: ['audio:complete']
};

import { eventBus } from '../../core/event-bus.js';
import audioManager from '../../managers/audio-manager.js';
import engagementManager from '../../engagement/engagement-manager.js';
import * as NavigationState from '../../navigation/NavigationState.js';
import { logger } from '../../utilities/logger.js';
import { iconManager } from '../../utilities/icons.js';


/** @type {HTMLElement|null} */
let playerContainer = null;

/** @type {boolean} */
let isInitialized = false;

/** @type {boolean} Track if audio has ended (for reset button state) */
let hasEnded = false;

/** @type {Object} DOM element references */
const elements = {
    playPauseBtn: null,
    restartBtn: null,
    muteBtn: null,
    progressBar: null,
    progressFill: null,
    progressHandle: null,
    timeDisplay: null
};

/**
 * Initializes the audio player UI.
 * Finds the container element and sets up event listeners.
 */
export function setup() {
    if (isInitialized) {
        logger.warn('[AudioPlayer] Already initialized');
        return;
    }

    playerContainer = document.getElementById('audio-player');
    if (!playerContainer) {
        logger.debug('[AudioPlayer] No #audio-player element found - audio UI disabled');
        return;
    }

    // Render the player HTML
    _renderPlayer();

    // Cache element references
    _cacheElements();

    // Set up event listeners
    _setupEventListeners();

    // Subscribe to audio manager events
    _subscribeToAudioEvents();

    // Initial state: hidden (no audio loaded)
    hide();

    isInitialized = true;
    logger.debug('[AudioPlayer] Initialized');
}

/**
 * Renders the audio player HTML structure.
 * @private
 */
function _renderPlayer() {
    playerContainer.innerHTML = `
        <div class="audio-player-controls" role="group" aria-label="Audio narration controls">
            <!-- Play/Pause/Reset Button -->
            <button 
                type="button"
                class="audio-btn audio-btn-play" 
                aria-label="Play audio"
                data-action="audio-play-pause"
                data-testid="audio-play-pause"
            >
                <span class="audio-icon audio-icon-play" aria-hidden="true">${iconManager.getIcon('play')}</span>
                <span class="audio-icon audio-icon-pause" aria-hidden="true" style="display:none;">${iconManager.getIcon('pause')}</span>
                <span class="audio-icon audio-icon-reset" aria-hidden="true" style="display:none;">${iconManager.getIcon('rotate-ccw')}</span>
            </button>
            
            <!-- Restart Button -->
            <button 
                type="button"
                class="audio-btn audio-btn-restart" 
                aria-label="Restart audio from beginning"
                data-action="audio-restart"
                data-testid="audio-restart"
            >
                <span aria-hidden="true">${iconManager.getIcon('rotate-ccw')}</span>
            </button>
            
            <!-- Progress Bar -->
            <div 
                class="audio-progress-container"
                role="slider"
                aria-label="Audio progress"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="0"
                tabindex="0"
                data-action="audio-seek"
                data-testid="audio-progress"
            >
                <div class="audio-progress-track">
                    <div class="audio-progress-fill"></div>
                    <div class="audio-progress-handle"></div>
                </div>
            </div>
            
            <!-- Time Display -->
            <span class="audio-time" aria-live="off" data-testid="audio-time">
                <span class="audio-time-current">0:00</span>
                <span class="audio-time-separator">/</span>
                <span class="audio-time-duration">0:00</span>
            </span>
            
            <!-- Mute Button -->
            <button 
                type="button"
                class="audio-btn audio-btn-mute" 
                aria-label="Mute audio"
                data-action="audio-mute"
                data-testid="audio-mute"
            >
                <span class="audio-icon audio-icon-unmuted" aria-hidden="true">${iconManager.getIcon('volume-2')}</span>
                <span class="audio-icon audio-icon-muted" aria-hidden="true" style="display:none;">${iconManager.getIcon('volume-x')}</span>
            </button>
        </div>
    `;
}

/**
 * Renders a compact audio player HTML structure (for use in modals).
 * Only includes play/pause, restart, and mute buttons - no progress bar or time display.
 * @returns {string} HTML string for compact audio player
 */
export function renderCompactPlayer() {
    return `
        <div class="audio-player-controls audio-player-compact audio-player-modal" role="group" aria-label="Audio narration controls">
            <!-- Play/Pause Button -->
            <button 
                type="button"
                class="audio-btn audio-btn-play" 
                aria-label="Play audio"
                data-action="audio-play-pause"
                data-testid="audio-play-pause-compact"
            >
                <span class="audio-icon audio-icon-play" aria-hidden="true">${iconManager.getIcon('play')}</span>
                <span class="audio-icon audio-icon-pause" aria-hidden="true" style="display:none;">${iconManager.getIcon('pause')}</span>
            </button>
            
            <!-- Restart Button -->
            <button 
                type="button"
                class="audio-btn audio-btn-restart" 
                aria-label="Restart audio from beginning"
                data-action="audio-restart"
                data-testid="audio-restart-compact"
            >
                <span aria-hidden="true">${iconManager.getIcon('rotate-ccw')}</span>
            </button>
            
            <!-- Mute Button -->
            <button 
                type="button"
                class="audio-btn audio-btn-mute" 
                aria-label="Mute audio"
                data-action="audio-mute"
                data-testid="audio-mute-compact"
            >
                <span class="audio-icon audio-icon-unmuted" aria-hidden="true">${iconManager.getIcon('volume-2')}</span>
                <span class="audio-icon audio-icon-muted" aria-hidden="true" style="display:none;">${iconManager.getIcon('volume-x')}</span>
            </button>
        </div>
    `;
}

/**
 * Caches DOM element references for performance.
 * @private
 */
function _cacheElements() {
    elements.playPauseBtn = playerContainer.querySelector('[data-action="audio-play-pause"]');
    elements.restartBtn = playerContainer.querySelector('[data-action="audio-restart"]');
    elements.muteBtn = playerContainer.querySelector('[data-action="audio-mute"]');
    elements.progressBar = playerContainer.querySelector('.audio-progress-container');
    elements.progressFill = playerContainer.querySelector('.audio-progress-fill');
    elements.progressHandle = playerContainer.querySelector('.audio-progress-handle');
    elements.timeDisplay = playerContainer.querySelector('.audio-time');
    elements.timeCurrent = playerContainer.querySelector('.audio-time-current');
    elements.timeDuration = playerContainer.querySelector('.audio-time-duration');
}

/**
 * Sets up event listeners for player controls.
 * @private
 */
function _setupEventListeners() {
    // Delegated click handler
    playerContainer.addEventListener('click', _handleClick);

    // Progress bar keyboard navigation
    elements.progressBar?.addEventListener('keydown', _handleProgressKeydown);

    // Progress bar mouse interaction
    elements.progressBar?.addEventListener('mousedown', _handleProgressMousedown);
}

/**
 * Handles click events on player controls.
 * @private
 * @param {Event} event
 */
function _handleClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;

    switch (action) {
        case 'audio-play-pause':
            // If audio has ended, restart and play from beginning
            if (hasEnded) {
                audioManager.restart();
                hasEnded = false;
                audioManager.play().catch(err => {
                    logger.warn('[AudioPlayer] Play after restart failed:', err.message);
                });
            } else {
                audioManager.togglePlayPause().catch(err => {
                    logger.warn('[AudioPlayer] Play failed:', err.message);
                });
            }
            break;

        case 'audio-restart':
            audioManager.restart();
            break;

        case 'audio-mute':
            audioManager.toggleMute();
            break;

        case 'audio-seek':
            // Handled by mousedown for more precise seeking
            break;
    }
}

/**
 * Handles keyboard navigation on progress bar.
 * @private
 * @param {KeyboardEvent} event
 */
function _handleProgressKeydown(event) {
    const state = audioManager.getState();
    if (!state.duration) return;

    let seekDelta = 0;

    switch (event.key) {
        case 'ArrowLeft':
            seekDelta = -5; // 5 seconds back
            break;
        case 'ArrowRight':
            seekDelta = 5; // 5 seconds forward
            break;
        case 'Home':
            audioManager.seek(0);
            event.preventDefault();
            return;
        case 'End':
            audioManager.seek(state.duration);
            event.preventDefault();
            return;
        default:
            return;
    }

    event.preventDefault();
    const newPosition = Math.max(0, Math.min(state.position + seekDelta, state.duration));
    audioManager.seek(newPosition);
}

/**
 * Handles mouse interaction on progress bar for seeking.
 * @private
 * @param {MouseEvent} event
 */
function _handleProgressMousedown(event) {
    if (!audioManager.hasAudio()) return;

    const progressBar = elements.progressBar;
    const rect = progressBar.getBoundingClientRect();

    const seek = (clientX) => {
        const percentage = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        audioManager.seekToPercentage(percentage);
    };

    // Initial seek on click
    seek(event.clientX);

    // Set up drag behavior
    const onMouseMove = (e) => seek(e.clientX);
    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        progressBar.classList.remove('dragging');
    };

    progressBar.classList.add('dragging');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

/**
 * Subscribes to audio manager events for UI updates.
 * @private
 */
function _subscribeToAudioEvents() {
    // Show player immediately in loading state when SLIDE audio begins loading
    // Only show for slide audio, not modal audio (modals have their own footer)
    eventBus.on('audio:loadStart', ({ contextType }) => {
        if (contextType === 'slide') {
            show(true); // true = loading state
            setControlsEnabled(false);
            hasEnded = false; // Reset ended state for new audio
            _setPlayingState(false); // Reset to paused state - new audio isn't playing yet
            _updateProgress(0, 0);   // Reset progress bar
        }
    });

    // Transition from loading to loaded state (slide audio only)
    eventBus.on('audio:loaded', ({ duration, contextType }) => {
        if (contextType === 'slide') {
            show(false); // false = fully loaded
            setControlsEnabled(true);
            _updateDuration(duration);
            // Sync mute button state with audioManager (mute state persists across slides)
            _setMutedState(audioManager.getState().isMuted);
        }
    });

    // Hide player when SLIDE audio unloads
    eventBus.on('audio:unloaded', ({ contextType }) => {
        // Only hide if it was slide audio (check if player is visible first)
        // Modal audio unload will just trigger hide anyway since player should already be hidden
        if (contextType !== 'modal' || !isVisible()) {
            hide();
        }
    });

    // Update play/pause button state (slide audio only)
    eventBus.on('audio:play', ({ contextId: _contextId }) => {
        // Only update if current player is visible (means it's showing slide audio)
        if (isVisible()) {
            hasEnded = false; // Clear ended state when playing
            _setPlayingState(true);
        }
    });

    eventBus.on('audio:pause', ({ contextId: _contextId }) => {
        if (isVisible()) {
            _setPlayingState(false);
        }
    });

    eventBus.on('audio:ended', () => {
        hasEnded = true;
        _setEndedState();
        // Keep progress at 100% - provides completion feedback in course context
    });

    // Update progress bar
    eventBus.on('audio:progress', ({ position, duration, percentage: _percentage }) => {
        _updateProgress(position, duration);
    });

    // Update mute button state
    eventBus.on('audio:stateChange', ({ state, reason }) => {
        if (reason === 'volumechange') {
            _setMutedState(state.isMuted);
        }
    });
}

/**
 * Shows the audio player with optional loading state.
 * @param {boolean} [loading=false] - If true, shows a loading skeleton
 */
export function show(loading = false) {
    if (!playerContainer) return;

    playerContainer.hidden = false;
    playerContainer.setAttribute('aria-hidden', 'false');

    if (loading) {
        playerContainer.classList.add('audio-player-loading');
    } else {
        playerContainer.classList.remove('audio-player-loading');
    }
}

/**
 * Hides the audio player.
 */
export function hide() {
    if (playerContainer) {
        playerContainer.hidden = true;
        playerContainer.setAttribute('aria-hidden', 'true');
        playerContainer.classList.remove('audio-player-loading');
    }
}

/**
 * Enables/disables all audio player controls.
 * @param {boolean} enabled
 */
export function setControlsEnabled(enabled) {
    if (!playerContainer) return;

    const buttons = playerContainer.querySelectorAll('button');
    const progressBar = playerContainer.querySelector('.audio-progress-container');

    buttons.forEach(btn => {
        btn.disabled = !enabled;
    });

    if (progressBar) {
        if (enabled) {
            progressBar.removeAttribute('aria-disabled');
        } else {
            progressBar.setAttribute('aria-disabled', 'true');
        }
    }
}

/**
 * Updates the play/pause button state.
 * @private
 * @param {boolean} isPlaying
 */
function _setPlayingState(isPlaying) {
    const btn = elements.playPauseBtn;
    if (!btn) return;

    const playIcon = btn.querySelector('.audio-icon-play');
    const pauseIcon = btn.querySelector('.audio-icon-pause');
    const resetIcon = btn.querySelector('.audio-icon-reset');

    if (isPlaying) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = '';
        resetIcon.style.display = 'none';
        btn.setAttribute('aria-label', 'Pause audio');
        btn.classList.add('playing');
        btn.classList.remove('ended');
    } else {
        playIcon.style.display = '';
        pauseIcon.style.display = 'none';
        resetIcon.style.display = 'none';
        btn.setAttribute('aria-label', 'Play audio');
        btn.classList.remove('playing');
        btn.classList.remove('ended');
    }
}

/**
 * Sets the button to ended/reset state.
 * @private
 */
function _setEndedState() {
    const btn = elements.playPauseBtn;
    if (!btn) return;

    const playIcon = btn.querySelector('.audio-icon-play');
    const pauseIcon = btn.querySelector('.audio-icon-pause');
    const resetIcon = btn.querySelector('.audio-icon-reset');

    playIcon.style.display = 'none';
    pauseIcon.style.display = 'none';
    resetIcon.style.display = '';
    btn.setAttribute('aria-label', 'Restart audio');
    btn.classList.remove('playing');
    btn.classList.add('ended');
}

/**
 * Updates the mute button state.
 * @private
 * @param {boolean} isMuted
 */
function _setMutedState(isMuted) {
    const btn = elements.muteBtn;
    if (!btn) return;

    const unmutedIcon = btn.querySelector('.audio-icon-unmuted');
    const mutedIcon = btn.querySelector('.audio-icon-muted');

    if (isMuted) {
        unmutedIcon.style.display = 'none';
        mutedIcon.style.display = '';
        btn.setAttribute('aria-label', 'Unmute audio');
        btn.classList.add('muted');
    } else {
        unmutedIcon.style.display = '';
        mutedIcon.style.display = 'none';
        btn.setAttribute('aria-label', 'Mute audio');
        btn.classList.remove('muted');
    }
}

/**
 * Updates the progress bar and time display.
 * @private
 * @param {number} position - Current position in seconds
 * @param {number} duration - Total duration in seconds
 */
function _updateProgress(position, duration) {
    const percentage = duration > 0 ? (position / duration) * 100 : 0;

    // Update progress bar
    if (elements.progressFill) {
        elements.progressFill.style.width = `${percentage}%`;
    }
    if (elements.progressHandle) {
        elements.progressHandle.style.left = `${percentage}%`;
    }
    if (elements.progressBar) {
        elements.progressBar.setAttribute('aria-valuenow', Math.round(percentage));
    }

    // Update time display
    if (elements.timeCurrent) {
        elements.timeCurrent.textContent = _formatTime(position);
    }
}

/**
 * Updates the duration display.
 * @private
 * @param {number} duration - Duration in seconds
 */
function _updateDuration(duration) {
    if (elements.timeDuration) {
        elements.timeDuration.textContent = _formatTime(duration);
    }
}

/**
 * Formats seconds as MM:SS or H:MM:SS.
 * @private
 * @param {number} seconds
 * @returns {string}
 */
function _formatTime(seconds) {
    if (!seconds || !isFinite(seconds)) return '0:00';

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Checks if the player is currently visible.
 * @returns {boolean}
 */
export function isVisible() {
    return playerContainer && !playerContainer.hidden;
}

/**
 * Gets the player container element.
 * @returns {HTMLElement|null}
 */
export function getContainer() {
    return playerContainer;
}

/**
 * Initializes event delegation for audio controls in a specific container.
 * This is called by the modal to set up listeners on dynamically injected audio controls.
 * @param {HTMLElement} container - The container element with audio controls
 */
export function initAudioControlsInContainer(container) {
    if (!container) return;

    // Set up event delegation for audio controls within this container
    container.addEventListener('click', (event) => {
        const target = event.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;

        switch (action) {
            case 'audio-play-pause':
                audioManager.togglePlayPause().catch(err => {
                    logger.warn('[AudioPlayer] Play failed:', err.message);
                });
                break;

            case 'audio-restart':
                audioManager.restart();
                break;

            case 'audio-mute':
                audioManager.toggleMute();
                break;
        }
    });

    // Update UI state for this container's audio controls
    _updateContainerAudioState(container);

    // Subscribe to state changes to keep this container's controls in sync
    const updateHandler = () => {
        _updateContainerAudioState(container);
    };

    eventBus.on('audio:play', updateHandler);
    eventBus.on('audio:pause', updateHandler);
    eventBus.on('audio:stateChange', updateHandler);

    // Store cleanup function on container for removal later
    container._audioStateUpdateCleanup = () => {
        eventBus.off('audio:play', updateHandler);
        eventBus.off('audio:pause', updateHandler);
        eventBus.off('audio:stateChange', updateHandler);
    };
}

/**
 * Updates audio control UI state for a specific container.
 * @private
 * @param {HTMLElement} container - The container with audio controls
 */
function _updateContainerAudioState(container) {
    const state = audioManager.getState();

    // Update play/pause button
    const playPauseBtn = container.querySelector('[data-action="audio-play-pause"]');
    if (playPauseBtn) {
        const playIcon = playPauseBtn.querySelector('.audio-icon-play');
        const pauseIcon = playPauseBtn.querySelector('.audio-icon-pause');

        if (state.isPlaying) {
            playIcon?.style && (playIcon.style.display = 'none');
            pauseIcon?.style && (pauseIcon.style.display = '');
            playPauseBtn.setAttribute('aria-label', 'Pause audio');
            playPauseBtn.classList.add('playing');
        } else {
            playIcon?.style && (playIcon.style.display = '');
            pauseIcon?.style && (pauseIcon.style.display = 'none');
            playPauseBtn.setAttribute('aria-label', 'Play audio');
            playPauseBtn.classList.remove('playing');
        }
    }

    // Update mute button
    const muteBtn = container.querySelector('[data-action="audio-mute"]');
    if (muteBtn) {
        const unmutedIcon = muteBtn.querySelector('.audio-icon-unmuted');
        const mutedIcon = muteBtn.querySelector('.audio-icon-muted');

        if (state.isMuted) {
            unmutedIcon?.style && (unmutedIcon.style.display = 'none');
            mutedIcon?.style && (mutedIcon.style.display = '');
            muteBtn.setAttribute('aria-label', 'Unmute audio');
            muteBtn.classList.add('muted');
        } else {
            unmutedIcon?.style && (unmutedIcon.style.display = '');
            mutedIcon?.style && (mutedIcon.style.display = 'none');
            muteBtn.setAttribute('aria-label', 'Mute audio');
            muteBtn.classList.remove('muted');
        }
    }
}

// =============================================================================
// STANDALONE AUDIO PLAYER (data-component="audio-player")
// =============================================================================

/** @type {Map<string, StandaloneAudioPlayer>} Active standalone player instances */
const standaloneInstances = new Map();

/**
 * Renders full audio player HTML with progress bar and time display.
 * @param {string} audioId - The audio ID for test attributes
 * @returns {string}
 */
function renderFullPlayer(audioId) {
    return `
        <div class="audio-player-controls audio-player-standalone" role="group" aria-label="Audio narration controls">
            <button type="button" class="audio-btn audio-btn-play" aria-label="Play audio"
                data-action="audio-play-pause" data-testid="audio-play-pause-${audioId}">
                <span class="audio-icon audio-icon-play" aria-hidden="true">${iconManager.getIcon('play')}</span>
                <span class="audio-icon audio-icon-pause" aria-hidden="true" style="display:none;">${iconManager.getIcon('pause')}</span>
            </button>
            <button type="button" class="audio-btn audio-btn-restart" aria-label="Restart audio"
                data-action="audio-restart" data-testid="audio-restart-${audioId}">
                <span aria-hidden="true">${iconManager.getIcon('rotate-ccw')}</span>
            </button>
            <div class="audio-progress-container" role="slider" aria-label="Audio progress"
                aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"
                data-action="audio-seek" data-testid="audio-progress-${audioId}">
                <div class="audio-progress-track">
                    <div class="audio-progress-fill"></div>
                    <div class="audio-progress-handle"></div>
                </div>
            </div>
            <span class="audio-time" aria-live="off" data-testid="audio-time-${audioId}">
                <span class="audio-time-current">0:00</span>
                <span class="audio-time-separator">/</span>
                <span class="audio-time-duration">0:00</span>
            </span>
            <button type="button" class="audio-btn audio-btn-mute" aria-label="Mute audio"
                data-action="audio-mute" data-testid="audio-mute-${audioId}">
                <span class="audio-icon audio-icon-unmuted" aria-hidden="true">${iconManager.getIcon('volume-2')}</span>
                <span class="audio-icon audio-icon-muted" aria-hidden="true" style="display:none;">${iconManager.getIcon('volume-x')}</span>
            </button>
        </div>
    `;
}

/**
 * Renders compact audio player HTML (play/pause, restart, mute only).
 * @param {string} audioId - The audio ID for test attributes
 * @returns {string}
 */
function renderStandaloneCompactPlayer(audioId) {
    return `
        <div class="audio-player-controls audio-player-compact audio-player-standalone" role="group" aria-label="Audio narration controls">
            <button type="button" class="audio-btn audio-btn-play" aria-label="Play audio"
                data-action="audio-play-pause" data-testid="audio-play-pause-${audioId}">
                <span class="audio-icon audio-icon-play" aria-hidden="true">${iconManager.getIcon('play')}</span>
                <span class="audio-icon audio-icon-pause" aria-hidden="true" style="display:none;">${iconManager.getIcon('pause')}</span>
            </button>
            <button type="button" class="audio-btn audio-btn-restart" aria-label="Restart audio"
                data-action="audio-restart" data-testid="audio-restart-${audioId}">
                <span aria-hidden="true">${iconManager.getIcon('rotate-ccw')}</span>
            </button>
            <button type="button" class="audio-btn audio-btn-mute" aria-label="Mute audio"
                data-action="audio-mute" data-testid="audio-mute-${audioId}">
                <span class="audio-icon audio-icon-unmuted" aria-hidden="true">${iconManager.getIcon('volume-2')}</span>
                <span class="audio-icon audio-icon-muted" aria-hidden="true" style="display:none;">${iconManager.getIcon('volume-x')}</span>
            </button>
        </div>
    `;
}

/**
 * Class representing a standalone audio player instance.
 */
class StandaloneAudioPlayer {
    constructor(container) {
        this.container = container;
        this.audioId = container.dataset.audioId;
        this.audioSrc = container.dataset.audioSrc;
        this.required = container.dataset.audioRequired === 'true';
        this.compact = container.dataset.audioCompact === 'true';
        this.threshold = parseFloat(container.dataset.audioThreshold) || 0.95;

        if (!this.audioId) {
            throw new Error('[AudioPlayer] Standalone player requires data-audio-id');
        }
        if (!this.audioSrc) {
            throw new Error(`[AudioPlayer] Standalone player "${this.audioId}" requires data-audio-src`);
        }

        this.contextId = `standalone-${this.audioId}`;
        this.isActive = false;
        this.eventHandlers = {};
        this.elements = {};

        this._render();
        this._cacheElements();
        this._setupEventListeners();
        this._subscribeToAudioEvents();

        // Sync mute button with current global mute state
        this._setMutedState(audioManager.getState().isMuted);

        standaloneInstances.set(this.audioId, this);
        logger.debug(`[AudioPlayer] Standalone initialized: ${this.audioId}`);
    }

    _render() {
        this.container.innerHTML = this.compact
            ? renderStandaloneCompactPlayer(this.audioId)
            : renderFullPlayer(this.audioId);
    }

    _cacheElements() {
        this.elements.playPauseBtn = this.container.querySelector('[data-action="audio-play-pause"]');
        this.elements.restartBtn = this.container.querySelector('[data-action="audio-restart"]');
        this.elements.muteBtn = this.container.querySelector('[data-action="audio-mute"]');
        this.elements.progressBar = this.container.querySelector('.audio-progress-container');
        this.elements.progressFill = this.container.querySelector('.audio-progress-fill');
        this.elements.progressHandle = this.container.querySelector('.audio-progress-handle');
        this.elements.timeCurrent = this.container.querySelector('.audio-time-current');
        this.elements.timeDuration = this.container.querySelector('.audio-time-duration');
    }

    _setupEventListeners() {
        this.container.addEventListener('click', this._handleClick.bind(this));

        if (this.elements.progressBar) {
            this.elements.progressBar.addEventListener('keydown', this._handleProgressKeydown.bind(this));
            this.elements.progressBar.addEventListener('mousedown', this._handleProgressMousedown.bind(this));
        }
    }

    _handleClick(event) {
        const target = event.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;

        // If not active and trying to play, load first
        if (!this.isActive && action === 'audio-play-pause') {
            this._loadAndPlay();
            return;
        }

        switch (action) {
            case 'audio-play-pause':
                audioManager.togglePlayPause().catch(err => {
                    logger.warn(`[AudioPlayer] Play failed for ${this.audioId}:`, err.message);
                });
                break;
            case 'audio-restart':
                if (this.isActive) {
                    audioManager.restart();
                } else {
                    this._loadAndPlay();
                }
                break;
            case 'audio-mute':
                audioManager.toggleMute();
                break;
        }
    }

    async _loadAndPlay() {
        try {
            await audioManager.load({
                src: this.audioSrc,
                autoplay: true,
                required: this.required,
                completionThreshold: this.threshold
            }, this.contextId, 'standalone');
        } catch (error) {
            logger.error(`[AudioPlayer] Failed to load ${this.audioId}:`, error.message);
        }
    }

    _handleProgressKeydown(event) {
        if (!this.isActive) return;
        const state = audioManager.getState();
        if (!state.duration) return;

        let seekDelta = 0;
        switch (event.key) {
            case 'ArrowLeft': seekDelta = -5; break;
            case 'ArrowRight': seekDelta = 5; break;
            case 'Home': audioManager.seek(0); event.preventDefault(); return;
            case 'End': audioManager.seek(state.duration); event.preventDefault(); return;
            default: return;
        }
        event.preventDefault();
        audioManager.seek(Math.max(0, Math.min(state.position + seekDelta, state.duration)));
    }

    _handleProgressMousedown(event) {
        if (!this.isActive || !audioManager.hasAudio()) return;

        const progressBar = this.elements.progressBar;
        const rect = progressBar.getBoundingClientRect();

        const seek = (clientX) => {
            const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
            audioManager.seekToPercentage(pct);
        };

        seek(event.clientX);

        const onMouseMove = (e) => seek(e.clientX);
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            progressBar.classList.remove('dragging');
        };

        progressBar.classList.add('dragging');
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    _subscribeToAudioEvents() {
        this.eventHandlers.loadStart = ({ contextId }) => {
            if (contextId === this.contextId) {
                this.isActive = true;
                this.container.classList.add('audio-player-loading');
                this._setControlsEnabled(false);
            } else {
                this.isActive = false;
                this._resetUI();
            }
        };

        this.eventHandlers.loaded = ({ contextId, duration }) => {
            if (contextId === this.contextId) {
                this.container.classList.remove('audio-player-loading');
                this._setControlsEnabled(true);
                this._updateDuration(duration);
                // Sync mute button state with audioManager (mute state persists across slides)
                this._setMutedState(audioManager.getState().isMuted);
            }
        };

        this.eventHandlers.unloaded = () => {
            this.isActive = false;
            this._resetUI();
        };

        this.eventHandlers.play = ({ contextId }) => {
            if (contextId === this.contextId) {
                this._setPlayingState(true);
            } else {
                this._setPlayingState(false);
            }
        };

        this.eventHandlers.pause = ({ contextId }) => {
            if (contextId === this.contextId) {
                this._setPlayingState(false);
            }
        };

        this.eventHandlers.ended = ({ contextId }) => {
            if (contextId === this.contextId) {
                this._setPlayingState(false);
                // Keep progress at 100% - provides completion feedback in course context
            }
        };

        this.eventHandlers.progress = ({ position, duration }) => {
            // Only update if this player's audio is active
            if (this.isActive && audioManager.getState().contextId === this.contextId) {
                this._updateProgress(position, duration);
            }
        };

        this.eventHandlers.stateChange = ({ state, reason }) => {
            if (reason === 'volumechange') {
                this._setMutedState(state.isMuted);
            }
        };

        this.eventHandlers.completed = ({ contextId }) => {
            if (contextId === this.contextId && this.required) {
                const currentSlideId = NavigationState.getCurrentSlideId();
                if (currentSlideId) {
                    engagementManager.trackStandaloneAudioComplete(currentSlideId, this.audioId);
                }
            }
        };

        eventBus.on('audio:loadStart', this.eventHandlers.loadStart);
        eventBus.on('audio:loaded', this.eventHandlers.loaded);
        eventBus.on('audio:unloaded', this.eventHandlers.unloaded);
        eventBus.on('audio:play', this.eventHandlers.play);
        eventBus.on('audio:pause', this.eventHandlers.pause);
        eventBus.on('audio:ended', this.eventHandlers.ended);
        eventBus.on('audio:progress', this.eventHandlers.progress);
        eventBus.on('audio:stateChange', this.eventHandlers.stateChange);
        eventBus.on('audio:completed', this.eventHandlers.completed);
    }

    _resetUI() {
        this.container.classList.remove('audio-player-loading');
        this._setPlayingState(false);
        this._updateProgress(0, 0);
        if (this.elements.timeDuration) {
            this.elements.timeDuration.textContent = '0:00';
        }
    }

    _setControlsEnabled(enabled) {
        this.container.querySelectorAll('button').forEach(btn => btn.disabled = !enabled);
        if (this.elements.progressBar) {
            this.elements.progressBar.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        }
    }

    _setPlayingState(isPlaying) {
        const btn = this.elements.playPauseBtn;
        if (!btn) return;
        const playIcon = btn.querySelector('.audio-icon-play');
        const pauseIcon = btn.querySelector('.audio-icon-pause');

        if (isPlaying) {
            if (playIcon) playIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = '';
            btn.setAttribute('aria-label', 'Pause audio');
            btn.classList.add('playing');
        } else {
            if (playIcon) playIcon.style.display = '';
            if (pauseIcon) pauseIcon.style.display = 'none';
            btn.setAttribute('aria-label', 'Play audio');
            btn.classList.remove('playing');
        }
    }

    _setMutedState(isMuted) {
        const btn = this.elements.muteBtn;
        if (!btn) return;
        const unmutedIcon = btn.querySelector('.audio-icon-unmuted');
        const mutedIcon = btn.querySelector('.audio-icon-muted');

        if (isMuted) {
            if (unmutedIcon) unmutedIcon.style.display = 'none';
            if (mutedIcon) mutedIcon.style.display = '';
            btn.setAttribute('aria-label', 'Unmute audio');
            btn.classList.add('muted');
        } else {
            if (unmutedIcon) unmutedIcon.style.display = '';
            if (mutedIcon) mutedIcon.style.display = 'none';
            btn.setAttribute('aria-label', 'Mute audio');
            btn.classList.remove('muted');
        }
    }

    _updateProgress(position, duration) {
        const pct = duration > 0 ? (position / duration) * 100 : 0;
        if (this.elements.progressFill) this.elements.progressFill.style.width = `${pct}%`;
        if (this.elements.progressHandle) this.elements.progressHandle.style.left = `${pct}%`;
        if (this.elements.progressBar) this.elements.progressBar.setAttribute('aria-valuenow', Math.round(pct));
        if (this.elements.timeCurrent) this.elements.timeCurrent.textContent = _formatTime(position);
    }

    _updateDuration(duration) {
        if (this.elements.timeDuration) {
            this.elements.timeDuration.textContent = _formatTime(duration);
        }
    }

    destroy() {
        eventBus.off('audio:loadStart', this.eventHandlers.loadStart);
        eventBus.off('audio:loaded', this.eventHandlers.loaded);
        eventBus.off('audio:unloaded', this.eventHandlers.unloaded);
        eventBus.off('audio:play', this.eventHandlers.play);
        eventBus.off('audio:pause', this.eventHandlers.pause);
        eventBus.off('audio:ended', this.eventHandlers.ended);
        eventBus.off('audio:progress', this.eventHandlers.progress);
        eventBus.off('audio:stateChange', this.eventHandlers.stateChange);
        eventBus.off('audio:completed', this.eventHandlers.completed);

        standaloneInstances.delete(this.audioId);

        if (this.isActive && audioManager.hasAudio()) {
            audioManager.unload();
        }

        logger.debug(`[AudioPlayer] Standalone destroyed: ${this.audioId}`);
    }
}

/**
 * Initializes a single standalone audio player element.
 * Called by the UI initializer for each data-component="audio-player" element.
 * @param {HTMLElement} element - The audio player container element
 * @returns {StandaloneAudioPlayer|null} The initialized player or null on error
 */
export function init(element) {
    try {
        return new StandaloneAudioPlayer(element);
    } catch (error) {
        logger.error('[AudioPlayer] Standalone init failed:', error.message);
        return null;
    }
}

/**
 * Initializes all standalone audio players in a container.
 * Called by the declarative component system.
 * @param {HTMLElement} root - The root element to scan
 * @returns {StandaloneAudioPlayer[]} Array of initialized players
 */
export function initStandaloneAudioPlayers(root) {
    const containers = root.querySelectorAll('[data-component="audio-player"]');
    const players = [];

    containers.forEach(container => {
        const player = init(container);
        if (player) {
            players.push(player);
        }
    });

    return players;
}

/**
 * Destroys all active standalone audio player instances.
 * Called when navigating away from a slide.
 */
export function destroyAllStandaloneAudioPlayers() {
    standaloneInstances.forEach(player => player.destroy());
    standaloneInstances.clear();
}

/**
 * Gets an active standalone player by audio ID.
 * @param {string} audioId
 * @returns {StandaloneAudioPlayer|undefined}
 */
export function getStandalonePlayer(audioId) {
    return standaloneInstances.get(audioId);
}

/**
 * Gets all active standalone audio IDs on the current slide.
 * @returns {string[]}
 */
export function getActiveStandaloneAudioIds() {
    return Array.from(standaloneInstances.keys());
}
