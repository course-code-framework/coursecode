/**
 * manifest-parser.js - Parse SCORM imsmanifest.xml and cmi5.xml files
 * 
 * Extracts key metadata for preview export and other tools.
 */

/**
 * Parse imsmanifest.xml content and extract key fields
 * @param {string} xmlContent - Raw XML content of imsmanifest.xml
 * @returns {{ identifier: string, title: string, launchFile: string, version: string | null }}
 */
export function parseManifest(xmlContent) {
    // Extract manifest identifier
    const identifierMatch = xmlContent.match(/<manifest\s+[^>]*identifier=["']([^"']+)["']/);
    const identifier = identifierMatch ? identifierMatch[1] : 'unknown-course';

    // Extract version from manifest element
    const versionMatch = xmlContent.match(/<manifest\s+[^>]*version=["']([^"']+)["']/);
    const version = versionMatch ? versionMatch[1] : null;

    // Extract title from metadata (LOM format)
    // Look for: <lom:general><lom:title><lom:string>Title</lom:string></lom:title></lom:general>
    let title = 'SCORM Course';
    const lomTitleMatch = xmlContent.match(/<lom:title>\s*<lom:string[^>]*>([^<]+)<\/lom:string>/);
    if (lomTitleMatch) {
        title = lomTitleMatch[1].trim();
    } else {
        // Fallback: try organization title
        const orgTitleMatch = xmlContent.match(/<organization[^>]*>[\s\S]*?<title>([^<]+)<\/title>/);
        if (orgTitleMatch) {
            title = orgTitleMatch[1].trim();
        }
    }

    // Extract launch file from resource href
    // Look for: <resource ... adlcp:scormType="sco" ... href="index.html">
    let launchFile = 'index.html';
    const resourceMatch = xmlContent.match(/<resource[^>]*adlcp:scormType=["']sco["'][^>]*href=["']([^"']+)["']/);
    if (resourceMatch) {
        launchFile = resourceMatch[1];
    } else {
        // Try alternate ordering (href before scormType)
        const altMatch = xmlContent.match(/<resource[^>]*href=["']([^"']+)["'][^>]*adlcp:scormType=["']sco["']/);
        if (altMatch) {
            launchFile = altMatch[1];
        }
    }

    return {
        identifier,
        title,
        launchFile,
        version
    };
}

/**
 * Parse cmi5.xml content and extract key fields
 * @param {string} xmlContent - Raw XML content of cmi5.xml
 * @returns {{ identifier: string, title: string, launchFile: string, version: string | null }}
 */
export function parseCmi5Manifest(xmlContent) {
    // Extract course id
    const idMatch = xmlContent.match(/<course\s+id=["']([^"']+)["']/);
    const identifier = idMatch ? idMatch[1] : 'unknown-course';

    // Extract title from course > title > langstring
    let title = 'cmi5 Course';
    const titleMatch = xmlContent.match(/<course[^>]*>[\s\S]*?<title>\s*<langstring[^>]*>([^<]+)<\/langstring>/i);
    if (titleMatch) {
        title = titleMatch[1].trim();
    }

    // Extract launch URL from first AU
    let launchFile = 'index.html';
    const urlMatch = xmlContent.match(/<au[^>]*>[\s\S]*?<url>([^<]+)<\/url>/i);
    if (urlMatch) {
        launchFile = urlMatch[1].trim();
    }

    return {
        identifier,
        title,
        launchFile,
        version: null
    };
}

/**
 * Sanitize identifier for use as localStorage key
 * @param {string} identifier - Raw manifest identifier
 * @returns {string} - Safe key for localStorage
 */
export function sanitizeIdentifier(identifier) {
    return identifier.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64);
}
