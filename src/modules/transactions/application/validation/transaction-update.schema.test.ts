/**
 * Tests for TransactionUpdateSchema.
 *
 * RED — 4 cases covering:
 * (1) valid partial update passes (the happy path)
 * (2) unknown field rejected (BR-TX-8: `.strict()`)
 * (3) missing id rejected (the discriminator for the update)
 * (4) non-uuid id rejected
 *
 * Slice 3 binding. All fields EXCEPT `id` are optional; the
 * schema uses `.strict()` to reject unknown fields at the
 * boundary. The `id` field is the row being patched.
 */

import { describe, it, expect } from 'vitest';
import { TransactionUpdateSchema } from './transaction-update.schema';

describe('TransactionUpdateSchema', () => {
  it('accepts a valid partial update', () => {
    const result = TransactionUpdateSchema.safeParse({
      id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
      memo: 'updated memo',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown field', () => {
    const result = TransactionUpdateSchema.safeParse({
      id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
      memo: 'x',
      notAField: 'nope',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing id', () => {
    const result = TransactionUpdateSchema.safeParse({
      memo: 'updated memo',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid id', () => {
    const result = TransactionUpdateSchema.safeParse({
      id: 'not-a-uuid',
      memo: 'updated memo',
    });
    expect(result.success).toBe(false);
  });
});
