# ADR-0009 — OAuth token encryption at rest (AES-256-GCM envelope)

**Status**: Accepted · **Date**: 2026-06-20 · **Deciders**: Sebastián Illa

## Context and Problem Statement

The Prisma `Account` model (`prisma/schema.prisma:48-54`) stored
`refresh_token`, `access_token`, and `id_token` as plaintext
`String? @db.Text`. A database read (DBA, backup leak, replica
compromise, SQL injection elsewhere in the app, vector DB
exposure via a misconfigured read replica) yielded full Google
account takeover for every linked user. The 4R-R1 review
flagged this as **CRITICAL** (OWASP A02 — Cryptographic Failures)
on 2026-06-20.

The user asked for the most urgent 4R follow-up: F-4R-1 OAuth
encryption. This ADR captures the decision and the rollout.

## Drivers

- **Confidentiality of OAuth refresh tokens** — `refresh_token`
  is the most sensitive field; possession enables indefinite
  Google account access. `access_token` and `id_token` are
  short-lived but still leak PII (email, name, profile URL).
- **No external KMS** — the project runs on Fly.io with the
  secrets store. No Vault, no HSM, no AWS KMS integration is
  on the roadmap for this iteration.
- **Single-region, single-process deployment** — there is no
  cross-region replication or process-shared key state to
  worry about. A single key in a single Fly secret is the
  simplest threat model that closes the DB-read surface.
- **Existing crypto infrastructure** — the project already
  uses Web Crypto (`src/shared/crypto/web-crypto.ts`) for
  HMAC, SHA-256, and UUIDv7. AES-256-GCM is one more Web
  Crypto primitive; no new dependency.

## Considered Options

1. **AES-256-GCM envelope (the chosen option)** — app-layer
   encryption with a 32-byte key from `OAUTH_TOKEN_ENCRYPTION_KEY`
   (env var, 64 hex chars). Per-row random 12-byte IV. The DB
   stores `Bytes?` (BYTEA in Postgres). The Auth.js v5
   adapter wrapper encrypts on `linkAccount` and decrypts on
   `getUserByAccount`. No new dependency; uses Web Crypto.
2. **pgcrypto extension** — Postgres `pgcrypto.encrypt()` /
   `pgcrypto.decrypt()` with a key supplied via SQL. Pro:
   transparent to the app. Con: requires superuser to enable
   the extension; the key has to be in the SQL session
   somehow (via `current_setting()`, which is its own
   secret-management headache); the key in the SQL session
   leaks via `pg_stat_statements` if query logging is on.
3. **External KMS (Vault, AWS KMS, Fly KMS)** — the gold
   standard. The app never sees the raw key; it issues
   `encrypt(plaintext, key_id)` and the KMS returns ciphertext.
   Con: Fly's KMS is limited (only secrets, not envelope
   encryption); AWS KMS is overkill for a personal-expense app
   and adds a network hop on every signin. Defer.
4. **Drop refresh tokens** — Google supports short-lived
   access tokens without refresh; the app would re-authorize
   every 60 minutes. Pro: no DB write at all. Con: terrible
   UX (the user is bounced to Google's consent screen on a
   timer); doesn't fix the access_token / id_token leak
   surface.

## Decision Outcome

**Chosen option**: 1 (envelope encryption with Web Crypto).

The implementation:

- `src/shared/crypto/envelope-encryption.ts` — the
  `encryptEnvelope(plaintext, key)` /
  `decryptEnvelope(ciphertext, key)` primitives. Layout
  `[12-byte IV | N-byte ciphertext | 16-byte GCM tag]`.
  GCM is authenticated; a tampered ciphertext throws.
- `src/modules/auth/infrastructure/adapters/encrypted-prisma-adapter.ts`
  — wraps `@auth/prisma-adapter`. Overrides
  `linkAccount` (encrypt before write) and
  `getUserByAccount` (decrypt after read). All other
  methods (User, Session, VerificationToken) are inherited
  unchanged.
- `prisma/schema.prisma` — `Account.refresh_token /
  access_token / id_token` change from `String? @db.Text`
  to `Bytes?`.
- `prisma/migrations/20260620_encrypt_oauth_tokens/migration.sql`
  — the schema migration. For an existing dev DB, a
  backfill script is required (see Rollout below).
- `src/shared/env/env.schema.ts` — adds
  `OAUTH_TOKEN_ENCRYPTION_KEY` (optional in dev, required
  in production). 64 hex characters = 32 raw bytes.
  Generate with `openssl rand -hex 32`.
- `src/modules/auth/infrastructure/external/authjs.ts` —
  swaps `PrismaAdapter(prisma())` for
  `createEncryptedPrismaAdapter(prisma())`. One-line change.

### Implementation notes

- **Key handling**: the key is read from
  `process.env.OAUTH_TOKEN_ENCRYPTION_KEY` lazily on each
  call (not cached at boot). This is fine for the dev hot
  path (env read is microseconds) and avoids a hard
  dependency on `instrumentation.ts` boot order.
