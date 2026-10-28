# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Claude Code plugin** (`plugin/`, listed by `.claude-plugin/marketplace.json`): bundles the MCP server with five skills (`new-course`, `outline`, `build-slides`, `review`, `publish`). Install with `claude plugin install coursecode --marketplace course-code-framework/coursecode`. No global CLI install is needed: the plugin runs the project's own `coursecode` dependency, or the matching published CLI through `npx` outside a project. The launcher reports an outdated Node.js version with install instructions.
- **No browser prerequisite for MCP runtime tools:** besides Chrome and Chromium, the headless browser now finds Edge (preinstalled on Windows) and Brave. With none installed, the first runtime tool call downloads the Chrome Headless Shell build that `puppeteer-core` is tested against (about 100 MB, once) into the shared Puppeteer cache (`~/.cache/puppeteer` or `PUPPETEER_CACHE_DIR`). `@puppeteer/browsers` is now a direct dependency.

### Fixed
- **MCP:** The CLI run outside a course project (installed, `npx`, or a framework checkout used from another folder) no longer treats its bundled template as the author's course; the template fallback now applies only inside the framework checkout. It reports stage 0 with short instructions, so MCP clients that start the server in every session no longer get course instructions in unrelated folders. Stage 0 now recommends creating the project in the current folder (`coursecode create .`), which the MCP server can see.
- **MCP:** `coursecode_viewport` portrait breakpoints are now taller than wide (`mobile-portrait` 479×852, `tablet-portrait` 1023×1364); they were sized 16:9 landscape (479×269). The MCP server reports the package version instead of a hardcoded `2.0.0`, and the export-stage guidance points to `coursecode build` instead of a nonexistent `coursecode package` command.
- **Focus styling:** Callouts no longer draw a focus outline when navigation moves focus to a heading inside them, or when a control inside them is clicked with the mouse; the outline now shows only for keyboard focus on a control. MCP screenshots clear the navigation focus first, since automation has no pointer input and the browser otherwise draws it as keyboard focus.
- **CLI:** `coursecode create` now points to `coursecode preview` (the server at localhost:4173) instead of `coursecode dev`, which only runs a watch build, and `--start` starts the preview server.
- **Assessments:** Retake now works for randomized and question-bank assessments (it previously returned to the results screen), and reloading mid-retake resumes the attempt. Attempt limits, remedial gating and `allowRetake` are now honoured on resumed results (`allowRetake` defaults to `true`, as documented). Scores are rounded before threshold comparison, so 29/50 no longer fails a 58% pass mark, and the results display never contradicts pass/fail. Non-randomized assessments now store a short question-set signature (about 20 bytes of SCORM 1.2 suspend_data per assessment) so resume detects questions inserted, removed, reordered or retyped by a course update: answers are kept when questions were only appended, otherwise the in-progress attempt restarts cleanly (attempt counts and results kept) instead of scoring saved answers against different questions. Sessions saved before this change still resume.
- **Interactions:** Drag-drop and matching stay interactive after a question is re-shown or restored; moving an item between drop zones no longer duplicates it; distractor items no longer make drag-drop unwinnable and `maxItems` defaults to the zone's accepted count. Sequencing and likert no longer stack click handlers; sequencing uses a proper shuffle that never starts in the correct order. Multi-select shows every correct answer. Learner-typed text is escaped in fill-in and numeric results. Correct answers are no longer exposed through `data-correct` attributes, and hotspot regions no longer default to green/red styling by correctness.
- **Navigation:** `blockNavigation` is enforced for sidebar menu navigation. `?skipGating=true` and the stub-player bypass flag only work in preview/development contexts, never in LMS-launched production builds. A slide whose render throws no longer bricks resume or desyncs navigation state. Focus moves to the slide heading on navigation and to the question/results heading in assessments, with screen-reader announcements.
- **Engagement:** Time-on-slide no longer counts time between sessions; required audio and video can't be satisfied by scrubbing (video no longer counts as complete just because `ended` fired after a seek); time-progress events are throttled.
- **SCORM 1.2/2004:** Oversized suspend_data is trimmed in tiers (interaction history first) and an overflow never blocks committing status, score and location. Closing the window now commits and terminates. SCORM 2004 suspend_data uses an ASCII-safe `CC04:` encoding (legacy UTF-16 still read), and unreadable suspend_data starts the learner fresh instead of locking them out, without overwriting the stored value until they progress.
- **cmi5:** A launch `masteryScore` with a missing or low score no longer wedges the session — the verb follows the score and Terminated is always sent. Pending outcome statements are flushed on page close, sent flags are persisted per statement (no duplicate Completed), unscored objectives no longer report 0%, and non-graded interactions omit `success`. Failed xAPI statements are retried from a bounded queue.
- **cmi5/LTI:** Bookmark and grade updates made while a request is in flight are no longer lost; commits are serialized behind the real in-flight request.
- **Packaging:** The preview-only `_content-manifest.json` (which contains answer keys) is no longer written to production builds, listed in manifests, zipped, or copied into static preview exports. Edit-path injection no longer corrupts slides whose tags contain `>` inside `${...}` or quoted attributes. Manifest `<file href>` and gallery paths are URI-encoded. `adlnav:presentation` is now a child of `<item>`. cmi5 `masteryScore` keeps authored precision (87.5 → `0.875`). Titles with no ASCII letters get a stable hashed identifier instead of all sharing `course`; `metadata.identifier` is now passed through to manifests and the linter warns when it should be set. Existing identifiers for other titles are unchanged.
- **Package:** `stampFormatInHtml` is exported as typed; `lintCourse` is typed as async; type declarations added for `./vite-plugin-content-discovery` and `./portable-html`; `getSchemaFiles()` returns complete include sets. The template declares `globals`. `create` no longer copies unused `lib/manifest`, `build-packaging.js` and proxy templates into projects.

