# Spec — `ui` capability

**Author**: Sebastián Illa
**Capability**: `ui`
**Source change**: `transactions-ui`
**Status**: implemented · **Created**: 2026-06-27 · **Promoted**: 2026-06-29 (sdd-archive, after 6 slice PRs merged on develop via #98/#99/#100/#101/#102 + slice 6 docs-and-perf)
**Stack**: v3 — Next.js 16 + Node 20 + React 19 + Hono catch-all + Auth.js v5 (inherited from `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4

> Canonical spec for the `ui` capability. It operationalizes the
> `transactions-ui` proposal v1 (2026-06-27). The spec declares
> **what MUST be true** after the change lands, not how to
> implement it. Implementation details (file paths, component
> names, schema syntax, test layout) are limited to what the
> cross-module contract requires.
>
> This is the **canonical spec** for the `ui` capability,
> promoted from the change-folder delta on 2026-06-29 by the
> `sdd-archive` phase of the `transactions-ui` change (see
> `openspec/changes/transactions-ui/apply-progress.md` §"Slice 6
> — docs-and-perf"). The delta copy is kept in lockstep at
> `openspec/changes/transactions-ui/specs/ui/spec.md` as the
> audit-trail; the canonical at `openspec/specs/ui/spec.md` is
> the source of truth. The Spanish mirror lives at
> `Documents-es/openspec/specs/ui/spec.md`.

## Purpose

The `ui` capability is the **presentation layer** of
`gastos-personales`. It owns the design-system primitives (token
table, base components, layout shell) and the production UI
surfaces that render the read and write seams exposed by the
existing capabilities (`auth`, `accounts`, `transactions`,
`reports`). The capability guarantees that: (a) every surface
respects the existing `auth()` Server Component gate and does
not introduce a parallel data path; (b) every UI primitive is
**WCAG 2.2 AA accessible** at the floor (`critical` + `serious`
axe-core violations are zero); (c) the design system is
**hand-built** on top of the project's existing Tailwind v4
tokens with no new top-level dependency (no shadcn, no NextUI,
no MUI, no Chakra, no Radix in v1); (d) the v1 theme is light
only and the copy is mixed EN/ES (the existing convention);
dark mode, full i18n, mobile native, and charting libraries
stay out of v1.

The capability exposes two additive query flags on existing
GET endpoints — `include=lastActivity` on
`GET /api/accounts` and `include=accountName` on
`GET /api/transactions` — that are the only API surface
changes (the endpoints WITHOUT the flag are unchanged). The
dashboard's `?accountId=` and `?month=` query parameters are
**pure UI state** (search params read), not new API surface.
Every other UI change is a render swap of existing routes,
data contracts, and Hono endpoints.

## Scope

### In scope

- A new `app/_ui/` folder containing:
  - `app/_ui/tokens.css` — Tailwind v4 CSS-first token
    declarations extending the existing class table.
    v1 tokens cover spacing, color roles, radius scale,
    elevation, and typography scale (see §Glossary).
  - Base presentational components (Server Component by
    default, Client Component only when interactive):
    `Button`, `Input`, `Textarea`, `Select`, `Checkbox`,
    `RadioGroup`, `Combobox`, `FieldError`, `FormField`,
    `Card`, `CardHeader`, `CardBody`, `CardFooter`,
    `Table`, `TableHeader`, `TableBody`, `TableRow`,
    `TableCell`, `Badge`, `EmptyState`, `Spinner`,
    `Skeleton`, `Pagination`, `Dialog`, `Breadcrumb`,
    `Link`.
  - Layout shell primitives: `PageHeader`, `PageContainer`,
    `Sidebar`, `Topbar`, `BreadcrumbBar`.
- A new layout pattern replacing the smoke pages' bare
  `<main className="p-6">` wrapper. The existing root layout
  `app/layout.tsx` is reused unchanged; no new global wrapper.
- Production renders for the three existing smoke surfaces:
  - `app/accounts/{page.tsx, [id]/page.tsx, new/page.tsx}`
  - `app/transactions/{page.tsx, [id]/page.tsx, new/page.tsx}`
  - `app/dashboard/page.tsx`
  - The corresponding presentational components
    (`AccountsListTable`, `AccountDetail`,
    `CreateAccountForm`, `TransactionsListTable`,
    `TransactionDetail`, `CreateTransactionForm`,
    `MonthlySummaryCard`, `CategoryBreakdownCard`,
    `AccountFlowCard`).
- Two new Client Components for dashboard query-param state:
  - `app/_components/dashboard-account-picker.tsx`
    (navigates to `?accountId=<id>`).
  - `app/_components/dashboard-month-switcher.tsx`
    (renders `<Link>`s for previous / current / next month).
- User-facing error boundaries per route segment:
  `app/error.tsx`, `app/dashboard/error.tsx`,
  `app/accounts/error.tsx`,
  `app/transactions/error.tsx`.
- Two additive query flags on existing GET endpoints:
  - `GET /api/accounts?include=lastActivity`
    (response gains `lastActivityAt` per row).
  - `GET /api/transactions?include=accountName`
    (response gains `accountName` per row).
- Tests:
  - Vitest + Testing Library unit tests per primitive
    (primary, loading/disabled, empty state).
  - Snapshot tests for the static presentational primitives
    (`Card`, `Badge`, `EmptyState`, `Skeleton`,
    `Breadcrumb`).
  - Coverage ≥ 80% on `app/_ui/`, `app/accounts/`,
    `app/transactions/`, `app/dashboard/`.
- Documentation artifacts:
  - `docs/architecture/ui.md` (token table + component
    inventory).
  - `docs/qa/transactions-ui.md` (manual QA checklist,
    user-owned).
  - `docs/perf/transactions-ui.md` (Lighthouse output).

### Out of scope

- **Dark mode.** The token table is dark-mode-ready (it uses
  CSS custom properties), but the v1 theme is light only.
  A follow-up `ui-dark-mode` change adds the dark token
  values and the toggle.
- **i18n (English / Spanish).** v1 ships the mixed EN/ES copy
  the smoke pages already use. A follow-up `ui-i18n` change
  introduces a message catalog.
- **Mobile native.** Web only. Layout responsive down to
  375px (the smallest Tailwind v4 target). No React Native /
  Expo shell.
- **Charts library.** Dashboard renders `Table` + CSS-bar
  progress bars. No `recharts` / `chartjs` / `d3`. Deferred
  to a follow-up `ui-charts` change.
- **Accessibility audit beyond WCAG 2.2 AA.** AA is the floor
  (`critical` + `serious` axe-core violations are zero).
  AAA audits (text-on-accent contrast, full keyboard parity
  on drag interactions) are deferred.
- **Pixel-perfect design review.** The visual direction is
  approved at the proposal phase. The reviewer sign-off is the
  user's responsibility during the verify gate.
- **Beta testing.** No TestFlight / internal beta. v1 ships
  on `develop` and merges to `main` per the standard release
  flow.
- **`snapshots` capability UI.** The net-worth-over-time
  surface is not in scope. The `snapshots` slot in
  `openspec/config.yaml` is forward-declared but stays
  empty until a future change introduces both the data model
  and the surface.

### Capability boundary

- `ui` owns the design-system primitives (`app/_ui/`), the
  layout shell, the production page renders, the
  query-param state Client Components for the dashboard, and
  the error boundaries per route segment.
- `ui` reads from the existing Hono API
  (`serverHonoRequest`) — no new repository ports, no new
  Prisma models, no new migrations.
- `ui` MAY add the two additive query flags
  (`include=lastActivity` on `/api/accounts`,
  `include=accountName` on `/api/transactions`). The flag is
  optional; the endpoint WITHOUT the flag MUST remain
  unchanged. The data shape gains optional fields only.
- `ui` MUST NOT introduce new top-level dependencies. The
  primitives are hand-built on React 19 + Tailwind v4 + the
  project's existing class table.
- `ui` MUST NOT bypass the `auth()` Server Component gate.
  Every page MUST keep the session-resolution + redirect
  pattern from the smoke pages.
- `ui` MUST NOT add new HTTP framework code, state-management
  libraries, or charting libraries.
- The dashboard's `?accountId=` and `?month=` search params
  are UI state, NOT new API surface. The Hono routes are
  unchanged; the search params are read in the Server
  Component before the parallel fetch.

## Glossary

The terms below are part of the contract. Each is defined
once here and used verbatim throughout the spec.

| Term                 | Definition                                                                                                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Token**            | A CSS custom property declared in `app/_ui/tokens.css` (e.g. `--ui-bg`, `--ui-space-2`). Tokens are the single source of styling.                                                                                                                                |
| **Primitive**        | A base presentational component in `app/_ui/` (e.g. `Button`, `Card`, `Table`). Primitives accept a `className` override and forward standard HTML attributes.                                                                                                   |
| **Layout shell**     | The structural primitives that wrap a page (`PageHeader`, `PageContainer`, `Sidebar`, `Topbar`, `BreadcrumbBar`).                                                                                                                                                |
| **Surface**          | A Next.js App Router page that consumes one or more primitives to render a feature (e.g. `/transactions`, `/dashboard`).                                                                                                                                         |
| **State machine**    | The four UI states a surface can render: `empty`, `loading`, `error`, `success`. Every surface declares which states it covers.                                                                                                                                  |
| **Query flag**       | An additive `?<key>=<value>` query parameter on an existing GET endpoint that, when present, augments the response with extra optional fields. The endpoint without the flag is unchanged.                                                                       |
| **A11y floor**       | The minimum accessibility contract: `critical` + `serious` axe-core violations are zero; every interactive element has a visible focus indicator; every form field has a paired `<label>` (or `aria-label`); every table has `<caption>` and `<th scope="col">`. |
| **WCAG 2.2 AA**      | The conformance level asserted by axe-core `critical` + `serious` = 0. AAA is deferred to a follow-up change.                                                                                                                                                    |
| **Snapshot test**    | A Vitest assertion that compares the rendered output of a presentational component to a stored golden file. Drift requires the explicit `--update` flag.                                                                                                         |
| **Mixed EN/ES copy** | The project's existing convention: Spanish for dashboard copy and labels, English for component-level UI text (tooltips, button text, etc.). A follow-up `ui-i18n` change introduces a message catalog.                                                          |

## Business rules

The rules below are normative. Each rule has a stable ID for
traceability across spec, design, implementation, and tests.

### Carried from other capabilities

- **BR-TX-4 (carried)** — Every cross-module reference to a
  transaction scopes to `userId`. The `ui` capability does not
  bypass this; the Hono routes already enforce it. The UI
  just renders.
- **BR-ACC-12 (carried)** — Storage is never converted. The
  UI renders the snapshotted `convertedAmountMinor` /
  `convertedCurrency` columns; no live FX call in the read
  path.
- **BR-RPT-7 (carried)** — Dashboard auth gate lives at the
  Server Component. The new `?accountId=` and `?month=`
  query parameters are UI state; the userId scoping of the
  Hono routes is the access control.

### New (BR-UI-N family)

- **BR-UI-1 (NEW)** — `GET /api/accounts` MAY accept an
  `include=lastActivity` query flag. When present, the
  response includes a `lastActivityAt` field per row (the
  most recent transaction's `transactionDate`, or `null` if
  the account has no transactions). The endpoint WITHOUT the
  flag MUST remain unchanged (no `lastActivityAt` field
  present).
- **BR-UI-2 (NEW)** — `GET /api/transactions` MAY accept an
  `include=accountName` query flag. When present, the
  response includes an `accountName` field per row (the
  parent account's name). The endpoint WITHOUT the flag MUST
  remain unchanged (no `accountName` field present).
- **BR-UI-3 (NEW)** — Every interactive primitive renders a
  visible focus indicator on `:focus-visible`. The covered
  primitives are `Button`, `Link`, `Input`, `Select`,
  `Combobox`, `Checkbox`, `RadioGroup`, `Table` row actions,
  `Pagination` controls, and `Dialog` controls. The visual
  treatment MUST be at least `focus-visible:ring-2` (or an
  equivalent Tailwind v4 token).
- **BR-UI-4 (NEW)** — Every form field renders a paired
  `<label htmlFor="<field-id>">` (or `aria-label` for
  icon-only buttons). The pairing MUST be enforced by a test
  on each form.
- **BR-UI-5 (NEW)** — Form errors are surfaced inline. The
  first error message from the API response is rendered next
  to the offending field with `aria-describedby` linking the
  field to the error. The form MUST NOT rely solely on a
  top-of-form alert.
- **BR-UI-6 (NEW)** — Submit buttons render a loading state
  (`Spinner` + `disabled` + `aria-busy="true"`) while the
  Server Action is in flight. Double-clicks are debounced.
- **BR-UI-7 (NEW)** — Tables render `<caption>` (visible or
  `sr-only`) and `<th scope="col">` headers. Sortable columns
  render `aria-sort` reflecting the current sort direction.
- **BR-UI-8 (NEW)** — v1 ships a single light theme. Dark-mode
  tokens are declared but unused. A follow-up `ui-dark-mode`
  change activates them.
- **BR-UI-9 (NEW)** — Every primitive's intent, props, and
  a11y contract are documented in `docs/architecture/ui.md`.
  New components added without docs fail the verify gate.
  The `docs/qa/transactions-ui.md` manual checklist is
  user-owned and the verify gate fails until the user signs
  it off.

## Requirements

### API augmentation (query flags)

#### Requirement: include=lastActivity adds lastActivityAt to accounts list (REQ-UI-1)

`GET /api/accounts` MUST accept an `include=lastActivity`
query flag. When the flag is present, the response MUST
include a `lastActivityAt` field per account, equal to the
most recent transaction's `transactionDate` (ISO-8601) or
`null` when the account has no transactions. When the flag is
absent, the response MUST NOT include `lastActivityAt`; the
field MUST be omitted entirely from each row. The endpoint
without the flag MUST be byte-identical to the existing
contract.

(Traces: BR-UI-1.)

#### Scenario: include=lastActivity returns the timestamp

- GIVEN: an authenticated session
- AND: account `A` has 3 transactions, the most recent on
  `2026-06-15T12:00:00Z`
- WHEN: `GET /api/accounts?include=lastActivity` is called
- THEN: the response status is `200`
- AND: account `A` is in the response
- AND: `A.lastActivityAt` is `"2026-06-15T12:00:00.000Z"`
  (or an equivalent ISO-8601 string)

#### Scenario: include=lastActivity returns null for empty accounts

- GIVEN: an authenticated session
- AND: account `B` exists with zero transactions
- WHEN: `GET /api/accounts?include=lastActivity` is called
- THEN: account `B` is in the response
- AND: `B.lastActivityAt` is `null`

#### Scenario: endpoint without the flag is unchanged

- GIVEN: any state
- WHEN: `GET /api/accounts` is called (no flag)
- THEN: the response status is `200`
- AND: no row in the response carries a `lastActivityAt`
  field

#### Requirement: include=accountName adds accountName to transactions list (REQ-UI-2)

`GET /api/transactions` MUST accept an `include=accountName`
query flag. When the flag is present, the response MUST
include an `accountName` field per transaction, equal to the
parent account's name. When the flag is absent, the response
MUST NOT include `accountName`; the field MUST be omitted
entirely from each row. The endpoint without the flag MUST
be byte-identical to the existing contract.

(Traces: BR-UI-2.)

#### Scenario: include=accountName returns the account name

- GIVEN: an authenticated session
- AND: account `A` has `name = "Main ARS account"`
- AND: a transaction `T` exists with `accountId = A`
- WHEN: `GET /api/transactions?include=accountName` is called
- THEN: the response status is `200`
- AND: transaction `T` is in the response
- AND: `T.accountName` is `"Main ARS account"`

#### Scenario: endpoint without the flag is unchanged

- GIVEN: any state
- WHEN: `GET /api/transactions` is called (no flag)
- THEN: the response status is `200`
- AND: no row in the response carries an `accountName` field

### UI state machine

#### Requirement: list pages render empty/loading/error/success (REQ-UI-3)

Every list surface (`/transactions`, `/accounts`,
`/dashboard`) MUST declare the four UI states — `empty`,
`loading`, `error`, `success` — and render the corresponding
branch on each render. The `empty` state renders an
`EmptyState` primitive with an illustration slot and a
context-appropriate CTA. The `loading` state renders a
`Skeleton` placeholder matching the populated layout's
shape. The `error` state renders a user-facing error
boundary (`app/<segment>/error.tsx`) with the error message
and a retry link to the same route. The `success` state
renders the populated layout. The state branch MUST be
testable independently of the others.

(Traces: BR-UI-1, BR-UI-2.)

#### Scenario: empty list renders EmptyState with CTA

- GIVEN: an authenticated user with zero transactions
- WHEN: the user visits `/transactions`
- THEN: the page renders the `EmptyState` primitive
- AND: the page renders a CTA linking to `/transactions/new`

#### Scenario: error boundary renders on Server Component throw

- GIVEN: an authenticated session
- AND: `GET /api/transactions` returns a 5xx
- WHEN: the user visits `/transactions`
- THEN: the page renders the user-facing error boundary
  (`app/transactions/error.tsx`)
- AND: the boundary renders the error message and a retry
  link to `/transactions`

#### Scenario: success renders the populated layout

- GIVEN: an authenticated user with 3 transactions
- WHEN: the user visits `/transactions`
- THEN: the page renders the populated `Table` layout
- AND: the table contains 3 rows ordered by `transactionDate`
  descending

### Accessibility (WCAG 2.2 AA)

#### Requirement: every interactive primitive has a visible focus indicator (REQ-UI-4)

Every interactive primitive MUST render a visible focus
indicator when focused via keyboard. The covered primitives
are `Button`, `Link`, `Input`, `Select`, `Combobox`,
`Checkbox`, `RadioGroup`, `Table` row actions, `Pagination`
controls, and `Dialog` controls. The visual treatment MUST
be at least `focus-visible:ring-2` (or an equivalent Tailwind
v4 token); the indicator MUST have a contrast ratio of at
least 3:1 against the surrounding background. A regression
test asserts the focus ring is present on every covered
primitive.

(Traces: BR-UI-3, BR-UI-9.)

#### Scenario: Button renders focus ring on keyboard focus

- GIVEN: a `Button` primitive rendered on a page
- WHEN: the user presses `Tab` to focus the button
- THEN: the focused button renders the focus ring
- AND: the focus ring is visible against the surrounding
  background

#### Requirement: every form field has a paired label (REQ-UI-5)

Every form field MUST render a paired `<label htmlFor="<id>">`
(or `aria-label` for icon-only buttons). The pairing MUST be
enforced by a test on each form. Icon-only buttons MUST
carry an `aria-label` that describes the action. A
regression test asserts that every `<input>` / `<select>` /
`<textarea>` on a form has a paired label or `aria-label`.

(Traces: BR-UI-4.)

#### Scenario: form field label pairs with input

- GIVEN: a `CreateTransactionForm` rendered with fields
  `accountId`, `amountMinor`, `currency`, `direction`,
  `transactionDate`, `memo`, `category`
- WHEN: the form is rendered
- THEN: every field has a paired `<label htmlFor="<id>">`
  where the `id` matches the field's `id` attribute

#### Scenario: icon-only button carries aria-label

- GIVEN: a `Pagination` primitive rendered with a
  `Previous page` icon-only button
- WHEN: the primitive is rendered
- THEN: the `<button>` element carries
  `aria-label="Previous page"`

#### Requirement: form errors render inline with aria-describedby (REQ-UI-6)

Form errors MUST be rendered next to the offending field
with `aria-describedby` linking the field to the error
element's `id`. The first error message from the API
response (`error.message` or `error.details[0]`) is rendered.
The form MUST NOT rely solely on a top-of-form alert.
A regression test asserts the `aria-describedby` attribute
is present on every field with a server-side error.

(Traces: BR-UI-5.)

#### Scenario: inline error appears next to offending field

- GIVEN: a `CreateTransactionForm` is submitted with
  `amountMinor = 0`
- WHEN: the API returns `400 INVALID_AMOUNT`
- THEN: the amount field renders an error message
- AND: the error message's `id` is referenced by the
  field's `aria-describedby`
- AND: the error message text matches the API's
  `INVALID_AMOUNT` message

#### Scenario: no top-of-form alert alone

- GIVEN: any form with server-side errors
- WHEN: the form renders the error state
- THEN: every error has an inline rendering next to its
  field
- AND: if a top-of-form summary exists, it is a secondary
  surface, not the primary one

#### Requirement: submit buttons render a loading state (REQ-UI-7)

Submit buttons MUST render a loading state (`Spinner` icon +
`disabled` attribute + `aria-busy="true"`) while the Server
Action is in flight. Double-clicks MUST be debounced; a
second click within the action's pending window MUST NOT
trigger a second submission. A regression test asserts the
button transitions to `disabled` and renders the `Spinner`
on submit, and that a second submit is debounced.

(Traces: BR-UI-6.)

#### Scenario: submit transitions to loading on click

- GIVEN: a `CreateTransactionForm` with a valid body
- WHEN: the user clicks the submit button
- THEN: the button renders the `Spinner` icon
- AND: the button has `disabled` set to `true`
- AND: the button has `aria-busy="true"`

#### Scenario: double-click is debounced

- GIVEN: a `CreateTransactionForm` with the submit button in
  loading state
- WHEN: the user clicks the button a second time
- THEN: the second click is ignored
- AND: the Server Action is invoked exactly once

#### Requirement: tables have caption, scope, and aria-sort (REQ-UI-8)

Every `Table` primitive MUST render `<caption>` (visible or
`sr-only`), `<th scope="col">` headers, and `aria-sort` on
sortable columns reflecting the current sort direction
(`ascending`, `descending`, or `none`). A regression test
asserts the caption and scope attributes are present, and
that sortable columns update `aria-sort` when the sort
direction changes.

(Traces: BR-UI-7.)

#### Scenario: table renders caption and scope

- GIVEN: a `TransactionsListTable` rendered with columns
  `Date`, `Direction`, `Account`, `Native amount`,
  `Converted amount`
- WHEN: the table renders
- THEN: the table element has a `<caption>` (visible or
  `sr-only`)
- AND: every `<th>` carries `scope="col"`

#### Scenario: sortable column reflects aria-sort

- GIVEN: a `TransactionsListTable` with the `Date` column
  sorted descending by default
- WHEN: the table renders
- THEN: the `Date` `<th>` carries `aria-sort="descending"`
- AND: the other column `<th>`s carry `aria-sort="none"`

### Theme and tokens

#### Requirement: v1 ships a single light theme (REQ-UI-9)

The v1 production UI MUST ship a single light theme. The
token table at `app/_ui/tokens.css` MAY declare dark-mode
token values via CSS custom properties (so the follow-up
`ui-dark-mode` change is non-breaking), but v1 MUST NOT
render the dark tokens. The dashboard MUST NOT include a
theme toggle. A code-review check asserts that no dark-mode
CSS rules are rendered in v1 (e.g. no `dark:` Tailwind
variants in `app/_ui/` or in the production page renders).
Every primitive MUST render with the light token values.

(Traces: BR-UI-8, BR-UI-9.)

#### Scenario: no dark variants in production pages

- GIVEN: the v1 codebase
- WHEN: `git grep` runs for `dark:` inside `app/_ui/`,
  `app/accounts/`, `app/transactions/`, `app/dashboard/`,
  `app/_components/dashboard-*.tsx`
- THEN: zero `dark:` Tailwind variants are present

#### Scenario: token table declares both themes

- GIVEN: `app/_ui/tokens.css`
- WHEN: the file is read
- THEN: light-mode token values are the rendered defaults
- AND: dark-mode token values are declared under a
  `[data-theme="dark"]` selector (or equivalent CSS scope)
  for future activation

### Documentation and QA

#### Requirement: every primitive is documented (REQ-UI-10)

Every primitive in `app/_ui/` MUST have a corresponding
section in `docs/architecture/ui.md` describing its intent,
props, and a11y contract. New primitives added without
docs fail the verify gate. The docs artifact MUST include a
token table mapping each `ui-*` class to its CSS custom
property. The verify gate asserts that every exported
primitive has a docs section.

(Traces: BR-UI-9.)

#### Scenario: token table maps every ui-\* class

- GIVEN: `app/_ui/tokens.css` declares the v1 token set
- WHEN: `docs/architecture/ui.md` is read
- THEN: the token table lists every `ui-*` class used by any
  primitive
- AND: each row maps the class to its CSS custom property

#### Scenario: every primitive has a docs section

- GIVEN: the exported primitives in `app/_ui/`
- WHEN: `docs/architecture/ui.md` is read
- THEN: the docs have one section per exported primitive
- AND: each section describes intent, props, and a11y
  contract

#### Requirement: manual QA checklist is user-owned (REQ-UI-11)

`docs/qa/transactions-ui.md` MUST exist and contain a manual
QA checklist covering keyboard navigation (Tab order, focus
visible, Enter/Space activation, Escape to close dialogs) and
screen reader run-through (VoiceOver on macOS, NVDA on
Windows) on every page. The checklist MUST record dark mode
as out of scope for v1 (follow-up). The verify gate MUST
fail until the user signs off the checklist (the sign-off
date is recorded in the file).

(Traces: BR-UI-9.)

#### Scenario: checklist exists and is signed off

- GIVEN: the verify gate runs
- WHEN: `docs/qa/transactions-ui.md` is read
- THEN: the file contains a `Signed off by:` line with a
  non-empty user name and a date
- AND: the checklist covers keyboard nav + screen reader +
  the dark-mode follow-up note

## Migration

No Prisma migration. `ui` is a presentation-layer consumer
of the existing capabilities. The schema is unchanged. The
two additive query flags (`include=lastActivity`,
`include=accountName`) augment the existing GET endpoints'
response shapes with optional fields only; existing callers
that omit the flag see a byte-identical response.

## Cross-references

- **Proposal**: `openspec/changes/transactions-ui/proposal.md`
  — the upstream change that created this capability.
  BR-UI-1 to BR-UI-9 are codified here; the proposal carries
  the rationale, the alternatives considered, and the
  forecast.
- **Transactions spec**: `openspec/specs/transactions/spec.md`
  — REQ-TX-15 is REPLACED (not extended) by REQ-UI-1 to
  REQ-UI-11; the replacement delta lives at
  `openspec/changes/transactions-ui/specs/transactions/spec.md`
  and is lifted into the canonical by `sdd-archive`.
- **Accounts spec**: `openspec/specs/accounts/spec.md` —
  BR-ACC-12 (display-only FX), BR-ACC-14 to BR-ACC-19 (smoke
  slice). The production UI replaces the render layer; the
  data shape (`FinancialAccountWire`) stays frozen.
- **Reports spec**: `openspec/specs/reports/spec.md` —
  BR-RPT-7 (Server Component auth gate) and the three
  report DTOs (`MonthlySummaryDTO`, `CategoryBreakdownDTO`,
  `AccountFlowDTO`) are consumed unchanged by the dashboard.
- **Auth spec**: `openspec/specs/auth/spec.md` — the
  `auth()` server-side helper invariant. Every page in the
  production UI keeps the session-resolution + redirect
  pattern.
- **Hono endpoints (stable inputs)**:
  - `app/api/[...path]/route.ts:7-25` — the protected catch-all
    the dashboard and form actions consume.
  - The two flags do not change the endpoints'
    route shape; they augment the response shape
    additively.
- **Design system reference** (slice 6 deliverable):
  `docs/architecture/ui.md` — token table + component
  inventory, codifying REQ-UI-10.
- **External services**: none. The read path never reaches
  an external service in v1 (FX calls happen at write time
  per `transactions` capability).

## History

- **2026-06-27 (v1 draft)** — first write. Created by the
  `transactions-ui` change. Locks the four open questions
  from the proposal: Q1 (additive query flags without
  backward-compat break, codified in REQ-UI-1 and REQ-UI-2);
  Q2 (hand-built Combobox on `<select>` + `<input>`, no new
  dep, codified in the §Scope capability boundary); Q3
  (light theme only, dark tokens declared but unused,
  codified in REQ-UI-9); Q4 (manual QA owner is the user,
  codified in REQ-UI-11). Scope: design-system primitives
  (`app/_ui/`) + production renders for the three existing
  smoke surfaces (`/transactions`, `/accounts`, `/dashboard`)
  - dashboard query-param state Client Components + user-
    facing error boundaries. No Prisma migration. No new
    top-level dependencies. v1 ships web + light + mixed EN/ES
  - Table/CSS-bar render. Dark mode, i18n, mobile native,
    charting library, AAA a11y audit, and `snapshots`
    capability deferred to follow-up changes.

## References

- `openspec/changes/transactions-ui/proposal.md` — proposal
  v1 (2026-06-27) with BR-UI-1 to BR-UI-9.
- `openspec/changes/transactions-ui/proposal.md` §"Open
  questions" — Q1 to Q4 locked at pre-spec session.
- `openspec/specs/auth/spec.md` — `auth()` helper invariant,
  userId scoping.
- `openspec/specs/accounts/spec.md` — BR-ACC-12,
  BR-ACC-14 to BR-ACC-19.
- `openspec/specs/transactions/spec.md` — REQ-TX-15 replaced
  by this spec's REQs.
- `openspec/specs/reports/spec.md` — BR-RPT-7, three report
  DTOs.
- `openspec/specs/fx/spec.md` — BR-ACC-12 / BR-ACC-13
  (display-only FX).
- `app/api/[...path]/route.ts:7-25` — the protected catch-all
  consumed by every Server Component.
- `openspec/config.yaml` — strict TDD rules; `pnpm test`
  runner.
- `AGENTS.md` (root) — §5.3 `pnpm-lock.yaml` policy (no new
  deps in this change); §10.5 (modules-isolated rule); §13
  dual-language docs mirror policy.
- `openspec/AGENTS.md` — author attribution invariant; this
  spec's author is `Sebastián Illa`.
