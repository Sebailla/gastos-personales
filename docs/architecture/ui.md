# Design system — `ui` capability

**Author**: Sebastián Illa
**Capability**: `ui`
**Source change**: `transactions-ui`
**Status**: implemented · **Promoted**: 2026-06-29 (sdd-archive, slice 6 of `transactions-ui`)
**Stack**: v3 — Next.js 16 + Node 20 + React 19 + Hono catch-all + Auth.js v5 + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + Testing Library + pnpm + Tailwind v4

> Canonical reference for the v1 design system. Operationalizes
> REQ-UI-10 of `openspec/specs/ui/spec.md`. This document is the
> **public-facing reference** (the developer-facing companion lives
> in `app/_ui/README.md` and is shorter; this file is the
> comprehensive catalog that the verify gate enforces).
>
> The v1 design system is **hand-built** on Tailwind v4 + React 19
> with **no new top-level dependency** (no shadcn, no NextUI, no
> MUI, no Chakra, no Radix in v1; see `openspec/changes/transactions-ui/design.md`
> §"Decision: hand-built primitives"). The primitives are pure
> functions that consume tokens from `app/_ui/tokens.css`.
>
> Composition is via children + compound components, NOT
> boolean-prop proliferation (no `variant` / `size` / `as` props on
> primitives; see `design.md` §"Decision: composition via children").
> Variants live on the inner `Button` or `Badge` when needed.

---

## 1. Token table

The token table is the **single source of styling**. It lives at
`app/_ui/tokens.css` and declares every CSS custom property under
`@layer base`. Tailwind v4 reads them via the `@theme inline`
directive in `app/globals.css` and exposes each as a utility class
(`bg-ui-bg`, `text-ui-fg`, `rounded-ui-md`, etc.).

### 1.1 Light theme (rendered in v1)

