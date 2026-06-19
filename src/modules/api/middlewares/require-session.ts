/**
 * requireSession — Hono middleware factory for routes
 * that require an authenticated session.
 *
 * The Hono `authMiddleware` (in `src/modules/api/app.ts`)
 * sets `c.set('user', session?.user ?? null)` once per
 * request. `requireSession` short-circuits the route
 * handler when the user is `null` by throwing
 * `AppError(UNAUTHORIZED)` (caught by the central
 * `errorHandler` and surfaced as `401 UNAUTHORIZED`).
 *
 * The 7 accounts routes (T-B9) and any future capability
 * (transactions, fx-cache, snapshots, reports) wrap their
 * handlers in `requireSession` to enforce the spec's
 * "All endpoints require an authenticated session" rule.
 *
 * Per `accounts-ledger/design.md` §4.2: `requireSession`
 * runs per-route (not globally) so the public routes
 * (`/health`, future `/api/auth/*` through the catch-all
 * if any) keep working without a session.
 */

import type { MiddlewareHandler } from 'hono';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';

export const requireSession: MiddlewareHandler = async (c, next) => {
  const user = c.get('user') as { id: string; email: string } | null | undefined;
  if (!user || !user.id) {
    throw new AppError({
      code: ErrorCode.UNAUTHORIZED,
      message: 'Autenticación requerida.',
    });
  }
  await next();
};
