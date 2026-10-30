# CourseCode Framework

Build LMS courses with Claude Code, Codex, or any AI tool that supports MCP.

CourseCode Framework is open source and runs on your computer. Your AI tool writes the course as regular project files you can inspect, version, and edit. CourseCode's MCP server lets it preview, screenshot, lint, and test what it built. Export SCORM 1.2, SCORM 2004, cmi5, or LTI 1.3.

Start from a topic or from your own PDFs, Word documents, and PowerPoint decks. No coding is required to start, and you have full control of the code when you want it.

## View the demo

- [View the live CourseCode demo course](https://preview.coursecodecloud.com/preview/coursecode-demo/nTfJU2qvp23P0mguxrrGFZr4FlXfM03N)

## CourseCode ecosystem

CourseCode Framework (this repository) is open source and works on its own. [CourseCode Cloud](https://coursecodecloud.com) is an optional paid hosting service for deploying and delivering courses.

Framework documentation lives at [coursecodeframework.com/docs](https://coursecodeframework.com/docs/) and in [`framework/docs/`](framework/docs/).

## Features

- **Works with your AI tool**: A plugin for Claude Code and Codex, and MCP settings for Claude Code, Codex, Cursor, and VS Code in every new project. Any other MCP client can run `coursecode mcp`
- **No coding required to start**: Describe what you want and let AI help build slides, interactions, and structure
- **Course modernization**: Use existing SCORM courses, PowerPoints, PDFs, Word docs, scripts, and SME notes as source material for upgraded courses
- **LMS integration**: SCORM 1.2, SCORM 2004, and cmi5 packaging, plus an LTI 1.3 browser contract for trusted server-backed launches
- **Rich UI components**: Images, video, accordions, tabs, and custom sandboxed HTML/JS embeds
- **Rich interactions**: Multiple choice, drag-drop, fill-in-the-blank, matching, sequencing, and more
- **Accessibility**: Designed to meet WCAG 2.1 AA, with dark mode, high contrast, and reduced motion
- **TTS audio narration**: Built-in player with AI text-to-speech generation (Deepgram, ElevenLabs, OpenAI, Google Cloud, or Azure, using your own API key)
- **Smart tracking**: Engagement requirements, learning objectives, and progress persistence
- **Themeable design**: CSS custom properties for easy brand customization
- **Custom endpoints**: Optional webhooks for error reporting and learning record storage
- **Live preview**: Visual editing, status dashboard, config panels, catalog browser, and full LMS simulation with debug tools

---

## Quick Start

### With the plugin (recommended)

The Claude Code and Codex plugin guides your AI tool from a new project to an LMS package, and it works before a project exists. It is not yet in the Claude Code or Codex plugin directories, so install it from this repository:

```bash
# Claude Code
claude plugin marketplace add course-code-framework/coursecode
claude plugin install coursecode@coursecode

# Codex
codex plugin marketplace add course-code-framework/coursecode
codex plugin add coursecode@coursecode
```

Then start your AI tool in an empty folder and describe the course you want.

The plugin needs [Node.js](https://nodejs.org/) 22.15 or later but no global `coursecode` install. If Node.js is missing, its `setup` skill offers to install it. The plugin bundles the MCP server below and six skills: setup, new-course, outline, build-slides, review, and publish. See [plugin/README.md](plugin/README.md).

### With npx

With [Node.js](https://nodejs.org/) 22.15 or later installed, create a project:

```bash
npx coursecode create my-course
```

Open the `my-course` folder in Claude Code, Codex, Cursor, or VS Code and describe the course you want. The project includes MCP settings for each of those tools and an `AGENTS.md` with the authoring workflow, so the AI tool connects on its own. Claude Code asks once to approve the project's MCP server; Codex reads project settings after you trust the folder.

To preview without an AI tool:

```bash
cd my-course
npx coursecode preview
```

Open `http://localhost:4173` to view and edit your course.

The example course included with every new project is a complete guide to using CourseCode.

Start with the [User Guide](framework/docs/USER_GUIDE.md) for a complete walkthrough.

---

## Requirements

[Node.js](https://nodejs.org/) 22.15 or later. You can run every command through `npx coursecode`, or install the CLI globally for the shorter `coursecode` command used in the rest of this guide:

```bash
npm install -g coursecode
```

Learner courses support Chrome 111+, Edge 111+, Firefox 114+, and Safari 16.4+. SCORM compatibility describes LMS communication and packaging; it does not imply Internet Explorer support.

Also recommended:

- A code or text editor, such as [VS Code](https://code.visualstudio.com/), [Cursor](https://cursor.com/), or similar
- An AI coding tool with MCP support, such as [Claude Code](https://claude.com/claude-code), [Codex](https://developers.openai.com/codex), [Cursor](https://cursor.com/), or VS Code with GitHub Copilot
- [GitHub Desktop](https://desktop.github.com/) for version control

---

## MCP Integration

CourseCode includes a built-in [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server. When your AI tool supports MCP, it connects directly to your course project, so you don't have to paste files into a chat.

New projects already include MCP settings for Claude Code (`.mcp.json`), Codex (`.codex/config.toml`), Cursor (`.cursor/mcp.json`), and VS Code (`.vscode/mcp.json`). To add them to an existing project, run `coursecode agent-setup`. Any other MCP client can start the server with:

```bash
coursecode mcp
```

Run from a global install or `npx`, the server hands off to the project's own CourseCode version.

With MCP, your AI can:
- **Preview and screenshot** slides to verify layout and design
- **Lint its own code** and catch errors automatically
- **Navigate and test** interactions directly
- **Browse the component catalog** to discover available UI elements
- **Read course state** including engagement, scoring, and LMS data

See the [User Guide](framework/docs/USER_GUIDE.md#connecting-ai-with-mcp) for setup instructions.

---

## The Course Directory

All your course content lives in the `course/` folder:

```
my-course/
├── course/                     # ← Your content goes here
│   ├── course-config.js        # Course structure, format, objectives, settings
│   ├── slides/                 # Slide content files
│   │   ├── intro.js
│   │   ├── content-01.js
│   │   └── assessment.js
│   ├── assets/                 # Images, audio, video
│   │   ├── images/
│   │   └── audio/
│   └── theme.css               # Brand customization
│
├── framework/                  # Framework code (don't edit)
│   └── docs/                   # Guides and templates
```

### Your Course

| Location | What's There |
|----------|--------------|
| `course/course-config.js` | Course settings: structure, objectives, navigation rules |
| `course/slides/` | Your slide content (one file per slide) |
| `course/theme.css` | Brand colors and typography |
| `course/assets/` | Images, audio, and video files |

### Key Documentation

All guides are in `framework/docs/`:

| Document | Audience | Purpose |
|----------|----------|---------|
| `USER_GUIDE.md` | Humans | Complete guide: workflows, features, exporting and sharing |
| `COURSE_AUTHORING_GUIDE.md` | AI Agents | Slide authoring, interactions, CSS styling |
| `COURSE_OUTLINE_GUIDE.md` | AI Agents | How to write effective course outlines |
| `COURSE_OUTLINE_TEMPLATE.md` | AI Agents | Blank template to start an outline |
| `DATA_MODEL.md` | AI Agents | LMS data model and tracking fields |
| `FRAMEWORK_GUIDE.md` | AI Agents | Framework internals (advanced) |

---

## AI-Driven Authoring Workflow

Four steps to go from source materials to a course ready for your LMS.

### Step 1: Convert Your Source Materials

Place existing content (PDFs, Word docs, PowerPoints) in `course/references/`, then run:

```bash
coursecode convert
```

Converts to markdown in `course/references/converted/`. Skip this step if starting from scratch.

### Step 2: Create Your Course Outline

Ask your AI to create a course outline based on your content.

- **With MCP**: The AI reads your references and outline template automatically
- **Without MCP**: Share your converted docs, `COURSE_OUTLINE_TEMPLATE.md`, and `COURSE_OUTLINE_GUIDE.md` with your AI

Review and refine the outline before building.

### Step 3: Build the Course

Ask your AI to build slides from your approved outline.

- **With MCP**: The AI reads all docs, lints its code, and screenshots slides to verify
- **Without MCP**: Share your outline and `COURSE_AUTHORING_GUIDE.md` with your AI

### Step 4: Preview, Iterate, and Export

```bash
coursecode preview
```

The preview server provides:
- **Live reload**: Changes appear instantly
- **Visual editing**: Click elements to edit content directly
- **Status dashboard**: Course health, errors, and build status at a glance
- **Config panels**: Adjust settings, interactions, and assessments
- **Component catalog**: Browse available UI elements with live previews
- **Debug tools**: Inspect LMS state, test interactions, verify tracking

When it's ready, build a package and upload it to your LMS. The ZIP is written to your project folder:

```bash
coursecode build                    # cmi5 (default)
coursecode build --format scorm1.2  # or scorm2004, lti
```

Other ways to share it:

- **One file, no server:** a portable HTML course that recipients open by double-clicking. Progress is saved in that browser only.

  ```bash
  coursecode export html
  ```

- **Review site:** a static copy of the preview for GitHub Pages, Netlify, or any static host.

  ```bash
  coursecode preview --export
  ```

- **Hosted delivery (optional):** [CourseCode Cloud](https://coursecodecloud.com) is a paid hosting service for CourseCode courses. `coursecode deploy` uploads one build; Cloud then serves it, provides a shareable preview link, and generates any LMS format on demand. See [CourseCode Cloud](framework/docs/USER_GUIDE.md#coursecode-cloud-optional) in the user guide.

---

## Core Commands

| Command | Description |
|---------|-------------|
| `coursecode create <name>` | Create a new course project; `create .` derives a title-cased course title and hyphenated npm name from the current folder |
| `coursecode init [name]` | Initialize the current directory, optionally with a course title |
| `coursecode preview` | Preview your course locally |
| `coursecode export html` | Create one shareable course file that opens without an LMS or server |
| `coursecode convert` | Convert PDFs, Word, PowerPoint to markdown |
| `coursecode mcp` | Start the MCP server for AI integration |
| `coursecode agent-setup` | Add MCP settings for Claude Code, Codex, Cursor, and VS Code, plus `AGENTS.md`, to an existing project |
| `coursecode lint` | Validate course structure and content |
| `coursecode build` | Build a package for LMS upload |
| `coursecode narration` | Generate audio narration from text |
| `coursecode deploy` | Upload a build to CourseCode Cloud (optional; `deployments`, `promote`, and `preview-link` manage it) |

For the full command list and sharing options, see the [User Guide](framework/docs/USER_GUIDE.md#exporting-and-sharing) or run `coursecode --help`.

---

## UI Components

Build engaging slides with interactive elements. Start with AI assistance, then edit the generated files directly whenever you want more control.

### Media & Widgets

| Component | Description |
|-----------|-------------|
| Tabs | Switch between content panels |
| Accordion | Expandable/collapsible sections |
| Flip Cards | Reveal content on click |
| Carousel | Swipe through slides |
| Modal | Pop-up detail views |
| Interactive Timeline | Clickable timeline events |
| Interactive Image | Hotspots on images |
| Embed Frame | Sandboxed HTML/JS content |
| Audio Player | Narration with controls |
| Video Player | Native, YouTube, or Vimeo |

### Slide Templates

Pre-designed layouts for common slide types. Just tell your AI assistant what you need.

| Template | Use Case |
|----------|----------|
| Intro Cards | Overview slide with key points below |
| Steps | Sequential instructions (numbered) |
| Features | Highlight 3-4 key capabilities |
| Comparison | Side-by-side options |
| Stats | Metrics and numbers with impact |
| Content + Image | Text alongside diagrams |
| Hero | Full-width intro with call-to-action |
| Timeline | Chronological events |
| Quote | Testimonials and citations |
| Checklist | Task lists and requirements |

---

## Interaction Types

Practice activities that engage learners and check understanding.

| Type | Description |
|------|-------------|
| Multiple Choice | Select one or more correct answers |
| True/False | Simple yes/no questions |
| Fill-in-the-Blank | Enter missing text (supports typo tolerance) |
| Matching | Connect related items |
| Drag-and-Drop | Sort items into categories |
| Sequencing | Arrange items in correct order |
| Numeric | Enter numbers (exact or range) |
| Hotspot | Click correct areas on an image |
| Likert Scale | Rating scales for surveys |

All interactions provide immediate feedback and can be required for slide completion.

---

## Tracking & Scoring

### Engagement

Require learners to complete activities before advancing:
- View all tabs or accordion panels
- Complete interactions
- Watch video or listen to audio
- Spend minimum time on slide

### Gating

Lock slides until conditions are met:
- Pass an assessment
- Achieve a learning objective
- Spend a minimum time on a slide
- Set a custom flag, for example after a branching choice

### Assessments

Graded quizzes that determine course completion:
- Randomized question order
- Question banks for variety
- Configurable passing scores
- Retry attempts with remediation
- Scores reported to your LMS

### Learning Objectives

Track learner progress against defined goals:
- Automatic: track when slides are visited
- Linked: tie objectives to assessment scores
- Reported: completion status sent to LMS

---

## Learn More

The [User Guide](framework/docs/USER_GUIDE.md) covers everything in detail:

- Using the preview and visual editing tools
- All interaction types (multiple choice, drag-drop, matching, and more)
- Assessments and grading
- Audio and video
- Theming and branding
- Navigation and learner flow control
- Exporting and sharing options
- Troubleshooting

---

## License

MIT © Seth Vincent
