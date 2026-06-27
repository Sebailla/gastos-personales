/**
 * `getMonthlySummaryAction` — `GET /api/reports/monthly`.
 *
 * Slice 2 deliverable. The action follows design §5.3:
 *
 *   1. Parse `rawQuery` with `monthlySummaryQuerySchema`
 *      (Zod). On failure → `zodErrorToActionError`.
 *   2. Compute the UTC window: `[year-month-01 00:00:00.000Z,
 *      year-(month+1)-01 00:00:00.000Z)` (the port widens
 *      internally).
 *   3. Call `deps.reportsRepository.findByUserAndMonth(userId,
 *      { year, month })`. The port returns
 *      `TransactionDTO[]` already filtered by `userId`
 *      (BR-TX-4 cross-module invariant).
 *   4. Call `createMonthlySummary({ userId, year, month, rows,
 *      clock })` from the domain layer.
 *   5. Map to `MonthlySummaryDTO` via `toMonthlySummaryDto`.
 *   6. Return `{ ok: true, value: dto }`.
 *
 * Empty state: `rows.length === 0` → `totals: []`,
 * `generatedAt: clock.now()`, `HTTP 200`. The route returns
 * 200 regardless of whether the user has accounts; the
 * empty-totals response is the v1 sentinel for "no accounts
 * yet" (design §7.1, REQ-RPT-1 empty-month scenario).
 *
 * Cross-cutting invariants:
 * - BR-TX-4: every cross-module reference to a transaction
 *   scopes to `userId`; the port enforces it. The action
 *   does NOT re-filter.
 * - BR-ACC-12: aggregates group by `convertedCurrency`; no
 *   FX call in the read path.
 * - Services throw, actions catch (root AGENTS.md §10.5).
 *   Domain errors map via `domainErrorToActionError`.
 */

import { createMonthlySummary } from '../../domain/aggregates/monthly-summary';
import { AppError } from '@/shared/errors/app-error';
import { monthlySummaryQuerySchema } from '../schemas/monthly-summary-query.schema';
import { toMonthlySummaryDto, type MonthlySummaryDTO } from '../dto/monthly-summary.dto';
import type {
  ActionResult,
  ReportsActionDeps,
} from './_shared';
import {
  domainErrorToActionError,
  zodErrorToActionError,
} from './_shared';

/**
 * Input shape for the action. `rawQuery` is the untrusted
 * input from the API boundary (typically `Object.fromEntries(
 * new URL(req.url).searchParams)`); the action's first
 * responsibility is to Zod-validate it.
 */
export interface GetMonthlySummaryInput {
  readonly userId: string;
  readonly rawQuery: unknown;
}

export type GetMonthlySummaryData = MonthlySummaryDTO;

export async function getMonthlySummaryAction(
  deps: ReportsActionDeps,
  input: GetMonthlySummaryInput,
): Promise<ActionResult<GetMonthlySummaryData>> {
  const parsed = monthlySummaryQuerySchema.safeParse(input.rawQuery);
  if (!parsed.success) return zodErrorToActionError(parsed.error);
  const { month } = parsed.data;

  // Parse the `YYYY-MM` string to derive year + month integers
  // for the port's narrow options shape. The schema's regex +
  // refine gate guarantees the shape.
  const year = Number.parseInt(month.slice(0, 4), 10);
  const monthNum = Number.parseInt(month.slice(5, 7), 10);

  try {
    const rows = await deps.reportsRepository.findByUserAndMonth(input.userId, {
      year,
      month: monthNum,
    });
    const summary = createMonthlySummary({
      userId: input.userId,
      year,
      month: monthNum,
      rows,
      clock: deps.clock,
    });
    return { ok: true, value: toMonthlySummaryDto(summary) };
  } catch (err) {
    if (err instanceof AppError) return domainErrorToActionError(err);
    // Unexpected error (Prisma down, JSON serialization, etc.).
    // Map to a uniform 500 envelope; the central error
    // handler will surface this on the wire.
    return {
      ok: false,
      error: new AppError({
        code: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Internal error.',
      }),
    };
  }
}
