# SCORM Framework Development Guide

> **Intended Audience: AI Agents** — This document is a machine-readable reference for AI agents developing the framework itself. For human-readable documentation, see `USER_GUIDE.md`.

**Related Docs:**
- `COURSE_AUTHORING_GUIDE.md` - For course authors (not framework devs)
- `DATA_MODEL.md` - Complete learner data schemas and storage architecture

---

## Development Commands (Framework Repo)

The framework source repo has a different structure than course projects created with `coursecode create`. Use these commands from the repo root:

| Command | Purpose | Output |
|---------|---------|--------|
| `npm run dev` | Build watch only (no server) | `dist/` |
| `npm run preview` | **Stub LMS player + build watch + live reload** | `dist/` + server on :4173 |
| `npm run preview:scorm12` | Preview with SCORM 1.2 format | `dist/` + server on :4173 |
| `npm run preview:cmi5` | Preview with cmi5 format | `dist/` + server on :4173 |
| `npm run build` | One-time development build | `dist/` |
| `npm run build:scorm2004` | Build SCORM 2004 package | `dist/` |
| `npm run build:scorm12` | Build SCORM 1.2 package | `dist/` |
| `npm run build:cmi5` | Build cmi5 package | `dist/` |
| `npm run build:lti` | Build LTI 1.3 package | `dist/` |

### Quick Start for Framework Development

```bash
# Start the preview server with stub LMS
npm run preview

# Opens http://localhost:4173 with:
# - Stub SCORM API (localStorage persistence)
# - Live reload on file changes
# - Debug panel for API inspection with LMS Compatibility Warnings
# - Content viewer for course review
```

### LMS Compatibility Warnings
The preview server (stub player) includes an advanced diagnostic system that monitors API usage and data limits to detect potential issues before deployment to a real LMS.

It flags issues with color-coded badges in the debug panel:
- **Red Error Badge**: API misuse (e.g., calling `GetValue` before `Initialize`, `Terminate` errors)
- **Yellow Warning Badge**: Potential compatibility issues (e.g., suspend data exceeding 4KB/64KB limits)

Check the **Errors** tab in the debug panel to see detailed logs and remediation steps.

### Multi-Format Support

The framework supports multiple LMS formats:

| Format | Description | Limit |
|--------|-------------|-------|
| `cmi5` | cmi5/xAPI (default) | Unlimited |
| `scorm2004` | SCORM 2004 4th Edition | 64KB suspend_data |
| `scorm1.2` | SCORM 1.2 (legacy LMS) | 4KB suspend_data (Strict Diet Mode found in `scorm-12-driver.js`) |
| `lti` | LTI 1.3 (remote-hosted, JWT launch) | Unlimited (host-dependent) |

> **Note on SCORM 1.2 Strict Diet Mode:** To stay within the 4KB limit, this mode only persists interaction responses for the *current* slide. If a user navigates away and returns, their previous answers on other slides may not be restored visually, although their completion status/score for assessments is always preserved.

**Set format in `course-config.js`** (for local CLI builds):
```javascript
export const courseConfig = {
    // format: 'cmi5',  // Default is 'cmi5'. Options: 'scorm2004' | 'scorm1.2' | 'lti'
    // ... rest of config
};
```

**Or override via CLI:**
```bash
# Environment variable
LMS_FORMAT=scorm1.2 npm run preview

# Build script
npm run build:scorm12
npm run build:lti
```

> **Cloud courses ignore this setting.** When a course is deployed to CourseCode Cloud, the format in `course-config.js` is irrelevant — the cloud uses the universal build to generate ZIPs for any format on demand by re-stamping the meta tag and generating the appropriate manifest. Authors never need to choose a format for cloud-deployed courses.

### Universal Build Architecture

The framework produces a **universal build** — a single `dist/` output that contains all LMS drivers as lazy-loaded chunks. The active format is determined at **runtime**, not build time. This enables:

- **One build, any format**: `dist/` works with cmi5, SCORM 2004, SCORM 1.2, or LTI without rebuilding
- **Cloud-ready**: Platforms can serve any format from a single upload by re-stamping a meta tag
- **No user code execution**: Format-specific ZIPs can be assembled using only framework utilities (no Vite, no course JS)

#### How Runtime Format Detection Works

`lms-connection.js` resolves the active format via a priority chain:

| Priority | Source | Purpose |
|----------|--------|---------|
| 1 | `<meta name="lms-format">` tag in HTML | Primary — stamped at build time, re-stampable by cloud/CI |
| 2 | `import.meta.env.LMS_FORMAT` (Vite define) | Fallback for preview server / dev builds |
| 3 | `'cmi5'` | Default |

The meta tag is injected into `dist/index.html` during the post-build step. Its value comes from `course-config.js` (or the `LMS_FORMAT` env var override). Any platform can re-stamp it with a simple HTML string replacement — no build tools needed.

#### Driver Bundling

All drivers use `await import()` in `driver-factory.js`. Vite emits each as a separate lazy chunk:

```
dist/assets/
  main.js              ← Framework entry (shared across all formats)
  scorm-2004-driver.js ← Lazy chunk, only fetched if format = 'scorm2004'
  scorm-12-driver.js   ← Lazy chunk, only fetched if format = 'scorm1.2'
  cmi5-driver.js       ← Lazy chunk, only fetched if format = 'cmi5'
  lti-driver.js        ← Lazy chunk, only fetched if format = 'lti'
  proxy-driver.js      ← Lazy chunk, only fetched if format = '*-proxy'
  jose.js              ← Lazy chunk, only fetched by lti-driver.js
```

The browser only downloads the one chunk matching the meta tag. Unused driver chunks sit on disk (~20-30 KB each) and are never requested.

#### Build Outputs by Scenario

| Command | Output | Contains |
|---------|--------|---------|
| `coursecode build` | `dist/` | Universal build + format manifest + meta tag stamped |
| `coursecode build` (with `PACKAGE=true`) | `dist/` + ZIP | Same + format-specific ZIP for LMS upload |
| `coursecode preview --export` | `course-preview/` | Copy of `dist/` wrapped in stub player (for Netlify/GitHub Pages) |
| `coursecode deploy` | Uploads `dist/` | Cloud hosts universal build, assembles format ZIPs on demand. Flags: `--promote` (force live), `--stage` (force staged), `--preview` (preview-only: production untouched, preview always moved), `--repair-binding` (clear stale local cloud binding first if the remote course was deleted). `--promote`/`--stage` are mutually exclusive; `--preview` stacks with either. **GitHub-linked courses**: production deploy blocked; only `--preview` allowed (see GitHub Source Guard below). |

