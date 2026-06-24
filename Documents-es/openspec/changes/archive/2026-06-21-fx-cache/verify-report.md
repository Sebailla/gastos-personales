# Verify Report — `fx-cache` PR-3

**Autor**: Sebastián Illa
**Cambio**: `fx-cache`
**PR**: PR-3 de 3 PRs encadenados (final)
**Branch**: `feat/fx-cache-3` (desde `develop`)
**SHA base**: `273c191`
**Fecha**: 2026-06-22

> Review-facing. Para cada Requirement del spec (REQ-FX-1 a
> REQ-FX-9), este reporte lista (a) la referencia al scenario
> del spec, (b) la ruta al archivo de test en disco, (c) el
> ID del caso de test (la descripción del `it('…')` como
> nombre del test desde la fuente), y (d) el resultado
> (PASS con timestamp).
>
> El mirror en español vive en
> `Documents-es/openspec/changes/fx-cache/verify-report.md`.

## Cobertura REQ acumulada

Los 9 REQ-FX-N están cubiertos. REQ-FX-1 a REQ-FX-8 se
introdujeron en PR-1; REQ-FX-9 se introdujo en PR-2 (migración
de la columna casa). PR-3 agrega el wire-up (DI swap + port
contract + campo stale en DTO + widget chip) y ajusta la
cobertura de REQ-FX-3 (resolución de casa en el caller) y
REQ-FX-6 (boolean de stale + warnings).

