# Design — `transactions`

**Status**: implemented · **Autor**: Sebastián Illa · **Created**: 2026-06-22 · **Implemented**: 2026-06-24 (slices 1-5 mergeados en `develop` vía #59-#63; archivado como 2026-06-24-transactions)
**Change**: `transactions`
**Proposal**: `openspec/changes/transactions/proposal.md` (v1, 2026-06-22, DG-TX-1 a DG-TX-15 cerradas)
**Spec (delta)**: `openspec/changes/transactions/specs/transactions/spec.md` (REQ-TX-1 a REQ-TX-15)
**Spec delta sibling**: `openspec/changes/transactions/specs/accounts/spec.md` (cross-link REQ-ACC-X1)
**Capabilities affected**: `transactions` (nueva; el spec canónico aterriza en `openspec/specs/transactions/spec.md` al sincronizar), `accounts` (un delta cross-link; sin cambio de comportamiento), `errors` (tres códigos nuevos), `events` (una variante nueva `TransactionRecorded`), `ui` (solo smoke)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (heredado de `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4
**Preflight**: interactive · `both` (Engram + archivos OpenSpec) · `auto-forecast` · budget de review 400 líneas
**Strict TDD**: habilitado según `openspec/config.yaml`; runner `pnpm test`; ciclo RED → GREEN → TRIANGULATE → REFACTOR

> Este documento NO reabre el debate de la propuesta ni del
> spec. Implementa el "qué" del spec con el "cómo" — estructura
> de módulos, invariantes de la entidad de dominio, shapes de
> puerto y DTO, integración del snapshot FX, schemas Zod, modelo
> Prisma, capa de application, rutas Hono, adiciones de códigos
> de error y eventos, eventos de logger, smoke UI, rollout por
> PR, y las 4 design decisions que el spec dejó abiertas. Un
> nuevo contributor puede leer esto y saber exactamente dónde
> aterriza cada Requirement del spec en el repo.

---

## 1. Summary

`transactions` es la cuarta capability en salir después de
`auth-foundation`, `accounts-ledger`, y `fx-cache`. Introduce el
**transaction ledger**: registro manual de gastos e ingresos (CRUD)
scopado a un único `FinancialAccount`, con una superficie de display
multi-moneda que llama al puerto `FxRateProvider` existente al
momento de escritura y **snapshottea el monto convertido en la fila**
(BR-TX-6, DG-TX-3). El cambio es el primer writer de datos FX al
sistema — cada módulo previo o bien no almacenaba nada (`fx-cache`
es read-only) o almacenaba solo native (`accounts` almacena
`openingBalanceMinor` y nunca convierte en reposo).

Tres design decisions son vinculantes y aparecen aquí como mecánica:
**hard delete** sin columna `archivedAt` (DG-TX-15, BR-TX-7);
**single-account per transaction** en v1 (DG-TX-2, BR-TX-2, con
`TRANSFER` reservado en el enum pero rechazado en el API); y el
**fxAtWriteTime snapshot** (`fxAsOfSnapshot` + `casaSnapshot` en la
fila) para que los totales históricos sean deterministas (BR-TX-6,
BR-ACC-12 carried).

Las invariantes cross-module vienen de `accounts` (el padre
`FinancialAccount` se carga read-only; el pre-check BR-TX-5
rechaza escrituras contra una cuenta archivada con
`409 ACCOUNT_ARCHIVED`) y de `auth` (cada endpoint scopea a `userId`
de la sesión; el acceso cross-user devuelve `404 NOT_FOUND`, sin
filtración de información). La flecha de dependencia es
`transactions → accounts`'s puerto `FxRateProvider` y
`accounts`'s `AccountRepositoryPort` (acceso read-only para cargar
la cuenta padre para el check `archivedAt` + el lookup de `casa`), y
`transactions → auth`'s helper `auth()` vía el middleware Hono
`requireSession` existente. `transactions` NO importa desde
`src/modules/fx/` (la dirección del puerto se preserva: `accounts`
exporta el puerto, `fx` lo implementa, `transactions` lo consume
vía `accounts`). La regla de módulos aislados (root `AGENTS.md`
§10.5) se sostiene.

---

## 2. Estructura de módulos — `src/modules/transactions/` (nuevo)

El módulo `transactions` sigue la shape de `accounts` exactamente:
`domain/entities/`, `domain/interfaces/`, `domain/services/`,
`application/actions/`, `application/dto/`, `application/validation/`,
`infrastructure/repositories/`, más un barrel `domain/entities/index.ts`
y el `index.ts` público. El código de PR-1A vive en
`src/modules/transactions/`; PR-1B suma tres páginas smoke bajo
`app/transactions/`.

### 2.1 Por qué un módulo nuevo, no `accounts/application/...`

La propuesta §"Alternatives considered" item 7 consideró extender
`accounts`. La propuesta lo rechazó y también este design, por tres
razones:

1. **Consumers futuros** (`reports`, `snapshots`) leerán filas de
   `Transaction` y se suscribirán a `TransactionRecorded`. Poner
   `Transaction` bajo `accounts/` hace que esos consumers importen
   transitivamente `accounts`, lo cual viola la regla de módulos
   aislados (root `AGENTS.md` §10.5). Un módulo `transactions`
   nuevo les da un import path limpio:
   `import { TransactionService, TransactionRepositoryPort } from '@/modules/transactions'`.
2. **`openspec/specs/transactions/spec.md` ya existe** en el layout
   canónico (según `openspec/AGENTS.md`); el código vive en la
   ubicación matching `src/modules/transactions/`.
3. **Capability boundary**: la capability `accounts` es dueña del
   modelo `FinancialAccount` y de la interfaz del puerto FX; la
   capability `transactions` es dueña del agregado `Transaction`, del
   `TransactionRepositoryPort`, de la lógica de FX snapshot, y del
   evento `TransactionRecorded`. Dos capabilities, dos módulos, dos
   archivos `openspec/specs/*/spec.md`. El cambio `transactions`
   es la primera vez que esta capability sale.

### 2.2 File tree

```
src/modules/transactions/
├── domain/
│   ├── entities/
│   │   ├── transaction.ts                # agregado Transaction + enum Direction.
│   │   │                                  # Fields: id, userId, accountId, direction,
│   │   │                                  # amountMinor, currency, memo, category,
│   │   │                                  # transactionDate, convertedAmountMinor,
│   │   │                                  # convertedCurrency, fxAsOfSnapshot,
│   │   │                                  # casaSnapshot, createdAt, updatedAt.
│   │   │                                  # Invariantes: amountMinor > 0, currency ∈
│   │   │                                  # {ARS,USD,EUR}, convertedCurrency = account.casa.
│   │   ├── transaction.test.ts           # tests unitarios: factory + invariantes.
│   │   └── index.ts                      # barrel de entidades.
│   ├── interfaces/
│   │   ├── transaction.repository.port.ts  # Port: list, findById, create, update,
│   │   │                                   # delete. Cada método toma userId primero.
│   │   └── transaction.repository.port.test.ts  # contract test: cross-user guard.
│   ├── value-objects/
│   │   ├── direction.ts                  # TransactionDirection const (INCOME|EXPENSE|
│   │   │                                  # TRANSFER) — mirror del enum Prisma uppercase.
│   │   └── direction.test.ts             # tests unitarios.
│   └── services/
│       ├── transaction.service.ts        # domain service puro. Depende de repo,
│       │                                  # Clock, FxRateProvider, AccountRepositoryPort
│       │                                  # (read-only — BR-TX-5 check archived +
│       │                                  # resolución casa BR-FX-3).
│       ├── transaction.service.test.ts   # tests unitarios con InMemoryRepository + fake fx.
│       └── fx-snapshot.ts                # helper: convertAndSnapshot(userId, account,
│                                          # amountMinor, currency, deps) → snapshot fields.
│                                          # Devuelve { convertedAmountMinor,
│                                          # convertedCurrency, fxAsOfSnapshot,
│                                          # casaSnapshot }. Skipea la llamada FX cuando
│                                          # currency === casa currency (BR-TX-6).
├── application/
│   ├── actions/
│   │   ├── _shared.ts                    # TransactionActionDeps, ActionResult,
│   │   │                                  # zodErrorToActionError, appErrorToActionError.
│   │   │                                  # copia local — regla modules-isolated
│   │   │                                  # (root AGENTS.md §10.5).
│   │   ├── list-transactions.action.ts   # lista cursor-paginated.
│   │   ├── get-transaction.action.ts     # lectura single-row.
│   │   ├── create-transaction.action.ts  # create + FX snapshot.
│   │   ├── update-transaction.action.ts  # update parcial; recomputa snapshot iff
│   │   │                                  # amountMinor o currency cambiaron.
│   │   ├── delete-transaction.action.ts  # hard delete (DG-TX-15).
│   │   └── *.test.ts                     # tests por acción con InMemoryRepository.
│   ├── dto/
│   │   ├── transaction.dto.ts            # wire shape TransactionDto + toTransactionDto.
│   │   └── dto.test.ts                   # tests de mapping.
│   └── validation/
│       ├── transaction-create.schema.ts  # TransactionCreateSchema (Zod discriminatedUnion).
│       ├── transaction-update.schema.ts  # TransactionUpdateSchema (Zod partial).
│       ├── transaction-list.schema.ts    # TransactionListQuerySchema (cursor/limit/accountId).
│       └── *.test.ts                     # tests Zod parse por schema.
├── infrastructure/
│   ├── repositories/
│   │   ├── transaction.repository.prisma.ts  # adapter Prisma. Mapea P2002 (ninguno en v1).
│   │   └── transaction.repository.prisma.test.ts  # integration test (Postgres real).
│   └── fixtures/
│       └── in-memory-transaction.repository.ts  # fixture de test: InMemoryTransactionRepository.
├── index.ts                              # superficie pública: TransactionService, los
│                                          # enums Direction + AccountCurrency, el tipo
│                                          # TransactionRepositoryPort, el tipo Transaction,
│                                          # la interfaz TransactionActionDeps.
└── spec-scenarios.test.ts                # spec scenarios end-to-end contra el service
                                           # + InMemoryRepository + fake FxRateProvider.
```

### 2.3 Dirección de dependencia cross-module

```
            src/modules/transactions/  (nuevo)
            ├─ domain/services/transaction.service.ts
            │       depende de ─→ TransactionRepositoryPort (este módulo)
            │                       Clock (shared/clock)
            │                       FxRateProvider (accounts/domain/interfaces/fx-rate-provider.port.ts)
            │                       AccountRepositoryPort (accounts/domain/interfaces/account.repository.port.ts)
            │                       (read-only — cargar FinancialAccount padre para BR-TX-5 + BR-FX-3)
            ├─ application/actions/*-transaction.action.ts
            │       depende de ─→ TransactionService (este módulo)
            │                       TransactionCreateSchema / UpdateSchema / ListQuerySchema
            ├─ application/validation/transaction-*.schema.ts
            │       importa ─→ AccountCurrency, Direction (este módulo)
            │                   FX_CASAS / fxCasaStringSchema (NO se importa — el domain es dueño
            │                   del enum de currency; el schema fx queda en el módulo fx)
            ├─ infrastructure/repositories/transaction.repository.prisma.ts
            │       implementa ─→ TransactionRepositoryPort (este módulo)
            │                       usa asPrismaDelegateView (shared/db/prisma-types.ts)
            └─ index.ts                    (superficie pública — ver §2.4)

src/modules/accounts/                       src/shared/
├── domain/interfaces/account.repository.port.ts  ←── transactions importa (puerto)
├── domain/interfaces/fx-rate-provider.port.ts     ←── transactions importa (puerto)
├── domain/entities/financial-account.ts           ←── transactions importa AccountCurrency + AccountFxCasa
├── application/actions/get-account-balance.action.ts  (template para call site FX casa-resolution)
└── infrastructure/repositories/account.repository.prisma.ts
        (NO importado por transactions — va a través del puerto)
```

- `transactions` importa `AccountRepositoryPort`, `FxRateProvider`,
  `AccountCurrency`, `AccountFxCasa` desde `@/modules/accounts`.
- `transactions` NO importa desde `@/modules/accounts/application/`
  ni `@/modules/accounts/infrastructure/`. Los dos puertos de arriba
  son las únicas costuras.
- `transactions` NO importa desde `@/modules/fx/`. El puerto
  `FxRateProvider` se consume a través de `accounts`; el concreto
  `FxRateProviderDolarApi` lo wirea el composition root.
- `accounts` no importa desde `@/modules/transactions/`. La dirección
  de dependencia es estrictamente `transactions → accounts`.
- `auth` se alcanza indirectamente a través del middleware Hono
  `requireSession` existente en `src/modules/api/app.ts:202` —
  cada ruta de `transactions` lee `c.get('user').id` y nunca confía
  en un campo del body.

### 2.4 Barril público — `src/modules/transactions/index.ts`

Espejo del barrel de `accounts` en
`src/modules/accounts/index.ts:27-64` (F-09: las clases de
infraestructura NO se re-exportan; los puertos son el contrato). El
barrel exporta:

- `TransactionService` — el orquestador de dominio (construido en
  el composition root con el repositorio Prisma, el FX provider,
  el AccountRepositoryPrisma para read-only, y `systemClock`).
- `TransactionDirection` — el enum const UPPERCASE
  (`INCOME | EXPENSE | TRANSFER`).
- `AccountCurrency` — re-exportado desde `@/modules/accounts` (el
  módulo transactions NO lo redeclara; la fuente de verdad es
  `financial-account.ts`).
- `Transaction` — el tipo del agregado de dominio.
- `TransactionRepositoryPort` — el tipo del puerto (consumers como
  el futuro módulo `reports` importan esto para leer filas).
- `TransactionActionDeps` — la shape de deps de la capa de
  aplicación (para que el composition root construya el deps bag
  de forma uniforme).
- `INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED` —
  constantes string para los nuevos códigos de error (re-exportadas
  para que las fixtures de test puedan referenciarlos sin alcanzar
  `@/shared/errors`).

El barrel NO exporta:

- `TransactionRepositoryPrisma` (adapter de infraestructura).
- `InMemoryTransactionRepository` (fixture de test).
- `convertAndSnapshot` (helper interno; no es un contrato cross-module).
- Los schemas Zod (los consumers validan en su propia frontera; los
  schemas son un artefacto interno de la capa de aplicación).

---

## 3. Domain model

El agregado `Transaction` es la única fuente de verdad para las
entradas de ledger del usuario. Una fila por entrada manual. Espejo
del modelo Prisma uno-a-uno.

### 3.1 Enum: `TransactionDirection`

```typescript
// src/modules/transactions/domain/value-objects/direction.ts

export const TransactionDirection = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
  TRANSFER: 'TRANSFER', // reservado para v1.1 — rechazado en el API en v1
} as const;
export type TransactionDirection = (typeof TransactionDirection)[keyof typeof TransactionDirection];
```

La forma UPPERCASE espeja el enum Prisma `TransactionDirection`
(`prisma/schema.prisma`). La forma wire en el API de Hono es el
mismo string UPPERCASE. `TRANSFER` está reservado para v1.1; el
schema Zod en la frontera del API lo rechaza (REQ-TX-3, BR-TX-2).

### 3.2 Agregado: `Transaction`

```typescript
// src/modules/transactions/domain/entities/transaction.ts

export interface Transaction {
  readonly id: string; // cuid, server-generated
  readonly userId: string; // FK a User.id (auth)
  readonly accountId: string; // FK a FinancialAccount.id (accounts)
  readonly direction: TransactionDirection; // INCOME | EXPENSE (TRANSFER rechazado en API)
  readonly amountMinor: number; // Siempre positivo; el signo viene de direction (BR-TX-1)
  readonly currency: AccountCurrency; // ARS | USD | EUR
  readonly memo: string | null; // Opcional, ≤ 500 chars (REQ-TX-5, BR-TX-8)
  readonly category: string | null; // Free-form (BR-TX-9, DG-TX-4)
  readonly transactionDate: Date; // NO en el futuro (BR-TX-3, REQ-TX-4)
  readonly convertedAmountMinor: number; // monto de display en la currency de account.casa
  readonly convertedCurrency: AccountCurrency; // siempre = currency de account.casa al escribir
  readonly fxAsOfSnapshot: Date | null; // null iff native currency = casa currency (BR-TX-6)
  readonly casaSnapshot: AccountFxCasa | null; // null iff native currency = casa currency
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
```

### 3.3 Invariantes enforced por la entidad

- `amountMinor > 0` (BR-TX-1, REQ-TX-2). No-positivo en la frontera
  del API tira `AppError(INVALID_AMOUNT)` (400) en la capa de
  aplicación; la capa de entidad también rechaza `amountMinor <= 0`
  en su factory para defensa en profundidad.
- `direction ∈ { INCOME, EXPENSE }` en escrituras de v1 (BR-TX-2,
  REQ-TX-3). La entidad acepta `TRANSFER` sólo para filas de read
  side importadas desde una migración futura de v1.1; la capa de
  aplicación lo rechaza antes de construir la entidad.
- `transactionDate <= Clock.now()` (BR-TX-3, REQ-TX-4). Fecha
  futura en la frontera del API tira
  `AppError(FUTURE_DATE_NOT_ALLOWED)` (400). La capa de entidad
  chequea vía el `Clock` inyectado para la aserción de read-back.
- `convertedCurrency` siempre es igual a la currency del
  `FinancialAccount.casa` padre al momento de escritura. El helper
  `fx-snapshot` en `domain/services/fx-snapshot.ts` enforces esto.
- `convertedAmountMinor` es el resultado en centavos enteros de
  aplicar el rate del snapshot a `amountMinor` (BR-TX-6, DG-TX-8
  half-up a 2 decimales).
- `fxAsOfSnapshot IS NULL` iff `currency === convertedCurrency`
  (no se emitió llamada FX).
- `casaSnapshot IS NULL` iff `fxAsOfSnapshot IS NULL`.
- Acceso cross-user devuelve `null` en miss O cross-user (BR-TX-4);
  el `findById` del puerto incluye `userId` en la cláusula WHERE,
  por lo que la capa de aplicación no puede pedir accidentalmente
  datos de otro usuario.
- La fila NO lleva columna `archivedAt` (BR-TX-7, DG-TX-15). Hard
  delete es la política; la query de list no tiene filtro
  `archivedAt: null`.

### 3.4 Factory del dominio

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
  readonly now: Date; // inyectado; la entidad nunca llama `new Date()`
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

La factory es el único lugar donde la capa de dominio construye
una fila nueva. La capa de aplicación la llama después del Zod
parse y el snapshot FX. Tirar `AppError` mantiene el catch uniforme
de la capa de aplicación (ver §8).

---

## 4. Ports y DTOs

### 4.1 `TransactionRepositoryPort`

```typescript
// src/modules/transactions/domain/interfaces/transaction.repository.port.ts

import type { Transaction } from '../entities/transaction';
import type { TransactionDirection, AccountCurrency } from '...';

export interface ListTransactionsOptions {
  readonly cursor?: string;
  readonly limit: number; // 1..100, enforced en la frontera del API
  readonly accountId?: string; // filtro por account cuando se provee
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
  /** Lista las transacciones del usuario, ordenadas por transactionDate DESC. */
  list(userId: string, opts: ListTransactionsOptions): Promise<ListTransactionsPage>;

  /** Encuentra una transacción por id, scoped a userId. Devuelve null en
   * miss O en acceso cross-user (BR-TX-4). */
  findById(userId: string, id: string): Promise<Transaction | null>;

  /** Inserta una nueva transacción owned por userId. El id, createdAt,
   * updatedAt son server-generated dentro del adapter. */
  create(userId: string, input: CreateTransactionInput): Promise<Transaction>;

  /** Update parcial de una transacción owned por userId. Devuelve null
   * en miss o cross-user. La capa de service tira AppError. */
  update(userId: string, id: string, patch: UpdateTransactionPatch): Promise<Transaction | null>;

  /** Hard-delete (DG-TX-15). Devuelve true si se removió una fila;
   * false en miss o cross-user. Idempotencia: un segundo delete sobre
   * el mismo id devuelve false (la fila ya no está). */
  delete(userId: string, id: string): Promise<boolean>;
}
```

Espejo de `AccountRepositoryPort` en
`src/modules/accounts/domain/interfaces/account.repository.port.ts:117-155`
exactamente: cada método toma `userId` primero y lo incluye en la
cláusula WHERE. La invariante cross-module de
`auth/spec.md:644-647` ("cada `WHERE userId = ?` de otro módulo
DEBE scopear al caller") se enforce a nivel de la firma de tipo.

El método `delete` devuelve `boolean` (no `Transaction | null` como
en `accounts`) porque v1 hard-deletea — no hay estado post a
devolver. La capa de aplicación mapea `true` a `204` y `false` a
`404 NOT_FOUND`.

### 4.2 `TransactionDTO` y `toTransactionDto`

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

El campo DTO `casaSnapshot` lleva la forma lowercase DolarAPI wire
(matchea el patrón en
`src/modules/accounts/application/dto/financial-account.dto.ts:27-34`).
Los campos de fecha son strings ISO 8601.

### 4.3 `TransactionActionDeps`

```typescript
// src/modules/transactions/application/actions/_shared.ts

import type { TransactionService } from '../../domain/services/transaction.service';
import type { FxRateProvider, AccountRepositoryPort } from '@/modules/accounts';

export interface TransactionActionDeps {
  transactionService: TransactionService;
  // La capa de aplicación lee la FinancialAccount padre a través del
  // puerto (BR-TX-5 check archived + BR-FX-3 resolución casa).
  // Transactions nunca alcanza accounts/infrastructure.
  accountRepository: AccountRepositoryPort;
  // El FX provider lo consume el service (no la action).
  // La action lee userId del contexto de Hono y lo forward.
  fxRateProvider: FxRateProvider;
}
```

La shape espeja `AccountActionDeps` en
`src/modules/accounts/application/actions/_shared.ts:22-24` pero suma
`accountRepository` porque el service de transactions necesita
cargar la cuenta padre para el check BR-TX-5 archived. El
`fxRateProvider` va en el deps bag porque el service se construye
una vez al startup (composition root); la capa de aplicación NO
llama al FX provider directamente.

---

## 5. Integración FX

El `TransactionService` llama a `FxRateProvider.getDisplayAmount(...)`
al momento de escritura, una vez por fila, y persiste el resultado.
Esta sección fija exactamente el call site y la semántica del
snapshot.

### 5.1 El helper `convertAndSnapshot`

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
  readonly defaultCasa: FxCasaString; // resuelto al startup desde env.FX_DEFAULT_CASA
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
  // Resolver casa (BR-FX-3 — el caller resuelve, el provider no).
  const casaUpper = input.account.casa ?? LOWERCASE_TO_CASA[input.defaultCasa];
  const casaLower = CASA_TO_LOWERCASE[casaUpper];

  // BR-TX-6: skipear la llamada FX cuando native currency == casa currency.
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
  // Todas las casas DolarAPI-soportadas son ARS↔USD en v1.
  // Soporte EUR es el follow-up de v1.1.
  return 'ARS';
}
```

Espejo de la regla de resolución de casa en
`src/modules/accounts/application/actions/get-account-balance.action.ts:67-100`
(REQ-FX-3) y de la shape `FxConversionRequest` en
`src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts:55-71`.

### 5.2 Semántica del snapshot

- **Skip path (BR-TX-6):** cuando `transaction.currency === casa
currency`, `convertedAmountMinor = amountMinor`,
  `convertedCurrency = transaction.currency`,
  `fxAsOfSnapshot = null`, `casaSnapshot = null`. No se emite
  llamada a `FxRateProvider`; el helper short-circuitea antes del
  `await`.
- **Call path:** cuando las currencies difieren, el helper emite
  exactamente una llamada a
  `FxRateProvider.getDisplayAmount(req)`. La caché + stampede-lock
  del provider manejan la concurrencia; stale está permitido
  (BR-ACC-13 carried). El helper persiste `display.fxAsOf` como
  `fxAsOfSnapshot` incluso cuando está stale.
- **Half-up rounding (DG-TX-8):** la aritmética
  `(amount / 100) * fxRate` existente del FX provider es la
  convención. El helper devuelve `result.display.amount` como un
  valor en centavos enteros; no se necesita rounding on-read porque
  el DTO lleva el entero.
- **Resolución de casa (BR-FX-3):** el helper resuelve
  `account.casa ?? env.FX_DEFAULT_CASA` (el valor de env pasa a
  través de los deps de la action desde el composition root; el
  helper no lee env). La forma lowercase DolarAPI se calcula en la
  frontera; el snapshot persiste la forma UPPERCASE `AccountFxCasa`
  (matchea la columna Prisma).

### 5.3 Tolerancia a cache stale

El `FxRateProviderDolarApi` (ver
`src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.ts`)
devuelve `{ ..., stale: boolean, fxAsOf: Date }` según
`src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts:73-88`.
El helper ignora `stale`; el timestamp del snapshot `fxAsOf` es el
timestamp fuente del provider independientemente de la staleness
(BR-ACC-13). El evento de log `transactions.fx.convert` (§11)
captura el `stale: boolean` para observabilidad; la response wire
no.

### 5.4 Cobertura del skip path native=casa

El scenario "ARS write against an ARS casa skips the FX call" de
REQ-TX-12 afirma que cuando la cuenta padre es ARS y la transacción
es ARS, no se emite llamada a `FxRateProvider`. El test en
`src/modules/transactions/spec-scenarios.test.ts` lo afirma con un
spy `FxRateProvider` cuyo `getDisplayAmount` tira si se llama — el
test pasa sólo si el helper short-circuitea.

---

## 6. Validación (Zod)

Tres schemas Zod cubren las tres superficies de write/query. Cada
restricción de campo se rastrea a un REQ del spec. El modificador
`strict()` se usa para rechazar keys desconocidas en la frontera
(forma `closed`, matcheando `account-create.schema.ts`).

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
    // REQ-TX-3: TRANSFER se rechaza en la frontera.
    direction: z.enum([TransactionDirection.INCOME, TransactionDirection.EXPENSE], {
      errorMap: () => ({ message: 'TRANSFER is reserved for v1.1.' }),
    }),
    // REQ-TX-2: amountMinor estrictamente positivo.
    amountMinor: z.number().int().positive(),
    currency: accountCurrencySchema,
    accountId: z.string().min(1).max(64),
    // REQ-TX-4: transactionDate en el pasado o hoy. La comparación
    // con Clock vive en la capa de service (el Zod parse no puede
    // depender de Clock); el schema acepta cualquier fecha y el
    // service tira FUTURE_DATE_NOT_ALLOWED.
    transactionDate: z.coerce.date(),
    // REQ-TX-5: memo opcional, ≤ 500 chars.
    memo: z.string().max(500).nullable().optional(),
    // BR-TX-9: category es free-form.
    category: z.string().max(80).nullable().optional(),
  })
  .strict();

