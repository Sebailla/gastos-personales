# Handoff — `auth-foundation` planning v2 complete

**Status**: planning closed · **Author**: Sebastián Illa
**Date**: 2026-06-10 · **Branch**: `feat/auth-foundation`
**Worktree**: `/Users/sebailla/Documents/Proyectos/2026/gastos-personales-auth-foundation`

## What is now true

The SDD planning phases for `auth-foundation` v2 are complete. The branch
`feat/auth-foundation` carries 4 artifacts (proposal, spec, design,
tasks) in English with Spanish mirrors, plus the `openspec/config.yaml`
update enabling strict TDD with the v2 runner.

The next phase is `sdd-apply`, which is the **first** phase that
produces production code (TypeScript, Prisma schema, Auth.js
configuration, Hono catch-all, tests, CI). `sdd-apply` is **not** a
single commit — it is a sequence of atomic, TDD-driven commits
implementing T-001..T-033, organized as 3 chained pull requests to
`develop`.

## Planning artifacts (canonical, in `feat/auth-foundation`)

| Artifact | EN lines | ES lines | Commit SHA |
|---|---|---|---|
| Proposal v2 | 512 | 544 | `051e01e` |
| Spec v2 | 709 | 747 | `0dd2367` |
| Design v2 | 1,245 | 1,281 | `61a3e5c` |
| Tasks v2 | 1,456 | 1,481 | `53fcaea` |
| **Total** | **3,922** | **4,053** | **4 commits** |

Also in `feat/auth-foundation`:

- `eca35c9` — cleanup of the v1 artifacts (Bun + Hono + Drizzle +
  SQLite + custom auth). The 4 v1 commits (b2a69ec, b562cee, 17c1635,
  3083458) are preserved in git history for structural reference but
  their technical content is OBSOLETE.

## Stack v2 (closed)

- **Runtime**: Node.js 20+
- **Framework**: Next.js 16 (App Router, React 19, Server Components)
- **HTTP API**: Hono catch-all at `app/api/[...path]/route.ts`
- **Auth**: Auth.js v5 (`next-auth@5.0.0-beta.X`) + `@auth/prisma-adapter` + database sessions
- **ORM**: Prisma 6
- **Schema validation**: Zod
- **UI**: React 19 + TanStack React Form
- **DB**: PostgreSQL on Neon (free tier, branching, serverless)
- **Deploy**: Fly.io (Dockerfile multi-stage, base `node:20-alpine`)
- **Package manager**: pnpm (NOT npm/yarn/bun)
- **Test runner**: Vitest (`pnpm test`)
- **Architecture**: layered + modular

## 8 decision gaps — defaults ACCEPTED

1. Argon2id library: `@node-rs/argon2` (fallback `argon2` npm).
2. Argon2id params: `memoryCost=19456, timeCost=2, parallelism=1` (verify with benchmark in slice B).
3. `signIn` callback: update `lastLoginAt`, emit `UserRegistered` event on first registration.
4. `lastLoginAt` update path: in `signIn` callback, not on session read.
5. Hono typed-client export: `OpenAPIHono` + `hc` typed client at `src/modules/api/client.ts`.
6. `OAuthAccountNotLinked` UX: custom signIn page shows a clear message.
7. `User.email` policy on Google email change: do NOT update `User.email` (conservative).
8. Sliding-window length: 24 hours (Auth.js default).

## Forecast of chained PRs (per tasks file, slice lines exceed 400 budget)

| Slice | Tasks | Lines | Overage vs 400 |
|---|---|---|---|
| A — Floor + shared infra + auth domain + auth infrastructure | T-001..T-018 | ~1,450 | 3.6× |
| B — Auth application + Hono catch-all + UI + app composition | T-019..T-024 | ~500 | 1.25× |
| C — Security tests + CI + docs + handoff | T-025..T-033 | ~700 | 1.75× |
| **Total** | **33** | **~2,650** | — |

The user explicitly accepted the overage in this session. The
apply-phase worker has the instruction to surface actual `git diff
--stat` numbers at apply time; the parent decides whether to
re-forecast to 5 slices if a reviewer pushes back.

## What is NOT done yet (deferred to next session)

These are not "missing commits" — they are the next SDD phase
(`sdd-apply`) which produces **production code**, not planning
artifacts. They require a separate work session, ideally after the
user creates the GitHub remote so the chained PRs have a target.

1. Create the GitHub remote at `github.com/<user>/gastos-personales`
   and add it as `origin`.
2. Push the planning branch: `git push -u origin feat/auth-foundation`.
3. Open the chained PRs: `feat/auth-foundation → develop`. The
   `HANDOFF.md` and the 4 planning artifacts come along as the
   first PR's commits; subsequent PRs land slice A/B/C code.
4. Adversarial reviewer (fresh context) before each merge.
5. After all 3 slices merge, run `sdd-verify` (per-slice
   definition of done), then `sdd-sync` (update `openspec/specs/`
   if needed), then `sdd-archive` (move `openspec/changes/auth-foundation/`
   to `archive/`).
6. The 6 remaining SDD changes (unblocked after auth-foundation):
   `accounts-ledger`, `fx-cache`, `networth-snapshot`,
   `reports-mvp`, `pwa-shell`, `fly-deploy`. Each is its own
   proposal → spec → design → tasks cycle.

## Pre-apply checklist for the next session

When the next session starts and the user is ready to begin
`sdd-apply`, the parent orchestrator will:

1. `cd /Users/sebailla/Documents/Proyectos/2026/gastos-personales-auth-foundation`
2. Verify `git status` is clean (it should be — this handoff is the
   only new untracked file at this point; it gets committed by the
   next-step commit, see below).
3. Verify the remote exists, then `git push -u origin feat/auth-foundation`.
4. Re-read the 4 artifacts in order: proposal, spec, design, tasks.
5. Load the skills: `architecture-standards`, `auth-rbac`,
   `api-design`, `database-strategy`, `error-handling`,
   `env-config`, `security-owasp`, `testing-standards`,
   `ci-cd-pipeline`, `estrategia-git`, `deployment`.
6. Delegate `sdd-apply` Slice A to a `worker` subagent with the
   strict-TDD `pnpm test` runner now active in
   `openspec/config.yaml`.

## Conventions preserved (will be re-checked at apply time)

- Author: `Sebastián Illa` (per `openspec/AGENTS.md` and Engram
  observation `gastos-personales/conventions/author-attribution`).
- No AI attribution in any commit, file, or PR body.
- Conventional Commits format.
- Bilingual invariant: every English Markdown + Spanish mirror in
  the same commit (per `AGENTS.md` §13.3).
- Git Flow: `main` immutable, `develop` integration, worktrees from
  `develop` with `feat/*`/`fix/*` prefixes.
- GGA pre-commit gate (Husky).
- `pnpm install --frozen-lockfile` in CI (no npm/yarn/bun).
- TDD strict mode: RED → GREEN → REFACTOR per task, ≥80% coverage
  on `src/modules/auth/**` and `src/shared/db/**`.
