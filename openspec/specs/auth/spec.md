# Spec — `auth` capability

**Author**: Sebastián Illa
**Capability**: `auth`
**Source change**: `auth-foundation`
**Status**: draft · **Created**: 2026-06-10
**Stack**: v2 — Next.js 16 + Auth.js v5 + Prisma 6 + PostgreSQL (Neon) + Hono catch-all + Zod

> **v2 note**: this is the second write of this spec. The first
> version targeted Bun + Hono (server) + Drizzle + SQLite + a
> hand-rolled auth subsystem (commit `b562cee`, with proposal in
> `17c1635`) and was deleted in `eca35c9` after the stack changed.
> v1 is kept in git history for structural reference; its content
> is **obsolete** (custom JWT, refresh-token rotation, Drizzle,
> SQLite). v2 keeps the v1 *shape* (8 sections, business rules
> with stable IDs `BR-AUTH-NN`, exhaustive error-code table,
> security guarantees, cross-module contracts) and replaces the
> *substance* with Auth.js v5 database sessions, the Prisma
> adapter, and the Hono catch-all that hosts the application
> API.

## Purpose

The `auth` capability is the identity layer of
`gastos-personales`. It manages user accounts, their local
passwords, their third-party identity links (Google OAuth 2.0 in
this change), and the access credentials that prove identity on
subsequent calls. It guarantees that: (a) a registered user can
authenticate through any of the credential methods they
registered, (b) a caller proves identity by presenting a valid
`authjs.session-token` HTTP-only cookie that the server resolves
against the `Session` table in Postgres, (c) credentials are
stored using industry-standard primitives (Argon2id for
passwords) and never appear in logs, errors, or response bodies,
and (d) every other module can rely on `userId` being present
and trustworthy on any request that successfully passes the
`auth()` server-side helper from Auth.js v5.

Identity lives in the `auth` module under
`src/modules/auth/{domain,application,infrastructure}/...`,
backed by the Auth.js v5 library (`next-auth@5.0.0-beta.X`),
the **`@auth/prisma-adapter`** for session storage, the
Hono catch-all at `app/api/[...path]/route.ts` for the
non-auth application endpoints, and Zod for every schema
boundary (request bodies, environment variables, domain
value objects).

## Entities

