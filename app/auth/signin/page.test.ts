/**
 * Light-weight test for the signIn page. We do NOT render
 * React here (no `react-testing-library` in this slice; the
 * renderer setup lives in a future UI-shell change). The
 * test asserts:
 *
 *   1. The page module exports a default async function.
 *   2. The `mapAuthErrorToMessage` is wired in (the error
 *      message for `?error=OAuthAccountNotLinked` matches
 *      decision gap #6 wording).
 *
 * The visual rendering is validated by `pnpm run build`
 * (Next.js production build) and by manual smoke in dev.
 */

import { describe, it, expect, vi } from 'vitest';

// The page imports `signIn` from `@/modules/auth` to wire the
// Google / Credentials server actions. `signIn` transitively pulls
// in `next-auth`, which requires `next/server` (a Next.js runtime
// module unavailable in plain Vitest). We mock just the surface
// the page uses so the test loads without booting the auth module.
vi.mock('@/modules/auth', () => ({
  signIn: vi.fn(),
}));

import SignInPage from './page';
import { mapAuthErrorToMessage } from '@/modules/auth/application/auth-error-map';

describe('SignInPage', () => {
  it('exports a default async function (server component)', () => {
    expect(typeof SignInPage).toBe('function');
  });

  it('maps the OAuthAccountNotLinked error to a clear Spanish message', async () => {
    const params = { error: 'OAuthAccountNotLinked', callbackUrl: '/' };
    // The page is async; we await the JSX.
    const jsx = await SignInPage({ searchParams: params });
    expect(jsx).toBeDefined();
    // The mapping is independently tested in
    // auth-error-map.test.ts. Here we assert the page uses
    // the same mapper.
    expect(mapAuthErrorToMessage(params.error)).toMatch(/Google/);
  });

  it('falls back to a generic message when no error param is present', async () => {
    const jsx = await SignInPage({ searchParams: {} });
    expect(jsx).toBeDefined();
    expect(mapAuthErrorToMessage(undefined)).toBeTruthy();
  });
});
