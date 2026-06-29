# gastos-personales

Multi-user personal finance app — accounts, transactions, monthly reports, and a hand-built design system.

## What is it?

`gastos-personales` is a multi-user personal finance app built on Next.js 16, React 19, Hono, Auth.js v5, Prisma 6, and PostgreSQL. It tracks **financial accounts** and **transactions** in any currency, converts foreign-currency transactions to a base currency at write time, and surfaces a monthly dashboard with three read aggregates: a totals summary, a category breakdown, and an optional per-account daily flow. The app supports multiple users with strict data isolation: every read and write scopes to the session's `userId`, and a user can never see another user's accounts, transactions, or reports.

The project is organised into seven capabilities: `auth` (Credentials + Google OAuth + database sessions), `accounts` (multi-currency ledger), `transactions` (FX snapshot at write time), `fx` (currency conversion cache), `snapshots` (period-close net worth), `reports` (monthly summary + category breakdown + account flow), and `ui` (the hand-built design-system reference and the production render layer). The current release is **v0.4.1**; the manifest version is `0.4.0` and the operational tag is `v0.4.1`.

## Stack

- **Runtime**: Node.js 20+
- **Framework**: Next.js 16 (App Router, Server Components, React 19)
- **API**: Hono (catch-all for non-auth endpoints) — every API call is in-process via `serverHonoRequest`, no fetch round-trip
- **Auth**: Auth.js v5 + `@auth/prisma-adapter` + database sessions + Argon2id for password hashing
- **ORM**: Prisma 6
- **DB**: PostgreSQL (local Docker in dev, Neon in prod)
- **Validation**: Zod (at every boundary)
- **Styling**: Tailwind v4 + a hand-built design system (no shadcn, no MUI, no Radix in v1)
- **Test runner**: Vitest + `vitest-axe` for accessibility
- **Package manager**: pnpm

## Features (v0.4.1)

- **18 design-system primitives** at `app/_ui/primitives/` (`Button`, `Input`, `Combobox`, `FieldError`, `Card` + sub-components, `Table` + sub-components, `Badge`, `Dialog`, etc.) and **5 layout-shell primitives** at `app/_ui/layout/` (`PageHeader`, `PageContainer`, `BreadcrumbBar`, `Sidebar`, `Topbar`).
- **Production UI surfaces** at `/accounts`, `/accounts/:id`, `/accounts/new`, `/transactions`, `/transactions/:id`, `/transactions/new`, and `/dashboard` — each covering the four UI states (empty, loading, error, success) per REQ-UI-3.
- **axe-core a11y suite** at `tests/a11y/` — one `vitest-axe` test per production page asserting zero `critical` or `serious` violations (WCAG 2.2 AA floor).
- **Multi-user isolation** — every read and write scopes to the session's `userId`; cross-user reads return 404.
- **FX conversion at write time** — a foreign-currency transaction stores the native amount AND the converted amount + the FX rate snapshot.
- **Monthly dashboard** — three read aggregates joined: monthly totals (income/expense/net), category breakdown (sorted descending by amount), and per-account daily flow.
- **Auth.js v5** — email + password (Argon2id) and Google OAuth; encrypted token storage; open-redirect protection on `?callbackUrl=`.
- **Prisma 6 + Postgres** — six models (`User`, `Account`, `Session`, `VerificationToken`, `FinancialAccount`, `Transaction`).
- **Coverage gate on pre-push** — 80% lines / branches / functions / statements (current at v0.4.1: 97 / 90 / 84 / 97).
- **Two user-owned follow-ups** still pending: T-UI-505 (Lighthouse p95 < 2s on `/`, `/dashboard`, `/transactions`) and T-UI-506 (manual QA sign-off per `docs/qa/transactions-ui.md`). Neither is a release blocker; the maintainer can run them against the v0.4.1 tag at any time.

## Project layout

The repo follows a layered architecture: `src/modules/<capability>/` (domain, application, infrastructure) for the seven capabilities, `src/composition/` for the Hono factory + DI wiring, `src/shared/` for the cross-cutting kernel (events, errors, domain ports, logger, db), and `app/` for the Next.js routes. The `app/_ui/` folder holds the hand-built design system; the `app/_components/` folder holds the production dashboard + transactions-list Client Components; the `app/_lib/` folder re-declares wire types locally (UI cannot import from `src/modules/...` per the architecture rule). The `openspec/` folder holds the SDD change lifecycle; `docs/` holds architecture + ADR + QA + perf artifacts; `Documents-es/` is the Spanish mirror of every English Markdown.

### Architecture rules (the absolute floor)

