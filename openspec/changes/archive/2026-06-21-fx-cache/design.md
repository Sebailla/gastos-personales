# Design — `fx-cache`

**Status**: draft · **Author**: Sebastián Illa
**Created**: 2026-06-21 · **Change**: `fx-cache`
**Proposal**: `openspec/changes/fx-cache/proposal.md` (v1.1, 2026-06-21, DG-FX-1 to DG-FX-5 closed)
**Spec**: `openspec/changes/fx-cache/specs/fx/spec.md` (REQ-FX-1 to REQ-FX-9)
**Sibling delta spec**: `openspec/changes/fx-cache/specs/accounts/spec.md` (per-account `casa` column)
**Capabilities affected**: `fx` (new; canonical spec lands at `openspec/specs/fx/spec.md` on sync), `accounts` (one cross-link edit on BR-ACC-12; the `casa` column delta is in the sibling spec)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (inherited from `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4
**Preflight**: interactive · `hybrid` (Engram + OpenSpec files) · `auto-chain` · 400-line review budget
**Strict TDD**: enabled per `openspec/config.yaml`; runner `pnpm test`; cycle RED → GREEN → TRIANGULATE → REFACTOR

> This document does NOT re-debate the proposal or the spec. It
> implements the spec's "what" with the "how" — module structure,
> cache key encoding, DolarAPI client shape, stampede-lock lifecycle,
> stale-fallback flow, the casa resolution rule, the DI swap point,
> the smoke widget chip, the 4 design decisions the spec left open
> (cache key, retry policy, observability field names, cross-module
> events), and the per-PR rollout. A new contributor can read this
> and know exactly where every spec Requirement lands in the repo.

---

## 1. Summary

`fx-cache` is the third capability to ship after `auth-foundation`
and `accounts-ledger`. It fills the `FxRateProvider` port declared
in `accounts-ledger` with a real provider backed by **DolarAPI**,
adds a **1-hour Upstash Redis cache** with a graceful
**stale-fallback** path so the smoke widget never 503s on a quiet
DolarAPI outage, and ships **per-account `casa` selection** as a
nullable Prisma column on `FinancialAccount`. The change is the
seam every future consumer (`transactions`, `reports`, `snapshots`)
will use for native-to-display conversions; the proposal explicitly
keeps the `FxRateProvider` interface untouched so a future
provider (Frankfurter for EUR pairs, etc.) can ship as its own
change without re-litigating this one.

Cross-module invariants come from `accounts` (every `FinancialAccount`
is owned by exactly one authenticated `User`, FK with
`onDelete: Cascade`); the design never redefines ownership rules.
The dependency direction is `fx → accounts` (the new module imports
`FxRateProvider` and the `AccountFxCasa` enum from `accounts`); it
never imports from `accounts/application/` or
`accounts/infrastructure/` — only the port and the public types.
This preserves the ports & adapters invariant.

---

## 2. Module structure — `src/modules/fx/` (new)

The `fx` module follows the architecture-standards layout (domain /
infrastructure / ports) and is colocated with `accounts` under
`src/modules/`. **It does NOT extend `src/modules/accounts/`** —
the port is consumer-facing and stays in `accounts`, but the
implementation is its own module so future consumers
(`transactions`, `reports`) can import the same package and the
`accounts` module does not absorb third-party API code.

### 2.1 Why a new module, not `accounts/infrastructure/external/`

The proposal §"Alternatives considered" item 6 explicitly considered
extending `accounts`. The proposal rejected that and so does this
design, on three grounds:

1. **Future consumers** (`transactions`, `reports`, `snapshots`)
   will import the FX surface. Putting the implementation in
   `accounts/infrastructure/external/` makes those consumers
   transitively import `accounts`, which violates the modules
   isolated rule (root `AGENTS.md` §10.5). A new `fx` module
   gives consumers a clean import path:
   `import { FxRateProvider } from '@/modules/accounts'` for
   the port and `import { FxRateProviderDolarApi } from '@/modules/fx'`
   for the impl.
2. **`openspec/specs/fx/` already exists** in the canonical
   layout (per `openspec/AGENTS.md`); the code lives in the
   matching `src/modules/fx/` location.
3. **Capability boundary**: the `accounts` capability owns the
   port and the read-only display endpoint; the `fx` capability
   owns the upstream integration and the cache. Two capabilities,
   two modules, two `openspec/specs/*/spec.md` files. The
   `fx-cache` change is the first time `fx` ships anything.

### 2.2 File tree

```
src/modules/fx/
├── domain/
│   ├── entities/
│   │   ├── fx-quote.ts                 # FxQuote value object + Zod schema.
│   │   │                               # Fields: casa, buy, sell, fxAsOf.
│   │   │                               # Invariants: buy > 0, sell > 0, fxAsOf is ISO.
│   │   └── fx-quote.test.ts            # unit tests: factory + Zod parse.
│   └── ports/
│       ├── dolar-api.port.ts           # port: getDolares(casa) → FxQuote.
│       │                               # The DolarAPI client implements this.
│       └── fx-rate-cache.port.ts       # port: get(casa), set(casa, entry, ttlSec),
│                                       # upsert-on-miss. The Upstash adapter
│                                       # implements this. When env vars are
│                                       # missing the adapter is a no-op (returns
│                                       # null on get; no-op on set), matching
│                                       # src/shared/rate-limit/rate-limit.ts.
├── infrastructure/
│   ├── external/
│   │   ├── dolar-api.client.ts         # global fetch (Node 20 native) →
│   │   │                               # `GET ${baseUrl}/dolares/<casa>`.
│   │   │                               # Maps DolarAPI's { moneda, casa,
│   │   │                               # nombre, compra, venta, fechaActualizacion }
│   │   │                               # → FxQuote via Zod. Non-2xx → AppError(
│   │   │                               # FX_UNAVAILABLE). Timeout: 3000 ms.
│   │   ├── dolar-api.client.test.ts    # unit tests with a fake fetch:
│   │   │                               # 200 → FxQuote; 500 → FX_UNAVAILABLE;
│   │   │                               # malformed payload → FX_UNAVAILABLE;
│   │   │                               # DOLAR_API_BASE_URL override;
│   │   │                               # casa normalization (uppercase, kebab, etc.).
│   │   └── fx-rate-provider.dolar-api.ts  # FxRateProvider impl. Wires:
│   │                                     # cache.get → on miss, stampede-lock
│   │                                     # coalesce → dolarApi.get → cache.set
│   │                                     # → return. On stale hit: return
│   │                                     # + fire-and-forget refresh.
│   ├── cache/
│   │   ├── upstash-fx-rate.cache.ts    # Upstash adapter implementing
│   │   │                               # FxRateCachePort. Env-var-gated: missing
│   │   │                               # UPSTASH_REDIS_REST_URL or TOKEN → no-op.
│   │   │                               # Key prefix: 'gastos-personales:fx:v1'.
│   │   └── upstash-fx-rate.cache.test.ts  # unit tests with a fake Upstash
│   │                                     # client: get returns parsed entry;
│   │                                     # set writes JSON + EX; missing env
│   │                                     # → get returns null + set no-ops.
│   └── stampede/
│       ├── stampede-lock.ts            # ~5-line per-process
│       │                               # Map<casa, Promise<void>> + withLock(
│       │                               # casa, fn) wrapper.
│       └── stampede-lock.test.ts       # unit tests: N concurrent callers
│                                     # invoke fn exactly once.
└── index.ts                            # public surface: exports the
                                       # FxRateProviderDolarApi class,
                                       # the FxRateProvider impl factory,
                                       # and the casa string Zod schema.
                                       # Other modules import from here.
```

### 2.3 Cross-module dependency direction

```
            src/modules/fx/  (new)
            ├─ domain/ports/fx-rate-cache.port.ts ─┐
            ├─ infrastructure/external/dolar-api.client.ts
            │       (implements domain/ports/dolar-api.port.ts)
            ├─ infrastructure/cache/upstash-fx-rate.cache.ts
            │       (implements domain/ports/fx-rate-cache.port.ts)
            └─ infrastructure/external/fx-rate-provider.dolar-api.ts
                    implements ─→ FxRateProvider (port in src/modules/accounts/)
                                  FxRateCachePort (port in this module)
                                  uses stampede-lock + cache + dolarApi

src/modules/accounts/                       src/shared/
├── domain/interfaces/fx-rate-provider.port.ts  ←── fx imports this
├── domain/interfaces/account-fx-casa.ts  ←── fx imports AccountFxCasa enum
├── application/actions/get-account-balance.action.ts
│       (resolves account.casa ?? env.FX_DEFAULT_CASA)
└── infrastructure/external/fx-rate-provider.dolar-api.ts (DELETE stub)
```

- `fx` imports `FxRateProvider` from `@/modules/accounts` (the port
  interface) and `AccountFxCasa` enum from `@/modules/accounts`.
- `fx` never imports from `@/modules/accounts/application` or
  `@/modules/accounts/infrastructure`. The port is the only seam.
- `accounts` imports `FxRateProviderDolarApi` from `@/modules/fx` in
  the DI wiring (one line in `src/modules/api/app.ts`).
- `accounts` does not import any other FX module internals.

---

## 3. Data model

The change is additive on `prisma/schema.prisma`. One new enum, one
new nullable column. No backfill, no default, no destructive
operation on existing rows.

### 3.1 New enum: `AccountFxCasa`

```prisma
// prisma/schema.prisma (append after the existing AccountCurrency enum)

enum AccountFxCasa {
  OFICIAL
  BLUE
  MEP
  CCL
  CRIPTO
  TARJETA
}
```

Values match the DolarAPI casa names (uppercase per Prisma's enum
convention). The DolarAPI wire format uses lowercase
(`/dolares/oficial`); the normalization happens at the
DolarAPI-client boundary via a Zod schema
(`fx-casa-string.schema.ts` in `fx/domain/entities/`) that accepts
either form and emits lowercase.

### 3.2 New column: `casa` on `FinancialAccount`

```prisma
// prisma/schema.prisma (extend FinancialAccount, additive)

model FinancialAccount {
  // ... existing fields from accounts-ledger (unchanged) ...
  casa  AccountFxCasa?  // nullable; NULL = inherit global default (env.FX_DEFAULT_CASA)
}
```

The column is added as `NULL` with no default. Existing rows go
from "no column" to `casa IS NULL` after the migration runs. The
smoke UI for those rows renders the inherited global default
(`oficial`) until the user explicitly picks a different casa in
the create form. **No data loss.**

### 3.3 Migration

```sql
-- non-destructive; no default; no backfill
-- generated by `pnpm prisma migrate dev --name add_account_fx_casa`
ALTER TABLE "FinancialAccount"
  ADD COLUMN "casa" "AccountFxCasa" NULL;
```

The migration runs once in PR #2 (the per-account `casa` PR). PR
#1 (the `fx` module + DI swap) does not touch the schema; PR #3
(DI swap + smoke widget chip + ADR + spec) does not touch the
schema either. The migration is the only persistent schema change
in the change.

### 3.4 Cross-link

The `accounts` capability spec gains one delta in the sibling
`openspec/changes/fx-cache/specs/accounts/spec.md`:

- `BR-ACC-12` carries one cross-link edit: "the
  `FxRateProvider` is a port declared in `src/modules/accounts/`;
  the implementation ships in the `fx` capability".
- New requirement: `FinancialAccount.casa` is a nullable
  `AccountFxCasa` enum (REQ-ACC-CASA-1).

The schema column is the same column. The capability split is
explicit: `accounts` owns the column, `fx` owns the consumer
(provider). The two specs cross-reference each other.

---

## 4. Cache key encoding (DG-FX-KEY)

**Choice**: `gastos-personales:fx:v1:<casa>`.

Format: `<app-namespace>:<feature>:<version>:<entity-id>`.

Rationale:

- **App namespace** (`gastos-personales`) matches the rate-limit
  module's `gastos-personales:ratelimit` convention. A future
  grep across `redis-cli KEYS` returns every key the app owns;
  no key collides with another tenant if Redis is ever shared
  (it isn't today; cheap insurance).
- **Feature namespace** (`fx`) keeps it distinct from
  `ratelimit`, future `snapshots`, etc.
- **Version** (`v1`) is a future cache-busting prefix. If the
  DolarAPI response shape changes in a breaking way, bumping
  `v1` to `v2` invalidates every old key without a `FLUSHDB`.
  No code exists today that reads `v2`; this is a forward-only
  affordance.
- **Entity** (`<casa>`) is one of the six `AccountFxCasa`
  values, lowercase (matching the DolarAPI wire format):
  `oficial`, `blue`, `mep`, `ccl`, `cripto`, `tarjeta`.

Full key examples:

- `gastos-personales:fx:v1:oficial`
- `gastos-personales:fx:v1:blue`
- `gastos-personales:fx:v1:mep`

Rejected alternatives:

- **`gastos-personales:fx:ars-usd:<casa>`** (the original
  proposal wording, BR-FX-4) — encodes the pair into the key.
  We chose the simpler `<casa>` because (a) v1 only supports
  ARS↔USD, so encoding the pair is redundant; (b) the version
  prefix (`v1`) lets a future `fx-eu` change introduce a
  different pair under `v2:<casa>` without colliding; (c) fewer
  bytes per key.
- **`fx:<casa>`** without the app namespace — collides if
  Upstash is ever shared. The 2-segment prefix is cheap.

---

## 5. Casa resolution

Casa is resolved **at the call site** in
`get-account-balance.action.ts`, never inside the
`FxRateProvider`. The provider receives a fully-resolved casa
on every call (REQ-FX-3).

### 5.1 The call-site resolution

```typescript
// src/modules/accounts/application/actions/get-account-balance.action.ts
// (replaces the existing file; the dependency on the new fx module
// is satisfied through buildDefaultDeps, not a direct import)

const casa = account.casa ?? env.FX_DEFAULT_CASA; // env default = 'oficial'
const result = await deps.fxRateProvider.getDisplayAmount({
  native: { amount: account.openingBalanceMinor, currency: account.currency },
  displayCurrency: parsed.data.displayCurrency,
  asOf: new Date(),
  casa, // NEW: passed through to the provider
});
```

The provider receives `casa` as a new field on
`FxConversionRequest` (added in PR #3 to the existing port
interface — see §16 for the port change).

### 5.2 The Zod schema

```typescript
// src/modules/fx/domain/entities/fx-casa-string.schema.ts
import { z } from 'zod';

// Accepts lowercase DolarAPI form (oficial, blue, mep, ccl, cripto, tarjeta).
// Rejects everything else, including typos like 'OfiCial' or 'BLUE'.
// The Zod schema is the same one used to validate:
//   1. The env var FX_DEFAULT_CASA at process boot.
//   2. The Prisma AccountFxCasa enum value when written via the
//      update-account.action.ts (via toFinancialAccountDto).
//   3. The casa query parameter on DolarAPI at the client boundary.
// One source of truth for "what is a valid casa".
export const fxCasaStringSchema = z.enum([
  'oficial', 'blue', 'mep', 'ccl', 'cripto', 'tarjeta',
]);
export type FxCasaString = z.infer<typeof fxCasaStringSchema>;
```

The Prisma enum uses uppercase (`OFICIAL`, `BLUE`, …) per the
Prisma convention. The mapping
`AccountFxCasa.OFICIAL → 'oficial'` lives in the DTO layer
(`toFinancialAccountDto`) and the env-var normalization
(`FX_DEFAULT_CASA=OfiCial → 'oficial'`) lives in the
`env.schema.ts` Zod parse. A typo in either source is rejected
at the boundary, not silently passed to DolarAPI.

---

## 6. DolarAPI client

The client uses global `fetch` (Node 20 native, no `node-fetch`,
no `axios`). The base URL is hardcoded with an env-var override
(BR-FX-8, REQ-FX-8).

### 6.1 HTTP shape

Request:

```
GET ${baseUrl}/dolares/<casa>
Headers:
  Accept: application/json
  User-Agent: gastos-personales/0.1.0 (https://github.com/Sebailla/gastos-personales)
  (no auth headers; DolarAPI is key-less)
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

The client maps to `FxQuote`:

```typescript
// The Zod schema rejects any shape that doesn't match.
const dolarApiResponseSchema = z.object({
  moneda: z.string(),
  casa: fxCasaStringSchema,
  nombre: z.string(),
  compra: z.number().positive(),
  venta: z.number().positive(),
  fechaActualizacion: z.string().datetime(),
});

// Map to the internal FxQuote value object.
const fxQuote: FxQuote = {
  casa: parsed.casa,
  buy: parsed.compra,
  sell: parsed.venta,
  fxAsOf: parsed.fechaActualizacion,
};
```

### 6.2 Non-2xx and malformed payload

- Non-2xx (4xx, 5xx, network error, timeout > 3000 ms) →
  `throw new AppError({ code: FX_UNAVAILABLE, message: ... })`.
- 200 with malformed payload (Zod parse failure) →
  `throw new AppError({ code: FX_UNAVAILABLE, message: ... })`.
  The shape is small (~6 fields); the parse failure is loud,
  not silent.

### 6.3 Timeout

`AbortController` with a 3000 ms timeout. Above 3 s, the client
throws `AppError(FX_UNAVAILABLE)`. The timeout is not configurable
in v1; a future change can promote it to an env var if the
timeout proves wrong in production.

### 6.4 Env-var resolution

```typescript
const baseUrl = process.env.DOLAR_API_BASE_URL ?? 'https://dolarapi.com/v1';
```

Tests set `process.env.DOLAR_API_BASE_URL = 'http://localhost:9999'`
and point a fake server there (the API integration test in
§13.2).

---

## 7. Upstash cache layer (REQ-FX-4, REQ-FX-5)

The cache adapter matches the `src/shared/rate-limit/rate-limit.ts`
pattern: env-var-gated, no-op when env vars are missing, no
boot-time crash.

### 7.1 Adapter shape

```typescript
// src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.ts
import { Redis } from '@upstash/redis';
import type { FxRateCachePort, FxRateCacheEntry } from '../../domain/ports/fx-rate-cache.port';

const KEY_PREFIX = 'gastos-personales:fx:v1';
const TTL_SECONDS = 3600; // 1 h per REQ-FX-1

export class UpstashFxRateCache implements FxRateCachePort {
  private readonly redis: Redis | null;

  constructor(env: { url?: string; token?: string } = process.env) {
    const url = env.url ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = env.token ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    this.redis = url && token ? new Redis({ url, token }) : null;
  }

  async get(casa: FxCasaString): Promise<FxRateCacheEntry | null> {
    if (!this.redis) return null; // no-op mode (REQ-FX-5)
    const raw = await this.redis.get<FxRateCacheEntry>(`${KEY_PREFIX}:${casa}`);
    if (!raw) return null;
    return raw;
  }

  async set(casa: FxCasaString, entry: FxRateCacheEntry): Promise<void> {
    if (!this.redis) return; // no-op mode
    await this.redis.set(`${KEY_PREFIX}:${casa}`, entry, { ex: TTL_SECONDS });
  }

  // Test seam: reset the cached Redis client. Production code
  // never calls this.
  _resetForTests(): void {
    this.redis = null; // or a fresh init if the test sets env vars
  }
}
```

### 7.2 Cache freshness rule

The cache entry carries `cachedAt` (ISO string). The
`FxRateProviderDolarApi` computes `stale` as
`Date.now() - new Date(entry.cachedAt).getTime() > 1000 * 60 * 60`
(> 1 h since cache write). The Upstash `EX 3600` is the
authoritative TTL (Redis evicts the key after 1 h); the
`cachedAt` check is for the in-process "is this still fresh
before the Redis eviction" semantic.

### 7.3 Read flow

```
FxRateProviderDolarApi.getDisplayAmount(request)
  ├─ cached = await cache.get(request.casa)
  ├─ if cached AND cached.cachedAt < now - 1h:
  │     stale read: return cached.quote with stale=true,
  │     fire-and-forget refreshIfStale(request.casa)
  │     (does NOT block the caller; REQ-FX-1)
  ├─ if cached AND cached.cachedAt >= now - 1h:
  │     fresh hit: return cached.quote with stale=false
  └─ cache miss:
        withLock(request.casa, () => dolarApi.get(request.casa))
          .then(quote => cache.set(request.casa, { ...quote, cachedAt: now }))
        returns quote with stale=false
```

### 7.4 Stale-fallback flow

When `getCachedRate` returns a stale value, the provider returns
the cached quote immediately with `stale: true`. A
**fire-and-forget** `refreshIfStale` is scheduled: it
re-fetches from DolarAPI and overwrites the cache. The caller's
request does NOT block on the refresh (REQ-FX-1). The next call
observes the same stale value until the refresh succeeds
(REQ-FX-1 Scenario "Background refresh failure does not
surface"). A refresh failure is captured as a Sentry warning,
not an error (see §10).

### 7.5 DolarAPI down on miss

The cache-miss path's
`withLock(request.casa, () => dolarApi.get(...))` rejects →
`AppError(FX_UNAVAILABLE)` (503). The caller surfaces the
inline error per BR-ACC-18. This preserves the contract: if we
have never seen a rate, we cannot serve one.

---

## 8. Stampede lock (REQ-FX-7)

A per-process in-memory `Map<casa, Promise<void>>` coalesces
concurrent cold-start fetches for the same casa.

### 8.1 Implementation

```typescript
// src/modules/fx/infrastructure/stampede/stampede-lock.ts

const inflight = new Map<FxCasaString, Promise<unknown>>();

export async function withLock<T>(
  casa: FxCasaString,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = inflight.get(casa);
  if (existing) return existing as Promise<T>;

  const next = fn().finally(() => inflight.delete(casa));
  inflight.set(casa, next);
  return next;
}
```

~5 lines. No new dependency.

### 8.2 Lifecycle

- Created once at module load (a module-level `Map`).
- Entries are inserted on first cache miss for a given casa.
- Entries are deleted on resolve (`finally`).
- The next miss for the same casa re-fetches (no stale entry
  guard).
- No TTL; the lock is in-memory only.

### 8.3 Scope

- **Per-process.** A multi-instance deployment pays N× upstream
  calls on a cold cache. Acceptable for v1 (N is 1-2 instances
  in Fly.io); a future Redis lock could tighten this.
- **Per-casa.** Different casas do not block each other
  (REQ-FX-7 Scenario "Concurrent cache-miss calls for different
  casas are independent").

### 8.4 Test seam

The `inflight` map is module-level; tests can call
`_resetInflightForTests()` to clear it between cases. Production
code never calls this.

---

## 9. Retry policy on DolarAPI 5xx (DG-FX-RETRY)

The spec left retry policy for design. **Decision: no retry in v1.**

Rationale:

- The cache + 1 h TTL means a single successful fetch serves
  ~3600 requests. Retries at the call site multiply upstream
  cost for marginal benefit (a single 5xx is followed by a
  refresh on the next request anyway).
- Retries during a cold-start stampede amplify the herd (each
  retry is a new upstream call).
- The stale-fallback path handles the common case (cache has a
  value from a previous successful fetch). Retries are only
  relevant on a true cold cache + 5xx, which is rare.
- A future change can add a single retry with 500 ms backoff if
  production data shows cold-cache + transient 5xx is a
  measurable problem. Tracked as a follow-up.

Failure modes handled:

| Case | Behavior |
| --- | --- |
| DolarAPI 5xx on cache miss | `AppError(FX_UNAVAILABLE)` 503 (REQ-FX-2). No retry. |
| DolarAPI 5xx on stale refresh | Captured as Sentry warning; cache stays stale (REQ-FX-1). No retry. |
| DolarAPI timeout (3000 ms) | `AppError(FX_UNAVAILABLE)` 503. No retry. |
| DolarAPI 4xx (malformed casa, etc.) | `AppError(FX_UNAVAILABLE)` 503. No retry. |

---

## 10. Error semantics (REQ-FX error table)

| Code | HTTP | Trigger | Caller surface |
| --- | --- | --- | --- |
| `FX_UNAVAILABLE` | 503 | Cache miss + DolarAPI unreachable, non-2xx, malformed payload, or Zod parse failure. | Inline error: `"FX rate provider unavailable. Try again in a few minutes."` (BR-ACC-18). |
| `FX_NOT_SUPPORTED` | 409 | Provider does not support the requested pair. Carried from `accounts`; never triggered by DolarAPI (all six pairs are supported). | Inline error: `"FX conversion not supported for this pair."` (BR-ACC-18). |
| `FX_STALE` | 200 | Cache hit past TTL. The DTO body carries `stale: true` AND `warnings: ["FX rate is stale; showing last known value."]`. | Amber chip (`text-amber-600`) + `"Last updated: <ISO>"` plain text. |

`FX_STALE` is **not** a new HTTP code; it's a 200 with a
warning payload. The system has exactly three states:
hit-fresh, hit-stale, miss-no-upstream (throws). There is no
fourth state. No synthetic rate, no `null` rate, no 204 on a
miss. The `FX_UNAVAILABLE` mapping is owned by the central
`errorHandler` in `accounts`; the `fx` capability throws
`AppError(FX_UNAVAILABLE)` and never crafts the HTTP response
itself.

---

## 11. Observability (REQ-FX observability contract)

The `fx` module emits structured log events for every provider
call and every cache operation. Field names match the spec
observability table; the transport is the existing project
logger (`@/shared/logger/logger`).

### 11.1 Log events

| Event | When | Fields |
| --- | --- | --- |
| `fx.cache.hit` | Cache hit (fresh or stale) | `casa`, `stale: boolean`, `fxAsOf` |
| `fx.cache.miss` | Cache miss + DolarAPI fetch | `casa`, `dolarApiLatencyMs`, `fxAsOf` |
| `fx.cache.miss.fail` | Cache miss + DolarAPI 5xx / parse failure | `casa`, `errorCode: 'FX_UNAVAILABLE'`, `dolarApiStatus?: number`, `errorMessage` |
| `fx.stale.refresh` | Stale hit → background refresh | `casa`, `dolarApiLatencyMs`, `result: 'ok' \| 'fail'` |
| `fx.stampede.coalesce` | Stampede lock coalesces N callers | `casa`, `concurrentCallers: number` |
| `fx.cache.noop` | Cache init with missing env vars | `reason: 'missing_env'` (logged once at boot, not per request) |

### 11.2 The 6 hand-offs from the spec — confirmed answered

The spec's "Observability" section listed 6 hand-offs as
deferred-to-design. Each is answered:

| Hand-off | Answered at |
| --- | --- |
| `fx.cache.hit` / `fx.cache.miss` (boolean) | §11.1 first two rows (`stale: boolean` is implied on hit; cache miss implies `stale: false` since the fresh value is about to be written) |
| `fx.dolarapi.duration_ms` (number) | §11.1 `dolarApiLatencyMs` field on `fx.cache.miss` and `fx.stale.refresh` events |
| `fx.dolarapi.status` (200/4xx/5xx) | §11.1 `dolarApiStatus?: number` field on `fx.cache.miss.fail` event (200 not logged; 4xx/5xx logged) |
| `fx.stale` (boolean) | §11.1 `stale: boolean` field on `fx.cache.hit` event |
| `fx.casa` (string) | §11.1 `casa` field on every event |
| Sentry capture rules | §11.3 below |

### 11.3 Sentry capture rules

- `FX_UNAVAILABLE` on cache miss: capture as `error` (no
  upstream rate to serve is a real failure).
- `FX_UNAVAILABLE` on stale refresh: capture as `warning`
  (degraded but not broken; the stale path is doing its job).
- Cache layer no-op (missing env vars): do NOT capture (this
  is the local-dev / CI contract).
- All Upstash errors: capture as `error` with the operation
  (`get` / `set`) and the casa. Never log the env var values.

---

## 12. Cross-module events (DG-FX-EVENTS)

The spec listed observability events but did not call out
cross-module events. **Decision: no new events in v1.**

Rationale:

- The proposal §"Out of scope" lists "Push notifications or
  background jobs of any kind" — adding a `fx.dolarapi.outage`
  event would imply a listener that does something, which is
  not in scope.
- The stampede lock is per-process and short-lived (one fetch);
  no event is useful to a downstream consumer (no aggregate,
  no cache warming, no alerting hook).
- The cache layer logs its own misses and Sentry captures 5xx
  patterns; an Sentry alert on
  `fx.cache.miss.fail` rate > N per hour is the equivalent
  outage signal without a new event.

Flagged follow-up:

- If the future `snapshots` capability needs a
  `fx.dolarapi.outage` event to backfill snapshots, the event
  is added in that change. The `event-dispatcher.ts` shape
  (`DomainEvent` discriminated union) accommodates a new
  variant without breaking existing subscribers.

---

## 13. Capability boundary

The module-structure decision is **§2.1** (new `src/modules/fx/`,
not an extension of `accounts/infrastructure/external/`). The
dependency arrow is `fx → accounts`'s port; never the reverse.
This section summarizes the dependency rules in one place.

### 13.1 What `fx` imports from `accounts`

- `FxRateProvider` port interface from
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`.
- `AccountFxCasa` Prisma enum (re-exported from
  `src/modules/accounts/domain/entities/financial-account.ts`)
  for the `account.casa` Prisma column type.

### 13.2 What `fx` does NOT import from `accounts`

- Any file under `src/modules/accounts/application/`.
- Any file under `src/modules/accounts/infrastructure/`
  (except the deleted `fx-rate-provider.unconfigured.ts`,
  which is the file being replaced).
- Any file under `src/modules/api/`.

### 13.3 What `accounts` imports from `fx`

Exactly one line: the DI wiring at `src/modules/api/app.ts:316`:

```typescript
// Before (current):
const fxProvider: FxRateProvider = new FxRateProviderUnconfigured();

// After (PR #3):
import { FxRateProviderDolarApi } from '@/modules/fx';
import { UpstashFxRateCache } from '@/modules/fx/infrastructure/cache/upstash-fx-rate.cache';
import { withLock as withStampedeLock } from '@/modules/fx/infrastructure/stampede/stampede-lock';
const fxProvider: FxRateProvider = new FxRateProviderDolarApi({
  cache: new UpstashFxRateCache(),
  lock: withStampedeLock,
  env: process.env,
});
```

The action layer (`get-account-balance.action.ts`) does NOT
import from `fx` — it consumes the port through the existing
`deps.fxRateProvider` injection.

---

## 14. DI swap

The single swap point is `src/modules/api/app.ts:316` (the
`buildDefaultDeps` function, line that constructs
`fxProvider: FxRateProvider = new FxRateProviderUnconfigured()`).
The new line constructs an `FxRateProviderDolarApi` instance
with the cache adapter, the stampede lock, and the env.

### 14.1 The one-line edit

```typescript
// src/modules/api/app.ts:316 — PR #3 edit
// Before:
const fxProvider: FxRateProvider = new FxRateProviderUnconfigured();
// After:
const fxProvider: FxRateProvider = new FxRateProviderDolarApi({
  cache: new UpstashFxRateCache(),
  lock: withStampedeLock,
  env: process.env,
});
```

The `FxRateProviderUnconfigured` file is deleted in the same PR
(`git rm src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts`).
The TypeScript compiler will fail the build if the import on
line 59 of `app.ts` is left dangling; reviewer confirms the
deletion is paired with the import removal.

### 14.2 The `FxRateProvider` port change

The existing port interface at
`src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`
gains one field on `FxConversionRequest`:

```typescript
// Additive change in PR #3
export interface FxConversionRequest {
  readonly native: {
    readonly amount: number;
    readonly currency: AccountCurrency;
  };
  readonly displayCurrency: AccountCurrency;
  readonly asOf: Date;
  readonly casa: AccountFxCasa; // NEW — fully resolved by the caller
}
```

This is the only port change. The new field is `required`,
not optional, to enforce the REQ-FX-3 invariant "the provider
MUST receive a fully-resolved `casa` on every call" at the type
level. The call site in `get-account-balance.action.ts` resolves
`account.casa ?? env.FX_DEFAULT_CASA` and passes it through.

### 14.3 Test seam

The `buildDefaultDeps` factory is testable via `createHonoApp(deps)`
which already accepts an `fxRateProvider` injection. Existing tests
in `src/modules/api/app.accounts.test.ts` continue to work with
their fake provider.

---

## 15. UI change

The UI delta is **additive on existing smoke pages**. Three
small edits; no new pages.

### 15.1 Stale chip in `app/accounts/[id]/balance-widget.tsx`

The widget already renders the conversion result in a Tailwind
div (`app/accounts/[id]/balance-widget.tsx:142-157`). The chip
is added inside that div when `body.data.stale === true`.

```tsx
// app/accounts/[id]/balance-widget.tsx — addition (PR #3, ~15 lines)
{result ? (
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
      Display:{' '}
      <span className="font-mono">
        {formatMinor(result.amount, result.currency)}
      </span>{' '}
      <span className="text-sm text-gray-600">
        @ {result.fxRate.toFixed(4)}
      </span>
    </p>
    <p className="text-sm text-gray-600">
      Last updated: {result.fxAsOf}
    </p>
  </div>
) : null}
```

The `stale` and `staleMinutes` values come from the response
body (`body.data.stale` and the delta between `body.data.fxAsOf`
and `now()`). The `fxAsOf` text from BR-ACC-18 is unchanged
(no warning styling); the chip is the new signal.

### 15.2 Casa `<select>` in `create-account-form.tsx`

The create form gains a new `<select name="casa">` after the
existing `<select name="currency">`. The option set is the six
`AccountFxCasa` values plus a "Default (oficial)" option that
maps to `null` in the form state and to the Zod
`fxCasaStringSchema` `nullable` in the request body.

```tsx
// app/accounts/new/create-account-form.tsx — addition (PR #2, ~25 lines)
const CASAS = ['OFICIAL', 'BLUE', 'MEP', 'CCL', 'CRIPTO', 'TARJETA'] as const;
type Casa = (typeof CASAS)[number] | null;

const [casa, setCasa] = useState<Casa>(null); // null = inherit global default

// In the form JSX:
<label className="block">
  <span className="block text-sm">FX casa (optional)</span>
  <select
    name="casa"
    value={casa ?? ''}
    onChange={(e) => setCasa(e.target.value === '' ? null : e.target.value as Casa)}
    className="border border-gray-300 rounded px-2 py-1"
  >
    <option value="">Default (oficial)</option>
    {CASAS.map((c) => <option key={c} value={c}>{c}</option>)}
  </select>
</label>
```

The form's `onSubmit` includes `casa` in the JSON body (or
omits the field when `null`). The server-side Zod
`account-create.schema.ts` adds a nullable
`casa: z.enum(CASAS).nullable().optional()` field; `undefined`
and `null` both map to `column = NULL`.

### 15.3 Edit form — out of scope for v1

The proposal §"Affected areas" lists `app/accounts/[id]/edit-account-form.tsx`
but no such file exists today (only `create-account-form.tsx`
and `balance-widget.tsx`). Per the brief: **edit form is out
of scope for v1**. Users on existing accounts pick `casa` via
the create form for new accounts; existing rows keep
`casa = NULL` and inherit the global default. The edit form
is a follow-up in `ui-accounts`.

### 15.4 `fxAsOf` rendering

The widget continues to render `display.fxAsOf` as plain text
`"Last updated: <ISO date>"` (BR-ACC-18 Decision 3). No change.

---

## 16. Out of scope (carried from proposal + spec)

- EUR/ARS, USD/EUR, BRL/ARS — DolarAPI does not quote these;
  the `FxRateProvider` port is not extended.
- Multi-currency per-transaction FX.
- Per-account casa change history (audit log).
- A `MOST_RECENT` auto-picker.
- A scheduled Cron warmup of the cache.
- Multi-source FX (DolarAPI + Frankfurter + a third source).
- Surfacing `warnings` in the smoke widget UI beyond the
  `stale: boolean` chip.
- Migrating the rate-limit module's Upstash client into a
  shared `UpstashClient` factory.
- Production UI changes beyond the smoke warning chip and the
  casa `<select>` in the create form.
- Edit form for casa (see §15.3 — out of scope for v1).
- Push notifications or background jobs of any kind.
- A `fx.dolarapi.outage` cross-module event (see §12).

---

## 17. Acceptance criteria (mapped 1:1 to REQ-FX-1 to REQ-FX-9)

| Spec REQ | Design acceptance criterion |
| --- | --- |
| REQ-FX-1 (TTL + stale fallback) | Vitest unit test: cache hit within TTL returns `stale: false`; cache hit past TTL returns `stale: true` and triggers background refresh; background refresh failure is silent (no `AppError`). Vitest integration test: `UpstashFxRateCache` writes `EX 3600` on every set. |
| REQ-FX-2 (DolarAPI miss throws) | Vitest unit test: with cache empty + DolarAPI forced to 500, `getDisplayAmount` throws `AppError(FX_UNAVAILABLE)`. Vitest unit test: with cache empty + DolarAPI malformed payload, `getDisplayAmount` throws `AppError(FX_UNAVAILABLE)`. |
| REQ-FX-3 (casa resolution at caller) | Vitest unit test: `get-account-balance.action.ts` resolves `account.casa ?? env.FX_DEFAULT_CASA`. Three sub-scenarios: NULL → 'oficial'; explicit 'BLUE' → 'blue'; env var overrides NULL. The provider unit test confirms it never reads env or queries the DB. |
| REQ-FX-4 (cache key) | Vitest unit test: first `cache.set('oficial', entry)` writes key `gastos-personales:fx:v1:oficial`. Two concurrent `cache.set('blue')` and `cache.set('mep')` produce two distinct keys. |
| REQ-FX-5 (no-op without Upstash env) | Vitest unit test: with `UPSTASH_REDIS_REST_URL` unset, `cache.get` returns `null` and `cache.set` is a no-op. Vitest unit test: the Hono DI graph boots without crashing when env vars are missing. |
| REQ-FX-6 (`stale` boolean + warnings) | Vitest unit test: `toBalanceDto` maps provider's `stale: true` to DTO's `stale: true` + `warnings: ['FX rate is stale; showing last known value.']`. Vitest unit test: `stale: false` → `warnings: undefined`. |
| REQ-FX-7 (stampede lock) | Vitest unit test: 10 concurrent `withLock('oficial', fn)` calls invoke `fn` exactly once. Vitest unit test: concurrent calls for different casas invoke `fn` independently. |
| REQ-FX-8 (base URL override) | Vitest unit test: with `DOLAR_API_BASE_URL` unset, client targets `https://dolarapi.com/v1`. Vitest unit test: with `DOLAR_API_BASE_URL=http://localhost:9999`, client targets `http://localhost:9999`. |
| REQ-FX-9 (non-destructive migration) | Vitest integration test (testcontainers Postgres): apply the migration to a populated DB; assert every existing row has `casa IS NULL`. Vitest unit test: existing rows render the inherited global default (the action's casa resolution falls through `account.casa ?? env.FX_DEFAULT_CASA`). |

The acceptance criteria are enforced via `pnpm test` (Vitest) and
`pnpm exec tsc --noEmit` (TypeScript strict). Coverage target is
≥80% on `src/modules/fx/**` (lines, branches, functions,
statements), enforced by the CI `test` job.

---

## 18. Open design decisions (DGs closed by this design)

The spec deferred 4 design-level decisions to `sdd-design`. This
design closes them.

### DG-D-1 — Cache key encoding

**Decision**: `gastos-personales:fx:v1:<casa>` (§4).

**Rationale**: app namespace matches the rate-limit module's
convention; `v1` is a forward-only cache-bust prefix; lowercase
casa matches the DolarAPI wire format.

**Closed by**: §4.

### DG-D-2 — Retry policy on DolarAPI 5xx

**Decision**: no retry in v1 (§9).

**Rationale**: the cache + 1 h TTL means retries multiply
upstream cost for marginal benefit; the stale-fallback path
handles the common case; a future change can add a single retry
with backoff if production data shows the need.

**Closed by**: §9.

### DG-D-3 — Observability field names

**Decision**: structured log events at §11.1 with the field
names from the spec observability table. Sentry capture rules
at §11.3.

**Rationale**: matches the spec table 1:1; field names are stable
for Sentry queries; transport is the existing project logger.

**Closed by**: §11.

### DG-D-4 — Cross-module events

**Decision**: no new events in v1 (§12).

**Rationale**: the proposal's "Push notifications or background
jobs of any kind" is out of scope; Sentry alert on
`fx.cache.miss.fail` rate is the equivalent outage signal
without a new event. A future `snapshots` capability may add
`fx.dolarapi.outage` as a follow-up.

**Closed by**: §12.

---

## 19. File-to-requirement traceability matrix

| Spec REQ | Files |
| --- | --- |
| REQ-FX-1 (TTL + stale fallback) | `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.ts` (read flow + stale refresh), `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.ts` (TTL_SECONDS = 3600), `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.test.ts` (cache hit/miss/stale scenarios). |
| REQ-FX-2 (DolarAPI miss throws) | `src/modules/fx/infrastructure/external/dolar-api.client.ts` (Zod parse + non-2xx mapping), `src/modules/fx/infrastructure/external/dolar-api.client.test.ts` (500 + malformed scenarios). |
| REQ-FX-3 (casa resolution at caller) | `src/modules/accounts/application/actions/get-account-balance.action.ts` (resolution rule), `src/modules/fx/domain/entities/fx-casa-string.schema.ts` (Zod normalization), `src/modules/accounts/application/actions/get-account-balance.action.test.ts` (resolution scenarios). |
| REQ-FX-4 (cache key) | `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.ts` (`KEY_PREFIX` + `TTL_SECONDS`), `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.test.ts` (key shape assertion). |
| REQ-FX-5 (no-op without Upstash env) | `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.ts` (env-var-gated constructor), `src/modules/api/app.ts` (DI wiring), `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.test.ts` (no-env scenarios). |
| REQ-FX-6 (`stale` boolean + warnings) | `src/modules/accounts/application/dto/financial-account-balance.dto.ts` (DTO gain), `src/modules/accounts/application/dto/financial-account-balance.dto.test.ts` (mapping scenarios), `app/accounts/[id]/balance-widget.tsx` (chip render). |
| REQ-FX-7 (stampede lock) | `src/modules/fx/infrastructure/stampede/stampede-lock.ts` (`Map` + `withLock`), `src/modules/fx/infrastructure/stampede/stampede-lock.test.ts` (10 concurrent callers → 1 fetch). |
| REQ-FX-8 (base URL override) | `src/modules/fx/infrastructure/external/dolar-api.client.ts` (`baseUrl` resolution), `src/modules/fx/infrastructure/external/dolar-api.client.test.ts` (default + override scenarios). |
| REQ-FX-9 (non-destructive migration) | `prisma/schema.prisma` (AccountFxCasa enum + casa column), `prisma/migrations/<ts>_add_account_fx_casa/migration.sql` (ALTER TABLE), `src/modules/accounts/application/actions/get-account-balance.action.ts` (resolution fallthrough). |

---

## 20. Risks & tradeoffs

| Risk | Mitigation |
| --- | --- |
| **DolarAPI down with a cold cache** (no stale value to serve) → 503 to the user. | The widget shows the 503 inline error per BR-ACC-18; documented behavior; not a regression. A future Cron warmup removes this entirely. |
| **DolarAPI rate-limits us** (no public SLA; free endpoint). | The 1 h cache + per-process stampede lock cut upstream calls by ~99% in steady state. Fallback is the stale value. |
| **DolarAPI changes its response shape** (it is a community API). | Zod validation in `dolar-api.client.ts` rejects unknown shapes with `FX_UNAVAILABLE`. The shape is small (~6 fields); the risk is bounded. |
| **`oficial` is not the right default** for a personal-finance app. | Default is overridable per-account via the new `casa` column (REQ-FX-3). Users who want `blue` set it on the account. |
| **High-inflation periods** (ARS) make the 1 h TTL noticeable. | The widget renders the stale chip (`text-amber-600`) so the user can judge freshness. A future Cron warmup could shorten the perceived TTL. |
| **Upstash client duplication** (rate-limit + new cache) drifts. | A shared `UpstashClient` factory is a follow-up; the two consumers are tiny and identical in shape today. |
| **`FxRateProvider` port change** (`casa` becomes required on `FxConversionRequest`). | The change is additive (new field, never removed); the only caller is the action layer; the action is updated in the same PR. |
| **The per-account `casa` migration runs against an existing populated DB**. | The migration is `ADD COLUMN casa AccountFxCasa NULL` — non-destructive; no backfill, no default. The smoke UI must show the inherited global default until the user explicitly overrides (no auto-migration of existing rows to `oficial`). |
| **The casa enum mapping** (Prisma `OFICIAL` ↔ DolarAPI `oficial`) drifts if DolarAPI renames a casa. | The mapping is centralized in `fx-casa-string.schema.ts` and unit-tested against every casa. A casa rename requires a deliberate code + DTO + Zod edit. |
| **Bilingual drift** — the Spanish mirror may fall behind the English design. | The mirror is written in the same PR as the English source. The Husky pre-commit `check-lockfile.sh` does not enforce docs; reviewer verifies both files. |
| **`pnpm-lock.yaml` drift** — if a future change adds a new dep to the `fx` module. | Per root `AGENTS.md` §5.3: the lockfile is a deliverable. Husky pre-commit hook fails the commit if `package.json` is staged without a corresponding `pnpm-lock.yaml` change. The `fx` module reuses existing deps (`@upstash/redis` already in the tree from `auth-foundation`); no new dep is added in v1. |
| **The DI swap leaves a window** where neither the stub nor the real provider is wired. | PR #3 ships the swap and the stub deletion in the same commit; TypeScript compiler fails the build if the import is left dangling. |

---

## 21. Rollout (per-PR plan, 3 chained PRs, `feat/fx-cache-{1,2,3}` → `develop`)

| PR | Branch | Scope | Approx. lines | Acceptance gate |
| --- | --- | --- | --- | --- |
| 1 | `feat/fx-cache-1` | New `src/modules/fx/` module: `dolar-api.client.ts` + `upstash-fx-rate.cache.ts` + `stampede-lock.ts` + `fx-rate-provider.dolar-api.ts` + `fx-quote.ts` + `fx-casa-string.schema.ts` + ports + tests. **No DI swap; the stub stays wired.** | ~600 | `pnpm test` exits 0; ≥80% coverage on `src/modules/fx/**`; DolarAPI client integration test against `http://localhost:9999` (sandbox) passes. |
| 2 | `feat/fx-cache-2` | Per-account `casa`: `AccountFxCasa` enum + nullable column + `add_account_fx_casa` migration + Zod validation in `account-create.schema.ts` + casa `<select>` in `create-account-form.tsx` + `toFinancialAccountDto` exposes `casa` + `update-account.action.ts` accepts `casa`. **DI still wired to the stub; the FX endpoint still 503s.** | ~300 | `pnpm prisma migrate dev` succeeds; `pnpm test` exits 0; populated DB migration is non-destructive (existing rows have `casa = NULL`). |
| 3 | `feat/fx-cache-3` | DI swap (delete `fx-rate-provider.unconfigured.ts` + new wiring in `app.ts:316`) + `get-account-balance.action.ts` wires `account.casa ?? env.FX_DEFAULT_CASA` + `stale` chip in `balance-widget.tsx` + balance DTO gains `stale: boolean` + `accounts` spec cross-link delta + `fx` spec created + `docs/adr/0010-dolar-api-provider.md` written + ES mirror. | ~250 | `pnpm test` exits 0; `pnpm dev` → sign in → `/accounts/[id]` → submit widget → `display.amount` + `display.fxRate` + `"Last updated: <ISO>"` render. With DolarAPI forced to 500 in test: 503. With cache past TTL: stale chip + warning string in DTO. |

Total: ~1150 lines across 3 PRs. Matches the proposal forecast
(§"Forecast"). The PRs are chained: 1 → 2 → 3; each PR opens to
`develop` only after the previous is squash-merged.

### 21.1 Lockfile discipline

No PR adds a new dep. `@upstash/redis` is already in `package.json`
from `auth-foundation`. The `pnpm-lock.yaml` is unchanged across
all three PRs; the Husky pre-commit lockfile check is
informational (passes because no `package.json` change).

### 21.2 Bilingual mirror policy

PR #3 writes the Spanish mirror of `design.md` and the ADR at the
same time as the English source:
`Documents-es/openspec/changes/fx-cache/design.md` and
`Documents-es/docs/adr/0010-dolar-api-provider.md`. Both files
pass the Chinese-character check (`grep -P '[\x{4e00}-\x{9fff}]'`).

### 21.3 Worktree discipline

Each PR lives in its own git worktree:

```bash
git worktree add ../gastos-personales-fx-cache-1 -b feat/fx-cache-1 develop
cd ../gastos-personales-fx-cache-1
# ... work, commit, push
gh pr create --base develop --title "feat(fx): add fx module + DolarAPI client + cache (PR-1: domain + infra)"
# after squash-merge to develop:
git worktree remove ../gastos-personales-fx-cache-1
```

### 21.4 Pre-merge gate

Before each PR is squash-merged to `develop`, the parent runs a
`sdd-verify` pass. The verify pass uses the `sdd-verify` agent
with fresh context. The reviewer audits the TDD evidence, the
test count delta, the coverage on `src/modules/fx/**`, and the
bilingual mirror.

---

## 22. Next step

The next SDD phase is `sdd-tasks`: produce
`openspec/changes/fx-cache/tasks.md` with the 3 chained PRs
decomposed into atomic tasks (one per commit), each with strict
TDD evidence columns (RED → GREEN → TRIANGULATE → REFACTOR).
After `sdd-tasks`: `sdd-apply` (PR-1, PR-2, PR-3 in sequence).
The `sdd-verify`, `sdd-sync`, and `sdd-archive` phases follow
each PR. The `fx` capability spec promotes to
`openspec/specs/fx/spec.md` on archive.