| Group      | CSS custom property        | Value                  | Utility class             | Semantic role                                                    |
| ---------- | -------------------------- | ---------------------- | ------------------------- | ---------------------------------------------------------------- |
| Spacing    | `--ui-space-1`             | `0.25rem` (4px)        | `p-ui-space-1`, `m-…`     | Minimum gap (inline icon to label)                               |
| Spacing    | `--ui-space-2`             | `0.5rem`  (8px)        | `p-ui-space-2`, `m-…`     | Default form control padding (vertical + horizontal)             |
| Spacing    | `--ui-space-3`             | `0.75rem` (12px)       | `p-ui-space-3`, `m-…`     | Card body / cell padding                                         |
| Spacing    | `--ui-space-4`             | `1rem`    (16px)       | `p-ui-space-4`, `m-…`     | Card body / button horizontal padding                            |
| Spacing    | `--ui-space-5`             | `1.25rem` (20px)       | `p-ui-space-5`, `m-…`     | Section gap                                                      |
| Spacing    | `--ui-space-6`             | `1.5rem`  (24px)       | `p-ui-space-6`, `m-…`     | Page-container horizontal padding (mobile)                       |
| Spacing    | `--ui-space-7`             | `2rem`    (32px)       | `p-ui-space-7`, `m-…`     | Card stack gap (vertical)                                        |
| Spacing    | `--ui-space-8`             | `2.5rem`  (40px)       | `p-ui-space-8`, `m-…`     | EmptyState vertical padding                                      |
| Colors     | `--ui-bg`                  | `#ffffff`              | `bg-ui-bg`                | Page background                                                   |
| Colors     | `--ui-bg-muted`            | `#f9fafb`              | `bg-ui-bg-muted`          | Card header / table header / disabled state                       |
| Colors     | `--ui-bg-subtle`           | `#f3f4f6`              | `bg-ui-bg-subtle`         | Skeleton shimmer / ghost button hover                             |
| Colors     | `--ui-fg`                  | `#111827`              | `text-ui-fg`              | Default body text                                                 |
| Colors     | `--ui-fg-muted`            | `#6b7280`              | `text-ui-fg-muted`        | Secondary text (descriptions, placeholders)                       |
| Colors     | `--ui-border`              | `#e5e7eb`              | `border-ui-border`        | Default border (cards, inputs, table rows)                        |
| Colors     | `--ui-accent`              | `#2563eb`              | `bg-ui-accent`            | Primary CTA (primary button, focused link, current page)          |
| Colors     | `--ui-accent-fg`           | `#ffffff`              | `text-ui-accent-fg`       | Text on `--ui-accent` backgrounds                                 |
| Colors     | `--ui-danger`              | `#dc2626`              | `bg-ui-danger`            | Destructive action (delete, archive)                              |
| Colors     | `--ui-danger-fg`           | `#ffffff`              | `text-ui-danger-fg`       | Text on `--ui-danger` backgrounds; field error text               |
| Colors     | `--ui-success`             | `#16a34a`              | `bg-ui-success`           | Positive direction badge (INCOME), success toasts                 |
| Colors     | `--ui-success-fg`          | `#ffffff`              | `text-ui-success-fg`      | Text on `--ui-success` backgrounds                                |
| Colors     | `--ui-warning`             | `#d97706`              | `bg-ui-warning`           | Warning surface (e.g. archived account)                            |
| Colors     | `--ui-warning-fg`          | `#ffffff`              | `text-ui-warning-fg`      | Text on `--ui-warning` backgrounds                                |
| Radius     | `--ui-rounded-sm`          | `0.25rem`              | `rounded-ui-sm`           | Inline chips, skeleton                                            |
| Radius     | `--ui-rounded-md`          | `0.5rem`               | `rounded-ui-md`           | Inputs, buttons, pagination controls                              |
| Radius     | `--ui-rounded-lg`          | `0.75rem`              | `rounded-ui-lg`           | Card, dialog                                                      |
| Radius     | `--ui-rounded-full`        | `9999px`               | `rounded-ui-full`         | Badge (pill shape)                                                 |
| Elevation  | `--ui-shadow-sm`           | `0 1px 2px 0 rgb(0 0 0 / 0.05)`       | `shadow-ui-shadow-sm`  | Card resting elevation                                            |
| Elevation  | `--ui-shadow-md`           | `0 4px 6px -1px rgb(0 0 0 / 0.1)`     | `shadow-ui-shadow-md`  | Popover (future use)                                              |
| Elevation  | `--ui-shadow-lg`           | `0 10px 15px -3px rgb(0 0 0 / 0.1)`   | `shadow-ui-shadow-lg`  | Dialog backdropped overlay                                        |
| Typography | `--ui-text-xs`             | `0.75rem`              | `text-ui-text-xs`         | Helper text, table cells                                          |
| Typography | `--ui-text-sm`             | `0.875rem`             | `text-ui-text-sm`         | Form labels, breadcrumb, button text                              |
| Typography | `--ui-text-base`           | `1rem`                 | `text-ui-text-base`       | Default body / input value                                        |
| Typography | `--ui-text-lg`             | `1.125rem`             | `text-ui-text-lg`         | Card header title                                                 |
| Typography | `--ui-text-xl`             | `1.25rem`              | `text-ui-text-xl`         | (Reserved; not consumed in v1)                                    |
| Typography | `--ui-text-2xl`            | `1.5rem`               | `text-ui-text-2xl`        | (Reserved; not consumed in v1)                                    |
| Typography | `--ui-text-3xl`            | `1.875rem`             | `text-ui-text-3xl`        | Page header `<h1>`                                                |
| Typography | `--ui-font-normal`         | `400`                  | `font-ui-font-normal`     | Default body weight                                               |
| Typography | `--ui-font-medium`         | `500`                  | `font-ui-font-medium`     | Form labels, button text                                          |
| Typography | `--ui-font-semibold`       | `600`                  | `font-ui-font-semibold`   | Card header title                                                 |
| Typography | `--ui-font-bold`           | `700`                  | `font-ui-font-bold`       | Page header `<h1>`                                                |

