# Proposal — `fx-cache`

**Status**: implemented · **Author**: Sebastián Illa · **Created**: 2026-06-21 · **Implemented**: 2026-06-22 (PR-1 + PR-2 + PR-3 of `feat/fx-cache-{1,2,3}`)
**Target slice**: MVP-1.5 (FX provider + cache) · **Supersedes**: none
**Upstream**: global SDD preflight (interactive, both, auto-chain, 400 lines)
**Decision gaps**: DG-FX-1 to DG-FX-5 **closed** (2026-06-21). See
[Closed decisions](#closed-decisions) below for rationale per gap.

> First write of the `fx-cache` proposal. The change fills the
> `FxRateProvider` port declared by `accounts-ledger`
> (`src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`),
> ships a real provider backed by **DolarAPI**, adds a **1-hour
> Upstash Redis cache**, and exposes a graceful **stale-fallback**
> path so the smoke UI does not 503 when DolarAPI is unavailable.
> The proposal does not introduce EUR/ARS or multi-source FX; the
> `FxRateProvider` port stays open for future providers.
> **Update (2026-06-21):** the change now also ships per-account
> `casa` selection (DG-FX-2 closed as in-scope). `FinancialAccount`
> gains a nullable `casa AccountFxCasa` column + a Prisma
> `AccountFxCasa` enum. Existing rows migrate to `NULL` (inherit the
> global default of `oficial`). A new `stale: boolean` field on the
> balance DTO surfaces the warning chip in the smoke widget. A
> per-process `Map<casa, Promise<void>>` guards cold-start stampedes.
> The DolarAPI base URL is hardcoded with an env-var override.

## Why

`accounts-ledger` shipped a discriminated `FinancialAccount` model
with a read-only display FX contract (BR-ACC-12, BR-ACC-13) and a
working smoke UI under `app/accounts/`. The contract declares that
`GET /api/accounts/:id/balance?displayCurrency=…` returns
`{ native, display, warnings? }` with `fxAsOf` for freshness. The
`FxRateProvider` is a port — no implementation ships in
`accounts-ledger`. The in-change stub
(`src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts`)
always throws `AppError(FX_UNAVAILABLE)`, which the central
`errorHandler` maps to HTTP 503.

The user-facing consequence is concrete: opening the account detail
page and submitting the balance widget shows the inline error
`"FX rate provider unavailable. Try again in a few minutes."`
(BR-ACC-18). The smoke UI is **not production**, but the widget is
the only end-to-end test harness for the FX contract, and 503 on
every click is a hard block on hand-validation of future changes
that consume the port (`transactions`, `reports`).

Two product decisions drive the shape:

1. **ARS↔USD is the dominant pair in scope** (Argentine peso
   quotes). EUR/ARS is not a supported DolarAPI quote and is out of
   this change. The `FxRateProvider` port stays untouched so a
   future provider can plug in.
2. **DolarAPI has no SLA** (free public API, no contract). A 1-hour
   cache is the smallest unit that gives us: (a) burst protection
   during a thundering-herd reopen (every user hits the widget at
   the same minute), (b) stale-fallback so the widget still
   renders a converted amount when DolarAPI is down, and (c) room
   to layer a Cron-triggered refresh later without a refactor.

The cache is also a cross-cutting concern: `transactions` and
`reports` will need the same conversion logic and will benefit from
the same cache. Shipping it as its own capability (`fx`) — not as
a hidden impl inside `accounts` — is what makes the future
consumers possible.

## What

Six changes land in `fx-cache`. The change ships across **three
chained PRs** (see Forecast). All six changes MUST land before
the smoke widget can stop showing the 503.

### Change 1 — DolarAPI provider

A real `FxRateProvider` implementation that talks to DolarAPI
(`https://dolarapi.com/v1`). DolarAPI returns Argentine peso USD
quotes for six "casas": `oficial`, `blue`, `mep`, `ccl`, `cripto`,
`tarjeta`. Each casa carries a `venta` (sell) rate that we use
for the display conversion (the user is converting balances to a
display currency, which is conceptually a buy-of-display-currency
operation; for ARS↔USD the `venta` rate is the conservative pick
and matches what the smoke UI already shows when a user thinks in
USD).

- New module: `src/modules/fx/` (parallel to `src/modules/accounts/`).
  - `domain/entities/fx-quote.ts` — value object: `{ casa, buy,
    sell, fxAsOf }` plus Zod schema.
  - `domain/ports/dolar-api.port.ts` — port for the HTTP client.
  - `domain/ports/fx-rate-provider-cache.port.ts` — port for the
    cache layer that wraps the upstream provider.
  - `infrastructure/external/dolar-api.client.ts` — typed DolarAPI
    client using global `fetch` (Node 20 native). Base URL is
    hardcoded to `https://dolarapi.com/v1` with
    `process.env.DOLAR_API_BASE_URL` override (BR-FX-8). Zod
    validation; non-2xx maps to `AppError(FX_UNAVAILABLE)` (503).
  - `infrastructure/cache/upstash-fx-rate.cache.ts` — Upstash
    Redis wrapper around the DolarAPI client. Key shape
    `gastos-personales:fx:ars-usd:<casa>`, value JSON, TTL 1 h.
  - `infrastructure/external/fx-rate-provider.dolar-api.ts` —
    `FxRateProvider` impl combining cache + upstream. DI replaces
    `FxRateProviderUnconfigured` with this class.
- **Provider selection** (per-account, in-scope — see Change 5):
  the provider receives `account.casa ?? FX_DEFAULT_CASA` on every
  call from the action. The env defaults to `oficial`. The
  `casa` column on `FinancialAccount` is the new nullable
  `AccountFxCasa` enum (Change 5).
- The provider reads `process.env.UPSTASH_REDIS_REST_URL` and
  `process.env.UPSTASH_REDIS_REST_TOKEN`; when either is missing,
  the cache layer degrades to a no-op (no Redis, no error — every
  call goes straight to DolarAPI). Mirrors the pattern in
  `src/shared/rate-limit/rate-limit.ts`.
- **Cache stampede lock:** per-process in-memory
  `Map<casa, Promise<void>>` (Change 6). ~5 lines. No
  cross-process coordination.

### Change 2 — Cache layer (1 h TTL + stale fallback)

- Read path: Redis `GET key` → if hit and not stale, return.
  If hit and stale (TTL expired but value present), return with
  `warnings: ["FX rate is stale; showing last known value."]`
  AND refresh in the background (fire-and-forget Promise, no
  blocking on the response).
- Miss path: DolarAPI fetch → Redis `SET key value EX 3600` →
  return with no warning.
- DolarAPI down on miss: throw `AppError(FX_UNAVAILABLE)` (503).
  This preserves the contract: if we have never seen a rate, we
  cannot serve one.
- DolarAPI down on stale refresh: silent. The next stale read
  returns the same value with the same warning. We do NOT
  re-throw to the user.
- Key shape: `gastos-personales:fx:ars-usd:<casa>`. Single key per
  casa. No request-key fan-out (the cache is global, not per-user;
  the rate is the same for every user).

### Change 3 — Error and freshness semantics

- `FxConversionResult.warnings` is the new array carried on
  every response when the rate is stale. The DTO already
  supports it (`financial-account-balance.dto.ts`); it is
  currently always undefined.
- **`stale: boolean` is added to `FinancialAccountBalanceDto`** so
  the smoke widget can surface a Tailwind warning chip without
  parsing the `warnings` array. The widget renders
  `<span class="text-amber-600">Cotización desactualizada (hace 2h)</span>`
  when `stale === true`, alongside the existing `"Last updated: <ISO>"`
  text from BR-ACC-18 (1 file, ~15 lines in
  `app/accounts/[id]/balance-widget.tsx`). Both signals are kept:
  `fxAsOf` stays for the timestamp, `stale` is the boolean the
  chip condition uses.
- The `warnings` array stays in the DTO for future
  `ui-accounts` work (multi-warning surfaces, history, etc.).
  For v1 the smoke widget uses `stale` for the chip and ignores
  `warnings`.
- `fxAsOf` continues to carry the source timestamp. The smoke
  widget renders `"Last updated: <ISO>"` per BR-ACC-18 Decision 3.
- No new HTTP error code. `FX_UNAVAILABLE` (503) and
  `FX_NOT_SUPPORTED` (409) keep their existing semantics.
- The unconfigured stub is deleted in this change. The DI graph
  must register the real provider; if the swap is missing, the
  app boots and every call throws at first use (no DI-time
  fail-fast in this slice — flagged in Open questions).

### Change 4 — Capability boundary and DI swap

- A new capability `fx` ships its own spec at
  `openspec/specs/fx/spec.md` (created by `sdd-spec`). The
  capability declares the `FxRateProvider` contract from
  `accounts`'s perspective and the cache + DolarAPI provider
  contracts from `fx`'s perspective.
- The `accounts` capability spec gains one delta:
  BR-ACC-12 unchanged, BR-ACC-13 unchanged, BR-ACC-18 unchanged.
  The `accounts` delta only edits the wording of BR-ACC-12 to
  say "the `FxRateProvider` is a port in `src/modules/accounts/`;
  the implementation ships in the `fx` capability" (cross-link
  pointer, no behavioral change).
