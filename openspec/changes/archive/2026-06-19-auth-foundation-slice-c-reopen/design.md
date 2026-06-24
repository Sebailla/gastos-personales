# Design — `auth-foundation-slice-c`

**Status**: closed-via-archive · **Author**: Sebastián Illa
**Created**: 2026-06-13 · **Change**: `auth-foundation-slice-c`
**Parent change**: `auth-foundation` (Slice A + B merged) · **Spec deltas**: `openspec/changes/auth-foundation-slice-c/spec.md`
**Capabilities affected**: auth (extends canonical `openspec/specs/auth/spec.md`)

## Goal

Implement the 9 remaining tasks of the `auth-foundation` SDD change (T-025..T-033), close the parent change's CRITICAL FLAG-1 (module-resolution bug, issue #18), and close the parent change's WARNING FLAG-2 (bilingual drift in `apply-progress.md`). The work is split into 3 chained sub-slices: C-1 (module-resolution + Hono catch-all + middleware + public API), C-2 (security tests + CI workflow + branch protection), C-3 (5 ADRs + `docs/architecture.md` + `README.md` + handoff).

This document does **NOT** re-debate the spec. It implements the spec's "what" with the "how".

---

## 1. Module-resolution fix design (DELTA-C1.1)

### 1.1 Decision

Patch Vite's resolver in `vitest.config.ts` with a `resolve.alias` that maps the bare import `'next/server'` to a 30-line test stub at `test/stubs/next-server.ts`. The stub provides minimal `NextRequest` and `NextResponse` no-ops — sufficient for the 3 test files that import `next-auth` (which transitively imports `next/server` without the `.js` extension). The stub is test-only; the production runtime uses the real `next/server`.

### 1.2 `vitest.config.ts` change

Append a `resolve.alias` entry inside the existing `defineConfig` block:

```typescript
// vitest.config.ts (delta from Slice B)
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // ... existing config
  resolve: {
    alias: {
      ...(existing aliases from Slice B),
      // Module-resolution fix (DELTA-C1.1): next-auth@5.0.0-beta.31 imports
      // 'next/server' (no extension) in its ESM build. Vite's strict ESM
      // resolver rejects bare imports. We map to a 30-line test stub.
      'next/server': path.resolve(__dirname, 'test/stubs/next-server.ts'),
    },
  },
});
```

### 1.3 `test/stubs/next-server.ts` (new file, ~30 lines)

Minimal stub. The actual Next.js server runtime is not available in Vitest; this stub provides a no-op surface that satisfies the import-time type checker and the test code that constructs `NextRequest` / `NextResponse` instances.

```typescript
// test/stubs/next-server.ts
// Minimal stub for next/server in the Vitest environment.
// Required by DELTA-C1.1: next-auth@5.0.0-beta.31 imports 'next/server'
// (no extension) from its ESM build. Vite's strict ESM resolver rejects
// bare imports. The actual Next.js server runtime is not available in
// Vitest; this stub provides a no-op surface that satisfies the import.
//
// This is test-only. Production runtime uses real next/server.

export class NextRequest {
  constructor(input: Request | string, init?: RequestInit) {
    // no-op
  }
}

export class NextResponse extends Response {
  static json(data: unknown, init?: ResponseInit): NextResponse {
    return new NextResponse(JSON.stringify(data), {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    });
  }

  static redirect(url: string, init?: ResponseInit): NextResponse {
    return new NextResponse(null, {
      ...init,
      status: 302,
      headers: { location: url, ...(init?.headers || {}) },
    });
  }
}

export const userAgent = 'vitest';
```

### 1.4 Fallback path

If the stub is insufficient (e.g. `next-auth` calls into real `next/server` runtime functions at test time, not just at import time), the fallback is to bump `next-auth` to `>=5.0.0-beta.32` when available. The C-1 apply worker will report if the stub is insufficient and the parent decides whether to take the fallback.

### 1.5 Re-include check (what the C-1 apply worker MUST verify)

1. Add the `resolve.alias` entry to `vitest.config.ts`.
2. Create `test/stubs/next-server.ts` with the content above.
3. **Remove the 3 entries** from `test.exclude` in `vitest.config.ts`:
   - `'src/modules/auth/index.test.ts'`
   - `'src/modules/auth/infrastructure/external/authjs.test.ts'`
   - `'**/app/api/auth/**/route.test.ts'`
