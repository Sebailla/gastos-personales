# Proposal — `accounts-ledger`

**Status**: draft (amended) — corrected per user review · **Author**: Sebastián Illa
**Created**: 2026-06-18 · **Target slice**: MVP-2 (post-auth capability) · **Capability**: `accounts`
**Upstream**: global SDD preflight (interactive, both, auto-forecast, 400 lines)
**Depends on**: `auth` (closed per 2026-06-14 sync; PRs #19, #20, #22, #23, #24, #25)
**Canonical spec slot**: `openspec/specs/accounts/spec.md` (does not exist yet — this change writes it)
**Strict TDD**: activated (the domain layer is rule-heavy; RED → GREEN → REFACTOR per `tasks.md`)

> **Naming note (read first)**: the Prisma `Account` model in
> `prisma/schema.prisma` is the **Auth.js OAuth link**
> (`provider` + `providerAccountId`). The financial-account
> entity in this change is **`FinancialAccount`** at the
> Prisma layer and **`Account`** at the public API/DTO
> layer. The Prisma-vs-API mismatch is a deliberate
> namespace choice — see the `Naming collision` callout in
> `### Data model` below. The `sdd-design` phase owns the
> final field-by-field mapping.

## Why

`gastos-personales` is a multi-user finance app. The
`auth` capability, now closed, gives every request a
trustworthy `userId`. The next entity in the user's mental
model is the **account** — the container that holds money
(cash on hand, a checking account, a credit card). Without
accounts there are no transactions, no snapshots, no
reports, no net worth; every later capability depends on
this one.

Doing accounts before transactions is also the only way
to get the **opening-balance semantics** right. If
transactions land first, the opening balance becomes a
derived field; if accounts lands first with a manual
opening balance, the design is honest about the boundary
("no transactions exist before `openingBalanceDate`"),
keeps the option to derive later, and isolates the
ownership-rule complexity (every entity keyed on
`userId`, every route scoped by `WHERE userId = ?`) in
this change so `transactions` can focus on
double-entry-style bookkeeping.

The `auth` spec's cross-module contracts already name this
change as the consumer of the `UserRegistered` event for
default-account seeding (see `openspec/specs/auth/spec.md`
§"Cross-module contracts > `UserRegistered` event"). That
seam is closed here: the `accounts` module subscribes to
the event but **no-op logs** in this change; default
seeding is deferred to the `ui-accounts` change (which can
flip a per-user preference).

## What

A self-contained `accounts` module on top of the
`auth`-owned Hono catch-all, following the project's
layered + modular architecture (Domain does NOT know
Application/Infrastructure/UI; the dependency direction
is strict; see the `architecture-standards` skill). The
module owns one Prisma-managed table (`FinancialAccount`),
five Hono routes under `/api/accounts/*`, a Zod-validated
DTO surface, and a no-op subscription to `UserRegistered`.

### Proposal question round (4 product decisions, 3 amended)

The pre-proposal interview round timed out without a
reply from the supervisor session. Per the contract's
fallback rule, this proposal originally proceeded with
**explicit defaults** documented below. Q1, Q2, and Q3
were **amended** in the same SDD cycle after the user
reviewed the proposal and supplied the corrected
answers. Q4 was confirmed as-is. The corrections are
reflected throughout the proposal (data model, business
rules, edge cases, decision gaps, implications).

| #   | Question                  | Default accepted (this proposal)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Where it shows up                                                                    |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Account types on day 1    | **The five canonical types + Other** (`type` enum: `CASH \| BANK \| CREDIT \| INVESTMENT \| CRYPTO \| OTHER`). Per-type field set: `CASH` / `BANK` / `OTHER` accept no type-specific required fields; `CREDIT` requires `creditLimit`, `statementDay`, `paymentDueDay` (forbidden on every other type); `INVESTMENT` accepts an optional `broker: string` (nullable in DB, optional in the DTO); `CRYPTO` accepts an optional `walletAddress: string` (nullable in DB, optional in the DTO); `OTHER` is fully free-form. Enforced by a Zod discriminated union on `type` (BR-ACC-8).                                                                                                                                                | `Business rules BR-ACC-1`, `BR-ACC-8`, `Data model`, `Edge cases`                    |
| 2   | Multi-currency from day 1 | **Each account picks its own currency.** `FinancialAccount.currency` is selected at creation (no inheritance from any user-level default; this change does **not** add `User.baseCurrency` — that column lives in the future `user-preferences` change). The supported currency set is restricted to `{ ARS, USD }` in this change, enforced by a Zod refine on the DTO; `fx-cache` will broaden the whitelist later. No auth-table modifications in this change (BR-ACC-9).                                                                                                                                                                                                                                                        | `Business rules BR-ACC-2`, `BR-ACC-9`, `Implications and impact`, `Decision gaps #1` |
| 3   | Opening balance handling  | **Hybrid — discriminated union on `openingBalanceMode: 'historical' \| 'fresh'`.** The Zod schema has two variants: `fresh` (no opening balance fields; defaults `openingBalanceAmount = 0` and `openingBalanceDate = createdAt` apply at the DB layer) and `historical` (both `openingBalanceAmount` and `openingBalanceDate` are required). PATCH mutates the underlying `openingBalanceAmount` and `openingBalanceDate` fields directly (no discriminator — the mode is a creation-intent concern). `currentBalance` is derived in code (`openingBalanceAmount + sum(transactions >= openingBalanceDate)`); the design phase decides whether to materialize a `currentBalance` cache. Choice rationale documented in `BR-ACC-3`. | `Business rules BR-ACC-3`, `Data model`, `Edge cases`                                |
| 4   | Soft-archive semantics    | **Soft archive via `archivedAt DateTime?`** (confirmed as-is, no amendment). `DELETE /api/accounts/:id` is **not** exposed in this change; the lifecycle endpoint is `POST /api/accounts/:id/archive` (sets `archivedAt`) and `POST /api/accounts/:id/unarchive` (clears it). Archived accounts stay in history and reports.                                                                                                                                                                                                                                                                                                                                                                                                        | `Business rules BR-ACC-4`, `Endpoints`, `Edge cases`                                 |

### Endpoints

All routes live under the existing Hono catch-all at
`app/api/[...path]/route.ts`. Every mutating endpoint
re-validates the `Origin` header against the
`env.APP_URL` allowlist (CSRF mitigation; same rule the
`auth` module uses). Every endpoint enforces the
`WHERE userId = ?` scope using `auth().user.id` from
`@/modules/auth`.

| Method | Path                          | Auth    | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/accounts`               | session | List accounts owned by the caller. Query params: `includeArchived` (default `false`), `type` (optional filter). Pagination: `?limit=50&cursor=<id>` (cursor on `createdAt, id`). Returns `{ data: AccountSummary[] }`.                                                                                                                                                                                                                                                                |
| POST   | `/api/accounts`               | session | Create an account. Body validated by Zod. On success, returns `201 { data: AccountDetail }` and dispatches no event (creation is user-initiated, not system-initiated).                                                                                                                                                                                                                                                                                                               |
| GET    | `/api/accounts/:id`           | session | Get one account owned by the caller. `404 NOT_FOUND` if it doesn't exist OR is owned by another user (identical response shape — no enumeration).                                                                                                                                                                                                                                                                                                                                     |
| PATCH  | `/api/accounts/:id`           | session | Update mutable fields: `name`, `type`-dependent fields (`creditLimit`, `statementDay`, `paymentDueDay`, `broker`, `walletAddress` — the latter two only on `INVESTMENT` / `CRYPTO` respectively), `currency`, `openingBalanceAmount`, `openingBalanceDate`. `type` and `userId` are **not** mutable; the `openingBalanceMode` discriminator is a creation-intent concern and is **not** accepted on PATCH (mutate the underlying fields directly). Returns `{ data: AccountDetail }`. |
| DELETE | `/api/accounts/:id`           | session | **Not exposed in this change.** See `BR-ACC-4` and `### Endpoints` note below.                                                                                                                                                                                                                                                                                                                                                                                                        |
| POST   | `/api/accounts/:id/archive`   | session | Soft archive: sets `archivedAt = now()`. Idempotent (a second call returns the row unchanged, no error). Returns `{ data: AccountDetail }`.                                                                                                                                                                                                                                                                                                                                           |
| POST   | `/api/accounts/:id/unarchive` | session | Clears `archivedAt`. Idempotent. Returns `{ data: AccountDetail }`.                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Endpoint note — no `DELETE /api/accounts/:id`**: the
soft-archive default (Q4) means "closing" an account is
`POST /archive`, not a delete. Hard delete is reserved
for the future `user-deletion` change (which
`onDelete: Cascade`s the `FinancialAccount` row along
with the `User`). If the user prefers a hard-delete
endpoint in review, this proposal is amended; the
behavior matrix is the same (`409 ACCOUNT_HAS_TRANSACTIONS`
when transactions exist, `204` otherwise).

### Data model

One new Prisma model + one column added to `User`. The
`FinancialAccount` model lives in `prisma/schema.prisma`
next to the auth models; the namespace is deliberate
(see the `Naming note` at the top of this proposal).

```prisma
// prisma/schema.prisma — additions for accounts-ledger

model FinancialAccount {
  id                   String        @id @default(cuid())
  userId               String

  // identity
  name                 String        // user-chosen display name (e.g. "Galicia cuenta sueldo")
  type                 AccountType   // enum: CASH | BANK | CREDIT | INVESTMENT | CRYPTO | OTHER

  // currency (chosen at creation; restricted to { ARS, USD } in this change — BR-ACC-2)
  currency             String        @db.Char(3)  // ISO-4217; uppercase; Zod-normalized; Zod refine to { ARS, USD }

  // opening balance (BR-ACC-3 — discriminated union on openingBalanceMode at the DTO;
  // both columns have DB-level defaults so the 'fresh' variant resolves cleanly)
  openingBalanceAmount Decimal       @default(0)  @db.Decimal(19, 4)
  openingBalanceDate   DateTime      @db.Date     // UTC date; no time component; defaulted to createdAt in code

  // type-dependent fields (null unless the corresponding type requires it — BR-ACC-8)
  creditLimit          Decimal?      @db.Decimal(19, 4)  // CREDIT only (required)
  statementDay         Int?          // 1..28 (safe bound); CREDIT only
  paymentDueDay        Int?          // 1..28; CREDIT only
  broker               String?       // INVESTMENT only (optional, nullable)
  walletAddress        String?       // CRYPTO only (optional, nullable)

  // lifecycle
  archivedAt           DateTime?     // soft-archive (BR-ACC-4)

  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt

  user                 User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])     // list endpoint's primary access
  @@index([userId, archivedAt])                // default-list filter excludes archived
  @@unique([userId, name])                     // (BR-ACC-5) account names are unique per user
}

enum AccountType {
  CASH
  BANK
  CREDIT
  INVESTMENT
  CRYPTO
  OTHER
}
```

`User` is **not** modified by this change. The
previous draft's `User.baseCurrency` column is
withdrawn; the user-level currency preference lives
in the future `user-preferences` change. See `BR-ACC-2`
and `BR-ACC-9` for the revised framing.

**Per-type field set (BR-ACC-8, Zod discriminated
union on `type`)**:

| `type`       | Required extras                                | Optional extras         |
| ------------ | ---------------------------------------------- | ----------------------- |
| `CASH`       | —                                              | —                       |
| `BANK`       | —                                              | —                       |
| `CREDIT`     | `creditLimit`, `statementDay`, `paymentDueDay` | —                       |
| `INVESTMENT` | —                                              | `broker: string`        |
| `CRYPTO`     | —                                              | `walletAddress: string` |
| `OTHER`      | —                                              | —                       |

The Zod schema rejects any extra field whose type
doesn't allow it (e.g. `creditLimit` on a `CASH`
account, `broker` on a `CRYPTO` account, `walletAddress`
on an `INVESTMENT` account, any extra on `OTHER`).

