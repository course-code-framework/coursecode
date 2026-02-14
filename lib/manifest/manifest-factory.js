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
 * Generates the appropriate manifest based on format.
 * @param {string} format - 'scorm2004' | 'scorm1.2' | 'cmi5' | 'scorm1.2-proxy' | 'scorm2004-proxy' | 'cmi5-remote' | 'lti'
 * @param {Object} config - Course configuration
 * @param {string[]} files - List of files to include
 * @param {Object} options - Additional options (externalUrl for proxy/remote)
 * @returns {{ filename: string, content: string }} Manifest filename and content
 */
export function generateManifest(format, config, files, options = {}) {
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

/**
 * Gets the schema files needed for the format.
 * @param {string} format - 'scorm2004' | 'scorm1.2' | 'cmi5'
 * @returns {string[]} List of schema file patterns to copy
 */
export function getSchemaFiles(format) {
    switch (format) {
        case 'cmi5':
        case 'lti':
            // cmi5 and LTI don't require schema files in the package
            return [];

        case 'scorm1.2':
            // SCORM 1.2 schema files
            return [
                'imscp_rootv1p1p2.xsd',
                'adlcp_rootv1p2.xsd',
                'ims_xml.xsd'
            ];

        case 'scorm2004':
        default:
            // SCORM 2004 4th Edition schema files
            return [
                'imscp_v1p1.xsd',
                'adlcp_v1p3.xsd',
                'imsss_v1p0.xsd',
                'adlseq_v1p3.xsd',
                'adlnav_v1p3.xsd',
                'lom.xsd'
            ];
    }
}
