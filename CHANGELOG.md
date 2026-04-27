# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
