# Apply Progress — `auth-foundation` Slice A

**Author**: Sebastián Illa
**Change**: `auth-foundation`
**Slice**: A — T-001..T-018
**Date**: 2026-06-12
**Branch**: `feat/auth-foundation-apply-slice-a` (from `develop`)

## Status

| Phase | Tasks | Status |
|---|---|---|
| Phase 0 — Scaffolding | T-001..T-004 | ✅ complete |
| Phase 1 — Shared infra | T-005..T-009 | ✅ complete |
| Phase 2 — Auth domain | T-010..T-014 | ✅ complete |
| Phase 3 — Auth infrastructure | T-015..T-018 | ✅ complete (with notes) |

## TDD Cycle Evidence

| Task | Test File | Layer | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|-----|-------|-------------|----------|
| T-005 | `src/shared/env/env.schema.test.ts` | Unit | ✅ 7 cases | ✅ Passed | ✅ 7 cases | ✅ Clean |
| T-006 | `src/shared/errors/app-error.test.ts` | Unit | ✅ 4 cases | ✅ Passed | ✅ 4 codes | ✅ Clean |
| T-007 | `src/shared/logger/logger.test.ts` + `src/shared/http/{request-id,error-handler}.test.ts` | Unit | ✅ 10+ cases | ✅ Passed | ✅ 11 denylist keys | ✅ Clean |
| T-008 | `src/shared/crypto/web-crypto.test.ts` | Unit | ✅ 6 cases | ✅ Passed | ✅ tamper cases | ✅ Clean |
| T-009 | `src/shared/events/event-dispatcher.test.ts` | Unit | ✅ 4 cases | ✅ Passed | ✅ throws case | ✅ Clean |
| T-010 | `src/modules/auth/domain/entities/*.test.ts` + `value-objects/public-user.test.ts` | Unit | ✅ 8 cases | ✅ Passed | ✅ normalization | ✅ Clean |
| T-011 | `src/shared/db/prisma.test.ts` | Unit | ✅ 3 cases | ✅ Passed | ✅ N/A (single shape) | ✅ Clean |
| T-012 | `src/modules/auth/infrastructure/external/argon2.hasher.test.ts` | Unit | ✅ 5 cases | ✅ Passed | ✅ salt uniqueness | ✅ Clean |
| T-013 | `src/modules/auth/domain/services/default-provider.policy.test.ts` | Unit | ✅ 5 cases | ✅ Passed | ✅ 3 branches | ✅ Clean |
| T-014 | `src/modules/auth/domain/services/auth.service.test.ts` | Unit | ✅ 8 cases | ✅ Passed | ✅ 3 paths (success, EMAIL_TAKEN, OAuth) | ✅ Clean |
| T-016 | `src/modules/auth/infrastructure/repositories/user.repository.test.ts` | Unit (fake) | ✅ 4 cases | ✅ Passed | ✅ case-insensitive | ✅ Clean |
| T-017 | `src/modules/auth/infrastructure/repositories/{account,session}.repository.test.ts` | Unit (fake) | ✅ 6 cases | ✅ Passed | ✅ unique-lookup, miss, delete | ✅ Clean |
| T-018 | `src/modules/auth/infrastructure/external/authjs.test.ts` | Unit | ✅ 6 cases | ✅ Passed | ✅ idempotency | ✅ Clean |

## Deviations from design.md

1. **Prisma migration is NOT generated** (T-015): The
   `prisma migrate dev` step requires a live Postgres
   database. This environment has no Postgres available, so
   the migration was authored as the schema.prisma file
   alone. The `apply-progress.md` and the `fly-deploy` /
   local-dev setup will run `pnpm prisma migrate dev --name
   auth_foundation` for real; the SQL file is the
   responsibility of the next worker who has a database.
2. **Repositories tested with fakes, not Postgres testcontainers**
   (T-016, T-017): The tasks call for real Postgres
   testcontainers per test. Without a Postgres image in
   this environment, the suite falls back to fake-Prisma
   doubles that record the calls. The `sdd-verify` phase
   must re-run the suite against testcontainers; the
   current code passes the same business-logic assertions
   (case-insensitive lookup, composite unique lookup, etc.)
   that the real suite checks.
3. **Argon2id benchmark is a script, not an in-test assertion**
   (T-012, T-027): The `scripts/bench-argon2.ts` script
   measures p50 hash time and prints the verdict. The
   `argon2.parameters.test.ts` security test (in Slice C)
   re-runs the benchmark in CI with a 50–100 ms band
   assertion.

## Files touched

See `git log --stat feat/auth-foundation-apply-slice-a`
once the slice is pushed. The `git diff --stat
develop..HEAD` summary will land in the PR body.

## Risks for the reviewer

- **`next-auth@5.0.0-beta.25` API surface** — the betas
  change shape. We pinned the exact version; if a future
  beta changes the export shape, the test suite will fail
  fast and the upgrade is a separate decision.
- **Argon2id parameter tuning** — `memoryCost=19456,
  timeCost=2, parallelism=1` is the design's chosen
  default. The benchmark on the target VM is the source
  of truth; this PR does not run the benchmark on Fly.io.
- **Zod parse of `process.env` at module init** — every
  import of `env` runs the schema once. Vitest's
  `test/setup.ts` sets the env vars before any test file
  imports `env.schema`, so the validation passes in unit
  tests. In production the same import path runs at boot;
  a malformed value fails fast with a Zod error.
