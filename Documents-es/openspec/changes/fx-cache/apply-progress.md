# Progreso de Aplicación — `fx-cache` PR-1

**Autor**: Sebastián Illa
**Cambio**: `fx-cache`
**PR**: PR-1 de 3 PRs encadenados
**Rama**: `feat/fx-cache-1` (desde `develop`)
**SHA base**: `705fb09`
**Fecha**: 2026-06-21

## Estado

| Slice                                | Tareas    | Estado    |
| ------------------------------------ | --------- | --------- |
| PR-1 — Nuevo módulo fx (T1.1 a T1.16) | 16 tareas | ✅ completo |

PR-2 (columna casa por cuenta) y PR-3 (intercambio de DI + spec + ADR)
están fuera del alcance de este PR.

## Evidencia del Ciclo TDD de PR-1

Cada fila se autoría vía RED → GREEN → TRIANGULATE → REFACTOR.
La suite completa de tests (469 tests pasando, 81 archivos de
test) corre en ~3.3 s en esta máquina.

| Tarea | Commit   | Archivo de Test                                                                  | RED            | GREEN   | TRIANGULATE                          | REFACTOR |
| ----- | -------- | -------------------------------------------------------------------------------- | -------------- | ------- | ------------------------------------ | -------- |
| T1.1  | 4c3b462  | `src/modules/fx/domain/entities/fx-quote.test.ts`                                | ✅ 5 casos     | ✅ 5    | ✅ 6 (cotización futura rechazada)   | ✅ Limpio |
| T1.2  | 5bba631  | `src/modules/fx/domain/entities/fx-casa-string.schema.test.ts`                   | ✅ 4 casos     | ✅ 4    | ✅ 5 (deriva schema/tupla)           | ✅ Limpio |
| T1.3  | f6df2d8  | `src/modules/fx/domain/ports/ports.test.ts` (compile-time `expectTypeOf`)        | n/a (compile)  | ✅ 4    | n/a                                  | ✅ Limpio |
| T1.4  | 6e1a3d1  | `src/modules/fx/infrastructure/external/dolar-api.client.test.ts`                | ✅ 6 casos     | ✅ 7    | ✅ 7 (wire-shape mixed-case)         | ✅ Limpio |
| T1.5  | 4984fc9  | `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.test.ts`              | ✅ 5 casos     | ✅ 6    | ✅ 6 (cachedAt estampado)            | ✅ Limpio |
| T1.6  | b431b0a  | `src/modules/fx/infrastructure/stampede/stampede-lock.test.ts`                   | ✅ 4 casos     | ✅ 5    | ✅ 5 (100 callers concurrentes)      | ✅ Limpio |
| T1.7  | fd6d17d  | `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.test.ts`      | ✅ 7 casos     | ✅ 8    | ✅ 8 (sin stampede en segunda call)  | ✅ Limpio |
| T1.8  | 1996d03  | `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.integration.test.ts` | ✅ 3 casos | ✅ 4 | ✅ 4 (stale + background refresh)   | ✅ Limpio |
| T1.9  | 1ddd627  | `src/shared/env/env.schema.test.ts`                                              | ✅ 5 casos     | ✅ 6    | ✅ 6 (default efectivo 'oficial')    | ✅ Limpio |
| T1.10 | 669aba8  | `src/modules/fx/infrastructure/stampede/stampede-lock.logger.test.ts`            | ✅ 1 caso      | ✅ 1    | n/a                                  | ✅ Limpio |
| T1.11 | 86e33a4  | `src/modules/fx/infrastructure/external/fx-rate-provider.sentry.test.ts`         | ✅ 4 casos     | ✅ 4    | ✅ 4 (denylist de env vars)          | ✅ Limpio |
| T1.12 | 24fe158  | `src/modules/fx/index.test.ts`                                                   | ✅ 4 casos     | ✅ 4    | n/a                                  | ✅ Limpio |
| T1.13 | b85c803  | `src/modules/fx/spec-scenarios.test.ts`                                          | ✅ 13 casos    | ✅ 20   | ✅ 20 (cross-cutting 6 casas)        | ✅ Limpio |
| T1.14 | e099445  | (gate verificado — cobertura 100% en `src/modules/fx/**`)                       | ✅ bajo 80%    | ✅ 100% | ✅ 100% (cerrado por T1.6 boundary) | ✅ Limpio |
| T1.15 | 530917b  | (commit no-op; `pnpm-lock.yaml` diff vacío)                                      | n/a            | n/a     | n/a                                  | n/a      |
| T1.16 | c70d835  | (limpieza lint + apply-progress)                                                 | n/a            | n/a     | n/a                                  | ✅ Limpio |

## Cobertura de REQ

| REQ          | Primera Test Autoreada En | Estado |
| ------------ | ------------------------- | ------ |
| REQ-FX-1     | T1.7                      | ✅ |
| REQ-FX-2     | T1.4                      | ✅ |
| REQ-FX-3     | T1.7                      | ✅ |
| REQ-FX-4     | T1.5                      | ✅ |
| REQ-FX-5     | T1.5                      | ✅ |
| REQ-FX-6     | (PR-3)                    | ⏳ diferido (stale boolean en el DTO de balance) |
| REQ-FX-7     | T1.6                      | ✅ |
| REQ-FX-8     | T1.4                      | ✅ |
| REQ-FX-9     | (PR-2)                    | ⏳ diferido (migración de columna casa) |

