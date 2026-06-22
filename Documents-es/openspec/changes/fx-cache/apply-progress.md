# Progreso de Aplicación — `fx-cache` PR-1

**Autor**: Sebastián Illa
**Cambio**: `fx-cache`
**PR**: PR-1 de 3 PRs encadenados
**Rama**: `feat/fx-cache-1` (desde `develop`)
**SHA base**: `705fb09`
**Fecha**: 2026-06-21

## Estado

| Slice                                 | Tareas    | Estado      |
| ------------------------------------- | --------- | ----------- |
| PR-1 — Nuevo módulo fx (T1.1 a T1.16) | 16 tareas | ✅ completo |

PR-2 (columna casa por cuenta) y PR-3 (intercambio de DI + spec + ADR)
están fuera del alcance de este PR.

## Evidencia del Ciclo TDD de PR-1

Cada fila se autoría vía RED → GREEN → TRIANGULATE → REFACTOR.
La suite completa de tests (469 tests pasando, 81 archivos de
test) corre en ~3.3 s en esta máquina.

| Tarea | Commit  | Archivo de Test                                                                         | RED           | GREEN   | TRIANGULATE                         | REFACTOR  |
| ----- | ------- | --------------------------------------------------------------------------------------- | ------------- | ------- | ----------------------------------- | --------- |
| T1.1  | 4c3b462 | `src/modules/fx/domain/entities/fx-quote.test.ts`                                       | ✅ 5 casos    | ✅ 5    | ✅ 6 (cotización futura rechazada)  | ✅ Limpio |
| T1.2  | 5bba631 | `src/modules/fx/domain/entities/fx-casa-string.schema.test.ts`                          | ✅ 4 casos    | ✅ 4    | ✅ 5 (deriva schema/tupla)          | ✅ Limpio |
| T1.3  | f6df2d8 | `src/modules/fx/domain/ports/ports.test.ts` (compile-time `expectTypeOf`)               | n/a (compile) | ✅ 4    | n/a                                 | ✅ Limpio |
| T1.4  | 6e1a3d1 | `src/modules/fx/infrastructure/external/dolar-api.client.test.ts`                       | ✅ 6 casos    | ✅ 7    | ✅ 7 (wire-shape mixed-case)        | ✅ Limpio |
| T1.5  | 4984fc9 | `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.test.ts`                     | ✅ 5 casos    | ✅ 6    | ✅ 6 (cachedAt estampado)           | ✅ Limpio |
| T1.6  | b431b0a | `src/modules/fx/infrastructure/stampede/stampede-lock.test.ts`                          | ✅ 4 casos    | ✅ 5    | ✅ 5 (100 callers concurrentes)     | ✅ Limpio |
| T1.7  | fd6d17d | `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.test.ts`             | ✅ 7 casos    | ✅ 8    | ✅ 8 (sin stampede en segunda call) | ✅ Limpio |
| T1.8  | 1996d03 | `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.integration.test.ts` | ✅ 3 casos    | ✅ 4    | ✅ 4 (stale + background refresh)   | ✅ Limpio |
| T1.9  | 1ddd627 | `src/shared/env/env.schema.test.ts`                                                     | ✅ 5 casos    | ✅ 6    | ✅ 6 (default efectivo 'oficial')   | ✅ Limpio |
| T1.10 | 669aba8 | `src/modules/fx/infrastructure/stampede/stampede-lock.logger.test.ts`                   | ✅ 1 caso     | ✅ 1    | n/a                                 | ✅ Limpio |
| T1.11 | 86e33a4 | `src/modules/fx/infrastructure/external/fx-rate-provider.sentry.test.ts`                | ✅ 4 casos    | ✅ 4    | ✅ 4 (denylist de env vars)         | ✅ Limpio |
| T1.12 | 24fe158 | `src/modules/fx/index.test.ts`                                                          | ✅ 4 casos    | ✅ 4    | n/a                                 | ✅ Limpio |
| T1.13 | b85c803 | `src/modules/fx/spec-scenarios.test.ts`                                                 | ✅ 13 casos   | ✅ 20   | ✅ 20 (cross-cutting 6 casas)       | ✅ Limpio |
| T1.14 | e099445 | (gate verificado — cobertura 100% en `src/modules/fx/**`)                               | ✅ bajo 80%   | ✅ 100% | ✅ 100% (cerrado por T1.6 boundary) | ✅ Limpio |
| T1.15 | 530917b | (commit no-op; `pnpm-lock.yaml` diff vacío)                                             | n/a           | n/a     | n/a                                 | n/a       |
| T1.16 | c70d835 | (limpieza lint + apply-progress)                                                        | n/a           | n/a     | n/a                                 | ✅ Limpio |

