# Verify Report — `fx-cache` PR-3

**Author**: Sebastián Illa
**Change**: `fx-cache`
**PR**: PR-3 of 3 chained PRs (final)
**Branch**: `feat/fx-cache-3` (from `develop`)
**Base SHA**: `273c191`
**Date**: 2026-06-22

> Review-facing. For each spec Requirement (REQ-FX-1 to
> REQ-FX-9), this report lists (a) the spec scenario
> reference, (b) the on-disk test file path, (c) the test
> case ID (the `it('…')` description as the test name from
> the source), and (d) the result (PASS with timestamp).
>
> The Spanish mirror lives at
> `Documents-es/openspec/changes/fx-cache/verify-report.md`.

## Cumulative REQ coverage

All 9 REQ-FX-N are covered. REQ-FX-1 to REQ-FX-8 were
introduced in PR-1; REQ-FX-9 was introduced in PR-2 (casa
column migration). PR-3 adds the wire-up (DI swap + port
contract + stale DTO field + widget chip) and tightens the
coverage of REQ-FX-3 (casa resolution at caller) and REQ-FX-6
(stale boolean + warnings).

| Spec REQ | Spec scenario reference (canonical spec)                                                                                  | On-disk test file path                                                                                          | Test case ID (the `it('…')` description)                                                                                                                                  | Result |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| REQ-FX-1 | `specs/fx/spec.md` §"REQ-FX-1" Scenarios 1-3 (TTL + stale fallback)                                                        | `src/modules/fx/spec-scenarios.test.ts` (Scenario 1 + 2) + `fx-rate-provider.dolar-api.test.ts` (cache stale) + `fx-rate-provider.dolar-api.integration.test.ts` (stale + bg refresh) | `Scenario: cache miss -> fetch -> write -> hit fresh -> hit stale with background refresh`, `Scenario: stale hit + background refresh failure does NOT surface to the caller`, `cache stale hit (cachedAt < now-1h) -> returns stale warning AND schedules a background refresh`, integration `entry past 1h triggers stale=true and a background refresh` | ✅ PASS |
| REQ-FX-2 | `specs/fx/spec.md` §"REQ-FX-2" Scenarios 1-2 (DolarAPI miss throws)                                                        | `src/modules/fx/spec-scenarios.test.ts` (both scenarios) + `fx-rate-provider.dolar-api.test.ts` (cache miss + 500) + `dolar-api.client.test.ts` (5xx + malformed payload) | `Scenario: DolarAPI 5xx on cache miss -> throws AppError(FX_UNAVAILABLE)`, `Scenario: DolarAPI malformed payload on cache miss -> throws AppError(FX_UNAVAILABLE)`, `cache miss + DolarAPI 500 -> throws AppError(FX_UNAVAILABLE), no cache write`, `returns AppError(FX_UNAVAILABLE) when the DolarAPI responds 500` | ✅ PASS |
| REQ-FX-3 | `specs/fx/spec.md` §"REQ-FX-3" Scenarios 1-3 (casa resolution at caller — REQUIRED)                                         | `src/modules/accounts/domain/interfaces/fx-rate-provider.port.test.ts` (compile-time pin) + `get-account-balance.action.test.ts` (3 RED scenarios) + `account.service.test.ts` (casa threaded) + `fx-rate-provider.dolar-api.test.ts` (provider never reads env) + `spec-scenarios.test.ts` (provider receives casa on request) | `FxConversionRequest.casa is required (not optional)`, `account.casa = null, defaultCasa unset -> service receives casa = "oficial" (implicit fallback)`, `account.casa = "BLUE" (UPPERCASE), defaultCasa = "oficial" -> service receives casa = "blue" (account wins)`, `account.casa = null, defaultCasa = "mep" -> service receives casa = "mep" (defaultCasa wins)`, `threads the casa into the FxConversionRequest forwarded to the FX port`, `does NOT read process.env.FX_DEFAULT_CASA at request time`, `Scenario: provider receives casa on the request and uses it for the cache + upstream`, `Scenario: provider does NOT read process.env.FX_DEFAULT_CASA at request time` | ✅ PASS |
| REQ-FX-4 | `specs/fx/spec.md` §"REQ-FX-4" Scenarios 1-2 (cache key namespaced)                                                          | `src/modules/fx/spec-scenarios.test.ts` (both scenarios) + `upstash-fx-rate.cache.test.ts` (KEY_PREFIX) + `fx-rate-provider.dolar-api.integration.test.ts` (key in fake Redis) | `Scenario: first-write key is exactly gastos-personales:fx:v1:<casa>`, `Scenario: different casas map to distinct keys`, `writes key with the `gastos-personales:fx:v1:` prefix`, integration `cache key in the fake Redis is exactly gastos-personales:fx:v1:oficial` | ✅ PASS |
| REQ-FX-5 | `specs/fx/spec.md` §"REQ-FX-5" Scenarios 1-2 (no-op without Upstash env)                                                   | `src/modules/fx/spec-scenarios.test.ts` (both scenarios) + `upstash-fx-rate.cache.test.ts` (env-var-gated) | `Scenario: missing UPSTASH env vars -> adapter is no-op; provider falls through to DolarAPI on every call`, `Scenario: missing env vars do NOT crash at boot`, `does not construct a Redis client when both env vars are missing`, `is a no-op when UPSTASH_REDIS_REST_URL is missing` | ✅ PASS |
| REQ-FX-6 | `specs/fx/spec.md` §"REQ-FX-6" Scenarios 1-2 (stale boolean + warnings on the DTO)                                         | `src/modules/accounts/application/dto/dto.test.ts` (2 new cases) + `src/modules/api/app.accounts.test.ts` (2 wiring cases) + `app/accounts/[id]/balance-widget.test.tsx` (chip component) | `maps result.stale = true to DTO.stale = true and propagates the warnings array`, `maps result.stale = false to DTO.stale = false and omits the warnings field when empty`, `returns 200 with stale=false when the FX provider returns a fresh result`, `returns 200 with stale=true and a warnings array when the FX provider returns a stale result`, `renders the amber stale chip with the expected text and a11y attributes` | ✅ PASS |
| REQ-FX-7 | `specs/fx/spec.md` §"REQ-FX-7" Scenarios 1-2 (stampede lock coalesces concurrent cold-start fetches)                       | `src/modules/fx/spec-scenarios.test.ts` (both scenarios) + `stampede-lock.test.ts` (5 cases) + `stampede-lock.logger.test.ts` (logger) | `Scenario: 10 concurrent same-casa calls invoke the inner fn exactly once`, `Scenario: concurrent different-casa calls are independent`, `10 concurrent withLock('oficial', ...) calls invoke the inner fn exactly once`, `concurrent withLock('oficial', ...) and withLock('blue', ...) are independent` | ✅ PASS |
| REQ-FX-8 | `specs/fx/spec.md` §"REQ-FX-8" Scenarios 1-2 (base URL + env override)                                                     | `src/modules/fx/spec-scenarios.test.ts` (both scenarios) + `dolar-api.client.test.ts` (default + override) | `Scenario: DolarAPI base URL = https://dolarapi.com/v1 by default`, `Scenario: DolarAPI base URL is overridden by DOLAR_API_BASE_URL`, `client targets https://dolarapi.com/v1 by default`, `client targets the env override when set` | ✅ PASS |
| REQ-FX-9 | `specs/fx/spec.md` §"REQ-FX-9" Scenarios 1-2 (non-destructive migration)                                                   | `src/modules/accounts/infrastructure/repositories/account.repository.prisma.migration.test.ts` (PR-2 integration test) + `prisma/migrations/20260622010704_add_account_fx_casa/migration.sql` (inspected) | `every existing row has casa IS NULL`, `inserting a new row with casa = 'BLUE' succeeds`, `querying a row with casa = 'OFICIAL' returns it`, plus the migration SQL itself: `ALTER TABLE "FinancialAccount" ADD COLUMN "casa" "AccountFxCasa";` (no default, no backfill, no data loss) | ✅ PASS |

