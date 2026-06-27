# Design — `reports`

**Status**: implemented · **Author**: Sebastián Illa · **Created**: 2026-06-26
**Change**: `reports`
**Proposal**: `openspec/changes/reports/proposal.md` (v1, 2026-06-26)
**Spec (delta)**: `openspec/changes/reports/specs/reports/spec.md` (REQ-RPT-1 to REQ-RPT-7)
**Spec (canonical)**: `openspec/specs/reports/spec.md` (lands on `sdd-archive`)
**Capabilities affected**: `reports` (new; canonical spec lands at `openspec/specs/reports/spec.md` on sync), `transactions` (one cross-link delta — `TransactionRecorded` now has at least one subscriber), `accounts` (no behavior change; `AccountRepositoryPort.findById` consumed by the flow endpoint for cross-user guard), `errors` (no new codes — reuses `VALIDATION_ERROR` and `NOT_FOUND`), `events` (no new union member — `TransactionRecorded` already exists per REQ-TX-13)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (inherited from `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4
**Preflight**: interactive · `both` (Engram + OpenSpec files) · `force-chained` · 400-line review budget
**Strict TDD**: enabled per `openspec/config.yaml`; runner `pnpm test`; cycle RED → GREEN → TRIANGULATE → REFACTOR

> This document does NOT re-debate the proposal or the spec. It
> implements the spec's "what" with the "how" — module structure,
> domain aggregate invariants, port and DTO shapes, Zod schemas,
> action layer, Hono routes, error mapping, composition-root wiring,
> smoke UI, per-slice TDD markers, and the three orchestrator
> corrections that the spec phase did not codify explicitly:
> (1) `cuid` regex (not UUID v4) for `accountId` validation,
> (2) carried-over BRs by reference (matches the repo convention),
> (3) the 366-day range upper bound on `GET
/api/reports/accounts/:accountId/flow` (one calendar year +
> leap-day buffer).

---

## 1. Summary

`reports` is the **aggregation surface** of `gastos-personales`. It
is the first module that consumes `Transaction` rows from the
`transactions` capability without writing to them. The change ships
the three read aggregates (`MonthlySummary`, `CategoryBreakdown`,
`AccountFlow`) as a thin, hexagonal module at `src/modules/reports/`
that depends on:

- `TransactionRepositoryPort` (read-only) from the transactions
  module via the **shared domain kernel** at
  `src/shared/domain-kernel/ports/` (so the dependency arrow is
  `reports → shared-kernel`, not `reports → transactions`).
- `AccountRepositoryPort` (read-only) for the flow endpoint's
  cross-user guard (REQ-RPT-4).
- The central `EventDispatcher` for the no-op `TransactionRecorded`
  subscription at composition time (REQ-RPT-7, BR-RPT-5).

`reports` does NOT import from `@/modules/transactions/` or
`@/modules/accounts/` at the deep path. The ports live in the kernel
precisely so the domain layer can consume them without violating
root `AGENTS.md` §10.5 (modules isolated). The composition root
(`src/composition/build-app-deps.ts`) is the only file that imports
the deep `Prisma` adapters and wires them into the `reports`
actions.

Three design decisions bind the implementation:

- **Lazy compute-on-read** with a `Clock.now()` `generatedAt`
  stamp on every aggregate (no `new Date()` in domain code).
- **cuid regex** for `accountId` validation (`/^c[a-z0-9]{20,32}$/`),
  correcting the spec's "UUID v4" wording — the project uses cuid
  for `FinancialAccount.id` per
  `openspec/specs/transactions/spec.md:184` and the Prisma
  `Transaction` model at `src/modules/transactions/domain/entities/transaction.ts`
  uses `@default(cuid())` (verified at
  `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.ts`).
- **No-op `TransactionRecorded` subscriber** wired exactly once at
  composition time (BR-RPT-5). The seam exists so a future
  change can swap the handler for a materializer without
  touching the dispatcher signature.

---

## 2. Module structure — `src/modules/reports/` (new)

The module mirrors the `transactions` hexagonal layout exactly:
`domain/` (entities, services, ports), `application/` (actions,
DTOs, schemas, fixtures, errors, routes), `infrastructure/`
(Prisma adapters, subscribers). The public barrel at
`src/modules/reports/index.ts` re-exports the ports and the mount
function — never the Prisma adapters or the InMemory fixtures.

### 2.1 File tree

```
src/modules/reports/
├── index.ts                                     # public barrel: mountReportsRoutes, port types, DTOs, mount deps
├── domain/
│   ├── aggregates/
│   │   ├── monthly-summary.ts                   # MonthlySummary + MonthlyTotals + factory + Zod input schema + invariants
│   │   ├── monthly-summary.test.ts              # unit tests: empty, mixed-currency, factory error paths
│   │   ├── category-breakdown.ts                # CategoryBreakdown + CategoryBucket + factory + normalization
│   │   ├── category-breakdown.test.ts           # unit tests: lowercase + trim, null/empty, sort order, tie-break
│   │   ├── account-flow.ts                      # AccountFlow + AccountFlowDay + factory + sparse-day omission
│   │   └── account-flow.test.ts                 # unit tests: contiguous, sparse days, range bounds
│   ├── services/
│   │   ├── aggregate-transactions.ts            # pure aggregator functions consumed by actions; zero I/O
│   │   └── aggregate-transactions.test.ts       # unit tests: cross-user row isolation in the aggregator output
│   ├── ports/
│   │   ├── reports-repository.port.ts           # ReportsRepositoryPort: read-only data source for aggregates
│   │   ├── reports-repository.port.test.ts      # compile-time contract test: userId-first on every method
│   │   ├── report-subscriber.port.ts            # ReportSubscriberPort: declares the seam for the no-op handler
│   │   └── report-subscriber.port.test.ts       # compile-time contract test
│   ├── errors/
│   │   ├── reports-domain-error.ts              # ReportsDomainError base class (mirrors transaction-domain-errors)
│   │   ├── invalid-month-error.ts               # thrown by actions when month regex fails (defense in depth)
│   │   ├── invalid-account-id-error.ts          # thrown when accountId fails the cuid regex
│   │   ├── invalid-date-range-error.ts          # thrown when toDate - fromDate > 366 or fromDate > toDate
│   │   └── account-not-found-error.ts           # thrown when the flow action's accountId does not belong to userId
│   ├── value-objects/
│   │   └── month.ts                             # Month value object (regex /^\d{4}-\d{2}$/, derives from/to UTC bounds)
│   └── index.ts                                 # domain barrel: aggregates + services + ports + errors
├── application/
│   ├── actions/
│   │   ├── _shared.ts                           # ReportsActionDeps, ActionResult, zodErrorToActionError,
│   │   │                                         #   domainErrorToActionError (local copy — modules-isolated rule)
│   │   ├── get-monthly-summary.action.ts        # validates { month }, calls port, aggregates, returns DTO
│   │   ├── get-monthly-summary.action.test.ts   # action tests
│   │   ├── get-category-breakdown.action.ts     # validates { month }, calls port, aggregates, returns DTO
│   │   ├── get-category-breakdown.action.test.ts
│   │   ├── get-account-flow.action.ts           # validates { accountId, month } OR { accountId, fromDate, toDate }
│   │   └── get-account-flow.action.test.ts
│   ├── schemas/
│   │   ├── monthly-summary-query.schema.ts      # Zod: month (regex), month bounds check
│   │   ├── monthly-summary-query.schema.test.ts
│   │   ├── category-breakdown-query.schema.ts   # Zod: same shape as monthly-summary-query
│   │   ├── category-breakdown-query.schema.test.ts
│   │   ├── account-flow-query.schema.ts         # Zod: accountId (cuid regex), month OR fromDate+toDate, range bound
│   │   └── account-flow-query.schema.test.ts
│   ├── dto/
│   │   ├── monthly-summary.dto.ts               # MonthlySummaryDTO + toMonthlySummaryDto (ISO-8601 generatedAt)
│   │   ├── monthly-summary.dto.test.ts
│   │   ├── category-breakdown.dto.ts            # CategoryBreakdownDTO + CategoryBucketDTO + toCategoryBreakdownDto
│   │   ├── category-breakdown.dto.test.ts
│   │   ├── account-flow.dto.ts                  # AccountFlowDTO + AccountFlowDayDTO + toAccountFlowDto
│   │   └── account-flow.dto.test.ts
│   ├── fixtures/
│   │   ├── reports-repository.inmemory.ts       # InMemoryReportsRepository — implements ReportsRepositoryPort
│   │   └── reports-repository.inmemory.test.ts
│   ├── routes.ts                                # mountReportsRoutes(protectedApp, deps) — three routes
│   └── routes.test.ts                           # Hono integration: 200/400/401/404 against in-memory deps
└── infrastructure/
    ├── repositories/
    │   ├── reports.repository.prisma.ts         # Prisma adapter; consumes TransactionRepositoryPort.list() and
    │   │                                         #   AccountRepositoryPort.findById() via composition-root injection
    │   └── reports.repository.prisma.test.ts    # integration test against testcontainers Postgres (mirrors transactions pattern)
    └── subscribers/
        ├── noop-transaction-recorded.subscriber.ts  # noopHandler: debug-log and return (REQ-RPT-7)
        └── noop-transaction-recorded.subscriber.test.ts  # asserts handler is well-typed for TransactionRecordedPayload
```

The proposed tree differs from the spec's proposal in two intentional
ways (the orchestrator cache baked these in):

1. The orchestrator spec calls for `domain/index.test.ts` and
   `application/actions/*.test.ts` co-located with the source. The
   project's transactions convention keeps tests co-located too
   (e.g. `monthly-summary.test.ts` next to `monthly-summary.ts`).
   This design follows the co-located pattern.
2. The orchestrator spec calls for `application/routes.test.ts`
   inside `application/`. Transactions does the same: routes live
   at `application/routes.ts` and the Hono integration tests for
   transactions mount at the action level (per the existing
   `routes.ts` precedent). Reports follows the same shape.

### 2.2 Cross-module dependency direction

```
            src/modules/reports/  (new)
            ├─ domain/aggregates/*.ts
            │       depends on ─→ Clock (shared/clock)
            │                       AccountCurrency (shared/domain-kernel)
            ├─ domain/services/aggregate-transactions.ts
            │       pure aggregator: TransactionDTO[] → Aggregate
            │       zero I/O; no imports from other modules
            ├─ domain/ports/reports-repository.port.ts
            │       imports ─→ TransactionDTO, AccountCurrency (shared/domain-kernel)
            │       does NOT import from @/modules/transactions or @/modules/accounts directly
            ├─ domain/ports/report-subscriber.port.ts
            │       imports ─→ TransactionRecordedPayload (shared/events/event-dispatcher)
            ├─ application/actions/*-*.action.ts
            │       depends on ─→ ReportsRepositoryPort (this module's domain)
            │                       Clock (shared/clock)
            ├─ application/schemas/*-query.schema.ts
            │       imports ─→ AccountCurrency (shared/domain-kernel)
            │                   zod (vendored)
            ├─ application/dto/*.dto.ts
            │       imports ─→ Aggregate types (this module's domain)
            ├─ application/fixtures/reports-repository.inmemory.ts
            │       implements ─→ ReportsRepositoryPort (this module's domain)
            │       uses (test-only) InMemoryTransactionRepository from transactions/application
            ├─ application/routes.ts
            │       mounts the 3 Hono routes on protectedApp
            ├─ infrastructure/repositories/reports.repository.prisma.ts
            │       implements ─→ ReportsRepositoryPort (this module's domain)
            │       depends on ─→ TransactionRepositoryPort (shared/domain-kernel, structural port)
            │                       AccountRepositoryPort (shared/domain-kernel, structural port)
            │                       Prisma client (shared/db)
            └─ index.ts                    (public surface — see §2.3)

src/shared/domain-kernel/ports/transaction-repository-port.ts (NOT YET PRESENT — added in §2.2.1 below)
src/shared/domain-kernel/ports/account-repository.port.ts    ←── reports reads via the kernel (structural ports)
```

#### 2.2.1 Kernel port addition

The shared kernel at `src/shared/domain-kernel/ports/` already
re-declares `AccountRepositoryPort` and `FxRateProvider` from the
accounts module. Per the precedent at
`src/shared/domain-kernel/ports/account-repository.port.ts`, the
kernel exposes the **structural minimum** surface (the methods the
read path actually calls). `reports` consumes the transactions
module's `TransactionRepositoryPort` for the `list(userId, { from,
to, accountId? })` call only — never `create`, `update`, or
`delete`. The kernel therefore gains a new file:

```typescript
// src/shared/domain-kernel/ports/transaction-repository-port.ts

/**
 * Kernel port: `TransactionRepositoryPort` (read-only surface
 * for the reports module).
 *
 * Mirrors the full transactions port at
 * `src/modules/transactions/domain/interfaces/transaction.repository.port.ts`
 * but exposes only the `list` method that reports needs. The
 * structural subtyping rule (a Prisma adapter satisfies the
 * canonical port and is therefore assignable to the narrower
 * kernel port) preserves type safety.
 *
 * The kernel port lives at `@/shared/domain-kernel` because it
 * is the cross-module contract surface. The canonical port in
 * `@/modules/transactions` is the writer's view (full CRUD);
 * the kernel port is the reader's view. The two are
 * structurally compatible.
 */
export type {
  ListTransactionsOptions,
  ListTransactionsPage,
} from '@/modules/transactions/domain/interfaces/transaction.repository.port';
export type { Transaction } from '@/modules/transactions/domain/entities/transaction';
```

The kernel's `index.ts` (`src/shared/domain-kernel/index.ts:1-44`)
gains two new lines:

```typescript
export type {
  TransactionRepositoryPort,
  ListTransactionsOptions,
  ListTransactionsPage,
  Transaction,
} from './ports/transaction-repository-port';
```

The kernel is NOT a module — root `AGENTS.md` §10.5 isolates
modules, not the kernel. The kernel's role is to be the
cross-module contract surface; importing the kernel from any
module is the project's existing convention.

### 2.3 Public barrel — `src/modules/reports/index.ts`

Mirrors `src/modules/transactions/application/index.ts:33-111`. The
barrel exports:

- `ReportsRepositoryPort` (port type) — the read-only data source.
- `ReportSubscriberPort` (port type) — the no-op seam.
- `MonthlySummary`, `MonthlyTotals` (domain aggregate types) —
  re-exported from `domain/aggregates/monthly-summary`.
- `CategoryBreakdown`, `CategoryBucket` (domain aggregate types) —
  re-exported from `domain/aggregates/category-breakdown`.
- `AccountFlow`, `AccountFlowDay` (domain aggregate types) —
  re-exported from `domain/aggregates/account-flow`.
- `MonthlySummaryDTO`, `CategoryBreakdownDTO`, `AccountFlowDTO`
  (DTO types) — re-exported from `application/dto`.
- `ReportsActionDeps` — the action-layer deps bag interface.
- `mountReportsRoutes` — mounts the 3 routes on the supplied
  protected sub-app.
- `MountReportsRoutesDeps` — the mount's deps shape.

The barrel does NOT export:

- `ReportsRepositoryPrisma` (infrastructure adapter).
- `InMemoryReportsRepository` (test fixture).
- `NoopTransactionRecordedSubscriber` (test-only handler; the
  production composition root constructs it inline).
- The Zod schemas (consumers validate at their own boundary).
- The DTO mappers (`toMonthlySummaryDto` etc.) — these are
  internal helpers; consumers import the resulting `*DTO` type
  from the wire, not the mapper.

---

## 3. Domain model

The `reports` capability owns three read aggregates and one
factory each. No aggregate owns a Prisma row; the data shape is
derived from `TransactionDTO` rows that the
`ReportsRepositoryPort` returns. Every aggregate carries a
`generatedAt: Date` stamped from `Clock.now()` (no `new Date()` in
domain code per `openspec/specs/transactions/spec.md` §REQ-TX-14
and the project's existing pattern at
`src/modules/transactions/domain/entities/transaction.ts`).

### 3.1 Enum: `AccountCurrency`

Re-used from the kernel. The reports module never re-declares
this; the kernel is the cross-module enum source.

### 3.2 Aggregate: `MonthlySummary`

```typescript
// src/modules/reports/domain/aggregates/monthly-summary.ts

export interface MonthlyTotals {
  readonly convertedCurrency: AccountCurrency;
  readonly incomeMinor: number; // sum of convertedAmountMinor where direction = INCOME (≥ 0)
  readonly expenseMinor: number; // sum of convertedAmountMinor where direction = EXPENSE (≥ 0)
  readonly netMinor: number; // incomeMinor - expenseMinor (may be negative)
  readonly count: number; // number of transactions in this bucket (≥ 0)
}

export interface MonthlySummary {
  readonly userId: string; // cuid (cross-module invariant)
  readonly year: number; // UTC calendar year, 2000..2100
  readonly month: number; // UTC calendar month, 1..12
  readonly totals: MonthlyTotals[]; // one entry per convertedCurrency
  readonly generatedAt: Date; // Clock.now() at aggregate time (ISO-8601 on the wire)
}

export interface CreateMonthlySummaryInput {
  readonly userId: string;
  readonly year: number;
  readonly month: number;
  readonly rows: readonly TransactionDTO[]; // pure input
  readonly clock: Clock; // injected; never new Date() in domain code
}

export function createMonthlySummary(input: CreateMonthlySummaryInput): MonthlySummary;
```

#### 3.2.1 Invariants enforced by the factory

- `totals[i].incomeMinor >= 0` and `totals[i].expenseMinor >= 0`
  (signed minor units; the sign lives on `netMinor`).
- `totals[i].netMinor === totals[i].incomeMinor - totals[i].expenseMinor`
  (the factory computes, never asserts; the test asserts).
- `totals[i].convertedCurrency` is one of the `AccountCurrency`
  enum members.
- `year ∈ [2000, 2100]` and `month ∈ [1, 12]`; the factory
  throws `ReportsDomainError` if the month regex /`^\d{4}-\d{2}$/`
  fails or the bounds are violated. Defense in depth: the action
  layer's Zod parse is the primary gate.
- `generatedAt === clock.now()` at the moment the factory runs.
- `rows.filter((r) => r.userId === input.userId)` is implicit —
  the port returns only the caller's rows; the factory trusts
  the port contract. Cross-user isolation is enforced at the
  port boundary (`findByUserAndMonth` takes `userId` first).
- `totals` is empty when the window has no rows
  (`totals.length === 0`, `count === 0` for the missing
  currencies). The wire response carries
  `{ totals: [], generatedAt }` and `HTTP 200`.

### 3.3 Aggregate: `CategoryBreakdown`

```typescript
// src/modules/reports/domain/aggregates/category-breakdown.ts

export interface CategoryBucket {
  readonly category: string | null; // raw string from Transaction.category, preserved verbatim
  readonly categoryNormalized: string; // lowercase + trim; null/empty → "uncategorized"
  readonly convertedCurrency: AccountCurrency; // grouping key (BR-RPT-1)
  readonly amountMinor: number; // sum of convertedAmountMinor; may be negative (refund net)
  readonly txCount: number; // > 0 (zero-count buckets dropped)
}

export interface CategoryBreakdown {
  readonly userId: string;
  readonly year: number;
  readonly month: number;
  readonly buckets: readonly CategoryBucket[]; // sorted by amountMinor DESC, categoryNormalized ASC
  readonly generatedAt: Date;
}

export interface CreateCategoryBreakdownInput {
  readonly userId: string;
  readonly year: number;
  readonly month: number;
  readonly rows: readonly TransactionDTO[];
  readonly clock: Clock;
}

export function createCategoryBreakdown(input: CreateCategoryBreakdownInput): CategoryBreakdown;
```

#### 3.3.1 Invariants

- `categoryNormalized` is computed by `normalizeCategory(category)`
  (a free function in the same file): `category?.trim().toLowerCase()
?? 'uncategorized'`; an empty string after `trim()` is also
  `'uncategorized'`.
- The factory groups by the tuple `(categoryNormalized,
convertedCurrency)` — the currency is part of the grouping key
  (BR-RPT-1, REQ-RPT-6).
- Buckets with `txCount === 0` are excluded.
- Sort is `amountMinor DESC` primary; `categoryNormalized ASC`
  secondary (deterministic tie-break).
- The `category` field is the FIRST raw string observed for the
  bucket — the spec scenario "mixed-case raw categories collapse
  to one normalized bucket" accepts any raw value. The factory
  uses the first encountered; subsequent raw strings are dropped.

### 3.4 Aggregate: `AccountFlow`

```typescript
// src/modules/reports/domain/aggregates/account-flow.ts

export interface AccountFlowDay {
  readonly date: string; // YYYY-MM-DD UTC (date-only key, no time)
  readonly netMinor: number; // net change for `date` only
  readonly runningBalanceMinor: number; // cumulative net up to and including `date`
  readonly count: number; // > 0 (sparse days omitted)
  readonly convertedCurrency: AccountCurrency; // grouping key
}

export interface AccountFlow {
  readonly userId: string;
  readonly accountId: string; // cuid (matches /ˆc[a-z0-9]{20,32}$/)
  readonly fromDate: Date; // inclusive lower bound, UTC 00:00:00Z
  readonly toDate: Date; // inclusive upper bound, UTC 23:59:59.999Z
  readonly days: readonly AccountFlowDay[]; // ordered by date ASC; sparse days omitted
  readonly generatedAt: Date;
}

export interface CreateAccountFlowInput {
  readonly userId: string;
  readonly accountId: string;
  readonly fromDate: Date;
  readonly toDate: Date;
  readonly rows: readonly TransactionDTO[]; // only rows on `accountId` in the range
  readonly clock: Clock;
}

export function createAccountFlow(input: CreateAccountFlowInput): AccountFlow;
```

#### 3.4.1 Invariants

- `accountId` matches `^c[a-z0-9]{20,32}$` (cuid regex, NOT UUID
  v4 — see §6 Orchestrator correction #1). The factory throws
  `InvalidAccountIdError` (a `ReportsDomainError` subclass) when
  the regex fails. Defense in depth: the action layer's Zod parse
  is the primary gate.
- `fromDate <= toDate` and `toDate - fromDate <= 366 days` (BR-RPT-3
  codified in the spec at `openspec/changes/reports/specs/reports/spec.md`
  §"Account flow"). 366 days = one calendar year + leap-day buffer
  (orchestrator correction #3, rationale: leap-year alignment plus
  one-day slack to absorb timezone rounding).
- `fromDate` is normalized to `00:00:00.000Z` UTC; `toDate` to
  `23:59:59.999Z` UTC. The factory strips any local-time component
  and re-anchors to UTC midnight.
- The date key is `YYYY-MM-DD` UTC; no time component (BR-RPT-3
  codifies Q4).
- Sparse days (no transactions) are omitted from `days`
  (BR-RPT-3).
- `runningBalanceMinor` is the cumulative net across `days` in
  date order: `days[0].runningBalanceMinor === days[0].netMinor`
  and `days[i].runningBalanceMinor === days[i-1].runningBalanceMinor + days[i].netMinor`.
- The factory trusts the port to have filtered by `userId`,
  `accountId`, and the date range — cross-user isolation is
  enforced at the port boundary.

### 3.5 Pure aggregation service

```typescript
// src/modules/reports/domain/services/aggregate-transactions.ts

/**
 * Aggregate the rows for a monthly summary. Pure function —
 * no I/O, no clock side effect (the `clock` parameter is read
 * inside the factory).
 *
 * The function groups by `convertedCurrency`; one row per
 * `convertedCurrency` per month. The action layer calls this
 * with the port's output.
 */
export function aggregateMonthly(
  rows: readonly TransactionDTO[],
  clock: Clock,
): { totals: MonthlyTotals[]; generatedAt: Date };

/**
 * Aggregate the rows for a category breakdown. Groups by the
 * tuple (categoryNormalized, convertedCurrency); sorts by
 * amountMinor DESC, categoryNormalized ASC.
 */
export function aggregateCategoryBreakdown(
  rows: readonly TransactionDTO[],
  clock: Clock,
): { buckets: CategoryBucket[]; generatedAt: Date };

/**
 * Aggregate the rows for an account flow. Groups by
 * (date YYYY-MM-DD UTC, convertedCurrency); sparse days
 * omitted; running balance computed in date order.
 */
export function aggregateAccountFlow(
  rows: readonly TransactionDTO[],
  clock: Clock,
): { days: AccountFlowDay[]; generatedAt: Date };
```

The service is a free-function module (not a class). The action
layer invokes the factory with the clock; the factory invokes
the service internally to derive the aggregate fields.

### 3.6 Invariants summary (cross-cutting)

- **Signed minor units**: `inflowMinor` and `outflowMinor` are
  always ≥ 0; the sign lives on `netMinor` (which is
  `inflowMinor - outflowMinor`). Refund rows (negative
  `convertedAmountMinor`) are rare but possible — they reduce
  the bucket's netMinor, not its inflow or outflow.
- **Sparse days preserved**: the `AccountFlow.days` array omits
  days with zero transactions; consumers cannot infer "no
  activity" from a missing day.
- **Categories normalized via factory**: the
  `normalizeCategory(category)` free function is the only place
  that lowercases / trims. The action layer never re-implements
  the rule.
- **`convertedCurrency` (not raw `currency`)**: every grouping
  uses `convertedCurrency` (BR-RPT-1, REQ-RPT-6, BR-ACC-12).
- **Cross-user isolation at the port boundary**: every method
  on `ReportsRepositoryPort` takes `userId` first. The factory
  does not re-filter.

---

## 4. Ports

### 4.1 `ReportsRepositoryPort`

```typescript
// src/modules/reports/domain/ports/reports-repository.port.ts

import type { TransactionDTO } from '@/shared/domain-kernel/ports/transaction-repository-port';
// TransactionDTO is the wire-aligned snapshot shape exported
// from the transactions module. Reports reads via this type
// only — never the canonical Transaction aggregate.

export interface ListForMonthlyOptions {
  readonly year: number;
  readonly month: number; // 1..12
}

export interface ListForBreakdownOptions {
  readonly year: number;
  readonly month: number;
}

export interface ListForFlowOptions {
  readonly accountId: string;
  readonly fromDate: Date;
  readonly toDate: Date;
}

export interface ReportsRepositoryPort {
  /**
   * Return the caller's transactions in the UTC month
   * `[year-month-01, year-(month+1)-01)`. The port returns
   * `TransactionDTO[]` (the wire-aligned shape from the
   * transactions module); the aggregator converts them to
   * domain rows for the factory. Optional `accountId?`
   * filter for future per-account summary (not used in v1
   * — present in the interface for forward compatibility).
   */
  findByUserAndMonth(
    userId: string,
    opts: ListForMonthlyOptions,
  ): Promise<readonly TransactionDTO[]>;

  /**
   * Same shape as monthly. The port reuses the same code path
   * internally — both calls go through the transactions
   * `list(userId, { from, to })` query. The interface exposes
   * two methods so the action layer's intent is explicit at
   * the type level.
   */
  findByUserAndMonthForBreakdown(
    userId: string,
    opts: ListForBreakdownOptions,
  ): Promise<readonly TransactionDTO[]>;

  /**
   * Return the caller's transactions on `accountId` in the
   * inclusive date range. Cross-user reads return `[]` (the
   * cross-user invariant at the port boundary; the action
   * layer cross-checks via `AccountRepositoryPort.findById`
   * to produce `404 NOT_FOUND` when the account is owned by
   * another user).
   */
  findByUserAccountAndRange(
    userId: string,
    opts: ListForFlowOptions,
  ): Promise<readonly TransactionDTO[]>;
}
```

**Justification (ports are stable; the data source is composition
root's concern).** The three methods are deliberately narrow — each
returns the slice of data the aggregator needs. The data source
behind the port is the existing `TransactionRepositoryPort.list`
plus the two existing Prisma indexes
(`@@index([userId, transactionDate])` and
`@@index([accountId, transactionDate])`) on the `Transaction`
table. The composition root's
`ReportsRepositoryPrisma.findByUserAndMonth` delegates to
`TransactionRepositoryPort.list(userId, { fromDate, toDate })`
inside a narrow UTC window (the month bounds). This is cheaper
than a fresh Prisma query because (a) the same
`[userId, transactionDate]` index covers it, (b) the action layer
needs the full row payload (not a Prisma aggregate), and (c)
reusing the port keeps the dependency arrow pointing
`reports → kernel → transactions` — never `reports →
transactions` directly.

**Why three methods and not one `list(userId, opts)`?** The
interface is typed at the use-site so the action layer cannot
accidentally pass monthly options to the flow aggregator (the
shapes don't overlap). A single overloaded method would force a
union type at the call-site; the three-method shape is the
screaming-architecture fit (each method's name is the action's
intent).

### 4.2 `ReportSubscriberPort`

```typescript
// src/modules/reports/domain/ports/report-subscriber.port.ts

import type { TransactionRecordedPayload } from '@/shared/events/event-dispatcher';

/** Opaque unsubscribe handle. Returns `void`. */
export type Unsubscribe = () => void;

export interface ReportSubscriberPort {
  /**
   * Subscribe a handler to the `TransactionRecorded` event.
   * The composition root wires a no-op handler in v1; the
   * future materializer swaps it for a real consumer without
   * an interface change.
   *
   * Returns an unsubscribe function for test teardown.
   */
  onTransactionRecorded(
    handler: (event: TransactionRecordedPayload) => void | Promise<void>,
  ): Unsubscribe;
}
```

The seam is declared so the spec can lock the contract (BR-RPT-5).
v1 ships one `noopHandler` registered at composition time; the
test asserts exactly one subscriber exists for
`TransactionRecorded` after `buildAppDeps` runs (§6.2 below).

---

## 5. Application layer — Actions

### 5.1 Local `_shared.ts`

`src/modules/reports/application/actions/_shared.ts` is a local
copy of the action-layer envelope — the same pattern as
`src/modules/transactions/application/actions/_shared.ts`. It
exports:

- `ActionResult<T> = ActionSuccess<T> | ActionFailure` —
  discriminated union (`ok: true | false`).
- `ActionFailure = { ok: false; error: AppError | ReportsDomainError }`.
- `ReportsActionDeps` — the deps bag (see §5.2 below).
- `zodErrorToActionError(err: ZodError): ActionFailure` —
  uniform 400 envelope.
- `domainErrorToActionError(err): ActionFailure` — maps
  `ReportsDomainError` codes to wire codes.

The mapping table:

| Domain code                  | Wire code          | HTTP |
| ---------------------------- | ------------------ | ---- |
| `INVALID_MONTH`              | `VALIDATION_ERROR` | 400  |
| `INVALID_ACCOUNT_ID`         | `VALIDATION_ERROR` | 400  |
| `INVALID_DATE_RANGE`         | `VALIDATION_ERROR` | 400  |
| `ACCOUNT_NOT_FOUND`          | `NOT_FOUND`        | 404  |
| `OUT_OF_RANGE` (range > 366) | `VALIDATION_ERROR` | 400  |

The reports module does NOT import
`@/modules/transactions/application/actions/_shared.ts` — per the
modules-isolated rule (root `AGENTS.md` §10.5). Local copy only.

### 5.2 `ReportsActionDeps`

```typescript
// src/modules/reports/application/actions/_shared.ts

import type { ReportsRepositoryPort } from '../../domain/ports/reports-repository.port';
import type { ReportSubscriberPort } from '../../domain/ports/report-subscriber.port';
import type { AccountRepositoryPort } from '@/shared/domain-kernel';
import type { Clock } from '@/shared/clock/clock.port';
import type { logger as LoggerSingleton } from '@/shared/logger/logger';
import type { EventDispatcher } from '@/shared/events/event-dispatcher';

export type Logger = typeof LoggerSingleton;

export interface ReportsActionDeps {
  readonly reportsRepository: ReportsRepositoryPort;
  readonly accountRepository: AccountRepositoryPort; // for the flow endpoint's cross-user guard (REQ-RPT-4)
  readonly subscriber: ReportSubscriberPort;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly dispatcher: EventDispatcher; // unused in v1 actions; held for symmetry with transactions
}
```

The `dispatcher` field is held for symmetry with the transactions
deps bag and as a forward-compatibility seat (a future
materializer would dispatch `ReportSnapshotRefreshed` events). v1
actions do not call it.

### 5.3 `getMonthlySummaryAction`

```typescript
// src/modules/reports/application/actions/get-monthly-summary.action.ts

export interface GetMonthlySummaryInput {
  readonly userId: string;
  readonly rawQuery: unknown;
}

export type GetMonthlySummaryData = MonthlySummaryDTO;

export async function getMonthlySummaryAction(
  deps: ReportsActionDeps,
  input: GetMonthlySummaryInput,
): Promise<ActionResult<GetMonthlySummaryData>>;
```

**Flow:**

1. Parse `rawQuery` with `monthlySummaryQuerySchema` (Zod, see
   §5.6). On failure → `zodErrorToActionError`.
2. Compute the UTC window: `fromDate = new Date(Date.UTC(year,
month - 1, 1))`, `toDate = new Date(Date.UTC(year, month, 1))`
   (exclusive upper bound).
3. Call `deps.reportsRepository.findByUserAndMonth(userId, {
year, month })`. The port internally widens the year/month to
   the date range and delegates to `TransactionRepositoryPort.list`.
4. Call `createMonthlySummary({ userId, year, month, rows, clock })`.
5. Map to `MonthlySummaryDTO` via `toMonthlySummaryDto`.
6. Return `{ ok: true, value: dto }`.

**Empty state:** `rows.length === 0` → `totals: []`, `generatedAt:
clock.now()`, `HTTP 200`. The route returns 200 regardless of
whether the user has accounts; the empty-totals response is the
v1 sentinel for "no accounts yet" (see §7.1).

### 5.4 `getCategoryBreakdownAction`

Same shape as `getMonthlySummaryAction`, but the aggregator groups
by `(categoryNormalized, convertedCurrency)` and sorts by
`amountMinor DESC, categoryNormalized ASC`. Empty state → 200 with
`buckets: []`. The action's `rawQuery` is the same
`monthlySummaryQuerySchema` shape (month-keyed). A separate
`categoryBreakdownQuerySchema` is provided (per §5.6) so future
additions (e.g. `?limit=100`) do not bleed into the monthly
endpoint.

### 5.5 `getAccountFlowAction`

```typescript
// src/modules/reports/application/actions/get-account-flow.action.ts

export interface GetAccountFlowInput {
  readonly userId: string;
  readonly accountId: string; // raw from the URL path; NOT yet validated
  readonly rawQuery: unknown;
}

export type GetAccountFlowData = AccountFlowDTO;

export async function getAccountFlowAction(
  deps: ReportsActionDeps,
  input: GetAccountFlowInput,
): Promise<ActionResult<GetAccountFlowData>>;
```

**Flow:**

1. Parse `rawQuery` with `accountFlowQuerySchema` (Zod, §5.6).
   The schema accepts EITHER `{ month: 'YYYY-MM' }` (derive
   `fromDate` / `toDate`) OR `{ fromDate: 'YYYY-MM-DD',
toDate: 'YYYY-MM-DD' }`. The route layer is the only caller
   that passes `accountId` separately (the URL path); the
   schema validates it under the `accountId` field with the
   **cuid regex** `/^c[a-z0-9]{20,32}$/` (orchestrator
   correction #1).
2. Compute the date window from the schema's output. If the
   range exceeds 366 days, return
   `{ ok: false, error: domainError(new InvalidDateRangeError(...)) }`.
3. Call `deps.accountRepository.findById(userId, accountId)`:
   - `null` (cross-user or unknown account) → return
     `domainErrorToActionError(new AccountNotFoundError(...))`. Wire
     code is `NOT_FOUND`, HTTP 404 (REQ-RPT-4, BR-RPT-4).
   - Account found → proceed.
4. Call `deps.reportsRepository.findByUserAccountAndRange(userId,
{ accountId, fromDate, toDate })`.
5. Call `createAccountFlow({ userId, accountId, fromDate, toDate,
rows, clock })`.
6. Map to `AccountFlowDTO` via `toAccountFlowDto`.
7. Return `{ ok: true, value: dto }`.

**Sparse-day behavior:** `rows.length === 0` in the range →
`days: []`, `HTTP 200`. The route never returns 404 for an empty
range — the cross-user 404 is the only 404 path.

### 5.6 Zod schemas

```typescript
// src/modules/reports/application/schemas/monthly-summary-query.schema.ts

import { z } from 'zod';

export const monthlySummaryQuerySchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, {
        message: 'month must match YYYY-MM',
      })
      .refine(
        (m) => {
          const month = Number.parseInt(m.slice(5, 7), 10);
          return month >= 1 && month <= 12;
        },
        { message: 'month must be 01..12' },
      ),
  })
  .strict();

