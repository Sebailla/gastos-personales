/**
 * Tests for `monthlySummaryQuerySchema` (T-RPT-101).
 *
 * Slice 2 binding — action-layer Zod schema for the
 * `GET /api/reports/monthly` query string. The schema enforces:
 *
 *   1. `month` matches the `^\d{4}-\d{2}$` regex.
 *   2. `month` parses to a calendar month in `1..12`
 *      (the `13` case is the lower-bound test from
 *      `openspec/changes/reports/specs/reports/spec.md`
 *      REQ-RPT-5 "malformed month" scenario).
 *   3. `.strict()` rejects unknown keys at the API
 *      boundary (BR-TX-8 closed form; mirrored from
 *      `TransactionListQuerySchema`).
 *
 * Tests:
 *   (1) parses `{ month: '2026-06' }` → valid.
 *   (2) rejects `{ month: '2026-13' }` → out-of-bounds.
 *   (3) rejects `{ month: 'foo' }` → regex fail.
 *   (4) rejects unknown keys (`.strict()`).
 *   (5) rejects `{ month: '' }` → regex fail on empty.
 *
 * RED — the schema file does not exist yet, so the import
 * fails. The "cannot find module" failure is the expected
 * RED signal per the strict-TDD contract.
 */

import { describe, it, expect } from 'vitest';
import { monthlySummaryQuerySchema } from './monthly-summary-query.schema';

describe('monthlySummaryQuerySchema', () => {
  it('parses { month: "2026-06" }', () => {
    expect(monthlySummaryQuerySchema.parse({ month: '2026-06' })).toEqual({
      month: '2026-06',
    });
  });

  it('rejects { month: "2026-13" } (month out of range)', () => {
    const result = monthlySummaryQuerySchema.safeParse({ month: '2026-13' });
    expect(result.success).toBe(false);
  });

  it('rejects { month: "foo" } (regex fail)', () => {
    const result = monthlySummaryQuerySchema.safeParse({ month: 'foo' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys via .strict()', () => {
    const result = monthlySummaryQuerySchema.safeParse({
      month: '2026-06',
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });

  it('rejects { month: "" } (empty string fails regex)', () => {
    const result = monthlySummaryQuerySchema.safeParse({ month: '' });
    expect(result.success).toBe(false);
  });
});
