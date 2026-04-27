/**
 * Authoring API for CourseCode
 * 
 * Provides file-system based utilities for AI-assisted course authoring.
 * These methods work without a running preview server.
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { spawn } from 'child_process';
import postcss from 'postcss';
import {
    getAllComponentSchemas,
    getAllComponentMetadata,
    getRegisteredComponentTypes,
    getAllSchemas,
    getAllMetadata,
    getRegisteredTypes,
    getAllIcons
} from './schema-extractor.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __packageRoot = path.dirname(__dirname); // lib/ -> repo root

/**
 * Get the course root directory (where course/ folder is).
 * Tries process.cwd() first (normal for course projects),
 * then falls back to package root (framework repo / global install).
 */
function getCourseRoot() {
    // Check cwd first (course projects run from their own root)
    if (fs.existsSync(path.join(process.cwd(), 'course'))) {
        return process.cwd();
    }
    if (fs.existsSync(path.join(process.cwd(), 'template', 'course'))) {
        return path.join(process.cwd(), 'template');
    }
    // Fallback: resolve from package root (framework repo launched by IDE)
    if (fs.existsSync(path.join(__packageRoot, 'course'))) {
        return __packageRoot;
    }
    if (fs.existsSync(path.join(__packageRoot, 'template', 'course'))) {
        return path.join(__packageRoot, 'template');
    }
    throw new Error('No course directory found. Run from a CourseCode project root.');
}

/**
 * Get the framework root directory.
 * Tries process.cwd() first, then falls back to package root.
 */
function getFrameworkRoot() {
    const cwd = process.cwd();
    if (fs.existsSync(path.join(cwd, 'framework'))) {
        return cwd;
    }
    const parent = path.dirname(cwd);
    if (fs.existsSync(path.join(parent, 'framework'))) {
        return parent;
    }
    // Fallback: package root
    if (fs.existsSync(path.join(__packageRoot, 'framework'))) {
        return __packageRoot;
    }
    throw new Error('Framework directory not found.');
}

/**
 * List files in a directory (non-recursive)
 */
function listFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => {
        const stat = fs.statSync(path.join(dir, f));
        return stat.isFile();
    });
}

/**
 * Get status of reference files and their conversions
 */
export function getRefsStatus() {
    const courseRoot = getCourseRoot();
    const refsDir = path.join(courseRoot, 'course', 'references');
    const mdDir = path.join(refsDir, 'converted');
    
    const rawFiles = listFiles(refsDir).filter(f => 
        !f.startsWith('.') && 
        ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.md'].some(ext => f.toLowerCase().endsWith(ext))
    );
    
    const convertedFiles = listFiles(mdDir).filter(f => f.endsWith('.md'));
    
    // Find files that need conversion (have raw but no corresponding md)
    const convertedBases = new Set(convertedFiles.map(f => path.parse(f).name.toLowerCase()));
    const needsConversion = rawFiles.filter(f => {
        const base = path.parse(f).name.toLowerCase();
        return !convertedBases.has(base);
    });
    
    return {
        refsDirectory: refsDir,
        convertedDirectory: mdDir,
        raw: rawFiles,
        converted: convertedFiles,
        needsConversion,
        convertCommand: 'coursecode convert',
        isEmpty: rawFiles.length === 0 && convertedFiles.length === 0,
        message: rawFiles.length === 0 
            ? 'No reference files found. Add PDFs, Word docs, PowerPoints, or Markdown files to course/references/'
            : needsConversion.length > 0 
                ? `${needsConversion.length} file(s) need conversion. Run: coursecode convert`
                : `All ${rawFiles.length} reference file(s) converted.`
    };
}

/**
 * Get context for outline creation stage
 */
export function getOutlineContext() {
    const courseRoot = getCourseRoot();
    const frameworkRoot = getFrameworkRoot();
    const mdDir = path.join(courseRoot, 'course', 'references', 'converted');
    
    const referenceMds = listFiles(mdDir).filter(f => f.endsWith('.md'));
    const outlinePath = path.join(courseRoot, 'course', 'COURSE_OUTLINE.md');
    
    return {
        outlineGuide: path.join(frameworkRoot, 'framework', 'docs', 'COURSE_OUTLINE_GUIDE.md'),
        outlineTemplate: path.join(frameworkRoot, 'framework', 'docs', 'COURSE_OUTLINE_TEMPLATE.md'),
        referenceMds: referenceMds.map(f => path.join(mdDir, f)),
        existingOutline: fs.existsSync(outlinePath) ? outlinePath : null,
        outlineLocation: outlinePath,
        message: fs.existsSync(outlinePath)
            ? 'Existing outline found. Review and iterate, or start fresh.'
            : 'No outline yet. Use the template and guide to create one at course/COURSE_OUTLINE.md'
    };
}

/**
 * Get context for course building stage
 */
