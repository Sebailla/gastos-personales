# Design — `fx-cache`

**Status**: draft · **Author**: Sebastián Illa
**Created**: 2026-06-21 · **Change**: `fx-cache`
**Proposal**: `openspec/changes/fx-cache/proposal.md` (v1.1, 2026-06-21, DG-FX-1 a DG-FX-5 cerradas)
**Spec**: `openspec/changes/fx-cache/specs/fx/spec.md` (REQ-FX-1 a REQ-FX-9)
**Sibling delta spec**: `openspec/changes/fx-cache/specs/accounts/spec.md` (columna `casa` por cuenta)
**Capabilities affected**: `fx` (nueva; el spec canónico aterriza en `openspec/specs/fx/spec.md` al sincronizar), `accounts` (una edición cross-link en BR-ACC-12; el delta de la columna `casa` vive en el spec sibling)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (heredado de `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4
**Preflight**: interactive · `hybrid` (Engram + archivos OpenSpec) · `auto-chain` · budget de review 400 líneas
**Strict TDD**: habilitado según `openspec/config.yaml`; runner `pnpm test`; ciclo RED → GREEN → TRIANGULATE → REFACTOR

> Este documento NO reabre el debate de la propuesta ni del
> spec. Implementa el "qué" del spec con el "cómo" — estructura
> de módulos, encoding de la clave de caché, shape del cliente
> DolarAPI, lifecycle del lock anti-estampida, flujo de fallback
> stale, regla de resolución de casa, punto de swap de DI, chip
> del smoke widget, las 4 design decisions que el spec dejó
> abiertas (clave de caché, política de retry, nombres de campo
> de observabilidad, eventos cross-module), y el rollout por PR.
> Un nuevo contributor puede leer esto y saber exactamente dónde
> aterriza cada Requirement del spec en el repo.

---

## 1. Summary

`fx-cache` es la tercera capability en salir después de
`auth-foundation` y `accounts-ledger`. Llena el puerto
`FxRateProvider` declarado en `accounts-ledger` con un proveedor
real respaldado por **DolarAPI**, agrega una **caché de 1 hora en
Upstash Redis** con un camino de **fallback stale** elegante para
que el smoke widget nunca dé 503 en un outage silencioso de
DolarAPI, y envía **selección de casa por cuenta** como columna
Prisma nullable en `FinancialAccount`. El cambio es la costura que
cada consumer futuro (`transactions`, `reports`, `snapshots`)
usará para conversiones native-to-display; la propuesta mantiene
explícitamente la interfaz `FxRateProvider` sin tocar para que
un proveedor futuro (Frankfurter para pares EUR, etc.) salga como
un cambio propio sin re-litigar este.

Las invariantes cross-module vienen de `accounts` (cada
`FinancialAccount` es dueña de exactamente un `User`
autenticado, FK con `onDelete: Cascade`); el design nunca
redefine reglas de ownership. La dirección de dependencia es
`fx → accounts` (el módulo nuevo importa `FxRateProvider` y el
enum `AccountFxCasa` desde `accounts`); nunca importa desde
`accounts/application/` ni `accounts/infrastructure/` — sólo el
puerto y los tipos públicos. Esto preserva la invariante de
ports & adapters.

---

## 2. Estructura de módulos — `src/modules/fx/` (nuevo)

El módulo `fx` sigue el layout de architecture-standards (domain
/ infrastructure / ports) y está colocado junto a `accounts` bajo
`src/modules/`. **NO extiende `src/modules/accounts/`** — el
puerto es consumer-facing y queda en `accounts`, pero la
implementación es su propio módulo para que los consumers
futuros (`transactions`, `reports`) puedan importar el mismo
paquete y el módulo `accounts` no absorba código de API de
terceros.

### 2.1 Por qué un módulo nuevo, no `accounts/infrastructure/external/`

La propuesta §"Alternatives considered" item 6 consideró
explícitamente extender `accounts`. La propuesta lo rechazó y
también este design, por tres razones:

1. **Consumers futuros** (`transactions`, `reports`,
   `snapshots`) importarán la superficie FX. Poner la
   implementación en `accounts/infrastructure/external/` hace
   que esos consumers importen transitivamente `accounts`, lo
   cual viola la regla de módulos aislados (root `AGENTS.md`
   §10.5). Un módulo `fx` nuevo les da un import path limpio:
   `import { FxRateProvider } from '@/modules/accounts'` para
   el puerto y `import { FxRateProviderDolarApi } from
'@/modules/fx'` para la impl.
2. **`openspec/specs/fx/` ya existe** en el layout canónico
   (según `openspec/AGENTS.md`); el código vive en la
   ubicación matching `src/modules/fx/`.
3. **Capability boundary**: la capability `accounts` es dueña
   del puerto y del endpoint de display read-only; la
   capability `fx` es dueña de la integración upstream y de la
   caché. Dos capabilities, dos módulos, dos archivos
   `openspec/specs/*/spec.md`. El cambio `fx-cache` es la
   primera vez que `fx` envía algo.

### 2.2 File tree

```
src/modules/fx/
├── domain/
│   ├── entities/
│   │   ├── fx-quote.ts                 # value object FxQuote + Zod schema.
│   │   │                               # Fields: casa, buy, sell, fxAsOf.
│   │   │                               # Invariantes: buy > 0, sell > 0, fxAsOf es ISO.
│   │   └── fx-quote.test.ts            # tests unitarios: factory + Zod parse.
│   └── ports/
│       ├── dolar-api.port.ts           # port: getDolares(casa) → FxQuote.
│       │                               # El cliente DolarAPI implementa esto.
│       └── fx-rate-cache.port.ts       # port: get(casa), set(casa, entry, ttlSec).
│                                       # El adapter Upstash implementa esto.
│                                       # Cuando las env vars faltan, el adapter
│                                       # es no-op (devuelve null en get; no-op
│                                       # en set), matchea src/shared/rate-limit/
│                                       # rate-limit.ts.
├── infrastructure/
│   ├── external/
│   │   ├── dolar-api.client.ts         # global fetch (Node 20 nativo) →
│   │   │                               # `GET ${baseUrl}/dolares/<casa>`.
│   │   │                               # Mapea { moneda, casa, nombre,
│   │   │                               # compra, venta, fechaActualizacion }
│   │   │                               # de DolarAPI → FxQuote vía Zod.
│   │   │                               # Non-2xx → AppError(FX_UNAVAILABLE).
│   │   │                               # Timeout: 3000 ms.
│   │   ├── dolar-api.client.test.ts    # tests unitarios con un fetch fake:
│   │   │                               # 200 → FxQuote; 500 → FX_UNAVAILABLE;
│   │   │                               # payload malformado → FX_UNAVAILABLE;
│   │   │                               # override DOLAR_API_BASE_URL;
│   │   │                               # normalización de casa.
│   │   └── fx-rate-provider.dolar-api.ts  # impl FxRateProvider. Cablea:
│   │                                     # cache.get → en miss, coalesce
│   │                                     # con stampede-lock → dolarApi.get
│   │                                     # → cache.set → return. En stale hit:
│   │                                     # return + fire-and-forget refresh.
│   ├── cache/
│   │   ├── upstash-fx-rate.cache.ts    # adapter Upstash que implementa
│   │   │                               # FxRateCachePort. Gateado por env var:
│   │   │                               # UPSTASH_REDIS_REST_URL o TOKEN
│   │   │                               # faltante → no-op.
│   │   │                               # Key prefix: 'gastos-personales:fx:v1'.
│   │   └── upstash-fx-rate.cache.test.ts  # tests unitarios con un cliente
│   │                                     # Upstash fake: get devuelve entry
│   │                                     # parseada; set escribe JSON + EX;
│   │                                     # env faltante → get devuelve null
│   │                                     # + set es no-op.
│   └── stampede/
│       ├── stampede-lock.ts            # ~5-line per-process
│       │                               # Map<casa, Promise<void>> + withLock(
│       │                               # casa, fn) wrapper.
│       └── stampede-lock.test.ts       # tests unitarios: N callers
│                                     # concurrentes invocan fn exactamente una vez.
└── index.ts                            # superficie pública: exports la
                                       # clase FxRateProviderDolarApi, la
                                       # factory de impl FxRateProvider, y
                                       # el Zod schema de string de casa.
                                       # Otros módulos importan desde acá.
```

### 2.3 Dirección de dependencia cross-module

```
            src/modules/fx/  (nuevo)
            ├─ domain/ports/fx-rate-cache.port.ts ─┐
            ├─ infrastructure/external/dolar-api.client.ts
            │       (implementa domain/ports/dolar-api.port.ts)
            ├─ infrastructure/cache/upstash-fx-rate.cache.ts
            │       (implementa domain/ports/fx-rate-cache.port.ts)
            └─ infrastructure/external/fx-rate-provider.dolar-api.ts
                    implementa ─→ FxRateProvider (port en src/modules/accounts/)
                                  FxRateCachePort (port en este módulo)
                                  usa stampede-lock + cache + dolarApi

src/modules/accounts/                       src/shared/
├── domain/interfaces/fx-rate-provider.port.ts  ←── fx importa esto
├── domain/interfaces/account-fx-casa.ts  ←── fx importa enum AccountFxCasa
├── application/actions/get-account-balance.action.ts
│       (resuelve account.casa ?? env.FX_DEFAULT_CASA)
└─ infrastructure/external/fx-rate-provider.dolar-api.ts (DELETE stub)
```

- `fx` importa `FxRateProvider` desde `@/modules/accounts` (la
  interfaz del puerto) y el enum `AccountFxCasa` desde
  `@/modules/accounts`.
- `fx` nunca importa desde `@/modules/accounts/application` ni
  `@/modules/accounts/infrastructure`. El puerto es la única
  costura.
- `accounts` importa `FxRateProviderDolarApi` desde
  `@/modules/fx` en el wiring de DI (una línea en
  `src/modules/api/app.ts`).
- `accounts` no importa ningún otro interno del módulo `fx`.

---

## 3. Modelo de datos

El cambio es aditivo en `prisma/schema.prisma`. Un enum nuevo,
una columna nullable nueva. Sin backfill, sin default, sin
operación destructiva sobre filas existentes.

### 3.1 Enum nuevo: `AccountFxCasa`

```prisma
// prisma/schema.prisma (append después del enum AccountCurrency existente)

enum AccountFxCasa {
  OFICIAL
  BLUE
  MEP
  CCL
  CRIPTO
  TARJETA
}
```

Los valores matchean los nombres de casa de DolarAPI (uppercase
según la convención de enums de Prisma). El formato wire de
DolarAPI usa lowercase (`/dolares/oficial`); la normalización
ocurre en la frontera del cliente DolarAPI vía un Zod schema
(`fx-casa-string.schema.ts` en `fx/domain/entities/`) que
acepta ambas formas y emite lowercase.

### 3.2 Columna nueva: `casa` en `FinancialAccount`

```prisma
// prisma/schema.prisma (extender FinancialAccount, aditivo)

model FinancialAccount {
  // ... fields existentes de accounts-ledger (sin cambios) ...
  casa  AccountFxCasa?  // nullable; NULL = hereda el default global (env.FX_DEFAULT_CASA)
}
```

La columna se agrega como `NULL` sin default. Las filas
existentes pasan de "sin columna" a `casa IS NULL` después de
que corre la migración. La smoke UI para esas filas renderiza
el default global heredado (`oficial`) hasta que el usuario
elija explícitamente una casa distinta en el create form.
**Sin pérdida de datos.**

### 3.3 Migración

```sql
-- no-destructiva; sin default; sin backfill
-- generada por `pnpm prisma migrate dev --name add_account_fx_casa`
ALTER TABLE "FinancialAccount"
  ADD COLUMN "casa" "AccountFxCasa" NULL;
```

La migración corre una vez en PR #2 (el PR de `casa` por
cuenta). PR #1 (módulo `fx` + swap de DI) no toca el schema;
PR #3 (swap de DI + chip del smoke widget + ADR + spec)
tampoco. La migración es el único cambio de schema persistente
en el change.

### 3.4 Cross-link

El spec de la capability `accounts` gana un delta en el
sibling `openspec/changes/fx-cache/specs/accounts/spec.md`:

- `BR-ACC-12` carga una edición cross-link: "el
  `FxRateProvider` es un puerto declarado en
  `src/modules/accounts/`; la implementación sale en la
  capability `fx`".
- Requirement nuevo: `FinancialAccount.casa` es un enum
  nullable `AccountFxCasa` (REQ-ACC-CASA-1).

La columna del schema es la misma columna. El split de
capability es explícito: `accounts` es dueña de la columna,
`fx` es dueña del consumer (proveedor). Los dos specs se
cross-referencian.

---

## 4. Encoding de la clave de caché (DG-FX-KEY)

**Elección**: `gastos-personales:fx:v1:<casa>`.

Formato: `<app-namespace>:<feature>:<version>:<entity-id>`.

Rationale:

- **App namespace** (`gastos-personales`) matchea la
  convención `gastos-personales:ratelimit` del módulo de rate
  limit. Un `grep` futuro sobre `redis-cli KEYS` devuelve
  todas las keys que la app posee; ninguna key colisiona con
  otro tenant si Redis alguna vez se comparte (no lo hace hoy;
  'assurance barata).
- **Feature namespace** (`fx`) lo mantiene distinto de
  `ratelimit`, future `snapshots`, etc.
- **Version** (`v1`) es un prefijo forward-only de cache
  busting. Si la shape de la respuesta de DolarAPI cambia de
  manera breaking, bumpear `v1` a `v2` invalida cada key
  vieja sin un `FLUSHDB`. No existe código hoy que lea `v2`;
  es una affordance forward-only.
- **Entity** (`<casa>`) es uno de los seis valores de
  `AccountFxCasa`, lowercase (matcheando el formato wire de
  DolarAPI): `oficial`, `blue`, `mep`, `ccl`, `cripto`,
  `tarjeta`.

Ejemplos completos de keys:

- `gastos-personales:fx:v1:oficial`
- `gastos-personales:fx:v1:blue`
- `gastos-personales:fx:v1:mep`

Alternativas rechazadas:

- **`gastos-personales:fx:ars-usd:<casa>`** (wording original
  de la propuesta, BR-FX-4) — encodea el par dentro de la
  key. Elegimos el `<casa>` más simple porque (a) v1 sólo
  soporta ARS↔USD, entonces encodear el par es redundante;
  (b) el prefijo de versión (`v1`) permite que un futuro
  cambio `fx-eu` introduzca un par distinto bajo
  `v2:<casa>` sin colisionar; (c) menos bytes por key.
- **`fx:<casa>`** sin el namespace de la app — colisiona si
  Upstash alguna vez se comparte. El prefijo de 2 segmentos
  es barato.

---

## 5. Resolución de casa

La casa se resuelve **en el call-site** de
`get-account-balance.action.ts`, nunca adentro del
`FxRateProvider`. El proveedor recibe una casa completamente
resuelta en cada llamada (REQ-FX-3).

### 5.1 La resolución en el call-site

```typescript
// src/modules/accounts/application/actions/get-account-balance.action.ts
// (reemplaza el archivo existente; la dependencia del módulo fx
// nuevo se satisface vía buildDefaultDeps, no un import directo)

const casa = account.casa ?? env.FX_DEFAULT_CASA; // env default = 'oficial'
const result = await deps.fxRateProvider.getDisplayAmount({
  native: { amount: account.openingBalanceMinor, currency: account.currency },
  displayCurrency: parsed.data.displayCurrency,
  asOf: new Date(),
  casa, // NUEVO: pasa a través al proveedor
});
```

El proveedor recibe `casa` como un field nuevo en
`FxConversionRequest` (agregado en PR #3 a la interfaz del
puerto existente — ver §16 para el cambio del puerto).

### 5.2 El Zod schema

```typescript
// src/modules/fx/domain/entities/fx-casa-string.schema.ts
import { z } from 'zod';

// Acepta la forma lowercase de DolarAPI (oficial, blue, mep, ccl, cripto, tarjeta).
// Rechaza cualquier otra cosa, incluyendo typos como 'OfiCial' o 'BLUE'.
// El Zod schema es el mismo que se usa para validar:
//   1. La env var FX_DEFAULT_CASA en el boot del proceso.
//   2. El valor del enum Prisma AccountFxCasa cuando se escribe
//      vía update-account.action.ts (vía toFinancialAccountDto).
//   3. El parámetro de query de casa en el cliente DolarAPI.
// Una sola fuente de verdad para "qué es una casa válida".
export const fxCasaStringSchema = z.enum(['oficial', 'blue', 'mep', 'ccl', 'cripto', 'tarjeta']);
export type FxCasaString = z.infer<typeof fxCasaStringSchema>;
```

El enum de Prisma usa uppercase (`OFICIAL`, `BLUE`, …) según
la convención de Prisma. El mapeo `AccountFxCasa.OFICIAL →
'oficial'` vive en la capa de DTO (`toFinancialAccountDto`) y
la normalización de la env var (`FX_DEFAULT_CASA=OfiCial →
'oficial'`) vive en el parse Zod de `env.schema.ts`. Un typo
en cualquiera de las dos fuentes se rechaza en la frontera, no
se pasa silenciosamente a DolarAPI.

---

## 6. Cliente DolarAPI

El cliente usa global `fetch` (Node 20 nativo, sin
`node-fetch`, sin `axios`). La base URL va hardcoded con
override por env var (BR-FX-8, REQ-FX-8).

### 6.1 Shape HTTP

Request:

```
GET ${baseUrl}/dolares/<casa>
Headers:
  Accept: application/json
  User-Agent: gastos-personales/0.1.0 (https://github.com/Sebailla/gastos-personales)
  (sin headers de auth; DolarAPI no usa key)
```

Response (200):

```json
{
  "moneda": "USD",
  "casa": "oficial",
  "nombre": "Oficial",
  "compra": 1180.0,
  "venta": 1220.0,
  "fechaActualizacion": "2026-06-21T18:00:00.000Z"
}
```

El cliente mapea a `FxQuote`:

```typescript
// El Zod schema rechaza cualquier shape que no matchee.
const dolarApiResponseSchema = z.object({
  moneda: z.string(),
  casa: fxCasaStringSchema,
  nombre: z.string(),
  compra: z.number().positive(),
  venta: z.number().positive(),
  fechaActualizacion: z.string().datetime(),
});

// Mapeo al value object interno FxQuote.
const fxQuote: FxQuote = {
  casa: parsed.casa,
  buy: parsed.compra,
  sell: parsed.venta,
  fxAsOf: parsed.fechaActualizacion,
};
```

### 6.2 Non-2xx y payload malformado

- Non-2xx (4xx, 5xx, error de red, timeout > 3000 ms) →
  `throw new AppError({ code: FX_UNAVAILABLE, message: ... })`.
- 200 con payload malformado (falla el parse Zod) →
  `throw new AppError({ code: FX_UNAVAILABLE, message: ... })`.
  La shape es chica (~6 fields); la falla de parse es ruidosa,
  no silenciosa.

### 6.3 Timeout

`AbortController` con timeout de 3000 ms. Pasados los 3 s, el
cliente lanza `AppError(FX_UNAVAILABLE)`. El timeout no es
configurable en v1; un cambio futuro puede promoverlo a env
var si el timeout resulta equivocado en producción.

### 6.4 Resolución de env var

```typescript
const baseUrl = process.env.DOLAR_API_BASE_URL ?? 'https://dolarapi.com/v1';
```

Los tests setean `process.env.DOLAR_API_BASE_URL =
'http://localhost:9999'` y apuntan un server fake ahí (el
test de integración de API en §13.2).

---

## 7. Capa de caché Upstash (REQ-FX-4, REQ-FX-5)

El adapter de caché matchea el patrón de
`src/shared/rate-limit/rate-limit.ts`: gateado por env var,
no-op cuando las env vars faltan, sin crash en boot.

### 7.1 Shape del adapter

```typescript
// src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.ts
import { Redis } from '@upstash/redis';
import type { FxRateCachePort, FxRateCacheEntry } from '../../domain/ports/fx-rate-cache.port';

const KEY_PREFIX = 'gastos-personales:fx:v1';
const TTL_SECONDS = 3600; // 1 h según REQ-FX-1

export class UpstashFxRateCache implements FxRateCachePort {
  private readonly redis: Redis | null;

  constructor(env: { url?: string; token?: string } = process.env) {
    const url = env.url ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = env.token ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    this.redis = url && token ? new Redis({ url, token }) : null;
  }

  async get(casa: FxCasaString): Promise<FxRateCacheEntry | null> {
    if (!this.redis) return null; // modo no-op (REQ-FX-5)
    const raw = await this.redis.get<FxRateCacheEntry>(`${KEY_PREFIX}:${casa}`);
    if (!raw) return null;
    return raw;
  }

  async set(casa: FxCasaString, entry: FxRateCacheEntry): Promise<void> {
    if (!this.redis) return; // modo no-op
    await this.redis.set(`${KEY_PREFIX}:${casa}`, entry, { ex: TTL_SECONDS });
  }

  // Test seam: resetea el cliente Redis cacheado. El código de
  // producción nunca llama esto.
  _resetForTests(): void {
    this.redis = null; // o una init fresca si el test setea env vars
  }
}
```

### 7.2 Regla de frescura de caché

La entry de caché carga `cachedAt` (string ISO). El
`FxRateProviderDolarApi` computa `stale` como
`Date.now() - new Date(entry.cachedAt).getTime() > 1000 * 60 * 60`
(> 1 h desde el write de la caché). El `EX 3600` de Upstash es
el TTL autoritativo (Redis evicta la key después de 1 h); el
check de `cachedAt` es para la semántica in-process de "¿está
todavía fresca antes de la eviction de Redis?".

### 7.3 Flujo de lectura

```
FxRateProviderDolarApi.getDisplayAmount(request)
  ├─ cached = await cache.get(request.casa)
  ├─ si cached Y cached.cachedAt < now - 1h:
  │     stale read: devuelve cached.quote con stale=true,
  │     dispara refreshIfStale(request.casa) fire-and-forget
  │     (NO bloquea al caller; REQ-FX-1)
  ├─ si cached Y cached.cachedAt >= now - 1h:
  │     hit fresco: devuelve cached.quote con stale=false
  └─ cache miss:
        withLock(request.casa, () => dolarApi.get(request.casa))
          .then(quote => cache.set(request.casa, { ...quote, cachedAt: now }))
        devuelve quote con stale=false
```

### 7.4 Flujo de fallback stale

Cuando `getCachedRate` devuelve un valor stale, el proveedor
devuelve el quote cacheado inmediatamente con `stale: true`.
Un `refreshIfStale` **fire-and-forget** se agenda: re-fetchea
de DolarAPI y sobreescribe la caché. El request del caller NO
bloquea en el refresh (REQ-FX-1). La próxima llamada observa
el mismo valor stale hasta que el refresh tenga éxito
(REQ-FX-1 Scenario "Background refresh failure does not
surface"). Una falla del refresh se captura como Sentry
warning, no error (ver §10).

### 7.5 DolarAPI caído en miss

El path de cache-miss
`withLock(request.casa, () => dolarApi.get(...))` rechaza →
`AppError(FX_UNAVAILABLE)` (503). El caller surface el error
inline según BR-ACC-18. Esto preserva el contrato: si nunca
vimos una tasa, no podemos servir una.

---

## 8. Lock anti-estampida (REQ-FX-7)

Un `Map<casa, Promise<void>>` in-memory por proceso coalesce
fetches concurrentes de cold-start para la misma casa.

### 8.1 Implementación

```typescript
// src/modules/fx/infrastructure/stampede/stampede-lock.ts

const inflight = new Map<FxCasaString, Promise<unknown>>();

export async function withLock<T>(casa: FxCasaString, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(casa);
  if (existing) return existing as Promise<T>;

  const next = fn().finally(() => inflight.delete(casa));
  inflight.set(casa, next);
  return next;
}
```

~5 líneas. Sin nuevas dependencias.

### 8.2 Lifecycle

- Creado una vez al load del módulo (un `Map` a nivel de
  módulo).
- Las entries se insertan en el primer cache miss para una
  casa dada.
- Las entries se borran en resolve (`finally`).
- El próximo miss para la misma casa re-fetchea (sin guard de
  entry stale).
- Sin TTL; el lock es sólo in-memory.

### 8.3 Alcance

- **Per-process.** Un deployment multi-instancia paga N×
  llamadas upstream en una caché fría. Aceptable para v1
  (N es 1-2 instancias en Fly.io); un futuro lock en Redis
  podría apretar esto.
- **Per-casa.** Casas distintas no se bloquean entre sí
  (REQ-FX-7 Scenario "Concurrent cache-miss calls for
  different casas are independent").

### 8.4 Test seam

El map `inflight` es a nivel de módulo; los tests pueden
llamar `_resetInflightForTests()` para limpiarlo entre casos.
El código de producción nunca llama esto.

---

## 9. Política de retry en 5xx de DolarAPI (DG-FX-RETRY)

El spec dejó la política de retry para design. **Decisión: sin
retry en v1.**

Rationale:

- La caché + TTL 1 h significa que un único fetch exitoso
  sirve ~3600 requests. Retries en el call-site multiplican el
  costo upstream para beneficio marginal (un único 5xx va
  seguido de un refresh en el próximo request de todos modos).
- Retries durante una estampida de cold-start amplifican la
  estampida (cada retry es una llamada upstream nueva).
- El camino de fallback stale maneja el caso común (la caché
  tiene un valor de un fetch previo exitoso). Los retries sólo
  son relevantes en una caché fría verdadera + 5xx, lo cual
  es raro.
- Un cambio futuro puede agregar un único retry con backoff
  de 500 ms si los datos de producción muestran que caché
  fría + 5xx transitorio es un problema medible. Queda tracked
  como follow-up.

Modos de falla manejados:

| Caso                                 | Comportamiento                                                             |
| ------------------------------------ | -------------------------------------------------------------------------- |
| DolarAPI 5xx en cache miss           | `AppError(FX_UNAVAILABLE)` 503 (REQ-FX-2). Sin retry.                      |
| DolarAPI 5xx en stale refresh        | Capturado como Sentry warning; la caché queda stale (REQ-FX-1). Sin retry. |
| DolarAPI timeout (3000 ms)           | `AppError(FX_UNAVAILABLE)` 503. Sin retry.                                 |
| DolarAPI 4xx (casa malformada, etc.) | `AppError(FX_UNAVAILABLE)` 503. Sin retry.                                 |

---

## 10. Semántica de errores (tabla de errores REQ-FX)

| Code               | HTTP | Trigger                                                                                                                       | Superficie del caller                                                                    |
| ------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `FX_UNAVAILABLE`   | 503  | Cache miss + DolarAPI inalcanzable, non-2xx, payload malformado, o falla el parse Zod.                                        | Error inline: `"FX rate provider unavailable. Try again in a few minutes."` (BR-ACC-18). |
| `FX_NOT_SUPPORTED` | 409  | El proveedor no soporta el par pedido. Heredado de `accounts`; nunca lo triggerea DolarAPI (los seis pares están soportados). | Error inline: `"FX conversion not supported for this pair."` (BR-ACC-18).                |
| `FX_STALE`         | 200  | Cache hit pasado el TTL. El body del DTO carga `stale: true` Y `warnings: ["FX rate is stale; showing last known value."]`.   | Chip amber (`text-amber-600`) + `"Last updated: <ISO>"` texto plano.                     |

`FX_STALE` **no** es un código HTTP nuevo; es un 200 con
payload de warning. El sistema tiene exactamente tres estados:
hit-fresco, hit-stale, miss-sin-upstream (throw). No hay un
cuarto estado. Sin tasa sintética, sin `null` rate, sin 204 en
miss. El mapeo de `FX_UNAVAILABLE` es dueño del `errorHandler`
central en `accounts`; la capability `fx` lanza
`AppError(FX_UNAVAILABLE)` y nunca construye la respuesta HTTP
por sí misma.

---

## 11. Observabilidad (contrato de observabilidad REQ-FX)

El módulo `fx` emite eventos de log estructurados por cada
llamada al proveedor y por cada operación de caché. Los field
names matchean la tabla de observabilidad del spec; el
transporte es el logger existente del proyecto
(`@/shared/logger/logger`).

### 11.1 Eventos de log

| Event                  | Cuándo                                  | Fields                                                                           |
| ---------------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| `fx.cache.hit`         | Cache hit (fresco o stale)              | `casa`, `stale: boolean`, `fxAsOf`                                               |
| `fx.cache.miss`        | Cache miss + fetch DolarAPI             | `casa`, `dolarApiLatencyMs`, `fxAsOf`                                            |
| `fx.cache.miss.fail`   | Cache miss + DolarAPI 5xx / falla parse | `casa`, `errorCode: 'FX_UNAVAILABLE'`, `dolarApiStatus?: number`, `errorMessage` |
| `fx.stale.refresh`     | Stale hit → background refresh          | `casa`, `dolarApiLatencyMs`, `result: 'ok' \| 'fail'`                            |
| `fx.stampede.coalesce` | Stampede lock coalesce N callers        | `casa`, `concurrentCallers: number`                                              |
| `fx.cache.noop`        | Cache init con env vars faltantes       | `reason: 'missing_env'` (logged una vez en boot, no por request)                 |

### 11.2 Los 6 hand-offs del spec — confirmados respondidos

La sección "Observability" del spec listó 6 hand-offs como
deferidos a design. Cada uno queda respondido:

| Hand-off                                   | Respondido en                                                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `fx.cache.hit` / `fx.cache.miss` (boolean) | §11.1 primeras dos filas (`stale: boolean` está implícito en hit; cache miss implica `stale: false` ya que el valor fresco está por escribirse) |
| `fx.dolarapi.duration_ms` (number)         | §11.1 field `dolarApiLatencyMs` en los eventos `fx.cache.miss` y `fx.stale.refresh`                                                             |
| `fx.dolarapi.status` (200/4xx/5xx)         | §11.1 field `dolarApiStatus?: number` en el evento `fx.cache.miss.fail` (200 no se loguea; 4xx/5xx sí)                                          |
| `fx.stale` (boolean)                       | §11.1 field `stale: boolean` en el evento `fx.cache.hit`                                                                                        |
| `fx.casa` (string)                         | §11.1 field `casa` en cada evento                                                                                                               |
| Reglas de captura de Sentry                | §11.3 abajo                                                                                                                                     |

### 11.3 Reglas de captura de Sentry

- `FX_UNAVAILABLE` en cache miss: capturar como `error` (no
  hay tasa upstream para servir, es una falla real).
- `FX_UNAVAILABLE` en stale refresh: capturar como `warning`
  (degraded pero no roto; el camino stale está haciendo su
  trabajo).
- Capa de caché no-op (env vars faltantes): NO capturar (éste
  es el contrato local-dev / CI).
- Todos los errores de Upstash: capturar como `error` con la
  operación (`get` / `set`) y la casa. Nunca loguear los
  valores de las env vars.

---

## 12. Eventos cross-module (DG-FX-EVENTS)

El spec listó eventos de observabilidad pero no señaló eventos
cross-module. **Decisión: sin eventos nuevos en v1.**

Rationale:

- La propuesta §"Out of scope" lista "Push notifications or
  background jobs of any kind" — agregar un evento
  `fx.dolarapi.outage` implicaría un listener que hace algo, lo
  cual está fuera de alcance.
- El lock anti-estampida es per-process y de vida corta (un
  fetch); ningún evento le sirve a un consumer downstream (sin
  aggregate, sin warming de caché, sin hook de alerting).
- La capa de caché loguea sus propios misses y Sentry captura
  patrones de 5xx; una alerta de Sentry sobre la tasa de
  `fx.cache.miss.fail` > N por hora es la señal de outage
  equivalente sin un evento nuevo.

Follow-up flaggeado:

- Si la futura capability `snapshots` necesita un evento
  `fx.dolarapi.outage` para backfill de snapshots, el evento
  se agrega en ese cambio. La shape de
  `event-dispatcher.ts` (unión discriminada de `DomainEvent`)
  admite una variante nueva sin romper subscribers existentes.

---

## 13. Capability boundary

La decisión de estructura de módulo es **§2.1** (nuevo
`src/modules/fx/`, no extensión de
`accounts/infrastructure/external/`). La flecha de dependencia
es `fx → accounts` al puerto; nunca al revés. Esta sección
resume las reglas de dependencia en un solo lugar.

### 13.1 Qué importa `fx` desde `accounts`

- La interfaz del puerto `FxRateProvider` desde
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`.
- El enum Prisma `AccountFxCasa` (re-exportado desde
  `src/modules/accounts/domain/entities/financial-account.ts`)
  para el tipo de la columna Prisma `account.casa`.

### 13.2 Qué NO importa `fx` desde `accounts`

- Ningún archivo bajo `src/modules/accounts/application/`.
- Ningún archivo bajo `src/modules/accounts/infrastructure/`
  (excepto el `fx-rate-provider.unconfigured.ts` borrado, que
  es el archivo que se está reemplazando).
- Ningún archivo bajo `src/modules/api/`.

### 13.3 Qué importa `accounts` desde `fx`

Exactamente una línea: el wiring de DI en
`src/modules/api/app.ts:316`:

```typescript
// Antes (actual):
const fxProvider: FxRateProvider = new FxRateProviderUnconfigured();

// Después (PR #3):
import { FxRateProviderDolarApi } from '@/modules/fx';
import { UpstashFxRateCache } from '@/modules/fx/infrastructure/cache/upstash-fx-rate.cache';
import { withLock as withStampedeLock } from '@/modules/fx/infrastructure/stampede/stampede-lock';
const fxProvider: FxRateProvider = new FxRateProviderDolarApi({
  cache: new UpstashFxRateCache(),
  lock: withStampedeLock,
  env: process.env,
});
```

La capa de actions (`get-account-balance.action.ts`) NO
importa desde `fx` — consume el puerto a través de la
inyección existente `deps.fxRateProvider`.

---

## 14. Swap de DI

El único punto de swap es `src/modules/api/app.ts:316` (la
función `buildDefaultDeps`, línea que construye
`fxProvider: FxRateProvider = new FxRateProviderUnconfigured()`).
La línea nueva construye una instancia de
`FxRateProviderDolarApi` con el cache adapter, el stampede
lock, y el env.

### 14.1 La edición de una línea

```typescript
// src/modules/api/app.ts:316 — edición de PR #3
// Antes:
const fxProvider: FxRateProvider = new FxRateProviderUnconfigured();
// Después:
const fxProvider: FxRateProvider = new FxRateProviderDolarApi({
  cache: new UpstashFxRateCache(),
  lock: withStampedeLock,
  env: process.env,
});
```

El archivo `FxRateProviderUnconfigured` se borra en el mismo
PR (`git rm src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts`).
El compilador de TypeScript falla el build si el import de la
línea 59 de `app.ts` queda colgando; el reviewer confirma que
la borrada viene acompañada de la remoción del import.

### 14.2 El cambio en el puerto `FxRateProvider`

La interfaz del puerto existente en
`src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`
gana un field en `FxConversionRequest`:

```typescript
// Cambio aditivo en PR #3
export interface FxConversionRequest {
  readonly native: {
    readonly amount: number;
    readonly currency: AccountCurrency;
  };
  readonly displayCurrency: AccountCurrency;
  readonly asOf: Date;
  readonly casa: AccountFxCasa; // NUEVO — completamente resuelto por el caller
}
```

Éste es el único cambio del puerto. El field nuevo es
`required`, no opcional, para enforcing la invariante de
REQ-FX-3 "el proveedor DEBE recibir una casa completamente
resuelta en cada llamada" a nivel de tipos. El call-site en
`get-account-balance.action.ts` resuelve
`account.casa ?? env.FX_DEFAULT_CASA` y la pasa.

### 14.3 Test seam

La factory `buildDefaultDeps` es testeable vía
`createHonoApp(deps)` que ya acepta inyección de
`fxRateProvider`. Los tests existentes en
`src/modules/api/app.accounts.test.ts` siguen funcionando con
su proveedor fake.

---

## 15. Cambio de UI

El delta de UI es **aditivo sobre las páginas smoke
existentes**. Tres ediciones chicas; sin páginas nuevas.

### 15.1 Chip stale en `app/accounts/[id]/balance-widget.tsx`

El widget ya renderiza el resultado de conversión en un div
de Tailwind (`app/accounts/[id]/balance-widget.tsx:142-157`).
El chip se agrega dentro de ese div cuando
`body.data.stale === true`.

```tsx
// app/accounts/[id]/balance-widget.tsx — adición (PR #3, ~15 líneas)
{
  result ? (
    <div className="mt-3 rounded border border-gray-200 bg-gray-50 px-3 py-2">
      {stale ? (
        <p
          role="status"
          aria-live="polite"
          className="mb-2 inline-block rounded bg-amber-100 px-2 py-1 text-sm text-amber-700"
        >
          Cotización desactualizada (hace {staleMinutes} min)
        </p>
      ) : null}
      <p>
        Display: <span className="font-mono">{formatMinor(result.amount, result.currency)}</span>{' '}
        <span className="text-sm text-gray-600">@ {result.fxRate.toFixed(4)}</span>
      </p>
      <p className="text-sm text-gray-600">Last updated: {result.fxAsOf}</p>
    </div>
  ) : null;
}
```

Los valores de `stale` y `staleMinutes` vienen del body de la
respuesta (`body.data.stale` y el delta entre
`body.data.fxAsOf` y `now()`). El texto de `fxAsOf` de
BR-ACC-18 queda sin cambios (sin styling de warning); el chip
es la señal nueva.

### 15.2 `<select>` de casa en `create-account-form.tsx`

El create form gana un `<select name="casa">` nuevo después
del `<select name="currency">` existente. El set de opciones
son los seis valores de `AccountFxCasa` más una opción
"Default (oficial)" que mapea a `null` en el state del form y
a `nullable` en el Zod `fxCasaStringSchema` del body del
request.

```tsx
// app/accounts/new/create-account-form.tsx — adición (PR #2, ~25 líneas)
const CASAS = ['OFICIAL', 'BLUE', 'MEP', 'CCL', 'CRIPTO', 'TARJETA'] as const;
type Casa = (typeof CASAS)[number] | null;

const [casa, setCasa] = useState<Casa>(null); // null = hereda el default global

// En el JSX del form:
<label className="block">
  <span className="block text-sm">FX casa (opcional)</span>
  <select
    name="casa"
    value={casa ?? ''}
    onChange={(e) => setCasa(e.target.value === '' ? null : (e.target.value as Casa))}
    className="border border-gray-300 rounded px-2 py-1"
  >
    <option value="">Default (oficial)</option>
    {CASAS.map((c) => (
      <option key={c} value={c}>
        {c}
      </option>
    ))}
  </select>
</label>;
```

El `onSubmit` del form incluye `casa` en el body JSON (u omite
el field cuando es `null`). El Zod `account-create.schema.ts`
del lado del server agrega un field nullable
`casa: z.enum(CASAS).nullable().optional()`; tanto `undefined`
como `null` mapean a `column = NULL`.

### 15.3 Edit form — fuera de alcance para v1

La propuesta §"Affected areas" lista
`app/accounts/[id]/edit-account-form.tsx` pero ese archivo no
existe hoy (sólo `create-account-form.tsx` y
`balance-widget.tsx`). Según el brief: **el edit form está
fuera de alcance para v1**. Los usuarios de cuentas existentes
eligen `casa` vía el create form para cuentas nuevas; las
filas existentes mantienen `casa = NULL` y heredan el default
global. El edit form es un follow-up en `ui-accounts`.

### 15.4 Rendering de `fxAsOf`

El widget sigue renderizando `display.fxAsOf` como texto plano
`"Last updated: <ISO date>"` (BR-ACC-18 Decision 3). Sin cambios.

---

## 16. Fuera de alcance (heredado de propuesta + spec)

- EUR/ARS, USD/EUR, BRL/ARS — DolarAPI no los quota; el
  puerto `FxRateProvider` no se extiende.
- Multi-currency per-transaction FX.
- Historia de cambios de `casa` por cuenta (audit log).
- Un auto-picker `MOST_RECENT`.
- Un Cron warmup agendado de la caché.
- Multi-source FX (DolarAPI + Frankfurter + una tercera fuente).
- Surfacing de `warnings` en la smoke widget UI más allá del
  chip `stale: boolean`.
- Migrar el cliente Upstash del módulo de rate limit a una
  factory `UpstashClient` compartida.
- Cambios de UI de producción más allá del chip de warning y
  el `<select>` de casa en el create form.
- Edit form para casa (ver §15.3 — fuera de alcance para v1).
- Push notifications o background jobs de cualquier tipo.
- Un evento cross-module `fx.dolarapi.outage` (ver §12).

---

## 17. Criterios de aceptación (mapeados 1:1 a REQ-FX-1 a REQ-FX-9)

| REQ del spec                               | Criterio de aceptación del design                                                                                                                                                                                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-FX-1 (TTL + fallback stale)            | Test unitario Vitest: cache hit dentro del TTL devuelve `stale: false`; cache hit pasado el TTL devuelve `stale: true` y dispara background refresh; la falla del background refresh es silenciosa (sin `AppError`). Test de integración Vitest: `UpstashFxRateCache` escribe `EX 3600` en cada set.                    |
| REQ-FX-2 (DolarAPI miss throws)            | Test unitario Vitest: con caché vacía + DolarAPI forzado a 500, `getDisplayAmount` lanza `AppError(FX_UNAVAILABLE)`. Test unitario Vitest: con caché vacía + payload malformado de DolarAPI, `getDisplayAmount` lanza `AppError(FX_UNAVAILABLE)`.                                                                       |
| REQ-FX-3 (resolución de casa en el caller) | Test unitario Vitest: `get-account-balance.action.ts` resuelve `account.casa ?? env.FX_DEFAULT_CASA`. Tres sub-scenarios: NULL → 'oficial'; 'BLUE' explícito → 'blue'; env var override a NULL. El test unitario del proveedor confirma que nunca lee env ni queryea la DB.                                             |
| REQ-FX-4 (clave de caché)                  | Test unitario Vitest: el primer `cache.set('oficial', entry)` escribe la key `gastos-personales:fx:v1:oficial`. Dos `cache.set('blue')` y `cache.set('mep')` concurrentes producen dos keys distintas.                                                                                                                  |
| REQ-FX-5 (no-op sin env Upstash)           | Test unitario Vitest: con `UPSTASH_REDIS_REST_URL` unset, `cache.get` devuelve `null` y `cache.set` es no-op. Test unitario Vitest: el grafo DI de Hono bootea sin crashear cuando las env vars faltan.                                                                                                                 |
| REQ-FX-6 (`stale` boolean + warnings)      | Test unitario Vitest: `toBalanceDto` mapea `stale: true` del proveedor a `stale: true` del DTO + `warnings: ['FX rate is stale; showing last known value.']`. Test unitario Vitest: `stale: false` → `warnings: undefined`.                                                                                             |
| REQ-FX-7 (stampede lock)                   | Test unitario Vitest: 10 llamadas concurrentes de `withLock('oficial', fn)` invocan `fn` exactamente una vez. Test unitario Vitest: llamadas concurrentes para casas distintas invocan `fn` independientemente.                                                                                                         |
| REQ-FX-8 (override de base URL)            | Test unitario Vitest: con `DOLAR_API_BASE_URL` unset, el cliente apunta a `https://dolarapi.com/v1`. Test unitario Vitest: con `DOLAR_API_BASE_URL=http://localhost:9999`, el cliente apunta a `http://localhost:9999`.                                                                                                 |
| REQ-FX-9 (migración no-destructiva)        | Test de integración Vitest (testcontainers Postgres): aplicar la migración a una DB poblada; asertar que cada fila existente tiene `casa IS NULL`. Test unitario Vitest: las filas existentes renderizan el default global heredado (la resolución de casa de la action cae por `account.casa ?? env.FX_DEFAULT_CASA`). |

Los criterios de aceptación se enforcing vía `pnpm test`
(Vitest) y `pnpm exec tsc --noEmit` (TypeScript strict). El
target de coverage es ≥80% en `src/modules/fx/**` (lines,
branches, functions, statements), enforced por el job de
`test` del CI.

---

## 18. Design decisions abiertas (DGs cerradas por este design)

El spec difirió 4 decisiones a nivel de design a `sdd-design`.
Este design las cierra.

### DG-D-1 — Encoding de la clave de caché

**Decisión**: `gastos-personales:fx:v1:<casa>` (§4).

**Rationale**: el app namespace matchea la convención del
módulo de rate limit; `v1` es un prefijo forward-only de cache
busting; la casa en lowercase matchea el formato wire de
DolarAPI.

**Cerrada por**: §4.

### DG-D-2 — Política de retry en 5xx de DolarAPI

**Decisión**: sin retry en v1 (§9).

**Rationale**: la caché + TTL 1 h significa que los retries
multiplican el costo upstream para beneficio marginal; el
camino de fallback stale maneja el caso común; un cambio
futuro puede agregar un único retry con backoff si los datos
de producción muestran la necesidad.

**Cerrada por**: §9.

### DG-D-3 — Field names de observabilidad

**Decisión**: eventos de log estructurados en §11.1 con los
field names de la tabla de observabilidad del spec. Reglas de
captura de Sentry en §11.3.

**Rationale**: matchea la tabla del spec 1:1; los field names
son estables para queries de Sentry; el transporte es el logger
existente del proyecto.

**Cerrada por**: §11.

### DG-D-4 — Eventos cross-module

**Decisión**: sin eventos nuevos en v1 (§12).

**Rationale**: "Push notifications or background jobs of any
kind" de la propuesta está fuera de alcance; una alerta de
Sentry sobre la tasa de `fx.cache.miss.fail` es la señal de
outage equivalente sin un evento nuevo. Una futura capability
`snapshots` puede agregar `fx.dolarapi.outage` como follow-up.

**Cerrada por**: §12.

---

## 19. Matriz de trazabilidad file-to-requirement

| REQ del spec                               | Files                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REQ-FX-1 (TTL + fallback stale)            | `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.ts` (flujo de lectura + stale refresh), `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.ts` (`TTL_SECONDS = 3600`), `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.test.ts` (scenarios de cache hit/miss/stale). |
| REQ-FX-2 (DolarAPI miss throws)            | `src/modules/fx/infrastructure/external/dolar-api.client.ts` (parse Zod + mapeo non-2xx), `src/modules/fx/infrastructure/external/dolar-api.client.test.ts` (scenarios 500 + malformado).                                                                                                                          |
| REQ-FX-3 (resolución de casa en el caller) | `src/modules/accounts/application/actions/get-account-balance.action.ts` (regla de resolución), `src/modules/fx/domain/entities/fx-casa-string.schema.ts` (normalización Zod), `src/modules/accounts/application/actions/get-account-balance.action.test.ts` (scenarios de resolución).                            |
| REQ-FX-4 (clave de caché)                  | `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.ts` (`KEY_PREFIX` + `TTL_SECONDS`), `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.test.ts` (assertion de shape de key).                                                                                                                    |
| REQ-FX-5 (no-op sin env Upstash)           | `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.ts` (constructor gateado por env var), `src/modules/api/app.ts` (wiring de DI), `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.test.ts` (scenarios sin env).                                                                                |
| REQ-FX-6 (`stale` boolean + warnings)      | `src/modules/accounts/application/dto/financial-account-balance.dto.ts` (gain del DTO), `src/modules/accounts/application/dto/financial-account-balance.dto.test.ts` (scenarios de mapeo), `app/accounts/[id]/balance-widget.tsx` (render del chip).                                                               |
| REQ-FX-7 (stampede lock)                   | `src/modules/fx/infrastructure/stampede/stampede-lock.ts` (`Map` + `withLock`), `src/modules/fx/infrastructure/stampede/stampede-lock.test.ts` (10 callers concurrentes → 1 fetch).                                                                                                                                |
| REQ-FX-8 (override de base URL)            | `src/modules/fx/infrastructure/external/dolar-api.client.ts` (resolución de `baseUrl`), `src/modules/fx/infrastructure/external/dolar-api.client.test.ts` (scenarios default + override).                                                                                                                          |
| REQ-FX-9 (migración no-destructiva)        | `prisma/schema.prisma` (enum `AccountFxCasa` + columna `casa`), `prisma/migrations/<ts>_add_account_fx_casa/migration.sql` (ALTER TABLE), `src/modules/accounts/application/actions/get-account-balance.action.ts` (fallthrough de resolución).                                                                    |

---

## 20. Riesgos y tradeoffs

| Riesgo                                                                                                       | Mitigación                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DolarAPI caído con caché fría** (sin valor stale para servir) → 503 al usuario.                            | El widget muestra el error 503 inline según BR-ACC-18; comportamiento documentado; no es regresión. Un futuro Cron warmup lo elimina por completo.                                                                                                                                                            |
| **DolarAPI nos rate-limitea** (sin SLA público; endpoint gratis).                                            | La caché 1 h + lock anti-estampida per-process cortan las llamadas upstream en ~99% en régimen. El fallback es el valor stale.                                                                                                                                                                                |
| **DolarAPI cambia su shape de respuesta** (es una API de comunidad).                                         | La validación Zod en `dolar-api.client.ts` rechaza shapes desconocidas con `FX_UNAVAILABLE`. La shape es chica (~6 fields); el riesgo está acotado.                                                                                                                                                           |
| **`oficial` no es el default correcto** para una app de personal finance.                                    | El default es overrideable por cuenta vía la columna nueva `casa` (REQ-FX-3). Los usuarios que quieren `blue` lo setean en la cuenta.                                                                                                                                                                         |
| **Períodos de alta inflación** (ARS) hacen que el TTL 1 h sea notorio.                                       | El widget renderiza el chip stale (`text-amber-600`) para que el usuario pueda juzgar la frescura. Un Cron warmup futuro podría acortar el TTL percibido.                                                                                                                                                     |
| **Duplicación del cliente Upstash** (rate-limit + caché nueva) deriva.                                       | Una factory `UpstashClient` compartida es un follow-up; los dos consumers son chicos e idénticos en forma hoy.                                                                                                                                                                                                |
| **Cambio en el puerto `FxRateProvider`** (`casa` queda required en `FxConversionRequest`).                   | El cambio es aditivo (field nuevo, nunca removido); el único caller es la capa de actions; la action se actualiza en el mismo PR.                                                                                                                                                                             |
| **La migración de `casa` por cuenta corre contra una DB poblada existente**.                                 | La migración es `ADD COLUMN casa AccountFxCasa NULL` — no-destructiva; sin backfill, sin default. La smoke UI debe mostrar el default global heredado hasta que el usuario override explícito (sin auto-migración de filas existentes a `oficial`).                                                           |
| **El mapeo del enum de casa** (Prisma `OFICIAL` ↔ DolarAPI `oficial`) deriva si DolarAPI renombra una casa. | El mapeo está centralizado en `fx-casa-string.schema.ts` y unit-testeado contra cada casa. Un rename de casa requiere una edición deliberada de código + DTO + Zod.                                                                                                                                           |
| **Drift bilingüe** — el espejo en español puede quedar atrás del design en inglés.                           | El espejo se escribe en el mismo PR que la fuente en inglés. El check de pre-commit `check-lockfile.sh` de Husky no enforcing docs; el reviewer verifica ambos archivos.                                                                                                                                      |
| **`pnpm-lock.yaml` drift** — si un cambio futuro agrega una nueva dep al módulo `fx`.                        | Según root `AGENTS.md` §5.3: el lockfile es deliverable. El hook de pre-commit de Husky falla el commit si `package.json` se stagea sin un cambio correspondiente en `pnpm-lock.yaml`. El módulo `fx` reusa deps existentes (`@upstash/redis` ya en el árbol desde `auth-foundation`); sin nuevas deps en v1. |
| **El swap de DI deja una ventana** donde ni el stub ni el proveedor real están cableados.                    | PR #3 envía el swap y la borrada del stub en el mismo commit; el compilador de TypeScript falla el build si el import queda colgando.                                                                                                                                                                         |

---

## 21. Rollout (plan por PR, 3 PRs chained, `feat/fx-cache-1 (or -2, -3)` → `develop`)

| PR  | Branch            | Alcance                                                                                                                                                                                                                                                                                                                                                                      | Líneas aprox. | Gate de aceptación                                                                                                                                                                                                                                                 |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `feat/fx-cache-1` | Módulo `src/modules/fx/` nuevo: `dolar-api.client.ts` + `upstash-fx-rate.cache.ts` + `stampede-lock.ts` + `fx-rate-provider.dolar-api.ts` + `fx-quote.ts` + `fx-casa-string.schema.ts` + ports + tests. **Sin swap de DI; el stub queda cableado.**                                                                                                                          | ~600          | `pnpm test` exits 0; ≥80% coverage en `src/modules/fx/**`; el test de integración del cliente DolarAPI contra `http://localhost:9999` (sandbox) pasa.                                                                                                              |
| 2   | `feat/fx-cache-2` | `casa` por cuenta: enum `AccountFxCasa` + columna nullable + migración `add_account_fx_casa` + validación Zod en `account-create.schema.ts` + `<select>` de casa en `create-account-form.tsx` + `toFinancialAccountDto` expone `casa` + `update-account.action.ts` acepta `casa`. **DI todavía cableado al stub; el endpoint FX todavía 503.**                               | ~300          | `pnpm prisma migrate dev` succeed; `pnpm test` exits 0; la migración contra una DB poblada es no-destructiva (las filas existentes tienen `casa = NULL`).                                                                                                          |
| 3   | `feat/fx-cache-3` | Swap de DI (delete `fx-rate-provider.unconfigured.ts` + nuevo wiring en `app.ts:316`) + `get-account-balance.action.ts` cablea `account.casa ?? env.FX_DEFAULT_CASA` + chip `stale` en `balance-widget.tsx` + el DTO de balance gana `stale: boolean` + delta cross-link del spec `accounts` + spec `fx` creado + `docs/adr/0010-dolar-api-provider.md` escrito + espejo ES. | ~250          | `pnpm test` exits 0; `pnpm dev` → sign in → `/accounts/[id]` → submit widget → `display.amount` + `display.fxRate` + `"Last updated: <ISO>"` se renderizan. Con DolarAPI forzado a 500 en test: 503. Con caché pasada del TTL: chip stale + warning string en DTO. |

Total: ~1150 líneas across 3 PRs. Matchea el forecast de la
propuesta (§"Forecast"). Los PRs son chained: 1 → 2 → 3; cada
PR abre a `develop` sólo después de que el anterior esté
squash-merged.

### 21.1 Disciplina de lockfile

Ningún PR agrega una dep nueva. `@upstash/redis` ya está en
`package.json` desde `auth-foundation`. El `pnpm-lock.yaml`
queda sin cambios across los tres PRs; el check de pre-commit
de lockfile de Husky es informativo (pasa porque no hay
cambio en `package.json`).

### 21.2 Política de espejo bilingüe

PR #3 escribe el espejo en español del `design.md` y del ADR
al mismo tiempo que la fuente en inglés:
`Documents-es/openspec/changes/fx-cache/design.md` y
`Documents-es/docs/adr/0010-dolar-api-provider.md`. Ambos
archivos pasan el check de caracteres chinos
(`grep -P '[\x{4e00}-\x{9fff}]'`).

### 21.3 Disciplina de worktree

Cada PR vive en su propio git worktree:

```bash
git worktree add ../gastos-personales-fx-cache-1 -b feat/fx-cache-1 develop
cd ../gastos-personales-fx-cache-1
# ... work, commit, push
gh pr create --base develop --title "feat(fx): add fx module + DolarAPI client + cache (PR-1: domain + infra)"
# después del squash-merge a develop:
git worktree remove ../gastos-personales-fx-cache-1
```

### 21.4 Pre-merge gate

Antes de que cada PR se squash-merge a `develop`, el padre
corre una pasada de `sdd-verify`. La pasada de verify usa el
agente `sdd-verify` con contexto fresco. El reviewer audita
la evidencia TDD, el delta de test count, el coverage sobre
`src/modules/fx/**`, y el espejo bilingüe.

---

## 22. Next step

La próxima fase SDD es `sdd-tasks`: producir
`openspec/changes/fx-cache/tasks.md` con los 3 PRs chained
descompuestos en tasks atómicos (uno por commit), cada uno con
las columnas de evidencia strict TDD (RED → GREEN →
TRIANGULATE → REFACTOR). Después de `sdd-tasks`: `sdd-apply`
(PR-1, PR-2, PR-3 en secuencia). Las fases `sdd-verify`,
`sdd-sync`, y `sdd-archive` siguen a cada PR. El spec de la
capability `fx` se promueve a `openspec/specs/fx/spec.md` en el
archive.
