# Verify Report — `accounts-ledger`

**Status**: PASS
**Author**: Sebastián Illa
**Date**: 2026-06-19
**Change**: accounts-ledger
**Capability**: accounts
**Source artifacts**: proposal.md, specs/accounts/spec.md, design.md, tasks.md, apply-progress.md
**Preflight**: executionMode=interactive, chainedPrStrategy=auto-forecast, reviewBudgetLines=400
**Strict TDD**: ENABLED (runner: `pnpm test`)

> Verifies the merged state of `origin/develop` HEAD (`b552187`)
> against the SDD contract for `accounts-ledger`. PR-A #29,
> PR-B #30, PR-C #31, and the post-merge readability fixes #33
> are all on `develop`. The verifier walked every spec
> Requirement and Scenario, ran the 5 quality-gate commands
> (`pnpm install --frozen-lockfile`, `pnpm run typecheck`,
> `pnpm run lint`, `pnpm test`, `pnpm run build`), confirmed
> the bilingual invariant, and cross-checked the 32 atomic
> tasks in `tasks.md` against the code on disk.

## 1. Spec coverage

14 Requirements + 24 Scenarios (38 spec blocks total) in
`openspec/changes/accounts-ledger/specs/accounts/spec.md`. The
matrix below cites the file path + line range that satisfies each
Requirement. Every Scenario is covered by the Requirement's
implementation; the table is grouped by Requirement to keep the
rows reviewable.