export function getAuthoringContext() {
    const courseRoot = getCourseRoot();
    const frameworkRoot = getFrameworkRoot();
    const mdDir = path.join(courseRoot, 'course', 'references', 'converted');
    const slidesDir = path.join(courseRoot, 'course', 'slides');
    
    const referenceMds = listFiles(mdDir).filter(f => f.endsWith('.md'));
    const existingSlides = listFiles(slidesDir).filter(f => f.endsWith('.js'));
    const outlinePath = path.join(courseRoot, 'course', 'COURSE_OUTLINE.md');
    
    return {
        authoringGuide: path.join(frameworkRoot, 'framework', 'docs', 'COURSE_AUTHORING_GUIDE.md'),
        courseOutline: fs.existsSync(outlinePath) ? outlinePath : null,
        referenceMds: referenceMds.map(f => path.join(mdDir, f)),
        existingSlides: existingSlides.map(f => path.join(slidesDir, f)),
        courseConfig: path.join(courseRoot, 'course', 'course-config.js'),
        slidesDirectory: slidesDir,
        message: !fs.existsSync(outlinePath)
            ? 'Warning: No outline found. Create one first with getOutlineContext().'
            : `Ready to build. ${existingSlides.length} existing slide(s) in course/slides/`
    };
}

/**
 * Dynamic CSS catalog — extracts structured class data from real CSS files via PostCSS.
 * Token values (spacing, font sizes, etc.) are resolved from design-tokens.css so
 * AI sees actual values like "1rem" instead of opaque "var(--space-4)".
 * 
 * Category names are derived from file paths relative to framework/css/:
 *   utilities/borders.css → "utilities/borders"
 *   02-layout.css → "layout"
 *   components/hero.css → "components/hero"
 */

// Module-level caches — parsed once per process
let _cssCatalogCache = null;
let _tokenMapCache = null;

/**
 * Parse design-tokens.css and resolve var() chains to final values.
 * Returns a map of --variable-name → resolved-value.
 */
function buildTokenMap() {
    if (_tokenMapCache) return _tokenMapCache;

    const frameworkRoot = getFrameworkRoot();
    const tokensFile = path.join(frameworkRoot, 'framework', 'css', 'design-tokens.css');

    if (!fs.existsSync(tokensFile)) {
        _tokenMapCache = {};
        return _tokenMapCache;
    }

    const source = fs.readFileSync(tokensFile, 'utf-8');
    const root = postcss.parse(source);
    const tokens = {};

    // Extract all custom properties from :root blocks
    root.walk(node => {
        if (node.type === 'decl' && node.prop.startsWith('--')) {
            tokens[node.prop] = node.value.trim();
        }
    });

    // Resolve var() chains iteratively (handles --space-4 → --space-4-base → 0.25rem)
    for (let i = 0; i < 10; i++) {
        let changed = false;
        for (const [prop, value] of Object.entries(tokens)) {
            const resolved = value.replace(/var\(\s*([^,)]+)\s*\)/g, (match, varName) => {
                const trimmed = varName.trim();
                if (tokens[trimmed] && !tokens[trimmed].includes('var(')) {
                    changed = true;
                    return tokens[trimmed];
                }
                return match;
            });
            tokens[prop] = resolved;
        }
        if (!changed) break;
    }

    _tokenMapCache = tokens;
    return _tokenMapCache;
}

/**
 * Replace var() references in a CSS value with resolved token values.
 * Only resolves structural tokens (spacing, sizes, radii). Color tokens are
 * left as var() references since semantic names like var(--bg-elevated) are
 * more useful to AI than theme-dependent hex values like #1e293b.
 */
function resolveVarRefs(value, tokenMap) {
    return value.replace(/var\(\s*([^,)]+?)(?:\s*,\s*([^)]+))?\s*\)/g, (_match, varName, fallback) => {
        const resolved = tokenMap[varName.trim()];
        if (resolved && !resolved.includes('var(')) {
            // Skip color values — semantic variable names are more useful
            if (/^#|^rgba?\(|^hsla?\(|^color-mix\(|^oklch\(/.test(resolved)) {
                return _match;
            }
            return resolved;
        }
        if (fallback) return fallback.trim();
        return _match;
    });
}

function buildCssCatalog() {
    if (_cssCatalogCache) return _cssCatalogCache;

    const frameworkRoot = getFrameworkRoot();
    const cssDir = path.join(frameworkRoot, 'framework', 'css');
    const cssFiles = [];

    if (fs.existsSync(cssDir)) {
        collectCssFiles(cssDir, cssFiles);
    }

    // Also include course CSS
    try {
        const courseRoot = getCourseRoot();
        const courseDir = path.join(courseRoot, 'course');
        const themeFile = path.join(courseDir, 'theme.css');
        if (fs.existsSync(themeFile)) cssFiles.push(themeFile);
        const customDir = path.join(courseDir, 'components');
        if (fs.existsSync(customDir)) collectCssFiles(customDir, cssFiles);
    } catch {
        // No course directory — framework-only mode
    }

    // Resolve design tokens so declarations show real values
    const tokenMap = buildTokenMap();

    const categories = {};
    let totalClasses = 0;

    for (const file of cssFiles) {
        const relPath = path.relative(cssDir, file);
        // Derive category: "utilities/borders.css" → "utilities/borders", "02-layout.css" → "layout"
        const category = relPath
            .replace(/\.css$/, '')
            .replace(/^\d+-/, ''); // Strip leading number prefixes like "01-", "02-"

        try {
            const source = fs.readFileSync(file, 'utf-8');
            const root = postcss.parse(source, { from: file });
            const classes = {};

            extractClassCatalog(root, classes, tokenMap);

            if (Object.keys(classes).length > 0) {
                categories[category] = {
                    file: relPath,
                    classes
                };
                totalClasses += Object.keys(classes).length;
            }
        } catch {
            // Skip unparseable CSS
        }
    }

    _cssCatalogCache = { categories, totalClasses };
    return _cssCatalogCache;
}

