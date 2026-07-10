# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
