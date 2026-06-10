# Spec — `auth` capability

**Author**: Sebastián Illa
**Capability**: `auth`
**Source change**: `auth-foundation`
**Status**: approved · **Created**: 2026-06-09

## Purpose

The `auth` capability is the identity layer of `gastos-personales`. It
manages user accounts, their local passwords, their third-party
identity links (Google OAuth 2.0 in this change), the access and
refresh tokens that prove identity on subsequent calls, and the
middleware that every other module reuses to extract the caller's
`user_id`. It guarantees that: (a) a registered user can authenticate
through any of the credential methods they registered, (b) a caller
proves identity by presenting a valid short-lived access JWT or by
silently exchanging a still-valid refresh token, (c) credentials are
stored using industry-standard primitives (Argon2id for passwords,
sha256 for refresh-token fingerprints) and never appear in logs,
errors, or response bodies, and (d) every other module can rely on
`user_id` being present and trustworthy on any request that
successfully passes `authMiddleware`.

## Entities

### `User`

The canonical identity in the system. A user owns zero or one local
password and zero or more OAuth provider links. Every other entity
(Account, Transaction, Category, Snapshot, etc.) references a `User`
through `user_id`.

| Field             | Type                | Constraints                                                                                |
|-------------------|---------------------|--------------------------------------------------------------------------------------------|
| `id`              | `string` (uuid v7)  | Primary key. Generated server-side. Never exposed in path of the API.                      |
| `email`           | `string`            | Unique, lowercased, trimmed. Treated as case-insensitive at the storage layer (citext).   |
| `password_hash`   | `string \| null`    | Argon2id encoded form. `null` for Google-only users. Never returned over the wire.         |
| `email_verified`  | `boolean`           | `true` if confirmed by self-registration (BR-AUTH-08) or by Google (`email_verified=true`).|
| `default_provider`| `'local' \| 'google'`| The credential used at first registration. Set once, never mutated.                       |
| `created_at`      | `number` (unix sec) | Set on insert.                                                                             |
| `updated_at`      | `number` (unix sec) | Updated on every mutation.                                                                 |

Invariants:

- `id` is immutable.
- `email` is immutable in MVP. A change-email flow is a separate change.
- `password_hash` is `null` for users registered exclusively through Google.
- `default_provider` is set on the first successful registration and never
  mutated afterwards, even if the user later links a second provider.
- `email_verified` is set to `true` at registration time for local
  signups (BR-AUTH-08 — no email-verification flow in MVP) and to the
  value of Google's `email_verified` claim at OAuth registration.

Lifecycle:

- **Created** on `POST /auth/register` or first successful Google
  OAuth callback for a previously-unseen email.
- **Read** on `GET /auth/me`, on every authenticated request (to load
  the `User` referenced by the JWT `sub`).
- **Not deleted** in this change. A future `user-deletion` change
  handles GDPR-style cleanup.

### `RefreshToken`

A long-lived credential used to obtain new access tokens without
asking the user to re-authenticate. Server stores only a sha256
fingerprint; the plaintext token is given to the client exactly once.

| Field         | Type                          | Constraints                                                                              |
|---------------|-------------------------------|------------------------------------------------------------------------------------------|
| `id`          | `string` (uuid v7)            | Primary key.                                                                             |
| `user_id`     | `string` (uuid v7)            | Foreign key to `users.id`. Indexed.                                                      |
| `token_hash`  | `string` (hex sha256, 64 chars)| Sha256 fingerprint of the plaintext token. Unique-indexed.                              |
| `family_id`   | `string` (uuid v7)            | Group of tokens issued by a chain of rotations. Set on first issue, copied on rotation.  |
| `issued_at`   | `number` (unix sec)           | Set on insert.                                                                           |
| `expires_at`  | `number` (unix sec)           | `issued_at + REFRESH_TTL_SECONDS` (default 30 days).                                     |
| `revoked_at`  | `number \| null`              | `null` while active. Set to current unix time on rotation, logout, or family revocation. |
| `replaced_by` | `string \| null`              | `id` of the new refresh issued in the rotation that revoked this one.                    |

Invariants:

- A token is **active** iff `revoked_at IS NULL AND expires_at > now`.
- The plaintext token never appears in storage, logs, errors, or
  responses (except the one-time issuance response).
