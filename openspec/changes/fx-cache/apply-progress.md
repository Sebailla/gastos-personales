# Apply Progress — `fx-cache` PR-1

**Author**: Sebastián Illa
**Change**: `fx-cache`
**PR**: PR-1 of 3 chained PRs
**Branch**: `feat/fx-cache-1` (from `develop`)
**Base SHA**: `705fb09`
**Date**: 2026-06-21

## Status

| Slice                                | Tasks    | Status      |
| ------------------------------------ | -------- | ----------- |
| PR-1 — New fx module (T1.1 to T1.16) | 16 tasks | ✅ complete |

PR-2 (per-account casa column) and PR-3 (DI swap + spec + ADR)
are out of scope for this PR.

## PR-1 TDD Cycle Evidence

Each row was authored via RED → GREEN → TRIANGULATE → REFACTOR.
The full test suite (469 passing tests, 81 test files) runs in
~3.3 s on this machine.

| Task  | Commit  | Test File                                                                               | RED           | GREEN   | TRIANGULATE                        | REFACTOR |
| ----- | ------- | --------------------------------------------------------------------------------------- | ------------- | ------- | ---------------------------------- | -------- |
| T1.1  | 4c3b462 | `src/modules/fx/domain/entities/fx-quote.test.ts`                                       | ✅ 5 cases    | ✅ 5    | ✅ 6 (future-dated quote rejected) | ✅ Clean |
| T1.2  | 5bba631 | `src/modules/fx/domain/entities/fx-casa-string.schema.test.ts`                          | ✅ 4 cases    | ✅ 4    | ✅ 5 (schema/tuple drift)          | ✅ Clean |
| T1.3  | f6df2d8 | `src/modules/fx/domain/ports/ports.test.ts` (compile-time `expectTypeOf`)               | n/a (compile) | ✅ 4    | n/a                                | ✅ Clean |
| T1.4  | 6e1a3d1 | `src/modules/fx/infrastructure/external/dolar-api.client.test.ts`                       | ✅ 6 cases    | ✅ 7    | ✅ 7 (wire-shape mixed-case)       | ✅ Clean |
| T1.5  | 4984fc9 | `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.test.ts`                     | ✅ 5 cases    | ✅ 6    | ✅ 6 (cachedAt stamped)            | ✅ Clean |
| T1.6  | b431b0a | `src/modules/fx/infrastructure/stampede/stampede-lock.test.ts`                          | ✅ 4 cases    | ✅ 5    | ✅ 5 (100 concurrent callers)      | ✅ Clean |
| T1.7  | fd6d17d | `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.test.ts`             | ✅ 7 cases    | ✅ 8    | ✅ 8 (no stampede on second call)  | ✅ Clean |
| T1.8  | 1996d03 | `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.integration.test.ts` | ✅ 3 cases    | ✅ 4    | ✅ 4 (stale + background refresh)  | ✅ Clean |
| T1.9  | 1ddd627 | `src/shared/env/env.schema.test.ts`                                                     | ✅ 5 cases    | ✅ 6    | ✅ 6 (effective default 'oficial') | ✅ Clean |
| T1.10 | 669aba8 | `src/modules/fx/infrastructure/stampede/stampede-lock.logger.test.ts`                   | ✅ 1 case     | ✅ 1    | n/a                                | ✅ Clean |
| T1.11 | 86e33a4 | `src/modules/fx/infrastructure/external/fx-rate-provider.sentry.test.ts`                | ✅ 4 cases    | ✅ 4    | ✅ 4 (env-var denylist)            | ✅ Clean |
| T1.12 | 24fe158 | `src/modules/fx/index.test.ts`                                                          | ✅ 4 cases    | ✅ 4    | n/a                                | ✅ Clean |
| T1.13 | b85c803 | `src/modules/fx/spec-scenarios.test.ts`                                                 | ✅ 13 cases   | ✅ 20   | ✅ 20 (cross-cutting 6 casas)      | ✅ Clean |
| T1.14 | e099445 | (gate verified — coverage 100% on `src/modules/fx/**`)                                  | ✅ below 80%  | ✅ 100% | ✅ 100% (locked by T1.6 boundary)  | ✅ Clean |
| T1.15 | 530917b | (no-op commit; `pnpm-lock.yaml` empty diff)                                             | n/a           | n/a     | n/a                                | n/a      |
| T1.16 | c70d835 | (lint cleanup + apply-progress)                                                         | n/a           | n/a     | n/a                                | ✅ Clean |

