/**
 * Course Linter - Node.js version
 * 
 * Validates course configuration and structure at build time.
 * Uses shared validation rules from validation-rules.js.
 * 
 * Used by:
 * - `coursecode lint` CLI command
 * - CourseCode Studio for server-side validation
 */

import fs from 'fs';
import path from 'path';
import { parseSlideSource, extractAssessment } from './course-parser.js';
import { getEngagementTrackingMap, getRegisteredComponentTypes } from './schema-extractor.js';
import { getValidCssClasses, lintCssSelectors } from './css-index.js';
import {
  parseSlideNarration,
  loadNarrationCache,
  narrationCacheKey,
  classifyNarrationFreshness
} from '../framework/scripts/narration-parser.js';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  flattenStructure,
  registerInteractionId,
  validateGlobalConfig,
  validateAssessmentConfig,
  validateEngagement,
  validateRequirementConfig,
  validateGatingConditions,
  formatLintResults
} from './validation-rules.js';

// Re-export shared rules for external use
export {
  flattenStructure,
  validateAssessmentConfig,
  validateQuestionConfig,
  formatLintResults
} from './validation-rules.js';

// Dynamic class patterns that are valid even if not in stylesheets
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
 * Lint a course configuration and slide files.
 * 
 * @param {object} courseConfig - The course configuration object
 * @param {string} coursePath - Path to the course directory containing slides/
 * @returns {{ errors: string[], warnings: string[] }} Validation results
 */
export async function lintCourse(courseConfig, coursePath) {
  const errors = [];
  const warnings = [];
  const interactionIdRegistry = new Map();

  // Validate config structure
  if (!courseConfig || !courseConfig.structure) {
    errors.push('FATAL: courseConfig.structure is required');
    return { errors, warnings };
  }

  // Flatten structure to get all slides
  const slides = flattenStructure(courseConfig.structure);

  // Collect slide files on disk
  const slidesDir = path.join(coursePath, 'slides');
  const slideFilesOnDisk = new Set();

  if (fs.existsSync(slidesDir)) {
    const files = fs.readdirSync(slidesDir).filter(f => f.endsWith('.js'));
    files.forEach(f => slideFilesOnDisk.add(`@slides/${f}`));
  }

  // Global config validation (uses shared rules)
  const { warnings: globalWarnings, objectiveIds } = validateGlobalConfig(
    courseConfig,
    slides,
    slideFilesOnDisk
  );
  warnings.push(...globalWarnings);

  // Build valid CSS class index once for all slides
  const validCssIndex = getValidCssClasses();

  // Lint framework CSS selectors for global pollution
  const cssLint = lintCssSelectors();
  warnings.push(...cssLint.warnings);

  // Lint framework JS for banned logging/error patterns
  const jsLint = lintFrameworkJs();
  warnings.push(...jsLint.warnings);

  // Validate each slide
  for (const slide of slides) {
    await validateSlide(slide, coursePath, objectiveIds, errors, warnings, interactionIdRegistry, validCssIndex);
  }

  // Narration freshness check (opt-out via courseConfig.lint.narrationFreshness === false)
  const narrationFreshnessEnabled = courseConfig.lint?.narrationFreshness !== false;
  if (narrationFreshnessEnabled) {
    checkNarrationFreshness(slides, coursePath, warnings);
  }

  return { errors, warnings };
}

/**
 * Validates a single slide's configuration using source parsing.
 */
