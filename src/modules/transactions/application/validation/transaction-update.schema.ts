/**
 * TransactionUpdateSchema — Zod schema for the
 * `PATCH /api/transactions/:id` request body.
 *
 * Slice 3 binding. All fields EXCEPT `id` are optional
 * (REQ-TX-10 partial body). The `.strict()` modifier rejects
 * unknown fields at the boundary (BR-TX-8). The action
 * translates the parsed object into an
 * `UpdateTransactionPatch` (the domain port type) before
 * calling the repository.
 *
 * The slice-3 wire surface mirrors the domain patch type:
 *   - `id`: required, UUID.
 *   - `amountMinor`: optional, integer > 0 (REQ-TX-2).
 *   - `originalCurrency`: optional, enum `ARS | USD`.
 *   - `transactionDate`: optional, ISO date string, not in
 *     the future (REQ-TX-4).
 *   - `memo`: optional, ≤ 500 chars (REQ-TX-5).
 *   - `category`: optional, ≤ 50 chars (BR-TX-9).
 *
 * The action layer detects whether `amountMinor` or
 * `originalCurrency` changed and recomputes the FX snapshot
 * via `convertAndSnapshot` (REQ-TX-12). Editing `memo`,
 * `category`, or `transactionDate` preserves the existing
 * snapshot.
 */

import { z } from 'zod';

export const TransactionUpdateSchema = z
  .object({
    id: z.string().min(1),
    amountMinor: z.number().int().positive().optional(),
    originalCurrency: z.enum(['ARS', 'USD']).optional(),
    transactionDate: z
      .string()
      .datetime()
      .refine(
        (iso) => {
          const ts = new Date(iso).getTime();
          return ts <= Date.now();
        },
        { message: 'transactionDate must not be in the future' },
      )
      .optional(),
    memo: z.string().max(500).optional(),
    category: z.string().max(50).optional(),
  })
  .strict();

export type UpdateTransactionInput = z.infer<typeof TransactionUpdateSchema>;