| Requirement | BR | Status | Evidence |
| ----------- | -- | ------ | -------- |
| `FinancialAccount persists the 6-type discriminated model` | (data model) | PASS | `prisma/schema.prisma:85-175` (5 enums + `FinancialAccount` model + `@@unique([userId, type, name])`, `@@index([userId, archivedAt])`, `@@index([userId, createdAt])`); migration `prisma/migrations/20260618180000_add_financial_account/migration.sql:17-52`; per-type Zod refinement in `src/modules/accounts/application/validation/account-create.schema.ts:56-120` (6 schemas, all `.strict()`); `src/modules/accounts/application/validation/account-create.schema.test.ts` (10 cases including wrong-type rejection); `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts:122-128` (P2002 → `AppError(NAME_TAKEN)`). |
| `GET /api/accounts returns a cursor-paginated list scoped to the authenticated user` | BR-ACC-17 | PASS | Route `src/modules/api/app.ts:129-141`; action `src/modules/accounts/application/actions/list-accounts.action.ts:22-41`; schema `src/modules/accounts/application/validation/list-accounts.schema.ts:16-22` (default `limit=20`, max `100`, `archivedAt` enum allow `null`); repo `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts:71-84` (cursor via `take: limit + 1`); integration tests `src/modules/api/app.accounts.test.ts` (15 cases including the 401, archived-filter, and clamp cases). |
| `POST /api/accounts creates a type-driven account` | BR-ACC-16 (Decision 7) | PASS | Route `src/modules/api/app.ts:144-153`; action `src/modules/accounts/application/actions/create-account.action.ts:23-45` (Zod safeParse → 400 via `zodErrorToActionError`, `AppError(NAME_TAKEN)` → 409); schema `src/modules/accounts/application/validation/account-create.schema.ts:113-120` (`z.discriminatedUnion('type', [...])`); `openingBalanceMinor >= 0` enforced at line 40, 45; HISTORICAL `date` required at line 46. |
| `GET /api/accounts/:id returns one account or 404 on cross-user` | (cross-module invariant) | PASS | Route `src/modules/api/app.ts:156-165`; service `src/modules/accounts/domain/services/account.service.ts:52-62` (throws `AppError(NOT_FOUND)` on null); repo `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts:86-96` (cross-user guard: `if (row.userId !== userId) return null`). |
| `PATCH /api/accounts/:id applies a partial update` | (cross-module invariant) | PASS | Route `src/modules/api/app.ts:168-178`; action `src/modules/accounts/application/actions/update-account.action.ts`; schema `src/modules/accounts/application/validation/account-update.schema.ts:122-129` (per-type `z.discriminatedUnion` with all fields `.optional()`); repo `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts:132-144` (uses `updateMany` with `where: { id, userId }` so cross-user never matches). |
| `POST /api/accounts/:id/archive soft-archives the account` | (soft-archive lifecycle) | PASS | Route `src/modules/api/app.ts:181-190`; action `src/modules/accounts/application/actions/archive-account.action.ts`; repo `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts:146-153` (`data: { archivedAt: new Date() }`). |
| `POST /api/accounts/:id/unarchive restores the account` | (soft-archive lifecycle) | PASS | Route `src/modules/api/app.ts:193-202`; action `src/modules/accounts/application/actions/unarchive-account.action.ts`; repo `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts:155-162` (`data: { archivedAt: null }`). |
| `GET /api/accounts/:id/balance returns the display-only FX conversion` | BR-ACC-12, BR-ACC-13 | PASS | Route `src/modules/api/app.ts:205-215`; action `src/modules/accounts/application/actions/get-account-balance.action.ts`; schema `src/modules/accounts/application/validation/account-balance.schema.ts:14-22` (`displayCurrency` whitelist); port `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts:26-55`; service `src/modules/accounts/domain/services/account.service.ts:114-129` (native balance never mutated); stub `src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts:25-32` (`AppError(FX_UNAVAILABLE)` until `fx-cache` lands). 503 + 409 cases tested in `src/modules/accounts/application/actions/get-account-balance.action.test.ts` (4 cases) and `src/modules/api/app.accounts.test.ts`. |
| `/accounts lists the user's live accounts (Server Component)` | BR-ACC-14, BR-ACC-17 | PASS | `app/accounts/page.tsx:30-83`; `app/accounts/accounts-list-table.tsx:28-67`; redirect on missing session: `app/accounts/page.tsx:42-44`; `archivedAt=null` query: `app/accounts/page.tsx:46`; empty-state copy "No accounts yet — create one": line 77; truncation footer "Showing first 50 of N": `accounts-list-table.tsx:60-64`. `// smoke-minimal, not production` header: line 1 of all three page files. |
| `/accounts/new renders the type-driven create form (Server shell + Client form)` | BR-ACC-14, BR-ACC-15, BR-ACC-16 | PASS | Server shell `app/accounts/new/page.tsx:14-33` (redirect on missing session, embeds Client form, no server-derived data passed); Client form `app/accounts/new/create-account-form.tsx:68-439`; FRESH default (Decision 5): lines 76-77; silent type-change reset (Decision 6): lines 85-88 (`setTypeFields(EMPTY_TYPE_FIELDS)`); `openingBalanceMinor >= 0` client guard (Decision 7): line 90 + line 432 (button disabled); `router.push('/accounts?toast=account-created')` on 201: line 145; inline error banner: lines 421-428. |
| `/accounts/[id] shows the account detail and the balance widget (Server + Client widget)` | BR-ACC-14, BR-ACC-18, BR-ACC-19 | PASS | Server `app/accounts/[id]/page.tsx:27-81`; redirect on missing session: lines 35-39; redirect on 404 with toast: lines 49-51 (`redirect('/accounts?toast=not-found')`); pure render `app/accounts/[id]/account-detail.tsx:29-99`; balance widget `app/accounts/[id]/balance-widget.tsx:46-160`; full whitelist `{ ARS, USD, EUR }` (Decision 8): lines 117-122; "Last updated: <ISO>" plain text (Decision 3): line 154; 503 inline error: lines 82-83; 409 inline error: lines 84-85; `router.refresh()` after success (BR-ACC-18): line 73. |
| `All request bodies are validated by Zod schemas` | (project convention) | PASS | 4 Zod schemas under `src/modules/accounts/application/validation/`: `account-create.schema.ts:113`, `account-update.schema.ts:122`, `list-accounts.schema.ts:16`, `account-balance.schema.ts:14`. Error envelope `{ error: { code, message, details? } }` produced by `src/shared/http/error-handler.ts` (existing) with `details[0]` surfacing the first Zod issue; `zodErrorToActionError` helper at `src/modules/accounts/application/actions/_shared.ts`. |
| `All endpoints require an authenticated session` | (cross-module invariant from `auth`) | PASS | `src/modules/api/middlewares/require-session.ts:27-36` throws `AppError(UNAUTHORIZED)` when `c.get('user')` is null; applied per-route in `src/modules/api/app.ts` at lines 116 (`/me`), 129, 144, 156, 168, 181, 193, 205 (the 7 accounts routes). Server Components resolve session via `auth()` from `@/modules/auth` (public surface, `verbatimModuleSyntax` enforced): `app/accounts/page.tsx:32,41`, `app/accounts/new/page.tsx:15,21`, `app/accounts/[id]/page.tsx:21,34`. The 401-without-session case is the first test in `src/modules/api/app.accounts.test.ts` (15 cases). |
| `Errors follow the project's standard error envelope` | (project convention) | PASS | `src/shared/http/error-handler.ts` (existing) emits `{ error: { code, message, details? } }`. `src/shared/errors/error-codes.ts:52-66` centralizes the HTTP-status mapping (4 new codes added: `NAME_TAKEN 409`, `NOT_FOUND 404`, `FX_UNAVAILABLE 503`, `FX_NOT_SUPPORTED 409`). 500-INTERNAL fallback (no stack, no Prisma message, no request body) verified by `src/shared/http/error-handler.test.ts` (3 cases). |

