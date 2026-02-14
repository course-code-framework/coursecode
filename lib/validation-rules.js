/**
 * Shared Validation Rules
 * 
 * Pure validation logic used by both:
 * - framework/js/dev/runtime-linter.js (browser, uses DOM)
 * - lib/build-linter.js (Node.js, uses source-parser)
 * 
 * These functions contain no environment-specific code (no DOM, no fs).
 * They operate on plain JavaScript objects.
 */

/**
 * Flattens a hierarchical structure into a flat array of slides.
 * @param {array} structure - The structure array (may contain sections with children)
 * @returns {array} Flat array of slide objects
 */
export function flattenStructure(structure) {
  const slides = [];
  
  function traverse(items) {
    for (const item of items) {
      if (item.children) {
        traverse(item.children);
      } else if (item.component) {
        slides.push(item);
      }
    }
  }
  
  traverse(structure);
  return slides;
}

/**
 * Registers an interaction ID and checks for duplicates.
 * @param {string} id - The interaction ID to register
 * @param {string} sourceName - The name of the source (e.g., slide ID)
 * @param {string} sourceType - The type of interaction (e.g., 'DOM', 'Assessment')
 * @param {Map} registry - The registry map
 * @param {array} errors - The errors array to push to if duplicate found
 */
export function registerInteractionId(id, sourceName, sourceType, registry, errors) {
  if (!id) return;

  if (registry.has(id)) {
    const existing = registry.get(id);
    errors.push(`Duplicate ID "${id}": Found in ${sourceType} "${sourceName}" but already declared in ${existing.sourceType} "${existing.sourceName}". All interaction, assessment, and question IDs must be unique across the entire course.`);
  } else {
    registry.set(id, { sourceName, sourceType });
  }
}

/**
 * Validates global course configuration (objectives, orphans).
 * @param {object} courseConfig - The full course configuration object
 * @param {array} slides - Flattened array of slide objects
 * @param {Set} slideFilesOnDisk - Set of slide file paths on disk (for orphan check)
 * @returns {{ warnings: array, objectiveIds: Set }}
 */
