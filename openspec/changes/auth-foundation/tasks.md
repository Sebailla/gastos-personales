# Tasks — `auth-foundation`

**Author**: Sebastián Illa
**Change**: `auth-foundation`
**Status**: ready-for-apply · **Created**: 2026-06-10
**Upstream**: `openspec/changes/auth-foundation/proposal.md` (v2, approved) ·
`openspec/changes/auth-foundation/design.md` (v2, approved) ·
`openspec/specs/auth/spec.md` (canonical, v2)
**Target branch**: `feat/auth-foundation` → `develop`
**PR strategy**: 3 chained PRs (see "Review workload forecast" below)
**Preflight values**: interactive · `both` (OpenSpec + Engram) · `auto-forecast` · 400 lines budget
**Stack v2**: Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (`next-auth@5.0.0-beta.X`, exact pin) + `@auth/prisma-adapter` + Prisma 6 + PostgreSQL on Neon + Zod + Vitest + pnpm + Fly.io

> **v2 note**: this is the second write of this task list. The
> first version targeted Bun + Hono (server) + Drizzle + SQLite
> + a hand-rolled auth subsystem (commit `b2a69ec`) and was
> deleted in `eca35c9` after the stack changed. v1 is kept in
> git history for structural reference; its content is
> **obsolete** (custom JWT, refresh rotation, Drizzle, SQLite,
> `arctic`, `jose`, `bun-argon2`). v2 keeps the v1 *shape* (11
> phases, TDD-first ordering, 3-chained-PR forecast) and
> replaces the *substance* with Auth.js v5 database sessions,
> the Prisma adapter, and the Hono catch-all that hosts the
> non-auth application API.

## Goal

`auth-foundation` lands a complete, production-grade identity
layer for `gastos-personales`. When `sdd-apply` finishes, the
system must expose seven Auth.js-managed routes under
`/api/auth/*` (sign-in, OAuth start, OAuth callback, credentials
callback, session, CSRF, providers, sign-out) plus three
Hono-mounted application routes under `/api/*` (`/health`,
`/me`, `/auth/register`), backed by four Prisma-managed
Postgres tables (`User`, `Account`, `Session`,
`VerificationToken`) on Neon, with Argon2id password hashing
(parameter-tuned for 50–100 ms on Fly.io 1-CPU), Google OAuth
2.0 with email-match auto-link, an `auth()` server-side helper
that is the only identity-resolution path, structured logging
that strips `password` / `passwordHash` / `sessionToken` /
`access_token` / `refresh_token` / `id_token` / `csrfToken` /
`"set-cookie"` from every line (BR-AUTH-11), and ≥ 80 % line
+ branch coverage on `src/modules/auth/**` and
`src/shared/db/**` — all gated by `pnpm test` (Vitest),
`pnpm run lint`, `pnpm run typecheck`, `pnpm run build`, and
`gga run`.

## Scope summary

- 4 Prisma models (User, Account, Session, VerificationToken)
  + 1 versioned migration (Prisma-generated SQL).
- 3 domain entity types (User, Account, Session projections) +
  PublicUser value object.
- 3 domain service classes (PasswordService, AuthService,
  DefaultProviderPolicy) and the Auth.js wiring at the
  infrastructure edge.
- 1 application package: register action + DTO; me action + DTO;
  health action.
- 3 Hono routes mounted at `app/api/[...path]/route.ts`:
  `GET /health`, `GET /me`, `POST /auth/register`.
- 7 Auth.js-managed routes under `/api/auth/*`, mounted at
  `app/api/auth/[...nextauth]/route.ts`.
- 1 middleware (origin-check) for mutating Hono endpoints.
- 1 typed client export (`hc<typeof honoApp>`) at
  `src/modules/api/client.ts`.
- 2 event types (`UserRegistered`, `UserSignedIn`) + dispatcher
  integration.
- 6 security tests (timing, OAuth `state`, secrets in logs,
  origin-check, Argon2id parameters, cookie attributes).
- 5 ADRs (Auth.js v5, Prisma 6, Argon2id parameters, Hono
  catch-all shape, auto-link security model).
- CI workflow (`.github/workflows/ci.yml`) with lint + typecheck
  + test (coverage) + build jobs.
- Husky pre-commit (`gga run` + lint-staged) + commit-msg
  (commitlint) + pre-push.
- ESLint + Prettier + TypeScript strict + Vitest coverage ≥ 80 %
  on `src/modules/auth/**` and `src/shared/db/**`.
- Bilingual docs: this tasks list + `docs/architecture.md` (Auth
  section) + `README.md`, all mirrored in `Documents-es/`.

## Architecture map (final shape after `sdd-apply`)

```
gastos-personales/
├── app/
│   ├── api/auth/[...nextauth]/route.ts   # Auth.js handler
│   ├── api/[...path]/route.ts            # Hono catch-all
│   ├── auth/
│   │   ├── signin/page.tsx               # custom signIn page
│   │   └── signout/page.tsx              # custom signOut page
│   ├── layout.tsx
│   └── page.tsx
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       └── 20260610000000_auth_foundation/migration.sql
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── domain/
│   │   │   │   ├── entities/{user,account,session}.ts
│   │   │   │   ├── value-objects/public-user.ts
│   │   │   │   ├── services/{password,default-provider,auth}.service.ts
│   │   │   │   └── interfaces/{user,account,session}.repository.port.ts
│   │   │   ├── application/
│   │   │   │   ├── actions/{register,me,health}.action.ts
│   │   │   │   └── dto/{register,me,health}.dto.ts
│   │   │   ├── infrastructure/
│   │   │   │   ├── external/
│   │   │   │   │   ├── argon2.hasher.ts
│   │   │   │   │   └── authjs.ts
│   │   │   │   └── repositories/
│   │   │   │       ├── user.repository.ts
│   │   │   │       ├── account.repository.ts
│   │   │   │       └── session.repository.ts
│   │   │   ├── __tests__/security/
│   │   │   │   ├── login.timing.test.ts
│   │   │   │   ├── oauth.state-csrf.test.ts
│   │   │   │   ├── secrets.in-logs.test.ts
│   │   │   │   ├── origin-check.test.ts
│   │   │   │   ├── argon2.parameters.test.ts
│   │   │   │   └── cookie.attributes.test.ts
│   │   │   └── index.ts                 # public API
│   │   └── api/
│   │       ├── app.ts                   # OpenAPIHono app
│   │       ├── client.ts                # typed hc<typeof honoApp>
│   │       ├── middlewares/origin-check.ts
│   │       └── index.ts
│   └── shared/
│       ├── env/
│       │   ├── env.schema.ts
│       │   └── env.schema.test.ts
│       ├── errors/
│       │   ├── app-error.ts
│       │   ├── app-error.test.ts
│       │   └── error-codes.ts
│       ├── logger/
│       │   ├── logger.ts
│       │   └── logger.test.ts
│       ├── events/
│       │   ├── event-dispatcher.ts
│       │   ├── event-dispatcher.test.ts
│       │   └── user-events.ts
│       ├── http/
│       │   ├── request-id.ts
│       │   ├── request-id.test.ts
│       │   ├── error-handler.ts
│       │   └── error-handler.test.ts
│       ├── crypto/
│       │   ├── web-crypto.ts
│       │   └── web-crypto.test.ts
│       └── db/
│           ├── prisma.ts                # singleton PrismaClient
│           └── prisma.test.ts
├── docs/
│   ├── adr/
│   │   ├── 0001-authjs-v5.md
│   │   ├── 0002-prisma-6.md
│   │   ├── 0003-argon2id-parameters.md
│   │   ├── 0004-hono-catch-all.md
│   │   └── 0005-auto-link-security-model.md
│   └── architecture.md                   # gains "Auth" section
├── scripts/
│   └── bench-argon2.ts                   # measures hash time
├── test/
│   └── setup.ts                          # vitest setup
├── .github/
│   ├── workflows/ci.yml
│   └── CODEOWNERS
├── .husky/
│   ├── commit-msg
│   ├── pre-commit
│   └── pre-push
├── .gga
├── .env.example
├── commitlint.config.js
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.ts
├── prisma.config.ts
├── vitest.config.ts
├── AGENTS.md
├── openspec/
└── Documents-es/
    └── (mirrors of every English doc above, same path)
```

`src/modules/auth/index.ts` exports the public surface:
`auth()` (the Auth.js v5 server-side helper), `signIn`,
`signOut`, `handlers` (the `GET`/`POST` re-export for
`/api/auth/*`), `honoApp` (the `OpenAPIHono` instance for
the Hono catch-all), and the `UserRegistered` / `UserSignedIn`
event name constants. Nothing else in the codebase reaches into
the module's internals.

## Task list

> **TDD discipline.** Every task is a pair: the test file is
> written and committed **first** (RED), then the implementation
> is written to make it pass (GREEN), then any obvious cleanup
> is folded in (REFACTOR). The `Tests` and `Verify` lines below
> call this out per task. Per `openspec/config.yaml` (updated in
> the same commit as this tasks list)
> `strictTdd.enabled: true` and `strictTdd.runner: "pnpm test"`
> (Vitest). The runner is **never** `bun test`.

