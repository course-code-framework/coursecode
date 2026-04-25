/**
 * Unit Tests — collectDistFiles & guessContentTypeLocal
 *
 * Tests for the new batch-upload helpers added in the CLI deploy refactor.
 * These are pure unit tests — no server or network access needed.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { collectDistFiles, guessContentTypeLocal } from '../lib/cloud.js';

// ─── collectDistFiles ───────────────────────────────────────────────────────

describe('collectDistFiles', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-test-dist-'));

    // Create a nested file structure
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(tmpDir, 'style.css'), 'body {}');
    fs.mkdirSync(path.join(tmpDir, 'assets'));
    fs.writeFileSync(path.join(tmpDir, 'assets', 'app.js'), 'console.log()');
    fs.mkdirSync(path.join(tmpDir, 'assets', 'images'));
    fs.writeFileSync(path.join(tmpDir, 'assets', 'images', 'logo.png'), 'PNG');

    // __MACOSX and dotfiles should be filtered out
    fs.mkdirSync(path.join(tmpDir, '__MACOSX'));
    fs.writeFileSync(path.join(tmpDir, '__MACOSX', '._index.html'), 'junk');
    fs.writeFileSync(path.join(tmpDir, '.DS_Store'), 'junk');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers all files recursively', () => {
    const files = collectDistFiles(tmpDir);
    const paths = files.map(f => f.relativePath);

    expect(paths).toContain('index.html');
    expect(paths).toContain('style.css');
    expect(paths).toContain('assets/app.js');
    expect(paths).toContain('assets/images/logo.png');
  });

  it('returns correct relative paths with forward slashes', () => {
    const files = collectDistFiles(tmpDir);
    const nested = files.find(f => f.relativePath === 'assets/images/logo.png');
    expect(nested).toBeDefined();
    expect(nested.relativePath).not.toContain('\\');
  });

  it('includes file sizes', () => {
    const files = collectDistFiles(tmpDir);
    for (const file of files) {
      expect(typeof file.size).toBe('number');
      expect(file.size).toBeGreaterThan(0);
    }
  });

  it('includes full paths', () => {
    const files = collectDistFiles(tmpDir);
    for (const file of files) {
      expect(file.fullPath).toBeDefined();
      expect(fs.existsSync(file.fullPath)).toBe(true);
    }
  });

  it('filters out __MACOSX directories', () => {
    const files = collectDistFiles(tmpDir);
    const paths = files.map(f => f.relativePath);

    expect(paths).not.toContain('__MACOSX/._index.html');
    expect(paths.some(p => p.includes('__MACOSX'))).toBe(false);
  });

  it('filters out dotfiles', () => {
    const files = collectDistFiles(tmpDir);
    const paths = files.map(f => f.relativePath);

    expect(paths).not.toContain('.DS_Store');
    expect(paths.some(p => p.startsWith('.'))).toBe(false);
  });

  it('returns empty array for empty directory', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-test-empty-'));
    const files = collectDistFiles(emptyDir);
    expect(files).toEqual([]);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});

// ─── guessContentTypeLocal ──────────────────────────────────────────────────

describe('guessContentTypeLocal', () => {
  it('returns text/html for .html files', () => {
    expect(guessContentTypeLocal('index.html')).toBe('text/html');
  });

  it('returns text/html for .htm files', () => {
    expect(guessContentTypeLocal('page.htm')).toBe('text/html');
  });

  it('returns text/css for .css files', () => {
    expect(guessContentTypeLocal('style.css')).toBe('text/css');
  });

  it('returns application/javascript for .js files', () => {
    expect(guessContentTypeLocal('app.js')).toBe('application/javascript');
  });

  it('returns application/javascript for .mjs files', () => {
    expect(guessContentTypeLocal('module.mjs')).toBe('application/javascript');
  });

  it('returns application/json for .json files', () => {
    expect(guessContentTypeLocal('config.json')).toBe('application/json');
  });

  it('returns correct types for image files', () => {
    expect(guessContentTypeLocal('photo.png')).toBe('image/png');
    expect(guessContentTypeLocal('photo.jpg')).toBe('image/jpeg');
    expect(guessContentTypeLocal('photo.jpeg')).toBe('image/jpeg');
    expect(guessContentTypeLocal('icon.gif')).toBe('image/gif');
    expect(guessContentTypeLocal('icon.svg')).toBe('image/svg+xml');
    expect(guessContentTypeLocal('photo.webp')).toBe('image/webp');
  });

  it('returns correct types for media files', () => {
    expect(guessContentTypeLocal('video.mp4')).toBe('video/mp4');
    expect(guessContentTypeLocal('video.webm')).toBe('video/webm');
    expect(guessContentTypeLocal('audio.mp3')).toBe('audio/mpeg');
    expect(guessContentTypeLocal('audio.wav')).toBe('audio/wav');
  });

  it('returns correct types for font files', () => {
    expect(guessContentTypeLocal('font.woff')).toBe('font/woff');
    expect(guessContentTypeLocal('font.woff2')).toBe('font/woff2');
    expect(guessContentTypeLocal('font.ttf')).toBe('font/ttf');
  });

  it('returns correct types for document/data files', () => {
    expect(guessContentTypeLocal('doc.pdf')).toBe('application/pdf');
    expect(guessContentTypeLocal('manifest.xml')).toBe('application/xml');
    expect(guessContentTypeLocal('readme.txt')).toBe('text/plain');
  });

  it('returns application/octet-stream for unknown extensions', () => {
    expect(guessContentTypeLocal('file.xyz')).toBe('application/octet-stream');
    expect(guessContentTypeLocal('data.bin')).toBe('application/octet-stream');
  });

  it('handles deep paths correctly', () => {
    expect(guessContentTypeLocal('assets/images/logo.png')).toBe('image/png');
    expect(guessContentTypeLocal('dist/bundle.js')).toBe('application/javascript');
  });

  it('handles files with no extension', () => {
    expect(guessContentTypeLocal('Makefile')).toBe('application/octet-stream');
  });
});