- Rotation: every `POST /auth/refresh` issues a new row whose
  `family_id` matches the old row's `family_id`, marks the old row
  `revoked_at = now` and `replaced_by = <new id>`, and returns both
  the new access and new refresh tokens.
- Reuse of a revoked token revokes the **entire family** (BR-AUTH-04).

Lifecycle:

- **Created** on `POST /auth/register`, `POST /auth/login`,
  `POST /auth/refresh`, and on the success path of the Google OAuth
  callback.
- **Read** on `POST /auth/refresh` (lookup by `token_hash`).
- **Revoked** on `POST /auth/refresh` (rotated token), on
  `POST /auth/logout` (current token), or on detected reuse of any
  previously-revoked token in the same family (cascade revocation).

### `OAuthAccount`

A link between a `User` and an external identity provider. This change
ships with `provider = 'google'`. The data model supports additional
providers in later changes.

| Field              | Type                       | Constraints                                              |
|--------------------|----------------------------|----------------------------------------------------------|
| `id`               | `string` (uuid v7)         | Primary key.                                             |
| `user_id`          | `string` (uuid v7)         | Foreign key to `users.id`. Indexed.                      |
| `provider`         | `'google'`                 | Enum-like string. New values require a spec change.       |
| `provider_subject` | `string`                   | The provider's stable, opaque subject id (`sub` claim). |
| `provider_email`   | `string`                   | The email the provider returned at link time (audit).     |
| `created_at`       | `number` (unix sec)        | Set on insert.                                           |

Invariants:

- Unique constraint on `(provider, provider_subject)` (BR-AUTH-12).
- `provider_email` is the **most recently observed** value. The
  design specifies whether it is updated on subsequent logins; the
  spec records the audit-trail intent.
- A user may have at most one row per `provider` in MVP (no
  "link to the same provider twice" UX). The spec supports multiple
  rows per user as long as `provider` differs.

Lifecycle:

- **Created** on the first successful Google OAuth callback for a
  given `(provider, provider_subject)`. Either as a new user (with
  brand-new `users.id`) or by linking to an existing user on email
  match (BR-AUTH-09).
- **Read** on the OAuth callback path to detect "this Google account
  is already linked to a user".
- **Not deleted or updated** in this change. Unlink flows are a
  separate change.

## Endpoints

All endpoints live under the `/auth` prefix. All request and response
bodies are JSON. The `/auth/oauth/google` and
`/auth/oauth/google/callback` endpoints redirect the browser; the
other five return JSON.

### `POST /auth/register`

Create a new local user with email + password.

**Authentication required**: no.

**Request body** (`application/json`):

```ts
interface RegisterRequest {
  email: string;     // RFC 5322; lowercased + trimmed server-side.
  password: string;  // Plaintext only over the wire; never logged.
}
```

**Success response** (`201 Created`):

```ts
interface RegisterSuccess {
  data: {
    user: PublicUser;       // No password_hash, no internal fields.
    access_token: string;   // JWT, 15-minute lifetime.
    refresh_token: string;  // Opaque base64url, 30-day lifetime. Single use.
    token_type: 'Bearer';
    expires_in: 900;        // Seconds until access_token expires.
  };
}

interface PublicUser {
  id: string;
  email: string;
  default_provider: 'local' | 'google';
  email_verified: boolean;
  created_at: number;
}
```

**Side effects**:

- Inserts a `users` row with `password_hash`, `email_verified = true`,
  `default_provider = 'local'`.
- Inserts a `refresh_tokens` row with a new `family_id` and
  `revoked_at = NULL`.
- Emits a `UserRegistered` event with `{ user_id, email,
  provider: 'local', occurred_at }` (see Cross-module contracts).

**Error responses**:

| Status | Code                  | When                                                   |
|--------|-----------------------|--------------------------------------------------------|
| 400    | `INVALID_EMAIL`       | Email is empty, malformed, or fails server-side normalization. |
| 400    | `PASSWORD_TOO_SHORT`  | Password length < 10.                                  |
| 400    | `VALIDATION_ERROR`    | Body fails schema validation for any other reason.     |
| 409    | `EMAIL_TAKEN`         | A user with the same normalized email already exists. Response time is comparable to the success path (BR-AUTH-07). |
| 500    | `INTERNAL_ERROR`      | Argon2 library failed to load or any unexpected failure. |

