/**
 * @file cmi5-manifest.js
 * @description Generates cmi5.xml course structure file.
 * 
 * cmi5 uses a different structure than SCORM:
 * - cmi5.xml instead of imsmanifest.xml
 * - AU (Assignable Unit) definitions
 * - Launch URLs with move-on criteria
 * 
 * For cmi5-remote format, the AU URL is absolute (pointing to CDN).
 */

import { escapeXmlAttribute, escapeXmlText } from './xml-utils.js';

/**
 * Generates the cmi5 course structure XML.
 * @param {Object} config - Course configuration
 * @param {string[]} files - List of files (used for reference, not enumerated)
 * @param {Object} options - Additional options
 * @param {string} options.externalUrl - External URL for cmi5-remote format
 * @returns {string} The cmi5.xml content
 */
export function generateCmi5Manifest(config, _files, options = {}) {
  // cmi5 course identifier - use configured identifier or generate from title
  const titleSlug = String(config.title || 'course')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'course';
  const courseId = config.identifier || `urn:coursecode:${titleSlug}`;
  try {
    new URL(courseId);
  } catch {
    throw new Error(`cmi5 course identifier must be an absolute IRI: ${courseId}`);
  }

  // Package-level mastery is optional. Do not invent a value from one
  // assessment because a course can contain multiple thresholds.
  const masteryAttribute = Number.isFinite(config.masteryScore)
    ? ` masteryScore="${(config.masteryScore / 100).toFixed(2)}"`
    : '';
  const allowedMoveOn = new Set([
    'Passed', 'Completed', 'CompletedAndPassed', 'CompletedOrPassed', 'NotApplicable'
  ]);
  const moveOn = config.moveOn || (Number.isFinite(config.masteryScore) ? 'CompletedAndPassed' : 'Completed');
  if (!allowedMoveOn.has(moveOn)) {
    throw new Error(`Invalid cmi5 moveOn value: ${moveOn}`);
  }

  // AU identifier - derive from course ID
  const auId = `${courseId}/au/1`;

  // URL: absolute for cmi5-remote (use as-is), relative for standard cmi5
  let auUrl = options.externalUrl || 'index.html';
  if (options.externalUrl) {
    const parsedUrl = new URL(options.externalUrl);
    if (!/\.[A-Za-z0-9]+$/.test(parsedUrl.pathname)) {
      parsedUrl.pathname = `${parsedUrl.pathname.replace(/\/$/, '')}/index.html`;
    }
    auUrl = parsedUrl.toString();
  }
  const escapedCourseId = escapeXmlAttribute(courseId);
  const escapedAuId = escapeXmlAttribute(auId);
  const escapedLanguage = escapeXmlAttribute(config.language);
  const title = escapeXmlText(config.title);
  const description = escapeXmlText(config.description);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- cmi5 Course Structure - GENERATED FILE - DO NOT EDIT MANUALLY -->
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">

  <course id="${escapedCourseId}">
    <title>
      <langstring lang="${escapedLanguage}">${title}</langstring>
    </title>
    <description>
      <langstring lang="${escapedLanguage}">${description}</langstring>
    </description>
  </course>

  <au id="${escapedAuId}" moveOn="${escapeXmlAttribute(moveOn)}"${masteryAttribute} launchMethod="OwnWindow">
    <title>
      <langstring lang="${escapedLanguage}">${title}</langstring>
    </title>
    <description>
      <langstring lang="${escapedLanguage}">${description}</langstring>
    </description>
    <url>${escapeXmlText(auUrl)}</url>
  </au>

</courseStructure>
`;
}
