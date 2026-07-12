import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getWorkflowStatus } from '../../lib/authoring-api.js';

let originalCwd;
let tempDir;

function writeStarterProject() {
    fs.mkdirSync(path.join(tempDir, 'course', 'references', 'converted'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'course', 'slides'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'course', 'slides', 'intro.js'), `
        export const slide = {
            render() {
                const container = document.createElement('div');
                container.innerHTML = '<h1>Intro</h1>';
                return container;
            }
        };
    `);
    fs.writeFileSync(path.join(tempDir, 'course', 'course-config.js'), `
        export const courseConfig = {
            metadata: { title: 'Starter' },
            structure: [{
                type: 'slide', id: 'intro', component: '@slides/intro.js',
                title: 'Introduction', engagement: { required: false }
            }],
            environment: { automation: { enabled: true } }
        };
    `);
}

beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-workflow-test-'));
    process.chdir(tempDir);
    writeStarterProject();
});

afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('getWorkflowStatus', () => {
    it('keeps a lintable starter in source ingestion when raw references are unconverted', async () => {
        fs.writeFileSync(path.join(tempDir, 'course', 'references', 'source.docx'), 'fixture');

        const status = await getWorkflowStatus(65530);

        expect(status.stage).toBe('source-ingestion');
        expect(status.stageNumber).toBe(1);
        expect(status.checklist).toMatchObject({
            hasRawRefs: true,
            hasConvertedRefs: false,
            hasOutline: false,
            hasSlides: true
        });
    });

    it('requires an outline after references have been converted', async () => {
        fs.writeFileSync(path.join(tempDir, 'course', 'references', 'source.docx'), 'fixture');
        fs.writeFileSync(path.join(tempDir, 'course', 'references', 'converted', 'source.md'), '# Source');

        const status = await getWorkflowStatus(65531);

        expect(status.stage).toBe('outline-creation');
        expect(status.stageNumber).toBe(2);
        expect(status.checklist.hasOutline).toBe(false);
    });
});
