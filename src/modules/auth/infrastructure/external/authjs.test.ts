// Tests for the public surface of `authjs.ts` AND the two Auth.js
// v5 callbacks that live in this file (`session`, `redirect`).
//
// Strategy: import the REAL `./authjs` module, but mock its
// transitive dependencies (`next-auth`, `@auth/prisma-adapter`, the
// provider constructors) because they require `next/server` (a
// Next.js runtime module unavailable in plain Vitest — see DELTA-C1.1
// of auth-foundation-slice-c, issue #18).
//
// What we test:
//   1. `authConfig` shape — session strategy, providers, pages, secret.
//   2. `DUMMY_HASH` — generated once at module init, idempotent.
//   3. The exported surface (`handlers`, `auth`, `signIn`, `signOut`)
//      exists and is callable.
//   4. `callbacks.session` — sets `session.user.id` and
//      `session.user.defaultProvider` from the DB; degrades gracefully
//      on prisma errors; handles null `defaultProvider`.
//   5. `callbacks.redirect` — same-origin paths allowed, protocol-
//      relative rejected, external URLs rewritten to baseUrl, malformed
//      URLs fall through to baseUrl.
//
// `signInCallback` itself is covered in `authjs.signin-callback.test.ts`.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks must be declared before the import of the module under test.

const mocks = vi.hoisted(() => {
  // The `findUnique` shape depends on which callback is invoking it,
  // so we let each test override per-call. Same trick as the
  // signin-callback test — the same `prisma` fn is returned on every
  // call so the callback under test and the test's `expect(...)` see
  // the same mock instance.
  const findUnique = vi.fn();
  const prisma = vi.fn(() => ({ user: { findUnique } }));
  return { prisma, findUnique };
});

vi.mock('@/shared/db/prisma', () => ({
  prisma: mocks.prisma,
}));

// The session callback doesn't actually call the logger today
// (see `propagates the UserRepository error` test) but we still
// stub the module so the import doesn't try to wire Sentry.
vi.mock('@/shared/logger/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/shared/env/env.schema', () => ({
  env: {
    AUTH_SECRET: 'ci-only-secret-32-bytes-min-padding-padding-padding',
    AUTH_GOOGLE_ID: 'ci-google-id',
    AUTH_GOOGLE_SECRET: 'ci-google-secret',
    ARGON2ID_DUMMY_PASSWORD: 'ci-dummy-password-32-bytes-min-padding',
  },
}));

