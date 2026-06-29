// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { cx } from './cx';

describe('cx', () => {
  it('joins truthy class strings with a single space', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c');
  });

  it('skips falsy values without leaving double spaces', () => {
    expect(cx('a', false, 'b', null, 'c', undefined)).toBe('a b c');
  });

  it('returns an empty string when every input is falsy', () => {
    expect(cx(false, null, undefined)).toBe('');
  });
});