### 1.2 Dark theme (declared, NOT rendered in v1)

The dark-mode token values are declared under `[data-theme='dark']`
in `app/_ui/tokens.css` for **non-breaking forward compatibility** —
a follow-up `ui-dark-mode` change activates them by setting
`data-theme="dark"` on the document root. v1 MUST NOT render the
dark tokens (REQ-UI-9 / BR-UI-8). A code-review check asserts that
no `dark:` Tailwind variants are present in `app/_ui/`,
`app/accounts/`, `app/transactions/`, `app/dashboard/`, or
`app/_components/dashboard-*.tsx`.

The dark-mode value table mirrors the light theme's structure (same
property names, dark-mode hex values). See `app/_ui/tokens.css`
lines 74-89 for the authoritative values.

---

## 2. Primitive component inventory

Eighteen primitives ship in v1. Each row below is a contract:
**what it does**, **its props shape**, and **its a11y contract**.
The primitives are imported path-based (`../_ui/primitives/<name>`),
NOT through `app/_ui/index.ts`; the barrel exists for documentation
only (design §2.3).

| # | Primitive                  | File path                                            | Component shape                                                                                                                                                                                                                                                            | A11y contract                                                                                                                                                                                                                                       |
| - | -------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | `Button`                   | `app/_ui/primitives/button.tsx`                      | `Button({ variant?: 'primary' \| 'secondary' \| 'ghost' \| 'danger', isLoading?: boolean, ...ButtonHTMLAttributes })`. Renders `<button type="button">`; `isLoading` toggles `disabled`, `aria-busy`, and a `<Spinner>` icon. Defaults `type="button"` (NOT submit). | `focus-visible:ring-2 focus-visible:ring-ui-accent` (REQ-UI-4); `aria-busy="true"` while loading (REQ-UI-7); `disabled` while loading.                                                                                                              |
| 2 | `Input`                    | `app/_ui/primitives/input.tsx`                       | `Input({ id: string, ...InputHTMLAttributes })`. `id` is REQUIRED at compile time. Forwards all native `<input>` attrs + `className`.                                                                                                                                       | Pairs with `<label htmlFor>` via the `id` prop (REQ-UI-5); `aria-invalid="true"` propagates from `FormField` (REQ-UI-6); `focus-visible:ring-2`.                                                                                                       |
| 3 | `Textarea`                 | `app/_ui/primitives/textarea.tsx`                    | `Textarea({ id: string, rows?: number = 4, ...TextareaHTMLAttributes })`. Same contract as `Input`.                                                                                                                                                                          | Same as `Input` (REQ-UI-5, REQ-UI-6).                                                                                                                                                                                                              |
| 4 | `Select`                   | `app/_ui/primitives/select.tsx`                      | `Select({ id: string, options: ReadonlyArray<{ value, label, disabled? }>, ...SelectHTMLAttributes })`. Native `<select>`; `children` is omitted (use `options`).                                                                                                          | Native `<select>` is the a11y primitive for screen readers (no extra ARIA needed beyond `FormField` pairing). `focus-visible:ring-2`.                                                                                                              |
| 5 | `Checkbox`                 | `app/_ui/primitives/checkbox.tsx`                    | `Checkbox({ id: string, ...InputHTMLAttributes })`. Native `<input type="checkbox">`.                                                                                                                                                                                      | Native input; `FormField` provides the `<label htmlFor>` pairing (REQ-UI-5).                                                                                                                                                                          |
| 6 | `RadioGroup`               | `app/_ui/primitives/radio-group.tsx`                 | `RadioGroup({ name, legend, value, onChange, items: ReadonlyArray<{ value, label, disabled? }>, className? })`. Composes `<fieldset>` + `<legend>` + `<input type="radio">` items; each item is a `<label>` wrapping its input.                                       | `<fieldset>` + `<legend>` give the group a single accessible name (REQ-UI-5). Keyboard: native radio navigation.                                                                                                                                    |
| 7 | `Combobox`                 | `app/_ui/primitives/combobox.tsx` (Client Component) | `Combobox({ id, value, onChange, options, placeholder?, required?, disabled?, 'aria-label'? })`. WAI-ARIA 1.2 combobox pattern: native `<select>` (semantic, used for selection) + `<input type="search">` (visual, used for query). Client Component (`'use client'`).   | `<select>` is the semantic primitive for screen readers; `<input>` carries `role="searchbox"`, `aria-controls`, `aria-autocomplete="list"`. Keyboard: native select handles Arrow / Enter; `Escape` clears the query. NO new dependency.            |
| 8 | `FieldError`               | `app/_ui/primitives/field-error.tsx`                 | `FieldError({ id: string, message: string, className? })`. Renders `<div role="alert" aria-live="polite" aria-atomic="true">` with the message.                                                                                                                            | `role="alert"` + `aria-live="polite"` make screen readers announce the error when it appears (REQ-UI-6). The `id` is what the field's `aria-describedby` points at.                                                                                 |
| 9 | `FormField`                | `app/_ui/primitives/form-field.tsx`                  | `FormField({ id, label, required?, description?, error?, children })`. Composes `<label htmlFor>` + child + `FieldError`. When `error` is present, clones the child with `aria-describedby` pointing at the `FieldError` id and `aria-invalid="true"` (REQ-UI-6).   | Enforces label / control pairing via TypeScript (`id` flows to both); clones `aria-describedby` and `aria-invalid` into the child without the child having to know. Required marker rendered as `<span aria-hidden="true">*</span>`.               |
| 10 | `Card` (compound)          | `app/_ui/primitives/card.tsx`                        | `Card({ 'aria-label'?, 'aria-labelledby'?, ...HTMLAttributes })` + `CardHeader({ title, badge?, actions? })` + `CardBody({ children })` + `CardFooter({ children })`. `Card` renders `<article>`; `CardHeader` renders `<header>` with `<h2>{title}</h2>`; `CardBody` and `CardFooter` are content slots. | `Card` is a semantic region (screen readers list it as a landmark when `aria-label` is set). `CardHeader` `<h2>` keeps the heading hierarchy consistent.                                                                                            |
| 11 | `Table` (compound)          | `app/_ui/primitives/table.tsx`                       | `Table({ caption: string, hideCaption?, ...TableHTMLAttributes })` + `TableHeader({ columns: ReadonlyArray<{ key, label, sortable?, sortDirection?, onSort? }> })` + `TableBody` + `TableRow` + `TableCell`. `caption` is REQUIRED.                                      | `<caption>` always present (visible or `sr-only` via `hideCaption`); every `<th>` has `scope="col"`; sortable columns render `aria-sort` reflecting the current direction + a `<button>` inside the `<th>` for keyboard activation (REQ-UI-8).       |
| 12 | `Badge`                    | `app/_ui/primitives/badge.tsx`                       | `Badge({ variant?: 'neutral' \| 'accent' \| 'success' \| 'warning' \| 'danger', children })` + `directionVariant('INCOME' \| 'EXPENSE')` helper.                                                                                                                            | Decorative span; no interactive role. Color is NOT the sole carrier of meaning (the text content is the meaning; the color reinforces it).                                                                                                            |
| 13 | `EmptyState`               | `app/_ui/primitives/empty-state.tsx`                 | `EmptyState({ title, description?, illustration?, cta?, className? })`. Renders `<div role="status">` with title + description + optional illustration + optional CTA.                                                                                                    | `role="status"` makes screen readers announce the empty state on navigation; CTA is the first focusable element when present (so keyboard flow is natural).                                                                                          |
| 14 | `Spinner`                  | `app/_ui/primitives/spinner.tsx`                     | `Spinner({ 'aria-label'?: string = 'Loading', size?: number = 20 })`. Inline SVG with CSS-only `animate-spin`; no JS loop.                                                                                                                                                  | `<span role="status" aria-label="Loading">` so screen readers announce the loading state.                                                                                                                                                            |
| 15 | `Skeleton`                 | `app/_ui/primitives/skeleton.tsx`                    | `Skeleton({ width?: number \| string = '100%', height?: number \| string = 16, className? })`.                                                                                                                                                                              | `aria-hidden="true"` so screen readers skip the loading shimmer (a Skeleton is decorative; the live region above the skeleton carries the status).                                                                                                     |
| 16 | `Pagination`               | `app/_ui/primitives/pagination.tsx`                  | `Pagination({ currentPage: number, totalPages: number, baseUrl: string, queryKey?: string = 'page' })`. Server-rendered `<nav aria-label="Pagination">` with `<Link>` controls (Previous, page N, Next).                                                                  | `<nav aria-label="Pagination">` is a navigation landmark; each `<Link>` carries `aria-label="Page N"` / `"Previous page"` / `"Next page"`; the current page has `aria-current="page"`.                                                                |
| 17 | `Dialog` (Client)          | `app/_ui/primitives/dialog.tsx` (Client Component)   | `Dialog({ open: boolean, onClose: () => void, title: string, description?: string, children })`. Wraps a custom `<div role="dialog" aria-modal="true">` (not the native `<dialog>` element — the design system controls the backdrop). Client Component (`'use client'`).    | `role="dialog"` + `aria-modal="true"` + `aria-labelledby` (title) + `aria-describedby` (description) (REQ-UI-1 hand-tested). Focus trap (Tab cycles inside); `Escape` closes; backdrop click closes; focus returns to the trigger on close.       |
| 18 | `Breadcrumb`               | `app/_ui/primitives/breadcrumb.tsx`                  | `Breadcrumb({ items: ReadonlyArray<{ label, href? }> })`. Renders `<nav aria-label="Breadcrumb"><ol>` with `<Link>` items; the last item (no `href`) is the current page and carries `aria-current="page"`.                                                              | `<nav aria-label="Breadcrumb">` is a navigation landmark; last item has `aria-current="page"`; the `/` separator is `aria-hidden`.                                                                                                                    |
| 19 | `Link`                     | `app/_ui/primitives/link.tsx`                        | `Link({ href, className?, ...ComponentProps<typeof NextLink> })`. Thin Next.js `Link` wrapper.                                                                                                                                                                              | `focus-visible:ring-2 focus-visible:ring-ui-accent` (REQ-UI-4). All standard `<a>` semantics (right-click "open in new tab", middle-click, screen-reader link lists) preserved by `next/link`.                                                      |