The ZIP never includes preview/stub player assets. Preview is a separate concern (see below).

#### Re-Stamping for Different Formats

`lib/build-packaging.js` exports `stampFormat(html, format)` for re-stamping the meta tag:

```javascript
import { stampFormat } from 'coursecode/build-packaging';
import { generateManifest } from 'coursecode/manifest';

// Re-stamp HTML string for a different format (no filesystem needed)
const stampedHtml = stampFormat(indexHtml, 'scorm2004');

// Generate the format-specific manifest
const { filename, content } = generateManifest('scorm2004', config, files, options);
```

Both are pure Node utilities.

#### Key Files

| File | Purpose |
|------|---------|
| `framework/js/state/lms-connection.js` | `getLMSFormat()` — runtime priority chain (meta → env → default) |
| `framework/js/drivers/driver-factory.js` | Dynamic `import()` switch — loads one driver at runtime |
| `lib/build-packaging.js` | `stampFormat()` — pure string meta tag re-stamping; `stampFormatInHtml()` — file-based wrapper |
| `lib/manifest/manifest-factory.js` | `generateManifest()` — generates format-specific manifests |
| Both `vite.config.js` files | Post-build `closeBundle` hook stamps meta tag into `dist/index.html` |

### cmi5 xAPI Features

When using cmi5 format, the framework automatically sends rich xAPI statements:

| Event | xAPI Verb | Data |
|-------|-----------|------|
| Slide navigation | `experienced` | Slide ID, time spent |
| Interaction answered | `answered` | Response, result, duration |
| Objective updated | `completed`/`passed`/`failed` | Objective ID, score |
| Assessment submitted | `completed` | Score, pass/fail, duration, attempt# |

**LMS Launch Data:** cmi5 exposes `masteryScore` and `moveOn` from LMS launch parameters. If the LMS sets `masteryScore`, it overrides the course's configured `passingScore` for assessments.

```javascript
// Access launch data programmatically (cmi5 only)
const launchData = stateManager.getLaunchData();
// Returns: { moveOn, masteryScore, launchMode, activityId, registration }
```

### External Hosting (CDN Deployment)

For hot-fixable courses, the framework supports **external hosting**: course content lives on a CDN while a minimal proxy package is uploaded to the LMS.

| Format | Description | Use Case |
|--------|-------------|----------|
| `scorm1.2-proxy` | SCORM 1.2 proxy | Legacy LMS, CDN hosting |
| `scorm2004-proxy` | SCORM 2004 proxy | Modern SCORM LMS, CDN hosting |
| `cmi5-remote` | cmi5 with absolute AU URL | Modern LMS/LRS, CDN hosting |

**Configuration:**
```javascript
// course-config.js
export const courseConfig = {
    format: 'scorm1.2-proxy',
    externalUrl: 'https://cdn.example.com/my-course',  // Required
    accessControl: {  // Required for proxy/remote formats
        clients: {
            'acme-corp': { token: 'abc123' },
            'globex': { token: 'def456' }
        }
    }
};
```

**Generate tokens:**
```bash
coursecode token                  # Generate random token
coursecode token --add acme-corp  # Add client to config
```

**Build outputs:**
- `dist/` — Deploy to CDN
- `*_acme-corp_proxy.zip`, `*_globex_proxy.zip` — One package per client

**Access Control:**
- Tokens are injected into URLs: `https://cdn.example.com/my-course?clientId=acme-corp&token=abc123`
- Runtime validation in `access-control.js` blocks unauthorized access
- To disable a client: remove from config → redeploy CDN

**Architecture:**
- **Proxy formats**: LMS loads a lightweight proxy (proxy.html + bridge) that iframes the CDN-hosted course. The bridge relays `postMessage` calls to the LMS SCORM API via pipwerks.
- **cmi5-remote**: The cmi5 manifest's AU URL points directly to the CDN. Course communicates with LRS via xAPI (no iframe/bridge).

**Key files:**
| File | Purpose |
|------|---------|
| `framework/js/drivers/proxy-driver.js` | Course-side postMessage LMSDriver |
| `framework/js/utilities/access-control.js` | Token validation + unauthorized screen |
| `lib/proxy-templates/proxy.html` | Proxy package entry point |
| `lib/proxy-templates/scorm-bridge.js` | postMessage ↔ pipwerks bridge |
| `lib/token.js` | CLI token generator |

**Preview mode**: Proxy/remote suffixes are stripped (e.g., `scorm1.2-proxy` → `scorm1.2`) so the stub LMS works normally.

---

## Development Roles & Testing Tools

| Role | Testing Tool | Why |
|------|--------------|-----|
| **Framework Developers** | `npm run preview` (stub server + example course) | Test framework changes against `template/course/` with full LMS simulation |
| **Course Authors** | `coursecode preview` (stub server) | Fast iteration on content, CSS, gating, interactions |

**Framework developers** modify code in `framework/` that directly interfaces with the LMS via drivers. The preview server with the example course in `template/course/` provides a complete testing environment for validating driver behavior, state management, and component functionality.

**Course authors** only edit `course/` files and never touch LMS APIs directly. The framework abstracts all persistence, so the stub server's simple key-value storage is sufficient for testing content, styling, engagement tracking, and assessment logic.

---

## AI Agent Rules

**Development & Testing Environment:**
- Use `npm run preview` for framework development with stub LMS
- **CRITICAL: Watch Vite Build Warnings!** Errors like "X is not exported by Y" mean code WILL fail at runtime with "(void 0) is not a function". Always check build output for export/import mismatches.

---

## Golden Rules

1. **NEVER call `window.doSetValue/doGetValue` directly** - use `stateManager` methods only
2. **ALWAYS use `stateManager`** - single source of truth for persistence
3. **TIERED ERROR HANDLING** - Tier 1 (contract violations) always throw; Tier 2 (runtime/init) use `logger.fatal()` → throws in DEV, degrades in PROD
4. **NEVER use `console.*` directly** - use `logger.*` instead (enforced by build linter)
5. **State-UI-Actions pattern** - for complex components
6. **ES Modules** - `import/export`, `const/let` (no `var`)
7. **Standardized errors** - ALWAYS emit `{ domain, operation, message, stack, context }` on events ending in `:error`

---

## Directory Structure

