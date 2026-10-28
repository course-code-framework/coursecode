import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('custom plugin discovery', () => {
    let projectDir;
    let originalCwd;

    beforeEach(() => {
        originalCwd = process.cwd();
        projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-plugins-'));
        fs.mkdirSync(path.join(projectDir, 'course', 'interactions'), { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'course', 'components'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'course', 'interactions', 'select-answer.js'),
            `export const schema = { type: 'select-answer', description: 'Pick one' };\nexport function createSelectAnswerQuestion() {}\n`);
        fs.writeFileSync(path.join(projectDir, 'course', 'components', 'info-box.js'),
            `export const schema = { type: 'info-box', description: 'Note' };\n`);
        process.chdir(projectDir);
        vi.resetModules();
    });

    afterEach(() => {
        process.chdir(originalCwd);
        fs.rmSync(projectDir, { recursive: true, force: true });
    });

    it('finds custom interactions and components in the course project', async () => {
        const extractor = await import('../../lib/schema-extractor.js');
        expect(extractor.getAllSchemas()['select-answer']?.description).toBe('Pick one');
        expect(extractor.getRegisteredComponentTypes()).toContain('info-box');
        expect(extractor.getRegisteredComponentTypes()).toContain('tabs');
    });
});
