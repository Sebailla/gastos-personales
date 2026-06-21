# Spec — capacidad `fx`

**Autor**: Sebastián Illa
**Capacidad**: `fx`
**Cambio de origen**: `fx-cache`
**Estado**: activo · **Creado**: 2026-06-21 · **Última sincronización**: 2026-06-21 (fx-cache)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (heredado de `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4

> Primera escritura del spec de la capacidad `fx`. Operacionaliza
> la propuesta `fx-cache` (borrador 2026-06-21) más las cinco
> decisiones de producto cerradas en la misma sesión (DG-FX-1 a
> DG-FX-5, ver "Decisiones cerradas" abajo). El spec declara **lo
> que DEBE ser cierto** después de que el cambio aterrice, no
> cómo implementarlo. Los detalles de implementación (rutas de
> archivo, sintaxis de schema, layout de tests) están limitados
> a lo que el contrato cross-module requiere.
>
> Este es un **spec delta** para la capacidad nueva `fx`. La
> capacidad `fx` todavía no existe bajo `openspec/specs/` — vive
> bajo `openspec/changes/fx-cache/specs/fx/` hasta que
> `sdd-archive` la promueva a la ubicación canónica.

## Decisiones cerradas (DG-FX-1 a DG-FX-5 — 2026-06-21)

Las cinco lagunas de decisión son autoritativas donde modifican
o extienden la propuesta. El spec las refleja como Requirements
y BRs, no como una sección de "decisiones" separada. Los IDs de
decisión se referencian inline en los cuerpos de los Scenarios
correspondientes.

| Gap     | Decisión                                                  | Rationale                                                                                   | Codificado en     |
| ------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------- |
| DG-FX-1 | Casa default = `oficial`                                  | Elección conservadora; el smoke widget ya lo muestra por BR-ACC-18.                         | BR-FX-3           |
| DG-FX-2 | Casa por cuenta en v1                                     | La columna es aditiva; el usuario eligió v1 sobre un follow-up diferido.                    | Cambio 5, BR-FX-3 |
| DG-FX-3 | Chip amber visible `stale: boolean`                       | Señal user-visible más chica que mapea a una primitiva UX.                                  | Cambio 3, BR-FX-6 |
| DG-FX-4 | Lock in-process `Map<casa, Promise<void>>`                | Defensa más barata contra estampida de cold-start; sin protocolo de coordinación.            | Cambio 6, BR-FX-7 |
| DG-FX-5 | Base URL hardcoded + override `DOLAR_API_BASE_URL`        | Costo de una línea de env var; los tests consiguen un switch de sandbox; producción no deriva. | BR-FX-8           |

Las alternativas consideradas para cada gap quedan registradas
en `docs/adr/0010-dolar-api-provider.md` (escrito por
`sdd-design`). EUR/ARS queda fuera de v1 según la sección
"No-objetivos" de la propuesta.

## Propósito

La capacidad `fx` es dueña de la implementación del puerto
`FxRateProvider` que `accounts` declara. Es una **capacidad de
presentación de sólo lectura**: no muta balances, no es dueña
del almacenamiento de la tasa FX en el modelo de dominio, y no
es dueña del endpoint `GET /api/accounts/:id/balance` (ese
endpoint vive en `accounts`). Expone una superficie de tasa
estable para la capa de presentación — `{ amount, currency,
fxRate, fxAsOf }` más una señal `stale: boolean` y un array
`warnings: string[]` — que cualquier consumer que necesite una
conversión puede usar sin aprender los detalles upstream.

La capacidad garantiza que: (a) una única implementación
concreta de `FxRateProvider` (DolarAPI) está cableada en el
grafo DI; (b) el contrato de caché (TTL 1 h, fallback stale,
lock anti-estampida) se observa en cada lectura; (c) la regla
de selección de casa (`account.casa ?? env.FX_DEFAULT_CASA`) se
aplica en el call-site de `accounts`, nunca dentro del
proveedor, así que el proveedor no tiene estado global por
llamada; (d) la superficie de la tasa degrada elegantemente
cuando DolarAPI está caído, y falla en voz alta cuando nunca
hubo una tasa para servir; (e) el lock anti-estampida en
memoria por proceso coalesce fetches concurrentes de
cold-start para que una estampida no golpee DolarAPI.

## Alcance

### In scope

- Módulo nuevo `src/modules/fx/` (paralelo a
  `src/modules/accounts/`).
- Implementación de `FxRateProvider` respaldada por DolarAPI.
- Capa de caché Upstash Redis (TTL 1 h, fallback stale).
- Lock anti-estampida por proceso (`Map<casa, Promise<void>>`
  en memoria).
- El swap de DI que reemplaza
  `FxRateProviderUnconfigured` por el proveedor real.
- El nuevo campo `stale: boolean` en
  `FinancialAccountBalanceDto` (el DTO vive en `accounts`; el
  spec es co-dueño entre `fx` y `accounts` según las
  cross-references abajo).
- La regla de resolución de casa aplicada en el call-site de
  `get-account-balance.action.ts`.

### Fuera del alcance

- EUR/ARS, USD/EUR, BRL/ARS, o cualquier par que no sea
  ARS↔USD. La interfaz `FxRateProvider` queda intacta para que
  un futuro `FxRateProviderFrankfurter` (o similar) pueda
  enviarse como su propio cambio.
- FX multi-fuente (DolarAPI + Frankfurter + fallback ARS
  hardcoded). Fuente única en v1; la resiliencia la resuelve
  el camino de fallback stale, no agregando proveedores.
- FX multi-moneda por transacción (una futura capacidad
  `transactions` PUEDE guardar la tasa FX usada al momento de
  escritura en cada fila de transacción, pero para v1 la
  superficie FX queda read-only y sólo de display según
  BR-ACC-12).
- Un auto-picker `MOST_RECENT` que elija la casa con la
  última `fechaActualizacion` de DolarAPI. El usuario eligió el
  default fijo `oficial` para v1.
- Un Cron programado que entibie la caché cada 30 minutos. El
  TTL de 1 h significa que la caché está caliente mientras la
  app está en uso y se enfría durante la noche; el primer
  request después de un período quieto paga el round-trip a
  DolarAPI. Un warmup por Cron es follow-up.
- Historial de cambios de casa por cuenta (audit log). La
  columna `casa` lleva sólo el valor actual. El historial es
  follow-up.
- Cambios de UI de producción más allá del chip de warning del
  smoke. La UI de producción de FX vive en `ui-accounts`.
- Migrar el cliente Upstash del módulo rate-limit a una
  factory `UpstashClient` compartida. Dos consumidores Upstash
  con su propio constructor de cliente es aceptable en v1.

### Límite de capacidad

- `fx` es dueña de la integración con DolarAPI, la capa de
  caché, el lock anti-estampida, y la implementación de
  `FxRateProvider`.
- `accounts` es dueña de la interfaz del puerto
  `FxRateProvider`, el endpoint de display de sólo lectura, la
  columna `casa` en `FinancialAccount`, el form de edición de
  casa, y la regla de resolución de casa en el call-site.
- La dependencia apunta de `fx` a la interfaz del puerto en
  `accounts`, nunca al revés, preservando el invariante de
  ports & adapters.

## Entidades

El spec es mayormente a nivel de interfaz. Tres formas son
parte del contrato que cruza el límite `accounts` ↔ `fx`.

### `FxQuote`

El value object que un proveedor concreto devuelve para una
casa. Validado por Zod en la frontera.

| Campo    | Tipo                              | Restricciones                                                       |
| -------- | --------------------------------- | ------------------------------------------------------------------- |
| `casa`   | `AccountFxCasa` (string lowercase) | Uno de `oficial \| blue \| mep \| ccl \| cripto \| tarjeta`.       |
| `buy`    | `number`                          | Numérico (sin `NaN`); usado para un futuro flujo `FX_BUY`, no v1.   |
| `sell`   | `number`                          | Numérico (sin `NaN`); la tasa usada para la conversión de display.  |
| `fxAsOf` | `string` (ISO-8601)               | Timestamp de la fuente desde DolarAPI. Inmutable.                   |

Invariantes:

- `buy` y `sell` son ambos estrictamente positivos.
- `fxAsOf` parsea como fecha válida y está en el pasado
  relativo al wall-clock al momento de lectura (los timestamps
  de DolarAPI en la práctica no están fechados al futuro).
- La forma es una interfaz estable validada por Zod; el
  formato wire de DolarAPI mapea 1:1 a los nombres de campo,
  así que un parse failure es ruidoso, no silencioso.

### `FxRateCacheEntry`

La forma guardada en la caché de Upstash Redis. Un superset de
`FxQuote` más los metadatos de frescura que la capa de caché
necesita.

| Campo      | Tipo                | Restricciones                                                                |
| ---------- | ------------------- | ---------------------------------------------------------------------------- |
| `casa`     | `AccountFxCasa`     | Mismo enum que `FxQuote.casa`.                                               |
| `buy`      | `number`            | Igual que `FxQuote.buy`.                                                     |
| `sell`     | `number`            | Igual que `FxQuote.sell`.                                                    |
| `fxAsOf`   | `string` (ISO-8601) | Igual que `FxQuote.fxAsOf`.                                                  |
| `cachedAt` | `string` (ISO-8601) | El momento en que la capa de caché setea la entry. Usado para decidir staleness. |

Invariantes:

- `cachedAt >= fxAsOf` (la caché no puede haberse seteado antes
  del timestamp de la fuente).
- La entry está encodeada en JSON; `cachedAt` es el único
  campo que el consumer de la caché debe leer para decidir
  staleness — el TTL de Upstash es la expiración autoritativa.

### `FxRequest`

La forma de input que un caller pasa al `FxRateProvider`.

| Campo  | Tipo            | Restricciones                                                              |
| ------ | --------------- | -------------------------------------------------------------------------- |
| `casa` | `AccountFxCasa` | Ya resuelto por el caller (`account.casa ?? env.FX_DEFAULT_CASA`).         |

Invariantes:

- `casa` es non-null en el punto en que el proveedor lo ve. El
  proveedor NO DEBE consultar la env var ni la fila de la
  cuenta; la resolución es trabajo del caller (BR-FX-3).
- `casa` es uno de los seis valores de `AccountFxCasa`,
  validado por el mismo esquema Zod usado para los updates de
  cuenta.

## Operaciones

La capacidad expone cinco operaciones a través del puerto
`FxRateProvider` y la capa de caché que lo soporta. Las
operaciones son a nivel de interfaz: describen lo que DEBE ser
cierto, no los nombres de clase ni las rutas de archivo que las
implementan.

### `getRate(casa)`

Devuelve un `FxQuote` fresco para la casa dada. El proveedor:

- Consulta la caché (ver `getCachedRate`).
- En cache hit (fresco O stale): devuelve el quote cacheado de
  inmediato. En stale, el proveedor DEBE también agendar un
  refresh en background (ver `refreshIfStale`).
- En cache miss: llama a DolarAPI. Si tiene éxito, escribe la
  respuesta en la caché y la devuelve. Si DolarAPI falla,
  lanza `AppError(FX_UNAVAILABLE)` (503).

El caller es `get-account-balance.action.ts` en `accounts`.

### `getCachedRate(casa)`

Lee la entry de Upstash Redis para la casa dada. Devuelve
`{ quote: FxQuote, stale: boolean }` o `null` si la entry está
ausente. La capa de caché es no-op (siempre devuelve `null`)
cuando faltan `UPSTASH_REDIS_REST_URL` o
`UPSTASH_REDIS_REST_TOKEN` — el proveedor cae a DolarAPI en
ese caso (BR-FX-5).

### `refreshIfStale(casa)`

Si un valor stale está presente en la caché, fetcha un valor
fresco desde DolarAPI y sobrescribe la entry de caché. El
refresh es fire-and-forget: los fallos NO DEBEN surfacear al
caller original de `getRate`. La próxima llamada ve el mismo
valor stale hasta que el refresh tenga éxito (BR-FX-1,
BR-FX-2).

### `getStaleOrThrow(casa)`

Lee la caché y devuelve la entry con `stale: true` si existe,
sin importar el TTL. Lanza `AppError(FX_UNAVAILABLE)` (503) si
la entry está ausente. Usado por el camino de lectura para
preservar una tasa utilizable cuando DolarAPI está caído pero
existe un valor previo.

### `coalesceFetch(casa, fn)`

Envuelve `fn` (un fetch a DolarAPI) en el lock anti-estampida
por proceso. El primer caller para una casa dada en cache miss
inserta una `Promise<void>` y corre `fn`; los callers
concurrentes esperan la misma promise. La entry se borra al
resolver para que el próximo miss vuelva a fetchear. Sin
coordinación cross-process (BR-FX-7).

## Requirements

### Contrato de caché

#### REQ-FX-1: El TTL de la caché es 1 hora y el fallback stale devuelve el último valor conocido

El sistema DEBE setear el valor `EX` de Upstash a `3600` (1
hora) en cada escritura a la caché. Después de que el TTL
expira, el valor se considera "stale". En una lectura stale, el
sistema DEBE devolver el valor cacheado Y emitir una señal
`stale: true` en el DTO de balance Y emitir un string de
warning en el array `warnings: string[]`. El sistema DEBE
disparar un refresh en background en una lectura stale. El
refresh en background NO DEBE surfacear un fallo al caller de
`getRate`; la próxima llamada DEBE observar el mismo valor
stale hasta que el refresh tenga éxito.

##### Scenario: Cache miss seguido de hit dentro del TTL

- GIVEN: la caché no tiene entry para `oficial`
- WHEN: un caller invoca `getRate("oficial")`
- THEN: DolarAPI se llama una vez
- AND: la respuesta se escribe en la caché con `EX 3600`
- AND: el caller recibe el `FxQuote` fresco con `stale: false`
- AND: la próxima llamada dentro de 1 hora se sirve de la caché sin llamar a DolarAPI

##### Scenario: Lectura stale devuelve el valor cacheado y refresca en background

- GIVEN: la caché tiene una entry de `oficial` escrita hace 2 horas
- WHEN: un caller invoca `getRate("oficial")`
- THEN: el caller recibe el `FxQuote` cacheado con `stale: true`
- AND: el DTO de respuesta lleva el string de warning `"FX rate is stale; showing last known value."`
- AND: se inicia un fetch a DolarAPI en background
- AND: el request del caller no bloquea en el fetch en background

##### Scenario: Falla del refresh en background no surfacea

- GIVEN: la caché tiene una entry stale de `oficial`
- AND: DolarAPI devuelve un 5xx
- WHEN: un caller invoca `getRate("oficial")`
- THEN: el caller recibe el valor stale cacheado con `stale: true`
- AND: no se lanza ningún `AppError(FX_UNAVAILABLE)`
- AND: la próxima llamada observa el mismo valor stale

#### REQ-FX-2: DolarAPI no disponible en cache miss lanza FX_UNAVAILABLE

El sistema DEBE lanzar `AppError(FX_UNAVAILABLE)` (HTTP 503)
cuando se llama a `getRate` en un cache miss y DolarAPI es
inalcanzable, devuelve un non-2xx, o devuelve un payload que
falla la validación de Zod. El sistema NO DEBE devolver un
quote parcial, un objeto vacío, o un valor sintético. No hay
un tercer estado: hit-fresh, hit-stale, miss-sin-upstream
(lanza).

##### Scenario: DolarAPI 5xx en cache miss lanza 503

- GIVEN: la caché no tiene entry para `oficial`
- AND: DolarAPI devuelve HTTP 500
- WHEN: un caller invoca `getRate("oficial")`
- THEN: se lanza `AppError(FX_UNAVAILABLE)`
- AND: el caller mapea esto a HTTP 503

##### Scenario: Payload malformado de DolarAPI lanza 503

- GIVEN: la caché no tiene entry para `oficial`
- AND: DolarAPI devuelve un 200 con un payload que falla la validación de Zod (por ejemplo, sin `venta`)
- WHEN: un caller invoca `getRate("oficial")`
- THEN: se lanza `AppError(FX_UNAVAILABLE)`
- AND: el status de respuesta del caller es 503

#### REQ-FX-3: La resolución de casa es responsabilidad del caller

El `FxRateProvider` DEBE recibir una `casa` completamente
resuelta en cada llamada. El proveedor NO DEBE leer
`process.env.FX_DEFAULT_CASA` ni ninguna columna de
`FinancialAccount`. El caller es
`get-account-balance.action.ts` en `accounts`, y la regla de
resolución es `account.casa ?? process.env.FX_DEFAULT_CASA`
donde `process.env.FX_DEFAULT_CASA` default a `oficial` cuando
no está seteada. `account.casa = NULL` significa "heredar el
default global".

##### Scenario: account.casa NULL cae al default global

- GIVEN: la cuenta del usuario autenticado tiene `casa = NULL`
- AND: `process.env.FX_DEFAULT_CASA` no está seteada
- WHEN: la acción resuelve la casa y llama a `getRate`
- THEN: la casa pasada a `getRate` es `"oficial"`

##### Scenario: account.casa explícito sobrescribe el default global

- GIVEN: la cuenta del usuario autenticado tiene `casa = "blue"`
- AND: `process.env.FX_DEFAULT_CASA` es `"oficial"`
- WHEN: la acción resuelve la casa y llama a `getRate`
- THEN: la casa pasada a `getRate` es `"blue"`

##### Scenario: La env var FX_DEFAULT_CASA se respeta cuando está seteada

- GIVEN: la cuenta del usuario autenticado tiene `casa = NULL`
- AND: `process.env.FX_DEFAULT_CASA = "mep"`
- WHEN: la acción resuelve la casa y llama a `getRate`
- THEN: la casa pasada a `getRate` es `"mep"`

#### REQ-FX-4: La clave de caché está namespaced por la convención del módulo rate-limit

El sistema DEBE usar la clave de caché
`gastos-personales:fx:ars-usd:<casa>` para cada operación
`SET` y `GET`. El prefijo matchea la convención
`gastos-personales:ratelimit` del módulo rate-limit. Una clave
por casa. Sin fan-out por request-key (la tasa es global, no
por usuario).

##### Scenario: La primera escritura usa la clave namespaced

- GIVEN: un caller invoca `getRate("oficial")` y la caché está vacía
- WHEN: la escritura en la caché sucede
- THEN: la clave de Redis es `gastos-personales:fx:ars-usd:oficial`
- AND: un `redis-cli GET` sobre esa clave devuelve el `FxRateCacheEntry` encodeado en JSON

##### Scenario: Casas distintas usan claves distintas

- GIVEN: la caché está vacía
- WHEN: un caller invoca `getRate("blue")` y otro invoca `getRate("mep")`
- THEN: las claves de Redis son `gastos-personales:fx:ars-usd:blue` y `gastos-personales:fx:ars-usd:mep`
- AND: ninguna clave hace shadow de la otra

#### REQ-FX-5: La caché es no-op cuando faltan las env vars de Upstash

El sistema DEBE degradar a un camino sin caché cuando
`process.env.UPSTASH_REDIS_REST_URL` o
`process.env.UPSTASH_REDIS_REST_TOKEN` no están seteadas. En
ese modo, cada llamada a `getRate` DEBE llamar a DolarAPI
directamente. El sistema NO DEBE lanzar error por env vars
faltantes; la ausencia es el contrato de dev local / CI. Este
es el único cambio de comportamiento entre los dos modos:
caching vs. sin caching. La semántica de errores y el valor
`stale: false` en una respuesta exitosa de DolarAPI son
idénticos.

##### Scenario: Env vars de Upstash faltantes caen a DolarAPI

- GIVEN: `process.env.UPSTASH_REDIS_REST_URL` no está seteada
- WHEN: un caller invoca `getRate("oficial")`
- THEN: no se emite ningún `GET` o `SET` a Redis
- AND: DolarAPI se llama una vez
- AND: el caller recibe el `FxQuote` fresco con `stale: false`

##### Scenario: Env vars de Upstash faltantes no lanzan al startup

- GIVEN: el proceso bootea sin env vars de Upstash
- WHEN: el grafo DI se construye
- THEN: no se lanza ningún error
- AND: el `FxRateProvider` se registra con éxito

### Superficie de display

#### REQ-FX-6: El DTO de balance lleva un booleano stale y un array de warnings

El sistema DEBE sumar un campo `stale: boolean` a
`FinancialAccountBalanceDto`. El sistema DEBE también poblar
el array `warnings?: string[]` existente con un único string
`"FX rate is stale; showing last known value."` cuando
`stale === true`. El sistema NO DEBE modificar el campo
`fxAsOf`; el timestamp queda como el timestamp de la fuente
sin importar la staleness. El smoke widget renderiza el chip
amber cuando `stale === true` y renderiza `fxAsOf` como
`"Last updated: <ISO>"` (BR-ACC-18) — las dos señales son
independientes y ambas son requeridas.

##### Scenario: Respuesta fresca lleva stale false y sin warnings

- GIVEN: un cache hit dentro del TTL para `oficial`
- WHEN: se llama al endpoint de balance
- THEN: el campo `stale` del cuerpo de respuesta es `false`
- AND: el campo `warnings` del cuerpo de respuesta es undefined

##### Scenario: Respuesta stale lleva stale true y el string de warning

- GIVEN: un cache hit pasado el TTL para `oficial`
- WHEN: se llama al endpoint de balance
- THEN: el campo `stale` del cuerpo de respuesta es `true`
- AND: el array `warnings` del cuerpo de respuesta contiene exactamente una entrada: `"FX rate is stale; showing last known value."`
- AND: `display.fxAsOf` del cuerpo de respuesta es el timestamp de la fuente, no el momento actual

### Cableado del proveedor

#### REQ-FX-7: El lock anti-estampida coalesce fetches concurrentes de cold-start

El sistema DEBE mantener un `Map<casa, Promise<void>>` por
proceso que protege el camino de cache miss. El primer caller
para una casa dada en cache miss DEBE insertar una
`Promise<void>` y correr el fetch a DolarAPI. Los callers
concurrentes para la misma casa DEBEN esperar la misma
promise. La entry DEBE borrarse al resolver para que el
próximo miss vuelva a fetchear. El sistema NO DEBE usar
Redis, advisory locks, ni ninguna coordinación cross-process.

##### Scenario: Llamadas concurrentes de cache miss para la misma casa disparan un solo fetch

- GIVEN: la caché está vacía para `oficial`
- WHEN: N callers concurrentes invocan `getRate("oficial")`
- THEN: se emite exactamente un fetch saliente a DolarAPI
- AND: cada caller recibe el mismo `FxQuote`

##### Scenario: Llamadas concurrentes de cache miss para casas distintas son independientes

- GIVEN: la caché está vacía para `oficial` y `blue`
- WHEN: un caller invoca `getRate("oficial")` y otro invoca `getRate("blue")` concurrentemente
- THEN: se emiten dos fetches salientes a DolarAPI (uno por casa)
- AND: ninguno de los callers bloquea al otro

#### REQ-FX-8: La base URL de DolarAPI está hardcoded con override por env var

El sistema DEBE defaultear la base URL del cliente DolarAPI a
`https://dolarapi.com/v1`. El sistema DEBE permitir override
vía `process.env.DOLAR_API_BASE_URL`. Cuando la env var está
seteada, el cliente DEBE usar el override; cuando no está
seteada, el cliente DEBE usar el default hardcoded. Producción
usa el default hardcoded. Los tests usan la env var para
apuntar a un sandbox local.

##### Scenario: Base URL default cuando la env var no está seteada

- GIVEN: `process.env.DOLAR_API_BASE_URL` no está seteada
- WHEN: el cliente de DolarAPI se construye
- THEN: el cliente apunta a `https://dolarapi.com/v1`

##### Scenario: La env var sobrescribe la base URL

- GIVEN: `process.env.DOLAR_API_BASE_URL = "http://localhost:9999"`
- WHEN: el cliente de DolarAPI se construye
- THEN: el cliente apunta a `http://localhost:9999`

### Persistencia

#### REQ-FX-9: La migración de la columna casa es no destructiva

La migración de Prisma para la nueva columna `casa` en
`FinancialAccount` DEBE agregar la columna como
`AccountFxCasa NULL` sin default y sin backfill. La migración
NO DEBE alterar ninguna columna existente, NO DEBE reescribir
ninguna fila existente, y NO DEBE tirar ninguna constraint.
Las filas existentes DEBEN terminar con `casa = NULL` después
de la migración. La smoke UI DEBE mostrar el default global
heredado para esas filas (es decir, la resolución de casa de
la acción cae por `account.casa ?? env.FX_DEFAULT_CASA`).

##### Scenario: La migración agrega la columna sin backfill

- GIVEN: una base de datos poblada con N filas existentes de `FinancialAccount`
- WHEN: la migración corre
- THEN: la columna `casa` existe en `FinancialAccount` como nullable
- AND: cada fila existente tiene `casa = NULL`
- AND: ninguna fila se altera, elimina, o backfillea

##### Scenario: Las filas existentes renderizan el default global heredado

- GIVEN: una fila de `FinancialAccount` con `casa = NULL`
- AND: `process.env.FX_DEFAULT_CASA` no está seteada (default a `oficial`)
- WHEN: el dueño envía el widget de balance
- THEN: la casa usada por el proveedor es `oficial`
- AND: el monto convertido renderiza sin error

## Indexes & constraints

| Superficie             | Restricción                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Clave de caché         | `gastos-personales:fx:ars-usd:<casa>` (casa en lowercase). Una entry por casa.                          |
| TTL de caché           | `EX 3600` en cada `SET`. Stale = `cachedAt < now() - 1h` (Upstash autoritativo).                       |
| Enum de casa           | Enum Prisma `AccountFxCasa`: `OFICIAL \| BLUE \| MEP \| CCL \| CRIPTO \| TARJETA` (uppercase en Prisma; lowercase en el wire de DolarAPI). |
| `FinancialAccount.casa` | Nullable. `NULL` = heredar el default global.                                                          |
| Env vars de Upstash    | Tanto `UPSTASH_REDIS_REST_URL` como `UPSTASH_REDIS_REST_TOKEN` DEBEN estar presentes para caching; faltantes → no-op. |
| Alcance del lock anti-estampida | Por proceso, por casa. Sin coordinación cross-process.                                       |
| Proveedor FX           | `FxRateProvider` (puerto en `accounts`); `FxRateProviderDolarApi` concreto (en `fx`).                  |

El orden de resolución `account.casa ?? process.env.FX_DEFAULT_CASA`
es la única resolución de casa que el sistema soporta en v1. La
env var, la columna, y el valor resuelto usan el mismo esquema
Zod para normalización, así que un typo en cualquier fuente
(`FX_DEFAULT_CASA=OfiCial` o `casa: "BLUE"`) se rechaza en la
frontera, no se pasa silenciosamente a DolarAPI.

## Semántica de errores

| Código                 | HTTP | Trigger                                                                                                       | Superficie del caller                                                  |
| ---------------------- | ---- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `FX_UNAVAILABLE`       | 503  | Cache miss + DolarAPI inalcanzable, non-2xx, o payload malformado. Zod parse failure en el wire.              | Banner de error según BR-ACC-18: `"FX rate provider unavailable. Try again in a few minutes."` |
| `FX_NOT_SUPPORTED`     | 409  | El proveedor configurado no soporta el par pedido (heredado de `accounts`).                                  | Banner de error según BR-ACC-18: `"FX conversion not supported for this pair."` |
| `FX_STALE`             | 200  | La caché devolvió un valor pasado su TTL. El cuerpo del DTO lleva `stale: true` Y el string de warning.        | Chip de warning amber + texto plano `"Last updated: <ISO>"`.           |

No hay un cuarto estado. El sistema NO DEBE devolver una tasa
sintética, una tasa `null`, o un 204 en un miss. El mapeo de
`FX_UNAVAILABLE` es propiedad del `errorHandler` central en
`accounts`; la capacidad `fx` lanza
`AppError(FX_UNAVAILABLE)` y nunca construye la respuesta HTTP
por su cuenta.

## Observabilidad

El módulo `fx` emite eventos de log estructurados para cada
llamada al proveedor y cada operación de caché. Los nombres de
campo exactos y el transporte son asunto de `sdd-design`
(diferido). El contrato DEBE ser:

| Evento                              | Campos (mínimo)                                                       |
| ----------------------------------- | --------------------------------------------------------------------- |
| Llamada al proveedor — cache hit    | `casa`, `cached`, `stale`, `fxAsOf`                                    |
| Llamada al proveedor — cache miss   | `casa`, `cached: false`, `dolarApiLatencyMs`, `fxAsOf`                 |
| Llamada al proveedor — cache miss fail | `casa`, `error: "FX_UNAVAILABLE"`, `dolarApiStatus?`, `errorMessage` |
| Refresh stale en background         | `casa`, `dolarApiLatencyMs`, `result: "ok" \| "fail"`                  |
| Coalesce del anti-estampida         | `casa`, `concurrentCallers: N`                                         |
| Capa de caché degradada (sin Upstash) | `reason: "missing_env"`                                              |

Reglas de captura en Sentry (a detallar en `sdd-design`):

- `FX_UNAVAILABLE` en cache miss: capturar como `error` (no
  tener una tasa upstream para servir es una falla real).
- `FX_UNAVAILABLE` en refresh stale: capturar como `warning`
  (degradado pero no roto; el camino stale está haciendo su
  trabajo).
- Capa de caché no-op (env vars faltantes): NO capturar (este
  es el contrato de dev local / CI).
- Todos los errores de Upstash: capturar como `error` con la
  operación (`get` / `set`) y la casa. Nunca loguear los
  valores de las env vars.

## Migración

La migración de Prisma para la selección de `casa` por cuenta
es el único cambio de schema persistente en este cambio.

```sql
-- no destructivo; sin default; sin backfill
ALTER TABLE "FinancialAccount"
  ADD COLUMN "casa" "AccountFxCasa" NULL;
```

Los cambios de schema de Prisma son aditivos:

- Enum nuevo `AccountFxCasa` con valores `OFICIAL`, `BLUE`,
  `MEP`, `CCL`, `CRIPTO`, `TARJETA`.
- Columna opcional nueva `casa AccountFxCasa?` en
  `FinancialAccount`.

La migración corre sin backfill, sin default, y sin fix de
datos a nivel código. Las filas existentes pasan de "sin
columna" a "columna es `NULL`". La smoke UI para esas filas
muestra el default global heredado (`oficial`) hasta que el
usuario elija explícitamente una casa distinta en el form de
edición de cuenta. **Sin pérdida de datos.**

El runtime de DolarAPI / Upstash no tiene migración. El
archivo stub `FxRateProviderUnconfigured` se borra en el
mismo cambio; no hay camino de upgrade in-place porque el
stub nunca sirvió datos reales.

## Fuera del alcance (este cambio)

Llevado verbatim de la propuesta; ver
`openspec/changes/fx-cache/proposal.md` §"Fuera del alcance"
para el detalle.

- EUR/ARS, USD/EUR, BRL/ARS, o cualquier par que no sea
  ARS↔USD.
- FX multi-moneda por transacción.
- Historial de cambios de casa por cuenta.
- Un auto-picker `MOST_RECENT`.
- Un Cron programado que entibie la caché cada 30 minutos.
- FX multi-fuente (DolarAPI + Frankfurter + una tercera
  fuente).
- Exponer `warnings` en la UI del smoke widget más allá del
  nuevo chip `stale: boolean`.
- Migrar el cliente Upstash del módulo rate-limit a una
  factory `UpstashClient` compartida.
- Cambios de UI de producción más allá del chip de warning
  del smoke.
- Notificaciones push o jobs en background de cualquier tipo.

## Cross-references

- **Propuesta**: `openspec/changes/fx-cache/proposal.md` — el
  cambio upstream que creó esta capacidad. BR-FX-1 a BR-FX-9
  se codifican acá; la propuesta lleva la rationale, las
  alternativas consideradas, y el forecast.
- **Spec de accounts**: `openspec/specs/accounts/spec.md` —
  BR-ACC-12 declara el contrato de display de sólo lectura y
  nota explícitamente "FX is a presentation concern" (la línea
  que el usuario pidió conservar). BR-ACC-13 cubre la frescura
  FX. BR-ACC-18 cubre el render del smoke widget. El campo
  `stale: boolean` sumado al DTO de balance acá es un cambio
  aditivo co-dueño entre ambas capacidades.
- **Spec delta de casa por cuenta**:
  `openspec/changes/fx-cache/specs/accounts/spec.md` — el
  spec delta hermano escrito por `sdd-spec` para la capacidad
  `accounts`, cubriendo la nueva columna `casa` en
  `FinancialAccount` y la regla de resolución de casa en el
  call-site (BR-FX-3).
- **ADR futuro (placeholder)**:
  `docs/adr/0010-dolar-api-provider.md` — a escribir por
  `sdd-design`. Registra la elección de DolarAPI, la
  estrategia de caché de 1 h, la decisión de casa por cuenta,
  y las alternativas rechazadas (Frankfurter, multi-fuente
  desde el día 1, caché en memoria, warmup por Cron, FX como
  columna DB, y las alternativas de casa por cuenta:
  single-global-only vs. env-var por cuenta vs. columna vs.
  auto-picker `MOST_RECENT`).
- **Interfaz del puerto (input estable)**:
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts` —
  la interfaz que esta capacidad implementa. Vive en
  `accounts`; `fx` depende de ella (la dirección del puerto es
  `fx → accounts`, no al revés).
- **Stub siendo reemplazado (borrado en este cambio)**:
  `src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts`.
- **Servicios externos**: DolarAPI (https://dolarapi.com) y
  Upstash Redis (env vars `UPSTASH_REDIS_REST_URL`,
  `UPSTASH_REDIS_REST_TOKEN`).

## Referencias

- `openspec/changes/fx-cache/proposal.md` — propuesta v1.1
  (2026-06-21) con DG-FX-1 a DG-FX-5 cerradas.
- `openspec/specs/accounts/spec.md` — capacidad canónica
  `accounts`; BR-ACC-12, BR-ACC-13, BR-ACC-18.
- `openspec/changes/archive/2026-06-19-accounts-ledger/proposal.md`
  — el cambio upstream que declaró el puerto
  `FxRateProvider`.
- `src/shared/errors/error-codes.ts` — `FX_UNAVAILABLE` (503),
  `FX_NOT_SUPPORTED` (409).
- `src/shared/rate-limit/rate-limit.ts` — patrón de cliente
  Upstash reusado por la capa de caché.
- `openspec/config.yaml` — reglas estrictas de TDD; runner
  `pnpm test`.
- `AGENTS.md` (raíz) — §5.3 política de `pnpm-lock.yaml`; §13
  política de mirror de docs en dos idiomas.
