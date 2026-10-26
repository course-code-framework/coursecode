import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    store: {},
    stateManager: {
        getDomainState: vi.fn(key => mocks.store[key]),
        setDomainState: vi.fn((key, value) => { mocks.store[key] = value; })
    },
    eventBus: {
        emit: vi.fn()
    }
}));

vi.mock('../../../framework/js/state/index.js', () => ({
    default: mocks.stateManager
}));
vi.mock('../../../framework/js/core/event-bus.js', () => ({
    eventBus: mocks.eventBus
}));
vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

class FakeVideo {
    constructor() {
        this.listeners = new Map();
        this.paused = true;
        this.currentTime = 0;
        this.duration = 100;
        this.muted = false;
        this.volume = 1;
        this.error = null;
    }

    addEventListener(event, handler) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event).add(handler);
    }

    removeEventListener(event, handler) {
        this.listeners.get(event)?.delete(handler);
    }

    emit(event) {
        this.listeners.get(event)?.forEach(handler => handler());
    }

    play() {
        this.paused = false;
        this.emit('play');
        return Promise.resolve();
    }

    pause() {
        if (this.paused) return;
        this.paused = true;
        this.emit('pause');
    }
}

/** Simulate continuous playback in 1s steps up to `to` seconds (wall clock advances with it). */
function watchUntil(video, to) {
    while (video.currentTime < to) {
        vi.setSystemTime(Date.now() + 1000);
        video.currentTime = Math.min(to, video.currentTime + 1);
        video.emit('timeupdate');
    }
}

describe('VideoManager multi-player lifecycle', () => {
    let videoManager;

    beforeEach(async () => {
        vi.clearAllMocks();
        mocks.store = {};
        vi.resetModules();
        vi.stubGlobal('HTMLVideoElement', FakeVideo);
        ({ default: videoManager } = await import('../../../framework/js/managers/video-manager.js'));
        videoManager.initialize();
        vi.useFakeTimers({ toFake: ['Date'] });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not steal the active context when another player is rendered', () => {
        const first = new FakeVideo();
        const second = new FakeVideo();

        videoManager.attachVideo(first, 'video-first', { src: 'first.mp4' });
        videoManager.attachVideo(second, 'video-second', { src: 'second.mp4' });

        expect(videoManager.getState().contextId).toBe('video-first');
    });

    it('switches context on playback and saves the previous position', async () => {
        const first = new FakeVideo();
        const second = new FakeVideo();
        videoManager.attachVideo(first, 'video-first', { src: 'first.mp4' });
        videoManager.attachVideo(second, 'video-second', { src: 'second.mp4' });

        await first.play();
        first.currentTime = 20;
        first.emit('timeupdate');
        await second.play();

        expect(first.paused).toBe(true);
        expect(videoManager.positionCache.get('video-first')).toBe(20);
        expect(videoManager.getState().contextId).toBe('video-second');
    });

    it('attributes completion to the video that actually played', async () => {
        const first = new FakeVideo();
        const second = new FakeVideo();
        videoManager.attachVideo(first, 'video-first', {
            src: 'first.mp4', required: true, completionThreshold: 0.9
        });
        videoManager.attachVideo(second, 'video-second', {
            src: 'second.mp4', required: true, completionThreshold: 0.9
        });

        await first.play();
        watchUntil(first, 95);

        expect(videoManager.isVideoCompleted('video-first')).toBe(true);
        expect(videoManager.isVideoCompleted('video-second')).toBe(false);
        expect(mocks.eventBus.emit).toHaveBeenCalledWith(
            'video:complete',
            expect.objectContaining({ contextId: 'video-first' })
        );
    });

    it('clears manager state when the active video is detached', () => {
        const video = new FakeVideo();
        videoManager.attachVideo(video, 'video-first', { src: 'first.mp4' });

        videoManager.detachVideo(video);

        expect(videoManager.getState().contextId).toBeNull();
        expect(videoManager.getState().currentSrc).toBeNull();
        expect(videoManager.activeVideo).toBeNull();
    });

    it('keeps the active context when an inactive video is detached', () => {
        const first = new FakeVideo();
        const second = new FakeVideo();
        videoManager.attachVideo(first, 'video-first', { src: 'first.mp4' });
        videoManager.attachVideo(second, 'video-second', { src: 'second.mp4' });

        videoManager.detachVideo(second);

        expect(videoManager.getState().contextId).toBe('video-first');
        expect(videoManager.activeVideo).toBe(first);
    });

    it('does not complete required video when the learner scrubs ahead', async () => {
        const video = new FakeVideo();
        videoManager.attachVideo(video, 'video-first', { src: 'first.mp4', required: true, completionThreshold: 0.9 });

        await video.play();
        watchUntil(video, 5);
        video.currentTime = 95;
        video.emit('timeupdate');
        video.emit('seeked');
        watchUntil(video, 99);

        expect(videoManager.isVideoCompleted('video-first')).toBe(false);
        expect(videoManager.maxPositionReached).toBe(5);
    });

    it('does not complete when a scrub to the end fires ended', async () => {
        const video = new FakeVideo();
        videoManager.attachVideo(video, 'video-first', { src: 'first.mp4', required: true, completionThreshold: 0.9 });

        await video.play();
        video.currentTime = 99.5;
        video.emit('seeked');
        video.currentTime = 100;
        video.emit('ended');

        expect(videoManager.isVideoCompleted('video-first')).toBe(false);
    });

    it('completes when watched continuously to the end and persists the watched position', async () => {
        const video = new FakeVideo();
        videoManager.attachVideo(video, 'video-first', { src: 'first.mp4', required: true, completionThreshold: 1 });

        await video.play();
        watchUntil(video, 99.6);
        video.currentTime = 100;
        video.emit('ended');

        expect(videoManager.isVideoCompleted('video-first')).toBe(true);
        expect(mocks.store.video.watched['video-first']).toBe(100);
    });

    it('restores the watched position, not the scrubbed-to position, on resume', async () => {
        mocks.store.video = { positions: { 'video-first': 80 }, watched: { 'video-first': 10 } };
        vi.resetModules();
        ({ default: videoManager } = await import('../../../framework/js/managers/video-manager.js'));
        videoManager.initialize();

        const video = new FakeVideo();
        videoManager.attachVideo(video, 'video-first', { src: 'first.mp4', required: true });
        video.emit('loadedmetadata');

        expect(video.currentTime).toBe(80);
        expect(videoManager.maxPositionReached).toBe(10);
    });
});
