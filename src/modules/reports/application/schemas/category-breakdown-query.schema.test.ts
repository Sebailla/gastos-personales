/**
 * Tests for `categoryBreakdownQuerySchema` (T-RPT-105).
 *
 * Slice 2 deliverable — same shape as
 * `monthlySummaryQuerySchema` (T-RPT-101) but a separate
 * file for forward compatibility (a future `?limit=100`
 * filter attaches here without bleeding into the monthly
 * endpoint).
 *
 * Tests mirror the 5 cases from `monthly-summary-query.schema.test.ts`:
 *   (1) parses `{ month: '2026-06' }`.
 *   (2) rejects `{ month: '2026-13' }`.
 *   (3) rejects `{ month: 'foo' }`.
 *   (4) rejects unknown keys (`.strict()`).
 *   (5) rejects `{ month: '' }`.
 */

import { describe, it, expect } from 'vitest';
import { categoryBreakdownQuerySchema } from './category-breakdown-query.schema';

describe('categoryBreakdownQuerySchema', () => {
  it('parses { month: "2026-06" }', () => {
    expect(categoryBreakdownQuerySchema.parse({ month: '2026-06' })).toEqual({
      month: '2026-06',
    });
  });

  it('rejects { month: "2026-13" } (month out of range)', () => {
    const result = categoryBreakdownQuerySchema.safeParse({ month: '2026-13' });
    expect(result.success).toBe(false);
  });

  it('rejects { month: "foo" } (regex fail)', () => {
    const result = categoryBreakdownQuerySchema.safeParse({ month: 'foo' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys via .strict()', () => {
    const result = categoryBreakdownQuerySchema.safeParse({
      month: '2026-06',
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });

  it('rejects { month: "" } (empty string fails regex)', () => {
    const result = categoryBreakdownQuerySchema.safeParse({ month: '' });
    expect(result.success).toBe(false);
  });
});
