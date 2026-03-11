# Course Authoring Guide

> **Intended Audience: AI Agents** — This document is a machine-readable reference for AI agents authoring courses. For human-readable documentation, see `USER_GUIDE.md`.

**Related Docs:**
- `FRAMEWORK_GUIDE.md` - Framework internals (not needed for course authoring)
- `COURSE_OUTLINE_GUIDE.md` - Blueprint creation for instructional design

> **MCP users:** Use `coursecode_css_catalog`, `coursecode_component_catalog`, `coursecode_interaction_catalog`, and `coursecode_icon_catalog` tools for dynamic, always-current references. The sections below cover usage patterns and rules that the catalog tools do not provide.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `coursecode create <name>` | Create a new course project (includes example slides) |
| `coursecode create <name> --blank` | Create a blank project (no example content) |
| `coursecode clean` | Remove example files and reset config to minimal starter |
| `coursecode new slide <id>` | Create a new slide file in `course/slides/` |
| `coursecode new assessment <id>` | Create a new assessment file in `course/slides/` |
| `coursecode new config` | Create a minimal `course-config.js` (errors if exists) |
| `coursecode convert` | Convert docx/pptx/pdf in `course/references/` to markdown |
| `coursecode import <pptx>` | Import PowerPoint as a presentation course |
| `coursecode dev` | Run Vite build in watch mode (outputs to `dist/`) |
| `coursecode build` | Build SCORM package (ZIP ready for LMS) |
| `coursecode preview` | Live preview with stub LMS + auto-rebuild on changes |
| `coursecode preview --export` | Export static preview for stakeholder sharing |
| `coursecode upgrade` | Upgrade framework in current project |
| `coursecode upgrade --configs` | Also update vite.config.js and eslint.config.js |
| `coursecode narration` | Generate audio narration from text |
| `coursecode info` | Show info about current project |
| `coursecode export-content` | Export course content for translation/review |
| `coursecode test-errors` | Test error reporting webhook configuration |
| `coursecode test-data` | Test data reporting webhook configuration |
| `coursecode mcp` | Start MCP server for AI agent integration |

**Format options** (for local `dev`, `build`, `preview` — not needed for cloud-deployed courses):
```bash
coursecode build --format scorm1.2   # Build for SCORM 1.2 LMS
coursecode preview --format cmi5     # Preview cmi5 format
```
Supported formats: `cmi5` (default), `scorm2004`, `scorm1.2`, `lti`, `scorm1.2-proxy`, `scorm2004-proxy`, `cmi5-remote`

> **Cloud courses:** When deployed to CourseCode Cloud, the format is chosen at download time, not build time. The cloud generates any format from a single universal build. The `--format` flag and `course-config.js` format setting are only relevant for local CLI workflows.

## Example Files in New Projects

New projects created with `coursecode create` include example slides (prefixed `example-`) and a pre-configured `course-config.js` referencing them. When authoring a real course, **delete all `example-*` slide and audio files** and replace `course-config.js` with your own structure. The `coursecode clean` CLI command automates this — it removes all `example-*` files and resets the config to a minimal starter.

---

## CLI Import (PowerPoint)

Converts a `.pptx` file into a complete CourseCode project using the `presentation` layout. Each slide is exported as a PNG image and wrapped in an HTML slide file.

```bash
# Auto-export via PowerPoint (macOS only)
coursecode import presentation.pptx

# Use pre-exported slide images (any platform)
coursecode import presentation.pptx --slides-dir ./exported-pngs/
```

| Option | Description |
|--------|-------------|
| `-n, --name <name>` | Project name (default: derived from filename) |
| `--slides-dir <dir>` | Directory of pre-exported slide PNGs (skips PowerPoint) |
| `--no-install` | Skip `npm install` |

**What it generates:**

```
my-course/
├── course/
│   ├── course-config.js          # layout: 'presentation', no engagement
│   ├── assets/slides/            # slide-01.png … slide-N.png
│   ├── slides/                   # slide-01.html … slide-N.html (<img> wrappers)
│   └── references/converted/      # Converted text from source documents
└── framework/
```

**Auto-export (macOS):** Uses AppleScript to drive Microsoft PowerPoint — exports each slide as PNG, then closes the file. Requires PowerPoint to be installed.

**Manual fallback:** If PowerPoint isn't available, export slides to PNG manually (PowerPoint → File → Save As → PNG), then use `--slides-dir` to point at the exported folder.

**Progressive enhancement:** After import, AI agents or authors can replace image slides with interactive HTML, add assessments, or add engagement tracking.

## CLI Preview

Test your course with a stub LMS wrapper.

**Architecture:** Preview runs Vite in **build watch mode** (not dev server) outputting to `dist/`, then serves `dist/` via a lightweight HTTP server with an embedded stub SCORM API. This mirrors how courses run in real LMSs.

### Live Preview (Default)

Runs Vite build in watch mode + stub LMS server. Changes to source files trigger automatic rebuilds:

```bash
coursecode preview                    # Open http://localhost:4173
```

| Option | Description |
|--------|-------------|
| `--port <port>` | Preview server port (default: 4173) |
| `--title <title>` | Custom browser title |
| `--no-content` | Disable course content viewer |
| `-f, --format <format>` | LMS format: `scorm2004`, `scorm1.2`, `cmi5`, or `lti` |

### Static Export

Generate a self-contained folder for stakeholder sharing (Netlify, GitHub Pages, etc.):

```bash
coursecode preview --export                    # Build and create ./course-preview
coursecode preview --export -p "secret"        # With password protection
coursecode preview --export --skip-build       # Use existing dist/
coursecode preview --export -o ./stakeholder   # Custom output directory
coursecode preview --export --no-content       # Exclude content viewer
```

| Option | Description |
|--------|-------------|
| `-e, --export` | Export static folder instead of running live server |
| `-o, --output <dir>` | Output directory (default: `./course-preview`) |
| `-p, --password <pwd>` | Optional password protection |
| `--skip-build` | Use existing `dist/` instead of rebuilding |
| `--nojekyll` | Add `.nojekyll` file (required for GitHub Pages) |
| `--no-content` | Disable course content viewer |
| `-f, --format <format>` | LMS format: `scorm2004`, `scorm1.2`, `cmi5`, or `lti` |

**Deployment:** Drag the output folder to Netlify (or similar) for instant shareable URL.

### GitHub Pages Deployment

GitHub Pages only serves from two locations: repository root (`/`) or `/docs`. To deploy your preview:

```bash
# Export to /docs folder with .nojekyll file
coursecode preview --export -o ./docs --nojekyll
```

Then in your repository settings, enable GitHub Pages and set the source to `/docs`.

**Important:** The `--nojekyll` flag creates a `.nojekyll` file which prevents Jekyll processing. Without this, GitHub Pages may ignore files/folders starting with underscores or dots (like `_course.html`).

To include the `/docs` folder in your repository, comment out `course-preview/` in `.gitignore` (or add `docs/` if using that name).

### Features (Both Modes)

- **Stub SCORM API** (`API_1484_11`) with localStorage persistence
- **Preview toolbar** (starts collapsed): Reset Course, Skip Gating toggle, Content, Debug buttons
- **Debug panel** with three tabs:
  - **State**: Runtime CMI data and decoded suspend_data
  - **API Log**: Every GetValue/SetValue call with timestamps
  - **Errors**: Validation warnings (invalid values, type mismatches, range errors)
- **Content viewer**: Rendered course content as Markdown for quick reference (disable with `--no-content`)
- **URL parameters**: `?skipGating=true`, `?debug=true`
- **MCP automation**: `coursecode mcp` starts an MCP server that connects to the preview for AI-controlled testing

Live preview includes **automatic live reload**: when you save a file, Vite rebuilds and the course iframe refreshes automatically (stub LMS state is preserved).

