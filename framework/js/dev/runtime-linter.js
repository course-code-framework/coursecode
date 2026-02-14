/**
 * @file runtime-linter.js
 * @description Static analysis tool for validating course configuration at development time.
 * Catches impossible-to-complete slides and configuration errors before runtime.
 * 
 * This tool runs ONLY in development mode and will halt course initialization if errors are found.
 * 
 * Uses shared validation rules from lib/validation-rules.js for consistency with CLI linting.
 * 
 * Suppression: Add data-lint-ignore to any element to suppress warnings for it and its children.
 *   data-lint-ignore          — suppress ALL lint warnings
 *   data-lint-ignore="spacing" — suppress only spacing warnings
 *   data-lint-ignore="spacing,contrast" — suppress multiple categories
 * 
 * Categories: spacing, contrast, target-size, proximity, overlap, list-style, css-class
 * 
 * @author Seth
 * @version 2.1.0
 */

import { logger } from '../utilities/logger.js';
import interactionRegistry from '../managers/interaction-registry.js';
import { getComponentSchema, getComponentMetadata, isComponentRegistered, getRegisteredComponentTypes } from '../core/component-catalog.js';

import {
    flattenStructure,
    registerInteractionId,
    validateAssessmentConfig,
    validateGatingConditions
} from '@lib/validation-rules.js';

// Dynamic class patterns that are valid even if not in stylesheets.
// Kept in sync with lib/build-linter.js — these are JS-state classes, functional
// selectors, and component-internal classes that have no corresponding CSS rules.
const DYNAMIC_CLASS_PREFIXES = ['js-', 'is-', 'animate-', 'delay-', 'icon-'];
const DYNAMIC_CLASSES = new Set([
    'active', 'open', 'closed', 'hidden', 'visible', 'disabled', 'loading',
    'collapsed', 'expanded', 'selected', 'checked', 'focused', 'hover',
    'entering', 'leaving', 'mounted',
    // JS-functional selectors — queried by JS components, no CSS rules needed
    'dropdown-text', 'tabs',
    // Component-internal classes — styled via [data-component] selectors in individual component CSS files
    'intro-card', 'card-icon',
    // Interaction-internal classes — used by interaction JS for DOM structure
    'drag-drop', 'matching-items', 'matching-targets',
    // Slide-specific JS selectors — queried by slide scripts for event binding
    'resources', 'complete-remedial-btn',
]);

/**
 * Build slide module registry using Vite's import.meta.glob()
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
 * Check if an element or any ancestor has data-lint-ignore.
 * Supports category-specific suppression:
 *   data-lint-ignore           → suppresses all rules
 *   data-lint-ignore="spacing"  → suppresses only 'spacing' category
 *   data-lint-ignore="spacing,contrast" → suppresses multiple categories
 * 
 * @param {HTMLElement} el - The element to check
 * @param {string} [category] - Optional category to check against (e.g., 'spacing', 'contrast')
 * @returns {boolean} True if lint warnings should be suppressed for this element
 */
function isLintIgnored(el, category) {
    let current = el;
    while (current && current.nodeType === 1) {
        if (current.hasAttribute('data-lint-ignore')) {
            const value = current.getAttribute('data-lint-ignore');
            // Empty or blank value = suppress all
            if (!value || value.trim() === '') return true;
            // Check if our category is in the comma-separated list
            if (category) {
                const categories = value.split(',').map(c => c.trim().toLowerCase());
                if (categories.includes(category.toLowerCase())) return true;
            } else {
                // No category specified = always match a present attribute
                return true;
            }
        }
        current = current.parentElement;
    }
    return false;
}

/**
 * Build audio file registry using Vite's import.meta.glob()
 * Path is relative from framework/js/dev/ to course/assets/audio/
 * - Production courses: ../../../course/assets/audio/
 * - Framework dev: Vite alias maps this appropriately
 * 
 * Audio files matching slide naming patterns (e.g., intro.mp3, ui-demo--modal.mp3)
 * are typically outputs of narration generation and should be referenced in course-config.
 */
const audioFiles = import.meta.glob('../../../course/assets/audio/**/*.mp3', { query: '?url', import: 'default' });
const audioFileRegistry = new Set();

for (const globPath of Object.keys(audioFiles)) {
    // Extract just the filename from the path
    const filename = globPath.split('/').pop();
    audioFileRegistry.add(filename);
}

// ============================================================================
// Persistent offscreen container — stays in the DOM so getComputedStyle works,
// but is invisible and doesn't trigger visible layout recalculations.
// Created once, reused for every slide render during linting.
// ============================================================================
let offscreenContainer = null;

function getOffscreenContainer() {
    if (!offscreenContainer) {
        offscreenContainer = document.createElement('div');
        offscreenContainer.id = '__lint-offscreen';
        offscreenContainer.setAttribute('aria-hidden', 'true');
        Object.assign(offscreenContainer.style, {
            position: 'fixed',
            left: '-20000px',
            top: '0',
            width: '1280px',    // Standard desktop width for layout calculations
            height: '720px',
            overflow: 'hidden',
            visibility: 'hidden',
            pointerEvents: 'none'
        });
        document.body.appendChild(offscreenContainer);
    }
    return offscreenContainer;
}

function cleanupOffscreenContainer() {
    if (offscreenContainer) {
        offscreenContainer.remove();
        offscreenContainer = null;
    }
}

/**
 * Lints the entire course configuration and structure.
 * Validates that engagement requirements match the actual slide content.
 *
 * Architecture: Single-pass per slide with offscreen rendering and async chunking.
 * Each slide is rendered once into an offscreen container. All checks (audio scan,
 * engagement, visual layout, CSS classes) run against that single render. The browser
 * yields between slides to prevent main thread lockup.
 *
 * @param {object} courseConfig - The course configuration object from course-config.js
 * @throws {Error} If any validation errors are found
 */
export async function lintCourse(courseConfig) {
    const errors = [];
    const warnings = [];
    const interactionIdRegistry = new Map();

    // Validate structure exists
    if (!courseConfig || !courseConfig.structure) {
        throw new Error('[RuntimeLinter] FATAL: courseConfig.structure is required');
    }

    // Flatten structure to get all slides (including nested in sections)
    const slides = flattenStructure(courseConfig.structure);

    // --- 1. Global Configuration Validation (no DOM needed) ---
    const { warnings: globalWarnings, objectiveIds } = validateGlobalConfig(courseConfig, slides);
    warnings.push(...globalWarnings);

    // Build valid CSS class index from loaded stylesheets (CSSOM) once for all slides
    const validCssClasses = buildCssClassIndex();

    // Collect config-level audio references once (no DOM needed)
    const referencedAudioFiles = collectReferencedAudioFiles(slides);

    // --- 2. Per-slide validation (single render, all checks) ---
    const layout = courseConfig.layout || 'article';
    for (const slide of slides) {
        await validateSlide(slide, objectiveIds, errors, warnings, interactionIdRegistry, validCssClasses, layout, referencedAudioFiles);

        // Yield to the event loop between slides to keep the browser responsive
        await new Promise(r => setTimeout(r, 0));
    }

    // --- 3. Post-slide global audio check ---
    const allSlideIds = new Set(slides.map(s => s.id));
    for (const audioFile of audioFileRegistry) {
        const baseName = audioFile.replace('.mp3', '');
        const slideIdMatch = baseName.split('--')[0];
        if (allSlideIds.has(slideIdMatch) && !referencedAudioFiles.has(audioFile)) {
            warnings.push(`Unused Narration Audio: "${audioFile}" matches slide "${slideIdMatch}" but is not referenced. Remove the file or ensure it's used via course-config audio or data-audio-src attributes.`);
        }
    }

    // Cleanup offscreen container
    cleanupOffscreenContainer();

    // Display warnings individually so each appears as a separate entry in the debug panel
    if (warnings.length > 0) {
        for (const w of warnings) {
            logger.warn(`COURSE VALIDATION: ${w}`, { domain: 'validation', operation: 'lint' });
        }
    }

    // Report errors individually so each appears as a separate entry in the debug panel, then halt
    if (errors.length > 0) {
        for (const e of errors) {
            logger.error(`COURSE VALIDATION: ${e}`, { domain: 'validation', operation: 'lint' });
        }
        throw new Error(`COURSE VALIDATION FAILED: ${errors.length} error(s) must be fixed. See individual errors above.`);
    }
}

// flattenStructure and registerInteractionId are imported from validation-rules.js

/**
 * Performs global validation across the entire course configuration.
 * No DOM needed — pure config/structure checks.
 */
