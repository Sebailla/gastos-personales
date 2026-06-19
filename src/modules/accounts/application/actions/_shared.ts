/**
 * Shared action types and helpers for the 7 application actions.
 *
 * Every action returns a discriminated union `{ ok: true, data } | { ok: false, status, error }`
 * that maps directly to an HTTP response. The Hono route handler in
 * `src/modules/api/app.ts` is the only place that converts these to
 * `c.json(...)` calls.
 *
 * The `Deps` interface is the action's view of the dependency bag.
 * It exposes the AccountService and any helpers the action needs
 * (event dispatcher, logger). Actions never import from
 * `infrastructure/`; they receive what they need through `Deps`.
 *
 * Discriminator design: `ok: true | false`. Success carries `data`;
 * failure carries `status` + `error`. Narrowing is `if (res.ok)`.
 */

import type { AccountService } from '../../domain/services/account.service';
import type { ErrorCode as ErrorCodeType } from '@/shared/errors/error-codes';

export interface AccountActionDeps {
  accountService: AccountService;
}

export type ActionError = {
  code: ErrorCodeType;
  message: string;
  details?: unknown;
};

export type ActionSuccess<T> = { ok: true; data: T };
export type ActionFailure = { ok: false; status: number; error: ActionError };
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

/**
 * Translates a ZodError to the standard 400 envelope.
 * The `details` field carries the issue list so the UI can
 * surface the first message via BR-ACC-16.
 */
export function zodErrorToActionError(
  err: import('zod').ZodError,
): ActionFailure {
  return {
    ok: false,
    status: 400,
    error: {
      code: 'VALIDATION_ERROR' as ErrorCodeType,
      message: 'Datos de entrada inválidos.',
      details: err.issues,
    },
  };
}