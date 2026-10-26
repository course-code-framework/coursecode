/**
 * Regression tests for authoring-api hardening:
 * - lint child process gets paths via env, not interpolated JS source
 * - preview status only reports a CourseCode preview as running
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import {
    buildLintChildEnv,
    buildLintChildScript,
    getPreviewStatus,
    lintCourse
} from '../../lib/authoring-api.js';

describe('lint child process', () => {
    let originalCwd;
    let tempDir;

    beforeEach(() => {
        originalCwd = process.cwd();
        // Quotes and ${...} in the project path used to break (or inject
        // into) the interpolated child script. (A backslash can't be tested:
        // Node refuses to import file URLs containing an encoded backslash.)
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-lint-'));
        tempDir = path.join(base, 'it\'s "q" ${globalThis.x} dir');
        fs.mkdirSync(path.join(tempDir, 'course'), { recursive: true });
        fs.writeFileSync(
            path.join(tempDir, 'course', 'course-config.js'),
            "export const courseConfig = { metadata: { title: 'T' }, structure: [] };\n"
        );
        process.chdir(tempDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        fs.rmSync(path.dirname(tempDir), { recursive: true, force: true });
    });

    it('script source is constant and contains no paths', () => {
        const script = buildLintChildScript();
        expect(script).not.toContain(tempDir);
        expect(script).toContain('process.env');
        const env = buildLintChildEnv({ configUrl: 'file:///a', linterUrl: 'file:///b', coursePath: tempDir });
        expect(Object.values(env)).toContain(tempDir);
    });

    it('lints a project whose path contains quotes and template syntax', async () => {
        const result = await lintCourse();
        expect(result.error).toBeUndefined();
        expect(Array.isArray(result.errors)).toBe(true);
    }, 20000);
});

describe('getPreviewStatus', () => {
    let server;
    let port;

    async function listen(handler) {
        server = http.createServer(handler);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        port = server.address().port;
    }

    afterEach(async () => {
        if (server) await new Promise(resolve => server.close(resolve));
        server = null;
    });

    it('does not report an unrelated server as a running preview', async () => {
        await listen((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<h1>other app</h1>'); });
        const status = await getPreviewStatus(port);
        expect(status.running).toBe(false);
        expect(status.message).toMatch(/not a CourseCode preview/);
    });

    it('recognizes the preview marker header', async () => {
        await listen((req, res) => { res.setHeader('X-CourseCode-Preview', '1'); res.writeHead(200); res.end(); });
        expect((await getPreviewStatus(port)).running).toBe(true);
    });

    it('recognizes older preview servers via /__mcp/errors', async () => {
        await listen((req, res) => {
            if (req.url === '/__mcp/errors') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ errors: [], warnings: [], lastBuildTime: null, lastBuildSuccess: true }));
                return;
            }
            res.writeHead(200);
            res.end();
        });
        expect((await getPreviewStatus(port)).running).toBe(true);
    });
});
