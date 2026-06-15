# Design — `auth-foundation`

**Author**: Sebastián Illa
**Change**: `auth-foundation`
**Status**: draft · **Created**: 2026-06-10
**Stack**: v2 — Next.js 16 + Auth.js v5 + Prisma 6 + PostgreSQL (Neon) + Hono catch-all + Zod
**Upstream**: `openspec/changes/auth-foundation/proposal.md` (v2, committed in `051e01e`)
**Spec**: `openspec/specs/auth/spec.md`

> **v2 note**: this is the second write of this design. The first
> version (commit `b562cee`) targeted Bun + Hono (server) +
> Drizzle + SQLite + a hand-rolled auth subsystem with
> application-issued JWTs and refresh-token rotation with family
> revocation. v1 is kept in git history for structural
> reference; its content is **obsolete** (custom JWT, refresh
> rotation, Drizzle, SQLite, `arctic`, `jose`, `bun-argon2`).
> v2 keeps the v1 _shape_ (11 sections: architecture overview,
> library decisions, config shape, catch-all shape, schema,
> migrations, env vars, testing, CI, open questions, risks)
> and replaces the _substance_ with Auth.js v5 database
> sessions, the Prisma adapter, the Hono catch-all, and
> `@node-rs/argon2` (or `argon2` as fallback).

## 1. Architecture overview

The `auth` module follows the project's **modular + clean
architecture** (see `architecture-standards` skill). The
dependency direction is strict: `UI → Application → Domain
← Infrastructure`. The domain layer
(`src/modules/auth/domain/**`) knows nothing about
application, infrastructure, or UI. Cross-module communication
happens exclusively through `src/shared/events/` (the
`UserRegistered` and `UserSignedIn` events), never via direct
imports.

```mermaid
graph TD
  subgraph App["app/ (Next.js App Router)"]
    SIGNIN["/auth/signin<br/>(Next.js page)"]
    SIGNINHANDLER["/api/auth/[...nextauth]/route.ts<br/>Auth.js handlers"]
    CATCHALL["/api/[...path]/route.ts<br/>Hono catch-all"]
  end

  subgraph Hono["src/modules/api/ (Hono)"]
    H["honoApp<br/>(OpenAPIHono)"]
    HEALTH["GET /health"]
    ME["GET /me"]
    REG["POST /auth/register"]
  end

  subgraph AuthModule["src/modules/auth/"]
    subgraph Domain["domain/"]
      USER["entities/user.ts"]
      ACCT["entities/account.ts"]
      SESS["entities/session.ts"]
      SVC["services/auth.service.ts"]
      PORTS["interfaces/<br/>{user,session,account}.port.ts"]
    end
    subgraph Application["application/"]
      ACTIONS["actions/<br/>{register,me,health}.action.ts"]
      DTO["dto/<br/>{register,me,health}.dto.ts"]
    end
    subgraph Infra["infrastructure/"]
      REPOS["repositories/<br/>{user,account,session}.repository.ts"]
      ARGON["external/<br/>argon2.hasher.ts"]
      AUTHJS["external/<br/>authjs.ts (auth())"]
    end
  end

  subgraph Shared["src/shared/"]
    DB["db/<br/>prisma client"]
    ENV["env/<br/>zod env schema"]
    EVT["events/<br/>event dispatcher"]
    LOG["logger/<br/>structured logger"]
  end

  SIGNINHANDLER --> AUTHJS
  AUTHJS --> PORTS
  AUTHJS --> REPOS
  REPOS --> DB
  AUTHJS --> ARGON
  AUTHJS --> SVC
  SVC --> PORTS
  ACTIONS --> SVC
  ACTIONS --> DTO
  ACTIONS --> EVT
  ACTIONS --> LOG
  CATCHALL --> H
  H --> HEALTH
  H --> ME
  H --> REG
  H --> AUTHJS
  ACTIONS --> AUTHJS
  SIGNIN -.UI only.-> SIGNINHANDLER
```

**Layer responsibilities:**

- **`app/`** (UI) — Next.js App Router pages, layouts, server
  components, and the two API route handlers. Owns no
  business logic. Calls application actions and the Auth.js
  handlers.
- **`src/modules/api/`** (UI-shaped) — Hono `OpenAPIHono`
  instance that exposes the `/api/*` (non-auth) surface.
  Mounted at `app/api/[...path]/route.ts`. Calls application
  actions.
- **`src/modules/auth/`** (the `auth` module) — domain
  (entities, services, ports), application (actions, DTOs),
  infrastructure (repositories, Argon2id wrapper, Auth.js
  config).
- **`src/shared/`** — cross-cutting infrastructure: Prisma
  client, env schema (Zod), in-process event dispatcher,
  structured logger.

**Dependency direction in code:**

```text
UI (app/, src/modules/api/) → Application (src/modules/auth/application) → Domain (src/modules/auth/domain) ← Infrastructure (src/modules/auth/infrastructure + src/shared/db)
```

The Auth.js handler at `app/api/auth/[...nextauth]/route.ts`
calls `auth()` from `src/modules/auth/infrastructure/authjs.ts`,
which internally wires the Prisma adapter to our domain
ports. The application actions in `src/modules/auth/application/`
are called by the Hono handlers in `src/modules/api/` and by
any server component in `app/` that needs the current user.

**Public API of the module** (`src/modules/auth/index.ts`):

- `auth()` — Auth.js v5 server-side helper.
- `signIn`, `signOut` — server actions from Auth.js.
- `handlers` — `GET` and `POST` for `/api/auth/*`, mounted at
  `app/api/auth/[...nextauth]/route.ts`.
- `honoApp` — the `OpenAPIHono` instance for the non-auth
  `/api/*` routes, exported for typed client consumption by
  the UI.
- Event name constants `UserRegistered` and `UserSignedIn`.

