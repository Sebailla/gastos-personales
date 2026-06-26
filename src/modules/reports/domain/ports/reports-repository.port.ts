/**
 * Domain port: `ReportsRepositoryPort`.
 *
 * Read-only data source for the reports aggregates. Three methods,
 * all `userId`-first (BR-TX-4 cross-module invariant — every
 * cross-module reference to a `Transaction` row MUST scope to
 * `userId`; there is no `findById(id)` API that could leak
 * cross-user rows).
 *
 * The three methods are deliberately narrow — each returns the
 * slice of data the corresponding aggregator needs. The data
 * source behind the port is the existing
 * `TransactionRepositoryPort.list` (from
 * `@/shared/domain-kernel`) plus, for the flow method, an
 * `accountId` filter. The composition root's
 * `ReportsRepositoryPrisma` (slice 3) delegates to the kernel's
 * `TransactionRepositoryPort.list(userId, { fromDate, toDate,
 * accountId? })` inside the bounded UTC window the action layer
 * constructs (e.g. one calendar month for monthly + breakdown;
 * a 1..366-day range for the flow).
 *
 * Why three methods and not one `list(userId, opts)` union? The
 * interface is typed at the use-site so the action layer cannot
 * accidentally pass monthly options to the flow aggregator (the
 * shapes don't overlap). A single overloaded method would force
 * a union type at the call-site; the three-method shape is the
 * screaming-architecture fit (each method's name is the action's
 * intent).
 *
 * Return shape: every method returns
 * `Promise<readonly TransactionDTO[]>` where `TransactionDTO` is
 * the kernel's structural subset of the canonical `Transaction`
 * (9 of 15 value fields — see
 * `src/shared/domain-kernel/ports/transaction-repository.port.ts`
 * for the mapping table). The aggregator consumes the DTO; the
 * Prisma adapter (slice 3) maps the canonical row to the DTO at
 * the boundary.
 */

import type { AccountCurrency, TransactionDTO } from '@/shared/domain-kernel';

/**
 * Options for `findByUserAndMonth`. The port widens the year/month
 * to a UTC date window internally; the action layer passes the
 * nominal month (REQ-RPT-1: the UTC calendar month of
 * `transactionDate`).
 */
export interface ListForMonthlyOptions {
  readonly year: number;
  readonly month: number;
}

/**
 * Options for `findByUserAndMonthForBreakdown`. Same shape as the
 * monthly options (REQ-RPT-2: the breakdown is month-keyed).
 * A separate type preserves the screaming-architecture fit: the
 * action layer's intent is explicit at the type level, and a
 * future addition (e.g. `?limit=100`) attaches here without
 * bleeding into the monthly endpoint.
 */
export interface ListForBreakdownOptions {
  readonly year: number;
  readonly month: number;
}

/**
 * Options for `findByUserAccountAndRange`. The action layer
 * passes an inclusive `fromDate`/`toDate` UTC pair (REQ-RPT-3).
 * The 366-day upper bound (BR-RPT-3) is enforced at the action
 * layer before the port is called; the port trusts its caller.
 */
export interface ListForFlowOptions {
  readonly accountId: string;
  readonly fromDate: Date;
  readonly toDate: Date;
}

/**
 * The port itself. Three read-only methods, all `userId`-first.
 * Compile-time contract: `src/modules/reports/domain/ports/reports-repository.port.test.ts`
 * (T-RPT-002) locks the shape.
 */
export interface ReportsRepositoryPort {
  /**
   * Return the caller's `TransactionDTO[]` for the UTC calendar
   * month `[year-month-01, year-(month+1)-01)`. The port widens
   * the month to a date range internally and delegates to
   * `TransactionRepositoryPort.list`. Used by
   * `getMonthlySummaryAction`.
   */
  findByUserAndMonth(
    userId: string,
    opts: ListForMonthlyOptions,
  ): Promise<readonly TransactionDTO[]>;

  /**
   * Return the caller's `TransactionDTO[]` for the same UTC
   * calendar month as `findByUserAndMonth`. The port reuses the
   * same code path internally — both calls go through the
   * transactions `list(userId, { fromDate, toDate })` query. A
   * separate method exposes the action layer's intent at the
   * type level (screaming architecture). Used by
   * `getCategoryBreakdownAction`.
   */
  findByUserAndMonthForBreakdown(
    userId: string,
    opts: ListForBreakdownOptions,
  ): Promise<readonly TransactionDTO[]>;

  /**
   * Return the caller's `TransactionDTO[]` on `accountId` in the
   * inclusive date range. Cross-user reads return `[]` (the
   * cross-module invariant at the port boundary; the action
   * layer cross-checks via `AccountRepositoryPort.findById` to
   * produce `404 NOT_FOUND` when the account is owned by
   * another user — BR-RPT-4). Used by `getAccountFlowAction`.
   */
  findByUserAccountAndRange(
    userId: string,
    opts: ListForFlowOptions,
  ): Promise<readonly TransactionDTO[]>;
}

// Re-export `AccountCurrency` so the reports module imports the
// account enums through this port (screaming architecture — the
// reports domain's currency type travels with the port it
// aggregates by). The kernel barrel also re-exports
// `AccountCurrency`; downstream code imports the symbol from
// either entry-point.
export type { AccountCurrency };
