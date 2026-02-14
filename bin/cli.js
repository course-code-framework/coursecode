#!/usr/bin/env node

/**
 * CourseCode CLI
 * 
 * Commands:
 *   coursecode create <name>  - Create a new course project
 *   coursecode dev            - Start development server
 *   coursecode build          - Build course package
 *   coursecode upgrade        - Upgrade framework in current project
 *   coursecode clean          - Remove example files from project
 *   coursecode new <type>     - Create new slide, assessment, or config
 *   coursecode test-errors    - Test error reporting configuration
 *   coursecode test-data      - Test data reporting configuration
 *   coursecode version         - Show version
 */

import { Command } from 'commander';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('coursecode')
  .description('Multi-format course authoring framework CLI')
  .version(packageJson.version);

// Version command (explicit subcommand)
program
  .command('version')
  .description('Show CLI version')
  .action(() => {
    console.log(packageJson.version);
  });

// Create command
program
  .command('create <name>')
  .description('Create a new course project')
  .option('--blank', 'Create without example slides (clean starter)')
  .option('--no-install', 'Skip npm install')
  .option('--start', 'Auto-start dev server after creation (skip prompt)')
  .action(async (name, options) => {
    const { create } = await import('../lib/create.js');
    await create(name, options);
  });

// Dev command
program
  .command('dev')
  .description('Start development server with hot reload')
  .option('-p, --port <port>', 'Port to run on', '5173')
  .option('-f, --format <format>', 'LMS format: scorm2004, scorm1.2, cmi5, lti, scorm1.2-proxy, scorm2004-proxy, or cmi5-remote')
  .action(async (options) => {
    const { dev } = await import('../lib/dev.js');
    await dev(options);
  });

// Build command
program
  .command('build')
  .description('Build course package for LMS deployment')
  .option('--no-zip', 'Skip ZIP archive creation')
  .option('--no-lint', 'Skip linting')
  .option('-f, --format <format>', 'LMS format: scorm2004, scorm1.2, cmi5, lti, scorm1.2-proxy, scorm2004-proxy, or cmi5-remote')
  .action(async (options) => {
    const { build } = await import('../lib/build.js');
    await build(options);
  });

// Lint command
program
  .command('lint')
  .description('Validate course configuration and structure')
  .option('--course-path <path>', 'Path to course directory (default: ./course)', './course')
  .option('-v, --verbose', 'Show detailed error output')
  .action(async (options) => {
    const { lint } = await import('../lib/build-linter.js');
    await lint(options);
  });

// Upgrade command
program
  .command('upgrade')
  .description('Upgrade framework in current project to latest version')
  .option('-f, --force', 'Force upgrade even if versions match')
  .option('-c, --configs', 'Also update vite.config.js and eslint.config.js (creates backups)')
  .option('--dry-run', 'Show what would be changed without making changes')
  .action(async (options) => {
    const { upgrade } = await import('../lib/upgrade.js');
    await upgrade(options);
  });

// Narration command
program
  .command('narration')
  .description('Generate audio narration from text using ElevenLabs')
  .option('-f, --force', 'Regenerate all narration (ignore cache)')
  .option('-s, --slide <id>', 'Generate narration for a specific slide only')
  .option('--dry-run', 'Preview what would be generated')
  .action(async (options) => {
    const { narration } = await import('../lib/narration.js');
    await narration(options);
  });

