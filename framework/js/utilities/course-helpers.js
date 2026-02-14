import { deepClone, deepMerge } from './utilities.js';
import { logger } from './logger.js';

const SLIDE_ALIAS_PREFIX = '@slides/';

/**
 * Vite expands glob imports into an object literal where each key is a file path
 * and the value is a function that lazy-loads the module. Building a registry up front
 * ensures production builds have static references to every slide file.
 * 
 * Uses the @slides alias which is resolved by each vite config:
 * - Production courses (vite.config.js): @slides -> course/slides
 * - Framework dev (vite.framework-dev.config.js): @slides -> template/course/slides
 */
const slideModules = import.meta.glob('@slides/**/*.js');
const slideModuleRegistry = new Map();

for (const [globPath, loader] of Object.entries(slideModules)) {
    // Normalize path to @slides/filename.js format
    const aliasPath = globPath.startsWith('@slides/') 
        ? globPath 
        : '@slides/' + globPath.split('/slides/').pop();
    slideModuleRegistry.set(aliasPath, loader);
}

/**
 * Loads a slide module dynamically.
 * Note: ES modules are cached by the browser automatically, so we don't need our own cache.
 * @param {string} path - The path to the slide module (e.g., '@slides/intro.js')
 * @returns {Promise<object>} The loaded module
 * @throws {Error} If the module cannot be loaded
 */
async function loadSlideModule(path) {
    const normalizedPath = normalizeComponentPath(path);
    const loader = slideModuleRegistry.get(normalizedPath);
    
    if (!loader) {
        throw new Error(`Failed to find slide module registered at ${normalizedPath} (original: ${path})`);
    }
    
    try {
        return await loader();
    } catch (error) {
        logger.error(`Failed to load slide module for path: ${path}`, error);
        throw new Error(`Failed to load slide module at ${path}: ${error.message}`);
    }
}

let courseConfig;
let derivedDataCache = null;