## 2. Library decisions

Each decision is an ADR-style subsection: chosen,
alternatives, rationale, link to the rule(s) it satisfies.

### Auth.js v5 (`next-auth@5.0.0-beta.X`)

- **Chosen for** — OAuth (Google) + Credentials + database
  sessions in a single library. First-class Next.js App
  Router support, server-side `auth()` helper, and a
  maintained Prisma adapter.
- **Pin**: exact `next-auth@5.0.0-beta.X` (no caret, no
  tilde). The version is captured in `package.json`'s
  `dependencies` and enforced by `pnpm install
--frozen-lockfile` in CI.
- **Alternatives**:
  - **Lucia** — rejected. Lucia is lower-level and would
    require us to build the OAuth flow, session resolution,
    and CSRF protection ourselves. Auth.js gives us all
    three out of the box.
  - **Clerk** — rejected. SaaS vendor lock-in, monthly
    per-MAU cost, and the data lives on Clerk's infra. We
    own the Postgres database; the identity layer lives with
    it.
  - **Supabase Auth** — rejected. Would have pulled us
    toward Supabase Postgres and its row-level security
    model. The stack is Neon + Prisma; Auth.js fits
    natively.
  - **Hand-rolled OAuth + JWT** — rejected. That surface
    area (custom OAuth callback, custom refresh-token
    rotation, JWT signing layer) is too big for a single
    change; we trade custom code for a battle-tested
    library.
- **Status note**: `next-auth@beta` is the version everyone
  uses in 2026 despite being officially beta. Mitigation:
  pin the exact version, watch releases, plan to upgrade to
  stable when it ships.
- **Decision driver**: BR-AUTH-5, BR-AUTH-6, BR-AUTH-7,
  BR-AUTH-8, BR-AUTH-10 (Auth.js's OAuth and session
  handling cover all of them).

### `@auth/prisma-adapter`

- **Chosen for** — the official Prisma adapter for Auth.js
  v5. The adapter owns the schema (User, Account, Session,
  VerificationToken) and the read/write paths between Auth.js
  and the database.
- **Alternatives** — none practical. The Prisma adapter is
  the only Auth.js-v5-supported Postgres adapter with first-
  party maintenance. Custom adapters were considered and
  rejected (we'd be re-implementing the schema and the
  hooks).
- **Decision driver**: BR-AUTH-7, BR-AUTH-8 (the `Session`
  table and the read-on-every-request pattern), and the
  proposal's "Auth.js + Prisma adapter" commitment.

### Argon2id library — `@node-rs/argon2` (with `argon2` fallback)

- **Chosen**: `@node-rs/argon2` — prebuilt NAPI binaries for
  Alpine (`node:20-alpine`), no `node-gyp` step at install
  time, fast on Node 20. The package is maintained by the
  `@node-rs` org and used widely in the Node ecosystem in 2026.
- **Fallback**: `argon2` (the `node-rs/argon2` author's
  sibling npm package, the canonical Node binding). Used
  only if the `@node-rs/argon2` prebuilt fails to load on
  the Fly.io 1-CPU VM. Both expose the same primitive
  surface (`hash`, `verify`, `Algorithm.Argon2id`), so the
  fallback swap is a one-line import change.
- **Rejected**:
  - `bcrypt` — out of scope per the proposal. BR-AUTH-3
    commits us to Argon2id; bcrypt predates the
    memory-hardness requirement.
  - `argon2-browser` (pure-JS) — too slow at the parameter
    set we want. We target 50–100 ms per hash on Fly.io
    1-CPU; pure-JS cannot reach that.
  - Roll-your-own scrypt — rejected. scrypt is acceptable
    in isolation, but the proposal is explicit about
    Argon2id. No new evidence in the proposal supports a
    swap.
- **Decision driver**: BR-AUTH-3 (Argon2id only, 50–100 ms
  target on Fly.io 1-CPU). The library choice is finalized
  in the apply phase via the benchmark gate described in §8.

### Prisma 6

- **Chosen for** — typed schema (the single source of truth
  for the data model), versioned migrations
  (`prisma migrate dev` / `prisma migrate deploy`), and
  first-class Neon support (Neon ships a Prisma connector
  and a connection pooler that Prisma 6 knows how to use).
- **Alternatives**:
  - **Kysely** — too low-level; the cost of writing the
    schema in two places (TS types + migrations) outweighs
    the wins.
  - **Raw SQL + node-postgres** — rejected. The auth module
    is small enough that we could get away with it, but the
    other capabilities (accounts, transactions, snapshots)
    are not, and we want a consistent ORM across all of
    them.
- **Decision driver**: proposal §What (Prisma 6 explicit);
  `database-strategy` skill (ORM for abstraction, versioned
  migrations, repositories in infrastructure layer).

### Hono (application catch-all)

- **Chosen for** — first-class TypeScript, lightweight
  runtime, clean integration with Next.js as a route
  handler, and the `OpenAPIHono` extension for typed
  client export. The UI consumes the typed client and gets
  end-to-end type safety from the server route to the
  browser fetch.
- **Alternatives**:
  - **Pure Next.js route handlers** (e.g. `route.ts` files
    per endpoint) — rejected. We want a single catch-all
    with a Hono app inside, and Hono's routing primitives
    (middleware, context, validators) are a better fit for
    the breadth of endpoints we expect (this change ships
    3; later changes add `/api/accounts/*`,
    `/api/transactions/*`, etc.).
  - **tRPC** — rejected. tRPC is great for tightly-coupled
    client/server codebases, but the API surface we
    eventually want (mobile clients, third-party
    integrations) is HTTP+JSON, not tRPC. Hono +
    `OpenAPIHono` is closer to that.
  - **Fastify** — rejected. We don't need the plugin
    ecosystem; Hono's surface is smaller and TS-first.
