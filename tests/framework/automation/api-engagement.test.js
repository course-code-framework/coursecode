import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    engagementManager: {
        trackScrollDepth: vi.fn(),
        trackSlideAudioComplete: vi.fn(),
        trackModalAudioComplete: vi.fn(),
        trackStandaloneAudioComplete: vi.fn()
    },
    audioManager: {
        isReady: vi.fn(() => true),
        hasAudio: vi.fn(() => true),
        getState: vi.fn(),
        seek: vi.fn()
    },
    navigationState: {
        getCurrentSlideId: vi.fn(() => 'slide-1')
    }
}));

vi.mock('../../../framework/js/engagement/engagement-manager.js', () => ({
    default: mocks.engagementManager
}));
vi.mock('../../../framework/js/managers/flag-manager.js', () => ({
    default: {}
}));
vi.mock('../../../framework/js/managers/audio-manager.js', () => ({
    default: mocks.audioManager
}));
vi.mock('../../../framework/js/navigation/NavigationState.js', () => mocks.navigationState);

import { createEngagementMethods } from '../../../framework/js/automation/api-engagement.js';

describe('automation engagement methods', () => {
    let api;

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.audioManager.isReady.mockReturnValue(true);
        mocks.audioManager.hasAudio.mockReturnValue(true);
        mocks.navigationState.getCurrentSlideId.mockReturnValue('slide-1');
        api = createEngagementMethods(vi.fn());
    });

    it.each([NaN, Infinity, -Infinity])('rejects non-finite scroll depth %s', (value) => {
        expect(() => api.setScrollDepth(value)).toThrow('number between 0 and 100');
        expect(mocks.engagementManager.trackScrollDepth).not.toHaveBeenCalled();
    });

    it('tracks a simulated standalone completion by authored audio ID', () => {
        mocks.audioManager.getState.mockReturnValue({
            contextId: 'standalone-intro-narration',
            contextType: 'standalone',
            duration: 100,
            completionThreshold: 0.9
        });

        api.simulateAudioComplete();

        expect(mocks.audioManager.seek).toHaveBeenCalledWith(90);
        expect(mocks.engagementManager.trackStandaloneAudioComplete)
            .toHaveBeenCalledWith('slide-1', 'intro-narration');
    });
});