/**
 * Extract class names with abbreviated declarations from PostCSS nodes.
 * Walks the AST and builds { className: "shortDescription" } entries.
 * Token values are resolved so AI sees "1rem" instead of "var(--space-4)".
 */
function extractClassCatalog(node, classes, tokenMap) {
    if (node.type === 'rule' && node.selector) {
        // Only process simple class selectors (e.g., .foo, .foo-bar)
        // Skip compound selectors, pseudo-classes, nested selectors
        const selectorParts = node.selector.split(',').map(s => s.trim());

        for (const part of selectorParts) {
            // Match standalone class selectors like ".foo" or ".foo-bar"
            // Skip selectors with spaces, combinators, pseudo-classes, attribute selectors
            const simpleClassMatch = part.match(/^\.([a-zA-Z][\w-]*)$/);
            if (!simpleClassMatch) continue;

            const className = simpleClassMatch[1];
            if (classes[className]) continue; // Already captured

            // Build short description from declarations, resolving token values
            const decls = [];
            node.walk(child => {
                if (child.type === 'decl') {
                    const resolved = resolveVarRefs(`${child.prop}: ${child.value}`, tokenMap);
                    decls.push(resolved);
                }
            });

            // Abbreviate: show first 2 declarations, truncate long values
            const shortDecls = decls.slice(0, 2).map(d =>
                d.length > 60 ? d.slice(0, 57) + '...' : d
            );
            if (decls.length > 2) shortDecls.push(`+${decls.length - 2} more`);

            classes[className] = shortDecls.join('; ');
        }
    }

    // Recurse into @media, @supports, etc.
    if (node.nodes) {
        for (const child of node.nodes) {
            extractClassCatalog(child, classes, tokenMap);
        }
    }
}

// Internal categories — framework-managed CSS that authors don't write manually.
// Filtered from TOC and search by default; always accessible via direct category drill-in.
const INTERNAL_CATEGORY_PREFIXES = ['interactions/'];
const INTERNAL_CATEGORIES = new Set([
    'accessibility',
    'components/assessments',
    'components/audio-player',
    'components/document-gallery',
    'components/embed-frame',
    'components/engagement',
    'components/footer',
    'components/notifications',
    'components/sidebar',
    'components/spinner',
]);

function isInternalCategory(category) {
    if (INTERNAL_CATEGORY_PREFIXES.some(p => category.startsWith(p))) return true;
    return INTERNAL_CATEGORIES.has(category);
}

// Brief descriptions for each author-facing category.
// Shown in TOC mode so AI can navigate without drilling into every category.
const CATEGORY_HINTS = {
    'layout': 'Columns, splits, stacks, content widths (columns-*, split-*, content-*)',
    'utilities/spacing': 'Margin (m-*), padding (p-*), gap (gap-*)',
    'utilities/colors': 'Text (text-*) and background (bg-*) colors',
    'utilities/typography': 'Font size, weight, line-height, alignment (text-sm, font-bold)',
    'utilities/display': 'Display mode, overflow, position (d-flex, d-grid, d-none)',
    'utilities/flexbox': 'Flex direction, alignment, wrapping, gap (flex-row, justify-center)',
    'utilities/grid': 'CSS Grid columns, rows, spans',
    'utilities/borders': 'Border width, radius, style (rounded-*, border-*)',
    'utilities/animations': 'Transitions, entrance animations (fade-in, slide-up)',
    'utilities/lists': 'List type, spacing, marker styles',
    'utilities/visibility': 'Show/hide, opacity (visible, hidden, sr-only)',
    'utilities/icons': 'Icon sizing, colors, alignment in text (icon-sm, icon-primary)',
    'utilities/decorative': 'Dividers, gradients, shadows, overlays',
    'utilities/tables': 'Table layout and cell utilities',
    'utilities/container': 'Container width constraints',
    'utilities/accessibility-utils': 'Screen reader, focus, skip-link helpers',
    'components/cards': 'Card containers with headers, bodies, footers (card, card-*)',
    'components/callouts': 'Info/warning/tip/danger callout boxes (callout, callout-*)',
    'components/hero': 'Full-width hero banner sections',
    'components/images': 'Image sizing, grids, rounded, shadow, captions (image-*)',
    'components/tables': 'Table striping, borders, hover, compact variants',
    'components/badges': 'Inline badge/label indicators (badge, badge-*)',
    'components/buttons': 'Button variants and sizes (btn, btn-*)',
    'components/tabs': 'Tab list and panel styling',
    'components/accordions': 'Accordion panel structure and states',
    'components/carousel': 'Carousel slide navigation',
    'components/breadcrumbs': 'Breadcrumb path navigation',
    'components/modals': 'Modal dialog overlays',
    'components/tooltip': 'Hover tooltip styling',
    'components/flip-cards': 'Front/back flip card containers',
    'components/slide-header': 'Slide title and subtitle styling',
    'components/forms': 'Form inputs, labels, validation',
    'components/toggle': 'Toggle switch controls',
    'components/checkbox-group': 'Grouped checkbox layouts',
    'components/dropdown': 'Dropdown select menus',
    'components/collapse': 'Collapsible content panels',
    'components/lightbox': 'Fullscreen image viewer',
    'components/video-player': 'Embedded video player',
};