## Desviaciones de design.md

1. **Firma de `FxRateCachePort.set` ampliada** (T1.5): el port
   original declaraba `set(casa, entry)` donde `entry` era
   `FxRateCacheEntry { quote, cachedAt }`. El caso de triangulación
   de T1.5 (`cachedAt is set by the adapter on every set`) requiere
   que el caller pase solo `FxQuote`; el adapter es dueño del
   estampado de `cachedAt`. El tipo del port se actualizó a
   `set(casa, quote: FxQuote)`. El provider (T1.7) llama
   `cache.set(casa, quote)` y el adapter escribe
   `{ quote, cachedAt: new Date().toISOString() }`. Este es un
   cambio de tipo forward-only (ningún consumer se rompió porque
   PR-1 introduce el único caller).

2. **Forma de `FxRateCacheEntry** (`{ quote, cachedAt }`) se
   preservó en el retorno de `get` para que el provider pueda leer
   `cachedAt` y computar el flag `stale`. El provider usa
   `Date.now() - new Date(cachedAt).getTime() > 1h` (el umbral de
   1h coincide con el TTL del cache).

3. **Enum de casa duplicado** (`src/shared/env/env.schema.ts` y
   `src/modules/fx/domain/entities/fx-casa-string.schema.ts`): la
   capa `shared/` no debe importar de una capa `modules/` (regla
   de módulos aislados, root `AGENTS.md` §10.5). La tupla de 6
   valores está inline en `env.schema.ts` para preservar la
   frontera de capas. Una deriva en cualquier fuente falla un
   test de parse posterior.

4. **`fx-quote.ts` inicialmente inlineó el enum de casa** (T1.1):
   el enum de casa se mantuvo inline en `fx-quote.ts` para la
   autocontención de T1.1, luego se extrajo a `fx-casa-string.schema.ts`
   en T1.2 como un refactor que preserva comportamiento. El
   `fx-quote.ts` actual importa del schema compartido.

5. **`extractCasa` del provider hace un cast del port en la
   frontera** (T1.7): el `FxConversionRequest` existente (declarado
   en `src/modules/accounts`) aún NO tiene un campo `casa`. PR-3
   lo agrega como requerido. La implementación de PR-1 lee
   `request.casa` vía una aserción de tipo y cae a
   `env.FX_DEFAULT_CASA ?? 'oficial'` en construcción. El diff
   de PR-3 es el borrado del fallback.

6. **Casos 6/7 de T1.7 son prospectivos**: assertan que el
   provider honra `request.casa` aun cuando la env var diga otra
   cosa. La implementación honra el request en PR-1; el fallback
   de env aplica solo cuando el request no carga una casa. Cuando
   PR-3 haga `casa` requerido en el port, el fallback será código
   muerto y se elimina.

## Archivos tocados (24 archivos, 2170 inserciones, 73 eliminaciones)

(Resumen de `git diff --stat 705fb09..HEAD` — ver bloque completo
en el apply-progress.md en inglés.)

## Compuertas de aceptación

| Compuerta                     | Comando                                 | Resultado |
| ----------------------------- | --------------------------------------- | --------- |
| Tests unit + integration      | `pnpm test`                             | ✅ 469 / 469 pasando (81 archivos de test) |
| Type check                    | `pnpm run typecheck`                    | ✅ 0 errores |
| Lint                          | `pnpm run lint`                         | ✅ 0 errores, 38 warnings preexistentes |
| Build (con env vars)          | `pnpm run build`                        | ✅ exit 0 |
| Cobertura (enforced)          | `pnpm test:coverage:enforced`           | ✅ modules/fx 100 / 100 / 100 / 100 |

La compuerta de build requiere `DATABASE_URL`, `AUTH_SECRET`,
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, y `ARGON2ID_DUMMY_PASSWORD`
establecidos en el entorno de build (requisito preexistente; este
PR no agrega una nueva env var requerida — `DOLAR_API_BASE_URL` y
`FX_DEFAULT_CASA` son ambas opcionales).

## Riesgos para el revisor

- **Grafo de DI sin cambios** (`src/modules/api/app.ts:316` sigue
  cableando `FxRateProviderUnconfigured`). El nuevo módulo `fx`
  existe pero no tiene callers. PR-3 aterriza el intercambio de DI;
  PR-3 es el commit que mueve el comportamiento de producción.

- **`extractCasa` del provider lee `request.casa` vía un cast de
  port** — ver desviación 5 arriba. El cast es la frontera única
  donde aterriza el cambio aditivo de port de PR-3.

- **Cobertura en `src/modules/fx/**` es 100%**, muy por encima
  del gate del 80%. La corrida con threshold forzado
  (`pnpm test:coverage:enforced`) pasa globalmente.

- **Pre-commit hook (`gga run`)** — el harness local de opencode
  puede producir un exit code `failed` con la salida del
  provider-en-tests como causa, aun cuando el trabajo está en
  disco. Verificar vía `git log -1 --format='%h %s' --stat`
  antes de marcar un handoff como fallido.

## Próximo paso

Abrir el PR (`feat/fx-cache-1` → `develop`) una vez que el revisor
apruebe. PR-2 (`feat/fx-cache-2`) se ramifica de develop tras el
merge de PR-1.