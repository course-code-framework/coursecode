---
name: new-course
description: Start a new CourseCode e-learning course project (SCORM, cmi5, or LTI) and get the live preview running. Use when someone wants to create, start, or set up a course, training module, or e-learning project, or turn a PowerPoint into an interactive course.
---

# Start a new CourseCode course

CourseCode courses are plain project files: slides in `course/slides/*.js`, settings in `course/course-config.js`, branding in `course/theme.css`. The `coursecode` MCP server gives you a headless preview, linting, and catalogs of components, interactions, CSS classes, and icons for that project.

## 1. Check the folder

The MCP server only sees a `course/` directory in the folder this session started in. Create the project **in the current folder** unless the author insists on a subfolder.

- Already has `course/`? It is a CourseCode project. Call `coursecode_workflow_status` and continue from the stage it reports instead of creating anything.
- Empty or unrelated files only? Create the project here.
- If the author wants a subfolder, create it, then tell them to start a new session in that folder so the CourseCode tools can see it.

Requires Node.js 22.15 or later (`node --version`). If Node is missing or older, stop and tell the author how to install it from nodejs.org.

## 2. Choose the starting point, then create

Use the starting point already supplied by the author; ask only if it is unclear. Pick the matching command:

| Starting point | Command |
|---|---|
| Documents (PDF, Word, PowerPoint text) or just a topic | `npx coursecode create . --blank --plugin` |
| Wants to learn the framework first | `npx coursecode create . --plugin` (keeps `example-*` slides that demonstrate every feature) |
| A PowerPoint whose slides should become the course | `npx coursecode import path/to/deck.pptx --name . --plugin` |

PowerPoint import exports slide images through PowerPoint on macOS. On other systems, have the author export the slides as images first and add `--slides-dir path/to/images`.

`create` copies the template, installs dependencies, and initializes git. It takes a minute.

If the plugin folder has a `runtime/` folder next to `skills/` (a packaged release), run the first command through the plugin's launcher instead of downloading the CLI: replace `npx coursecode` with `node "<plugin-root>/mcp/coursecode-mcp.mjs"`, where `<plugin-root>` is two folders above this skill's folder. Once the project exists, use its own CLI.

`create` also writes MCP settings for Codex, Cursor, and VS Code and an `AGENTS.md` with the authoring workflow, so the author can open the project in any of those tools later. `--plugin` leaves out Claude Code's `.mcp.json`, because this plugin already runs the CourseCode server there and a project copy would list every tool twice. Someone who opens the project in Claude Code without the plugin can add it with `npx coursecode agent-setup`.

## 3. Start the preview

Start the preview server as a background process so it keeps running:

```bash
npx coursecode preview
```

It serves the course at http://localhost:4173 with a simulated LMS and rebuilds on every file change. Tell the author they can open that URL to watch the course as you build it. Start it only once; if a runtime tool says preview is already running, reuse it. If port 4173 is already in use (for example by another course's preview), add `--port 4174` and give the author that URL instead; the MCP tools find this project's preview on ports 4173–4188.

## 4. Confirm and hand off

1. Call `coursecode_workflow_status` and check the reported stage.
2. Call `coursecode_screenshot` to confirm the preview renders.
3. Set the course title and description in `course/course-config.js` once the author tells you the subject.
4. Explain the next step:
   - Source documents: put them in `course/references/`, then use the `outline` skill.
   - A topic only: use the `outline` skill to draft an outline from the conversation.
   - Imported PowerPoint: use the `build-slides` skill to turn the image slides into interactive content.

Do not start writing slides yet. Courses built from an approved outline need far fewer revisions.
