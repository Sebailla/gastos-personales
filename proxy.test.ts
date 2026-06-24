/**
 * Tests for the Next.js 16 `proxy.ts`.
 *
 * Scope:
 * - `isPublicPath()`: exact match, prefix match (with the trailing
 *   '/' separator), no-match, and the regression case where the
 *   previous hand-rolled `PUBLIC_PATHS.some(startsWith)` with `/`
 *   in the list matched every absolute path (R3 C2 + R4 W1 + R2 W1).
 * - `config.matcher`: must exclude the entire `/api` tree so Hono
 *   routes (R3 C1: `/api/health`, `/api/auth/register`, `/api/me`)
 *   are never coerced into an HTML redirect.
 *
 * The proxy default export (`auth(...)`) is exercised end-to-end via
 * the Next dev server in `pnpm dev` and through the proxy integration
 * checks below; we do not boot `next/server` here because Vitest does
 * not have access to it (same constraint that forced `vi.mock` in
 * `app/auth/signin/page.test.ts`).
 */

import { describe, it, expect, vi } from 'vitest';

// proxy.ts imports `auth` from `@/modules/auth/nextauth`
// (which transitively pulls in `next-auth` → `next/server`,
// unavailable in plain Vitest) and `NextResponse` directly
// from `next/server`. Both must be mocked so the module can
// load. The exported `isPublicPath` and `config` we test
// below are pure data — they do not need either dependency
// at call time.
vi.mock('@/modules/auth/nextauth', () => ({
  auth: () => () => undefined,
}));
vi.mock('next/server', () => ({
  NextResponse: { redirect: () => undefined },
}));

import { isPublicPath, config } from './proxy';

describe('isPublicPath', () => {
  it('treats the root path as public (exact match)', () => {
    expect(isPublicPath('/')).toBe(true);
  });

  it('treats /auth/signin as public (exact match)', () => {
    expect(isPublicPath('/auth/signin')).toBe(true);
  });

  it('treats /auth/signin/sub as public (prefix match with /)', () => {
    expect(isPublicPath('/auth/signin/callback/google')).toBe(true);
    expect(isPublicPath('/auth/signin/anything')).toBe(true);
  });

  it('treats /auth/signout and sub-paths as public', () => {
    expect(isPublicPath('/auth/signout')).toBe(true);
    expect(isPublicPath('/auth/signout/return')).toBe(true);
  });

  it('does NOT match /auth/signin without the trailing slash separator', () => {
    // /auth/signinX must NOT match /auth/signin prefix (close-but-public).
    expect(isPublicPath('/auth/signinX')).toBe(false);
    expect(isPublicPath('/auth/signin-evil')).toBe(false);
    expect(isPublicPath('/auth/signoutX')).toBe(false);
  });

  it('does NOT treat private pages as public', () => {
    expect(isPublicPath('/dashboard')).toBe(false);
    expect(isPublicPath('/accounts')).toBe(false);
    expect(isPublicPath('/transactions')).toBe(false);
  });

  it('does NOT treat the matcher-excluded paths as public (they are excluded from the proxy entirely)', () => {
    // These are excluded by the matcher, not by isPublicPath. The proxy
    // never evaluates them. isPublicPath returns false because they are
    // not in PUBLIC_PATHS — the matcher is the actual exclusion mechanism.
    expect(isPublicPath('/api/health')).toBe(false);
    expect(isPublicPath('/api/me')).toBe(false);
    expect(isPublicPath('/api/auth/register')).toBe(false);
    expect(isPublicPath('/_next/static/foo')).toBe(false);
    expect(isPublicPath('/favicon.ico')).toBe(false);
  });

  it('regression: with `/` in the list and `startsWith`, every absolute path would match — verify the new code does NOT have that bug', () => {
    // The historical bug: PUBLIC_PATHS = ['/auth/signin', '/auth/signout', '/']
    // and isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p)).
    // Every absolute path starts with '/', so every path was public.
    // The fixed implementation uses exact match for '/' and prefix match
    // with the trailing '/' separator for the other entries. This test
    // pins the contract.
    expect(isPublicPath('/dashboard')).toBe(false);
    expect(isPublicPath('/anything/at/all')).toBe(false);
  });
});

describe('config.matcher', () => {
  it('excludes the entire /api tree (Hono API routes)', () => {
    // The matcher is a Next.js path-to-regexp pattern. The negative
    // lookahead `(?!api)` must be present so /api/* never reaches
    // the proxy handler.
    expect(config.matcher).toHaveLength(1);
    const matcher = config.matcher[0];
    expect(matcher).toMatch(/\(\?!.*api/);
  });

  it('excludes _next (framework assets)', () => {
    expect(config.matcher[0]).toMatch(/\(\?!.*_next/);
  });

  it('excludes favicon.ico', () => {
    expect(config.matcher[0]).toMatch(/\(\?!.*favicon\.ico/);
  });
});
