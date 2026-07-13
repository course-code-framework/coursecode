/**
 * Shared LMS packaging helpers for Vite build configs.
 *
 * Supports:
 * - Standard package ZIP (scorm2004, scorm1.2, cmi5, lti)
 * - SCORM proxy package ZIPs (scorm1.2-proxy, scorm2004-proxy)
 * - cmi5 remote manifest-only ZIPs (cmi5-remote)
 */

import fs from 'fs';
import path from 'path';
import { ZipArchive } from 'archiver';
import { fileURLToPath } from 'url';
import { generateManifest } from './manifest/manifest-factory.js';

// Resolve package root for template access
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ACCESS_FILE = path.join('.coursecode', 'access-control.json');

function sanitizeTitle(title) {
    return String(title || 'course')
        .replace(/[<>:"/\\|?*]/g, '-')
        .replace(/\s+/g, '_')
        .toLowerCase();
}

function withClientCredentials(externalUrl, clientId, token) {
    if (!clientId || !token) return externalUrl;
    const url = new URL(externalUrl);
    url.searchParams.set('clientId', clientId);
    url.searchParams.set('token', token);
    return url.toString();
}

function validateExternalUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`externalUrl must be an absolute URL, received: ${value}`);
    }
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !localHttp) {
        throw new Error('externalUrl must use HTTPS (HTTP is allowed only for local development)');
    }
    if (url.hash) {
        throw new Error('externalUrl must not contain a URL fragment because launch credentials would not reach the server');
    }
    if (url.username || url.password) {
        throw new Error('externalUrl must not embed HTTP credentials');
    }
    return url;
}

function zipDirectory(sourceDir, zipFilePath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipFilePath);
        const archive = new ZipArchive({ zlib: { level: 9 } });

        output.on('close', () => resolve(archive.pointer()));
        archive.on('error', reject);
        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

export function validateExternalHostingConfig(config) {
    const isProxyFormat = config.lmsFormat.endsWith('-proxy');
    const isRemoteFormat = config.lmsFormat.endsWith('-remote');
    const isExternalFormat = isProxyFormat || isRemoteFormat;

    if (!isExternalFormat) return;

    if (!config.externalUrl) {
        throw new Error(`${config.lmsFormat} format requires 'externalUrl' in course-config.js`);
    }
    validateExternalUrl(config.externalUrl);

    if (config.accessControl?.enforcement !== 'server') {
        throw new Error(`${config.lmsFormat} requires accessControl.enforcement = 'server'. Browser-only token checks are not secure.`);
    }

    if (!config.accessControl?.clients || Object.keys(config.accessControl.clients).length === 0) {
        throw new Error(`${config.lmsFormat} requires client credentials in .coursecode/access-control.json. Run: coursecode token --add <client>`);
    }
}

/**
 * Load external-hosting credentials from a non-published, gitignored file.
 * Secrets in course-config.js are rejected because that module is bundled into
 * learner-facing JavaScript.
 */
export function loadExternalAccessConfig(rootDir, courseConfig) {
    if (courseConfig.accessControl?.clients) {
        throw new Error(
            'accessControl.clients must not be stored in course/course-config.js because it is bundled for learners. ' +
            'Move credentials with: coursecode token --add <client>'
        );
    }

    const accessFile = process.env.COURSECODE_ACCESS_FILE
        ? path.resolve(rootDir, process.env.COURSECODE_ACCESS_FILE)
        : path.join(rootDir, DEFAULT_ACCESS_FILE);

    let secrets = {};
    if (fs.existsSync(accessFile)) {
        try {
            secrets = JSON.parse(fs.readFileSync(accessFile, 'utf-8'));
        } catch (error) {
            throw new Error(`Invalid external access file ${accessFile}: ${error.message}`);
        }
    }

    return {
        enforcement: courseConfig.accessControl?.enforcement || null,
        clients: secrets.clients || {}
    };
}

