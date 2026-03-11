/**
 * Cloud Integration Tests
 *
 * These tests hit a LIVE local Cloud instance (http://localhost:3000).
 * They are excluded from the default `npm test` run.
 *
 * Prerequisites:
 *   1. Local cloud app running on http://localhost:3000
 *   2. Local Supabase running with seed data applied
 *
 * Run:
 *   npm run test:cloud
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { setLocalMode, slugify } from '../lib/cloud.js';

const CLOUD_URL = 'http://localhost:3000';
const SEED_TOKEN = 'cc_local_test_token_do_not_use_in_production_0000000000000000';

beforeAll(() => {
  setLocalMode();
});

/**
 * Helper: make a request to the local cloud API with diagnostics on failure.
 */
async function cloudRequest(urlPath, options = {}) {
  const url = `${CLOUD_URL}${urlPath}`;
  const headers = { ...options.headers };
  if (options.auth !== false) {
    headers['Authorization'] = `Bearer ${SEED_TOKEN}`;
  }

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    let body;
    try { body = await res.clone().text(); } catch { body = '(could not read body)'; }
    console.log(`\n  ⚠ ${options.method || 'GET'} ${urlPath} → ${res.status}`);
    console.log(`    Body: ${body.slice(0, 500)}`);
  }

  return res;
}

// ─── Pure unit tests (no server needed) ──────────────────────────────────────

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('My Course Name')).toBe('my-course-name');
  });

  it('replaces underscores with hyphens', () => {
    expect(slugify('my_course_name')).toBe('my-course-name');
  });

  it('strips non-alphanumeric characters', () => {
    expect(slugify('Hello! World @ 2024')).toBe('hello-world-2024');
  });

  it('collapses consecutive hyphens', () => {
    expect(slugify('a---b')).toBe('a-b');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
  });
});

// ─── Integration tests (require local cloud + seed data) ────────────────────

describe('cloud integration', () => {
  describe('whoami', () => {
    it('returns user profile with email', async () => {
      const res = await cloudRequest('/api/cli/whoami');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('email');
      expect(data).toHaveProperty('full_name');
      console.log(`    ✓ whoami: ${data.full_name} (${data.email})`);
    });
  });

  describe('courses', () => {
    it('returns an array of courses', async () => {
      const res = await cloudRequest('/api/cli/courses');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      console.log(`    ✓ courses: ${data.length} found`);
    });
  });

  describe('course by slug', () => {
    it('returns 404 for a non-existent slug', async () => {
      const res = await cloudRequest('/api/cli/courses/does-not-exist');
      expect(res.status).toBe(404);
    });
  });

  describe('deploy', () => {
    it('rejects deploy without a zip file', async () => {
      const res = await cloudRequest('/api/cli/courses/test-course/deploy', {
        method: 'POST',
      });

      // Should be a client error (4xx), not a server crash (5xx)
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('status', () => {
    it('returns status for a known course or 404 for unknown', async () => {
      const res = await cloudRequest('/api/cli/courses/test-course/status');

      // 200 if course exists, 404 if not — both are valid
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('auth (token validation)', () => {
    it('rejects requests with invalid token', async () => {
      const res = await cloudRequest('/api/cli/whoami', {
        auth: false,
        headers: { 'Authorization': 'Bearer invalid-token-abc123' },
      });

      expect(res.status).toBe(401);
    });

    it('rejects requests with no token', async () => {
      const res = await cloudRequest('/api/cli/whoami', {
        auth: false,
      });

      expect(res.status).toBe(401);
    });
  });

  // ─── Device Code Auth Flow ────────────────────────────────────────────────
  //
  // Tests the POST /api/auth/device → GET /api/auth/device polling cycle
  // that replaced the legacy browser nonce flow.
  // No auth token required — device endpoints are public (unauthenticated).

  describe('device code auth flow', () => {
    let issuedDeviceCode;

    it('POST /api/auth/device — issues a device code and user code', async () => {
      const res = await cloudRequest('/api/auth/device', {
        method: 'POST',
        auth: false,
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(200);

      const data = await res.json();

      // All required fields must be present
      expect(data).toHaveProperty('deviceCode');
      expect(data).toHaveProperty('userCode');
      expect(data).toHaveProperty('verificationUri');
      expect(data).toHaveProperty('expiresIn');
      expect(data).toHaveProperty('interval');

      // Types
      expect(typeof data.deviceCode).toBe('string');
      expect(typeof data.userCode).toBe('string');
      expect(typeof data.verificationUri).toBe('string');
      expect(typeof data.expiresIn).toBe('number');
      expect(typeof data.interval).toBe('number');

      // device_code is a 64-char hex string (32 bytes)
      expect(data.deviceCode).toMatch(/^[0-9a-f]{64}$/);

      // user_code is in XXXX-XXXX format using unambiguous chars
      expect(data.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

      // verificationUri must include /activate
      expect(data.verificationUri).toContain('/activate');

      // Sensible expiry and interval
      expect(data.expiresIn).toBeGreaterThan(0);
      expect(data.interval).toBeGreaterThan(0);

      issuedDeviceCode = data.deviceCode;
      console.log(`    ✓ device code issued: ${data.userCode}`);
    });

    it('GET /api/auth/device?code=<deviceCode> — returns pending before user approves', async () => {
      // issuedDeviceCode is set by the previous test; skip gracefully if missing
      if (!issuedDeviceCode) {
        console.log('    ⚠ Skipped — previous test did not issue a device code');
        return;
      }

      const res = await cloudRequest(`/api/auth/device?code=${encodeURIComponent(issuedDeviceCode)}`, {
        auth: false,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.pending).toBe(true);
      console.log(`    ✓ poll returns pending while awaiting user approval`);
    });

    it('GET /api/auth/device?code=<invalid> — returns 404 for unknown device code', async () => {
      // Use a well-formed but non-existent 64-char hex code
      const unknownCode = '0'.repeat(64);
      const res = await cloudRequest(`/api/auth/device?code=${unknownCode}`, {
        auth: false,
      });

      expect(res.status).toBe(404);
      console.log(`    ✓ 404 for unknown device code`);
    });

    it('GET /api/auth/device (no code param) — returns 400 for missing code', async () => {
      const res = await cloudRequest('/api/auth/device', {
        auth: false,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty('error');
      console.log(`    ✓ 400 when code param is absent`);
    });
  });
});
