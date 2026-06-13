/**
 * meAction — application-layer entry point for `GET /api/me`.
 *
 * The Hono route in `src/modules/api/app.ts` calls
 * `auth()` (Auth.js) once per request and sets `c.set('user', session?.user ?? null)`.
 * This action reads that context value; if it is null
 * (no session, missing cookie, expired session, or the
 * user has been deleted from the DB), the action returns
 * 401 UNAUTHORIZED with the same response shape across
 * all four failure modes — a deliberate choice so the
 * client cannot distinguish "no session" from "expired"
 * from "unknown user" (no oracle attack).
 *
 * On success the action returns the PublicUser projection
 * built from `AuthService.buildPublicUser`.
 */

import type { Context } from 'hono';
import type { AuthService } from '@/modules/auth/domain/services/auth.service';
import type { PublicUserShape } from '@/modules/auth/domain/value-objects/public-user';
import { ErrorCode } from '@/shared/errors/error-codes';
import { logger } from '@/shared/logger/logger';

export type MeActionResult =
  | { status: 200; data: PublicUserShape }
  | { status: 401; error: { code: ErrorCode.UNAUTHORIZED; message: string } };

export async function meAction(authService: AuthService, c: Context): Promise<MeActionResult> {
  // The auth middleware sets `user` to the session user or
  // `null` if no session. We deliberately do not inspect
  // the reason for the null — all four failure modes share
  // the same response.
  const ctxUser = c.get('user') as { id: string; email: string } | null | undefined;
  if (!ctxUser || !ctxUser.id) {
    logger.warn('me_unauthorized', { reason: 'no_session_user_on_context' });
    return {
      status: 401,
      error: { code: ErrorCode.UNAUTHORIZED, message: 'No autenticado.' },
    };
  }

  const projection = await authService.buildPublicUser(ctxUser.id);
  if (!projection) {
    // Session cookie resolved to a user id that no longer
    // exists in the DB (e.g. user deleted, schema migration
    // wiped rows). Same response shape as no-session.
    logger.warn('me_unauthorized', { reason: 'session_user_not_in_db', userId: ctxUser.id });
    return {
      status: 401,
      error: { code: ErrorCode.UNAUTHORIZED, message: 'No autenticado.' },
    };
  }

  return { status: 200, data: projection };
}
