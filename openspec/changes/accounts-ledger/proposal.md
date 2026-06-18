# Proposal — `accounts-ledger`

**Status**: draft · **Author**: Sebastián Illa · **Created**: 2026-06-18
**Supersedes**: v1 (PR #26), v2 (PR #27) — both closed unmerged
**Target slice**: MVP-1 (accounts ledger + smoke UI)
**Upstream**: global SDD preflight (interactive, both, auto-forecast, 400 lines)

> **v3 note**: third write of this proposal. v1 (PR #26, 2026-06-18)
> shipped a flat model with `{ ARS, USD }` whitelist and was closed
> unmerged after the user expanded the requirements mid-review. v2
> (PR #27, 2026-06-18) added per-type structure, expanded the
> whitelist to `{ ARS, USD, EUR }`, introduced display-only FX via a
> new `/balance` endpoint, and was also closed unmerged (UX review
> uncovered the need for a hand-validatable UI before further API
> work). **v3 keeps every v2 decision intact** and adds a
> **smoke-minimal UI** slice so a developer or PM can exercise the
> API by hand in under five minutes. No Prisma or business-rule
> changes from v2.

## Why

`accounts-ledger` is the second capability to land after
`auth-foundation`. The Prisma model, the 6-type discriminated
account structure, the currency whitelist, and the FX-for-display
contract are already settled in v2. What v2 lacked was a way for a
human to exercise the API end-to-end without curl scripts.

A smoke-minimal UI does three things:

1. **Validates the API surface** by exposing it to the failure modes
   humans actually hit (auth redirects, form validation, error
   rendering) before downstream capabilities (`transactions`,
   `fx-cache`, `networth-snapshot`) integrate against it.
2. **De-risks the production UI** by giving the next change
   (`ui-accounts` or `pwa-shell`) a working reference for the
   Hono typed client, the discriminated-union form pattern, and
   the `/balance` widget.
3. **Stays small enough to ship in the same SDD**. Three Next.js
   pages, ~200–300 lines total, no tests (verified by hand).

The smoke UI is not the production UI. There is no navigation
shell, no theme system, no edit/archive buttons, no design polish.
It is a demo harness in the same repo so the API can be clicked
through at `pnpm dev`. Production UI work lives in `ui-accounts`
or `pwa-shell`, separate changes.

## What

The change ships in two layers that land in the same SDD but
across **three chained PRs** (see Forecast).

### Layer A — API (unchanged from v2)

- Prisma model `FinancialAccount` with 6 types, per-type field sets,
  currency whitelist `{ ARS, USD, EUR }`, soft archive via
  `archivedAt`, opening-balance hybrid via `openingBalanceMode`
  discriminated union.
- Hono endpoints under `/api/accounts`:
  - `GET /api/accounts` — cursor-paginated list (UI shows first 50).
  - `POST /api/accounts` — create with type-driven validation.
  - `GET /api/accounts/:id` — full row including type-specific fields.
  - `PATCH /api/accounts/:id` — partial update (UI does not call it in v3).
  - `POST /api/accounts/:id/archive`, `POST /api/accounts/:id/unarchive`
    (UI does not call them in v3).
  - `GET /api/accounts/:id/balance?displayCurrency=…` — display-only
    FX conversion via `FxRateProvider` (UI does call this).
- `FxRateProvider` interface declared in this change; implementation
  lands in the separate `fx-cache` change. Storage never touched.
- Strict TDD on the domain + API layer (Vitest, RED → GREEN →
  REFACTOR per `openspec/config.yaml`).

### Layer B — UI smoke slice (new in v3)

Three Next.js App Router pages under `app/accounts/`, all in the
same Next.js app as `auth-foundation`:

| Path                         | Render mode                              | Purpose                                                                                                   |
| ---------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `app/accounts/page.tsx`      | Server Component                         | List the authenticated user's accounts. Reads `GET /api/accounts` via the Hono typed client.              |
| `app/accounts/new/page.tsx`  | Server Component shell + Client form     | Type-driven create form. Submits to `POST /api/accounts`; redirects to `/accounts` on success.            |
| `app/accounts/[id]/page.tsx` | Server Component + Client balance widget | Detail view + an inline form that converts balance via `GET /api/accounts/:id/balance?displayCurrency=…`. |

All three pages rely on the existing auth flow at `/auth/signin`.
Missing session → redirect to `/auth/signin?callbackUrl=…`. No auth
UI is added here.

## Out of scope (this change)

- Navigation sidebar, app shell, header, footer.
- Edit / archive / unarchive buttons in the UI. `PATCH`,
  `POST /:id/archive`, `POST /:id/unarchive` are API-only in v3;
  the buttons are added in `ui-accounts`.
- Tailwind component library or design system.
- Loading skeletons beyond a plain `"Loading…"` string.
- Tests on the UI. The smoke slice is verified by hand: developer
  or PM runs `pnpm dev`, signs in, exercises the three pages.
- Email notifications, scheduled jobs, background workers.
- Production auth hardening (rate limiting on UI-driven endpoints).
- Bulk import / CSV upload.
- `transactions`, `fx-cache`, `networth-snapshot`, `reports-mvp`
  (each is its own SDD change).

## Non-goals

- **Not a production UI.** No accessibility audit, no i18n, no SEO,
  no SSR caching, no error boundaries beyond `error.tsx`.
- **Not replacing `ui-accounts` or `pwa-shell`.** Those changes own
  the shell, navigation, theming, and the production forms.
- **Not introducing React Hook Form, TanStack Query, or any new UI
  library.** The slice uses `useState` + plain CSS (see Decision
  Gaps for the Tailwind question).
- **Not changing the API surface.** Every endpoint, request body,
  response shape, and error code is exactly as v2 specified.
- **Not migrating the v1/v2 git history.** Both branches are
  deleted; their commit messages remain in reflog (~30 days).

## Users and situations

| User                        | Situation                                                             | Touchpoint                                         |
| --------------------------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| Developer                   | Working on `accounts-ledger`; wants to confirm a fix end-to-end       | `pnpm dev` → sign in → `/accounts` → click around  |
| PM                          | Validating the API surface before stakeholder review                  | Same as above, without reading code                |
| Future `ui-accounts` author | Picks up the smoke UI as a reference for typed client + form patterns | Reads `app/accounts/*` and the typed client module |
| Authenticated user          | Signs in, lists accounts, creates one, views detail                   | The three pages                                    |
| Authenticated user with FX  | Opens account detail, converts to another currency                    | The balance widget                                 |

## Business rules

Stable IDs from v2 stand. Three new rules added in v3 for the UI:

1. **BR-ACC-12 (v2, carried) — FX display contract.** A read-only
   endpoint that converts the native balance to a display currency
   for the caller. Storage is never converted. The contract returns
   `{ native: { amount, currency }, display?: { amount, currency,
fxRate, fxAsOf }, warnings?: string[] }`. Errors: `503
FX_UNAVAILABLE`, `409 FX_NOT_SUPPORTED`.
2. **BR-ACC-13 (v2, carried) — FX rate freshness.** The provider
   returns the rate with `fxAsOf` even when the rate is stale
   (weekend or >24h old). The UI surfaces `fxAsOf` next to the
   converted amount so a human can judge freshness. Not a 5xx.
3. **BR-ACC-14 (NEW in v3) — UI redirect rule.** A server component
   under `app/accounts/*` that resolves a missing session MUST
   redirect to `/auth/signin?callbackUrl=<original-path>`, encoded
   with `encodeURIComponent`. The rule applies to all three pages.
4. **BR-ACC-15 (NEW in v3) — Form-state discipline.** The create
   form is a single Client Component. Its state is local
   (`useState` per field). The form never holds the authenticated
   user, the session, or any server-derived data in client state.
   It receives `type`-specific field metadata via props from the
   Server Component shell.
5. **BR-ACC-16 (NEW in v3) — Inline error surface.** When
   `POST /api/accounts` returns 4xx (validation), the form
   re-renders with an inline error banner under the submit button.
   The banner shows the first error message from the response
   body's `error` field. 5xx and network errors render a generic
   `"Something went wrong"` banner.

## Endpoints

(All unchanged from v2; reproduced here so the proposal is
self-contained.)

| Endpoint                      | Method | Auth     | Notes                                                                           |
| ----------------------------- | ------ | -------- | ------------------------------------------------------------------------------- | --- | ------------------------------ |
| `/api/accounts`               | GET    | Required | Cursor pagination. `?cursor=<opaque>&limit=<n>`. Default `limit=20`, max `100`. |
| `/api/accounts`               | POST   | Required | Type-driven body. Returns `201` + the created row.                              |
| `/api/accounts/:id`           | GET    | Required | Full row. `404` on cross-user.                                                  |
| `/api/accounts/:id`           | PATCH  | Required | Partial update. UI does not call it in v3.                                      |
| `/api/accounts/:id/archive`   | POST   | Required | Soft archive. UI does not call it in v3.                                        |
| `/api/accounts/:id/unarchive` | POST   | Required | Soft unarchive. UI does not call it in v3.                                      |
| `/api/accounts/:id/balance`   | GET    | Required | Display-only FX. `?displayCurrency=ARS                                          | USD | EUR`.`503`/`409` on FX errors. |

## Data model

(All unchanged from v2; reproduced here so the proposal is
self-contained.)

```prisma
// prisma/schema.prisma (additive on top of auth-foundation)

enum AccountType {
  BANK
  CREDIT
  INVESTMENT
  CRYPTO
  CASH
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

enum OpeningBalanceMode {
  FRESH          // balance starts at zero on creation date
  HISTORICAL     // balance is back-dated to openingBalanceDate
}

enum AccountCurrency {
  ARS
  USD
  EUR
}

model FinancialAccount {
  id                   String              @id @default(cuid())
  userId               String
  type                 AccountType
  name                 String              // free-text, 1-80 chars
  currency             AccountCurrency
  openingBalanceMinor  Int                 // minor units (cents)
  openingBalanceMode   OpeningBalanceMode
  openingBalanceDate   DateTime?           // required when mode = HISTORICAL
  archivedAt           DateTime?

  // Type-specific fields (only the relevant set is populated per type)
  bankName             String?             // BANK
  accountKind          AccountKind?        // BANK
  issuer               String?             // CREDIT
  creditLimitMinor     Int?                // CREDIT
  statementDay         Int?                // CREDIT (1-31, validated)
  paymentDueDay        Int?                // CREDIT (1-31, validated)
  broker               String?             // INVESTMENT
  investmentType       InvestmentType?     // INVESTMENT
  walletAddress        String?             // CRYPTO (optional)

  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, type, name])          // names are unique per user+type
  @@index([userId, archivedAt])           // list view: live accounts first
  @@index([userId, createdAt])            // list view: order by recency
}
```

Index notes (unchanged from v2):

- `@@unique([userId, type, name])` prevents two accounts of the
  same type sharing a name for the same user.
- `@@index([userId, archivedAt])` powers the live-first list.
- `@@index([userId, createdAt])` powers the recency-ordered list.

## UI surface (new in v3)

### Pages

**`app/accounts/page.tsx` — Server Component**

Reads `GET /api/accounts?limit=50` via the Hono typed client
(`src/lib/api-client.ts`, created in this change). Renders an HTML
`<table>` with columns: `Name`, `Type`, `Currency`, `Opening
balance`, `Archived`. Empty state renders the string `"No accounts
yet — create one"` with a `New account` button linking to
`/accounts/new`. If `total > 50`, render a small footer
`"Showing first 50 of <total>"`. Missing session → redirect to
`/auth/signin?callbackUrl=/accounts` per BR-ACC-14.

**`app/accounts/new/page.tsx` — Server Component + Client form**

Server shell renders a `<form>` and embeds the Client form
component. The form fields are rendered as a **single
discriminated-union-driven UI**: the user picks `type` first (a
`<select>` with the 6 enum values), then the type-specific fields
render below:

| Type         | Type-specific fields                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `BANK`       | `bankName` (text), `accountKind` (select SAVINGS / CHECKING)                                        |
| `CREDIT`     | `issuer` (text), `creditLimit` (number, optional), `statementDay` (1–31), `paymentDueDay` (1–31)    |
| `INVESTMENT` | `broker` (text), `investmentType` (select STOCKS / BONDS / MUTUAL_FUNDS / CERTS_OF_DEPOSIT / OTHER) |
| `CRYPTO`     | `walletAddress` (text, optional)                                                                    |
| `CASH`       | (none)                                                                                              |
| `OTHER`      | (none)                                                                                              |

The currency dropdown is `<select>` with `{ ARS, USD, EUR }`.
Opening balance is hybrid: a `<fieldset>` with two radio buttons
(`fresh` / `historical`). When `historical` is selected, two
additional fields render: `amount` (number, minor units) and
`date` (date input).

Submit calls `POST /api/accounts` via the typed client. On `201`,
`router.push('/accounts')`. On 4xx, BR-ACC-16 applies (inline
error banner). On 5xx or network error, the same banner with a
generic message.

**`app/accounts/[id]/page.tsx` — Server Component + Client widget**

Server component reads `GET /api/accounts/:id`. Renders the full
row including type-specific fields in a `<dl>`. The balance
widget is a Client Component that shows the **native balance** and
an inline form (`<form>` with a `<select name="displayCurrency">`
and a submit button). Submit triggers `router.refresh()` after
calling `GET /api/accounts/:id/balance?displayCurrency=…`. The
response renders `display.amount`, `display.fxRate`, and
`display.fxAsOf` next to the native balance.

Errors:

- `503 FX_UNAVAILABLE` → inline error: `"FX rate provider
unavailable. Try again in a few minutes."`.
- `409 FX_NOT_SUPPORTED` → inline error: `"FX conversion not
supported for this pair."`.

### Typed client

A small typed wrapper around the Hono client lives at
`src/lib/api-client.ts`. It re-exports the `AppType` from
`src/server/hono/app.ts` (created in this change) so the UI gets
type-safe `client.api.accounts.$get(...)` calls. No runtime
abstraction; just `hc<AppType>(process.env.NEXT_PUBLIC_API_URL)`.

### Styling

Plain CSS via `app/accounts/accounts.module.css` (one module per
page or one shared module — final call in `design`). No CSS
framework added in this change. See Decision Gaps for the
Tailwind question.

### Auth

All three pages resolve the session via `auth()` from
`next-auth` v5 (already exported by `auth-foundation`). Missing
session → `redirect('/auth/signin?callbackUrl=' + encodeURIComponent(pathname))`
per BR-ACC-14. The pages never read the session cookie directly.

## Decision gaps

These are open for the next round (proposal review → user
confirm → spec writes). Defaults are stated; the user can
override at review.

1. **DG-V3-1 — Styling system.** The task description referenced
   "plain Tailwind utility classes", but the project does not have
   `tailwindcss` in `package.json`, no `tailwind.config.ts`, no
   `postcss.config.*`. Adding Tailwind is a 3–5 file change
   (install, postcss config, content paths, base CSS). **Default**:
   plain CSS via `app/accounts/accounts.module.css` (~50 lines)
   or inline `style={{ ... }}` for one-offs. **Open**: confirm
   plain CSS, or accept the Tailwind install in this SDD.
2. **DG-V3-2 — List truncation hint.** When `total > 50`, render
   `"Showing first 50 of <total>"` in the table footer.
   **Default**: yes, show the count. **Open**: silent truncation
   is also acceptable.
3. **DG-V3-3 — Empty state copy.** The list page renders `"No
accounts yet — create one"` on empty result. **Default**:
   that exact copy in English. **Open**: Spanish copy now, or
   localize later in `ui-accounts`.

## Acceptance criteria

The change is done when:

1. `pnpm prisma migrate dev` lands the `FinancialAccount` table
   with the indexes above, and `pnpm prisma studio` shows the
   table in Neon.
2. `pnpm test` runs the domain + API suite and exits 0 with
   ≥80% coverage on `src/modules/accounts/**`.
3. `curl -H "Cookie: authjs.session-token=…" http://localhost:3000/api/accounts`
   returns the paginated list with cursor metadata.
4. `pnpm dev` → sign in → `/accounts` lists accounts with empty
   state and `New account` button.
5. `/accounts/new` form: type-driven fields render correctly for
   each of the 6 types, currency dropdown shows only `{ ARS, USD,
EUR }`, opening-balance hybrid switches between fresh and
   historical. Submit creates an account and redirects to
   `/accounts`.
6. `/accounts/[id]` shows the full row and the balance widget.
   Submitting the widget with `displayCurrency=USD` shows the
   converted amount, the `fxRate`, and the `fxAsOf`. Submitting
   when `fx-cache` is missing shows the `503` inline error.
7. Missing-session tests: clearing the cookie and visiting any of
   the three pages redirects to `/auth/signin?callbackUrl=…`.
8. No `pnpm-lock.yaml` drift after `package.json` is staged
   (Husky pre-commit check per root `AGENTS.md` §5.3).
9. `./Documents-es/openspec/changes/accounts-ledger/proposal.md`
   exists with the same content translated (no Chinese
   characters; verified per root `AGENTS.md` §3 mirror check).

## Risks

| Risk                                                                                | Mitigation                                                                              |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Plain-CSS default (DG-V3-1) looks unstyled vs. the task's Tailwind intent.          | DG-V3-1 surfaces it; if user prefers Tailwind, the design tasks add it before PR merge. |
| UI scope creep (edit/archive buttons, skeletons, navigation) leaks into the change. | Out-of-scope section is explicit; reviewer's job to enforce.                            |
| `fx-cache` lands after `accounts-ledger` and the balance widget shows 503 in prod.  | The 503 inline error is the documented behavior. Widget is verified by hand pre-merge.  |
| v2 git history is unrecoverable (branches deleted).                                 | Commit messages live in reflog ~30 days; v2 commit message is in `.git/COMMIT_EDITMSG`. |
| Three chained PRs exceed the 400-line review budget.                                | Auto-forecast accepts overage (user has done this before on `auth-foundation`).         |
| Smoke UI is mistaken for production-ready and shipped without `ui-accounts`.        | A short `// smoke-minimal, not production` comment in each page header.                 |

## Rollback

- **PR not merged**: `git branch -D feat/accounts-ledger-*`,
  `git worktree remove`.
- **PR merged to develop, pre-release**: revert the merge commit.
  `pnpm prisma migrate reset` is safe — the `FinancialAccount`
  table is additive (no destructive schema changes in v2 or v3).
  No user data is at risk because the table is additive.
- **PR released to production**: stop. This release is governed
  by the release flow (root `AGENTS.md` §5.5) which requires
  user approval. No automatic rollback path is documented here.

## Dependencies

- **Inbound**: `auth-foundation` (shipped). The auth module
  exports `auth()` from `src/modules/auth/index.ts`; the UI
  pages import it directly. The API uses the Hono catch-all
  mounted at `/api/[...path]/route.ts` (also shipped in
  `auth-foundation`).
- **Outbound**: `fx-cache` (future). The `FxRateProvider`
  interface is declared in this change; the implementation
  ships in `fx-cache`. The UI calls `GET /:id/balance`; if
  `fx-cache` is missing, the widget shows the `503` inline
  error.
- **Co-PR option**: `fx-cache` and `accounts-ledger` could land
  as co-PRs if `fx-cache` is ready before `accounts-ledger`
  reaches the `apply` phase. Default ordering: `fx-cache` first
  or concurrent; never after `accounts-ledger` ships.

## Forecast (auto, 400-line budget)

| PR  | Scope                                                                                                                                                          | Approx. lines | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| 1   | Prisma migration + domain entities (`AccountType`, `AccountKind`, `InvestmentType`, `OpeningBalanceMode` enums + `FinancialAccount` model) + domain unit tests | ~500          | Auto   |
| 2   | Hono endpoints (GET/POST/GET-by-id/PATCH/archive/unarchive/balance) + API integration tests + `FxRateProvider` interface                                       | ~900          | Auto   |
| 3   | Hono typed client + 3 Next.js pages + plain-CSS smoke slice + Spanish mirror                                                                                   | ~350          | Auto   |
|     | **Total**                                                                                                                                                      | **~1750**     |        |

Total exceeds the 400-line review budget by ~1350 lines. The user
has previously accepted multi-PR overages on `auth-foundation`
(the auth change shipped across 3 chained PRs of similar size).
This proposal does not request an exception; it documents the
split so reviewers know what to expect.

> The UI smoke slice is ~200–300 lines on top of the v2 API
> estimate (~2000 lines). v3 total: ~2200–2300 lines across 3
> chained PRs. Numbers are floor estimates; spec/design will
> refine.

## Audit trail

- **v1** (PR #26, 2026-06-18) — flat model, `{ ARS, USD }`
  whitelist, single `/api/accounts/:id` resource, no FX. Closed
  unmerged after the user expanded requirements mid-review
  (sub-accounts per bank, multiple cards per issuer, multiple
  investment accounts per broker, FX display, EUR added).
- **v2** (PR #27, 2026-06-18) — per-type structure, `{ ARS, USD,
EUR }` whitelist, `accountKind` / `investmentType` enums,
  `/api/accounts/:id/balance?displayCurrency=…` for display-only
  FX, `FxRateProvider` interface declared (impl in `fx-cache`).
  Closed unmerged after UX review surfaced the need for a
  hand-validatable UI before further API work.
- **v3** (this proposal) — v2 decisions preserved verbatim; new
  smoke-minimal UI slice (`app/accounts/page.tsx`,
  `app/accounts/new/page.tsx`, `app/accounts/[id]/page.tsx`),
  typed Hono client, plain CSS styling, hand-verified (no UI
  tests). No Prisma or business-rule changes from v2.

Refs: `openspec/specs/auth/spec.md` (cross-module contracts,
naming collision rule); `openspec/changes/archive/auth-foundation/proposal.md`
(API surface conventions, session reading); `openspec/config.yaml`
(strict TDD rules).
