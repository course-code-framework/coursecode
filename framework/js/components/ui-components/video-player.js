/**
 * @file video-player.js
 * @description Video player UI component for course content.
 * 
 * Standalone Usage:
 *   <div data-component="video-player"
 *        data-video-id="intro-video"
 *        data-video-src="video/intro.mp4"
 *        data-video-poster="images/intro-poster.jpg">
 *   </div>
 * 
 * Engagement config for gating:
 *   - Standalone video: { type: 'videoComplete', videoId: 'intro-video', message: '...' }
 * 
 * Controls:
 * - Play/Pause toggle
 * - Progress bar (clickable for seeking)
 * - Current time / Duration display
 * - Mute toggle
 * - Fullscreen toggle
 * 
 * @author Framework
 * @version 1.0.0
 */

export const schema = {
    type: 'video-player',
    description: 'Video player with custom controls and engagement tracking',
    example: `<div data-component="video-player" data-video-id="demo-video" data-video-src="https://www.youtube.com/watch?v=dQw4w9WgXcQ">
  <p style="color: #64748b; font-size: 0.875rem; font-style: italic;">🎬 Video player renders dynamically — supports native video, YouTube, and Vimeo.</p>
</div>`,
    properties: {
        videoId: { type: 'string', required: true, dataAttribute: 'data-video-id' },
        videoSrc: { type: 'string', required: true, dataAttribute: 'data-video-src' },
        poster: { type: 'string', dataAttribute: 'data-video-poster' },
        autoplay: { type: 'boolean', default: false, dataAttribute: 'data-video-autoplay' }
    },
    structure: {
        container: '[data-component="video-player"]',
        children: {}  // Content is dynamically rendered
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/video-player.css',
    engagementTracking: 'videoComplete',
    emitsEvents: ['video:complete']
};

import { eventBus } from '../../core/event-bus.js';
import videoManager from '../../managers/video-manager.js';
import engagementManager from '../../engagement/engagement-manager.js';
import * as NavigationState from '../../navigation/NavigationState.js';
import { logger } from '../../utilities/logger.js';
import { iconManager } from '../../utilities/icons.js';

/** @type {Map<string, VideoPlayer>} Active player instances */
const playerInstances = new Map();

/**
 * Formats seconds as MM:SS or H:MM:SS.
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
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
 * Detects if a URL is a YouTube video and extracts the video ID.
 * Supports: youtube.com/watch?v=, youtu.be/, youtube.com/embed/
 * @param {string} url
 * @returns {{ type: 'youtube', id: string } | null}
 */
function detectYouTube(url) {
    if (!url) return null;

    // youtube.com/watch?v=VIDEO_ID
    let match = url.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/watch\?.+&v=)([a-zA-Z0-9_-]{11})/);
    if (match) return { type: 'youtube', id: match[1] };

    // youtu.be/VIDEO_ID
    match = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (match) return { type: 'youtube', id: match[1] };

    // youtube.com/embed/VIDEO_ID
    match = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (match) return { type: 'youtube', id: match[1] };

    return null;
}

/**
 * Detects if a URL is a Vimeo video and extracts the video ID.
 * Supports: vimeo.com/VIDEO_ID, player.vimeo.com/video/VIDEO_ID
 * @param {string} url
 * @returns {{ type: 'vimeo', id: string } | null}
 */
function detectVimeo(url) {
    if (!url) return null;

    // vimeo.com/VIDEO_ID or player.vimeo.com/video/VIDEO_ID
    const match = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
    if (match) return { type: 'vimeo', id: match[1] };

    return null;
}

/**
 * Detects if URL is an external video platform and returns platform info.
 * @param {string} url
 * @returns {{ type: 'youtube' | 'vimeo', id: string } | null}
 */
function detectExternalVideo(url) {
    return detectYouTube(url) || detectVimeo(url);
}

/**
 * Resolves video path relative to course/assets/.
 * @param {string} src - Source path
 * @returns {string} Resolved path
 */
function resolvePath(src) {
    if (src.startsWith('http') || src.startsWith('/') || src.startsWith('./')) {
        return src;
    }
    return `./course/assets/${src}`;
}

/**
 * Class representing a video player instance.
 */
