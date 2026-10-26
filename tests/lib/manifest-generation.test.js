import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    generateManifest,
    getSchemaFiles,
    isPreviewOnlyBuildFile
} from '../../lib/manifest/manifest-factory.js';
import { createStandardPackage } from '../../lib/build-packaging.js';
import { deriveIdentifierSlug, encodeUriPath, makeXmlId } from '../../lib/manifest/xml-utils.js';

const schemasDir = path.join(process.cwd(), 'schemas');

function hasXmllint() {
    try {
        execFileSync('xmllint', ['--version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

const temporaryDirectories = [];
afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

function tempDir(prefix) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    temporaryDirectories.push(directory);
    return directory;
}

/** Local schemaLocation / DTD references declared by a schema file. */
function localSchemaReferences(relativePath) {
    const source = fs.readFileSync(path.join(schemasDir, relativePath), 'utf8');
    const refs = [
        ...[...source.matchAll(/schemaLocation\s*=\s*"([^"]+)"/g)].map(match => match[1]),
        ...[...source.matchAll(/<!(?:DOCTYPE|ENTITY)[^>]*?'([^']+\.dtd)'/g)].map(match => match[1]),
        ...[...source.matchAll(/<!(?:DOCTYPE|ENTITY)[^>]*?"([^"]+\.dtd)"/g)].map(match => match[1])
    ];
    return refs
        .filter(ref => !/^[a-z]+:/i.test(ref))
        .map(ref => path.posix.join(path.posix.dirname(relativePath), ref));
}

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

    it('mastery score keeps exact authored precision for cmi5', () => {
        const mastery = (score) => generateManifest('cmi5', { ...specialConfig, masteryScore: score }, [])
            .content.match(/masteryScore="([^"]+)"/)[1];
        expect(mastery(87.5)).toBe('0.875');
        expect(mastery(33.3)).toBe('0.333');
        expect(mastery(100)).toBe('1');
        expect(mastery(0)).toBe('0');
        expect(mastery(80)).toBe('0.8');
    });
});

describe('package identifiers', () => {
    it('keeps historical identifiers for ASCII titles', () => {
        expect(makeXmlId('Safety & Health <Basics>')).toBe('Safety-Health-Basics');
        expect(makeXmlId('2024 Onboarding')).toBe('course-2024-Onboarding');
        expect(makeXmlId('!!!')).toBe('course');
        expect(generateManifest('cmi5', { ...specialConfig, title: 'Safety 101' }, []).content)
            .toContain('<course id="urn:coursecode:safety-101">');
    });

    it('keeps historical identifiers for titles with some ASCII', () => {
        expect(makeXmlId('Café Básico')).toBe('Caf-B-sico');
        expect(makeXmlId('123 日本語 !!!')).toBe('course-123');
        expect(deriveIdentifierSlug('Café Básico', { lowercase: true })).toEqual({ slug: 'caf-b-sico', hashed: false });
    });

    it('gives distinct, stable IDs to non-Latin titles', () => {
        const ids = ['安全研修', '品質管理', 'Охрана труда', 'السلامة'].map(title =>
            generateManifest('cmi5', { ...specialConfig, title }, []).content.match(/<course id="([^"]+)"/)[1]);
        expect(new Set(ids).size).toBe(ids.length);
        ids.forEach(id => expect(id).toMatch(/^urn:coursecode:course-[0-9a-f]{8}$/));
        // Stable across runs
        expect(generateManifest('cmi5', { ...specialConfig, title: '安全研修' }, []).content).toContain(ids[0]);
        const scormId = generateManifest('scorm2004', { ...specialConfig, title: '安全研修' }, []).content
            .match(/<manifest identifier="([^"]+)"/)[1];
        expect(scormId).toMatch(/^course-[0-9a-f]{8}$/);
        expect(scormId).not.toBe(makeXmlId('品質管理'));
    });

    it('prefers an explicitly configured identifier', () => {
        const config = { ...specialConfig, title: '安全研修', identifier: 'urn:acme:safety-101' };
        expect(generateManifest('cmi5', config, []).content).toContain('<course id="urn:acme:safety-101">');
        expect(generateManifest('cmi5', config, []).content).toContain('<au id="urn:acme:safety-101/au/1"');
        expect(generateManifest('scorm2004', config, []).content).toContain('<manifest identifier="urn-acme-safety-101"');
        expect(generateManifest('scorm1.2', config, []).content).toContain('<manifest identifier="urn-acme-safety-101"');
    });
});

