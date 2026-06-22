# Apply Progress — `fx-cache` PR-1

**Author**: Sebastián Illa
**Change**: `fx-cache`
**PR**: PR-1 of 3 chained PRs
**Branch**: `feat/fx-cache-1` (from `develop`)
**Base SHA**: `705fb09`
**Date**: 2026-06-21

## Status

| Slice                                | Tasks     | Status      |
| ------------------------------------ | --------- | ----------- |
| PR-1 — New fx module (T1.1 to T1.16) | 16 tasks  | ✅ complete |

PR-2 (per-account casa column) and PR-3 (DI swap + spec + ADR)
are out of scope for this PR.

## PR-1 TDD Cycle Evidence

Each row was authored via RED → GREEN → TRIANGULATE → REFACTOR.
The full test suite (469 passing tests, 81 test files) runs in
~3.3 s on this machine.

| Task  | Commit   | Test File                                                                       | RED            | GREEN    | TRIANGULATE                        | REFACTOR |
| ----- | -------- | ------------------------------------------------------------------------------- | -------------- | -------- | ---------------------------------- | -------- |
| T1.1  | 4c3b462  | `src/modules/fx/domain/entities/fx-quote.test.ts`                              | ✅ 5 cases     | ✅ 5     | ✅ 6 (future-dated quote rejected) | ✅ Clean |
| T1.2  | 5bba631  | `src/modules/fx/domain/entities/fx-casa-string.schema.test.ts`                 | ✅ 4 cases     | ✅ 4     | ✅ 5 (schema/tuple drift)          | ✅ Clean |
| T1.3  | f6df2d8  | `src/modules/fx/domain/ports/ports.test.ts` (compile-time `expectTypeOf`)      | n/a (compile)  | ✅ 4     | n/a                                | ✅ Clean |
| T1.4  | 6e1a3d1  | `src/modules/fx/infrastructure/external/dolar-api.client.test.ts`              | ✅ 6 cases     | ✅ 7     | ✅ 7 (wire-shape mixed-case)        | ✅ Clean |
| T1.5  | 4984fc9  | `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.test.ts`            | ✅ 5 cases     | ✅ 6     | ✅ 6 (cachedAt stamped)             | ✅ Clean |
| T1.6  | b431b0a  | `src/modules/fx/infrastructure/stampede/stampede-lock.test.ts`                 | ✅ 4 cases     | ✅ 5     | ✅ 5 (100 concurrent callers)      | ✅ Clean |
| T1.7  | fd6d17d  | `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.test.ts`    | ✅ 7 cases     | ✅ 8     | ✅ 8 (no stampede on second call)   | ✅ Clean |
| T1.8  | 1996d03  | `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.integration.test.ts` | ✅ 3 cases | ✅ 4 | ✅ 4 (stale + background refresh) | ✅ Clean |
| T1.9  | 1ddd627  | `src/shared/env/env.schema.test.ts`                                            | ✅ 5 cases     | ✅ 6     | ✅ 6 (effective default 'oficial')  | ✅ Clean |
| T1.10 | 669aba8  | `src/modules/fx/infrastructure/stampede/stampede-lock.logger.test.ts`          | ✅ 1 case      | ✅ 1     | n/a                                | ✅ Clean |
| T1.11 | 86e33a4  | `src/modules/fx/infrastructure/external/fx-rate-provider.sentry.test.ts`       | ✅ 4 cases     | ✅ 4     | ✅ 4 (env-var denylist)            | ✅ Clean |
| T1.12 | 24fe158  | `src/modules/fx/index.test.ts`                                                 | ✅ 4 cases     | ✅ 4     | n/a                                | ✅ Clean |
| T1.13 | b85c803  | `src/modules/fx/spec-scenarios.test.ts`                                        | ✅ 13 cases    | ✅ 20    | ✅ 20 (cross-cutting 6 casas)      | ✅ Clean |
| T1.14 | e099445  | (gate verified — coverage 100% on `src/modules/fx/**`)                         | ✅ below 80%   | ✅ 100%  | ✅ 100% (locked by T1.6 boundary)  | ✅ Clean |
| T1.15 | 530917b  | (no-op commit; `pnpm-lock.yaml` empty diff)                                    | n/a            | n/a      | n/a                                | n/a      |
| T1.16 | c70d835  | (lint cleanup + apply-progress)                                                 | n/a            | n/a      | n/a                                | ✅ Clean |

## REQ coverage

| REQ          | First Test Authored In | Status |
| ------------ | ---------------------- | ------ |
| REQ-FX-1     | T1.7                   | ✅ |
| REQ-FX-2     | T1.4                   | ✅ |
| REQ-FX-3     | T1.7                   | ✅ |
| REQ-FX-4     | T1.5                   | ✅ |
| REQ-FX-5     | T1.5                   | ✅ |
| REQ-FX-6     | (PR-3)                 | ⏳ deferred (stale boolean on the balance DTO) |
| REQ-FX-7     | T1.6                   | ✅ |
| REQ-FX-8     | T1.4                   | ✅ |
| REQ-FX-9     | (PR-2)                 | ⏳ deferred (casa column migration) |

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

| Gate                        | Command                                | Result |
| --------------------------- | -------------------------------------- | ------ |
| Unit + integration tests    | `pnpm test`                            | ✅ 469 / 469 passing (81 test files) |
| Type check                  | `pnpm run typecheck`                   | ✅ 0 errors |
| Lint                        | `pnpm run lint`                        | ✅ 0 errors, 38 pre-existing warnings |
| Build (with env vars)       | `pnpm run build`                       | ✅ exits 0 |
| Coverage (enforced)         | `pnpm test:coverage:enforced`          | ✅ modules/fx 100 / 100 / 100 / 100 |

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