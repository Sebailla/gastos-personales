import { describe, it, expect } from 'vitest';
import { TransactionDirection } from './transaction-direction';

/**
 * RED: TransactionDirection enum contract (5 cases).
 *
 * The slice spec calls for the `TransactionDirection` const to be exported
 * with three values — `INCOME`, `EXPENSE`, and the v1.1-reserved
 * `TRANSFER`. The UPPERCASE form mirrors the Prisma `TransactionDirection`
 * enum (the future migration shape). The factory rejects `TRANSFER` at
 * the write boundary; the const still exists for forward compatibility
 * and for read-side rows imported from a future v1.1 migration.
 *
 * Branches:
 *  1. `INCOME` is the string `'INCOME'`
 *  2. `EXPENSE` is the string `'EXPENSE'`
 *  3. `TRANSFER` is the string `'TRANSFER'` (reserved for v1.1)
 *  4. the type union is exactly the three string literals
 *  5. the const has no extra keys (exhaustiveness check)
 */
describe('TransactionDirection enum contract', () => {
  it('declares INCOME as the string "INCOME"', () => {
    expect(TransactionDirection.INCOME).toBe('INCOME');
  });

  it('declares EXPENSE as the string "EXPENSE"', () => {
    expect(TransactionDirection.EXPENSE).toBe('EXPENSE');
  });

  it('declares TRANSFER as the string "TRANSFER" (reserved for v1.1)', () => {
    expect(TransactionDirection.TRANSFER).toBe('TRANSFER');
  });

  it('exposes the type union of exactly the three values', () => {
    // The const's value type is the union of the three string literals.
    // This is a compile-time check; the runtime check below pins the
    // exhaustiveness.
    const dir: TransactionDirection = TransactionDirection.INCOME;
    expect(dir).toBe('INCOME');
  });

  it('exposes exactly the three values at runtime (no extra keys)', () => {
    expect(Object.keys(TransactionDirection).sort()).toEqual(
      ['EXPENSE', 'INCOME', 'TRANSFER'].sort(),
    );
  });
});
