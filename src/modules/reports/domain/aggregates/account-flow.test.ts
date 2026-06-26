/**
 * Unit tests: `AccountFlow` aggregate factory.
 *
 * Slice 1 / T-RPT-009 (RED → GREEN) — design §3.4.
 *
 * The factory:
 *  1. Validates `accountId` against the cuid regex
 *     `^c[a-z0-9]{20,32}$` (orchestrator correction #1 — NOT
 *     UUID v4 as the spec text originally said; the project uses
 *     cuid for `FinancialAccount.id`). Throws
 *     `InvalidAccountIdError` on regex fail.
 *  2. Validates the date range: `fromDate <= toDate` AND
 *     `toDate - fromDate <= 366 days` (BR-RPT-3 codified in the
 *     spec; 366 = one calendar year + leap-day buffer).
 *     Throws `InvalidDateRangeError` on violation.
 *  3. Normalizes `fromDate` to `00:00:00.000Z` UTC and `toDate`
 *     to `23:59:59.999Z` UTC (BR-RPT-3: date key is `YYYY-MM-DD`
 *     in UTC, no time component).
 *  4. Groups rows by `(date YYYY-MM-DD UTC, convertedCurrency)`.
 *  5. Sparse days (no rows) are omitted (BR-RPT-3).
 *  6. Computes `runningBalanceMinor` cumulatively:
 *     `days[0].runningBalanceMinor === days[0].netMinor` and
 *     `days[i].runningBalanceMinor === days[i-1].runningBalanceMinor + days[i].netMinor`.
 *  7. Stamps `generatedAt = clock.now()`.
 *
 * The factory trusts the port boundary (BR-TX-4) — it does NOT
 * re-filter rows by `userId`. Cross-user isolation is the port's
 * responsibility.
 */
import { describe, it, expect } from 'vitest';
import { AccountCurrency } from '@/shared/domain-kernel';
import type { TransactionDTO } from '@/shared/domain-kernel';
import type { Clock } from '@/shared/clock/clock.port';
import { createAccountFlow, type AccountFlow } from './account-flow';
import { InvalidAccountIdError } from '../errors/invalid-account-id-error';
import { InvalidDateRangeError } from '../errors/invalid-date-range-error';

const fixedClock: Clock = {
  now: () => new Date('2026-06-30T12:00:00.000Z'),
};

function tx(overrides: Partial<TransactionDTO> = {}): TransactionDTO {
  return {
    id: 'tx-1',
    userId: 'u-1',
    accountId: 'caaaaaaaaaaaaaaaaaaaa', // 20 chars after 'c' (cuid regex ^c[a-z0-9]{20,32}$)
    direction: 'EXPENSE',
    category: null,
    memo: null,
    transactionDate: new Date('2026-06-15T12:00:00.000Z'),
    convertedAmountMinor: 1000,
    convertedCurrency: AccountCurrency.ARS,
    ...overrides,
  };
}

