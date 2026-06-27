/**
 * `getAccountFlowAction` — `GET /api/reports/accounts/:accountId/flow`.
 *
 * Slice 2 deliverable. The most complex of the three actions;
 * per design §5.5:
 *
 *   1. Parse `rawQuery` with `accountFlowQuerySchema` (cuid
 *      regex + month OR range union).
 *   2. Compute the date window from the schema's output.
 *      Enforce the 366-day upper bound (BR-RPT-3) — Zod has
 *      no date-math primitive (design §5.6 last paragraph).
 *   3. Cross-check account ownership via
 *      `deps.accountRepository.findById(userId, accountId)`:
 *      - `null` (cross-user or unknown account) → 404
 *        NOT_FOUND (REQ-RPT-4, BR-RPT-4).
 *      - Account found → proceed.
 *   4. Call `deps.reportsRepository.findByUserAccountAndRange(
 *      userId, { accountId, fromDate, toDate })`.
 *   5. Call `createAccountFlow(...)`.
 *   6. Map to `AccountFlowDTO` via `toAccountFlowDto`.
 *   7. Return `{ ok: true, value: dto }`.
 *
 * Sparse-day behavior: `rows.length === 0` in the range →
 * `days: []`, HTTP 200. The route never returns 404 for an
 * empty range — the cross-user 404 is the only 404 path.
 *
 * Cross-cutting invariants:
 * - BR-TX-4: every cross-module reference scopes to `userId`.
 * - BR-RPT-3: date range shape + 366-day upper bound.
 * - BR-RPT-4: cross-user returns 404 (not 403).
 * - BR-ACC-12: aggregates group by `convertedCurrency`; no
 *   FX call in the read path.
 */

import { createAccountFlow } from '../../domain/aggregates/account-flow';
import { AccountNotFoundError } from '../../domain/errors/account-not-found-error';
import { InvalidDateRangeError } from '../../domain/errors/invalid-date-range-error';
import { AppError } from '@/shared/errors/app-error';
import { accountFlowQuerySchema } from '../schemas/account-flow-query.schema';
import { toAccountFlowDto, type AccountFlowDTO } from '../dto/account-flow.dto';
import type {
  ActionResult,
  ReportsActionDeps,
} from './_shared';
import {
  domainErrorToActionError,
  zodErrorToActionError,
} from './_shared';

export interface GetAccountFlowInput {
  readonly userId: string;
  readonly accountId: string;
  readonly rawQuery: unknown;
}

export type GetAccountFlowData = AccountFlowDTO;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

/**
 * Parse a `YYYY-MM-DD` ISO date key into a UTC-midnight `Date`.
 * The factory uses the same convention. The schema's regex
 * guarantees the shape; the runtime checks defend against
 * undefined values under `noUncheckedIndexedAccess`.
 */
function isoDateToUtcMidnight(iso: string): Date {
  const parts = iso.split('-');
  const y = Number.parseInt(parts[0] ?? '', 10);
  const m = Number.parseInt(parts[1] ?? '', 10);
  const d = Number.parseInt(parts[2] ?? '', 10);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

/**
 * Parse a `YYYY-MM` ISO month key into the inclusive UTC
 * window `[YYYY-MM-01 00:00:00.000Z, YYYY-(MM+1)-01
 * 00:00:00.000Z)`.
 */
function isoMonthToUtcWindow(iso: string): { fromDate: Date; toDate: Date } {
  const y = Number.parseInt(iso.slice(0, 4), 10);
  const m = Number.parseInt(iso.slice(5, 7), 10);
  return {
    fromDate: new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)),
    toDate: new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)),
  };
}

/**
 * Validate the 366-day upper bound (BR-RPT-3). Returns an
 * `InvalidDateRangeError` if the inclusive day count exceeds
 * `MAX_RANGE_DAYS`. The day count is computed as
 * `floor((toDate - fromDate) / MS_PER_DAY) + 1`.
 */
function assertRangeWithinBound(fromDate: Date, toDate: Date): InvalidDateRangeError | null {
  const rangeDays =
    Math.floor((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY) + 1;
  if (rangeDays > MAX_RANGE_DAYS) {
    return new InvalidDateRangeError(
      `Date range must be <= ${MAX_RANGE_DAYS} days; got ${rangeDays}.`,
    );
  }
  return null;
}

export async function getAccountFlowAction(
  deps: ReportsActionDeps,
  input: GetAccountFlowInput,
): Promise<ActionResult<GetAccountFlowData>> {
  // The schema enforces `accountId` shape (cuid regex). The
  // action-layer envelope carries `accountId` from the URL
  // path; the schema re-validates it via the union's
  // `accountId` field (design §5.5 step 1).
  const rawQueryWithAccountId = {
    accountId: input.accountId,
    ...(typeof input.rawQuery === 'object' && input.rawQuery !== null
      ? (input.rawQuery as Record<string, unknown>)
      : {}),
  };
  const parsed = accountFlowQuerySchema.safeParse(rawQueryWithAccountId);
  if (!parsed.success) return zodErrorToActionError(parsed.error);

  // Derive the UTC window. The union shape is two-variant;
  // discriminate on `month` vs `fromDate` keys (Zod's
  // `safeParse` returns the parsed value).
  let fromDate: Date;
  let toDate: Date;
  if ('month' in parsed.data && parsed.data.month !== undefined) {
    const window = isoMonthToUtcWindow(parsed.data.month);
    fromDate = window.fromDate;
    toDate = window.toDate;
  } else if ('fromDate' in parsed.data && 'toDate' in parsed.data) {
    fromDate = isoDateToUtcMidnight(parsed.data.fromDate);
    toDate = isoDateToUtcMidnight(parsed.data.toDate);
    toDate = new Date(toDate.getTime() + MS_PER_DAY - 1); // inclusive end-of-day
  } else {
    // Schema exhaustiveness — should be unreachable.
    return {
      ok: false,
      error: new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Either month or fromDate+toDate must be supplied.',
      }),
    };
  }

  // 366-day upper bound (BR-RPT-3, design §5.5 step 2).
  const rangeError = assertRangeWithinBound(fromDate, toDate);
  if (rangeError !== null) {
    return domainErrorToActionError(rangeError);
  }

  try {
    // Cross-user / unknown account guard (REQ-RPT-4).
    const account = await deps.accountRepository.findById(input.userId, input.accountId);
    if (account === null) {
      return domainErrorToActionError(
        new AccountNotFoundError(
          `Account ${JSON.stringify(input.accountId)} not found for user ${JSON.stringify(input.userId)}.`,
        ),
      );
    }

    const rows = await deps.reportsRepository.findByUserAccountAndRange(
      input.userId,
      { accountId: input.accountId, fromDate, toDate },
    );
    const flow = createAccountFlow({
      userId: input.userId,
      accountId: input.accountId,
      fromDate,
      toDate,
      rows,
      clock: deps.clock,
    });
    return { ok: true, value: toAccountFlowDto(flow) };
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
