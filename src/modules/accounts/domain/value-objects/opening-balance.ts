/**
 * Value object: OpeningBalance.
 *
 * Discriminated union with two factory methods (`fresh` and
 * `historical`) and an internal validator. Models the
 * `openingBalanceMode` column from the `FinancialAccount`
 * model (see `prisma/schema.prisma`):
 *
 * - `FRESH` — the account starts at zero on the creation date.
 *   `openingBalanceDate` is `null`.
 * - `HISTORICAL` — the balance is back-dated to
 *   `openingBalanceDate`. The date must be in the past or
 *   today, and the amount must be `>= 0` (BR-ACC-16, Decision 7).
 *
 * The value object is part of the domain layer; it does NOT
 * know about Prisma, the application Zod schemas, or the API.
 * It throws `AppError(VALIDATION_ERROR, ...)` for invariant
 * violations so the application layer can surface a 400 to
 * the caller without leaking internal details.
 *
 * Why a value object and not a primitive type:
 * - The discriminated union (`mode: FRESH | HISTORICAL`) is
 *   the contract; `null` for `date` is meaningful only when
 *   `mode === FRESH`. Modeling the union explicitly makes
 *   the dependency visible to the type checker.
 * - The two factories enforce the per-mode invariants in
 *   one place. The Zod schema in PR-B re-validates at the
 *   API boundary, but the domain service can construct an
 *   `OpeningBalance` directly without going through Zod.
 */

import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import type { Clock } from '@/shared/clock/clock.port';
import { OpeningBalanceMode } from '../entities/financial-account';

export interface FreshOpeningBalance {
  readonly mode: typeof OpeningBalanceMode.FRESH;
  readonly amountMinor: number;
  readonly date: null;
}

export interface HistoricalOpeningBalance {
  readonly mode: typeof OpeningBalanceMode.HISTORICAL;
  readonly amountMinor: number;
  readonly date: Date;
}

export type OpeningBalance = FreshOpeningBalance | HistoricalOpeningBalance;

/** Reject a `Date` whose underlying timestamp is invalid (NaN). */
function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function validateAmount(amountMinor: number): void {
  if (!Number.isInteger(amountMinor)) {
    throw new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      message: `Opening balance amount must be an integer; got ${amountMinor}`,
    });
  }
  if (amountMinor < 0) {
    throw new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      message: `Opening balance amount must be non-negative; got ${amountMinor}`,
    });
  }
}

function validateNotFuture(date: Date, now: Date): void {
  if (date.getTime() > now.getTime()) {
    throw new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Opening balance date must not be in the future.',
    });
  }
}

export const OpeningBalance = {
  /**
   * Factory for FRESH mode. The `date` is always `null`.
   * The amount must be `>= 0`.
   */
  fresh(amountMinor: number): FreshOpeningBalance {
    validateAmount(amountMinor);
    return {
      mode: OpeningBalanceMode.FRESH,
      amountMinor,
      date: null,
    };
  },

  /**
   * Factory for HISTORICAL mode. The `date` must be a valid
   * `Date` in the past or today (relative to the supplied
   * `clock`). The amount must be `>= 0`.
   *
   * The `clock` is required so the "past or today" check is
   * deterministic and the time source is the same one the
   * rest of the domain uses (per `clock.port.ts`). No
   * `new Date()` leak in the value object.
   */
  historical(date: Date, amountMinor: number, clock: Clock): HistoricalOpeningBalance {
    if (!isValidDate(date)) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Opening balance date must be a valid Date.',
      });
    }
    validateAmount(amountMinor);
    validateNotFuture(date, clock.now());
    return {
      mode: OpeningBalanceMode.HISTORICAL,
      amountMinor,
      date,
    };
  },
} as const;