- The DI wiring at `src/modules/accounts/infrastructure/di.ts`
  (or equivalent) replaces
  `FxRateProviderUnconfigured` with `FxRateProviderDolarApi`.
  The unconfigured stub file is deleted.

### Change 5 — Per-account `casa` selection (DG-FX-2 closed as in-scope)

The user chose **per-account casa selection in v1**. Scope grows
by one Prisma enum + one nullable column + one UI form input.
Existing rows migrate to `NULL` (no data loss; the provider falls
back to the global default until the user explicitly overrides).

- **Prisma** (`prisma/schema.prisma`): new enum `AccountFxCasa`
  with values `OFICIAL`, `BLUE`, `MEP`, `CCL`, `CRIPTO`,
  `TARJETA`. New optional column `casa AccountFxCasa?` on
  `FinancialAccount`. Migration is `ALTER TABLE … ADD COLUMN
  "casa" "AccountFxCasa" NULL` — no backfill, no default, no
  data loss.
- **Validation:** new enum schema in the existing
  `update-account.schema.ts` (one file).
- **DTO:** account read DTO gains `casa: AccountFxCasa | null`;
  update DTO accepts the same. Balance DTO unaffected.
- **Action wiring:** `get-account-balance.action.ts` resolves
  `account.casa ?? env.FX_DEFAULT_CASA` and passes the casa to
  the provider on every call. The provider has no per-call
  global state.
