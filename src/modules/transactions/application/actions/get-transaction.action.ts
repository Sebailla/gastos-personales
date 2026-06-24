/**
 * getTransactionAction — `GET /api/transactions/:id`.
 *
 * Slice 3 binding. Cross-user access is indistinguishable
 * from a miss at the repository layer (BR-TX-4); the action
 * maps the null result to `AppError(NOT_FOUND)` (404).
 *
 * The action does NOT call the FX provider or the event
 * dispatcher — both belong to the write paths.
 */

import type { ActionResult, TransactionActionDeps } from './_shared';
import { domainErrorToActionError } from './_shared';
import { AppError } from '@/shared/errors/app-error';
import { toTransactionDto, type TransactionDTO } from '../dto/transaction.dto';

export async function getTransactionAction(
  deps: TransactionActionDeps,
  userId: string,
  id: string,
): Promise<ActionResult<TransactionDTO>> {
  try {
    const row = await deps.repo.findById(userId, id);
    if (row === null) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Transaction not found or no access.',
      });
    }
    return { ok: true, value: toTransactionDto(row) };
  } catch (err) {
    if (err instanceof AppError) return domainErrorToActionError(err);
    throw err;
  }
}
