import { describe, expect, it } from 'vitest';
import { generateManifest } from '../../lib/manifest/manifest-factory.js';

const specialConfig = {
    title: 'Safety & Health <Basics>',
    description: 'Use A&B safely',
    version: '1.0 "release"',
    author: 'R&D',
    language: 'en-US'
};

describe('manifest generation safety', () => {
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
    });

    it('requires a real backend URL for LTI registration', () => {
        expect(() => generateManifest('lti', specialConfig, [])).toThrow(/externalUrl/);
        const output = generateManifest('lti', { ...specialConfig, externalUrl: 'https://tool.example.com' }, []);
        expect(JSON.parse(output.content).initiate_login_uri).toBe('https://tool.example.com/lti/login');
    });
});
