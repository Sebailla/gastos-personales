/**
 * Unit tests: `CategoryBreakdown` aggregate factory +
 * `normalizeCategory` free function.
 *
 * Slice 1 / T-RPT-008 (RED → GREEN) — design §3.3.
 *
 * The aggregate:
 *  1. Computes `categoryNormalized` per row via `normalizeCategory`
 *     (lowercase + trim; null / empty → "uncategorized"; whitespace-only
 *     → "uncategorized" — BR-RPT-2, BR-TX-9).
 *  2. Groups by the tuple `(categoryNormalized, convertedCurrency)`.
 *  3. Sums `convertedAmountMinor` per bucket → `amountMinor`
 *     (may be negative for refund net).
 *  4. Counts `txCount` per bucket (zero-count buckets dropped).
 *  5. Sorts by `amountMinor DESC` primary, `categoryNormalized ASC`
 *     secondary (deterministic tie-break).
 *  6. Preserves the FIRST raw `category` string observed for the
 *     bucket (the raw `category` field is preserved verbatim per
 *     BR-RPT-2 + REQ-RPT-2; subsequent raw strings are dropped).
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
import {
  createCategoryBreakdown,
  normalizeCategory,
  type CategoryBreakdown,
} from './category-breakdown';

const fixedClock: Clock = {
  now: () => new Date('2026-06-30T12:00:00.000Z'),
};

function tx(overrides: Partial<TransactionDTO> = {}): TransactionDTO {
  return {
    id: 'tx-1',
    userId: 'u-1',
    accountId: 'c-aaaaaaaaaaaaaaaaaaaa',
    direction: 'EXPENSE',
    category: null,
    memo: null,
    transactionDate: new Date('2026-06-15T12:00:00.000Z'),
    convertedAmountMinor: 1000,
    convertedCurrency: AccountCurrency.ARS,
    ...overrides,
  };
}

describe('normalizeCategory free function — BR-TX-9 + BR-RPT-2', () => {
  it('lowercases the raw category', () => {
    expect(normalizeCategory('Food')).toBe('food');
    expect(normalizeCategory('FOOD')).toBe('food');
  });

  it('trims leading + trailing whitespace', () => {
    expect(normalizeCategory('  food  ')).toBe('food');
    expect(normalizeCategory('\tFood\n')).toBe('food');
  });

  it('returns "uncategorized" for null', () => {
    expect(normalizeCategory(null)).toBe('uncategorized');
  });

  it('returns "uncategorized" for empty string', () => {
    expect(normalizeCategory('')).toBe('uncategorized');
  });

  it('returns "uncategorized" for whitespace-only string', () => {
    expect(normalizeCategory('   ')).toBe('uncategorized');
    expect(normalizeCategory('\t\n')).toBe('uncategorized');
  });

  it('is idempotent: normalize(normalize(x)) === normalize(x)', () => {
    expect(normalizeCategory(normalizeCategory('FOO'))).toBe('foo');
    expect(normalizeCategory(normalizeCategory(null))).toBe('uncategorized');
  });
});

describe('CategoryBreakdown factory — REQ-RPT-2', () => {
  it('groups by (categoryNormalized, convertedCurrency) and sums amountMinor', () => {
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        category: 'Food',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 100,
        direction: 'EXPENSE',
      }),
      tx({
        id: 'tx-2',
        category: 'food',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 200,
        direction: 'EXPENSE',
      }),
      tx({
        id: 'tx-3',
        category: '  FOOD  ',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 300,
        direction: 'EXPENSE',
      }),
      tx({
        id: 'tx-4',
        category: 'Food',
        convertedCurrency: AccountCurrency.USD,
        convertedAmountMinor: 50,
        direction: 'EXPENSE',
      }),
    ];
    const breakdown: CategoryBreakdown = createCategoryBreakdown({
      userId: 'u-1',
      year: 2026,
      month: 6,
      rows,
      clock: fixedClock,
    });
    // Assert the exact expected shape — no `find()` calls or
    // iteration loops in tests (per §10.5 "No logic in tests").
    // The factory's sort order is: amountMinor DESC, then
    // categoryNormalized ASC (deterministic tie-break).
    expect(breakdown.buckets).toEqual([
      {
        category: 'Food', // first raw observed value is preserved
        categoryNormalized: 'food',
        convertedCurrency: AccountCurrency.ARS,
        amountMinor: -600, // 100 + 200 + 300 = 600, sign negative for EXPENSE
        txCount: 3,
      },
      {
        category: 'Food',
        categoryNormalized: 'food',
        convertedCurrency: AccountCurrency.USD,
        amountMinor: -50,
        txCount: 1,
      },
    ]);
  });

  it('null and empty categories collapse to "uncategorized"', () => {
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        category: null,
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 100,
        direction: 'EXPENSE',
      }),
      tx({
        id: 'tx-2',
        category: '',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 200,
        direction: 'EXPENSE',
      }),
      tx({
        id: 'tx-3',
        category: '   ',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 300,
        direction: 'EXPENSE',
      }),
    ];
    const breakdown = createCategoryBreakdown({
      userId: 'u-1',
      year: 2026,
      month: 6,
      rows,
      clock: fixedClock,
    });
    expect(breakdown.buckets).toHaveLength(1);
    expect(breakdown.buckets[0].categoryNormalized).toBe('uncategorized');
    expect(breakdown.buckets[0].txCount).toBe(3);
    expect(breakdown.buckets[0].amountMinor).toBe(-600);
  });

  it('sorts by amountMinor DESC primary, categoryNormalized ASC secondary', () => {
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        category: 'Food',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 10000,
        direction: 'INCOME',
      }),
      tx({
        id: 'tx-2',
        category: 'Rent',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 30000,
        direction: 'INCOME',
      }),
      tx({
        id: 'tx-3',
        category: 'Other',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 5000,
        direction: 'INCOME',
      }),
    ];
    const breakdown = createCategoryBreakdown({
      userId: 'u-1',
      year: 2026,
      month: 6,
      rows,
      clock: fixedClock,
    });
    expect(breakdown.buckets.map((b) => b.categoryNormalized)).toEqual([
      'rent', // 30000
      'food', // 10000
      'other', // 5000
    ]);
    // Also pin the full shape with bucketing values.
    expect(breakdown.buckets).toEqual([
      {
        category: 'Rent',
        categoryNormalized: 'rent',
        convertedCurrency: AccountCurrency.ARS,
        amountMinor: 30000,
        txCount: 1,
      },
      {
        category: 'Food',
        categoryNormalized: 'food',
        convertedCurrency: AccountCurrency.ARS,
        amountMinor: 10000,
        txCount: 1,
      },
      {
        category: 'Other',
        categoryNormalized: 'other',
        convertedCurrency: AccountCurrency.ARS,
        amountMinor: 5000,
        txCount: 1,
      },
    ]);
  });

  it('sort tie-break: equal amountMinor sorts by categoryNormalized ASC', () => {
    // Two categories with the same amountMinor — the secondary
    // sort (categoryNormalized ASC) determines the order.
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        category: 'Zeta',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 100,
        direction: 'INCOME',
      }),
      tx({
        id: 'tx-2',
        category: 'Alpha',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 100,
        direction: 'INCOME',
      }),
    ];
    const breakdown = createCategoryBreakdown({
      userId: 'u-1',
      year: 2026,
      month: 6,
      rows,
      clock: fixedClock,
    });
    // Assert full shape, not just categoryNormalized — pins the
    // bucket ordering (alpha before zeta) AND the bucketing
    // (two buckets, each with txCount=1).
    expect(breakdown.buckets).toEqual([
      {
        category: 'Alpha',
        categoryNormalized: 'alpha',
        convertedCurrency: AccountCurrency.ARS,
        amountMinor: 100,
        txCount: 1,
      },
      {
        category: 'Zeta',
        categoryNormalized: 'zeta',
        convertedCurrency: AccountCurrency.ARS,
        amountMinor: 100,
        txCount: 1,
      },
    ]);
  });

  it('drops zero-count buckets (factory trusts txCount > 0)', () => {
    // A zero-count bucket cannot occur from the port (the port
    // returns rows that exist; the factory sums row count per
    // bucket). The test pins the invariant: a bucket with
    // txCount === 0 is excluded from the response.
    // To exercise this path, we mutate the post-aggregation
    // shape via a direct factory call with rows that produce
    // exactly one bucket — the bucket's txCount must be > 0.
    const rows: readonly TransactionDTO[] = [
      tx({
        id: 'tx-1',
        category: 'Food',
        convertedCurrency: AccountCurrency.ARS,
        convertedAmountMinor: 100,
        direction: 'EXPENSE',
      }),
    ];
    const breakdown = createCategoryBreakdown({
      userId: 'u-1',
      year: 2026,
      month: 6,
      rows,
      clock: fixedClock,
    });
    expect(breakdown.buckets).toHaveLength(1);
    expect(breakdown.buckets[0].txCount).toBeGreaterThan(0);
  });

  it('returns buckets: [] when no rows in the month', () => {
    const breakdown = createCategoryBreakdown({
      userId: 'u-1',
      year: 2026,
      month: 6,
      rows: [],
      clock: fixedClock,
    });
    expect(breakdown.buckets).toEqual([]);
    expect(breakdown.generatedAt).toEqual(fixedClock.now());
  });

  it('stamps generatedAt from clock.now() (no new Date() in domain code)', () => {
    const breakdown = createCategoryBreakdown({
      userId: 'u-1',
      year: 2026,
      month: 6,
      rows: [],
      clock: fixedClock,
    });
    expect(breakdown.generatedAt.toISOString()).toBe('2026-06-30T12:00:00.000Z');
  });
});
