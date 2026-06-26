/**
 * Zod schema: `accountFlowQuerySchema`.
 *
 * Slice 2 deliverable — action-layer query schema for the
 * `GET /api/reports/accounts/:accountId/flow` endpoint. The
 * schema enforces:
 *
 *   - `accountId` matches the cuid regex
 *     `^c[a-z0-9]{20,32}$` (orchestrator correction #1 — the
 *     project uses cuid for `FinancialAccount.id`, NOT UUID v4
 *     as the spec text originally said; see
 *     `openspec/changes/reports/design.md §3.4.1`).
 *   - EITHER `month: YYYY-MM` OR `fromDate + toDate: YYYY-MM-DD`.
 *   - `fromDate <= toDate` (BR-RPT-3, REQ-RPT-3).
 *   - `.strict()` rejects unknown keys at the API boundary
 *     (BR-TX-8 strict shape; mirrors
 *     `TransactionListQuerySchema.strict()`).
 *
 * The 366-day upper bound (BR-RPT-3) is enforced at the action
 * layer (T-RPT-110) — Zod has no built-in date-math primitive
 * (design §5.6 last paragraph). The action's range check is
 * the single point of enforcement.
 *
 * Cross-cutting invariants (carried from design §5.6):
 * - BR-RPT-3: date range shape + 366-day upper bound.
 * - BR-RPT-4: cross-user `accountId` returns 404 at the action
 *   layer (the schema only validates SHAPE; ownership is the
 *   action's concern via `AccountRepositoryPort.findById`).
 *
 * The exported `AccountFlowQuery` type is the discriminated
 * union consumers (the action layer) narrow against after
 * `safeParse` succeeds.
 */

import { z } from 'zod';

const CUID_RE = /^c[a-z0-9]{20,32}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const baseAccountFlow = z
  .object({
    accountId: z
      .string()
      .regex(CUID_RE, {
        message: 'accountId must be a cuid (^c[a-z0-9]{20,32}$)',
      }),
  })
  .strict();

const monthShape = baseAccountFlow
  .extend({
    month: z.string().regex(MONTH_RE, { message: 'month must match YYYY-MM' }),
  })
  .strict();

const rangeShape = baseAccountFlow
  .extend({
    fromDate: z
      .string()
      .regex(ISO_DATE_RE, { message: 'fromDate must be YYYY-MM-DD' }),
    toDate: z
      .string()
      .regex(ISO_DATE_RE, { message: 'toDate must be YYYY-MM-DD' }),
  })
  .strict()
  .refine((q) => q.fromDate <= q.toDate, {
    message: 'fromDate must be <= toDate',
    path: ['toDate'],
  });

export const accountFlowQuerySchema = z.union([monthShape, rangeShape]);

export type AccountFlowQuery = z.infer<typeof accountFlowQuerySchema>;
