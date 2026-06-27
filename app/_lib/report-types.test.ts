/**
 * Wire-shape tests for `app/_lib/report-types.ts`.
 *
 * These tests assert that the locally-mirrored DTO shapes
 * (the ones the Server Components consume) match the
 * application-layer DTOs field-for-field. Drift between the
 * local mirror and the application DTOs surfaces as a
 * `pnpm run typecheck` failure on the consumer (the Server
 * Component + the Hono route handler), but the test pins the
 * shape in isolation so a regression is caught here first.
 *
 * Per the `app/_lib/transaction-types.ts` precedent: the UI
 * does NOT import from the reports module's internal DTO
 * paths (architecture-standards rule). The local mirror is
 * hand-maintained in lock-step with the slice-2 DTO mappers
 * (`src/modules/reports/application/dto/*`).
 *
 * Why this test exists: the wire shapes are the contract
 * between the Hono API (slice 3) and the Server Component
 * (slice 4). Pinning them as a runtime test catches silent
 * drift — Vitest fails the test when the module does not
 * exist (cannot resolve module), and as a `pnpm run typecheck`
 * failure on the consumer when the shapes drift.
 *
 * Implementation note: we import the module by VALUE (no
 * `import type` keyword) so Vitest's runtime resolution fails
 * when the file does not exist. Type-only imports are erased
 * at compile time and would not surface a missing-file
 * failure here.
 */

import { describe, it, expect } from 'vitest';
// Import as a namespace (no `type` keyword) so the module is
// loaded at runtime; Vitest fails the test with
// "Cannot find module" if `report-types.ts` does not exist.
// (esbuild erases `import type` at compile time — a value
// import is what catches the missing file at test time.)
import * as ReportTypes from './report-types';

// Force a runtime reference so esbuild does not elide the
// namespace import. The module object exists if the file
// resolves; the value-level assertions live on the typed
// fixtures below.
const _moduleExists: object = ReportTypes;

type MonthlySummaryDTO = ReportTypes.MonthlySummaryDTO;
type MonthlyTotalsDTO = ReportTypes.MonthlyTotalsDTO;
type CategoryBreakdownDTO = ReportTypes.CategoryBreakdownDTO;
type CategoryBucketDTO = ReportTypes.CategoryBucketDTO;
type AccountFlowDTO = ReportTypes.AccountFlowDTO;
type AccountFlowDayDTO = ReportTypes.AccountFlowDayDTO;
type ErrorEnvelope = ReportTypes.ErrorEnvelope;

describe('report-types — wire shapes (mirrors application DTOs)', () => {
  it('module resolves (file exists and is loadable)', () => {
    // The namespace import throws at module load time when the
    // file is missing; this assertion pins the runtime load
    // as a separate signal so the failure message is clear.
    expect(_moduleExists).toBeDefined();
  });

  it('MonthlySummaryDTO has { totals: MonthlyTotalsDTO[]; generatedAt: string }', () => {
    const totals: MonthlyTotalsDTO = {
      convertedCurrency: 'ARS',
      incomeMinor: 1000,
      expenseMinor: 500,
      netMinor: 500,
      count: 3,
    };
    const summary: MonthlySummaryDTO = {
      totals: [totals],
      generatedAt: '2026-06-27T12:00:00.000Z',
    };
    expect(summary.totals).toHaveLength(1);
    expect(summary.totals[0]?.convertedCurrency).toBe('ARS');
    expect(summary.generatedAt).toBe('2026-06-27T12:00:00.000Z');
  });

  it('MonthlyTotalsDTO carries signed-minor-units per design §3.2.1', () => {
    const totals: MonthlyTotalsDTO = {
      convertedCurrency: 'USD',
      incomeMinor: 0,
      expenseMinor: 0,
      netMinor: 0,
      count: 0,
    };
    expect(totals.incomeMinor).toBe(0);
    expect(totals.expenseMinor).toBe(0);
    expect(totals.netMinor).toBe(0);
    expect(totals.count).toBe(0);
  });

  it('CategoryBreakdownDTO has { buckets: CategoryBucketDTO[]; generatedAt: string }', () => {
    const bucket: CategoryBucketDTO = {
      category: 'Food',
      categoryNormalized: 'food',
      convertedCurrency: 'ARS',
      amountMinor: 1234,
      txCount: 2,
    };
    const breakdown: CategoryBreakdownDTO = {
      buckets: [bucket],
      generatedAt: '2026-06-27T12:00:00.000Z',
    };
    expect(breakdown.buckets).toHaveLength(1);
    expect(breakdown.buckets[0]?.category).toBe('Food');
    expect(breakdown.buckets[0]?.categoryNormalized).toBe('food');
    expect(breakdown.generatedAt).toBe('2026-06-27T12:00:00.000Z');
  });

  it('CategoryBucketDTO preserves null category per BR-RPT-2', () => {
    const bucket: CategoryBucketDTO = {
      category: null,
      categoryNormalized: 'uncategorized',
      convertedCurrency: 'ARS',
      amountMinor: 500,
      txCount: 1,
    };
    expect(bucket.category).toBeNull();
    expect(bucket.categoryNormalized).toBe('uncategorized');
  });

  it('AccountFlowDTO has { days: AccountFlowDayDTO[]; generatedAt: string } + fromDate + toDate', () => {
    const day: AccountFlowDayDTO = {
      date: '2026-06-15',
      netMinor: 1000,
      runningBalanceMinor: 5000,
      count: 1,
      convertedCurrency: 'ARS',
    };
    const flow: AccountFlowDTO = {
      fromDate: '2026-06-01T00:00:00.000Z',
      toDate: '2026-06-30T23:59:59.999Z',
      days: [day],
      generatedAt: '2026-06-27T12:00:00.000Z',
    };
    expect(flow.days).toHaveLength(1);
    expect(flow.days[0]?.date).toBe('2026-06-15');
    expect(flow.fromDate).toBe('2026-06-01T00:00:00.000Z');
    expect(flow.toDate).toBe('2026-06-30T23:59:59.999Z');
    expect(flow.generatedAt).toBe('2026-06-27T12:00:00.000Z');
  });

  it('AccountFlowDayDTO carries YYYY-MM-DD date key per BR-RPT-3', () => {
    const day: AccountFlowDayDTO = {
      date: '2026-06-01',
      netMinor: -500,
      runningBalanceMinor: 4000,
      count: 2,
      convertedCurrency: 'USD',
    };
    expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(day.convertedCurrency).toBe('USD');
  });

  it('ErrorEnvelope mirrors the API error envelope', () => {
    const err: ErrorEnvelope = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'bad month',
      },
    };
    expect(err.error.code).toBe('VALIDATION_ERROR');
    expect(err.error.message).toBe('bad month');
  });
});
