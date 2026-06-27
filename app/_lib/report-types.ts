// smoke-minimal, not production
/**
 * Wire types for the reports UI smoke slice.
 *
 * Mirrors the response shapes from the Hono API (the DTOs
 * in `src/modules/reports/application/dto/`). Hand-maintained
 * in lock-step with the slice-2 DTO mappers
 * (`toMonthlySummaryDto`, `toCategoryBreakdownDto`,
 * `toAccountFlowDto`); drift surfaces as a `pnpm run
 * typecheck` failure on the consumer (the Server Component
 * + the Hono route handler).
 *
 * Why local types vs. importing from the reports barrel:
 * the reports module's public barrel at
 * `src/modules/reports/index.ts` re-exports the DTO types
 * (slice 3 added the barrel), but the UI imports from the
 * barrel only for symbols whose source-of-truth lives in
 * the module (e.g. `mountReportsRoutes`). The wire shapes
 * the Server Components consume are projections of the
 * DTOs with the same JSON shape — keeping them local lets
 * the UI's `app/_lib/` tree own the consumer contract, and
 * isolates UI drift from module drift. Mirrors the
 * `app/_lib/transaction-types.ts` precedent.
 *
 * If the wire shapes ever drift from the application DTOs,
 * `pnpm run typecheck` fails on the Server Component (the
 * typed Hono response cast breaks). This file's runtime
 * test (`report-types.test.ts`) pins the shape in isolation.
 *
 * Field shapes reference:
 * - `MonthlySummaryDTO` / `MonthlyTotalsDTO` —
 *   `src/modules/reports/application/dto/monthly-summary.dto.ts`
 * - `CategoryBreakdownDTO` / `CategoryBucketDTO` —
 *   `src/modules/reports/application/dto/category-breakdown.dto.ts`
 * - `AccountFlowDTO` / `AccountFlowDayDTO` —
 *   `src/modules/reports/application/dto/account-flow.dto.ts`
 */

export interface MonthlyTotalsDTO {
  readonly convertedCurrency: string;
  readonly incomeMinor: number;
  readonly expenseMinor: number;
  readonly netMinor: number;
  readonly count: number;
}

export interface MonthlySummaryDTO {
  readonly totals: readonly MonthlyTotalsDTO[];
  readonly generatedAt: string; // ISO 8601
}

export interface CategoryBucketDTO {
  readonly category: string | null;
  readonly categoryNormalized: string;
  readonly convertedCurrency: string;
  readonly amountMinor: number;
  readonly txCount: number;
}

export interface CategoryBreakdownDTO {
  readonly buckets: readonly CategoryBucketDTO[];
  readonly generatedAt: string; // ISO 8601
}

export interface AccountFlowDayDTO {
  readonly date: string; // YYYY-MM-DD (UTC, per BR-RPT-3)
  readonly netMinor: number;
  readonly runningBalanceMinor: number;
  readonly count: number;
  readonly convertedCurrency: string;
}

export interface AccountFlowDTO {
  readonly fromDate: string; // ISO 8601
  readonly toDate: string; // ISO 8601
  readonly days: readonly AccountFlowDayDTO[];
  readonly generatedAt: string; // ISO 8601
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