The data model follows the **canonical Auth.js Prisma adapter
schema** (<https://authjs.dev/reference/adapter/prisma>) for
`User`, `Account`, `Session`, and `VerificationToken`. Three
columns are added to `User` on top of the adapter's canonical
shape. Auth.js-owned tables (their fields, types, and
relations) MUST NOT be modified by hand.

### `User`

The canonical identity in the system. A user owns zero or one
local password and zero or more OAuth provider links. Every
other entity (Account, Transaction, Category, Snapshot, etc.)
references a `User` through `userId` (the Auth.js `id` field;
see BR-AUTH-1).

| Field             | Type                              | Constraints |
|-------------------|-----------------------------------|-------------|
| `id`              | `string` (cuid)                   | Primary key. Generated server-side. |
| `name`            | `string \| null`                  | Display name. Optional. |
| `email`           | `string`                          | Unique. Lowercased and trimmed before storage. Comparison is case-insensitive. |
| `emailVerified`   | `DateTime \| null`                | `null` for local signups (no email verification flow in MVP); `DateTime` for Google signups (set to the OAuth callback time, since Auth.js enforces `email_verified: true`). |
| `image`           | `string \| null`                  | Google profile picture URL. `null` for local-only users. |
| `passwordHash`    | `string \| null`                  | Argon2id encoded form. `null` for OAuth-only users (BR-AUTH-9). Never returned over the wire. |
| `defaultProvider` | `'local' \| 'google'` (string)    | The credential used at first registration. Set once, never mutated (BR-AUTH-13). |
| `lastLoginAt`     | `DateTime \| null`                | Stamped by the Auth.js `signIn` callback on every successful sign-in. |
| `createdAt`       | `DateTime`                        | Set on insert. |
| `updatedAt`       | `DateTime`                        | Updated on every mutation. |

Invariants:

- `id` is immutable.
- `email` is immutable in MVP. A change-email flow is a separate
  change.
- `passwordHash` is `null` for users registered exclusively
  through Google. The Credentials provider's `authorize()`
  function returns `null` (with dummy-hash timing equalization
  per BR-AUTH-4) when `passwordHash` is `null` (BR-AUTH-9).
- `defaultProvider` is set on the first successful registration
  and never mutated afterwards, even if the user later links a
  second provider (BR-AUTH-13).
- `lastLoginAt` is updated by the Auth.js `signIn` callback, not
  by application code.

Lifecycle:

- **Created** on `POST /api/auth/register` (Credentials) or on
  the first successful Google OAuth callback for a
  previously-unseen email.
- **Read** on every `auth()` server-side call (the helper
  resolves the session row and returns the user projection).
- **Not deleted** in this change. A future `user-deletion`
  change handles GDPR-style cleanup and cascade-deletes
  `Account` and `Session` rows (per the Prisma schema's
  `onDelete: Cascade` relations).

### `Account`

A link between a `User` and an external identity provider
following the Auth.js canonical shape. This change ships with
`provider = 'google'`. The data model supports additional
providers in later changes without a schema migration.

| Field                | Type             | Constraints |
|----------------------|------------------|-------------|
| `id`                 | `string` (cuid)  | Primary key. |
| `userId`             | `string` (cuid)  | Foreign key to `User.id`. `onDelete: Cascade`. Indexed implicitly via the relation. |
| `type`               | `string`         | Auth.js account type (e.g. `"oidc"` for Google, `"email"` for the credentials provider in some flows). |
| `provider`           | `string`         | Provider identifier (`"google"` in this change). |
| `providerAccountId`  | `string`         | The provider's stable, opaque subject id (Google's `sub` claim). |
| `refresh_token`      | `string \| null` (`@db.Text`) | Google access-token refresh credential. |
| `access_token`       | `string \| null` (`@db.Text`) | Google access token. |
| `expires_at`         | `Int \| null`    | Unix seconds at which the Google access token expires. |
| `token_type`         | `string \| null` | Google `token_type` (typically `"Bearer"`). |
| `scope`              | `string \| null` | Space-separated scopes Google granted. |
| `id_token`           | `string \| null` (`@db.Text`) | Google OIDC `id_token`. |
| `session_state`      | `string \| null` | Auth.js-internal state. |

Invariants:

- Unique constraint on `(provider, providerAccountId)`
  (BR-AUTH-10).
- The Google account's `providerAccountId` (Google's `sub`) is
  the only link key. The user's `email` may change in Google
  without breaking the link (see decision gap 1 in the
  proposal).
- A user MAY have at most one `Account` row per `provider` in
  MVP. The schema supports multiple rows per user as long as
  `provider` differs.

Lifecycle:

- **Created** on the first successful Google OAuth callback for
  a given `(provider, providerAccountId)`. Either as a new
  `User` (no email match) or by linking to an existing `User`
  on email match (BR-AUTH-5, "auto-link on email match").
- **Read** by Auth.js internally to resolve OAuth sessions.
- **Not deleted or updated** by application code. Unlink flows
  are a separate change.

### `Session`

A server-side session row. The application NEVER issues,
verifies, or stores its own JWTs. The opaque session token in
the `authjs.session-token` HTTP-only cookie is looked up against
this table on every `auth()` call.

| Field          | Type             | Constraints |
|----------------|------------------|-------------|
| `id`           | `string` (cuid)  | Primary key. |
| `sessionToken` | `string`         | Unique. The opaque token Auth.js stores in the cookie. |
| `userId`       | `string` (cuid)  | Foreign key to `User.id`. `onDelete: Cascade`. |
| `expires`      | `DateTime`       | Session expiry. Default 30 days from issue. Sliding: Auth.js extends on each request within the last 24 hours of activity (BR-AUTH-7). |

Indexes (declared in the migration that ships with the design):

- `@@unique([sessionToken])` — implicit on `@unique`.
- `@@index([expires])` — added to keep the
  "garbage-collect expired sessions" plan clean. `auth()` reads
  the row by `sessionToken` (primary key on the lookup), but
  periodic cleanup benefits from the index.

