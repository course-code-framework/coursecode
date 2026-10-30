# CourseCode Framework plugin for Codex

The plugin in `plugin/` works in both Claude Code and Codex. Codex reads `plugin.json` and `mcp.json`; Claude Code reads `.claude-plugin/plugin.json` and `.mcp.json`. Both use the same skills (setup, new-course, outline, build-slides, review, publish) and the same launcher, `mcp/coursecode-mcp.mjs`.

It is not yet in OpenAI's public plugin directory. Until it is, install it from this repository.

CourseCode Framework is open source and works without Cloud. CourseCode Cloud is an optional hosted layer for deployment, licensing, analytics, and managed services.

## Install from GitHub

Requires Node.js 22.15 or later.

```sh
codex plugin marketplace add course-code-framework/coursecode
codex plugin add coursecode@coursecode
```

The repository's `.agents/plugins/marketplace.json` lists the `plugin/` folder. Start a Codex session in an empty folder or an existing course project and ask it to set up CourseCode, or describe the course you want.

The launcher runs the project's own `coursecode` dependency when there is one, so tools match the course's framework version. Otherwise it runs the CLI version pinned in the launcher through `npx`. Codex starts plugin MCP servers inside the plugin's install folder, so the launcher uses the session's `PWD`, and the MCP server switches to the workspace root Codex reports through MCP roots. `COURSECODE_PROJECT_DIR` overrides both. The MCP server never starts Preview.

Without the plugin, any Codex install can use the MCP server directly: projects created with `coursecode create` include `.codex/config.toml`, and `codex mcp add coursecode -- coursecode mcp` adds it globally.

## Directory package

The public directory build bundles the framework runtime so starting MCP needs no download. Build and test it from the framework repository with Node.js 22.15+ and npm:

```sh
npm ci
npm run plugin:pack
npm run plugin:smoke
```

Packaging copies `plugin/` without the Claude Code files (including the `hooks/` session check) and README, adds a `runtime/` folder with the framework's production dependencies, and writes `artifacts/codex-plugin/coursecode/`, `artifacts/codex-plugin/coursecode-<version>-codex.zip`, and a local marketplace at `artifacts/codex-plugin/`. The launcher uses `runtime/` when the project has no `coursecode` dependency, and the `new-course` skill runs the first `create` through the launcher when `runtime/` exists. The ZIP excludes the repository's dependencies, credentials, Cloud code, and marketplace catalogs. Third-party source maps, type declarations, tests, and examples are omitted; executable code and license notices remain. The ZIP has no directory entries, and packaging fails above the portal's 5,000-entry limit.

The runtime is built from this checkout through `npm pack`, not fetched as a published release. `BUILD.json` records its provenance and package integrity; `runtime/package-lock.json` records resolved runtime dependencies. Framework and plugin versions must match. Do not present a development ZIP with unreleased changes as the published npm version. Before public release, choose an aligned release version and rerun the framework's release checks and plugin smoke test.

The smoke test extracts the ZIP into a temporary directory, creates and installs a disposable course, connects to the packaged MCP server, exercises catalogs and diagnostics, starts a loopback Preview, captures screenshots, tests interactions, and exports a SCORM package. It is an integration test, not an agent-driven public-review recording.

To install the packaged build locally:

```sh
codex plugin marketplace add /absolute/path/to/coursecode-framework/artifacts/codex-plugin
codex plugin add coursecode@coursecode-local
```

Rebuild and reinstall when source changes; do not edit the plugin cache.

## Network and local data

- Creating a project installs dependencies from npm; first-time setup is not offline.
- Preview binds to loopback. Screenshots use installed Chromium or download Chrome Headless Shell on first use if needed.
- Source documents and generated course files live in the selected project. Tool results and screenshots are shared with the user's AI host as part of the requested work; local processing does not mean those results never leave the computer.
- The underlying framework includes optional narration using an already configured provider. It sends narration text to that provider when explicitly requested. Do not solicit API keys in chat.
- The `publish` skill uploads the selected course to an existing CourseCode Cloud account only when asked to deploy. It never purchases or upgrades a plan. Local authoring and Export remain independent.

## Public submission preparation

Official references, checked 2026-10-28:

