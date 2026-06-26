/**
 * Domain barrel: `src/modules/reports/domain/`.
 *
 * Re-exports the public surface of the reports domain. Slice 2
 * (the application layer) and `src/modules/reports/index.ts`
 * (the public surface, slice 3) import from here. The
 * application barrel is the public surface; this is the
 * domain-layer convenience.
 *
 * Exported:
 * - The three aggregate factories + their types
 *   (`createMonthlySummary` + `MonthlySummary` + `MonthlyTotals`;
 *    `createCategoryBreakdown` + `CategoryBreakdown` +
 *    `CategoryBucket`; `createAccountFlow` + `AccountFlow` +
 *    `AccountFlowDay`).
 * - The two ports (`ReportsRepositoryPort`,
 *   `ReportSubscriberPort`, `Unsubscribe`).
 * - The supporting types for the repository port
 *   (`ListForMonthlyOptions`, `ListForBreakdownOptions`,
 *   `ListForFlowOptions`).
 * - The five error classes (`ReportsDomainError`,
 *   `InvalidMonthError`, `InvalidAccountIdError`,
 *   `InvalidDateRangeError`, `AccountNotFoundError`).
 * - The `Month` value object (`parseMonth` + `MonthFields`).
 * - The aggregator service (`aggregateMonthly`,
 *   `aggregateCategoryBreakdown`, `aggregateAccountFlow`,
 *   `normalizeCategory`).
 *
 * NOT exported: the test fixtures, the internal port
 * helpers. The infrastructure layer (slice 3) lives outside
 * this barrel.
 */

// === Aggregate factories + types ===
export {
  createMonthlySummary,
  type MonthlySummary,
  type MonthlyTotals,
  type CreateMonthlySummaryInput,
} from './aggregates/monthly-summary';
export {
  createCategoryBreakdown,
  type CategoryBreakdown,
  type CategoryBucket,
  type CreateCategoryBreakdownInput,
} from './aggregates/category-breakdown';
export {
  createAccountFlow,
  type AccountFlow,
  type AccountFlowDay,
  type CreateAccountFlowInput,
} from './aggregates/account-flow';

// === Repository port ===
export {
  type ReportsRepositoryPort,
  type ListForMonthlyOptions,
  type ListForBreakdownOptions,
  type ListForFlowOptions,
} from './ports/reports-repository.port';

// === Subscriber port ===
export { type ReportSubscriberPort, type Unsubscribe } from './ports/report-subscriber.port';

// === Domain errors ===
export { ReportsDomainError } from './errors/reports-domain-error';
export { InvalidMonthError } from './errors/invalid-month-error';
export { InvalidAccountIdError } from './errors/invalid-account-id-error';
export { InvalidDateRangeError } from './errors/invalid-date-range-error';
export { AccountNotFoundError } from './errors/account-not-found-error';

// === Month value object ===
export { parseMonth, type MonthFields } from './value-objects/month';

// === Pure aggregator service ===
export {
  aggregateMonthly,
  aggregateCategoryBreakdown,
  aggregateAccountFlow,
  normalizeCategory,
  type AggregateMonthlyResult,
  type AggregateCategoryBreakdownResult,
  type AggregateAccountFlowResult,
} from './services/aggregate-transactions';
