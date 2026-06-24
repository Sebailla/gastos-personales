/**
 * TransactionCreateSchema — Zod schema for the
 * `POST /api/transactions` request body.
 *
 * Slice 3 binding. The schema validates the wire shape at the
 * API boundary; the action layer translates the parsed object
 * into the domain input (`NewTransactionInput`) before calling
 * the factory.
 *
 * Field constraints (traced to spec REQ):
 * - `accountId`: required, UUID (BR-TX-5 cross-module invariant).
 * - `direction`: enum `INCOME | EXPENSE`. `TRANSFER` is rejected
 *   at the factory (BR-TX-2 + REQ-TX-3) — the schema accepts
 *   the same enum and the action maps the factory's
 *   `InvalidDirectionError` to `VALIDATION_ERROR`.
 * - `amountMinor`: required, positive number. The schema uses
 *   `.positive()` (no `.int()` constraint) so the slice-2
 *   factory's `InvalidAmountError` can fire on non-integer
 *   inputs (the action surfaces `INVALID_AMOUNT` on the wire).
 * - `originalCurrency`: enum `ARS | USD`.
 * - `transactionDate`: required, ISO 8601 date string, not in
 *   the future (REQ-TX-4). The schema uses a `.refine()` against
 *   `Date.now()`; the action layer detects this specific
 *   `refine` failure and maps it to `FUTURE_DATE_NOT_ALLOWED`
 *   (per the slice-3 design's error-mapping table).
 * - `memo`: optional, ≤ 500 chars (REQ-TX-5).
 * - `category`: optional, ≤ 50 chars (BR-TX-9).
 *
 * The `.strict()` modifier rejects unknown fields at the
 * boundary (BR-TX-8 — closed form). The factory is the
 * primary gate for the typed errors (`InvalidAmountError`,
 * `FutureTransactionDateError`); Zod is the secondary
 * defense.
 */

import { z } from 'zod';
import { TransactionDirection } from '../../domain/entities/transaction-direction';

export const TransactionCreateSchema = z
  .object({
    accountId: z.string().uuid(),
    direction: z.enum([TransactionDirection.INCOME, TransactionDirection.EXPENSE]),
    amountMinor: z.number().positive(),
    originalCurrency: z.enum(['ARS', 'USD']),
    transactionDate: z
      .string()
      .datetime()
      .refine(
        (iso) => {
          const ts = new Date(iso).getTime();
          return ts <= Date.now();
        },
        {
          message: 'transactionDate must not be in the future',
          // Stable discriminator the action layer uses to
          // surface FUTURE_DATE_NOT_ALLOWED on the wire.
          // Do NOT localize this key — the action code
          // matches on it (zodErrorToActionError).
          params: { code: 'FUTURE_TRANSACTION_DATE' },
        },
      ),
    memo: z.string().max(500).optional(),
    category: z.string().max(50).optional(),
  })
  .strict();

export type CreateTransactionInput = z.infer<typeof TransactionCreateSchema>;
