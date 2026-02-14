/**
 * @file api-engagement.js
 * Engagement tracking, flag management, and audio control methods
 * for the CourseCodeAutomation API.
 */

import engagementManager from '../engagement/engagement-manager.js';
import flagManager from '../managers/flag-manager.js';
import audioManager from '../managers/audio-manager.js';
import * as NavigationState from '../navigation/NavigationState.js';

/**
 * Creates engagement/flag/audio API methods bound to the shared logTrace function.
 * @param {Function} logTrace - Shared trace logger
 * @returns {Object} Engagement, flag, and audio API methods
 */
export function createEngagementMethods(logTrace) {
    return {
        // ===== Engagement Methods =====

        getEngagementState() {
            const slideId = NavigationState.getCurrentSlideId();
            if (!slideId) {
                throw new Error('CourseCodeAutomation: No active slide');
            }
            const state = engagementManager.getSlideState(slideId);
            logTrace('getEngagementState', { slideId, state });
            return state;
        },

        getEngagementProgress() {
            const slideId = NavigationState.getCurrentSlideId();
            if (!slideId) {
                throw new Error('CourseCodeAutomation: No active slide');
            }
            const progress = engagementManager.getProgress(slideId);
            logTrace('getEngagementProgress', { slideId, progress });
            return progress;
        },

        markTabViewed(tabId) {
            const slideId = NavigationState.getCurrentSlideId();
            if (!slideId) {
                throw new Error('CourseCodeAutomation: No active slide');
            }
            engagementManager.trackTabView(slideId, tabId);
            logTrace('markTabViewed', { slideId, tabId });
        },

        markFlipCardViewed(cardId) {
            const slideId = NavigationState.getCurrentSlideId();
            if (!slideId) {
                throw new Error('CourseCodeAutomation: No active slide');
            }
            engagementManager.trackFlipCardView(slideId, cardId);
            logTrace('markFlipCardViewed', { slideId, cardId });
        },

        setScrollDepth(percentage) {
            const slideId = NavigationState.getCurrentSlideId();
            if (!slideId) {
                throw new Error('CourseCodeAutomation: No active slide');
            }
            if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
                throw new Error('CourseCodeAutomation: Scroll depth must be a number between 0 and 100');
            }
            engagementManager.trackScrollDepth(slideId, percentage);
            logTrace('setScrollDepth', { slideId, percentage });
        },

        resetEngagement() {
            const slideId = NavigationState.getCurrentSlideId();
            if (!slideId) {
                throw new Error('CourseCodeAutomation: No active slide');
            }
            engagementManager.resetSlide(slideId);
            logTrace('resetEngagement', { slideId });
        },

        // ===== Flag Management =====

        getFlag(key) {
            if (typeof key !== 'string' || key.trim() === '') {
                throw new Error('CourseCodeAutomation: getFlag requires a non-empty string key');
            }
            const value = flagManager.getFlag(key);
            logTrace('getFlag', { key, value });
            return value;
        },

        setFlag(key, value) {
            if (typeof key !== 'string' || key.trim() === '') {
                throw new Error('CourseCodeAutomation: setFlag requires a non-empty string key');
            }
            flagManager.setFlag(key, value);
            logTrace('setFlag', { key, value });
        },

        getAllFlags() {
            const flags = flagManager.getAllFlags();
            logTrace('getAllFlags', { count: Object.keys(flags).length });
            return flags;
        },

        removeFlag(key) {
            if (typeof key !== 'string' || key.trim() === '') {
                throw new Error('CourseCodeAutomation: removeFlag requires a non-empty string key');
            }
            flagManager.removeFlag(key);
            logTrace('removeFlag', { key });
        },

        // ===== Audio Methods =====

        getAudioState() {
            if (!audioManager.isReady()) {
                return { initialized: false };
            }
            const state = audioManager.getState();
            logTrace('getAudioState', { hasAudio: !!state.currentSrc, contextType: state.contextType });
            return state;
        },

        hasAudio() {
            const has = audioManager.isReady() && audioManager.hasAudio();
            logTrace('hasAudio', { result: has });
            return has;
        },

        simulateAudioComplete() {
            if (!audioManager.isReady()) {
                throw new Error('CourseCodeAutomation: AudioManager not initialized');
            }
            if (!audioManager.hasAudio()) {
                throw new Error('CourseCodeAutomation: No audio loaded');
            }

            const state = audioManager.getState();
            if (!state.contextId) {
                throw new Error('CourseCodeAutomation: No audio context');
            }

            const currentSlideId = NavigationState.getCurrentSlideId();

            if (state.duration > 0) {
                const targetPosition = state.duration * (state.completionThreshold || 0.95);
                audioManager.seek(targetPosition);
            }

            switch (state.contextType) {
                case 'slide':
                    if (currentSlideId) {
                        engagementManager.trackSlideAudioComplete(currentSlideId);
                    }
                    break;
                case 'modal': {
                    const modalId = state.contextId.replace('modal-', '');
                    if (currentSlideId && modalId) {
                        engagementManager.trackModalAudioComplete(currentSlideId, modalId);
                    }
                    break;
                }
                case 'tab':
                case 'standalone':
                    if (currentSlideId) {
                        engagementManager.trackStandaloneAudioComplete(currentSlideId, state.contextId);
                    }
                    break;
            }

            logTrace('simulateAudioComplete', {
                contextId: state.contextId,
                contextType: state.contextType,
                slideId: currentSlideId
            });
        },

        isAudioCompletedForContext(contextId) {
            if (!audioManager.isReady()) {
                return false;
            }
            const completed = audioManager.isAudioCompleted(contextId);
            logTrace('isAudioCompletedForContext', { contextId, completed });
            return completed;
        },

        getAudioProgress() {
            if (!audioManager.isReady()) {
                return 0;
            }
            const progress = audioManager.getProgressPercentage();
            logTrace('getAudioProgress', { progress });
            return progress;
        }
    };
}