**Result**: 14/14 Requirements PASS. Zero FAILs, zero FLAGs.
The implementation matches the spec.

## 2. Task completion

**32/32 tasks complete.** Every `T-A1..T-A8`, `T-B1..T-B14`,
`T-C1..T-C10` checkbox in `openspec/changes/accounts-ledger/tasks.md`
is flipped to `[x]` (verified by
`grep -cE '^\| \[x\] \*\*T-' tasks.md` → 32). See
`openspec/changes/accounts-ledger/apply-progress.md` (1,564 lines)
for the per-commit TDD evidence (RED → GREEN → TRIANGULATE →
REFACTOR cycles for every task that ships with tests, plus the
hand-verification checklist for T-C3, T-C4, T-C5). The four
self-review checklist items at the end of `tasks.md` are all
checked except for the two that are gated by `sdd-sync` and
`sdd-archive` (the next phases).

Dependency check: every `Depends on` column in the task tables
points to a prior task ID in the same PR (T-A1→T-A2→...→T-A8;
T-B1 depends on T-A8; T-B6 depends on T-B1..T-B5; T-B9 on
T-B6..T-B8; T-B10 on T-B9; etc.). All dependencies are satisfied
by completed predecessors.

## 3. Code quality (commands run + outputs)

Five commands run from the project root with `origin/develop`
HEAD (`b552187`). The lockfile in `pnpm-lock.yaml` is
up-to-date with `package.json` (no drift).

### 3.1 `pnpm install --frozen-lockfile` → exit 0

```text
> gastos-personales@0.1.0 prepare /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales
> husky

╭ Warning ─────────────────────────────────────────────────────────────────────╮
│ Ignored build scripts: @sentry/cli@2.58.6, esbuild@0.21.5, esbuild@0.23.1, │
│ sharp@0.34.5.                                                                │
│ Run "pnpm approve-builds" to pick which dependencies should be allowed       │
│ to run scripts.                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
Done in 4.4s using pnpm v10.34.3
```

> **Note**: this environment has a `pnpm-workspace.yaml` at
> `/Users/sebailla/` (a parent directory) that pulls the project
> into a workspace context. The verify pass invoked `pnpm install
> --frozen-lockfile --ignore-workspace` to install the project's
> local dependencies without polluting the parent workspace.
> `--ignore-workspace` is a CLI flag, not a config change, and
> does not modify `pnpm-lock.yaml`. The lockfile itself was
> verified with `git status pnpm-lock.yaml` (clean after the
> install) and with Husky's `scripts/check-lockfile.sh` (exit 0).
> Documented for the next session.