/**
 * Get CSS catalog — three access modes:
 * 1. No args: compact TOC (category names + class counts)
 * 2. category: full class list with declarations for one category
 * 3. search: find classes by name across all categories
 * 
 * Internal categories (interactions, accessibility, app shell) are hidden by default.
 * Set includeInternal: true to show them in TOC and search.
 * Direct category access always works regardless of includeInternal.
 * 
 * @param {Object} [options]
 * @param {string} [options.category] - Return full detail for this category
 * @param {string} [options.search] - Search class names (substring match)
 * @param {boolean} [options.includeInternal] - Include framework-internal categories (default: false)
 */
export function getCssCatalog({ category, search, includeInternal = false } = {}) {
    const catalog = buildCssCatalog();

    // Mode: Category detail — always works, even for internal categories
    if (category) {
        const cat = catalog.categories[category];
        if (!cat) {
            const available = Object.keys(catalog.categories)
                .filter(c => includeInternal || !isInternalCategory(c))
                .sort();
            return {
                error: `Unknown category: '${category}'`,
                available
            };
        }
        return { category, ...cat };
    }

    // Mode: Search — case-insensitive substring match on class names
    if (search) {
        const query = search.toLowerCase();
        const results = [];
        for (const [cat, data] of Object.entries(catalog.categories)) {
            if (!includeInternal && isInternalCategory(cat)) continue;
            for (const [cls, declarations] of Object.entries(data.classes)) {
                if (cls.toLowerCase().includes(query)) {
                    results.push({ class: cls, category: cat, declarations });
                }
            }
        }
        const capped = results.length > 50;
        return {
            query: search,
            results: results.slice(0, 50),
            count: results.length,
            capped,
            message: capped
                ? `Showing 50 of ${results.length} matches. Narrow your search or use 'category' to browse.`
                : `${results.length} classes matching '${search}'.`
        };
    }

    // Mode: TOC — category names, class counts, and hints
    const categories = {};
    let totalClasses = 0;
    let filteredClasses = 0;
    for (const [cat, data] of Object.entries(catalog.categories)) {
        const count = Object.keys(data.classes).length;
        if (!includeInternal && isInternalCategory(cat)) {
            filteredClasses += count;
            continue;
        }
        const entry = { count };
        if (CATEGORY_HINTS[cat]) entry.hint = CATEGORY_HINTS[cat];
        categories[cat] = entry;
        totalClasses += count;
    }

    return {
        categories,
        totalClasses,
        categoryCount: Object.keys(categories).length,
        message: `${totalClasses} CSS classes across ${Object.keys(categories).length} categories. Use 'category' for full class list or 'search' to find classes by name.`
            + (filteredClasses > 0 ? ` (${filteredClasses} internal classes hidden — use includeInternal: true to show)` : '')
    };
}

/**
 * Get export options and commands
 */
export function getExportOptions() {
    return {
        formats: ['cmi5', 'scorm2004', 'scorm1.2', 'lti'],
        defaultFormat: 'cmi5',
        commands: {
            cmi5: 'coursecode build --format cmi5',
            scorm2004: 'coursecode build --format scorm2004',
            'scorm1.2': 'coursecode build --format scorm1.2',
            lti: 'coursecode build --format lti',
            preview: 'coursecode build --preview',
            previewWithPassword: 'coursecode build --preview --password "your-password"'
        },
        outputDir: 'dist/',
        message: 'Use cmi5 (default) for modern LMS, scorm1.2 for legacy, lti for LTI 1.3 platforms.'
    };
}

/**
 * Get preview server status (checks if running)
 */
export async function getPreviewStatus(port = 4173) {
    const url = `http://localhost:${port}`;
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        
        const response = await fetch(url, { 
            signal: controller.signal,
            method: 'HEAD'
        });
        
        clearTimeout(timeout);
        
        return {
            running: response.ok,
            url,
            port,
            startCommand: 'coursecode preview',
            message: response.ok 
                ? `Preview running at ${url}`
                : 'Preview server not responding.'
        };
    } catch (_error) {
        return {
            running: false,
            url,
            port,
            startCommand: 'coursecode preview',
            message: 'Preview server not running. Start with: coursecode preview'
        };
    }
}


// =============================================================================
// CATALOG & VALIDATION TOOLS (MCP-facing)
// =============================================================================

/**
 * Get UI components — compact list or full detail for one type.
 * Uses schema-extractor.js — works at build time, no preview needed.
 * @param {string} [filterType] - If provided, return full detail for this type only
 */