// Export content command
program
  .command('export-content')
  .description('Export course content to Markdown or JSON for review/localization. Extracts: headers, tabs, accordions, callouts, cards, flip-cards, tables, pattern layouts, and all interaction types.')
  .option('-o, --output <file>', 'Output file path (defaults to stdout)')
  .option('--no-answers', 'Exclude correct answers for interactions (included by default)')
  .option('--no-feedback', 'Exclude feedback text (included by default)')
  .option('--no-interactions', 'Exclude interactions and assessment questions from output')
  .option('--include-narration', 'Include narration transcripts')
  .option('--interactions-only', 'Export only interactions and assessment questions (no slide content)')
  .option('--slides <ids>', 'Comma-separated slide IDs to export')
  .option('--format <type>', 'Output format: md or json (default: md)', 'md')
  .option('--course-path <path>', 'Path to course directory (default: ./course)', './course')
  .option('--include-anchors', 'Include HTML anchor tags for internal linking (used by preview content viewer)')
  .action(async (options) => {
    const { exportContent } = await import('../lib/export-content.js');
    // Commander uses --no-X pattern: answers defaults to true, --no-answers sets it to false
    const exportOptions = {
      ...options,
      includeAnswers: options.answers !== false,
      includeFeedback: options.feedback !== false,
      excludeInteractions: options.interactions === false,
      includeAnchors: options.includeAnchors === true ? true : undefined,
    };
    await exportContent(exportOptions);
  });

// Convert command
program
  .command('convert [source]')
  .description('Convert docx, pptx, and pdf files to markdown for course authoring')
  .option('-o, --output <dir>', 'Output directory for converted files', './course/references/converted')
  .option('-f, --format <type>', 'Limit to format: docx, pptx, pdf, or all', 'all')
  .option('--dry-run', 'Show what would be converted without writing files')
  .option('--overwrite', 'Overwrite existing markdown files')
  .option('--flatten', 'Output all files to single directory (no subdirs)')
  .action(async (source = './course/references', options) => {
    const { convert } = await import('../lib/convert.js');
    await convert(source, options);
  });

// Import command - PowerPoint to presentation course
program
  .command('import <source>')
  .description('Import a PowerPoint file as a presentation course')
  .option('-n, --name <name>', 'Project name (default: derived from filename)')
  .option('--slides-dir <dir>', 'Use pre-exported slide images from this directory (skips PowerPoint)')
  .option('--no-install', 'Skip npm install')
  .action(async (source, options) => {
    const { importPresentation } = await import('../lib/import.js');
    await importPresentation(source, options);
  });

// Preview command - live preview with stub LMS, or export static preview
program
  .command('preview')
  .description('Live preview with stub LMS + auto-rebuild, or export static preview')
  .option('-e, --export', 'Export static preview folder for sharing (instead of live server)')
  .option('-o, --output <dir>', 'Output directory for export (default: ./course-preview)', './course-preview')
  .option('-p, --password <password>', 'Require password to access preview (export only)')
  .option('--title <title>', 'Custom title (default: course title)')
  .option('--port <port>', 'Preview server port (default: 4173)', '4173')
  .option('--skip-build', 'Skip build step for export (use existing dist folder)')
  .option('--nojekyll', 'Add .nojekyll file (required for GitHub Pages)')
  .option('--no-content', 'Exclude course content viewer from preview toolbar')
  .option('-f, --format <format>', 'LMS format: scorm2004, scorm1.2, cmi5, lti, scorm1.2-proxy, scorm2004-proxy, or cmi5-remote')
  .option('--desktop', 'Signal that preview is launched via the desktop companion app')
  .action(async (options) => {
    if (options.export) {
      const { previewExport } = await import('../lib/preview-export.js');
      await previewExport(options);
    } else {
      const { previewServer } = await import('../lib/preview-server.js');
      await previewServer(options);
    }
  });

// Info command (useful for debugging)
program
  .command('info')
  .description('Show info about current project')
  .action(async () => {
    const { info } = await import('../lib/info.js');
    await info();
  });

// Test error reporting command
program
  .command('test-errors')
  .description('Send a test error to verify error reporting is configured correctly')
  .option('-t, --type <type>', 'Type of test: error or report', 'error')
  .option('-m, --message <message>', 'Custom message to include in the test')
  .option('--insecure', 'Skip TLS certificate verification (for corporate proxies)')
  .action(async (options) => {
    const { testErrorReporting } = await import('../lib/test-error-reporting.js');
    await testErrorReporting(options);
  });