### `POST /auth/login`

Authenticate an existing local user with email + password.

**Authentication required**: no.

**Request body**:

```ts
interface LoginRequest {
  email: string;
  password: string;
}
```

**Success response** (`200 OK`):

```ts
interface LoginSuccess {
  data: {
    user: PublicUser;
    access_token: string;
    refresh_token: string;
    token_type: 'Bearer';
    expires_in: 900;
  };
}
```

**Side effects**:

- Inserts a new `refresh_tokens` row with a new `family_id` (BR-AUTH-04:
  rotation starts a new chain; this is the first rotation).
- Updates `users.updated_at`.

**Error responses**:

| Status | Code                  | When                                                            |
|--------|-----------------------|-----------------------------------------------------------------|
| 400    | `VALIDATION_ERROR`    | Body fails schema validation.                                   |
| 401    | `INVALID_CREDENTIALS` | Email not found, password does not match, or user is Google-only. Response shape and timing are identical for all three cases (BR-AUTH-07). |
| 500    | `INTERNAL_ERROR`      | Argon2 verification failed unexpectedly.                        |

### `GET /auth/oauth/google`

Begin the Google OAuth 2.0 flow.

**Authentication required**: no.

**Request**: no body. The server generates a random 32-byte `state`
token, signs it, and stores it in an HttpOnly, `Secure`,
`SameSite=Lax` cookie scoped to the OAuth callback path. The server
then `302` redirects the browser to Google's
`https://accounts.google.com/o/oauth2/v2/auth` URL with the configured
`client_id`, `redirect_uri`, `response_type=code`, `scope=openid email
profile`, and the `state` parameter.

**Success response**: `302 Found` with `Location` set to Google's
authorize URL.

**Error responses**:

| Status | Code                       | When                                |
|--------|----------------------------|-------------------------------------|
| 500    | `INTERNAL_ERROR`           | State generation or cookie signing fails. |
| 500    | `OAUTH_CONFIG_MISSING`     | `GOOGLE_CLIENT_ID` or `GOOGLE_REDIRECT_URI` is not configured. |

### `GET /auth/oauth/google/callback`

Complete the Google OAuth 2.0 flow.

**Authentication required**: no (the `state` cookie is the credential).

**Query parameters** (validated server-side, see BR-AUTH-11):

```ts
interface OAuthCallbackQuery {
  code: string;         // Single-use authorization code.
  state: string;        // Must match the signed `state` cookie.
  // `error`, `error_description`: optional, treated as failure if present.
}
```

**Success response**: `302 Found` with `Location` set to
`${APP_URL}/auth/success#access_token=<jwt>&refresh_token=<token>`
(the success landing page is implemented in `ui-auth-shell`; the
`#fragment` keeps tokens out of server logs and referrer headers).
On the server side, the success path:

1. Validates `state` against the signed cookie. Mismatch →
   `302` to `${APP_URL}/login?error=oauth_state_mismatch`.
2. Exchanges `code` for tokens at Google's token endpoint.
3. Calls Google's `userinfo` endpoint with the access token.
4. Rejects the registration if `email_verified` is `false` (→
   `302` to `${APP_URL}/login?error=oauth_email_unverified`).
5. Looks up the user by normalized email. If found, links a new
   `oauth_accounts` row to that user (BR-AUTH-09). If not found,
   creates a new `users` row with `password_hash = null`,
   `default_provider = 'google'`, `email_verified = true`, then
   inserts the `oauth_accounts` row.
6. If the `(provider, provider_subject)` unique constraint
   conflicts, rejects with `302` to
   `${APP_URL}/login?error=oauth_subject_taken` (BR-AUTH-12).
7. Issues a new access + refresh pair and redirects as above.

**Side effects**:

- May insert a new `users` row (first time the email is seen).
- Inserts a new `oauth_accounts` row.
- Inserts a new `refresh_tokens` row with a new `family_id`.
- Emits a `UserRegistered` event **only on first registration** (i.e.
  when a new `users` row is created). The auto-link path does not
  re-emit `UserRegistered`.