export type MonthlySummaryQuery = z.infer<typeof monthlySummaryQuerySchema>;
```

```typescript
// src/modules/reports/application/schemas/category-breakdown-query.schema.ts

export const categoryBreakdownQuerySchema = monthlySummaryQuerySchema.extend({}).strict();
```

Same Zod parse contract as monthly (month-keyed). The schema is
a separate file so future `?limit=` / `?category=` filters attach
to the breakdown endpoint without bleeding into monthly.

```typescript
// src/modules/reports/application/schemas/account-flow-query.schema.ts

import { z } from 'zod';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CUID_RE = /^c[a-z0-9]{20,32}$/;

const baseAccountFlow = z
  .object({
    accountId: z.string().regex(CUID_RE, {
      message: 'accountId must be a cuid (^c[a-z0-9]{20,32}$)',
    }),
  })
  .strict();

const monthShape = baseAccountFlow
  .extend({
    month: z.string().regex(/^\d{4}-\d{2}$/),
  })
  .strict();

const rangeShape = baseAccountFlow
  .extend({
    fromDate: z.string().regex(ISO_DATE, { message: 'fromDate must be YYYY-MM-DD' }),
    toDate: z.string().regex(ISO_DATE, { message: 'toDate must be YYYY-MM-DD' }),
  })
  .strict()
  .refine((q) => q.fromDate <= q.toDate, {
    message: 'fromDate must be <= toDate',
    path: ['toDate'],
  });