### Phase 0 — Scaffolding (the floor everything else stands on)

- [x] **T-001** Initialize the Next.js 16 + TypeScript + pnpm project
  - **Scope**: `pnpm create next-app@latest gastos-personales --ts
    --eslint --app --src-dir --import-alias "@/*" --no-tailwind
    --use-pnpm` to scaffold the floor. Verify `next.config.ts`,
    `tsconfig.json` (strict: true), and the default `app/`
    tree. Add the `dev`, `build`, `start`, `lint`, `typecheck`,
    `test`, `test:coverage`, `test:ui`, and `prisma` scripts to
    `package.json`. Add `"packageManager": "pnpm@<version>"` so
    CI's `corepack enable` provisions the right version. No auth
    code yet.
  - **Files**: `package.json`, `tsconfig.json`, `next.config.ts`,
    `app/layout.tsx`, `app/page.tsx`
  - **Lines estimate**: 80
  - **Depends on**: none
  - **Tests**: N/A (scaffolding). `pnpm test` runs Vitest with
    zero tests and exits 0.
  - **Verify**: `pnpm install` exits 0; `pnpm test` exits 0
    ("no tests found", not an error); `pnpm run typecheck`
    exits 0; `pnpm run build` exits 0 (Next.js production
    build smoke test).

- [x] **T-002** Configure ESLint, Prettier, `.editorconfig`, Vitest
  - **Scope**: ESLint with `@typescript-eslint` recommended +
    `eslint-config-prettier` to disable conflicting rules;
    Prettier defaults (single quotes, no semis, trailing comma
    `all`); `.editorconfig` for indent + charset. Add a
    `vitest.config.ts` at the project root with the v8 coverage
    provider and the 80 % line + branch threshold for
    `src/modules/auth/**` and `src/shared/db/**`. Wire the
    `@` path alias to `vitest.config.ts` so tests resolve
    imports the same way the app does.
  - **Files**: `.eslintrc.cjs`, `.prettierrc`, `.editorconfig`,
    `vitest.config.ts`, `test/setup.ts`
  - **Lines estimate**: 70
  - **Depends on**: T-001
  - **Tests**: N/A. Lint and Vitest config are gates, not
    unit-tested behavior.
  - **Verify**: `pnpm run lint` exits 0 on the scaffolded
    `app/page.tsx`; `pnpm test` exits 0 with zero tests.

- [x] **T-003** Install Husky + commitlint + lint-staged + wire GGA pre-commit
  - **Scope**: `pnpm dlx husky init` creates `.husky/`. The
    `commit-msg` hook runs `pnpm dlx commitlint --edit "$1"`.
    The `pre-commit` hook runs `pnpm dlx lint-staged` (which
    runs ESLint + Prettier on staged files) and then
    `gga run` on staged files. The `pre-push` hook validates
    the branch name against
    `^(feat|fix|chore|docs|refactor|test|build|ci|perf|revert)/[a-z0-9-]+$`
    and rejects pushes to `main` or `master`.
    `commitlint.config.js` extends
    `@commitlint/config-conventional`. A `.gga` config file
    is added at the project root (or the existing global
    config is verified with `gga --version`).
  - **Files**: `.husky/commit-msg`, `.husky/pre-commit`,
    `.husky/pre-push`, `commitlint.config.js`, `.gga`
  - **Lines estimate**: 70
  - **Depends on**: T-001, T-002
  - **Tests**: A `scripts/verify-hooks.sh` smoke-tests each
    hook with a fixture commit message and branch name.
  - **Verify**: `pnpm commitlint --edit` exits 0 on a valid
    message; `pnpm run lint` exits 0 on a stub
    `app/page.tsx`; a `git commit -m "feat: smoke"` triggers
    the pre-commit hook which exits 0; `git push` from a
    branch named `badbranch` is rejected by the pre-push hook.

