/**
 * MCP Prompts & Tool Configuration
 *
 * Single source of truth for all MCP tool definitions, descriptions,
 * and dynamic instruction generation. mcp-server.js imports from here.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWorkflowStatus } from './authoring-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ========================================
// Tool Definitions
// ========================================

export const TOOLS = [
    // --- Runtime Tools (require headless browser) ---
    {
        name: 'coursecode_state',
        description: `Get course state, runtime errors, and warnings in one call. This is the primary tool for checking errors.

Returns:
- slide: current slide ID (string)
- toc: course structure [{id, type, title, file?}]
- interactions: interactions on current slide [{id, type, hasResponse, isChecked}]
- engagement: slide engagement {complete, percentage, requirements}
- lmsState: LMS data {score, completion, success, bookmark, format, objectives, state}
- apiLog: last 20 LMS API calls [{timestamp, method, args, result}]
- errors: runtime errors/warnings [{type, message, hint, isWarning}]
- frameworkLogs: structured framework log events [{level, domain, operation, message, stack?, timestamp}]
- consoleLogs: browser console warnings/errors [{type, text, time}]

Use this first to understand the course state before taking actions.
Requires preview server to be running.`,
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'coursecode_navigate',
        description: `Navigate to a specific slide by ID. Returns:
- slide: current slide ID
- interactions: interactions on the new slide [{id, type, hasResponse, isChecked}]
- engagement: slide engagement {complete, percentage, requirements}
- accessibility: current accessibility state {theme, highContrast, largeFont, reducedMotion}

Optionally set theme or highContrast before navigating. Use this to toggle dark mode for visual inspection.

Use coursecode_state first to get the structure and find valid slide IDs.
Requires preview server to be running.`,
        inputSchema: {
            type: 'object',
            properties: {
                slideId: {
                    type: 'string',
                    description: 'The slide ID to navigate to'
                },
                theme: {
                    type: 'string',
                    description: 'Set theme before navigating: "light" or "dark"',
                    enum: ['light', 'dark']
                },
                highContrast: {
                    type: 'boolean',
                    description: 'Enable or disable high contrast mode before navigating'
                }
            },
            required: ['slideId']
        }
    },
    {
        name: 'coursecode_interact',
        description: `Set a response for an interaction AND evaluate it in one call. Returns:
- correct: boolean
- score: 0-1
- feedback: feedback message if any
- state: updated course state

Response format depends on interaction type:
- multiple-choice: 'a', 'b', 'c', etc.
- true-false: true or false
- fill-in-blank: {blankId: 'answer'}
- drag-drop: {itemId: 'zoneId'}
- numeric: number
- sequencing: ['id1', 'id2', 'id3']

Requires preview server to be running.`,
        inputSchema: {
            type: 'object',
            properties: {
                interactionId: {
                    type: 'string',
                    description: 'The interaction ID to answer'
                },
                response: {
                    description: 'The response value (format depends on interaction type)'
                }
            },
            required: ['interactionId', 'response']
        }
    },
    {
        name: 'coursecode_reset',
        description: `Clear learner state and restart the course. Use this to test from a fresh state.

Clears localStorage and fully reloads the headless browser.

Requires preview server to be running.`,
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'coursecode_screenshot',
        description: `Take a screenshot of the course preview. Returns a JPEG image.

Two quality modes (neither changes viewport):
- normal (default): JPEG@50 (~20-40KB) — layout checks
- detailed: JPEG@90 (~100-200KB) — close text/element inspection

Captures at the current viewport size. Use coursecode_viewport to change viewport for responsive testing.

Use scrollY to scroll course content before capturing (useful for long slides).
fullPage captures the course iframe's full content area.

Use to visually inspect slide layout, design, and component rendering.
Requires preview server to be running.`,
        inputSchema: {
            type: 'object',
            properties: {
                slideId: {
                    type: 'string',
                    description: 'Navigate to this slide ID before taking screenshot'
                },
                fullPage: {
                    type: 'boolean',
                    description: 'Capture full scrollable page instead of viewport'
                },
                detailed: {
                    type: 'boolean',
                    description: 'Higher JPEG quality for close inspection (does not change viewport)'
                },
                scrollY: {
                    type: 'number',
                    description: 'Scroll course content to this Y position (pixels) before capturing'
                }
            },
            required: []
        }
    },
    {
        name: 'coursecode_viewport',
        description: `Set the headless browser viewport size for responsive design testing.

Two modes:
- Breakpoint name: 'mobile-portrait', 'mobile-landscape', 'tablet-portrait', etc.
  Resolves width dynamically from the course's breakpoint manager (always in sync with CSS).
  Height scales proportionally (16:9).
- Explicit dimensions: {width: 375, height: 812} for specific device sizes.

The viewport PERSISTS until changed again. Call with 'desktop' or {width: 1280, height: 720} to reset.

Returns the applied viewport dimensions and breakpoint name (if used).

Use before coursecode_screenshot to test responsive layouts.
Requires preview server to be running.`,
        inputSchema: {
            type: 'object',
            properties: {
                breakpoint: {
                    type: 'string',
                    description: 'Named breakpoint from the course (e.g., "mobile-portrait", "tablet-landscape", "desktop")'
                },
                width: {
                    type: 'number',
                    description: 'Explicit viewport width in pixels (use with height)'
                },
                height: {
                    type: 'number',
                    description: 'Explicit viewport height in pixels (use with width)'
                }
            },
            required: []
        }
    },
    // --- Workflow & Build Tools ---
    {
        name: 'coursecode_workflow_status',
        description: `Detect the current authoring stage and get stage-specific instructions.

Returns:
- stage: human-readable stage name
- stageNumber: 1-5
- checklist: {hasRawRefs, hasConvertedRefs, hasOutline, hasSlides, hasCourseConfig, previewRunning}
- nextAction: recommended next step
- recommendedTool: MCP tool to use next
- instructions: detailed guidance for the current stage

Stages:
1. Source Ingestion - create project and convert reference docs
2. Outline Creation - build COURSE_OUTLINE.md from references
3. Course Building - create slides and course-config.js
4. Preview & Polish - iterate on visual quality and correctness
5. Export Ready - lint passes, ready for LMS deployment

Call this after completing a major milestone to get updated guidance for the next stage.`,
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'coursecode_build',
        description: `Build the course for deployment. Runs the Vite production build.

Returns:
- success: boolean
- format: LMS format used
- outputDir: path to built output
- errors: any build errors
- warnings: any build warnings
- duration: build time

Use in Stage 5 when the course is ready for export.`,
        inputSchema: {
            type: 'object',
            properties: {
                format: {
                    type: 'string',
                    description: 'LMS format: cmi5, scorm2004, scorm1.2, or lti (default: cmi5)',
                    enum: ['cmi5', 'scorm2004', 'scorm1.2', 'lti']
                }
            },
            required: []
        }
    },
    // --- Catalog & Validation Tools (filesystem, no preview needed) ---
    {
        name: 'coursecode_css_catalog',
        description: `Get CSS class information extracted from real CSS source files.

Without 'category': returns all classes grouped by category with abbreviated declarations.
With 'category': returns full detail for that category only.

Categories are derived from CSS file paths (e.g., "utilities/borders", "layout", "patterns").
Use to discover available CSS classes before authoring slides. Lint catches invalid classes.`,
        inputSchema: {
            type: 'object',
            properties: {
                category: {
                    type: 'string',
                    description: 'Optional category to get full details for (e.g., "utilities/colors", "layout", "patterns")'
                }
            },
            required: []
        }
    },
    {
        name: 'coursecode_component_catalog',
        description: `Get UI component information.

Without 'type': returns compact list of all components (name + description + engagement tracking type).
With 'type': returns full schema, metadata, and HTML usage template for that specific component.

Components are declarative HTML (data-component attributes). No imports needed—just use the HTML patterns in your slide template.
Use to discover available components before authoring slides.`,
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    description: 'Optional component type to get full details for (e.g., "tabs", "accordion")'
                }
            },
            required: []
        }
    },
    {
        name: 'coursecode_interaction_catalog',
        description: `Get interaction type information.

Without 'type': returns compact list of all interaction types (name + description).
With 'type': returns full schema, properties, and factory name for that specific interaction.

Interactions use factory functions from the global CourseCode object (e.g., const { createMultipleChoiceQuestion } = CourseCode). No import statements needed.
Use to discover available interactions before creating assessments.`,
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    description: 'Optional interaction type to get full details for (e.g., "multiple-choice", "drag-drop")'
                }
            },
            required: []
        }
    },

    {
        name: 'coursecode_lint',
        description: `Run the course linter and get structured results.

Always runs build-time lint (config, CSS classes, structure). When the preview server is running and the headless browser is connected, also includes runtime lint results (contrast, touch targets, spacing, layout).

Returns:
- errors: [{slideId?, rule, message, severity, source?, hint?}]
- warnings: [{slideId?, rule, message, severity, source?, class?, suggestion?, hint?}]
- passed: boolean
- runtimeLintIncluded: boolean (true when runtime checks were included)

Build-time rules (always checked):
- undefined-css-class: hallucinated or stale class names (with fix suggestions)
- unknown-component: unregistered data-component types
- requirement-missing-component: engagement requirement without matching component
- missing-slide-file: slide references non-existent file
- slide-id-filename-mismatch: slide ID doesn't match component filename
- assessment-id-mismatch: config ID doesn't match assessment ID
- invalid-gating: bad gating condition configuration

Runtime rules (included when preview is running, source='runtime'):
- Contrast ratio violations
- Touch target size violations
- Spacing issues (missing gap, margin, padding)
- Text proximity to borders, element overlap, styled lists

Suppression: Add data-lint-ignore to any HTML element to suppress warnings for it and children.
  data-lint-ignore           — suppress all warnings
  data-lint-ignore="spacing" — suppress only spacing warnings
  data-lint-ignore="spacing,contrast" — suppress multiple categories
Categories: spacing, contrast, target-size, proximity, overlap, list-style, css-class

Use AFTER making changes to validate the course.`,
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'coursecode_icon_catalog',
        description: `Get icon information.

Without 'name': returns all available icon names grouped by category, with counts and usage syntax.
With 'name': returns the icon's SVG content, category, and usage examples (JS, config, HTML).

Use to discover available icons before authoring slides or configuring menus.`,
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Optional icon name to get full details for (e.g., "check", "book-open")'
                }
            },
            required: []
        }
    },
    {
        name: 'coursecode_export_content',
        description: `Extract course content as structured Markdown or JSON for review.

Returns the full text content of the course: slide headers, body text, tabs, accordions, callouts, cards, interactions, assessment questions, narration, config, and structure overview.

Use cases:
- Compare built course against COURSE_OUTLINE.md for accuracy
- Review all interactions and assessment questions at once
- Audit content wording and consistency across slides
- Generate content for localization or SME review

Filtering options keep output manageable:
- slides: scope to specific slide IDs
- interactionsOnly: just Q&A, no slide content
- excludeInteractions: content only, no Q&A
- format: 'md' (default) or 'json' for structured data

Does not require preview server.`,
        inputSchema: {
            type: 'object',
            properties: {
                slides: {
                    type: 'string',
                    description: 'Comma-separated slide IDs to export (default: all slides)'
                },
                interactionsOnly: {
                    type: 'boolean',
                    description: 'Export only interactions and assessment questions (no slide content)'
                },
                includeNarration: {
                    type: 'boolean',
                    description: 'Include narration transcripts (default: false)'
                },
                includeAnswers: {
                    type: 'boolean',
                    description: 'Include correct answers for interactions (default: true)'
                },
                includeFeedback: {
                    type: 'boolean',
                    description: 'Include feedback text (default: true)'
                },
                excludeInteractions: {
                    type: 'boolean',
                    description: 'Exclude all interactions from output (default: false)'
                },
                format: {
                    type: 'string',
                    description: 'Output format: md or json (default: md)',
                    enum: ['md', 'json']
                }
            },
            required: []
        }
    },
];

// ========================================
// Dynamic Instructions Builder
// ========================================

/**
 * Build a compact directory tree string for a given directory.
 */
