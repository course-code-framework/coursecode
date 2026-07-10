import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');

describe('SCORM proxy transport security', () => {
    it('loads pipwerks and the exact course URL before the bridge', () => {
        const html = fs.readFileSync(path.join(repoRoot, 'lib/proxy-templates/proxy.html'), 'utf8');
        expect(html.indexOf('pipwerks.js')).toBeLessThan(html.indexOf('scorm-bridge.js'));
        expect(html.indexOf('COURSECODE_PROXY_CONFIG')).toBeLessThan(html.indexOf('scorm-bridge.js'));
    });

    it('validates both origin and source and never uses wildcard delivery', () => {
        const bridge = fs.readFileSync(path.join(repoRoot, 'lib/proxy-templates/scorm-bridge.js'), 'utf8');
        expect(bridge).toContain('event.source !== iframe.contentWindow');
        expect(bridge).toContain('event.origin !== courseOrigin');
        expect(bridge).not.toContain("courseOrigin = '*'");
    });
});
