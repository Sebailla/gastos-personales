# Design — `accounts-ledger`

**Status**: draft · **Author**: Sebastián Illa
**Created**: 2026-06-18 · **Change**: `accounts-ledger`
**Spec**: `openspec/changes/accounts-ledger/specs/accounts/spec.md` (full spec, new capability)
**Proposal**: `openspec/changes/accounts-ledger/proposal.md` (v3)
**Capabilities affected**: `accounts` (new; canonical spec lands at `openspec/specs/accounts/spec.md` on sync)
**Stack**: v2 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4 (in scope per DG-V3-1 resolved 2026-06-18)
**Preflight**: interactive · `both` (OpenSpec + Engram) · `auto-forecast` · 400-line review budget
**Strict TDD**: enabled per `openspec/config.yaml`; runner `pnpm test`; cycle RED → GREEN → TRIANGULATE → REFACTOR

> This document does NOT re-debate the spec. It implements the
> spec's "what" with the "how" — file paths, ports, middleware
> chain, dependency wiring, Tailwind v4 setup, strict-TDD test
> layout, the file-to-requirement traceability matrix, the 4
> design decisions the spec left open, and the per-PR rollout
> forecast. A new contributor can read this and understand
> exactly where every spec Requirement lands in the repo.

---

## 1. Summary

`accounts-ledger` is the second capability to ship after `auth-foundation` (which landed across Slices A/B/C; canonical at `openspec/specs/auth/spec.md`). It owns the `accounts` capability: a typed `FinancialAccount` ledger (6-type discriminated union) with a per-type Zod-validated create flow, a soft-archive lifecycle, and a read-only display-only FX conversion surface for downstream capabilities (`transactions`, `fx-cache`, `snapshots`, `reports`). The change ships in two layers: the **API layer** (Prisma model + 7 Hono endpoints mounted on the existing catch-all) and the **smoke UI slice** (3 Next.js App Router pages under `app/accounts/*` with a typed Hono client and a `Tailwind v4` setup). The `FxRateProvider` is a port declared in this change; the implementation lands in the future `fx-cache` change. In this change, the FX endpoint returns `503 FX_UNAVAILABLE` until `fx-cache` ships; the smoke UI surfaces this verbatim. Cross-module invariants come from `auth` (every `FinancialAccount.userId === session.user.id`, resolved through `auth()` from `src/modules/auth/index.ts`); the design never redefines session reading.

---

## 2. Module structure (`src/modules/accounts/`)

The `accounts` module follows the architecture-standards layout (domain / application / infrastructure / interfaces) and is colocated with the existing `auth` module under `src/modules/`. The Hono routes are NOT in `src/modules/accounts/interfaces/` because the existing project convention (see `src/modules/api/app.ts`) keeps the `OpenAPIHono` instance in a dedicated `src/modules/api/` module that aggregates every capability's actions. New routes are added to `src/modules/api/app.ts` (the Hono sub-app) and registered in `buildDefaultDeps()`.

```
src/modules/accounts/
├── domain/
│   ├── entities/
│   │   ├── financial-account.ts            # AccountType, AccountKind, InvestmentType,
│   │   │                                  # OpeningBalanceMode, AccountCurrency enums +
│   │   │                                  # FinancialAccount entity shape (no Prisma import)
│   │   ├── financial-account.test.ts       # unit tests: enums exhaustiveness, type
│   │   │                                  # discrimination, type-guard
│   │   └── index.ts                        # barrel: export { FinancialAccount, ...enums }
│   ├── value-objects/
│   │   ├── opening-balance.ts              # discriminated union FRESH | HISTORICAL with
│   │   │                                  # static factories `fresh()` and `historical(date, amount)`
│   │   │                                  # and validators (amount >= 0, date <= now)
│   │   └── opening-balance.test.ts         # unit tests: factory invariants, validation rules
│   ├── services/
│   │   ├── account.service.ts              # business logic: create, list, getById, update,
│   │   │                                  # archive, unarchive, getBalance. Pure; depends on
│   │   │                                  # the two ports (repository + FX provider).
│   │   └── account.service.test.ts         # unit tests with fake repo + fake FX provider
│   └── interfaces/
│       ├── account.repository.port.ts      # port: list / findById / create / update /
│       │                                  # archive / unarchive scoped to a userId
│       └── fx-rate-provider.port.ts        # port: getDisplayAmount(native, target) returns
│                                          # the { native, display, warnings? } shape
├── application/
│   ├── actions/
│   │   ├── list-accounts.action.ts         # reads userId from session, calls AccountService.list
│   │   ├── get-account.action.ts           # reads :id from path, enforces ownership via repo
│   │   ├── create-account.action.ts        # parses body through per-type Zod schema, dispatches
│   │   │                                  # AccountCreated event (deferred listener)
│   │   ├── update-account.action.ts        # partial update, per-type Zod (subset of create)
│   │   ├── archive-account.action.ts       # sets archivedAt = now()
│   │   ├── unarchive-account.action.ts     # sets archivedAt = null
│   │   └── get-account-balance.action.ts   # calls AccountService.getBalance → uses FX port
│   ├── validation/
│   │   ├── account-create.schema.ts        # Zod discriminated union on `type`; FRESH default;
│   │   │                                  # openingBalanceMinor >= 0; per-type fields
│   │   ├── account-update.schema.ts        # Zod partial of create
│   │   ├── list-accounts.schema.ts         # Zod for ?cursor, ?limit (1..100), ?archivedAt
│   │   └── account-balance.schema.ts       # Zod for ?displayCurrency
│   └── dto/
│       ├── financial-account.dto.ts        # response shape per type
│       └── financial-account-balance.dto.ts
├── infrastructure/
│   ├── repositories/
│   │   ├── account.repository.prisma.ts    # implements AccountRepositoryPort via prisma()
│   │   └── account.repository.prisma.test.ts  # integration tests (testcontainers in CI;
│   │                                         # fake-Prisma in local dev)
│   └── external/
│       ├── fx-rate-provider.unconfigured.ts # in-change stub: returns 503 FX_UNAVAILABLE
│       │                                  # when no real provider is registered. This is the
│       │                                  # default in buildDefaultDeps() until fx-cache lands.
│       └── fx-rate-provider.stub.ts        # test fake: configurable per-test (success / 503 / 409)
└── index.ts                                # public surface; exports AccountService, types,
                                           # and the FX port. Other modules import from here.

# Co-located test fakes used by application tests:
src/modules/accounts/application/__fakes__/
├── fake-account.repository.ts              # in-memory repo with the same surface as the port
└── fake-fx-rate-provider.ts                # configurable: success / 503 / 409
```

| File                                                       | Purpose                                                                                                                                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `domain/entities/financial-account.ts`                     | Pure-TS entity + 5 enums. The naming `FinancialAccount` disambiguates from the Auth.js `Account` (OAuth link) at `src/modules/auth/domain/entities/account.ts`.                                                                 |
| `domain/value-objects/opening-balance.ts`                  | Discriminated union with two static factories and a `validate()` method. The opening-balance semantics is a value object, not a primitive.                                                                                      |
| `domain/services/account.service.ts`                       | Business rules: which fields are required per type, the unique-name rule, the soft-archive lifecycle, the FX conversion. Pure (no I/O).                                                                                         |
| `domain/interfaces/account.repository.port.ts`             | Repository port scoped to `userId`. The implementation in `infrastructure/` enforces the cross-module invariant `FinancialAccount.userId === session.user.id` at the query layer (no cross-user rows returned even by mistake). |
| `domain/interfaces/fx-rate-provider.port.ts`               | FX port. The `fx-cache` change provides the real implementation.                                                                                                                                                                |
| `application/actions/*.action.ts`                          | The Hono route handlers call these. Each action takes `(deps, input)` and returns a `{ status, data?                                                                                                                            | error? }`discriminated union (the project convention from`auth-foundation-slice-c`). |
| `application/validation/*.schema.ts`                       | Zod schemas. The create schema is a discriminated union on `type`; the per-type refinement enforces the type-specific field set (rejects `walletAddress` on `BANK`, etc.).                                                      |
| `infrastructure/repositories/account.repository.prisma.ts` | The Prisma adapter. The `findById` and `list` queries ALWAYS carry `userId` in the WHERE clause; there is no API surface that lets the caller pass `userId` to the repo.                                                        |
| `infrastructure/external/fx-rate-provider.unconfigured.ts` | The in-change FX stub. Returns `AppError(FX_UNAVAILABLE, ...)` from the port's `getDisplayAmount` method.                                                                                                                       |

