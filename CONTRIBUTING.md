# Contributing to CourseCode

Thank you for your interest in contributing to CourseCode! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Set up the development environment (see below)
4. Create a branch for your changes
5. Make your changes and test them
6. Submit a pull request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/course-code-framework/coursecode.git
cd coursecode

# Install dependencies
npm install

# Start the preview server with stub LMS
npm run preview

# Run linting
npm run lint
```

### Development Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Build watch only (no server) |
| `npm run preview` | Stub LMS player + build watch + live reload |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run prerelease:check` | Lint + responsive ownership/scoping checks + production build |
| `npm run smoke:responsive` | Responsive visual smoke checks (headless preview) |

## Code Style

### General Rules

1. **ES Modules**: Use `import/export` syntax, `const/let` (never `var`)
2. **No direct console calls**: Use `logger.*` instead (enforced by ESLint)
3. **Fail fast, fail loud**: Throw errors immediately; never log and continue
4. **Use stateManager**: Never call `window.doSetValue/doGetValue` directly

### Architecture Patterns

#### State-UI-Actions Pattern

For complex components, separate concerns into three files:

- **State (`*-State.js`)**: In-memory data container. No DOM, no stateManager access
- **UI (`*-UI.js`)**: DOM manipulation only. No internal state
- **Actions (`*-Actions.js`)**: Orchestrates input handling, state updates, UI direction, and manager calls

#### Event Delegation

- Use `data-action="action-name"` attributes
- Single listener on container delegates based on attribute

### Error Events

All error events must emit a standardized object:

```javascript
eventBus.emit('*:error', {
    domain: 'scorm|state|navigation|interaction|assessment|objective|initialization',
    operation: 'methodName',
    message: error.message,
    stack: error.stack,
    context: { /* debug data */ }
});
```

### Directory Structure

| Path | Purpose |
|------|---------|
| `framework/js/app/` | Global lifecycle, UI (modals, notifications), state |
| `framework/js/core/` | Core services: EventBus, runtime |
| `framework/js/drivers/` | LMS format drivers: SCORM 2004, SCORM 1.2, cmi5 |
| `framework/js/managers/` | Singleton managers: state, persistence, objectives, etc. |
| `framework/js/components/` | Reusable UI and interactions |
| `framework/js/navigation/` | Navigation: menu, buttons |
| `framework/js/utilities/` | Helper functions |
| `framework/js/dev/` | Dev-only code (tree-shaken in prod) |

## Making Changes

### Before You Start

1. Check existing issues and PRs to avoid duplicate work
2. For significant changes, open an issue first to discuss the approach
3. Read the [Framework Guide](framework/docs/FRAMEWORK_GUIDE.md) for architecture details

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add support for matching interactions
fix: resolve suspend_data overflow in SCORM 1.2
docs: update CSS reference with new utility classes
refactor: extract shared logic into interaction-base.js
```

Prefixes:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `refactor:` Code change that neither fixes a bug nor adds a feature
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

### Testing Your Changes

1. Run `npm run preview` and test in the browser
2. Check the debug panel for LMS compatibility warnings
3. Run `npm run lint` to ensure code style compliance
4. Test with different LMS formats if your change affects drivers
5. For layout/responsive changes, run `npm run prerelease:check` and `npm run smoke:responsive -- --profile=expanded`

### Pre-Release Responsive QA

- Framework responsive contracts: `/Users/seth/Documents/GitHub/coursecode/framework/docs/RESPONSIVE_FRAMEWORK_CONTRACTS.md`
- Manual device/browser checklist: `/Users/seth/Documents/GitHub/coursecode/framework/docs/PRE_RELEASE_QA_CHECKLIST.md`

## Pull Request Process

1. **Update documentation** if your change affects user-facing behavior
2. **Run linting**: `npm run lint` must pass
3. **Test thoroughly**: Use `npm run preview` to test your changes
4. **Keep PRs focused**: One feature or fix per PR
5. **Fill out the PR template** completely

### PR Review Criteria

- Code follows the established patterns and style
- Changes are well-documented
- No regressions in existing functionality
- Commit history is clean and logical

## Reporting Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md) and include:

- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Browser/environment details
- LMS format (SCORM 2004, SCORM 1.2, cmi5)

## Requesting Features

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md) and include:

- Clear description of the feature
- Use case and motivation
- Proposed implementation (if you have ideas)
- Whether you're willing to implement it

## Questions?

If you have questions about contributing, feel free to open a discussion or reach out through GitHub issues.

Thank you for contributing to CourseCode!
