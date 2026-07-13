import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeAudio {
    constructor() {
        this._listeners = new Map();
        this.paused = true;
        this.currentTime = 0;
        this.duration = 0;
        this.readyState = 0;
        this.muted = false;
        this.volume = 1;
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

    load() {}
    pause() { this.paused = true; }
    play() { this.paused = false; return Promise.resolve(); }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
}

describe('AudioManager load cancellation', () => {
    let audioManager;

    beforeEach(async () => {
        vi.resetModules();
        vi.doMock('../../../framework/js/state/index.js', () => ({
            default: {
                getDomainState: vi.fn(() => undefined),
                setDomainState: vi.fn()
            }
        }));
        vi.doMock('../../../framework/js/utilities/logger.js', () => ({
            logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
        }));
        globalThis.Audio = FakeAudio;

        ({ default: audioManager } = await import('../../../framework/js/managers/audio-manager.js'));
        audioManager.initialize();
    });

    it('rejects the previous load when a new source replaces it', async () => {
        const first = audioManager.load({ src: 'first.mp3' }, 'slide-1');
        const firstResult = expect(first).rejects.toMatchObject({ name: 'AbortError' });

        const second = audioManager.load({ src: 'second.mp3' }, 'slide-2');

        await firstResult;
        expect(audioManager.getState().contextId).toBe('slide-2');

        const secondResult = expect(second).rejects.toMatchObject({ name: 'AbortError' });
        audioManager.unload();
        await secondResult;
    });

    it('rejects a pending load when audio is unloaded', async () => {
        const pending = audioManager.load({ src: 'narration.mp3' }, 'slide-1');
        const result = expect(pending).rejects.toMatchObject({ name: 'AbortError' });

        audioManager.unload();

        await result;
        expect(audioManager.getState().currentSrc).toBeNull();
        expect(audioManager._pendingLoadCleanup).toBeNull();
        expect(audioManager._pendingLoadCancel).toBeNull();
    });

    it('rejects a non-finite seek position', () => {
        expect(() => audioManager.seek(NaN)).toThrow('position must be a finite number');
    });

    it('persists a zero position so an older resume point is cleared', () => {
        audioManager.state.contextId = 'slide-1';
        audioManager.state.position = 0;
        audioManager.positionCache.set('slide-1', 42);

        audioManager._savePosition();

        expect(audioManager.positionCache.get('slide-1')).toBe(0);
    });
});
