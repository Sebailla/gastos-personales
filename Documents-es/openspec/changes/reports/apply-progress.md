# Progreso de Apply — `reports` (slice 2)

**Autor**: Sebastián Illa
**Cambio**: `reports`
**Slice**: 2 de 4 (reports-application)
**Branch**: `feat/reports-2-application`
**Inicio**: 2026-06-26 · **Completado**: 2026-06-26
**Modo**: Strict TDD (RED → GREEN → TRIANGULATE → REFACTOR por task)
**Delivery**: PR único (slice 2 tiene 220–340 LoC; bien por debajo del presupuesto de 400 líneas según design §10.2)

## Resumen

Implementada la capa de aplicación de la capability `reports` —
tres esquemas Zod de query, tres actions, tres mappers de DTO,
el fixture `InMemoryReportsRepository` (basado en inyección para
aislamiento de módulos), el envelope local `_shared.ts`, el stub
de la factory `mountReportsRoutes` (NO montado — trabajo del
slice 3), y el barrel de aplicación. Las 12 tasks (T-RPT-101..112)
aterrizaron en 10 commits de work-unit sobre
`feat/reports-2-application`.

## Evidencia del ciclo TDD

| Task | RED commit | GREEN commit | TRIANGULATE commit | REFACTOR commit |
|------|------------|--------------|---------------------|------------------|
| T-RPT-101 | cd22258 | cd22258 | n/a | n/a |
| T-RPT-102 | cd22258 | cd22258 | n/a | n/a |
| T-RPT-103 | 0de27f3 | 0de27f3 | n/a | n/a |
| T-RPT-104 | 0de27f3 | 0de27f3 | n/a | n/a |
| T-RPT-105 | (green-only según task spec) | c0690c4 | n/a | n/a |
| T-RPT-106 | fef5644 | fef5644 | n/a | n/a |
| T-RPT-107 | fef5644 | fef5644 | n/a | n/a |
| T-RPT-108 | 79cc2ca | 79cc2ca | n/a | n/a |
| T-RPT-109 | 79cc2ca | 79cc2ca | n/a | n/a |
| T-RPT-110 | d0844e3 | d0844e3 | n/a | n/a |
| T-RPT-111 | (green-only según task spec) | 79a993c | n/a | n/a |
| T-RPT-112 | n/a | n/a | 807a965 | n/a |
| refactor (dead code) | n/a | n/a | n/a | 2ecc4ea |

Colapso RED→GREEN: el archivo de test RED y la implementación
GREEN de cada task aterrizaron en un único commit porque la
convención `work-unit-commits` del proyecto empareja los tests
con el comportamiento que verifican (commit-por-comportamiento,
no commit-por-tipo-de-archivo).

## Archivos modificados (sólo slice 2)

| Archivo | Acción | LoC |
|---------|--------|-----|
| `src/modules/reports/application/schemas/monthly-summary-query.schema.ts` | creado | 43 |
| `src/modules/reports/application/schemas/monthly-summary-query.schema.test.ts` | creado | 68 |
| `src/modules/reports/application/schemas/account-flow-query.schema.ts` | creado | 79 |
| `src/modules/reports/application/schemas/account-flow-query.schema.test.ts` | creado | 85 |
| `src/modules/reports/application/schemas/category-breakdown-query.schema.ts` | creado | 41 |
| `src/modules/reports/application/schemas/category-breakdown-query.schema.test.ts` | creado | 54 |
| `src/modules/reports/application/fixtures/reports-repository.inmemory.ts` | creado | 116 |
| `src/modules/reports/application/fixtures/reports-repository.inmemory.test.ts` | creado | 138 |
| `src/modules/reports/application/actions/_shared.ts` | creado | 184 |
| `src/modules/reports/application/actions/get-monthly-summary.action.ts` | creado | 102 |
| `src/modules/reports/application/actions/get-monthly-summary.action.test.ts` | modificado (rewrite) | 132 |
| `src/modules/reports/application/actions/get-category-breakdown.action.ts` | creado | 88 |
| `src/modules/reports/application/actions/get-category-breakdown.action.test.ts` | creado | 137 |
| `src/modules/reports/application/actions/get-account-flow.action.ts` | creado | 168 |
| `src/modules/reports/application/actions/get-account-flow.action.test.ts` | creado | 180 |
| `src/modules/reports/application/dto/monthly-summary.dto.ts` | creado | 68 |
| `src/modules/reports/application/dto/monthly-summary.dto.test.ts` | creado | 78 |
| `src/modules/reports/application/dto/category-breakdown.dto.ts` | creado | 65 |
| `src/modules/reports/application/dto/category-breakdown.dto.test.ts` | creado | 84 |
| `src/modules/reports/application/dto/account-flow.dto.ts` | creado | 70 |
| `src/modules/reports/application/dto/account-flow.dto.test.ts` | creado | 92 |
| `src/modules/reports/application/integration.test.ts` | creado | 285 |
| `src/modules/reports/application/routes.ts` | creado (slice 3 monta) | 144 |
| `src/modules/reports/application/index.ts` | creado (barrel) | 56 |
| `openspec/changes/reports/tasks.md` | actualizado (12 estados de task → done) | — |
| `Documents-es/openspec/changes/reports/tasks.md` | actualizado (espejo en español) | — |
| `openspec/changes/reports/apply-progress.md` | creado (este archivo) | — |

