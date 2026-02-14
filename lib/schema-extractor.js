/**
 * Schema Extractor - Build-time AST extraction using acorn
 * 
 * Extracts interaction schemas WITHOUT importing files (avoiding dependency chain).
 * Used by course-parser.js and other build tools.
 */

import * as acorn from 'acorn';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INTERACTIONS_DIR = path.join(__dirname, '../framework/js/components/interactions');
const UI_COMPONENTS_DIR = path.join(__dirname, '../framework/js/components/ui-components');

// Base schema properties shared by all interactions
const baseSchema = {
    id: { type: 'string', required: true, description: 'Unique identifier' },
    prompt: { type: 'string', required: true, description: 'Question or instruction text' },
    controlled: { type: 'boolean', default: false, description: 'Managed externally' },
    feedback: { type: 'object', description: 'Custom feedback messages' }
};

// Cache after first load
let schemasCache = null;
let metadataCache = null;
let componentSchemasCache = null;
let componentMetadataCache = null;

/**
 * Get all interaction schemas (auto-discovered)
 */
export function getAllSchemas() {
    if (schemasCache) return schemasCache;
    loadAll();
    return schemasCache;
}

/**
 * Get all interaction metadata (auto-discovered)
 */
export function getAllMetadata() {
    if (metadataCache) return metadataCache;
    loadAll();
    return metadataCache;
}

/**
 * Load schemas and metadata from all interaction files
 */
function loadAll() {
    schemasCache = {};
    metadataCache = {};
    
    // Scan built-in interactions
    scanDirectory(INTERACTIONS_DIR);
    
    // Scan course-specific custom interactions
    const customDir = path.join(__dirname, '../course/interactions');
    scanDirectory(customDir);
    
    // Alias
    if (schemasCache['multiple-choice']) {
        schemasCache['multiple-choice-single'] = schemasCache['multiple-choice'];
    }
}

/**
 * Scan a directory for interaction files
 */
function scanDirectory(dir) {
    if (!fs.existsSync(dir)) return;
    
    for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.js') || file === 'interaction-base.js') continue;
        
        const filePath = path.join(dir, file);
        const exports = extractExports(filePath);
        
        // Find standardized 'schema' and 'metadata' exports
        const { schema, metadata } = exports;
        
        if (schema?.type) {
            schemasCache[schema.type] = schema;
        }
        if (metadata?.creator) {
            metadataCache[metadata.creator] = metadata;
        }
    }
}

/**
 * Get registered interaction types
 */
export function getRegisteredTypes() {
    return Object.keys(getAllSchemas());
}

/**
 * Get schema for a type
 */
export function getSchema(type) {
    return getAllSchemas()[type] || null;
}

/**
 * Get full schema with base properties merged
 */
export function getFullSchema(type) {
    const schema = getSchema(type);
    if (!schema) return null;
    return { ...schema, properties: { ...baseSchema, ...schema.properties } };
}

/**
 * Get factory name for a type (from metadata)
 */
export function getFactoryName(type) {
    const schema = getSchema(type);
    if (!schema) return null;
    
    // Derive factory name from type: 'multiple-choice' -> 'createMultipleChoiceQuestion'
    const camelCase = type.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return `create${camelCase.charAt(0).toUpperCase() + camelCase.slice(1)}Question`;
}

// =============================================================================
// COMPONENT SCHEMAS (UI Components)
// =============================================================================

/**
 * Get all component schemas (auto-discovered)
 */
export function getAllComponentSchemas() {
    if (componentSchemasCache) return componentSchemasCache;
    loadAllComponents();
    return componentSchemasCache;
}

/**
 * Load schemas from all component files
 */
function loadAllComponents() {
    componentSchemasCache = {};
    componentMetadataCache = {};
    
    // Scan built-in UI components
    scanComponentDirectory(UI_COMPONENTS_DIR);
    
    // Scan course-specific custom components
    const customDir = path.join(__dirname, '../course/components');
    scanComponentDirectory(customDir);
}

/**
 * Scan a directory for component files
 */
function scanComponentDirectory(dir) {
    if (!fs.existsSync(dir)) return;
    
    for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.js') || file === 'index.js' || file.includes('-base')) continue;
        
        const filePath = path.join(dir, file);
        const exports = extractExports(filePath);
        
        const { schema, metadata } = exports;
        
        if (schema?.type) {
            componentSchemasCache[schema.type] = schema;
            if (metadata) componentMetadataCache[schema.type] = metadata;
        }
    }
}

/**
 * Get component schema for a type
 */
export function getComponentSchema(type) {
    return getAllComponentSchemas()[type] || null;
}

/**
 * Get registered component types
 */
