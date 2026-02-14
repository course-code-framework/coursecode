/**
 * Component Catalog
 * 
 * Single source of truth for all UI components (built-in and custom).
 * Uses import.meta.glob for auto-discovery - just drop a file in the folder.
 * 
 * Mirrors the interaction-catalog.js pattern for consistency.
 */

const catalog = new Map();

/**
 * Register a component type
 * @param {string} type - Component type name (kebab-case, matches data-component value)
 * @param {object} definition - { init?, metadata?, schema, styles? }
 */
export function catalogComponent(type, { init, metadata, schema, styles }) {
    if (!schema) {
        throw new Error(`[ComponentCatalog] Cannot register "${type}" without a schema`);
    }
    catalog.set(type, { init, metadata, schema, styles });
}

/**
 * Get the init function for a component type
 * @param {string} type - Component type name
 * @returns {function|undefined}
 */
export function getComponentInit(type) {
    return catalog.get(type)?.init;
}

/**
 * Get metadata for a component type
 * @param {string} type - Component type name
 * @returns {object|undefined}
 */
export function getComponentMetadata(type) {
    return catalog.get(type)?.metadata;
}

/**
 * Get schema for a component type
 * @param {string} type - Component type name
 * @returns {object|undefined}
 */
export function getComponentSchema(type) {
    return catalog.get(type)?.schema;
}

/**
 * Get styles for a component type (for custom components with CSS-in-JS)
 * @param {string} type - Component type name
 * @returns {string|undefined}
 */
export function getComponentStyles(type) {
    return catalog.get(type)?.styles;
}

/**
 * Get all registered schemas
 * @returns {object} Map of type -> schema
 */
export function getAllComponentSchemas() {
    const schemas = {};
    for (const [type, def] of catalog) {
        if (def.schema) {
            schemas[type] = def.schema;
        }
    }
    return schemas;
}

/**
 * Get all registered type names
 * @returns {string[]}
 */
export function getRegisteredComponentTypes() {
    return [...catalog.keys()];
}

/**
 * Check if a type is registered
 * @param {string} type
 * @returns {boolean}
 */
export function isComponentRegistered(type) {
    return catalog.has(type);
}

// =============================================================================
// Auto-discover Components (Built-in UI + Custom)
// =============================================================================

// Built-in UI components
const uiComponentModules = import.meta.glob('../components/ui-components/*.js', { eager: true });

// Course-specific custom components
const customComponentModules = import.meta.glob('../../../course/components/*.js', { eager: true });

/**
 * Register all discovered modules.
 * Convention: per-element initializer is exported as `init`.
 */
function registerModules(modules) {
    for (const [path, module] of Object.entries(modules)) {
        // Skip index/base files
        if (path.includes('index.js') || path.includes('-base')) continue;
        
        // Each component exports: schema (required), metadata (optional), init (optional), styles (optional)
        const { schema, metadata, styles, init } = module;
        
        if (!schema?.type) continue;
        
        catalogComponent(schema.type, { init, metadata, schema, styles });
    }
}

// Register synchronously - modules are eagerly loaded
registerModules(uiComponentModules);
registerModules(customComponentModules);