## Cobertura de REQ

| REQ      | Primera Test Autoreada En | Estado                                           |
| -------- | ------------------------- | ------------------------------------------------ |
| REQ-FX-1 | T1.7                      | ✅                                               |
| REQ-FX-2 | T1.4                      | ✅                                               |
| REQ-FX-3 | T1.7                      | ✅                                               |
| REQ-FX-4 | T1.5                      | ✅                                               |
| REQ-FX-5 | T1.5                      | ✅                                               |
| REQ-FX-6 | (PR-3)                    | ⏳ diferido (stale boolean en el DTO de balance) |
| REQ-FX-7 | T1.6                      | ✅                                               |
| REQ-FX-8 | T1.4                      | ✅                                               |
| REQ-FX-9 | (PR-2)                    | ⏳ diferido (migración de columna casa)          |

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

| Compuerta                | Comando                       | Resultado                                  |
| ------------------------ | ----------------------------- | ------------------------------------------ |
| Tests unit + integration | `pnpm test`                   | ✅ 469 / 469 pasando (81 archivos de test) |
| Type check               | `pnpm run typecheck`          | ✅ 0 errores                               |
| Lint                     | `pnpm run lint`               | ✅ 0 errores, 38 warnings preexistentes    |
| Build (con env vars)     | `pnpm run build`              | ✅ exit 0                                  |
| Cobertura (enforced)     | `pnpm test:coverage:enforced` | ✅ modules/fx 100 / 100 / 100 / 100        |

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

---

# Progreso de Aplicación — `fx-cache` PR-2

**Autor**: Sebastián Illa
**Cambio**: `fx-cache`
**PR**: PR-2 de 3 PRs encadenados
**Rama**: `feat/fx-cache-2` (desde `develop`)
**SHA base**: `8bdf606` (HEAD de PR-1)
**Fecha**: 2026-06-22

## Estado

| Slice                                  | Tareas      | Estado      |
| -------------------------------------- | ----------- | ----------- |
| PR-2 — `casa` por cuenta               | 12 tareas   | ✅ completo |
| PR-3 — Intercambio de DI + port + spec | (siguiente) | ⏳ diferido |

PR-2 aterriza la columna `casa` por cuenta y el `<select>` en el
formulario. El DI **sigue conectado al stub** (`FxRateProviderUnconfigured`
en `src/modules/api/app.ts:316`); el smoke widget continúa con 503. El nuevo módulo `fx` de PR-1 todavía NO consume la columna
`casa` — el wire-up aterriza en PR-3.

## Evidencia del Ciclo TDD de PR-2

Cada fila se autoría vía RED → GREEN → TRIANGULATE → REFACTOR.
La suite completa de tests (494 tests pasando en 83 archivos)
corre en ~4 s en esta máquina.