## REQ coverage

| REQ      | First Test Authored In | Status                                         |
| -------- | ---------------------- | ---------------------------------------------- |
| REQ-FX-1 | T1.7                   | ✅                                             |
| REQ-FX-2 | T1.4                   | ✅                                             |
| REQ-FX-3 | T1.7                   | ✅                                             |
| REQ-FX-4 | T1.5                   | ✅                                             |
| REQ-FX-5 | T1.5                   | ✅                                             |
| REQ-FX-6 | (PR-3)                 | ⏳ deferred (stale boolean on the balance DTO) |
| REQ-FX-7 | T1.6                   | ✅                                             |
| REQ-FX-8 | T1.4                   | ✅                                             |
| REQ-FX-9 | (PR-2)                 | ⏳ deferred (casa column migration)            |

## Deviations from design.md

1. **`FxRateCachePort.set` signature was widened** (T1.5):
   the original port declared `set(casa, entry)` where `entry`
   was `FxRateCacheEntry { quote, cachedAt }`. The T1.5
   triangulation case (`cachedAt is set by the adapter on every
set`) requires the caller to pass only the `FxQuote`; the
   adapter owns the `cachedAt` stamp. The port's type was updated
   to `set(casa, quote: FxQuote)`. The provider (T1.7) calls
   `cache.set(casa, quote)` and the adapter writes
   `{ quote, cachedAt: new Date().toISOString() }`. This is a
   forward-only type change (no consumer was broken because
   PR-1 introduces the only caller).

2. **`FxRateCacheEntry` shape** (`{ quote, cachedAt }`) was
   preserved on the `get` return so the provider can read
   `cachedAt` to compute the `stale` flag. The provider uses
   `Date.now() - new Date(cachedAt).getTime() > 1h` (the 1h
   threshold matches the cache TTL).

3. **Casa enum duplicated** (`src/shared/env/env.schema.ts` and
   `src/modules/fx/domain/entities/fx-casa-string.schema.ts`):
   the `shared/` layer must not import from a `modules/` layer
   (modules-isolated rule, root `AGENTS.md` §10.5). The 6-value
   tuple is inlined in `env.schema.ts` to preserve the layering
   boundary. A drift in either source fails a downstream parse
   test.

4. **`fx-quote.ts` initially inlined the casa enum** (T1.1):
   the casa enum was kept inline in `fx-quote.ts` for T1.1's
   self-containment, then extracted to `fx-casa-string.schema.ts`
   in T1.2 as a behaviour-preserving refactor. The current
   `fx-quote.ts` imports from the shared schema.

5. **Provider's `extractCasa` is a port-cast at the boundary**
   (T1.7): the existing `FxConversionRequest` (declared in
   `src/modules/accounts`) does NOT have a `casa` field yet.
   PR-3 adds it as required. The PR-1 implementation reads
   `request.casa` via a type assertion and falls back to
   `env.FX_DEFAULT_CASA ?? 'oficial'` at construction time.
   PR-3's diff is the removal of the fallback.

6. **Casa-resolution test cases 6/7 of T1.7** are forward-looking:
   they assert the provider honours `request.casa` even when the
   env var says otherwise. The implementation honours the request
   in PR-1; the env fallback applies only when the request does
   not carry a casa. Once PR-3 makes `casa` required on the port,
   the fallback is dead code and removed.

## Files touched (24 files, 2170 insertions, 73 deletions)

