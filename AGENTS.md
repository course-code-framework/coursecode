# AGENTS.md — CourseCode Framework

Open-source course runtime, `coursecode` CLI, preview stub player, LMS packaging, and MCP tools. Published to npm as `coursecode`; CourseCode Desktop and CourseCode Cloud consume the published package.

**Full reference:** `framework/docs/FRAMEWORK_GUIDE.md` (written for agents developing the framework). Read the relevant section before changing drivers, state, build/packaging, linters, components, or MCP tools. It is long; read it on demand rather than all at once.

Other docs:
- `framework/docs/DATA_MODEL.md` — learner state schemas and storage
- `framework/docs/COURSE_AUTHORING_GUIDE.md` — for authoring course content, not framework code
- `framework/docs/USER_GUIDE.md` — human-facing manual

## Commands

Use npm (CI runs `npm ci`). Node 22.15+.

| Command | Purpose |
|---|---|
| `npm run preview` | Stub LMS + build watch + live reload on :4173 (`preview:scorm12`, `preview:cmi5`, `preview:lti` for other formats) |
| `npm run build` | One-time build of `template/course/` into `dist/` |
| `npm test` | Unit tests |
| `npm run test:all` | Unit + e2e + per-format driver tests |
| `npm run lint` | ESLint |
| `npm run prerelease:check` | Lint, responsive CSS checks, coverage, build, packed-create smoke test (runs in CI and on publish) |

Before merging responsive/layout changes, also run `npm run smoke:responsive -- --profile=expanded`.

A release bumps the version in `package.json`, `package-lock.json`, `framework/version.json`, both plugin manifests, the launcher's `FALLBACK_VERSION`, and both versions in `server.json` (`tests/lib/plugin-manifests.test.js` checks they match). After `npm publish`, push the `vX.Y.Z` tag: `.github/workflows/publish-mcp-registry.yml` then updates the [MCP Registry](https://registry.modelcontextprotocol.io) listing through GitHub OIDC. The registry reads `mcpName` from the published package, so the tag must come after `npm publish`. A local `mcp-publisher login github` can't publish under the organization namespace.

## Repo Layout: Two Contexts

This repo is both the framework source and the template for new course projects.

- `framework/`, `lib/`, `bin/`, `schemas/` — framework and CLI source
- `template/` — what `coursecode create` gives course authors (their `vite.config.js`, `course/`)
- `template/course/` — doubles as the test course for framework development
- `vite.framework-dev.config.js` — framework dev build (references `lib/` directly); `template/vite.config.js` is the course-author build (imports from the `coursecode` package)
- `plugin/` — one plugin for Claude Code (`.claude-plugin/plugin.json`, `.mcp.json`, `hooks/`) and Codex (`plugin.json`, `mcp.json`), sharing `skills/` and the `mcp/coursecode-mcp.mjs` launcher. Both repo marketplaces (`.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`) point at it. `npm run plugin:pack` builds the Codex directory package with a bundled runtime in ignored `artifacts/codex-plugin/`; see `plugin/CODEX.md`.
- `lib/agent-setup.js` — MCP settings and `AGENTS.md` that `coursecode create` and `coursecode agent-setup` write into course projects

Changes under `template/` ship to every new course project. Keep framework-dev-only content out of it.

## Rules

- **Watch Vite build output.** "X is not exported by Y" means the code will fail at runtime with "(void 0) is not a function".
- **All LMS and state access goes through `stateManager`.** Never call `window.doSetValue/doGetValue` and never import `lms-connection.js` directly.
- **Use `logger.*`, never `console.*`** (enforced by the build linter).
- **Tiered errors:** Tier 1 contract violations throw; Tier 2 runtime/init failures use `logger.fatal()` and then `return`; Tier 3 recoverable background failures log with structured context and retry. Events ending in `:error` carry `{ domain, operation, message, stack, context }`.
- **ES modules only;** `const`/`let`, no `var`. Complex components follow the State-UI-Actions pattern.
- **Universal build:** one `dist/` for every LMS format, chosen at runtime by `<meta name="lms-format">`. `stampFormat()` and `generateManifest()` must stay pure (no filesystem, Vite, or user code) because CourseCode Cloud calls them on uploaded builds.
- **`dist/` never contains preview/stub-player assets.**
- **State schema changes:** bump `STATE_SCHEMA_VERSION` in `state-validation.js` and add a migration in `STATE_MIGRATIONS`.
- **Don't re-add legacy browser builds** (Babel/SystemJS/IE11). The browser floor is fixed; see the guide.
- **`CourseCode.interactionHelpers` is a public plugin API** used by custom interactions in course projects. Keep its names and signatures stable; breaking it is a semver-major change.
- **Cloud meta-tag contract** (`cc-*` tags for error/data/channel reporting) is shared with CourseCode Cloud; changing it requires a matching Cloud change.
- **Update docs in the same change** when behavior, CLI flags, or author-facing classes change. New interaction types also go in `COURSE_AUTHORING_GUIDE.md`.