export function getRegisteredComponentTypes() {
    return Object.keys(getAllComponentSchemas());
}

/**
 * Get all component metadata (auto-discovered)
 */
export function getAllComponentMetadata() {
    if (!componentMetadataCache) loadAllComponents();
    return componentMetadataCache;
}

/**
 * Get metadata for a component type
 */
export function getComponentMetadata(type) {
    return getAllComponentMetadata()[type] || null;
}

/**
 * Build reverse map: engagementTracking value -> component type
 * e.g. { viewAllTabs: 'tabs', viewAllPanels: 'accordion', ... }
 */
export function getEngagementTrackingMap() {
    const metadata = getAllComponentMetadata();
    const map = {};
    for (const [type, meta] of Object.entries(metadata)) {
        if (meta.engagementTracking) {
            map[meta.engagementTracking] = type;
        }
    }
    return map;
}

// =============================================================================
// AST EXTRACTION (acorn)
// =============================================================================

/**
 * Extract all named exports from a file
 */
function extractExports(filePath) {
    const source = fs.readFileSync(filePath, 'utf-8');
    const exports = {};
    
    try {
        const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
        
        for (const node of ast.body) {
            if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration') {
                for (const decl of node.declaration.declarations) {
                    exports[decl.id.name] = toValue(decl.init);
                }
            }
        }
    } catch (_e) {
        // Silently skip parse errors
    }
    
    return exports;
}

/**
 * Convert AST node to JavaScript value
 */
function toValue(node) {
    if (!node) return null;
    
    switch (node.type) {
        case 'Literal':
            return node.value;
        case 'Identifier':
            if (node.name === 'true') return true;
            if (node.name === 'false') return false;
            return null;
        case 'ObjectExpression': {
            const obj = {};
            for (const p of node.properties) {
                if (p.type !== 'Property') continue;
                const key = p.key.name || p.key.value;
                obj[key] = toValue(p.value);
            }
            return obj;
        }
        case 'ArrayExpression':
            return node.elements.map(toValue);
        case 'TemplateLiteral':
            return node.quasis.map(q => q.value.cooked).join('');
        default:
            return null;
    }
}

// =============================================================================
// ICON EXTRACTION (regex-based — icons are simple key→SVG maps)
// =============================================================================

let iconsCache = null;

/**
 * Get all icons from DEFAULT_ICONS and course/icons.js.
 * Returns { name: { category, svg, source } }
 */
export function getAllIcons() {
    if (iconsCache) return iconsCache;
    iconsCache = {};

    // Built-in icons
    const iconsFile = path.join(__dirname, '../framework/js/utilities/icons.js');
    if (fs.existsSync(iconsFile)) {
        const builtIn = extractIconsFromSource(fs.readFileSync(iconsFile, 'utf-8'));
        for (const [name, info] of Object.entries(builtIn)) {
            iconsCache[name] = { ...info, source: 'built-in' };
        }
    }

    // Custom course icons
    const customFile = path.join(__dirname, '../course/icons.js');
    if (fs.existsSync(customFile)) {
        const custom = extractIconsFromSource(fs.readFileSync(customFile, 'utf-8'));
        for (const [name, info] of Object.entries(custom)) {
            iconsCache[name] = { ...info, source: 'custom' };
        }
    }

    return iconsCache;
}

/**
 * Extract icon keys, SVG content, and categories from source code.
 * Parses comment lines (e.g. `// System UI`) as category headers.
 * Returns { name: { category, svg } }
 */
function extractIconsFromSource(source) {
    const icons = {};
    let currentCategory = 'Uncategorized';

    // Match lines inside object literals: category comments and key-value pairs
    const lines = source.split('\n');
    let inObject = false;

    for (const line of lines) {
        const trimmed = line.trim();

        // Detect start of an object (const DEFAULT_ICONS = { or export const customIcons = {)
        if (/(?:const|let|var)\s+\w+\s*=\s*\{/.test(trimmed)) {
            inObject = true;
            currentCategory = 'Uncategorized';
            continue;
        }

        if (!inObject) continue;

        // Detect end of object
        if (trimmed === '};') {
            inObject = false;
            continue;
        }

        // Category comment: `// System UI` or `// Media`
        const categoryMatch = trimmed.match(/^\/\/\s*(.+)/);
        if (categoryMatch) {
            currentCategory = categoryMatch[1].trim();
            continue;
        }

        // Icon entry: `'icon-name': '<path .../>',`
        const iconMatch = trimmed.match(/^'([^']+)'\s*:\s*'(.+?)'\s*,?\s*$/);
        if (iconMatch) {
            icons[iconMatch[1]] = { category: currentCategory, svg: iconMatch[2] };
        }
    }

    return icons;
}
