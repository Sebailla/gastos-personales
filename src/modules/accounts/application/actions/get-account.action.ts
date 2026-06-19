/**
 * getAccountAction — `GET /api/accounts/:id`.
 *
 * Delegates to `AccountService.getById`. The service throws
 * `AppError(NOT_FOUND)` on cross-user or non-existent rows;
 * the action surfaces the same.
 */

import type { AccountActionDeps, ActionResult } from './_shared';
import type { FinancialAccount } from '../../domain/entities/financial-account';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';

export async function getAccountAction(
  deps: AccountActionDeps,
  userId: string,
  id: string,
): Promise<ActionResult<FinancialAccount>> {
  try {
    const row = await deps.accountService.getById(userId, id);
    return { ok: true, data: row };
  } catch (err) {
    if (err instanceof AppError && err.code === ErrorCode.NOT_FOUND) {
      return {
        ok: false,
        status: 404,
        error: { code: ErrorCode.NOT_FOUND, message: err.message },
      };
    }
    throw err;
  }
}
