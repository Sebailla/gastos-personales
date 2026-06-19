/**
 * unarchiveAccountAction — `POST /api/accounts/:id/unarchive`.
 *
 * Soft-unarchive: sets `archivedAt = null` via the service.
 * Cross-user or non-existent rows return 404.
 */

import type { AccountActionDeps, ActionResult } from './_shared';
import type { FinancialAccount } from '../../domain/entities/financial-account';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';

export async function unarchiveAccountAction(
  deps: AccountActionDeps,
  userId: string,
  id: string,
): Promise<ActionResult<FinancialAccount>> {
  try {
    const row = await deps.accountService.unarchive(userId, id);
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