Invariants:

- A session is **active** iff the row exists and `expires >
  now()`. The Prisma adapter enforces this transparently.
- Session rows are deleted when the user signs out (BR-AUTH-8)
  or when the user is deleted (`onDelete: Cascade`).

Lifecycle:

- **Created** by Auth.js on every successful sign-in (both
  providers).
- **Read** by `auth()` on every server-side call that needs the
  session.
- **Deleted** on sign-out (BR-AUTH-8 — only the current
  session; "sign out everywhere" is out of scope for MVP).
- **Garbage-collected** by a periodic background job (separate
  change); out of scope here.

### `VerificationToken`

Unused in MVP. The table MUST exist because the Auth.js
adapter's canonical schema includes it; the Credentials and
Google providers do not write to it. The `email-verification`
flow (a separate change) will use it.

| Field         | Type        | Constraints |
|---------------|-------------|-------------|
| `identifier`  | `string`    | The email or user id awaiting verification. |
| `token`       | `string`    | Unique. The opaque token. |
| `expires`     | `DateTime`  | Token expiry. |

Indexes: `@@unique([identifier, token])`.

## Endpoints

All endpoints live under the `/api/*` prefix. Auth.js owns
`/api/auth/*` (handlers generated by the library; we configure,
we do not implement). Hono owns the rest via the
`app/api/[...path]/route.ts` catch-all. All request and response
bodies for the Hono endpoints are JSON. All Hono endpoints
that mutate state validate the `Origin` header against an
allowlist (security-owasp skill; CSRF mitigation in
spec §Security guarantees).

### Auth.js-owned (`/api/auth/*`)

| Endpoint                                | Method | Behavior |
|-----------------------------------------|--------|----------|
| `/api/auth/signin`                      | GET    | Renders the default sign-in page (Credentials form + Google button). Custom page at `/auth/signin` is mounted by the `ui-auth-shell` change. |
| `/api/auth/signin/google`               | POST   | Starts the Google OAuth 2.0 flow. Auth.js redirects the browser to Google's consent screen with `prompt=select_account`, `scope=openid email profile`. |
| `/api/auth/callback/google`             | GET    | OAuth 2.0 callback. Auth.js exchanges the code, fetches the userinfo, runs the `signIn` callback, creates or links `User` / `Account` rows, sets the session cookie. |
| `/api/auth/callback/credentials`        | POST   | Receives `{ email, password }` + CSRF token. Auth.js calls our `authorize(credentials, request)`. Returns `200` with a session cookie on success, `401` on failure. |
| `/api/auth/session`                     | GET    | Returns the current session JSON (`{ user, expires }` or `null`). Used by client components to bootstrap session state. |
| `/api/auth/csrf`                        | GET    | Returns the CSRF token. Auth.js handles CSRF for all POSTs under `/api/auth/*` (double-submit pattern). |
| `/api/auth/providers`                   | GET    | Returns the list of configured providers (`[{ id: "google" }, { id: "credentials" }]`). Used by the UI to render the sign-in page. |
| `/api/auth/signout`                     | POST   | Revokes the current session row in the `Session` table and clears the `authjs.session-token` cookie. Other devices keep working (BR-AUTH-8). |

For every Auth.js route, request/response shapes and status
codes are owned by the library. Customizations we apply:

- **Custom sign-in page** at `/auth/signin` (mounted by the
  `ui-auth-shell` change). Auth.js is configured with
  `pages.signIn = "/auth/signin"`. The route is a Next.js
  page, NOT a Hono endpoint.
- **Custom sign-out page** at `/auth/signout` (same change,
  same `pages.signOut` config).
- **`signIn` callback** that stamps `lastLoginAt` and
  `defaultProvider` (BR-AUTH-13) on first registration.
- **`session` callback** that ensures `session.user.id` is
  always present and `defaultProvider` is included in the
  session JSON for client-side rendering.

### Application-owned (Hono, under `/api/*`)

