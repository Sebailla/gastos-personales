# Proposal — `accounts-ledger`

**Status**: draft · **Author**: Sebastián Illa
**Created**: 2026-06-18 · **Target slice**: MVP-2 (financial entities) · **Capability**: accounts
**Upstream**: global SDD preflight (interactive, both, auto-forecast, 400 lines)
**Supersedes**: v1 proposal (PR #26, closed unmerged on 2026-06-18) — requirements expanded after user review. v1 git history is reference-only; its content is **obsolete**.

> **v2 note**: this is the second write of this proposal. v1 modeled the capability as **flat** — one row per account, single currency per account, no sub-entity structure. v2 introduces **per-type structure** (multiple sub-accounts per bank, multiple cards per issuer, multiple investment accounts per broker; all three entities are free-text for now), a **currency whitelist + display-only FX conversion**, and a **new `/balance` endpoint** with `?displayCurrency` support.

## Proposal question round (process note)

I attempted one round of product questions before writing this proposal. The structured interviewer (`contact_supervisor` with `interview_request`) rejected the option payloads on every retry; the supervisor's `need_decision` channel timed out after 10 minutes on a parallel attempt. I proceeded with explicit defaults in the **Decision gaps** section; the reviewer can override any of them before approval.

The three product questions I would have asked:

1. **FX rate staleness** — when `fx-cache` returns a rate that is older than the most recent business day (weekend, holiday, rate provider outage >24h), what should `GET /api/accounts/:id/balance?displayCurrency=…` return?
2. **Free-text normalization** — for the free-text fields `bankName` (BANK), `issuer` (CREDIT), `broker` (INVESTMENT), do we store verbatim or normalize?
3. **Display block default** — is the `display` block always present in the DTO, or only when the caller passes `?displayCurrency` explicitly?

Defaults chosen and rationale live in **Decision gaps** (Q1/Q2/Q3 below).

## Why

The `accounts` capability is the second capability in the SDD roadmap and the first one that owns user-owned financial data. `auth-foundation` (Slices A + B + C, all merged to `develop`) made `userId` trustworthy on every request. The next step is to let each user record what they own — cash on hand, bank accounts, credit cards, investments, crypto wallets, anything else — so that downstream capabilities (`transactions`, `networth-snapshot`, `reports-mvp`) have something to attach to.

v1 of this proposal shipped a **flat model** — one row per account, single currency per account, no sub-entity structure — and the user expanded the requirements after review. The product gap that v2 closes:

- A user has **multiple bank accounts at the same bank** ("caja de ahorro en Galicia" and "cuenta corriente en Galicia" should be two `FinancialAccount` rows under `bankName = "Banco Galicia"`).
- A user has **multiple cards from different issuers** ("Visa Galicia", "Mastercard Santander", "Amex" are not the same row).
- A user has **multiple investment accounts at multiple brokers**, holding different **investment types** (stocks, bonds, mutual funds, certificates of deposit, other).
- The user wants to **read an account in a different currency** ("how much is my ARS savings account worth in USD right now?") **without storing the converted value**.
- The existing currency support in v1 was implicit and unconstrained; v2 constrains it to `{ ARS, USD, EUR }` and points at a deferred FX rate source owned by `fx-cache`.

PR #26 (v1) was closed unmerged on 2026-06-18 because the requirements above landed after the v1 PR opened. This v2 supersedes v1; v1 git history is reference-only and its content is obsolete.

## What

A self-contained `accounts` module under `src/modules/accounts/{domain,application,infrastructure}/...`, backed by a new `FinancialAccount` Prisma model, exposed through 7 Hono endpoints under `/api/accounts`, with a deferred FX rate source contract that `fx-cache` will fulfil.

| Concern                                                           | Responsibility                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Domain types and business rules                                   | **`accounts` module — `src/modules/accounts/domain/`**                                                 |
| Use cases (create, list, update, archive, unarchive, get-balance) | **`accounts` module — `src/modules/accounts/application/`**                                            |
| HTTP surface                                                      | **Hono** mounted at the existing `app/api/[...path]/route.ts` catch-all                                |
| Persistence                                                       | **Prisma 6** — new `FinancialAccount` model + 3 enums (`AccountType`, `AccountKind`, `InvestmentType`) |
| Validation                                                        | **Zod** discriminated unions at every action boundary, including per-type required fields              |
| FX rate source                                                    | **Deferred** to `fx-cache` — this change defines the contract only (`FxRateProvider` interface)        |
| FX rate caching or storage                                        | **Not in this change** — `fx-cache` owns storage and the rate provider                                 |
| Test framework                                                    | **Vitest** under `pnpm test`; strict TDD on the domain layer                                           |

### Endpoints

| Method | Path                          | Auth    | Behavior                                                                                                                                                                                                                                                                                                          |
| ------ | ----------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/accounts`               | session | Cursor pagination, filters: `?includeArchived`, `?type`, `?bankName` (BANK only), `?issuer` (CREDIT only). Returns native balance only — no `display` block (lists are at most ~20 items; mixing currencies inline is a future enhancement, see Decision gaps D6).                                                |
| POST   | `/api/accounts`               | session | Create with type-specific Zod discriminated union (per-type required fields enforced at validation). 201 on success, 400 on validation, 409 on duplicate name within user's namespace, origin-checked.                                                                                                            |
| GET    | `/api/accounts/:id`           | session | Returns the full account with type-specific fields populated and a `display` block (`{ amount, currency, fxRate, fxAsOf }`) reflecting the requested `?displayCurrency` (default = native).                                                                                                                       |
| GET    | `/api/accounts/:id/balance`   | session | **NEW in v2**: returns native balance + a `display` block with optional `?displayCurrency` conversion (default = native). 503 `FX_UNAVAILABLE` if the provider is down; 409 `FX_NOT_SUPPORTED` if the pair is not in the supported set.                                                                           |
| PATCH  | `/api/accounts/:id`           | session | Update mutable fields. **Forbidden**: `type`, `userId`, `openingBalanceMode` (immutable post-creation). Mutable: `name`, the per-type required fields for the existing type, `archivedAt` (via the dedicated endpoints), `creditLimit` / `statementDay` / `paymentDueDay` for CREDIT, `walletAddress` for CRYPTO. |
| POST   | `/api/accounts/:id/archive`   | session | Idempotent soft archive (sets `archivedAt = now()` if not already set).                                                                                                                                                                                                                                           |
| POST   | `/api/accounts/:id/unarchive` | session | Idempotent unarchive (clears `archivedAt`).                                                                                                                                                                                                                                                                       |

### Data model

The new Prisma model and three enums. Auth.js-owned models (`User`, `Account`, `Session`, `VerificationToken`) are **not** modified (BR-ACC-9).

```prisma
// prisma/schema.prisma (additive)

model FinancialAccount {
  id                   String        @id @default(cuid())
  userId               String

  // identity
  name                 String        // user-chosen display name; unique per user (BR-ACC-5)
  type                 AccountType

  // currency (one of ARS, USD, EUR — BR-ACC-2)
  currency             String        @db.Char(3)

  // opening balance hybrid (BR-ACC-3) — openingBalanceMode lives in the DTO;
  // the amount/date columns below are what gets persisted
  openingBalanceAmount Decimal       @default(0)  @db.Decimal(19, 4)
  openingBalanceDate   DateTime      @db.Date

  // CREDIT-only fields (required when type = CREDIT; forbidden otherwise — Zod)
  issuer               String?
  creditLimit          Decimal?      @db.Decimal(19, 4)
  statementDay         Int?          // 1..28
  paymentDueDay        Int?          // 1..28

  // BANK-only fields (required when type = BANK)
  bankName             String?
  accountKind          AccountKind?

  // INVESTMENT-only fields (required when type = INVESTMENT)
  broker               String?
  investmentType       InvestmentType?

  // CRYPTO-only field (optional)
  walletAddress        String?

  // lifecycle
  archivedAt           DateTime?

  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt

  user                 User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, archivedAt])
  @@index([userId, type])
  @@unique([userId, name])
}