### 2.1 Compound vs single-export note

The `Card` and `Table` primitives are **compound**: a single file
exports the parent plus its sub-components (`Card`/`CardHeader`/
`CardBody`/`CardFooter`; `Table`/`TableHeader`/`TableBody`/
`TableRow`/`TableCell`). Composition happens at the call site:

```tsx
<Card aria-label="Resumen mensual">
  <CardHeader title="Resumen mensual" badge={<Badge>ARS</Badge>} />
  <CardBody>{/* key-value rows */}</CardBody>
  <CardFooter><Button variant="ghost">Cancelar</Button></CardFooter>
</Card>
```

This is the **Vercel composition pattern** (see
`docs/composition-notes.md` precedent if present; otherwise see
`design.md` §"Decision: composition via children"). No
`variant` / `size` / `as` props on the compound parents; the
variants live on the inner `Button` or `Badge` when needed.

---

## 3. Layout shell inventory

Five layout-shell primitives wrap the page-level renders.

| # | Primitive       | File path                                | Component shape                                                                                                              | A11y / semantic role                                                                                          |
| - | --------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1 | `PageHeader`    | `app/_ui/layout/page-header.tsx`         | `PageHeader({ title: string, description?, actions?, className? })`. Renders `<header>` with `<h1>{title}</h1>` + `<p>` + an actions slot. | `<header>` is a banner landmark; `<h1>` is the page-level heading (one per page; `CardHeader` uses `<h2>`).   |
| 2 | `PageContainer` | `app/_ui/layout/page-container.tsx`      | `PageContainer({ children, className? })`. Renders `<main>` with max-width 6xl + responsive horizontal padding (`px-ui-space-4` → `lg:px-ui-space-8`). | `<main>` is the main content landmark (one per page).                                                        |
| 3 | `BreadcrumbBar` | `app/_ui/layout/breadcrumb-bar.tsx`      | `BreadcrumbBar({ items: ReadonlyArray<{ label, href? }> })`. Composes the `Breadcrumb` primitive (no new logic).            | Same as `Breadcrumb` — `<nav aria-label="Breadcrumb">` landmark.                                              |
| 4 | `Sidebar`       | `app/_ui/layout/sidebar.tsx`             | `Sidebar({ children?, className? })`. Renders `<aside className="flex flex-col gap-ui-space-4">`.                             | `<aside>` is a complementary landmark. **NOT consumed in v1** — exported for the follow-up `ui-sidebar` change. |
| 5 | `Topbar`        | `app/_ui/layout/topbar.tsx`              | `Topbar({ children?, className? })`. Renders `<header className="flex items-center justify-between border-b border-ui-border bg-ui-bg px-ui-space-4 py-ui-space-3">`. | `<header>` banner landmark. **NOT consumed in v1** — exported for the follow-up `ui-topbar` change.            |

