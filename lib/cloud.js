/**
 * CourseCode Cloud CLI — auth, credentials, HTTP helpers, and cloud commands.
 *
 * Implements the CLI → Cloud integration spec:
 *   login, logout, whoami, courses, deploy, status
 *
 * Zero external dependencies — uses Node 18+ built-in fetch, crypto, readline.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_CLOUD_URL = 'https://www.coursecodecloud.com';
const LOCAL_CLOUD_URL = 'http://localhost:3000';
let useLocal = false;
const CREDENTIALS_DIR = path.join(os.homedir(), '.coursecode');
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'credentials.json');
const PROJECT_CONFIG_DIR = '.coursecode';
const PROJECT_CONFIG_PATH = path.join(PROJECT_CONFIG_DIR, 'project.json');

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes (device code expiry)
const USER_AGENT = `coursecode-cli/${packageJson.version}`;
const ACTIVATION_PATH = '/activate';

// =============================================================================
// SLUG UTILITIES
// =============================================================================

/**
 * Slugify a string for use as a course slug.
 * Rules: lowercase, spaces/underscores → hyphens, strip non-alphanumeric,
 * collapse consecutive hyphens, trim leading/trailing hyphens.
 */
export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolve the course slug.
 * Priority: .coursecode/project.json → directory name (slugified)
 */
function resolveSlug() {
  const projectConfig = readProjectConfig();
  if (projectConfig?.slug) return projectConfig.slug;
  return slugify(path.basename(process.cwd()));
}

// =============================================================================
// CREDENTIALS (global: ~/.coursecode/credentials.json)
// Local mode uses credentials.local.json to avoid clobbering production.
// =============================================================================

function getCredentialsPath() {
  if (useLocal) return path.join(CREDENTIALS_DIR, 'credentials.local.json');
  return CREDENTIALS_PATH;
}

