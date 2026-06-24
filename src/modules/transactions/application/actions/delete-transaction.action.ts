/**
 * deleteTransactionAction — `DELETE /api/transactions/:id`.
 *
 * Slice 3 binding. Hard delete (DG-TX-15). The action maps
 * the repository's `boolean` to either
 * `{ ok: true, value: { id } }` (204 at the route layer) or
 * `{ ok: false, error: AppError(NOT_FOUND) }` (404).
 *
 * Cross-user access is indistinguishable from a miss at the
 * repository layer (BR-TX-4); the action maps both to
 * `AppError(NOT_FOUND)`.
 */

import type { ActionResult, TransactionActionDeps } from './_shared';
import { domainErrorToActionError } from './_shared';
import { AppError } from '@/shared/errors/app-error';

export interface DeleteTransactionData {
  readonly id: string;
}

export async function deleteTransactionAction(
  deps: TransactionActionDeps,
  userId: string,
  id: string,
): Promise<ActionResult<DeleteTransactionData>> {
  try {
    const ok = await deps.repo.delete(userId, id);
    if (!ok) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Transaction not found or no access.',
      });
    }
    deps.logger.info('transactions.delete', { userId, id });
    return { ok: true, value: { id } };
  } catch (err) {
    if (err instanceof AppError) return domainErrorToActionError(err);
    throw err;
  }
}
