# CourseCode

**Open-source, local-first course authoring built for AI tools like Claude Code, Codex, Cursor, and [CourseCode Desktop](https://coursecodedesktop.com) — no coding required to start, full code control when you need it.**

CourseCode creates real project files you can inspect, version, and edit directly — with a predictable, file-based workflow instead of a black-box GUI. Built-in MCP integration means your AI assistant connects directly to your course project.

Bring your own PDFs, Word docs, or PowerPoints, use AI to accelerate authoring, and deploy to any LMS format without vendor lock-in or subscriptions.

## Features

- **MCP integration**: Works with Claude Code, Codex, Cursor, CourseCode Desktop, and any MCP-capable AI tool — previews, screenshots, linting, and testing without manual file sharing
- **No coding required to start**: Describe what you want and let AI help build slides, interactions, and structure
- **Full LMS integration**: SCORM 1.2, SCORM 2004, cmi5, and LTI with complete tracking records
- **AI-assisted authoring workflow**: Structured guides and MCP tools for faster course development
- **Rich UI components**: Images, video, accordions, tabs, and custom sandboxed HTML/JS embeds
- **Rich interactions**: Multiple choice, drag-drop, fill-in-the-blank, matching, sequencing, and more
- **Fully accessible**: WCAG 2.1 AA compliant with dark mode, high contrast, and reduced motion
- **TTS audio narration**: Built-in player with AI text-to-speech generation (ElevenLabs, Deepgram, Google, BYO API Key)
- **Smart tracking**: Engagement requirements, learning objectives, and progress persistence
- **Themeable design**: CSS custom properties for easy brand customization
- **Custom endpoints**: Optional webhooks for error reporting and learning record storage
- **Live preview**: Visual editing, status dashboard, config panels, catalog browser, and full LMS simulation with debug tools
- **[CourseCode Cloud](https://coursecodecloud.com)**: Deploy from CLI, share preview links, download any LMS format on demand — no rebuilds
- **[CourseCode Desktop](https://coursecodedesktop.com)**: Native app for Mac and Windows with AI-assisted editing and built-in preview

---

## Installation

> **Prefer a GUI?** Use [CourseCode Desktop](https://coursecodedesktop.com) instead.

### Required

Install [Node.js](https://nodejs.org/) (v18 or later), then run:

```bash
npm install -g coursecode
```

### Recommended

- A code or text editor — [VS Code](https://code.visualstudio.com/), [Cursor](https://cursor.com/), or similar
- An AI coding assistant with MCP support — [Claude Code](https://claude.ai/code), [Cursor](https://cursor.com/), [Windsurf](https://codeium.com/windsurf), etc.
- [GitHub Desktop](https://desktop.github.com/) for version control

---

## Quick Start

```bash

# Create a new course project
coursecode create my-course
cd my-course

# Start the preview server
coursecode preview
```

Open `http://localhost:4173` to view and edit your course.

The example course included with every new project is a complete guide to using CourseCode.

Start with the [User Guide](framework/docs/USER_GUIDE.md) for a complete walkthrough.

---

## MCP Integration

CourseCode includes a built-in [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server. When your AI tool supports MCP, it connects directly to your course project — no manual file sharing needed.

```bash
coursecode mcp
```

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
| `course/course-config.js` | Course settings — structure, objectives, navigation rules |
| `course/slides/` | Your slide content (one file per slide) |
| `course/theme.css` | Brand colors and typography |
| `course/assets/` | Images, audio, and video files |

### Key Documentation

All guides are in `framework/docs/`:

| Document | Audience | Purpose |
|----------|----------|---------|
| `USER_GUIDE.md` | Humans | Complete guide — workflows, features, deployment |
| `COURSE_AUTHORING_GUIDE.md` | AI Agents | Slide authoring, interactions, CSS styling |
| `COURSE_OUTLINE_GUIDE.md` | AI Agents | How to write effective course outlines |
| `COURSE_OUTLINE_TEMPLATE.md` | AI Agents | Blank template to start an outline |
| `DATA_MODEL.md` | AI Agents | LMS data model and tracking fields |
| `FRAMEWORK_GUIDE.md` | AI Agents | Framework internals (advanced) |

---

## AI-Driven Authoring Workflow

Four steps to go from source materials to a deployed course.

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

### Step 4: Preview, Iterate, and Deploy

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

When ready, deploy:

**With [CourseCode Cloud](https://coursecodecloud.com)**: Push your course and get a live link. Cloud handles hosting, generates any LMS format on demand, and gives you a shareable preview link with optional password protection. No ZIP files, no manual uploads.

```bash
coursecode deploy
```

For stakeholder review, deploy a preview-only version and password-protect the preview link:

```bash
coursecode deploy --preview --password
```

You can inspect recent deployments and move pointers without rebuilding:

```bash
coursecode deployments
coursecode promote --preview
coursecode promote --production
coursecode preview-link --password
```

If the cloud course was deleted but the project still has the old local binding, redeploy with:

```bash
coursecode deploy --repair-binding
```

**Without Cloud**: Build a ZIP package and upload it to your LMS manually:

```bash
coursecode build
```

**Share for review**: Export a standalone preview for stakeholders. Deploy to GitHub Pages, Netlify, or any static host:

```bash
coursecode preview --export
```

---

## Core Commands

| Command | Description |
|---------|-------------|
| `coursecode create <name>` | Create a new course project |
| `coursecode preview` | Preview your course locally |
| `coursecode convert` | Convert PDFs, Word, PowerPoint to markdown |
| `coursecode mcp` | Start the MCP server for AI integration |
| `coursecode lint` | Validate course structure and content |
| `coursecode build` | Build a package for LMS upload |
| `coursecode deploy` | Build and deploy to CourseCode Cloud |
| `coursecode deployments` | List recent Cloud deployments |
| `coursecode promote` | Move the Production or Preview pointer |
| `coursecode preview-link` | Manage the Cloud preview link |
| `coursecode narration` | Generate audio narration from text |

For the full command list and deployment options, see the [User Guide](framework/docs/USER_GUIDE.md#sharing-and-deploying) or run `coursecode --help`.

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
- Complete previous slides
- Pass an assessment
- Achieve a learning objective

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
- Deployment options
- Troubleshooting

---

## License

MIT © Seth Vincent
