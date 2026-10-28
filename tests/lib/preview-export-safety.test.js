/**
 * Regression tests: `coursecode preview --export` must never recursively
 * delete something that isn't a previous export, and its password gate must
 * use a salted hash the stub player can verify.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { assertSafeExportOutput, EXPORT_MARKER_FILE, hashPassword } from '../../lib/preview-export.js';
import { derivePasswordHash } from '../../lib/stub-player/login-screen.js';
import { generateStubPlayer } from '../../lib/stub-player.js';

describe('preview export output directory guard', () => {
    let home;
    let project;
    const check = (out, extra = {}) => assertSafeExportOutput(out, { cwd: project, homeDir: home, ...extra });

    beforeEach(() => {
        home = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-export-home-'));
        project = path.join(home, 'projects', 'my-course');
        for (const dir of ['course', 'framework', 'dist']) {
            fs.mkdirSync(path.join(project, dir), { recursive: true });
        }
    });

    afterEach(() => {
        fs.rmSync(home, { recursive: true, force: true });
    });

    it.each([
        ['project root', () => project],
        ['parent of project', () => path.dirname(project)],
        ['home dir', () => home],
        ['filesystem root', () => path.parse(project).root],
        ['course source', () => path.join(project, 'course')],
        ['inside course source', () => path.join(project, 'course', 'preview')],
        ['dist', () => path.join(project, 'dist')],
        ['framework', () => path.join(project, 'framework')]
    ])('refuses %s even with force', (_label, getPath) => {
        expect(() => check(getPath())).toThrow(/Refusing/);
        expect(() => check(getPath(), { force: true })).toThrow(/Refusing/);
    });

    it('allows a new or empty directory', () => {
        expect(() => check(path.join(project, 'course-preview'))).not.toThrow();
        fs.mkdirSync(path.join(project, 'empty'));
        expect(() => check(path.join(project, 'empty'))).not.toThrow();
    });

    it('allows replacing a previous export (marker file, or legacy layout)', () => {
        const marked = path.join(project, 'course-preview');
        fs.mkdirSync(marked);
        fs.writeFileSync(path.join(marked, EXPORT_MARKER_FILE), '');
        fs.writeFileSync(path.join(marked, 'index.html'), '');
        expect(() => check(marked)).not.toThrow();

        const legacy = path.join(project, 'old-preview');
        fs.mkdirSync(path.join(legacy, 'stub-player'), { recursive: true });
        fs.writeFileSync(path.join(legacy, 'index.html'), '');
        fs.writeFileSync(path.join(legacy, '_course.html'), '');
        fs.writeFileSync(path.join(legacy, 'stub-player', 'app-viewer.js'), '');
        expect(() => check(legacy)).not.toThrow();
    });

    it('refuses an unrelated non-empty directory unless forced', () => {
        const docs = path.join(home, 'Documents');
        fs.mkdirSync(docs);
        fs.writeFileSync(path.join(docs, 'thesis.docx'), 'important');
        expect(() => check(docs)).toThrow(/--force/);
        expect(() => check(docs, { force: true })).not.toThrow();
    });

    it('refuses a path that is an existing file', () => {
        const file = path.join(project, 'notes.txt');
        fs.writeFileSync(file, 'x');
        expect(() => check(file, { force: true })).toThrow(/not a directory/);
    });

    it('sees through symlinks to protected directories', () => {
        const link = path.join(home, 'link-to-course');
        fs.symlinkSync(path.join(project, 'course'), link);
        expect(() => check(link, { force: true })).toThrow(/Refusing/);
    });
});

describe('preview export password gate', () => {
    it('uses a random salt per export', () => {
        const a = hashPassword('secret');
        const b = hashPassword('secret');
        expect(a.salt).not.toBe(b.salt);
        expect(a.hash).not.toBe(b.hash);
        expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is verifiable by the stub player login screen (Web Crypto PBKDF2)', async () => {
        const { hash, salt } = hashPassword('correct horse');
        expect(await derivePasswordHash('correct horse', salt)).toBe(hash);
        expect(await derivePasswordHash('wrong', salt)).not.toBe(hash);
    });

    it('embeds hash and salt in the player config', () => {
        const { hash, salt } = hashPassword('pw');
        const html = generateStubPlayer({
            title: 'T', launchUrl: '_course.html', storageKey: 'k', passwordHash: hash, passwordSalt: salt
        });
        expect(html).toContain(`passwordHash: "${hash}"`);
        expect(html).toContain(`passwordSalt: "${salt}"`);
        expect(html).not.toContain('"pw"');
    });
});
