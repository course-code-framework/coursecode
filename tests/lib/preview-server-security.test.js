import { describe, expect, it } from 'vitest';
import path from 'path';
import {
    buildAllowedPreviewHosts,
    checkPreviewRequestOrigin,
    hasValidPreviewMutationToken,
    isAllowedPreviewHost,
    isAllowedPreviewOrigin,
    isLoopbackAddress,
    isSafeMarkdownHref,
    parsePreviewPort,
    requiresPreviewMutationToken,
    resolveViteCommand,
    simpleMarkdownToHtml
} from '../../lib/preview-server.js';

function mockRes() {
    return {
        status: null,
        body: null,
        writeHead(status) { this.status = status; },
        end(body) { this.body = body; }
    };
}

describe('preview mutation authorization', () => {
    it.each([
        ['POST', '/__write'],
        ['POST', '/__assets-upload'],
        ['POST', '/__refs-convert'],
        ['POST', '/__build']
    ])('protects %s %s', (method, url) => {
        expect(requiresPreviewMutationToken(method, url)).toBe(true);
    });

    it('does not protect read-only requests or in-memory LMS synchronization', () => {
        expect(requiresPreviewMutationToken('GET', '/__config')).toBe(false);
        expect(requiresPreviewMutationToken('POST', '/__lms/sync')).toBe(false);
    });

    it('uses a constant header name and exact token match', () => {
        expect(hasValidPreviewMutationToken({ 'x-coursecode-preview-token': 'right' }, 'right')).toBe(true);
        expect(hasValidPreviewMutationToken({ 'x-coursecode-preview-token': 'wrong' }, 'right')).toBe(false);
        expect(hasValidPreviewMutationToken({}, 'right')).toBe(false);
    });
});

describe('preview port validation', () => {
    it.each([4173, '4199', 65535])('accepts valid port %s', (value) => {
        expect(parsePreviewPort(value)).toBe(Number(value));
    });

    it.each([0, -1, 65536, '4199garbage', 'not-a-port', 1.5])(
        'rejects invalid port %s',
        (value) => expect(() => parsePreviewPort(value)).toThrow('Preview port must be an integer')
    );
});

