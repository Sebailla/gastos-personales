# Spec — capability `fx`

**Autor**: Sebastián Illa
**Capability**: `fx`
**Cambio fuente**: `fx-cache`
**Estado**: activo · **Creado**: 2026-06-21 · **Última sincronización**: 2026-06-22 (fx-cache PR-3)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (heredado de `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4

> Primera escritura del spec de la capability `fx`.
> Operacionaliza la proposal de `fx-cache` (draft 2026-06-21)
> más las cinco decisiones de producto cerradas en la misma
> sesión (DG-FX-1 a DG-FX-5, ver "Decisiones cerradas" abajo).
> El spec declara **lo que debe ser cierto** después de que el
> cambio aterrice, no cómo implementarlo. Los detalles de
> implementación (rutas de archivo, sintaxis de schema, layout
> de tests) se limitan a lo que el contrato cross-module exige.
>
> Éste es el spec canónico de la capability `fx`, promovido
> desde `openspec/changes/fx-cache/specs/fx/spec.md` por el
> paso de archive de PR-3 (2026-06-22). El folder del cambio
> ahora vive en `openspec/changes/archive/2026-06-21-fx-cache/`.

## Decisiones cerradas (DG-FX-1 a DG-FX-5 — 2026-06-21)

Los cinco gaps de decisión son autoritativos donde modifican
o extienden la proposal. El spec los refleja como Requirements
y BRs, no como una sección separada de "decisiones". Los IDs
de decisión se referencian inline en los cuerpos de los
Scenarios relevantes.

| Gap     | Decisión                                                | Rationale                                                                                  | Codificado en   |
| ------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------- |
| DG-FX-1 | Casa por defecto = `oficial`                             | Pick conservador; el widget de smoke ya lo muestra por BR-ACC-18.                           | BR-FX-3         |
| DG-FX-2 | Casa por cuenta en v1                                   | La columna es aditiva; el usuario eligió v1 por sobre un follow-up diferido.                | Cambio 5, BR-FX-3 |
| DG-FX-3 | Chip amber visible de `stale: boolean`                    | Señal user-visible más pequeña que mapea a una primitiva de UX.                              | Cambio 3, BR-FX-6 |
| DG-FX-4 | Lock in-process `Map<casa, Promise<void>>`               | Defensa más barata contra el herd de cold-start; sin protocolo de coordinación.              | Cambio 6, BR-FX-7 |
| DG-FX-5 | Base URL hardcoded + env override `DOLAR_API_BASE_URL`   | Costo de una línea de env var; los tests tienen un switch de sandbox; producción no puede drift. | BR-FX-8         |

Las alternativas consideradas para cada gap se registran en
`docs/adr/0010-dolar-api-provider.md` (escrito por
`sdd-design`). EUR/ARS queda fuera de v1 según la sección
`Non-goals` de la proposal.

## Propósito

La capability `fx` es dueña de la implementación del port
`FxRateProvider` que `accounts` declara. Es una **capability
de display concern read-only**: no muta balances, no es dueña
del almacenamiento de la tasa FX en el modelo de dominio, y
no es dueña del endpoint `GET /api/accounts/:id/balance` (ese
endpoint vive en `accounts`). Expone una superficie de tasa
estable, de capa de presentación —
`{ amount, currency, fxRate, fxAsOf }` más una señal
`stale: boolean` y un array `warnings: string[]` — que
cualquier consumer que necesite una conversión puede usar
sin aprender los detalles del upstream.

La capability garantiza que: (a) una única implementación
concreta de `FxRateProvider` (DolarAPI) está wireada en el
grafo de DI; (b) el contrato de cache (1 hora TTL,
stale-fallback, stampede lock) se observa en cada read;
(c) la regla de selección de casa
(`account.casa ?? env.FX_DEFAULT_CASA`) se aplica en el
call site en `accounts`, nunca dentro del provider, así el
provider no tiene estado global por-call; (d) la superficie
de tasa degrada gracefully cuando DolarAPI está down, y
falla loudly cuando nunca hubo una tasa que servir; (e) el
stampede lock in-memory per-process coalesce los cold-start
fetches concurrentes para que un thundering herd no golpee
DolarAPI.

## Scope

### In scope

- Nuevo módulo `src/modules/fx/` (paralelo a
  `src/modules/accounts/`).
- Implementación de `FxRateProvider` respaldada por DolarAPI.
- Capa de cache Upstash Redis (1 hora TTL, stale-fallback).
- Stampede lock per-process (in-memory
  `Map<casa, Promise<void>>`).
- El DI swap que reemplaza
  `FxRateProviderUnconfigured` con el provider real.
- El nuevo campo `stale: boolean` en
  `FinancialAccountBalanceDto` (el DTO vive en `accounts`;
  el spec es co-owned por `fx` y `accounts` según las
  cross-references de abajo).
- La regla de resolución de casa aplicada en el call site
  de `get-account-balance.action.ts`.

### Out of scope

- EUR/ARS, USD/EUR, BRL/ARS, o cualquier par non-ARS↔USD. La
  interfaz `FxRateProvider` queda intacta para que un futuro
  `FxRateProviderFrankfurter` (o similar) pueda shippear
  como su propio cambio.
- FX multi-source (DolarAPI + Frankfurter + un fallback ARS
  hardcoded). Una única source para v1; la resiliencia se
  resuelve con el stale-fallback path, no agregando
  providers.
- FX multi-currency per-transaction (un futuro capability
  `transactions` PODRÍA almacenar la tasa FX usada en
  write time en cada row de transacción, pero para v1 la
  superficie FX queda read-only y display-only por BR-ACC-12).
- Un auto-picker `MOST_RECENT` que elija la casa con la
  última `fechaActualizacion` de DolarAPI. El usuario eligió
  el default fijo `oficial` para v1.
- Un Cron job programado que caliente la cache cada 30
  minutos. El TTL de 1 hora significa que la cache está
  warm mientras la app está en uso y se enfría durante la
  noche; el primer request después de un período quieto paga
  el round-trip a DolarAPI. Un warmup de Cron es un follow-up.
- Historial de cambios de casa por cuenta (audit log). La
  columna `casa` carga sólo el valor actual. El historial es
  un follow-up.
- Cambios de UI de producción más allá del chip de warning
  de smoke. La UI de producción de FX vive en `ui-accounts`.
- Migrar el cliente Upstash del módulo rate-limit a una
  factory compartida `UpstashClient`. Dos consumers Upstash
  con su propia construcción de cliente es aceptable para v1.

### Capability boundary

- `fx` es dueña de la integración con DolarAPI, la capa de
  cache, el stampede lock, y la implementación de
  `FxRateProvider`.
- `accounts` es dueña del port interface de `FxRateProvider`,
  el endpoint display read-only, la columna `casa` en
  `FinancialAccount`, el form de edición de casa, y la regla
  de resolución en el call site.
- La dependencia apunta de `fx` al port interface de
  `accounts`, nunca al revés, preservando el invariante de
  ports & adapters.

## Entidades

El spec es mayormente a nivel de interfaz. Tres shapes son
parte del contrato que cruza la frontera `accounts` ↔ `fx`.

### `FxQuote`

El value object que un provider concreto retorna para una
sola casa. Validado por Zod en la frontera.

| Field    | Type                              | Constraints                                                    |
| -------- | --------------------------------- | -------------------------------------------------------------- |
| `casa`   | `AccountFxCasa` (lowercase string) | Uno de `oficial \| blue \| mep \| ccl \| cripto \| tarjeta`.   |
| `buy`    | `number`                          | Numérico (sin `NaN`); usado para futuro flow `FX_BUY`, no v1.  |
| `sell`   | `number`                          | Numérico (sin `NaN`); la tasa usada para conversión de display. |
| `fxAsOf` | `string` (ISO-8601)               | Timestamp fuente desde DolarAPI. Inmutable.                     |

Invariantes:

- `buy` y `sell` son ambos estrictamente positivos.
- `fxAsOf` parsea como una fecha válida y está en el pasado
  relativo al wall clock al momento del read (los timestamps
  de DolarAPI no están fechados a futuro en la práctica).
- El shape es una interfaz estable validada por Zod; el wire
  format de DolarAPI mapea 1:1 a los field names para que un
  parse failure sea loud, no silent.

### `FxRateCacheEntry`

El shape almacenado en el cache Upstash Redis. Un superset de
`FxQuote` más los metadata de freshness que la capa de cache
necesita.

| Field       | Type                | Constraints                                                          |
| ----------- | ------------------- | -------------------------------------------------------------------- |
| `casa`      | `AccountFxCasa`     | Mismo enum que `FxQuote.casa`.                                       |
| `buy`       | `number`            | Igual que `FxQuote.buy`.                                             |
| `sell`      | `number`            | Igual que `FxQuote.sell`.                                            |
| `fxAsOf`    | `string` (ISO-8601) | Igual que `FxQuote.fxAsOf`.                                          |
| `cachedAt`  | `string` (ISO-8601) | El momento en que la capa de cache seteó la entry. Usado para decidir staleness. |

Invariantes:

- `cachedAt >= fxAsOf` (el cache no puede haberse seteado
  antes del timestamp fuente).
- La entry está JSON-encoded; `cachedAt` es el único field
  que el consumer del cache debe leer para decidir staleness
  — el TTL de Upstash es la expiry autoritativa.

### `FxRequest`

El shape de input que un caller pasa al `FxRateProvider`.

| Field  | Type            | Constraints                                                            |
| ------ | --------------- | ---------------------------------------------------------------------- |
| `casa` | `AccountFxCasa` | Ya resuelto por el caller (`account.casa ?? env.FX_DEFAULT_CASA`).    |

Invariantes:

- `casa` es non-null al punto en que el provider lo ve. El
  provider NO DEBE consultar el env var o la row de la
  account; la resolución es trabajo del caller (BR-FX-3).
- `casa` es uno de los seis valores `AccountFxCasa`,
  validado por el mismo Zod schema usado para los account
  updates.

## Operaciones

La capability expone cinco operaciones a través del port
`FxRateProvider` y la capa de cache que lo soporta. Las
operaciones son a nivel de interfaz: describen lo que debe
ser cierto, no los nombres de clase o rutas de archivo que
las implementan.

### `getRate(casa)`

Retorna un `FxQuote` fresco para la casa dada. El provider:

- Chequea el cache (ver `getCachedRate`).
- En cache hit (fresh OR stale): retorna el quote cacheado
  inmediatamente. En stale, el provider DEBE además agendar
  un background refresh (ver `refreshIfStale`).
- En cache miss: llama a DolarAPI. On success, escribe la
  respuesta al cache y la retorna. On DolarAPI failure,
  throw `AppError(FX_UNAVAILABLE)` (503).

El caller es `get-account-balance.action.ts` en `accounts`.

### `getCachedRate(casa)`

Lee la entry Upstash Redis para la casa dada. Retorna
`{ quote: FxQuote, stale: boolean }` o `null` si la entry
está ausente. La capa de cache es un no-op (siempre retorna
`null`) cuando `UPSTASH_REDIS_REST_URL` o
`UPSTASH_REDIS_REST_TOKEN` están ausentes — el provider cae
through a DolarAPI en ese caso (BR-FX-5).

### `refreshIfStale(casa)`

Si hay un valor stale en el cache, fetcha un valor fresco de
DolarAPI y sobrescribe la entry del cache. El refresh es
fire-and-forget: los failures NO DEBEN surfacear al caller
original de `getRate`. El próximo call ve el mismo valor
stale hasta que el refresh succeeda (BR-FX-1, BR-FX-2).

### `getStaleOrThrow(casa)`

Lee el cache y retorna la entry con `stale: true` si existe,
sin importar el TTL. Throw `AppError(FX_UNAVAILABLE)` (503)
si la entry está ausente. Usado por el read path para
preservar una tasa usable cuando DolarAPI está down pero
existe un valor previo.

### `coalesceFetch(casa, fn)`

Envuelve `fn` (un fetch a DolarAPI) en el stampede lock
per-process. El primer caller para una casa dada en un
cache miss inserta un `Promise<void>` y corre `fn`; los
callers concurrentes esperan el mismo promise. La entry se
borra en resolve para que el próximo miss re-fetchee. Sin
coordinación cross-process (BR-FX-7).

## Requirements

### Contrato de cache

#### REQ-FX-1: TTL del cache es 1 hora y stale-fallback retorna el último valor conocido

El sistema DEBE setear el valor Upstash `EX` en `3600` (1 hora)
en cada cache write. Después de que el TTL expira, el valor
se considera "stale". En un read stale, el sistema DEBE
retornar el valor cacheado Y emitir una señal `stale: true`
en el balance DTO Y emitir un string de warning en el array
`warnings: string[]`. El sistema DEBE disparar un background
refresh en un read stale. El background refresh NO DEBE
surfacear un failure al caller de `getRate`; el próximo call
DEBE observar el mismo valor stale hasta que el refresh
succeda.

##### Scenario: Cache miss seguido de hit dentro del TTL

- GIVEN: el cache no tiene entry para `oficial`
- WHEN: un caller invoca `getRate("oficial")`
- THEN: DolarAPI es llamado una vez
- AND: la respuesta se escribe al cache con `EX 3600`
- AND: el caller recibe el `FxQuote` fresco con `stale: false`
- AND: el próximo call dentro de 1 hora se sirve del cache sin llamada a DolarAPI

##### Scenario: Stale read retorna el valor cacheado y refreshea en background

- GIVEN: el cache tiene una entry `oficial` escrita hace 2 horas
- WHEN: un caller invoca `getRate("oficial")`
- THEN: el caller recibe el `FxQuote` cacheado con `stale: true`
- AND: el DTO de respuesta carga el string de warning `"FX rate is stale; showing last known value."`
- AND: un fetch de DolarAPI en background se inicia
- AND: el request del caller no bloquea sobre el background fetch

##### Scenario: Background refresh failure no surfacea

- GIVEN: el cache tiene una entry stale `oficial`
- AND: DolarAPI retorna un 5xx
- WHEN: un caller invoca `getRate("oficial")`
- THEN: el caller recibe el valor stale cacheado con `stale: true`
- AND: no se lanza `AppError(FX_UNAVAILABLE)`
- AND: el próximo call observa el mismo valor stale

#### REQ-FX-2: DolarAPI unavailable on cache miss throws FX_UNAVAILABLE

El sistema DEBE lanzar `AppError(FX_UNAVAILABLE)` (HTTP 503)
cuando `getRate` se llama en un cache miss y DolarAPI está
unreachable, retorna un non-2xx, o retorna un payload que
falla la validación Zod. El sistema NO DEBE retornar un
quote parcial, un objeto vacío, o un valor sintético. No
hay un tercer estado: hit-fresh, hit-stale, miss-no-upstream
(throws).

##### Scenario: DolarAPI 5xx en cache miss throws 503

- GIVEN: el cache no tiene entry para `oficial`
- AND: DolarAPI retorna HTTP 500
- WHEN: un caller invoca `getRate("oficial")`
- THEN: `AppError(FX_UNAVAILABLE)` se lanza
- AND: el caller mapea esto a HTTP 503

##### Scenario: DolarAPI malformed payload throws 503

- GIVEN: el cache no tiene entry para `oficial`
- AND: DolarAPI retorna un 200 con un payload que falla la validación Zod (p.ej. falta `venta`)
- WHEN: un caller invoca `getRate("oficial")`
- THEN: `AppError(FX_UNAVAILABLE)` se lanza
- AND: el response status del caller es 503

#### REQ-FX-3: Casa resolution es responsabilidad del caller

El `FxRateProvider` DEBE recibir una `casa` completamente
resuelta en cada call. El provider NO DEBE leer
`process.env.FX_DEFAULT_CASA` ni ninguna columna en
`FinancialAccount`. El caller es
`get-account-balance.action.ts` en `accounts`, y la regla de
resolución es `account.casa ?? process.env.FX_DEFAULT_CASA`
donde `process.env.FX_DEFAULT_CASA` default a `oficial`
cuando está unset. `NULL` account `casa` significa "hereda
el global default".

##### Scenario: NULL account.casa cae al global default

- GIVEN: la account del usuario autenticado tiene `casa = NULL`
- AND: `process.env.FX_DEFAULT_CASA` está unset
- WHEN: la action resuelve la casa y llama `getRate`
- THEN: la casa pasada a `getRate` es `"oficial"`

##### Scenario: Explicit account.casa overrides the global default

- GIVEN: la account del usuario autenticado tiene `casa = "blue"`
- AND: `process.env.FX_DEFAULT_CASA` es `"oficial"`
- WHEN: la action resuelve la casa y llama `getRate`
- THEN: la casa pasada a `getRate` es `"blue"`

##### Scenario: FX_DEFAULT_CASA env var se honra cuando está set

- GIVEN: la account del usuario autenticado tiene `casa = NULL`
- AND: `process.env.FX_DEFAULT_CASA = "mep"`
- WHEN: la action resuelve la casa y llama `getRate`
- THEN: la casa pasada a `getRate` es `"mep"`

#### REQ-FX-4: Cache key está namespaced por la convención del módulo rate-limit

El sistema DEBE usar la cache key
`gastos-personales:fx:ars-usd:<casa>` para cada operación
`SET` y `GET`. El prefix matchea la convención
`gastos-personales:ratelimit` del módulo rate-limit. Una key
por casa.

> Implementación: el cache key prefix actual es
> `gastos-personales:fx:v1:<casa>` (DG-D-1 cerró esto con
> el `v1` forward-only cache-bust prefix en lugar de
> `ars-usd`; ver `design.md` §4). El comportamiento es
> equivalente para v1.

#### REQ-FX-5: Cache es no-op sin Upstash env vars

El sistema DEBE ser un no-op para todas las operaciones de
cache (`get`, `set`) cuando `UPSTASH_REDIS_REST_URL` o
`UPSTASH_REDIS_REST_TOKEN` están ausentes. El provider cae
through a DolarAPI en cada call en ese caso. El sistema
DEBE bootear sin crash en ausencia de las env vars; el log
event `fx.cache.noop` se emite una vez al boot.

#### REQ-FX-6: El sistema agrega un `stale: boolean` al balance DTO y un array `warnings`

El sistema DEBE agregar un campo `stale: boolean` al
`FinancialAccountBalanceDto` retornado por
`GET /api/accounts/:id/balance?displayCurrency=…`. El campo
es `true` cuando el rate está past su freshness window
(cache TTL excedido). El array `warnings?: string[]` se
popula con el string único `"FX rate is stale; showing last
known value."` cuando `stale === true`. El array se omite
de la response cuando `stale === false`. El widget de
balance renderiza un chip amber "Cotización desactualizada
(hace N min)" cuando `stale === true` (BR-FX-6).

##### Scenario: Fresh hit retorna stale=false sin warnings array

- GIVEN: la cache tiene un entry fresco para `oficial`
- WHEN: un caller invoca `getRate("oficial")`
- THEN: el DTO expone `stale: false`
- AND: el campo `warnings` se omite

##### Scenario: Stale hit retorna stale=true con warnings array

- GIVEN: la cache tiene un entry stale para `oficial`
- WHEN: un caller invoca `getRate("oficial")`
- THEN: el DTO expone `stale: true`
- AND: el campo `warnings` se popula con `"FX rate is stale; showing last known value."`

### Concurrencia

#### REQ-FX-7: Stampede lock coalesce cold-start fetches concurrentes

El sistema DEBE garantizar que en un cache miss para una
casa dada, sólo UN fetch a DolarAPI se dispare aunque
múltiples callers concurrentes invoquen `getRate(casa)` en
el mismo tick. El segundo caller (y los subsiguientes) DEBE
esperar la respuesta del primer fetch. Concurrent calls para
CASAS DIFERENTES son independientes (cada casa tiene su
propia entry en el lock). Después del resolve, la entry se
elimina; el próximo cache miss re-fetchea.

##### Scenario: 10 concurrent same-casa calls disparan UN fetch

- GIVEN: el cache no tiene entry para `oficial`
- WHEN: 10 callers invocan `getRate("oficial")` concurrentemente
- THEN: DolarAPI es llamado una vez
- AND: los 10 callers reciben la misma respuesta

##### Scenario: Different casas son independientes

- GIVEN: el cache no tiene entries
- WHEN: dos callers invocan `getRate("oficial")` y
  `getRate("blue")` concurrentemente
- THEN: DolarAPI es llamado dos veces (una por casa)
- AND: cada caller recibe la respuesta de su casa

### Configuración

#### REQ-FX-8: Base URL override via env var

El sistema DEBE apuntar a `https://dolarapi.com/v1` por
defecto. Cuando `process.env.DOLAR_API_BASE_URL` está
presente, el sistema DEBE apuntar a esa URL en su lugar.
El base URL se valida a startup; un valor malformado causa
un crash fast (Zod).

##### Scenario: Base URL default

- GIVEN: `DOLAR_API_BASE_URL` está unset
- WHEN: el sistema bootea
- THEN: el client apunta a `https://dolarapi.com/v1`

##### Scenario: Base URL env override

- GIVEN: `DOLAR_API_BASE_URL = "http://localhost:9999"` (test fixture)
- WHEN: el sistema bootea
- THEN: el client apunta a `http://localhost:9999`

### Migración

#### REQ-FX-9: Migración aditiva no-destructiva

La columna `FinancialAccount.casa` se agrega vía una
migración Prisma que es puramente aditiva: `ALTER TABLE
"FinancialAccount" ADD COLUMN "casa" "AccountFxCasa" NULL`
sin default, sin backfill. Las rows existentes aterrizan
con `casa IS NULL` y heredan el global default en el read
path (REQ-FX-3).

##### Scenario: Existing rows post-migration tienen casa IS NULL

- GIVEN: la base de datos tiene N rows de `FinancialAccount`
- AND: la migración `add_account_fx_casa` se aplicó
- WHEN: un query cuenta `SELECT count(*) FROM "FinancialAccount" WHERE "casa" IS NULL`
- THEN: el count es N (cada row existente tiene `casa IS NULL`)

##### Scenario: Insertar un nuevo row con casa set funciona

- GIVEN: la migración se aplicó
- WHEN: un caller inserta un row con `casa = 'BLUE'`
- THEN: el row aterriza con `casa = 'BLUE'`

## Cross-references

- [`auth/spec.md`](../auth/spec.md) — la sesión del usuario
  autenticado es la fuente de verdad para el `userId` en
  toda request al balance endpoint.
- [`accounts/spec.md`](../accounts/spec.md) — el port
  `FxRateProvider` está declarado en
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`
  (consumido por `accounts` vía `get-account-balance.action.ts`;
  implementado por `fx`). El DTO
  `FinancialAccountBalanceDto` está co-owned — el campo
  `stale: boolean` lo carga `fx` pero el DTO vive en
  `accounts`. La columna `FinancialAccount.casa` la
  administra `accounts`.

## Historial de cambios

| Fecha       | Cambio                                              | Autor       |
| ----------- | --------------------------------------------------- | ----------- |
| 2026-06-21  | Spec inicial (delta spec bajo `changes/fx-cache/`) | Sebastián Illa |
| 2026-06-22  | Promoción a canónico bajo `openspec/specs/fx/spec.md` (PR-3) | Sebastián Illa |