class VideoPlayer {
    constructor(container) {
        this.container = container;
        this.videoId = container.dataset.videoId;
        this.videoSrc = container.dataset.videoSrc;
        this.posterSrc = container.dataset.videoPoster;
        this.captionsSrc = container.dataset.videoCaptions;
        this.required = container.dataset.videoRequired === 'true';
        this.threshold = parseFloat(container.dataset.videoThreshold) || 0.95;
        this.autoplay = container.dataset.videoAutoplay === 'true';

        if (!this.videoId) {
            throw new Error('[VideoPlayer] requires data-video-id');
        }
        if (!this.videoSrc) {
            throw new Error(`[VideoPlayer] "${this.videoId}" requires data-video-src`);
        }

        // Detect external video platforms (YouTube, Vimeo)
        this.externalVideo = detectExternalVideo(this.videoSrc);
        this.isExternal = !!this.externalVideo;

        this.contextId = `video-${this.videoId}`;
        this.video = null;      // Native video element (null for external)
        this.iframe = null;     // External video iframe
        this.elements = {};
        this.eventHandlers = {};
        this.isFullscreen = false;

        this._render();
        this._cacheElements();
        this._setupEventListeners();

        // Only subscribe and attach for native videos
        if (!this.isExternal) {
            this._subscribeToVideoEvents();
            this._attachToManager();
        } else {
            // For external videos, mark as loaded immediately
            logger.debug(`[VideoPlayer] External video (${this.externalVideo.type}): ${this.videoId}`);
        }

        playerInstances.set(this.videoId, this);
        logger.debug(`[VideoPlayer] Initialized: ${this.videoId}`);
    }

    _render() {
        // External video: render responsive iframe with platform controls
        if (this.isExternal) {
            this._renderExternalVideo();
            return;
        }

        // Native video: render HTML5 video with custom controls
        this._renderNativeVideo();
    }

    _renderExternalVideo() {
        const { type, id } = this.externalVideo;
        let embedUrl = '';

        if (type === 'youtube') {
            // YouTube embed with enablejsapi for future API control
            embedUrl = `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&enablejsapi=1`;
            if (this.autoplay) embedUrl += '&autoplay=1';
        } else if (type === 'vimeo') {
            // Vimeo embed
            embedUrl = `https://player.vimeo.com/video/${id}?dnt=1`;
            if (this.autoplay) embedUrl += '&autoplay=1';
        }

        this.container.innerHTML = `
            <div class="video-player-wrapper video-player-external video-player-${type}">
                <div class="video-player-media video-player-responsive">
                    <iframe
                        class="video-player-iframe"
                        src="${embedUrl}"
                        frameborder="0"
                        allow="autoplay; fullscreen"
                        data-testid="video-${this.videoId}"
                    ></iframe>
                </div>
            </div>
        `;
    }

    _renderNativeVideo() {
        const resolvedSrc = resolvePath(this.videoSrc);
        const resolvedPoster = this.posterSrc ? resolvePath(this.posterSrc) : '';
        const resolvedCaptions = this.captionsSrc ? resolvePath(this.captionsSrc) : '';

        this.container.innerHTML = `
            <div class="video-player-wrapper">
                <div class="video-player-media">
                    <video
                        class="video-player-element"
                        preload="metadata"
                        playsinline
                        ${resolvedPoster ? `poster="${resolvedPoster}"` : ''}
                        data-testid="video-${this.videoId}"
                    >
                        <source src="${resolvedSrc}" type="video/mp4">
                        ${resolvedCaptions ? `<track kind="captions" src="${resolvedCaptions}" srclang="en" label="English">` : ''}
                        Your browser does not support the video element.
                    </video>
                    <div class="video-player-overlay" data-action="video-play-pause">
                        <button type="button" class="video-overlay-play-btn" aria-label="Play video">
                            ${iconManager.getIcon('play', { size: 'xl' })}
                        </button>
                    </div>
                </div>
                <div class="video-player-controls" role="group" aria-label="Video controls">
                    <button type="button" class="video-btn video-btn-play" aria-label="Play video"
                        data-action="video-play-pause" data-testid="video-play-${this.videoId}">
                        <span class="video-icon video-icon-play" aria-hidden="true">${iconManager.getIcon('play')}</span>
                        <span class="video-icon video-icon-pause" aria-hidden="true" style="display:none;">${iconManager.getIcon('pause')}</span>
                    </button>
                    <div class="video-progress-container" role="slider" aria-label="Video progress"
                        aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"
                        data-action="video-seek" data-testid="video-progress-${this.videoId}">
                        <div class="video-progress-track">
                            <div class="video-progress-fill"></div>
                            <div class="video-progress-handle"></div>
                        </div>
                    </div>
                    <span class="video-time" aria-live="off" data-testid="video-time-${this.videoId}">
                        <span class="video-time-current">0:00</span>
                        <span class="video-time-separator">/</span>
                        <span class="video-time-duration">0:00</span>
                    </span>
                    <button type="button" class="video-btn video-btn-mute" aria-label="Mute video"
                        data-action="video-mute" data-testid="video-mute-${this.videoId}">
                        <span class="video-icon video-icon-unmuted" aria-hidden="true">${iconManager.getIcon('volume-2')}</span>
                        <span class="video-icon video-icon-muted" aria-hidden="true" style="display:none;">${iconManager.getIcon('volume-x')}</span>
                    </button>
                    <button type="button" class="video-btn video-btn-fullscreen" aria-label="Enter fullscreen"
                        data-action="video-fullscreen" data-testid="video-fullscreen-${this.videoId}">
                        <span class="video-icon video-icon-expand" aria-hidden="true">${iconManager.getIcon('maximize')}</span>
                        <span class="video-icon video-icon-compress" aria-hidden="true" style="display:none;">${iconManager.getIcon('minimize')}</span>
                    </button>
                </div>
            </div>
        `;
    }