async function validateSlide(slide, coursePath, objectiveIds, errors, warnings, interactionIdRegistry, validCssIndex) {
  // Use shared engagement validation
  if (!validateEngagement(slide, errors, warnings)) {
    return;
  }

  const engagement = slide.engagement;
  const isAssessment = slide.type === 'assessment';

  // Resolve slide file path
  const slideFileName = slide.component.replace('@slides/', '');
  const slideFilePath = path.join(coursePath, 'slides', slideFileName);

  if (!fs.existsSync(slideFilePath)) {
    errors.push(`Slide "${slide.id}" references non-existent file: ${slide.component}`);
    return;
  }

  // Convention: slide ID should match component filename (minus @slides/ and .js)
  const expectedId = slideFileName.replace('.js', '');
  if (slide.id !== expectedId) {
    warnings.push(`Slide "${slide.id}" has component "${slide.component}" — slide ID should match filename. Expected id="${expectedId}".`);
  }

  // Read and parse slide source
  const source = fs.readFileSync(slideFilePath, 'utf-8');

  if (isAssessment) {
    // Parse assessment source using unified parser
    const assessmentData = extractAssessment(source, slide.id);

    if (assessmentData) {
      // Validate assessment ID matches slide ID
      if (assessmentData.id && assessmentData.id !== slide.id) {
        errors.push(`Assessment ID mismatch: course-config.js declares slide id="${slide.id}" but ${slide.component} exports config.id="${assessmentData.id}". These must match for proper SCORM tracking.`);
      }

      // Build config for validation
      const hasQuestions = assessmentData.questions?.length > 0;
      const hasBanks = assessmentData.questionBanks?.length > 0;

      const configForValidation = {
        id: assessmentData.id,
        title: assessmentData.title,
        ...assessmentData.settings,
        questions: assessmentData.questions || [],
        questionBanks: assessmentData.questionBanks || [],
        _hasRuntimeQuestions: hasQuestions,
        _hasRuntimeQuestionBanks: hasBanks
      };

      // Use shared assessment validation
      validateAssessmentConfig(configForValidation, slide.id, objectiveIds, errors, warnings, interactionIdRegistry);
    } else {
      errors.push(`Slide "${slide.id}" is marked as type='assessment' but does not export a 'config' object.`);
    }
    return;
  }

  // Parse slide content using unified parser
  const slideData = parseSlideSource(source, slide.id);

  // Schema-driven: get tracking map and registered component types
  const engagementTrackingMap = getEngagementTrackingMap();
  const registeredComponentTypes = new Set(getRegisteredComponentTypes());

  // Validate unknown data-component types
  // Sub-components are handled by their parent component (e.g. modal-trigger → modal)
  const SUB_COMPONENT_TYPES = new Set(['modal-trigger']);
  for (const el of slideData.elements || []) {
    const componentType = el.attributes?.['data-component'];
    if (componentType && !registeredComponentTypes.has(componentType) && !SUB_COMPONENT_TYPES.has(componentType)) {
      warnings.push(`Slide "${slide.id}" uses unknown component type: "${componentType}". No schema found.`);
    }
  }

  // Validate gating conditions if present
  if (slide.navigation?.gating) {
    validateGatingConditions(slide.id, slide.navigation.gating, objectiveIds, errors);
  }

  // Non-assessment slide validation
  if (engagement.required && engagement.requirements) {
    for (const req of engagement.requirements) {
      // Config-only validation (shared rules, schema-driven)
      validateRequirementConfig(slide.id, req, errors, warnings, engagementTrackingMap);

      // Content validation — auto-checks component-linked requirements
      validateRequirementContent(slide.id, req, slideData, engagementTrackingMap, errors);
    }
  }

  // Register interaction IDs from parsed source
  for (const interaction of slideData.interactions || []) {
    if (interaction.id) {
      registerInteractionId(interaction.id, slide.id, 'DOM Interaction', interactionIdRegistry, errors);
    }
  }

  // Static CSS class validation — checks class attributes in source template
  validateCssClassesStatic(slide.id, source, validCssIndex, warnings);

  // Button variant validation — btn must always have a color variant
  validateButtonVariants(slide.id, source, warnings);
}

/**
 * Schema-driven content validation for component-linked requirement types.
 * Uses the engagement tracking map to find which component a requirement expects.
 */
function validateRequirementContent(slideId, requirement, slideData, engagementTrackingMap, errors) {
  const componentType = engagementTrackingMap[requirement.type];
  if (!componentType) return; // Not a component-linked requirement

  const elements = slideData.elements || [];
  const hasComponent = elements.some(el => el.attributes?.['data-component'] === componentType);

  if (!hasComponent) {
    errors.push(`Slide "${slideId}" has '${requirement.type}' requirement but no ${componentType} component found in source. Add data-component="${componentType}" or remove this requirement.`);
  }
}

/**
 * Static CSS class validation — extracts class="..." values from slide source
 * and checks them against the valid CSS class index built from PostCSS.
 */
function validateCssClassesStatic(slideId, source, validCssIndex, warnings) {
  const validSet = new Set(validCssIndex.classes);
  const undefinedClasses = new Map(); // className -> count

  // Extract all class="..." attributes from HTML template strings
  const classAttrRegex = /class="([^"]+)"/g;
  let match;
  while ((match = classAttrRegex.exec(source)) !== null) {
    const classNames = match[1].split(/\s+/).filter(Boolean);
    for (const cls of classNames) {
      // Skip template expressions like ${...}
      if (cls.includes('${') || cls.includes('}')) continue;
      if (validSet.has(cls)) continue;
      if (DYNAMIC_CLASSES.has(cls)) continue;
      if (DYNAMIC_CLASS_PREFIXES.some(p => cls.startsWith(p))) continue;
      undefinedClasses.set(cls, (undefinedClasses.get(cls) || 0) + 1);
    }
  }

  for (const [cls, count] of undefinedClasses) {
    const suffix = count > 1 ? ` (used ${count} times)` : '';
    warnings.push(`Slide "${slideId}": CSS class "${cls}" is not defined in any stylesheet${suffix}. This may be a hallucinated or outdated class name.`);
  }
}