export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;
```

Por qué no hay discriminatedUnion sobre `direction` (todavía): la
superficie de v1 es plana. La propuesta §DG-TX-12 deja lugar para
reglas per-direction en v1.1 (p.ej. INCOME podría permitir `null`
currency en un flujo futuro de refund); el schema está abierto a
esa evolución sin un breaking change.

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

REQ-TX-10: body parcial. El `.refine` asegura que un body vacío se
rechaza como `400 VALIDATION_ERROR` en lugar de un no-op silencioso.
El `accountId` NO se puede updatir en v1 (cambiar la cuenta padre
re-dispararía el check BR-TX-5 archived + el FX snapshot; ese flujo
es un follow-up de v1.1 si hace falta — una futura migración de
`transfer` lo absorbe).

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

REQ-TX-8: cursor + limit + opcional `accountId`. El schema matchea
`listAccountsSchema` en
`src/modules/accounts/application/validation/list-accounts.schema.ts:23-29`
exactamente; la smoke UI reusa el mismo footer de paginación.

---

## 7. Persistencia (Prisma)

La migración Prisma es el único cambio de esquema persistente en
este cambio. Es **aditiva** según REQ-FX-9 (el precedente de
`fx-cache` en `openspec/specs/fx/spec.md:474-484`); las filas
existentes de `FinancialAccount` y `User` quedan sin cambios.

### 7.1 Enum nuevo: `TransactionDirection`

```prisma
// prisma/schema.prisma (append después del enum AccountFxCasa)

