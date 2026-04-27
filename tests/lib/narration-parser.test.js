import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    parseSlideNarration,
    hashContent,
    narrationCacheKey,
    narrationAudioPath,
    classifyNarrationFreshness,
    loadNarrationCache
} from '../../framework/scripts/narration-parser.js';
import { checkNarrationFreshness } from '../../lib/build-linter.js';

let tmpRoot;
let coursePath;
let slidesDir;
let audioDir;
let cacheFile;

beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-narration-'));
    coursePath = path.join(tmpRoot, 'course');
    slidesDir = path.join(coursePath, 'slides');
    audioDir = path.join(coursePath, 'assets', 'audio');
    fs.mkdirSync(slidesDir, { recursive: true });
    fs.mkdirSync(audioDir, { recursive: true });
    cacheFile = path.join(tmpRoot, '.narration-cache.json');
});

afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeSlide(name, narrationExport) {
    fs.writeFileSync(
        path.join(slidesDir, `${name}.js`),
        `export const narration = ${narrationExport};\nexport function render() {}\n`
    );
}

function writeAudio(baseName, key = 'slide') {
    fs.writeFileSync(narrationAudioPath(audioDir, baseName, key), 'fake-mp3-bytes');
}

function writeCache(entries) {
    fs.writeFileSync(cacheFile, JSON.stringify(entries, null, 2));
}

describe('narration-parser', () => {
    it('parses simple template-literal narration', () => {
        writeSlide('slide-01', '`Hello, world.`');
        const items = parseSlideNarration(path.join(slidesDir, 'slide-01.js'), 'slide-01', audioDir);
        expect(items).toEqual([
            {
                key: 'slide',
                text: 'Hello, world.',
                settings: {},
                outputPath: path.join(audioDir, 'slide-01.mp3')
            }
        ]);
    });

    it('parses multi-key narration object with voice settings', () => {
        writeSlide('slide-02', `{
            voice_id: 'abc123',
            slide: \`Main slide narration.\`,
            'modal-tips': \`Tips modal narration.\`
        }`);
        const items = parseSlideNarration(path.join(slidesDir, 'slide-02.js'), 'slide-02', audioDir);
        expect(items).toHaveLength(2);
        const slideItem = items.find(i => i.key === 'slide');
        const modalItem = items.find(i => i.key === 'modal-tips');
        expect(slideItem.text).toBe('Main slide narration.');
        expect(slideItem.settings.voice_id).toBe('abc123');
        expect(modalItem.outputPath).toBe(path.join(audioDir, 'slide-02--modal-tips.mp3'));
    });

    it('returns null when no narration export exists', () => {
        fs.writeFileSync(path.join(slidesDir, 'slide-03.js'), `export function render() {}\n`);
        const items = parseSlideNarration(path.join(slidesDir, 'slide-03.js'), 'slide-03', audioDir);
        expect(items).toBeNull();
    });

    it('classifies freshness correctly', () => {
        const item = { key: 'slide', text: 'A', settings: {} };
        const goodHash = hashContent('A' + JSON.stringify({}));

        expect(classifyNarrationFreshness({
            item, cachedHash: goodHash, audioExists: true, cacheLoaded: true
        })).toBe('ok');

        expect(classifyNarrationFreshness({
            item, cachedHash: 'WRONG', audioExists: true, cacheLoaded: true
        })).toBe('stale');

        expect(classifyNarrationFreshness({
            item, cachedHash: undefined, audioExists: false, cacheLoaded: true
        })).toBe('missing');

        expect(classifyNarrationFreshness({
            item, cachedHash: undefined, audioExists: true, cacheLoaded: false
        })).toBe('unknown');
    });
});

describe('checkNarrationFreshness (build-linter integration)', () => {
    function slide(id) {
        return { id, component: `@slides/${id}.js` };
    }

    it('warns when audio exists but text changed (stale)', () => {
        writeSlide('slide-01', '`Updated text.`');
        writeAudio('slide-01');
        // Cache has stale hash from old text
        const oldHash = hashContent('Old text.' + JSON.stringify({}));
        writeCache({ [narrationCacheKey('@slides/slide-01.js', 'slide')]: oldHash });

        const warnings = [];
        checkNarrationFreshness([slide('slide-01')], coursePath, warnings);

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatch(/Slide "slide-01": narration audio is stale/);
        expect(warnings[0]).toMatch(/coursecode narration/);
    });

    it('does not warn when audio is fresh (cache matches)', () => {
        writeSlide('slide-01', '`Hello.`');
        writeAudio('slide-01');
        const goodHash = hashContent('Hello.' + JSON.stringify({}));
        writeCache({ [narrationCacheKey('@slides/slide-01.js', 'slide')]: goodHash });

        const warnings = [];
        checkNarrationFreshness([slide('slide-01')], coursePath, warnings);
        expect(warnings).toHaveLength(0);
    });

    it('does not warn when no audio file exists (per spec)', () => {
        writeSlide('slide-01', '`Some narration.`');
        // No audio written.
        writeCache({});

        const warnings = [];
        checkNarrationFreshness([slide('slide-01')], coursePath, warnings);
        expect(warnings).toHaveLength(0);
    });

    it('does not warn when cache file is missing (unknown state)', () => {
        writeSlide('slide-01', '`Hello.`');
        writeAudio('slide-01');
        // No cache file at all.

        const warnings = [];
        checkNarrationFreshness([slide('slide-01')], coursePath, warnings);
        expect(warnings).toHaveLength(0);
    });

    it('skips slides with no narration export', () => {
        fs.writeFileSync(path.join(slidesDir, 'slide-01.js'), `export function render() {}\n`);
        writeCache({});

        const warnings = [];
        checkNarrationFreshness([slide('slide-01')], coursePath, warnings);
        expect(warnings).toHaveLength(0);
    });

    it('flags stale on a per-key basis for multi-key narration', () => {
        writeSlide('slide-02', `{
            slide: \`Main updated.\`,
            'modal-tips': \`Tips unchanged.\`
        }`);
        writeAudio('slide-02', 'slide');
        writeAudio('slide-02', 'modal-tips');

        const tipsHash = hashContent('Tips unchanged.' + JSON.stringify({}));
        const oldSlideHash = hashContent('Main old.' + JSON.stringify({}));
        writeCache({
            [narrationCacheKey('@slides/slide-02.js', 'slide')]: oldSlideHash,
            [narrationCacheKey('@slides/slide-02.js', 'modal-tips')]: tipsHash
        });

        const warnings = [];
        checkNarrationFreshness([slide('slide-02')], coursePath, warnings);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatch(/key: "slide"|narration audio is stale/);
        expect(warnings[0]).not.toMatch(/modal-tips/);
    });
});

describe('loadNarrationCache', () => {
    it('returns empty object when file is missing', () => {
        expect(loadNarrationCache(path.join(tmpRoot, 'nope.json'))).toEqual({});
    });

    it('returns empty object when file is malformed', () => {
        fs.writeFileSync(cacheFile, '{ not valid json');
        expect(loadNarrationCache(cacheFile)).toEqual({});
    });
});