**Naming collision callout**: the Prisma model is
`FinancialAccount` because the Auth.js adapter's `Account`
model (OAuth link) is owned by the `auth` capability and
MUST NOT be modified by hand (auth spec, §"Entities").
The public API, DTOs, and event names use the unqualified
name `Account` so the URL space stays
`/api/accounts/...` and the user's mental model is
uncontaminated by the OAuth layer. The Prisma-vs-API
mapping (`FinancialAccount` ↔ `Account` DTO) lives in
`src/modules/accounts/infrastructure/repositories/financial-account.repository.ts`
as a private mapper. The Hono client (`hc<typeof honoApp>`)
exports `Account` types only. The `sdd-design` phase
finalizes the mapper fields.

**Decimal precision**: `Decimal(19, 4)` holds up to
9,999,999,999,999.9999 in any currency. Personal-finance
scale is well within this; reports aggregation never
overflows. Money is stored as `Decimal`, never `Float`.

**Indexes**:

- `@@index([userId, createdAt(sort: Desc)])` — primary
  access for `GET /api/accounts` (cursor pagination).
- `@@index([userId, archivedAt])` — the default-list
  filter (`includeArchived=false`) does
  `WHERE userId = ? AND archivedAt IS NULL`; the partial
  scan is fast with this index.
