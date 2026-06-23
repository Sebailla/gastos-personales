# Explore — `transactions`

**Status**: research · **Author**: Sebastián Illa
**Created**: 2026-06-22 · **Target slice**: MVP-2 (transaction ledger)
**Upstream**: global SDD preflight (interactive, both, auto-forecast, 400 lines)

> **Research document.** This is the `sdd-explore` output for
> the `transactions` change. It inventories the codebase, names
> reusable seams, lists gaps and unknowns, and surfaces the
> decisions the orchestrator will close before `sdd-propose`.
> **No design proposal lives here.** No `proposal.md`,
> `spec.md`, `design.md`, or `tasks.md` is created in this
> phase. Slice plan is advisory; `sdd-tasks` owns the final
> ordering.

---

## 1. Summary

The `transactions` change adds the **transaction ledger**
capability to `gastos-personales`: manual expense registration
(CRUD) plus multi-moneda (using the `fx` module's
`FxRateProvider` for conversion to the account's `casa`),
attachments, and recurrence. The **locked Slice 1 scope** is
**the `Transaction` aggregate + CRUD + multi-moneda via the
`fx` module**; attachments and recurrence are explicitly
deferred to Slice 2+ of the same change. The authoritative
rule is **"Slice 1 = entity + CRUD + multi-moneda FIRST;
attachments and recurrence come AFTER Slice 1 lands."**
A transaction can be in any currency supported by the
`fx` module; on display, balance and totals convert to the
account's `casa` (per-account casa from `fx-cache`) using the
existing `FxRateProvider` port in `src/modules/fx/`.

## 2. What already exists in the codebase

This section enumerates every module, file, port, table, and
env var that the new change will touch or rely on. Each entry
is verified by reading the cited file.

### 2.1. `accounts` module — hard dependency

The new `Transaction` aggregate references
`FinancialAccount.id` via `accountId: string` (FK with
`onDelete: Cascade`, mirroring the `FinancialAccount.userId`
→ `User.id` invariant in `prisma/schema.prisma:214`).

| File                                                                          | What it provides today                                                                                                                                                                              | Hard / Soft dep                                                                                                                                                           |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma:177-219`                                                | `FinancialAccount` model, `@@unique([userId, type, name])`, `@@index([userId, archivedAt])`, `@@index([userId, createdAt])`, nullable `casa AccountFxCasa?` (line 209).                             | **Hard** — `Transaction.accountId` FK + `casa` lookup at display time.                                                                                                    |
| `src/modules/accounts/domain/entities/financial-account.ts:78-86`             | `AccountFxCasa` enum as plain TS const (UPPERCASE Prisma form).                                                                                                                                     | **Hard** — `transactions` will need to resolve `account.casa` for display.                                                                                                |
| `src/modules/accounts/domain/services/account.service.ts:132-149`             | `AccountService.getBalance(userId, id, displayCurrency, casa)` — reads native balance, calls `FxRateProvider.getDisplayAmount`. Returns `FxConversionResult { native, display, stale, warnings? }`. | **Soft** — the new change consumes the same shape; it does not extend the service.                                                                                        |
| `src/modules/accounts/index.ts:27-64`                                         | Public barrel exports: `AccountService`, the 5 base enums + `AccountFxCasa`, the 2 ports (`AccountRepositoryPort`, `FxRateProvider`), `OpeningBalance` value object, `FinancialAccount` shape.      | **Hard** — boundary for any cross-module import. The barrel does NOT export the FX provider implementation or the Prisma repository (architecture-standards: ports only). |
| `src/modules/accounts/application/dto/financial-account-balance.dto.ts:22-46` | `FinancialAccountBalanceDto` wire shape with `{ native, display, stale, warnings? }`; `toBalanceDto()` mapper.                                                                                      | **Soft** — used by `transactions` if a "balance in account currency" surface is needed, but not a direct dependency.                                                      |
| `openspec/specs/accounts/spec.md` (full file)                                 | Canonical spec with the 10 closed decisions (lines 18-35), the BR-ACC-12..19 rules, and the discriminated-union entity table.                                                                       | **Hard reference** — `transactions` cross-references BR-ACC-12 (display-only FX).                                                                                         |

### 2.2. `fx` module — hard dependency (display-only conversion)

| File                                                                         | What it provides today                                                                                                                                                                                                                      | Hard / Soft dep                                                                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/fx/index.ts:28-39`                                              | Public barrel exports `FxRateProviderDolarApi`, `DolarApiClient`, `UpstashFxRateCache`, `withLock`, `fxCasaStringSchema`, `FX_CASAS`, `FxCasaString`, `FxQuote`. **No port interface is exported** (port lives in `accounts`).              | **Hard** — `transactions` imports `fxCasaStringSchema`/`FxCasaString` for normalization.                                                                    |
| `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.ts:46-83` | `FxRateProviderDolarApi.getDisplayAmount()` reads `request.casa`, hits cache or DolarAPI, returns `FxConversionResult`. **No account lookup happens inside the provider** (REQ-FX-3 enforced at the type level).                            | **Hard** — the conversion path is consumed unchanged.                                                                                                       |
| `src/modules/fx/infrastructure/external/dolar-api.client.ts:39`              | Default DolarAPI base URL `https://dolarapi.com/v1`; 3 s timeout (line 32).                                                                                                                                                                 | **Soft** — only relevant if a future transaction-summary endpoint needs batch conversion.                                                                   |
| `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.ts:14, 23`        | Key prefix `gastos-personales:fx:v1`; TTL `EX 3600`.                                                                                                                                                                                        | **Soft** — reused if a multi-account balance roll-up is added later.                                                                                        |
| `openspec/specs/fx/spec.md` (lines 132-191)                                  | `FxQuote`, `FxRateCacheEntry`, `FxRequest` value-object contracts. The `FxRateProvider` is a read-only display concern; it does **not** own FX storage for transactions (line 96-98: "v1 the FX surface stays read-only and display-only"). | **Hard reference** — the spec explicitly contemplates that a future `transactions` change MAY store the FX rate used at write time on each transaction row. |

### 2.3. `auth` module — hard dependency (identity anchor)

| File                                  | What it provides today                                                                                                                                                                          | Hard / Soft dep                                                                                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma:22-42`          | `User` model with `id: String @id @default(cuid())`, `email @unique`, `emailVerified`, `passwordHash`, `defaultProvider`, `lastLoginAt`. `FinancialAccount[]` relation (line 36).               | **Hard** — `Transaction.userId` FK references `User.id`.                                                                                                                           |
| `prisma/schema.prisma:71-79`          | `Session` table (`sessionToken @unique`, `expires`, FK to `User` with `onDelete: Cascade`).                                                                                                     | **Hard** — every Hono endpoint reads `c.get('user')` from the auth middleware.                                                                                                     |
| `src/modules/auth/index.ts:18-20`     | Public barrel exports exactly 7 symbols: `auth`, `signIn`, `signOut`, `handlers`, `honoApp`, `UserRegistered`, `UserSignedIn` (the doc comment claims 7; the actual export line confirms them). | **Hard** — `transactions` imports `auth` for server components / actions and `honoApp` only if a sub-app is needed (it is not; the routes live on the existing protected sub-app). |
| `src/modules/api/app.ts:131-184`      | `authMiddleware` runs after public routes; protected sub-app mounts at `/`. `requireSession` middleware narrows `c.get('user')` to `AuthUser` (not nullable).                                   | **Hard** — every `transactions` Hono route mounts inside the `protectedApp` sub-app at `app.ts:192`.                                                                               |
| `openspec/specs/auth/spec.md:619-647` | The `auth()` server-side helper invariant; every module MUST scope reads to `userId`. No row-level security in MVP.                                                                             | **Hard reference** — `transactions` follows the same pattern.                                                                                                                      |

### 2.4. App Router / Hono surface — hard dependency

| File                                                                               | What it provides today                                                                                                                                                                                    | Hard / Soft dep                                                                                             |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `app/api/[...path]/route.ts:7-25`                                                  | The Hono catch-all mounts at `app/api/[...path]/route.ts`. Forwards GET/POST/PATCH/DELETE to `honoApp.fetch(request)`. Forced `runtime = 'nodejs'` because `@node-rs/argon2` cannot load in Edge.         | **Hard** — `transactions` does NOT add its own route file. It mounts inside the existing protected sub-app. |
| `src/modules/api/app.ts:222-306`                                                   | The 7 accounts routes are mounted here as `protectedApp.get/post/patch(...)`. The pattern is identical for any future capability.                                                                         | **Hard reference** — `transactions` follows the same shape (action → mapper → `c.json`).                    |
| `src/modules/api/app.ts:317-352`                                                   | `buildDefaultDeps()` constructs the DI graph at startup: `authService`, `authjsAuth`, `fxRateProvider`. The protected sub-app does NOT receive `user`; it reads `c.get('user')`.                          | **Hard** — `transactions` adds a new service + repository to the DI graph.                                  |
| `proxy.ts:24-72`                                                                   | The Next.js proxy 307-redirects unauthenticated App Router pages to `/auth/signin?callbackUrl=...`. `PUBLIC_PATHS` is the single source of truth; the matcher excludes `_next`, `api`, and `favicon.ico`. | **Hard** — any new `/transactions/*` page must NOT be added to `PUBLIC_PATHS` (it requires auth).           |
| `app/accounts/page.tsx`, `app/accounts/new/page.tsx`, `app/accounts/[id]/page.tsx` | The 3 smoke-UI pages. Each header carries a `// smoke-minimal, not production` comment per BR-ACC §"Smoke UI is NOT production UI".                                                                       | **Soft reference** — `transactions` smoke UI mirrors the pattern.                                           |

### 2.5. Prisma schema — hard dependency (storage layer)

| File                             | What it provides today                                                                                                           | Hard / Soft dep                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma:10-18`     | `provider = "postgresql"`; no `url` in the schema (Prisma 7 reads it from `prisma.config.ts`).                                   | **Hard** — the new `Transaction` model lives in the same file.                                                                                     |
| `prisma/migrations/` (directory) | All migrations land here. `accounts-ledger` shipped `add_financial_account`; `fx-cache` shipped `add_account_fx_casa`.           | **Hard** — `transactions` ships at least one migration. The migration MUST be additive (no destructive column changes in a multi-feature backlog). |
| `src/shared/db/prisma.ts:26-35`  | `prisma()` lazy singleton; Prisma 7 with `@prisma/adapter-pg`. `setPrismaClient()` and `__resetPrismaForTests()` are test seams. | **Hard** — repository implementations consume the same singleton.                                                                                  |
| `src/shared/db/prisma-types.ts`  | `asPrismaDelegateView()` structural cast (avoids `as any`).                                                                      | **Hard** — repository ports use this to keep imports narrow.                                                                                       |

### 2.6. Shared infrastructure

| File                                          | What it provides today                                                                                                                                                                                            | Hard / Soft dep                                                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/errors/app-error.ts:20-35`        | `AppError` with `code`, `statusCode`, `message`, `details`, `cause`.                                                                                                                                              | **Hard** — `transactions` throws `AppError` for domain failures (e.g. `NAME_TAKEN`, `INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`).                                            |
| `src/shared/errors/error-codes.ts:12-43`      | `ErrorCode` enum (`VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`, `NAME_TAKEN`, `FX_UNAVAILABLE`, `FX_NOT_SUPPORTED`, `RATE_LIMITED`, `INTERNAL_ERROR`, …). `ErrorStatus` map at line 52-66.                     | **Hard** — `transactions` reuses existing codes where possible; **new codes** (e.g. `INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED`) are added to this enum. |
| `src/shared/env/env.schema.ts:25-106`         | Zod-validated env: `NODE_ENV`, `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID/SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY`, `SENTRY_DSN`, `DOLAR_API_BASE_URL` (optional), `FX_DEFAULT_CASA` (optional, lowercase enum). | **Hard** — `transactions` may add new env vars (e.g. `ATTACHMENTS_DIR`, `MAX_ATTACHMENT_BYTES`); each new var is added here with a Zod rule.                                 |
| `src/shared/events/event-dispatcher.ts:33-65` | `EventDispatcher` in-process pub/sub with `UserRegistered` and `UserSignedIn` payloads (lines 4-18). Process-wide singleton `dispatcher`.                                                                         | **Hard** — `transactions` MAY emit a `TransactionRecorded` event (see DG-TX-N below); uses the same dispatcher.                                                              |
| `src/shared/rate-limit/rate-limit.ts:39-94`   | Upstash Ratelimit sliding window; env-var-gated no-op when `UPSTASH_REDIS_REST_URL` / `TOKEN` are missing. Used by `/api/auth/register` and `/api/auth/callback/credentials`.                                     | **Soft** — `transactions` may rate-limit bulk import endpoints (out of v1 scope) or burst-create safety.                                                                     |
| `src/shared/logger/logger.ts`                 | Structured logger with Sentry capture rules. `fx.cache.*`, `fx.stale.refresh`, `event_subscriber_threw` events already defined.                                                                                   | **Hard** — `transactions` emits `transactions.create`, `transactions.update`, `transactions.delete`, `transactions.fx.convert`, `attachments.upload`.                        |
| `src/shared/clock/clock.port.ts:22-24`        | `Clock` interface with `now(): Date`. `systemClock` lives at `src/shared/clock/system-clock.ts`.                                                                                                                  | **Hard** — every service depends on `Clock` per `architecture-standards`; no `new Date()` in domain.                                                                         |
| `src/shared/http/error-handler.ts:34-103`     | Central Hono error handler. Maps `AppError` to `{ error: { code, message, details? } }`, `RateLimitError` to `429` with `Retry-After`, unknown errors to `500 INTERNAL_ERROR`. Status union at line 18.           | **Hard** — `transactions` adds no new mapping; existing codes suffice.                                                                                                       |

### 2.7. OpenSpec process — meta dependency

| File                                                                                                                   | What it provides today                                                                                                                                                                                                | Hard / Soft dep                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openspec/AGENTS.md:42-67`                                                                                             | **Author rule:** `**Author**: Sebastián Illa` only — no AI attribution, no co-author forms, no "with AI help" qualifiers. The `reviewer` checks this on every PR. Spanish mirror carries `**Autor**: Sebastián Illa`. | **Hard** — every Markdown artifact in this change MUST use that header.                                                                                                           |
| `openspec/config.yaml`                                                                                                 | `schema: spec-driven`, `artifactStore: both`, capabilities list (`auth`, `accounts`, `transactions`, `fx`, `snapshots`, `reports`, `ui`), `strictTdd.enabled: true`, runner `pnpm test`.                              | **Hard** — `transactions` is the third capability to write a delta spec; the slot already exists.                                                                                 |
| `openspec/changes/_template/proposal.md` (English) and `Documents-es/openspec/changes/_template/proposal.md` (Spanish) | The proposal template. `sdd-propose` reads from this for sections.                                                                                                                                                    | **Soft** — `sdd-propose` reads it; this phase does not.                                                                                                                           |
| `openspec/specs/`                                                                                                      | The canonical spec tree. Only `accounts`, `auth`, `fx` are written; `transactions`, `snapshots`, `reports`, `ui` are reserved slots.                                                                                  | **Hard** — `transactions` writes a delta spec into `openspec/changes/transactions/specs/transactions/spec.md`; archive step promotes it to `openspec/specs/transactions/spec.md`. |

## 3. Reusable seams

Concrete functions, ports, DTOs, test helpers, and fixtures
the new code can import or model after. Every entry is verified
by reading the cited file.

### 3.1. Ports (interfaces) to consume or mirror

- **`AccountRepositoryPort`** —
  `src/modules/accounts/domain/interfaces/account.repository.port.ts`.
  Declares `findById`, `create`, `update`, `archive`,
  `unarchive`, `list`, `count`. **Model `TransactionRepositoryPort`
  on this** (4-5 methods, no DTO leakage).
- **`FxRateProvider`** —
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts:90-100`.
  `getDisplayAmount(request: FxConversionRequest): Promise<FxConversionResult>`.
  **Already imported by `accounts`** — `transactions` re-uses
  the same interface unchanged.
- **`Clock`** — `src/shared/clock/clock.port.ts:22-24`. One-method
  interface. Inject in every service.
- **`FxRateCachePort`** — `src/modules/fx/domain/ports/fx-rate-cache.port.ts`.
  Used by `FxRateProviderDolarApi`; not directly relevant to
  `transactions` but worth flagging if a future per-account
  cached conversion is added.

### 3.2. Action pattern (Hono → service → repository)

- The canonical action shape lives at
  `src/modules/accounts/application/actions/create-account.action.ts`
  (full file is 100+ lines). The pattern is:
  1. Parse with `safeParse(rawBody)`; on failure return `zodErrorToActionError(parsed.error)`.
  2. Read `userId` from the Hono context (never trust body).
  3. Call the service method with `(userId, parsedInput)`.
  4. Catch `AppError` and return `appErrorToActionError(err)`.
  5. Return `{ ok: true, data: result }` or `{ ok: false, error: ... }`.
- Helper file: `src/modules/accounts/application/actions/_shared.ts`
  exports `zodErrorToActionError`, `appErrorToActionError`,
  `ActionResult` type.
- `src/modules/accounts/application/actions/_narrow.ts` exists
  for type narrowing.

### 3.3. Validation pattern (Zod discriminated union)

- `src/modules/accounts/application/validation/account-create.schema.ts:38-49`
  shows `openingBalanceSchema = z.discriminatedUnion('mode', [...])`
  with FRESH vs HISTORICAL branches. **Model
  `transactionCreateSchema` on this** when the per-type or
  per-direction (income/expense/transfer) discriminated union
  is needed.
- `src/modules/accounts/application/validation/account-fx-casa.schema.ts:33-39`
  shows the UPPERCASE Prisma enum bridge. **If the
  `Transaction` carries a denormalized FX field** (DG-TX-3),
  the same `accountFxCasaSchema` (or a parallel
  `transactionFxCasaSchema`) is reused.

### 3.4. DTO mapper pattern

- `src/modules/accounts/application/dto/financial-account-balance.dto.ts:29-45`
  shows `toBalanceDto(result)` returning `{ native, display,
stale, warnings? }`. The DTO has the `stale` and `warnings`
  fields after `fx-cache` landed (`FinancialAccountBalanceDto`
  is co-owned by `accounts` and `fx`).
- `src/modules/accounts/application/dto/financial-account.dto.ts`
  defines `toFinancialAccountDto(row)`. **Model
  `toTransactionDto(row)` on the same shape.**

### 3.5. Repository pattern (Prisma adapter)

- `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts`
  is the only Prisma adapter for `accounts`. It uses
  `asPrismaDelegateView(prisma()).financialAccount` to narrow
  the Prisma client to the `financialAccount` delegate
  (`src/shared/db/prisma-types.ts`).
- The adapter translates `Prisma.PrismaClientKnownRequestError`
  with `code: 'P2002'` to `AppError(NAME_TAKEN)`. **Model
  `TransactionRepositoryPrisma` on this** (same
  `P2002 → NAME_TAKEN` translation if a unique constraint
  applies).

### 3.6. Test helpers and fixtures

- `src/modules/accounts/domain/services/account.service.test.ts`
  uses an in-memory `InMemoryAccountRepository` (read first).
  **Build an `InMemoryTransactionRepository` fixture** for
  service-level tests.
- `src/modules/fx/spec-scenarios.test.ts` shows how the `fx`
  module ships "spec scenarios" as a top-level integration test
  that exercises the full provider graph (cache + lock +
  DolarAPI). **The `transactions` capability should ship a
  similar `spec-scenarios.test.ts`** that walks the most
  important CRUD + multi-moneda paths end-to-end.
- `src/modules/auth/__tests__/security/` (6 files) is the
  template for security tests (timing, origin-check, secrets in
  logs, etc.). `transactions` does NOT need a security suite in
  v1 — single-user app, no credential material in transactions.

### 3.7. Zod env schema

- `src/shared/env/env.schema.ts:25-106` is the single source of
  truth for env vars. `transactions` adds new entries here (e.g.
  `ATTACHMENTS_DIR`, `MAX_ATTACHMENT_BYTES`) rather than reading
  `process.env` directly anywhere else.

### 3.8. Event dispatcher

- `src/shared/events/event-dispatcher.ts:33-65` is the
  in-process pub/sub. The current event union is
  `{ UserRegistered, UserSignedIn }` (lines 4-6).
  **`TransactionRecorded` is added by editing this union** so
  consumers (e.g. `reports`, `snapshots`) can subscribe.

### 3.9. The fx conversion call site

- The exact call site for a conversion is
  `src/modules/accounts/application/actions/get-account-balance.action.ts:67-100`:
  - Load the account row first (`getById`).
  - Resolve the casa via `account.casa ?? deps.defaultCasa ?? 'oficial'`.
  - Normalize UPPERCASE → lowercase via the `CASA_TO_LOWERCASE` map (lines 58-65).
  - Call `accountService.getBalance(userId, id, displayCurrency, resolvedCasa)`.
  - **The `transactions` capability reuses this exact pattern**
    for any "display amount in account casa" surface.

## 4. Gaps and unknowns

What's missing in the codebase to support v1 of `transactions`.
Every entry is grounded in a code search; nothing is invented.

### 4.1. No `Transaction` model (Prisma)

- `prisma/schema.prisma` (219 lines, full file) defines `User`,
  `Account`, `Session`, `VerificationToken`, `FinancialAccount`,
  and 6 enums. **No `Transaction` model exists.** Slice 1 ships
  the model + migration.
- No `TransactionCategory` table, no `Attachment` table, no
  `RecurrenceRule` table. **All four tables are missing.**

### 4.2. No `attachments` storage

- No `Attachment` model; no `gastos-personales:attachments:*`
  cache key; no `ATTACHMENTS_DIR` env var in
  `src/shared/env/env.schema.ts:25-106` or in `.env.example`.
- No `AttachmentStorage` port, no LocalDisk or S3 adapter.
- The infrastructure is additive: Slice 2 of `transactions`
  ships the port, the local-disk adapter, the migration, and the
  env var.

### 4.3. No recurrence engine / scheduler

- No `RecurrenceRule` model, no Cron worker, no
  `node-cron` / `bullmq` dependency in `package.json` (a grep
  over the package.json is needed to confirm — flagged below).
- `fx-cache` already defers Cron warmup (its spec at line 102-106).
  `transactions` recurrence is similarly deferred to Slice 3
  with no worker in v1.

### 4.4. No category table or seed data

- No `TransactionCategory` table. No seed file under
  `prisma/seed.ts` or `prisma/seed/`.
- The `account-create.schema.ts` pattern at
  `src/modules/accounts/application/validation/account-create.schema.ts:65-129`
  shows a discriminated union for per-type fields. The same
  pattern is used for `Transaction` if `category` becomes a
  free-form string (DG-TX-4) or a typed enum.

### 4.5. No idempotency-key primitive

- No `IdempotencyKey` model, no `idempotency_keys` table, no
  middleware that reads `Idempotency-Key` request header.
- A Prisma `@@unique` on a client-supplied key is the cheapest
  path; DG-TX-9 surfaces this as a decision.

### 4.6. No Zod base schemas (currency, money, datetime)

- Currency is validated per-call against the inline
  `accountCurrencySchema` at
  `src/modules/accounts/application/validation/account-create.schema.ts:32-36`.
  There is **no shared `currencySchema` in
  `src/shared/`** for reuse across modules.
- Money (minor units, signed/unsigned) is similarly inline.
  `transactions` ships a `moneySchema` if the per-type rules
  diverge from `accounts` (e.g. negative amounts for income).
- Datetime: the only example is
  `date: z.coerce.date()` in the `HISTORICAL` branch of
  `accountCreateSchema` (line 47). No shared `transactionDateSchema`.

### 4.7. No event for `TransactionRecorded`

- `src/shared/events/event-dispatcher.ts:4-6` declares the union
  `{ UserRegistered, UserSignedIn }`. Adding
  `TransactionRecorded` is a one-line edit, but it does mean
  `transactions` owns the cross-module contract surface for any
  downstream consumer (`reports`, `snapshots`).

### 4.8. No rate-limit policy for `transactions` endpoints

- `src/shared/rate-limit/rate-limit.ts:50-58` shows the
  Upstash sliding window (5 attempts / 60 s by default).
  `transactions` may NOT need a rate limit (manual CRUD is
  not burst-prone), but a bulk-import endpoint (out of v1)
  would.

### 4.9. No "balance roll-up" surface

- `get-account-balance.action.ts` returns ONE account's native +
  display balance. There is no
  `get-portfolio-balance.action.ts` (sum across accounts in
  display currency). This is `snapshots` or `reports` territory
  and is OUT of v1 scope.

### 4.10. No "soft delete + audit columns" precedent for `transactions`

- `FinancialAccount` uses `archivedAt: DateTime?` (soft archive,
  no separate audit log). `User` uses `createdAt` / `updatedAt`
  via `@default(now())` / `@updatedAt`.
- For `Transaction`, the audit-trail decision (DG-TX-1) is
  open: do we add `createdBy`, `updatedBy`, `deletedAt`, or
  follow the `archivedAt` pattern? `accounts` does NOT have
  `createdBy`/`updatedBy` (Prisma schema at line 211-212 only
  has timestamps).

### 4.11. No `IdempotencyKey` enforcement at the action layer

- `create-account.action.ts` calls `repo.create(userId, input)`
  with no idempotency hook. A retry from the client creates a
  duplicate. The same risk applies to `transactions`. DG-TX-9
  surfaces it.

### 4.12. No "transfer between accounts" rule

- The `accounts` module is a single-account model (one row per
  account, no `parentAccountId` or `transfers` table). A
  `Transaction` that moves money between two accounts is a NEW
  pattern. DG-TX-2 surfaces this as a decision.

### 4.13. No UI smoke slice for `transactions`

- `app/accounts/{page.tsx,new/page.tsx,[id]/page.tsx}` exist.
  No `app/transactions/*` pages. Slice 1 may or may not ship a
  smoke UI; `accounts-ledger` v3 chose to ship one because the
  API was the hardest thing to validate. `transactions` is the
  same shape — manual CRUD — and likely benefits from a smoke
  slice.

### 4.14. No CI hook for `Documents-es/` drift

- The Husky `pre-commit` at `.husky/pre-commit` runs `gga run`
  - `lint-staged` + a `pnpm-lock.yaml` drift check
    (`scripts/check-lockfile.sh`). **There is no automated check
    that the English Markdown + `Documents-es/` mirror stay in
    sync.** Drift is detected by `reviewer` or manually per the
    §13.3 policy in the root `AGENTS.md`. Flagged as a risk for
    any doc-heavy change.

## 5. Adjacent risks

Fragility or known gotchas in the area the change will touch.

### 5.1. Strict TDD is ON (`openspec/config.yaml:27-30`)

- `strictTdd.enabled: true` and the runner is `pnpm test`.
- `transactions` follows the RED → GREEN → REFACTOR cycle per
  task in `tasks.md`. **Skipping the RED step fails the
  reviewer.** This is binding per the global contract; the
  orchestrator will enforce it.

### 5.2. Encrypted Prisma adapter (`OAUTH_TOKEN_ENCRYPTION_KEY`)

- `prisma/schema.prisma:50-58` documents that OAuth tokens are
  AES-256-GCM encrypted via
  `src/modules/auth/infrastructure/adapters/encrypted-prisma-adapter.ts`.
- **Only `Account` rows are encrypted** — `refresh_token`,
  `access_token`, `id_token`. `Transaction` rows are NOT
  encrypted. There is no precedent for encrypting money-related
  rows; if a future "bank-import" change ships, the encryption
  surface for transactions must be designed (e.g. memo field,
  PII strings) — out of v1 scope.

### 5.3. GGA pre-commit gate

- `.husky/pre-commit` runs `pnpm dlx lint-staged && gga run`
  plus `scripts/check-lockfile.sh` for the
  `pnpm-lock.yaml` policy (root `AGENTS.md` §5.3).
- If `package.json` is staged and `pnpm-lock.yaml` is not, the
  commit fails. The orchestrator owns the build/test loop per
  the prompt; the worker who applies the change must run
  `pnpm install` after any `package.json` edit and stage the
  lockfile in the same commit.

### 5.4. Sentry logging shape

- `src/shared/logger/logger.ts` captures structured events. The
  `fx` module emits `fx.cache.hit`, `fx.cache.miss`,
  `fx.stale.refresh` (see `fx-rate-provider.dolar-api.ts:66-128`).
- `transactions` follows the same convention: `transactions.create`,
  `transactions.update`, `transactions.delete`,
  `transactions.fx.convert`. The logger strips PII per
  `BR-AUTH-11` (passwords, tokens). Transaction rows do not
  carry PII in v1 — `memo` is a free-form string; if it ever
  holds PII the strip list must extend.

### 5.5. Multi-tenancy (single-user)

- `gastos-personales` is single-user per `architecture-standards`
  skill. Every endpoint scopes to `userId` (no row-level
  security in MVP per `auth/spec.md:644-647`).
- `transactions` follows the same pattern. No new risk.

### 5.6. The Hono catch-all runtime constraint

- `app/api/[...path]/route.ts:18-25` is forced to
  `runtime = 'nodejs'` because `@node-rs/argon2` cannot load
  in Edge. `transactions` adds routes INSIDE the protected
  sub-app — no new route file, no runtime conflict.

### 5.7. `proxy.ts` matcher

- `proxy.ts:75` excludes `api/*` from the matcher. The proxy
  only redirects App Router PAGES (e.g. `/transactions`,
  `/transactions/[id]`). New transaction pages MUST NOT be
  added to `PUBLIC_PATHS` (line 24-32); the 307 redirect to
  `/auth/signin` is the auth gate.

### 5.8. The 7-export invariant on `auth/index.ts`

- `src/modules/auth/index.ts:18-20` exports 7 symbols. The
  compile-time check is asserted by `src/modules/auth/index.test.ts`.
- `transactions/index.ts` SHOULD follow the same minimal-barrel
  convention: domain ports + value objects + `TransactionService`
  - enum constants; nothing from infrastructure.

### 5.9. Module isolation

- Root `AGENTS.md` §10.5 declares "A module does NOT import
  directly from another module." Cross-module references go
  through `src/shared/events/` or the public barrel.
- `transactions` MUST NOT import from `fx` directly. It imports
  `FxRateProvider` from `@/modules/accounts` (the port lives
  there). It imports `fxCasaStringSchema` from `@/modules/fx`
  only if the FX normalization happens at the transaction
  boundary — otherwise the value-object lives in `accounts` and
  is mirrored per the existing `FX_CASAS` tuple in
  `fx-rate-provider.port.ts:52`.

### 5.10. The §13.3 dual-language atomicity rule

- Root `AGENTS.md` §13.3 (and the project-level
  `openspec/AGENTS.md:13.1`): every English Markdown created or
  edited ships the Spanish mirror in the SAME commit.
- The `reviewer` checks for Chinese-character debris per the
  root AGENTS.md mirror rule. `transactions` follows the same.

### 5.11. The author header rule

- `openspec/AGENTS.md:42-67` enforces `**Author**: Sebastián
Illa` only. Forbidden: `AI`, `Claude`, `GPT`, "with AI help",
  `Co-authored-by: …` in commits. Every Markdown artifact in
  this change carries that header.

## 6. Open decisions (DG-TX-N)

The orchestrator will close these with the user before
`sdd-propose`. The list combines the suggestions from the
launch prompt with what the codebase surfaced.

### DG-TX-1 — `Transaction` aggregate shape

- **Fields.** Minimum: `id`, `userId`, `accountId`,
  `direction` (INCOME / EXPENSE / TRANSFER), `amountMinor`
  (Int, signed; positive for income, negative for expense),
  `currency` (`AccountCurrency`), `categoryId | category`,
  `memo`, `transactionDate`, `createdAt`, `updatedAt`. Optional:
  `attachments[]`, `recurrenceId | null`.
- **Soft vs hard delete.** `accounts` uses `archivedAt`
  (soft). `transactions` MAY follow the same pattern, OR use
  hard delete with no recovery. Audit columns: `createdBy` /
  `updatedBy` are NOT in the `accounts` schema — `transactions`
  has the option to introduce them.
- **The decision**: which fields are required, which are
  nullable, and whether deletion is soft or hard.

### DG-TX-2 — Relationship to `FinancialAccount`

- **Single FK** to one `FinancialAccount.id` (most CRUD
  endpoints).
- **Transfer** = a special case where ONE logical
  transaction affects TWO accounts (debit + credit). Possible
  shapes:
  - (a) Two `Transaction` rows linked by `transferGroupId`
    (parent-child join).
  - (b) A first-class `Transfer` entity with `fromAccountId`
    and `toAccountId` (separate aggregate).
  - (c) Defer transfers to v1.1; v1 is single-account only.
- **The decision**: how a transfer between two accounts is
  represented in v1, or whether v1 is single-account only.

### DG-TX-3 — Multi-currency semantics

Three options the codebase already foreshadows:

- **(a) Store original only; recompute on read.** The native
  row holds `{ amountMinor, currency }`. Display conversion
  calls `FxRateProvider` at every read. Pros: single source
  of truth, no stale-rate problem in storage. Cons: balance
  totals depend on the rate at read time.
- **(b) Snapshot at write time.** Every `Transaction` carries
  `{ amountMinor, currency, fxRateSnapshot, fxAsOfSnapshot,
casaSnapshot }` when written in a non-account-casa currency.
  Pros: deterministic historical balances. Cons: large in
  high-inflation periods; the `fx-cache` spec line 96-98
  explicitly contemplates this as a future option.
- **(c) Both.** Store the original AND the converted-on-read
  amount (cached in the row for 1 h). Pros: read latency.
  Cons: storage cost; reconciliation complexity.

The `fx-cache` spec at line 96-98 hints that **(b) is the
chosen v1 path** ("a future `transactions` capability MAY
store the FX rate used at write time on each transaction
row"). **The decision**: confirm (b) for v1, or pick (a)/(c).

### DG-TX-4 — Category model

- (a) First-class `TransactionCategory` table with a `userId`
  FK and a `name`. Seed with a small default list (Food,
  Transport, Salary, etc.) on first registration.
- (b) Free-form string (`category: string` column on
  `Transaction`). Lower friction; harder to filter.
- (c) Enum (`TransactionCategory` Prisma enum with fixed
  values). Rigid; user cannot customize.
- **The decision**: which model, and whether seed data
  auto-populates on user registration.

### DG-TX-5 — Attachments storage backend (deferred to Slice 2)

The launch prompt recommends **local-disk only with an
adapter interface** for v1, swappable to Upstash / S3 / R2
later. **The decision**: confirm the adapter interface
(`AttachmentStorage` port with `put / get / delete / signUrl`
methods) and the local-disk implementation for dev / CI.

### DG-TX-6 — Recurrence model (deferred to Slice 3)

- (a) Domain-level: "monthly on the 15th", "weekly on
  Tuesdays", etc. Engine resolves "next run" deterministically.
- (b) iCal RRULE string. Pros: standard. Cons: parser
  dependency.
- (c) Cron expression. Pros: powerful. Cons: opaque to
  non-engineers.
- (d) Generated instances are NEW rows with
  `recurrenceTemplateId: string | null` FK.
- **The decision**: which representation, and how generated
  instances relate to the template (FK + idempotency key).

### DG-TX-7 — Where recurrence runs

- (a) On-demand generation on dashboard load. v1 cutoff.
- (b) Next.js scheduled function (`vercel.json` cron).
- (c) External worker (BullMQ, separate service).
- **The decision**: (a) for v1; (b)/(c) are out of scope.

### DG-TX-8 — Authoritative rounding

- The `fx-rate-provider.dolar-api.ts:158` line uses
  `(amount / 100) * fxRate` — no explicit rounding. The DTO
  sends `amount: number` to the wire.
- For amounts in minor units (cents) the convention is
  half-up to 2 decimals. **The decision**: confirm half-up
  at 2 decimals for display; flag if a different convention
  already exists in any upcoming `reports` change.

### DG-TX-9 — Idempotency for create

- (a) Client-supplied `idempotencyKey` (header or body field).
  Prisma `@@unique` on `(userId, idempotencyKey)`. A retry
  returns the original row.
- (b) Server-side atomic Prisma call with a transaction
  wrapper. A retry MAY create a duplicate on partial failure.
- (c) No idempotency; clients retry on `5xx` and accept
  potential duplicates. UI surfaces a "did this work?" hint.
- **The decision**: which layer enforces uniqueness and how
  the client surfaces it.

### DG-TX-10 — Permissions

- The app is single-user per `auth/spec.md:644-647`. Every
  row scopes to `userId`; no row-level security.
- (a) No "shared account" / read-only viewer in v1.
- (b) A future v1.1 could add a `viewer` permission (read-only
  link to a specific account).
- **The decision**: confirm v1 is single-user only.

### DG-TX-11 — Memo / description field

- `accounts` has no equivalent. `Transaction.memo` is a
  free-form string.
- (a) Free-form, no validation, max 500 chars.
- (b) Required + min 1 char (enforces journaling hygiene).
- (c) Optional with a search-friendly normalized form.
- **The decision**: required vs optional, max length, PII
  guidance (a memo could contain a person's name — flagged
  for the logger strip list).

### DG-TX-12 — `Transaction` direction enum

- INCOME / EXPENSE / TRANSFER. TRANSFER is the cross-account
  case from DG-TX-2.
- **The decision**: confirm the enum and the
  `sign(amountMinor)` rule (positive = income, negative =
  expense; or unsigned with `direction` field).

### DG-TX-13 — Validation: future-dated transactions

- (a) Allow any `transactionDate` (past or future — for
  scheduled payments).
- (b) Reject future dates with `400 VALIDATION_ERROR`.
- (c) Allow future dates ONLY when `recurrenceTemplateId` is
  non-null (scheduled but not yet posted).
- **The decision**: which rule.

### DG-TX-14 — Pagination of the transaction list

- `list-accounts.action.ts` uses cursor pagination
  (`?cursor=...&limit=...`). **The decision**: same shape for
  `/api/transactions`?

### DG-TX-15 — Soft delete policy for `Transaction`

- `accounts` soft-archives with `archivedAt: DateTime?`.
  The list filters `archivedAt: null`.
- (a) Mirror `accounts` — soft delete with `archivedAt`.
- (b) Hard delete (no recovery; the row is gone).
- **The decision**: which policy.

## 7. Risks and non-goals

What we are explicitly NOT building in v1. The boundary
between v1, v1.1, and v2.

### 7.1. v1 non-goals (DO NOT build)

- **Bank import / CSV upload.** Out of v1. A bulk import
  endpoint is a v1.1 candidate (rate-limited, idempotency-key
  required).
- **OCR on receipts.** Out of v1.
- **Push notifications** (e.g. "you exceeded your Food
  budget this month"). Out of v1.
- **Multi-user / shared accounts.** Out of v1.
- **Mobile app.** Out of v1.
- **Background workers / BullMQ.** Out of v1. Recurrence is
  on-demand generation (DG-TX-7).
- **Mobile receipt scanning.** Out of v1.
- **Historical FX archive for back-dated transactions.** Out
  of v1. The DolarAPI snapshot at write time (DG-TX-3 option
  b) does NOT include a back-dated rate lookup; the rate is
  the rate at the moment of write.
- **AI-categorization of transactions.** Out of v1.
- **Budget rules / spending limits.** Out of v1 (this is
  `reports` territory).

### 7.2. v1.1 candidates

- Recurrence generation via cron / scheduled function.
- Transfer between accounts (DG-TX-2 (a)/(b) shape).
- Bank CSV import.
- Read-only shared-account viewer.

### 7.3. v2 candidates

- Bank OAuth integration (Plaid-style).
- Mobile app.
- AI categorization.

### 7.4. Risks

| Risk                                                                                                            | Likelihood | Mitigation                                                                                                        |
| --------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `transactions` table grows unbounded; pagination + index strategy must be in v1                                 | Medium     | Cursor pagination + `@@index([userId, transactionDate])`. Mirrors `accounts` `@@index([userId, createdAt])`.      |
| FX snapshot at write time drifts from current rate (option b in DG-TX-3)                                        | Low        | Carry `fxAsOfSnapshot` on the row so the UI surfaces "rate as of <date>".                                         |
| Attachment storage backend swap breaks the contract                                                             | Low        | Adapter interface (`AttachmentStorage` port) + tests that swap the adapter; production starts on local-disk only. |
| Recurrence model in DG-TX-6 (a)/(b)/(c) creates a migration headache if the chosen representation changes later | Medium     | Defer recurrence to Slice 3; the model choice has time to settle.                                                 |
| Idempotency key collisions across users                                                                         | Low        | Unique constraint on `(userId, idempotencyKey)` — namespace by user.                                              |
| PII in `memo` field leaks to logs                                                                               | Low        | Add `memo` to the logger denylist; the `BR-AUTH-11` secret-stripping rule is the contract surface.                |
| The Spanish mirror drifts from the English original                                                             | Medium     | Apply §13.3 atomicity; the `reviewer` checks both files in the same commit.                                       |
| Strict TDD's RED step is skipped, failing the reviewer                                                          | Medium     | The `sdd-tasks` phase owns task structure; `sdd-apply` enforces RED → GREEN → REFACTOR per task.                  |

## 8. Recommended slice plan

**Advisory; `sdd-tasks` will finalize.** Each slice targets
≤ 400 lines per PR per the global budget (root
`AGENTS.md` §10.5).

### Slice 1 — `transactions-core`

**Goal:** `Transaction` aggregate + CRUD + multi-moneda via `fx`.

- New Prisma model `Transaction` with `userId`, `accountId`,
  `direction`, `amountMinor`, `currency`, `transactionDate`,
  `memo`, `createdAt`, `updatedAt`. Migration is
  non-destructive. Indexes `@@index([userId, transactionDate])`
  and `@@index([accountId, transactionDate])`.
- New `src/modules/transactions/` module:
  `domain/entities/transaction.ts`,
  `domain/interfaces/transaction.repository.port.ts`,
  `domain/services/transaction.service.ts`,
  `application/actions/{list,get,create,update,delete}-transaction.action.ts`,
  `application/dto/transaction.dto.ts`,
  `application/validation/transaction-create.schema.ts`,
  `infrastructure/repositories/transaction.repository.prisma.ts`.
- 7 Hono routes under `/api/transactions`:
  `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`,
  `GET /:id/balance?displayCurrency=...` (uses `FxRateProvider`),
  `GET /account/:accountId` (filtered list).
- DI wiring in `src/modules/api/app.ts:317` (`buildDefaultDeps`).
- Smoke UI: `app/transactions/page.tsx`,
  `app/transactions/new/page.tsx`,
  `app/transactions/[id]/page.tsx` — smoke-minimal per
  `accounts` pattern.
- **Estimated ~600 lines** (largest slice; expect auto-chain
  per the 400-line rule). Split into PR-1A (entity + repo +
  service + tests), PR-1B (Hono routes + DI + smoke UI).

### Slice 2 — `transactions-attachments`

- New `Attachment` Prisma model with `transactionId` FK,
  `filename`, `mimeType`, `sizeBytes`, `storageKey`, `createdAt`.
- `AttachmentStorage` port + `LocalDiskAttachmentStorage`
  adapter. Env var `ATTACHMENTS_DIR` in
  `src/shared/env/env.schema.ts`.
- New Hono routes under `/api/transactions/:id/attachments`:
  `GET` (list), `POST` (upload — multipart/form-data), `DELETE`.
- New Zod schema `attachment-create.schema.ts` with
  `mimeType` whitelist (image/png, image/jpeg, application/pdf)
  - max `sizeBytes`.
- **Estimated ~350 lines**.

### Slice 3 — `transactions-recurrence`

- New `RecurrenceRule` Prisma model with `transactionId` FK,
  `frequency` (DAILY / WEEKLY / MONTHLY), `interval`, `byDay`,
  `byMonthDay`, `endsAt`.
- On-demand generation: a server action
  `generate-due-transactions.action.ts` walks rules and creates
  instances for any missed periods. Called on dashboard load.
- Idempotency: `recurrenceKey` on each generated row
  (`{templateId, dueDate}`).
- **Estimated ~400 lines**.

### Slice 4 — `transactions-ui` (optional, after Slice 1 lands)

- Production-quality UI replacing the smoke pages.
- Filters, charts, export-to-CSV.
- **Out of v1** unless the user explicitly asks.

### Ordering rationale

- Slice 1 first: locked by the user. The locked scope says
  "Slice 1 = entity + CRUD + multi-moneda FIRST; attachments
  and recurrence come AFTER Slice 1 lands." The
  `fx-rate-provider.port.ts` is already in `accounts`; no
  port change is needed for Slice 1.
- Slice 2 before Slice 3: attachments are an additive schema
  change (no generated rows, no scheduler). Recurrence touches
  the write path (instance generation). Slipping attachments
  in first keeps each slice's diff small.
- Slice 3 last: recurrence is the most complex slice
  (generated rows, idempotency, on-demand engine). Deferring
  it buys time to settle the model (DG-TX-6).

## 9. Open questions for the user

These are NOT covered by the DG-TX list above. The orchestrator
surfaces them in the pre-propose grill. **At most 4 questions,
in order.**

1. **Should v1 ship a smoke UI for `transactions`?** The
   `accounts-ledger` v3 chose to ship one because manual CRUD
   is the hardest thing to validate end-to-end without curl.
   `transactions` is the same shape. Confirm yes (smoke UI in
   Slice 1) or no (API-only; smoke UI deferred to a separate
   `transactions-ui` change).

2. **What is the multi-currency semantics on a `Transaction` row**
   (DG-TX-3)? The three options are mutually exclusive:
   store-original-only / snapshot-at-write / both. The
   `fx-cache` spec hints at snapshot-at-write, but it is not
   binding.

3. **Is `transfer` between two accounts in v1, or v1.1?**
   (DG-TX-2). v1 single-account only is the cheapest path.
   Adding `transfer` in v1 means a `Transfer` aggregate OR a
   `transferGroupId` link + first-class two-row write
   semantics.

4. **Should `memo` carry a min length / required rule, and
   is PII guidance needed?** (DG-TX-11). A free-form memo
   without rules is the lowest friction but loses search
   precision; a required + min-length rule is the highest
   hygiene.

---

## 10. Cross-references

- **`openspec/specs/accounts/spec.md`** — BR-ACC-12 (display
  FX contract), BR-ACC-16 (form behavior), BR-ACC-18 (balance
  widget). All cross-module invariants for the new change.
- **`openspec/specs/fx/spec.md`** — REQ-FX-3 (casa resolution
  is the caller's responsibility), REQ-FX-9 (casa column
  migration is non-destructive). Both apply unchanged to
  `transactions`.
- **`openspec/specs/auth/spec.md`** — BR-AUTH-1 (email is the
  canonical identifier), the `auth()` server-side helper
  invariant, the 7-export public surface.
- **`src/modules/accounts/application/actions/get-account-balance.action.ts:67-100`** —
  the canonical conversion call site to mirror.
- **`src/shared/env/env.schema.ts:25-106`** — the env schema to
  extend.
- **`src/shared/errors/error-codes.ts:12-43`** — the error code
  enum to extend.
- **`src/shared/events/event-dispatcher.ts:4-6`** — the event
  union to extend (for `TransactionRecorded`).
- **`openspec/AGENTS.md:42-67`** — the author attribution rule.
- **Root `AGENTS.md` §13** — the dual-language docs mirror
  policy. Every English Markdown in this change ships the
  Spanish mirror in the same commit.
