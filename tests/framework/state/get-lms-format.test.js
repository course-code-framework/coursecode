/**
 * Tests for getLMSFormat() runtime format detection.
 *
 * getLMSFormat() is a private function inside lms-connection.js.
 * We test it indirectly via LMSConnection — its constructor sets
 * this.format = getLMSFormat(), so we can assert the priority chain:
 *   1. <meta name="lms-format"> tag (document.querySelector)
 *   2. import.meta.env.LMS_FORMAT (Vite define)
 *   3. 'cmi5' default
 *
 * Since vitest runs in Node (no DOM), we mock globalThis.document
 * to simulate the browser meta-tag path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies so we can construct LMSConnection in isolation
vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

vi.mock('../../../framework/js/core/event-bus.js', () => ({
    eventBus: { emit: vi.fn(), on: vi.fn(() => () => {}), off: vi.fn() }
}));

vi.mock('../../../framework/js/drivers/driver-factory.js', () => ({
    createDriver: vi.fn()
}));

/**
 * Helper: create a minimal mock of `document` with a querySelector
 * that returns a meta element with the given content (or null).
 */
function mockDocument(metaContent) {
    globalThis.document = {
        querySelector(selector) {
            if (selector === 'meta[name="lms-format"]' && metaContent !== undefined) {
                return { content: metaContent };
            }
            return null;
        }
    };
}

function clearDocumentMock() {
    delete globalThis.document;
}

describe('getLMSFormat() — runtime format detection', () => {
    let LMSConnection;

    beforeEach(() => {
        vi.resetModules();
        clearDocumentMock();
        delete import.meta.env.LMS_FORMAT;
    });

    afterEach(() => {
        clearDocumentMock();
        delete import.meta.env.LMS_FORMAT;
    });

    async function importFresh() {
        // Re-mock after resetModules
        vi.mock('../../../framework/js/utilities/logger.js', () => ({
            logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
        }));
        vi.mock('../../../framework/js/core/event-bus.js', () => ({
            eventBus: { emit: vi.fn(), on: vi.fn(() => () => {}), off: vi.fn() }
        }));
        vi.mock('../../../framework/js/drivers/driver-factory.js', () => ({
            createDriver: vi.fn()
        }));

        const mod = await import('../../../framework/js/state/lms-connection.js');
        return mod.LMSConnection;
    }

    it('returns "cmi5" by default when no meta tag and no env', async () => {
        // No document mock, no env → should fall through to default
        LMSConnection = await importFresh();
        const conn = new LMSConnection();
        expect(conn.format).toBe('cmi5');
    });

    it('reads format from import.meta.env.LMS_FORMAT when no meta tag', async () => {
        // No document mock → meta tag path skipped
        import.meta.env.LMS_FORMAT = 'scorm2004';
        LMSConnection = await importFresh();
        const conn = new LMSConnection();
        expect(conn.format).toBe('scorm2004');
    });

    it('reads format from <meta name="lms-format"> tag', async () => {
        mockDocument('scorm1.2');
        LMSConnection = await importFresh();
        const conn = new LMSConnection();
        expect(conn.format).toBe('scorm1.2');
    });

    it('meta tag takes priority over import.meta.env.LMS_FORMAT', async () => {
        import.meta.env.LMS_FORMAT = 'lti';
        mockDocument('scorm2004');

        LMSConnection = await importFresh();
        const conn = new LMSConnection();
        expect(conn.format).toBe('scorm2004');
    });

    it('ignores meta tag with empty content and falls back to env', async () => {
        mockDocument(''); // empty content → falsy
        import.meta.env.LMS_FORMAT = 'scorm1.2';

        LMSConnection = await importFresh();
        const conn = new LMSConnection();
        expect(conn.format).toBe('scorm1.2');
    });

    it('ignores meta tag with empty content and falls back to default', async () => {
        mockDocument(''); // empty content → falsy, no env either
        LMSConnection = await importFresh();
        const conn = new LMSConnection();
        expect(conn.format).toBe('cmi5');
    });
});
