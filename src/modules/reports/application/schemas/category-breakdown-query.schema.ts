/**
 * Zod schema: `categoryBreakdownQuerySchema`.
 *
 * Slice 2 deliverable — action-layer query schema for the
 * `GET /api/reports/breakdown` endpoint. Same shape as
 * `monthlySummaryQuerySchema` (month-keyed) but a separate
 * file so future additions (e.g. `?limit=100`, `?category=`)
 * attach here without bleeding into the monthly endpoint
 * (design §5.6 forward-compatibility note).
 *
 * The schema enforces:
 *   - `month` matches `^\d{4}-\d{2}$` (BR-RPT-1).
 *   - `month` parses to a calendar month in `1..12`
 *     (REQ-RPT-5 malformed-month scenario).
 *   - `.strict()` rejects unknown keys (BR-TX-8 strict shape).
 *
 * Cross-cutting invariants (carried from design §5.4):
 * - BR-RPT-2: the breakdown is month-keyed (same window as
 *   the monthly summary).
 * - BR-TX-9: the breakdown's category normalization lives in
 *   the factory (`normalizeCategory`); the schema does NOT
 *   validate category shapes (the bucket carries both the raw
 *   string and the normalized form).
 */

import { z } from 'zod';

const MONTH_REGEX = /^\d{4}-\d{2}$/;

export const categoryBreakdownQuerySchema = z
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

export type CategoryBreakdownQuery = z.infer<typeof categoryBreakdownQuerySchema>;