/**
 * Re-stamp the lms-format meta tag in an HTML string.
 * Pure string transform — no filesystem access. Use this in cloud/serverless environments.
 * @param {string} html - The HTML string to modify
 * @param {string} format - The LMS format to stamp (e.g., 'scorm2004', 'cmi5')
 * @returns {string} The modified HTML string
 */
export function stampFormat(html, format) {
    const existingMeta = /<meta\s+name="lms-format"\s+content="[^"]*"\s*\/?>/;
    if (existingMeta.test(html)) {
        return html.replace(existingMeta, `<meta name="lms-format" content="${format}" />`);
    }
    return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n  <meta name="lms-format" content="${format}" />`
    );
}

/**
 * Re-stamp the lms-format meta tag in an index.html file on disk.
 * @param {string} htmlPath - Absolute path to the index.html to modify
 * @param {string} format - The LMS format to stamp (e.g., 'scorm2004', 'cmi5')
 */
export function stampFormatInHtml(htmlPath, format) {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    fs.writeFileSync(htmlPath, stampFormat(html, format), 'utf-8');
}

export async function createStandardPackage({ rootDir, distDir, config, outputDir }) {
    // outputDir defaults to rootDir for backward compatibility
    const targetDir = outputDir || rootDir;
    
    // Determine zip filename
    const zipFileName = `${sanitizeTitle(config.title)}_v${config.version}_${config.lmsFormat}.zip`;
    const zipFilePath = path.join(targetDir, zipFileName);

    if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
    const bytes = await zipDirectory(distDir, zipFilePath);
    const sizeInMB = (bytes / 1024 / 1024).toFixed(2);
    console.warn(`📦 Created ${zipFileName} (${sizeInMB} MB)`);
    return zipFilePath;
}

export async function createProxyPackage({ rootDir, config, clientId = null, token = null, outputDir }) {
    // outputDir defaults to rootDir for backward compatibility
    const targetDir = outputDir || rootDir;

    const suffix = clientId ? `_${clientId}` : '';
    const zipFileName = `${sanitizeTitle(config.title)}${suffix}_proxy.zip`;
    const zipFilePath = path.join(targetDir, zipFileName);
    
    // Use a temp dir inside the target dir to ensure we can move/zip easily, or system temp
    // For now, keep it in rootDir/.proxy-temp to avoid cross-device link errors, 
    // unless outputDir is provided, then use outputDir/.proxy-temp
    const tempBase = outputDir || rootDir;
    const proxyDir = path.join(tempBase, '.proxy-temp');

    if (fs.existsSync(proxyDir)) fs.rmSync(proxyDir, { recursive: true });
    fs.mkdirSync(proxyDir, { recursive: true });

    try {
        // Resolve templates from PACKAGE_ROOT, not rootDir
        const templatesDir = path.join(PACKAGE_ROOT, 'lib', 'proxy-templates');
        const externalUrl = withClientCredentials(config.externalUrl, clientId, token);

        let proxyHtml = fs.readFileSync(path.join(templatesDir, 'proxy.html'), 'utf-8');
        proxyHtml = proxyHtml.replace('{{EXTERNAL_URL_JSON}}', JSON.stringify(externalUrl));
        proxyHtml = proxyHtml.replace(
            '{{BASE_FORMAT_JSON}}',
            JSON.stringify(config.lmsFormat === 'scorm1.2-proxy' ? 'scorm1.2' : 'scorm2004')
        );
        fs.writeFileSync(path.join(proxyDir, 'proxy.html'), proxyHtml);

        fs.copyFileSync(path.join(templatesDir, 'scorm-bridge.js'), path.join(proxyDir, 'scorm-bridge.js'));
        fs.copyFileSync(path.join(PACKAGE_ROOT, 'framework', 'js', 'vendor', 'pipwerks.js'), path.join(proxyDir, 'pipwerks.js'));

        const { filename, content } = generateManifest(config.lmsFormat, config, [], { externalUrl: config.externalUrl });
        fs.writeFileSync(path.join(proxyDir, filename), content);

        const schemasDir = path.join(PACKAGE_ROOT, 'schemas');
        for (const entry of fs.readdirSync(schemasDir, { withFileTypes: true })) {
            if (entry.isFile() && /\.(?:xsd|dtd|xml)$/i.test(entry.name)) {
                fs.copyFileSync(path.join(schemasDir, entry.name), path.join(proxyDir, entry.name));
            }
        }
        fs.cpSync(path.join(schemasDir, 'common'), path.join(proxyDir, 'common'), { recursive: true });

        const required = config.lmsFormat === 'scorm1.2-proxy'
            ? ['imsmanifest.xml', 'proxy.html', 'scorm-bridge.js', 'pipwerks.js', 'imscp_rootv1p1p2.xsd', 'adlcp_rootv1p2.xsd', 'ims_xml.xsd']
            : ['imsmanifest.xml', 'proxy.html', 'scorm-bridge.js', 'pipwerks.js', 'imscp_v1p1.xsd', 'adlcp_v1p3.xsd', 'imsss_v1p0.xsd'];
        const missing = required.filter(file => !fs.existsSync(path.join(proxyDir, file)));
        if (missing.length > 0 || proxyHtml.includes('{{')) {
            throw new Error(`Proxy package validation failed: ${missing.length ? `missing ${missing.join(', ')}` : 'unresolved template placeholder'}`);
        }

        if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
        const bytes = await zipDirectory(proxyDir, zipFilePath);
        const sizeKB = (bytes / 1024).toFixed(1);
        console.warn(`📦 Created ${zipFileName} (${sizeKB} KB) - Upload to LMS`);
        console.warn(`   Course URL: ${config.externalUrl}`);
        return zipFilePath;
    } finally {
        if (fs.existsSync(proxyDir)) fs.rmSync(proxyDir, { recursive: true });
    }
}

export async function createRemotePackage({ rootDir, config, clientId = null, token = null, outputDir }) {
    // outputDir defaults to rootDir for backward compatibility
    const targetDir = outputDir || rootDir;

    const suffix = clientId ? `_${clientId}` : '';
    const zipFileName = `${sanitizeTitle(config.title)}${suffix}_cmi5-remote.zip`;
    const zipFilePath = path.join(targetDir, zipFileName);
    
    const tempBase = outputDir || rootDir;
    const remoteDir = path.join(tempBase, '.remote-temp');

    if (fs.existsSync(remoteDir)) fs.rmSync(remoteDir, { recursive: true });
    fs.mkdirSync(remoteDir, { recursive: true });

    try {
        const externalUrl = withClientCredentials(config.externalUrl, clientId, token);
        const { filename, content } = generateManifest(config.lmsFormat, config, [], { externalUrl });
        fs.writeFileSync(path.join(remoteDir, filename), content);

        if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
        const bytes = await zipDirectory(remoteDir, zipFilePath);
        const sizeKB = (bytes / 1024).toFixed(1);
        console.warn(`📦 Created ${zipFileName} (${sizeKB} KB) - Upload to LMS`);
        const auUrl = content.match(/<url>([^<]+)<\/url>/)?.[1] || externalUrl;
        console.warn(`   AU URL points to: ${auUrl}`);
        return zipFilePath;
    } finally {
        if (fs.existsSync(remoteDir)) fs.rmSync(remoteDir, { recursive: true });
    }
}

export async function createExternalPackagesForClients({ rootDir, config, outputDir }) {
    validateExternalHostingConfig(config);

    const entries = Object.entries(config.accessControl.clients);
    const isProxyFormat = config.lmsFormat.endsWith('-proxy');
    const isRemoteFormat = config.lmsFormat.endsWith('-remote');

    for (const [clientId, clientConfig] of entries) {
        if (isProxyFormat) {
            await createProxyPackage({ rootDir, config, clientId, token: clientConfig.token, outputDir });
        } else if (isRemoteFormat) {
            await createRemotePackage({ rootDir, config, clientId, token: clientConfig.token, outputDir });
        }
    }
}
