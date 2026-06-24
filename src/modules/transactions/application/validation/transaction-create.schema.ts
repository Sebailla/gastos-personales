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
 * - `amountMinor`: required, integer > 0 (BR-TX-1 + REQ-TX-2).
 * - `originalCurrency`: enum `ARS | USD`. (The slice-3 wire
 *   surface is two-currency; EUR is the v1.1 follow-up.)
 * - `transactionDate`: required, ISO date string, not in the
 *   future (REQ-TX-4). Future detection is enforced by Zod via
 *   the `refine` chain against the clock-relative threshold.
 * - `memo`: optional, ≤ 500 chars (REQ-TX-5).
 * - `category`: optional, ≤ 50 chars (BR-TX-9).
 *
 * The `.strict()` modifier rejects unknown fields at the
 * boundary (BR-TX-8 — closed form). The factory is the
 * secondary gate for invariant violations that Zod cannot
 * catch (e.g. TRANSFER is rejected there too, defense in
 * depth).
 */

import { z } from 'zod';
import { TransactionDirection } from '../../domain/entities/transaction-direction';

export const TransactionCreateSchema = z
  .object({
    accountId: z.string().uuid(),
    direction: z.enum([TransactionDirection.INCOME, TransactionDirection.EXPENSE]),
    amountMinor: z.number().int().positive(),
    originalCurrency: z.enum(['ARS', 'USD']),
    transactionDate: z
      .string()
      .datetime()
      .refine(
        (iso) => {
          const ts = new Date(iso).getTime();
          return ts <= Date.now();
        },
        { message: 'transactionDate must not be in the future' },
      ),
    memo: z.string().max(500).optional(),
    category: z.string().max(50).optional(),
  })
  .strict();

export type CreateTransactionInput = z.infer<typeof TransactionCreateSchema>;