- `@@unique([userId, name])` — see `BR-ACC-5`.

**Cascade**: `FinancialAccount.user` uses
`onDelete: Cascade`. When the `user-deletion` change
deletes a `User`, all `FinancialAccount` rows go with it.

**Money invariants**:

- `currency` is uppercase ISO-4217, length 3, validated by
  Zod at every action boundary.
- `openingBalanceAmount` may be negative (credit-card
  balances can start negative when the user owes the
  bank; cash on hand starts at zero or positive).
- `openingBalanceDate` is a date (no time component);
  `transactions` will use it as the lower bound for
  "movements that count toward the current balance".

### Module structure

```
src/modules/accounts/
├── domain/
│   ├── entities/
│   │   └── account.entity.ts          # Account, AccountType, CreateAccountInput, UpdateAccountInput
│   ├── services/
│   │   └── accounts.service.ts        # list / create / get / update / archive / unarchive
│   └── errors.ts                      # AccountError, NotFoundError, ConflictError, ValidationError (thin wrappers over shared AppError)
├── application/
│   ├── actions/
│   │   ├── list-accounts.action.ts
│   │   ├── create-account.action.ts
│   │   ├── get-account.action.ts
│   │   ├── update-account.action.ts
│   │   ├── archive-account.action.ts
│   │   └── unarchive-account.action.ts
│   ├── dto/
│   │   ├── account.dto.ts             # Zod schemas + inferred TS types
│   │   └── list-accounts.dto.ts
│   └── routes.ts                      # OpenAPIHono sub-app, exported for the auth module's honoApp to mount
├── infrastructure/
│   ├── repositories/
│   │   └── financial-account.repository.ts  # Prisma impl; private mapper FinancialAccount ↔ Account DTO
│   └── events/
│       └── user-registered.subscriber.ts    # no-op logger.info in this change
└── index.ts                            # public exports: Account (entity + DTO), AccountsService, accountsRouter
```

The `src/modules/accounts/index.ts` is the module's
public surface: domain types + service handle +
`accountsRouter` (the Hono sub-app). The
`src/modules/auth/honoApp` mounts `accountsRouter.route("/accounts", ...)`
in the wiring layer (the exact wiring is a `sdd-design`
decision — the proposal only requires that the
`/api/accounts/*` routes resolve through the existing
Hono catch-all).

### Cross-module integration

- **Identity**: every action calls `auth()` from
  `@/modules/auth` and uses `session.user.id` as the
  scope key. No module reads the cookie, the header, or
  the `Session` table directly (auth spec
  §"Cross-module contracts > `auth()` server-side helper").
- **User.email**: not duplicated in `FinancialAccount`.
  Email belongs to `User` (auth spec,
  §"`User` is the single source of truth for identity").
- **`UserRegistered` event**: the module subscribes via
  the in-process dispatcher in `src/shared/events/`. In
  this change the handler is a **no-op**:
  `logger.info({ eventType: 'UserRegistered', userId })`.
  Default-account seeding is deferred to the
  `ui-accounts` change (which can flip a per-user
  preference; this change does not introduce that
  preference yet).
- **`OpenAPIHono` mounting**: the auth module exports
  `honoApp` (typed `OpenAPIHono<{ Variables: { user:
PublicUser | null } }>`). The `accounts` module exports
  `accountsRouter` (typed `OpenAPIHono`). The wiring in
  `app/api/[...path]/route.ts` (or a dedicated `api`
  module — `sdd-design` decides) mounts
  `accountsRouter.route("/accounts", ...)` on the
  `honoApp` instance. The catch-all then resolves
  `/api/accounts/*` to this module without touching the
  auth-specific routes.

### Behavior (business rules)

The full business-rule set lives in
`## Business rules` below. The most consequential rules
are listed here for the data-model + endpoints sections
to reference:

- **BR-ACC-1**: `type ∈ { CASH, BANK, CREDIT, INVESTMENT, CRYPTO, OTHER }`. `type` is
  immutable after creation (re-type is a delete + create).
- **BR-ACC-2**: every account's `currency` MUST be an
  uppercase ISO-4217 code, restricted to the whitelist
  `{ ARS, USD }` in this change (Zod refine on the DTO).
  The currency is selected at creation (no user-level
  default; this change does **not** add `User.baseCurrency`).
  Mutable via `PATCH` only if no transactions reference
  the account (future check; this change does not gate
  on transactions yet).
- **BR-ACC-3**: opening balance is a **hybrid via a Zod
  discriminated union on `openingBalanceMode: 'historical' | 'fresh'`**.
  The `'fresh'` variant requires no opening balance
  fields; the application sets `openingBalanceAmount = 0`
  and `openingBalanceDate = createdAt` (DB-level defaults
  back this up). The `'historical'` variant requires both
  `openingBalanceAmount` (Decimal as string, may be
  negative) and `openingBalanceDate` (UTC date, no time
  component). `PATCH` mutates `openingBalanceAmount` and
  `openingBalanceDate` directly (no discriminator — the
  mode is a creation-intent concern). `currentBalance` is
  derived (`openingBalanceAmount + sum(tx >= openingBalanceDate)`);
  the design phase decides whether to materialize a
  `currentBalance` cache.
- **BR-ACC-4**: archive is a state transition via
  `archivedAt DateTime?`. No hard delete in this change.
- **BR-ACC-5**: account `name` is unique per `userId`
  (enforced by `@@unique([userId, name])`).
- **BR-ACC-6**: `WHERE userId = ?` is enforced by every
  action and every repository method; the database has no
  row-level security in MVP, so the application layer is
  the only line of defense (matches the auth spec).
- **BR-ACC-7**: requests with a `WHERE userId = ?` mismatch
  return `404 NOT_FOUND`, never `403 FORBIDDEN` — same
  shape across "doesn't exist" and "not yours" so a user
  cannot enumerate other users' account IDs.
- **BR-ACC-8**: a Zod discriminated union on `type`
  enforces the per-type field set: `CASH` / `BANK` /
  `OTHER` accept no type-specific fields; `CREDIT`
  requires `creditLimit`, `statementDay`, `paymentDueDay`
  (all forbidden on every other type); `INVESTMENT`
  accepts an optional `broker: string`; `CRYPTO` accepts
  an optional `walletAddress: string`. The full
  per-type table lives in `### Data model`.
- **BR-ACC-9**: **no auth-table modifications in this
  change.** The 4 auth-owned tables (`User`, `Account`,
  `Session`, `VerificationToken`) are not touched. The
  previous draft's `User.baseCurrency` column is
  withdrawn; that write path lives in the future
  `user-preferences` change.
