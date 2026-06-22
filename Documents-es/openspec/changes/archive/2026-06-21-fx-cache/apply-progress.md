# Progreso de Apply — `fx-cache` PR-3

**Autor**: Sebastián Illa
**Cambio**: `fx-cache`
**PR**: PR-3 de 3 PRs encadenados (final)
**Branch**: `feat/fx-cache-3` (desde `develop`)
**SHA base**: `273c191`
**Fecha**: 2026-06-22

## Estado

| Slice                                                   | Tareas   | Estado     |
| ------------------------------------------------------- | -------- | ---------- |
| PR-1 — Nuevo módulo `fx`                                  | 16 tareas | ✅ (PR-1) |
| PR-2 — `casa` por cuenta                                   | 12 tareas | ✅ (PR-2) |
| PR-3 — DI swap + port contract + stale DTO + widget chip | 11 tareas | ✅ completo |

PR-3 aterriza el wire-up. Después de este PR, el spec
canónico aterriza en `openspec/specs/fx/spec.md` vía
`sdd-sync`, y `fx-cache` se archiva a
`openspec/changes/archive/2026-06-21-fx-cache/`.

## Ledger de commits (PR-3, `feat/fx-cache-3`)

La tabla de tareas lista 11 unidades de trabajo. El contrato
de work-unit del proyecto commitea por comportamiento, no
por archivo, y la tabla de tareas documenta dos restricciones
de ordenamiento fuerte (T3.4+T3.5 deben aterrizar juntas;
T3.6+T3.7 deben aterrizar juntas). Esto produce 9 commits en
lugar de 11; el pairing está bloqueado en design §21 y
tasks §"Hard ordering constraints".

| Tarea(s) | Commit  | Título del commit                                                | Archivos (head)                                                   |
| -------- | ------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| T3.1     | 4d2c7f9 | `feat(accounts): fx-conversion-request requires casa`            | `fx-rate-provider.port.ts`, `fx-rate-provider.port.test.ts`        |
| T3.2     | df4e59e | `feat(fx): fx-rate-provider-dolar-api reads casa from request`   | `fx-rate-provider.dolar-api.ts` (+ los 4 archivos de test)         |
| T3.3     | e43a5ec | `feat(accounts): account-service.get-balance threads casa`      | `account.service.ts`, `account.service.test.ts`                   |
| T3.4+5   | d786718 | `feat(accounts): get-account-balance resolves casa + balance dto stale` | action + DTO + port `stale: boolean` + provider `buildResult` + caller updates |
| T3.6+7   | 6268012 | `feat(api): swap fx-rate-provider-unconfigured for fx-rate-provider-dolar-api` | `app.ts` (DI swap + wiring de balanceDeps) + `server-hono.ts` + borrado del stub + 2 tests de wiring |
| T3.8     | 97c54fa | `feat(ui): stale chip in balance widget`                         | `balance-widget.tsx`, `balance-widget.test.tsx`, `account-types.ts` |
| T3.9     | (este commit) | `docs(openspec): apply-progress + verify-report + sync-report + es mirrors` | 6 archivos: 3 EN + 3 ES |
| T3.10    | (próximo commit) | `chore(openspec): archive fx-cache after spec sync`         | promoción del spec + edición cross-link de 1 línea en accounts + move a archive (8 archivos) |
| T3.11    | (gate del PR — capturado en el body del PR, no como commit) | (sin commit — sólo verificación)                  | — |

## Evidencia del ciclo TDD de PR-3

Cada fila se authored vía RED → GREEN → TRIANGULATE → REFACTOR.

| Tarea(s) | Archivo de test                                                                       | RED                              | GREEN | TRIANGULATE                                              | REFACTOR |
| -------- | ------------------------------------------------------------------------------------- | -------------------------------- | ----- | -------------------------------------------------------- | -------- |
| T3.1     | `src/modules/accounts/domain/interfaces/fx-rate-provider.port.test.ts`               | ✅ 1 pin compile-time falla       | ✅ 5  | ✅ (casa non-nullable + shape del método del provider)    | ✅ Limpio |
| T3.2     | `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.test.ts`           | ✅ 2 tests existentes assert      | ✅ 8  | ✅ assertión de env-stub-leak (casa sólo del request)    | ✅ Limpio |
| T3.3     | `src/modules/accounts/domain/services/account.service.test.ts`                       | ✅ 2 tests nuevos fallan          | ✅ 10 | ✅ ausencia de env var no cambia la casa forwardeada     | ✅ Limpio |
| T3.4     | `src/modules/accounts/application/actions/get-account-balance.action.test.ts`       | ✅ 3 escenarios de casa fallan    | ✅ 7  | ✅ (regla de resolución de casa pineada por 3 RED)       | ✅ Limpio |
| T3.5     | `src/modules/accounts/application/dto/dto.test.ts`                                   | ✅ 2 casos stale/warnings fallan  | ✅ 7  | ✅ (warnings omitidos cuando empty / stale=false)        | ✅ Limpio |
| T3.6+7   | `src/modules/api/app.accounts.test.ts` + `app.deps.test.ts`                           | ✅ assertión de wiring falla      | ✅    | ✅ stub unconfigured borrado + grep devuelve 0           | ✅ Limpio |
| T3.8     | `app/accounts/[id]/balance-widget.test.tsx`                                          | ✅ (pin de StaleChip)             | ✅ 1  | ✅ clases amber + a11y attrs + data-testid               | ✅ Limpio |

