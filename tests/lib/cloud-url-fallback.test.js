import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('cloud login fallback URL persistence', () => {
  let originalCwd;
  let tempHome;
  let tempProject;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-home-'));
    tempProject = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-proj-'));
    process.chdir(tempProject);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('stores fallback cloud_url when primary responds with HTML block page', async () => {
    vi.resetModules();
    vi.doMock('os', async () => {
      const actual = await vi.importActual('os');
      return {
        ...actual,
        default: {
          ...actual.default,
          homedir: () => tempHome,
        },
        homedir: () => tempHome,
      };
    });

    const fallbackUrl = 'https://coursecode-cloud-web.vercel.app';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<!doctype html><html><body>zscaler block</body></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          deviceCode: 'a'.repeat(64),
          userCode: 'ABCD-EFGH',
          verificationUri: 'https://coursecodecloud.com/activate',
          expiresIn: 60,
          interval: 0.001,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ pending: false, token: 'tok-fallback-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ email: 'test@example.com', full_name: 'Test User' }),
      });

    globalThis.fetch = fetchMock;
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const cloud = await import('../../lib/cloud.js');
    await cloud.login({ json: true });

    const credentialsPath = path.join(tempHome, '.coursecode', 'credentials.json');
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));

    expect(credentials.token).toBe('tok-fallback-1');
    expect(credentials.cloud_url).toBe(fallbackUrl);
    expect(fetchMock.mock.calls[1][0].startsWith(fallbackUrl)).toBe(true);
  });

  it('stores fallback cloud_url in legacy flow when fallback is selected after connect starts', async () => {
    vi.resetModules();
    vi.doMock('os', async () => {
      const actual = await vi.importActual('os');
      return {
        ...actual,
        default: {
          ...actual.default,
          homedir: () => tempHome,
        },
        homedir: () => tempHome,
      };
    });

    const fallbackUrl = 'https://coursecode-cloud-web.vercel.app';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 404,
        text: async () => JSON.stringify({ error: 'Not found' }),
      })
      .mockRejectedValueOnce(new Error('primary blocked'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ pending: false, token: 'tok-legacy-fallback' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ email: 'test@example.com', full_name: 'Test User' }),
      });

    globalThis.fetch = fetchMock;
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
      callback();
      return 0;
    });

    const cloud = await import('../../lib/cloud.js');
    await cloud.login({ json: true });

    const credentialsPath = path.join(tempHome, '.coursecode', 'credentials.json');
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));

    expect(credentials.token).toBe('tok-legacy-fallback');
    expect(credentials.cloud_url).toBe(fallbackUrl);
  });

  it('recovers from post-login 401 by retrying alternate origin before re-auth', async () => {
    vi.resetModules();
    vi.doMock('os', async () => {
      const actual = await vi.importActual('os');
      return {
        ...actual,
        default: {
          ...actual.default,
          homedir: () => tempHome,
        },
        homedir: () => tempHome,
      };
    });

    const fallbackUrl = 'https://coursecode-cloud-web.vercel.app';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          deviceCode: 'b'.repeat(64),
          userCode: 'WXYZ-2345',
          verificationUri: 'https://coursecodecloud.com/activate',
          expiresIn: 60,
          interval: 0.001,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ pending: false, token: 'tok-primary' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: 'Unauthorized' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ email: 'test@example.com', full_name: 'Test User' }),
      });

    globalThis.fetch = fetchMock;
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const cloud = await import('../../lib/cloud.js');
    await cloud.login({ json: true });

    const credentialsPath = path.join(tempHome, '.coursecode', 'credentials.json');
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));

    expect(credentials.token).toBe('tok-primary');
    expect(credentials.cloud_url).toBe(fallbackUrl);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][0].startsWith(fallbackUrl)).toBe(true);
  });
});