/** Color variant classes that satisfy the btn variant requirement */
export const BTN_COLOR_VARIANTS = new Set([
  'btn-primary', 'btn-secondary', 'btn-success', 'btn-info',
  'btn-warning', 'btn-danger', 'btn-reset', 'btn-gradient', 'btn-hint',
  'btn-outline-primary', 'btn-outline-secondary',
]);

/**
 * Validates that .btn always appears alongside a color variant class.
 * Size modifiers (btn-sm, btn-lg) and functional aliases (btn-submit, btn-check, btn-nav)
 * do NOT satisfy this requirement — a color variant is always needed.
 */
export function validateButtonVariants(slideId, source, warnings) {
  const classAttrRegex = /class="([^"]+)"/g;
  let match;
  while ((match = classAttrRegex.exec(source)) !== null) {
    const classNames = match[1].split(/\s+/).filter(Boolean);
    // Skip template expressions
    if (classNames.some(c => c.includes('${') || c.includes('}'))) continue;

    const hasBtn = classNames.includes('btn');
    if (!hasBtn) continue;

    const hasColorVariant = classNames.some(c => BTN_COLOR_VARIANTS.has(c));
    if (!hasColorVariant) {
      warnings.push(
        `Slide "${slideId}": Button has "btn" class without a color variant. ` +
        'Add a variant like btn-primary, btn-secondary, btn-success, etc.'
      );
    }
  }
}

/**
 * CLI entry point for linting a course.
 * @param {object} options - CLI options
 */
