import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  create,
  stampCourseTitle,
  toCurrentDirectoryCourseTitle,
  toCurrentDirectoryPackageName,
  toProjectDirectoryName
} from '../lib/create.js';

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
    expect(toProjectDirectoryName('client-manager-course')).toBe('client_manager_course');
    expect(toProjectDirectoryName('client_manager_course')).toBe('client_manager_course');
    expect(toProjectDirectoryName('ClientManagerCourse')).toBe('clientmanagercourse');
  });
});

describe('current-directory naming', () => {
  it.each([
    ['client-manager-course', 'Client Manager Course', 'client-manager-course'],
    ['client_manager_course', 'Client Manager Course', 'client-manager-course'],
    ['ClientManager-COURSE', 'Client Manager Course', 'client-manager-course']
  ])('derives a title and npm package name from %s', (input, expectedTitle, expectedPackageName) => {
    expect(toCurrentDirectoryCourseTitle(input)).toBe(expectedTitle);
    expect(toCurrentDirectoryPackageName(input)).toBe(expectedPackageName);
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
      targetDir: path.resolve('coursecode_demo'),
      currentDirectory: false
    });
    expect(fs.existsSync(projectDir)).toBe(true);

    const packageJson = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8'));
    expect(packageJson.name).toBe('coursecode_demo');
    expect(packageJson.devDependencies.coursecode).toMatch(/^\^\d+\.\d+\.\d+$/);
    expect(fs.existsSync(path.join(projectDir, '.gitignore'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.gitattributes'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'course', 'references', '.gitkeep'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'course', 'references', 'converted', '.gitkeep'))).toBe(true);

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
    expect(fs.existsSync(path.join(tempDir, 'blank_course_demo', '.narration-cache.json'))).toBe(false);

    const demoAssets = [
      'course/assets/docs/example_md_1.md',
      'course/assets/docs/example_md_2.md',
      'course/assets/docs/example_pdf_1_thumbnail.png',
      'course/assets/docs/example_pdf_2.pdf',
      'course/assets/images/course-architecture.svg',
      'course/assets/images/logo.svg',
      'course/assets/widgets/counter-demo.html',
      'course/assets/widgets/gravity-painter.html'
    ];
    for (const asset of demoAssets) {
      expect(fs.existsSync(path.join(tempDir, 'blank_course_demo', asset))).toBe(false);
    }
  });

  it('initializes the current directory while preserving existing Git metadata and control rules', async () => {
    fs.mkdirSync(path.join(tempDir, '.git'));
    fs.writeFileSync(path.join(tempDir, '.git', 'sentinel'), 'preserve me');
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'custom-output/\n');

    const result = await create('Existing Repository Course', {
      install: false,
      blank: true,
      currentDirectory: true
    });

    expect(result.targetDir).toBe(path.resolve('.'));
    expect(result.currentDirectory).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, '.git', 'sentinel'), 'utf-8')).toBe('preserve me');

    const gitignore = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('custom-output/');
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('.narration-cache.json');
    expect(fs.existsSync(path.join(tempDir, 'course', 'slides', 'intro.js'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'course', 'references', '.gitkeep'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'course', 'references', 'converted', '.gitkeep'))).toBe(true);
  });

  it('derives a title-cased course title and hyphenated package name for create dot', async () => {
    const currentDirectory = path.join(tempDir, 'client-manager-course');
    fs.mkdirSync(currentDirectory);
    process.chdir(currentDirectory);

    const result = await create('.', { install: false, blank: true });

    expect(result.displayName).toBe('Client Manager Course');
    expect(result.directoryName).toBe('client-manager-course');
    expect(result.targetDir).toBe(path.resolve('.'));

    const config = fs.readFileSync(path.join(currentDirectory, 'course', 'course-config.js'), 'utf-8');
    expect(config).toContain("title: 'Client Manager Course'");

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(currentDirectory, 'package.json'), 'utf-8')
    );
    expect(packageJson.name).toBe('client-manager-course');
  });
});
