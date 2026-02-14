/**
 * CSS Class Index
 * 
 * Extracts all valid CSS class names and data-component values from
 * framework and course CSS using PostCSS.
 * 
 * Extracted from authoring-api.js to break a circular dependency:
 *   build-linter.js → authoring-api.js → (has spawn/exec/etc)
 * 
 * Now both build-linter.js and authoring-api.js can import this
 * without pulling in each other's dependency trees.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postcss from 'postcss';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __packageRoot = path.dirname(__dirname);

/**
 * Find course root directory (cwd-first, then package root fallback).
 */
function getCourseRoot() {
    if (fs.existsSync(path.join(process.cwd(), 'course'))) return process.cwd();
    if (fs.existsSync(path.join(process.cwd(), 'template', 'course'))) return path.join(process.cwd(), 'template');
    if (fs.existsSync(path.join(__packageRoot, 'course'))) return __packageRoot;
    if (fs.existsSync(path.join(__packageRoot, 'template', 'course'))) return path.join(__packageRoot, 'template');
    throw new Error('No course directory found.');
}

/**
 * Find framework root directory.
 */
function getFrameworkRoot() {
    const cwd = process.cwd();
    if (fs.existsSync(path.join(cwd, 'framework'))) return cwd;
    const parent = path.dirname(cwd);
    if (fs.existsSync(path.join(parent, 'framework'))) return parent;
    if (fs.existsSync(path.join(__packageRoot, 'framework'))) return __packageRoot;
    throw new Error('Framework directory not found.');
}

/**
 * Recursively collect .css files from a directory.
 */
export function collectCssFiles(dir, result) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectCssFiles(fullPath, result);
        } else if (entry.name.endsWith('.css')) {
            result.push(fullPath);
        }
    }
}

/**
 * Extract class names and data-component values from PostCSS nodes (recursive).
 */
function extractSelectorsFromNode(node, classes, dataComponents) {
    if (node.type === 'rule' && node.selector) {
        const classMatches = node.selector.match(/\.[\w-]+/g);
        if (classMatches) {
            for (const match of classMatches) {
                classes.add(match.slice(1));
            }
        }

        const dcMatches = node.selector.match(/\[data-component="([^"]+)"\]/g);
        if (dcMatches) {
            for (const match of dcMatches) {
                const value = match.match(/\[data-component="([^"]+)"\]/);
                if (value) dataComponents.add(value[1]);
            }
        }
    }

    if (node.nodes) {
        for (const child of node.nodes) {
            extractSelectorsFromNode(child, classes, dataComponents);
        }
    }
}

/**
 * Extract all valid CSS class names and data-component values from framework and course CSS.
 * Uses PostCSS for proper parsing — handles @media, nesting, pseudo-classes correctly.
 */
export function getValidCssClasses() {
    const frameworkRoot = getFrameworkRoot();
    const cssDir = path.join(frameworkRoot, 'framework', 'css');

    const classes = new Set();
    const dataComponents = new Set();
    const cssFiles = [];

    // 1. Framework CSS (recursive)
    if (fs.existsSync(cssDir)) {
        collectCssFiles(cssDir, cssFiles);
    }

    // 2. Course CSS (theme + custom components)
    try {
        const courseRoot = getCourseRoot();
        const courseDir = path.join(courseRoot, 'course');
        const themeFile = path.join(courseDir, 'theme.css');
        if (fs.existsSync(themeFile)) cssFiles.push(themeFile);

        const customComponentsDir = path.join(courseDir, 'components');
        if (fs.existsSync(customComponentsDir)) {
            collectCssFiles(customComponentsDir, cssFiles);
        }
    } catch {
        // No course directory — framework-only mode
    }

    // Parse each CSS file with PostCSS
    for (const file of cssFiles) {
        try {
            const source = fs.readFileSync(file, 'utf-8');
            const root = postcss.parse(source, { from: file });
            extractSelectorsFromNode(root, classes, dataComponents);
        } catch {
            // Skip unparseable CSS files
        }
    }

    const sortedClasses = [...classes].sort();
    const sortedComponents = [...dataComponents].sort();

    return {
        classes: sortedClasses,
        dataComponents: sortedComponents,
        classCount: sortedClasses.length,
        componentCount: sortedComponents.length,
        cssFiles: cssFiles.map(f => path.relative(frameworkRoot, f)),
        message: `${sortedClasses.length} CSS classes and ${sortedComponents.length} data-component values found across ${cssFiles.length} CSS files.`
    };
}

// Files that legitimately use global element selectors (resets, typography, tokens)
const EXEMPT_FILES = new Set([
    '01-base.css',
    'design-tokens.css',
    'accessibility.css',
    'accessibility-utils.css',
    'framework.css',
    'forms.css',
]);

/**
 * Check if a selector is a bare element selector (no class/ID/data-attribute qualifier).
 * Returns the offending element name, or null if the selector is qualified.
 *
 * Examples:
 *   "button"                    → "button"
 *   "button[type=\"button\"]"   → "button[type=\"button\"]"
 *   "button:disabled"           → "button:disabled"
 *   ".btn"                      → null (class-qualified)
 *   "button.sidebar-item"       → null (class-qualified)
 *   "[data-theme] button"       → null (scoped by data-attribute)
 *   "#prevBtn"                  → null (ID-qualified)
 */
function isBareElementSelector(selector) {
    // Skip selectors that contain a class, ID, or data-attribute qualifier
    if (/[.#]/.test(selector) || /\[data-/.test(selector)) return null;

    // Check if the selector starts with or is a bare element name
    // Match: element, element:pseudo, element[attr], element > element
    const elementMatch = selector.trim().match(/^([a-z][a-z0-9-]*)/i);
    if (elementMatch) {
        return selector.trim();
    }

    return null;
}

/**
 * Lint CSS selectors for bare element selectors in framework CSS.
 * Catches rules like `button { }`, `button[type="button"] { }`, `button:disabled { }`
 * that apply styles globally to all matching elements without class qualification.
 *
 * @returns {{ warnings: string[] }} Lint warnings
 */
export function lintCssSelectors() {
    const frameworkRoot = getFrameworkRoot();
    const cssDir = path.join(frameworkRoot, 'framework', 'css');
    const warnings = [];

    if (!fs.existsSync(cssDir)) return { warnings };

    const cssFiles = [];
    collectCssFiles(cssDir, cssFiles);

    for (const file of cssFiles) {
        const basename = path.basename(file);
        if (EXEMPT_FILES.has(basename)) continue;

        try {
            const source = fs.readFileSync(file, 'utf-8');
            const root = postcss.parse(source, { from: file });
            const relPath = path.relative(path.join(frameworkRoot, 'framework', 'css'), file);

            root.walk(node => {
                if (node.type !== 'rule' || !node.selector) return;

                // Skip rules inside @keyframes (from/to are keywords, not selectors)
                let parent = node.parent;
                while (parent) {
                    if (parent.type === 'atrule' && parent.name.endsWith('keyframes')) return;
                    parent = parent.parent;
                }

                // Split comma-separated selectors and check each
                const selectors = node.selector.split(',').map(s => s.trim());
                for (const sel of selectors) {
                    const bare = isBareElementSelector(sel);
                    if (bare) {
                        const line = node.source?.start?.line || '?';
                        warnings.push(
                            `CSS global selector: '${bare}' in ${relPath}:${line}. ` +
                            'Bare element selectors apply styles to ALL matching elements. ' +
                            'Use a class qualifier (e.g. .btn) instead.'
                        );
                    }
                }
            });
        } catch {
            // Skip unparseable files
        }
    }

    return { warnings };
}