export const accountFlowQuerySchema = z.union([monthShape, rangeShape]);
```

The Zod union collapses to a `month`-OR-`fromDate`+`toDate` shape.
The route layer dispatches on the parsed output's shape and
derives the date range. The schema also enforces
`fromDate <= toDate` (REF-RPT-3). The 366-day upper bound is a
service-level check (§5.5 step 2) — Zod does not have a built-in
date-math primitive, so the comparison lives in the action.

### 5.7 Error mapping

| Trigger                                            | Wire code          | HTTP |
| -------------------------------------------------- | ------------------ | ---- |
| Zod parse failure (bad month, bad accountId, etc.) | `VALIDATION_ERROR` | 400  |
| Range > 366 days or `fromDate > toDate`            | `VALIDATION_ERROR` | 400  |
| Cross-user or unknown `accountId` on flow          | `NOT_FOUND`        | 404  |
| No session                                         | `UNAUTHORIZED`     | 401  |
| Internal error (Prisma down, etc.)                 | `INTERNAL_ERROR`   | 500  |

---

## 6. Infrastructure

### 6.1 `ReportsRepositoryPrisma`

```typescript
// src/modules/reports/infrastructure/repositories/reports.repository.prisma.ts

import type { PrismaClient } from '@prisma/client';
import type { TransactionRepositoryPort } from '@/shared/domain-kernel';
import type { AccountRepositoryPort } from '@/shared/domain-kernel';
import type { ReportsRepositoryPort } from '../../domain/ports/reports-repository.port';