4. Run `npx vitest run` (use `npx` to avoid the `pnpm` `ignoredBuiltDependencies` pre-check). Expect **137/137 tests verde**.
5. Run `npx vitest run --coverage`. Expect coverage on `src/modules/auth/**` ≥ 80%.
6. If any of the 3 files fails: re-add the entries, document the failure in the C-1 handoff, parent decides.

---

## 2. Hono catch-all architecture (DELTA-C2.1, T-025)

### 2.1 File: `app/api/[...path]/route.ts` (~30 lines)

```typescript
// app/api/[...path]/route.ts
// Hono catch-all: delegates non-auth requests to honoApp.fetch. Auth.js
// (app/api/auth/[...nextauth]/route.ts) takes routing precedence by Next.js's
// file-based routing (the more specific path wins).

import { honoApp } from '@/modules/api';
import type { NextRequest } from 'next/server';

async function handler(request: NextRequest): Promise<Response> {
  return honoApp.fetch(request);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
```

### 2.2 Routing precedence

Next.js's file-based routing matches `app/api/auth/[...nextauth]/route.ts` **before** `app/api/[...path]/route.ts` (the more specific path wins). Hono's `app.fetch` will **never** see requests to `/api/auth/*` because those are intercepted by the Auth.js handler. This is verified by the 2 integration tests.

### 2.3 Tests (2 cases, integration against a real Next.js server)

1. `GET /api/me` without a session cookie → 401 with `{ error: { code: 'UNAUTHORIZED', ... } }`
2. `GET /api/auth/signin` → returns Auth.js's HTML response, NOT Hono's JSON

### 2.4 Test infrastructure decision

Slice A deviation #2 noted that testcontainers are not in the project's CI infrastructure. The 2 integration tests use **Option B** (Vitest integration test that spawns a `next dev` process and uses `fetch` against it). The testcontainers path (Option A) is documented as a follow-up.

The test file `app/api/[...path]/route.test.ts` uses `child_process.spawn` to start `next dev` in a child process, waits for the port to be ready, fires 2 `fetch` requests, and asserts on the responses.

---

## 3. Public API surface (DELTA-C2.2 + DELTA-C2.3, T-026)

### 3.1 File: `src/modules/auth/index.ts` (~30 lines)

```typescript
// src/modules/auth/index.ts
// Public surface of the auth module. Other modules (accounts-ledger,
// transactions) may ONLY import from this file.

export { auth, signIn, signOut, handlers } from './infrastructure/external/authjs';
export { honoApp } from '@/modules/api';
export const UserRegistered = 'UserRegistered' as const;
export const UserSignedIn = 'UserSignedIn' as const;
```

### 3.2 Compile-time enforcement

`tsconfig.json` has `verbatimModuleSyntax: true` and `isolatedModules: true`. Any import from a non-exported path (e.g. `import { AuthService } from '@/modules/auth/application/services/auth.service'`) fails at compile time. The test `src/modules/auth/index.test.ts` asserts that the named exports exist and that the `src/modules/auth/index.ts` file is the only entry point.

### 3.3 File: `middleware.ts` at project root (~20 lines)

```typescript
// middleware.ts
// Next.js middleware: faster-fail 302 redirect for unauthenticated App
// Router pages. The Hono /api/me route already returns 401 when the
// session is missing; the middleware is the faster-fail path for
// App Router pages (e.g. /dashboard).

import { auth } from '@/modules/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/auth/signin', '/auth/signout', '/'];

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isAuthed = !!request.auth;

  if (!isAuthed && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/signin';
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: ['/((?!_next|api/auth|favicon.ico).*)'],
};
```

### 3.4 Tests (2 cases)

1. Unauthenticated request to `/dashboard` → 302 redirect to `/auth/signin`
2. Authenticated request to `/dashboard` → 200

---

## 4. Security test architecture (DELTA-C2.4..C2.9, T-027)

### 4.1 Location

All 6 security tests live in `src/modules/auth/__tests__/security/`. The directory structure:

```
src/modules/auth/__tests__/security/
├── login.timing.test.ts
├── oauth.state-csrf.test.ts
├── secrets.in-logs.test.ts
├── origin-check.test.ts
├── argon2.parameters.test.ts
└── cookie.attributes.test.ts
```

### 4.2 The 6 tests

