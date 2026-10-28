/**
 * Regression tests: ?skipGating=true / window.__SCORM_PREVIEW_SKIP_GATING must
 * only bypass gating in preview/dev contexts, never in a production build
 * launched from an LMS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../course/course-config.js', () => ({
    courseConfig: { environment: {} }
}));

import { isPreviewContext, shouldBypassGating } from '../../../framework/js/navigation/navigation-helpers.js';

describe('shouldBypassGating', () => {
    const originalWindow = globalThis.window;

    // Minimal window stand-in (node environment): top-level unless a parent is given
    function setWindow({ search = '', parent } = {}) {
        const win = { location: { search } };
        Object.defineProperty(win, 'parent', {
            configurable: true,
            get: () => (parent === undefined ? win : (typeof parent === 'function' ? parent() : parent))
        });
        globalThis.window = win;
        return win;
    }

    beforeEach(() => {
        setWindow();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        globalThis.window = originalWindow;
    });

    it('ignores ?skipGating=true in a production LMS build', () => {
        vi.stubEnv('MODE', 'production');
        setWindow({ search: '?skipGating=true' });
        expect(isPreviewContext()).toBe(false);
        expect(shouldBypassGating()).toBe(false);
    });

    it('ignores the stub player global flag in a production LMS build', () => {
        vi.stubEnv('MODE', 'production');
        setWindow().__SCORM_PREVIEW_SKIP_GATING = true;
        expect(shouldBypassGating()).toBe(false);
    });

    it('treats a cross-origin (LMS) parent as not a preview', () => {
        vi.stubEnv('MODE', 'production');
        setWindow({
            search: '?skipGating=true',
            parent: { get STUB_CONFIG() { throw new Error('SecurityError: Blocked a frame with origin'); } }
        });
        expect(shouldBypassGating()).toBe(false);
    });

    it('honours ?skipGating=true in a production build hosted by the stub player (static preview export)', () => {
        vi.stubEnv('MODE', 'production');
        setWindow({ search: '?skipGating=true', parent: { STUB_CONFIG: {} } });
        expect(isPreviewContext()).toBe(true);
        expect(shouldBypassGating()).toBe(true);
    });

    it('honours preview switches in development builds', () => {
        vi.stubEnv('MODE', 'development');
        setWindow().__SCORM_PREVIEW_SKIP_GATING = true;
        expect(shouldBypassGating()).toBe(true);
    });

    it('__FORCE_GATING still overrides everything', () => {
        vi.stubEnv('MODE', 'development');
        const win = setWindow({ search: '?skipGating=true' });
        win.__SCORM_PREVIEW_SKIP_GATING = true;
        win.__FORCE_GATING = true;
        expect(shouldBypassGating()).toBe(false);
    });
});