- [Package format](https://developers.openai.com/plugins/build/plugins)
- [Desktop-only eligibility](https://developers.openai.com/plugins/deploy/desktop-only)
- [Submission workflow](https://developers.openai.com/plugins/deploy/submission)
- [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)

Local MCP submissions require an approved partner and an allowlisted organization. A working local package or successful install does not establish eligibility. An account upload, review submission, and publication are separate actions.

The manifest (`plugin/plugin.json`) contains a draft listing, three example prompts, five positive and three negative review cases, and release notes. The cases cover creation, catalogs/responsive screenshots, answer evaluation, diagnostics, and LMS Export; the boundaries cover production learner records, certification, and purchases. These are drafted cases, not claimed agent-level passes. Record their actual results against the packaged version before submission.

Missing public-release inputs must stay absent from metadata until confirmed:

- Lakeside Labs LLC is the verified business publisher. The portal currently labels the selected organization Personal and blocks local-MCP submission pending OpenAI representative approval.
- Supported countries (or an explicit choice of all available countries) and commerce declaration.
- Privacy policy and terms covering this plugin: drafted at https://coursecodeframework.com/privacy/ and https://coursecodeframework.com/terms/ (live once the sites change is deployed). The privacy policy covers local files, tool-result disclosure to the AI host, optional browser/npm downloads and narration, and contact. Confirm it also states support-data retention and deletion before entering the URLs in the portal.
- Verified reviewer-accessible demo recording URL. No recording exists yet.
- Local-MCP allowlist confirmation, target-host and cross-platform testing, portal scans, and developer-completed attestations.

### Demo rehearsal

Record the actual installed development version in a disposable example-course workspace. Show setup and the returned Preview screenshot, inspect a slide on desktop and phone, answer a question correctly and incorrectly, diagnose an intentionally invalid CSS class, then restore the class and Export SCORM 1.2. Finish with the production-LMS-record request to show the boundary. Keep private documents, credentials, and unrelated chats out of the recording.

Computer control and screenshots do not capture video. Start a screen recorder before this walkthrough and stop it afterwards; replay the file to check legibility, actual results, and absence of secrets. Host it at a reviewer-accessible destination and verify playback without creator-only access. Add that verified URL to `extensions.com.openai.review.demo_recording_url` and rebuild. A rehearsal script or local screenshots are not a completed demo.

Only after these inputs and tests are complete should the archive be labeled ready for submission. Do not upload a skills-only listing as a temporary shortcut: the current portal does not support adding an MCP server to an existing skills-only listing.

## Preparation evidence — 2026-10-28

- Passed: nine focused unit tests, repository ESLint, and diff whitespace checks.
- Passed: extracted-ZIP integration smoke on macOS with Node.js 22.22.2; creation, sixteen discovered MCP tools, catalog/workflow calls, missing-preview recovery, navigation, correct/incorrect interaction evaluation, desktop/mobile screenshots, static lint diagnosis, and a SCORM 1.2 ZIP with `imsmanifest.xml` and `index.html`.
- Passed: local Codex marketplace registration and installation; the installed cache's bundled MCP runtime starts in an empty workspace and reports `not-initialized` with sixteen tools. No global `coursecode` install is required.
- Observed: three unused example narration-audio warnings, each surfaced by both runtime and framework diagnostics. No error-severity diagnostic appeared in the smoke run; this is not a claim that every example or LMS integration was reviewed.
- Not run: agent-driven review prompts, recorded demo, live Cloud Deploy, paid narration, Windows/Linux installation, a successful public MCP scan, or a real LMS upload.
- Portal observation: after the user completed business verification, organization settings show Business Approved and the uploader selects Business — Lakeside Labs LLC. The first development ZIP upload was rejected for too many archive entries (8,874 including directory entries). Packaging now omits dependency development extras and redundant directory records; the revised ZIP has 4,911 files and passed the extracted-runtime smoke test. Identity verification does not establish local-MCP submission approval.
- Revised upload: the portal created a 0.3.0 Draft for CourseCode Framework under Lakeside Labs LLC. Publication is Not published and review status is Needs attention. Blocking metadata findings require a privacy policy URL, terms of service URL, and OpenAI representative approval for the command-line MCP server. MCP configuration is shown as Unavailable. Automated skill checks started; this upload is not review submission or publication. Do not remove MCP to work around this eligibility requirement.
- Completed skill checks: five passed; outline and review received non-blocking findings about installing or loading code from an untrusted or mutable source.
- Eligibility inquiry: sent through signed-in OpenAI Support with the submitting organization ID, draft link, public project, and local authoring rationale. Requested human review of independent-developer eligibility and the local-MCP allowlist application route. Support confirmed escalation to a specialist with replies expected in the coming days and via email. No eligibility decision or allowlist approval has been received. Request details and confirmation screenshot are stored only in ignored `artifacts/codex-plugin/`.
- Publisher: Lakeside Labs LLC, confirmed in the public [CourseCode Cloud privacy policy](https://www.coursecodecloud.com/privacy) and [terms](https://www.coursecodecloud.com/terms). Those pages are scoped to CourseCode Cloud and do not establish privacy/terms coverage for this local plugin. Their public contact is `contact@lakesidelabsllc.com` for privacy and `admin@coursecodecloud.com` for terms.

Machine-readable smoke results and screenshots are in ignored `artifacts/codex-plugin/smoke/`. These records do not replace a reviewer-accessible recording, verified publisher identity, or local-MCP submission approval.