### Security
- The preview server rejects requests whose `Host` isn't this machine and state-changing requests from foreign origins (DNS rebinding / CSRF). Tunnels can opt in with `COURSECODE_PREVIEW_ALLOWED_HOSTS`. Non-loopback `--host` binds print a warning, and remote clients don't receive the edit token.
- Slide source editing endpoints are confined to `slides/` and escape spliced text.
- `coursecode import` passes PowerPoint paths to AppleScript as arguments (no string interpolation) and uses a private temp directory.
- `preview --export` refuses to delete the project, its parents, the home directory, source folders, or non-export directories (`--force` for the latter), and now works outside the framework repo.
- The system CA bundle is stored in `~/.coursecode/certs` (private, verified before reuse) instead of a predictable shared temp path.
- Static-export password gate uses salted PBKDF2 and is documented as a soft gate, not security.
- Preview hardening: no wildcard CORS on `/__lms`, request body size limits, `</script>`-safe inline JSON, safe markdown link schemes, dashboard builds no longer clobber the watched `dist/`, the MCP browser only attaches to a real CourseCode preview, credentials file permissions enforced on every write, lint child process receives paths via environment, and the CLI forwards signals to its re-exec'd child.
- Updated dependencies with advisories (`@modelcontextprotocol/sdk` ^1.32.2, `vite` ~8.1.6, transitive updates). `puppeteer-core` is upgraded to ^25.16.0 (clears the `basic-ftp`, `extract-zip` and nested `zod` advisories). The unmaintained `win-ca` dependency, whose `node-forge` advisory has no patched release, is removed: Windows system CA certificates now come from Node's built-in `tls.getCACertificates('system')`. They are added in-process on Node 22.19+/24.5+ and through a `NODE_EXTRA_CA_CERTS` re-exec on earlier Node 22 releases. `npm audit --omit=dev` now reports 0 vulnerabilities.

### Changed
- **Node requirement raised to 22.15+** (from 20.19+) for the framework, generated projects (`engines` in the template), and `framework/version.json`. `puppeteer-core` 25 requires Node 22.12+, and 22.15 adds the built-in system CA reader that replaces `win-ca`.

## [0.1.61] - 2026-07-20

### Fixed
- MCP screenshots now normalize Puppeteer's binary output before base64 encoding, preventing invalid image payloads when Puppeteer returns a plain `Uint8Array`.

## [0.1.60] - 2026-07-14

### Fixed
- `coursecode upgrade` now synchronizes the project-local CourseCode CLI dependency with the installed framework version.
- `coursecode info` now reports the most recently built course package when multiple ZIP archives exist.
- Success buttons now honor the theme's `--color-on-success` foreground token, and runtime contrast checks recognize custom computed gradient backgrounds.
- MCP screenshots now scroll the framework's real content container and include preview chrome when sizing full-page captures.
- Interactive images now apply their required positioning and responsive image hooks from the documented `data-component="interactive-image"` markup.
- Hotspot answer checks now address the correct feedback container and honor authored correct and incorrect feedback during learner and automation flows.
- Structured interaction responses now restore as their original arrays or objects, and learner, automation, and restored checks emit the documented `interaction-checked` event.
- Automation registry entries now retain the interaction's SCORM type so structured responses are normalized correctly after MCP-driven checks.