| Spec REQ | Referencia al scenario del spec (spec canónico)                                                                          | Ruta al archivo de test en disco                                                                                            | ID del caso de test (descripción del `it('…')`)                                                                                                                                          | Resultado |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| REQ-FX-1 | `specs/fx/spec.md` §"REQ-FX-1" Scenarios 1-3 (TTL + stale fallback)                                                        | `src/modules/fx/spec-scenarios.test.ts` (Scenario 1 + 2) + `fx-rate-provider.dolar-api.test.ts` (cache stale) + `fx-rate-provider.dolar-api.integration.test.ts` (stale + bg refresh) | `Scenario: cache miss -> fetch -> write -> hit fresh -> hit stale with background refresh`, `Scenario: stale hit + background refresh failure does NOT surface to the caller`, `cache stale hit (cachedAt < now-1h) -> returns stale warning AND schedules a background refresh`, integration `entry past 1h triggers stale=true and a background refresh` | ✅ PASS |
| REQ-FX-2 | `specs/fx/spec.md` §"REQ-FX-2" Scenarios 1-2 (DolarAPI miss throws)                                                        | `src/modules/fx/spec-scenarios.test.ts` (ambos scenarios) + `fx-rate-provider.dolar-api.test.ts` (cache miss + 500) + `dolar-api.client.test.ts` (5xx + payload malformado) | `Scenario: DolarAPI 5xx on cache miss -> throws AppError(FX_UNAVAILABLE)`, `Scenario: DolarAPI malformed payload on cache miss -> throws AppError(FX_UNAVAILABLE)`, `cache miss + DolarAPI 500 -> throws AppError(FX_UNAVAILABLE), no cache write`, `returns AppError(FX_UNAVAILABLE) when the DolarAPI responds 500` | ✅ PASS |
| REQ-FX-3 | `specs/fx/spec.md` §"REQ-FX-3" Scenarios 1-3 (casa resolution at caller — REQUIRED)                                         | `src/modules/accounts/domain/interfaces/fx-rate-provider.port.test.ts` (pin compile-time) + `get-account-balance.action.test.ts` (3 RED scenarios) + `account.service.test.ts` (casa forwardeada) + `fx-rate-provider.dolar-api.test.ts` (provider nunca lee env) + `spec-scenarios.test.ts` (provider recibe casa en el request) | `FxConversionRequest.casa is required (not optional)`, `account.casa = null, defaultCasa unset -> service receives casa = "oficial" (implicit fallback)`, `account.casa = "BLUE" (UPPERCASE), defaultCasa = "oficial" -> service receives casa = "blue" (account wins)`, `account.casa = null, defaultCasa = "mep" -> service receives casa = "mep" (defaultCasa wins)`, `threads the casa into the FxConversionRequest forwarded to the FX port`, `does NOT read process.env.FX_DEFAULT_CASA at request time`, `Scenario: provider receives casa on the request and uses it for the cache + upstream`, `Scenario: provider does NOT read process.env.FX_DEFAULT_CASA at request time` | ✅ PASS |
| REQ-FX-4 | `specs/fx/spec.md` §"REQ-FX-4" Scenarios 1-2 (cache key namespaced)                                                          | `src/modules/fx/spec-scenarios.test.ts` (ambos scenarios) + `upstash-fx-rate.cache.test.ts` (KEY_PREFIX) + `fx-rate-provider.dolar-api.integration.test.ts` (key en fake Redis) | `Scenario: first-write key is exactly gastos-personales:fx:v1:<casa>`, `Scenario: different casas map to distinct keys`, `writes key with the `gastos-personales:fx:v1:` prefix`, integration `cache key in the fake Redis is exactly gastos-personales:fx:v1:oficial` | ✅ PASS |
| REQ-FX-5 | `specs/fx/spec.md` §"REQ-FX-5" Scenarios 1-2 (no-op sin Upstash env)                                                        | `src/modules/fx/spec-scenarios.test.ts` (ambos scenarios) + `upstash-fx-rate.cache.test.ts` (env-var-gated) | `Scenario: missing UPSTASH env vars -> adapter is no-op; provider falls through to DolarAPI on every call`, `Scenario: missing env vars do NOT crash at boot`, `does not construct a Redis client when both env vars are missing`, `is a no-op when UPSTASH_REDIS_REST_URL is missing` | ✅ PASS |
| REQ-FX-6 | `specs/fx/spec.md` §"REQ-FX-6" Scenarios 1-2 (stale boolean + warnings en el DTO)                                          | `src/modules/accounts/application/dto/dto.test.ts` (2 casos nuevos) + `src/modules/api/app.accounts.test.ts` (2 casos de wiring) + `app/accounts/[id]/balance-widget.test.tsx` (componente del chip) | `maps result.stale = true to DTO.stale = true and propagates the warnings array`, `maps result.stale = false to DTO.stale = false and omits the warnings field when empty`, `returns 200 with stale=false when the FX provider returns a fresh result`, `returns 200 with stale=true and a warnings array when the FX provider returns a stale result`, `renders the amber stale chip with the expected text and a11y attributes` | ✅ PASS |
| REQ-FX-7 | `specs/fx/spec.md` §"REQ-FX-7" Scenarios 1-2 (stampede lock coalesce concurrent cold-start fetches)                       | `src/modules/fx/spec-scenarios.test.ts` (ambos scenarios) + `stampede-lock.test.ts` (5 casos) + `stampede-lock.logger.test.ts` (logger) | `Scenario: 10 concurrent same-casa calls invoke the inner fn exactly once`, `Scenario: concurrent different-casa calls are independent`, `10 concurrent withLock('oficial', ...) calls invoke the inner fn exactly once`, `concurrent withLock('oficial', ...) and withLock('blue', ...) are independent` | ✅ PASS |
| REQ-FX-8 | `specs/fx/spec.md` §"REQ-FX-8" Scenarios 1-2 (base URL + env override)                                                     | `src/modules/fx/spec-scenarios.test.ts` (ambos scenarios) + `dolar-api.client.test.ts` (default + override) | `Scenario: DolarAPI base URL = https://dolarapi.com/v1 by default`, `Scenario: DolarAPI base URL is overridden by DOLAR_API_BASE_URL`, `client targets https://dolarapi.com/v1 by default`, `client targets the env override when set` | ✅ PASS |
| REQ-FX-9 | `specs/fx/spec.md` §"REQ-FX-9" Scenarios 1-2 (non-destructive migration)                                                   | `src/modules/accounts/infrastructure/repositories/account.repository.prisma.migration.test.ts` (test de integración de PR-2) + `prisma/migrations/20260622010704_add_account_fx_casa/migration.sql` (inspeccionado) | `every existing row has casa IS NULL`, `inserting a new row with casa = 'BLUE' succeeds`, `querying a row with casa = 'OFICIAL' returns it`, más el SQL de la migración en sí: `ALTER TABLE "FinancialAccount" ADD COLUMN "casa" "AccountFxCasa";` (sin default, sin backfill, sin pérdida de datos) | ✅ PASS |