// transactions (PR-1A) — agregado Transaction.
// Direction lleva el signo (BR-TX-1); TRANSFER está reservado para
// v1.1 y se rechaza en la frontera del API (BR-TX-2, REQ-TX-3).
// Ver: openspec/changes/transactions/design.md §7.
enum TransactionDirection {
  INCOME
  EXPENSE
  TRANSFER
}
```

### 7.2 Modelo nuevo: `Transaction`

```prisma
// prisma/schema.prisma (append después del modelo FinancialAccount)

model Transaction {
  id                   String              @id @default(cuid())
  userId               String
  accountId            String
  direction            TransactionDirection
  // BR-TX-1: siempre positivo; el signo viene de direction.
  amountMinor          Int
  currency             AccountCurrency
  // REQ-TX-5: opcional, max 500 chars.
  memo                 String?
  // BR-TX-9: string free-form; no hay tabla TransactionCategory en v1.
  category             String?
  // REQ-TX-4: no en el futuro relativo a Clock.now().
  transactionDate      DateTime
  // BR-TX-6: snapshotteado al escribir. Siempre populado.
  convertedAmountMinor Int
  convertedCurrency    AccountCurrency
  // BR-TX-6: null iff native currency == casa currency (no llamada FX).
  fxAsOfSnapshot       DateTime?
  // BR-TX-6: UPPERCASE AccountFxCasa o null.
  casaSnapshot         AccountFxCasa?
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt

  // FKs: onDelete: Cascade espeja FinancialAccount.userId → User.id.
  user    User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  account FinancialAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)

  // Query de list: cursor pagination + filtro per-account.
  @@index([userId, transactionDate])
  @@index([accountId, transactionDate])
}
```

Dos índices (REQ-TX-1, DG-TX-14):

- `@@index([userId, transactionDate])` — el endpoint de list por
  defecto (cada lista de transacciones está scoped al userId del
  caller y ordenada por `transactionDate` DESC).
- `@@index([accountId, transactionDate])` — el path de filtro
  per-account (`?accountId=...`).

Las relations `User` y `FinancialAccount` requieren una back-reference
en los modelos padre. El modelo `User` ya tiene
`financialAccounts FinancialAccount[]` en la línea 36; agregamos
`transactions Transaction[]` a `User` y un nuevo
`transactions Transaction[]` a `FinancialAccount`.

### 7.3 Adiciones de back-reference

```prisma
// prisma/schema.prisma — adiciones al modelo User
model User {
  // ... existing fields unchanged ...
  financialAccounts FinancialAccount[]
  transactions      Transaction[]    // NUEVO (transactions PR-1A)
  // ... rest unchanged ...
}