function validateGlobalConfig(courseConfig, slides) {
    const warnings = [];
    const slideComponentPaths = new Set(slides.map(s => s.component));
    const allObjectiveIds = new Set();

    // 1. Check for orphaned slide files
    for (const knownFile of slideModuleRegistry.keys()) {
        if (!slideComponentPaths.has(knownFile)) {
            warnings.push(`Orphaned File: Slide module "${knownFile}" exists but is not used in the course structure.`);
        }
    }

    // 2. Validate objectives
    if (courseConfig.objectives && Array.isArray(courseConfig.objectives)) {
        const allSlideIds = new Set(slides.map(s => s.id));

        for (const objective of courseConfig.objectives) {
            if (!objective.id) {
                warnings.push('Objective missing required \'id\' property.');
                continue;
            }
            allObjectiveIds.add(objective.id);

            if (objective.criteria) {
                const criteria = objective.criteria;
                if (criteria.type === 'slideVisited' && criteria.slideId && !allSlideIds.has(criteria.slideId)) {
                    warnings.push(`Objective "${objective.id}" has 'slideVisited' criteria with an invalid slideId: "${criteria.slideId}".`);
                }
                if (criteria.type === 'allSlidesVisited' && Array.isArray(criteria.slideIds)) {
                    for (const slideId of criteria.slideIds) {
                        if (!allSlideIds.has(slideId)) {
                            warnings.push(`Objective "${objective.id}" has 'allSlidesVisited' criteria with an invalid slideId: "${slideId}".`);
                        }
                    }
                }
                if (criteria.type === 'timeOnSlide' && criteria.slideId && !allSlideIds.has(criteria.slideId)) {
                    warnings.push(`Objective "${objective.id}" has 'timeOnSlide' criteria with an invalid slideId: "${criteria.slideId}".`);
                }
            }
        }
    }

    return { warnings, objectiveIds: allObjectiveIds };
}

/**
 * Collects all audio files referenced in course-config slide configurations.
 * No DOM needed — reads from config objects only.
 */