export function getComponentCatalog(filterType) {
    const schemas = getAllComponentSchemas();
    const metadata = getAllComponentMetadata();
    const registeredTypes = getRegisteredComponentTypes();

    // Full detail for a specific type
    if (filterType) {
        const type = filterType;
        if (!registeredTypes.includes(type)) {
            return { error: `Unknown component type: '${type}'`, available: registeredTypes };
        }
        const schema = schemas[type] || {};
        const meta = metadata[type] || {};

        let usage = `<div data-component="${type}">...</div>`;
        if (schema.structure?.children) {
            const childExamples = Object.entries(schema.structure.children)
                .map(([name, def]) => `  ${def.selector ? `<div class="${name}">...</div>` : `<!-- ${name} -->`}`)
                .join('\n');
            usage = `<div data-component="${type}">\n${childExamples}\n</div>`;
        }

        return { type, schema, metadata: meta, usage, example: schema.example || null, engagementTracking: meta.engagementTracking || null };
    }

    // Compact list — names, descriptions, and engagement tracking only
    const components = {};
    for (const type of registeredTypes) {
        const meta = metadata[type] || {};
        const sch = schemas[type] || {};
        components[type] = {
            description: sch.description || null,
            engagementTracking: meta.engagementTracking || null
        };
    }

    return {
        components,
        count: Object.keys(components).length,
        message: `${Object.keys(components).length} registered UI components. Pass 'type' for full schema and usage.`
    };
}

/**
 * Get interaction types — compact list or full detail for one type.
 * Uses schema-extractor.js — works at build time, no preview needed.
 * @param {string} [filterType] - If provided, return full detail for this type only
 */
export function getInteractionCatalog(filterType) {
    const schemas = getAllSchemas();
    const metadata = getAllMetadata();
    const registeredTypes = getRegisteredTypes();

    // Full detail for a specific type
    if (filterType) {
        const type = filterType;
        if (!registeredTypes.includes(type)) {
            return { error: `Unknown interaction type: '${type}'`, available: registeredTypes };
        }
        const schema = schemas[type] || {};
        return {
            type,
            schema,
            metadata: metadata[type] || null,
            example: schema.example || null
        };
    }

    // Compact list — names and descriptions only
    const interactions = {};
    for (const type of registeredTypes) {
        const sch = schemas[type] || {};
        interactions[type] = {
            description: sch.description || null
        };
    }

    return {
        interactions,
        count: Object.keys(interactions).length,
        message: `${Object.keys(interactions).length} registered interaction types. Pass 'type' for full schema.`
    };
}

/**
 * Get icon catalog — compact list or detail for one icon.
 * Uses schema-extractor.js — works at build time, no preview needed.
 * @param {string} [filterName] - If provided, return detail for this icon name
 */
export function getIconCatalog(filterName) {
    const allIcons = getAllIcons();
    const names = Object.keys(allIcons);

    // Detail for a specific icon
    if (filterName) {
        const icon = allIcons[filterName];
        if (!icon) {
            return { error: `Unknown icon: '${filterName}'`, available: names };
        }
        return {
            name: filterName,
            category: icon.category,
            source: icon.source,
            svg: icon.svg,
            usage: {
                js: `iconManager.getIcon('${filterName}', { size: 'md' })`,
                config: `icon: '${filterName}'`,
                html: `<span class="icon-text">\n  \${iconManager.getIcon('${filterName}', { size: 'md', class: 'icon-primary' })}\n  <span>Label</span>\n</span>`
            },
            sizes: 'xs (12px) | sm (16px) | md (20px) | lg (24px) | xl (32px) | 2xl (48px) | 3xl (64px)'
        };
    }

    // Compact list grouped by category
    const byCategory = {};
    for (const [name, info] of Object.entries(allIcons)) {
        const cat = info.category;
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(name);
    }

    return {
        icons: byCategory,
        count: names.length,
        usage: {
            js: "iconManager.getIcon('icon-name', { size: 'md' })",
            config: "icon: 'icon-name'",
            sizes: 'xs | sm | md | lg | xl | 2xl | 3xl'
        },
        message: `${names.length} icons across ${Object.keys(byCategory).length} categories. Pass 'name' for SVG content and usage.`
    };
}

/**
 * CSS index — imported from standalone module (avoids circular dependency with build-linter.js).
 */
import { getValidCssClasses, collectCssFiles } from './css-index.js';
export { getValidCssClasses };


/**
 * Run the build-time linter and return structured results.
 * 
 * Spawns a fresh Node process to avoid ESM module caching — ensures the linter
 * always uses the latest code from disk (build-linter.js, course-parser.js,
 * schema-extractor.js, validation-rules.js, etc.).
 * 
 * Post-processing (structured parsing, CSS suggestions) runs in-process since
 * it only depends on CSS files which are read fresh from disk by PostCSS.
 */