- **BR-ACC-10**: `origin-check` middleware (CSRF) runs
  on every mutating endpoint. Same rule as
  `POST /api/auth/register`. Mismatch → `403 FORBIDDEN`.

## Out of scope (this change)

- **Transactions** (separate `transactions` change).
  `currentBalance` derivation is sketched in `BR-ACC-3`
  but not implemented.
- **Multi-currency conversion / FX** (separate
  `fx-cache` change). This change ships with the
  `{ ARS, USD }` currency whitelist; `fx-cache` broadens
  the set when it lands.
- **Net-worth snapshots** (`networth-snapshot` change).
- **Reports** (`reports-mvp` change).
- **UI** (`ui-accounts` change — sign-in + onboarding +
  CRUD screens). This change ships the HTTP API only.
- **Loan accounts** (the enum is closed at
  `CASH | BANK | CREDIT | INVESTMENT | CRYPTO | OTHER` in
  this change; a future change can add `LOAN` or a
  sibling model if needed).
- **Default-account seeding on `UserRegistered`** —
  subscribed but a no-op logger. The seeding behavior is
  decided in `ui-accounts` (per-user preference).
- **Hard delete** (`DELETE /api/accounts/:id`) — deferred
  to `user-deletion` (cascade) or to a follow-up if the
  user prefers it in review.
- **Sharing / joint accounts** — out of scope for MVP.
  Every account is owned by exactly one `userId`.
- **Balance-history snapshots at the account level** —
  net-worth snapshots live in their own capability.
- **Recurring transactions / scheduled moves** — owned
  by `transactions` change.
- **Currency-formatted output formatting** — the API
  returns raw `Decimal` as a string (per JSON convention);
  the UI formats for display.

## Non-goals

- **Not building a banking aggregator.** No Plaid / Belvo /
  bank-API sync. Accounts are user-typed data only.
- **Not implementing real-time balance sync.** Balances
  are derived from the opening balance + (future)
  transactions. No push notifications, no bank webhooks.
- **Not introducing a new ledger primitive.** This change
  is `account` CRUD with opening balance; the double-entry
  ledger semantics live in `transactions`.
- **Not extending the Auth.js `Account` model.** The
  financial account is `FinancialAccount` in Prisma
  precisely to keep the auth tables untouched.

## Users and situations

| User                                        | Situation                                                                              | Touchpoint                                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| New user, just registered                   | Wants to start tracking their cash + bank accounts                                     | `POST /api/accounts` (UI is `ui-accounts`); opens a `CASH` account with `openingBalanceMode: 'fresh'` (defaults apply)        |
| Active user, adding a card                  | Has 2 bank accounts, wants to track a new credit card                                  | `POST /api/accounts` with `type = CREDIT`, `creditLimit`, `statementDay`, `paymentDueDay`                                     |
| Active user, adding an investment account   | Has cash + bank + credit cards, wants to track a brokerage (e.g. Balanz) in ARS or USD | `POST /api/accounts` with `type = INVESTMENT`, `broker: "Balanz"`, `currency: "ARS"` (or `"USD"`), historical opening balance |
| Active user, adding a crypto wallet         | Tracks a self-custody wallet alongside their bank accounts                             | `POST /api/accounts` with `type = CRYPTO`, `walletAddress: "0xABC..."`, `currency: "USD"`                                     |
| Active user, adding a generic / other       | Has a receivable from a friend they want to track outside the standard categories      | `POST /api/accounts` with `type = OTHER` and a descriptive `name` (no type-specific extras)                                   |
| Returning user, listing                     | Wants to see their active accounts                                                     | `GET /api/accounts` (default: `includeArchived = false`)                                                                      |
| Returning user, editing                     | Renames an account, updates the credit limit after a limit increase                    | `PATCH /api/accounts/:id`                                                                                                     |
| Returning user, fixing a backfilled amount  | Realized the historical balance was off by a few cents                                 | `PATCH /api/accounts/:id` with `{ openingBalanceAmount: "5000.50" }` (date unchanged)                                         |
| Returning user, closing                     | Cancelled a credit card, wants it out of the active list but visible in past reports   | `POST /api/accounts/:id/archive` (soft archive; recoverable via `POST /api/accounts/:id/unarchive`)                           |
| User on a second device                     | Same `userId`, fresh session; lists accounts and gets the same set                     | All routes are stateless except for the `auth()` call; cross-device consistency is automatic                                  |
| Multi-currency user (in this change)        | Has accounts in ARS and USD                                                            | Each account has its own `currency`; conversion is deferred to `fx-cache` (whitelist `{ ARS, USD }` in this change)           |
| User with 50+ accounts                      | Wants pagination on the list                                                           | Cursor pagination on `?limit=50&cursor=<id>`; index supports the scan                                                         |
| User tries to access another user's account | Enters a guessed `accountId`                                                           | `404 NOT_FOUND` — no enumeration leak                                                                                         |

## Business rules

1. **BR-ACC-1 — `type` is one of `CASH`, `BANK`, `CREDIT`,
   `INVESTMENT`, `CRYPTO`, `OTHER`.** The enum is closed
   in this change. `type` is immutable after creation;
   changing type is `delete + create` (and delete is not
   exposed in this change, so the user must archive and
   create a new one).
2. **BR-ACC-2 — `currency` is an uppercase ISO-4217 code,
   restricted to the whitelist `{ ARS, USD }` in this
   change.** Length 3. Validated by Zod
   (`z.string().length(3).regex(/^[A-Z]{3}$/)`) plus a
   `.refine()` that accepts only `"ARS"` or `"USD"`.
   The currency is **selected at creation** by the
   caller; no user-level default is inherited (this
   change does **not** add `User.baseCurrency`). Mutable
   via `PATCH`; this change does not gate on transactions
   (the gate is added when `transactions` lands — see
   `Decision gaps #3`).
3. **BR-ACC-3 — Opening balance is a hybrid via a Zod
   discriminated union on `openingBalanceMode:
'historical' | 'fresh'`.**
   - The **`fresh`** variant requires no opening balance
     fields in the input. The application sets
     `openingBalanceAmount = 0` and `openingBalanceDate =
createdAt`; both DB columns have matching defaults
     (`@default(0)` for the amount, and the date defaults
     to `createdAt` in the application layer at insert)
     so the row is valid even before the application
     layer runs.
   - The **`historical`** variant requires both
     `openingBalanceAmount` (Decimal as string, may be
     negative for credit-card debt) and `openingBalanceDate`
     (UTC date, no time component, must be ≤ today).
   - `PATCH /api/accounts/:id` mutates `openingBalanceAmount`
     and `openingBalanceDate` directly (no discriminator
     — the mode is a creation-intent concern; once the
     row exists, edits are field-level).
   - `currentBalance` is derived (`openingBalanceAmount +
sum(tx.amount where tx.accountId = id and tx.date >=
openingBalanceDate)`) in the application layer. The
     `transactions` change owns the derivation
     implementation; this change exposes `currentBalance`
     as `null` in the DTO until that lands (the field is
     reserved, not populated).
   - **Why a discriminated union, not a single shape with
     defaults**: the two paths express genuinely different
     user intent (backfill vs start-fresh) and the
     discriminator makes the contract explicit at the API
     boundary, eliminating partial-input ambiguity
     (providing only `amount` without `date`, or vice
     versa) at the schema level rather than via implicit
     defaults.
