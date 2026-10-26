/**
 * Regression tests: the exported system CA bundle must live in a private
 * per-user directory and never be reused unless it is ours and unchanged.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { applyWindowsSystemCerts, getCertCacheDir, writeCertBundle } from '../../lib/cloud-certs.js';

const PEM_A = '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n';
const PEM_B = '-----BEGIN CERTIFICATE-----\nBBBB\n-----END CERTIFICATE-----\n';

describe.runIf(process.platform !== 'win32')('writeCertBundle', () => {
    let base;
    let dir;

    beforeEach(() => {
        base = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-certs-'));
        dir = path.join(base, '.coursecode', 'certs');
    });

    afterEach(() => {
        fs.rmSync(base, { recursive: true, force: true });
    });

    it('defaults to a per-user directory, not the shared temp dir', () => {
        expect(getCertCacheDir()).toBe(path.join(os.homedir(), '.coursecode', 'certs'));
    });

    it('writes the bundle with private permissions', () => {
        const certPath = writeCertBundle(PEM_A, dir);
        expect(path.dirname(certPath)).toBe(dir);
        expect(fs.readFileSync(certPath, 'utf-8')).toBe(PEM_A);
        expect(fs.statSync(certPath).mode & 0o777).toBe(0o600);
        expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
        // No temp files left behind
        expect(fs.readdirSync(dir)).toEqual([path.basename(certPath)]);
    });

    it('reuses an identical existing bundle', () => {
        const first = writeCertBundle(PEM_A, dir);
        const inode = fs.statSync(first).ino;
        expect(writeCertBundle(PEM_A, dir)).toBe(first);
        expect(fs.statSync(first).ino).toBe(inode);
    });

    it('replaces a tampered file at the expected path', () => {
        const certPath = writeCertBundle(PEM_A, dir);
        fs.writeFileSync(certPath, PEM_B);
        expect(writeCertBundle(PEM_A, dir)).toBe(certPath);
        expect(fs.readFileSync(certPath, 'utf-8')).toBe(PEM_A);
    });

    it('replaces a symlink planted at the expected path instead of following it', () => {
        const certPath = writeCertBundle(PEM_A, dir);
        const attackerFile = path.join(base, 'attacker.pem');
        fs.writeFileSync(attackerFile, PEM_A);
        fs.rmSync(certPath);
        fs.symlinkSync(attackerFile, certPath);

        writeCertBundle(PEM_A, dir);
        expect(fs.lstatSync(certPath).isSymbolicLink()).toBe(false);
        expect(fs.readFileSync(attackerFile, 'utf-8')).toBe(PEM_A);
    });

    it('tightens a pre-existing permissive cache directory', () => {
        fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
        fs.chmodSync(dir, 0o777);
        writeCertBundle(PEM_A, dir);
        expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    });
});

describe('applyWindowsSystemCerts', () => {
    const BUNDLED = '-----BEGIN CERTIFICATE-----\nBUNDLED\n-----END CERTIFICATE-----\n';
    const SYSTEM = '-----BEGIN CERTIFICATE-----\nSYSTEM\n-----END CERTIFICATE-----';

    function fakeTls({ system = [SYSTEM], defaults = [BUNDLED], withSetter = true } = {}) {
        const api = {
            calls: [],
            getCACertificates(type) {
                if (type === 'system') return system;
                if (type === 'default') return defaults;
                return [];
            },
        };
        if (withSetter) api.setDefaultCACertificates = (certs) => api.calls.push(certs);
        return api;
    }

    it('adds system certs to the existing defaults in-process when supported', () => {
        const api = fakeTls({ defaults: [BUNDLED, SYSTEM] });
        expect(applyWindowsSystemCerts(api)).toEqual({ method: 'in-process' });
        // Defaults are kept (additive, like win-ca's inject '+') and deduplicated
        expect(api.calls).toEqual([[BUNDLED, SYSTEM]]);
    });

    it('returns a PEM bundle for NODE_EXTRA_CA_CERTS when setDefaultCACertificates is unavailable', () => {
        const api = fakeTls({ withSetter: false, system: [SYSTEM, BUNDLED] });
        const result = applyWindowsSystemCerts(api);
        expect(result.method).toBe('pem');
        expect(result.pem).toBe(`${SYSTEM}\n${BUNDLED}`);
    });

    it('is a no-op when the system store is empty', () => {
        const api = fakeTls({ system: [] });
        expect(applyWindowsSystemCerts(api)).toEqual({ method: 'none' });
        expect(api.calls).toEqual([]);
    });

    it('is a no-op on Node versions without tls.getCACertificates', () => {
        expect(applyWindowsSystemCerts({})).toEqual({ method: 'unsupported' });
    });

    it('works against the real tls module', async () => {
        const tls = await import('tls');
        expect(typeof tls.getCACertificates).toBe('function');
        expect(['in-process', 'pem', 'none']).toContain(
            applyWindowsSystemCerts({ getCACertificates: tls.getCACertificates }).method
        );
    });
});