export async function lintCourse() {
    try {
        const courseRoot = getCourseRoot();
        const coursePath = path.join(courseRoot, 'course');
        const configPath = path.join(coursePath, 'course-config.js');

        if (!fs.existsSync(configPath)) {
            return { error: 'No course-config.js found', errors: [], warnings: [], passed: false };
        }

        // Resolve paths for the child process
        const linterPath = pathToFileURL(path.resolve(path.join(__dirname, 'build-linter.js'))).href;
        const absConfigPath = pathToFileURL(path.resolve(configPath)).href;
        const absCoursePath = path.resolve(coursePath);

        // Inline script for the child process — loads everything fresh
        const script = `
            const configModule = await import('${absConfigPath}');
            const config = configModule.default || configModule.courseConfig;
            if (!config) { console.log(JSON.stringify({ error: 'no-config' })); process.exit(0); }
            const { lintCourse } = await import('${linterPath}');
            const result = await lintCourse(config, '${absCoursePath.replace(/\\/g, '\\\\')}');
            console.log(JSON.stringify(result));
        `;

        // Spawn fresh Node process — zero ESM cache
        const { errors, warnings } = await new Promise((resolve, reject) => {
            const child = spawn('node', ['--input-type=module', '-e', script], {
                cwd: courseRoot,
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: false
            });

            // Kill child if it hangs (10s timeout — lint typically completes in ~1-2s)
            const timeout = setTimeout(() => {
                child.kill('SIGKILL');
                reject(new Error('Lint process timed out after 10s'));
            }, 10000);

            let stdout = '';
            let stderr = '';
            child.stdout.on('data', d => { stdout += d; });
            child.stderr.on('data', d => { stderr += d; });

            child.on('close', (code) => {
                clearTimeout(timeout);
                if (code !== 0 && !stdout.trim()) {
                    reject(new Error(stderr.trim() || `Lint process exited with code ${code}`));
                    return;
                }
                try {
                    const result = JSON.parse(stdout.trim());
                    if (result.error === 'no-config') {
                        reject(new Error('course-config.js does not export courseConfig'));
                        return;
                    }
                    resolve(result);
                } catch {
                    reject(new Error(`Failed to parse lint output: ${stdout.slice(0, 200)}`));
                }
            });

            child.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });

        // Parse string results into structured objects
        const structuredErrors = errors.map(msg => parseLintMessage(msg, 'error'));
        const structuredWarnings = warnings.map(msg => parseLintMessage(msg, 'warning'));

        // Add CSS class suggestions to relevant warnings
        const validCss = getValidCssClasses();
        for (const warning of structuredWarnings) {
            if (warning.rule === 'undefined-css-class' && warning.class) {
                warning.suggestion = suggestCssFix(warning.class, validCss);
            }
        }

        return {
            errors: structuredErrors,
            warnings: structuredWarnings,
            errorCount: structuredErrors.length,
            warningCount: structuredWarnings.length,
            passed: structuredErrors.length === 0,
            message: structuredErrors.length === 0
                ? (structuredWarnings.length > 0 ? `Passed with ${structuredWarnings.length} warning(s).` : 'All checks passed.')
                : `${structuredErrors.length} error(s) found.`
        };
    } catch (error) {
        return {
            error: error.message,
            errors: [{ rule: 'lint-failure', message: error.message, severity: 'error' }],
            warnings: [],
            passed: false
        };
    }
}

/**
 * Parse a lint message string into a structured object.
 * Input format: 'Slide "slide-id": message text'
 */
function parseLintMessage(msg, severity) {
    const slideMatch = msg.match(/^Slide "([^"]+)": (.+)$/);
    const result = {
        severity,
        message: msg,
        slideId: slideMatch ? slideMatch[1] : null,
        detail: slideMatch ? slideMatch[2] : msg,
        rule: classifyLintRule(msg)
    };

    // Extract class name if it's a CSS class warning
    const classMatch = msg.match(/CSS class "([^"]+)"/);
    if (classMatch) result.class = classMatch[1];

    return result;
}

/**
 * Classify a lint message into a rule category.
 */
function classifyLintRule(msg) {
    if (msg.includes('CSS class')) return 'undefined-css-class';
    if (msg.includes('unknown component type')) return 'unknown-component';
    if (msg.includes('requirement but no')) return 'requirement-missing-component';
    if (msg.includes('should match filename')) return 'slide-id-filename-mismatch';
    if (msg.includes('non-existent file')) return 'missing-slide-file';
    if (msg.includes('Assessment ID mismatch')) return 'assessment-id-mismatch';
    if (msg.includes('gating')) return 'invalid-gating';
    if (msg.includes('interaction')) return 'interaction-config';
    return 'general';
}

/**
 * Suggest a fix for an undefined CSS class.
 * Checks if a matching data-component value exists.
 */
function suggestCssFix(className, validCss) {
    // Check if removing "pattern-" prefix yields a valid data-component
    if (className.startsWith('pattern-')) {
        const componentName = className.replace('pattern-', '');
        if (validCss.dataComponents.includes(componentName)) {
            return `Replace class="${className}" with data-component="${componentName}"`;
        }
    }

    // Check for close matches (simple Levenshtein-like)
    const closeMatches = validCss.classes.filter(cls => {
        if (Math.abs(cls.length - className.length) > 2) return false;
        let diff = 0;
        for (let i = 0; i < Math.max(cls.length, className.length); i++) {
            if (cls[i] !== className[i]) diff++;
            if (diff > 2) return false;
        }
        return diff > 0 && diff <= 2;
    });

    if (closeMatches.length > 0) {
        return `Did you mean: ${closeMatches.slice(0, 3).join(', ')}?`;
    }

    return null;
}

// =============================================================================
// WORKFLOW STATUS & BUILD TOOLS
// =============================================================================

/**
 * Detect the current authoring stage by inspecting the filesystem.
 * Returns the inferred stage, a checklist of what exists, and recommended next action.
 * 
 * Stages:
 * 1. Source Ingestion - convert reference docs to markdown
 * 2. Outline Creation - create COURSE_OUTLINE.md from references
 * 3. Course Building - build slides and course config
 * 4. Preview & Polish - iterate on visual quality  
 * 5. Export Ready - course passes lint, ready to deploy
 */
