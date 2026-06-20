import type { ErrorHandler } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import { RateLimitError } from '@/shared/rate-limit/rate-limit';
import { logger } from '@/shared/logger/logger';

/**
 * Narrow union of HTTP status codes the application emits
 * for AppError, kept in sync with `ErrorStatus` (see
 * `src/shared/errors/error-codes.ts`). The central error
 * handler casts `err.statusCode` (typed as `number`) to
 * this union so adding a new code outside the union fails
 * the cast at compile time. `StatusCode` (Hono's full
 * status-code union) is too wide to surface that drift;
 * this narrower union is the intent of F-20's tightening.
 */
type AppErrorStatusCode = 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502 | 503;

/**
 * Central error handler. Every Hono route's thrown error flows
 * through here. The shape is the contract documented in the
 * `api-design` skill:
 *
 *   { error: { code, message, details? } }
 *
 * - `AppError`: passed through with `code`, `message`, `details`.
 * - `RateLimitError`: mapped to `429 RATE_LIMITED` with the
 *   limiter's reset window attached as `Retry-After`.
 * - Anything else: logged with full stack, surface becomes
 *   `{ code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' }`.
 *   The original error is never sent to the client.
 */
export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = (c.get('requestId') as string | undefined) ?? 'no-request-id';

  if (err instanceof RateLimitError) {
    logger.warn('rate_limited', {
      requestId,
      resetMs: err.resetMs,
      limit: err.limit,
    });
    // `err.resetMs` is a Unix timestamp in milliseconds (the
    // Upstash Ratelimit contract: `reset` is "the time at
    // which the current rate limit window resets in UTC
    // epoch milliseconds", per `@upstash/ratelimit` docs).
    // HTTP `Retry-After` is a delta-seconds value, so we
    // convert to a duration. Clamp to [1, 3600] so a stale
    // or future timestamp can never advertise a value
    // shorter than 1 s or longer than 1 h (orchestrator-
    // friendly bound).
    const deltaMs = err.resetMs - Date.now();
    const retryAfterSec = Math.max(1, Math.min(3600, Math.ceil(deltaMs / 1000)));
    c.header('Retry-After', String(retryAfterSec));
    return c.json(
      {
        error: {
          code: ErrorCode.RATE_LIMITED,
          message: 'Demasiadas solicitudes. Probá de nuevo en unos segundos.',
        },
      },
      429,
    );
  }

  if (err instanceof AppError) {
    // `err.cause` is an internal detail: log it so the
    // deployment is observable, but never include it in
    // the HTTP response (could leak PII, stack frames, or
    // upstream secrets).
    logger.warn('app_error', {
      requestId,
      code: err.code,
      statusCode: err.statusCode,
      message: err.message,
      details: err.details,
      cause:
        err.cause instanceof Error
          ? { name: err.cause.name, message: err.cause.message, stack: err.cause.stack }
          : err.cause,
    });
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.statusCode as unknown as AppErrorStatusCode as StatusCode,
    );
  }

  // Unknown error: log with full stack, surface a safe envelope.
  logger.error('unhandled_error', {
    requestId,
    errorName: err instanceof Error ? err.name : 'Unknown',
    errorMessage: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return c.json(
    {
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Ocurrió un error inesperado.',
      },
    },
    500,
  );
};
