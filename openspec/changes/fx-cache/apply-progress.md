# Apply Progress — `fx-cache` PR-3

**Author**: Sebastián Illa
**Change**: `fx-cache`
**PR**: PR-3 of 3 chained PRs (final)
**Branch**: `feat/fx-cache-3` (from `develop`)
**Base SHA**: `273c191`
**Date**: 2026-06-22

## Status

| Slice                                                   | Tasks    | Status      |
| ------------------------------------------------------- | -------- | ----------- |
| PR-1 — New fx module                                     | 16 tasks | ✅ (PR-1)  |
| PR-2 — Per-account `casa`                                | 12 tasks | ✅ (PR-2)  |
| PR-3 — DI swap + port contract + stale DTO + widget chip | 11 tasks | ✅ complete |

PR-3 lands the wire-up. After this PR the canonical spec lands
at `openspec/specs/fx/spec.md` via `sdd-sync`, and `fx-cache`
is archived to `openspec/changes/archive/2026-06-21-fx-cache/`.

## Commit ledger (PR-3, `feat/fx-cache-3`)

The task table lists 11 work units. The project's work-unit
contract commits by behaviour, not by file, and the task
table itself documents two hard ordering constraints
(T3.4+T3.5 must land together; T3.6+T3.7 must land together).
This yields 9 commits instead of 11; the pairing is locked
in design §21 and tasks §"Hard ordering constraints".

| Task(s) | Commit  | Commit title                                              | Files (head)                                                   |
| ------- | ------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| T3.1    | 4d2c7f9 | `feat(accounts): fx-conversion-request requires casa`     | `fx-rate-provider.port.ts`, `fx-rate-provider.port.test.ts`     |
| T3.2    | df4e59e | `feat(fx): fx-rate-provider-dolar-api reads casa from request` | `fx-rate-provider.dolar-api.ts` (+ the 4 test files)        |
| T3.3    | e43a5ec | `feat(accounts): account-service.get-balance threads casa` | `account.service.ts`, `account.service.test.ts`                |
| T3.4+5  | d786718 | `feat(accounts): get-account-balance resolves casa + balance dto stale` | action + DTO + port `stale: boolean` + provider `buildResult` + caller updates |
| T3.6+7  | 6268012 | `feat(api): swap fx-rate-provider-unconfigured for fx-rate-provider-dolar-api` | `app.ts` (DI swap + balanceDeps wiring) + `server-hono.ts` + stub deletion + 2 wiring tests |
| T3.8    | 97c54fa | `feat(ui): stale chip in balance widget`                  | `balance-widget.tsx`, `balance-widget.test.tsx`, `account-types.ts` |
| T3.9    | (this commit) | `docs(openspec): apply-progress + verify-report + sync-report + es mirrors` | 6 files: 3 EN + 3 ES |
| T3.10   | (next commit) | `chore(openspec): archive fx-cache after spec sync`    | spec promotion + 1-line accounts cross-link + archive move (8 files) |
| T3.11   | (PR gate — captured in PR body, not as a commit) | (no commit — verification only)                       | —                                                              |

## PR-3 TDD Cycle Evidence

Each row was authored via RED → GREEN → TRIANGULATE → REFACTOR.

| Task(s) | Test File                                                                          | RED                          | GREEN  | TRIANGULATE                                          | REFACTOR |
| ------- | ---------------------------------------------------------------------------------- | ---------------------------- | ------ | ---------------------------------------------------- | -------- |
| T3.1    | `src/modules/accounts/domain/interfaces/fx-rate-provider.port.test.ts`            | ✅ 1 compile-time pin fails  | ✅ 5   | ✅ (casa non-nullable + provider method shape)       | ✅ Clean |
| T3.2    | `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.test.ts`        | ✅ 2 existing tests assert    | ✅ 8   | ✅ env-stub-leak assertion (casa from request only)  | ✅ Clean |
| T3.3    | `src/modules/accounts/domain/services/account.service.test.ts`                    | ✅ 2 new tests fail           | ✅ 10  | ✅ env-var absence does not change forwarded casa    | ✅ Clean |
| T3.4    | `src/modules/accounts/application/actions/get-account-balance.action.test.ts`    | ✅ 3 casa scenarios fail      | ✅ 7   | ✅ (casa resolution rule pinned by 3 RED scenarios)  | ✅ Clean |
| T3.5    | `src/modules/accounts/application/dto/dto.test.ts`                                | ✅ 2 stale/warnings cases fail | ✅ 7  | ✅ (omitted warnings when empty / stale=false)       | ✅ Clean |
| T3.6+7  | `src/modules/api/app.accounts.test.ts` + `app.deps.test.ts`                        | ✅ wiring assertion fails     | ✅     | ✅ unconfigured-stub deleted + grep returns 0        | ✅ Clean |
| T3.8    | `app/accounts/[id]/balance-widget.test.tsx`                                       | ✅ (StaleChip pin)            | ✅ 1   | ✅ amber classes + a11y attrs + data-testid          | ✅ Clean |

