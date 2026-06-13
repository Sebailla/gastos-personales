import { describe, it, expect } from 'vitest';
import { normalizeEmail } from './user';

describe('normalizeEmail', () => {
  it.each([
    ['  A@B.COM  ', 'a@b.com'],
    ['MiXeD@Example.COM', 'mixed@example.com'],
    ['already@lower.com', 'already@lower.com'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });

  it('rejects an empty string', () => {
    expect(() => normalizeEmail('')).toThrow(/empty/);
  });

  it('rejects an obviously malformed email', () => {
    expect(() => normalizeEmail('not-an-email')).toThrow(/invalid/);
  });
});
