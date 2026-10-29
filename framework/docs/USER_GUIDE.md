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
9. [Exporting and Sharing](#exporting-and-sharing)
   - [Building an LMS Package](#building-an-lms-package)
   - [Understanding LMS Formats](#understanding-lms-formats)
   - [Sharing Previews](#sharing-previews)
   - [Preview Export Options](#preview-export-options)
   - [Sharing One File Without a Server](#sharing-one-file-without-a-server)
   - [Exporting Content for Review](#exporting-content-for-review)
   - [Hosting on Your Own CDN (Advanced)](#hosting-on-your-own-cdn-advanced)
   - [CourseCode Cloud (Optional)](#coursecode-cloud-optional)
10. [Generating Audio Narration](#generating-audio-narration)
11. [Troubleshooting](#troubleshooting)

---

## Getting Started

### What You'll Need

**Required:**
- [Node.js](https://nodejs.org/) (version 22.15 or later)

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

Open `http://localhost:4173` in your browser. You'll see an example course that teaches you how to use CourseCode and shows what it can do.

#### Starting Fresh

The example project includes demo slides (prefixed with `example-`) that show off features. When you're ready to build your own course, you have two options:

**Option 1: Start blank**, with no example content:
```bash
coursecode create my-course --blank
```

**Option 2: Clean up later**, after exploring the examples:
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

**You only work in the `course/` folder.** The `framework/` folder contains the system files. Your AI assistant uses the docs there, but you don't need to touch them.

### The Documentation Files

These files in `framework/docs/` are designed to give your AI assistant context:

| Document | When to Use |
|----------|-------------|
| `COURSE_OUTLINE_TEMPLATE.md` | Starting a new outline |
| `COURSE_OUTLINE_GUIDE.md` | Writing effective outlines |
| `COURSE_AUTHORING_GUIDE.md` | Slide authoring, interactions, and CSS styling |
| `FRAMEWORK_GUIDE.md` | Advanced customization |

You don't need to read these yourself; give them to your AI assistant when prompting.

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

Ask it to create a course outline. Review the outline and make edits until you're happy with the structure. It's the blueprint for everything that follows.

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

The steps above work with any AI assistant: you copy files into a chat and get results back. But CourseCode also includes an **MCP server** that gives your AI direct access to your course, making the workflow dramatically faster.

### What Is MCP?

**Model Context Protocol (MCP)** is a standard that lets AI tools connect to external systems. With CourseCode's MCP server, your AI assistant can:

- **See your course**: take screenshots of any slide
- **Navigate and interact**: move between slides, answer questions, test interactions
- **Check for errors**: run the linter and get structured results
- **Discover components**: browse available UI components, interactions, and CSS classes
- **Build and export**: produce LMS-ready packages

Without MCP, you describe problems to your AI and paste code back and forth. With MCP, the AI can look at your course directly and fix issues in real time.

### Setup

**Projects you create are already set up.** `coursecode create` writes MCP settings for Claude Code (`.mcp.json`), Codex (`.codex/config.toml`), Cursor (`.cursor/mcp.json`), and VS Code (`.vscode/mcp.json`), plus an `AGENTS.md` that tells the AI tool how to work on the course. Open the project folder in any of those tools and the CourseCode tools are available. Claude Code asks once to approve the project's MCP server, and Codex reads project settings after you trust the folder. For a project created before this, run `coursecode agent-setup` in the project folder.

Projects the CourseCode plugin creates leave out `.mcp.json`, because the plugin already runs the CourseCode server in Claude Code and a project copy would list every tool twice. To open such a project in Claude Code without the plugin, run `coursecode agent-setup`. Pass `--plugin` to `create`, `init`, `import`, or `agent-setup` to get the same behavior yourself.

To start a new course from inside your AI tool, before a project exists, install the plugin for Claude Code or Codex, or add the server to your tool's settings as shown below.

#### Claude Code

Install the CourseCode plugin. It sets up the MCP server and adds guided skills for each stage of the workflow:

```bash
claude plugin marketplace add course-code-framework/coursecode
claude plugin install coursecode@coursecode
```

Start Claude Code from your course folder (or an empty folder for a new course). Run `/coursecode:new-course` to begin, or just describe what you want to build.

#### Codex

Install the same plugin from this repository:

```bash
codex plugin marketplace add course-code-framework/coursecode
codex plugin add coursecode@coursecode
```

Or add only the MCP server with the Codex CLI:

```bash
codex mcp add coursecode -- npx -y coursecode mcp
```

Start Codex from your course folder (or an empty folder for a new course).

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

#### Other MCP clients

Any AI tool that can launch a local (stdio) MCP server can use CourseCode. Configure it to run `npx -y coursecode mcp` (or `coursecode mcp` with a global install) from the course folder. Inside a project, the server runs the project's own CourseCode version. If the tool starts servers from a different folder, set the environment variable `COURSECODE_PROJECT_DIR` to the course folder.

> **Note:** The MCP server runs from your course project directory. Make sure you have your project open in the editor when using MCP tools.

### Available Tools

Once connected, your AI assistant gains these capabilities:

| Tool | What It Does |
|------|--------------|
| `coursecode_state` | Get the full course state: current slide, TOC, interactions, engagement, LMS state, logs, and errors |
| `coursecode_navigate` | Jump to any slide by ID |
| `coursecode_viewport` | Set the preview viewport (named breakpoint or explicit width/height) for responsive testing |
| `coursecode_screenshot` | Take a screenshot of any slide |
| `coursecode_interact` | Answer an interaction and check if it's correct |
| `coursecode_assessment` | Start, answer, and submit a graded assessment the way a learner would |
| `coursecode_reset` | Clear progress and restart the course |
| `coursecode_errors` | Check live preview diagnostics (build, runtime, framework, and console issues) |
| `coursecode_lint` | Run static preflight checks (bad CSS classes, missing components, config issues) |
| `coursecode_component_catalog` | Browse available UI components (tabs, accordion, cards, etc.) |
| `coursecode_interaction_catalog` | Browse available interaction types (multiple choice, drag-drop, etc.) |
| `coursecode_css_catalog` | Browse available CSS classes by category |
| `coursecode_icon_catalog` | Browse available icons by name/category |
| `coursecode_workflow_status` | Get guidance on what to do next based on your project's current state |
| `coursecode_build` | Build the course for LMS deployment |
| `coursecode_narration` | Generate text-to-speech audio narration for slides |

> **Note:** The preview server must be running before using runtime tools like `coursecode_state`, `coursecode_errors`, `coursecode_screenshot`, or `coursecode_navigate`. If preview is not already running for this project, start it with `coursecode preview` in a terminal. Do not start a second preview server if one is already running. The tools only drive the preview of the project they run in; to preview two projects at once, start the second with `coursecode preview --port 4174` (the tools search ports 4173–4188).

### How the Workflow Changes

**Without MCP** (chat-based):
1. Copy documentation files into chat
2. Describe what you want
3. Copy generated code into your project
4. Preview in browser, describe issues back to AI
5. Repeat

**With MCP** (integrated):
1. Ask your AI assistant to build the course. It reads the guides automatically
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

- **Config Panel**: View and edit course settings, slide properties, and interaction configurations
- **Content Panel**: See all your course content in one scrollable view
- **Debug Panel**: Watch what's happening behind the scenes (useful for troubleshooting)

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

- **Slide narration**: Voiceover for the entire slide
- **Embedded audio players**: Let learners control playback
- **Video**: Native video files, YouTube, or Vimeo

You can require learners to complete media before advancing.

### UI Components

Build engaging layouts with:

- **Accordions**: Collapsible sections
- **Tabs**: Organize content into switchable panels
- **Cards**: Visual containers for grouped content
- **Flip cards**: Reveal information on click
- **Modals**: Pop-up detail views
- **Callouts**: Highlighted tips, warnings, or notes

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
| **Canvas** | Fully custom experiences | No framework CSS; you bring your own HTML, CSS, and JS |

Tell your AI assistant which layout you want, or just describe the experience ("I want a clean reading experience" → article, "I need a sidebar menu" → traditional).

#### Canvas Layout

The **canvas** layout is for when you want complete creative control. It strips all framework CSS: every style is reverted to browser defaults so you start from scratch. Framework UI (header, footer, sidebar, navigation) is hidden, and you bring your own HTML and CSS via `theme.css` or `<style>` tags in your slides. Only CSS is affected. The JavaScript infrastructure works as it does in other layouts: `window.CourseCode` APIs, navigation, gating, interactions, engagement tracking, and LMS drivers.

This is ideal for:
- **Custom interactive experiences**: simulations, games, branded microsites
- **AI-generated HTML pages**: have an AI tool create an HTML page, then wrap it to get full LMS support
- **Existing web content**: drop in HTML you already have

Your AI assistant can use the `canvasSlide()` helper to wrap any HTML into a working course slide with a few lines of code. You still configure engagement, navigation, and tracking in `course-config.js` like any other layout.

Canvas always hides the framework's header, sidebar, and footer navigation. If learners need navigation controls, build them into your slide or use another layout.

### Theming and Branding

Edit `course/theme.css` to match your organization's brand:

- Change primary and accent colors
- Set custom fonts
- Adjust spacing and sizing
- Add your logo

Your AI assistant can help. Describe the look you want and share `theme.css`.

### Navigation and Flow

Control how learners move through your course:

- **Menu and buttons**: by default, learners use the sidebar menu and the Next/Previous buttons
- **Engagement requirements**: hold the Next button until a slide's activities are done (see below)
- **Gating**: lock a slide until conditions are met, such as passing an assessment, completing an objective, or spending a minimum time on a slide

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

CourseCode has a built-in plugin system. You can extend it with your own interaction types, UI components, icons, and styles, all auto-discovered from your `course/` folder without any framework changes.

| Extension Point | Where to Put It | What It Adds |
|-----------------|-----------------|-------------|
| Custom interactions | `course/interactions/*.js` | New question/activity types |
| Custom UI components | `course/components/*.js` | New reusable HTML components |
| Custom icons | `course/icons.js` | New icons available everywhere |
| Custom styles | `course/theme.css` | Global CSS for your plugins and brand |

Plugins are JavaScript modules that follow the contracts below. Your AI assistant can write them; point it at this section.

### Custom Interactions

Create a new question or activity type by adding a `.js` file to `course/interactions/`. A plugin exports:

| Export | Required | Purpose |
|--------|----------|---------|
| `schema` | Yes | Must include `type` (kebab-case). Files without `schema.type` are skipped. `description` and `properties` feed linting and AI tooling. |
| A function whose name starts with `create` | Yes | Takes the interaction's `config` and returns the interaction object. |
| `metadata` | No | Extra information for tooling. |

The interaction object needs `render(container)`, `getResponse()`, `setResponse(value)`, `checkAnswer()`, `reset()`, and an `evaluate(response)` that returns `{ correct, score, response }`.

`CourseCode.interactionHelpers` provides the same helpers the built-in interactions use: the Check Answer and Reset buttons, feedback messages, engagement tracking, LMS reporting, and saving and restoring the learner's answer. Read them inside your `create` function, not at the top of the file, because plugins load before `CourseCode` is available.

```javascript
// course/interactions/select-answer.js
export const schema = {
  type: 'select-answer',
  description: 'Question answered by picking one option from a dropdown',
  properties: {
    options: { type: 'array', required: true, description: 'Answer choices' },
    correctAnswer: { type: 'string', required: true, description: 'The correct option' }
  }
};

export function createSelectAnswerQuestion(config) {
  const {
    registerCoreInteraction,
    createInteractionEventHandler,
    renderInteractionControls,
    renderFeedbackContainer,
    displayFeedback,
    clearFeedback
  } = CourseCode.interactionHelpers;

  const { id, prompt, options, correctAnswer } = config;
  let root = null;
  const select = () => root.querySelector('select');

  const question = {
    id,
    type: 'select-answer',

    render(container) {
      root = container;
      container.innerHTML = `
        <div class="interaction" data-interaction-id="${id}">
          <label for="${id}-select"><strong>${prompt}</strong></label>
          <select id="${id}-select" data-testid="${id}-input">
            <option value="">Choose…</option>
            ${options.map(o => `<option value="${o}">${o}</option>`).join('')}
          </select>
          ${renderInteractionControls(id)}
          ${renderFeedbackContainer(id)}
        </div>`;
      // Handles Check Answer and Reset, engagement tracking, and LMS reporting.
      container.addEventListener('click', createInteractionEventHandler(question, {
        ...config,
        scormType: 'choice',
        correctPattern: correctAnswer
      }));
    },

    getResponse: () => select().value || null,
    setResponse: (value) => { select().value = value; },

    evaluate(response) {
      const correct = response === correctAnswer;
      return { correct, score: correct ? 1 : 0, response };
    },

    checkAnswer() {
      const response = question.getResponse();
      if (!response) {
        displayFeedback(root, id, 'Please choose an answer.', 'error');
        return null;
      }
      const result = question.evaluate(response);
      displayFeedback(root, id, result.correct ? 'Correct!' : 'Not quite.', result.correct ? 'correct' : 'incorrect');
      return result;
    },

    reset() {
      select().value = '';
      clearFeedback(root, id);
    }
  };

  // Saves and restores the learner's answer and makes it visible to testing tools.
  registerCoreInteraction(config, question);
  return question;
}
```

The factory is added to `CourseCode` under a name built from `schema.type`: `select-answer` becomes `createSelectAnswerQuestion`. Use it in a slide like a built-in interaction:

```javascript
const question = CourseCode.createSelectAnswerQuestion({
  id: 'capital',
  prompt: 'What is the capital of France?',
  options: ['Berlin', 'Paris', 'Madrid'],
  correctAnswer: 'Paris'
});
question.render(container.querySelector('#capital-question'));
```

`scormType` sets how the answer is reported to the LMS: `choice`, `true-false`, `fill-in`, `matching`, `sequencing`, `numeric`, `likert`, or `other`. The built-in interactions in `framework/js/components/interactions/` use the same helpers and are complete examples.

### Custom UI Components

Add reusable HTML components (info boxes, custom cards, branded banners) by adding a `.js` file to `course/components/`. A component exports:

| Export | Required | Purpose |
|--------|----------|---------|
| `schema` | Yes | `type` must match the `data-component` value used in slides. Files without `schema.type` are skipped. |
| `init(element)` | No | Runs for each matching element when a slide renders. May return a cleanup function, or an object with `destroy()`, which runs when the slide is removed. |
| `styles` | No | A CSS string, added to the page once. |
| `metadata` | No | Extra information for tooling. |

```javascript
// course/components/info-box.js
export const schema = {
  type: 'info-box',
  description: 'Highlighted note with a dismiss button',
  example: `<div data-component="info-box"><p>Remember to save your work.</p></div>`
};

export const styles = `
  [data-component="info-box"] { border-left: 4px solid var(--color-primary); padding: 1rem; }
  [data-component="info-box"].is-dismissed { display: none; }
`;

export function init(element) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-secondary btn-sm';
  button.textContent = 'Dismiss';
  const dismiss = () => element.classList.add('is-dismissed');
  button.addEventListener('click', dismiss);
  element.append(button);
  return () => button.removeEventListener('click', dismiss);
}
```

Use it in any slide:

```html
<div data-component="info-box"><p>Remember to save your work.</p></div>
```

### Custom Icons

Add icons to `course/icons.js` and they're available throughout the course:

```javascript
// course/icons.js
export const customIcons = {
  'rocket': '<path d="M12 2L8 8H4l8 14 8-14h-4L12 2z" />'
};
```

### Custom Styles

`course/theme.css` is always loaded. Use it for brand colors and fonts, and for plugin CSS you prefer to keep out of JavaScript:

```css
/* course/theme.css */
:root {
  --palette-blue: #0066cc; /* primary brand color */
}

.my-banner { border: 1px solid var(--border-default); border-radius: var(--radius-md); }
```

Use the design system's variables (such as `--color-primary`, `--border-default`, and `--radius-md`) so plugins follow the course theme, including dark mode.

---

## Exporting and Sharing

### Building an LMS Package

Build a ZIP and upload it to your LMS:

```bash
coursecode build                    # Builds as cmi5 (default)
coursecode build --format scorm1.2  # Builds as SCORM 1.2
```

The ZIP is written to your project folder. When you update the course, rebuild and upload the new ZIP.

### Understanding LMS Formats

An LMS (Learning Management System) is the platform your organization uses to deliver training, such as Cornerstone, Moodle, Canvas, or Docebo. CourseCode packages your course in a format your LMS understands.

| Format | What It Is | When to Use |
|--------|-----------|-------------|
| **cmi5** | The modern standard. Rich data, flexible. | Your LMS supports cmi5 (check with your LMS admin) |
| **SCORM 2004** | Widely supported enterprise standard. | Most corporate LMS platforms |
| **SCORM 1.2** | Oldest standard, most compatible. | Older systems, or when you're unsure |
| **LTI** | Integration standard, not a package format. | LMS platforms that use LTI (Canvas, Blackboard) |

> **LTI requires a backend:** A production LTI 1.3 launch is not a static ZIP. A trusted server must complete OIDC/JWT validation, hold the private key, persist learner state, and proxy AGS score writes. The CourseCode browser driver intentionally rejects raw `id_token` launches.

**Not sure which to pick?** Ask your LMS administrator. If they don't know, try **SCORM 1.2**, which works with almost every LMS.

> **SCORM 1.2 caveat:** SCORM 1.2 has a strict ~4KB suspend data limit. CourseCode uses a strict storage mode to fit within that limit, which can reduce how much interaction UI state is restored across slides on resume.

> **Browser support:** CourseCode learner packages support Chrome 111+, Edge 111+, Firefox 114+, and Safari 16.4+. SCORM format selection does not change that browser floor. Internet Explorer and other non-ESM webviews are not supported.


### Sharing Previews

Before publishing to an LMS, share your course with stakeholders for review:

```bash
coursecode preview --export
```

This creates a self-contained folder you can upload to any web host (Netlify, GitHub Pages, etc.). The options below cover output location, a soft password gate, and GitHub Pages.

### Preview Export Options

Useful `coursecode preview --export` options:

```bash
coursecode preview --export -o ./course-preview
coursecode preview --export --password "secret"
coursecode preview --export --skip-build
coursecode preview --export --nojekyll
coursecode preview --export --no-content
```

- `-o, --output`: choose output folder. The export replaces this folder, so it must be new, empty, or a previous preview export (refuses the project root, `course/`, `dist/`, your home directory, etc.)
- `--force`: replace a non-empty output folder that is not a previous preview export
- `-p, --password`: add a soft password gate to the shared preview. This only hides the player UI: the course files are still published alongside it and can be downloaded directly, so do not rely on it to protect confidential content
- `--skip-build`: export from existing `dist/` without rebuilding
- `--nojekyll`: add `.nojekyll` (important for GitHub Pages)
- `--no-content`: hide the content viewer panel in exported preview

### Sharing One File Without a Server

For training that will be opened directly from email, a shared drive, USB media, or a local computer, export one portable HTML file:

```bash
coursecode export html
coursecode export html --output ./Safety_Training.html
```

The recipient double-clicks the `.html` file and uses it in a modern browser. CourseCode embeds the learner runtime and local course assets, so no LMS, web server, install, or ZIP extraction is required. Progress and resume state are saved locally in the browser when `file://` storage is available. If the browser blocks local storage, the course still works but restore is limited to the current session.

This export is a good fit for informal training, reference material, stakeholder review, offline delivery, and unmanaged kiosks. It does not provide centralized learner records, identity, administrator reporting, cross-device sync, or certified completion evidence. Internet-hosted content such as YouTube still needs a connection, and large audio/video files make the exported HTML correspondingly large.

### Exporting Content for Review

Extract your course content into a readable document for subject matter expert (SME) review:

```bash
coursecode export-content -o review.md
```

This pulls all slide text, interactions, and assessment questions into a single Markdown file. Use it to get sign-off on content accuracy before publishing.

### Hosting on Your Own CDN (Advanced)

For teams that update courses frequently or serve multiple LMS clients, CourseCode can load the course from your own CDN. Instead of uploading the full course to each LMS, you:

1. Host the course behind a CDN/backend that can authorize every course file
2. Upload a tiny proxy package (~15KB) to each LMS
3. The proxy loads the course from the CDN at runtime

**Why this matters:**
- **Instant updates**: fix a typo on the CDN and every learner sees it immediately, no LMS re-upload
- **Multi-tenant**: one CDN copy serves multiple LMS clients, each with their own access token
- **Smaller LMS packages**: faster upload and launch times

CDN hosting uses special format variants (`scorm1.2-proxy`, `scorm2004-proxy`, `cmi5-remote`). In `course-config.js`, set `externalUrl` to the HTTPS address where you will host the course, and set `accessControl: { enforcement: 'server' }`; client credentials are stored separately in the gitignored `.coursecode/access-control.json`.

Generate and add client tokens with:

```bash
coursecode token --add client-a
coursecode token --add client-b
```

These commands create build-time credentials only. Your CDN/backend must validate them before serving `index.html`, JavaScript, or assets. Static hosts without request authorization cannot protect course content.

Then build the proxy or remote package, upload `dist/` to your CDN, and upload the proxy ZIP to each LMS:

```bash
coursecode build --format scorm1.2-proxy
```

### CourseCode Cloud (Optional)

[CourseCode Cloud](https://coursecodecloud.com) is a paid hosting service for CourseCode courses. Everything above works without it. With Cloud, you upload a build once and Cloud hosts it, provides a shareable preview link, and generates the LMS package you need:

```bash
coursecode login     # First time only: sign in to CourseCode Cloud
coursecode deploy    # Build + upload to cloud
```

**How it works:** Your course is built once as a universal package. Cloud generates a format-specific ZIP (SCORM 1.2, SCORM 2004, cmi5) when you download one, so the `format` setting in `course-config.js` only applies to local `coursecode build`.

Courses launched from Cloud report errors and learner data to Cloud automatically. If you configured your own endpoints in `course-config.js`, Cloud's settings take precedence for Cloud launches.

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

Open the URL in any browser, log in with your CourseCode account, and enter the code. The terminal confirms the login automatically, with no redirect back required. The code is valid for 15 minutes and works from any device or browser.

**Deploy flags:**

`coursecode deploy` accepts flags that control how the production and preview pointers are updated after upload:

| Command | Production pointer | Preview pointer |
|---|---|---|
| `coursecode deploy` | Follows your deploy_mode setting | Follows your preview_deploy_mode setting |
| `coursecode deploy --promote` | Always moved to new version | Follows your preview_deploy_mode setting |
| `coursecode deploy --stage` | Never moved (stays on old version) | Follows your preview_deploy_mode setting |
| `coursecode deploy --preview` | **Untouched** (preview-only upload) | Always moved to new version |
| `coursecode deploy --promote --preview` | Always moved to new version | Always moved to new version |
| `coursecode deploy --stage --preview` | Never moved | Always moved to new version |

- **Production pointer**: the version learners see when they launch your course.
- **Preview pointer**: the version served on the cloud preview link (for stakeholder review).
- **deploy_mode**: a per-course or org setting in the Cloud dashboard. Default is auto-promote (new uploads immediately go live). Can be set to staged (new uploads require a manual promote step).
- `--promote` and `--stage` are mutually exclusive.
- `--password` can be combined with `--preview` to create or update the main preview link password. If you omit the password value in an interactive terminal, the CLI prompts for it. In `--json` mode you must pass the value explicitly.
- **GitHub-linked courses:** If your course is connected to a GitHub repo in the Cloud dashboard, production deploys happen via `git push`, and the CLI blocks direct production uploads. Use `coursecode deploy --preview` to push a preview build for stakeholder review.
- If a cloud deployment was deleted outside the CLI and this project still has the old local binding, rerun with `coursecode deploy --repair-binding`. To clear the stale binding without deploying yet, run `coursecode status --repair-binding`.

**Managing previews and pointers after deploy:**

Use these commands when you want to change Cloud state without rebuilding the course:

```bash
coursecode status
coursecode deployments
coursecode promote --preview
coursecode promote --production
coursecode preview-link --enable
coursecode preview-link --password
coursecode preview-link --remove-password
coursecode preview-link --expires-in-days 7
coursecode preview-link --disable
```

- `coursecode deployments` lists recent immutable deployments and marks the current Production and Preview pointers.
- `coursecode promote --preview` moves the Preview pointer to an existing deployment. If you do not pass `--deployment <id>`, the CLI prompts you to pick from recent deployments.
- `coursecode promote --production` moves the Production pointer. Preview-only deployments cannot be promoted to Production.
- `coursecode preview-link` manages the main preview link. That link follows the Preview pointer, so the URL can stay the same while you choose which deployment reviewers see.
- Cloud can also create additional pinned preview links for specific deployments in the web app. The main CLI preview link is the pointer-following link.

**Typical Cloud workflow:**
1. Run `coursecode login` once, open the URL shown, and enter the code.
2. Run `coursecode deploy` from your project folder, or `coursecode deploy --preview --password` for a password-protected review build.
3. Open the CourseCode Cloud dashboard link shown after deploy.
4. Use the main preview link for review.
5. Move the Preview or Production pointer when needed.
6. Download the LMS format you need from Cloud when you're ready to deliver.

---

## Generating Audio Narration

Generate voiceover audio from narration text:

1. Add narration scripts to your slides (your AI assistant can help)
2. Get an API key from [Deepgram](https://deepgram.com/) (default), [ElevenLabs](https://elevenlabs.io/), [OpenAI](https://platform.openai.com/), [Google Cloud](https://cloud.google.com/text-to-speech), or [Azure](https://azure.microsoft.com/en-us/products/ai-services/text-to-speech)
3. Add the key to a `.env` file in your project
4. Run:

```bash
coursecode narration
```

Audio files are generated to `course/assets/audio/`. A slide plays its narration when its entry in `course-config.js` includes `audio: { src: '@slides/<slide-file>.js' }`.

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
