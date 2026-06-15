# ADR-0001 — Auth.js v5 (next-auth@5.0.0-beta.31) as the identity layer

**Status**: Accepted · **Date**: 2026-06-13 · **Deciders**: Sebastián Illa
**Refs**: `openspec/changes/auth-foundation/proposal.md` (v2) ·
`design.md` §2, §3 ·
`openspec/changes/auth-foundation-slice-c/proposal.md`

## Context and Problem Statement

The `auth-foundation` change lands the full identity layer for `gastos-personales`. We need an auth library that: (1) gives us session management for the Next.js 16 App Router, (2) supports both Credentials (email + password with Argon2id) and Google OAuth 2.0, (3) integrates with Prisma 6 via the canonical adapter, (4) is mature enough for a multi-user finance app where a session leak is a security incident. The identity layer is the floor: every later change (`accounts-ledger`, `transactions`, `reports-mvp`, `pwa-shell`) depends on it.

## Drivers

- **Security defaults**: CSRF, secure cookies, OAuth `state`, PKCE must be correct by default.
- **Prisma integration**: must use the canonical `@auth/prisma-adapter` schema, not a custom one.
- **Maintenance**: 2026-current library, active releases, non-deprecated path.
- **Cost**: no vendor lock-in, no per-MAU bill.
- **Runtime**: must run on Node.js 20 (Fly.io).

## Considered Options

1. **Auth.js v5** + Prisma adapter + database sessions.
2. **Lucia** — TypeScript-first, framework-agnostic.
3. **Clerk** — managed auth-as-a-service.
4. **Supabase Auth** — bundled with Supabase Postgres.
5. **Hand-rolled** — session store, OAuth callback, CSRF, password hashing in-house.

## Decision Outcome

**Chosen option**: "1. Auth.js v5", because the `@auth/prisma-adapter` ships the canonical 4-table schema (`User`, `Account`, `Session`, `VerificationToken`) we adopt verbatim (BR-AUTH-9), the OAuth `state` + PKCE + cookie hardening are correct by default (BR-AUTH-10), and the `signIn` / `session` callbacks give us the seams we need to stamp `lastLoginAt` and surface `defaultProvider` / `lastLoginAt` to the UI (BR-AUTH-13).

### Consequences

- **Good**: industry-standard security defaults; database sessions (no JWT in the client cookie); `signIn` / `session` callbacks for `lastLoginAt` and `defaultProvider`; the Prisma adapter owns the read/write paths for `Account` / `Session` / `VerificationToken`.
- **Bad**: v5 is still beta; the API surface can change between betas. We pin the exact version in `package.json` and use `pnpm install --frozen-lockfile` in CI. The next-auth + Next.js module-resolution bug (issue #18) is the known wart; the C-1 fix patches `vitest.config.ts` with a `resolve.alias` stub.

### Confirmation

Validated by T-018 (`authjs.test.ts`, 6 cases) and the C-2 security suite (T-027.2 OAuth state-CSRF, T-027.6 cookie attributes). CI runs both on every push. A later `sdd-verify` re-runs the suite against the real `next-auth` runtime on Neon.
