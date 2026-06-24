/**
 * updateTransactionAction — `PATCH /api/transactions/:id`.
 *
 * Slice 3 binding. The action:
 *   1. parses with `TransactionUpdateSchema`;
 *   2. loads the existing row via the repository (scoped to
 *      userId — cross-user is `null`, mapped to `NOT_FOUND`);
 *   3. if `amountMinor` or `originalCurrency` changed,
 *      recomputes the FX snapshot via
 *      `recomputeFxSnapshot` (REQ-TX-12). Editing `memo`,
 *      `category`, or `transactionDate` preserves the
 *      existing snapshot;
 *   4. updates the row via the repository (partial patch);
 *   5. returns the DTO.
 *
 * The future-date check (REQ-TX-4) is enforced at the Zod
 * boundary via `refine` + the `params.code` discriminator;
 * the action maps the refine failure to
 * `FUTURE_DATE_NOT_ALLOWED` (see `zodErrorToActionError`).
 */

import type { ActionResult, TransactionActionDeps } from './_shared';
import { zodErrorToActionError, domainErrorToActionError, recomputeFxSnapshot } from './_shared';
import { AppError } from '@/shared/errors/app-error';
import { TransactionUpdateSchema } from '../validation/transaction-update.schema';
import { toTransactionDto, type TransactionDTO } from '../dto/transaction.dto';
import type { UpdateTransactionPatch } from '../../domain/interfaces/transaction.repository.port';

// Mutable view of `UpdateTransactionPatch` for action-layer
// construction. The port's type is `readonly` (the domain's
// `TransactionUpdatePatch`) so consumers cannot mutate after
// build; the action layer builds the object first and hands
// it off as a frozen value via the port's contract. TypeScript
// widens the readonly-ness at the assignment site via
// `-readonly`.
type MutableUpdatePatch = {
  -readonly [K in keyof UpdateTransactionPatch]: UpdateTransactionPatch[K];
};
import type { AccountFxCasa } from '../../domain/entities/transaction';

export async function updateTransactionAction(
  deps: TransactionActionDeps,
  userId: string,
  rawInput: unknown,
): Promise<ActionResult<TransactionDTO>> {
  const parsed = TransactionUpdateSchema.safeParse(rawInput);
  if (!parsed.success) return zodErrorToActionError(parsed.error);

  try {
    const existing = await deps.repo.findById(userId, parsed.data.id);
    if (existing === null) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Transaction not found or no access.',
      });
    }

    const patch: MutableUpdatePatch = {};
    if (parsed.data.amountMinor !== undefined) {
      patch.amountMinor = parsed.data.amountMinor;
    }
    if (parsed.data.originalCurrency !== undefined) {
      patch.currency = parsed.data.originalCurrency;
    }
    if (parsed.data.memo !== undefined) {
      patch.memo = parsed.data.memo;
    }
    if (parsed.data.category !== undefined) {
      patch.category = parsed.data.category;
    }
    if (parsed.data.transactionDate !== undefined) {
      patch.transactionDate = new Date(parsed.data.transactionDate);
    }

    // REQ-TX-12: recompute the FX snapshot when `amountMinor`
    // or `originalCurrency` changed. The action preserves the
    // existing snapshot for the other patch fields. The
    // casa is taken from the existing row (the snapshot
    // stamped at create time); a null casa is treated as
    // "inherit the global default" (the FX-skip path inside
    // `convertAndSnapshot`).
    const fxTouched =
      parsed.data.amountMinor !== undefined || parsed.data.originalCurrency !== undefined;
    if (fxTouched && existing.casaSnapshot !== null) {
      const now = deps.clock();
      const snapshot = await recomputeFxSnapshot({
        originalAmountMinor: patch.amountMinor ?? existing.amountMinor,
        originalCurrency: patch.currency ?? existing.currency,
        casaSnapshot: existing.casaSnapshot as AccountFxCasa,
        fxRateProvider: deps.fxRateProvider,
        now,
      });
      patch.convertedAmountMinor = snapshot.convertedAmountMinor;
      patch.convertedCurrency = snapshot.convertedCurrency;
      patch.fxAsOfSnapshot = snapshot.fxAsOfSnapshot;
      patch.casaSnapshot = snapshot.casa;
    }

    const updated = await deps.repo.update(userId, parsed.data.id, patch);
    if (updated === null) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Transaction not found or no access.',
      });
    }

    deps.logger.info('transactions.update', {
      userId,
      id: updated.id,
      fxRecomputed: fxTouched && existing.casaSnapshot !== null,
    });

    return { ok: true, value: toTransactionDto(updated) };
  } catch (err) {
    if (err instanceof AppError) return domainErrorToActionError(err);
    return domainErrorToActionError(
      new AppError({
        code: 'INTERNAL_ERROR',
        message: 'updateTransactionAction: unexpected error.',
      }),
    );
  }
}
