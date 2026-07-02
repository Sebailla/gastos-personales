# Proposal — `transactions-ui`

**Status**: archived (2026-06-29, sdd-archive after PR #104) · **Author**: Sebastián Illa
**Created**: 2026-06-27 · **Target slice**: MVP-4 (production surface) · **Archived**: 2026-06-29 (post-merge of PRs #98/#99/#100/#101/#102/#103 + 4R cleanup #104 on `develop`)
**Upstream**: `openspec/AGENTS.md` (project lifecycle) · `openspec/config.yaml` (`ui` capability slot reserved at line 15; strict TDD; auto-forecast, 400 lines)
**Upstream**: global SDD preflight (interactive, both, auto-forecast, 400 lines; review budget 400)
**Upstream**: project contract (root `AGENTS.md` §2, §4.7, §5.4, §13; `openspec/AGENTS.md` author/dependencies)
**Downstream**: `snapshots` (future) — the `ui` capability slots and presentational components are reusable for the net-worth-over-time surface.

> First write of the `transactions-ui` proposal. The change introduces the
> **production UI surface** for the three CRUD + read surfaces that
> today ship as smoke-minimal Server Components under
> `app/transactions/`, `app/accounts/`, and `app/dashboard/`. The
> replacement is a design-system-primitives-based UI: tokens, base
> components, layout shell, and per-surface composition. **v1 ships
> web only** — dark mode, i18n (EN/ES), mobile native, and charts
> libraries stay out of v1 (deferred to follow-up changes). The
> change also creates the **`ui` capability spec** at
> `openspec/specs/ui/spec.md` (canonical) plus a delta spec that
> extends REQ-TX-15 (the existing smoke-UI requirement) into a
> production-grade UI requirement.

## Why

`auth-foundation`, `accounts-ledger`, `fx-cache`, `transactions`,
and `reports` all shipped their read and write surfaces but the
visible UI is **smoke-minimal** at every page. The product gap is
visible at first paint: the user can record a transaction, but the
list page is a `<table>` with no sort, no filter, no empty-state
illustration, no keyboard navigation. The create form is a
hand-written `<form>` with no inline validation, no field-level
error, no loading state. The dashboard renders three read-only
cards with no account picker, no month switcher, no screenshot-able
visual hierarchy.

Four seam-level signals confirm the change is ready to ship now:

1. **The `ui` capability slot is reserved and empty.**
   `openspec/config.yaml:15` declares the `ui` capability; the
   `openspec/specs/ui/` folder does not exist. The proposal
   creates both. No interface change to any other capability —
   the UI is a presentation concern that consumes the existing
   Hono routes unchanged.
2. **The read and write seams are stable.** Every page already
   goes through `serverHonoRequest` (REQ-TX-15, REQ-RPT-7). The
   UI change replaces the rendering layer; the data shape
   (`TransactionDTO`, `FinancialAccountWire`,
   `MonthlySummaryDTO`, etc.) stays frozen.
3. **The smoke pages carry an explicit "not production" header.**
   Every smoke page is tagged `// smoke-minimal, not production`
   in a top-of-file comment (the convention started in the
   `accounts` slice). The marker is the seam — replace the file,
   keep the route, keep the auth gate, keep the data contract.
4. **Tailwind v4 primitives are already in use.** The existing
   smoke pages render with the project's Tailwind v4 token table
   (`bg-blue-600`, `text-blue-900`, `rounded`, etc.); the
   production UI extends that table, not a new design system.
   The architecture rule "no new top-level dependencies" forbids
   shadcn/NextUI/MUI/Chakra — the primitives are hand-built on
   top of what is already installed.

The downstream consequences (deferred, named here for
traceability): `snapshots` (net-worth-over-time) reuses the
dashboard layout shell and the design-system primitives for its
own read surface; future i18n and dark-mode changes extend the
`ui` capability's token table, not the page-level components.

## What

The change ships **six chained slices** — five implementation
slices + one docs/verification slice — each a self-contained PR
targeting `develop` and gating on the prior slice merging. The
orchestrator's `auto-forecast` cache may split or merge slices
during `sdd-tasks`; the per-slice budget below is the proposal's
recommendation.

### Slice 1 — `ui-primitives` (PR #1)

- **Token table** at `app/_ui/tokens.css` — Tailwind v4 CSS-first
  token declarations extending the existing class table. v1
  tokens cover: spacing scale (`ui-space-{1..8}`), color roles
  (`ui-bg`, `ui-bg-muted`, `ui-bg-subtle`, `ui-fg`,
  `ui-fg-muted`, `ui-border`, `ui-accent`, `ui-danger`,
  `ui-success`, `ui-warning`), radius scale (`ui-rounded-{sm,md,
lg,full}`), elevation (`ui-shadow-sm (or -md, -lg)`), typography
  scale (`ui-text-xs (or -sm, -base, -lg, -xl, -2xl, -3xl)` + matching
  `ui-font-normal (or -medium, -semibold, -bold)`). **No new color
  palette** — the existing Tailwind v4 palette is consumed via
  CSS custom properties, not hard-coded.
- **Base components** at `app/_ui/` (Server Component by default,
  Client Component only when interactive): `Button`, `Input`,
  `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `FieldError`,
  `FormField`, `Card`, `CardHeader`, `CardBody`, `CardFooter`,
  `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`,
  `Badge`, `EmptyState`, `Spinner`, `Skeleton`, `Pagination`,
  `Breadcrumb`, `Link`. Each component accepts a `className`
  override and forwards all standard HTML attributes. No
  `as`/`variant` boolean-prop proliferation (Vercel composition
  patterns precedent; composition via children + compound
  components, not boolean flags).
- **Layout shell** at `app/_ui/layout/` — `PageHeader`,
  `PageContainer`, `Sidebar`, `Topbar`, `BreadcrumbBar`. The
  shell replaces the bare `<main className="p-6">` wrapper used
  by the smoke pages. The existing `app/layout.tsx` root layout
  is reused; no new global wrapper.
- **Tests** at `app/_ui/*.test.tsx` (Vitest + Testing Library) —
  rendering each component in its primary state, its
  loading/disabled state (where applicable), and its empty state
  (where applicable). Snapshot tests for the static
  presentational components (`Card`, `Badge`, `EmptyState`,
  `Skeleton`, `Breadcrumb`). Coverage gate per slice: ≥ 80% on
  `app/_ui/`.
- **No new dependency.** Every primitive is hand-built on top of
  React 19, Tailwind v4, and the project's existing class table.

### Slice 2 — `accounts-ui` (PR #2)

- **Three pages replaced** at `app/accounts/{page.tsx,
[id]/page.tsx, new/page.tsx}`. Each keeps the smoke page's
  auth gate, data fetch, and route — only the render is swapped
  to the design-system primitives.
- **`AccountsListTable`** replaced at
  `app/accounts/accounts-list-table.tsx` — uses `Table` /
  `TableHeader` / `TableBody` / `TableRow` / `TableCell`
  primitives. New columns: `Last activity` (computed from the
  most-recent transaction per account; fetched via a new
  `GET /api/accounts?include=lastActivity` query flag — see
  BR-UI-1 below), `Archived` badge for archived accounts (the
  smoke page filters them out; the production UI surfaces them
  behind an `Archived` toggle).
- **`AccountDetail`** replaced at
  `app/accounts/[id]/account-detail.tsx` — uses `Card` /
  `CardHeader` / `CardBody` / `CardFooter` plus the existing
  `BalanceWidget` (no logic change to the widget; just a new
  visual wrapper). The `<dl>` layout is replaced by a stacked
  `Card` with `CardHeader` (account name + currency badge +
  archived badge) and `CardBody` (key-value rows).
- **`CreateAccountForm`** replaced at
  `app/accounts/new/create-account-form.tsx` — uses `FormField`
  - `Input` + `Select` + `FieldError` + `Button`. Inline
    validation errors are rendered next to the offending field.
    Loading state on the submit button (`Spinner` icon +
    `disabled`). The form's submit logic is unchanged
    (`createAccountServerAction`).
- **Tests** at `app/accounts/**.test.tsx` — extend the existing
  `create-account-form.test.tsx` with the new render; new
  `accounts-list-table.test.tsx` for the table component (sort,
  pagination, empty state, archived toggle); new
  `account-detail.test.tsx` for the detail render. Coverage
  gate: ≥ 80% on `app/accounts/`.
- **Accessibility**: every interactive element has a visible
  focus ring (`focus-visible:ring-2`), every form field has a
  paired `<label>`, every table has a `<caption>` and
  `scope="col"` headers. axe-core run is part of the verify
  gate.

### Slice 3 — `transactions-ui` (PR #3)

- **Three pages replaced** at
  `app/transactions/{page.tsx, [id]/page.tsx, new/page.tsx}`.
  Same pattern as accounts: auth gate + data fetch stay; render
  is swapped.
- **`TransactionsListTable`** replaced at
  `app/_components/transactions-list-table.tsx` — uses the
  `Table` primitive. New columns: `Direction` (badge colored by
  direction — `INCOME` green, `EXPENSE` red, mirroring the
  existing Spanish `Badge` style), `Account` (account name,
  fetched from the join or from a new `include=accountName`
  query flag), `Date`, `Native amount`, `Converted amount`,
  `Rate as of` (relative time, e.g. "2 hours ago"), `Memo`,
  `Category`. Sort by `Date` descending by default; click-to-
  sort on `Date`, `Native amount`, `Converted amount`. Cursor
  pagination via the `Pagination` primitive (the smoke page
  renders a static footer; the production UI renders clickable
  page controls).
- **`TransactionDetail`** replaced at
  `app/transactions/[id]/transaction-detail-forms.tsx` —
  `Card` layout with the row's fields grouped (Identification,
  Amount, FX snapshot, Audit). The edit form uses `FormField`
  - `Input` + `Select`; the delete button uses a confirm
    dialog (`Dialog` primitive) instead of the smoke page's
    browser `confirm()`.
- **`CreateTransactionForm`** replaced at
  `app/transactions/new/create-transaction-form.tsx` — uses
  `FormField` + `Input` + `Select` + `Textarea` + `FieldError`
  - `Button`. The `<select name="accountId">` is now a
    searchable combobox (the `Combobox` primitive — single
    selection from the live accounts list). Inline validation
    shows the first error message from the API response next to
    the offending field, with `aria-describedby` linking the
    field to the error.
- **Tests** at `app/transactions/**.test.tsx` + new
  `transactions-list-table.test.tsx` (sort, pagination, filter
  by account, empty state) + new
  `transaction-detail-forms.test.tsx` (edit submit, delete
  confirm, FX snapshot render). Coverage gate: ≥ 80% on
  `app/transactions/`.

### Slice 4 — `dashboard-ui-refactor` (PR #4)

- **`app/dashboard/page.tsx`** replaced — the page is the same
  Server Component pattern (auth gate + parallel `Promise.all`
  to the reports endpoints), but the render uses the
  `PageHeader` + `Card` + `EmptyState` primitives. The three
  cards move from a CSS-grid `lg:grid-cols-3` to a stacked
  layout on small viewports and a 1+2 grid on large viewports
  (the summary card spans the full width; the breakdown + flow
  cards share the second row).
- **New `AccountPicker`** at
  `app/_components/dashboard-account-picker.tsx` — a Client
  Component that triggers a navigation to
  `?accountId=<id>` on the dashboard URL. The flow card now
  fetches `/api/reports/accounts/:id/flow` when an
  `?accountId=` query parameter is present (the smoke page
  renders the empty state every visit; the production UI
  deep-links to the per-account flow).
- **Month switcher** at
  `app/_components/dashboard-month-switcher.tsx` — a Client
  Component that renders `<Link>`s for the previous / current
  / next month. The page reads `?month=YYYY-MM` from the
  search params (default: current UTC month).
- **`MonthlySummaryCard`**, **`CategoryBreakdownCard`**,
  **`AccountFlowCard`** refactored — render is swapped to
  `Card` + `Table` + `Badge` + `EmptyState` primitives. No
  data-shape change. The existing tests
  (`dashboard-*.test.tsx`) are extended.
- **Coverage gate**: ≥ 80% on `app/dashboard/` and
  `app/_components/`.

### Slice 5 — `integration-tests` (PR #5)

- **axe-core a11y suite** at `tests/a11y/` — Vitest +
  `@axe-core/playwright` (or `vitest-axe` if a Playwright
  runner is added later). Every page is rendered with
  authenticated seed data; the assertion is
  `expect(await axe(container)).toHaveNoViolations()`. The
  verify gate fails on any violation with severity
  `critical` or `serious`; `moderate` and `minor` are
  warnings logged but not blocking.
- **Visual snapshot suite** at `tests/visual/` — for every
  presentational component (`Card`, `Badge`, `EmptyState`,
  `Skeleton`, `Breadcrumb`, `Pagination`, `Dialog`,
  `Combobox`, `Button`, `Input`, `Select`, `Textarea`,
  `FieldError`) in its empty state, its loading state, its
  error state (where applicable), and its populated state.
  Snapshot files live in `tests/visual/__snapshots__/`.
- **E2E happy paths** at `tests/e2e/` — three Playwright
  specs (added if a Playwright runner is in place; otherwise
  the smoke remains Vitest + Testing Library):
  1. Sign in → record a USD expense against an ARS casa →
     verify the dashboard reflects the converted amount.
  2. Sign in → archive an account → verify it disappears
     from the active list and appears behind the `Archived`
     toggle.
  3. Sign in → navigate to `/accounts/X` → verify the
     balance widget renders the casa-converted amount.
- **Manual QA checklist** at `docs/qa/transactions-ui.md` +
  Spanish mirror at `Documents-es/docs/qa/transactions-ui.md`:
  - Keyboard navigation across every page (Tab order, focus
    visible, Enter/Space activation, Escape to close
    dialogs).
  - Screen reader run-through on every page (VoiceOver on
    macOS, NVDA on Windows) — landmarks, headings, table
    headers, form labels, error announcements.
  - Dark mode is **out of scope for v1** — the checklist
    records this as a follow-up.

### Slice 6 — `docs-and-perf` (PR #6)

- **`openspec/specs/ui/spec.md`** canonical spec created by
  `sdd-archive` from the delta spec.
- **`openspec/specs/transactions/spec.md`** delta — REQ-TX-15
  is replaced (not extended) by the production UI
  requirements; the delta carries the BR-UI-N additions.
- **`docs/architecture/ui.md`** — a one-page design-system
  reference (token table + component inventory). Spanish mirror
  at `Documents-es/docs/architecture/ui.md`.
- **`CHANGELOG.md`** updated under `## [Unreleased]` with the
  Added section listing the new design-system primitives and
  the production UI surfaces.
- **Lighthouse / Perf budget verification** — manual run on
  the three primary pages (`/`, `/dashboard`,
  `/transactions`) under simulated 4G + Moto G4 profile. The
  assertion is p95 page load < 2s (root `AGENTS.md` §10.5).
  The verification command is `pnpm build && pnpm start` +
  Lighthouse CLI; the output is pasted into
  `docs/perf/transactions-ui.md`.

## Out of scope (this change)

- **Dark mode.** The token table is dark-mode-ready (it uses
  CSS custom properties), but the v1 theme is light only. A
  follow-up `ui-dark-mode` change adds the dark token values
  and the toggle.
- **i18n (English / Spanish).** v1 ships with the copy the
  smoke pages already use (mixed Spanish + English; the
  dashboard copy is Spanish per the `reports` change). A
  follow-up `ui-i18n` change introduces a message catalog.
- **Mobile native.** Web only. The layout is responsive down
  to 375px (the smallest target in the Tailwind v4 spec) but
  no React Native / Expo shell is added.
- **Charts library.** The dashboard renders `Table` + CSS-bar
  progress bars. No `recharts` / `chartjs` / `d3`. The
  charting library decision is deferred to a follow-up
  `ui-charts` change once the UX direction is locked.
- **Accessibility audit beyond WCAG 2.2 AA.** AA is the
  floor (axe-core `critical` + `serious` are zero). AAA
  audits (contrast ratios on text-on-accent, full keyboard
  parity on every drag interaction) are deferred.
- **Design review / stakeholder sign-off.** The visual
  direction is approved at the proposal phase; pixel-perfect
  design review is the user's responsibility during the
  verify gate.
- **Beta testing.** No TestFlight / internal beta. v1 is
  shipped on `develop` and merges to `main` per the standard
  release flow (§5.5 root `AGENTS.md`).
- **`snapshots` capability.** The net-worth-over-time UI is
  not in scope. The `snapshots` slot in
  `openspec/config.yaml:14` is forward-declared but stays
  empty until a future change introduces both the data model
  and the surface.

## Non-goals

- **Not a new data layer.** Every page still goes through the
  existing Hono API (`serverHonoRequest`). No new repository
  ports. No new Prisma models. No new migrations.
- **Not a new state-management library.** No Zustand / Jotai
  / Redux. Server Components own the read path; Client
  Components own local form state. The same pattern as the
  smoke pages.
- **Not a new charting library.** See "Charts library" above.
- **Not a new HTTP framework.** No tRPC / GraphQL. The Hono
  catch-all at `app/api/[...path]/route.ts:7-25` is reused
  unchanged.
- **Not a new auth model.** The existing `auth()` server-side
  helper (`src/modules/auth/nextauth`) gates every page.
  Cross-user isolation (`BR-TX-4`, `BR-ACC-12`) is enforced
  at the Hono layer, not at the UI layer.
- **Not a re-architecture of the smoke pages' data flow.**
  The pages keep their `redirect()` on 401 and their
  `throw new Error(message)` on 5xx. The production UI adds
  user-facing error boundaries (`app/error.tsx`,
  `app/dashboard/error.tsx`, etc.) but the page-level data
  flow is unchanged.
- **Not a redesign of the `reports` API.** The three reports
  endpoints (`/api/reports/monthly`, `/api/reports/breakdown`,
  `/api/reports/accounts/:id/flow`) are consumed unchanged.
  The new `?accountId=` dashboard query parameter is a UI-side
  concern (a `searchParams` read), not a new API surface.

## Users and situations

| User                                    | Situation                                                                                                                                                                | Touchpoint                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Authenticated user                      | Visits `/transactions` to review recent activity. Sees a sortable, paginated table with direction badges and inline filters (account, date range, category).             | `app/transactions/page.tsx`                   |
| Authenticated user                      | Clicks "New transaction" → fills the form → submits. Sees inline validation errors; on success, lands on the new transaction's detail page.                              | `app/transactions/new/page.tsx`               |
| Authenticated user                      | Opens a transaction's detail page to audit the FX snapshot. Sees the rate-as-of, the casa, and the converted amount in a single card. Edits memo; the FX snapshot stays. | `app/transactions/[id]/page.tsx`              |
| Authenticated user                      | Visits `/dashboard` to see this month's totals. Picks an account from the picker → sees the per-account flow. Switches the month → sees the previous month's data.       | `app/dashboard/page.tsx`                      |
| Authenticated user                      | Visits `/accounts` to see the live accounts. Toggles the `Archived` filter → sees the archived accounts in a separate tab.                                               | `app/accounts/page.tsx`                       |
| New user (no accounts, no transactions) | Visits `/dashboard`. Sees an empty-state illustration + a CTA to `/transactions/new`. No crash. No broken footer.                                                        | `app/dashboard/page.tsx` (empty-state branch) |
| Keyboard-only user                      | Tabs through the list page. Sees focus rings on every interactive element. Activates sort headers with `Enter`.                                                          | Every page (a11y floor)                       |
| Screen-reader user                      | Navigates `/transactions/new`. Hears the field labels, the inline validation errors (`aria-describedby`), and the success toast.                                         | Every page (a11y floor)                       |

## Business rules

The change carries the existing `auth`, `accounts`, `fx`,
`reports`, and `transactions` BRs verbatim and adds one new BR
family (`BR-UI-N`) for the design-system primitives and the
production UI surfaces. The spec phase writes the full
Scenarios.

1. **BR-TX-4 (carried).** Every cross-module reference scopes to
   `userId`. The production UI does not bypass this — the
   Hono routes already enforce it; the UI just renders.
2. **BR-TX-15 (carried, REPLACED).** The original REQ-TX-15
   ("three smoke pages") is replaced by the production UI
   requirements. The spec phase writes the delta that
   supersedes the original wording.
3. **BR-ACC-12 to BR-ACC-19 (carried).** The accounts page
   follows the same `archivedAt=null` filter at the API;
   the production UI adds a `Show archived` toggle that
   lifts the filter on the client.
4. **BR-RPT-7 (carried).** The dashboard's auth gate stays
   at the Server Component. The new `?accountId=` and
   `?month=` query parameters are pure UI-state; the Hono
   routes' userId scoping is the access control.
5. **BR-UI-1 (NEW).** The accounts list endpoint MAY accept an
   `include=lastActivity` query flag; when present, the
   response includes a `lastActivityAt` field per row (the
   most recent transaction's `transactionDate`). The UI uses
   this to render the `Last activity` column. The endpoint
   WITHOUT the flag is unchanged.
6. **BR-UI-2 (NEW).** The transactions list endpoint MAY
   accept an `include=accountName` query flag; when present,
   the response includes `accountName` per row. Same
   backward-compat rule as BR-UI-1.
7. **BR-UI-3 (NEW).** Every interactive primitive has a
   visible focus indicator. `Button`, `Link`, `Input`,
   `Select`, `Combobox`, `Checkbox`, `RadioGroup`, `Table`
   row actions, and `Pagination` controls render
   `focus-visible:ring-2` (or equivalent Tailwind v4 token).
8. **BR-UI-4 (NEW).** Every form field has a paired `<label>`
   (or `aria-label` for icon-only buttons). The
   `<label htmlFor="...">` link is enforced by a test.
9. **BR-UI-5 (NEW).** Form errors are surfaced inline. The
   first error message from the API response is rendered
   next to the offending field with `aria-describedby`
   linking the field to the error. The form does not rely
   on a top-of-form alert alone.
10. **BR-UI-6 (NEW).** Submit buttons render a loading state
    (`Spinner` + `disabled` + `aria-busy="true"`) while the
    Server Action is in flight. Double-clicks are debounced.
11. **BR-UI-7 (NEW).** Tables have `<caption>` (visible or
    `sr-only`) and `<th scope="col">` headers. Sortable
    columns render `aria-sort` reflecting the current sort.
12. **BR-UI-8 (NEW).** The production UI ships a single
    light theme. Dark-mode tokens are declared but unused.
    A follow-up change activates them.
13. **BR-UI-9 (NEW).** The token table is documented in
    `docs/architecture/ui.md`. Every primitive's intent,
    props, and a11y contract are documented. New components
    added without docs fail the verify gate.

## Affected areas

| Area                                                                                                | Impact          | Description                                                                                             |
| --------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `app/_ui/`                                                                                          | New             | Design-system primitives (tokens, base components, layout shell). Single source of UI truth.            |
| `app/_ui/tokens.css`                                                                                | New             | Tailwind v4 CSS-first token declarations (colors, spacing, radius, elevation, typography).              |
| `app/accounts/page.tsx`, `[id]/page.tsx`, `new/page.tsx`                                            | Modified        | Smoke render replaced by production render. Auth gate + data fetch unchanged.                           |
| `app/accounts/accounts-list-table.tsx`                                                              | Modified        | Production table component (sort, pagination, archived toggle, last-activity column).                   |
| `app/accounts/[id]/account-detail.tsx`                                                              | Modified        | Production detail render (Card layout). No data change.                                                 |
| `app/accounts/new/create-account-form.tsx`                                                          | Modified        | Production form (FormField, inline validation, loading state). Submit logic unchanged.                  |
| `app/transactions/page.tsx`, `[id]/page.tsx`, `new/page.tsx`                                        | Modified        | Same swap as accounts.                                                                                  |
| `app/transactions/[id]/transaction-detail-forms.tsx`                                                | Modified        | Production edit + delete forms (Card layout, Dialog-based confirm).                                     |
| `app/transactions/new/create-transaction-form.tsx`                                                  | Modified        | Production form with searchable Combobox for account selection.                                         |
| `app/_components/transactions-list-table.tsx`                                                       | Modified        | Production table component.                                                                             |
| `app/dashboard/page.tsx`                                                                            | Modified        | Production render with `?accountId=` and `?month=` search params. Auth gate + parallel fetch unchanged. |
| `app/_components/dashboard-account-picker.tsx`, `dashboard-month-switcher.tsx`                      | New             | Client Components for dashboard query-param state.                                                      |
| `app/_components/dashboard-monthly-summary (or -category-breakdown, -account-flow).tsx`             | Modified        | Render swap to Card + Table + Badge primitives. No data-shape change.                                   |
| `app/error.tsx`, `app/dashboard/error.tsx`, etc.                                                    | New             | User-facing error boundaries per route segment. Replaces the default Next.js error page.                |
| `openspec/specs/ui/spec.md`                                                                         | New (canonical) | Created by `sdd-archive` from the delta spec. Reserved in `openspec/config.yaml:15`.                    |
| `openspec/specs/transactions/spec.md`                                                               | Modified        | REQ-TX-15 is REPLACED (not extended) by the production UI requirements.                                 |
| `openspec/changes/transactions-ui/{specs,design,tasks,apply-progress,verify-report,sync-report}.md` | New (per phase) | Each SDD phase writes its artifact in the change folder.                                                |
| `Documents-es/openspec/changes/transactions-ui/proposal.md`                                         | New             | Spanish mirror of this file. Same commit per root `AGENTS.md` §13.3.                                    |
| `docs/architecture/ui.md`                                                                           | New             | Token table + component inventory.                                                                      |
| `docs/qa/transactions-ui.md`                                                                        | New             | Manual QA checklist (keyboard, screen reader, follow-ups).                                              |
| `docs/perf/transactions-ui.md`                                                                      | New             | Lighthouse + perf-budget verification output.                                                           |
| `CHANGELOG.md`                                                                                      | Modified        | `## [Unreleased]` → Added section listing the primitives + production surfaces.                         |
| `package.json`                                                                                      | None            | No new dependencies (BR-UI constraint).                                                                 |
| `pnpm-lock.yaml`                                                                                    | None            | No new dependencies → lockfile unchanged (root `AGENTS.md` §5.3).                                       |
| `prisma/schema.prisma`                                                                              | None            | No new models.                                                                                          |

## Acceptance (evidence the reviewer will see)

1. `pnpm test` runs the new UI suite and exits 0 with **≥ 80%
   coverage on `app/_ui/`, `app/accounts/`,
   `app/transactions/`, and `app/dashboard/`** (the
   `test:coverage:enforced` gate).
2. `pnpm build` succeeds with zero TypeScript errors. The
   `strict: true` compiler flag is unchanged.
3. `pnpm lint` passes with zero warnings on the new code.
4. `pnpm dev` → sign in → visit `/transactions` with 3 ARS +
   2 USD transactions across 2 accounts. The page renders a
   sortable, paginated table. Click on the `Date` header → rows
   re-sort. Click `Next page` → the cursor advances.
5. Visit `/transactions/new` with no accounts. The Combobox
   renders an `No accounts available` empty state. Create an
   account first → return → the Combobox is populated.
6. Submit the create form with `amountMinor = 0`. The inline
   error appears next to the amount field with the API's
   `INVALID_AMOUNT` message. The submit button is disabled.
7. Visit `/transactions/X` for a USD transaction against an
   ARS casa. The `Rate as of` card row renders the snapshot
   timestamp as plain text. The FX snapshot is unchanged when
   the user edits only the memo.
8. Visit `/dashboard` with no transactions. The empty-state
   illustration + `Record your first transaction` CTA render.
   Click the CTA → `/transactions/new` loads.
9. Visit `/dashboard` with transactions. Pick an account from
   the `AccountPicker` → the flow card shows the
   per-account daily flow. Switch the month → the summary +
   breakdown update.
10. Visit `/accounts` → toggle `Show archived` → archived
    accounts appear with a badge. Toggle off → only live
    accounts render.
11. **Keyboard nav**: Tab through `/transactions` end-to-end.
    Every interactive element is reachable; focus is visible
    on every element; `Enter` activates the sort headers;
    `Escape` closes the delete confirm dialog.
12. **Screen reader run-through** (VoiceOver on macOS): every
    page announces the page title, the headings, the form
    field labels, and the inline error messages.
13. **axe-core run** on every page with seeded data: zero
    `critical` violations; zero `serious` violations. The
    integration test asserts this and fails the build on any
    violation.
14. **Snapshot tests** pass for every presentational
    primitive in its primary state. Snapshot drift requires
    an explicit `--update` flag.
15. **p95 page load < 2s** on `/`, `/dashboard`, and
    `/transactions` under simulated 4G + Moto G4
    (Lighthouse CLI). The output is pasted into
    `docs/perf/transactions-ui.md`.
16. **Manual QA checklist** at `docs/qa/transactions-ui.md` is
    completed and signed off by the user during the verify
    gate.
17. `openspec/specs/ui/spec.md` exists with at least 5
    Requirements and one Scenario each after `sdd-archive`
    runs. `openspec/specs/transactions/spec.md` carries the
    REQ-TX-15 delta.
18. `./Documents-es/openspec/changes/transactions-ui/proposal.md`
    mirror exists with identical structure. No
    Chinese-character debris per root `AGENTS.md` §13.3
    mirror check.
19. No `pnpm-lock.yaml` drift after the change merges (root
    `AGENTS.md` §5.3). The change ships zero new top-level
    dependencies.
20. **No `Co-authored-by` trailer** in any commit (root
    `AGENTS.md` §4.5). **Author header** on every new doc is
    `Sebastián Illa` (no AI forms, per `openspec/AGENTS.md`).

## Risks

| Risk                                                                                | Likelihood | Mitigation                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The token table fragments across the six slices and breaks the design-system claim. | Medium     | Slice 1 (`ui-primitives`) is the only slice that touches `app/_ui/`. Slices 2-5 import from it; they do not extend it. The verify gate asserts that every primitive used by the production UI is declared in `app/_ui/`.                                                                                                                                                                 |
| Sort + cursor pagination regresses the existing API contract.                       | Low        | The sort is a pure client-side concern over the existing `GET /api/transactions` page; the API contract is unchanged. The cursor is the existing `nextCursor` field. The verify gate re-runs the smoke flow against the new UI.                                                                                                                                                          |
| The Combobox primitive picks a library dependency (`downshift`, etc.).              | Low        | The primitive is hand-built on top of the project's `<Select>` + a `<input>` + the existing Tailwind v4 tokens. No new dependency. If the hand-built approach proves limiting, a follow-up change introduces a vetted combobox primitive.                                                                                                                                                |
| Axe-core flags a violation the smoke page did not.                                  | Medium     | The verify gate is set to `critical` + `serious` zero. `moderate` + `minor` are logged but not blocking; the user triages them. A `docs/qa/transactions-ui.md` checklist captures the residual items as a backlog.                                                                                                                                                                       |
| p95 < 2s is not met because the dashboard fetches three endpoints in parallel.      | Medium     | The three fetches are already parallelized (existing `Promise.all`). The page is a Server Component; the parallel fetch is on the server, not the client. The verify gate runs Lighthouse against the production build; if the budget fails, the orchestrator splits the dashboard's three calls into two chunks (summary + breakdown; flow on demand) without breaking the UI contract. |
| The Spanish mirror drifts from the English original.                                | Medium     | Apply root `AGENTS.md` §13.3 atomicity; the `reviewer` checks both files in the same commit. The mirror is created in this phase; the spec/design/tasks/apply/verify/sync phases carry their own mirrors.                                                                                                                                                                                |
| Strict TDD's RED step is skipped for a primitive, failing the reviewer.             | Medium     | `sdd-tasks` owns task structure; `sdd-apply` enforces RED → GREEN → REFACTOR per task per `openspec/config.yaml:27-30`. The `ui` capability spec codifies BR-UI-3 to BR-UI-9; the tests are the executable proof.                                                                                                                                                                        |
| The change is too large for a single PR (400-line budget).                          | High       | The change is **force-chained** per the orchestrator's `auto-forecast` cache. Each slice is a self-contained PR with its own verify gate. The six-slice forecast below keeps each PR under the budget.                                                                                                                                                                                   |
| Dark mode is shipped as a stealth addition.                                         | Low        | The token table is dark-ready but the v1 theme is light only (BR-UI-8). A code review that spots dark-mode CSS rules fails the verify gate.                                                                                                                                                                                                                                              |
| An AI form leaks into a doc header.                                                 | Low        | `openspec/AGENTS.md` forbids AI attribution; the `reviewer` checks every new doc. The change is small enough that the check is a single grep.                                                                                                                                                                                                                                            |

## Capabilities

> This section is the CONTRACT between this proposal and `sdd-spec`.
> The next phase reads this to know exactly which spec files to
> create or update.

### New capabilities

- `ui`: owns the design-system primitives (token table, base
  components, layout shell), the production UI surfaces for
  `/transactions`, `/transactions/[id]`, `/transactions/new`,
  `/dashboard`, `/accounts`, `/accounts/[id]`, `/accounts/new`,
  and the manual QA + perf budget artifacts. The capability
  lives at `app/_ui/` (primitives) and the existing
  `app/{transactions,accounts,dashboard}/` folders
  (consumption sites). The canonical spec is
  `openspec/specs/ui/spec.md`.

### Modified capabilities

- `transactions`: REQ-TX-15 ("three smoke pages mirror the
  accounts slice") is **replaced** by the production UI
  requirements (REQ-UI-1 to REQ-UI-N, codified in the `ui`
  spec). The delta lives at
  `openspec/changes/transactions-ui/specs/transactions/spec.md`;
  `sdd-archive` lifts the new wording into the canonical
  `openspec/specs/transactions/spec.md` and removes the
  REQ-TX-15 smoke wording. No BR change; no behavior change
  in the Hono routes.
- `accounts`: no spec delta. The production UI consumes the
  existing `/api/accounts` endpoints unchanged. BR-ACC-14 to
  BR-ACC-19 (smoke slice) stay; the production UI is a render
  swap.
- `reports`: no spec delta. The dashboard's three reports
  endpoints are consumed unchanged. The new `?accountId=` and
  `?month=` query parameters are UI state, not API surface.
- `auth`, `fx`: no change.

## Alternatives considered

1. **Adopt shadcn/ui or NextUI.** Rejected for v1. The project
   rule (root `AGENTS.md` §10.5 + orchestrator constraints)
   forbids new top-level dependencies for the UI. The
   primitives are hand-built on top of the existing Tailwind v4
   tokens. A future change re-evaluates the trade-off once the
   design-system debt is paid off.
2. **Adopt Radix UI primitives (unstyled).** Rejected for v1.
   Same dependency rule. The accessibility floor (focus rings,
   `aria-*` attributes) is achievable with hand-built
   primitives + axe-core tests; Radix's value is more visible
   on complex widgets (Combobox, Dialog) where the v1 surface
   is minimal. If a future `ui-complex-widgets` change adds a
   Combobox / DatePicker / etc., Radix is the first candidate.
3. **One PR with the entire UI rewrite.** Rejected. The 400-line
   budget (root `AGENTS.md` §10.5 + `openspec/config.yaml:21`)
   is the floor; one PR would exceed it by 3-5x. The
   force-chained approach keeps each PR under the budget and
   lets the verify gate catch regressions early.
4. **Production UI in `app/v2/` as a parallel surface.** Rejected.
   A parallel surface duplicates the auth gate, the data fetch,
   and the route, doubling the maintenance cost. The smoke
   pages are tagged "not production" precisely so the
   production UI replaces them in place.
5. **i18n + dark mode in this change.** Rejected. The
   orchestrator's scope lock keeps the v1 to web + light mode
   - mixed EN/ES copy (the existing convention). Adding
     i18n + dark mode inflates the slice count and the per-PR
     budget. The two are follow-up changes that consume the
     token table and the primitives unchanged.
6. **Charts library in this change.** Rejected. Same rationale
   as `reports` change §"Alternatives considered" item 4.
   The dashboard renders `Table` + CSS-bar progress bars in v1.

## Forecast (force-chained, 400-line budget)

The orchestrator pre-cached `chainedPrStrategy: auto-forecast`
and `reviewBudgetLines: 400`. Per the §E review-workload guard,
every slice MUST be a self-contained PR with clear start,
finish, verification, and rollback. Forecast lines are **changed
lines (additions + deletions)** per slice.

| PR        | Slice                   | LoC low  | LoC high | Verification gate                                                                                                                                     |
| --------- | ----------------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1        | `ui-primitives`         | 380      | 480      | `pnpm test app/_ui` exits 0; coverage ≥ 80% on `app/_ui/`; snapshot tests stable; no new dep.                                                         |
| #2        | `accounts-ui`           | 240      | 360      | `pnpm test app/accounts` exits 0; coverage ≥ 80% on `app/accounts/`; axe-core zero critical/serious; keyboard + screen-reader manual pass.            |
| #3        | `transactions-ui`       | 320      | 460      | `pnpm test app/transactions` exits 0; coverage ≥ 80% on `app/transactions/`; axe-core zero critical/serious; FX snapshot unchanged on memo-only edit. |
| #4        | `dashboard-ui-refactor` | 220      | 340      | `pnpm test app/dashboard app/_components` exits 0; coverage ≥ 80%; empty-state + account-picker + month-switcher verified.                            |
| #5        | `integration-tests`     | 200      | 320      | axe-core suite green; visual snapshots stable; e2e happy paths green.                                                                                 |
| #6        | `docs-and-perf`         | 160      | 260      | `docs/architecture/ui.md` + `docs/qa/transactions-ui.md` + `docs/perf/transactions-ui.md` exist; Lighthouse p95 < 2s on the three primary pages.      |
| **Total** | —                       | **1520** | **2220** | All six PRs merged; `pnpm test` green; production UI ships on `develop`.                                                                              |

- Decision needed before apply: **No** (scope locked at
  pre-propose; the four questions + the orchestrator's preflight
  values are the inputs).
- Chained PRs recommended: **Yes** (force-chained per
  orchestrator cache; every slice is over the 400-line budget
  if delivered as a single PR; per-slice budgets are below the
  limit).
- 400-line budget risk: **Low** per slice; **High** if
  collapsed into one PR.

## Open questions

These four questions will be grilled at the pre-spec session.
The defaults below are the proposed v1 shape; the spec phase
locks the final wording.

1. **`include=lastActivity` and `include=accountName` query
   flags (BR-UI-1, BR-UI-2).** Default: yes, additive, no
   backward-compat break. The flag is on the existing GET
   endpoints; the response shape gains two optional fields.
   The UI is the only consumer. Lock the flag in the spec;
   the spec phase writes the requirement + scenario.
2. **Combobox primitive vs. plain `<select>`.** Default:
   hand-built Combobox on `<select>` + `<input>`. No new
   dependency. The Combobox is searchable (the user types
   the account name); the underlying `<select>` is the
   semantic primitive for screen readers. Lock the design
   in the spec.
3. **Visual direction (light theme only).** Default: light
   only. Dark mode is a follow-up. The token table is
   dark-ready (CSS custom properties) but the v1 theme is
   a single light set. Lock the BR-UI-8 wording in the
   spec.
4. **Manual QA owner.** Default: the user runs the
   `docs/qa/transactions-ui.md` checklist during the verify
   gate; the agent does not auto-pass it. The verify gate
   fails until the checklist is signed off. Lock the
   ownership in the spec.

## Dependencies

- **Inbound**: `transactions` (shipped) provides
  `TransactionDTO`, the six Hono endpoints, the
  `TransactionRecorded` event (unused by the UI), and the
  in-memory fixture pattern (for the integration tests).
- **Inbound**: `accounts` (shipped) provides
  `FinancialAccountWire`, the three Hono endpoints, and the
  smoke-UI precedent (BR-ACC-14 to BR-ACC-19).
- **Inbound**: `reports` (shipped) provides
  `MonthlySummaryDTO`, `CategoryBreakdownDTO`,
  `AccountFlowDTO`, the three Hono endpoints, and the
  dashboard-presentational components (the production UI
  replaces the render layer; the data shape is frozen).
- **Inbound**: `auth-foundation` (shipped) provides the
  session gate (`auth()`) and the `AuthUser` invariant
  used by every Server Component.
- **Inbound**: `fx-cache` (shipped) provides the
  `FxRateProvider` consumed at write time (the UI does not
  call FX directly; it renders the snapshotted columns).
- **Outbound**: `snapshots` (future) reuses the design-system
  primitives and the dashboard layout shell for the
  net-worth-over-time surface.
- **External**: none. No new external service in v1.
- **No co-PRs**: `transactions-ui` does not block any
  in-flight change.

## Next step

`/sdd-spec transactions-ui` — write the delta spec at
`openspec/changes/transactions-ui/specs/ui/spec.md` (the new
`ui` capability) and at
`openspec/changes/transactions-ui/specs/transactions/spec.md`
(the REQ-TX-15 replacement delta). Lift the first into the
canonical `openspec/specs/ui/spec.md` per the SDD archive
flow. The spec phase will lock the four open questions and
write the Requirements + Scenarios for BR-UI-1 to BR-UI-9.