- [x] **T-004** Author `.env.example` and extend `.gitignore`
  - **Scope**: `.env.example` lists every env var in the
    design's env schema (`NODE_ENV`, `PORT`, `LOG_LEVEL`,
    `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `APP_URL`,
    `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`,
    `ARGON2ID_DUMMY_PASSWORD`, `FLY_REGION`) with empty
    placeholders and one-line comments explaining each
    (production-required vs. optional, where to get the value).
    `.gitignore` is extended to cover `.next/`, `coverage/`,
    `pnpm-debug.log*`, and `prisma/*.db*`. The existing
    `.env.example` is NOT ignored.
  - **Files**: `.env.example`, `.gitignore` (modified)
  - **Lines estimate**: 40
  - **Depends on**: T-001
  - **Tests**: N/A. The Zod schema in T-005 is the testable
    surface for these values.
  - **Verify**: `git check-ignore -v .env` returns 0;
    `git check-ignore -v .env.example` returns 1 (NOT
    ignored); `cat .env.example | grep -c AUTH_SECRET`
    returns 1; `cat .env.example | grep -c
    ARGON2ID_DUMMY_PASSWORD` returns 1.

### Phase 1 — Shared infrastructure (env, errors, logger, events, crypto, http)

- [x] **T-005** Write the Zod env schema with tests
  - **Scope (RED → GREEN → REFACTOR)**: tests for the env
    schema live in `src/shared/env/env.schema.test.ts`. They
    cover: every required key missing ⇒ throws; `AUTH_SECRET`
    length < 32 ⇒ throws; `DATABASE_URL` empty ⇒ throws;
    `AUTH_URL` is not a URL ⇒ throws; `PORT` is coerced to
    number; `NODE_ENV` enum validation; cross-field assertion
    `new URL(env.AUTH_URL).origin === new URL(env.APP_URL).origin`
    fails fast. Once tests are red, implement the schema in
    `src/shared/env/env.schema.ts` and re-run until green.
  - **Files**: `src/shared/env/env.schema.test.ts`,
    `src/shared/env/env.schema.ts`
  - **Lines estimate**: 90
  - **Depends on**: T-001
  - **Tests**: 7 cases. AAA pattern. Parametrized via
    table-driven `it.each`. No `if/else/for` in test bodies.
  - **Verify**: `pnpm test src/shared/env/` exits 0; `pnpm
    test` overall still exits 0; `pnpm run typecheck` exits 0.

- [x] **T-006** Write `AppError` class and error-code constants
  - **Scope (RED → GREEN)**: `src/shared/errors/app-error.test.ts`
    asserts the `AppError` constructor stores `code`,
    `statusCode`, `details`; `instanceof Error` is true;
    `name === 'AppError'`. `src/shared/errors/error-codes.ts`
    exports the exhaustive enum of codes from the spec's
    "Error codes" section (`VALIDATION_ERROR`, `WEAK_PASSWORD`,
    `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `EMAIL_TAKEN`,
    `RATE_LIMITED`, `INTERNAL_ERROR`, `FORBIDDEN`,
    `OAUTH_PROVIDER_UNAVAILABLE`) with HTTP status mappings.
  - **Files**: `src/shared/errors/app-error.test.ts`,
    `src/shared/errors/app-error.ts`,
    `src/shared/errors/error-codes.ts`
  - **Lines estimate**: 70
  - **Depends on**: T-005
  - **Tests**: 4 cases for `AppError`. `error-codes.ts` is
    type-checked at compile time; the test imports each
    constant and asserts the type.
  - **Verify**: `pnpm test src/shared/errors/` exits 0;
    `pnpm run typecheck` exits 0.

- [x] **T-007** Logger + request-id middleware + error-handler middleware
  - **Scope (RED → GREEN)**: tests for the logger assert
    that the denylist keys (`password`, `passwordHash`,
    `sessionToken`, `access_token`, `refresh_token`,
    `id_token`, `csrfToken`, `set-cookie`, `authorization`,
    `cookie`, `code`) are stripped from log output regardless
    of the input object (BR-AUTH-11). Tests for the
    request-id middleware assert that an incoming
    `X-Request-Id` header is echoed back, and that a missing
    header gets a fresh uuid v7. Tests for the Hono
    error-handler middleware assert the
    `{ error: { code, message, details? } }` response shape
    (per `api-design` skill), the `requestId` in every log
    line, and that `AppError` details are passed through
    while raw `Error.message` is not.
  - **Files**: `src/shared/logger/logger.ts`,
    `src/shared/logger/logger.test.ts`,
    `src/shared/http/request-id.ts`,
    `src/shared/http/request-id.test.ts`,
    `src/shared/http/error-handler.ts`,
    `src/shared/http/error-handler.test.ts`
  - **Lines estimate**: 110
  - **Depends on**: T-005, T-006
  - **Tests**: 10 cases across the three modules. AAA
    pattern. Parametrized for the logger's denylist.
  - **Verify**: `pnpm test src/shared/logger/`
    `pnpm test src/shared/http/` exit 0; ≥ 80 % coverage
    on `src/shared/logger/logger.ts` and
    `src/shared/http/`.

- [x] **T-008** Web Crypto helpers (uuid v7, sha256 hex, HMAC sign/verify)
  - **Scope (RED → GREEN)**: `src/shared/crypto/web-crypto.test.ts`
    asserts: `uuidV7()` returns a 36-char string of the
    expected v7 shape; consecutive calls are monotonically
    non-decreasing in the timestamp prefix;
    `sha256Hex(input)` is deterministic and matches the
    Node-compatible sha256 of a known fixture;
    `hmacSign(key, msg)` and `hmacVerify(key, msg, sig)` are
    symmetric; a tampered message fails verification. All
    operations use Web Crypto (`crypto.getRandomValues`,
    `crypto.subtle.digest`, `crypto.subtle.sign/verify`).
    `src/shared/crypto/web-crypto.ts` is the implementation.
  - **Files**: `src/shared/crypto/web-crypto.ts`,
    `src/shared/crypto/web-crypto.test.ts`
  - **Lines estimate**: 60
  - **Depends on**: T-005
  - **Tests**: 6 cases. AAA pattern.
  - **Verify**: `pnpm test src/shared/crypto/` exits 0;
    `pnpm run typecheck` exits 0.

- [x] **T-009** In-process event dispatcher + `UserRegistered` / `UserSignedIn` event types
  - **Scope (RED → GREEN)**: a typed event registry in
    `src/shared/events/event-dispatcher.ts` accepts a union
    of event types (the `UserRegistered` and `UserSignedIn`
    events defined in the spec's "Cross-module contracts"
    section). `dispatch({ type, payload })` runs registered
    subscribers; `subscribe(type, handler)` registers a
    subscriber. The auth module publishes, downstream
    modules subscribe. The test asserts that
    `dispatch('UserRegistered', ...)` invokes every
    registered subscriber exactly once; subscribers that
    throw are caught, logged at `warn`, and do NOT block
    the dispatcher from calling the next subscriber. No
    subscribers are registered in this change.
  - **Files**: `src/shared/events/event-dispatcher.ts`,
    `src/shared/events/event-dispatcher.test.ts`,
    `src/shared/events/user-events.ts`
  - **Lines estimate**: 50
  - **Depends on**: T-006, T-007
  - **Tests**: 4 cases. AAA pattern. Parametrized for the
    "subscriber throws" path.
  - **Verify**: `pnpm test src/shared/events/` exits 0;
    `pnpm run typecheck` exits 0.

### Phase 2 — Auth domain (entities, value objects, ports, services)

- [x] **T-010** Domain entities (`User`, `Account`, `Session`) + `PublicUser` projection
  - **Scope (RED → GREEN)**: tests assert the entity factory
    functions normalize email (lowercase + trim) and reject
    malformed input. `PublicUser.from(user)` strips
    `passwordHash` and `emailVerified` from the projection
    and shapes the JSON the spec requires
    (`{ id, email, name, image, defaultProvider,
    lastLoginAt }`). `Session.isActive(now)` returns false
    on expired sessions. The entities are plain TS types +
    factory functions; no Prisma imports.
  - **Files**:
    `src/modules/auth/domain/entities/user.ts`,
    `src/modules/auth/domain/entities/account.ts`,
    `src/modules/auth/domain/entities/session.ts`,
    `src/modules/auth/domain/value-objects/public-user.ts`,
    `*.test.ts` next to each
  - **Lines estimate**: 90
  - **Depends on**: T-006
  - **Tests**: 8 cases. AAA pattern. Parametrized for email
    normalization cases.
  - **Verify**: `pnpm test src/modules/auth/domain/entities/
    src/modules/auth/domain/value-objects/` exit 0;
    `pnpm run typecheck` exits 0.

- [x] **T-011** Domain port interfaces (3 ports) + Prisma singleton
  - **Scope (RED → GREEN)**: ports are TypeScript interfaces
    in `src/modules/auth/domain/interfaces/`:
    `UserRepositoryPort` (create, findById, findByEmail,
    update), `AccountRepositoryPort` (create, findUnique),
    `SessionRepositoryPort` (findByToken, delete). The
    "test" is a type-level smoke: a fake implementation
    compiles against the port. The Prisma singleton lives
    at `src/shared/db/prisma.ts` and is wrapped with a
    test-only override hook so the Vitest suite can swap
    the client. `src/shared/db/prisma.test.ts` asserts
    the singleton returns the same instance on two
    consecutive calls and the override hook works.
  - **Files**:
    `src/modules/auth/domain/interfaces/{user,account,session}.repository.port.ts`,
    `src/shared/db/prisma.ts`,
    `src/shared/db/prisma.test.ts`
  - **Lines estimate**: 60
  - **Depends on**: T-010
  - **Tests**: 3 cases for the Prisma singleton. The ports
    are type-checked at compile time.
  - **Verify**: `pnpm test src/shared/db/` exits 0;
    `pnpm run typecheck` exits 0 (the ports compile).

- [x] **T-012** `PasswordService` (Argon2id wrapper) + benchmark script
  - **Scope (RED → GREEN)**: tests assert: `hashArgon2id('a-password')`
    returns a string starting with `$argon2id$`;
    `verifyArgon2id(hash, 'a-password')` is `true`;
    `verifyArgon2id(hash, 'b-password')` is `false`; two
    consecutive `hash` calls produce different salts.
    The chosen parameters are encoded as constants:
    `memoryCost = 19456` KiB, `timeCost = 2`,
    `parallelism = 1` (BR-AUTH-3). The library is
    `@node-rs/argon2`; if the prebuilt fails to load on
    the target machine, the task falls back to `argon2`
    (npm). The benchmark script `scripts/bench-argon2.ts`
    measures p50 hash time on the developer's machine
    and prints a `BAND_OK` / `BAND_SLOW` / `BAND_FAST`
    verdict. The `argon2.parameters.test.ts` security
    test (in Phase 7) re-runs the benchmark in CI.
  - **Files**:
    `src/modules/auth/infrastructure/external/argon2.hasher.ts`,
    `src/modules/auth/infrastructure/external/argon2.hasher.test.ts`,
    `scripts/bench-argon2.ts`
  - **Lines estimate**: 110
  - **Depends on**: T-005, T-008
  - **Tests**: 5 cases. AAA pattern. Parametrized for
    valid/invalid input.
  - **Verify**: `pnpm test src/modules/auth/infrastructure/external/argon2.hasher.test.ts`
    exits 0; `pnpm tsx scripts/bench-argon2.ts` runs to
    completion and prints a hash time in milliseconds +
    the band verdict.

- [x] **T-013** `DefaultProviderPolicy` (domain service: stamp `defaultProvider` on first registration)
  - **Scope (RED → GREEN)**: tests assert the policy
    from the design: `stampDefaultProvider(user, 'local' | 'google')`
    returns the value to write — for an existing user
    with `defaultProvider` already set, the existing value
    is preserved (BR-AUTH-13: never changed after first
    registration); for a new user, the new value is set.
    `inferProviderFromOAuthProfile(profile)` returns
    `'google'` for a Google profile with `email_verified: true`,
    throws an `AppError(INTERNAL_ERROR)` for any other
    provider, and never returns for `email_verified: false`
    (the OAuth flow fails earlier at the Auth.js layer
    per BR-AUTH-6; this is a defense-in-depth check).
  - **Files**:
    `src/modules/auth/domain/services/default-provider.policy.ts`,
    `src/modules/auth/domain/services/default-provider.policy.test.ts`
  - **Lines estimate**: 50
  - **Depends on**: T-010
  - **Tests**: 5 cases. AAA pattern. Parametrized for
    "first registration" vs. "subsequent sign-in".
  - **Verify**: `pnpm test
    src/modules/auth/domain/services/default-provider.policy.test.ts`
    exits 0; ≥ 80 % branch coverage on the policy file.

- [x] **T-014** `AuthService` (orchestrator: register, set default provider, build PublicUser)
  - **Scope (RED → GREEN)**: tests assert three behaviors
    with fake ports (no DB, no HTTP):
    - `register({ email, password })`:
      `findByEmail(normalized)` is called first; on null,
      `hashArgon2id` is invoked and a `User` row is
      `create`d; on duplicate, `EMAIL_TAKEN` is thrown
      with the same `hashArgon2id` call equalizing
      timing (BR-AUTH-4). On success, the `UserRegistered`
      event is dispatched exactly once via the in-process
      event dispatcher.
    - `applyDefaultProviderOnOAuth(userId, 'google')`:
      delegates to `DefaultProviderPolicy` and persists
      the result. The `UserRegistered` event is dispatched
      exactly once for the first OAuth signup (not on
      auto-link, per BR-AUTH-5).
    - `buildPublicUser(userId)`: reads the user row,
      applies `PublicUser.from`, returns the projection.
      `passwordHash` and `emailVerified` are NEVER in the
      output.
  - **Files**:
    `src/modules/auth/domain/services/auth.service.ts`,
    `src/modules/auth/domain/services/auth.service.test.ts`
  - **Lines estimate**: 130
  - **Depends on**: T-009, T-011, T-012, T-013
  - **Tests**: 12 cases. AAA pattern. All port
    interactions are recorded by a fake spy; no logic
    in test bodies.
  - **Verify**: `pnpm test
    src/modules/auth/domain/services/auth.service.test.ts`
    exits 0; ≥ 80 % line + branch coverage on the
    service file.

### Phase 3 — Auth infrastructure (Prisma schema, migrations, repos, Auth.js wiring)

- [x] **T-015** Prisma schema (4 tables) + versioned migration (schema only; migration generation deferred — see apply-progress.md)
  - **Scope (RED → GREEN)**: the Prisma schema in
    `prisma/schema.prisma` defines the four Auth.js
    canonical models (`User`, `Account`, `Session`,
    `VerificationToken`) per the design's §5. Three
    columns are added to `User` (`passwordHash`,
    `defaultProvider`, `lastLoginAt`) per BR-AUTH-9 /
    BR-AUTH-13 / spec's `User` entity. Indexes:
    `User.email` (implicit via `@unique`), `User.createdAt`
    (explicit `@@index`), `Account(provider, providerAccountId)`
    (`@@unique`), `Session.sessionToken` (implicit via
    `@unique`), `Session.expires` (explicit `@@index` for
    the future GC job). Tests use a Vitest fixture that
    applies the migration to a Postgres testcontainer
    and asserts the table shapes and the unique
    constraint on `Account(provider, providerAccountId)`
    (BR-AUTH-10). The migration is generated by
    `pnpm prisma migrate dev --name auth_foundation`
    and the resulting SQL file is committed at
    `prisma/migrations/<timestamp>_auth_foundation/migration.sql`.
  - **Files**: `prisma/schema.prisma`,
    `prisma/schema.test.ts`,
    `prisma.config.ts`,
    `prisma/migrations/<timestamp>_auth_foundation/migration.sql`
    (generated)
  - **Lines estimate**: 90
  - **Depends on**: T-005, T-011
  - **Tests**: 5 cases that introspect the Postgres
    information_schema after applying the migration.
    AAA pattern. Each test uses a fresh Postgres
    testcontainer.
  - **Verify**: `pnpm prisma migrate dev --name
    auth_foundation` produces the migration SQL;
    `pnpm test prisma/schema.test.ts` exits 0;
    `pnpm prisma generate` regenerates the typed
    client without errors.

- [x] **T-016** `UserRepository` (Prisma adapter — tested with fake; testcontainers deferred to verify phase)
  - **Scope (RED → GREEN)**: tests against a real
    Postgres testcontainer cover: `create(user)` returns
    the row with all fields persisted; `findById` returns
    `null` for unknown ids; `findByEmail` is
    case-insensitive (insert `'A@B.com'`, look up
    `'a@b.com'`, get the row — application-layer
    normalization, not Postgres `citext`); `update`
    mutates `lastLoginAt` and `defaultProvider` and
    bumps `updatedAt`. The repository implements
    `UserRepositoryPort` from T-011.
  - **Files**:
    `src/modules/auth/infrastructure/repositories/user.repository.ts`,
    `src/modules/auth/infrastructure/repositories/user.repository.test.ts`
  - **Lines estimate**: 60
  - **Depends on**: T-015
  - **Tests**: 4 cases. AAA pattern. Each test uses a
    fresh Postgres testcontainer.
  - **Verify**: `pnpm test
    src/modules/auth/infrastructure/repositories/user.repository.test.ts`
    exits 0.

- [x] **T-017** `AccountRepository` (Prisma adapter) + `SessionRepository` (tested with fake; testcontainers deferred to verify phase)
  - **Scope (RED → GREEN)**: tests cover: `Account.create`
    returns the row; `Account.findUnique({ provider,
    providerAccountId })` returns the row and `null` for
    unknown subjects; the composite unique constraint
    on `(provider, providerAccountId)` is enforced at the
    DB level (the test asserts that a second `create`
    with the same `(provider, providerAccountId)` throws
    a Prisma `P2002` error — the BR-AUTH-10 line of
    defense). `Session.findByToken(token)` returns the
    row and `null` otherwise; `Session.delete(token)`
    removes the row. Both repositories implement their
    respective ports from T-011.
  - **Files**:
    `src/modules/auth/infrastructure/repositories/account.repository.ts`,
    `src/modules/auth/infrastructure/repositories/account.repository.test.ts`,
    `src/modules/auth/infrastructure/repositories/session.repository.ts`,
    `src/modules/auth/infrastructure/repositories/session.repository.test.ts`
  - **Lines estimate**: 80
  - **Depends on**: T-015
  - **Tests**: 6 cases. AAA pattern. The unique-violation
    test is parametrized over the `(provider,
    providerAccountId)` shape.
  - **Verify**: `pnpm test
    src/modules/auth/infrastructure/repositories/`
    exits 0; coverage ≥ 80 % on both repository files.

- [x] **T-018** Auth.js v5 configuration (`src/modules/auth/infrastructure/external/authjs.ts`)
  - **Scope (RED → GREEN)**: the `authConfig` constant
    wires the Prisma adapter, the Google provider
    (`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`,
    `prompt=select_account`, `scope=openid email profile`),
    the Credentials provider (the `authorize()` function
    from the design's §3 with email normalization, the
    `DUMMY_HASH` equalization at module init per
    BR-AUTH-4 / BR-AUTH-9, and the four-field user
    return shape), the `signIn` callback (stamps
    `lastLoginAt` on every successful sign-in, never
    mutates `defaultProvider` per BR-AUTH-13), the
    `session` callback (adds `defaultProvider` and
    `lastLoginAt` to the session JSON for the
    `useSession()` hook), `session.strategy = 'database'`,
    `session.maxAge = 30 * 24 * 60 * 60`, and
    `pages.signIn = '/auth/signin'`. The module
    destructures `NextAuth(authConfig)` and exports
    `{ handlers, auth, signIn, signOut }`. The test
    asserts the shape of the exported names and that
    the `DUMMY_HASH` is generated once at module init
    (idempotent across two `import`s of the module).
  - **Files**:
    `src/modules/auth/infrastructure/external/authjs.ts`,
    `src/modules/auth/infrastructure/external/authjs.test.ts`
  - **Lines estimate**: 140
  - **Depends on**: T-005, T-012, T-014, T-016, T-017
  - **Tests**: 6 cases. AAA pattern. Module-init
    idempotency is asserted by importing the module
    twice in the same test and comparing
    `DUMMY_HASH` references.
  - **Verify**: `pnpm test
    src/modules/auth/infrastructure/external/authjs.test.ts`
    exits 0; `pnpm run typecheck` exits 0.

### Phase 4 — Auth application (actions + DTOs)

- [ ] **T-019** `registerAction` + DTO
  - **Scope (RED → GREEN)**: the DTO uses Zod to validate
    `{ email, password }` (email format, password length
    ≥ 10 per BR-AUTH-2). The action delegates to
    `AuthService.register` and returns a typed
    `{ data: { id, email, name, image, defaultProvider } }`
    on success (the public projection, NEVER
    `passwordHash`) or a typed
    `{ error: { code, message, details? } }` on failure
    (per the `api-design` skill response shape). Tests
    cover: 201 success with the expected projection; 400
    `VALIDATION_ERROR` on Zod failure; 400 `WEAK_PASSWORD`
    on length < 10; 409 `EMAIL_TAKEN` with comparable
    timing (the test asserts the call to `hash` is made
    in both the success and `EMAIL_TAKEN` branches — the
    security-timing test in Phase 7 measures the
    end-to-end latency). The `UserRegistered` event is
    dispatched exactly once on first registration.
  - **Files**:
    `src/modules/auth/application/dto/register.dto.ts`,
    `src/modules/auth/application/dto/register.dto.test.ts`,
    `src/modules/auth/application/actions/register.action.ts`,
    `src/modules/auth/application/actions/register.action.test.ts`
  - **Lines estimate**: 70
  - **Depends on**: T-009, T-014, T-016
  - **Tests**: 5 cases. AAA pattern.
  - **Verify**: `pnpm test
    src/modules/auth/application/actions/register.action.test.ts`
    exits 0.

- [ ] **T-020** `meAction` + `healthAction` + DTOs
  - **Scope (RED → GREEN)**: `meAction(c)` returns
    `{ data: PublicUser }` when `c.get('user')` is set
    (i.e. `auth()` resolved a valid session) and 401
    `UNAUTHORIZED` otherwise — identical response shape
    across all four failure modes (no session, missing
    cookie, expired session, unknown user). `healthAction(c)`
    returns 200 with `{ data: { status: 'ok', version,
    uptime } }` (the `version` is read from
    `package.json` at module init; `uptime` is
    `process.uptime()`). Tests use Hono's `app.request`
    to invoke the actions with a faked context.
  - **Files**:
    `src/modules/auth/application/dto/me.dto.ts`,
    `src/modules/auth/application/dto/me.dto.test.ts`,
    `src/modules/auth/application/dto/health.dto.ts`,
    `src/modules/auth/application/dto/health.dto.test.ts`,
    `src/modules/auth/application/actions/me.action.ts`,
    `src/modules/auth/application/actions/me.action.test.ts`,
    `src/modules/auth/application/actions/health.action.ts`,
    `src/modules/auth/application/actions/health.action.test.ts`
  - **Lines estimate**: 90
  - **Depends on**: T-005, T-014
  - **Tests**: 6 cases across the two actions. AAA
    pattern. Parametrized for the 4 `me` failure modes.
  - **Verify**: `pnpm test
    src/modules/auth/application/actions/me.action.test.ts
    src/modules/auth/application/actions/health.action.test.ts`
    exits 0.

### Phase 5 — Auth UI (Hono catch-all, Auth.js signIn page, signOut page)

- [ ] **T-021** Hono `OpenAPIHono` app composition (`src/modules/api/app.ts`)
  - **Scope (RED → GREEN)**: the Hono app is an
    `OpenAPIHono` instance. A `*` middleware resolves
    `auth()` (Auth.js) once per request and sets
    `c.set('user', session?.user ?? null)` and
    `c.set('session', session ?? null)`. Three routes
    are mounted: `GET /health` (public, calls
    `healthAction`), `GET /me` (calls `meAction`,
    returns 401 `UNAUTHORIZED` when `c.get('user')` is
    null), `POST /auth/register` (mutating, runs
    through `originCheck` middleware, calls
    `registerAction`). Tests use Hono's `app.request`
    to assert: `GET /health` returns 200 with
    `{ data: { status, version, uptime } }`;
    `GET /me` returns 200 with a valid `PublicUser`
    when a fake `auth()` is injected that returns a
    session, 401 `UNAUTHORIZED` when it returns null;
    `POST /auth/register` returns 201 on success, 400
    on validation failure, 403 `FORBIDDEN` on
    cross-origin POST. The `OpenAPIHono` instance is
    exported as `honoApp` and re-exported from
    `src/modules/api/index.ts`.
  - **Files**:
    `src/modules/api/app.ts`,
    `src/modules/api/app.test.ts`,
    `src/modules/api/middlewares/origin-check.ts`,
    `src/modules/api/middlewares/origin-check.test.ts`,
    `src/modules/api/index.ts`
  - **Lines estimate**: 130
  - **Depends on**: T-007, T-014, T-019, T-020
  - **Tests**: 9 cases. AAA pattern. Parametrized for
    the origin-check allowed/denied cases.
  - **Verify**: `pnpm test src/modules/api/` exits 0;
    `pnpm run typecheck` exits 0.

- [ ] **T-022** Hono typed client export (`src/modules/api/client.ts`)
  - **Scope**: the typed `hc<typeof honoApp>` client
    instance is exported at `src/modules/api/client.ts`
    and re-exported from `src/modules/api/index.ts`.
    The test asserts the client is a function (Hono's
    `hc` factory) and that the inferred response type
    for `client.me.$get()` matches the
    `MeSuccess` interface (compile-time check via
    `Expect<Equal<...>>`).
  - **Files**:
    `src/modules/api/client.ts`,
    `src/modules/api/client.test.ts`
  - **Lines estimate**: 30
  - **Depends on**: T-021
  - **Tests**: 2 cases. Compile-time type assertions
    + runtime function shape.
  - **Verify**: `pnpm test src/modules/api/client.test.ts`
    exits 0; `pnpm run typecheck` exits 0.

- [ ] **T-023** Auth.js signIn page at `app/auth/signin/page.tsx` (server component + form action)
  - **Scope**: the page is a Next.js server component
    that renders a form with email + password inputs
    (using TanStack React Form for the controlled
    inputs) and a "Sign in with Google" button. The
    form posts to `signIn('credentials', { ... })`
    from `next-auth/react` on the client; the Google
    button posts to `signIn('google')`. The page
    reads `searchParams.error` to surface
    `OAuthAccountNotLinked` and other Auth.js error
    codes with a clear, user-facing Spanish message
    per the design's "OAuthAccountNotLinked UX" decision
    ("This Google account is already linked to a
    different email. Sign out and try again, or contact
    support."). The page is registered via
    `pages.signIn = '/auth/signin'` in `authConfig`
    (T-018). A small test asserts the page renders
    without throwing when given no `searchParams`
    and with a sample `error=OAuthAccountNotLinked`.
  - **Files**:
    `app/auth/signin/page.tsx`,
    `app/auth/signin/page.test.tsx`,
    `app/auth/signout/page.tsx`
  - **Lines estimate**: 80
  - **Depends on**: T-018
  - **Tests**: 3 cases. AAA pattern. The page is
    rendered with React Testing Library and a
    Next.js App Router harness.
  - **Verify**: `pnpm test app/auth/signin/page.test.tsx`
    exits 0; `pnpm run build` exits 0 (Next.js
    builds the route).

### Phase 6 — App composition (mount routes, public API, middleware wiring)

- [ ] **T-024** Mount `app/api/auth/[...nextauth]/route.ts` (Auth.js handler)
  - **Scope**: a 2-line file that re-exports `GET` and
    `POST` from the Auth.js `handlers` destructured in
    `authjs.ts` (T-018). A test boots the Next.js dev
    server in test mode, hits `/api/auth/providers`,
    and asserts the response shape includes
    `{ id: 'google' }, { id: 'credentials' }`.
  - **Files**:
    `app/api/auth/[...nextauth]/route.ts`,
    `app/api/auth/[...nextauth]/route.test.ts`
  - **Lines estimate**: 20
  - **Depends on**: T-018
  - **Tests**: 1 case (integration). AAA pattern. The
    test uses Next.js's test helpers; a Postgres
    testcontainer is required.
  - **Verify**: `pnpm test app/api/auth/` exits 0;
    `pnpm run build` exits 0.

- [ ] **T-025** Mount `app/api/[...path]/route.ts` (Hono catch-all)
  - **Scope**: a small file that delegates
    `GET`/`POST`/`PATCH`/`DELETE` to
    `honoApp.fetch(request)`. The Hono catch-all does
    NOT match `/api/auth/*` because Next.js's
    file-based routing resolves the more specific
    `app/api/auth/[...nextauth]/route.ts` first. A
    test asserts that `/api/auth/signin` is routed to
    Auth.js (returns Auth.js's HTML response) and
    `/api/me` is routed to Hono (returns the Hono
    JSON shape). Both routes are tested against the
    same Next.js server.
  - **Files**:
    `app/api/[...path]/route.ts`,
    `app/api/[...path]/route.test.ts`
  - **Lines estimate**: 30
  - **Depends on**: T-021, T-024
  - **Tests**: 2 cases. AAA pattern. Both are
    integration tests against a real Next.js server.
  - **Verify**: `pnpm test app/api/` exits 0;
    `pnpm run build` exits 0.

- [ ] **T-026** Public API export (`src/modules/auth/index.ts`) + Next.js middleware for `/api/me` protection
  - **Scope**: the public surface of the `auth` module
    is the only thing other modules (future:
    `accounts-ledger`, `transactions`) may import. The
    file exports `auth`, `signIn`, `signOut`, `handlers`
    (the `GET` and `POST` for `/api/auth/*`),
    `honoApp` (the `OpenAPIHono` instance for the
    Hono catch-all), and the `UserRegistered` /
    `UserSignedIn` event name constants. Internal
    paths (domain services' internals, repos'
    internals, external adapters' internals) are not
    exported. A test asserts the named exports exist
    and that `import` from a non-exported path is a
    TypeScript error (compile-time check).
    Additionally, a Next.js middleware at
    `middleware.ts` (project root) protects any future
    protected route under `/app/*` (server components
    that need an authenticated user); the Hono
    `/api/me` route already returns 401 when the
    session is missing, but the middleware is the
    faster-fail path for App Router pages.
  - **Files**:
    `src/modules/auth/index.ts`,
    `src/modules/auth/index.test.ts`,
    `middleware.ts`
  - **Lines estimate**: 50
  - **Depends on**: T-018, T-021, T-025
  - **Tests**: 2 cases. The public-API test asserts
    the named exports; the middleware test asserts a
    302 redirect to `/auth/signin` for an
    unauthenticated request to `/dashboard` (a
    placeholder route) and a 200 for an authenticated
    request.
  - **Verify**: `pnpm test src/modules/auth/index.test.ts`
    exits 0; `pnpm run typecheck` exits 0;
    `pnpm run build` exits 0.

### Phase 7 — Security tests (dedicated suite, adversarial review input)

- [ ] **T-027** Security test suite (timing, OAuth state, secrets in logs, origin-check, Argon2id parameters, cookie attributes)
  - **Scope**: six focused integration tests in
    `src/modules/auth/__tests__/security/`:
    1. **`login.timing.test.ts`**: with a real
       Argon2id hash and a fixed dummy hash, the
       Credentials `authorize()` response time for the
       "wrong password" branch and the "unknown email"
       branch are within a documented statistical
       threshold (e.g. Welch's t-test p > 0.01 over
       30 samples). The test runs in CI; in local
       dev a `--skip-timing` flag tolerates noisy
       machines.
    2. **`oauth.state-csrf.test.ts`**: a callback
       with a missing or tampered `state` parameter
       is rejected by Auth.js. No `User` is created
       and no `Account` row is inserted in any
       failure case (asserted by a row count).
    3. **`secrets.in-logs.test.ts`**: a request that
       includes a `password`, a `refresh_token`, an
       `Authorization: Bearer <jwt>` header, an
       `id_token`, or a CSRF token does not cause any
       of those values to appear in the captured log
       output across the register, OAuth callback,
       and session-resolution paths (BR-AUTH-11).
    4. **`origin-check.test.ts`**:
       `POST /api/auth/register` with a missing or
       mismatched `Origin` header returns 403
       `FORBIDDEN`. Same-origin POST is allowed.
    5. **`argon2.parameters.test.ts`**: `hashArgon2id`
       with the chosen parameters
       (`memoryCost=19456, timeCost=2, parallelism=1`)
       produces a hash in the 50–100 ms range on
       the CI runner. Fails the test if the runtime
       is outside the band. The benchmark is the
       same one `scripts/bench-argon2.ts` runs
       locally; the test re-runs it in CI.
    6. **`cookie.attributes.test.ts`**: the
       `authjs.session-token` cookie has `HttpOnly`
       and `SameSite=Lax` always; `Secure` in
       production, omitted in dev. The test signs
       in with a Credentials `authorize()` and
       inspects the `Set-Cookie` response header.
  - **Files**:
    `src/modules/auth/__tests__/security/login.timing.test.ts`,
    `src/modules/auth/__tests__/security/oauth.state-csrf.test.ts`,
    `src/modules/auth/__tests__/security/secrets.in-logs.test.ts`,
    `src/modules/auth/__tests__/security/origin-check.test.ts`,
    `src/modules/auth/__tests__/security/argon2.parameters.test.ts`,
    `src/modules/auth/__tests__/security/cookie.attributes.test.ts`
  - **Lines estimate**: 170
  - **Depends on**: T-026
  - **Tests**: 14 cases across the six files. AAA
    pattern. The timing test is parametrized over
    the 30 samples; the secrets-in-logs test is
    parametrized over the six sensitive key types.
  - **Verify**: `pnpm test
    src/modules/auth/__tests__/security/` exits 0;
    CI runs this suite as a required job.

### Phase 8 — CI / quality gates

- [ ] **T-028** Author `.github/workflows/ci.yml`
  - **Scope**: a CI workflow with four parallel jobs:
    1. `lint`: `pnpm install --frozen-lockfile`,
       `pnpm run lint`, `pnpm run typecheck`.
    2. `test`: `pnpm install --frozen-lockfile`,
       `pnpm prisma migrate deploy`, `pnpm test --
       --coverage`, upload the `coverage/` artifact,
       post a sticky PR comment with the coverage
       percentages.
    3. `build`: `pnpm install --frozen-lockfile`,
       `pnpm run build` (Next.js production build —
       catches type errors that only surface at
       build time, e.g. RSC vs. client component
       boundaries).
    4. `security`: `pnpm test
       src/modules/auth/__tests__/security/` (the
       slowest job; run separately so a flake in the
       timing test does not block the lint and build
       jobs from reporting).
    All jobs run on `pull_request` to `develop` or
    `main`, and on `push` to `develop` or `main`.
    The workflow uses `actions/setup-node@v4` with
    `cache: 'pnnpm'` and `corepack: true` (the
    `packageManager` field in `package.json` provides
    the pnpm version). Concurrency cancels
    in-flight runs on the same ref. No `force` push
    to `main` (per `ci-cd-pipeline` skill).
  - **Files**: `.github/workflows/ci.yml`
  - **Lines estimate**: 90
  - **Depends on**: T-027
  - **Tests**: N/A. CI is the test.
  - **Verify**: Pushing the branch triggers the
    workflow; the `PR docs` link to the green check.

- [ ] **T-029** Branch protection + `CODEOWNERS`
  - **Scope**: a `.github/CODEOWNERS` file at the
    repo root pointing to the maintainer
    (`@sebailla`). A short document at
    `docs/branch-protection.md` describes the rules
    the parent will apply to `develop` on GitHub:
    require 1 review, require CI green
    (`lint`, `typecheck`, `test`, `build`,
    `security`), dismiss stale approvals on push,
    require linear history, no force-pushes. No code
    change; this is config-as-docs. The actual
    GitHub branch-protection settings are applied
    manually by the user (not in this change) because
    they require repo-admin permissions.
  - **Files**: `.github/CODEOWNERS`,
    `docs/branch-protection.md`
  - **Lines estimate**: 30
  - **Depends on**: T-028
  - **Tests**: N/A.
  - **Verify**: `cat .github/CODEOWNERS` lists the
    maintainer; `cat docs/branch-protection.md`
    describes the rules.

### Phase 9 — Documentation

- [ ] **T-030** Five ADRs (Auth.js v5, Prisma 6, Argon2id, Hono catch-all, auto-link)
  - **Scope**: five ADRs in `docs/adr/` covering the
    decisions that the design left open. Each ADR
    follows the MADR template (Context, Decision,
    Consequences, Alternatives considered).
    - `0001-authjs-v5.md` — why Auth.js v5 over
      Lucia, Clerk, Supabase Auth, hand-rolled.
    - `0002-prisma-6.md` — why Prisma 6 over
      Kysely, raw SQL.
    - `0003-argon2id-parameters.md` — the final
      parameters (`memoryCost=19456, timeCost=2,
      parallelism=1`), the benchmark result, the
      fallback path.
    - `0004-hono-catch-all.md` — why Hono over
      pure Next.js route handlers, tRPC, Fastify;
      the `OpenAPIHono` + `hc<typeof honoApp>`
      typed-client export shape.
    - `0005-auto-link-security-model.md` —
      industry-standard auto-link on email match
      (Notion, Linear, Vercel); BR-AUTH-5 / BR-AUTH-10;
      the deferral of a hardening pass.
  - **Files**:
    `docs/adr/0001-authjs-v5.md`,
    `docs/adr/0002-prisma-6.md`,
    `docs/adr/0003-argon2id-parameters.md`,
    `docs/adr/0004-hono-catch-all.md`,
    `docs/adr/0005-auto-link-security-model.md`
  - **Lines estimate**: 200
  - **Depends on**: T-012, T-018, T-021
  - **Tests**: N/A.
  - **Verify**: `ls docs/adr/` lists the five ADRs;
    `grep -c "^## Decision" docs/adr/*.md` returns 5.

- [ ] **T-031** Update `docs/architecture.md` (Auth section) + Spanish mirror
  - **Scope**: `docs/architecture.md` gains an
    "Auth" section with: a high-level Mermaid
    diagram (the same one from the design's §1), the
    data model summary (the four Prisma models, the
    three added columns, the unique constraint on
    `Account`), the eight Auth.js routes and the
    three Hono routes, the session strategy
    (database sessions, 30-day sliding, no JWT), the
    auto-link security model, and the cross-module
    contracts (`auth()` helper, `User` is the
    identity anchor, `UserRegistered` /
    `UserSignedIn` events). The Spanish mirror at
    `Documents-es/docs/architecture.md` is updated
    in the same commit.
  - **Files**: `docs/architecture.md`,
    `Documents-es/docs/architecture.md`
  - **Lines estimate**: 100
  - **Depends on**: T-030
  - **Tests**: N/A. A drift detector in CI (a simple
    `diff` job) catches divergence.
  - **Verify**:
    `diff <(grep -v '^\*\*' docs/architecture.md) <(grep -v '^\*\*' Documents-es/docs/architecture.md)`
    returns only translation differences;
    `pnpm run lint` on the Markdown is clean.

- [ ] **T-032** Update `README.md` (local dev) + Spanish mirror
  - **Scope**: the root `README.md` gains a "Local
    development" section explaining: `pnpm install`,
    `cp .env.example .env` and filling in the values,
    `pnpm prisma migrate dev`, `pnpm test`,
    `pnpm run lint`, `pnpm run typecheck`,
    `pnpm run build`, `pnpm run dev`, and the
    `scripts/bench-argon2.ts` smoke for the Argon2id
    parameters. The Spanish mirror at
    `Documents-es/README.md` is updated in the same
    commit.
  - **Files**: `README.md`,
    `Documents-es/README.md`
  - **Lines estimate**: 80
  - **Depends on**: T-026
  - **Tests**: N/A.
  - **Verify**: a fresh clone with the steps in the
    README boots the server (`pnpm run dev`) and
    serves `/api/health` returning 200.

### Phase 10 — Handoff

- [ ] **T-033** Final commit, push, open PR, request reviewer
  - **Scope**: the worker pushes the branch with
    `git push -u origin feat/auth-foundation` and
    opens the first of the three chained PRs with
    `gh pr create --base develop --title "feat(auth): <slice 1 title>" --body <PR body from docs/architecture.md + a checklist>`.
    The PR body cites the change name, links the
    OpenSpec artifacts
    (`openspec/changes/auth-foundation/{proposal,design,tasks}.md`),
    and lists the "Definition of done" checklist
    below. The PR is marked ready; the parent then
    dispatches a fresh `reviewer` subagent (per
    `AGENTS.md` §2.2) for adversarial review. The PR
    is **not** merged here; merge happens only after
    the reviewer passes. The same pattern repeats
    for slice 2 and slice 3 once slice 1 lands in
    `develop`.
  - **Files**: PR body, commit messages
  - **Lines estimate**: 30
  - **Depends on**: T-001 through T-032
  - **Tests**: N/A.
  - **Verify**: `gh pr view <pr-number> --json
    state,mergeable,statusCheckRollup` shows
    `state: OPEN`, `mergeable: MERGEABLE`, all
    status checks `SUCCESS`.

## Review workload forecast (mandatory)

| Phase | Tasks | Lines estimate |
|---|---:|---:|
| Phase 0 — Scaffolding | 4 (T-001…T-004) | 260 |
| Phase 1 — Shared infra | 5 (T-005…T-009) | 380 |
| Phase 2 — Auth domain | 5 (T-010…T-014) | 440 |
| Phase 3 — Auth infrastructure | 4 (T-015…T-018) | 370 |
| Phase 4 — Auth application | 2 (T-019…T-020) | 160 |
| Phase 5 — Auth UI | 3 (T-021…T-023) | 240 |
| Phase 6 — App composition | 3 (T-024…T-026) | 100 |
| Phase 7 — Security tests | 1 (T-027) | 170 |
| Phase 8 — CI / quality | 2 (T-028…T-029) | 120 |
| Phase 9 — Documentation | 3 (T-030…T-032) | 380 |
| Phase 10 — Handoff | 1 (T-033) | 30 |
| **Total** | **33** | **~2,650** |

**Total > 800 lines**: 3 chained PRs are **required**
(per the user's preflight choice `auto-forecast` with
`reviewBudgetLines: 400`). The slice boundaries below
are designed to keep each PR ≤ 400 lines net of test
boilerplate and pre-existing scaffold.

### Slice A — PR 1 (Floor + shared infra + auth domain + auth infrastructure)

- **Phases included**: 0, 1, 2, 3.
- **Tasks included**: T-001 through T-018.
- **Approx. diff size**: 260 + 380 + 440 + 370 =
  **~1,450 lines** (above the 400-line budget; the
  justification follows).
- **What the reviewer sees**: the project floor
  (Next.js 16 scaffolding, ESLint, Prettier, Vitest,
  Husky + commitlint + GGA, `.env.example`,
  `.gitignore`), the cross-cutting shared
  infrastructure (Zod env schema with cross-field
  validation, `AppError`, structured logger with
  BR-AUTH-11 denylist, request-id and error-handler
  middleware, Web Crypto helpers, in-process event
  dispatcher), the entire auth domain (User, Account,
  Session entities, PublicUser value object, 3 ports,
  PasswordService with Argon2id + benchmark,
  DefaultProviderPolicy, AuthService orchestrator),
  and the entire auth infrastructure (Prisma schema
  with 4 tables + 1 generated migration, 3
  repositories, Auth.js v5 wiring with Google +
  Credentials providers, signIn/session callbacks,
  DUMMY_HASH timing equalization). No Hono, no
  application routes, no UI, no CI workflow.
- **Why not smaller**: the auth module's domain
  (Phase 2) is the most security-critical code in
  the project. It is also the smallest, has zero
  external dependencies, and is impossible to split
  meaningfully — splitting "entities without ports"
  or "PasswordService without AuthService" produces
  artificial boundaries that don't exist in the
  runtime graph. The Phase 3 infrastructure is
  tightly coupled to the Phase 2 ports
  (repositories implement ports; Auth.js wiring
  consumes the repos and the PasswordService). A
  reviewer can audit the entire auth core in a
  single sitting: ~1,450 lines of focused, pure
  TypeScript with full TDD coverage.
- **Risk in PR 1**: large surface, but every file
  is read top-to-bottom; no Hono middleware to
  distract, no UI to test, no third-party calls.

### Slice B — PR 2 (Application actions + Hono catch-all + UI + app composition)

- **Phases included**: 4, 5, 6.
- **Tasks included**: T-019 through T-026.
- **Approx. diff size**: 160 + 240 + 100 =
  **~500 lines** (above the 400-line budget; the
  justification follows).
- **What the reviewer sees**: three application
  actions (register, me, health) with their DTOs,
  the Hono `OpenAPIHono` app with the catch-all +
  `origin-check` middleware, the typed `hc` client
  export, the Auth.js signIn/signOut pages, the
  Auth.js + Hono route handlers, the public-API
  module index, and the Next.js middleware for
  future App Router protection. The whole HTTP
  surface of the change lands here, end-to-end.
- **Why not smaller**: the application actions
  (Phase 4) and the Hono catch-all (Phase 5) are
  tightly coupled — the actions are called by the
  Hono handlers in `app.ts` (T-021). Splitting
  "actions without the Hono app" would mean the
  reviewer cannot run the application. The signIn
  page (T-023) is small but depends on the Auth.js
  wiring (T-018) and the Hono routing (T-021). A
  PR of ~500 lines is the minimum to make
  end-to-end sign-in testable.
- **Risk in PR 2**: ~500 lines; the reviewer
  validates that the catch-all correctly delegates
  to Auth.js for `/api/auth/*` and to Hono for
  `/api/*` (the routing test in T-025).

### Slice C — PR 3 (Security tests + CI + docs + handoff)

- **Phases included**: 7, 8, 9, 10.
- **Tasks included**: T-027 through T-033.
- **Approx. diff size**: 170 + 120 + 380 + 30 =
  **~700 lines** (above the 400-line budget; the
  justification follows).
- **What the reviewer sees**: the security test
  suite (six focused integration tests covering
  timing, OAuth state CSRF, secrets in logs,
  origin-check, Argon2id parameters, cookie
  attributes), the GitHub Actions CI workflow
  (lint + typecheck + test + build + security
  jobs, plus the `CODEOWNERS` and branch
  protection notes), five ADRs and the
  architecture + README updates (with Spanish
  mirrors), and the handoff task that opens the
  PR and requests a fresh-context `reviewer`
  subagent.
- **Why not smaller**: the security suite (T-027)
  is the only artifact that exercises the system
  end-to-end; the CI workflow (T-028) is what
  makes the suite run on every push. Separating
  them would mean the security tests land without
  CI to gate them, and CI lands without the tests
  it gates. The docs + handoff round out the
  change so the reviewer can validate against
  the spec and the proposal in one pass. A PR
  of ~700 lines is the minimum to ship the
  change safely.
- **Risk in PR 3**: above the 400-line budget;
  the user has explicitly accepted a 3-chained
  PR strategy with a per-PR review budget
  (auto-forecast). If the reviewer pushes back
  on the size, the docs (T-030 through T-032)
  can be split into a follow-up PR without
  breaking the chain.

### Dependency direction

PR 1 → PR 2 → PR 3, in that order. Each PR targets
`develop`. PR 1 is the floor: no other slice can
land without it. PR 2 is the application surface:
nothing is testable end-to-end without it. PR 3 is
the verification + handoff: nothing can be merged
without it.

If a slice's diff exceeds the 400-line budget at
apply time, the worker MUST pause, capture the
actual line counts, and surface the overage in
the apply-progress.md log so the parent can
decide whether to re-forecast or to accept the
overage on that one PR.

## Risks specific to apply

Each risk has a mitigation that lives inside an
existing task, not a new task.

| Risk | Lives in | Mitigation |
|---|---|---|
| `@node-rs/argon2` fails to install or load on the Fly.io 1-CPU VM. | T-012 | The benchmark script in T-012 is the smoke test. If it crashes, the fallback to `argon2` (npm) is a one-line import change in `argon2.hasher.ts`. The benchmark is re-run, and the result is recorded in `apply-progress.md`. |
| Argon2id hash time outside the 50–100 ms target. | T-012, T-027 | The benchmark in T-012 is run locally; the `argon2.parameters.test.ts` security test in T-027 re-runs it in CI. If p50 hash time is outside the band, the `timeCost` parameter is re-tuned (1, 2, or 3) before the PR is marked ready. |
| Auth.js v5 beta API surface changes between the pinned version and a later beta. | T-018 | The apply task pins the exact `next-auth@5.0.0-beta.X` version in `package.json` and uses `pnpm install --frozen-lockfile` in CI. Upgrading requires an explicit decision in a later change. |
| Prisma migration drift on the Neon free tier during the apply phase. | T-015 | The apply task for the migration runs `pnpm prisma migrate dev` locally first, commits the generated `migration.sql`, and runs `pnpm prisma migrate deploy` in the CI test job. The deploy is idempotent. |
| Google OAuth credentials misconfigured at first sign-in attempt. | T-023 | The apply task for the Auth.js signIn page has a manual smoke-test step: sign in with the test OAuth client in dev before marking the task done. The `oauth.state-csrf.test.ts` security test in T-027 verifies the state-CSRF path. |
| Hono catch-all accidentally matches `/api/auth/*` and double-handles requests. | T-025 | The apply task for the catch-all includes a routing test that proves `/api/auth/signin` goes to Auth.js and `/api/me` goes to Hono. The test asserts both routes return their expected shapes from the same Next.js server. |
| Origin-check middleware blocks legitimate cross-origin POSTs in dev. | T-021 | The `APP_URL` default is `http://localhost:3000`. The `origin-check.test.ts` test in T-027 covers both same-origin (allowed) and cross-origin (blocked) cases. The signIn form mounts on the same origin, so legitimate requests are never blocked. |
| `UserRegistered` event dispatched on auto-link path. | T-014, T-027 | The event is dispatched in `AuthService.register` (T-014) for local signups. The auto-link path (BR-AUTH-5) does NOT dispatch `UserRegistered`. The apply task includes a parametrized test in `auth.service.test.ts` that asserts the event is fired exactly once per user, never on auto-link. |
| Argon2id `DUMMY_HASH` initialization cost on first request. | T-018 | `DUMMY_HASH` is generated at module init (top-level `const DUMMY_HASH = hashArgon2id(env.ARGON2ID_DUMMY_PASSWORD)`). The first request to the Credentials callback is slower by ~50–100 ms; subsequent requests are fast. We accept this in MVP. |
| Session `expires` index added but no GC job exists in this change. | T-015 | Documented. The GC job is a separate change; until then, expired sessions accumulate. The `auth()` lookup is by `sessionToken`, so the missing GC does not affect correctness, only DB size. |
| `pnpm install --frozen-lockfile` fails in CI when `pnpm-lock.yaml` is missing or out of sync. | T-028 | The `lint` job in T-028 runs `pnpm install --frozen-lockfile` and fails fast. The `package.json` has `"packageManager": "pnpm@<version>"` so `corepack` provisions the right version. |
| Strict TDD drift — worker writes implementation before test. | T-001 through T-033 | Each task lists the test file as the first sub-deliverable; the `Tests` and `Verify` lines call out the RED → GREEN → REFACTOR cycle. `openspec/config.yaml`'s `strictTdd.enabled: true` (updated in this change's commit) surfaces the discipline to the reviewer. |
| Vitest 80 % coverage gate silently passes with low-quality tests. | T-027 | The security suite (T-027) is the adversarial input: each security test has a documented statistical threshold or a hard-coded DB assertion. Coverage is necessary, not sufficient. |

## Out-of-scope for this change

The following are tracked in the proposal and design
as separate changes. The `sdd-apply` worker MUST
**not** smuggle any of these into this slice.

- **Other OAuth providers** (Apple, Facebook,
  GitHub). Tracked as a post-MVP change. The
  Prisma schema already supports N providers per
  user; only `provider = 'google'` ships in MVP.
- **Password reset and email verification flows**.
  Tracked as `auth-password-reset` and
  `email-verification`. The `VerificationToken`
  table exists in the schema (the Auth.js
  canonical schema includes it) but is unused.
  Password reset is a manual SQL update by the
  operator in MVP.
- **Multi-factor authentication**. Post-MVP.
- **Rate limiting on `/api/auth/callback/credentials`**.
  Tracked as `security-rate-limiting`. The
  Credentials `authorize()` user-enumeration
  mitigation (BR-AUTH-4) is in scope and is
  enforced in T-018; rate limiting is a separate
  change with its own acceptance criteria.
- **Session listing and "log out all devices"**.
  Sign out revokes only the current session
  (BR-AUTH-8). "Sign out everywhere" is a
  separate change.
- **Generic RBAC on top of `userId`**. Every
  later change handles its own
  `WHERE user_id = ?` discipline. There is no
  `role` / `permission` table in this change.
- **UI screens beyond `auth/signin` and
  `auth/signout`**. The dashboard, the accounts
  view, the transactions view are owned by
  `ui-auth-shell` and downstream changes. The
  contract in this change is the HTTP API
  (Hono) + the two Auth.js pages.
- **On-demand account linking** ("Link Google to
  my account" from settings). The auto-link
  flow at first OAuth login is the only linking
  path (BR-AUTH-5). A manual link/unlink UI is
  a separate change.
- **"Unlink Google" / "Set password" actions
  for existing users**. Separate change.
- **Refresh token pruning**. Sessions
  accumulate in the DB until a separate change
  prunes them. The `Session.expires` index in
  T-015 is in place to support that future GC.
- **User deletion and GDPR workflows**.
  Tracked as `user-deletion`. The Prisma
  schema's `onDelete: Cascade` is in place to
  support it. Not in scope here.
- **Change-email flow**. `User.email` is
  immutable in MVP (per the user's accepted
  decision gap 7: Google email change does not
  update `User.email`; the conservative path).
- **Email notifications on auto-link**. A
  future hardening pass.
- **Deployment to Fly.io**. Tracked as
  `fly-deploy`. The CI workflow in T-028 runs
  on every push; the actual `fly.toml`,
  `Dockerfile`, and `fly secrets set` are
  separate. The Argon2 benchmark in T-012 is
  re-run on the target VM in `fly-deploy` to
  confirm the 50–100 ms hash time.
- **Welcome email on `UserRegistered`**. The
  event is dispatched (T-014); a downstream
  worker in a later change consumes it. No
  consumer ships in this change.

## Definition of done

The parent runs this checklist at `sdd-verify`
time. Every box must be checked.

- [ ] All 33 tasks marked `[x]`.
- [ ] `pnpm test` exits 0 across the whole
      repository.
- [ ] Coverage ≥ 80 % on `src/modules/auth/**`
      and `src/shared/db/**` (line + branch),
      measured by `pnpm test -- --coverage` and
      the `vitest.config.ts` threshold in T-002.
- [ ] `pnpm run lint` exits 0.
- [ ] `pnpm run typecheck` exits 0.
- [ ] `pnpm run build` exits 0 (Next.js
      production build smoke test).
- [ ] `pnpm prisma migrate deploy` applies the
      committed migration on a clean database.
- [ ] `gga run` exits 0 on the final diff.
- [ ] Adversarial review passed (a fresh
      `reviewer` subagent audited the diff with
      focus on: user enumeration in Credentials
      `authorize()` (BR-AUTH-4), password
      material in logs (BR-AUTH-11), Argon2id
      parameter choice on the target VM
      (BR-AUTH-3), auto-link security model
      (BR-AUTH-5), `Account` unique constraint
      and the "OAuth subject linked to different
      email" edge case (BR-AUTH-10), Google
      `email_verified` trust (BR-AUTH-6),
      session expiry and sliding window
      (BR-AUTH-7), Hono inside Next.js typing
      (no Next.js route-level types for
      `/api/*`)). The reviewer's findings are
      recorded in the verify-report.
- [ ] All four docs mirrored (proposal, spec,
      design, tasks) — drift-free.
      `docs/architecture.md` and the
      `Documents-es/docs/architecture.md` mirror
      are also in sync.
- [ ] `README.md` updated with how to run
      locally (and the `Documents-es/README.md`
      mirror).
- [ ] `.env.example` is complete (every env
      var named in the design's env schema is
      present with a placeholder and a comment).
- [ ] No AI attribution anywhere (commits, files,
      PR body). `git log` shows `Author:
      Sebastián Illa` on every commit.
- [ ] Conventional Commits format throughout.
- [ ] `git log --oneline feat/auth-foundation`
      shows a linear history; no merge commits
      inside the slice.
- [ ] All three chained PRs are open against
      `develop` with `gh pr view` showing
      `mergeable: MERGEABLE` and CI green. Each
      PR is merged only after its own reviewer
      pass; the next PR is rebased on the latest
      `develop` before opening.
- [ ] `openspec/config.yaml` is updated:
      `strictTdd.enabled: true` and
      `strictTdd.runner: "pnpm test"`.
- [ ] All 8 decision gaps encoded as defaults
      (not open questions) in the task list:
      1. `@node-rs/argon2` (with `argon2`
         fallback) — T-012.
      2. `memoryCost=19456, timeCost=2,
         parallelism=1` — T-012, T-027.
      3. `signIn` callback updates `lastLoginAt`
         and emits `UserRegistered` on first
         registration only — T-018, T-014.
      4. `lastLoginAt` updated in the `signIn`
         callback, not on session read — T-018.
      5. Hono typed-client export shape
         (`OpenAPIHono` + `hc<typeof honoApp>` at
         `src/modules/api/client.ts`) — T-021,
         T-022.
      6. `OAuthAccountNotLinked` UX in custom
         signIn page — T-023.
      7. `User.email` not updated on Google
         email change — T-018 (the `signIn`
         callback never mutates `email`).
      8. Sliding-window length 24 h, session
         expires 30 days — T-018 (Auth.js
         `session.maxAge` and `session.updateAge`).
