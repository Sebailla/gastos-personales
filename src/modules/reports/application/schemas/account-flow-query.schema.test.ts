/**
 * Tests for `accountFlowQuerySchema` (T-RPT-103).
 *
 * Slice 2 deliverable — action-layer Zod schema for the
 * `GET /api/reports/accounts/:accountId/flow` query string.
 * The schema enforces:
 *
 *   - `accountId` matches the cuid regex
 *     `^c[a-z0-9]{20,32}$` (orchestrator correction #1 — the
 *     project uses cuid for `FinancialAccount.id`, NOT UUID v4
 *     as the spec text originally said; see
 *     `openspec/changes/reports/design.md §3.4.1`).
 *   - EITHER `month: YYYY-MM` OR `fromDate + toDate: YYYY-MM-DD`.
 *   - `fromDate <= toDate` (BR-RPT-3, REQ-RPT-3).
 *   - `.strict()` rejects unknown keys (BR-TX-8).
 *
 * The 366-day upper bound (BR-RPT-3) is enforced at the action
 * layer (T-RPT-110) — Zod has no built-in date-math primitive
 * (design §5.6 last paragraph).
 *
 * Tests (T-RPT-103 acceptance criteria):
 *   (1) `{ accountId: '<cuid>', month: '2026-06' }` parses.
 *   (2) `{ accountId: 'not-a-cuid', month: '2026-06' }` fails.
 *   (3) `{ accountId, fromDate, toDate }` parses.
 *   (4) `fromDate > toDate` fails.
 *   (5) Mixing `month` + `fromDate` fails (one or the other).
 *
 * RED — the schema file does not exist yet.
 */

import { describe, it, expect } from 'vitest';
import { accountFlowQuerySchema } from './account-flow-query.schema';

// A representative cuid-shaped string for the positive cases
// (25 chars total: `c` + 24 lowercase/digit chars).
const VALID_CUID = 'c1234567890abcdef1234567z';

describe('accountFlowQuerySchema', () => {
  it('parses { accountId: <cuid>, month: "2026-06" }', () => {
    expect(
      accountFlowQuerySchema.parse({
        accountId: VALID_CUID,
        month: '2026-06',
      }),
    ).toEqual({
      accountId: VALID_CUID,
      month: '2026-06',
    });
  });

  it('rejects { accountId: "not-a-cuid", month: "2026-06" } (cuid regex fail)', () => {
    const result = accountFlowQuerySchema.safeParse({
      accountId: 'not-a-cuid',
      month: '2026-06',
    });
    expect(result.success).toBe(false);
  });

  it('parses { accountId, fromDate, toDate }', () => {
    expect(
      accountFlowQuerySchema.parse({
        accountId: VALID_CUID,
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
      }),
    ).toEqual({
      accountId: VALID_CUID,
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
    });
  });

  it('rejects when fromDate > toDate', () => {
    const result = accountFlowQuerySchema.safeParse({
      accountId: VALID_CUID,
      fromDate: '2026-12-01',
      toDate: '2026-01-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects mixing month + fromDate (union — one or the other)', () => {
    const result = accountFlowQuerySchema.safeParse({
      accountId: VALID_CUID,
      month: '2026-06',
      fromDate: '2026-06-01',
    });
    expect(result.success).toBe(false);
  });
});