    _cacheElements() {
        // For external videos, cache iframe instead of video
        if (this.isExternal) {
            this.iframe = this.container.querySelector('iframe');
            this.elements.wrapper = this.container.querySelector('.video-player-wrapper');
            return;
        }

        this.video = this.container.querySelector('video');
        this.elements.wrapper = this.container.querySelector('.video-player-wrapper');
        this.elements.overlay = this.container.querySelector('.video-player-overlay');
        this.elements.overlayPlayBtn = this.container.querySelector('.video-overlay-play-btn');
        this.elements.playPauseBtn = this.container.querySelector('[data-action="video-play-pause"].video-btn');
        this.elements.muteBtn = this.container.querySelector('[data-action="video-mute"]');
        this.elements.fullscreenBtn = this.container.querySelector('[data-action="video-fullscreen"]');
        this.elements.progressBar = this.container.querySelector('.video-progress-container');
        this.elements.progressFill = this.container.querySelector('.video-progress-fill');
        this.elements.progressHandle = this.container.querySelector('.video-progress-handle');
        this.elements.timeCurrent = this.container.querySelector('.video-time-current');
        this.elements.timeDuration = this.container.querySelector('.video-time-duration');
    }

    _setupEventListeners() {
        // External videos use platform's native controls
        if (this.isExternal) {
            // Only fullscreen detection for wrapper
            document.addEventListener('fullscreenchange', this._handleFullscreenChange.bind(this));
            document.addEventListener('webkitfullscreenchange', this._handleFullscreenChange.bind(this));
            return;
        }

        // Control bar click delegation
        this.container.addEventListener('click', this._handleClick.bind(this));

        // Progress bar interactions
        if (this.elements.progressBar) {
            this.elements.progressBar.addEventListener('keydown', this._handleProgressKeydown.bind(this));
            this.elements.progressBar.addEventListener('mousedown', this._handleProgressMousedown.bind(this));
        }

        // Fullscreen change detection
        document.addEventListener('fullscreenchange', this._handleFullscreenChange.bind(this));
        document.addEventListener('webkitfullscreenchange', this._handleFullscreenChange.bind(this));

        // Double-click video to toggle fullscreen
        if (this.video) {
            this.video.addEventListener('dblclick', () => this._toggleFullscreen());
        }

        // Click overlay to play
        if (this.elements.overlay) {
            this.elements.overlay.addEventListener('click', (e) => {
                e.stopPropagation();
                this._togglePlayPause();
            });
        }
    }

    _handleClick(event) {
        const target = event.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;

        switch (action) {
            case 'video-play-pause':
                this._togglePlayPause();
                break;
            case 'video-mute':
                this._toggleMute();
                break;
            case 'video-fullscreen':
                this._toggleFullscreen();
                break;
        }
    }

    _togglePlayPause() {
        if (!this.video) return;

        if (this.video.paused) {
            this.video.play().catch(err => {
                logger.warn(`[VideoPlayer] Play failed for ${this.videoId}:`, err.message);
            });
        } else {
            this.video.pause();
        }
    }

