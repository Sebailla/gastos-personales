# Tasks — `auth-foundation-slice-c`

**Author**: Sebastián Illa
**Change**: `auth-foundation-slice-c`
**Status**: ready-for-apply · **Created**: 2026-06-13
**Upstream**: `openspec/changes/auth-foundation-slice-c/proposal.md` (approved) ·
`openspec/changes/auth-foundation-slice-c/spec.md` (16 deltas, approved) ·
`openspec/changes/auth-foundation-slice-c/design.md` (8 sections, approved)
**Parent change**: `auth-foundation` (Slice A + B merged as PRs #5, #17)
**Target branch**: `feat/auth-foundation-slice-c-c1` → `develop` (then C-2, then C-3)
**PR strategy**: 3 chained PRs in 3 sub-slices (C-1 → C-2 → C-3); see "Review workload forecast"
**Preflight values**: interactive · `both` (OpenSpec + Engram) · `auto-forecast` · 400 lines budget
**Stack v2 (inherited)**: Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 + `@auth/prisma-adapter` + Prisma 6 + PostgreSQL + Zod + Vitest + pnpm

> **Closure notes**:
>
> - **FLAG-1 (CRITICAL)**: module-resolution bug (issue #18) keeps 3 test files excluded in `vitest.config.ts`. C-1 closes it via Vite `resolve.alias` patch + 30-line stub. Target: 137/137 tests verde, coverage ≥ 80% on `src/modules/auth/**`.
> - **FLAG-2 (WARNING)**: bilingual drift in `Documents-es/openspec/changes/auth-foundation/apply-progress.md` (stale at Slice A only). C-3 closes it as part of the handoff commit.

## Goal

Close the 9 remaining tasks (T-025..T-033) of the parent `auth-foundation` change, plus the parent change's CRITICAL FLAG-1 (module-resolution bug, issue #18) and WARNING FLAG-2 (bilingual drift). When `sdd-apply` finishes:

- 137/137 tests verde (134/134 + 3 re-included).
- Coverage on `src/modules/auth/**` ≥ 80%.
- 6 security tests implemented and passing.
- CI workflow with 4 parallel jobs (lint, test, build, security).
- Branch protection + CODEOWNERS documented.
- 5 ADRs in `docs/adr/`.
- `docs/architecture.md` + `README.md` updated (EN + ES mirrors).
- `Documents-es/openspec/changes/auth-foundation/apply-progress.md` re-synced.
- All 9 Slice C tasks + module-resolution fix flipped to `[x]` in the parent change's `tasks.md`.

---

## Sub-slice C-1 (PR 1) — Module-resolution + catch-all + middleware + public API

### C-1 task list

- [x] **T-C1.0** Module-resolution fix (FLAG-1 closure, issue #18)

  - **Scope (RED → GREEN)**: add a `resolve.alias` in `vitest.config.ts` mapping `'next/server'` to a 30-line stub at `test/stubs/next-server.ts`. The stub provides `NextRequest`, `NextResponse`, and `userAgent` no-ops (test-only; production uses real `next/server`). Remove the 3 entries from `test.exclude` (the previously-excluded files now run). Verify: `npx vitest run` → 137/137 verde, `npx vitest run --coverage` → coverage on `src/modules/auth/**` ≥ 80%.
  - **Files**: `vitest.config.ts` (+~10 lines for the alias + removing 3 exclude entries), `test/stubs/next-server.ts` (new file, ~30 lines)
  - **Lines estimate**: 40
  - **Depends on**: Slice A + B + chores already merged (`develop` HEAD ≥ `c84b4ee`)
  - **Tests**: 0 new tests; **re-include** 3 existing tests that previously failed at import: `src/modules/auth/infrastructure/external/authjs.test.ts`, `src/modules/auth/index.test.ts`, `app/api/auth/[...nextauth]/route.test.ts`
  - **Verify**:
    ```bash
    npx vitest run
    # → 137/137 passed in 33 test files
    npx vitest run --coverage
    # → Coverage on src/modules/auth/** ≥ 80% (lines, branches, functions, statements)
    ```
  - **Fallback** (if the stub is insufficient): bump `next-auth@5.0.0-beta.32+` when available. Document in the handoff; parent decides.

- [x] **T-025** Mount `app/api/[...path]/route.ts` (Hono catch-all)

  - **Scope (RED → GREEN)**: the route delegates GET/POST/PATCH/DELETE to `honoApp.fetch(request)`. Routing precedence: Next.js's file-based routing matches `app/api/auth/[...nextauth]/route.ts` BEFORE `app/api/[...path]/route.ts` (the more specific path wins). Tests assert: 1) `GET /api/me` without session → 401, 2) `GET /api/auth/signin` → returns Auth.js's HTML response (NOT Hono's JSON).
  - **Files**:
    - `app/api/[...path]/route.ts` (~30 lines)
    - `app/api/[...path]/route.test.ts` (integration test, ~50 lines; uses `child_process.spawn` to start `next dev` and `fetch` against it)
  - **Lines estimate**: 80
  - **Depends on**: T-021 (Hono app), T-024 (Auth.js mount), T-C1.0 (module-resolution fix)
  - **Tests**: 2 cases. AAA pattern. Both are integration tests against a real Next.js server.
  - **Verify**:
    ```bash
    pnpm test app/api/
    # → 2 cases pass
    pnpm run build
    # → exits 0
    ```

- [x] **T-026** Public API export (`src/modules/auth/index.ts`) + Next.js middleware
  - **Scope (RED → GREEN)**: `src/modules/auth/index.ts` exports `auth`, `signIn`, `signOut`, `handlers`, `honoApp`, `UserRegistered`, `UserSignedIn`. `tsconfig.json` has `verbatimModuleSyntax: true` so non-exported imports fail at compile time. `middleware.ts` at project root exports a default `auth((request) => ...)` handler that 302-redirects unauthenticated requests to `/auth/signin`. Tests assert: 1) compile-time check of the named exports, 2) 302 redirect for unauthenticated `/dashboard`, 3) 200 for authenticated `/dashboard`.
  - **Files**:
    - `src/modules/auth/index.ts` (~30 lines)
    - `src/modules/auth/index.test.ts` (compile-time check, ~20 lines)
    - `middleware.ts` at project root (~20 lines)
  - **Lines estimate**: 70
  - **Depends on**: T-018 (authjs), T-021 (Hono app), T-025 (catch-all), T-C1.0
  - **Tests**: 3 cases. AAA pattern.
  - **Verify**:
    ```bash
    pnpm test src/modules/auth/index.test.ts
    # → 1 case passes (compile-time check)
    pnpm run typecheck
    # → 0 errors
    pnpm test middleware.test.ts  # or inline
    # → 2 cases pass (302 redirect + 200)
    ```

### C-1 acceptance

- [ ] `vitest.config.ts#test.exclude` no longer lists the 3 previously-excluded files
- [ ] `pnpm test` → 137/137 verde
- [ ] `pnpm test --coverage` → coverage on `src/modules/auth/**` ≥ 80%
- [ ] `app/api/[...path]/route.test.ts` passes
- [ ] `src/modules/auth/index.test.ts` passes (compile-time check)
- [ ] `middleware.ts` 302 redirect test passes
- [ ] `pnpm run typecheck` → 0 errors
- [ ] `pnpm run build` → exits 0

---

## Sub-slice C-2 (PR 2) — Security tests + CI + branch protection

### C-2 task list

- [x] **T-027.1** Security test: timing equalization (`login.timing.test.ts`)

  - **Scope (RED → GREEN)**: 30 paired samples of `authorize()` with `known@example.com + wrong password` vs `unknown@example.com + any password`. Welch's t-test, p > 0.01. The test runs in CI; local dev can `SKIP_TIMING=true pnpm test` to skip. Real Argon2id runtime (in-process via `@node-rs/argon2`).
  - **Files**: `src/modules/auth/__tests__/security/login.timing.test.ts` (~80 lines)
  - **Lines estimate**: 80
  - **Depends on**: T-014 (auth.service with timing equalization)
  - **Tests**: Welch's t-test, 60 paired samples (30 + 30). Assert p > 0.01.
  - **Verify**:
    ```bash
    pnpm test src/modules/auth/__tests__/security/login.timing.test.ts
    # → p > 0.01
    SKIP_TIMING=true pnpm test
    # → test skipped, suite green
    ```

- [x] **T-027.2** Security test: OAuth state CSRF (`oauth.state-csrf.test.ts`)

  - **Scope (RED → GREEN)**: simulate Auth.js callback with tampered `state` parameter. Assert: no `User` row created, no `Account` row inserted, error response.
  - **Files**: `src/modules/auth/__tests__/security/oauth.state-csrf.test.ts` (~40 lines)
  - **Lines estimate**: 40
  - **Depends on**: T-018 (authjs wiring)
  - **Tests**: 3 cases (tampered state, missing state, valid state). Assert row counts.
  - **Verify**:
    ```bash
    pnpm test src/modules/auth/__tests__/security/oauth.state-csrf.test.ts
    # → 3 cases pass
    ```

- [x] **T-027.3** Security test: secrets in logs (`secrets.in-logs.test.ts`)

  - **Scope (RED → GREEN)**: capture log output during register, OAuth callback, and session-resolution paths. Inject `password`, `refresh_token`, `Authorization: Bearer <jwt>`, `id_token`, and CSRF token. Assert: none of those values appear in the captured log. End-to-end refinement of BR-AUTH-11.
  - **Files**: `src/modules/auth/__tests__/security/secrets.in-logs.test.ts` (~50 lines)
  - **Lines estimate**: 50
  - **Depends on**: T-007 (logger with denylist)
  - **Tests**: 4 scenarios (password, refresh_token, Bearer, id_token). Nested-object redaction.
  - **Verify**:
    ```bash
    pnpm test src/modules/auth/__tests__/security/secrets.in-logs.test.ts
    # → 4 scenarios pass
    ```

- [x] **T-027.4** Security test: origin-check (`origin-check.test.ts`)

  - **Scope (RED → GREEN)**: `POST /api/auth/register` with `Origin: https://attacker.com` → 403 `FORBIDDEN`. Same-origin POST → not 403.
  - **Files**: `src/modules/auth/__tests__/security/origin-check.test.ts` (~40 lines)
  - **Lines estimate**: 40
  - **Depends on**: T-021 (Hono origin-check middleware)
  - **Tests**: 2 cases (cross-origin + same-origin).
  - **Verify**:
    ```bash
    pnpm test src/modules/auth/__tests__/security/origin-check.test.ts
    # → 2 cases pass
    ```

- [x] **T-027.5** Security test: Argon2id parameters (`argon2.parameters.test.ts`)

  - **Scope (RED → GREEN)**: 30 calls to `hashArgon2id(password)`. Median runtime in [50, 100] ms on CI runner. Real Argon2id runtime. Fails the test if the runtime is outside the band.
  - **Files**: `src/modules/auth/__tests__/security/argon2.parameters.test.ts` (~40 lines)
  - **Lines estimate**: 40
  - **Depends on**: T-012 (argon2.hasher), T-027.1 (timing test sets the pattern)
  - **Tests**: 30 calls; assert median in [50, 100] ms.
  - **Verify**:
    ```bash
    pnpm test src/modules/auth/__tests__/security/argon2.parameters.test.ts
    # → median in [50, 100] ms
    ```

- [x] **T-027.6** Security test: cookie attributes (`cookie.attributes.test.ts`)

  - **Scope (RED → GREEN)**: capture `Set-Cookie: authjs.session-token=...` header. Assert: `HttpOnly`, `SameSite=Lax` always. `Secure` in production (`NODE_ENV=production`).
  - **Files**: `src/modules/auth/__tests__/security/cookie.attributes.test.ts` (~40 lines)
  - **Lines estimate**: 40
  - **Depends on**: T-018 (authjs)
  - **Tests**: 4 cases (HttpOnly, SameSite=Lax, Secure-in-prod, missing-Secure-in-dev).
  - **Verify**:
    ```bash
    pnpm test src/modules/auth/__tests__/security/cookie.attributes.test.ts
    # → 4 cases pass
    ```

- [x] **T-028** Author `.github/workflows/ci.yml`

  - **Scope**: 4 parallel jobs:
    1. **`lint`**: `pnpm install --frozen-lockfile`, `pnpm run lint`, `pnpm run typecheck`
    2. **`test`**: `pnpm install --frozen-lockfile`, `pnpm prisma migrate deploy` (with `services: postgres:` in the workflow), `pnpm test --coverage`, upload coverage artifact
    3. **`build`**: `pnpm install --frozen-lockfile`, `pnpm run build`
    4. **`security`**: `pnpm test src/modules/auth/__tests__/security/`
  - Triggers: `on: pull_request: { branches: [develop, main] }` and `on: push: { branches: [develop, main] }`. Concurrency cancels in-flight runs on the same ref.
  - **Files**: `.github/workflows/ci.yml` (~90 lines, YAML)
  - **Lines estimate**: 90
  - **Depends on**: T-027.1..T-027.6 (security tests must exist before CI can run them)
  - **Tests**: N/A (CI is the test)
  - **Verify**: pushing the branch triggers the workflow; the PR's docs link to the green check.

- [x] **T-029** Branch protection + `CODEOWNERS`
  - **Scope**: `.github/CODEOWNERS` at the repo root pointing to the maintainer (`@sebailla`). `docs/branch-protection.md` describes the rules: 1 review required, CI green, dismiss stale approvals on push, linear history, no force-pushes. The actual GitHub branch-protection settings are applied manually by the user (not in this change).
  - **Files**:
    - `.github/CODEOWNERS` (~5 lines)
    - `docs/branch-protection.md` (~25 lines)
  - **Lines estimate**: 30
  - **Depends on**: T-028 (the CI workflow must exist before branch protection can require it)
  - **Tests**: N/A
  - **Verify**:
    ```bash
    cat .github/CODEOWNERS
    # → lists @sebailla
    cat docs/branch-protection.md
    # → describes the 5 rules
    ```

### C-2 acceptance

- [ ] All 6 security tests implemented in `src/modules/auth/__tests__/security/`
- [ ] All 6 security tests pass in CI
- [ ] `SKIP_TIMING=true` skips test #1 only, other 5 still run
- [ ] `.github/workflows/ci.yml` exists with 4 parallel jobs
- [ ] CI workflow triggers on `pull_request` to `develop` or `main` and on `push` to `develop` or `main`
- [ ] `.github/CODEOWNERS` lists `@sebailla`
- [ ] `docs/branch-protection.md` describes the 5 rules
- [ ] `pnpm test src/modules/auth/__tests__/security/` → 6/6 verde locally
- [ ] `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, `pnpm run build` → all pass locally

---

## Sub-slice C-3 (PR 3) — Docs + handoff

### C-3 task list

- [x] **T-030** Five ADRs (Auth.js v5, Prisma 6, Argon2id, Hono catch-all, auto-link)

  - **Scope**: 5 ADRs in `docs/adr/`, MADR template (Context, Decision Drivers, Considered Options, Decision Outcome, Consequences, Confirmation). Each ADR has 3+ alternatives.
  - **Files**:
    - `docs/adr/0001-authjs-v5.md` (~30 lines)
    - `docs/adr/0002-prisma-6.md` (~30 lines)
    - `docs/adr/0003-argon2id-parameters.md` (~30 lines)
    - `docs/adr/0004-hono-catch-all.md` (~30 lines)
    - `docs/adr/0005-auto-link-security-model.md` (~30 lines)
  - **Lines estimate**: 150
  - **Depends on**: T-012 (argon2.hasher), T-018 (authjs), T-021 (Hono app)
  - **Tests**: N/A
  - **Verify**:
    ```bash
    ls docs/adr/
    # → 5 ADRs present
    grep -c "^## Decision" docs/adr/*.md
    # → 5 (one per ADR)
    ```

- [x] **T-031** Update `docs/architecture.md` (Auth section) + Spanish mirror

  - **Scope**: append an "Auth" section to `docs/architecture.md` with: high-level Mermaid diagram (the same one from the design's §1), data model summary (4 Prisma models, 3 added columns, unique constraint on `Account`), 8 Auth.js routes + 3 Hono routes, session strategy (database sessions, 30-day sliding, no JWT), auto-link security model, cross-module contracts (`auth()` helper, `User` is the identity anchor, `UserRegistered` / `UserSignedIn` events). Spanish mirror at `Documents-es/docs/architecture.md` updated in the same commit.
  - **Files**:
    - `docs/architecture.md` (+~150 lines)
    - `Documents-es/docs/architecture.md` (+~150 lines, mirror)
  - **Lines estimate**: 300 (150 + 150)
  - **Depends on**: T-030 (ADRs)
  - **Tests**: N/A
  - **Verify**:
    ```bash
    grep -c "## Auth" docs/architecture.md
    # → 1
    grep -c "## Auth" Documents-es/docs/architecture.md
    # → 1
    # Mermaid diagram renders
    ```

- [x] **T-032** Update `README.md` (local dev) + Spanish mirror

  - **Scope**: append a "Local dev" section to `README.md` with: `pnpm install`, Postgres setup (`docker compose up -d postgres` or Neon free-tier), `pnpm dev`, `pnpm test`, `pnpm test -- src/modules/auth/__tests__/security/`, `SKIP_TIMING=true` flag for noisy local dev. Spanish mirror at `Documents-es/README.md` updated in the same commit.
  - **Files**:
    - `README.md` (+~30 lines)
    - `Documents-es/README.md` (+~30 lines, mirror)
  - **Lines estimate**: 60 (30 + 30)
  - **Depends on**: T-031 (architecture.md Auth section)
  - **Tests**: N/A
  - **Verify**:
    ```bash
    grep -c "## Local dev" README.md
    # → 1
    grep -c "## Local dev" Documents-es/README.md
    # → 1
    ```

- [x] **T-033** Final commit, push, open PR, request reviewer (handoff)
  - **Scope**: 3 atomic commits for the C-3 PR:
    1. `docs(adr): add 5 ADRs for auth-foundation decisions` (T-030)
    2. `docs(architecture): add Auth section + Spanish mirror` (T-031, includes the FLAG-2 closure: re-sync `Documents-es/openspec/changes/auth-foundation/apply-progress.md` to mirror the English Slice B content)
    3. `docs(readme): add local-dev section + Spanish mirror` (T-032, includes the `apply-progress.md` write to flip T-025..T-033 to `[x]`)
    4. `docs(openspec): log C-3 apply-progress with TDD evidence` (the 9th commit, the C-3 apply-progress log)
  - **Files**:
    - `docs/adr/0001..0005-*.md` (5 new files, T-030)
    - `docs/architecture.md` (+~150 lines, T-031)
    - `Documents-es/docs/architecture.md` (+~150 lines, T-031 mirror)
    - `README.md` (+~30 lines, T-032)
    - `Documents-es/README.md` (+~30 lines, T-032 mirror)
    - `openspec/changes/auth-foundation/tasks.md` (flip T-025..T-033 to `[x]`)
    - `openspec/changes/auth-foundation/apply-progress.md` (add C-3 section)
    - `openspec/changes/auth-foundation/HANDOFF.md` (final handoff)
    - `Documents-es/openspec/changes/auth-foundation/apply-progress.md` (FLAG-2 closure: re-sync Slice B content)
  - **Lines estimate**: 600 (cumulative for the 3 C-3 PR commits + the apply-progress commit)
  - **Depends on**: T-030, T-031, T-032
  - **Tests**: N/A (handoff)
  - **Verify**:
    ```bash
    git log origin/develop..HEAD
    # → 9 commits for Slice C (3 for C-1, 3 for C-2, 3 for C-3, plus apply-progress)
    # → 1 commit for the FLAG-2 closure
    grep "^- \[x\] \*\*T-0(2[5-9]|3[0-3])\*\*" openspec/changes/auth-foundation/tasks.md | wc -l
    # → 9
    ```

### C-3 acceptance

- [ ] 5 ADRs in `docs/adr/`, each with `### Decision` + `### Considered Options` (3+ alternatives each)
- [ ] `docs/architecture.md` has an "Auth" section with the Mermaid diagram
- [ ] `Documents-es/docs/architecture.md` mirrors the Auth section
- [ ] `README.md` has a "Local dev" section with the SKIP_TIMING flag documented
- [ ] `Documents-es/README.md` mirrors the local-dev section
- [ ] `Documents-es/openspec/changes/auth-foundation/apply-progress.md` is updated to include Slice B content (FLAG-2 closure)
- [ ] All 9 Slice C tasks (T-025..T-033) + T-C1.0 are flipped to `[x]` in `openspec/changes/auth-foundation/tasks.md`
- [ ] `openspec/changes/auth-foundation-slice-c/apply-progress.md` is updated with TDD evidence for C-1, C-2, C-3
- [ ] `openspec/changes/auth-foundation-slice-c/HANDOFF.md` is written

---

## Review workload forecast (mandatory)

| Sub-slice                                                     | Tasks                                             | Estimated lines | Overage vs 400-line budget |
| ------------------------------------------------------------- | ------------------------------------------------- | --------------- | -------------------------- |
| C-1 (module-resolution + catch-all + middleware + public API) | T-C1.0, T-025, T-026                              | ~200            | **0.5× (under budget!)**   |
| C-2 (security tests + CI + branch protection)                 | T-027.1..6, T-028, T-029                          | ~400            | 1.0× (right at budget)     |
| C-3 (ADRs + architecture.md + README + handoff)               | T-030, T-031, T-032, T-033                        | ~600            | 1.5×                       |
| **Total**                                                     | 14 tasks (T-C1.0 + 9 Slice C + 4 handoff commits) | ~1,200          | —                          |

C-1 is **under** the 400-line budget. C-2 is right at the budget. C-3 is over but the user already accepted overage for the parent change.

The 3 chained PRs are sequenced C-1 → C-2 → C-3.

---

## Risks specific to apply

- **Module-resolution stub insufficiency**: if `next-auth` calls real `next/server` runtime at test time, the stub fails. Fallback: bump `next-auth@5.0.0-beta.32+` or patch Vite differently. The C-1 apply worker will report if the stub is insufficient.
- **CI Postgres service** (`services: postgres:` in the workflow): GitHub-hosted runners may flake on certain images. Fallback: Neon free-tier branch in a separate `DATABASE_URL` env var.
- **Timing test reliability**: noisy on Mac. The `SKIP_TIMING=true` env var handles local dev; CI runs the full suite.
- **Bilingual drift closure** (FLAG-2): the C-3 worker must update the Spanish `apply-progress.md` atomically with the C-3 handoff. If forgotten, the verify phase will re-flag.
- **GGA pre-commit gate**: openrouter not configured in `~/.pi/agent/auth.json` (same as Slice A + B). On-disk verification is the gate per AGENTS.md §2.6. CI is the authoritative gate.
- **Husky pre-commit `check-lockfile.sh`** (PR #9): if the lockfile isn't committed alongside `package.json`, the commit fails. The C-2 worker must regenerate and commit the lockfile when adding the CI workflow (which doesn't touch `package.json` directly, but the workflow file is YAML so the check passes).
- **The 61 pnpm audit vulns** (issue #7) remain open. This change does not address them.

---

## Out of scope (this change)

- The 61 pnpm audit vulns (issue #7, separate tracking).
- Email verification flow (deferred to a future change).
- Password reset flow (deferred to a future change).
- 2FA (deferred to a future change).
- New auth providers beyond Google and Credentials.
- The `accounts-ledger`, `transactions`, `fx-cache`, `networth-snapshot`, `reports-mvp`, `pwa-shell`, `fly-deploy` SDD changes.

---

## Definition of done

`auth-foundation-slice-c` is closed when ALL of the following are true:

- [ ] All 14 tasks (T-C1.0 + T-025..T-033) are flipped to `[x]` in `openspec/changes/auth-foundation-slice-c/tasks.md`
- [ ] All 14 tasks are flipped to `[x]` in `openspec/changes/auth-foundation/tasks.md` (the parent change's tasks file)
- [ ] `openspec/changes/auth-foundation-slice-c/apply-progress.md` has TDD evidence for all 14 tasks (RED, GREEN, TRIANGULATE, REFACTOR columns)
- [ ] `pnpm test` → **137/137** verde (was 134/134 with 3 excluded)
- [ ] `pnpm test --coverage` → coverage on `src/modules/auth/**` ≥ 80%
- [ ] `pnpm run typecheck` → 0 errors
- [ ] `pnpm run build` → exits 0
- [ ] `pnpm test src/modules/auth/__tests__/security/` → 6/6 verde (or `SKIP_TIMING=true` for the timing test locally)
- [ ] `.github/workflows/ci.yml` runs 4 jobs and is green on the merge commit
- [ ] `.github/CODEOWNERS` lists `@sebailla`
- [ ] `docs/branch-protection.md` describes the 5 rules
- [ ] 5 ADRs in `docs/adr/` with `### Decision` + `### Considered Options`
- [ ] `docs/architecture.md` has an Auth section + Spanish mirror
- [ ] `README.md` has a local-dev section + Spanish mirror
- [ ] `Documents-es/openspec/changes/auth-foundation/apply-progress.md` is re-synced (FLAG-2 closure)
- [ ] `sdd-verify` passes on the merge commit
- [ ] `sdd-sync` is run to promote the 16 deltas to canonical `openspec/specs/auth/spec.md`
- [ ] `auth-foundation-slice-c` is closed via `sdd-archive` (moved to `openspec/changes/archive/`)
- [ ] The parent `auth-foundation` change is also archived (now that all 33 tasks are done)