These are non-negotiable; the agent contract (`AGENTS.md` §10.5) and the reviewer subagent enforce them on every PR:

- **Domain independence** — the domain layer (aggregates, value objects, ports) does NOT import from application, infrastructure, or UI.
- **Ports & Adapters** — infrastructure implements domain interfaces (e.g. `AccountRepositoryPort`).
- **No circular dependencies** — dependencies always point toward the domain.
- **Modules are isolated** — a module does NOT import directly from another module; cross-module communication goes through `src/shared/events/` (the event dispatcher) or `src/shared/domain-kernel/` (the structural kernel).
- **Coverage ≥ 80%** on domain + application per layer (measured per layer, not per repo).
- **No `any`** — use `unknown` or specific interfaces. TypeScript `strict: true` always.
- **Error handling** — services throw, actions catch. Input validated with Zod at every boundary.

## Quick start (local development)

### Prerequisites

- **Node.js 20+** (the project pins `engines.node` to `>=20` and `packageManager` to `pnpm@10.34.3` via corepack)
- **pnpm 10+** (via corepack)
- **Docker** (for the local Postgres)

### Steps

```bash
# 1. Clone + install
git clone https://github.com/Sebailla/gastos-personales
cd gastos-personales
corepack enable
pnpm install

# 2. Bring up the local Postgres (host port 5433 -> container 5432)
pnpm db:up

# 3. Copy the env template and fill in the required values
cp .env.example .env
# (edit .env; see "Environment variables" below for what to fill in)

# 4. Apply the Prisma migrations
pnpm prisma migrate deploy

# 5. Generate the Prisma client
pnpm prisma generate

# 6. Start the dev server
pnpm dev
# -> http://localhost:3000
```

### Environment variables

| Variable                     | Purpose                                                                               | How to generate                           |
| ---------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| `DATABASE_URL`               | Postgres connection string (local Docker, dev/staging/prod point at Neon)             | n/a                                       |
| `AUTH_SECRET`                | 32+ byte random string; Auth.js signs the session cookie                              | `openssl rand -base64 32`                 |
| `AUTH_URL`                   | Public URL of the app; used to build OAuth callback URLs                              | n/a (defaults to `http://localhost:3000`) |
| `APP_URL`                    | Public URL for the Hono origin-check allowlist                                        | n/a (defaults to `http://localhost:3000`) |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | 32-byte AES-256-GCM key, hex-encoded (64 hex chars); encrypts stored OAuth tokens     | `openssl rand -hex 32`                    |
| `AUTH_GOOGLE_ID`             | OAuth 2.0 client ID from Google Cloud Console                                         | n/a                                       |
| `AUTH_GOOGLE_SECRET`         | OAuth 2.0 client secret from Google Cloud Console                                     | n/a                                       |
| `ARGON2ID_DUMMY_PASSWORD`    | 32+ byte random string; seeds the `DUMMY_HASH` for timing-equalized Credentials login | `openssl rand -base64 32`                 |
| `NODE_ENV`                   | `development` / `test` / `production`                                                 | n/a (defaults to `development`)           |
| `LOG_LEVEL`                  | `debug` / `info` / `warn` / `error`                                                   | n/a (defaults to `info`)                  |

### First sign-in