| #   | File                        | Requirement                                                                                | Test method                                               |
| --- | --------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 1   | `login.timing.test.ts`      | Welch's t-test, p > 0.01 over 30 paired samples (`known + wrong` vs `unknown + any`)       | Statistical test with real Argon2id                       |
| 2   | `oauth.state-csrf.test.ts`  | Tampered `state` parameter rejected, no `User`/`Account` rows inserted                     | Mock Auth.js callback, assert row counts                  |
| 3   | `secrets.in-logs.test.ts`   | 4 secret types (`password`, `refresh_token`, `Bearer`, `id_token`, CSRF) not in log output | Capture log output during register/callback/session paths |
| 4   | `origin-check.test.ts`      | Cross-origin POST → 403 `FORBIDDEN`                                                        | Assert 403 status                                         |
| 5   | `argon2.parameters.test.ts` | Hash median in [50, 100] ms on CI runner                                                   | Run 30 hashes, take median                                |
| 6   | `cookie.attributes.test.ts` | `HttpOnly` + `SameSite=Lax` always; `Secure` in production                                 | Capture `Set-Cookie` header                               |

### 4.3 Testcontainers-vs-fakes decision

- Tests #1 (timing), #5 (argon2id), #6 (cookies) need **real Argon2id** runtime. Fakes invalidate the timing measurement.
- Tests #2 (OAuth state), #3 (secrets), #4 (origin-check) can use the existing fake-Prisma pattern (per Slice A deviation #2).
- **Recommendation**: for tests #1, #5, #6, use a real Argon2id (`@node-rs/argon2` is already a dep, runs in-process). For tests #2-#4, use the existing fake-Prisma pattern. This avoids the testcontainers dependency entirely.

### 4.4 `--skip-timing` local flag

