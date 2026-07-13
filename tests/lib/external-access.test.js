import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadExternalAccessConfig, validateExternalHostingConfig } from '../../lib/build-packaging.js';

let tempDir;
afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
});

describe('external hosting access configuration', () => {
    it('rejects learner-facing client secrets in course config', () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-access-'));
        expect(() => loadExternalAccessConfig(tempDir, {
            accessControl: { clients: { acme: { token: 'secret' } } }
        })).toThrow(/must not be stored/);
    });

    it('loads client secrets from the gitignored build-time file', () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-access-'));
        fs.mkdirSync(path.join(tempDir, '.coursecode'));
        fs.writeFileSync(
            path.join(tempDir, '.coursecode', 'access-control.json'),
            JSON.stringify({ clients: { acme: { token: 'secret' } } })
        );

        expect(loadExternalAccessConfig(tempDir, { accessControl: { enforcement: 'server' } })).toEqual({
            enforcement: 'server',
            clients: { acme: { token: 'secret' } }
        });
    });

    it('requires server enforcement for external formats', () => {
        expect(() => validateExternalHostingConfig({
            lmsFormat: 'scorm1.2-proxy',
            externalUrl: 'https://cdn.example.com/course',
            accessControl: { clients: { acme: { token: 'secret' } } }
        })).toThrow(/enforcement/);
    });

    it.each([
        'relative/course',
        'http://cdn.example.com/course',
        'https://cdn.example.com/course#launch'
    ])('rejects unsafe external URL %s', (externalUrl) => {
        expect(() => validateExternalHostingConfig({
            lmsFormat: 'scorm1.2-proxy',
            externalUrl,
            accessControl: { enforcement: 'server', clients: { acme: { token: 'secret' } } }
        })).toThrow(/externalUrl|HTTPS|fragment/);
    });
});
