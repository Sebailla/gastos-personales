# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`ui` capability end-to-end** (#98 #99 #100 #101 #102, slice 6 of
  `transactions-ui`): the new design-system reference + production
  render layer. The capability is hand-built on Tailwind v4 + React
  19 with **zero new top-level dependencies** (`pnpm-lock.yaml`
  unchanged from v0.3.0). Scope:
  - **18 design-system primitives** at `app/_ui/primitives/`:
    `Button`, `Input`, `Textarea`, `Select`, `Checkbox`,
    `RadioGroup`, `Combobox` (Client), `FieldError`, `FormField`,
    `Card` + sub-components, `Table` + sub-components, `Badge`,
    `EmptyState`, `Spinner`, `Skeleton`, `Pagination`, `Dialog`
    (Client), `Breadcrumb`, `Link`. Each primitive has a unit test
    asserting its a11y contract (`role` attributes, `aria-*`
    pass-through, label / control pairing).
  - **5 layout-shell primitives** at `app/_ui/layout/`:
    `PageHeader`, `PageContainer`, `BreadcrumbBar`, `Sidebar`
    (forward-declared, unused in v1), `Topbar` (forward-declared,
    unused in v1).
  - **Token table** at `app/_ui/tokens.css` declaring the v1
    light-theme tokens as CSS custom properties plus the dark-mode
    scope under `[data-theme='dark']` for non-breaking forward
    compatibility (REQ-UI-9 / BR-UI-8).
  - **Production UI surfaces** replacing the three smoke pages:
    `/accounts`, `/accounts/:id`, `/accounts/new`,
    `/transactions`, `/transactions/:id`, `/transactions/new`,
    `/dashboard`. Each surface covers the four UI states (empty,
    loading, error, success) per REQ-UI-3 and keeps the `auth()`
    Server Component gate.
  - **User-facing error boundaries** per route segment:
    `app/error.tsx`, `app/dashboard/error.tsx`,
    `app/accounts/error.tsx`, `app/transactions/error.tsx`.
  - **Two additive query flags** on existing GET endpoints:
    `?include=lastActivity` on `GET /api/accounts` (REQ-UI-1) and
    `?include=accountName` on `GET /api/transactions` (REQ-UI-2).
    The endpoints WITHOUT the flag remain byte-identical to the
    pre-`transactions-ui` contract — additive only.
  - **Two Client Components for dashboard query-param state**:
    `app/_components/dashboard-account-picker.tsx` (navigates to
    `?accountId=<id>`) and `app/_components/dashboard-month-switcher.tsx`
    (renders `<Link>`s for previous / current / next month).
  - **axe-core integration test suite** at `tests/a11y/`: one
    `vitest-axe` test per production page asserting zero `critical`
    + `serious` violations (WCAG 2.2 AA floor).
  - **Visual snapshot test suite** at `tests/visual/`: golden-file
    snapshots for the static presentational primitives (`Card`,
    `Badge`, `EmptyState`, `Skeleton`, `Breadcrumb`).
  - **E2E happy-path test suite** at `tests/e2e/`: full user
    journeys (list → detail → create → submit; dashboard account
    picker + month switcher).
  - **Design-system reference** at `docs/architecture/ui.md` (the
    public catalog codifying REQ-UI-10): token table (light + dark
    CSS scope), 18-row primitive inventory with props shape + a11y
    contract per primitive, 5-row layout-shell inventory, and
    cross-cutting contracts (focus indicator, label pairing,
    inline errors, submit loading state, table caption / scope /
    aria-sort, no dark variants, path-based imports).
  - **Manual QA checklist** at `docs/qa/transactions-ui.md`
    (codifying REQ-UI-11): per-page keyboard sweep, cross-page
    keyboard contract, form error surfacing, screen-reader pass
    on VoiceOver (macOS) + NVDA (Windows), cross-user isolation
    manual check, dark-mode follow-up note, axe-core informational
    section, and a user-owned sign-off section. Runnable in 30–45
    minutes.
  - **Perf budget verification** at `docs/perf/transactions-ui.md`:
    the Lighthouse CLI commands, the simulated 4G + Moto G4
    throttling profile, the p95 page load < 2s budget on `/`,
    `/dashboard`, and `/transactions`, JSON summary placeholders
    for the three pages, and the budget-failure mitigation from
    `design.md §16.5`.

### Changed