**Error responses** (all redirect to `${APP_URL}/login?error=<code>`,
no JSON body):

| Code                       | When                                                                 |
|----------------------------|----------------------------------------------------------------------|
| `oauth_state_mismatch`     | The `state` cookie is missing, the `state` query does not match, the cookie is older than 10 minutes, or the signature fails. |
| `oauth_code_expired`       | Google's token endpoint reports the authorization code is invalid or expired. |
| `oauth_token_revoked`      | Google reports the token was revoked.                                 |
| `oauth_email_unverified`   | `email_verified: false` in the userinfo response.                     |
| `oauth_email_missing`      | No `email` claim in the userinfo response.                           |
| `oauth_subject_taken`      | The `(provider, provider_subject)` pair is already linked to a different user. |
| `oauth_provider_unavailable` | Network error or 5xx from Google. Server returns `502` with `Retry-After` header before redirecting (so the redirect is `302` after the 502 is logged). |
| `oauth_userinfo_failed`    | Google returned a non-2xx response that did not match the categories above. |

### `POST /auth/refresh`

Exchange a still-valid refresh token for a new access + refresh pair.

**Authentication required**: no (the refresh token **is** the credential).

**Request body**:

```ts
interface RefreshRequest {
  refresh_token: string;  // Plaintext, single-use.
}
```

**Success response** (`200 OK`):

```ts
interface RefreshSuccess {
  data: {
    access_token: string;
    refresh_token: string;  // New; the old one is revoked.
    token_type: 'Bearer';
    expires_in: 900;
  };
}
```

**Side effects**:

- Marks the presented refresh token as `revoked_at = now`,
  `replaced_by = <new id>`.
- Inserts the new refresh row with the same `family_id` and
  `revoked_at = NULL`.

**Error responses**:

| Status | Code                | When                                                                              |
|--------|---------------------|-----------------------------------------------------------------------------------|
| 400    | `VALIDATION_ERROR`  | Body fails schema validation.                                                     |
| 401    | `INVALID_TOKEN`     | The presented token is malformed or its sha256 hash is not found in `refresh_tokens`. |
| 401    | `REFRESH_EXPIRED`   | The token's `expires_at` is in the past.                                          |
| 401    | `REFRESH_REVOKED`   | The token is already revoked. **All tokens in the same `family_id` are revoked as a side effect** (BR-AUTH-04). |

### `POST /auth/logout`

Revoke the current refresh token.

**Authentication required**: yes (a refresh token is required to identify the chain to revoke).

**Request body**:

```ts
interface LogoutRequest {
  refresh_token: string;
}
```

**Success response** (`204 No Content`). The body is empty by design;
no `data` envelope is returned.

**Side effects**:

- Marks the presented refresh token as `revoked_at = now` and clears
  `replaced_by`.
- Does **not** cascade to other tokens in the family. The legitimate
  user explicitly logging out only revokes the current chain.

**Error responses**:

| Status | Code                | When                                                                                |
|--------|---------------------|-------------------------------------------------------------------------------------|
| 400    | `VALIDATION_ERROR`  | Body fails schema validation.                                                       |
| 401    | `INVALID_TOKEN`     | Token is malformed or not found. Logging out with an unknown token is a no-op (idempotent). |

### `GET /auth/me`

Return the authenticated user. Used by the UI to bootstrap session
state.

**Authentication required**: yes (valid access JWT in
`Authorization: Bearer <token>`).

**Request**: no body.

**Success response** (`200 OK`):

```ts
interface MeSuccess {
  data: PublicUser;
}
```

**Error responses**:

| Status | Code          | When                                                                       |
|--------|---------------|----------------------------------------------------------------------------|
| 401    | `UNAUTHORIZED`| The `Authorization` header is missing, the JWT is malformed, expired, or signed with the wrong secret, or the `sub` does not correspond to an existing user. |

## Error codes

Exhaustive list of error codes the `auth` module can return, grouped
by category. All codes map to `AppError` instances (see
`error-handling` skill). The mapping is normative: a future change
may add new codes, but existing codes must keep their HTTP status
and machine-code values.

### Validation (4xx, client-fault)

