/**
 * Tests for lib/cloud.js — pure functions only (slug, format helpers)
 */

import { describe, it, expect } from 'vitest';
import { slugify } from '../../lib/cloud.js';

describe('slugify', () => {
  it('lowercases input', () => {
    expect(slugify('My Course')).toBe('my-course');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('safety training basics')).toBe('safety-training-basics');
  });

  it('replaces underscores with hyphens', () => {
    expect(slugify('safety_training')).toBe('safety-training');
  });

  it('strips non-alphanumeric characters', () => {
    expect(slugify('Hello World! 2026')).toBe('hello-world-2026');
  });

  it('collapses consecutive hyphens', () => {
    expect(slugify('a---b--c')).toBe('a-b-c');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
  });

  it('handles mixed edge cases', () => {
    expect(slugify('  My_Cool Course! (v2)  ')).toBe('my-cool-course-v2');
  });

  it('handles already valid slugs', () => {
    expect(slugify('safety-training')).toBe('safety-training');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles numbers only', () => {
    expect(slugify('12345')).toBe('12345');
  });
});
