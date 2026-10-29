---
name: setup
description: Check that CourseCode is ready in this folder (Node.js, the CLI, and the MCP tools) and diagnose missing tools. Use when someone first installs the plugin, or when CourseCode tools are missing or failing.
---

# Set up CourseCode

CourseCode runs on this computer. Node.js 22.15 or later is required. A CourseCode Cloud account is not required for authoring, Preview, or Export.

1. Check `node --version`. If Node is missing or older than 22.15, follow [Install Node.js](#install-nodejs) below, then stop: the CourseCode tools start only after the AI tool restarts.
2. Confirm the folder. The MCP tools work on the folder this session started in. Never create a course inside the plugin's own install folder. If the course lives somewhere else, the author needs a new session started in that folder.
3. Check the CLI. In an existing project, run `npx --no-install coursecode --version`. Outside a project, run the plugin's launcher: `node "<plugin-root>/mcp/coursecode-mcp.mjs" --version`, where `<plugin-root>` is two folders above this skill's folder. It uses a bundled runtime when the plugin has one and otherwise downloads the pinned CourseCode version.
4. In Claude Code, check for duplicate tools. If the project's `.mcp.json` also defines a `coursecode` server, every CourseCode tool is listed twice. Offer to remove that entry; the plugin's server runs the project's own CLI, so nothing is lost.
5. Call `coursecode_workflow_status`. For an existing course it reports the current stage. For an empty folder, continue with the `new-course` skill.
6. Explain that Preview is a local simulated LMS on `127.0.0.1`. It runs as a separate terminal process; the MCP server never starts it. Reuse a Preview that is already running for this course.

## Install Node.js

Ask first: "CourseCode needs Node.js 22.15 or later, and this computer doesn't have it. Want me to install the current LTS version?" Install only after the author agrees. If they decline, point them to https://nodejs.org/en/download and stop.

Pick the method for this computer:

- **macOS with Homebrew** (`brew --version` works): run `brew install node`.
- **macOS without Homebrew**: find the newest LTS version in https://nodejs.org/dist/index.json (the first entry whose `lts` is not `false`), download `https://nodejs.org/dist/<version>/node-<version>.pkg` to the Downloads folder, and run `open` on it. The macOS installer opens; the author clicks through it and enters their Mac password there.
- **Windows**: run `winget install --id OpenJS.NodeJS.LTS --exact --source winget`. Windows asks the author to approve the change. If `winget` is missing, download the LTS installer (`node-<version>-x64.msi`, or `-arm64.msi` on ARM) the same way as on macOS and run `start` on it.
- **Linux**: show the author the commands for their distribution from https://nodejs.org/en/download. Don't run `sudo` commands yourself unless the author asks you to.

Never ask for a password or administrator credentials in chat; the operating system's own installer or prompt handles that. If an install fails or is blocked (for example, on a managed work computer), say so plainly and point the author to https://nodejs.org/en/download or their IT department.

After the install, check `node --version` again. Then tell the author to quit their AI tool completely and reopen it, so it picks up Node.js and starts the CourseCode tools. In the Claude desktop app, that means Quit (Cmd+Q on macOS), not just closing the window. Continue with the steps above in the new session.

## Notes

Creating a project installs npm dependencies, and the first screenshot may download Chrome Headless Shell if no Chromium-based browser is installed, so first-time setup needs a network connection.

If the CourseCode tools are missing, restart the AI tool or start a new session in the project folder. A working CLI does not prove the MCP server is connected: report setup as complete only after `coursecode_workflow_status` returns a real response.
