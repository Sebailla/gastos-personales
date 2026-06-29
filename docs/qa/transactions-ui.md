# Manual QA checklist — `transactions-ui`

**Author**: Sebastián Illa
**Capability**: `ui`
**Source change**: `transactions-ui`
**Status**: implemented · **Sign-off**: pending (user-owned; see §7)
**Audience**: project owner running the manual QA pass before `sdd-verify`
**Stack**: v3 — Next.js 16 + Node 20 + React 19 + Hono catch-all + Auth.js v5 + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + Testing Library + pnpm + Tailwind v4

> Codifies REQ-UI-11 of `openspec/specs/ui/spec.md`. The checklist
> covers every production page (`/`, `/accounts`, `/accounts/:id`,
> `/accounts/new`, `/transactions`, `/transactions/:id`,
> `/transactions/new`, `/dashboard`) on keyboard navigation, screen
> reader behavior, and dark-mode scoping. Per the design §16.6 risk,
> the manual QA owner is **the user**, not the orchestrator; the
> verify gate fails until the user signs off the checklist at §7.
>
> The checklist is structured to be runnable in **30–45 minutes** on
> a single screen-reader pass per platform (VoiceOver on macOS; NVDA
> on Windows). The page-by-page structure lets the user re-run a
> single page after a UI change without re-doing the whole sweep.
>
> The Spanish mirror lives at
> `Documents-es/docs/qa/transactions-ui.md`.

---

## 1. Prerequisites

Before running the checklist, prepare:

- [ ] A seeded user account with **at least 3 accounts** (mix of
      currencies `ARS | USD | EUR` if multi-currency matters for the
      test) and **at least 10 transactions** across two months so
      the dashboard reports have meaningful data.
- [ ] A second seeded user account (the "cross-user" check at §6
      only requires you to know the other user's `userId` — you
      can read it from the URL of their detail pages after signing
      in as them).