## [0.1.59] - 2026-07-13

### Changed
- Expanded build linting to validate interaction schemas, authored asset references, and menu icons before packaging.
- Build completion output now reports the detected LMS format and only archives produced by the current build.
- Course interaction assets now resolve consistently from author-facing paths in both standard and portable builds.

### Fixed
- Aligned drag-drop, fill-in, hotspot, and matching schemas with their runtime contracts and corrected the example lightbox document reference.
- Applied global accordion variants to accordion containers while preserving component-level overrides, and restored article-layout breadcrumb clearance.
- Prevented runtime and responsive smoke checks from reporting false results for generated hotspot markup, screen-reader-only content, occupied ports, or failed preview startup.

## [0.1.58] - 2026-07-13

### Changed
- Declarative UI components now expose and run deterministic teardown hooks when views are re-rendered or removed, replacing observer-based cleanup and preventing stacked DOM, document, and event-bus listeners.
- Standalone audio and video completion thresholds now share strict normalization, preserving valid zero values while rejecting malformed or out-of-range authored input.
- Child-process commands avoid unnecessary shells, report spawn failures consistently, and open browser URLs without shell interpolation.
- Preview startup now waits for a confirmed fresh Vite build and rejects invalid ports, spawn failures, and build timeouts instead of serving stale output.

### Fixed
- Preserved valid engagement progress when revisiting a slide, pruned removed component IDs, and prevented repeated interactive-image and lightbox registration from inflating required totals.
- Fixed multiple rendered video players overwriting one another's active context, misattributing progress/completion, and leaving stale manager state after detach.
- Fixed automation-completed standalone audio being tracked under its internal context prefix instead of the authored audio ID.
- Rejected non-finite scroll depth, scores, weights, seek positions, and malformed LMS numeric fields before they could corrupt progress, scoring, or SCORM caches.
- Made objective status-and-score updates atomic, validated objective status vocabularies at both manager and state boundaries, and restored support for all SCORM completion states.
- Fixed the lightbox component metadata to map to the `viewAllLightboxes` engagement requirement.
- Hardened proxy-driver listener and pending-request teardown across initialization, termination, timeout, and synchronous `postMessage` failures.
- Fixed deep cloning of objects that shadow `hasOwnProperty`, blocked prototype-polluting deep merges and flag keys, and preserved non-plain values during merges.
- Resolved assessment IDs consistently from derived `assessmentId` values with the documented slide `id` fallback.

### Security
- Removed avoidable shell execution from build, development, creation, narration, and preview-export subprocesses, and replaced shell-based browser launching with argument-safe process execution.

## [0.1.57] - 2026-07-11

### Changed
- Upgraded ZIP generation to `archiver` 8 and its ESM `ZipArchive` API, removing the deprecated `archiver-utils` and `glob` dependency chain from framework and generated-project installs.

### Fixed
- `coursecode create` and `coursecode init` now explicitly create Git-persistent `course/references/` and `course/references/converted/` directories instead of relying on template `.gitkeep` files that npm excludes from the published package.
- The packed consumer smoke test now verifies both reference directories survive real npm packing and project creation.

## [0.1.56] - 2026-07-11

### Fixed
- `coursecode create .` and unnamed `coursecode init` now derive a human-readable, title-cased course title and a conventional hyphenated npm package name from the current directory while preserving explicit-name behavior.
- The packed consumer smoke test now exercises the complete `create . --blank` workflow through dependency installation, lint, and production build.

## [0.1.55] - 2026-07-11

### Added
- Added `coursecode init [name]` and `coursecode create .` workflows for safely initializing an existing directory while preserving Git metadata and merging project control rules.
- Added a packed-tarball consumer smoke test that creates a blank course, installs its dependencies, generates slide and assessment scaffolds, verifies Git ignore behavior, lints, builds, and produces an LMS ZIP as part of the release gate.

### Changed
- Clarified the slide render contract as `render(_root, context)`: the first argument is reserved and currently `null`, while slides create and return their own root element.
- Package-safe `gitignore` and `gitattributes` template sources are now materialized as `.gitignore` and `.gitattributes` in generated projects.

### Fixed
- Fixed isolated generated projects failing to build by adding the creating `coursecode` version to generated development dependencies.
- Fixed blank and newly generated slides failing strict ESLint checks because of unused render arguments.
- Fixed generated assessments passing questions in the override slot and attempting to render into the reserved `null` slide argument.
- Fixed blank projects retaining demo documents, images, widgets, narration cache data, and failing builds when no learner assets exist.
- Fixed generated Git repositories exposing dependencies, build output, LMS ZIPs, narration caches, and local environment files as untracked content.