---

## CLI Narration

Generate audio from text sources using AI TTS via API.

| Option | Description |
|--------|-------------|
| `-f, --force` | Regenerate all narration (ignore cache) |
| `-s, --slide <id>` | Generate narration for a specific slide only |
| `--dry-run` | Preview what would be generated |

**Examples:**

```bash
coursecode narration                  # Generate all changed narration
coursecode narration --slide intro    # Generate for one slide only
coursecode narration --force          # Regenerate all (ignore cache)
coursecode narration --dry-run        # Preview without generating
```

## CLI Export Content

Extracts reviewable text content from SCORM course source files into structured Markdown.

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output file path (defaults to stdout) |
| `--no-answers` | Exclude correct answers for interactions (included by default) |
| `--no-feedback` | Exclude feedback text (included by default) |
| `--no-interactions` | Exclude interactions and assessment questions from output |
| `--include-narration` | Include narration transcripts |
| `--interactions-only` | Export only interactions and assessment questions (no slide content) |
| `--slides <ids>` | Comma-separated slide IDs to export |
| `--format <type>` | Output format: `md` or `json` (default: `md`) |
| `--course-path <path>` | Path to course directory (default: `./course`) |

**Examples:**

```bash
# Export all content to stdout
coursecode export-content

# Export to a file for review
coursecode export-content -o content-review.md

# Export only interactions for SME review
coursecode export-content --interactions-only -o quiz-review.md

# Export specific slides
coursecode export-content --slides intro,module1,summary -o selected-content.md

# Export with narration transcripts included
coursecode export-content --include-narration -o full-content.md

# Export as JSON for programmatic processing
coursecode export-content --format json -o content.json
```

---

## Writing Style

- **No em-dashes** in sentance structure. Use alternative phrasing or punctuation instead.

---

## Core Principle

**NEVER modify `framework/` directory** - all course work in `course/` only.

## Quick Start

1. **Edit course metadata** in `course/course-config.js` (auto-populates SCORM manifest)

2. **Define structure** in `course/course-config.js`:
   ```javascript
   structure: [
     { id: 'intro', title: 'Introduction', file: 'intro.js' },
     { id: 'content-1', title: 'Lesson 1', file: 'content.js', locked: { stateFlag: 'intro-complete' } }
   ]
   ```

3. **Create slide** in `course/slides/intro.js`:
   ```javascript
   export const slide = {
     render(root, context) {
       const container = document.createElement('div');
       container.innerHTML = `<h1>Welcome</h1><p>Content here</p>`;
       return container;  // Must return a DOM element
     }
   };
   ```

   > **⚠️ No import statements.** Components, interactions, CSS classes, and icons are all globally available at runtime. The only valid `import` is for local assets (images, SVGs). Access framework APIs via `const { createXxxQuestion } = CourseCode;` (destructure from global, **not** an import).

4. **Add styles** to `course/theme.css` (only for custom branding - use framework utility classes first, see CSS Quick Reference section below)

## Build Process

The template uses Vite with automated SCORM packaging. The `imsmanifest.xml` is **automatically generated** from `course-config.js` during build. Never edit the manifest directly.

> **Cloud builds:** The format in `course-config.js` determines the meta tag stamped during a local build, but for cloud-deployed courses this is irrelevant. The cloud re-stamps the meta tag and generates the manifest for any requested format from a single universal `dist/` — no rebuild needed.

## External Hosting (CDN Deployment)

Deploy courses to a CDN for instant updates without re-uploading to the LMS.

**Formats:**
| Format | Upload to LMS | Deploy to CDN |
|--------|---------------|---------------|
| `scorm1.2-proxy` | Tiny proxy ZIP (~15KB) | Full course |
| `scorm2004-proxy` | Tiny proxy ZIP (~15KB) | Full course |
| `cmi5-remote` | Manifest-only ZIP (~1KB) | Full course |

**Setup:**
```javascript
// course-config.js
format: 'scorm1.2-proxy',
externalUrl: 'https://cdn.example.com/my-course',
accessControl: {
    clients: {
        'acme-corp': { token: 'abc123' },
        'globex': { token: 'def456' }
    }
}
```

**Generate tokens:**
```bash
coursecode token                  # Generate random token
coursecode token --add acme-corp  # Add client with token to config
```

**Build:**
```bash
coursecode build  # Creates dist/ + *_<client>_proxy.zip per client
```

**Deploy:**
1. Upload `dist/` to CDN (GitHub Pages, Vercel, Netlify, etc.)
2. Upload client-specific proxy ZIP to each client's LMS
3. Future updates: just redeploy to CDN—no LMS re-upload needed

**Multi-tenant benefits:**
- One CDN deployment serves multiple LMS clients
- Each client gets a unique token baked into their package
- Disable a client by removing from config and redeploying

**General benefits:**
- Hot-fix typos/content without LMS involvement
- Smaller LMS package = faster upload/launch
- CDN caching = better performance

---

## Data Persistence

**Never call SCORM API directly** - use the framework APIs exposed on `CourseCode`:

| Manager | Purpose | Key Methods |
|---------|---------|-------------|
| `stateManager` | LMS + persistent course state (sole gateway) | `.getDomainState(domain)`, `.setDomainState(domain, value)`, `.reportScore(...)`, `.reportCompletion(...)`, `.setBookmark(...)` |
| `objectiveManager` | Track learning objectives | Auto: built-in criteria + assessment-linked<br>Manual: `.setCompletionStatus(id, status)`, `.setSuccessStatus(id, status)`, `.setScore(id, score)` |
| `interactionManager` | Record/report learner interactions | Usually auto-logged by built-in interactions |
| `flagManager` | Boolean/primitive flags in suspend data | `.setFlag(name, value)`, `.getFlag(name)`, `.removeFlag(name)` |
| `scoreManager` | Calculate/report course scores | Usually configured in `course-config.js` (auto) |

**Note:** Engagement tracking is normally configured in `course-config.js` (`slide.engagement`) and handled automatically by built-in components. Authors typically do not call an `engagementManager` directly.

### Objectives (in `course-config.js`)

```javascript
objectives: [
  { id: 'complete-intro', criteria: { type: 'slideVisited', slideId: 'intro' } },
  { id: 'complete-foundation', criteria: { type: 'allSlidesVisited', slideIds: ['intro-01', 'intro-02'] } },
  { id: 'master-content', criteria: { type: 'timeOnSlide', slideId: 'content-1', minSeconds: 60 } },
  { id: 'intro-done', criteria: { type: 'flag', key: 'intro-complete', equals: true } },
  { id: 'all-unlocked', criteria: { type: 'allFlags', flags: ['step1', 'step2', 'step3'] } },
  { id: 'obj-final-exam-passed' }  // No criteria - auto-managed by assessment
]
```

### Course-Level Scoring

The framework supports automatic calculation and reporting of `cmi.score.raw` based on assessment and objective scores. This is **optional** and configured in `course-config.js`. The course score will automatically recalculate when objective scores change.

### Course Updates & Existing Learners

When you update a course (add/remove slides, change assessments), existing learners may have incompatible stored data:

- **Dev mode**: Throws errors to catch issues during testing
- **Prod mode**: Gracefully recovers (reverts to defaults, filters missing questions)

**Best practice**: Use `metadata.version` in `course-config.js` to track course versions.

---

## Audio Narration

Three audio modes available.

### Narration Writing Best Practices

Narration should **complement** on-screen content, not read it verbatim. Learners read faster than audio plays; duplicating text creates cognitive dissonance.

**Effective narration:**
- Expands on displayed points with context or examples
- Guides attention: "Notice the three steps listed here" then explains their significance  
- Provides transitions between concepts
- Adds conversational tone and expert insight

**Avoid:**
- Reading bullet points or headings word-for-word
- Narrating every piece of on-screen text
- Describing obvious visual elements

