---
name: setup
description: Check that CourseCode is ready in this folder (Node.js, the CLI, and the MCP tools) and diagnose missing tools. Use when someone first installs the plugin, or when CourseCode tools are missing or failing.
---

# Set up CourseCode

CourseCode runs on this computer. Node.js 22.15 or later is required. A CourseCode Cloud account is not required for authoring, Preview, or Export.

1. Check `node --version`. If Node is missing or older than 22.15, stop and tell the author to install the current LTS from nodejs.org, then restart their AI tool.
2. Confirm the folder. The MCP tools work on the folder this session started in. Never create a course inside the plugin's own install folder. If the course lives somewhere else, the author needs a new session started in that folder.
3. Check the CLI. In an existing project, run `npx --no-install coursecode --version`. Outside a project, run the plugin's launcher: `node "<plugin-root>/mcp/coursecode-mcp.mjs" --version`, where `<plugin-root>` is two folders above this skill's folder. It uses a bundled runtime when the plugin has one and otherwise downloads the pinned CourseCode version.
4. Call `coursecode_workflow_status`. For an existing course it reports the current stage. For an empty folder, continue with the `new-course` skill.
5. Explain that Preview is a local simulated LMS on `127.0.0.1`. It runs as a separate terminal process; the MCP server never starts it. Reuse a Preview that is already running for this course.

Creating a project installs npm dependencies, and the first screenshot may download Chrome Headless Shell if no Chromium-based browser is installed, so first-time setup needs a network connection.

If the CourseCode tools are missing, restart the AI tool or start a new session in the project folder. A working CLI does not prove the MCP server is connected: report setup as complete only after `coursecode_workflow_status` returns a real response.