export async function getWorkflowStatus(port = 4173) {
    let courseRoot;
    try {
        courseRoot = getCourseRoot();
    } catch {
        return {
            stage: 'not-initialized',
            stageNumber: 0,
            checklist: {},
            nextAction: 'Create a CourseCode project: coursecode create my-course',
            recommendedTool: null,
            message: 'No course directory found. Create a project first.'
        };
    }

    const courseDir = path.join(courseRoot, 'course');
    const refsDir = path.join(courseDir, 'references');
    const mdDir = path.join(refsDir, 'converted');
    const slidesDir = path.join(courseDir, 'slides');
    const outlinePath = path.join(courseDir, 'COURSE_OUTLINE.md');
    const configPath = path.join(courseDir, 'course-config.js');

    // Filesystem checks
    const rawRefs = listFiles(refsDir).filter(f => 
        ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.md'].some(ext => f.toLowerCase().endsWith(ext))
    );
    const convertedRefs = listFiles(mdDir).filter(f => f.endsWith('.md'));
    const slides = listFiles(slidesDir).filter(f => f.endsWith('.js') && !f.startsWith('example-'));

    // Load config object to check runtime settings
    let courseConfigObj = null;
    if (fs.existsSync(configPath)) {
        try {
            const configUrl = pathToFileURL(configPath).href + `?t=${Date.now()}`;
            const configModule = await import(configUrl);
            courseConfigObj = configModule.courseConfig || configModule.default;
        } catch {
            // Config parse error — leave as null
        }
    }

    const checklist = {
        hasRawRefs: rawRefs.length > 0,
        hasConvertedRefs: convertedRefs.length > 0,
        rawRefCount: rawRefs.length,
        convertedRefCount: convertedRefs.length,
        hasOutline: fs.existsSync(outlinePath),
        hasSlides: slides.length > 0,
        slideCount: slides.length,
        hasCourseConfig: fs.existsSync(configPath),
        hasAutomationEnabled: courseConfigObj?.environment?.automation?.enabled === true,
        source: courseConfigObj?.source || null,
        previewRunning: false
    };

    // Check preview status
    try {
        const previewStatus = await getPreviewStatus(port);
        checklist.previewRunning = previewStatus.running;
    } catch {
        // Preview check failed, leave as false
    }

    // Infer stage
    let stage, stageNumber, nextAction, recommendedTool;

    if (checklist.hasSlides && checklist.hasCourseConfig) {
        // Course is built — run lint to decide polish vs export
        let lintPassed = false;
        try {
            const lintResult = await lintCourse();
            lintPassed = lintResult.passed === true;
            checklist.lintPassed = lintPassed;
            checklist.lintErrorCount = lintResult.errorCount || 0;
            checklist.lintWarningCount = lintResult.warningCount || 0;
        } catch {
            checklist.lintPassed = false;
        }

        if (lintPassed) {
            stage = 'export-ready';
            stageNumber = 5;
            nextAction = 'Lint passes. Run coursecode_build to export (format: cmi5, scorm2004, scorm1.2, or lti).';
            recommendedTool = 'coursecode_build';
        } else {
            stage = 'preview-polish';
            stageNumber = 4;
            if (checklist.source === 'powerpoint-import') {
                nextAction = 'Imported from PowerPoint. Enhance with AI: add engagement tracking, assessments, group slides into sections, customize theme. Use coursecode_screenshot to review slides.';
            } else {
                nextAction = 'Use coursecode_lint to find issues, coursecode_screenshot to check visual quality, iterate until lint passes.';
            }
            recommendedTool = 'coursecode_lint';
        }
    } else if (!checklist.hasRawRefs && !checklist.hasConvertedRefs) {
        stage = 'source-ingestion';
        stageNumber = 1;
        nextAction = 'Add reference files (PDF, DOCX, PPTX, MD) to course/references/ and run coursecode convert';
        recommendedTool = 'coursecode_workflow_status';
    } else if (checklist.hasRawRefs && !checklist.hasConvertedRefs) {
        stage = 'source-ingestion';
        stageNumber = 1;
        nextAction = 'Convert reference files to markdown: coursecode convert';
        recommendedTool = 'coursecode_workflow_status';
    } else if (!checklist.hasOutline) {
        stage = 'outline-creation';
        stageNumber = 2;
        nextAction = 'Create course outline from reference materials. Stage instructions have all file paths.';
        recommendedTool = 'coursecode_workflow_status';
    } else {
        stage = 'course-building';
        stageNumber = 3;
        nextAction = 'Build slide files and course-config.js based on the outline. Stage instructions have all file paths.';
        recommendedTool = 'coursecode_workflow_status';
    }

    return {
        stage,
        stageNumber,
        checklist,
        nextAction,
        recommendedTool,
        message: `Stage ${stageNumber}/5: ${stage}`
    };
}

/**
 * Build the course for deployment.
 * Spawns Vite production build with the appropriate LMS format config.
 */