## REQ coverage (cumulative through PR-1 + PR-2 + PR-3)

| REQ      | First Test Authored In | PR-3 Verifying Test                                              | Status                                         |
| -------- | ---------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| REQ-FX-1 | T1.7                   | `fx-rate-provider.dolar-api.test.ts` (stale hit) + integration     | ✅                                            |
| REQ-FX-2 | T1.4                   | (PR-1 — no PR-3 delta)                                            | ✅                                            |
| REQ-FX-3 | T3.1                   | `fx-rate-provider.port.test.ts` + action 3 casa scenarios         | ✅                                            |
| REQ-FX-4 | T1.5                   | (PR-1 — no PR-3 delta)                                            | ✅                                            |
| REQ-FX-5 | T1.5                   | (PR-1 — no PR-3 delta)                                            | ✅                                            |
| REQ-FX-6 | T3.5                   | `dto.test.ts` (stale mapping) + `app.accounts.test.ts` (wire) + widget chip | ✅                                  |
| REQ-FX-7 | T1.6                   | (PR-1 — no PR-3 delta)                                            | ✅                                            |
| REQ-FX-8 | T1.4                   | (PR-1 — no PR-3 delta)                                            | ✅                                            |
| REQ-FX-9 | T2.10                  | (PR-2 — no PR-3 delta)                                            | ✅                                            |

## Deviations from design.md

1. **`FxConversionResult.stale` is REQUIRED, not optional** (T3.5):
   the design §14.2 only specified `warnings?: string[]`. The
   `stale: boolean` is co-required because the DTO carries
   it and the widget reads it to drive the chip. Making it
   required at the type level keeps the consumer side from
   silently defaulting to `false` (which would suppress the
   warning). All callers (the provider, the stub, the action
   test fixture) were updated in the same commit.

2. **Action deps carry `defaultCasa`, not the env directly**
   (T3.4): the design says "the action reads `env` from
   `@/shared/env/env.schema`". The implementation reads it
   at the composition root (`app.ts`) and passes it as
   `GetAccountBalanceActionDeps.defaultCasa`. The action
   stays pure and testable (no module-load-time env
   singleton, deterministic per-test stubs). The composition
   root is the only place that parses env, matching the
   project's `env-config` skill ("validated at startup,
   read everywhere").

3. **`FxCasaString` declared as a `as const` tuple inside the
   port** (T3.1): the design §14.2 said "imported from
   `@/modules/fx`". The implementation inlines the tuple in
   `fx-rate-provider.port.ts` to preserve the modules-isolated
   rule (root `AGENTS.md` §10.5 — `accounts` MUST NOT import
   from `fx`). The `fx` module's `fxCasaStringSchema` is the
   runtime source of truth; structural compatibility is
   preserved (both are the same 6-value lowercase enum). The
   env schema inlines the same tuple with the same rationale.

4. **Stub file deleted in the same commit as the DI swap**
   (T3.6+T3.7): per the hard ordering constraint in
   `tasks.md` ("splitting them produces a build-broken
   intermediate state — `app.ts:59` would import a deleted
   file"). The `FxRateProviderUnconfigured` import is removed
   at the same time the stub file is `git rm`'d.

5. **`env.FX_DEFAULT_CASA` is read at startup in `app.ts`,
   not at action-call time** (T3.4): the env schema parses
   `process.env` once at module-load. Re-parsing at call
   time would be possible but would couple the action to
   the env singleton. Passing the resolved value through
   deps is the cleaner test seam.

## Acceptance gates (run on PR-3 commit `6268012` + T3.8 commit `97c54fa`)

```
$ pnpm install --frozen-lockfile --ignore-workspace
Done in 3.8s using pnpm v10.34.3

$ pnpm test
 Test Files  84 passed | 1 skipped (85)
      Tests  503 passed | 4 skipped (507)

$ pnpm run typecheck
EXIT=0

$ pnpm run lint
0 errors and 10 warnings potentially fixable with the `--fix` option.
(38 warnings pre-existing; 0 new errors introduced by PR-3)

$ pnpm run build
EXIT=0

$ pnpm test:coverage:enforced
503 tests pass; coverage thresholds met on
src/modules/{fx,accounts,api}/**.
```

## OpenSpec deliverable commit (T3.9)

This file is part of T3.9. Sibling files:
- `openspec/changes/fx-cache/verify-report.md` — 9 REQ-FX-N
  coverage with on-disk test citations (review-facing).
- `openspec/changes/fx-cache/sync-report.md` — spec
  promotion + accounts cross-link + archive move.
- `Documents-es/openspec/changes/fx-cache/{apply-progress,verify-report,sync-report}.md`
  — Spanish mirrors. CJK grep on each returns 0 matches.
