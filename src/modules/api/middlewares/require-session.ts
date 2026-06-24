/**
 * requireSession — Hono middleware for routes that require
 * an authenticated session.
 *
 * The Hono `authMiddleware` (in `src/modules/api/app.ts`)
 * sets `c.set('user', session?.user ?? null)` once per
 * request. `requireSession` short-circuits the route
 * handler when the user is `null` by throwing
 * `AppError(UNAUTHORIZED)` (caught by the central
 * `errorHandler` and surfaced as `401 UNAUTHORIZED`).
 *
 * The middleware is typed with `Variables: ProtectedVariables`
 * so that downstream handlers on the protected sub-app see
 * `c.get('user')` as the non-null `AuthUser` shape (instead
 * of `AuthUser | null`). The 7 protected accounts routes
 * rely on this narrowing to drop their `if (!user) return ...`
 * guards; the `asserts c is ...` parameter is the TypeScript
 * mechanism that carries the narrowed type into the handler.
 *
 * Per `accounts-ledger/design.md` §4.2: `requireSession`
 * runs per-route (not globally) so the public routes
 * (`/health`, `/auth/register`, `/api/readyz`, etc.) keep
 * working without a session.
 */

import { createMiddleware } from 'hono/factory';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import type { AuthUser } from './variables';

export const requireSession = createMiddleware<{ Variables: { user: AuthUser } }>(
  async (c, next) => {
    // F-11: the narrowed `Variables: { user: AuthUser }`
    // generic on `createMiddleware` already carries the
    // narrowed type to downstream handlers via
    // `asserts c is ...`. The previous `c.set('user', user)`
    // was a redundant write of the same value.
    const user = c.get('user') as AuthUser | null | undefined;
    if (!user || !user.id) {
      throw new AppError({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Autenticación requerida.',
      });
    }
    await next();
  },
);
