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
import archiver from 'archiver';
import { fileURLToPath } from 'url';
import { generateManifest } from './manifest/manifest-factory.js';

// Resolve package root for template access
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');

function sanitizeTitle(title) {
    return String(title || 'course')
        .replace(/[<>:"/\\|?*]/g, '-')
        .replace(/\s+/g, '_')
        .toLowerCase();
}

function withClientCredentials(externalUrl, clientId, token) {
    if (!clientId || !token) return externalUrl;
    const separator = externalUrl.includes('?') ? '&' : '?';
    return `${externalUrl}${separator}clientId=${encodeURIComponent(clientId)}&token=${encodeURIComponent(token)}`;
}

function zipDirectory(sourceDir, zipFilePath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

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

    if (!config.accessControl?.clients || Object.keys(config.accessControl.clients).length === 0) {
        throw new Error(`${config.lmsFormat} format requires 'accessControl.clients' in course-config.js. Use 'coursecode token --add <client>' to add clients.`);
    }
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
        proxyHtml = proxyHtml.replace('{{EXTERNAL_URL}}', externalUrl);
        fs.writeFileSync(path.join(proxyDir, 'proxy.html'), proxyHtml);

        fs.copyFileSync(path.join(templatesDir, 'scorm-bridge.js'), path.join(proxyDir, 'scorm-bridge.js'));
        fs.copyFileSync(path.join(PACKAGE_ROOT, 'framework', 'js', 'vendor', 'pipwerks.js'), path.join(proxyDir, 'pipwerks.js'));

        const { filename, content } = generateManifest(config.lmsFormat, config, [], { externalUrl: config.externalUrl });
        fs.writeFileSync(path.join(proxyDir, filename), content);

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
        console.warn(`   AU URL points to: ${externalUrl.replace(/\/$/, '')}/index.html`);
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
