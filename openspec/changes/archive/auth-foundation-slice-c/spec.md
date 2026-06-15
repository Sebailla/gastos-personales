# Spec — `auth-foundation-slice-c` (delta)

**Status**: draft · **Author**: Sebastián Illa
**Created**: 2026-06-13 · **Capability**: `auth`
**Parent change**: `auth-foundation` (Slice A + B merged as PRs #5, #17)
**Upstream canonical spec**: `openspec/specs/auth/spec.md` (v2, draft 2026-06-10)
**Stack**: v2 — Next.js 16 + Auth.js v5 + Prisma 6 + PostgreSQL + Hono catch-all + Zod + Vitest
**Upstream**: global SDD preflight (interactive, both, auto-forecast, 400 lines)

> This is a **delta spec** for the `auth-foundation-slice-c` change. It does NOT re-declare the v2 canonical spec; it declares the **additional** requirements that Slice C introduces. Each delta references the BR-AUTH-\* rules of the canonical spec where they apply.

---

## 1. References to canonical spec (unchanged contracts)

The following canonical contracts (from `openspec/specs/auth/spec.md`) continue to apply to Slice C and require no delta:

- **BR-AUTH-1** (email normalization) — applies to T-026 public API export (the public `signIn` action continues to normalize on write).
- **BR-AUTH-2** (password length ≥ 10) — applies to T-027.3 secrets-in-logs test (a 10+ char password is the test fixture).
- **BR-AUTH-5** (auto-link on email match) — applies to T-027.2 OAuth state CSRF test (asserts no `User`/`Account` rows are created on tampered state).
- **BR-AUTH-7** (session expiry 30d sliding 24h) — applies to T-027.6 cookie attributes test (the cookie carries the sliding window).
- **BR-AUTH-10** (`@@unique([provider, providerAccountId])`) — applies to T-026 public API surface (the `Account` model exposed via the module is read-only by other modules; the constraint is enforced at the Prisma layer).
- **BR-AUTH-11** (secrets/tokens in logs) — refined (not redefined) by DELTA-C2.6. The denylist of 11 keys from Slice A is the basis; the new test asserts the end-to-end behavior.

The **8 decision gaps** from the parent change's proposal remain closed and are not re-debated here. They are referenced by their short names (e.g. "decision gap #5: Hono typed client") in DELTA-C2.2 and DELTA-C3.3 ADR-0004.

---

## 2. Deltas

### DELTA-C1.1 — Module-resolution fix (issue #18, FLAG-1 closure)

**Status**: ADDED
**Capability**: auth
**Tasks**: T-025, T-026 (precondition for re-inclusion)
**Upstream issue**: #18 · **Verify report**: `file-only/verify-auth-foundation-slice-ab.md`

**Requirement**:

WHEN the test suite runs against the develop branch (post-merge of all chore PRs #8, #9, #12, #13, #16 and auth-foundation PRs #5, #17)
AND `vitest.config.ts#test.exclude` is configured per the design
THEN the 3 previously-excluded test files (`src/modules/auth/index.test.ts`, `src/modules/auth/infrastructure/external/authjs.test.ts`, `app/api/auth/[...nextauth]/route.test.ts`) MUST run without the import error documented in issue #18
AND `pnpm test` MUST report **at least 137/137 tests** passing (was 134/134 with 3 files excluded)
AND `pnpm test --coverage` MUST report coverage on `src/modules/auth/**` of **≥ 80%** for lines, branches, functions, and statements (was below 80% due to the excluded files)

The fix MUST live in test configuration (`vitest.config.ts` and any test stubs under `test/stubs/`); production code MUST NOT change to accommodate it.

**Scenario 1: test exclusion entries are removed**

- Given: `vitest.config.ts` currently excludes 3 test files in `test.exclude`
- When: Slice C-1 PR merges
- Then: the 3 entries are removed
- And: the comment block explaining the dual-condition bug is also removed
- And: the file contains no `test.exclude` entry referencing those 3 paths

**Scenario 2: previously-excluded test files execute**

- Given: a fresh `pnpm install` against the develop branch
- When: `pnpm test` (or `npx vitest run`) runs
- Then: the 3 previously-excluded files execute successfully
- And: `authjs.test.ts` reports its 6 cases
- And: `index.test.ts` reports its public-API smoke test
- And: `route.test.ts` reports its Auth.js handler test
- And: no test file is reported as failed at the import boundary

**Scenario 3: coverage threshold met**

- Given: the test suite passes 137/137
- When: `pnpm test --coverage` runs
- Then: the v8 coverage report shows `src/modules/auth/**` at ≥ 80% on all four metrics (lines, branches, functions, statements)
- And: the CI gating check (DELTA-C3.1) passes

**Scenario 4: production runtime is unaffected**

- Given: Slice C-1 is merged
- When: `pnpm run build` runs (Next.js production build)
- Then: the build succeeds
- And: no test stub is bundled into the production output
- And: the `next/server` import in `node_modules/next-auth/lib/env.js` resolves through Next.js's own resolver at build time, not through the Vite alias

---

### DELTA-C2.1 — Hono catch-all route mount (T-025)

**Status**: ADDED
**Capability**: auth
**Tasks**: T-025

**Requirement**:

WHEN a client makes an HTTP request to `/api/<anything>` excluding `/api/auth/*`
THEN the request MUST be delegated to `honoApp.fetch(request)`
AND the Hono app's response MUST be returned with the same HTTP status code, headers, and body as if `honoApp` were the server.

The catch-all MUST NOT route `/api/auth/*` paths. Next.js's file-based routing resolves `app/api/auth/[...nextauth]/route.ts` first; the catch-all only sees paths that have no more specific match.

**Scenario 1: Hono route returns its native response**

- Given: the dev server is running
- When: a request to `GET /api/me` arrives with no session cookie
- Then: the response status is **401**
- And: the response body is `{"error":{"code":"UNAUTHORIZED","message":"…"}}`
- And: the response `Content-Type` is `application/json`

**Scenario 2: Hono health route returns 200**

- Given: the dev server is running
- When: a request to `GET /api/health` arrives
- Then: the response status is **200**
- And: the response body matches `{ data: { status: "ok", version, uptime } }`
- And: `version` equals the value of `package.json#version`
- And: `uptime` is a non-negative number

**Scenario 3: Auth.js routes take precedence over the catch-all**

- Given: the dev server is running
- When: a request to `GET /api/auth/signin` arrives
- Then: the request is NOT routed to the Hono catch-all
- And: Auth.js's HTML signin response is returned (status 200, `Content-Type: text/html`)
- And: the response body contains the Auth.js signin form

**Scenario 4: catch-all supports the 4 HTTP verbs**

- Given: the Hono app has routes registered for `GET`, `POST`, `PATCH`, `DELETE`
- When: requests to `/api/...` use any of those verbs
- Then: the corresponding method on the catch-all `route.ts` delegates to `honoApp.fetch(request)`
- And: the response is identical to what `honoApp.fetch` returns when invoked directly

---

### DELTA-C2.2 — Public API export (T-026, part 1)

**Status**: ADDED
**Capability**: auth
**Tasks**: T-026

**Requirement**:

The `auth` module's public surface is the only thing other modules (future: `accounts-ledger`, `transactions`, `fx-cache`, etc.) may import. The file `src/modules/auth/index.ts` MUST export the following named bindings:

- `auth` — the `auth()` server-side helper from Auth.js v5 (returns the session or `null`)
- `signIn` — the server action that triggers a Credentials or Google sign-in
- `signOut` — the server action that terminates the current session
- `handlers` — the `GET` and `POST` handlers for `/api/auth/*` (mounted at `app/api/auth/[...nextauth]/route.ts` in DELTA-C2.2's sibling)
- `honoApp` — the `OpenAPIHono` instance for the Hono catch-all (per decision gap #5; typed as `OpenAPIHono<{ Variables: { user: PublicUser | null } }>`)
- `UserRegistered` — the event name string for the user-registered event
- `UserSignedIn` — the event name string for the user-signed-in event

Non-exported paths (domain services' internals, repositories' internals, external adapters' internals) MUST NOT be importable from outside `src/modules/auth/`. A compile-time check (TypeScript with `verbatimModuleSyntax`) validates this.

**Scenario 1: named exports exist and have the expected types**

- Given: the auth module is built
- When: `import { auth, signIn, signOut, handlers, honoApp, UserRegistered, UserSignedIn } from "@/modules/auth"` is attempted from outside the auth module
- Then: the imports succeed
- And: `typeof auth` matches `() => Promise<Session | null>` (Auth.js v5 contract)
- And: `typeof handlers` matches `{ GET: Handler, POST: Handler }`
- And: `honoApp` has type `OpenAPIHono<{ Variables: { user: PublicUser | null } }>`
- And: `UserRegistered` and `UserSignedIn` are string literals

**Scenario 2: import from a non-exported internal path is a TypeScript error**

- Given: a hypothetical consumer tries `import { AuthService } from "@/modules/auth/domain/services/auth.service"`
- When: TypeScript compiles
- Then: the compiler reports `error TS2305: Module '"@/modules/auth"' has no exported member 'AuthService'`
- And: the build fails

**Scenario 3: `honoApp` is consumable by the UI (typed client contract)**

- Given: a future UI module imports `honoApp` and derives a typed client
- When: the consumer does `import { hc } from "hono/client"; const client = hc<typeof honoApp>("/");`
- Then: `client.api.me.$get()` is typed and returns `PublicUser` on success or `ErrorResponse` on failure
- And: no `any` types appear in the inferred chain

---

### DELTA-C2.3 — Next.js middleware for `/api/me` protection (T-026, part 2)

**Status**: ADDED
**Capability**: auth
**Tasks**: T-026

**Requirement**:

A Next.js middleware at the project root (`middleware.ts`) MUST protect future server-component routes under `/app/*` (e.g. `/dashboard`) by redirecting unauthenticated requests to `/auth/signin`. The middleware is the **faster-fail** path for App Router pages; the Hono `/api/me` route already returns 401 when the session is missing, so the middleware only applies to pages, not to the Hono API routes.

The middleware MUST be a no-op for:

- `/api/auth/*` (Auth.js's own routes; the framework handles auth)
- `/api/*` (Hono routes; Hono's own origin-check and `auth()` resolution cover these)
- `/_next/*` (Next.js internals)
- Static assets

**Scenario 1: unauthenticated request to a protected page redirects**

- Given: no `authjs.session-token` cookie is present
- When: a request to `GET /dashboard` arrives
- Then: the response is a **302** redirect
- And: the `Location` header is `/auth/signin` (or `/auth/signin?callbackUrl=%2Fdashboard` when the design supports callback URLs)
- And: the response status is 302 (not 200, not 401)

**Scenario 2: authenticated request to a protected page is allowed**

- Given: a valid `authjs.session-token` cookie is present
- When: a request to `GET /dashboard` arrives
- Then: the response status is **200** (the page renders)
- And: the middleware does NOT redirect

**Scenario 3: middleware is a no-op for API and static routes**

- Given: any of the following paths
- When: a request arrives
- Then: the middleware passes through without modification:
  - `/api/auth/signin`
  - `/api/me`
  - `/_next/static/chunks/main.js`
  - `/favicon.ico`

**Scenario 4: middleware performance**

- Given: a quiet CI runner
- When: the middleware runs on 100 sequential requests
- Then: the median middleware latency is < 5 ms per request (the middleware is allowed to call `auth()` only when the path is in the protected list; a session-cookie read is fast)

---

### DELTA-C2.4 — Security test: timing equalization (T-027.1)

**Status**: ADDED
**Capability**: auth
**Tasks**: T-027

**Requirement**:

WHEN the Credentials `authorize()` is invoked with a known email and a wrong password
OR with an unknown email and any password
THEN the two response-time distributions MUST have no statistically significant difference (Welch's t-test, `p > 0.01`, over 30 paired samples).

This refines the timing equalization documented in **BR-AUTH-4** by adding an **automated test** that catches regressions of the timing-equalization logic in `authjs.ts:91-95` (dummy-hash call when `passwordHash` is `null`).

**Scenario 1: equalized timing on CI**

- Given: a real Argon2id hash for `known@example.com` and a fixed dummy hash
- When: 30 login attempts with `known@example.com` + wrong password
- And: 30 login attempts with `unknown@example.com` + any password
- Then: Welch's t-test on the two sample sets returns `p > 0.01`
- And: the test passes

**Scenario 2: local-dev flag for noisy machines**

- Given: a developer machine where the timing test would be flaky
- When: `pnpm test -- --skip-timing` runs
- Then: the timing test is skipped (not failed)
- And: a console message indicates the skip and recommends running on CI

---

### DELTA-C2.5 — Security test: OAuth state CSRF (T-027.2)

**Status**: ADDED
**Capability**: auth
**Tasks**: T-027

**Requirement**:

WHEN a callback request arrives at `/api/auth/callback/<provider>` with a missing or tampered `state` parameter (where the `state` is the CSRF protection token Auth.js generates when initiating the OAuth flow)
THEN the callback MUST be rejected by Auth.js
AND no `User` row is created in the `User` table
AND no `Account` row is inserted in the `Account` table.

**Scenario 1: tampered state is rejected**

- Given: an OAuth flow was initiated (a `state` token was set)
- When: a callback arrives with `state=garbage` (not the value Auth.js generated)
- Then: the response is an Auth.js error page (status 200, HTML body with the error rendered)
- And: the user count in the `User` table is unchanged
- And: the account count in the `Account` table is unchanged

**Scenario 2: missing state is rejected**

- Given: an OAuth flow was initiated
- When: a callback arrives with no `state` parameter
- Then: the same outcome as Scenario 1 (rejected, no rows inserted)

**Scenario 3: valid state proceeds**

- Given: an OAuth flow was initiated and a `state` token was generated
- When: a callback arrives with the correct `state` and a valid `code`
- Then: Auth.js processes the callback (the test is for the rejection path; the success path is owned by Auth.js and tested in Slice B's `authjs.test.ts`)

---

### DELTA-C2.6 — Security test: secrets in logs (T-027.3)

**Status**: ADDED
**Capability**: auth
**Tasks**: T-027

**Requirement**:

WHEN a request body includes the user-credential field, a refresh-token field, an `Authorization` header of the form `Bearer <jwt>`, an `id_token` field, or a CSRF token
THEN the captured log output across the register, OAuth callback, and session-resolution paths MUST NOT contain any of those values, in any form (raw, base64-encoded, JSON-quoted, or otherwise obfuscated).

This refines **BR-AUTH-11** (which only requires the `denylist` to be applied in the logger configuration) by asserting the **end-to-end** behavior across the request lifecycle.

**Scenario 1: registration with a long user credential leaves no trace in logs**

- Given: a request body with a 24-character placeholder credential string under the user-credential field name (e.g. a 24-char alphanumeric string drawn from a known-fixed test-only set) and never matches any real production value
- When: the registration handler runs and the logger captures each step
- Then: the placeholder credential substring does not appear in any log line

**Scenario 2: OAuth callback with a refresh token in the response leaves no trace**

- Given: an OAuth callback returns a refresh-token field from the provider
- When: Auth.js processes the callback and the application logs the session
- Then: the refresh-token value does not appear in any log line

**Scenario 3: bearer token in a Hono request is not logged**

- Given: a request to a Hono route with an `Authorization` header of the form `Bearer <jwt>` where `<jwt>` is a placeholder JWT-like string (e.g. starting with the typical base64-encoded header prefix used in test fixtures)
- When: the Hono request is processed and the origin-check middleware logs the request
- Then: the placeholder JWT-like string (and the full token) do not appear in any log line

**Scenario 4: CSRF token is not logged**

- Given: a request with a CSRF cookie or header
- When: the Auth.js CSRF check runs
- Then: the CSRF token value does not appear in any log line

---

### DELTA-C2.7 — Security test: origin-check (T-027.4)

**Status**: ADDED
**Capability**: auth
**Tasks**: T-027

**Requirement**:

WHEN `POST /api/auth/register` is called with a missing or mismatched `Origin` header (against `env.APP_URL`)
THEN the response MUST be **403** with `{ error: { code: "FORBIDDEN", message: "…" } }`.

This refines the origin-check implemented in DELTA-C2.2's sibling route (Hono `origin-check` middleware) by adding an **end-to-end test** that exercises the full request lifecycle, not just the middleware in isolation.

**Scenario 1: cross-origin POST is rejected**

- Given: `env.APP_URL = "https://app.example.com"`
- When: a request with `Origin: https://attacker.com` arrives at `POST /api/auth/register`
- Then: the response status is **403**
- And: the response body is `{"error":{"code":"FORBIDDEN","message":"Origin not allowed"}}`

**Scenario 2: same-origin POST is allowed**

- Given: `env.APP_URL = "https://app.example.com"`
- When: a request with `Origin: https://app.example.com` arrives
- Then: the response status is NOT 403 (the registration may succeed or fail for other reasons, but not for origin)

**Scenario 3: missing Origin is rejected**

- Given: `env.APP_URL = "https://app.example.com"`
- When: a request with no `Origin` header arrives
- Then: the response status is **403**
- (This protects against `curl`/scripts that don't send `Origin`; the design accepts that as out-of-scope for legitimate clients, which all send `Origin`.)

---

### DELTA-C2.8 — Security test: Argon2id parameters (T-027.5)

**Status**: ADDED
**Capability**: auth
**Tasks**: T-027

**Requirement**:

`hashArgon2id(password)` with the chosen parameters (`memoryCost=19456`, `timeCost=2`, `parallelism=1`) MUST produce a hash whose median runtime over 30 samples is in the **50–100 ms** range on the CI runner.

The test re-runs `scripts/bench-argon2.ts` and asserts the median falls in the band. The band is wide enough to absorb CI runner variance (GitHub-hosted runners have ~10% noise) but tight enough to catch parameter regressions (e.g. someone changing `timeCost` to 1 would drop the median to ~25 ms, well below the band).

**Scenario 1: median runtime is in the band on CI**

- Given: the CI runner hardware profile (GitHub-hosted Linux, 2 vCPU)
- When: `hashArgon2id("a-test-password")` is called 30 times
- Then: the median runtime is in [50, 100] ms
- And: the test passes

**Scenario 2: parameter change fails the test**

- Given: a developer accidentally changes `timeCost=2` to `timeCost=1` in `argon2.hasher.ts`
- When: the test runs
- Then: the median runtime is below 50 ms (roughly 25 ms)
- And: the test fails with a clear error message identifying the offending parameter

---

### DELTA-C2.9 — Security test: cookie attributes (T-027.6)

**Status**: ADDED
**Capability**: auth
**Tasks**: T-027

**Requirement**:

The `authjs.session-token` cookie MUST have:

- `HttpOnly` always (the cookie is not readable from JavaScript)
- `SameSite=Lax` always (the cookie is sent on top-level navigations)
- `Secure` MUST be set in production (`env.NODE_ENV=production`)
- `Path=/` (the cookie is sent on every path)

**Scenario 1: cookie has HttpOnly and SameSite=Lax in dev**

- Given: any successful authentication in development (`NODE_ENV=development`)
- When: the response is captured
- Then: the `Set-Cookie: authjs.session-token=…` header has the attributes `HttpOnly` and `SameSite=Lax`
- And: the cookie does NOT have `Secure` (dev is over HTTP)

**Scenario 2: cookie has Secure in production**

- Given: a production deployment (`NODE_ENV=production`)
- When: the response is captured
- Then: the `Set-Cookie` header has `Secure`
- And: the cookie has `HttpOnly` and `SameSite=Lax`

**Scenario 3: cookie path is `/`**

- Given: any successful authentication
- When: the response is captured
- Then: the `Set-Cookie` header has `Path=/`
- And: the cookie is sent on all subsequent requests regardless of path

---

### DELTA-C3.1 — CI workflow (T-028)

**Status**: ADDED
**Capability**: auth
**Tasks**: T-028

**Requirement**:

A CI workflow at `.github/workflows/ci.yml` MUST run on:

- `pull_request` to `develop` or `main`
- `push` to `develop` or `main`

The workflow MUST have **4 parallel jobs**:

1. **`lint`** — `pnpm install --frozen-lockfile`, `pnpm run lint`, `pnpm run typecheck`. Fails the job on any lint error or typecheck error.
2. **`test`** — `pnpm install --frozen-lockfile`, `pnpm prisma migrate deploy` (against the testcontainer Postgres), `pnpm test --coverage`, upload the `coverage/` artifact, post a sticky PR comment with the coverage percentages.
3. **`build`** — `pnpm install --frozen-lockfile`, `pnpm run build` (Next.js production build).
4. **`security`** — `pnpm install --frozen-lockfile`, `pnpm test src/modules/auth/__tests__/security/`. The slowest job; runs separately so a flake in the timing test does not block the lint and build jobs.

**Concurrency**: the workflow MUST cancel in-flight runs on the same `ref` when a new commit is pushed.

**No force-push to `main`** (per `ci-cd-pipeline` skill). The workflow may push commits to PR branches (e.g. for `autofix.ci`-style bots) but MUST NOT push to `main`.

**Scenario 1: all 4 jobs are green on a successful PR**

- Given: a PR to `develop` with no lint, typecheck, test, build, or security-test failures
- When: the workflow runs
- Then: all 4 jobs report success
- And: the PR has a green check from each job

**Scenario 2: a lint failure blocks the merge**

- Given: a PR to `develop` with a lint error in `src/modules/auth/...`
- When: the workflow runs
- Then: the `lint` job fails
- And: GitHub blocks the merge (branch protection rule from DELTA-C3.2)

**Scenario 3: a security-test flake does not block the other jobs**

- Given: a PR where the `login.timing.test.ts` flakes on the first run
- When: the workflow runs
- Then: the `security` job fails (the test is flaky)
- And: the `lint`, `test`, and `build` jobs still report their results
- And: a developer can re-run just the `security` job without re-running the others

---

### DELTA-C3.2 — Branch protection + CODEOWNERS (T-029)

**Status**: ADDED
**Capability**: auth
**Tasks**: T-029

**Requirement**:

A `.github/CODEOWNERS` file at the repo root MUST point to the maintainer (`@sebailla`).

A document at `docs/branch-protection.md` MUST describe the rules the parent will apply to `develop` (and optionally `main`) on GitHub:

- Require 1 review
- Require CI green on all 4 jobs (DELTA-C3.1)
- Dismiss stale approvals on push
- Require linear history (squash-merge only)
- No force-pushes

The actual GitHub branch-protection settings are applied manually by the user (not in this change) because they require repo-admin permissions. The document is the source of truth for the intended configuration.

**Scenario 1: CODEOWNERS lists the maintainer**

- Given: the repo is configured
- When: `cat .github/CODEOWNERS` is run
- Then: the file lists the maintainer's GitHub handle

**Scenario 2: branch protection rules are documented**

- Given: `docs/branch-protection.md` exists
- When: the file is read
- Then: it documents the 5 rules above
- And: it explains the rationale for each rule
- And: it links to the GitHub docs for the corresponding settings

---

### DELTA-C3.3 — ADRs (T-030)

**Status**: ADDED
**Capability**: auth
**Tasks**: T-030

**Requirement**:

Five ADRs MUST exist in `docs/adr/`, each following the MADR template (Context, Decision, Consequences, Alternatives considered). The five ADRs are:

- `0001-authjs-v5.md` — why Auth.js v5 over Lucia, Clerk, Supabase Auth, hand-rolled
- `0002-prisma-6.md` — why Prisma 6 over Kysely, raw SQL
- `0003-argon2id-parameters.md` — the final parameters (`memoryCost=19456, timeCost=2, parallelism=1`), the benchmark result, the fallback path
- `0004-hono-catch-all.md` — why Hono over pure Next.js route handlers, tRPC, Fastify; the `OpenAPIHono` + `hc<typeof honoApp>` typed-client export shape
- `0005-auto-link-security-model.md` — industry-standard auto-link on email match; BR-AUTH-5 / BR-AUTH-10; the deferral of a hardening pass

Each ADR MUST have at least one `### Alternatives considered` sub-section (not just a list) explaining why each alternative was rejected.

**Scenario 1: the 5 ADR files exist**

- Given: Slice C-3 is merged
- When: `ls docs/adr/` is run
- Then: the 5 files are listed
- And: `grep -c "^## Decision" docs/adr/*.md` returns 5

**Scenario 2: each ADR has a substantive Alternatives section**

- Given: any of the 5 ADRs
- When: the file is read
- Then: there is a `### Alternatives considered` sub-section
- And: each alternative has at least 2 sentences explaining the trade-off
- And: the rejected alternative is named explicitly (not just listed)

---

### DELTA-C3.4 — `docs/architecture.md` update (T-031)

**Status**: ADDED
**Capability**: auth
**Tasks**: T-031

**Requirement**:

`docs/architecture.md` MUST gain an "Auth" section with:

- A high-level Mermaid diagram (the same one from the design's §1)
- The data model summary (the 4 Prisma models, the 3 added columns, the `@@unique([provider, providerAccountId])` constraint)
- The 8 Auth.js routes and the 3 Hono routes
- The session strategy (database sessions, 30-day sliding, no JWT)
- The auto-link security model (with reference to BR-AUTH-5 / BR-AUTH-10)
- The cross-module contracts (`auth()` helper, `User` is the identity anchor, `UserRegistered` / `UserSignedIn` events)

The Spanish mirror at `Documents-es/docs/architecture.md` MUST be updated in the same commit (atomic per §13.3).

**Scenario 1: the Auth section is present**

- Given: Slice C-3 is merged
- When: `grep -A 1 "^## Auth" docs/architecture.md` runs
- Then: the section heading is present
- And: the section contains the Mermaid diagram
- And: the section references the BR-AUTH-\* rules

**Scenario 2: the Spanish mirror matches**

- Given: the English section was updated
- When: the Spanish mirror is read
- Then: it has a corresponding `## Auth` (or `## Auth — Autorización`) section
- And: the section structure mirrors the English
- And: technical terms (BR-AUTH-\*, `OpenAPIHono`, `hc<typeof honoApp>`, etc.) are verbatim

---

### DELTA-C3.5 — `README.md` update (T-032)

**Status**: ADDED
**Capability**: auth
**Tasks**: T-032

**Requirement**:

`README.md` MUST have a local-dev section with:

- How to install dependencies (`pnpm install`)
- How to set up the database (Postgres testcontainer OR `docker compose up`)
- How to run the dev server (`pnpm dev`)
- How to run tests (`pnpm test`)
- How to run the security tests (`pnpm test -- src/modules/auth/__tests__/security/`)
- The `--skip-timing` flag for noisy local dev
- A note that `pnpm prisma generate` is required after `pnpm install` (CI runs it automatically)

The Spanish mirror at `Documents-es/README.md` MUST be updated in the same commit (atomic per §13.3).

**Scenario 1: a new contributor can follow the README from a fresh clone**

- Given: a fresh clone of the repo
- When: the new contributor follows the README's local-dev section
- Then: `pnpm install` succeeds
- And: the database is reachable
- And: `pnpm dev` starts the server on port 3000
- And: `pnpm test` runs the unit tests
- And: `pnpm test -- src/modules/auth/__tests__/security/` runs the security tests

**Scenario 2: the Spanish mirror exists and is current**

- Given: the English README was updated
- When: the Spanish mirror is read
- Then: it has a corresponding local-dev section
- And: the commands and structure mirror the English
- And: the section explains the same steps

---

### DELTA-C3.6 — Bilingual drift closure (FLAG-2 of parent verify)

**Status**: ADDED
**Capability**: auth (parent change artifact)
**Tasks**: T-033 (part of the handoff)

**Requirement**:

`Documents-es/openspec/changes/auth-foundation/apply-progress.md` MUST be updated to mirror the English Slice B content. The Spanish mirror is currently stale (covers Slice A only; the English file covers Slice A + Slice B).

This closes the **WARNING FLAG-2** of the parent change's verify report (`file-only/verify-auth-foundation-slice-ab.md`).

**Scenario 1: the Spanish mirror mentions Slice B**

- Given: the Spanish mirror was updated
- When: `grep -E "T-019|T-020|Slice B" Documents-es/openspec/changes/auth-foundation/apply-progress.md` runs
- Then: there is at least one match
- And: the line count of the Spanish mirror is within ±20% of the English source

**Scenario 2: the 8 deviations of Slice B are mirrored**

- Given: the English file documents 8 deviations
- When: the Spanish mirror is read
- Then: it has corresponding `## Desviaciones` (or equivalent) sections for the 8 deviations
- And: the structure mirrors the English

---

## 3. Acceptance criteria (consolidated)

These are the **observable** outcomes a reviewer of Slice C will check. They are the union of the per-delta scenarios above.

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

## 4. Out of scope (unchanged from proposal)

- New auth providers beyond Google and Credentials
- Email verification flow
- Password reset flow
- Two-factor authentication (2FA)
- The 61 `pnpm audit` vulns from issue #7
- Real Postgres in CI (Slice A deviation #2; restoring testcontainers is a future concern)
- GGA `openrouter` provider configuration (FLAG-3 from parent verify)

## 5. Next step

After this spec is committed, the next SDD phase is `sdd-design`:

- `design.md` with the Vite alias pattern, the security test architecture, the CI workflow shape, the ADR drafts, the docs structure.
- Then `sdd-tasks` (a tasks file that breaks each of T-025..T-033 into sub-tasks with TDD evidence columns).
- Then `sdd-apply` (3 chained PRs: C-1, C-2, C-3).
- Then `sdd-verify` (re-run verify on T-001..T-033, expect `PASS` with no flags).
- Then `sdd-sync` (no canonical promotions needed — the canonical `openspec/specs/auth/spec.md` already covers the 8 decision gaps).
- Then `sdd-archive` (this change + the parent change).
