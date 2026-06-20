/**
 * archiveAccountAction — `POST /api/accounts/:id/archive`.
 *
 * Soft-archive: sets `archivedAt = now()` via the service.
 * Cross-user or non-existent rows return 404.
 */

import type { AccountActionDeps, ActionResult } from './_shared';
import type { FinancialAccount } from '../../domain/entities/financial-account';
import { AppError } from '@/shared/errors/app-error';
import { appErrorToActionError } from './_shared';

export async function archiveAccountAction(
  deps: AccountActionDeps,
  userId: string,
  id: string,
): Promise<ActionResult<FinancialAccount>> {
  try {
    const row = await deps.accountService.archive(userId, id);
    return { ok: true, data: row };
  } catch (err) {
    if (err instanceof AppError) return appErrorToActionError(err);
    throw err;
  }
}