function readCredentials() {
  try {
    const credPath = getCredentialsPath();
    if (!fs.existsSync(credPath)) return null;
    return JSON.parse(fs.readFileSync(credPath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeCredentials(token) {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  const data = JSON.stringify({ token }, null, 2);
  fs.writeFileSync(getCredentialsPath(), data, { mode: 0o600 });
}

function deleteCredentials() {
  try { fs.unlinkSync(getCredentialsPath()); } catch { /* already gone */ }
}

function getCloudUrl() {
  return useLocal ? LOCAL_CLOUD_URL : DEFAULT_CLOUD_URL;
}

/**
 * Enable local mode — route all API calls to LOCAL_CLOUD_URL.
 * Called by CLI when --local flag is passed.
 */
export function setLocalMode() {
  useLocal = true;
}

// =============================================================================
// PROJECT BINDING (local: .coursecode/project.json)
// =============================================================================

function readProjectConfig() {
  try {
    const fullPath = path.join(process.cwd(), PROJECT_CONFIG_PATH);
    if (!fs.existsSync(fullPath)) return null;
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeProjectConfig(data) {
  const dir = path.join(process.cwd(), PROJECT_CONFIG_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const existing = readProjectConfig() || {};
  Object.assign(existing, data);
  fs.writeFileSync(
    path.join(process.cwd(), PROJECT_CONFIG_PATH),
    JSON.stringify(existing, null, 2) + '\n'
  );
}

function updateProjectConfig(mutator) {
  const dir = path.join(process.cwd(), PROJECT_CONFIG_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const fullPath = path.join(process.cwd(), PROJECT_CONFIG_PATH);
  const existing = readProjectConfig() || {};
  const next = mutator({ ...existing }) || existing;
  fs.writeFileSync(fullPath, JSON.stringify(next, null, 2) + '\n');
}

// =============================================================================
// COURSE IDENTITY (committed: .coursecoderc.json → cloudId)
// =============================================================================

/**
 * Read .coursecoderc.json from the project root.
 */
function readRcConfig() {
  try {
    const rcPath = path.join(process.cwd(), '.coursecoderc.json');
    if (!fs.existsSync(rcPath)) return null;
    return JSON.parse(fs.readFileSync(rcPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Merge fields into .coursecoderc.json without clobbering unrelated fields.
 * Use this for any cloud binding state (cloudId, orgId, etc.).
 */
function writeRcConfig(fields) {
  const rcPath = path.join(process.cwd(), '.coursecoderc.json');
  const existing = readRcConfig() || {};
  Object.assign(existing, fields);
  fs.writeFileSync(rcPath, JSON.stringify(existing, null, 2) + '\n');
}

function updateRcConfig(mutator) {
  const rcPath = path.join(process.cwd(), '.coursecoderc.json');
  const existing = readRcConfig() || {};
  const next = mutator({ ...existing }) || existing;
  fs.writeFileSync(rcPath, JSON.stringify(next, null, 2) + '\n');
}

function emitJson(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

function getBindingSnapshot(slug = resolveSlug()) {
  const rcConfig = readRcConfig() || {};
  const projectConfig = readProjectConfig() || {};
  return {
    slug,
    cloudId: rcConfig.cloudId || projectConfig.courseId || null,
    orgId: projectConfig.orgId || rcConfig.orgId || null,
    hasBinding: Boolean(rcConfig.cloudId || projectConfig.courseId),
  };
}

function clearCloudBinding() {
  updateRcConfig((rc) => {
    delete rc.cloudId;
    delete rc.orgId;
    return rc;
  });
  updateProjectConfig((project) => {
    delete project.courseId;
    delete project.orgId;
    return project;
  });
}

function buildStaleBindingPayload({
  slug,
  operation,
  binding,
  bindingCleared = false,
  success = false,
  alreadyDeleted = false,
}) {
  return {
    success,
    error: 'Cloud course was deleted. Local binding is stale.',
    errorCode: 'stale_cloud_binding',
    staleBinding: true,
    bindingCleared,
    repairable: true,
    needsRedeploy: true,
    alreadyDeleted,
    operation,
    suggestedAction: 'redeploy',
    suggestedCommand: 'coursecode deploy --repair-binding',
    repairFlag: '--repair-binding',
    binding,
    slug,
  };
}

async function resolveStaleBinding({
  operation,
  slug,
  options = {},
  promptText,
  onRepaired,
  onDeclined,
  onJson,
}) {
  const binding = getBindingSnapshot(slug);
  if (!binding.hasBinding) return false;

  const payload = buildStaleBindingPayload({ slug, operation, binding });

  if (options.repairBinding) {
    clearCloudBinding();
    return onRepaired(buildStaleBindingPayload({
      slug,
      operation,
      binding,
      bindingCleared: true,
      success: operation === 'delete',
      alreadyDeleted: operation === 'delete',
    }));
  }

  if (options.json || !process.stdin.isTTY) {
    if (onJson) return onJson(payload);
    emitJson(payload);
    return true;
  }

  const answer = await prompt(`${promptText} [Y/n] `);
  if (answer && !['y', 'yes'].includes(answer.toLowerCase())) {
    if (onDeclined) return onDeclined(payload);
    console.log('  Cancelled.\n');
    process.exit(1);
  }

  clearCloudBinding();
  return onRepaired(buildStaleBindingPayload({
    slug,
    operation,
    binding,
    bindingCleared: true,
    success: operation === 'delete',
    alreadyDeleted: operation === 'delete',
  }));
}

// =============================================================================
// HTTP HELPERS
// =============================================================================

/**
 * Make an authenticated request to the Cloud API.
 * Handles User-Agent, Bearer token, and error formatting per §7.
 *
 * @param {string} urlPath - API path (e.g. '/api/cli/whoami')
 * @param {object} options - fetch options (method, body, headers, etc.)
 * @param {string} [token] - Override token (for unauthenticated requests)
 * @returns {Promise<Response>} A Response whose body has been replaced with
 *   the raw text so handleResponse can always call res.text() safely.
 */
async function cloudFetch(urlPath, options = {}, token = null) {
  const headers = {
    'User-Agent': USER_AGENT,
    ...options.headers,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const baseUrl = getCloudUrl();
  const url = `${baseUrl}${urlPath}`;
  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    const host = new URL(baseUrl).host;
    const code = (err && err.cause && err.cause.code) || err?.code;
    console.error(`\n❌ Could not connect to ${host}${code ? ` (${code})` : ''}.`);
    console.error('   Check your internet connection. If on a corporate or school network,');
    console.error(`   ask IT to whitelist ${host}.\n`);
    process.exit(1);
  }

  // Buffer the body once so handleResponse can re-read it, and so we can
  // detect HTML block pages from corporate web filters (Zscaler, etc.).
  const text = await res.text();

  if (isBlockPage(text)) {
    reportBlockPage(text, res);
    process.exit(1);
  }

  return syntheticResponse(text, res.status);
}

/** Quick check whether a response body looks like an HTML block page. */
function isBlockPage(text) {
  const lower = text.toLowerCase();
  return lower.includes('<!doctype') || lower.startsWith('<html');
}

/**
 * Create a minimal synthetic Response that wraps already-buffered text.
 * handleResponse always calls res.text() — this keeps the interface uniform.
 */
function syntheticResponse(text, status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  };
}

/**
 * Print a vendor-specific block page error message.
 *
 * @param {string} body - Raw response body text
 * @param {Response} res - The fetch Response object
 */
function reportBlockPage(body, res) {
  const host = new URL(getCloudUrl()).host;
  const lower = body.toLowerCase();
  if (lower.includes('zscaler')) {
    console.error(`\n❌ ${host} is blocked by Zscaler on your network.`);
  } else if (lower.includes('forcepoint') || lower.includes('websense')) {
    console.error(`\n❌ ${host} is blocked by Forcepoint on your network.`);
  } else if (lower.includes('barracuda')) {
    console.error(`\n❌ ${host} is blocked by Barracuda on your network.`);
  } else {
    console.error(`\n❌ Your network blocked ${host} (HTTP ${res.status}).`);
  }
  console.error(`   Ask your IT team to whitelist: ${host}\n`);
}

/**
 * Handle HTTP error responses per §7.
 * Returns the parsed JSON body, or exits on error.
 *
 * Reads the body as text first so we can detect non-JSON responses. By the
 * time this is called, cloudFetch has already handled block page detection
 * and fallback retry — so text here should always be valid JSON.
 */
async function handleResponse(res, { retryFn, _isRetry = false } = {}) {
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    // Should not happen after cloudFetch filtering — treat as server error
    console.error(`\n❌ Unexpected response from Cloud (HTTP ${res.status}). Try again later.\n`);
    process.exit(1);
  }

  if (res.ok) return body;

  const status = res.status;

  // 401 — invalid token, trigger re-auth and retry once
  if (status === 401 && retryFn && !_isRetry) {
    console.log('\n  ⚠ Session expired. Re-authenticating...\n');
    deleteCredentials();
    await runLoginFlow();
    return retryFn(true);
  }

  return handleResponseError(status, body);
}

/**
 * Handle a known HTTP error status code with a parsed body.
 * Exits the process with an appropriate message.
 */
function handleResponseError(status, body) {
  const message = body?.error || `HTTP ${status}`;

  if (status === 403 || status === 409) {
    console.error(`\n❌ ${message}\n`);
  } else if (status === 404) {
    console.error(`\n❌ ${message === 'Course not found' ? 'Course not found on Cloud.' : message}\n`);
  } else if (status >= 500) {
    console.error('\n❌ Cloud server error. Try again later.\n');
  } else {
    console.error(`\n❌ ${message}\n`);
  }

  process.exit(1);
}

// =============================================================================
// AUTHENTICATION
// =============================================================================

/**
 * Open a URL in the system browser.
 */
function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open'
    : platform === 'win32' ? 'start'
      : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

/**
 * Prompt the user for input via readline.
 */
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run the device code login flow (primary).
 *
 * Flow:
 *   1. POST /api/auth/device  → get { deviceCode, userCode, verificationUri, expiresIn, interval }
 *   2. Display userCode + activation URLs prominently
 *   3. Open browser as a convenience (user can ignore if ZBI isolates it)
 *   4. Poll GET /api/auth/device?code={deviceCode} until token or expiry
 *   5. Store credentials
 *
 * Resilient to Zscaler Browser Isolation: the browser session is fully decoupled
 * from the CLI. The user can open the activation URL in any browser, on any device.
 *
 * Falls back to the legacy nonce flow if the cloud returns 404 (not yet deployed).
 */
async function runLoginFlow({ jsonMode = false } = {}) {
  // Helper: emit a JSON event line (JSON mode) or nothing (normal mode)
  const emit = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
  const log = (...args) => { if (!jsonMode) console.log(...args); };

  // Step 1: Request device code
  const deviceRes = await cloudFetch('/api/auth/device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  // Graceful fallback: cloud not yet updated to support device flow
  if (deviceRes.status === 404) {
    return runLegacyLoginFlow();
  }

  if (!deviceRes.ok) {
    let body = {};
    try { body = JSON.parse(await deviceRes.text()); } catch { /* ignore */ }
    const msg = body.error || `HTTP ${deviceRes.status}`;
    if (jsonMode) { emit({ type: 'error', error: msg }); } else { console.error(`\n❌ Failed to start login: ${msg}\n`); }
    process.exit(1);
  }

  let devicePayload;
  try {
    devicePayload = JSON.parse(await deviceRes.text());
  } catch {
    console.error('\n❌ Unexpected response from Cloud during login. Try again.\n');
    process.exit(1);
  }
  const { deviceCode, userCode, verificationUri, expiresIn, interval } = devicePayload;

  const pollIntervalMs = (interval || 5) * 1000;
  const expiryMs = (expiresIn || 900) * 1000;

  // Derive the activation URL from the server response or fall back to the primary domain
  const primaryActivationUrl = verificationUri || `${getCloudUrl()}${ACTIVATION_PATH}`;

  if (jsonMode) {
    // Emit structured event for GUI to display its own device code UI
    emit({
      type: 'device_code',
      userCode,
      verificationUri: primaryActivationUrl,
      deviceCode,
      expiresIn: expiresIn || 900,
      interval: interval || 5,
    });
  } else {
    // Step 2: Display code prominently
    const line = '─'.repeat(51);
    log(`\n  ┌${line}┐`);
    log('  │  Open this URL in your browser:                   │');
    log(`  │  ${primaryActivationUrl.padEnd(49)}│`);
    log('  │                                                   │');
    log(`  │  Enter your code:  ${userCode.padEnd(31)}│`);
    log('  │                                                   │');
    const expiryMins = Math.round(expiryMs / 60000);
    log(`  │  Expires in ${String(expiryMins + ' minutes').padEnd(37)}│`);
    log(`  └${line}┘\n`);
  }

  // Step 3: Poll for token
  log('  Waiting for authorization...');
  const startTime = Date.now();
  while (Date.now() - startTime < expiryMs) {
    await sleep(pollIntervalMs);

    const pollRes = await cloudFetch(`/api/auth/device?code=${encodeURIComponent(deviceCode)}`);

    if (pollRes.status === 410) {
      const msg = 'Login code expired. Run `coursecode login` to try again.';
      if (jsonMode) { emit({ type: 'error', error: 'expired' }); } else { console.error(`\n❌ ${msg}\n`); }
      process.exit(1);
    }

    if (pollRes.status === 400) {
      let body = {};
      try { body = JSON.parse(await pollRes.text()); } catch { /* ignore */ }
      if (jsonMode) { emit({ type: 'error', error: body.error || 'denied' }); } else { console.error(`\n❌ Login ${body.error || 'failed'}. Run \`coursecode login\` to try again.\n`); }
      process.exit(1);
    }

    if (!pollRes.ok) continue;

    const data = JSON.parse(await pollRes.text());
    if (data.pending) continue;

    if (data.token) {
      writeCredentials(data.token);
      log('  ✓ Logged in successfully\n');
      return data.token;
    }
  }

  const timeoutMsg = 'Login timed out. Run `coursecode login` to try again.';
  if (jsonMode) { emit({ type: 'error', error: 'timeout' }); } else { console.error(`\n❌ ${timeoutMsg}\n`); }
  process.exit(1);
}

/**
 * Legacy nonce-exchange login flow.
 * Used as a fallback when the cloud has not yet deployed the device code endpoint.
 * Can be removed once the device code flow is fully rolled out.
 */
async function runLegacyLoginFlow() {
  const nonce = crypto.randomBytes(32).toString('hex');
  const initialCloudUrl = getCloudUrl();

  console.log('  → Registering session...');
  const createRes = await cloudFetch('/api/auth/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce }),
  });

  if (!createRes.ok) {
    let body = {};
    try { body = JSON.parse(await createRes.text()); } catch { /* ignore */ }
    console.error(`\n❌ Failed to start login: ${body.error || `HTTP ${createRes.status}`}\n`);
    process.exit(1);
  }

  const loginUrl = `${initialCloudUrl}/auth/connect?session=${nonce}`;
  console.log('  → Opening browser for authentication...');
  openBrowser(loginUrl);

  const startTime = Date.now();
  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    const pollRes = await cloudFetch(`/api/auth/connect?session=${nonce}`);

    if (pollRes.status === 410) {
      console.error('\n❌ Login session expired. Try again.\n');
      process.exit(1);
    }

    if (!pollRes.ok) continue;

    const data = JSON.parse(await pollRes.text());
    if (data.pending) continue;

    if (data.token) {
      writeCredentials(data.token);
      console.log('  ✓ Logged in successfully');
      return data.token;
    }
  }

  console.error('\n❌ Login timed out. Try again.\n');
  process.exit(1);
}

/**
 * Ensure the user is authenticated. Auto-triggers login if interactive.
 * In non-interactive environments, exits with an error message.
 * @returns {Promise<string>} The API token
 */
export async function ensureAuthenticated() {
  const creds = readCredentials();
  if (creds?.token) return creds.token;

  // Non-interactive: can't launch browser login — exit with clear error
  if (!process.stdin.isTTY) {
    console.error('\n❌ No Cloud credentials found. Run `coursecode login` first.\n');
    process.exit(1);
  }

  console.log('\n  No Cloud credentials found. Launching login...');
  return runLoginFlow();
}

// =============================================================================
// ORG RESOLUTION (§3)
// =============================================================================

/**
 * Resolve the org and course for a given slug.
 * Returns { orgId, courseId, orgName } or prompts the user.
 */
async function resolveOrgAndCourse(slug, token) {
  // Shared binding (committed): cloudId in .coursecoderc.json.
  // Local binding (per-user): orgId/courseId in .coursecode/project.json.
  // This keeps login global while allowing per-course auth context.
  const rcConfig = readRcConfig();
  const projectConfig = readProjectConfig();
  const rcCloudId = rcConfig?.cloudId;
  const localOrgId = projectConfig?.orgId;
  const localCourseId = projectConfig?.courseId;

  if (rcCloudId && localOrgId) {
    return { orgId: localOrgId, courseId: rcCloudId };
  }

  if (localOrgId && localCourseId) {
    return { orgId: localOrgId, courseId: localCourseId };
  }

  // Call resolve endpoint
  const res = await cloudFetch(`/api/cli/courses/${encodeURIComponent(slug)}/resolve`, {}, token);
  const data = await handleResponse(res);

  // Found in exactly one org
  if (data.found) {
    writeProjectConfig({ slug, orgId: data.orgId, courseId: data.courseId });
    writeRcConfig({ cloudId: data.courseId, orgId: data.orgId });
    return { orgId: data.orgId, courseId: data.courseId, orgName: data.orgName };
  }

  // Ambiguous — exists in multiple orgs
  if (data.ambiguous) {
    console.log(`\n  Course "${slug}" exists in multiple organizations:\n`);
    data.matches.forEach((m, i) => {
      console.log(`    ${i + 1}. ${m.orgName}`);
    });
    const answer = await prompt('\n  Which org? ');
    const idx = parseInt(answer, 10) - 1;
    if (idx < 0 || idx >= data.matches.length) {
      console.error('\n❌ Invalid selection.\n');
      process.exit(1);
    }
    const match = data.matches[idx];
    writeProjectConfig({ slug, orgId: match.orgId, courseId: match.courseId });
    writeRcConfig({ cloudId: match.courseId, orgId: match.orgId });
    return { orgId: match.orgId, courseId: match.courseId, orgName: match.orgName };
  }

  // Not found — auto-create
  const orgs = data.orgs || [];
  if (orgs.length === 0) {
    console.error('\n❌ You don\'t belong to any organizations. Create one at coursecodecloud.com.\n');
    process.exit(1);
  }

  let targetOrg;
  if (orgs.length === 1) {
    targetOrg = orgs[0];
  } else {
    console.log(`\n  Course "${slug}" not found on Cloud. Creating...\n`);
    console.log('  You belong to multiple organizations:\n');
    orgs.forEach((org, i) => {
      console.log(`    ${i + 1}. ${org.name} (${org.role})`);
    });
    const answer = await prompt('\n  Which org? ');
    const idx = parseInt(answer, 10) - 1;
    if (idx < 0 || idx >= orgs.length) {
      console.error('\n❌ Invalid selection.\n');
      process.exit(1);
    }
    targetOrg = orgs[idx];
  }

  return { orgId: targetOrg.id, courseId: null, orgName: targetOrg.name };
}

// =============================================================================
// FORMAT HELPERS
// =============================================================================

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function formatDeploymentSummary(deployment) {
  if (!deployment) return 'none';
  const parts = [deployment.versionTimestamp || deployment.deploymentId];
  if (deployment.source) parts.push(deployment.source);
  if (deployment.previewOnly) parts.push('preview-only');
  if (deployment.fileCount != null) parts.push(`${deployment.fileCount} files`);
  if (deployment.commitSha) parts.push(deployment.commitSha.slice(0, 7));
  return parts.join(' | ');
}

function formatPreviewState(state) {
  if (!state) return 'missing';
  return state.replace('_', ' ');
}

function printPreviewLinkDetails(previewLink) {
  if (!previewLink || !previewLink.exists) {
    console.log('Preview Link:   missing');
    return;
  }

  console.log(`Preview Link:   ${formatPreviewState(previewLink.state)}`);
  console.log(`                ${previewLink.url}`);
  if (previewLink.expiresAt) console.log(`                Expires ${formatDate(previewLink.expiresAt)}`);
  console.log(`                Format ${previewLink.format} | ${previewLink.hasPassword ? 'password protected' : 'no password'} | ${previewLink.source}`);
}

// =============================================================================
// CLI COMMANDS
// =============================================================================

/**
 * coursecode login — explicit (re-)authentication
 */
export async function login(options = {}) {
  const jsonMode = Boolean(options.json);
  if (!jsonMode) console.log('\n🔑 Logging in to CourseCode Cloud...\n');
  await runLoginFlow({ jsonMode });

  // Show who they are
  const token = readCredentials()?.token;
  if (token) {
    const res = await cloudFetch('/api/cli/whoami', {}, token);
    if (res.ok) {
      const data = JSON.parse(await res.text());
      if (jsonMode) {
        process.stdout.write(JSON.stringify({ type: 'success', email: data.email, name: data.full_name }) + '\n');
      } else {
        console.log(`  ✓ Logged in as ${data.full_name} (${data.email})\n`);
      }
      return;
    }
  }
  if (!jsonMode) console.log('');
}

/**
 * coursecode logout — delete Cloud credentials
 */
export async function logout(options = {}) {
  deleteCredentials();

  if (options.json) {
    process.stdout.write(JSON.stringify({ success: true }) + '\n');
  } else {
    console.log('\n✓ Logged out of CourseCode Cloud.\n');
  }
}

/**
 * coursecode whoami — show user info and orgs
 */
export async function whoami(options = {}) {
  await ensureAuthenticated();

  const makeRequest = async (_isRetry = false) => {
    const token = readCredentials()?.token;
    const res = await cloudFetch('/api/cli/whoami', {}, token);
    return handleResponse(res, { retryFn: makeRequest, _isRetry });
  };

  const data = await makeRequest();

  if (options.json) {
    console.log(JSON.stringify(data));
    return;
  }

  console.log(`\n✓ Logged in as ${data.full_name} (${data.email})`);
  if (data.orgs?.length) {
    console.log('  Organizations:');
    for (const org of data.orgs) {
      console.log(`    ${org.name} (${org.role})`);
    }
  }
  console.log('');
}

/**
 * coursecode courses — list courses across all orgs
 */
export async function listCourses(options = {}) {
  await ensureAuthenticated();

  const makeRequest = async (_isRetry = false) => {
    const token = readCredentials()?.token;
    const res = await cloudFetch('/api/cli/courses', {}, token);
    return handleResponse(res, { retryFn: makeRequest, _isRetry });
  };

  const courses = await makeRequest();

  if (options.json) {
    process.stdout.write(JSON.stringify(courses) + '\n');
    return;
  }

  if (!courses.length) {
    console.log('\n  No courses found. Deploy one with: coursecode deploy\n');
    return;
  }

  // Group by org
  const byOrg = {};
  for (const course of courses) {
    const org = course.orgName || 'Unknown';
    if (!byOrg[org]) byOrg[org] = [];
    byOrg[org].push(course);
  }

  console.log('');
  for (const [orgName, orgCourses] of Object.entries(byOrg)) {
    console.log(`${orgName}:`);
    for (const c of orgCourses) {
      const repo = c.github_repo ? `GitHub: ${c.github_repo}` : '—';
      console.log(`  ${c.slug.padEnd(22)} ${(c.source_type || '').padEnd(13)} ${repo}`);
    }
    console.log('');
  }
}

/**
 * Translate low-level fetch/undici errors from R2 PUTs into a friendly,
 * actionable CLI error. Identifies the failing file and host, and attaches
 * a hint when the cause is a known network condition (connect timeout, DNS,
 * reset, TLS). The original error is preserved on `.cause`.
 */
function wrapUploadError(err, item) {
  let host = '';
  try { host = new URL(item.uploadUrl).host; } catch {}
  const cause = err && err.cause;
  const code = (cause && cause.code) || err.code || err.name;

  let summary = `Failed to upload ${item.filePath}`;
  let hint = '';

  switch (code) {
    case 'UND_ERR_CONNECT_TIMEOUT':
    case 'ETIMEDOUT':
    case 'TimeoutError':
      summary += ` — could not reach ${host} (connect timeout)`;
      hint = [
        'This is a network problem between your machine and Cloudflare R2, not the Cloud service.',
        'Try:',
        '  • If on VPN or a corporate/school network, disconnect or whitelist *.r2.cloudflarestorage.com',
        '  • Re-run with IPv4 first:  NODE_OPTIONS=--dns-result-order=ipv4first coursecode deploy',
        '  • Test connectivity:       curl -v https://' + host + '/',
      ].join('\n  ');
      break;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      summary += ` — DNS lookup failed for ${host}`;
      hint = 'Check your internet connection and DNS settings (e.g. switch to 1.1.1.1 or 8.8.8.8).';
      break;
    case 'ECONNRESET':
    case 'UND_ERR_SOCKET':
      summary += ` — connection to ${host} was reset mid-transfer`;
      hint = 'Likely a flaky network or proxy interfering with the upload. Re-run the deploy.';
      break;
    case 'CERT_HAS_EXPIRED':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
      summary += ` — TLS handshake with ${host} failed (${code})`;
      hint = 'A SSL-inspecting proxy (e.g. Zscaler) is intercepting the connection. Trust the corporate root CA or whitelist *.r2.cloudflarestorage.com.';
      break;
    default:
      summary += ` — ${err.message || code || 'unknown error'}`;
  }

  const wrapped = new Error(hint ? `${summary}\n  ${hint}` : summary);
  wrapped.cause = err;
  wrapped.isUploadError = true;
  return wrapped;
}

/**
 * coursecode deploy — build, read files, batch presign + upload + finalize
 */
export async function deploy(options = {}) {
  const { validateProject } = await import('./project-utils.js');
  validateProject();

  await ensureAuthenticated();
  const slug = resolveSlug();
  const log = (...args) => { if (!options.json) console.log(...args); };
  const logErr = (...args) => { if (!options.json) console.error(...args); };
  const emitProgress = (stage, uploaded, total) => {
    if (options.json) process.stdout.write(JSON.stringify({ type: 'progress', stage, uploaded, total }) + '\n');
  };

  // Preflight a cached binding so deleted cloud courses can be repaired
  // before we spend time building and uploading.
  const binding = getBindingSnapshot(slug);
  if (binding.hasBinding && binding.orgId) {
    const statusRes = await cloudFetch(
      `/api/cli/courses/${encodeURIComponent(slug)}/status?orgId=${binding.orgId}`,
      {},
      readCredentials()?.token
    );

    if (statusRes.status === 404) {
      const handled = await resolveStaleBinding({
        operation: 'deploy',
        slug,
        options,
        promptText: '\n  This project is still linked locally, but the Cloud course was deleted. Clear the stale binding and rebuild/redeploy?',
        onRepaired: () => false,
        onDeclined: () => {
          logErr('\n❌ Deploy cancelled. Local binding still points to a deleted Cloud course.\n');
          process.exit(1);
        },
        onJson: (payload) => {
          emitJson(payload);
          console.error('\n❌ Cloud course was deleted. Re-run deploy with --repair-binding to clear the stale binding first.\n');
          process.exit(1);
        },
      });
      if (handled) return;
    } else if (!statusRes.ok) {
      await handleResponse(statusRes);
    } else {
      // Reconcile local sourceType with cloud truth (handles unlink-via-dashboard)
      try {
        const statusData = JSON.parse(await statusRes.text());
        const serverSourceType = statusData.source?.type || statusData.source_type;
        const localRc = readRcConfig();
        if (localRc?.sourceType === 'github' && serverSourceType !== 'github') {
          updateRcConfig((rc) => {
            delete rc.sourceType;
            delete rc.githubRepo;
            return rc;
          });
          log('  ℹ️  GitHub link removed on Cloud — updated local config.\n');
        }
      } catch { /* non-critical — guard will use whatever rcConfig has */ }
    }
  }

  // Block production deploys for GitHub-linked courses
  const rcConfig = readRcConfig();
  if (rcConfig?.sourceType === 'github') {
    if (options.preview) {
      log('  ℹ️  GitHub-linked course — deploying preview only.\n');
    } else {
      const repo = rcConfig.githubRepo || 'unknown';
      logErr('\n❌ This course deploys to production via GitHub, not CLI.');
      logErr(`   Repo: ${repo}`);
      logErr('   Push to your repo to trigger a production deploy.');
      logErr('   Use --preview to deploy a preview build via CLI.\n');
      if (options.json) {
        process.stdout.write(JSON.stringify({
          success: false,
          error: 'Production deploy blocked — course is GitHub-linked',
          errorCode: 'github_source_blocked',
          githubRepo: repo,
          hint: 'Use --preview for preview deploys, or push to GitHub for production.',
        }) + '\n');
      }
      process.exit(1);
    }
  }

  // Validate mutually exclusive flags
  if (options.promote && options.stage) {
    logErr('\n❌ --promote and --stage are mutually exclusive.\n');
    if (options.json) process.stdout.write(JSON.stringify({ success: false, error: '--promote and --stage are mutually exclusive' }) + '\n');
    process.exit(1);
  }

  // Determine promote_mode and preview_force
  const promoteMode = options.promote ? 'promote' : options.stage ? 'stage' : 'auto';
  const previewForce = !!options.preview;
  const previewOnly = previewForce && promoteMode === 'auto';
  let previewPassword;
  if (options.password !== undefined) {
    if (!previewForce) {
      logErr('\n❌ --password requires --preview.\n');
      if (options.json) process.stdout.write(JSON.stringify({ success: false, error: '--password requires --preview' }) + '\n');
      process.exit(1);
    }
    previewPassword = options.password;
    if (previewPassword === true || previewPassword === '') {
      if (options.json) {
        logErr('\n❌ --password requires a value when using --json.\n');
        process.stdout.write(JSON.stringify({ success: false, error: '--password requires a value when using --json' }) + '\n');
        process.exit(1);
      }
      previewPassword = await prompt('  Preview password: ');
    }
    if (!previewPassword) {
      logErr('\n❌ Preview password cannot be empty.\n');
      if (options.json) process.stdout.write(JSON.stringify({ success: false, error: 'Preview password cannot be empty' }) + '\n');
      process.exit(1);
    }
  }

  log('\n📦 Building...\n');
  emitProgress('building');

  // Step 1: Build
  const { build } = await import('./build.js');
  await build({ ...options, _skipValidation: true });

  // Step 2: Verify dist/ exists
  const distPath = path.join(process.cwd(), 'dist');
  if (!fs.existsSync(distPath)) {
    logErr('\n❌ Build did not produce a dist/ directory.\n');
    if (options.json) process.stdout.write(JSON.stringify({ success: false, error: 'Build did not produce a dist/ directory' }) + '\n');
    process.exit(1);
  }

  // Step 3: Resolve org + ensure course exists
  const { orgId, courseId: existingCourseId, orgName } = await resolveOrgAndCourse(slug, readCredentials()?.token);
  const displayOrg = orgName ? ` to ${orgName}` : '';

  // Ensure course exists on Cloud (resolve or create)
  const ensureRes = await cloudFetch(
    `/api/cli/courses/${encodeURIComponent(slug)}/ensure`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    },
    readCredentials()?.token
  );
  const ensureData = await handleResponse(ensureRes);
  const courseId = ensureData.courseId || existingCourseId;

  // Server-side safety net: reject non-preview deploys for GitHub-linked courses
  if (ensureData.githubRepo && !previewOnly) {
    logErr('\n❌ This course deploys to production via GitHub, not CLI.');
    logErr(`   Repo: ${ensureData.githubRepo}`);
    logErr('   Push to your repo to trigger a production deploy.');
    logErr('   Use --preview to deploy a preview build via CLI.\n');
    if (options.json) {
      process.stdout.write(JSON.stringify({
        success: false,
        error: 'Production deploy blocked — course is GitHub-linked',
        errorCode: 'github_source_blocked',
        githubRepo: ensureData.githubRepo,
        hint: 'Use --preview for preview deploys, or push to GitHub for production.',
      }) + '\n');
    }
    process.exit(1);
  }

  // Step 4: Read dist/ files
  const distFiles = collectDistFiles(distPath);
  const totalSize = distFiles.reduce((sum, f) => sum + f.size, 0);

  let modeLabel;
  if (previewOnly) {
    modeLabel = 'preview only';
  } else if (options.promote && options.preview) {
    modeLabel = 'force-promote + preview';
  } else if (options.stage && options.preview) {
    modeLabel = 'staged + preview';
  } else if (options.promote) {
    modeLabel = 'force-promote';
  } else if (options.stage) {
    modeLabel = 'staged';
  } else {
    modeLabel = 'production';
  }
  log(`\nDeploying ${slug}${displayOrg} [${modeLabel}] — ${distFiles.length} files, ${formatBytes(totalSize)}\n`);

  // Step 5: Batch presign
  const presignRes = await cloudFetch(
    `/api/courses/${courseId}/upload/presign/batch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: distFiles.map(f => ({ path: f.relativePath, contentType: guessContentTypeLocal(f.relativePath) })),
        totalSize,
      }),
    },
    readCredentials()?.token
  );
  const presignData = await handleResponse(presignRes);

  // Step 6: Upload files to R2 via presigned URLs
  emitProgress('uploading', 0, distFiles.length);
  log('  Uploading files...');

  const CONCURRENCY = 8;
  const MAX_RETRIES = 3;
  let uploaded = 0;

  const uploadQueue = presignData.uploads.map((u, i) => ({
    uploadUrl: u.uploadUrl,
    filePath: path.join(distPath, distFiles[i].relativePath),
    contentType: guessContentTypeLocal(distFiles[i].relativePath),
  }));

  // Concurrent upload with retry
  const chunks = [];
  for (let i = 0; i < uploadQueue.length; i += CONCURRENCY) {
    chunks.push(uploadQueue.slice(i, i + CONCURRENCY));
  }

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (item) => {
      const fileData = fs.readFileSync(item.filePath);
      let lastErr = null;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          // 60s per attempt covers slow links; default undici connect timeout
          // is only 10s which can fail spuriously on flaky networks/VPNs.
          const putRes = await fetch(item.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': item.contentType },
            body: fileData,
            signal: AbortSignal.timeout(60_000),
          });
          if (!putRes.ok) {
            throw new Error(`R2 responded ${putRes.status} ${putRes.statusText}`);
          }
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt === MAX_RETRIES - 1) break;
          // Exponential backoff with jitter: ~1s, ~2s, ~4s.
          const base = 1000 * Math.pow(2, attempt);
          const jitter = Math.floor(Math.random() * 500);
          await new Promise(r => setTimeout(r, base + jitter));
        }
      }
      if (lastErr) {
        throw wrapUploadError(lastErr, item);
      }
      uploaded++;
      emitProgress('uploading', uploaded, distFiles.length);
      if (!options.json && process.stdout.isTTY) {
        process.stdout.write(`\r  Uploading ${uploaded}/${distFiles.length} files...`);
      }
    }));
  }

  if (!options.json && process.stdout.isTTY) process.stdout.write('\n');
  log(`  ✓ Uploaded ${uploaded} files`);

  // Step 7: Finalize
  emitProgress('finalizing');

  const finalizeBody = {
    versionTimestamp: presignData.versionTimestamp,
    filename: slug,
    fileCount: distFiles.length,
    totalSize,
    promoteMode,
    previewForce,
    previewOnly,
  };
  if (previewPassword) finalizeBody.previewPassword = previewPassword;
  if (options.message) finalizeBody.message = options.message;

  const finalizeRes = await cloudFetch(
    `/api/courses/${courseId}/upload/finalize`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalizeBody),
    },
    readCredentials()?.token
  );
  const result = await handleResponse(finalizeRes);

  // Step 8: Persist per-user binding
  writeProjectConfig({ slug, orgId: ensureData.orgId || orgId, courseId });
  writeRcConfig({
    cloudId: courseId,
    orgId: ensureData.orgId || orgId,
  });

  // Step 9: Display result
  const appUrl = getCloudUrl();
  const dashboardUrl = `${appUrl}/dashboard/courses/${courseId}`;

  if (options.json) {
    process.stdout.write(JSON.stringify({
      type: 'result',
      success: true,
      courseId,
      slug,
      mode: previewOnly ? 'preview' : 'production',
      fileCount: distFiles.length,
      size: totalSize,
      deploymentId: result.deploymentId,
      promoted: result.promoted,
      previewPromoted: result.previewPromoted,
      previewUrl: result.previewUrl,
      dashboardUrl,
    }) + '\n');
  } else if (previewOnly) {
    console.log(`✓ Preview deployed (${distFiles.length} files)`);
    if (result.previewUrl) console.log(`  Preview URL: ${result.previewUrl}`);
    console.log(`  Dashboard:   ${dashboardUrl}`);
  } else {
    const prodTag = result.promoted ? 'live' : 'staged';
    const previewTag = result.previewPromoted ? ' + preview' : '';
    console.log(`✓ Deployed (${distFiles.length} files) — ${prodTag}${previewTag}`);
    if (!result.promoted) {
      console.log('  Production pointer not updated. Promote from Deploy History or run:');
      console.log('  coursecode promote --production');
    }
    if (result.previewPromoted) {
      console.log('  Preview pointer updated.');
    }
    console.log(`  Dashboard: ${dashboardUrl}`);
  }
  console.log('');
}

/** Recursively collect all files in a directory with relative paths and sizes. */
export function collectDistFiles(dirPath, basePath = '') {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.name === '__MACOSX' || entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      files.push(...collectDistFiles(fullPath, relativePath));
    } else {
      files.push({
        relativePath,
        fullPath,
        size: fs.statSync(fullPath).size,
      });
    }
  }
  return files;
}

/** Minimal content-type guesser for CLI uploads. */
export function guessContentTypeLocal(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const types = {
    html: 'text/html', htm: 'text/html', css: 'text/css',
    js: 'application/javascript', mjs: 'application/javascript',
    json: 'application/json', xml: 'application/xml',
    svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
    jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg',
    wav: 'audio/wav', woff: 'font/woff', woff2: 'font/woff2',
    ttf: 'font/ttf', pdf: 'application/pdf', txt: 'text/plain',
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * coursecode promote — promote a deployment to production or preview
 */
export async function promote(options = {}) {
  await ensureAuthenticated();
  const slug = resolveSlug();
  const rcConfig = readRcConfig();

  // Validate target flag
  if (!options.production && !options.preview) {
    console.error('\n❌ Specify a target: --production or --preview\n');
    process.exit(1);
  }
  if (options.production && options.preview) {
    console.error('\n❌ Specify only one target: --production or --preview\n');
    process.exit(1);
  }
  const target = options.production ? 'production' : 'preview';

  // Resolve deployment ID interactively if not provided
  let deploymentId = options.deployment;
  if (!deploymentId) {
    const orgQuery = rcConfig?.orgId ? `?orgId=${rcConfig.orgId}` : '';
    const makeVersionsRequest = async (_isRetry = false) => {
      const token = readCredentials()?.token;
      const res = await cloudFetch(
        `/api/cli/courses/${encodeURIComponent(slug)}/versions${orgQuery}`,
        {},
        token
      );
      return handleResponse(res, { retryFn: makeVersionsRequest, _isRetry });
    };
    const data = await makeVersionsRequest();
    const deployments = data.deployments ?? [];

    if (deployments.length === 0) {
      console.error('\n❌ No deployments found for this course.\n');
      process.exit(1);
    }

    console.log(`\n  Deployments for ${slug}:\n`);
    deployments.slice(0, 10).forEach((d, i) => {
      const marker = d.id === data.production_deployment_id
        ? ' [production]'
        : d.id === data.preview_deployment_id
          ? ' [preview]'
          : '';
      console.log(`    ${i + 1}. ${new Date(d.created_at).toLocaleString()} — ${d.file_count} files${marker}`);
    });

    const answer = await prompt('\n  Which deployment to promote? ');
    const idx = parseInt(answer, 10) - 1;
    if (idx < 0 || idx >= deployments.length) {
      console.error('\n❌ Invalid selection.\n');
      process.exit(1);
    }
    deploymentId = deployments[idx].id;
  }

  const reason = options.message || `Promoted to ${target} via CLI`;

  const makeRequest = async (_isRetry = false) => {
    const token = readCredentials()?.token;
    const res = await cloudFetch(
      `/api/cli/courses/${encodeURIComponent(slug)}/promote`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deployment_id: deploymentId, target, reason }),
      },
      token
    );
    return handleResponse(res, { retryFn: makeRequest, _isRetry });
  };

  const token = readCredentials()?.token;
  const firstRes = await cloudFetch(
    `/api/cli/courses/${encodeURIComponent(slug)}/promote`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deployment_id: deploymentId, target, reason }),
    },
    token
  );

  if (firstRes.status === 404 && getBindingSnapshot(slug).hasBinding) {
    const handled = await resolveStaleBinding({
      operation: 'promote',
      slug,
      options,
      promptText: '\n  This project is still linked locally, but the Cloud course was deleted. Clear the stale binding?',
      onRepaired: (payload) => {
        if (options.json) {
          emitJson(payload);
        } else {
          console.log('\n  Cleared stale Cloud binding.');
          console.log('  The course is no longer deployed. Run `coursecode deploy` before promoting.\n');
        }
        return true;
      },
      onDeclined: () => {
        console.error('\n❌ Promote cancelled. Local binding still points to a deleted Cloud course.\n');
        process.exit(1);
      },
      onJson: (payload) => {
        emitJson(payload);
        console.error('\n❌ Cloud course was deleted. Deploy again before promoting.\n');
        process.exit(1);
      },
    });
    if (handled) return;
  }

  const result = await handleResponse(firstRes, { retryFn: makeRequest, _isRetry: false });

  if (options.json) {
    process.stdout.write(JSON.stringify({ success: true, ...result }) + '\n');
    return;
  }

  if (result.already_promoted) {
    console.log(`\n  Already the active ${target} deployment. Nothing to do.\n`);
    return;
  }

  console.log(`\n✓ Promoted to ${target}`);
  if (result.url) {
    console.log(`  Preview URL: ${result.url}`);
  }
  console.log('');
}

/**
 * coursecode status — show deployment status for current course
 */
export async function status(options = {}) {
  await ensureAuthenticated();
  const slug = resolveSlug();

  const rcConfig = readRcConfig();
  const orgQuery = rcConfig?.orgId ? `?orgId=${rcConfig.orgId}` : '';

  const makeRequest = async (_isRetry = false) => {
    const token = readCredentials()?.token;
    const res = await cloudFetch(
      `/api/cli/courses/${encodeURIComponent(slug)}/status${orgQuery}`,
      {},
      token
    );
    return handleResponse(res, { retryFn: makeRequest, _isRetry });
  };

  const token = readCredentials()?.token;
  const firstRes = await cloudFetch(
    `/api/cli/courses/${encodeURIComponent(slug)}/status${orgQuery}`,
    {},
    token
  );

  if (firstRes.status === 404 && getBindingSnapshot(slug).hasBinding) {
    const handled = await resolveStaleBinding({
      operation: 'status',
      slug,
      options,
      promptText: '\n  This project is still linked locally, but the Cloud course was deleted. Clear the stale binding?',
      onRepaired: (payload) => {
        const result = {
          ...payload,
          success: true,
          deployed: false,
          message: 'Local stale Cloud binding cleared. This course is no longer deployed.',
        };
        if (options.json) {
          emitJson(result);
        } else {
          console.log('\n  Cleared stale Cloud binding.');
          console.log('  This course is no longer deployed. Run `coursecode deploy` to create a new Cloud deployment.\n');
        }
        return true;
      },
      onJson: (payload) => {
        emitJson(payload);
        return true;
      },
    });
    if (handled) return;
  }

  const data = await handleResponse(firstRes, { retryFn: makeRequest, _isRetry: false });

  // Reconcile local sourceType with cloud truth (handles unlink-via-dashboard)
  const localRc = readRcConfig();
  const serverSourceType = data.source?.type || data.source_type;
  if (localRc?.sourceType === 'github' && serverSourceType !== 'github') {
    updateRcConfig((rc) => {
      delete rc.sourceType;
      delete rc.githubRepo;
      return rc;
    });
    if (!options.json) {
      console.log('  ℹ️  GitHub link removed on Cloud — updated local config.\n');
    }
  }

  if (options.json) {
    process.stdout.write(JSON.stringify(data) + '\n');
    return;
  }

  console.log(`\n${data.slug} — ${data.name} (${data.orgName})\n`);

  const sourceType = data.source?.type || data.source_type;
  const githubRepo = data.source?.githubRepo || data.github_repo;
  if (sourceType === 'github' && githubRepo) {
    console.log(`Source:         GitHub — ${githubRepo}`);
    console.log('                production=github | preview=cli+github');
  } else if (sourceType) {
    console.log(`Source:         ${sourceType}`);
  }

  if (data.courseId) console.log(`Course ID:      ${data.courseId}`);

  if (data.lastDeploy) {
    console.log(`Last deploy:    ${formatDate(data.lastDeploy)} (${data.lastDeployFileCount} files, ${formatBytes(data.lastDeploySize)})`);
  } else {
    console.log('Last deploy:    Never');
  }

  console.log(`Production:     ${formatDeploymentSummary(data.production)}`);
  console.log(`Preview Ptr:    ${formatDeploymentSummary(data.previewPointer)}`);
  if (data.health) {
    console.log(`Pointer Drift:  ${data.health.previewMatchesProduction ? 'preview matches production' : 'preview differs from production'}`);
  }
  if (data.deployModes) {
    console.log(`Deploy Modes:   production=${data.deployModes.production} | preview=${data.deployModes.preview}`);
  }

  if (data.activity?.errorCount24h != null) console.log(`Errors (24h):   ${data.activity.errorCount24h}`);
  else if (data.errorCount24h != null) console.log(`Errors (24h):   ${data.errorCount24h}`);

  if (data.activity?.launchCount24h != null) console.log(`Launches (24h): ${data.activity.launchCount24h}`);
  else if (data.launchCount24h != null) console.log(`Launches (24h): ${data.launchCount24h}`);

  if (data.activity?.lastErrorAt) console.log(`Last error:     ${formatDate(data.activity.lastErrorAt)}`);
  if (data.activity?.lastLaunchAt) console.log(`Last launch:    ${formatDate(data.activity.lastLaunchAt)}`);

  printPreviewLinkDetails(data.previewLink);

  console.log('');
}

/**
 * coursecode deployments — list recent deployments for the current course
 */
export async function deployments(options = {}) {
  await ensureAuthenticated();
  const slug = resolveSlug();
  const rcConfig = readRcConfig();
  const orgQuery = rcConfig?.orgId ? `?orgId=${rcConfig.orgId}` : '';

  const makeRequest = async (_isRetry = false) => {
    const token = readCredentials()?.token;
    const res = await cloudFetch(
      `/api/cli/courses/${encodeURIComponent(slug)}/versions${orgQuery}`,
      {},
      token
    );
    return handleResponse(res, { retryFn: makeRequest, _isRetry });
  };

  const data = await makeRequest();

  if (options.json) {
    process.stdout.write(JSON.stringify(data) + '\n');
    return;
  }

  const rows = data.deployments ?? [];
  if (rows.length === 0) {
    console.log('\nNo deployments found for this course.\n');
    return;
  }

  console.log(`\n${slug} — Recent Deployments\n`);
  rows.forEach((deployment, index) => {
    const marker = deployment.id === data.production_deployment_id
      ? ' [production]'
      : deployment.id === data.preview_deployment_id
        ? ' [preview]'
        : '';
    const flags = deployment.preview_only ? 'preview-only' : deployment.source;
    console.log(`  ${index + 1}. ${formatDate(deployment.created_at)} — ${deployment.file_count} files, ${formatBytes(deployment.total_size)} — ${flags}${marker}`);
  });
  console.log('');
}

/**
 * coursecode preview-link — show or update the current preview link
 */
export async function previewLink(options = {}) {
  await ensureAuthenticated();
  const slug = resolveSlug();
  const rcConfig = readRcConfig();
  const orgQuery = rcConfig?.orgId ? `?orgId=${rcConfig.orgId}` : '';

  if (options.enable && options.disable) {
    console.error('\n❌ Specify only one of --enable or --disable\n');
    process.exit(1);
  }

  if (options.password !== undefined && options.removePassword) {
    console.error('\n❌ --password and --remove-password are mutually exclusive\n');
    process.exit(1);
  }

  if (options.expiresAt && options.expiresInDays) {
    console.error('\n❌ Specify only one of --expires-at or --expires-in-days\n');
    process.exit(1);
  }

  if (options.format && !['cmi5', 'scorm2004', 'scorm1.2'].includes(options.format)) {
    console.error('\n❌ Preview format must be one of: cmi5, scorm2004, scorm1.2\n');
    process.exit(1);
  }

  const hasMutation = Boolean(
    options.enable
    || options.disable
    || options.password !== undefined
    || options.removePassword
    || options.format
    || options.expiresAt
    || options.expiresInDays
  );

  const body = {};
  if (hasMutation) {
    if (options.enable) body.enabled = true;
    if (options.disable) body.enabled = false;
    if (options.format) body.format = options.format;
    if (options.expiresAt) body.expires_at = options.expiresAt;
    if (options.expiresInDays) {
      const days = Number.parseInt(String(options.expiresInDays), 10);
      if (!Number.isFinite(days) || days <= 0) {
        console.error('\n❌ --expires-in-days must be a positive integer\n');
        process.exit(1);
      }
      body.expires_at = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    if (options.password !== undefined) {
      let pw = options.password;
      if (pw === true || pw === '') pw = await prompt('  Preview password: ');
      if (!pw) {
        console.error('\n❌ Preview password cannot be empty\n');
        process.exit(1);
      }
      body.password = pw;
    }

    if (options.removePassword) body.remove_password = true;
  }

  const requestOptions = hasMutation
    ? {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
    : {};

  const makeRequest = async (_isRetry = false) => {
    const token = readCredentials()?.token;
    const res = await cloudFetch(
      `/api/cli/courses/${encodeURIComponent(slug)}/preview${orgQuery}`,
      requestOptions,
      token
    );
    return handleResponse(res, { retryFn: makeRequest, _isRetry });
  };

  const token = readCredentials()?.token;
  const firstRes = await cloudFetch(
    `/api/cli/courses/${encodeURIComponent(slug)}/preview${orgQuery}`,
    requestOptions,
    token
  );

  if (firstRes.status === 404 && getBindingSnapshot(slug).hasBinding) {
    const handled = await resolveStaleBinding({
      operation: 'preview-link',
      slug,
      options,
      promptText: '\n  This project is still linked locally, but the Cloud course was deleted. Clear the stale binding?',
      onRepaired: (payload) => {
        const result = {
          ...payload,
          success: true,
          previewLink: null,
          message: 'Local stale Cloud binding cleared. This course is no longer deployed.',
        };
        if (options.json) {
          emitJson(result);
        } else {
          console.log('\n  Cleared stale Cloud binding.');
          console.log('  This course is no longer deployed. Run `coursecode deploy` to create a new Cloud deployment.\n');
        }
        return true;
      },
      onJson: (payload) => {
        emitJson(payload);
        return true;
      },
    });
    if (handled) return;
  }

  const data = await handleResponse(firstRes, { retryFn: makeRequest, _isRetry: false });

  if (options.json) {
    emitJson(data);
    return;
  }

  if (hasMutation) {
    console.log(`\n✓ Preview link ${data.created ? 'created' : 'updated'}.\n`);
  } else {
    console.log(`\n${slug} — Preview Link\n`);
  }

  printPreviewLinkDetails(data.previewLink);
  console.log('');
}

/**
 * coursecode delete — remove course record from CourseCode Cloud.
 *
 * Cloud-only: this command does not delete local files. CLI users can remove
 * their project directory themselves; the Desktop handles local deletion via
 * shell.trashItem after calling this command.
 *
 * Response includes source_type + github_repo so callers can warn the user
 * when the deleted course was GitHub-linked (repo is unaffected, integration
 * is only disconnected on the Cloud side).
 */
export async function deleteCourse(options = {}) {
  await ensureAuthenticated();
  const slug = resolveSlug();
  const log = (...args) => { if (!options.json) console.log(...args); };

  const rcConfig = readRcConfig();
  if (!rcConfig?.cloudId) {
    if (options.json) {
      process.stdout.write(JSON.stringify({ success: false, error: 'Course has not been deployed to Cloud. Nothing to delete.' }) + '\n');
    } else {
      console.error('\n❌ Course has not been deployed to Cloud. Nothing to delete.\n');
    }
    process.exit(1);
  }

  const orgQuery = rcConfig?.orgId ? `?orgId=${rcConfig.orgId}` : '';

  if (!options.force && !options.json) {
    const answer = await prompt(`\n  Delete "${slug}" from CourseCode Cloud? This cannot be undone. [y/N] `);
    if (answer.toLowerCase() !== 'y') {
      console.log('  Cancelled.\n');
      process.exit(0);
    }
  }

  log(`\nDeleting ${slug} from Cloud...\n`);

  const makeRequest = async (_isRetry = false) => {
    const token = readCredentials()?.token;
    const res = await cloudFetch(
      `/api/cli/courses/${encodeURIComponent(slug)}${orgQuery}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloudId: rcConfig.cloudId }),
      },
      token
    );
    return handleResponse(res, { retryFn: makeRequest, _isRetry });
  };

  const token = readCredentials()?.token;
  const firstRes = await cloudFetch(
    `/api/cli/courses/${encodeURIComponent(slug)}${orgQuery}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloudId: rcConfig.cloudId }),
    },
    token
  );

  if (firstRes.status === 404 && getBindingSnapshot(slug).hasBinding) {
    const handled = await resolveStaleBinding({
      operation: 'delete',
      slug,
      options,
      promptText: '\n  The Cloud course is already gone, but this project still has a local binding. Clear the stale binding too?',
      onRepaired: (payload) => {
        const result = {
          ...payload,
          success: true,
          alreadyDeleted: true,
          message: 'Cloud course was already deleted. Local stale binding cleared.',
        };
        if (options.json) {
          emitJson(result);
        } else {
          console.log('\n✓ Course was already deleted from CourseCode Cloud.');
          console.log('  Cleared stale local Cloud binding.\n');
        }
        return true;
      },
      onJson: (payload) => {
        emitJson({
          ...payload,
          success: true,
          alreadyDeleted: true,
          message: 'Cloud course was already deleted. Local binding still needs cleanup.',
        });
        return true;
      },
    });
    if (handled) return;
  }

  const result = await handleResponse(firstRes, { retryFn: makeRequest, _isRetry: false });

  if (options.json) {
    process.stdout.write(JSON.stringify({ success: true, ...result }) + '\n');
    return;
  }

  console.log(`✓ "${slug}" deleted from CourseCode Cloud.`);
  if (result.source_type === 'github' && result.github_repo) {
    console.log(`\n  ⚠️  This course was linked to GitHub (${result.github_repo}).`);
    console.log('     The GitHub integration has been disconnected.');
    console.log('     Your repository and its files are unaffected.');
  }
  console.log('');
}
