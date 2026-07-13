import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateManifest, getSchemaFiles } from '../../lib/manifest/manifest-factory.js';

const specialConfig = {
    title: 'Safety & Health <Basics>',
    description: 'Use A&B safely',
    version: '1.0 "release"',
    author: 'R&D',
    language: 'en-US'
};

describe('manifest generation safety', () => {
    it('ships every schema referenced by a SCORM 1.2 package', () => {
        const schemas = getSchemaFiles('scorm1.2');
        expect(schemas).toContain('imscp_rootv1p1p2.xsd');
        expect(schemas).toContain('adlcp_rootv1p2.xsd');
        schemas.forEach(schema => {
            expect(fs.existsSync(path.join(process.cwd(), 'schemas', schema))).toBe(true);
        });
    });

    it.each(['scorm2004', 'scorm1.2', 'cmi5'])('escapes XML content for %s', (format) => {
        const { content } = generateManifest(format, specialConfig, ['index.html', 'assets/a&b.js']);
        expect(content).toContain('Safety &amp; Health &lt;Basics&gt;');
        expect(content).not.toContain('Safety & Health <Basics>');
        if (format !== 'cmi5') expect(content).toContain('assets/a&amp;b.js');
    });

    it('omits an invented package mastery score by default', () => {
        expect(generateManifest('scorm1.2', specialConfig, []).content).not.toContain('masteryscore');
        expect(generateManifest('cmi5', specialConfig, []).content).not.toContain('masteryScore=');
    });

    it('uses an explicitly configured package mastery score', () => {
        const config = { ...specialConfig, masteryScore: 75 };
        expect(generateManifest('scorm1.2', config, []).content).toContain('<adlcp:masteryscore>75</adlcp:masteryscore>');
        expect(generateManifest('cmi5', config, []).content).toContain('masteryScore="0.75"');
        expect(generateManifest('cmi5', config, []).content).toContain('moveOn="CompletedAndPassed"');
    });

    it.each(['scorm1.2-proxy', 'scorm2004-proxy'])('adds local schema locations to %s manifests', (format) => {
        const output = generateManifest(format, { ...specialConfig, identifier: 'id & unsafe' }, []);
        expect(output.content).toContain('xsi:schemaLocation=');
        expect(output.content).toContain('href="proxy.html"');
        expect(output.content).not.toContain('href="index.html"');
        expect(output.content).not.toContain('id & unsafe');
        getSchemaFiles(format).forEach(schema => {
            expect(fs.existsSync(path.join(process.cwd(), 'schemas', schema))).toBe(true);
        });
    });

    it.each(['scorm1.2', 'scorm2004'])('generates an xsd:ID-safe manifest identifier for %s', (format) => {
        const output = generateManifest(format, { ...specialConfig, title: '123 日本語 !!!' }, ['index.html']);
        expect(output.content).toContain('<manifest identifier="course-123"');
    });

    it('targets the exact remote cmi5 launch file while preserving encoded credentials', () => {
        const output = generateManifest('cmi5-remote', specialConfig, [], {
            externalUrl: 'https://cdn.example.com/courses/safety?clientId=A%26B&token=x%3Fy'
        });
        expect(output.content).toContain(
            '<url>https://cdn.example.com/courses/safety/index.html?clientId=A%26B&amp;token=x%3Fy</url>'
        );
    });

    it('rejects a non-IRI cmi5 course identifier', () => {
        expect(() => generateManifest('cmi5', { ...specialConfig, identifier: 'not an iri' }, []))
            .toThrow(/absolute IRI/);
    });

    it('requires a real backend URL for LTI registration', () => {
        expect(() => generateManifest('lti', specialConfig, [])).toThrow(/externalUrl/);
        const output = generateManifest('lti', { ...specialConfig, externalUrl: 'https://tool.example.com' }, []);
        expect(JSON.parse(output.content).initiate_login_uri).toBe('https://tool.example.com/lti/login');
        expect(() => generateManifest('lti', { ...specialConfig, externalUrl: 'http://tool.example.com' }, []))
            .toThrow(/HTTPS/);
        expect(() => generateManifest('lti', { ...specialConfig, externalUrl: 'https://tool.example.com?tenant=a' }, []))
            .toThrow(/query/);
    });
});
