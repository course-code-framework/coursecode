import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { create, stampCourseTitle, toProjectDirectoryName } from '../lib/create.js';

let tempDir;
let originalCwd;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-create-test-'));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('toProjectDirectoryName', () => {
  it('normalizes display titles into directory-safe names', () => {
    expect(toProjectDirectoryName('CourseCode Demo')).toBe('coursecode_demo');
    expect(toProjectDirectoryName("  Manager's Safety 101!  ")).toBe('managers_safety_101');
    expect(toProjectDirectoryName('Caf\u00e9 Basics')).toBe('cafe_basics');
  });
});

describe('stampCourseTitle', () => {
  it('updates metadata title and branding courseTitle without changing surrounding config', () => {
    const result = stampCourseTitle(`
export const courseConfig = {
  metadata: {
    title: 'CourseCode',
    description: 'CourseCode template'
  },
  branding: {
    companyName: 'CourseCode',
    courseTitle: 'CourseCode'
  }
};
`, "Manager's Safety");

    expect(result).toContain("title: 'Manager\\'s Safety'");
    expect(result).toContain("courseTitle: 'Manager\\'s Safety'");
    expect(result).toContain("companyName: 'CourseCode'");
  });
});

describe('create', () => {
  it('creates a directory-safe project and stamps the human course title', async () => {
    const result = await create('CourseCode Demo', { install: false });

    const projectDir = path.join(tempDir, 'coursecode_demo');
    expect(result).toEqual({
      displayName: 'CourseCode Demo',
      directoryName: 'coursecode_demo',
      targetDir: path.resolve('coursecode_demo')
    });
    expect(fs.existsSync(projectDir)).toBe(true);

    const packageJson = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8'));
    expect(packageJson.name).toBe('coursecode_demo');

    const config = fs.readFileSync(path.join(projectDir, 'course', 'course-config.js'), 'utf-8');
    expect(config).toContain("title: 'CourseCode Demo'");
    expect(config).toContain("courseTitle: 'CourseCode Demo'");
  });

  it('preserves the human course title for blank projects after clean resets the template', async () => {
    await create('Blank Course Demo', { install: false, blank: true });

    const config = fs.readFileSync(
      path.join(tempDir, 'blank_course_demo', 'course', 'course-config.js'),
      'utf-8'
    );

    expect(config).toContain("title: 'Blank Course Demo'");
  });
});