| Path | Purpose |
|------|---------|
| `framework/js/app/` | Global lifecycle, UI (modals, notifications), state |
| `framework/js/core/` | Core services: `EventBus`, `runtime` |
| `framework/js/drivers/` | LMS format drivers: SCORM 2004, SCORM 1.2, cmi5, LTI |
| `framework/js/vendor/` | Third-party libs (`pipwerks.js`) |
| `framework/js/state/` | State management facade, LMS connection, xAPI service (see `DATA_MODEL.md`) |
| `framework/js/managers/` | Feature managers: objectives, interactions, engagement, accessibility, etc. |
| `framework/js/components/` | Reusable UI (tabs, dropdowns) & interactions (MCQ, drag-drop) |
| `framework/js/navigation/` | Navigation: menu, buttons, document gallery |
| `framework/js/utilities/` | Helpers (incl. `validation-helpers.js` for SCORM 2004 4E validation) |
| `framework/js/dev/` | Dev-only code (linter, automation API) - tree-shaken in prod |

---

## Architecture Patterns

### State-UI-Actions Pattern

Separates data, presentation, logic (used in `app/`, `navigation/`):

- **State (`*-State.js`)**: In-memory data container. No DOM, no `stateManager` access
- **UI (`*-UI.js`)**: DOM manipulation only. No internal state
- **Actions (`*-Actions.js`)**: Orchestrates: handles input → updates State → directs UI → calls managers

### ViewManager

- **Single ViewManager** in `main.js` controls slide navigation
- **No caching** - views render fresh each `showView()` to prevent stale data
- Slide signature: `render(root, context)` where `root` is framework-provided container
- Components with sub-views (assessments) create own ViewManager

### Event Delegation

- Use `data-action="action-name"` attributes
- Single listener on container delegates based on attribute
- Works with ViewManager's dynamic rendering

### Course Writer (`lib/course-writer.js`)

Unified write operations for course data. All edits go through one endpoint:

```javascript
POST /__write
{ "target": "config", "id": "navigation.sidebar.enabled", "value": true }
```

| Target | What it edits | `id` format |
|--------|---------------|-------------|
| `config` | `course-config.js` properties | Dot-notation path |
| `slide` | Slide config in structure array | `slideId` |
| `objective` | Objective in objectives array | `objectiveId` |
| `gating` | Gating conditions for slide | `slideId` |

**Process**: Import config as object → modify property at path → serialize → write back. No regex.

### PowerPoint Import (`lib/import.js`)

Converts `.pptx` to a CourseCode project. Two paths for slide image acquisition:

1. **Auto-export (macOS):** AppleScript drives Microsoft PowerPoint to export each slide as PNG → temp directory → copied to `course/assets/slides/`
2. **Manual (`--slides-dir`):** User points at pre-exported images (any platform, no PowerPoint needed)

After images are acquired, the module:
- Extracts text via `node-pptx-parser` → `course/references/converted/`
- Scaffolds project via `create.js`
- Removes template slides, generates `slide-XX.html` files (each an `<img class="img-contain">`)
- Writes `course-config.js` with `layout: 'presentation'`, no engagement tracking

---

## Key Managers (Internals)

> For complete domain schemas, storage architecture, and data flow, see [`DATA_MODEL.md`](./DATA_MODEL.md).

| Manager | Location | Purpose |
|---------|----------|--------|
| `stateManager` | `state/` | **Sole public API** for all LMS and state operations |
| `assessmentManager` | `managers/` | Graded assessments: question banks, randomization, scoring |
| `engagementManager` | `managers/` | Tracks content interaction (tabs, accordions, scroll, time) |
| `objectiveManager` | `managers/` | Learning objectives (CMI-backed domain) |
| `interactionManager` | `managers/` | LMS interaction reporting (CMI-backed, append-only) |
| `accessibilityManager` | `managers/` | A11y preferences persisted via `stateManager` |
| `flagManager` | `managers/` | Arbitrary key-value flags in suspend data |
| `audioManager` | `managers/` | Audio playback: position persistence, completion tracking |
| `videoManager` | `managers/` | Video playback: position persistence, completion tracking |
| `scoreManager` | `managers/` | Course-level scoring (dynamically loaded) |
| `commentManager` | `managers/` | End-of-course comments/ratings |
| `breakpointManager` | `app/` | Responsive breakpoints, `.bp-*` classes |
| `navigationState` | `navigation/` | Current slide, visited slides |

### stateManager: The Sole LMS Gateway

**stateManager** (from `state/index.js`) is the single entry point for all LMS communication. It composes:

| Internal Module | Responsibility |
|----------------|----------------|
| `lms-connection.js` | Driver lifecycle, connection init/terminate, keep-alive |
| `xapi-statement-service.js` | Bridges events to xAPI statements (cmi5 only) |
| `state-domains.js` | Domain CRUD with append-only semantics |
| `state-commits.js` | Auto-batched commit scheduling (500ms debounce) |
| `state-validation.js` | State hydration, migration, validation |
| `transaction-log.js` | Ring buffer for debugging |

> **Compression:** `cmi.suspend_data` is automatically compressed via `lz-string` (UTF16) in the driver layer. This is transparent to all consumers.

#### Domain API

All state access uses the domain pattern:

```javascript
// Read/write domain state — stateManager routes to appropriate storage
stateManager.getDomainState('objectives');     // → cmi.objectives.* (SCORM) or suspend_data (cmi5/LTI)
stateManager.getDomainState('navigation');     // → suspend_data
stateManager.setDomainState('objectives', data);
stateManager.setDomainState('flags', data);

// Semantic LMS methods — no raw CMI access
stateManager.reportScore({ raw: 85, scaled: 0.85, min: 0, max: 100 });
stateManager.reportCompletion('completed');
stateManager.setBookmark('slide-03');
stateManager.flush(); // Commit now, don't wait for debounce
```

> **Rule:** Never bypass `stateManager` for LMS access. Never import `lms-connection.js` directly.

#### Write Batching

LMS writes are auto-batched with a **500ms debounce**. Rapid `setDomainState` calls combine into a single commit. **Critical actions** (exit, terminate) automatically flush pending writes before proceeding.

### flagManager Events

```javascript
eventBus.on('flag:updated', ({ key, value }) => { /* handle */ });
eventBus.on('flag:removed', ({ key }) => { /* handle */ });
```

### State Validation (Course Updates)

Handles LMS data mismatches when course structure changes after learners have started:

| Behavior | Dev Mode | Prod Mode |
|----------|----------|----------|
| Invalid slide in `cmi.location` | Throws error | Reverts to slide 0 |
| Missing assessment questions | Throws error | Filters out missing |
| Orphaned engagement/navigation data | Warns | Silently removes |
| Schema version newer (downgrade) | Throws error | Resets to fresh state |
| Schema version older (upgrade) | Runs migrations | Runs migrations |

