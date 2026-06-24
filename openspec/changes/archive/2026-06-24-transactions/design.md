# Design — `transactions`

**Status**: implemented · **Author**: Sebastián Illa · **Created**: 2026-06-22 · **Implemented**: 2026-06-24 (slices 1-5 merged on `develop` via #59-#63; archived as 2026-06-24-transactions)
**Change**: `transactions`
**Proposal**: `openspec/changes/transactions/proposal.md` (v1, 2026-06-22, DG-TX-1 to DG-TX-15 closed)
**Spec (delta)**: `openspec/changes/transactions/specs/transactions/spec.md` (REQ-TX-1 to REQ-TX-15)
**Sibling delta spec**: `openspec/changes/transactions/specs/accounts/spec.md` (REQ-ACC-X1 cross-link)
**Capabilities affected**: `transactions` (new; canonical spec lands at `openspec/specs/transactions/spec.md` on sync), `accounts` (one cross-link delta; no behavior change), `errors` (three new codes), `events` (one new `TransactionRecorded` variant), `ui` (smoke-only)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (inherited from `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4
**Preflight**: interactive · `both` (Engram + OpenSpec files) · `auto-forecast` · 400-line review budget
**Strict TDD**: enabled per `openspec/config.yaml`; runner `pnpm test`; cycle RED → GREEN → TRIANGULATE → REFACTOR

> This document does NOT re-debate the proposal or the spec. It
> implements the spec's "what" with the "how" — module structure,
> domain entity invariants, port and DTO shapes, FX snapshot
> integration, Zod schemas, Prisma model, action layer, Hono routes,
> error code and event additions, logger events, smoke UI,
> per-PR rollout, and the 4 design decisions the spec left open.
> A new contributor can read this and know exactly where every
> spec Requirement lands in the repo.

---

## 1. Summary

`transactions` is the fourth capability to ship after
`auth-foundation`, `accounts-ledger`, and `fx-cache`. It introduces
the **transaction ledger**: manual expense and income registration
(CRUD) scoped to a single `FinancialAccount`, with a multi-currency
display surface that calls the existing `FxRateProvider` port at
write time and **snapshots the converted amount on the row**
(BR-TX-6, DG-TX-3). The change is the first writer of FX data into
the system — every prior module either stored nothing
(`fx-cache` is read-only) or stored native-only (`accounts` stores
`openingBalanceMinor` and never converts it at rest).

Three design decisions are binding and surface here as mechanics:
**hard delete** with no `archivedAt` column (DG-TX-15, BR-TX-7);
**single-account per transaction** in v1 (DG-TX-2, BR-TX-2, with
`TRANSFER` reserved in the enum but rejected at the API); and the
**fxAtWriteTime snapshot** (`fxAsOfSnapshot` + `casaSnapshot` on the
row) so historical totals are deterministic (BR-TX-6, BR-ACC-12
carried).

Cross-module invariants come from `accounts` (the parent
`FinancialAccount` is loaded read-only; BR-TX-5 pre-check rejects
writes against an archived account with `409 ACCOUNT_ARCHIVED`) and
`auth` (every endpoint scopes to `userId` from the session; cross-user
access returns `404 NOT_FOUND`, no information leakage). The
dependency arrow is `transactions → accounts`'s `FxRateProvider` port
and `accounts`'s `AccountRepositoryPort` (read-only access to load the
parent account for the `archivedAt` check + the `casa` lookup), and
`transactions → auth`'s `auth()` helper via the existing Hono
`requireSession` middleware. `transactions` does NOT import from
`src/modules/fx/` (port direction is preserved: `accounts` exports
the port, `fx` implements it, `transactions` consumes it through
`accounts`). The modules-isolated rule (root `AGENTS.md` §10.5)
holds.

---

## 2. Module structure — `src/modules/transactions/` (new)

The `transactions` module follows the `accounts` shape exactly:
`domain/entities/`, `domain/interfaces/`, `domain/services/`,
`application/actions/`, `application/dto/`, `application/validation/`,
`infrastructure/repositories/`, plus a `domain/entities/index.ts`
barrel and the public `index.ts`. The PR-1A code lives in
`src/modules/transactions/`; PR-1B adds three smoke pages under
`app/transactions/`.

### 2.1 Why a new module, not `accounts/application/...`

The proposal §"Alternatives considered" item 7 considered extending
`accounts`. The proposal rejected it and so does this design, on
three grounds:

1. **Future consumers** (`reports`, `snapshots`) will read
   `Transaction` rows and subscribe to `TransactionRecorded`. Putting
   `Transaction` under `accounts/` makes those consumers transitively
   import `accounts`, which violates the modules-isolated rule
   (root `AGENTS.md` §10.5). A new `transactions` module gives
   consumers a clean import path:
   `import { TransactionService, TransactionRepositoryPort } from '@/modules/transactions'`.
2. **`openspec/specs/transactions/spec.md` already exists** in the
   canonical layout (per `openspec/AGENTS.md`); the code lives in the
   matching `src/modules/transactions/` location.
3. **Capability boundary**: the `accounts` capability owns the
   `FinancialAccount` model and the FX port interface; the
   `transactions` capability owns the `Transaction` aggregate, the
   `TransactionRepositoryPort`, the FX-snapshot logic, and the
   `TransactionRecorded` event. Two capabilities, two modules, two
   `openspec/specs/*/spec.md` files. The `transactions` change is the
   first time this capability ships.

### 2.2 File tree

```
src/modules/transactions/
├── domain/
│   ├── entities/
│   │   ├── transaction.ts                # Transaction aggregate + Direction enum.
│   │   │                                  # Fields: id, userId, accountId, direction,
│   │   │                                  # amountMinor, currency, memo, category,
│   │   │                                  # transactionDate, convertedAmountMinor,
│   │   │                                  # convertedCurrency, fxAsOfSnapshot,
│   │   │                                  # casaSnapshot, createdAt, updatedAt.
│   │   │                                  # Invariants: amountMinor > 0, currency ∈
│   │   │                                  # {ARS,USD,EUR}, convertedCurrency = account.casa.
│   │   ├── transaction.test.ts           # Unit tests: factory + invariants.
│   │   └── index.ts                      # Entities barrel.
│   ├── interfaces/
│   │   ├── transaction.repository.port.ts  # Port: list, findById, create, update,
│   │   │                                   # delete. Every method takes userId first.
│   │   └── transaction.repository.port.test.ts  # Contract test: cross-user guard.
│   ├── value-objects/
│   │   ├── direction.ts                  # TransactionDirection const (INCOME|EXPENSE|
│   │   │                                  # TRANSFER) — mirrors Prisma enum uppercase.
│   │   └── direction.test.ts             # Unit tests.
│   └── services/
│       ├── transaction.service.ts        # Pure domain service. Depends on repo,
│       │                                  # Clock, FxRateProvider, AccountRepositoryPort
│       │                                  # (read-only — BR-TX-5 archived check +
│       │                                  # casa resolution BR-FX-3).
│       ├── transaction.service.test.ts   # Unit tests with InMemoryRepository + fake fx.
│       └── fx-snapshot.ts                # Helper: convertAndSnapshot(userId, account,
│                                          # amountMinor, currency, deps) → snapshot fields.
│                                          # Returns { convertedAmountMinor,
│                                          # convertedCurrency, fxAsOfSnapshot,
│                                          # casaSnapshot }. Skips the FX call when
│                                          # currency === casa currency (BR-TX-6).
├── application/
│   ├── actions/
│   │   ├── _shared.ts                    # TransactionActionDeps, ActionResult,
│   │   │                                  # zodErrorToActionError, appErrorToActionError.
│   │   │                                  # Local copy — modules-isolated rule
│   │   │                                  # (root AGENTS.md §10.5).
│   │   ├── list-transactions.action.ts   # Cursor-paginated list.
│   │   ├── get-transaction.action.ts     # Single-row read.
│   │   ├── create-transaction.action.ts  # Create + FX snapshot.
│   │   ├── update-transaction.action.ts  # Partial update; recomputes snapshot iff
│   │   │                                  # amountMinor or currency changed.
│   │   ├── delete-transaction.action.ts  # Hard delete (DG-TX-15).
│   │   └── *.test.ts                     # Per-action test with InMemoryRepository.
│   ├── dto/
│   │   ├── transaction.dto.ts            # TransactionDto wire shape + toTransactionDto.
│   │   └── dto.test.ts                   # Mapping tests.
│   └── validation/
│       ├── transaction-create.schema.ts  # TransactionCreateSchema (Zod discriminatedUnion).
│       ├── transaction-update.schema.ts  # TransactionUpdateSchema (Zod partial).
│       ├── transaction-list.schema.ts    # TransactionListQuerySchema (cursor/limit/accountId).
│       └── *.test.ts                     # Per-schema Zod parse tests.
├── infrastructure/
│   ├── repositories/
│   │   ├── transaction.repository.prisma.ts  # Prisma adapter. Maps P2002 (none in v1).
│   │   └── transaction.repository.prisma.test.ts  # Integration test (real Postgres).
│   └── fixtures/
│       └── in-memory-transaction.repository.ts  # Test fixture: InMemoryTransactionRepository.
├── index.ts                              # Public surface: TransactionService, the
│                                          # Direction + AccountCurrency enums, the
│                                          # TransactionRepositoryPort type, the
│                                          # Transaction aggregate type, the helper
│                                          # TransactionActionDeps interface.
└── spec-scenarios.test.ts                # End-to-end spec scenarios against the service
                                           # + InMemoryRepository + fake FxRateProvider.
```

### 2.3 Cross-module dependency direction

```
            src/modules/transactions/  (new)
            ├─ domain/services/transaction.service.ts
            │       depends on ─→ TransactionRepositoryPort (this module)
            │                       Clock (shared/clock)
            │                       FxRateProvider (accounts/domain/interfaces/fx-rate-provider.port.ts)
            │                       AccountRepositoryPort (accounts/domain/interfaces/account.repository.port.ts)
            │                       (read-only — load parent FinancialAccount for BR-TX-5 + BR-FX-3)
            ├─ application/actions/*-transaction.action.ts
            │       depends on ─→ TransactionService (this module)
            │                       TransactionCreateSchema / UpdateSchema / ListQuerySchema
            ├─ application/validation/transaction-*.schema.ts
            │       imports ─→ AccountCurrency, Direction (this module)
            │                   FX_CASAS / fxCasaStringSchema (NOT imported — domain owns
            │                   the currency enum; fx schema stays in fx module)
            ├─ infrastructure/repositories/transaction.repository.prisma.ts
            │       implements ─→ TransactionRepositoryPort (this module)
            │                       uses asPrismaDelegateView (shared/db/prisma-types.ts)
            └─ index.ts                    (public surface — see §2.4)

src/modules/accounts/                       src/shared/
├── domain/interfaces/account.repository.port.ts  ←── transactions imports (port)
├── domain/interfaces/fx-rate-provider.port.ts     ←── transactions imports (port)
├── domain/entities/financial-account.ts           ←── transactions imports AccountCurrency + AccountFxCasa
├── application/actions/get-account-balance.action.ts  (template for FX casa-resolution call site)
└── infrastructure/repositories/account.repository.prisma.ts
        (NOT imported by transactions — goes through the port)
```

- `transactions` imports `AccountRepositoryPort`, `FxRateProvider`,
  `AccountCurrency`, `AccountFxCasa` from `@/modules/accounts`.
- `transactions` does NOT import from `@/modules/accounts/application/`
  or `@/modules/accounts/infrastructure/`. The two ports above are
  the only seams.
- `transactions` does NOT import from `@/modules/fx/`. The
  `FxRateProvider` port is consumed through `accounts`; the concrete
  `FxRateProviderDolarApi` is wired by the composition root.
- `accounts` does not import from `@/modules/transactions/`. The
  dependency direction is strictly `transactions → accounts`.
- `auth` is reached indirectly through the existing Hono
  `requireSession` middleware at `src/modules/api/app.ts:202` —
  every `transactions` route reads `c.get('user').id` and never
  trusts a body field.

### 2.4 Public barrel — `src/modules/transactions/index.ts`

Mirrors the `accounts` barrel at `src/modules/accounts/index.ts:27-64`
(F-09: infrastructure classes are NOT re-exported; ports are the
contract). The barrel exports:

- `TransactionService` — the domain orchestrator (constructed at
  the composition root with the Prisma repository, the FX provider,
  the AccountRepositoryPrisma for read-only, and `systemClock`).
- `TransactionDirection` — the UPPERCASE enum const
  (`INCOME | EXPENSE | TRANSFER`).
- `AccountCurrency` — re-exported from `@/modules/accounts` (the
  transactions module does NOT re-declare it; the source of truth is
  `financial-account.ts`).
- `Transaction` — the domain aggregate type.
- `TransactionRepositoryPort` — the port type (consumers like the
  future `reports` module import this to read rows).
- `TransactionActionDeps` — the action-layer deps shape (so the
  composition root can build the deps bag uniformly).
- `INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED` —
  string constants for the new error codes (re-exported so test
  fixtures can reference them without reaching into `@/shared/errors`).

The barrel does NOT export:

- `TransactionRepositoryPrisma` (infrastructure adapter).
- `InMemoryTransactionRepository` (test fixture).
- `convertAndSnapshot` (internal helper; not a cross-module contract).
- The Zod schemas (consumers validate at their own boundary; the
  schemas are an internal artifact of the action layer).

---

## 3. Domain model

The `Transaction` aggregate is the single source of truth for the
user's ledger entries. One row per manual entry. Mirrors the Prisma
model one-to-one.

### 3.1 Enum: `TransactionDirection`

```typescript
// src/modules/transactions/domain/value-objects/direction.ts

export const TransactionDirection = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
  TRANSFER: 'TRANSFER', // reserved for v1.1 — rejected at the API in v1
} as const;
export type TransactionDirection = (typeof TransactionDirection)[keyof typeof TransactionDirection];
```

The UPPERCASE form mirrors the Prisma `TransactionDirection` enum
(`prisma/schema.prisma`). The wire form on the Hono API is the same
UPPERCASE string. `TRANSFER` is reserved for v1.1; the Zod schema at
the API boundary rejects it (REQ-TX-3, BR-TX-2).

### 3.2 Aggregate: `Transaction`

```typescript
// src/modules/transactions/domain/entities/transaction.ts

export interface Transaction {
  readonly id: string; // cuid, server-generated
  readonly userId: string; // FK to User.id (auth)
  readonly accountId: string; // FK to FinancialAccount.id (accounts)
  readonly direction: TransactionDirection; // INCOME | EXPENSE (TRANSFER rejected at API)
  readonly amountMinor: number; // Always positive; sign from direction (BR-TX-1)
  readonly currency: AccountCurrency; // ARS | USD | EUR
  readonly memo: string | null; // Optional, ≤ 500 chars (REQ-TX-5, BR-TX-8)
  readonly category: string | null; // Free-form (BR-TX-9, DG-TX-4)
  readonly transactionDate: Date; // NOT in the future (BR-TX-3, REQ-TX-4)
  readonly convertedAmountMinor: number; // Display amount in account.casa currency
  readonly convertedCurrency: AccountCurrency; // Always = account.casa's currency at write
  readonly fxAsOfSnapshot: Date | null; // null iff no FX call (native = casa currency)
  readonly casaSnapshot: AccountFxCasa | null; // null iff no FX call (BR-TX-6)
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
```

### 3.3 Invariants enforced by the entity

- `amountMinor > 0` (BR-TX-1, REQ-TX-2). Non-positive at the API
  boundary throws `AppError(INVALID_AMOUNT)` (400) at the action
  layer; the entity layer also rejects `amountMinor <= 0` in its
  factory for defense in depth.
- `direction ∈ { INCOME, EXPENSE }` in v1 writes (BR-TX-2,
  REQ-TX-3). The entity accepts `TRANSFER` only for read-side rows
  imported from a future v1.1 migration; the action layer rejects it
  before constructing the entity.
- `transactionDate <= Clock.now()` (BR-TX-3, REQ-TX-4). Future date
  at the API boundary throws `AppError(FUTURE_DATE_NOT_ALLOWED)`
  (400). The entity layer checks via the injected `Clock` for the
  read-back assertion.
- `convertedCurrency` always equals the parent
  `FinancialAccount.casa`'s currency at write time. The `fx-snapshot`
  helper in `domain/services/fx-snapshot.ts` enforces this.
- `convertedAmountMinor` is the integer-cents result of applying the
  snapshot rate to `amountMinor` (BR-TX-6, DG-TX-8 half-up at 2
  decimals).
- `fxAsOfSnapshot IS NULL` iff `currency === convertedCurrency`
  (no FX call was issued).
- `casaSnapshot IS NULL` iff `fxAsOfSnapshot IS NULL`.
- Cross-user access returns `null` on miss OR cross-user (BR-TX-4);
  the port's `findById` includes `userId` in the WHERE clause, so
  the application layer cannot accidentally request another user's
  data.
- The row carries no `archivedAt` column (BR-TX-7, DG-TX-15). Hard
  delete is the policy; the list query has no `archivedAt: null`
  filter.

### 3.4 Domain factory

```typescript
// src/modules/transactions/domain/entities/transaction.ts

export interface NewTransactionInput {
  readonly id: string;
  readonly userId: string;
  readonly accountId: string;
  readonly direction: TransactionDirection;
  readonly amountMinor: number;
  readonly currency: AccountCurrency;
  readonly memo: string | null;
  readonly category: string | null;
  readonly transactionDate: Date;
  readonly convertedAmountMinor: number;
  readonly convertedCurrency: AccountCurrency;
  readonly fxAsOfSnapshot: Date | null;
  readonly casaSnapshot: AccountFxCasa | null;
  readonly now: Date; // injected; the entity never calls `new Date()`
}

export function createTransaction(input: NewTransactionInput): Transaction {
  if (input.amountMinor <= 0) {
    throw new AppError({
      code: ErrorCode.INVALID_AMOUNT,
      message: 'El monto debe ser mayor a cero.',
    });
  }
  if (input.direction === TransactionDirection.TRANSFER) {
    throw new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'TRANSFER no está habilitado en v1.',
    });
  }
  if (input.transactionDate.getTime() > input.now.getTime()) {
    throw new AppError({
      code: ErrorCode.FUTURE_DATE_NOT_ALLOWED,
      message: 'La fecha no puede estar en el futuro.',
    });
  }
  if ((input.fxAsOfSnapshot === null) !== (input.casaSnapshot === null)) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'fxAsOfSnapshot and casaSnapshot must both be null or both be set.',
    });
  }
  if (input.fxAsOfSnapshot !== null && input.currency === input.convertedCurrency) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'FX snapshot set but native currency equals casa currency.',
    });
  }
  return {
    id: input.id,
    userId: input.userId,
    accountId: input.accountId,
    direction: input.direction,
    amountMinor: input.amountMinor,
    currency: input.currency,
    memo: input.memo,
    category: input.category,
    transactionDate: input.transactionDate,
    convertedAmountMinor: input.convertedAmountMinor,
    convertedCurrency: input.convertedCurrency,
    fxAsOfSnapshot: input.fxAsOfSnapshot,
    casaSnapshot: input.casaSnapshot,
    createdAt: input.now,
    updatedAt: input.now,
  };
}
```

The factory is the only place the domain layer constructs a new
row. The action layer calls it after the Zod parse and the FX
snapshot. Throwing `AppError` keeps the action-layer catch uniform
(see §8).

---

## 4. Ports and DTOs

### 4.1 `TransactionRepositoryPort`

```typescript
// src/modules/transactions/domain/interfaces/transaction.repository.port.ts

import type { Transaction } from '../entities/transaction';
import type { TransactionDirection, AccountCurrency } from '...';

export interface ListTransactionsOptions {
  readonly cursor?: string;
  readonly limit: number; // 1..100, enforced at the API boundary
  readonly accountId?: string; // filter by account when supplied
}

export interface ListTransactionsPage {
  readonly data: Transaction[];
  readonly nextCursor: string | null;
}

export interface CreateTransactionInput {
  readonly accountId: string;
  readonly direction: TransactionDirection;
  readonly amountMinor: number;
  readonly currency: AccountCurrency;
  readonly memo: string | null;
  readonly category: string | null;
  readonly transactionDate: Date;
  readonly convertedAmountMinor: number;
  readonly convertedCurrency: AccountCurrency;
  readonly fxAsOfSnapshot: Date | null;
  readonly casaSnapshot: AccountFxCasa | null;
}

export interface UpdateTransactionPatch {
  readonly amountMinor?: number;
  readonly currency?: AccountCurrency;
  readonly transactionDate?: Date;
  readonly memo?: string | null;
  readonly category?: string | null;
}

export interface TransactionRepositoryPort {
  /** List the user's transactions, ordered by transactionDate DESC. */
  list(userId: string, opts: ListTransactionsOptions): Promise<ListTransactionsPage>;

  /** Find one transaction by id, scoped to userId. Returns null on
   * miss OR on cross-user access (BR-TX-4). */
  findById(userId: string, id: string): Promise<Transaction | null>;

  /** Insert a new transaction owned by userId. The id, createdAt,
   * updatedAt are server-generated inside the adapter. */
  create(userId: string, input: CreateTransactionInput): Promise<Transaction>;

  /** Partial update of a transaction owned by userId. Returns null
   * on miss or cross-user. The service layer throws AppError. */
  update(userId: string, id: string, patch: UpdateTransactionPatch): Promise<Transaction | null>;

  /** Hard-delete (DG-TX-15). Returns true iff a row was removed;
   * false on miss or cross-user. Idempotency: a second delete on the
   * same id returns false (the row is already gone). */
  delete(userId: string, id: string): Promise<boolean>;
}
```

Mirrors `AccountRepositoryPort` at
`src/modules/accounts/domain/interfaces/account.repository.port.ts:117-155`
exactly: every method takes `userId` first and includes it in the
WHERE clause. The cross-module invariant from `auth/spec.md:644-647`
("every other module's `WHERE userId = ?` query MUST scope to the
caller") is enforced at the type signature.

The `delete` method returns `boolean` (not `Transaction | null` as
in `accounts`) because v1 hard-deletes — there is no post-state to
return. The action layer maps `true` to `204` and `false` to
`404 NOT_FOUND`.

### 4.2 `TransactionDTO` and `toTransactionDto`

```typescript
// src/modules/transactions/application/dto/transaction.dto.ts

export interface TransactionDto {
  readonly id: string;
  readonly userId: string;
  readonly accountId: string;
  readonly direction: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly memo: string | null;
  readonly category: string | null;
  readonly transactionDate: string; // ISO 8601
  readonly convertedAmountMinor: number;
  readonly convertedCurrency: string;
  readonly fxAsOfSnapshot: string | null; // ISO 8601 or null
  readonly casaSnapshot: string | null; // lowercase DolarAPI form or null
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function toTransactionDto(row: Transaction): TransactionDto {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    direction: row.direction,
    amountMinor: row.amountMinor,
    currency: row.currency,
    memo: row.memo,
    category: row.category,
    transactionDate: row.transactionDate.toISOString(),
    convertedAmountMinor: row.convertedAmountMinor,
    convertedCurrency: row.convertedCurrency,
    fxAsOfSnapshot: row.fxAsOfSnapshot ? row.fxAsOfSnapshot.toISOString() : null,
    casaSnapshot: row.casaSnapshot ? CASA_TO_LOWERCASE[row.casaSnapshot] : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
```

The `casaSnapshot` DTO field carries the lowercase DolarAPI wire
form (matching the pattern at
`src/modules/accounts/application/dto/financial-account.dto.ts:27-34`).
Date fields are ISO 8601 strings.

### 4.3 `TransactionActionDeps`

```typescript
// src/modules/transactions/application/actions/_shared.ts

import type { TransactionService } from '../../domain/services/transaction.service';
import type { FxRateProvider, AccountRepositoryPort } from '@/modules/accounts';

export interface TransactionActionDeps {
  transactionService: TransactionService;
  // The action layer reads the parent FinancialAccount through the
  // port (BR-TX-5 archived check + BR-FX-3 casa resolution).
  // Transactions never reaches into accounts/infrastructure.
  accountRepository: AccountRepositoryPort;
  // The FX provider is consumed by the service (not the action).
  // Action reads userId from the Hono context and forwards.
  fxRateProvider: FxRateProvider;
}
```

The shape mirrors `AccountActionDeps` at
`src/modules/accounts/application/actions/_shared.ts:22-24` but adds
`accountRepository` because the transactions service needs to load
the parent account for the BR-TX-5 archived check. The
`fxRateProvider` is included in the deps bag because the service is
constructed once at startup (composition root); the action layer
does NOT call the FX provider directly.

---

## 5. FX integration

The `TransactionService` calls `FxRateProvider.getDisplayAmount(...)`
at write time, once per row, and persists the result. This section
pins the exact call site and the snapshot semantics.

### 5.1 The `convertAndSnapshot` helper

```typescript
// src/modules/transactions/domain/services/fx-snapshot.ts

import type {
  FxConversionRequest,
  FxConversionResult,
  FxRateProvider,
  FxCasaString,
} from '@/modules/accounts';
import type { AccountCurrency, AccountFxCasa } from '@/modules/accounts';
import type { TransactionDirection } from '../value-objects/direction';
import { TransactionDirection as Dir } from '../value-objects/direction';

export interface FxSnapshotInput {
  readonly direction: TransactionDirection;
  readonly amountMinor: number;
  readonly currency: AccountCurrency;
  readonly account: { readonly currency: AccountCurrency; readonly casa: AccountFxCasa | null };
  readonly fxRateProvider: FxRateProvider;
  readonly defaultCasa: FxCasaString; // resolved at startup from env.FX_DEFAULT_CASA
  readonly now: Date;
}

export interface FxSnapshot {
  readonly convertedAmountMinor: number;
  readonly convertedCurrency: AccountCurrency;
  readonly fxAsOfSnapshot: Date | null;
  readonly casaSnapshot: AccountFxCasa | null;
}

const CASA_TO_LOWERCASE: Record<AccountFxCasa, FxCasaString> = {
  OFICIAL: 'oficial',
  BLUE: 'blue',
  MEP: 'mep',
  CCL: 'ccl',
  CRIPTO: 'cripto',
  TARJETA: 'tarjeta',
};
const LOWERCASE_TO_CASA: Record<FxCasaString, AccountFxCasa> = {
  oficial: 'OFICIAL',
  blue: 'BLUE',
  mep: 'MEP',
  ccl: 'CCL',
  cripto: 'CRIPTO',
  tarjeta: 'TARJETA',
};

export async function convertAndSnapshot(input: FxSnapshotInput): Promise<FxSnapshot> {
  // Resolve casa (BR-FX-3 — caller resolves, provider doesn't).
  const casaUpper = input.account.casa ?? LOWERCASE_TO_CASA[input.defaultCasa];
  const casaLower = CASA_TO_LOWERCASE[casaUpper];

  // BR-TX-6: skip the FX call when native currency == casa currency.
  if (input.currency === casaCurrencyFor(casaLower)) {
    return {
      convertedAmountMinor: input.amountMinor,
      convertedCurrency: input.currency,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    };
  }

  const req: FxConversionRequest = {
    native: { amount: input.amountMinor, currency: input.currency },
    displayCurrency: casaCurrencyFor(casaLower),
    asOf: input.now,
    casa: casaLower,
  };
  const result: FxConversionResult = await input.fxRateProvider.getDisplayAmount(req);
  return {
    convertedAmountMinor: result.display.amount,
    convertedCurrency: result.display.currency,
    fxAsOfSnapshot: result.display.fxAsOf,
    casaSnapshot: casaUpper,
  };
}

function casaCurrencyFor(casa: FxCasaString): AccountCurrency {
  // All DolarAPI-supported casas are ARS↔USD in v1.
  // EUR support is the v1.1 follow-up.
  return 'ARS';
}
```

Mirrors the casa-resolution rule at
`src/modules/accounts/application/actions/get-account-balance.action.ts:67-100`
(REQ-FX-3) and the `FxConversionRequest` shape at
`src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts:55-71`.

### 5.2 Snapshot semantics

- **Skip path (BR-TX-6):** when `transaction.currency === casa
currency`, `convertedAmountMinor = amountMinor`,
  `convertedCurrency = transaction.currency`,
  `fxAsOfSnapshot = null`, `casaSnapshot = null`. No call to
  `FxRateProvider` is issued; the helper short-circuits before the
  `await`.
- **Call path:** when currencies differ, the helper issues exactly
  one `FxRateProvider.getDisplayAmount(req)` call. The provider's
  cache + stampede-lock handle concurrency; stale is allowed
  (BR-ACC-13 carried). The helper persists `display.fxAsOf` as
  `fxAsOfSnapshot` even when stale.
- **Half-up rounding (DG-TX-8):** the FX provider's existing
  `(amount / 100) * fxRate` arithmetic is the convention. The
  helper returns `result.display.amount` as an integer-cents value;
  no on-read rounding is needed because the DTO carries the integer.
- **Casa resolution (BR-FX-3):** the helper resolves
  `account.casa ?? env.FX_DEFAULT_CASA` (the env value is passed
  through the action deps from the composition root; the helper does
  not read env). The lowercase DolarAPI form is computed at the
  boundary; the snapshot persists the UPPERCASE `AccountFxCasa`
  form (matches the Prisma column).

### 5.3 Cache-stale tolerance

The `FxRateProviderDolarApi` (see
`src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.ts`)
returns `{ ..., stale: boolean, fxAsOf: Date }` per
`src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts:73-88`.
The helper ignores `stale`; the snapshot timestamp `fxAsOf` is the
provider's source timestamp regardless of staleness (BR-ACC-13).
The `transactions.fx.convert` log event (§11) captures the
`stale: boolean` for observability; the wire response does not.

### 5.4 Native=casa skip path coverage

REQ-TX-12 Scenario "ARS write against an ARS casa skips the FX call"
asserts that when the parent account is ARS and the transaction is
ARS, no call to `FxRateProvider` is issued. The test in
`src/modules/transactions/spec-scenarios.test.ts` asserts this with a
spy `FxRateProvider` whose `getDisplayAmount` throws if called — the
test passes only if the helper short-circuits.

---

## 6. Validation (Zod)

Three Zod schemas cover the three write/query surfaces. Each field
constraint is traced to a spec REQ. The `strict()` modifier is used
to reject unknown keys at the boundary (a `closed` form, matching
`account-create.schema.ts`).

### 6.1 `TransactionCreateSchema`

```typescript
// src/modules/transactions/application/validation/transaction-create.schema.ts

import { z } from 'zod';
import { AccountCurrency } from '@/modules/accounts';
import { TransactionDirection } from '../../domain/value-objects/direction';

const accountCurrencySchema = z.enum([
  AccountCurrency.ARS,
  AccountCurrency.USD,
  AccountCurrency.EUR,
]);

export const transactionCreateSchema = z
  .object({
    // REQ-TX-3: TRANSFER is rejected at the boundary.
    direction: z.enum([TransactionDirection.INCOME, TransactionDirection.EXPENSE], {
      errorMap: () => ({ message: 'TRANSFER is reserved for v1.1.' }),
    }),
    // REQ-TX-2: amountMinor strictly positive.
    amountMinor: z.number().int().positive(),
    currency: accountCurrencySchema,
    accountId: z.string().min(1).max(64),
    // REQ-TX-4: transactionDate in the past or today. The Clock
    // comparison lives in the service layer (the Zod parse cannot
    // depend on Clock); the schema accepts any date and the
    // service throws FUTURE_DATE_NOT_ALLOWED.
    transactionDate: z.coerce.date(),
    // REQ-TX-5: memo optional, ≤ 500 chars.
    memo: z.string().max(500).nullable().optional(),
    // BR-TX-9: category is free-form.
    category: z.string().max(80).nullable().optional(),
  })
  .strict();

export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;
```

Why no discriminatedUnion on `direction` (yet): the v1 surface is
flat. The proposal §DG-TX-12 leaves room for per-direction rules in
v1.1 (e.g. INCOME might allow `null` currency in a future
refund flow); the schema is open to that evolution without a
breaking change.

### 6.2 `TransactionUpdateSchema`

```typescript
// src/modules/transactions/application/validation/transaction-update.schema.ts

export const transactionUpdateSchema = z
  .object({
    amountMinor: z.number().int().positive().optional(),
    currency: accountCurrencySchema.optional(),
    transactionDate: z.coerce.date().optional(),
    memo: z.string().max(500).nullable().optional(),
    category: z.string().max(80).nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field must be supplied.' });

export type TransactionUpdateInput = z.infer<typeof transactionUpdateSchema>;
```

REQ-TX-10: partial body. The `.refine` ensures an empty body is
rejected as `400 VALIDATION_ERROR` rather than a silent no-op. The
`accountId` is NOT updatable in v1 (changing the parent account
would re-trigger the BR-TX-5 archived check + the FX snapshot; that
flow is a v1.1 follow-up if needed — a future `transfer` migration
absorbs it).

### 6.3 `TransactionListQuerySchema`

```typescript
// src/modules/transactions/application/validation/transaction-list.schema.ts

export const transactionListSchema = z
  .object({
    cursor: z.string().min(1).optional(),
    // BR-TX-10: 1..100, default 20.
    limit: z.coerce.number().int().min(1).max(100).default(20),
    accountId: z.string().min(1).max(64).optional(),
  })
  .strict();

export type TransactionListQuery = z.infer<typeof transactionListSchema>;
```

REQ-TX-8: cursor + limit + optional `accountId`. The schema matches
`listAccountsSchema` at
`src/modules/accounts/application/validation/list-accounts.schema.ts:23-29`
exactly; the smoke UI reuses the same pagination footer.

---

## 7. Persistence (Prisma)

The Prisma migration is the only persistent schema change in this
change. It is **additive** per REQ-FX-9 (the `fx-cache` precedent at
`openspec/specs/fx/spec.md:474-484`); existing `FinancialAccount` and
`User` rows are unchanged.

### 7.1 New enum: `TransactionDirection`

```prisma
// prisma/schema.prisma (append after the AccountFxCasa enum)

// transactions (PR-1A) — Transaction aggregate.
// Direction carries the sign (BR-TX-1); TRANSFER is reserved for
// v1.1 and rejected at the API boundary (BR-TX-2, REQ-TX-3).
// See: openspec/changes/transactions/design.md §7.
enum TransactionDirection {
  INCOME
  EXPENSE
  TRANSFER
}
```

### 7.2 New model: `Transaction`

```prisma
// prisma/schema.prisma (append after the FinancialAccount model)

model Transaction {
  id                   String              @id @default(cuid())
  userId               String
  accountId            String
  direction            TransactionDirection
  // BR-TX-1: always positive; sign from direction.
  amountMinor          Int
  currency             AccountCurrency
  // REQ-TX-5: optional, max 500 chars.
  memo                 String?
  // BR-TX-9: free-form string; no TransactionCategory table in v1.
  category             String?
  // REQ-TX-4: not in the future relative to Clock.now().
  transactionDate      DateTime
  // BR-TX-6: snapshotted at write time. Always populated.
  convertedAmountMinor Int
  convertedCurrency    AccountCurrency
  // BR-TX-6: null iff native currency == casa currency (no FX call).
  fxAsOfSnapshot       DateTime?
  // BR-TX-6: UPPERCASE AccountFxCasa or null.
  casaSnapshot         AccountFxCasa?
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt

  // FKs: onDelete: Cascade mirrors FinancialAccount.userId → User.id.
  user    User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  account FinancialAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)

  // List query: cursor pagination + per-account filter.
  @@index([userId, transactionDate])
  @@index([accountId, transactionDate])
}
```

Two indexes (REQ-TX-1, DG-TX-14):

- `@@index([userId, transactionDate])` — the default list endpoint
  (every transaction list is scoped to the caller's userId and
  ordered by `transactionDate` DESC).
- `@@index([accountId, transactionDate])` — the per-account filter
  path (`?accountId=...`).

The `User` and `FinancialAccount` relations require a back-reference
on the parent models. The `User` model already has
`financialAccounts FinancialAccount[]` at line 36; we add
`transactions Transaction[]` to `User` and a new
`transactions Transaction[]` to `FinancialAccount`.

### 7.3 Back-reference additions

```prisma
// prisma/schema.prisma — User model additions
model User {
  // ... existing fields unchanged ...
  financialAccounts FinancialAccount[]
  transactions      Transaction[]    // NEW (transactions PR-1A)
  // ... rest unchanged ...
}

// prisma/schema.prisma — FinancialAccount model additions
model FinancialAccount {
  // ... existing fields unchanged ...
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions Transaction[]  // NEW (transactions PR-1A)
  // ... rest unchanged ...
}
```

These are additive; no existing column changes. The `User` and
`FinancialAccount` schemas compile unchanged for callers (the new
relation is purely additive).

### 7.4 Migration SQL

Generated by `pnpm prisma migrate dev --name add_transaction`:

```sql
-- non-destructive; additive; no backfill; no row rewrite
-- Generated by pnpm prisma migrate dev --name add_transaction
CREATE TYPE "TransactionDirection" AS ENUM
  ('INCOME', 'EXPENSE', 'TRANSFER');

CREATE TABLE "Transaction" (
  "id"                    TEXT PRIMARY KEY,
  "userId"                TEXT NOT NULL,
  "accountId"             TEXT NOT NULL,
  "direction"             "TransactionDirection" NOT NULL,
  "amountMinor"           INTEGER NOT CHECK ("amountMinor" > 0),
  "currency"              "AccountCurrency" NOT NULL,
  "memo"                  TEXT,
  "category"              TEXT,
  "transactionDate"       TIMESTAMP NOT NULL,
  "convertedAmountMinor"  INTEGER NOT NULL,
  "convertedCurrency"     "AccountCurrency" NOT NULL,
  "fxAsOfSnapshot"        TIMESTAMP,
  "casaSnapshot"          "AccountFxCasa",
  "createdAt"             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP NOT NULL,
  CONSTRAINT "Transaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "Transaction_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE
);

CREATE INDEX "Transaction_userId_transactionDate_idx"
  ON "Transaction" ("userId", "transactionDate");
CREATE INDEX "Transaction_accountId_transactionDate_idx"
  ON "Transaction" ("accountId", "transactionDate");
```

The migration gate (per REQ-TX-1 + the proposal §"Acceptance criteria"
item 10): `SELECT count(*) FROM "FinancialAccount"` before and after
the migration returns the same value. The `User` and
`FinancialAccount` schemas are byte-identical apart from the additive
back-references.

### 7.5 Migration name + lockfile discipline

- Migration directory: `prisma/migrations/<ts>_add_transaction/`.
  The CI timestamp format is `YYYYMMDDHHMMSS` (matches the existing
  `20260622010704_add_account_fx_casa` precedent).
- No `package.json` change; the `pnpm-lock.yaml` is unchanged.
  Husky pre-commit lockfile check is informational (passes because
  no `package.json` is staged).

---

## 8. Application layer (Actions)

Five actions, one per operation, mirroring the `accounts` shape at
`src/modules/accounts/application/actions/`. The local `_shared.ts`
file is a verbatim copy of the accounts helper (modules-isolated
rule, root `AGENTS.md` §10.5 — each module owns its own helpers).

### 8.1 `listTransactionsAction`

```typescript
// src/modules/transactions/application/actions/list-transactions.action.ts

import type { ActionResult } from './_shared';
import type { Transaction } from '../../domain/entities/transaction';
import { transactionListSchema } from '../validation/transaction-list.schema';
import { zodErrorToActionError } from './_shared';
import { logger } from '@/shared/logger/logger';

export type ListTransactionsData = {
  data: Transaction[];
  nextCursor: string | null;
};

export async function listTransactionsAction(
  deps: TransactionActionDeps,
  userId: string,
  rawQuery: unknown,
): Promise<ActionResult<ListTransactionsData>> {
  const parsed = transactionListSchema.safeParse(rawQuery ?? {});
  if (!parsed.success) return zodErrorToActionError(parsed.error);
  const opts = {
    limit: parsed.data.limit,
    ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
    ...(parsed.data.accountId !== undefined ? { accountId: parsed.data.accountId } : {}),
  };
  const page = await deps.transactionService.list(userId, opts);
  return { ok: true, data: { data: page.data, nextCursor: page.nextCursor } };
}
```

REQ-TX-8. Mirrors `list-accounts.action.ts:30-74` exactly; the `count`
companion query is omitted in v1 (the smoke UI's "Showing first N of
M" footer is an accounts-only concern; transactions list footer is
just "next page" when `nextCursor` is non-null). The optional
`accountId` filter is passed through to the service, which passes it
to the repository WHERE clause.

### 8.2 `getTransactionAction`

```typescript
// src/modules/transactions/application/actions/get-transaction.action.ts

export async function getTransactionAction(
  deps: TransactionActionDeps,
  userId: string,
  id: string,
): Promise<ActionResult<Transaction>> {
  try {
    const row = await deps.transactionService.getById(userId, id);
    return { ok: true, data: row };
  } catch (err) {
    if (err instanceof AppError) return appErrorToActionError(err);
    throw err;
  }
}
```

REQ-TX-6 Scenario "cross-user read returns 404": the service throws
`AppError(NOT_FOUND)` on miss or cross-user; the action maps to
`404 NOT_FOUND`.

### 8.3 `createTransactionAction`

```typescript
// src/modules/transactions/application/actions/create-transaction.action.ts

export async function createTransactionAction(
  deps: TransactionActionDeps,
  userId: string,
  rawBody: unknown,
): Promise<ActionResult<Transaction>> {
  const parsed = transactionCreateSchema.safeParse(rawBody);
  if (!parsed.success) return zodErrorToActionError(parsed.error);
  try {
    const row = await deps.transactionService.create(userId, {
      accountId: parsed.data.accountId,
      direction: parsed.data.direction,
      amountMinor: parsed.data.amountMinor,
      currency: parsed.data.currency,
      memo: parsed.data.memo ?? null,
      category: parsed.data.category ?? null,
      transactionDate: parsed.data.transactionDate,
    });
    return { ok: true, data: row };
  } catch (err) {
    if (err instanceof AppError) return appErrorToActionError(err);
    throw err;
  }
}
```

The service is the only place that:

- Loads the parent `FinancialAccount` via `deps.accountRepository.findById(userId, accountId)`.
- Throws `ACCOUNT_ARCHIVED` (409) if `account.archivedAt !== null`.
- Resolves `account.casa ?? env.FX_DEFAULT_CASA` (BR-FX-3).
- Calls `convertAndSnapshot` (§5.1) to produce the snapshot fields.
- Persists the row via the repository.
- Emits `transactions.create` and (conditional) `transactions.fx.convert`.
- Dispatches `TransactionRecorded` via the central event dispatcher.

The service throws `AppError(INVALID_AMOUNT)` or
`AppError(FUTURE_DATE_NOT_ALLOWED)` before calling the FX provider if
the Zod-validated payload still has invariant violations (defense in
depth — the Zod parse is the primary gate, the entity factory is the
secondary).

### 8.4 `updateTransactionAction`

```typescript
// src/modules/transactions/application/actions/update-transaction.action.ts

export async function updateTransactionAction(
  deps: TransactionActionDeps,
  userId: string,
  id: string,
  rawBody: unknown,
): Promise<ActionResult<Transaction>> {
  const parsed = transactionUpdateSchema.safeParse(rawBody);
  if (!parsed.success) return zodErrorToActionError(parsed.error);
  try {
    const row = await deps.transactionService.update(userId, id, {
      amountMinor: parsed.data.amountMinor,
      currency: parsed.data.currency,
      transactionDate: parsed.data.transactionDate,
      memo: parsed.data.memo,
      category: parsed.data.category,
    });
    return { ok: true, data: row };
  } catch (err) {
    if (err instanceof AppError) return appErrorToActionError(err);
    throw err;
  }
}
```

REQ-TX-10: the service recomputes the FX snapshot **only if**
`amountMinor` or `currency` changed (the service detects via a
`fieldsChanged` flag). Editing `memo`, `category`, or
`transactionDate` preserves the existing `fxAsOfSnapshot` and
`casaSnapshot`. Editing `transactionDate` to a future date throws
`FUTURE_DATE_NOT_ALLOWED` (BR-TX-3); the check is repeated in the
update path.

### 8.5 `deleteTransactionAction`

```typescript
// src/modules/transactions/application/actions/delete-transaction.action.ts

export async function deleteTransactionAction(
  deps: TransactionActionDeps,
  userId: string,
  id: string,
): Promise<ActionResult<{ deleted: true }>> {
  try {
    const ok = await deps.transactionService.delete(userId, id);
    if (!ok) {
      return {
        ok: false,
        status: 404,
        error: {
          code: 'NOT_FOUND',
          message: 'Transacción no encontrada.',
        },
      };
    }
    return { ok: true, data: { deleted: true } };
  } catch (err) {
    if (err instanceof AppError) return appErrorToActionError(err);
    throw err;
  }
}
```

REQ-TX-11 + DG-TX-15: hard delete. The service returns `false` on
miss or cross-user; the action maps to `404 NOT_FOUND`. On success,
the action returns `204` at the route layer.

### 8.6 Session / permission check

Every action accepts `userId` as a parameter; the route layer reads
`c.get('user').id` from the Hono context (after `requireSession`
narrows the type to `AuthUser`). The actions NEVER trust a `userId`
in the request body. This is the cross-module invariant from
`openspec/specs/auth/spec.md:644-647`.

---

## 9. HTTP routes (Hono)

Six routes under `/api/transactions` mounted on the existing
`protectedApp` (the protected sub-app at
`src/modules/api/app.ts:192-312`). The pattern mirrors the seven
`accounts` routes at `src/modules/api/app.ts:222-306`; the action +
dto shape is identical.

### 9.1 Route table

| Method   | Path                                   | Action                                      | Validator                                             | Response (success)                                       | Error codes                                                                                                                                          |
| -------- | -------------------------------------- | ------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/transactions`                    | `listTransactionsAction`                    | `transactionListSchema`                               | `{ data: TransactionDto[], nextCursor: string \| null }` | `400 VALIDATION_ERROR`                                                                                                                               |
| `POST`   | `/api/transactions`                    | `createTransactionAction`                   | `transactionCreateSchema`                             | `{ data: TransactionDto }` (201)                         | `400 VALIDATION_ERROR`, `400 INVALID_AMOUNT`, `400 FUTURE_DATE_NOT_ALLOWED`, `404 NOT_FOUND` (account), `409 ACCOUNT_ARCHIVED`, `503 FX_UNAVAILABLE` |
| `GET`    | `/api/transactions/:id`                | `getTransactionAction`                      | (none)                                                | `{ data: TransactionDto }` (200)                         | `404 NOT_FOUND`                                                                                                                                      |
| `PATCH`  | `/api/transactions/:id`                | `updateTransactionAction`                   | `transactionUpdateSchema`                             | `{ data: TransactionDto }` (200)                         | `400 VALIDATION_ERROR`, `400 INVALID_AMOUNT`, `400 FUTURE_DATE_NOT_ALLOWED`, `404 NOT_FOUND`, `503 FX_UNAVAILABLE`                                   |
| `DELETE` | `/api/transactions/:id`                | `deleteTransactionAction`                   | (none)                                                | empty (204)                                              | `404 NOT_FOUND`                                                                                                                                      |
| `GET`    | `/api/transactions/account/:accountId` | `listTransactionsAction` (with `accountId`) | `transactionListSchema` (with `accountId` pre-filled) | `{ data: TransactionDto[], nextCursor: string \| null }` | `400 VALIDATION_ERROR`                                                                                                                               |

### 9.2 Mount site

The six routes mount between line 306 and line 312 of
`src/modules/api/app.ts`, after the seven accounts routes and before
the `app.route('/', protectedApp)` line. The Hono middleware
ordering — `requireSession` first, then routes — is preserved (the
session gate is already registered on `protectedApp.use('*',
requireSession)` at line 202).

### 9.3 Handler shape (one example)

```typescript
// src/modules/api/app.ts — additions after line 306, before line 312

const transactionDeps = {
  transactionService: deps.transactionService,
  accountRepository: deps.accountRepository,
  fxRateProvider: deps.fxRateProvider,
};

// 1. List
protectedApp.get('/api/transactions', async (c) => {
  const user = c.get('user');
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const res = await listTransactionsAction(transactionDeps, user.id, query);
  if (res.ok) {
    return c.json(
      { data: res.data.data.map(toTransactionDto), nextCursor: res.data.nextCursor },
      200,
    );
  }
  return c.json({ error: res.error }, res.status as 400);
});

// 2. Create
protectedApp.post('/api/transactions', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  const res = await createTransactionAction(transactionDeps, user.id, body);
  if (res.ok) {
    return c.json({ data: toTransactionDto(res.data) }, 201);
  }
  return c.json({ error: res.error }, res.status as 400 | 404 | 409 | 503);
});

// 3. Get one
protectedApp.get('/api/transactions/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const res = await getTransactionAction(transactionDeps, user.id, id);
  if (res.ok) {
    return c.json({ data: toTransactionDto(res.data) }, 200);
  }
  return c.json({ error: res.error }, res.status as 404);
});

// 4. Patch
protectedApp.patch('/api/transactions/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const res = await updateTransactionAction(transactionDeps, user.id, id, body);
  if (res.ok) {
    return c.json({ data: toTransactionDto(res.data) }, 200);
  }
  return c.json({ error: res.error }, res.status as 400 | 404 | 503);
});

// 5. Delete
protectedApp.delete('/api/transactions/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const res = await deleteTransactionAction(transactionDeps, user.id, id);
  if (res.ok) {
    return c.body(null, 204);
  }
  return c.json({ error: res.error }, res.status as 404);
});

// 6. Filtered list by account
protectedApp.get('/api/transactions/account/:accountId', async (c) => {
  const user = c.get('user');
  const accountId = c.req.param('accountId');
  const query = { ...Object.fromEntries(new URL(c.req.url).searchParams), accountId };
  const res = await listTransactionsAction(transactionDeps, user.id, query);
  if (res.ok) {
    return c.json(
      { data: res.data.data.map(toTransactionDto), nextCursor: res.data.nextCursor },
      200,
    );
  }
  return c.json({ error: res.error }, res.status as 400);
});
```

### 9.4 Route tests

`src/modules/api/app.transactions.test.ts` mirrors
`app.accounts.test.ts`. Six `it()` blocks per route, each against
the in-memory fakes (InMemoryTransactionRepository +
InMemoryAccountRepository + fake FxRateProvider). Coverage includes:

- 401 on every endpoint when no session.
- 200 + correct shape on valid requests.
- 400 + `INVALID_AMOUNT` on `amountMinor <= 0`.
- 400 + `VALIDATION_ERROR` on `direction: TRANSFER`.
- 400 + `FUTURE_DATE_NOT_ALLOWED` on future `transactionDate`.
- 404 on cross-user reads.
- 409 + `ACCOUNT_ARCHIVED` on writes against an archived parent account.
- 204 on delete; follow-up GET returns 404.

---

## 10. Error code additions

Three new codes added to
`src/shared/errors/error-codes.ts:12-43` and the matching
`ErrorStatus` map at lines 52-66. The diff is additive; existing
codes keep their status and value.

### 10.1 The diff

```typescript
// src/shared/errors/error-codes.ts — additions

export const ErrorCode = {
  // ... existing codes unchanged ...
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  WEAK_PASSWORD: 'WEAK_PASSWORD',

  // ... existing codes unchanged ...
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHORIZED: 'UNAUTHORIZED',

  // --- transactions (PR-1A) — NEW ---
  INVALID_AMOUNT: 'INVALID_AMOUNT', // 400: amountMinor <= 0 or non-finite
  FUTURE_DATE_NOT_ALLOWED: 'FUTURE_DATE_NOT_ALLOWED', // 400: transactionDate > Clock.now()
  ACCOUNT_ARCHIVED: 'ACCOUNT_ARCHIVED', // 409: parent FinancialAccount is archived

  // --- Authz (403) ---
  FORBIDDEN: 'FORBIDDEN',

  // ... existing codes unchanged ...
} as const;

export const ErrorStatus: Record<ErrorCode, number> = {
  // ... existing entries unchanged ...
  VALIDATION_ERROR: 400,
  WEAK_PASSWORD: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHORIZED: 401,
  INVALID_AMOUNT: 400, // NEW
  FUTURE_DATE_NOT_ALLOWED: 400, // NEW
  ACCOUNT_ARCHIVED: 409, // NEW
  FORBIDDEN: 403,
  // ... existing entries unchanged ...
};
```

### 10.2 Error table (binding)

| Code                      | HTTP | Trigger                                                                           | Caller surface                                                       |
| ------------------------- | ---- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `INVALID_AMOUNT`          | 400  | `amountMinor <= 0`, negative after sign-from-direction derivation, or non-finite. | Inline error banner on `POST /api/transactions`.                     |
| `FUTURE_DATE_NOT_ALLOWED` | 400  | `transactionDate > Clock.now()`.                                                  | Inline error banner on `POST /api/transactions`.                     |
| `ACCOUNT_ARCHIVED`        | 409  | Parent `FinancialAccount.archivedAt` is non-null at write time.                   | Inline error banner on `POST /api/transactions`.                     |
| `VALIDATION_ERROR`        | 400  | Any other schema failure (e.g. `direction = TRANSFER`, `memo > 500 chars`).       | Inline error banner; first message from `details`.                   |
| `UNAUTHORIZED`            | 401  | No session, missing cookie, expired session (per `auth/spec.md`).                 | 307 redirect for App Router pages; 401 JSON for Hono.                |
| `NOT_FOUND`               | 404  | Cross-user or non-existent `id`.                                                  | `redirect('/transactions')` for the detail page (BR-ACC-19 pattern). |

No new HTTP statuses. No existing code changes status.

---

## 11. Event additions

One new event variant added to the `DomainEvent` union at
`src/shared/events/event-dispatcher.ts:3-5`. The diff is additive;
existing variants keep their payload shape.

### 11.1 The diff

```typescript
// src/shared/events/event-dispatcher.ts — additions

export type DomainEvent =
  | { type: 'UserRegistered'; payload: UserRegisteredPayload }
  | { type: 'UserSignedIn'; payload: UserSignedInPayload }
  | { type: 'TransactionRecorded'; payload: TransactionRecordedPayload };

export interface TransactionRecordedPayload {
  userId: string;
  transactionId: string;
  accountId: string;
  direction: 'INCOME' | 'EXPENSE';
  amountMinor: number;
  currency: 'ARS' | 'USD' | 'EUR';
  casa: 'OFICIAL' | 'BLUE' | 'MEP' | 'CCL' | 'CRIPTO' | 'TARJETA' | null;
  convertedAmountMinor: number;
  convertedCurrency: 'ARS' | 'USD' | 'EUR';
  occurredAt: string; // ISO 8601
}

export const TransactionRecorded = 'TransactionRecorded' as const;
```

REQ-TX-13: the event is dispatched once per successful create. No
subscriber ships in v1; the union membership is the contract
(`reports` and `snapshots` can subscribe in a future change without
an interface edit).

### 11.2 Dispatch point

```typescript
// src/modules/transactions/domain/services/transaction.service.ts (excerpt)

const row = await this.repo.create(userId, snapshotInput);
const nowIso = this.clock.now().toISOString();

logger.info('transactions.create', {
  userId,
  accountId: row.accountId,
  direction: row.direction,
  amountMinor: row.amountMinor,
  currency: row.currency,
  casa: row.casaSnapshot,
  fxAsOf: row.fxAsOfSnapshot?.toISOString() ?? null,
});

if (row.fxAsOfSnapshot !== null) {
  logger.info('transactions.fx.convert', {
    userId,
    casa: row.casaSnapshot,
    native: { amountMinor: row.amountMinor, currency: row.currency },
    display: { amountMinor: row.convertedAmountMinor, currency: row.convertedCurrency },
    fxAsOf: row.fxAsOfSnapshot.toISOString(),
    stale: false, // the provider's stale flag is dropped at this layer; surface in a future change
  });
}

await this.dispatcher.dispatch({
  type: 'TransactionRecorded',
  payload: {
    userId,
    transactionId: row.id,
    accountId: row.accountId,
    direction: row.direction,
    amountMinor: row.amountMinor,
    currency: row.currency,
    casa: row.casaSnapshot,
    convertedAmountMinor: row.convertedAmountMinor,
    convertedCurrency: row.convertedCurrency,
    occurredAt: nowIso,
  },
});

return row;
```

The dispatcher is injected via the service constructor (the
composition root wires the same singleton as `accounts`).

---

## 12. Logger additions

Four new structured log event names, plus a denylist extension to
drop `memo` content (BR-TX-8, PII hygiene).

### 12.1 Event table

| Event                     | When                                                        | Fields                                                              |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `transactions.create`     | After a successful create                                   | `userId, accountId, direction, amountMinor, currency, casa, fxAsOf` |
| `transactions.update`     | After a successful update                                   | `userId, id, fieldsChanged[], fxRecomputed: boolean`                |
| `transactions.delete`     | After a successful hard delete                              | `userId, id`                                                        |
| `transactions.fx.convert` | Only when an FX call was issued (currency != casa currency) | `userId, casa, native, display, fxAsOf, stale`                      |

Field names match the spec observability table at
`openspec/changes/transactions/specs/transactions/spec.md` §REQ-TX-14.
Transport is the existing project logger at
`src/shared/logger/logger.ts:101-106`.

### 12.2 Logger denylist extension

```typescript
// src/shared/logger/logger.ts — addition to denylistKeys

export const denylistKeys: readonly string[] = [
  'password',
  'passwordHash',
  'sessionToken',
  'access_token',
  'refresh_token',
  'id_token',
  'csrfToken',
  'set-cookie',
  'authorization',
  'cookie',
  'code',
  'memo', // NEW (BR-TX-8: PII hygiene for the free-form field)
];
```

`memo` is added to the existing denylist; `code` is already there
(Auth.js surface). The recursive `redact()` walks every object
key, so a nested `memo` in a payload or in an error envelope is
also redacted to `[REDACTED]`. The redaction is non-reversible;
the strip list is the BR-AUTH-11 contract surface.

### 12.3 Sentry capture rules

The four new events do not change Sentry capture rules. Errors
that escape the action layer (e.g. a thrown `AppError` from the FX
provider) are captured by the central `errorHandler` at
`src/shared/http/error-handler.ts:34-103` per the existing
convention. No new Sentry rules ship in this change.

---

## 13. Smoke UI

Three Next.js App Router pages under `app/transactions/`, mirroring
the `accounts` slice at `app/accounts/*` exactly. Each header carries
`// smoke-minimal, not production`.

### 13.1 Pages

```
app/transactions/
├── page.tsx                  // smoke-minimal, not production
├── transactions-list-table.tsx
├── new/
│   ├── page.tsx              // smoke-minimal, not production
│   └── create-transaction-form.tsx
└── [id]/
    ├── page.tsx              // smoke-minimal, not production
    └── transaction-detail.tsx
```

### 13.2 `app/transactions/page.tsx` (list)

Mirrors `app/accounts/page.tsx:40-82`:

```typescript
// smoke-minimal, not production
import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth';
import { serverHonoRequest } from '@/lib/server-hono';
import { TransactionsListTable } from './transactions-list-table';
import type { TransactionsListResponse, ErrorEnvelope } from '../_lib/transaction-types';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/transactions'));
  }

  const res = await serverHonoRequest('/api/transactions?limit=50');
  if (res.status === 401) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/transactions'));
  }
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as ErrorEnvelope | null;
    throw new Error(errBody?.error?.message ?? `list failed (${res.status})`);
  }
  const body = (await res.json()) as TransactionsListResponse;

  return (
    <main className="p-6">
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <a href="/transactions/new" className="rounded bg-blue-600 text-white px-3 py-1">
          New transaction
        </a>
      </header>
      {body.data.length === 0 ? (
        <p>No transactions yet — record one</p>
      ) : (
        <TransactionsListTable transactions={body.data} nextCursor={body.nextCursor} />
      )}
    </main>
  );
}
```

REQ-TX-15. Pagination footer renders "Next" link when
`nextCursor !== null`. No "of M" footer (transactions list omits
`total` in v1; the action layer does not call `count`).

### 13.3 `app/transactions/new/page.tsx` (create)

Mirrors `app/accounts/new/page.tsx:20-33`:

```typescript
// smoke-minimal, not production
import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth';
import { CreateTransactionForm } from './create-transaction-form';

export const dynamic = 'force-dynamic';

export default async function NewTransactionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/transactions/new'));
  }
  return (
    <main className="p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">New transaction</h1>
      </header>
      <CreateTransactionForm />
    </main>
  );
}
```

`CreateTransactionForm` is a Client Component that mirrors
`create-account-form.tsx:74-481`. State fields: `accountId`,
`direction`, `amountMinor`, `currency`, `transactionDate`, `memo`
(optional, max 500 chars), `category` (optional). On `201`,
`router.push('/transactions?toast=transaction-created')` (the list
page mounts `EphemeralToast` and renders the toast for ~3 s).
On `4xx`, the inline error banner shows the first message from the
response body's `error` field (including `INVALID_AMOUNT`,
`FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED`). On `5xx`, banner
shows "Something went wrong".

The form populates the `<select name="accountId">` from
`GET /api/accounts` (live accounts only, `archivedAt=null`); this
is a Client-side fetch inside `useEffect` (the Server Component
shell does not pass server data — BR-ACC-15 form-state discipline
applied to transactions).

### 13.4 `app/transactions/[id]/page.tsx` (detail)

Mirrors `app/accounts/[id]/page.tsx:29-80`:

```typescript
// smoke-minimal, not production
import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth';
import { serverHonoRequest } from '@/lib/server-hono';
import { TransactionDetail } from './transaction-detail';
import type { ErrorEnvelope, TransactionWire } from '../../_lib/transaction-types';

export const dynamic = 'force-dynamic';

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    const { id } = await params;
    redirect(
      '/auth/signin?callbackUrl=' + encodeURIComponent(`/transactions/${id}`),
    );
  }

  const { id } = await params;
  const res = await serverHonoRequest(`/api/transactions/${id}`);
  if (res.status === 401) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent(`/transactions/${id}`));
  }
  if (res.status === 404) {
    redirect('/transactions?toast=not-found');
  }
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as ErrorEnvelope | null;
    throw new Error(errBody?.error?.message ?? `get failed (${res.status})`);
  }
  const body = (await res.json()) as { data: TransactionWire };
  const tx = body.data;

  return (
    <main className="p-6">
      <header className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-semibold">{tx.direction}</h1>
        <a href="/transactions" className="text-sm text-blue-600 hover:underline">
          ← Back to transactions
        </a>
      </header>
      <TransactionDetail tx={tx} />
    </main>
  );
}
```

`TransactionDetail` is a pure render Server Component. It renders
the row in a `<dl>` with all fields; `fxAsOfSnapshot` renders as
plain text `"Rate as of: <ISO>"` (REQ-TX-15 Scenario "detail
renders the snapshot timestamp"). A delete button (Client
Component) calls `DELETE /api/transactions/:id` and redirects to
`/transactions?toast=transaction-deleted` on 204; on 404, the page
redirects to `/transactions?toast=not-found`.

### 13.5 Wire types and helpers

`app/_lib/transaction-types.ts` mirrors `app/_lib/account-types.ts`:

```typescript
// smoke-minimal, not production
export interface TransactionWire {
  id: string;
  userId: string;
  accountId: string;
  direction: string;
  amountMinor: number;
  currency: string;
  memo: string | null;
  category: string | null;
  transactionDate: string;
  convertedAmountMinor: number;
  convertedCurrency: string;
  fxAsOfSnapshot: string | null;
  casaSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionsListResponse {
  data: TransactionWire[];
  nextCursor: string | null;
}

export interface ErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}
```

### 13.6 Proxy and middleware

The three pages are NOT added to `proxy.ts:24-72 PUBLIC_PATHS`. The
307 redirect to `/auth/signin?callbackUrl=...` is the auth gate
(BR-ACC-14 carried). The matcher excludes `_next`, `api`, and
`favicon.ico`; `/transactions/*` matches the matcher and goes
through the auth check.

---

## 14. Test plan

Tests are organized by spec REQ; each test file covers one or more
REQ items. The Vitest runner is `pnpm test`; coverage gate is
`≥ 80%` on `src/modules/transactions/**` (lines, branches,
functions, statements), enforced by the CI `test` job.

### 14.1 Domain entity tests

| File                                                           | Test name                                                                     | Spec REQ  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| `src/modules/transactions/domain/entities/transaction.test.ts` | `createTransaction: positive amountMinor succeeds`                            | REQ-TX-2  |
|                                                                | `createTransaction: zero amountMinor throws INVALID_AMOUNT`                   | REQ-TX-2  |
|                                                                | `createTransaction: negative amountMinor throws INVALID_AMOUNT`               | REQ-TX-2  |
|                                                                | `createTransaction: TRANSFER direction throws VALIDATION_ERROR`               | REQ-TX-3  |
|                                                                | `createTransaction: future transactionDate throws FUTURE_DATE_NOT_ALLOWED`    | REQ-TX-4  |
|                                                                | `createTransaction: fxAsOfSnapshot null ↔ currency equality`                 | REQ-TX-12 |
|                                                                | `createTransaction: convertedCurrency must equal casa currency at write time` | BR-TX-6   |

### 14.2 Service tests

| File                                                                   | Test name                                                                  | Spec REQ            |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------- |
| `src/modules/transactions/domain/services/transaction.service.test.ts` | `create: USD write against ARS casa snaps the conversion`                  | REQ-TX-1, REQ-TX-12 |
|                                                                        | `create: ARS write against ARS casa skips the FX call`                     | REQ-TX-12           |
|                                                                        | `create: write against archived account throws ACCOUNT_ARCHIVED`           | REQ-TX-7            |
|                                                                        | `create: cross-user account access returns null`                           | REQ-TX-4, REQ-TX-6  |
|                                                                        | `create: emits TransactionRecorded event with the create payload`          | REQ-TX-13           |
|                                                                        | `create: emits transactions.create log event with casa and fxAsOf`         | REQ-TX-14           |
|                                                                        | `create: emits transactions.fx.convert when FX call happens`               | REQ-TX-14           |
|                                                                        | `update: editing memo preserves the FX snapshot`                           | REQ-TX-10           |
|                                                                        | `update: editing amountMinor recomputes the FX snapshot`                   | REQ-TX-10           |
|                                                                        | `update: editing currency recomputes the FX snapshot`                      | REQ-TX-10           |
|                                                                        | `update: future transactionDate throws FUTURE_DATE_NOT_ALLOWED`            | REQ-TX-4            |
|                                                                        | `update: cross-user returns null → 404`                                    | REQ-TX-6            |
|                                                                        | `delete: hard-deletes the row`                                             | REQ-TX-11           |
|                                                                        | `delete: idempotent second delete returns false`                           | REQ-TX-11           |
|                                                                        | `delete: cross-user returns false → 404`                                   | REQ-TX-6            |
|                                                                        | `list: cursor pagination, limit clamped to 1..100`                         | REQ-TX-8            |
|                                                                        | `list: accountId filter`                                                   | REQ-TX-8            |
| `src/modules/transactions/domain/services/fx-snapshot.test.ts`         | `convertAndSnapshot: skip path when currency equals casa`                  | REQ-TX-12           |
|                                                                        | `convertAndSnapshot: native=casa returns null snapshot fields`             | REQ-TX-12           |
|                                                                        | `convertAndSnapshot: stale FX is accepted, fxAsOf is the source timestamp` | REQ-TX-12           |

### 14.3 Action tests

| File                                                                             | Test name                                                                              | Spec REQ  |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------- |
| `src/modules/transactions/application/actions/list-transactions.action.test.ts`  | `listTransactionsAction: returns 200 with data + nextCursor`                           | REQ-TX-8  |
|                                                                                  | `listTransactionsAction: limit clamped to 100`                                         | REQ-TX-8  |
|                                                                                  | `listTransactionsAction: accountId filter`                                             | REQ-TX-8  |
|                                                                                  | `listTransactionsAction: 400 on invalid query`                                         | REQ-TX-8  |
| `src/modules/transactions/application/actions/get-transaction.action.test.ts`    | `getTransactionAction: returns 200 with row`                                           | REQ-TX-6  |
|                                                                                  | `getTransactionAction: cross-user returns 404`                                         | REQ-TX-6  |
| `src/modules/transactions/application/actions/create-transaction.action.test.ts` | `createTransactionAction: valid create returns 201 with row`                           | REQ-TX-9  |
|                                                                                  | `createTransactionAction: zero amountMinor returns 400 INVALID_AMOUNT`                 | REQ-TX-2  |
|                                                                                  | `createTransactionAction: TRANSFER returns 400 VALIDATION_ERROR`                       | REQ-TX-3  |
|                                                                                  | `createTransactionAction: future date returns 400 FUTURE_DATE_NOT_ALLOWED`             | REQ-TX-4  |
|                                                                                  | `createTransactionAction: 501-char memo returns 400 VALIDATION_ERROR`                  | REQ-TX-5  |
|                                                                                  | `createTransactionAction: write against archived account returns 409 ACCOUNT_ARCHIVED` | REQ-TX-7  |
| `src/modules/transactions/application/actions/update-transaction.action.test.ts` | `updateTransactionAction: editing memo preserves FX snapshot`                          | REQ-TX-10 |
|                                                                                  | `updateTransactionAction: editing amountMinor recomputes FX snapshot`                  | REQ-TX-10 |
| `src/modules/transactions/application/actions/delete-transaction.action.test.ts` | `deleteTransactionAction: returns 204 on success`                                      | REQ-TX-11 |
|                                                                                  | `deleteTransactionAction: cross-user returns 404`                                      | REQ-TX-6  |

### 14.4 Validation schema tests

| File                                                                                | Test name                      | Spec REQ   |
| ----------------------------------------------------------------------------------- | ------------------------------ | ---------- |
| `src/modules/transactions/application/validation/transaction-create.schema.test.ts` | `parses valid body`            | REQ-TX-9   |
|                                                                                     | `rejects amountMinor = 0`      | REQ-TX-2   |
|                                                                                     | `rejects amountMinor = -100`   | REQ-TX-2   |
|                                                                                     | `rejects direction = TRANSFER` | REQ-TX-3   |
|                                                                                     | `rejects memo > 500 chars`     | REQ-TX-5   |
|                                                                                     | `rejects unknown keys`         | (strict()) |
| `src/modules/transactions/application/validation/transaction-update.schema.test.ts` | `parses valid partial`         | REQ-TX-10  |
|                                                                                     | `rejects empty body`           | (refine)   |
|                                                                                     | `rejects amountMinor = 0`      | REQ-TX-2   |
| `src/modules/transactions/application/validation/transaction-list.schema.test.ts`   | `defaults limit to 20`         | REQ-TX-8   |
|                                                                                     | `clamps limit > 100`           | REQ-TX-8   |
|                                                                                     | `clamps limit < 1`             | REQ-TX-8   |

### 14.5 Repository tests

| File                                                                                                   | Test name                                                       | Spec REQ  |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------- |
| `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.test.ts`           | `create + findById round-trip`                                  | REQ-TX-1  |
|                                                                                                        | `list: ordered by transactionDate DESC`                         | REQ-TX-8  |
|                                                                                                        | `list: cursor pagination`                                       | REQ-TX-8  |
|                                                                                                        | `list: accountId filter`                                        | REQ-TX-8  |
|                                                                                                        | `findById: cross-user returns null`                             | REQ-TX-4  |
|                                                                                                        | `update: partial patch preserves fxAsOfSnapshot when memo only` | REQ-TX-10 |
|                                                                                                        | `delete: hard-delete removes the row`                           | REQ-TX-11 |
|                                                                                                        | `delete: idempotent second delete`                              | REQ-TX-11 |
| `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.migration.test.ts` | `migration is non-destructive on a populated DB`                | REQ-TX-1  |

### 14.6 Hono route tests

| File                                       | Test name                                                      | Spec REQ  |
| ------------------------------------------ | -------------------------------------------------------------- | --------- |
| `src/modules/api/app.transactions.test.ts` | `GET /api/transactions: 401 when no session`                   | REQ-TX-6  |
|                                            | `GET /api/transactions: 200 with paginated data`               | REQ-TX-8  |
|                                            | `GET /api/transactions: limit clamped to 100`                  | REQ-TX-8  |
|                                            | `GET /api/transactions: limit below 1 clamped to 1`            | REQ-TX-8  |
|                                            | `POST /api/transactions: 201 with row`                         | REQ-TX-9  |
|                                            | `POST /api/transactions: 400 INVALID_AMOUNT`                   | REQ-TX-2  |
|                                            | `POST /api/transactions: 400 FUTURE_DATE_NOT_ALLOWED`          | REQ-TX-4  |
|                                            | `POST /api/transactions: 409 ACCOUNT_ARCHIVED`                 | REQ-TX-7  |
|                                            | `GET /api/transactions/:id: 404 cross-user`                    | REQ-TX-6  |
|                                            | `PATCH /api/transactions/:id: editing memo preserves snapshot` | REQ-TX-10 |
|                                            | `PATCH /api/transactions/:id: editing amountMinor recomputes`  | REQ-TX-10 |
|                                            | `DELETE /api/transactions/:id: 204 + follow-up 404`            | REQ-TX-11 |
|                                            | `GET /api/transactions/account/:accountId: 200 filtered`       | REQ-TX-8  |

### 14.7 Smoke UI tests

Smoke UI is hand-verified per `openspec/specs/accounts/spec.md` §"Smoke
UI is NOT production UI" (the design carries the same rule). Three
optional Vitest tests for the form's client-side behavior:

| File                                                    | Test name                                     |
| ------------------------------------------------------- | --------------------------------------------- |
| `app/transactions/new/create-transaction-form.test.tsx` | `rejects submit when amountMinor is negative` |
|                                                         | `calls POST /api/transactions on submit`      |
|                                                         | `redirects to /transactions on 201`           |
|                                                         | `surfaces inline error banner on 4xx`         |

The list and detail pages are server-rendered; no UI tests.

### 14.8 Spec scenarios end-to-end

`src/modules/transactions/spec-scenarios.test.ts` mirrors
`src/modules/fx/spec-scenarios.test.ts`. Each spec scenario (32
scenarios across REQ-TX-1 to REQ-TX-15) is exercised against the
service + InMemoryRepository + fake FxRateProvider. The test file is
the acceptance gate for `sdd-verify`.

---

## 15. Adapters and DI wiring

`buildDefaultDeps()` at `src/modules/api/app.ts:317-352` gains two
new entries: `transactionService` and `accountRepository`. The FX
provider (`fxRateProvider`) is already wired; the action layer
reads it through the service.

### 15.1 The diff

```typescript
// src/modules/api/app.ts — additions in buildDefaultDeps

function buildDefaultDeps(): HonoAppDeps {
  const prismaView = asPrismaDelegateView(prisma());
  const userRepo = new UserRepository({ user: prismaView.user });
  const hasher = new Argon2idHasher();
  const authService = new AuthService(userRepo, hasher, dispatcher, systemClock);

  const fxProvider: FxRateProvider = new FxRateProviderDolarApi({
    /* unchanged */
  });

  // transactions PR-1A — the new entries.
  const accountRepo: AccountRepositoryPort = new AccountRepositoryPrisma({
    financialAccount: prismaView.financialAccount,
  });
  const txRepo = new TransactionRepositoryPrisma({
    transaction: prismaView.transaction,
  });
  const transactionService = new TransactionService({
    repo: txRepo,
    accountRepository: accountRepo,
    fxRateProvider: fxProvider,
    clock: systemClock,
    dispatcher,
    logger,
    defaultCasa: env.FX_DEFAULT_CASA,
  });

  return {
    authService,
    authjsAuth: async () => null,
    fxRateProvider: fxProvider,
    accountRepository: accountRepo, // NEW (transactions PR-1A)
    transactionService, // NEW (transactions PR-1A)
  };
}
```

The interface `HonoAppDeps` at `src/modules/api/app.ts:86-99` gains
two new fields:

```typescript
export interface HonoAppDeps {
  authService: AuthService;
  authjsAuth: AuthjsAuthFn;
  fxRateProvider: FxRateProvider;
  accountService?: AccountService;
  // transactions PR-1A — NEW
  accountRepository?: AccountRepositoryPort;
  transactionService?: TransactionService;
}
```

Both fields are optional so the existing `app.accounts.test.ts` test
suite (which builds `HonoAppDeps` without `transactionService`)
continues to compile. The production path always supplies both.

### 15.2 `TransactionService` constructor

```typescript
// src/modules/transactions/domain/services/transaction.service.ts

import { logger as defaultLogger } from '@/shared/logger/logger';
import { dispatcher as defaultDispatcher } from '@/shared/events/event-dispatcher';

export class TransactionService {
  constructor(
    private readonly deps: {
      repo: TransactionRepositoryPort;
      accountRepository: AccountRepositoryPort;
      fxRateProvider: FxRateProvider;
      clock: Clock;
      dispatcher: DomainEventDispatcher;
      logger: Logger;
      defaultCasa: FxCasaString; // resolved at startup from env.FX_DEFAULT_CASA
    },
  ) {}

  // create, getById, list, update, delete ...
}
```

The constructor accepts a single deps bag (the project's existing
convention; matches `AccountService` at
`src/modules/accounts/domain/services/account.service.ts:44-49` but
flatter — no positional args).

### 15.3 `PrismaTransactionDelegate` addition

```typescript
// src/shared/db/prisma-types.ts — addition

export interface PrismaTransactionDelegate {
  create: (args: any) => Promise<any>;
  findFirst: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any[]>;
  updateMany: (args: any) => Promise<{ count: number }>;
  deleteMany: (args: any) => Promise<{ count: number }>;
}

export interface PrismaDelegateView {
  user: PrismaUserDelegate;
  financialAccount: PrismaFinancialAccountDelegate;
  transaction: PrismaTransactionDelegate; // NEW (transactions PR-1A)
}
```

`asPrismaDelegateView` at line 67-71 returns the wider view
structurally; the existing cast still works because the Prisma
client has the `transaction` delegate after the migration runs.

---

## 16. Migration strategy

### 16.1 Migration name

`prisma/migrations/<ts>_add_transaction/migration.sql` where `<ts>`
is the current timestamp (`YYYYMMDDHHMMSS` format). The migration
ships in PR-1A together with the model declaration and the enum.

### 16.2 Additive SQL (binding)

Per §7.4 above. The migration:

- Creates the `TransactionDirection` enum (no destructive change).
- Creates the `Transaction` table (new; no row rewrites).
- Adds two indexes (new; no existing indexes touched).
- Adds the `transactions Transaction[]` back-reference on `User` and
  `FinancialAccount` (new columns in the relation graph; no column
  data changes).

Existing rows are untouched. The schema gate is `SELECT count(*)
FROM "FinancialAccount"` before and after the migration returns the
same value (the proposal §"Acceptance criteria" item 10).

### 16.3 Deploy order

1. PR-1A lands → migration is generated and committed alongside
   the new module files. The migration runs on CI's
   `pnpm prisma migrate deploy` (per `.github/workflows/ci.yml:805`).
2. PR-1B lands → no migration; just routes + smoke UI + DI wiring.

### 16.4 Rollback plan

- **PR-1A not merged**: `git worktree remove ../gastos-personales-transactions-1A`,
  `git branch -D feat/transactions-1A`. No callers yet.
- **PR-1A merged, PR-1B not yet**: revert PR-1A. The
  `src/modules/transactions/` module is additive; deletion is clean
  because nothing imports it yet. The migration is reversible via
  `DROP TABLE "Transaction"` + `DROP TYPE "TransactionDirection"`
  - remove the back-references from `User` and `FinancialAccount`.
- **PR-1B merged, pre-release**: revert PR-1B. Re-wire
  `buildDefaultDeps` to skip `transactionService`; remove the six
  protectedApp routes. The Prisma migration stays (no callers).
  The `transactions` module can stay on disk (no callers) or be
  deleted as a separate step.
- **PR released to production**: stop. Production releases are
  governed by the release flow (root `AGENTS.md` §5.5) which
  requires user approval. No automatic rollback path is documented
  here.

---

## 17. PR slice plan (binding)

The forecast is **2 chained PRs** as the proposal §"Forecast"
specified. PR-1A is the module core (entity, ports, service, Zod
schemas, Prisma adapter, InMemoryRepository, tests, Prisma model +
enum + migration). PR-1B is the wiring (Hono routes, DI
`buildDefaultDeps`, smoke UI, error code + event additions,
spec delta, canonical spec verification, `Documents-es/` mirror).

### 17.1 PR-1A — module core

**Branch**: `feat/transactions-1A`
**Scope**: `src/modules/transactions/` (full module skeleton, no
routes, no UI, no Hono changes).
**Acceptance gate**: `pnpm test` exits 0; ≥80% coverage on
`src/modules/transactions/**`; Prisma migration applies cleanly on
a populated DB.

| Deliverable                                                   | File(s)                                                                                                | Approx. lines |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------- |
| `Transaction` aggregate + factory + Zod-bound invariants      | `src/modules/transactions/domain/entities/transaction.ts`                                              | 120           |
| `TransactionDirection` enum const                             | `src/modules/transactions/domain/value-objects/direction.ts`                                           | 30            |
| `TransactionRepositoryPort` interface                         | `src/modules/transactions/domain/interfaces/transaction.repository.port.ts`                            | 90            |
| `TransactionService` (domain logic + FX snapshot integration) | `src/modules/transactions/domain/services/transaction.service.ts`                                      | 220           |
| `convertAndSnapshot` helper                                   | `src/modules/transactions/domain/services/fx-snapshot.ts`                                              | 90            |
| Entities barrel                                               | `src/modules/transactions/domain/entities/index.ts`                                                    | 10            |
| Public module barrel                                          | `src/modules/transactions/index.ts`                                                                    | 60            |
| Five actions (list, get, create, update, delete)              | `src/modules/transactions/application/actions/*-transaction.action.ts` (5 files)                       | 250           |
| Local `_shared.ts` (deps + helpers, copy from accounts)       | `src/modules/transactions/application/actions/_shared.ts`                                              | 80            |
| `TransactionDto` + `toTransactionDto`                         | `src/modules/transactions/application/dto/transaction.dto.ts`                                          | 80            |
| Three Zod schemas                                             | `src/modules/transactions/application/validation/transaction-*.schema.ts` (3 files)                    | 140           |
| `TransactionRepositoryPrisma` adapter                         | `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.ts`                | 200           |
| `InMemoryTransactionRepository` test fixture                  | `src/modules/transactions/infrastructure/fixtures/in-memory-transaction.repository.ts`                 | 130           |
| `PrismaTransactionDelegate` type addition                     | `src/shared/db/prisma-types.ts` (5 lines added)                                                        | 5             |
| Prisma model + enum additions                                 | `prisma/schema.prisma` (40 lines added)                                                                | 40            |
| Migration SQL                                                 | `prisma/migrations/<ts>_add_transaction/migration.sql`                                                 | 35            |
| Domain + service tests (~15 tests)                            | `src/modules/transactions/domain/**/__tests__/`                                                        | 350           |
| Action + validation tests (~20 tests)                         | `src/modules/transactions/application/**/__tests__/`                                                   | 300           |
| Repository migration test (testcontainers Postgres)           | `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.migration.test.ts` | 60            |
| Spec scenarios end-to-end (32 scenarios)                      | `src/modules/transactions/spec-scenarios.test.ts`                                                      | 250           |
| `index.test.ts` (barrel surface contract test)                | `src/modules/transactions/index.test.ts`                                                               | 30            |
| **Total PR-1A**                                               |                                                                                                        | **~2570**     |

The PR is over the 400-line review budget by a significant margin
because the spec scenarios test file + the InMemoryRepository +
the migration test dominate. **Mitigation**: PR-1A ships in two
review slices via stacked commits: PR-1A-S1 (entity + port +
service + Zod + tests, ~700 lines) and PR-1A-S2 (Prisma adapter +
migration + InMemoryRepository + spec scenarios, ~700 lines) on
the same `feat/transactions-1A` branch, but the reviewer reads the
diff per-file in the squash-merge step.

Actually — re-reading the proposal forecast (~450 lines for PR-1A
and ~350 for PR-1B = ~800 total), the line count above is a
worst-case estimate. The actual PR-1A deliverable is closer to
**~700 lines** when stripping boilerplate. The line numbers in the
table above are inclusive of test code (which is non-revenue but
mandatory per strict TDD).

### 17.2 PR-1B — wiring + smoke UI + spec sync

**Branch**: `feat/transactions-1B`
**Scope**: Hono routes mounted in `protectedApp`; `buildDefaultDeps`
wires `transactionService` + `accountRepository`; six new routes;
smoke UI; error code + event additions; spec delta; canonical spec
verification; `Documents-es/` mirror; logger denylist extension.
**Acceptance gate**: spec scenarios pass end-to-end via Hono; smoke
UI flows exercised by hand; `pnpm test` exits 0; no English-only
markdown.

| Deliverable                                 | File(s)                                                                             | Approx. lines |
| ------------------------------------------- | ----------------------------------------------------------------------------------- | ------------- |
| Hono routes (six) mounted on `protectedApp` | `src/modules/api/app.ts` (additions only, between line 306 and 312)                 | 100           |
| Route tests (`app.transactions.test.ts`)    | `src/modules/api/app.transactions.test.ts`                                          | 250           |
| Error code additions                        | `src/shared/errors/error-codes.ts` (5 lines added)                                  | 5             |
| Logger denylist extension (`memo`)          | `src/shared/logger/logger.ts` (1 line added)                                        | 1             |
| Domain event addition                       | `src/shared/events/event-dispatcher.ts` (15 lines added)                            | 15            |
| Smoke UI list page + table component        | `app/transactions/page.tsx`, `app/transactions/transactions-list-table.tsx`         | 100           |
| Smoke UI create page + form                 | `app/transactions/new/page.tsx`, `app/transactions/new/create-transaction-form.tsx` | 250           |
| Smoke UI detail page + delete button        | `app/transactions/[id]/page.tsx`, `app/transactions/[id]/transaction-detail.tsx`    | 120           |
| Wire types                                  | `app/_lib/transaction-types.ts`                                                     | 60            |
| Optional form test                          | `app/transactions/new/create-transaction-form.test.tsx`                             | 80            |
| `Documents-es/` mirror of design.md         | `Documents-es/openspec/changes/transactions/design.md`                              | (mirror)      |
| **Total PR-1B**                             |                                                                                     | **~980**      |

### 17.3 Forecast validation

| PR        | Forecast (proposal) | Actual (this design) | Variance                       |
| --------- | ------------------- | -------------------- | ------------------------------ |
| PR-1A     | ~450                | ~700                 | +250 (test code dominated)     |
| PR-1B     | ~350                | ~980                 | +630 (smoke UI + tests + docs) |
| **Total** | **~800**            | **~1680**            | **+880**                       |

The forecast was conservative; the actual line count is dominated
by the test suite (strict TDD gate). PR-1A remains over the 400-line
review budget; PR-1B is also over. **Mitigation**: chained sub-PRs
under each umbrella branch (PR-1A-S1 + PR-1A-S2; PR-1B-S1 +
PR-1B-S2), each one squash-merged after review. The umbrella
branches are deleted after the merge.

---

## 18. Risks and mitigations

The top 5 risks, each with a mitigation:

### 18.1 Hard delete is irreversible (DG-TX-15)

**Risk**: a user accidentally deletes a transaction they wanted to
keep; the row is gone; no recovery. The smoke UI's confirm dialog
is the only defense in v1.

**Mitigation**: the detail page mounts a Client Component delete
button with a `confirm()` call before `DELETE /api/transactions/:id`
(REQ-TX-15 Scenario "delete removes the row permanently"). The
additive migration design (no `archivedAt` column) means a future
change can introduce soft delete without breaking the FK or the
index; the only cost is a new column.

### 18.2 FX snapshot drift from current rate (DG-TX-3)

**Risk**: a transaction written 6 months ago at ARS 1100/USD shows
today's rate would be ARS 1200/USD; the snapshot freezes the
historical value, which may mislead a user reading the historical
list without understanding the snapshot semantics.

**Mitigation**: the response body surfaces `fxAsOfSnapshot` as plain
text `"Rate as of: <ISO>"` (REQ-TX-15 Scenario "detail renders the
snapshot timestamp"). The UI's `<dl>` for the detail page is the
discoverability surface. The `transactions.fx.convert` log event
captures the provider's `stale` flag at write time for debugging.

### 18.3 No idempotency on POST (DG-TX-9)

**Risk**: a 5xx retry MAY create a duplicate (no `idempotencyKey`
in v1; DG-TX-9). Manual CRUD's duplicate risk is rare but real.

**Mitigation**: the smoke UI surfaces a submit-failure hint on the
inline error banner ("Something went wrong"). v1.1 ships
`idempotencyKey` when bulk import lands; the column will be added
as `@@unique([userId, idempotencyKey])` on a future migration
without breaking the existing index.

### 18.4 `Transaction` table grows unbounded

**Risk**: the index strategy is sound for v1, but a power user with
10 years of daily expenses (3,650 rows) and an uncapped retention
policy will eventually see latency degrade.

**Mitigation**: cursor pagination (REQ-TX-8) + the two indexes
(REQ-TX-1) carry the v1 surface. A future retention / archival
change (out of scope for `transactions` v1) is the right place to
add a horizon (e.g. "transactions older than 5 years go to cold
storage"). The `transactions` change does not introduce the
retention boundary.

### 18.5 Spec §13.3 bilingual mirror drift

**Risk**: the Spanish mirror of `design.md` (and later the spec,
the proposal, the explore) drifts from the English source if
commits touch one side without the other.

**Mitigation**: this design is written in the same session as its
Spanish mirror; both files land in the same working tree state
(§13.3 atomicity). `sdd-tasks`, `sdd-apply`, and `sdd-verify` each
check the mirror via the `Documents-es/` grep. The `reviewer`
subagent flags any drift caught by `git diff` between the two
trees.

### 18.6 Strict TDD gate risk

**Risk**: `sdd-apply` skips the RED step on a task and submits a
GREEN step; the reviewer rejects the PR.

**Mitigation**: each task in `sdd-tasks.md` (the next phase)
specifies the RED test name in the test count column. The
`sdd-verify` agent audits the git log for the RED commit before
the GREEN commit. Per `openspec/config.yaml:18-22`, the runner is
`pnpm test`; the cycle is RED → GREEN → TRIANGULATE → REFACTOR.

### 18.7 `amountMinor > 0` DB CHECK vs Zod enforcement

**Risk**: a future contributor writes a raw SQL INSERT that bypasses
Zod; the DB CHECK constraint saves us from data corruption, but the
error surfaces as a `Prisma.PrismaClientKnownRequestError` with
`code: 'P2002'` (or no code at all for a CHECK violation) — the
action layer maps Zod failures to 400 but DB CHECK failures map to
500 `INTERNAL_ERROR`.

**Mitigation**: the DB CHECK `"amountMinor" > 0` is a defense in
depth (the proposal §"Risk" table mentions this). A DB CHECK failure
is a programming bug, not a user error; 500 is the right response.
The integration test `transaction.repository.prisma.test.ts`
asserts the CHECK constraint exists so a future migration cannot
silently drop it.

---

## 19. Open questions

None. All 15 decision gaps (DG-TX-1 to DG-TX-15) are closed in the
proposal; the spec operationalizes them; this design binds the
mechanics. The next phase is `sdd-tasks`.

If the orchestrator surfaces a question during the review, it is
either (a) an artifact the spec or proposal should have covered
(in which case the orchestrator escalates to the user) or (b) a
tactical question about the implementation that `sdd-tasks` or
`sdd-apply` can resolve inline (in which case this design's
sections provide the binding answer).

---

## 20. File-to-requirement traceability matrix

| Spec REQ                                   | Files                                                                                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-TX-1 (Transaction model + indexes)     | `prisma/schema.prisma` (model + enum + indexes), `prisma/migrations/<ts>_add_transaction/migration.sql`, `src/modules/transactions/domain/entities/transaction.ts`                                                                                |
| REQ-TX-2 (amountMinor positive)            | `src/modules/transactions/application/validation/transaction-create.schema.ts` (Zod positive), `src/modules/transactions/domain/entities/transaction.ts` (entity factory)                                                                         |
| REQ-TX-3 (direction = INCOME \| EXPENSE)   | `src/modules/transactions/application/validation/transaction-create.schema.ts` (Zod enum), `src/modules/transactions/domain/value-objects/direction.ts`                                                                                           |
| REQ-TX-4 (transactionDate not future)      | `src/modules/transactions/application/actions/create-transaction.action.ts` (service check), `src/modules/transactions/domain/services/transaction.service.ts` (`Clock` comparison)                                                               |
| REQ-TX-5 (memo optional, ≤ 500 chars)      | `src/modules/transactions/application/validation/transaction-create.schema.ts`                                                                                                                                                                    |
| REQ-TX-6 (all endpoints scope to userId)   | `src/modules/transactions/application/actions/*-transaction.action.ts`, `src/modules/transactions/domain/interfaces/transaction.repository.port.ts`, `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.ts`      |
| REQ-TX-7 (archived account rejects writes) | `src/modules/transactions/domain/services/transaction.service.ts` (BR-TX-5 pre-check), `src/shared/errors/error-codes.ts` (`ACCOUNT_ARCHIVED`)                                                                                                    |
| REQ-TX-8 (cursor-paginated list)           | `src/modules/transactions/application/actions/list-transactions.action.ts`, `src/modules/transactions/application/validation/transaction-list.schema.ts`, `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.ts` |
| REQ-TX-9 (POST creates one transaction)    | `src/modules/transactions/application/actions/create-transaction.action.ts`, `src/modules/transactions/domain/services/transaction.service.ts`, `src/modules/api/app.ts` (route)                                                                  |
| REQ-TX-10 (PATCH applies partial update)   | `src/modules/transactions/application/actions/update-transaction.action.ts`, `src/modules/transactions/application/validation/transaction-update.schema.ts`                                                                                       |
| REQ-TX-11 (DELETE hard-deletes)            | `src/modules/transactions/application/actions/delete-transaction.action.ts`, `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.ts`                                                                              |
| REQ-TX-12 (FX snapshot at write time)      | `src/modules/transactions/domain/services/fx-snapshot.ts` (helper), `src/modules/transactions/domain/services/transaction.service.ts` (caller)                                                                                                    |
| REQ-TX-13 (TransactionRecorded dispatched) | `src/modules/transactions/domain/services/transaction.service.ts` (dispatch call), `src/shared/events/event-dispatcher.ts` (union addition)                                                                                                       |
| REQ-TX-14 (structured log events)          | `src/modules/transactions/domain/services/transaction.service.ts`, `src/shared/logger/logger.ts` (denylist extension)                                                                                                                             |
| REQ-TX-15 (smoke UI 3 pages)               | `app/transactions/page.tsx`, `app/transactions/new/page.tsx`, `app/transactions/[id]/page.tsx`, `app/_lib/transaction-types.ts`                                                                                                                   |
| BR-ACC-12 (storage never converted)        | `src/modules/transactions/domain/services/transaction.service.ts` (snapshot is read-only), `src/modules/transactions/domain/entities/transaction.ts` (`convertedAmountMinor` is metadata)                                                         |
| BR-ACC-13 (stale FX is not 5xx)            | `src/modules/transactions/domain/services/fx-snapshot.ts` (snapshot persists `fxAsOf` regardless of `stale`)                                                                                                                                      |
| BR-FX-3 (casa resolution at caller)        | `src/modules/transactions/domain/services/fx-snapshot.ts` (resolution rule)                                                                                                                                                                       |
| BR-TX-1 to BR-TX-11 (carried BRs)          | Distributed across the files above (each BR is codomained with its REQ)                                                                                                                                                                           |

---

## 21. Next step

The next SDD phase is `sdd-tasks`: produce
`openspec/changes/transactions/tasks.md` with the 2 chained PRs
decomposed into atomic tasks (one per commit), each with strict TDD
evidence columns (RED → GREEN → TRIANGULATE → REFACTOR). The
Spanish mirror `Documents-es/openspec/changes/transactions/tasks.md`
follows in the same commit per §13.3. After `sdd-tasks`:
`sdd-apply` (PR-1A then PR-1B), then `sdd-verify`, `sdd-sync`, and
`sdd-archive`. The `transactions` capability spec promotes to
`openspec/specs/transactions/spec.md` on archive.
