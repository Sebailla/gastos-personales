# ADR-0002 — Prisma 6 as the data-access layer

**Status**: Accepted · **Date**: 2026-06-13 · **Deciders**: Sebastián Illa
**Refs**: `openspec/changes/auth-foundation/proposal.md` (v2) ·
`openspec/changes/auth-foundation/design.md` §5 ·
`openspec/changes/auth-foundation-slice-c/proposal.md`

## Context and Problem Statement

The auth module owns 4 tables (`User`, `Account`, `Session`, `VerificationToken`) that the `@auth/prisma-adapter` expects to match its canonical schema exactly. The accounts-ledger and transactions changes (downstream of auth-foundation) will add more tables. We need an ORM that: (1) generates a typed client with end-to-end type safety from a single source of truth (`prisma/schema.prisma`), (2) emits parameterized SQL (never string concatenation), (3) supports versioned migrations that deploy idempotently in CI, and (4) integrates with Auth.js's canonical adapter without schema drift.

## Drivers

- **Type safety**: from `schema.prisma` to the client to repository ports, no `any`, no untyped `Record<string, unknown>`.
- **Migration story**: `pnpm prisma migrate dev` locally, `pnpm prisma migrate deploy` in CI / at container start.
- **Postgres feature support**: `@db.Text` for the long `access_token` / `refresh_token` / `id_token` columns; composite `@@unique([provider, providerAccountId])` for BR-AUTH-10; explicit `@@index` for `Session.expires` (the future GC job) and `User.createdAt` (the future `user-deletion` change).
- **Adapter ecosystem**: `@auth/prisma-adapter` is the canonical Auth.js adapter; it is what the Auth.js docs reference.
- **Operational maturity**: connection pooling, prepared statements, `P2002` unique-violation error codes we can assert against in tests.

## Considered Options

1. **Prisma 6** — schema-first, generated typed client, `@auth/prisma-adapter` is the canonical Auth.js adapter.
2. **Kysely** — type-safe SQL builder, schema is hand-written TypeScript; no `@db.Text`, no schema-level `@@unique` / `@@index` declarations.
3. **Raw SQL** + `pg` — full control, no type safety without a codegen step we have to write and maintain.
4. **Drizzle** — TypeScript-first ORM, less mature on the `@auth/prisma-adapter` side (no canonical Auth.js adapter; the Drizzle adapter exists but is community-maintained).

## Decision Outcome

**Chosen option**: "1. Prisma 6", because the `@auth/prisma-adapter` requires the canonical 4-table schema exactly, Prisma's `@@unique([provider, providerAccountId])` is the BR-AUTH-10 line of defense against the "same Google account linked to two users" attack, and the versioned migration story (`pnpm prisma migrate dev` → `pnpm prisma migrate deploy`) is the same one Fly.io's release commands will run.

### Consequences

- **Good**: end-to-end type safety from schema to client; parameterized SQL by construction; canonical Auth.js adapter; `P2002` is the assertion target for the BR-AUTH-10 unique-violation test; `@@index([expires])` ready for the future GC job.
- **Bad**: schema-first means a `prisma generate` step in CI; Drizzle is leaner at runtime, but the adapter ecosystem is not at parity. Acceptable for an MVP.

### Confirmation

Validated by T-015 (Prisma schema + migration), T-016 + T-017 (repositories with fakes + the future testcontainers re-run at `sdd-verify`), and the canonical adapter is verified by Auth.js's own typecheck against `@auth/prisma-adapter@2.11.2`.