export class ReportsRepositoryPrisma implements ReportsRepositoryPort {
  constructor(
    private readonly deps: {
      transactionRepository: TransactionRepositoryPort;
      prismaView: PrismaDelegateView;
    },
  ) {}

  async findByUserAndMonth(userId, opts): Promise<readonly TransactionDTO[]>;
  async findByUserAndMonthForBreakdown(userId, opts): Promise<readonly TransactionDTO[]>;
  async findByUserAccountAndRange(userId, opts): Promise<readonly TransactionDTO[]>;
}
```

**Why reuse `TransactionRepositoryPort.list` instead of a fresh
Prisma query.** The port's `list(userId, { fromDate, toDate,
accountId? })` already implements:

1. The `userId` first-argument invariant (BR-TX-4).
2. The cursor-paginated `ORDER BY transactionDate DESC` with the
   composite `[userId, transactionDate]` index (REQ-TX-8).
3. The `accountId` filter path (`[accountId, transactionDate]`
   index).
4. The `TransactionDTO` mapping (the wire-aligned snapshot
   shape).

The reports aggregate needs the full row payload (not a Prisma
aggregate), so re-using the port is strictly cheaper than a
parallel Prisma query that would need its own mapping layer. The
Prisma adapter constructs a one-month window (e.g. `[2026-06-01,
2026-07-01)`) and delegates.

**Window construction.** The action layer passes `year` and
`month`; the Prisma adapter constructs:

```typescript
const fromDate = new Date(Date.UTC(opts.year, opts.month - 1, 1));
const toDate = new Date(Date.UTC(opts.year, opts.month, 1));
// Note: toDate is exclusive; the transactions list treats it
// as inclusive on the wire but exclusive at the SQL level (the
// port clamps `toDate < nextMonth` to avoid the boundary).
```

For the flow endpoint the date range comes from the URL
(`fromDate` / `toDate`) — the Prisma adapter passes them
through. The 366-day check happens at the action layer (§5.5
step 2) before the repository is called.

### 6.2 `NoopTransactionRecordedSubscriber`

```typescript
// src/modules/reports/infrastructure/subscribers/noop-transaction-recorded.subscriber.ts

import type { TransactionRecordedPayload } from '@/shared/events/event-dispatcher';
import type { Logger } from '@/shared/logger/logger';

