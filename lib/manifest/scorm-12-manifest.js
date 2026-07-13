/**
 * @file scorm-12-manifest.js
 * @description Generates imsmanifest.xml for SCORM 1.2 packages.
 * 
 * SCORM 1.2 uses a simpler manifest structure without:
 * - Sequencing rules (imsss namespace)
 * - Navigation controls (adlnav namespace)
 * - 4th Edition schema references
 */

import { escapeXmlAttribute, escapeXmlText, makeXmlId } from './xml-utils.js';

/**
 * Generates the SCORM 1.2 manifest.
 * @param {Object} config - Course configuration
 * @param {string[]} files - List of files to include in the manifest
 * @returns {string} The manifest XML
 */
export function generateScorm12Manifest(config, files) {
    const resourceFiles = files.filter(f =>
        f !== 'imsmanifest.xml' &&
        !f.endsWith('.xsd') &&
        !f.endsWith('.dtd') &&
        !f.startsWith('common/')
    );

    const fileEntries = resourceFiles.map(f => `      <file href="${escapeXmlAttribute(f)}"/>`).join('\n');
    const version = escapeXmlAttribute(config.version);
    const title = escapeXmlText(config.title);
    const masteryScore = Number.isFinite(config.masteryScore)
        ? `\n        <adlcp:masteryscore>${config.masteryScore}</adlcp:masteryscore>`
        : '';

    // SCORM 1.2 uses ADLCP 1.2 schema and doesn't include sequencing
    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- SCORM 1.2 manifest - GENERATED FILE - DO NOT EDIT MANUALLY -->
<manifest identifier="${makeXmlId(config.identifier || config.title)}"
          version="${version}"
          xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="
            http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
            http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">

  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>

  <organizations default="org-1">
    <organization identifier="org-1">
      <title>${title}</title>
      <item identifier="item-1" identifierref="res-1" isvisible="true">
        <title>${title}</title>${masteryScore}
      </item>
    </organization>
  </organizations>

  <resources>
    <resource identifier="res-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
${fileEntries}
    </resource>
  </resources>
</manifest>
`;
}
