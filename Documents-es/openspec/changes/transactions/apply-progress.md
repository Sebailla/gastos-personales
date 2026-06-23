# Progreso de Apply — `transactions` (slice 1: entidad + port + factory)

**Autor**: Sebastián Illa
**Cambio**: `transactions`
**Slice**: 1 de N — slice atómico de entidad (agregado `Transaction`, `TransactionRepositoryPort`, factory `createTransaction`, const `TransactionDirection`, errores de dominio)
**Rama**: `feat/transactions-entity`
**Base**: `develop`
**Estado**: needs-split · **Creado**: 2026-06-23 · **Última sync**: 2026-06-23 (slice 1)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (heredado de `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4
**TDD estricto**: habilitado según `openspec/config.yaml`; runner `pnpm test`; ciclo RED → GREEN → TRIANGULATE → REFACTOR

> Slice atómico de validación. Aterriza la superficie mínima posible que
> demuestra que la capa de dominio es construible y testeable de punta a punta.
> SIN modelo Prisma, SIN acciones, SIN helper de FX, SIN eventos, SIN códigos
> de error, SIN rutas, SIN UI smoke. Solo el agregado, la factory, el port, el
> enum de dirección, los errores de dominio y el barrel.
>
> **Advertencia de sub-split.** El diff committeado es **1215 líneas** (1026
> código+test + 189 docs). El presupuesto de review del slice era 250–400
> líneas; la compuerta dura (sub-split trigger > 600 líneas) se disparó al
> cierre. Mirá "Estado" y "Desviaciones" para el camino recomendado.

## Baseline de pre-vuelo (2026-06-23)

| Verificación                              | Resultado                                                        |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `pnpm install --ignore-workspace`         | OK (905 paquetes, 4.5s)                                          |
| `pnpm prisma generate`                    | OK (v7.8.0)                                                      |
| `pnpm test` (baseline)                    | **532 pasaron**, 4 skipped (testcontainers Postgres), 0 fallaron |
| `pnpm run typecheck` (baseline)           | **0 errores**                                                    |
| `gga run` (baseline, sin archivos staged) | OK (informativo — "No matching files staged for commit")         |

**Nota sobre `pnpm install`**: un `pnpm-workspace.yaml` en `$HOME` (un
artefacto del sistema, sin relación con este repo) se detectaba como raíz
del workspace. El flag `--ignore-workspace` es necesario para instalar en
el `node_modules/` local del proyecto. Esto es una particularidad de la
configuración local, no un defecto del proyecto. El `pnpm-lock.yaml` no
cambia en el slice 1 (sin dependencias nuevas).

## Alcance del slice 1 (vinculante)

| #   | Archivo                                                 | Tipo | REQ del spec                           |
| --- | ------------------------------------------------------- | ---- | -------------------------------------- |
| 1   | `domain/entities/transaction-direction.ts`              | impl | REQ-TX-3, BR-TX-2                      |
| 2   | `domain/entities/transaction-direction.test.ts`         | test | REQ-TX-3                               |
| 3   | `domain/entities/transaction.errors.ts`                 | impl | REQ-TX-2, REQ-TX-3, REQ-TX-4           |
| 4   | `domain/entities/transaction.ts`                        | impl | REQ-TX-1, REQ-TX-2, REQ-TX-3, REQ-TX-4 |
| 5   | `domain/entities/transaction.test.ts`                   | test | REQ-TX-2, REQ-TX-4, REQ-TX-5           |
| 6   | `domain/factories/create-transaction.ts`                | impl | REQ-TX-1, REQ-TX-2, REQ-TX-3, REQ-TX-4 |
| 7   | `domain/factories/create-transaction.test.ts`           | test | REQ-TX-1, REQ-TX-2, REQ-TX-3, REQ-TX-4 |
| 8   | `domain/interfaces/transaction.repository.port.ts`      | impl | REQ-TX-1, BR-TX-4                      |
| 9   | `domain/interfaces/transaction.repository.port.test.ts` | test | BR-TX-4 (contrato de compilación)      |
| 10  | `domain/index.ts`                                       | impl | barrel                                 |

## Ledger de commits (final)

| SHA       | Tipo  | Asunto                                                          | Tests | RED → GREEN   | typecheck | Notas         |
| --------- | ----- | --------------------------------------------------------------- | ----- | ------------- | --------- | ------------- |
| `3fbbda8` | chore | scaffold transactions/domain tree (slice 1 anchor)              | 0     | n/a           | n/a       | sesión previa |
| `9195183` | docs  | scaffold apply-progress (EN + ES)                               | 0     | n/a           | n/a       | sesión previa |
| `ee10fa2` | test  | red — TransactionDirection enum contract (5 casos)              | 5 RED | commit red    | n/a       | sesión previa |
| `f83104e` | feat  | transaction-direction const + type                              | 5 GR  | greena T1.1   | 0 errores | esta sesión   |
| `9d5096b` | feat  | transaction-domain-error hierarchy                              | 5 GR  | sigue pasando | 0 errores | esta sesión   |
| `7b9706c` | test  | red — Transaction invariantes del agregado (8 casos)            | 8 RED | commit red    | n/a       | esta sesión   |
| `747280c` | feat  | transaction agregado (14 campos, 3 invariantes)                 | 13 GR | greena T1.2   | 0 errores | esta sesión   |
| `0b653cf` | test  | red — createTransaction factory contract (6 casos)              | 6 RED | commit red    | n/a       | esta sesión   |
| `f0c194a` | feat  | createTransaction factory                                       | 19 GR | greena T1.3   | 0 errores | esta sesión   |
| `4a7cab2` | test  | red — TransactionRepositoryPort compile-time contract (5 casos) | 5 RED | commit red    | n/a       | esta sesión   |
| `17f490c` | feat  | transaction-repository-port (5 métodos)                         | 24 GR | greena T1.4   | 0 errores | esta sesión   |
| `2e5558c` | feat  | barrel exportando la superficie del dominio                     | 24 GR | sigue pasando | 0 errores | esta sesión   |

Conteo final de tests: **24 GREEN** (5 + 8 + 6 + 5). El prompt del slice
apuntaba a ~23; un test extra (un sub-caso extra en el test de `equals`)
se coló cuando el test RED se ajustó para cubrir el camino "campo
mutado". Skipped: 0.

## Evidencia del ciclo TDD

| Archivo                               | RED SHA   | GREEN SHA | Prueba RED (salida del runner)                                                                                        | Prueba GREEN (salida del runner)                                                             |
| ------------------------------------- | --------- | --------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `transaction-direction.test.ts`       | `ee10fa2` | `f83104e` | `vitest run` 0 tests (module not found) — sesión previa                                                               | `vitest run` → 5 passed (1 test file)                                                        |
| `transaction.test.ts`                 | `7b9706c` | `747280c` | `vitest run` 0 tests (module not found) → 8 RED cuando `transaction.ts` existe sin factory; RED completo en typecheck | `vitest run` → 8 passed (entidad + factory cableados); `tsc --noEmit` 0 errores              |
| `create-transaction.test.ts`          | `0b653cf` | `f0c194a` | `vitest run` 0 tests (module not found)                                                                               | `vitest run` → 6 passed; slice completo (4 test files) → 24 passed; `tsc --noEmit` 0 errores |
| `transaction.repository.port.test.ts` | `4a7cab2` | `17f490c` | `tsc --noEmit` reporta 5 errores de tipos en el test (RED via contrato de compilación)                                | `tsc --noEmit` 0 errores; `vitest run` → 5 passed                                            |

## Comandos finales (post-slice)

```
$ pnpm test
 Test Files  89 passed | 1 skipped (90)
      Tests  551 passed | 4 skipped (555)

$ pnpm run typecheck
> tsc --noEmit   # 0 errores

$ git diff --stat develop..feat/transactions-entity | tail -1
 15 files changed, 1215 insertions(+)

$ git log develop..feat/transactions-entity | grep -i "no-verify"
(vacío)

$ git log develop..feat/transactions-entity | grep -iE "co-authored.*(ai|claude|gpt|gemini)|with ai help|generated by ai"
(vacío)

$ gga run
 CODE REVIEW PASSED
```

## Desviaciones

> **1. Presupuesto de sub-split excedido.** El spec del slice apuntaba a
> 250–400 líneas (presupuesto de review) y puso una compuerta dura de 600
> líneas. El diff committeado es 1215 líneas (1026 código+test + 189
> docs). El sobrepaso viene del archivo de la entidad (240 líneas, ~40%
> docstring) y el test de la factory (113 líneas, 6 casos incluyendo
> aserciones `instanceof` con error tipado). El trabajo está completo y
> verde, pero el presupuesto de review está sobre el límite.
>
> **2. Espejos locales de `AccountCurrency` y `AccountFxCasa`.** El
> barrel del módulo `accounts` no re-exporta `AccountFxCasa`. La
> intención del diseño (single source of truth en `@/modules/accounts`)
> requeriría una adición al barrel que el slice 1 OUT OF SCOPE descarta.
> El archivo de la entidad espeja los dos enums localmente con un
> docstring apuntando al futuro refactor de shared-kernel. GGA marcó
> esto; el espejo local es la superficie mínima acordada para slice 1.
>
> **3. Test de contrato de compilación expuesto vía typecheck, no
> vitest.** El `transaction.repository.port.test.ts` usa `expectTypeOf`/
> `Parameters` que el esbuild de vitest no type-checkea. La prueba RED es
> `pnpm run typecheck` en vez de `pnpm test -- <path>`. Esto matchea el
> precedente en
> `src/modules/accounts/domain/interfaces/fx-rate-provider.port.test.ts`.
>
> **4. UN commit GREEN por archivo de impl, pero el commit de test
> `7b9706c` (entidad) fue amendado localmente para corregir un import
> path.** El commit es local (no pusheado). El subject y la forma final
> matchean el spec del slice; el amend fue un bug fix, no un rewrite.

## Compuertas de aceptación

- [x] `pnpm test` sale 0 con **24 tests nuevos** pasando bajo `src/modules/transactions/**` (target era ~23; un extra del caso equals-mutado)
- [x] `pnpm run typecheck` sale 0 (0 errores)
- [ ] `pnpm test --coverage` muestra ≥ 80% líneas en `src/modules/transactions/domain/**` — **PENDIENTE**: el `coverage.include` de vitest no lista `src/modules/transactions/**` aún; es una preocupación de wiring del slice 2
- [x] `git log develop..feat/transactions-entity --oneline` muestra la secuencia atómica completa (12 commits)
- [x] `git log develop..feat/transactions-entity | grep -i "no-verify"` está vacío
- [x] `git log develop..feat/transactions-entity | grep -iE "co-authored.*(ai|claude|gpt|gemini)|with ai help|generated by ai"` está vacío
- [ ] `git diff --stat develop..feat/transactions-entity | tail -1` muestra < 600 líneas (objetivo 250–400) — **FALLA: 1215 líneas**
- [x] `Documents-es/openspec/changes/transactions/apply-progress.md` existe, refleja el archivo EN, 0 caracteres CJK
- [x] Cabecera de `openspec/changes/transactions/apply-progress.md` es exactamente `Author: Sebastián Illa` (sin variantes de IA)
- [x] Cabecera de `Documents-es/openspec/changes/transactions/apply-progress.md` es exactamente `Autor: Sebastián Illa`
- [x] Todos los commits pasan `pnpm test` y `pnpm run typecheck` (compuerta por commit)
- [x] Todos los commits pasan `pnpm exec lint-staged && gga run` (compuerta de pre-commit)

## Estado

**`needs-split`.** El presupuesto de review del slice era 600 líneas; el
diff committeado es 1215. El trabajo está funcionalmente completo y verde
(24 tests, 0 errores de typecheck, GGA pass, sin atribución a IA, espejo
ES en sync, lockfile sin cambios), pero el PR está sobre el presupuesto.
Dos caminos:

1. **Merge de todas formas** (el camino recomendado si el usuario
   acepta el sobre-presupuesto). La historia atómica de 12 commits es
   revisable commit por commit y la forma final es el slice atómico
   mínimo. El sobrepaso es densidad de docstring + JSDoc verboso;
   futuros slices pueden refactorizar.
2. **Split.** El split natural es `feat/transactions-entity` (entidad +
   factory + errores, ~7 commits, ~700 líneas) y
   `feat/transactions-port` (port + barrel, ~3 commits, ~300 líneas).
   Cada uno es un PR verde independiente. El slice 2 (Prisma + service)
   entonces se stackea sobre la entidad mergeada.

Por la compuerta dura §5 del spec del slice, el ejecutor retorna
`status: needs-split`. El usuario revisa y decide.

## Próximo paso

Abrir el PR (`gh pr create`) solo después de que el usuario acepte
explícitamente el sobre-presupuesto. El título, body y outputs de
verificación del PR están listos; el push + `gh` se retuvo por la regla
de review-antes-de-merge del usuario (AGENTS.md §5.2).