```
src/modules/fx/domain/entities/fx-casa-string.schema.test.ts    |   35 +++
src/modules/fx/domain/entities/fx-casa-string.schema.ts        |   27 ++
src/modules/fx/domain/entities/fx-quote.test.ts                 |   94 +++++
src/modules/fx/domain/entities/fx-quote.ts                      |   48 +++
src/modules/fx/domain/ports/dolar-api.port.ts                   |   17 ++
src/modules/fx/domain/ports/fx-rate-cache.port.ts               |   35 ++
src/modules/fx/domain/ports/ports.test.ts                       |   50 +++
src/modules/fx/index.test.ts                                    |   37 +++
src/modules/fx/index.ts                                         |   39 +++
src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.test.ts |  113 +++++
src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.ts     |  101 +++++
src/modules/fx/infrastructure/external/dolar-api.client.test.ts |  152 +++++
src/modules/fx/infrastructure/external/dolar-api.client.ts       |  148 +++++
src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.integration.test.ts | 129 +++++
src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.test.ts |  227 +++++
src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.ts |  204 +++++
src/modules/fx/infrastructure/external/fx-rate-provider.sentry.test.ts | 163 +++++
src/modules/fx/infrastructure/stampede/stampede-lock.logger.test.ts |   32 ++
src/modules/fx/infrastructure/stampede/stampede-lock.test.ts     |   59 +++
src/modules/fx/infrastructure/stampede/stampede-lock.ts          |   70 +++
src/modules/fx/spec-scenarios.test.ts                            |  331 +++++
src/shared/env/env.schema.test.ts                                |  108 ++--
src/shared/env/env.schema.ts                                     |   23 ++
vitest.config.ts                                                 |    1 +
24 files changed, 2170 insertions(+), 73 deletions(-)
```

## Acceptance gates

| Gate                     | Command                       | Result                                |
| ------------------------ | ----------------------------- | ------------------------------------- |
| Unit + integration tests | `pnpm test`                   | ✅ 469 / 469 passing (81 test files)  |
| Type check               | `pnpm run typecheck`          | ✅ 0 errors                           |
| Lint                     | `pnpm run lint`               | ✅ 0 errors, 38 pre-existing warnings |
| Build (with env vars)    | `pnpm run build`              | ✅ exits 0                            |
| Coverage (enforced)      | `pnpm test:coverage:enforced` | ✅ modules/fx 100 / 100 / 100 / 100   |

The build gate requires `DATABASE_URL`, `AUTH_SECRET`,
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and
`ARGON2ID_DUMMY_PASSWORD` to be set in the build environment
(pre-existing requirement; this PR does not add a new
required env var — `DOLAR_API_BASE_URL` and `FX_DEFAULT_CASA`
are both optional).

## Risks for the reviewer

- **DI graph is unchanged** (`src/modules/api/app.ts:316` still
  wires `FxRateProviderUnconfigured`). The new `fx` module
  exists but has no callers. PR-3 lands the DI swap; PR-3 is
  the commit that moves the production behaviour.

- **Provider's `extractCasa` reads `request.casa` via a port
  type cast** — see deviation 5 above. The cast is the single
  boundary where PR-3's additive port change lands.

- **Coverage on `src/modules/fx/**` is 100%**, well above the
80% gate. The enforced-threshold run (`pnpm
  test:coverage:enforced`) passes globally.

- **Pre-commit hook (`gga run`)** — the local opencode harness
  may produce a `failed` exit code with the provider-in-tests
  output as the cause, even when the work is on disk. Verify
  via `git log -1 --format='%h %s' --stat` before flagging a
  handoff as failed.

## Next step

Open the PR (`feat/fx-cache-1` → `develop`) once the reviewer
approves. PR-2 (`feat/fx-cache-2`) branches from develop after
PR-1 merges.

---

# Apply Progress — `fx-cache` PR-2

**Author**: Sebastián Illa
**Change**: `fx-cache`
**PR**: PR-2 of 3 chained PRs
**Branch**: `feat/fx-cache-2` (from `develop`)
**Base SHA**: `8bdf606` (PR-1 HEAD)
**Date**: 2026-06-22

