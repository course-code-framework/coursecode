import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findLatestCoursePackage } from '../../lib/info.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('course info package discovery', () => {
    let tempDir;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-info-test-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns the most recently modified course package', () => {
        const olderPackage = path.join(tempDir, 'z-old-course.zip');
        const newerPackage = path.join(tempDir, 'a-new-course.zip');
        fs.writeFileSync(olderPackage, 'old');
        fs.writeFileSync(newerPackage, 'new');
        fs.utimesSync(olderPackage, new Date('2026-01-01'), new Date('2026-01-01'));
        fs.utimesSync(newerPackage, new Date('2026-02-01'), new Date('2026-02-01'));

        expect(findLatestCoursePackage(tempDir)).toBe('a-new-course.zip');
    });

    it('ignores directories and non-ZIP files', () => {
        fs.mkdirSync(path.join(tempDir, 'not-a-package.zip'));
        fs.writeFileSync(path.join(tempDir, 'course.txt'), 'not a package');

        expect(findLatestCoursePackage(tempDir)).toBeNull();
    });

    it('reports the newest package through the info command', () => {
        const olderPackage = path.join(tempDir, 'z-old-course.zip');
        const newerPackage = path.join(tempDir, 'a-new-course.zip');
        fs.writeFileSync(path.join(tempDir, '.coursecoderc.json'), JSON.stringify({ frameworkVersion: '0.1.59' }));
        fs.writeFileSync(olderPackage, 'old');
        fs.writeFileSync(newerPackage, 'new');
        fs.utimesSync(olderPackage, new Date('2026-01-01'), new Date('2026-01-01'));
        fs.utimesSync(newerPackage, new Date('2026-02-01'), new Date('2026-02-01'));

        const output = execFileSync(
            process.execPath,
            [path.join(packageRoot, 'bin/cli.js'), 'info'],
            { cwd: tempDir, encoding: 'utf-8' }
        );

        expect(output).toContain('Course package: a-new-course.zip');
        expect(output).not.toContain('Course package: z-old-course.zip');
    });
});
