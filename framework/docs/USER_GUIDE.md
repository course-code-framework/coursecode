# CourseCode User Guide

A complete guide to creating interactive e-learning courses with AI assistance. No coding experience required.

---

## Table of Contents

1. [Getting Started](#getting-started)
   - [What You'll Need](#what-youll-need)
   - [Installation](#installation)
   - [Creating Your First Project](#creating-your-first-project)
   - [Importing a PowerPoint (Optional)](#importing-a-powerpoint-optional)
2. [Your Course Folder](#your-course-folder)
   - [Where Everything Lives](#where-everything-lives)
   - [The Documentation Files](#the-documentation-files)
3. [The AI Workflow](#the-ai-workflow)
   - [Step 1: Convert Your Source Materials](#step-1-convert-your-source-materials)
   - [Step 2: Create Your Course Outline](#step-2-create-your-course-outline)
   - [Step 3: Build the Course](#step-3-build-the-course)
   - [Step 4: Preview and Refine](#step-4-preview-and-refine)
4. [Connecting AI with MCP](#connecting-ai-with-mcp)
   - [What Is MCP?](#what-is-mcp)
   - [Setup](#setup)
   - [Available Tools](#available-tools)
   - [How the Workflow Changes](#how-the-workflow-changes)
5. [Using the Preview](#using-the-preview)
   - [Starting the Preview](#starting-the-preview)
   - [Visual Editing](#visual-editing)
   - [Configuration Panels](#configuration-panels)
   - [Testing Your Course](#testing-your-course)
6. [Course Building Blocks](#course-building-blocks)
   - [Slides](#slides)
   - [Interactions](#interactions)
   - [Assessments](#assessments)
   - [Audio and Video](#audio-and-video)
   - [UI Components](#ui-components)
7. [Customizing Your Course](#customizing-your-course)
   - [Layouts](#layouts)
   - [Theming and Branding](#theming-and-branding)
   - [Navigation and Flow](#navigation-and-flow)
   - [Engagement Requirements](#engagement-requirements)
   - [Learning Objectives](#learning-objectives)
   - [Course Completion Feedback](#course-completion-feedback)
   - [Updating Live Courses Safely](#updating-live-courses-safely)
8. [Extending with Plugins](#extending-with-plugins)
   - [Custom Interactions](#custom-interactions)
   - [Custom UI Components](#custom-ui-components)
   - [Custom Icons](#custom-icons)
   - [Custom Styles](#custom-styles)
9. [Sharing and Deploying](#sharing-and-deploying)
   - [Sharing Previews](#sharing-previews)
   - [Preview Export Options](#preview-export-options)
   - [Understanding LMS Formats](#understanding-lms-formats)
   - [Standard Deployment](#standard-deployment)
   - [CDN Deployment (Advanced)](#cdn-deployment-advanced)
   - [Cloud Deployment](#cloud-deployment)
   - [Exporting Content for Review](#exporting-content-for-review)
10. [Generating Audio Narration](#generating-audio-narration)
11. [Troubleshooting](#troubleshooting)

---

## Getting Started

### What You'll Need

**Required:**
- [Node.js](https://nodejs.org/) (version 18 or later)

**Recommended:**
- A text editor like [VS Code](https://code.visualstudio.com/) or [Notepad++](https://notepad-plus-plus.org/)
- An AI assistant like [Claude](https://claude.ai/), [ChatGPT](https://chat.openai.com/), or [GitHub Copilot](https://github.com/features/copilot)
- [GitHub Desktop](https://desktop.github.com/) for version control (optional)

### Installation

After installing Node.js, open your terminal (Terminal on Mac, Command Prompt or PowerShell on Windows) and run:

```bash
npm install -g coursecode
```

This installs CourseCode globally so you can use it from any folder.

### Creating Your First Project

```bash
coursecode create my-course
cd my-course
coursecode preview
```

Open `http://localhost:4173` in your browser. You'll see an example course that teaches you how to use CourseCode — explore it to see what's possible!

#### Starting Fresh

The example project includes demo slides (prefixed with `example-`) that show off features. When you're ready to build your own course, you have two options:

**Option 1: Start blank** — no example content at all:
```bash
coursecode create my-course --blank
```

**Option 2: Clean up later** — explore the examples first, then strip them:
```bash
coursecode clean
```

#### Creating New Files

Use these commands to scaffold new files quickly:

```bash
coursecode new slide my-topic         # Create a new slide
coursecode new assessment final-quiz  # Create a graded quiz
coursecode new config                 # Create a fresh course-config.js
```

### Importing a PowerPoint (Optional)

If you already have a PowerPoint deck, you can import it directly as a presentation-style course:

```bash
coursecode import my-deck.pptx
```

On macOS, CourseCode can drive Microsoft PowerPoint to export slides automatically. On any platform, you can use pre-exported slide images:

```bash
coursecode import my-deck.pptx --slides-dir ./exported-slides
```

This creates a project with slide image files, generated slide pages, and extracted text in `course/references/converted/` for AI-assisted enhancement.

---

## Your Course Folder

### Where Everything Lives

When you create a project, you get this structure:

```
my-course/
├── course/                  ← Your content goes here
│   ├── course-config.js     # Course settings
│   ├── slides/              # One file per slide
│   ├── assets/              # Images, audio, video
│   ├── theme.css            # Brand colors and fonts

└── framework/               ← Don't edit this
    └── docs/                # Guides for AI
```

**You only work in the `course/` folder.** The `framework/` folder contains the system files — your AI assistant uses the docs there, but you don't need to touch them.

### The Documentation Files

These files in `framework/docs/` are designed to give your AI assistant context:

| Document | When to Use |
|----------|-------------|
| `COURSE_OUTLINE_TEMPLATE.md` | Starting a new outline |
| `COURSE_OUTLINE_GUIDE.md` | Writing effective outlines |
| `COURSE_AUTHORING_GUIDE.md` | Slide authoring, interactions, and CSS styling |
| `FRAMEWORK_GUIDE.md` | Advanced customization |

You don't need to read these yourself — just give them to your AI assistant when prompting.

---

## The AI Workflow

CourseCode is designed to work with AI assistants. Here's the recommended process:

### Step 1: Convert Your Source Materials

If you have existing content (PDFs, Word documents, PowerPoints), place them in `course/references/` and run:

```bash
coursecode convert
```

This creates markdown files in `course/references/converted/` that AI can reference when building your course.

### Step 2: Create Your Course Outline

Give your AI assistant:
1. Your converted reference documents (from Step 1)
2. The file `framework/docs/COURSE_OUTLINE_TEMPLATE.md`
3. The file `framework/docs/COURSE_OUTLINE_GUIDE.md`

Ask it to create a course outline. Review the outline and make edits until you're happy with the structure — this is your blueprint.

### Step 3: Build the Course

When your outline is ready, give your AI assistant:
1. Your completed course outline
2. The file `framework/docs/COURSE_AUTHORING_GUIDE.md`

Ask it to build the course based on your outline. The AI will create slide files and configure your course.

### Step 4: Preview and Refine

```bash
coursecode preview
```

Open `http://localhost:4173` to see your course. Found issues? Tell your AI assistant what's wrong and share the relevant guide files for context.

---

## Connecting AI with MCP

The steps above work with any AI assistant — you copy files into a chat and get results back. But CourseCode also includes an **MCP server** that gives your AI direct access to your course, making the workflow dramatically faster.

### What Is MCP?

**Model Context Protocol (MCP)** is a standard that lets AI tools connect to external systems. With CourseCode's MCP server, your AI assistant can:

- **See your course** — take screenshots of any slide
- **Navigate and interact** — move between slides, answer questions, test interactions
- **Check for errors** — run the linter and get structured results
- **Discover components** — browse available UI components, interactions, and CSS classes
- **Build and export** — produce LMS-ready packages

Without MCP, you describe problems to your AI and paste code back and forth. With MCP, the AI can look at your course directly and fix issues in real time.

### Setup

MCP setup depends on which AI tool you use. In each case, you add a small configuration that tells the tool how to launch CourseCode's MCP server.

#### Claude Desktop

Open **Settings → Developer → Edit Config** and add:

```json
{
  "mcpServers": {
    "coursecode": {
      "command": "coursecode",
      "args": ["mcp"]
    }
  }
}
```

Restart Claude Desktop. You should see a hammer (🔨) icon indicating the MCP tools are connected.

#### VS Code (GitHub Copilot)

Add to your workspace `.vscode/mcp.json`:

```json
{
  "servers": {
    "coursecode": {
      "command": "coursecode",
      "args": ["mcp"]
    }
  }
}
```

#### Cursor

Open **Settings → MCP** and add a new server:

- **Name**: `coursecode`
- **Command**: `coursecode mcp`

Or add to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "coursecode": {
      "command": "coursecode",
      "args": ["mcp"]
    }
  }
}
```

> **Note:** The MCP server runs from your course project directory. Make sure you have your project open in the editor when using MCP tools.

### Available Tools

Once connected, your AI assistant gains these capabilities:

| Tool | What It Does |
|------|--------------|
| `coursecode_state` | Get the full course state — current slide, TOC, interactions, engagement, LMS state, logs, and errors |
| `coursecode_navigate` | Jump to any slide by ID |
| `coursecode_viewport` | Set the preview viewport (named breakpoint or explicit width/height) for responsive testing |
| `coursecode_screenshot` | Take a screenshot of any slide |
| `coursecode_interact` | Answer an interaction and check if it's correct |
| `coursecode_reset` | Clear progress and restart the course |
| `coursecode_lint` | Check for errors (bad CSS classes, missing components, config issues) |
| `coursecode_component_catalog` | Browse available UI components (tabs, accordion, cards, etc.) |
| `coursecode_interaction_catalog` | Browse available interaction types (multiple choice, drag-drop, etc.) |
| `coursecode_css_catalog` | Browse available CSS classes by category |
| `coursecode_icon_catalog` | Browse available icons by name/category |

| `coursecode_workflow_status` | Get guidance on what to do next based on your project's current state |
| `coursecode_build` | Build the course for LMS deployment |

> **Note:** The preview server must be running before using runtime tools like `coursecode_state`, `coursecode_screenshot`, or `coursecode_navigate`. Start it with `coursecode preview` in a terminal.

### How the Workflow Changes

**Without MCP** (chat-based):
1. Copy documentation files into chat
2. Describe what you want
3. Copy generated code into your project
4. Preview in browser, describe issues back to AI
5. Repeat

**With MCP** (integrated):
1. Ask your AI assistant to build the course — it reads the guides automatically
2. The AI writes slides, runs the linter, takes screenshots, and iterates
3. You review the results and give feedback
4. The AI makes changes and verifies them visually

The AI handles the build-test-fix cycle on its own, and you focus on reviewing content and giving creative direction.

---

## Using the Preview

### Starting the Preview

```bash
coursecode preview
```

This opens your course in a simulated LMS environment. The preview automatically refreshes when you make changes.

### Visual Editing

Click the **Edit Mode** button in the toolbar to enable visual editing. Then:

- Click any text to edit it directly
- Changes are saved back to your source files
- Toggle edit mode off to test the course normally

### Configuration Panels

The preview toolbar gives you access to:

- **Config Panel** — View and edit course settings, slide properties, and interaction configurations
- **Content Panel** — See all your course content in one scrollable view
- **Debug Panel** — Watch what's happening behind the scenes (useful for troubleshooting)

### Testing Your Course

The preview simulates a real LMS:

- Progress is saved (refresh the page and you'll be where you left off)
- Use **Reset Course** to start fresh
- Toggle **Skip Gating** to bypass navigation locks during testing

---

## Course Building Blocks

### Slides

Each slide is a separate file in `course/slides/`. Your AI assistant creates these for you based on your outline.

Slides can contain:
- Text and headings
- Images and videos
- Interactive elements
- Audio narration

### Interactions

These are practice activities that engage learners:

| Type | Description |
|------|-------------|
| Multiple Choice | Select one or more correct answers |
| True/False | Simple yes/no questions |
| Fill-in-the-Blank | Enter missing text |
| Matching | Connect related items |
| Drag-and-Drop | Sort items into categories |
| Sequencing | Arrange items in order |
| Hotspot | Click correct areas on an image |

Interactions give immediate feedback and don't affect the learner's score unless they're part of an assessment.

### Assessments

Assessments are graded quizzes that determine whether learners pass:

- Questions can be randomized
- Learners can retry (if you allow it)
- Scores are reported to your LMS
- Can be linked to learning objectives

### Audio and Video

Add media to your slides:

- **Slide narration** — Professional voiceover for the entire slide
- **Embedded audio players** — Let learners control playback
- **Video** — Native video files, YouTube, or Vimeo

You can require learners to complete media before advancing.

### UI Components

Build engaging layouts with:

- **Accordions** — Collapsible sections
- **Tabs** — Organize content into switchable panels
- **Cards** — Visual containers for grouped content
- **Flip cards** — Reveal information on click
- **Modals** — Pop-up detail views
- **Callouts** — Highlighted tips, warnings, or notes

---

## Customizing Your Course

### Layouts

Layouts control the overall look and feel of your course. Choose one in your `course-config.js`:

| Layout | Best For | What It Looks Like |
|--------|----------|--------------------|
| **Article** (default) | Text-heavy content, self-paced reading | Minimal header, centered content, floating pill navigation at the bottom |
| **Traditional** | Structured courses with menus | Full header with course title, collapsible sidebar menu |
| **Focused** | Distraction-free learning, assessments | No visible header, centered content, floating pill navigation |
| **Presentation** | Imported PowerPoints, image-based slides | Full viewport, edge-to-edge content, arrow navigation on sides |
| **Canvas** | Fully custom experiences | Zero framework CSS — you bring your own HTML, CSS, and JS |

Tell your AI assistant which layout you want, or just describe the experience ("I want a clean reading experience" → article, "I need a sidebar menu" → traditional).

#### Canvas Layout

The **canvas** layout is for when you want complete creative control. It strips all framework CSS — every style is reverted to browser defaults so you start from scratch. Framework UI (header, footer, sidebar, navigation) is hidden, and you bring your own HTML and CSS via `theme.css` or `<style>` tags in your slides. Only CSS is affected — all JavaScript infrastructure remains fully available: `window.CourseCode` APIs, navigation, gating, interactions, engagement tracking, and LMS drivers all work exactly as they do in other layouts.

This is ideal for:
- **Custom interactive experiences** — simulations, games, branded microsites
- **AI-generated HTML pages** — have an AI tool create an HTML page, then wrap it to get full LMS support
- **Existing web content** — drop in HTML you already have

Your AI assistant can use the `canvasSlide()` helper to wrap any HTML into a working course slide with just a few lines of code. You still configure engagement, navigation, and tracking in `course-config.js` like any other layout.

Want navigation back? You can selectively opt in to sidebar or footer navigation through config — canvas just starts with everything hidden.

### Theming and Branding

Edit `course/theme.css` to match your organization's brand:

- Change primary and accent colors
- Set custom fonts
- Adjust spacing and sizing
- Add your logo

Your AI assistant can help — just describe the look you want and share `theme.css`.

### Navigation and Flow

Control how learners move through your course:

- **Linear** — Must complete slides in order
- **Free navigation** — Jump to any slide
- **Conditional** — Lock slides until requirements are met

### Engagement Requirements

Require learners to engage with content before advancing:

- View all tabs in a tabbed section
- Complete an interaction
- Watch a video or listen to audio
- Spend a minimum time on the slide

### Learning Objectives

Track what learners have accomplished:

- Automatically track when slides are visited
- Link objectives to assessment scores
- Report completion status to your LMS

### Course Completion Feedback

CourseCode can show an end-of-course feedback section in the completion modal. You can enable:

- A 5-star rating
- A free-text comments field

Configure this in `course/course-config.js`:

```javascript
completion: {
  promptForRating: true,
  promptForComments: true
}
```

Set either option to `false` if you do not want to collect that input.

### Updating Live Courses Safely

When you update a course structure after learners have already started (for example, add/remove slides or change assessments), stored LMS state may no longer match the new structure.

CourseCode includes validation and recovery behavior:

- In development, mismatches are surfaced as errors so you can fix issues early
- In production, CourseCode attempts graceful recovery to keep learners moving

Best practice: set and increment `metadata.version` in `course/course-config.js` whenever you make meaningful structural changes.

---

## Extending with Plugins

CourseCode has a built-in plugin system. You can extend it with your own interaction types, UI components, icons, and styles — all auto-discovered from your `course/` folder without any framework changes.

| Extension Point | Where to Put It | What It Adds |
|-----------------|-----------------|-------------|
| Custom interactions | `course/interactions/*.js` | New question/activity types |
| Custom UI components | `course/components/*.js` | New reusable HTML components |
| Custom icons | `course/icons.js` | New icons available everywhere |
| Custom styles | `course/theme.css` | Global CSS for your plugins and brand |

Plugins are just JavaScript files that follow a simple contract. Your AI assistant can write them — describe what you want and share `framework/docs/USER_GUIDE.md` (see "Extending with Plugins") as context.

### Custom Interactions

Create a new question or activity type by dropping a `.js` file in `course/interactions/`. It registers automatically.

A minimal plugin exports one function:

```javascript
// course/interactions/rating-scale.js
export function create(container, config) {
  let response = null;
  container.innerHTML = `<div data-interaction-id="${config.id}">...</div>`;
  return {
    getResponse: () => response,
    setResponse: (val) => { response = val; },
    checkAnswer: () => ({ correct: response === config.correctAnswer, score: 1 }),
    reset: () => { response = null; }
  };
}
```

Then use it in a slide:

```javascript
const rating = CourseCode.createRatingScaleQuestion(container, {
  id: 'my-rating',
  prompt: 'How would you rate this?',
  options: ['Poor', 'Fair', 'Good', 'Excellent']
});
```

The factory name is derived from the filename: `rating-scale.js` → `createRatingScaleQuestion`.

For a complete example with schema and metadata (which enable linting and AI tooling), see the "Extending with Plugins" section in `framework/docs/USER_GUIDE.md`.

### Custom UI Components

Add reusable HTML components (info boxes, custom cards, branded banners) by dropping a `.js` file in `course/components/`. Use them in slides via `data-component`:

```html
<div data-component="info-box" data-icon="warning">
  Important note here
</div>
```

See the "Extending with Plugins" section in `framework/docs/USER_GUIDE.md` for the component contract.

### Custom Icons

Add icons to `course/icons.js` and they're available throughout the course:

```javascript
// course/icons.js
export const customIcons = {
  'rocket': '<path d="M12 2L8 8H4l8 14 8-14h-4L12 2z" />'
};
```

### Custom Styles

`course/theme.css` is always loaded. It's the right place for plugin-specific CSS as well as brand colors and fonts:

```css
/* course/theme.css */
:root {
  --primary: #0066cc;
}

.info-box { border-left: 4px solid var(--primary); padding: 1rem; }
```

Use CSS variables from the design system (`--primary`, `--border`, `--radius`, etc.) so your plugins automatically respect the course theme.

---

## Sharing and Deploying

### Sharing Previews

Before deploying to an LMS, share your course with stakeholders for review:

```bash
coursecode preview --export
```

This creates a self-contained folder you can upload to any web host (Netlify, GitHub Pages, etc.). You can add password protection and other options — ask your AI assistant for help.

### Preview Export Options

Useful `coursecode preview --export` options:

```bash
coursecode preview --export -o ./course-preview
coursecode preview --export --password "secret"
coursecode preview --export --skip-build
coursecode preview --export --nojekyll
coursecode preview --export --no-content
```

- `-o, --output`: choose output folder
- `-p, --password`: add password protection to shared preview
- `--skip-build`: export from existing `dist/` without rebuilding
- `--nojekyll`: add `.nojekyll` (important for GitHub Pages)
- `--no-content`: hide the content viewer panel in exported preview

### Understanding LMS Formats

An LMS (Learning Management System) is the platform your organization uses to deliver training — think Cornerstone, Moodle, Canvas, Docebo, etc. CourseCode packages your course in a format your LMS understands.

| Format | What It Is | When to Use |
|--------|-----------|-------------|
| **cmi5** | The modern standard. Rich data, flexible. | Your LMS supports cmi5 (check with your LMS admin) |
| **SCORM 2004** | Widely supported enterprise standard. | Most corporate LMS platforms |
| **SCORM 1.2** | Oldest standard, most compatible. | Older systems, or when you're unsure |
| **LTI** | Integration standard, not a package format. | LMS platforms that use LTI (Canvas, Blackboard) |

**Not sure which to pick?** Ask your LMS administrator. If they don't know, try **SCORM 1.2** — it works with almost everything.

> **SCORM 1.2 caveat:** SCORM 1.2 has a strict ~4KB suspend data limit. CourseCode uses a strict storage mode to fit within that limit, which can reduce how much interaction UI state is restored across slides on resume.

> **Using CourseCode Cloud?** You don't need to choose a format. Cloud-deployed courses use a universal build — the cloud generates the correct format automatically when you download a ZIP for your LMS. The format setting in `course-config.js` only applies to local `coursecode build` commands.

### Standard Deployment

The simplest approach — upload a ZIP file to your LMS:

```bash
coursecode build                    # Builds as cmi5 (default)
coursecode build --format scorm1.2  # Builds as SCORM 1.2
```

This creates a ZIP file in `dist/` that you upload directly to your LMS. Every time you update the course, you rebuild and re-upload.

### CDN Deployment (Advanced)

For teams that update courses frequently or serve multiple LMS clients, CourseCode supports **CDN deployment**. Instead of uploading the full course to each LMS, you:

1. Host the course on a CDN (like Netlify, Vercel, or GitHub Pages)
2. Upload a tiny proxy package (~15KB) to each LMS
3. The proxy loads the course from the CDN at runtime

**Why this matters:**
- **Instant updates** — fix a typo on the CDN and every learner sees it immediately, no LMS re-upload
- **Multi-tenant** — one CDN deployment serves multiple LMS clients, each with their own access token
- **Smaller LMS packages** — faster upload and launch times

CDN deployment uses special format variants (`scorm1.2-proxy`, `scorm2004-proxy`, `cmi5-remote`). Ask your AI assistant to set this up — it involves configuring an external URL and access tokens in `course-config.js`.

Generate and add client tokens with:

```bash
coursecode token --add client-a
coursecode token --add client-b
```

Then build your proxy/remote package and deploy:

```bash
coursecode build --format scorm1.2-proxy
```

### Cloud Deployment

CourseCode Cloud is the simplest deployment option. Upload your course once and the cloud handles everything:

```bash
coursecode login     # First time only: sign in to CourseCode Cloud
coursecode deploy    # Build + upload to cloud
```

**How it works:** Your course is built once as a universal package. The cloud can generate a format-specific ZIP (SCORM 1.2, SCORM 2004, cmi5, etc.) on demand — no rebuilding required. You never need to set a format in `course-config.js` for cloud-deployed courses.

Cloud-served launches also auto-configure runtime error reporting, data reporting, and channel relay endpoints (zero-config cloud wiring).
If you configured manual endpoints in `course-config.js` for self-hosted workflows, Cloud launches override them with cloud-injected runtime config.

**Signing in (`coursecode login`):**

Running `coursecode login` displays a URL and a short code in your terminal:

```
  ┌─────────────────────────────────────────────────────┐
  │  Open this URL in your browser:                     │
  │  https://coursecodecloud.com/activate               │
  │                                                     │
  │  Enter your code:  ABCD-1234                        │
  │                                                     │
  │  Expires in 15 minutes                              │
  └─────────────────────────────────────────────────────┘
```

Open the URL in any browser, log in with your CourseCode account, and enter the code. The terminal confirms login automatically — no redirect back required. The code is valid for 15 minutes and works from any device or browser.

**Deploy flags:**

`coursecode deploy` accepts flags that control how the production and preview pointers are updated after upload:

| Command | Production pointer | Preview pointer |
|---|---|---|
| `cc deploy` | Follows your deploy_mode setting | Follows your preview_deploy_mode setting |
| `cc deploy --promote` | Always moved to new version | Follows your preview_deploy_mode setting |
| `cc deploy --stage` | Never moved (stays on old version) | Follows your preview_deploy_mode setting |
| `cc deploy --preview` | **Untouched** (preview-only upload) | Always moved to new version |
| `cc deploy --promote --preview` | Always moved to new version | Always moved to new version |
| `cc deploy --stage --preview` | Never moved | Always moved to new version |

- **Production pointer** — the version learners see when they launch your course.
- **Preview pointer** — the version served on the cloud preview link (for stakeholder review).
- **deploy_mode** — a per-course or org setting in the Cloud dashboard. Default is auto-promote (new uploads immediately go live). Can be set to staged (new uploads require a manual promote step).
- `--promote` and `--stage` are mutually exclusive.
- **GitHub-linked courses:** If your course is connected to a GitHub repo in the Cloud dashboard, production deploys happen via `git push` — the CLI blocks direct production uploads. Use `coursecode deploy --preview` to push a preview build for stakeholder review.
- If a cloud deployment was deleted outside the CLI and this project still has the old local binding, rerun with `coursecode deploy --repair-binding`. To clear the stale binding without deploying yet, run `coursecode status --repair-binding`.

**Typical Cloud workflow:**
1. Run `coursecode login` once, open the URL shown, and enter the code.
2. Run `coursecode deploy` from your project folder.
3. Open the CourseCode Cloud dashboard link shown after deploy.
4. Use Cloud preview links for review.
5. Download the LMS format you need from Cloud when you're ready to deliver.

**Prefer a GUI instead of the terminal?**
- Use **CourseCode Desktop** for the same project workflow with buttons for Preview / Export / Deploy.
- Desktop docs: `coursecode-desktop/USER_GUIDE.md`

**When to use Cloud vs local export:**
- Use **local export** if you just need a ZIP to upload manually and don't need hosted previews or cloud services.
- Use **Cloud** if you want easier sharing, hosted delivery workflows, or format downloads later without rebuilding.

**Benefits:**
- **No format decisions** — download the right ZIP for any LMS directly from the cloud
- **Instant updates** — redeploy and all future launches get the new version
- **Preview sharing** — cloud provides a shareable preview link automatically

### Exporting Content for Review

Extract your course content into a readable document for subject matter expert (SME) review:

```bash
coursecode export-content -o review.md
```

This pulls all slide text, interactions, and assessment questions into a single Markdown file. Useful for getting sign-off on content accuracy before deploying.

---

## Generating Audio Narration

Create professional voiceover from text:

1. Add narration scripts to your slides (your AI assistant can help)
2. Get an API key from [Deepgram](https://deepgram.com/) (default), [ElevenLabs](https://elevenlabs.io/), [OpenAI](https://platform.openai.com/), [Google Cloud](https://cloud.google.com/text-to-speech), or [Azure](https://azure.microsoft.com/en-us/products/ai-services/text-to-speech)
3. Add the key to a `.env` file in your project
4. Run:

```bash
coursecode narration
```

Audio files are generated to `course/assets/audio/` and automatically linked to your slides.

---

## Troubleshooting

**The preview won't start**
- Make sure you're in your project folder (where `course/` exists)
- Try `npm install` if you haven't already

**Changes aren't appearing**
- The preview auto-refreshes, but try a manual browser refresh
- Check for error messages in your terminal

**The course looks wrong in my LMS**
- Try a different format (`--format scorm1.2` for older systems)
- Check that your LMS supports the format you chose

**AI is generating incorrect code**
- Make sure you're giving it the right documentation files
- Share error messages so it can fix issues

**MCP tools are connected but runtime actions fail**
- Make sure `coursecode preview` is running in the same project
- Runtime MCP tools (state, navigate, screenshot, interact, reset) require a live preview connection

**Cloud/local format behavior is confusing**
- Local builds use your selected `--format` (or config default)
- Cloud deploy uses a universal build and lets you choose format at download time

**Returning learners see unexpected progress after major course updates**
- If you changed slide structure or assessments, old stored LMS state may not fully match new content
- Increment `metadata.version` and re-test resume behavior in preview and LMS

**Need more help?**
- Check the [GitHub issues](https://github.com/course-code-framework/coursecode/issues)
- The example course includes troubleshooting tips

---