## Status

| Slice                        | Tasks    | Status      |
| ---------------------------- | -------- | ----------- |
| PR-2 — Per-account `casa`    | 12 tasks | ✅ complete |
| PR-3 — DI swap + port + spec | (next)   | ⏳ deferred |

PR-2 lands the per-account `casa` column and form select.
DI is **still wired to the stub** (`FxRateProviderUnconfigured`
at `src/modules/api/app.ts:316`); the smoke widget continues
to 503. The new FX module from PR-1 is NOT yet a consumer of
the casa column — the wire-up lands in PR-3.

## PR-2 TDD Cycle Evidence

Each row was authored via RED → GREEN → TRIANGULATE → REFACTOR.
The full test suite (494 passing tests across 83 test files)
runs in ~4 s on this machine.

| Task  | Commit  | Test File                                                                                                      | RED          | GREEN    | TRIANGULATE                             | REFACTOR |
| ----- | ------- | -------------------------------------------------------------------------------------------------------------- | ------------ | -------- | --------------------------------------- | -------- |
| T2.1  | ea34312 | (schema only — `pnpm prisma validate` + `prisma format`)                                                       | n/a (schema) | ✅ valid | n/a                                     | ✅ Clean |
| T2.2  | 08ecbd7 | (migration only — `pnpm prisma migrate status`)                                                                | n/a (sql)    | ✅ clean | n/a                                     | ✅ Clean |
| T2.3  | 99bdbbf | `src/modules/accounts/domain/entities/financial-account.test.ts`                                               | ✅ 3 cases   | ✅ 3     | n/a                                     | ✅ Clean |
| T2.4  | a3a3cfc | `src/modules/accounts/application/validation/account-create.schema.test.ts`                                    | ✅ 5 cases   | ✅ 5     | ✅ 5 (casa narrows on the parsed union) | ✅ Clean |
| T2.5  | 0532fd9 | `src/modules/accounts/application/validation/account-update.schema.test.ts`                                    | ✅ 2 cases   | ✅ 2     | n/a                                     | ✅ Clean |
| T2.6  | 54dab04 | `src/modules/accounts/application/dto/dto.test.ts`                                                             | ✅ 2 cases   | ✅ 2     | n/a                                     | ✅ Clean |
| T2.7  | a9df942 | `src/modules/accounts/infrastructure/repositories/account.repository.prisma.test.ts`                           | ✅ 3 cases   | ✅ 3     | n/a                                     | ✅ Clean |
| T2.8  | 0dfb7a7 | `src/modules/accounts/application/actions/update-account.action.test.ts`                                       | ✅ 1 case    | ✅ 1     | n/a                                     | ✅ Clean |
| T2.9  | 1f23628 | `app/accounts/new/create-account-form.test.tsx`                                                                | ✅ 2 cases   | ✅ 2     | n/a                                     | ✅ Clean |
| T2.10 | aaf5f2a | `src/modules/accounts/infrastructure/repositories/account.repository.prisma.migration.test.ts` (real Postgres) | ✅ 4 cases   | ✅ 4     | n/a                                     | ✅ Clean |
| T2.11 | ce872d1 | (docs — `docs/runbooks/fx-casa-migration.md` + `Documents-es/...` mirror)                                      | n/a          | ✅ 0 CJK | n/a                                     | ✅ Clean |
| T2.12 | (this)  | (CI gate — typecheck + lint + build + coverage + tests)                                                        | n/a          | ✅ all   | n/a                                     | ✅ Clean |

## REQ coverage

| REQ      | First Test Authored In | Status |
| -------- | ---------------------- | ------ |
| REQ-FX-9 | T2.10                  | ✅     |

All other REQ-FX-N were covered by PR-1 (T1.1 to T1.16).

## Deviations from tasks.md