1. Visit **http://localhost:3000/auth/register** to create an account (email + password). You'll be redirected to the sign-in page with a confirmation.
2. Sign in at **/auth/signin** (or continue with Google if `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are configured).
3. Land on **/accounts** — the list is empty; click **+ New account**, fill the form, submit.
4. Back at **/accounts**, click **+ New transaction**, pick the account you just created, submit.
5. Open **/dashboard** to see the three read aggregates for the current UTC month. Use the **Month** switcher to navigate previous / next months; pick an account from the picker to populate the per-day flow card.

## Usage (the 3 main pages)

### Accounts — `/accounts`

The accounts list renders as a sortable table with three sort keys (Name, Currency, Last activity) and an `aria-sort` reflecting the current direction. A **Show archived** checkbox toggles archived accounts in the view (the API excludes archived rows by default). The **+ New account** button in the page header opens the create form.

The detail view at `/accounts/:id` shows the account's currency badge, archived status, current balance, and edit / archive actions.

The create form at `/accounts/new` runs inline Zod validation, pairs every control with a `<label htmlFor>` (REQ-UI-5), surfaces per-field errors with `aria-describedby` (REQ-UI-6), and renders `Spinner + disabled + aria-busy="true"` on the submit button while the Server Action is in flight (REQ-UI-7). On 201, the form navigates to the new detail page.

### Transactions — `/transactions`

The transactions list renders as a sortable table with three sort keys (Date — newest first by default, Native amount, Converted amount). Direction badges colour-code each row: `INCOME` renders the success variant (green), `EXPENSE` renders the danger variant (red). An **Account** column surfaces when the API was queried with `?include=accountName`. The list is cursor-paginated; a `Pagination` primitive mounts when `nextCursor` is non-null. The **+ New transaction** button opens the create form.

The detail view at `/transactions/:id` renders a Card layout with Identification / Amount / FX snapshot / Audit sections, plus a delete Dialog.

The create form at `/transactions/new` composes a `Combobox` for account selection plus 7 fields (account, date, direction, amount, currency, category, memo), runs inline Zod validation, and applies the same a11y contract as the account form.

### Dashboard — `/dashboard`

The dashboard is a Server Component that fetches the three read aggregates in parallel and renders them in a 1+2 grid on large viewports (`lg:grid-cols-3`), stacked on small. The three cards are:

- **Monthly summary** — totals table with `INCOME` (green) and `EXPENSE` (red) direction badges and a net line.
- **Category breakdown** — categories sorted by absolute amount descending.
- **Account flow** — per-day totals for the picked account; the card is empty when no `?accountId=` is set.

The page header renders a **Month** switcher (`DashboardMonthSwitcher` — `<Link>`s for previous / current / next month) and an account picker that navigates to `?accountId=<id>`. URL params: `?accountId=<uuid>` populates the flow card; `?month=YYYY-MM` selects the report window (default = current UTC month). Dec→Jan rollover is automatic.

The dashboard copy is in **Spanish** (per the existing project convention); the components themselves use English copy.

## Tests

```bash
pnpm test                     # all tests, ~2 min
pnpm test:watch               # watch mode
pnpm test:coverage            # coverage report
pnpm test:coverage:enforced   # 80% gate on lines/branches/functions/statements (pre-push)
```

The enforced coverage gate runs on `git push` (one run per branch). Current coverage at v0.4.1: 97.04 lines / 90.42 branches / 84.19 functions / 97.04 statements. The pre-push gate uses `SKIP_TIMING=true` locally to bypass two flaky timing tests (`argon2.parameters.test.ts`, `login.timing.test.ts`); CI runs the strict suite.

Beyond the unit + integration + E2E suites under `tests/`, the project ships three test flavours specific to the `ui` capability:

- **`tests/a11y/`** — one `vitest-axe` test per production page asserting zero `critical` or `serious` axe-core violations.
- **`tests/visual/`** — golden-file snapshots for the presentational primitives (`Card`, `Badge`, `EmptyState`, `Skeleton`, `Breadcrumb`).
- **`tests/e2e/`** — full user journeys (list → detail → create → submit; dashboard account picker + month switcher).

## Build + deploy

```bash
pnpm build           # next build (production bundle)
pnpm start           # next start (port 3000 by default)
pnpm lint            # eslint
pnpm typecheck       # tsc --noEmit
```

Production deploy lives in the `fly-deploy` change (Fly.io, region `eze` for Buenos Aires by default). Production secrets live in `fly secrets`; the `.env.example` template documents the full variable set. The `@sentry/nextjs` integration reports runtime errors and slow pages to the project's Sentry instance.

### Useful database scripts

```bash
pnpm db:up           # docker compose up -d postgres (host port 5433)
pnpm db:down         # docker compose stop (preserves data volume)
pnpm db:reset        # docker compose down -v + up (wipes data volume)
pnpm db:logs         # docker compose logs -f postgres
pnpm prisma studio   # open Prisma Studio against the local DB
```

### Troubleshooting

- **Pre-commit hook times out after 2 minutes** — `pnpm exec lint-staged && gga run` runs the full coverage gate. The first commit attempt in a worktree is the slowest; subsequent attempts use the cache. If your shell tool has a 2-minute timeout, bump it to 5 minutes for the first commit.
- **`pnpm install` is a no-op in a fresh worktree** — the user's `$HOME` carries a `pnpm-workspace.yaml` that pnpm treats as a workspace root, hijacking the install. Workaround: `pnpm install --ignore-workspace && npx prisma generate`. After the worktree has `node_modules/`, all subsequent `pnpm` commands work normally.
- **Pre-commit fails on `.npmrc`** — pnpm sometimes creates a stray `.npmrc` in the worktree that lint-staged tries to stage. Delete it with `rm .npmrc` before committing. The repo does not need `.npmrc`.
- **Argon2id timing tests are flaky locally** — pass `SKIP_TIMING=true pnpm test`. CI runs the strict suite.

## Project conventions

- **Conventional Commits** — `<type>(<scope>): <description>`, imperative present, ≤ 72 chars first line, body explains _why_. No `Co-authored-by:` trailers, no AI attribution.
- **Git Flow** — `main` is immutable (merges from `develop` only on explicit user request); `develop` is integration; all work lands via worktree branches with the prefix `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/`, `build/`, `ci/`, `perf/`, or `revert/`.
- **Dual-language docs** — every English Markdown has a Spanish mirror under `./Documents-es/` in the same commit (root `AGENTS.md` §13.3). Spanish translation is faithful, not creative — preserve code blocks, file paths, commands, and config keys verbatim.
- **Pre-commit gate** — `pnpm exec lint-staged && gga run` runs before every commit. The hook can take 1–2 minutes on the first run; subsequent runs are faster (cache). `commitlint` runs on `commit-msg`; the branch-name validator runs on `pre-push`.
- **OpenSpec workflow** — non-trivial changes go through the proposal → spec → design → tasks → apply → verify → sync → archive lifecycle in `openspec/changes/<name>/`. The current canonical specs are in `openspec/specs/<capability>/spec.md`.
- **TypeScript `strict: true`**; no `any`; no implicit returns. Argon2id for password hashing. Secrets never appear in logs (the structured logger maintains a denylist of `{ password, passwordHash, sessionToken, access_token, refresh_token, id_token, csrfToken, 'set-cookie' }`).
- **Author of every document**: `Sebastián Illa`. No AI attribution. Document metadata and commit authorship are independent; both follow the no-AI-attribution rule.

## Documentation

Documentation shipped in v0.4.1:

- `docs/architecture/ui.md` — the public design-system reference (token table, primitive inventory with props shape and a11y contract per primitive, layout-shell inventory, cross-cutting contracts). Codifies REQ-UI-10.
- `docs/qa/transactions-ui.md` — the manual QA checklist (per-page keyboard sweep, screen-reader pass on VoiceOver + NVDA, cross-user isolation manual check, axe-core informational section, user-owned sign-off section). Runnable in 30–45 minutes. Codifies REQ-UI-11.
- `docs/perf/transactions-ui.md` — the perf budget verification (Lighthouse CLI commands, the simulated 4G + Moto G4 throttling profile, the p95 page load < 2s budget on `/`, `/dashboard`, and `/transactions`; JSON summary placeholders for the three pages; budget-failure mitigation from `design.md §16.5`).
- `openspec/specs/auth/spec.md`, `openspec/specs/accounts/spec.md`, `openspec/specs/transactions/spec.md`, `openspec/specs/fx/spec.md`, `openspec/specs/snapshots/spec.md`, `openspec/specs/reports/spec.md`, `openspec/specs/ui/spec.md` — the canonical capability specs (seven capabilities). Each spec declares the **what** (requirements + scenarios), not the **how** (file paths, component names, schema syntax).
- `openspec/changes/archive/2026-06-29-transactions-ui/` — the archived change folder with the full audit trail (proposal, design, tasks, 6 slice apply-progress notes, verify-report, sync-report, archive note). Other archive folders cover `accounts-ledger`, `auth-foundation`, `fx-cache`, `transactions`, `reports`, and the slice-C reopen.
- `CHANGELOG.md` — the Keep-a-Changelog history (`0.2.0`, `0.2.1`, `0.3.0`, `0.4.0` + the v0.4.1 operational tag).
- `Documents-es/` — the Spanish mirror of every English Markdown in the repo (same path, same filename, faithful translation).

## License

Private project. No `LICENSE` file ships with the repo. All rights reserved by the author (`Sebastián Illa`) unless and until an explicit license is added.

## Contributing

PRs are welcome on a worktree branch off `develop`. Read `AGENTS.md` first — it is the project's agent contract and covers git workflow, OpenSpec lifecycle, dual-language docs, and the absolute rules (Domain independence, Ports & Adapters, no `any`, `strict: true`, etc.). Follow the OpenSpec workflow for non-trivial changes (anything that crosses a module boundary, touches security or data isolation, or changes a public API). Use Conventional Commits. Keep English Markdown and the `./Documents-es/` mirror in the same atomic commit.

A reasonable first issue might be: pick a `ui-dark-mode` or `ui-i18n` follow-up from the v0.4.0 release notes (the dark-mode tokens are declared but unused; the i18n message catalog is a green-field surface). Other entry points: the `snapshots` capability spec is in place but not yet implemented; the `revenue-categories` capability and the `budgets` capability are forward-declared. Bug reports against the v0.4.1 tag are valuable — file them on GitHub with the repro steps, the route + query params, the Sentry event id (if any), and the expected vs actual behaviour.