- [ ] **macOS** with VoiceOver enabled (Cmd+F5) for §3 + §5.
- [ ] **Windows** with NVDA installed (the installer lives at
      <https://www.nvaccess.org/download/>) for §5 cross-platform
      pass.
- [ ] Browser: Chrome (current stable) for the initial sweep.
      Optional: Firefox or Safari for cross-browser spot-checks on
      `[ ]` items at §2.4.

> **Tip.** Run the keyboard pass (§3) first. It is the fastest and
> catches ~70% of regressions (focus traps, missing labels,
> keyboard activation). The screen-reader pass (§5) goes after the
> keyboard pass because the screen reader will surface anything
> the keyboard pass missed.

---

## 2. Page-by-page keyboard navigation

For every page below, the keyboard sweep MUST pass before the
screen-reader sweep runs.

### 2.1 `/` (root)

- [ ] Pressing **Tab** from a fresh load lands focus on the
      "Skip to content" link first; activating it moves focus to
      the main content (the Next.js App Router root layout ships
      this by convention).
- [ ] Tab order matches visual order (no `tabIndex` overrides).
- [ ] Every interactive element has a visible focus ring
      (`focus-visible:ring-2`); contrast ratio ≥ 3:1 against the
      background.

### 2.2 `/accounts` (list)

- [ ] Page header has one `<h1>` ("Cuentas"); description is the
      second focusable area when reached via Tab.
- [ ] The "+ Nueva cuenta" button is focusable and activates via
      **Enter** and **Space** (native `<button>` behavior; no
      custom key handler needed).
- [ ] The accounts `<table>` renders:
  - [ ] `<caption>` is present (visible or `sr-only`).
  - [ ] Every `<th>` has `scope="col"`.
  - [ ] Clicking a sortable column header (Name, Last activity)
        focuses a `<button>` inside the `<th>`; pressing
        **Enter** on the focused button triggers the sort.
  - [ ] After sorting, the focused column header's `aria-sort`
        flips between `ascending` / `descending` / `none`.
- [ ] The "Show archived" toggle is a `<Checkbox>` paired with
      a `<label>`; toggling it via **Space** reveals / hides
      archived rows.
- [ ] Empty state (delete all accounts temporarily if needed):
  - [ ] The page renders the `EmptyState` primitive with
        `role="status"`.
  - [ ] The CTA ("Crear primera cuenta") is the first focusable
        element when present.

### 2.3 `/accounts/:id` (detail)

- [ ] One `<h1>` for the page title (account name).
- [ ] CardHeader renders `<h2>` with the same title and a Badge
      for the account currency; the Badge is decorative (not
      focusable).
- [ ] CardBody renders key-value rows; each row is a `<dl>`
      visually (not strictly required for a11y, but the heading
      hierarchy is what matters).
- [ ] CardFooter "Edit" and "Archive" buttons activate via
      **Enter** and **Space**.
- [ ] After Archive (with confirmation): the page redirects to
      `/accounts` and the archived badge appears on the row.

### 2.4 `/accounts/new` (create)

- [ ] Page header `<h1>` is "Nueva cuenta"; description reads
      "Cargá los datos de la cuenta. El nombre es visible solo
      para vos."
- [ ] Tab order: Name → Currency → Casa → Submit. (Archived is
      hidden by default in v1 — there is no archived toggle on
      create.)
- [ ] Each field has a paired `<label htmlFor="<id>">`; pressing
      **Tab** from the label focuses the input.
- [ ] Submitting with an empty Name renders an inline error
      message under the Name field; the field has
      `aria-invalid="true"` and `aria-describedby` pointing at the
      error's `id`.
- [ ] The submit button transitions to a loading state on click:
      `disabled` + `aria-busy="true"` + `<Spinner>` icon visible.
      A second click while loading is **ignored** (debounced by
      React 19's `useActionState`).
- [ ] On 201, the page redirects to `/accounts` and the new row
      appears in the list.

### 2.5 `/transactions` (list)

- [ ] Same `Table` a11y contract as `/accounts` (§2.2) — caption,
      scope, sortable headers with `aria-sort` + inner `<button>`.
- [ ] The column "Native amount" / "Converted amount" pair renders
      both values when the transaction currency differs from the
      account's casa; for native=casa, only one column renders
      (the native amount).
- [ ] The pagination footer at the bottom is a `<nav
      aria-label="Pagination">` landmark. Tabbing lands on
      "Previous", then each page number, then "Next". The current
      page has `aria-current="page"` and is visually distinct.
- [ ] Empty state: the page renders the `EmptyState` with CTA
      "Crear primera transacción" linking to
      `/transactions/new`.

### 2.6 `/transactions/:id` (detail)

- [ ] One `<h1>` for the page title (e.g. "Transacción tx_…").
- [ ] CardHeader renders `<h2>` with the transaction id and a
      Badge for the direction (`INCOME` → success, `EXPENSE` →
      danger).
- [ ] The detail body renders the row in a key-value layout; the
      `fxAsOfSnapshot` renders as plain text "Rate as of: <ISO>"
      (REQ-TX-15 Scenario).
- [ ] The "Edit" + "Delete" actions live in CardFooter. Delete
      shows a `Dialog` confirmation:
  - [ ] The Dialog has `role="dialog"` + `aria-modal="true"` +
        `aria-labelledby` pointing at the Dialog's `<h2>`.
  - [ ] Focus moves to the first focusable element inside the
        Dialog (the Cancel button by convention).
  - [ ] **Escape** closes the Dialog and returns focus to the
        trigger.
  - [ ] **Tab** cycles focus inside the Dialog (focus trap);
        tabbing past the last element wraps to the first.
  - [ ] Backdrop click closes the Dialog.

### 2.7 `/transactions/new` (create)

- [ ] Same field-pairing contract as `/accounts/new` (§2.4).
- [ ] The `accountId` field uses the `Combobox` primitive (Client
      Component). On the search input:
  - [ ] Typing filters the visible options by `option.label`.
  - [ ] **Escape** clears the query (does NOT close the page).
  - [ ] **ArrowDown** / **ArrowUp** navigate the filtered options.
  - [ ] **Enter** selects the focused option; the visual search
        input clears and the page value updates.
- [ ] Submitting with `amountMinor = 0` returns an inline error
      from the API (`INVALID_AMOUNT`); the error is mapped to the
      amount field via the `errorEnvelope → fieldError` mapper.
- [ ] Submitting with `transactionDate > today` returns
      `FUTURE_DATE_NOT_ALLOWED`; the error maps to the date
      field.
- [ ] Submitting against an archived account returns
      `ACCOUNT_ARCHIVED`; the error renders inline next to the
      account picker.
- [ ] On 201, the page redirects to `/transactions`; the new row
      appears at the top of the list.

### 2.8 `/dashboard`

- [ ] Page header `<h1>` is "Resumen" (Spanish copy per
      `design.md` §12.1 mixed EN/ES convention).
- [ ] Three cards render side-by-side on `lg`, stacked on `sm`:
      Monthly summary, Category breakdown, Account flow.
- [ ] The account picker (Client Component) navigates to
      `?accountId=<id>` on selection. The picker is a `<select>`
      with `aria-label="Elegir cuenta"`; **Tab** focuses it and
      **Enter** / native change handler submits.
- [ ] The month switcher renders three `<Link>` controls (Previous
      / Current / Next); the current month has
      `aria-current="page"`.
- [ ] With `?accountId=<A>`, the Account flow card fetches
      `/api/reports/accounts/<A>/flow` and renders the daily
      flow. Without `?accountId`, the flow card renders an
      `EmptyState` ("Seleccioná una cuenta para ver su flujo").
- [ ] Empty state (zero transactions this month): all three cards
      render their `EmptyState` variant with sensible Spanish
      copy ("Sin movimientos en el mes", "Sin desglose por
      categoría", "Sin flujo para mostrar").

---

## 3. Keyboard navigation — cross-page

These checks verify the cross-page contract beyond the per-page
list above.

- [ ] Every interactive element across all pages is reachable via
      **Tab**. No element is hidden from the keyboard tab order
      (no `tabIndex={-1}` on interactive elements).
- [ ] **Shift+Tab** navigates backward in the same order.
- [ ] **Enter** activates `<button>` and `<Link>` controls
      natively.
- [ ] **Space** activates `<button>` and `<Checkbox>` controls
      natively.
- [ ] **Escape** closes any open `Dialog` and any open
      `Combobox` dropdown (the Combobox clears the query; the
      Dialog unmounts).
- [ ] **Home** / **End** jump to the first / last option inside
      the `Combobox` (native `<select>` behavior).
- [ ] On form submit with an error, focus moves to the first
      invalid field (or stays on the submit button if no field
      can receive focus).
- [ ] After a navigation, focus is reset to the top of the page
      (or to the page `<h1>` per Next.js App Router convention);
      no stray focus from a previous page remains.

---

## 4. Form error surfacing

Every form error MUST be rendered inline with `aria-describedby`.
Top-of-form alerts MAY exist as a secondary surface but MUST NOT
be the only error surface.

- [ ] Submitting any form with an empty required field renders
      the error message under that specific field (not at the
      top of the form).
- [ ] The field's `aria-invalid="true"` attribute is set when an
      error is present.
- [ ] The field's `aria-describedby` attribute points at the
      `FieldError` element's `id`.
- [ ] Screen readers announce the error on appearance (verified
      in §5).
- [ ] Top-of-form alert (if present) is rendered as a secondary
      surface, never as the only one.

---

## 5. Screen reader pass

### 5.1 VoiceOver (macOS)

- [ ] Enable VoiceOver (Cmd+F5). Use VO+Right / VO+Left to
      navigate.
- [ ] **Landmarks.** On every page, the rotor (VO+U) lists:
  - [ ] One `<header>` (the `PageHeader`).
  - [ ] One `<main>` (the `PageContainer`).
  - [ ] One or two `<nav>` (`BreadcrumbBar` + `Pagination` when
        present).
  - [ ] Zero stray landmarks (no orphan `<section>` without an
        accessible name).
- [ ] **Headings.** The rotor (VO+Cmd+H) lists headings in this
      order with no skipped levels:
  - [ ] One `<h1>` per page (the `PageHeader` title).
  - [ ] `<h2>` per CardHeader on the page.
  - [ ] `<h3>` only inside Cards (e.g. EmptyState title).
- [ ] **Tables.** On `/accounts` and `/transactions`, VO reads
      the caption (when not `sr-only`); on a cell, VO reads the
      column header.
- [ ] **Form labels.** Tab through each form field on
      `/accounts/new` and `/transactions/new`; VO reads the
      label paired with each field. Triggering a submit error
      causes VO to announce the error inline (the `aria-live`
      on `FieldError` fires).
- [ ] **Dialogs.** On the "Delete transaction" Dialog at
      `/transactions/:id`, VO announces "dialog" on focus, reads
      the title, and reads the description. **Escape** closes the
      Dialog and VO announces "dialog dismissed".
- [ ] **Loading state.** When submitting any form, VO announces
      the `aria-busy="true"` state on the submit button and the
      "Loading" text from the Spinner's `aria-label`.

### 5.2 NVDA (Windows)

- [ ] Start NVDA (Ctrl+Alt+N). Use the elements list (NVDA+F7)
      to verify the same landmark / heading / table contracts as
      §5.1.
- [ ] Forms: NVDA reads the label paired with each field on
      focus. Triggering a submit error causes NVDA to announce
      the error inline.
- [ ] Dialogs: NVDA announces "dialog" on focus + reads the
      title and description.

---

## 6. Cross-user isolation (manual)

Per BR-TX-4, cross-user access MUST return `404 NOT_FOUND` (no
information leakage). The UI surfaces this as a `redirect` for the
detail page; the list page just shows the caller's rows.

- [ ] Sign in as user A. Note a transaction `id = tx_abc123`.
- [ ] Sign out. Sign in as user B.
- [ ] Visit `/transactions/tx_abc123` as user B: the page
      redirects to `/transactions` (or shows a 404 / "No
      encontrado" message).
- [ ] On `/transactions`, the list shows ONLY user B's
      transactions. user A's rows are absent.

---

## 7. Dark-mode follow-up note (out of scope for v1)

Per REQ-UI-9 / BR-UI-8, v1 ships a **single light theme**. The
token table declares dark-mode values under `[data-theme='dark']`
in `app/_ui/tokens.css` for non-breaking forward compatibility,
but v1 MUST NOT render the dark tokens.

- [ ] **v1 does not include a theme toggle.** No user-visible
      control switches to dark mode.
- [ ] The token table at `app/_ui/tokens.css:74-89` is present
      and declared but unused.
- [ ] **No `dark:` Tailwind variants** appear anywhere in the
      production pages (a `git grep` check asserts this; the
      verify gate runs the same check).
- [ ] A follow-up `ui-dark-mode` change activates the dark
      tokens by setting `data-theme="dark"` on the document root.
      Out of scope for v1.

---

## 8. axe-core contract (informational)

The verify gate (slice 5) runs `vitest-axe` on every production
page. The test assertion is `expect(results).toHaveNoViolations()`
which fails on any `critical` or `serious` violation. The
manual QA pass is the **human complement** to the automated check;
it surfaces issues axe-core cannot detect (e.g. screen-reader
announcement ordering, focus management on custom Client
Components).

- [ ] The `tests/a11y/` suite passes locally (`pnpm test
      tests/a11y`) — informational; the orchestrator runs this in
      slice 5.
- [ ] `moderate` and `minor` violations are NOT blockers but
      SHOULD be logged as backlog items.

---

## 9. Sign-off

> The user (project owner) signs off the checklist once all the
> `[ ]` boxes above are `[x]`. The orchestrator does NOT sign off
> on the user's behalf; the verify gate fails until this section
> has a non-empty `Signed off by:` line and a date.

- **Signed off by**: _______________________________
- **Date**: _______________
- **Notes** (optional — call out anything the user wants the
  reviewer to know, e.g. "skipped §5.2 because I don't have a
  Windows machine today; ran §5.1 on macOS only"):