## Cobertura REQ (acumulada a través de PR-1 + PR-2 + PR-3)

| REQ      | Primer test authored en | Test verificador de PR-3                                          | Estado                                         |
| -------- | ----------------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| REQ-FX-1 | T1.7                    | `fx-rate-provider.dolar-api.test.ts` (stale hit) + integration     | ✅                                            |
| REQ-FX-2 | T1.4                    | (PR-1 — sin delta en PR-3)                                         | ✅                                            |
| REQ-FX-3 | T3.1                    | `fx-rate-provider.port.test.ts` + 3 escenarios de casa en action    | ✅                                            |
| REQ-FX-4 | T1.5                    | (PR-1 — sin delta en PR-3)                                         | ✅                                            |
| REQ-FX-5 | T1.5                    | (PR-1 — sin delta en PR-3)                                         | ✅                                            |
| REQ-FX-6 | T3.5                    | `dto.test.ts` (mapeo de stale) + `app.accounts.test.ts` (wire) + widget chip | ✅                                  |
| REQ-FX-7 | T1.6                    | (PR-1 — sin delta en PR-3)                                         | ✅                                            |
| REQ-FX-8 | T1.4                    | (PR-1 — sin delta en PR-3)                                         | ✅                                            |
| REQ-FX-9 | T2.10                   | (PR-2 — sin delta en PR-3)                                         | ✅                                            |

## Desviaciones de design.md

1. **`FxConversionResult.stale` es REQUIRED, no opcional**
   (T3.5): design §14.2 sólo especificaba
   `warnings?: string[]`. `stale: boolean` es co-required
   porque el DTO lo carga y el widget lo lee para manejar el
   chip. Hacerlo requerido a nivel de tipo evita que el
   lado del consumidor silenciosamente default a `false`
   (lo que suprimiría la advertencia). Todos los callers
   (el provider, el stub, el fixture del action test) se
   actualizaron en el mismo commit.

2. **Los deps de la action cargan `defaultCasa`, no el env
   directamente** (T3.4): el design dice "la action lee `env`
   desde `@/shared/env/env.schema`". La implementación lo
   lee en el composition root (`app.ts`) y lo pasa como
   `GetAccountBalanceActionDeps.defaultCasa`. La action se
   mantiene pura y testeable (sin singleton de env al
   module-load time, stubs deterministas por test). El
   composition root es el único lugar que parsea env,
   matching la `env-config` skill del proyecto
   ("validado al startup, leído en todos lados").

3. **`FxCasaString` se declara como tuple `as const` dentro
   del port** (T3.1): el design §14.2 decía "importado desde
   `@/modules/fx`". La implementación inlinea el tuple en
   `fx-rate-provider.port.ts` para preservar la regla de
   modules-isolated (root `AGENTS.md` §10.5 — `accounts`
   NO debe importar desde `fx`). El `fxCasaStringSchema` del
   módulo `fx` es la fuente de verdad en runtime; la
   compatibilidad estructural se preserva (ambos son el
   mismo enum lowercase de 6 valores). El env schema inlinea
   el mismo tuple con la misma rationale.

4. **Archivo stub borrado en el mismo commit que el DI swap**
   (T3.6+T3.7): por la restricción de ordenamiento fuerte en
   `tasks.md` ("splitting them produces a build-broken
   intermediate state — `app.ts:59` would import a deleted
   file"). El import de `FxRateProviderUnconfigured` se
   remueve al mismo tiempo que el archivo stub se `git rm`.

5. **`env.FX_DEFAULT_CASA` se lee al startup en `app.ts`, no
   en action-call time** (T3.4): el env schema parsea
   `process.env` una vez al module-load. Re-parsear al call
   time sería posible pero acoplaría la action al singleton
   de env. Pasar el valor resuelto por deps es el seam de
   test más limpio.

## Gates de aceptación (corridos sobre el commit de PR-3 `6268012` + commit de T3.8 `97c54fa`)

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
(38 warnings pre-existing; 0 nuevos errores introducidos por PR-3)

$ pnpm run build
EXIT=0

$ pnpm test:coverage:enforced
503 tests pasan; coverage thresholds cumplidos en
src/modules/{fx,accounts,api}/**.
```

## Commit de entregable OpenSpec (T3.9)

Este archivo es parte de T3.9. Archivos hermanos:
- `openspec/changes/fx-cache/verify-report.md` — cobertura
  de los 9 REQ-FX-N con citaciones a tests en disco
  (review-facing).
- `openspec/changes/fx-cache/sync-report.md` — promoción
  del spec + cross-link de accounts + move a archive.
- `Documents-es/openspec/changes/fx-cache/{apply-progress,verify-report,sync-report}.md`
  — mirrors en español. CJK grep en cada uno devuelve 0
  matches.
