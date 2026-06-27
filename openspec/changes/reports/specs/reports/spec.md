# Spec — `reports` capability

**Author**: Sebastián Illa
**Capability**: `reports`
**Source change**: `reports`
**Status**: active · **Created**: 2026-06-26 · **Last sync**: 2026-06-26 (reports)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (inherited from `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4

> First write of the `reports` capability spec. It operationalizes
> the `reports` proposal v1 (draft 2026-06-26). The spec declares
> **what MUST be true** after the change lands, not how to
> implement it. Implementation details (file paths, schema
> syntax, test layout) are limited to what the cross-module
> contract requires.
>
> This is the **delta spec** for the new `reports` capability.
> The `reports` capability does not yet exist under
> `openspec/specs/` at the time of writing — it lives under
> `openspec/changes/reports/specs/reports/` until `sdd-archive`
> promotes it to the canonical location
> `openspec/specs/reports/spec.md`. The canonical and the delta
> are kept in lockstep; the canonical is the source of truth.

## Purpose

The `reports` capability is the **aggregation surface** of
`gastos-personales`. It is a read-only consumer of `Transaction`
rows that returns three derived views to the user: the **monthly
summary** (per-currency inflow, outflow, net, count), the
**category breakdown** (per-category totals ordered by amount
descending), and the **account flow** (daily net change per
account over a date range). The capability guarantees that:
(a) every read scopes to the session `userId` and cross-user
reads return `404 NOT_FOUND` (no information leakage);
(b) aggregates group by `convertedCurrency` (the FX-converted
base persisted on the row at write time) and never call the
FX provider in the read path (BR-ACC-12 carried); (c) category
normalization is the factory's responsibility (`lowercase +
trim`, empty/null → `"uncategorized"`); (d) the read path is
**lazy compute-on-read** in v1 with a no-op
`TransactionRecorded` subscription wired at composition time so
the future event-driven materialization migration is
non-breaking.

The capability exposes a stable, presentation-layer read
surface — `{ month, totals, breakdown, flow }` — that the
`/dashboard` page (and any future UI, including `snapshots`)
renders without learning the upstream `Transaction` details.

## Scope

### In scope

- New module `src/modules/reports/` mirroring the
  `src/modules/transactions/` shape (`domain/entities`,
  `domain/interfaces/reports.repository.port.ts`,
  `domain/services/{compute-monthly-summary,compute-category-breakdown,compute-account-flow}.ts`,
  `application/actions/{get-monthly-summary,get-category-breakdown,get-account-flow}.action.ts`,
  `application/dto/{monthly-summary,category-breakdown,account-flow}.dto.ts`,
  `application/validation/{monthly-summary-query,category-breakdown-query,account-flow-query}.schema.ts`,
  `application/fixtures/reports.repository.inmemory.ts`).
- Three Hono endpoints under `/api/reports` mounted on the
  existing protectedApp catch-all (the
  `app/api/[...path]/route.ts` file is not modified):
  `GET /api/reports/monthly`, `GET /api/reports/breakdown`,
  `GET /api/reports/accounts/:id/flow`.
- New error mapping: domain failures
  (`InvalidMonthError`, `InvalidDateRangeError`) inherit from a
  local `ReportsDomainError` base and map to the existing
  `VALIDATION_ERROR` code (no new error codes).
- New domain event subscription wiring (no-op handler) at
  composition time in `src/composition/build-app-deps.ts`. The
  union member `TransactionRecorded` is unchanged (REQ-TX-13
  carried).
- DI wiring additions in `src/composition/build-app-deps.ts`
  and `src/composition/create-hono-app.ts`: new
  `ReportsActionDeps` interface + `buildReportsDeps()`
  factory + `reportsDeps` field in `HonoAppDeps`.
- One Next.js App Router page under `app/dashboard/page.tsx`
  (Server Component shell that calls the three endpoints in
  parallel). Three presentational components under
  `app/_components/dashboard-{monthly-summary,category-breakdown,account-flow}.tsx`.
- Tests: unit tests for the three domain entities and three
  pure aggregation services; action tests for empty state,
  multi-currency, and cross-user isolation; route tests for
  the three Hono endpoints; one composition-root test
  asserting the `TransactionRecorded` subscription.

### Out of scope

- **Exports** (CSV, PDF, JSON download). A
  `GET /api/reports/export` endpoint is a v1.1 candidate.
- **Budget rules / spending limits.** A future `budgets`
  capability consumes the `MonthlySummary` aggregate; not in
  v1.
- **Forecasting.** Trend lines, predictions, anomaly
  detection. No ML, no statistical analysis.
- **Real-time streaming.** WebSockets, SSE, live-reload on
  `TransactionRecorded`. v1 is request/response; the event
  subscription is a no-op seam.
- **Currency conversion at read time.** All aggregates use the
  persisted snapshot columns (`convertedAmountMinor`,
  `convertedCurrency`). No live FX call in the read path
  (BR-ACC-12 carried).
- **User-timezone bucketing.** v1 aggregates by the UTC
  calendar month of `transactionDate`. The UI surfaces the
  month label as `"June 2026 (UTC)"`. A `User.timezone` field
  is a future additive migration.
- **Multi-user / shared dashboards.** v1 is single-user per
  BR-TX-4 carried.
- **Mobile app / push notifications.** Out of v1.
- **Production-quality UI.** The dashboard is smoke-minimal;
  a `transactions-ui` (or `reports-ui`) change adds
  design-system primitives, animations, accessibility audits.
- **Charts library.** The dashboard renders `<table>`s and
  simple `<div>`-based bar widths (CSS `width: %`). No
  recharts / chartjs / d3 dependency in v1.
- **Materialized aggregation tables.** v1 is lazy
  compute-on-read. A future change introduces
  `MonthlySummary` / `CategoryBreakdown` / `AccountFlow`
  Prisma models and the materializer subscribes to
  `TransactionRecorded`.

### Capability boundary

- `reports` owns the three read aggregates, the pure
  aggregation services, the `ReportsRepositoryPort`, the
  three query actions with Zod query-param validation, the
  three Hono routes, the no-op `TransactionRecorded`
  subscription, and the dashboard UI.
- `reports` reads through `TransactionRepositoryPort` (owned
  by `transactions`) and `AccountRepositoryPort` (owned by
  `accounts`, used by the flow endpoint to cross-check the
  account belongs to the user).
- `reports` consumes `FxRateProvider` (owned by `accounts`)
  via the future materializer's FX context; v1 ships zero FX
  calls in the read path.
- The dependency points from `reports` to `transactions` and
  `accounts` (read-only ports) — never the reverse,
  preserving the ports & adapters invariant.
- `reports` MUST NOT import from `fx` directly; it goes
  through the `FxRateProvider` port declared in `accounts`.
- `reports` MUST NOT write to any other module's data model.
  The module is strictly read-only; the only side effect is
  the dispatcher subscription (a no-op handler in v1).
- `reports` MUST have its own `_shared.ts` copy under
  `src/modules/reports/application/actions/_shared.ts` (per
  the modules-isolated rule in root `AGENTS.md` §10.5). No
  cross-module import from `transactions/application/actions/_shared.ts`.

## Entities

The spec is interface-level. The shapes below are part of the
contract that crosses the `reports` ↔ consumer boundary (UI,
`snapshots`).

### `MonthlySummary`

The per-month, per-currency rollup. One row per
`convertedCurrency` present in the user's transactions for
the requested month.

| Field                    | Type                       | Constraints                                                              |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------ |
| `userId`                 | `string` (cuid)            | Owner. Carried for traceability; the response omits it (session-scoped). |
| `year`                   | `number`                   | UTC calendar year. Integer. `2000..2100`.                               |
| `month`                  | `number`                   | UTC calendar month. Integer. `1..12`.                                    |
| `totalsByCurrency`       | `MonthlyTotalByCurrency[]` | One entry per `convertedCurrency`. Empty array when no rows in window.  |
| `accountCount`           | `number`                   | Distinct `accountId` count among the user's transactions in the month. ≥ 0. |
| `generatedAt`            | `DateTime`                 | `Clock.now()` at aggregate time. ISO-8601.                              |

`MonthlyTotalByCurrency`:

| Field            | Type             | Constraints                                                          |
| ---------------- | ---------------- | -------------------------------------------------------------------- |
| `currency`       | `AccountCurrency` | One of `{ ARS, USD, EUR }`.                                          |
| `inflowMinor`    | `Int`            | Sum of `convertedAmountMinor` for `direction = INCOME` in this currency. ≥ 0. |
| `outflowMinor`   | `Int`            | Sum of `convertedAmountMinor` for `direction = EXPENSE` in this currency. ≥ 0. |
| `netMinor`       | `Int`            | `inflowMinor - outflowMinor`. May be negative.                       |
| `txCount`        | `Int`            | Number of transactions in this currency for the month. ≥ 0.          |

Invariants:

- UTC bucketing: a transaction is in month M iff its
  `transactionDate` UTC components fall in `[year-M-01,
  year-(M+1)-01)` (BR-RPT-1 codifies Q1).
- One row per `convertedCurrency`, never per raw `currency`
  (BR-RPT-1).
- `generatedAt = Clock.now()` (no `new Date()` in domain
  code).

### `CategoryBreakdown`

The per-month, per-category rollup. One row per normalized
category per `convertedCurrency` present in the user's
transactions for the month.

| Field                    | Type                            | Constraints                                                            |
| ------------------------ | ------------------------------- | ---------------------------------------------------------------------- |
| `userId`                 | `string` (cuid)                 | Owner. Carried for traceability; the response omits it.                |
| `year`                   | `number`                        | UTC calendar year. `2000..2100`.                                       |
| `month`                  | `number`                        | UTC calendar month. `1..12`.                                           |
| `buckets`                | `CategoryBucket[]`              | Ordered by `amountMinor` DESC, then `categoryNormalized` ASC.          |
| `generatedAt`            | `DateTime`                      | `Clock.now()` at aggregate time. ISO-8601.                             |

`CategoryBucket`:

| Field                  | Type               | Constraints                                                                |
| ---------------------- | ------------------ | -------------------------------------------------------------------------- |
| `category`             | `string \| null`   | The raw category string from the `Transaction` row. Preserved verbatim.    |
| `categoryNormalized`   | `string`           | `lowercase + trim` of `category`; `null`/empty → `"uncategorized"`.        |
| `currency`             | `AccountCurrency`  | The `convertedCurrency` of the rows in this bucket.                       |
| `amountMinor`          | `Int`              | Sum of `convertedAmountMinor` in this bucket. May be negative (net of refunds). |
| `txCount`              | `Int`              | Number of transactions in this bucket. `> 0` (zero-count buckets are dropped). |

Invariants:

- A row's `category` and `categoryNormalized` are both
  present on the response. The raw string is preserved; the
  normalized string is derived (BR-RPT-2 codifies Q2).
- Buckets with `txCount === 0` are excluded.
- Sort: `amountMinor` DESC primary; `categoryNormalized`
  ASC secondary (deterministic tie-break).

### `AccountFlow`

The per-account daily flow rollup over a date range. One row
per UTC calendar day on which the user has at least one
transaction in the account within the range.

| Field                    | Type                | Constraints                                                                |
| ------------------------ | ------------------- | -------------------------------------------------------------------------- |
| `userId`                 | `string` (cuid)     | Owner. Carried for traceability; the response omits it.                    |
| `accountId`              | `string` (cuid)     | The account the flow is for. Must belong to the caller.                    |
| `fromDate`               | `DateTime`          | Inclusive lower bound. UTC `YYYY-MM-DD` parsed as `00:00:00Z`.            |
| `toDate`                 | `DateTime`          | Inclusive upper bound. UTC `YYYY-MM-DD` parsed as `23:59:59.999Z`.        |
| `points`                 | `AccountFlowPoint[]`| Ordered by `date` ASC.                                                     |
| `generatedAt`            | `DateTime`          | `Clock.now()` at aggregate time. ISO-8601.                                 |

`AccountFlowPoint`:

| Field                  | Type             | Constraints                                                          |
| ---------------------- | ---------------- | -------------------------------------------------------------------- |
| `date`                 | `string`         | UTC calendar day `YYYY-MM-DD` (date-only key, no time component).    |
| `runningBalanceMinor`  | `Int`            | Cumulative net of `convertedAmountMinor` across the range up to and including `date`. Sign: INCOME positive, EXPENSE negative. |
| `netMinor`             | `Int`            | Net change for `date` only (sum of `convertedAmountMinor` with sign from `direction`). |
| `txCount`              | `Int`            | Number of transactions on `date`. `> 0` (sparse days omitted).       |
| `currency`             | `AccountCurrency` | The `convertedCurrency` of the rows in this point.                   |

Invariants:

- Date key is `YYYY-MM-DD` in UTC. No time component
  (BR-RPT-3 codifies Q4).
- Sparse days (no transactions) are omitted from `points`
  (BR-RPT-3).
- `toDate - fromDate <= 366` days (BR-RPT-3).
- `fromDate <= toDate` (BR-RPT-3).
- The currency of every point equals the parent account's
  `convertedCurrency` for those rows. v1 assumes a single
  `convertedCurrency` per account; cross-currency mixes
  inside one account produce multiple points with different
  `currency` values.

## Business rules

The rules below are normative. Each rule has a stable ID for
traceability across spec, design, implementation, and tests.
The carried BRs are imported verbatim from
`openspec/specs/{accounts,transactions}/spec.md`.

### Carried from other capabilities

- **BR-ACC-12 (carried)** — Storage is never converted. The
  reports aggregates read the snapshot columns
  (`convertedAmountMinor`, `convertedCurrency`) and never call
  the FX provider in the read path. (Source:
  `openspec/specs/accounts/spec.md`,
  `openspec/specs/fx/spec.md:314-323`.)
- **BR-TX-4 (carried)** — Every cross-module reference to a
  transaction scopes to `userId`. The
  `ReportsRepositoryPort` mirrors the
  `TransactionRepositoryPort` invariant: every method takes
  `userId` first; no `findById(id)` API.
- **BR-TX-7 (carried)** — Hard-delete on `Transaction` is
  reflected in reports — a deleted transaction simply does not
  appear in the next aggregate. No tombstone; no recompute
  job.
- **BR-TX-9 (carried, adapted)** — The breakdown's category
  normalization is the factory's job: `lowercase + trim`.
  Null/empty categories collapse to `"uncategorized"`. Free-form
  strings are still free-form on write; the breakdown is the
  only place normalization happens.

### New (BR-RPT-N family)

- **BR-RPT-1 (NEW)** — The monthly summary endpoint returns
  one row per `convertedCurrency` in `totalsByCurrency`. A
  user with both ARS and USD accounts in a month gets two
  rows in the response; the UI shows ARS primary, USD
  secondary (no auto-conversion at read time). Raw `currency`
  is never the grouping key.
- **BR-RPT-2 (NEW)** — The category breakdown endpoint
  accepts `?year&month` and returns at most 100 buckets
  ordered by `amountMinor` DESC, then `categoryNormalized`
  ASC. Buckets with `txCount === 0` are excluded. The raw
  `category` string is preserved on every bucket alongside
  the normalized `categoryNormalized`.
- **BR-RPT-3 (NEW)** — The account flow endpoint accepts
  `?accountId&fromDate&toDate` with `fromDate <= toDate` and
  `toDate - fromDate <= 366` days. A wider range is rejected
  with `400 VALIDATION_ERROR`. Cross-user `accountId`
  returns `404 NOT_FOUND` (no information leakage). Date
  keys are `YYYY-MM-DD` UTC. Sparse days (no transactions)
  are omitted.
- **BR-RPT-4 (NEW)** — Cross-user report queries return
  `404 NOT_FOUND`, never `403 FORBIDDEN`. The 404 envelope
  is identical to a non-existent resource response, so an
  attacker cannot distinguish "not yours" from "doesn't
  exist" via status code.
- **BR-RPT-5 (NEW)** — The `reports` module ships a no-op
  handler subscribed to `TransactionRecorded` at composition
  time. The subscription is the future migration seam for
  event-driven materialization; v1 does not materialize
  anything. The composition-root test
  (`build-app-deps.test.ts`) MUST assert exactly one
  subscriber for `TransactionRecorded` after `buildAppDeps`
  runs. A missing subscribe MUST fail the test.

## Operations

The capability exposes three read operations through the
`ReportsRepositoryPort` and three Hono endpoints. Operations
are interface-level: they describe what MUST be true, not the
class names or file paths that implement them.

### `getMonthlySummary(userId, year, month)`

Returns the `MonthlySummaryDTO` for the caller's transactions
in the UTC calendar month `[year-month-01, year-(month+1)-01)`.
A user with no transactions in the window gets
`{ totalsByCurrency: [], accountCount: 0 }` and HTTP 200
(BR-RPT-1, REQ-RPT-1).

### `getCategoryBreakdown(userId, year, month)`

Returns the `CategoryBreakdownDTO` for the caller's
transactions in the UTC calendar month. Buckets are ordered
by `amountMinor` DESC, then `categoryNormalized` ASC
(BR-RPT-2, REQ-RPT-2). Cross-currency rows produce one bucket
per (category, currency) pair.

### `getAccountFlow(userId, accountId, fromDate, toDate)`

Returns the `AccountFlowDTO` for the caller's transactions on
`accountId` in the inclusive date range. The action
cross-checks the account belongs to the user; cross-user
returns `404 NOT_FOUND` (BR-RPT-4). Date keys are
`YYYY-MM-DD` UTC. Sparse days omitted (BR-RPT-3,
REQ-RPT-3). `fromDate > toDate` or a range > 366 days
returns `400 VALIDATION_ERROR`.

## Requirements

### Monthly summary

#### Requirement: monthly summary aggregates by convertedCurrency (REQ-RPT-1)

The system MUST return a `MonthlySummaryDTO` containing one
`MonthlyTotalByCurrency` row per `convertedCurrency` present
in the caller's transactions for the requested UTC month.
The system MUST group by `convertedCurrency`, never by raw
`currency`. The system MUST bucket transactions by the UTC
calendar month of `transactionDate` (BR-RPT-1, codifies Q1).
An empty month MUST return
`{ totalsByCurrency: [], accountCount: 0 }` and HTTP 200.
(Traces: BR-RPT-1, BR-ACC-12, BR-TX-4.)

#### Scenario: mixed-currency month returns one row per convertedCurrency

- GIVEN: the caller has 3 ARS transactions (`convertedCurrency = ARS`)
  AND 2 USD transactions (`convertedCurrency = USD`) in `2026-06` (UTC)
- WHEN: `GET /api/reports/monthly?year=2026&month=6` is called
- THEN: the response status is `200`
- AND: `totalsByCurrency` has 2 entries
- AND: one entry has `currency = "ARS"`, `inflowMinor`, `outflowMinor`,
  `netMinor`, `txCount: 3`
- AND: one entry has `currency = "USD"`, `inflowMinor`, `outflowMinor`,
  `netMinor`, `txCount: 2`

#### Scenario: empty month returns an empty totals array and accountCount zero

- GIVEN: the caller has zero transactions in `2026-06` (UTC)
- WHEN: `GET /api/reports/monthly?year=2026&month=6` is called
- THEN: the response status is `200`
- AND: `totalsByCurrency` is `[]`
- AND: `accountCount` is `0`
- AND: `generatedAt` is a non-null ISO-8601 timestamp

#### Scenario: cross-user transactions are excluded

- GIVEN: user A owns 3 transactions in `2026-06` (UTC)
- AND: user B owns 5 transactions in `2026-06` (UTC)
- WHEN: user A calls `GET /api/reports/monthly?year=2026&month=6`
- THEN: the response status is `200`
- AND: the totals reflect only user A's 3 transactions
- AND: user B's 5 transactions contribute zero to `inflowMinor`,
  `outflowMinor`, `netMinor`, or `txCount`

#### Scenario: invalid month returns 400

- GIVEN: any state
- WHEN: `GET /api/reports/monthly?year=2026&month=13` is called
- THEN: the response status is `400`
- AND: the response body's `error.code` is `VALIDATION_ERROR`

### Category breakdown

#### Requirement: category breakdown normalizes and sorts (REQ-RPT-2)

The system MUST return a `CategoryBreakdownDTO` whose buckets
are ordered by `amountMinor` DESC, then `categoryNormalized`
ASC. Each bucket MUST carry both `category` (the raw string
from the `Transaction` row) and `categoryNormalized`
(`lowercase + trim`; `null`/empty → `"uncategorized"`). The
system MUST NOT mutate the raw `category` on the row
(BR-RPT-2, codifies Q2). Buckets with `txCount === 0` MUST be
excluded. (Traces: BR-RPT-2, BR-TX-9.)

#### Scenario: mixed-case raw categories collapse to one normalized bucket

- GIVEN: the caller has 3 transactions with `category = "Food"`
  AND 2 transactions with `category = "food"`
- AND: 1 transaction with `category = "  FOOD  "`
- WHEN: `GET /api/reports/breakdown?year=2026&month=6` is called
- THEN: the response status is `200`
- AND: `buckets` has exactly 1 entry with `categoryNormalized = "food"`
- AND: the entry's `txCount` is `6`
- AND: the entry's `amountMinor` is the sum of all 6
  `convertedAmountMinor` values
- AND: the entry's `category` is one of the raw strings
  (the first observed value is acceptable; the spec does
  not require a specific raw value)

#### Scenario: null and empty categories collapse to "uncategorized"

- GIVEN: the caller has 1 transaction with `category = null`
  AND 1 transaction with `category = ""`
- AND: 1 transaction with `category = "   "` (whitespace only)
- WHEN: `GET /api/reports/breakdown?year=2026&month=6` is called
- THEN: the response status is `200`
- AND: `buckets` has exactly 1 entry with `categoryNormalized = "uncategorized"`
- AND: the entry's `txCount` is `3`

#### Scenario: buckets are sorted by amountMinor DESC then categoryNormalized ASC

- GIVEN: the caller has transactions in 3 categories in `2026-06`
  with normalized amounts (Food=10000, Rent=30000, Other=5000)
- WHEN: `GET /api/reports/breakdown?year=2026&month=6` is called
- THEN: `buckets[0].categoryNormalized` is `"rent"` (amountMinor 30000)
- AND: `buckets[1].categoryNormalized` is `"food"` (amountMinor 10000)
- AND: `buckets[2].categoryNormalized` is `"other"` (amountMinor 5000)

#### Scenario: cross-user transactions are excluded

- GIVEN: user A has 1 transaction in `category = "Food"` in `2026-06`
- AND: user B has 1 transaction in `category = "Food"` in `2026-06`
- WHEN: user A calls `GET /api/reports/breakdown?year=2026&month=6`
- THEN: the response status is `200`
- AND: `buckets[0].txCount` is `1` (user A only)
- AND: user B's transaction contributes zero to `amountMinor` or `txCount`

### Account flow

#### Requirement: account flow emits one point per non-empty UTC day (REQ-RPT-3)

The system MUST return an `AccountFlowDTO` whose `points`
array contains one entry per UTC calendar day on which the
caller has at least one transaction in the account, ordered
by `date` ASC. The `date` key MUST be `YYYY-MM-DD` in UTC.
Days with zero transactions MUST NOT appear in the array
(sparse representation; BR-RPT-3, codifies Q4). The endpoint
MUST reject `fromDate > toDate` or `toDate - fromDate > 366`
days with `400 VALIDATION_ERROR`. The endpoint MUST reject
an `accountId` not owned by the caller with `404 NOT_FOUND`.
(Traces: BR-RPT-3, BR-RPT-4, BR-TX-4.)

#### Scenario: contiguous activity emits one point per UTC day

- GIVEN: the caller owns account `A`
- AND: transactions exist on `A` for `2026-06-01`, `2026-06-02`,
  `2026-06-03` (UTC)
- WHEN: `GET /api/reports/accounts/A/flow?fromDate=2026-06-01&toDate=2026-06-30` is called
- THEN: the response status is `200`
- AND: `points` has 3 entries
- AND: `points[0].date` is `"2026-06-01"`
- AND: `points[1].date` is `"2026-06-02"`
- AND: `points[2].date` is `"2026-06-03"`
- AND: `points[2].runningBalanceMinor` equals
  `points[0].netMinor + points[1].netMinor + points[2].netMinor`

#### Scenario: sparse days are omitted

- GIVEN: the caller owns account `A`
- AND: transactions exist on `A` for `2026-06-01` and `2026-06-03`
  (no transaction on `2026-06-02`)
- WHEN: `GET /api/reports/accounts/A/flow?fromDate=2026-06-01&toDate=2026-06-30` is called
- THEN: `points` has exactly 2 entries
- AND: `points[0].date` is `"2026-06-01"`
- AND: `points[1].date` is `"2026-06-03"`
- AND: the response does NOT contain a `"2026-06-02"` entry

#### Scenario: cross-user accountId returns 404

- GIVEN: user A owns account `A`
- AND: user B owns account `B`
- WHEN: user A calls
  `GET /api/reports/accounts/B/flow?fromDate=2026-06-01&toDate=2026-06-30`
- THEN: the response status is `404`
- AND: the response body's `error.code` is `NOT_FOUND`
- AND: the response body does NOT distinguish "not yours" from
  "doesn't exist"

#### Scenario: date range wider than 366 days returns 400

- GIVEN: any state
- WHEN:
  `GET /api/reports/accounts/A/flow?fromDate=2026-01-01&toDate=2027-01-02`
  is called (367 days)
- THEN: the response status is `400`
- AND: the response body's `error.code` is `VALIDATION_ERROR`

### Authorization and access control

#### Requirement: every read scopes to the session user (REQ-RPT-4)

Every endpoint under `/api/reports/*` MUST require an
authenticated session resolved via `auth()` from
`src/modules/auth/index.ts`. The system MUST derive `userId`
from the session and MUST NOT trust any `userId` in request
bodies. Every cross-module reference to a `Transaction` or
`FinancialAccount` row MUST scope to `userId`. Cross-user
reads MUST return `404 NOT_FOUND`, never `403 FORBIDDEN`,
so the response cannot be used to infer whether a resource
exists. (Traces: BR-RPT-4, BR-TX-4, `auth/spec.md`
cross-module invariant.)

#### Scenario: 401 on every endpoint when no session

- GIVEN: no `authjs.session-token` cookie
- WHEN: any of the three endpoints is called
- THEN: the response status is `401`
- AND: no data is returned

#### Scenario: cross-user account read returns 404 (not 403)

- GIVEN: user A owns account `A`; user B owns account `B`
- WHEN: user A calls
  `GET /api/reports/accounts/B/flow?fromDate=2026-06-01&toDate=2026-06-30`
- THEN: the response status is `404` (never `403`)
- AND: the response body's `error.code` is `NOT_FOUND`
- AND: the response body does NOT expose the account's
  existence, owner, or any account field

#### Scenario: port contract requires userId as the first argument

- GIVEN: the `ReportsRepositoryPort` interface declares
  `listForMonthly(userId, { year, month })` and the analogous
  signatures for breakdown and flow
- WHEN: a compile-time check (e.g. a port contract test in
  `reports.repository.port.test.ts`) inspects every method
- THEN: every method's first parameter is `userId`
- AND: no method has a `findById(id)` signature without
  `userId`

### Validation

#### Requirement: every query parameter is Zod-validated (REQ-RPT-5)

Every endpoint MUST validate its query parameters with a
Zod schema before any domain code runs. `year` MUST be an
integer in `2000..2100`. `month` MUST be an integer in
`1..12`. `accountId` MUST be a UUID v4 string. `fromDate`
and `toDate` MUST match `^\d{4}-\d{2}-\d{2}$` (ISO date
key, UTC). Any validation failure MUST return `400` with the
standard error envelope: `{ error: { code: "VALIDATION_ERROR",
message, details? } }`. (Traces: BR-RPT-3, project-wide
Zod-at-the-boundary invariant.)

#### Scenario: malformed month returns 400 with field-level details

- GIVEN: any state
- WHEN: `GET /api/reports/monthly?year=2026&month=june` is called
- THEN: the response status is `400`
- AND: the response body's `error.code` is `VALIDATION_ERROR`
- AND: the response body's `error.details` includes a
  field-level entry for `month`

#### Scenario: malformed accountId returns 400

- GIVEN: any state
- WHEN: `GET /api/reports/accounts/not-a-uuid/flow?fromDate=2026-06-01&toDate=2026-06-30`
  is called
- THEN: the response status is `400`
- AND: the response body's `error.code` is `VALIDATION_ERROR`

#### Scenario: malformed date keys return 400

- GIVEN: any state
- WHEN:
  `GET /api/reports/accounts/A/flow?fromDate=06-01-2026&toDate=06-30-2026`
  is called (US-style date format)
- THEN: the response status is `400`
- AND: the response body's `error.code` is `VALIDATION_ERROR`
- AND: `error.details` includes entries for `fromDate` and
  `toDate`

### Multi-currency semantics

#### Requirement: aggregates group by convertedCurrency, never raw currency (REQ-RPT-6)

The monthly summary, the category breakdown, and the account
flow MUST group totals by the persisted `convertedCurrency`
snapshot column. The system MUST NOT group by raw `currency`
(BR-RPT-1). A single month containing both ARS and USD rows
MUST produce multiple result rows (one per `convertedCurrency`
in the summary; one per `(category, convertedCurrency)` pair
in the breakdown; one per `convertedCurrency` per day in the
flow). The system MUST NOT convert currencies at read time;
the FX snapshot is the source of truth. (Traces: BR-RPT-1,
BR-ACC-12.)

#### Scenario: mixed-currency month produces multiple totals rows

- GIVEN: the caller has 1 ARS expense (`convertedAmountMinor = 1000`,
  `convertedCurrency = ARS`) and 1 USD expense
  (`convertedAmountMinor = 500`, `convertedCurrency = USD`) in
  `2026-06`
- WHEN: `GET /api/reports/monthly?year=2026&month=6` is called
- THEN: `totalsByCurrency` has 2 entries (ARS and USD)
- AND: the ARS entry's `outflowMinor` is `1000` and `txCount` is `1`
- AND: the USD entry's `outflowMinor` is `500` and `txCount` is `1`
- AND: no automatic currency conversion happens at read time

### Event-driven seam

#### Requirement: composition root subscribes a no-op TransactionRecorded handler (REQ-RPT-7)

The composition root in `src/composition/build-app-deps.ts`
MUST call `dispatcher.subscribe('TransactionRecorded',
noopHandler)` exactly once during `buildAppDeps()` execution.
The handler is a typed stub that logs at `debug` and returns.
The call exists to validate the seam at boot: if the
dispatcher signature changes, the composition root MUST fail
to compile. The composition-root test
(`src/composition/build-app-deps.test.ts`) MUST assert that
exactly one subscriber exists for `TransactionRecorded` after
`buildAppDeps` returns. (Traces: BR-RPT-5.)

#### Scenario: composition-root boot registers the no-op handler

- GIVEN: a fresh `EventDispatcher` with no subscribers
- WHEN: `buildAppDeps()` is invoked
- THEN: `dispatcher.subscriberCount('TransactionRecorded')` is `1`
- AND: invoking the subscriber with a sample
  `TransactionRecorded` payload returns without throwing
- AND: the handler's effect (if any) is limited to a single
  `debug`-level log line

## Error semantics

No new error codes are introduced. Reports failures reuse the
existing enum at `src/shared/errors/error-codes.ts`. The
mapping is normative.

| Code                | HTTP | Trigger                                                                | Caller surface                                                            |
| ------------------- | ---- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `VALIDATION_ERROR`  | 400  | Any Zod schema failure (`month` out of range, `accountId` not UUID v4, `fromDate > toDate`, range > 366 days, malformed date key). | Inline error banner on the dashboard; first message from `error.details`. |
| `NOT_FOUND`         | 404  | Cross-user `accountId` on the flow endpoint. Identical envelope to a non-existent resource. | Empty-state CTA on the dashboard.                                         |
| `UNAUTHORIZED`      | 401  | No session, missing cookie, expired session, or unknown user (per `auth/spec.md`). | 307 redirect for App Router pages; 401 JSON for Hono.                     |

The system MUST NOT include stack traces, Prisma error
objects, or request bodies in any error response.

## Migration

No Prisma migration. `reports` is a read-only consumer of
the `Transaction` and `FinancialAccount` rows that already
exist. The Prisma schema is unchanged. No data backfill is
required. The schema gate asserted by `sdd-verify` is
`SELECT count(*) FROM "Transaction"` and
`SELECT count(*) FROM "FinancialAccount"` before and after
the change returning the same values.

## Cross-references

- **Proposal**: `openspec/changes/reports/proposal.md` —
  the upstream change that created this capability. BR-RPT-1
  to BR-RPT-5 and the carried BRs are codified here; the
  proposal carries the rationale, the alternatives
  considered, and the forecast.
- **Transactions spec**: `openspec/specs/transactions/spec.md`
  — REQ-TX-13 declares the `TransactionRecorded` event whose
  no-op subscription is wired by REQ-RPT-7. The
  `TransactionRepositoryPort` is the only input the reports
  aggregates consume (REQ-TX-8). The `TransactionDTO`
  snapshot columns (`convertedAmountMinor`,
  `convertedCurrency`) are the deterministic totals source
  (BR-ACC-12).
- **Accounts spec**: `openspec/specs/accounts/spec.md` —
  BR-ACC-12 declares the display-only FX contract that
  `reports` carries (no read-time FX). The flow endpoint
  cross-checks the parent account via `AccountRepositoryPort`.
- **FX spec**: `openspec/specs/fx/spec.md` — REQ-FX-3
  declares the casa-resolution-is-the-caller's-responsibility
  invariant; the future materializer will reuse it. v1 ships
  zero FX calls.
- **Auth spec**: `openspec/specs/auth/spec.md` — the
  `auth()` server-side helper invariant (cross-module
  contracts §"auth() server-side helper") and the "every
  other module's `WHERE userId = ?` query MUST scope to the
  caller" rule. The `reports` capability follows this
  invariant on every endpoint.
- **Transactions delta**:
  `openspec/changes/transactions/specs/transactions/spec.md`
  — the source of REQ-TX-13 and the
  `TransactionRepositoryPort`.
- **Events dispatcher**: `src/shared/events/event-dispatcher.ts`
  — the `TransactionRecorded` union member already exists
  (REQ-TX-13). The no-op subscription is a runtime wiring,
  not a type-level change.
- **Port interface (stable input)**:
  `src/modules/transactions/domain/interfaces/transaction.repository.port.ts`
  — the interface `ReportsRepositoryPort` consumes unchanged.
- **External services**: none. The read path never reaches an
  external service. The future materializer will reuse the
  existing `FxRateProvider` (DolarAPI), but v1 ships zero
  FX calls.

## History

- **2026-06-26 (v1)** — first write. Created by the
  `reports` change. Closes the 5 open questions (Q1-Q5)
  locked at pre-spec session: Q1 UTC bucketing (codified in
  BR-RPT-1 / REQ-RPT-1); Q2 lowercase + trim normalization
  with `null`/empty → `"uncategorized"` (codified in
  BR-RPT-2 / REQ-RPT-2); Q3 one row per `convertedCurrency`
  (codified in BR-RPT-1 / REQ-RPT-6); Q4 daily granularity
  with `YYYY-MM-DD` UTC date keys and sparse-day omission
  (codified in BR-RPT-3 / REQ-RPT-3); Q5 three empty cards +
  CTA on the dashboard (codified in REQ-RPT-4 cross-user
  scenario + the dashboard page's empty-state branch).
  Scope: lazy compute-on-read aggregates over the
  `Transaction` rows; no Prisma migration; no new error
  codes; no FX calls in the read path; composition-root
  wires the no-op `TransactionRecorded` subscription.

## References

- `openspec/changes/reports/proposal.md` — proposal v1
  (2026-06-26) with BR-RPT-1 to BR-RPT-5.
- `openspec/changes/reports/explore.md` — upstream research
  (5 open questions locked at pre-spec session).
- `openspec/specs/transactions/spec.md` — canonical
  `transactions` capability; REQ-TX-13 (event), REQ-TX-8
  (list endpoint), BR-TX-4 (userId scoping), BR-TX-7
  (hard-delete).
- `openspec/specs/accounts/spec.md` — canonical `accounts`
  capability; BR-ACC-12 (display-only FX).
- `openspec/specs/fx/spec.md` — canonical `fx` capability;
  REQ-FX-3 (casa resolution).
- `openspec/specs/auth/spec.md` — canonical `auth`
  capability; `auth()` helper invariant, userId scoping.
- `src/shared/events/event-dispatcher.ts` —
  `TransactionRecorded` in the `DomainEvent` union.
- `src/shared/clock/clock.port.ts` — `Clock.now()` used by
  every aggregate factory for `generatedAt`.
- `openspec/config.yaml` — strict TDD rules; `pnpm test`
  runner.
- `AGENTS.md` (root) — §5.3 `pnpm-lock.yaml` policy; §13
  dual-language docs mirror policy; §10.5 modules-isolated
  rule.