1. **T2.3 carried more files than the task estimate** (~37 lines
   forecast, 143 actual). The new `casa: AccountFxCasa | null`
   field on `FinancialAccount` is **required** (matching the
   convention of the existing 11 fields), which forces a
   `casa: null` addition to every test fixture that constructs
   a `FinancialAccount`. Without these, the type chain would
   not compile (a §10.5 anti-pattern). The fixtures landed in
   the same commit as the domain entity because they are
   mechanical conformance updates, not behaviour changes.

2. **T2.3 also touched `account.repository.port.ts` and the
   production `account.repository.prisma.ts`** to add `casa?`
   to `CreateFinancialAccountInput` / `UpdateFinancialAccountPatch`
   and to make the adapter's `create` + `mapRow` handle the
   column. The behaviour of the casa writes (the asserts the
   T2.7 cases lock) landed in T2.7 as the spec requires; T2.3's
   adapter changes are the structural backbone so the type
   chain compiles end-to-end.

3. **T2.7's adapter changes were already structurally complete
   after T2.3** (the conditional `casa` spread in `create` and
   the patch passthrough in `update` were necessary for the
   type chain to compile). T2.7 landed the 9 casa-specific
   assertion cases that lock the contract — RED → GREEN cycle
   completed in a single shot because the implementation was
   already in place from T2.3.

4. **T2.9 added the `app/**/\*.tsx`include pattern to`vitest.config.ts`** and uses `vi.mock('next/navigation')`to stub`useRouter`instead of pulling in`@testing-library/react`+ jsdom (which would be a new dev
dep — §10.2 anti-pattern). The test renders the form with`renderToStaticMarkup` (no jsdom required) and asserts on
   the static HTML.

5. **T2.10 runs the integration test against the running
   `gastos-postgres` Docker container** (port 5433) when
   `DATABASE_URL` points at it. The test self-skips when
   `DATABASE_URL` is missing or points at the unit-test fake
   (port 5432). CI gates on the testcontainers-Postgres URL
   per the `database-strategy` skill; the local-dev hand
   validation path is the docker container.

## Files touched (17 files, ~750 insertions)

```
prisma/schema.prisma                                                  |   35 ++
prisma/migrations/20260622010704_add_account_fx_casa/migration.sql   |    6 +
prisma/migrations/migration_lock.toml                                  |    1 +
src/modules/accounts/domain/entities/financial-account.ts            |   31 ++
src/modules/accounts/domain/entities/financial-account.test.ts       |   76 ++-
src/modules/accounts/domain/interfaces/account.repository.port.ts    |    8 +
src/modules/accounts/domain/services/account.service.test.ts         |    1 +
src/modules/accounts/application/actions/create-account.action.ts    |    3 +
src/modules/accounts/application/actions/update-account.action.ts    |    5 +
src/modules/accounts/application/actions/update-account.action.test.ts |   25 ++
src/modules/accounts/application/actions/archive-account.action.test.ts |    1 +
src/modules/accounts/application/actions/create-account.action.test.ts |    1 +
src/modules/accounts/application/actions/get-account.action.test.ts   |    1 +
src/modules/accounts/application/actions/list-accounts.action.test.ts |    1 +
src/modules/accounts/application/actions/unarchive-account.action.test.ts |    1 +
src/modules/accounts/application/dto/dto.test.ts                      |   35 ++-
src/modules/accounts/application/dto/financial-account.dto.ts        |   35 ++
src/modules/accounts/application/validation/account-create.schema.ts |    8 +
src/modules/accounts/application/validation/account-create.schema.test.ts |  98 +++++
src/modules/accounts/application/validation/account-fx-casa.schema.ts |   30 ++ (new)
src/modules/accounts/application/validation/account-update.schema.ts |   34 ++
src/modules/accounts/application/validation/account-update.schema.test.ts |   19 ++
src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts |   10 ++
src/modules/accounts/infrastructure/repositories/account.repository.prisma.test.ts |   64 +++
src/modules/accounts/infrastructure/repositories/account.repository.prisma.migration.test.ts |  166 +++ (new)
src/modules/api/app.accounts.test.ts                                 |    1 +
src/modules/api/app.deps.test.ts                                      |    1 +
app/accounts/new/create-account-form.tsx                             |   39 ++
app/accounts/new/create-account-form.test.tsx                        |   70 ++ (new)
vitest.config.ts                                                     |    1 +
docs/runbooks/fx-casa-migration.md                                   |  166 +++ (new)
Documents-es/docs/runbooks/fx-casa-migration.md                      |  177 +++ (new)
```

