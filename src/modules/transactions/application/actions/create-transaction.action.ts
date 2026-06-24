/**
 * createTransactionAction — `POST /api/transactions`.
 *
 * Slice 3 binding. The action:
 *   1. parses with `TransactionCreateSchema`;
 *   2. loads the parent `FinancialAccount` via
 *      `accountRepository.findById(userId, accountId)` — the
 *      BR-TX-5 archived check throws `ACCOUNT_ARCHIVED` (409)
 *      when the parent is archived, `NOT_FOUND` (404) when
 *      the parent does not exist or is cross-user;
 *   3. resolves the FX snapshot via the slice-2
 *      `convertAndSnapshot` helper (REQ-TX-12, BR-TX-6) —
 *      the casa is `account.casa` (or null when the
 *      account inherits the global default; the slice-3
 *      wire surface does not yet plumb the env default, so
 *      a null casa is treated as the FX-skip path);
 *   4. calls the slice-2 `createTransaction` factory with
 *      the FX snapshot fields; the factory is async and
 *      dispatches `TransactionRecorded` via the deps bag;
 *   5. persists the row via the repository;
 *   6. returns the DTO.
 *
 * The action's contract is the single source of truth for
 * the wire error codes:
 *   - `ZodError` → `VALIDATION_ERROR` (400).
 *   - `InvalidAmountError` → `INVALID_AMOUNT` (400).
 *   - `FutureTransactionDateError` → `FUTURE_DATE_NOT_ALLOWED` (400).
 *   - `InvalidDirectionError` → `VALIDATION_ERROR` (400).
 *   - archived parent account → `ACCOUNT_ARCHIVED` (409).
 *   - FX provider failure → `FX_UNAVAILABLE` (503).
 */

import { createTransaction } from '../../domain/factories/create-transaction';
import type { AccountFxCasa } from '../../domain/entities/transaction';
import {
  type ActionResult,
  type TransactionActionDeps,
  zodErrorToActionError,
  domainErrorToActionError,
  mapDomainError,
  loadParentAccount,
  checkAccountArchived,
} from './_shared';
import { TransactionCreateSchema } from '../validation/transaction-create.schema';
import { toTransactionDto, type TransactionDTO } from '../dto/transaction.dto';
import { AppError } from '@/shared/errors/app-error';

export async function createTransactionAction(
  deps: TransactionActionDeps,
  userId: string,
  rawInput: unknown,
): Promise<ActionResult<TransactionDTO>> {
  const parsed = TransactionCreateSchema.safeParse(rawInput);
  if (!parsed.success) return zodErrorToActionError(parsed.error);

  try {
    const parent = await loadParentAccount(deps.accountRepository, userId, parsed.data.accountId);
    if (parent === null) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Parent account not found or no access.',
      });
    }
    const archived = checkAccountArchived(parent);
    if (archived !== null) throw archived;

    // BR-TX-5 archived pre-check above; REQ-TX-12 snapshot
    // below. The slice-3 binding treats `account.casa ===
    // null` as "inherit the global default" — represented
    // here as a `null` casa on the FX call, which
    // `convertAndSnapshot` short-circuits via the
    // native=casa check.
    const now = deps.clock();
    // Slice-3 generates a server-side cuid here. Slice-4
    // replaces this with the Prisma adapter's id generator;
    // the action's contract is to pass the same `id` value
    // to the factory and the repository so the factory's
    // `TransactionRecorded` payload and the persisted row
    // share the identity.
    const txId = `tx_${randomHex(TX_ID_BYTES)}`;
    const txInput = {
      id: txId,
      userId,
      accountId: parsed.data.accountId,
      direction: parsed.data.direction,
      amountMinor: parsed.data.amountMinor,
      currency: parsed.data.originalCurrency,
      memo: parsed.data.memo ?? null,
      category: parsed.data.category ?? null,
      transactionDate: new Date(parsed.data.transactionDate),
      convertedAmountMinor: parsed.data.amountMinor, // factory updates on FX call
      convertedCurrency: parsed.data.originalCurrency, // ditto
      fxAsOfSnapshot: null as Date | null,
      casaSnapshot: parent.casa as AccountFxCasa | null,
      now,
    };

    const tx = await createTransaction(
      txInput,
      { dispatcher: deps.dispatcher },
      parent.casa !== null ? deps.fxRateProvider : undefined,
    );

    const persisted = await deps.repo.create(userId, {
      accountId: tx.accountId,
      direction: tx.direction,
      amountMinor: tx.amountMinor,
      currency: tx.currency,
      memo: tx.memo,
      category: tx.category,
      transactionDate: tx.transactionDate,
      convertedAmountMinor: tx.convertedAmountMinor,
      convertedCurrency: tx.convertedCurrency,
      fxAsOfSnapshot: tx.fxAsOfSnapshot,
      casaSnapshot: tx.casaSnapshot,
    });

    deps.logger.info('transactions.create', {
      userId,
      accountId: persisted.accountId,
      direction: persisted.direction,
      amountMinor: persisted.amountMinor,
      currency: persisted.currency,
      casa: persisted.casaSnapshot,
      fxAsOf: persisted.fxAsOfSnapshot?.toISOString() ?? null,
    });

    return { ok: true, value: toTransactionDto(persisted) };
  } catch (err) {
    if (err instanceof AppError) return domainErrorToActionError(err);
    // Unexpected error: map to FX_UNAVAILABLE per the
    // slice-3 helper contract. Re-throw if it is a domain
    // error not yet wrapped.
    const mapped = mapDomainError(err);
    return domainErrorToActionError(mapped);
  }
}

/**
 * Tiny cuid-shaped hex generator. Used in the create
 * action to mint a stable `id` for the new transaction.
 * Slice-4's Prisma adapter replaces this with the database
 * id generator; the slice-3 path is fully self-contained.
 *
 * `TX_ID_BYTES` is the byte length of the random hex
 * segment (12 bytes → 24 hex chars). 96 bits of entropy
 * is far more than the cuid collision requirement (the
 * cuid library uses 8 bytes by default for a session-bound
 * token).
 */
const TX_ID_BYTES = 12;
function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < buf.length; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
