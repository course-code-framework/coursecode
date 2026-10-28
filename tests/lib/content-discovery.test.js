import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as acorn from 'acorn';
import { afterEach, describe, expect, it, vi } from 'vitest';
import contentDiscoveryPlugin, { injectEditPaths } from '../../lib/vite-plugin-content-discovery.js';

const temporaryDirectories = [];

afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

function makeProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-discovery-'));
    temporaryDirectories.push(root);
    const coursePath = path.join(root, 'course');
    fs.mkdirSync(path.join(coursePath, 'slides'), { recursive: true });
    fs.mkdirSync(path.join(coursePath, 'assets', 'docs'), { recursive: true });
    fs.writeFileSync(path.join(coursePath, 'course-config.js'), 'export const courseConfig = { metadata: { title: "T" }, structure: [] };\n');
    fs.writeFileSync(path.join(coursePath, 'slides', 'intro.js'), 'export function render(el) { el.innerHTML = `<h1>Hello</h1>`; }\n');
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    return { root, coursePath };
}

async function runBuild(root, mode, pluginOptions = {}) {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = contentDiscoveryPlugin(pluginOptions);
    plugin.configResolved({ root, build: { outDir: 'dist' }, command: 'build', mode });
    await plugin.closeBundle();
}

/** Run the plugin transform over a slide source and return the output code. */
function transformSlide(source) {
    const plugin = contentDiscoveryPlugin();
    const result = plugin.transform(source, '/project/course/slides/example.js');
    return result ? result.code : source;
}

describe('injectEditPaths opening-tag detection', () => {
    it('injects at the real tag end when an attribute expression contains ">"', () => {
        const html = '<p class="${n > 0 ? \'a\' : \'b\'}" data-x="1">Hello</p><h2>Title</h2>';
        const output = injectEditPaths(html);
        // The dynamic class cannot yield a stable path, so <p> is skipped, but the
        // expression must be untouched and the following element still injected.
        expect(output).toContain('class="${n > 0 ? \'a\' : \'b\'}" data-x="1">Hello</p>');
        expect(output).toContain('<h2 data-edit-path="h2.0">Title</h2>');
    });

    it('skips arrow functions inside ${...} attribute values', () => {
        const output = injectEditPaths('<p data-x="${fn(() => 1)}">Hello</p>');
        expect(output).toBe('<p data-x="${fn(() => 1)}" data-edit-path="p.0">Hello</p>');
    });

    it('skips ">" inside quoted attribute values', () => {
        expect(injectEditPaths('<p title="a > b">Hello</p>'))
            .toBe('<p title="a > b" data-edit-path="p.0">Hello</p>');
        expect(injectEditPaths('<p title=\'it > is\'>Hello</p>'))
            .toBe('<p title=\'it > is\' data-edit-path="p.0">Hello</p>');
    });

    it('skips nested template literals, strings and regex literals inside expressions', () => {
        const cases = [
            '<p data-a="${cond ? `x > y` : \'\'}">Text</p>',
            '<p data-a="${s.replace(/>/g, \'&gt;\')}">Text</p>',
            '<p data-a="${ {a: 1}[k] > 0 ? "x}" : "y" }">Text</p>'
        ];
        for (const html of cases) {
            const output = injectEditPaths(html);
            expect(output).toBe(html.replace('">Text</p>', '" data-edit-path="p.0">Text</p>'));
        }
    });

    it('never injects into JavaScript code that only looks like a tag', () => {
        const html = '<div class="box">${a <b && c > d ? \'x\' : \'y\'}</div>';
        const output = injectEditPaths(html);
        expect(output).not.toContain('<b && c data-edit-path');
        expect(output).toContain('${a <b && c > d ? \'x\' : \'y\'}');
    });

    it('does not inject into markup that appears inside an attribute value', () => {
        const output = injectEditPaths('<span title="<b>x</b>">Outer</span>');
        expect(output).toBe('<span title="<b>x</b>" data-edit-path="span.0">Outer</span>');
    });

    it('keeps existing behaviour for plain markup', () => {
        const html = '<div class="card"><h2 class="t">Title</h2><p>Body ${iconManager.getIcon(\'x\')}</p></div>';
        expect(injectEditPaths(html)).toBe(
            '<div class="card" data-edit-path="card.0"><h2 class="t" data-edit-path="card.0/t.0">Title</h2>' +
            '<p data-edit-path="card.0/p.0">Body ${iconManager.getIcon(\'x\')}</p></div>'
        );
    });

    it('produces valid JavaScript for slides with tricky templates', () => {
        const source = [
            'export function render(el, n, items, fn) {',
            '  el.innerHTML = `',
            '    <section class="intro" title="a > b">',
            '      <h1 class="${n > 0 ? \'big\' : \'small\'}">Welcome</h1>',
            '      <h2 title="x > y">Static</h2>',
            '      <p data-x="${fn(() => 1)}">Body</p>',
            '      ${items.map(i => `<li class="${i > 1 ? \'b\' : \'c\'}">Static</li>`).join(\'\')}',
            '      <p>${n > 1 ? \'many\' : \'one\'}</p>',
            '    </section>`;',
            '}'
        ].join('\n');
        const output = transformSlide(source);
        expect(() => acorn.parse(output, { ecmaVersion: 'latest', sourceType: 'module' })).not.toThrow();
        // <section> wraps dynamic ${...} content, so only its static children are editable
        expect(output).toContain('<section class="intro" title="a > b">');
        expect(output).toContain('<h2 title="x > y" data-edit-path="intro.0/h2.0">Static</h2>');
        expect(output).toContain('<p data-x="${fn(() => 1)}" data-edit-path="intro.0/p.0">Body</p>');
    });

    it('produces valid JavaScript for every template course slide', () => {
        const slidesDir = path.resolve(import.meta.dirname, '../../template/course/slides');
        for (const file of fs.readdirSync(slidesDir).filter(name => name.endsWith('.js'))) {
            const output = transformSlide(fs.readFileSync(path.join(slidesDir, file), 'utf8'));
            expect(() => acorn.parse(output, { ecmaVersion: 'latest', sourceType: 'module' }), file).not.toThrow();
        }
    });
});