function collectReferencedAudioFiles(slides) {
    const referenced = new Set();

    for (const slide of slides) {
        if (!slide.audio?.src) continue;

        const src = slide.audio.src;
        let audioFilename = null;

        if (src.startsWith('@slides/')) {
            const match = src.match(/@slides\/([^.]+)\.js(?:#(.+))?/);
            if (match) {
                const slideBase = match[1];
                const key = match[2];
                audioFilename = key ? `${slideBase}--${key}.mp3` : `${slideBase}.mp3`;
            }
        } else {
            audioFilename = src.split('/').pop();
        }

        if (audioFilename) {
            referenced.add(audioFilename);
        }
    }

    return referenced;
}

/**
 * Validates a single slide's configuration.
 * Single render per slide: loads module, renders once to offscreen container,
 * runs ALL checks (audio, engagement, visual, CSS), then cleans up.
 */
async function validateSlide(slide, objectiveIds, errors, warnings, interactionIdRegistry, validCssClasses, layout, referencedAudioFiles) {
    logger.debug(`[RuntimeLinter]   Validating ${slide.id}...`);

    // Check for engagement configuration
    if (!slide.engagement) {
        errors.push(`Slide "${slide.id}" (${slide.component}) is missing required 'engagement' configuration. Add "engagement: { required: false }" at minimum.`);
        return;
    }

    const engagement = slide.engagement;
    const isAssessment = slide.type === 'assessment';

    if (isAssessment) {
        logger.debug(`[RuntimeLinter]   ${slide.id} is an assessment - validating config without DOM rendering`);

        try {
            const slideModule = await loadSlideModule(slide.component);

            if (slideModule.config) {
                if (slideModule.config.id && slideModule.config.id !== slide.id) {
                    errors.push(`Assessment ID mismatch: course-config.js declares slide id="${slide.id}" but ${slide.component} exports config.id="${slideModule.config.id}". These must match for proper SCORM tracking.`);
                }

                const assessmentConfig = extractCompleteAssessmentConfig(slideModule, slide.id);
                if (assessmentConfig) {
                    validateAssessmentConfig(assessmentConfig, slide.id, objectiveIds, errors, warnings, interactionIdRegistry);
                }
            } else {
                errors.push(`Slide "${slide.id}" is marked as type='assessment' but does not export a 'config' object.`);
            }
        } catch (error) {
            errors.push(`Slide "${slide.id}" (assessment) failed to load: ${error.message}`);
        }

        return; // Skip DOM rendering and visual validation for assessments
    }

    // --- Single render for all DOM-based checks ---
    try {
        const slideModule = await loadSlideModule(slide.component);
        const renderedContent = await renderSlideToDOM(slideModule);

        // 1. Scan inline audio references (folded in from the deleted collectInlineAudioReferences)
        const audioElements = renderedContent.querySelectorAll('[data-audio-src]');
        for (const el of audioElements) {
            const src = el.dataset.audioSrc;
            if (src) {
                referencedAudioFiles.add(src.split('/').pop());
            }
        }

        // 2. Audio conflict check (slide audio vs modal/standalone audio)
        if (slide.audio && slide.audio.src) {
            const modalsWithAudio = renderedContent.querySelectorAll('[data-modal-trigger][data-audio-src], [data-component="modal-trigger"][data-audio-src]');
            for (const modal of modalsWithAudio) {
                const modalLabel = modal.textContent.trim().substring(0, 40);
                errors.push(`Slide "${slide.id}" cannot have both slide audio and modal audio (constraint: singleton audio element). Remove audio from modal "${modalLabel}" or remove slide audio.`);
            }

            const standaloneAudioPlayers = renderedContent.querySelectorAll('[data-component="audio-player"]');
            if (standaloneAudioPlayers.length > 0) {
                errors.push(`Slide "${slide.id}" cannot have both slide audio and standalone audio players (constraint: singleton audio element). Remove data-component="audio-player" elements or remove slide audio.`);
            }
        }

        // 3. Engagement validation
        if (!engagement.required) {
            logger.debug(`[RuntimeLinter]   ${slide.id} has required=false, skipping engagement validation`);
        } else {
            if (!engagement.requirements || !Array.isArray(engagement.requirements)) {
                errors.push(`Slide "${slide.id}" has engagement.required=true but no requirements array defined.`);
            } else if (engagement.requirements.length === 0) {
                warnings.push(`Slide "${slide.id}" has engagement.required=true but empty requirements array. Set required=false if no tracking needed.`);
            } else {
                if (engagement.mode && !['all', 'any'].includes(engagement.mode)) {
                    errors.push(`Slide "${slide.id}" has invalid engagement.mode "${engagement.mode}". Must be "all" or "any".`);
                }

                for (const req of engagement.requirements) {
                    validateRequirement(slide.id, req, renderedContent, errors, warnings);
                }
            }

            const declarativeInteractions = renderedContent.querySelectorAll('[data-interaction-id]');
            for (const interaction of declarativeInteractions) {
                registerInteractionId(interaction.dataset.interactionId, slide.id, 'DOM Interaction', interactionIdRegistry, errors);
            }
        }

        // 4. Gating conditions
        if (slide.navigation?.gating) {
            validateGatingConditions(slide.id, slide.navigation.gating, objectiveIds, errors);
        }

        // 5. Assessment config on non-assessment slides
        if (slideModule.assessmentConfig || slideModule.config) {
            const assessmentConfig = extractCompleteAssessmentConfig(slideModule, slide.id);
            if (assessmentConfig) {
                validateAssessmentConfig(assessmentConfig, slide.id, objectiveIds, errors, warnings, interactionIdRegistry);
            }
        }

        // 6. Visual layout and CSS class validation (skip for canvas layout)
        if (layout !== 'canvas') {
            validateVisualLayout(slide.id, renderedContent, errors, warnings);
            validateCssClasses(slide.id, renderedContent, validCssClasses, warnings);
            validateButtonVariants(slide.id, renderedContent, warnings);
        }

        // 7. Modal audio patterns
        validateModalAudioPatterns(slide.id, renderedContent, warnings);

        // 8. Component structure
        validateComponentStructure(slide.id, renderedContent, warnings);

        // Cleanup — remove rendered content from offscreen container
        renderedContent.remove();
    } catch (error) {
        errors.push(`Slide "${slide.id}" failed to load or render: ${error.message}`);
    }
}

/**
 * Dynamically loads a slide module using the Vite glob registry.
 * @param {string} componentPath - The component path (e.g., '@slides/intro-01.js')
 * @returns {Promise<object>} The slide module
 */
async function loadSlideModule(componentPath) {
    const loader = slideModuleRegistry.get(componentPath);

    if (!loader) {
        throw new Error(`Slide module not found in registry: ${componentPath}. Available modules: ${Array.from(slideModuleRegistry.keys()).join(', ')}`);
    }

    try {
        return await loader();
    } catch (error) {
        throw new Error(`Failed to load slide module ${componentPath}: ${error.message}`);
    }
}

/**
 * Renders a slide module into the offscreen container.
 * Uses the persistent offscreen container so getComputedStyle works without
 * causing visible layout recalculations.
 */
async function renderSlideToDOM(slideModule) {
    if (!slideModule.slide || typeof slideModule.slide.render !== 'function') {
        throw new Error('Slide module must export a "slide" object with a "render" function');
    }

    // Clear interaction registry before each render to prevent duplicate ID errors
    interactionRegistry.clear();

    const context = {};
    const slideId = slideModule.slide.id || 'UNKNOWN_SLIDE';

    let slideContainer;
    try {
        slideContainer = slideModule.slide.render(null, context);
    } catch (err) {
        if (err.message && err.message.includes('StateManager: Not initialized')) {
            slideContainer = document.createElement('div');
            slideContainer.innerHTML = '<p>Mock content for linting validation</p>';
        } else {
            throw new Error(`Slide "${slideId}" render() failed: ${err.message}`);
        }
    }

    if (!slideContainer) {
        throw new Error(`Slide "${slideId}" render() returned null/undefined. Must return a DOM element.`);
    }

    // Append to offscreen container (not document.body) — allows getComputedStyle
    // without triggering visible layout recalculations
    const container = getOffscreenContainer();
    container.appendChild(slideContainer);

    return slideContainer;
}

/**
 * Extracts the complete assessment configuration from a slide module.
 * Assessment slides define questions/questionBanks inside render() and merge with config,
 * so we need to parse the render function to find the complete configuration.
 * 
 * @param {object} slideModule - The imported slide module
 * @param {string} slideId - The slide identifier for error messages
 * @returns {object|null} Complete assessment config with questions/questionBanks, or null if extraction fails
 */
function extractCompleteAssessmentConfig(slideModule, slideId) {
    const baseConfig = slideModule.assessmentConfig || slideModule.config;
    if (!baseConfig) return null;

    // Check if questionBanks exist but don't have 'questions' arrays - this means they're defined in render()
    let hasRuntimeQuestionBanks = false;
    if (Array.isArray(baseConfig.questionBanks) && baseConfig.questionBanks.length > 0) {
        // Check if any bank is missing the 'questions' array (just has id/selectCount template)
        const hasBanksWithoutQuestions = baseConfig.questionBanks.some(bank =>
            !bank.questions || bank.questions.length === 0
        );

        if (hasBanksWithoutQuestions) {
            hasRuntimeQuestionBanks = true;
            logger.debug(`[RuntimeLinter]   ${slideId}: questionBanks defined without questions array - questions defined in render()`);
        }
    }

    // Check if questions array is missing entirely - might be defined in render()
    let hasRuntimeQuestions = false;
    if (!baseConfig.questions && !baseConfig.questionBanks) {
        // No questions or banks in config - check if render function likely defines them
        hasRuntimeQuestions = true;
        logger.debug(`[RuntimeLinter]   ${slideId}: No questions/questionBanks in config - likely defined in render()`);
    }

    // If questions or questionBanks are defined in render and merged with config,
    // we can trust that they exist at runtime even though they're not in the exported config
    if (hasRuntimeQuestions || hasRuntimeQuestionBanks) {
        logger.debug(`[RuntimeLinter]   ${slideId}: Marking assessment for runtime question validation skip`);
        // Return a synthetic config that indicates validation should be skipped for question content
        return {
            ...baseConfig,
            _hasRuntimeQuestions: hasRuntimeQuestions,
            _hasRuntimeQuestionBanks: hasRuntimeQuestionBanks
        };
    }

    logger.debug(`[RuntimeLinter]   ${slideId}: Questions/questionBanks found in config - will validate statically`);
    // Otherwise return the base config (which should have questions/questionBanks already)
    return baseConfig;
}

// validateAssessmentConfig and validateQuestionConfig are imported from validation-rules.js


/**
 * Validates a single requirement against rendered slide content.
 * @param {string} slideId - The slide identifier
 * @param {object} requirement - The requirement configuration
 * @param {HTMLElement} renderedContent - The rendered slide DOM
 * @param {array} errors - Array to collect errors
 * @param {array} warnings - Array to collect warnings
 */
function validateRequirement(slideId, requirement, renderedContent, errors, _warnings) {
    const type = requirement.type;

    // Schema-driven: build reverse map from engagementTracking -> componentType
    const registeredTypes = getRegisteredComponentTypes();
    for (const componentType of registeredTypes) {
        const meta = getComponentMetadata(componentType);
        if (meta?.engagementTracking === type) {
            // This is a component-linked requirement — check DOM for component
            const component = renderedContent.querySelector(`[data-component="${componentType}"]`);
            if (!component) {
                errors.push(`Slide "${slideId}" has '${type}' requirement but no ${componentType} component found. Add data-component="${componentType}" or remove this requirement.`);
                return;
            }
            // Component exists — schema.structure children are validated by validateComponentStructure
            return;
        }
    }

    // Non-component requirement types — validate config properties
    switch (type) {
        case 'interactionComplete': {
            if (!requirement.interactionId) {
                errors.push(`Slide "${slideId}" has 'interactionComplete' requirement without interactionId. Add interactionId property.`);
                return;
            }
            const interaction = renderedContent.querySelector(`[data-interaction-id="${requirement.interactionId}"]`);
            if (!interaction) {
                errors.push(`Slide "${slideId}" requires interaction "${requirement.interactionId}" but it doesn't exist in the rendered content. Check the interactionId.`);
            }
            break;
        }

        case 'allInteractionsComplete': {
            const interactions = renderedContent.querySelectorAll('[data-interaction-id]');
            if (interactions.length === 0) {
                errors.push(`Slide "${slideId}" has 'allInteractionsComplete' requirement but no interactions found. Add interactions or remove this requirement.`);
            }
            break;
        }

        case 'scrollDepth': {
            if (!requirement.percentage && !requirement.minPercentage) {
                errors.push(`Slide "${slideId}" has 'scrollDepth' requirement without percentage or minPercentage property.`);
            }
            const percentage = requirement.percentage || requirement.minPercentage;
            if (percentage < 0 || percentage > 100) {
                errors.push(`Slide "${slideId}" scrollDepth percentage must be between 0-100 (got ${percentage}).`);
            }
            break;
        }

        case 'timeOnSlide': {
            if (!requirement.minSeconds) {
                errors.push(`Slide "${slideId}" has 'timeOnSlide' requirement without minSeconds property.`);
            }
            if (requirement.minSeconds < 0) {
                errors.push(`Slide "${slideId}" timeOnSlide minSeconds must be positive (got ${requirement.minSeconds}).`);
            }
            break;
        }

        case 'flag': {
            if (!requirement.key) {
                errors.push(`Slide "${slideId}" has 'flag' requirement without key property.`);
            }
            break;
        }

        case 'allFlags': {
            if (!requirement.flags || !Array.isArray(requirement.flags)) {
                errors.push(`Slide "${slideId}" has 'allFlags' requirement without flags array.`);
                return;
            }
            if (requirement.flags.length === 0) {
                errors.push(`Slide "${slideId}" has 'allFlags' requirement with empty flags array.`);
            }
            break;
        }

        case 'slideAudioComplete':
            break;

        case 'audioComplete': {
            if (!requirement.audioId) {
                errors.push(`Slide "${slideId}" has 'audioComplete' requirement without audioId property.`);
            }
            break;
        }

        case 'modalAudioComplete': {
            if (!requirement.modalId) {
                errors.push(`Slide "${slideId}" has 'modalAudioComplete' requirement without modalId property.`);
            }
            break;
        }

        default:
            errors.push(`Slide "${slideId}" has unknown requirement type: "${type}".`);
    }
}


/**
 * Parses an RGB or RGBA color string into an array of [r, g, b, a] values.
 * @param {string} rgbString - e.g., "rgb(255, 255, 255)" or "rgba(255, 255, 255, 0.5)"
 * @returns {array|null} - [r, g, b, a] or null if parse fails. Alpha defaults to 1.
 */
function parseRgba(rgbString) {
    if (!rgbString) return null;
    const match = rgbString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
    if (!match) return null;
    return [
        parseInt(match[1]),
        parseInt(match[2]),
        parseInt(match[3]),
        match[4] ? parseFloat(match[4]) : 1
    ];
}

/**
 * Composites a semi-transparent foreground color over a background color.
 * @param {array} fg - [r, g, b, a] foreground color
 * @param {array} bg - [r, g, b, a] background color
 * @returns {array} - [r, g, b] composited color
 */
function compositeColors(fg, bg) {
    const alpha = fg[3];
    return [
        Math.round(fg[0] * alpha + bg[0] * (1 - alpha)),
        Math.round(fg[1] * alpha + bg[1] * (1 - alpha)),
        Math.round(fg[2] * alpha + bg[2] * (1 - alpha))
    ];
}

/**
 * Calculates the relative luminance of an RGB color.
 * Formula from WCAG guidelines.
 * @param {array} rgb - [r, g, b]
 * @returns {number} - Luminance value from 0 to 1.
 */
function getLuminance(rgb) {
    const [r, g, b] = rgb.map(c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculates the contrast ratio between two RGB colors.
 * @param {array} rgb1 
 * @param {array} rgb2 
 * @returns {number} - The contrast ratio.
 */
function getContrastRatio(rgb1, rgb2) {
    const lum1 = getLuminance(rgb1);
    const lum2 = getLuminance(rgb2);
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Traverses up the DOM tree and composites all semi-transparent backgrounds
 * to calculate the effective background color.
 * @param {HTMLElement} element 
 * @returns {array} - [r, g, b] effective background color
 */
function getEffectiveBackgroundColor(element) {
    const layers = [];
    let current = element;

    // Collect all background colors up the tree
    while (current && current.tagName !== 'HTML') {
        const style = window.getComputedStyle(current);
        const bgColor = style.backgroundColor;

        if (bgColor && bgColor !== 'transparent') {
            const rgba = parseRgba(bgColor);
            if (rgba && rgba[3] > 0) {
                layers.push(rgba);
                // If we hit a fully opaque layer, we can stop
                if (rgba[3] === 1) break;
            }
        }

        current = current.parentElement;
    }

    // If no backgrounds found, assume white
    if (layers.length === 0) {
        return [255, 255, 255];
    }

    // Composite all layers from back to front
    let result = layers[layers.length - 1];

    // If the bottom layer isn't fully opaque, composite it over white
    if (result[3] < 1) {
        result = [...compositeColors(result, [255, 255, 255, 1]), 1];
    }

    // Composite remaining layers front to back
    for (let i = layers.length - 2; i >= 0; i--) {
        result = [...compositeColors(layers[i], result), 1];
    }

    return [result[0], result[1], result[2]];
}


/**
 * Builds a compact description of an element and its ancestry for lint messages.
 * Shows the element's tag + classes and the nearest meaningful ancestor's tag + classes.
 * @param {HTMLElement} el - The element to describe
 * @returns {string} Multiline context string, e.g. "Element: <h2 class=\"text-white mb-2\">\n  Parent: <div class=\"hero-gradient p-6\">"
 */
function getElementClassContext(el) {
    const describeEl = (element) => {
        const tag = element.tagName.toLowerCase();
        const classes = Array.from(element.classList).join(' ');
        return classes ? `<${tag} class="${classes}">` : `<${tag}>`;
    };

    const lines = [`Element: ${describeEl(el)}`];

    // Walk up to find the first ancestor with CSS classes (skip classless wrappers)
    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 5) {
        if (parent.classList.length > 0 && parent.tagName !== 'HTML' && parent.tagName !== 'BODY') {
            lines.push(`Parent: ${describeEl(parent)}`);
            break;
        }
        parent = parent.parentElement;
        depth++;
    }

    return lines.join('\n  ');
}

/**
 * Validates visual layout and accessibility issues in rendered slide content.
 * Catches common mistakes like nested cards, missing alt text, etc.
 * @param {string} slideId - The slide identifier
 * @param {HTMLElement} renderedContent - The rendered slide DOM
 * @param {array} errors - Array to collect errors
 * @param {array} warnings - Array to collect warnings
 */
function validateVisualLayout(slideId, renderedContent, errors, warnings) {
    const MIN_CONTRAST_RATIO_AA = 4.5;
    const MIN_CONTRAST_RATIO_LARGE_AA = 3;
    const MIN_FONT_SIZE_PX = 14;
    const MIN_TARGET_SIZE_PX = 32; // Relaxed from 44px based on user feedback

    try {
        // --- NEW: ACCESSIBILITY & VISUAL CHECKS ---

        // Check 1: Text legibility (font size and color contrast)
        const textElements = renderedContent.querySelectorAll('p, span:not(.accordion-icon), li, a, h1, h2, h3, h4, h5, h6, button');
        for (const el of textElements) {
            if (isLintIgnored(el, 'contrast')) continue;
            // Skip elements that are not visible or have no text
            if (el.offsetParent === null || el.textContent.trim() === '') continue;

            // Skip disabled buttons (framework handles contrast for these)
            if (el.tagName === 'BUTTON' && el.hasAttribute('disabled')) continue;

            // Skip elements that only contain emojis or special characters
            const textContent = el.textContent.trim();
            if (/^[\u{1F300}-\u{1F9FF}\s]*$/u.test(textContent)) continue;

            // Skip if this element's text is entirely contained in child elements
            // (to avoid duplicate checking of parent containers)
            const childTextLength = Array.from(el.children).reduce((sum, child) =>
                sum + child.textContent.length, 0);
            if (childTextLength > textContent.length * 0.9) continue;

            const style = window.getComputedStyle(el);
            const fontSize = parseInt(style.fontSize, 10);
            const fontWeight = parseInt(style.fontWeight, 10) || 400;

            // Font size check
            // Skip elements using intentional small text classes from the design system
            // Also skip if font size matches design system values (12px = text-xs, 14px = text-sm)
            const hasIntentionalSmallText = el.classList.contains('text-xs') ||
                el.classList.contains('text-sm') ||
                el.closest('.text-xs') !== null ||
                el.closest('.text-sm') !== null ||
                el.closest('.step-number') !== null ||
                el.closest('.step') !== null ||
                fontSize === 12;  // Matches text-xs (0.75rem = 12px)
            if (fontSize < MIN_FONT_SIZE_PX && !hasIntentionalSmallText) {
                warnings.push(`Slide "${slideId}": Text with font size ${fontSize}px is smaller than the recommended minimum of ${MIN_FONT_SIZE_PX}px. Text: "${textContent.substring(0, 30)}..."\n  ${getElementClassContext(el)}`);
            }

            // Color contrast check (CSS visual issue - warnings only, does not block)
            // Skip badges - they use intentional design system colors
            if (el.classList.contains('badge') || el.closest('.badge') !== null) continue;

            // Skip contrast check for elements on gradient backgrounds (can't reliably compute)
            const hasGradientBackground = el.closest('.gradient') !== null ||
                el.closest('.gradient-light') !== null ||
                el.closest('.hero-gradient') !== null ||
                el.closest('.btn-gradient') !== null ||
                el.closest('[class*="bg-gradient-dark"]') !== null ||
                el.closest('[class*="gradient-header"]') !== null ||
                el.closest('[class*="gradient-success"]') !== null ||
                el.closest('[class*="gradient-progress"]') !== null ||
                el.closest('[style*="linear-gradient"]') !== null ||
                el.closest('[style*="radial-gradient"]') !== null ||
                style.backgroundImage.includes('gradient');
            if (hasGradientBackground) continue;

            const textColorStr = style.color;
            const bgColorRgb = getEffectiveBackgroundColor(el);
            const textColorRgba = parseRgba(textColorStr);

            if (textColorRgba && bgColorRgb) {
                // If text color has transparency, composite it over the background
                const textColorRgb = textColorRgba[3] < 1
                    ? compositeColors(textColorRgba, [...bgColorRgb, 1])
                    : [textColorRgba[0], textColorRgba[1], textColorRgba[2]];

                const ratio = getContrastRatio(textColorRgb, bgColorRgb);
                const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
                const minRatio = isLargeText ? MIN_CONTRAST_RATIO_LARGE_AA : MIN_CONTRAST_RATIO_AA;

                if (ratio < minRatio) {
                    const colorInfo = `Colors: text ${textColorStr} on bg rgb(${bgColorRgb.join(',')})`;
                    warnings.push(`Slide "${slideId}": Poor color contrast (${ratio.toFixed(2)}:1) for text "${textContent.substring(0, 30)}...". Must be at least ${minRatio}:1.\n  ${getElementClassContext(el)}\n  ${colorInfo}`);
                }
            }
        }

        // Check 2: Minimum target size for interactive elements
        const interactiveElements = renderedContent.querySelectorAll('a, button, [role="button"], [data-interaction-id]');
        for (const el of interactiveElements) {
            if (el.offsetParent === null) continue; // Skip hidden elements
            if (isLintIgnored(el, 'target-size')) continue;

            // Skip elements with intentionally small sizes (demo purposes, decorative, etc.)
            if (el.classList.contains('btn-sm') || el.classList.contains('btn-disabled')) continue;
            if (el.hasAttribute('disabled')) continue;

            // Skip links that are in lists or code blocks (documentation/reference contexts)
            if (el.tagName === 'A' && el.closest('li')) continue;
            if (el.tagName === 'A' && el.closest('code')) continue;

            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && (rect.width < MIN_TARGET_SIZE_PX || rect.height < MIN_TARGET_SIZE_PX)) {
                warnings.push(`Slide "${slideId}": Interactive element (${Math.round(rect.width)}x${Math.round(rect.height)}px) is smaller than ${MIN_TARGET_SIZE_PX}x${MIN_TARGET_SIZE_PX}px. Text: "${el.textContent.trim().substring(0, 30)}..."\n  ${getElementClassContext(el)}`);
            }
        }

        // --- ORIGINAL CHECKS (RETAINED & IMPROVED) ---

        // Check 3: Images without alt text (WCAG violation)
        const images = renderedContent.querySelectorAll('img');
        for (const img of images) {
            if (!img.hasAttribute('alt')) {
                errors.push(`Slide "${slideId}": Image missing alt attribute: ${img.src || 'unknown source'}`);
            } else if (img.getAttribute('alt') === '') {
                warnings.push(`Slide "${slideId}": Image has empty alt text (only use for decorative images): ${img.src || 'unknown source'}`);
            }
        }

        // Check 4: Empty headings
        const headings = renderedContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
        for (const heading of headings) {
            if (heading.textContent.trim() === '') {
                errors.push(`Slide "${slideId}": Empty ${heading.tagName} found - headings must have text content.`);
            }
        }

        // Check 6: Very long lists (UX issue)
        const lists = renderedContent.querySelectorAll('ul, ol');
        for (const list of lists) {
            const items = list.querySelectorAll(':scope > li');
            if (items.length > 8) {
                warnings.push(`Slide "${slideId}": List with ${items.length} items - consider using accordion or breaking into sections.`);
            }
        }

        // Check 7: Buttons without .btn class (but not framework component buttons)
        const buttons = renderedContent.querySelectorAll('button:not([data-component]):not(.btn)');
        for (const btn of buttons) {
            // Skip buttons that are inside framework components (tabs, accordions, interactions)
            const isInsideComponent = btn.closest('[data-component]') || btn.closest('[data-interaction-id]');
            if (isInsideComponent) continue;

            // Skip buttons that are part of framework UI (accordion icons, tab controls, etc.)
            if (btn.classList.contains('accordion-button') || btn.classList.contains('tab-button')) continue;

            const buttonText = btn.textContent.trim().substring(0, 30);
            warnings.push(`Slide "${slideId}": Button missing .btn class: "${buttonText}${buttonText.length >= 30 ? '...' : ''}"`);
        }

        // Check 8: Multiple h1 tags (SEO/accessibility issue)
        const h1s = renderedContent.querySelectorAll('h1');
        if (h1s.length > 1) {
            errors.push(`Slide "${slideId}": Found ${h1s.length} h1 tags - use only one per slide.`);
        }

        // Check 9: Links without proper attributes
        // Skip lightbox triggers and media component links - they open in overlays, not new tabs
        const externalLinks = renderedContent.querySelectorAll('a[href^="http"]');
        for (const link of externalLinks) {
            // Lightbox triggers open media in an overlay, not a new tab
            const isLightboxTrigger = link.dataset.component === 'lightbox';
            if (isLightboxTrigger) continue;

            // Links inside media components (video-player, carousel) are data sources, not navigation
            const isInsideMediaComponent = link.closest('[data-component="video-player"]') ||
                link.closest('[data-component="carousel"]');
            if (isInsideMediaComponent) continue;

            if (!link.hasAttribute('target')) {
                warnings.push(`Slide "${slideId}": External link missing target="_blank": ${link.href.substring(0, 50)}`);
            }
            if (!link.getAttribute('rel') || !link.getAttribute('rel').includes('noopener')) {
                warnings.push(`Slide "${slideId}": External link missing rel="noopener noreferrer": ${link.href.substring(0, 50)}`);
            }
        }

        // Check 10: Text too close to visual elements (borders, shadows, backgrounds)
        validateTextProximityToVisualElements(slideId, renderedContent, warnings);

        // Check 11: Element overlap and visual collision detection
        validateElementOverlap(slideId, renderedContent, warnings);

        // Check 13: Element spacing — missing gaps in flex/grid, zero-margin siblings, unpadded containers
        validateElementSpacing(slideId, renderedContent, warnings);

        // Check 14: Content overflow — content exceeding its container
        validateContentOverflow(slideId, renderedContent, warnings);

        // Check 12: Styled lists validation
        validateStyledLists(slideId, renderedContent, warnings);

    } catch (error) {
        logger.error(`[RuntimeLinter] Visual validation error for slide "${slideId}":`, error);
        // Don't add to errors array - visual validation failures shouldn't block course loading
    }
}

/**
 * Validates that text elements have sufficient padding/spacing from visual borders and visual elements.
 * Detects text that may appear too close to borders (any side), box-shadows, or background edges.
 * @param {string} slideId - The slide identifier
 * @param {HTMLElement} renderedContent - The rendered slide DOM
 * @param {array} warnings - Array to collect warnings
 */
function validateTextProximityToVisualElements(slideId, renderedContent, warnings) {
    const MIN_PADDING_THICK_BORDER_PX = 12;  // Minimum padding for thick borders (>2px)
    const MIN_PADDING_THIN_BORDER_PX = 4;    // Minimum padding for hairline borders (≤2px)
    const MIN_PADDING_SHADOW_PX = 8;         // Minimum padding from box-shadow edges
    const THICK_BORDER_THRESHOLD = 2;        // Borders >2px are considered "thick/structural"

    // Framework components that manage their own internal spacing (exclude from checks)
    // These are EXACT class names that should be excluded
    const FRAMEWORK_COMPONENT_EXACT = new Set([
        'accordion', 'accordion-item', 'accordion-header', 'accordion-content',
        'tab-button', 'tab-content', 'tab-list', 'content-tabs', 'assessment-tabs',
        'card', 'card-header', 'card-body', 'card-footer',
        'modal', 'modal-content', 'modal-header', 'modal-body', 'modal-footer',
        'callout', 'alert', 'notification',
        'carousel', 'carousel-item',
        'dropdown', 'dropdown-menu', 'dropdown-item',
        'table',  // Tables manage their own cell spacing
        'step-number', 'step-content', 'step',  // Pattern-steps elements have intentional circular styling
        'btn-link'  // Link-styled button intentionally has minimal padding
    ]);

    // HTML elements that manage their own spacing (exclude from checks)
    const FRAMEWORK_ELEMENT_TAGS = new Set(['THEAD', 'TBODY', 'TR', 'TH', 'TD', 'TABLE']);

    // Helper: Check if element is a semantic container with block-level children
    // Containers are excluded from border/padding validation because they manage spacing for children
    const isSemanticContainer = (el) => {
        // Block-level elements that provide their own spacing
        const blockLevelTags = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'UL', 'OL', 'DIV', 'SECTION', 'ARTICLE', 'BUTTON', 'A']);

        // Get direct children (not all descendants)
        const children = Array.from(el.children);

        // If no children, it's not a container
        if (children.length === 0) return false;

        // Container-style patterns: Has multiple children of consistent type OR is known container type
        const isContainerType = ['DIV', 'SECTION', 'ARTICLE', 'UL', 'OL'].includes(el.tagName);
        const hasMultipleChildren = children.length >= 2;

        // Check if all children are block-level or interactive elements
        const allChildrenAreBlockLevel = children.every(child => blockLevelTags.has(child.tagName));

        // Check if element has minimal direct text (only whitespace/formatting)
        // Containers pass text to children, so they shouldn't have direct text
        const directText = Array.from(el.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent.trim())
            .join('');
        const hasMinimalDirectText = directText.length < 10;

        // It's a container if: it looks like one AND doesn't hold direct text
        return isContainerType && (allChildrenAreBlockLevel || hasMultipleChildren) && hasMinimalDirectText;
    };

    // Helper: Get effective spacing for child elements
    const getChildMargin = (el, side) => {
        const children = Array.from(el.children);
        if (children.length === 0) return 0;

        const firstChild = children[0];
        const firstChildStyle = window.getComputedStyle(firstChild);

        switch (side) {
            case 'left': return parseFloat(firstChildStyle.marginLeft);
            case 'right': return parseFloat(firstChildStyle.marginRight);
            case 'top': return parseFloat(firstChildStyle.marginTop);
            case 'bottom': return parseFloat(firstChildStyle.marginBottom);
            default: return 0;
        }
    };

    // Single pass: check ALL elements for borders AND box-shadows
    const allElements = renderedContent.querySelectorAll('*');
    for (const el of allElements) {
        if (el.offsetParent === null) continue;
        if (isLintIgnored(el, 'proximity')) continue;
        if (el.textContent.trim() === '') continue;

        // Skip framework components that manage their own spacing
        const classes = el.className.toString().split(' ');
        if (classes.some(cls => FRAMEWORK_COMPONENT_EXACT.has(cls))) continue;

        // Skip HTML elements that manage their own spacing (tables, etc.)
        if (FRAMEWORK_ELEMENT_TAGS.has(el.tagName)) continue;

        const style = window.getComputedStyle(el);
        const elementDesc = el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase();

        // --- Border proximity checks ---
        const isSemantic = isSemanticContainer(el);

        const checkBorder = (side, borderWidth, padding) => {
            if (borderWidth > 0) {
                const isThickBorder = borderWidth > THICK_BORDER_THRESHOLD;
                const minPadding = isThickBorder ? MIN_PADDING_THICK_BORDER_PX : MIN_PADDING_THIN_BORDER_PX;

                let effectiveSpacing = padding;
                if (isSemantic) {
                    const childMargin = getChildMargin(el, side);
                    effectiveSpacing = Math.max(padding, childMargin);
                    if (effectiveSpacing >= minPadding) return;
                }

                if (effectiveSpacing < minPadding) {
                    const textPreview = el.textContent.trim().substring(0, 40);
                    const borderType = isThickBorder ? 'thick' : 'hairline';
                    warnings.push(`Slide "${slideId}": Element (${elementDesc}) with ${borderType} ${side} border (${borderWidth.toFixed(1)}px) has insufficient ${side} ${isSemantic ? 'spacing' : 'padding'} (${effectiveSpacing.toFixed(0)}px, need ≥${minPadding}px). Content: "${textPreview}..."\n  ${getElementClassContext(el)}`);
                }
            }
        };

        checkBorder('left', parseFloat(style.borderLeftWidth), parseFloat(style.paddingLeft));
        checkBorder('right', parseFloat(style.borderRightWidth), parseFloat(style.paddingRight));
        checkBorder('top', parseFloat(style.borderTopWidth), parseFloat(style.paddingTop));
        checkBorder('bottom', parseFloat(style.borderBottomWidth), parseFloat(style.paddingBottom));

        // --- Box-shadow proximity check ---
        const boxShadow = style.boxShadow;
        if (boxShadow && boxShadow !== 'none') {
            const padding = Math.min(
                parseFloat(style.paddingLeft),
                parseFloat(style.paddingRight),
                parseFloat(style.paddingTop),
                parseFloat(style.paddingBottom)
            );

            if (padding < MIN_PADDING_SHADOW_PX) {
                const textPreview = el.textContent.trim().substring(0, 40);
                warnings.push(`Slide "${slideId}": Element (${elementDesc}) with box-shadow has minimal internal padding (${padding}px, recommended ≥8px for visual breathing room). Content: "${textPreview}..."\n  ${getElementClassContext(el)}`);
            }
        }
    }
}

/**
 * Validates for element overlap and visual collisions.
 * Detects absolutely positioned elements, floating elements, or z-index layering issues.
 * @param {string} slideId - The slide identifier
 * @param {HTMLElement} renderedContent - The rendered slide DOM
 * @param {array} warnings - Array to collect warnings
 */
function validateElementOverlap(slideId, renderedContent, warnings) {
    // Check for absolutely positioned elements that might overlap
    const absoluteElements = renderedContent.querySelectorAll('[style*="position:absolute"], [style*="position: absolute"]');
    for (const el of absoluteElements) {
        if (el.offsetParent === null) continue;

        const rect = el.getBoundingClientRect();
        const elText = el.textContent.trim().substring(0, 30);

        // Check against all other visible elements
        const allElements = renderedContent.querySelectorAll('*');
        for (const other of allElements) {
            if (other === el || other.offsetParent === null) continue;

            const otherRect = other.getBoundingClientRect();

            // Simple AABB collision detection
            if (rect.right > otherRect.left && rect.left < otherRect.right &&
                rect.bottom > otherRect.top && rect.top < otherRect.bottom) {

                // Skip if one element is a child of the other
                if (el.contains(other) || other.contains(el)) continue;

                warnings.push(`Slide "${slideId}": Possible visual overlap detected - absolutely positioned element ("${elText}...") may overlap other content. Check z-index layering.`);
                break; // Only warn once per element
            }
        }
    }

    // Check for floating elements
    const floatElements = renderedContent.querySelectorAll('[style*="float:left"], [style*="float:right"], [style*="float: left"], [style*="float: right"]');
    if (floatElements.length > 1) {
        warnings.push(`Slide "${slideId}": Found ${floatElements.length} floating elements - be cautious of layout shifts and overlaps. Consider using flexbox/grid instead.`);
    }

    // Check for high z-index values that might cause layering issues
    const zIndexElements = renderedContent.querySelectorAll('[style*="z-index"]');
    const highZIndices = Array.from(zIndexElements)
        .map(el => ({
            el,
            zIndex: parseInt(window.getComputedStyle(el).zIndex || 0)
        }))
        .filter(({ zIndex }) => zIndex > 1000);

    if (highZIndices.length > 2) {
        warnings.push(`Slide "${slideId}": Multiple elements with high z-index (>1000) detected - complex layering can cause accessibility and interaction issues.`);
    }
}

/**
 * Validates that lists with 3+ items in main content are using styled list classes.
 * Enforces consistent visual styling for better readability and hierarchy.
 * 
 * Rules:
 * - Main content lists with 3+ items MUST use .list-styled (unordered) or .list-numbered (ordered)
 * - Nested lists (inside accordions, collapsibles) are OPTIONAL (warns only)
 * - Intentional unstyled lists (inside code blocks, special formatting) can be ignored
 * 
 * @param {string} slideId - The slide identifier
 * @param {HTMLElement} renderedContent - The rendered slide DOM
 * @param {array} warnings - Array to collect warnings
 */
function validateStyledLists(slideId, renderedContent, warnings) {
    // Find all lists
    const lists = renderedContent.querySelectorAll('ul, ol');

    for (const list of lists) {
        // Count direct children list items
        const items = list.querySelectorAll(':scope > li');

        // Skip if fewer than 3 items (too small to warrant styling)
        if (items.length < 3) continue;

        // Skip if list is inside code blocks or pre tags
        if (list.closest('pre') || list.closest('code')) continue;

        // Determine if this is main content or nested content
        const isNestedInAccordion = !!list.closest('[data-component="accordion"], .accordion-content');
        const isNestedInCollapse = !!list.closest('[data-component="collapse"], .collapse-content');
        const isNestedInModal = !!list.closest('[data-component="modal"], .modal-content');
        const _isNestedInCard = !!list.closest('.card');
        const isInsideSpecialFormatting = !!list.closest('.pattern-');

        const isNested = isNestedInAccordion || isNestedInCollapse || isNestedInModal;

        // Check if list has styling (includes intentional unstyled patterns)
        const hasStyledClass = list.classList.contains('list-styled') ||
            list.classList.contains('list-numbered') ||
            list.classList.contains('list-disc') ||
            list.classList.contains('list-decimal') ||
            list.classList.contains('list-none');

        // Determine if list is an ordered or unordered list
        const isOrderedList = list.tagName === 'OL';
        const expectedClass = isOrderedList ? 'list-numbered' : 'list-styled';

        if (!hasStyledClass) {
            const listType = isOrderedList ? 'Ordered' : 'Unordered';
            const listContext = isNested ? 'nested' : 'main content';
            const listPreview = items[0]?.textContent.substring(0, 40) || 'list';

            if (isNested) {
                // Nested lists: warning only (optional styling)
                warnings.push(`Slide "${slideId}": ${listType} list with ${items.length} items in ${listContext} lacks styling. Consider using .${expectedClass} for consistency. First item: "${listPreview}..."`);
            } else if (!isInsideSpecialFormatting) {
                // Main content lists: error-level warning (should be styled)
                warnings.push(`Slide "${slideId}": Main content ${listType.toLowerCase()} list with ${items.length} items should use .${expectedClass} for improved readability and visual hierarchy. First item: "${listPreview}..."`);
            }
        }
    }
}

/**
 * Validates modal audio patterns.
 * Checks for declarative modal triggers with audio and reminds course authors about the pattern.
 * Note: Modal.js automatically renders compact audio controls in the footer when audio is present,
 * so course authors don't need to manually include them.
 * 
 * @param {string} slideId - The slide identifier
 * @param {HTMLElement} renderedContent - The rendered slide DOM
 * @param {array} warnings - Array to collect warnings
 */
function validateModalAudioPatterns(slideId, renderedContent, _warnings) {
    // Find all declarative modal triggers with audio configuration
    const modalTriggersWithAudio = renderedContent.querySelectorAll('[data-modal-trigger][data-audio-src], [data-component="modal-trigger"][data-audio-src]');

    if (modalTriggersWithAudio.length > 0) {
        // This is just a reminder note about the pattern
        logger.debug(`[RuntimeLinter]   ${slideId}: Found ${modalTriggersWithAudio.length} modal(s) with audio - framework handles compact audio player automatically in modal footer.`);

        // Optionally add a more detailed warning if required audio is used
        for (const trigger of modalTriggersWithAudio) {
            const isAudioRequired = trigger.getAttribute('data-audio-required') === 'true';
            if (isAudioRequired) {
                const triggerText = trigger.textContent.trim().substring(0, 40);
                logger.debug(`[RuntimeLinter]   ${slideId}: Modal "${triggerText}" has required audio - completion will be tracked automatically.`);
            }
        }
    }
}

/**
 * Validates component structure against catalog schemas.
 * Checks that required child elements exist within components.
 * 
 * @param {string} slideId - The slide identifier
 * @param {HTMLElement} renderedContent - The rendered slide DOM
 * @param {array} warnings - Array to collect warnings
 */
function validateComponentStructure(slideId, renderedContent, warnings) {
    const components = renderedContent.querySelectorAll('[data-component]');
    
    // Build set of known sub-component types from schema structure references
    // e.g. modal declares trigger: '[data-component="modal-trigger"]'
    const subComponentTypes = new Set();
    for (const type of getRegisteredComponentTypes()) {
        const schema = getComponentSchema(type);
        if (!schema?.structure) continue;
        for (const val of Object.values(schema.structure)) {
            if (typeof val === 'string') {
                const match = val.match(/data-component="([^"]+)"/);
                if (match) subComponentTypes.add(match[1]);
            }
        }
    }
    
    for (const component of components) {
        const type = component.dataset.component;
        
        // Skip known sub-component types (e.g. modal-trigger is part of modal)
        if (subComponentTypes.has(type)) continue;
        
        // Only validate components that are registered in the catalog
        if (!isComponentRegistered(type)) {
            warnings.push(`Slide "${slideId}": Unknown component type "${type}" - not found in component catalog.`);
            continue;
        }
        
        const schema = getComponentSchema(type);
        if (!schema || !schema.structure?.children) {
            continue; // No structure defined, skip validation
        }
        
        // Check for simplified syntax (e.g. accordion with data-title attributes)
        // Components using simplified authoring syntax have their children generated at init time
        const usesSimplifiedSyntax = component.querySelector(':scope > [data-title]');
        if (usesSimplifiedSyntax) continue;
        
        // Validate required children
        for (const [childName, childDef] of Object.entries(schema.structure.children)) {
            if (!childDef.required) continue;
            
            const selector = childDef.selector;
            const matches = component.querySelectorAll(selector);
            
            if (matches.length === 0) {
                warnings.push(`Slide "${slideId}": Component "${type}" missing required child "${childName}" (selector: ${selector}).`);
            } else if (childDef.minItems && matches.length < childDef.minItems) {
                warnings.push(`Slide "${slideId}": Component "${type}" has ${matches.length} "${childName}" element(s) but requires at least ${childDef.minItems}.`);
            }
        }
    }
}