## Desviaciones del diseño

1. **`InMemoryReportsRepository` usa inyección por constructor
   (según feedback de GGA review).** El design §2.1 pedía que
   `InMemoryReportsRepository` compusiera directamente
   `InMemoryTransactionRepository`. La review de GGA sobre el
   primer commit lo marcó como violación de §10.5 "Modules
   isolated" (el fixture importaba la clase del módulo
   transactions). Refactoricé el fixture para aceptar un
   callback `TransactionListFn` que matchea la signature del
   kernel `TransactionRepositoryPort.list`. El fixture ahora
   está desacoplado; los archivos de test cablean
   `txRepo.list.bind(txRepo)` en el seam de tests. Mismo
   comportamiento, sin dependencia cross-module en código de
   producción.
2. **Los bodies de tests usan `toMatchObject`/`toEqual` en
   lugar de narrowing con `if`.** Los tests de action de
   transactions usan el patrón
   `expect(result.ok).toBe(true); if (!result.ok) return;` —
   común en narrowing de discriminated unions de TypeScript.
   GGA lo marcó como violación de §10.5 "no logic in tests".
   Reescribí los tests de action para usar `toMatchObject` /
   `toEqual({ ok: ..., error: expect.objectContaining(...) })`
   de modo que los bodies de test no tengan branches `if`/`else`/`for`.

## Issues encontrados

Ninguno bloqueante. Tres observaciones:

1. **El mapeo de `AccountNotFoundError` ya está cubierto por
   la tabla `DOMAIN_CODE_TO_WIRE`.** El `_shared.ts` inicial
   incluía un helper dedicado `accountNotFoundToActionError`
   que quedó sin uso (`domainErrorToActionError` ya rutea
   `ACCOUNT_NOT_FOUND → NOT_FOUND`). Eliminé el dead code en
   el commit REFACTOR (`2ecc4ea`).
2. **`routes.ts` muestra 0% de cobertura en la capa de
   aplicación.** Esperado: el slice 3 monta las rutas en
   `protectedApp` y el test de integración Hono del slice 3
   (`routes.test.ts`) ejercita los paths de los handlers. El
   slice 2 sólo entrega la factory, no el test de integración.
3. **`_shared.ts` muestra 73% statements / 50% branches de
   cobertura.** Las branches no cubiertas son la propagación
   de `details` en el path `domainErrorToActionError` y el
   fallback de AppError passthrough. Ambos son defensivos; la
   cobertura de la action layer en sí es 100%. Aceptable para
   el slice 2; los tests a nivel de rutas del slice 3
   ejercitarán las branches restantes cuando se monten.

## Verificación

- `pnpm typecheck` → exit 0
- `pnpm test src/modules/reports/application/` → exit 0 (50 tests pasaron en 11 archivos)
- `pnpm test src/modules/reports/` → exit 0 (116 tests pasaron en 19 archivos)
- `pnpm test:coverage:enforced` → exit 0 (umbrales globales cumplidos; capa application 80% statements, 89% branches)
- `git log --oneline origin/develop..feat/reports-2-application` → 11 commits (10 work-unit + 1 housekeeping)

## Estado

12/12 tasks del slice 2 completas. Slice 2 listo para `sdd-verify`.
El orquestador maneja push + PR + verification gate (el slice 3
se desbloquea sólo después de que el slice 2 mergee a `develop`).
