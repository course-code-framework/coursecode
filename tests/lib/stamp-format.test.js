/**
 * Tests for stampFormatInHtml() — re-stamps the lms-format meta tag in HTML files.
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { stampFormatInHtml } from '../../lib/build-packaging.js';

describe('stampFormatInHtml', () => {
    let tmpDir;
    let htmlPath;

    function setup(htmlContent) {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-test-'));
        htmlPath = path.join(tmpDir, 'index.html');
        fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
    }

    afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true });
        }
    });

    it('replaces an existing lms-format meta tag', () => {
        setup([
            '<!DOCTYPE html>',
            '<html><head>',
            '  <meta charset="UTF-8" />',
            '  <meta name="lms-format" content="cmi5" />',
            '</head><body></body></html>'
        ].join('\n'));

        stampFormatInHtml(htmlPath, 'scorm2004');

        const result = fs.readFileSync(htmlPath, 'utf-8');
        expect(result).toContain('<meta name="lms-format" content="scorm2004" />');
        expect(result).not.toContain('content="cmi5"');
    });

    it('inserts a meta tag after charset when none exists', () => {
        setup([
            '<!DOCTYPE html>',
            '<html><head>',
            '  <meta charset="UTF-8" />',
            '</head><body></body></html>'
        ].join('\n'));

        stampFormatInHtml(htmlPath, 'scorm1.2');

        const result = fs.readFileSync(htmlPath, 'utf-8');
        expect(result).toContain('<meta name="lms-format" content="scorm1.2" />');
        // Should appear after charset
        const charsetIdx = result.indexOf('charset="UTF-8"');
        const formatIdx = result.indexOf('lms-format');
        expect(formatIdx).toBeGreaterThan(charsetIdx);
    });

    it('handles self-closing meta tag without space before slash', () => {
        setup([
            '<!DOCTYPE html>',
            '<html><head>',
            '  <meta charset="UTF-8" />',
            '  <meta name="lms-format" content="lti"/>',
            '</head><body></body></html>'
        ].join('\n'));

        stampFormatInHtml(htmlPath, 'cmi5');

        const result = fs.readFileSync(htmlPath, 'utf-8');
        expect(result).toContain('<meta name="lms-format" content="cmi5" />');
        expect(result).not.toContain('content="lti"');
    });

    it('does not duplicate the meta tag on repeated calls', () => {
        setup([
            '<!DOCTYPE html>',
            '<html><head>',
            '  <meta charset="UTF-8" />',
            '</head><body></body></html>'
        ].join('\n'));

        stampFormatInHtml(htmlPath, 'scorm2004');
        stampFormatInHtml(htmlPath, 'scorm1.2');
        stampFormatInHtml(htmlPath, 'cmi5');

        const result = fs.readFileSync(htmlPath, 'utf-8');
        const matches = result.match(/lms-format/g);
        expect(matches).toHaveLength(1);
        expect(result).toContain('content="cmi5"');
    });

    it('preserves the rest of the HTML unchanged', () => {
        setup([
            '<!DOCTYPE html>',
            '<html><head>',
            '  <meta charset="UTF-8" />',
            '  <meta name="lms-format" content="cmi5" />',
            '  <title>My Course</title>',
            '</head>',
            '<body><div id="app"></div></body>',
            '</html>'
        ].join('\n'));

        stampFormatInHtml(htmlPath, 'lti');

        const result = fs.readFileSync(htmlPath, 'utf-8');
        expect(result).toContain('<title>My Course</title>');
        expect(result).toContain('<div id="app"></div>');
        expect(result).toContain('<!DOCTYPE html>');
    });

    it('works with all supported format strings', () => {
        const formats = ['cmi5', 'cmi5-remote', 'scorm2004', 'scorm2004-proxy', 'scorm1.2', 'scorm1.2-proxy', 'lti'];

        for (const format of formats) {
            setup([
                '<!DOCTYPE html>',
                '<html><head>',
                '  <meta charset="UTF-8" />',
                '  <meta name="lms-format" content="placeholder" />',
                '</head><body></body></html>'
            ].join('\n'));

            stampFormatInHtml(htmlPath, format);

            const result = fs.readFileSync(htmlPath, 'utf-8');
            expect(result).toContain(`content="${format}"`);
        }
    });
});
