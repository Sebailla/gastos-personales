/**
 * Public barrel: `src/modules/reports/`.
 *
 * Slice 3 deliverable (T-RPT-210). The composition root
 * imports `ReportsActionDeps` and the `mountReportsRoutes`
 * factory from this barrel; the Server-Component helpers
 * (slice 4) will import the DTO types from here.
 *
 * Exported:
 * - `mountReportsRoutes` — the Hono factory the
 *   composition root calls from `createHonoApp`.
 * - `MountReportsRoutesDeps` — the factory's deps shape.
 * - `ReportsActionDeps` — the action-layer deps bag the
 *   composition root builds.
 * - `ReportSubscriberPort` — the seam the future
 *   materializer consumes.
 * - The aggregate value types (`MonthlySummary`,
 *   `CategoryBreakdown`, `AccountFlow`) and the wire DTO
 *   types (`MonthlySummaryDTO`, `CategoryBreakdownDTO`,
 *   `AccountFlowDTO`).
 *
 * NOT exported:
 * - `ReportsRepositoryPrisma` (the Prisma adapter is an
 *   infrastructure concern; the composition root imports
 *   it from the deep path because that IS where
 *   cross-module wiring is allowed).
 * - `InMemoryReportsRepository` (test-only fixture).
 * - `createNoopHandler` (infrastructure subscriber; the
 *   composition root imports it from the deep path).
 */

export { mountReportsRoutes, type MountReportsRoutesDeps } from './application/routes';
export type { ReportsActionDeps } from './application/actions/_shared';

export type { ReportSubscriberPort, Unsubscribe } from './domain/ports/report-subscriber.port';

export type { MonthlySummary, MonthlyTotals } from './domain/aggregates/monthly-summary';
export type { CategoryBreakdown, CategoryBucket } from './domain/aggregates/category-breakdown';
export type { AccountFlow, AccountFlowDay } from './domain/aggregates/account-flow';

export type { MonthlySummaryDTO, MonthlyTotalsDTO } from './application/dto/monthly-summary.dto';
export type {
  CategoryBreakdownDTO,
  CategoryBucketDTO,
} from './application/dto/category-breakdown.dto';
export type { AccountFlowDTO, AccountFlowDayDTO } from './application/dto/account-flow.dto';