- **UI:** new `<select>` in the account edit form with a
  "Default (oficial)" option representing `NULL`.
- **Capability boundary:** `accounts` owns the schema, DTO,
  action, and form; `fx` owns the DolarAPI integration and
  cache. The change is a thin column + DTO + form input in
  `accounts` plus a one-line call-site change. See
  `docs/adr/0010-dolar-api-provider.md` for alternatives
  considered (single-global-only, env-var per-account, column,
  `MOST_RECENT` auto-picker).

### Change 6 — Stampede lock (DG-FX-4 closed as in-scope)

A per-process in-memory `Map<casa, Promise<void>>` coalesces
concurrent cold-start fetches for the same casa. ~5 lines.
Per-process only (multi-instance herds are bounded by N
instances, not N users; accepted for v1). No Redis lock, no
advisory lock, no DolarAPI-side deduplication. Cache +
stampede lock together cap upstream calls at ≤ N×6 per hour per
process.

## Out of scope (this change)

- EUR/ARS, USD/EUR, BRL/ARS, or any non-ARS↔USD pair. The
  `FxRateProvider` port is left untouched so a future
  `FxRateProviderFrankfurter` (or similar) can ship as its own
  change. **Confirmed:** EUR/ARS stays out of v1 — DolarAPI does
  not quote it and the `FxRateProvider` interface does not need
  to grow a multi-pair surface for it.
- **Multi-currency per-transaction FX** (a future `transactions`
  capability may store the FX rate used at write time on each
  transaction row, but for v1 the FX surface stays read-only and
  display-only per BR-ACC-12).