- **Decision driver**: proposal §Implications and impact
  (Hono mounted as a single catch-all in
  `app/api/[...path]/route.ts`); `api-design` skill (REST
  conventions, response format, status codes).

### Zod

- **Chosen for** — env validation at startup
  (`src/shared/env/env.schema.ts`), request body validation
  in every Hono action boundary, and as the source of
  truth for the route DTOs (`src/modules/auth/application/dto/`).
- **Alternatives**:
  - **Valibot** — considered. Lighter and modular, but the
    ecosystem (Hono's `@hono/zod-validator`, OpenAPI
    generators, error message formatters) is more mature
    around Zod. The bundle-size argument is weak for a
    server-only project.
  - **TypeBox** — considered. Strong type inference, but
    the API ergonomics around parsing and error formatting
    are not as friendly for our use case.
- **Decision driver**: `env-config` skill (Zod env schema
  at startup); `api-design` skill (request body validation);
  `error-handling` skill (`VALIDATION_ERROR` carries the
  Zod issue list as `details`).

### Neon (Postgres)

- **Chosen for** — the free tier (0.5 GB), branching
  (one-click per-PR database for tests and previews),
  serverless driver (no connection pooler to maintain
  ourselves), and first-class Prisma support.
- **Alternatives**:
  - **Supabase** — rejected. Would have pulled us toward
    Supabase Auth and its row-level security. The stack is
    Auth.js + Prisma.
  - **Local Postgres in dev** — kept for the integration
    test suite (Vitest spins up a Postgres container via
    testcontainers), but the dev/staging/prod database is
    Neon.
  - **Railway Postgres** — equivalent. We chose Neon
    because the branching workflow is the killer feature
    for our PR-based test environment story.
- **Decision driver**: proposal §What (Neon explicit),
  free tier + branching for PRs and the security review
  work that lives in the `judge` subagent.

### Fly.io (deploy)

- **Chosen for** — the free tier (1 shared-cpu-1x VM in
  region `eze` Buenos Aires), persistent Docker
  deployments, secrets management, and `fly secrets` for
  the Auth.js env vars.
- **Alternatives**:
  - **Vercel** — rejected. Vercel runs Next.js on its own
    runtime, but the `fly-deploy` change (separate) wants
    a multi-stage Docker image with the Prisma client
    baked in. Vercel's serverless model is a different
    surface area.
  - **Render** — equivalent. We chose Fly.io because the
    region list includes `eze` (Buenos Aires), which
    matches the project's latency target for an
    Argentina-based user.
- **Decision driver**: proposal §Stack v2 (Fly.io explicit);
  `deployment` skill (multi-stage Dockerfile, health
  check, stateless container). The `fly-deploy` change
  owns the actual `fly.toml` and the GitHub Actions deploy
  workflow.

## 3. Auth.js v5 configuration

The `auth.ts` file at the repo root (or
`src/modules/auth/infrastructure/authjs.ts`, re-exported)
configures Auth.js v5 with the Prisma adapter, the Google
provider, and the Credentials provider.

```ts
// src/modules/auth/infrastructure/authjs.ts
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/shared/db/prisma';
import { env } from '@/shared/env/env';
import { verifyArgon2id, hashArgon2id } from '@/modules/auth/infrastructure/external/argon2.hasher';
import { z } from 'zod';

// --- Credentials authorize() input validation ---
const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128), // Length check is BR-AUTH-2 at register; here we just need a string.
});

// A fixed dummy hash used to equalize timing when the user is
// not found or has no passwordHash (BR-AUTH-4, BR-AUTH-9).
// Generated once at module init via hashArgon2id(env.ARGON2ID_DUMMY_PASSWORD)
// and cached. The plain string is never logged.
const DUMMY_HASH: string = hashArgon2id(env.ARGON2ID_DUMMY_PASSWORD);

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  secret: env.AUTH_SECRET,
  pages: {
    signIn: '/auth/signin', // mounted by the ui-auth-shell change
    signOut: '/auth/signout', // same
  },
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: 'select_account',
          scope: 'openid email profile',
        },
      },
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize(credentials) {
        // 1. Zod validation at the action boundary.
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const normalizedEmail = email.trim().toLowerCase();

        // 2. Look up the user.
        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        // 3. Timing equalization (BR-AUTH-4, BR-AUTH-9).
        // If the user is missing or has no passwordHash, we still
        // run an Argon2id verify against the dummy hash so the
        // response time is statistically indistinguishable from
        // the "found, wrong password" path.
        if (!user || !user.passwordHash) {
          await verifyArgon2id(DUMMY_HASH, password);
          return null;
        }

        // 4. Verify the password.
        const ok = await verifyArgon2id(user.passwordHash, password);
        if (!ok) return null;

        // 5. Return the user object Auth.js knows about.
        // We return only `id`, `email`, `name`, `image`. The
        // `defaultProvider` and `lastLoginAt` are stamped by the
        // signIn callback below.
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        };
      },
    }),
  ],
  callbacks: {
    // signIn runs after the Credentials authorize() returns
    // successfully, or after the Google OAuth callback resolves.
    // We use it to stamp lastLoginAt and (on first registration)
    // defaultProvider (BR-AUTH-13).
    async signIn({ user, account, profile }) {
      if (!user?.id) return false;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          // defaultProvider is set only on first registration.
          // We detect "first registration" by checking if
          // lastLoginAt was null before the update. The Prisma
          // update with `data: { lastLoginAt: new Date() }` on
          // a row that previously had lastLoginAt = null does
          // not change defaultProvider. A separate code path in
          // the UserRegistered action sets defaultProvider on
          // the very first insert.
        },
      });
      return true;
    },
    // session runs on every auth() call. We add `defaultProvider`
    // and `lastLoginAt` to the session JSON so the UI can render
    // them via /api/me and via useSession() on the client.
    async session({ session, user }) {
      if (session.user && user?.id) {
        session.user.id = user.id;
        // The Prisma User row carries defaultProvider and
        // lastLoginAt; Auth.js v5's database session strategy
        // gives us the `user` argument populated from the User
        // table, so we can read both fields directly.
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { defaultProvider: true, lastLoginAt: true },
        });
        if (dbUser) {
          (session.user as any).defaultProvider = dbUser.defaultProvider;
          (session.user as any).lastLoginAt = dbUser.lastLoginAt;
        }
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
```