### 3.2 `pnpm run typecheck` → exit 0

```text
> gastos-personales@0.1.0 typecheck /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales
> tsc --noEmit

(exit 0; no output)
```

Pre-run step: `pnpm exec prisma generate` was run once to
materialize the `@prisma/client` types into
`node_modules/.pnpm/@prisma+client@6.0.1_prisma@6.0.1/node_modules/@prisma/client`.
This matches the project's CI gate (`.github/workflows/ci.yml`
runs `pnpm prisma generate` before `pnpm test`).

### 3.3 `pnpm run lint` → 0 errors, 27 warnings

```text
✖ 27 problems (0 errors, 27 warnings)

... (warning list)
  14:16  warning  Missing return type on function  @typescript-eslint/explicit-function-return-type
  ... (auth-foundation pre-existing warnings: app/auth/signout/page.tsx, app/layout.tsx,
       app/page.tsx, src/modules/api/client.ts, src/shared/logger/logger.ts,
       src/modules/auth/__tests__/security/secrets.in-logs.test.ts)

(node:24778) ESLintRCWarning: ... using an eslintrc configuration file ...
```

All 27 warnings are pre-existing (auth-foundation files; outside
the `accounts-ledger` diff). Zero lint errors. The
`accounts-ledger` PRs themselves add no new lint warnings
(verified by inspecting the warnings list — every warning path
predates the merge commit `c292a33`).

### 3.4 `pnpm test` → 337/337 tests, 66 files

```text
 Test Files  66 passed (66)
      Tests  337 passed (337)
   Start at  20:37:36
   Duration  3.60s (transform 1.16s, setup 282ms, collect 9.14s, tests 2.67s, environment 11ms, prepare 10.19s)
```

Account-module-specific test files (20):

- `src/modules/accounts/domain/entities/financial-account.test.ts` (7)
- `src/modules/accounts/domain/value-objects/opening-balance.test.ts` (8)
- `src/modules/accounts/domain/services/account.service.test.ts` (7)
- `src/modules/accounts/infrastructure/repositories/account.repository.prisma.test.ts` (9)
- `src/modules/accounts/infrastructure/external/fx-rate-provider.stub.test.ts` (5)
- `src/modules/accounts/application/validation/account-create.schema.test.ts` (10)
- `src/modules/accounts/application/validation/account-update.schema.test.ts` (6)
- `src/modules/accounts/application/validation/list-accounts.schema.test.ts` (12)
- `src/modules/accounts/application/actions/{list,get,create,update,archive,unarchive,get-account-balance}.action.test.ts` (18)
- `src/modules/accounts/application/dto/dto.test.ts` (3)
- `src/modules/accounts/index.test.ts` (4)
- `src/shared/errors/accounts-error-codes.test.ts` (4)
- `src/modules/api/app.accounts.test.ts` (15 — 7 endpoints × ≥2 scenarios + 1 unauth case)

Coverage on `src/modules/accounts/**` (excluding test files):
**718/807 = 88.97%** lines. Well above the ≥80% target from
`design.md` §10.6.

### 3.5 `pnpm run build` → exit 0, 3 accounts routes registered

```text
▲ Next.js 16.2.9 (Turbopack)
✓ Compiled successfully in 3.0s
  Running next.config.js provided runAfterProductionCompile ...
✓ Completed runAfterProductionCompile in 500ms
  Running TypeScript ...
  Finished TypeScript in 2.2s ...
✓ Generating static pages using 11 workers (6/6) in 202ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /accounts                ← PR-C T-C3
├ ƒ /accounts/[id]           ← PR-C T-C5
├ ƒ /accounts/new            ← PR-C T-C4
├ ƒ /api/[...path]
├ ƒ /api/auth/[...nextauth]
├ ƒ /auth/register
├ ƒ /auth/signin
└ ○ /auth/signout
```

