/**
 * Tests for TransactionListQuerySchema.
 *
 * RED — 3 cases covering:
 * (1) valid query passes
 * (2) limit > 100 clamped to 100 (BR-TX-10)
 * (3) limit < 1 clamped to 1 (BR-TX-10)
 *
 * Slice 3 binding. The cursor is opaque (the previous
 * `nextCursor` returned by the list endpoint). The schema
 * accepts a string when supplied; empty/undefined defaults
 * to "first page".
 */

import { describe, it, expect } from 'vitest';
import { TransactionListQuerySchema } from './transaction-list.schema';

describe('TransactionListQuerySchema', () => {
  it('accepts a valid query', () => {
    const result = TransactionListQuerySchema.safeParse({
      cursor: 'opaque-cursor',
      limit: 50,
      accountId: 'fa-1b9e3c0a-1234-4567-89ab-cdef01234567',
    });
    expect(result.success).toBe(true);
  });

  it('clamps limit > 100 down to 100', () => {
    const result = TransactionListQuerySchema.safeParse({ limit: 999 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(100);
    }
  });

  it('clamps limit below 1 up to 1', () => {
    const result = TransactionListQuerySchema.safeParse({ limit: 0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(1);
    }
  });
});