The `handlers` are mounted at
`app/api/auth/[...nextauth]/route.ts`:

```ts
// app/api/auth/[...nextauth]/route.ts
export { GET, POST } from '@/modules/auth/infrastructure/authjs';
```

(Where `GET` and `POST` are the `handlers.GET` and
`handlers.POST` re-exported by the `authjs.ts` module above,
or destructured at the call site. The pseudocode shows the
intent; the exact export shape is finalized in the apply
phase.)

**Notes on the design choices above:**

- The `signIn` callback stamps `lastLoginAt` on every
  successful sign-in. `defaultProvider` is set ONLY in the
  `POST /api/auth/register` action (for local signups) and
  inside the OAuth callback for first-time Google signups.
  The `signIn` callback never changes `defaultProvider`
  (BR-AUTH-13).
- The `session` callback adds `defaultProvider` and
  `lastLoginAt` to the session JSON. The `GET /api/me`
  Hono endpoint also reads from the DB (it is server-side
  and re-resolves the user), so the session callback is
  mostly for client components that use `useSession()`.
- The Credentials `authorize()` runs an Argon2id verify
  against `DUMMY_HASH` when the user is not found. The
  `DUMMY_HASH` is generated once at module init from
  `env.ARGON2ID_DUMMY_PASSWORD` (a long random string
  set as a Fly secret, never logged). The verify call
  takes the same time as a real verify, equalizing the
  response shape and timing (BR-AUTH-4, BR-AUTH-9).
- The `authorize()` function returns the four fields
  Auth.js knows about: `id`, `email`, `name`, `image`.
  Auth.js does not store `defaultProvider` or
  `lastLoginAt` on the user object it manages; we read
  those from the DB in the `session` callback and in
  `GET /api/me`.

## 4. Hono catch-all shape

The Hono catch-all lives at
`app/api/[...path]/route.ts` and delegates to the
`honoApp` exported from `src/modules/api/app.ts`.

```ts
// app/api/[...path]/route.ts
import { honoApp } from '@/modules/api/app';
import type { NextRequest } from 'next/server';

const handler = (req: NextRequest) => honoApp.fetch(req);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
```

The Hono app:

```ts
// src/modules/api/app.ts
import { OpenAPIHono } from '@hono/zod-openapi';
import { auth } from '@/modules/auth'; // Auth.js helper
import { registerAction } from '@/modules/auth/application/actions/register.action';
import { meAction } from '@/modules/auth/application/actions/me.action';
import { healthAction } from '@/modules/auth/application/actions/health.action';
import { originCheck } from '@/modules/api/middlewares/origin-check';
import { env } from '@/shared/env/env';

export const honoApp = new OpenAPIHono();

// --- Middleware: resolve session and attach user to context. ---
honoApp.use('*', async (c, next) => {
  const session = await auth();
  c.set('user', session?.user ?? null);
  c.set('session', session ?? null);
  await next();
});

// --- Health: public, no auth. ---
honoApp.get('/health', (c) => healthAction(c));

// --- Me: requires a valid session. ---
honoApp.get('/me', (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
  }
  return meAction(c, user);
});

// --- Register: mutating state, requires Origin check. ---
honoApp.post('/auth/register', originCheck(env.APP_URL), (c) => registerAction(c));
```

**Auth.js is NOT routed through Hono.** Auth.js owns
`/api/auth/*` and is mounted at
`app/api/auth/[...nextauth]/route.ts`. Hono's catch-all in
`app/api/[...path]/route.ts` does NOT match `/api/auth/*`
because Next.js's file-based routing resolves the more
specific `app/api/auth/[...nextauth]/route.ts` first. The
two surfaces are siblings:

```text
app/api/
├── auth/[...nextauth]/route.ts   # Auth.js (handlers.GET, handlers.POST)
└── [...path]/route.ts            # Hono (honoApp.fetch)
```

**`origin-check` middleware** for mutating endpoints:

```ts
// src/modules/api/middlewares/origin-check.ts
import type { MiddlewareHandler } from 'hono';

export function originCheck(allowedOrigin: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD') return next();
    const origin = c.req.header('Origin');
    if (!origin || new URL(origin).origin !== new URL(allowedOrigin).origin) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Cross-origin request blocked' } }, 403);
    }
    return next();
  };
}
```

In MVP, `POST /api/auth/register` is the only mutating
endpoint. Later changes add more; each one runs through the
same `originCheck` middleware.

**`OpenAPIHono` and typed client export.** The Hono app is
an `OpenAPIHono` instance, which means we can:

1. Serve the OpenAPI spec at `/api/doc` (debug-only, behind
   `env.NODE_ENV !== 'production'`).
2. Generate a typed client (`hc<typeof honoApp>`) for use
   from the UI in the `ui-auth-shell` change.

The typed client is exported from
`src/modules/api/index.ts` alongside the `honoApp` instance.

## 5. Prisma schema

The full `prisma/schema.prisma` for the auth-related
models. This is the single source of truth for the data
model. Other capabilities (accounts, transactions, etc.) add
their own models in later changes; the auth models are stable
from this change forward.

