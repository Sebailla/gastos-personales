# Spec — `fx` capability

**Author**: Sebastián Illa
**Capability**: `fx`
**Source change**: `fx-cache`
**Status**: active · **Created**: 2026-06-21 · **Last sync**: 2026-06-21 (fx-cache)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (inherited from `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4

> First write of the `fx` capability spec. It operationalizes the
> `fx-cache` proposal (draft 2026-06-21) plus the five product
> decisions closed in the same session (DG-FX-1 to DG-FX-5, see
> "Closed decisions" below). The spec declares **what MUST be
> true** after the change lands, not how to implement it.
> Implementation details (file paths, schema syntax, test layout)
> are limited to what the cross-module contract requires.
>
> This is a **delta spec** for the new `fx` capability. The `fx`
> capability does not yet exist under `openspec/specs/` — it
> lives under `openspec/changes/fx-cache/specs/fx/` until
> `sdd-archive` promotes it to the canonical location.

## Closed decisions (DG-FX-1 to DG-FX-5 — 2026-06-21)

The five decision gaps are authoritative where they modify or
extend the proposal. The spec reflects them as Requirements and
BRs, not as a separate "decisions" section. Decision IDs are
referenced inline in the relevant Scenario bodies.

| Gap     | Decision                                                | Rationale                                                                                  | Codified at        |
| ------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------ |
| DG-FX-1 | Default casa = `oficial`                                | Conservative pick; the smoke widget already shows it per BR-ACC-18.                        | BR-FX-3            |
| DG-FX-2 | Per-account casa in v1                                  | Column is additive; user picked v1 over a deferred follow-up.                              | Change 5, BR-FX-3  |
| DG-FX-3 | Visible amber `stale: boolean` chip                     | Smallest user-visible signal that maps to one UX primitive.                                | Change 3, BR-FX-6  |
| DG-FX-4 | In-process `Map<casa, Promise<void>>` lock              | Cheapest defense against cold-start herd; no coordination protocol.                        | Change 6, BR-FX-7  |
| DG-FX-5 | Hardcoded base URL + `DOLAR_API_BASE_URL` env override  | One-line env-var cost; tests get a sandbox switch; production cannot drift.                | BR-FX-8            |

Alternatives considered for each gap are recorded in
`docs/adr/0010-dolar-api-provider.md` (written by `sdd-design`).
EUR/ARS stays out of v1 per the `Non-goals` section of the
proposal.

## Purpose

The `fx` capability owns the implementation of the
`FxRateProvider` port that `accounts` declares. It is a
**read-only display-concern capability**: it does not mutate
balances, it does not own FX rate storage in the domain model,
and it does not own the `GET /api/accounts/:id/balance`
endpoint (that endpoint lives in `accounts`). It exposes a
stable, presentation-layer rate surface — `{ amount, currency,
fxRate, fxAsOf }` plus a `stale: boolean` signal and a
`warnings: string[]` array — that any consumer that needs a
conversion can use without learning the upstream details.

The capability guarantees that: (a) a single concrete
`FxRateProvider` implementation (DolarAPI) is wired in the DI
graph; (b) the cache contract (1 hour TTL, stale-fallback,
stampede lock) is observed for every read; (c) the casa
selection rule (`account.casa ?? env.FX_DEFAULT_CASA`) is
applied at the call site in `accounts`, never inside the
provider, so the provider has no per-call global state; (d) the
rate surface degrades gracefully when DolarAPI is down, and
fails loudly when there has never been a rate to serve; (e) the
per-process in-memory stampede lock coalesces concurrent
cold-start fetches so a thundering herd does not hammer
DolarAPI.

## Scope

### In scope

- New module `src/modules/fx/` (parallel to
  `src/modules/accounts/`).
- `FxRateProvider` implementation backed by DolarAPI.
- Upstash Redis cache layer (1 hour TTL, stale-fallback).
- Per-process stampede lock (in-memory `Map<casa, Promise<void>>`).
- The DI swap that replaces
  `FxRateProviderUnconfigured` with the real provider.
- The new `stale: boolean` field on
  `FinancialAccountBalanceDto` (the DTO lives in `accounts`;
  the spec is co-owned by `fx` and `accounts` per the
  cross-references below).
- The casa resolution rule applied at the
  `get-account-balance.action.ts` call site.

### Out of scope

- EUR/ARS, USD/EUR, BRL/ARS, or any non-ARS↔USD pair. The
  `FxRateProvider` interface stays untouched so a future
  `FxRateProviderFrankfurter` (or similar) can ship as its own
  change.
- Multi-source FX (DolarAPI + Frankfurter + a hard-coded ARS
  fallback). Single source for v1; resilience is solved by the
  stale-fallback path, not by adding providers.
- Multi-currency per-transaction FX (a future `transactions`
  capability MAY store the FX rate used at write time on each
  transaction row, but for v1 the FX surface stays read-only
  and display-only per BR-ACC-12).
- A `MOST_RECENT` auto-picker that picks the casa with the
  latest `fechaActualizacion` from DolarAPI. The user picked
  the fixed-default `oficial` for v1.
- A scheduled Cron job that warms the cache every 30 minutes.
  The 1 h TTL means the cache is warm while the app is in use
  and goes cold overnight; the first request after a quiet
  period pays the DolarAPI round-trip. A Cron warmup is a
  follow-up.
- Per-account casa change history (audit log). The `casa`
  column carries only the current value. History is a follow-up.
- Production UI changes beyond the smoke warning chip. The
  production FX UI lives in `ui-accounts`.
- Migrating the rate-limit module's Upstash client into a
  shared `UpstashClient` factory. Two Upstash consumers with
  their own client construction is acceptable for v1.

### Capability boundary

- `fx` owns the DolarAPI integration, the cache layer, the
  stampede lock, and the `FxRateProvider` implementation.
- `accounts` owns the `FxRateProvider` port interface, the
  read-only display endpoint, the `casa` column on
  `FinancialAccount`, the casa edit form, and the call-site
  resolution rule.
- The dependency points from `fx` to `accounts`'s port
  interface, never the reverse, preserving the ports & adapters
  invariant.

## Entities

The spec is mostly interface-level. Three shapes are part of
the contract that crosses the `accounts` ↔ `fx` boundary.

### `FxQuote`

The value object a concrete provider returns for a single
casa. Validated by Zod at the boundary.

| Field    | Type                              | Constraints                                                    |
| -------- | --------------------------------- | -------------------------------------------------------------- |
| `casa`   | `AccountFxCasa` (lowercase string) | One of `oficial \| blue \| mep \| ccl \| cripto \| tarjeta`.   |
| `buy`    | `number`                          | Numeric (no `NaN`); used for future `FX_BUY` flow, not v1.    |
| `sell`   | `number`                          | Numeric (no `NaN`); the rate used for display conversion.      |
| `fxAsOf` | `string` (ISO-8601)               | Source timestamp from DolarAPI. Immutable.                      |

Invariants:

- `buy` and `sell` are both strictly positive.
- `fxAsOf` parses as a valid date and is in the past relative
  to the wall clock at read time (DolarAPI timestamps are not
  future-dated in practice).
- The shape is a stable Zod-validated interface; the DolarAPI
  wire format maps 1:1 to the field names so a parse failure
  is loud, not silent.

### `FxRateCacheEntry`

The shape stored in the Upstash Redis cache. A superset of
`FxQuote` plus the freshness metadata the cache layer needs.

| Field       | Type                | Constraints                                                          |
| ----------- | ------------------- | -------------------------------------------------------------------- |
| `casa`      | `AccountFxCasa`     | Same enum as `FxQuote.casa`.                                         |
| `buy`       | `number`            | Same as `FxQuote.buy`.                                               |
| `sell`      | `number`            | Same as `FxQuote.sell`.                                              |
| `fxAsOf`    | `string` (ISO-8601) | Same as `FxQuote.fxAsOf`.                                            |
| `cachedAt`  | `string` (ISO-8601) | The time the cache layer set the entry. Used to decide staleness.    |

Invariants:

- `cachedAt >= fxAsOf` (the cache cannot have been set before
  the source timestamp).
- The entry is JSON-encoded; `cachedAt` is the only field the
  consumer of the cache must read to decide staleness — the
  Upstash TTL is the authoritative expiry.

### `FxRequest`

The input shape a caller passes to the `FxRateProvider`.

| Field  | Type            | Constraints                                                            |
| ------ | --------------- | ---------------------------------------------------------------------- |
| `casa` | `AccountFxCasa` | Already resolved by the caller (`account.casa ?? env.FX_DEFAULT_CASA`). |

Invariants:

- `casa` is non-null at the point the provider sees it. The
  provider MUST NOT consult the env var or the account row
  itself; resolution is the caller's job (BR-FX-3).
- `casa` is one of the six `AccountFxCasa` values, validated
  by the same Zod schema used for account updates.

## Operations

The capability exposes five operations through the
`FxRateProvider` port and the supporting cache layer. Operations
are interface-level: they describe what MUST be true, not the
class names or file paths that implement them.

### `getRate(casa)`

Returns a fresh `FxQuote` for the given casa. The provider:

- Checks the cache (see `getCachedRate`).
- On cache hit (fresh OR stale): returns the cached quote
  immediately. On stale, the provider MUST also schedule a
  background refresh (see `refreshIfStale`).
- On cache miss: calls DolarAPI. On success, writes the
  response to the cache and returns it. On DolarAPI failure,
  throws `AppError(FX_UNAVAILABLE)` (503).

The caller is `get-account-balance.action.ts` in `accounts`.

### `getCachedRate(casa)`

Reads the Upstash Redis entry for the given casa. Returns
`{ quote: FxQuote, stale: boolean }` or `null` if the entry is
absent. The cache layer is a no-op (always returns `null`) when
`UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` is
missing — the provider falls through to DolarAPI in that case
(BR-FX-5).

### `refreshIfStale(casa)`

If a stale value is present in the cache, fetches a fresh value
from DolarAPI and overwrites the cache entry. The refresh is
fire-and-forget: failures MUST NOT surface to the original
caller of `getRate`. The next call sees the same stale value
until the refresh succeeds (BR-FX-1, BR-FX-2).

### `getStaleOrThrow(casa)`

Reads the cache and returns the entry with `stale: true` if it
exists, regardless of TTL. Throws `AppError(FX_UNAVAILABLE)`
(503) if the entry is absent. Used by the read path to
preserve a usable rate when DolarAPI is down but a prior value
exists.

### `coalesceFetch(casa, fn)`

Wraps `fn` (a DolarAPI fetch) in the per-process stampede lock.
The first caller for a given casa on a cache miss inserts a
`Promise<void>` and runs `fn`; concurrent callers await the
same promise. The entry is deleted on resolve so the next
miss re-fetches. No cross-process coordination (BR-FX-7).

## Requirements

### Cache contract

#### REQ-FX-1: Cache TTL is 1 hour and stale-fallback returns the last known value

The system MUST set the Upstash `EX` value to `3600` (1 hour)
on every cache write. After the TTL expires, the value is
considered "stale". On a stale read, the system MUST return
the cached value AND emit a `stale: true` signal on the
balance DTO AND emit a warning string in the
`warnings: string[]` array. The system MUST trigger a
background refresh on a stale read. The background refresh
MUST NOT surface a failure to the caller of `getRate`; the
next call MUST observe the same stale value until the refresh
succeeds.

##### Scenario: Cache miss followed by hit within TTL

- GIVEN: the cache has no entry for `oficial`
- WHEN: a caller invokes `getRate("oficial")`
- THEN: DolarAPI is called once
- AND: the response is written to the cache with `EX 3600`
- AND: the caller receives the fresh `FxQuote` with `stale: false`
- AND: the next call within 1 hour is served from the cache with no DolarAPI call

##### Scenario: Stale read returns the cached value and refreshes in background

- GIVEN: the cache holds an `oficial` entry written 2 hours ago
- WHEN: a caller invokes `getRate("oficial")`
- THEN: the caller receives the cached `FxQuote` with `stale: true`
- AND: the response DTO carries the warning string `"FX rate is stale; showing last known value."`
- AND: a background DolarAPI fetch is started
- AND: the caller's request does not block on the background fetch

##### Scenario: Background refresh failure does not surface

- GIVEN: the cache holds a stale `oficial` entry
- AND: DolarAPI returns a 5xx
- WHEN: a caller invokes `getRate("oficial")`
- THEN: the caller receives the stale cached value with `stale: true`
- AND: no `AppError(FX_UNAVAILABLE)` is thrown
- AND: the next call observes the same stale value

#### REQ-FX-2: DolarAPI unavailable on cache miss throws FX_UNAVAILABLE

The system MUST throw `AppError(FX_UNAVAILABLE)` (HTTP 503)
when `getRate` is called on a cache miss and DolarAPI is
unreachable, returns a non-2xx, or returns a payload that
fails Zod validation. The system MUST NOT return a partial
quote, an empty object, or a synthetic value. There is no
third state: hit-fresh, hit-stale, miss-no-upstream (throws).

##### Scenario: DolarAPI 5xx on cache miss throws 503

- GIVEN: the cache has no entry for `oficial`
- AND: DolarAPI returns HTTP 500
- WHEN: a caller invokes `getRate("oficial")`
- THEN: `AppError(FX_UNAVAILABLE)` is thrown
- AND: the caller maps this to HTTP 503

##### Scenario: DolarAPI malformed payload throws 503

- GIVEN: the cache has no entry for `oficial`
- AND: DolarAPI returns a 200 with a payload that fails Zod validation (e.g. missing `venta`)
- WHEN: a caller invokes `getRate("oficial")`
- THEN: `AppError(FX_UNAVAILABLE)` is thrown
- AND: the caller's response status is 503

#### REQ-FX-3: Casa resolution is the caller's responsibility

The `FxRateProvider` MUST receive a fully-resolved `casa` on
every call. The provider MUST NOT read `process.env.FX_DEFAULT_CASA`
or any column on `FinancialAccount`. The caller is
`get-account-balance.action.ts` in `accounts`, and the
resolution rule is `account.casa ?? process.env.FX_DEFAULT_CASA`
where `process.env.FX_DEFAULT_CASA` defaults to `oficial` when
unset. `NULL` account `casa` means "inherit the global default".

##### Scenario: NULL account.casa falls back to the global default

- GIVEN: the authenticated user's account has `casa = NULL`
- AND: `process.env.FX_DEFAULT_CASA` is unset
- WHEN: the action resolves the casa and calls `getRate`
- THEN: the casa passed to `getRate` is `"oficial"`

##### Scenario: Explicit account.casa overrides the global default

- GIVEN: the authenticated user's account has `casa = "blue"`
- AND: `process.env.FX_DEFAULT_CASA` is `"oficial"`
- WHEN: the action resolves the casa and calls `getRate`
- THEN: the casa passed to `getRate` is `"blue"`

##### Scenario: FX_DEFAULT_CASA env var is honored when set

- GIVEN: the authenticated user's account has `casa = NULL`
- AND: `process.env.FX_DEFAULT_CASA = "mep"`
- WHEN: the action resolves the casa and calls `getRate`
- THEN: the casa passed to `getRate` is `"mep"`

#### REQ-FX-4: Cache key is namespaced by the rate-limit module convention

The system MUST use the cache key
`gastos-personales:fx:ars-usd:<casa>` for every `SET` and
`GET` operation. The prefix matches the rate-limit module's
`gastos-personales:ratelimit` convention. One key per casa.
No request-key fan-out (the rate is global, not per-user).

##### Scenario: First write uses the namespaced key

- GIVEN: a caller invokes `getRate("oficial")` and the cache is empty
- WHEN: the cache write happens
- THEN: the Redis key is `gastos-personales:fx:ars-usd:oficial`
- AND: a `redis-cli GET` on that key returns the JSON-encoded `FxRateCacheEntry`

##### Scenario: Different casas use different keys

- GIVEN: the cache is empty
- WHEN: a caller invokes `getRate("blue")` and another invokes `getRate("mep")`
- THEN: the Redis keys are `gastos-personales:fx:ars-usd:blue` and `gastos-personales:fx:ars-usd:mep`
- AND: neither key shadows the other

#### REQ-FX-5: Cache is a no-op when Upstash env vars are missing

The system MUST degrade to a no-cache path when
`process.env.UPSTASH_REDIS_REST_URL` or
`process.env.UPSTASH_REDIS_REST_TOKEN` is unset. In that mode,
every call to `getRate` MUST call DolarAPI directly. The
system MUST NOT throw on missing env vars; the absence is the
local-dev / CI contract. This is the only behavior change
between the two modes: caching vs. no caching. Error semantics
and the `stale: false` value on a successful DolarAPI
response are identical.

##### Scenario: Missing Upstash env vars fall through to DolarAPI

- GIVEN: `process.env.UPSTASH_REDIS_REST_URL` is unset
- WHEN: a caller invokes `getRate("oficial")`
- THEN: no `GET` or `SET` is issued to Redis
- AND: DolarAPI is called once
- AND: the caller receives the fresh `FxQuote` with `stale: false`

##### Scenario: Missing Upstash env vars do not throw at startup

- GIVEN: the process boots with no Upstash env vars
- WHEN: the DI graph is constructed
- THEN: no error is thrown
- AND: the `FxRateProvider` is registered successfully

### Display surface

#### REQ-FX-6: The balance DTO carries a stale boolean and a warnings array

The system MUST add a `stale: boolean` field to
`FinancialAccountBalanceDto`. The system MUST also populate
the existing `warnings?: string[]` array with a single string
`"FX rate is stale; showing last known value."` whenever
`stale === true`. The system MUST NOT modify the
`fxAsOf` field; the timestamp stays as the source's
timestamp regardless of staleness. The smoke widget renders
the amber chip when `stale === true` and renders
`fxAsOf` as `"Last updated: <ISO>"` (BR-ACC-18) — the two
signals are independent and both are required.

##### Scenario: Fresh response carries stale false and no warnings

- GIVEN: a cache hit within TTL for `oficial`
- WHEN: the balance endpoint is called
- THEN: the response body's `stale` field is `false`
- AND: the response body's `warnings` field is undefined

##### Scenario: Stale response carries stale true and the warning string

- GIVEN: a cache hit past TTL for `oficial`
- WHEN: the balance endpoint is called
- THEN: the response body's `stale` field is `true`
- AND: the response body's `warnings` array contains exactly one entry: `"FX rate is stale; showing last known value."`
- AND: the response body's `display.fxAsOf` is the source timestamp, not the current time

### Provider wiring

#### REQ-FX-7: The stampede lock coalesces concurrent cold-start fetches

The system MUST maintain a per-process
`Map<casa, Promise<void>>` that guards the cache-miss path.
The first caller for a given casa on a cache miss MUST insert
a `Promise<void>` and run the DolarAPI fetch. Concurrent
callers for the same casa MUST await the same promise. The
entry MUST be deleted on resolve so the next miss re-fetches.
The system MUST NOT use Redis, advisory locks, or any
cross-process coordination.

##### Scenario: Concurrent cache-miss calls for the same casa fire one fetch

- GIVEN: the cache is empty for `oficial`
- WHEN: N concurrent callers invoke `getRate("oficial")`
- THEN: exactly one outbound DolarAPI fetch is issued
- AND: every caller receives the same `FxQuote`

##### Scenario: Concurrent cache-miss calls for different casas are independent

- GIVEN: the cache is empty for `oficial` and `blue`
- WHEN: one caller invokes `getRate("oficial")` and another invokes `getRate("blue")` concurrently
- THEN: two outbound DolarAPI fetches are issued (one per casa)
- AND: neither caller blocks on the other

#### REQ-FX-8: DolarAPI base URL is hardcoded with an env-var override

The system MUST default the DolarAPI client base URL to
`https://dolarapi.com/v1`. The system MUST allow override via
`process.env.DOLAR_API_BASE_URL`. When the env var is set, the
client MUST use the override; when unset, the client MUST use
the hardcoded default. Production uses the hardcoded default.
Tests use the env var to point at a local sandbox.

##### Scenario: Default base URL when env var is unset

- GIVEN: `process.env.DOLAR_API_BASE_URL` is unset
- WHEN: the DolarAPI client is constructed
- THEN: the client targets `https://dolarapi.com/v1`

##### Scenario: Env var overrides the base URL

- GIVEN: `process.env.DOLAR_API_BASE_URL = "http://localhost:9999"`
- WHEN: the DolarAPI client is constructed
- THEN: the client targets `http://localhost:9999`

### Persistence

#### REQ-FX-9: The casa column migration is non-destructive

The Prisma migration for the new `casa` column on
`FinancialAccount` MUST add the column as
`AccountFxCasa NULL` with no default and no backfill. The
migration MUST NOT alter any existing column, MUST NOT
rewrite any existing row, and MUST NOT drop any constraint.
Existing rows MUST end up with `casa = NULL` after the
migration. The smoke UI MUST show the inherited global
default for those rows (i.e. the action's casa resolution
falls through `account.casa ?? env.FX_DEFAULT_CASA`).

##### Scenario: Migration adds the column without backfill

- GIVEN: a populated database with N existing `FinancialAccount` rows
- WHEN: the migration runs
- THEN: the `casa` column exists on `FinancialAccount` as nullable
- AND: every existing row has `casa = NULL`
- AND: no row is altered, deleted, or backfilled

##### Scenario: Existing rows render the inherited global default

- GIVEN: a `FinancialAccount` row with `casa = NULL`
- AND: `process.env.FX_DEFAULT_CASA` is unset (defaults to `oficial`)
- WHEN: the owner submits the balance widget
- THEN: the casa used by the provider is `oficial`
- AND: the converted amount renders without error

## Indexes & constraints

| Surface             | Constraint                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Cache key           | `gastos-personales:fx:ars-usd:<casa>` (lowercase casa). One entry per casa.                              |
| Cache TTL           | `EX 3600` on every `SET`. Stale = `cachedAt < now() - 1h` (Upstash authoritative).                      |
| Casa enum           | `AccountFxCasa` Prisma enum: `OFICIAL \| BLUE \| MEP \| CCL \| CRIPTO \| TARJETA` (uppercase in Prisma; lowercase in DolarAPI wire). |
| `FinancialAccount.casa` | Nullable. `NULL` = inherit global default.                                                          |
| Upstash env vars    | Both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` MUST be present for caching; missing → no-op. |
| Stampede lock scope | Per-process, per-casa. No cross-process coordination.                                                  |
| FX provider         | `FxRateProvider` (port in `accounts`); concrete `FxRateProviderDolarApi` (in `fx`).                     |

The `account.casa ?? process.env.FX_DEFAULT_CASA` resolution
order is the only casa resolution the system supports in v1.
The env var, the column, and the resolved value use the same
Zod schema for normalization, so a typo in either source
(`FX_DEFAULT_CASA=OfiCial` or `casa: "BLUE"`) is rejected at
the boundary, not silently passed to DolarAPI.

## Error semantics

| Code                  | HTTP | Trigger                                                                                                       | Caller surface                                                   |
| --------------------- | ---- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `FX_UNAVAILABLE`      | 503  | Cache miss + DolarAPI unreachable, non-2xx, or malformed payload. Zod parse failure on the wire.               | Error banner per BR-ACC-18: `"FX rate provider unavailable. Try again in a few minutes."` |
| `FX_NOT_SUPPORTED`    | 409  | The configured provider does not support the requested pair (carried from `accounts`).                         | Error banner per BR-ACC-18: `"FX conversion not supported for this pair."` |
| `FX_STALE`            | 200  | The cache returned a value past its TTL. The DTO body carries `stale: true` AND the warning string.            | Amber warning chip + `"Last updated: <ISO>"` plain text.         |

There is no fourth state. The system MUST NOT return a
synthetic rate, a `null` rate, or a 204 on a miss. The
`FX_UNAVAILABLE` mapping is owned by the central `errorHandler`
in `accounts`; the `fx` capability throws
`AppError(FX_UNAVAILABLE)` and never crafts the HTTP response
itself.

## Observability

The `fx` module emits structured log events for every provider
call and every cache operation. The exact field names and
transport are the subject of `sdd-design` (deferred). The
contract MUST be:

| Event                          | Fields (minimum)                                                   |
| ------------------------------ | ------------------------------------------------------------------ |
| Provider call — cache hit      | `casa`, `cached`, `stale`, `fxAsOf`                                |
| Provider call — cache miss     | `casa`, `cached: false`, `dolarApiLatencyMs`, `fxAsOf`             |
| Provider call — cache miss fail | `casa`, `error: "FX_UNAVAILABLE"`, `dolarApiStatus?`, `errorMessage` |
| Stale background refresh       | `casa`, `dolarApiLatencyMs`, `result: "ok" \| "fail"`              |
| Stampede coalesce              | `casa`, `concurrentCallers: N`                                     |
| Cache layer degraded (no Upstash) | `reason: "missing_env"`                                          |

Sentry capture rules (to be detailed in `sdd-design`):

- `FX_UNAVAILABLE` on cache miss: capture as `error` (no
  upstream rate to serve is a real failure).
- `FX_UNAVAILABLE` on stale refresh: capture as `warning`
  (degraded but not broken; the stale path is doing its job).
- Cache layer no-op (missing env vars): do NOT capture (this
  is the local-dev / CI contract).
- All Upstash errors: capture as `error` with the operation
  (`get` / `set`) and the casa. Never log the env var values.

## Migration

The Prisma migration for the per-account `casa` selection is
the only persistent schema change in this change.

```sql
-- non-destructive; no default; no backfill
ALTER TABLE "FinancialAccount"
  ADD COLUMN "casa" "AccountFxCasa" NULL;
```

The Prisma schema changes are additive:

- New enum `AccountFxCasa` with values `OFICIAL`, `BLUE`,
  `MEP`, `CCL`, `CRIPTO`, `TARJETA`.
- New optional column `casa AccountFxCasa?` on
  `FinancialAccount`.

The migration runs without backfill, without a default, and
without a code-level data fix. Existing rows go from
"no column" to "column is `NULL`". The smoke UI for those
rows shows the inherited global default (`oficial`) until the
user explicitly picks a different casa in the account edit
form. **No data loss.**

The DolarAPI / Upstash runtime has no migration. The
`FxRateProviderUnconfigured` stub file is deleted in the same
change; there is no in-place upgrade path because the stub
never served real data.

## Out of scope (this change)

Carried verbatim from the proposal; see
`openspec/changes/fx-cache/proposal.md` §"Out of scope" for
detail.

- EUR/ARS, USD/EUR, BRL/ARS, or any non-ARS↔USD pair.
- Multi-currency per-transaction FX.
- Per-account casa change history.
- A `MOST_RECENT` auto-picker.
- A scheduled Cron job that warms the cache every 30 minutes.
- Multi-source FX (DolarAPI + Frankfurter + a third source).
- Surfacing `warnings` in the smoke widget UI beyond the new
  `stale: boolean` chip.
- Migrating the rate-limit module's Upstash client into a
  shared `UpstashClient` factory.
- Production UI changes beyond the smoke warning chip.
- Push notifications or background jobs of any kind.

## Cross-references

- **Proposal**: `openspec/changes/fx-cache/proposal.md` — the
  upstream change that created this capability. BR-FX-1 to
  BR-FX-9 are codified here; the proposal carries the
  rationale, the alternatives considered, and the forecast.
- **Accounts spec**: `openspec/specs/accounts/spec.md` —
  BR-ACC-12 declares the read-only display contract and
  explicitly notes "FX is a presentation concern" (the line
  the user asked us to keep). BR-ACC-13 covers FX freshness.
  BR-ACC-18 covers the smoke widget rendering. The
  `stale: boolean` field added to the balance DTO here is a
  additive change co-owned by both capabilities.
- **Per-account casa delta spec**:
  `openspec/changes/fx-cache/specs/accounts/spec.md` — the
  sibling delta spec written by `sdd-spec` for the `accounts`
  capability, covering the new `casa` column on
  `FinancialAccount` and the casa resolution rule at the
  call site (BR-FX-3).
- **Future ADR (placeholder)**:
  `docs/adr/0010-dolar-api-provider.md` — to be written by
  `sdd-design`. Records the DolarAPI choice, the 1 h cache
  strategy, the per-account casa decision, and the rejected
  alternatives (Frankfurter, multi-source from day 1,
  in-memory cache, Cron warmup, DB-column FX, and the
  per-account casa alternatives: single-global-only vs.
  env-var per-account vs. column vs. `MOST_RECENT`
  auto-picker).
- **Port interface (stable input)**:
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts` —
  the interface this capability implements. Lives in
  `accounts`; `fx` depends on it (port direction is
  `fx → accounts`, not the reverse).
- **Stub being replaced (deleted in this change)**:
  `src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts`.
- **External services**: DolarAPI (https://dolarapi.com) and
  Upstash Redis (env vars `UPSTASH_REDIS_REST_URL`,
  `UPSTASH_REDIS_REST_TOKEN`).

## References

- `openspec/changes/fx-cache/proposal.md` — proposal v1.1
  (2026-06-21) with DG-FX-1 to DG-FX-5 closed.
- `openspec/specs/accounts/spec.md` — canonical `accounts`
  capability; BR-ACC-12, BR-ACC-13, BR-ACC-18.
- `openspec/changes/archive/2026-06-19-accounts-ledger/proposal.md`
  — the upstream change that declared the `FxRateProvider`
  port.
- `src/shared/errors/error-codes.ts` — `FX_UNAVAILABLE` (503),
  `FX_NOT_SUPPORTED` (409).
- `src/shared/rate-limit/rate-limit.ts` — Upstash client
  pattern reused by the cache layer.
- `openspec/config.yaml` — strict TDD rules; `pnpm test`
  runner.
- `AGENTS.md` (root) — §5.3 `pnpm-lock.yaml` policy; §13
  dual-language docs mirror policy.