**Exception:** Critical warnings, verbatim policies, or procedures may benefit from matched audio and text for reinforcement.

### Slide-Level Audio

Configure in `course-config.js`:

```javascript
{
  id: 'intro',
  component: '@slides/intro.js',
  title: 'Introduction',
  audio: {
    src: 'audio/intro-narration.mp3',  // Relative to course/assets/
    autoplay: false,
    completionThreshold: 0.95
  },
  engagement: {
    required: true,
    requirements: [
      { type: 'slideAudioComplete', message: 'Listen to the narration before continuing' }
    ]
  }
}
```

### Standalone Audio Players

Place anywhere on slide:

```html
<div data-component="audio-player" 
     data-audio-src="audio/narration.mp3"
     data-audio-id="section1-audio">
</div>
```

Gate with: `{ type: 'audioComplete', audioId: 'section1-audio' }`

### Modal Audio

Add to modal triggers:

```html
<button 
  data-component="modal-trigger" 
  data-modal-id="details-modal"
  data-title="Learn More"
  data-audio-src="audio/modal-details.mp3">
  Show Details
</button>
```

Gate with: `{ type: 'modalAudioComplete', modalId: 'details-modal' }`

### Video Players

Native HTML5, YouTube, or Vimeo:

```html
<!-- Native video (custom controls, progress tracking) -->
<div data-component="video-player"
     data-video-src="video/intro.mp4"
     data-video-id="intro-video"
     data-video-poster="images/poster.jpg">
</div>

<!-- YouTube/Vimeo (platform controls, auto-detected) -->
<div data-component="video-player"
     data-video-src="https://youtu.be/xyz123"
     data-video-id="demo-video">
</div>
```

Gate with: `{ type: 'videoComplete', videoId: 'intro-video' }`

> **Note:** External videos (YouTube/Vimeo) don't support progress tracking or completion gating.

### Automated Narration Generation

Generate audio from text using ElevenLabs:

```javascript
// In slide file
export const narration = `Welcome to this course...`;

// Or with voice settings
export const narration = {
  text: `Welcome to this course...`,
  voice_id: 'EXAVITQu4vr4xnSDxMaL',
  stability: 0.5
};
```

```javascript
// In course-config.js
audio: { src: '@slides/intro.js' }  // → generates assets/audio/intro.mp3
```

Run `npm run narration` to generate.

---

## Interactions Reference

> **MCP users:** Use `coursecode_interaction_catalog` for full schemas. Below covers usage patterns the catalog doesn't provide.

All interactions follow the same pattern:

```javascript
// Destructure from the global CourseCode object — NOT an import statement
const { createXxxQuestion } = CourseCode;

const question = createXxxQuestion({ id: 'unique-id', prompt: 'Question text', ...typeSpecificConfig });
question.render(container);  // Or question.render(container, savedResponse) to restore state
```

> **⚠️ No imports needed.** `CourseCode` is a global object available in all slide files. Use destructuring (`const { ... } = CourseCode`) to access factory functions. Do NOT use `import { ... } from '...'` for any framework API.

**Common options** (all types):
- `id` (required): Unique identifier, used for engagement tracking
- `prompt` (required): Question text displayed to learner
- `controlled`: `false` (default) = auto-registers for engagement tracking; `true` = assessment-managed
- `feedback`: `{ correct: 'Custom message', incorrect: 'Custom message' }`

### Multiple Choice

```javascript
// Single-select (radio buttons)
createMultipleChoiceQuestion({
  id: 'q1', prompt: 'Which is correct?',
  choices: [
    { value: 'a', text: 'Option A' },
    { value: 'b', text: 'Option B', description: 'Optional hint' },
    { value: 'c', text: 'Option C' }
  ],
  correctAnswer: 'b'
});

// Multi-select (checkboxes) - mark correct choices with `correct: true`
createMultipleChoiceQuestion({
  id: 'q2', prompt: 'Select all that apply:',
  multiple: true,
  choices: [
    { value: 'a', text: 'Option A', correct: true },
    { value: 'b', text: 'Option B' },
    { value: 'c', text: 'Option C', correct: true }
  ]
});
```

### True/False

```javascript
createTrueFalseQuestion({
  id: 'tf1', prompt: 'The sky is blue.',
  correctAnswer: true,   // boolean
  autoCheck: false       // true = instant feedback on selection (no check button)
});
```

### Fill-in-the-Blank

```javascript
// INLINE MODE - Text with embedded inputs using {{placeholders}}
createFillInQuestion({
  id: 'fill1',
  template: 'The capital of {{country}} is Paris.',
  blanks: { country: { correct: 'France', placeholder: 'country...' } }
});

// STACKED MODE - uses `prompt` instead of `template`
createFillInQuestion({
  id: 'fill2', prompt: 'What is the capital of France?',
  blanks: { answer: { correct: 'Paris', placeholder: 'Enter answer...' } }
});
```

**Fuzzy matching:** `correct: ['Paris', 'paris']` (multiple answers) | `typoTolerance: 1` (Levenshtein) | `caseSensitive: false` (default). Whitespace auto-normalized.

### Matching

```javascript
createMatchingQuestion({
  id: 'match1', prompt: 'Match the terms to definitions:',
  pairs: [
    { id: 'term1', text: 'HTML', match: 'Markup Language' },
    { id: 'term2', text: 'CSS', match: 'Styling' },
    { id: 'term3', text: 'JS', match: 'Scripting' }
  ],
  feedbackMode: 'deferred'  // 'deferred' (default) = check all at once; 'immediate' = instant per-match
});
```

### Drag-and-Drop

```javascript
createDragDropQuestion({
  id: 'dd1', prompt: 'Drag items to correct zones:',
  items: [
    { id: 'item1', content: 'Apple' },
    { id: 'item2', content: 'Carrot' },
    { id: 'item3', content: 'Banana' }
  ],
  dropZones: [
    { id: 'fruit', label: 'Fruits', accepts: ['item1', 'item3'], maxItems: 2 },
    { id: 'veg', label: 'Vegetables', accepts: ['item2'], maxItems: 1 }
  ]
});
```

### Numeric

```javascript
// Exact value with tolerance
createNumericQuestion({
  id: 'num1', prompt: 'What is 2 + 2?',
  correctRange: { exact: 4 },
  tolerance: 0,               // allows ±tolerance
  placeholder: 'Enter number...', units: 'items'
});

// Range-based
createNumericQuestion({
  id: 'num2', prompt: 'Enter a number between 10 and 20:',
  correctRange: { min: 10, max: 20 }
});
```

### Hotspot

```javascript
createHotspotQuestion({
  id: 'hot1', prompt: 'Click the correct region:',
  image: { src: 'assets/images/diagram.png', alt: 'Diagram' },
  hotspots: [
    // pos = [x%, y%, width%, height%]
    { id: 'zone1', pos: [10, 20, 15, 10], correct: true, label: 'Correct Zone', feedback: 'Good choice!' },
    { id: 'zone2', pos: [50, 30, 20, 15], correct: false, label: 'Wrong Zone', feedback: 'Try again' }
  ]
});
```

**Appearance themes**: `'correct'`, `'incorrect'`, `'primary'`, `'accent'` — or provide custom `appearance` object.

### Sequencing

```javascript
createSequencingQuestion({
  id: 'seq1', prompt: 'Arrange in correct order:',
  sequenceLabels: ['First', 'Last'],  // Optional: shows direction track (2+ labels)
  items: [
    { id: 'step1', text: 'First step' },
    { id: 'step2', text: 'Second step' },
    { id: 'step3', text: 'Third step' }
  ],
  correctOrder: ['step1', 'step2', 'step3']  // Items auto-shuffle on render
});
```

### Likert (Survey/Rating Scale)