| Code                   | HTTP | Human message (Spanish mirror)                                | When |
|------------------------|------|---------------------------------------------------------------|------|
| `VALIDATION_ERROR`     | 400  | "Los datos enviados no son válidos."                          | Request body fails Zod schema validation. The `details` field of the `AppError` carries the issue list. |
| `INVALID_EMAIL`        | 400  | "El email no es válido."                                      | Email is empty, malformed, or fails server-side normalization. |
| `PASSWORD_TOO_SHORT`   | 400  | "La contraseña debe tener al menos 10 caracteres."           | Password length < 10. |
| `INVALID_TOKEN`        | 401  | "El token es inválido."                                       | A presented token is malformed, not parseable, or its fingerprint is not in storage. |
| `UNAUTHORIZED`         | 401  | "Autenticación requerida."                                    | The access JWT is missing, expired, or invalid for `authMiddleware`-protected endpoints. |

### Credentials (4xx, client-fault, no info leak)

| Code                   | HTTP | Human message (Spanish mirror)                                | When |
|------------------------|------|---------------------------------------------------------------|------|
| `INVALID_CREDENTIALS`  | 401  | "Credenciales inválidas."                                     | Login: email not found, password does not match, or user has no local password. Identical response shape and timing (BR-AUTH-07). |

### Conflict (4xx, client-fault)

| Code                   | HTTP | Human message (Spanish mirror)                                | When |
|------------------------|------|---------------------------------------------------------------|------|
| `EMAIL_TAKEN`          | 409  | "El email ya está registrado."                                | Register: a user with the same normalized email already exists. Response time matches the success path (BR-AUTH-07). |
| `OAUTH_SUBJECT_TAKEN`  | 409  | "Esta cuenta de Google ya está vinculada a otro usuario."    | The `(provider, provider_subject)` unique constraint conflicts with an existing row pointing to a different user. |

### Refresh (4xx, client-fault)

| Code                   | HTTP | Human message (Spanish mirror)                                | When |
|------------------------|------|---------------------------------------------------------------|------|
| `REFRESH_EXPIRED`      | 401  | "La sesión expiró. Volvé a iniciar sesión."                  | The refresh token's `expires_at` is in the past. |
| `REFRESH_REVOKED`      | 401  | "La sesión fue revocada por seguridad. Volvé a iniciar sesión."| The refresh token is already revoked. Triggers family revocation (BR-AUTH-04). |

### OAuth (redirected)

OAuth callback failures are returned as `302` redirects to
`${APP_URL}/login?error=<code>`. The codes are also reported in
server logs with the same machine code.

| Code                          | When |
|-------------------------------|------|
| `oauth_state_mismatch`        | `state` cookie is missing, the `state` query does not match, the cookie is older than 10 minutes, or the signature fails. |
| `oauth_code_expired`          | Google's token endpoint reports the authorization code is invalid or expired. |
| `oauth_token_revoked`         | Google reports the token was revoked. |
| `oauth_email_unverified`      | `email_verified: false` in the userinfo response. |
| `oauth_email_missing`         | No `email` claim in the userinfo response. |
| `oauth_subject_taken`         | `(provider, provider_subject)` is already linked to a different user. |
| `oauth_provider_unavailable`  | Network error or 5xx from Google. |
| `oauth_userinfo_failed`       | Google returned a non-2xx response that did not match the categories above. |

### Server (5xx)

| Code                       | HTTP | Human message (Spanish mirror)                                | When |
|----------------------------|------|---------------------------------------------------------------|------|
| `INTERNAL_ERROR`           | 500  | "Ocurrió un error inesperado."                                | Catch-all for unexpected failures. The real error is logged with full stack. |
| `OAUTH_CONFIG_MISSING`     | 500  | "La configuración de OAuth no está completa."                 | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, or `GOOGLE_REDIRECT_URI` is not configured. |
| `OAUTH_PROVIDER_UNAVAILABLE`| 502 | "El proveedor de identidad no está disponible. Reintentá."    | Network error or 5xx from Google on the token or userinfo call. `Retry-After` header is set. |

## Business rules

The rules below are normative. Each rule has a stable ID for
traceability across spec, design, implementation, and tests.

- **BR-AUTH-01** — Email is the canonical identifier. There are no
  usernames. Email is normalized (lowercased, trimmed) before storage
  and lookup. Comparison is case-insensitive.