/**
 * Builds a Set of all valid CSS class names from loaded stylesheets (CSSOM).
 * This is the runtime equivalent of lib/css-index.js — instead of parsing files
 * with PostCSS, we read the already-loaded stylesheets from the browser.
 *
 * @returns {Set<string>} Set of valid CSS class names
 */

/**
 * Validates element spacing — catches missing gaps, zero-margin siblings, and unpadded containers.
 * These are the most common visual layout issues in AI-authored slides.
 * 
 * Checks:
 * 1. Flex/grid containers with 2+ children but no gap
 * 2. Adjacent block siblings with zero gap between them
 * 3. Visual containers (background/border) with no internal padding
 * 
 * Suppressed by data-lint-ignore="spacing" on the element or any ancestor.
 * 
 * @param {string} slideId - The slide identifier
 * @param {HTMLElement} renderedContent - The rendered slide DOM
 * @param {array} warnings - Array to collect warnings
 */
function validateElementSpacing(slideId, renderedContent, warnings) {
    // Framework components that manage their own spacing (skip these)
    const FRAMEWORK_MANAGED = new Set([
        'accordion', 'accordion-item', 'accordion-header', 'accordion-content',
        'tab-button', 'tab-content', 'tab-list', 'content-tabs', 'assessment-tabs',
        'card', 'card-header', 'card-body', 'card-footer',
        'modal', 'modal-content', 'modal-header', 'modal-body', 'modal-footer',
        'callout', 'alert', 'notification',
        'carousel', 'carousel-item', 'carousel-controls',
        'dropdown', 'dropdown-menu', 'dropdown-item',
        'table', 'step', 'step-number', 'step-content',
        'list-styled', 'list-numbered',
        'btn', 'btn-group', 'badge',
        'pattern-steps', 'stat-card', 'stat-value',
        'nav-pills', 'breadcrumb'
    ]);

    // Tags considered block-level for sibling gap checking
    const BLOCK_TAGS = new Set([
        'DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
        'SECTION', 'ARTICLE', 'UL', 'OL', 'BLOCKQUOTE',
        'FIGURE', 'TABLE', 'FORM', 'DETAILS'
    ]);

    const isFrameworkManaged = (el) => {
        const classes = el.className?.toString().split(' ') || [];
        return classes.some(cls => FRAMEWORK_MANAGED.has(cls)) ||
            !!el.closest('[data-component]') ||
            !!el.closest('[data-interaction-id]');
    };

    const isVisible = (el) => {
        if (el.offsetParent === null && window.getComputedStyle(el).position !== 'fixed') return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    };

    // --- Check 1: Flex/grid containers without gap ---
    const allElements = renderedContent.querySelectorAll('*');
    for (const el of allElements) {
        if (!isVisible(el)) continue;
        if (isLintIgnored(el, 'spacing')) continue;
        if (isFrameworkManaged(el)) continue;

        const style = window.getComputedStyle(el);
        const display = style.display;

        const isFlex = display === 'flex' || display === 'inline-flex';
        const isGrid = display === 'grid' || display === 'inline-grid';

        if (!isFlex && !isGrid) continue;

        // Count visible children
        const visibleChildren = Array.from(el.children).filter(child => isVisible(child));
        if (visibleChildren.length < 2) continue;

        // Check gap value
        const gap = style.gap;
        const rowGap = style.rowGap;
        const columnGap = style.columnGap;
        const hasGap = (gap && gap !== 'normal' && gap !== '0px') ||
            (rowGap && rowGap !== 'normal' && rowGap !== '0px') ||
            (columnGap && columnGap !== 'normal' && columnGap !== '0px');

        if (!hasGap) {
            // Check if children have margins that create effective spacing
            const flexDir = style.flexDirection || 'row';
            const isColumn = flexDir === 'column' || flexDir === 'column-reverse';
            let hasChildMargins = false;

            for (let i = 0; i < visibleChildren.length - 1; i++) {
                const childStyle = window.getComputedStyle(visibleChildren[i]);
                const nextStyle = window.getComputedStyle(visibleChildren[i + 1]);
                if (isColumn) {
                    if (parseFloat(childStyle.marginBottom) > 0 || parseFloat(nextStyle.marginTop) > 0) {
                        hasChildMargins = true;
                        break;
                    }
                } else {
                    if (parseFloat(childStyle.marginRight) > 0 || parseFloat(nextStyle.marginLeft) > 0) {
                        hasChildMargins = true;
                        break;
                    }
                }
            }

            if (!hasChildMargins) {
                const layoutType = isFlex ? 'Flex' : 'Grid';
                warnings.push(`Slide "${slideId}": ${layoutType} container with ${visibleChildren.length} children has no gap or margin spacing. Add a gap class (e.g., gap-3, gap-4).\n  ${getElementClassContext(el)}`);
            }
        }
    }

    // --- Check 2: Adjacent block siblings with zero spacing ---
    // Walk direct children of common container elements
    const containers = renderedContent.querySelectorAll('.slide, section, [class*="col-"], [class*="content"]');
    for (const container of containers) {
        if (isLintIgnored(container, 'spacing')) continue;
        if (isFrameworkManaged(container)) continue;

        // Skip flex/grid — handled by Check 1
        const containerStyle = window.getComputedStyle(container);
        if (['flex', 'inline-flex', 'grid', 'inline-grid'].includes(containerStyle.display)) continue;

        const children = Array.from(container.children).filter(child =>
            isVisible(child) && BLOCK_TAGS.has(child.tagName)
        );

        for (let i = 0; i < children.length - 1; i++) {
            const current = children[i];
            const next = children[i + 1];

            if (isLintIgnored(current, 'spacing') || isLintIgnored(next, 'spacing')) continue;
            if (isFrameworkManaged(current) || isFrameworkManaged(next)) continue;

            const currentStyle = window.getComputedStyle(current);
            const nextStyle = window.getComputedStyle(next);

            const marginBottom = parseFloat(currentStyle.marginBottom) || 0;
            const marginTop = parseFloat(nextStyle.marginTop) || 0;
            const effectiveGap = Math.max(marginBottom, marginTop); // Margin collapse

            if (effectiveGap < 1) {
                const currentDesc = current.tagName.toLowerCase() + (current.className ? `.${current.className.split(' ')[0]}` : '');
                const nextDesc = next.tagName.toLowerCase() + (next.className ? `.${next.className.split(' ')[0]}` : '');
                warnings.push(`Slide "${slideId}": No spacing between adjacent <${currentDesc}> and <${nextDesc}>. Add margin (e.g., mb-3, mb-4) or wrap in a flex container with gap.\n  ${getElementClassContext(current)}`);
            }
        }
    }

    // --- Check 3: Visual containers with no padding ---
    for (const el of allElements) {
        if (!isVisible(el)) continue;
        if (isLintIgnored(el, 'spacing')) continue;
        if (isFrameworkManaged(el)) continue;

        // Must have children with content
        if (el.children.length === 0) continue;
        if (!el.textContent || el.textContent.trim() === '') continue;

        const style = window.getComputedStyle(el);

        // Check for visual boundary (background, border, or shadow)
        const bgColor = style.backgroundColor;
        const hasBg = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';
        const hasBorder = parseFloat(style.borderTopWidth) > 0 ||
            parseFloat(style.borderBottomWidth) > 0 ||
            parseFloat(style.borderLeftWidth) > 0 ||
            parseFloat(style.borderRightWidth) > 0;
        const hasShadow = style.boxShadow && style.boxShadow !== 'none';
        const hasBorderRadius = parseFloat(style.borderRadius) > 0;

        if (!hasBg && !hasBorder && !hasShadow && !hasBorderRadius) continue;

        // Check if ALL padding values are 0
        const paddingTop = parseFloat(style.paddingTop) || 0;
        const paddingBottom = parseFloat(style.paddingBottom) || 0;
        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        const paddingRight = parseFloat(style.paddingRight) || 0;

        if (paddingTop === 0 && paddingBottom === 0 && paddingLeft === 0 && paddingRight === 0) {
            // Only warn for elements that look like content containers (not tiny decorative elements)
            const rect = el.getBoundingClientRect();
            if (rect.width < 50 || rect.height < 30) continue;

            const boundary = hasBg ? 'background' : hasBorder ? 'border' : hasShadow ? 'box-shadow' : 'border-radius';
            warnings.push(`Slide "${slideId}": Container with ${boundary} has no internal padding — content touches edges. Add padding (e.g., p-3, p-4).\n  ${getElementClassContext(el)}`);
        }
    }
}

