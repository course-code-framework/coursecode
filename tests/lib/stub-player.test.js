/**
 * Tests for stub-player.js — verifies HTML output for live vs viewer mode.
 */
import { describe, it, expect } from 'vitest';
import { generateStubPlayer } from '../../lib/stub-player.js';

const BASE_CONFIG = { title: 'Test Course', launchUrl: '/', storageKey: 'test-key' };

function liveHtml(overrides = {}) {
    return generateStubPlayer({ ...BASE_CONFIG, isLive: true, ...overrides });
}

function viewerHtml(overrides = {}) {
    return generateStubPlayer({ ...BASE_CONFIG, isLive: false, ...overrides });
}

describe('generateStubPlayer — live mode', () => {
    const html = liveHtml({ courseContent: '<p>Content</p>' });

    it('includes the debug panel', () => {
        expect(html).toContain('id="stub-player-debug-panel"');
    });

    it('includes the debug button', () => {
        expect(html).toContain('id="stub-player-debug-btn"');
    });

    it('includes the slide ID badge', () => {
        expect(html).toContain('id="stub-player-slide-id"');
    });

    it('includes the show-slide-ID toggle', () => {
        expect(html).toContain('id="stub-player-show-slide-id"');
    });

    it('includes edit button', () => {
        expect(html).toContain('id="stub-player-edit-mode-btn"');
    });

    it('includes config, interactions, catalog menu items', () => {
        expect(html).toContain('id="stub-player-config-btn"');
        expect(html).toContain('id="stub-player-interactions-btn"');
        expect(html).toContain('id="stub-player-catalog-btn"');
    });

    it('includes outline mode', () => {
        expect(html).toContain('stub-player-outline');
    });

    it('loads app.js (not app-viewer.js)', () => {
        expect(html).toContain('/app.js"');
        expect(html).not.toContain('app-viewer.js');
    });

    it('includes review button when courseContent is provided', () => {
        expect(html).toContain('id="stub-player-content-btn"');
    });

    it('includes skip gating and reset', () => {
        expect(html).toContain('id="stub-player-skip-gating"');
        expect(html).toContain('id="stub-player-reset-btn"');
    });

    it('includes all CSS partials', () => {
        // Debug panel CSS is only in live mode
        expect(html).toContain('#stub-player-debug-panel');
    });
});

describe('generateStubPlayer — viewer mode (export/cloud)', () => {
    const html = viewerHtml({ courseContent: '<p>Content</p>' });

    it('excludes the debug panel', () => {
        expect(html).not.toContain('id="stub-player-debug-panel"');
    });

    it('excludes the debug button', () => {
        expect(html).not.toContain('id="stub-player-debug-btn"');
    });

    it('excludes the slide ID badge', () => {
        expect(html).not.toContain('id="stub-player-slide-id"');
    });

    it('excludes the show-slide-ID toggle', () => {
        expect(html).not.toContain('id="stub-player-show-slide-id"');
    });

    it('excludes edit button', () => {
        expect(html).not.toContain('id="stub-player-edit-mode-btn"');
    });

    it('excludes config, interactions, catalog menu items', () => {
        expect(html).not.toContain('id="stub-player-config-btn"');
        expect(html).not.toContain('id="stub-player-interactions-btn"');
        expect(html).not.toContain('id="stub-player-catalog-btn"');
    });

    it('excludes outline mode', () => {
        expect(html).not.toContain('stub-player-outline');
    });

    it('loads app-viewer.js (not app.js)', () => {
        expect(html).toContain('app-viewer.js');
        expect(html).not.toMatch(/\/app\.js"/);
    });

    it('includes the review button when courseContent is provided', () => {
        expect(html).toContain('id="stub-player-content-btn"');
    });

    it('includes the review panel with no refresh button', () => {
        expect(html).toContain('id="stub-player-content-panel"');
        expect(html).not.toContain('id="stub-player-content-refresh"');
    });

    it('includes skip gating toggle', () => {
        expect(html).toContain('id="stub-player-skip-gating"');
    });

    it('includes reset button', () => {
        expect(html).toContain('id="stub-player-reset-btn"');
    });

    it('includes the more menu', () => {
        expect(html).toContain('id="stub-player-more-btn"');
        expect(html).toContain('id="stub-player-more-menu"');
    });

    it('excludes authoring CSS (debug, config, edit)', () => {
        expect(html).not.toContain('#stub-player-debug-panel');
        expect(html).not.toContain('.config-section');
    });

    it('includes viewer CSS (header, content-viewer)', () => {
        expect(html).toContain('#stub-player-header');
        expect(html).toContain('#stub-player-content-panel');
    });
});

describe('generateStubPlayer — viewer mode without content', () => {
    const html = viewerHtml();

    it('excludes the review button when no courseContent', () => {
        expect(html).not.toContain('id="stub-player-content-btn"');
    });

    it('excludes the review panel when no courseContent', () => {
        expect(html).not.toContain('id="stub-player-content-panel"');
    });

    it('still includes more menu with gating and reset', () => {
        expect(html).toContain('id="stub-player-skip-gating"');
        expect(html).toContain('id="stub-player-reset-btn"');
    });
});
