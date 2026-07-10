/**
 * Course Writer - Unified writing utility for CourseCode
 * 
 * Single write() function handles config-object edit operations:
 * - config: courseConfig properties
 * - slide: slide config in structure array
 * - objective: objective properties
 * - gating: gating conditions
 * 
 * For source-text edits (interactions, assessments, templates),
 * see slide-source-editor.js.
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { parse } from 'acorn';

// =============================================================================
// PUBLIC API
// =============================================================================

// In-memory write mutex to prevent concurrent writes from clobbering each other.
// Each write() call chains onto the previous one, ensuring serial execution.
let _writeQueue = Promise.resolve();
let _configImportVersion = 0;

/**
 * Unified write dispatcher
 * @param {string} coursePath - Path to course directory
 * @param {string} target - What to write: 'config' | 'slide' | 'objective' | 'gating' | 'rename-objective'
 * @param {string} id - Identifier (path for config, slideId for slides, objectiveId, etc.)
 * @param {*} value - New value to set
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export function write(coursePath, target, id, value) {
    const result = _writeQueue.then(() => _doWrite(coursePath, target, id, value));
    // Keep the queue moving even if this write fails
    _writeQueue = result.catch(() => {});
    return result;
}

async function _doWrite(coursePath, target, id, value) {
    try {
        switch (target) {
            case 'config':
                await writeConfig(coursePath, id, value);
                break;
            case 'slide':
                await writeSlideConfig(coursePath, id, value);
                break;
            case 'objective':
                await writeObjective(coursePath, id, value);
                break;
            case 'gating':
                await writeGating(coursePath, id, value);
                break;
            case 'rename-objective':
                await renameObjective(coursePath, id, value);
                break;
            default:
                return { success: false, error: `Unknown target: ${target}` };
        }
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}


// =============================================================================
// TARGET HANDLERS
// =============================================================================

/**
 * Write config property
 * @param {string} coursePath
 * @param {string} propPath - Dot-notation path (e.g., 'navigation.sidebar.enabled')
 * @param {*} value
 */
async function writeConfig(coursePath, propPath, value) {
    const config = await loadConfig(coursePath);
    setNestedProperty(config, propPath, value);
    await saveConfig(coursePath, config);
}

/**
 * Write slide config in structure array
 * @param {string} coursePath
 * @param {string} slideId
 * @param {object} updates - Object with property paths and values, e.g. { 'engagement.required': true }
 */
async function writeSlideConfig(coursePath, slideId, updates) {
    const config = await loadConfig(coursePath);
    const slide = findStructureItem(config.structure, slideId);
    if (!slide) throw new Error(`Slide not found: ${slideId}`);
    
    for (const [propPath, value] of Object.entries(updates)) {
        setNestedProperty(slide, propPath, value);
    }
    await saveConfig(coursePath, config);
}

/**
 * Write objective property
 * @param {string} coursePath
 * @param {string} objectiveId
 * @param {object} updates - Object with property paths and values
 */
async function writeObjective(coursePath, objectiveId, updates) {
    const config = await loadConfig(coursePath);
    const objective = config.objectives?.find(o => o.id === objectiveId);
    if (!objective) throw new Error(`Objective not found: ${objectiveId}`);
    
    for (const [propPath, value] of Object.entries(updates)) {
        setNestedProperty(objective, propPath, value);
    }
    await saveConfig(coursePath, config);
}

/**
 * Write gating conditions for a slide
 * @param {string} coursePath
 * @param {string} slideId
 * @param {object} gatingConfig - Full gating object { mode, message, conditions }
 */
async function writeGating(coursePath, slideId, gatingConfig) {
    const config = await loadConfig(coursePath);
    const slide = findStructureItem(config.structure, slideId);
    if (!slide) throw new Error(`Slide not found: ${slideId}`);
    
    if (!slide.navigation) slide.navigation = {};
    slide.navigation.gating = gatingConfig;
    await saveConfig(coursePath, config);
}

/**
 * Rename an objective ID and cascade to all references
 * @param {string} coursePath
 * @param {string} oldId
 * @param {string} newId
 */
async function renameObjective(coursePath, oldId, newId) {
    if (oldId === newId) return;
    
    const config = await loadConfig(coursePath);
    const objective = config.objectives?.find(o => o.id === oldId);
    if (!objective) throw new Error(`Objective not found: ${oldId}`);
    
    const conflict = config.objectives.find(o => o.id === newId);
    if (conflict) throw new Error(`ID already exists: ${newId}`);
    
    // Rename the objective itself
    objective.id = newId;
    
    // Cascade to all objectiveId references in gating conditions
    function cascadeRename(items) {
        for (const item of items) {
            const conditions = item.navigation?.gating?.conditions;
            if (conditions) {
                for (const cond of conditions) {
                    if (cond.objectiveId === oldId) cond.objectiveId = newId;
                }
            }
            if (item.children) cascadeRename(item.children);
        }
    }
    cascadeRename(config.structure || []);
    
    await saveConfig(coursePath, config);
}


// =============================================================================
// CONFIG HELPERS
// =============================================================================