/**
 * Validates content overflow — detects elements whose content exceeds their container bounds.
 * Common AI mistake: generating too much text or too many elements for the available space.
 * 
 * Checks scrollHeight > clientHeight (vertical) and scrollWidth > clientWidth (horizontal).
 * 
 * Suppressed by data-lint-ignore="overflow" on the element or any ancestor.
 * 
 * @param {string} slideId - The slide identifier
 * @param {HTMLElement} renderedContent - The rendered slide DOM
 * @param {array} warnings - Array to collect warnings
 */
function validateContentOverflow(slideId, renderedContent, warnings) {
    const OVERFLOW_THRESHOLD = 20; // px — ignore trivial sub-pixel rounding

    // --- Presentation layout: content is clipped, not scrollable ---
    const layout = document.documentElement.getAttribute('data-layout');
    if (layout === 'presentation') {
        if (isLintIgnored(renderedContent, 'overflow')) return;

        const slideContainer = document.getElementById('slide-container') || renderedContent;
        const contentHeight = slideContainer.scrollHeight;
        const viewportHeight = window.innerHeight;

        if (contentHeight > viewportHeight + OVERFLOW_THRESHOLD) {
            const pct = Math.round((contentHeight / viewportHeight) * 100);
            warnings.push(
                `Slide "${slideId}": Content height (${contentHeight}px) exceeds viewport (${viewportHeight}px) in presentation layout — ` +
                `${pct}% of viewport, content will be clipped. Reduce content or switch to a scrollable layout.\n  ` +
                'Suppress with data-lint-ignore="overflow" on the slide element.'
            );
        }
        return; // Presentation layout doesn't need individual container checks
    }

    // Framework containers that intentionally scroll
    const SCROLLABLE_INTENTS = new Set([
        'accordion-content', 'modal-body', 'modal-content',
        'tab-content', 'carousel', 'overflow-auto', 'overflow-y-auto', 'overflow-x-auto',
        'code', 'pre'
    ]);

    const isIntentionallyScrollable = (el) => {
        const classes = el.className?.toString().split(' ') || [];
        if (classes.some(cls => SCROLLABLE_INTENTS.has(cls))) return true;
        const style = window.getComputedStyle(el);
        // Author explicitly set overflow to scroll/auto = intentional
        return style.overflowY === 'scroll' || style.overflowX === 'scroll';
    };

    // Check the slide section itself and major content containers
    const containers = renderedContent.querySelectorAll('section.slide, [class*="content"], [class*="col-"], [data-layout-body], .card-body');
    for (const el of containers) {
        if (el.offsetParent === null) continue;
        if (isLintIgnored(el, 'overflow')) continue;
        if (isIntentionallyScrollable(el)) continue;
        if (el.closest('[data-component]') || el.closest('[data-interaction-id]')) continue;

        const vertOverflow = el.scrollHeight - el.clientHeight;
        const horizOverflow = el.scrollWidth - el.clientWidth;

        if (vertOverflow > OVERFLOW_THRESHOLD) {
            const pct = Math.round((el.scrollHeight / el.clientHeight) * 100);
            warnings.push(`Slide "${slideId}": Content overflows container vertically (${pct}% of visible area). Reduce content or use a scrollable component.\n  ${getElementClassContext(el)}`);
        }

        if (horizOverflow > OVERFLOW_THRESHOLD) {
            warnings.push(`Slide "${slideId}": Content overflows container horizontally by ${horizOverflow}px. Check for fixed-width elements or long unbroken text.\n  ${getElementClassContext(el)}`);
        }
    }
}