Locally, the timing test (test #1) is noisy on Mac. The C-2 apply worker implements the skip mechanism as an env var (`SKIP_TIMING=true`) read at the top of `login.timing.test.ts`. CI runs the full suite; local dev can opt out.

---

## 5. CI workflow design (DELTA-C3.1, T-028)

### 5.1 File: `.github/workflows/ci.yml` (~90 lines, YAML)

```yaml
# .github/workflows/ci.yml
name: ci

on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop, main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.6.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: gastos
          POSTGRES_PASSWORD: gastos
          POSTGRES_DB: gastos_test
        ports: [5432:5432]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgres://gastos:gastos@localhost:5432/gastos_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.6.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma migrate deploy
      - run: pnpm test --coverage
      - uses: actions/upload-artifact@v4
        with: { name: coverage, path: coverage/ }
      - uses: marocchino/sticky-pull-request-comment@v2
        with:
          header: coverage
          message: |
            Coverage on src/modules/auth/**: ${{ steps.coverage.outputs.auth-coverage }}%

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.6.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.6.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test src/modules/auth/__tests__/security/
```

### 5.2 Testcontainers dependency

The `test` job needs a Postgres service. The recommended approach is **Option A** (GitHub-hosted `services: postgres:` in the workflow, as shown above). The Neon alternative (Option B) is documented as a follow-up if Option A flakes.

### 5.3 No force-push to main

Per `ci-cd-pipeline` skill + AGENTS.md §5.2: the workflow does not push, only the user does. The CI status gates merges, not pushes.

---

## 6. ADR drafts (DELTA-C3.3, T-030)

### 6.1 Location

5 ADRs in `docs/adr/`, MADR template (Markdown Any Decision Record):

- `docs/adr/0001-authjs-v5.md`
- `docs/adr/0002-prisma-6.md`
- `docs/adr/0003-argon2id-parameters.md`
- `docs/adr/0004-hono-catch-all.md`
- `docs/adr/0005-auto-link-security-model.md`

### 6.2 Per-ADR structure

Each ADR follows the MADR template:

```markdown
# ADR-NNNN — <title>

**Status**: Accepted · **Date**: 2026-06-13 · **Deciders**: Sebastián Illa

## Context and Problem Statement

<Why this decision is needed. Reference the parent change's design / proposal.>

## Decision Drivers

- <List of forces that influence the decision>

## Considered Options

1. <Option 1>
2. <Option 2>
3. <Option 3>
4. <Option 4>

## Decision Outcome

**Chosen option**: "<option N>", because <rationale>.

### Consequences

- **Good**: <list>
- **Bad**: <list>

### Confirmation

<How the decision is validated.>
```

### 6.3 Summary of each ADR's decision

- **0001-authjs-v5.md**: Auth.js v5 (`next-auth@5.0.0-beta.31`). Alternatives: Lucia (deprecated 2025-04), Clerk (vendor lock-in + costs), Supabase Auth (lock-in), hand-rolled (too much surface).
- **0002-prisma-6.md**: Prisma 6. Alternatives: Kysely (more boilerplate), raw SQL (no type safety), Drizzle (less mature).
- **0003-argon2id-parameters.md**: `memoryCost=19456, timeCost=2, parallelism=1` (median 65 ms on CI). Alternatives: bcrypt (less secure), scrypt (slower), Argon2i/d (different algorithm).
- **0004-hono-catch-all.md**: Hono at `app/api/[...path]/route.ts`. Alternatives: pure Next.js route handlers (no typed client), tRPC (heavier learning curve), Fastify (requires separate Node server).
- **0005-auto-link-security-model.md**: auto-link on email match (industry-standard; Notion, Linear, Vercel all do this). Alternatives: no auto-link (bad UX), auto-link on `email_verified: true` only (worse UX).

---

## 7. Docs structure (DELTA-C3.4 + DELTA-C3.5 + DELTA-C3.6, T-031 + T-032 + part of T-033)

### 7.1 `docs/architecture.md` Auth section (~150 lines)

Append an "Auth" section to the existing `docs/architecture.md`. The section contains:

- **High-level Mermaid diagram** (the same one from the parent change's design §1)
- **Data model summary**: 4 Prisma models (`User`, `Account`, `Session`, `VerificationToken`), 3 added columns (`defaultProvider`, `lastLoginAt`, `image`), the `@@unique([provider, providerAccountId])` constraint on `Account`
- **Routes**: 8 Auth.js routes (`/api/auth/[...nextauth]/*`) + 3 Hono routes (`/api/me`, `/api/auth/register`, `/api/health`)
- **Session strategy**: database sessions (no JWT), 30-day maxAge, 24-hour sliding window
- **Auto-link security model**: industry-standard on email match, BR-AUTH-5 / BR-AUTH-10 rationale
- **Cross-module contracts**: `auth()` helper as the only identity resolution path, `User` is the identity anchor, `UserRegistered` / `UserSignedIn` events

### 7.2 `README.md` local-dev section (~30 lines)

Append a "Local dev" section to the existing `README.md`. The section contains:

- `pnpm install` to install dependencies
- Postgres setup: `docker compose up -d postgres` (or use a Neon free-tier branch)
- `pnpm dev` to start the Next.js dev server
- `pnpm test` to run the unit test suite
- `pnpm test -- src/modules/auth/__tests__/security/` to run the security test suite
- `SKIP_TIMING=true pnpm test` for noisy local dev (skips the timing test)

### 7.3 `Documents-es/docs/architecture.md` mirror

Faithful translation of the Auth section, voseo rioplatense consistent with other Spanish mirrors in the project. Updated in the same commit as the English source.

### 7.4 `Documents-es/README.md` mirror

Faithful translation of the local-dev section, voseo rioplatense. Updated in the same commit as the English source.

### 7.5 `Documents-es/openspec/changes/auth-foundation/apply-progress.md` re-sync (FLAG-2 closure)

The parent change's `apply-progress.md` is stale in Spanish (it covers Slice A only; Slice B content is missing). The C-3 apply worker updates the Spanish mirror to include Slice B's section (TDD evidence, files touched, deviations). Single commit at the end of C-3, atomic with the handoff.

---

## 8. Strict TDD map

Per the parent change's `openspec/config.yaml` (`strictTdd.enabled: true`):

| Task    | Test files                                                 | RED                                                         | GREEN                     | TRIANGULATE                             | REFACTOR |
| ------- | ---------------------------------------------------------- | ----------------------------------------------------------- | ------------------------- | --------------------------------------- | -------- |
| T-025   | `app/api/[...path]/route.test.ts`                          | 2 cases (auth.js routing precedence, hono routing)          | both pass                 | cross-origin POST + auth.js signin path | clean    |
| T-026   | `src/modules/auth/index.test.ts` + `middleware.test.ts`    | 2 cases (compile-time export, 302 redirect)                 | both pass                 | same path authenticated vs not          | clean    |
| T-027.1 | `src/modules/auth/__tests__/security/login.timing.test.ts` | Welch's t-test, 30 paired samples                           | p > 0.01                  | alternate wrong-password vs dummy-hash  | clean    |
| T-027.2 | `oauth.state-csrf.test.ts`                                 | tampered state rejected                                     | passes                    | row counts for User + Account           | clean    |
| T-027.3 | `secrets.in-logs.test.ts`                                  | 4 scenarios (password, refresh_token, Bearer, id_token)     | all 4 pass                | nested-object redaction                 | clean    |
| T-027.4 | `origin-check.test.ts`                                     | cross-origin → 403                                          | passes                    | same-origin → not 403                   | clean    |
| T-027.5 | `argon2.parameters.test.ts`                                | 30 hash calls                                               | median in [50, 100] ms    | alt params out of band                  | clean    |
| T-027.6 | `cookie.attributes.test.ts`                                | HttpOnly + SameSite=Lax                                     | both pass                 | Secure in production                    | clean    |
| T-028   | N/A (CI is the test)                                       | workflow runs 4 jobs                                        | all green on merge commit | job-failure scenarios                   | clean    |
| T-029   | N/A                                                        | CODEOWNERS file lists maintainer                            | passes                    | rules documented                        | clean    |
| T-030   | N/A                                                        | 5 ADRs exist with `### Decision` + `### Considered Options` | 5/5                       | each ADR has 3+ alternatives            | clean    |
| T-031   | N/A (docs)                                                 | `docs/architecture.md` has Auth section                     | passes                    | Mermaid renders                         | clean    |
| T-032   | N/A (docs)                                                 | `README.md` has local-dev section                           | passes                    | `--skip-timing` flag documented         | clean    |
| T-033   | N/A (handoff)                                              | all 9 tasks `[x]` + PR opened + reviewer assigned           | passes                    | handoff file written                    | clean    |

---

## 9. Review workload forecast (mandatory)

| Sub-slice                                                     | Tasks                           | Estimated lines | Overage vs 400-line budget |
| ------------------------------------------------------------- | ------------------------------- | --------------- | -------------------------- |
| C-1 (module-resolution + catch-all + middleware + public API) | DELTA-C1.1, T-025, T-026        | ~200            | 0.5× (under budget!)       |
| C-2 (security tests + CI + branch protection)                 | T-027, T-028, T-029             | ~700            | 1.75×                      |
| C-3 (ADRs + architecture.md + README + handoff)               | T-030, T-031, T-032, T-033      | ~600            | 1.5×                       |
| **Total**                                                     | 9 tasks + module-resolution fix | ~1,500          | —                          |

C-1 is under the 400-line budget. C-2 and C-3 are over but the user already accepted overage for the parent change. The 3 chained PRs are sequenced C-1 → C-2 → C-3.

---

## 10. Risks & dependencies

- **Module-resolution stub insufficiency**: if `next-auth` calls into real `next/server` runtime at test time, the stub fails. Fallback: bump `next-auth@5.0.0-beta.32+` or patch Vite differently.
- **Testcontainers for security tests**: tests #1, #5, #6 need real Argon2id (not testcontainers, but the same category of "real external dependency"). In-process via `@node-rs/argon2` is sufficient.
- **CI Postgres service** (Option A): GitHub-hosted `services: postgres:` may flake on certain runner images. Fallback: Neon free-tier branch.
- **Timing test reliability**: noisy on Mac. The `SKIP_TIMING=true` env var handles local dev; CI runs the full suite.
- **Bilingual drift** (FLAG-2 closure): the C-3 worker must update the Spanish `apply-progress.md` atomically with the C-3 handoff. If forgotten, the verify phase will re-flag.
- **The 61 pnpm audit vulns** (issue #7) remain open. The weekly batch PRs handle them in their own cycle. This change does not address them.

---

## 11. Out of scope (this design)

- The 61 pnpm audit vulns (separate tracking, issue #7).
- Email verification flow (deferred to a future change).
- Password reset flow (deferred to a future change).
- 2FA (deferred to a future change).
- New auth providers beyond Google and Credentials.
- The `accounts-ledger`, `transactions`, `fx-cache`, `networth-snapshot`, `reports-mvp`, `pwa-shell`, `fly-deploy` SDD changes.

---

## 12. Next step

The next SDD phase is `sdd-tasks` (T-025..T-033 + module-resolution fix broken into 14 atomic commits with TDD evidence columns). After `sdd-tasks`: `sdd-apply` (3 chained sub-slice PRs: C-1, C-2, C-3).