// prisma/schema.prisma — adiciones al modelo FinancialAccount
model FinancialAccount {
  // ... existing fields unchanged ...
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions Transaction[]  // NUEVO (transactions PR-1A)
  // ... rest unchanged ...
}
```

Son aditivas; ninguna columna existente cambia. Los schemas `User`
y `FinancialAccount` compilan sin cambios para los callers (la
nueva relation es puramente aditiva).

### 7.4 SQL de la migración

Generado por `pnpm prisma migrate dev --name add_transaction`:

```sql
-- non-destructive; aditiva; no backfill; no row rewrite
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

El gate de la migración (según REQ-TX-1 + propuesta §"Acceptance
criteria" item 10): `SELECT count(*) FROM "FinancialAccount"`
antes y después de la migración devuelve el mismo valor. Los
schemas `User` y `FinancialAccount` son byte-idénticos aparte de
las back-references aditivas.

### 7.5 Nombre de migración + disciplina del lockfile

- Directorio de migración:
  `prisma/migrations/<ts>_add_transaction/migration.sql` donde
  `<ts>` es el timestamp actual (formato `YYYYMMDDHHMMSS`,
  matchea el precedente existente
  `20260622010704_add_account_fx_casa`).
- Sin cambio en `package.json`; el `pnpm-lock.yaml` queda sin
  cambios. El check pre-commit de lockfile de Husky es informativo
  (pasa porque no se staguea `package.json`).

---

## 8. Capa de aplicación (Actions)

Cinco actions, una por operación, espejando la shape de `accounts`
en `src/modules/accounts/application/actions/`. El archivo local
`_shared.ts` es una copia verbatim del helper de accounts
(regla modules-isolated, root `AGENTS.md` §10.5 — cada módulo es
dueño de sus propios helpers).

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

REQ-TX-8. Espejo de `list-accounts.action.ts:30-74` exactamente; la
query companion `count` se omite en v1 (el footer "Showing first N
of M" de la smoke UI es una preocupación solo de accounts; el
footer de list de transactions es solo "next page" cuando
`nextCursor` no es null). El filtro opcional `accountId` pasa al
service, que lo pasa a la cláusula WHERE del repositorio.

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

REQ-TX-6 Scenario "cross-user read returns 404": el service tira
`AppError(NOT_FOUND)` en miss o cross-user; la action mapea a
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

El service es el único lugar que:

- Carga la `FinancialAccount` padre vía
  `deps.accountRepository.findById(userId, accountId)`.
- Tira `ACCOUNT_ARCHIVED` (409) si `account.archivedAt !== null`.
- Resuelve `account.casa ?? env.FX_DEFAULT_CASA` (BR-FX-3).
- Llama a `convertAndSnapshot` (§5.1) para producir los campos del
  snapshot.
- Persiste la fila vía el repositorio.
- Emite `transactions.create` y (condicional) `transactions.fx.convert`.
- Despacha `TransactionRecorded` vía el event dispatcher central.

El service tira `AppError(INVALID_AMOUNT)` o
`AppError(FUTURE_DATE_NOT_ALLOWED)` antes de llamar al FX provider
si el payload Zod-validado todavía tiene violaciones de invariantes
(defensa en profundidad — el Zod parse es el gate primario, la
factory de entidad es el secundario).

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

REQ-TX-10: el service recomputa el FX snapshot **sólo si**
`amountMinor` o `currency` cambiaron (el service lo detecta vía un
flag `fieldsChanged`). Editar `memo`, `category`, o
`transactionDate` preserva los `fxAsOfSnapshot` y `casaSnapshot`
existentes. Editar `transactionDate` a una fecha futura tira
`FUTURE_DATE_NOT_ALLOWED` (BR-TX-3); el check se repite en el path
de update.

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

REQ-TX-11 + DG-TX-15: hard delete. El service devuelve `false` en
miss o cross-user; la action mapea a `404 NOT_FOUND`. En éxito,
la action devuelve `204` en la capa de ruta.

### 8.6 Check de session / permisos

Cada action acepta `userId` como parámetro; la capa de ruta lee
`c.get('user').id` del contexto Hono (después de que `requireSession`
estrecha el tipo a `AuthUser`). Las actions NUNCA confían en un
`userId` del body del request. Esta es la invariante cross-module de
`openspec/specs/auth/spec.md:644-647`.

---

## 9. Rutas HTTP (Hono)

Seis rutas bajo `/api/transactions` montadas en el `protectedApp`
existente (el sub-app protegido en
`src/modules/api/app.ts:192-312`). El patrón espeja las siete
rutas de `accounts` en `src/modules/api/app.ts:222-306`; la shape
de action + dto es idéntica.

### 9.1 Tabla de rutas

| Method   | Path                                   | Action                                     | Validator                                             | Response (éxito)                                         | Códigos de error                                                                                                                                     |
| -------- | -------------------------------------- | ------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/transactions`                    | `listTransactionsAction`                   | `transactionListSchema`                               | `{ data: TransactionDto[], nextCursor: string \| null }` | `400 VALIDATION_ERROR`                                                                                                                               |
| `POST`   | `/api/transactions`                    | `createTransactionAction`                  | `transactionCreateSchema`                             | `{ data: TransactionDto }` (201)                         | `400 VALIDATION_ERROR`, `400 INVALID_AMOUNT`, `400 FUTURE_DATE_NOT_ALLOWED`, `404 NOT_FOUND` (account), `409 ACCOUNT_ARCHIVED`, `503 FX_UNAVAILABLE` |
| `GET`    | `/api/transactions/:id`                | `getTransactionAction`                     | (ninguno)                                             | `{ data: TransactionDto }` (200)                         | `404 NOT_FOUND`                                                                                                                                      |
| `PATCH`  | `/api/transactions/:id`                | `updateTransactionAction`                  | `transactionUpdateSchema`                             | `{ data: TransactionDto }` (200)                         | `400 VALIDATION_ERROR`, `400 INVALID_AMOUNT`, `400 FUTURE_DATE_NOT_ALLOWED`, `404 NOT_FOUND`, `503 FX_UNAVAILABLE`                                   |
| `DELETE` | `/api/transactions/:id`                | `deleteTransactionAction`                  | (ninguno)                                             | empty (204)                                              | `404 NOT_FOUND`                                                                                                                                      |
| `GET`    | `/api/transactions/account/:accountId` | `listTransactionsAction` (con `accountId`) | `transactionListSchema` (con `accountId` pre-llenado) | `{ data: TransactionDto[], nextCursor: string \| null }` | `400 VALIDATION_ERROR`                                                                                                                               |

### 9.2 Sitio de montaje

Las seis rutas se montan entre la línea 306 y la línea 312 de
`src/modules/api/app.ts`, después de las siete rutas de accounts y
antes de la línea `app.route('/', protectedApp)`. El ordenamiento de
middleware Hono — `requireSession` primero, después las rutas — se
preserva (el session gate ya está registrado en
`protectedApp.use('*', requireSession)` en la línea 202).

### 9.3 Shape del handler (un ejemplo)

```typescript
// src/modules/api/app.ts — adiciones después de la línea 306, antes de la 312

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

// 6. Lista filtrada por account
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

### 9.4 Tests de las rutas

`src/modules/api/app.transactions.test.ts` espeja
`app.accounts.test.ts`. Seis bloques `it()` por ruta, cada uno contra
los fakes in-memory (InMemoryTransactionRepository +
InMemoryAccountRepository + fake FxRateProvider). La cobertura
incluye:

- 401 en cada endpoint sin session.
- 200 + shape correcta en requests válidas.
- 400 + `INVALID_AMOUNT` con `amountMinor <= 0`.
- 400 + `VALIDATION_ERROR` con `direction: TRANSFER`.
- 400 + `FUTURE_DATE_NOT_ALLOWED` con `transactionDate` futuro.
- 404 en reads cross-user.
- 409 + `ACCOUNT_ARCHIVED` en escrituras contra cuenta padre
  archivada.
- 204 en delete; el GET siguiente devuelve 404.

---

## 10. Adiciones de códigos de error

Tres códigos nuevos agregados a
`src/shared/errors/error-codes.ts:12-43` y al mapa
`ErrorStatus` correspondiente en las líneas 52-66. El diff es
aditivo; los códigos existentes mantienen su status y valor.

### 10.1 El diff

```typescript
// src/shared/errors/error-codes.ts — adiciones

export const ErrorCode = {
  // ... existing codes unchanged ...
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  WEAK_PASSWORD: 'WEAK_PASSWORD',

  // ... existing codes unchanged ...
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHORIZED: 'UNAUTHORIZED',

  // --- transactions (PR-1A) — NUEVO ---
  INVALID_AMOUNT: 'INVALID_AMOUNT', // 400: amountMinor <= 0 o no-finite
  FUTURE_DATE_NOT_ALLOWED: 'FUTURE_DATE_NOT_ALLOWED', // 400: transactionDate > Clock.now()
  ACCOUNT_ARCHIVED: 'ACCOUNT_ARCHIVED', // 409: el padre FinancialAccount está archivado

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
  INVALID_AMOUNT: 400, // NUEVO
  FUTURE_DATE_NOT_ALLOWED: 400, // NUEVO
  ACCOUNT_ARCHIVED: 409, // NUEVO
  FORBIDDEN: 403,
  // ... existing entries unchanged ...
};
```

### 10.2 Tabla de errores (vinculante)

| Code                      | HTTP | Trigger                                                                            | Superficie del caller                                                     |
| ------------------------- | ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `INVALID_AMOUNT`          | 400  | `amountMinor <= 0`, negativo después de derivar sign-from-direction, o no-finite.  | Banner de error inline en `POST /api/transactions`.                       |
| `FUTURE_DATE_NOT_ALLOWED` | 400  | `transactionDate > Clock.now()`.                                                   | Banner de error inline en `POST /api/transactions`.                       |
| `ACCOUNT_ARCHIVED`        | 409  | `FinancialAccount.archivedAt` padre no es null al momento de escritura.            | Banner de error inline en `POST /api/transactions`.                       |
| `VALIDATION_ERROR`        | 400  | Cualquier otra falla de schema (p.ej. `direction = TRANSFER`, `memo > 500 chars`). | Banner de error inline; primer mensaje de `details`.                      |
| `UNAUTHORIZED`            | 401  | Sin session, cookie faltante, session expirada (según `auth/spec.md`).             | 307 redirect para páginas App Router; 401 JSON para Hono.                 |
| `NOT_FOUND`               | 404  | `id` cross-user o no existente.                                                    | `redirect('/transactions')` para la página de detalle (patrón BR-ACC-19). |

Sin nuevos HTTP statuses. Ningún código existente cambia de status.

---

## 11. Adiciones de eventos

Una nueva variante de evento agregada a la unión `DomainEvent` en
`src/shared/events/event-dispatcher.ts:3-5`. El diff es aditivo;
las variantes existentes mantienen su shape de payload.

### 11.1 El diff

```typescript
// src/shared/events/event-dispatcher.ts — adiciones

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

REQ-TX-13: el evento se despacha una vez por create exitoso. Ningún
subscriber sale en v1; la membresía de la unión es el contrato
(`reports` y `snapshots` se pueden suscribir en un cambio futuro
sin una edición de interfaz).

### 11.2 Punto de dispatch

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
    stale: false, // el flag stale del provider se descarta en esta capa; surfacear en un cambio futuro
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

El dispatcher se inyecta vía el constructor del service (el
composition root wirea el mismo singleton que `accounts`).

---

## 12. Adiciones al logger

Cuatro nombres nuevos de eventos de log estructurados, más una
extensión de la denylist para descartar el contenido de `memo`
(BR-TX-8, higiene PII).

### 12.1 Tabla de eventos

| Evento                    | Cuándo                                                           | Campos                                                              |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| `transactions.create`     | Después de un create exitoso                                     | `userId, accountId, direction, amountMinor, currency, casa, fxAsOf` |
| `transactions.update`     | Después de un update exitoso                                     | `userId, id, fieldsChanged[], fxRecomputed: boolean`                |
| `transactions.delete`     | Después de un hard delete exitoso                                | `userId, id`                                                        |
| `transactions.fx.convert` | Sólo cuando se emitió una llamada FX (currency != casa currency) | `userId, casa, native, display, fxAsOf, stale`                      |

Los nombres de campos matchean la tabla de observabilidad del spec
en `openspec/changes/transactions/specs/transactions/spec.md`
§REQ-TX-14. El transporte es el logger existente del proyecto en
`src/shared/logger/logger.ts:101-106`.

### 12.2 Extensión de la denylist del logger

```typescript
// src/shared/logger/logger.ts — adición a denylistKeys

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
  'memo', // NUEVO (BR-TX-8: higiene PII para el campo free-form)
];
```

`memo` se suma a la denylist existente; `code` ya está ahí
(superficie Auth.js). El `redact()` recursivo recorre cada key de
objeto, así que un `memo` anidado en un payload o en un envelope de
error también se redacta a `[REDACTED]`. La redacción es
irreversible; la lista de strip es la superficie del contrato
BR-AUTH-11.

### 12.3 Reglas de captura de Sentry

Los cuatro eventos nuevos no cambian las reglas de captura de
Sentry. Los errores que escapan la capa de action (p.ej. un
`AppError` tirado por el FX provider) los captura el
`errorHandler` central en `src/shared/http/error-handler.ts:34-103`
según la convención existente. Ninguna regla nueva de Sentry sale en
este cambio.

---

## 13. Smoke UI

Tres páginas de Next.js App Router bajo `app/transactions/`,
espejando el slice de `accounts` en `app/accounts/*` exactamente.
Cada header lleva `// smoke-minimal, not production`.

### 13.1 Páginas

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

Espejo de `app/accounts/page.tsx:40-82`:

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

REQ-TX-15. El footer de paginación renderiza un link "Next" cuando
`nextCursor !== null`. Sin footer "of M" (la list de transactions
omite `total` en v1; la capa de acción no llama a `count`).

### 13.3 `app/transactions/new/page.tsx` (create)

Espejo de `app/accounts/new/page.tsx:20-33`:

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

`CreateTransactionForm` es un Client Component que espeja
`create-account-form.tsx:74-481`. Campos de state: `accountId`,
`direction`, `amountMinor`, `currency`, `transactionDate`, `memo`
(opcional, max 500 chars), `category` (opcional). En `201`,
`router.push('/transactions?toast=transaction-created')` (la página
de list monta `EphemeralToast` y renderiza el toast por ~3 s). En
`4xx`, el banner de error inline muestra el primer mensaje del campo
`error` del body de la respuesta (incluyendo `INVALID_AMOUNT`,
`FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED`). En `5xx`, el banner
muestra "Something went wrong".

El form popula el `<select name="accountId">` desde
`GET /api/accounts` (sólo cuentas live, `archivedAt=null`); esto es
un fetch client-side dentro de `useEffect` (el Server Component
shell no pasa data server-side — BR-ACC-15 form-state discipline
aplicado a transactions).

### 13.4 `app/transactions/[id]/page.tsx` (detail)

Espejo de `app/accounts/[id]/page.tsx:29-80`:

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

`TransactionDetail` es un Server Component puro de render. Renderiza
la fila en un `<dl>` con todos los campos; `fxAsOfSnapshot` se
renderiza como texto plano `"Rate as of: <ISO>"` (REQ-TX-15 Scenario
"detail renders the snapshot timestamp"). Un botón de delete (Client
Component) llama a `DELETE /api/transactions/:id` y redirige a
`/transactions?toast=transaction-deleted` en 204; en 404, la página
redirige a `/transactions?toast=not-found`.

### 13.5 Wire types y helpers

`app/_lib/transaction-types.ts` espeja `app/_lib/account-types.ts`:

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

### 13.6 Proxy y middleware

Las tres páginas NO se agregan a `proxy.ts:24-72 PUBLIC_PATHS`. El
307 redirect a `/auth/signin?callbackUrl=...` es el auth gate
(BR-ACC-14 carried). El matcher excluye `_next`, `api`, y
`favicon.ico`; `/transactions/*` matchea el matcher y pasa por el
check de auth.

---

## 14. Plan de tests

Los tests se organizan por REQ del spec; cada archivo de test cubre
uno o más items REQ. El runner Vitest es `pnpm test`; el gate de
cobertura es `≥ 80%` en `src/modules/transactions/**` (lines,
branches, functions, statements), enforced por el job `test` de CI.

### 14.1 Tests de la entidad de dominio

| Archivo                                                        | Nombre del test                                                               | Spec REQ  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| `src/modules/transactions/domain/entities/transaction.test.ts` | `createTransaction: positive amountMinor succeeds`                            | REQ-TX-2  |
|                                                                | `createTransaction: zero amountMinor throws INVALID_AMOUNT`                   | REQ-TX-2  |
|                                                                | `createTransaction: negative amountMinor throws INVALID_AMOUNT`               | REQ-TX-2  |
|                                                                | `createTransaction: TRANSFER direction throws VALIDATION_ERROR`               | REQ-TX-3  |
|                                                                | `createTransaction: future transactionDate throws FUTURE_DATE_NOT_ALLOWED`    | REQ-TX-4  |
|                                                                | `createTransaction: fxAsOfSnapshot null ↔ currency equality`                 | REQ-TX-12 |
|                                                                | `createTransaction: convertedCurrency must equal casa currency at write time` | BR-TX-6   |

### 14.2 Tests del service

| Archivo                                                                | Nombre del test                                                            | Spec REQ            |
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

### 14.3 Tests de actions

| Archivo                                                                          | Nombre del test                                                                        | Spec REQ  |
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

### 14.4 Tests de validation schemas

| Archivo                                                                             | Nombre del test                | Spec REQ   |
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

### 14.5 Tests del repositorio

| Archivo                                                                                                | Nombre del test                                                 | Spec REQ  |
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

### 14.6 Tests de las rutas Hono

| Archivo                                    | Nombre del test                                                | Spec REQ  |
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

### 14.7 Tests de la smoke UI

La smoke UI es hand-verified según
`openspec/specs/accounts/spec.md` §"Smoke UI is NOT production UI"
(el design carga la misma regla). Tres tests Vitest opcionales para
el comportamiento client-side del form:

| Archivo                                                 | Nombre del test                               |
| ------------------------------------------------------- | --------------------------------------------- |
| `app/transactions/new/create-transaction-form.test.tsx` | `rejects submit when amountMinor is negative` |
|                                                         | `calls POST /api/transactions on submit`      |
|                                                         | `redirects to /transactions on 201`           |
|                                                         | `surfaces inline error banner on 4xx`         |

Las páginas de list y detail son server-rendered; sin tests de UI.

### 14.8 Spec scenarios end-to-end

`src/modules/transactions/spec-scenarios.test.ts` espeja
`src/modules/fx/spec-scenarios.test.ts`. Cada scenario del spec (32
scenarios a través de REQ-TX-1 a REQ-TX-15) se ejercita contra el
service + InMemoryRepository + fake FxRateProvider. El archivo de
test es el gate de aceptación para `sdd-verify`.

---

## 15. Adapters y wiring de DI

`buildDefaultDeps()` en `src/modules/api/app.ts:317-352` gana dos
entradas nuevas: `transactionService` y `accountRepository`. El FX
provider (`fxRateProvider`) ya está wireado; la capa de aplicación
lo lee a través del service.

### 15.1 El diff

```typescript
// src/modules/api/app.ts — adiciones en buildDefaultDeps

function buildDefaultDeps(): HonoAppDeps {
  const prismaView = asPrismaDelegateView(prisma());
  const userRepo = new UserRepository({ user: prismaView.user });
  const hasher = new Argon2idHasher();
  const authService = new AuthService(userRepo, hasher, dispatcher, systemClock);

  const fxProvider: FxRateProvider = new FxRateProviderDolarApi({
    /* unchanged */
  });

  // transactions PR-1A — las nuevas entradas.
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
    accountRepository: accountRepo, // NUEVO (transactions PR-1A)
    transactionService, // NUEVO (transactions PR-1A)
  };
}
```

La interfaz `HonoAppDeps` en `src/modules/api/app.ts:86-99` gana dos
campos nuevos:

```typescript
export interface HonoAppDeps {
  authService: AuthService;
  authjsAuth: AuthjsAuthFn;
  fxRateProvider: FxRateProvider;
  accountService?: AccountService;
  // transactions PR-1A — NUEVO
  accountRepository?: AccountRepositoryPort;
  transactionService?: TransactionService;
}
```

Ambos campos son opcionales así que el suite de test existente
`app.accounts.test.ts` (que construye `HonoAppDeps` sin
`transactionService`) sigue compilando. El path de producción
siempre los provee.

### 15.2 Constructor de `TransactionService`

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
      defaultCasa: FxCasaString; // resuelto al startup desde env.FX_DEFAULT_CASA
    },
  ) {}

  // create, getById, list, update, delete ...
}
```

