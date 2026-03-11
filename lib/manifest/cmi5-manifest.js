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
  const courseId = config.identifier ||
    `urn:coursecode:${config.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;

  // Calculate mastery score from passing percentage (convert percentage to 0-1 scale)
  const masteryScore = config.passingScore ? (config.passingScore / 100).toFixed(2) : '0.8';

  // AU identifier - derive from course ID
  const auId = `${courseId}/au/1`;

  // URL: absolute for cmi5-remote (use as-is), relative for standard cmi5
  const auUrl = options.externalUrl || 'index.html';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- cmi5 Course Structure - GENERATED FILE - DO NOT EDIT MANUALLY -->
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">

  <course id="${courseId}">
    <title>
      <langstring lang="${config.language}">${config.title}</langstring>
    </title>
    <description>
      <langstring lang="${config.language}">${config.description}</langstring>
    </description>
  </course>

  <au id="${auId}" moveOn="Completed" masteryScore="${masteryScore}" launchMethod="OwnWindow">
    <title>
      <langstring lang="${config.language}">${config.title}</langstring>
    </title>
    <description>
      <langstring lang="${config.language}">${config.description}</langstring>
    </description>
    <url>${auUrl}</url>
  </au>

</courseStructure>
`;
}

