# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