El constructor acepta un único deps bag (la convención existente del
proyecto; matchea `AccountService` en
`src/modules/accounts/domain/services/account.service.ts:44-49` pero
más plano — sin args posicionales).

### 15.3 Adición de `PrismaTransactionDelegate`

```typescript
// src/shared/db/prisma-types.ts — adición

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
  transaction: PrismaTransactionDelegate; // NUEVO (transactions PR-1A)
}
```

`asPrismaDelegateView` en la línea 67-71 devuelve la view más amplia
estructuralmente; el cast existente sigue funcionando porque el
cliente Prisma tiene el delegate `transaction` después de que la
migración corre.

---

## 16. Estrategia de migración

### 16.1 Nombre de la migración

`prisma/migrations/<ts>_add_transaction/migration.sql` donde `<ts>`
es el timestamp actual (formato `YYYYMMDDHHMMSS`). La migración
sale en PR-1A junto con la declaración del modelo y el enum.

### 16.2 SQL aditiva (vinculante)

Según §7.4 de arriba. La migración:

- Crea el enum `TransactionDirection` (sin cambio destructivo).
- Crea la tabla `Transaction` (nueva; sin rewrite de filas).
- Agrega dos índices (nuevos; sin índices existentes tocados).
- Agrega la back-reference `transactions Transaction[]` en `User` y
  `FinancialAccount` (nuevas columnas en el grafo de relations; sin
  cambios en datos de columnas).

