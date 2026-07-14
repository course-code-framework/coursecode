# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- `coursecode upgrade` now synchronizes the project-local CourseCode CLI dependency with the installed framework version.
- `coursecode info` now reports the most recently built course package when multiple ZIP archives exist.

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
