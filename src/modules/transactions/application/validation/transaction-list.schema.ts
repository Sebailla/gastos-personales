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
 * `limit` uses `z.coerce.number()` because the query
 * string is always a string at the HTTP boundary
 * (`URLSearchParams` returns `string`), but the field is
 * semantically a number. Coercion happens at the schema
 * edge so downstream code (services, repos, tests) sees a
 * real `number`. Coercion fails on non-numeric strings
 * (e.g. `?limit=foo`), which is the desired behavior.
 *
 * The `.strict()` modifier rejects unknown keys at the
 * boundary (BR-TX-8 closed form).
 */

import { z } from 'zod';

export const TransactionListQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce
      .number()
      .int()
      .optional()
      // BR-TX-10: clamp out-of-range values rather than reject.
      // The `undefined` branch is a TypeScript narrow — at
      // runtime `.default(20)` short-circuits before the
      // transform runs, so this branch is never taken. The
      // `.optional()` in the chain still types `value` as
      // `number | undefined`, and `tsc` rejects arithmetic
      // on a possibly-undefined value without the guard.
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
