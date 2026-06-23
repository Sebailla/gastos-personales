# Spec — `transactions` capability

**Author**: Sebastián Illa
**Capability**: `transactions`
**Source change**: `transactions`
**Status**: active · **Created**: 2026-06-22 · **Last sync**: 2026-06-22 (transactions)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (inherited from `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4

> First write of the `transactions` capability spec. It
> operationalizes the `transactions` proposal (draft 2026-06-22)
> plus the 15 product decisions closed in the same session
> (DG-TX-1 to DG-TX-15, see "Closed decisions" below). The spec
> declares **what MUST be true** after the change lands, not how
> to implement it. Implementation details (file paths, schema
> syntax, test layout) are limited to what the cross-module
> contract requires.
>
> This is the canonical `transactions` capability spec. The
> change folder is `openspec/changes/transactions/`; the delta
> spec mirror lives at
> `openspec/changes/transactions/specs/transactions/spec.md`.
> The two files are kept in lockstep; the canonical is the
> source of truth and the delta mirrors it. `sdd-archive`
> moves the change folder to
> `openspec/changes/archive/YYYY-MM-DD-transactions/` after
> verification closes; this canonical spec stays at
> `openspec/specs/transactions/spec.md`.

## Closed decisions (DG-TX-1 to DG-TX-15 — 2026-06-22)

The 15 decision gaps are authoritative where they modify or
extend the proposal. The spec reflects them as Requirements and
BRs, not as a separate "decisions" section. Decision IDs are
referenced inline in the relevant Scenario bodies.

| Gap      | Decision                                                                                           | Rationale                                                                               | Codified at      |
| -------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------- |
| DG-TX-1  | Hard delete; `amountMinor` always positive; required vs. optional fields as in proposal §Change 1. | Transactions are disposable; cheapest path. No audit columns mirror `accounts`.         | BR-TX-1, BR-TX-7 |
| DG-TX-2  | Single-account only in v1. No `Transfer` aggregate.                                                | **Locked at pre-propose grill.** Defers atomic two-row writes until CRUD lands.         | BR-TX-2          |
| DG-TX-3  | Snapshot at write time: row carries original + converted + `fxAsOfSnapshot` + `casa`.              | **Locked at pre-propose grill.** Deterministic historical totals.                       | BR-TX-6          |
| DG-TX-4  | Free-form string `category: String?`. No `TransactionCategory` table.                              | Lowest friction for v1. A typed table is a future additive migration.                   | BR-TX-9          |
| DG-TX-5  | `AttachmentStorage` port + `LocalDiskAttachmentStorage` for dev/CI. Deferred to v1.1.              | **Locked at pre-propose grill.** Adapter interface from day 1; non-breaking swap later. | v1.1 candidate   |
| DG-TX-6  | Domain-level frequency (`frequency`, `interval`, `byMonthDay`, `byDay`). Deferred to v1.1.         | **Locked at pre-propose grill.** No iCal parser dep; no Cron.                           | v1.1 candidate   |
| DG-TX-7  | On-demand generation at dashboard load. Deferred to v1.1.                                          | **Locked at pre-propose grill.** Cutoff for v1; background jobs out.                    | v1.1 candidate   |
| DG-TX-8  | Half-up rounding at 2 decimals for display.                                                        | Aligns with the implicit half-up convention in `fx-rate-provider.dolar-api.ts`.         | BR-TX-6          |
| DG-TX-9  | No `idempotencyKey` in v1. UI surfaces a submit-failure hint.                                      | Cheapest v1; the duplicate risk on manual CRUD is rare.                                 | (v1.1 candidate) |
| DG-TX-10 | Single-user only. `userId` scoping is the only access control.                                     | **Locked at pre-propose grill.** Aligns with `auth/spec.md` cross-module invariant.     | BR-TX-4          |
| DG-TX-11 | `memo` optional, max 500 chars; no PII denylist; logger strips `memo`.                             | **Locked at pre-propose grill.** Lowest friction; logger denylist closes PII-to-Sentry. | BR-TX-8          |
| DG-TX-12 | `direction` enum = `INCOME \| EXPENSE` in v1. `TRANSFER` reserved; rejected at API.                | Always-positive integers are the simplest invariant; `direction` is the sign source.    | BR-TX-1, BR-TX-2 |
| DG-TX-13 | Reject future `transactionDate` with `FUTURE_DATE_NOT_ALLOWED` (400).                              | Future dates are an authoring mistake in v1 (no scheduled payments, no recurrence).     | BR-TX-3          |
| DG-TX-14 | Cursor pagination `?cursor=...&limit=...&accountId=...`. `limit` clamped to `1..100`.              | Same shape as `list-accounts.action.ts`; smoke UI reuses the same footer.               | BR-TX-10         |
| DG-TX-15 | Hard delete in v1. No `archivedAt` column on `Transaction`.                                        | **Closed by proposer.** Transactions are disposable; hard delete is the cheapest path.  | BR-TX-7          |

Alternatives considered for each gap are recorded in the
proposal §"Alternatives considered" and §"Closed decisions".
Attachments, recurrence, and idempotency stay out of v1 per the
proposal §"Out of scope".

## Purpose

The `transactions` capability is the **transaction ledger** of
`gastos-personales`. It owns the user's manual expense and income
registration (CRUD) plus a multi-currency display surface that
calls the `fx` capability's `FxRateProvider` port at write time.
The capability guarantees that: (a) every transaction is owned by
exactly one authenticated `User` and exactly one
`FinancialAccount` (the cross-module invariants inherited from
`auth` and `accounts`); (b) the multi-currency snapshot is
captured **once, at write time**, and persisted on the row so
historical totals are deterministic; (c) the FX surface is
**display-only at write time** — the native `amountMinor` is the
authoritative number on the row, and the `convertedAmountMinor`
is a snapshot, never a mutation of native state; (d) the smoke
UI lets a developer or PM exercise the CRUD flow end-to-end
without curl in under five minutes, mirroring the `accounts`
smoke slice.

The capability exposes a stable, presentation-layer write surface
— `{ amountMinor, currency, accountId, direction,
transactionDate, memo?, category?, convertedAmountMinor,
convertedCurrency, fxAsOfSnapshot? }` — that any consumer
(`reports`, `snapshots`) can read or subscribe to via
`TransactionRepositoryPort` and the `TransactionRecorded` domain
event without learning the upstream details.

## Scope

### In scope

- New Prisma model `Transaction` and one enum
  (`TransactionDirection`).
- New module `src/modules/transactions/` mirroring the
  `accounts` shape (`domain/entities`,
  `domain/interfaces/transaction.repository.port.ts`,
  `domain/services/transaction.service.ts`,
  `application/actions/{list,get,create,update,delete}-transaction.action.ts`,
  `application/dto/transaction.dto.ts`,
  `application/validation/transaction-create.schema.ts`,
  `infrastructure/repositories/transaction.repository.prisma.ts`).
- Six Hono endpoints under `/api/transactions` mounted on the
  existing protectedApp catch-all (the
  `app/api/[...path]/route.ts` file is not modified).
- Three new error codes (`INVALID_AMOUNT`,
  `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED`) added to
  `src/shared/errors/error-codes.ts`.
- One new domain event (`TransactionRecorded`) added to the
  `DomainEvent` union at
  `src/shared/events/event-dispatcher.ts`.
- Four new structured log event names
  (`transactions.create`, `transactions.update`,
  `transactions.delete`, `transactions.fx.convert`).
- DI wiring additions in
  `src/modules/api/app.ts:317-352` (`buildDefaultDeps`) — one
  new service, one new repository.
- Three Next.js App Router pages under `app/transactions/*`
  (smoke UI; mirrors `app/accounts/*`).
- Logger denylist extension to drop `memo` content (BR-TX-8;
  PII hygiene is the BR).

### Out of scope

- **Transfers between two accounts.** Deferred to v1.1 (no
  `Transfer` aggregate, no `transferGroupId`).
- **Attachments** (receipts, invoices). Deferred to v1.1; no
  `Attachment` model, no `AttachmentStorage` port.
- **Recurrence.** Deferred to v1.1; no `RecurrenceRule` model,
  no on-demand generator, no Cron, no BullMQ.
- **Idempotency keys.** Deferred to v1.1 (introduced when bulk
  import lands; manual CRUD's duplicate risk is rare).
- **Bank import / CSV upload.** Out of v1.
- **OCR on receipts.** Out of v1.
- **Multi-user / shared accounts / read-only viewer.** v1 is
  single-user per BR-TX-4.
- **Push notifications.** Out of v1.
- **Historical FX archive for back-dated transactions.** The
  rate is the rate at the moment of write; the row carries
  `fxAsOfSnapshot` so the UI surfaces "Rate as of: <ISO>".
- **AI categorization.** Out of v1.
- **Budget rules / spending limits.** Out of v1 (`reports`
  territory).
- **Production UI.** The smoke UI under `app/transactions/` is
  smoke-minimal; a production UI is the `transactions-ui`
  change.
- **Mobile app.** Out of v1.

### Capability boundary

- `transactions` owns the `Transaction` aggregate, the
  `TransactionRepositoryPort`, the `TransactionService`, the
  five CRUD actions, the FX snapshot logic at write time, and
  the `TransactionRecorded` event.
- `accounts` owns the `FinancialAccount` model, the
  `FxRateProvider` port interface, and the `AccountCurrency` /
  `AccountFxCasa` enums.
- `fx` owns the concrete `FxRateProvider` implementation and
  the rate cache.
- The dependency points from `transactions` to
  `accounts`'s `FxRateProvider` port and to
  `accounts`'s `FinancialAccount` model (read-only) — never
  the reverse, preserving the ports & adapters invariant.
- `transactions` MUST NOT import from `fx` directly; it goes
  through the `FxRateProvider` port declared in `accounts`.
- `transactions` MUST NOT read any other module's repository
  port for write paths; the parent `FinancialAccount` row is
  loaded by `transactions` through `AccountRepositoryPort`
  (BR-TX-5 pre-check).

## Entities

The spec is interface-level. The shapes below are part of the
contract that crosses the `transactions` ↔ consumer boundary
(UI, `reports`, `snapshots`).

### `Transaction`

The single source-of-truth entity for the user's transactions.
One row per manual entry. A row is owned by exactly one `User`
(cross-module invariant inherited from `auth`) and references
exactly one `FinancialAccount` (cross-module invariant
inherited from `accounts`).

| Field                  | Type                    | Constraints                                                                            |
| ---------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `id`                   | `string` (cuid)         | Primary key. Server-generated. Immutable.                                              |
| `userId`               | `string` (cuid)         | FK to `User.id`. `onDelete: Cascade`. Cross-module invariant (`auth` capability).      |
| `accountId`            | `string` (cuid)         | FK to `FinancialAccount.id`. `onDelete: Cascade`. Cross-module invariant (`accounts`). |
| `direction`            | `TransactionDirection`  | One of `INCOME \| EXPENSE` in v1. `TRANSFER` reserved for v1.1 (rejected at API).      |
| `amountMinor`          | `Int`                   | Minor units. Always positive; the sign comes from `direction`. Non-positive → 400.     |
| `currency`             | `AccountCurrency`       | One of `ARS \| USD \| EUR`.                                                            |
| `memo`                 | `string \| null`        | Optional. Max 500 chars (Zod). No min length. No PII denylist in v1 (BR-TX-8).         |
| `category`             | `string \| null`        | Optional. Free-form string. No `TransactionCategory` table in v1 (BR-TX-9).            |
| `transactionDate`      | `DateTime`              | NOT in the future relative to `Clock.now()`. Future → 400 `FUTURE_DATE_NOT_ALLOWED`.   |
| `convertedAmountMinor` | `Int`                   | Display amount in the parent account's `casa` currency. Snapshotted at write time.     |
| `convertedCurrency`    | `AccountCurrency`       | The parent account's `casa` currency at write time. Always populated.                  |
| `fxAsOfSnapshot`       | `DateTime \| null`      | Snapshot timestamp. `null` iff `currency === convertedCurrency` (no FX call).          |
| `casaSnapshot`         | `AccountFxCasa \| null` | The casa used at write time. `null` iff `currency === convertedCurrency`.              |
| `createdAt`            | `DateTime`              | Server-set on insert.                                                                  |
| `updatedAt`            | `DateTime`              | Server-set on every mutation.                                                          |

Invariants:

- `amountMinor > 0` is enforced at the action boundary
  (BR-TX-1).
- `direction ∈ { INCOME, EXPENSE }` in v1 writes (BR-TX-2).
- `transactionDate <= Clock.now()` at the action boundary
  (BR-TX-3).
- `convertedCurrency` always equals the parent
  `FinancialAccount.casa`'s currency at write time.
- `convertedAmountMinor` is the integer-cents result of
  applying the snapshot rate to `amountMinor` (BR-TX-6).
- `fxAsOfSnapshot IS NULL` iff
  `currency === convertedCurrency`.
- Cross-user access returns `404 NOT_FOUND` (no information
  leakage), per `auth/spec.md` cross-module invariant.
- The row carries no `archivedAt` column (BR-TX-7).

Indexes:

- `@@index([userId, transactionDate])` — list endpoint.
- `@@index([accountId, transactionDate])` — per-account list.

### Enums

- `TransactionDirection`: `INCOME \| EXPENSE \| TRANSFER`.
  Only `INCOME` and `EXPENSE` are accepted at the API in v1
  (BR-TX-2). `TRANSFER` is reserved for v1.1.

## Business rules

The rules below are normative. Each rule has a stable ID for
traceability across spec, design, implementation, and tests.
The carried BRs (BR-ACC-12, BR-ACC-13, BR-FX-3) are imported
verbatim from `openspec/specs/accounts/spec.md` and
`openspec/specs/fx/spec.md`.

- **BR-ACC-12 (carried)** — Storage is never converted. The
  native `amountMinor` is the authoritative number on the row.
  The `convertedAmountMinor` is a snapshot, not a mutation of
  the native value. (Source: `openspec/specs/accounts/spec.md`,
  `openspec/specs/fx/spec.md:314-323`.)
- **BR-ACC-13 (carried)** — Stale FX is not a 5xx. The
  `FxRateProvider` returns the rate with `fxAsOf` even when
  stale; the transaction write surfaces the snapshot timestamp
  in the response so the UI can render "Rate as of: <ISO>".
- **BR-FX-3 (carried)** — Casa resolution is the caller's
  responsibility. The `TransactionService` resolves
  `account.casa ?? env.FX_DEFAULT_CASA` at the action site,
  never inside the provider.
- **BR-TX-1 (NEW)** — `Transaction.amountMinor` is always
  positive; the sign comes from `direction`. A non-positive
  value at the API boundary is rejected with `INVALID_AMOUNT`
  (400).
- **BR-TX-2 (NEW)** — `direction` is one of `INCOME | EXPENSE`
  in v1. The `TRANSFER` enum value is reserved for v1.1 and is
  rejected at the API boundary in v1.
- **BR-TX-3 (NEW)** — `Transaction.transactionDate` is never
  in the future relative to `Clock.now()`. A future date at the
  API boundary is rejected with `FUTURE_DATE_NOT_ALLOWED`
  (400).
- **BR-TX-4 (NEW)** — Every cross-module reference to a
  transaction scopes to `userId`. There is no `findById(id)`
  API; `findById(userId, id)` returns `null` on miss OR
  cross-user.
- **BR-TX-5 (NEW)** — A `Transaction` cannot be created against
  an archived `FinancialAccount`. The action layer pre-checks
  `account.archivedAt` and rejects with `ACCOUNT_ARCHIVED` (409).
- **BR-TX-6 (NEW)** — The converted amount is captured at write
  time. When `transaction.currency === account.casa`'s
  currency, the FX call is skipped and
  `convertedAmountMinor` mirrors `amountMinor` and
  `fxAsOfSnapshot` is `null`.
- **BR-TX-7 (NEW)** — Hard delete is the v1 policy. There is
  no `archivedAt` column on `Transaction`; `DELETE` removes the
  row permanently.
- **BR-TX-8 (NEW)** — `memo` is optional. No min length, no
  PII denylist in v1. Max length 500 chars enforced by Zod.
  The structured logger strips `memo` content from log events.
- **BR-TX-9 (NEW)** — `category` is a free-form string (no
  `TransactionCategory` table in v1).
- **BR-TX-10 (NEW)** — Pagination is cursor-based
  (`?cursor=...&limit=...&accountId=...`). `limit` is clamped to
  `1..100` at the API boundary.
- **BR-TX-11 (NEW)** — The `TransactionRecorded` domain event
  is emitted after a successful create. The payload includes
  the converted amount and the snapshot timestamp.

## Operations

The capability exposes five operations through the
`TransactionRepositoryPort` and five Hono endpoints. Operations
are interface-level: they describe what MUST be true, not the
class names or file paths that implement them.

### `create(userId, input)`

Persists a new `Transaction` row owned by `userId` against the
parent `FinancialAccount`. Steps:

1. Validate the input through the Zod `transactionCreateSchema`
   (direction-validated, amount-positive, transactionDate-not-future).
2. Load the parent `FinancialAccount` via
   `AccountRepositoryPort.findById(userId, accountId)`.
3. Reject with `ACCOUNT_ARCHIVED` (409) if `account.archivedAt`
   is non-null (BR-TX-5).
4. Resolve the casa via
   `account.casa ?? env.FX_DEFAULT_CASA` (BR-FX-3 carried).
5. Compute the converted amount:
   - If `transaction.currency === casa currency`: skip the FX
     call; set `convertedAmountMinor = amountMinor`,
     `convertedCurrency = transaction.currency`,
     `fxAsOfSnapshot = null`, `casaSnapshot = null`.
   - Else: call `FxRateProvider.getDisplayAmount({ casa })`;
     store the result as `convertedAmountMinor` /
     `convertedCurrency` / `fxAsOfSnapshot` /
     `casaSnapshot`. Stale is allowed (BR-ACC-13 carried).
6. Persist the row.
7. Emit the `transactions.create` structured log event
   (`{ userId, accountId, direction, amountMinor, currency,
casa, fxAsOf }`).
8. Emit the `transactions.fx.convert` structured log event
   when an FX call actually happened
   (`{ userId, casa, native, display, fxAsOf, stale }`).
9. Dispatch the `TransactionRecorded` domain event
   (`{ userId, transactionId, accountId, direction,
amountMinor, currency, casa, convertedAmountMinor,
convertedCurrency, occurredAt }`).
10. Return the new row.

### `getById(userId, id)`

Returns the `Transaction` row owned by `userId` with the given
`id`, or `null` on miss OR cross-user (BR-TX-4). The action
layer maps `null` to `404 NOT_FOUND`.

### `list(userId, { cursor, limit, accountId? })`

Returns a cursor-paginated page of `Transaction` rows owned by
`userId`, ordered by `transactionDate` descending. When
`accountId` is supplied, the page is filtered to that account.
`limit` is clamped to `1..100` (BR-TX-10).

### `update(userId, id, patch)`

Applies a partial patch (`amountMinor`, `currency`,
`transactionDate`, `memo`, `category`) to the row owned by
`userId` with the given `id`. The FX snapshot is recomputed
**only if** `amountMinor` or `currency` changed; otherwise the
existing snapshot is preserved. Returns the updated row, or
`null` on miss OR cross-user.

### `delete(userId, id)`

Hard-deletes the `Transaction` row owned by `userId` with the
given `id` (BR-TX-7). Returns `null` on miss OR cross-user.
There is no archive; the row is gone.

## Requirements

### Data model

#### Requirement: Transaction persists the multi-currency snapshot row (REQ-TX-1)

The system MUST persist a `Transaction` row whose shape matches
the entity table. The system MUST enforce the two indexes
(`@@index([userId, transactionDate])` and
`@@index([accountId, transactionDate])`). The system MUST NOT
add an `archivedAt` column to the `Transaction` model.
(Traces: BR-TX-6, BR-TX-7, DG-TX-1, DG-TX-3.)

#### Scenario: USD write against an ARS casa snaps the conversion

- GIVEN: a user owns a `FinancialAccount` with `currency = ARS`
  AND `casa = oficial`
- WHEN: the user posts `POST /api/transactions` with
  `direction = EXPENSE`, `amountMinor = 1000`, `currency = USD`,
  `accountId = <that account>`
- THEN: the response status is `201`
- AND: the row's `amountMinor` is `1000`
- AND: the row's `convertedAmountMinor` is non-null and in ARS
- AND: the row's `convertedCurrency` is `ARS`
- AND: the row's `fxAsOfSnapshot` is a non-null ISO timestamp
- AND: the row's `casaSnapshot` is `OFICIAL`

#### Scenario: ARS write against an ARS casa skips the FX call

- GIVEN: a user owns a `FinancialAccount` with `currency = ARS`
  AND `casa = oficial`
- WHEN: the user posts `POST /api/transactions` with
  `direction = INCOME`, `amountMinor = 5000`, `currency = ARS`,
  `accountId = <that account>`
- THEN: the response status is `201`
- AND: the row's `convertedAmountMinor` equals `amountMinor`
- AND: the row's `fxAsOfSnapshot` is `null`
- AND: the row's `casaSnapshot` is `null`
- AND: no call to `FxRateProvider` was issued

#### Scenario: schema preserves historical determinism

- GIVEN: a `Transaction` row created 6 months ago with
  `amountMinor = 1000`, `currency = USD`,
  `convertedAmountMinor = 1100000`, `convertedCurrency = ARS`,
  `fxAsOfSnapshot = <ISO>`
- WHEN: today's FX rate is `1200000` ARS/USD (a different value)
- THEN: the historical row's `convertedAmountMinor` is still
  `1100000` (the snapshot at write time, not the live rate)

#### Scenario: hard delete removes the row

- GIVEN: a `Transaction` row exists with `id = X` and
  `userId = <caller>`
- WHEN: the owner calls `DELETE /api/transactions/X`
- THEN: the response status is `204` (or `200`)
- AND: a follow-up `GET /api/transactions/X` returns `404`
- AND: no `archivedAt` column exists on the `Transaction` table

### Validation

#### Requirement: amountMinor is strictly positive (REQ-TX-2)

The system MUST reject a `POST /api/transactions` body whose
`amountMinor <= 0` with `400 INVALID_AMOUNT`. The sign comes
from `direction`, never from a negative `amountMinor`.
(Traces: BR-TX-1, DG-TX-12.)

#### Scenario: zero amount is rejected

- GIVEN: any authenticated session
- WHEN: `POST /api/transactions` is called with
  `amountMinor = 0`
- THEN: the response status is `400`
- AND: the response body's `error.code` is `INVALID_AMOUNT`
- AND: no row is created

#### Scenario: negative amount is rejected

- GIVEN: any authenticated session
- WHEN: `POST /api/transactions` is called with
  `amountMinor = -100`
- THEN: the response status is `400`
- AND: the response body's `error.code` is `INVALID_AMOUNT`
- AND: no row is created

#### Requirement: direction enum is INCOME or EXPENSE in v1 (REQ-TX-3)

The system MUST accept `direction ∈ { INCOME, EXPENSE }` at the
API boundary. The system MUST reject `direction = TRANSFER`
with `400 VALIDATION_ERROR` (the enum value is reserved for
v1.1). The system MUST store the `direction` value verbatim.
(Traces: BR-TX-2, DG-TX-12.)

#### Scenario: TRANSFER is rejected

- GIVEN: any authenticated session
- WHEN: `POST /api/transactions` is called with
  `direction = TRANSFER`
- THEN: the response status is `400`
- AND: the response body's `error.code` is `VALIDATION_ERROR`
- AND: no row is created

#### Requirement: transactionDate is never in the future (REQ-TX-4)

The system MUST reject a `POST /api/transactions` body whose
`transactionDate > Clock.now()` with `400
FUTURE_DATE_NOT_ALLOWED`. The `transactionDate` field is
required. (Traces: BR-TX-3, DG-TX-13.)

#### Scenario: today is allowed

- GIVEN: `Clock.now()` returns today
- WHEN: `POST /api/transactions` is called with
  `transactionDate = <today>`
- THEN: the response status is `201` (or `400` for an unrelated
  validation failure)

#### Scenario: tomorrow is rejected

- GIVEN: `Clock.now()` returns today
- WHEN: `POST /api/transactions` is called with
  `transactionDate = <tomorrow>`
- THEN: the response status is `400`
- AND: the response body's `error.code` is
  `FUTURE_DATE_NOT_ALLOWED`
- AND: no row is created

#### Requirement: memo is optional and capped at 500 chars (REQ-TX-5)

The system MUST accept a `memo` field that is null OR a string
of 1–500 chars. The system MUST reject a `memo` longer than
500 chars with `400 VALIDATION_ERROR`. The system MUST NOT
deny-list any `memo` content at the write boundary.
(Traces: BR-TX-8, DG-TX-11.)

#### Scenario: 500-char memo is accepted

- GIVEN: an authenticated session
- WHEN: `POST /api/transactions` is called with a 500-char
  `memo`
- THEN: the response status is `201`

#### Scenario: 501-char memo is rejected

- GIVEN: an authenticated session
- WHEN: `POST /api/transactions` is called with a 501-char
  `memo`
- THEN: the response status is `400`
- AND: the response body's `error.code` is `VALIDATION_ERROR`

### Authorization and access control

#### Requirement: All endpoints scope to the authenticated user (REQ-TX-6)

Every endpoint under `/api/transactions/*` MUST require an
authenticated session resolved via `auth()` from
`src/modules/auth/index.ts`. The system MUST derive `userId`
from the session and MUST NOT trust any `userId` in request
bodies. Every cross-module reference to a `Transaction` row
MUST scope to `userId`; cross-user reads return `404 NOT_FOUND`
(no information leakage). (Traces: BR-TX-4, DG-TX-10;
`auth/spec.md` cross-module invariant.)

#### Scenario: 401 on every endpoint when no session

- GIVEN: no `authjs.session-token` cookie
- WHEN: any of the six endpoints is called
- THEN: the response status is `401 UNAUTHORIZED`
- AND: no data is returned

#### Scenario: cross-user read returns 404

- GIVEN: user A owns a `Transaction` with `id = X`
- WHEN: user B calls `GET /api/transactions/X`
- THEN: the response status is `404 NOT_FOUND`
- AND: the response body does not leak the row's existence

#### Scenario: cross-user update returns 404

- GIVEN: user A owns a `Transaction` with `id = X`
- WHEN: user B calls `PATCH /api/transactions/X`
- THEN: the response status is `404 NOT_FOUND`
- AND: the row is not modified

#### Scenario: cross-user delete returns 404

- GIVEN: user A owns a `Transaction` with `id = X`
- WHEN: user B calls `DELETE /api/transactions/X`
- THEN: the response status is `404 NOT_FOUND`
- AND: the row is not deleted

#### Requirement: archived account rejects new writes (REQ-TX-7)

The action layer MUST pre-check the parent `FinancialAccount`'s
`archivedAt`. If `archivedAt` is non-null, the system MUST
reject `POST /api/transactions` and `PATCH /api/transactions`
(which changes `accountId`) with `409 ACCOUNT_ARCHIVED`.
(Traces: BR-TX-5.)

#### Scenario: write against an archived account is rejected

- GIVEN: a `FinancialAccount` owned by the caller with
  `archivedAt = <ISO>` (non-null)
- WHEN: the caller posts `POST /api/transactions` with
  `accountId = <that account>`
- THEN: the response status is `409`
- AND: the response body's `error.code` is `ACCOUNT_ARCHIVED`
- AND: no row is created

### Endpoints

#### Requirement: GET /api/transactions returns a cursor-paginated list (REQ-TX-8)

The system MUST return a paginated list of the authenticated
user's transactions, ordered by `transactionDate` descending.
The endpoint MUST support `?cursor=<opaque>&limit=<n>&accountId=<id>`.
The default `limit` is 20, the minimum is 1, the maximum is 100.
When `accountId` is supplied, the list MUST be filtered to that
account. (Traces: BR-TX-10, DG-TX-14.)

#### Scenario: list returns the user's transactions

- GIVEN: the authenticated user has 3 transactions
- WHEN: `GET /api/transactions` is called
- THEN: the response status is `200`
- AND: the response body contains a `data` array with 3
  entries, ordered by `transactionDate` descending
- AND: the response body contains `nextCursor` (null when
  fewer than `limit` rows remain)

#### Scenario: limit is clamped to 1..100

- GIVEN: any state
- WHEN: the caller passes `?limit=500`
- THEN: the server clamps the limit to `100`
- AND: the response is `200`

#### Scenario: limit below 1 is clamped to 1

- GIVEN: any state
- WHEN: the caller passes `?limit=0`
- THEN: the server clamps the limit to `1`
- AND: the response is `200`

#### Scenario: accountId filters the list

- GIVEN: the user has 3 transactions on account A and 2 on
  account B
- WHEN: `GET /api/transactions?accountId=<A>` is called
- THEN: the response body contains exactly the 3 transactions
  for account A

#### Requirement: POST /api/transactions creates one transaction (REQ-TX-9)

The system MUST validate the create body via Zod, persist a
`Transaction` row owned by the session user, and return `201`
with the full created row. The system MUST reject with the
codes defined in `Error semantics` below. (Traces: BR-TX-1 to
BR-TX-11, DG-TX-9.)

#### Scenario: valid create body returns 201 with the row

- GIVEN: an authenticated session and a parent `FinancialAccount`
  with `currency = ARS`, `casa = oficial`
- WHEN: `POST /api/transactions` is called with a valid
  `{ direction: EXPENSE, amountMinor: 1000, currency: ARS,
accountId: <A>, transactionDate: <today>, memo: "coffee" }`
  body
- THEN: the response status is `201`
- AND: the response body contains the full row (including
  `convertedAmountMinor`, `convertedCurrency`,
  `fxAsOfSnapshot`, `casaSnapshot`)
- AND: `userId` on the row equals the session user's id

#### Requirement: PATCH /api/transactions/:id applies a partial update (REQ-TX-10)

The system MUST accept a partial body of updatable fields
(`amountMinor`, `currency`, `transactionDate`, `memo`,
`category`) and return `200` with the updated row. The system
MUST recompute the FX snapshot if and only if `amountMinor` or
`currency` changed; otherwise the existing snapshot is
preserved. (Traces: BR-TX-4, BR-TX-6.)

#### Scenario: editing memo preserves the FX snapshot

- GIVEN: a `Transaction` row with a non-null `fxAsOfSnapshot`
- WHEN: the owner calls `PATCH /api/transactions/:id` with
  `{ memo: "updated memo" }`
- THEN: the response status is `200`
- AND: the row's `memo` is `"updated memo"`
- AND: the row's `fxAsOfSnapshot` is unchanged

#### Scenario: editing amountMinor recomputes the FX snapshot

- GIVEN: a USD transaction against an ARS casa, snapshot
  present
- WHEN: the owner calls `PATCH /api/transactions/:id` with
  `{ amountMinor: 2000 }`
- THEN: the response status is `200`
- AND: a new FX call is issued
- AND: the row's `fxAsOfSnapshot` is updated to the new
  call's timestamp

#### Requirement: DELETE /api/transactions/:id hard-deletes the row (REQ-TX-11)

The system MUST hard-delete the row owned by the caller. The
system MUST return `204` (or `200`). A follow-up
`GET /api/transactions/:id` MUST return `404`. (Traces:
BR-TX-7, DG-TX-15.)

#### Scenario: delete removes the row permanently

- GIVEN: a `Transaction` row owned by the caller
- WHEN: `DELETE /api/transactions/:id` is called
- THEN: the response status is `204`
- AND: a follow-up `GET /api/transactions/:id` returns `404`
- AND: the row does not exist in the database

### Multi-currency semantics

#### Requirement: FX snapshot at write time is deterministic and stale-tolerant (REQ-TX-12)

The system MUST call `FxRateProvider.getDisplayAmount({ casa })`
at write time when `transaction.currency !== casa currency`.
The system MUST persist the rate's `fxAsOf` as
`fxAsOfSnapshot` even when the rate is stale. Stale is not a
5xx (BR-ACC-13 carried). When the native currency matches the
casa currency, the system MUST skip the FX call and set
`convertedAmountMinor = amountMinor`,
`convertedCurrency = transaction.currency`,
`fxAsOfSnapshot = null`, `casaSnapshot = null`.
(Traces: BR-TX-6, BR-ACC-12, BR-ACC-13, DG-TX-3, DG-TX-8.)

#### Scenario: stale FX is accepted on write

- GIVEN: the `FxRateProvider` returns a rate with
  `stale: true` for the resolved casa
- WHEN: a USD transaction is written against an ARS casa
- THEN: the response status is `201`
- AND: the row's `fxAsOfSnapshot` is the provider's `fxAsOf`
- AND: the response body does NOT carry `stale: true` at the
  envelope level (the snapshot timestamp is the surface)

#### Scenario: native=casa skips FX

- GIVEN: a `FinancialAccount` with `currency = USD` and
  `casa = oficial` (casa currency = ARS by default — for the
  scenario, account currency equals casa currency)
- WHEN: the owner posts a USD transaction with the same USD
  casa
- THEN: the FX call is skipped
- AND: `convertedAmountMinor = amountMinor`

### Domain event

#### Requirement: TransactionRecorded is dispatched after a successful create (REQ-TX-13)

The system MUST dispatch the `TransactionRecorded` domain event
on the in-process event dispatcher at
`src/shared/events/event-dispatcher.ts` after a successful
create. The event payload MUST carry
`{ userId, transactionId, accountId, direction, amountMinor,
currency, casa, convertedAmountMinor, convertedCurrency,
occurredAt }`. The system MUST NOT require a subscriber in v1;
the union membership is the contract. (Traces: BR-TX-11.)

#### Scenario: a successful create dispatches the event

- GIVEN: an authenticated session and a valid create body
- WHEN: `POST /api/transactions` returns `201`
- THEN: the central event dispatcher has published a
  `TransactionRecorded` event with the create payload
- AND: future `reports` and `snapshots` consumers can subscribe
  without an interface change

### Observability

#### Requirement: Structured log events cover create/update/delete and FX conversion (REQ-TX-14)

The system MUST emit the following structured log events with
the listed fields via `src/shared/logger/logger.ts`:

- `transactions.create` — `{ userId, accountId, direction,
amountMinor, currency, casa, fxAsOf }`.
- `transactions.update` — `{ userId, id, fieldsChanged[],
fxRecomputed: boolean }`.
- `transactions.delete` — `{ userId, id }`.
- `transactions.fx.convert` — `{ userId, casa, native, display,
fxAsOf, stale }` (only emitted when an FX call actually
  happens).

The system MUST strip `memo` content from any captured log
payload (BR-TX-8, BR-AUTH-11 carried from `auth/spec.md`).
(Traces: BR-TX-8, BR-TX-11.)

#### Scenario: a create emits transactions.create with casa and fxAsOf

- GIVEN: an ARS casa account and a USD transaction
- WHEN: the create succeeds
- THEN: a `transactions.create` event is captured with
  `casa = OFICIAL` and `fxAsOf = <ISO>` (the snapshot
  timestamp)
- AND: the `memo` field is NOT present in the captured payload

#### Scenario: memo is stripped from logs

- GIVEN: a create body with `memo = "secret name"`
- WHEN: any structured log event is captured
- THEN: the captured payload does NOT contain the literal
  string `"secret name"` or the `memo` key

### UI smoke slice

#### Requirement: Three smoke pages mirror the accounts slice (REQ-TX-15)

The system MUST ship three Next.js App Router pages under
`app/transactions/`, each header comment
`// smoke-minimal, not production`:

- `app/transactions/page.tsx` — list page (Server Component
  that resolves the session via `auth()`, calls
  `GET /api/transactions`, and renders a `<table>` with
  columns `Date`, `Account`, `Direction`, `Amount`,
  `Converted amount`. Cursor pagination footer mirrors the
  `accounts` list page).
- `app/transactions/new/page.tsx` — create form (Server
  Component shell + single Client form). Renders a `<select
name="accountId">` populated from `GET /api/accounts` (live
  accounts only), a `<select name="direction">` with
  `INCOME | EXPENSE`, an `<input name="amountMinor">` (positive
  integer), a `<select name="currency">` with the
  `AccountCurrency` whitelist, a date input, an optional memo
  input (max 500 chars), and an optional category input. On
  `201`, `router.push('/transactions')`. On `4xx`, the inline
  error banner shows the first message from the response
  body's `error` field.
- `app/transactions/[id]/page.tsx` — detail page (Server
  Component that resolves the session, calls
  `GET /api/transactions/:id`, and renders the full row in a
  `<dl>` including `originalAmount`, `originalCurrency`,
  `convertedAmount`, `convertedCurrency`, and
  `fxAsOfSnapshot` rendered as `"Rate as of: <ISO>"`).

The three pages MUST NOT be added to
`proxy.ts:24-32 PUBLIC_PATHS`; the 307 redirect to
`/auth/signin?callbackUrl=...` is the auth gate.
(Traces: `accounts/spec.md` BR-ACC-14 to BR-ACC-19 for the
parallel smoke slice rules.)

#### Scenario: missing session redirects to /auth/signin

- GIVEN: no session cookie
- WHEN: the user visits `/transactions`
- THEN: the response is a 302 to
  `/auth/signin?callbackUrl=%2Ftransactions`

#### Scenario: empty list shows the empty state

- GIVEN: an authenticated user with zero transactions
- WHEN: the user visits `/transactions`
- THEN: the page renders `"No transactions yet — record one"`
- AND: the page renders a `New transaction` button linking to
  `/transactions/new`

#### Scenario: detail renders the snapshot timestamp

- GIVEN: a `Transaction` row owned by the authenticated user
  with `fxAsOfSnapshot = <ISO>`
- WHEN: the user visits `/transactions/:id`
- THEN: the page renders the row in a `<dl>`
- AND: the page renders `fxAsOfSnapshot` as the plain text
  `"Rate as of: <ISO>"`

## Error semantics

The `transactions` capability introduces three new codes that
join the existing enum at
`src/shared/errors/error-codes.ts:12-43`. All other failures
reuse existing codes (`VALIDATION_ERROR`, `UNAUTHORIZED`,
`NOT_FOUND`, etc.). The mapping is normative.

| Code                      | HTTP | Trigger                                                                            | Caller surface                                                       |
| ------------------------- | ---- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `INVALID_AMOUNT`          | 400  | `amountMinor <= 0`, negative after sign-from-direction derivation, or non-finite.  | Inline error banner on `POST /api/transactions`.                     |
| `FUTURE_DATE_NOT_ALLOWED` | 400  | `transactionDate > Clock.now()`.                                                   | Inline error banner on `POST /api/transactions`.                     |
| `ACCOUNT_ARCHIVED`        | 409  | Parent `FinancialAccount.archivedAt` is non-null at write time.                    | Inline error banner on `POST /api/transactions`.                     |
| `VALIDATION_ERROR`        | 400  | Any other schema failure (e.g. `direction = TRANSFER`, `memo > 500 chars`).        | Inline error banner; first message from `details`.                   |
| `UNAUTHORIZED`            | 401  | No session, missing cookie, expired session, or unknown user (per `auth/spec.md`). | 307 redirect for App Router pages; 401 JSON for Hono.                |
| `NOT_FOUND`               | 404  | Cross-user `Transaction` access, or non-existent `id` (no information leakage).    | `redirect('/transactions')` for the detail page (BR-ACC-19 pattern). |

The system MUST NOT include stack traces, Prisma error
objects, or request bodies in any error response.

## Migration

The Prisma migration for the `Transaction` model is the only
persistent schema change in this change.

```sql
-- non-destructive; additive; no backfill; no row rewrite
CREATE TYPE "TransactionDirection" AS ENUM
  ('INCOME', 'EXPENSE', 'TRANSFER');

CREATE TABLE "Transaction" (
  "id"                    TEXT PRIMARY KEY,
  "userId"                TEXT NOT NULL,
  "accountId"             TEXT NOT NULL,
  "direction"             "TransactionDirection" NOT NULL,
  "amountMinor"           INTEGER NOT NULL CHECK ("amountMinor" > 0),
  "currency"              "AccountCurrency" NOT NULL,
  "memo"                  TEXT,
  "category"              TEXT,
  "transactionDate"       TIMESTAMP NOT NULL,
  "convertedAmountMinor"  INTEGER NOT NULL,
  "convertedCurrency"     "AccountCurrency" NOT NULL,
  "fxAsOfSnapshot"        TIMESTAMP,
  "casaSnapshot"          "AccountFxCasa",
  "createdAt"             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP NOT NULL,
  CONSTRAINT "Transaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "Transaction_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE
);

CREATE INDEX "Transaction_userId_transactionDate_idx"
  ON "Transaction" ("userId", "transactionDate");
CREATE INDEX "Transaction_accountId_transactionDate_idx"
  ON "Transaction" ("accountId", "transactionDate");
```

The migration is additive. Existing `FinancialAccount` and
`User` rows are unchanged. **No data loss.** The schema gate
asserted by `sdd-verify` is `SELECT count(*) FROM
"FinancialAccount"` before and after the migration returns the
same value.

The Prisma schema changes are additive:

- New enum `TransactionDirection` with values `INCOME`,
  `EXPENSE`, `TRANSFER`.
- New model `Transaction` with the field list and indexes
  above.

## Out of scope (this change)

Carried verbatim from the proposal; see
`openspec/changes/transactions/proposal.md` §"Out of scope" for
detail.

- Transfers between two accounts (`Transfer` aggregate or
  `transferGroupId` link).
- Attachments (`Attachment` model, `AttachmentStorage` port,
  `LocalDiskAttachmentStorage`).
- Recurrence (`RecurrenceRule`, on-demand generator).
- Idempotency keys on `POST /api/transactions`.
- Bank import / CSV upload.
- OCR on receipts.
- Multi-user / shared accounts / read-only viewer.
- Push notifications.
- Historical FX archive for back-dated transactions.
- AI categorization.
- Budget rules / spending limits.
- Production UI (`transactions-ui` is a separate change).
- Mobile app.

## Cross-references

- **Proposal**: `openspec/changes/transactions/proposal.md` —
  the upstream change that created this capability. BR-TX-1 to
  BR-TX-11 and the carried BRs are codified here; the proposal
  carries the rationale, the alternatives considered, and the
  forecast.
- **Accounts spec**: `openspec/specs/accounts/spec.md` —
  BR-ACC-12 declares the display-only FX contract;
  BR-ACC-13 covers FX freshness; BR-ACC-18 covers the smoke
  widget rendering. The new `Transaction.accountId` FK is a
  cross-link point.
- **Per-account casa delta spec**:
  `openspec/changes/fx-cache/specs/accounts/spec.md` (or its
  canonical successor if archived) — the casa resolution rule
  at the call site (BR-FX-3) lives here.
- **FX spec**: `openspec/specs/fx/spec.md` — REQ-FX-3
  declares the casa-resolution-is-the-caller's-responsibility
  invariant that `transactions` carries. REQ-FX-9 documents
  the additive migration precedent that the `Transaction`
  migration follows.
- **Auth spec**: `openspec/specs/auth/spec.md` — the
  `auth()` server-side helper invariant (cross-module
  contracts §"auth() server-side helper") and the
  "every other module's `WHERE userId = ?` query MUST scope to
  the caller" rule. The `transactions` capability follows
  this invariant on every endpoint.
- **Transactions accounts delta**:
  `openspec/changes/transactions/specs/accounts/spec.md` —
  the sibling delta spec noting the new
  `Transaction.accountId` FK to `FinancialAccount` for
  cross-module readers.
- **Port interface (stable input)**:
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts` —
  the interface `TransactionService` consumes. Lives in
  `accounts`; `transactions` depends on it (port direction is
  `transactions → accounts`, not the reverse).
- **External services**: none. DolarAPI is reached via the
  existing `FxRateProvider`; no new external service.

## History

- **2026-06-22 (v1)** — first write. Created by the
  `transactions` change. Closes DG-TX-1 to DG-TX-15 (15
  decisions closed by the proposer + pre-propose grill). Scope:
  `Transaction` aggregate + CRUD + multi-currency via the
  `fx` capability + smoke UI. Attachments, recurrence, and
  idempotency keys deferred to v1.1+ of the same change.

## References

- `openspec/changes/transactions/proposal.md` — proposal v1
  (2026-06-22) with DG-TX-1 to DG-TX-15 closed.
- `openspec/changes/transactions/explore.md` — upstream
  research (15 DG-TX-N + 4 open questions, ~50 file:line
  citations).
- `openspec/specs/accounts/spec.md` — canonical `accounts`
  capability; BR-ACC-12, BR-ACC-13, BR-ACC-18.
- `openspec/specs/fx/spec.md` — canonical `fx` capability;
  REQ-FX-3 (casa resolution), REQ-FX-9 (additive migration).
- `openspec/specs/auth/spec.md` — canonical `auth`
  capability; `auth()` helper invariant, userId scoping.
- `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts` —
  the port `TransactionService` consumes unchanged.
- `src/modules/accounts/application/actions/get-account-balance.action.ts:67-100` —
  the canonical conversion call site that `TransactionService`
  mirrors for the create path.
- `src/shared/errors/error-codes.ts` — `INVALID_AMOUNT`,
  `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED` join the
  existing enum.
- `src/shared/events/event-dispatcher.ts` — `TransactionRecorded`
  joins the `DomainEvent` union.
- `openspec/config.yaml` — strict TDD rules; `pnpm test`
  runner.
- `AGENTS.md` (root) — §5.3 `pnpm-lock.yaml` policy; §13
  dual-language docs mirror policy.