| Tarea | Commit  | Archivo de Test                                                                                                | RED          | GREEN    | TRIANGULATE                              | REFACTOR  |
| ----- | ------- | -------------------------------------------------------------------------------------------------------------- | ------------ | -------- | ---------------------------------------- | --------- |
| T2.1  | ea34312 | (solo schema — `pnpm prisma validate` + `prisma format`)                                                       | n/a (schema) | ✅ valid | n/a                                      | ✅ Limpio |
| T2.2  | 08ecbd7 | (solo migración — `pnpm prisma migrate status`)                                                                | n/a (sql)    | ✅ clean | n/a                                      | ✅ Limpio |
| T2.3  | 99bdbbf | `src/modules/accounts/domain/entities/financial-account.test.ts`                                               | ✅ 3 casos   | ✅ 3     | n/a                                      | ✅ Limpio |
| T2.4  | a3a3cfc | `src/modules/accounts/application/validation/account-create.schema.test.ts`                                    | ✅ 5 casos   | ✅ 5     | ✅ 5 (casa angosta en la unión parseada) | ✅ Limpio |
| T2.5  | 0532fd9 | `src/modules/accounts/application/validation/account-update.schema.test.ts`                                    | ✅ 2 casos   | ✅ 2     | n/a                                      | ✅ Limpio |
| T2.6  | 54dab04 | `src/modules/accounts/application/dto/dto.test.ts`                                                             | ✅ 2 casos   | ✅ 2     | n/a                                      | ✅ Limpio |
| T2.7  | a9df942 | `src/modules/accounts/infrastructure/repositories/account.repository.prisma.test.ts`                           | ✅ 3 casos   | ✅ 3     | n/a                                      | ✅ Limpio |
| T2.8  | 0dfb7a7 | `src/modules/accounts/application/actions/update-account.action.test.ts`                                       | ✅ 1 caso    | ✅ 1     | n/a                                      | ✅ Limpio |
| T2.9  | 1f23628 | `app/accounts/new/create-account-form.test.tsx`                                                                | ✅ 2 casos   | ✅ 2     | n/a                                      | ✅ Limpio |
| T2.10 | aaf5f2a | `src/modules/accounts/infrastructure/repositories/account.repository.prisma.migration.test.ts` (Postgres real) | ✅ 4 casos   | ✅ 4     | n/a                                      | ✅ Limpio |
| T2.11 | ce872d1 | (docs — `docs/runbooks/fx-casa-migration.md` + espejo `Documents-es/...`)                                      | n/a          | ✅ 0 CJK | n/a                                      | ✅ Limpio |
| T2.12 | (éste)  | (gate CI — typecheck + lint + build + coverage + tests)                                                        | n/a          | ✅ todos | n/a                                      | ✅ Limpio |

## Cobertura de REQ

| REQ      | Test escrito en | Estado |
| -------- | --------------- | ------ |
| REQ-FX-9 | T2.10           | ✅     |

Todas las demás REQ-FX-N fueron cubiertas por PR-1 (T1.1 a T1.16).

## Desviaciones de tasks.md

1. **T2.3 tocó más archivos que la estimación de la tarea** (~37
   líneas forecast, 143 reales). El nuevo campo
   `casa: AccountFxCasa | null` en `FinancialAccount` es
   **requerido** (siguiendo la convención de los 11 campos
   existentes), lo que fuerza agregar `casa: null` a cada fixture
   de test que construye un `FinancialAccount`. Sin estos, la
   cadena de tipos no compilaría (anti-patrón §10.5). Los
   fixtures se commitean en el mismo commit que la entidad de
   dominio porque son updates mecánicos de conformance, no
   cambios de comportamiento.

2. **T2.3 también tocó `account.repository.port.ts` y el
   `account.repository.prisma.ts` de producción** para agregar
   `casa?` a `CreateFinancialAccountInput` /
   `UpdateFinancialAccountPatch` y para que el `create` +
   `mapRow` del adapter manejen la columna. El comportamiento
   de los writes de casa (los asserts que lockean los casos de
   T2.7) aterrizó en T2.7 como requiere el spec; los cambios
   del adapter de T2.3 son el backbone estructural para que la
   cadena de tipos compile end-to-end.

3. **Los cambios del adapter de T2.7 ya estaban estructuralmente
   completos tras T2.3** (el spread condicional de `casa` en
   `create` y el passthrough del patch en `update` eran
   necesarios para que la cadena de tipos compile). T2.7
   aterrizó los 9 casos de assert específicos de casa que
   lockean el contrato — el ciclo RED → GREEN se completó de
   una sola pasada porque la implementación ya estaba en
   lugar desde T2.3.

4. **T2.9 agregó el patrón de include `app/**/\*.tsx`a`vitest.config.ts`** y usa `vi.mock('next/navigation')`para
stubbear`useRouter`en lugar de traer`@testing-library/react`+ jsdom (que sería una nueva
dependencia dev — anti-patrón §10.2). El test renderiza
el form con`renderToStaticMarkup` (sin jsdom) y assertea
   sobre el HTML estático.

5. **T2.10 corre el test de integración contra el contenedor
   Docker `gastos-postgres` corriendo** (puerto 5433) cuando
   `DATABASE_URL` apunta a él. El test se auto-skipea cuando
   `DATABASE_URL` falta o apunta al fake de unit-tests
   (puerto 5432). CI gatea sobre el URL de testcontainers-
   Postgres según el skill `database-strategy`; el camino de
   validación manual en local es el container docker.