function buildCssClassIndex() {
    const classes = new Set();

    try {
        for (const sheet of document.styleSheets) {
            try {
                const rules = sheet.cssRules || sheet.rules;
                if (!rules) continue;
                extractClassesFromRules(rules, classes);
            } catch {
                // Cross-origin stylesheets throw SecurityError — skip them
            }
        }
    } catch {
        // If styleSheets is inaccessible, return empty set (validation will be skipped)
    }

    logger.debug(`[RuntimeLinter] CSS class index: ${classes.size} classes from ${document.styleSheets.length} stylesheets`);
    return classes;
}

/**
 * Recursively extracts class names from CSS rules (handles @media, @supports, etc.).
 * @param {CSSRuleList} rules - The CSS rules to extract from
 * @param {Set<string>} classes - Set to accumulate class names into
 */
function extractClassesFromRules(rules, classes) {
    for (const rule of rules) {
        if (rule.selectorText) {
            const classMatches = rule.selectorText.match(/\.[\w-]+/g);
            if (classMatches) {
                for (const match of classMatches) {
                    classes.add(match.slice(1)); // strip leading dot
                }
            }
        }
        // Recurse into grouped rules (@media, @supports, @layer, etc.)
        if (rule.cssRules) {
            extractClassesFromRules(rule.cssRules, classes);
        }
    }
}