## [0.1.54] - 2026-07-10

### Added
- Added release guards for learner-package contents, static-copy output layout, XML manifest escaping, preview-server trust boundaries, and generated-project upgrades.
- Added an explicit `lms.masteryScore` setting for courses that need one package-level LMS threshold; manifests no longer invent a default score.

### Changed
- Replaced the IE11/Babel/SystemJS dual-bundle pipeline with a single ESM build targeting Chrome 111+, Edge 111+, Firefox 114+, and Safari 16.4+.
- Upgraded generated projects and framework builds to Vite 8 and `vite-plugin-static-copy` 4.
- Migrated Vite configuration from the deprecated `build.rollupOptions` alias to `build.rolldownOptions`.
- Raised the authoring runtime requirement from Node 18 to Node 20.19+.
- Changed live preview to bind to loopback by default and require a per-process token for source-changing requests.
- Changed LTI 1.3 delivery to require a trusted backend for launch validation, key custody, state persistence, and AGS writes; the browser no longer treats raw launch parameters as trusted claims.
- Moved external-hosting client credentials out of learner-facing course configuration and into the gitignored `.coursecode/access-control.json`; the delivery layer must authorize files before serving them.
- `coursecode upgrade --configs` now synchronizes managed build dependencies, removes the retired legacy plugin, updates the Node engine, and backs up customized configuration files.

### Fixed
- Fixed path traversal and unsafe project-path handling in preview and project utilities.
- Fixed permissive cross-window messaging in external proxy packages by validating message source and origin.
- Fixed XML-invalid course metadata and filenames in SCORM/cmi5 manifests.
- Fixed static-copy v4 nesting that could place schemas, course assets, and vendor files at invalid package paths.
- Fixed generated-course theme loading, startup cleanup, unobserved error events, and failed reporting batches that previously waited indefinitely for another learner event.

### Removed
- Removed `@vitejs/plugin-legacy`, IE11 targeting, legacy chunks, and automatic modern polyfill bundles. SCORM support continues unchanged because SCORM defines LMS packaging and runtime communication rather than a browser JavaScript version.

## [0.1.37] - 2026-04-27

### Fixed
- `coursecode create` now honors `COURSECODE_NPM_CLI` and `COURSECODE_NPX_CLI`, allowing CourseCode Desktop to create and start projects with its bundled npm toolchain.
- CLI argument parsing now handles Electron's `ELECTRON_RUN_AS_NODE` runtime so bundled Desktop launches do not treat the CLI script path as a command.

## [0.1.36] - 2026-04-25

### Fixed
- `coursecode deploy`: friendly error messages for direct-to-R2 upload failures (connect timeout, DNS, reset, TLS). Identifies the failing file and host, suggests `--dns-result-order=ipv4first` and VPN/proxy checks. Per-attempt timeout raised to 60s; backoff is exponential with jitter.
- CLI no longer prints raw Node/undici stack traces on unhandled errors. Set `COURSECODE_DEBUG=1` to opt back in.
- Dashboard URL in deploy success output now uses the canonical `www.coursecodecloud.com` domain instead of the internal hosting origin.

### Removed
- The `*.vercel.app` fallback URL behavior in `cloudFetch`. Block pages from corporate web filters are now a terminal error directing the user to whitelist `coursecodecloud.com`. The `cloud_url` field is no longer written to `~/.coursecode/credentials.json` (existing values are ignored).

## [0.2.0] - 2026-02-02

### Added
- Multi-format LMS support: SCORM 2004 4th Edition, SCORM 1.2, and cmi5
- CLI tools: `coursecode create`, `dev`, `build`, `upgrade`, `preview`, `narration`
- Rich interaction types: multiple choice, drag & drop, fill-in-blank, matching, hotspots, sequencing
- Assessment engine with question banks, randomization, and remediation flows
- Engagement tracking system for slide completion requirements
- Audio narration support with ElevenLabs TTS integration
- Stub LMS player for local development with debug panel
- Automation API for programmatic testing
- Accessibility features: dark mode, high contrast, reduced motion (WCAG 2.1 AA)
- State persistence with automatic LMS data management and compression
- Keep-alive system to prevent LMS session timeouts

### Documentation
- Comprehensive FRAMEWORK_GUIDE.md for framework developers
- COURSE_AUTHORING_GUIDE.md for course authors
- CSS reference merged into COURSE_AUTHORING_GUIDE.md
- CONTRIBUTING.md with contribution guidelines
