import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    detectBuiltFormat,
    findProducedZipFiles,
    formatBuildOutput,
    snapshotZipFiles
} from '../../lib/build.js';

const temporaryDirectories = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

describe('build CLI output', () => {
    it('reports only archives created or changed by the current build', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-build-cli-'));
        temporaryDirectories.push(directory);
        fs.writeFileSync(path.join(directory, 'stale_cmi5.zip'), 'stale');
        fs.writeFileSync(path.join(directory, 'course_scorm2004.zip'), 'old');

        const before = snapshotZipFiles(directory);
        fs.writeFileSync(path.join(directory, 'course_scorm2004.zip'), 'new-package-content');

        expect(findProducedZipFiles(directory, before)).toEqual(['course_scorm2004.zip']);
    });

    it('uses format-specific labels and the actual produced archive', () => {
        const output = formatBuildOutput('cmi5', ['electrical_safety_v1.0.0_cmi5.zip']);

        expect(output).toContain('cmi5 package files');
        expect(output).toContain('electrical_safety_v1.0.0_cmi5.zip');
        expect(output).toContain('cmi5-compatible LMS or conformance tool');
        expect(output).not.toContain('SCORM package files');
    });

    it('detects the configured format from the built package when no CLI override was passed', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-build-format-'));
        temporaryDirectories.push(directory);
        fs.writeFileSync(
            path.join(directory, 'index.html'),
            '<meta name="lms-format" content="cmi5" />'
        );

        expect(detectBuiltFormat(directory)).toBe('cmi5');
    });
});
