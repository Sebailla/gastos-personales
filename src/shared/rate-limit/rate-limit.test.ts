/**
 * Tests for the rate-limit helper used by
 * `app/api/auth/[...nextauth]/route.ts`. The Upstash client
 * is mocked because hitting a real Upstash project would
 * (a) require real env vars and (b) introduce flakiness.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `vi.hoisted` runs before the mock factory, so the same mock
// instance is returned every time `new Ratelimit(...)` is
// invoked from `rate-limit.ts`.
const upstashMock = vi.hoisted(() => {
  const limit = vi.fn();
  return { limit };
});

vi.mock('@upstash/ratelimit', () => {
  // The factory uses `vi.fn()` so the constructor itself can be
  // spied on. The class is a regular function (not `class`) so
  // `new` returns our object with a `limit` method.
  const Ratelimit = vi.fn(function () {
    return { limit: upstashMock.limit };
  });
  // The static `slidingWindow` is called as `Ratelimit.slidingWindow(...)`.
  // We just return a deterministic tuple — the value isn't inspected
  // because we never assert against the algorithm shape.
  (Ratelimit as unknown as { slidingWindow: ReturnType<typeof vi.fn> }).slidingWindow = vi.fn(() => '5/60s');
  return { Ratelimit };
});

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(),
}));

import {
  checkRateLimit,
  assertWithinRateLimit,
  clientIpFromHeaders,
  RateLimitError,
  _resetLimiterCacheForTests,
} from './rate-limit';

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_RATELIMIT_LIMIT;
  delete process.env.UPSTASH_RATELIMIT_WINDOW;
  upstashMock.limit.mockReset();
  _resetLimiterCacheForTests();
});

afterEach(() => {
  process.env = { ...originalEnv };
  _resetLimiterCacheForTests();
});

describe('clientIpFromHeaders', () => {
  it('returns the first IP from x-forwarded-for', () => {
    expect(clientIpFromHeaders(new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });
  it('falls back to x-real-ip', () => {
    expect(clientIpFromHeaders(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });
  it('falls back to "anonymous" when no proxy headers present', () => {
    expect(clientIpFromHeaders(new Headers())).toBe('anonymous');
  });
});

describe('checkRateLimit (no Upstash configured)', () => {
  it('returns a no-op success result when env vars are unset', async () => {
    const result = await checkRateLimit('test-id');
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('checkRateLimit (Upstash configured)', () => {
  it('returns success when the limit() call allows the request', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    upstashMock.limit.mockResolvedValueOnce({
      success: true,
      remaining: 4,
      reset: 30_000,
      limit: 5,
    });
    const result = await checkRateLimit('ip:1.2.3.4');
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
    expect(upstashMock.limit).toHaveBeenCalledWith('ip:1.2.3.4');
  });

  it('returns failure when the limit() call rejects the request', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    upstashMock.limit.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset: 30_000,
      limit: 5,
    });
    const result = await checkRateLimit('ip:1.2.3.4');
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe('assertWithinRateLimit', () => {
  it('throws RateLimitError when the limit() call rejects the request', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    upstashMock.limit.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset: 30_000,
      limit: 5,
    });
    await expect(assertWithinRateLimit('ip:1.2.3.4')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('returns the result when the limit() call allows the request', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    upstashMock.limit.mockResolvedValueOnce({
      success: true,
      remaining: 4,
      reset: 30_000,
      limit: 5,
    });
    const result = await assertWithinRateLimit('ip:1.2.3.4');
    expect(result.success).toBe(true);
  });

  it('returns a no-op success when Upstash env vars are unset (no throw)', async () => {
    await expect(assertWithinRateLimit('ip:1.2.3.4')).resolves.toMatchObject({ success: true });
  });
});

describe('RateLimitError', () => {
  it('carries resetMs and limit fields', () => {
    const err = new RateLimitError('boom', 30_000, 5);
    expect(err.name).toBe('RateLimitError');
    expect(err.resetMs).toBe(30_000);
    expect(err.limit).toBe(5);
    expect(err.message).toBe('boom');
  });
});
