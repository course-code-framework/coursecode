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

    const hash = crypto.createHash('sha1').update(pem).digest('hex').slice(0, 8);
    const certPath = path.join(os.tmpdir(), `coursecode-ca-${hash}.pem`);

    if (!fs.existsSync(certPath)) {
      fs.writeFileSync(certPath, pem, { mode: 0o600 });
    }

    return certPath;
  } catch {
    return null;
  }
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