```prisma
// prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// --- Auth.js Prisma adapter canonical models ---
// Source: https://authjs.dev/reference/adapter/prisma
// Three columns added to User on top of the canonical schema:
//   - passwordHash     (BR-AUTH-3, BR-AUTH-9)
//   - defaultProvider  (BR-AUTH-13)
//   - lastLoginAt      (stamped by the signIn callback)

model User {
  id              String    @id @default(cuid())
  name            String?
  email           String    @unique
  emailVerified   DateTime?
  image           String?

  // --- Additions on top of the Auth.js canonical schema ---
  passwordHash    String?
  defaultProvider String    @default("local")
  lastLoginAt     DateTime?

  accounts        Account[]
  sessions        Session[]

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([createdAt]) // for the user-deletion change's bulk queries
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([expires]) // for the periodic GC job
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

**Index choices** (and the why):

- `User.email` is `@unique`. The `findUnique` query in
  `authorize()` is the primary access pattern. Comparison
  is case-insensitive by application convention; the
  application lowercases on write.
- `User.createdAt` gets an explicit `@@index` for the
  `user-deletion` change's "users created before N" bulk
  query.
- `Account(provider, providerAccountId)` is `@@unique` —
  BR-AUTH-10. This is the only line of defense against
  the "same Google account linked to two users" attack.
- `Session.sessionToken` is `@unique`. The primary access
  pattern is `findUnique({ where: { sessionToken } })` on
  every `auth()` call.
- `Session.expires` gets an explicit `@@index` for the
  periodic "garbage-collect expired sessions" job (a
  separate change). The `auth()` lookup is by
  `sessionToken`, not by `expires`, so this index is for
  the GC path only.
- `Account.userId` and `Session.userId` are indexed
  implicitly via the foreign-key relation. Prisma creates
  the index on the foreign-key column automatically.

**Cascade behavior:**

- `Account.user` and `Session.user` use
  `onDelete: Cascade`. When a `User` is deleted (in the
  `user-deletion` change), all `Account` and `Session`
  rows for that user are deleted by Postgres in the same
  transaction.
- `VerificationToken` has no relation to `User`; tokens
  are identified by the `identifier` string. The
  `user-deletion` change cleans up tokens explicitly.

**What the application NEVER writes by hand:** The
Auth.js adapter owns the read/write paths for `Account`,
`Session`, and `VerificationToken`. Application code
writes to `User` only via the Prisma client. Specifically,
the application NEVER:

- Inserts a `Session` row directly. Auth.js does it.
- Updates a `Session.expires` directly. Auth.js does it
  via the sliding-window extension.
- Deletes a `Session` row directly. Auth.js's sign-out
  does it (BR-AUTH-8).
- Inserts an `Account` row directly. Auth.js's OAuth
  callback does it (BR-AUTH-5, BR-AUTH-10).
- Inserts a `VerificationToken` row directly. The
  `email-verification` change will own it; for now, the
  table is empty.

## 6. Migrations

Prisma's versioned migration tooling handles the schema.
Locally: `pnpm prisma migrate dev --name auth_foundation`
generates and applies the migration. In the CI/deploy
pipeline: `pnpm prisma migrate deploy` runs at container
startup (final decision deferred to the `fly-deploy`
change; either a startup hook or a Fly release command).

The single migration file produced by this change:

```text
prisma/migrations/
└── 20260610000000_auth_foundation/
    └── migration.sql
```

The migration creates the four tables (`User`, `Account`,
`Session`, `VerificationToken`) and all the indexes listed
in §5. It is generated by `prisma migrate dev` from the
schema in §5; we do NOT hand-author the SQL (per
`database-strategy` skill: "schema is the source of truth,
the migration is generated").

**Migration commands:**

| Command                                 | When                    | Notes                                                 |
| --------------------------------------- | ----------------------- | ----------------------------------------------------- |
| `pnpm prisma migrate dev --name <name>` | Local development       | Generates + applies. Resets the DB if there is drift. |
| `pnpm prisma migrate deploy`            | CI / container startup  | Applies pending migrations. Idempotent.               |
| `pnpm prisma generate`                  | After any schema change | Regenerates the typed Prisma client.                  |
| `pnpm prisma studio`                    | Local debugging         | GUI. Not used in CI.                                  |

**CI integration** is described in §9. The `test` job
spins up a fresh Postgres (via testcontainers or a Neon
branch) and runs `prisma migrate deploy` before the Vitest
suite.

**Down-migrations** are not in scope for MVP. If we need
to roll back, we ship a forward-fix migration. The
`fly-deploy` change may add a rollback runbook, but the
schema itself does not carry down-migrations.

## 7. Environment variables

Validated at startup with a Zod schema (per `env-config`
skill). Any missing or malformed value fails fast with a
clear error. The schema lives at
`src/shared/env/env.schema.ts` and is parsed at module
init; the resulting `env` object is exported and used by
every module.

```ts
// src/shared/env/env.schema.ts
import { z } from 'zod';