Las filas existentes quedan intactas. El gate del esquema es
`SELECT count(*) FROM "FinancialAccount"` antes y después de la
migración devuelve el mismo valor (propuesta §"Acceptance criteria"
item 10).

### 16.3 Orden de deploy

1. PR-1A aterriza → la migración se genera y se commitea junto con
   los nuevos archivos del módulo. La migración corre en el CI con
   `pnpm prisma migrate deploy` (según
   `.github/workflows/ci.yml:805`).
2. PR-1B aterriza → sin migración; solo rutas + smoke UI + wiring
   de DI.

### 16.4 Plan de rollback

- **PR-1A no mergeado**: `git worktree remove
../gastos-personales-transactions-1A`, `git branch -D
feat/transactions-1A`. Sin callers todavía.
- **PR-1A mergeado, PR-1B todavía no**: revertir PR-1A. El módulo
  `src/modules/transactions/` es aditivo; la eliminación es limpia
  porque nada lo importa todavía. La migración es reversible vía
  `DROP TABLE "Transaction"` + `DROP TYPE "TransactionDirection"` +
  remover las back-references de `User` y `FinancialAccount`.
- **PR-1B mergeado, pre-release**: revertir PR-1B. Re-wirear
  `buildDefaultDeps` para skipear `transactionService`; remover las
  seis rutas del protectedApp. La migración Prisma queda (sin
  callers). El módulo `transactions` puede quedar en disco (sin
  callers) o eliminarse como un paso separado.