```javascript
// Survey mode (no correct answers)
createLikertQuestion({
  id: 'survey1', prompt: 'Rate your agreement:',
  scale: [
    { value: '1', text: 'Strongly Disagree' },
    { value: '2', text: 'Disagree' },
    { value: '3', text: 'Neutral' },
    { value: '4', text: 'Agree' },
    { value: '5', text: 'Strongly Agree' }
  ],
  questions: [
    { id: 'q1', text: 'The content was clear.' },
    { id: 'q2', text: 'The examples were helpful.' }
  ]
});

// Quiz mode: add correctAnswers: { q1: '4', q2: '5' }
```

### Custom Interactions

Add a `.js` file to `course/interactions/`. File `rating-scale.js` → factory `CourseCode.createRatingScaleQuestion()`. See "Extending with Plugins" in `framework/docs/USER_GUIDE.md`.

### Interaction Methods

All interaction objects returned by `createXxxQuestion()` expose:

| Method | Description |
|--------|-------------|
| `render(container, initialResponse?)` | Renders into container, optionally restoring saved response |
| `getResponse()` | Returns current learner response |
| `setResponse(response)` | Programmatically sets response |
| `evaluate(response?)` | Returns `{ correct, score, response }` |
| `checkAnswer()` | Evaluates and shows feedback, returns evaluation |
| `reset()` | Clears response and feedback |
| `getCorrectAnswer()` | Returns correct answer (for review screens) |

**Event:** `interaction-checked` fires on the container after `checkAnswer()` with `e.detail.{ isCorrect, evaluation }`.

---

## Interactions vs Assessments

**Practice Questions** (above): Standalone, auto-tracked via engagement, immediate feedback.

**Assessments** (below): Graded, question pools, randomization, retake logic, objective-linked.

### Assessments (Graded)

```javascript
const { AssessmentManager } = CourseCode;

const assessment = AssessmentManager.createAssessment({ ...config, questions }, overrides);
assessment.render(container);
```

**Assessment Config:**
```javascript
export const config = {
  id: 'final-exam',
  assessmentObjective: 'obj-final-exam-passed',  // Auto-updates objective (null for none)
  settings: {
    passingScore: 80,
    randomizeQuestions: true,
    randomizeOnRetake: true,
    allowUnansweredSubmission: true
  }
};
```

**Features**: Question banks, randomization, progressive intervention, auto-linked objectives.

---

## Styling

**Priority**: Utility classes → Design tokens → Custom CSS in `theme.css`

**Important:** `position:fixed` and `position:sticky` are NOT available in SCORM iframes (would escape iframe boundaries). Use `position:absolute` with a positioned parent container instead.

### Styled Lists

Use `.list-styled` (bullets) or `.list-numbered` (ordered) for enhanced list styling with colored markers:

```html
<ul class="list-styled">
  <li>First point</li>
  <li>Second point</li>
</ul>
```

### Container-First Spacing

All content should be in containers that control spacing. Elements like headings, paragraphs, lists, dividers, and tables have **no default margins**. Use:

- `.stack-sm` (8px), `.stack-md` (16px), `.stack-lg` (24px) for vertical layouts
- `.gap-*` (0-6) for flex/grid gaps

```html
<div class="content-medium stack-lg">
  <h1>Title</h1>
  <p>Paragraph with no extra spacing—stack handles it.</p>
  <div class="divider"></div>
  <p>More content.</p>
</div>
```

### Slide Headers

Use `.slide-header` for consistent slide titles:

```html
<header class="slide-header">
    <h1>Welcome to the Course</h1>
    <p>Your guide to getting started</p>
</header>
```

Variants: `.slide-header-left`, `.slide-header-divider`

Optional eyebrow: `<span class="eyebrow">Module 1</span>` above the title.

### CSS Quick Reference

> **MCP users:** Use `coursecode_css_catalog` for the complete class reference extracted from CSS source files. The patterns and rules below supplement the catalog.

#### Golden Rules

1. ✅ **Always wrap text content in `.content-*` class** (narrow/medium/wide)
2. ✅ **Use `.stack-*` containers for vertical spacing** (not margins on elements)
3. ✅ **Use UI components for common layouts** (intro-cards, steps, features)
4. ✅ **Never nest `.card` inside `.card`** (flatten structure)
5. ✅ **Always add `.btn` base class to buttons** (before variant)
6. ✅ **Use utility classes instead of inline styles** (`.m-4` not `style="margin: 1rem"`)
7. ✅ **Add alt text to all images** (accessibility requirement)
8. ✅ **Use semantic HTML** (h1 → h2 → h3, not skipping levels)
9. ✅ **One h1 per slide** (multiple h1 tags = error)
10. ✅ **Slide ID must match filename** (`id: 'intro'` → `@slides/intro.js`)

> **Container-First Spacing:** Elements like headings, paragraphs, lists, dividers, and tables have **no default margins**. Use `.stack-sm`, `.stack-md`, `.stack-lg`, or `.gap-*` on containers to control spacing.

#### Layout Classes

| Class | Effect |
|-------|--------|
| `.content-narrow` | 700px max-width |
| `.content-medium` | 900px max-width (default) |
| `.content-wide` | 1200px max-width |
| `.content-full` | No max-width |
| `.stack-sm/md/lg` | Vertical flex with gap |
| `.cols-2`, `.cols-3` | Grid columns |
| `.cols-auto-fit` | Auto-fit grid (min 280px) |
| `.split-50-50`, `.split-60-40`, `.split-40-60` | Grid splits |

#### UI Component Patterns

**Intro Cards:**
```html
<div class="content-wide">
  <h1>Title</h1>
  <p class="lead">Subtitle</p>
  <div data-component="intro-cards">
    <div class="intro"><h2>Section</h2><p>Text</p></div>
    <div class="card-grid">
      <div class="card">Card 1</div>
      <div class="card">Card 2</div>
    </div>
  </div>
</div>
```

**Numbered Steps:**
```html
<div data-component="steps">
  <div class="step">
    <div class="step-number">1</div>
    <div class="step-content"><h3>Title</h3><p>Description</p></div>
  </div>
</div>
```
Variants: `data-style="connected"`, `data-style="connected-minimal"`, `data-style="compact"`

**Timeline:**
```html
<div data-component="timeline">
  <div class="timeline-item">
    <span class="timeline-date">2020</span>
    <div class="timeline-marker"></div>
    <div class="timeline-content"><h3>Event</h3><p>Details</p></div>
  </div>
</div>
```

**Hero:**
```html
<div data-component="hero" class="hero-gradient">
  <div class="hero-content">
    <span class="hero-badge">New</span>
    <!-- Optional: no border on hero badge -->
    <span class="hero-badge hero-badge-borderless">AI-Powered</span>
    <h1 class="hero-title">Welcome</h1>
    <p class="hero-subtitle">Subtitle</p>
    <div class="hero-cta"><button class="btn btn-primary">Get Started</button></div>
  </div>
</div>
```

**Badges:**
```html
<span class="badge badge-primary">Primary</span>
<span class="badge badge-success">Success</span>
<span class="badge badge-warning">Warning</span>
<span class="badge badge-danger">Danger</span>
<span class="badge badge-info">Info</span>
<span class="badge badge-outline">Outline</span>
<span class="badge badge-primary badge-borderless">Borderless</span>
```
Variants: `badge-primary`, `badge-secondary`, `badge-accent`, `badge-success`, `badge-warning`, `badge-danger`, `badge-info`, `badge-outline`, `badge-borderless`

**Stats, Quote, Checklist, Features, Comparison** — use `data-component="stats|quote|checklist|features|comparison"` with their respective child classes.

