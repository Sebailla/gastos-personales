# Proposal — `auth-foundation-slice-c`

**Status**: closed-via-archive · **Author**: Sebastián Illa
**Created**: 2026-06-13 · **Target slice**: Slice C of `auth-foundation` · **Capability**: auth
**Upstream**: global SDD preflight (interactive, both, auto-forecast, 400 lines)
**Parent change**: `auth-foundation` (Slice A + B already merged to develop as PRs #5, #17) · **Verify report**: `file-only/verify-auth-foundation-slice-ab.md` · **CRITICAL flag**: issue #18 (module-resolution bug)

## Why

The parent change `auth-foundation` is implementation-incomplete. Slice A (T-001..T-018) and Slice B (T-019..T-024) merged to develop via PRs #5 and #17. Slice C (T-025..T-033) — 9 tasks — is pending.

The verify report on the parent change (`file-only/verify-auth-foundation-slice-ab.md`, status `PASS_WITH_FLAGS`) flagged:

- **FLAG-1 (CRITICAL)**: module-resolution bug, tracked as issue #18. `next-auth@5.0.0-beta.25` imports `'next/server'` (no `.js` extension) in its ESM build; Vite's strict ESM resolver rejects the bare import. The bump to `next-auth@5.0.0-beta.31` in PR #16 did **not** close the bug. Three test files remain excluded in `vitest.config.ts`:

  - `src/modules/auth/index.test.ts`
  - `src/modules/auth/infrastructure/external/authjs.test.ts`
  - `app/api/auth/[...nextauth]/route.test.ts`

  Coverage on `src/modules/auth/**` is below the 80% target because of those exclusions. Slice C is the natural home for the resolution.

- **FLAG-2 (WARNING)**: bilingual drift in `apply-progress.md`. The English `openspec/changes/auth-foundation/apply-progress.md` covers Slice A + Slice B; the Spanish mirror at `Documents-es/openspec/changes/auth-foundation/apply-progress.md` is stale at Slice A only.

This change implements Slice C (T-025..T-033) and closes both flags.

## What

Three sub-slices chained, all within this single SDD change. Each sub-slice is one PR.

### Sub-slice C-1 — Module-resolution fix + Hono catch-all + middleware + public API (3 tasks, ~80 LOC)

- **Module-resolution fix (FLAG-1 closure)**: patch `vitest.config.ts` with a `resolve.alias` that maps `'next/server'` to a tiny test stub at `test/stubs/next-server.ts`. The stub re-exports the same surface that `next-auth` touches (`NextRequest`, `NextResponse`) so the import resolves. Re-include the 3 excluded test files. Target: **137/137 tests green** (was 134/134 with 3 excluded).
- **T-025**: Hono catch-all at `app/api/[...path]/route.ts`. Delegates `GET`/`POST`/`PATCH`/`DELETE` to `honoApp.fetch(request)`. The Hono catch-all does **not** match `/api/auth/*` (Next.js's file-based routing resolves `app/api/auth/[...nextauth]/route.ts` first). Two integration tests confirm `/api/auth/signin` routes to Auth.js and `/api/me` routes to Hono.
- **T-026**: Public API export from `src/modules/auth/index.ts` + Next.js middleware at `middleware.ts` for `/api/me` protection. The middleware redirects unauthenticated requests to `/auth/signin` (faster-fail than the Hono 401). Two tests: named exports exist; middleware 302 vs 200.

### Sub-slice C-2 — Security tests + CI workflow + branch protection (3 tasks, ~700 LOC)

- **T-027**: 6 security tests in `src/modules/auth/__tests__/security/`:
  1. `login.timing.test.ts` — Welch's t-test, p > 0.01 over 30 samples, with a `--skip-timing` flag for noisy local dev.
  2. `oauth.state-csrf.test.ts` — missing/tampered `state` rejects, no `User`/`Account` rows inserted.
  3. `secrets.in-logs.test.ts` — `password`, `refresh_token`, `Authorization: Bearer …`, `id_token`, CSRF token never appear in captured log output across register, OAuth callback, and session-resolution paths (BR-AUTH-11).
  4. `origin-check.test.ts` — `POST /api/auth/register` with missing/mismatched `Origin` returns 403 `FORBIDDEN`; same-origin POST allowed.
  5. `argon2.parameters.test.ts` — `hashArgon2id` with chosen parameters runs in 50–100 ms on the CI runner; fails outside the band. Re-runs `scripts/bench-argon2.ts` in CI.
  6. `cookie.attributes.test.ts` — `authjs.session-token` cookie has `HttpOnly` and `SameSite=Lax` always; `Secure` in production.
- **T-028**: `.github/workflows/ci.yml` with 4 parallel jobs: `lint` (lint + typecheck), `test` (vitest --coverage, uploads artifact, posts PR comment), `build` (Next.js production build), `security` (the slowest; runs separately so timing flakes don't block the other jobs). Concurrency cancels in-flight runs on the same ref. Runs on `pull_request` to `develop`/`main` and `push` to `develop`/`main`.
- **T-029**: `.github/CODEOWNERS` + `docs/branch-protection.md`. Branch protection rules (1 review, CI green on all 4 jobs, dismiss stale approvals on push, linear history, no force-push) are documented; the actual GitHub-side settings are applied by the user (require repo-admin permissions).

### Sub-slice C-3 — Docs + handoff (4 tasks, ~400 LOC)

- **T-030**: 5 ADRs in `docs/adr/`, MADR template (Context, Decision, Consequences, Alternatives considered):
  - `0001-authjs-v5.md` — why Auth.js v5 over Lucia, Clerk, Supabase Auth, hand-rolled.
  - `0002-prisma-6.md` — why Prisma 6 over Kysely, raw SQL.
  - `0003-argon2id-parameters.md` — `memoryCost=19456, timeCost=2, parallelism=1`, the benchmark, the fallback.
  - `0004-hono-catch-all.md` — why Hono over pure Next.js route handlers, tRPC, Fastify; the `OpenAPIHono` + `hc<typeof honoApp>` shape.
  - `0005-auto-link-security-model.md` — industry-standard auto-link on email match; BR-AUTH-5 / BR-AUTH-10; the deferral of a hardening pass.
- **T-031**: `docs/architecture.md` gains an "Auth" section (Mermaid diagram, data model summary, routes, session strategy, auto-link security model, cross-module contracts). Spanish mirror `Documents-es/docs/architecture.md` updated in the same commit.
- **T-032**: `README.md` gains a local-dev section. Spanish mirror updated in the same commit.
- **T-033**: Final handoff commit, push, open PR, request reviewer.

### Endpoints (Hono catch-all, after Sub-slice C-1)

| Endpoint                                                                | Behavior                                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /api/health`                                                       | 200 `{ data: { status: 'ok', version, uptime } }`                                           |
| `GET /api/me`                                                           | 200 `{ data: PublicUser }` when session present; 401 `UNAUTHORIZED` otherwise               |
| `POST /api/auth/register`                                               | 201 on success; 400 `VALIDATION_ERROR` / `WEAK_PASSWORD`; 409 `EMAIL_TAKEN`; origin-checked |
| `GET /api/auth/*` (signin, signout, callback, session, providers, csrf) | All Auth.js v5 routes, mounted at `app/api/auth/[...nextauth]/route.ts`                     |
| `GET\|POST /app/*` (server-component pages)                             | Middleware redirects unauthenticated requests to `/auth/signin`                             |

### Data model

No new Prisma models or columns. Sub-slice C-1 only **integrates** what Slice A built (4 models, 3 added columns, the `@@unique([provider, providerAccountId])` constraint). No `prisma migrate dev` is needed; `pnpm prisma generate` runs once to refresh the client.

### Behavior

#### Module-resolution fix (FLAG-1 closure, Sub-slice C-1)

The root cause is `next-auth@5.x` ESM build importing `'next/server'` (bare, no extension) from `node_modules/next-auth/lib/env.js`. Vite's strict ESM resolver rejects the bare path; the actual file is `next/server.js`. The patch lives in `vitest.config.ts#resolve.alias`:

```ts
resolve: {
  alias: {
    '^next/server$': path.resolve(__dirname, 'test/stubs/next-server.ts'),
    '@': path.resolve(__dirname, './src'),
  },
}
```

`test/stubs/next-server.ts` is a 30-line stub that re-exports the surface `next-auth` touches (`NextRequest`, `NextResponse`). It is a **test-only** stub; production code never imports it (Next.js's bundler resolves `'next/server'` correctly at build time). This sidesteps the upstream `next-auth` bug without changing the production runtime.

If the stub does not satisfy the import surface (the surface is wider than expected), the fallback is a 2-line `next/server.js → next/server.ts` shim that re-exports the entire `next` package's `server` subpath. The stub path is preferred because it makes the test contract explicit.

After the patch, the 3 `exclude` entries are removed from `vitest.config.ts`. The 3 tests run and are expected to pass (the test logic was never broken; the failure was at the import boundary).

#### Security test scope (T-027, Sub-slice C-2)

The 6 tests are integration tests where possible (real Postgres testcontainers in CI; fake-Prisma in local dev) and unit tests where integration is impractical (the timing test needs real Argon2id hashes but a fake user repository). The tests are the input to the adversarial review at `sdd-verify` of Sub-slice C-2.

#### CI gating (T-028, Sub-slice C-2)

The CI workflow is the authoritative gate from Sub-slice C-2 onward. Until now, `pnpm test` and `pnpm run typecheck` ran locally; CI is the first time the project validates that the lockfile is reproducible on a clean machine, the tests are deterministic on a different OS, and the build artifact matches expectations.

#### ADRs (T-030, Sub-slice C-3)

Five ADRs close the 5 decision gaps the design left open. Each ADR is 40–80 lines, MADR template, with concrete `### Alternatives considered` sub-sections (not just a list). They are review-facing documents: a new contributor can read `0001` and understand why we did not pick Lucia or Clerk without reading the design.

## Out of scope (this change)

- **New auth providers** beyond Google and Credentials (deferred to a future `auth-providers` change).
- **Email verification flow** (deferred; not in the design).
- **Password reset flow** (deferred; not in the design).
- **Two-factor authentication (2FA)** (deferred; not in the design).
- **The 61 `pnpm audit` vulns** from issue #7 (separate tracking; not auth-specific).
- **Real Postgres in CI** (Slice A deviation #2 noted; restoring testcontainers for `user.repository.test.ts` and the `account`/`session` repos is a Slice D-or-later concern).
- **The GGA `openrouter` provider configuration** that would make `gga run` work locally (FLAG-3 from the parent verify; a setup chore for the user, not code).

## Acceptance criteria (the reviewer will see)

1. `vitest.config.ts#test.exclude` does **not** list the 3 previously-excluded files.
2. `pnpm test` → **137/137 tests green** across 33 test files.
3. `pnpm run typecheck` → **0 errors**.
4. `pnpm test --coverage` → coverage on `src/modules/auth/**` **≥ 80%** (lines, branches, functions, statements).
5. All 6 security tests in `src/modules/auth/__tests__/security/` exist and pass (timing test gated by `--skip-timing` flag locally; CI runs the full suite).
6. `.github/workflows/ci.yml` exists and runs 4 jobs (`lint`, `test`, `build`, `security`); all 4 are green on the merge commit.
7. `.github/CODEOWNERS` lists the maintainer; `docs/branch-protection.md` documents the rules.
8. `docs/adr/0001..0005-*.md` exist; `grep -c "^## Decision" docs/adr/*.md` returns **5**.
9. `docs/architecture.md` has an "Auth" section; `Documents-es/docs/architecture.md` mirrors it in the same commit.
10. `README.md` has a local-dev section; `Documents-es/README.md` mirrors it in the same commit.
11. `Documents-es/openspec/changes/auth-foundation/apply-progress.md` is updated to mirror the English Slice B content (FLAG-2 closure).
12. All 9 Slice C tasks (T-025..T-033) flipped to `[x]` in `openspec/changes/auth-foundation/tasks.md`.
13. `auth-foundation-slice-c` is closed via `sdd-archive` after the final PR merges and `sdd-verify` passes.

## Risks & dependencies

- **Module-resolution fix may not work** (Option 1 in issue #18). If the Vite `resolve.alias` does not close the bug, the fallback is Option 2 (mock `next/server` in test config) or Option 3 (bump `next-auth` to a newer beta that fixes the import). The sub-slice C-1 worker is expected to verify on the first run and fall back if necessary. Document which path was taken in the handoff.
- **CI runs for the first time in this project** (no prior CI to validate against). The worker may need 1–2 iterations to get the matrix right (especially `pnpm install --frozen-lockfile` with the new `pnpm@11.6.0` pinning and the `~/pnpm-workspace.yaml` workaround).
- **Security tests may be flaky on local dev**. The `login.timing.test.ts` requires a quiet machine; the `--skip-timing` flag is the documented escape hatch. CI runners are quiet enough that the test runs without the flag.
- **Bilingual invariant drift** (FLAG-2 from the parent verify): the parent change's `apply-progress.md` Spanish mirror is out of sync. This change re-syncs it as part of Sub-slice C-3 (the handoff commit).
- **GGA hook continues to time out locally** (openrouter not configured). Per AGENTS.md §2.6, on-disk verification is the gate; CI is the authoritative gate. Documented in every handoff since Slice A.

## Review workload forecast (mandatory)

3 PRs chained, each over the 400-line budget:

| Sub-slice                               | Lines (est.) | Overage vs 400 |
| --------------------------------------- | ------------ | -------------- |
| C-1 (module-resolution + T-025 + T-026) | ~200         | 0.5×           |
| C-2 (T-027 + T-028 + T-029)             | ~700         | 1.75×          |
| C-3 (T-030 + T-031 + T-032 + T-033)     | ~400         | 1.0×           |
| **Total**                               | **~1,300**   | —              |

The user explicitly accepted the overage at Slice B planning. The same applies here. The C-2 overage (1.75×) is the largest because of the 6 security tests; the ADR section in C-3 is the longest single deliverable.

## Change ordering downstream

1. `auth-foundation-slice-c` (this change) — closes Slice C of `auth-foundation`.
2. After this change merges, `auth-foundation` is implementation-complete (T-001..T-033 done). The follow-up steps are:
   - Re-verify `auth-foundation` end-to-end (T-001..T-033, 137/137 tests, all 6 security tests, all 5 ADRs, CI green).
   - `sdd-archive` for `auth-foundation` (the change itself, not this slice-c change).
   - `sdd-archive` for `auth-foundation-slice-c` (this change).
3. Unblocked SDD changes after `auth-foundation` closes:
   - `accounts-ledger` — depends on the auth capability (uses `auth()` from `src/modules/auth/index.ts` per T-026).
   - `transactions`, `fx-cache`, `networth-snapshot`, `reports-mvp`, `pwa-shell`, `fly-deploy` — same dependency.

## Next step

After the user approves this proposal, the next phase is `sdd-spec`:

- Produce `openspec/changes/auth-foundation-slice-c/spec.md` with delta-spec entries for each of the 9 tasks + the module-resolution fix, mirrored in `Documents-es/openspec/changes/auth-foundation-slice-c/spec.md`.
- Then `sdd-design` (`design.md` with the Vite alias pattern, the security test architecture, the CI workflow shape).
- Then `sdd-tasks` (a tasks file that breaks each of T-025..T-033 into sub-tasks with TDD evidence columns).
- Then `sdd-apply` (3 chained PRs: C-1, C-2, C-3).
- Then `sdd-verify` (re-run verify on T-001..T-033, expect `PASS` with no flags).
- Then `sdd-sync` (close the 8 decision gaps that were already closed in the parent design, no canonical promotions needed since the canonical `openspec/specs/auth/spec.md` already covers them).
- Then `sdd-archive` (this change + the parent change).
