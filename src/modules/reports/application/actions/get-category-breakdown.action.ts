/**
 * `getCategoryBreakdownAction` — `GET /api/reports/breakdown`.
 *
 * Slice 2 deliverable. The action shape mirrors
 * `getMonthlySummaryAction` but groups by
 * `(categoryNormalized, convertedCurrency)` per REQ-RPT-2
 * and sorts by `amountMinor DESC, categoryNormalized ASC`.
 *
 * Flow (design §5.4):
 *   1. Parse `rawQuery` with `categoryBreakdownQuerySchema`.
 *      On failure → `zodErrorToActionError`.
 *   2. Derive year + month integers.
 *   3. Call `deps.reportsRepository.findByUserAndMonthForBreakdown(
 *      userId, { year, month })`.
 *   4. Call `createCategoryBreakdown(...)`.
 *   5. Map to `CategoryBreakdownDTO` via `toCategoryBreakdownDto`.
 *   6. Return `{ ok: true, value: dto }`.
 *
 * Empty state: `rows.length === 0` → `buckets: []`, HTTP 200.
 *
 * Cross-cutting invariants:
 * - BR-TX-4: every cross-module reference to a transaction
 *   scopes to `userId`; the port enforces it.
 * - BR-RPT-2 / BR-TX-9: the factory normalizes categories
 *   (lowercase + trim; null/empty → "uncategorized"). The
 *   action never re-implements the rule.
 * - BR-ACC-12: aggregates group by `convertedCurrency`; no
 *   FX call in the read path.
 */

import { createCategoryBreakdown } from '../../domain/aggregates/category-breakdown';
import { AppError } from '@/shared/errors/app-error';
import { categoryBreakdownQuerySchema } from '../schemas/category-breakdown-query.schema';
import {
  toCategoryBreakdownDto,
  type CategoryBreakdownDTO,
} from '../dto/category-breakdown.dto';
import type {
  ActionResult,
  ReportsActionDeps,
} from './_shared';
import {
  domainErrorToActionError,
  zodErrorToActionError,
} from './_shared';

export interface GetCategoryBreakdownInput {
  readonly userId: string;
  readonly rawQuery: unknown;
}

export type GetCategoryBreakdownData = CategoryBreakdownDTO;

export async function getCategoryBreakdownAction(
  deps: ReportsActionDeps,
  input: GetCategoryBreakdownInput,
): Promise<ActionResult<GetCategoryBreakdownData>> {
  const parsed = categoryBreakdownQuerySchema.safeParse(input.rawQuery);
  if (!parsed.success) return zodErrorToActionError(parsed.error);
  const { month } = parsed.data;

  const year = Number.parseInt(month.slice(0, 4), 10);
  const monthNum = Number.parseInt(month.slice(5, 7), 10);

  try {
    const rows = await deps.reportsRepository.findByUserAndMonthForBreakdown(
      input.userId,
      { year, month: monthNum },
    );
    const breakdown = createCategoryBreakdown({
      userId: input.userId,
      year,
      month: monthNum,
      rows,
      clock: deps.clock,
    });
    return { ok: true, value: toCategoryBreakdownDto(breakdown) };
  } catch (err) {
    if (err instanceof AppError) return domainErrorToActionError(err);
    return {
      ok: false,
      error: new AppError({
        code: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Internal error.',
      }),
    };
  }
}
