/**
 * Interaction Catalog
 * 
 * Single source of truth for all interaction types (built-in and custom).
 * Uses import.meta.glob for auto-discovery - just drop a file in the folder.
 */

const catalog = new Map();

/**
 * Register an interaction type
 * @param {string} type - Interaction type name (kebab-case)
 * @param {object} definition - { creator, metadata?, schema? }
 */
export function catalogInteraction(type, { creator, metadata, schema }) {
    if (!creator) {
        throw new Error(`[InteractionCatalog] Cannot register "${type}" without a creator function`);
    }
    catalog.set(type, { creator, metadata, schema });
}

/**
 * Get the creator function for an interaction type
 * @param {string} type - Interaction type name
 * @returns {function|undefined}
 */
export function getCreator(type) {
    return catalog.get(type)?.creator;
}

/**
 * Get metadata for an interaction type
 * @param {string} type - Interaction type name
 * @returns {object|undefined}
 */
export function getMetadata(type) {
    return catalog.get(type)?.metadata;
}

/**
 * Get schema for an interaction type
 * @param {string} type - Interaction type name
 * @returns {object|undefined}
 */
export function getSchema(type) {
    return catalog.get(type)?.schema;
}

/**
 * Get all registered schemas
 * @returns {object} Map of type -> schema
 */
export function getAllSchemas() {
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
export function getRegisteredTypes() {
    return [...catalog.keys()];
}

/**
 * Check if a type is registered
 * @param {string} type
 * @returns {boolean}
 */
export function isRegistered(type) {
    return catalog.has(type);
}

/**
 * Get merged schema with base properties
 * @param {string} type - Interaction type name
 * @returns {object} Full schema with base properties merged
 */
export function getFullSchema(type) {
    const schema = getSchema(type);
    if (!schema) return null;

    return {
        ...schema,
        properties: {
            ...baseSchema,
            ...schema.properties
        }
    };
}

// =============================================================================
// Base Schema (shared properties for all interactions)
// =============================================================================

export const baseSchema = {
    id: { type: 'string', required: true, description: 'Unique identifier for the interaction' },
    prompt: { type: 'string', required: true, description: 'Question or instruction text' },
    controlled: { type: 'boolean', default: false, description: 'If true, interaction is managed externally (e.g., by assessment)' },
    feedback: { type: 'object', description: 'Custom feedback messages' }
};

// =============================================================================
// Auto-discover Interactions (Built-in + Custom)
// =============================================================================

// Built-in framework interactions
const builtInModules = import.meta.glob('../components/interactions/*.js', { eager: true });

// Course-specific custom interactions  
const customModules = import.meta.glob('../../../course/interactions/*.js', { eager: true });

// Register all discovered modules
function registerModules(modules) {
    for (const [path, module] of Object.entries(modules)) {
        // Skip base module
        if (path.includes('interaction-base')) continue;
        
        // Each interaction exports: schema, metadata, and a create* function
        const { schema, metadata } = module;
        
        if (!schema?.type) continue;
        
        // Find the creator function by export key name (not function.name which gets minified)
        const creator = Object.entries(module)
            .filter(([key, v]) => typeof v === 'function' && key.startsWith('create'))
            .map(([, v]) => v)[0];
        
        if (!creator) continue;
        
        catalogInteraction(schema.type, { creator, metadata, schema });
    }
}

// Register synchronously - modules are eagerly loaded
registerModules(builtInModules);
registerModules(customModules);

// Multiple-choice-single is an alias for multiple-choice
if (catalog.has('multiple-choice')) {
    const mc = catalog.get('multiple-choice');
    catalog.set('multiple-choice-single', mc);
}