describe('AccountFlow factory — REQ-RPT-3 + BR-RPT-3', () => {
  it('emits one point per UTC day with a non-empty date key (REQ-RPT-3 contiguous scenario)', () => {
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        transactionDate: new Date('2026-06-01T12:00:00.000Z'),
        convertedAmountMinor: -100,
        direction: 'EXPENSE',
      }),
      tx({
        id: 'tx-2',
        transactionDate: new Date('2026-06-02T12:00:00.000Z'),
        convertedAmountMinor: -200,
        direction: 'EXPENSE',
      }),
      tx({
        id: 'tx-3',
        transactionDate: new Date('2026-06-03T12:00:00.000Z'),
        convertedAmountMinor: 300,
        direction: 'INCOME',
      }),
    ];
    const flow: AccountFlow = createAccountFlow({
      userId: 'u-1',
      accountId: 'caaaaaaaaaaaaaaaaaaaa',
      fromDate: new Date('2026-06-01T00:00:00.000Z'),
      toDate: new Date('2026-06-30T23:59:59.999Z'),
      rows,
      clock: fixedClock,
    });
    expect(flow.days).toEqual([
      {
        date: '2026-06-01',
        netMinor: -100,
        runningBalanceMinor: -100,
        count: 1,
        convertedCurrency: AccountCurrency.ARS,
      },
      {
        date: '2026-06-02',
        netMinor: -200,
        runningBalanceMinor: -300,
        count: 1,
        convertedCurrency: AccountCurrency.ARS,
      },
      {
        date: '2026-06-03',
        netMinor: 300,
        runningBalanceMinor: 0,
        count: 1,
        convertedCurrency: AccountCurrency.ARS,
      },
    ]);
  });

  it('omits sparse days (BR-RPT-3 + REQ-RPT-3 sparse scenario)', () => {
    // Transactions on 2026-06-01 and 2026-06-03 only. The
    // 2026-06-02 entry MUST NOT appear in the response.
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        transactionDate: new Date('2026-06-01T12:00:00.000Z'),
        convertedAmountMinor: 100,
        direction: 'INCOME',
      }),
      tx({
        id: 'tx-3',
        transactionDate: new Date('2026-06-03T12:00:00.000Z'),
        convertedAmountMinor: 300,
        direction: 'INCOME',
      }),
    ];
    const flow = createAccountFlow({
      userId: 'u-1',
      accountId: 'caaaaaaaaaaaaaaaaaaaa',
      fromDate: new Date('2026-06-01T00:00:00.000Z'),
      toDate: new Date('2026-06-30T23:59:59.999Z'),
      rows,
      clock: fixedClock,
    });
    expect(flow.days).toEqual([
      {
        date: '2026-06-01',
        netMinor: 100,
        runningBalanceMinor: 100,
        count: 1,
        convertedCurrency: AccountCurrency.ARS,
      },
      {
        date: '2026-06-03',
        netMinor: 300,
        runningBalanceMinor: 400,
        count: 1,
        convertedCurrency: AccountCurrency.ARS,
      },
    ]);
    // Pin the absence of 2026-06-02 explicitly via the count
    // (no .find() calls in tests per §10.5).
    expect(flow.days).toHaveLength(2);
    expect(flow.days.map((d) => d.date)).not.toContain('2026-06-02');
  });

  it('anchors fromDate to 00:00:00.000Z UTC and toDate to 23:59:59.999Z UTC (BR-RPT-3)', () => {
    // The factory normalizes the date range to UTC midnight
    // boundaries. Rows on 2026-06-15 23:59:59.999Z and
    // 2026-06-16 00:00:00.000Z land on the same day and next
    // day respectively, regardless of the input range's local
    // time component.
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        transactionDate: new Date('2026-06-15T23:30:00.000Z'),
        convertedAmountMinor: 100,
        direction: 'INCOME',
      }),
      tx({
        id: 'tx-2',
        transactionDate: new Date('2026-06-16T00:30:00.000Z'),
        convertedAmountMinor: 200,
        direction: 'INCOME',
      }),
    ];
    const flow = createAccountFlow({
      userId: 'u-1',
      accountId: 'caaaaaaaaaaaaaaaaaaaa',
      // fromDate carries a local-time component that the factory
      // must strip.
      fromDate: new Date('2026-06-15T12:00:00.000Z'),
      toDate: new Date('2026-06-16T05:00:00.000Z'),
      rows,
      clock: fixedClock,
    });
    expect(flow.fromDate.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    expect(flow.toDate.toISOString()).toBe('2026-06-16T23:59:59.999Z');
    expect(flow.days).toHaveLength(2);
  });

  it('throws InvalidAccountIdError when accountId fails the cuid regex (orchestrator correction #1)', () => {
    // The cuid regex is `^c[a-z0-9]{20,32}$`. The factory throws
    // `InvalidAccountIdError` (NOT UUID v4) on regex fail.
    expect(() =>
      createAccountFlow({
        userId: 'u-1',
        accountId: 'not-a-cuid',
        fromDate: new Date('2026-06-01T00:00:00.000Z'),
        toDate: new Date('2026-06-30T23:59:59.999Z'),
        rows: [],
        clock: fixedClock,
      }),
    ).toThrow(InvalidAccountIdError);
  });

  it('throws InvalidDateRangeError when toDate - fromDate > 366 days (BR-RPT-3)', () => {
    // 367 days = 1 calendar year + leap-day + 1 day slack. The
    // boundary is 366 days inclusive.
    expect(() =>
      createAccountFlow({
        userId: 'u-1',
        accountId: 'caaaaaaaaaaaaaaaaaaaa',
        fromDate: new Date('2026-01-01T00:00:00.000Z'),
        toDate: new Date('2027-01-02T00:00:00.000Z'),
        rows: [],
        clock: fixedClock,
      }),
    ).toThrow(InvalidDateRangeError);
  });

  it('throws InvalidDateRangeError when fromDate > toDate', () => {
    expect(() =>
      createAccountFlow({
        userId: 'u-1',
        accountId: 'caaaaaaaaaaaaaaaaaaaa',
        fromDate: new Date('2026-06-30T00:00:00.000Z'),
        toDate: new Date('2026-06-01T00:00:00.000Z'),
        rows: [],
        clock: fixedClock,
      }),
    ).toThrow(InvalidDateRangeError);
  });

  it('returns days: [] when no rows in the range (sparse representation)', () => {
    const flow = createAccountFlow({
      userId: 'u-1',
      accountId: 'caaaaaaaaaaaaaaaaaaaa',
      fromDate: new Date('2026-06-01T00:00:00.000Z'),
      toDate: new Date('2026-06-30T23:59:59.999Z'),
      rows: [],
      clock: fixedClock,
    });
    expect(flow.days).toEqual([]);
  });

  it('stamps generatedAt from clock.now()', () => {
    const flow = createAccountFlow({
      userId: 'u-1',
      accountId: 'caaaaaaaaaaaaaaaaaaaa',
      fromDate: new Date('2026-06-01T00:00:00.000Z'),
      toDate: new Date('2026-06-30T23:59:59.999Z'),
      rows: [],
      clock: fixedClock,
    });
    expect(flow.generatedAt.toISOString()).toBe('2026-06-30T12:00:00.000Z');
  });
});