**Architectural dependency direction (per architecture-standards)**:

```
UI (app/accounts/*) → Application (actions + validation) → Domain (services, ports)
                                                              ↑
                                       Infrastructure (repositories, FX stub) — implements
```

- Domain imports nothing from `application/`, `infrastructure/`, or `ui/`.
- Application imports only from `domain/`.
- Infrastructure imports from `domain/` (to implement ports) and from `@/shared/db/prisma` (the project's Prisma client singleton).
- UI imports from `application/` (actions) via the Hono catch-all; it does not import from `domain/` directly.

---

## 3. Prisma schema (additive on `prisma/schema.prisma`)

The change adds 5 enums + 1 model + 3 indexes. No destructive schema changes. The migration is generated once in PR-A via `pnpm prisma migrate dev --name add_financial_account`; PRs B and C do NOT add migrations.

```prisma
// prisma/schema.prisma (additive block, append after the auth-foundation models)

// ============================================================================
// accounts capability — added by accounts-ledger (PR-A, task A-2)
// See: openspec/changes/accounts-ledger/specs/accounts/spec.md
// See: openspec/changes/accounts-ledger/design.md §3
//
// Cross-module invariant: FinancialAccount.userId references User.id
// (defined by auth-foundation in openspec/specs/auth/spec.md, BR-AUTH-1)
// with onDelete: Cascade. The application layer MUST NOT trust any
// userId from a request body; the session is the source of truth
// (openspec/changes/accounts-ledger/specs/accounts/spec.md,
// "All endpoints require an authenticated session").
// ============================================================================

enum AccountType {
  BANK
  CREDIT
  INVESTMENT
  CRYPTO
  CASH
  OTHER
}

enum AccountKind {
  SAVINGS
  CHECKING
}

enum InvestmentType {
  STOCKS
  BONDS
  MUTUAL_FUNDS
  CERTS_OF_DEPOSIT
  OTHER
}

enum OpeningBalanceMode {
  FRESH          // balance starts at zero on creation date
  HISTORICAL     // balance is back-dated to openingBalanceDate
}

enum AccountCurrency {
  ARS
  USD
  EUR
}

model FinancialAccount {
  id                   String              @id @default(cuid())
  userId               String              // FK to User.id (auth capability)
  type                 AccountType         // required; one of 6
  name                 String              // free-text, 1..80 chars; unique per (userId, type)
  currency             AccountCurrency     // one of { ARS, USD, EUR }
  openingBalanceMinor  Int                 // minor units (cents); >= 0 (BR-ACC-16, Decision 7)
  openingBalanceMode   OpeningBalanceMode  // FRESH | HISTORICAL; FRESH default in UI (Decision 5)
  openingBalanceDate   DateTime?           // required iff mode = HISTORICAL; null otherwise
  archivedAt           DateTime?           // soft-archive marker; null for live accounts
                                        // (BR-ACC-17: list query filters archivedAt: null)

  // Type-specific fields (only the relevant set is populated per type).
  // The Zod create schema (application/validation/account-create.schema.ts)
  // enforces that the wrong-type field set is rejected at the API.
  bankName             String?             // BANK only
  accountKind          AccountKind?        // BANK only
  issuer               String?             // CREDIT only
  creditLimitMinor     Int?                // CREDIT only (optional)
  statementDay         Int?                // CREDIT only (1..31)
  paymentDueDay        Int?                // CREDIT only (1..31)
  broker               String?             // INVESTMENT only
  investmentType       InvestmentType?     // INVESTMENT only
  walletAddress        String?             // CRYPTO only (optional)

  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt

  user                 User                @relation(fields: [userId], references: [id], onDelete: Cascade)

  // BR-ACC-17 (list): the live-first list query is WHERE userId = ? AND archivedAt IS NULL
  // ORDER BY createdAt DESC. The composite index (userId, archivedAt) keeps the
  // WHERE cheap; the secondary index (userId, createdAt) covers the ORDER BY.
  @@unique([userId, type, name])           // names are unique per user per type
  @@index([userId, archivedAt])            // list: live accounts first
  @@index([userId, createdAt])             // list: order by recency
}
```

**Migration notes**:

- The migration file is `prisma/migrations/<timestamp>_add_financial_account/migration.sql` (timestamp generated by `pnpm prisma migrate dev`).
- The `User` relation field is added in the auth-owned `User` model: `financialAccounts FinancialAccount[]`. The `prisma migrate dev` run edits `prisma/schema.prisma` to add the back-reference on `User`. This is the only auth-side schema change.
- The `@@unique([userId, type, name])` constraint maps to the spec scenario "name collision within (userId, type) is rejected → 409 NAME_TAKEN". The Prisma client surfaces this as a `P2002` unique-violation error; the `account.repository.prisma.ts` adapter translates it to `AppError(NAME_TAKEN, ...)`.

---

## 4. Hono routing

The 7 endpoints mount on the existing Hono catch-all at `app/api/[...path]/route.ts` (Slice B T-025). The catch-all delegates every `GET|POST|PATCH|DELETE` to `honoApp.fetch(request)`. The 7 new routes are added to `src/modules/api/app.ts` alongside the existing 3 (`/health`, `/me`, `/auth/register`). No new file under `app/api/`. Routing precedence is unaffected: Next.js file-based routing continues to match `app/api/auth/[...nextauth]/route.ts` before the catch-all, so Auth.js routes never reach Hono.

### 4.1 New routes (added to `createHonoApp` in `src/modules/api/app.ts`)

```typescript
// src/modules/api/app.ts — addition to createHonoApp(deps: HonoAppDeps)
// (the existing routes /health, /me, /auth/register are unchanged)

// 1. List accounts (BR: GET /api/accounts cursor-paginated, archivedAt=null)
app.get('/api/accounts', requireSession, async (c) => {
  const query = listAccountsSchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const res = await listAccountsAction(deps, c.get('user')!, query);
  return c.json(res.body, res.status as 200 | 401);
});

// 2. Create account (BR: POST /api/accounts, Zod per-type, 201 / 400 / 401 / 409)
app.post('/api/accounts', requireSession, async (c) => {
  const body = await c.req.json().catch(() => null);
  const res = await createAccountAction(deps, c.get('user')!, body);
  return c.json(res.body, res.status as 201 | 400 | 401 | 409);
});

// 3. Get one account (BR: GET /api/accounts/:id, 200 / 401 / 404)
app.get('/api/accounts/:id', requireSession, async (c) => {
  const id = c.req.param('id');
  const res = await getAccountAction(deps, c.get('user')!, id);
  return c.json(res.body, res.status as 200 | 401 | 404);
});

// 4. Partial update (BR: PATCH /api/accounts/:id, 200 / 400 / 401 / 404)
app.patch('/api/accounts/:id', requireSession, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const res = await updateAccountAction(deps, c.get('user')!, id, body);
  return c.json(res.body, res.status as 200 | 400 | 401 | 404);
});

// 5. Archive (BR: POST /api/accounts/:id/archive, 200 / 401 / 404)
app.post('/api/accounts/:id/archive', requireSession, async (c) => {
  const id = c.req.param('id');
  const res = await archiveAccountAction(deps, c.get('user')!, id);
  return c.json(res.body, res.status as 200 | 401 | 404);
});

// 6. Unarchive (BR: POST /api/accounts/:id/unarchive, 200 / 401 / 404)
app.post('/api/accounts/:id/unarchive', requireSession, async (c) => {
  const id = c.req.param('id');
  const res = await unarchiveAccountAction(deps, c.get('user')!, id);
  return c.json(res.body, res.status as 200 | 401 | 404);
});

// 7. Display-only FX (BR: GET /api/accounts/:id/balance, 200 / 401 / 404 / 409 / 503)
app.get('/api/accounts/:id/balance', requireSession, async (c) => {
  const id = c.req.param('id');
  const query = accountBalanceSchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const res = await getAccountBalanceAction(deps, c.get('user')!, id, query);
  return c.json(res.body, res.status as 200 | 401 | 404 | 409 | 503);
});
```

### 4.2 Middleware chain (in order, top to bottom)

1. `requestIdMiddleware` — sets `c.set('requestId', crypto.randomUUID())`; consumed by the error handler for log correlation.
2. `errorHandler` (`app.onError`) — converts thrown `AppError` to the `{ error: { code, message, details? } }` envelope and unknown errors to `INTERNAL_ERROR` 500.
3. `authMiddleware` — calls `deps.authjsAuth()` once per request, sets `c.set('user', session?.user ?? null)`. This is the existing global middleware from `auth-foundation-slice-c`.
4. `requireSession` (per-route middleware, added in this change) — returns 401 `UNAUTHORIZED` if `c.get('user')` is null. The handler never reaches the action otherwise. This is the 401 short-circuit the spec demands for all 7 endpoints.
5. Route handler (calls the action with `deps` and the user from context).

The `requireSession` helper is a thin Hono middleware factory in `src/modules/api/middlewares/require-session.ts`:

```typescript
// src/modules/api/middlewares/require-session.ts
import type { MiddlewareHandler } from 'hono';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';

export const requireSession: MiddlewareHandler = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    throw new AppError({
      code: ErrorCode.UNAUTHORIZED,
      message: 'Authentication required.',
    });
  }
  await next();
};
```

### 4.3 Dependency wiring (extension of `HonoAppDeps`)

`HonoAppDeps` gains the accounts-related services. The existing `authService` and `authjsAuth` fields are unchanged.

```typescript
// src/modules/api/app.ts — extended interface
export interface HonoAppDeps {
  // existing (auth-foundation)
  authService: AuthService;
  authjsAuth: AuthjsAuthFn;
  // new (accounts-ledger)
  accountService: AccountService;
  fxRateProvider: FxRateProvider; // port; the in-change impl is the "unconfigured" stub
}
```

`buildDefaultDeps()` is extended to construct `AccountService` with the Prisma repository + the `FxRateProviderUnconfigured` stub. The Hono app's `AppType` (and therefore the typed `hc<AppType>` client) automatically picks up the new routes — no client-side change needed for type safety.

### 4.4 Typed Hono client

`src/modules/api/client.ts` already exposes `apiClient = (baseUrl) => hc<AppType>(baseUrl)`. This change does NOT modify the client. UI code calls `apiClient(process.env.NEXT_PUBLIC_API_URL).api.accounts.$get(...)` and gets full type safety on every endpoint, query parameter, and response shape. The `AppType` is `typeof honoApp`, so the change to `app.ts` automatically widens the client's type surface.

---

## 5. `FxRateProvider` port

The `FxRateProvider` port is declared in the domain layer (`src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`) and implemented in `src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts` (the in-change stub). The future `fx-cache` change provides a real implementation that gets injected into `buildDefaultDeps()` (likely by editing `buildDefaultDeps()` to accept a registry, or by replacing the import in `app.ts`).

### 5.1 Port interface

```typescript
// src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts
import type { AccountCurrency } from '../entities/financial-account';

export interface FxConversionRequest {
  readonly native: {
    readonly amount: number; // minor units (e.g. cents)
    readonly currency: AccountCurrency;
  };
  readonly displayCurrency: AccountCurrency;
  readonly asOf: Date; // when the caller observed the balance; the provider
  // can return stale rates (BR-ACC-13) and surface fxAsOf
}

export interface FxConversionResult {
  readonly native: { amount: number; currency: AccountCurrency };
  readonly display: {
    readonly amount: number; // minor units, converted
    readonly currency: AccountCurrency;
    readonly fxRate: number; // e.g. 0.92 (display units per native unit)
    readonly fxAsOf: Date; // the rate's timestamp; may be stale
  };
  readonly warnings?: string[]; // e.g. ["rate is older than 24h"]
}

export interface FxRateProvider {
  /**
   * Returns the converted amount. The native balance is never mutated
   * (BR-ACC-12). Throws AppError(FX_UNAVAILABLE) when the provider
   * cannot respond (e.g. no implementation is registered — the
   * "unconfigured" stub always throws this). Throws AppError(
   * FX_NOT_SUPPORTED) when the provider does not support the pair.
   */
  getDisplayAmount(request: FxConversionRequest): Promise<FxConversionResult>;
}
```

### 5.2 In-change implementation: `FxRateProviderUnconfigured`

```typescript
// src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import type {
  FxConversionRequest,
  FxConversionResult,
  FxRateProvider,
} from '../../domain/interfaces/fx-rate-provider.port';

/**
 * In-change FX stub. Always returns 503 FX_UNAVAILABLE. This is
 * the default in buildDefaultDeps() until the fx-cache change
 * provides a real implementation. The smoke UI surfaces the
 * resulting 503 with the inline error "FX rate provider unavailable.
 * Try again in a few minutes." (BR-ACC-18).
 */
export class FxRateProviderUnconfigured implements FxRateProvider {
  async getDisplayAmount(_request: FxConversionRequest): Promise<FxConversionResult> {
    throw new AppError({
      code: ErrorCode.FX_UNAVAILABLE,
      message: 'FX rate provider is not configured. The fx-cache capability has not landed yet.',
    });
  }
}
```

The future `fx-cache` change provides `FxRateProviderLive` (or similar) that implements the same port with a real rate cache + provider (e.g. exchangerate.host, Frankfurter, or a custom provider). Wiring it is a one-line change in `buildDefaultDeps()` and a single import swap in `app.ts`. The action layer does not change.

### 5.3 FX response shape on success

The action's success response is the spec's envelope (BR-ACC-12):

```json
{
  "data": {
    "native": { "amount": 100000, "currency": "USD" },
    "display": {
      "amount": 92000,
      "currency": "EUR",
      "fxRate": 0.92,
      "fxAsOf": "2026-06-18T20:00:00.000Z"
    },
    "warnings": []
  }
}
```

When `native.currency === displayCurrency`, the live provider is expected to short-circuit and return `{ native, display: { amount: native.amount, currency: native.currency, fxRate: 1, fxAsOf: <now> } }` with no `warnings`. The action does not special-case this; the provider does.

---

## 6. UI smoke slice architecture

The smoke UI is **NOT** production UI. It exists to (a) validate the API surface end-to-end, (b) give the future `ui-accounts` change a typed-client and form-pattern reference, and (c) let a developer or PM exercise the API in under five minutes by hand. No accessibility audit, no i18n, no design system, no SSR caching, no error boundaries beyond Next.js's `error.tsx`. Each page header carries a `// smoke-minimal, not production` comment.

### 6.1 Page tree

```
app/accounts/
├── page.tsx                          # Server Component: list view (BR-ACC-17)
├── accounts-list-table.tsx           # pure render: <table> + "Showing first 50 of N" footer
├── new/
│   ├── page.tsx                      # Server Component shell (resolves session, renders form)
│   └── create-account-form.tsx       # Client Component: type-driven form, type-change reset,
│                                     # openingBalanceMode default FRESH, post-201 toast
└── [id]/
    ├── page.tsx                      # Server Component: detail + balance widget
    ├── account-detail.tsx            # pure render: <dl> for the full row
    └── balance-widget.tsx            # Client Component: native + displayCurrency select + submit
                                      # + "Last updated: …" / inline error

app/_components/
└── ephemeral-toast.tsx               # Client Component: <div role="status"> with local state;
                                      # auto-dismiss after 3 s; no library, no context.
```

### 6.2 Server Component pattern (all 3 pages)

```typescript
// app/accounts/page.tsx (list — Server Component)
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/modules/auth';
import { apiClient } from '@/modules/api';
import { AccountsListTable } from './accounts-list-table';
import { EphemeralToast } from '@/app/_components/ephemeral-toast';

export const dynamic = 'force-dynamic'; // session-driven; no static caching

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/accounts'));
  }

  // The Server Component calls the Hono API in-process — no fetch round-trip.
  // The list query always carries archivedAt=null (BR-ACC-17).
  const url = new URL('http://internal/api/accounts?limit=50&archivedAt=null');
  const res = await listAccountsInternal(session.user.id, url.searchParams);
  if (res.status === 401) redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/accounts'));
  if (res.status !== 200) throw new Error('list accounts failed: ' + res.status);

  return (
    <main className="p-6">
      <header className="flex justify-between items-center mb-4">
        {/* smoke-minimal, not production */}
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <a href="/accounts/new" className="rounded bg-blue-600 text-white px-3 py-1">
          New account
        </a>
      </header>

      {/* Render toast from search param if present (BR-ACC-16, BR-ACC-19).
          The detail page redirects with ?toast=account-created or
          ?toast=not-found; this component reads the search param and renders
          for 3 s. */}
      <EphemeralToast searchParamKey="toast" />

      {res.body.data.length === 0 ? (
        <p>No accounts yet — create one</p>
      ) : (
        <AccountsListTable accounts={res.body.data} total={res.body.meta.total} />
      )}
    </main>
  );
}
```

The Server Component pattern is the same on `/new` and `/[id]`: resolve the session via `auth()`, short-circuit on missing session with `redirect()`, call the Hono API in-process (via the typed client wrapper, not `fetch`), render the page. The in-process call avoids the HTTP round-trip and the `NEXT_PUBLIC_API_URL` env var for SSR; the typed client is used directly with the honoApp instance.

**Direct honoApp call vs `fetch`**: the Server Component calls `honoApp.request(new Request(...))` in-process, with the `authjsAuth` dep injecting the same `auth()` that production uses. This is the same pattern the auth-foundation `meAction` uses (it receives `c` from Hono, not a `Request`). The benefit: no `NEXT_PUBLIC_API_URL` env, no SSRF risk, and the typed client is the same one the client components use, so type safety is uniform. The cost: the Server Component must construct a Hono `Request` object manually with the right URL + headers; this is wrapped in a small helper at `src/lib/server-hono.ts`.

### 6.3 `auth()` import: the cross-module entry point

The Server Components import `auth` from `@/modules/auth` (the public surface defined in `src/modules/auth/index.ts`). This is the same import the auth-foundation `middleware.ts` uses. Per the architecture-standards cross-module rule, the UI MUST NOT import from `@/modules/auth/infrastructure/...` or `@/modules/auth/domain/...` directly; the public surface is the only allowed import path. `tsconfig.json#compilerOptions.verbatimModuleSyntax` (already enabled in this project) makes any non-public import a compile error.

### 6.4 Toast mechanism (`<div role="status">` with local state)

```typescript
// app/_components/ephemeral-toast.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const TOAST_MESSAGES: Record<string, string> = {
  'account-created': 'Account created',
  'not-found':       'Account not found or no access',
};

const TOAST_DURATION_MS = 3000;

/**
 * Reads ?toast=<key> from the search params and renders the message
 * for ~3 s, then dismisses. No library, no context. BR-ACC-16 (create)
 * and BR-ACC-19 (detail 404) both redirect with ?toast=… and rely on
 * this component to render the ephemeral confirmation.
 */
export function EphemeralToast({ searchParamKey = 'toast' }: { searchParamKey?: string }) {
  const params = useSearchParams();
  const key = params.get(searchParamKey);
  const message = key ? TOAST_MESSAGES[key] : null;
  const [visible, setVisible] = useState(!!message);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [message]);

  if (!visible || !message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 rounded bg-gray-900 text-white px-4 py-2 shadow"
    >
      {message}
    </div>
  );
}
```

The toast is rendered on the list page (`/accounts`), because both the post-create redirect (BR-ACC-16) and the detail 404 redirect (BR-ACC-19) land on `/accounts` with a `?toast=…` query parameter. The list page is the only place the toast is mounted.

### 6.5 Balance widget (Client Component)

```typescript
// app/accounts/[id]/balance-widget.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppError } from '@/shared/errors/app-error';

interface Props {
  accountId: string;
  nativeAmount: number;
  nativeCurrency: 'ARS' | 'USD' | 'EUR';
}

const CURRENCIES = ['ARS', 'USD', 'EUR'] as const;

export function BalanceWidget({ accountId, nativeAmount, nativeCurrency }: Props) {
  const router = useRouter();
  const [displayCurrency, setDisplayCurrency] = useState<typeof CURRENCIES[number]>(nativeCurrency);
  const [result, setResult] = useState<null | { amount: number; currency: string; fxRate: number; fxAsOf: string }>(null);
  const [error, setError] = useState<null | string>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // The Server Component passes the typed client as a prop OR the
      // Client Component constructs it from NEXT_PUBLIC_API_URL. The
      // design picks: pass via prop (avoids env var in client bundle).
      const res = await fetch(`/api/accounts/${accountId}/balance?displayCurrency=${displayCurrency}`, {
        method: 'GET',
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error.message);
        return;
      }
      setResult(json.data.display);
      router.refresh();   // BR-ACC-18: refresh server-derived data
    } catch (e) {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-6 border-t pt-4">
      <h2 className="text-lg font-semibold mb-2">Balance</h2>
      <p className="mb-3">
        Native: <span className="font-mono">{nativeAmount / 100} {nativeCurrency}</span>
      </p>

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <label className="block">
          <span className="block text-sm">Display in</span>
          <select
            name="displayCurrency"
            value={displayCurrency}
            onChange={(e) => setDisplayCurrency(e.target.value as typeof CURRENCIES[number])}
            className="border rounded px-2 py-1"
          >
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <button type="submit" disabled={loading} className="rounded bg-blue-600 text-white px-3 py-1">
          {loading ? 'Converting…' : 'Convert'}
        </button>
      </form>

      {result && (
        <div className="mt-3 p-3 bg-gray-50 rounded">
          <p>Converted: <span className="font-mono">{result.amount / 100} {result.currency}</span></p>
          <p className="text-sm text-gray-600">Rate: {result.fxRate}</p>
          <p className="text-sm text-gray-600">Last updated: {new Date(result.fxAsOf).toLocaleString()}</p>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-3 p-3 bg-red-50 text-red-800 rounded">
          {error}
        </div>
      )}
    </section>
  );
}
```

The widget renders the full whitelist `{ ARS, USD, EUR }` per BR-ACC-18 (Decision 8) — the native currency is NOT filtered out. The "Last updated: …" text is plain (no warning styling) per Decision 3.

### 6.6 Create form (Client Component) — type-driven

The create form is a discriminated union over `type`. On `type` change, all type-specific fields are reset to defaults (Decision 6). The openingBalanceMode default is FRESH (Decision 5). The openingBalanceMinor input validates `>= 0` on the client (the submit button is disabled or shows an inline error) and on the server (Zod schema). On `201`, the form calls `router.push('/accounts?toast=account-created')` (the toast renders on the list page, not on `/new`).

The full per-type field mapping is:

| `type`       | Type-specific fields                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| `BANK`       | `bankName` (text, required), `accountKind` (select SAVINGS / CHECKING)                                        |
| `CREDIT`     | `issuer` (text, required), `creditLimit` (number, optional), `statementDay` (1..31), `paymentDueDay` (1..31)  |
| `INVESTMENT` | `broker` (text, required), `investmentType` (select STOCKS / BONDS / MUTUAL_FUNDS / CERTS_OF_DEPOSIT / OTHER) |
| `CRYPTO`     | `walletAddress` (text, optional)                                                                              |
| `CASH`       | (none)                                                                                                        |
| `OTHER`      | (none)                                                                                                        |

The Zod schema (`account-create.schema.ts`) is a `z.discriminatedUnion('type', [bankSchema, creditSchema, …])`; the per-type refinement enforces that `walletAddress` is only set on `CRYPTO`, etc. (per the spec scenario "type-specific field set for the wrong type is rejected → 400 VALIDATION_ERROR").

---

## 7. Tailwind v4 setup (concrete)

DG-V3-1 (Tailwind in scope) was resolved 2026-06-18. This section closes the open follow-up about the concrete Tailwind v4 + Next.js 16 + pnpm setup.

### 7.1 Version pinning (per the project's pnpm-lock.yaml policy)

Tailwind v4 stable + the official Next.js integration is the target. The `package.json` pins:

```json
{
  "devDependencies": {
    "tailwindcss": "^4.1.0",
    "@tailwindcss/postcss": "^4.1.0",
    "postcss": "^8.4.0"
  }
}
```

The install command (PR-A, task A-3):

```bash
pnpm add -D tailwindcss@^4.1.0 @tailwindcss/postcss@^4.1.0 postcss@^8.4.0
```

`pnpm-lock.yaml` MUST be committed in the same commit (root `AGENTS.md` §5.3; Husky pre-commit check enforces).

### 7.2 `postcss.config.mjs` (project root)

```javascript
// postcss.config.mjs
// Next.js 16 + Tailwind v4 PostCSS integration. The official
// `@tailwindcss/postcss` plugin replaces the legacy `tailwindcss`
// PostCSS plugin that shipped with Tailwind v3.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

### 7.3 `app/globals.css` (new file, imported once in `app/layout.tsx`)

```css
/* app/globals.css — Tailwind v4 single-import directive */
@import 'tailwindcss';
```

Tailwind v4 replaces the three-directive setup (`@tailwind base; @tailwind components; @tailwind utilities;`) with a single `@import "tailwindcss";` (v4 unified the import surface). The content path detection is automatic in v4 — the plugin scans the working directory by default; explicit `tailwind.config.ts` content paths are not required for v4 with the PostCSS plugin. The smoke UI does NOT need a `tailwind.config.ts` for content paths; if the project wants theme tokens or custom utilities later, that file is added in `ui-accounts` (the production UI change).

### 7.4 Verify the install

```bash
pnpm install
pnpm exec next build      # PostCSS must process globals.css; build fails if misconfigured
```

If `next build` succeeds, the Tailwind v4 setup is correct. The smoke UI page is then runnable at `pnpm dev` → sign in → `/accounts`. The first run of the page shows the styled empty state with the `New account` button.

### 7.5 Next.js 16 + Tailwind v4 compatibility

Next.js 16's PostCSS pipeline accepts the `@tailwindcss/postcss` plugin natively. The known issue from earlier Next.js + Tailwind v3 setups (the `content` glob in `tailwind.config.ts` not matching the App Router) does not apply to v4 with the unified import. The apply worker MUST verify on the first build that the `globals.css` import resolves and that utility classes like `bg-blue-600` apply. If there is a v4/Next 16 incompatibility (uncommon in mid-2026 but possible), the fallback is Tailwind v3 with the classic three-directive setup — flagged in `risks` below.

---

## 8. Validation & errors

### 8.1 Zod schemas (per operation, per type)

```typescript
// src/modules/accounts/application/validation/account-create.schema.ts
import { z } from 'zod';

const accountCurrencySchema = z.enum(['ARS', 'USD', 'EUR']);

const openingBalanceSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('FRESH'),
    amount: z.number().int().min(0), // BR-ACC-16 (Decision 7)
    date: z.null().optional(),
  }),
  z.object({
    mode: z.literal('HISTORICAL'),
    amount: z.number().int().min(0), // BR-ACC-16 (Decision 7)
    date: z.coerce.date(), // required iff HISTORICAL
  }),
]);