enum AccountType {
  CASH
  BANK
  CREDIT
  INVESTMENT
  CRYPTO
  OTHER
}

enum AccountKind {
  SAVINGS
  CHECKING
}

enum InvestmentType {
  STOCKS
  BONDS
  MUTUAL_FUNDS
  CERTS_OF_DEPOSIT
  OTHER
}
```

**Naming collision (carried from v1)**: `FinancialAccount` at the Prisma layer, `Account` at the public API/DTO layer. Auth.js owns the `Account` OAuth-link model; we do not touch it. The DTO layer performs the mapping at every boundary.

### Behavior

#### Per-type required fields (BR-ACC-8)

The create endpoint uses a Zod **discriminated union** on `type`. Per-type required fields:

| `type`       | Required fields                                                      | Optional fields                                                       |
| ------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `CASH`       | `currency`                                                           | `name`, `openingBalanceAmount`, `openingBalanceDate`                  |
| `BANK`       | `bankName`, `accountKind`, `currency`                                | `name`, `openingBalanceAmount`, `openingBalanceDate`                  |
| `CREDIT`     | `issuer`, `creditLimit`, `statementDay`, `paymentDueDay`, `currency` | `name`, `openingBalanceAmount`, `openingBalanceDate`                  |
| `INVESTMENT` | `broker`, `investmentType`, `currency`                               | `name`, `openingBalanceAmount`, `openingBalanceDate`                  |
| `CRYPTO`     | `currency`                                                           | `walletAddress`, `name`, `openingBalanceAmount`, `openingBalanceDate` |
| `OTHER`      | `currency`                                                           | `name`, `openingBalanceAmount`, `openingBalanceDate`                  |

`statementDay` and `paymentDueDay` are validated to be in `[1, 28]` (February safety — see Decision gaps D4). `currency` is validated against `{ ARS, USD, EUR }` (BR-ACC-2). The shape of `openingBalanceAmount` and `openingBalanceDate` depends on `openingBalanceMode`:

- `'historical'`: `openingBalanceAmount` is **required** (string in DTO, coerced to `Decimal`); `openingBalanceDate` is **required** and must be ≤ today.
- `'fresh'`: `openingBalanceAmount` defaults to `0`; `openingBalanceDate` defaults to `createdAt`.

#### Update semantics

- **Immutable**: `type`, `userId`, `openingBalanceMode`. Attempts to PATCH any of these return 400 `IMMUTABLE_FIELD`.
- **Mutable**: `name`, `currency` (with re-validation per BR-ACC-2), the per-type required fields for the **existing** type, plus `archivedAt` via the dedicated endpoints.
- **PATCH never archives or unarchives** — those go through the dedicated idempotent endpoints to keep audit trails clean.

#### Soft archive lifecycle (BR-ACC-4)

- `archivedAt = null` → active.
- `archivedAt != null` → archived.
- `POST /api/accounts/:id/archive` sets `archivedAt = now()` if not set; no-op otherwise (idempotent).
- `POST /api/accounts/:id/unarchive` clears `archivedAt`; no-op otherwise (idempotent).
- List endpoint **excludes** archived rows by default; `?includeArchived=true` returns both.
- All other endpoints (GET, PATCH, balance) **accept** archived rows so the user can still see a closed credit card statement. PATCH does not allow archiving via this path.

#### FX display contract (BR-ACC-12)

The new endpoint `GET /api/accounts/:id/balance?displayCurrency=USD` returns:

```json
{
  "data": {
    "accountId": "<cuid>",
    "nativeBalance": "1000.00",
    "nativeCurrency": "ARS",
    "asOf": "2026-06-18T00:00:00.000Z",
    "display": {
      "amount": "1.10",
      "currency": "USD",
      "fxRate": "0.00110",
      "fxAsOf": "2026-06-17T20:00:00.000Z"
    }
  }
}
```

Behavior matrix:

| `?displayCurrency`                     | `display` block                                          | Errors                                        |
| -------------------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| omitted / `=` native                   | mirrors `nativeBalance`; `fxRate = "1"`, `fxAsOf = null` | none                                          |
| `=` USD when native is ARS / EUR       | converted                                                | 503 if fx-cache down; 409 if pair unsupported |
| `=` EUR when native is ARS / USD       | converted                                                | 503 if fx-cache down; 409 if pair unsupported |
| `=` ARS, USD, EUR but pair unsupported | —                                                        | 409 `FX_NOT_SUPPORTED`                        |
| fx-cache provider unavailable          | —                                                        | 503 `FX_UNAVAILABLE`                          |

The native balance is **never mutated** by this flow. Conversion is display-only.

The `FxRateProvider` interface (lives in `src/modules/accounts/infrastructure/fx-rate-provider.ts` in this change; the **implementation** is provided by `fx-cache` in a future change):

```ts
export interface FxRateProvider {
  /** Returns the FX rate from `from` → `to` at the provider's most recent rate timestamp. */
  getRate(from: Currency, to: Currency): Promise<FxRate>;
}

