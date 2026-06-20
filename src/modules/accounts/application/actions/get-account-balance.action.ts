/**
 * getAccountBalanceAction — `GET /api/accounts/:id/balance?displayCurrency=…`.
 *
 * Per BR-ACC-12: the native balance is read from the row
 * and passed to the FX provider. The native value is never
 * mutated. Per BR-ACC-13: stale rates are not a 5xx; the
 * provider returns the rate with `fxAsOf` and the widget
 * surfaces it.
 *
 * Errors:
 * - 200: success with `{ native, display, warnings? }`.
 * - 400: invalid `displayCurrency`.
 * - 404: account not found (cross-user or non-existent).
 * - 409: `AppError(FX_NOT_SUPPORTED)` from the provider.
 * - 503: `AppError(FX_UNAVAILABLE)` from the provider.
 */

import type { AccountActionDeps, ActionResult } from './_shared';
import type { FxConversionResult } from '../../domain/interfaces/fx-rate-provider.port';
import { accountBalanceSchema } from '../validation/account-balance.schema';
import { zodErrorToActionError, appErrorToActionError } from './_shared';
import { AppError } from '@/shared/errors/app-error';

export async function getAccountBalanceAction(
  deps: AccountActionDeps,
  userId: string,
  id: string,
  rawQuery: unknown,
): Promise<ActionResult<FxConversionResult>> {
  const parsed = accountBalanceSchema.safeParse(rawQuery);
  if (!parsed.success) return zodErrorToActionError(parsed.error);

  try {
    const result = await deps.accountService.getBalance(
      userId,
      id,
      parsed.data.displayCurrency,
    );
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof AppError) return appErrorToActionError(err);
    throw err;
  }
}
