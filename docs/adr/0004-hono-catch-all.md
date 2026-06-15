# ADR-0004 — Hono catch-all at `app/api/[...path]/route.ts`

**Status**: Accepted · **Date**: 2026-06-13 · **Deciders**: Sebastián Illa
**Refs**: `openspec/changes/auth-foundation/proposal.md` (v2) ·
`openspec/changes/auth-foundation/design.md` §1, §2 ·
`openspec/changes/auth-foundation-slice-c/design.md` §2

## Context and Problem Statement

The non-auth application API (`/api/me`, `/api/health`, `/api/auth/register`) needs a server framework that: (1) is type-safe end-to-end (the Hono `OpenAPIHono` instance exports a typed `hc<typeof honoApp>` client for the UI), (2) mounts cleanly inside Next.js 16's App Router at a single catch-all route, (3) supports the Zod-driven request validation we use at every system boundary, and (4) gives us a single place to wire request-id, error-handler, and origin-check middleware across the non-auth surface. The `/api/auth/*` surface is owned by Auth.js, not Hono; the catch-all must not double-handle it.

## Drivers

- **Type safety**: `OpenAPIHono` + `hc<typeof honoApp>` gives the UI a fully-typed client with no code generation step.
- **Mount shape**: a single `app/api/[...path]/route.ts` that delegates `GET`/`POST`/`PATCH`/`DELETE` to `honoApp.fetch(request)`. Next.js's file-based routing resolves `app/api/auth/[...nextauth]/route.ts` first (more specific path), so the Hono catch-all does not match `/api/auth/*`.
- **Middleware composition**: a single `app.use('*', requestIdMiddleware)` and a single `app.onError(...)` covers the whole non-auth surface. No per-route wiring.
- **Zod-native validation**: `@hono/zod-validator` consumes the same DTOs the application actions already use.
- **Runtime**: must run on the Node.js 20 runtime Fly.io provides; Hono is runtime-agnostic.

## Considered Options

1. **Hono** at `app/api/[...path]/route.ts` — `OpenAPIHono` + `hc<typeof honoApp>` typed client.
2. **Pure Next.js route handlers** at `app/api/<name>/route.ts` per endpoint — Next.js's first-class API; no separate framework; but no end-to-end typed client, no shared middleware composition, and no Zod-native validation.
3. **tRPC** — type-safe end-to-end, but adds a heavier learning curve and a router-per-route declaration that's redundant with the Hono shape.
4. **Fastify** — production-grade, but requires a separate Node.js server (would not mount as a Next.js catch-all without extra glue).

## Decision Outcome

**Chosen option**: "1. Hono at `app/api/[...path]/route.ts`", because the `OpenAPIHono` + `hc<typeof honoApp>` shape gives the UI a typed client with no codegen step, the single catch-all keeps the Next.js App Router routing intact (Auth.js's more specific route wins), and the middleware composition (`requestIdMiddleware` + `errorHandler` + `originCheck`) lives in one place.

### Consequences

- **Good**: end-to-end type safety; single catch-all; Auth.js's `/api/auth/*` is unaffected; the `src/modules/api/client.ts` export is a one-liner (`export const api = hc<typeof honoApp>('/');`).
- **Bad**: Hono is a second framework inside the Next.js process; the type-level bridge (`hc<typeof honoApp>`) needs `verbatimModuleSyntax: true` so non-exported imports fail at compile time. Acceptable for the MVP; if Hono's API drifts between majors, the upgrade is a typed error at the call sites.

### Confirmation

Validated by T-021 (`app.test.ts`, 9 cases), T-022 (`client.test.ts`, 2 cases including the compile-time `Expect<Equal<...>>` check), and the C-1 integration test in T-025 (`route.test.ts`, 2 cases: `/api/auth/signin` routes to Auth.js, `/api/me` routes to Hono).
