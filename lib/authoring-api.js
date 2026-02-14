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
 * 
 * Without filterCategory: returns compact categorized index (class name → short description).
 * With filterCategory: returns full detail for that category (all declarations).
 * 
 * Category names are derived from file paths relative to framework/css/:
 *   utilities/borders.css → "utilities/borders"
 *   02-layout.css → "layout"
 *   components/hero.css → "components/hero"
 */

// Module-level cache — parsed once per process
let _cssCatalogCache = null;

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

            extractClassCatalog(root, classes);

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
 */
function extractClassCatalog(node, classes) {
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

            // Build short description from declarations
            const decls = [];
            node.walk(child => {
                if (child.type === 'decl') {
                    decls.push(`${child.prop}: ${child.value}`);
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
            extractClassCatalog(child, classes);
        }
    }
}

/**
 * Get CSS catalog — compact list or full detail for one category.
 * @param {string} [filterCategory] - If provided, return detail for this category only
 */
export function getCssCatalog(filterCategory) {
    const catalog = buildCssCatalog();

    if (filterCategory) {
        const cat = catalog.categories[filterCategory];
        if (!cat) {
            return {
                error: `Unknown category: '${filterCategory}'`,
                available: Object.keys(catalog.categories).sort()
            };
        }
        return { category: filterCategory, ...cat };
    }

    return {
        categories: catalog.categories,
        totalClasses: catalog.totalClasses,
        categoryCount: Object.keys(catalog.categories).length,
        message: `${catalog.totalClasses} CSS classes across ${Object.keys(catalog.categories).length} categories. Pass 'category' for full detail.`
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