const envSchema = z.object({
  // --- Runtime ---
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // --- Database ---
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // --- Auth.js v5 ---
  // Auth.js reads AUTH_SECRET (its own cookie-signing secret).
  // Must be at least 32 bytes. We enforce min(32) on the raw
  // string and let the runtime do the rest.
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 bytes'),
  // The public URL of the app. Used for OAuth callback
  // construction and for the Hono origin-check allowlist.
  AUTH_URL: z.string().url().default('http://localhost:3000'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  // --- Google provider ---
  AUTH_GOOGLE_ID: z.string().min(1, 'AUTH_GOOGLE_ID is required'),
  AUTH_GOOGLE_SECRET: z.string().min(1, 'AUTH_GOOGLE_SECRET is required'),

  // --- Argon2id ---
  // A long random string used to seed the DUMMY_HASH for
  // timing-equalization in the Credentials authorize() function
  // (BR-AUTH-4, BR-AUTH-9). Generated once and stored as a
  // Fly secret. Never logged.
  ARGON2ID_DUMMY_PASSWORD: z.string().min(32, 'ARGON2ID_DUMMY_PASSWORD must be at least 32 bytes'),

  // --- Fly.io (optional) ---
  FLY_REGION: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

**Cross-field validation** (lives in the env module, not in
Zod's per-field rules): at startup we assert that
`new URL(env.AUTH_URL).origin === new URL(env.APP_URL).origin`.
A mismatch is logged at `error` and the process exits 1.
This catches the most common "OAuth callback works in dev
but fails in prod" misconfiguration at boot time, not at
the first OAuth round trip.

**`.env.example`** (committed) carries the same keys with
empty values, except for `AUTH_URL` and `APP_URL` which
default to `http://localhost:3000` and `LOG_LEVEL` which
defaults to `info`. `.env` and `.env.production` are
gitignored. Production secrets live in `fly secrets`
(encrypted at rest).

**Local development:**

```bash
# .env (gitignored)
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/gastos_dev
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=http://localhost:3000
APP_URL=http://localhost:3000
AUTH_GOOGLE_ID=<from Google Cloud Console>
AUTH_GOOGLE_SECRET=<from Google Cloud Console>
ARGON2ID_DUMMY_PASSWORD=<openssl rand -base64 32>
```

**Production (Fly.io):**

```bash
fly secrets set \
  DATABASE_URL=<neon-pooled-url> \
  AUTH_SECRET=<openssl rand -base64 32> \
  AUTH_URL=https://gastos-personales.fly.dev \
  APP_URL=https://gastos-personales.fly.dev \
  AUTH_GOOGLE_ID=<from Google Cloud Console> \
  AUTH_GOOGLE_SECRET=<from Google Cloud Console> \
  ARGON2ID_DUMMY_PASSWORD=<openssl rand -base64 32>
```

The `fly-deploy` change owns the actual `fly secrets set`
command and the order in which secrets are provisioned.

## 8. Testing strategy

Per the `testing-standards` skill: AAA pattern, no
`if`/`else`/`for` inside test bodies, parametrized where
needed, ≥80 % line + branch coverage on the `auth` module
(domain + application). Strict TDD: tests are written
before the implementation they pin. Test runner: **Vitest**
(the proposal commits to `pnpm test`; Vitest is the TS
default and works cleanly with ESM + pnpm).

> **Note on the project-wide `bun test` reference** in
> `openspec/config.yaml`: that line is a v1 leftover. The
> v2 stack is Node + pnpm, so the runner is `pnpm test`
> (Vitest under the hood). The `strictTdd.runner` value
> is updated in the `auth-foundation` apply phase when
> the Vitest config is committed.

### Unit tests (domain services + infrastructure wrappers)

Located at `src/modules/auth/domain/**/*.test.ts` and
`src/modules/auth/infrastructure/external/*.test.ts`.
Pure functions, no DB, no HTTP.

| Suite                                 | What it covers                                                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `argon2.hasher`                       | `hashArgon2id` and `verifyArgon2id` with the chosen parameters; reject wrong passwords; verify returns `false` on a tampered hash.                               |
| `email.normalize`                     | Lowercase + trim; strips surrounding whitespace; rejects empty.                                                                                                  |
| `default-provider` (domain service)   | Returns `"local"` for users created by `register` action; returns `"google"` for first-time Google signups; does NOT change on subsequent sign-ins (BR-AUTH-13). |
| `user.repository` (in-memory mock)    | `create`, `findByEmail`, `findById`, case-insensitive lookup.                                                                                                    |
| `account.repository` (in-memory mock) | `create` honors the unique constraint on `(provider, providerAccountId)`.                                                                                        |
| `session.repository` (in-memory mock) | `create`, `findByToken`, `delete` (sign-out).                                                                                                                    |

### Integration tests (Hono + Prisma + Postgres)

Located at `src/modules/auth/infrastructure/repositories/*.repository.test.ts`
and `src/modules/api/**/*.test.ts`. The test database is a
Postgres container per suite (testcontainers) or a Neon
branch per CI run. We do not mock the repositories in
integration tests; we mock only the external boundaries
(Google's userinfo endpoint, the system clock).

| Suite                                 | What it covers                                                                                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user.repository` (real Prisma)       | `create`, `findByEmail` (case-insensitive), `update` (lastLoginAt, defaultProvider).                                                                                                            |
| `account.repository` (real Prisma)    | `create`, unique-violation on duplicate `(provider, providerAccountId)`.                                                                                                                        |
| `session.repository` (real Prisma)    | `create`, `findByToken`, `delete`.                                                                                                                                                              |
| `register.action`                     | 201 success; 409 `EMAIL_TAKEN` with comparable timing; 400 `WEAK_PASSWORD`; 400 `VALIDATION_ERROR`. Emits `UserRegistered` exactly once.                                                        |
| `me.action`                           | 200 with `PublicUser` (no `passwordHash`, no `emailVerified`); 401 `UNAUTHORIZED` with no session, expired session, unknown user — identical shape.                                             |
| `health.action`                       | 200 with `{ status: "ok", version, uptime }`.                                                                                                                                                   |
| `hono.catch-all`                      | Mount + dispatch: `GET /api/me` returns 200 with session, 401 without; `POST /api/auth/register` 201, 409, 400; `GET /api/health` 200.                                                          |
| `oauth-callback.flow` (mocked Google) | Auto-link on email match (BR-AUTH-5); new user on first email; `OAuthAccountNotLinked` on `(provider, providerAccountId)` conflict (BR-AUTH-10); reject on `email_verified: false` (BR-AUTH-6). |

### Security tests

Located at `src/modules/auth/__tests__/security/*.test.ts`.
These are integration tests but live in a dedicated folder
so the reviewer can audit them in one pass.

| Test                        | What it proves                                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `login.timing.test.ts`      | The response time for "email not found" is statistically indistinguishable from "wrong password" and from "Google-only user" (BR-AUTH-4, BR-AUTH-9). Sample size and threshold documented in the test. |
| `oauth.state-csrf.test.ts`  | A callback with a missing, malformed, or expired `state` parameter is rejected by Auth.js; no `User` is created; no `Account` row is inserted.                                                         |
| `secrets.in-logs.test.ts`   | A request that includes a `password`, a CSRF token, an `Authorization` cookie, or a Google `code` query param does not cause any of those values to appear in the captured log output (BR-AUTH-11).    |
| `origin-check.test.ts`      | `POST /api/auth/register` with a missing or mismatched `Origin` header returns 403 `FORBIDDEN`.                                                                                                        |
| `argon2.parameters.test.ts` | `hashArgon2id` with the chosen parameters produces a hash in the 50–100 ms range on the target VM. Fails the test if the runtime is outside the band.                                                  |
| `cookie.attributes.test.ts` | The `authjs.session-token` cookie has `HttpOnly` and `SameSite=Lax` always; `Secure` in production, omitted in dev.                                                                                    |

### Coverage gate

`pnpm test -- --coverage` runs in CI. The auth module's
line + branch coverage must be ≥ 80 % to merge (per the
`testing-standards` skill's "minimum 80 % on domain +
application" rule). The actual achieved coverage is
recorded in the verify-report at the end of the change.

### Vitest configuration

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // not jsdom — we test the server, not the UI
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json'],
      include: [
        'src/modules/auth/**',
        'src/shared/db/**',
        'src/shared/env/**',
        'src/modules/api/**',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
    testTimeout: 10000, // Argon2id verify + DB roundtrip can be slow
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

The `test/setup.ts` file initializes the test Postgres
container (testcontainers) and exports a teardown that
drops the database. The `DATABASE_URL` is rewritten to
point at the container before `envSchema.parse()` runs.

## 9. CI workflow

GitHub Actions, on `pull_request` to `develop` and on
`push` to `develop` and `main`. The workflow is owned by
this change; the `fly-deploy` change may add a `deploy`
job later (it does NOT live in this PR).

```yaml
# .github/workflows/ci.yml
name: CI

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
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: gastos_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/gastos_test
      AUTH_SECRET: ci-only-secret-32-bytes-min-padding
      AUTH_URL: http://localhost:3000
      APP_URL: http://localhost:3000
      AUTH_GOOGLE_ID: ci-google-id
      AUTH_GOOGLE_SECRET: ci-google-secret
      ARGON2ID_DUMMY_PASSWORD: ci-dummy-password-32-bytes-min-padding
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma migrate deploy
      - run: pnpm test -- --coverage
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage
          path: coverage/
      - name: Comment coverage on PR
        if: github.event_name == 'pull_request'
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          header: coverage
          message: |
            Coverage report:
            - Lines: ${{ steps.coverage.outputs.lines }}
            - Branches: ${{ steps.coverage.outputs.branches }}
            - Functions: ${{ steps.coverage.outputs.functions }}
            See the `coverage/` artifact for the full lcov report.
```

**Job dependencies:** all three jobs (`lint`, `typecheck`,
`test`) run in parallel. The `fly-deploy` change adds a
`build` and `deploy` job that depend on all three.

**Cache strategy:** `actions/setup-node` with
`cache: 'pnpm'` caches `~/.local/share/pnpm/store` keyed
on `pnpm-lock.yaml`. `corepack enable` provisions `pnpm`
from the `packageManager` field in `package.json`. CI
uses `pnpm install --frozen-lockfile` (no implicit
upgrades).

**Required checks on PRs to `develop`:** `lint`,
`typecheck`, `test` must all pass. The `develop` branch
protection rule enforces this (set up in the initial
chore commit, not in this change).

**Concurrency:** the `concurrency` group cancels
in-progress runs for the same ref, so a force-push to a
PR cancels the old test run.

## 10. Open questions for the parent

These are the 8 decision gaps from the proposal, encoded
as design-level decisions with conservative defaults. **None
of them block apply.** Each has a default and a resolution
path; the apply phase can ship with the defaults and the
sdd-verify phase can re-open any of them.

1. **Does `User.email` get updated when Google returns a new
   email?**

   - **Default**: No. We keep the original email the user
     registered with. The Google account's `sub`
     (`providerAccountId`) is the only link key; if the
     user changes their email at Google, our `User.email`
     does NOT change. We surface the change in the UI as a
     notification ("tu email de Google cambió; el email de
     tu cuenta sigue siendo el original").
   - **Resolution path**: if product wants auto-sync, we
     add a callback in the `signIn` flow that updates
     `User.email` from the Google profile on every OAuth
     callback. Tracked in a future change.

2. **Should `lastLoginAt` updates go through the Auth.js
   `signIn` callback or a Prisma middleware?**

   - **Default**: Auth.js `signIn` callback. The
     `prisma.user.update({ data: { lastLoginAt: new Date()
} })` call lives in the callback shown in §3.
   - **Resolution path**: Prisma middleware would work but
     is harder to test (it runs on every query). The
     callback is the documented Auth.js extension point.

3. **Should we expose Auth.js's built-in `/api/auth/session`
   or wrap it with a Hono endpoint?**

   - **Default**: expose Auth.js's built-in route directly.
     The shape (`{ user, expires }`) is stable and the UI's
     `useSession()` hook consumes it natively. `GET /api/me`
     in Hono is for server components and server-side
     fetches; it reads `auth()` directly, not
     `/api/auth/session`.
   - **Resolution path**: if a custom field is needed in
     the session JSON, we add it in the `session` callback
     (§3) and re-survey the wire shape.

4. **Session sliding window: 24h (Auth.js default) or
   shorter?**

   - **Default**: 24h, which is Auth.js's default
     `session.updateAge = 24 * 60 * 60`. The 30-day
     `session.maxAge` is the cap; the sliding extension
     happens on each request that finds a valid session.
   - **Resolution path**: change `session.updateAge` in
     `authConfig` and re-test the security review with the
     new value.

5. **What happens to other sessions on password change?**

   - **Default**: nothing in MVP. The other sessions
     survive until they expire on their own. There is no
     password-change endpoint in this change, so this
     question is moot for now.
   - **Resolution path**: a future `password-management`
     change adds the endpoint and uses
     `prisma.session.deleteMany({ where: { userId } })` to
     revoke all other sessions on password change.

6. **Should we send a notification email on auto-link?**

   - **Default**: No. Out of scope. A future hardening
     pass owns the transactional email infrastructure.
   - **Resolution path**: track in the `email-notifications`
     change that follows the `user-deletion` change.

7. **Do we need a "switch account" UI for users with
   multiple OAuth providers?**

   - **Default**: No. The UI shows one provider at a time
     (the `defaultProvider` field on the `me` response).
     "Switch account" is a UX feature; if product wants it,
     the `ui-auth-shell` change owns the UI.
   - **Resolution path**: track for the `ui-auth-shell`
     follow-up.

8. **Argon2id library: `argon2` (native) vs.
   `@node-rs/argon2`?**
   - **Default**: `@node-rs/argon2`. Prebuilt NAPI binaries
     for Alpine, no `node-gyp` step, fast on Node 20.
   - **Resolution path**: the apply phase runs the
     benchmark gate described in §2 (Argon2id library).
     If `@node-rs/argon2` fails to load or hashes outside
     the 50–100 ms target, we fall back to `argon2` (a
     one-line import change in
     `src/modules/auth/infrastructure/external/argon2.hasher.ts`).
     The benchmark result is recorded in the
     `apply-progress.md` file.

## 11. Risks specific to apply

Each risk has a mitigation that lives inside an existing
task (added in `sdd-tasks`), not a new task.

| Risk                                                                                                                | Mitigation                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`@node-rs/argon2` fails to install or load on the target VM.**                                                    | The apply task for the password service has a "verify load + benchmark" step that runs the install + a smoke test. If the prebuilt is missing, the task falls back to `argon2` (the npm package) and re-runs the benchmark. Both expose the same primitive surface.                                                                              |
| **Argon2id hash time outside the 50–100 ms target on the Fly.io 1-CPU VM.**                                         | The benchmark gate in the password service task. If p50 hash time is outside the band, we re-tune `timeCost` (1, 2, 3) before shipping. The decision is recorded in `apply-progress.md`.                                                                                                                                                         |
| **Auth.js v5 beta API surface changes between the pinned version and a later beta.**                                | We pin the exact `next-auth@5.0.0-beta.X` version in `package.json` and use `pnpm install --frozen-lockfile` in CI. Upgrading requires an explicit decision in a later change.                                                                                                                                                                   |
| **Prisma migration drift on the Neon free tier during the apply phase.**                                            | The apply task for the migration runs `prisma migrate dev` locally first, commits the generated `migration.sql`, and runs `prisma migrate deploy` in the CI test job. The deploy is idempotent.                                                                                                                                                  |
| **Google OAuth credentials misconfigured at first sign-in attempt.**                                                | The apply task for the Google provider has a "smoke test with the test OAuth client" step. The test client ID and secret are in `.env.test`; a manual sign-in is performed in dev to verify the round trip before marking the task done.                                                                                                         |
| **Hono catch-all accidentally matches `/api/auth/*` and double-handles requests.**                                  | The apply task for the catch-all includes a routing test that proves `/api/auth/signin` goes to Auth.js and `/api/me` goes to Hono. The test asserts both routes return their expected shapes from the same Next.js server.                                                                                                                      |
| **Origin-check middleware blocks legitimate cross-origin POSTs in dev.**                                            | The `APP_URL` default is `http://localhost:3000`. The apply task for the origin-check middleware tests both same-origin (allowed) and cross-origin (blocked) cases. The UI mounts the form on the same origin, so legitimate requests are never blocked.                                                                                         |
| **`UserRegistered` event dispatched on auto-link path.**                                                            | The event is dispatched in the `POST /api/auth/register` action (for local) and in the OAuth callback's "first time we see this email" branch (for Google). The auto-link path (BR-AUTH-5) does NOT dispatch `UserRegistered`. The apply task for the events includes a parametrized test that asserts the event is fired exactly once per user. |
| **Argon2id DUMMY_HASH initialization cost on first request.**                                                       | `DUMMY_HASH` is generated at module init (top-level `const DUMMY_HASH = hashArgon2id(env.ARGON2ID_DUMMY_PASSWORD)`). The first request to the Credentials callback is slower by ~50–100 ms; subsequent requests are fast. We accept this in MVP. A follow-up can move the initialization to a startup hook if it becomes a problem.              |
| **Session `expires` index added but no GC job exists in this change.**                                              | Documented. The GC job is a separate change; until then, expired sessions accumulate. The `auth()` lookup is by `sessionToken`, so the missing GC does not affect correctness, only DB size.                                                                                                                                                     |
| **Prisma's typed `session.user.id` field is `string` in the Auth.js v5 types but `unknown` in some beta versions.** | The `session` callback in §3 narrows the type and assigns `session.user.id = user.id`. If the type changes, the callback's `if (user?.id)` guard catches the issue.                                                                                                                                                                              |
| **`pnpm install --frozen-lockfile` fails in CI when `pnpm-lock.yaml` is missing or out of sync.**                   | The `lint` job in §9 runs `pnpm install --frozen-lockfile` and fails fast. The `package.json` has `"packageManager": "pnpm@<version>"` so `corepack` provisions the right version.                                                                                                                                                               |