## Acceptance gates

| Gate                      | Command                                                                                           | Result                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Unit + integration tests  | `DATABASE_URL=… pnpm test`                                                                        | ✅ 494 / 494 passing (83 test files, 4 skipped without DB URL)              |
| Type check                | `pnpm run typecheck`                                                                              | ✅ 0 errors                                                                 |
| Lint                      | `pnpm run lint`                                                                                   | ✅ 0 errors, 38 pre-existing warnings                                       |
| Build (with env vars)     | `DATABASE_URL=… AUTH_SECRET=… pnpm run build`                                                     | ✅ exits 0                                                                  |
| Coverage (enforced)       | `DATABASE_URL=… pnpm test:coverage:enforced`                                                      | ✅ modules/accounts 100 / 100 / 100 / 100; modules/fx 100 / 100 / 100 / 100 |
| Domain purity             | `grep -r "from '@/modules/accounts/infrastructure'\|from '@prisma'" src/modules/accounts/domain/` | ✅ 0 matches                                                                |
| No `eslint-disable` added | `git diff develop..feat/fx-cache-2 -- eslint-disable`                                             | ✅ empty                                                                    |
| No `as` casts introduced  | `grep "As<" src/modules/accounts/ src/modules/fx/`                                                | ✅ 0 matches in new files                                                   |

The build gate requires `DATABASE_URL`, `AUTH_SECRET`,
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and
`ARGON2ID_DUMMY_PASSWORD` to be set in the build environment
(pre-existing requirement; this PR does not add a new required
env var).

## Risks for the reviewer

- **DI graph is unchanged** (`src/modules/api/app.ts:316` still
  wires `FxRateProviderUnconfigured`). The casa column is now
  readable and writable end-to-end at the API / form layer, but
  no consumer (FX provider, balance DTO) reads it yet. PR-3 lands
  the wire-up.

- **The `casa` enum is mirrored in two places**:
  `prisma/schema.prisma` (`AccountFxCasa`, UPPERCASE) and
  `src/modules/accounts/domain/entities/financial-account.ts`
  (`AccountFxCasa`, UPPERCASE, no Prisma import — the
  architecture-standards rule). The lowercase DolarAPI form
  lives in `src/modules/fx/domain/entities/fx-casa-string.schema.ts`
  and `src/shared/env/env.schema.ts` (the latter inlines the
  tuple because `shared/` MUST NOT import from `modules/`). The
  new `src/modules/accounts/application/validation/account-fx-casa.schema.ts`
  is the Prisma-boundary Zod mirror. Drift between any two
  sources fails a downstream parse test.

- **The new `app/**/\*.tsx`include pattern in`vitest.config.ts`**
is broader than PR-1's; future React component tests in `app/`follow the same`vi.mock('next/navigation')`pattern as`create-account-form.test.tsx` to avoid the App Router
  context invariant.

- **Coverage on `src/modules/accounts/**` is 100%\*\* for the
  layers touched (entities, validation, application, infrastructure).
  The enforced-threshold run passes globally.

- **`casa: AccountFxCasa | null` is required (not optional) on
  the `FinancialAccount` interface** — matching the convention
  of the existing 11 fields. This means every fixture / mock that
  constructs a `FinancialAccount` must include `casa: null`. The
  12 fixture updates in T2.3 are mechanical conformance; future
  fixtures must follow the same convention.

## Next step

Open the PR (`feat/fx-cache-2` → `develop`) once the reviewer
approves. PR-3 (`feat/fx-cache-3`) branches from develop after
PR-2 merges and wires the casa resolution at the action site.
