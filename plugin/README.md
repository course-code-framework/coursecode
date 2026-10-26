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

Requires [Node.js](https://nodejs.org/) 22.15 or later. No global `coursecode` install is needed: inside a course project the plugin runs the project's own CourseCode version, and elsewhere it uses the latest published one through `npx`.

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

## Links

- [CourseCode framework](https://github.com/course-code-framework/coursecode)
- [User guide](https://github.com/course-code-framework/coursecode/blob/main/framework/docs/USER_GUIDE.md)
- [CourseCode Cloud](https://coursecodecloud.com) (optional hosting)
