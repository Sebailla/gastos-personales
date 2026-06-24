/**
 * getAccountBalanceAction — `GET /api/accounts/:id/balance?displayCurrency=…`.
 *
 * Per BR-ACC-12: the native balance is read from the row
 * and passed to the FX provider. The native value is never
 * mutated. Per BR-ACC-13: stale rates are not a 5xx; the
 * provider returns the rate with `fxAsOf` and the widget
 * surfaces it.
 *
 * Per REQ-FX-3 (PR-3 T3.4): the casa is resolved at the
 * ACTION site — never inside the FX provider. The rule is:
 *
 *   resolvedCasa = account.casa ?? deps.defaultCasa ?? 'oficial'
 *
 * with the UPPERCASE Prisma form (`account.casa`) normalised
 * to lowercase at the boundary (the FX port requires lowercase).
 * The composition root (`src/modules/api/app.ts`) reads
 * `env.FX_DEFAULT_CASA` once at startup and passes the
 * resolved value via `deps.defaultCasa`; the action does NOT
 * read env at call time so the function stays pure and
 * testable. When `deps.defaultCasa` is unset, the implicit
 * fallback is `'oficial'` (BR-FX-3 / DG-FX-1).
 *
 * Errors:
 * - 200: success with `{ native, display, stale, warnings? }`.
 * - 400: invalid `displayCurrency`.
 * - 404: account not found (cross-user or non-existent).
 * - 409: `AppError(FX_NOT_SUPPORTED)` from the provider.
 * - 503: `AppError(FX_UNAVAILABLE)` from the provider.
 */

import type { ActionResult } from './_shared';
import type {
  FxConversionResult,
  FxCasaString,
} from '../../domain/interfaces/fx-rate-provider.port';
import { accountBalanceSchema } from '../validation/account-balance.schema';
import { zodErrorToActionError, appErrorToActionError } from './_shared';
import { AppError } from '@/shared/errors/app-error';
import type { AccountFxCasa } from '../../domain/entities/financial-account';

/**
 * Action-layer deps for the balance endpoint. Extends the
 * base `AccountActionDeps` with the FX casa defaults read
 * from the env at the composition root.
 */
export interface GetAccountBalanceActionDeps {
  accountService: import('../../domain/services/account.service').AccountService;
  /** Resolved from `env.FX_DEFAULT_CASA` at startup; `undefined` falls back to `'oficial'`. */
  defaultCasa?: FxCasaString;
}

/**
 * Map the UPPERCASE Prisma `AccountFxCasa` form to the
 * lowercase DolarAPI `FxCasaString` form. The two are
 * 1-to-1: `OFICIAL -> oficial`, etc.
 */
const CASA_TO_LOWERCASE: Record<AccountFxCasa, FxCasaString> = {
  OFICIAL: 'oficial',
  BLUE: 'blue',
  MEP: 'mep',
  CCL: 'ccl',
  CRIPTO: 'cripto',
  TARJETA: 'tarjeta',
};

export async function getAccountBalanceAction(
  deps: GetAccountBalanceActionDeps,
  userId: string,
  id: string,
  rawQuery: unknown,
): Promise<ActionResult<FxConversionResult>> {
  const parsed = accountBalanceSchema.safeParse(rawQuery);
  if (!parsed.success) return zodErrorToActionError(parsed.error);

  try {
    // PR-3 T3.4: load the row first so the casa resolution
    // can read `account.casa`. The service will load it
    // again internally on `getBalance`, but the double read
    // is a cheap SELECT and keeps the service signature
    // focused (no env coupling).
    const account = await deps.accountService.getById(userId, id);
    const accountCasa = account.casa;
    const resolvedCasa: FxCasaString =
      accountCasa !== null && accountCasa !== undefined
        ? CASA_TO_LOWERCASE[accountCasa]
        : (deps.defaultCasa ?? 'oficial');

    const result = await deps.accountService.getBalance(
      userId,
      id,
      parsed.data.displayCurrency,
      resolvedCasa,
    );
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof AppError) return appErrorToActionError(err);
    throw err;
  }
}

