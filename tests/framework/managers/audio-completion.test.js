/**
 * Regression tests: required audio completes only through continuous
 * playback. Scrubbing/seeking ahead must not count as listened time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeAudio {
    constructor() {
        this._listeners = new Map();
        this.paused = true;
        this.seeking = false;
        this.currentTime = 0;
        this.duration = 0;
        this.readyState = 0;
        this.muted = false;
        this.volume = 1;
        this.playbackRate = 1;
        this.error = null;
        this.src = '';
    }

    addEventListener(event, callback) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(callback);
    }

    removeEventListener(event, callback) {
        this._listeners.get(event)?.delete(callback);
    }

    emit(event) {
        for (const callback of [...(this._listeners.get(event) || [])]) callback({ type: event });
    }

    load() {}
    pause() { this.paused = true; }
    play() { this.paused = false; return Promise.resolve(); }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
}

describe('AudioManager completion tracking', () => {
    let audioManager;
    let audio;
    let domains;

    beforeEach(async () => {
        vi.resetModules();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        domains = {};
        vi.doMock('../../../framework/js/state/index.js', () => ({
            default: {
                getDomainState: vi.fn(key => domains[key]),
                setDomainState: vi.fn((key, value) => { domains[key] = value; })
            }
        }));
        vi.doMock('../../../framework/js/utilities/logger.js', () => ({
            logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
        }));
        globalThis.Audio = FakeAudio;

        ({ default: audioManager } = await import('../../../framework/js/managers/audio-manager.js'));
        audioManager.initialize();
        audio = audioManager.audio;

        const loaded = audioManager.load({ src: 'narration.mp3', required: true }, 'slide-1');
        audio.duration = 100;
        audio.emit('loadedmetadata');
        audio.emit('canplaythrough');
        await loaded;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function startPlaying() {
        audio.paused = false;
        audio.emit('play');
    }

    /** Plays continuously from the current position to `until`, in 250ms ticks */
    function playUntil(until) {
        while (audio.currentTime < until) {
            vi.advanceTimersByTime(250);
            audio.currentTime = Math.min(until, audio.currentTime + 0.25);
            audio.emit('timeupdate');
        }
    }

    function scrubTo(position) {
        audio.seeking = true;
        audio.currentTime = position;
        audio.emit('timeupdate');
        audio.seeking = false;
        audio.emit('seeked');
    }

    it('completes after continuous playback to the threshold', () => {
        startPlaying();
        playUntil(96);
        expect(audioManager.state.isCompleted).toBe(true);
    });

    it('does not complete when the learner scrubs to the end', () => {
        startPlaying();
        playUntil(5);
        scrubTo(97);
        playUntil(100);
        audio.paused = true;
        audio.emit('ended');

        expect(audioManager.maxPositionReached).toBeLessThan(10);
        expect(audioManager.state.isCompleted).toBe(false);
    });

    it('ignores position jumps even without seek events', () => {
        startPlaying();
        playUntil(2);
        vi.advanceTimersByTime(250);
        audio.currentTime = 98; // jump far faster than real time
        audio.emit('timeupdate');
        playUntil(100);
        expect(audioManager.state.isCompleted).toBe(false);
    });

    it('still completes after seeking back and listening through', () => {
        startPlaying();
        playUntil(10);
        scrubTo(90);
        playUntil(92);
        expect(audioManager.state.isCompleted).toBe(false);

        audioManager.seek(10);
        playUntil(100);
        expect(audioManager.state.isCompleted).toBe(true);
    });

    it('a paused scrub does not count as listening', () => {
        startPlaying();
        playUntil(3);
        audio.paused = true;
        audio.emit('pause');
        vi.advanceTimersByTime(120_000);
        audio.currentTime = 99;
        audio.emit('timeupdate');
        expect(audioManager.maxPositionReached).toBeLessThan(5);
    });
});
