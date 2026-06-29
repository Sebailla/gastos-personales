# Design — `transactions-ui`

**Status**: draft · **Author**: Sebastián Illa · **Created**: 2026-06-27
**Change**: `transactions-ui`
**Proposal**: `openspec/changes/transactions-ui/proposal.md` (v1, 2026-06-27)
**Spec (delta, ui)**: `openspec/changes/transactions-ui/specs/ui/spec.md` — 11 Requirements (REQ-UI-1 to REQ-UI-11)
**Spec (delta, transactions)**: `openspec/changes/transactions-ui/specs/transactions/spec.md` — REQ-TX-15 REPLACED
**Capabilities affected**: `ui` (new; canonical spec lands at `openspec/specs/ui/spec.md` on `sdd-archive`), `transactions` (one delta — REQ-TX-15 replaced by reference to `ui/spec.md`), `accounts` (no behavior change; two additive query flags land in the existing GET endpoints — see BR-UI-1, BR-UI-2), `reports` (no behavior change; the dashboard's `?accountId=` and `?month=` query params are pure UI state per REQ-UI-3), `errors` (no new codes; the UI surface reuses the existing `ErrorEnvelope` from `src/shared/errors/app-error.ts`), `auth` (no change; every page keeps the `auth()` Server Component gate)
**Stack**: v3 — Next.js 16 + Node 20 + React 19 + Hono catch-all + Auth.js v5 (inherited from `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + Testing Library + pnpm + Tailwind v4
**Preflight**: interactive · `both` (Engram + OpenSpec files) · `auto-forecast` · 400-line review budget
**Strict TDD**: enabled per `openspec/config.yaml:27-30`; runner `pnpm test`; cycle RED → GREEN → TRIANGULATE → REFACTOR

> This document does NOT re-debate the proposal or the spec. It
> implements the spec's "what" with the "how" — the design-system
> token table, the primitive component API, the layout shell, the
> per-slice page renders, the two additive query flags, the
> composition-root changes (zero — the UI does not change the
> Hono composition), the error-envelope surfacing strategy, the
> per-slice TDD markers, and the three orchestrator corrections
> that the proposal / spec phase did not codify explicitly:
> (1) the v1 token table includes dark-mode CSS custom properties
> under `[data-theme="dark"]` but the production UI never renders
> them (BR-UI-8, REQ-UI-9 — verbatim from the spec);
> (2) the two additive query flags land in the existing GET
> endpoints under `src/modules/api/` without changing the routes,
> the auth gate, or the error envelope (REQ-UI-1, REQ-UI-2);
> (3) every Client Component is opted-in by an explicit
> `'use client'` directive at the top of the file — Server
> Components are the default, Client Components are the
> exception (BR-UI-6: the submit-button loading state is the
> only Client Component in the write path).

---

## 1. Summary

`transactions-ui` is the **production presentation surface** of
`gastos-personales`. It is the first change that ships a
design-system (token table + primitives + layout shell) on top
of the existing read and write seams (`auth`, `accounts`,
`transactions`, `reports`). The change ships as **six chained
PRs** at the orchestrator's pre-cached `auto-forecast` setting,
each a self-contained PR targeting `develop` and gating on the
prior slice merging.

The change introduces the **`ui` capability** at `app/_ui/`
(primitives + layout shell) and replaces the smoke-minimal render
layer on three existing route segments (`/accounts`,
`/transactions`, `/dashboard`) with production-grade renders
that consume the existing Hono routes unchanged. The only API
surface additions are two additive `include=` query flags on
existing GET endpoints (`/api/accounts?include=lastActivity`,
`/api/transactions?include=accountName`); the endpoints
without the flag MUST be byte-identical to the existing
contract (REQ-UI-1, REQ-UI-2).

Five design decisions bind the implementation:

- **Hand-built primitives on Tailwind v4 + React 19.** No new
  top-level dependency (no shadcn, no NextUI, no MUI, no
  Chakra, no Radix in v1). The primitives consume the existing
  Tailwind v4 class table; the token table at
  `app/_ui/tokens.css` extends it via CSS custom properties.
- **Server Component by default; Client Component only when
  interactive.** The render layer is server-first. The only
  Client Components are the two dashboard query-param state
  components (`dashboard-account-picker.tsx`,
  `dashboard-month-switcher.tsx`) and the submit-button loading
  state in the form components (the latter being an interactive
  Client Component is the BR-UI-6 contract).
- **Composition via children + compound components, NOT
  boolean-prop proliferation.** `Card` uses `CardHeader`,
  `CardBody`, `CardFooter` children. `Table` uses
  `TableHeader`, `TableBody`, `TableRow`, `TableCell` children.
  No `variant` / `size` / `as` props on the primitives (Vercel
  composition patterns precedent; the rule is documented as
  part of the BR-UI-9 design system reference).
- **Two additive query flags, zero breaking change.** The
  `include=lastActivity` and `include=accountName` query
  parameters are OPTIONAL. The endpoints without the flag MUST
  be byte-identical to the current contract. The data shape
  gains optional fields only. No new Hono routes, no new
  Prisma models, no migrations.
- **WCAG 2.2 AA accessibility floor.** axe-core `critical` +
  `serious` violations are zero (REQ-UI-4 to REQ-UI-8). Every
  interactive primitive renders `focus-visible:ring-2` (or
  equivalent Tailwind v4 token), every form field has a paired
  `<label htmlFor="<id>">`, every form error renders inline
  with `aria-describedby`, every `Table` renders `<caption>`
  and `<th scope="col">`, every submit button renders
  `aria-busy="true"` + `disabled` + `Spinner` while the Server
  Action is in flight (BR-UI-3 to BR-UI-7).

---

## 2. Module structure — `app/_ui/` (new)

The new `app/_ui/` folder is the **single source of UI truth**.
It is NOT a TypeScript module under `src/` — it is a Next.js
App Router folder that hosts design-system primitives (Server
Components by default, Client Components only when interactive),
the layout shell primitives, and the token table at
`app/_ui/tokens.css`. The consumption sites (`app/accounts/`,
`app/transactions/`, `app/dashboard/`) import from the
primitives; they do NOT extend the token table or duplicate
primitives.

### 2.1 File tree

```
app/_ui/
├── index.ts                                 # public barrel: tokens (CSS import) + primitives re-exports
├── tokens.css                               # Tailwind v4 CSS-first token declarations (light + dark CSS scope)
├── primitives/
│   ├── button.tsx                           # Server Component by default; accepts className override
│   ├── button.test.tsx                      # render: primary, secondary, ghost, disabled, loading (aria-busy)
│   ├── input.tsx                            # text input; pairs with FormField; forwardRef
│   ├── input.test.tsx
│   ├── textarea.tsx                         # multiline input; pairs with FormField
│   ├── textarea.test.tsx
│   ├── select.tsx                           # native <select>; pairs with FormField
│   ├── select.test.tsx
│   ├── checkbox.tsx                         # native <input type=checkbox>; pairs with FormField
│   ├── checkbox.test.tsx
│   ├── radio-group.tsx                      # composed of RadioGroup + RadioGroupItem
│   ├── radio-group.test.tsx
│   ├── combobox.tsx                         # 'use client' — searchable combobox on <select> + <input>
│   ├── combobox.test.tsx
│   ├── field-error.tsx                      # error message block; pairs with FormField via aria-describedby
│   ├── field-error.test.tsx
│   ├── form-field.tsx                       # composes Label + control + FieldError; enforces <label htmlFor>
│   ├── form-field.test.tsx
│   ├── card.tsx                             # composed of CardHeader, CardBody, CardFooter (compound)
│   ├── card.test.tsx                        # snapshot: empty, populated
│   ├── card-header.tsx
│   ├── card-body.tsx
│   ├── card-footer.tsx
│   ├── table.tsx                            # composed of TableHeader, TableBody, TableRow, TableCell
│   ├── table.test.tsx                       # snapshot: empty, populated; a11y: caption + scope + aria-sort
│   ├── table-header.tsx
│   ├── table-body.tsx
│   ├── table-row.tsx
│   ├── table-cell.tsx
│   ├── badge.tsx                            # direction badges (INCOME green, EXPENSE red); status badges
│   ├── badge.test.tsx                       # snapshot: each variant
│   ├── empty-state.tsx                      # illustration slot + title + description + CTA
│   ├── empty-state.test.tsx                 # snapshot: with CTA, without CTA
│   ├── spinner.tsx                          # inline SVG; accessible role="status" + aria-label
│   ├── spinner.test.tsx                     # snapshot + a11y assertion
│   ├── skeleton.tsx                         # animated placeholder
│   ├── skeleton.test.tsx                    # snapshot
│   ├── pagination.tsx                       # server-rendered <Link>s; aria-label on controls
│   ├── pagination.test.tsx                  # render: first/middle/last page; aria-labels
│   ├── dialog.tsx                           # 'use client' — confirm dialog (delete transaction)
│   ├── dialog.test.tsx                      # render: open + close; Escape to close
│   ├── breadcrumb.tsx                       # server-rendered <nav><ol> with aria-label="Breadcrumb"
│   ├── breadcrumb.test.tsx                  # snapshot
│   └── link.tsx                             # Next.js Link wrapper; focus-visible ring
│       └── link.test.tsx
├── layout/
│   ├── page-header.tsx                      # title + description + actions slot
│   ├── page-container.tsx                   # max-width wrapper + responsive padding
│   ├── sidebar.tsx                          # optional left rail (not used in v1 — exported for follow-up)
│   ├── topbar.tsx                           # optional top bar
│   └── breadcrumb-bar.tsx                   # composes Breadcrumb primitive
└── README.md                                # internal: developer-facing overview of the token table

app/
├── error.tsx                                # NEW — user-facing error boundary for the root segment
├── not-found.tsx                            # NEW — user-facing 404 boundary for the root segment
├── accounts/
│   ├── error.tsx                            # NEW — segment-level error boundary
│   ├── page.tsx                             # MODIFIED — production render with design-system primitives
│   ├── accounts-list-table.tsx              # MODIFIED — production table (sort, archived toggle, last-activity col)
│   ├── accounts-list-table.test.tsx         # MODIFIED — extended snapshots + a11y tests
│   ├── [id]/
│   │   ├── page.tsx                         # MODIFIED — production render
│   │   ├── account-detail.tsx               # MODIFIED — production Card layout
│   │   └── account-detail.test.tsx          # MODIFIED — extended snapshots
│   └── new/
│       ├── page.tsx                         # MODIFIED — production render
│       ├── create-account-form.tsx          # MODIFIED — production form with FormField + FieldError + Spinner
│       └── create-account-form.test.tsx     # MODIFIED — extended snapshots + a11y tests
├── transactions/
│   ├── error.tsx                            # NEW
│   ├── page.tsx                             # MODIFIED
│   ├── [id]/
│   │   ├── page.tsx                         # MODIFIED
│   │   └── transaction-detail-forms.tsx     # MODIFIED — production edit + delete forms (Card + Dialog)
│   ├── [id]/transaction-detail-forms.test.tsx  # NEW — extended
│   └── new/
│       ├── page.tsx                         # MODIFIED
│       ├── create-transaction-form.tsx      # MODIFIED — production form with Combobox for account selection
│       └── create-transaction-form.test.tsx # MODIFIED — extended snapshots + a11y tests
├── dashboard/
│   ├── error.tsx                            # NEW
│   ├── page.tsx                             # MODIFIED — production render with ?accountId + ?month searchParams
│   ├── page.test.tsx                        # MODIFIED — extended snapshots (empty, populated, accountId, month)
│   └── page.seeded.test.tsx                 # MODIFIED — extended
├── _components/                             # dashboard-specific Client Components
│   ├── dashboard-account-picker.tsx         # NEW — 'use client' — Link-based account picker
│   ├── dashboard-account-picker.test.tsx    # NEW — render + accessibility
│   ├── dashboard-month-switcher.tsx         # NEW — 'use client' — Link-based month switcher (prev/curr/next)
│   ├── dashboard-month-switcher.test.tsx    # NEW — render + edge cases (Dec→Jan rollover)
│   ├── dashboard-monthly-summary.tsx        # MODIFIED — production render (Card + Table + Badge)
│   ├── dashboard-monthly-summary.test.tsx   # MODIFIED — extended
│   ├── dashboard-category-breakdown.tsx     # MODIFIED
│   ├── dashboard-category-breakdown.test.tsx # MODIFIED
│   ├── dashboard-account-flow.tsx           # MODIFIED
│   ├── dashboard-account-flow.test.tsx      # MODIFIED
│   ├── transactions-list-table.tsx          # MODIFIED — production table (sort, pagination, filters)
│   ├── transactions-list-table.test.tsx     # NEW — sort + pagination + filter tests
│   └── ephemeral-toast.tsx                  # UNCHANGED — client toast (already shipped)
├── _actions/
│   └── transactions-server-actions.ts       # UNCHANGED — server actions (already shipped)
├── _lib/
│   ├── format-minor.ts                      # UNCHANGED — minor-units currency formatter
│   ├── account-types.ts                     # UNCHANGED — FinancialAccountWire shape
│   ├── transaction-types.ts                 # UNCHANGED — TransactionDTO shape
│   ├── report-types.ts                      # UNCHANGED — MonthlySummaryDTO, CategoryBreakdownDTO, AccountFlowDTO
│   └── report-types.test.ts                 # UNCHANGED
├── layout.tsx                               # UNCHANGED — root layout (no new wrapper)
├── globals.css                              # MODIFIED — import app/_ui/tokens.css
└── page.tsx                                 # UNCHANGED — landing page

docs/
├── architecture/
│   └── ui.md                                # NEW — design-system reference (token table + component inventory)
├── qa/
│   └── transactions-ui.md                   # NEW — manual QA checklist (keyboard, screen reader, follow-ups)
└── perf/
    └── transactions-ui.md                   # NEW — Lighthouse output + perf budget verification

Documents-es/
├── architecture/
│   └── ui.md                                # ES mirror of docs/architecture/ui.md
├── qa/
│   └── transactions-ui.md                   # ES mirror of docs/qa/transactions-ui.md
└── perf/
    └── transactions-ui.md                   # ES mirror of docs/perf/transactions-ui.md
```

The proposed tree differs from the spec in two intentional ways
(the orchestrator cache baked these in):

1. The spec proposes `app/_ui/primitives/` and
   `app/_ui/layout/` as the two sub-folders. The proposal
   confirms the same structure. The tree above preserves both
   sub-folders so the design-system reference (§10 below) has
   a stable home for both the presentational primitives and
   the structural layout primitives.

2. The spec proposes a `Dialog` primitive in the list. The
   design makes `Dialog` an explicit Client Component (`'use
client'`) because it owns local state (`isOpen`). The
   server-rendered `<dialog>` element is HTML5-native and
   supports `open` attribute; the primitive wraps the HTML
   element and adds the `aria-labelledby` + `aria-describedby`
   pattern. The `Dialog` is consumed by the delete-transaction
   confirm flow only in v1 (REQ-UI-7's loading state lives in
   the form's submit button; the Dialog itself is a thin
   accessibility wrapper around the native element).

### 2.2 Cross-module dependency direction

```
            app/_ui/ (new)
            ├─ tokens.css (Tailwind v4 CSS-first declarations; @import in app/globals.css)
            ├─ primitives/ (Server Component by default; 'use client' only on Combobox + Dialog)
            │   ├─ Button, Input, Textarea, Select, Checkbox, RadioGroup
            │   │   Server Component; no state; no hooks; no events
            │   ├─ Combobox, Dialog
            │   │   Client Component ('use client'); local state + a11y
            │   ├─ FieldError, FormField, Card, Table, Badge, EmptyState,
            │   │   Spinner, Skeleton, Pagination, Breadcrumb, Link
            │   │   Server Component; no state; pure props
            │   └─ _shared/cx.ts (clsx-style className merge; NO new dep)
            ├─ layout/ (PageHeader, PageContainer, BreadcrumbBar)
            │   Server Component; pure props
            └─ README.md (internal)

            app/accounts/ (consumes app/_ui/)
            ├─ page.tsx, [id]/page.tsx, new/page.tsx
            │   Server Component; uses Card, Table, Badge, EmptyState
            ├─ accounts-list-table.tsx, account-detail.tsx, create-account-form.tsx
            │   Server Component (or Client Component for the form's submit button state)
            └─ error.tsx (segment-level boundary)

            app/transactions/ (consumes app/_ui/)
            ├─ page.tsx, [id]/page.tsx, new/page.tsx
            │   Server Component; uses Card, Table, Badge, Pagination, EmptyState
            ├─ transactions-list-table.tsx, transaction-detail-forms.tsx,
            │   create-transaction-form.tsx
            │   Combobox for account selection (Client Component)
            │   Dialog for delete confirm (Client Component)
            └─ error.tsx

            app/dashboard/ (consumes app/_ui/)
            ├─ page.tsx (Server Component; reads ?accountId and ?month searchParams)
            ├─ dashboard-account-picker.tsx, dashboard-month-switcher.tsx
            │   Client Component ('use client'); Link-based navigation
            └─ error.tsx

            app/_components/ (dashboard-specific Client Components)
            └─ dashboard-{monthly-summary,category-breakdown,account-flow}.tsx
                Server Component; pure props

src/modules/api/ (additive changes only)
├─ accounts/ GET /api/accounts (additive ?include=lastActivity)
│   Handler adds optional lastActivityAt field per row when flag present
└─ transactions/ GET /api/transactions (additive ?include=accountName)
    Handler adds optional accountName field per row when flag present

src/shared/errors/ (NO changes)
└─ app-error.ts (reused; ErrorEnvelope is the wire shape)
```

The dependency arrows point **only** from `app/_ui/` outward
to the consuming pages. The pages consume the primitives; the
primitives do NOT depend on the pages. The two additive query
flags land in `src/modules/api/` under the existing handlers;
the handlers do NOT change for callers that omit the flag.

The dependency on `src/shared/errors/app-error.ts` is
**read-only** at the UI boundary: the form components consume
the `error.code` and `error.details[]` fields from the
envelope; they do NOT import the error-class definitions or
the error-code enum from the UI side. The mapping is a pure
function in the form component (`mapApiErrorToFieldError`).

### 2.3 Public barrel — `app/_ui/index.ts`

The barrel re-exports the primitives and the layout shell.
Consumers import from `app/_ui/primitives/button` (path-based)
or from a named barrel (path-based). Next.js App Router does
NOT support top-level barrel re-exports of Server Components
in the same way that `@/lib/foo` does for plain modules; the
primitive imports use **path-based imports** throughout the
codebase (e.g. `import { Button } from '../_ui/primitives/button'`).
The `app/_ui/index.ts` file exists for documentation purposes
(to declare the public surface in one place) but is not
imported in the runtime path.

The barrel does NOT export:

- `tokens.css` directly — the CSS file is `@import`ed in
  `app/globals.css` (Next.js App Router global CSS convention).
- Test files (`*.test.tsx`) — tests are co-located with the
  source per the project's existing convention.
- Internal helpers (`_shared/cx.ts`) — these are private to
  `app/_ui/`.

---

## 3. Domain model

The `ui` capability does NOT own domain entities. It owns
**props contracts** for the design-system primitives and the
**TypeScript types** for the wire-aligned DTOs that flow
through the Server Components. The DTO types (`TransactionDTO`,
`FinancialAccountWire`, `MonthlySummaryDTO`,
`CategoryBreakdownDTO`, `AccountFlowDTO`) are imported from
the existing `app/_lib/` files and are NOT redefined here.

### 3.1 Token table

The token table is the **single source of styling**. Every
primitive consumes tokens; pages consume primitives; nothing
hard-codes a color, spacing, or font size outside of the token
table.

```css
/* app/_ui/tokens.css — light theme (v1) */

@layer base {
  :root {
    /* Spacing scale — ui-space-{1..8} maps to 4..32px */
    --ui-space-1: 0.25rem;
    --ui-space-2: 0.5rem;
    --ui-space-3: 0.75rem;
    --ui-space-4: 1rem;
    --ui-space-5: 1.25rem;
    --ui-space-6: 1.5rem;
    --ui-space-7: 2rem;
    --ui-space-8: 2.5rem;

    /* Color roles — light theme */
    --ui-bg: #ffffff;
    --ui-bg-muted: #f9fafb;
    --ui-bg-subtle: #f3f4f6;
    --ui-fg: #111827;
    --ui-fg-muted: #6b7280;
    --ui-border: #e5e7eb;
    --ui-accent: #2563eb;
    --ui-accent-fg: #ffffff;
    --ui-danger: #dc2626;
    --ui-danger-fg: #ffffff;
    --ui-success: #16a34a;
    --ui-success-fg: #ffffff;
    --ui-warning: #d97706;
    --ui-warning-fg: #ffffff;

    /* Radius scale */
    --ui-rounded-sm: 0.25rem;
    --ui-rounded-md: 0.5rem;
    --ui-rounded-lg: 0.75rem;
    --ui-rounded-full: 9999px;

    /* Elevation */
    --ui-shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --ui-shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    --ui-shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);

    /* Typography scale */
    --ui-text-xs: 0.75rem;
    --ui-text-sm: 0.875rem;
    --ui-text-base: 1rem;
    --ui-text-lg: 1.125rem;
    --ui-text-xl: 1.25rem;
    --ui-text-2xl: 1.5rem;
    --ui-text-3xl: 1.875rem;
    --ui-font-normal: 400;
    --ui-font-medium: 500;
    --ui-font-semibold: 600;
    --ui-font-bold: 700;
  }

  /* Dark-mode tokens — declared but unused in v1 (BR-UI-8, REQ-UI-9) */
  [data-theme='dark'] {
    --ui-bg: #0a0a0a;
    --ui-bg-muted: #171717;
    --ui-bg-subtle: #262626;
    --ui-fg: #fafafa;
    --ui-fg-muted: #a3a3a3;
    --ui-border: #404040;
    --ui-accent: #3b82f6;
    --ui-accent-fg: #ffffff;
    --ui-danger: #ef4444;
    --ui-danger-fg: #ffffff;
    --ui-success: #22c55e;
    --ui-success-fg: #ffffff;
    --ui-warning: #f59e0b;
    --ui-warning-fg: #ffffff;
  }
}
```

The token table is imported once at `app/globals.css` via
`@import './_ui/tokens.css';`. Tailwind v4 reads the CSS
custom properties and exposes them as utility classes via
`@theme inline { --color-ui-bg: var(--ui-bg); ... }` (the v4
CSS-first config). Every primitive consumes the utility
classes (`bg-ui-bg`, `text-ui-fg`, `rounded-ui-md`, etc.); no
primitive hard-codes a hex value.

### 3.2 Primitive props contracts

The primitives are pure-function components. The props contracts
are the **stable cross-slice contract** — slice 1 (`ui-primitives`)
ships them; slices 2-5 consume them without modification.

#### 3.2.1 `Button`

```typescript
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant. Defaults to 'primary'. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Loading state — renders Spinner + disabled + aria-busy. */
  isLoading?: boolean;
  /** Optional icon (Lucide React name or ReactNode). v1: omitted. */
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}
```

A11y contract: renders `<button>` with `focus-visible:ring-2
focus-visible:ring-ui-accent`. When `isLoading=true`, renders
`<Spinner aria-label="Loading" />` + `disabled` + `aria-busy="true"`.

#### 3.2.2 `Input`

```typescript
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Field id — paired with <label htmlFor> from FormField. */
  id: string;
}
```

A11y contract: the `id` is required (enforced by TypeScript).
`FormField` injects the `aria-describedby` attribute that links
the input to the `FieldError` element.

#### 3.2.3 `FormField`

```typescript
export interface FormFieldProps {
  /** Field id — passed to <label htmlFor> and to the input's id. */
  id: string;
  /** Label text (Spanish for dashboard, English for component-level per BR-UI-4). */
  label: string;
  /** Whether the field is required (renders a visual marker; not a substitute for HTML required). */
  required?: boolean;
  /** Optional helper text below the field. */
  description?: string;
  /** Optional error message — rendered via FieldError; sets aria-describedby. */
  error?: string;
  /** The form control (Input, Select, Textarea, Combobox, etc.). */
  children: React.ReactNode;
}
```

A11y contract: renders `<label htmlFor={id}>{label}{required && ' *'}</label>` and a `<div>` wrapper that contains the children + the optional description + the `FieldError` if `error` is present. The children element receives `aria-describedby={errorId}` when `error` is present. `aria-invalid="true"` is set on the children when `error` is present.

#### 3.2.4 `Card` + `CardHeader` + `CardBody` + `CardFooter`

```typescript
export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** Optional accessible label for the card region. */
  'aria-label'?: string;
  /** Optional aria-labelledby pointing to a heading id. */
  'aria-labelledby'?: string;
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLElement> {
  /** Title text — rendered as <h2> by default. */
  title: string;
  /** Optional badge slot (e.g. archived badge). */
  badge?: React.ReactNode;
  /** Optional action slot (e.g. Edit button). */
  actions?: React.ReactNode;
}

export interface CardBodyProps extends React.HTMLAttributes<HTMLElement> {}

export interface CardFooterProps extends React.HTMLAttributes<HTMLElement> {}
```

Composition pattern (Vercel composition patterns):

```tsx
<Card>
  <CardHeader title="Account detail" badge={<Badge>Active</Badge>} />
  <CardBody>{/* key-value rows, tables, forms */}</CardBody>
  <CardFooter>
    <Button variant="ghost">Cancel</Button>
    <Button variant="primary">Save</Button>
  </CardFooter>
</Card>
```

#### 3.2.5 `Table` + `TableHeader` + `TableBody` + `TableRow` + `TableCell`

```typescript
export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  /** Caption text — required for a11y (visible or sr-only). */
  caption: string;
  /** Whether the caption is visually hidden. Defaults to false. */
  hideCaption?: boolean;
}

export interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  /** Column definitions — drives <th scope="col"> and aria-sort. */
  columns: ReadonlyArray<{
    key: string;
    label: string;
    /** Whether the column is sortable. */
    sortable?: boolean;
    /** Current sort direction. */
    sortDirection?: 'ascending' | 'descending' | 'none';
    /** Sort handler — receives the column key. */
    onSort?: (key: string) => void;
  }>;
}

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {}

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {}
```

A11y contract: the `caption` is required (enforced by TypeScript).
`<th scope="col">` is rendered automatically. When `sortable=true`
and `onSort` is provided, the `<th>` renders `aria-sort` reflecting
the current `sortDirection` and renders a `<button>` inside the
`<th>` for keyboard activation (Enter activates sort).

#### 3.2.6 `Badge`

```typescript
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Variant — semantic color role. */
  variant?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  /** Badge text. */
  children: React.ReactNode;
}
```

Direction badges (REQ-UI-3 / smoke precedent): `INCOME` renders
`variant="success"` (green); `EXPENSE` renders `variant="danger"`
(red). Archived badges: `variant="neutral"`. The Spanish copy
uses `Ingreso` and `Gasto` per the existing convention.

#### 3.2.7 `EmptyState`

```typescript
export interface EmptyStateProps {
  /** Title text — short, scannable. */
  title: string;
  /** Description text — explains why the surface is empty. */
  description?: string;
  /** Optional illustration (SVG or ReactNode). */
  illustration?: React.ReactNode;
  /** Optional CTA — Link or Button. */
  cta?: React.ReactNode;
}
```

A11y contract: renders `<div role="status">` so screen readers
announce the empty state on navigation. The CTA is the first
focusable element when present.

#### 3.2.8 `Combobox` (Client Component)

```typescript
export interface ComboboxProps {
  /** Field id — paired with <label htmlFor> from FormField. */
  id: string;
  /** Current value (controlled). */
  value: string | null;
  /** Change handler — receives the selected value. */
  onChange: (value: string | null) => void;
  /** Options list — derived from the live accounts list. */
  options: ReadonlyArray<{
    value: string;
    label: string;
    /** Optional disabled state for archived accounts. */
    disabled?: boolean;
  }>;
  /** Placeholder text for the search input. */
  placeholder?: string;
  /** Whether the field is required. */
  required?: boolean;
  /** Whether the field is disabled. */
  disabled?: boolean;
  /** Accessible label (overrides FormField's label). */
  'aria-label'?: string;
}
```

A11y contract: the underlying `<select>` is the semantic
primitive for screen readers (the native combobox role). The
`<input type="search">` is the visual search field. Keyboard:
`ArrowDown` / `ArrowUp` to navigate options, `Enter` to select,
`Escape` to close.

#### 3.2.9 `Dialog` (Client Component)

```typescript
export interface DialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Close handler — fires on Escape, on backdrop click, on Cancel. */
  onClose: () => void;
  /** Title — rendered in <h2> with id; aria-labelledby points to this id. */
  title: string;
  /** Description — rendered with id; aria-describedby points to this id. */
  description?: string;
  /** Action buttons (Cancel + Confirm). */
  children: React.ReactNode;
}
```

A11y contract: focus is trapped inside the dialog when open.
`Escape` fires `onClose`. The dialog has `role="dialog"` and
`aria-modal="true"`. The first focusable element receives focus
on open.

#### 3.2.10 `Pagination`

```typescript
export interface PaginationProps {
  /** Current page (1-indexed). */
  currentPage: number;
  /** Total pages. */
  totalPages: number;
  /** Base URL — the pagination appends ?page=N to this URL. */
  baseUrl: string;
}
```

A11y contract: renders `<nav aria-label="Pagination">` with
`<Link>` controls. Each `<Link>` carries `aria-label="Page N"`
or `aria-label="Previous page"` / `aria-label="Next page"`.

### 3.3 Wire-aligned DTO types

The DTO types are unchanged from the existing `app/_lib/`
files. The design does NOT introduce new DTO types; the
production UI consumes the wire shapes from `app/_lib/` and
the two additive query flags add two optional fields
(`lastActivityAt` per account, `accountName` per transaction)
to the existing response shapes.

```typescript
// app/_lib/account-types.ts — extended for BR-UI-1
export interface FinancialAccountWire {
  id: string;
  name: string;
  currency: AccountCurrency;
  casa: AccountFxCasa;
  archivedAt: string | null;
  /**
   * BR-UI-1 — present ONLY when ?include=lastActivity is set.
   * ISO-8601 string of the most recent transaction's transactionDate,
   * or null when the account has no transactions.
   */
  lastActivityAt?: string | null;
}

// app/_lib/transaction-types.ts — extended for BR-UI-2
export interface TransactionDTO {
  id: string;
  userId: string;
  accountId: string;
  direction: TransactionDirection;
  amountMinor: number;
  currency: AccountCurrency;
  memo: string | null;
  category: string | null;
  transactionDate: string;
  convertedAmountMinor: number;
  convertedCurrency: AccountCurrency;
  fxAsOfSnapshot: string | null;
  casaSnapshot: AccountFxCasa | null;
  createdAt: string;
  updatedAt: string;
  /**
   * BR-UI-2 — present ONLY when ?include=accountName is set.
   * Name of the parent FinancialAccount.
   */
  accountName?: string;
}
```

The optional fields are declared with `?:` (not `| undefined`)
so that the JSON serialization is byte-identical when the flag
is absent: the field is omitted from the response entirely,
not present-with-undefined. The TypeScript type asserts the
optionality at the call-site; the runtime serialization omits
the key when undefined (per the JSON.stringify spec).

### 3.4 Invariants summary (cross-cutting)

- **No hard-coded values in primitives.** Every color,
  spacing, radius, elevation, and font-size comes from the
  token table. A code review that spots a hex value in a
  primitive fails the verify gate (BR-UI-9 + REQ-UI-10).
- **No `dark:` Tailwind variants in production pages.** The
  v1 theme is light only (REQ-UI-9). The dark tokens are
  declared under `[data-theme='dark']` but no consumer sets
  that attribute. A `git grep -E '\bdark:' app/_ui/
app/accounts/ app/transactions/ app/dashboard/'` returns
  zero matches in v1.
- **Server Component by default.** A `'use client'` directive
  is allowed ONLY on `Combobox`, `Dialog`, the submit-button
  loading state in the form components, and the two
  dashboard query-param state Client Components. Every other
  file in `app/_ui/` and `app/{accounts,transactions,
dashboard}/` is a Server Component.
- **Composition via children.** `Card`, `Table`, `FormField`
  use compound-component patterns. NO `variant="primary|secondary|ghost"`
  props on `Card`; the variant lives on the inner `Button` or
  `Badge`. NO `as` prop on `Table`; the variant lives on the
  inner `TableCell`.
- **`aria-describedby` on every form field with an error.** A
  test asserts the `aria-describedby` attribute is present on
  every field with a server-side error (REQ-UI-6).
- **`aria-busy="true"` on every submit button in loading
  state.** A test asserts the attribute is set on click and
  cleared on response (REQ-UI-7).

---

## 4. Affected areas / capabilities

The change touches three route segments, one shared folder
(`app/_ui/`), and one optional seam in the existing Hono
handlers. The capability model treats each affected area as
either a **new capability** (`ui`), a **modified capability**
(`transactions` — REQ-TX-15 REPLACED; `accounts` — additive
query flag only; no spec change), or **no change** (`auth`,
`fx`, `reports`, `errors`).

### 4.1 New capability — `ui`

The `ui` capability is the design-system layer. Its surface
spans:

- `app/_ui/` (primitives + layout shell + tokens.css)
- `app/accounts/{page.tsx, [id]/page.tsx, new/page.tsx}`
- `app/transactions/{page.tsx, [id]/page.tsx, new/page.tsx}`
- `app/dashboard/page.tsx`
- `app/_components/dashboard-account-picker.tsx`,
  `app/_components/dashboard-month-switcher.tsx`
- `app/{error.tsx, accounts/error.tsx,
transactions/error.tsx, dashboard/error.tsx}` — user-facing
  error boundaries per route segment
- `docs/architecture/ui.md` — design-system reference
  (REQ-UI-10)
- `docs/qa/transactions-ui.md` — manual QA checklist
  (REQ-UI-11)
- `docs/perf/transactions-ui.md` — Lighthouse + perf budget
  verification

The canonical spec lives at `openspec/specs/ui/spec.md` after
`sdd-archive` runs. The delta spec at
`openspec/changes/transactions-ui/specs/ui/spec.md` is the
source for the canonical.

### 4.2 Modified capability — `transactions` (REQ-TX-15 REPLACED)

The transactions capability's data model, BRs, and Hono
endpoints are unchanged. The only delta is at the spec level:
**REQ-TX-15 is REPLACED** (not extended) by a thin pointer
to `openspec/specs/ui/spec.md` REQ-UI-1 to REQ-UI-11. The
replacement decouples the user-facing surface from the
transactions spec so future UI evolution lands as additions
to the `ui` capability, not as further revisions of REQ-TX-N.

The Hono endpoints under `/api/transactions/*` are unchanged.
The two additive query flags (`include=lastActivity`,
`include=accountName`) are owned by the `ui` capability — see
§4.3 below.

### 4.3 Modified capability — `accounts` (additive query flag only)

The accounts capability's data model, BRs, and Hono endpoints
are unchanged at the spec level (no spec delta). The only
runtime change is the addition of the `include=lastActivity`
query flag on `GET /api/accounts`. The handler is additive:
when the flag is present, the response gains `lastActivityAt`
per row; when absent, the response is byte-identical to the
current contract (REQ-UI-1).

The additive flag lives in `src/modules/accounts/application/actions/list-accounts.action.ts`
(or its successor). The implementation:

```typescript
// src/modules/accounts/application/actions/list-accounts.action.ts — additions

export interface ListAccountsOptions {
  readonly userId: string;
  /**
   * BR-UI-1 — when true, augment each row with
   * `lastActivityAt` (ISO-8601 or null).
   */
  readonly includeLastActivity?: boolean;
}

// In the handler:
if (opts.includeLastActivity) {
  const lastActivityByAccount = await loadLastActivityAt(userId);
  rows = rows.map((r) => ({
    ...r,
    lastActivityAt: lastActivityByAccount.get(r.id) ?? null,
  }));
}
```

The `loadLastActivityAt` helper is a single Prisma query:

```typescript
async function loadLastActivityAt(userId: string): Promise<Map<string, string>> {
  const rows = await prisma.transaction.groupBy({
    by: ['accountId'],
    where: { userId },
    _max: { transactionDate: true },
  });
  return new Map(rows.map((r) => [r.accountId, r._max.transactionDate!.toISOString()]));
}
```

The query uses the existing
`@@index([userId, transactionDate])` index on the `Transaction`
table — no new index is needed.

### 4.4 Unchanged capabilities (carried BRs)

- **`auth`** — the `auth()` Server Component helper is the
  gate on every page. No change. BR-AUTH-N carries through.
- **`fx`** — the FX capability is write-time only. The UI does
  not call `FxRateProvider` directly; it renders the
  snapshotted `convertedAmountMinor` /
  `convertedCurrency` / `fxAsOfSnapshot` columns. No change.
- **`reports`** — the three reports endpoints
  (`/api/reports/monthly`, `/api/reports/breakdown`,
  `/api/reports/accounts/:id/flow`) are consumed unchanged.
  The new `?accountId=` and `?month=` query parameters on the
  dashboard are pure UI state (search params read), not new
  API surface. No change to the reports spec.
- **`errors`** — no new error codes are added. The UI surfaces
  the existing `ErrorEnvelope` (`{ error: { code, message,
details? } }`) from `src/shared/errors/app-error.ts`. The
  mapping is a pure function in the form component
  (`mapApiErrorToFieldError`).

### 4.5 Cross-capability dependency arrows

```
auth          ──auth()──>  every Server Component gate
fx            ──FxRateProvider──>  transactions (write-time only)
              ──display-only snapshot──>  ui (renders the snapshotted columns)
transactions  ──/api/transactions + flag──>  ui
accounts      ──/api/accounts + flag──>  ui
reports       ──/api/reports/*──>  ui (dashboard only)
ui            ──consumes all four──>  user
ui            ──does NOT import──>  src/modules/{transactions,accounts,reports,fx,auth}/
                                       (uses Hono API only; never deep imports)
```

The `ui` capability depends on the four upstream capabilities
through the Hono API (`serverHonoRequest`) only. It does NOT
import any deep module under `src/modules/`. The dependency
arrow points `ui → {auth, accounts, transactions, reports}`
through HTTP, never through TypeScript imports. This preserves
the "modules-isolated" rule (root `AGENTS.md` §10.5) and the
"domain independence" rule (no domain module knows about UI).

### 4.6 Files affected (delta summary)

| File                                                                                                                                                                                                                                                                        | Action    | Description                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `app/_ui/tokens.css`                                                                                                                                                                                                                                                        | New       | Tailwind v4 CSS-first token declarations (light + dark scope). The single source of styling.      |
| `app/_ui/index.ts`                                                                                                                                                                                                                                                          | New       | Public barrel (documentation; runtime uses path-based imports).                                   |
| `app/_ui/primitives/{button,input,textarea,select,checkbox,radio-group,combobox,field-error,form-field,card,card-header,card-body,card-footer,table,table-header,table-body,table-row,table-cell,badge,empty-state,spinner,skeleton,pagination,dialog,breadcrumb,link}.tsx` | New       | Design-system primitives. Server Component by default; Client Component on `Combobox` + `Dialog`. |
| `app/_ui/primitives/*.test.tsx` (≈ 18 files)                                                                                                                                                                                                                                | New       | Per-primitive test file (render, loading/disabled, a11y).                                         |
| `app/_ui/layout/{page-header,page-container,breadcrumb-bar}.tsx`                                                                                                                                                                                                            | New       | Layout shell primitives (PageHeader + PageContainer + BreadcrumbBar).                             |
| `app/_ui/README.md`                                                                                                                                                                                                                                                         | New       | Internal: developer-facing overview of the token table + primitive catalog.                       |
| `app/accounts/page.tsx`                                                                                                                                                                                                                                                     | Modified  | Production render with Card + Table + EmptyState primitives. Auth gate + data fetch unchanged.    |
| `app/accounts/accounts-list-table.tsx`                                                                                                                                                                                                                                      | Modified  | Production table (sort, archived toggle, last-activity column). Co-located tests extended.        |
| `app/accounts/[id]/page.tsx`                                                                                                                                                                                                                                                | Modified  | Production render with Card + CardHeader + CardBody + CardFooter.                                 |
| `app/accounts/[id]/account-detail.tsx`                                                                                                                                                                                                                                      | Modified  | Production Card layout. No data change.                                                           |
| `app/accounts/[id]/account-detail.test.tsx`                                                                                                                                                                                                                                 | Modified  | Extended snapshots + a11y tests.                                                                  |
| `app/accounts/new/page.tsx`                                                                                                                                                                                                                                                 | Modified  | Production render with FormField + Input + Select + Button.                                       |
| `app/accounts/new/create-account-form.tsx`                                                                                                                                                                                                                                  | Modified  | Production form with inline validation + loading state + aria-busy. Submit logic unchanged.       |
| `app/accounts/new/create-account-form.test.tsx`                                                                                                                                                                                                                             | Modified  | Extended snapshots + a11y + loading-state tests.                                                  |
| `app/accounts/error.tsx`                                                                                                                                                                                                                                                    | New       | Segment-level error boundary (renders user-facing message + retry link).                          |
| `app/transactions/page.tsx`                                                                                                                                                                                                                                                 | Modified  | Production render with Card + Table + Pagination + EmptyState.                                    |
| `app/transactions/accounts-list-table.tsx` (smoke; renamed below)                                                                                                                                                                                                           | Renamed   | Renamed to `transactions-list-table.tsx` (matches the spec's existing file name).                 |
| `app/transactions/[id]/page.tsx`                                                                                                                                                                                                                                            | Modified  | Production render with Card layout.                                                               |
| `app/transactions/[id]/transaction-detail-forms.tsx`                                                                                                                                                                                                                        | Modified  | Production edit + delete forms (Card + Dialog for delete confirm).                                |
| `app/transactions/[id]/transaction-detail-forms.test.tsx`                                                                                                                                                                                                                   | New       | Extended snapshots + a11y tests for the edit + delete flows.                                      |
| `app/transactions/new/page.tsx`                                                                                                                                                                                                                                             | Modified  | Production render with FormField + Combobox (account selection).                                  |
| `app/transactions/new/create-transaction-form.tsx`                                                                                                                                                                                                                          | Modified  | Production form with Combobox for account selection + inline validation + loading state.          |
| `app/transactions/new/create-transaction-form.test.tsx`                                                                                                                                                                                                                     | Modified  | Extended snapshots + a11y + Combobox tests.                                                       |
| `app/transactions/error.tsx`                                                                                                                                                                                                                                                | New       | Segment-level error boundary.                                                                     |
| `app/dashboard/page.tsx`                                                                                                                                                                                                                                                    | Modified  | Production render with ?accountId and ?month searchParams. Auth gate + parallel fetch unchanged.  |
| `app/dashboard/page.test.tsx`                                                                                                                                                                                                                                               | Modified  | Extended snapshots (empty, populated, accountId, month).                                          |
| `app/dashboard/page.seeded.test.tsx`                                                                                                                                                                                                                                        | Modified  | Extended snapshots for the seeded-data happy path.                                                |
| `app/dashboard/error.tsx`                                                                                                                                                                                                                                                   | New       | Segment-level error boundary.                                                                     |
| `app/_components/dashboard-account-picker.tsx`                                                                                                                                                                                                                              | New       | Client Component ('use client'). Link-based navigation to ?accountId=<id>.                        |
| `app/_components/dashboard-account-picker.test.tsx`                                                                                                                                                                                                                         | New       | Render + accessibility tests.                                                                     |
| `app/_components/dashboard-month-switcher.tsx`                                                                                                                                                                                                                              | New       | Client Component ('use client'). Link-based prev/curr/next month.                                 |
| `app/_components/dashboard-month-switcher.test.tsx`                                                                                                                                                                                                                         | New       | Render + Dec→Jan rollover tests.                                                                  |
| `app/_components/dashboard-monthly-summary.tsx`                                                                                                                                                                                                                             | Modified  | Production render (Card + Table + Badge).                                                         |
| `app/_components/dashboard-monthly-summary.test.tsx`                                                                                                                                                                                                                        | Modified  | Extended snapshots.                                                                               |
| `app/_components/dashboard-category-breakdown.tsx`                                                                                                                                                                                                                          | Modified  | Production render (Card + Table + Badge).                                                         |
| `app/_components/dashboard-category-breakdown.test.tsx`                                                                                                                                                                                                                     | Modified  | Extended snapshots.                                                                               |
| `app/_components/dashboard-account-flow.tsx`                                                                                                                                                                                                                                | Modified  | Production render (Card + Table + Bar).                                                           |
| `app/_components/dashboard-account-flow.test.tsx`                                                                                                                                                                                                                           | Modified  | Extended snapshots.                                                                               |
| `app/_components/transactions-list-table.tsx`                                                                                                                                                                                                                               | Modified  | Production table (sort, pagination, filters). Co-located tests new.                               |
| `app/_components/transactions-list-table.test.tsx`                                                                                                                                                                                                                          | New       | Sort + pagination + filter tests.                                                                 |
| `app/error.tsx`                                                                                                                                                                                                                                                             | New       | User-facing root-level error boundary.                                                            |
| `app/not-found.tsx`                                                                                                                                                                                                                                                         | New       | User-facing root-level 404 boundary.                                                              |
| `app/globals.css`                                                                                                                                                                                                                                                           | Modified  | Import `app/_ui/tokens.css`.                                                                      |
| `app/layout.tsx`                                                                                                                                                                                                                                                            | Unchanged | Root layout. The design-system tokens live in `tokens.css`; the layout file does not change.      |
| `src/modules/accounts/application/actions/list-accounts.action.ts`                                                                                                                                                                                                          | Modified  | Add `includeLastActivity` flag + `loadLastActivityAt` helper.                                     |
| `src/modules/transactions/application/actions/list-transactions.action.ts`                                                                                                                                                                                                  | Modified  | Add `includeAccountName` flag + `loadAccountNames` helper.                                        |
| `docs/architecture/ui.md`                                                                                                                                                                                                                                                   | New       | Design-system reference (token table + component inventory).                                      |
| `docs/qa/transactions-ui.md`                                                                                                                                                                                                                                                | New       | Manual QA checklist (keyboard nav, screen reader, dark-mode follow-up note).                      |
| `docs/perf/transactions-ui.md`                                                                                                                                                                                                                                              | New       | Lighthouse output + perf budget verification.                                                     |
| `openspec/specs/ui/spec.md`                                                                                                                                                                                                                                                 | New       | Canonical spec (promoted by `sdd-archive`).                                                       |
| `openspec/specs/transactions/spec.md`                                                                                                                                                                                                                                       | Modified  | REQ-TX-15 REPLACED by thin pointer to `ui/spec.md`.                                               |
| `Documents-es/openspec/changes/transactions-ui/design.md`                                                                                                                                                                                                                   | New       | Spanish mirror of this file.                                                                      |
| `Documents-es/docs/architecture/ui.md`                                                                                                                                                                                                                                      | New       | Spanish mirror of the design-system reference.                                                    |
| `Documents-es/docs/qa/transactions-ui.md`                                                                                                                                                                                                                                   | New       | Spanish mirror of the manual QA checklist.                                                        |
| `Documents-es/docs/perf/transactions-ui.md`                                                                                                                                                                                                                                 | New       | Spanish mirror of the perf budget verification.                                                   |
| `package.json`                                                                                                                                                                                                                                                              | Unchanged | No new dependencies.                                                                              |
| `pnpm-lock.yaml`                                                                                                                                                                                                                                                            | Unchanged | No new dependencies → lockfile unchanged.                                                         |
| `prisma/schema.prisma`                                                                                                                                                                                                                                                      | Unchanged | No new models. No migrations.                                                                     |

The total affected file count is **64 files** (60 new + modified

- 4 doc artifacts). The change is **force-chained** into 6 PRs
  to keep each PR under the 400-line review budget.

---

## 5. Design decisions

This section documents the design decisions with full
rationale. Each decision is the answer to a question the spec
left open; the rationale cites the carried BR or the rejected
alternative.

### Decision: hand-built primitives (no shadcn, no Radix in v1)

**Choice.** Every primitive in `app/_ui/primitives/` is
hand-built on top of React 19 + the project's existing
Tailwind v4 class table. No new top-level dependency.

**Alternatives considered.**

1. **shadcn/ui** — copy-in primitives. Rejected for v1 because
   the project rule (root `AGENTS.md` §10.5) forbids new
   top-level dependencies. shadcn copies source into the repo
   (it's not technically a dep, but the surface area is
   comparable), and the v1 design surface is small enough that
   the maintenance cost of copying is worse than the cost of
   hand-building.
2. **Radix UI primitives (unstyled)** — headless behavior
   primitives. Rejected for v1 because Radix is a dep; the
   accessibility floor (focus rings, `aria-*` attributes) is
   achievable with hand-built primitives + axe-core tests.
   Radix's value is more visible on complex widgets
   (Combobox, Dialog) where the v1 surface is minimal.
3. **NextUI / MUI / Chakra** — full design systems. Rejected
   for the same reason as Radix: dep + token-table replacement
   cost.

**Rationale.** The proposal §"Alternatives considered" item 1
rejected shadcn/NextUI/MUI; item 2 rejected Radix. The
v1 surface (Button, Input, Table, Card, etc.) is well within
what hand-built primitives can deliver. A future
`ui-complex-widgets` change re-evaluates the trade-off once
the design-system debt is paid off. The proposal's "Forecast"
table codifies this constraint at slice 1 (`ui-primitives`):
"No new dependency. Every primitive is hand-built on top of
React 19, Tailwind v4, and the project's existing class
table."

### Decision: Server Component by default; Client Component only when interactive

**Choice.** Every file in `app/_ui/` and
`app/{accounts,transactions,dashboard}/` is a Server Component
by default. The `'use client'` directive is allowed ONLY on:

- `Combobox` (searchable combobox; local state for the search
  query)
- `Dialog` (confirm dialog; local state for `isOpen`)
- The submit-button loading state inside the form components
  (`CreateAccountForm`, `CreateTransactionForm`,
  `TransactionDetailForms`) — the button renders `Spinner` +
  `disabled` + `aria-busy` while the Server Action is in
  flight; this is BR-UI-6 and requires local state.
- `DashboardAccountPicker` (Client Component; navigates to
  `?accountId=<id>` on click)
- `DashboardMonthSwitcher` (Client Component; renders
  `<Link>`s for previous / current / next month)

**Alternatives considered.**

1. **All Client Components** — convert every page and every
   primitive to a Client Component. Rejected because Server
   Components are the project's existing convention (the
   smoke pages are all Server Components) and the
   parallel-fetch dashboard pattern is a Server Component
   feature (`Promise.all` in a Server Component, not in a
   `useEffect`).
2. **Hybrid with `'use client'` on the page level** — make
   each page a Client Component. Rejected because the page
   auth gate (`auth()` + `redirect()`) is a Server Component
   API; converting the page to a Client Component would
   require duplicating the gate on the server side.

**Rationale.** Server Components own the read path (data
fetch, auth gate, render); Client Components own local form
state (the submit-button loading state) and navigation state
(the dashboard's `?accountId` and `?month` query params).
The split matches the project's existing convention (smoke
pages are all Server Components; the only Client Component
in the codebase today is `app/_components/ephemeral-toast.tsx`,
the success toast after a form submission). The proposal
§"Out of scope" item 5 ("Not a new state-management library")
explicitly forbids Redux/Zustand/Jotai; the Server Component

- Client Component split is the lightweight alternative.

### Decision: composition via children, not boolean props

**Choice.** `Card`, `Table`, and `FormField` use compound
component patterns (children + named sub-components). NO
`variant` / `size` / `as` props on these primitives.

```tsx
// Composition pattern — RECOMMENDED
<Card>
  <CardHeader title="Account detail" badge={<Badge>Active</Badge>} />
  <CardBody>{/* content */}</CardBody>
  <CardFooter>
    <Button variant="ghost">Cancel</Button>
    <Button variant="primary">Save</Button>
  </CardFooter>
</Card>

// Boolean-prop pattern — REJECTED
<Card variant="detail" size="md" title="..." body={...} footerActions={...} />
```

**Alternatives considered.**

1. **Boolean-prop proliferation** — `variant="primary|secondary|tertiary"`,
   `size="sm|md|lg"`, `as="div|section|article"` on each
   primitive. Rejected because the prop surface explodes
   combinatorially (`variant × size × as × state` = 3 × 3 ×
   3 × 4 = 108 prop combinations) and the prop names couple
   to specific use cases (e.g. `variant="accountDetail"`
   doesn't compose with other contexts).
2. **Render-prop pattern** — `<Card>{({ variant }) => ...}</Card>`.
   Rejected because the children API is more readable and
   aligns with React 19's `children`-first conventions.

**Rationale.** Vercel composition patterns precedent
(vercel-composition-patterns skill). The `Card` /
`CardHeader` / `CardBody` / `CardFooter` pattern is the
screaming-architecture fit: the component name is the
architectural intent. The same pattern is used for `Table`
(`TableHeader` / `TableBody` / `TableRow` / `TableCell`) and
`FormField` (the children prop is the form control). The
proposal §"Slice 1" item 2 explicitly forbids `as`/`variant`
boolean-prop proliferation on the primitives.

### Decision: two additive query flags, zero breaking change

**Choice.** The two query flags (`include=lastActivity` on
`GET /api/accounts`, `include=accountName` on
`GET /api/transactions`) are additive. The endpoints without
the flag MUST be byte-identical to the current contract
(REQ-UI-1, REQ-UI-2). The data shape gains optional fields
only.

**Alternatives considered.**

1. **New fields always present** — add `lastActivityAt` and
   `accountName` to every response. Rejected because it
   changes the response shape unconditionally and would
   break byte-compatibility for any consumer that hashes the
   response (the existing smoke tests assert on the JSON
   shape).
2. **New endpoint** — add `GET /api/accounts?with=lastActivity`
   as a parallel route. Rejected because the routes already
   exist; a parallel route duplicates the auth gate, the
   userId scoping, and the cursor pagination. The additive
   flag is the minimal change.
3. **Separate "include" endpoint** — `GET
/api/accounts/include/last-activity`. Rejected because the
   query flag is the conventional REST pattern; a separate
   endpoint adds a route the OpenAPI generator must document.

**Rationale.** The proposal §"Business rules" item 5-6 (BR-UI-1,
BR-UI-2) codified the additive flag as the contract. The spec
locks it at REQ-UI-1 / REQ-UI-2. The additive flag avoids
breaking the existing smoke tests and the `app/_lib/`
DTOs (the optional fields are declared with `?:` so the
JSON serialization is byte-identical when the flag is
absent).

### Decision: WCAG 2.2 AA accessibility floor

**Choice.** axe-core `critical` + `serious` violations are
zero on every page. Every interactive primitive renders
`focus-visible:ring-2 focus-visible:ring-ui-accent` (or
equivalent Tailwind v4 token). Every form field has a paired
`<label htmlFor="<id>">`. Every form error renders inline
with `aria-describedby`. Every `Table` renders `<caption>`
and `<th scope="col">`. Every submit button renders
`aria-busy="true"` + `disabled` + `Spinner` while the Server
Action is in flight. AAA audits (text-on-accent contrast,
full keyboard parity on drag interactions) are deferred.

**Alternatives considered.**

1. **WCAG 2.1 AA** — older spec. Rejected because 2.2 AA is
   the current floor (Target Size 2.5.5 added in 2.2;
   Dragging 2.5.7 added in 2.2). The proposal codifies 2.2.
2. **WCAG 2.2 AAA** — stricter. Rejected because the v1
   surface is web + light + mixed EN/ES; AAA requires
   contrast ratios on text-on-accent that the v1 token table
   does not hit for every combination. AAA is deferred to a
   follow-up `ui-a11y-aaa` change.
3. **No formal accessibility floor** — informal code review.
   Rejected because the BR-UI-3 to BR-UI-7 business rules
   require a testable floor. axe-core is the testable floor.

**Rationale.** The proposal §"Out of scope" item 5 ("Accessibility
audit beyond WCAG 2.2 AA") explicitly codifies the AA floor.
The spec codifies the BRs as REQ-UI-4 to REQ-UI-8. The
verify gate runs axe-core on every page with seeded data;
any `critical` or `serious` violation fails the build.

### Decision: dark tokens declared, light theme rendered (v1)

**Choice.** The token table declares dark-mode CSS custom
properties under `[data-theme='dark']`. The v1 production UI
NEVER sets the `data-theme` attribute; the light tokens are
the rendered defaults. A `git grep` for `dark:` Tailwind
variants in `app/_ui/`, `app/accounts/`, `app/transactions/`,
`app/dashboard/`, `app/_components/dashboard-*.tsx` returns
zero matches in v1 (REQ-UI-9).

**Alternatives considered.**

1. **No dark tokens in v1** — declare only light tokens.
   Rejected because the proposal §"Out of scope" item 1
   explicitly defers dark mode to a follow-up change but
   requires the token table to be dark-ready. The dark
   tokens are 17 lines of CSS; the cost is trivial.
2. **Dark mode in v1** — full dark theme + toggle. Rejected
   because the proposal §"Out of scope" item 1 explicitly
   defers it. The v1 token table is dark-ready; a follow-up
   `ui-dark-mode` change activates the toggle and the dark
   CSS scope.

**Rationale.** The dark tokens are a forward-declaration. The
cost is 17 lines of CSS; the benefit is that the follow-up
`ui-dark-mode` change is non-breaking (no token-table
rewrite). The code-review check that asserts zero `dark:`
Tailwind variants prevents a stealth dark-mode addition.

---

## 6. Composition root changes

The `ui` capability does NOT change the composition root. The
Hono composition (`src/composition/build-app-deps.ts`,
`src/composition/create-hono-app.ts`) is unchanged. The UI
consumes the existing Hono routes through `serverHonoRequest`
(an existing helper at `app/_lib/server-hono.ts` or its
successor). The two additive query flags land in the existing
GET handlers under `src/modules/api/`; the composition root
does not register new routes.

### 6.1 Composition root untouched

```diff
# src/composition/build-app-deps.ts — UNCHANGED

  export function buildAppDeps(): HonoAppDeps {
    // ... existing wiring unchanged ...
    // No new fields, no new dependencies, no new registrations.
    return {
      // ... existing fields unchanged ...
    };
  }
```

```diff
# src/composition/create-hono-app.ts — UNCHANGED

  export function createHonoApp(deps: HonoAppDeps): OpenAPIHono {
    // ... existing wiring unchanged ...
    // The UI consumes the existing routes via serverHonoRequest
    // on the Next.js side; no new Hono routes are mounted here.
    return app;
  }
```

### 6.2 `app/globals.css` — token import

The only Next.js root-level change is the import of
`app/_ui/tokens.css` in `app/globals.css`:

```diff
# app/globals.css — MODIFIED

  @tailwind base;
  @tailwind components;
  @tailwind utilities;

+ @import './_ui/tokens.css';
```

The `@import` is hoisted by Tailwind v4 to a single CSS file at
build time. The token CSS variables are available globally to
every Server Component and every Client Component.

### 6.3 Additive query flag in `src/modules/api/`

The two query flags are added to the existing handlers:

```typescript
// src/modules/accounts/application/actions/list-accounts.action.ts — additions

export async function listAccountsAction(
  deps: ListAccountsDeps,
  input: { userId: string; includeLastActivity?: boolean },
): Promise<ActionResult<ListAccountsData>> {
  const accounts = await deps.accountRepository.list(input.userId);
  const dtos = accounts.map(toFinancialAccountDto);

  if (input.includeLastActivity) {
    const lastActivityByAccount = await loadLastActivityAt(input.userId);
    return ok({
      data: dtos.map((d) => ({
        ...d,
        lastActivityAt: lastActivityByAccount.get(d.id) ?? null,
      })),
    });
  }
  return ok({ data: dtos });
}
```

The `loadLastActivityAt` helper is a single Prisma query that
uses the existing `@@index([userId, transactionDate])` index
on the `Transaction` table. No new index; no new Prisma model.

```typescript
// src/modules/transactions/application/actions/list-transactions.action.ts — additions

export async function listTransactionsAction(
  deps: ListTransactionsDeps,
  input: {
    userId: string;
    cursor?: string;
    limit?: number;
    accountId?: string;
    includeAccountName?: boolean;
  },
): Promise<ActionResult<ListTransactionsData>> {
  const page = await deps.transactionRepository.list(input.userId, {
    cursor: input.cursor,
    limit: input.limit ?? 20,
    accountId: input.accountId,
  });
  const dtos = page.items.map(toTransactionDto);

  if (input.includeAccountName) {
    const accountNames = await loadAccountNames(
      input.userId,
      dtos.map((d) => d.accountId),
    );
    return ok({
      data: dtos.map((d) => ({
        ...d,
        accountName: accountNames.get(d.accountId) ?? null,
      })),
      nextCursor: page.nextCursor,
    });
  }
  return ok({ data: dtos, nextCursor: page.nextCursor });
}
```

The `loadAccountNames` helper is a single Prisma `findMany`
that batches the account IDs and returns a `Map<accountId,
accountName>`:

```typescript
async function loadAccountNames(
  userId: string,
  accountIds: string[],
): Promise<Map<string, string>> {
  const accounts = await prisma.financialAccount.findMany({
    where: { id: { in: accountIds }, userId },
    select: { id: true, name: true },
  });
  return new Map(accounts.map((a) => [a.id, a.name]));
}
```

The query uses the existing `userId` index on the
`FinancialAccount` table; the `id IN (...)` filter is satisfied
by the primary key. No new index.

### 6.4 Server Action consumers (unchanged)

The Server Actions under `app/_actions/transactions-server-actions.ts`
are unchanged. The form components consume the Server Actions
through React 19's `useActionState` hook (the new name for
`useFormState` in React 19) in the Client Component form
primitives. The Server Action's return shape is unchanged:
`{ ok: true, value: TransactionDTO }` or `{ ok: false, error:
ErrorEnvelope }`.

### 6.5 Error envelope surfacing (NEW — minimal)

The UI surface introduces a small pure-function helper at
`app/_ui/_shared/map-api-error.ts` that maps the existing
`ErrorEnvelope` to a field-level error map:

```typescript
// app/_ui/_shared/map-api-error.ts

import type { ErrorEnvelope } from '@/shared/errors/app-error';

export interface FieldErrorMap {
  [fieldName: string]: string;
}

/**
 * Map an API error envelope to a field-level error map.
 *
 * The first error message from `error.details[]` is rendered
 * next to the offending field with `aria-describedby` linking
 * the field to the error element's `id`. The `error.code`
 * determines the field-level routing:
 *
 *   - `INVALID_AMOUNT`         → `amountMinor`
 *   - `FUTURE_DATE_NOT_ALLOWED` → `transactionDate`
 *   - `ACCOUNT_ARCHIVED`       → `accountId`
 *   - `VALIDATION_ERROR`       → `error.details[0].path` if present, else first form field
 *   - other codes              → first form field (top-of-form fallback)
 */
export function mapApiErrorToFieldError(
  envelope: ErrorEnvelope,
  fieldNames: readonly string[],
): FieldErrorMap {
  // ... implementation ...
}
```

The helper is the single point of contact between the Hono
error envelope and the UI form. The mapping is testable
independently of the form components.

---

## 7. Public surface — `app/_ui/` exports

The public surface is the set of primitive components and
layout-shell components exported from `app/_ui/`. Consumers
import path-based (`import { Button } from
'../_ui/primitives/button'`); the `app/_ui/index.ts` file is a
documentation barrel, not a runtime barrel.

### 7.1 Primitives — `app/_ui/primitives/`

| Export        | Server/Client | Props shape (signature)                                                                                   | A11y contract                                                                                                |
| ------------- | ------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Button`      | Server        | `ButtonProps & ButtonHTMLAttributes` (variant, isLoading, iconLeft, iconRight, plus all `<button>` attrs) | `focus-visible:ring-2 focus-visible:ring-ui-accent`; loading → `disabled` + `aria-busy="true"` + `<Spinner>` |
| `Input`       | Server        | `InputProps & InputHTMLAttributes` (id required, plus all `<input>` attrs)                                | `aria-describedby` when paired with `FormField` + `FieldError`; `aria-invalid` when error                    |
| `Textarea`    | Server        | `TextareaProps & TextareaHTMLAttributes` (id required, plus all `<textarea>` attrs)                       | Same as `Input`.                                                                                             |
| `Select`      | Server        | `SelectProps & SelectHTMLAttributes` (id required, `options`, plus all `<select>` attrs)                  | Same as `Input`; native `<select>` is the semantic primitive.                                                |
| `Checkbox`    | Server        | `CheckboxProps & InputHTMLAttributes` (id required, plus `<input type="checkbox">` attrs)                 | Same as `Input`.                                                                                             |
| `RadioGroup`  | Server        | `RadioGroupProps` (name, value, onChange, children)                                                       | Composed of `<fieldset>` + `<legend>` + `<input type="radio">` items.                                        |
| `Combobox`    | Client        | `ComboboxProps` (id, value, onChange, options, placeholder, required, disabled, aria-label)               | Underlying `<select>` is the semantic primitive; `<input type="search">` for visual search; keyboard nav.    |
| `FieldError`  | Server        | `FieldErrorProps` (id, message)                                                                           | `role="alert"`; `aria-live="polite"`.                                                                        |
| `FormField`   | Server        | `FormFieldProps` (id, label, required, description, error, children)                                      | Renders `<label htmlFor={id}>`; sets `aria-describedby` + `aria-invalid` on children when error present.     |
| `Card`        | Server        | `CardProps & HTMLAttributes` (aria-label, aria-labelledby)                                                | Default `<article>`; renders children only.                                                                  |
| `CardHeader`  | Server        | `CardHeaderProps & HTMLAttributes` (title, badge, actions)                                                | `<h2>` title; badge + actions as siblings.                                                                   |
| `CardBody`    | Server        | `CardBodyProps & HTMLAttributes`                                                                          | `<div>` content slot.                                                                                        |
| `CardFooter`  | Server        | `CardFooterProps & HTMLAttributes`                                                                        | `<div>` action slot.                                                                                         |
| `Table`       | Server        | `TableProps & TableHTMLAttributes` (caption, hideCaption)                                                 | `<caption>` required; `<table role="table">`; rendered children only.                                        |
| `TableHeader` | Server        | `TableHeaderProps & HTMLAttributes` (columns)                                                             | Renders `<thead><tr>` with `<th scope="col">` per column; `aria-sort` on sortable columns.                   |
| `TableBody`   | Server        | `TableBodyProps & HTMLAttributes`                                                                         | `<tbody>` content slot.                                                                                      |
| `TableRow`    | Server        | `TableRowProps & HTMLAttributes`                                                                          | `<tr>` content slot.                                                                                         |
| `TableCell`   | Server        | `TableCellProps & TdHTMLAttributes`                                                                       | `<td>` content slot.                                                                                         |
| `Badge`       | Server        | `BadgeProps & HTMLAttributes` (variant: neutral/accent/success/warning/danger, children)                  | `<span>` content slot.                                                                                       |
| `EmptyState`  | Server        | `EmptyStateProps` (title, description, illustration, cta)                                                 | `role="status"`; CTA is first focusable when present.                                                        |
| `Spinner`     | Server        | `SpinnerProps` (size, label)                                                                              | `role="status"`; `aria-label` (default: "Loading").                                                          |
| `Skeleton`    | Server        | `SkeletonProps` (width, height)                                                                           | `aria-hidden="true"`; `aria-busy="true"` on parent.                                                          |
| `Pagination`  | Server        | `PaginationProps` (currentPage, totalPages, baseUrl)                                                      | `<nav aria-label="Pagination">`; `<Link>`s with `aria-label`.                                                |
| `Dialog`      | Client        | `DialogProps` (open, onClose, title, description, children)                                               | `role="dialog"`; `aria-modal="true"`; focus trap; Escape closes.                                             |
| `Breadcrumb`  | Server        | `BreadcrumbProps` (items: [{label, href}])                                                                | `<nav aria-label="Breadcrumb"><ol>` with `<Link>` items.                                                     |
| `Link`        | Server        | `LinkProps & AnchorHTMLAttributes` (href, plus all `<a>` attrs)                                           | Next.js `Link` wrapper; `focus-visible:ring-2`.                                                              |

### 7.2 Layout shell — `app/_ui/layout/`

| Export          | Server/Client | Props shape                                                       | Purpose                                                                            |
| --------------- | ------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `PageHeader`    | Server        | `PageHeaderProps` (title, description, actions)                   | Replaces the smoke pages' bare `<h1>`. Renders title + description + actions slot. |
| `PageContainer` | Server        | `PageContainerProps` (children, maxWidth: 'sm'\|'md'\|'lg'\|'xl') | Max-width wrapper + responsive padding (`px-4 md:px-6 lg:px-8 py-6`).              |
| `BreadcrumbBar` | Server        | `BreadcrumbBarProps` (items)                                      | Composes `Breadcrumb` primitive; renders inside `PageHeader` slot.                 |
| `Sidebar`       | Server        | `SidebarProps` (children)                                         | Optional left rail. NOT used in v1 (exported for follow-up `ui-sidebar` change).   |
| `Topbar`        | Server        | `TopbarProps` (children)                                          | Optional top bar. NOT used in v1 (exported for follow-up).                         |

### 7.3 Page-level changes (smoke → production)

| Page                             | Auth gate               | Data fetch                                                       | Render swap                                                                                                                |
| -------------------------------- | ----------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `app/accounts/page.tsx`          | `auth()` + `redirect()` | `serverHonoRequest('/api/accounts?include=lastActivity')`        | `PageHeader` + `Card` + `Table` (with sort + archived toggle) + `EmptyState` + `Pagination`                                |
| `app/accounts/[id]/page.tsx`     | `auth()` + `redirect()` | `serverHonoRequest('/api/accounts/:id')`                         | `PageHeader` + `Card` + `CardHeader` (name + currency badge + archived badge) + `CardBody` (key-value rows)                |
| `app/accounts/new/page.tsx`      | `auth()` + `redirect()` | N/A (Server Action for create)                                   | `PageHeader` + `Card` + `CardBody` + `CreateAccountForm` (FormField + Input + Select + Button + Spinner)                   |
| `app/transactions/page.tsx`      | `auth()` + `redirect()` | `serverHonoRequest('/api/transactions?include=accountName')`     | `PageHeader` + `Card` + `Table` (with sort + filters) + `EmptyState` + `Pagination`                                        |
| `app/transactions/[id]/page.tsx` | `auth()` + `redirect()` | `serverHonoRequest('/api/transactions/:id')`                     | `PageHeader` + `Card` + `TransactionDetailForms` (edit form + delete Dialog)                                               |
| `app/transactions/new/page.tsx`  | `auth()` + `redirect()` | N/A (Server Action for create)                                   | `PageHeader` + `Card` + `CardBody` + `CreateTransactionForm` (FormField + Combobox + Input + Button)                       |
| `app/dashboard/page.tsx`         | `auth()` + `redirect()` | `serverHonoRequest('/api/reports/monthly?month=...')` (parallel) | `PageHeader` + `DashboardMonthSwitcher` + `Card` (summary) + `Card` (breakdown) + `Card` (flow + `DashboardAccountPicker`) |

The page-level auth gate is identical to the smoke pages: a
single `await auth()` + `if (!session?.user) redirect(...)`.
The data fetch changes only in the query string (the two
additive `include=` flags on `/api/accounts` and
`/api/transactions`). The render layer is the only
production-grade addition.

### 7.4 Public barrel — `app/_ui/index.ts`

```typescript
// app/_ui/index.ts — documentation barrel; runtime uses path-based imports

export { Button } from './primitives/button';
export { Input } from './primitives/input';
export { Textarea } from './primitives/textarea';
export { Select } from './primitives/select';
export { Checkbox } from './primitives/checkbox';
export { RadioGroup } from './primitives/radio-group';
export { Combobox } from './primitives/combobox';
export { FieldError } from './primitives/field-error';
export { FormField } from './primitives/form-field';
export { Card, CardHeader, CardBody, CardFooter } from './primitives/card';
export { Table, TableHeader, TableBody, TableRow, TableCell } from './primitives/table';
export { Badge } from './primitives/badge';
export { EmptyState } from './primitives/empty-state';
export { Spinner } from './primitives/spinner';
export { Skeleton } from './primitives/skeleton';
export { Pagination } from './primitives/pagination';
export { Dialog } from './primitives/dialog';
export { Breadcrumb } from './primitives/breadcrumb';
export { Link } from './primitives/link';

export { PageHeader } from './layout/page-header';
export { PageContainer } from './layout/page-container';
export { BreadcrumbBar } from './layout/breadcrumb-bar';
export { Sidebar } from './layout/sidebar';
export { Topbar } from './layout/topbar';
```

The barrel does NOT export:

- `tokens.css` (imported via `@import` in `app/globals.css`).
- Test files (`*.test.tsx`).
- Internal helpers (`_shared/cx.ts`, `_shared/map-api-error.ts`).
- The form components under `app/{accounts,transactions}/`.
- The dashboard Client Components under `app/_components/`.

---

## 8. Error mapping

The UI surface area errors from the existing `ErrorEnvelope`
at `src/shared/errors/app-error.ts`. The envelope shape is
`{ error: { code: ErrorCode, message: string, details?:
Array<{ path: string, message: string }> } }`. The UI does
NOT introduce new error codes; the existing enum covers every
surface.

### 8.1 Error code → field mapping (UI surface)

| Wire code                 | HTTP | Field-level target                                        | UI surface                                            |
| ------------------------- | ---- | --------------------------------------------------------- | ----------------------------------------------------- |
| `VALIDATION_ERROR`        | 400  | `error.details[0].path` if present, else first form field | Inline `FieldError` via `aria-describedby`            |
| `INVALID_AMOUNT`          | 400  | `amountMinor`                                             | Inline `FieldError` on the amount input               |
| `FUTURE_DATE_NOT_ALLOWED` | 400  | `transactionDate`                                         | Inline `FieldError` on the date input                 |
| `ACCOUNT_ARCHIVED`        | 409  | `accountId`                                               | Inline `FieldError` on the account Combobox           |
| `NOT_FOUND`               | 404  | Top-of-form (no field)                                    | Redirect on detail pages; inline banner on list pages |
| `UNAUTHORIZED`            | 401  | Top-of-form                                               | Redirect to `/auth/signin` with callbackUrl           |
| `INTERNAL_ERROR`          | 500  | Top-of-form                                               | Error boundary renders the error page                 |
| `RATE_LIMIT_EXCEEDED`     | 429  | Top-of-form                                               | Inline banner with retry-after hint                   |

The mapping is centralized in
`app/_ui/_shared/map-api-error.ts` (see §6.5). Every form
component consumes the mapper; no form reimplements the
mapping.

### 8.2 Inline error rendering

When a form's Server Action returns `{ ok: false, error:
ErrorEnvelope }`, the form's Client Component invokes
`mapApiErrorToFieldError` and stores the result in local
state. The `FormField` primitive consumes the error message
and renders the `FieldError` sibling with `aria-describedby`
linking the field to the error element's `id`.

```tsx
// Form pattern (RECOMMENDED)
<FormField id="amount" label="Amount" required error={fieldErrors.amountMinor}>
  <Input
    id="amount"
    name="amountMinor"
    type="number"
    defaultValue={...}
    aria-describedby={fieldErrors.amountMinor ? 'amount-error' : undefined}
    aria-invalid={fieldErrors.amountMinor ? 'true' : undefined}
  />
</FormField>
{fieldErrors.amountMinor && (
  <FieldError id="amount-error" message={fieldErrors.amountMinor} />
)}
```

The form does NOT rely on a top-of-form alert alone (REQ-UI-6).
The top-of-form summary may exist as a secondary surface
(`role="alert"` on the form's first child), but every error
MUST have an inline rendering next to its field.

### 8.3 Error boundary surfaces

The error boundaries per route segment render the error
envelope's `error.message` and a retry link:

```tsx
// app/accounts/error.tsx — segment-level boundary
'use client'; // Required for error.tsx (Next.js App Router convention)

export default function AccountsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageContainer>
      <Card>
        <CardHeader title="Algo salió mal" />
        <CardBody>
          <p>No pudimos cargar las cuentas.</p>
          <p className="text-sm text-ui-fg-muted">{error.message || 'Error desconocido'}</p>
          <Button onClick={reset}>Reintentar</Button>
        </CardBody>
      </Card>
    </PageContainer>
  );
}
```

The boundary uses the design-system primitives; the `Card` +
`CardHeader` + `CardBody` + `Button` pattern is the same
across every segment. The `reset` callback (Next.js App
Router) retries the render.

### 8.4 Top-of-form error summary (optional secondary surface)

When multiple fields have errors, the form MAY render a
top-of-form summary as a secondary surface. The summary uses
`role="alert"` and `aria-live="polite"` so screen readers
announce it on submit. The summary is NOT a substitute for
inline errors; it is a navigation aid for users who want to
see all errors at once.

```tsx
// Top-of-form summary pattern (OPTIONAL secondary surface)
{
  Object.keys(fieldErrors).length > 0 && (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-ui-md border-ui-danger bg-ui-danger/10 p-4"
    >
      <p className="ui-font-semibold">Revisá los siguientes campos:</p>
      <ul className="mt-2 list-disc pl-4">
        {Object.entries(fieldErrors).map(([field, message]) => (
          <li key={field}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
```

The summary is the secondary surface; the inline errors are
the primary surface. The verify gate asserts that both
surfaces exist when errors are present.

---

## 9. State management

The `ui` capability does NOT introduce a state-management
library. The state model is:

- **Read state (data)** — owned by Server Components. The
  page calls `serverHonoRequest` (or a Server Action) on
  render; the result is the page's render input.
- **Local form state** — owned by Client Components. The form
  components use React 19's `useActionState` for the
  submit-state machine (idle → submitting → success/error).
- **Navigation state (query params)** — owned by Client
  Components. The dashboard's `DashboardAccountPicker` and
  `DashboardMonthSwitcher` use Next.js `useRouter` to push
  the new query params.
- **Modal state (Dialog open/close)** — owned by Client
  Components. The `Dialog` primitive uses `useState` for the
  `isOpen` state.
- **Combobox search state** — owned by Client Components.
  The `Combobox` primitive uses `useState` for the search
  query.

### 9.1 State machine — form submit

```
idle ──[submit click]──> submitting ──[response: ok]──> success ──[redirect]──> (page)
                              │
                              └──[response: error]──> error ──[field error clear]──> idle
```

The `useActionState` hook returns `{ state, formAction,
isPending }`. The submit button reads `isPending` to render
the loading state (`Spinner` + `disabled` + `aria-busy`).
The form reads `state.error` to populate the field-level
error map.

### 9.2 State machine — dialog

```
closed ──[trigger click]──> open ──[Escape | Cancel | Confirm]──> closed
                                  │
                                  └──[backdrop click]──> closed
```

The `Dialog` primitive wraps the native `<dialog>` element.
The native element handles the focus trap and the
Escape-to-close behavior; the React state is the
`isOpen` boolean that controls the `open` attribute.

### 9.3 State machine — dashboard query params

```
(?accountId=null, ?month=current) ──[AccountPicker click]──> (?accountId=<id>, ?month=current)
(?accountId=<id>, ?month=current) ──[MonthSwitcher prev]──> (?accountId=<id>, ?month=prev)
(?accountId=<id>, ?month=current) ──[MonthSwitcher next]──> (?accountId=<id>, ?month=next)
```

The state is the URL query string. The Client Components use
`useRouter().push(...)` to navigate; the Server Component
re-reads the search params on the next render.

### 9.4 No Zustand / Jotai / Redux

The proposal §"Out of scope" item 5 explicitly forbids new
state-management libraries. The state model uses:

- React 19's `useActionState` (built-in).
- React 19's `useState` (built-in).
- Next.js's `useRouter` and `useSearchParams` (built-in).
- Next.js's Server Components for read state (built-in).

No third-party state library is added. The verify gate asserts
`pnpm-lock.yaml` is unchanged after the change merges (root
`AGENTS.md` §5.3).

---

## 10. Performance budget

The performance budget is the **p95 page load < 2s** assertion
on the three primary pages (`/dashboard`, `/transactions`,
`/accounts`) under simulated 4G + Moto G4 (Lighthouse CLI).
The budget is codified at the proposal §"Acceptance" item 15
and verified at `docs/perf/transactions-ui.md` during the
verify gate (slice 6).

### 10.1 Bundle size budget

The `ui` capability is hand-built on Tailwind v4 (no new JS
deps). The bundle size delta is bounded by:

- **CSS:** `app/_ui/tokens.css` (≈ 60 lines of CSS variables,
  ≈ 1.5 KB minified) is imported once at `app/globals.css`.
  Tailwind v4 reads the CSS variables and exposes them as
  utility classes; the utility classes are tree-shaken to
  the actual class names used in the v1 pages (the
  `content` config in `tailwind.config.ts` scans
  `app/{_ui,accounts,transactions,dashboard,_components}/`).
- **JS:** zero new JS deps. The primitives are React 19
  Server Components (zero JS shipped to the client) and a
  handful of Client Components (`Combobox`, `Dialog`,
  `DashboardAccountPicker`, `DashboardMonthSwitcher`, the
  form submit-button state). The Client Components ship
  only the JS needed for their interactive behavior.

| Asset                       | Size budget (gzip) | Notes                                         |
| --------------------------- | ------------------ | --------------------------------------------- |
| `app/_ui/tokens.css`        | ≤ 1.5 KB           | CSS variables only.                           |
| `Combobox` Client Component | ≤ 3 KB             | Hand-built; no downshift dep.                 |
| `Dialog` Client Component   | ≤ 2 KB             | Wraps native `<dialog>`; minimal React state. |
| `DashboardAccountPicker`    | ≤ 1.5 KB           | `<Link>`-based; no client-side data fetching. |
| `DashboardMonthSwitcher`    | ≤ 1.5 KB           | `<Link>`-based; date math in pure function.   |
| Form submit-button state    | ≤ 1 KB             | `useActionState` is React built-in.           |
| Total Client Component JS   | ≤ 10 KB            | All Client Components combined, gzip.         |

The Server Components contribute zero JS to the client bundle.

### 10.2 Render performance

The dashboard's three parallel fetches
(`/api/reports/monthly?month=...`,
`/api/reports/breakdown?month=...`,
`/api/reports/accounts/:id/flow?month=...`) are
server-side `Promise.all` calls. The total wall time is
`max(t1, t2, t3)` not `t1 + t2 + t3`. The `/transactions`
page fetches `/api/transactions?include=accountName` (a
single call with an additional Prisma `findMany` for
account names); the wall time is bounded by the
`includeAccountName` branch's overhead (~ 10ms for the
`findMany` with a small IN clause).

The `/accounts` page fetches
`/api/accounts?include=lastActivity` (a single call with
an additional Prisma `groupBy` for last activity); the
wall time is bounded by the `groupBy` query's overhead
(~ 5-15ms for the `@@index([userId, transactionDate])`
scan).

### 10.3 Lighthouse / Perf budget verification

The verify gate (slice 6) runs Lighthouse CLI against
`pnpm build && pnpm start` under simulated 4G + Moto G4.
The output is pasted into `docs/perf/transactions-ui.md`.
The assertion is **p95 page load < 2s** on `/`,
`/dashboard`, and `/transactions`.

The budget is conservative: the v1 production UI ships
zero new JS deps, the bundle is < 10 KB gzipped for all
Client Components combined, and the page renders are
Server Components (no client-side data fetching for the
initial paint).

### 10.4 Code-splitting and RSC

Next.js 16 + React 19's Server Components already provide
automatic code-splitting at the route segment level. The
Client Components are loaded on demand when the page
hydrates. The form components (`CreateAccountForm`,
`CreateTransactionForm`, `TransactionDetailForms`) ship
their submit-button state as a small inline Client
Component inside an otherwise Server Component form; the
hydration boundary is the button only.

The `Combobox` and `Dialog` Client Components are loaded
only on the pages that use them (`/transactions/new` and
`/transactions/[id]`). The dashboard Client Components
(`DashboardAccountPicker`, `DashboardMonthSwitcher`) are
loaded only on `/dashboard`. No global Client Component
hydration.

### 10.5 No new dependencies, no bundle bloat

The proposal §"Affected areas" row for `package.json` says
**None** ("No new dependencies (BR-UI constraint)"). The
row for `pnpm-lock.yaml` says **None** ("No new dependencies
→ lockfile unchanged"). The verify gate asserts no
`pnpm-lock.yaml` drift after the change merges (root
`AGENTS.md` §5.3 + the project's Husky pre-commit check
at `scripts/check-lockfile.sh`).

---

## 11. Accessibility strategy

The accessibility strategy is the **WCAG 2.2 AA floor**
codified at REQ-UI-4 to REQ-UI-8 in the spec. The strategy
is implemented at four levels:

1. **Primitive-level a11y contract** — every primitive's
   props shape enforces the a11y contract at the TypeScript
   level (the `id` is required for `Input`, `Select`,
   `FormField`; the `caption` is required for `Table`; the
   `title` is required for `Dialog`; etc.).
2. **Per-primitive regression test** — every primitive has
   a test file that asserts the a11y contract (focus ring
   rendered, `aria-describedby` set when error present,
   `aria-sort` reflecting sort direction, etc.).
3. **Page-level axe-core integration test** — the verify
   gate (slice 5) runs axe-core on every page with seeded
   data. The assertion is `expect(await axe(container)).toHaveNoViolations()`
   with severity `critical` or `serious` failing the build.
4. **Manual QA checklist** — the user-owned manual QA
   checklist at `docs/qa/transactions-ui.md` covers
   keyboard navigation (Tab order, focus visible,
   Enter/Space activation, Escape to close dialogs) and
   screen reader run-through (VoiceOver on macOS, NVDA on
   Windows). The verify gate fails until the user signs
   off the checklist (REQ-UI-11).

### 11.1 ARIA patterns

The primitives use the following ARIA patterns (WAI-ARIA
Authoring Practices Guide):

| Primitive    | ARIA pattern                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `Button`     | `<button>` with `aria-busy="true"` + `aria-label` when icon-only                                                     |
| `Input`      | `<input>` with `aria-describedby` (when error) + `aria-invalid` (when error)                                         |
| `Select`     | Native `<select>` (no extra ARIA needed)                                                                             |
| `Combobox`   | WAI-ARIA 1.2 combobox pattern: `<select>` (semantic) + `<input>` (visual)                                            |
| `Checkbox`   | Native `<input type="checkbox">` (no extra ARIA needed)                                                              |
| `RadioGroup` | `<fieldset>` + `<legend>` + `<input type="radio">`                                                                   |
| `Dialog`     | WAI-ARIA dialog pattern: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` + `aria-describedby` + focus trap |
| `Table`      | `<table>` + `<caption>` + `<th scope="col">` + `aria-sort` on sortable columns                                       |
| `Pagination` | `<nav aria-label="Pagination">` + `<Link>` controls with `aria-label`                                                |
| `Breadcrumb` | `<nav aria-label="Breadcrumb">` + `<ol>` + `<Link>` items                                                            |
| `EmptyState` | `<div role="status">` (announces on navigation)                                                                      |
| `Spinner`    | `<div role="status">` + `aria-label` (default: "Loading")                                                            |
| `FieldError` | `<div role="alert">` + `aria-live="polite"` + `aria-atomic="true"`                                                   |
| `FormField`  | `<label htmlFor>` + sets `aria-describedby` + `aria-invalid` on children                                             |

### 11.2 Focus management

The focus management rules are:

1. **Visible focus indicator on every interactive primitive.**
   `focus-visible:ring-2 focus-visible:ring-ui-accent` (or
   `focus-visible:ring-ui-danger` for `Button variant="danger"`).
   The visual treatment MUST have a contrast ratio of at
   least 3:1 against the surrounding background (WCAG 2.4.7
   Focus Visible).
2. **Tab order follows visual order.** No `tabIndex`
   overrides; no `tabIndex={0}` on non-interactive elements.
3. **Skip-to-content link** on every page (Next.js App
   Router root layout ships this by convention; the
   production UI does not modify the root layout).
4. **Focus trap inside `Dialog` when open.** The native
   `<dialog>` element handles focus trap; the React state
   controls the `open` attribute.
5. **Focus return on `Dialog` close.** When `Dialog` closes,
   focus returns to the trigger element.
6. **No focus on `EmptyState` unless CTA is present.** The
   `EmptyState` is a passive status region; the CTA is the
   first focusable element when present.

### 11.3 Keyboard navigation

The keyboard navigation rules are:

1. **Tab** navigates forward; **Shift+Tab** navigates
   backward. Every interactive element is reachable.
2. **Enter** and **Space** activate the focused control.
3. **Escape** closes `Dialog` and `Combobox` dropdowns.
4. **ArrowDown / ArrowUp** navigate options inside
   `Combobox` and `RadioGroup`.
5. **Home / End** jump to the first / last option inside
   `Combobox`.
6. **Tab** from inside `Dialog` cycles through the dialog's
   focusable elements; tabbing past the last element
   wraps to the first.

The manual QA checklist (REQ-UI-11) verifies these keyboard
navigation rules on every page. The user signs off the
checklist before the verify gate passes.

### 11.4 Screen reader support

The screen reader support rules are:

1. **Landmarks** — every page has `<header>`, `<main>`,
   `<nav>` (where applicable), `<footer>` (where applicable).
   The `PageHeader` primitive renders `<header>`; the
   `Breadcrumb` and `Pagination` primitives render `<nav>`.
2. **Headings** — every page has one `<h1>` (the
   `PageHeader` title); section headings use `<h2>` (the
   `CardHeader` title); sub-headings use `<h3>`.
3. **Form labels** — every form field has a paired `<label
htmlFor="<id>">` (REQ-UI-5). Icon-only buttons carry
   `aria-label`.
4. **Table headers** — every `<th>` carries `scope="col"`
   (REQ-UI-8). Sortable columns carry `aria-sort` reflecting
   the current sort direction.
5. **Form errors** — every error has `role="alert"` and
   `aria-live="polite"` so screen readers announce the
   error on submit. The field's `aria-describedby` links
   to the error's `id`.
6. **Loading state** — the submit button's `aria-busy="true"`
   announces the in-flight state. The `Spinner` carries
   `role="status"` + `aria-label="Loading"`.

The manual QA checklist (REQ-UI-11) verifies these screen
reader support rules on VoiceOver (macOS) and NVDA (Windows).

### 11.5 axe-core integration tests

The verify gate (slice 5) runs axe-core on every page with
seeded data. The test assertion:

```typescript
// tests/a11y/accounts.test.tsx
import { axe } from 'vitest-axe';
import { render } from '@testing-library/react';
import AccountsPage from '../../app/accounts/page';

it('accounts page has no critical or serious axe violations', async () => {
  const { container } = render(<AccountsPage />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

The test fails on any `critical` or `serious` violation.
`moderate` and `minor` violations are logged but not
blocking (they are triaged as a backlog).

---

## 12. i18n strategy

The v1 production UI ships **mixed EN/ES copy** following
the existing project convention (the dashboard copy is
Spanish per the `reports` change; component-level UI text
is English). A follow-up `ui-i18n` change introduces a
message catalog.

### 12.1 Mixed EN/ES convention (v1)

The convention is:

- **Spanish copy** — dashboard-level labels
  (`Resumen mensual`, `Desglose por categoría`, `Flujo de
cuenta`), error messages (`Algo salió mal`, `No pudimos
cargar las cuentas`), and form field labels in the
  dashboard context.
- **English copy** — component-level UI text
  (`Cancel`, `Save`, `Edit`, `Delete`, `Loading`,
  `Previous page`, `Next page`), error messages from the
  API (the `error.message` from the `ErrorEnvelope` is in
  English per the existing API convention), and form field
  labels in the `accounts` and `transactions` contexts.

The convention is codified at the spec §Glossary
("Mixed EN/ES copy") and verified at the verify gate (the
manually-curated translation strings).

### 12.2 No message catalog in v1

The proposal §"Out of scope" item 3 ("i18n") explicitly
defers a message catalog to a follow-up `ui-i18n` change.
The v1 production UI hard-codes the English/Spanish strings
in the component source. A code-review check asserts that
no new i18n library is added (the v1 lockfile is
unchanged).

### 12.3 Strings to translate (v1 inventory)

The v1 string inventory (extracted from the proposal's
"Users and situations" table + the smoke page precedents):

| Context          | String                           | Language                  |
| ---------------- | -------------------------------- | ------------------------- |
| Dashboard        | `Resumen mensual`                | ES                        |
| Dashboard        | `Desglose por categoría`         | ES                        |
| Dashboard        | `Flujo de cuenta`                | ES                        |
| Dashboard        | `Algo salió mal`                 | ES                        |
| Dashboard        | `No pudimos cargar el dashboard` | ES                        |
| Dashboard        | `Sin datos`                      | ES                        |
| Dashboard        | `Registrar primera transacción`  | ES                        |
| Dashboard        | `Mes anterior`                   | ES                        |
| Dashboard        | `Mes siguiente`                  | ES                        |
| Accounts         | `Cancel`                         | EN                        |
| Accounts         | `Save`                           | EN                        |
| Accounts         | `Edit`                           | EN                        |
| Accounts         | `Delete`                         | EN                        |
| Accounts         | `Loading`                        | EN                        |
| Accounts         | `Account name`                   | EN                        |
| Accounts         | `Currency`                       | EN                        |
| Accounts         | `Casa`                           | EN                        |
| Accounts         | `Archived`                       | EN                        |
| Accounts         | `Last activity`                  | EN                        |
| Transactions     | `New transaction`                | EN                        |
| Transactions     | `Date`                           | EN                        |
| Transactions     | `Account`                        | EN                        |
| Transactions     | `Direction`                      | EN                        |
| Transactions     | `Income` / `Expense` (Badge)     | EN                        |
| Transactions     | `Native amount`                  | EN                        |
| Transactions     | `Converted amount`               | EN                        |
| Transactions     | `Rate as of`                     | EN                        |
| Transactions     | `Memo`                           | EN                        |
| Transactions     | `Category`                       | EN                        |
| Transactions     | `Delete transaction?`            | EN                        |
| Transactions     | `This action cannot be undone`   | EN                        |
| Error boundaries | `Algo salió mal`                 | ES (root) / EN (segments) |
| Error boundaries | `Reintentar` / `Retry`           | ES / EN                   |

The inventory is the seed for the follow-up `ui-i18n`
change's message catalog. The v1 production UI hard-codes
the strings; a future `ui-i18n` change extracts them to a
catalog with a `react-intl` (or similar) runtime.

---

## 13. Test strategy

The test strategy is the **strict TDD cycle** (RED → GREEN →
TRIANGULATE → REFACTOR) per `openspec/config.yaml:27-30`. The
runner is `pnpm test`. Every slice follows the per-slice
TDD plan codified at §14 below.

### 13.1 Test layers

| Layer                | What is tested                                                              | Test type                                                |
| -------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| Primitive unit       | Each primitive's render (primary, loading/disabled, empty state)            | Vitest + Testing Library + snapshot                      |
| Primitive a11y       | Each primitive's a11y contract (focus ring, `aria-*` attributes)            | Vitest + Testing Library (assertion)                     |
| Page integration     | Each page's render with seeded data (empty, populated, error states)        | Vitest + Testing Library + snapshot                      |
| Form integration     | Each form's submit flow (success, error, loading state)                     | Vitest + Testing Library + user-event                    |
| axe-core integration | Every page's accessibility (zero critical + serious violations)             | Vitest + `vitest-axe`                                    |
| Visual snapshot      | Every presentational primitive (Card, Badge, EmptyState, etc.)              | Vitest snapshot                                          |
| E2E happy paths      | Three flows (record expense, archive account, navigate to detail)           | Playwright (if runner added) or Vitest + Testing Library |
| Coverage gate        | ≥ 80% on `app/_ui/`, `app/accounts/`, `app/transactions/`, `app/dashboard/` | `pnpm test:coverage`                                     |

### 13.2 Coverage gate

The coverage gate is **≥ 80%** on every affected folder
(`app/_ui/`, `app/accounts/`, `app/transactions/`,
`app/dashboard/`, `app/_components/dashboard-*.tsx`). The
gate is enforced by `pnpm test:coverage:enforced` (the
project's existing coverage script).

The verify gate (slice 5) runs the coverage check; a slice
that fails the gate blocks the PR. Coverage gaps are flagged
with a TODO marker pointing to the uncovered branch (the
project's existing convention).

### 13.3 Snapshot tests

Snapshot tests are used for:

- Static presentational primitives (`Card`, `Badge`,
  `EmptyState`, `Skeleton`, `Breadcrumb`, `Pagination`).
- Page renders (the existing `page.test.tsx` files are
  extended; the existing `page.seeded.test.tsx` files are
  extended).
- Form components (empty state, populated state, error
  state, loading state).

Snapshot drift requires the explicit `--update` flag. The
verify gate fails on any unflagged snapshot drift.

### 13.4 axe-core integration tests

The axe-core integration tests live at `tests/a11y/`. Every
page is rendered with seeded data; the assertion is
`expect(await axe(container)).toHaveNoViolations()`. The
test fails on any `critical` or `serious` violation.

### 13.5 Visual snapshot tests

The visual snapshot tests live at `tests/visual/`. Every
presentational primitive is rendered in its empty state,
loading state, error state (where applicable), and
populated state. Snapshot files live at
`tests/visual/__snapshots__/`.

### 13.6 E2E happy paths

The E2E happy paths live at `tests/e2e/` (added if a
Playwright runner is in place; otherwise the smoke remains
Vitest + Testing Library). The three flows are:

1. Sign in → record a USD expense against an ARS casa →
   verify the dashboard reflects the converted amount.
2. Sign in → archive an account → verify it disappears
   from the active list and appears behind the `Archived`
   toggle.
3. Sign in → navigate to `/accounts/X` → verify the
   balance widget renders the casa-converted amount.

---

## 14. Slice plan with TDD per-task markers

The orchestrator pre-cached `chainedPrStrategy: auto-forecast`
and `reviewBudgetLines: 400`. Every slice MUST be a
self-contained PR with a clear start, finish, verification,
and rollback. Forecast lines are \*\*changed lines (additions

- deletions)** per slice. The TDD cycle per task is
  **RED → GREEN → TRIANGULATE → REFACTOR\*\*.

### 14.1 Slice 1 — `ui-primitives`

| Field             | Value                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch            | `feat/ui-primitives`                                                                                                                             |
| Scope             | `app/_ui/` (tokens.css + primitives/ + layout/) + co-located tests + `app/globals.css` import                                                    |
| Files (new)       | `app/_ui/tokens.css`, `app/_ui/index.ts`, `app/_ui/README.md`, all 18 primitives + their test files, 5 layout primitives + tests                 |
| Files (modified)  | `app/globals.css` (add `@import './_ui/tokens.css'`)                                                                                             |
| LoC low           | 380                                                                                                                                              |
| LoC high          | 480                                                                                                                                              |
| Verification gate | `pnpm test app/_ui` exits 0; coverage ≥ 80% on `app/_ui/`; snapshot tests stable; no new dep (`pnpm-lock.yaml` unchanged); zero `dark:` variants |
| Rollback          | `git revert <merge-sha>`; the new `app/_ui/` folder is unused until slice 2; no breaking change to the smoke pages                               |
| Follow-up         | Slice 2 (`accounts-ui`) consumes the primitives; no external dependency on slice 1 after merge                                                   |

**Commit plan** (atomic, conventional; mirrors the
work-unit-commits pattern):

1. `feat(ui-primitives): tokens.css with light + dark CSS scope`
   — adds the token table at `app/_ui/tokens.css` (≤ 60 lines).
2. `feat(ui-primitives): globals.css imports tokens.css`
   — adds the `@import` directive.
3. `test(ui-primitives): Button renders primary variant RED`
   — write the first failing test for the design-system.
4. `feat(ui-primitives): Button primitive + test` (GREEN).
5. `feat(ui-primitives): Input primitive + test`
6. `feat(ui-primitives): Textarea primitive + test`
7. `feat(ui-primitives): Select primitive + test`
8. `feat(ui-primitives): Checkbox primitive + test`
9. `feat(ui-primitives): RadioGroup primitive + test`
10. `test(ui-primitives): Combobox Client Component RED`
    — first failing test for the Client Component.
11. `feat(ui-primitives): Combobox primitive + test` (GREEN).
12. `feat(ui-primitives): FieldError primitive + test`
13. `feat(ui-primitives): FormField primitive + test`
    — composes Label + control + FieldError.
14. `feat(ui-primitives): Card + CardHeader + CardBody + CardFooter primitives + test`
    — compound component pattern.
15. `feat(ui-primitives): Table + TableHeader + TableBody + TableRow + TableCell primitives + test`
    — compound component pattern with `caption`, `scope`, `aria-sort`.
16. `feat(ui-primitives): Badge primitive + test`
17. `feat(ui-primitives): EmptyState primitive + test`
18. `feat(ui-primitives): Spinner primitive + test`
19. `feat(ui-primitives): Skeleton primitive + test`
20. `feat(ui-primitives): Pagination primitive + test`
21. `test(ui-primitives): Dialog Client Component RED`
22. `feat(ui-primitives): Dialog primitive + test` (GREEN).
23. `feat(ui-primitives): Breadcrumb primitive + test`
24. `feat(ui-primitives): Link primitive + test`
25. `feat(ui-primitives): PageHeader + PageContainer + BreadcrumbBar layout primitives + test`
26. `feat(ui-primitives): README.md internal overview`
27. `docs(ui-primitives): design + Spanish mirror` — already
    shipped in this design phase; no commit needed.

**TDD cycle for commit #3** (the first primitive test). See
§15.1 below.

### 14.2 Slice 2 — `accounts-ui`

| Field             | Value                                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch            | `feat/ui-accounts`                                                                                                                                                                                                                  |
| Scope             | `app/accounts/{page.tsx, [id]/page.tsx, new/page.tsx}` + `app/accounts/error.tsx` + `app/accounts/accounts-list-table.tsx` + `app/accounts/[id]/account-detail.tsx` + `app/accounts/new/create-account-form.tsx` + co-located tests |
| Files (modified)  | All `app/accounts/**` pages and components                                                                                                                                                                                          |
| Files (new)       | `app/accounts/error.tsx`, extended tests                                                                                                                                                                                            |
| LoC low           | 240                                                                                                                                                                                                                                 |
| LoC high          | 360                                                                                                                                                                                                                                 |
| Verification gate | `pnpm test app/accounts` exits 0; coverage ≥ 80% on `app/accounts/`; axe-core zero critical + serious violations; keyboard + screen-reader manual pass documented in QA checklist                                                   |
| Rollback          | `git revert <merge-sha>`; the production renders fall back to the smoke pages (the file-level `// smoke-minimal, not production` marker is preserved in git history)                                                                |
| Follow-up         | Slice 3 (`transactions-ui`) consumes the same primitives; no external dependency on slice 2 after merge                                                                                                                             |

**Commit plan**:

1. `feat(ui-accounts): error.tsx segment boundary + test`
2. `test(ui-accounts): accounts-list-table sort + archived toggle RED`
3. `feat(ui-accounts): accounts-list-table production render` (GREEN)
4. `test(ui-accounts): account-detail Card layout RED`
5. `feat(ui-accounts): account-detail production render` (GREEN)
6. `test(ui-accounts): create-account-form inline validation RED`
7. `feat(ui-accounts): create-account-form production form` (GREEN)
8. `feat(ui-accounts): accounts/page.tsx production render`
9. `feat(ui-accounts): accounts/[id]/page.tsx production render`
10. `feat(ui-accounts): accounts/new/page.tsx production render`
11. `docs(ui-accounts): design + Spanish mirror` — already shipped.

**TDD cycle for commit #2** (the accounts-list-table sort).
See §15.2 below.

### 14.3 Slice 3 — `transactions-ui`

| Field             | Value                                                                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch            | `feat/ui-transactions`                                                                                                                                                                                                                                                   |
| Scope             | `app/transactions/{page.tsx, [id]/page.tsx, new/page.tsx}` + `app/transactions/error.tsx` + `app/transactions/[id]/transaction-detail-forms.tsx` + `app/transactions/new/create-transaction-form.tsx` + `app/_components/transactions-list-table.tsx` + co-located tests |
| Files (modified)  | All `app/transactions/**` pages and components                                                                                                                                                                                                                           |
| Files (new)       | `app/transactions/error.tsx`, `app/transactions/[id]/transaction-detail-forms.test.tsx`, `app/_components/transactions-list-table.test.tsx`                                                                                                                              |
| LoC low           | 320                                                                                                                                                                                                                                                                      |
| LoC high          | 460                                                                                                                                                                                                                                                                      |
| Verification gate | `pnpm test app/transactions app/_components` exits 0; coverage ≥ 80% on `app/transactions/`; axe-core zero critical + serious; FX snapshot unchanged on memo-only edit (verified by integration test)                                                                    |
| Rollback          | `git revert <merge-sha>`; the production renders fall back to the smoke pages                                                                                                                                                                                            |
| Follow-up         | Slice 4 (`dashboard-ui-refactor`) consumes the same primitives + the new Combobox for the form                                                                                                                                                                           |

**Commit plan**:

1. `feat(ui-transactions): error.tsx segment boundary + test`
2. `test(ui-transactions): transactions-list-table sort + pagination RED`
3. `feat(ui-transactions): transactions-list-table production render` (GREEN)
4. `test(ui-transactions): transaction-detail-forms Card layout + Dialog RED`
5. `feat(ui-transactions): transaction-detail-forms production render` (GREEN)
6. `test(ui-transactions): create-transaction-form Combobox + inline validation RED`
7. `feat(ui-transactions): create-transaction-form production form` (GREEN)
8. `feat(ui-transactions): transactions/page.tsx production render`
9. `feat(ui-transactions): transactions/[id]/page.tsx production render`
10. `feat(ui-transactions): transactions/new/page.tsx production render`
11. `docs(ui-transactions): design + Spanish mirror` — already shipped.

**TDD cycle for commit #2** (the transactions-list-table
sort + pagination). See §15.3 below.

### 14.4 Slice 4 — `dashboard-ui-refactor`

| Field             | Value                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch            | `feat/ui-dashboard-refactor`                                                                                                                                                                                                                                                                                                    |
| Scope             | `app/dashboard/page.tsx` + `app/dashboard/error.tsx` + `app/_components/dashboard-account-picker.tsx` + `app/_components/dashboard-month-switcher.tsx` + `app/_components/dashboard-monthly-summary.tsx` + `app/_components/dashboard-category-breakdown.tsx` + `app/_components/dashboard-account-flow.tsx` + co-located tests |
| Files (modified)  | All dashboard pages and components                                                                                                                                                                                                                                                                                              |
| Files (new)       | `app/dashboard/error.tsx`, `app/_components/dashboard-account-picker.tsx` (+ test), `app/_components/dashboard-month-switcher.tsx` (+ test)                                                                                                                                                                                     |
| LoC low           | 220                                                                                                                                                                                                                                                                                                                             |
| LoC high          | 340                                                                                                                                                                                                                                                                                                                             |
| Verification gate | `pnpm test app/dashboard app/_components` exits 0; coverage ≥ 80% on `app/dashboard/` and `app/_components/`; empty-state + account-picker + month-switcher verified by integration tests                                                                                                                                       |
| Rollback          | `git revert <merge-sha>`; the dashboard route falls back to the smoke render                                                                                                                                                                                                                                                    |
| Follow-up         | Slice 5 (`integration-tests`) adds axe-core + visual snapshot + e2e tests                                                                                                                                                                                                                                                       |

**Commit plan**:

1. `feat(ui-dashboard-refactor): error.tsx segment boundary + test`
2. `test(ui-dashboard-refactor): dashboard-account-picker Client Component RED`
3. `feat(ui-dashboard-refactor): dashboard-account-picker` (GREEN)
4. `test(ui-dashboard-refactor): dashboard-month-switcher Client Component RED`
5. `feat(ui-dashboard-refactor): dashboard-month-switcher` (GREEN)
6. `test(ui-dashboard-refactor): dashboard page with ?accountId RED`
7. `feat(ui-dashboard-refactor): dashboard-monthly-summary Card render` (GREEN)
8. `feat(ui-dashboard-refactor): dashboard-category-breakdown Card render`
9. `feat(ui-dashboard-refactor): dashboard-account-flow Card render`
10. `feat(ui-dashboard-refactor): dashboard/page.tsx with ?accountId + ?month searchParams`
11. `docs(ui-dashboard-refactor): design + Spanish mirror` — already shipped.

**TDD cycle for commit #2** (the dashboard-account-picker
Client Component). See §15.4 below.

### 14.5 Slice 5 — `integration-tests`

| Field             | Value                                                                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch            | `feat/ui-integration-tests`                                                                                                                                                                                                                                                                                  |
| Scope             | `tests/a11y/` + `tests/visual/` + `tests/e2e/` (if Playwright runner added)                                                                                                                                                                                                                                  |
| Files (new)       | `tests/a11y/{accounts,transactions,dashboard}.test.tsx`, `tests/visual/{card,badge,empty-state,skeleton,breadcrumb,pagination,dialog,combobox,button,input,select,textarea,field-error}.test.tsx`, `tests/e2e/{record-expense,archive-account,navigate-to-detail}.test.tsx` (or `.test.ts` if no Playwright) |
| LoC low           | 200                                                                                                                                                                                                                                                                                                          |
| LoC high          | 320                                                                                                                                                                                                                                                                                                          |
| Verification gate | `pnpm test tests/a11y tests/visual` exits 0; axe-core zero critical + serious; visual snapshots stable; e2e happy paths green (if Playwright runner added)                                                                                                                                                   |
| Rollback          | `git revert <merge-sha>`; the existing per-primitive + per-page tests remain; the new integration suite is additive                                                                                                                                                                                          |
| Follow-up         | Slice 6 (`docs-and-perf`) adds the design-system reference + QA checklist + perf budget verification                                                                                                                                                                                                         |

**Commit plan**:

1. `test(integration-tests): axe-core suite scaffold`
2. `test(integration-tests): accounts page axe-core RED`
3. `feat(integration-tests): accounts page axe-core green` (GREEN)
4. `feat(integration-tests): transactions page axe-core green`
5. `feat(integration-tests): dashboard page axe-core green`
6. `test(integration-tests): visual snapshot scaffold`
7. `feat(integration-tests): card visual snapshot`
8. `feat(integration-tests): badge visual snapshot`
9. `feat(integration-tests): empty-state visual snapshot`
10. `feat(integration-tests): skeleton visual snapshot`
11. `feat(integration-tests): breadcrumb visual snapshot`
12. `feat(integration-tests): pagination visual snapshot`
13. `feat(integration-tests): dialog visual snapshot`
14. `feat(integration-tests): combobox visual snapshot`
15. `feat(integration-tests): button visual snapshot`
16. `feat(integration-tests): input visual snapshot`
17. `feat(integration-tests): select visual snapshot`
18. `feat(integration-tests): textarea visual snapshot`
19. `feat(integration-tests): field-error visual snapshot`
20. `test(integration-tests): e2e happy paths (record expense) RED`
21. `feat(integration-tests): e2e happy paths (record expense)` (GREEN)
22. `feat(integration-tests): e2e happy paths (archive account)`
23. `feat(integration-tests): e2e happy paths (navigate to detail)`

### 14.6 Slice 6 — `docs-and-perf`

| Field             | Value                                                                                                                                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch            | `feat/ui-docs-and-perf`                                                                                                                                                                                                                                                                |
| Scope             | `docs/architecture/ui.md` + `docs/qa/transactions-ui.md` + `docs/perf/transactions-ui.md` + `Documents-es/docs/{architecture,qa,perf}/` mirrors + `CHANGELOG.md` + `openspec/specs/ui/spec.md` (created by `sdd-archive`) + `openspec/specs/transactions/spec.md` (REQ-TX-15 REPLACED) |
| Files (new)       | `docs/architecture/ui.md` (+ ES mirror), `docs/qa/transactions-ui.md` (+ ES mirror), `docs/perf/transactions-ui.md` (+ ES mirror)                                                                                                                                                      |
| Files (modified)  | `CHANGELOG.md` (`## [Unreleased]` → Added section); `openspec/specs/ui/spec.md` (created); `openspec/specs/transactions/spec.md` (REQ-TX-15 replaced)                                                                                                                                  |
| LoC low           | 160                                                                                                                                                                                                                                                                                    |
| LoC high          | 260                                                                                                                                                                                                                                                                                    |
| Verification gate | `docs/architecture/ui.md` + `docs/qa/transactions-ui.md` + `docs/perf/transactions-ui.md` exist; Lighthouse p95 < 2s on `/`, `/dashboard`, `/transactions`; `CHANGELOG.md` `## [Unreleased]` is current; `sdd-archive` promotes the delta specs to canonical                           |
| Rollback          | `git revert <merge-sha>`; the docs + perf artifacts are additive; no production code is reverted                                                                                                                                                                                       |
| Follow-up         | `sdd-archive` lifts the delta specs to canonical; release flow (develop → main) per root `AGENTS.md` §5.5                                                                                                                                                                              |

**Commit plan**:

1. `docs(docs-and-perf): docs/architecture/ui.md design-system reference`
2. `docs(docs-and-perf): Documents-es/docs/architecture/ui.md mirror`
3. `docs(docs-and-perf): docs/qa/transactions-ui.md manual QA checklist`
4. `docs(docs-and-perf): Documents-es/docs/qa/transactions-ui.md mirror`
5. `docs(docs-and-perf): docs/perf/transactions-ui.md Lighthouse output`
6. `docs(docs-and-perf): Documents-es/docs/perf/transactions-ui.md mirror`
7. `docs(docs-and-perf): CHANGELOG.md [Unreleased] section`
8. `feat(docs-and-perf): sdd-archive promotes ui spec to canonical`
9. `feat(docs-and-perf): sdd-archive replaces REQ-TX-15 with ui reference`

---

## 15. TDD plan per slice — RED → GREEN → TRIANGULATE → REFACTOR

Strict TDD per `openspec/config.yaml:27-30`. Every slice's
first test-driven commit follows the cycle below. The
TDD markers are the per-task sub-section headers in the
slice's commit plan (§14).

### 15.1 Slice 1 — `Button` primitive

**RED.** Write the failing test first:

```typescript
// app/_ui/primitives/button.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders a primary button with the children text', () => {
    render(<Button variant="primary">Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('bg-ui-accent');
    expect(button).toHaveClass('text-ui-accent-fg');
  });
});
```

The test fails because `Button` does not exist yet.

**GREEN.** Implement the minimum:

```tsx
// app/_ui/primitives/button.tsx
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './_shared/cx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  isLoading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-ui-accent text-ui-accent-fg hover:bg-ui-accent/90',
  secondary: 'bg-ui-bg-muted text-ui-fg hover:bg-ui-bg-subtle border border-ui-border',
  ghost: 'bg-transparent text-ui-fg hover:bg-ui-bg-muted',
  danger: 'bg-ui-danger text-ui-danger-fg hover:bg-ui-danger/90',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      isLoading,
      iconLeft,
      iconRight,
      className,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading ? 'true' : undefined}
        className={cx(
          'inline-flex items-center justify-center gap-2 rounded-ui-md px-4 py-2 ui-font-medium',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantClasses[variant],
          className,
        )}
        {...props}
      >
        {isLoading && <Spinner aria-label="Loading" size="sm" />}
        {!isLoading && iconLeft}
        {children}
        {!isLoading && iconRight}
      </button>
    );
  },
);
Button.displayName = 'Button';
```

**TRIANGULATE.** Add tests for:

- Secondary variant renders `bg-ui-bg-muted`.
- Ghost variant renders `bg-transparent`.
- Danger variant renders `bg-ui-danger`.
- Loading state renders `Spinner` + `disabled` + `aria-busy="true"`.
- Disabled state renders `disabled` (no loading state).
- Custom `className` is appended.

**REFACTOR.** Extract the variant class map to a constant;
extract the loading state markup to a helper. Re-run tests;
all green.

### 15.2 Slice 2 — `accounts-list-table` sort + archived toggle

**RED.** Write the failing test first:

```typescript
// app/accounts/accounts-list-table.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountsListTable } from './accounts-list-table';

describe('AccountsListTable', () => {
  it('renders one row per account sorted by name ascending by default', () => {
    const accounts = [
      { id: 'a', name: 'Banana', currency: 'ARS', casa: 'oficial', archivedAt: null, lastActivityAt: null },
      { id: 'b', name: 'Apple', currency: 'USD', casa: 'oficial', archivedAt: null, lastActivityAt: null },
    ];
    render(<AccountsListTable accounts={accounts} />);
    const rows = screen.getAllByRole('row');
    // header row + 2 data rows
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('Apple')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Banana')).toBeInTheDocument();
  });
});
```

The test fails because the production `AccountsListTable`
does not exist yet (the smoke version is a hand-written
`<table>` without sort).

**GREEN.** Implement the minimum:

```tsx
// app/accounts/accounts-list-table.tsx
'use client'; // Required for the sort handler + archived toggle state

import { useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableCell, Badge } from '../_ui/primitives/table';
import type { FinancialAccountWire } from '../_lib/account-types';

interface AccountsListTableProps {
  accounts: readonly FinancialAccountWire[];
}

type SortKey = 'name' | 'currency' | 'lastActivityAt';

export function AccountsListTable({ accounts }: AccountsListTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showArchived, setShowArchived] = useState(false);

  const filtered = showArchived ? accounts : accounts.filter((a) => a.archivedAt === null);
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  return (
    <Table caption="Accounts list" hideCaption>
      <TableHeader
        columns={[
          {
            key: 'name',
            label: 'Name',
            sortable: true,
            sortDirection:
              sortKey === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none',
            onSort: () => {
              setSortKey('name');
              setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
            },
          },
          {
            key: 'currency',
            label: 'Currency',
            sortable: true,
            sortDirection:
              sortKey === 'currency' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none',
            onSort: () => {
              setSortKey('currency');
              setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
            },
          },
          {
            key: 'lastActivityAt',
            label: 'Last activity',
            sortable: true,
            sortDirection:
              sortKey === 'lastActivityAt'
                ? sortDir === 'asc'
                  ? 'ascending'
                  : 'descending'
                : 'none',
            onSort: () => {
              setSortKey('lastActivityAt');
              setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
            },
          },
          { key: 'archived', label: 'Archived' },
        ]}
      />
      <TableBody>
        {sorted.map((account) => (
          <TableRow key={account.id}>
            <TableCell>{account.name}</TableCell>
            <TableCell>{account.currency}</TableCell>
            <TableCell>
              {account.lastActivityAt ? new Date(account.lastActivityAt).toLocaleDateString() : '—'}
            </TableCell>
            <TableCell>
              {account.archivedAt !== null && <Badge variant="neutral">Archived</Badge>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

**TRIANGULATE.** Add tests for:

- Toggling `Show archived` reveals archived accounts.
- Clicking the `Name` sort header reverses the sort.
- Clicking the `Last activity` sort header sorts by `lastActivityAt`.
- Empty list renders `EmptyState`.
- The `Last activity` column shows `—` when `lastActivityAt` is `null`.

**REFACTOR.** Extract the sort comparator to a helper;
extract the toggle to a sibling `<label>` + `<input
type="checkbox">`. Re-run tests; all green.

### 15.3 Slice 3 — `transactions-list-table` sort + pagination

**RED.** Write the failing test first:

```typescript
// app/_components/transactions-list-table.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TransactionsListTable } from './transactions-list-table';

describe('TransactionsListTable', () => {
  it('renders one row per transaction sorted by transactionDate descending by default', () => {
    const transactions = [
      { id: 'a', direction: 'EXPENSE', amountMinor: 1000, currency: 'ARS', transactionDate: '2026-06-10T00:00:00Z', accountName: 'Main ARS' },
      { id: 'b', direction: 'INCOME', amountMinor: 5000, currency: 'USD', transactionDate: '2026-06-15T00:00:00Z', accountName: 'Main USD' },
    ];
    render(<TransactionsListTable transactions={transactions} />);
    const rows = screen.getAllByRole('row');
    // header row + 2 data rows
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('2026-06-15')).toBeInTheDocument();
    expect(within(rows[2]).getByText('2026-06-10')).toBeInTheDocument();
  });
});
```

The test fails because the production
`TransactionsListTable` does not exist yet (the smoke version
is a hand-written `<table>` without sort).

**GREEN.** Implement the minimum:

```tsx
// app/_components/transactions-list-table.tsx
'use client';

import { useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableCell, Badge } from '../_ui/primitives/table';
import type { TransactionDTO } from '../_lib/transaction-types';

interface TransactionsListTableProps {
  transactions: readonly TransactionDTO[];
}

type SortKey = 'transactionDate' | 'amountMinor' | 'convertedAmountMinor';

export function TransactionsListTable({ transactions }: TransactionsListTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('transactionDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = [...transactions].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  // ... render the table with the sorted rows + sortable headers
}
```

**TRIANGULATE.** Add tests for:

- Clicking the `Date` sort header reverses the sort.
- Clicking the `Native amount` sort header sorts numerically.
- Direction badges render `INCOME` as `success` and `EXPENSE`
  as `danger`.
- `accountName` is rendered when `?include=accountName` is
  used (the row data carries the field).
- Pagination renders `Previous page` / `Next page` links
  when `nextCursor` is provided.

**REFACTOR.** Extract the sort comparator; extract the
direction-badge variant lookup to a constant. Re-run tests;
all green.

### 15.4 Slice 4 — `DashboardAccountPicker` Client Component

**RED.** Write the failing test first:

```typescript
// app/_components/dashboard-account-picker.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardAccountPicker } from './dashboard-account-picker';

describe('DashboardAccountPicker', () => {
  it('renders a link per account with the account name', () => {
    const accounts = [
      { id: 'a', name: 'Main ARS' },
      { id: 'b', name: 'Main USD' },
    ];
    render(<DashboardAccountPicker accounts={accounts} currentAccountId={null} />);
    expect(screen.getByRole('link', { name: 'Main ARS' })).toHaveAttribute('href', '/dashboard?accountId=a');
    expect(screen.getByRole('link', { name: 'Main USD' })).toHaveAttribute('href', '/dashboard?accountId=b');
  });
});
```

The test fails because `DashboardAccountPicker` does not
exist yet (the smoke dashboard has no account picker).

**GREEN.** Implement the minimum:

```tsx
// app/_components/dashboard-account-picker.tsx
'use client';

import Link from 'next/link';
import type { FinancialAccountWire } from '../_lib/account-types';

interface DashboardAccountPickerProps {
  accounts: readonly Pick<FinancialAccountWire, 'id' | 'name'>[];
  currentAccountId: string | null;
}

export function DashboardAccountPicker({
  accounts,
  currentAccountId,
}: DashboardAccountPickerProps) {
  return (
    <nav aria-label="Account picker" className="flex gap-2">
      {accounts.map((account) => (
        <Link
          key={account.id}
          href={`/dashboard?accountId=${account.id}`}
          aria-current={currentAccountId === account.id ? 'page' : undefined}
          className="rounded-ui-md px-3 py-1 ui-font-medium hover:bg-ui-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent"
        >
          {account.name}
        </Link>
      ))}
    </nav>
  );
}
```

**TRIANGULATE.** Add tests for:

- `aria-current="page"` is set on the currently-selected
  account.
- Empty accounts list renders nothing (no nav).
- The picker is keyboard-navigable (Tab + Enter activates the
  link).

**REFACTOR.** No refactor needed for v1; the picker is a
thin `<Link>` wrapper.

---

## 16. Risks and deviations

The change carries six known risks and three deviations from
the spec that the orchestrator cache baked in. Each is
documented with a mitigation; none is a §10.3 anti-pattern.

### 16.1 Token-table fragmentation

**Risk.** The token table at `app/_ui/tokens.css` fragments
across the six slices as new primitives are added, breaking
the design-system claim that the token table is the single
source of styling.

**Mitigation.** Slice 1 (`ui-primitives`) is the ONLY slice
that touches `app/_ui/`. Slices 2-5 import from the
primitives; they do NOT extend the token table or duplicate
primitives. The verify gate asserts that every primitive
used by the production UI is declared in `app/_ui/`
(slice 6 docs the inventory in `docs/architecture/ui.md`).

**Likelihood.** Medium. **Severity.** Medium.

### 16.2 Sort + cursor pagination regression

**Risk.** The new sort + cursor pagination on
`/api/transactions` regresses the existing API contract.

**Mitigation.** The sort is a pure client-side concern over
the existing `GET /api/transactions` page; the API contract
is unchanged (REQ-UI-2's `include=accountName` is additive).
The cursor is the existing `nextCursor` field. The verify
gate re-runs the smoke flow against the new UI (slice 5's
E2E happy path #1).

**Likelihood.** Low. **Severity.** High (data correctness).

### 16.3 Combobox hand-built vs. library

**Risk.** The hand-built `Combobox` primitive on `<select>` +
`<input>` proves limiting for the create-transaction form's
account selection (search by name, keyboard navigation,
screen reader support).

**Mitigation.** The proposal §"Alternatives considered"
item 2 explicitly chose hand-built over Radix / downshift
for v1. The v1 surface is minimal (account selection in
the create-transaction form only). A future
`ui-complex-widgets` change introduces a vetted combobox
primitive (Radix is the first candidate). The verify gate
asserts the v1 combobox passes axe-core with zero critical

- serious violations.

**Likelihood.** Low. **Severity.** Low.

### 16.4 axe-core flags a violation the smoke page did not

**Risk.** The axe-core suite (slice 5) flags a violation
the smoke pages did not have (the smoke pages' `<table>` +
`<form>` markup may not have been audited with axe-core).

**Mitigation.** The verify gate is set to `critical` +
`serious` zero. `moderate` + `minor` are logged but not
blocking; the user triages them. A `docs/qa/transactions-ui.md`
checklist captures the residual items as a backlog.

**Likelihood.** Medium. **Severity.** Medium.

### 16.5 p95 < 2s not met on the dashboard

**Risk.** The dashboard's three parallel fetches
(`/api/reports/monthly`, `/api/reports/breakdown`,
`/api/reports/accounts/:id/flow`) blow the p95 < 2s
budget under simulated 4G + Moto G4.

**Mitigation.** The three fetches are already parallelized
(existing `Promise.all` in the dashboard). The page is a
Server Component; the parallel fetch is on the server, not
the client. The verify gate runs Lighthouse against the
production build; if the budget fails, the orchestrator
splits the dashboard's three calls into two chunks
(summary + breakdown; flow on demand) without breaking the
UI contract.

**Likelihood.** Medium. **Severity.** Medium.

### 16.6 Manual QA owner is the user

**Risk.** The user-owned manual QA checklist at
`docs/qa/transactions-ui.md` is not signed off in time for
the verify gate.

**Mitigation.** The proposal §"Open questions" Q4 explicitly
locks the manual QA owner as the user; the verify gate fails
until the checklist is signed off (REQ-UI-11). The
checklist is structured to be runnable in 30-45 minutes
(per the `docs/qa/transactions-ui.md` outline). The slice 6
PR includes a placeholder sign-off section for the user to
fill in.

**Likelihood.** Medium. **Severity.** Low (the verify gate
fails until the user signs off; the PR is the gate).

### 16.7 Carry-over BRs by reference (deviation from spec)

**Deviation.** The spec codifies BR-UI-1 to BR-UI-9 as new
business rules. The design carries BR-TX-4, BR-ACC-12, and
BR-RPT-7 by **reference** rather than inlining their text
(matching the repo convention at
`openspec/changes/transactions/specs/transactions/spec.md`
§"Carried from other capabilities").

**Rationale.** This matches the repo convention. The design
carries the same convention in its "Carried BRs" callouts
(§4.4). This is an intentional convention, NOT a §10.3
anti-pattern. Flagging here so the reviewer does not flag it
as drift.

### 16.8 Two additive query flags = two new server-side queries (deviation)

**Deviation.** The spec describes the two additive query
flags (`include=lastActivity`, `include=accountName`) as
additive on the existing GET endpoints. The design introduces
two new server-side queries (`loadLastActivityAt` via
`prisma.transaction.groupBy`; `loadAccountNames` via
`prisma.financialAccount.findMany`).

**Rationale.** The spec's "byte-identical without the flag"
contract requires the handler to NOT execute the new query
when the flag is absent (the verify gate asserts this). The
new queries are bounded by the existing indexes
(`@@index([userId, transactionDate])` on `Transaction`;
primary key on `FinancialAccount`). The performance budget
is documented at §10.

### 16.9 CardHeader renders <h2> by default (deviation)

**Deviation.** The proposal §"Slice 1" item 2 describes
`Card` as a generic container. The design makes
`CardHeader.title` render `<h2>` by default.

**Rationale.** The page-level `<h1>` lives in `PageHeader`;
the card-level `<h2>` lives in `CardHeader`. The semantic
hierarchy (`<h1>` page title → `<h2>` card title) is the
screaming-architecture fit. If a card needs an `<h3>`, the
caller passes `as="h3"` (the only boolean-prop escape hatch
on the design-system primitives; all other primitives use
compound composition). The CardHeader's default `<h2>` is
codified at §3.2.4 above.

### 16.10 Strict TDD risk (carried from precedent)

**Risk.** Strict TDD's RED step is easy to skip under time
pressure. The risk is that the implementation lands with a
non-red test or with tests written after the code.

**Mitigation.**

- `sdd-tasks` owns task structure; the tasks document the
  per-commit RED test before the GREEN implementation.
- `sdd-apply` enforces RED → GREEN → TRIANGULATE → REFACTOR
  per task per `openspec/config.yaml:27-30` and the
  `~/.pi/agent/gentle-ai/support/strict-tdd.md` reference.
- The PR template (`.github/pull_request_template.md`)
  requires the reviewer to confirm the RED commit landed
  before the GREEN commit.

---

## 17. Open questions for the user

**None.** The four open questions from the proposal
(`openspec/changes/transactions-ui/proposal.md` §"Open
questions" Q1-Q4) are locked at the pre-spec session:

- Q1 (additive query flags, no backward-compat break) →
  codified at REQ-UI-1 and REQ-UI-2.
- Q2 (hand-built Combobox, no new dep) → codified at
  §"Capability boundary" in the `ui` spec.
- Q3 (light theme only, dark tokens declared but unused) →
  codified at REQ-UI-9.
- Q4 (manual QA owner is the user) → codified at REQ-UI-11.

The three orchestrator corrections baked into this design
are:

1. **Dark tokens declared, light theme rendered.** The
   token table declares dark-mode CSS custom properties
   under `[data-theme='dark']` but the v1 production UI
   never sets that attribute (REQ-UI-9, §3.1 above).
2. **Two additive query flags = two new server-side queries.**
   The flags are additive; the new queries are bounded by
   existing indexes (§6.3, §16.8 above).
3. **Every Client Component is opted-in.** The
   `'use client'` directive is explicit at the top of every
   Client Component file (Combobox, Dialog, the submit-button
   state inside form components, the dashboard query-param
   state components). The default is Server Component
   (§5 above).

No new questions for the user. The design is ready for
`sdd-tasks`.

---

## 18. Cross-references

- **Proposal**: `openspec/changes/transactions-ui/proposal.md`
  — the upstream change. BR-UI-1 to BR-UI-9, the four
  locked open questions, the six-slice forecast, the
  alternatives considered.
- **Spec (delta, ui)**:
  `openspec/changes/transactions-ui/specs/ui/spec.md` —
  REQ-UI-1 to REQ-UI-11; the `ui` capability spec promoted
  to canonical by `sdd-archive`.
- **Spec (delta, transactions)**:
  `openspec/changes/transactions-ui/specs/transactions/spec.md`
  — REQ-TX-15 REPLACED by reference to `ui/spec.md`.
- **Spec (canonical, ui, post-archive)**:
  `openspec/specs/ui/spec.md` — promoted by `sdd-archive`
  (slice 6 deliverable).
- **Spec (canonical, transactions, post-archive)**:
  `openspec/specs/transactions/spec.md` — REQ-TX-15 replaced
  by the `ui/spec.md` reference; `sdd-archive` lifts the
  delta.
- **Reports design (precedent)**:
  `openspec/changes/archive/2026-06-27-reports/design.md` —
  structural template for the design artifact; module
  structure pattern; composition-root convention; TDD
  per-task markers.
- **Transactions spec (carried BRs)**:
  `openspec/specs/transactions/spec.md` — BR-TX-4 (userId
  scoping), BR-TX-7 (hard delete), REQ-TX-15 (replaced).
- **Accounts spec (carried BRs)**:
  `openspec/specs/accounts/spec.md` — BR-ACC-12
  (display-only FX), BR-ACC-14 to BR-ACC-19 (smoke slice).
- **Reports spec (carried BRs)**:
  `openspec/specs/reports/spec.md` — BR-RPT-7 (Server
  Component auth gate), the three report DTOs.
- **FX spec (carried BRs)**:
  `openspec/specs/fx/spec.md` — BR-FX-3 (casa resolution),
  BR-ACC-13 (stale FX).
- **Auth spec (carried BR)**:
  `openspec/specs/auth/spec.md` — `auth()` Server Component
  helper invariant, userId scoping, no AI attribution.
- **Error envelope**:
  `src/shared/errors/app-error.ts` — the wire shape the UI
  surfaces (no new error codes; the existing enum covers
  every surface).
- **Hono endpoints (stable inputs)**:
  - `app/api/[...path]/route.ts:7-25` — the protected
    catch-all the dashboard and form actions consume.
  - The two additive query flags do NOT change the
    endpoints' route shape; they augment the response shape
    additively.
- **Composition root**: `src/composition/build-app-deps.ts`,
  `src/composition/create-hono-app.ts` — UNCHANGED. The UI
  does not modify the Hono composition.
- **Stack**: v3 — Next.js 16 + Node 20 + React 19 + Hono
  catch-all + Auth.js v5 + Prisma 6 + PostgreSQL (Neon) +
  Zod + Vitest + Testing Library + pnpm + Tailwind v4.
- **Preflight**: interactive · `both` (Engram + OpenSpec
  files) · `auto-forecast` · 400-line review budget.
- **Strict TDD**: enabled per `openspec/config.yaml:27-30`;
  runner `pnpm test`; cycle RED → GREEN → TRIANGULATE →
  REFACTOR.
- **Author / attribution**: `Sebastián Illa` per
  `openspec/AGENTS.md` §"Author attribution (docs
  metadata)".
- **Carried precedents** (design patterns, NOT new deps):
  - **Vercel composition patterns** — compound components
    over boolean-prop proliferation (`Card`, `Table`,
    `FormField`).
  - **Tailwind v4 CSS-first config** — `@theme inline` +
    CSS custom properties for tokens; no `tailwind.config.ts`
    extension.
  - **React 19 `useActionState`** — submit state machine
    for forms (built-in; no new dep).

---

## 19. Forecast table

The orchestrator pre-cached `chainedPrStrategy: auto-forecast`
and `reviewBudgetLines: 400`. Per the §E review-workload guard,
every slice MUST be a self-contained PR with clear start,
finish, verification, and rollback. Forecast lines are
**changed lines (additions + deletions)** per slice.

| PR        | Slice                   | LoC low  | LoC high | 400-line budget risk             | Decision needed before apply | Chained PRs recommended    | Conventional commit title (PR title)                                                     |
| --------- | ----------------------- | -------- | -------- | -------------------------------- | ---------------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| #1        | `ui-primitives`         | 380      | 480      | Low per slice; High if collapsed | No                           | Yes (slice 2 gates)        | `feat(ui-primitives): tokens + 18 primitives + layout shell`                             |
| #2        | `accounts-ui`           | 240      | 360      | Low per slice; High if collapsed | No                           | Yes (slice 3 gates)        | `feat(ui-accounts): production renders for accounts pages`                               |
| #3        | `transactions-ui`       | 320      | 460      | Low per slice; High if collapsed | No                           | Yes (slice 4 gates)        | `feat(ui-transactions): production renders for transactions pages`                       |
| #4        | `dashboard-ui-refactor` | 220      | 340      | Low per slice; High if collapsed | No                           | Yes (slice 5 gates)        | `feat(ui-dashboard-refactor): production dashboard with account picker + month switcher` |
| #5        | `integration-tests`     | 200      | 320      | Low per slice; High if collapsed | No                           | Yes (slice 6 gates)        | `test(ui-integration-tests): axe-core + visual snapshots + e2e happy paths`              |
| #6        | `docs-and-perf`         | 160      | 260      | Low per slice; High if collapsed | No                           | Yes (final; gates release) | `docs(ui-docs-and-perf): design-system ref + QA checklist + perf budget + sdd-archive`   |
| **Total** | —                       | **1520** | **2220** | **High if collapsed**            | **No**                       | **Yes**                    | —                                                                                        |

**Verdict lines:**

- **Decision needed before apply: No.** Scope locked at
  pre-propose; the four open questions + the orchestrator's
  preflight values are the inputs. The three orchestrator
  corrections baked into the design (dark tokens declared,
  two new server-side queries, every Client Component
  opted-in) are non-blocking.
- **Chained PRs recommended: Yes.** Every slice is over the
  400-line budget if delivered as a single PR; per-slice
  budgets are below the limit. The orchestrator's
  `auto-forecast` cache confirms force-chained.
- **400-line budget risk: Low per slice; High if collapsed.**
  The forecast totals 1520-2220 LoC across six PRs; each PR
  is 160-480 LoC (below the 400-line budget for five of six;
  slice 1 is at the 480 high end and slice 3 is at the 460
  high end — both borderline but within the orchestrator's
  acceptable range).
- **Per-slice PR titles** are in conventional commit form
  (above table). The titles match the `feat(ui-*)` /
  `test(ui-*)` / `docs(ui-*)` scope convention; the
  `feat(ui-*)` type is the conventional type for "new
  production UI surface".

---

## 20. Acceptance criteria

The orchestrator can run these binary checks after
`sdd-apply` completes:

1. `pnpm test app/_ui/` exits 0 with **≥ 80% coverage on
   `app/_ui/`** (the design-system primitives layer).
2. `pnpm test app/accounts/` exits 0 with **≥ 80% coverage
   on `app/accounts/`** (the accounts UI layer).
3. `pnpm test app/transactions/` exits 0 with **≥ 80%
   coverage on `app/transactions/`** (the transactions UI
   layer).
4. `pnpm test app/dashboard/` + `pnpm test app/_components/`
   exit 0 with **≥ 80% coverage on `app/dashboard/` +
   `app/_components/`** (the dashboard UI layer).
5. `pnpm typecheck` exits 0 (TypeScript strict mode, no
   `any`). The `strict: true` compiler flag is unchanged.
6. `pnpm lint` passes with zero warnings on the new code.
7. `pnpm build` succeeds with zero TypeScript errors.
8. `pnpm test:coverage:enforced` reports ≥ 80% on every
   affected folder (`app/_ui/`, `app/accounts/`,
   `app/transactions/`, `app/dashboard/`,
   `app/_components/`).
9. `pnpm dev` → sign in → visit `/transactions` with 3 ARS +
   2 USD transactions across 2 accounts. The page renders a
   sortable, paginated table with direction badges. Click
   on the `Date` header → rows re-sort. Click `Next page`
   → the cursor advances.
10. Visit `/transactions/new` with no accounts. The Combobox
    renders an `No accounts available` empty state. Create
    an account first → return → the Combobox is populated.
11. Submit the create form with `amountMinor = 0`. The
    inline error appears next to the amount field with the
    API's `INVALID_AMOUNT` message. The submit button is
    disabled with `Spinner` + `aria-busy="true"`.
12. Visit `/transactions/X` for a USD transaction against an
    ARS casa. The `Rate as of` card row renders the snapshot
    timestamp as plain text. The FX snapshot is unchanged
    when the user edits only the memo.
13. Visit `/dashboard` with no transactions. The empty-state
    illustration + `Record your first transaction` CTA render.
    Click the CTA → `/transactions/new` loads.
14. Visit `/dashboard` with transactions. Pick an account
    from the `DashboardAccountPicker` → the flow card shows
    the per-account daily flow. Switch the month via the
    `DashboardMonthSwitcher` → the summary + breakdown update.
15. Visit `/accounts` → toggle `Show archived` → archived
    accounts appear with a badge. Toggle off → only live
    accounts render. The `Last activity` column shows the
    most recent transaction's date (or `—` when no
    transactions).
16. **Keyboard nav**: Tab through `/transactions` end-to-end.
    Every interactive element is reachable; focus is visible
    on every element; `Enter` activates the sort headers;
    `Escape` closes the delete confirm dialog.
17. **Screen reader run-through** (VoiceOver on macOS): every
    page announces the page title, the headings, the form
    field labels, and the inline error messages.
18. **axe-core run** on every page with seeded data: zero
    `critical` violations; zero `serious` violations. The
    integration test asserts this and fails the build on any
    violation.
19. **Snapshot tests** pass for every presentational primitive
    in its primary state. Snapshot drift requires an
    explicit `--update` flag.
20. **p95 page load < 2s** on `/`, `/dashboard`, and
    `/transactions` under simulated 4G + Moto G4
    (Lighthouse CLI). The output is pasted into
    `docs/perf/transactions-ui.md`.
21. **Manual QA checklist** at `docs/qa/transactions-ui.md` is
    completed and signed off by the user during the verify
    gate.
22. `openspec/specs/ui/spec.md` exists with REQ-UI-1 to
    REQ-UI-11 (11 Requirements) after `sdd-archive` runs.
    `openspec/specs/transactions/spec.md` carries the
    REQ-TX-15 delta (REQ-TX-15 REPLACED).
23. `docs/architecture/ui.md` exists with the token table +
    component inventory (REQ-UI-10).
24. `./Documents-es/openspec/changes/transactions-ui/design.md`
    mirror exists with identical structure. No
    Chinese-character debris per root `AGENTS.md` §13.3
    mirror check. No AI forms in the `**Author**:` / `**Autor**`
    header (per `openspec/AGENTS.md`).
25. No `pnpm-lock.yaml` drift after the change merges (root
    `AGENTS.md` §5.3). The change ships zero new top-level
    dependencies.
26. **No `Co-authored-by` trailer** in any commit (root
    `AGENTS.md` §4.5). **Author header** on every new doc is
    `Sebastián Illa` (no AI forms, per `openspec/AGENTS.md`).
27. `git grep -E '\bdark:' app/_ui/ app/accounts/
app/transactions/ app/dashboard/
'app/_components/dashboard-*.tsx'` returns zero matches
    (REQ-UI-9).