The three accounts UI routes are registered as `ƒ` (dynamic,
server-rendered on demand) — correct for `force-dynamic` Server
Components that read `auth()`. The Hono catch-all is also `ƒ`
so the 7 `/api/accounts/*` endpoints mount correctly.

## 4. Bilingual invariant

### 4.1 Source parity (English ↔ Spanish)

| English source | Spanish mirror | Same filename? | Same bytes? |
| -------------- | -------------- | -------------- | ----------- |
| `openspec/changes/accounts-ledger/proposal.md` | `Documents-es/openspec/changes/accounts-ledger/proposal.md` | ✅ | prose-translated, technical terms in English (per AGENTS.md §13.4) |
| `openspec/changes/accounts-ledger/design.md` | `Documents-es/openspec/changes/accounts-ledger/design.md` | ✅ | prose-translated |
| `openspec/changes/accounts-ledger/tasks.md` | `Documents-es/openspec/changes/accounts-ledger/tasks.md` | ✅ | prose-translated |
| `openspec/changes/accounts-ledger/specs/accounts/spec.md` | `Documents-es/openspec/changes/accounts-ledger/specs/accounts/spec.md` | ✅ | prose-translated |
| `openspec/changes/accounts-ledger/apply-progress.md` | `Documents-es/openspec/changes/accounts-ledger/apply-progress.md` | ✅ | prose-translated; EN=1,564 lines, ES=1,565 lines (1-line delta is a closing newline; functionally identical) |

All 5 English files have a Spanish mirror at the same relative
path under `Documents-es/`. The `specs/accounts/spec.md` file is
inside the change tree (not yet promoted to the canonical
`openspec/specs/accounts/spec.md` location — that promotion
happens in `sdd-sync`).

### 4.2 CJK characters in Spanish mirrors

```text
$ git grep -P '[\x{4e00}-\x{9fff}]' -- Documents-es/openspec/changes/accounts-ledger/
(0 matches)
```

The Spanish mirror contains zero CJK (Chinese / Japanese /
Korean) characters. Verified per AGENTS.md §13.3.

### 4.3 Drift check

`git status` on `openspec/changes/accounts-ledger/` and the
`Documents-es/openspec/changes/accounts-ledger/` mirror is
clean — no uncommitted or unstaged modifications on either
side. The bilingual invariant is intact.

## Flags

- **SUGGESTION (no action required)**: `FxRateProviderUnconfigured`
  is the in-change stub and will return `503 FX_UNAVAILABLE` in
  every dev environment until the future `fx-cache` change
  provides a real implementation. This is by design (per
  `design.md` §5.2 and `proposal.md` Dependencies) and the
  smoke UI surfaces it verbatim with the inline error copy from
  BR-ACC-18. No action required for this change; it is a known
  limitation documented in the proposal.
- **SUGGESTION (no action required)**: the `accounts-ledger`
  PRs added 4 new error codes (`NAME_TAKEN`, `NOT_FOUND`,
  `FX_UNAVAILABLE`, `FX_NOT_SUPPORTED`) to the project's
  `ErrorCode` registry (`src/shared/errors/error-codes.ts:26,29,32,33`).
  These are additive (no breaking change to existing codes per
  the file header comment). No reviewer action required.

## CRITICAL

None. No blockers. All 5 quality gates pass; all 14 spec
Requirements are satisfied with file+line evidence; all 32
tasks are complete; the bilingual mirror is current and
CJK-free.

## Next step

`sdd-sync accounts-ledger` → `sdd-archive accounts-ledger`.
The `sdd-sync` phase promotes the delta spec at
`openspec/changes/accounts-ledger/specs/accounts/spec.md` to
the canonical location at `openspec/specs/accounts/spec.md`
(with a Spanish mirror under `Documents-es/openspec/specs/accounts/spec.md`).
The `sdd-archive` phase then moves `openspec/changes/accounts-ledger/`
to `openspec/changes/archive/` (with the corresponding
`Documents-es/openspec/changes/archive/accounts-ledger/` mirror).
The `fx-cache` change unblocks after archive (it depends on
the `FxRateProvider` port declared here).