async function loadConfig(coursePath) {
    const configFilePath = path.join(coursePath, 'course-config.js');
    // Date.now() alone can collide across queued writes in the same
    // millisecond, causing Node to return a stale ESM module instance.
    const configUrl = pathToFileURL(configFilePath).href + `?v=${Date.now()}-${++_configImportVersion}`;
    const configModule = await import(configUrl);
    return configModule.courseConfig || configModule.default;
}

async function saveConfig(coursePath, config) {
    const configFilePath = path.join(coursePath, 'course-config.js');
    const originalSource = fs.readFileSync(configFilePath, 'utf-8');
    const ast = parse(originalSource, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowHashBang: true
    });

    let configInitializer = null;
    for (const statement of ast.body) {
        if (statement.type !== 'ExportNamedDeclaration' || statement.declaration?.type !== 'VariableDeclaration') continue;
        const declarator = statement.declaration.declarations.find(item => item.id?.name === 'courseConfig');
        if (declarator) {
            configInitializer = declarator.init;
            break;
        }
    }

    if (!configInitializer || configInitializer.type !== 'ObjectExpression') {
        throw new Error('course-config.js must export courseConfig as an object literal for visual editing');
    }

    const functionSources = new Map();
    collectFunctionSources(configInitializer, config, originalSource, [], functionSources);
    const serialized = serializeObject(config, 0, new WeakSet(), [], functionSources);
    const updatedSource = originalSource.slice(0, configInitializer.start) +
        serialized + originalSource.slice(configInitializer.end);
    fs.writeFileSync(configFilePath, updatedSource, 'utf-8');
}

function collectFunctionSources(node, value, source, valuePath, output) {
    if (!node || value === null || value === undefined) return;
    if (typeof value === 'function') {
        output.set(valuePath.join('.'), source.slice(node.start, node.end));
        return;
    }

    if (node.type === 'ObjectExpression' && typeof value === 'object' && !Array.isArray(value)) {
        for (const property of node.properties) {
            if (property.type !== 'Property' || property.computed) continue;
            const key = property.key.type === 'Identifier' ? property.key.name : String(property.key.value);
            collectFunctionSources(property.value, value[key], source, [...valuePath, key], output);
        }
    } else if (node.type === 'ArrayExpression' && Array.isArray(value)) {
        node.elements.forEach((element, index) => {
            collectFunctionSources(element, value[index], source, [...valuePath, String(index)], output);
        });
    }
}

function setNestedProperty(obj, propPath, value) {
    const parts = propPath.split('.');
    const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
    if (parts.some(part => !part || forbidden.has(part))) {
        throw new Error('Invalid configuration property path');
    }
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] === undefined) {
            current[parts[i]] = {};
        }
        current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
}

function findStructureItem(structure, id) {
    for (const item of structure) {
        if (item.id === id) return item;
        if (item.children) {
            const found = findStructureItem(item.children, id);
            if (found) return found;
        }
    }
    return null;
}

function serializeObject(obj, indent = 0, ancestors = new WeakSet(), valuePath = [], functionSources = new Map()) {
    const spaces = '    '.repeat(indent);
    const innerSpaces = '    '.repeat(indent + 1);
    
    if (obj === null) return 'null';
    if (obj === undefined) return 'undefined';
    if (typeof obj === 'boolean') return String(obj);
    if (typeof obj === 'number') {
        if (!Number.isFinite(obj)) throw new Error('courseConfig cannot contain NaN or Infinity');
        return String(obj);
    }
    if (typeof obj === 'string') return JSON.stringify(obj).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    if (typeof obj === 'function') return functionSources.get(valuePath.join('.')) || obj.toString();
    if (typeof obj !== 'object') throw new Error(`Unsupported courseConfig value type: ${typeof obj}`);

    if (ancestors.has(obj)) throw new Error('courseConfig cannot contain circular references');
    ancestors.add(obj);
    
    if (Array.isArray(obj)) {
        if (obj.length === 0) {
            ancestors.delete(obj);
            return '[]';
        }
        const items = obj.map((item, index) => innerSpaces + serializeObject(
            item,
            indent + 1,
            ancestors,
            [...valuePath, String(index)],
            functionSources
        ));
        ancestors.delete(obj);
        return '[\n' + items.join(',\n') + '\n' + spaces + ']';
    }

    const prototype = Object.getPrototypeOf(obj);
    if (prototype !== Object.prototype && prototype !== null) {
        ancestors.delete(obj);
        throw new Error(`Unsupported courseConfig object type: ${obj.constructor?.name || 'unknown'}`);
    }
    
    const entries = Object.entries(obj);
    if (entries.length === 0) {
        ancestors.delete(obj);
        return '{}';
    }
    
    const props = entries.map(([key, val]) => {
        const keyStr = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
        return innerSpaces + keyStr + ': ' + serializeObject(
            val,
            indent + 1,
            ancestors,
            [...valuePath, key],
            functionSources
        );
    });
    ancestors.delete(obj);
    return '{\n' + props.join(',\n') + '\n' + spaces + '}';
}
