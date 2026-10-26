# CourseCode plugin for Claude Code

Build LMS-ready e-learning courses (SCORM 1.2, SCORM 2004, cmi5, LTI 1.3) by talking to Claude. The plugin bundles the CourseCode MCP server and five skills that walk through the authoring workflow.

## Install

```bash
claude plugin install coursecode --marketplace course-code-framework/coursecode
```

Or add the marketplace and install separately:

```bash
claude plugin marketplace add course-code-framework/coursecode
claude plugin install coursecode@coursecode
```

## Requirements

[Node.js](https://nodejs.org/) 22.15 or later. Nothing else needs installing first:

- **No global `coursecode` install.** Inside a course project the plugin runs the project's own CourseCode version. Elsewhere it runs the matching published version through `npx`.
- **No browser setup.** Previews and screenshots use a headless copy of Chrome, Edge, Chromium, or Brave if one is installed. If none is, the first screenshot downloads Chrome Headless Shell (about 100 MB, once) into `~/.cache/puppeteer`, shared with other Puppeteer-based tools. Set `CHROME_PATH` to use a specific browser.

## Use

Start Claude Code in an empty folder (or an existing CourseCode project) and describe what you want, for example "build a 20-minute safety course from these PDFs". Or run a skill directly:

| Skill | What it does |
|---|---|
| `/coursecode:new-course` | Creates a project in the current folder and starts the live preview |
| `/coursecode:outline` | Converts source documents and drafts `course/COURSE_OUTLINE.md` for your approval |
| `/coursecode:build-slides` | Builds slides, interactions, and config from the outline, checking each batch with lint and screenshots |
| `/coursecode:review` | Tests every slide at desktop and mobile sizes, answers each interaction, and reports issues |
| `/coursecode:publish` | Builds an LMS ZIP, deploys to CourseCode Cloud, or exports a shareable preview |

The preview runs at http://localhost:4173, so you can watch the course change as Claude works.

## What's included

- **MCP server** (`coursecode`): headless preview, screenshots, navigation, interaction testing, lint, live diagnostics, builds, and catalogs of components, interactions, CSS classes, and icons.
- **Skills**: the five workflows above. They follow the guides in each project's `framework/docs/`, so they stay in step with the framework version the course uses.

## What it downloads and sends

- **npm registry:** the `coursecode` package (through `npx` outside a project, and as a project dependency when you create a course).
- **Google's Chrome for Testing storage:** Chrome Headless Shell, only when no Chromium-based browser is installed.
- **CourseCode Cloud:** your course files, only when you ask to deploy (`/coursecode:publish`) after signing in with `coursecode login`.
- **Text-to-speech providers** (ElevenLabs, Deepgram, or Google): slide narration text, only when you generate narration with your own API key.

Everything else runs locally. The preview server listens on `127.0.0.1` only.

## Links

- [CourseCode framework](https://github.com/course-code-framework/coursecode)
- [User guide](https://github.com/course-code-framework/coursecode/blob/main/framework/docs/USER_GUIDE.md)
- [CourseCode Cloud](https://coursecodecloud.com) (optional hosting)