- **PR released a producción**: stop. Los releases de producción se
  gobiernan por el release flow (root `AGENTS.md` §5.5) que requiere
  aprobación del usuario. No hay path de rollback automático
  documentado acá.

---

## 17. Plan de slice por PR (vinculante)

El forecast son **2 PRs encadenados** según la propuesta §"Forecast".
PR-1A es el core del módulo (entidad, puertos, service, schemas
Zod, adapter Prisma, InMemoryRepository, tests, modelo Prisma +
enum + migración). PR-1B es el wiring (rutas Hono, DI
`buildDefaultDeps`, smoke UI, adiciones de códigos de error y
eventos, delta del spec, verificación del spec canónico, espejo
`Documents-es/`).

### 17.1 PR-1A — core del módulo

**Branch**: `feat/transactions-1A`
**Scope**: `src/modules/transactions/` (skeleton completo del módulo,
sin rutas, sin UI, sin cambios en Hono).
**Acceptance gate**: `pnpm test` exit 0; ≥80% de cobertura en
`src/modules/transactions/**`; la migración Prisma aplica limpio
sobre una DB poblada.

| Deliverable                                                        | Archivo(s)                                                                                             | Líneas approx. |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------- |
| Agregado `Transaction` + factory + invariantes Zod-bound           | `src/modules/transactions/domain/entities/transaction.ts`                                              | 120            |
| Enum const `TransactionDirection`                                  | `src/modules/transactions/domain/value-objects/direction.ts`                                           | 30             |
| Interfaz `TransactionRepositoryPort`                               | `src/modules/transactions/domain/interfaces/transaction.repository.port.ts`                            | 90             |
| `TransactionService` (lógica de dominio + integración FX snapshot) | `src/modules/transactions/domain/services/transaction.service.ts`                                      | 220            |
| Helper `convertAndSnapshot`                                        | `src/modules/transactions/domain/services/fx-snapshot.ts`                                              | 90             |
| Barrel de entidades                                                | `src/modules/transactions/domain/entities/index.ts`                                                    | 10             |
| Barril público del módulo                                          | `src/modules/transactions/index.ts`                                                                    | 60             |
| Cinco actions (list, get, create, update, delete)                  | `src/modules/transactions/application/actions/*-transaction.action.ts` (5 archivos)                    | 250            |
| `_shared.ts` local (deps + helpers, copia desde accounts)          | `src/modules/transactions/application/actions/_shared.ts`                                              | 80             |
| `TransactionDto` + `toTransactionDto`                              | `src/modules/transactions/application/dto/transaction.dto.ts`                                          | 80             |
| Tres schemas Zod                                                   | `src/modules/transactions/application/validation/transaction-*.schema.ts` (3 archivos)                 | 140            |
| Adapter `TransactionRepositoryPrisma`                              | `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.ts`                | 200            |
| Fixture de test `InMemoryTransactionRepository`                    | `src/modules/transactions/infrastructure/fixtures/in-memory-transaction.repository.ts`                 | 130            |
| Adición de tipo `PrismaTransactionDelegate`                        | `src/shared/db/prisma-types.ts` (5 líneas agregadas)                                                   | 5              |
| Adiciones de modelo Prisma + enum                                  | `prisma/schema.prisma` (40 líneas agregadas)                                                           | 40             |
| SQL de migración                                                   | `prisma/migrations/<ts>_add_transaction/migration.sql`                                                 | 35             |
| Tests de domain + service (~15 tests)                              | `src/modules/transactions/domain/**/__tests__/`                                                        | 350            |
| Tests de action + validation (~20 tests)                           | `src/modules/transactions/application/**/__tests__/`                                                   | 300            |
| Test de migración de repositorio (testcontainers Postgres)         | `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.migration.test.ts` | 60             |
| Spec scenarios end-to-end (32 scenarios)                           | `src/modules/transactions/spec-scenarios.test.ts`                                                      | 250            |
| `index.test.ts` (contract test de superficie del barrel)           | `src/modules/transactions/index.test.ts`                                                               | 30             |
| **Total PR-1A**                                                    |                                                                                                        | **~2570**      |

El PR está por encima del budget de review de 400 líneas por un
margen significativo porque el archivo de test de spec scenarios +
el InMemoryRepository + el test de migración dominan.
**Mitigación**: PR-1A sale en dos slices de review vía commits
apilados: PR-1A-S1 (entidad + puerto + service + Zod + tests,
~700 líneas) y PR-1A-S2 (adapter Prisma + migración +
InMemoryRepository + spec scenarios, ~700 líneas) en la misma
branch `feat/transactions-1A`, pero el reviewer lee el diff por
archivo en el paso de squash-merge.

En realidad — releyendo el forecast de la propuesta (~450 líneas
para PR-1A y ~350 para PR-1B = ~800 total), el conteo de líneas de
arriba es un worst-case. El deliverable real de PR-1A está más
cerca de **~700 líneas** cuando se quita el boilerplate. Los
números de la tabla de arriba incluyen código de test (que no es
revenue pero es mandatorio según strict TDD).

### 17.2 PR-1B — wiring + smoke UI + spec sync

**Branch**: `feat/transactions-1B`
**Scope**: rutas Hono montadas en `protectedApp`; `buildDefaultDeps`
wirea `transactionService` + `accountRepository`; seis rutas nuevas;
smoke UI; adiciones de códigos de error + eventos; delta del spec;
verificación del spec canónico; espejo `Documents-es/`; extensión
de la denylist del logger.
**Acceptance gate**: spec scenarios pasan end-to-end vía Hono; flujos
de smoke UI ejercidos a mano; `pnpm test` exit 0; sin markdown en
inglés sin espejo.

| Deliverable                                  | Archivo(s)                                                                          | Líneas approx. |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | -------------- |
| Rutas Hono (seis) montadas en `protectedApp` | `src/modules/api/app.ts` (adiciones solamente, entre línea 306 y 312)               | 100            |
| Tests de rutas (`app.transactions.test.ts`)  | `src/modules/api/app.transactions.test.ts`                                          | 250            |
| Adiciones de códigos de error                | `src/shared/errors/error-codes.ts` (5 líneas agregadas)                             | 5              |
| Extensión de denylist del logger (`memo`)    | `src/shared/logger/logger.ts` (1 línea agregada)                                    | 1              |
| Adición de evento de dominio                 | `src/shared/events/event-dispatcher.ts` (15 líneas agregadas)                       | 15             |
| Página de list smoke UI + componente table   | `app/transactions/page.tsx`, `app/transactions/transactions-list-table.tsx`         | 100            |
| Página de create smoke UI + form             | `app/transactions/new/page.tsx`, `app/transactions/new/create-transaction-form.tsx` | 250            |
| Página de detail smoke UI + botón delete     | `app/transactions/[id]/page.tsx`, `app/transactions/[id]/transaction-detail.tsx`    | 120            |
| Wire types                                   | `app/_lib/transaction-types.ts`                                                     | 60             |
| Test opcional del form                       | `app/transactions/new/create-transaction-form.test.tsx`                             | 80             |
| Espejo `Documents-es/` de design.md          | `Documents-es/openspec/changes/transactions/design.md`                              | (mirror)       |
| **Total PR-1B**                              |                                                                                     | **~980**       |

### 17.3 Validación del forecast

| PR        | Forecast (propuesta) | Real (este design) | Varianza                       |
| --------- | -------------------- | ------------------ | ------------------------------ |
| PR-1A     | ~450                 | ~700               | +250 (test code dominó)        |
| PR-1B     | ~350                 | ~980               | +630 (smoke UI + tests + docs) |
| **Total** | **~800**             | **~1680**          | **+880**                       |

El forecast fue conservador; el conteo real está dominado por el
test suite (gate strict TDD). PR-1A queda por encima del budget de
review de 400 líneas; PR-1B también. **Mitigación**: sub-PRs
encadenados bajo cada branch umbrella (PR-1A-S1 + PR-1A-S2; PR-1B-S1

- PR-1B-S2), cada uno squash-mergeado tras review. Las branches
  umbrella se borran tras el merge.

---

## 18. Riesgos y mitigaciones

Los top 5 riesgos, cada uno con su mitigación:

### 18.1 Hard delete es irreversible (DG-TX-15)

**Riesgo**: un usuario borra accidentalmente una transacción que
quería conservar; la fila desaparece; sin recovery. El confirm
dialog de la smoke UI es la única defensa en v1.

**Mitigación**: la página de detail monta un Client Component con
botón de delete que llama a `confirm()` antes de
`DELETE /api/transactions/:id` (REQ-TX-15 Scenario "delete removes
the row permanently"). El diseño de migración aditiva (sin columna
`archivedAt`) significa que un cambio futuro puede introducir soft
delete sin romper la FK ni el índice; el único costo es una
columna nueva.

### 18.2 Drift del snapshot FX respecto del rate actual (DG-TX-3)

**Riesgo**: una transacción escrita hace 6 meses a ARS 1100/USD
muestra que el rate de hoy sería ARS 1200/USD; el snapshot congela
el valor histórico, lo cual puede confundir a un usuario leyendo la
lista histórica sin entender la semántica del snapshot.