4. **BR-ACC-4 — Soft archive via `archivedAt`.** No
   hard delete. `POST /api/accounts/:id/archive` sets
   `archivedAt = now()`; `POST /api/accounts/:id/unarchive`
   clears it. Archived accounts are excluded from
   `GET /api/accounts` unless `?includeArchived=true`.
   Archived accounts are still counted in any future
   snapshot/reports aggregation (because the row is
   there). Idempotent transitions are not errors.
5. **BR-ACC-5 — `name` is unique per `userId`.** Enforced
   by `@@unique([userId, name])`. The Zod schema runs
   a pre-check before insert; the unique constraint is
   the authoritative gate (catches race conditions).
   Case-sensitive uniqueness (Argentina uses
   "MercadoPago" and "Mercadopago" as different names —
   we respect user intent).
6. **BR-ACC-6 — `WHERE userId = ?` everywhere.** Every
   action and every repository method takes the `userId`
   from `auth()` and applies it as a Prisma `where`. The
   database has no row-level security in MVP; the
   application layer is the only line of defense (same
   rule as the auth spec).
7. **BR-ACC-7 — 404, not 403, on cross-user access.** A
   request for another user's `accountId` returns
   `404 NOT_FOUND` with the same response shape as a
   truly-missing account. No enumeration leak.
8. **BR-ACC-8 — Discriminated union on `type`** enforces
   the per-type field set documented in `### Data model`:
   `CASH` / `BANK` / `OTHER` accept no type-specific
   fields; `CREDIT` requires `creditLimit`,
   `statementDay`, `paymentDueDay` (all forbidden on
   every other type); `INVESTMENT` accepts an optional
   `broker: string` (forbidden on every other type);
   `CRYPTO` accepts an optional `walletAddress: string`
   (forbidden on every other type). `statementDay` and
   `paymentDueDay` are `z.number().int().min(1).max(28)`
   (28 is the safe upper bound for any month).
   `creditLimit` is a Decimal string; `broker` and
   `walletAddress` are non-empty strings when provided.
   The Zod schema is `z.discriminatedUnion("type", [...])`,
   one branch per enum value.
9. **BR-ACC-9 — No auth-table modifications in this
   change.** The 4 auth-owned tables (`User`, `Account`,
   `Session`, `VerificationToken`) are not touched. The
   previous draft's `User.baseCurrency` column is
   withdrawn; the user-level currency preference lives
   in the future `user-preferences` change. This change
   owns zero columns on the auth-owned `User` table.
10. **BR-ACC-10 — `origin-check` middleware on every
    mutating endpoint.** Same rule as `POST
/api/auth/register`. Mismatched or missing `Origin`
    returns `403 FORBIDDEN`. The middleware is reused
    from the auth module's Hono middleware (exported as
    `originCheck` from `@/modules/auth` if not already
    exported — design phase confirms; if it isn't
    exported, this change exports it).

## Implications and impact

