/**
 * vite-plugin-content-discovery.js - Build-time content manifest generation
 * 
 * - Injects data-edit-path attributes into slide templates during build
 * - Generates content manifest at build end
 */

import fs from 'fs';
import path from 'path';
import { parseCourse, parseElements } from './course-parser.js';

// Manifest file path (set in configResolved)
let manifestFilePath = null;
let galleryManifestFilePath = null;
let coursePath = null;

let isDevMode = false;

/**
 * Create the Vite plugin
 * @param {object} options - Plugin options
 * @returns {object} Vite plugin
 */
export default function contentDiscoveryPlugin(options = {}) {
    return {
        name: 'content-discovery',

        configResolved(config) {
            const root = config.root || process.cwd();
            const outDir = config.build?.outDir || 'dist';

            // Set paths
            coursePath = options.coursePath || path.join(root, 'course');

            manifestFilePath = path.join(root, outDir, '_content-manifest.json');
            galleryManifestFilePath = path.join(root, outDir, '_gallery-manifest.json');
            isDevMode = config.command === 'serve';

            if (isDevMode) {
                console.log('[content-discovery] Dev mode - manifest generation disabled');
            }
        },

        // Transform slide files to inject data-edit-path attributes
        transform(code, id) {
            // Only process slide files
            if (!id.includes('/slides/') || !id.endsWith('.js')) {
                return null;
            }

            // Find template literals with .innerHTML = `...`
            const pattern = /\.innerHTML\s*=\s*`/g;
            let result = code;
            let offset = 0;

            let match;
            while ((match = pattern.exec(code)) !== null) {
                const startPos = match.index + match[0].length - 1;
                const templateEnd = findTemplateEnd(code, startPos);
                if (templateEnd === -1) continue;

                const templateContent = code.slice(startPos + 1, templateEnd);
                const injectedContent = injectEditPaths(templateContent);

                if (injectedContent !== templateContent) {
                    const before = result.slice(0, startPos + 1 + offset);
                    const after = result.slice(templateEnd + offset);
                    result = before + injectedContent + after;
                    offset += injectedContent.length - templateContent.length;
                }
            }

            if (result !== code) {
                return { code: result, map: null };
            }
            return null;
        },

        async closeBundle() {
            if (isDevMode) return;

            if (!fs.existsSync(coursePath)) {
                console.warn(`[content-discovery] Course directory not found: ${coursePath}`);
                return;
            }

            console.log('[content-discovery] Generating content manifest...');

            try {
                const manifest = await parseCourse(coursePath, options);
                fs.writeFileSync(manifestFilePath, JSON.stringify(manifest, null, 2));

                const slideCount = Object.keys(manifest.slides).length;
                const assessmentCount = manifest.assessments.length;
                let interactionCount = 0;
                for (const slideData of Object.values(manifest.slides)) {
                    interactionCount += slideData.interactions?.length || 0;
                }

                console.log('[content-discovery] Generated manifest:');
                console.log(`  - ${slideCount} slides`);
                console.log(`  - ${assessmentCount} assessments`);
                console.log(`  - ${interactionCount} interactions`);
                console.log(`  → ${manifestFilePath}`);

            } catch (err) {
                console.error('[content-discovery] Error generating manifest:', err.message);
            }

            // Generate gallery manifest
            generateGalleryManifest(options.galleryConfig);
        }
    };
}

/**
 * Generate the document gallery manifest by scanning the docs directory.
 * @param {object} galleryConfig - Gallery configuration from course-config.js
 */
function generateGalleryManifest(galleryConfig) {
    if (!galleryConfig?.enabled) {
        return;
    }

    const directory = galleryConfig.directory || 'assets/docs';
    const docsDir = path.join(coursePath, directory);
    const allowedTypes = new Set(galleryConfig.fileTypes || ['pdf', 'md', 'jpg', 'png']);

    if (!fs.existsSync(docsDir)) {
        console.log(`[content-discovery] Gallery directory not found: ${docsDir}`);
        return;
    }

    const items = [];
    const files = fs.readdirSync(docsDir);

    // Build a set of thumbnail files for quick lookup
    const thumbnailFiles = new Set(
        files.filter(f => f.match(/_thumbnail\.(png|jpg|jpeg|webp)$/i))
    );

    for (const file of files) {
        // Skip hidden files, thumbnails, and non-matching types
        if (file.startsWith('.')) continue;
        if (file.match(/_thumbnail\.(png|jpg|jpeg|webp)$/i)) continue;

        const ext = path.extname(file).slice(1).toLowerCase();
        if (!allowedTypes.has(ext)) continue;

        // Determine document type
        let type;
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
            type = 'image';
        } else if (ext === 'pdf') {
            type = 'pdf';
        } else if (ext === 'md') {
            type = 'markdown';
        } else {
            type = 'file';
        }

        // Build path relative to the dist/course root
        const src = `course/${directory}/${file}`;

        // Check for companion thumbnail
        const baseName = path.basename(file, path.extname(file));
        let thumbnail = null;
        for (const thumbExt of ['png', 'jpg', 'jpeg', 'webp']) {
            const thumbFile = `${baseName}_thumbnail.${thumbExt}`;
            if (thumbnailFiles.has(thumbFile)) {
                thumbnail = `course/${directory}/${thumbFile}`;
                break;
            }
        }

        // Generate label from filename
        const label = baseName
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());

        items.push({ src, type, label, ...(thumbnail ? { thumbnail } : {}) });
    }

    // Sort alphabetically by label
    items.sort((a, b) => a.label.localeCompare(b.label));

    const manifest = { items };
    fs.writeFileSync(galleryManifestFilePath, JSON.stringify(manifest, null, 2));

    console.log(`[content-discovery] Generated gallery manifest: ${items.length} documents`);
    console.log(`  → ${galleryManifestFilePath}`);
}

/**
 * Find the end of a template literal (handles nested ${...})
 */
function findTemplateEnd(source, startPos) {
    if (source[startPos] !== '`') return -1;

    let i = startPos + 1;
    let depth = 0;

    while (i < source.length) {
        const char = source[i];
        const prevChar = i > 0 ? source[i - 1] : '';

        if (prevChar === '\\') { i++; continue; }
        if (char === '$' && source[i + 1] === '{') { depth++; i += 2; continue; }
        if (depth > 0) {
            if (char === '{') depth++;
            if (char === '}') depth--;
            i++;
            continue;
        }
        if (char === '`') {
            return i;
        }
        i++;
    }
    return -1;
}

/**
 * Inject data-edit-path attributes into HTML content
 */
// Inline elements inside text-bearing blocks (headings, paragraphs, list items)
// are formatting — part of the parent's text flow, not standalone edit targets.
// But inline elements inside layout containers (div, section) ARE standalone content.
const INLINE_TAGS = new Set([
    'span', 'strong', 'em', 'b', 'i', 'u', 'a', 'code', 'small',
    'sub', 'sup', 'mark', 'abbr', 'cite', 'q', 'time', 'var', 'kbd', 'samp'
]);
const TEXT_BLOCK_TAGS = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li',
    'td', 'th', 'dt', 'dd', 'blockquote', 'figcaption', 'summary', 'caption'
]);