export async function buildCourse(options = {}) {
    const format = options.format || 'cmi5';
    const startTime = Date.now();

    let courseRoot;
    try {
        courseRoot = getCourseRoot();
    } catch (error) {
        return { success: false, error: error.message, errors: [error.message], warnings: [], duration: '0s' };
    }

    const configPath = path.join(courseRoot, 'course', 'course-config.js');
    if (!fs.existsSync(configPath)) {
        return { success: false, error: 'No course-config.js found', errors: ['No course-config.js found'], warnings: [], duration: '0s' };
    }

    return new Promise((resolve) => {
        const env = { ...process.env, LMS_FORMAT: format };
        const child = spawn('npx', ['vite', 'build'], {
            cwd: courseRoot,
            env,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let _stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => { _stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });

        child.on('close', (code) => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
            const outputDir = path.join(courseRoot, 'dist');
            const errors = [];
            const warnings = [];

            // Parse stderr for errors/warnings
            for (const line of stderr.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (trimmed.toLowerCase().includes('warning')) {
                    warnings.push(trimmed);
                } else if (trimmed.toLowerCase().includes('error')) {
                    errors.push(trimmed);
                }
            }

            if (code !== 0) {
                errors.push(`Build exited with code ${code}`);
                if (stderr.trim()) errors.push(stderr.trim().slice(0, 500));
            }

            resolve({
                success: code === 0,
                format,
                outputDir: fs.existsSync(outputDir) ? outputDir : null,
                errors,
                warnings,
                duration,
                message: code === 0
                    ? `Build succeeded (${format}) in ${duration}. Output: ${outputDir}`
                    : `Build failed. ${errors.length} error(s).`
            });
        });

        child.on('error', (error) => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
            resolve({
                success: false,
                format,
                outputDir: null,
                errors: [error.message],
                warnings: [],
                duration,
                message: `Build failed: ${error.message}`
            });
        });
    });
}

/**
 * Run the narration generator script and return a structured result.
 *
 * Spawns `framework/scripts/generate-narration.js` from the course root so it
 * picks up the same .env, course-config, and slide files a manual run would.
 *
 * @param {object} options
 * @param {boolean} [options.dryRun=false] - Show what would be generated without calling TTS
 * @param {boolean} [options.force=false]  - Regenerate everything, ignoring the cache
 * @param {string}  [options.slide]        - Limit to a single slide ID
 * @returns {Promise<{success, dryRun, summary, generated, skipped, errors, warnings, output, duration}>}
 */
export async function generateNarration(options = {}) {
    const { dryRun = false, force = false, slide } = options;
    const startTime = Date.now();

    let courseRoot;
    try {
        courseRoot = getCourseRoot();
    } catch (error) {
        return {
            success: false,
            error: error.message,
            errors: [error.message],
            warnings: [],
            output: '',
            duration: '0s'
        };
    }

    const scriptPath = path.join(courseRoot, 'framework', 'scripts', 'generate-narration.js');
    if (!fs.existsSync(scriptPath)) {
        const msg = `Narration script not found at ${scriptPath}. Run \`coursecode upgrade\` to install framework scripts.`;
        return {
            success: false,
            error: msg,
            errors: [msg],
            warnings: [],
            output: '',
            duration: '0s'
        };
    }

    const args = [scriptPath];
    if (force) args.push('--force');
    if (dryRun) args.push('--dry-run');
    if (slide) args.push('--slide', slide);

    return new Promise((resolve) => {
        const child = spawn('node', args, {
            cwd: courseRoot,
            env: process.env,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        // Cap captured output to keep MCP responses manageable
        const MAX_OUTPUT = 64 * 1024;
        child.stdout.on('data', (d) => {
            if (stdout.length < MAX_OUTPUT) stdout += d.toString();
        });
        child.stderr.on('data', (d) => {
            if (stderr.length < MAX_OUTPUT) stderr += d.toString();
        });

        child.on('close', (code) => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
            const output = stdout + (stderr ? `\n${stderr}` : '');

            // Parse summary line: "✨ Complete: 3 generated, 5 unchanged, 1 errors"
            const summaryMatch = output.match(/Complete:\s*(.+?)(?:\n|$)/);
            const summary = summaryMatch ? summaryMatch[1].trim() : null;

            const numFromSummary = (label) => {
                if (!summary) return 0;
                const m = summary.match(new RegExp(`(\\d+)\\s+${label}`));
                return m ? parseInt(m[1], 10) : 0;
            };

            const errors = [];
            const warnings = [];
            for (const line of output.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (trimmed.startsWith('❌') || trimmed.startsWith('Error:')) errors.push(trimmed);
                else if (trimmed.startsWith('⚠️')) warnings.push(trimmed);
            }

            resolve({
                success: code === 0,
                dryRun,
                summary,
                generated: numFromSummary('generated'),
                skipped: numFromSummary('unchanged'),
                noNarration: numFromSummary('no export'),
                errors,
                warnings,
                output: output.slice(-8000), // Tail for MCP response (full available in stdout)
                duration,
                message: code === 0
                    ? `Narration ${dryRun ? '(dry-run) ' : ''}complete in ${duration}${summary ? `: ${summary}` : ''}`
                    : `Narration failed (exit ${code}). ${errors.length} error(s).`
            });
        });

        child.on('error', (error) => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
            resolve({
                success: false,
                dryRun,
                error: error.message,
                errors: [error.message],
                warnings: [],
                output: '',
                duration,
                message: `Narration failed: ${error.message}`
            });
        });
    });
}