**Setup:** `stateManager.setCourseValidationConfig(config)` called in `main.js` before `initialize()`.

**Event:** `state:recovered` emitted when prod mode gracefully recovers.

**Schema versioning:** `STATE_SCHEMA_VERSION` constant in `state-validation.js`. Increment when state structure changes incompatibly.

### Schema Migrations

When incrementing `STATE_SCHEMA_VERSION`, add a migration function in `STATE_MIGRATIONS`:

```javascript
const STATE_MIGRATIONS = {
    2: (state) => {
        // Migrate from v1 → v2: rename 'oldDomain' to 'newDomain'
        if (state.oldDomain) {
            state.newDomain = state.oldDomain;
            delete state.oldDomain;
        }
        return state;
    },
    3: (state) => {
        // Migrate from v2 → v3: restructure nested data
        // ...
        return state;
    }
};
```

**When to add migrations:**
- Renaming domains (`navigation` → `nav`)
- Restructuring nested data paths
- Changing data types (array → object)
- Adding required fields that code expects

**When NOT needed (validation handles):**
- Adding optional fields or new domains
- Adding new slide/interaction types

Migrations run sequentially (v1→v2→v3), so each only handles one version jump.

---

## Logging & Error Handling

**Two complementary systems - use BOTH:**

### Logger (Observability)

```javascript
logger.debug('Initializing slide', { slideId: 'intro' });  // Dev only
logger.info('User action recorded');  // Dev only
logger.warn('Deprecated feature used');  // Dev + Prod
logger.error('Operation failed', error);  // Dev + Prod
```

Global as `logger` or `window.logger` (no import needed). Auto-filtered by environment.

### Event Bus (Error Communication)

**Tiered Error Strategy:**

| Tier | When | Behavior | Example |
|------|------|----------|---------|
| **Tier 1** | Contract violations, programming errors | Always `throw` | Wrong parameter types, API misuse, double-init |
| **Tier 2** | Runtime/init failures (missing DOM, bad config) | `logger.fatal()` → throws in DEV, logs+degrades in PROD | Missing container element, invalid data attributes |
| **Tier 3** | Existing dual-mode functions | Logger + eventBus only | Driver warnings, state persistence failures |

**`logger.fatal(message, context)`** — Tier 2 handler in `framework/js/utilities/logger.js`:

```javascript
if (!container) {
    logger.fatal('initTabs: container not found', { domain: 'ui', operation: 'initTabs' });
    return; // Required — exit the function after calling logger.fatal
}
```

- **DEV**: throws `Error` with formatted message for immediate visibility
- **PROD**: calls `logger.warn()` for graceful degradation

All error events follow the standardized shape:

```javascript
{ domain, operation, message, stack?, context? }
```

**When to catch:** Only to show user notification or cleanup, then MUST re-throw:

```javascript
try {
    objectiveManager.setCompletionStatus('obj', 'completed');
} catch (error) {
    showNotification('Failed to save', 'error');
    throw error;  // Required - no silent failures
}
```

### External Communications

Three optional utilities for outbound communication. All in `framework/js/utilities/`, initialized in `main.js`. Each uses a **priority chain** for configuration:

```
1. <meta name="cc-*"> tag in HTML        → Injected by CourseCode Cloud (highest priority)
2. environment.* in course-config.js     → Author-defined (self-hosted fallback)
3. Skip                                  → Feature disabled (silent)
```

When cloud meta tags are present, they **always win** — even if `course-config.js` also has values. This ensures cloud-served courses always report to the correct endpoints.

| Utility | Config Key | Meta Tag | Transport | Events |
|---------|-----------|----------|-----------|--------|
| `error-reporter.js` | `environment.errorReporting` | `cc-error-endpoint` | POST per error (60s dedup) | `*:error` (14 event types) |
| `data-reporter.js` | `environment.dataReporting` | `cc-data-endpoint` | Batched POST + `sendBeacon` on unload | `assessment:submitted`, `objective:updated`, `interaction:recorded`, `course:statusChanged`, `channel:message` |
| `course-channel.js` | `environment.channel` | `cc-channel-endpoint` + `cc-channel-id` | POST to send, SSE to receive | `channel:message`, `channel:connected`, `channel:disconnected` |

**Error Reporter** — Subscribes to all `*:error` events, deduplicates by domain+operation+message (60s window), POSTs to endpoint. Optional `enableUserReports: true` adds "Report Issue" to settings menu. `submitUserReport()` for programmatic user reports.

**Data Reporter** — Queues assessment/objective/interaction/session/channel records, flushes on batch size (default 10) or timer (default 30s). `sendBeacon` fallback on page unload. Also listens to `course:statusChanged` (queues a `session` record on completion) and `channel:message` (queues a `channel` record). Exposes `CourseCode.reportData(type, data)` for course authors to send custom event types.

**Course Channel** — Generic pub/sub pipe. `sendChannelMessage(data)` POSTs any JSON to `endpoint/channelId`. SSE listener on same URL bridges incoming messages to EventBus. Exponential backoff reconnect (1s → 30s cap). Content-agnostic — the relay is a dumb fan-out router.

```javascript
// Self-hosted config (all optional)
environment: {
    errorReporting: { endpoint: '...', apiKey: '...', includeContext: true, enableUserReports: true },
    dataReporting:  { endpoint: '...', apiKey: '...', batchSize: 10, flushInterval: 30000 },
    channel:        { endpoint: '...', apiKey: '...', channelId: 'session-123' }
}
```

**Cloud meta tags** (injected into `<head>` by CourseCode Cloud):
```html
<meta name="cc-error-endpoint" content="https://engine.example.com/errors">
<meta name="cc-data-endpoint" content="https://engine.example.com/data">
<meta name="cc-channel-endpoint" content="https://engine.example.com/channel">
<meta name="cc-channel-id" content="session-abc123">
<meta name="cc-api-key" content="sk_live_abc123">
<meta name="cc-license-id" content="lic_xyz">
<meta name="cc-course-id" content="course_456">
```

**Authentication** — All reporters support an optional `apiKey` field (from config or `cc-api-key` meta tag). When set, it's sent as `Authorization: Bearer <apiKey>` on `fetch()` calls. For `sendBeacon` (page unload), `fetch()` with `keepalive: true` is used instead since `sendBeacon` doesn't support custom headers. For SSE (`EventSource`), the token is passed as a `?token=` URL parameter.

**Cloud attribution** — When `cc-license-id` and `cc-course-id` meta tags are present (LTI/cmi5 launches), error and data reporters include `licenseId` and `courseId` in all payloads for engine routing.

