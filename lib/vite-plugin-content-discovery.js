/**
 * vite-plugin-content-discovery.js - Build-time content manifest generation
 * 
 * - Injects data-edit-path attributes into slide templates during build
 * - Generates the preview-only content manifest (development-mode builds only)
 * - Generates the learner-facing document gallery manifest
 */

import fs from 'fs';
import path from 'path';
import { parseCourse, parseElements } from './course-parser.js';
import { encodeUriPath } from './manifest/xml-utils.js';

// Manifest file path (set in configResolved)
let manifestFilePath = null;
let galleryManifestFilePath = null;
let coursePath = null;

let isDevMode = false;
let writeContentManifest = false;

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
            // The content manifest mirrors slide source (including correct answers)
            // for preview tooling, which always builds with --mode development.
            // Production/package builds must not publish it.
            writeContentManifest = options.writeContentManifest ?? config.mode === 'development';

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

            if (writeContentManifest) {
                await writeContentManifestFile(options);
            } else {
                // Never leave a stale preview manifest in a production output dir.
                fs.rmSync(manifestFilePath, { force: true });
            }

            // Generate gallery manifest
            generateGalleryManifest(options.galleryConfig);
        }
    };
}

/**
 * Parse the course and write the preview-only content manifest.
 * @param {object} options - Plugin options
 */
