import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');

describe('loading startup shell', () => {
    it('starts behind the loading gate instead of preselecting a visual layout', () => {
        const html = fs.readFileSync(path.join(repoRoot, 'framework/index.html'), 'utf8');

        expect(html).toContain('<html lang="en" data-course-loading="true">');
        expect(html).not.toContain('data-layout="article"');
        expect(html).not.toContain('data-sidebar-enabled="false"');
    });

    it('hides shell chrome and makes loading cover the full shell during startup', () => {
        const css = fs.readFileSync(path.join(repoRoot, 'framework/css/components/loading.css'), 'utf8');

        expect(css).toContain('html[data-course-loading="true"] .course-header');
        expect(css).toContain('html[data-course-loading="true"] .app-footer');
        expect(css).toContain('position: fixed;');
        expect(css).toContain('z-index: var(--z-overlay);');
    });

    it('removes the loading gate on every terminal startup path', () => {
        const appUi = fs.readFileSync(path.join(repoRoot, 'framework/js/app/AppUI.js'), 'utf8');
        const mainJs = fs.readFileSync(path.join(repoRoot, 'framework/js/main.js'), 'utf8');
        const removalCount = (mainJs.match(/removeAttribute\('data-course-loading'\)/g) || []).length;

        expect(appUi).toContain("document.documentElement.removeAttribute('data-course-loading');");
        expect(removalCount).toBeGreaterThanOrEqual(1);
    });

    it('still applies the course-config layout at runtime', () => {
        const mainJs = fs.readFileSync(path.join(repoRoot, 'framework/js/main.js'), 'utf8');

        expect(mainJs).toContain("const layout = courseConfig.layout || 'article';");
        expect(mainJs).toContain("html.setAttribute('data-layout', layout);");
    });

    it('references the generated-project course theme path', () => {
        const html = fs.readFileSync(path.join(repoRoot, 'framework/index.html'), 'utf8');

        expect(html).toContain('href="../course/theme.css"');
        expect(html).not.toContain('../template/course/theme.css');
    });
});