function injectEditPaths(html) {
    const elements = parseElements(html);
    const elementsByPath = new Map(elements.map(el => [el.path, el]));

    // Sort by offset descending so we can inject without shifting positions
    const sortedElements = [...elements]
        .filter(el => el.startOffset !== null && el.innerEnd !== null)
        .filter(el => {
            // Skip inline elements that are formatting inside text-bearing blocks
            if (INLINE_TAGS.has(el.tag) && el.parentPath) {
                const parent = elementsByPath.get(el.parentPath);
                if (parent && TEXT_BLOCK_TAGS.has(parent.tag)) return false;
            }
            return true;
        })
        .filter(el => el.innerText) // Skip elements with no editable text content
        .filter(el => {
            // Skip elements with non-icon ${...} expressions — those are dynamic
            // and can't be meaningfully edited. iconManager.getIcon() is allowed
            // since the server reconciles rendered SVGs with source expressions.
            if (el.innerEnd === null) return true;
            const raw = html.slice(el.innerStart, el.innerEnd);
            // Extract ${...} expressions using brace balancing (handles nested braces)
            const expressions = [];
            for (let i = 0; i < raw.length; i++) {
                if (raw[i] === '$' && raw[i + 1] === '{') {
                    let depth = 1;
                    let j = i + 2;
                    while (j < raw.length && depth > 0) {
                        if (raw[j] === '{') depth++;
                        else if (raw[j] === '}') depth--;
                        j++;
                    }
                    expressions.push(raw.slice(i, j));
                    i = j - 1;
                }
            }
            if (expressions.length === 0) return true;
            return expressions.every(expr => /\bgetIcon\b/.test(expr));
        })
        .sort((a, b) => b.startOffset - a.startOffset);

    let result = html;
    for (const el of sortedElements) {
        // Find the first > after startOffset (end of opening tag)
        const tagEnd = result.indexOf('>', el.startOffset);
        if (tagEnd === -1) continue;

        // Check if already has data-edit-path
        const openingTag = result.slice(el.startOffset, tagEnd);
        if (openingTag.includes('data-edit-path')) continue;

        // Inject the attribute before the >
        const attr = ` data-edit-path="${el.path}"`;
        result = result.slice(0, tagEnd) + attr + result.slice(tagEnd);
    }

    return result;
}
