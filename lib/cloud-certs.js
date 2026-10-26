/**
 * cloud-certs.js — System CA certificate injection for corporate network compatibility.
 *
 * On corporate machines with SSL-inspecting proxies (e.g. Zscaler), the proxy
 * presents its own CA certificate. Node.js ships its own CA bundle and ignores
 * the OS trust store, causing TLS verification failures.
 *
 * Platform strategy:
 *   - Windows: `win-ca` (native N-API addon, calls Windows CryptoAPI directly)
 *   - macOS: `security` CLI exports system keychains to PEM
 *   - Linux: reads well-known CA bundle file paths
 *
 * On macOS/Linux, returns a PEM file path for NODE_EXTRA_CA_CERTS.
 * On Windows, injects certs directly into Node's TLS context (no file needed).
 * Never throws — silent no-op on non-corporate machines.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const execFileAsync = promisify(execFile);

/** Cached result — only run once per process lifetime. */
let _applied = false;

/**
 * Inject the OS system root certificates into Node's TLS context.
 *
 * On Windows, win-ca patches Node's TLS in-process (no file needed, no re-exec).
 * On macOS/Linux, returns a PEM file path for NODE_EXTRA_CA_CERTS re-exec.
 *
 * @returns {Promise<string|null>} PEM file path (macOS/Linux) or null (Windows/unavailable).
 */
export async function injectSystemCerts() {
  if (_applied) return null;
  _applied = true;

  try {
    if (process.platform === 'win32') {
      injectWindowsCerts();
      return null;
    }

    // macOS/Linux: export to PEM file for NODE_EXTRA_CA_CERTS
    const pem = process.platform === 'darwin'
      ? await readMacosCerts()
      : readLinuxCerts();

    if (!pem || !pem.trim()) return null;

    try {
      return writeCertBundle(pem);
    } catch {
      // Home dir unwritable (CI, sandbox): fall back to a fresh private
      // (0700, unpredictable name) temp dir rather than a shared fixed path.
      return writeCertBundle(pem, fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-ca-')));
    }
  } catch {
    return null;
  }
}

/** Per-user directory for the exported CA bundle (mode 0700). */
export function getCertCacheDir() {
  return path.join(os.homedir(), '.coursecode', 'certs');
}

/**
 * Write the PEM bundle to a private per-user location and return its path.
 *
 * The file lives in ~/.coursecode/certs (0700) rather than the shared temp
 * dir, so other local users can't pre-create or swap it. An existing file is
 * only reused when it is a regular file owned by us whose content matches;
 * otherwise it is replaced atomically (temp file + rename, mode 0600).
 *
 * @param {string} pem - PEM bundle content
 * @param {string} [dir] - Target directory (default: getCertCacheDir())
 * @returns {string} Absolute path to the PEM file
 */
export function writeCertBundle(pem, dir = getCertCacheDir()) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dirStat = fs.lstatSync(dir);
  if (!dirStat.isDirectory() || !isOwnedByCurrentUser(dirStat)) {
    throw new Error(`Refusing to use cert cache directory ${dir}`);
  }
  if ((dirStat.mode & 0o077) !== 0) fs.chmodSync(dir, 0o700);

  const hash = crypto.createHash('sha256').update(pem).digest('hex').slice(0, 16);
  const certPath = path.join(dir, `system-ca-${hash}.pem`);

  try {
    const stat = fs.lstatSync(certPath);
    if (stat.isFile() && isOwnedByCurrentUser(stat) && (stat.mode & 0o077) === 0 &&
        fs.readFileSync(certPath, 'utf-8') === pem) {
      return certPath;
    }
  } catch {
    // Missing or unreadable — (re)write below
  }

  const tmpPath = path.join(dir, `.system-ca-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(tmpPath, pem, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmpPath, certPath);
  } catch (error) {
    try { fs.unlinkSync(tmpPath); } catch { /* not created */ }
    throw error;
  }
  return certPath;
}

function isOwnedByCurrentUser(stat) {
  return typeof process.getuid !== 'function' || stat.uid === process.getuid();
}

/**
 * Windows: inject system root certs via win-ca.
 *
 * win-ca is a native N-API addon that calls Windows CryptoAPI directly.
 * No PowerShell, no subprocesses, no temp files. Works regardless of
 * execution policy, AppLocker, or PowerShell availability.
 *
 * The { inject: '+' } mode patches tls.createSecureContext() so system
 * certs are used *in addition to* Node's built-in CA bundle.
 */
function injectWindowsCerts() {
  const require = createRequire(import.meta.url);
  const winCa = require('win-ca/api');
  winCa({ inject: '+' });
}

/**
 * macOS: export the system root keychain via the `security` CLI tool.
 * This includes all roots installed via Apple MDM / System Preferences.
 */
async function readMacosCerts() {
  const keychains = [
    '/Library/Keychains/SystemRootCertificates.keychain',
    '/System/Library/Keychains/SystemRootCertificates.keychain',
    '/Library/Keychains/System.keychain',
  ];

  const pems = [];
  for (const keychain of keychains) {
    try {
      const { stdout } = await execFileAsync('security', [
        'find-certificate', '-a', '-p', keychain,
      ], { maxBuffer: 16 * 1024 * 1024 });
      if (stdout) pems.push(stdout);
    } catch {
      // Keychain not present on this OS version — skip
    }
  }

  return pems.join('\n');
}

/**
 * Linux: read the system CA bundle from well-known locations.
 * No subprocess needed — just read the file directly.
 */
function readLinuxCerts() {
  const candidatePaths = [
    '/etc/ssl/certs/ca-certificates.crt',       // Debian/Ubuntu
    '/etc/pki/tls/certs/ca-bundle.crt',          // RHEL/CentOS/Fedora
    '/etc/ssl/ca-bundle.pem',                     // OpenSUSE
    '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem', // RHEL 7+
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8');
    }
  }

  return null;
}