describe('manifest resource hrefs', () => {
    const files = ['index.html', 'course/assets/docs/My File #1 [v2] 100%.pdf', 'course/assets/images/café.png', 'assets/a&b.js'];

    it.each(['scorm2004', 'scorm1.2'])('percent-encodes each path segment for %s', (format) => {
        const { content } = generateManifest(format, specialConfig, files);
        expect(content).toContain('href="index.html">');
        expect(content).toContain('<file href="index.html"/>');
        expect(content).toContain('<file href="course/assets/docs/My%20File%20%231%20%5Bv2%5D%20100%25.pdf"/>');
        expect(content).toContain('<file href="course/assets/images/caf%C3%A9.png"/>');
        expect(content).toContain('<file href="assets/a&amp;b.js"/>');
    });

    it('encodes reserved URI characters but keeps separators', () => {
        expect(encodeUriPath('a b/c?d#e/f%g')).toBe('a%20b/c%3Fd%23e/f%25g');
        expect(encodeUriPath('x:y@z+w=1;2,3$&')).toBe('x%3Ay@z+w=1;2,3$&');
    });

    it.each(['scorm2004', 'scorm1.2', 'cmi5'])('never declares preview-only build files for %s', (format) => {
        const { content } = generateManifest(format, specialConfig, ['index.html', '_content-manifest.json', '_gallery-manifest.json']);
        expect(content).not.toContain('_content-manifest.json');
        if (format !== 'cmi5') expect(content).toContain('_gallery-manifest.json');
    });

    it('recognizes preview-only paths regardless of separator style', () => {
        expect(isPreviewOnlyBuildFile('_content-manifest.json')).toBe(true);
        expect(isPreviewOnlyBuildFile('./_content-manifest.json')).toBe(true);
        expect(isPreviewOnlyBuildFile('course/_content-manifest.json')).toBe(false);
        expect(isPreviewOnlyBuildFile('_gallery-manifest.json')).toBe(false);
    });
});

describe('SCORM 2004 navigation presentation', () => {
    it('places adlnav:presentation as a child of item after imsss:sequencing', () => {
        const { content } = generateManifest('scorm2004', specialConfig, ['index.html']);
        const sequencing = content.match(/<imsss:sequencing>[\s\S]*?<\/imsss:sequencing>/)[0];
        expect(sequencing).not.toContain('adlnav:');
        const item = content.match(/<item identifier="item-1"[\s\S]*?<\/item>/)[0];
        expect(item.indexOf('</imsss:sequencing>')).toBeLessThan(item.indexOf('<adlnav:presentation>'));
        expect(item).toMatch(/<\/adlnav:presentation>\s*<\/item>$/);
    });

    it.skipIf(!hasXmllint()).each([
        ['scorm2004', 'coursecode_scorm2004_package.xsd'],
        ['scorm1.2', 'coursecode_scorm12_package.xsd']
    ])('%s manifest validates against the bundled XSDs', (format, schema) => {
        const directory = tempDir('coursecode-xsd-');
        const manifestPath = path.join(directory, 'imsmanifest.xml');
        const { content } = generateManifest(format, specialConfig, ['index.html', 'course/assets/My File #1.pdf']);
        fs.writeFileSync(manifestPath, content);
        expect(() => execFileSync('xmllint', ['--noout', '--schema', schema, manifestPath], {
            cwd: schemasDir,
            stdio: 'pipe'
        })).not.toThrow();
    });
});

describe('schema file lists', () => {
    it.each(['scorm2004', 'scorm2004-proxy', 'scorm1.2', 'scorm1.2-proxy'])('lists a closed, existing schema set for %s', (format) => {
        const schemas = getSchemaFiles(format);
        const listed = new Set(schemas);
        for (const schema of schemas) {
            expect(fs.existsSync(path.join(schemasDir, schema)), schema).toBe(true);
            for (const ref of localSchemaReferences(schema)) {
                // lom*.xsd reference optional extend/unique/vocab profiles that are not bundled
                if (!fs.existsSync(path.join(schemasDir, ref))) continue;
                expect(listed.has(ref), `${schema} -> ${ref}`).toBe(true);
            }
        }
    });

    it('includes the SCORM 2004 sequencing includes, xml.xsd and LOM common files', () => {
        const schemas = getSchemaFiles('scorm2004');
        expect(schemas).toEqual(expect.arrayContaining([
            'xml.xsd',
            'imsss_v1p0util.xsd',
            'imsss_v1p0seqrule.xsd',
            'common/dataTypes.xsd'
        ]));
        expect(schemas.filter(file => /^imsss_v1p0.+\.xsd$/.test(file))).toHaveLength(9);
        expect(getSchemaFiles('scorm1.2')).toEqual(expect.arrayContaining(['ims_xml.xsd', 'xml.xsd']));
        expect(getSchemaFiles('cmi5')).toEqual([]);
        expect(getSchemaFiles('lti')).toEqual([]);
    });
});

describe('standard package archive', () => {
    it('excludes preview-only build files from the LMS zip', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const rootDir = tempDir('coursecode-package-');
        const distDir = path.join(rootDir, 'dist');
        fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
        fs.writeFileSync(path.join(distDir, 'index.html'), '<html></html>');
        fs.writeFileSync(path.join(distDir, 'assets', 'main.js'), '');
        fs.writeFileSync(path.join(distDir, '_gallery-manifest.json'), '{"items":[]}');
        fs.writeFileSync(path.join(distDir, '_content-manifest.json'), '{"answers":"secret"}');

        const zipPath = await createStandardPackage({
            rootDir,
            distDir,
            config: { title: 'Course', version: '1.0.0', lmsFormat: 'scorm2004' }
        });
        const zip = fs.readFileSync(zipPath);
        expect(zip.includes('index.html')).toBe(true);
        expect(zip.includes('assets/main.js')).toBe(true);
        expect(zip.includes('_gallery-manifest.json')).toBe(true);
        expect(zip.includes('_content-manifest.json')).toBe(false);
    });
});

