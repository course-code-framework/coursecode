import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { newAssessment, newSlide } from '../lib/scaffold.js';

let tempDir;
let originalCwd;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-scaffold-test-'));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('scaffold generators', () => {
  it('generates a lint-safe slide with the reserved render signature', () => {
    newSlide('getting-started');

    const source = fs.readFileSync(
      path.join(tempDir, 'course', 'slides', 'getting-started.js'),
      'utf-8'
    );
    expect(source).toContain('render(_root, _context)');
  });

  it('generates an assessment that owns its container and includes questions in its config', () => {
    newAssessment('knowledge-check');

    const source = fs.readFileSync(
      path.join(tempDir, 'course', 'slides', 'knowledge-check.js'),
      'utf-8'
    );
    expect(source).toContain('render(_root, context = {})');
    expect(source).toContain('document.createElement(\'div\')');
    expect(source).toContain('createAssessment({ ...config, questions })');
    expect(source).toContain('assessment.render(container, context)');
    expect(source).toContain('return container');
  });
});