**Example backends:** `framework/docs/examples/cloudflare-{error-worker,data-worker,channel-relay}.js`

> **Local dev:** Error and data reporters are automatically disabled during watch builds (`coursecode preview`, `coursecode dev`, `npm run dev`). The CLI sets `VITE_COURSECODE_LOCAL=true` in the Vite build env, which the reporters check at init. Production builds (`coursecode build`) do not set this flag.

## Dual-Context Architecture

This codebase serves two roles:

1. **Framework source repo** — where the framework itself is developed (`vite.framework-dev.config.js`, `template/course/` as test content)
2. **Course project template** — `template/` is what course authors get when they create a new project (`template/vite.config.js`, their own `course/`)

| File | Used by | Purpose |
|------|---------|---------|
| `vite.framework-dev.config.js` | Framework developers (this repo) | Builds from `template/course/`, references `lib/` directly |
| `template/vite.config.js` | Course authors (their project) | Builds from `course/`, imports from `coursecode` package |

### Preview Architecture

Preview is **not** part of the build output. It is platform infrastructure, served separately from `dist/`:

| Scenario | Who provides preview? | Where preview lives |
|----------|----------------------|--------------------|
| `coursecode preview` (local) | `preview-server.js` | In-memory, never written to disk |
| `coursecode preview --export` | `preview-export.js` | Separate `course-preview/` directory (copies `dist/` + wraps in stub player) |
| CourseCode Cloud | Cloud platform | Cloud hosts its own stub player, wraps any uploaded `dist/` |
| Self-hosted CDN (proxy) | N/A | User tests locally with `coursecode preview`, CDN serves `dist/` only |

**Key principle:** `dist/` never contains preview/stub player assets. The `--export` flag produces a separate `course-preview/` folder for static hosting (Netlify, GitHub Pages). The stub player is generic — it wraps any course's `index.html` in an iframe with fake LMS APIs.

### Cloud Integration Architecture

The universal build enables cloud platforms to assemble format-specific outputs **without running any framework build tools or user-uploaded code**:

```
User: coursecode build → uploads dist/
                              │
         ┌────────────────────┼─────────────────────┐
         ▼                    ▼                     ▼
    Cloud Preview       Cloud ZIP (SCORM 2004)  Cloud ZIP (SCORM 1.2)
    ┌────────────┐      ┌──────────────────┐    ┌──────────────────┐
    │ Cloud's own │      │ Copy dist/       │    │ Copy dist/       │
    │ stub player │      │ stampFormat      │    │ stampFormat      │
    │ iframes the │      │ generateManifest │    │ generateManifest │
    │ uploaded    │      │ → ZIP            │    │ → ZIP            │
    │ dist/       │      └──────────────────┘    └──────────────────┘
    └────────────┘
```

**Cloud dependencies:** The cloud app imports `stampFormat` and `generateManifest` directly from the `coursecode` npm package. These are pure functions — no filesystem, no Vite, no dynamic imports of user code, no `eval`. All inputs (title, version, file list) come from scanning the uploaded `dist/` or the cloud's own database.

**Security boundary:** The cloud never executes `course-config.js` or any user-authored JavaScript. The meta tag and manifest are the only format-specific artifacts, and both are generated from trusted framework source code.

#### GitHub Source Guard

Courses linked to GitHub for production deploys are protected from accidental CLI overwrites via two layers:

| Layer | Mechanism | Key |
|-------|-----------|-----|
| **CLI (local)** | `deploy()` reads `sourceType` from `.coursecoderc.json` | Fast fail before build — no wasted time |
| **Server (safety net)** | Deploy endpoint rejects non-preview uploads for `source_type = 'github'` | Can't bypass via old CLI or `curl` |

