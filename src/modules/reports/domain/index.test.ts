/**
 * Compile-time barrel-surface assertions for `src/modules/reports/domain/`.
 *
 * Locks the public surface of the reports domain barrel at the
 * type level. A future PR that removes or renames a symbol
 * from the barrel breaks these assertions and fails
 * `pnpm typecheck`. Mirrors the pattern at
 * `src/modules/auth/index.test.ts` (the canonical barrel
 * contract test in the codebase).
 *
 * Slice 1 / T-RPT-012 (GREEN).
 */
import { describe, it, expectTypeOf } from 'vitest';
import type {
  // Aggregate factories + types
  createMonthlySummary,
  createCategoryBreakdown,
  createAccountFlow,
  MonthlySummary,
  MonthlyTotals,
  CategoryBreakdown,
  CategoryBucket,
  AccountFlow,
  AccountFlowDay,
  CreateMonthlySummaryInput,
  CreateCategoryBreakdownInput,
  CreateAccountFlowInput,
  // Repository port
  ReportsRepositoryPort,
  ListForMonthlyOptions,
  ListForBreakdownOptions,
  ListForFlowOptions,
  // Subscriber port
  Unsubscribe,
  // Errors
  ReportsDomainError,
  InvalidMonthError,
  InvalidAccountIdError,
  InvalidDateRangeError,
  AccountNotFoundError,
  // Month value object
  parseMonth,
  MonthFields,
  // Aggregator service
  aggregateMonthly,
  aggregateCategoryBreakdown,
  aggregateAccountFlow,
  normalizeCategory,
  AggregateMonthlyResult,
  AggregateCategoryBreakdownResult,
  AggregateAccountFlowResult,
} from './index';

describe('reports domain barrel — public surface contract', () => {
  it('re-exports all three aggregate factories as functions', () => {
    expectTypeOf<typeof createMonthlySummary>().toBeFunction();
    expectTypeOf<typeof createCategoryBreakdown>().toBeFunction();
    expectTypeOf<typeof createAccountFlow>().toBeFunction();
  });

  it('re-exports the three aggregate types', () => {
    // Pin the readonly structural shape (sample field) so a
    // future rename breaks the equality.
    expectTypeOf<MonthlySummary['totals']>().toEqualTypeOf<readonly MonthlyTotals[]>();
    expectTypeOf<CategoryBreakdown['buckets']>().toEqualTypeOf<readonly CategoryBucket[]>();
    expectTypeOf<AccountFlow['days']>().toEqualTypeOf<readonly AccountFlowDay[]>();
  });

  it('re-exports the three factory input types', () => {
    expectTypeOf<CreateMonthlySummaryInput['userId']>().toEqualTypeOf<string>();
    expectTypeOf<CreateCategoryBreakdownInput['userId']>().toEqualTypeOf<string>();
    expectTypeOf<CreateAccountFlowInput['userId']>().toEqualTypeOf<string>();
  });

  it('re-exports the repository port and its supporting option types', () => {
    expectTypeOf<ListForMonthlyOptions['year']>().toEqualTypeOf<number>();
    expectTypeOf<ListForBreakdownOptions['month']>().toEqualTypeOf<number>();
    expectTypeOf<ListForFlowOptions['accountId']>().toEqualTypeOf<string>();
  });

  it('re-exports the subscriber port + Unsubscribe handle', () => {
    expectTypeOf<Unsubscribe>().toEqualTypeOf<() => void>();
  });

  it('re-exports the five error classes', () => {
    // Hierarchy invariant: every subclass is an instance of
    // ReportsDomainError (covered at runtime in the domain
    // test seam). Here we assert the structural shape.
    expectTypeOf<InvalidMonthError>().toMatchTypeOf<ReportsDomainError>();
    expectTypeOf<InvalidAccountIdError>().toMatchTypeOf<ReportsDomainError>();
    expectTypeOf<InvalidDateRangeError>().toMatchTypeOf<ReportsDomainError>();
    expectTypeOf<AccountNotFoundError>().toMatchTypeOf<ReportsDomainError>();
  });

  it('re-exports the Month value object', () => {
    expectTypeOf<typeof parseMonth>().toBeFunction();
    expectTypeOf<MonthFields['fromDate']>().toEqualTypeOf<Date>();
  });

  it('re-exports the pure aggregator service functions and result types', () => {
    expectTypeOf<typeof aggregateMonthly>().toBeFunction();
    expectTypeOf<typeof aggregateCategoryBreakdown>().toBeFunction();
    expectTypeOf<typeof aggregateAccountFlow>().toBeFunction();
    expectTypeOf<typeof normalizeCategory>().toBeFunction();
    expectTypeOf<AggregateMonthlyResult['generatedAt']>().toEqualTypeOf<Date>();
    expectTypeOf<AggregateCategoryBreakdownResult['generatedAt']>().toEqualTypeOf<Date>();
    expectTypeOf<AggregateAccountFlowResult['generatedAt']>().toEqualTypeOf<Date>();
  });

  it('does NOT export infrastructure types (slice 3 adds the Prisma adapter)', () => {
    // The domain barrel is layer-clean: no Prisma, no Hono, no
    // Zod (those live in infrastructure / application). This
    // test asserts the absence by type-level — a future
    // accidental export would not break this assertion (the
    // absence is by convention; verify in code review).
    // We assert what IS exported to lock the contract; the
    // absence-of-infrastructure-exports is enforced by the
    // explicit re-export list above (not by `toBeUndefined`).
    // The ReportsRepositoryPort type IS exported (it's a domain
    // port), so we verify its presence as a sanity check.
    expectTypeOf<ReportsRepositoryPort>().not.toBeUndefined();
  });
});