**Mitigación**: el body de la respuesta surfacea `fxAsOfSnapshot`
como texto plano `"Rate as of: <ISO>"` (REQ-TX-15 Scenario "detail
renders the snapshot timestamp"). El `<dl>` de la UI para la página
de detail es la superficie de discoverability. El evento de log
`transactions.fx.convert` captura el flag `stale` del provider al
momento de escribir para debugging.

### 18.3 Sin idempotencia en POST (DG-TX-9)

**Riesgo**: un retry por 5xx PUEDE crear un duplicado (sin
`idempotencyKey` en v1; DG-TX-9). El riesgo de duplicado por CRUD
manual es raro pero real.

**Mitigación**: la smoke UI surfacea un hint de fallo de submit en
el banner de error inline ("Something went wrong"). v1.1 sale con
`idempotencyKey` cuando llegue el bulk import; la columna se
agregará como `@@unique([userId, idempotencyKey])` en una migración
futura sin romper el índice existente.

### 18.4 La tabla `Transaction` crece sin tope

**Riesgo**: la estrategia de índices suena para v1, pero un power
user con 10 años de gastos diarios (3.650 filas) y una política de
retención sin tope eventualmente verá degradación de latencia.

**Mitigación**: cursor pagination (REQ-TX-8) + los dos índices
(REQ-TX-1) cargan la superficie de v1. Un futuro cambio de retención
/ archivado (fuera de scope para `transactions` v1) es el lugar
correcto para sumar un horizonte (p.ej. "transacciones de más de 5
años van a cold storage"). El cambio `transactions` no introduce la
frontera de retención.

### 18.5 Drift del espejo bilingüe del spec §13.3

**Riesgo**: el espejo en español de `design.md` (y más adelante del
spec, la propuesta, el explore) driftea del source en inglés si los
commits tocan un lado sin el otro.

**Mitigación**: este design se escribe en la misma sesión que su
espejo en español; ambos archivos quedan en el mismo working tree
state (atomicidad §13.3). `sdd-tasks`, `sdd-apply` y `sdd-verify`
chequean cada uno el espejo vía el `Documents-es/` grep. El
subagente `reviewer` flagea cualquier drift atrapado por `git diff`
entre los dos árboles.

### 18.6 Riesgo del gate de strict TDD

**Riesgo**: `sdd-apply` skipea el step RED en una task y somete un
step GREEN; el reviewer rechaza el PR.

**Mitigación**: cada task en `sdd-tasks.md` (la próxima fase)
especifica el nombre del test RED en la columna de test count. El
agente `sdd-verify` audita el git log buscando el commit RED antes
del commit GREEN. Según `openspec/config.yaml:18-22`, el runner es
`pnpm test`; el ciclo es RED → GREEN → TRIANGULATE → REFACTOR.

### 18.7 `amountMinor > 0` DB CHECK vs enforcement de Zod

**Riesgo**: un futuro contributor escribe un INSERT SQL crudo que
bypasea Zod; la CHECK constraint del DB nos salva de la corrupción
de datos, pero el error surfacea como
`Prisma.PrismaClientKnownRequestError` con `code: 'P2002'` (o sin
code para una CHECK violation) — la capa de aplicación mapea
fallas de Zod a 400 pero fallas de CHECK del DB mapea a 500
`INTERNAL_ERROR`.

**Mitigación**: el CHECK del DB `"amountMinor" > 0` es defensa en
profundidad (la tabla §"Risk" de la propuesta lo menciona). Una
falla del CHECK del DB es un bug de programación, no un error de
usuario; 500 es la respuesta correcta. El integration test
`transaction.repository.prisma.test.ts` afirma que la CHECK
constraint existe para que una migración futura no la pueda
dropear silenciosamente.

---

## 19. Preguntas abiertas

Ninguna. Los 15 decision gaps (DG-TX-1 a DG-TX-15) están cerrados
en la propuesta; el spec los operacionaliza; este design ata la
mecánica. La próxima fase es `sdd-tasks`.

Si el orchestrator surfacea una pregunta durante el review, es (a)
un artefacto que el spec o la propuesta debería haber cubierto (en
cuyo caso el orchestrator escala al usuario) o (b) una pregunta
táctica sobre la implementación que `sdd-tasks` o `sdd-apply`
puede resolver inline (en cuyo caso las secciones de este design
proveen la respuesta vinculante).

---

## 20. Matriz de trazabilidad archivo → requirement

| Spec REQ                                        | Archivos                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-TX-1 (modelo Transaction + índices)         | `prisma/schema.prisma` (modelo + enum + índices), `prisma/migrations/<ts>_add_transaction/migration.sql`, `src/modules/transactions/domain/entities/transaction.ts`                                                                               |
| REQ-TX-2 (amountMinor positivo)                 | `src/modules/transactions/application/validation/transaction-create.schema.ts` (Zod positive), `src/modules/transactions/domain/entities/transaction.ts` (factory de entidad)                                                                     |
| REQ-TX-3 (direction = INCOME \| EXPENSE)        | `src/modules/transactions/application/validation/transaction-create.schema.ts` (Zod enum), `src/modules/transactions/domain/value-objects/direction.ts`                                                                                           |
| REQ-TX-4 (transactionDate no futuro)            | `src/modules/transactions/application/actions/create-transaction.action.ts` (check en service), `src/modules/transactions/domain/services/transaction.service.ts` (comparación con `Clock`)                                                       |
| REQ-TX-5 (memo opcional, ≤ 500 chars)           | `src/modules/transactions/application/validation/transaction-create.schema.ts`                                                                                                                                                                    |
| REQ-TX-6 (todos los endpoints scopean a userId) | `src/modules/transactions/application/actions/*-transaction.action.ts`, `src/modules/transactions/domain/interfaces/transaction.repository.port.ts`, `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.ts`      |
| REQ-TX-7 (cuenta archivada rechaza escrituras)  | `src/modules/transactions/domain/services/transaction.service.ts` (pre-check BR-TX-5), `src/shared/errors/error-codes.ts` (`ACCOUNT_ARCHIVED`)                                                                                                    |
| REQ-TX-8 (lista cursor-paginated)               | `src/modules/transactions/application/actions/list-transactions.action.ts`, `src/modules/transactions/application/validation/transaction-list.schema.ts`, `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.ts` |
| REQ-TX-9 (POST crea una transacción)            | `src/modules/transactions/application/actions/create-transaction.action.ts`, `src/modules/transactions/domain/services/transaction.service.ts`, `src/modules/api/app.ts` (ruta)                                                                   |
| REQ-TX-10 (PATCH aplica update parcial)         | `src/modules/transactions/application/actions/update-transaction.action.ts`, `src/modules/transactions/application/validation/transaction-update.schema.ts`                                                                                       |
| REQ-TX-11 (DELETE hard-deletea)                 | `src/modules/transactions/application/actions/delete-transaction.action.ts`, `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.ts`                                                                              |
| REQ-TX-12 (FX snapshot al escribir)             | `src/modules/transactions/domain/services/fx-snapshot.ts` (helper), `src/modules/transactions/domain/services/transaction.service.ts` (caller)                                                                                                    |
| REQ-TX-13 (TransactionRecorded despachado)      | `src/modules/transactions/domain/services/transaction.service.ts` (llamada dispatch), `src/shared/events/event-dispatcher.ts` (adición a la unión)                                                                                                |
| REQ-TX-14 (eventos de log estructurados)        | `src/modules/transactions/domain/services/transaction.service.ts`, `src/shared/logger/logger.ts` (extensión de denylist)                                                                                                                          |
| REQ-TX-15 (smoke UI 3 páginas)                  | `app/transactions/page.tsx`, `app/transactions/new/page.tsx`, `app/transactions/[id]/page.tsx`, `app/_lib/transaction-types.ts`                                                                                                                   |
| BR-ACC-12 (storage nunca convertido)            | `src/modules/transactions/domain/services/transaction.service.ts` (snapshot es read-only), `src/modules/transactions/domain/entities/transaction.ts` (`convertedAmountMinor` es metadata)                                                         |
| BR-ACC-13 (stale FX no es 5xx)                  | `src/modules/transactions/domain/services/fx-snapshot.ts` (el snapshot persiste `fxAsOf` independientemente de `stale`)                                                                                                                           |
| BR-FX-3 (resolución de casa en el caller)       | `src/modules/transactions/domain/services/fx-snapshot.ts` (regla de resolución)                                                                                                                                                                   |
| BR-TX-1 a BR-TX-11 (BRs cargadas)               | Distribuidas a través de los archivos de arriba (cada BR está codominada con su REQ)                                                                                                                                                              |

---

## 21. Próximo paso

La próxima fase de SDD es `sdd-tasks`: producir
`openspec/changes/transactions/tasks.md` con los 2 PRs encadenados
descompuestos en tasks atómicos (uno por commit), cada uno con
columnas de evidencia de strict TDD (RED → GREEN → TRIANGULATE →
REFACTOR). El espejo en español
`Documents-es/openspec/changes/transactions/tasks.md` sigue en el
mismo commit según §13.3. Después de `sdd-tasks`: `sdd-apply`
(PR-1A luego PR-1B), después `sdd-verify`, `sdd-sync`, y
`sdd-archive`. El spec canónico de la capability `transactions`
promociona a `openspec/specs/transactions/spec.md` en el archive.