- **BR-AUTH-02** — Local password minimum length is 10 characters. No
  complexity rules beyond length (NIST SP 800-63B).
- **BR-AUTH-03** — Argon2id is the only acceptable password hashing
  primitive in this change. Final parameters (memory, iterations,
  parallelism) are recorded in the design and produce a target hash
  time in the 50–100 ms range on the Fly.io 1-CPU VM.
- **BR-AUTH-04** — Refresh token rotation is mandatory. Every
  successful `POST /auth/refresh` issues a new refresh and revokes
  the old one. Reuse of a revoked refresh is treated as theft: every
  token in the same `family_id` is revoked and the user is forced to
  re-authenticate.
- **BR-AUTH-05** — Access tokens are not revocable in MVP. The
  15-minute lifetime is the cap. If emergency revocation is ever
  required, a `users.token_version` column is added in a separate
  change and consulted at JWT verify time.
- **BR-AUTH-06** — Passwords, password hashes, refresh tokens, and
  refresh-token hashes never appear in logs, error responses, or
  response bodies. The data-access layer strips these fields; the
  logging layer excludes them by key.
- **BR-AUTH-07** — User enumeration is mitigated. `POST /auth/register`
  returns the same response shape whether the email is already in
  use or not (a generic `EMAIL_TAKEN` for the conflict and a
  successful `201` for new registrations, with comparable server-side
  processing time). `POST /auth/login` returns the same
  `INVALID_CREDENTIALS` shape and similar response time for the
  three failure modes (email not found, wrong password, Google-only
  user).
- **BR-AUTH-08** — Local registrations mark `email_verified = true` at
  insert time. There is no email-verification flow in MVP. The email
  is trusted by fiat; rate limiting on `/auth/register` is a separate
  change.
- **BR-AUTH-09** — When the Google OAuth callback returns an email
  that already exists in `users` (under any provider), the new
  `oauth_accounts` row is linked to the existing `users.id`. No
  password is requested. The `users` row keeps its existing
  `default_provider` and `email_verified`. The `oauth_accounts` row
  is the only thing created.
- **BR-AUTH-10** — `default_provider` is set on first registration and
  never changed. The first successful `POST /auth/register` writes
  `'local'`; the first successful Google OAuth callback that creates
  a new `users` row writes `'google'`. Subsequent provider links
  leave `default_provider` untouched.
- **BR-AUTH-11** — The OAuth `state` cookie and the `code` query
  parameter are the only inputs the server accepts from Google's
  redirect. The configured `APP_URL` and `GOOGLE_REDIRECT_URI` are
  validated against each other at startup; a mismatch fails fast.
- **BR-AUTH-12** — At most one `oauth_accounts` row exists per
  `(provider, provider_subject)` pair. The unique constraint
  prevents the same Google account from being linked to two
  different `users` rows. The unique-violation case is reported to
  the legitimate user as `oauth_subject_taken` and is not
  re-purposed as a generic 500.

## Security guarantees

- **Password storage** — Passwords are stored only as Argon2id encoded
  strings, with parameters tuned to ~50–100 ms on the Fly.io 1-CPU
  VM. The plaintext password is never persisted, logged, or included
  in any response body.
- **Refresh-token storage** — Refresh tokens are stored only as
  sha256 fingerprints. The plaintext token leaves the server once
  (in the `refresh_token` field of the success response of
  `register`, `login`, `refresh`, and the OAuth callback redirect
  fragment) and is not echoed back on any subsequent call.
- **JWT verification** — The auth middleware verifies JWTs with the
  `JWT_SECRET` env var using a constant-time comparison. The
  `alg: none` attack is rejected by pinning the algorithm to `HS256`
  on both issue and verify.
- **Timing-attack mitigation** — `POST /auth/login` always runs a
  Argon2id verify against a fixed dummy hash when the email is not
  found, so response time does not reveal whether the email exists.
  Response shape is identical across the three failure modes
  (BR-AUTH-07).
- **User enumeration** — `POST /auth/register` returns the same
  response shape and similar timing for `EMAIL_TAKEN` and success
  (BR-AUTH-07). Login uses `INVALID_CREDENTIALS` for all three
  failure modes.
