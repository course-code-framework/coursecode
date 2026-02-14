// Stub Player
export { generateStubPlayer } from './stub-player.js'
export type { StubPlayerConfig } from './stub-player.js'

// Manifest Generation
export function generateManifest(
  format: string,
  config: Record<string, unknown>,
  files: string[],
  options?: Record<string, unknown>
): { filename: string; content: string }

export function getSchemaFiles(format: string): string[]

// Content Parsing
export function parseCourse(coursePath: string): Promise<Record<string, unknown>>
export function parseSlideSource(source: string, slideId: string): Record<string, unknown>
export function extractAssessment(source: string, slideId: string): Record<string, unknown> | null
export function extractNarration(source: string): Record<string, unknown> | null
export function extractInteractions(content: string, slideId: string): Record<string, unknown>[]
export function parseElements(html: string): Record<string, unknown>[]
export function resolveElementByPath(elements: Record<string, unknown>[], targetPath: string): Record<string, unknown> | null

// Build
export function build(options?: Record<string, unknown>): Promise<void>

// Build Packaging
export function stampFormat(html: string, format: string): string
export function stampFormatInHtml(htmlPath: string, format: string): void
export function validateExternalHostingConfig(config: Record<string, unknown>): void
export function createStandardPackage(options: Record<string, unknown>): Promise<string>
export function createProxyPackage(options: Record<string, unknown>): Promise<string>
export function createRemotePackage(options: Record<string, unknown>): Promise<string>
export function createExternalPackagesForClients(options: Record<string, unknown>): Promise<void>

// Build Linter
export function lintCourse(courseConfig: Record<string, unknown>, coursePath: string): { errors: string[]; warnings: string[] }
export function lint(options?: Record<string, unknown>): Promise<void>

// Validation Rules
export function flattenStructure(structure: unknown[]): unknown[]
export function validateAssessmentConfig(...args: unknown[]): void
export function validateQuestionConfig(...args: unknown[]): void
export function validateEngagement(...args: unknown[]): void
export function validateRequirementConfig(...args: unknown[]): void
export function validateGlobalConfig(...args: unknown[]): { warnings: string[]; objectiveIds: Set<string> }
export function formatLintResults(results: { errors: string[]; warnings: string[] }): string

// Path utilities
export function getTemplatePath(): string
export function getFrameworkPath(): string
export function getSchemasPath(): string