const bankSchema = z.object({
  type: z.literal('BANK'),
  name: z.string().min(1).max(80),
  currency: accountCurrencySchema,
  openingBalance: openingBalanceSchema,
  bankName: z.string().min(1),
  accountKind: z.enum(['SAVINGS', 'CHECKING']),
});

const creditSchema = z.object({
  type: z.literal('CREDIT'),
  name: z.string().min(1).max(80),
  currency: accountCurrencySchema,
  openingBalance: openingBalanceSchema,
  issuer: z.string().min(1),
  creditLimitMinor: z.number().int().min(0).optional(),
  statementDay: z.number().int().min(1).max(31),
  paymentDueDay: z.number().int().min(1).max(31),
});

const investmentSchema = z.object({
  type: z.literal('INVESTMENT'),
  name: z.string().min(1).max(80),
  currency: accountCurrencySchema,
  openingBalance: openingBalanceSchema,
  broker: z.string().min(1),
  investmentType: z.enum(['STOCKS', 'BONDS', 'MUTUAL_FUNDS', 'CERTS_OF_DEPOSIT', 'OTHER']),
});

const cryptoSchema = z.object({
  type: z.literal('CRYPTO'),
  name: z.string().min(1).max(80),
  currency: accountCurrencySchema,
  openingBalance: openingBalanceSchema,
  walletAddress: z.string().optional(),
});

