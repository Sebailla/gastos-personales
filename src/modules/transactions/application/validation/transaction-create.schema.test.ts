/**
 * Tests for TransactionCreateSchema.
 *
 * RED — 5 cases covering:
 * (1) valid input passes (the happy path)
 * (2) accountId non-uuid rejected
 * (3) amountMinor = 0 rejected (REQ-TX-2)
 * (4) transactionDate in the future rejected (REQ-TX-4)
 * (5) memo > 500 chars rejected (REQ-TX-5)
 *
 * Slice 3 binding. The schema lives at
 * `application/validation/transaction-create.schema.ts` and is
 * the wire shape for `POST /api/transactions`. The strict()
 * modifier rejects unknown fields (BR-TX-8).
 *
 * UUID validation is via Zod's `z.string().uuid()` (slice
 * preference — mirrors the accounts service's `cuid` checks
 * pattern but at the boundary). The Prisma adapter converts
 * `cuid()` ids server-side.
 */

import { describe, it, expect } from 'vitest';
import { TransactionCreateSchema } from './transaction-create.schema';

const today = new Date().toISOString();

const valid = {
  accountId: 'fa-1b9e3c0a-1234-4567-89ab-cdef01234567',
  direction: 'EXPENSE',
  amountMinor: 1000,
  originalCurrency: 'USD',
  transactionDate: today,
};

describe('TransactionCreateSchema', () => {
  it('accepts a valid input', () => {
    const result = TransactionCreateSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects a non-uuid accountId', () => {
    const result = TransactionCreateSchema.safeParse({ ...valid, accountId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects amountMinor = 0 (REQ-TX-2)', () => {
    const result = TransactionCreateSchema.safeParse({ ...valid, amountMinor: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects a future transactionDate (REQ-TX-4)', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const result = TransactionCreateSchema.safeParse({ ...valid, transactionDate: future });
    expect(result.success).toBe(false);
  });

  it('rejects a memo longer than 500 chars (REQ-TX-5)', () => {
    const result = TransactionCreateSchema.safeParse({ ...valid, memo: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });
});
