/**
 * Regression tests: PowerPoint export must pass paths to osascript as argv
 * (no shell / AppleScript string interpolation) and use a private temp dir.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('child_process', async () => {
    const actual = await vi.importActual('child_process');
    return { ...actual, execFileSync: vi.fn(), execSync: vi.fn() };
});

const childProcess = await import('child_process');
const { exportSlidesToPng, POWERPOINT_EXPORT_SCRIPT } = await import('../../lib/import.js');

describe('PowerPoint AppleScript export', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('passes hostile paths as separate argv entries, never inside the script', () => {
        const pptxPath = '/tmp/it\'s "a" $(touch pwned) `x`.pptx';
        const outputDir = '/tmp/out dir/\'; do shell script "rm -rf ~" --';

        exportSlidesToPng(pptxPath, outputDir);

        expect(childProcess.execSync).not.toHaveBeenCalled();
        expect(childProcess.execFileSync).toHaveBeenCalledTimes(1);
        const [command, args, options] = childProcess.execFileSync.mock.calls[0];
        expect(command).toBe('osascript');
        expect(args).toEqual(['-e', POWERPOINT_EXPORT_SCRIPT, path.resolve(pptxPath), path.resolve(outputDir)]);
        expect(options?.shell).toBeFalsy();
        expect(POWERPOINT_EXPORT_SCRIPT).toContain('on run argv');
        expect(POWERPOINT_EXPORT_SCRIPT).not.toContain(pptxPath);
        expect(POWERPOINT_EXPORT_SCRIPT).not.toContain('rm -rf');
    });

    it('wraps osascript failures', () => {
        childProcess.execFileSync.mockImplementationOnce(() => {
            const err = new Error('boom');
            err.stderr = Buffer.from('execution error');
            throw err;
        });
        expect(() => exportSlidesToPng('/tmp/a.pptx', '/tmp/out')).toThrow(/AppleScript failed: execution error/);
    });

    it.runIf(process.platform === 'darwin')('exports into a private mkdtemp dir under os.tmpdir() and removes it', async () => {
        const { importInPlace } = await import('../../lib/import.js');
        const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-import-test-'));
        const pptxPath = path.join(work, 'deck.pptx');
        fs.writeFileSync(pptxPath, 'not a real pptx');
        const courseDir = path.join(work, 'course');
        fs.mkdirSync(courseDir, { recursive: true });

        const realExists = fs.existsSync;
        vi.spyOn(fs, 'existsSync').mockImplementation(p => (
            String(p).endsWith('Microsoft PowerPoint.app') ? true : realExists(p)
        ));
        let exportDir;
        childProcess.execFileSync.mockImplementationOnce((_cmd, args) => {
            exportDir = args[3];
            fs.writeFileSync(path.join(exportDir, 'Slide1.png'), 'png');
        });

        try {
            const result = await importInPlace(pptxPath, courseDir);
            expect(result.slideCount).toBe(1);
            expect(path.dirname(exportDir)).toBe(path.resolve(os.tmpdir()));
            expect(path.basename(exportDir)).toMatch(/^coursecode-pptx-/);
            expect(realExists(exportDir)).toBe(false);
            expect(realExists(path.join(courseDir, 'assets', 'slides', 'slide-01.png'))).toBe(true);
        } finally {
            vi.restoreAllMocks();
            fs.rmSync(work, { recursive: true, force: true });
        }
    });
});
