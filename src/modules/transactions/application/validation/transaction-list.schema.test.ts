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
      accountId: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    });
    expect(result.success).toBe(true);
  });

  it('clamps limit > 100 down to 100', () => {
    expect(TransactionListQuerySchema.safeParse({ limit: 999 })).toEqual({
      success: true,
      data: { limit: 100, cursor: undefined, accountId: undefined },
    });
  });

  it('clamps limit below 1 up to 1', () => {
    expect(TransactionListQuerySchema.safeParse({ limit: 0 })).toEqual({
      success: true,
      data: { limit: 1, cursor: undefined, accountId: undefined },
    });
  });
});