| Area                      | Impact                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database**              | 1 new Prisma model (`FinancialAccount`) + 1 extended enum (`AccountType` grows from 3 to 6 values: `CASH`, `BANK`, `CREDIT`, `INVESTMENT`, `CRYPTO`, `OTHER`). One migration: `2026XXXXXX_add_financial_accounts`. The 4 auth-owned tables are completely untouched (BR-ACC-9).                                                           |
| **Migrations**            | `prisma migrate dev` locally; `prisma migrate deploy` in CI / production. Idempotent.                                                                                                                                                                                                                                                     |
| **API surface**           | 6 Hono routes under `/api/accounts/*`. Routes are mounted via `accountsRouter` on the existing `honoApp` from `@/modules/auth`. No new top-level router. No new middleware (origin-check is reused).                                                                                                                                      |
| **Hono wiring**           | New sub-app `accountsRouter` (`OpenAPIHono`) exported from `src/modules/accounts/application/routes.ts`. The mounting site (the `honoApp` instance in the auth module's catch-all vs. a dedicated `src/modules/api/` Hono host) is a `sdd-design` decision. Either choice keeps the URL space at `/api/accounts/*`.                       |
| **Cross-module events**   | Subscribes to `UserRegistered` via `src/shared/events/`; handler is a no-op `logger.info` in this change. The auth spec already names `accounts-ledger` as the consumer.                                                                                                                                                                  |
| **Auth-table impact**     | None. This change does not modify any auth-owned table. The `User.baseCurrency` write path lives in the future `user-preferences` change.                                                                                                                                                                                                 |
| **Strict TDD**            | Activated. Domain services and DTO schemas are unit-tested (RED → GREEN → REFACTOR per `tasks.md`). Repository methods get integration tests against a Postgres testcontainer in CI (matches the slice-c deviation noted in `auth-foundation-slice-c/verify-report.md`: real Postgres in CI is part of the test strategy going forward).  |
| **Coverage**              | ≥ 80% on `src/modules/accounts/{domain,application,infrastructure}/**` (lines, branches, functions, statements). Enforced in `vitest.config.ts#coverage.include` (the path is added; thresholds stay at 80/80/80/80 per the auth spec).                                                                                                   |
| **Money handling**        | `Decimal(19, 4)` columns; never `Float`. JSON serialization is the `Decimal` value as a string (Prisma client default for `Decimal`); the UI parses with the same library. No silent rounding.                                                                                                                                            |
| **Indexes**               | `@@index([userId, createdAt(sort: Desc)])`, `@@index([userId, archivedAt])`, `@@unique([userId, name])`. The first two are scoped to `userId` (no full-table scans; user-fanout is the dominant access pattern).                                                                                                                          |
| **Cursor pagination**     | `GET /api/accounts` uses opaque cursor (`base64({"createdAt":"...","id":"..."})`); the design phase owns the encoding. Initial limit 50, max 200.                                                                                                                                                                                         |
| **CI**                    | No new CI jobs. The existing 4-job CI (`lint`, `test`, `build`, `security`) from `auth-foundation-slice-c` covers this change. New security tests are added if the design surfaces any (likely none in this change — the security posture is the same as the auth spec's; cross-user enumeration is the main concern and is unit-tested). |
| **Bilingual docs**        | This proposal mirrored at `Documents-es/openspec/changes/accounts-ledger/proposal.md` in the same commit (per AGENTS.md §13.3).                                                                                                                                                                                                           |
| **Stack invariants**      | Stack v2 is closed (Next.js 16 + Auth.js v5 + Prisma 6 + Postgres + Hono + Zod + Vitest + pnpm + Fly.io). No new runtime deps; `decimal.js` is not added (Prisma's `Decimal` is enough for serialization).                                                                                                                                |
| **Naming collision risk** | `FinancialAccount` (Prisma) vs `Account` (DTO/API) is a known foot-gun. Mitigated by: a private mapper in the repository, a static check in `index.test.ts` that asserts no `FinancialAccount` symbol leaks out of `src/modules/accounts/`, and a code-review checklist item.                                                             |

## Edge cases (product)

| Scenario                                                                                          | Behavior                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create with `type = CREDIT` but no `creditLimit`                                                  | `400 VALIDATION_ERROR` (BR-ACC-8; Zod discriminated union).                                                                                                        |
| Create with `type = CASH` and a `creditLimit`                                                     | `400 VALIDATION_ERROR` (BR-ACC-8).                                                                                                                                 |
| Create with `type = INVESTMENT` and a `walletAddress`                                             | `400 VALIDATION_ERROR` (BR-ACC-8; `walletAddress` is forbidden on `INVESTMENT`).                                                                                   |
| Create with `type = CRYPTO` and a `broker`                                                        | `400 VALIDATION_ERROR` (BR-ACC-8; `broker` is forbidden on `CRYPTO`).                                                                                              |
| Create with `type = OTHER` and any type-specific field (`creditLimit`, `broker`, `walletAddress`) | `400 VALIDATION_ERROR` (BR-ACC-8; `OTHER` accepts no extras).                                                                                                      |
| Create with `type = INVESTMENT` and `broker: "Balanz"` (no amount/date)                           | `400 VALIDATION_ERROR` (BR-ACC-3; `historical` variant requires both fields, `fresh` variant omits both — partial fields are rejected).                            |
| Create with `currency = "ars"` (lowercase)                                                        | `400 VALIDATION_ERROR` (BR-ACC-2; Zod rejects non-uppercase).                                                                                                      |
| Create with `currency = "EUR"`                                                                    | `400 VALIDATION_ERROR` (BR-ACC-2; only `{ ARS, USD }` accepted in this change).                                                                                    |
| Create with `openingBalanceMode: 'fresh'` and no opening balance fields                           | `201`; row is created with `openingBalanceAmount = 0` and `openingBalanceDate = createdAt` (BR-ACC-3).                                                             |
| Create with `openingBalanceMode: 'historical'` and both fields provided                           | `201`; row is created with the provided values (BR-ACC-3).                                                                                                         |
| Create with `openingBalanceMode: 'historical'` but only `openingBalanceAmount` (no date)          | `400 VALIDATION_ERROR` (BR-ACC-3; partial fields are rejected; both-or-neither enforced by the discriminated union).                                               |
| Create with `openingBalanceMode: 'historical'` and a future `openingBalanceDate`                  | `400 VALIDATION_ERROR` (BR-ACC-3; `openingBalanceDate` must be ≤ today for the `historical` variant).                                                              |
| Create with `openingBalanceDate` in the past (no `openingBalanceMode` specified)                  | Allowed only with `openingBalanceMode: 'historical'`; otherwise rejected.                                                                                          |
| `PATCH` updating only `openingBalanceAmount`                                                      | Allowed (BR-ACC-3; PATCH mutates the field directly, no discriminator).                                                                                            |
| `PATCH` updating only `openingBalanceDate`                                                        | Allowed (BR-ACC-3).                                                                                                                                                |
| Create with negative `openingBalanceAmount` on `type = CASH`                                      | `400 VALIDATION_ERROR` (cash-on-hand cannot start negative; enforced by Zod refine).                                                                               |
| Create with negative `openingBalanceAmount` on `type = CREDIT`                                    | Allowed (credit-card debt is negative from the user's perspective).                                                                                                |
| Create with duplicate `name` (same `userId`)                                                      | `409 ACCOUNT_NAME_TAKEN` from the unique constraint.                                                                                                               |
| Create with `name` that exists under a different `userId`                                         | Allowed; uniqueness is per-user (BR-ACC-5).                                                                                                                        |
| List when user has 0 accounts                                                                     | `200 { data: [] }`.                                                                                                                                                |
| List when user has 50 accounts, default pagination                                                | Returns 50, with `nextCursor` in `meta.nextCursor` (design phase owns the envelope shape).                                                                         |
| Get another user's `accountId`                                                                    | `404 NOT_FOUND` (BR-ACC-7; identical to "doesn't exist").                                                                                                          |
| Get an archived account without `?includeArchived=true`                                           | `404 NOT_FOUND`. With `?includeArchived=true`, `200` with the row.                                                                                                 |
| `PATCH` with `type` change attempt                                                                | `400 VALIDATION_ERROR` (`type` is immutable; BR-ACC-1).                                                                                                            |
| `PATCH` with `userId` change attempt                                                              | `400 VALIDATION_ERROR` (Zod strips unknown fields; the Prisma update does not touch `userId`).                                                                     |
| `POST /archive` on an already-archived account                                                    | Idempotent; returns the row unchanged (BR-ACC-4).                                                                                                                  |
| `POST /unarchive` on an active account                                                            | Idempotent; returns the row unchanged.                                                                                                                             |
| Origin header missing on `POST /api/accounts`                                                     | `403 FORBIDDEN` (BR-ACC-10).                                                                                                                                       |
| Origin header from `https://evil.com` on `POST /api/accounts`                                     | `403 FORBIDDEN` (BR-ACC-10).                                                                                                                                       |
| Session expired mid-request                                                                       | `401 UNAUTHORIZED` (handled by the auth module's `auth()` returning `null`).                                                                                       |
| Concurrent create with the same `name` from two devices                                           | One wins, the other gets `409 ACCOUNT_NAME_TAKEN` (race resolved by the unique constraint).                                                                        |
| Currency changed in `PATCH` after the account has transactions (future `transactions` change)     | The future change blocks `currency` change when transactions reference the account. This change does not gate; the `Decision gaps #3` flag covers the gate design. |

## Decision gaps (open for the next proposal/spec round)

| #   | Question                                                                                                                                                                | Default if not answered                                                                                                                                                                                                                                                 | How to resolve                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | When does `fx-cache` land relative to `accounts-ledger`? Are we sure the `{ ARS, USD }` whitelist is enough for MVP?                                                    | `fx-cache` lands later. `accounts-ledger` ships with the `{ ARS, USD }` whitelist (Q2 corrected answer); `fx-cache` broadens the whitelist when it lands.                                                                                                               | `sdd-spec` for `accounts` re-confirms; user calls it in review.                                                     |
| 2   | Should `currentBalance` be a denormalized column or purely derived?                                                                                                     | Purely derived in the application layer (no column). The `transactions` change decides whether to materialize a cache.                                                                                                                                                  | `sdd-design` decides based on the read/write ratio the `transactions` change surfaces.                              |
| 3   | When `transactions` lands, can `currency` be mutated while transactions exist?                                                                                          | No. The `transactions` change adds a gate: `PATCH /api/accounts/:id { currency }` returns `409 CURRENCY_LOCKED` if any `Transaction` row references the account.                                                                                                        | Tracked in the future change.                                                                                       |
| 4   | Cursor pagination — opaque base64 or a signed cursor?                                                                                                                   | Opaque base64 of `{ createdAt, id }`. No signing in MVP (the cursor is not security-sensitive — it only filters; a forged cursor just returns a different page).                                                                                                        | `sdd-design` decides.                                                                                               |
| 5   | Should the `origin-check` middleware be exported from `@/modules/auth` (for reuse) or duplicated here?                                                                  | Exported from `@/modules/auth` (the `originCheck` symbol is added in `sdd-design` if not already exported). No duplication.                                                                                                                                             | Confirmed by the auth spec's `index.test.ts` static check (which fails if non-exported internals are reached into). |
| 6   | Where does the Hono catch-all live — the auth module's `honoApp` or a dedicated `src/modules/api/` host?                                                                | The auth spec says `honoApp` is exported from `src/modules/auth/index.ts`. The `docs/architecture.md` diagram shows it in `src/modules/api/`. The discrepancy is resolved in `sdd-design` (likely: it stays in `src/modules/auth` and the architecture doc is amended). | `sdd-design` reconciles the two sources.                                                                            |
| 7   | (Removed — `User.baseCurrency` is not added by this change. The user-level currency preference lives in the future `user-preferences` change. Tracked there, not here.) | —                                                                                                                                                                                                                                                                       | —                                                                                                                   |
| 8   | Multi-device / CRDT concerns?                                                                                                                                           | Out of scope in MVP. The app is last-write-wins on `PATCH`. Concurrent edits on different devices can overwrite each other; the next change can add an `updatedAt`-based optimistic-concurrency check (`If-Match` header) if the user wants it.                         | `sdd-design` flags it. Out of scope for this change.                                                                |
| 9   | What happens to archived accounts in reports / net-worth snapshots (future)?                                                                                            | Archived accounts are still counted (the row is there, `archivedAt` is metadata, not a hard delete).                                                                                                                                                                    | `networth-snapshot` and `reports-mvp` confirm in their own specs.                                                   |

## Acceptance (evidence the reviewer will see)

1. **Tests pass**: `pnpm test` exits 0 with all 6 actions
   covered by domain unit tests + repository integration
   tests. Coverage on `src/modules/accounts/**` ≥ 80%
   (lines, branches, functions, statements). The
   enumeration test (BR-ACC-7) and the discriminated-union
   tests (BR-ACC-8) are explicit test names.
2. **Manual smoke**: `pnpm run dev` →
   - Sign in via the auth slice (existing flow).
   - `POST /api/accounts` with `{ name: "Efectivo",
type: "CASH", currency: "ARS", openingBalanceMode:
"historical", openingBalanceAmount: "5000.00",
openingBalanceDate: "2026-06-01" }` →
     `201 { data: AccountDetail }`.
   - `POST /api/accounts` with `{ name: "Caja USD",
type: "CASH", currency: "USD", openingBalanceMode:
"fresh" }` → `201` (row created with
     `openingBalanceAmount = 0`, `openingBalanceDate =
createdAt`).
   - `POST /api/accounts` with `{ name: "Balanz",
type: "INVESTMENT", currency: "ARS", broker: "Balanz",
openingBalanceMode: "historical", openingBalanceAmount:
"150000.00", openingBalanceDate: "2026-01-15" }` →
     `201`.
   - `GET /api/accounts` → returns the row.
   - `GET /api/accounts/<id>` → returns the row.
   - `POST /api/accounts/<id>/archive` →
     `archivedAt` is set; `GET /api/accounts` excludes it.
   - `POST /api/accounts/<id>/unarchive` → cleared.
   - `POST /api/accounts` with `type = "CREDIT"` and no
     `creditLimit` → `400 VALIDATION_ERROR`.
   - `POST /api/accounts` with `type = "CASH"` and
     `creditLimit` → `400 VALIDATION_ERROR`.
   - `POST /api/accounts` with `type = "INVESTMENT"` and
     `walletAddress` → `400 VALIDATION_ERROR`.
   - `POST /api/accounts` with `currency = "EUR"` →
     `400 VALIDATION_ERROR` (not in `{ ARS, USD }`).
   - `POST /api/accounts` with `openingBalanceMode:
"historical"` and no `openingBalanceAmount` →
     `400 VALIDATION_ERROR`.
   - `GET /api/accounts/<other-user-id>` → `404`.
   - `POST /api/accounts` without `Origin` header → `403`.
3. **Adversarial review**: a `reviewer` subagent audits
   the diff with focus on:
   - Cross-user enumeration (BR-ACC-7; tests at the
     service and the HTTP layer).
   - Discriminated-union correctness on `type`
     (BR-ACC-8; tests on every `CASH` / `BANK` /
     `CREDIT` / `INVESTMENT` / `CRYPTO` / `OTHER` path
     with the matching per-type extras).
   - Discriminated-union correctness on
     `openingBalanceMode` (BR-ACC-3; tests on both
     `fresh` and `historical` variants and on
     partial-input rejection).
   - Money invariants (Decimal only, no Float, JSON
     serialization is a string).
   - `WHERE userId = ?` discipline (BR-ACC-6; static
     check in `accounts.service.test.ts` that fails if a
     repository method is called without `userId`).
   - `FinancialAccount` vs `Account` namespace leak
     (static test in `index.test.ts`).
   - No auth-table modifications (BR-ACC-9); the change
     only touches the new `FinancialAccount` model and
     the extended `AccountType` enum.
4. **GGA**: `gga run` exits 0. Output pasted in the
   handoff. (Per AGENTS.md §2.6, if the harness's
   self-review fails on `openrouter`, on-disk
   verification is the gate.)
5. **Bilingual docs**:
   `openspec/changes/accounts-ledger/proposal.md` and
   `Documents-es/openspec/changes/accounts-ledger/proposal.md`
   are in sync. Drift detection runs in the same commit.
6. **Architecture doc updated**: `docs/architecture.md`
   gains an "Accounts" section that this proposal links
   to (mirrored in `Documents-es/docs/architecture.md`).

## Risks (mitigated)

| Risk                                                               | Mitigation                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FinancialAccount` ↔ `Account` namespace leak                     | Private mapper in `financial-account.repository.ts`; static test in `index.test.ts` greps for `FinancialAccount` outside `src/modules/accounts/` and fails if found. Code-review checklist item.                                                                                                                                                |
| No auth-table modification in this change                          | BR-ACC-9 explicitly states the 4 auth-owned tables are not touched. The auth spec's "Auth.js-owned tables MUST NOT be modified by hand" rule is fully satisfied. The `User.baseCurrency` write path lives in the future `user-preferences` change. The previous draft's `User.baseCurrency` default has been withdrawn.                         |
| Money rounding                                                     | `Decimal(19, 4)` only. No `Float`. JSON serialization is the `Decimal` as a string. The `currentBalance` derivation sums `Decimal`s and returns a `Decimal`. No silent conversion to cents; no `parseFloat`.                                                                                                                                    |
| Cross-user enumeration                                             | BR-ACC-7 + 404-not-403 + identical response shape. Unit-tested at the service and HTTP layer.                                                                                                                                                                                                                                                   |
| Discriminated-union regression on `type`                           | BR-ACC-8 enforced by Zod at the action boundary. Tests cover all transitions across the 6 enum values × has-extras / lacks-extras (the matrix is in `### Data model`).                                                                                                                                                                          |
| Concurrent duplicate-name creates                                  | `@@unique([userId, name])` is the authoritative gate. Pre-check + race-safe insert (the unique-violation surfaces as `P2002`, mapped to `409 ACCOUNT_NAME_TAKEN`).                                                                                                                                                                              |
| Proposal question round timed out; defaults may not match the user | This proposal carries a `## Proposal question round` section explicitly flagging the 4 defaults. Q1, Q2, and Q3 were amended in the same SDD cycle after the user supplied corrections; Q4 was confirmed as-is. If the user disagrees with the corrections during a second review, the affected section(s) are amended again before `sdd-spec`. |
| Cursor pagination reads are O(N) on `createdAt` + `id`             | Composite index `@@index([userId, createdAt(sort: Desc)])` keeps the scan tight per user. The design phase confirms the cursor encoding matches the index.                                                                                                                                                                                      |
| Origin-check not currently exported from `@/modules/auth`          | `sdd-design` adds the export (or documents the duplication if export is rejected). The `originCheck` middleware's tests live in the auth module; this change's tests assert the symbol is importable.                                                                                                                                           |
| Strict-TDD velocity                                                | RED → GREEN → REFACTOR per task. The domain layer is rule-heavy (10 BRs, mostly Zod-validated); the unit tests are small. Integration tests run in CI against testcontainers (per slice-c deviation resolution).                                                                                                                                |

## Review workload forecast (mandatory)

3 chained PRs to `develop`, **all over the 400-line
budget**. The user explicitly accepted the overage in the
`auth-foundation` planning (`HANDOFF.md` §"Forecast of
chained PRs"). The same applies here. The first slice is
the largest (it carries the Prisma model, the migration,
the Zod DTOs, and the bulk of the domain layer). Slices
2 and 3 are the Hono wiring + the cross-cutting tests.

| Slice                                         | Tasks (est.) | Lines (est.) | Overage vs 400 |
| --------------------------------------------- | ------------ | ------------ | -------------- |
| A — Data model + domain + application + DTOs  | T-A01..T-A12 | ~700         | 1.75×          |
| B — Hono routes + origin-check + auth wiring  | T-B01..T-B06 | ~500         | 1.25×          |
| C — Integration tests + security tests + docs | T-C01..T-C08 | ~600         | 1.5×           |
| **Total**                                     | **~26**      | **~1,800**   | —              |

The apply-phase worker surfaces the actual `git diff
--stat` numbers at apply time; the parent decides whether
to re-forecast to 4 slices if a reviewer pushes back.

## Change ordering downstream

After this change, the following are unblocked:

1. **`transactions`** — the next high-priority capability.
   Owns `Transaction` model, double-entry-style
   bookkeeping, the `currentBalance` derivation
   (BR-ACC-3). Depends on `accounts` + `auth`.
2. **`fx-cache`** — owns FX rates + the conversion API.
   Unblocks multi-currency conversion in `accounts` and
   `reports`. Depends on `auth` (independent of
   `accounts-ledger`, but ordered here because reports
   consume FX).
3. **`networth-snapshot`** — owns periodic net-worth
   computation. Depends on `accounts` + `fx-cache`.
4. **`reports-mvp`** — depends on `accounts` +
   `transactions` + `fx-cache` + `networth-snapshot`.
5. **`ui-accounts`** — owns the account CRUD screens,
   the onboarding flow (default-account seeding per
   `UserRegistered` per the auth spec), and the
   `User.baseCurrency` preference UI.
6. **`pwa-shell`** — depends on at least one protected
   resource (`ui-accounts` is the natural fit).
7. **`fly-deploy`** — independent; lands at the end.

## Next step

After the user approves this proposal (Q1, Q2, and Q3
were amended per user review; Q4 was confirmed as-is —
see the `## Proposal question round` section), the
next phase is `sdd-spec`:

- Produce `openspec/changes/accounts-ledger/spec.md` with
  the delta-spec entries (the BR-ACC-1..10 rules, the
  endpoint shapes, the DTO Zod schemas, the cross-module
  contract with `auth`), mirrored in
  `Documents-es/openspec/changes/accounts-ledger/spec.md`.
- Then `sdd-design` (Prisma-vs-API mapper, the Hono
  sub-app wiring, the cursor encoding, the
  `originCheck` export decision, the
  `currentBalance` derivation stub, the security-test
  scope).
- Then `sdd-tasks` (T-A01..T-A12, T-B01..T-B06,
  T-C01..T-C08 with TDD evidence columns).
- Then `sdd-apply` (3 chained PRs to `develop`:
  Slice A data + domain, Slice B routes + wiring,
  Slice C integration + security + docs).
- Then `sdd-verify`, `sdd-sync` (canonical
  `openspec/specs/accounts/spec.md` written),
  `sdd-archive` (move
  `openspec/changes/accounts-ledger/` to
  `openspec/changes/archive/`).