- **Per-account casa change history** (audit log of "this account
  was on `blue` last month, now on `oficial`"). The `casa` column
  carries only the current value. History is a follow-up.
- **A `MOST_RECENT` auto-picker** that picks the casa with the
  latest `fechaActualizacion` from DolarAPI. The user picked the
  fixed-default `oficial` for v1.
- A scheduled Cron job that warms the cache every 30 minutes. The
  1 h TTL means the cache is warm while the app is in use and goes
  cold overnight; the first request after a quiet period pays the
  DolarAPI round-trip. A Cron warmup is a follow-up.
- Multi-source FX (DolarAPI + Frankfurter + a third source for
  resilience). Single source for v1; resilience is solved by the
  stale-fallback path, not by adding providers.
- Surfacing `warnings` in the smoke widget UI beyond the new
  `stale: boolean` chip. The DTO carries the array; the widget
  uses `stale` for the chip and ignores `warnings`.
- Migrating the rate-limit module's Upstash client into a shared
  `UpstashClient` factory. Two Upstash consumers with their own
  client construction is acceptable for v1.
- Production UI changes beyond the smoke warning chip. The
  production FX UI (full casa picker, multi-currency display,
  history views) lives in `ui-accounts`.
- Push notifications or background jobs of any kind.

## Non-goals

- **Not a multi-currency money app.** FX is display-only. The
  native balance on the row is never converted (BR-ACC-12,
  inherited). A future `transactions` change MAY convert for
  reports; storage stays single-currency.
- **Not a historical FX archive.** The cache holds the latest
  rate. Historical rates for net-worth reports are a future
  capability (`snapshots` or `reports`).
- **Not a DolarAPI replacement.** If DolarAPI goes down for 24 h,
  we serve stale; if it goes down for 7 days, the cache still
  serves stale. No fallback to another source is in this slice.
- **Not a rate-limiting change.** The existing
  `checkRateLimit` continues to gate auth endpoints. FX calls do
  not need a per-IP limit because the cache front-stops the
  upstream call.
- **Not a new HTTP framework or DI framework.** The Hono
  catch-all and the existing DI graph are unchanged.

## Users and situations

| User                        | Situation                                                                   | Touchpoint                                            |
| --------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| Developer on `accounts-ledger` | Runs `pnpm dev`, opens an account, submits the balance widget             | Smoke UI no longer 503s; conversion renders            |
| PM reviewing the FX surface | Picks a USD account, picks ARS, sees the converted amount and `fxAsOf`      | Smoke UI balance widget                                |
| Future `transactions` author | Builds `getAccountBalanceAction` for the transaction list                  | Imports `FxRateProvider` from `src/modules/accounts/`  |
| Future `reports` author      | Aggregates balances across accounts in a single display currency           | Same — `FxRateProvider` is the seam                    |
| Authenticated user (smoke)   | Looks at a USD-denominated brokerage account, wants to see it in ARS       | Balance widget                                         |

## Business rules

The change carries the existing `accounts` BRs verbatim and adds
one new BR for the cache. `accounts` BRs that the change does NOT
modify are not re-stated here; they live in
`openspec/specs/accounts/spec.md`.

1. **BR-ACC-12 (carried, edit-only).** `GET /api/accounts/:id/balance?displayCurrency=…`
   is read-only. Returns
   `{ native: { amount, currency }, display?: { amount, currency,
   fxRate, fxAsOf }, warnings?: string[] }`. Errors:
   `503 FX_UNAVAILABLE`, `409 FX_NOT_SUPPORTED`. Edit: the
   `FxRateProvider` is "a port declared in
   `src/modules/accounts/`; the implementation ships in the `fx`
   capability" (cross-link, no behavior change).
2. **BR-ACC-13 (carried).** Stale is not `5xx`. The provider
   returns the rate with `fxAsOf` even when stale.
3. **BR-ACC-18 (carried).** Smoke widget renders
   `display.fxAsOf` as `"Last updated: <ISO>"` plain text. The
   inline error copy for `FX_UNAVAILABLE` is unchanged.
4. **BR-FX-1 (NEW).** Cache TTL is 1 hour
   (`EX 3600`). After expiry, the value is "stale". The provider
   MUST return stale values with
   `warnings: ["FX rate is stale; showing last known value."]`
   on a stale read AND trigger a background refresh. Background
   refresh failure MUST NOT surface to the caller; the next read
   sees the same stale value.
5. **BR-FX-2 (NEW).** DolarAPI unavailable on cache miss throws
   `AppError(FX_UNAVAILABLE)` (503). DolarAPI unavailable on stale
   refresh is silent. There is no third state: hit-fresh,
   hit-stale, miss-no-upstream (throws).
6. **BR-FX-3 (NEW, edited 2026-06-21).** The casa used by the
   provider is `account.casa ?? process.env.FX_DEFAULT_CASA`.
   `process.env.FX_DEFAULT_CASA` defaults to `oficial` when unset.
   `account.casa` is the new nullable column on
   `FinancialAccount` (Change 5); `NULL` means "inherit global
   default". The provider receives the resolved casa on every
   call; it does not consult the env var or the column itself.
7. **BR-FX-4 (NEW).** Cache key is
   `gastos-personales:fx:ars-usd:<casa>`. The prefix matches the
   rate-limit module's `gastos-personales:ratelimit` convention.
8. **BR-FX-5 (NEW).** Cache is a no-op when Upstash env vars are
   missing. The provider still calls DolarAPI on every request
   (no caching, no error). This is the local-dev / CI contract.
9. **BR-FX-6 (NEW).** `FinancialAccountBalanceDto` carries a new
   `stale: boolean` field in addition to the existing `warnings?`
   array. `stale === true` triggers the smoke widget's Tailwind
   warning chip
   (`<span class="text-amber-600">Cotización desactualizada (hace 2h)</span>`).
   The `fxAsOf` text from BR-ACC-18 is unchanged. The widget
   ignores `warnings` for v1; the array remains for future
   `ui-accounts` work.
10. **BR-FX-7 (NEW).** A per-process in-memory
    `Map<casa, Promise<void>>` coalesces concurrent cold-start
    fetches for the same casa. The first caller for a given
    casa on cache miss inserts a promise and runs the fetch;
    concurrent callers await the same promise. The entry is
    deleted on resolve so the next miss re-fetches. No
    cross-process coordination.
11. **BR-FX-8 (NEW).** DolarAPI base URL is hardcoded as
    `https://dolarapi.com/v1` in `dolar-api.client.ts`. Tests
    and a future staging endpoint override via
    `process.env.DOLAR_API_BASE_URL`. Production uses the
    hardcoded default.
12. **BR-FX-9 (NEW).** The Prisma migration adds the `casa`
    column as `AccountFxCasa NULL` with no default and no
    backfill. Existing rows go from no-column to `NULL`. The
    smoke UI for those accounts shows the inherited global
    default (`oficial`) until the user explicitly picks a
    different casa in the account edit form. **No data loss.**

## Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/modules/fx/` | New | New module: domain entities, DolarAPI client, Upstash cache layer, stampede lock, `FxRateProvider` implementation. |
| `src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts` | Removed | Stub deleted; replaced by the real provider in `fx`. |
| `src/modules/accounts/infrastructure/di.ts` (or equivalent DI graph) | Modified | Swaps the stub for the real provider. |
| `src/modules/accounts/application/actions/get-account-balance.action.ts` | Modified | Now resolves `account.casa ?? env.FX_DEFAULT_CASA` and passes the casa to the provider. |
| `src/modules/accounts/application/dto/financial-account-balance.dto.ts` | Modified | New `stale: boolean` field on the response DTO (Change 3). |
| `src/modules/accounts/application/dto/financial-account.dto.ts` (account read DTO) | Modified | Exposes `casa: AccountFxCasa \| null` on account reads. |
| `src/modules/accounts/application/actions/update-account.action.ts` | Modified | Accepts `casa` on the update payload; validates with Zod. |
| `app/accounts/[id]/balance-widget.tsx` | Modified | Adds the Tailwind warning chip when `stale === true` (~15 lines). `fxAsOf` text unchanged. |
| `app/accounts/[id]/edit-account-form.tsx` (or equivalent) | Modified | New `<select>` for `casa` with "Default (oficial)" representing `NULL`. |
| `prisma/schema.prisma` | Modified | New `AccountFxCasa` enum + new optional `casa AccountFxCasa?` column on `FinancialAccount`. |
| `prisma/migrations/<ts>_add_account_fx_casa/migration.sql` | New | `ALTER TABLE "FinancialAccount" ADD COLUMN "casa" "AccountFxCasa" NULL`. Non-destructive. |
| `openspec/specs/accounts/spec.md` | Modified (delta) | One cross-link edit on BR-ACC-12; no behavioral change. New `casa` requirement added on account reads + updates. |
| `openspec/specs/fx/spec.md` | New | New capability spec, declared by `sdd-spec`. |
| `openspec/changes/fx-cache/proposal.md` | New | This document. |
| `openspec/changes/fx-cache/specs/fx/spec.md` | New (delta folder) | Delta spec for the new capability, created by `sdd-spec`. |
| `openspec/changes/fx-cache/specs/accounts/spec.md` | New (delta folder) | Delta spec for the per-account casa column, created by `sdd-spec`. |
| `Documents-es/openspec/...` | New + Modified | Spanish mirror of every English Markdown above. Same commit. |
| `docs/adr/0010-dolar-api-provider.md` | New | ADR for the DolarAPI choice + 1 h cache strategy + per-account casa decision (linked from the new spec). |

## Closed decisions (DG-FX-1 to DG-FX-5 — 2026-06-21)

All five decision gaps are **closed**. Detail lives in the
corresponding Change / BR section above; this is the audit
summary.

| Gap | Decision | Rationale | Where codified |
| --- | --- | --- | --- |
| DG-FX-1 | Default casa = `oficial` | Conservative pick; smoke widget already shows it per BR-ACC-18. | BR-FX-3 |
| DG-FX-2 | Per-account casa in v1 | Column is additive; user picked v1 over a deferred follow-up. | Change 5, BR-FX-3 |
| DG-FX-3 | Visible amber `stale: boolean` chip | Smallest user-visible signal that maps to one UX primitive. | Change 3, BR-FX-6 |
| DG-FX-4 | In-process `Map<casa, Promise<void>>` lock | Cheapest defense against cold-start herd; no coordination protocol. | Change 6, BR-FX-7 |
| DG-FX-5 | Hardcoded base URL + `DOLAR_API_BASE_URL` env override | One-line env-var cost; tests get a sandbox switch; production cannot drift. | BR-FX-8 |

Alternatives considered for each gap are recorded in
`docs/adr/0010-dolar-api-provider.md` (written by `sdd-design`).
EUR/ARS stays out of v1 per the `Non-goals` section.

## Acceptance criteria

The change is done when:

1. `pnpm test` runs the new `fx` domain + integration suite and
   exits 0 with ≥ 80% coverage on `src/modules/fx/**`.
2. `pnpm dev` → sign in → open a USD account → submit the balance
   widget with `displayCurrency=ARS` → the widget renders
   `display.amount`, `display.fxRate`, and
   `"Last updated: <ISO>"`. No 503.
3. With Upstash env vars unset: every call hits DolarAPI; no
   crash; the widget still renders correctly (no caching, but the
   request succeeds because DolarAPI is reachable).
4. With DolarAPI forced to 500 in a test: the cache miss path
   throws `FX_UNAVAILABLE` (503). The cache hit-stale path returns
   the stale value with `stale: true` on the DTO, the warning
   string from BR-FX-1 in `warnings`, AND the cache refreshes in
   the background.
5. Cache key inspection: `redis-cli GET
   gastos-personales:fx:ars-usd:oficial` returns the cached JSON
   after the first successful call.
6. After 1 h, a second call returns the cached value with
   `stale: true` on the DTO, the warning string in `warnings`,
   AND the cache is refreshed in the background.
7. The DI graph registers `FxRateProviderDolarApi`; the file
   `fx-rate-provider.unconfigured.ts` is deleted.
8. `openspec/specs/fx/spec.md` exists and declares BR-FX-1
   through BR-FX-9 with at least one Scenario each.
9. `openspec/specs/accounts/spec.md` BR-ACC-12 carries the new
   cross-link text to `fx`. No other BRs change.
10. `docs/adr/0010-dolar-api-provider.md` exists with Context,
    Options (DolarAPI vs. Frankfurter vs. a hard-coded table,
    plus the per-account casa alternatives: single-global-only vs.
    env-var per-account vs. column vs. MOST_RECENT auto-picker),
    Decision, Consequences.
11. `./Documents-es/openspec/changes/fx-cache/proposal.md` exists
    with the same content translated (no Chinese characters;
    verified per root `AGENTS.md` §13.3 mirror check).
12. No `pnpm-lock.yaml` drift after `package.json` is staged
    (Husky pre-commit check per root `AGENTS.md` §5.3).
13. **Per-account casa:** the `casa` column + enum migration
    runs on a populated database; existing `FinancialAccount`
    rows have `casa = NULL`; the smoke widget renders the
    inherited global default for those rows; picking a different
    casa in the account edit form persists and is reflected on
    the next balance call.
14. **Stale chip:** with the cache value past TTL, the smoke
    widget renders the amber `text-amber-600` warning chip in
    addition to the existing `fxAsOf` text.
15. **Stampede lock:** a test that fires N concurrent cache-miss
    calls for the same casa records exactly 1 outbound DolarAPI
    fetch (verified via a spy on the underlying `fetch`).
16. **Base URL override:** a test that sets
    `DOLAR_API_BASE_URL=http://localhost:9999` confirms the
    client targets the override; without the env var the client
    targets `https://dolarapi.com/v1`.

## Risks

| Risk                                                                                | Likelihood | Mitigation                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| DolarAPI goes down with a cold cache (no stale value to serve).                     | Medium     | The widget shows the 503 inline error per BR-ACC-18. Documented behavior; not a regression. A future Cron warmup removes this entirely.    |
| DolarAPI rate-limits us (no public SLA; free endpoint).                             | Low–Med    | The 1 h cache + the per-process refresh lock (BR-FX-7) cut upstream calls by ~99% in steady state. Fallback is the stale value.            |
| DolarAPI changes its response shape (it is a community API).                        | Low        | Zod validation in `dolar-api.client.ts` rejects unknown shapes with `FX_UNAVAILABLE`. The shape is small (~6 fields); the risk is bounded.   |
| `oficial` is not the right default for a personal-finance app.                      | Low        | Closed (DG-FX-1). Default is overridable per-account via the new `casa` column (BR-FX-3). Users who want `blue` set it on the account.    |
| The cache becomes a source of staleness in high-inflation periods (ARS).            | Medium     | 1 h TTL matches DolarAPI's typical update cadence for the `oficial` and `blue` casas. The widget now also renders the stale chip.          |
| The Upstash client duplication (rate-limit module + new cache module) drifts.       | Low        | A shared `UpstashClient` factory is a follow-up; the two consumers are tiny and identical in shape today.                                    |
| The new capability `fx` is mistaken for a money-conversion feature, not a port.     | Low        | The proposal is explicit about scope (display-only, ARS↔USD, single source, per-account override). Spec carries the same language.         |
| The change is ~800 lines and exceeds the 400-line review budget.                    | High       | Auto-chain across three PRs (see Forecast). PR #1 = `fx` module + tests; PR #2 = per-account schema + UI; PR #3 = DI swap + spec + ADR.     |
| The DI swap leaves a window where neither the stub nor the real provider is wired.  | Low        | The per-account wiring is staged before the DI swap; a feature flag on `FX_DEFAULT_CASA` keeps the stub wired until PR #3 merges.            |
| **The per-account `casa` migration runs against an existing populated database** with N FinancialAccount rows. | Low | The migration is `ADD COLUMN casa AccountFxCasa NULL` — non-destructive. No backfill, no default value. The smoke UI must show the inherited global default until the user explicitly overrides it (no auto-migration of existing rows to `oficial`). The smoke runbook includes a manual `SELECT count(*) WHERE casa IS NULL` check post-migration. |
| **The casa enum mapping** (Prisma `OFICIAL` ↔ DolarAPI `oficial`) drifts if DolarAPI renames a casa. | Low | The mapping is centralized in one module (`dolar-api.client.ts`) and unit-tested against every casa. A casa rename requires a deliberate code + DTO + Zod edit. |
| **The casa enum and the existing `OFICIAL` string in env vars get out of sync.** (`FX_DEFAULT_CASA=oficial` vs. `AccountFxCasa.OFICIAL`) | Low | The provider normalizes both sources through one Zod schema (`fx-casa-string.schema.ts`) that accepts the lowercase DolarAPI form and rejects anything else. Unit-tested for both code paths. |

## Rollback

- **PR not merged**: `git branch -D feat/fx-cache-*`,
  `git worktree remove`.
- **PR #1 merged, PR #2 not yet**: revert PR #1. The
  `fx-rate-provider.unconfigured.ts` stub still exists in `develop`
  and the DI graph still wires it; restoring `develop` to pre-PR-1
  is clean.
- **PR #2 merged, pre-release**: revert PR #2. Re-add the stub,
  re-wire DI. The new `src/modules/fx/` module is additive and
  can stay on disk or be deleted as a separate step; it has no
  callers once DI is reverted.
- **PR released to production**: stop. This release is governed
  by the release flow (root `AGENTS.md` §5.5) which requires
  user approval. No automatic rollback path is documented here.
- **DolarAPI incident post-release**: no rollback needed. The
  stale-fallback path serves the last known rate with the
  warning string. The widget is degraded but functional.

## Dependencies

- **Inbound**: `accounts-ledger` (shipped). The
  `FxRateProvider` interface lives at
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`.
  The `get-account-balance.action.ts` consumes `deps.fxRateProvider`.
  Both are stable inputs.
- **Outbound**: `transactions`, `reports`, `snapshots` (future).
  Each will consume `FxRateProvider` for native-to-display
  conversions. The new `fx` capability is the seam.
- **External**: DolarAPI (`https://dolarapi.com`). Free, no API
  key, returns JSON. No SLA. Public service run by the community.
- **External**: Upstash Redis (already a dependency of
  `auth-foundation` via `@upstash/ratelimit` and
  `@upstash/redis`). The cache module reuses the same client
  pattern.
- **No co-PRs**: `fx-cache` does not block any in-flight change.
  `accounts-ledger` is already merged. `transactions` is not yet
  scoped.

## Capabilities

> This section is the CONTRACT between this proposal and
> `sdd-spec`. The next phase reads this to know exactly which
> spec files to create or update.

### New capabilities

- `fx`: the new capability owns the `FxRateProvider`
  implementation (DolarAPI client + Upstash cache), the cache
  contract, the stale-fallback contract, and the casa selection
  default. `accounts` continues to own the port interface and the
  read-only display endpoint; `fx` owns the upstream integration
  and the cache. The two capabilities communicate via the
  existing `FxRateProvider` interface in
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`
  — the dependency points from `fx` to `accounts`'s port, never
  the reverse, preserving the ports-and-adapters invariant.

### Modified capabilities

- `accounts`: the spec gains two deltas — (a) a one-sentence
  cross-link edit on BR-ACC-12 to point at the `fx` capability
  (no behavioral change), and (b) the new `casa AccountFxCasa?`
  column requirement on `FinancialAccount` plus the
  `account.casa ?? FX_DEFAULT_CASA` resolution rule on
  `GET /api/accounts/:id/balance`. The behavior change is
  confined to which casa the provider uses; the DTO shape gains
  no new required field (only an optional `casa` on the account
  read DTO and `stale: boolean` on the balance DTO). The change
  ships as a delta in
  `openspec/changes/fx-cache/specs/accounts/spec.md`.

## Alternatives considered

1. **Frankfurter** (https://www.frankfurter.dev) — ECB-based
   historical FX, free, no API key. Rejected for v1 because (a)
   Frankfurter does not cover ARS↔USD with a usable rate for the
   "oficial" or "blue" casas; (b) Frankfurter is daily-close,
   which is too stale for a personal-finance balance widget. Kept
   in the alternatives table because a future `fx-eu` capability
   (EUR-based pairs) would naturally use Frankfurter.
2. **Provider abstraction with multiple sources from day 1**
   (DolarAPI + Frankfurter + a hard-coded ARS fallback table).
   Rejected because the abstraction is over-engineering for a
   single-source v1. The `FxRateProvider` interface already gives
   us the seam to add sources later.
3. **In-memory cache** (`Map<casa, { rate, ts }>` per Node
   process). Rejected because (a) it does not survive a deploy
   (the cache is cold after every release), (b) it is per-process
   so a multi-instance deployment pays N× DolarAPI calls, and
   (c) the rate-limit module already uses Upstash, so the client
   pattern is in-tree.
4. **Cron-triggered cache warmup** (a serverless function that
   refreshes every 30 minutes). Deferred to a follow-up. The 1 h
   TTL is sufficient for v1 because the first request after a
   cold cache pays the upstream cost once and serves every
   subsequent request for the hour.
5. **Push the FX rate into a DB column on `FinancialAccount`**
   (compute the conversion at write time). Rejected because it
   violates BR-ACC-12 (storage is never converted) and would
   require a re-conversion job every minute to be useful in
   high-inflation periods.
6. **Extend `accounts` instead of creating a new capability**
   `fx`. Considered and rejected: (a) the cache is consumed by
   future capabilities, not just `accounts`; (b) the `openspec/`
   layout already reserves `specs/fx/`; (c) the
   `FxRateProvider` port stays in `accounts` regardless (it is
   the consumer-facing seam), so the new `fx` capability is
   purely additive on the implementation side.

## Forecast (auto-chain, 400-line budget)

| PR  | Scope                                                                                                                                                | Approx. lines | Status |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| 1   | New `src/modules/fx/` module: DolarAPI client + Upstash cache + stampede lock + `FxRateProvider` impl + domain unit tests + integration tests       | ~600          | Auto   |
| 2   | Per-account casa: Prisma enum + nullable column + migration + Zod validation + account edit form `<select>` + account DTO + action update         | ~300          | Auto   |
| 3   | DI swap (stub deletion) + balance action wires `account.casa ?? FX_DEFAULT_CASA` + `stale` chip in smoke widget + `accounts` spec delta + `fx` spec + ADR-0010 + ES mirror | ~250    | Auto   |
|     | **Total**                                                                                                                                            | **~1150**     |        |

PR #1 is over the 400-line review budget. The orchestrator
auto-chains (per session preflight). PR #1 is a self-contained
slice that does not touch any consumer; PR #2 adds the
per-account casa column and form (the provider still falls back
to the env-var default because `account.casa` is `NULL` for all
rows at this point); PR #3 is a DI swap + the smoke widget chip
+ spec creation that turns the new provider on with full
per-account selection. A reviewer can land PR #1 and PR #2
without risk to the smoke UI; PR #3 flips the DI wire and adds
the visible warning chip.

## Audit trail

- **v1** (this proposal, 2026-06-21) — DolarAPI + Upstash 1 h
  cache + stale fallback + new `fx` capability. No changes to the
  `accounts` port. First write of the change.
- **v1.1** (this proposal, 2026-06-21 same-day edit) — DG-FX-1
  to DG-FX-5 closed by the user:
  - DG-FX-1: default casa `oficial`.
  - DG-FX-2: per-account casa in v1 (new column + enum).
  - DG-FX-3: visible warning chip via new `stale: boolean` DTO.
  - DG-FX-4: in-process `Map<casa, Promise<void>>` stampede lock.
  - DG-FX-5: hardcoded base URL + `DOLAR_API_BASE_URL` env override.
  Scope grew from ~497 to ~700 lines. New BRs: BR-FX-6 to
  BR-FX-9. New affected area: `prisma/schema.prisma` + Prisma
  migration. Forecast grew from 2 PRs to 3 PRs (~1150 lines
  total).

Refs:

- `openspec/changes/archive/2026-06-19-accounts-ledger/proposal.md`
  — the upstream change that declared the port.
- `openspec/specs/accounts/spec.md` — BR-ACC-12, BR-ACC-13,
  BR-ACC-18 (carried verbatim into this proposal).
- `src/shared/rate-limit/rate-limit.ts` — Upstash client pattern
  reused by the cache module.
- `src/shared/errors/error-codes.ts` — `FX_UNAVAILABLE` (503),
  `FX_NOT_SUPPORTED` (409).
- `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`
  — the port the new implementation satisfies.
- `src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts`
  — the stub this change deletes.
- DolarAPI: https://dolarapi.com (no API key, no SLA, JSON).
- Upstash Redis: https://upstash.com (REST API; env vars
  `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).