    _toggleMute() {
        if (!this.video) return;
        this.video.muted = !this.video.muted;
    }

    _toggleFullscreen() {
        const wrapper = this.elements.wrapper;
        if (!wrapper) return;

        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (wrapper.requestFullscreen) {
                wrapper.requestFullscreen();
            } else if (wrapper.webkitRequestFullscreen) {
                wrapper.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }

    _handleFullscreenChange() {
        const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
        this.isFullscreen = isFullscreen;

        if (this.elements.wrapper) {
            this.elements.wrapper.classList.toggle('video-player-fullscreen', isFullscreen);
        }

        // Update fullscreen button icon
        const btn = this.elements.fullscreenBtn;
        if (btn) {
            const expandIcon = btn.querySelector('.video-icon-expand');
            const compressIcon = btn.querySelector('.video-icon-compress');
            if (isFullscreen) {
                if (expandIcon) expandIcon.style.display = 'none';
                if (compressIcon) compressIcon.style.display = '';
                btn.setAttribute('aria-label', 'Exit fullscreen');
            } else {
                if (expandIcon) expandIcon.style.display = '';
                if (compressIcon) compressIcon.style.display = 'none';
                btn.setAttribute('aria-label', 'Enter fullscreen');
            }
        }
    }

    _handleProgressKeydown(event) {
        if (!this.video || !this.video.duration) return;

        let seekDelta = 0;
        switch (event.key) {
            case 'ArrowLeft': seekDelta = -5; break;
            case 'ArrowRight': seekDelta = 5; break;
            case 'Home':
                this.video.currentTime = 0;
                event.preventDefault();
                return;
            case 'End':
                this.video.currentTime = this.video.duration;
                event.preventDefault();
                return;
            default: return;
        }
        event.preventDefault();
        this.video.currentTime = Math.max(0, Math.min(this.video.currentTime + seekDelta, this.video.duration));
    }

    _handleProgressMousedown(event) {
        if (!this.video || !this.video.duration) return;

        const progressBar = this.elements.progressBar;
        const rect = progressBar.getBoundingClientRect();

        const seek = (clientX) => {
            const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
            this.video.currentTime = (pct / 100) * this.video.duration;
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

    _attachToManager() {
        videoManager.attachVideo(this.video, this.contextId, {
            src: this.videoSrc,
            contextType: 'standalone',
            required: this.required,
            completionThreshold: this.threshold
        });

        // Autoplay if configured
        if (this.autoplay) {
            this.video.play().catch(err => {
                logger.warn(`[VideoPlayer] Autoplay blocked for ${this.videoId}:`, err.message);
            });
        }
    }

    _subscribeToVideoEvents() {
        this.eventHandlers.loaded = ({ contextId, duration }) => {
            if (contextId === this.contextId) {
                this._updateDuration(duration);
                // Sync mute state
                this._setMutedState(videoManager.getState().isMuted);
            }
        };

        this.eventHandlers.play = ({ contextId }) => {
            if (contextId === this.contextId) {
                this._setPlayingState(true);
                this._hideOverlay();
            }
        };

        this.eventHandlers.pause = ({ contextId }) => {
            if (contextId === this.contextId) {
                this._setPlayingState(false);
                this._showOverlay();
            }
        };

        this.eventHandlers.ended = ({ contextId }) => {
            if (contextId === this.contextId) {
                this._setPlayingState(false);
                this._showOverlay();
            }
        };

        this.eventHandlers.progress = ({ position, duration }) => {
            if (videoManager.getState().contextId === this.contextId) {
                this._updateProgress(position, duration);
            }
        };

        this.eventHandlers.complete = ({ contextId }) => {
            if (contextId === this.contextId && this.required) {
                const currentSlideId = NavigationState.getCurrentSlideId();
                if (currentSlideId) {
                    engagementManager.trackStandaloneVideoComplete(currentSlideId, this.videoId);
                }
            }
        };

        eventBus.on('video:loaded', this.eventHandlers.loaded);
        eventBus.on('video:play', this.eventHandlers.play);
        eventBus.on('video:pause', this.eventHandlers.pause);
        eventBus.on('video:ended', this.eventHandlers.ended);
        eventBus.on('video:progress', this.eventHandlers.progress);
        eventBus.on('video:complete', this.eventHandlers.complete);
    }

    _showOverlay() {
        if (this.elements.overlay) {
            this.elements.overlay.classList.remove('hidden');
        }
    }

    _hideOverlay() {
        if (this.elements.overlay) {
            this.elements.overlay.classList.add('hidden');
        }
    }

    _setPlayingState(isPlaying) {
        const btn = this.elements.playPauseBtn;
        if (!btn) return;

        const playIcon = btn.querySelector('.video-icon-play');
        const pauseIcon = btn.querySelector('.video-icon-pause');

        if (isPlaying) {
            if (playIcon) playIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = '';
            btn.setAttribute('aria-label', 'Pause video');
            btn.classList.add('playing');
        } else {
            if (playIcon) playIcon.style.display = '';
            if (pauseIcon) pauseIcon.style.display = 'none';
            btn.setAttribute('aria-label', 'Play video');
            btn.classList.remove('playing');
        }
    }

    _setMutedState(isMuted) {
        const btn = this.elements.muteBtn;
        if (!btn) return;

        const unmutedIcon = btn.querySelector('.video-icon-unmuted');
        const mutedIcon = btn.querySelector('.video-icon-muted');

        if (isMuted) {
            if (unmutedIcon) unmutedIcon.style.display = 'none';
            if (mutedIcon) mutedIcon.style.display = '';
            btn.setAttribute('aria-label', 'Unmute video');
            btn.classList.add('muted');
        } else {
            if (unmutedIcon) unmutedIcon.style.display = '';
            if (mutedIcon) mutedIcon.style.display = 'none';
            btn.setAttribute('aria-label', 'Mute video');
            btn.classList.remove('muted');
        }
    }

    _updateProgress(position, duration) {
        const pct = duration > 0 ? (position / duration) * 100 : 0;
        if (this.elements.progressFill) this.elements.progressFill.style.width = `${pct}%`;
        if (this.elements.progressHandle) this.elements.progressHandle.style.left = `${pct}%`;
        if (this.elements.progressBar) this.elements.progressBar.setAttribute('aria-valuenow', Math.round(pct));
        if (this.elements.timeCurrent) this.elements.timeCurrent.textContent = formatTime(position);
    }

    _updateDuration(duration) {
        if (this.elements.timeDuration) {
            this.elements.timeDuration.textContent = formatTime(duration);
        }
    }

    destroy() {
        // Unsubscribe from events
        eventBus.off('video:loaded', this.eventHandlers.loaded);
        eventBus.off('video:play', this.eventHandlers.play);
        eventBus.off('video:pause', this.eventHandlers.pause);
        eventBus.off('video:ended', this.eventHandlers.ended);
        eventBus.off('video:progress', this.eventHandlers.progress);
        eventBus.off('video:complete', this.eventHandlers.complete);

        // Detach from manager
        if (this.video) {
            videoManager.detachVideo(this.video);
        }

        // Remove fullscreen listeners
        document.removeEventListener('fullscreenchange', this._handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', this._handleFullscreenChange);

        playerInstances.delete(this.videoId);
        logger.debug(`[VideoPlayer] Destroyed: ${this.videoId}`);
    }
}

/**
 * Initializes a single video player element.
 * @param {HTMLElement} element - The video player container element
 * @returns {VideoPlayer|null} The initialized player or null on error
 */
export function init(element) {
    try {
        return new VideoPlayer(element);
    } catch (error) {
        logger.error('[VideoPlayer] Init failed:', error.message);
        return null;
    }
}

/**
 * Initializes all video players in a container.
 * @param {HTMLElement} root - The root element to scan
 * @returns {VideoPlayer[]} Array of initialized players
 */
export function initVideoPlayers(root) {
    const containers = root.querySelectorAll('[data-component="video-player"]');
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
 * Destroys all active video player instances.
 */
export function destroyAllVideoPlayers() {
    playerInstances.forEach(player => player.destroy());
    playerInstances.clear();
}

/**
 * Gets an active player by video ID.
 * @param {string} videoId
 * @returns {VideoPlayer|undefined}
 */
export function getVideoPlayer(videoId) {
    return playerInstances.get(videoId);
}

/**
 * Gets all active video IDs on the current slide.
 * @returns {string[]}
 */
export function getActiveVideoIds() {
    return Array.from(playerInstances.keys());
}
