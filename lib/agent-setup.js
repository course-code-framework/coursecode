/**
 * Project files that connect AI coding tools to a course project: MCP settings
 * for Claude Code, Codex, Cursor, and VS Code, plus AGENTS.md (read by Codex,
 * Cursor, and most other agents) and a CLAUDE.md that imports it.
 *
 * Every server runs the project's own CLI so tools match the course's framework
 * version, through node rather than npx so the same files work on Windows.
 * Existing files are never overwritten: JSON settings gain a coursecode server
 * entry, TOML gains a table, and AGENTS.md / CLAUDE.md are left alone.
 *
 * With the CourseCode plugin, Claude Code already starts a coursecode server, so
 * plugin setup skips .mcp.json; a project server would give the agent every
 * tool twice.
 */
import fs from 'fs';
import path from 'path';

const PROJECT_CLI = 'node_modules/coursecode/bin/cli.js';

// Cursor and VS Code may start servers outside the workspace; the CLI moves to
// COURSECODE_PROJECT_DIR first.
const workspaceServer = {
    command: 'node',
    args: [`\${workspaceFolder}/${PROJECT_CLI}`, 'mcp'],
    env: { COURSECODE_PROJECT_DIR: '${workspaceFolder}' }
};

const CLAUDE_SETTINGS = { file: '.mcp.json', key: 'mcpServers', server: { command: 'node', args: [PROJECT_CLI, 'mcp'] } };

const JSON_SETTINGS = [
    CLAUDE_SETTINGS,
    { file: '.cursor/mcp.json', key: 'mcpServers', server: workspaceServer },
    { file: '.vscode/mcp.json', key: 'servers', server: { type: 'stdio', ...workspaceServer } }
];

const CODEX_SETTINGS = {
    file: '.codex/config.toml',
    table: '[mcp_servers.coursecode]',
    content: `# Codex reads project settings only after you trust this folder.
[mcp_servers.coursecode]
command = "node"
args = ["${PROJECT_CLI}", "mcp"]
`
};

export const AGENTS_MD = `# CourseCode course project

This folder is a CourseCode Framework course. Slides are JavaScript files in \`course/slides/\`, course settings are in \`course/course-config.js\`, and branding is in \`course/theme.css\`.

## Tools

The \`coursecode\` MCP server is configured for this folder. Run \`npm install\` first if \`node_modules/\` is missing.

- Call \`coursecode_workflow_status\` at the start of a session. It reports the authoring stage and what to do next.
- Start the preview once, as a background process: \`npx coursecode preview\` (http://localhost:4173). Runtime tools such as \`coursecode_screenshot\` and \`coursecode_interact\` need it.
- After editing slides, run \`coursecode_lint\`, then check the slide with \`coursecode_screenshot\`.

## Workflow

1. Put source documents in \`course/references/\` and run \`npx coursecode convert\`.
2. Write \`course/COURSE_OUTLINE.md\` following \`framework/docs/COURSE_OUTLINE_GUIDE.md\` and \`framework/docs/COURSE_OUTLINE_TEMPLATE.md\`. Get the author's approval before building slides.
3. Build slides following \`framework/docs/COURSE_AUTHORING_GUIDE.md\`. Use the component, interaction, CSS, and icon catalog tools instead of guessing class or component names.
4. Review every slide at desktop and mobile sizes (\`coursecode_viewport\`) and answer each interaction with \`coursecode_interact\`.
5. Export with \`npx coursecode build --format scorm1.2\` (or \`scorm2004\`, \`cmi5\`, \`lti\`). Deploying to CourseCode Cloud is optional and only on request.

## Rules

- Edit files in \`course/\`. Do not edit \`framework/\`, \`schemas/\`, or \`node_modules/\`.
- Never ask for passwords or API keys in chat. Narration and Cloud sign-in use the author's own configuration.
`;

const CLAUDE_MD = '@AGENTS.md\n';

function writeJsonSetting(projectDir, { file, key, server }) {
    const filePath = path.join(projectDir, file);
    let settings = {};
    if (fs.existsSync(filePath)) {
        try {
            settings = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch {
            return null; // Leave a file we cannot parse (JSONC, for example) for the author
        }
        if (settings[key]?.coursecode) return null;
    }
    settings[key] = { ...settings[key], coursecode: server };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
    return file;
}

function writeCodexSetting(projectDir) {
    const filePath = path.join(projectDir, CODEX_SETTINGS.file);
    if (fs.existsSync(filePath)) {
        const current = fs.readFileSync(filePath, 'utf-8');
        if (current.includes(CODEX_SETTINGS.table)) return null;
        fs.appendFileSync(filePath, `${current.endsWith('\n') ? '\n' : '\n\n'}${CODEX_SETTINGS.content}`, 'utf-8');
    } else {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, CODEX_SETTINGS.content, 'utf-8');
    }
    return CODEX_SETTINGS.file;
}

function writeIfMissing(projectDir, file, content) {
    const filePath = path.join(projectDir, file);
    if (fs.existsSync(filePath)) return null;
    fs.writeFileSync(filePath, content, 'utf-8');
    return file;
}

/**
 * Write AI tool settings into a project. Returns the files written or updated.
 * Pass { plugin: true } when the CourseCode plugin provides Claude Code's server.
 */
export function writeAgentSetup(projectDir, { plugin = false } = {}) {
    const jsonSettings = plugin ? JSON_SETTINGS.filter(setting => setting !== CLAUDE_SETTINGS) : JSON_SETTINGS;
    return [
        ...jsonSettings.map(setting => writeJsonSetting(projectDir, setting)),
        writeCodexSetting(projectDir),
        writeIfMissing(projectDir, 'AGENTS.md', AGENTS_MD),
        writeIfMissing(projectDir, 'CLAUDE.md', CLAUDE_MD)
    ].filter(Boolean);
}
