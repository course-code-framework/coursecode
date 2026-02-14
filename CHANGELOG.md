# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
