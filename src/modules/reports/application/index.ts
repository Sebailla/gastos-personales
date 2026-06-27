/**
 * Application barrel: `src/modules/reports/application/`.
 *
 * Slice 2 deliverable — public surface of the reports
 * application layer. Slice 3 (`reports-routes`) imports the
 * mount factory from here; `src/modules/reports/index.ts`
 * (the canonical public surface, slice 3) re-exports the
 * factory and the action-layer deps types.
 *
 * Exported:
 * - The three action functions (`getMonthlySummaryAction`,
 *   `getCategoryBreakdownAction`, `getAccountFlowAction`).
 * - The three DTO types (`MonthlySummaryDTO`,
 *   `CategoryBreakdownDTO`, `AccountFlowDTO`).
 * - `ReportsActionDeps` — the action-layer deps bag.
 * - `MountReportsRoutesDeps` — the route factory's deps shape.
 * - `mountReportsRoutes` — the route factory (NOT mounted in
 *   slice 2; slice 3 calls it from `createHonoApp`).
 *
 * NOT exported:
 * - The Zod query schemas (consumers validate at their own
 *   boundary; design §2.3).
 * - The DTO mappers (internal helpers; consumers read the
 *   resulting `*DTO` type from the wire).
 * - The `InMemoryReportsRepository` fixture (test-only; design
 *   §2.3).
 * - The `_shared.ts` envelope helpers (`ActionResult`,
 *   `zodErrorToActionError`, etc.) — internal to the action
 *   layer; consumers depend on the wire-shape DTOs only.
 */

export { getMonthlySummaryAction } from './actions/get-monthly-summary.action';
export { getCategoryBreakdownAction } from './actions/get-category-breakdown.action';
export { getAccountFlowAction } from './actions/get-account-flow.action';

export type {
  MonthlySummaryDTO,
  MonthlyTotalsDTO,
} from './dto/monthly-summary.dto';
export type {
  CategoryBreakdownDTO,
  CategoryBucketDTO,
} from './dto/category-breakdown.dto';
export type {
  AccountFlowDTO,
  AccountFlowDayDTO,
} from './dto/account-flow.dto';

export type {
  ReportsActionDeps,
} from './actions/_shared';

export {
  mountReportsRoutes,
  type MountReportsRoutesDeps,
} from './routes';