Mounted at `app/api/[...path]/route.ts`. The Hono app exports
`{ GET, POST, PATCH, DELETE }` handlers that delegate to
`honoApp.fetch(request)`. Auth.js is NOT routed through Hono;
the more specific route in `app/api/auth/[...nextauth]/route.ts`
takes precedence at the Next.js layer.

#### `GET /api/health`

Health check. Required by the deployment skill.

- **Auth required**: no.
- **Request**: no body.
- **Success response** (`200 OK`):

  ```ts
  interface HealthResponse {
    data: {
      status: 'ok';
      version: string;     // from package.json
      uptime: number;       // seconds since process start
    };
  }
  ```

- **Side effects**: none.
- **Error responses**: none expected; on a thrown error the
  central error handler returns `500 INTERNAL_ERROR` and logs
  the stack.

#### `GET /api/me`

Return the authenticated user.

- **Auth required**: yes (valid session cookie).
- **Request**: no body. Reads the session via `auth()` and
  returns the public projection.
- **Success response** (`200 OK`):

  ```ts
  interface MeSuccess {
    data: {
      id: string;                       // cuid
      email: string;                    // normalized
      name: string | null;
      image: string | null;
      defaultProvider: 'local' | 'google';
      lastLoginAt: string | null;       // ISO 8601
    };
  }
  ```

  The response NEVER includes `passwordHash`, `emailVerified`,
  or any token material.

- **Side effects**: none. Reading the session does not extend
  its expiry; Auth.js's sliding window extension is triggered
  on authenticated requests that go through `auth()`.
- **Error responses**:

  | Status | Code           | When |
  |--------|----------------|------|
  | 401    | `UNAUTHORIZED`  | The session cookie is missing, the `Session` row is missing, or the session has expired. The response is identical in all three cases. |

#### `POST /api/auth/register`

Create a new local user with email + password. **This is a
Hono endpoint, not an Auth.js endpoint.** Auth.js's
Credentials `authorize()` only authenticates existing users;
registration needs a separate path.

- **Auth required**: no.
- **Request body** (`application/json`):

  ```ts
  interface RegisterRequest {
    email: string;     // RFC 5322; lowercased + trimmed server-side.
    password: string;  // Plaintext only over the wire; never logged.
  }
  ```

  Zod schema (in `src/modules/auth/application/dto/register.dto.ts`):

  ```ts
  const registerSchema = z.object({
    email: z.string().email().max(254),
    password: z.string().min(10).max(128),
  });
  ```

- **Success response** (`201 Created`):

  ```ts
  interface RegisterSuccess {
    data: {
      id: string;                       // cuid
      email: string;                    // normalized
      name: string | null;
      image: string | null;
      defaultProvider: 'local';
    };
  }
  ```

  The endpoint does NOT issue a session. The user must sign
  in afterward via the Auth.js Credentials callback. This is
  intentional: a single code path (`authorize()`) owns session
  creation.

- **Side effects**:
  - Inserts a `User` row with `passwordHash` (Argon2id),
    `defaultProvider = "local"`, `lastLoginAt = null`,
    `emailVerified = null`.
  - Emits a `UserRegistered` event with
    `{ userId, email, provider: "local", occurredAt }` on the
    in-process event dispatcher (see Cross-module contracts).
- **Error responses**:

  | Status | Code                  | When |
  |--------|-----------------------|------|
  | 400    | `VALIDATION_ERROR`    | Body fails Zod schema validation. The `details` field of the error response carries the issue list. |
  | 400    | `WEAK_PASSWORD`       | Password length < 10 (BR-AUTH-2). Returns the same shape as `VALIDATION_ERROR` for client uniformity. |
  | 409    | `EMAIL_TAKEN`         | A user with the same normalized email already exists. Response shape and timing are comparable to the success path (BR-AUTH-7). |
  | 429    | `RATE_LIMITED`        | Per-IP or per-account rate limit hit. The `security-rate-limiting` change owns the limit; the response shape is set there. |
  | 500    | `INTERNAL_ERROR`      | Argon2 library failed to load or any unexpected failure. |

## Error codes

