# Spec — `snapshots` capability

**Author**: Sebastián Illa
**Capability**: `snapshots`
**Source change**: (none yet — pending `snapshots-implementation`)
**Status**: stub · not yet implemented
**Created**: 2026-07-02 · **Last sync**: 2026-07-02
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 + Prisma 6 + PostgreSQL + Zod + Vitest + pnpm + Tailwind v4 (inherited from `auth-foundation`, `accounts-ledger`, `transactions`, `fx-cache`, `reports`)

> This is the first write of the `snapshots` capability spec
> and an honest stub. The capability is declared in
> `openspec/config.yaml` (`capabilities:` list) and referenced
> from `openspec/specs/accounts/spec.md` (line 42) as a future
> consumer of the `accounts` aggregate. The capability itself
> is **not yet implemented** in v0.4.x. The full requirement
> set (`REQ-SNAP-*`), business rules (`BR-SNAP-*`), and
> scenarios are deferred to the next SDD change
> (`snapshots-implementation`). This stub exists so that the
> capability has a canonical spec path, satisfies the
> artifact-layout rules in `openspec/AGENTS.md`, and other
> specs can reference it without lying.

## Purpose

The `snapshots` capability captures the user's **period-close
net worth** at a point in time. A snapshot is a read aggregate
over the user's `accounts` (FinancialAccount ledger) and
`transactions` (FX-snapshotted ledger), stamped with a date
(typically month-end) and an output currency, and persisted as
a queryable historical record. Snapshots let the user see
"net worth over time" without re-deriving the aggregate on
every read, and they underpin any future time-series UI
(`/networth`, `/networth/:id`) and any export flow.

## Status of this spec

This document is a **stub**. It exists to (a) give the
`snapshots` capability a canonical spec file at the path
declared in `openspec/AGENTS.md`, (b) make
`openspec/specs/accounts/spec.md` (and any future specs that
mention `snapshots`) truthful references rather than forward
declarations, and (c) codify the cross-module directionality
constraint that the future implementation MUST honor.

**What this stub does NOT contain:** formal requirements
(`### REQ-SNAP-*`), business rules (`BR-SNAP-*`), scenarios
(`#### Scenario: …`), route definitions, schema columns,
service signatures, or UI shapes. All of those will be
authored when the `snapshots-implementation` change enters
the SDD lifecycle (`proposal → spec → design → tasks → apply
→ verify → sync → archive`).

The author will NOT backfill stub sections with placeholder
content; the spec will graduate from stub to draft via a
dedicated change, not via inline patching of this file.

## Scope

### In scope

- Declaring the capability's existence, purpose, and the
  minimum cross-module contract other specs can rely on.
- Honoring the architecture rule "Modules isolated" from
  root `AGENTS.md` §10.5: `snapshots` reads from `accounts`
  and `transactions` via the `src/shared/domain-kernel/`
  ports, NEVER via direct imports from
  `src/modules/accounts/` or `src/modules/transactions/`.
- Providing a single load-bearing factual anchor — "this
  capability does not yet have requirements" — so that any
  future spec, ADRs, or issues can reference `snapshots`
  truthfully.

### Out of scope (deferred to `snapshots-implementation`)

- Requirements (`REQ-SNAP-1`, `REQ-SNAP-2`, …).
- Business rules (`BR-SNAP-1`, `BR-SNAP-2`, …).
- Scenarios (the `#### Scenario: …` set, per the project's
  spec convention used by `accounts/spec.md` and others).
- Route definitions (`GET /api/snapshots`, `GET /api/networth`,
  …).
- Data model additions (`Snapshot` aggregate, indexes, FX
  handling).
- Repository port, service, controller composition in
  `src/modules/snapshots/{domain,application,infrastructure}/`.
- UI surface (`/networth` chart, snapshot detail, account
  picker for the time series).
- Migration to `prisma/schema.prisma` and the matching
  migration under `prisma/migrations/`.

## Cross-module contract

The directional dependency is fixed by this stub so that any
future implementation cannot accidentally invert it:

- **`snapshots` → `accounts`** (read): snapshots read
  FinancialAccount rows via
  `src/shared/domain-kernel/AccountRepositoryPort`. The port
  surface (`FinancialAccountFields`) is already shared; the
  `snapshots` module consumes that port, NOT the `accounts`
  service or repository directly.
- **`snapshots` → `transactions`** (read): snapshots read
  Transaction rows via the kernel's transaction port
  (`TransactionDTO` is the 9-of-15 structural subset already
  shared by `reports`). Same rule — kernel port, never a
  direct module import.
- **`snapshots` → `reports`** (no direct dependency): if
  the implementation needs monthly aggregates, it derives
  them locally from the raw transaction port above. There is
  NO dependency on `src/modules/reports/`. Both `reports` and
  `snapshots` are downstream consumers of the kernel
  transaction port.
- **`accounts`, `transactions`, `reports`, `fx`, `auth`, `ui`
  ← `snapshots`** (no dependency): no other module acquires
  a dependency on `snapshots`. Snapshots is a terminal node
  in the module graph.

This set of edges is the only structural guarantee this stub
makes. Any change to the directionality requires a new spec
change, not an edit to this stub.

## Open questions (for `snapshots-implementation`)

These are the decisions the future change will close; this
stub surfaces them so they are not introduced cold.

1. **Storage shape.** Append-only `Snapshot` row
   (one per period per user) vs. materialized time-bucket
   table vs. an event-sourced stream that the `snapshots`
   module subscribes to via the existing
   `src/shared/events/` dispatcher. The choice has cascading
   effects on write semantics (idempotency on re-running a
   period close) and on read cost at large history.
2. **Time zone.** UTC midnight (consistent with the
   `reports` capability's UTC-month convention per
   `BR-RPT-3`) vs. user-local timezone (consistent with how
   the user reasons about their own money). The two are not
   equivalent at month boundaries in regions west of UTC.
3. **Display currency.** Compute and store a single display
   amount per snapshot (in the user's `displayCurrency`, with
   an FX snapshot at write time consistent with how
   `transactions` snapshots its `convertedAmountMinor`) vs.
   store native amounts per account and re-convert at read
   time (cheaper writes, more expensive reads, fresher FX).
4. **What counts as "net worth".** Sum of all financial
   account balances (regardless of `type`) vs. exclude credit
   balances vs. subtract liabilities. The current
   `AccountType` enum (`BANK`, `CREDIT`, `INVESTMENT`,
   `CRYPTO`, `CASH`, `OTHER`) supports either interpretation,
   but the spec must commit to one.
5. **Retroactivity.** Can a user request a snapshot for a
   past date by re-deriving from historical transactions
   (cheap, but FX rates for past dates need a `fx_history`
   surface that does not exist), or are snapshots strictly
   forward-only from `v0.5.0` onwards?

## Next change

The next lifecycle entry that touches this capability will be
a proposal under `openspec/changes/snapshots-implementation/`,
which will graduate this stub to a full spec by adding
`### REQ-SNAP-*`, `### BR-SNAP-*`, and `#### Scenario` blocks.
Until that change lands, this stub is the canonical spec.
