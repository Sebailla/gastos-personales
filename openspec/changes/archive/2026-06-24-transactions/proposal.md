# Proposal — `transactions`

**Status**: implemented · **Author**: Sebastián Illa · **Created**: 2026-06-22 · **Implemented**: 2026-06-24 (slices 1-5 of `feat/transactions-{entity,fx-snapshot,actions,persistence,api}` merged on `develop` via #59, #60, #61, #62, #63; archived as 2026-06-24-transactions)
**Target slice**: MVP-2 (transaction ledger)
**Upstream**: `openspec/changes/transactions/explore.md` (2026-06-22)
**Upstream**: global SDD preflight (interactive, both, auto-forecast, 400 lines)
**Decision gaps**: DG-TX-1, DG-TX-4, DG-TX-5, DG-TX-6, DG-TX-7, DG-TX-8, DG-TX-9,
DG-TX-10, DG-TX-12, DG-TX-13, DG-TX-14, DG-TX-15 **closed (2026-06-22)**.
DG-TX-2, DG-TX-3, DG-TX-11 **locked at pre-propose grill (2026-06-22)** —
carried as binding input. See [Closed decisions](#closed-decisions-dg-tx-n--2026-06-22)
for the audit summary.

> First write of the `transactions` proposal. The change introduces
> the **transaction ledger** capability: manual expense registration
> (CRUD) plus multi-currency via the `fx` module's `FxRateProvider`,
> scoped to a single account per transaction. **v1 ships the core
> CRUD + multi-currency path; attachments and recurrence are
> deferred to v1.1+ of the same change.** A v1 smoke UI mirrors
> the `app/accounts/` pattern so the manual CRUD flow can be
> validated end-to-end without curl. The `Transaction` aggregate
> is new; the FX snapshot lives on the row (`originalAmount`,
> `originalCurrency`, `convertedAmount`, `convertedCurrency`,
> `fxAsOfSnapshot`, `casaSnapshot`) so historical totals are
> deterministic. The module is `src/modules/transactions/`,
> following the `src/modules/accounts/` shape (domain / application
> / infrastructure; ports & adapters; public barrel).

## Why

`accounts-ledger` and `fx-cache` shipped the account registry and a
read-only display FX surface. The personal-finance product gap is
the **transaction ledger** itself: there is no way to record an
expense or an income against an account. The `fx-cache` spec at
`openspec/specs/fx/spec.md:95-98` explicitly contemplates this:

> "a future `transactions` capability MAY store the FX rate used at
> write time on each transaction row, but for v1 the FX surface
> stays read-only and display-only per BR-ACC-12."

The user-facing consequence is concrete: there is no place to
write down what was spent or received. Even a smoke widget that
shows an account balance cannot be sanity-checked against an
actual transaction history. This blocks `reports` (no
aggregations possible), blocks `snapshots` (no net-worth trace
over time), and blocks any product narrative for the app.

Two product decisions drive the shape of v1:

1. **Single-account per transaction in v1.** Transfers between two
   accounts (the `Transfer` aggregate or `transferGroupId` link) are
   deferred to v1.1. This keeps the schema, the service, and the
   write path small and unambiguous; it also defers the hardest
   consistency question (atomic two-row writes) until the core
   CRUD pattern has landed and we have seen it work.
2. **FX snapshot at write time.** The `Transaction` row carries
   the converted amount alongside the original. This makes
   historical totals deterministic — a balance computed for last
   month uses the same rate the transaction was written with — and
   it does NOT mutate the native account balance (BR-ACC-12
   inherited). The conversion call goes through the existing
   `FxRateProvider` port at `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts:90-100`,
   reusing the casa-resolution call site at
   `src/modules/accounts/application/actions/get-account-balance.action.ts:67-100`.

The locked Slice 1 scope is **the `Transaction` aggregate + CRUD +
multi-currency via the `fx` module + smoke UI**. Attachments and
recurrence come after Slice 1 lands (separate slices of the same
change).

## What

Six changes land in `transactions` Slice 1. The change ships
across **two chained PRs** (see Forecast): PR-1A is the entity

- repository + service + tests; PR-1B is the Hono routes +
  DI wiring + smoke UI.

### Change 1 — `Transaction` aggregate and storage

- New Prisma model `Transaction` in `prisma/schema.prisma`
  with the minimum v1 fields (the spec phase codifies the full
  schema, the BRs, and the scenarios):
  - Identity: `id: String @id @default(cuid())`.
  - Ownership: `userId` (FK to `User.id`,
    `onDelete: Cascade` per the `FinancialAccount.userId` invariant
    at `prisma/schema.prisma:214`), `accountId` (FK to
    `FinancialAccount.id`, `onDelete: Cascade`).
  - Direction: `direction: TransactionDirection` (Prisma enum,
    `INCOME | EXPENSE`; `TRANSFER` is reserved for v1.1 and not
    used in v1 writes — DG-TX-12).
  - Amount (native): `amountMinor: Int`, **always positive**;
    the `direction` carries the sign. Convention follows the
    "no negative amounts" rule from money value objects
    (positive = magnitude, sign from `direction`).
  - Amount (converted): `convertedAmountMinor: Int` plus
    `convertedCurrency: AccountCurrency` populated by the FX
    call at write time. When the native currency equals the
    account's `casa`, the converted column mirrors the native
    column and the FX call is skipped.
  - FX snapshot: `fxAsOfSnapshot: DateTime` and
    `casaSnapshot: AccountFxCasa` (the UPPERCASE Prisma form),
    both populated only when a conversion happens.
  - Free-form fields: `memo: String?` (optional, ≤ 500 chars
    by Zod — no PII denylist in v1 per DG-TX-11).
  - Categorisation: `category: String?` (free-form string in v1
    per DG-TX-4; no `TransactionCategory` table).
  - Lifecycle: `transactionDate: DateTime` (NOT in the future per
    DG-TX-13), `createdAt: DateTime`, `updatedAt: DateTime`.
  - **No `archivedAt` column.** v1 ships **hard delete** per
    DG-TX-15 (the row is gone; no recovery). The list query has
    no `archivedAt: null` filter. The decision is the cheapest
    path; `accounts` soft-archives because accounts outlive
    transactions, but transactions are disposable.
- Indexes (DG-TX-14):
  - `@@index([userId, transactionDate])` — list endpoint.
  - `@@index([accountId, transactionDate])` — per-account list.
- Migration is non-destructive (no column drops, no row rewrites
  per the same pattern as `add_account_fx_casa`; see
  `openspec/specs/fx/spec.md:474-484` for the precedent).

### Change 2 — Module skeleton (`src/modules/transactions/`)

The new module follows the `accounts` shape exactly
(`src/modules/accounts/`):

- `domain/entities/transaction.ts` — entity + constructor + Zod
  schema. Mirrors `financial-account.ts:78-86` for the enum
  pattern. Carries no infrastructure types.
- `domain/interfaces/transaction.repository.port.ts` — mirrors
  `src/modules/accounts/domain/interfaces/account.repository.port.ts`
  (4-5 methods: `findById`, `list`, `count`, `create`, `update`,
  `delete`). Each method takes `userId` as a required argument
  and includes it in every WHERE clause (the cross-module
  invariant from `account.repository.port.ts:117-155`).
- `domain/services/transaction.service.ts` — pure domain logic;
  depends on the repository port + `Clock` (from
  `src/shared/clock/clock.port.ts:22-24`) + `FxRateProvider` (from
  `@/modules/accounts`). Throws `AppError` for domain failures
  (`NOT_FOUND`, `INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`,
  `ACCOUNT_ARCHIVED`).
- `application/actions/{list,get,create,update,delete}-transaction.action.ts` —
  five actions; each follows the canonical shape at
  `src/modules/accounts/application/actions/create-account.action.ts`
  (`safeParse → read userId from Hono context → call service →
catch AppError → ActionResult`). Helpers from
  `src/modules/accounts/application/actions/_shared.ts`
  (`zodErrorToActionError`, `appErrorToActionError`, `ActionResult`)
  are NOT imported directly (modules-isolated rule, root
  `AGENTS.md` §10.5); the new file has its own `_shared.ts` copy.
- `application/dto/transaction.dto.ts` — `toTransactionDto(row)`
  mirroring `src/modules/accounts/application/dto/financial-account.dto.ts`.
- `application/validation/transaction-create.schema.ts` —
  `z.discriminatedUnion` on `direction` (INCOME / EXPENSE) so
  the per-direction rules can diverge later (mirrors
  `account-create.schema.ts:38-49`).
- `infrastructure/repositories/transaction.repository.prisma.ts` —
  the Prisma adapter. Uses
  `asPrismaDelegateView(prisma()).transaction`
  (helper at `src/shared/db/prisma-types.ts`). Translates
  `Prisma.PrismaClientKnownRequestError` with `code: 'P2002'` to
  `AppError(NAME_TAKEN)` if a unique constraint is added later
  (not in v1; transactions have no natural unique key other than
  `(userId, idempotencyKey)` which is opt-in — DG-TX-9).
- `index.ts` — minimal barrel: the entity, the port interface,
  the service class, the enum constants. No infrastructure
  exports (the rule from `src/modules/accounts/index.ts:27-64`).

### Change 3 — Hono routes (mounted in the protected sub-app)

Five routes under `/api/transactions`, plus one filtered-by-account
list route. All routes mount on the existing `protectedApp`
(`src/modules/api/app.ts:192-312`) so they inherit `requireSession`
and `c.get('user')` narrowing to `AuthUser`. The pattern mirrors
the seven `accounts` routes at `src/modules/api/app.ts:222-306`.

| Method   | Path                                   | Behavior                                                                                                                  |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/transactions`                    | Cursor-paginated list (`?cursor=...&limit=...&accountId=...`); mirrors `list-accounts.action.ts` cursor shape (DG-TX-14). |
| `POST`   | `/api/transactions`                    | Create one transaction. Returns the row + a non-null `convertedAmount` in the account's `casa`.                           |
| `GET`    | `/api/transactions/:id`                | Read one. 404 on cross-user.                                                                                              |
| `PATCH`  | `/api/transactions/:id`                | Partial update. Recomputes the FX snapshot only if `amountMinor` or `currency` changed.                                   |
| `DELETE` | `/api/transactions/:id`                | Hard delete. No recovery (DG-TX-15).                                                                                      |
| `GET`    | `/api/transactions/account/:accountId` | Filtered list, same cursor shape.                                                                                         |

The route file is `app/api/[...path]/route.ts` (already mounted at
the catch-all; `transactions` adds NO new file there per the
constraint at `openspec/changes/transactions/explore.md:81`).

### Change 4 — DI wiring

The composition root at `src/modules/api/app.ts:317-352`
(`buildDefaultDeps`) gains two new entries:

- `transactionService`: built from a Prisma-backed
  `TransactionRepositoryPrisma` plus the existing
  `fxRateProvider` (already in `deps`, lines 89-97) plus
  `systemClock` (already imported at line 74).
- `transactionRepository`: passed into `transactionService` (the
  service is constructed at startup the same way the `AccountService`
  is, `app.ts:116-124`).

The protectedApp mounts the six new routes after the seven
accounts routes (between line 306 and line 312). The DI graph
test (`src/modules/api/app.deps.test.ts`) and the protectedApp
test (`src/modules/api/app.accounts.test.ts`) gain a parallel
`app.transactions.test.ts` covering the six routes against
in-memory fakes (per the pattern of `accounts`).

### Change 5 — Smoke UI

Three pages mirroring the `app/accounts/` pattern
(`app/accounts/page.tsx`, `app/accounts/new/page.tsx`,
`app/accounts/[id]/page.tsx`):

- `app/transactions/page.tsx` — list page; same
  `// smoke-minimal, not production` header comment.
- `app/transactions/new/page.tsx` — create form; consumes the
  account list + the FX-provider-resolved `casa` per account
  to surface the converted amount preview.
- `app/transactions/[id]/page.tsx` — detail page; renders
  `originalAmount`, `originalCurrency`, `convertedAmount`,
  `convertedCurrency`, and `fxAsOfSnapshot`.

The pages call the Hono API via `serverHonoRequest` (the in-process
server-side fetch helper). None of the new pages is added to
`proxy.ts:24-32` `PUBLIC_PATHS`; the 307 redirect to
`/auth/signin?callbackUrl=...` is the auth gate.

### Change 6 — Error codes, observability, and event surface

- **New error codes** added to
  `src/shared/errors/error-codes.ts:12-43`:
  - `INVALID_AMOUNT` → 400 (non-positive `amountMinor`,
    negative after sign-from-direction derivation, or
    non-finite).
  - `FUTURE_DATE_NOT_ALLOWED` → 400 (`transactionDate > now()`).
  - `ACCOUNT_ARCHIVED` → 409 (the parent `FinancialAccount` is
    archived; v1 rejects new writes against archived accounts).
  - `ACCOUNT_NOT_FOUND` (the action layer's pre-check) reuses
    `NOT_FOUND`; no new code.
- **No new HTTP status codes.** All new codes map to existing
  statuses (400, 409). The central
  `src/shared/http/error-handler.ts:34-103` picks them up
  unchanged.
- **Structured log events** added to
  `src/shared/logger/logger.ts` per the convention at
  `fx-rate-provider.dolar-api.ts:66-128`:
  - `transactions.create` — `{ userId, accountId, direction, amountMinor, currency, casa, fxAsOf }`.
  - `transactions.update` — `{ userId, id, fieldsChanged[], fxRecomputed }`.
  - `transactions.delete` — `{ userId, id }`.
  - `transactions.fx.convert` — `{ userId, casa, native, display, fxAsOf, stale }`.
- **Domain event** `TransactionRecorded` added to the union at
  `src/shared/events/event-dispatcher.ts:3-5`. The payload
  carries `{ userId, transactionId, accountId, direction,
amountMinor, currency, casa, convertedAmountMinor,
convertedCurrency, occurredAt }`. No subscriber ships in v1;
  the union grows so future `reports` / `snapshots` can subscribe
  without an interface change.

### Out of scope (this change)

- **Transfers between two accounts** (DG-TX-2 locked to v1.1).
  v1 is single-account only; the `Transfer` aggregate or
  `transferGroupId` link is not designed.
- **Attachments** (receipts, invoices). The `Attachment` table,
  `AttachmentStorage` port, `LocalDiskAttachmentStorage` adapter,
  and `ATTACHMENTS_DIR` env var do not ship in v1.
- **Recurrence** (DG-TX-6, DG-TX-7 deferred to v1.1). No
  `RecurrenceRule` table, no on-demand generator, no Cron worker.
  Recurrence uses **domain-level frequency** (`frequency`,
  `interval`, `byMonthDay`, `byDay`) generated **on-demand at
  dashboard load** when it ships.
- **Idempotency keys** (DG-TX-9 — see Closed decisions below for
  the v1 shape).
- **Bank import / CSV upload.** A bulk-import endpoint with
  idempotency is a v1.1 candidate.
- **OCR on receipts.** Out of v1.
- **Push notifications.** Out of v1.
- **Multi-user / shared accounts / read-only viewer**
  (DG-TX-10 confirmed single-user).
- **Mobile app.** Out of v1.
- **Background workers / BullMQ.** Out of v1.
- **Historical FX archive for back-dated transactions.** The
  DolarAPI snapshot at write time is the rate at the moment of
  write; there is no back-dated rate lookup. A back-dated
  transaction uses today's rate, not the rate on the transaction
  date (this is documented behavior; the UI surfaces
  `fxAsOfSnapshot` so the user can see when the rate was
  captured).
- **AI categorization.** Out of v1.
- **Budget rules / spending limits.** Out of v1 (`reports`
  territory).
- **Production UI.** The smoke UI under `app/transactions/` is
  smoke-minimal; a production-quality UI is `transactions-ui`,
  a separate change.

## Non-goals

- **Not a money-conversion engine.** The FX snapshot is captured
  once, at write time. There is no re-conversion job, no
  historical FX archive, and no retroactive re-rating.
- **Not a new FX provider.** The `FxRateProvider` is consumed
  unchanged. No new rate sources, no new pairs, no multi-source
  resilience.
- **Not a new HTTP framework or DI framework.** The Hono
  catch-all at `app/api/[...path]/route.ts:7-25` and the DI graph
  in `src/modules/api/app.ts` are extended, not replaced.
- **Not a new auth model.** Every endpoint scopes to
  `userId` (no row-level security in MVP per
  `openspec/specs/auth/spec.md:644-647`); no `viewer` permission.
- **Not a new migration framework.** The Prisma migration is a
  single additive file (mirrors `add_account_fx_casa` precedent).
- **Not a re-design of the `accounts` schema.** The new
  `Transaction` table is the only schema change in this change.

## Users and situations

| User                      | Situation                                                                                                                                                                                               | Touchpoint                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Authenticated user        | Records an expense: opens `app/transactions/new`, picks the bank account, types the amount in USD, picks the date, submits. The row is created with the converted ARS amount snapshotted at write time. | Smoke UI; `POST /api/transactions`              |
| Authenticated user        | Reviews last week's spending: opens `app/transactions`, filters by account and date range.                                                                                                              | Smoke UI; `GET /api/transactions?accountId=...` |
| Authenticated user        | Corrects a typo: opens the transaction, edits the `memo`, saves. The amount and currency are unchanged so the FX snapshot is NOT recomputed.                                                            | Smoke UI; `PATCH /api/transactions/:id`         |
| Authenticated user        | Deletes a duplicate transaction: opens the detail page, hits delete. The row is gone; no archive, no recovery (DG-TX-15).                                                                               | Smoke UI; `DELETE /api/transactions/:id`        |
| Future `reports` author   | Subscribes to `TransactionRecorded` to recompute monthly totals.                                                                                                                                        | `src/shared/events/event-dispatcher.ts`         |
| Future `snapshots` author | Reads `Transaction` rows at month-end to write a net-worth snapshot.                                                                                                                                    | `TransactionRepositoryPort`                     |

## Business rules

The change carries the existing `accounts` and `fx` BRs verbatim
and adds one new BR family (`BR-TX-N`) for the `Transaction`
aggregate. The list below names the binding rules; the spec phase
writes the full Scenarios.

1. **BR-ACC-12 (carried).** Storage is never converted. The native
   `FinancialAccount.openingBalanceMinor` and the
   `Transaction.amountMinor` are stored as-is. The converted
   amount on a transaction is a snapshot, not a mutation of the
   native value. (Source: `openspec/specs/accounts/spec.md`,
   `openspec/specs/fx/spec.md:314-323`.)
2. **BR-ACC-13 (carried).** Stale FX is not a 5xx. The
   `FxRateProvider` returns the rate with `fxAsOf` even when
   stale; the transaction write surfaces the snapshot timestamp
   in the response.
3. **BR-FX-3 (carried).** Casa resolution is the caller's
   responsibility. The `TransactionService` resolves
   `account.casa ?? env.FX_DEFAULT_CASA` at the action site,
   never inside the provider.
4. **BR-TX-1 (NEW).** `Transaction.amountMinor` is always
   positive; the sign comes from `direction`. A non-positive
   value at the API boundary is rejected with `INVALID_AMOUNT`
   (400).
5. **BR-TX-2 (NEW).** `direction` is one of `INCOME | EXPENSE`
   in v1. The `TRANSFER` enum value is reserved for v1.1 and is
   rejected at the API boundary in v1.
6. **BR-TX-3 (NEW).** `Transaction.transactionDate` is never in
   the future relative to `Clock.now()`. A future date at the
   API boundary is rejected with `FUTURE_DATE_NOT_ALLOWED` (400).
7. **BR-TX-4 (NEW).** Every cross-module reference to a
   transaction scopes to `userId`. There is no `findById(id)` API;
   `findById(userId, id)` returns `null` on miss OR cross-user.
8. **BR-TX-5 (NEW).** A `Transaction` cannot be created against
   an archived `FinancialAccount`. The action layer pre-checks
   `account.archivedAt` and rejects with `ACCOUNT_ARCHIVED` (409).
9. **BR-TX-6 (NEW).** The converted amount is captured at write
   time. When `transaction.currency === account.casa` currency,
   the FX call is skipped and `convertedAmountMinor` mirrors
   `amountMinor` and `fxAsOfSnapshot` is `null`.
10. **BR-TX-7 (NEW).** Hard delete is the v1 policy. There is no
    `archivedAt` column on `Transaction`; `DELETE` removes the
    row permanently.
11. **BR-TX-8 (NEW).** `memo` is optional. No min length, no PII
    denylist in v1. Max length 500 chars enforced by Zod.
12. **BR-TX-9 (NEW).** `category` is a free-form string (no
    `TransactionCategory` table in v1).
13. **BR-TX-10 (NEW).** Pagination is cursor-based
    (`?cursor=...&limit=...`), matching `list-accounts.action.ts`.
    `limit` is clamped to `1..100` at the API boundary.
14. **BR-TX-11 (NEW).** The `TransactionRecorded` domain event is
    emitted after a successful create. The payload includes the
    converted amount and the snapshot timestamp.

## Affected areas

| Area                                                       | Impact         | Description                                                                                                                 |
| ---------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                     | Modified       | New `Transaction` model + new `TransactionDirection` enum + indexes.                                                        |
| `prisma/migrations/<ts>_add_transaction/migration.sql`     | New            | Additive: new table, new enum, new indexes. Non-destructive.                                                                |
| `src/modules/transactions/`                                | New            | New module mirroring `src/modules/accounts/` shape.                                                                         |
| `src/modules/api/app.ts`                                   | Modified       | DI wiring (`buildDefaultDeps`) adds `transactionService` + `transactionRepository`; protectedApp mounts six new routes.     |
| `src/modules/api/app.transactions.test.ts`                 | New            | Route tests against in-memory fakes (mirrors `app.accounts.test.ts`).                                                       |
| `app/transactions/page.tsx`                                | New            | Smoke-minimal list page.                                                                                                    |
| `app/transactions/new/page.tsx`                            | New            | Smoke-minimal create form.                                                                                                  |
| `app/transactions/[id]/page.tsx`                           | New            | Smoke-minimal detail page.                                                                                                  |
| `src/shared/errors/error-codes.ts`                         | Modified       | New codes `INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED`; statuses `400`, `400`, `409`.                    |
| `src/shared/events/event-dispatcher.ts`                    | Modified       | New union member `TransactionRecorded` with payload type.                                                                   |
| `src/shared/logger/logger.ts`                              | Modified       | New event names `transactions.{create,update,delete}`, `transactions.fx.convert`.                                           |
| `openspec/specs/transactions/spec.md`                      | New            | Canonical capability spec, promoted from the delta by `sdd-archive`.                                                        |
| `openspec/changes/transactions/specs/transactions/spec.md` | New (delta)    | Delta spec written by `sdd-spec`.                                                                                           |
| `openspec/changes/transactions/specs/accounts/spec.md`     | New (delta)    | Optional delta: notes the new `Transaction` FK to `FinancialAccount` for cross-module readers.                              |
| `Documents-es/openspec/...`                                | New + Modified | Spanish mirror of every English Markdown above. Same commit per root `AGENTS.md` §13.3.                                     |
| `package.json` + `pnpm-lock.yaml`                          | Modified       | No new runtime deps expected. If the spec phase adds any, the lockfile is committed in the same PR (root `AGENTS.md` §5.3). |

## Closed decisions (DG-TX-N — 2026-06-22)

All 15 decision gaps are **closed**. Detail lives in the
corresponding section below or in the explore artifact; this is
the audit summary.

| Gap      | Decision                                                                                                                                                                                                                                                                                                                             | Rationale                                                                                                                                                                                                | Where codified                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| DG-TX-1  | Hard delete; required fields = `id, userId, accountId, direction, amountMinor, currency, transactionDate, createdAt, updatedAt`; optional = `memo, category, convertedAmountMinor, convertedCurrency, fxAsOfSnapshot, casaSnapshot`; no `createdBy`/`updatedBy` columns.                                                             | Hard delete is the cheapest path; `accounts` soft-archives because accounts outlive transactions, but transactions are disposable. No audit columns mirror `accounts` (which has none).                  | Change 1, BR-TX-7                                                                                                                                 |
| DG-TX-2  | Single-account only in v1. `Transfer` aggregate and `transferGroupId` deferred to v1.1.                                                                                                                                                                                                                                              | **Locked at pre-propose grill.** Cheapest path; defers atomic two-row writes until the core CRUD pattern lands.                                                                                          | BR-TX-2                                                                                                                                           |
| DG-TX-3  | Snapshot at write time: row carries `originalAmount` + `originalCurrency` AND `convertedAmount` + `convertedCurrency` + `fxAsOfSnapshot` + `casa`.                                                                                                                                                                                   | **Locked at pre-propose grill.** Deterministic historical totals; no re-conversion job. `fx-cache` spec lines 95-98 explicitly contemplate this shape.                                                   | Change 1, BR-TX-6                                                                                                                                 |
| DG-TX-4  | Free-form string `category: String?` on `Transaction`. No `TransactionCategory` table in v1.                                                                                                                                                                                                                                         | Lowest friction for v1; can be promoted to a typed table later without a destructive migration (the string is a free-form superset).                                                                     | Change 1, BR-TX-9                                                                                                                                 |
| DG-TX-5  | `AttachmentStorage` port with `put / get / delete / signUrl`; `LocalDiskAttachmentStorage` for dev/CI; env var `ATTACHMENTS_DIR`; deferred to v1.1 (Slice 2 of this change).                                                                                                                                                         | **Locked at pre-propose grill.** Adapter interface from day 1 so a future S3/R2 swap is non-breaking. Defer is fine: the port is not in v1's write path.                                                 | v1.1 candidate                                                                                                                                    |
| DG-TX-6  | Domain-level frequency (`frequency`, `interval`, `byMonthDay`, `byDay`). Generated instances are new rows with `recurrenceTemplateId: string                                                                                                                                                                                         | null`FK; each generated instance carries an`idempotencyKey`of`{ templateId, dueDate }`. Deferred to v1.1 (Slice 3 of this change).                                                                       | No iCal parser dep; no Cron expression. Engine resolves "next run" deterministically from the typed fields.                                       | v1.1 candidate   |
| DG-TX-7  | On-demand generation at dashboard load. No Cron, no BullMQ. Deferred to v1.1.                                                                                                                                                                                                                                                        | **Locked at pre-propose grill.** Cutoff for v1; background jobs are out.                                                                                                                                 | v1.1 candidate                                                                                                                                    |
| DG-TX-8  | Half-up rounding at 2 decimals for display. The FX provider's existing `(amount / 100) * fxRate` arithmetic is the convention; if a future `reports` change needs a different rule, that change introduces it explicitly.                                                                                                            | Aligns with the implicit half-up convention in `fx-rate-provider.dolar-api.ts`. `Transaction.convertedAmountMinor` stores the integer cents directly so no on-read rounding is needed.                   | BR-TX-6                                                                                                                                           |
| DG-TX-9  | No idempotency key in v1. v1 single-row CRUD; retries on `5xx` MAY create a duplicate. UI surfaces a "did this work?" hint on submit failure. An `idempotencyKey` field with `@@unique([userId, idempotencyKey])` is a v1.1 candidate (added when bulk import lands, which is when the duplicate risk goes from "rare" to "common"). | Cheapest v1; the UI hint closes the UX gap. Idempotency matters more for the bulk-import endpoint that ships in v1.1.                                                                                    | Closed now; revisited in v1.1                                                                                                                     |
| DG-TX-10 | Single-user only. No `viewer` permission in v1; the `userId` scoping is the only access control.                                                                                                                                                                                                                                     | **Locked at pre-propose grill.** Aligns with `openspec/specs/auth/spec.md:644-647`.                                                                                                                      | BR-TX-4                                                                                                                                           |
| DG-TX-11 | `memo` is optional, no min length, no PII denylist in v1. Max length 500 chars (Zod). The logger strip list is extended to drop `memo` content (PII hygiene is the BR, not a denylist on writes).                                                                                                                                    | **Locked at pre-propose grill.** Lowest friction; logger denylist closes the PII-to-Sentry gap without constraining the write surface.                                                                   | BR-TX-8                                                                                                                                           |
| DG-TX-12 | `direction` enum is `INCOME                                                                                                                                                                                                                                                                                                          | EXPENSE`in v1.`TRANSFER`value reserved but rejected at the API. Sign rule:`amountMinor`is always positive;`direction` carries the sign.                                                                  | Always-positive integers are the simplest invariant to test; `direction` is the explicit sign source. Aligns with money-value-object conventions. | BR-TX-1, BR-TX-2 |
| DG-TX-13 | Reject future `transactionDate` with `FUTURE_DATE_NOT_ALLOWED` (400).                                                                                                                                                                                                                                                                | Future dates are an authoring mistake in v1 (no scheduled payments, no recurrence); a hard reject is the cheapest guard. The recurrence slice (v1.1) introduces the future-date exception when it lands. | BR-TX-3                                                                                                                                           |
| DG-TX-14 | Cursor pagination: `?cursor=...&limit=...&accountId=...`. `limit` clamped to `1..100`. Mirrors `list-accounts.action.ts` exactly.                                                                                                                                                                                                    | Same shape as the existing pattern; the smoke UI reuses the same pagination footer.                                                                                                                      | Change 3, BR-TX-10                                                                                                                                |
| DG-TX-15 | Hard delete in v1. No `archivedAt` column on `Transaction`.                                                                                                                                                                                                                                                                          | **Closed by proposer.** Transactions are disposable; hard delete is the cheapest path. Soft delete can be added in a future change without breaking the FK or the index.                                 | BR-TX-7                                                                                                                                           |

## Acceptance criteria

The change is done when:

1. `pnpm test` runs the new `transactions` domain + integration
   suite and exits 0 with **≥ 80% coverage on
   `src/modules/transactions/**`\*\* (domain + application layers).
2. `pnpm dev` → sign in → open `app/transactions/new` → pick
   a USD account → enter an amount in USD → submit → the row is
   created with `convertedAmount` in the account's `casa`. The
   detail page renders `fxAsOfSnapshot` as `"Rate as of: <ISO>"`.
3. A user with no accounts sees the empty state on
   `app/transactions/page.tsx` (no crash, no broken footer).
4. `POST /api/transactions` with a future `transactionDate`
   returns `400 FUTURE_DATE_NOT_ALLOWED`.
5. `POST /api/transactions` with `direction: TRANSFER` returns
   `400 VALIDATION_ERROR` (the enum value is reserved for v1.1).
6. `POST /api/transactions` against an archived `FinancialAccount`
   returns `409 ACCOUNT_ARCHIVED`.
7. `GET /api/transactions/:id` for a transaction owned by another
   user returns `404 NOT_FOUND` (no information leakage).
8. `DELETE /api/transactions/:id` removes the row; a follow-up
   `GET /api/transactions/:id` returns `404`. There is no
   `archivedAt` column on the table.
9. `GET /api/transactions?cursor=...&limit=20&accountId=...`
   returns up to 20 rows ordered by `transactionDate DESC` and a
   `nextCursor` when more rows exist.
10. The Prisma migration adds the `Transaction` model and
    `TransactionDirection` enum on a populated database. Existing
    rows in `FinancialAccount` and `User` are unchanged.
    Verified by `SELECT count(*) FROM "FinancialAccount"` before
    and after the migration.
11. The `TransactionService` is wired in `buildDefaultDeps` at
    `src/modules/api/app.ts:317`; the protectedApp mounts the
    six routes between lines 306 and 312.
12. The `transactions.create`, `transactions.update`,
    `transactions.delete`, and `transactions.fx.convert` events
    are emitted via the central logger; the `TransactionRecorded`
    event is dispatched via the central event dispatcher (no
    subscriber is required in v1; the union membership is).
13. `openspec/specs/transactions/spec.md` exists and declares
    BR-TX-1 through BR-TX-11 with at least one Scenario each.
14. `./Documents-es/openspec/changes/transactions/proposal.md`
    and `./Documents-es/openspec/changes/transactions/explore.md`
    mirror exist with identical structure. No Chinese-character
    debris per root `AGENTS.md` §13.3 mirror check.
15. No `pnpm-lock.yaml` drift after `package.json` is staged
    (Husky pre-commit check per root `AGENTS.md` §5.3). If v1
    ships without new deps, the lockfile is unchanged.
16. **No `new Date()` in domain code.** Every service uses
    `Clock` (`src/shared/clock/clock.port.ts:22-24`); every
    write passes `clock.now()` for the `transactionDate`
    default and the FX `asOf` argument.

## Risks

| Risk                                                                                                                                          | Likelihood | Mitigation                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `transactions` table grows unbounded; pagination + index strategy must be in v1.                                                              | Medium     | Cursor pagination + `@@index([userId, transactionDate])` and `@@index([accountId, transactionDate])`. Mirrors `accounts` `@@index([userId, createdAt])`.                                   |
| FX snapshot at write time drifts from current rate (DG-TX-3).                                                                                 | Low        | The row carries `fxAsOfSnapshot` so the UI surfaces "Rate as of: <ISO>" (per BR-TX-6). The balance endpoint stays display-only and uses the live rate (BR-ACC-12).                         |
| Hard delete (DG-TX-15) accidentally deletes a transaction the user wanted to keep.                                                            | Medium     | The smoke UI shows a confirm dialog before the `DELETE` call. A future soft-delete column can be added without a destructive migration (additive).                                         |
| No idempotency on `POST /api/transactions` (DG-TX-9): a retry on `5xx` MAY create a duplicate.                                                | Low–Med    | The smoke UI surfaces a submit-failure hint. v1.1 ships `idempotencyKey` when bulk import lands.                                                                                           |
| The `accounts` module's `archivedAt` check at the action layer adds a round-trip on every transaction create.                                 | Low        | The service loads the account row once per write; the cost is one indexed PK lookup per write, which is acceptable for manual CRUD.                                                        |
| The new `transactions` module's public barrel grows over time and drifts from the minimal shape of `accounts/index.ts`.                       | Low        | The barrel is asserted by a tiny `index.test.ts` (mirrors `src/modules/auth/index.test.ts`).                                                                                               |
| The Spanish mirror drifts from the English original.                                                                                          | Medium     | Apply §13.3 atomicity; the `reviewer` checks both files in the same commit.                                                                                                                |
| Strict TDD's RED step is skipped, failing the reviewer.                                                                                       | Medium     | `sdd-tasks` owns task structure; `sdd-apply` enforces RED → GREEN → REFACTOR per task.                                                                                                     |
| The new `Transaction` model adds a `@@index([accountId, transactionDate])` that does not match the eventual recurrence slice's query pattern. | Low        | The v1.1 recurrence slice introduces its own query; if it needs a different index, the additive migration adds it.                                                                         |
| PII in `memo` leaks to logs / Sentry.                                                                                                         | Low        | Add `memo` (and any future free-form fields) to the logger denylist. The strip list is the BR-AUTH-11 contract surface (`fx-rate-provider.dolar-api.ts` already strips DolarAPI payloads). |

## Rollback

- **PR-1A not merged**: `git worktree remove ../gastos-personales-transactions-1A`,
  `git branch -D feat/transactions-1A`. No callers yet.
- **PR-1A merged, PR-1B not yet**: revert PR-1A. The new
  `src/modules/transactions/` module is additive; deletion is
  clean because nothing imports it yet.
- **PR-1B merged, pre-release**: revert PR-1B. Re-wire `buildDefaultDeps`
  to skip `transactionService`; remove the protectedApp routes.
  The Prisma migration is additive and reversible (`DROP TABLE
"Transaction"` + drop the enum). The `transactions` module
  can stay on disk (no callers) or be deleted as a separate step.
- **PR released to production**: stop. Production releases are
  governed by the release flow (root `AGENTS.md` §5.5) which
  requires user approval. No automatic rollback path is
  documented here.

## Dependencies

- **Inbound**: `accounts-ledger` (shipped) provides
  `FinancialAccount`, `AccountFxCasa`, `AccountCurrency`, and
  the `AccountRepositoryPort` shape.
- **Inbound**: `fx-cache` (shipped) provides the
  `FxRateProvider` port (lives in `accounts` at
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts:90-100`),
  the `FxConversionRequest` / `FxConversionResult` shape, and
  the `account.casa ?? env.FX_DEFAULT_CASA` resolution rule at
  `src/modules/accounts/application/actions/get-account-balance.action.ts:67-100`.
- **Inbound**: `auth-foundation` (shipped) provides the
  `authMiddleware` and `requireSession` (used by the protected
  sub-app at `src/modules/api/app.ts:131-184`) and the
  `c.get('user')` invariant (`AuthUser` is non-nullable inside
  the protectedApp).
- **Outbound**: `reports`, `snapshots` (future) consume
  `TransactionRepositoryPort` and subscribe to
  `TransactionRecorded`.
- **External**: none. DolarAPI is reached via the existing
  `FxRateProvider`; no new external service.
- **No co-PRs**: `transactions` does not block any in-flight
  change.

## Capabilities

> This section is the CONTRACT between this proposal and
> `sdd-spec`. The next phase reads this to know exactly which
> spec files to create or update.

### New capabilities

- `transactions`: owns the `Transaction` aggregate, the
  `TransactionRepositoryPort`, the `TransactionService`, the
  five CRUD actions, the FX-snapshot logic at write time, and
  the `TransactionRecorded` event. The capability is read+write;
  its dependency points to `accounts`'s `FxRateProvider` port
  (never the reverse), preserving the ports-and-adapters
  invariant. The capability lives at `src/modules/transactions/`
  and ships its own spec at `openspec/specs/transactions/spec.md`.

### Modified capabilities

- `accounts`: the spec gains a one-line delta noting the new
  `Transaction.accountId` FK to `FinancialAccount`. No behavior
  change; the delta is a cross-link pointer for the spec reader.
- `errors`: the `ErrorCode` enum at
  `src/shared/errors/error-codes.ts:12-43` gains three new
  values (`INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`,
  `ACCOUNT_ARCHIVED`). The mapping table at lines 52-66 gains
  three rows. No existing code changes status.
- `events`: the `DomainEvent` union at
  `src/shared/events/event-dispatcher.ts:3-5` gains one member
  (`TransactionRecorded`). No existing event payload changes.

## Alternatives considered

1. **`Transfer` aggregate in v1.** Two `Transaction` rows linked
   by `transferGroupId`, written atomically. Rejected: defers
   the most expensive question (atomic two-row write semantics)
   until the single-account CRUD pattern has landed and we have
   seen it work. v1.1 introduces `Transfer`.
2. **No FX snapshot on the row (DG-TX-3 option a).** Rejected:
   non-deterministic historical totals. A balance computed for
   last month would use today's rate, which is misleading in
   high-inflation periods.
3. **Both original + cached-converted (DG-TX-3 option c).**
   Rejected: storage cost and reconciliation complexity. The
   snapshot is the converted value; no second copy.
4. **`TransactionCategory` table from day 1 (DG-TX-4 option a).**
   Rejected: free-form string is the v1 minimum. A future change
   promotes the most-used strings to a typed table without a
   destructive migration (the string column becomes the
   nullable label; the table FK is additive).
5. **iCal RRULE for recurrence (DG-TX-6 option b).** Deferred:
   no parser dependency when v1 ships. The typed
   `frequency`/`interval`/`byMonthDay`/`byDay` shape is enough
   for the personal-finance use cases (monthly on day N,
   weekly on day-of-week, biweekly, etc.).
6. **Cron warmup for recurrence (DG-TX-7 option b).** Deferred:
   on-demand generation at dashboard load is sufficient for
   the manual-CRUDE-pace of the v1 user.
7. **Idempotency keys from day 1 (DG-TX-9 option a).** Deferred:
   the duplicate risk on manual CRUD is rare. The UI hint
   closes the gap for v1; v1.1 ships the key when bulk import
   makes the risk real.
8. **Soft delete via `archivedAt` (DG-TX-15 option a).** Rejected
   for v1: transactions are disposable; hard delete is the
   cheapest path. A future change can introduce `archivedAt`
   additively without breaking the FK or the index.

## Forecast (auto-chain, 400-line budget)

| PR  | Scope                                                                                                                                                                                                                                                                                                          | Approx. lines | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| 1A  | `src/modules/transactions/` module: entity + port + service + actions + DTO + Zod + Prisma adapter + InMemoryRepository fixture + service tests + action tests + integration smoke (`spec-scenarios.test.ts`). Prisma model + enum + migration.                                                                | ~450          | Auto   |
| 1B  | Hono routes mounted in `protectedApp`; `buildDefaultDeps` wires the service + repository; `app.transactions.test.ts`; smoke UI (`app/transactions/{page,new/page,[id]/page}.tsx`); error code additions; logger event names; `TransactionRecorded` event; spec delta + canonical spec; `Documents-es/` mirror. | ~350          | Auto   |
|     | **Total**                                                                                                                                                                                                                                                                                                      | **~800**      |        |

PR-1A is over the 400-line review budget by a small margin (the
InMemoryRepository fixture + 12+ service tests dominate). The
auto-chain strategy keeps the review focus tight: PR-1A is
self-contained (no routes, no UI); PR-1B wires it up.

## Audit trail

- **v1** (this proposal, 2026-06-22) — first write of the
  `transactions` proposal. Closes DG-TX-1, DG-TX-4, DG-TX-5,
  DG-TX-6, DG-TX-7, DG-TX-8, DG-TX-9, DG-TX-10, DG-TX-12,
  DG-TX-13, DG-TX-14, DG-TX-15 (12 decisions closed by the
  proposer). Carries DG-TX-2, DG-TX-3, DG-TX-11 as locked
  inputs from the pre-propose grill. Scope: `Transaction`
  aggregate + CRUD + multi-currency via `fx` + smoke UI.
  Attachments and recurrence deferred to v1.1.

Refs:

- `openspec/changes/transactions/explore.md` — the upstream
  explore artifact (15 DG-TX-N + 4 open questions, ~50 file:line
  citations).
- `openspec/specs/accounts/spec.md` — BR-ACC-12 (storage never
  converted), BR-ACC-13 (stale is not 5xx), the `casa`
  cross-link. All carried verbatim.
- `openspec/specs/fx/spec.md` — REQ-FX-3 (casa resolution is the
  caller's responsibility), REQ-FX-9 (additive migration). All
  carried verbatim; lines 95-98 explicitly contemplate this
  capability.
- `openspec/specs/auth/spec.md` — `auth()` server-side helper
  invariant, 7-export public surface. Cross-module invariant
  for every `transactions` endpoint.
- `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts:90-100` —
  the port the new `TransactionService` consumes unchanged.
- `src/modules/accounts/application/actions/get-account-balance.action.ts:67-100` —
  the canonical casa-resolution + conversion call site the
  `TransactionService` mirrors for the create path.
- `src/modules/accounts/domain/interfaces/account.repository.port.ts` —
  the `AccountRepositoryPort` shape the new
  `TransactionRepositoryPort` mirrors.
- `src/modules/api/app.ts:192-312` — the protectedApp the six
  new routes mount on.
- `src/shared/events/event-dispatcher.ts:3-5` — the union the
  `TransactionRecorded` event joins.
- `src/shared/errors/error-codes.ts:12-43` — the enum the three
  new codes join.
- `openspec/AGENTS.md:42-67` — author attribution rule.
- Root `AGENTS.md` §13 — dual-language docs mirror policy.