Exhaustive list of error codes the `auth` module can return,
grouped by category. All codes map to `AppError` instances
(see `error-handling` skill). The mapping is normative: a
future change may add new codes, but existing codes MUST keep
their HTTP status and machine-code values.

### Auth.js-emitted errors (handled by Auth.js's error page)

The following codes are produced by Auth.js itself and
surfaced on the sign-in page or the sign-in URL. The
application code does not throw them; it reacts to them when
Auth.js redirects back with `?error=<code>`.

| Code                       | Trigger |
|----------------------------|---------|
| `Configuration`            | The Auth.js config is invalid (e.g. missing `AUTH_SECRET`). Detected at startup. |
| `AccessDenied`             | The `signIn` callback returned `false` for a user we explicitly want to block. Not used in MVP. |
| `Verification`             | The email verification token in the link is invalid or expired. Not used in MVP. |
| `OAuthSignin`              | Starting the OAuth flow failed (e.g. provider misconfigured). |
| `OAuthCallback`            | The OAuth callback request was malformed. |
| `OAuthCreateAccount`       | Auth.js failed to create the `User` or `Account` row from a successful OAuth response. |
| `EmailCreateAccount`       | Same as `OAuthCreateAccount` for the email provider. |
| `Callback`                 | A generic catch-all for callback errors. |
| `OAuthAccountNotLinked`    | The Google account is already linked to a different `User` (BR-AUTH-10). The unique constraint on `Account(provider, providerAccountId)` catches it. |
| `EmailSignin`              | The "magic link" sign-in flow error. Not used in MVP. |
| `CredentialsSignin`        | The Credentials `authorize()` returned `null`. Covers unknown email, wrong password, and Google-only user (BR-AUTH-4, BR-AUTH-9). |
| `SessionRequired`          | The user hit a protected route with no session. Not thrown by the auth module directly; thrown by the page/route guard. |

### Application-emitted errors (Hono endpoints)

| Code                   | HTTP | Human message (Spanish mirror)                            | When |
|------------------------|------|-----------------------------------------------------------|------|
| `VALIDATION_ERROR`     | 400  | "Los datos enviados no son válidos."                      | Request body fails Zod schema validation. The `details` field carries the issue list. |
| `WEAK_PASSWORD`        | 400  | "La contraseña debe tener al menos 10 caracteres."        | Password length < 10 (BR-AUTH-2). |
| `INVALID_CREDENTIALS`  | 401  | "Credenciales inválidas."                                 | The Credentials `authorize()` returned `null` (the Auth.js error `CredentialsSignin` becomes `INVALID_CREDENTIALS` on the Hono side when the UI surfaces the failure). |
| `UNAUTHORIZED`         | 401  | "Autenticación requerida."                                | `GET /api/me` with no session, missing cookie, expired session, or unknown user. Identical response shape across all four failure modes. |
| `EMAIL_TAKEN`          | 409  | "El email ya está registrado."                            | `POST /api/auth/register` with an email that already exists (BR-AUTH-7). |
| `RATE_LIMITED`         | 429  | "Demasiadas solicitudes. Probá de nuevo en un minuto."    | Per-IP or per-account rate limit hit. The `security-rate-limiting` change owns the limit. |
| `INTERNAL_ERROR`       | 500  | "Ocurrió un error inesperado."                            | Catch-all for unexpected failures. The real error is logged with full stack; the response carries only the code and the safe message. |

## Business rules

The rules below are normative. Each rule has a stable ID for
traceability across spec, design, implementation, and tests.

- **BR-AUTH-1** — Email is the canonical identifier. There are
  no usernames. Email is normalized (lowercased, trimmed)
  before storage and lookup. Comparison is case-insensitive.
  The Postgres column is `citext` semantics by application
  convention; the application layer is the only place that
  sees raw email.
- **BR-AUTH-2** — Local password minimum length is 10
  characters. No complexity rules beyond length (NIST SP
  800-63B). Enforced in the Zod schema at the
  `POST /api/auth/register` action boundary.