- **CSRF on OAuth** — The `state` cookie is signed with
  `COOKIE_SECRET` (HMAC-SHA256) and bound to the OAuth callback
  path. The `state` value in the callback query is verified against
  the cookie before any other work is done. A missing, mismatched,
  older-than-10-minute, or unsigned cookie is rejected as
  `oauth_state_mismatch`.
- **Refresh token rotation on reuse** — When a revoked refresh token
  is presented, the entire `family_id` is revoked in a single
  transaction. The next legitimate call to `POST /auth/refresh` from
  any device that shared that family returns `REFRESH_REVOKED`,
  forcing the user to log in again.
- **OAuth `email_verified` enforcement** — The server reads
  `email_verified` from Google's userinfo response and rejects the
  registration with `oauth_email_unverified` when it is `false` or
  missing. There is no code path that bypasses this check.
- **OAuth subject uniqueness** — The DB unique constraint on
  `oauth_accounts(provider, provider_subject)` is the only line of
  defense against a malicious user linking their Google account to a
  victim's `users` row. The unique-violation is reported as
  `oauth_subject_taken` and surfaces to the user without exposing
  which user already owns the link.

## Cross-module contracts

Other modules rely on the following invariants. Any change that
breaks one of them is a breaking change and requires a spec delta.

### `UserRegistered` event

Dispatched exactly once per user, on the first registration (local
or Google). The auto-link path does **not** re-emit this event.

```ts
interface UserRegisteredEvent {
  type: 'UserRegistered';
  payload: {
    user_id: string;            // uuid v7
    email: string;              // Normalized lowercase.
    provider: 'local' | 'google';
    occurred_at: number;        // unix sec.
  };
}
```

Downstream consumers (e.g. a future welcome-email worker) subscribe
through `core/events/`. The `auth` module never imports from another
module directly (architecture-standards skill).

### `user_id` presence

Any HTTP request that successfully passes `authMiddleware` (i.e.
returns a 2xx or 4xx from a protected route) has `req.context.user_id`
set to a string uuid v7. The middleware throws
`AppError(401, 'UNAUTHORIZED', ...)` on any of:

- Missing `Authorization: Bearer` header.
- Malformed header (not a single space-separated `<scheme> <token>`
  pair).
- JWT signature verification failure.
- JWT expiry (`exp` in the past).
- JWT `sub` does not correspond to an existing `users.id`.

Routes declare their auth requirement with a `requireAuth` wrapper
(see the design for the contract). The wrapper is purely syntactic:
the underlying contract is "either `authMiddleware` ran successfully
or the route did not execute."

### Middleware contract

```ts
// Pseudocode — see design for the production shape.
function authMiddleware(req: Request, ctx: Context): { user: User };
// throws AppError(401, 'UNAUTHORIZED', ...) on any failure
```

The middleware returns a `User` (the public projection, no
`password_hash`) on success. Application-layer actions destructure
`user.id` and pass it down. The middleware does not enforce
permissions beyond "is this a valid caller" — RBAC is post-MVP.

## Out of scope

- Other OAuth providers (Apple, Facebook, GitHub). The data model
  supports adding them; the spec does not.
- Password reset and email verification flows. For MVP, password
  reset is a manual SQL `UPDATE` by the operator.
- Multi-factor authentication.
- Rate limiting on `/auth/login`, `/auth/register`, and
  `/auth/oauth/google`. Tracked as the separate
  `security-rate-limiting` change.
- Session listing and "log out all devices". Logout revokes only
  the current chain (BR-AUTH-04 cascade is a defense, not a feature).
- Generic RBAC on top of `user_id`. Every later change handles its
  own `WHERE user_id = ?` discipline.
- UI screens (login form, register form, OAuth button). The contract
  in this spec is the HTTP API only; the UI ships in
  `ui-auth-shell`.
- Account linking from the user profile ("Link Google to my account"
  from settings). The flow exists for first-time OAuth login; the
  on-demand link flow is a separate change.
- "Unlink Google" / "Set password" actions for existing users.
  Separate change.
- Refresh token pruning. Revoked tokens accumulate in the DB until
  a future change prunes them.
- User deletion. A future `user-deletion` change handles GDPR-style
  cleanup.
- Change-email flow. `users.email` is immutable in MVP.
- Email notifications on auto-link. Future hardening pass.
