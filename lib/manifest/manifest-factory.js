/**
 * @file manifest-factory.js
 * @description Factory for generating format-specific manifests.
 */

import { generateScorm2004Manifest } from './scorm-2004-manifest.js';
import { generateScorm12Manifest } from './scorm-12-manifest.js';
import { generateCmi5Manifest } from './cmi5-manifest.js';
import { generateScorm12ProxyManifest, generateScorm2004ProxyManifest } from './scorm-proxy-manifest.js';
import { generateLtiToolConfig } from './lti-tool-config.js';

/**
 * Build outputs that exist only for local preview/authoring tooling. They are
 * never listed in LMS manifests or zipped into packages: the content manifest
 * mirrors slide source (including correct answers) for the preview editor.
 * The gallery manifest is NOT listed here because the learner runtime fetches it.
 */
export const PREVIEW_ONLY_BUILD_FILES = Object.freeze(['_content-manifest.json']);

/**
 * Whether a dist-relative path is a preview-only build artifact.
 * @param {string} relativePath - Path relative to the build output root ('/' or '\\' separated)
 * @returns {boolean}
 */
export function isPreviewOnlyBuildFile(relativePath) {
    const normalized = String(relativePath ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
    return PREVIEW_ONLY_BUILD_FILES.includes(normalized);
}

/**
 * Generates the appropriate manifest based on format.
 * @param {string} format - 'scorm2004' | 'scorm1.2' | 'cmi5' | 'scorm1.2-proxy' | 'scorm2004-proxy' | 'cmi5-remote' | 'lti'
 * @param {Object} config - Course configuration
 * @param {string[]} files - List of files to include
 * @param {Object} options - Additional options (externalUrl for proxy/remote)
 * @returns {{ filename: string, content: string }} Manifest filename and content
 */
export function generateManifest(format, config, files = [], options = {}) {
    // Preview-only artifacts may sit in dist/ (e.g. after a dev build); they must
    // never be declared as package resources.
    files = files.filter(file => !isPreviewOnlyBuildFile(file));

    switch (format) {
        case 'cmi5':
            return {
                filename: 'cmi5.xml',
                content: generateCmi5Manifest(config, files)
            };

        case 'cmi5-remote':
            return {
                filename: 'cmi5.xml',
                content: generateCmi5Manifest(config, files, { externalUrl: options.externalUrl })
            };

        case 'scorm1.2':
            return {
                filename: 'imsmanifest.xml',
                content: generateScorm12Manifest(config, files)
            };

        case 'scorm1.2-proxy':
            return {
                filename: 'imsmanifest.xml',
                content: generateScorm12ProxyManifest(config)
            };

        case 'scorm2004-proxy':
            return {
                filename: 'imsmanifest.xml',
                content: generateScorm2004ProxyManifest(config)
            };

        case 'lti':
            return {
                filename: 'lti-tool-config.json',
                content: generateLtiToolConfig(config, options)
            };

        case 'scorm2004':
        default:
            return {
                filename: 'imsmanifest.xml',
                content: generateScorm2004Manifest(config, files)
            };
    }
}

// SCORM 1.2 content packaging schemas plus everything they include/import.
const SCORM12_SCHEMA_FILES = Object.freeze([
    'imscp_rootv1p1p2.xsd',
    'adlcp_rootv1p2.xsd',
    'ims_xml.xsd',
    'xml.xsd',
    'XMLSchema.dtd',
    'datatypes.dtd'
]);

// SCORM 2004 4th Edition schemas referenced by imsmanifest.xml, their
// transitive xsd:include/xsd:import targets, and the IEEE LOM metadata
// schemas (lom*.xsd + common/) shipped for optional package metadata.
const SCORM2004_SCHEMA_FILES = Object.freeze([
    'imscp_v1p1.xsd',
    'adlcp_v1p3.xsd',
    'adlseq_v1p3.xsd',
    'adlnav_v1p3.xsd',
    'imsss_v1p0.xsd',
    'imsss_v1p0auxresource.xsd',
    'imsss_v1p0control.xsd',
    'imsss_v1p0delivery.xsd',
    'imsss_v1p0limit.xsd',
    'imsss_v1p0objective.xsd',
    'imsss_v1p0random.xsd',
    'imsss_v1p0rollup.xsd',
    'imsss_v1p0seqrule.xsd',
    'imsss_v1p0util.xsd',
    'xml.xsd',
    'XMLSchema.dtd',
    'datatypes.dtd',
    'lom.xsd',
    'lomCustom.xsd',
    'lomLoose.xsd',
    'lomStrict.xsd',
    'common/anyElement.xsd',
    'common/dataTypes.xsd',
    'common/elementNames.xsd',
    'common/elementTypes.xsd',
    'common/rootElement.xsd',
    'common/vocabTypes.xsd',
    'common/vocabValues.xsd'
]);

/**
 * Gets the schema files needed for the format.
 * Paths are relative to the package's schemas/ directory (and to the package root).
 * @param {string} format - 'scorm2004' | 'scorm1.2' | 'cmi5'
 * @returns {string[]} List of schema files to copy
 */
export function getSchemaFiles(format) {
    switch (format) {
        case 'cmi5':
        case 'cmi5-remote':
        case 'lti':
            // cmi5 and LTI don't require schema files in the package
            return [];

        case 'scorm1.2':
        case 'scorm1.2-proxy':
            return [...SCORM12_SCHEMA_FILES];

        case 'scorm2004-proxy':
        case 'scorm2004':
        default:
            return [...SCORM2004_SCHEMA_FILES];
    }
}
