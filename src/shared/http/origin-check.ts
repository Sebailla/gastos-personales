/**
 * originCheck — Hono middleware for mutating routes
 * (`POST /api/auth/register`, future mutating application
 * routes). The middleware enforces BR-AUTH-12:
 *
 *   - A POST request with an `Origin` header that does not
 *     match the configured app origin is rejected with 403
 *     FORBIDDEN.
 *   - A POST request with no `Origin` header is allowed
 *     (browsers omit the header on some same-origin
 *     navigations and on `application/json` CORS requests
 *     that have not been pre-flighted; we want to allow
 *     the application shell, not block it).
 *   - When both `Origin` and `Referer` are present and
 *     disagree, `Origin` wins (per RFC 6454, the Origin
 *     header is the source of truth for the request's
 *     origin in modern browsers).
 *
 * The middleware reads the allowed origin from the env
 * (`env.APP_URL`); the env schema already asserts
 * `APP_URL` and `AUTH_URL` share the same origin, so this
 * check is consistent with the Auth.js callback URL.
 */

import type { MiddlewareHandler } from 'hono';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import { env } from '@/shared/env/env.schema';

let allowedOrigin: string | undefined;

function getAllowedOrigin(): string {
  if (!allowedOrigin) {
    allowedOrigin = new URL(env.APP_URL).origin;
  }
  return allowedOrigin;
}

/** Test seam: reset the cached origin between tests. */
export function __resetOriginCheckForTests(): void {
  allowedOrigin = undefined;
}

export function originCheck(): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
      await next();
      return;
    }
    const origin = c.req.header('origin');
    if (!origin) {
      // No Origin header: assume same-origin and allow.
      await next();
      return;
    }
    if (new URL(origin).origin !== getAllowedOrigin()) {
      throw new AppError({
        code: ErrorCode.FORBIDDEN,
        message: 'Origen no permitido.',
      });
    }
    await next();
  };
}
