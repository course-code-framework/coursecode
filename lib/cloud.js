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

const DEFAULT_CLOUD_URL = 'https://coursecodecloud.com';
const LOCAL_CLOUD_URL = 'http://localhost:3000';
let useLocal = false;
const CREDENTIALS_DIR = path.join(os.homedir(), '.coursecode');
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'credentials.json');
const PROJECT_CONFIG_DIR = '.coursecode';
const PROJECT_CONFIG_PATH = path.join(PROJECT_CONFIG_DIR, 'project.json');

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const USER_AGENT = `coursecode-cli/${packageJson.version}`;

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

function writeCredentials(token, cloudUrl = DEFAULT_CLOUD_URL) {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  const data = JSON.stringify({ token, cloud_url: cloudUrl }, null, 2);
  fs.writeFileSync(getCredentialsPath(), data, { mode: 0o600 });
}

function deleteCredentials() {
  try { fs.unlinkSync(getCredentialsPath()); } catch { /* already gone */ }
}

function getCloudUrl() {
  if (useLocal) return LOCAL_CLOUD_URL;
  return readCredentials()?.cloud_url || DEFAULT_CLOUD_URL;
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
  fs.writeFileSync(
    path.join(process.cwd(), PROJECT_CONFIG_PATH),
    JSON.stringify(data, null, 2) + '\n'
  );
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
 * Stamp cloudId into .coursecoderc.json without clobbering other fields.
 */
function writeRcCloudId(cloudId) {
  const rcPath = path.join(process.cwd(), '.coursecoderc.json');
  const existing = readRcConfig() || {};
  existing.cloudId = cloudId;
  fs.writeFileSync(rcPath, JSON.stringify(existing, null, 2) + '\n');
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
 * @returns {Promise<Response>}
 */
async function cloudFetch(urlPath, options = {}, token = null) {
  const cloudUrl = getCloudUrl();
  const url = `${cloudUrl}${urlPath}`;

  const headers = {
    'User-Agent': USER_AGENT,
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    return await fetch(url, { ...options, headers });
  } catch (_error) {
    console.error('\n❌ Could not connect to CourseCode Cloud. Check your internet connection.\n');
    process.exit(1);
  }
}

/**
 * Handle HTTP error responses per §7.
 * Returns the parsed JSON body, or exits on error.
 */
async function handleResponse(res, { retryFn, _isRetry = false } = {}) {
  if (res.ok) return res.json();

  const status = res.status;

  // 401 — invalid token, trigger re-auth and retry once
  if (status === 401 && retryFn && !_isRetry) {
    console.log('\n  ⚠ Session expired. Re-authenticating...\n');
    deleteCredentials();
    await runLoginFlow();
    return retryFn(true);
  }

  // Parse error body
  let body;
  try { body = await res.json(); } catch { body = {}; }
  const message = body.error || `HTTP ${status}`;

  if (status === 403 || status === 409) {
    console.error(`\n❌ ${message}\n`);
  } else if (status === 404) {
    console.error('\n❌ Course not found on Cloud.\n');
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
 * Run the nonce exchange login flow.
 * 1. Generate nonce
 * 2. POST /api/auth/connect to create session
 * 3. Open browser
 * 4. Poll until token received or timeout
 * 5. Store credentials
 */
async function runLoginFlow() {
  const nonce = crypto.randomBytes(32).toString('hex');
  const cloudUrl = getCloudUrl();

  // Step 1: Create CLI session
  console.log('  → Registering session...');
  const createRes = await cloudFetch('/api/auth/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce }),
  });

  if (!createRes.ok) {
    const body = await createRes.json().catch(() => ({}));
    console.error(`\n❌ Failed to start login: ${body.error || `HTTP ${createRes.status}`}\n`);
    process.exit(1);
  }

  // Step 2: Open browser
  const loginUrl = `${cloudUrl}/auth/connect?session=${nonce}`;
  console.log('  → Opening browser for authentication...');
  openBrowser(loginUrl);

  // Step 3: Poll for token
  const startTime = Date.now();
  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    const pollRes = await cloudFetch(`/api/auth/connect?session=${nonce}`);

    if (pollRes.status === 410) {
      console.error('\n❌ Login session expired. Try again.\n');
      process.exit(1);
    }

    if (!pollRes.ok) continue;

    const data = await pollRes.json();
    if (data.pending) continue;

    if (data.token) {
      writeCredentials(data.token, cloudUrl);
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
  // 1. Check .coursecoderc.json for cloudId (committed, shared across team)
  const rcConfig = readRcConfig();
  if (rcConfig?.cloudId) {
    // Still need orgId from local project.json if available
    const projectConfig = readProjectConfig();
    if (projectConfig?.orgId) {
      return { orgId: projectConfig.orgId, courseId: rcConfig.cloudId };
    }
    // Have cloudId but no orgId — fall through to API resolution
    // which will match on courseId
  }

  // 2. Check cached project config (gitignored, per-developer)
  const projectConfig = readProjectConfig();
  if (projectConfig?.orgId && projectConfig?.courseId) {
    return { orgId: projectConfig.orgId, courseId: projectConfig.courseId };
  }

  // Call resolve endpoint
  const res = await cloudFetch(`/api/cli/courses/${encodeURIComponent(slug)}/resolve`, {}, token);
  const data = await handleResponse(res);

  // Found in exactly one org
  if (data.found) {
    const binding = { orgId: data.orgId, courseId: data.courseId, slug };
    writeProjectConfig(binding);
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
    const binding = { orgId: match.orgId, courseId: match.courseId, slug };
    writeProjectConfig(binding);
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

// =============================================================================
// CLI COMMANDS
// =============================================================================

/**
 * coursecode login — explicit (re-)authentication
 */
export async function login() {
  console.log('\n🔑 Logging in to CourseCode Cloud...\n');
  await runLoginFlow();

  // Show who they are
  const token = readCredentials()?.token;
  if (token) {
    const res = await cloudFetch('/api/cli/whoami', {}, token);
    if (res.ok) {
      const data = await res.json();
      console.log(`  ✓ Logged in as ${data.full_name} (${data.email})\n`);
      return;
    }
  }
  console.log('');
}

/**
 * coursecode logout — delete credentials and local project.json
 */
export async function logout() {
  deleteCredentials();

  // Also delete local project.json if it exists
  const localConfig = path.join(process.cwd(), PROJECT_CONFIG_PATH);
  try { fs.unlinkSync(localConfig); } catch { /* not there */ }

  console.log('\n✓ Logged out of CourseCode Cloud.\n');
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
export async function listCourses() {
  await ensureAuthenticated();

  const makeRequest = async (_isRetry = false) => {
    const token = readCredentials()?.token;
    const res = await cloudFetch('/api/cli/courses', {}, token);
    return handleResponse(res, { retryFn: makeRequest, _isRetry });
  };

  const courses = await makeRequest();

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
 * coursecode deploy — build, zip, resolve org, upload
 */
export async function deploy(options = {}) {
  const { validateProject } = await import('./project-utils.js');
  validateProject();

  await ensureAuthenticated();
  const slug = resolveSlug();

  console.log('\n📦 Building...\n');

  // Step 1: Build
  const { build } = await import('./build.js');
  await build({ ...options, _skipValidation: true });

  // Step 2: Verify dist/ exists
  const distPath = path.join(process.cwd(), 'dist');
  if (!fs.existsSync(distPath)) {
    console.error('\n❌ Build did not produce a dist/ directory.\n');
    process.exit(1);
  }

  // Step 3: Resolve org
  const { orgId, courseId, orgName } = await resolveOrgAndCourse(slug, readCredentials()?.token);
  const displayOrg = orgName ? ` to ${orgName}` : '';

  // Step 4: Zip dist/ contents
  const zipPath = path.join(os.tmpdir(), `coursecode-deploy-${Date.now()}.zip`);
  await zipDirectory(distPath, zipPath);

  // Step 5: Upload
  const mode = options.preview ? 'preview' : 'production';
  console.log(`\nDeploying ${slug}${displayOrg} as ${mode}...\n`);

  const formData = new FormData();
  const zipBuffer = fs.readFileSync(zipPath);
  formData.append('file', new Blob([zipBuffer], { type: 'application/zip' }), 'deploy.zip');
  formData.append('orgId', orgId);

  if (options.message) {
    formData.append('message', options.message);
  }

  if (options.preview && options.password) {
    const pw = await prompt('  Preview password: ');
    formData.append('password', pw);
  }

  const queryString = options.preview ? '?mode=preview' : '';

  const makeRequest = async (_isRetry = false) => {
    const token = readCredentials()?.token;
    const res = await cloudFetch(
      `/api/cli/courses/${encodeURIComponent(slug)}/deploy${queryString}`,
      { method: 'POST', body: formData },
      token
    );
    return handleResponse(res, { retryFn: makeRequest, _isRetry });
  };

  const result = await makeRequest();

  // Step 6: Write project.json + stamp cloudId
  const finalCourseId = result.courseId || courseId;
  writeProjectConfig({
    orgId: result.orgId || orgId,
    courseId: finalCourseId,
    slug,
  });

  // Stamp cloudId into .coursecoderc.json (committed, shared with team)
  const rc = readRcConfig();
  if (finalCourseId && (!rc || rc.cloudId !== finalCourseId)) {
    writeRcCloudId(finalCourseId);
  }

  // Step 7: Display result
  if (result.mode === 'preview') {
    console.log(`✓ Preview deployed (${result.fileCount} files)`);
    console.log(`  URL: ${result.url}`);
    if (result.expiresAt) console.log(`  Expires: ${formatDate(result.expiresAt)}`);
  } else {
    console.log(`✓ Deployed to production (${result.fileCount} files, ${formatBytes(result.size)})`);
    const cloudUrl = getCloudUrl();
    console.log(`  ${cloudUrl}/dashboard/courses/${result.courseId}`);
  }
  console.log('');

  // Cleanup temp zip
  try { fs.unlinkSync(zipPath); } catch { /* fine */ }
}

/**
 * coursecode status — show deployment status for current course
 */
export async function status() {
  await ensureAuthenticated();
  const slug = resolveSlug();

  const projectConfig = readProjectConfig();
  const orgQuery = projectConfig?.orgId ? `?orgId=${projectConfig.orgId}` : '';

  const makeRequest = async (_isRetry = false) => {
    const token = readCredentials()?.token;
    const res = await cloudFetch(
      `/api/cli/courses/${encodeURIComponent(slug)}/status${orgQuery}`,
      {},
      token
    );
    return handleResponse(res, { retryFn: makeRequest, _isRetry });
  };

  const data = await makeRequest();

  console.log(`\n${data.slug} — ${data.name} (${data.orgName})\n`);

  if (data.lastDeploy) {
    console.log(`Last deploy:    ${formatDate(data.lastDeploy)} (${data.lastDeployFileCount} files, ${formatBytes(data.lastDeploySize)})`);
  } else {
    console.log('Last deploy:    Never');
  }

  if (data.errorCount24h != null) console.log(`Errors (24h):   ${data.errorCount24h}`);
  if (data.launchCount24h != null) console.log(`Launches (24h): ${data.launchCount24h}`);

  if (data.previewUrl) {
    console.log(`Preview:        ${data.previewUrl}`);
    if (data.previewExpiresAt) console.log(`                Expires ${formatDate(data.previewExpiresAt)}`);
  }

  console.log('');
}

// =============================================================================
// ZIP HELPER
// =============================================================================

/**
 * Zip a directory's contents using the system `zip` command.
 * Falls back to a tar+gzip approach if zip isn't available.
 */
function zipDirectory(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    // Use system zip: cd into dir so paths are relative
    exec(
      `cd "${sourceDir}" && zip -r -q "${outputPath}" .`,
      (error) => {
        if (error) {
          reject(new Error(`Failed to create zip: ${error.message}. Ensure 'zip' is installed.`));
        } else {
          resolve();
        }
      }
    );
  });
}