describe('content discovery build outputs', () => {
    it('does not publish the preview-only content manifest in production builds', async () => {
        const { root } = makeProject();
        const stale = path.join(root, 'dist', '_content-manifest.json');
        fs.writeFileSync(stale, '{}');
        await runBuild(root, 'production');
        expect(fs.existsSync(stale)).toBe(false);
    });

    it('writes the content manifest for development (preview) builds', async () => {
        const { root } = makeProject();
        await runBuild(root, 'development');
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist', '_content-manifest.json'), 'utf8'));
        expect(Object.keys(manifest.slides)).toEqual(['intro']);
    });

    it('allows tooling to opt in explicitly', async () => {
        const { root } = makeProject();
        await runBuild(root, 'production', { writeContentManifest: true });
        expect(fs.existsSync(path.join(root, 'dist', '_content-manifest.json'))).toBe(true);
    });

    it('percent-encodes gallery document URLs', async () => {
        const { root, coursePath } = makeProject();
        const docs = path.join(coursePath, 'assets', 'docs');
        fs.writeFileSync(path.join(docs, 'Safety #1 [100%].pdf'), '%PDF');
        fs.writeFileSync(path.join(docs, 'Safety #1 [100%]_thumbnail.png'), '');
        await runBuild(root, 'production', { galleryConfig: { enabled: true } });
        const gallery = JSON.parse(fs.readFileSync(path.join(root, 'dist', '_gallery-manifest.json'), 'utf8'));
        expect(gallery.items).toEqual([{
            src: 'course/assets/docs/Safety%20%231%20%5B100%25%5D.pdf',
            type: 'pdf',
            label: 'Safety #1 [100%]',
            thumbnail: 'course/assets/docs/Safety%20%231%20%5B100%25%5D_thumbnail.png'
        }]);
    });
});
