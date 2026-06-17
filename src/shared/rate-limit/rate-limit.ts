/**
 * Rate limiting via Upstash Ratelimit + Upstash Redis.
 *
 * Used to bound the CPU cost of
 * `/api/auth/callback/credentials` and `/api/auth/register`,
 * both of which run Argon2id (~50-100 ms per attempt on the
 * target 1-CPU VM). Without a limit, an attacker can probe
 * arbitrary emails at full CPU.
 *
 * The helper is a no-op when the Upstash env vars are unset:
 * the limiter initialises as `null` and every check returns
 * `{ success: true, remaining: Infinity }`. This lets the app
 * run locally and in CI without a Upstash project, and lets
 * us wire the calls into the request path without a separate
 * `if (rateLimitEnabled)` branch at every call site.
 *
 * Algorithm: sliding window. Default 5 attempts per IP per
 * 60 s. Override via env (UPSTASH_RATELIMIT_LIMIT,
 * UPSTASH_RATELIMIT_WINDOW).
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number; // ms until the window resets
  limit: number;
}

interface LimiterConfig {
  redisUrl: string;
  redisToken: string;
  limit: number;
  windowMs: number;
}

let cachedLimiter: Ratelimit | null | undefined; // undefined = not yet initialised

function readLimiter(): Ratelimit | null {
  if (cachedLimiter !== undefined) return cachedLimiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cachedLimiter = null;
    return null;
  }
  const limit = Number(process.env.UPSTASH_RATELIMIT_LIMIT ?? 5);
  const windowSec = Number(process.env.UPSTASH_RATELIMIT_WINDOW ?? 60);
  const redis = new Redis({ url, token });
  cachedLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
    analytics: false,
    prefix: 'gastos-personales:ratelimit',
  });
  return cachedLimiter;
}

const NOOP_RESULT: RateLimitResult = {
  success: true,
  remaining: Number.POSITIVE_INFINITY,
  reset: 0,
  limit: Number.POSITIVE_INFINITY,
};

/**
 * Check whether the given identifier (typically an IP address
 * + route key) is within the rate limit. Returns the limiter
 * decision. When the limiter is unconfigured (no Upstash env
 * vars), returns a no-op success result so callers do not need
 * to branch.
 */
export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const limiter = readLimiter();
  if (!limiter) return NOOP_RESULT;
  const { success, remaining, reset, limit } = await limiter.limit(identifier);
  return { success, remaining, reset, limit };
}

/**
 * Same as `checkRateLimit`, but throws `RateLimitError` (HTTP
 * 429) when the limit is exceeded. Callers should catch and
 * translate to a 429 response, or let Next.js surface it.
 */
export async function assertWithinRateLimit(identifier: string): Promise<RateLimitResult> {
  const result = await checkRateLimit(identifier);
  if (!result.success) {
    throw new RateLimitError(
      `Rate limit exceeded for ${identifier}`,
      result.reset,
      result.limit,
    );
  }
  return result;
}

export class RateLimitError extends Error {
  readonly resetMs: number;
  readonly limit: number;
  constructor(message: string, resetMs: number, limit: number) {
    super(message);
    this.name = 'RateLimitError';
    this.resetMs = resetMs;
    this.limit = limit;
  }
}

/** Extract the best-effort client IP from common proxy headers. */
export function clientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return 'anonymous';
}

/**
 * Test seam: reset the cached limiter so tests can flip env vars
 * between cases. Production code should never call this.
 */
export function _resetLimiterCacheForTests(): void {
  cachedLimiter = undefined;
}

export type { LimiterConfig };
