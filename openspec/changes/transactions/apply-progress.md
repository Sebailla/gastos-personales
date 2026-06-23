# Apply Progress — `transactions` (slice 1: entity + port + factory)

**Author**: Sebastián Illa
**Change**: `transactions`
**Slice**: 1 of N — atomic entity slice (`Transaction` aggregate, `TransactionRepositoryPort`, `createTransaction` factory, `TransactionDirection` const, domain errors)
**Branch**: `feat/transactions-entity`
**Base**: `develop`
**Status**: in-progress · **Created**: 2026-06-23 · **Last sync**: 2026-06-23 (slice 1)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (inherited from `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4
**Strict TDD**: enabled per `openspec/config.yaml`; runner `pnpm test`; cycle RED → GREEN → TRIANGULATE → REFACTOR

> Atomic validation slice. Lands the smallest possible surface that proves the
> domain layer is buildable and testable end-to-end. NO Prisma model, NO actions,
> NO FX helper, NO event, NO error codes, NO routes, NO smoke UI. Just the
> aggregate, the factory, the port, the direction enum, the domain errors, and
> the barrel.

## Pre-flight baseline (2026-06-23)

| Check                                 | Result                                                        |
| ------------------------------------- | ------------------------------------------------------------- |
| `pnpm install --ignore-workspace`     | OK (905 packages, 4.5s)                                       |
| `pnpm prisma generate`                | OK (v7.8.0)                                                   |
| `pnpm test` (baseline)                | **527 passed**, 4 skipped (testcontainers Postgres), 0 failed |
| `pnpm run typecheck` (baseline)       | **0 errors**                                                  |
| `gga run` (baseline, no staged files) | OK (informational — "No matching files staged for commit")    |

**Note on `pnpm install`**: a `pnpm-workspace.yaml` at `$HOME` (a system-wide
artifact unrelated to this repo) was being detected as the workspace root. The
flag `--ignore-workspace` is required to install into the project-local
`node_modules/`. This is a local-machine configuration quirk, not a project
defect. The `pnpm-lock.yaml` is unchanged by slice 1 (no new deps).

## Slice 1 scope (binding)

| #   | File                                                    | Type | Spec REQ                               |
| --- | ------------------------------------------------------- | ---- | -------------------------------------- |
| 1   | `domain/entities/transaction-direction.ts`              | impl | REQ-TX-3, BR-TX-2                      |
| 2   | `domain/entities/transaction-direction.test.ts`         | test | REQ-TX-3                               |
| 3   | `domain/entities/transaction.errors.ts`                 | impl | REQ-TX-2, REQ-TX-3, REQ-TX-4           |
| 4   | `domain/entities/transaction.ts`                        | impl | REQ-TX-1, REQ-TX-2, REQ-TX-3, REQ-TX-4 |
| 5   | `domain/entities/transaction.test.ts`                   | test | REQ-TX-2, REQ-TX-4, REQ-TX-5           |
| 6   | `domain/factories/create-transaction.ts`                | impl | REQ-TX-1, REQ-TX-2, REQ-TX-3, REQ-TX-4 |
| 7   | `domain/factories/create-transaction.test.ts`           | test | REQ-TX-1, REQ-TX-2, REQ-TX-3, REQ-TX-4 |
| 8   | `domain/interfaces/transaction.repository.port.ts`      | impl | REQ-TX-1, BR-TX-4                      |
| 9   | `domain/interfaces/transaction.repository.port.test.ts` | test | BR-TX-4 (compile-time contract)        |
| 10  | `domain/index.ts`                                       | impl | barrel                                 |

## Commit ledger (to be filled per commit)

| SHA | Type  | Subject                                                             | Test count | RED → GREEN       | typecheck | Notes |
| --- | ----- | ------------------------------------------------------------------- | ---------- | ----------------- | --------- | ----- |
|     | chore | scaffold transactions/domain tree (slice 1 anchor)                  | 0          | n/a               | n/a       |       |
|     | docs  | scaffold apply-progress (EN + ES)                                   | 0          | n/a               | n/a       |       |
|     | test  | red — TransactionDirection enum contract (5 cases)                  | 5 RED      | red commit        | n/a       |       |
|     | feat  | TransactionDirection const + type (TRANSFER reserved)               | 5 GREEN    | greens T1.1 above | 0 errors  |       |
|     | feat  | TransactionDomainError + InvalidAmountError + InvalidDirectionError | 5 GREEN    | still passing     | 0 errors  |       |
|     | test  | red — Transaction aggregate invariants (8 cases)                    | 8 RED      | red commit        | n/a       |       |
|     | feat  | Transaction aggregate (14 fields, 3 invariants)                     | 13 GREEN   | greens T1.2 above | 0 errors  |       |
|     | test  | red — createTransaction factory contract (6 cases)                  | 6 RED      | red commit        | n/a       |       |
|     | feat  | createTransaction factory (UUID, timestamps, validation)            | 19 GREEN   | greens T1.3 above | 0 errors  |       |
|     | test  | red — TransactionRepositoryPort compile-time contract (4 cases)     | 4 RED      | red commit        | n/a       |       |
|     | feat  | TransactionRepositoryPort (5 methods, userId-first)                 | 23 GREEN   | greens T1.4 above | 0 errors  |       |
|     | feat  | barrel exporting the domain surface                                 | 23 GREEN   | still passing     | 0 errors  |       |
|     | docs  | close apply-progress for slice 1 (entity + port)                    | 23 GREEN   | still passing     | 0 errors  |       |

## TDD Cycle Evidence

| File                                  | RED SHA | GREEN SHA | RED proof (test runner output) | GREEN proof (test runner output) |
| ------------------------------------- | ------- | --------- | ------------------------------ | -------------------------------- |
| `transaction-direction.test.ts`       |         |           |                                |                                  |
| `transaction.test.ts`                 |         |           |                                |                                  |
| `create-transaction.test.ts`          |         |           |                                |                                  |
| `transaction.repository.port.test.ts` |         |           |                                |                                  |

## Deviations

> None yet. Slice 1 binds to the spec's REQ-TX-1 through REQ-TX-5; no
> deviations are permitted (the slice is intentionally tight).

## Acceptance gates

- [ ] `pnpm test` exits 0 with 23 new tests passing under `src/modules/transactions/**`
- [ ] `pnpm run typecheck` exits 0 (0 errors)
- [ ] `pnpm test --coverage` shows ≥ 80% lines on `src/modules/transactions/domain/**` (target 100% — pure domain logic)
- [ ] `git log develop..feat/transactions-entity --oneline` shows the full atomic sequence
- [ ] `git log develop..feat/transactions-entity | grep -i "no-verify"` is empty
- [ ] `git log develop..feat/transactions-entity | grep -iE "co-authored.*(ai|claude|gpt|gemini)|with ai help|generated by ai"` is empty
- [ ] `git diff --stat develop..feat/transactions-entity | tail -1` shows < 600 lines (target 250–400)
- [ ] `Documents-es/openspec/changes/transactions/apply-progress.md` exists, mirrors the EN file, 0 CJK characters
- [ ] `openspec/changes/transactions/apply-progress.md` header is exactly `Author: Sebastián Illa` (no AI variants)
- [ ] `Documents-es/openspec/changes/transactions/apply-progress.md` header is exactly `Autor: Sebastián Illa`
- [ ] All commits pass `pnpm test` and `pnpm run typecheck` (per-commit gate)
- [ ] All commits pass `pnpm exec lint-staged && gga run` (pre-commit gate)