- **BR-AUTH-3** — Argon2id is the only acceptable password
  hashing primitive in this change. Final parameters
  (`memoryCost`, `timeCost`, `parallelism`) are recorded in
  the design and produce a target hash time in the 50–100 ms
  range on the Fly.io 1-CPU VM. The benchmark gate is
  described in the design.
- **BR-AUTH-4** — User enumeration is mitigated in the
  Credentials `authorize()` function. When the email is not
  found, or the `User` exists but has no `passwordHash`, the
  function hashes a fixed dummy password with the same
  Argon2id parameters before returning `null`. Response time
  for "unknown email" and "wrong password" is statistically
  indistinguishable. The same timing is preserved when the
  user exists but has no local password (BR-AUTH-9).
- **BR-AUTH-5** — Auto-link on email match. When Google
  returns an email that already exists in `User`, the
  Prisma adapter (via Auth.js's `linkAccount` callback) creates
  a new `Account` row linked to the existing `User`. No
  password is requested. The `User` row keeps its existing
  data, including `defaultProvider` (BR-AUTH-13).
- **BR-AUTH-6** — Google `email_verified: true` is trusted.
  Auth.js's Google provider enforces this: if the claim is
  `false` or missing, the OAuth flow fails and Auth.js returns
  an error. There is no code path in our application that
  bypasses this check.
- **BR-AUTH-7** — Session expiry is 30 days, sliding. The
  cookie `authjs.session-token` carries an opaque token that
  resolves to a `Session` row. Auth.js's default
  `session.maxAge = 30 * 24 * 60 * 60` and
  `session.updateAge = 24 * 60 * 60` apply. The session row's
  `expires` column is updated on each request that finds a
  valid session, as long as the session has been used within
  the last 24 hours.
- **BR-AUTH-8** — Sign out revokes only the current session.
  Auth.js deletes the `Session` row whose `sessionToken`
  matches the cookie and clears the cookie. Other devices
  keep working. "Sign out everywhere" is out of scope for
  MVP and a separate change.
- **BR-AUTH-9** — Credentials lookup requires `passwordHash`
  set. If the user was created via Google and never set a
  password, `passwordHash` is `null`. The `authorize()`
  function returns `null` (with dummy-hash timing equalization
  per BR-AUTH-4). The UI surfaces "esta cuenta usa Google"
  on the sign-in page.
- **BR-AUTH-10** — Account linking uniqueness. The
  `@@unique([provider, providerAccountId])` constraint on
  `Account` prevents the same Google account from being
  linked to two different `User` rows. If a malicious actor
  tried to link their Google account to a victim's `User`,
  the second link fails and Auth.js returns
  `OAuthAccountNotLinked`. The user must sign in with the
  email that originally claimed the Google account.
- **BR-AUTH-11** — No secrets, tokens, or password material
  in logs. Passwords, `passwordHash` values, session tokens,
  Google access/refresh/id tokens, and CSRF tokens are never
  logged. The structured-logging layer in `src/shared/logger`
  is configured with a denylist of
  `{ password, passwordHash, sessionToken, access_token,
  refresh_token, id_token, csrfToken, "set-cookie" }`. A
  lint rule forbids `console.log` and `console.debug` in
  `src/modules/auth/**` and in `src/shared/env/**`.
- **BR-AUTH-12** — Failed login attempts are not rate-limited
  in MVP. Documented as accepted risk. The
  `security-rate-limiting` change owns per-IP and per-account
  rate limits on `/api/auth/callback/credentials`.
  Mitigation in the meantime: BR-AUTH-4 equalizes timing so
  a brute-force attacker cannot distinguish "no user" from
  "user, wrong password" by latency.
- **BR-AUTH-13** — `defaultProvider` is set on first
  registration and never changed. For Credentials →
  `"local"`. For Google → `"google"`. The field is read by
  `GET /api/me` to render the "último método de inicio" hint
  in the UI. The Auth.js `signIn` callback stamps it on the
  first registration only.
- **BR-AUTH-14** — Email normalization is irreversible. The
  original (un-normalized) email is never stored. Google's
  `email_verified` is asserted on the normalized form. If a
  user later changes their email, a separate change owns it.

## Security guarantees

The `auth` module guarantees the following. Anything that
breaks one of them is a breaking change and requires a spec
delta.

- **Password storage** — Passwords are stored only as
  Argon2id encoded strings, with parameters tuned to
  ~50–100 ms on the Fly.io 1-CPU VM (BR-AUTH-3). The
  plaintext password is never persisted, logged, or included
  in any response body. The library choice
  (`@node-rs/argon2` or fallback to `argon2`) is recorded in
  the design with the benchmark result.
- **Session storage** — Sessions live in the `Session` table
  in Postgres. The application NEVER issues, verifies, or
  stores its own JWTs. The `authjs.session-token` cookie holds
  an opaque session token; the server resolves it against the
  `Session` table on every `auth()` call. The token is
  HTTP-only, `Secure` in production, and `SameSite=Lax`.
- **CSRF** — Auth.js handles CSRF on its own routes via the
  double-submit pattern (`/api/auth/csrf` provides the token;
  every POST requires it). Hono endpoints that mutate state
  (`POST /api/auth/register` in this change) MUST verify the
  `Origin` header against an allowlist of trusted app
  origins, configured from `env.APP_URL`. A mismatched or
  missing `Origin` is rejected with `403 FORBIDDEN`.
- **OAuth state** — Auth.js handles the OAuth `state`
  parameter. CSRF protection is library-managed; we do not
  re-implement it.
- **Auto-link security** — The `Account` unique constraint
  on `(provider, providerAccountId)` (BR-AUTH-10) is the only
  line of defense against a malicious user linking their
  Google account to a victim's `User` row. The
  unique-violation surfaces as Auth.js's
  `OAuthAccountNotLinked` error. Industry-standard behaviour
  (Notion, Linear, Vercel). A hardening pass is tracked
  outside this change.
- **`email_verified` trust** — Auth.js's Google provider
  enforces `email_verified: true` (BR-AUTH-6). Unverified
  Google emails fail the OAuth flow at the library layer; we
  do not add a second check.
- **Timing attacks on login** — The Credentials `authorize()`
  function MUST hash a fixed dummy password (with the same
  Argon2id parameters) when the email is not found or the
  user has no `passwordHash` (BR-AUTH-4, BR-AUTH-9). Response
  shape and timing are statistically indistinguishable across
  the three failure modes (unknown email, wrong password,
  Google-only user).
- **Secrets in logs** — Passwords, `passwordHash` values,
  session tokens, Google access/refresh/id tokens, and CSRF
  tokens are never logged (BR-AUTH-11). The structured
  logging layer is configured with a denylist and a lint rule
  enforces it.
- **Cookie attributes** — The `authjs.session-token` cookie
  is set by Auth.js with the following attributes (default
  Auth.js v5 behavior; we do not override):
  - `HttpOnly` — never readable from JavaScript.
  - `Secure` in production, omitted in local development.
  - `SameSite=Lax` — protects against most CSRF on top-level
    navigations.
  - `Path=/` — sent on every request, including the Hono
    catch-all.

## Cross-module contracts

Other modules rely on the following invariants. Any change
that breaks one of them is a breaking change and requires a
spec delta.

### `auth()` server-side helper

Both server components (App Router pages) and Hono route
handlers MUST use the `auth()` server-side helper exported
from `src/modules/auth/infrastructure/authjs.ts` (re-exported
by `src/modules/auth/index.ts`). The helper is Auth.js v5's
unified `auth()` function.

```ts
// Signature — Auth.js v5.
const session = await auth();
// session is { user: PublicUser, expires: string } on a valid session
// session is null on no session, expired session, or unknown user.
```

The `session.user.id` is the authorization key used by every
later capability. The helper is the ONLY way to resolve the
caller's identity. No module reads the cookie directly, no
module reads the `Session` table directly, no module calls
`headers().get('cookie')` to parse session material.

### `User` is the single source of truth for identity

Other modules' tables reference `User.id` (cuid) via
`userId`. The `User` row is the only identity anchor.

| Invariant | Reason |
|-----------|--------|
| `userId` is the only stable identifier other modules should rely on. | Email can change (the user updates their Google account), name can change. `userId` is server-controlled and immutable. |
| Every other module's `WHERE userId = ?` query MUST scope to the caller. | The application layer enforces this; the database has no row-level security in MVP. |
| Modules MUST NOT add their own `email` column. | Email belongs to `User`. A user can change it; modules that need the current value re-resolve it from `User`. |

### `UserRegistered` event

Dispatched exactly once per user, on the first registration
(credentials or Google). The auto-link path (BR-AUTH-5) does
**not** re-emit this event. Dispatched via the in-process
event dispatcher in `src/shared/events/`.

```ts
interface UserRegisteredEvent {
  type: 'UserRegistered';
  payload: {
    userId: string;            // cuid
    email: string;             // Normalized lowercase.
    provider: 'local' | 'google';
    occurredAt: string;        // ISO 8601.
  };
}
```

Downstream consumers (e.g. a future welcome-email worker,
the `accounts-ledger` change to seed default accounts)
subscribe through `src/shared/events/`. The `auth` module
never imports from another module directly
(architecture-standards skill). No consumer is implemented
in this change.

### `UserSignedIn` event

Dispatched on every successful sign-in, regardless of
provider. Downstream consumers can subscribe to, e.g., a
"last seen" timestamp in an analytics module.

```ts
interface UserSignedInEvent {
  type: 'UserSignedIn';
  payload: {
    userId: string;            // cuid
    provider: 'local' | 'google';
    occurredAt: string;        // ISO 8601.
  };
}
```

### Module index and public API

`src/modules/auth/index.ts` exports:

- `auth()` — the Auth.js v5 server-side helper.
- `signIn` and `signOut` — server actions exported by
  Auth.js, for use in server components.
- `handlers` — the `GET` and `POST` handlers for
  `/api/auth/*`, re-exported from `auth.ts` and mounted at
  `app/api/auth/[...nextauth]/route.ts`.
- The Hono `OpenAPIHono` instance for the `/api/*` (non-auth)
  routes, exported for typed client consumption by the UI.
- The `UserRegistered` and `UserSignedIn` event names (for
  type-safe subscribers).

Nothing else in the codebase reaches into the module's
internals.

## Out of scope

- Other OAuth providers (Apple, Facebook, GitHub). The
  Prisma schema already supports N providers per user; only
  Google ships in MVP.
- Password reset and email verification flows. For MVP,
  password reset is a manual SQL update by the operator. A
  separate `email-verification` change will use the
  `VerificationToken` table.
- Multi-factor authentication.
- Rate limiting on `/api/auth/callback/credentials`. The
  `security-rate-limiting` change owns per-IP and per-account
  rate limits. Documented as accepted risk in BR-AUTH-12.
- Session listing and "log out all devices". Sign out
  revokes only the current session (BR-AUTH-8). "Sign out
  everywhere" is a separate change.
- Generic RBAC on top of `userId`. Every later change
  handles its own `WHERE userId = ?` discipline.
- UI screens (sign-in form, register form, OAuth button,
  "use Google sign-in" hint). Owned by the `ui-auth-shell`
  change. The contract in this spec is the HTTP API only.
- Account linking from the user profile ("Link Google to my
  account"). The auto-link flow exists on first OAuth login
  (BR-AUTH-5); a manual link/unlink UI is a separate change.
- User deletion and GDPR workflows. Owned by the
  `user-deletion` change. The Prisma schema's
  `onDelete: Cascade` is in place to support it.
- Refresh token pruning. Sessions accumulate in the DB
  until a separate change prunes them. Sessions are cheap
  rows; this is deferred.
- "Unlink Google" / "Set password" actions for existing
  users. Separate change.
- App-issued JWTs. The application NEVER issues, verifies,
  or stores its own JWTs. Sessions are database-backed.
- App-issued refresh tokens. The `Session` row is the only
  thing the app mints, stores, and revokes. "Refresh" is
  the user re-using the cookie while it is still valid; once
  it expires, the user signs in again.
- Email change. `User.email` is immutable in MVP. A
  separate change owns the flow.
- Notification emails on auto-link. A future hardening
  pass.
