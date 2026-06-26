/**
 * In-memory test fixture: `InMemoryReportsRepository`.
 *
 * Slice 2 deliverable — implements `ReportsRepositoryPort` for
 * the action tests. The fixture is **injection-based**: the
 * constructor takes a `TransactionListFn` callback (the
 * `list(userId, opts)` shape the kernel's
 * `TransactionRepositoryPort` declares). The action tests
 * wire `txRepo.list.bind(txRepo)` from the transactions
 * module's in-memory fixture; the fixture itself stays
 * decoupled from the transactions module's class graph
 * (root AGENTS.md §10.5 "Modules isolated").
 *
 * Why injection and not a direct class dependency: the rule
 * `A module does NOT import directly from another module` is
 * absolute and admits no exceptions. The injection seam
 * preserves the rule (the reports test file owns the wiring)
 * while still letting the tests use the canonical
 * `InMemoryTransactionRepository` for state seeding.
 *
 * The fixture NEVER touches the database. The fixture is
 * test-only; it is NOT exported from the public barrel
 * (design §2.3). Production uses the Prisma adapter (slice 3).
 *
 * Cross-cutting invariants:
 * - BR-TX-4: every method takes `userId` first; cross-user
 *   access returns `[]` (the cross-module invariant at the
 *   port boundary — the underlying list function enforces it).
 * - The fixture widens the UTC month to a `[fromDate,
 *   toDate)` window and applies the inclusive date filter
 *   in-memory (the future Prisma adapter will use the same
 *   UTC windows against the database).
 * - The `TransactionDTO` rows the port returns are projected
 *   from the underlying row shape via `toDto` (the kernel's
 *   9-field structural subset; fields the reports domain
 *   does not read are dropped).
 */

import type {
  ListForBreakdownOptions,
  ListForFlowOptions,
  ListForMonthlyOptions,
  ReportsRepositoryPort,
} from '../../domain/ports/reports-repository.port';
import type {
  ListTransactionsOptions,
  ListTransactionsPage,
  TransactionDTO,
} from '@/shared/domain-kernel';

// Cap the list query large enough for any realistic monthly
// slice; the reports aggregates are bounded by the UTC month
// window, so 10 000 rows per month is well above the v1 row
// scale (low hundreds per user per month per design §12.4).
const LARGE_LIMIT = 10_000;

/**
 * The structural minimum the fixture consumes from the
 * underlying transaction store. Matches the kernel's
 * `TransactionRepositoryPort.list` signature so the test
 * wiring `txRepo.list.bind(txRepo)` is a 1:1 substitution.
 */
export type TransactionListFn = (
  userId: string,
  opts: ListTransactionsOptions,
) => Promise<ListTransactionsPage>;

/**
 * Inclusive UTC date filter on `transactionDate`. The fixture
 * matches the kernel's `list(...)` semantics: rows whose
 * `transactionDate` falls in `[fromDate, toDate]` are
 * returned. Both bounds are inclusive (the in-memory fixture
 * does not paginate).
 */
function inRange(row: TransactionDTO, fromDate: Date, toDate: Date): boolean {
  const t = row.transactionDate.getTime();
  return t >= fromDate.getTime() && t <= toDate.getTime();
}

export class InMemoryReportsRepository implements ReportsRepositoryPort {
  constructor(private readonly listTransactions: TransactionListFn) {}

  async findByUserAndMonth(
    userId: string,
    opts: ListForMonthlyOptions,
  ): Promise<readonly TransactionDTO[]> {
    // UTC window: lower bound `year-month-01 00:00:00.000Z`,
    // exclusive upper bound `year-(month+1)-01 00:00:00.000Z`
    // (the SQL `toDate < nextMonth` clamp the Prisma adapter
    // uses; design §6.1). Date.UTC rolls over month=12 to
    // January of the next year automatically.
    //
    // The fixture's `inRange` filter is INCLUSIVE on both
    // ends because the in-memory store never holds a row at
    // the next-month-01 exact timestamp (the `createdAt` /
    // `updatedAt` round-trip would otherwise leak a boundary
    // row). For the kernel's bounded-window reads, the two
    // semantics agree.
    const fromDate = new Date(Date.UTC(opts.year, opts.month - 1, 1, 0, 0, 0, 0));
    const toDate = new Date(Date.UTC(opts.year, opts.month, 1, 0, 0, 0, 0));
    return this.fetchInWindow(userId, undefined, fromDate, toDate);
  }

  async findByUserAndMonthForBreakdown(
    userId: string,
    opts: ListForBreakdownOptions,
  ): Promise<readonly TransactionDTO[]> {
    // Same code path as the monthly method; separate method
    // exposes the action layer's intent at the type level
    // (screaming architecture).
    return this.findByUserAndMonth(userId, opts);
  }

  async findByUserAccountAndRange(
    userId: string,
    opts: ListForFlowOptions,
  ): Promise<readonly TransactionDTO[]> {
    return this.fetchInWindow(userId, opts.accountId, opts.fromDate, opts.toDate);
  }

  private async fetchInWindow(
    userId: string,
    accountId: string | undefined,
    fromDate: Date,
    toDate: Date,
  ): Promise<readonly TransactionDTO[]> {
    const page = await this.listTransactions(userId, {
      limit: LARGE_LIMIT,
      ...(accountId !== undefined ? { accountId } : {}),
    });
    return page.data.filter((row) => inRange(row, fromDate, toDate));
  }
}