export function createNoopHandler(logger: Logger) {
  return async (event: TransactionRecordedPayload): Promise<void> => {
    logger.debug('reports.noop.transaction-recorded', {
      userId: event.userId,
      transactionId: event.transactionId,
    });
  };
}
```

**Composition-root wiring** (§8 below): `buildAppDeps` calls
`dispatcher.subscribe('TransactionRecorded', noopHandler)`
exactly once. The seam is registered so the future materializer
replaces the handler in-place; the dispatcher signature is
unchanged.

### 6.3 Test seam — subscriber count assertion

`src/composition/build-app-deps.test.ts` (the existing tests file
for `buildAppDeps`) gains one new test:

```typescript
it('subscribes exactly one noop handler for TransactionRecorded', () => {
  // The dispatcher is process-wide; capture before/after counts
  // to avoid interfering with other test setups.
  const before = dispatcher.subscriberCount('TransactionRecorded');
  const deps = buildAppDeps();
  const after = dispatcher.subscriberCount('TransactionRecorded');
  expect(after).toBe(before + 1);
  // ...invoke the subscriber with a sample payload; assert no throw
});
```

The `EventDispatcher.subscriberCount(type)` method is the
existing test seam — the dispatcher class at
`src/shared/events/event-dispatcher.ts:55-84` exposes `subscribers`
as a private map; this test-only accessor surfaces the count via
a small adapter inside the test file (no production-code change).
If the test suite has a different convention (e.g. exporting a
`subscriberCount` method on `EventDispatcher`), the test follows
the convention.

---

## 7. API surface

The three routes mount on the existing `protectedApp` (the
sub-app at `src/composition/create-hono-app.ts:126-128` with
`requireSession` middleware). The composition seam adds one
`mountReportsRoutes(protectedApp, { reportsDeps })` call after
the transactions mount (line 165) and before
`app.route('/', protectedApp)`.

### 7.1 Route table

| Method | Path                                    | Action                       | Validator                      | Success (200)                    | Error codes                                                              |
| ------ | --------------------------------------- | ---------------------------- | ------------------------------ | -------------------------------- | ------------------------------------------------------------------------ |
| `GET`  | `/api/reports/monthly`                  | `getMonthlySummaryAction`    | `monthlySummaryQuerySchema`    | `{ data: MonthlySummaryDTO }`    | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`                               |
| `GET`  | `/api/reports/breakdown`                | `getCategoryBreakdownAction` | `categoryBreakdownQuerySchema` | `{ data: CategoryBreakdownDTO }` | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`                               |
| `GET`  | `/api/reports/accounts/:accountId/flow` | `getAccountFlowAction`       | `accountFlowQuerySchema`       | `{ data: AccountFlowDTO }`       | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `404 NOT_FOUND` (cross-user) |

**Sentinel for "user has no accounts"** (orchestrator decision,
documented in the proposal §"Open questions" Q5 follow-up):
`GET /api/reports/monthly` returns `200` with `totals: []` for a
user with zero accounts. The dashboard (§9 below) interprets this
as "no data yet" and renders the empty-state CTA. **No** `404`
for zero-accounts on the summary or breakdown endpoints — the
`404 NOT_FOUND` path is reserved exclusively for cross-user
access on the flow endpoint, per BR-RPT-4 (no information
leakage).

### 7.2 Handler shape (one example)

```typescript
// src/modules/reports/application/routes.ts

import type { OpenAPIHono } from '@hono/zod-openapi';
import { ErrorStatus } from '@/shared/errors/error-codes';
import { getMonthlySummaryAction } from './actions/get-monthly-summary.action';
import { getCategoryBreakdownAction } from './actions/get-category-breakdown.action';
import { getAccountFlowAction } from './actions/get-account-flow.action';
import type { ReportsActionDeps } from './actions/_shared';
import type { AuthUser } from '@/modules/api/middlewares/variables';

type ReportsProtectedVariables = { user: AuthUser; requestId: string };

export interface MountReportsRoutesDeps {
  reportsDeps?: ReportsActionDeps; // optional — mirror transactions' pattern
}

export function mountReportsRoutes(
  protectedApp: OpenAPIHono<{ Variables: ReportsProtectedVariables }>,
  deps: MountReportsRoutesDeps,
): void {
  if (!deps.reportsDeps) return; // legacy accounts-only setups keep compiling
  const rDeps = deps.reportsDeps;
  const statusFor = (code: string): never => ErrorStatus[code as keyof typeof ErrorStatus] as never;

  protectedApp.get('/api/reports/monthly', async (c) => {
    const user = c.get('user');
    const query = Object.fromEntries(new URL(c.req.url).searchParams);
    const res = await getMonthlySummaryAction(rDeps, { userId: user.id, rawQuery: query });
    if (res.ok) return c.json({ data: res.value }, 200);
    return c.json({ error: res.error }, statusFor(res.error.code));
  });

  protectedApp.get('/api/reports/breakdown', async (c) => {
    const user = c.get('user');
    const query = Object.fromEntries(new URL(c.req.url).searchParams);
    const res = await getCategoryBreakdownAction(rDeps, { userId: user.id, rawQuery: query });
    if (res.ok) return c.json({ data: res.value }, 200);
    return c.json({ error: res.error }, statusFor(res.error.code));
  });

  protectedApp.get('/api/reports/accounts/:accountId/flow', async (c) => {
    const user = c.get('user');
    const accountId = c.req.param('accountId');
    const query = Object.fromEntries(new URL(c.req.url).searchParams);
    const res = await getAccountFlowAction(rDeps, { userId: user.id, accountId, rawQuery: query });
    if (res.ok) return c.json({ data: res.value }, 200);
    return c.json({ error: res.error }, statusFor(res.error.code));
  });
}
```

### 7.3 Route tests

`src/modules/reports/application/routes.test.ts` covers, per
route:

- `401 UNAUTHORIZED` when no session.
- `200` + correct shape on valid request (seeded with
  `InMemoryReportsRepository` + `InMemoryTransactionRepository`).
- `400 VALIDATION_ERROR` on bad query (e.g. `?month=foo`).
- `404 NOT_FOUND` on cross-user `accountId` for the flow route.
- `400 VALIDATION_ERROR` on range > 366 days for the flow route.

The tests use the in-memory fixture
(`InMemoryReportsRepository`) backed by the transactions
in-memory fixture (`InMemoryTransactionRepository`) for the
underlying data source. The fixture composition reuses the
existing pattern at
`src/modules/transactions/application/fixtures/in-memory-transaction.repository.ts`.

---

## 8. Composition root wiring

### 8.1 `buildAppDeps` additions

```typescript
// src/composition/build-app-deps.ts — additions

import { ReportsRepositoryPrisma } from '@/modules/reports/infrastructure/repositories/reports.repository.prisma';
import { createNoopHandler } from '@/modules/reports/infrastructure/subscribers/noop-transaction-recorded.subscriber';
import type { ReportsActionDeps, MountReportsRoutesDeps } from '@/modules/reports';

export interface HonoAppDeps {
  // ... existing fields unchanged ...
  /**
   * Slice 3 (reports): the action-layer deps bag for the
   * reports capability. The factory builds the real one
   * (Prisma adapter + InMemoryReportsRepository for the
   * SubscriberPort seam + the dispatcher's noop handler);
   * tests inject a fake one with an in-memory repository.
   */
  reportsDeps?: ReportsActionDeps;
}

export function buildAppDeps(): HonoAppDeps {
  // ... existing wiring unchanged ...
  const reportsDeps = buildReportsDeps({
    txRepo,
    accountRepo,
    dispatcher,
    logger,
    clock: systemClock,
  });

  // BR-RPT-5: wire the noop handler at composition time.
  dispatcher.subscribe('TransactionRecorded', createNoopHandler(logger));

  return {
    // ... existing fields unchanged ...
    reportsDeps,
  };
}

export function buildReportsDeps(args: {
  txRepo: TransactionRepositoryPort;
  accountRepo: AccountRepositoryPort;
  dispatcher: EventDispatcher;
  logger: Logger;
  clock: Clock;
}): ReportsActionDeps {
  const reportsRepo = new ReportsRepositoryPrisma({
    transactionRepository: args.txRepo,
    prismaView: asPrismaDelegateView(
      prisma() as unknown as Parameters<typeof asPrismaDelegateView>[0],
    ),
  });
  const subscriber: ReportSubscriberPort = {
    onTransactionRecorded: (handler) => {
      args.dispatcher.subscribe('TransactionRecorded', handler);
      return () => args.dispatcher.unsubscribe?.('TransactionRecorded', handler);
    },
  };
  return {
    reportsRepository: reportsRepo,
    accountRepository: args.accountRepo,
    subscriber,
    clock: args.clock,
    logger: args.logger,
    dispatcher: args.dispatcher,
  };
}
```

### 8.2 `createHonoApp` mount

```typescript
// src/composition/create-hono-app.ts — additions after line 165

mountReportsRoutes(protectedApp, { reportsDeps: deps.reportsDeps });
```

### 8.3 `build-app-deps.test.ts` subscriber-count assertion

§6.3 above. The test asserts exactly one subscriber for
`TransactionRecorded` after `buildAppDeps` returns. A missing
subscribe fails the test (REQ-RPT-7 scenario "composition-root
boot registers the no-op handler").

---

## 9. UI — `app/dashboard/`

The dashboard is a Server Component that resolves the session via
`auth()` and calls the three reports endpoints in parallel. Three
presentational Server Components render the cards. No client
hooks, no `'use client'` directive. Smoke-minimal, not production.

### 9.1 File tree

```
app/dashboard/
├── page.tsx                       # RSC: resolves session, calls 3 endpoints in parallel, renders 3 cards
└── (helpers live in app/_components/ and app/_lib/)

app/_components/
├── dashboard-monthly-summary.tsx       # Server Component: receives MonthlySummaryDTO, renders card
├── dashboard-category-breakdown.tsx    # Server Component: receives CategoryBreakdownDTO, renders card
└── dashboard-account-flow.tsx          # Server Component: receives AccountFlowDTO, renders card

app/_lib/
├── report-types.ts                     # MonthlySummaryDTO, CategoryBreakdownDTO, AccountFlowDTO (wire shapes)
└── (reuses formatMinor from format-minor.ts; no new formatter)
```

### 9.2 `app/dashboard/page.tsx`

```typescript
// smoke-minimal, not production
import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth';
import { serverHonoRequest } from '@/lib/server-hono';
import { MonthlySummaryCard } from '../_components/dashboard-monthly-summary';
import { CategoryBreakdownCard } from '../_components/dashboard-category-breakdown';
import { AccountFlowCard } from '../_components/dashboard-account-flow';
import type { MonthlySummaryDTO, CategoryBreakdownDTO, AccountFlowDTO, ErrorEnvelope } from '../_lib/report-types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/dashboard'));
  }

  // Parallel calls — the three endpoints are independent.
  const [summaryRes, breakdownRes] = await Promise.all([
    serverHonoRequest('/api/reports/monthly?month=' + currentUtcMonth()),
    serverHonoRequest('/api/reports/breakdown?month=' + currentUtcMonth()),
  ]);

  // The flow card is empty in v1 — the dashboard does not
  // deep-link to a specific account. A future change adds an
  // account picker that calls /api/reports/accounts/:id/flow.
  const summary: MonthlySummaryDTO = summaryRes.ok
    ? (await summaryRes.json()).data
    : { totals: [], generatedAt: new Date().toISOString() };
  const breakdown: CategoryBreakdownDTO = breakdownRes.ok
    ? (await breakdownRes.json()).data
    : { buckets: [], generatedAt: new Date().toISOString() };
  const flow: AccountFlowDTO = { days: [], generatedAt: new Date().toISOString() };

  // Empty-state sentinel: no totals AND no buckets.
  const isEmpty = summary.totals.length === 0 && breakdown.buckets.length === 0;

  return (
    <main className="p-6">
      <header className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <span className="text-sm text-gray-500">{summaryMonthLabel()}</span>
      </header>
      {isEmpty ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MonthlySummaryCard summary={summary} />
          <CategoryBreakdownCard breakdown={breakdown} />
          <AccountFlowCard flow={flow} />
        </div>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <EmptyCard title="Sin datos" />
      <EmptyCard title="Sin datos" />
      <EmptyCard title="Sin datos" />
      <div className="md:col-span-3 text-center mt-4">
        <a href="/transactions/new" className="rounded bg-blue-600 text-white px-4 py-2">
          Registrar primera transacción
        </a>
      </div>
    </div>
  );
}
```

### 9.3 Presentational components (sketch)

```typescript
// app/_components/dashboard-monthly-summary.tsx
// Server Component — no 'use client'.
import { formatMinor } from '../_lib/format-minor';
import type { MonthlySummaryDTO } from '../_lib/report-types';