export async function lint(options = {}) {
  const coursePath = options.coursePath || './course';
  const configPath = path.join(coursePath, 'course-config.js');

  console.log('\n🔍 Linting course...\n');

  if (!fs.existsSync(configPath)) {
    console.error(`❌ Course config not found: ${configPath}`);
    console.error('   Run this command from a course project root.');
    process.exit(1);
  }

  try {
    // Dynamic import of course config
    const configUrl = pathToFileURL(path.resolve(configPath)).href;
    const configModule = await import(configUrl);
    const courseConfig = configModule.default || configModule.courseConfig;

    if (!courseConfig) {
      console.error('❌ Course config does not export default or courseConfig');
      process.exit(1);
    }

    const { errors, warnings } = await lintCourse(courseConfig, coursePath);

    console.log(formatLintResults({ errors, warnings }));

    if (errors.length > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error(`❌ Failed to lint course: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// === Framework JS Lint Rules ===

/**
 * Banned patterns in framework JS source files.
 * Each rule has a regex, a message, and optional file-level exemptions.
 */
const BANNED_JS_PATTERNS = [
  {
    id: 'manual-error-emission',
    pattern: /eventBus\.emit\(['"][a-z]+:error['"]/,
    message: 'Manual error event emission. Use logger.error(msg, ctx) instead — it auto-emits to eventBus.',
    exempt: [],
  },
  {
    id: 'framework-error-import',
    pattern: /import.*framework-error/,
    message: 'Importing deleted module. Use logger.fatal() instead of frameworkError().',
    exempt: [],
  },
  {
    id: 'framework-error-call',
    pattern: /frameworkError\s*\(/,
    message: 'frameworkError() is removed. Use logger.fatal(msg, ctx) instead.',
    exempt: [],
  },
  {
    id: 'direct-console-usage',
    pattern: /\bconsole\.(log|warn|error|info|debug)\s*\(/,
    message: 'Direct console usage. Use logger.debug/info/warn/error instead.',
    exempt: ['logger.js', 'icons.js'],  // logger.js IS the console wrapper; icons.js is zero-dependency
  },
  {
    id: 'unsafe-innerhtml',
    pattern: /\.innerHTML\s*=\s*`[^`]*\$\{(?!(?:icon|escapeHTML))/,
    message: 'Unsafe innerHTML with unescaped interpolation. Use escapeHTML() for user-facing text or textContent for plain text.',
    exempt: [
      'access-control.js',      // Static markup only, no user input
      'lightbox.js',             // Uses icons/escapeHTML — regex can't distinguish all safe patterns
      'interaction-base.js',     // ${type} is framework-controlled; message uses escapeHTML
      'fill-in.js',              // All dynamic values escaped via escapeHTML; regex can't detect pre-escaped vars
      'AssessmentUI.js',         // Interpolates config titles, icon output, CSS classes — all author-controlled
      'NavigationUI.js',         // Interpolates menu labels, icon output — all author-controlled
    ],
  },
];

/**
 * Recursively collect .js files from a directory.
 */
function collectJsFiles(dir, result) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(fullPath, result);
    } else if (entry.name.endsWith('.js')) {
      result.push(fullPath);
    }
  }
}

/**
 * Check that generated narration audio is in sync with the narration text in
 * each slide. Emits warnings when:
 *   - The .mp3 exists but the cached hash differs from current text+settings (stale)
 *   - Narration text is defined but no .mp3 exists (missing)
 *
 * Silent when:
 *   - The slide has no narration export
 *   - No audio file exists AND no cache entry (treat as "narration not yet
 *     generated" — author may not have configured TTS yet)
 *   - The narration cache file is absent (can't determine staleness; avoids
 *     false positives on freshly cloned repos)
 *
 * Opt out via courseConfig.lint.narrationFreshness === false.
 *
 * @param {Array} slides   - Flattened slide list.
 * @param {string} coursePath - Path to the course directory (contains slides/).
 * @param {string[]} warnings - Output array; warnings are pushed in place.
 */
export function checkNarrationFreshness(slides, coursePath, warnings) {
  const slidesDir = path.join(coursePath, 'slides');
  const audioDir = path.join(coursePath, 'assets', 'audio');
  // Cache file lives at the project root, one level above coursePath.
  const projectRoot = path.dirname(coursePath);
  const cacheFile = path.join(projectRoot, '.narration-cache.json');

  const cacheLoaded = fs.existsSync(cacheFile);
  const cache = cacheLoaded ? loadNarrationCache(cacheFile) : {};

  for (const slide of slides) {
    if (!slide.component || !slide.component.startsWith('@slides/')) continue;

    const slideFileName = slide.component.replace('@slides/', '');
    const slideFilePath = path.join(slidesDir, slideFileName);
    if (!fs.existsSync(slideFilePath)) continue;

    const baseName = slideFileName.replace(/\.js$/, '');

    let items;
    try {
      items = parseSlideNarration(slideFilePath, baseName, audioDir);
    } catch {
      continue;
    }
    if (!items) continue;

    const sourceSrc = `@slides/${slideFileName}`;

    for (const item of items) {
      const cacheKey = narrationCacheKey(sourceSrc, item.key);
      const audioExists = fs.existsSync(item.outputPath);

      // Per spec: if no audio file exists, do NOT warn — author may not have
      // generated narration yet (TTS provider may not even be configured).
      if (!audioExists) continue;

      const status = classifyNarrationFreshness({
        item,
        cachedHash: cache[cacheKey],
        audioExists,
        cacheLoaded
      });

      if (status === 'stale') {
        const keyLabel = item.key === 'slide' ? '' : ` (key: "${item.key}")`;
        const relAudio = path.relative(projectRoot, item.outputPath).replace(/\\/g, '/');
        warnings.push(
          `Slide "${slide.id}": narration audio is stale${keyLabel} \u2014 text changed since ${relAudio} was generated. Run \`coursecode narration\` to regenerate.`
        );
      }
      // 'unknown' (cache file missing): silent — avoids noise on fresh clones.
      // 'ok': silent.
    }
  }
}

/**
 * Lint framework JS source files for banned logging/error patterns.
 * Prevents regression to pre-unified-logger patterns.
 *
 * @returns {{ warnings: string[] }} Lint warnings
 */
export function lintFrameworkJs() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frameworkRoot = path.dirname(__dirname);
  const jsDir = path.join(frameworkRoot, 'framework', 'js');
  const warnings = [];

  if (!fs.existsSync(jsDir)) return { warnings };

  const jsFiles = [];
  collectJsFiles(jsDir, jsFiles);

  for (const file of jsFiles) {
    // Skip vendor files entirely
    if (file.includes(`${path.sep}vendor${path.sep}`)) continue;

    const basename = path.basename(file);
    const relPath = path.relative(jsDir, file);

    try {
      const source = fs.readFileSync(file, 'utf-8');
      const lines = source.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        const trimmed = line.trimStart();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

        for (const rule of BANNED_JS_PATTERNS) {
          if (rule.exempt.includes(basename)) continue;
          if (rule.pattern.test(line)) {
            warnings.push(
              `[${rule.id}] ${relPath}:${i + 1} — ${rule.message}`
            );
          }
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return { warnings };
}