const cashSchema = z.object({
  type: z.literal('CASH'),
  name: z.string().min(1).max(80),
  currency: accountCurrencySchema,
  openingBalance: openingBalanceSchema,
});

const otherSchema = z.object({
  type: z.literal('OTHER'),
  name: z.string().min(1).max(80),
  currency: accountCurrencySchema,
  openingBalance: openingBalanceSchema,
});

export const accountCreateSchema = z.discriminatedUnion('type', [
  bankSchema,
  creditSchema,
  investmentSchema,
  cryptoSchema,
  cashSchema,
  otherSchema,
]);

export type AccountCreateInput = z.infer<typeof accountCreateSchema>;
```

`account-update.schema.ts` is a `z.partial()` of the create schema (any field optional, but the same per-type refinement).

`list-accounts.schema.ts`:

```typescript
export const listAccountsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // archivedAt is always 'null' for the smoke slice (BR-ACC-17).
  // The schema is permissive: ?archivedAt=null is allowed, anything else is ignored.
  archivedAt: z.literal('null').optional(),
});
```

`account-balance.schema.ts`:

```typescript
export const accountBalanceSchema = z.object({
  displayCurrency: z.enum(['ARS', 'USD', 'EUR']),
});
```

### 8.2 Standard error envelope

The error envelope is the project convention (`src/shared/http/error-handler.ts`): `{ error: { code, message, details? } }`. The `code` is the machine-readable string the UI matches on; `message` is the human-facing string (Spanish in production, English in the smoke slice per Decision 1). The `details` field carries the Zod issue list when `code = VALIDATION_ERROR`.

### 8.3 Error code registry additions

`src/shared/errors/error-codes.ts` gains the following codes (additive, non-breaking):

```typescript
// src/shared/errors/error-codes.ts — additions
export const ErrorCode = {
  // ... existing codes
  NOT_FOUND: 'NOT_FOUND', // 404
  NAME_TAKEN: 'NAME_TAKEN', // 409 (P2002 unique violation on (userId, type, name))
  FX_UNAVAILABLE: 'FX_UNAVAILABLE', // 503 (no provider registered, or provider down)
  FX_NOT_SUPPORTED: 'FX_NOT_SUPPORTED', // 409 (provider does not support the pair)
} as const;

