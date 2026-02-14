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

  describe('auth', () => {
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
});