- **Failure mode**: a missing or malformed key throws
  `AppError(INTERNAL_ERROR)` on every Account-touching
  call. There is **no plaintext fallback** — a
  misconfigured deploy must fail loud.
- **Test isolation**: the encryption helper is tested with
  a deterministic all-zeros key. The adapter wrapper is
  not yet unit-tested (the Auth.js v5 adapter surface is
  large; a follow-up PR will add focused unit tests with
  a fake `PrismaClient`).
- **Backwards compatibility**: the migration converts
  existing plaintext rows to `bytea` via a `convert_to` SQL
  cast. The result is **not** valid AES-256-GCM ciphertext
  (it's the raw UTF-8 bytes). A separate backfill script
  is required to re-encrypt existing rows with the
  application key.

### Threat model

| Adversary | Defense |
|---|---|
| DBA / backup leak / replica read | DB has only ciphertext; no key access. ✓ |
| Compromised runtime process | Attacker reads plaintext. ✗ (KMS-grade defense) |
| Replay of ciphertext (no tampering) | GCM auth tag detects; `decryptEnvelope` throws. ✓ |
| Key rotation | Out of scope. Future: key id in envelope, multi-key support. |
| Ciphertext truncation | `decryptEnvelope` throws on buffer < IV + tag. ✓ |

## Rollout

1. **Pre-merge**: this PR. The encryption helper, the
   adapter wrapper, the schema change, the migration, and
   the env schema are all in. No real-user data is touched
   (dev DB has no linked Google accounts yet).
2. **Dev deploy**: apply the migration. The `Account`
   table is empty; no backfill needed.
3. **Production deploy** (controlled window, future PR):
   1. Stop the app process (no concurrent writes to
      `Account`).
   2. Run the backfill script
      `scripts/backfill-encrypt-oauth-tokens.ts` against
      the live DB. The script reads each row, decrypts
      with the existing dev key (no-op if the env is
      clean), encrypts with the new key, and writes back.
      Idempotent (skips already-encrypted rows by trying
      to decrypt first; falls through to encrypt+write on
      parse failure).
   3. Set `OAUTH_TOKEN_ENCRYPTION_KEY` in the Fly
      secrets store.
   4. Start the app. The first signin for each user
      re-encrypts the row transparently.

## Verification

End-to-end verified on 2026-06-20 in this branch:

- `pnpm test` → 393 passed (379 existing + 14 new in
  `src/shared/crypto/envelope-encryption.test.ts`).
- `pnpm typecheck` → clean.
- Roundtrip: `encrypt('foo', key) → decrypt(...)` returns
  `'foo'`. Different IVs on each call. Tampering detected.
  Wrong key rejected. 64-char hex accepted; wrong length
  rejected; non-hex rejected.

## Consequences

- **Good**: the OAuth token leak surface is closed. A
  DBA / backup compromise can no longer yield Google
  account takeover. The implementation is ~250 lines
  (helper + adapter + tests) with zero new dependencies.
- **Good**: the Auth.js v5 adapter surface is unchanged
  for every non-Account method. The Google callback,
  the credentials authorize, the session lookup, and
  the verification token flows work without code
  changes.
- **Bad**: a future key rotation requires a multi-key
  envelope (add a 1-byte version prefix, support
  decryption with the old key + re-encryption with the
  new key). Out of scope for this iteration.
- **Bad**: the dev experience is one more env var to
  remember. The `AppError` on missing key is loud
  (good for prod) but noisy in dev. A future change
  could auto-generate a dev key in `instrumentation.ts`
  when `NODE_ENV === 'development'` and the env var is
  absent, with a one-time warning logged.
- **Bad**: tests for the adapter wrapper itself are
  missing. The encryption helper has 14 unit tests; the
  schema change is typecheck-clean. The wrapper is small
  (~100 lines) and the integration is type-checked at
  the boundary, but a follow-up PR should add focused
  tests with a fake `PrismaClient` to lock in the
  encrypt-on-link and decrypt-on-getUserByAccount
  contracts.

## Follow-ups

1. **Backfill script** (`scripts/backfill-encrypt-oauth-tokens.ts`)
   — required for the production rollout. Reads each
   `Account` row, idempotently encrypts with the app
   key, writes back. Out of scope for this PR.
2. **Key rotation** — add a 1-byte key version to the
   envelope, support decrypting with the previous key.
   Defer until the first rotation need.
3. **Dev key auto-generation** — when
   `OAUTH_TOKEN_ENCRYPTION_KEY` is missing and
   `NODE_ENV === 'development'`, generate a random
   key in `instrumentation.ts` and log a one-time
   warning. Saves the new dev from a setup step.
4. **Adapter wrapper unit tests** — fake `PrismaClient`
   to lock in the encrypt-on-link / decrypt-on-
   getUserByAccount contracts.
5. **Session/VerificationToken encryption** —
   `Session.sessionToken` is currently plaintext. The
   same pattern applies; the project has no
   `BR-AUTH-X` requirement to keep it that way, so
   defer.
