/**
 * `ReportsRepositoryPrisma` — Prisma adapter for the
 * `ReportsRepositoryPort` (read-only aggregate source).
 *
 * Slice 3 deliverable (T-RPT-207). The adapter wraps the
 * kernel's `TransactionRepositoryPort.list` (the read-only
 * surface of the canonical transactions port) and filters
 * the bounded UTC window in memory — mirroring the
 * `InMemoryReportsRepository` fixture pattern.
 *
 * Why reuse `TransactionRepositoryPort.list` instead of a
 * fresh Prisma query per design §6.1:
 *  1. The kernel port's `list(userId, { accountId, limit })`
 *     implements the `userId` first-argument invariant
 *     (BR-TX-4), the `transactionDate DESC` ordering, and
 *     the `accountId` filter path.
 *  2. The reports aggregates consume the `TransactionDTO`
 *     shape (9-field structural subset); the adapter maps
 *     the canonical `Transaction` rows to that subset at
 *     the boundary.
 *  3. Re-using the port avoids a second round-trip to the
 *     `Transaction` table.
 *
 * Window construction (per design §6.1):
 *  - `findByUserAndMonth` and
 *    `findByUserAndMonthForBreakdown`: widens
 *    `[year, month]` to `[year-month-01 00:00:00.000Z,
 *    year-(month+1)-01 00:00:00.000Z)` via
 *    `Date.UTC(year, month - 1, 1)` /
 *    `Date.UTC(year, month, 1)`. The upper bound is
 *    exclusive; the in-memory filter is INCLUSIVE on both
 *    ends because the kernel store never holds a row at
 *    the next-month exact timestamp.
 *  - `findByUserAccountAndRange`: passes the action-layer
 *    `fromDate` / `toDate` through.
 *
 * Why the kernel port (not the canonical port): the
 * reports domain does NOT need `create` / `update` /
 * `delete` — only the read surface. The narrower kernel
 * port keeps the dependency arrow strictly
 * `reports → kernel` (no back-edge into transactions).
 * The Prisma adapter that satisfies the canonical port
 * (full CRUD) is structurally assignable to the kernel
 * port because the read-only method set is a subset.
 *
 * Deviation from design §6.1: the design specifies
 * `list(userId, { fromDate, toDate, accountId? })`. The
 * kernel port implemented in slice 1 exposes
 * `list(userId, { accountId, limit })` only — date
 * filtering is therefore done in memory, mirroring the
 * in-memory fixture. Flagged for follow-up in the apply
 * handoff (no behaviour change for v1).
 */

import type { TransactionDTO } from '@/shared/domain-kernel';
import type {
  ListForBreakdownOptions,
  ListForFlowOptions,
  ListForMonthlyOptions,
  ReportsRepositoryPort,
} from '../../domain/ports/reports-repository.port';

// Cap the list query large enough for any realistic monthly
// slice. The reports aggregates are bounded by the UTC month
// window, so 10 000 rows per month is well above the v1 row
// scale (low hundreds per user per month per design §12.4).
const LARGE_LIMIT = 10_000;

/**
 * The structural minimum this adapter consumes from the
 * underlying transaction store. Matches the kernel's
 * `TransactionRepositoryPort.list` signature exactly.
 */
type KernelTxRepo = {
  list: (
    userId: string,
    opts: { limit: number; accountId?: string },
  ) => Promise<{ data: readonly TransactionDTO[]; nextCursor: string | null }>;
};

/**
 * Inclusive UTC date filter on `transactionDate`. The
 * fixture's `inRange` semantics match: rows whose
 * `transactionDate` falls in `[fromDate, toDate]` are
 * returned. Both bounds are inclusive (the kernel store
 * never holds a row at the next-month-01 exact timestamp).
 */
function inRange(row: TransactionDTO, fromDate: Date, toDate: Date): boolean {
  const t = row.transactionDate.getTime();
  return t >= fromDate.getTime() && t <= toDate.getTime();
}

export class ReportsRepositoryPrisma implements ReportsRepositoryPort {
  constructor(private readonly deps: { transactionRepository: KernelTxRepo }) {}

  async findByUserAndMonth(
    userId: string,
    opts: ListForMonthlyOptions,
  ): Promise<readonly TransactionDTO[]> {
    const fromDate = new Date(Date.UTC(opts.year, opts.month - 1, 1, 0, 0, 0, 0));
    const toDate = new Date(Date.UTC(opts.year, opts.month, 1, 0, 0, 0, 0));
    return this.fetchInWindow(userId, undefined, fromDate, toDate);
  }

  async findByUserAndMonthForBreakdown(
    userId: string,
    opts: ListForBreakdownOptions,
  ): Promise<readonly TransactionDTO[]> {
    // Same code path as the monthly method; separate
    // method exposes the action layer's intent at the
    // type level (screaming architecture).
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
    const page = await this.deps.transactionRepository.list(userId, {
      limit: LARGE_LIMIT,
      ...(accountId !== undefined ? { accountId } : {}),
    });
    return page.data.filter((row) => inRange(row, fromDate, toDate));
  }
}