**Flip Card:**
```html
<div class="flip-card" data-component="flip-card">
  <div class="flip-card-inner">
    <div class="flip-card-front">Front</div>
    <div class="flip-card-back">Back</div>
  </div>
</div>
```
Back variants: `.bg-light`, `.bg-primary-subtle`, `.bg-success-subtle`, `.bg-warning-subtle`, `.bg-danger-subtle`, `.bg-info-subtle`, `.bg-secondary`, `.bg-dark`

**Callouts (recommended):**
```html
<!-- Modern default -->
<aside class="callout callout--info" data-component="callout" data-icon="auto">
  <h4 class="callout__title">Helpful context</h4>
  <div class="callout__body">
    <p>Use this for most informational guidance.</p>
  </div>
</aside>

<!-- Dismissible warning with actions -->
<aside class="callout callout--warning callout--dismissible" data-component="callout" data-icon="auto">
  <button class="callout__dismiss" aria-label="Dismiss">×</button>
  <h4 class="callout__title">Heads up</h4>
  <div class="callout__body"><p>Double-check before continuing.</p></div>
  <div class="callout__actions">
    <button class="btn btn-sm btn-outline-secondary">Review</button>
  </div>
</aside>
```
Severity: `callout--neutral`, `callout--info`, `callout--success`, `callout--warning`, `callout--danger`
Density: `callout--compact`, `callout--spacious`
Styles and behavior: `callout--filled`, `callout--actionable`, `callout--dismissible`
Icon syntax: set `data-component="callout"` and `data-icon="auto"` for automatic semantic icons, or set a specific icon name (example: `data-icon="book-open"`).

#### Quick Combos

```html
<!-- Two columns -->
<div class="content-wide cols-2"><div>Col 1</div><div>Col 2</div></div>

<!-- Stacked cards -->
<div class="content-medium stack-md">
  <div class="card">Card 1</div>
  <div class="card">Card 2</div>
</div>

<!-- Card with header/body/footer (background + bold are automatic) -->
<div class="card">
  <div class="card-header">
    <h4>Header</h4>
  </div>
  <div class="card-body stack-sm">
    <p>Body content</p>
  </div>
  <div class="card-footer">
    <button class="btn btn-sm btn-primary">Action</button>
  </div>
</div>

<!-- Centered button -->
<div class="flex justify-center mt-6"><button class="btn btn-primary">Action</button></div>

<!-- Styled lists -->
<ul class="list-styled"><li>Bulleted</li></ul>
<ol class="list-numbered"><li>Numbered</li></ol>
```

#### Design Tokens (CSS Variables)

Override in `course/theme.css` to rebrand:

| Variable | Purpose |
|----------|--------|
| `--color-primary` | Main brand color |
| `--color-secondary` | Secondary brand color |
| `--color-accent` | Accent/success color |
| `--color-success/warning/danger/info` | Semantic colors |
| `--bg-page/surface/subtle/muted/inset` | Semantic backgrounds (dark-mode aware) |
| `--shadow-sm/md/lg/xl` | Box shadows |
| `--gradient-header/success/progress/subtle` | Gradient tokens |

#### Typography Scale

| Element/Class | Size | Use For |
|--------------|------|---------|
| `h1` | 2.5rem | Page/slide title |
| `h2` | 2rem | Section heading |
| `h3` | 1.75rem | Subsection heading |
| `h4` | 1.5rem | Minor heading |
| `.font-size-lg` | 1.125rem | Lead text, emphasis |
| Default | 1rem | Body text |
| `.font-size-sm` | 0.875rem | Small text, captions |

#### Debugging

| Issue | Check | Fix |
|-------|-------|-----|
| Button not clickable | Is `:disabled` set? | Remove disabled attribute |
| Content too wide | Is `.content-*` wrapper missing? | Add `.content-medium` wrapper |
| Items not aligned | Is `.flex` on parent? | Add `.flex .align-items-center` |
| Wrong spacing | Multiple spacing classes? | Use only one (`.m-4` not `.m-4 .m-2`) |

#### CSS File Locations

| Need | File |
|------|------|
| Design tokens | `design-tokens.css` |
| Layout (content width, stacks, columns) | `02-layout.css` |
| UI components (hero, steps, timeline, etc.) | `components/*.css` |
| Component styles | `components/*.css` |
| Interaction styles | `interactions/*.css` |
| Utilities (spacing, display, flex, animations) | `utilities/*.css` |

### Icons

Use the `iconManager` utility to render icons. Never use inline SVGs.

```javascript
const { iconManager } = CourseCode;

// Basic usage - returns SVG string
const icon = iconManager.getIcon('info');

// With size option
const largeIcon = iconManager.getIcon('check-circle', { size: 'lg' });

// With custom class
const styledIcon = iconManager.getIcon('alert-triangle', { class: 'icon-warning' });

// In HTML template
container.innerHTML = `
  <span class="icon-text">
    ${iconManager.getIcon('info', { size: 'md', class: 'icon-primary' })}
    <span>Information</span>
  </span>
`;
```

**Size options:** `xs` (12px), `sm` (16px), `md` (20px), `lg` (24px), `xl` (32px), `2xl` (48px), `3xl` (64px) — or pass numeric px value

**Color classes:** `.icon-primary`, `.icon-secondary`, `.icon-success`, `.icon-warning`, `.icon-danger`, `.icon-muted`

**Layout wrappers:** `.icon-text` (icon + label), `.icon-after` (icon after text), `.icon-above` (stacked)

**Animation classes:** `.icon-spin` (loading), `.icon-pulse`, `.icon-bounce`

### Auto-Wrapping

Slides are **automatically wrapped** with `.content-medium`. Override per-slide:
```html
<div data-content-width="narrow|medium|wide|full">...</div>
```

Or change global default in `course-config.js`:
```javascript
slideDefaults: { contentWidth: 'wide' }
```

### Course Layout

Set `layout` in `course-config.js` to change the overall page structure:

| Layout | Header | Sidebar | Navigation | Best For |
|--------|--------|---------|------------|----------|
| `article` (default) | Minimal | Hidden | Floating pill | Documentation-style |
| `traditional` | Full | Toggle | Standard footer | Traditional courses |
| `focused` | Hidden | Hidden | Floating pill | Single-screen immersive content (no scrolling) |
| `presentation` | Hidden | Hidden | Edge arrows | Slideshows |
| `canvas` | Hidden | Hidden | None (opt-in) | Custom HTML/CSS/JS with full LMS infrastructure |

> **Note:** The `focused` and `presentation` layouts are designed for viewport-fit content that doesn't scroll. Content is vertically centered within the viewport. Use `article` if your slides need scrolling.

> **Note:** The `canvas` layout provides zero framework CSS opinions. Authors bring their own HTML/CSS/JS and get full access to LMS drivers, tracking, engagement, and navigation via `window.CourseCode` and `course-config.js`. Opt back in to nav UI via `navigation.sidebar.enabled` or `navigation.footer.enabled`.

```javascript
layout: 'article',  // Modern web-page feel
```

#### Canvas Layout — `canvasSlide()` Helper

For canvas mode, use the `canvasSlide()` helper to minimize boilerplate:

