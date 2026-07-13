import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../framework/js/core/event-bus.js', () => ({
    eventBus: {
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn()
    }
}));

vi.mock('../../../framework/js/managers/video-manager.js', () => ({
    default: {
        attachVideo: vi.fn(),
        detachVideo: vi.fn(),
        getState: vi.fn(() => ({}))
    }
}));

vi.mock('../../../framework/js/engagement/engagement-manager.js', () => ({
    default: { trackStandaloneVideoComplete: vi.fn() }
}));

vi.mock('../../../framework/js/navigation/NavigationState.js', () => ({
    getCurrentSlideId: vi.fn(() => null)
}));

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock('../../../framework/js/utilities/icons.js', () => ({
    iconManager: { getIcon: vi.fn(() => '') }
}));

import { getVideoPlayer, init } from '../../../framework/js/components/ui-components/video-player.js';

describe('media player DOM lifecycle', () => {
    const originalDocument = globalThis.document;

    beforeEach(() => {
        globalThis.document = {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            fullscreenElement: null,
            webkitFullscreenElement: null
        };
    });

    afterEach(() => {
        globalThis.document = originalDocument;
    });

    it('removes external video document listeners with their original callback', () => {
        const iframe = {};
        const wrapper = { classList: { toggle: vi.fn() } };
        const container = {
            dataset: {
                videoId: 'external-video',
                videoSrc: 'https://youtu.be/dQw4w9WgXcQ'
            },
            innerHTML: '',
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            querySelector: vi.fn((selector) => {
                if (selector === 'iframe') return iframe;
                if (selector === '.video-player-wrapper') return wrapper;
                return null;
            })
        };

        const player = init(container);
        const fullscreenHandler = globalThis.document.addEventListener.mock.calls
            .find(([eventName]) => eventName === 'fullscreenchange')[1];

        player.destroy();

        expect(globalThis.document.removeEventListener)
            .toHaveBeenCalledWith('fullscreenchange', fullscreenHandler);
        expect(globalThis.document.removeEventListener)
            .toHaveBeenCalledWith('webkitfullscreenchange', fullscreenHandler);
        expect(getVideoPlayer('external-video')).toBeUndefined();
    });
});