/**
 * Validates CSS classes on rendered DOM elements against the CSSOM class index.
 * Flags classes that don't exist in any loaded stylesheet, which usually indicates
 * a hallucinated or wrong-framework class name (e.g., Bootstrap's "d-flex" instead
 * of this framework's "flex").
 *
 * @param {string} slideId - The slide identifier for error messages
 * @param {HTMLElement} renderedContent - The rendered slide DOM
 * @param {Set<string>} validCssClasses - Set of valid CSS class names from CSSOM
 * @param {array} warnings - Array to collect warnings
 */
function validateCssClasses(slideId, renderedContent, validCssClasses, warnings) {
    // If the index is empty, skip validation (stylesheets may not be accessible)
    if (validCssClasses.size === 0) return;

    const undefinedClasses = new Map(); // className -> count

    const allElements = renderedContent.querySelectorAll('*');
    for (const el of allElements) {
        for (const cls of el.classList) {
            if (validCssClasses.has(cls)) continue;
            if (DYNAMIC_CLASSES.has(cls)) continue;
            if (DYNAMIC_CLASS_PREFIXES.some(p => cls.startsWith(p))) continue;
            undefinedClasses.set(cls, (undefinedClasses.get(cls) || 0) + 1);
        }
    }

    for (const [cls, count] of undefinedClasses) {
        const suffix = count > 1 ? ` (used ${count} times)` : '';
        warnings.push(
            `Slide "${slideId}": CSS class "${cls}" is not defined in any stylesheet${suffix}. ` +
            'This may be a hallucinated or wrong-framework class name.'
        );
    }
}

/** Color variant classes that satisfy the btn variant requirement */
const BTN_COLOR_VARIANTS = new Set([
    'btn-primary', 'btn-secondary', 'btn-success', 'btn-info',
    'btn-warning', 'btn-danger', 'btn-reset', 'btn-gradient', 'btn-hint',
    'btn-outline-primary', 'btn-outline-secondary',
]);

/**
 * Validates that .btn elements always have a color variant class.
 * Suppressed by data-lint-ignore="btn-variant".
 */
function validateButtonVariants(slideId, renderedContent, warnings) {
    const buttons = renderedContent.querySelectorAll('.btn');
    for (const btn of buttons) {
        if (isLintIgnored(btn, 'btn-variant')) continue;

        const hasColorVariant = [...btn.classList].some(c => BTN_COLOR_VARIANTS.has(c));
        if (!hasColorVariant) {
            warnings.push(
                `Slide "${slideId}": Button has "btn" class without a color variant. ` +
                'Add a variant like btn-primary, btn-secondary, btn-success, etc.'
            );
        }
    }
}