export interface FxRate {
  rate: Decimal; // e.g., 0.00110 for 1 ARS = 0.00110 USD
  asOf: Date; // timestamp the rate was published by the upstream provider
}

export type Currency = 'ARS' | 'USD' | 'EUR';
```

In this change, the module owns the **interface** and a **stub provider** for tests; the live provider is wired in `fx-cache`. The wiring is a 1-line composition-root change in `sdd-design`.

#### Cross-module integration

This change integrates with two other modules.

| Module     | Contract                                                                                               | Direction                                             |
| ---------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `auth`     | `auth()` server-side helper (from `src/modules/auth/index.ts`) returns `session.user.id` for `userId`. | depends on `auth`                                     |
| `fx-cache` | `FxRateProvider.getRate(from, to)` returns `{ rate, asOf }`. Stub in this change; live in `fx-cache`.  | defines interface; `fx-cache` provides implementation |

The `fx-cache` dependency is **load-bearing**: if `fx-cache` is not deployed, the balance endpoint returns 503 `FX_UNAVAILABLE` for any non-trivial conversion. This is documented in **Risks** and in the **`fx-cache` ordering constraint** below.

## Out of scope (this change)

- A `Bank` catalog entity (banks are free-text `bankName` values for now; catalog is deferred).
- A `Broker` catalog entity (same — free-text `broker`).
- An `Issuer` catalog entity (same — free-text `issuer`).
- Multi-currency beyond `{ ARS, USD, EUR }`.
- Transactions, snapshots, reports, PWA shell.
- The `fx-cache` change itself — this proposal defines the contract; the implementation lives in `fx-cache`.
- Real-time FX rates from an external API — `fx-cache` owns this; if `fx-cache` provides a rate, we use it; if not, 503.
- `DELETE /api/accounts/:id` (hard delete is reserved for the future `user-deletion` change).
- The `/api/banks` summary endpoint that lists distinct `bankName` values per user — flagged as a future enhancement in BR-ACC-11.

## Non-goals

- A balances dashboard (UI is `pwa-shell`).
- Multi-currency netting (a future `networth-snapshot` change reads accounts in their native currency and uses `fx-cache` at the snapshot level).
- Sharing accounts across users (single-user ownership only in MVP).
- Account transfers between `Account` rows (no internal transfer primitive; movements go through `transactions`).
- Historical balance reconstruction from transactions (the `openingBalance` is the seed; transactions are append-only going forward).

## Users and situations

| User                                      | Situation                                                                                                    | Touchpoint                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| A user onboarding after `auth-foundation` | Records the first set of accounts they own (cash, a checking account, a credit card).                        | `POST /api/accounts` (per-type union)                        |
| A user with multiple bank accounts        | Adds "Caja de ahorro Galicia" and "Cuenta corriente Galicia" as two rows under `bankName = "Banco Galicia"`. | `POST /api/accounts` with `type = BANK`                      |
| A user with multiple cards                | Adds "Visa Galicia", "Mastercard Santander", "Amex" as three CREDIT rows with different `issuer` values.     | `POST /api/accounts` with `type = CREDIT`                    |
| A user with ARS savings                   | Reads the balance in USD to see today's value without storing the conversion.                                | `GET /api/accounts/:id/balance?displayCurrency=USD`          |
| A user closing a card                     | Soft-archives the credit card (no hard delete).                                                              | `POST /api/accounts/:id/archive`                             |
| A user coming back to a closed card       | Reads the archived card's historical balance.                                                                | `GET /api/accounts/:id/balance` (archived rows are readable) |

## Business rules

Stable IDs `BR-ACC-NN` — referenced from `sdd-spec`, `sdd-design`, and `sdd-tasks`.

- **BR-ACC-1** (enum): `type ∈ { CASH, BANK, CREDIT, INVESTMENT, CRYPTO, OTHER }`. The enum is closed; adding a new type is a schema migration + spec delta + ADR. Per-type field sets are documented in **Behavior → Per-type required fields**.
- **BR-ACC-2** (currency whitelist): `currency ∈ { ARS, USD, EUR }`. Uppercase ISO-4217. Zod refine. Any other value is rejected with 400 `VALIDATION_ERROR`.
- **BR-ACC-3** (opening balance hybrid): the create payload uses a Zod discriminated union on `openingBalanceMode: 'historical' | 'fresh'`. The `'historical'` variant requires both `openingBalanceAmount` (non-zero allowed; positive or negative) and `openingBalanceDate` (≤ today). The `'fresh'` variant defaults `openingBalanceAmount` to `0` and `openingBalanceDate` to `createdAt`. The persisted columns are `openingBalanceAmount` and `openingBalanceDate`; the mode is a DTO concept, not a column.
- **BR-ACC-4** (soft archive): `archivedAt` is the lifecycle marker. `POST /archive` sets it idempotently; `POST /unarchive` clears it idempotently. List endpoint excludes archived rows by default; `?includeArchived=true` returns both. **No DELETE endpoint in this change.**
- **BR-ACC-5** (unique name per user): `@@unique([userId, name])`. Duplicate name within a user's namespace returns 409 `DUPLICATE_NAME`. The user can rename freely via PATCH; the constraint re-validates on rename.
- **BR-ACC-6** (ownership scoping): every query is `WHERE userId = ?` where `?` is the authenticated `session.user.id`. The Prisma layer never composes a query without this clause; the application layer enforces it.
- **BR-ACC-7** (404 not 403): cross-user access returns 404 `NOT_FOUND`, never 403, to avoid leaking account existence.
- **BR-ACC-8** (per-type required fields): the create DTO is a Zod discriminated union on `type`. BANK requires `bankName` + `accountKind`; CREDIT requires `issuer` + `creditLimit` + `statementDay` + `paymentDueDay`; INVESTMENT requires `broker` + `investmentType`. Per-type required fields are also **forbidden** when the type does not match (e.g., `bankName` on a CREDIT row is rejected). Forbidden-field violations return 400 `VALIDATION_ERROR`.
- **BR-ACC-9** (no auth-table modifications): Auth.js-owned Prisma models (`User`, `Account`, `Session`, `VerificationToken`) are not modified. The Auth.js `Account` row and the financial `FinancialAccount` row live side by side in the same database; this change does not introduce any cross-table FK between them.
- **BR-ACC-10** (`origin-check` middleware on mutating endpoints): every POST and PATCH under `/api/accounts/*` runs the same origin-check middleware that `auth-foundation` uses on `/api/auth/register`. Missing or mismatched `Origin` returns 403 `FORBIDDEN`.
- **BR-ACC-11** (BANK aggregation is a list concern, not a route): BANK accounts share the same `bankName` value across multiple `FinancialAccount` rows. v2 ships `?bankName=X` as a list filter only. A future `/api/banks` summary endpoint that returns distinct `bankName` values per user is out of scope and lives in a follow-up change once a `Bank` catalog entity exists.
- **BR-ACC-12** (FX display contract): `GET /api/accounts/:id/balance` accepts `?displayCurrency=ARS|USD|EUR` (default = native). When `displayCurrency == nativeCurrency`, the `display` block mirrors `nativeBalance` with `fxRate = "1"` and `fxAsOf = null`. When `displayCurrency != nativeCurrency`, the `display` block requires a working `FxRateProvider`. If the provider is unavailable, return `503 FX_UNAVAILABLE`; if the pair is unsupported by the provider, return `409 FX_NOT_SUPPORTED`. **Storage is never touched.** `GET /api/accounts/:id` carries the same `display` block.
- **BR-ACC-13** (FX rate freshness — default pending): when the `FxRateProvider` returns a rate that is older than the most recent business day's close (e.g., weekend, holiday, rate provider outage >24h), the endpoint returns the rate anyway with `fxAsOf` showing the timestamp. Rationale: weekend queries should not 5xx; the user sees the timestamp and decides. **Override pending**: see Decision gaps Q1.

## Implications and impact

| Area                       | Impact                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema                     | One new model (`FinancialAccount`) + 3 enums + 3 indexes + 1 unique constraint. Migration is additive; existing rows are unaffected.                   |
| Auth capability            | No changes. Re-uses `auth()` server-side helper from `src/modules/auth/index.ts`.                                                                      |
| Hono catch-all             | Adds 7 routes under `/api/accounts/*`. The catch-all already exists from `auth-foundation-slice-c`.                                                    |
| Middleware                 | `origin-check` middleware already exists from `auth-foundation`; new mutating routes plug into it.                                                     |
| Test runner                | Vitest already configured. Domain layer follows strict TDD (RED → GREEN → REFACTOR) per the project's `strictTdd` config.                              |
| `fx-cache` capability      | **NEW dependency**. This change defines `FxRateProvider` interface; `fx-cache` provides the live implementation. Load-bearing on the balance endpoint. |
| Future `networth-snapshot` | Will iterate accounts and use `fx-cache` at the snapshot level — independent of this change.                                                           |
| Future `transactions`      | Will reference `FinancialAccount.id` as the FK target. Schema is forward-compatible.                                                                   |
| Future `user-deletion`     | Will hard-delete `FinancialAccount` rows via the existing `onDelete: Cascade` on `User`. No work in this change.                                       |
| Future `Bank` catalog      | Will backfill `bankName` → `Bank.id` FK; current free-text column becomes the denormalized name for backward compat.                                   |
| Future `User.baseCurrency` | Will make `?displayCurrency` default to the user's base currency when omitted. v2 ships with explicit query-param-only behavior.                       |
| CI                         | Already green on `auth-foundation` work; this change reuses the same pipeline.                                                                         |

## Edge cases (product)

| Scenario                                                                       | Behavior                                                                                                                      |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| User creates two BANK accounts at the same bank with the same `accountKind`.   | Allowed. `name` differentiates them; `(userId, name)` is the unique constraint, not `(userId, bankName, accountKind)`.        |
| User PATCHes `type` from BANK to CREDIT.                                       | 400 `IMMUTABLE_FIELD`. The type is the discriminator for the entire row's meaning; changing it invalidates every other field. |
| User PATCHes `name` to a value already used by another account.                | 409 `DUPLICATE_NAME`.                                                                                                         |
| User creates an account with `currency = "ars"` (lowercase).                   | 400 `VALIDATION_ERROR`. The Zod refine uppercases-and-checks.                                                                 |
| User calls `balance?displayCurrency=GBP`.                                      | 400 `VALIDATION_ERROR`. GBP is not in `{ ARS, USD, EUR }`.                                                                    |
| User calls `balance?displayCurrency=USD` when native is already USD.           | `display` mirrors `nativeBalance` with `fxRate = "1"` and `fxAsOf = null`. No provider call.                                  |
| User calls `balance?displayCurrency=USD` when `fx-cache` is down.              | 503 `FX_UNAVAILABLE`.                                                                                                         |
| User calls `balance?displayCurrency=USD` when the ARS→USD pair is unsupported. | 409 `FX_NOT_SUPPORTED`.                                                                                                       |
| User calls `balance?displayCurrency=USD` on a Saturday with Friday's rate.     | (Default) 200 with `fxAsOf` showing Friday's close. Override via Decision gaps Q1.                                            |
| User archives an already-archived account.                                     | 200, idempotent. No-op.                                                                                                       |
| User reads an archived account.                                                | 200, full DTO returned. Archived accounts are readable but not listed by default.                                             |
| User lists with `?includeArchived=false` (default).                            | Archived rows excluded.                                                                                                       |
| User lists with `?type=CREDIT`.                                                | Only CREDIT rows returned.                                                                                                    |
| User lists with `?bankName=Galicia` (substring).                               | No match — `bankName` filter is exact-match (post-trim). Substring search is a follow-up.                                     |
| Two users independently create an account named "Main".                        | Both succeed. The uniqueness is per-user, not global.                                                                         |
| User deletes their account (GDPR).                                             | Out of scope. `user-deletion` change handles `FinancialAccount` cleanup via the `onDelete: Cascade`.                          |

## Decision gaps (open for the next proposal/spec round)

Three product questions and a few deferred decisions. The reviewer can override any of these before approval.

| #   | Question                                                                                                                                                           | Default chosen                                                                                                                                                                                                                        | How to resolve                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Q1  | **FX rate staleness** — what should `GET /api/accounts/:id/balance?displayCurrency=…` return when fx-cache returns a rate older than the most recent business day? | Return the rate anyway; `display.fxAsOf` carries the timestamp. Rationale: weekend queries should not 5xx; the user sees the freshness via `fxAsOf`. Becomes **BR-ACC-13**.                                                           | Approve / override in this proposal. The override is one paragraph in `Behavior → FX display contract`.         |
| Q2  | **Free-text normalization** — for `bankName` (BANK), `issuer` (CREDIT), `broker` (INVESTMENT), do we store verbatim or normalize?                                  | Trim only (leading/trailing whitespace); preserve user casing. Filter on list uses trimmed exact-match. Rationale: free-text means user-chosen; a future `Bank` / `Issuer` / `Broker` catalog change owns dedup.                      | Approve / override in this proposal. Trivial to flip if a future catalog wants exact-match on a canonical name. |
| Q3  | **`display` block default** — is `display` always present in the DTO, or only when `displayCurrency` is requested?                                                 | Always present. When `displayCurrency` is omitted or matches native, the block mirrors `nativeBalance` with `fxRate = "1"` and `fxAsOf = null`. Rationale: consistent DTO shape; simpler client.                                      | Approve / override. Aligns with the task's "default = native currency" wording.                                 |
| D1  | **`/api/banks` summary endpoint** — out of scope per BR-ACC-11.                                                                                                    | Deferred to a follow-up change once a `Bank` catalog entity exists.                                                                                                                                                                   | Open as a new SDD change (`accounts-banks-catalog`) when the catalog is designed.                               |
| D2  | **`User.baseCurrency`** — implicit default for `?displayCurrency`                                                                                                  | Deferred to `user-preferences`. v2 ships with explicit query-param-only behavior.                                                                                                                                                     | Open as part of `user-preferences`.                                                                             |
| D3  | **Balance source of truth** — is `openingBalanceAmount` the only seed, or do we add `runningBalance` once `transactions` lands?                                    | v2 stores only `openingBalance`. The eventual `runningBalance` is a derived view (`openingBalance + SUM(transactions where type = CREDIT) - SUM(transactions where type = DEBIT)`) computed in `transactions` or `networth-snapshot`. | Re-evaluate when `transactions` is scoped.                                                                      |
| D4  | **Statement-day / payment-due-day validation** — `1..28` vs `1..31`.                                                                                               | `1..28` for both. Rationale: February has 28 days; 29/30/31 would have to skip in 3 of every 28 years.                                                                                                                                | Approve / override in `sdd-design`.                                                                             |
| D5  | **`origin-check` middleware coverage** — should the `POST /api/accounts` route opt into the existing middleware, or define a new one?                              | Re-use the existing `origin-check` middleware from `auth-foundation` (BR-AUTH-12). Same middleware, no new code path.                                                                                                                 | No action — already settled by the auth foundation.                                                             |
| D6  | **List endpoint FX display** — does the list endpoint accept `?displayCurrency`?                                                                                   | No. v2 list returns native only. Mixed-currency listing is a future enhancement once `networth-snapshot` exists.                                                                                                                      | Open as part of `networth-snapshot` design.                                                                     |

## Acceptance criteria (the reviewer will see)

1. `prisma/schema.prisma` contains `FinancialAccount` + 3 enums + 3 indexes + 1 unique constraint; `pnpm prisma migrate dev --name accounts-ledger` succeeds.
2. `pnpm test` → green across **all** unit and integration test files for the `accounts` module. **Zero** files in `src/modules/accounts/**` are excluded from `vitest.config.ts`.
3. `pnpm run typecheck` → **0 errors**.
4. `pnpm test --coverage` → coverage on `src/modules/accounts/{domain,application}/**` **≥ 80%** (lines, branches, functions, statements).
5. The strict TDD discipline is visible in git history: each domain test commit has a RED commit followed by a GREEN commit (the worker shows the cycle in the handoff).
6. All 7 endpoints are live under `/api/accounts/*` and return the documented status codes (200, 201, 400, 401, 403, 404, 409, 503).
7. The create endpoint rejects the type-specific violations documented in BR-ACC-8 (each forbidden combination has at least one test). `grep -c "VALIDATION_ERROR" src/modules/accounts/__tests__/create*.test.ts` returns the expected count.
8. The `display` block shape is identical across `GET /api/accounts/:id` and `GET /api/accounts/:id/balance`. A shared Zod schema (`displayBlockSchema`) is the single source of truth.
9. `GET /api/accounts/:id/balance?displayCurrency=USD` returns 503 `FX_UNAVAILABLE` when the `FxRateProvider` stub throws a `ProviderUnavailable` error, and 409 `FX_NOT_SUPPORTED` when it throws `UnsupportedPair`. Both branches have at least one test each.
10. The auth contract is respected: every action calls `auth()` and reads `session.user.id`. No module reads cookies directly. `grep -r "headers().get" src/modules/accounts` returns 0 matches.
11. Cross-user access returns 404 `NOT_FOUND`, never 403. At least one test asserts this.
12. `origin-check` middleware is applied to every mutating endpoint (`POST /api/accounts`, `PATCH /api/accounts/:id`, `POST /api/accounts/:id/archive`, `POST /api/accounts/:id/unarchive`). Cross-origin POSTs return 403 `FORBIDDEN`.
13. `openspec/changes/accounts-ledger/proposal.md` and `Documents-es/openspec/changes/accounts-ledger/proposal.md` are in sync. Drift detection runs in the same commit.
14. `openspec/specs/accounts/spec.md` is created (or appended) during `sdd-sync` with the canonical contract for `FinancialAccount` and all 13 BR-ACC-NN business rules.
15. PR opens against `develop`. After review and squash-merge, the branch is deleted and the worktree is removed (per root AGENTS.md §7).

## Risks & dependencies

| Risk                                                                                                                               | Mitigation                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`fx-cache` is load-bearing** but not yet implemented. The balance endpoint cannot serve live conversions until `fx-cache` ships. | The `FxRateProvider` interface is defined in this change with a stub provider for tests. Composition-root wiring is a 1-line change when `fx-cache` lands. `fx-cache` MUST ship before accounts-ledger is usable in production.             |
| **Strict TDD on the domain layer** may surface a non-trivial design flaw late.                                                     | The first PR (schema + types + Zod) is foundational; the RED cycle on per-type required fields is the highest-risk RED. If the union shape proves wrong, the override cost is bounded to `src/modules/accounts/domain/`.                    |
| **Naming collision risk**: someone reads `Account` in code and confuses it with Auth.js's `Account`.                               | The convention is enforced by the DTO mapping layer (`financialAccount → accountDto`). Every DTO conversion test asserts the type discriminator. A code comment in `src/modules/accounts/infrastructure/repository.ts` explains the choice. |
| **Free-text `bankName`/`issuer`/`broker` proliferation** — same bank spelled multiple ways by the same user.                       | The list endpoint returns all accounts; the user sees duplicates. Deferred to the catalog change. Flagged in D1.                                                                                                                            |
| **FX rate staleness** could mislead users on weekends if Q1 default is approved.                                                   | The `fxAsOf` field is rendered in the UI with a visible timestamp; the UI change is owned by `pwa-shell`. The proposal documents this expectation.                                                                                          |
| **CI / lint regressions** — Hono routes add ~7 new typed routes; TS strict mode may surface type errors.                           | The first PR adds the types and Zod schemas with passing `tsc --noEmit`; subsequent PRs extend incrementally. The `auth-foundation-slice-c` CI workflow catches regressions early.                                                          |
| **GGA `openrouter` provider not configured** (carried from `auth-foundation-slice-c`).                                             | Per root AGENTS.md §2.6, on-disk verification is the gate; CI is the authoritative gate. Documented in every handoff.                                                                                                                       |

## Review workload forecast (mandatory)

3 PRs chained, each over the 400-line review budget:

| PR                                            | Scope                                                                                                                                                                                                                                | Lines (est.) | Overage vs 400 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | -------------- |
| **PR1 — Schema + types + Zod + repository**   | `FinancialAccount` model + 3 enums + 3 indexes + unique constraint + the discriminated-union Zod schemas + the Prisma repository interface. ~6–8 unit tests on the discriminated union.                                              | ~500         | 1.25×          |
| **PR2 — Domain + application + FX contract**  | Domain services (`createAccount`, `listAccounts`, `updateAccount`, `archiveAccount`, `unarchiveAccount`, `getBalance`); application services; the `FxRateProvider` interface + stub + error types; ~14–18 domain tests (strict TDD). | ~700         | 1.75×          |
| **PR3 — Hono routes + integration + handoff** | 7 Hono routes wired into the catch-all; `origin-check` middleware integration; ~8–12 integration tests; `sdd-verify` handoff. Spanish mirror updates for proposal.md, spec.md, design.md.                                            | ~500         | 1.25×          |
| **Total**                                     |                                                                                                                                                                                                                                      | **~1,700**   | —              |

The user accepted a 3-PR overshoot at `auth-foundation-slice-c` planning (1,300 LOC across 3 PRs). The same pattern applies here. PR2's 1.75× overage is the largest because of the 14+ domain tests; the discriminated-union Zod tests in PR1 are also non-trivial. **The user can split PR2 into PR2a (domain) + PR2b (application + FX contract) if preferred.**

## Change ordering downstream

After this change merges, the following are unblocked or partially unblocked:

1. **`fx-cache`** — provides the live `FxRateProvider` implementation. **Must land before accounts-ledger is usable in production**, but can land as a co-PR or a follow-up PR. The interface is the contract.
2. `transactions` — references `FinancialAccount.id` as the FK target. Schema is forward-compatible (no `transactions` column on `FinancialAccount`).
3. `networth-snapshot` — reads accounts and uses `fx-cache` at the snapshot level.
4. `reports-mvp` — depends on `accounts-ledger` + `networth-snapshot` + `fx-cache`.
5. `pwa-shell` — renders the accounts list, the create form (per-type), the balance with FX display.
6. `accounts-banks-catalog` — backfills `bankName` → `Bank.id` FK. Deferred until the catalog is designed.
7. `user-preferences` — introduces `User.baseCurrency`; makes `?displayCurrency` optional (defaults to base currency). Pure additive.
8. `user-deletion` — hard-deletes `FinancialAccount` rows via `onDelete: Cascade`. No schema change.

## Next step

After the user approves this proposal, the next phase is `sdd-spec`:

- Produce `openspec/changes/accounts-ledger/spec.md` with delta-spec entries for the `accounts` capability, mirroring into `Documents-es/openspec/changes/accounts-ledger/spec.md`. The canonical `openspec/specs/accounts/spec.md` is **created** during `sdd-sync` (it does not exist yet).
- Then `sdd-design`: pin the `FxRateProvider` interface; pin the `origin-check` middleware reuse path; pin the per-type Zod union shape; pin the `display` block Zod schema.
- Then `sdd-tasks`: break PR1/PR2/PR3 into sub-tasks with TDD evidence columns.
- Then `sdd-apply` (3 chained PRs as forecasted).
- Then `sdd-verify` (re-run verify on the entire change; expect `PASS_WITH_FLAGS` if `fx-cache` is not deployed — flag is "balance endpoint serves 503 in production until fx-cache ships").
- Then `sdd-sync`: promote the canonical `openspec/specs/accounts/spec.md`; archive this change.
