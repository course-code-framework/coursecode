/**
 * CourseCode Framework - Library Entry Point
 * 
 * This module exports the core utilities for programmatic course building.
 */

// Stub Player - generates browser-based course player
export { generateStubPlayer } from './stub-player.js';

// Manifest Generation - creates SCORM/cmi5 manifests
export { generateManifest, getSchemaFiles } from './manifest/manifest-factory.js';

// Content Parsing - unified parser for courses
export {
  parseCourse,
  parseSlideSource,
  extractAssessment,
  extractNarration,
  extractInteractions,
  parseElements,
  resolveElementByPath
} from './course-parser.js';

// Build utilities
export { build } from './build.js';
export {
  stampFormat,
  createStandardPackage,
  createProxyPackage,
  createRemotePackage,
  createExternalPackagesForClients,
  validateExternalHostingConfig
} from './build-packaging.js';

// Build Linter - validate course configuration
export {
  lintCourse,
  lint
} from './build-linter.js';

// Shared Validation Rules (used by both browser and Node.js linters)
export {
  flattenStructure,
  validateAssessmentConfig,
  validateQuestionConfig,
  validateEngagement,
  validateRequirementConfig,
  validateGlobalConfig,
  formatLintResults
} from './validation-rules.js';

// Re-export path utilities for template access
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the absolute path to the template directory
 * @returns {string} Path to template directory
 */
export function getTemplatePath() {
  return join(__dirname, '..', 'template');
}

/**
 * Get the absolute path to the framework directory
 * @returns {string} Path to framework directory  
 */
export function getFrameworkPath() {
  return join(__dirname, '..', 'framework');
}

/**
 * Get the absolute path to the schemas directory
 * @returns {string} Path to schemas directory
 */
export function getSchemasPath() {
  return join(__dirname, '..', 'schemas');
}