// Test data reporting command
program
  .command('test-data')
  .description('Send a test data record to verify data reporting is configured correctly')
  .option('-t, --type <type>', 'Type of record: assessment, objective, or interaction', 'assessment')
  .option('-m, --message <message>', 'Custom message to include in the test')
  .option('--insecure', 'Skip TLS certificate verification (for corporate proxies)')
  .action(async (options) => {
    const { testDataReporting } = await import('../lib/test-data-reporting.js');
    await testDataReporting(options);
  });

// MCP server command
program
  .command('mcp')
  .description('Start MCP server for AI agent integration (connects to running preview server)')
  .option('--port <port>', 'Preview server port to connect to', '4173')
  .action(async (options) => {
    const { startMcpServer } = await import('../lib/mcp-server.js');
    await startMcpServer(options);
  });
// Token generation command
program
  .command('token')
  .description('Generate access token for multi-tenant CDN deployment')
  .option('--add <clientId>', 'Add client to course-config with generated token')
  .action(async (options) => {
    const { token } = await import('../lib/token.js');
    await token(options);
  });

// Clean command - remove example files from project
program
  .command('clean')
  .description('Remove example slides, audio, and reset course-config.js to minimal starter')
  .action(async () => {
    const { clean } = await import('../lib/scaffold.js');
    clean();
  });

// New command - scaffold new files
const newCmd = program
  .command('new')
  .description('Create new course files (slide, assessment, or config)');

newCmd
  .command('slide <id>')
  .description('Create a new slide file in course/slides/')
  .action(async (id) => {
    const { newSlide } = await import('../lib/scaffold.js');
    newSlide(id);
  });

newCmd
  .command('assessment <id>')
  .description('Create a new assessment file in course/slides/')
  .action(async (id) => {
    const { newAssessment } = await import('../lib/scaffold.js');
    newAssessment(id);
  });

newCmd
  .command('config')
  .description('Create a minimal course-config.js (errors if one exists)')
  .action(async () => {
    const { newConfig } = await import('../lib/scaffold.js');
    newConfig();
  });

// Cloud commands — all support --local to target http://localhost:3000
program
  .command('login')
  .description('Log in to CourseCode Cloud')
  .option('--local', 'Use local Cloud instance (http://localhost:3000)')
  .action(async (options) => {
    const { login, setLocalMode } = await import('../lib/cloud.js');
    if (options.local) setLocalMode();
    await login();
  });

program
  .command('logout')
  .description('Log out of CourseCode Cloud')
  .option('--local', 'Use local Cloud instance (http://localhost:3000)')
  .action(async (options) => {
    const { logout, setLocalMode } = await import('../lib/cloud.js');
    if (options.local) setLocalMode();
    await logout();
  });

program
  .command('whoami')
  .description('Show current Cloud user and organizations')
  .option('--local', 'Use local Cloud instance (http://localhost:3000)')
  .option('--json', 'Output raw JSON')
  .action(async (options) => {
    const { whoami, setLocalMode } = await import('../lib/cloud.js');
    if (options.local) setLocalMode();
    await whoami({ json: options.json });
  });

program
  .command('courses')
  .description('List courses on CourseCode Cloud')
  .option('--local', 'Use local Cloud instance (http://localhost:3000)')
  .action(async (options) => {
    const { listCourses, setLocalMode } = await import('../lib/cloud.js');
    if (options.local) setLocalMode();
    await listCourses();
  });

program
  .command('deploy')
  .description('Build and deploy course to CourseCode Cloud')
  .option('--preview', 'Deploy as preview (expires in 7 days)')
  .option('--password', 'Password-protect preview (interactive prompt)')
  .option('-m, --message <message>', 'Deploy reason (e.g. "Fixed accessibility issues")')
  .option('--local', 'Use local Cloud instance (http://localhost:3000)')
  .action(async (options) => {
    const { deploy, setLocalMode } = await import('../lib/cloud.js');
    if (options.local) setLocalMode();
    await deploy(options);
  });

program
  .command('status')
  .description('Show deployment status for current course')
  .option('--local', 'Use local Cloud instance (http://localhost:3000)')
  .action(async (options) => {
    const { status, setLocalMode } = await import('../lib/cloud.js');
    if (options.local) setLocalMode();
    await status();
  });

program.parse();
