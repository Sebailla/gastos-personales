# `app/_ui/` — Design system

Internal developer-facing overview of the **v1** design system. Slice
6 (`ui-docs-and-perf`) ships the public design-system reference at
`docs/architecture/ui.md` (REQ-UI-10). This file is the in-repo
companion that ships with slice 1.

## Token table

`app/_ui/tokens.css` declares the v1 token set as CSS custom
properties under `@layer base`. Tailwind v4 reads them via the
`@theme inline` block in `app/globals.css` and exposes each as a
utility class (`bg-ui-bg`, `text-ui-fg`, `rounded-ui-md`, etc.).

| Group      | Tokens                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spacing    | `--ui-space-{1..8}` → `0.25rem`..`2.5rem`                                                                                                                                                                                       |
| Colors     | `--ui-bg`, `--ui-bg-muted`, `--ui-bg-subtle`, `--ui-fg`, `--ui-fg-muted`, `--ui-border`, `--ui-accent`, `--ui-accent-fg`, `--ui-danger`, `--ui-danger-fg`, `--ui-success`, `--ui-success-fg`, `--ui-warning`, `--ui-warning-fg` |
| Radius     | `--ui-rounded-{sm,md,lg,full}`                                                                                                                                                                                                  |
| Elevation  | `--ui-shadow-{sm,md,lg}`                                                                                                                                                                                                        |
| Typography | `--ui-text-{xs,sm,base,lg,xl,2xl,3xl}`, `--ui-font-{normal,medium,semibold,bold}`                                                                                                                                               |

The dark-mode scope is declared under `[data-theme='dark']` but
NOT activated in v1 (REQ-UI-9). A follow-up `ui-dark-mode` change
sets `data-theme="dark"` on the document root.

## Primitive catalog

| Primitive                | Type              | Notes                                                                |
| ------------------------ | ----------------- | -------------------------------------------------------------------- | ---------------- |
| `Button`                 | Server            | `variant`, `isLoading` (Spinner + disabled + aria-busy per REQ-UI-7) |
| `Input` / `Textarea`     | Server            | `id` required; aria pass-through                                     |
| `Select`                 | Server            | Native `<select>`; aria pass-through                                 |
| `Checkbox`               | Server            | Native `<input type=checkbox>`                                       |
| `RadioGroup`             | Server            | `<fieldset>` + `<legend>` + items                                    |
| `Combobox`               | **Client**        | `<select>` + `<input type=search>`; no new dep                       |
| `FormField`              | Server            | composes label + child + FieldError; clones a11y attrs into child    |
| `FieldError`             | Server            | `role=alert` + `aria-live=polite`                                    |
| `Card` + sub-components  | Server (compound) | `<article>` + `<header>` + `<div>` + `<footer>`                      |
| `Table` + sub-components | Server (compound) | `<caption>` + `<th scope=col>` + `aria-sort` (REQ-UI-8)              |
| `Badge`                  | Server            | `directionVariant(INCOME                                             | EXPENSE)` helper |
| `EmptyState`             | Server            | `role=status`; CTA is first focusable                                |
| `Spinner`                | Server            | `role=status` + `aria-label`                                         |
| `Skeleton`               | Server            | `aria-hidden=true`; CSS-only animation                               |
| `Pagination`             | Server            | `<nav aria-label=Pagination>` + `<Link>`s                            |
| `Dialog`                 | **Client**        | focus trap + Escape close + backdrop click                           |
| `Breadcrumb`             | Server            | `<nav aria-label=Breadcrumb>` + `<ol>` + `<Link>`s                   |
| `Link`                   | Server            | Next.js `Link` wrapper; focus-visible ring (REQ-UI-4)                |

## Layout shell

| Primitive       | Type   | Notes                                                     |
| --------------- | ------ | --------------------------------------------------------- |
| `PageHeader`    | Server | `<header>` + `<h1>` + description + actions slot          |
| `PageContainer` | Server | `<main>` max-width wrapper + responsive padding           |
| `BreadcrumbBar` | Server | composes `Breadcrumb`                                     |
| `Sidebar`       | Server | forward-declared for follow-up `ui-sidebar`; unused in v1 |
| `Topbar`        | Server | forward-declared for follow-up `ui-topbar`; unused in v1  |

## Usage

The runtime imports are **path-based**, not barrel-based:

```ts
import { Button } from '../_ui/primitives/button';
import { Card, CardHeader, CardBody } from '../_ui/primitives/card';
```

`app/_ui/index.ts` exists for documentation but is not used at
runtime (per design §2.3).

## Accessibility contract

Every interactive primitive renders `focus-visible:ring-2
focus-visible:ring-ui-accent` (REQ-UI-4). Every form field pairs
with a `<label htmlFor>` (REQ-UI-5). Form errors are surfaced inline
with `aria-describedby` (REQ-UI-6). Submit buttons render
`Spinner + disabled + aria-busy="true"` while the Server Action is
in flight (REQ-UI-7). Tables render `<caption>` + `<th scope=col>`

- `aria-sort` (REQ-UI-8).

`app/_ui/__tests__/accessibility.test.tsx` asserts the axe-core
contract for the presentational primitives at the WCAG 2.2 AA floor
(`critical` + `serious` = 0).
