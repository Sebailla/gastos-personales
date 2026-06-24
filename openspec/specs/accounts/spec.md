# Spec — `accounts` capability

**Author**: Sebastián Illa
**Capability**: `accounts`
**Source change**: `accounts-ledger`
**Status**: active · **Created**: 2026-06-18 · **Last sync**: 2026-06-19 (accounts-ledger)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (inherited from `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4

> This is the first write of the `accounts` capability spec. It
> operationalizes the `accounts-ledger` proposal v3 (draft
> 2026-06-18) plus the 10 product decisions closed in the same
> session (see "Closed decisions" below). The spec declares
> **what MUST be true** after the change lands, not how to
> implement it. Implementation details (file paths, schema
> syntax, test layout) are limited to what the cross-module
> contract requires.

## Closed decisions (2026-06-18, parent session)

The 10 product decisions are authoritative where they modify or
extend the proposal. The spec reflects them as Requirements and
BRs, not as a separate "decisions" section. Decision numbers
(1-10) are referenced inline in the relevant Scenario bodies.

1. UI smoke slice language: English only.
2. Post-create redirect: `router.push('/accounts')` + ephemeral toast `"Account created"` (~3 s).
3. FX stale: `display.fxAsOf` rendered as plain text `"Last updated: …"`; no warning styling.
4. List query: `archivedAt: null` filter; no column or toggle for archived state in the smoke slice.
5. `openingBalanceMode` default: `FRESH` marked in the form radio group.
6. `type` change in form: silent reset of type-specific fields; no confirmation.
7. `openingBalanceMinor` validation: `>= 0` client and server.
8. Widget `displayCurrency` select: full whitelist `{ ARS, USD, EUR }`; no native-currency filtering.
9. List truncation footer: render `"Showing first 50 of <total>"` when API returns `total > 50`.
10. Detail 404: `redirect('/accounts')` + ephemeral toast `"Account not found or no access"`.

## Purpose

The `accounts` capability is the financial-account ledger of
`gastos-personales`. It owns the user's accounts (the
source-of-truth units: bank, credit, investment, crypto, cash,
other) and a read-only display-only FX conversion surface that
other capabilities (`transactions`, `fx-cache`, `snapshots`,
`reports`) will integrate against. The capability guarantees
that: (a) every account is owned by exactly one authenticated
`User` (the cross-module invariant inherited from the `auth`
capability, per `openspec/specs/auth/spec.md`); (b) the
discriminated-union model carries per-type metadata without
exploding the table or leaking irrelevant fields per type; (c)
all reads and writes are gated by the `auth()` server-side helper
from `src/modules/auth/index.ts`; (d) FX is a presentation
concern, never a storage mutation — the native balance is the
authoritative number on the row, and the display-only conversion
is computed at read time; (e) the smoke UI lets a developer or
PM exercise the API end-to-end in under five minutes without
curl, providing a typed-client and form-pattern reference for the
future `ui-accounts` change.

## Scope

### In scope

- Prisma model `FinancialAccount` and four enums (`AccountType`,
  `AccountKind`, `InvestmentType`, `OpeningBalanceMode`,
  `AccountCurrency`).
- Seven Hono endpoints under `/api/accounts` mounted on the
  existing catch-all at `app/api/[...path]/route.ts`.
- `FxRateProvider` interface declared in `src/modules/accounts/`.
  No implementation; the implementation lands in `fx-cache`.
- Three Next.js App Router pages under `app/accounts/*` (smoke
  UI; hand-verified, no automated tests).
- Hono typed client wrapper at `src/lib/api-client.ts`.
- Tailwind v4 setup (`tailwindcss` + `@tailwindcss/postcss` or
  equivalent; finalized in `sdd-design`).

### Out of scope

- `fx-cache` implementation; the `FxRateProvider` is a port only.
- `transactions`, `snapshots`, `reports` — each is its own SDD
  change; they will consume the `accounts` capability.
- Production UI (`ui-accounts` or `pwa-shell`).
- Email notifications, scheduled jobs, background workers.
- Bulk import / CSV upload.
- Production auth hardening (rate limiting on UI-driven endpoints).

### Smoke UI is NOT production UI

- No accessibility audit, no i18n, no SEO, no SSR caching, no
  error boundaries beyond `error.tsx`.
- No navigation shell, no theme system, no design system, no
  loading skeletons beyond a plain `"Loading…"` string.
- No edit / archive / unarchive buttons in the UI. The endpoints
  exist (the API surface is complete); the UI does not call them
  in this change. Buttons are added in `ui-accounts`.
- No UI tests. The smoke slice is verified by hand: developer
  or PM runs `pnpm dev`, signs in, exercises the three pages.
- Each page header carries a short comment
  `// smoke-minimal, not production`.

## Entities

### `FinancialAccount`

The single source-of-truth entity for the user's accounts. One
row per account. A row is owned by exactly one `User`
(cross-module invariant: `userId` is a FK with `onDelete:
Cascade` to `User.id` per `openspec/specs/auth/spec.md`).

| Field                 | Type                 | Constraints                                             |
| --------------------- | -------------------- | ------------------------------------------------------- |
| `id`                  | `string` (cuid)      | Primary key. Server-generated. Immutable.               |
| `userId`              | `string` (cuid)      | FK to `User.id` (auth capability). `onDelete: Cascade`. |
| `type`                | `AccountType`        | One of the 6 enum values.                               |
| `name`                | `string`             | 1-80 chars. Unique per `(userId, type)`.                |
| `currency`            | `AccountCurrency`    | One of `{ ARS, USD, EUR }`.                             |
| `openingBalanceMinor` | `Int`                | Minor units (cents). `>= 0` (BR-ACC-16).                |
| `openingBalanceMode`  | `OpeningBalanceMode` | `FRESH` \| `HISTORICAL`.                                |
| `openingBalanceDate`  | `DateTime?`          | Required iff `mode = HISTORICAL`; `null` otherwise.     |
| `archivedAt`          | `DateTime?`          | Soft-archive marker. `null` for live accounts.          |
| `createdAt`           | `DateTime`           | Server-set on insert.                                   |
| `updatedAt`           | `DateTime`           | Server-set on every mutation.                           |

Type-specific fields (populated only for the relevant `type`,
enforced by Zod create-schema per type):

| `type`       | Type-specific fields                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `BANK`       | `bankName` (`string`), `accountKind` (`SAVINGS` \| `CHECKING`).                                  |
| `CREDIT`     | `issuer` (`string`), `creditLimitMinor` (`Int?`), `statementDay` (1-31), `paymentDueDay` (1-31). |
| `INVESTMENT` | `broker` (`string`), `investmentType` (enum).                                                    |
| `CRYPTO`     | `walletAddress` (`string?`).                                                                     |
| `CASH`       | (none).                                                                                          |
| `OTHER`      | (none).                                                                                          |

Indexes:

- `@@unique([userId, type, name])` — names are unique per user per type.
- `@@index([userId, archivedAt])` — list view: live accounts first.
- `@@index([userId, createdAt])` — list view: order by recency.

Invariants:

- `openingBalanceDate` is non-null iff `openingBalanceMode = HISTORICAL`.
- `openingBalanceMinor >= 0` (BR-ACC-16).
- Cross-user access returns `404`, not `403` (existence is not leaked).
- A type-specific field MUST NOT be set for an `AccountType` other than the one it belongs to (enforced by Zod).

### Enums

- `AccountType`: `BANK | CREDIT | INVESTMENT | CRYPTO | CASH | OTHER`.
- `AccountKind`: `SAVINGS | CHECKING`.
- `InvestmentType`: `STOCKS | BONDS | MUTUAL_FUNDS | CERTS_OF_DEPOSIT | OTHER`.
- `OpeningBalanceMode`: `FRESH | HISTORICAL`.
- `AccountCurrency`: `ARS | USD | EUR`.

## Business rules

### BR-ACC-12: FX display contract (carried from proposal v2)

`GET /api/accounts/:id/balance?displayCurrency=<ccy>` is a
read-only endpoint that converts the account's native balance
to a display currency for the caller. The native balance on
the row is never mutated. The contract returns
`{ native: { amount, currency }, display?: { amount, currency,
fxRate, fxAsOf }, warnings?: string[] }`. Errors:
`503 FX_UNAVAILABLE` (provider not configured), `409
FX_NOT_SUPPORTED` (cross-currency pair not supported by the
configured provider). The `FxRateProvider` is a port declared
in `src/modules/accounts/`; no implementation is shipped in
this change.

### BR-ACC-13: FX rate freshness (carried from proposal v2)

The provider returns the rate with `fxAsOf` even when the rate
is stale (weekend, > 24h old, or otherwise older than the
provider's freshness window). Stale is not a `5xx`. The UI
surfaces `fxAsOf` next to the converted amount so a human can
judge freshness. See BR-ACC-18 for the widget rendering rule.

### BR-ACC-14: UI redirect rule (NEW in v3, from proposal)

A Server Component under `app/accounts/*` that resolves a
missing session MUST redirect to
`/auth/signin?callbackUrl=<original-path>`, where the
`callbackUrl` is encoded with `encodeURIComponent`. The rule
applies to all three pages (`/accounts`, `/accounts/new`,
`/accounts/[id]`). The pages never read the session cookie
directly; they call `auth()` from `src/modules/auth/index.ts`.

### BR-ACC-15: Form-state discipline (NEW in v3, from proposal)

The create form is a single Client Component. Its state is
local (`useState` per field). The form MUST NOT hold the
authenticated user, the session, or any server-derived data in
client state. It receives `type`-specific field metadata via
props from the Server Component shell. This rule is extended
by BR-ACC-16 (default `openingBalanceMode`, silent type-change
reset, `openingBalanceMinor >= 0`).

### BR-ACC-16: Form behavior — state and submit (NEW in v3, modified from proposal's "inline error surface")

The create form MUST:

- Mark `openingBalanceMode = FRESH` as the default selected radio on first render. (Decision 5)
- On change of the `type` field, silently reset every
  type-specific field to its default value. No confirmation
  dialog. (Decision 6)
- Validate `openingBalanceMinor >= 0` on the client (form
  state) and on the server (Zod schema). A negative value
  MUST be rejected at the form (submit disabled or inline
  error) and at the API (`400 VALIDATION_ERROR` with the
  message). (Decision 7)
- On `201 Created` from `POST /api/accounts`: invoke
  `router.push('/accounts')` and render an ephemeral toast
  `"Account created"` for ~3 s via a `<div role="status">`
  with local state in the Server Component shell that wraps
  the form. No toast library. No global context. (Decision 2)
- On `4xx` (validation): re-render with an inline error banner
  under the submit button showing the first error message from
  the response body's `error` field. (Proposal BR-ACC-16, preserved.)
- On `5xx` or network error: render a generic
  `"Something went wrong"` banner in the same slot.

### BR-ACC-17: List filtering (NEW in v3, from session 2026-06-18)

The list page (`app/accounts/page.tsx`) MUST call
`GET /api/accounts` with `archivedAt=null` in the query. The
list MUST NOT render any column or UI control for archived
state. The Prisma column `archivedAt` and the
`/api/accounts/:id/archive` and `/:id/unarchive` endpoints
exist; the smoke UI does not surface them. (Decision 4)

### BR-ACC-18: Balance widget contract (NEW in v3, from session 2026-06-18)

The balance widget on `/accounts/[id]` MUST:

- Render the native balance first (always, even after a
  conversion).
- Render the `<select name="displayCurrency">` with the full
  whitelist `{ ARS, USD, EUR }`. No native-currency filtering.
  (Decision 8)
- On submit, call `GET /api/accounts/:id/balance?displayCurrency=<selected>`.
- Render `display.amount`, `display.fxRate`, and `display.fxAsOf`
  next to the native balance.
- Render `display.fxAsOf` as plain text in the form
  `"Last updated: <ISO date>"`. No warning styling, no
  blocking on stale rates. (Decision 3)
- On `503 FX_UNAVAILABLE`: inline error
  `"FX rate provider unavailable. Try again in a few minutes."`
- On `409 FX_NOT_SUPPORTED`: inline error
  `"FX conversion not supported for this pair."`
- Use `router.refresh()` after a successful response so the
  page re-reads the account (the row did not change, but this
  keeps the typed-client cache consistent for any future
  server-derived data).

### BR-ACC-19: Detail 404 redirect (NEW in v3, from session 2026-06-18)

If `GET /api/accounts/:id` returns `404` (cross-user or
non-existent), the Server Component for `/accounts/[id]` MUST
call `redirect('/accounts')`. The list page then renders the
ephemeral toast `"Account not found or no access"` for ~3 s
via a `<div role="status">` with local state. The toast
mechanism is the same one the create flow uses (BR-ACC-16,
Decision 2): no library, no global context. (Decision 10)

## Requirements

### Data model

#### Requirement: FinancialAccount persists the 6-type discriminated model

The system MUST persist a `FinancialAccount` row whose shape
matches the entity table, with type-specific fields populated
only for the relevant `AccountType` value. The system MUST
enforce the three indexes. The system MUST reject, at the
Zod schema layer, a create-body that sets a type-specific
field for a `type` that does not own it.

#### Scenario: BANK row stores bankName and accountKind

- GIVEN: a request body with `type = "BANK"`, `bankName = "ICBC"`, `accountKind = "SAVINGS"`
- WHEN: `POST /api/accounts` is called
- THEN: the row is created with `bankName = "ICBC"` and `accountKind = "SAVINGS"`
- AND: the response body includes the full row

#### Scenario: CREDIT row stores issuer, creditLimit, statementDay, paymentDueDay

- GIVEN: a request body with `type = "CREDIT"`, `issuer = "Visa"`, `creditLimitMinor = 500000`, `statementDay = 5`, `paymentDueDay = 15`
- WHEN: `POST /api/accounts` is called
- THEN: the row is created with all four type-specific fields populated
- AND: `bankName` and `accountKind` are `null` on the row

#### Scenario: INVESTMENT row stores broker and investmentType

- GIVEN: a request body with `type = "INVESTMENT"`, `broker = "Balanz"`, `investmentType = "STOCKS"`
- WHEN: `POST /api/accounts` is called
- THEN: the row is created with the two type-specific fields populated
- AND: `walletAddress` and `bankName` are `null`

#### Scenario: CRYPTO row stores walletAddress (optional)

- GIVEN: a request body with `type = "CRYPTO"`, `walletAddress = "0x…"`
- WHEN: `POST /api/accounts` is called
- THEN: the row is created with `walletAddress` populated
- AND: omitting `walletAddress` is allowed (it is optional in CRYPTO)

#### Scenario: CASH and OTHER rows have no type-specific fields

- GIVEN: a request body with `type = "CASH"` and no type-specific fields
- WHEN: `POST /api/accounts` is called
- THEN: the row is created
- AND: the response body shows all type-specific fields as `null`

#### Scenario: type-specific field set for the wrong type is rejected

- GIVEN: a request body with `type = "BANK"` and `walletAddress = "0x…"`
- WHEN: `POST /api/accounts` is called
- THEN: the response status is `400 VALIDATION_ERROR`
- AND: no row is created

#### Scenario: name collision within (userId, type) is rejected

- GIVEN: a user already has a BANK account named `"Main"`
- WHEN: the user posts a second BANK account with `name = "Main"`
- THEN: the response status is `409 NAME_TAKEN` (or equivalent domain error code)
- AND: no second row is created

### Endpoints

#### Requirement: GET /api/accounts returns a cursor-paginated list scoped to the authenticated user

The system MUST return a paginated list of the authenticated
user's accounts whose `archivedAt` is `null`, ordered by
`createdAt` descending. The endpoint MUST support cursor
pagination via `?cursor=<opaque>&limit=<n>`. The default
`limit` is 20, the maximum is 100.

#### Scenario: list returns the user's accounts

- GIVEN: the authenticated user has 3 accounts
- WHEN: `GET /api/accounts` is called
- THEN: the response status is `200`
- AND: the response body contains a `data` array with 3 entries
- AND: the response body contains `nextCursor` (null when fewer than `limit`)

#### Scenario: list excludes other users' accounts

- GIVEN: another user has 5 accounts
- WHEN: the authenticated user calls `GET /api/accounts`
- THEN: the response body contains only the authenticated user's accounts
- AND: cross-user accounts are not enumerated

#### Scenario: list omits archived accounts

- GIVEN: the user has 4 accounts, 1 of which is archived (`archivedAt != null`)
- WHEN: the user calls `GET /api/accounts`
- THEN: the response body contains 3 entries
- AND: the archived account is not in `data`

#### Scenario: unauthenticated request returns 401

- GIVEN: no `authjs.session-token` cookie is present
- WHEN: `GET /api/accounts` is called
- THEN: the response status is `401 UNAUTHORIZED`

#### Scenario: limit is clamped to the maximum

- GIVEN: any state
- WHEN: the caller passes `?limit=500`
- THEN: the server clamps the limit to `100` for the underlying query
- AND: the response is still `200`

#### Requirement: POST /api/accounts creates a type-driven account

The system MUST validate the create body against a Zod schema
selected by `type` and persist a `FinancialAccount` row owned
by the authenticated user. The system MUST return `201` with
the full created row on success, `400 VALIDATION_ERROR` on
schema failure, `409 NAME_TAKEN` on `(userId, type, name)`
collision, and `401 UNAUTHORIZED` when no session is present.

#### Scenario: valid BANK body creates the account and returns 201

- GIVEN: an authenticated session
- WHEN: `POST /api/accounts` is called with a valid BANK body
- THEN: the response status is `201`
- AND: the response body contains the full row
- AND: `userId` on the row equals the session user's id (the server MUST NOT trust a `userId` from the body)

#### Scenario: negative openingBalanceMinor is rejected

- GIVEN: any state
- WHEN: the caller posts a body with `openingBalanceMinor = -100`
- THEN: the response status is `400 VALIDATION_ERROR`
- AND: the error message mentions the non-negative constraint (BR-ACC-16, Decision 7)
- AND: no row is created

#### Scenario: HISTORICAL without openingBalanceDate is rejected

- GIVEN: any state
- WHEN: the caller posts `openingBalanceMode = "HISTORICAL"` and omits `openingBalanceDate`
- THEN: the response status is `400 VALIDATION_ERROR`
- AND: the error message names the missing field

#### Scenario: duplicate name within (userId, type) is rejected

- GIVEN: the user has an account named `"Main"` of type `BANK`
- WHEN: the user posts a second BANK with `name = "Main"`
- THEN: the response status is `409 NAME_TAKEN`
- AND: no row is created

#### Requirement: GET /api/accounts/:id returns one account or 404 on cross-user

#### Scenario: own account returns 200

- GIVEN: an account owned by the authenticated user
- WHEN: `GET /api/accounts/:id` is called with that id
- THEN: the response status is `200`
- AND: the response body contains the full row (including type-specific fields)

#### Scenario: another user's account returns 404

- GIVEN: an account owned by a different user
- WHEN: the authenticated user calls `GET /api/accounts/:id` with that id
- THEN: the response status is `404 NOT_FOUND`
- AND: the response body does not leak the account's existence

#### Scenario: non-existent id returns 404

- GIVEN: no row with the requested id
- WHEN: `GET /api/accounts/:id` is called
- THEN: the response status is `404 NOT_FOUND`

#### Requirement: PATCH /api/accounts/:id applies a partial update

The system MUST accept a partial body of updatable fields and
return `200` with the updated row. Type-specific fields are
updateable subject to the same per-type validation as create.
The system MUST return `404 NOT_FOUND` for cross-user ids.

#### Scenario: partial update of name

- GIVEN: an existing account
- WHEN: the owner calls `PATCH /api/accounts/:id` with `{ name: "Renamed" }`
- THEN: the response status is `200`
- AND: the row's `name` is now `"Renamed"`

#### Requirement: POST /api/accounts/:id/archive soft-archives the account

#### Scenario: archiving a live account sets archivedAt

- GIVEN: a live account
- WHEN: the owner calls `POST /api/accounts/:id/archive`
- THEN: the response status is `200`
- AND: the row's `archivedAt` is a non-null timestamp

#### Requirement: POST /api/accounts/:id/unarchive restores the account

#### Scenario: unarchiving clears archivedAt

- GIVEN: an archived account
- WHEN: the owner calls `POST /api/accounts/:id/unarchive`
- THEN: the response status is `200`
- AND: the row's `archivedAt` is `null`

#### Requirement: GET /api/accounts/:id/balance returns the display-only FX conversion

#### Scenario: supported currency pair returns the conversion

- GIVEN: the account's native currency is `USD`
- WHEN: the owner calls `GET /api/accounts/:id/balance?displayCurrency=EUR`
- THEN: the response status is `200`
- AND: the response body's `display` field contains `amount`, `currency`, `fxRate`, `fxAsOf`
- AND: the response body's `native` field contains the unchanged native balance

#### Scenario: provider not configured returns 503

- GIVEN: no `FxRateProvider` implementation is registered (the `fx-cache` change has not landed)
- WHEN: the owner calls `GET /api/accounts/:id/balance?displayCurrency=EUR`
- THEN: the response status is `503 FX_UNAVAILABLE`

#### Scenario: unsupported pair returns 409

- GIVEN: the configured provider does not support the requested pair
- WHEN: the owner calls the endpoint
- THEN: the response status is `409 FX_NOT_SUPPORTED`

### UI smoke slice

#### Requirement: /accounts lists the user's live accounts (Server Component)

`app/accounts/page.tsx` MUST be a Server Component that
resolves the session via `auth()` (BR-ACC-14), calls
`GET /api/accounts` with `archivedAt=null` (BR-ACC-17), and
renders a `<table>` with columns `Name`, `Type`, `Currency`,
`Opening balance`. The page MUST NOT render any archived-state
column. On empty result, the page MUST render the string
`"No accounts yet — create one"` and a `New account` button
linking to `/accounts/new`. When the API reports `total > 50`,
the page MUST render a footer with the exact text
`"Showing first 50 of <total>"`. All copy is English
(Decision 1). Styling uses Tailwind utility classes.

#### Scenario: missing session redirects to /auth/signin

- GIVEN: no session cookie
- WHEN: the user visits `/accounts`
- THEN: the response is a 302 to `/auth/signin?callbackUrl=%2Faccounts`

#### Scenario: empty list shows the empty state

- GIVEN: an authenticated user with zero accounts
- WHEN: the user visits `/accounts`
- THEN: the page renders `"No accounts yet — create one"`
- AND: the page renders a `New account` button linking to `/accounts/new`

#### Scenario: populated list shows up to 50 accounts

- GIVEN: an authenticated user with 60 accounts
- WHEN: the user visits `/accounts`
- THEN: the page renders a table with 50 rows
- AND: the footer reads exactly `"Showing first 50 of 60"`

#### Requirement: /accounts/new renders the type-driven create form (Server shell + Client form)

`app/accounts/new/page.tsx` MUST be a Server Component shell
that renders a `<form>` and embeds a single Client form
component. The form MUST render a `<select name="type">` with
the 6 enum values, a `<select name="currency">` with
`{ ARS, USD, EUR }`, a `<fieldset>` with the two
`openingBalanceMode` radios (FRESH selected by default,
BR-ACC-16 Decision 5), and a discriminated set of
type-specific fields per the entity table. On `type` change,
the form MUST silently reset type-specific fields to defaults
(BR-ACC-16 Decision 6). `openingBalanceMinor` MUST be `>= 0`
client and server (BR-ACC-16 Decision 7). On `201`, the form
MUST `router.push('/accounts')` and render the ephemeral toast
`"Account created"` (BR-ACC-16 Decision 2). On `4xx`, the
inline error banner shows the first message from the response
body's `error` field. On `5xx` or network error, the banner
shows `"Something went wrong"`.

#### Scenario: fresh create flow

- GIVEN: an authenticated user on `/accounts/new`
- WHEN: the user picks `type = BANK`, fills `name`, `bankName`, `accountKind`, `currency = USD`, leaves `FRESH` selected, and submits
- THEN: the API returns `201`
- AND: the user is redirected to `/accounts`
- AND: the toast `"Account created"` is visible for ~3 s

#### Scenario: type change resets type-specific fields

- GIVEN: the user has selected `type = BANK` and typed `bankName = "ICBC"`
- WHEN: the user changes the `type` select to `CRYPTO`
- THEN: `bankName` is reset to empty
- AND: `accountKind` is reset to its default
- AND: `walletAddress` field becomes available (CRYPTO-specific)

#### Scenario: 4xx renders the inline error banner

- GIVEN: a `400 VALIDATION_ERROR` response from the API
- WHEN: the form re-renders
- THEN: the inline error banner shows the first error message from the response body's `error` field

#### Requirement: /accounts/[id] shows the account detail and the balance widget (Server + Client widget)

`app/accounts/[id]/page.tsx` MUST be a Server Component that
resolves the session, calls `GET /api/accounts/:id`, and
renders the full row in a `<dl>`. The balance widget is a
Client Component that renders the native balance, a
`<select name="displayCurrency">` with the full whitelist
`{ ARS, USD, EUR }` (BR-ACC-18 Decision 8), a submit button,
and a region for the conversion result or the inline error.
On submit, the widget MUST call
`GET /api/accounts/:id/balance?displayCurrency=<selected>`.
On `200`, the widget MUST render `display.amount`,
`display.fxRate`, and `display.fxAsOf` as `"Last updated: …"`
plain text (BR-ACC-18 Decision 3). The widget MUST call
`router.refresh()` after a successful response.

#### Scenario: detail renders the row

- GIVEN: an account owned by the authenticated user
- WHEN: the user visits `/accounts/:id`
- THEN: the page renders the account's name, type, currency, opening balance, and type-specific fields in a `<dl>`

#### Scenario: detail 404 redirects to /accounts with the "not found" toast

- GIVEN: any state
- WHEN: `GET /api/accounts/:id` returns `404`
- THEN: the Server Component calls `redirect('/accounts')`
- AND: the list page renders the ephemeral toast `"Account not found or no access"` for ~3 s (BR-ACC-19, Decision 10)

#### Scenario: balance widget renders the conversion

- GIVEN: the account's native currency is `USD`
- WHEN: the user picks `EUR` and submits the widget
- THEN: the widget renders the converted `display.amount` and `display.fxRate` next to the native balance
- AND: `display.fxAsOf` is rendered as `"Last updated: <ISO date>"`

#### Scenario: balance widget surfaces 503 with the inline error

- GIVEN: the `FxRateProvider` is not registered
- WHEN: the user submits the widget with any `displayCurrency`
- THEN: the widget renders the inline error `"FX rate provider unavailable. Try again in a few minutes."`

### Validation, errors, auth integration

#### Requirement: All request bodies are validated by Zod schemas

The system MUST validate every `POST` and `PATCH` body
through a Zod schema selected by the operation (create vs.
update) and, for create, by `type`. Validation failures
MUST return `400 VALIDATION_ERROR` with a body shape of
`{ error: { code: "VALIDATION_ERROR", message: string,
details?: Array<{ path: string; message: string }> } }`. The
first item of `details` is what the UI banner surfaces.

#### Scenario: schema failure returns 400 with a structured body

- GIVEN: a malformed create body
- WHEN: the API is called
- THEN: the response status is `400`
- AND: the response body has the `VALIDATION_ERROR` shape
- AND: `details[0]` describes the first failing field

#### Requirement: All endpoints require an authenticated session

Every endpoint under `/api/accounts/*` MUST require an
authenticated session resolved via `auth()` from
`src/modules/auth/index.ts`. The system MUST return
`401 UNAUTHORIZED` when no session is present. The system
MUST NOT trust any `userId` field in request bodies; the
session is the source of truth for ownership.

#### Scenario: 401 on every endpoint when no session

- GIVEN: no `authjs.session-token` cookie
- WHEN: any of the 7 endpoints is called
- THEN: the response status is `401 UNAUTHORIZED`
- AND: no data is returned

#### Requirement: Errors follow the project's standard error envelope

The system MUST return errors in the envelope
`{ error: { code: string, message: string, details?: unknown } }`
with a stable `code` per failure mode. Domain codes used in
this change include `UNAUTHORIZED`, `VALIDATION_ERROR`,
`NOT_FOUND`, `NAME_TAKEN`, `FX_UNAVAILABLE`, `FX_NOT_SUPPORTED`.
The system MUST NOT include stack traces, Prisma error
objects, or request bodies in the error response.

#### Scenario: error responses never leak internals

- GIVEN: a server-side exception (e.g. Prisma timeout)
- WHEN: any endpoint is called
- THEN: the response status is `500`
- AND: the response body is `{ error: { code: "INTERNAL", message: "Something went wrong" } }`
- AND: no stack trace, Prisma message, or request body is in the response

## References

- `openspec/changes/accounts-ledger/proposal.md` — proposal v3 (draft 2026-06-18); the spec operationalizes the proposal.
- `openspec/specs/auth/spec.md` — canonical `auth` capability; cross-module invariant on `userId` and the `auth()` server-side helper.
- `openspec/specs/fx/spec.md` — canonical `fx` capability; the `FxRateProvider` interface declared in `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts` is consumed by `accounts` (via `get-account-balance.action.ts`). The implementation lives in `fx` (REQ-FX-3 enforced at the type level). The `FinancialAccountBalanceDto` is co-owned — `fx` adds the `stale: boolean` field; `accounts` owns the wire shape.
- `openspec/config.yaml` — strict TDD rules; `pnpm test` runner.
- `openspec/changes/archive/auth-foundation-slice-c/spec.md` — sibling delta spec; format and tone reference.
- `AGENTS.md` (root) — §5.3 `pnpm-lock.yaml` policy; §3 dual-language docs mirror policy.
