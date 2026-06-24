# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
