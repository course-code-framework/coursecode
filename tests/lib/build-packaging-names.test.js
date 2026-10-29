import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createStandardPackage } from '../../lib/build-packaging.js';

const temporary = [];
afterEach(() => temporary.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

async function packageName(title) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-package-name-'));
    temporary.push(rootDir);
    const distDir = path.join(rootDir, 'dist');
    fs.mkdirSync(distDir);
    fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html>');
    const zipPath = await createStandardPackage({ rootDir, distDir, config: { title, version: '1.0.0', lmsFormat: 'cmi5' } });
    return path.basename(zipPath);
}

describe('package file names', () => {
    it.each([
        ["Manager's Safety 101!", 'managers-safety-101_v1.0.0_cmi5.zip'],
        ['Client Manager Course', 'client-manager-course_v1.0.0_cmi5.zip'],
        ['Café Basics', 'café-basics_v1.0.0_cmi5.zip'],
        ['安全研修', '安全研修_v1.0.0_cmi5.zip'],
        ['', 'course_v1.0.0_cmi5.zip']
    ])('names %j as %s', async (title, expected) => {
        expect(await packageName(title)).toBe(expected);
    });
});
