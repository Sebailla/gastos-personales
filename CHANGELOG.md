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