function buildDirTree(dirPath, prefix = '', maxDepth = 3, depth = 0) {
    if (depth >= maxDepth || !fs.existsSync(dirPath)) return '';

    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(e => !e.name.startsWith('.'))
        .sort((a, b) => {
            // directories first, then files
            if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

    const lines = [];
    entries.forEach((entry, i) => {
        const isLast = i === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';

        if (entry.isDirectory()) {
            const children = fs.readdirSync(path.join(dirPath, entry.name))
                .filter(e => !e.startsWith('.'));
            lines.push(`${prefix}${connector}${entry.name}/ (${children.length} files)`);
            if (depth < maxDepth - 1) {
                lines.push(buildDirTree(path.join(dirPath, entry.name), prefix + childPrefix, maxDepth, depth + 1));
            }
        } else {
            lines.push(`${prefix}${connector}${entry.name}`);
        }
    });

    return lines.filter(Boolean).join('\n');
}

/**
 * Try to read course title and description from course-config.js
 */
function getCourseInfo(courseDir) {
    const configPath = path.join(courseDir, 'course-config.js');
    if (!fs.existsSync(configPath)) return { title: null, description: null };

    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const titleMatch = content.match(/title:\s*['"`]([^'"`]+)['"`]/);
        const descMatch = content.match(/description:\s*['"`]([^'"`]+)['"`]/);
        return {
            title: titleMatch ? titleMatch[1] : null,
            description: descMatch ? descMatch[1] : null
        };
    } catch {
        return { title: null, description: null };
    }
}

/**
 * Build stage-specific instructions for the current authoring state.
 * Returns instruction text appropriate for the detected stage.
 */
function buildStageInstructions(stageNumber, courseDir, _checklist) {
    const frameworkDocs = path.join(__dirname, '..', 'framework', 'docs');
    const outlineGuidePath = path.join(frameworkDocs, 'COURSE_OUTLINE_GUIDE.md');
    const outlineTemplatePath = path.join(frameworkDocs, 'COURSE_OUTLINE_TEMPLATE.md');
    const authoringGuidePath = path.join(frameworkDocs, 'COURSE_AUTHORING_GUIDE.md');
    const refsDir = path.join(courseDir, 'references');
    const convertedDir = path.join(refsDir, 'converted');

    switch (stageNumber) {
        case 0: // Not initialized
            return `## What to Do

No course project found. Help the author create one:
  coursecode create <project-name>

This creates a course/ directory with the starter template.
After creating the project, the author should add reference files (PDF, DOCX, PPTX) to course/references/ for conversion.

## Next Stage
Once the project exists and reference files are added, Stage 1 (Source Ingestion) begins. Run coursecode_workflow_status to refresh.`;

        case 1: { // Source Ingestion
            const rawFiles = listSafe(refsDir, ['.pdf', '.docx', '.doc', '.pptx', '.ppt']);
            const convertedFiles = listSafe(convertedDir, ['.md']);

            let refStatus = '';
            if (rawFiles.length > 0 && convertedFiles.length === 0) {
                refStatus = `\nFound ${rawFiles.length} unconverted reference file(s):\n${rawFiles.map(f => `  - ${f}`).join('\n')}\n\nConvert them: coursecode convert`;
            } else if (convertedFiles.length > 0) {
                refStatus = `\n${convertedFiles.length} converted reference(s) ready in course/references/converted/`;
                if (rawFiles.length > convertedFiles.length) {
                    refStatus += `\n${rawFiles.length - convertedFiles.length} file(s) still need conversion. Run: coursecode convert`;
                }
            } else {
                refStatus = '\nNo reference files found. The author should add source documents (PDF, DOCX, PPTX) to course/references/';
            }

            return `## What to Do

Help the author prepare reference materials for course creation.
${refStatus}

Reference files go in course/references/ (PDF, DOCX, PPTX).
Convert to markdown: coursecode convert
Converted files appear in course/references/converted/

## Next Stage
Once references are converted to markdown, Stage 2 (Outline Creation) begins. Call coursecode_workflow_status after conversion to get updated guidance.`;
        }

        case 2: { // Outline Creation
            const convertedFiles = listSafe(convertedDir, ['.md']);
            const refList = convertedFiles.length <= 10
                ? convertedFiles.map(f => `  - ${path.join(convertedDir, f)}`).join('\n')
                : convertedFiles.slice(0, 10).map(f => `  - ${path.join(convertedDir, f)}`).join('\n') + `\n  ... and ${convertedFiles.length - 10} more`;

            return `## What to Do

Create COURSE_OUTLINE.md from the reference materials.

1. Read the outline guide (explains format, rules, section structure):
   ${outlineGuidePath}

2. Copy and modify the template to create course/COURSE_OUTLINE.md:
   ${outlineTemplatePath}

3. Use these reference materials as source content:
${refList}

The outline is a DESIGN document. Define content, interactions, structure, engagement requirements, and objectives using template terminology. Do NOT include code or config syntax.

Pause for author review after creating the outline.

## Next Stage
Once the outline is approved, Stage 3 (Course Building) begins. Call coursecode_workflow_status to get updated guidance.`;
        }

        case 3: { // Course Building
            const convertedFiles = listSafe(convertedDir, ['.md']);
            const refList = convertedFiles.length > 0
                ? convertedFiles.map(f => `  - ${path.join(convertedDir, f)}`).join('\n')
                : '  (none found)';

            return `## What to Do

Build slides (course/slides/*.js) and course-config.js from the outline.

1. READ THESE FIRST (essential for slide format, config, interactions, CSS):
   Authoring Guide: ${authoringGuidePath}
   Outline: ${path.join(courseDir, 'COURSE_OUTLINE.md')}

2. REFERENCE MATERIALS (converted source content for slide writing):
${refList}

3. SLIDE FILE FORMAT (course/slides/*.js):
   export const meta = { title: 'Slide Title' };
   export default \`<section class="slide">...</section>\`;
   Each file exports meta (title) + default HTML string.
   ⚠️ NO import statements needed. Components, interactions, CSS classes, and icons are all globally available.
   The only valid import is for local assets: import myImg from '../assets/images/photo.png';

4. RULES:
   - ⚠️ NEVER add import statements for components, interactions, CSS, or icons. They are globally available.
     Only import local assets (images, SVGs): import myImage from '../assets/images/photo.png';
     Interactions: const { createMultipleChoiceQuestion } = CourseCode; (destructure from global, NOT import)
     Components: use data-component="tabs" in HTML (declarative, no JS needed)
   - Use coursecode_css_catalog to discover available CSS classes by category. Lint catches invalid classes with fix suggestions.
   - Use coursecode_component_catalog and coursecode_interaction_catalog to discover available components and interactions.
   - Run lint after each batch of file changes. Fix all errors before proceeding.
   - Never modify files in framework/ — all work goes in course/ only.
   - No em-dashes in sentence structure. Use alternative phrasing.

Pause for author review after the initial slide build.

## Next Stage
Once slides and config are built, Stage 4 (Preview & Polish) begins. Start the preview and call coursecode_workflow_status for updated guidance.`;
        }

        case 4: { // Preview & Polish
            const convertedFiles = listSafe(convertedDir, ['.md']);
            const refList = convertedFiles.length > 0
                ? convertedFiles.map(f => `  - ${path.join(convertedDir, f)}`).join('\n')
                : '';

            // Import-specific guidance
            if (_checklist.source === 'powerpoint-import') {
                return `## Imported from PowerPoint

This course was imported from a PowerPoint presentation. Each slide is currently a static image. Your job is to enhance it into an interactive course.

1. Ensure the preview server is running (\`coursecode preview\` in a terminal, or AI uses a terminal/command execution tool)
2. Review slides: screenshot each to understand the content
3. Enhancement priorities:
   - **Replace image slides** with interactive HTML — use the extracted text from references/converted/ as source content
   - **Add engagement tracking** — require interaction before advancing (tabs, accordions, etc.)
   - **Insert assessments** — add knowledge checks with multiple-choice, drag-drop, etc.
   - **Group into sections** — organize slides into logical modules with section headers in course-config.js
   - **Customize theme** — update colors in course/theme.css
${refList ? `\n4. REFERENCE MATERIALS (extracted text from presentation):\n${refList}\n` : ''}
5. RULES:
   - Use coursecode_css_catalog, coursecode_component_catalog, and coursecode_interaction_catalog to discover available options
   - Run lint after changes. Fix all errors before proceeding.
   - Efficient loop: edit files → lint → fix errors → screenshot to verify

## Next Stage
Once polished and lint passes, Stage 5 (Export Ready) begins.`;
            }

            return `## What to Do

Visually verify and polish the course using the preview server.

1. Ensure the preview server is running (\`coursecode preview\` in a terminal, or AI uses a terminal/command execution tool)
2. Do NOT open a browser yourself — the MCP has its own headless Chrome
3. Workflow (all tools execute instantly via internal headless browser):
   - coursecode_state — get course structure, current slide, interactions, engagement
   - coursecode_navigate — go to any slide by ID (get IDs from coursecode_state)
   - coursecode_screenshot — capture visual state (accepts slideId to navigate+capture in one call)
   - coursecode_interact — test interactions with responses
   - coursecode_export_content — extract all text content to review or compare against outline
   - coursecode_lint — validate after file changes

4. Efficient iteration loop:
   Edit files → lint → fix errors → screenshot to verify visual result
   Do NOT screenshot every slide sequentially. Target specific slides.
${refList ? `\n5. REFERENCE MATERIALS (for verifying content accuracy):\n${refList}\n` : ''}
Run lint and ensure zero errors before moving to export.

## Next Stage
Once the course is polished and lint passes, Stage 5 (Export Ready) begins. Call coursecode_workflow_status for export guidance.`;
        }

        case 5: // Export Ready
            return `## What to Do

Export the finished course for LMS deployment.

1. Run lint one final time to confirm zero errors
2. Build with: coursecode_build (format: cmi5, scorm2004, scorm1.2, or lti)
   - cmi5 (default) for modern LMS
   - scorm1.2 for legacy systems

The build produces a dist/ output for deployment. If you need a packaged ZIP for LMS upload, use the CLI packaging commands outside MCP (for example \`coursecode package\`).`;

        default:
            return 'Call coursecode_workflow_status to determine the current authoring stage.';
    }
}

/**
 * Safely list files in a directory matching given extensions.
 */
function listSafe(dirPath, extensions) {
    try {
        if (!fs.existsSync(dirPath)) return [];
        return fs.readdirSync(dirPath).filter(f =>
            extensions.some(ext => f.toLowerCase().endsWith(ext))
        );
    } catch {
        return [];
    }
}

/**
 * Build the browser architecture and rules section.
 * Critical for preventing agents from using external browsers.
 */
function buildBrowserRules() {
    return `## Browser Architecture (CRITICAL)

The MCP server runs its OWN headless Chrome internally via puppeteer-core.
All runtime tools (state, navigate, interact, screenshot, viewport, reset) execute instantly inside this headless browser.

### Preview Server Ownership
- The MCP does NOT start or manage the preview server
- The preview must be started externally: run \`coursecode preview\` in a terminal (human) or via a terminal/command execution tool (AI agent)
- If preview is not running, runtime tools will fail with a clear error message
- The headless browser auto-reconnects when Vite rebuilds (file changes)

### Navigation API
- coursecode_state → get slim TOC with slide IDs, current slide, interactions, engagement, lmsState, apiLog, errors, frameworkLogs, consoleLogs
- coursecode_navigate(slideId) → go to any slide instantly by ID
- coursecode_viewport(breakpoint or {width,height}) → set viewport for responsive testing (persists until changed)
- coursecode_screenshot(slideId) → navigate + capture in one call (quality modes only, never changes viewport)
- coursecode_interact(interactionId, response) → set response + evaluate in one call
- NEVER click nav buttons or menu items via browser tools. Use these MCP tools.

### RULES
- Do NOT use browser_subagent, open_browser_url, or any external browser tool to view the course
- Do NOT add manual waits or setTimeout delays — all tool calls return instantly
- Do NOT screenshot every slide sequentially — target specific slides to verify
- NEVER modify files in framework/ or lib/ — these are the framework internals. All authoring goes in course/ only.
- Efficient loop: edit files → lint → fix errors → screenshot specific slides to verify

### Customization (all in course/, never in framework/)
- **CSS overrides**: Edit \`course/theme.css\` — override palette tokens to rebrand (all colors cascade via color-mix). Use framework utility classes first (\`coursecode_css_catalog\`), \`theme.css\` only for brand-specific overrides.
- **Custom components**: Add \`.js\` files to \`course/components/\` — auto-discovered at build time. Use \`coursecode_component_catalog\` for built-in options first.
- **Custom interactions**: Add \`.js\` files to \`course/interactions/\` — auto-discovered. See "Extending with Plugins" in \`framework/docs/USER_GUIDE.md\` for the contract.
- **Custom icons**: Add SVG definitions to \`course/icons.js\` — merged with built-in icons. Use icon_catalog to check existing icons first.`;
}

const __packageRoot = path.dirname(__dirname); // lib/ -> repo root

/**
 * Find the course/ directory, trying cwd first then package root.
 * Returns the path to the course/ dir, or null if not found.
 */
function findCourseDir() {
    const candidates = [process.cwd(), __packageRoot];
    for (const root of candidates) {
        if (fs.existsSync(path.join(root, 'course'))) {
            return path.join(root, 'course');
        }
        if (fs.existsSync(path.join(root, 'template', 'course'))) {
            return path.join(root, 'template', 'course');
        }
    }
    return null;
}

/**
 * Build the full MCP instructions string — called at server startup.
 * Also used by workflow_status to provide refreshed instructions mid-session.
 */
export async function buildInstructions(port = 4173) {
    const status = await getWorkflowStatus(port);
    const { stageNumber, stage, checklist } = status;

    const courseDir = findCourseDir();
    const courseInfo = courseDir ? getCourseInfo(courseDir) : { title: null, description: null };

    // Header: framework identity + course info + stage
    const header = [
        'CourseCode: AI-assisted e-learning course authoring for LMS (cmi5/SCORM).',
        courseInfo.title ? `Course: "${courseInfo.title}"${courseInfo.description ? ` — ${courseInfo.description}` : ''}` : '',
        `Stage ${stageNumber}/5: ${stage}`,
    ].filter(Boolean).join('\n');

    // Directory tree (if course exists)
    let tree = '';
    if (courseDir) {
        tree = `\ncourse/\n${buildDirTree(courseDir, '', 2)}`;
    }

    // Browser rules (always included)
    const browserRules = buildBrowserRules();

    // Automation warning (when config exists but automation is off)
    let automationWarning = '';
    if (checklist.hasCourseConfig && !checklist.hasAutomationEnabled) {
        automationWarning = `\n\n## ⚠️ Automation Disabled
MCP runtime tools (\`coursecode_state\`, \`coursecode_navigate\`, \`coursecode_interact\`, and \`coursecode_reset\`, plus screenshot/navigation features that rely on course API access) require \`environment.automation.enabled: true\` in course-config.js. Without it, the headless browser cannot access the course API and these tools will fail.
You MUST notify the author about this and let them decide whether to enable it. Do not silently modify the config.`;
    }

    // Stage-specific body
    const stageBody = buildStageInstructions(stageNumber, courseDir || '', checklist);

    return `${header}${tree}\n\n${browserRules}${automationWarning}\n\n${stageBody}`;
}

/**
 * Get the enhanced workflow status with stage-specific instructions.
 * Called by the coursecode_workflow_status tool handler.
 */
export async function getWorkflowStatusWithInstructions(port = 4173) {
    const status = await getWorkflowStatus(port);
    const courseDir = findCourseDir() || '';
    status.instructions = buildStageInstructions(status.stageNumber, courseDir, status.checklist);
    return status;
}
