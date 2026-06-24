/**
 * TransactionListQuerySchema — Zod schema for the
 * `GET /api/transactions` query string.
 *
 * Slice 3 binding. The cursor is opaque (the previous
 * `nextCursor` returned by the list endpoint). The schema
 * accepts a string when supplied; empty/undefined defaults
 * to "first page".
 *
 * The `limit` field is clamped to `1..100` at the API
 * boundary (BR-TX-10). When `accountId` is supplied, the
 * page is filtered to that account (REQ-TX-8).
 *
 * The `.strict()` modifier rejects unknown keys at the
 * boundary (BR-TX-8 closed form).
 */

import { z } from 'zod';

export const TransactionListQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z
      .number()
      .int()
      .optional()
      // BR-TX-10: clamp out-of-range values rather than reject.
      .transform((value) => {
        if (value === undefined) return 20;
        if (value > 100) return 100;
        if (value < 1) return 1;
        return value;
      })
      .default(20),
    accountId: z.string().uuid().optional(),
  })
  .strict();

export type TransactionListQuery = z.infer<typeof TransactionListQuerySchema>;
