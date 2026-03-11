import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

function mockCloudFetchSequence(responses) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: response.ok,
      status: response.status,
      text: async () => JSON.stringify(response.body),
    });
  }
  globalThis.fetch = fetchMock;
  return fetchMock;
}

function mockOsHome(tempHome) {
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
}

function writeCredentials(tempHome, token = 'token-abc') {
  fs.mkdirSync(path.join(tempHome, '.coursecode'), { recursive: true });
  fs.writeFileSync(
    path.join(tempHome, '.coursecode', 'credentials.json'),
    JSON.stringify({ token, cloud_url: 'https://coursecodecloud.com' }, null, 2)
  );
}

function writeCloudBinding(tempProject, { slug = 'project-bound-slug', orgId = 'org-123', cloudId = 'course-123' } = {}) {
  fs.mkdirSync(path.join(tempProject, '.coursecode'), { recursive: true });
  fs.writeFileSync(
    path.join(tempProject, '.coursecode', 'project.json'),
    JSON.stringify({ slug, orgId, courseId: cloudId }, null, 2)
  );
  fs.writeFileSync(
    path.join(tempProject, '.coursecoderc.json'),
    JSON.stringify({ orgId, cloudId }, null, 2)
  );
}

describe('cloud auth and binding regression guards', () => {
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

  it('login writes global credentials and does not create project auth cache', async () => {
    vi.resetModules();
    mockOsHome(tempHome);

    mockCloudFetchSequence([
      {
        ok: true,
        status: 200,
        body: {
          deviceCode: 'a'.repeat(64),
          userCode: 'ABCD-EFGH',
          verificationUri: 'https://coursecodecloud.com/activate',
          expiresIn: 60,
          interval: 0.001,
        },
      },
      {
        ok: true,
        status: 200,
        body: { token: 'token-global-123' },
      },
      {
        ok: true,
        status: 200,
        body: { email: 'test@example.com', full_name: 'Test User' },
      },
    ]);

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const cloud = await import('../../lib/cloud.js');
    await cloud.login({ json: true });

    const credentialsPath = path.join(tempHome, '.coursecode', 'credentials.json');
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));

    expect(credentials.token).toBe('token-global-123');
    expect(fs.existsSync(path.join(tempProject, '.coursecode', 'project.json'))).toBe(false);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('status resolves slug from local project config and keeps org query behavior', async () => {
    fs.mkdirSync(path.join(tempProject, '.coursecode'), { recursive: true });
    fs.writeFileSync(
      path.join(tempProject, '.coursecode', 'project.json'),
      JSON.stringify({ slug: 'project-bound-slug' }, null, 2)
    );
    fs.writeFileSync(
      path.join(tempProject, '.coursecoderc.json'),
      JSON.stringify({ orgId: 'org-123' }, null, 2)
    );

    vi.resetModules();
    mockOsHome(tempHome);
    writeCredentials(tempHome);

    const fetchMock = mockCloudFetchSequence([
      {
        ok: true,
        status: 200,
        body: {
          slug: 'project-bound-slug',
          name: 'Demo Course',
          orgName: 'Org Name',
          source_type: 'upload',
          lastDeploy: null,
        },
      },
    ]);

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const cloud = await import('../../lib/cloud.js');
    await cloud.status({ json: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/cli/courses/project-bound-slug/status?orgId=org-123');
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('status --json surfaces stale binding details without clearing by default', async () => {
    writeCloudBinding(tempProject);

    vi.resetModules();
    mockOsHome(tempHome);
    writeCredentials(tempHome);

    const fetchMock = mockCloudFetchSequence([
      {
        ok: false,
        status: 404,
        body: { error: 'Not found' },
      },
    ]);

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const cloud = await import('../../lib/cloud.js');
    await cloud.status({ json: true });

    const payload = JSON.parse(stdoutSpy.mock.calls[0][0]);
    expect(payload.errorCode).toBe('stale_cloud_binding');
    expect(payload.bindingCleared).toBe(false);
    expect(payload.repairFlag).toBe('--repair-binding');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const rc = JSON.parse(fs.readFileSync(path.join(tempProject, '.coursecoderc.json'), 'utf-8'));
    const projectConfig = JSON.parse(fs.readFileSync(path.join(tempProject, '.coursecode', 'project.json'), 'utf-8'));
    expect(rc.cloudId).toBe('course-123');
    expect(projectConfig.courseId).toBe('course-123');
  });

  it('status --json --repair-binding clears stale binding and reports undeployed state', async () => {
    writeCloudBinding(tempProject);

    vi.resetModules();
    mockOsHome(tempHome);
    writeCredentials(tempHome);

    mockCloudFetchSequence([
      {
        ok: false,
        status: 404,
        body: { error: 'Not found' },
      },
    ]);

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const cloud = await import('../../lib/cloud.js');
    await cloud.status({ json: true, repairBinding: true });

    const payload = JSON.parse(stdoutSpy.mock.calls[0][0]);
    expect(payload.success).toBe(true);
    expect(payload.bindingCleared).toBe(true);
    expect(payload.deployed).toBe(false);

    const rc = JSON.parse(fs.readFileSync(path.join(tempProject, '.coursecoderc.json'), 'utf-8'));
    const projectConfig = JSON.parse(fs.readFileSync(path.join(tempProject, '.coursecode', 'project.json'), 'utf-8'));
    expect(rc.cloudId).toBeUndefined();
    expect(rc.orgId).toBeUndefined();
    expect(projectConfig.courseId).toBeUndefined();
    expect(projectConfig.orgId).toBeUndefined();
    expect(projectConfig.slug).toBe('project-bound-slug');
  });

  it('delete --json treats a missing remote course as already deleted', async () => {
    writeCloudBinding(tempProject);

    vi.resetModules();
    mockOsHome(tempHome);
    writeCredentials(tempHome);

    mockCloudFetchSequence([
      {
        ok: false,
        status: 404,
        body: { error: 'Not found' },
      },
    ]);

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const cloud = await import('../../lib/cloud.js');
    await cloud.deleteCourse({ json: true, force: true });

    const payload = JSON.parse(stdoutSpy.mock.calls[0][0]);
    expect(payload.success).toBe(true);
    expect(payload.alreadyDeleted).toBe(true);
    expect(payload.bindingCleared).toBe(false);
  });

  it('deploy --json fails fast on stale binding unless repair is explicitly requested', async () => {
    writeCloudBinding(tempProject);

    vi.resetModules();
    mockOsHome(tempHome);
    vi.doMock('../../lib/project-utils.js', () => ({
      validateProject: () => {},
    }));
    writeCredentials(tempHome);

    mockCloudFetchSequence([
      {
        ok: false,
        status: 404,
        body: { error: 'Not found' },
      },
    ]);

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitError = new Error('process.exit');
    vi.spyOn(process, 'exit').mockImplementation(() => { throw exitError; });

    const cloud = await import('../../lib/cloud.js');
    await expect(cloud.deploy({ json: true })).rejects.toBe(exitError);

    const payload = JSON.parse(stdoutSpy.mock.calls[0][0]);
    expect(payload.errorCode).toBe('stale_cloud_binding');
    expect(payload.bindingCleared).toBe(false);
    expect(stderrSpy).toHaveBeenCalled();
  });
  it('deploy --json blocks production deploy for github-linked courses', async () => {
    // Write binding with sourceType: 'github'
    fs.mkdirSync(path.join(tempProject, '.coursecode'), { recursive: true });
    fs.writeFileSync(
      path.join(tempProject, '.coursecode', 'project.json'),
      JSON.stringify({ slug: 'github-course', orgId: 'org-123', courseId: 'course-123' }, null, 2)
    );
    fs.writeFileSync(
      path.join(tempProject, '.coursecoderc.json'),
      JSON.stringify({ cloudId: 'course-123', orgId: 'org-123', sourceType: 'github', githubRepo: 'owner/repo' }, null, 2)
    );

    vi.resetModules();
    mockOsHome(tempHome);
    vi.doMock('../../lib/project-utils.js', () => ({
      validateProject: () => {},
    }));
    writeCredentials(tempHome);

    // Status preflight succeeds (course exists)
    const fetchMock = mockCloudFetchSequence([
      { ok: true, status: 200, body: { slug: 'github-course', source_type: 'github' } },
    ]);

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitError = new Error('process.exit');
    vi.spyOn(process, 'exit').mockImplementation(() => { throw exitError; });

    const cloud = await import('../../lib/cloud.js');
    await expect(cloud.deploy({ json: true })).rejects.toBe(exitError);

    const payload = JSON.parse(stdoutSpy.mock.calls[0][0]);
    expect(payload.errorCode).toBe('github_source_blocked');
    expect(payload.githubRepo).toBe('owner/repo');

    // Only the status preflight call — no build/upload calls
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deploy --json --preview bypasses github guard', async () => {
    // Write binding with sourceType: 'github'
    fs.mkdirSync(path.join(tempProject, '.coursecode'), { recursive: true });
    fs.writeFileSync(
      path.join(tempProject, '.coursecode', 'project.json'),
      JSON.stringify({ slug: 'github-course', orgId: 'org-123', courseId: 'course-123' }, null, 2)
    );
    fs.writeFileSync(
      path.join(tempProject, '.coursecoderc.json'),
      JSON.stringify({ cloudId: 'course-123', orgId: 'org-123', sourceType: 'github', githubRepo: 'owner/repo' }, null, 2)
    );

    vi.resetModules();
    mockOsHome(tempHome);
    vi.doMock('../../lib/project-utils.js', () => ({
      validateProject: () => {},
    }));
    // Mock build to fail with a known error (proves the guard was bypassed)
    vi.doMock('../../lib/build.js', () => ({
      build: () => { throw new Error('build-reached'); },
    }));
    writeCredentials(tempHome);

    // Status preflight succeeds
    mockCloudFetchSequence([
      { ok: true, status: 200, body: { slug: 'github-course', source_type: 'github' } },
    ]);

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const cloud = await import('../../lib/cloud.js');
    // Expect it to reach the build step (not blocked by guard)
    await expect(cloud.deploy({ json: true, preview: true })).rejects.toThrow('build-reached');
  });
  it('status --json reconciles local sourceType when github link is removed on cloud', async () => {
    // Local config says github-linked
    fs.mkdirSync(path.join(tempProject, '.coursecode'), { recursive: true });
    fs.writeFileSync(
      path.join(tempProject, '.coursecode', 'project.json'),
      JSON.stringify({ slug: 'unlinked-course', orgId: 'org-123' }, null, 2)
    );
    fs.writeFileSync(
      path.join(tempProject, '.coursecoderc.json'),
      JSON.stringify({ cloudId: 'course-123', orgId: 'org-123', sourceType: 'github', githubRepo: 'owner/repo' }, null, 2)
    );

    vi.resetModules();
    mockOsHome(tempHome);
    writeCredentials(tempHome);

    // Server says source_type is no longer github
    mockCloudFetchSequence([
      {
        ok: true,
        status: 200,
        body: {
          slug: 'unlinked-course',
          name: 'Demo Course',
          orgName: 'Org',
          source_type: 'upload',
        },
      },
    ]);

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const cloud = await import('../../lib/cloud.js');
    await cloud.status({ json: true });

    // Verify rc was cleaned up
    const rc = JSON.parse(fs.readFileSync(path.join(tempProject, '.coursecoderc.json'), 'utf-8'));
    expect(rc.sourceType).toBeUndefined();
    expect(rc.githubRepo).toBeUndefined();
    expect(rc.cloudId).toBe('course-123'); // other fields preserved
    expect(stdoutSpy).toHaveBeenCalled();
  });
  it('deploy reconciles sourceType from preflight and proceeds when github link was removed', async () => {
    // Local config says github-linked
    fs.mkdirSync(path.join(tempProject, '.coursecode'), { recursive: true });
    fs.writeFileSync(
      path.join(tempProject, '.coursecode', 'project.json'),
      JSON.stringify({ slug: 'unlinked-course', orgId: 'org-123', courseId: 'course-123' }, null, 2)
    );
    fs.writeFileSync(
      path.join(tempProject, '.coursecoderc.json'),
      JSON.stringify({ cloudId: 'course-123', orgId: 'org-123', sourceType: 'github', githubRepo: 'owner/repo' }, null, 2)
    );

    vi.resetModules();
    mockOsHome(tempHome);
    vi.doMock('../../lib/project-utils.js', () => ({
      validateProject: () => {},
    }));
    vi.doMock('../../lib/build.js', () => ({
      build: () => { throw new Error('build-reached'); },
    }));
    writeCredentials(tempHome);

    // Preflight returns source_type: 'upload' (no longer github)
    mockCloudFetchSequence([
      {
        ok: true,
        status: 200,
        body: { slug: 'unlinked-course', source_type: 'upload' },
      },
    ]);

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const cloud = await import('../../lib/cloud.js');
    // Should reconcile, bypass guard, and reach build
    await expect(cloud.deploy({ json: true })).rejects.toThrow('build-reached');

    // Verify rc was cleaned up
    const rc = JSON.parse(fs.readFileSync(path.join(tempProject, '.coursecoderc.json'), 'utf-8'));
    expect(rc.sourceType).toBeUndefined();
    expect(rc.githubRepo).toBeUndefined();
    expect(rc.cloudId).toBe('course-123');
  });
});