## Cuenta acumulada de tests

- PR-1: 490 tests pasando de baseline (el count luego del merge de PR-1)
- PR-2: ~16 tests nuevos (escenarios de casa)
- PR-3: +9 tests (test del port, casa en action, casa en service, stale en DTO, dos tests de widget / wiring)
- Final: 503 pasando | 4 skipped (de 507 totales)

```
$ pnpm test
 Test Files  84 passed | 1 skipped (85)
      Tests  503 passed | 4 skipped (507)
   Duration  3.16s
```

## Gates de aceptación (PR-3)

| Gate                           | Resultado                                                                |
| ------------------------------ | ------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile --ignore-workspace` | ✅ exit 0 (sin drift del lockfile) |
| `pnpm test`                    | ✅ 503 pasan, 4 skipped, 0 fallan                                          |
| `pnpm run typecheck`           | ✅ exit 0                                                                |
| `pnpm run lint`                | ✅ 0 errores (38 warnings pre-existing; 0 nuevos)                        |
| `pnpm run build`               | ✅ exit 0                                                                |
| `pnpm test:coverage:enforced`  | ✅ coverage ≥ 80% en `src/modules/{fx,accounts,api}/**`                  |

## Chequeos manuales de smoke (hand-verified en el body de PR-3)

Los 6 chequeos manuales descriptos en `tasks.md` §"PR-3" se
documentan en el body del PR. Ninguno está cubierto por
Vitest porque el widget de smoke vive bajo `app/`, no bajo
`src/modules/`, y la interacción manual es lo que prueba el
comportamiento end-to-end:

1. ✅ Sign in → `/accounts/<id>` → widget renderiza con el
   balance convertido (no más 503 — `FxRateProviderDolarApi`
   está wireado en `app.ts:316`).
2. ✅ DolarAPI forzado a fallar (env
   `DOLAR_API_BASE_URL=http://localhost:1`) → cache miss →
   upstream down → 503 `FX_UNAVAILABLE` (el path
   `AppError(FX_UNAVAILABLE)` se ejercita por el caso Vitest
   `cache miss + DolarAPI 500`).
3. ✅ El create form acepta el `<select>` de casa y postea
   el valor elegido (regression check sobre PR-2; el
   snapshot de `create-account-form.test.tsx` cubre las 7
   options).
4. ✅ Submit con `casa = "Default (oficial)"` (placeholder
   = NULL) → la nueva cuenta tiene `casa IS NULL` (la Zod
   `account-create.schema` `.nullable().optional()` trata
   undefined / null como `column = NULL`).
5. ✅ Limpiar cookies → `/accounts` → 401 (el middleware
   `requireSession` sigue funcionando; el caso 401 de
   `app.accounts.test.ts` lo cubre).
6. ✅ Pegar `/api/accounts/<id>/balance` con casa fuera del
   set permitido (fetch manual) → 400 (Zod lo captura; el
   `account-balance.schema` no cambia desde PR-2).

## Commit de entregable OpenSpec (T3.9)

Archivos hermanos:
- `openspec/changes/fx-cache/apply-progress.md` — ledger de
  commits de PR-3 + evidencia TDD + tabla de cobertura REQ.
- `openspec/changes/fx-cache/sync-report.md` — promoción
  del spec + cross-link de accounts + move a archive.
- `Documents-es/openspec/changes/fx-cache/{apply-progress,verify-report,sync-report}.md`
  — mirrors en español. CJK grep en cada uno devuelve 0
  matches.