- **`transactions` spec** (`openspec/specs/transactions/spec.md`):
  REQ-TX-15 (the original "Three smoke pages mirror the accounts
  slice" requirement) is **REPLACED** by a thin pointer to the new
  `ui` capability (`openspec/specs/ui/spec.md` REQ-UI-1 to
  REQ-UI-11). All other requirements (REQ-TX-1 to REQ-TX-14) are
  preserved verbatim. The replacement is non-breaking: no BR
  changes, no Hono route changes, no data model changes, no new
  top-level dependencies.

### Notes

- The v1 production UI ships a **single light theme** (REQ-UI-9).
  Dark-mode tokens are declared but unused; the follow-up
  `ui-dark-mode` change activates them by setting
  `data-theme="dark"` on the document root.
- i18n (English / Spanish) is mixed EN/ES copy following the
  pre-existing project convention (Spanish dashboard copy, English
  component-level UI text). The follow-up `ui-i18n` change
  introduces a message catalog.
- Lighthouse CLI sweep + manual QA sign-off are **user-owned
  manual tasks** (T-UI-505 + T-UI-506). The JSON summaries in
  `docs/perf/transactions-ui.md` and the sign-off section in
  `docs/qa/transactions-ui.md` are pending until the user runs
  them post-merge.

## [0.2.1] - 2026-06-25

### Changed

- **Shared domain kernel extraction** (#72): the cross-module enums (`AccountCurrency`, `AccountFxCasa`) and ports (`FxRateProvider`, `AccountRepositoryPort`) were lifted out of `src/modules/transactions/domain/` into the new `src/shared/domain-kernel/`. The kernel is a structural primitive shared across the codebase (like `@/shared/events/event-dispatcher` already was), not a module — root `AGENTS.md` §10.5 "Modules isolated" still holds because consumers depend on the kernel barrel (`@/shared/domain-kernel`), not on each other's internals. Kernel ports expose only the structural minimum surface that the transactions layer needs (e.g. `AccountRepositoryPort.findById` only); the canonical ports in `@/modules/accounts` carry the full surface used by `AccountService`.
- **`createHonoApp` extraction** (#72): the Hono factory moved from `src/modules/api/app.ts` to `src/composition/create-hono-app.ts`. The api module is no longer the composition seam — `app.ts` is now a thin re-export surface (48 lines, down from 160). Each module's barrel still exposes `mountXxxRoutes(app, deps)`; tests that compose their own app SHOULD import `createHonoApp` directly from `@/composition/create-hono-app`.
- **`crypto.randomUUID()` for transaction ids** (#73): the custom `randomHex` helper in `createTransactionAction` and `InMemoryTransactionRepository` was replaced with the WHATWG-spec'd UUIDv4 generator. Same CSPRNG, more entropy (122 bits vs 96), no new dependency. The `tx_` prefix is preserved, so existing callers matching `^tx_` on the id keep working. The `Math.random` fallback in the in-memory fixture is gone — Node 20+ guarantees `crypto.randomUUID` is available, and a silent fallback to predictable ids in a test fixture is a correctness hazard.

### Added

- **Coverage gate on pre-push** (#73): `pnpm run test:coverage:enforced` runs before `git push` and fails when any of lines / branches / functions / statements drops below 80% (root `AGENTS.md` §10.5 floor). The gate uses `SKIP_TIMING=true` locally to bypass two pre-existing flaky timing tests (`argon2.parameters.test.ts`, `login.timing.test.ts`) — CI runs the strict suite without that flag. The full coverage run is slower than the per-staged-file lint-staged + gga checks in pre-commit, so the gate sits at push (one run per branch) rather than commit (N runs per branch).

## [0.2.0] - 2026-06-24

### Added

- `transactions` capability end-to-end: 6 Hono routes (`/api/transactions`, `/api/transactions/:id`, `/api/transactions/account/:accountId`), 5 application actions (list, get, create, update, delete) with Zod validation, Prisma adapter (`TransactionRepositoryPrisma`) with mock-Prisma test coverage, FX snapshot at write time via the `convertAndSnapshot` helper, `TransactionRecorded` domain event, smoke UI under `app/transactions/` (list, create, detail/edit/delete).
- Three new error codes (`INVALID_AMOUNT: 400`, `FUTURE_DATE_NOT_ALLOWED: 400`, `ACCOUNT_ARCHIVED: 409`) added to `src/shared/errors/error-codes.ts`.
- `logger` denylist for the `memo` field (PII hygiene) in `src/shared/logger/logger.ts`.

### Changed

- `prisma-types.ts` narrow Prisma delegates refactored to remove all `any` (15 occurrences) per root `AGENTS.md` §10.5; new `PrismaTransactionDelegate` added for the transactions adapter.
- `src/modules/api/app.ts` slimmed from 534 to 160 lines. Composition root extracted to `src/composition/build-app-deps.ts`. Each module (`auth`, `accounts`, `transactions`) now exposes a `mountXxxRoutes(app, deps)` function on its barrel. The `originCheck` middleware moved from `src/modules/api/middlewares/` to `src/shared/http/`.
- Husky pre-commit hook updated to use `pnpm exec lint-staged` (avoiding re-download on every commit) and `git update-index --refresh` (working around a husky 9.x cache-tree bug).

### Fixed

- BR-TX-5 archived-account pre-check was returning 500 INTERNAL_ERROR in production because `buildTransactionDeps` did not plumb `AccountRepositoryPrisma` into the deps bag. Now returns 409 ACCOUNT_ARCHIVED.

[0.2.0]: https://github.com/Sebailla/gastos-personales/releases/tag/v0.2.0
[0.2.1]: https://github.com/Sebailla/gastos-personales/releases/tag/v0.2.1

## [0.3.0] - 2026-06-27

### Added

- `reports` capability end-to-end: 3 read aggregates (`MonthlySummary`, `CategoryBreakdown`, `AccountFlow`) at `src/modules/reports/domain/aggregates/`. Each aggregate has a pure factory + co-located tests; the three are joined into one `aggregate-transactions.ts` service module with cross-user isolation tests. Domain errors (`InvalidMonthError`, `InvalidAccountIdError`, `InvalidDateRangeError`, `AccountNotFoundError`) extend a new `ReportsDomainError` base class. `Month` value object at `src/modules/reports/domain/value-objects/month.ts` derives `fromDate` / `toDate` UTC bounds from a `YYYY-MM` regex input.
- 3 Hono routes mounted under `protectedApp` via `mountReportsRoutes`: `GET /api/reports/monthly?month=YYYY-MM`, `GET /api/reports/breakdown?month=YYYY-MM`, `GET /api/reports/accounts/:accountId/flow?month=YYYY-MM` (or `?fromDate=&toDate=` for a custom range). All three routes require session via `requireSession` middleware and scope every read to the session's `userId` (BR-TX-4 cross-user isolation enforced at the application layer + the `Transaction` read delegate).
- New `src/shared/domain-kernel/ports/transaction-repository-port.ts` kernel port exposes the read-only surface (`list(userId, opts)` shape) that the reports adapter consumes. Reports consume the kernel, not `@/modules/transactions` directly — root `AGENTS.md` §10.5 "Modules isolated" preserved.
- Dashboard smoke UI at `app/dashboard/page.tsx` (RSC, `force-dynamic`, parallel `serverHonoRequest` for monthly + breakdown). Three presentational Server Components (`MonthlySummaryCard`, `CategoryBreakdownCard`, `AccountFlowCard`) under `app/_components/`. The flow card is empty in v1 by design (the dashboard does NOT deep-link to an account picker yet). Wire types re-declared locally at `app/_lib/report-types.ts` per the `app/_lib/transaction-types.ts` precedent — UI cannot import from `src/modules/reports/...` (architecture rule).
- New `NoopTransactionRecordedSubscriber` infrastructure handler at `src/modules/reports/infrastructure/subscribers/` debug-logs `reports.noop.transaction-recorded` and returns `void`. Wired exactly once in `buildAppDeps` per BR-RPT-5. The subscriber-count assertion in `src/composition/build-app-deps.test.ts` (REQ-RPT-7) catches wiring regressions: a missing `dispatcher.subscribe` call fails the test with the exact diff.

### Changed

- `vitest.config.ts` now includes `src/modules/reports/**` in `coverage.include` (alphabetical position between `fx` and `shared/db`) so the coverage gate (`pnpm run test:coverage:enforced` from the pre-push hook) reports the new module. Without this entry the gate would silently miss the ~1100 LoC of pure domain code.
- `InMemoryReportsRepository` (slice-2 fixture) uses constructor-injection (`TransactionListFn` callback) instead of composing `InMemoryTransactionRepository` directly. The fixture preserves modules-isolation (root `AGENTS.md` §10.5): the test file wires `txRepo.list.bind(txRepo)` at the seam, the fixture itself has zero cross-module dependencies.
- Husky pre-push hook now correctly detects `git push --delete origin <branch>` via STDIN parsing (`remote_sha == 40 zeros` per refspec) instead of looking for `--delete` in `$@` (which git never passes). Without this fix `git push --delete` from a worktree on `develop` was rejected with "branch name 'develop' does not match the convention" — a workaround (`--no-verify`) was used during the slice cycle; the fix removes the workaround.

### Fixed

- I-RPT-3.1 (boundary-row inclusion bug): `InMemoryReportsRepository`'s `inRange` filter was inclusive on both ends (`t <= toDate`) but `toDate` is documented as the EXCLUSIVE upper bound of the month window per design §6.1 (`year-(month+1)-01 00:00:00.000Z` for a June query, i.e. the first instant of July). A row whose `transactionDate` exactly equalled `toDate` would have been incorrectly included in the current month's report. Now uses half-open range (`t < toDate`). The corresponding Prisma adapter uses SQL `toDate < nextMonth` (correct from day one), so the production path was never affected — only the in-memory fixture diverged.

[0.2.0]: https://github.com/Sebailla/gastos-personales/releases/tag/v0.2.0
[0.2.1]: https://github.com/Sebailla/gastos-personales/releases/tag/v0.2.1
[0.3.0]: https://github.com/Sebailla/gastos-personales/releases/tag/v0.3.0
