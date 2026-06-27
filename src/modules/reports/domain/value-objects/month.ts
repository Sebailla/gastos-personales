/**
 * Value object: `Month`.
 *
 * A `YYYY-MM` string validated against the regex
 * `^\d{4}-\d{2}$` with bounds checking (year `2000..2100`,
 * month `01..12`). Derives UTC `fromDate` (`YYYY-MM-01T00:00:00.000Z`)
 * and `toDate` (exclusive upper bound: `YYYY-(MM+1)-01T00:00:00.000Z`)
 * for the port's date-window call.
 *
 * The factory throws `InvalidMonthError` on regex / bounds
 * violations; the action layer's Zod parse is the primary gate
 * (catches malformed strings at the API boundary), the factory
 * is the secondary (defense in depth per design §3.2.1).
 *
 * Why a value object and not a primitive:
 * - The `fromDate` / `toDate` derivation is non-trivial (UTC
 *   midnight anchoring, exclusive upper bound for the next-month
 *   roll-over). Modeling the derivation explicitly lets the
 *   aggregate factory consume a single input and skip the
 *   date-math arithmetic.
 * - The discriminator (`{ year, month }`) is the contract; the
 *   `monthString` field is a wire-aligned convenience for the
 *   action layer's DTO mapper.
 */

import { InvalidMonthError } from '../errors/invalid-month-error';

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export interface MonthFields {
  /** The original wire-aligned `YYYY-MM` string. */
  readonly monthString: string;
  /** UTC calendar year. Integer in `[2000, 2100]`. */
  readonly year: number;
  /** UTC calendar month. Integer in `[1, 12]`. */
  readonly month: number;
  /** Inclusive lower bound: `YYYY-MM-01T00:00:00.000Z`. */
  readonly fromDate: Date;
  /** Exclusive upper bound: `YYYY-(MM+1)-01T00:00:00.000Z`. */
  readonly toDate: Date;
}

/**
 * Parse a `YYYY-MM` string and return the bounded value object.
 *
 * Throws `InvalidMonthError` on:
 * - regex fail (not `YYYY-MM` shape);
 * - month not in `01..12`;
 * - year not in `2000..2100`.
 */
export function parseMonth(input: string): MonthFields {
  if (typeof input !== 'string' || !MONTH_REGEX.test(input)) {
    throw new InvalidMonthError(`Month must match YYYY-MM (got ${JSON.stringify(input)}).`);
  }
  const year = Number.parseInt(input.slice(0, 4), 10);
  const month = Number.parseInt(input.slice(5, 7), 10);
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new InvalidMonthError(`Year must be in ${MIN_YEAR}..${MAX_YEAR} (got ${year}).`);
  }
  if (month < 1 || month > 12) {
    throw new InvalidMonthError(`Month must be in 1..12 (got ${month}).`);
  }
  // UTC midnight anchoring per design §3.2.1: fromDate is
  // `YYYY-MM-01T00:00:00.000Z`; toDate is the exclusive upper
  // bound `YYYY-(MM+1)-01T00:00:00.000Z` (Date.UTC rolls over
  // month=12 to month=13 = January of the next year automatically).
  const fromDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const toDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return {
    monthString: input,
    year,
    month,
    fromDate,
    toDate,
  };
}