vi.mock('next-auth', () => ({
  default: () => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('next-auth/providers/google', () => ({
  default: () => ({ name: 'Google' }),
}));
vi.mock('next-auth/providers/credentials', () => ({
  default: () => ({ name: 'Credentials' }),
}));

// We mock the encrypted adapter as a no-op identity adapter: the
// adapter doesn't run on any code path tested here (the callbacks
// are invoked directly, not through Auth.js's adapter chain).
vi.mock('../adapters/encrypted-prisma-adapter', () => ({
  createEncryptedPrismaAdapter: () => ({}),
}));

import { authConfig, DUMMY_HASH, handlers, auth, signIn, signOut } from './authjs';

const findUnique = mocks.findUnique;

beforeEach(() => {
  findUnique.mockReset();
});

describe('authConfig (Auth.js v5 wiring)', () => {
  it('uses database session strategy with 30-day maxAge and 24-hour sliding window', () => {
    expect(authConfig.session?.strategy).toBe('database');
    expect(authConfig.session?.maxAge).toBe(30 * 24 * 60 * 60);
    expect(authConfig.session?.updateAge).toBe(24 * 60 * 60);
  });

  it('configures the Google and Credentials providers', () => {
    const ids = (authConfig.providers ?? []).map((p) => p.name);
    expect(ids).toContain('Google');
    expect(ids).toContain('Credentials');
  });

  it('points pages.signIn at /auth/signin', () => {
    expect(authConfig.pages?.signIn).toBe('/auth/signin');
    expect(authConfig.pages?.signOut).toBe('/auth/signout');
  });

  it('uses the AUTH_SECRET from the env schema', () => {
    expect(authConfig.secret).toBeDefined();
    expect((authConfig.secret ?? '').length).toBeGreaterThanOrEqual(32);
  });
});

describe('DUMMY_HASH', () => {
  it('is a Promise<string> resolving to an Argon2id encoded string', async () => {
    expect(DUMMY_HASH).toBeInstanceOf(Promise);
    const resolved = await DUMMY_HASH;
    expect(resolved).toMatch(/^\$argon2id\$/);
    expect(resolved.length).toBeGreaterThan(40);
  });
});

describe('module export surface', () => {
  it('exports handlers, auth, signIn, and signOut as callable functions', () => {
    expect(typeof handlers).toBe('object');
    expect(typeof handlers.GET).toBe('function');
    expect(typeof handlers.POST).toBe('function');
    expect(typeof auth).toBe('function');
    expect(typeof signIn).toBe('function');
    expect(typeof signOut).toBe('function');
  });
});

describe('callbacks.session', () => {
  // Resolve the `session` callback as Auth.js would invoke it.
  const invokeSession = (params: { session: Record<string, unknown>; user?: { id?: string } }) => {
    const cb = authConfig.callbacks?.session;
    if (!cb) throw new Error('callbacks.session is not defined');
    return cb(params as never);
  };

  it('sets session.user.id from the user arg and reads defaultProvider from the DB', async () => {
    findUnique.mockResolvedValueOnce({
      defaultProvider: 'google',
      lastLoginAt: new Date('2026-06-12T10:00:00Z'),
    });
    const result = await invokeSession({
      session: { user: { email: 'alice@example.com' } },
      user: { id: 'u-1' },
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      select: { defaultProvider: true, lastLoginAt: true },
    });
    const user = result.user as { id: string; defaultProvider: string; lastLoginAt: string };
    expect(user.id).toBe('u-1');
    expect(user.defaultProvider).toBe('google');
    expect(user.lastLoginAt).toBe('2026-06-12T10:00:00.000Z');
  });

  it('propagates the UserRepository error (no graceful degradation — flagged in PR body)', async () => {
    // NOTE: the production `session` callback does NOT wrap the
    // `prisma().user.findUnique` call in try/catch. The contract
    // documented for this callback is "graceful degradation", so
    // today's behaviour is a documented-vs-implemented drift. We're
    // flagging it in the PR body and leaving the fix to a follow-up
    // change (scope creep to fix here).
    findUnique.mockRejectedValueOnce(new Error('db down'));
    const session = { user: { email: 'alice@example.com' } };
    await expect(invokeSession({ session, user: { id: 'u-2' } })).rejects.toThrow('db down');
  });

  it('returns the session unchanged when user.id is missing', async () => {
    const session = { user: { email: 'alice@example.com' } };
    const result = await invokeSession({ session, user: {} });
    expect(result.user).toEqual(session.user);
    // No DB call when there's no user.id to look up.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('serialises a null defaultProvider as null in the session', async () => {
    findUnique.mockResolvedValueOnce({ defaultProvider: null, lastLoginAt: null });
    const result = await invokeSession({
      session: { user: { email: 'ghost@example.com' } },
      user: { id: 'u-3' },
    });

    const user = result.user as {
      id: string;
      defaultProvider: string | null;
      lastLoginAt: string | null;
    };
    expect(user.id).toBe('u-3');
    expect(user.defaultProvider).toBeNull();
    expect(user.lastLoginAt).toBeNull();
  });

  it('does nothing when session.user is undefined', async () => {
    const result = await invokeSession({ session: {}, user: { id: 'u-4' } });
    expect(result).toEqual({});
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('callbacks.redirect', () => {
  const invokeRedirect = (params: { url: string; baseUrl: string }) => {
    const cb = authConfig.callbacks?.redirect;
    if (!cb) throw new Error('callbacks.redirect is not defined');
    return cb(params as never);
  };

  it('allows same-origin paths (not protocol-relative)', async () => {
    await expect(
      invokeRedirect({ url: '/dashboard', baseUrl: 'https://app.example.com' }),
    ).resolves.toBe('https://app.example.com/dashboard');
  });

  it('rejects protocol-relative URLs (//evil.com) and falls through to baseUrl', async () => {
    // Protocol-relative is the start of an off-site redirect; the
    // custom callback treats it like any other non-same-origin URL.
    await expect(
      invokeRedirect({ url: '//evil.com/phish', baseUrl: 'https://app.example.com' }),
    ).resolves.toBe('https://app.example.com');
  });

  it('allows same-origin absolute URLs (origin matches baseUrl)', async () => {
    await expect(
      invokeRedirect({
        url: 'https://app.example.com/settings',
        baseUrl: 'https://app.example.com',
      }),
    ).resolves.toBe('https://app.example.com/settings');
  });

  it('rewrites external hosts to baseUrl', async () => {
    await expect(
      invokeRedirect({ url: 'https://evil.example.com/x', baseUrl: 'https://app.example.com' }),
    ).resolves.toBe('https://app.example.com');
  });

  it('falls through to baseUrl on malformed URLs', async () => {
    await expect(
      invokeRedirect({ url: 'not a url at all', baseUrl: 'https://app.example.com' }),
    ).resolves.toBe('https://app.example.com');
  });
});