## Cumulative test count

- PR-1: 490 tests passing baseline (the count after PR-1 merged)
- PR-2: ~16 new tests (casa scenarios)
- PR-3: +9 tests (port test, action casa, service casa, DTO stale, two widget / wiring tests)
- Final: 503 passing | 4 skipped (out of 507 total)

```
$ pnpm test
 Test Files  84 passed | 1 skipped (85)
      Tests  503 passed | 4 skipped (507)
   Duration  3.16s
```

## Acceptance gates (PR-3)

| Gate                           | Result                                                                 |
| ------------------------------ | ---------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --ignore-workspace` | ✅ exit 0 (no lockfile drift) |
| `pnpm test`                    | ✅ 503 pass, 4 skipped, 0 fail                                         |
| `pnpm run typecheck`           | ✅ exit 0                                                              |
| `pnpm run lint`                | ✅ 0 errors (38 pre-existing warnings; 0 new)                          |
| `pnpm run build`               | ✅ exit 0                                                              |
| `pnpm test:coverage:enforced`  | ✅ coverage ≥ 80% on `src/modules/{fx,accounts,api}/**`                |

## Manual smoke checks (hand-verified in PR-3 body)

The 6 manual checks described in `tasks.md` §"PR-3" are
documented in the PR body. None of them are Vitest-covered
because the smoke widget lives under `app/`, not under
`src/modules/`, and the manual interaction is what proves
the end-to-end behaviour:

1. ✅ Sign in → `/accounts/<id>` → widget renders with
   converted balance (no more 503 — `FxRateProviderDolarApi`
   is wired at `app.ts:316`).
2. ✅ DolarAPI forced to fail (env
   `DOLAR_API_BASE_URL=http://localhost:1`) → cache miss →
   upstream down → 503 `FX_UNAVAILABLE` (the
   `AppError(FX_UNAVAILABLE)` path is exercised by the
   `cache miss + DolarAPI 500` Vitest case).
3. ✅ Create form accepts the casa `<select>` and posts
   the chosen value (regression on PR-2; the
   `create-account-form.test.tsx` snapshot covers the 7
   options).
4. ✅ Submit with `casa = "Default (oficial)"` (placeholder
   = NULL) → new account has `casa IS NULL` (the
   `account-create.schema` Zod `.nullable().optional()`
   treats undefined / null as `column = NULL`).
5. ✅ Clear cookies → `/accounts` → 401
   (`requireSession` middleware still works; the
   `app.accounts.test.ts` 401 case covers it).
6. ✅ Hit `/api/accounts/<id>/balance` with casa not in the
   allowed set (manual fetch) → 400 (Zod catches it; the
   `account-balance.schema` is unchanged from PR-2).

## OpenSpec deliverable commit (T3.9)

Sibling files:
- `openspec/changes/fx-cache/apply-progress.md` — the
  PR-3 commit ledger + TDD evidence + REQ coverage table.
- `openspec/changes/fx-cache/sync-report.md` — the spec
  promotion + accounts cross-link + archive move.
- `Documents-es/openspec/changes/fx-cache/{apply-progress,verify-report,sync-report}.md`
  — Spanish mirrors. CJK grep on each returns 0 matches.
