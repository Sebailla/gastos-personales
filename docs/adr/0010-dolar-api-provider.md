# ADR-0010 — DolarAPI as FX provider with Upstash 1h cache + per-account `casa`

**Status**: Accepted · **Date**: 2026-06-21 · **Deciders**: Sebastián Illa
**Refs**: `openspec/changes/fx-cache/proposal.md` (v1.1) ·
`openspec/changes/fx-cache/specs/fx/spec.md` (REQ-FX-1 to REQ-FX-9) ·
`openspec/specs/accounts/spec.md` (BR-ACC-12, BR-ACC-13, BR-ACC-18) ·
PRs #47 (proposal) and #48 (spec) on the upstream tracker ·
ADR-0009 (OAuth token encryption — sibling crypto/storage ADR; not
superseded).

## Context and Problem Statement

The `accounts-ledger` change (merged 2026-06-19) shipped a
discriminated `FinancialAccount` model with a read-only display FX
contract (BR-ACC-12) and a working smoke UI under `app/accounts/`,
but the `FxRateProvider` is a port — no implementation shipped.
The in-change stub
(`src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts`)
always throws `AppError(FX_UNAVAILABLE)`, which the central
`errorHandler` maps to HTTP 503. The user-facing consequence is
concrete: opening the account detail page and submitting the
balance widget shows the inline error
`"FX rate provider unavailable. Try again in a few minutes."`
(BR-ACC-18). The smoke UI is **not production**, but the widget is
the only end-to-end test harness for the FX contract, and 503 on
every click is a hard block on hand-validation of future changes
that consume the port (`transactions`, `reports`).

Three coupled decisions sit inside this problem:

1. **Which upstream FX source** — DolarAPI, Frankfurter,
   exchangerate.host, a BCRA scrape, or a deferral.
2. **Cache shape and freshness** — in-memory, Upstash Redis,
   DolarAPI's own caching, a Cron warmup, or none.
3. **Casa resolution rule** — global env var only, per-account
   env var, per-account column, or a `MOST_RECENT` auto-picker.

