/**
 * Regression tests: slide-source-editor must confine request-supplied file
 * names to course/slides and never let edited text become code.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    editAssessmentSetting,
    editContent,
    editInteractionField,
    editTag,
    resolveSlideSourcePath
} from '../../lib/slide-source-editor.js';
import { parseElements, resolveElementByPath } from '../../lib/course-parser.js';

const findElementByPath = (html, p) => resolveElementByPath(parseElements(html), p);

describe('slide-source-editor path confinement', () => {
    let root;
    let coursePath;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sse-'));
        coursePath = path.join(root, 'course');
        fs.mkdirSync(path.join(coursePath, 'slides'), { recursive: true });
        // A file outside slides/ that a traversal would target
        fs.writeFileSync(path.join(root, 'victim.js'), 'export const slide = { settings: { passingScore: 80 } };\n');
        fs.writeFileSync(path.join(coursePath, 'course-config.js'), 'export const courseConfig = {};\n');
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it.each([
        '../../victim.js',
        '../course-config.js',
        '..%2F..%2Fvictim.js',
        'intro.txt',
        ''
    ])('rejects slide file %j', (file) => {
        expect(() => resolveSlideSourcePath(coursePath, file)).toThrow();
    });

    it('accepts files inside slides/, including subdirectories', () => {
        expect(resolveSlideSourcePath(coursePath, 'intro.js')).toBe(path.join(coursePath, 'slides', 'intro.js'));
        expect(resolveSlideSourcePath(coursePath, 'module-1/intro.js')).toBe(path.join(coursePath, 'slides', 'module-1', 'intro.js'));
        // Leading slashes are treated as relative to slides/, never the filesystem root
        expect(resolveSlideSourcePath(coursePath, '/etc/passwd.js')).toBe(path.join(coursePath, 'slides', 'etc', 'passwd.js'));
    });

    it('editAssessmentSetting refuses a traversing assessmentId', () => {
        expect(() => editAssessmentSetting(coursePath, '../../victim', 'passingScore', 10)).toThrow(/Invalid slide file path/);
        expect(fs.readFileSync(path.join(root, 'victim.js'), 'utf-8')).toContain('passingScore: 80');
    });

    it('editInteractionField refuses a traversing slideId', () => {
        expect(() => editInteractionField(coursePath, '../course-config', 'q1', 'prompt', 'x')).toThrow(/Invalid slide file path/);
    });

    it('editContent and editTag refuse a traversing slideFile', () => {
        expect(() => editContent(coursePath, '../../victim.js', 'div.0/p.0', 'x', findElementByPath)).toThrow(/Invalid slide file path/);
        expect(() => editTag(coursePath, '../../victim.js', 'div.0/p.0', 'div', '', findElementByPath)).toThrow(/Invalid slide file path/);
    });
});

describe('slide-source-editor value escaping', () => {
    let root;
    let coursePath;
    let slidePath;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sse-esc-'));
        coursePath = path.join(root, 'course');
        fs.mkdirSync(path.join(coursePath, 'slides'), { recursive: true });
        slidePath = path.join(coursePath, 'slides', 'intro.js');
        fs.writeFileSync(slidePath, [
            'const greeting = () => \'hi\';',
            'export const slide = {',
            '    settings: { mode: \'linear\' },',
            '    interactions: [{ id: \'q1\', prompt: \'Old prompt\' }],',
            '    render(container) {',
            '        container.innerHTML = `<div><p>Old ${greeting()} text</p><h2>Title</h2></div>`;',
            '    }',
            '};',
            ''
        ].join('\n'));
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    async function loadSlide() {
        const url = `file://${slidePath}?t=${Date.now()}-${Math.random()}`;
        return (await import(/* @vite-ignore */ url)).slide;
    }

    it('escapes backticks, backslashes and ${ in edited template text', async () => {
        const payload = 'a`; globalThis.__pwned = true; `${globalThis.__pwned = true}\\';
        const element = findElementByPath(
            fs.readFileSync(slidePath, 'utf-8').match(/innerHTML = `([\s\S]*?)`;/)[1], 'div.0/h2.0'
        );
        expect(element).toBeTruthy();

        editContent(coursePath, 'intro.js', 'div.0/h2.0', payload, findElementByPath);

        const slide = await loadSlide();
        const container = {};
        slide.render(container);
        expect(globalThis.__pwned).toBeUndefined();
        expect(container.innerHTML).toContain(`<h2>${payload}</h2>`);
        // Untouched expressions elsewhere keep working
        expect(container.innerHTML).toContain('Old hi text');
    });

    it('escapes quotes in interaction string fields', async () => {
        const payload = "It's'; globalThis.__pwned2 = true; '";
        editInteractionField(coursePath, 'intro', 'q1', 'prompt', payload);
        const slide = await loadSlide();
        expect(globalThis.__pwned2).toBeUndefined();
        expect(slide.interactions[0].prompt).toBe(payload);
    });

    it('escapes quotes in assessment string settings', async () => {
        const payload = "free'; globalThis.__pwned3 = true; '";
        editAssessmentSetting(coursePath, 'intro', 'mode', payload);
        const slide = await loadSlide();
        expect(globalThis.__pwned3).toBeUndefined();
        expect(slide.settings.mode).toBe(payload);
    });

    it('rejects tag names and classes that could inject markup or code', () => {
        expect(() => editTag(coursePath, 'intro.js', 'div.0/h2.0', 'div onclick=alert(1)', '', findElementByPath)).toThrow(/Invalid tag name/);
        expect(() => editTag(coursePath, 'intro.js', 'div.0/h2.0', 'div', 'a" onclick="x', findElementByPath)).toThrow(/Invalid class list/);
        expect(() => editTag(coursePath, 'intro.js', 'div.0/h2.0', 'div', '${process.exit()}', findElementByPath)).toThrow(/Invalid class list/);
    });
});