describe('preview Host / Origin validation (DNS rebinding)', () => {
    const PORT = 4173;
    const loopbackOnly = buildAllowedPreviewHosts('127.0.0.1');

    it.each(['localhost:4173', '127.0.0.1:4173', '[::1]:4173', 'LOCALHOST:4173'])(
        'accepts loopback Host %s', (host) => {
            expect(isAllowedPreviewHost(host, loopbackOnly, PORT)).toBe(true);
        }
    );

    it.each([
        'evil.example:4173',          // rebinding attacker domain
        'localhost.evil.example:4173',
        'localhost:4174',             // wrong port
        'localhost',                  // implicit port 80
        '192.168.1.10:4173',          // not allowed when bound to loopback
        'localhost:4173/path',
        'user@localhost:4173',
        '',
        undefined
    ])('rejects Host %s', (host) => {
        expect(isAllowedPreviewHost(host, loopbackOnly, PORT)).toBe(false);
    });

    it('allows an explicit non-loopback --host value', () => {
        const allowed = buildAllowedPreviewHosts('192.168.1.10');
        expect(isAllowedPreviewHost('192.168.1.10:4173', allowed, PORT)).toBe(true);
        expect(isAllowedPreviewHost('localhost:4173', allowed, PORT)).toBe(true);
        expect(isAllowedPreviewHost('evil.example:4173', allowed, PORT)).toBe(false);
    });

    it('allows this machine\'s interface addresses and hostname for wildcard binds', () => {
        const allowed = buildAllowedPreviewHosts('0.0.0.0', {
            networkInterfaces: () => ({ en0: [{ address: '10.0.0.5' }, { address: 'fe80::1%en0' }] }),
            hostname: () => 'MyMac'
        });
        expect(isAllowedPreviewHost('10.0.0.5:4173', allowed, PORT)).toBe(true);
        expect(isAllowedPreviewHost('[fe80::1]:4173', allowed, PORT)).toBe(true);
        expect(isAllowedPreviewHost('mymac.local:4173', allowed, PORT)).toBe(true);
        expect(isAllowedPreviewHost('evil.example:4173', allowed, PORT)).toBe(false);
    });

    it('accepts opted-in tunnel hostnames on any port', () => {
        const allowed = buildAllowedPreviewHosts('127.0.0.1', { extraHosts: 'Foo-4173.app.github.dev, tunnel.example' });
        expect(isAllowedPreviewHost('foo-4173.app.github.dev', allowed, PORT)).toBe(true);
        expect(isAllowedPreviewHost('tunnel.example:443', allowed, PORT)).toBe(true);
        expect(isAllowedPreviewOrigin('https://tunnel.example', allowed, PORT)).toBe(true);
        expect(isAllowedPreviewHost('evil.example', allowed, PORT)).toBe(false);
        expect(isAllowedPreviewHost('localhost:9999', allowed, PORT)).toBe(false);
    });

    it('validates Origin URLs', () => {
        expect(isAllowedPreviewOrigin('http://localhost:4173', loopbackOnly, PORT)).toBe(true);
        expect(isAllowedPreviewOrigin('http://evil.example:4173', loopbackOnly, PORT)).toBe(false);
        expect(isAllowedPreviewOrigin('https://localhost:4173', loopbackOnly, PORT)).toBe(false);
        expect(isAllowedPreviewOrigin('null', loopbackOnly, PORT)).toBe(false);
    });

    it('rejects foreign Host on every request with 403', () => {
        const res = mockRes();
        const ok = checkPreviewRequestOrigin(
            { method: 'GET', headers: { host: 'rebind.evil.example:4173' } }, res,
            { allowedHosts: loopbackOnly, port: PORT }
        );
        expect(ok).toBe(false);
        expect(res.status).toBe(403);
    });

    it('rejects cross-origin state-changing requests, including unauthenticated /__lms routes', () => {
        const res = mockRes();
        const ok = checkPreviewRequestOrigin(
            { method: 'POST', url: '/__lms/reset', headers: { host: 'localhost:4173', origin: 'http://evil.example' } }, res,
            { allowedHosts: loopbackOnly, port: PORT }
        );
        expect(ok).toBe(false);
        expect(res.status).toBe(403);
    });

    it('allows same-origin browser requests and Node clients without an Origin header', () => {
        const opts = { allowedHosts: loopbackOnly, port: PORT };
        expect(checkPreviewRequestOrigin(
            { method: 'POST', headers: { host: 'localhost:4173', origin: 'http://localhost:4173' } }, mockRes(), opts
        )).toBe(true);
        expect(checkPreviewRequestOrigin(
            { method: 'POST', headers: { host: 'localhost:4173' } }, mockRes(), opts
        )).toBe(true);
        // Cross-origin GETs are not state-changing (Host still validated)
        expect(checkPreviewRequestOrigin(
            { method: 'GET', headers: { host: '127.0.0.1:4173', origin: 'http://evil.example' } }, mockRes(), opts
        )).toBe(true);
    });

    it('classifies loopback addresses', () => {
        expect(isLoopbackAddress('127.0.0.1')).toBe(true);
        expect(isLoopbackAddress('::1')).toBe(true);
        expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
        expect(isLoopbackAddress('localhost')).toBe(true);
        expect(isLoopbackAddress('0.0.0.0')).toBe(false);
        expect(isLoopbackAddress('192.168.1.10')).toBe(false);
    });
});

describe('outline markdown link sanitization', () => {
    it.each([
        'https://example.com/a?b=c',
        'http://example.com',
        'mailto:someone@example.com',
        '#section-2',
        './other.md',
        '../docs/file.md',
        '/absolute/path',
        'relative/path.md',
        '?q=1'
    ])('allows %s', (href) => {
        expect(isSafeMarkdownHref(href)).toBe(true);
    });

    it.each([
        'javascript:alert(1)',
        'JavaScript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox',
        'java\tscript:alert(1)',
        '//evil.example/x'
    ])('rejects %s', (href) => {
        expect(isSafeMarkdownHref(href)).toBe(false);
    });

    it('renders unsafe links as plain text and keeps attribute values escaped', () => {
        const html = simpleMarkdownToHtml('[click](javascript:alert(1)) and [ok](https://example.com/?a="b")');
        expect(html).not.toContain('javascript:');
        expect(html).toContain('click');
        expect(html).toContain('<a href="https://example.com/?a=&quot;b&quot;">ok</a>');
    });
});

describe('vite launch command', () => {
    it('runs the vite JS entry with the current node binary (no shell, no .bin shim)', () => {
        const { command, args } = resolveViteCommand(process.cwd());
        expect(command).toBe(process.execPath);
        expect(args).toHaveLength(1);
        expect(args[0]).toMatch(/vite\.js$/);
        expect(args[0]).not.toContain(path.join('.bin', 'vite'));
    });

    it('falls back to node_modules/vite/bin/vite.js when vite cannot be resolved', () => {
        const dir = path.join(path.sep, 'nonexistent', 'dir with spaces');
        const { args } = resolveViteCommand(dir);
        expect(args[0]).toBe(path.join(dir, 'node_modules', 'vite', 'bin', 'vite.js'));
    });
});
