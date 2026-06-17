/**
 * `withRetry` — run an async function with bounded retry and
 * exponential backoff. Used by `signInCallback` to give the
 * `lastLoginAt` write a chance to survive transient Prisma
 * outages (connection blip, brief failover, lock wait)
 * before logging an error.
 *
 * Policy:
 *   - 3 attempts by default (1 initial + 2 retries).
 *   - Exponential backoff: 1s, 2s, 4s (doubles each time).
 *   - Jittered +/-20% to avoid thundering-herd retries when
 *     many sign-ins hit the same transient failure.
 *   - Returns the last successful value, or throws the last
 *     error after all attempts are exhausted. The caller
 *     decides whether to log-and-swallow or propagate.
 */

export interface RetryOptions {
  /** Total number of attempts (default 3). Must be >= 1. */
  attempts?: number;
  /** Base delay in ms; doubled each retry. Default 1000. */
  baseDelayMs?: number;
  /** Jitter fraction 0..1 applied to each delay. Default 0.2. */
  jitter?: number;
  /** Predicate: if it returns true, the error is fatal (no retry). */
  shouldRetry?: (err: unknown) => boolean;
  /** Hook called before each retry; useful for logging. */
  onRetry?: (err: unknown, nextAttempt: number, delayMs: number) => void;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_JITTER = 0.2;

function jitteredDelay(baseMs: number, attempt: number, jitter: number): number {
  // 2^(attempt-1) * baseMs, with +-jitter% randomness.
  const exp = Math.pow(2, attempt - 1);
  const raw = baseMs * exp;
  if (jitter <= 0) return raw;
  const span = raw * jitter;
  return raw + (Math.random() * 2 - 1) * span;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const jitter = options.jitter ?? DEFAULT_JITTER;
  const shouldRetry = options.shouldRetry ?? (() => true);

  if (attempts < 1) throw new Error('withRetry: attempts must be >= 1');

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLast = attempt === attempts;
      const retryable = !isLast && shouldRetry(err);
      if (!retryable) break;
      const delayMs = jitteredDelay(baseDelayMs, attempt, jitter);
      options.onRetry?.(err, attempt + 1, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
