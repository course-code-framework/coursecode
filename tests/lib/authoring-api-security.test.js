/**
 * Regression tests for authoring-api hardening:
 * - lint child process gets paths via env, not interpolated JS source
 * - preview status only reports a CourseCode preview as running
 * - preview status only reports THIS project's preview as running
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import {
    buildLintChildEnv,
    buildLintChildScript,
    findPreview,
    getPreviewStatus,
    lintCourse
} from '../../lib/authoring-api.js';
import { getCourseId } from '../../lib/project-utils.js';

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

    function previewFor(courseId) {
        return (req, res) => {
            res.setHeader('X-CourseCode-Preview', '1');
            if (courseId) res.setHeader('X-CourseCode-Course', courseId);
            res.writeHead(200);
            res.end();
        };
    }

    it('does not report another project\'s preview as running', async () => {
        await listen(previewFor('aaaaaaaaaaaaaaaa'));
        const status = await getPreviewStatus(port, { expectedCourseId: 'bbbbbbbbbbbbbbbb' });
        expect(status).toMatchObject({ running: false, reason: 'other-project', courseId: 'aaaaaaaaaaaaaaaa' });
        expect(status.message).toMatch(/different CourseCode project/);
    });

    it('reports this project\'s preview as running', async () => {
        await listen(previewFor('aaaaaaaaaaaaaaaa'));
        const status = await getPreviewStatus(port, { expectedCourseId: 'aaaaaaaaaaaaaaaa' });
        expect(status).toMatchObject({ running: true, reason: 'running' });
    });

    it('accepts previews that predate the course header', async () => {
        await listen(previewFor(null));
        expect((await getPreviewStatus(port, { expectedCourseId: 'aaaaaaaaaaaaaaaa' })).running).toBe(true);
    });

    it('checks only the given port when one is passed', async () => {
        await listen(previewFor('aaaaaaaaaaaaaaaa'));
        expect((await findPreview({ port, expectedCourseId: 'aaaaaaaaaaaaaaaa' })).port).toBe(port);
        expect((await findPreview({ port, expectedCourseId: 'cccccccccccccccc' })).reason).toBe('other-project');
    });
});

describe('getCourseId', () => {
    it('is stable for a path and differs between projects', () => {
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-id-'));
        try {
            fs.mkdirSync(path.join(base, 'one', 'course'), { recursive: true });
            fs.mkdirSync(path.join(base, 'two', 'course'), { recursive: true });
            const one = getCourseId(path.join(base, 'one', 'course'));
            expect(one).toMatch(/^[0-9a-f]{16}$/);
            expect(getCourseId(path.join(base, 'one', '.', 'course'))).toBe(one);
            expect(getCourseId(path.join(base, 'two', 'course'))).not.toBe(one);
            expect(one).not.toContain('one');
        } finally {
            fs.rmSync(base, { recursive: true, force: true });
        }
    });
});