async function writeContentManifestFile(options) {
    console.log('[content-discovery] Generating content manifest...');

    try {
        const manifest = await parseCourse(coursePath, options);
        fs.mkdirSync(path.dirname(manifestFilePath), { recursive: true });
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

        // Build a URL relative to the dist root. Filenames are percent-encoded
        // so spaces, '#', '?', '%' and non-ASCII names resolve correctly.
        const src = encodeUriPath(`course/${directory}/${file}`);

        // Check for companion thumbnail
        const baseName = path.basename(file, path.extname(file));
        let thumbnail = null;
        for (const thumbExt of ['png', 'jpg', 'jpeg', 'webp']) {
            const thumbFile = `${baseName}_thumbnail.${thumbExt}`;
            if (thumbnailFiles.has(thumbFile)) {
                thumbnail = encodeUriPath(`course/${directory}/${thumbFile}`);
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

export function injectEditPaths(html) {
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

    const contexts = mapTemplateContexts(html);
    if (!contexts) return html; // Could not tokenize safely — leave source untouched

    // Resolve every insertion point against the original source first.
    const tagRanges = [];
    for (const el of elements) {
        if (el.startOffset === null) continue;
        const end = findOpeningTagEnd(html, el.startOffset, contexts);
        if (end !== -1) tagRanges.push([el.startOffset, end]);
    }
    // An element "found" inside another tag's attributes (e.g. title="<b>x</b>")
    // is not real markup; never inject into it.
    const insideAnotherTag = (offset) => tagRanges.some(([start, end]) => offset > start && offset < end);

    const insertions = [];
    for (const el of sortedElements) {
        // Only inject into markup that is literal template text, never into JS
        // code inside ${...} that merely looks like a tag (e.g. `a <b && c > d`).
        if (contexts[el.startOffset] < 0) continue;
        if (insideAnotherTag(el.startOffset)) continue;
        // Paths derive from class names; one taken from a dynamic class="${...}"
        // could contain quotes or `${` and would corrupt the template literal.
        if (UNSAFE_PATH_CHARS.test(el.path)) continue;

        const tagEnd = findOpeningTagEnd(html, el.startOffset, contexts);
        if (tagEnd === -1) continue;

        // Check if already has data-edit-path
        const openingTag = html.slice(el.startOffset, tagEnd);
        if (openingTag.includes('data-edit-path')) continue;

        // Insert before the closing '>' (or before '/>' for self-closing syntax)
        const insertAt = html[tagEnd - 1] === '/' && contexts[tagEnd - 1] === contexts[el.startOffset]
            ? tagEnd - 1
            : tagEnd;
        insertions.push({ insertAt, attr: ` data-edit-path="${el.path}"` });
    }

    // Apply from the end so earlier offsets stay valid
    insertions.sort((a, b) => b.insertAt - a.insertAt);
    let result = html;
    for (const { insertAt, attr } of insertions) {
        result = result.slice(0, insertAt) + attr + result.slice(insertAt);
    }

    return result;
}

const CODE_CONTEXT = -1;
const UNSAFE_PATH_CHARS = /["'`$\\<>&{}\s]/;

/**
 * Classify every character of a template literal body.
 *
 * Returns an Int32Array where each entry is the id of the template literal whose
 * literal text contains that character (0 = the outer template, >0 = a nested
 * template inside a ${...} expression), or CODE_CONTEXT for JavaScript code
 * inside ${...} (including JS strings and comments). Returns null when the
 * source cannot be tokenized with confidence (unbalanced braces/strings).
 *
 * @param {string} src - Template literal body (between the backticks)
 * @returns {Int32Array|null}
 */
function mapTemplateContexts(src) {
    const contexts = new Int32Array(src.length).fill(CODE_CONTEXT);
    const stack = [{ type: 'template', id: 0 }];
    let nextTemplateId = 1;
    let lastCodeChar = '{';
    let i = 0;

    while (i < src.length) {
        const top = stack[stack.length - 1];
        const char = src[i];

        if (top.type === 'template') {
            if (char === '\\') {
                contexts[i] = top.id;
                if (i + 1 < src.length) contexts[i + 1] = top.id;
                i += 2;
                continue;
            }
            if (char === '$' && src[i + 1] === '{') {
                stack.push({ type: 'expression' });
                lastCodeChar = '{';
                i += 2;
                continue;
            }
            if (char === '`') {
                if (stack.length === 1) return null; // Unescaped backtick in the outer template
                stack.pop();
                lastCodeChar = '`';
                i++;
                continue;
            }
            contexts[i] = top.id;
            i++;
            continue;
        }

        // JavaScript code inside ${...}
        if (char === '"' || char === "'") {
            i = skipQuotedString(src, i);
            if (i === -1) return null;
            lastCodeChar = char;
            continue;
        }
        if (char === '`') {
            stack.push({ type: 'template', id: nextTemplateId++ });
            i++;
            continue;
        }
        if (char === '/' && src[i + 1] === '/') {
            const newline = src.indexOf('\n', i);
            i = newline === -1 ? src.length : newline;
            continue;
        }
        if (char === '/' && src[i + 1] === '*') {
            const close = src.indexOf('*/', i + 2);
            if (close === -1) return null;
            i = close + 2;
            continue;
        }
        if (char === '/' && REGEX_PRECEDERS.has(lastCodeChar)) {
            i = skipRegexLiteral(src, i);
            if (i === -1) return null;
            lastCodeChar = '/';
            continue;
        }
        if (char === '{') {
            stack.push({ type: 'brace' });
        } else if (char === '}') {
            stack.pop(); // Closes a nested brace or the ${...} expression itself
        }
        if (!/\s/.test(char)) lastCodeChar = char;
        i++;
    }

    return stack.length === 1 ? contexts : null;
}

// A '/' after one of these code characters starts a regex literal, not division.
const REGEX_PRECEDERS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

/** Return the index just past a JS regex literal starting at `start`, or -1. */
function skipRegexLiteral(src, start) {
    let inClass = false;
    for (let i = start + 1; i < src.length; i++) {
        const char = src[i];
        if (char === '\\') { i++; continue; }
        if (char === '\n') return -1;
        if (inClass) {
            if (char === ']') inClass = false;
        } else if (char === '[') {
            inClass = true;
        } else if (char === '/') {
            let end = i + 1;
            while (end < src.length && /[a-z]/i.test(src[end])) end++; // flags
            return end;
        }
    }
    return -1;
}

/** Return the index just past a JS '...' or "..." string starting at `start`, or -1. */
function skipQuotedString(src, start) {
    const quote = src[start];
    for (let i = start + 1; i < src.length; i++) {
        if (src[i] === '\\') { i++; continue; }
        if (src[i] === quote) return i + 1;
        if (src[i] === '\n') return -1; // Unterminated string literal
    }
    return -1;
}

/**
 * Find the '>' that closes the opening tag starting at `start`.
 *
 * Only characters that belong to the same template text as the '<' count:
 * ${...} expressions (and any nested templates/strings within them) are
 * skipped, as are quoted attribute values. Returns -1 when no safe tag end
 * is found.
 *
 * @param {string} src - Template literal body
 * @param {number} start - Offset of '<'
 * @param {Int32Array} contexts - Result of mapTemplateContexts(src)
 * @returns {number}
 */
function findOpeningTagEnd(src, start, contexts) {
    const context = contexts[start];
    if (context < 0 || src[start] !== '<') return -1;

    let quote = null;
    let previous = '';
    for (let i = start + 1; i < src.length; i++) {
        if (contexts[i] !== context) {
            // Interpolated value — opaque to the tag scanner
            if (!quote) previous = '$';
            continue;
        }
        const char = src[i];
        if (quote) {
            if (char === quote) {
                quote = null;
                previous = char;
            }
            continue;
        }
        if ((char === '"' || char === "'") && previous === '=') {
            quote = char;
            continue;
        }
        if (char === '>') return i;
        if (char === '<') return -1; // Malformed: new tag before this one closed
        if (!/\s/.test(char)) previous = char;
    }
    return -1;
}
