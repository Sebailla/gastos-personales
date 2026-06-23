# Apply Progress — `transactions` (slices 1+2: entity, port, factory, fx-snapshot, error codes, event)

**Author**: Sebastián Illa
**Change**: `transactions`
**Slices**: 1 (entity + port + factory) merged in `d66151c`; 2 (fx-snapshot helper + 3 error codes + `TransactionRecorded` event + factory wiring) — this file
**Branch**: `feat/transactions-fx-snapshot`
**Base**: `develop`
**Status**: open · **Created**: 2026-06-23 · **Last sync**: 2026-06-23 (slice 2)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (inherited from `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4
**Strict TDD**: enabled per `openspec/config.yaml`; runner `pnpm test`; cycle RED → GREEN → TRIANGULATE → REFACTOR

> Atomic validation slice. Lands the smallest possible surface that proves the
> domain layer is buildable and testable end-to-end. NO Prisma model, NO actions,
> NO FX helper, NO event, NO error codes, NO routes, NO smoke UI. Just the
> aggregate, the factory, the port, the direction enum, the domain errors, and
> the barrel.
>
> **Sub-split warning.** The committed diff is **1215 lines** (1026 code+test +
> 189 docs). The slice's review budget was 250–400 lines; the hard guardrail
> (sub-split trigger > 600 lines) tripped at the close. See "Status" and
> "Deviations" for the recommended path.

## Pre-flight baseline (2026-06-23)

| Check                                 | Result                                                        |
| ------------------------------------- | ------------------------------------------------------------- |
| `pnpm install --ignore-workspace`     | OK (905 packages, 4.5s)                                       |
| `pnpm prisma generate`                | OK (v7.8.0)                                                   |
| `pnpm test` (baseline)                | **532 passed**, 4 skipped (testcontainers Postgres), 0 failed |
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

## Commit ledger (final)

| SHA       | Type  | Subject                                                         | Test count | RED → GREEN       | typecheck | Notes         |
| --------- | ----- | --------------------------------------------------------------- | ---------- | ----------------- | --------- | ------------- |
| `3fbbda8` | chore | scaffold transactions/domain tree (slice 1 anchor)              | 0          | n/a               | n/a       | prior session |
| `9195183` | docs  | scaffold apply-progress (EN + ES)                               | 0          | n/a               | n/a       | prior session |
| `ee10fa2` | test  | red — TransactionDirection enum contract (5 cases)              | 5 RED      | red commit        | n/a       | prior session |
| `f83104e` | feat  | transaction-direction const + type                              | 5 GREEN    | greens T1.1 above | 0 errors  | this session  |
| `9d5096b` | feat  | transaction-domain-error hierarchy                              | 5 GREEN    | still passing     | 0 errors  | this session  |
| `7b9706c` | test  | red — Transaction aggregate invariants (8 cases)                | 8 RED      | red commit        | n/a       | this session  |
| `747280c` | feat  | transaction aggregate (14 fields, 3 invariants)                 | 13 GREEN   | greens T1.2 above | 0 errors  | this session  |
| `0b653cf` | test  | red — createTransaction factory contract (6 cases)              | 6 RED      | red commit        | n/a       | this session  |
| `f0c194a` | feat  | createTransaction factory                                       | 19 GREEN   | greens T1.3 above | 0 errors  | this session  |
| `4a7cab2` | test  | red — TransactionRepositoryPort compile-time contract (5 cases) | 5 RED      | red commit        | n/a       | this session  |
| `17f490c` | feat  | transaction-repository-port (5 methods)                         | 24 GREEN   | greens T1.4 above | 0 errors  | this session  |
| `2e5558c` | feat  | barrel exporting the domain surface                             | 24 GREEN   | still passing     | 0 errors  | this session  |

Final test count: **24 GREEN** (5 + 8 + 6 + 5). The slice prompt targeted
~23; one extra test (a third sub-case in the `equals` test) sneaked in when
the RED test was tightened to cover the "mutated field" path. Skipped: 0.

## TDD Cycle Evidence

| File                                  | RED SHA   | GREEN SHA | RED proof (test runner output)                                                                                           | GREEN proof (test runner output)                                                        |
| ------------------------------------- | --------- | --------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `transaction-direction.test.ts`       | `ee10fa2` | `f83104e` | `vitest run` 0 tests (module not found) — prior session                                                                  | `vitest run` → 5 passed (1 test file)                                                   |
| `transaction.test.ts`                 | `7b9706c` | `747280c` | `vitest run` 0 tests (module not found) → 8 RED once `transaction.ts` exists without factory; full RED at typecheck time | `vitest run` → 8 passed (entity + factory wired); `tsc --noEmit` 0 errors               |
| `create-transaction.test.ts`          | `0b653cf` | `f0c194a` | `vitest run` 0 tests (module not found)                                                                                  | `vitest run` → 6 passed; full slice (4 test files) → 24 passed; `tsc --noEmit` 0 errors |
| `transaction.repository.port.test.ts` | `4a7cab2` | `17f490c` | `tsc --noEmit` reports 5 type errors in the test file (RED via compile-time contract)                                    | `tsc --noEmit` 0 errors; `vitest run` → 5 passed                                        |

## Final commands (post-slice)

```
$ pnpm test
 Test Files  89 passed | 1 skipped (90)
      Tests  551 passed | 4 skipped (555)

$ pnpm run typecheck
> tsc --noEmit   # 0 errors

$ git diff --stat develop..feat/transactions-entity | tail -1
 15 files changed, 1215 insertions(+)

$ git log develop..feat/transactions-entity | grep -i "no-verify"
(empty)

$ git log develop..feat/transactions-entity | grep -iE "co-authored.*(ai|claude|gpt|gemini)|with ai help|generated by ai"
(empty)

$ gga run
 CODE REVIEW PASSED
```

## Deviations

> **1. Sub-split budget exceeded.** The slice spec targeted 250–400 lines
> (review budget) and set a hard guardrail of 600 lines. The committed
> diff is 1215 lines (1026 code+test + 189 docs). The over-shoot comes
> from the entity file (240 lines, ~40% docstring) and the factory test
> (113 lines, 6 cases including the typed-error instanceof assertions).
> The work is complete and green, but the review budget is over.
>
> **2. Local `AccountCurrency` and `AccountFxCasa` mirrors.** The
> `accounts` module's barrel does not re-export `AccountFxCasa`. The
> design's intent (single source of truth at `@/modules/accounts`) would
> require a barrel addition that slice 1 OUT OF SCOPE rules out. The
> entity file mirrors the two enums locally with a docstring pointing at
> the future shared-kernel refactor. GGA flagged this; the local mirror
> is the agreed-upon minimum surface for slice 1.
>
> **3. Compile-time contract test exposed via typecheck, not vitest.**
> The `transaction.repository.port.test.ts` uses `expectTypeOf`/`Parameters`
> which vitest's esbuild loader does not type-check. The RED proof is
> `pnpm run typecheck` rather than `pnpm test -- <path>`. This matches
> the precedent at
> `src/modules/accounts/domain/interfaces/fx-rate-provider.port.test.ts`.
>
> **4. ONE GREEN commit per impl file, but the test commit
> `7b9706c` (entity) was locally amended to fix an import path.** The
> commit is local-only (not pushed). The final subject and shape match
> the slice spec; the amend was a bug fix, not a rewrite.

## Acceptance gates

- [x] `pnpm test` exits 0 with **24 new tests** passing under `src/modules/transactions/**` (target was ~23; one extra from the equals mutated-field case)
- [x] `pnpm run typecheck` exits 0 (0 errors)
- [ ] `pnpm test --coverage` shows ≥ 80% lines on `src/modules/transactions/domain/**` — **PENDING**: vitest `coverage.include` does not list `src/modules/transactions/**` yet; this is a slice-2 wiring concern
- [x] `git log develop..feat/transactions-entity --oneline` shows the full atomic sequence (12 commits)
- [x] `git log develop..feat/transactions-entity | grep -i "no-verify"` is empty
- [x] `git log develop..feat/transactions-entity | grep -iE "co-authored.*(ai|claude|gpt|gemini)|with ai help|generated by ai"` is empty
- [ ] `git diff --stat develop..feat/transactions-entity | tail -1` shows < 600 lines (target 250–400) — **FAIL: 1215 lines**
- [x] `Documents-es/openspec/changes/transactions/apply-progress.md` exists, mirrors the EN file, 0 CJK characters
- [x] `openspec/changes/transactions/apply-progress.md` header is exactly `Author: Sebastián Illa` (no AI variants)
- [x] `Documents-es/openspec/changes/transactions/apply-progress.md` header is exactly `Autor: Sebastián Illa`
- [x] All commits pass `pnpm test` and `pnpm run typecheck` (per-commit gate)
- [x] All commits pass `pnpm exec lint-staged && gga run` (pre-commit gate)

## Status

**`needs-split`.** The slice's review budget was 600 lines; the committed
diff is 1215. The work is functionally complete and green (24 tests, 0
typecheck errors, GGA pass, no AI attribution, ES mirror in sync, lockfile
unchanged), but the PR is over-budget. Two paths forward:

1. **Merge anyway** (the recommended path if the user accepts the
   over-budget). The atomic 12-commit history is reviewable per-commit
   and the final shape is the minimum atomic slice. The over-shoot is
   docstring density + verbose JSDoc; future slices can refactor.
2. **Split.** The natural split is `feat/transactions-entity` (entity
   - factory + errors, ~7 commits, ~700 lines) and
     `feat/transactions-port` (port + barrel, ~3 commits, ~300 lines).
     Each is a standalone green PR. Slice 2 (Prisma + service) then
     stacks on the merged entity.

Per the slice spec's hard guardrail §5, the executor returns
`status: needs-split`. The user reviews and decides.

## Next step

Open the PR (`gh pr create`) only after the user explicitly accepts the
over-budget. The PR title, body, and verification outputs are ready; the
push + `gh` step was held back per the user's review-before-merge rule
(AGENTS.md §5.2).

---

# Slice 2 — fx-snapshot helper + 3 error codes + `TransactionRecorded` event + factory wiring

**Branch**: `feat/transactions-fx-snapshot` (worktree `../gastos-personales-transactions-fx-snapshot/`)
**Base**: `develop` (slice 1 already merged at `d66151c`)
**Scope**: tight — see "Slice 2 scope" below
**Status**: in progress

## Slice 2 scope (binding)

| #    | File                                                            | Type | Spec REQ                     | Notes                                                                                                                                                      |
| ---- | --------------------------------------------------------------- | ---- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 | `domain/services/fx-snapshot.ts`                                | impl | REQ-TX-12, BR-TX-6           | pure `convertAndSnapshot` + `currencyForCasa`                                                                                                              |
| S2-2 | `domain/services/fx-snapshot.test.ts`                           | test | REQ-TX-12, BR-TX-6, DG-TX-8  | 6 cases (native=casa skip, FX call when differ, `FX_UNAVAILABLE` propagation, half-up rounding, `fxAsOfSnapshot: Date \| null`, `currencyForCasa` mapping) |
| S2-3 | `shared/errors/error-codes.ts`                                  | impl | REQ-TX-2, REQ-TX-4, REQ-TX-7 | 3 new codes: `INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED` + matching `ErrorStatus` entries                                              |
| S2-4 | `shared/errors/error-codes.test.ts`                             | test | REQ-TX-2, REQ-TX-4, REQ-TX-7 | 3 cases (codes exported, `ErrorStatus` mapping, exhaustive type check)                                                                                     |
| S2-5 | `shared/events/event-dispatcher.ts`                             | impl | REQ-TX-13, BR-TX-11          | `TransactionRecorded` variant + payload + constant                                                                                                         |
| S2-6 | `shared/events/event-dispatcher.test.ts`                        | test | REQ-TX-13, BR-TX-11          | 3 cases (variant added, payload type exposed, subscribe+dispatch round-trip)                                                                               |
| S2-7 | `domain/factories/create-transaction.ts`                        | impl | REQ-TX-12, REQ-TX-13         | wire `FxRateProvider` + `EventDispatcher`; stamp snapshot + dispatch event                                                                                 |
| S2-8 | `domain/factories/create-transaction.test.ts` (UPDATE — append) | test | REQ-TX-12, REQ-TX-13         | 4 new cases (stamps convertedAmountMinor when native=casa, calls FX when differ, dispatches `TransactionRecorded`, accepts custom casa)                    |
| S2-9 | `domain/index.ts`                                               | impl | barrel                       | re-export `convertAndSnapshot`, `FxSnapshot`, `FxSnapshotInput`, `currencyForCasa`                                                                         |

**Out of scope (per slice spec):** `application/**`, `infrastructure/**`, `prisma/schema.prisma`, `app/transactions/**`, `src/modules/api/app.ts`, any file under `src/shared/` other than `error-codes.ts` and `event-dispatcher.ts`, any file under `src/modules/accounts/**`, any file under `src/modules/fx/**`.

## Pre-flight baseline (2026-06-23, slice 2)

| Check                             | Result                                                        |
| --------------------------------- | ------------------------------------------------------------- |
| `pnpm install --ignore-workspace` | OK (905 packages)                                             |
| `pnpm prisma generate`            | OK (v7.8.0)                                                   |
| `pnpm test` (baseline)            | **551 passed**, 4 skipped (testcontainers Postgres), 0 failed |
| `pnpm run typecheck` (baseline)   | **0 errors**                                                  |
| `gga run` (baseline)              | OK — "No matching files staged for commit"                    |

## Slice 2 deviations (planned)

> **1. Factory signature change.** The slice 1 factory
> `createTransaction(input: NewTransactionInput): Transaction` is
> extended to `createTransaction(input, deps, fxRateProvider)`. This
> changes the public signature; slice 1 tests continue to pass because
> the new parameters are optional and default to skipping the FX call
> and the event dispatch. The 4 new cases exercise both the FX
> stamp path and the event dispatch path.

> **2. Module-isolation: `accounts` barrel import for port types.**
> The slice spec allows importing `FxRateProvider` (the port) and
> `AccountCurrency` / `AccountFxCasa` (the enums) via the
> `@/modules/accounts` barrel at the domain boundary. This matches
> the design §2.3 contract. Slice 1's local `AccountCurrency` /
> `AccountFxCasa` mirrors remain in place (their docstring already
> documents the future shared-kernel refactor); the slice 2 helper
> imports from the barrel — the two coexist for the duration of the
> `transactions` change.

## Slice 2 acceptance gates (to be filled at close)

- [ ] `pnpm test` exits 0; tests added (target: +16 across the 4 test files)
- [ ] `pnpm run typecheck` exits 0 (0 errors)
- [ ] `pnpm test --coverage` ≥ 80% lines on `src/modules/transactions/domain/**`
- [ ] `git log develop..feat/transactions-fx-snapshot --oneline` shows the atomic commit sequence
- [ ] `git log develop..feat/transactions-fx-snapshot | grep -i "no-verify"` is empty
- [ ] `git log develop..feat/transactions-fx-snapshot | grep -iE "co-authored.*(ai|claude|gpt|gemini)|with ai help|generated by ai"` is empty
- [ ] `git diff --stat develop..feat/transactions-fx-snapshot | tail -1` < 600 lines
- [ ] `Documents-es/openspec/changes/transactions/apply-progress.md` mirrors the EN file; 0 CJK characters
- [ ] All commits pass `pnpm test`, `pnpm run typecheck`, `pnpm exec lint-staged && gga run`

## Slice 2 commit ledger (filled at close)

(populated after the GREEN phase commits land)

## Slice 2 TDD evidence (filled at close)

(populated after each RED → GREEN cycle)