### 3.1 Composition pattern

Every production page composes the layout shell as follows (verified
across `app/accounts/page.tsx`, `app/transactions/page.tsx`,
`app/dashboard/page.tsx`, and the create / detail routes):

```tsx
<PageContainer>
  <BreadcrumbBar items={[{ label: 'Inicio', href: '/' }, { label: 'Cuentas' }]} />
  <PageHeader
    title="Cuentas"
    description="Administrá tus cuentas y su snapshot de actividad."
    actions={<Button variant="primary" onClick={openNew}>Nueva cuenta</Button>}
  />
  {/* page body — Cards + Tables + EmptyState */}
</PageContainer>
```

`Sidebar` and `Topbar` are exported but unused in v1 by design —
their inclusion in the inventory is a forward-declaration so the
follow-up `ui-sidebar` and `ui-topbar` changes do not require a
new primitive.

---

## 4. Cross-cutting contracts

These contracts apply across every primitive, not just the ones
listed in §2 / §3.

### 4.1 Visible focus indicator (REQ-UI-4)

Every interactive primitive renders
`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2`.
The visual treatment has a contrast ratio of at least 3:1 against
the surrounding background (WCAG 2.4.7 Focus Visible). The `Button
variant="danger"` case keeps the danger color via the variant's
background, but the focus ring remains `--ui-accent` for
consistency (a danger-colored ring would disappear on the danger
background).

