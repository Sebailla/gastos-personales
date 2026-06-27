# Proposal — `reports`

**Status**: draft · **Author**: Sebastián Illa
**Created**: 2026-06-26 · **Target slice**: MVP-3 (aggregation surface)
**Upstream**: `openspec/AGENTS.md` (project lifecycle) · `openspec/config.yaml` (`reports` capability slot reserved; strict TDD; auto-forecast, 400 lines)
**Upstream**: global SDD preflight (interactive, both, auto-forecast, 400 lines; review budget 400)
**Upstream**: project contract (root `AGENTS.md` §2, §4.7, §5.4, §13; `openspec/AGENTS.md` author/dependencies)

> First write of the `reports` proposal. The change introduces the
> **aggregation surface**: read-only consumer of `Transaction` rows that
> returns monthly summaries, category breakdowns, and per-account flow
> to a single `app/dashboard` page. **v1 ships lazy compute-on-read** —
> every aggregation runs in-memory at query time. The
> `TransactionRecorded` event seam is wired at composition time with a
> no-op handler so the future event-driven materialization migration
> is non-breaking (see [Snapshot strategy](#snapshot-strategy)). The
> module is `src/modules/reports/`, following the
> `src/modules/transactions/` shape (domain / application /
> infrastructure; ports & adapters; minimal public barrel).

## Why

`auth-foundation`, `accounts-ledger`, `fx-cache`, and `transactions`
all shipped full CRUD with smoke UIs but **no aggregation surface**.
The personal-finance product gap is concrete: the user can record
expenses, but they cannot see what they spent last month, what their
top categories were, or how an account's balance evolved over time.

Three seam-level signals confirm the change is ready to ship now:

1. **The events seam is begging for a consumer.** The
   `TransactionRecorded` union member was added in
   `transactions` (REQ-TX-13, BR-TX-11) with the explicit contract
   that _"future `reports` and `snapshots` consumers can subscribe
   without an interface change"_ (`src/shared/events/event-dispatcher.ts:21-39`).
   The union membership is the contract — a `reports` module ships
   without touching the event-dispatcher file at all.
2. **The read seam is stable.** The
   `TransactionRepositoryPort.list(userId, { cursor, limit,
accountId? })` (REQ-TX-8) is the only input reports needs.
   Pagination + per-account filtering are already implemented; the
   `TransactionDTO` shape (`convertedAmountMinor`,
   `convertedCurrency`, `fxAsOfSnapshot`, `casaSnapshot`) is the
   deterministic totals source — BR-ACC-12 carried.
3. **The product surface is the empty placeholder.** `app/page.tsx`
   still renders _"Auth foundation ready. The application surface
   ships in Slice B."_ There is no `/dashboard` route. The user has
   a recording tool with no consumption tool.

The downstream consequences (deferred, named here for traceability):
`snapshots` (net-worth-over-time) will reuse the same lazy-aggregate
pattern with a different shape; `transactions-ui` (production UI) will
reuse the dashboard's presentational components with the form slice
added on top.

## What

The change ships **four chained slices**, each a self-contained PR
targeting `develop` and gating on the prior slice merging:

### Slice 1 — `reports-domain` (PR #1)

- **New module skeleton** at `src/modules/reports/` mirroring
  `src/modules/transactions/`:
  - `domain/entities/monthly-summary.ts` — aggregate:
    `{ userId, year, month, totalsByCurrency: { currency,
inflowMinor, outflowMinor, netMinor, txCount }[], generatedAt }`.
    Pure factory + Zod input schema + invariants (no negative
    magnitudes; `currency` is one of the `AccountCurrency` enum).
  - `domain/entities/category-breakdown.ts` — aggregate:
    `{ userId, year, month, buckets: { category: string,
amountMinor: number, currency: AccountCurrency, txCount }[],
generatedAt }`. Category normalization is the factory's job:
    lowercase + trim; null/empty → `"uncategorized"`.
  - `domain/entities/account-flow.ts` — aggregate:
    `{ userId, accountId, fromDate, toDate, points: { date,
inflowMinor, outflowMinor, netMinor, currency:
AccountCurrency }[], generatedAt }`. Daily granularity.
  - `domain/services/` — pure aggregation functions:
    `computeMonthlySummary`, `computeCategoryBreakdown`,
    `computeAccountFlow`. Each takes `(rows: Transaction[],
filters: {...})` and returns the aggregate. Zero I/O; the
    service is a function, not a class.
  - `domain/interfaces/reports.repository.port.ts` — port
    declaring the read methods (`listForMonthly`,
    `listForBreakdown`, `listForFlow`); each takes `userId` as the
    first argument (cross-user isolation, BR-TX-4 carried).
  - `domain/interfaces/report-subscriber.port.ts` — port for the
    future event-driven materializer (no-op in v1; the seam is
    declared so the spec can lock the contract).
  - `domain/index.ts` — minimal public barrel: entities, port
    interfaces, service functions. No infrastructure exports
    (`accounts/index.ts:27-64` precedent).
- **Tests**:
  - `monthly-summary.test.ts` — invariants, factory error paths,
    multi-currency rollup, empty input.
  - `category-breakdown.test.ts` — normalization, sorting, empty
    input, null-category bucketing.
  - `account-flow.test.ts` — daily bucketing across month
    boundaries, single-day case, empty input, currency mix.
  - `reports.repository.port.test.ts` — compile-time contract
    assertion (mirrors `transaction.repository.port.test.ts`).
- **No new Prisma model.** v1 reads `Transaction` rows through the
  existing `TransactionRepositoryPort`; no schema change.
- **No new error codes.** Domain failures (`InvalidMonthError`,
  `InvalidDateRangeError`) inherit from a local
  `ReportsDomainError` base and map to `VALIDATION_ERROR` at the
  wire (mirrors `transactions` action-layer mapping).

### Slice 2 — `reports-application` (PR #2)

- **Application layer** at `src/modules/reports/application/`:
  - `actions/get-monthly-summary.action.ts`,
    `actions/get-category-breakdown.action.ts`,
    `actions/get-account-flow.action.ts` — three read actions,
    each with Zod query-param validation (`?year=YYYY&month=MM` or
    `?fromDate=...&toDate=...`).
  - `actions/_shared.ts` — local mirror of the
    `transactions/application/actions/_shared.ts` pattern
    (`ActionResult<T>`, `zodErrorToActionError`,
    `domainErrorToActionError`, `ReportsActionDeps` bag). Per the
    modules-isolated rule (root `AGENTS.md` §10.5), the new file
    has its own `_shared.ts` copy — no cross-module import.
  - `dto/` — DTOs matching the domain aggregates with ISO-8601
    timestamps.
  - `validation/` — three Zod schemas:
    `monthly-summary-query.schema.ts` (`{ year: 2000-2100, month:
1-12 }`), `category-breakdown-query.schema.ts` (same shape),
    `account-flow-query.schema.ts` (`{ accountId: cuid,
fromDate: ISO date, toDate: ISO date, fromDate <= toDate }`).
  - `fixtures/reports.repository.inmemory.ts` — InMemory port
    implementation backed by an injected `TransactionRepositoryPort`
    fixture (the **reports in-memory fixture composition reuses the
    `transactions` InMemory fixture's `seed()` helper** — see the
    project's in-memory pattern at
    `src/modules/transactions/application/fixtures/`).
- **Tests**:
  - `get-monthly-summary.action.test.ts` — empty state, single
    month, multi-currency, cross-user isolation (user A's rows
    never bleed into user B's aggregate).
  - `get-category-breakdown.action.test.ts` — normalization
    (`"Food"` and `"food"` collapse), multi-currency case.
  - `get-account-flow.action.test.ts` — daily bucketing, date
    range validation, cross-user isolation.

### Slice 3 — `reports-routes` (PR #3)

- **Hono routes** mounted on `protectedApp`:
  | Method | Path | Behavior |
  |---|---|---|
  | `GET` | `/api/reports/monthly` | `?year&month` → `MonthlySummaryDTO`. 200 + `{ data }`; 400 `VALIDATION_ERROR` on bad query. |
  | `GET` | `/api/reports/breakdown` | `?year&month` → `CategoryBreakdownDTO`. Same error envelope. |
  | `GET` | `/api/reports/accounts/:id/flow` | `?fromDate&toDate` → `AccountFlowDTO`. 404 `NOT_FOUND` on cross-user account; 400 on `fromDate > toDate`. |
- **Route file** `src/modules/reports/application/routes.ts`
  exporting `mountReportsRoutes(protectedApp, deps)`. The
  composition root in `src/composition/create-hono-app.ts` adds
  one `mountReportsRoutes(protectedApp, { reportsDeps:
deps.reportsDeps })` call after the transactions mount, before
  the sub-app is mounted on `/`.
- **DI wiring** in `src/composition/build-app-deps.ts`:
  - New `ReportsActionDeps` interface (parallel to
    `TransactionActionDeps`).
  - New `buildReportsDeps(...)` factory mirroring
    `buildTransactionDeps` (consumes the SAME `fxRateProvider`
    instance for the future event-driven path's FX context; no
    FX calls in v1).
  - `buildAppDeps()` returns `reportsDeps` in the bag.
- **Event-driven seam wiring (v1 no-op)**:
  `buildReportsDeps` calls `dispatcher.subscribe('TransactionRecorded',
noopHandler)`. The `noopHandler` is a typed stub that logs at
  `debug` and returns. **The call exists to validate the seam at
  boot** — if the dispatcher signature changes, the composition
  root fails to compile. The handler becomes a real materializer
  in a future change.
- **Tests**:
  - `src/modules/reports/application/routes.test.ts` — three
    routes against in-memory deps; 200 + payload shape, 400 on
    bad query, 401 on no session, 404 on cross-user account.
  - `src/composition/build-app-deps.test.ts` gains a parallel
    assertion: `reportsDeps` is present and the dispatcher has
    exactly one subscriber for `TransactionRecorded`.

### Slice 4 — `dashboard-ui` (PR #4)

- **New page** `app/dashboard/page.tsx` — Server Component that
  resolves the session via `auth()`, calls the three reports
  endpoints in parallel, and renders the three presentational
  components below. Header comment `// smoke-minimal, not
production` (same convention as the transactions pages).
  Empty state renders three empty cards + a CTA to
  `/transactions/new`.
- **Presentational components** at
  `app/_components/dashboard-{monthly-summary,category-breakdown,
account-flow}.tsx`. Each is a pure Server Component (no
  client hooks, no `'use client'` directive). Tailwind v4 tokens
  via the project's existing class table; no new color or
  spacing tokens.
- **Type definitions** at `app/_lib/report-types.ts` mirroring
  `app/_lib/transaction-types.ts`. The `formatMinor` helper at
  `app/_lib/format-minor.ts` is reused; no new formatter.
- **No new layout, no new global CSS.** The dashboard reuses
  `app/layout.tsx` and the existing `globals.css`.
- **Tests**: minimal Vitest coverage of the presentational
  components (rendering an empty state, rendering with seeded
  data); the integration path is the manual smoke check via
  `pnpm dev`.

## Out of scope (this change)

- **Exports** (CSV, PDF, JSON download). A `GET /api/reports/export`
  endpoint is a v1.1 candidate. The dashboard page is read-only
  display.
- **Budget rules / spending limits.** A future `budgets` capability
  consumes the `MonthlySummary` aggregate and adds limit tracking;
  not in v1.
- **Forecasting.** Trend lines, predictions, anomaly detection.
  Strictly out of v1 — no ML, no statistical analysis.
- **Real-time streaming.** WebSockets, SSE, live-reload on
  `TransactionRecorded`. v1 is request/response; the event
  subscription is a no-op seam.
- **Currency conversion at read time.** All aggregates use the
  persisted snapshot columns (`convertedAmountMinor`,
  `convertedCurrency`). No live FX call in the read path
  (BR-ACC-12 carried).
- **User-timezone bucketing.** v1 aggregates by the UTC calendar
  month of `transactionDate`. A `User.timezone` field is a future
  additive migration (the spec codifies the v1 simplification and
  flags it for user feedback).
- **Multi-user / shared dashboards.** v1 is single-user per
  `BR-TX-4` carried.
- **Mobile app / push notifications.** Out of v1.
- **Production-quality UI.** The dashboard is smoke-minimal; a
  `reports-ui` (or `transactions-ui`) change adds design-system
  primitives, animations, accessibility audits.
- **Charts library.** The dashboard renders `<table>`s and
  simple `<div>`-based bar widths (CSS `width: %`). No
  recharts / chartjs / d3 dependency in v1. A future change
  introduces the chart library once the UX direction is locked.

## Non-goals

- **Not a write surface.** `reports` never persists; it only reads.
  The only side effect is the dispatcher subscription (a no-op
  handler in v1).
- **Not a new FX provider.** `reports` reuses the existing
  `FxRateProvider` for the future materializer's FX context
  (v1 ships zero FX calls in the read path).
- **Not a new auth model.** Every endpoint scopes to `userId` from
  the session; no row-level security.
- **Not a new HTTP framework.** Hono catch-all at
  `app/api/[...path]/route.ts:7-25` is extended, not replaced.
- **Not a new database.** No new Prisma model; reads go through
  the existing `TransactionRepositoryPort`.
- **Not a new migration framework.** No `prisma/migrations` entry
  in v1.
- **Not a re-architecture of `transactions`.** The reports port
  reads the existing `TransactionRepositoryPort`; no changes to
  `src/modules/transactions/`.

## Users and situations

| User                       | Situation                                                                                                                             | Touchpoint                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Authenticated user         | Opens `/dashboard` to see this month's totals. Sees `MonthlySummaryCard` with inflow/outbreak/net per currency.                       | `app/dashboard/page.tsx` + `GET /api/reports/monthly`                   |
| Authenticated user         | Scrolls to the breakdown to find their top spending category. Sees `CategoryBreakdownTable` ordered by amount DESC.                   | `GET /api/reports/breakdown`                                            |
| Authenticated user         | Picks a bank account on the dashboard to see daily flow. Navigates to `/accounts/:id` → sees `AccountFlowChart` for the last 30 days. | `GET /api/reports/accounts/:id/flow?fromDate&toDate`                    |
| New user (no transactions) | Opens `/dashboard`. Sees three empty cards + a "Record your first transaction" CTA linking to `/transactions/new`.                    | Empty-state branch in `app/dashboard/page.tsx`                          |
| Future `snapshots` author  | Subscribes to `MonthlySummary`'s aggregate for net-worth-over-time.                                                                   | `src/modules/reports/domain/entities/monthly-summary.ts` (stable input) |

## Business rules

The change carries the existing `accounts`, `fx`, and `transactions`
BRs verbatim and adds one new BR family (`BR-RPT-N`) for the
aggregates and the read path. The spec phase writes the full
Scenarios.

1. **BR-ACC-12 (carried).** Storage is never converted. The reports
   aggregates read the snapshot columns (`convertedAmountMinor`,
   `convertedCurrency`) and never call the FX provider in the read
   path.
2. **BR-TX-4 (carried).** Every cross-module reference scopes to
   `userId`. The `ReportsRepositoryPort` mirrors the
   `TransactionRepositoryPort` invariant: every method takes
   `userId` first; no `findById(id)` API.
3. **BR-TX-7 (carried).** Hard-delete on `Transaction` is reflected
   in reports — a deleted transaction simply does not appear in the
   next aggregate. No tombstone; no recompute job.
4. **BR-TX-9 (carried, adapted).** The breakdown's category
   normalization is the factory's job: lowercase + trim.
   Null/empty categories collapse to `"uncategorized"`. Free-form
   strings are still free-form on write; the breakdown is the only
   place normalization happens.
5. **BR-RPT-1 (NEW).** The monthly summary endpoint returns one row
   per `convertedCurrency` in `totalsByCurrency`. A user with ARS +
   USD accounts gets two rows in the response; the UI shows ARS
   primary, USD secondary (no auto-conversion at read time).
6. **BR-RPT-2 (NEW).** The category breakdown endpoint accepts
   `?year&month` and returns at most 100 buckets ordered by
   `amountMinor` DESC. Buckets with `txCount === 0` are excluded.
7. **BR-RPT-3 (NEW).** The account flow endpoint accepts
   `?accountId&fromDate&toDate` with `fromDate <= toDate` and
   `toDate - fromDate <= 366 days`. A wider range is rejected with
   `400 VALIDATION_ERROR`. Cross-user `accountId` returns
   `404 NOT_FOUND` (no information leakage).
8. **BR-RPT-4 (NEW).** The dashboard renders only the surface the
   user has data for. A user with one transaction in ARS gets an
   ARS-only summary; the USD section renders a "No USD transactions
   this month" empty state (no crash, no broken layout).
9. **BR-RPT-5 (NEW).** The `reports` module ships a no-op handler
   subscribed to `TransactionRecorded` at composition time. The
   subscription is the future migration seam; v1 does not
   materialize anything.

## Affected areas

| Area                                                                                        | Impact          | Description                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/modules/reports/`                                                                      | New             | New module mirroring `src/modules/transactions/` shape. Domain / application / infrastructure; ports & adapters; minimal public barrel.                      |
| `src/composition/build-app-deps.ts`                                                         | Modified        | Adds `ReportsActionDeps` interface + `buildReportsDeps()` factory + `reportsDeps` field in `HonoAppDeps`. Subscribes `noopHandler` to `TransactionRecorded`. |
| `src/composition/create-hono-app.ts`                                                        | Modified        | Mounts `mountReportsRoutes(protectedApp, { reportsDeps: deps.reportsDeps })` after the transactions mount.                                                   |
| `src/shared/events/event-dispatcher.ts`                                                     | None            | The `TransactionRecorded` union member already exists (REQ-TX-13). No file change.                                                                           |
| `prisma/schema.prisma`                                                                      | None            | No new model. Reads go through `TransactionRepositoryPort`.                                                                                                  |
| `app/dashboard/page.tsx`                                                                    | New             | Server Component shell; calls the three reports endpoints in parallel.                                                                                       |
| `app/_components/dashboard-*.tsx`                                                           | New             | Three presentational Server Components (pure render).                                                                                                        |
| `app/_lib/report-types.ts`                                                                  | New             | DTO mirrors for the three endpoints.                                                                                                                         |
| `openspec/specs/reports/spec.md`                                                            | New (canonical) | Created by `sdd-archive` from the delta spec. Already reserved in `openspec/config.yaml:14`.                                                                 |
| `openspec/changes/reports/{specs,design,tasks,apply-progress,verify-report,sync-report}.md` | New (per phase) | Each SDD phase writes its artifact in the change folder.                                                                                                     |
| `Documents-es/openspec/changes/reports/proposal.md`                                         | New             | Spanish mirror of this file. Same commit per root `AGENTS.md` §13.3.                                                                                         |

## Acceptance (evidence the reviewer will see)

1. `pnpm test` runs the new `reports` suite and exits 0 with **≥ 80%
   coverage on `src/modules/reports/**`** (domain + application
layers; mirrors the `transactions` bar).
2. `pnpm dev` → sign in → visit `/dashboard` with 3 transactions in
   ARS + 2 in USD across 2 accounts. The summary card shows two
   rows (ARS primary, USD secondary). The breakdown table shows the
   top 3 categories by amount. The account flow card is empty (no
   `?accountId` selected yet — the v1 dashboard does not deep-link
   to a specific account).
3. A user with zero transactions visits `/dashboard`. The page
   renders three empty cards + a "Record your first transaction"
   CTA. No crash. No broken footer.
4. `GET /api/reports/monthly?year=2026&month=13` returns
   `400 VALIDATION_ERROR`.
5. `GET /api/reports/monthly?year=2026&month=06` for user A returns
   only user A's transactions. User B's rows do not appear
   (cross-user isolation, BR-TX-4 carried).
6. `GET /api/reports/accounts/<user-B-account>/flow?fromDate=...&toDate=...`
   for user A returns `404 NOT_FOUND` (no information leakage).
7. `GET /api/reports/accounts/<A>/flow?fromDate=2026-06-01&toDate=2027-01-01`
   (> 366 days) returns `400 VALIDATION_ERROR`.
8. The composition root subscribes a no-op handler to
   `TransactionRecorded`. `dispatcher.dispatch({ type:
'TransactionRecorded', payload: ... })` returns count = 1 (the
   no-op handler ran). The transaction row is unchanged.
9. `openspec/specs/reports/spec.md` exists with at least 5
   Requirements and one Scenario each after `sdd-archive` runs.
10. `./Documents-es/openspec/changes/reports/proposal.md` mirror
    exists with identical structure. No Chinese-character debris
    per root `AGENTS.md` §13.3 mirror check.
11. No `pnpm-lock.yaml` drift after `package.json` is staged (Husky
    pre-commit check per root `AGENTS.md` §5.3). If v1 ships without
    new deps, the lockfile is unchanged.
12. **No `new Date()` in domain code.** Every aggregate factory
    uses `Clock.now()` from `src/shared/clock/clock.port.ts:22-24`
    for the `generatedAt` timestamp.

## Risks

| Risk                                                                      | Likelihood | Mitigation                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lazy compute-on-read becomes slow as `Transaction` rows grow.             | Medium     | The two indexes (`@@index([userId, transactionDate])` and `@@index([accountId, transactionDate])`) make the read O(rows-in-window). The window is at most one month for summary/breakdown and 366 days for flow. At the v1 row scale (low hundreds per user per month), the in-memory aggregate is sub-100ms. The event-driven migration path is documented for the future. |
| Cross-user isolation regression in the reports port.                      | Low        | The port contract test (`reports.repository.port.test.ts`) asserts `userId` is the first argument of every method. Action tests seed user A and user B rows and verify user A's queries never see user B's rows.                                                                                                                                                            |
| UTC-vs-user-timezone bucketing surprises an Argentina-based user.         | Medium     | The spec codifies v1 as UTC. The UI surfaces the month label as `"June 2026 (UTC)"` so the user can correct manually. A `User.timezone` field is a future additive migration gated on user feedback.                                                                                                                                                                        |
| The no-op event handler silently masks a wiring bug.                      | Low        | The composition-root test asserts exactly one subscriber for `TransactionRecorded` after `buildAppDeps` runs. A missing subscribe fails the test.                                                                                                                                                                                                                           |
| The breakdown's case-fold normalization loses information the user wants. | Low        | The normalization is the factory's responsibility; the spec documents the rule. The raw `category` string is preserved on the `Transaction` row — the breakdown is a derived view, never the source of truth.                                                                                                                                                               |
| Spanish mirror drifts from the English original.                          | Medium     | Apply §13.3 atomicity; the `reviewer` checks both files in the same commit.                                                                                                                                                                                                                                                                                                 |
| Strict TDD's RED step is skipped, failing the reviewer.                   | Medium     | `sdd-tasks` owns task structure; `sdd-apply` enforces RED → GREEN → REFACTOR per task.                                                                                                                                                                                                                                                                                      |

## Snapshot strategy

**Decision: lazy compute-on-read in v1; event-driven materialization
is the future migration path, non-breaking.**

| Path                   | v1                                                                         | Future migration                                                                          |
| ---------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Read path**          | Aggregate on every request from the `TransactionRepositoryPort.list` page. | Read from a `MonthlySummary` / `CategoryBreakdown` / `AccountFlow` materialization table. |
| **Write path**         | None. `reports` never writes.                                              | The materializer subscribes to `TransactionRecorded` and updates the rollup rows.         |
| **Consistency**        | Always consistent (reads the source of truth).                             | Eventually consistent; the materializer must catch up after a restart.                    |
| **Event subscription** | No-op handler at composition time (validates the seam).                    | The no-op becomes the materializer.                                                       |

Why lazy for v1:

- **No consistency story to design.** The aggregate reads the
  source of truth; there is no materializer to keep in sync.
- **Cheapest path.** No new Prisma model, no migration, no
  background job. The slice budget is 760 – 1200 lines over four
  PRs; the alternative adds ~400 lines.
- **Migration is non-breaking.** The seam is wired at composition
  time. The future migration adds the materializer; the read path
  swaps from `TransactionRepositoryPort.list` to the
  materialization table; no interface change for callers.
- **Performance is acceptable at v1 scale.** The indexes make the
  read O(rows-in-window); at the v1 row scale the in-memory
  aggregate is sub-100ms.

The composition-root test (acceptance #8) pins the seam at boot
time so the future migration has a single, validated point of
change.

## Capabilities

> This section is the CONTRACT between this proposal and `sdd-spec`.
> The next phase reads this to know exactly which spec files to
> create or update.

### New capabilities

- `reports`: owns the three read aggregates (`MonthlySummary`,
  `CategoryBreakdown`, `AccountFlow`), the pure aggregation
  services, the `ReportsRepositoryPort` (consuming the
  `TransactionRepositoryPort`), the three query actions with Zod
  query-param validation, the three Hono routes, the no-op
  `TransactionRecorded` subscription, and the dashboard UI. The
  capability lives at `src/modules/reports/` and ships its own
  spec at `openspec/specs/reports/spec.md`.

### Modified capabilities

- `transactions`: the spec gains a one-line delta noting that
  `TransactionRecorded` has at least one subscriber at composition
  time (the no-op handler from `reports`). No behavior change on
  the transactions side; the delta is a cross-link pointer for the
  spec reader.
- `errors`: no new codes. Reports failures reuse `VALIDATION_ERROR`,
  `NOT_FOUND`, `UNAUTHORIZED`. The `ErrorCode` enum and the
  mapping table at `src/shared/errors/error-codes.ts:12-43,52-66`
  are unchanged.
- `events`: no new union members. `TransactionRecorded` is already
  in the union at `src/shared/events/event-dispatcher.ts:6`. The
  no-op subscription is a runtime wiring, not a type-level change.

## Alternatives considered

1. **Event-driven materialized snapshots in v1.** Rejected for v1.
   Adds a write path (the materializer), a consistency story
   (eventual consistency on restart), and a Prisma migration
   (new `MonthlySummary` / `CategoryBreakdown` tables). The lazy
   path is the cheapest first cut. The future migration is
   non-breaking because the seam is wired at composition time.
2. **Pre-aggregated rollups in a Postgres MATERIALIZED VIEW.**
   Rejected for v1. Same downside as #1 plus a heavy DB-layer
   dependency. The lazy path is the cheapest first cut.
3. **No UI in this change; ship the API only.** Rejected. The
   user-facing promise of `reports` is the dashboard; shipping
   the API without a consumer leaves the same product gap.
   The dashboard slice is bounded (200-320 lines) and reuses the
   existing UI primitives.
4. **Charts library in v1 (recharts / chartjs / d3).** Rejected for
   v1. A charting library adds a dependency, an SSR-vs-CSR
   decision, and a learning curve. The v1 dashboard renders
   tables + CSS `width: %` bars. The charts library is a future
   change once the UX direction is locked.
5. **One composite `/dashboard` endpoint.** Rejected. The three
   surfaces (summary, breakdown, flow) have different filters
   and different consumers. Three thin endpoints + three
   presentational components is the screaming-architecture fit;
   one mega-endpoint couples the surfaces.

## Forecast (force-chained, 400-line budget)

The orchestrator pre-cached `delivery_strategy: force-chained` and
`review_budget_lines: 400`. Per the §E review-workload guard, every
slice MUST be a self-contained PR with clear start, finish,
verification, and rollback. Forecast lines are **changed lines
(additions + deletions)** per slice.

| PR        | Slice                 | LoC low | LoC high | Verification gate                                                                                                                  |
| --------- | --------------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| #1        | `reports-domain`      | 180     | 280      | `pnpm test src/modules/reports/domain` exits 0; port contract test asserts cross-user isolation.                                   |
| #2        | `reports-application` | 220     | 340      | `pnpm test src/modules/reports/application` exits 0; action tests cover empty state, multi-currency, cross-user.                   |
| #3        | `reports-routes`      | 160     | 260      | `pnpm test src/modules/reports/application/routes.test.ts` exits 0; `build-app-deps.test.ts` asserts the dispatcher subscription.  |
| #4        | `dashboard-ui`        | 200     | 320      | Manual `pnpm dev` smoke: sign in → visit `/dashboard` → see three cards. Vitest snapshots for the three presentational components. |
| **Total** | —                     | **760** | **1200** | All four PRs merged; `pnpm test` green; dashboard renders the user's data.                                                         |

- Decision needed before apply: **No** (scope locked at pre-propose).
- Chained PRs recommended: **Yes** (force-chained per orchestrator
  cache; every slice is over the 400-line budget if delivered as a
  single PR).
- 400-line budget risk: **Low** per slice; **High** if collapsed
  into one PR.

## Open questions

These five questions will be grilled at the pre-spec session. The
defaults below are the proposed v1 shape; the spec phase locks the
final wording.

1. **Timezone for monthly bucketing.** Default: UTC. Lock the v1
   simplification in the spec; surface "June 2026 (UTC)" on the
   dashboard.
2. **Category normalization.** Default: lowercase + trim +
   `null/empty → "uncategorized"`. Lock the rule in the spec.
3. **Currency mixing in the monthly summary.** Default: one row per
   `convertedCurrency` in the response; UI shows ARS primary, USD
   secondary. Lock the response shape in the spec.
4. **Account flow granularity.** Default: daily. Lock the date-key
   format (`YYYY-MM-DD` UTC) in the spec.
5. **Empty-state behavior.** Default: three empty cards + CTA to
   `/transactions/new`. Lock the UX in the spec.

## Dependencies

- **Inbound**: `transactions` (shipped) provides
  `TransactionRepositoryPort`, `TransactionDTO`,
  `TransactionRecorded` event, and the in-memory fixture pattern.
- **Inbound**: `accounts` (shipped) provides `AccountRepositoryPort`
  (the flow endpoint cross-checks the account belongs to the user).
- **Inbound**: `fx-cache` (shipped) provides the `FxRateProvider`
  port (consumed by the future materializer; zero calls in v1).
- **Inbound**: `auth-foundation` (shipped) provides the session
  gate (`requireSession`) and the `AuthUser` invariant used by
  every route.
- **Outbound**: `snapshots` (future) consumes the `MonthlySummary`
  aggregate as a stable input.
- **External**: none. No new external service in v1.
- **No co-PRs**: `reports` does not block any in-flight change.

## Next step

`/sdd-spec reports` — write the delta spec at
`openspec/changes/reports/specs/reports/spec.md` and lift it into the
canonical `openspec/specs/reports/spec.md` per the SDD archive flow.
The spec phase will lock the five open questions and write the
Requirements + Scenarios for BR-RPT-1 to BR-RPT-5.