export function validateGlobalConfig(courseConfig, slides, slideFilesOnDisk = new Set()) {
  const warnings = [];
  const slideComponentPaths = new Set(slides.map(s => s.component));
  const allObjectiveIds = new Set();
  const allSlideIds = new Set(slides.map(s => s.id));

  // Check for orphaned slide files
  for (const knownFile of slideFilesOnDisk) {
    if (!slideComponentPaths.has(knownFile)) {
      warnings.push(`Orphaned File: Slide module "${knownFile}" exists but is not used in the course structure.`);
    }
  }

  // Validate objectives
  if (courseConfig.objectives && Array.isArray(courseConfig.objectives)) {
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
 * Validates assessment configuration.
 * @param {object} assessmentConfig - The assessment configuration object
 * @param {string} slideId - The slide identifier
 * @param {Set} objectiveIds - Valid objective IDs
 * @param {array} errors - Array to collect errors
 * @param {array} warnings - Array to collect warnings
 * @param {Map} interactionIdRegistry - Registry for checking duplicate IDs
 */
export function validateAssessmentConfig(assessmentConfig, slideId, objectiveIds, errors, warnings, interactionIdRegistry) {
  // Basic structure validation
  if (!assessmentConfig.id) {
    errors.push(`[${slideId}] Assessment missing required 'id' property`);
  } else {
    registerInteractionId(assessmentConfig.id, slideId, 'Assessment', interactionIdRegistry, errors);
  }

  // Validate assessmentObjective link
  if (assessmentConfig.assessmentObjective) {
    if (!objectiveIds.has(assessmentConfig.assessmentObjective)) {
      errors.push(`[${slideId}] Assessment '${assessmentConfig.id}' has an invalid assessmentObjective: "${assessmentConfig.assessmentObjective}". This objective ID does not exist in the course configuration.`);
    }
  }

  // Check for runtime-defined questions (skip validation if so)
  const hasRuntimeQuestions = assessmentConfig._hasRuntimeQuestions;
  const hasRuntimeQuestionBanks = assessmentConfig._hasRuntimeQuestionBanks;

  // Validate question source
  const hasQuestions = Array.isArray(assessmentConfig.questions) && assessmentConfig.questions.length > 0;
  const hasBanks = Array.isArray(assessmentConfig.questionBanks) && assessmentConfig.questionBanks.length > 0;

  if (!hasRuntimeQuestions && !hasRuntimeQuestionBanks) {
    if (!hasQuestions && !hasBanks) {
      errors.push(`[${slideId}] Assessment '${assessmentConfig.id}' must have either 'questions' or 'questionBanks' array`);
      return;
    }

    if (hasQuestions && hasBanks) {
      errors.push(`[${slideId}] Assessment '${assessmentConfig.id}' cannot have both 'questions' and 'questionBanks' - use one or the other`);
    }
  }

  // Validate settings
  const settings = assessmentConfig.settings || {};

  if (settings.passingScore != null) {
    if (typeof settings.passingScore !== 'number') {
      errors.push(`[${slideId}] Assessment '${assessmentConfig.id}' passingScore must be a number, got ${typeof settings.passingScore}`);
    } else if (settings.passingScore < 0 || settings.passingScore > 100) {
      errors.push(`[${slideId}] Assessment '${assessmentConfig.id}' passingScore must be 0-100, got ${settings.passingScore}`);
    }
  }

  if (settings.randomizeQuestions !== undefined && typeof settings.randomizeQuestions !== 'boolean') {
    errors.push(`[${slideId}] Assessment '${assessmentConfig.id}' randomizeQuestions must be boolean, got ${typeof settings.randomizeQuestions}`);
  }

  if (settings.randomizeOnRetake !== undefined && typeof settings.randomizeOnRetake !== 'boolean') {
    errors.push(`[${slideId}] Assessment '${assessmentConfig.id}' randomizeOnRetake must be boolean, got ${typeof settings.randomizeOnRetake}`);
  }

  // Validate remedial/restart relationship
  if (settings.attemptsBeforeRestart && settings.attemptsBeforeRemedial) {
    if (settings.attemptsBeforeRestart <= settings.attemptsBeforeRemedial) {
      errors.push(`[${slideId}] Assessment '${assessmentConfig.id}' attemptsBeforeRestart (${settings.attemptsBeforeRestart}) must be > attemptsBeforeRemedial (${settings.attemptsBeforeRemedial})`);
    }
  }

  if (settings.attemptsBeforeRemedial && !settings.remedialSlideIds) {
    errors.push(`[${slideId}] Assessment '${assessmentConfig.id}' has attemptsBeforeRemedial but no remedialSlideIds`);
  }

  if (settings.remedialSlideIds && settings.remedialSlideIds.length > 0 && !settings.attemptsBeforeRemedial) {
    warnings.push(`[${slideId}] Assessment '${assessmentConfig.id}' has remedialSlideIds but no attemptsBeforeRemedial (slides won't be used)`);
  }

  // Skip question validation if runtime-defined
  if (hasRuntimeQuestions || hasRuntimeQuestionBanks) {
    return;
  }

  // Validate questions
  if (hasQuestions) {
    assessmentConfig.questions.forEach((q, idx) => {
      validateQuestionConfig(q, `${slideId} Question ${idx + 1}`, errors, interactionIdRegistry);
    });
  }

  // Validate question banks
  if (hasBanks) {
    assessmentConfig.questionBanks.forEach((bank, bankIdx) => {
      const bankRef = `${slideId} Bank ${bankIdx + 1}`;

      if (!bank.id) {
        errors.push(`${bankRef} missing required 'id' property`);
      }

      if (!Array.isArray(bank.questions) || bank.questions.length === 0) {
        errors.push(`${bankRef} must have at least one question in 'questions' array`);
      }

      if (bank.selectCount == null) {
        errors.push(`${bankRef} missing required 'selectCount' property`);
      } else if (bank.selectCount !== 'all') {
        if (typeof bank.selectCount !== 'number') {
          errors.push(`${bankRef} selectCount must be number or 'all', got ${typeof bank.selectCount}`);
        } else if (bank.selectCount <= 0) {
          errors.push(`${bankRef} selectCount must be positive, got ${bank.selectCount}`);
        } else if (bank.questions && bank.selectCount > bank.questions.length) {
          errors.push(`${bankRef} selectCount (${bank.selectCount}) exceeds available questions (${bank.questions.length})`);
        }
      }

      if (bank.questions) {
        bank.questions.forEach((q, qIdx) => {
          validateQuestionConfig(q, `${bankRef} Question ${qIdx + 1}`, errors, interactionIdRegistry);
        });
      }
    });
  }
}

/**
 * Validates a single question configuration.
 * @param {object} question - The question configuration object
 * @param {string} ref - Reference string for error messages
 * @param {array} errors - Array to collect errors
 * @param {Map} interactionIdRegistry - Registry for checking duplicate IDs
 */
export function validateQuestionConfig(question, ref, errors, interactionIdRegistry) {
  if (!question.type) {
    errors.push(`${ref} missing required 'type' property`);
  }

  if (!question.prompt && !question.questionText) {
    errors.push(`${ref} missing required 'prompt' property`);
  }

  if (question.weight == null) {
    errors.push(`${ref} missing required 'weight' property`);
  } else if (typeof question.weight === 'number' && question.weight <= 0) {
    errors.push(`${ref} weight must be positive, got ${question.weight}`);
  }

  if (!question.id) {
    errors.push(`${ref} missing required 'id' property`);
  } else {
    registerInteractionId(question.id, ref, 'Question', interactionIdRegistry, errors);
  }

  // Type-specific validation
  if (question.type === 'multiple-choice' || question.type === 'multiple-choice-single') {
    if (!question.correctAnswer && !question.multiple) {
      errors.push(`${ref} (${question.type}) missing required 'correctAnswer' property`);
    }
  }

  if (question.type && question.type.startsWith('multiple-choice')) {
    if (!Array.isArray(question.choices) || question.choices.length === 0) {
      errors.push(`${ref} (${question.type}) must have at least one choice in 'choices' array`);
    }
  }

  if (question.type === 'true-false') {
    if (question.correctAnswer !== true && question.correctAnswer !== false) {
      errors.push(`${ref} (true-false) correctAnswer must be boolean (true or false)`);
    }
  }

  if (question.type === 'numeric') {
    if (question.correctAnswer == null) {
      errors.push(`${ref} (numeric) missing required 'correctAnswer' property`);
    }
  }
}

/**
 * Validates engagement configuration for a slide.
 * @param {object} slide - The slide configuration
 * @param {array} errors - Array to collect errors
 * @param {array} warnings - Array to collect warnings
 */
export function validateEngagement(slide, errors, warnings) {
  if (!slide.engagement) {
    errors.push(`Slide "${slide.id}" (${slide.component}) is missing required 'engagement' configuration. Add "engagement: { required: false }" at minimum.`);
    return false;
  }

  const engagement = slide.engagement;

  if (engagement.required) {
    if (!engagement.requirements || !Array.isArray(engagement.requirements)) {
      errors.push(`Slide "${slide.id}" has engagement.required=true but no requirements array defined.`);
      return false;
    }
    
    if (engagement.requirements.length === 0) {
      warnings.push(`Slide "${slide.id}" has engagement.required=true but empty requirements array. Set required=false if no tracking needed.`);
    }
    
    if (engagement.mode && !['all', 'any'].includes(engagement.mode)) {
      errors.push(`Slide "${slide.id}" has invalid engagement.mode "${engagement.mode}". Must be "all" or "any".`);
    }
  }

  return true;
}

/**
 * Validates a requirement configuration (structure only, not content).
 * Content validation (e.g., checking if tabs/accordion exist) is environment-specific.
 * 
 * @param {string} slideId - The slide identifier
 * @param {object} requirement - The requirement configuration
 * @param {array} errors - Array to collect errors
 * @param {array} warnings - Array to collect warnings
 * @param {object} engagementTrackingMap - Reverse map: engagementTracking value -> component type
 */
export function validateRequirementConfig(slideId, requirement, errors, warnings, engagementTrackingMap = {}) {
  const type = requirement.type;

  // Component-linked requirement types — auto-recognized from schemas.
  // Content validation (does the component exist?) is environment-specific.
  if (engagementTrackingMap[type]) {
    return;
  }

  // Config-only requirement types — validate required properties
  switch (type) {
    case 'interactionComplete':
      if (!requirement.interactionId) {
        errors.push(`Slide "${slideId}" has 'interactionComplete' requirement without interactionId.`);
      }
      break;

    case 'allInteractionsComplete':
      break;

    case 'scrollDepth': {
      const percentage = requirement.percentage || requirement.minPercentage;
      if (!percentage) {
        errors.push(`Slide "${slideId}" has 'scrollDepth' requirement without percentage.`);
      } else if (percentage < 0 || percentage > 100) {
        errors.push(`Slide "${slideId}" scrollDepth percentage must be 0-100 (got ${percentage}).`);
      }
      break;
    }

    case 'timeOnSlide':
      if (!requirement.seconds || requirement.seconds <= 0) {
        errors.push(`Slide "${slideId}" has 'timeOnSlide' requirement without valid seconds value.`);
      }
      break;

    case 'videoComplete':
      if (!requirement.videoId) {
        errors.push(`Slide "${slideId}" has 'videoComplete' requirement without videoId.`);
      }
      break;

    case 'audioComplete':
      if (!requirement.audioId) {
        errors.push(`Slide "${slideId}" has 'audioComplete' requirement without audioId.`);
      }
      break;

    case 'slideAudioComplete':
      break;

    case 'modalAudioComplete':
      if (!requirement.modalId) {
        errors.push(`Slide "${slideId}" has 'modalAudioComplete' requirement without modalId.`);
      }
      break;

    case 'flag':
      if (!requirement.key) {
        errors.push(`Slide "${slideId}" has 'flag' requirement without key property.`);
      }
      break;

    case 'allFlags':
      if (!requirement.flags || !Array.isArray(requirement.flags)) {
        errors.push(`Slide "${slideId}" has 'allFlags' requirement without flags array.`);
      } else if (requirement.flags.length === 0) {
        errors.push(`Slide "${slideId}" has 'allFlags' requirement with empty flags array.`);
      }
      break;

    default:
      warnings.push(`Slide "${slideId}" has unknown requirement type: "${type}".`);
  }
}

/**
 * Valid gating condition types
 */
const VALID_GATING_CONDITION_TYPES = [
  'objectiveStatus',
  'assessmentStatus',
  'assessmentAttempts',
  'assessmentConfig',
  'stateFlag',
  'timeOnSlide',
  'custom'
];

/**
 * Validates navigation gating conditions for a slide.
 * @param {string} slideId - The slide identifier
 * @param {object} gating - The gating configuration object
 * @param {Set<string>} objectiveIds - Set of valid objective IDs
 * @param {array} errors - Array to collect errors
 */
export function validateGatingConditions(slideId, gating, objectiveIds, errors) {
  if (!gating.conditions || !Array.isArray(gating.conditions)) {
    errors.push(`Slide "${slideId}" has navigation.gating but no conditions array.`);
    return;
  }

  if (gating.mode && !['all', 'any'].includes(gating.mode)) {
    errors.push(`Slide "${slideId}" has invalid gating.mode "${gating.mode}". Must be "all" or "any".`);
  }

  for (const condition of gating.conditions) {
    if (!condition.type) {
      errors.push(`Slide "${slideId}" has a gating condition without a type property.`);
      continue;
    }

    if (!VALID_GATING_CONDITION_TYPES.includes(condition.type)) {
      errors.push(
        `Slide "${slideId}" has invalid gating condition type: "${condition.type}". ` +
        `Valid types: ${VALID_GATING_CONDITION_TYPES.join(', ')}. ` +
        'Note: \'slideVisited\' is only valid for objective criteria, not gating conditions.'
      );
      continue;
    }

    switch (condition.type) {
      case 'objectiveStatus':
        if (!condition.objectiveId) {
          errors.push(`Slide "${slideId}" has 'objectiveStatus' gating condition without objectiveId.`);
        } else if (!objectiveIds.has(condition.objectiveId)) {
          errors.push(`Slide "${slideId}" has 'objectiveStatus' gating condition with unknown objectiveId: "${condition.objectiveId}".`);
        }
        break;

      case 'assessmentStatus':
      case 'assessmentAttempts':
      case 'assessmentConfig':
        if (!condition.assessmentId) {
          errors.push(`Slide "${slideId}" has '${condition.type}' gating condition without assessmentId.`);
        }
        break;

      case 'stateFlag':
        if (!condition.key) {
          errors.push(`Slide "${slideId}" has 'stateFlag' gating condition without key property.`);
        }
        break;

      case 'timeOnSlide':
        if (!condition.minSeconds && condition.minSeconds !== 0) {
          errors.push(`Slide "${slideId}" has 'timeOnSlide' gating condition without minSeconds property.`);
        }
        break;

      case 'custom':
        if (!condition.callback && typeof condition.evaluate !== 'function') {
          errors.push(`Slide "${slideId}" has 'custom' gating condition without callback or evaluate function.`);
        }
        break;
    }
  }
}

/**
 * Format lint results for display.
 * @param {{ errors: string[], warnings: string[] }} results
 * @returns {string} Formatted output
 */
export function formatLintResults({ errors, warnings }) {
  const lines = [];

  if (warnings.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('  COURSE VALIDATION WARNINGS');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    warnings.forEach((w, i) => lines.push(`${i + 1}. ${w}`));
    lines.push('');
  }

  if (errors.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('  COURSE VALIDATION FAILED');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    errors.forEach((e, i) => lines.push(`${i + 1}. ${e}`));
    lines.push('');
    lines.push('The course cannot be built until these errors are resolved.');
  }

  if (errors.length === 0 && warnings.length === 0) {
    lines.push('✅ Course validation passed with no errors or warnings.');
  }

  return lines.join('\n');
}
