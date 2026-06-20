/**
 * Direct unit tests for the `signInCallback` extracted from
 * `authjs.ts`. Pins the four observable behaviours of the callback
 * so the BR-AUTH-7 audit-trail contract cannot silently regress:
 *
 *   1. user with email + matching row     → updateMany called, no warn, returns true
 *   2. user with email + no matching row  → updateMany called, warn logged, returns true
 *   3. user with email + prisma throws    → updateMany called, error logged, returns true
 *   4. user without email                 → no DB call, returns true
 *
 * Rationale for the "always return true" contract: the user has
 * already authenticated with the provider (Google / Credentials)
 * by the time the callback runs. Blocking sign-in because of a
 * tracking-write failure (Prisma outage, missing row, etc.) is the
 * wrong trade. See commit `d20c8c3`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.hoisted` runs before the mock factories, so the same mocked
// `prisma` function (and the same `user.updateMany` vi.fn inside
// it) is returned on every call. Otherwise the callback under test
// and the test's `expect(...).toHaveBeenCalledWith(...)` would see
// different mock instances.
const mocks = vi.hoisted(() => {
  const updateMany = vi.fn();
  const prisma = vi.fn(() => ({ user: { updateMany } }));
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { prisma, updateMany, logger };
});

// Mocks must be declared before importing the module under test.
vi.mock('@/shared/db/prisma', () => ({
  prisma: mocks.prisma,
}));

vi.mock('@/shared/logger/logger', () => ({ logger: mocks.logger }));

// The `authjs.ts` module transitively imports `next-auth` and its
// providers, which require `next/server` (a Next.js runtime module
// unavailable in plain Vitest). We mock just the surface used by
// the module init: the `NextAuth()` factory and the provider
// constructors. The named exports we are testing (`signInCallback`,
// `normalizeEmail`) are pure and do not call any of these mocks.
vi.mock('next-auth', () => ({
  default: () => ({
    handlers: {},
    auth: () => () => undefined,
    signIn: () => undefined,
    signOut: () => undefined,
  }),
}));
vi.mock('next-auth/providers/google', () => ({
  default: () => ({}),
}));
vi.mock('next-auth/providers/credentials', () => ({
  default: () => ({}),
}));
vi.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: () => ({}),
}));

import { signInCallback, normalizeEmail } from './authjs';

const updateMany = mocks.updateMany;
const warn = mocks.logger.warn;
const error = mocks.logger.error;

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Foo@Example.COM  ')).toBe('foo@example.com');
  });
});

describe('signInCallback', () => {
  beforeEach(() => {
    updateMany.mockReset();
    warn.mockReset();
    error.mockReset();
  });

  it('updates lastLoginAt when the user row exists', async () => {
    updateMany.mockResolvedValueOnce({ count: 1 });
    const result = await signInCallback({ user: { email: 'Alice@Example.com' } });
    expect(result).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { email: 'alice@example.com' },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('logs a warn and still returns true when no row matches the email', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await signInCallback({ user: { email: 'ghost@example.com' } });
    expect(result).toBe(true);
    expect(warn).toHaveBeenCalledWith('signIn_callback_user_not_found', {
      email: 'ghost@example.com',
    });
    expect(error).not.toHaveBeenCalled();
  });

  it('logs retries and an error and still returns true when prisma throws on every attempt', async () => {
    updateMany.mockRejectedValue(new Error('db down'));
    const result = await signInCallback({ user: { email: 'a@b.com' } });
    expect(result).toBe(true);
    // withRetry attempts 3 times: 1 initial + 2 retries, so 2 warn
    // calls (one per retry) + 1 final error after all attempts fail.
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'signIn_callback_retry',
      expect.objectContaining({ email: 'a@b.com' }),
    );
    expect(error).toHaveBeenCalledWith('signIn_callback_failed', {
      email: 'a@b.com',
      error: 'db down',
    });
  });

  it('returns true without touching the DB when email is missing', async () => {
    const result = await signInCallback({ user: {} });
    expect(result).toBe(true);
    expect(updateMany).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('returns true without touching the DB when user is undefined', async () => {
    const result = await signInCallback({});
    expect(result).toBe(true);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('normalises the email before querying (whitespace + case)', async () => {
    updateMany.mockResolvedValueOnce({ count: 1 });
    await signInCallback({ user: { email: '  Foo@Example.COM ' } });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'foo@example.com' } }),
    );
  });
});