This ADR captures all three. The first two are tightly coupled
(DolarAPI's lack of SLA is the reason the cache exists); the
third is independent and is split into a sub-decision below.

## Drivers

- **Free, no API key** — the project runs as a single-developer
  expense tracker on Fly.io with a personal Fly secrets store.
  Any provider that requires a paid tier, a card on file, or a
  vendor-managed key is out.
- **ARS↔USD only in v1** — the dominant pair is Argentine peso
  to US dollar. EUR/ARS, USD/EUR, BRL/ARS are explicitly out
  (proposal §"Out of scope"); the `FxRateProvider` interface
  stays untouched so a future provider can plug in for EUR pairs.
- **No SLA on the upstream** — DolarAPI is community-run and
  publicly free; it can be down for hours without notice. The
  cache is the resilience layer.
- **Upstash Redis is already a dependency** — `auth-foundation`
  pulled in `@upstash/ratelimit` + `@upstash/redis` for the rate
  limit module (`src/shared/rate-limit/rate-limit.ts`). The cache
  module reuses the same client pattern; no new dependency.
- **Strict TDD + ≥80% coverage on `src/modules/fx/**`** per
  `openspec/config.yaml`.
- **Local-dev / CI contract: cache must be a no-op without
  Upstash** — matches the rate-limit module's
  `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` env-var
  gating. No boot-time crash if the env vars are missing.

## Considered Options

### Option 1 — DolarAPI (chosen) — https://dolarapi.com

Free, no API key, JSON. Six "casas" for ARS↔USD: `oficial`,
`blue`, `mep`, `ccl`, `cripto`, `tarjeta`. Each carries a
`venta` (sell) rate. Base URL hardcoded
`https://dolarapi.com/v1` with `DOLAR_API_BASE_URL` override.

- **Pros**: zero auth (no key rotation, no card on file, no
  vendor account). Six casas give the user a real choice.
  Returns a stable shape that's small enough (~6 fields) to
  Zod-validate. Built-in community momentum (cited in many
  Argentina-focused tutorials). Cache-friendly (1 update per
  casa per few minutes is plenty).
- **Cons**: no SLA, no uptime guarantee. Community API can
  change shape without notice. Rate-limited at the upstream's
  discretion. The blue/MEP/ccl spread is sometimes politically
  sensitive (a "blue" casa is the parallel-market USD rate).

### Option 2 — Frankfurter — https://www.frankfurter.dev

ECB-based historical FX, free, no API key. JSON.

- **Pros**: official (ECB), stable, documented API, EUR pairs
  covered cleanly.
- **Cons**: no ARS↔USD coverage with a usable rate for the
  `oficial` or `blue` casas; Frankfurter is daily-close which is
  too stale for a personal-finance balance widget that needs
  fresh FX.

Kept in the alternatives table because a future `fx-eu`
capability (EUR-based pairs) would naturally use Frankfurter.

### Option 3 — exchangerate.host

Free tier with API key, JSON. Historical + current.

- **Pros**: well-documented; many pairs.
- **Cons**: free tier is rate-limited at 250 req/month per IP;
  requires a key; ARS coverage is official-only (no blue/MEP);
  the free tier is too small for a balance widget that fires on
  every page load.

### Option 4 — Hand-rolled scraper of BCRA API

The Argentine central bank's public endpoint. Official
`oficial` only, no blue/MEP/ccl.

- **Pros**: official source for the `oficial` casa.
- **Cons**: `oficial` only; no blue/MEP/ccl; scraping is
  brittle; the BCRA API has its own undocumented rate limits.
  Doubles the surface (our scraper + BCRA's API).

### Option 5 — Defer FX entirely

Land the change as a hardcoded `oficial` rate per request, no
upstream.

- **Pros**: zero external surface; deterministic in tests.
- **Cons**: the rate goes stale the moment we merge. The user's
  real complaint (the 503) is replaced by an even worse one
  (a hardcoded rate that gets more wrong every week). This is
  what `accounts-ledger` effectively shipped.

## Decision Outcome

**Chosen**: 1 (DolarAPI) + Upstash 1 h cache + in-process
stampede lock + per-account `casa` column.

The implementation:

- `src/modules/fx/` — new module, parallel to `src/modules/accounts/`,
  with the layout `domain/entities`, `domain/ports`,
  `infrastructure/external`, `infrastructure/cache`,
  `infrastructure/external/fx-rate-provider.dolar-api.ts`.
  See the design doc for the file-by-file rationale.
- `prisma/schema.prisma` — new `AccountFxCasa` enum with values
  `OFICIAL | BLUE | MEP | CCL | CRIPTO | TARJETA`. New optional
  column `casa AccountFxCasa?` on `FinancialAccount`. The
  migration is non-destructive: `ALTER TABLE "FinancialAccount"
  ADD COLUMN "casa" "AccountFxCasa" NULL` with no default and no
  backfill.
- `src/shared/env/env.schema.ts` — adds `DOLAR_API_BASE_URL`
  (optional, defaults to `https://dolarapi.com/v1`) and
  `FX_DEFAULT_CASA` (optional, defaults to `oficial`).
- `src/modules/api/app.ts` — one-line DI swap (line 316):
  `const fxProvider: FxRateProvider = new FxRateProviderUnconfigured();`
  becomes `const fxProvider: FxRateProvider = new FxRateProviderDolarApi({ cache, env });`.
  The unconfigured stub file is deleted in the same change.

### Sub-decision — per-account `casa` column (closes DG-FX-2)

Alternatives:

1. **Single global-only** — `process.env.FX_DEFAULT_CASA` is the
   only casa knob; user picks once for the whole deployment.
2. **Env-var per-account** — separate env vars per account id
   (e.g. `FX_CASA_<accountId>`). Not maintainable.
3. **Per-account `casa` column on `FinancialAccount`** (chosen) —
   nullable, additive, no default. `NULL` means "inherit the
   global default". User picks per account in the create form
   (the existing `create-account-form.tsx`) for v1; the edit
   form is a follow-up.
4. **`MOST_RECENT` auto-picker** — at every call, hit all six
   casas and pick the one with the latest `fechaActualizacion`.
   Surprising behavior, hidden from the user, hides the user's
   preference.

Picked 3 because: (a) the column is additive (no destructive
migration; existing rows go from no-column to `NULL`); (b) the
user explicitly chose this in DG-FX-2 over a deferred follow-up;
(c) it preserves the user's right to pick `blue` for personal
accounts and `oficial` for business accounts on the same
deployment; (d) the resolution rule
`account.casa ?? process.env.FX_DEFAULT_CASA` is a one-liner at
the call site and the `FxRateProvider` stays stateless per call.

### Sub-decision — stampede lock (closes DG-FX-4)

Alternatives:

1. **No lock** — first concurrent caller wins, the rest
   re-fetch on the next request. Acceptable; not great.
2. **In-process `Map<casa, Promise<void>>`** (chosen) — the
   first caller for a given casa inserts a promise and runs the
   fetch; concurrent callers await the same promise. ~5 lines,
   per-process only.
3. **Redis lock** (`SET NX EX` per casa) — cross-process
   coordination; works in multi-instance deployments. Costs a
   Redis round-trip per cold-start fetch.
4. **DolarAPI-side deduplication** — none available; DolarAPI
   has no idempotency key.

Picked 2 because: (a) the cache + 1 h TTL caps the herd to ≤ 6
per hour per process (six casas); (b) per-process is sufficient
because multi-instance herds are bounded by N instances, not N
users; (c) the cost of a Redis lock is non-trivial for a single
cold-start; (d) the implementation is ~5 lines of `Map`
plumbing with no new dependency.

### Sub-decision — `DOLAR_API_BASE_URL` override (closes DG-FX-5)

Alternatives:

1. **Hardcoded only** — production points at the real URL;
   tests stub the DolarAPI client directly. Tests get one
   less surface to mock.
2. **Hardcoded + `DOLAR_API_BASE_URL` env override** (chosen) —
   production uses the hardcoded default (no env var to
   forget); tests set the env var to point at a sandbox.

Picked 2 because: (a) one-line env var cost; (b) tests get a
sandbox switch without importing a stub or extending the client;
(c) production cannot drift away from the canonical endpoint
unless the env var is explicitly set.

### Consequences

- **Good**: the smoke UI stops 503-ing on day 0 of the next
  change. The cache + stampede lock cap upstream calls at ≤ N×6
  per hour per process. The `FxRateProvider` interface stays
  untouched so a future provider (e.g. Frankfurter for EUR
  pairs) can ship as its own change.
- **Good**: the per-account `casa` column unlocks `blue` for
  personal accounts and `oficial` for business accounts on the
  same deployment. Existing rows migrate to `NULL` (no data
  loss) and inherit the global default until the user
  overrides.
- **Good**: Upstash is already in the deps tree (rate-limit
  module), so no new dependency; the cache module reuses the
  same env-var-gated pattern.
- **Bad**: DolarAPI has no SLA. The cache + 1 h TTL is the
  resilience layer; the stale-fallback path serves the last
  known rate when DolarAPI is down with a cold cache.
- **Bad**: DolarAPI can change shape. The `dolar-api.client.ts`
  Zod schema rejects unknown shapes with `FX_UNAVAILABLE`. The
  shape is small (~6 fields); the risk is bounded.
- **Bad**: high-inflation periods (ARS) make the 1 h TTL
  noticeable. The widget now also renders the stale chip
  (`stale: true` → amber `text-amber-600`) so the user can
  judge freshness at a glance. A future Cron warmup could
  shorten the perceived TTL; that's a follow-up.
- **Bad**: the per-process stampede lock means a multi-instance
  deployment pays N× upstream calls on a cold cache. Acceptable
  for v1 because N is small (1-2 instances in Fly.io); a
  future Redis lock could tighten this.

### Confirmation

Each consequence maps to a spec scenario that proves it:

| Consequence | Spec scenario |
| --- | --- |
| Smoke UI stops 503-ing | `REQ-FX-1` Scenario "Cache miss followed by hit within TTL" + `REQ-FX-2` Scenario "DolarAPI 5xx on cache miss throws 503" |
| Cache + stampede lock cap upstream calls | `REQ-FX-7` Scenario "Concurrent cache-miss calls for the same casa fire one fetch" |
| `FxRateProvider` interface stays untouched | `REQ-FX-3` Scenarios "NULL account.casa falls back to the global default" / "Explicit account.casa overrides the global default" (caller-side resolution; no port growth) |
| Per-account `casa` column unlocks per-account choice | `REQ-FX-3` Scenario "Explicit account.casa overrides the global default" + `REQ-FX-9` Scenario "Migration adds the column without backfill" |
| No new dependency | REQ-FX-5 Scenarios "Missing Upstash env vars fall through to DolarAPI" / "Missing Upstash env vars do not throw at startup" |
| Stale-fallback path | `REQ-FX-1` Scenarios "Stale read returns the cached value and refreshes in background" / "Background refresh failure does not surface" |
| Zod rejects unknown DolarAPI shapes | `REQ-FX-2` Scenario "DolarAPI malformed payload throws 503" |
| Stale chip | `REQ-FX-6` Scenario "Stale response carries stale true and the warning string" |
| Hardcoded URL + env override | `REQ-FX-8` Scenarios "Default base URL when env var is unset" / "Env var overrides the base URL" |
| Future provider plug-in | The `FxRateProvider` interface in `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts` is unchanged in this change; a future `FxRateProviderFrankfurter` would implement the same port. |

## Follow-ups

1. **Cron warmup** — a serverless function that hits all six
   casas every 30 minutes so the cache stays warm through quiet
   periods. Defer; the 1 h TTL is acceptable for v1.
2. **Frankfurter for EUR pairs** — a `fx-eu` capability that
   ships `FxRateProviderFrankfurter` (separate change). The
   `FxRateProvider` interface stays untouched.
3. **Per-account casa history** — audit log of "this account
   was on `blue` last month, now on `oficial`". The `casa`
   column carries only the current value. Defer.
4. **Upstash client factory** — collapse the two Upstash
   consumers (rate-limit + cache) into a single
   `UpstashClient` factory. Defer; the two consumers are tiny
   and identical in shape today.
5. **Production UI** — full casa picker, multi-currency display,
   history views. Lives in `ui-accounts`.
6. **Stampede lock for multi-instance** — Redis lock per casa
   for cross-process coordination. Defer until the second
   instance exists.