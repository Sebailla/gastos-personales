# Tasks — `transactions-ui`

**Author**: Sebastián Illa
**Change**: `transactions-ui`
**Capabilities**: `ui` (new — first write of the canonical spec); one delta on `transactions` (REQ-TX-15 REPLACED by REQ-UI-1..11 reference); no spec change on `accounts` (two additive query flags land in the existing GET endpoints — see BR-UI-1, BR-UI-2); no spec change on `reports`, `auth`, `fx`, `errors`
**Status**: implemented · **Implemented**: n/a (sdd-apply pending) · **Created**: 2026-06-27
**Stack**: v3 — Next.js 16 + Node 20 + React 19 + Hono catch-all + Auth.js v5 (inherited from `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + Testing Library + pnpm + Tailwind v4
**Source artifacts**: `openspec/changes/transactions-ui/proposal.md` (v1, 704 LoC) · `openspec/changes/transactions-ui/specs/ui/spec.md` (REQ-UI-1..11) · `openspec/changes/transactions-ui/specs/transactions/spec.md` (REQ-TX-15 REPLACED) · `openspec/changes/transactions-ui/design.md` (3,188 LoC; 20 sections) — input for this phase
**Preflight values**: interactive · `both` (OpenSpec + Engram) · `force-chained` (`auto-forecast` cache) · 400-line review budget
**Strict TDD**: enabled per `openspec/config.yaml:27-30`; runner `pnpm test`; cycle RED → GREEN → TRIANGULATE → REFACTOR

> One task = one atomic commit. Each commit lands one focus; the
> PR is the review checkpoint. The apply worker flips `- [x]`
> as commits land; the orchestrator verifies CI green and the
> spec Requirements covered before opening the next PR.
>
> Commit discipline per the project's `work-unit-commits`
> convention (commit by behaviour, tests-with-code,
> docs-with-change, no `Co-authored-by`, conventional commit
> format). The token table (T-UI-001) lands BEFORE every
> primitive; `globals.css` imports tokens (T-UI-002) lands
> BEFORE any primitive test; the first primitive test
> (T-UI-003) lands BEFORE the Button primitive (T-UI-004) so
> the RED commit is reviewable.
>
> **Skill-resolution provenance.** The orchestrator passed three
> canonical `SKILL.md` paths; this phase loaded all three
> (`sdd-tasks`, `_shared/sdd-phase-common`,
> `_shared/openspec-convention`) plus the precedent at
> `openspec/changes/archive/2026-06-27-reports/tasks.md`.
> `skill_resolution: paths-injected`.

---

## Review Workload Forecast

| Field                             | Value                                                                                                                                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estimated changed lines           | ~1,520–2,220 total across 6 chained PRs; per-slice LoC `ui-primitives` 380–480, `accounts-ui` 240–360, `transactions-ui` 320–460, `dashboard-ui-refactor` 220–340, `integration-tests` 200–320, `docs-and-perf` 160–260 |
| 400-line budget risk per slice    | **Low** (every slice sits at or under the 400-line budget; `ui-primitives` and `transactions-ui` are borderline at the 460–480 high end and the apply worker MUST surface `git diff --stat` at PR-open time)            |
| 400-line budget risk if collapsed | **High** — collapsing all six slices into a single PR would produce 1,520–2,220 changed lines, ~4–5× the 400-line review budget                                                                                         |
| Chained PRs recommended           | **Yes** (6 chained PRs against `develop`)                                                                                                                                                                               |
| Proposed split                    | `feat/ui-primitives` → `feat/ui-accounts` → `feat/ui-transactions` → `feat/ui-dashboard-refactor` → `feat/ui-integration-tests` → `feat/ui-docs-and-perf`                                                               |
| Delivery strategy                 | `force-chained` (locked in design §14 + §19; orchestrator cache = `auto-forecast`)                                                                                                                                      |
| Chain strategy                    | `stacked-to-main` (each PR merges to `develop`; release flow explicit per root `AGENTS.md` §5.5)                                                                                                                        |
| Decision needed before apply      | **No** (slice plan, chained strategy, and the three orchestrator corrections are locked in design §14 + §17; orchestrator does not re-ask)                                                                              |

```
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low (per slice) · High (collapsed)
```

> Design §19 forecasts 380–480 / 240–360 / 320–460 / 220–340 /
> 200–320 / 160–260 LoC per slice (slices 1 and 3 are at the
> high end of the 400-line budget; the apply worker MUST
> surface `git diff --stat` at PR-open time so the reviewer
> sees the actual line count). The mitigation (6 chained PRs
> against `develop`, each one its own squash-merge review
> checkpoint) is locked in the design. The orchestrator does
> NOT re-ask before apply per `openspec/config.yaml:21`.

---

## Goal

`sdd-apply` for `transactions-ui` lands the full **`ui`
capability** (canonical at `openspec/specs/ui/spec.md` after
`sdd-sync`) plus one delta on the `transactions` capability
(REQ-TX-15 REPLACED by reference to REQ-UI-1..11) in six
chained PRs against `develop`:

- **PR-1 `ui-primitives`** lands the design-system foundation:
  the token table at `app/_ui/tokens.css` (light theme + dark
  scope declared but unused), the `app/globals.css` import, the
  18 primitives in `app/_ui/primitives/` (`Button`, `Input`,
  `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Combobox`,
  `FieldError`, `FormField`, `Card` + sub-components, `Table` +
  sub-components, `Badge`, `EmptyState`, `Spinner`, `Skeleton`,
  `Pagination`, `Dialog`, `Breadcrumb`, `Link`), the 5 layout
  shell primitives (`PageHeader`, `PageContainer`,
  `BreadcrumbBar`, `Sidebar`, `Topbar`), the `_shared/cx.ts`
  helper, the `_shared/map-api-error.ts` helper, the public
  barrel `app/_ui/index.ts`, the internal `README.md`, and the
  co-located tests for each primitive. No production pages
  consume the primitives yet — that lands in PRs 2-4.

- **PR-2 `accounts-ui`** lands the accounts production renders:
  `app/accounts/error.tsx` (segment boundary), the production
  `AccountsListTable` (sort by Name / Currency / Last activity;
  Archived toggle; `Last activity` column from
  `?include=lastActivity`), the production `AccountDetail`
  (Card layout; currency badge + archived badge), the
  production `CreateAccountForm` (FormField + Input + Select +
  FieldError + Button; inline validation + loading state),
  the production `app/accounts/{page.tsx, [id]/page.tsx,
new/page.tsx}` (PageHeader + Card + EmptyState + Pagination
  on the list), and the co-located tests. The two existing
  smoke `page.tsx` files keep their `auth()` + `redirect()`
  gate and their `serverHonoRequest` data fetch — only the
  render is swapped.

- **PR-3 `transactions-ui`** lands the transactions production
  renders: `app/transactions/error.tsx`, the production
  `TransactionsListTable` (sort by Date / Native amount /
  Converted amount; cursor pagination via `nextCursor`; filter
  by account; direction badges), the production
  `TransactionDetailForms` (Card layout; edit form; delete
  Dialog with confirm), the production
  `CreateTransactionForm` (Combobox for account selection +
  inline validation + loading state), the production
  `app/transactions/{page.tsx, [id]/page.tsx, new/page.tsx}`,
  the new `transactions-list-table.test.tsx`, and the
  co-located tests.

- **PR-4 `dashboard-ui-refactor`** lands the dashboard refactor:
  `app/dashboard/error.tsx`, the new Client Component
  `DashboardAccountPicker` (Link-based navigation to
  `?accountId=<id>`), the new Client Component
  `DashboardMonthSwitcher` (Link-based prev / curr / next
  month; Dec→Jan rollover), the refactored
  `MonthlySummaryCard` / `CategoryBreakdownCard` /
  `AccountFlowCard` (Card + Table + Badge primitives), the
  refactored `app/dashboard/page.tsx` (reads `?accountId` and
  `?month` searchParams; renders the 1+2 grid on large
  viewports; stacked layout on small viewports), and the
  extended co-located tests. The three parallel
  `/api/reports/*` fetches are unchanged.

- **PR-5 `integration-tests`** lands the test suite: the
  axe-core a11y suite under `tests/a11y/` (one test per page;
  zero `critical` + `serious` violations), the visual snapshot
  suite under `tests/visual/` (one snapshot per primitive in
  empty / loading / error / populated state), and the three
  E2E happy paths under `tests/e2e/` (record expense; archive
  account; navigate to detail). If a Playwright runner is in
  place, the E2E suite is Playwright; otherwise the E2E paths
  remain as Vitest + Testing Library smoke tests.

- **PR-6 `docs-and-perf`** lands the documentation and the perf
  verification: `docs/architecture/ui.md` (token table +
  component inventory; REQ-UI-10), `docs/qa/transactions-ui.md`
  (manual QA checklist; REQ-UI-11),
  `docs/perf/transactions-ui.md` (Lighthouse output + perf
  budget verification; p95 < 2s on `/`, `/dashboard`,
  `/transactions` under simulated 4G + Moto G4), the three
  Spanish mirrors at `Documents-es/docs/...`, the
  `## [Unreleased]` entry on `CHANGELOG.md`, and the
  `sdd-archive` promotion of the delta specs to canonical
  (`openspec/specs/ui/spec.md` + the REQ-TX-15 REPLACED entry
  on `openspec/specs/transactions/spec.md`).

After the six PRs merge to `develop`, the canonical spec lands
at `openspec/specs/ui/spec.md` via `sdd-sync`, and
`transactions-ui` is archived at
`openspec/changes/archive/2026-06-27-transactions-ui/`.

---

## Sub-slice structure

### Slice 1 — `ui-primitives`

- **Branch**: `feat/ui-primitives`
- **Base**: `develop`
- **Scope (in)**:
  - Token table at `app/_ui/tokens.css` (light theme + dark
    scope under `[data-theme='dark']` declared but unused per
    REQ-UI-9). CSS custom properties: spacing scale
    (`--ui-space-{1..8}`), color roles (`--ui-bg`,
    `--ui-bg-muted`, `--ui-bg-subtle`, `--ui-fg`,
    `--ui-fg-muted`, `--ui-border`, `--ui-accent`,
    `--ui-accent-fg`, `--ui-danger`, `--ui-danger-fg`,
    `--ui-success`, `--ui-success-fg`, `--ui-warning`,
    `--ui-warning-fg`), radius scale (`--ui-rounded-{sm,md,
lg,full}`), elevation (`--ui-shadow-{sm,md,lg}`),
    typography scale (`--ui-text-{xs,sm,base,lg,xl,2xl,3xl}`
    - `--ui-font-{normal,medium,semibold,bold}`).
  - `app/globals.css` import of `app/_ui/tokens.css`.
  - Internal `_shared/cx.ts` (clsx-style className merge; no
    new dep).
  - Internal `_shared/map-api-error.ts` (pure function mapping
    `ErrorEnvelope` to `FieldErrorMap`; consumes the wire
    codes `INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`,
    `ACCOUNT_ARCHIVED`, `VALIDATION_ERROR`).
  - 18 primitives at `app/_ui/primitives/{button,input,
textarea,select,checkbox,radio-group,combobox,field-error,
form-field,card,card-header,card-body,card-footer,table,
table-header,table-body,table-row,table-cell,badge,
empty-state,spinner,skeleton,pagination,dialog,breadcrumb,
link}.tsx` plus co-located `*.test.tsx`. Server Component
    by default; `'use client'` ONLY on `Combobox` and `Dialog`.
  - 5 layout primitives at `app/_ui/layout/{page-header,
page-container,breadcrumb-bar,sidebar,topbar}.tsx`. All
    Server Components.
  - Public barrel `app/_ui/index.ts` (documentation; runtime
    uses path-based imports per design §2.3).
  - Internal `app/_ui/README.md` (developer-facing overview
    of the token table + primitive catalog).
- **Scope (out)**: production pages (`app/accounts/`,
  `app/transactions/`, `app/dashboard/`), the two additive
  query flags on `/api/accounts` and `/api/transactions`,
  axe-core suite, visual snapshot suite, E2E suite, design-
  system reference doc, manual QA checklist, perf budget
  verification, canonical spec sync.
- **Files touched** (concrete paths):
  - `app/_ui/tokens.css` (new, ~60 lines)
  - `app/_ui/README.md` (new, ~80 lines)
  - `app/_ui/index.ts` (new, ~30 lines)
  - `app/_ui/_shared/cx.ts` (new, ~20 lines)
  - `app/_ui/_shared/cx.test.ts` (new, ~30 lines)
  - `app/_ui/_shared/map-api-error.ts` (new, ~80 lines)
  - `app/_ui/_shared/map-api-error.test.ts` (new, ~120 lines)
  - `app/_ui/primitives/button.tsx` (new, ~70 lines) +
    `button.test.tsx` (~120 lines)
  - `app/_ui/primitives/input.tsx` (new, ~30 lines) +
    `input.test.tsx` (~60 lines)
  - `app/_ui/primitives/textarea.tsx` (new, ~30 lines) +
    `textarea.test.tsx` (~60 lines)
  - `app/_ui/primitives/select.tsx` (new, ~30 lines) +
    `select.test.tsx` (~60 lines)
  - `app/_ui/primitives/checkbox.tsx` (new, ~30 lines) +
    `checkbox.test.tsx` (~60 lines)
  - `app/_ui/primitives/radio-group.tsx` (new, ~50 lines) +
    `radio-group.test.tsx` (~80 lines)
  - `app/_ui/primitives/combobox.tsx` (new, ~120 lines;
    `'use client'`) + `combobox.test.tsx` (~120 lines)
  - `app/_ui/primitives/field-error.tsx` (new, ~25 lines) +
    `field-error.test.tsx` (~50 lines)
  - `app/_ui/primitives/form-field.tsx` (new, ~80 lines) +
    `form-field.test.tsx` (~120 lines)
  - `app/_ui/primitives/card.tsx` (new, ~25 lines) +
    `card-header.tsx` (~40 lines) + `card-body.tsx` (~15
    lines) + `card-footer.tsx` (~15 lines) + `card.test.tsx`
    (~80 lines)
  - `app/_ui/primitives/table.tsx` (new, ~25 lines) +
    `table-header.tsx` (~50 lines) + `table-body.tsx` (~15
    lines) + `table-row.tsx` (~15 lines) + `table-cell.tsx`
    (~15 lines) + `table.test.tsx` (~100 lines)
  - `app/_ui/primitives/badge.tsx` (new, ~30 lines) +
    `badge.test.tsx` (~60 lines)
  - `app/_ui/primitives/empty-state.tsx` (new, ~40 lines) +
    `empty-state.test.tsx` (~60 lines)
  - `app/_ui/primitives/spinner.tsx` (new, ~30 lines) +
    `spinner.test.tsx` (~50 lines)
  - `app/_ui/primitives/skeleton.tsx` (new, ~25 lines) +
    `skeleton.test.tsx` (~40 lines)
  - `app/_ui/primitives/pagination.tsx` (new, ~50 lines) +
    `pagination.test.tsx` (~70 lines)
  - `app/_ui/primitives/dialog.tsx` (new, ~70 lines; `'use
client'`) + `dialog.test.tsx` (~80 lines)
  - `app/_ui/primitives/breadcrumb.tsx` (new, ~40 lines) +
    `breadcrumb.test.tsx` (~50 lines)
  - `app/_ui/primitives/link.tsx` (new, ~30 lines) +
    `link.test.tsx` (~40 lines)
  - `app/_ui/layout/page-header.tsx` (new, ~40 lines)
  - `app/_ui/layout/page-container.tsx` (new, ~25 lines)
  - `app/_ui/layout/breadcrumb-bar.tsx` (new, ~25 lines)
  - `app/_ui/layout/sidebar.tsx` (new, ~25 lines) — exported
    for follow-up `ui-sidebar` change; NOT used in v1
  - `app/_ui/layout/topbar.tsx` (new, ~25 lines) — exported
    for follow-up; NOT used in v1
  - `app/_ui/layout/layout.test.tsx` (new, ~80 lines; renders
    PageHeader + PageContainer + BreadcrumbBar together)
  - `app/globals.css` (modified, +1 line: `@import
'./_ui/tokens.css';`)
- **Verification gate (slice 1)**:
  ```bash
  pnpm test app/_ui
  # → all primitive + layout + helper tests pass (≥ 80% coverage on app/_ui/)
  pnpm run typecheck
  # → 0 errors (TypeScript strict mode, no `any`)
  pnpm run lint
  # → 0 errors (max-warnings 0)
  pnpm run build
  # → bundle compiles; tokens.css minified to ≤ 1.5 KB
  git diff --stat develop
  # → LoC delta ≤ 480 (slice budget high end)
  git grep -E '\bdark:' app/_ui/
  # → 0 matches (REQ-UI-9)
  ```
- **Spanish mirror policy**: this slice does NOT touch any
  user-facing Markdown beyond the `tasks.md` pair. No
  `Documents-es/` updates required in slice 1.

### Slice 2 — `accounts-ui`

- **Branch**: `feat/ui-accounts`
- **Base**: `develop` (post-merge of slice 1)
- **Scope (in)**:
  - `app/accounts/error.tsx` (new) — segment-level error
    boundary using `Card` + `CardHeader` + `CardBody` +
    `Button` (per design §8.3).
  - `app/accounts/accounts-list-table.tsx` (modified) —
    Client Component (`'use client'`); sort by Name / Currency
    / Last activity (sortDirection via `aria-sort`); Archived
    toggle (`<label>` + `<input type="checkbox">`); `Last
activity` column from `lastActivityAt` (renders `—` when
    null); `<caption>` + `<th scope="col">` + `aria-sort` per
    REQ-UI-8.
  - `app/accounts/accounts-list-table.test.tsx` (modified,
    extended) — sort + archived toggle + empty state +
    `Last activity` rendering tests.
  - `app/accounts/[id]/account-detail.tsx` (modified) —
    Card layout with `CardHeader` (account name + currency
    badge + archived badge) + `CardBody` (key-value rows) +
    `CardFooter` (Edit + Archive actions).
  - `app/accounts/[id]/account-detail.test.tsx` (modified,
    extended) — Card layout snapshot + a11y tests.
  - `app/accounts/new/create-account-form.tsx` (modified) —
    Client Component using `FormField` + `Input` + `Select`
    - `FieldError` + `Button`; inline validation via
      `mapApiErrorToFieldError`; submit-button loading state via
      `useActionState` (`Spinner` + `disabled` + `aria-busy`
      per REQ-UI-7); submit logic unchanged.
  - `app/accounts/new/create-account-form.test.tsx` (modified,
    extended) — inline validation + loading state + a11y tests.
  - `app/accounts/page.tsx` (modified) — production render
    with `PageHeader` + `Card` + `AccountsListTable` +
    `EmptyState` + `Pagination`; auth gate + data fetch
    unchanged; `serverHonoRequest('/api/accounts?include=
lastActivity')`.
  - `app/accounts/[id]/page.tsx` (modified) — production
    render with `PageHeader` + `Card` + `AccountDetail`.
  - `app/accounts/new/page.tsx` (modified) — production
    render with `PageHeader` + `Card` + `CreateAccountForm`.
- **Scope (out)**: transactions pages, dashboard refactor,
  additive query flag for `/api/transactions`, axe-core
  suite, visual snapshot suite, design-system reference doc,
  canonical spec sync.
- **Files touched** (concrete paths):
  - `app/accounts/error.tsx` (new, ~40 lines) +
    `error.test.tsx` (~50 lines)
  - `app/accounts/accounts-list-table.tsx` (modified,
    ~150 lines net)
  - `app/accounts/accounts-list-table.test.tsx` (modified,
    +~80 lines; sort + archived toggle + empty + Last activity)
  - `app/accounts/[id]/account-detail.tsx` (modified,
    ~80 lines net)
  - `app/accounts/[id]/account-detail.test.tsx` (modified,
    +~50 lines)
  - `app/accounts/new/create-account-form.tsx` (modified,
    ~120 lines net)
  - `app/accounts/new/create-account-form.test.tsx` (modified,
    +~80 lines)
  - `app/accounts/page.tsx` (modified, ~80 lines net)
  - `app/accounts/[id]/page.tsx` (modified, ~30 lines net)
  - `app/accounts/new/page.tsx` (modified, ~20 lines net)
- **Verification gate (slice 2)**:
  ```bash
  pnpm test app/accounts
  # → all extended + new tests pass; coverage ≥ 80% on app/accounts/
  pnpm test app/_ui
  # → slice-1 tests still pass
  pnpm run typecheck
  pnpm run lint
  pnpm run build
  git diff --stat develop
  # → LoC delta ≤ 360 (slice budget high end)
  # Manual end-to-end check (developer terminal):
  pnpm dev
  # 1. Sign in via /auth/signin
  # 2. Visit /accounts → see the production table with sort headers + Archived toggle
  # 3. Toggle Show archived → archived accounts appear with a Badge
  # 4. Click Last activity header → rows re-sort
  # 5. Visit /accounts/<id> → see the production Card layout with badges
  # 6. Visit /accounts/new → submit form with empty name → see inline FieldError
  # 7. Submit form with valid name → land on /accounts/<new-id>
  ```
- **Spanish mirror policy**: same as slice 1.

### Slice 3 — `transactions-ui`

- **Branch**: `feat/ui-transactions`
- **Base**: `develop` (post-merge of slice 2)
- **Scope (in)**:
  - `app/transactions/error.tsx` (new) — segment-level error
    boundary (mirrors accounts error boundary).
  - `app/_components/transactions-list-table.tsx` (modified) —
    Client Component (`'use client'`); sort by Date (default
    DESC) / Native amount / Converted amount; cursor
    pagination via `nextCursor`; Direction badges (`INCOME`
    green, `EXPENSE` red per design §3.2.6); Account column
    from `accountName` (when `?include=accountName` is set);
    FX snapshot column (`fxAsOfSnapshot` formatted as relative
    time, e.g. "2 hours ago"); `<caption>` + `<th
scope="col">` + `aria-sort` per REQ-UI-8.
  - `app/_components/transactions-list-table.test.tsx` (new) —
    sort + pagination + direction badges + `accountName`
    rendering tests.
  - `app/transactions/[id]/transaction-detail-forms.tsx`
    (modified) — Card layout grouping fields into
    Identification / Amount / FX snapshot / Audit sections;
    edit form using `FormField` + `Input` + `Select`;
    delete button uses `Dialog` (Client Component) for
    confirm instead of the smoke page's `window.confirm()`;
    the FX snapshot section renders `fxAsOfSnapshot` +
    `casaSnapshot` as read-only fields.
  - `app/transactions/[id]/transaction-detail-forms.test.tsx`
    (new) — edit submit + delete confirm + FX snapshot
    render + a11y tests.
  - `app/transactions/new/create-transaction-form.tsx`
    (modified) — Client Component using `FormField` +
    `Combobox` (account selection; searches the live accounts
    list) + `Input` + `Select` + `Textarea` + `FieldError` +
    `Button`; inline validation via `mapApiErrorToFieldError`;
    submit-button loading state via `useActionState`
    (`Spinner` + `disabled` + `aria-busy` per REQ-UI-7).
  - `app/transactions/new/create-transaction-form.test.tsx`
    (modified, extended) — Combobox + inline validation +
    loading state + a11y tests.
  - `app/transactions/page.tsx` (modified) — production
    render with `PageHeader` + `Card` +
    `TransactionsListTable` + `EmptyState` + `Pagination`;
    auth gate + data fetch unchanged;
    `serverHonoRequest('/api/transactions?include=
accountName')`.
  - `app/transactions/[id]/page.tsx` (modified) — production
    render with `PageHeader` + `Card` + `TransactionDetailForms`.
  - `app/transactions/new/page.tsx` (modified) — production
    render with `PageHeader` + `Card` + `CreateTransactionForm`.
- **Scope (out)**: dashboard refactor, accounts pages
  (already done in slice 2), axe-core suite, visual snapshot
  suite, design-system reference doc, canonical spec sync.
- **Files touched** (concrete paths):
  - `app/transactions/error.tsx` (new, ~40 lines) +
    `error.test.tsx` (~50 lines)
  - `app/_components/transactions-list-table.tsx` (modified,
    ~180 lines net)
  - `app/_components/transactions-list-table.test.tsx` (new,
    ~140 lines)
  - `app/transactions/[id]/transaction-detail-forms.tsx`
    (modified, ~150 lines net)
  - `app/transactions/[id]/transaction-detail-forms.test.tsx`
    (new, ~120 lines)
  - `app/transactions/new/create-transaction-form.tsx`
    (modified, ~160 lines net)
  - `app/transactions/new/create-transaction-form.test.tsx`
    (modified, +~120 lines)
  - `app/transactions/page.tsx` (modified, ~80 lines net)
  - `app/transactions/[id]/page.tsx` (modified, ~30 lines net)
  - `app/transactions/new/page.tsx` (modified, ~20 lines net)
- **Verification gate (slice 3)**:
  ```bash
  pnpm test app/transactions app/_components
  # → all extended + new tests pass; coverage ≥ 80% on app/transactions/
  pnpm test app/_ui app/accounts
  # → slice-1 + slice-2 tests still pass
  pnpm run typecheck
  pnpm run lint
  pnpm run build
  git diff --stat develop
  # → LoC delta ≤ 460 (slice budget high end)
  # Manual end-to-end check (developer terminal):
  pnpm dev
  # 1. Sign in via /auth/signin
  # 2. Visit /transactions with 3 ARS + 2 USD transactions → see the production table with sort headers
  # 3. Click Date header → rows re-sort
  # 4. Click Next page → cursor advances
  # 5. Visit /transactions/<id> → see the Card layout with the FX snapshot section
  # 6. Edit only the memo → submit → verify the FX snapshot section is unchanged
  # 7. Click Delete → see the Dialog → click Confirm → land on /transactions
  # 8. Visit /transactions/new with no accounts → see Combobox empty state
  # 9. Create an account first → return → Combobox is populated
  # 10. Submit form with amountMinor=0 → see inline INVALID_AMOUNT error
  ```
- **Spanish mirror policy**: same as slice 1.

### Slice 4 — `dashboard-ui-refactor`

- **Branch**: `feat/ui-dashboard-refactor`
- **Base**: `develop` (post-merge of slice 3)
- **Scope (in)**:
  - `app/dashboard/error.tsx` (new) — segment-level error
    boundary (mirrors the other two segments).
  - `app/_components/dashboard-account-picker.tsx` (new) —
    Client Component (`'use client'`); renders `<Link>`s for
    each account; `aria-current="page"` on the currently-
    selected account; `aria-label="Account picker"` on the
    `<nav>`.
  - `app/_components/dashboard-account-picker.test.tsx` (new)
    — render + a11y + selection-state tests.
  - `app/_components/dashboard-month-switcher.tsx` (new) —
    Client Component (`'use client'`); renders `<Link>`s for
    previous / current / next month; Dec→Jan rollover edge
    case; default to current UTC month when no `?month=` is
    present; `aria-label="Month switcher"` on the `<nav>`.
  - `app/_components/dashboard-month-switcher.test.tsx`
    (new) — render + edge case (Dec→Jan, Jan→Dec) + a11y
    tests.
  - `app/_components/dashboard-monthly-summary.tsx`
    (modified) — production render using `Card` +
    `CardHeader` (title + UTC month label) + `CardBody`
    (totals `Table` with `Badge` for direction) +
    `CardFooter` (CTA to `/transactions/new` on empty);
    data shape unchanged.
  - `app/_components/dashboard-monthly-summary.test.tsx`
    (modified, extended) — empty + populated snapshots.
  - `app/_components/dashboard-category-breakdown.tsx`
    (modified) — production render using `Card` +
    `CardHeader` + `CardBody` (buckets `Table` sorted by
    `amountMinor DESC`) + `EmptyState` (when buckets is
    empty); data shape unchanged.
  - `app/_components/dashboard-category-breakdown.test.tsx`
    (modified, extended) — empty + populated snapshots +
    sort-order assertion.
  - `app/_components/dashboard-account-flow.tsx` (modified)
    — production render using `Card` + `CardHeader` (title
    - `DashboardAccountPicker` slot) + `CardBody` (days
      `Table`) + `EmptyState` (when no `?accountId=` is set
      OR when the account has no flow); data shape unchanged.
  - `app/_components/dashboard-account-flow.test.tsx`
    (modified, extended) — empty + populated (accountId
    set) + no-accountId snapshots.
  - `app/dashboard/page.tsx` (modified) — production render
    reading `?accountId` and `?month` searchParams; calls
    `/api/reports/monthly?month=...`,
    `/api/reports/breakdown?month=...`, and (when
    `?accountId=` is set)
    `/api/reports/accounts/:id/flow?month=...` in parallel
    via `Promise.all`; renders the three cards in a 1+2 grid
    on large viewports and a stacked layout on small
    viewports; the `DashboardMonthSwitcher` lives in the
    `PageHeader.actions` slot; the `DashboardAccountPicker`
    lives in the `AccountFlowCard`'s header; auth gate +
    parallel fetch unchanged.
  - `app/dashboard/page.test.tsx` (modified, extended) —
    empty + populated + `?accountId=` + `?month=` snapshots.
  - `app/dashboard/page.seeded.test.tsx` (modified,
    extended) — seeded-data happy-path snapshots.
- **Scope (out)**: axe-core suite, visual snapshot suite,
  design-system reference doc, manual QA checklist, perf
  budget verification, canonical spec sync.
- **Files touched** (concrete paths):
  - `app/dashboard/error.tsx` (new, ~40 lines) +
    `error.test.tsx` (~50 lines)
  - `app/_components/dashboard-account-picker.tsx` (new,
    ~50 lines) + `dashboard-account-picker.test.tsx`
    (~70 lines)
  - `app/_components/dashboard-month-switcher.tsx` (new,
    ~70 lines) + `dashboard-month-switcher.test.tsx`
    (~90 lines)
  - `app/_components/dashboard-monthly-summary.tsx`
    (modified, ~60 lines net)
  - `app/_components/dashboard-monthly-summary.test.tsx`
    (modified, +~40 lines)
  - `app/_components/dashboard-category-breakdown.tsx`
    (modified, ~60 lines net)
  - `app/_components/dashboard-category-breakdown.test.tsx`
    (modified, +~50 lines)
  - `app/_components/dashboard-account-flow.tsx`
    (modified, ~80 lines net)
  - `app/_components/dashboard-account-flow.test.tsx`
    (modified, +~60 lines)
  - `app/dashboard/page.tsx` (modified, ~80 lines net)
  - `app/dashboard/page.test.tsx` (modified, +~50 lines)
  - `app/dashboard/page.seeded.test.tsx` (modified,
    +~40 lines)
- **Verification gate (slice 4)**:
  ```bash
  pnpm test app/dashboard app/_components
  # → all extended + new tests pass; coverage ≥ 80% on app/dashboard/ + app/_components/
  pnpm test app/_ui app/accounts app/transactions
  # → slice-1 + slice-2 + slice-3 tests still pass
  pnpm run typecheck
  pnpm run lint
  pnpm run build
  git diff --stat develop
  # → LoC delta ≤ 340 (slice budget high end)
  # Manual end-to-end check (developer terminal):
  pnpm dev
  # 1. Sign in via /auth/signin
  # 2. Visit /dashboard with no transactions → see the EmptyState + CTA to /transactions/new
  # 3. Click the CTA → /transactions/new loads
  # 4. Back to /dashboard with transactions → see the three populated cards in the 1+2 grid
  # 5. Pick an account from the DashboardAccountPicker → see the per-account flow card populate
  # 6. Switch the month via the DashboardMonthSwitcher → see the summary + breakdown update
  # 7. Test the Dec→Jan rollover edge case (visit ?month=2026-12 → click Next → ?month=2027-01)
  ```
- **Spanish mirror policy**: same as slice 1.

### Slice 5 — `integration-tests`

- **Branch**: `feat/ui-integration-tests`
- **Base**: `develop` (post-merge of slice 4)
- **Scope (in)**:
  - **axe-core a11y suite** at `tests/a11y/` — Vitest +
    `vitest-axe` (per design §13.4). Three page-level tests
    that render each page with authenticated seed data and
    assert `expect(await axe(container)).toHaveNoViolations()`.
    The assertion fails on any `critical` or `serious`
    violation. `moderate` and `minor` are logged but not
    blocking.
  - **Visual snapshot suite** at `tests/visual/` — Vitest
    snapshot. One snapshot per presentational primitive in
    its primary state (and loading / error / populated state
    where applicable): `Card`, `Badge`, `EmptyState`,
    `Skeleton`, `Breadcrumb`, `Pagination`, `Dialog`,
    `Combobox`, `Button`, `Input`, `Select`, `Textarea`,
    `FieldError`. Snapshot files live at
    `tests/visual/__snapshots__/`.
  - **E2E happy paths** at `tests/e2e/` — three flows:
    1. Sign in → record a USD expense against an ARS casa
       → verify the dashboard reflects the converted
       amount.
    2. Sign in → archive an account → verify it disappears
       from the active list and appears behind the `Show
archived` toggle.
    3. Sign in → navigate to `/accounts/X` → verify the
       balance widget renders the casa-converted amount.
       If a Playwright runner is in place, the suite is
       Playwright; otherwise the flows remain as Vitest +
       Testing Library smoke tests.
  - **No production code changes.** This slice is
    test-only.
- **Scope (out)**: design-system reference doc, manual QA
  checklist, perf budget verification, canonical spec sync.
- **Files touched** (concrete paths):
  - `tests/a11y/accounts.test.tsx` (new, ~40 lines)
  - `tests/a11y/transactions.test.tsx` (new, ~40 lines)
  - `tests/a11y/dashboard.test.tsx` (new, ~40 lines)
  - `tests/visual/card.test.tsx` (new, ~30 lines)
  - `tests/visual/badge.test.tsx` (new, ~30 lines)
  - `tests/visual/empty-state.test.tsx` (new, ~30 lines)
  - `tests/visual/skeleton.test.tsx` (new, ~20 lines)
  - `tests/visual/breadcrumb.test.tsx` (new, ~30 lines)
  - `tests/visual/pagination.test.tsx` (new, ~30 lines)
  - `tests/visual/dialog.test.tsx` (new, ~40 lines)
  - `tests/visual/combobox.test.tsx` (new, ~40 lines)
  - `tests/visual/button.test.tsx` (new, ~30 lines)
  - `tests/visual/input.test.tsx` (new, ~20 lines)
  - `tests/visual/select.test.tsx` (new, ~30 lines)
  - `tests/visual/textarea.test.tsx` (new, ~20 lines)
  - `tests/visual/field-error.test.tsx` (new, ~20 lines)
  - `tests/e2e/record-expense.test.tsx` (new, ~80 lines;
    or `.test.ts` if Playwright)
  - `tests/e2e/archive-account.test.tsx` (new, ~80 lines;
    or `.test.ts` if Playwright)
  - `tests/e2e/navigate-to-detail.test.tsx` (new, ~80
    lines; or `.test.ts` if Playwright)
  - `vitest.config.ts` (modified, +~20 lines; adds the
    `tests/` test include path and the `vitest-axe`
    setup file if needed)
- **Verification gate (slice 5)**:
  ```bash
  pnpm test tests/a11y
  # → zero critical + serious axe violations on accounts + transactions + dashboard
  pnpm test tests/visual
  # → all visual snapshots stable; drift requires --update
  pnpm test tests/e2e
  # → three E2E happy paths green (Vitest + Testing Library or Playwright)
  pnpm test app/_ui app/accounts app/transactions app/dashboard app/_components
  # → slice-1..4 tests still pass
  pnpm run typecheck
  pnpm run lint
  pnpm run build
  git diff --stat develop
  # → LoC delta ≤ 320 (slice budget high end)
  ```
- **Spanish mirror policy**: same as slice 1.

### Slice 6 — `docs-and-perf`

- **Branch**: `feat/ui-docs-and-perf`
- **Base**: `develop` (post-merge of slice 5)
- **Scope (in)**:
  - `docs/architecture/ui.md` (new) — design-system
    reference. Codifies REQ-UI-10 (every primitive is
    documented). Contains the token table (light + dark
    CSS scope), the primitive component inventory (one
    row per primitive with its props shape + a11y
    contract), and the layout shell inventory.
  - `Documents-es/docs/architecture/ui.md` (new) — Spanish
    mirror per root `AGENTS.md` §13.
  - `docs/qa/transactions-ui.md` (new) — manual QA
    checklist. Codifies REQ-UI-11 (manual QA owner is the
    user). Covers: keyboard navigation across every page
    (Tab order, focus visible, Enter/Space activation,
    Escape to close dialogs); screen reader run-through on
    every page (VoiceOver on macOS, NVDA on Windows) —
    landmarks, headings, table headers, form labels, error
    announcements; dark mode follow-up note (out of scope
    for v1).
  - `Documents-es/docs/qa/transactions-ui.md` (new) —
    Spanish mirror.
  - `docs/perf/transactions-ui.md` (new) — Lighthouse +
    perf budget verification output. The verification
    command is `pnpm build && pnpm start` + Lighthouse CLI
    under simulated 4G + Moto G4. The assertion is p95
    page load < 2s on `/`, `/dashboard`, and `/transactions`
    (root `AGENTS.md` §10.5).
  - `Documents-es/docs/perf/transactions-ui.md` (new) —
    Spanish mirror.
  - `CHANGELOG.md` (modified) — `## [Unreleased]` → Added
    section listing the new design-system primitives and
    the production UI surfaces (per Keep a Changelog
    convention; root `AGENTS.md` §5.5).
  - `openspec/specs/ui/spec.md` (created by `sdd-archive`)
    — the canonical spec promoted from the delta at
    `openspec/changes/transactions-ui/specs/ui/spec.md`.
    The `sdd-archive` phase handles this promotion; the
    PR includes the canonical in the same commit per
    root `AGENTS.md` §13.3.
  - `openspec/specs/transactions/spec.md` (modified by
    `sdd-archive`) — REQ-TX-15 REPLACED by thin pointer to
    `openspec/specs/ui/spec.md`. The `sdd-archive` phase
    handles this replacement; the PR includes the
    canonical in the same commit.
- **Scope (out)**: any production code change. Slice 6 is
  docs + perf verification + archive only.
- **Files touched** (concrete paths):
  - `docs/architecture/ui.md` (new, ~250 lines)
  - `Documents-es/docs/architecture/ui.md` (new, ~250
    lines)
  - `docs/qa/transactions-ui.md` (new, ~150 lines)
  - `Documents-es/docs/qa/transactions-ui.md` (new, ~150
    lines)
  - `docs/perf/transactions-ui.md` (new, ~80 lines)
  - `Documents-es/docs/perf/transactions-ui.md` (new, ~80
    lines)
  - `CHANGELOG.md` (modified, +~30 lines under `##
[Unreleased]`)
  - `openspec/specs/ui/spec.md` (created, lifted from the
    delta by `sdd-archive`)
  - `openspec/specs/transactions/spec.md` (modified,
    REQ-TX-15 replaced by `sdd-archive`)
- **Verification gate (slice 6)**:
  ```bash
  ls docs/architecture/ui.md docs/qa/transactions-ui.md docs/perf/transactions-ui.md
  # → all three exist
  ls Documents-es/docs/architecture/ui.md Documents-es/docs/qa/transactions-ui.md Documents-es/docs/perf/transactions-ui.md
  # → all three ES mirrors exist
  grep -c '## \[Unreleased\]' CHANGELOG.md
  # → 1 (the new entry)
  ls openspec/specs/ui/spec.md
  # → exists; promoted by sdd-archive
  grep -E '^## REQ-TX-15' openspec/specs/transactions/spec.md
  # → absent (or references ui/spec.md per the REPLACED delta)
  # Manual Lighthouse run (developer terminal):
  pnpm build && pnpm start &
  npx lighthouse http://localhost:3000/ --form-factor=mobile --throttling-method=simulate --output=json --output-path=./lighthouse-root.json
  npx lighthouse http://localhost:3000/dashboard --form-factor=mobile --throttling-method=simulate --output=json --output-path=./lighthouse-dashboard.json
  npx lighthouse http://localhost:3000/transactions --form-factor=mobile --throttling-method=simulate --output=json --output-path=./lighthouse-transactions.json
  # → p95 page load < 2s on each page (Lighthouse "Total Blocking Time" + "Largest Contentful Paint")
  # → paste the JSON summaries into docs/perf/transactions-ui.md
  # Manual QA sign-off (user-owned):
  # → user runs docs/qa/transactions-ui.md checklist; verifies keyboard nav + screen reader + sign-off section
  git diff --stat develop
  # → LoC delta ≤ 260 (slice budget high end)
  ```
- **Spanish mirror policy**: same as slice 1 + the three
  new `Documents-es/docs/{architecture,qa,perf}/...md`
  mirrors in the same commits per root `AGENTS.md` §13.3
  atomicity.

---

## Tasks per slice

### Slice 1 — `ui-primitives` (29 tasks)

> Ordered so a single commit lands one focus. The RED test
> for the first primitive (T-UI-003) lands BEFORE the GREEN
> implementation (T-UI-004) so the RED commit is reviewable.
> The token table (T-UI-001) and the `globals.css` import
> (T-UI-002) land BEFORE any primitive test.

| ID       | Title                                                                                  | Slice         | File(s)                                                                                                           | Type      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                         | Test command                                        | Acceptance                                                                                                              | Commit                                                                                                                                                      | Dependency                                                                                                                                                                         | Status                                            |
| -------- | -------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------- | ------- |
| T-UI-001 | GREEN: token table at `app/_ui/tokens.css` (light + dark CSS scope)                    | ui-primitives | `app/_ui/tokens.css` (new)                                                                                        | green     | Implements the token table per design §3.1. Spacing scale (`--ui-space-{1..8}`), color roles (`--ui-bg` ... `--ui-warning-fg`), radius scale (`--ui-rounded-{sm,md,lg,full}`), elevation (`--ui-shadow-{sm,md,lg}`), typography scale (`--ui-text-{xs..3xl}` + `--ui-font-{normal,medium,semibold,bold}`). Dark scope under `[data-theme='dark']` declared but unused (REQ-UI-9).                                                                   | `pnpm run build` (verifies CSS compiles)            | (1) `pnpm run build` exits 0; (2) `git grep -E '\bdark:' app/_ui/` returns 0 matches; (3) tokens.css minified ≤ 1.5 KB. | `feat(ui-primitives): token table with light + dark CSS scope`                                                                                              | —                                                                                                                                                                                  | pending                                           |
| T-UI-002 | GREEN: `app/globals.css` imports `app/_ui/tokens.css`                                  | ui-primitives | `app/globals.css` (modified, +1 line)                                                                             | green     | Adds `@import './_ui/tokens.css';` after the existing `@tailwind` directives. Tailwind v4 hoists the import to a single CSS file at build time; the token CSS variables become available globally.                                                                                                                                                                                                                                                  | `pnpm run build`                                    | (1) `pnpm run build` exits 0; (2) tokens.css appears in the built CSS bundle.                                           | `feat(ui-primitives): globals.css imports tokens.css`                                                                                                       | T-UI-001                                                                                                                                                                           | pending                                           |
| T-UI-003 | RED: Button test renders primary variant + a11y contract                               | ui-primitives | `app/_ui/primitives/button.test.tsx` (new)                                                                        | red       | Per design §15.1: tests (1) primary variant renders `bg-ui-accent` + `text-ui-accent-fg`; (2) renders focus-visible ring class; (3) loading state renders `Spinner` + `disabled` + `aria-busy="true"`; (4) custom `className` is appended. Test fails because the file does not exist.                                                                                                                                                              | `pnpm test app/_ui/primitives/button.test.tsx`      | (1) Test fails with "cannot find module"; (2) `pnpm typecheck` exits 0.                                                 | `test(ui-primitives): Button test renders primary variant + a11y contract`                                                                                  | T-UI-002                                                                                                                                                                           | pending                                           |
| T-UI-004 | GREEN: implement Button primitive (forwardRef + variant + isLoading)                   | ui-primitives | `app/_ui/primitives/button.tsx` (new)                                                                             | green     | Implements `Button` per design §3.2.1 + §7.1. Variants: `primary                                                                                                                                                                                                                                                                                                                                                                                    | secondary                                           | ghost                                                                                                                   | danger`. `isLoading`renders`<Spinner aria-label="Loading" size="sm" />`+`disabled`+`aria-busy="true"`. `focus-visible:ring-2 focus-visible:ring-ui-accent`. | `pnpm test app/_ui/primitives/button.test.tsx`                                                                                                                                     | (1) All tests pass; (2) `pnpm typecheck` exits 0. | `feat(ui-primitives): Button primitive (forwardRef + variant + isLoading)` | T-UI-003                                                            | pending  |
| T-UI-005 | RED → GREEN: Input primitive + test (id required + aria-describedby via FormField)     | ui-primitives | `app/_ui/primitives/input.tsx` (new) + `input.test.tsx` (new)                                                     | red+green | `id` is required (TypeScript). Forwards all `<input>` attrs. The test asserts (1) `id` is required at compile time; (2) renders `<input>` with the right `id`; (3) `aria-describedby` and `aria-invalid` pass-through when set.                                                                                                                                                                                                                     | `pnpm test app/_ui/primitives/input.test.tsx`       | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                                       | `feat(ui-primitives): Input primitive (id required + aria pass-through)`                                                                                    | T-UI-002                                                                                                                                                                           | pending                                           |
| T-UI-006 | RED → GREEN: Textarea primitive + test                                                 | ui-primitives | `app/_ui/primitives/textarea.tsx` (new) + `textarea.test.tsx` (new)                                               | red+green | Same shape as `Input` (id required + aria pass-through). The test asserts the render + the `id` requirement.                                                                                                                                                                                                                                                                                                                                        | `pnpm test app/_ui/primitives/textarea.test.tsx`    | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                                       | `feat(ui-primitives): Textarea primitive + test`                                                                                                            | T-UI-005                                                                                                                                                                           | pending                                           |
| T-UI-007 | RED → GREEN: Select primitive + test (native `<select>`)                               | ui-primitives | `app/_ui/primitives/select.tsx` (new) + `select.test.tsx` (new)                                                   | red+green | Native `<select>` with `id` + `options` props. The test asserts (1) renders `<select>` with the right `id`; (2) renders one `<option>` per `options[i]`; (3) `aria-describedby` pass-through.                                                                                                                                                                                                                                                       | `pnpm test app/_ui/primitives/select.test.tsx`      | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                                       | `feat(ui-primitives): Select primitive (native select)`                                                                                                     | T-UI-005                                                                                                                                                                           | pending                                           |
| T-UI-008 | RED → GREEN: Checkbox primitive + test                                                 | ui-primitives | `app/_ui/primitives/checkbox.tsx` (new) + `checkbox.test.tsx` (new)                                               | red+green | Native `<input type="checkbox">` with `id` + `checked` + `onChange` props. The test asserts the render + the checked/unchecked state.                                                                                                                                                                                                                                                                                                               | `pnpm test app/_ui/primitives/checkbox.test.tsx`    | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                                       | `feat(ui-primitives): Checkbox primitive + test`                                                                                                            | T-UI-005                                                                                                                                                                           | pending                                           |
| T-UI-009 | RED → GREEN: RadioGroup primitive + test (`<fieldset>` + `<legend>` + items)           | ui-primitives | `app/_ui/primitives/radio-group.tsx` (new) + `radio-group.test.tsx` (new)                                         | red+green | Composed of `<fieldset>` + `<legend>` + `<input type="radio">` items. `name` + `value` + `onChange` props. The test asserts (1) renders `<fieldset>` with `<legend>`; (2) renders one `<input type="radio">` per item; (3) marks `checked` on the matching value.                                                                                                                                                                                   | `pnpm test app/_ui/primitives/radio-group.test.tsx` | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                                       | `feat(ui-primitives): RadioGroup primitive + test`                                                                                                          | T-UI-008                                                                                                                                                                           | pending                                           |
| T-UI-010 | RED: Combobox Client Component test (searchable + keyboard nav)                        | ui-primitives | `app/_ui/primitives/combobox.test.tsx` (new)                                                                      | red       | Per design §3.2.8. Tests (1) renders a `<select>` (semantic) + `<input type="search">` (visual); (2) options list renders one `<option>` per item; (3) `onChange` fires on selection; (4) disabled options render with `disabled` attribute. Test fails because the file does not exist.                                                                                                                                                            | `pnpm test app/_ui/primitives/combobox.test.tsx`    | (1) Test fails with "cannot find module"; (2) `pnpm typecheck` exits 0.                                                 | `test(ui-primitives): Combobox Client Component test`                                                                                                       | T-UI-002                                                                                                                                                                           | pending                                           |
| T-UI-011 | GREEN: implement Combobox primitive (`'use client'` + search + keyboard nav)           | ui-primitives | `app/_ui/primitives/combobox.tsx` (new)                                                                           | green     | Hand-built on `<select>` + `<input type="search">` + `useState` for the search query. Keyboard nav: `ArrowDown` / `ArrowUp` navigate options; `Enter` selects; `Escape` closes. No new dep (no downshift, no Radix).                                                                                                                                                                                                                                | `pnpm test app/_ui/primitives/combobox.test.tsx`    | (1) All tests pass; (2) `pnpm typecheck` exits 0; (3) `'use client'` directive at the top of the file.                  | `feat(ui-primitives): Combobox primitive (hand-built, no new dep)`                                                                                          | T-UI-010                                                                                                                                                                           | pending                                           |
| T-UI-012 | RED → GREEN: FieldError primitive + test (`role="alert"` + `aria-live`)                | ui-primitives | `app/_ui/primitives/field-error.tsx` (new) + `field-error.test.tsx` (new)                                         | red+green | Renders `<div role="alert" aria-live="polite" aria-atomic="true">` with the `message`. The test asserts the ARIA attributes.                                                                                                                                                                                                                                                                                                                        | `pnpm test app/_ui/primitives/field-error.test.tsx` | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                                       | `feat(ui-primitives): FieldError primitive + test`                                                                                                          | T-UI-002                                                                                                                                                                           | pending                                           |
| T-UI-013 | RED → GREEN: FormField primitive + test (`<label htmlFor>` + aria-describedby)         | ui-primitives | `app/_ui/primitives/form-field.tsx` (new) + `form-field.test.tsx` (new)                                           | red+green | Composes Label + control + FieldError. Renders `<label htmlFor={id}>`; sets `aria-describedby` + `aria-invalid` on children when `error` is present. The test asserts (1) `<label htmlFor>` matches `id`; (2) `aria-describedby` set when error present; (3) children cloned with `aria-invalid="true"`.                                                                                                                                            | `pnpm test app/_ui/primitives/form-field.test.tsx`  | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                                       | `feat(ui-primitives): FormField primitive + test`                                                                                                           | T-UI-005, T-UI-012                                                                                                                                                                 | pending                                           |
| T-UI-014 | RED → GREEN: Card + CardHeader + CardBody + CardFooter compound primitive + test       | ui-primitives | `app/_ui/primitives/{card,card-header,card-body,card-footer}.tsx` (4 new) + `card.test.tsx` (new)                 | red+green | Per design §3.2.4 + §7.1. `Card` renders `<article>`; `CardHeader` renders `<header>` with `<h2>` title + optional badge + actions slots; `CardBody` + `CardFooter` are content slots. The test asserts (1) compound pattern (Card with CardHeader + CardBody + CardFooter children); (2) `<h2>` title in CardHeader; (3) badge + actions rendered.                                                                                                 | `pnpm test app/_ui/primitives/card.test.tsx`        | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                                       | `feat(ui-primitives): Card + sub-components (compound pattern)`                                                                                             | T-UI-002                                                                                                                                                                           | pending                                           |
| T-UI-015 | RED → GREEN: Table + TableHeader + TableBody + TableRow + TableCell primitive + test   | ui-primitives | `app/_ui/primitives/{table,table-header,table-body,table-row,table-cell}.tsx` (5 new) + `table.test.tsx` (new)    | red+green | Per design §3.2.5 + §7.1. `Table` requires `caption` prop; `TableHeader` requires `columns` prop; renders `<th scope="col">` per column; sortable columns render `aria-sort` reflecting `sortDirection` + a `<button>` inside the `<th>` for keyboard activation. The test asserts (1) `<caption>` rendered (visible or `sr-only`); (2) `<th scope="col">` per column; (3) `aria-sort` reflecting direction; (4) `<button>` inside sortable `<th>`. | `pnpm test app/_ui/primitives/table.test.tsx`       | (1) All tests pass; (2) `pnpm typecheck` exits 0; (3) `caption` is required at compile time (TypeScript).               | `feat(ui-primitives): Table + sub-components (compound + caption + scope + aria-sort)`                                                                      | T-UI-002                                                                                                                                                                           | pending                                           |
| T-UI-016 | RED → GREEN: Badge primitive + test (variant + direction badges)                       | ui-primitives | `app/_ui/primitives/badge.tsx` (new) + `badge.test.tsx` (new)                                                     | red+green | Per design §3.2.6. Variants: `neutral                                                                                                                                                                                                                                                                                                                                                                                                               | accent                                              | success                                                                                                                 | warning                                                                                                                                                     | danger`. `INCOME`maps to`success`; `EXPENSE`maps to`danger`. The test asserts (1) each variant renders the right class; (2) INCOME/EXPENSE helper functions; (3) renders children. | `pnpm test app/_ui/primitives/badge.test.tsx`     | (1) All tests pass; (2) `pnpm typecheck` exits 0.                          | `feat(ui-primitives): Badge primitive + test (variant + direction)` | T-UI-002 | pending |
| T-UI-017 | RED → GREEN: EmptyState primitive + test (`role="status"` + CTA first focusable)       | ui-primitives | `app/_ui/primitives/empty-state.tsx` (new) + `empty-state.test.tsx` (new)                                         | red+green | Per design §3.2.7. Renders `<div role="status">` with title + description + optional illustration + optional CTA. CTA is the first focusable element when present. The test asserts (1) `role="status"`; (2) CTA is the first focusable; (3) optional illustration renders.                                                                                                                                                                         | `pnpm test app/_ui/primitives/empty-state.test.tsx` | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                                       | `feat(ui-primitives): EmptyState primitive + test`                                                                                                          | T-UI-002                                                                                                                                                                           | pending                                           |
| T-UI-018 | RED → GREEN: Spinner primitive + test (`role="status"` + `aria-label`)                 | ui-primitives | `app/_ui/primitives/spinner.tsx` (new) + `spinner.test.tsx` (new)                                                 | red+green | Per design §3.2.8. Inline SVG with `role="status"` + `aria-label` (default `"Loading"`). The test asserts the ARIA attributes.                                                                                                                                                                                                                                                                                                                      | `pnpm test app/_ui/primitives/spinner.test.tsx`     | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                                       | `feat(ui-primitives): Spinner primitive + test`                                                                                                             | T-UI-002                                                                                                                                                                           | pending                                           |
| T-UI-019 | RED → GREEN: Skeleton primitive + test (`aria-hidden="true"`)                          | ui-primitives | `app/_ui/primitives/skeleton.tsx` (new) + `skeleton.test.tsx` (new)                                               | red+green | Animated placeholder with `aria-hidden="true"`. The test asserts (1) `aria-hidden="true"`; (2) renders width/height as inline styles.                                                                                                                                                                                                                                                                                                               | `pnpm test app/_ui/primitives/skeleton.test.tsx`    | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                                       | `feat(ui-primitives): Skeleton primitive + test`                                                                                                            | T-UI-002                                                                                                                                                                           | pending                                           |
| T-UI-020 | RED → GREEN: Pagination primitive + test (`<nav aria-label>` + `<Link>` controls)      | ui-primitives | `app/_ui/primitives/pagination.tsx` (new) + `pagination.test.tsx` (new)                                           | red+green | Server-rendered `<nav aria-label="Pagination">` with `<Link>` controls (Previous / page N / Next). Each `<Link>` carries `aria-label`. The test asserts (1) `<nav aria-label="Pagination">`; (2) one `<Link>` per page; (3) `aria-label` on each control.                                                                                                                                                                                           | `pnpm test app/_ui/primitives/pagination.test.tsx`  | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                                       | `feat(ui-primitives): Pagination primitive + test`                                                                                                          | T-UI-002                                                                                                                                                                           | pending                                           |
| T-UI-021 | RED: Dialog Client Component test (focus trap + Escape closes)                         | ui-primitives | `app/_ui/primitives/dialog.test.tsx` (new)                                                                        | red       | Per design §3.2.9. Tests (1) renders `<dialog role="dialog" aria-modal="true">`; (2) `aria-labelledby` points to title id; (3) `aria-describedby` points to description id; (4) `onClose` fires on Escape; (5) focus trap (first focusable element receives focus on open). Test fails because the file does not exist.                                                                                                                             | `pnpm test app/_ui/primitives/dialog.test.tsx`      | (1) Test fails with "cannot find module"; (2) `pnpm typecheck` exits 0.                                                 | `test(ui-primitives): Dialog Client Component test`                                                                                                         | T-UI-002                                                                                                                                                                           | pending                                           |
| T-UI-022 | GREEN: implement Dialog primitive (`'use client'` + native `<dialog>` + focus trap)    | ui-primitives | `app/_ui/primitives/dialog.tsx` (new)                                                                             | green     | Wraps the native HTML5 `<dialog>` element. The `open` attribute controls visibility; `Escape` fires `onClose` (native behavior); focus trap is handled by the native element. The `useState` controls `isOpen`.                                                                                                                                                                                                                                     | `pnpm test app/_ui/primitives/dialog.test.tsx`      | (1) All tests pass; (2) `pnpm typecheck` exits 0; (3) `'use client'` directive at the top of the file.                  | `feat(ui-primitives): Dialog primitive (native dialog + focus trap)`                                                                                        | T-UI-021                                                                                                                                                                           | pending                                           |
| T-UI-023 | RED → GREEN: Breadcrumb primitive + test (`<nav aria-label>` + `<ol>` + `<Link>`s)     | ui-primitives | `app/_ui/primitives/breadcrumb.tsx` (new) + `breadcrumb.test.tsx` (new)                                           | red+green | Server-rendered `<nav aria-label="Breadcrumb"><ol>` with `<Link>` items. The test asserts (1) `<nav aria-label="Breadcrumb">`; (2) one `<li>` per item; (3) last item is `aria-current="page"`.                                                                                                                                                                                                                                                     | `pnpm test app/_ui/primitives/breadcrumb.test.tsx`  | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                                       | `feat(ui-primitives): Breadcrumb primitive + test`                                                                                                          | T-UI-002                                                                                                                                                                           | pending                                           |
| T-UI-024 | RED → GREEN: Link primitive + test (Next.js Link wrapper + focus ring)                 | ui-primitives | `app/_ui/primitives/link.tsx` (new) + `link.test.tsx` (new)                                                       | red+green | Next.js `Link` wrapper with `focus-visible:ring-2`. The test asserts (1) renders `<a>` with the right `href`; (2) focus ring class.                                                                                                                                                                                                                                                                                                                 | `pnpm test app/_ui/primitives/link.test.tsx`        | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                                       | `feat(ui-primitives): Link primitive + test`                                                                                                                | T-UI-002                                                                                                                                                                           | pending                                           |
| T-UI-025 | RED → GREEN: PageHeader + PageContainer + BreadcrumbBar layout primitives + test       | ui-primitives | `app/_ui/layout/{page-header,page-container,breadcrumb-bar}.tsx` (3 new) + `app/_ui/layout/layout.test.tsx` (new) | red+green | `PageHeader` renders `<header>` with `<h1>` title + description + actions slot. `PageContainer` renders max-width wrapper + responsive padding. `BreadcrumbBar` composes `Breadcrumb`. The test asserts the render + the slots.                                                                                                                                                                                                                     | `pnpm test app/_ui/layout/layout.test.tsx`          | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                                       | `feat(ui-primitives): PageHeader + PageContainer + BreadcrumbBar layout primitives`                                                                         | T-UI-023                                                                                                                                                                           | pending                                           |
| T-UI-026 | GREEN: Sidebar + Topbar layout primitives (exported; not used in v1)                   | ui-primitives | `app/_ui/layout/{sidebar,topbar}.tsx` (2 new)                                                                     | green     | `Sidebar` renders a `<aside>` slot; `Topbar` renders a `<header>` slot. Both exported for follow-up `ui-sidebar` and `ui-topbar` changes; NOT used in v1.                                                                                                                                                                                                                                                                                           | `pnpm test app/_ui/layout/layout.test.tsx` (smoke)  | (1) `pnpm typecheck` exits 0; (2) renders without errors.                                                               | `feat(ui-primitives): Sidebar + Topbar layout primitives (forward-declared)`                                                                                | T-UI-025                                                                                                                                                                           | pending                                           |
| T-UI-027 | GREEN: error envelope → field error mapper + test                                      | ui-primitives | `app/_ui/_shared/{cx,map-api-error}.ts` (2 new) + `map-api-error.test.ts` (new) + `cx.test.ts` (new)              | green     | `mapApiErrorToFieldError(envelope, fieldNames)` returns `FieldErrorMap` per design §6.5. Maps `INVALID_AMOUNT` → `amountMinor`; `FUTURE_DATE_NOT_ALLOWED` → `transactionDate`; `ACCOUNT_ARCHIVED` → `accountId`; `VALIDATION_ERROR` → `error.details[0].path`; other codes → first form field. The test asserts the mapping for each code.                                                                                                          | `pnpm test app/_ui/_shared/map-api-error.test.ts`   | (1) All mapping tests pass; (2) `pnpm typecheck` exits 0.                                                               | `feat(ui-primitives): error envelope → field error mapper + test`                                                                                           | T-UI-002                                                                                                                                                                           | pending                                           |
| T-UI-028 | DOCS: `app/_ui/README.md` developer-facing overview of token table + primitive catalog | ui-primitives | `app/_ui/README.md` (new)                                                                                         | docs      | Per design §2.1. Documents the token table (light + dark CSS scope), the primitive component inventory (one paragraph per primitive with its props shape + a11y contract), the layout shell inventory, and the public barrel convention (path-based imports).                                                                                                                                                                                       | `pnpm run build` (verifies no broken links)         | (1) `pnpm run build` exits 0; (2) README ≤ 80 lines.                                                                    | `docs(ui-primitives): README.md developer-facing overview`                                                                                                  | T-UI-025, T-UI-026                                                                                                                                                                 | pending                                           |
| T-UI-029 | GREEN: public barrel `app/_ui/index.ts` (documentation; runtime uses path imports)     | ui-primitives | `app/_ui/index.ts` (new)                                                                                          | green     | Per design §2.3 + §7.4. Re-exports the 18 primitives + the 5 layout shell primitives. Does NOT export `tokens.css`, test files, or internal helpers (`_shared/cx.ts`, `_shared/map-api-error.ts`).                                                                                                                                                                                                                                                  | `pnpm run typecheck`                                | (1) `pnpm typecheck` exits 0; (2) barrel surface test (if added) passes.                                                | `feat(ui-primitives): public barrel (documentation)`                                                                                                        | T-UI-014, T-UI-015, T-UI-024, T-UI-025                                                                                                                                             | pending                                           |

### Slice 2 — `accounts-ui` (10 tasks)

> All tasks follow RED → GREEN → TRIANGULATE. The
> `AccountsListTable` becomes a Client Component for the
> sort + archived toggle state.

| ID       | Title                                                                                  | Slice       | File(s)                                                                                                             | Type      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                | Test command                                                 | Acceptance                                                                                             | Commit                                                                          | Dependency                             | Status  |
| -------- | -------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------- | ------- |
| T-UI-101 | RED → GREEN: accounts error boundary + test                                            | accounts-ui | `app/accounts/error.tsx` (new) + `error.test.tsx` (new)                                                             | red+green | Per design §8.3. `'use client'` (required for error.tsx). Renders `PageContainer` + `Card` + `CardHeader` (title: "Algo salió mal") + `CardBody` (error message + Retry button). The test asserts the render + the `reset` button callback.                                                                                                                                                                                                | `pnpm test app/accounts/error.test.tsx`                      | (1) Test passes; (2) `pnpm typecheck` exits 0.                                                         | `feat(ui-accounts): error boundary + test`                                      | T-UI-014, T-UI-025                     | pending |
| T-UI-102 | RED: AccountsListTable test asserts sort + Archived toggle + empty state               | accounts-ui | `app/accounts/accounts-list-table.test.tsx` (modified, +~80 lines; existing file extended)                          | red       | Per design §15.2. Tests (1) renders one row per account sorted by name ASC by default; (2) clicking the Name sort header reverses the sort; (3) clicking the Last activity header sorts by `lastActivityAt`; (4) toggling `Show archived` reveals archived accounts; (5) empty list renders `EmptyState`; (6) `Last activity` column shows `—` when `lastActivityAt` is null. Test fails because the production render does not exist yet. | `pnpm test app/accounts/accounts-list-table.test.tsx`        | (1) Test fails; (2) `pnpm typecheck` exits 0.                                                          | `test(ui-accounts): AccountsListTable sort + archived toggle + empty state`     | T-UI-015, T-UI-016, T-UI-017, T-UI-014 | pending |
| T-UI-103 | GREEN: implement AccountsListTable production render (Client Component)                | accounts-ui | `app/accounts/accounts-list-table.tsx` (modified, ~150 lines net)                                                   | green     | Per design §15.2. `'use client'`. `useState` for `sortKey` + `sortDir` + `showArchived`. Renders `Table` + `TableHeader` + `TableBody` + `TableRow` + `TableCell` + `Badge`. The `<TableHeader columns={...}>` declares sortable columns with `aria-sort` reflecting the current sort direction. The Archived column shows `<Badge variant="neutral">Archived</Badge>` for archived accounts.                                              | `pnpm test app/accounts/accounts-list-table.test.tsx`        | (1) All tests pass; (2) `pnpm typecheck` exits 0; (3) `'use client'` directive at the top of the file. | `feat(ui-accounts): AccountsListTable production render`                        | T-UI-102                               | pending |
| T-UI-104 | RED → GREEN: AccountDetail Card layout + test                                          | accounts-ui | `app/accounts/[id]/account-detail.tsx` (modified, ~80 lines net) + `account-detail.test.tsx` (modified, +~50 lines) | red+green | Per design §7.3. Renders `Card` + `CardHeader` (title: account name; badge: currency Badge; badge: archived Badge when `archivedAt !== null`) + `CardBody` (key-value rows for currency / casa / createdAt) + `CardFooter` (Edit + Archive actions). The test asserts the Card render + the badges.                                                                                                                                        | `pnpm test app/accounts/[id]/account-detail.test.tsx`        | (1) Test passes; (2) `pnpm typecheck` exits 0.                                                         | `feat(ui-accounts): AccountDetail Card layout + test`                           | T-UI-014, T-UI-016                     | pending |
| T-UI-105 | RED: CreateAccountForm test asserts inline validation + loading state + a11y           | accounts-ui | `app/accounts/new/create-account-form.test.tsx` (modified, +~80 lines; existing file extended)                      | red       | Tests (1) inline `FieldError` appears next to the offending field with the API's `INVALID_AMOUNT` message; (2) `aria-describedby` links the field to the error element; (3) submit button renders `Spinner` + `disabled` + `aria-busy="true"` while the Server Action is in flight; (4) successful submit navigates to `/accounts/<new-id>`. Test fails because the production render does not exist yet.                                  | `pnpm test app/accounts/new/create-account-form.test.tsx`    | (1) Test fails; (2) `pnpm typecheck` exits 0.                                                          | `test(ui-accounts): CreateAccountForm inline validation + loading state + a11y` | T-UI-004, T-UI-013, T-UI-027           | pending |
| T-UI-106 | GREEN: implement CreateAccountForm production form (Client Component + useActionState) | accounts-ui | `app/accounts/new/create-account-form.tsx` (modified, ~120 lines net)                                               | green     | Per design §7.3 + §9.1. `'use client'`. `FormField` + `Input` + `Select` + `FieldError` + `Button`. `useActionState` for the submit-state machine. `mapApiErrorToFieldError` for inline errors. Submit logic unchanged (consumes `createAccountServerAction`).                                                                                                                                                                             | `pnpm test app/accounts/new/create-account-form.test.tsx`    | (1) All tests pass; (2) `pnpm typecheck` exits 0; (3) `'use client'` directive at the top of the file. | `feat(ui-accounts): CreateAccountForm production form`                          | T-UI-105                               | pending |
| T-UI-107 | GREEN: `app/accounts/page.tsx` production render                                       | accounts-ui | `app/accounts/page.tsx` (modified, ~80 lines net)                                                                   | green     | Per design §7.3. Server Component. Auth gate (`auth()` + `redirect()`) unchanged. Data fetch: `serverHonoRequest('/api/accounts?include=lastActivity')`. Renders `PageHeader` (title: "Accounts") + `Card` + `AccountsListTable` + `EmptyState` (when accounts is empty; CTA to `/accounts/new`) + `Pagination` (when more than one page).                                                                                                 | `pnpm test app/accounts/page.tsx` (existing + extended)      | (1) Page test passes; (2) `pnpm typecheck` exits 0.                                                    | `feat(ui-accounts): accounts/page.tsx production render`                        | T-UI-103, T-UI-025                     | pending |
| T-UI-108 | GREEN: `app/accounts/[id]/page.tsx` production render                                  | accounts-ui | `app/accounts/[id]/page.tsx` (modified, ~30 lines net)                                                              | green     | Per design §7.3. Server Component. Auth gate + data fetch (`serverHonoRequest('/api/accounts/<id>')`) unchanged. Renders `PageHeader` (title: account name) + `Card` + `AccountDetail`. The `<BalanceWidget>` is reused unchanged (no logic change).                                                                                                                                                                                       | `pnpm test app/accounts/[id]/page.tsx` (existing + extended) | (1) Page test passes; (2) `pnpm typecheck` exits 0.                                                    | `feat(ui-accounts): accounts/[id]/page.tsx production render`                   | T-UI-104                               | pending |
| T-UI-109 | GREEN: `app/accounts/new/page.tsx` production render                                   | accounts-ui | `app/accounts/new/page.tsx` (modified, ~20 lines net)                                                               | green     | Per design §7.3. Server Component. Auth gate unchanged. Renders `PageHeader` (title: "New account") + `Card` + `CardBody` + `CreateAccountForm`.                                                                                                                                                                                                                                                                                           | `pnpm test app/accounts/new/page.tsx` (existing + extended)  | (1) Page test passes; (2) `pnpm typecheck` exits 0.                                                    | `feat(ui-accounts): accounts/new/page.tsx production render`                    | T-UI-106                               | pending |
| T-UI-110 | DOCS: extend `create-account-form.test.tsx` with a11y assertion                        | accounts-ui | `app/accounts/new/create-account-form.test.tsx` (modified, +~30 lines; existing file extended)                      | docs      | Adds the WCAG 2.2 AA a11y assertion: every form field has a paired `<label htmlFor>`; the submit button's loading state renders `aria-busy="true"`. The assertion uses `vitest-axe` (added in slice 5) OR a direct DOM-query assertion if `vitest-axe` is not yet wired.                                                                                                                                                                   | `pnpm test app/accounts/new/create-account-form.test.tsx`    | (1) A11y assertion passes; (2) `pnpm typecheck` exits 0.                                               | `docs(ui-accounts): CreateAccountForm a11y assertion`                           | T-UI-106                               | pending |

### Slice 3 — `transactions-ui` (10 tasks)

> All tasks follow RED → GREEN → TRIANGULATE. The
> `TransactionsListTable` becomes a Client Component for
> the sort state. The `Combobox` is hand-built on
> `<select>` + `<input type="search">`.

| ID       | Title                                                                              | Slice           | File(s)                                                                                                 | Type      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Test command                                                        | Acceptance                                                                                             | Commit                                                                                | Dependency                   | Status  |
| -------- | ---------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------- | ------- |
| T-UI-201 | RED → GREEN: transactions error boundary + test                                    | transactions-ui | `app/transactions/error.tsx` (new) + `error.test.tsx` (new)                                             | red+green | Mirrors the accounts error boundary. `'use client'`. Renders `PageContainer` + `Card` + `CardHeader` + `CardBody` + `Button`.                                                                                                                                                                                                                                                                                                                                                                                                     | `pnpm test app/transactions/error.test.tsx`                         | (1) Test passes; (2) `pnpm typecheck` exits 0.                                                         | `feat(ui-transactions): error boundary + test`                                        | T-UI-014, T-UI-025           | pending |
| T-UI-202 | RED: TransactionsListTable test asserts sort + pagination + direction badges       | transactions-ui | `app/_components/transactions-list-table.test.tsx` (new)                                                | red       | Per design §15.3. Tests (1) renders one row per transaction sorted by `transactionDate` DESC by default; (2) clicking the Date header reverses the sort; (3) clicking the Native amount header sorts numerically; (4) `INCOME` direction renders `Badge variant="success"`; (5) `EXPENSE` direction renders `Badge variant="danger"`; (6) `accountName` column renders when the row carries it; (7) `Pagination` renders `Previous page` / `Next page` when `nextCursor` is provided. Test fails because the file does not exist. | `pnpm test app/_components/transactions-list-table.test.tsx`        | (1) Test fails; (2) `pnpm typecheck` exits 0.                                                          | `test(ui-transactions): TransactionsListTable sort + pagination + direction badges`   | T-UI-015, T-UI-016, T-UI-020 | pending |
| T-UI-203 | GREEN: implement TransactionsListTable production render (Client Component)        | transactions-ui | `app/_components/transactions-list-table.tsx` (modified, ~180 lines net)                                | green     | Per design §15.3. `'use client'`. `useState` for `sortKey` + `sortDir`. Renders `Table` + `TableHeader` (columns: Date / Account / Direction / Native amount / Converted amount / Rate as of / Memo / Category) + `TableBody` + `TableRow` + `TableCell` + `Badge` + `Pagination`. The Direction column maps to `success` / `danger` Badge variants. The Account column renders `accountName` when present.                                                                                                                       | `pnpm test app/_components/transactions-list-table.test.tsx`        | (1) All tests pass; (2) `pnpm typecheck` exits 0; (3) `'use client'` directive at the top of the file. | `feat(ui-transactions): TransactionsListTable production render`                      | T-UI-202                     | pending |
| T-UI-204 | RED: TransactionDetailForms test asserts Card layout + Dialog + FX snapshot        | transactions-ui | `app/transactions/[id]/transaction-detail-forms.test.tsx` (new)                                         | red       | Per design §7.3. Tests (1) Card layout groups fields into Identification / Amount / FX snapshot / Audit; (2) edit form uses `FormField` + `Input` + `Select`; (3) delete button opens a `Dialog` (Client Component) instead of `window.confirm()`; (4) FX snapshot section renders `fxAsOfSnapshot` + `casaSnapshot` as read-only fields; (5) submitting the edit form with a memo-only change does NOT update the FX snapshot. Test fails because the file does not exist.                                                       | `pnpm test app/transactions/[id]/transaction-detail-forms.test.tsx` | (1) Test fails; (2) `pnpm typecheck` exits 0.                                                          | `test(ui-transactions): TransactionDetailForms Card layout + Dialog + FX snapshot`    | T-UI-014, T-UI-022           | pending |
| T-UI-205 | GREEN: implement TransactionDetailForms production render (Card + Dialog)          | transactions-ui | `app/transactions/[id]/transaction-detail-forms.tsx` (modified, ~150 lines net)                         | green     | Per design §7.3. `'use client'` for the form + the Dialog wrapper. The Card layout groups fields into Identification / Amount / FX snapshot / Audit. The edit form consumes the existing Server Action; the delete button opens a `Dialog` for confirm. The FX snapshot section is read-only.                                                                                                                                                                                                                                     | `pnpm test app/transactions/[id]/transaction-detail-forms.test.tsx` | (1) All tests pass; (2) `pnpm typecheck` exits 0.                                                      | `feat(ui-transactions): TransactionDetailForms production render`                     | T-UI-204                     | pending |
| T-UI-206 | RED: CreateTransactionForm test asserts Combobox + inline validation + loading     | transactions-ui | `app/transactions/new/create-transaction-form.test.tsx` (modified, +~120 lines; existing file extended) | red       | Tests (1) `Combobox` renders the live accounts list as options; (2) empty accounts list renders `No accounts available` empty state; (3) inline `FieldError` appears next to the offending field with the API's `INVALID_AMOUNT` / `FUTURE_DATE_NOT_ALLOWED` / `ACCOUNT_ARCHIVED` messages; (4) `aria-describedby` links each field to its error; (5) submit button renders `Spinner` + `disabled` + `aria-busy="true"` while the Server Action is in flight. Test fails because the production render does not exist yet.        | `pnpm test app/transactions/new/create-transaction-form.test.tsx`   | (1) Test fails; (2) `pnpm typecheck` exits 0.                                                          | `test(ui-transactions): CreateTransactionForm Combobox + inline validation + loading` | T-UI-011, T-UI-013, T-UI-027 | pending |
| T-UI-207 | GREEN: implement CreateTransactionForm production form (Combobox + useActionState) | transactions-ui | `app/transactions/new/create-transaction-form.tsx` (modified, ~160 lines net)                           | green     | Per design §7.3 + §9.1. `'use client'`. `FormField` + `Combobox` (account selection) + `Input` + `Select` + `Textarea` + `FieldError` + `Button`. `useActionState` for the submit-state machine. `mapApiErrorToFieldError` for inline errors. Submit logic unchanged.                                                                                                                                                                                                                                                             | `pnpm test app/transactions/new/create-transaction-form.test.tsx`   | (1) All tests pass; (2) `pnpm typecheck` exits 0; (3) `'use client'` directive at the top of the file. | `feat(ui-transactions): CreateTransactionForm production form`                        | T-UI-206                     | pending |
| T-UI-208 | GREEN: `app/transactions/page.tsx` production render                               | transactions-ui | `app/transactions/page.tsx` (modified, ~80 lines net)                                                   | green     | Per design §7.3. Server Component. Auth gate unchanged. Data fetch: `serverHonoRequest('/api/transactions?include=accountName')`. Renders `PageHeader` (title: "Transactions") + `Card` + `TransactionsListTable` + `EmptyState` (when transactions is empty; CTA to `/transactions/new`) + `Pagination`.                                                                                                                                                                                                                         | `pnpm test app/transactions/page.tsx` (existing + extended)         | (1) Page test passes; (2) `pnpm typecheck` exits 0.                                                    | `feat(ui-transactions): transactions/page.tsx production render`                      | T-UI-203, T-UI-025           | pending |
| T-UI-209 | GREEN: `app/transactions/[id]/page.tsx` production render                          | transactions-ui | `app/transactions/[id]/page.tsx` (modified, ~30 lines net)                                              | green     | Per design §7.3. Server Component. Auth gate + data fetch (`serverHonoRequest('/api/transactions/<id>')`) unchanged. Renders `PageHeader` (title: "Transaction detail") + `Card` + `TransactionDetailForms`.                                                                                                                                                                                                                                                                                                                      | `pnpm test app/transactions/[id]/page.tsx` (existing + extended)    | (1) Page test passes; (2) `pnpm typecheck` exits 0.                                                    | `feat(ui-transactions): transactions/[id]/page.tsx production render`                 | T-UI-205                     | pending |
| T-UI-210 | GREEN: `app/transactions/new/page.tsx` production render                           | transactions-ui | `app/transactions/new/page.tsx` (modified, ~20 lines net)                                               | green     | Per design §7.3. Server Component. Auth gate unchanged. Renders `PageHeader` (title: "New transaction") + `Card` + `CardBody` + `CreateTransactionForm`.                                                                                                                                                                                                                                                                                                                                                                          | `pnpm test app/transactions/new/page.tsx` (existing + extended)     | (1) Page test passes; (2) `pnpm typecheck` exits 0.                                                    | `feat(ui-transactions): transactions/new/page.tsx production render`                  | T-UI-207                     | pending |

### Slice 4 — `dashboard-ui-refactor` (10 tasks)

> The two new Client Components (`DashboardAccountPicker`,
> `DashboardMonthSwitcher`) are introduced before the
> dashboard page consumes them. The three existing card
> components are refactored to use the primitives.

| ID       | Title                                                                            | Slice                 | File(s)                                                                                                                                       | Type      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Test command                                                      | Acceptance                                                                                                                       | Commit                                                                                         | Dependency                             | Status  |
| -------- | -------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------- | ------- |
| T-UI-301 | RED → GREEN: dashboard error boundary + test                                     | dashboard-ui-refactor | `app/dashboard/error.tsx` (new) + `error.test.tsx` (new)                                                                                      | red+green | Mirrors the accounts + transactions error boundaries. `'use client'`. Spanish copy: "Algo salió mal" / "No pudimos cargar el dashboard" / "Reintentar".                                                                                                                                                                                                                                                                                                                                                    | `pnpm test app/dashboard/error.test.tsx`                          | (1) Test passes; (2) `pnpm typecheck` exits 0.                                                                                   | `feat(ui-dashboard-refactor): error boundary + test`                                           | T-UI-014, T-UI-025                     | pending |
| T-UI-302 | RED: DashboardAccountPicker Client Component test (Link-based + selection state) | dashboard-ui-refactor | `app/_components/dashboard-account-picker.test.tsx` (new)                                                                                     | red       | Per design §15.4. Tests (1) renders a `<nav aria-label="Account picker">` with one `<Link>` per account; (2) `aria-current="page"` is set on the currently-selected account; (3) empty accounts list renders nothing (no nav); (4) Tab + Enter activates the link. Test fails because the file does not exist.                                                                                                                                                                                             | `pnpm test app/_components/dashboard-account-picker.test.tsx`     | (1) Test fails; (2) `pnpm typecheck` exits 0.                                                                                    | `test(ui-dashboard-refactor): DashboardAccountPicker Client Component test`                    | T-UI-024                               | pending |
| T-UI-303 | GREEN: implement DashboardAccountPicker (Link-based Client Component)            | dashboard-ui-refactor | `app/_components/dashboard-account-picker.tsx` (new, ~50 lines)                                                                               | green     | Per design §15.4. `'use client'`. Renders `<nav aria-label="Account picker">` with `<Link href="/dashboard?accountId=<id>">` per account. `aria-current="page"` on the currently-selected account. Focus ring class.                                                                                                                                                                                                                                                                                       | `pnpm test app/_components/dashboard-account-picker.test.tsx`     | (1) All tests pass; (2) `pnpm typecheck` exits 0; (3) `'use client'` directive at the top of the file.                           | `feat(ui-dashboard-refactor): DashboardAccountPicker Client Component`                         | T-UI-302                               | pending |
| T-UI-304 | RED: DashboardMonthSwitcher Client Component test (Dec→Jan rollover)             | dashboard-ui-refactor | `app/_components/dashboard-month-switcher.test.tsx` (new)                                                                                     | red       | Per design §15.4 (analogous). Tests (1) renders a `<nav aria-label="Month switcher">` with prev / current / next `<Link>`s; (2) Dec→Jan rollover: `?month=2026-12` + click Next → `?month=2027-01`; (3) Jan→Dec rollover: `?month=2026-01` + click Prev → `?month=2025-12`; (4) default to current UTC month when no `?month=` is present. Test fails because the file does not exist.                                                                                                                     | `pnpm test app/_components/dashboard-month-switcher.test.tsx`     | (1) Test fails; (2) `pnpm typecheck` exits 0.                                                                                    | `test(ui-dashboard-refactor): DashboardMonthSwitcher Client Component test (Dec→Jan rollover)` | T-UI-024                               | pending |
| T-UI-305 | GREEN: implement DashboardMonthSwitcher (Link-based Client Component)            | dashboard-ui-refactor | `app/_components/dashboard-month-switcher.tsx` (new, ~70 lines)                                                                               | green     | Per design §15.4. `'use client'`. Date math in a pure helper (`prevMonth(YYYY-MM)` / `nextMonth(YYYY-MM)`); renders `<nav aria-label="Month switcher">` with prev / current / next `<Link>`s. Default to current UTC month when no `?month=` is present.                                                                                                                                                                                                                                                   | `pnpm test app/_components/dashboard-month-switcher.test.tsx`     | (1) All tests pass (incl. Dec→Jan + Jan→Dec); (2) `pnpm typecheck` exits 0; (3) `'use client'` directive at the top of the file. | `feat(ui-dashboard-refactor): DashboardMonthSwitcher Client Component`                         | T-UI-304                               | pending |
| T-UI-306 | RED → GREEN: MonthlySummaryCard Card render (empty + populated)                  | dashboard-ui-refactor | `app/_components/dashboard-monthly-summary.tsx` (modified, ~60 lines net) + `dashboard-monthly-summary.test.tsx` (modified, +~40 lines)       | red+green | Per design §7.3. Renders `Card` + `CardHeader` (title: "Resumen mensual" + UTC month label) + `CardBody` (totals `Table` with `Badge` for direction) + `CardFooter` (CTA to `/transactions/new` on empty). The test asserts empty + populated snapshots.                                                                                                                                                                                                                                                   | `pnpm test app/_components/dashboard-monthly-summary.test.tsx`    | (1) Both snapshots pass; (2) `pnpm typecheck` exits 0.                                                                           | `feat(ui-dashboard-refactor): MonthlySummaryCard Card render (empty + populated)`              | T-UI-014, T-UI-015, T-UI-016, T-UI-017 | pending |
| T-UI-307 | RED → GREEN: CategoryBreakdownCard Card render (empty + populated, sorted DESC)  | dashboard-ui-refactor | `app/_components/dashboard-category-breakdown.tsx` (modified, ~60 lines net) + `dashboard-category-breakdown.test.tsx` (modified, +~50 lines) | red+green | Per design §7.3. Renders `Card` + `CardHeader` (title: "Desglose por categoría") + `CardBody` (buckets `Table` sorted by `amountMinor DESC`) + `EmptyState` (when buckets is empty). The test asserts empty + populated snapshots + sort-order assertion.                                                                                                                                                                                                                                                  | `pnpm test app/_components/dashboard-category-breakdown.test.tsx` | (1) Both snapshots pass; (2) sort order asserted; (3) `pnpm typecheck` exits 0.                                                  | `feat(ui-dashboard-refactor): CategoryBreakdownCard Card render`                               | T-UI-014, T-UI-015, T-UI-017           | pending |
| T-UI-308 | RED → GREEN: AccountFlowCard Card render (no-accountId + with-accountId)         | dashboard-ui-refactor | `app/_components/dashboard-account-flow.tsx` (modified, ~80 lines net) + `dashboard-account-flow.test.tsx` (modified, +~60 lines)             | red+green | Per design §7.3. Renders `Card` + `CardHeader` (title: "Flujo de cuenta" + `DashboardAccountPicker` slot) + `CardBody` (days `Table`) + `EmptyState` (when no `?accountId=` is set OR when the account has no flow). The test asserts no-accountId + with-accountId snapshots.                                                                                                                                                                                                                             | `pnpm test app/_components/dashboard-account-flow.test.tsx`       | (1) Both snapshots pass; (2) `DashboardAccountPicker` rendered in the CardHeader; (3) `pnpm typecheck` exits 0.                  | `feat(ui-dashboard-refactor): AccountFlowCard Card render (DashboardAccountPicker slot)`       | T-UI-014, T-UI-015, T-UI-017, T-UI-303 | pending |
| T-UI-309 | RED: dashboard page test asserts ?accountId + ?month + empty + populated         | dashboard-ui-refactor | `app/dashboard/page.test.tsx` (modified, +~50 lines; existing file extended)                                                                  | red       | Per design §7.3 + §9.3. Tests (1) empty user → three `EmptyState` cards + CTA to `/transactions/new`; (2) seeded user → three populated cards; (3) `?accountId=<id>` → flow card populates; (4) `?month=2026-06` → summary + breakdown update. Test fails because the production page does not exist yet.                                                                                                                                                                                                  | `pnpm test app/dashboard/page.test.tsx`                           | (1) Test fails; (2) `pnpm typecheck` exits 0.                                                                                    | `test(ui-dashboard-refactor): dashboard page ?accountId + ?month + empty + populated`          | T-UI-306, T-UI-307, T-UI-308, T-UI-305 | pending |
| T-UI-310 | GREEN: implement dashboard/page.tsx RSC (1+2 grid + searchParams)                | dashboard-ui-refactor | `app/dashboard/page.tsx` (modified, ~80 lines net) + `page.seeded.test.tsx` (modified, +~40 lines)                                            | green     | Per design §7.3 + §9.3. Server Component. Auth gate (`auth()` + `redirect()`) unchanged. Reads `?accountId` + `?month` searchParams. Calls `/api/reports/monthly?month=...`, `/api/reports/breakdown?month=...`, and (when `?accountId=` is set) `/api/reports/accounts/:id/flow?month=...` in parallel via `Promise.all`. Renders `PageHeader` + `DashboardMonthSwitcher` (in `actions` slot) + the three cards in a 1+2 grid on large viewports and stacked on small viewports. Spanish copy throughout. | `pnpm test app/dashboard/page.test.tsx`                           | (1) All tests pass; (2) `pnpm run build` exits 0; (3) `pnpm typecheck` exits 0.                                                  | `feat(ui-dashboard-refactor): dashboard/page.tsx RSC (1+2 grid + ?accountId + ?month)`         | T-UI-309                               | pending |

### Slice 5 — `integration-tests` (16 tasks)

> All tasks are tests-only (no production code changes).
> The axe-core suite is scaffolded first; the visual
> snapshot suite follows; the E2E happy paths come last.

| ID       | Title                                                                                | Slice             | File(s)                                                                                                                                          | Type      | Description                                                                                                                                                                                                                                                                                                                                                                                             | Test command                                                                                                                                                       | Acceptance                                                        | Commit                                                                                                | Dependency                                                 | Status                                  |
| -------- | ------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | ------------------ | ------- |
| T-UI-401 | INFRA: scaffold `tests/a11y/` with axe-core + vitest-axe setup                       | integration-tests | `vitest.config.ts` (modified, +~20 lines) + `tests/a11y/setup.ts` (new, ~20 lines)                                                               | infra     | Adds the `tests/` test include path to `vitest.config.ts`. Wires `vitest-axe` (or `@axe-core/playwright`) into the axe-core test setup. The `tests/a11y/setup.ts` exports a shared `expectNoCriticalOrSerious(results)` helper.                                                                                                                                                                         | `pnpm test tests/a11y/setup.test.ts` (smoke)                                                                                                                       | (1) Setup file compiles; (2) `pnpm typecheck` exits 0.            | `test(ui-integration-tests): scaffold tests/a11y/ with axe-core setup`                                | —                                                          | pending                                 |
| T-UI-402 | RED: accounts page axe-core test (zero critical + serious)                           | integration-tests | `tests/a11y/accounts.test.tsx` (new)                                                                                                             | red       | Renders the accounts page with seeded data; calls `axe(container)`; asserts no `critical` or `serious` violations. Test fails because (a) the test file does not exist OR (b) the page violates an axe-core rule that the smoke page did not.                                                                                                                                                           | `pnpm test tests/a11y/accounts.test.tsx`                                                                                                                           | (1) Test fails; (2) `pnpm typecheck` exits 0.                     | `test(ui-integration-tests): accounts page axe-core RED`                                              | T-UI-401, T-UI-107, T-UI-108, T-UI-109                     | pending                                 |
| T-UI-403 | GREEN: accounts page axe-core test passes                                            | integration-tests | `tests/a11y/accounts.test.tsx` (new, ~40 lines)                                                                                                  | green     | The fix is whatever changes the page needs to satisfy axe-core (likely `aria-labelledby` on the Card + a `<caption>` on the Table + focus-visible rings). The apply worker surfaces the failure + the fix as separate commits; the GREEN commit lands the fix.                                                                                                                                          | `pnpm test tests/a11y/accounts.test.tsx`                                                                                                                           | (1) Test passes; (2) zero `critical` + zero `serious` violations. | `test(ui-integration-tests): accounts page axe-core GREEN`                                            | T-UI-402                                                   | pending                                 |
| T-UI-404 | RED → GREEN: transactions page axe-core test (zero critical + serious)               | integration-tests | `tests/a11y/transactions.test.tsx` (new, ~40 lines)                                                                                              | red+green | Same shape as T-UI-402 / T-UI-403. RED lands the failing test; GREEN lands whatever fix is needed.                                                                                                                                                                                                                                                                                                      | `pnpm test tests/a11y/transactions.test.tsx`                                                                                                                       | (1) Test passes; (2) zero `critical` + zero `serious` violations. | `test(ui-integration-tests): transactions page axe-core`                                              | T-UI-401, T-UI-208, T-UI-209, T-UI-210                     | pending                                 |
| T-UI-405 | RED → GREEN: dashboard page axe-core test (zero critical + serious)                  | integration-tests | `tests/a11y/dashboard.test.tsx` (new, ~40 lines)                                                                                                 | red+green | Same shape. Renders the dashboard with seeded data + `?accountId` + `?month`; asserts no `critical` or `serious` violations.                                                                                                                                                                                                                                                                            | `pnpm test tests/a11y/dashboard.test.tsx`                                                                                                                          | (1) Test passes; (2) zero `critical` + zero `serious` violations. | `test(ui-integration-tests): dashboard page axe-core`                                                 | T-UI-401, T-UI-310                                         | pending                                 |
| T-UI-406 | INFRA: scaffold `tests/visual/` with snapshot setup                                  | integration-tests | `vitest.config.ts` (modified, +~5 lines)                                                                                                         | infra     | Adds the `tests/visual/` test include path. The snapshot files live at `tests/visual/__snapshots__/`.                                                                                                                                                                                                                                                                                                   | `pnpm test tests/visual/` (smoke)                                                                                                                                  | (1) `pnpm test tests/visual/` exits 0 (zero snapshots = green).   | `test(ui-integration-tests): scaffold tests/visual/ with snapshot setup`                              | T-UI-401                                                   | pending                                 |
| T-UI-407 | GREEN: Card visual snapshot (empty + populated)                                      | integration-tests | `tests/visual/card.test.tsx` (new, ~30 lines)                                                                                                    | green     | Renders the `Card` primitive in empty + populated states; snapshot asserts the rendered HTML.                                                                                                                                                                                                                                                                                                           | `pnpm test tests/visual/card.test.tsx`                                                                                                                             | (1) Snapshots stable; (2) `pnpm typecheck` exits 0.               | `test(ui-integration-tests): Card visual snapshot`                                                    | T-UI-014, T-UI-406                                         | pending                                 |
| T-UI-408 | GREEN: Badge visual snapshot (each variant)                                          | integration-tests | `tests/visual/badge.test.tsx` (new, ~30 lines)                                                                                                   | green     | Renders `Badge` with each variant (`neutral                                                                                                                                                                                                                                                                                                                                                             | accent                                                                                                                                                             | success                                                           | warning                                                                                               | danger`); snapshots each.                                  | `pnpm test tests/visual/badge.test.tsx` | (1) Snapshots stable; (2) `pnpm typecheck` exits 0. | `test(ui-integration-tests): Badge visual snapshot` | T-UI-016, T-UI-406 | pending |
| T-UI-409 | GREEN: EmptyState visual snapshot (with CTA + without CTA)                           | integration-tests | `tests/visual/empty-state.test.tsx` (new, ~30 lines)                                                                                             | green     | Renders `EmptyState` with + without CTA; snapshots each.                                                                                                                                                                                                                                                                                                                                                | `pnpm test tests/visual/empty-state.test.tsx`                                                                                                                      | (1) Snapshots stable; (2) `pnpm typecheck` exits 0.               | `test(ui-integration-tests): EmptyState visual snapshot`                                              | T-UI-017, T-UI-406                                         | pending                                 |
| T-UI-410 | GREEN: Skeleton visual snapshot                                                      | integration-tests | `tests/visual/skeleton.test.tsx` (new, ~20 lines)                                                                                                | green     | Renders `Skeleton`; snapshots it.                                                                                                                                                                                                                                                                                                                                                                       | `pnpm test tests/visual/skeleton.test.tsx`                                                                                                                         | (1) Snapshots stable; (2) `pnpm typecheck` exits 0.               | `test(ui-integration-tests): Skeleton visual snapshot`                                                | T-UI-019, T-UI-406                                         | pending                                 |
| T-UI-411 | GREEN: Breadcrumb visual snapshot                                                    | integration-tests | `tests/visual/breadcrumb.test.tsx` (new, ~30 lines)                                                                                              | green     | Renders `Breadcrumb` with three items; snapshots it.                                                                                                                                                                                                                                                                                                                                                    | `pnpm test tests/visual/breadcrumb.test.tsx`                                                                                                                       | (1) Snapshots stable; (2) `pnpm typecheck` exits 0.               | `test(ui-integration-tests): Breadcrumb visual snapshot`                                              | T-UI-023, T-UI-406                                         | pending                                 |
| T-UI-412 | GREEN: Pagination visual snapshot (first + middle + last page)                       | integration-tests | `tests/visual/pagination.test.tsx` (new, ~30 lines)                                                                                              | green     | Renders `Pagination` at first / middle / last page; snapshots each.                                                                                                                                                                                                                                                                                                                                     | `pnpm test tests/visual/pagination.test.tsx`                                                                                                                       | (1) Snapshots stable; (2) `pnpm typecheck` exits 0.               | `test(ui-integration-tests): Pagination visual snapshot`                                              | T-UI-020, T-UI-406                                         | pending                                 |
| T-UI-413 | GREEN: Dialog visual snapshot (open + closed)                                        | integration-tests | `tests/visual/dialog.test.tsx` (new, ~40 lines)                                                                                                  | green     | Renders `Dialog` in open + closed states; snapshots each.                                                                                                                                                                                                                                                                                                                                               | `pnpm test tests/visual/dialog.test.tsx`                                                                                                                           | (1) Snapshots stable; (2) `pnpm typecheck` exits 0.               | `test(ui-integration-tests): Dialog visual snapshot`                                                  | T-UI-022, T-UI-406                                         | pending                                 |
| T-UI-414 | GREEN: Combobox visual snapshot (open + closed + with options)                       | integration-tests | `tests/visual/combobox.test.tsx` (new, ~40 lines)                                                                                                | green     | Renders `Combobox` in three states; snapshots each.                                                                                                                                                                                                                                                                                                                                                     | `pnpm test tests/visual/combobox.test.tsx`                                                                                                                         | (1) Snapshots stable; (2) `pnpm typecheck` exits 0.               | `test(ui-integration-tests): Combobox visual snapshot`                                                | T-UI-011, T-UI-406                                         | pending                                 |
| T-UI-415 | GREEN: Button / Input / Select / Textarea / FieldError visual snapshots              | integration-tests | `tests/visual/{button,input,select,textarea,field-error}.test.tsx` (5 new, ~20–30 lines each)                                                    | green     | Each test renders its primitive in primary state; snapshots it.                                                                                                                                                                                                                                                                                                                                         | `pnpm test tests/visual/button.test.tsx tests/visual/input.test.tsx tests/visual/select.test.tsx tests/visual/textarea.test.tsx tests/visual/field-error.test.tsx` | (1) Snapshots stable; (2) `pnpm typecheck` exits 0.               | `test(ui-integration-tests): Button / Input / Select / Textarea / FieldError visual snapshots`        | T-UI-004, T-UI-005, T-UI-007, T-UI-006, T-UI-012, T-UI-406 | pending                                 |
| T-UI-416 | RED → GREEN: E2E happy paths (record expense / archive account / navigate to detail) | integration-tests | `tests/e2e/{record-expense,archive-account,navigate-to-detail}.test.tsx` (3 new, ~80 lines each; or `.test.ts` if Playwright runner is in place) | red+green | Per design §13.6 + §14.5. Three flows: (1) sign in → record USD expense against ARS casa → verify dashboard reflects the converted amount; (2) sign in → archive account → verify it disappears from the active list and appears behind the `Show archived` toggle; (3) sign in → navigate to `/accounts/X` → verify the balance widget renders the casa-converted amount. RED first, GREEN implements. | `pnpm test tests/e2e/`                                                                                                                                             | (1) All three E2E flows pass; (2) `pnpm typecheck` exits 0.       | `test(ui-integration-tests): E2E happy paths (record expense + archive account + navigate to detail)` | T-UI-203, T-UI-103, T-UI-104, T-UI-310                     | pending                                 |

### Slice 6 — `docs-and-perf` (8 tasks)

> All tasks are docs + perf + archive. No production code
> changes. The three English artifacts + their Spanish
> mirrors land in the same commit per root `AGENTS.md`
> §13.3.

| ID       | Title                                                                                             | Slice         | File(s)                                                                                                        | Type | Description                                                                                                                                                                                                                                                                                                                                      | Test command                                                                                                                                                                          | Acceptance                                                                                                                                                   | Commit                                                                                | Dependency                                                 | Status  |
| -------- | ------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------- |
| T-UI-501 | DOCS: design-system reference `docs/architecture/ui.md` (REQ-UI-10) + ES mirror                   | docs-and-perf | `docs/architecture/ui.md` (new, ~250 lines) + `Documents-es/docs/architecture/ui.md` (new, ~250 lines)         | docs | Per design §10 + REQ-UI-10. Codifies (1) the token table (light + dark CSS scope); (2) the primitive component inventory (one row per primitive with its props shape + a11y contract); (3) the layout shell inventory. Spanish mirror per root `AGENTS.md` §13.                                                                                  | `pnpm run build` (verifies no broken links)                                                                                                                                           | (1) Files exist; (2) `pnpm run build` exits 0; (3) no CJK characters in the ES mirror.                                                                       | `docs(ui-docs-and-perf): design-system reference + ES mirror`                         | T-UI-029                                                   | pending |
| T-UI-502 | DOCS: manual QA checklist `docs/qa/transactions-ui.md` (REQ-UI-11) + ES mirror                    | docs-and-perf | `docs/qa/transactions-ui.md` (new, ~150 lines) + `Documents-es/docs/qa/transactions-ui.md` (new, ~150 lines)   | docs | Per design §14.5 + REQ-UI-11. Codifies the keyboard navigation checklist, the screen-reader run-through, and the dark-mode follow-up note. Includes a placeholder sign-off section for the user. Spanish mirror.                                                                                                                                 | `pnpm run build`                                                                                                                                                                      | (1) Files exist; (2) checklist is runnable in 30-45 minutes; (3) no CJK characters in the ES mirror.                                                         | `docs(ui-docs-and-perf): manual QA checklist + ES mirror`                             | —                                                          | pending |
| T-UI-503 | DOCS: perf budget verification `docs/perf/transactions-ui.md` + ES mirror                         | docs-and-perf | `docs/perf/transactions-ui.md` (new, ~80 lines) + `Documents-es/docs/perf/transactions-ui.md` (new, ~80 lines) | docs | Per design §10.3 + root `AGENTS.md` §10.5. Codifies the Lighthouse CLI command, the simulated 4G + Moto G4 profile, the p95 < 2s budget, and the placeholders for the JSON summaries on `/`, `/dashboard`, `/transactions`. Spanish mirror.                                                                                                      | `pnpm run build`                                                                                                                                                                      | (1) Files exist; (2) Lighthouse command documented; (3) no CJK characters in the ES mirror.                                                                  | `docs(ui-docs-and-perf): perf budget verification + ES mirror`                        | —                                                          | pending |
| T-UI-504 | DOCS: `CHANGELOG.md` `[Unreleased]` entry (Added section per Keep a Changelog)                    | docs-and-perf | `CHANGELOG.md` (modified, +~30 lines under `## [Unreleased]`)                                                  | docs | Per Keep a Changelog convention + root `AGENTS.md` §5.5. Lists (1) the new design-system primitives + layout shell; (2) the production UI surfaces for accounts + transactions + dashboard; (3) the axe-core + visual snapshot + E2E test suites; (4) the design-system reference + manual QA checklist + perf budget verification.              | `grep -c '## \[Unreleased\]' CHANGELOG.md`                                                                                                                                            | (1) Entry added under `## [Unreleased]`; (2) Added section present.                                                                                          | `docs(ui-docs-and-perf): CHANGELOG.md [Unreleased] entry`                             | T-UI-501, T-UI-502, T-UI-503                               | pending |
| T-UI-505 | VERIFY: Lighthouse p95 < 2s on `/` + `/dashboard` + `/transactions` (manual)                      | docs-and-perf | `docs/perf/transactions-ui.md` (modified, +~50 lines; Lighthouse JSON summaries pasted in)                     | docs | Runs `pnpm build && pnpm start &` + Lighthouse CLI under simulated 4G + Moto G4 on the three primary pages. Pastes the JSON summaries into `docs/perf/transactions-ui.md`. The assertion is p95 page load < 2s. If the budget fails, the orchestrator splits the dashboard's three parallel calls into two chunks (per design §16.5 mitigation). | `npx lighthouse http://localhost:3000/ --form-factor=mobile --throttling-method=simulate --output=json --output-path=./lighthouse-root.json` (repeated for /dashboard, /transactions) | (1) p95 < 2s on each page; (2) JSON summaries pasted into `docs/perf/transactions-ui.md`.                                                                    | `docs(ui-docs-and-perf): Lighthouse p95 < 2s verification on the three primary pages` | T-UI-503                                                   | pending |
| T-UI-506 | VERIFY: user-owned manual QA sign-off (REQ-UI-11)                                                 | docs-and-perf | `docs/qa/transactions-ui.md` (modified, +~5 lines; sign-off section filled)                                    | docs | The user runs the `docs/qa/transactions-ui.md` checklist (keyboard nav + screen reader + sign-off section). The verify gate fails until the user signs off.                                                                                                                                                                                      | (manual; user-driven)                                                                                                                                                                 | (1) Sign-off section is filled; (2) user confirms the checklist is complete.                                                                                 | `docs(ui-docs-and-perf): user-owned manual QA sign-off`                               | T-UI-502                                                   | pending |
| T-UI-507 | ARCHIVE: sdd-archive promotes `ui` delta spec to canonical (`openspec/specs/ui/spec.md`)          | docs-and-perf | `openspec/specs/ui/spec.md` (created by `sdd-archive`)                                                         | docs | `sdd-archive` lifts the delta spec at `openspec/changes/transactions-ui/specs/ui/spec.md` (REQ-UI-1 to REQ-UI-11) into the canonical location. The apply worker runs `sdd-archive` as the final step; the PR includes the canonical in the same commit.                                                                                          | `ls openspec/specs/ui/spec.md`                                                                                                                                                        | (1) Canonical exists; (2) REQ-UI-1 to REQ-UI-11 present; (3) Spanish mirror at `Documents-es/openspec/specs/ui/spec.md` exists (per root `AGENTS.md` §13.3). | `feat(ui-docs-and-perf): sdd-archive promotes ui spec to canonical`                   | T-UI-501, T-UI-502, T-UI-503, T-UI-504, T-UI-505, T-UI-506 | pending |
| T-UI-508 | ARCHIVE: sdd-archive replaces REQ-TX-15 with ui reference (`openspec/specs/transactions/spec.md`) | docs-and-perf | `openspec/specs/transactions/spec.md` (modified by `sdd-archive`)                                              | docs | `sdd-archive` lifts the REQ-TX-15 REPLACED delta into the canonical location. The new wording points to `openspec/specs/ui/spec.md`. The PR includes the canonical in the same commit.                                                                                                                                                           | `grep -E '^## REQ-TX-15' openspec/specs/transactions/spec.md`                                                                                                                         | (1) REQ-TX-15 absent OR references ui/spec.md; (2) Spanish mirror at `Documents-es/openspec/specs/transactions/spec.md` is in sync.                          | `feat(ui-docs-and-perf): sdd-archive replaces REQ-TX-15 with ui reference`            | T-UI-507                                                   | pending |

---

## Per-slice summary

| Slice                       | Branch                       | Tasks                                                     | LoC range     | PR title (conventional)                                                                  | Verification gate                                                                                                                                                                                                                                       | Rollback                                                                                                     |
| --------------------------- | ---------------------------- | --------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1 — `ui-primitives`         | `feat/ui-primitives`         | 29 (15 red+green, 8 green, 2 red, 3 docs/infra, 1 wiring) | 380–480       | `feat(ui-primitives): tokens + 18 primitives + layout shell`                             | `pnpm test app/_ui` exits 0; coverage ≥ 80% on `app/_ui/`; `pnpm run build` exits 0; `pnpm typecheck` exits 0; zero `dark:` variants                                                                                                                    | `git revert <merge-sha>`; the new `app/_ui/` folder is unused until slice 2; no breaking change              |
| 2 — `accounts-ui`           | `feat/ui-accounts`           | 10 (3 red+green, 6 green, 1 docs)                         | 240–360       | `feat(ui-accounts): production renders for accounts pages`                               | `pnpm test app/accounts` exits 0; coverage ≥ 80% on `app/accounts/`; manual `pnpm dev` smoke (sort + Archived toggle + create form)                                                                                                                     | `git revert <merge-sha>`; the production renders fall back to the smoke pages                                |
| 3 — `transactions-ui`       | `feat/ui-transactions`       | 10 (4 red+green, 6 green)                                 | 320–460       | `feat(ui-transactions): production renders for transactions pages`                       | `pnpm test app/transactions app/_components` exits 0; coverage ≥ 80% on `app/transactions/`; manual `pnpm dev` smoke (sort + pagination + Combobox + Dialog)                                                                                            | `git revert <merge-sha>`; the production renders fall back to the smoke pages                                |
| 4 — `dashboard-ui-refactor` | `feat/ui-dashboard-refactor` | 10 (4 red+green, 5 green, 1 red)                          | 220–340       | `feat(ui-dashboard-refactor): production dashboard with account picker + month switcher` | `pnpm test app/dashboard app/_components` exits 0; coverage ≥ 80% on `app/dashboard/` + `app/_components/`; manual `pnpm dev` smoke (AccountPicker + MonthSwitcher + Dec→Jan)                                                                           | `git revert <merge-sha>`; the dashboard falls back to the smoke render                                       |
| 5 — `integration-tests`     | `feat/ui-integration-tests`  | 16 (2 infra, 5 red+green, 9 green)                        | 200–320       | `test(ui-integration-tests): axe-core + visual snapshots + e2e happy paths`              | `pnpm test tests/a11y tests/visual tests/e2e` exits 0; axe-core zero `critical` + `serious`; visual snapshots stable                                                                                                                                    | `git revert <merge-sha>`; the new test suite is additive; the existing per-primitive + per-page tests remain |
| 6 — `docs-and-perf`         | `feat/ui-docs-and-perf`      | 8 (6 docs, 2 archive)                                     | 160–260       | `docs(ui-docs-and-perf): design-system ref + QA checklist + perf budget + sdd-archive`   | `docs/architecture/ui.md` + `docs/qa/transactions-ui.md` + `docs/perf/transactions-ui.md` exist with ES mirrors; Lighthouse p95 < 2s on `/` + `/dashboard` + `/transactions`; user signs off manual QA; `sdd-archive` promotes delta specs to canonical | `git revert <merge-sha>`; the docs + perf artifacts are additive; no production code is reverted             |
| **Total**                   | —                            | **83**                                                    | **1520–2220** | —                                                                                        | —                                                                                                                                                                                                                                                       | —                                                                                                            |

---

## Forecast (consumed by the orchestrator's Review Workload Guard)

```
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low (per slice) · High (collapsed)
```

- **Chained PRs recommended**: Yes
- **400-line budget risk per slice**: Low (every slice's LoC
  band sits at or under the 400-line budget; `ui-primitives`
  (480) and `transactions-ui` (460) are at the high end and
  the apply worker MUST surface `git diff --stat` at PR-open
  time so the reviewer sees the actual line count).
- **400-line budget risk if collapsed into one PR**: High
  (1,520–2,220 LoC; ~4–5× the 400-line review budget).
- **Decision needed before apply**: No (scope locked at
  design §14 + §19; orchestrator cache = `auto-forecast`).
- **Per-slice branch names**: `feat/ui-primitives`,
  `feat/ui-accounts`, `feat/ui-transactions`,
  `feat/ui-dashboard-refactor`, `feat/ui-integration-tests`,
  `feat/ui-docs-and-perf`.
- **Per-slice PR titles** (conventional commit form):
  - Slice 1: `feat(ui-primitives): tokens + 18 primitives + layout shell`
  - Slice 2: `feat(ui-accounts): production renders for accounts pages`
  - Slice 3: `feat(ui-transactions): production renders for transactions pages`
  - Slice 4: `feat(ui-dashboard-refactor): production dashboard with account picker + month switcher`
  - Slice 5: `test(ui-integration-tests): axe-core + visual snapshots + e2e happy paths`
  - Slice 6: `docs(ui-docs-and-perf): design-system ref + QA checklist + perf budget + sdd-archive`
- **Per-slice verification gate** (the test commands that
  must pass):
  - Slice 1: `pnpm test app/_ui` (coverage ≥ 80% on
    `app/_ui/`).
  - Slice 2: `pnpm test app/accounts` (coverage ≥ 80% on
    `app/accounts/`) + manual `pnpm dev` smoke.
  - Slice 3: `pnpm test app/transactions app/_components`
    (coverage ≥ 80% on `app/transactions/`) + manual `pnpm
dev` smoke.
  - Slice 4: `pnpm test app/dashboard app/_components`
    (coverage ≥ 80%) + manual `pnpm dev` smoke.
  - Slice 5: `pnpm test tests/a11y tests/visual tests/e2e`
    (axe-core zero critical + serious; visual snapshots
    stable).
  - Slice 6: `docs/perf/transactions-ui.md` exists with
    Lighthouse JSON summaries; user signs off manual QA;
    `sdd-archive` promotes delta specs to canonical.
- **Rollback strategy**: `git revert <merge-sha>` per slice.
  Slices 1-5 are additive (slices 2-5 fall back to the smoke
  pages when reverted; slice 1 introduces a new folder that
  is unused until slice 2). Slice 6 is docs + perf + archive
  only; no production code is reverted.

---

## Strict TDD discipline (per-slice guards)

- Every `green` task is preceded by a matching `red` task in
  the same slice (T-UI-003 → T-UI-004, T-UI-010 → T-UI-011,
  T-UI-021 → T-UI-022, T-UI-102 → T-UI-103, T-UI-105 →
  T-UI-106, T-UI-202 → T-UI-203, T-UI-204 → T-UI-205,
  T-UI-206 → T-UI-207, T-UI-302 → T-UI-303, T-UI-304 →
  T-UI-305, T-UI-309 → T-UI-310, T-UI-402 → T-UI-403,
  T-UI-416 → T-UI-416 GREEN).
- Every behavior-codifying task has a `triangulate` step
  embedded in the `red+green` tasks (T-UI-005, T-UI-006,
  T-UI-007, T-UI-008, T-UI-009, T-UI-012, T-UI-013,
  T-UI-014, T-UI-015, T-UI-016, T-UI-017, T-UI-018,
  T-UI-019, T-UI-020, T-UI-023, T-UI-024, T-UI-025,
  T-UI-101, T-UI-104, T-UI-201, T-UI-204, T-UI-206,
  T-UI-301, T-UI-306, T-UI-307, T-UI-308, T-UI-404,
  T-UI-405).
- The RED test runs and FAILS for the right reason
  ("cannot find module" / "feature missing", not a typo).
  The GREEN task runs and PASSES without breaking existing
  tests.
- `pnpm run typecheck` exits 0 at every commit boundary
  (TypeScript strict mode; no `any`).
- `pnpm run lint` exits 0 at every commit boundary
  (max-warnings 0).
- `pnpm run build` exits 0 before each PR opens.

---

## Cross-cutting risks (flagged for the apply worker)

1. **Token-table fragmentation** (design §16.1). Slice 1
   (`ui-primitives`) is the ONLY slice that touches
   `app/_ui/`. Slices 2-5 import from the primitives; they
   do NOT extend the token table or duplicate primitives.
   The verify gate asserts that every primitive used by the
   production UI is declared in `app/_ui/`.
2. **Sort + cursor pagination regression** (design §16.2).
   The sort is a pure client-side concern over the existing
   `GET /api/transactions` page; the API contract is
   unchanged. The cursor is the existing `nextCursor` field.
   The verify gate re-runs the smoke flow against the new UI
   (slice 5's E2E happy path #1).
3. **Combobox hand-built vs. library** (design §16.3). The
   proposal §"Alternatives considered" item 2 explicitly
   chose hand-built over Radix / downshift for v1. The v1
   surface is minimal (account selection in the create-
   transaction form only). A future `ui-complex-widgets`
   change introduces a vetted combobox primitive (Radix is
   the first candidate). The verify gate asserts the v1
   combobox passes axe-core with zero critical + serious
   violations.
4. **axe-core flags a violation the smoke page did not**
   (design §16.4). The verify gate is set to `critical` +
   `serious` zero. `moderate` + `minor` are logged but not
   blocking; the user triages them. The
   `docs/qa/transactions-ui.md` checklist captures the
   residual items as a backlog.
5. **p95 < 2s not met on the dashboard** (design §16.5).
   The three fetches are already parallelized (existing
   `Promise.all` in the dashboard). The verify gate runs
   Lighthouse against the production build; if the budget
   fails, the orchestrator splits the dashboard's three
   calls into two chunks (summary + breakdown; flow on
   demand) without breaking the UI contract.
6. **Manual QA owner is the user** (design §16.6). The
   user-owned manual QA checklist at
   `docs/qa/transactions-ui.md` is not signed off in time
   for the verify gate. The proposal §"Open questions" Q4
   explicitly locks the manual QA owner as the user; the
   verify gate fails until the checklist is signed off
   (REQ-UI-11). The checklist is structured to be runnable
   in 30-45 minutes.
7. **Carry-over BRs by reference** (design §16.7). The
   spec keeps BR-TX-4, BR-ACC-12, BR-RPT-7, BR-AUTH-N,
   BR-FX-3 by **reference** rather than inlining their text.
   This is an intentional convention (matches the
   transactions archive). Flagging so the reviewer does not
   flag it as drift.
8. **Two additive query flags = two new server-side
   queries** (design §16.8). The flags are additive; the
   new queries are bounded by existing indexes
   (`@@index([userId, transactionDate])` on `Transaction`;
   primary key on `FinancialAccount`). The performance
   budget is documented at design §10.
9. **Dark tokens declared, light theme rendered (v1)**
   (design §16.9 + REQ-UI-9). The token table declares
   dark-mode CSS custom properties under
   `[data-theme='dark']` but the v1 production UI NEVER
   sets the `data-theme` attribute. A
   `git grep -E '\bdark:' app/_ui/ app/accounts/
app/transactions/ app/dashboard/ 'app/_components/dashboard-*.tsx'`
   returns zero matches in v1.
10. **Strict TDD risk** (design §16.10). The apply worker
    MUST watch every RED test fail before writing the GREEN
    implementation. The PR template
    (`.github/pull_request_template.md`) requires the
    reviewer to confirm the RED commit landed before the
    GREEN commit.
11. **Per-slice budget borderline** (design §19). Slices 1
    (`ui-primitives`, 380-480 LoC) and 3 (`transactions-ui`,
    320-460 LoC) are at the high end of the 400-line
    budget. The apply worker MUST surface `git diff --stat`
    at PR-open time so the reviewer sees the actual line
    count. If either slice exceeds the 400-line budget at
    PR-open time, the orchestrator splits the slice into
    two PRs without renegotiating the design.

---

## Test infrastructure prerequisites

Before any slice-1 task can land, the following test seams
must exist. Every entry cites the file:line where the
existing pattern lives.

| Prerequisite                                                 | Where it lives today                                                                                                                                                                                                     | What task creates it                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `vitest` + `vitest-axe` setup for axe-core tests             | Not installed today (the existing `pnpm test` uses Vitest + Testing Library; `vitest-axe` is NOT in the dev dependencies).                                                                                               | T-UI-401 (adds `vitest-axe` to devDependencies + `tests/a11y/setup.ts`); commit message notes `pnpm-lock.yaml` update. |
| `vitest` snapshot config for `tests/visual/`                 | The existing Vitest snapshot config covers `*.test.tsx` co-located with source. The `tests/visual/__snapshots__/` directory does not exist.                                                                              | T-UI-406 (extends `vitest.config.ts`).                                                                                 |
| `react-dom/server.renderToStaticMarkup` for snapshot tests   | Already a dev dependency per `package.json`                                                                                                                                                                              | Imported directly in T-UI-407..T-UI-415; no new setup.                                                                 |
| `useActionState` (React 19)                                  | React 19 is already a dependency per `package.json`                                                                                                                                                                      | Imported directly in T-UI-106, T-UI-207; no new setup.                                                                 |
| `@testing-library/user-event` for form interactions          | Already a dev dependency per `package.json` (the smoke slice uses it)                                                                                                                                                    | Imported directly in T-UI-105, T-UI-110, T-UI-206; no new setup.                                                       |
| `InMemoryTransactionRepository` for the integration tests    | `src/modules/transactions/infrastructure/fixtures/in-memory-transaction.repository.ts`                                                                                                                                   | Imported directly in T-UI-416 (E2E happy paths); no new setup.                                                         |
| `accounts` + `transactions` Hono routes (additive flag only) | The existing routes at `src/modules/accounts/application/actions/list-accounts.action.ts` + `src/modules/transactions/application/actions/list-transactions.action.ts` are the inputs for the additive `include=` flags. | The additive flag is wired in slice 2 (accounts list) + slice 3 (transactions list); see T-UI-103 + T-UI-203.          |

---

## Open questions for the apply worker

None. The four open questions from the proposal
(`openspec/changes/transactions-ui/proposal.md` §"Open
questions" Q1-Q4) are locked at the pre-spec session and
codified at the spec REQ-UI-1..REQ-UI-11. The three
orchestrator corrections baked into the design (dark tokens
declared but unused; two additive query flags = two new
server-side queries; every Client Component opted-in via
`'use client'`) are non-blocking. The eleven risk lines in
§"Cross-cutting risks" above are flagged for the apply
worker; none requires a renegotiation of the design.

---

## Self-verify (executed after the tasks commit lands)

```bash
# Length check — precedent is 1,441 LoC; this file must be ≥ 1,000 LoC.
wc -l openspec/changes/transactions-ui/tasks.md
# → must be ≥ 1,000 (target: ~1,400)

# Slice count check — exactly 6 sub-slice sections.
grep -cE '^### Slice [0-9]' openspec/changes/transactions-ui/tasks.md
# → 6

# Task count check — ≥ 30 T-UI-* rows across the per-slice tables.
grep -cE '^\| T-UI-[0-9]+' openspec/changes/transactions-ui/tasks.md
# → ≥ 30

# Status field check — every task row's Status column is "pending".
grep -cE '\| pending \|$' openspec/changes/transactions-ui/tasks.md
# → equal to the task count above (83)

# Author field check — Author is "Sebastián Illa" (no AI forms).
grep -E '^\*\*Author\*\*:' openspec/changes/transactions-ui/tasks.md
# → **Author**: Sebastián Illa

# Forecast block present.
grep -cE '^Decision needed before apply: No$' openspec/changes/transactions-ui/tasks.md
# → 1

# Per-slice branch names match design §19.
grep -E 'feat/ui-(primitives|accounts|transactions|dashboard-refactor|integration-tests|docs-and-perf)' openspec/changes/transactions-ui/tasks.md | wc -l
# → 6 (one occurrence per slice)
```