- **`--preview` always allowed** — useful for testing without touching production pointer
- **`.coursecoderc.json`** carries `sourceType` and `githubRepo` (committed to repo by cloud's GitHub integration), so anyone cloning gets the guard automatically
- **Self-healing on unlink:** If the cloud course is unlinked from GitHub, both `status()` and `deploy()` reconcile — they detect the server no longer reports `source_type: 'github'` and clear the local `sourceType`/`githubRepo` from `.coursecoderc.json`. No manual cleanup or repo commit needed.
- CLI error code: `github_source_blocked` (structured JSON for Desktop/CI consumers)

---

## Course Validation

Two linters validate courses at different stages, each in a different environment:

### Runtime Linter (`framework/js/dev/runtime-linter.js`)

Runs **in the browser** during preview when `import.meta.env.DEV === true`. Called from `main.js` before course initialization.

**What it checks (needs a real DOM):**
- Renders each slide to detached DOM, validates engagement requirements match content
- Visual layout: contrast ratios, touch target sizes, nested cards, heading hierarchy
- Component structure validation against schemas
- Assessment config validation
- Audio configuration conflicts (slide audio vs modal audio)

**On failure:** Halts initialization with formatted error showing slide ID and fix needed.

**Production:** Tree-shaken out — never included in production builds.

### Build Linter (`lib/build-linter.js`)

Runs **in Node.js** during build (via `vite.framework-dev.config.js` `closeBundle` hook) and via MCP/CLI.

**What it checks (no DOM needed):**
- Course config validation (structure, objectives, gating conditions)
- CSS class validation via PostCSS — flags hallucinated class names
- Schema-driven requirement validation from source templates
- Duplicate interaction ID detection

**Invoked by:**
- `npm run build` — automatically in `closeBundle` hook
- `coursecode lint` CLI command
- MCP `coursecode_lint` tool

**Errors fail the build; warnings print but don't block.**

### MCP `coursecode_lint` — Build-Time Only

The MCP `coursecode_lint` tool runs the build linter (config validation, CSS class verification, structure checks). It does NOT include runtime errors. For runtime errors and contrast warnings, use `coursecode_errors` (lightweight — just errors and console logs) or `coursecode_state` (full state snapshot including errors).

### Shared Rules (`lib/validation-rules.js`)

Pure validation functions used by **both** linters. No environment-specific code (no DOM, no `fs`). Includes assessment validation, engagement validation, and result formatting.

## Engagement Tracking (Implementation)

All slides MUST have `engagement` config in `course-config.js`.

### Requirement Types

| Type | Required Props | Validates Against |
|------|----------------|-------------------|
| `viewAllTabs` | - | `[data-component="tabs"]` |
| `viewAllPanels` | - | `[data-component="accordion"]` |
| `viewAllFlipCards` | - | `[data-flip-card-id]` |
| `viewAllTimelineEvents` | - | `[data-component="interactive-timeline"]` |
| `viewAllHotspots` | - | `[data-component="interactive-image"]` |
| `viewAllModals` | - | `[data-component="modal-trigger"]` with `data-modal-id` |
| `interactionComplete` | `interactionId`, optional `label` | `[data-interaction-id]` |
| `allInteractionsComplete` | - | Any `[data-interaction-id]` |
| `scrollDepth` | `percentage` | Scroll event tracking |
| `timeOnSlide` | `minSeconds` | Session timer |
| `slideAudioComplete` | - | Slide audio config |
| `audioComplete` | `audioId` | `[data-audio-id]` |
| `modalAudioComplete` | `modalId` | Modal audio config |
| `flag` | `key`, optional `equals` | flagManager |
| `allFlags` | `flags` array | flagManager |

### Tooltip Labels

- **`message`** (engagement-level): Full override of tooltip text
- **`label`** (requirement-level): Custom name in "Complete: X" format (auto-formats from ID if omitted)

### Progress Indicator

When `engagement.required` is `true`, the circular progress indicator displays in the nav footer by default. Set `showIndicator: false` to hide it.

Custom indicators use `EngagementManager` API:
```javascript
const progress = engagementManager.getProgress(slideId);
// Returns: { percentage: 75, items: [{type, label, complete}, ...] }
```

---

## Declarative UI Components

Components auto-initialize via `data-component` attributes. Registration in `framework/js/components/`.

| Component | Attribute | Events Emitted |
|-----------|-----------|----------------|
| Tabs | `data-component="tabs"` | `tab:selected` |
| Accordion | `data-component="accordion"` | `accordion:panel-opened` |
| Carousel | `data-component="carousel"` | `carousel:slide-changed` |
| Collapse | `data-component="collapse"` | `collapse:toggle` |
| Dropdown | `data-component="dropdown"` | `dropdown:change` |
| Modal | `data-component="modal-trigger"` | `modal:opened`, `modal:closed` |
| Flip Card | `data-component="flip-card"` | `flipcard:flipped` |
| Interactive Timeline | `data-component="interactive-timeline"` | `timeline:event-viewed` |
| Toggle Group | `data-component="toggle-group"` | `toggle:change` |
| Checkbox Group | `data-component="checkbox-group"` | `checkbox-group:change` |
| Audio Player | `data-component="audio-player"` | `audio:complete` |
| Video Player | `data-component="video-player"` | `video:complete` |

### Component Catalog

Components and layout patterns are managed via `component-catalog.js`, which mirrors the interaction catalog pattern:

```javascript
// Auto-discovery via import.meta.glob
// framework/js/components/ui-components/*.js  → All built-in components (tabs, accordion, carousel, modal, hero, steps, timeline, etc.)
// course/components/*.js                       → Custom course components
```

**Schema Pattern** - Every component exports a schema for validation:

```javascript
// Example: framework/js/components/ui-components/tabs.js
export const schema = {
    type: 'tabs',
    description: 'Accessible tab interface with keyboard navigation',
    properties: {
        activeClass: { type: 'string', default: 'active' }
    },
    structure: {
        container: '[data-component="tabs"]',
        children: {
            button: { selector: '[data-action="select-tab"]', required: true, minItems: 1 },
            panel: { selector: '.tab-content', required: true }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    engagementTracking: 'viewAllTabs',
    emitsEvents: ['tab:selected']
};

export function initTabs(container) { /* ... */ }
```

**Linter Validation** - The runtime linter validates component structure against schemas during preview.

---

## Automation API

**Access**: `window.CourseCodeAutomation` (dev mode only, tree-shaken in prod)

**Enable** in `course/course-config.js`:
```javascript
environment: {
  automation: { enabled: true, disableBeforeUnloadGuard: true, exposeCorrectAnswers: true }
}
```

**Requirements**: `import.meta.env.MODE !== 'production'` AND `automation.enabled === true`

### API Methods

| Category | Method | Returns/Purpose |
|----------|--------|-----------------|
| **Discovery** | `listInteractions()` | `[{id, type, registeredAt}, ...]` |
| | `getInteractionMetadata(id)` | `{id, type, registeredAt}` |
| **State Access** | `getResponse(id)` | Current response (format varies by type) |
| | `getCorrectResponse(id)` | Correct answer (needs `exposeCorrectAnswers`) |
| **State Mutation** | `setResponse(id, response)` | Sets response |
| **Evaluation** | `checkAnswer(id)` | `{correct, score, feedback, ...}` |
| | `checkSlideAnswers(slideId?)` | `[{interactionId, type, evaluation}, ...]` |
| **Navigation** | `getCourseStructure()` | Structure array from config |
| | `getCurrentSlide()` | Current slide ID or null |
| | `goToSlide(slideId, context?)` | Navigate with optional context |
| **Engagement** | `getEngagementState()` | `{complete, tracked, requirements}` |
| | `getEngagementProgress()` | `{percentage, items: [{label, complete, type}]}` |
| | `markTabViewed(tabId)` | Manually track tab (testing) |
| | `setScrollDepth(percentage)` | Simulate scroll (testing) |
| | `resetEngagement()` | Reset tracking for current slide |
| **Flags** | `getFlag(key)` | Get flag value |
| | `setFlag(key, value)` | Set flag (triggers engagement re-eval) |
| | `getAllFlags()` | All flags as object |
| | `removeFlag(key)` | Remove flag |
| **Audio** | `getAudioState()` | `{currentSrc, position, isPlaying, isMuted, duration}` |
| | `hasAudio()` | Check if audio loaded |
| | `playAudio()` / `pauseAudio()` / `toggleAudio()` | Playback control |
| | `restartAudio()` | Restart from beginning |
| | `seekAudio(seconds)` / `seekAudioToPercentage(pct)` | Seek |
| | `toggleAudioMute()` / `setAudioMuted(bool)` | Mute control |
| | `getAudioProgress()` | Playback percentage |
| **Observability** | `getAutomationTrace()` | `[{timestamp, action, ...}, ...]` |
| | `clearAutomationTrace()` | Clears trace log |
| | `getVersion()` | `{api, phase, features}` |

### Response Formats by Interaction Type

| Type | Format |
|------|--------|
| Multiple Choice | `'a'`, `'b'`, `'c'` |
| True/False | `true` / `false` |
| Fill-in-Blank | `{blankId: 'answer'}` |
| Drag-Drop | `{itemId: zoneId}` |
| Numeric | `1.5` |
| Sequencing | `['id1', 'id2', 'id3']` |
| Likert | `{questionId: 'value'}` |

### data-testid Attributes

**Nav**: `nav-prev`, `nav-next`, `nav-exit`, `nav-menu-toggle`, `nav-menu-item-{slideId}`, `nav-section-{sectionId}`

**Interactions**: `{id}-check-answer`, `{id}-reset`, `{id}-controls`, `{id}-feedback`, `{id}-choice-{index}`, `{id}-blank-{index}`, `{id}-input`, `{id}-drag-item-{itemId}`, `{id}-drop-zone-{zoneId}`

**Assessments**: `assessment-start`, `assessment-nav-{prev|next}`, `assessment-submit`, `assessment-retake`, `assessment-review-question-{index}`
---

## MCP Integration (AI Agent Control)

The MCP server runs a **persistent headless Chrome** internally via `puppeteer-core`. All runtime tools execute directly in this headless browser — agents never need to open a browser.

### Preview Server Ownership

The MCP does **not** start or manage the preview server. The preview must be running before using runtime tools:

- **Human**: run `coursecode preview` (or `npm run preview`) in a terminal
- **AI agent**: use your terminal/command execution tool to run `npm run preview`

If the preview is not running, runtime tools fail fast with a clear error message.

### Setup

1. Start the preview server externally (see above)
2. Add to IDE MCP config:

```json
{ "mcpServers": { "coursecode": { "command": "coursecode", "args": ["mcp"] } } }
```

### How the Headless Browser Works

- On the **first runtime tool call**, the MCP launches headless Chrome and connects to the already-running preview server
- The browser auto-reconnects when Vite rebuilds (file changes trigger SSE reload)
- All tool calls execute instantly via `page.evaluate()` — no manual waits needed

### Runtime Tools (require preview server)

| Tool | Purpose | Returns |
|------|---------|--------|
| `coursecode_state` | Full course snapshot | `{slide, toc, interactions, engagement, lmsState, apiLog, errors, frameworkLogs, consoleLogs}` |
| `coursecode_errors` | Errors + console logs only | `{errors, consoleLogs, count, clean}` — same error sources as `coursecode_state`, without the state payload |
| `coursecode_navigate` | Go to slide by ID | `{slide, interactions, engagement, accessibility}` |
| `coursecode_interact` | Set response + evaluate | `{interactionId, response}` → `{correct, score, feedback}` |
| `coursecode_screenshot` | Visual capture (JPEG) | Optional `slideId` to navigate first, `fullPage` for scroll capture |
| `coursecode_viewport` | Set viewport size | Breakpoint name or `{width, height}` → persists until changed |
| `coursecode_reset` | Clear learner state | No input; clears local state and reloads |

### Screenshot Quality Modes

Two quality modes optimize for token efficiency — **neither changes the viewport**:

| Mode | Quality | Typical Size | Use For |
|------|---------|-------------|---------|
| normal (default) | JPEG@50 | ~20-40KB | Layout checks |
| detailed | JPEG@90 | ~100-200KB | Close text/element inspection |

### Viewport Control

Use `coursecode_viewport` for responsive design testing. Two input modes:

- **Breakpoint name**: `"mobile-portrait"`, `"tablet-landscape"`, etc. — resolved dynamically from the running course's `breakpointManager.getBreakpoints()`, so always in sync with CSS.
- **Explicit dimensions**: `{width: 375, height: 812}` for specific device sizes.

The viewport **persists** until explicitly changed again. Default is 1280×720.

> **AI tip:** For realistic mobile QA, use explicit phone dimensions (for example `{width: 375, height: 812}`) in addition to named breakpoints.

### Navigation API

Use MCP tools for all course interaction — never use external browser tools:

- `coursecode_state` → get all slide IDs, current position, interactions
- `coursecode_navigate(slideId)` → instant slide navigation
- `coursecode_viewport(breakpoint)` → set viewport for responsive testing
- `coursecode_screenshot(slideId)` → navigate + capture in one call
- `coursecode_interact(id, response)` → answer + evaluate in one call

### Architecture

```
MCP Server (IDE) ──puppeteer──▶ Headless Chrome ──HTTP──▶ Preview Server
                                    │
                                    └── Course iframe (CourseCodeAutomation API)
```

- **Preview not running?** → Tools return clear error: "Start preview server first"
- **Chrome not found?** → Install Google Chrome or set `CHROME_PATH` env var

### Pre-Release Responsive Checks (Framework)

Before merging responsive/layout changes:

```bash
npm run prerelease:check
npm run smoke:responsive -- --profile=expanded
```

- `lint:responsive` guards `responsive.css` ownership (no shell/chrome selectors)
- `lint:responsive:structure` enforces layout exclusions/scoping for high-risk shell selectors

---

## Audio Manager (Internals)

Singleton at `framework/js/managers/audio-manager.js`. Manages single audio element.

### Key Behaviors

- **Position Persistence**: Saves position when leaving slide, restores on return
- **Completion Tracking**: Tracks max position reached (handles seeks/replays)
- **Single Instance**: Only one audio plays at a time (slide vs modal vs standalone)
- **Mute Preference**: Mute state persists across session
- **Auto-Pause**: Audio pauses on navigation away or modal close

### API

```javascript
const { audioManager } = CourseCode;

audioManager.play();
audioManager.pause();
audioManager.togglePlayPause();
audioManager.restart();
audioManager.seek(30);  // seconds
audioManager.seekToPercentage(50);
audioManager.toggleMute();
audioManager.getState();  // Full state object
audioManager.hasAudio();
```

### Footer Controls

- **Slide audio**: Full controls (play/pause, restart, progress bar, mute, time)
- **Modal audio**: Compact controls (play/pause, restart, mute only)
- **Standalone**: Full controls inline

---

## Assessment Manager (Internals)

`framework/js/managers/assessment-manager.js`

### Features

- **Question Banks**: Select N questions from categorized banks
- **Randomization**: Shuffle questions and/or re-randomize on retake
- **Progressive Intervention**: Show remedial content after N failures, restart course after M
- **Auto-Linked Objectives**: Updates objective on submission based on score
- **Unanswered Handling**: Confirmation modal or immediate submit (configurable)

### Creation

```javascript
const { AssessmentManager } = CourseCode;

const assessment = AssessmentManager.createAssessment(
  { ...config, questions },  // OR questionBanks for random selection
  overrides
);
assessment.render(container);
```

### Events

```javascript
eventBus.on('assessment:submitted', ({ id, score, passed }) => { });
eventBus.on('assessment:retake', ({ id, attemptNumber }) => { });
```

---

## CSS Architecture

| File | Purpose |
|------|---------|
| `design-tokens.css` | CSS variables (colors, spacing, typography) |
| `01-base.css` | HTML resets, base typography |
| `02-layout.css` | Content width, stacks, columns, splits |
| `components/*.css` | Individual UI component styles (cards, hero, tabs, steps, timeline, etc.) |
| `interactions/*.css` | Interaction-specific styles |
| `utilities/*.css` | Utility classes (spacing, display, flex) |
| `responsive.css` | Shared content/component responsive rules (non-shell) |
| `responsive-structure.css` | App shell/header/footer/nav/audio responsive rules |
| `framework.css` | Main import file, orchestrates all modules |

### Layout System

CSS-only layouts controlled via `data-layout` attribute on `<html>`. Files in `framework/css/layouts/`:

| File | Purpose |
|------|---------|
| `base.css` | Layout tokens, default structure |
| `traditional.css` | Full header, sidebar toggle |
| `article.css` | **Default**: Minimal header, centered content, floating pill nav |
| `focused.css` | Hidden header, centered content, floating pill nav |
| `presentation.css` | Full viewport, edge arrow navigation |
| `canvas.css` | Zero framework CSS — all styles reverted to browser defaults, author BYOs via `theme.css` |

> **Note:** Canvas only strips CSS (`all: revert` on `#slide-container`). All JS infrastructure — navigation, gating, interactions, engagement tracking, and LMS drivers — remains fully functional.

Set via `layout` in `course-config.js`. The `main.js` automatically applies the attribute from config.

### Responsive CSS Ownership

- Put shared content/component responsive rules in `framework/css/responsive.css`.
- Put shell/chrome responsive rules (`#app`, header/brand, footer/nav/audio) in `framework/css/responsive-structure.css`.
- For generic shell selectors, exclude layout-owned behavior (especially `article` and `focused`) unless explicitly layout-scoped.

### Auto-Wrapping

Slides are automatically wrapped with content width class (default: `.content-medium`).

Override per-slide with `data-content-width` attribute or globally via `slideDefaults.contentWidth` in `course-config.js`.

### Document Gallery

`framework/js/navigation/document-gallery.js` — Collapsible sidebar gallery for reference documents.

**Build pipeline:** `vite-plugin-content-discovery.js` scans `course/assets/docs/` and generates `_gallery-manifest.json` at build time. In dev mode, `preview-server.js` generates the manifest dynamically.

**Key files:**

| File | Purpose |
|------|---------|
| `framework/js/navigation/document-gallery.js` | Fetches manifest, renders thumbnails, expand/collapse logic |
| `framework/css/components/document-gallery.css` | 2-column grid, thumbnail variants |
| `lib/vite-plugin-content-discovery.js` | `generateGalleryManifest()` — build-time discovery |

**Behavior:** Expanding gallery collapses nav menu (inverse toggle). Gallery resets to collapsed on sidebar `transitionend` close. Configured via `navigation.documentGallery` in `course-config.js`.

---

## Icons

`framework/js/utilities/icons.js` provides a centralized icon registry. Icons are rendered as SVG strings with no inline width/height - sizing is controlled via CSS classes.

### IconManager API

```javascript
const { iconManager } = CourseCode;

// Basic usage
iconManager.getIcon('menu');  // Returns SVG string

// With options
iconManager.getIcon('check', {
  size: 'lg',           // 'xs'|'sm'|'md'|'lg'|'xl'|'2xl'|'3xl' or px: 12|16|20|24|32|48|64
  class: 'icon-success', // Additional CSS classes
  strokeWidth: 2,        // SVG stroke width (default: 2)
  color: 'currentColor'  // Stroke color (default: currentColor)
});

// Register custom icons
iconManager.register('custom-icon', '<path d="..." />');
iconManager.registerAll({ icon1: '...', icon2: '...' });
```

### Extending via Course

Course authors add custom icons in `course/icons.js`:

```javascript
export const customIcons = {
  'rocket': '<path d="..." />'
};
```

These are automatically registered and available via `iconManager.getIcon('rocket')`.

---

## Breakpoint Manager

`framework/js/utilities/breakpoint-manager.js` - Dynamically applies responsive CSS classes to `<html>`.

### Breakpoints

| Class | Condition | Width |
|-------|-----------|-------|
| `.bp-min-large-desktop` | ≥1440px | Large screens |
| `.bp-max-desktop` | ≤1439px | Desktop and below |
| `.bp-max-tablet-landscape` | ≤1199px | Tablet landscape |
| `.bp-max-tablet-portrait` | ≤1023px | Tablet portrait |
| `.bp-max-mobile-landscape` | ≤767px | Mobile landscape |
| `.bp-max-mobile-portrait` | ≤479px | Mobile portrait |

Multiple classes cascade (e.g., at 600px: `.bp-max-desktop`, `.bp-max-tablet-landscape`, `.bp-max-tablet-portrait`, `.bp-max-mobile-landscape` all applied).

### API

```javascript
import { breakpointManager } from './utilities/breakpoint-manager.js';

breakpointManager.getCurrentBreakpoint();  // 'tablet-portrait'
breakpointManager.isMobile();              // true if ≤767px
breakpointManager.isTablet();              // true if 768-1199px
breakpointManager.isDesktop();             // true if ≥1200px
breakpointManager.isAtMost('tablet-portrait');  // true if ≤1023px
breakpointManager.onChange((newBp, oldBp) => { /* handle */ });
breakpointManager.refresh();               // Force re-evaluation
```

Exposed globally via `CourseCode.breakpointManager`.

---

## Adding New Interaction Types

> **Course Authors:** See "Extending with Plugins" in `framework/docs/USER_GUIDE.md`. Steps below are for framework developers.

1. Create file in `framework/js/components/interactions/`
2. Export `create(container, config)`, `metadata`, and `schema`
3. Register with `catalogInteraction()` in `core/interaction-catalog.js` (auto-discovered via `import.meta.glob`)
4. Add CSS to `framework/css/interactions/`
5. Update automation API if needed for testing support
6. Add to `COURSE_AUTHORING_GUIDE.md` if has author-facing classes

### Required Contract

```javascript
export function create(container, config) {
  // config must have: id, (type-specific props)
  // Must set data-interaction-id on root element
  // Must emit events for state changes
  // Must support getResponse() / setResponse() for automation
  return {
    getResponse: () => currentResponse,
    setResponse: (val) => { /* update UI and state */ },
    checkAnswer: () => ({ correct, score, feedback }),
    reset: () => { /* clear to initial state */ }
  };
}
```