export function MonthlySummaryCard({ summary }: { summary: MonthlySummaryDTO }) {
  // Surfaces the UTC label so the user knows the bucketing is UTC.
  return (
    <article className="rounded border p-4">
      <h2 className="text-lg font-semibold mb-2">Resumen mensual</h2>
      <p className="text-xs text-gray-500 mb-3">{summaryMonthLabel(summary.generatedAt)}</p>
      <table className="w-full text-sm">
        <thead>
          <tr><th>Moneda</th><th>Ingresos</th><th>Gastos</th><th>Neto</th><th>#</th></tr>
        </thead>
        <tbody>
          {summary.totals.map((t) => (
            <tr key={t.convertedCurrency}>
              <td>{t.convertedCurrency}</td>
              <td>{formatMinor(t.incomeMinor, t.convertedCurrency)}</td>
              <td>{formatMinor(t.expenseMinor, t.convertedCurrency)}</td>
              <td>{formatMinor(t.netMinor, t.convertedCurrency)}</td>
              <td>{t.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

// dashboard-category-breakdown.tsx — same pattern; renders the buckets as a table sorted by amountMinor DESC.
// dashboard-account-flow.tsx — same pattern; renders the days as a table or a CSS-width bar chart.
```

All three components are pure Server Components. No client
hooks, no `useState`, no `useEffect`. The CSS `width: %` bar
chart is server-rendered; no chart library in v1.

### 9.4 UI tests

Vitest snapshot tests for the three presentational components,
exercised via `react-dom/server`'s `renderToStaticMarkup` (the
project's existing test seam — `react-dom/server` is already a
dev dependency per `package.json`):

```typescript
// app/_components/dashboard-monthly-summary.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { MonthlySummaryCard } from './dashboard-monthly-summary';
import type { MonthlySummaryDTO } from '../_lib/report-types';

it('renders an empty state when totals is empty', () => {
  const summary: MonthlySummaryDTO = {
    totals: [],
    generatedAt: '2026-06-15T12:00:00.000Z',
  };
  const html = renderToStaticMarkup(<MonthlySummaryCard summary={summary} />);
  expect(html).toMatchSnapshot();
});

it('renders one row per convertedCurrency', () => {
  const summary: MonthlySummaryDTO = {
    totals: [
      { convertedCurrency: 'ARS', incomeMinor: 100000, expenseMinor: 50000, netMinor: 50000, count: 3 },
      { convertedCurrency: 'USD', incomeMinor: 0, expenseMinor: 2500, netMinor: -2500, count: 1 },
    ],
    generatedAt: '2026-06-15T12:00:00.000Z',
  };
  const html = renderToStaticMarkup(<MonthlySummaryCard summary={summary} />);
  expect(html).toMatchSnapshot();
});
```

Plus a snapshot for `app/dashboard/page.tsx` itself (smoke
check; the page is an RSC).

---

## 10. Slice breakdown (4 chained PRs, force-chained)

The orchestrator pre-cached `delivery_strategy: force-chained` and
`review_budget_lines: 400`. Every slice MUST be a self-contained
PR with a clear start, finish, verification, and rollback.

### 10.1 Slice 1 — `reports-domain`

| Field             | Value                                                                                                                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch            | `feat/reports-1-domain`                                                                                                                                                                                                                                        |
| Scope             | `src/modules/reports/domain/` (full domain skeleton, no routes, no application layer, no Hono changes)                                                                                                                                                         |
| Files (new)       | All files under `src/modules/reports/domain/` (aggregates × 3, services × 1, ports × 2, errors × 5, value-objects × 1, barrel × 1) + co-located tests + new kernel port `src/shared/domain-kernel/ports/transaction-repository-port.ts` + kernel barrel update |
| LoC low           | 180                                                                                                                                                                                                                                                            |
| LoC high          | 280                                                                                                                                                                                                                                                            |
| Verification gate | `pnpm test src/modules/reports/domain` exits 0; port contract test asserts cross-user isolation; ≥ 80% coverage on the domain layer                                                                                                                            |
| Rollback          | `git revert <merge-sha>`; the kernel port deletion is non-breaking (only `reports` imports it)                                                                                                                                                                 |
| Follow-up         | Slice 2 consumes the port; no external dependency on slice 1 changes after merge                                                                                                                                                                               |

**Commit plan** (atomic, conventional; mirrors the work-unit-commits
pattern):

1. `feat(reports-domain): add kernel port for transaction read surface`
   — adds `src/shared/domain-kernel/ports/transaction-repository-port.ts`
   and updates `src/shared/domain-kernel/index.ts` (≤ 30 lines).
2. `test(reports-domain): port contract test asserts userId-first on every method`
   — adds `reports-repository.port.test.ts` (RED).
3. `feat(reports-domain): add ReportsRepositoryPort and ReportSubscriberPort interfaces`
   — adds the two port files (GREEN).
4. `feat(reports-domain): add MonthlySummary aggregate with factory + tests`
   — entity + tests (RED → GREEN → TRIANGULATE → REFACTOR).
5. `feat(reports-domain): add CategoryBreakdown aggregate with factory + tests`
   — entity + tests.
6. `feat(reports-domain): add AccountFlow aggregate with factory + tests`
   — entity + tests.
7. `feat(reports-domain): add pure aggregator services + tests`
   — `aggregate-transactions.ts` + tests.
8. `feat(reports-domain): add domain errors and value objects + tests`
   — error classes + `month.ts`.
9. `docs(reports-domain): design + Spanish mirror` — already
   shipped in this design phase; no commit needed.

**TDD cycle for commit #4** (the first entity test). See §11.1.

### 10.2 Slice 2 — `reports-application`

| Field             | Value                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch            | `feat/reports-2-application`                                                                                                                 |
| Scope             | `src/modules/reports/application/` (actions × 3, schemas × 3, DTOs × 3, fixtures × 1, routes stub × 1, barrel × 1, co-located tests)         |
| Files (new)       | All files under `src/modules/reports/application/`                                                                                           |
| LoC low           | 220                                                                                                                                          |
| LoC high          | 340                                                                                                                                          |
| Verification gate | `pnpm test src/modules/reports/application` exits 0; action tests cover empty state, mixed-currency, cross-user isolation, 400/401/404 paths |
| Rollback          | `git revert <merge-sha>`; the application layer is additive (no callers until slice 3)                                                       |
| Follow-up         | Slice 3 mounts the routes on `protectedApp` and wires the composition root                                                                   |

**Commit plan**:

1. `test(reports-application): monthly-summary-query schema RED`
   — schema parse tests with no implementation (RED).
2. `feat(reports-application): monthly-summary-query schema`
   — schema implementation (GREEN).
3. `test(reports-application): category-breakdown-query schema RED`
4. `feat(reports-application): category-breakdown-query schema`
5. `test(reports-application): account-flow-query schema RED`
6. `feat(reports-application): account-flow-query schema` (cuid
   regex on `accountId` per orchestrator correction #1).
7. `test(reports-application): in-memory reports repository fixture RED`
8. `feat(reports-application): in-memory reports repository fixture`
9. `test(reports-application): get-monthly-summary action RED`
10. `feat(reports-application): get-monthly-summary action`
11. `test(reports-application): get-category-breakdown action RED`
12. `feat(reports-application): get-category-breakdown action`
13. `test(reports-application): get-account-flow action RED`
14. `feat(reports-application): get-account-flow action`
15. `feat(reports-application): DTO mappers + tests`
16. `feat(reports-application): _shared.ts + barrel + ApplicationLayer`

**TDD cycle for commit #9**. See §11.2.

### 10.3 Slice 3 — `reports-routes`

| Field             | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch            | `feat/reports-3-routes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Scope             | `src/modules/reports/application/routes.ts` (mount function), `src/composition/build-app-deps.ts` (deps wiring + noop subscribe), `src/composition/create-hono-app.ts` (mount call), `src/modules/reports/infrastructure/repositories/reports.repository.prisma.ts` (Prisma adapter), `src/modules/reports/infrastructure/subscribers/noop-transaction-recorded.subscriber.ts` (noop handler), `src/modules/reports/index.ts` (public barrel), `src/shared/domain-kernel/index.ts` (re-export port), `src/composition/build-app-deps.test.ts` (subscriber-count assertion) |
| Files (new)       | `routes.ts`, `routes.test.ts`, `reports.repository.prisma.ts`, `reports.repository.prisma.test.ts`, `noop-transaction-recorded.subscriber.ts`, `noop-transaction-recorded.subscriber.test.ts`, `src/modules/reports/index.ts`                                                                                                                                                                                                                                                                                                                                              |
| Files (modified)  | `src/composition/build-app-deps.ts`, `src/composition/create-hono-app.ts`, `src/shared/domain-kernel/index.ts`, `src/composition/build-app-deps.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| LoC low           | 160                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| LoC high          | 260                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Verification gate | `pnpm test src/modules/reports/application/routes.test.ts` exits 0; `pnpm test src/composition/build-app-deps.test.ts` asserts the subscriber count (REQ-RPT-7); manual `curl` smoke against `pnpm dev` with seeded data                                                                                                                                                                                                                                                                                                                                                   |
| Rollback          | `git revert <merge-sha>`; the three routes are additive (no callers until slice 4); the noop subscribe is removable without callers until a future change                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Follow-up         | Slice 4 consumes the routes from `app/dashboard/page.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Commit plan**:

1. `test(reports-routes): noop handler RED` — handler returns
   `void`; assert no throw on sample payload.
2. `feat(reports-routes): noop handler + test` (GREEN).
3. `feat(reports-routes): composition-root wires the noop handler`
   — adds the `dispatcher.subscribe` call in `buildAppDeps`.
4. `test(reports-routes): subscriber-count assertion RED`
   — `build-app-deps.test.ts` asserts the count.
5. `feat(reports-routes): subscriber-count assertion passes` (GREEN).
6. `test(reports-routes): Prisma reports repository integration RED`
   — testcontainers Postgres integration test.
7. `feat(reports-routes): Prisma reports repository` (GREEN).
8. `test(reports-routes): Hono integration RED`
   — three routes with in-memory deps.
9. `feat(reports-routes): mount function + Hono integration` (GREEN).
10. `feat(reports-routes): wire mount into createHonoApp`
    — single-line addition in `create-hono-app.ts`.
11. `docs(reports-routes): barrel + module README`

**TDD cycle for commit #1** (the noop handler test). See §11.3.

### 10.4 Slice 4 — `dashboard-ui`

| Field             | Value                                                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch            | `feat/reports-4-dashboard-ui`                                                                                                                                                                                                                                                        |
| Scope             | `app/dashboard/page.tsx`, `app/_components/dashboard-*.tsx` (× 3), `app/_lib/report-types.ts`, co-located tests                                                                                                                                                                      |
| Files (new)       | `app/dashboard/page.tsx`, `app/_components/dashboard-monthly-summary.tsx`, `app/_components/dashboard-category-breakdown.tsx`, `app/_components/dashboard-account-flow.tsx`, `app/_lib/report-types.ts`, `app/dashboard/page.test.tsx`, `app/_components/dashboard-*.test.tsx` (× 3) |
| LoC low           | 200                                                                                                                                                                                                                                                                                  |
| LoC high          | 320                                                                                                                                                                                                                                                                                  |
| Verification gate | Manual `pnpm dev` smoke: sign in → visit `/dashboard` → see three cards. Vitest snapshot tests for the three presentational components + the dashboard page.                                                                                                                         |
| Rollback          | `git revert <merge-sha>`; the dashboard route is additive (404s if visited when the slice is reverted; no other route references it)                                                                                                                                                 |
| Follow-up         | Future `transactions-ui` adds design-system primitives and accessibility audits                                                                                                                                                                                                      |

**Commit plan**:

1. `feat(dashboard-ui): report-types.ts wire shapes`
   — DTOs mirroring the wire response shapes (≤ 40 lines).
2. `test(dashboard-ui): MonthlySummaryCard empty state snapshot RED`
3. `feat(dashboard-ui): MonthlySummaryCard`
4. `test(dashboard-ui): CategoryBreakdownCard empty + populated snapshots RED`
5. `feat(dashboard-ui): CategoryBreakdownCard`
6. `test(dashboard-ui): AccountFlowCard empty state snapshot RED`
7. `feat(dashboard-ui): AccountFlowCard`
8. `test(dashboard-ui): dashboard page empty state snapshot RED`
9. `feat(dashboard-ui): app/dashboard/page.tsx`
10. `docs(dashboard-ui): Spanish mirror update` — `app/` does
    not have a `Documents-es/` mirror (per the existing project
    convention; the mirror covers `docs/` and `openspec/` only).
    No commit needed.

**TDD cycle for commit #2** (the first card snapshot). See §11.4.

---

## 11. TDD plan per slice — RED → GREEN → TRIANGULATE → REFACTOR

Strict TDD per `openspec/config.yaml`. Every slice's first
test-driven commit follows the cycle below.

### 11.1 Slice 1 — `MonthlySummary` aggregate

**RED.** Write the failing test first:

```typescript
// src/modules/reports/domain/aggregates/monthly-summary.test.ts
import { describe, it, expect } from 'vitest';
import { createMonthlySummary } from './monthly-summary';
import type { TransactionDTO } from '@/shared/domain-kernel/ports/transaction-repository-port';
import { systemClock } from '@/shared/clock/system-clock';

describe('createMonthlySummary', () => {
  it('groups by convertedCurrency and returns one row per currency', () => {
    // GIVEN: 3 ARS transactions + 2 USD transactions in 2026-06 (UTC)
    const rows: TransactionDTO[] = [
      {
        id: 'a',
        userId: 'u1',
        accountId: 'a1',
        direction: 'INCOME',
        amountMinor: 100000,
        currency: 'ARS',
        convertedAmountMinor: 100000,
        convertedCurrency: 'ARS',
        transactionDate: new Date('2026-06-01T00:00:00Z'),
        fxAsOfSnapshot: null,
        casaSnapshot: null,
        memo: null,
        category: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // ... 4 more rows
    ];

    // WHEN: factory is called with the rows + the system clock
    const summary = createMonthlySummary({
      userId: 'u1',
      year: 2026,
      month: 6,
      rows,
      clock: systemClock,
    });

    // THEN: two totals rows (one per convertedCurrency)
    expect(summary.totals).toHaveLength(2);
    expect(summary.totals).toContainEqual({
      convertedCurrency: 'ARS',
      incomeMinor: expect.any(Number),
      expenseMinor: expect.any(Number),
      netMinor: expect.any(Number),
      count: 3,
    });
    // ... USD row assertion
    expect(summary.generatedAt).toBeInstanceOf(Date);
  });
});
```

The test fails because `createMonthlySummary` does not exist yet.

**GREEN.** Implement the minimum factory:

```typescript
export function createMonthlySummary(input: CreateMonthlySummaryInput): MonthlySummary {
  const buckets = new Map<AccountCurrency, MonthlyTotals>();
  for (const row of input.rows) {
    const existing = buckets.get(row.convertedCurrency) ?? {
      convertedCurrency: row.convertedCurrency,
      incomeMinor: 0,
      expenseMinor: 0,
      netMinor: 0,
      count: 0,
    };
    if (row.direction === 'INCOME') existing.incomeMinor += row.convertedAmountMinor;
    else existing.expenseMinor += row.convertedAmountMinor;
    existing.count += 1;
    buckets.set(row.convertedCurrency, existing);
  }
  const totals = [...buckets.values()].map((b) => ({
    ...b,
    netMinor: b.incomeMinor - b.expenseMinor,
  }));
  return {
    userId: input.userId,
    year: input.year,
    month: input.month,
    totals,
    generatedAt: input.clock.now(),
  };
}
```

**TRIANGULATE.** Add a second test that probes a different angle:

```typescript
it('returns an empty totals array when there are no rows', () => {
  const summary = createMonthlySummary({
    userId: 'u1',
    year: 2026,
    month: 6,
    rows: [],
    clock: systemClock,
  });
  expect(summary.totals).toEqual([]);
  expect(summary.generatedAt).toBeInstanceOf(Date);
});

it('throws when month is out of range', () => {
  expect(() =>
    createMonthlySummary({ userId: 'u1', year: 2026, month: 13, rows: [], clock: systemClock }),
  ).toThrow(ReportsDomainError);
});
```

**REFACTOR.** Extract the bucketing into a private helper,
extract the month validation into a free function in `month.ts`,
share the `Map` allocation with `aggregateMonthly`. Re-run tests;
all green.

### 11.2 Slice 2 — `getMonthlySummaryAction`

**RED.** Write the failing test first:

```typescript
// src/modules/reports/application/actions/get-monthly-summary.action.test.ts
import { describe, it, expect } from 'vitest';
import { getMonthlySummaryAction } from './get-monthly-summary.action';
import { InMemoryReportsRepository } from '../fixtures/reports-repository.inmemory';
import { InMemoryTransactionRepository } from '@/modules/transactions/application/fixtures/in-memory-transaction.repository';
import { systemClock } from '@/shared/clock/system-clock';

describe('getMonthlySummaryAction', () => {
  it('returns 200 with monthly totals for a valid month query', async () => {
    // GIVEN: in-memory repo with 2 ARS transactions in 2026-06
    const txRepo = new InMemoryTransactionRepository();
    txRepo.seed(/* seed 2 ARS rows */);
    const reportsRepo = new InMemoryReportsRepository(txRepo);
    const deps = { reportsRepository: reportsRepo /* ... */ } as any;

    // WHEN: action is called with month=2026-06
    const result = await getMonthlySummaryAction(deps, {
      userId: 'u1',
      rawQuery: { month: '2026-06' },
    });

    // THEN: ok=true and totals has 1 ARS row
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totals).toHaveLength(1);
      expect(result.value.totals[0].convertedCurrency).toBe('ARS');
    }
  });
});
```

**GREEN.** Implement the minimum action: parse, call port, call
factory, return DTO.

**TRIANGULATE.** Add cross-user isolation test (user B's rows do
not appear), empty-state test (no rows → empty totals), and
invalid-month test (`?month=foo` → `VALIDATION_ERROR`).

**REFACTOR.** Extract the `month → fromDate/toDate` window
derivation into `month.ts` (shared with the breakdown action).
Extract the DTO mapping into `monthly-summary.dto.ts`.

### 11.3 Slice 3 — `NoopTransactionRecordedSubscriber`

**RED.** Write the failing test first:

```typescript
// src/modules/reports/infrastructure/subscribers/noop-transaction-recorded.subscriber.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createNoopHandler } from './noop-transaction-recorded.subscriber';

describe('createNoopHandler', () => {
  it('returns void without throwing on a sample TransactionRecorded payload', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const handler = createNoopHandler(logger as any);
    const payload = {
      userId: 'u1',
      transactionId: 't1',
      accountId: 'a1',
      direction: 'INCOME' as const,
      amountMinor: 1000,
      currency: 'ARS' as const,
      casa: null,
      convertedAmountMinor: 1000,
      convertedCurrency: 'ARS' as const,
      occurredAt: '2026-06-15T00:00:00.000Z',
    };
    await expect(handler(payload)).resolves.toBeUndefined();
    expect(logger.debug).toHaveBeenCalledWith(
      'reports.noop.transaction-recorded',
      expect.objectContaining({ userId: 'u1' }),
    );
  });
});
```

**GREEN.** Implement:

```typescript
export function createNoopHandler(logger: Logger) {
  return async (event: TransactionRecordedPayload): Promise<void> => {
    logger.debug('reports.noop.transaction-recorded', {
      userId: event.userId,
      transactionId: event.transactionId,
    });
  };
}
```

**TRIANGULATE.** Add a test that asserts the handler accepts the
canonical payload shape (no extra fields, no missing fields) — a
type-narrowing test that fails if the `TransactionRecordedPayload`
interface changes.

**REFACTOR.** No refactor needed for v1; the handler is a one-liner.

### 11.4 Slice 4 — `MonthlySummaryCard` empty-state snapshot

**RED.** Write the failing snapshot test:

```typescript
// app/_components/dashboard-monthly-summary.test.tsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MonthlySummaryCard } from './dashboard-monthly-summary';

describe('MonthlySummaryCard', () => {
  it('renders an empty state when totals is empty', () => {
    const html = renderToStaticMarkup(
      <MonthlySummaryCard
        summary={{ totals: [], generatedAt: '2026-06-15T12:00:00.000Z' }}
      />,
    );
    expect(html).toContain('Sin datos');
    expect(html).toContain('Resumen mensual');
  });
});
```

The test fails because `MonthlySummaryCard` does not exist yet.

**GREEN.** Implement the component as a pure Server Component
(see §9.3 sketch).

**TRIANGULATE.** Add a populated-state snapshot test (two rows:
ARS + USD), and a snapshot test that asserts the UTC month label
appears in the rendered HTML.

**REFACTOR.** Extract a `<Card>` shell from the three
presentational components to deduplicate the border / padding /
typography; re-run snapshots; all green.

---

## 12. Risks and deviations

### 12.1 Carry-over BRs by reference

The design keeps BR-ACC-12, BR-TX-4, BR-TX-7, and BR-TX-9 by
**reference** rather than inlining their text. This matches the
repo convention at
`openspec/changes/transactions/specs/transactions/spec.md` §"Carried
from other capabilities" — the spec names the BR ID and the source
file, not the full text. The design carries the same convention in
its "Carried BRs" callouts (§1, §3.6, §4.1).

This is an intentional convention, NOT a §10.3 anti-pattern.
Flagging here so the reviewer does not flag it as drift.

### 12.2 366-day range upper bound

The spec codified 366 days as the upper bound for the account flow
endpoint. The design keeps this. Rationale (orchestrator
correction #3): one calendar year + leap-day buffer. The buffer
absorbs:

- Timezone rounding at the UTC midnight boundary (a `2026-12-31`
  end date in UTC is `2027-01-01` in UTC+1).
- Leap-year alignment (a `fromDate=2024-01-01 toDate=2025-01-01`
  range is 366 days because 2024 is a leap year).
- One-day slack for the user's clock being slightly ahead of UTC.

A future change can tighten to 365 days if user feedback indicates
the 366-day cap is too lax; the limit is centralized in the
action's range check (§5.5 step 2), so the change is a
one-line edit.

### 12.3 cuid vs UUID v4 — corrected here vs the spec

The spec said `accountId MUST be a UUID v4 string` at REQ-RPT-5.
The project uses **cuid** for `FinancialAccount.id` per
`openspec/specs/transactions/spec.md:184` and the Prisma
`Transaction.id` schema declaration (`@id @default(cuid())`). The
design applies the correction: the Zod schema at
`account-flow-query.schema.ts` validates `accountId` with the
cuid regex `/^c[a-z0-9]{20,32}$/`.

`sdd-apply` MUST use the cuid regex. The spec phase should pick
this up in the next delta (a one-line edit at REQ-RPT-5). The
design carries the corrected wording here so the implementation
lands on the right regex.

### 12.4 Lazy compute-on-read performance

The proposal §"Snapshot strategy" documents the lazy-read
trade-off. The aggregate functions run in-memory at query time;
the two existing Prisma indexes (`@@index([userId,
transactionDate])` and `@@index([accountId, transactionDate])`)
make the read O(rows-in-window). At v1 row scale (low hundreds
per user per month), the in-memory aggregate is sub-100ms.

The risk is that as the user's row count grows, the aggregate
slows. The mitigation path is the event-driven materialization
migration: the noop subscriber (§6.2) becomes the materializer;
the read path swaps from `TransactionRepositoryPort.list` to the
materialization table; no interface change for callers.

### 12.5 No-op subscriber could mask a wiring bug

A no-op handler that returns `void` looks identical to a missing
handler from the dispatcher's perspective. The risk is that a
wiring regression (e.g. someone removes the `dispatcher.subscribe`
call in `buildAppDeps`) goes undetected.

Mitigation: `build-app-deps.test.ts` asserts
`dispatcher.subscriberCount('TransactionRecorded')` is exactly
`before + 1` after `buildAppDeps` returns (§6.3, §8.3). A
missing subscribe fails the test (REQ-RPT-7 scenario).

### 12.6 Strict TDD risk

Strict TDD's RED step is easy to skip under time pressure. The
risk is that the implementation lands with a non-red test or
with tests written after the code. The mitigation:

- `sdd-tasks` owns task structure; the tasks document the
  per-commit RED test before the GREEN implementation.
- `sdd-apply` enforces RED → GREEN → TRIANGULATE → REFACTOR per
  task (per `openspec/config.yaml` and the `~/.pi/agent/gentle-ai/support/strict-tdd.md`
  reference).
- The PR template (`.github/pull_request_template.md`) requires
  the reviewer to confirm the RED commit landed before the
  GREEN commit.

### 12.7 "User with zero accounts" sentinel on the summary endpoint

The design returns `200 { totals: [] }` for a user with zero
accounts on `GET /api/reports/monthly` (orchestrator §7.1). The
alternative would be `404 NOT_FOUND`, but that conflates "user
has accounts, none transacted this month" with "user has no
accounts at all". Both are legitimate empty states; the
dashboard's empty-state branch handles both uniformly.

Flagging this as a design decision because the spec's REQ-RPT-4
scenario only specifies `404` for cross-user reads, not for
zero-accounts. The dashboard's empty-state sentinel (§9.2) is the
consumer of this decision.

### 12.8 Existing `src/modules/transactions/index.ts` does not exist

The orchestrator's design tree (§2.1 above) calls for
`src/modules/reports/index.ts` as the public barrel. The
transactions module does not follow this convention — its public
barrel is `src/modules/transactions/application/index.ts`
(re-exporting the domain surface). The design follows the
orchestrator's spec for `reports` because the orchestrator is
the canonical source for the change's structure. A future
refactor could normalize both modules to a single root barrel,
but that's out of scope for v1.

### 12.9 Sign convention for `convertedAmountMinor`

**Convention (verified against slice 1 code at
`src/modules/reports/domain/services/aggregate-transactions.ts`,
which mirrors the original `monthly-summary.ts` and `account-flow.ts`
factories verbatim):**

- `convertedAmountMinor` carries SIGN: positive for INCOME, negative
  for EXPENSE. (Inherited from BR-ACC-12 / REQ-TX-1.)
- `TransactionDirection` is the explicit field on the DTO; the
  amount's sign is **redundant but preserved** for arithmetic
  convenience and to allow the aggregator to fall back on sign if
  `direction` is ever absent.
- `aggregateMonthly` splits income and expense by `direction`, then
  strips the sign with `Math.abs` before summing into
  `incomeMinor` / `expenseMinor` (both `>= 0`). `netMinor` is
  computed as `incomeMinor - expenseMinor` and may be negative.
  The `Math.abs` is **load-bearing** in this path — it makes
  fixture rows that pass positive magnitudes (unsigned) and rows
  that pass negative magnitudes (signed, per the convention) both
  work correctly.
- `aggregateAccountFlow` and `aggregateCategoryBreakdown` sum the
  signed `convertedAmountMinor` directly (no `Math.abs`) because
  those aggregates treat income as positive contribution and expense
  as negative contribution — `runningBalanceMinor` and `amountMinor`
  carry the natural sign.

**Invariant under the convention:**

```
netMinor == sum(signed convertedAmountMinor for the month)
        == incomeMinor - expenseMinor
```

both expressions evaluate to the same value because the income rows
contribute positively and the expense rows contribute negatively
once `Math.abs` strips the sign for the split.

**Test-fixture rule:** fixtures MUST follow the convention — a
row with `direction: 'EXPENSE'` and positive `convertedAmountMinor`
works under the current implementation (thanks to `Math.abs`), but
a row with `direction: 'INCOME'` and negative
`convertedAmountMinor` would be **incorrectly summed into
`expenseMinor`** because `Math.abs` would strip the sign and the
split would route by `direction`. Always pair `direction` with the
matching sign.

---

## 13. Open questions for the user

None. All five questions locked at the pre-spec session
(proposal §"Open questions" Q1-Q5) are codified in the spec and
the design carries them verbatim. The orchestrator corrections
(cuid regex, carry-over BRs, 366 days) are baked into the design
without renegotiation.

---

## 14. Acceptance criteria

The orchestrator can run these binary checks after `sdd-apply`
completes:

1. `pnpm test src/modules/reports/` exits 0 (domain + application
   - infrastructure).
2. `pnpm test src/composition/build-app-deps.test.ts` exits 0
   with the subscriber-count assertion (REQ-RPT-7, BR-RPT-5).
3. `pnpm typecheck` exits 0 (TypeScript strict mode, no `any`).
4. `pnpm test:coverage` reports ≥ 80% on `src/modules/reports/`
   (domain + application + infrastructure layers).
5. `curl -H "Cookie: authjs.session-token=..." 'http://localhost:3000/api/reports/monthly?month=2026-06'`
   returns `200` with the expected JSON shape (or `401` if no
   session).
6. `app/dashboard/page.tsx` renders the three empty cards when
   there are no transactions (snapshot test) and the three
   populated cards when there are transactions (snapshot test).
7. No CJK characters in `Documents-es/` (per root `AGENTS.md`
   §13.3 mirror check); no AI attribution in commits (per root
   `AGENTS.md` §4.5 and §openspec/AGENTS.md author rule); no
   `--no-verify` in any commit (per root `AGENTS.md` §5.3
   pre-commit gate).

---

## 15. Cross-references

- **Proposal**: `openspec/changes/reports/proposal.md` — BR-RPT-1
  to BR-RPT-5; carried BRs (BR-ACC-12, BR-TX-4, BR-TX-7, BR-TX-9);
  lazy compute-on-read decision; no-op subscriber rationale.
- **Spec (delta)**: `openspec/changes/reports/specs/reports/spec.md`
  — REQ-RPT-1 to REQ-RPT-7; scenarios; carried BRs.
- **Spec (canonical, post-archive)**:
  `openspec/specs/reports/spec.md` — promoted by `sdd-archive`.
- **Transactions design (template)**:
  `openspec/changes/archive/2026-06-24-transactions/design.md` —
  structural template; PR layout; barrel conventions.
- **Transactions spec (cuid precedent)**:
  `openspec/specs/transactions/spec.md` — REQ-TX-1 (cuid id),
  BR-TX-4 (userId scoping), BR-TX-7 (hard-delete semantics).
- **Kernel ports**:
  `src/shared/domain-kernel/ports/account-repository.port.ts` —
  structural port pattern mirrored by the new
  `transaction-repository-port.ts`.
- **Event dispatcher**:
  `src/shared/events/event-dispatcher.ts` — `TransactionRecorded`
  payload shape; subscribe / dispatch API.
- **Composition root**: `src/composition/build-app-deps.ts` —
  factory pattern; `dispatcher` is the process-wide singleton;
  `systemClock` is the canonical clock.
- **Composition seam**: `src/composition/create-hono-app.ts` —
  `mountXxxRoutes` pattern; `protectedApp` registration site.
- **Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js
  v5 + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4.
- **Preflight**: interactive · `both` · `force-chained` · 400-line
  review budget.
- **Strict TDD**: enabled per `openspec/config.yaml:27-30`;
  runner `pnpm test`; cycle RED → GREEN → TRIANGULATE → REFACTOR.
- **Author / attribution**: `Sebastián Illa` per
  `openspec/AGENTS.md` §"Author attribution (docs metadata)".