function ensureArray(value) {
    if (!value) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

function normalizeControls(controls) {
    if (!controls) {
        throw new Error('normalizeControls: controls parameter is required');
    }

    return {
        nextTarget: controls.nextTarget || null,
        previousTarget: controls.previousTarget || null,
        exitTarget: controls.exitTarget || null,
    };
}

function normalizeConditions(block) {
    return ensureArray(block)
        .map(condition => (condition && typeof condition === 'object' ? { ...condition } : null))
        .filter(Boolean);
}

function normalizeGating(gating) {
    if (!gating) {
        return null;
    }

    if (!gating.conditions) {
        throw new Error('Gating configuration must have a "conditions" array. Legacy "condition" property is not supported.');
    }

    const normalizedConditions = normalizeConditions(gating.conditions);
    if (!normalizedConditions.length) {
        return null;
    }

    return {
        mode: gating.mode === 'any' ? 'any' : 'all',
        message: gating.message || null,
        conditions: normalizedConditions,
    };
}

function normalizeSequence(sequence) {
    if (!sequence) {
        return null;
    }

    const includeWhen = normalizeConditions(sequence.includeWhen);
    const skipUntil = normalizeConditions(sequence.skipUntil);
    const insert = sequence.insert && (sequence.insert.slideId || sequence.insert.anchor)
        ? {
            position: sequence.insert.position === 'after' ? 'after' : 'before',
            slideId: sequence.insert.slideId || sequence.insert.anchor,
        }
        : null;

    return {
        includeByDefault: sequence.includeByDefault !== false,
        includeWhen,
        skipUntil,
        insert,
        message: sequence.message || null,
    };
}

function normalizeNavigation(nodeNavigation, nodeType, assessmentId) {
    if (!nodeNavigation) {
        throw new Error('normalizeNavigation: nodeNavigation parameter is required');
    }

    const navigation = {
        sequential: nodeNavigation.sequential !== false,
        controls: normalizeControls(nodeNavigation.controls || {}),
        gating: normalizeGating(nodeNavigation.gating),
        sequence: normalizeSequence(nodeNavigation.sequence),
        assessmentRef: nodeNavigation.assessmentRef || (nodeType === 'assessment' ? assessmentId : null),
    };

    return navigation;
}

function getStructure() {
    if (!courseConfig) {
        throw new Error('CourseHelpers: courseConfig not initialized. Call init() first.');
    }
    if (!Array.isArray(courseConfig.structure)) {
        throw new Error('CourseHelpers: courseConfig.structure must be an array.');
    }
    return courseConfig.structure;
}

/**
 * Computes derived data from the course configuration.
 * This function is called once per session and caches the result.
 * @returns {Promise<object>} Derived data including slides, indexById, menuTree, and assessmentConfigs
 */
async function computeDerived() {
    if (derivedDataCache) {
        return derivedDataCache;
    }

    const slides = [];
    const indexById = {};
    const menuTree = [];
    const assessmentConfigs = new Map(); // Registry for assessment configurations

    async function walk(nodes, level = 0, targetMenu = menuTree) {
        if (!Array.isArray(nodes)) {
            return;
        }

        for (const node of nodes) {
            if (!node || typeof node !== 'object') {
                continue;
            }

            if (node.type === 'section') {
                const childrenContainer = [];
                await walk(node.children || [], level + 1, childrenContainer);

                const isHidden = node.menu && node.menu.hidden;
                if (isHidden) {
                    targetMenu.push(...childrenContainer);
                    continue;
                }

                const sectionLabel = node.menu?.label || node.title || node.id || 'Section';
                const sectionItem = {
                    type: 'section',
                    id: node.id || sectionLabel.toLowerCase().replace(/\s+/g, '-'),
                    label: sectionLabel,
                    icon: node.menu?.icon || null,
                    defaultExpanded: node.menu?.defaultExpanded !== false,
                    collapsible: node.menu?.collapsible !== false,
                    level,
                    children: childrenContainer,
                };

                targetMenu.push(sectionItem);
                continue;
            }

            const componentPath = node.component || node.slide || node.content || node.module;
            if (typeof componentPath !== 'string') {
                throw new Error(`Slide '${node.id || 'unknown'}' is missing a component path string.`);
            }

            const slideId = node.id;
            if (!slideId) {
                throw new Error('Slide is missing an id');
            }

            let component;
            let assessmentId = null;
            const kind = node.type === 'assessment' ? 'assessment' : 'slide';

            const module = await loadSlideModule(componentPath);
            if (kind === 'assessment') {
                if (!module.config || !module.slide) {
                    throw new Error(`Assessment module at ${componentPath} must export named 'config' and 'slide' objects.`);
                }
                if (typeof module.slide.render !== 'function') {
                    throw new Error(`Assessment 'slide' export at ${componentPath} does not have a render function.`);
                }
                assessmentId = module.config.id;
                component = module.slide;
                // Register the assessment configuration
                if (assessmentConfigs.has(assessmentId)) {
                    throw new Error(`[CourseHelpers] Duplicate assessment ID '${assessmentId}' found. Each assessment must have a unique ID in course-config.js.`);
                }
                assessmentConfigs.set(assessmentId, module.config);
            } else {
                // For regular slides, look for named 'slide' export first, then fall back to first export
                component = module.slide || Object.values(module)[0];
                if (!component || typeof component.render !== 'function') {
                    throw new Error(`Slide module at ${componentPath} does not have a valid component export with a render function.`);
                }
            }

            const title = node.title || component.title || node.menu?.label || slideId;
            const navigation = normalizeNavigation(node.navigation || {}, kind, assessmentId);
            const menuConfig = node.menu || {};
            const slideIndex = slides.length;

            const slideEntry = {
                type: kind,
                id: slideId,
                assessmentId,
                index: slideIndex,
                component,
                title,
                audio: node.audio,            // Pass through audio config from structure
                engagement: node.engagement,  // Pass through engagement config from structure
                navigation,
                menu: menuConfig,
                metadata: node.metadata || {},
                assessment: kind === 'assessment' ? (node.assessment || {}) : null,
            };

            slides.push(slideEntry);
            indexById[slideId] = slideIndex;

            if (!menuConfig.hidden) {
                const menuItem = {
                    type: 'slide',
                    id: slideId,
                    label: menuConfig.label || title,
                    icon: menuConfig.icon || null,
                    level,
                    slideIndex,
                };
                targetMenu.push(menuItem);
            }
        }
    }

    await walk(getStructure(), 0, menuTree);

    derivedDataCache = { slides, indexById, menuTree, assessmentConfigs };
    return derivedDataCache;
}

function cloneSlide(entry) {
    if (!entry) {
        return null;
    }
    return {
        ...entry,
        navigation: deepClone(entry.navigation),
        menu: deepClone(entry.menu),
        metadata: deepClone(entry.metadata),
        assessment: deepClone(entry.assessment),
        audio: deepClone(entry.audio),
        engagement: deepClone(entry.engagement),
    };
}

/**
 * Initializes CourseHelpers with the course configuration.
 * The config is frozen to prevent accidental mutations.
 * @param {object} config - The course configuration object
 * @throws {Error} If already initialized
 */
export function init(config) {
    if (courseConfig) {
        throw new Error('CourseHelpers: Already initialized. Do not call init() more than once.');
    }
    if (!config) {
        throw new Error('CourseHelpers: config parameter is required.');
    }
    // Freeze the config to make it immutable
    courseConfig = Object.freeze(config);
}

export async function getFlattenedSlides() {
    const data = await computeDerived();
    return data.slides.map(slide => cloneSlide(slide));
}

export async function getSlideEntry(index) {
    const data = await computeDerived();
    return cloneSlide(data.slides[index] || null);
}

export async function getSlideComponent(index) {
    const entry = await getSlideEntry(index);
    if (!entry) {
        return null;
    }
    // The component is already the correct 'slide' object from the module
    return entry.component;
}

export async function countSlides() {
    const data = await computeDerived();
    return data.slides.length;
}

export async function getSlideIndex(slideId) {
    if (!slideId) return null;
    const data = await computeDerived();
    const index = data.indexById[slideId];
    return index === undefined ? null : index;
}

export async function getSlideById(slideId) {
    const index = await getSlideIndex(slideId);
    if (index === null) {
        return null;
    }
    return getSlideEntry(index);
}

export async function getSlideName(index) {
    const entry = await getSlideEntry(index);
    if (entry) {
        return entry.title || `Section ${index + 1}`;
    }
    return `Section ${index + 1}`;
}

export async function getMenuTree() {
    const data = await computeDerived();
    return deepClone(data.menuTree);
}

export async function isSequentiallyEnabled(index) {
    const entry = await getSlideEntry(index);
    if (!entry) {
        return true;
    }
    return entry.navigation?.sequential !== false;
}

export async function getAssessmentConfig(slideIndex, overrides = {}) {
    const entry = await getSlideEntry(slideIndex);
    if (!entry || entry.type !== 'assessment') {
        return null;
    }
    const merged = deepMerge(entry.assessment || {}, overrides);
    return deepClone(merged);
}

/**
 * Gets all slides of a specific type from the course structure.
 * @param {string} type - The type of slide to filter for (e.g., 'assessment')
 * @returns {Promise<Array>} Array of slides matching the specified type
 */
export async function getSlidesByType(type) {
    const data = await computeDerived();
    return data.slides.filter(slide => slide.type === type).map(slide => deepClone(slide));
}

/**
 * Returns the registry of all assessment configurations, keyed by assessment ID.
 * @returns {Promise<Map>} A map of assessment configuration objects.
 */
export async function getAssessmentConfigs() {
    const data = await computeDerived();
    return data.assessmentConfigs;
}

function normalizeComponentPath(path) {
    if (!path || typeof path !== 'string') {
        throw new Error('Slide module path must be a non-empty string.');
    }
    const normalized = path.replace(/\\/g, '/');
    if (normalized.startsWith(SLIDE_ALIAS_PREFIX)) {
        return normalized;
    }

    const trimmed = normalized.replace(/^\.\//, '');
    if (trimmed.startsWith('course/slides/')) {
        return `${SLIDE_ALIAS_PREFIX}${trimmed.slice('course/slides/'.length)}`;
    }

    const courseIndex = trimmed.indexOf('/course/slides/');
    if (courseIndex !== -1) {
        return `${SLIDE_ALIAS_PREFIX}${trimmed.slice(courseIndex + '/course/slides/'.length)}`;
    }

    return normalized;
}