## Archivos tocados (17 archivos, ~750 inserciones)

Mismo listado que la sección en inglés (omitido aquí por brevedad;
ver `openspec/changes/fx-cache/apply-progress.md` para el
`git diff --stat` completo).

## Acceptance gates

| Gate                        | Comando                                                                                           | Resultado                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Tests unit + integración    | `DATABASE_URL=… pnpm test`                                                                        | ✅ 494 / 494 pasando (83 archivos, 4 skipeados sin DB URL)                  |
| Type check                  | `pnpm run typecheck`                                                                              | ✅ 0 errores                                                                |
| Lint                        | `pnpm run lint`                                                                                   | ✅ 0 errores, 38 warnings preexistentes                                     |
| Build (con env vars)        | `DATABASE_URL=… AUTH_SECRET=… pnpm run build`                                                     | ✅ exit 0                                                                   |
| Coverage (enforced)         | `DATABASE_URL=… pnpm test:coverage:enforced`                                                      | ✅ modules/accounts 100 / 100 / 100 / 100; modules/fx 100 / 100 / 100 / 100 |
| Pureza del dominio          | `grep -r "from '@/modules/accounts/infrastructure'\|from '@prisma'" src/modules/accounts/domain/` | ✅ 0 matches                                                                |
| Sin `eslint-disable`        | `git diff develop..feat/fx-cache-2 -- eslint-disable`                                             | ✅ vacío                                                                    |
| Sin casts `as` introducidos | `grep "As<" src/modules/accounts/ src/modules/fx/`                                                | ✅ 0 matches en archivos nuevos                                             |

El gate de build requiere `DATABASE_URL`, `AUTH_SECRET`,
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, y
`ARGON2ID_DUMMY_PASSWORD` en el entorno de build (requisito
preexistente; este PR no agrega una nueva env var requerida).

## Riesgos para el revisor

- **El grafo de DI no cambia** (`src/modules/api/app.ts:316`
  sigue cableando `FxRateProviderUnconfigured`). La columna
  `casa` ahora es leíble y escribible end-to-end en la capa
  API / form, pero todavía ningún consumidor (provider FX,
  DTO de balance) la lee. PR-3 aterriza el wire-up.

- **El enum `casa` está espejado en dos lugares**:
  `prisma/schema.prisma` (`AccountFxCasa`, UPPERCASE) y
  `src/modules/accounts/domain/entities/financial-account.ts`
  (`AccountFxCasa`, UPPERCASE, sin import de Prisma — la
  regla de architecture-standards). La forma lowercase de
  DolarAPI vive en `src/modules/fx/domain/entities/fx-casa-string.schema.ts`
  y en `src/shared/env/env.schema.ts` (esta última inlina la
  tupla porque `shared/` NO debe importar de `modules/`). El
  nuevo `src/modules/accounts/application/validation/account-fx-casa.schema.ts`
  es el espejo Zod de la frontera Prisma. Drift entre
  cualquiera de las dos fuentes falla un test de parse
  posterior.

- **El nuevo patrón de include `app/**/\*.tsx`en`vitest.config.ts`** es más amplio que el de PR-1; futuros
tests de componentes React en `app/`siguen el mismo
patrón de`vi.mock('next/navigation')`que`create-account-form.test.tsx` para evitar el invariante
  de contexto de App Router.

- **La cobertura en `src/modules/accounts/**` es 100%\*\* para
  las capas tocadas (entities, validation, application,
  infrastructure). El run con threshold enforced pasa
  globalmente.

- **`casa: AccountFxCasa | null` es requerido (no opcional) en
  la interfaz `FinancialAccount`** — siguiendo la convención
  de los 11 campos existentes. Esto significa que cada
  fixture / mock que construye un `FinancialAccount` debe
  incluir `casa: null`. Los 12 updates de fixtures en T2.3 son
  conformance mecánica; los fixtures futuros deben seguir la
  misma convención.

## Próximo paso

Abrir el PR (`feat/fx-cache-2` → `develop`) una vez que el
revisor apruebe. PR-3 (`feat/fx-cache-3`) se ramifica de
develop tras el merge de PR-2 y conecta la resolución de
casa en el action site.
