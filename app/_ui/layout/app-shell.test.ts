/**
 * Tests for `app/_ui/layout/app-shell.tsx` (T-PR3-06 of the
 * `ui-redesign` change).
 *
 * The AppShell reads `x-pathname` from the request headers
 * (set by `proxy.ts` in PR 1) and decides which chrome
 * elements to mount per the pathname matrix. The matrix
 * logic lives in the pure `pickChromeVariant` function
 * (exported from the same module); the JSX is a
 * side-effect-free projection of that function.
 *
 * This test pins the matrix with `it.each` per
 * `AGENTS.md` §10.5 (no `for` loops in tests):
 *
 *   - `/` (landing)            → topbar-only
 *   - `/dashboard`             → full chrome
 *   - `/accounts/123`          → full chrome (nested)
 *   - `/auth/signin`           → no chrome
 *   - `/this-does-not-exist`   → topbar-only
 *
 * The AppShell's JSX rendering is a thin projection of
 * `pickChromeVariant` + the active pathname; the
 * per-component tests (topbar / sidebar / bottom-tab-bar
 * / language-switcher) cover the interactive behavior.
 * PR 5's Playwright e2e covers the end-to-end behavior in
 * a real browser.
 */

import { describe, expect, it } from 'vitest';

import { pickChromeVariant } from './app-shell';

describe('pickChromeVariant (AppShell T-PR3-06 matrix)', () => {
  describe.each([
    { pathname: '/', expected: 'topbar-only' as const },
    { pathname: '/dashboard', expected: 'full' as const },
    { pathname: '/dashboard/123', expected: 'full' as const },
    { pathname: '/accounts', expected: 'full' as const },
    { pathname: '/accounts/123', expected: 'full' as const },
    { pathname: '/transactions', expected: 'full' as const },
    { pathname: '/transactions/abc', expected: 'full' as const },
    { pathname: '/auth/signin', expected: 'none' as const },
    { pathname: '/auth/register', expected: 'none' as const },
    { pathname: '/auth/signin/google/callback', expected: 'none' as const },
    { pathname: '/this-does-not-exist', expected: 'topbar-only' as const },
  ])('pathname=$pathname → $expected', ({ pathname, expected }) => {
    it(`returns '${expected}'`, () => {
      expect(pickChromeVariant(pathname)).toBe(expected);
    });
  });

  it('treats an empty pathname (server-side x-pathname header before proxy writes it) as topbar-only', () => {
    expect(pickChromeVariant('')).toBe('topbar-only');
  });
});
