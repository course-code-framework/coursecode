# CourseCode plugin for Claude Code and Codex

Build LMS-ready e-learning courses (SCORM 1.2, SCORM 2004, cmi5, LTI 1.3) by describing them to your AI coding tool. The plugin bundles the CourseCode MCP server and six skills that walk through the authoring workflow. The same plugin folder works in Claude Code and Codex.

## Install

The plugin is not yet listed in the Claude Code or Codex plugin directories. Install it from this GitHub repository.

**Claude Code**

```bash
claude plugin marketplace add course-code-framework/coursecode
claude plugin install coursecode@coursecode
```

Inside Claude Code you can do the same with `/plugin marketplace add course-code-framework/coursecode` and then `/plugin install coursecode@coursecode`.

**Codex**

```bash
codex plugin marketplace add course-code-framework/coursecode
codex plugin add coursecode@coursecode
```

**Other AI tools.** You don't need a plugin. Projects created with `coursecode create` include MCP settings for Claude Code, Codex, Cursor, and VS Code, plus an `AGENTS.md` with the workflow. For any other MCP client, run `coursecode mcp`. See [Connecting AI with MCP](https://github.com/course-code-framework/coursecode/blob/main/framework/docs/USER_GUIDE.md#connecting-ai-with-mcp).

## Requirements

[Node.js](https://nodejs.org/) 22.15 or later. If it's missing, the `setup` skill offers to install it (Homebrew or the official installer on macOS, `winget` on Windows). Nothing else needs installing first:

- **No global `coursecode` install.** Inside a course project the plugin runs the project's own CourseCode version. Elsewhere it runs the matching published version through `npx`.
- **No browser setup.** Previews and screenshots use a headless copy of Chrome, Edge, Chromium, or Brave if one is installed. If none is, the first screenshot downloads Chrome Headless Shell (about 100 MB, once) into `~/.cache/puppeteer`, shared with other Puppeteer-based tools. Set `CHROME_PATH` to use a specific browser.

## Use

Start Claude Code or Codex in an empty folder (or an existing CourseCode project) and describe what you want, for example "build a 20-minute safety course from these PDFs". Or run a skill directly (Claude Code shown; in Codex, mention the skill by name):

| Skill | What it does |
|---|---|
| `/coursecode:setup` | Checks Node.js, the CLI, and the MCP connection |
| `/coursecode:new-course` | Creates a project in the current folder and starts the live preview |
| `/coursecode:outline` | Converts source documents and drafts `course/COURSE_OUTLINE.md` for your approval |
| `/coursecode:build-slides` | Builds slides, interactions, and config from the outline, checking each batch with lint and screenshots |
| `/coursecode:review` | Tests every slide at desktop and mobile sizes, answers each interaction, and reports issues |
| `/coursecode:publish` | Builds an LMS ZIP, exports a shareable preview or single HTML file, or deploys to CourseCode Cloud (optional) |

The preview runs at http://localhost:4173, so you can watch the course change as the AI works.

## What's included

- **MCP server** (`coursecode`): headless preview, screenshots, navigation, interaction testing, lint, live diagnostics, builds, and catalogs of components, interactions, CSS classes, and icons. Projects the plugin creates leave out `.mcp.json` so Claude Code doesn't list each tool twice; run `npx coursecode agent-setup` in a project to add it for people who don't have the plugin.
- **Skills**: the six workflows above. They follow the guides in each project's `framework/docs/`, so they stay in step with the framework version the course uses.

## What it downloads and sends

- **npm registry:** the `coursecode` package (through `npx` outside a project, and as a project dependency when you create a course).
- **Google's Chrome for Testing storage:** Chrome Headless Shell, only when no Chromium-based browser is installed.
- **CourseCode Cloud:** your course files, only when you ask to deploy (`/coursecode:publish`) after signing in with `coursecode login`.
- **Text-to-speech providers** (ElevenLabs, Deepgram, OpenAI, Google Cloud, or Azure): slide narration text, only when you generate narration with your own API key.

Everything else runs locally. The preview server listens on `127.0.0.1` only. Your AI tool's provider receives the conversation and tool results under its own terms. See the [privacy policy](https://coursecodeframework.com/privacy/) and [terms](https://coursecodeframework.com/terms/).

## Developing the framework

To try the plugin against a framework checkout, set `COURSECODE_CLI` to the checkout's `bin/cli.js` (for example in the `env` block of `~/.claude/settings.json`). The MCP server then runs that CLI in every folder instead of the project's or the published one. Codex packaging for the public directory is described in [CODEX.md](CODEX.md).

## Links

- [CourseCode Framework](https://github.com/course-code-framework/coursecode)
- [User guide](https://github.com/course-code-framework/coursecode/blob/main/framework/docs/USER_GUIDE.md)
- [CourseCode Cloud](https://coursecodecloud.com) (optional hosting)