### 4.2 Form field / label pairing (REQ-UI-5)

Every form field (`Input`, `Textarea`, `Select`, `Checkbox`,
`RadioGroup`, `Combobox`) pairs with a `<label htmlFor="<id>">` or
an `aria-label` (for icon-only buttons). The `FormField` primitive
is the **enforcement mechanism** — pairing is achieved by flowing
the `id` prop through the form field to both the `<label>` and the
control. Icon-only buttons (e.g. `Pagination` "Previous page")
carry an `aria-label` that describes the action.

### 4.3 Inline form errors with aria-describedby (REQ-UI-6)

Form errors render next to the offending field, NOT at the top of
the form. The `FormField` primitive injects `aria-describedby`
(pointing at the `FieldError` element's `id`) and `aria-invalid`
into the child control when an `error` prop is present. The
`FieldError` primitive uses `role="alert"` + `aria-live="polite"`
so screen readers announce the error when it appears.

### 4.4 Submit-button loading state (REQ-UI-7)

Every form's submit button uses the `Button` primitive with
`isLoading={pending}` (the `pending` flag from React 19's
`useActionState`). While loading, the button renders `disabled` +
`aria-busy="true"` + a `<Spinner>` icon. Double-clicks are
debounced (React 19's `useActionState` guarantees the action runs
exactly once per submission window).

### 4.5 Table caption + scope + aria-sort (REQ-UI-8)

Every `Table` primitive renders `<caption>` (visible or `sr-only`
via `hideCaption`). Every `<th>` has `scope="col"`. Sortable
columns render `aria-sort` reflecting the current sort direction
(`ascending` / `descending` / `none`) and a `<button>` inside the
`<th>` for keyboard activation.

### 4.6 No dark variants in production (REQ-UI-9)

v1 ships a single light theme. The token table declares dark-mode
CSS custom properties under `[data-theme='dark']` for forward
compatibility, but no `dark:` Tailwind variants appear in
`app/_ui/`, `app/accounts/`, `app/transactions/`, `app/dashboard/`,
or `app/_components/dashboard-*.tsx`. The verify gate runs
`git grep -E '\bdark:' app/_ui/ app/accounts/ app/transactions/ app/dashboard/ app/_components/dashboard-*.tsx`
and asserts zero matches.

### 4.7 Path-based imports (no runtime barrel)

The runtime imports are **path-based**, not barrel-based:

```ts
import { Button } from '../_ui/primitives/button';
import { Card, CardHeader, CardBody } from '../_ui/primitives/card';
```

`app/_ui/index.ts` exists for documentation purposes (it re-exports
the 18 primitives + 5 layout-shell primitives) but is NOT used at
runtime. Per design §2.3, the barrel is a documentation surface
that makes it easy to grep the public surface; the path-based
imports keep the bundle analyzer honest and avoid circular
re-exports.

---

## 5. Versioning and follow-up

The design system is at **v1**. Future additive changes:

| Follow-up change       | What it adds                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ui-dark-mode`         | Activates the dark-mode tokens; adds a theme toggle to `PageHeader`.                                         |
| `ui-i18n`              | Replaces the hard-coded mixed EN/ES strings with a message catalog; introduces `useT(key)` hook.              |
| `ui-charts`            | Adds a `Chart` compound primitive; possibly introduces a minimal `recharts` or hand-built SVG chart primitive. |
| `ui-sidebar` / `ui-topbar` | Consumes the `Sidebar` + `Topbar` primitives in the production pages (replacing the current full-width layout). |

The token table is the single stable surface — every follow-up
change either activates an unused token or adds new tokens under
the same naming convention (`--ui-*`).

---

## 6. References

- `openspec/specs/ui/spec.md` — the canonical spec this document
  operationalizes. REQ-UI-1 to REQ-UI-11 are codified there.
- `openspec/changes/transactions-ui/design.md` §3.1 (token table),
  §3.2 (primitive props contracts), §7.1 (primitives list), §7.2
  (layout shell list), §11 (a11y strategy), §16.5 (perf mitigation).
- `app/_ui/README.md` — the developer-facing companion (shorter,
  in-repo).
- `app/_ui/tokens.css` — the token table source of truth.
- `app/_ui/index.ts` — the public barrel (documentation only;
  runtime imports are path-based).
- `docs/qa/transactions-ui.md` — the manual QA checklist
  codifying REQ-UI-11.
- `docs/perf/transactions-ui.md` — the Lighthouse perf budget
  verification artifact.
- Root `AGENTS.md` §13 — the dual-language docs mirror policy.