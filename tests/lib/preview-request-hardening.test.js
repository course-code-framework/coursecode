/**
 * Regression tests for preview-server request hardening:
 * body size limits (413), no wildcard CORS on /__lms, and script-safe JSON
 * embedding in the stub player.
 */
import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'events';
import vm from 'vm';
import {
    jsonForScript,
    readRequestBody,
    RequestBodyTooLargeError
} from '../../lib/project-utils.js';
import { generateStubPlayer } from '../../lib/stub-player.js';
import { createLmsStore, handleLmsRoutes, MAX_LMS_BODY_BYTES } from '../../lib/preview-routes-lms.js';
import { handleEditingRoutes } from '../../lib/preview-routes-editing.js';

function mockReq({ method = 'POST', headers = {} } = {}) {
    const req = new EventEmitter();
    req.method = method;
    req.headers = headers;
    req.resume = () => {};
    return req;
}

function mockRes() {
    const res = {
        headers: {},
        status: null,
        body: null,
        headersSent: false,
        done: null
    };
    res.finished = new Promise(resolve => { res.done = resolve; });
    res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
    res.writeHead = (status, headers = {}) => {
        res.status = status;
        res.headersSent = true;
        for (const [k, v] of Object.entries(headers)) res.headers[k.toLowerCase()] = v;
    };
    res.end = (body) => { res.body = body; res.done(); };
    return res;
}

function send(req, chunks) {
    for (const chunk of chunks) req.emit('data', Buffer.from(chunk));
    req.emit('end');
}

describe('readRequestBody', () => {
    it('buffers bodies under the limit', async () => {
        const req = mockReq();
        const promise = readRequestBody(req, 10);
        send(req, ['hello', 'world']);
        expect((await promise).toString()).toBe('helloworld');
    });

    it('rejects streamed bodies over the limit with a 413 error', async () => {
        const req = mockReq();
        const promise = readRequestBody(req, 8);
        send(req, ['12345', '67890', 'more']);
        await expect(promise).rejects.toMatchObject({ statusCode: 413 });
    });

    it('rejects early on an oversized Content-Length', async () => {
        const req = mockReq({ headers: { 'content-length': String(1024) } });
        await expect(readRequestBody(req, 100)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    });
});

describe('preview routes body limits', () => {
    it('editing routes answer 413 for oversized JSON bodies', async () => {
        const req = mockReq({ headers: { 'content-length': String(6 * 1024 * 1024) } });
        const res = mockRes();
        expect(handleEditingRoutes({ paths: { coursePath: '/nonexistent' } }, req, res, '/__write')).toBe(true);
        await res.finished;
        expect(res.status).toBe(413);
    });

    it('editing routes answer 400 for malformed JSON', async () => {
        const req = mockReq();
        const res = mockRes();
        handleEditingRoutes({ paths: { coursePath: '/nonexistent' } }, req, res, '/__write');
        send(req, ['{not json']);
        await res.finished;
        expect(res.status).toBe(400);
    });

    it('LMS sync answers 413 for oversized bodies', async () => {
        const req = mockReq({ headers: { 'content-length': String(MAX_LMS_BODY_BYTES + 1) } });
        const res = mockRes();
        handleLmsRoutes({ lmsStore: createLmsStore() }, req, res, '/__lms/sync');
        await res.finished;
        expect(res.status).toBe(413);
    });
});

describe('/__lms CORS', () => {
    it('sends no wildcard Access-Control-Allow-Origin', async () => {
        const store = createLmsStore();
        const req = mockReq();
        const res = mockRes();
        handleLmsRoutes({ lmsStore: store }, req, res, '/__lms/sync');
        send(req, [JSON.stringify({ cmiData: { 'cmi.location': 'a' }, apiLog: [] })]);
        await res.finished;
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
        expect(store.cmiData['cmi.location']).toBe('a');

        const optionsRes = mockRes();
        handleLmsRoutes({ lmsStore: store }, mockReq({ method: 'OPTIONS' }), optionsRes, '/__lms/state');
        expect(optionsRes.headers['access-control-allow-origin']).toBeUndefined();
    });
});

describe('stub player script embedding', () => {
    it('jsonForScript escapes </script>, <!-- and line separators', () => {
        const out = jsonForScript({ a: '</script><script>alert(1)</script>', b: '<!--', c: 'x y z' });
        expect(out).not.toMatch(/<\/script/i);
        expect(out).not.toContain('<!--');
        expect(out).not.toContain(' ');
        expect(out).not.toContain(' ');
        expect(JSON.parse(out)).toEqual({ a: '</script><script>alert(1)</script>', b: '<!--', c: 'x y z' });
    });

    it('course content and title cannot break out of the config script', () => {
        const evil = '</script><script>window.__pwned = 1</script>';
        const html = generateStubPlayer({
            title: evil,
            launchUrl: '/',
            storageKey: 'k',
            isLive: false,
            courseContent: `<p>${evil}</p>`
        });
        const configScript = html.match(/<script>\s*\/\/ Inject Configuration([\s\S]*?)<\/script>/);
        expect(configScript).toBeTruthy();
        // The only </script> closing the config block is the real one
        expect(configScript[1]).not.toMatch(/<\/script/i);

        const sandbox = { window: { fetch() {} } };
        vm.runInNewContext(configScript[1], sandbox);
        expect(sandbox.window.STUB_CONFIG.title).toBe(evil);
        expect(sandbox.window.STUB_CONFIG.courseContent).toBe(`<p>${evil}</p>`);
        expect(sandbox.window.__pwned).toBeUndefined();
    });
});
