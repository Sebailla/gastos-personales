# Proposal — `auth-foundation`

**Status**: draft · **Author**: Sebastián Illa
**Created**: 2026-06-09 · **Updated**: 2026-06-09 (Google OAuth added)
**Target slice**: MVP-1 (identity layer)
**Upstream**: global SDD preflight (interactive, both, auto-forecast, 400 lines)

## Why

`gastos-personales` is a multi-user finance app. Every entity (Account,
Transaction, Snapshot, Category) is owned by a `user_id`. Every API
endpoint needs to identify the caller. The auth layer is the single
dependency that every other capability (accounts, transactions, fx,
snapshots, reports, ui) sits on top of. Doing it first lets every later
change assume identity is solved.

Shipping auth as a separate, isolated change also reduces the review
budget of every later change (no need to re-validate identity in each
PR) and isolates the highest-stakes code (passwords, JWT, refresh
rotation, OAuth) so it gets dedicated adversarial review.

## What

A self-contained auth subsystem that supports two registration methods
and one login mechanism per user:

| Method | Register | Login | Notes |
|---|---|---|---|
| Local (email + password) | `POST /auth/register` | `POST /auth/login` | Argon2id for hashing. |
| Google OAuth 2.0 | `GET /auth/oauth/google` → `GET /auth/oauth/google/callback` | Same callback (unified entry) | Opaque provider, single provider in this change. |

The two methods are unified at the User entity: a user has zero or
one local password and zero or more OAuth providers. A user can log in
through any method that has a credential registered.

### Endpoints

| Endpoint | Behavior |
|---|---|
| `POST /auth/register` | Create a new user with email + password (local). Returns access + refresh tokens. |
| `POST /auth/login` | Verify password for an existing local user. Returns access + refresh tokens. |
| `GET /auth/oauth/google` | Redirect the browser to Google's OAuth consent screen. State cookie holds CSRF token. |
| `GET /auth/oauth/google/callback` | Handle the OAuth callback. Exchange code, fetch profile, upsert user, issue our tokens. Redirects to the app with tokens (or to `/login?error=…`). |
| `POST /auth/refresh` | Exchange a valid refresh token for a new access + refresh pair. Old refresh is rotated. |
| `POST /auth/logout` | Revoke the current refresh token. |
| `GET /auth/me` | Return the authenticated user (used by the UI to bootstrap session). |

### Data model

