/**
 * Zod schema: `monthlySummaryQuerySchema`.
 *
 * Slice 2 deliverable — action-layer query schema for the
 * `GET /api/reports/monthly` endpoint. The schema enforces:
 *
 *   - `month` matches `^\d{4}-\d{2}$` (BR-RPT-1 codifies UTC
 *     bucketing — see `openspec/changes/reports/design.md §3.2.1`
 *     for the rationale).
 *   - `month` parses to a calendar month in `1..12`
 *     (the `2026-13` case is the REQ-RPT-5 scenario from
 *     `openspec/changes/reports/specs/reports/spec.md`).
 *   - `.strict()` rejects unknown keys at the API boundary
 *     (BR-TX-8 strict shape; mirrors
 *     `TransactionListQuerySchema.strict()`).
 *
 * Cross-cutting invariants (carried from design §5.6):
 * - BR-RPT-1: UTC calendar month bucketing.
 * - BR-ACC-12: aggregates group by `convertedCurrency`; the
 *   schema does NOT carry the currency (the aggregate derives
 *   it from the rows).
 * - The 366-day upper bound on `getAccountFlowAction` is NOT
 *   a Zod concern — the schema for the flow endpoint enforces
 *   `fromDate <= toDate` only (the action adds the range
 *   check per design §5.5 step 2).
 *
 * The exported `MonthlySummaryQuery` type is the inferred
 * shape consumers (the action layer) type-narrow against after
 * `safeParse` succeeds.
 */

import { z } from 'zod';

const MONTH_REGEX = /^\d{4}-\d{2}$/;

export const monthlySummaryQuerySchema = z
  .object({
    month: z
      .string()
      .regex(MONTH_REGEX, { message: 'month must match YYYY-MM' })
      .refine(
        (m) => {
          const month = Number.parseInt(m.slice(5, 7), 10);
          return month >= 1 && month <= 12;
        },
        { message: 'month must be 01..12' },
      ),
  })
  .strict();

export type MonthlySummaryQuery = z.infer<typeof monthlySummaryQuerySchema>;