export const ErrorStatus: Record<ErrorCode, number> = {
  // ... existing statuses
  NOT_FOUND: 404,
  NAME_TAKEN: 409,
  FX_UNAVAILABLE: 503,
  FX_NOT_SUPPORTED: 409,
};
```

`FX_UNAVAILABLE` maps to HTTP 503 (Service Unavailable), consistent with the `api-design` skill's pattern for upstream unavailability (the `OAUTH_PROVIDER_UNAVAILABLE` code uses 502; FX is a different layer so 503 is more accurate — the FX subsystem is down, not the upstream provider).

### 8.4 Where errors are thrown

| Layer                              | Throws                                                                                                                                                                                                                             | Notes                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Hono middleware (`requireSession`) | `AppError(UNAUTHORIZED, ...)`                                                                                                                                                                                                      | Once per route; short-circuits the handler.                                                       |
| Application action                 | `AppError(VALIDATION_ERROR, ..., details: zodIssues)` when the parsed body fails. `AppError(NAME_TAKEN, ...)` when the unique constraint trips. `AppError(NOT_FOUND, ...)` when the row does not exist or belongs to another user. | The action does NOT throw on `200` or `201`; it returns a discriminated union `{ status, body }`. |
| Domain service                     | `AppError(NOT_FOUND, ...)`, `AppError(NAME_TAKEN, ...)`, `AppError(FX_UNAVAILABLE, ...)`, `AppError(FX_NOT_SUPPORTED, ...)`                                                                                                        | Domain services throw because they encode the business rules.                                     |
| Infrastructure repository          | `Prisma.PrismaClientKnownRequestError` (P2002 unique violation); converted to `AppError(NAME_TAKEN, ...)` by the action. Other Prisma errors propagate and are caught by the central `errorHandler` as `INTERNAL_ERROR`.           | The adapter does not throw business errors.                                                       |
| FxRateProvider (unconfigured)      | `AppError(FX_UNAVAILABLE, ...)` always                                                                                                                                                                                             | Per §5.2.                                                                                         |

---

## 9. Auth integration

The `auth` capability is the cross-module invariant source. The accounts module never re-implements session reading; it calls `auth()` from `@/modules/auth` and treats the result as the source of truth for `userId`.

### 9.1 The single entry point

`auth` is imported from `@/modules/auth` (the public surface at `src/modules/auth/index.ts`). The Hono `authMiddleware` calls `deps.authjsAuth()` once per request and sets `c.set('user', session?.user ?? null)`. The accounts module's routes and Server Components consume the user from `c.get('user')` (Hono context) or `await auth()` (Server Component). There is exactly one import path; no direct `getServerSession` or `getToken` calls.

### 9.2 The cross-module invariant: `FinancialAccount.userId === session.user.id`

The invariant is enforced at TWO layers:

1. **Action layer**: every action receives `user` as a parameter from `c.get('user')` (Hono) or `await auth()` (Server Component). The action NEVER accepts a `userId` from a request body or query parameter. The Zod schemas for create / update / list do not have a `userId` field. PATCH on a row owned by another user returns `404 NOT_FOUND` (existence is not leaked — the spec scenario "another user's account returns 404").

2. **Repository layer**: every query method in `AccountRepositoryPort` accepts `userId` as a required argument. The implementation `account.repository.prisma.ts` ALWAYS includes `userId` in the WHERE clause; there is no `findById(id)` method that could leak cross-user rows. The `findById(userId, id)` signature is the contract. The TypeScript compiler enforces this; the reviewer's job is to verify no method in the adapter omits the `userId` filter.

### 9.3 `requireSession` vs `auth()` directly

- **In the Hono catch-all**: `requireSession` middleware. The handler never executes without a user.
- **In Server Components**: `await auth()` directly, then `if (!session?.user) redirect(...)`. No `requireSession` equivalent; the Server Component does the check inline because the redirect target is a `next/navigation` concern.

Both paths converge on the same `auth()` from `@/modules/auth`. The compile-time `verbatimModuleSyntax: true` setting in `tsconfig.json` makes any non-public import a build error, so the entry point cannot drift.

---

## 10. Test layout (strict TDD)

### 10.1 Vitest config additions

`vitest.config.ts` already includes `src/modules/**` and `app/**` (per the auth-foundation setup). The accounts module's tests live under `src/modules/accounts/**` and are picked up by the existing `include` patterns. No `vitest.config.ts` change is needed for unit / application / API tests. The smoke UI tests are explicitly NOT included (the slice is hand-verified; see §10.5).

### 10.2 Unit tests (domain)

| File                                                                | Coverage                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/accounts/domain/entities/financial-account.test.ts`    | Enum exhaustiveness (all 6 AccountType values, all 5 enums); type-guard for the entity shape.                                                                                                                                                                                           |
| `src/modules/accounts/domain/value-objects/opening-balance.test.ts` | `fresh()` factory; `historical(date, amount)` factory; `amount >= 0`; `date <= now` for HISTORICAL.                                                                                                                                                                                     |
| `src/modules/accounts/domain/services/account.service.test.ts`      | All service methods with fake repo + fake FX provider. AAA pattern. 7+ scenarios: list omits archived; getById returns 404 on cross-user; create enforces unique name; create rejects wrong-type fields; archive / unarchive toggles `archivedAt`; getBalance returns native unchanged. |

### 10.3 Application tests

| File                                                                          | Coverage                                                                                                                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/modules/accounts/application/actions/list-accounts.action.test.ts`       | Injects fake repo + fake session; asserts the action returns the paginated shape.                                                                                  |
| `src/modules/accounts/application/actions/create-account.action.test.ts`      | Asserts: Zod validation rejects malformed body → `VALIDATION_ERROR`; per-type Zod rejects wrong-type field → `VALIDATION_ERROR`; unique collision → `NAME_TAKEN`.  |
| `src/modules/accounts/application/actions/get-account-balance.action.test.ts` | Asserts: 200 with `{ native, display, warnings? }` shape on success; 503 when FX provider throws `FX_UNAVAILABLE`; 409 when FX provider throws `FX_NOT_SUPPORTED`. |

### 10.4 API integration tests

The 7 endpoints are tested through the Hono sub-app via `honoApp.request(new Request(...))` (the same pattern `src/modules/api/app.test.ts` uses for the auth routes). This avoids the cost of spawning a `next dev` process.

| File                                              | Coverage                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/api/app.accounts.test.ts` (new file) | 7 endpoints × ≥2 scenarios each = 14+ tests. Injects a fake `accountService` and a fake `fxRateProvider` via `createHonoApp`. Asserts: 401 when no session; 200/201 happy path; 400/404/409/503 error paths. The 7-endpoint × 2-scenario matrix matches the spec's Requirements count. |

### 10.5 UI smoke slice: NO automated tests

The smoke UI is **explicitly not tested by Vitest** (per the spec's "Smoke UI is NOT production UI" section and the spec acceptance criteria, which list hand-verification as the gate). The rationale:

- The smoke UI is a validation harness, not a product surface. The cost of Playwright/Cypress setup exceeds the value of automated coverage for a slice that will be replaced by `ui-accounts` in a future change.
- The API contract is already covered by the Hono integration tests in §10.4; the UI is a thin shell over those endpoints.
- Hand-verification by the developer or PM (per the proposal's "Users and situations" table) is the documented gate.

If a reviewer demands UI tests, the response is: the slice is documented as hand-verified; the future `ui-accounts` change will own the production UI test suite. Adding UI tests to the smoke slice is out of scope and explicitly out-of-scope in the proposal's "Non-goals" section.

### 10.6 AAA pattern + 80% coverage

Every test follows the AAA pattern (Arrange-Act-Assert) per `testing-standards`. Coverage target is **≥80% on `src/modules/accounts/**`** (lines, branches, functions, statements), enforced by the CI `test`job. The CI command is`pnpm test --coverage`. Local dev runs the same command without `--coverage`for speed; the Husky pre-commit hook is configured to run the full suite + coverage on staged test files (per the strict TDD config in`openspec/config.yaml`).

### 10.7 Strict TDD evidence (per task)

Each `apply` task ships with a commit body that includes the RED → GREEN → TRIANGULATE → REFACTOR evidence in the form:

```
test(<scope>): <red> add failing test for <X>
feat(<scope>): <green> implement <X> to make the test pass
test(<scope>): <triangulate> add 2 more cases for <X>
refactor(<scope>): <X> extract <Y> for clarity
```

The apply worker follows the discipline; the verify reviewer audits the commit log.

---

## 11. File-to-requirement traceability matrix

The matrix maps every spec Requirement to the files that implement it. Reviewer reads this and knows where to look. Requirements are referenced by their spec section heading (truncated for table width).

| Spec Requirement                                                                          | Domain                                                                            | Application                                                                                             | Infrastructure                                                                                 | Interface / UI                                                                                                                               |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `FinancialAccount persists the 6-type discriminated model`                                | `domain/entities/financial-account.ts`, `domain/value-objects/opening-balance.ts` | `application/validation/account-create.schema.ts`                                                       | `infrastructure/repositories/account.repository.prisma.ts`, `prisma/schema.prisma` (migration) | —                                                                                                                                            |
| `GET /api/accounts returns a cursor-paginated list scoped to the authenticated user`      | `domain/services/account.service.ts` (`list`)                                     | `application/actions/list-accounts.action.ts`, `application/validation/list-accounts.schema.ts`         | —                                                                                              | `src/modules/api/app.ts` (route), `app/accounts/page.tsx` (UI)                                                                               |
| `POST /api/accounts creates a type-driven account`                                        | `domain/services/account.service.ts` (`create`)                                   | `application/actions/create-account.action.ts`, `application/validation/account-create.schema.ts`       | `infrastructure/repositories/account.repository.prisma.ts`                                     | `src/modules/api/app.ts` (route), `app/accounts/new/page.tsx` + `create-account-form.tsx` (UI)                                               |
| `GET /api/accounts/:id returns one account or 404 on cross-user`                          | `domain/services/account.service.ts` (`getById`)                                  | `application/actions/get-account.action.ts`                                                             | `infrastructure/repositories/account.repository.prisma.ts`                                     | `src/modules/api/app.ts` (route), `app/accounts/[id]/page.tsx` (UI)                                                                          |
| `PATCH /api/accounts/:id applies a partial update`                                        | `domain/services/account.service.ts` (`update`)                                   | `application/actions/update-account.action.ts`, `application/validation/account-update.schema.ts`       | `infrastructure/repositories/account.repository.prisma.ts`                                     | `src/modules/api/app.ts` (route) — UI does not call in smoke                                                                                 |
| `POST /api/accounts/:id/archive soft-archives the account`                                | `domain/services/account.service.ts` (`archive`)                                  | `application/actions/archive-account.action.ts`                                                         | `infrastructure/repositories/account.repository.prisma.ts`                                     | `src/modules/api/app.ts` (route) — UI does not call in smoke                                                                                 |
| `POST /api/accounts/:id/unarchive restores the account`                                   | `domain/services/account.service.ts` (`unarchive`)                                | `application/actions/unarchive-account.action.ts`                                                       | `infrastructure/repositories/account.repository.prisma.ts`                                     | `src/modules/api/app.ts` (route) — UI does not call in smoke                                                                                 |
| `GET /api/accounts/:id/balance returns the display-only FX conversion`                    | `domain/services/account.service.ts` (`getBalance`)                               | `application/actions/get-account-balance.action.ts`, `application/validation/account-balance.schema.ts` | `infrastructure/external/fx-rate-provider.unconfigured.ts` (in-change stub)                    | `src/modules/api/app.ts` (route), `app/accounts/[id]/balance-widget.tsx` (UI)                                                                |
| `/accounts lists the user's live accounts (Server Component)`                             | —                                                                                 | —                                                                                                       | —                                                                                              | `app/accounts/page.tsx` + `app/accounts/accounts-list-table.tsx`                                                                             |
| `/accounts/new renders the type-driven create form (Server shell + Client form)`          | —                                                                                 | —                                                                                                       | —                                                                                              | `app/accounts/new/page.tsx` + `app/accounts/new/create-account-form.tsx`                                                                     |
| `/accounts/[id] shows the account detail and the balance widget (Server + Client widget)` | —                                                                                 | —                                                                                                       | —                                                                                              | `app/accounts/[id]/page.tsx` + `app/accounts/[id]/account-detail.tsx` + `app/accounts/[id]/balance-widget.tsx`                               |
| `All request bodies are validated by Zod schemas`                                         | —                                                                                 | `application/validation/*.schema.ts`                                                                    | —                                                                                              | `src/modules/api/app.ts` (route handlers call schema.parse)                                                                                  |
| `All endpoints require an authenticated session`                                          | —                                                                                 | —                                                                                                       | —                                                                                              | `src/modules/api/middlewares/require-session.ts` (Hono) + `await auth()` (Server Components)                                                 |
| `Errors follow the project's standard error envelope`                                     | —                                                                                 | —                                                                                                       | —                                                                                              | `src/shared/http/error-handler.ts` (existing, reused) + `src/shared/errors/{app-error,error-codes}.ts` (existing, extended with 4 new codes) |

The matrix is reviewed alongside the spec. If a spec Requirement has no row in the matrix, the design is incomplete.

---

## 12. Open design decisions (DGs closed by this design)

The spec left 4 design-level decisions open. This design closes them.

### DG-D-1 — Tailwind v4 vs Tailwind v3 (closes DG-V3-1)

**Decision**: Tailwind v4 stable (`tailwindcss@^4.1.0`) with the official `@tailwindcss/postcss` plugin. Single `@import "tailwindcss";` directive in `app/globals.css`. No `tailwind.config.ts` for content paths (v4 detects automatically).

**Rationale**: Tailwind v4 is the current major; v3 is in maintenance. The Next.js 16 + v4 PostCSS pipeline is stable in mid-2026 and documented in the official Tailwind docs. The v4 single-import directive is simpler than the v3 three-directive setup.

**Fallback**: if the apply worker finds a v4 / Next 16 incompatibility on the first build, fall back to Tailwind v3 with the classic three-directive setup + `tailwind.config.ts` content paths. Document the fallback in the PR-A handoff; the spec does not change.

**Closed by**: §7.

### DG-D-2 — `requireSession` helper vs `auth()` direct in Hono

**Decision**: extract `requireSession` as a small Hono middleware factory in `src/modules/api/middlewares/require-session.ts`. The 7 new routes use it. The existing 3 routes (`/health`, `/me`, `/auth/register`) keep their current behavior (`/health` is public; `/me` and `/auth/register` do their own session check inside the action).

**Rationale**: the 7 new routes have the same 401 short-circuit logic. Duplicating the check in every action is a code smell; a middleware factory is the conventional Hono pattern. The `requireSession` middleware is also reusable by future capabilities (`transactions`, `fx-cache`, `snapshots`, `reports`).

**Closed by**: §4.2.

### DG-D-3 — Hono middleware chain order

**Decision**: `requestId` → `errorHandler` (registered via `app.onError`) → `authMiddleware` (sets `c.get('user')`) → per-route `requireSession` → route handler.

**Rationale**: `requestId` must run first so every later log line has it. `errorHandler` must be registered before routes so thrown errors land in it. `authMiddleware` must run before `requireSession` so the user is on the context. `requireSession` runs per-route (not globally) so the public routes (`/health`, future `/api/auth/*` through the catch-all if any) keep working.

**Closed by**: §4.2.

### DG-D-4 — Error envelope exact shape and HTTP status mapping

**Decision**: the envelope is `{ error: { code: string, message: string, details?: unknown } }` (matches `src/shared/http/error-handler.ts`). The 4 new error codes map to HTTP statuses as follows: `NOT_FOUND → 404`, `NAME_TAKEN → 409`, `FX_NOT_SUPPORTED → 409`, `FX_UNAVAILABLE → 503`. The `details` field carries the Zod issue list for `VALIDATION_ERROR`.

**Rationale**: matches the project convention from `auth-foundation`. `FX_UNAVAILABLE → 503` is consistent with the `api-design` skill's pattern for upstream unavailability. `FX_NOT_SUPPORTED → 409` is consistent with the spec scenario "unsupported pair returns 409".

**Closed by**: §8.2, §8.3.

### DG-D-5 — Prisma migration file naming

**Decision**: the migration is named `add_financial_account` (`pnpm prisma migrate dev --name add_financial_account`). The timestamp prefix is generated by Prisma's CLI. Only one migration in this change (in PR-A). PRs B and C do not touch the schema.

**Rationale**: matches the project's `db/migrations/<timestamp>_<name>/migration.sql` convention (per `database-strategy` skill). A single, focused migration name is reviewable in one diff.

**Closed by**: §3.

---

## 13. Risks & tradeoffs

| Risk                                                                                                                                                                                                                 | Mitigation                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Smoke UI mistaken for production UI** — a future contributor adds more pages under `app/accounts/*` thinking the slice is the production surface.                                                                  | The `// smoke-minimal, not production` comment on every page header. The spec's explicit "Smoke UI is NOT production UI" section. The `ui-accounts` follow-up change is documented as the production owner.                                                                                                                                                         |
| **`FxRateProvider` stub surfaces `503 FX_UNAVAILABLE` in dev** — until `fx-cache` lands, every balance widget call returns the error.                                                                                | The widget's inline error copy is `"FX rate provider unavailable. Try again in a few minutes."` (verbatim from BR-ACC-18). The stub is the documented pre-`fx-cache` behavior. The widget is verifiable by hand in PR-C.                                                                                                                                            |
| **1750-line forecast per proposal** — the per-PR estimate from the proposal is generous; the actual diff may be smaller (if Tailwind setup is lean) or larger (if Zod schemas grow).                                 | Re-forecast in the apply phase per PR. The design's per-PR split is the lower bound of the proposal's range. Per-PR sizes: PR-A ~500 lines (Prisma + domain + application skeleton + tests), PR-B ~700 lines (Hono routes + adapter + integration tests), PR-C ~550 lines (UI pages + Tailwind setup + Spanish mirror). Total ~1750, matching the proposal.         |
| **Next.js 16 + Tailwind v4 compatibility** — v4 / Next 16 mismatches are rare but possible.                                                                                                                          | §7.5 documents the fallback (v3 with classic three-directive). The apply worker verifies on the first build.                                                                                                                                                                                                                                                        |
| **Direct `honoApp.request` in Server Components** — the Server Component constructs a Hono `Request` manually. Drift between the manual construction and Hono's `app.request` interface could break the integration. | The construction is wrapped in a single helper at `src/lib/server-hono.ts`. The helper is unit-tested with the same `app.request` shape that production uses.                                                                                                                                                                                                       |
| **Naming collision with Auth.js `Account` (OAuth link)**                                                                                                                                                             | The accounts module is `src/modules/accounts/` and the entity is `FinancialAccount`. The cross-module invariant from the auth-foundation design (cite ADR-0001 from slice-c) is that Auth.js's `Account` table is internal to the auth module and never reaches the application surface. The accounts module never imports from `src/modules/auth/infrastructure/`. |
| **Bilingual drift** — the Spanish mirror may fall behind the English design.                                                                                                                                         | The mirror is written in the same PR as the English source. The Husky pre-commit `check-lockfile.sh` script does not enforce docs; reviewer verifies both files in the PR. The repo's CI does not currently have a Spanish-mirror lint job; the future `ui-accounts` change will add one.                                                                           |
| **`pnpm-lock.yaml` drift** — adding `tailwindcss` + `@tailwindcss/postcss` + `postcss` to `package.json` requires a lockfile commit.                                                                                 | Per root `AGENTS.md` §5.3: the lockfile is a deliverable. The Husky pre-commit hook (`scripts/check-lockfile.sh`) fails the commit if `package.json` is staged without a corresponding `pnpm-lock.yaml` change.                                                                                                                                                     |
| **Test count drift on `auth` capability** (the inherited 132/135 vs 137/137 from FLAG-V1)                                                                                                                            | This change does NOT add to the auth module's tests. The auth coverage is at its current 222/45-files baseline (per the slice-c HANDOFF §"FLAG-V1 status"). The accounts module's coverage target is its own ≥80% on `src/modules/accounts/**`.                                                                                                                     |

---

## 14. Rollout

### 14.1 Per-PR plan (3 chained PRs, `feat/accounts-ledger-a|b|c` → `develop`)

| PR  | Branch                   | Scope                                                                                                                                                                                                                                                                                                                                      | Approx. lines | Acceptance gate                                                                                                                                                                                                                                                  |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `feat/accounts-ledger-a` | `prisma/schema.prisma` + migration `add_financial_account`; 5 enums; `FinancialAccount` model; domain entities + value object + service + ports (no impl); 2 new error codes (`NOT_FOUND`, `NAME_TAKEN`); unit tests for domain; AAA pattern                                                                                               | ~500          | `pnpm prisma migrate dev` succeeds; `pnpm test` exits 0; ≥80% coverage on `src/modules/accounts/domain/**`                                                                                                                                                       |
| B   | `feat/accounts-ledger-b` | `account.repository.prisma.ts` + integration tests; 7 actions + 4 Zod schemas; `FxRateProviderUnconfigured` + 2 new error codes (`FX_UNAVAILABLE`, `FX_NOT_SUPPORTED`); 7 Hono routes registered in `src/modules/api/app.ts`; `requireSession` middleware; `HonoAppDeps` extension; `buildDefaultDeps` wiring; 14+ Hono integration tests  | ~700          | `pnpm test` exits 0; 401 on every endpoint when no session; 200/201 happy paths; 400/404/409/503 error paths covered                                                                                                                                             |
| C   | `feat/accounts-ledger-c` | Tailwind v4 setup (`package.json` + `postcss.config.mjs` + `app/globals.css`); 3 Server Components (`app/accounts/page.tsx`, `app/accounts/new/page.tsx`, `app/accounts/[id]/page.tsx`); 2 Client Components (`create-account-form.tsx`, `balance-widget.tsx`); `ephemeral-toast.tsx`; Spanish mirror; PR-A and PR-B bilingual drift check | ~550          | `pnpm dev` → sign in → `/accounts` lists accounts; `/accounts/new` form creates an account and redirects with toast; `/accounts/[id]` shows detail and balance widget; widget shows `503` inline error until `fx-cache` lands; Spanish mirror has zero CJK chars |

Total: ~1750 lines across 3 PRs. This matches the proposal's forecast (auto-forecast accepted 2026-06-18). The PRs are chained: A → B → C; each PR opens to `develop` only after the previous is squash-merged.

### 14.2 Prisma migration discipline

The single `add_financial_account` migration runs in PR-A's `pnpm prisma migrate dev` invocation. PR-B and PR-C do not add migrations. The `prisma generate` step runs in every PR (CI runs `pnpm install --frozen-lockfile && pnpm prisma generate && pnpm test`). The CI Postgres service (already configured in `.github/workflows/ci.yml` from auth-foundation-slice-c, T-028) runs the migration with `pnpm prisma migrate deploy` before `pnpm test`.

### 14.3 Lockfile discipline

Every PR that touches `package.json` (PR-A for `prisma` regeneration; PR-C for `tailwindcss` + `@tailwindcss/postcss` + `postcss`) commits `pnpm-lock.yaml` in the same commit. The Husky pre-commit check (`scripts/check-lockfile.sh`) fails the commit if the lockfile drifts. CI uses `pnpm install --frozen-lockfile` to validate reproducibility on a clean runner.

### 14.4 Spanish mirror policy

The `Documents-es/openspec/changes/accounts-ledger/{design,spec,proposal}.md` files are written in the same commit as their English source. The `Documents-es/openspec/changes/accounts-ledger/proposal.md` already exists (it was translated in the proposal v3 phase). The spec and design mirrors are new in this change. The mirror translation is faithful (technical terms in English: `prisma`, `honoApp`, `Auth.js`, `Zod`, `Vitest`, `archivedAt`, `openingBalanceMode`, `displayCurrency`, `fxAsOf`, `cuid`, `BR-ACC-NN`, `AAA pattern`, `RED/GREEN/TRIANGULATE/REFACTOR`, `verbatimModuleSyntax`); prose is translated to voseo rioplatense. The Chinese-character check (`grep -P '[\x{4e00}-\x{9fff}]'`) returns zero matches on the mirror.

### 14.5 Worktree discipline (per root `AGENTS.md` §5.2)

Each PR lives in its own git worktree:

```bash
git worktree add ../gastos-personales-accounts-ledger-a -b feat/accounts-ledger-a develop
cd ../gastos-personales-accounts-ledger-a
# ... work, commit, push
gh pr create --base develop --title "feat(accounts): add FinancialAccount ledger (PR-A: domain + Prisma)"
# after squash-merge to develop:
git worktree remove ../gastos-personales-accounts-ledger-a

git worktree add ../gastos-personales-accounts-ledger-b -b feat/accounts-ledger-b develop
# ...
```

No parallel writers without isolated worktrees (root `AGENTS.md` §2.4, §5.1).

### 14.6 Pre-merge gate

Before each PR is squash-merged to `develop`, the parent (orchestrator) runs a `sdd-verify` pass per slice (or per PR). The verify pass uses the `sdd-verify` agent with fresh context. The reviewer audits the TDD evidence, the test count delta, the coverage on `src/modules/accounts/**`, and the bilingual mirror. The PR is merged only after `sdd-verify` returns `PASS` (or `PASS_WITH_FLAGS` with no CRITICAL).

### 14.7 Post-merge sync + archive

After all 3 PRs merge to `develop`, the `sdd-sync` phase promotes the spec from `openspec/changes/accounts-ledger/specs/accounts/spec.md` to `openspec/specs/accounts/spec.md` (canonical). The `sdd-archive` phase moves `openspec/changes/accounts-ledger/` to `openspec/changes/archive/`. The `fx-cache` change unblocks after archive (it depends on the `FxRateProvider` port declared here).

---

## 15. Out of scope (this design)

- `fx-cache` implementation (the `FxRateProvider` is a port only; the live provider lands in the `fx-cache` change).
- `transactions`, `snapshots`, `reports` — each is its own SDD change; they will consume the `accounts` capability.
- Production UI (`ui-accounts` or `pwa-shell`).
- The `61 pnpm audit` vulns (issue #7, separate tracking).
- Email notifications, scheduled jobs, background workers.
- Bulk import / CSV upload.
- Production auth hardening (rate limiting on UI-driven endpoints).

---

## 16. Next step

The next SDD phase is `sdd-tasks`: produce `openspec/changes/accounts-ledger/tasks.md` with the 3 chained PRs decomposed into atomic tasks (one per commit), each with strict TDD evidence columns. After `sdd-tasks`: `sdd-apply` (PR-A, PR-B, PR-C in sequence). The `sdd-verify`, `sdd-sync`, and `sdd-archive` phases follow each PR.