```javascript
// course/slides/my-page.js
const { canvasSlide } = CourseCode;

export const slide = canvasSlide(`
    <style>
        .my-app { background: #0a0a0a; color: white; height: 100vh; }
        .my-app button { background: #6366f1; border: none; padding: 12px 24px; color: white; border-radius: 8px; }
    </style>
    <div class="my-app">
        <h1>My Custom Page</h1>
        <button id="next">Continue</button>
    </div>
`, (el, api) => {
    el.querySelector('#next').onclick = () => api.NavigationActions.goToNextAvailableSlide();
});
```

The first argument is your HTML (including `<style>` tags). The optional second argument is an init callback receiving the DOM element and the `CourseCode` API.

### Theme Customization

Use `course/theme.css` only for: brand colors, custom fonts, organization-specific overrides.

**The Palette System:** All colors derive from 9 palette values via `color-mix()`. Override these in `theme.css` to rebrand — all semantic colors, light/dark variants, alpha values, and dark mode automatically cascade.

```css
:root {
  /* Core palette - change these to rebrand */
  --palette-blue: #0057b7;        /* → Primary */
  --palette-blue-light: #1e40af;  /* → Info */
  --palette-green: #059669;       /* → Success */
  --palette-yellow: #f7b801;      /* → Accent */
  --palette-amber: #f18701;       /* → Secondary / Warning */
  --palette-orange: #f35b04;      /* → Brand vibrant */
  --palette-red: #c7322b;         /* → Danger / Error */
  
  /* Optional: override derived values if needed */
  --color-primary: var(--palette-blue);
  --gradient-header: linear-gradient(135deg, var(--color-primary), var(--color-gray-700));
  
  /* Component style variants */
  --tab-style: pills;        /* default | pills | buttons | minimal | boxed */
  --accordion-style: flush;  /* default | flush | separated | minimal | boxed */
  --card-style: elevated;    /* default | outlined | elevated | flat | accent-top */
}
```

**Typography:** Override font families and sizes for your brand. Load custom web fonts with `@import` at the top of `theme.css`, then set the tokens:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
:root {
  --font-family-sans: 'Inter', sans-serif;
  --font-family-display: 'Inter', sans-serif;
  --font-family-mono: ui-monospace, monospace;
  --font-size-base: 1rem;        /* Body text (16px default) */
  --font-size-4xl: 2.25rem;      /* Main headings (36px default) */
}
```

**Layout sizing:** Control header, sidebar, and footer dimensions:

```css
:root {
  --header-height: 72px;
  --header-title-size: 1.125rem;      /* Course title in header */
  --header-title-weight: 700;
  --header-padding-x: 1.5rem;
  --sidebar-width: 280px;
  --footer-padding-y: 0.75rem;
}
```

**Use data attributes** on `<html>` or individual components for variants:
   - `data-header-style="gradient|solid|minimal|dark|transparent"`
   - `data-header-border="accent|thin|none|gradient"`
   - `data-sidebar-style="default|dark|primary|minimal"`
   - `data-footer-layout="default|centered|minimal|floating"`
   - `data-tab-style="pills"` (on specific component to override theme default)

---

## Slide Navigation

### Automatic Behavior

- **First slide**: Previous button auto-disabled
- **Last slide**: Next button auto-disabled
- **Gating**: Next button disabled until requirements met

No configuration needed for standard sequential navigation.

### Navigation Controls (Optional)

Override default Next/Previous behavior for special flows:

```javascript
navigation: {
  sequential: true,
  controls: {
    exitTarget: 'assessment',    // Next button → specific slide (for remediation loops)
    nextTarget: 'custom-slide',  // Alternative to exitTarget
    previousTarget: 'intro'      // Override Previous button target
  }
}
```

**Use case: Remedial slide that loops back to assessment:**

```javascript
{
  id: 'remedial',
  component: '@slides/remedial.js',
  menu: { hidden: true },
  navigation: {
    controls: { exitTarget: 'assessment' },  // Next → back to assessment
    gating: {
      conditions: [{ type: 'assessmentStatus', assessmentId: 'final-exam', requires: 'failed' }]
    },
    sequence: {
      includeByDefault: false,
      includeWhen: { type: 'assessmentStatus', assessmentId: 'final-exam', requires: 'failed' },
      insert: { position: 'after', slideId: 'assessment' }
    }
  }
}
```

### Gating (Lock Slides)

```javascript
navigation: {
  gating: {
    mode: 'all',  // 'all' or 'any'
    message: 'Complete previous content first.',
    conditions: [
      { type: 'objectiveStatus', objectiveId: 'core-content', completion_status: 'completed' },
      { type: 'assessmentStatus', assessmentId: 'final-exam', requires: 'passed' },
      { type: 'flag', key: 'intro-done', equals: true }
    ]
  }
}
```

### Dynamic Sequence (Conditional Slides)

Include slides only when conditions are met:

```javascript
navigation: {
  sequence: {
    includeByDefault: false,  // Hidden until condition met
    includeWhen: { type: 'assessmentStatus', assessmentId: 'exam', requires: 'failed' },
    insert: { position: 'after', slideId: 'assessment' }  // Where to insert
  }
}
```

### Document Gallery

Collapsible sidebar gallery that auto-discovers files from a configured directory at build time. Opens documents in the lightbox.

```javascript
// In course-config.js → navigation
documentGallery: {
    enabled: true,
    directory: 'assets/docs',       // Relative to course/
    label: 'Resources',             // Toggle button label
    icon: 'file-text',              // Icon key
    allowDownloads: false,          // Show download button in lightbox
    fileTypes: ['pdf', 'md', 'jpg', 'png']  // File types to include
}
```

**File placement:** Put documents in `course/assets/docs/`. For PDF thumbnails, place `<filename>_thumbnail.png` alongside the PDF.

**Behavior:** Gallery collapses the nav menu when expanded. Resets to collapsed when sidebar closes.

---

## Engagement Tracking

All slides MUST have `engagement` config. Set `required: false` for no tracking:

```javascript
engagement: {
  required: true,
  mode: 'all',  // 'all' or 'any'
  message: 'Custom requirement text',  // Optional: overrides entire tooltip
  requirements: [
    { type: 'viewAllTabs' },
    { type: 'viewAllPanels' },  // accordions
    { type: 'viewAllFlipCards' },
    { type: 'viewAllHotspots' },
    { type: 'interactionComplete', interactionId: 'q1', label: 'Quiz 1' },
    { type: 'allInteractionsComplete' },
    { type: 'scrollDepth', percentage: 80 },
    { type: 'timeOnSlide', minSeconds: 120 },
    { type: 'slideAudioComplete' },
    { type: 'audioComplete', audioId: 'my-audio' },
    { type: 'modalAudioComplete', modalId: 'my-modal' },
    { type: 'flag', key: 'custom-step-complete', equals: true },
    { type: 'allFlags', flags: ['step1', 'step2', 'step3'] }
  ]
  // showIndicator defaults to true when required is true; set false to hide
}
```

### Tooltip Customization

- **`message`** (engagement-level): Overrides entire tooltip text for the slide
- **`label`** (requirement-level): Customizes the interaction name in dynamic tooltips

Without customization, tooltips auto-generate from IDs (e.g., `my-quiz` → "Complete: My Quiz").

### Custom Flag-Based Tracking

For custom interactions not covered by built-in components:

```javascript
const { flagManager } = CourseCode;

root.addEventListener('click', (e) => {
  if (e.target.dataset.hotspot) {
    flagManager.setFlag(`hotspot-${e.target.dataset.hotspot}-clicked`, true);
  }
});
```

---

## Declarative UI Components

Components auto-initialize via `data-component` attributes. No imports needed—just use the HTML patterns. CSS classes, icons, and interaction factories are also globally available; never add `import` statements for them.

> **MCP users:** Use `coursecode_component_catalog` for full schemas and HTML templates. Below covers usage patterns and notes the catalog doesn't provide.

### Quick Reference

| Component | Attribute | Engagement Tracking |
|-----------|-----------|---------------------|
| Tabs | `data-component="tabs"` | `viewAllTabs` |
| Accordion | `data-component="accordion"` | `viewAllPanels` |
| Flip Card | `data-component="flip-card"` | `viewAllFlipCards` |
| Interactive Timeline | `data-component="interactive-timeline"` | `viewAllTimelineEvents` |
| Interactive Image | `data-component="interactive-image"` | `viewAllHotspots` |
| Modal Trigger | `data-component="modal-trigger"` | `viewAllModals` |
| Carousel | `data-component="carousel"` | - |
| Collapse | `data-component="collapse"` | - |
| Dropdown | `data-component="dropdown"` | - |
| Alert | `data-component="alert"` | - |
| Progress | `data-component="progress"` | - |
| Embed Frame | `data-component="embed-frame"` | Custom (via `flag`) |

### Tabs

```html
<div data-component="tabs">
  <div class="tab-list">
    <button class="tab-button" data-action="select-tab" aria-controls="panel-1">Tab 1</button>
    <button class="tab-button" data-action="select-tab" aria-controls="panel-2">Tab 2</button>
  </div>
  <div id="panel-1" class="tab-content">Content 1</div>
  <div id="panel-2" class="tab-content">Content 2</div>
</div>
```

### Accordion

```html
<div id="faq-accordion" class="accordion" data-component="accordion" data-mode="single">
  <div data-title="Section 1">Content 1</div>
  <div data-title="Section 2">Content 2</div>
</div>
```

**Required:** `id` must be set for engagement tracking persistence.

`data-mode`: `single` (one panel open) | `multi` (multiple panels open)

### Flip Card

```html
<div class="flip-card" data-component="flip-card" data-flip-card-id="card-1">
  <div class="flip-card-inner">
    <div class="flip-card-front">
      <h3>Front Side</h3>
      <p>Click to flip</p>
    </div>
    <div class="flip-card-back">
      <h3>Back Side</h3>
      <p>Hidden content revealed</p>
    </div>
  </div>
</div>
```

**Required:** `data-flip-card-id` must be unique for engagement tracking.

**Back Side Variants:** Add to `.flip-card-back`: `.bg-light`, `.bg-primary-subtle`, `.bg-success-subtle`, `.bg-warning-subtle`, `.bg-danger-subtle`, `.bg-info-subtle`, `.bg-secondary`, `.bg-dark`

### Interactive Timeline

```html
<div class="interactive-timeline" data-component="interactive-timeline">
  <div class="timeline-event" data-event-id="event-1">
    <div class="timeline-marker"></div>
    <div class="timeline-date">2020</div>
    <div class="timeline-summary">
      <h4>Event Title</h4>
      <p>Brief description</p>
    </div>
    <div class="timeline-details">
      <p>Expanded content revealed on click...</p>
    </div>
  </div>
</div>
```

**Required:** `data-event-id` must be unique for engagement tracking.

**Options:** Add `data-timeline-mode="sequential"` to require events be viewed in order.

### Carousel

```html
<div class="carousel" data-component="carousel">
  <div class="carousel-track">
    <div class="carousel-slide">Slide 1</div>
    <div class="carousel-slide">Slide 2</div>
    <div class="carousel-slide">Slide 3</div>
  </div>
  <button class="carousel-button prev" data-action="prev-slide" aria-label="Previous">&#10094;</button>
  <button class="carousel-button next" data-action="next-slide" aria-label="Next">&#10095;</button>
  <div class="carousel-dots"></div>
</div>
```

### Collapse (Show/Hide)

```html
<div data-component="collapse">
  <div class="collapse-panel" id="transcript">
    <p>Expandable content here...</p>
  </div>
  <button class="collapse-trigger" data-action="toggle-collapse" aria-controls="transcript" aria-expanded="false">
    <span class="collapse-text-show">Show Transcript</span>
    <span class="collapse-text-hide">Hide Transcript</span>
  </button>
</div>
```

### Alert (Dismissible)

```html
<div class="alert alert-warning" data-component="alert">
  <p>This is a warning message.</p>
  <button class="alert-close" data-action="dismiss-alert" aria-label="Dismiss">&times;</button>
</div>
```

Variants: `.alert-info`, `.alert-success`, `.alert-warning`, `.alert-danger`

### Progress Bar

```html
<div class="progress-bar" data-component="progress" id="my-progress" data-initial-value="25">
  <div class="progress-bar-fill"></div>
  <span class="progress-bar-text">25%</span>
</div>
```

Update programmatically:
```javascript
const { updateProgress } = CourseCode;
updateProgress('my-progress', 75);
```

### Embed Frame (Sandboxed Custom Apps)

Embed custom HTML/JS applications with complete CSS isolation and JavaScript sandboxing:

```html
<div data-component="embed-frame"
     data-src="assets/widgets/my-app.html"
     data-embed-id="custom-widget"
     data-aspect-ratio="16/9">
</div>
```

**Attributes:**
- `data-src` - Path to HTML file (relative to `course/`)
- `data-embed-id` - Unique ID for tracking
- `data-aspect-ratio` - Optional (e.g., `"16/9"`, `"4/3"`). Omit for auto-height mode.

**Communication API (from embedded content):**
```javascript
// Set a flag (triggers engagement re-evaluation)
parent.postMessage({ type: 'coursecode:flag', key: 'widget-complete', value: true }, '*');

// Log to framework console
parent.postMessage({ type: 'coursecode:log', level: 'info', message: 'Widget ready' }, '*');

// Request resize (auto-height mode only)
parent.postMessage({ type: 'coursecode:resize', height: 400 }, '*');
```

**Engagement tracking:** Use `flag` requirement with the key set by the embedded widget.
### Dropdown

```html
<div id="role-dropdown" data-component="dropdown">
  <button class="dropdown-trigger" data-action="toggle-dropdown">Select Role</button>
  <div class="dropdown-menu">
    <button class="dropdown-item" data-action="select-item" data-value="engineer">Engineer</button>
    <button class="dropdown-item" data-action="select-item" data-value="manager">Manager</button>
  </div>
</div>
```

### Interactive Image (Hotspots)

```html
<div data-component="interactive-image" id="diagram">
  <img src="assets/images/diagram.png" alt="Diagram" />
  <button data-hotspot-id="zone1" data-title="Component A" data-body="Description here..." 
          class="interactive-image-hotspot" style="top: 20%; left: 30%;">A</button>
  <button data-hotspot-id="zone2" data-title="Component B" data-body="More details..."
          class="interactive-image-hotspot" style="top: 50%; left: 60%;">B</button>
</div>
```

Hotspots open modals by default. Link to accordion with `data-accordion-id="accordion-id"`.

**Hotspot data attributes:**

| Attribute | Values | Description |
|-----------|--------|-------------|
| `data-layout` | `inline` | Use for flexbox/grid layouts (removes absolute positioning) |
| `data-shape` | `circle`, `rect`, `rounded` | Hotspot shape |
| `data-color` | `primary`, `success`, `info`, `warning`, `danger`, etc. | Hotspot color |
| `data-fill` | `solid`, `transparent`, `semi` | Fill style |
| `data-variant` | `area` | Transparent overlay style for regions |
| `data-pulse` | `false` | Disable pulse animation (per-hotspot or on container) |
| `data-scale` | `false` | Disable scale transform on hover/active states |

**Inline layout variant:** For hotspots in flexbox/grid layouts (not positioned over an image):

```html
<div data-component="interactive-image" data-accordion-id="my-accordion" id="my-diagram">
  <div class="flex flex-col gap-2">
    <button class="interactive-image-hotspot" data-hotspot-id="item1" 
            data-layout="inline" data-shape="rect" data-fill="solid" data-color="success">
      Item 1
    </button>
    <button class="interactive-image-hotspot" data-hotspot-id="item2"
            data-layout="inline" data-shape="rect" data-fill="solid" data-color="info">
      Item 2
    </button>
  </div>
</div>
```
### Value Display (Reactive Text)

```html
<input type="range" id="slider" min="0" max="100" value="50" />
<div data-component="value-display" 
     data-source="#slider" 
     data-event="input" 
     data-format="Current value: {value}%">
</div>
```

### Tooltip

```html
<!-- Basic -->
<span data-tooltip="Helpful hint">Hover me</span>

<!-- With options -->
<span data-tooltip="Details here" 
      data-tooltip-position="bottom" 
      data-tooltip-delay="300"
      data-tooltip-theme="light">Info</span>
```

| Attribute | Values | Default |
|-----------|--------|---------|
| `data-tooltip-position` | `top`, `bottom`, `left`, `right` | `top` |
| `data-tooltip-delay` | ms | `0` |
| `data-tooltip-theme` | `dark`, `light` | `dark` |
| `data-tooltip-width` | px | `280` |

---

## Global UI Actions

These are **global singletons** managed by the framework—use them anywhere without initialization.

### Notifications

```javascript
const { showNotification } = CourseCode;

showNotification('Saved successfully', 'success');           // Auto-dismiss after 5s
showNotification('Check your input', 'warning', 8000);       // Custom duration (ms)
showNotification('Connection lost', 'error');                // Stays until dismissed
showNotification('FYI: New feature', 'info', 3000);
```

**Types:** `success`, `error`, `warning`, `info`

**Declarative:**
```html
<button data-action="show-notification" data-type="success" data-message="Done!">Show</button>
```

### Modals (Programmatic)

```javascript
const { Modal } = CourseCode;

Modal.show({
  title: 'Confirm Action',
  body: '<p>Are you sure?</p>',
  footer: `
    <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
    <button class="btn btn-primary" data-action="confirm">Confirm</button>
  `,
  config: { 
    closeOnBackdrop: true,   // Click outside to close
    closeOnEscape: true      // ESC key to close
  },
  audio: {                   // Optional narration
    src: 'assets/audio/modal.mp3',
    autoplay: true,
    required: true,          // Must complete for engagement
    completionThreshold: 0.9
  },
  onOpen: () => { /* callback */ },
  onClose: () => { /* callback */ }
});

Modal.hide();  // Close programmatically
```

### Modals (Declarative Triggers)

```html
<!-- Basic trigger (body from element) -->
<button data-component="modal-trigger" 
        data-title="Learn More" 
        data-body="#my-modal-content">
  Open Modal
</button>
<template id="my-modal-content">
  <p>Modal content here. Use &lt;template&gt; to hide from page.</p>
</template>

<!-- With audio narration -->
<button data-component="modal-trigger"
        data-modal-id="info-modal"
        data-title="Important Info"
        data-body="#info-content"
        data-audio-src="assets/audio/info.mp3"
        data-audio-required="true">
  Info
</button>
```

**Engagement tracking:** Use `viewAllModals` requirement to ensure learners open all modals. Use `modalAudioComplete` if audio must be heard.

### Navigation

```javascript
const { NavigationActions } = CourseCode;
NavigationActions.goToSlide('slide-id', context);
```

---

## Course Completion & Feedback

When users complete the course and click Exit on the final slide, a **built-in completion modal** appears automatically.

### Configuration

```javascript
// In course-config.js
completion: {
  promptForRating: true,    // Show 5-star rating (Likert)
  promptForComments: true   // Show comment textarea
}
```

### What Gets Stored

| Input | SCORM Storage | Details |
|-------|---------------|---------|
| Star rating | `cmi.interactions.n.*` | Likert interaction with id `'course-rating'` |
| Comment | `cmi.comments_from_learner.n.*` | With location `'course-completion'` |

Set both to `false` for a simple "Congratulations" message without feedback collection.

---

## Environment Config

In `course/course-config.js`:

```javascript
environment: {
  disableBeforeUnloadGuard: false,  // false (prod) = warning on F5/close, true (dev) = no warning

  // --- External Communications (all optional, config-driven) ---

  // Error alerts → webhook (e.g., Cloudflare Worker → email via Resend)
  errorReporting: {
    endpoint: 'https://your-worker.workers.dev/errors',
    includeContext: true,      // Include course/slide info (default: true)
    enableUserReports: true    // Add "Report Issue" to settings menu
  },

  // Learning records → external analytics system
  dataReporting: {
    endpoint: 'https://your-endpoint.workers.dev/data',
    batchSize: 10,           // Flush after N records (default: 10)
    flushInterval: 30000,    // Or flush every 30s (default)
    includeContext: true     // Include course metadata (default: true)
  },

  // Pub/sub channel → course-to-course communication via relay
  channel: {
    endpoint: 'https://your-relay.workers.dev',
    channelId: 'session-abc-123'  // Shared across all connected instances
  }
}
```

### External Communications

Three optional, config-driven tools for outbound communication. Each activates when its `endpoint` is set — no code changes needed.

> **CourseCode Cloud (AI note):** These `environment.*` endpoint settings are the **manual/self-hosted fallback**. On cloud-served launches, CourseCode Cloud injects `cc-*` meta tags into `index.html`, and the framework uses those values instead (override). This is intentional zero-config behavior for cloud error/data/channel wiring.

| Tool | What it sends | Transport | Example backend |
|------|--------------|-----------|-----------------|
| **Error Reporter** | Framework errors (`*:error` events) | POST per error (60s dedup) | `cloudflare-error-worker.js` |
| **Data Reporter** | Assessment results, objectives, interactions | Batched POST + `sendBeacon` on unload | `cloudflare-data-worker.js` |
| **Course Channel** | Any JSON (content-agnostic) | POST to send, SSE to receive | `cloudflare-channel-relay.js` |

**Error Reporting** subscribes to all `*:error` EventBus events and sends to your endpoint. Test with `coursecode test-errors`.

**Data Reporting** batches learning records (assessments, objectives, interactions) and flushes on batch size or timer. Uses `sendBeacon` on page close.

**Course Channel** is a generic pub/sub pipe. Send any JSON; receive via EventBus. The relay endpoint is a dumb fan-out router — it doesn't interpret messages. Use for live sync, polling, instructor commands, or anything else.

```javascript
// Send (from slide code)
window.CourseCode.sendChannelMessage({ type: 'navigate', slideId: 'slide-03' });

// Receive
eventBus.on('channel:message', (data) => { /* any JSON */ });
```

All example backends are in `framework/docs/examples/`.

> **Local dev:** Error and data reporters are automatically disabled during watch builds (`coursecode preview`, `coursecode dev`). Production builds (`coursecode build`) send reports normally.
>
> **Cloud precedence:** Cloud-injected meta tags override `course-config.js` endpoint settings for these tools. If you need custom routing/fanout, prefer doing it server-side from your cloud ingestion endpoint.

---

## Icon System

The framework provides a comprehensive, standardized SVG icon system (Lucide). 163+ icons available.

> **MCP users:** Use `coursecode_icon_catalog` to browse all available icons by category and get SVG content.

### Usage in Course Content

**Standard Usage (Components)**
Most components handle icons automatically based on your `course-config.js` settings.

**Manual Usage (Slide JavaScript)**
```javascript
const { iconManager } = CourseCode;

container.innerHTML = `
  <span class="icon-text">
    ${iconManager.getIcon('info-circle', { size: 'md', class: 'icon-primary' })}
    <span>Information</span>
  </span>
`;
```

**Size options:** `xs` (12px), `sm` (16px), `md` (20px), `lg` (24px), `xl` (32px), `2xl` (48px), `3xl` (64px)

**Color classes:** `.icon-primary`, `.icon-secondary`, `.icon-success`, `.icon-warning`, `.icon-danger`, `.icon-muted`

**Layout wrappers:** `.icon-text` (icon + label), `.icon-after` (icon after text), `.icon-above` (stacked)

### Adding Custom Icons

Add custom icons to `course/icons.js` (never modify the framework):

```javascript
// course/icons.js
export const customIcons = {
    'rocket': '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84 1.25-1.82 1.64-2.86z"/>'
};
```

Then use anywhere:

```javascript
// In course-config.js
menu: { label: 'Launch', icon: 'rocket' }

// In slide code
const { iconManager } = CourseCode;
const rocketIcon = iconManager.getIcon('rocket', { size: 'lg' });
```