- `users` table: `id` (uuid v7), `email` (unique, citext, normalized lowercase), `password_hash` (Argon2id, **nullable**), `email_verified` (boolean, true if confirmed by self-registration or by Google), `default_provider` (`local` | `google`), `created_at`, `updated_at`.
- `refresh_tokens` table: `id` (uuid v7), `user_id`, `token_hash` (sha256 of opaque token), `issued_at`, `expires_at`, `revoked_at`.
- `oauth_accounts` table: `id` (uuid v7), `user_id`, `provider` (`google` only for now), `provider_subject` (Google's `sub`), `provider_email` (the email Google returned, for audit), `created_at`. Unique constraint on `(provider, provider_subject)`.

### Token strategy

- **Access token**: JWT HS256, 15-minute lifetime. Claims: `sub` (user id), `iat`, `exp`, `jti`.
- **Refresh token**: opaque, 32 random bytes, base64url. Stored as sha256 hash, never plaintext. 30-day lifetime. Rotation: every refresh issues a new pair and revokes the old. Reuse of a revoked refresh revokes the entire family.
- **Auth middleware**: extracts Bearer token, verifies JWT, loads `user_id` into request context. Returns 401 on missing/expired/invalid.

### OAuth flow details

- **Library**: `arctic` (the modern successor to `oslo` for OAuth providers in TS/Bun). Or `google-auth-library` if we want Google's first-party SDK. Decision in design.
- **Scopes**: `openid email profile`. The `openid` scope is what gives us the `id_token` and the `sub` claim. `email` gives us the email. `profile` is not strictly required for our use case.
- **State**: random 32-byte token stored in an HttpOnly, SameSite=Lax cookie, validated on callback. Prevents CSRF.
- **Profile fetch**: we use the access token returned by Google to fetch `https://openidconnect.googleapis.com/v1/userinfo`. We trust `email_verified: true`; if false, we reject the registration.
- **Auto-link on email match**: if a user with the same email already exists (local or other provider), we link the new OAuth account to that user. We do not prompt for password. (See security note below.)
- **Error UX**: on any failure in the OAuth flow, we redirect to `${APP_URL}/login?error=<code>` instead of rendering a server error page. The UI surfaces the error.

## Out of scope (this change)

- Other OAuth providers (Apple, Facebook, GitHub) — post-MVP. The design supports adding them, but only Google ships.
- Password reset / email verification flow — post-MVP. For MVP, password reset is a manual SQL update by the operator.
- Multi-factor auth — post-MVP.
- Rate limiting on `/auth/login` and `/auth/oauth/google` — separate change `security-rate-limiting`.
- Session listing / "log out all devices" — separate change.
- Generic ACL on top of `user_id` — every later change handles its own `WHERE user_id = ?` discipline.
- UI screens (login form, register form, OAuth button) — separate change `ui-auth-shell`. The contract here is the HTTP API only.
- Account linking from the user profile ("Link Google to my account") — separate change. The flow exists, but only on first OAuth login.
- "Unlink Google" / "Set password" actions for existing users — separate change.

## Non-goals

- **Not building an auth-as-a-service product.** No multi-tenant admin panel, no tenant provisioning, no SSO.
- **Not introducing global session storage.** Access tokens are stateless JWTs; refresh tokens are DB-backed but only consulted on refresh.
- **Not handling GDPR / data deletion workflows.** Users are deleted with their data in one operation when `user-deletion` ships.
- **Not adding email verification for Google signups.** We trust Google's `email_verified` claim. A user could in theory have a Google account with an unverified email we reject at registration, but we don't run our own check.
- **Not sending notification emails** when a Google account is auto-linked. (Could be added in a hardening pass.)

## Users and situations

| User | Situation | Touchpoint |
|---|---|---|
| New user, local | Lands on the app, wants to track personal finance | Register form (later) → `POST /auth/register` |
| New user, Google | Prefers one-click signup | OAuth button (later) → `GET /auth/oauth/google` |
| Returning user, local | Has account with password, comes back days later | Login form (later) → `POST /auth/login` |
| Returning user, Google | Has account linked to Google | OAuth button (later) → `GET /auth/oauth/google` |
| Active user, mixed | Registered local, later linked Google | Either method works |
| Active user, access expired | Mid-session, access JWT expired | Silent `POST /auth/refresh` from API client → 401 → redirect to login if refresh fails |
| Compromised device | Wants to invalidate sessions | `POST /auth/logout` for current session. Full revocation is a later change. |

## Business rules

1. **Email is the canonical identifier.** No usernames. Email is normalized (lowercased, trimmed) before storage and lookup. Comparison is case-insensitive.
2. **Local password minimum**: 10 characters. No complexity rules beyond length (NIST SP 800-63B).
3. **Argon2id parameters**: tuned to ~50-100ms hash time on the Fly.io 1-CPU VM. Final params decided in design.
4. **Refresh token rotation is mandatory.** Every refresh issues a new refresh and revokes the old. Reuse of a revoked refresh is treated as theft: the entire family is revoked and the user is forced to re-login.
5. **Access tokens are not revocable** in MVP. 15-minute lifetime is the cap. If we ever need emergency revocation, we add `users.token_version` in a later change.
6. **No password / token storage in logs, errors, or response bodies.** The schema layer strips sensitive fields.
7. **User enumeration is mitigated**: register returns the same response shape whether the email exists or not (generic error, similar response time). Login says "invalid credentials" without revealing which half was wrong.
8. **OAuth email must be verified by Google** (`email_verified: true`). If false, we reject the registration and redirect to `/login?error=oauth_email_unverified`.
9. **Auto-link on email match**: when Google returns an email that already exists in our DB (under any provider), we link the new `oauth_accounts` row to the existing `users.id`. No password is requested. The `oauth_accounts` row is the only thing created; the user keeps their existing data. (See security note in implications.)
10. **`default_provider` is set on first registration** and never changed. It's the method used when the user has both. Used by `GET /auth/me` to render the "last login" hint in the UI.
11. **OAuth callback URL is fixed and validated server-side.** The `state` cookie and the `code` parameter are the only inputs we accept from the redirect.
12. **One OAuth account per (provider, subject) globally.** The unique constraint on `oauth_accounts(provider, provider_subject)` prevents the same Google account from being linked to two users. (If a malicious actor tried to link their Google to a victim's account, the second link would fail with 409.)

## Implications and impact

| Area | Impact |
|---|---|
| **Database** | New `users` (with nullable `password_hash`), `refresh_tokens`, `oauth_accounts` tables. SQLite, owned by this change. |
| **API surface** | 7 new endpoints (5 local + 2 OAuth) under `/auth/*`. No breaking change. |
| **Domain layer** | New `auth` module: `User`, `RefreshToken`, `OAuthAccount` entities. `AuthService` with `register`, `login`, `refresh`, `logout`, `me`, `startGoogleOAuth`, `handleGoogleCallback`. |
| **Application layer** | Auth actions orchestrate services + DTOs. |
| **Infrastructure** | Argon2 + JWT + crypto-random + OAuth client (`arctic` or `google-auth-library`). Drizzle repos. |
| **Cross-module events** | `UserRegistered` event emitted on first registration. Downstream consumers can subscribe (e.g., to send a welcome email — out of scope here). |
| **UI** | None in this change. UI is `ui-auth-shell`. |
| **CI / deploy** | No deploy. Local tests only. Deploy in `fly-deploy`. New Fly secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. |
| **Bilingual docs** | This proposal + spec + design all mirrored in `Documents-es/openspec/...`. |
| **Security risk** | **Auto-link on email match** means whoever controls an email effectively controls the account. This is industry-standard (Notion, Linear, Vercel) but worth flagging. Mitigation deferred to a hardening pass if needed. |

## Edge cases (product)

| Scenario | Behavior |
|---|---|
| Register local with already-used email | 409 `EMAIL_TAKEN`. Response time matches successful registration. |
| Register local with empty email | 400 `INVALID_EMAIL`. |
| Register local with 5-char password | 400 `PASSWORD_TOO_SHORT`. |
| Login local with wrong password | 401 `INVALID_CREDENTIALS`. |
| Login local with non-existent email | 401 `INVALID_CREDENTIALS` (same shape as wrong password). |
| Login local when user has no password (Google-only) | 401 `INVALID_CREDENTIALS` (does not leak "no password"). |
| OAuth callback with invalid `state` cookie | Redirect to `/login?error=oauth_state_mismatch`. No user created. |
| OAuth callback with expired code | Redirect to `/login?error=oauth_code_expired`. |
| OAuth callback with revoked Google token | Redirect to `/login?error=oauth_token_revoked`. |
| OAuth returns `email_verified: false` | Redirect to `/login?error=oauth_email_unverified`. No user created. |
| OAuth returns email already linked to same user | Re-login. No new user, no new link. Tokens issued. |
| OAuth returns email linked to a **different** user | Auto-link to the existing user. New `oauth_accounts` row. Tokens issued. (Industry standard. Security note above.) |
| OAuth returns subject already linked to a user (different email) | Reject with 409 `OAUTH_SUBJECT_TAKEN`. This is the only way we say "this Google account is already linked" — the unique constraint catches it. |
| Refresh with expired refresh token | 401 `REFRESH_EXPIRED`. Client redirects to login. |
| Refresh with revoked refresh token | 401 `REFRESH_REVOKED`. Family revoked. User must re-login. |
| Refresh with malformed token | 401 `INVALID_TOKEN`. |
| Access expired but refresh valid | Silent refresh, no UX interruption. |
| Both tokens invalid | 401 from API, client clears local state, redirect to login. |
| Logout from one device | Only that refresh family revoked. Other devices keep working. |
| Server restart with active sessions | Stateless JWTs survive. Refresh tokens survive (SQLite). No session loss. |
| Two devices register / login at same time | Each gets independent tokens. No contention. |
| Argon2 library fails to load | 500 `INTERNAL_ERROR`. Logged with stack, not exposed. |
| DB locked during register | Retry 3x with exponential backoff. If still failing, 503. |
| Google OAuth API down | 502 `OAUTH_PROVIDER_UNAVAILABLE`. Retry-after header. |
| User has 5+ OAuth providers in the future | Out of scope for now. The schema supports it (one row per provider per user). |

## Decision gaps (open for the next proposal/spec round)

| Question | Default if not answered | How to resolve |
|---|---|---|
| Do we need a "confirm password" field on register? | Yes, UI concern (later change) | UI change, not auth API |
| What happens to refresh tokens on password change? | Revoke all. User logs out everywhere. | Add to this change if product wants it; otherwise separate change. |
| Should we support multiple devices per user? | Yes (no limit in MVP) | Implicit, no code needed |
| What if the user wants to change email? | Out of scope for MVP | Separate change |
| What about rate limiting on auth endpoints? | Out of scope. Separate change `security-rate-limiting`. | Tracked |
| Should `oauth_accounts.provider_email` be updated if Google changes the user's email? | Yes (audit trail) | TBD in design |
| Do we send a notification email on auto-link? | No (out of scope). Future hardening. | Track for later |

## Acceptance (evidence the reviewer will see)

1. **Tests pass**: `bun test` exits 0. Coverage on the `auth` module ≥ 80% (line + branch).
2. **Manual smoke**: `bun run start` → register local, login local, refresh, logout, me all return correct status codes. OAuth flow exercised end-to-end with a test Google client. Curl examples in the handoff.
3. **Adversarial review**: a `reviewer` subagent audits the diff with focus on: timing attacks, user enumeration, token leakage in logs, JWT algorithm confusion, Argon2 parameter choice, refresh token rotation correctness, OAuth `state` CSRF protection, OAuth `code` reuse, auto-link security model, `oauth_accounts` unique constraints.
4. **GGA**: `gga run` exits 0. Output pasted in the handoff.
5. **Bilingual docs**: `openspec/changes/auth-foundation/proposal.md` and `Documents-es/openspec/changes/auth-foundation/proposal.md` are in sync. Drift detection runs in the same commit.
6. **Architecture doc updated**: `docs/architecture.md` (mirror in `Documents-es/docs/`) gains an "Auth" section that this proposal links to.

## Risks (mitigated)

| Risk | Mitigation |
|---|---|
| Argon2 params too slow on Fly.io free VM | Benchmark on target VM during design; spec includes the target hash time. |
| JWT secret leaked in logs or error | `JWT_SECRET` is a Fly secret (encrypted at rest), never logged. Lint rule forbids `console.log` in `auth/`. |
| Google OAuth library breaks on Bun | Validate in design. Fall back to direct fetch against Google's endpoints if the library doesn't work. |
| Refresh token DB row grows unbounded | Separate change will prune revoked tokens older than N days. Out of scope here. |
| User table grows unbounded with garbage | Separate `user-deletion` change will handle GDPR-style cleanup. |
| Race condition between concurrent refresh requests | DB unique constraint + transaction makes one win; loser sees 401. Family revocation on reuse protects the legitimate-then-stolen scenario. |
| OAuth callback URL mismatch (env misconfigured) | Server validates the configured `APP_URL` against the `redirect_uri` sent to Google. Fails fast in design-time smoke test. |
| Auto-link is a security risk (documented) | Industry standard, accepted for MVP. Hardening pass tracked. |
| `email_verified: false` accepted by mistake | Server checks explicitly, rejects with `oauth_email_unverified`. |

## Change ordering downstream

After this change, the following are unblocked:

1. `accounts-ledger` — needs `user_id` and auth middleware.
2. `fx-cache` — independent of auth, but ordered here for "infra helpers" coherence.
3. `networth-snapshot` — depends on `accounts-ledger`.
4. `reports-mvp` — depends on `accounts-ledger` + `networth-snapshot` + `fx-cache`.
5. `pwa-shell` — depends on `auth-foundation` (UI) + at least one protected resource.
6. `fly-deploy` — independent; lands at the end.

## Next step

Approve this proposal to unblock `sdd-spec` (spec deltas for the `auth` capability) and `sdd-design` (decisions on Argon2 parameters, JWT library, OAuth library, middleware shape, error codes).
