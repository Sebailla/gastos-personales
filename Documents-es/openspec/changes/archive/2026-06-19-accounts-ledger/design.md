# Design — `accounts-ledger`

**Status**: draft · **Author**: Sebastián Illa
**Created**: 2026-06-18 · **Change**: `accounts-ledger`
**Spec**: `openspec/changes/accounts-ledger/specs/accounts/spec.md` (full spec, capability nueva)
**Proposal**: `openspec/changes/accounts-ledger/proposal.md` (v3)
**Capabilities affected**: `accounts` (nueva; el spec canónico aterriza en `openspec/specs/accounts/spec.md` al sincronizar)
**Stack**: v2 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4 (in scope según DG-V3-1 resuelta el 2026-06-18)
**Preflight**: interactive · `both` (OpenSpec + Engram) · `auto-forecast` · budget de review 400 líneas
**Strict TDD**: habilitado según `openspec/config.yaml`; runner `pnpm test`; ciclo RED → GREEN → TRIANGULATE → REFACTOR

> Este documento NO reabre el debate del spec. Implementa el
> "qué" del spec con el "cómo" — paths de archivos, ports,
> cadena de middleware, wiring de dependencias, setup de
> Tailwind v4, layout de tests strict-TDD, la matriz de
> trazabilidad file-to-requirement, las 4 design decisions que
> el spec dejó abiertas, y el forecast de rollout por PR. Un
> nuevo contributor puede leer esto y entender exactamente
> dónde aterriza cada Requirement del spec en el repo.

---

## 1. Summary

`accounts-ledger` es la segunda capability en salir después de `auth-foundation` (que aterrizó en Slices A/B/C; canónica en `openspec/specs/auth/spec.md`). Es dueña de la capability `accounts`: un ledger tipado de `FinancialAccount` (unión discriminada de 6 tipos) con un flow de create validado por Zod per-tipo, un ciclo de vida de soft-archive, y una superficie de conversión FX read-only display-only para capabilities downstream (`transactions`, `fx-cache`, `snapshots`, `reports`). El cambio sale en dos capas: la **capa API** (modelo Prisma + 7 endpoints Hono montados sobre el catch-all existente) y el **smoke UI slice** (3 páginas de Next.js App Router bajo `app/accounts/*` con un cliente Hono tipado y un setup de `Tailwind v4`). El `FxRateProvider` es un port declarado en este cambio; la implementación aterriza en el futuro cambio `fx-cache`. En este cambio, el endpoint de FX devuelve `503 FX_UNAVAILABLE` hasta que `fx-cache` salga; el smoke UI surface este error verbatim. Las invariantes cross-module vienen de `auth` (cada `FinancialAccount.userId === session.user.id`, resuelto vía `auth()` desde `src/modules/auth/index.ts`); el design nunca redefine la lectura de sesión.

---

## 2. Module structure (`src/modules/accounts/`)

El módulo `accounts` sigue el layout de architecture-standards (domain / application / infrastructure / interfaces) y está colocado junto al módulo `auth` existente bajo `src/modules/`. Las rutas Hono NO viven en `src/modules/accounts/interfaces/` porque la convención existente del proyecto (ver `src/modules/api/app.ts`) mantiene la instancia de `OpenAPIHono` en un módulo dedicado `src/modules/api/` que agrega las actions de cada capability. Las rutas nuevas se agregan a `src/modules/api/app.ts` (la sub-app de Hono) y se registran en `buildDefaultDeps()`.

```
src/modules/accounts/
├── domain/
│   ├── entities/
│   │   ├── financial-account.ts            # AccountType, AccountKind, InvestmentType,
│   │   │                                  # OpeningBalanceMode, AccountCurrency enums +
│   │   │                                  # shape de la entity FinancialAccount (sin import de Prisma)
│   │   ├── financial-account.test.ts       # tests unitarios: exhaustividad de enums,
│   │   │                                  # type discrimination, type-guard
│   │   └── index.ts                        # barrel: export { FinancialAccount, ...enums }
│   ├── value-objects/
│   │   ├── opening-balance.ts              # discriminated union FRESH | HISTORICAL con
│   │   │                                  # static factories `fresh()` y `historical(date, amount)`
│   │   │                                  # y validadores (amount >= 0, date <= now)
│   │   └── opening-balance.test.ts         # tests unitarios: invariantes de factory, reglas de validación
│   ├── services/
│   │   ├── account.service.ts              # business logic: create, list, getById, update,
│   │   │                                  # archive, unarchive, getBalance. Puro; depende
│   │   │                                  # de los dos ports (repository + FX provider).
│   │   └── account.service.test.ts         # tests unitarios con fake repo + fake FX provider
│   └── interfaces/
│       ├── account.repository.port.ts      # port: list / findById / create / update /
│       │                                  # archive / unarchive scoped a un userId
│       └── fx-rate-provider.port.ts        # port: getDisplayAmount(native, target) devuelve
│                                          # el shape { native, display, warnings? }
├── application/
│   ├── actions/
│   │   ├── list-accounts.action.ts         # lee userId de la sesión, llama AccountService.list
│   │   ├── get-account.action.ts           # lee :id del path, enforce ownership via repo
│   │   ├── create-account.action.ts        # parsea el body con Zod schema per-tipo, despacha
│   │   │                                  # evento AccountCreated (listener diferido)
│   │   ├── update-account.action.ts        # partial update, Zod per-tipo (subset de create)
│   │   ├── archive-account.action.ts       # setea archivedAt = now()
│   │   ├── unarchive-account.action.ts     # setea archivedAt = null
│   │   └── get-account-balance.action.ts   # llama AccountService.getBalance → usa el FX port
│   ├── validation/
│   │   ├── account-create.schema.ts        # Zod discriminated union sobre `type`; FRESH default;
│   │   │                                  # openingBalanceMinor >= 0; type-specific fields
│   │   ├── account-update.schema.ts        # Zod partial del create
│   │   ├── list-accounts.schema.ts         # Zod para ?cursor, ?limit (1..100), ?archivedAt
│   │   └── account-balance.schema.ts       # Zod para ?displayCurrency
│   └── dto/
│       ├── financial-account.dto.ts        # shape de respuesta por tipo
│       └── financial-account-balance.dto.ts
├── infrastructure/
│   ├── repositories/
│   │   ├── account.repository.prisma.ts    # implementa AccountRepositoryPort via prisma()
│   │   └── account.repository.prisma.test.ts  # tests de integración (testcontainers en CI;
│   │                                         # fake-Prisma en dev local)
│   └── external/
│       ├── fx-rate-provider.unconfigured.ts # stub in-change: devuelve 503 FX_UNAVAILABLE
│       │                                  # cuando no hay provider real registrado. Es el
│       │                                  # default en buildDefaultDeps() hasta que fx-cache salga.
│       └── fx-rate-provider.stub.ts        # fake de test: configurable per-test (success / 503 / 409)
└── index.ts                                # surface pública; exporta AccountService, types,
                                           # y el FX port. Otros módulos importan desde acá.

# Fakes de test co-localizados, usados por los application tests:
src/modules/accounts/application/__fakes__/
├── fake-account.repository.ts              # repo in-memory con la misma surface del port
└── fake-fx-rate-provider.ts                # configurable: success / 503 / 409
```

| Archivo                                                    | Propósito                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `domain/entities/financial-account.ts`                     | Entity pura en TS + 5 enums. El naming `FinancialAccount` desambigua del `Account` de Auth.js (OAuth link) en `src/modules/auth/domain/entities/account.ts`.                                                                       |
| `domain/value-objects/opening-balance.ts`                  | Discriminated union con dos static factories y un método `validate()`. La semántica del opening-balance es un value object, no un primitivo.                                                                                       |
| `domain/services/account.service.ts`                       | Business rules: qué fields son requeridos por tipo, la regla de nombre único, el ciclo de vida del soft-archive, la conversión FX. Puro (sin I/O).                                                                                 |
| `domain/interfaces/account.repository.port.ts`             | Repository port scoped a `userId`. La implementación en `infrastructure/` enforce la invariante cross-module `FinancialAccount.userId === session.user.id` en la capa de query (no se devuelven rows de otros users ni por error). |
| `domain/interfaces/fx-rate-provider.port.ts`               | FX port. El cambio `fx-cache` provee la implementación real.                                                                                                                                                                       |
| `application/actions/*.action.ts`                          | Los handlers de rutas Hono llaman a estos. Cada action toma `(deps, input)` y devuelve una discriminated union `{ status, data?                                                                                                    | error? }`(la convención del proyecto desde`auth-foundation-slice-c`). |
| `application/validation/*.schema.ts`                       | Zod schemas. El create schema es una `z.discriminatedUnion` sobre `type`; el refinement per-tipo enforce que el set de campos type-specific sea el correcto (rechaza `walletAddress` en `BANK`, etc.).                             |
| `infrastructure/repositories/account.repository.prisma.ts` | El adapter de Prisma. Los queries `findById` y `list` SIEMPRE llevan `userId` en la cláusula WHERE; no hay surface de API que permita al caller pasar `userId` al repo.                                                            |
| `infrastructure/external/fx-rate-provider.unconfigured.ts` | El stub FX in-change. Devuelve `AppError(FX_UNAVAILABLE, ...)` desde el método `getDisplayAmount` del port.                                                                                                                        |

**Dirección de dependencias arquitecturales (según architecture-standards)**:

```
UI (app/accounts/*) → Application (actions + validation) → Domain (services, ports)
                                                              ↑
                                       Infrastructure (repositories, FX stub) — implementa
```

- Domain no importa nada de `application/`, `infrastructure/`, ni `ui/`.
- Application solo importa de `domain/`.
- Infrastructure importa de `domain/` (para implementar ports) y de `@/shared/db/prisma` (el singleton del Prisma client del proyecto).
- UI importa de `application/` (actions) vía el Hono catch-all; no importa directamente de `domain/`.

---

## 3. Prisma schema (additive sobre `prisma/schema.prisma`)

El cambio agrega 5 enums + 1 modelo + 3 índices. Sin cambios destructivos de schema. La migración se genera una vez en PR-A con `pnpm prisma migrate dev --name add_financial_account`; los PRs B y C NO agregan migraciones.

```prisma
// prisma/schema.prisma (bloque aditivo, append después de los modelos de auth-foundation)

// ============================================================================
// accounts capability — agregado por accounts-ledger (PR-A, task A-2)
// Ver: openspec/changes/accounts-ledger/specs/accounts/spec.md
// Ver: openspec/changes/accounts-ledger/design.md §3
//
// Invariante cross-module: FinancialAccount.userId referencia User.id
// (definido por auth-foundation en openspec/specs/auth/spec.md, BR-AUTH-1)
// con onDelete: Cascade. La capa de application NO debe confiar en
// cualquier userId que venga en el body de un request; la sesión es la
// source of truth (openspec/changes/accounts-ledger/specs/accounts/spec.md,
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
  FRESH          // balance arranca en cero en la fecha de creación
  HISTORICAL     // balance está back-dated a openingBalanceDate
}

enum AccountCurrency {
  ARS
  USD
  EUR
}

model FinancialAccount {
  id                   String              @id @default(cuid())
  userId               String              // FK a User.id (auth capability)
  type                 AccountType         // requerido; uno de 6
  name                 String              // free-text, 1..80 chars; único por (userId, type)
  currency             AccountCurrency     // uno de { ARS, USD, EUR }
  openingBalanceMinor  Int                 // minor units (cents); >= 0 (BR-ACC-16, Decisión 7)
  openingBalanceMode   OpeningBalanceMode  // FRESH | HISTORICAL; FRESH default en la UI (Decisión 5)
  openingBalanceDate   DateTime?           // requerido si mode = HISTORICAL; null si no
  archivedAt           DateTime?           // soft-archive marker; null para cuentas vivas
                                        // (BR-ACC-17: el query del listado filtra archivedAt: null)

  // Type-specific fields (solo el set relevante se popula por tipo).
  // El Zod create schema (application/validation/account-create.schema.ts)
  // enforce que el set de campos del wrong-type sea rechazado en la API.
  bankName             String?             // solo BANK
  accountKind          AccountKind?        // solo BANK
  issuer               String?             // solo CREDIT
  creditLimitMinor     Int?                // solo CREDIT (opcional)
  statementDay         Int?                // solo CREDIT (1..31)
  paymentDueDay        Int?                // solo CREDIT (1..31)
  broker               String?             // solo INVESTMENT
  investmentType       InvestmentType?     // solo INVESTMENT
  walletAddress        String?             // solo CRYPTO (opcional)

  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt

  user                 User                @relation(fields: [userId], references: [id], onDelete: Cascade)

  // BR-ACC-17 (listado): el query live-first es WHERE userId = ? AND archivedAt IS NULL
  // ORDER BY createdAt DESC. El índice compuesto (userId, archivedAt) mantiene el
  // WHERE barato; el índice secundario (userId, createdAt) cubre el ORDER BY.
  @@unique([userId, type, name])           // nombres únicos por user y por type
  @@index([userId, archivedAt])            // listado: cuentas vivas primero
  @@index([userId, createdAt])             // listado: orden por recencia
}
```

**Notas sobre la migración**:

- El archivo de migración queda en `prisma/migrations/<timestamp>_add_financial_account/migration.sql` (timestamp generado por `pnpm prisma migrate dev`).
- El campo de relación en `User` se agrega en el modelo auth-owned: `financialAccounts FinancialAccount[]`. El `prisma migrate dev` edita `prisma/schema.prisma` para agregar la back-reference en `User`. Este es el único cambio de schema en el lado de auth.
- La constraint `@@unique([userId, type, name])` mapea al escenario del spec "name collision within (userId, type) is rejected → 409 NAME_TAKEN". El Prisma client surface esto como un error `P2002` de unique-violation; el adapter `account.repository.prisma.ts` lo traduce a `AppError(NAME_TAKEN, ...)`.

---

## 4. Hono routing

Los 7 endpoints se montan en el Hono catch-all existente en `app/api/[...path]/route.ts` (Slice B T-025). El catch-all delega cada `GET|POST|PATCH|DELETE` a `honoApp.fetch(request)`. Las 7 rutas nuevas se agregan a `src/modules/api/app.ts` junto a las 3 existentes (`/health`, `/me`, `/auth/register`). No se crea ningún archivo nuevo bajo `app/api/`. La precedencia de routing no se ve afectada: el file-based routing de Next.js sigue matcheando `app/api/auth/[...nextauth]/route.ts` antes que el catch-all, así que las rutas de Auth.js nunca llegan a Hono.

### 4.1 Rutas nuevas (agregadas a `createHonoApp` en `src/modules/api/app.ts`)

```typescript
// src/modules/api/app.ts — adición a createHonoApp(deps: HonoAppDeps)
// (las rutas existentes /health, /me, /auth/register no cambian)

// 1. Listar cuentas (BR: GET /api/accounts cursor-paginated, archivedAt=null)
app.get('/api/accounts', requireSession, async (c) => {
  const query = listAccountsSchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const res = await listAccountsAction(deps, c.get('user')!, query);
  return c.json(res.body, res.status as 200 | 401);
});

// 2. Crear cuenta (BR: POST /api/accounts, Zod per-tipo, 201 / 400 / 401 / 409)
app.post('/api/accounts', requireSession, async (c) => {
  const body = await c.req.json().catch(() => null);
  const res = await createAccountAction(deps, c.get('user')!, body);
  return c.json(res.body, res.status as 201 | 400 | 401 | 409);
});

// 3. Obtener una cuenta (BR: GET /api/accounts/:id, 200 / 401 / 404)
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

### 4.2 Cadena de middleware (en orden, de arriba a abajo)

1. `requestIdMiddleware` — setea `c.set('requestId', crypto.randomUUID())`; lo consume el error handler para correlación de logs.
2. `errorHandler` (`app.onError`) — convierte el `AppError` thrown en el envelope `{ error: { code, message, details? } }` y los errores unknown en `INTERNAL_ERROR` 500.
3. `authMiddleware` — llama a `deps.authjsAuth()` una vez por request, setea `c.set('user', session?.user ?? null)`. Este es el middleware global existente desde `auth-foundation-slice-c`.
4. `requireSession` (middleware per-route, agregado en este cambio) — devuelve 401 `UNAUTHORIZED` si `c.get('user')` es null. El handler nunca llega a la action si no. Este es el short-circuit 401 que el spec exige para los 7 endpoints.
5. Route handler (llama a la action con `deps` y el user del context).

El helper `requireSession` es un factory de middleware Hono thin en `src/modules/api/middlewares/require-session.ts`:

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

### 4.3 Wiring de dependencias (extensión de `HonoAppDeps`)

`HonoAppDeps` gana los services relacionados a accounts. Los fields existentes `authService` y `authjsAuth` quedan sin cambios.

```typescript
// src/modules/api/app.ts — interface extendida
export interface HonoAppDeps {
  // existentes (auth-foundation)
  authService: AuthService;
  authjsAuth: AuthjsAuthFn;
  // nuevos (accounts-ledger)
  accountService: AccountService;
  fxRateProvider: FxRateProvider; // port; la impl in-change es el stub "unconfigured"
}
```

`buildDefaultDeps()` se extiende para construir `AccountService` con el Prisma repository + el stub `FxRateProviderUnconfigured`. El `AppType` de la Hono app (y por lo tanto el typed client `hc<AppType>`) toma automáticamente las nuevas rutas — no se necesita cambio alguno del lado del cliente para mantener la type safety.

### 4.4 Typed Hono client

`src/modules/api/client.ts` ya expone `apiClient = (baseUrl) => hc<AppType>(baseUrl)`. Este cambio NO modifica el client. El código de la UI llama a `apiClient(process.env.NEXT_PUBLIC_API_URL).api.accounts.$get(...)` y obtiene type safety completa en cada endpoint, query parameter, y shape de respuesta. El `AppType` es `typeof honoApp`, así que el cambio a `app.ts` automáticamente amplía la surface de tipos del cliente.

---

## 5. `FxRateProvider` port

El port `FxRateProvider` se declara en la capa de domain (`src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`) y se implementa en `src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts` (el stub in-change). El futuro cambio `fx-cache` provee una implementación real que se inyecta en `buildDefaultDeps()` (probablemente editando `buildDefaultDeps()` para aceptar un registry, o reemplazando el import en `app.ts`).

### 5.1 Interface del port

```typescript
// src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts
import type { AccountCurrency } from '../entities/financial-account';

export interface FxConversionRequest {
  readonly native: {
    readonly amount: number; // minor units (p.ej. cents)
    readonly currency: AccountCurrency;
  };
  readonly displayCurrency: AccountCurrency;
  readonly asOf: Date; // cuándo el caller observó el balance; el provider
  // puede devolver rates stale (BR-ACC-13) y surface fxAsOf
}

export interface FxConversionResult {
  readonly native: { amount: number; currency: AccountCurrency };
  readonly display: {
    readonly amount: number; // minor units, convertido
    readonly currency: AccountCurrency;
    readonly fxRate: number; // p.ej. 0.92 (display units por native unit)
    readonly fxAsOf: Date; // timestamp del rate; puede ser stale
  };
  readonly warnings?: string[]; // p.ej. ["rate is older than 24h"]
}

export interface FxRateProvider {
  /**
   * Devuelve el monto convertido. El balance native nunca se muta
   * (BR-ACC-12). Throws AppError(FX_UNAVAILABLE) cuando el provider
   * no puede responder (p.ej. no hay implementación registrada — el
   * stub "unconfigured" siempre throws esto). Throws AppError(
   * FX_NOT_SUPPORTED) cuando el provider no soporta el par.
   */
  getDisplayAmount(request: FxConversionRequest): Promise<FxConversionResult>;
}
```

### 5.2 Implementación in-change: `FxRateProviderUnconfigured`

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
 * Stub FX in-change. Siempre devuelve 503 FX_UNAVAILABLE. Este es
 * el default en buildDefaultDeps() hasta que el cambio fx-cache
 * provea una implementación real. El smoke UI surface el 503
 * resultante con el error inline "FX rate provider unavailable.
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

El futuro cambio `fx-cache` provee `FxRateProviderLive` (o similar) que implementa el mismo port con un cache de rates + provider real (p.ej. exchangerate.host, Frankfurter, o un provider custom). Cablearlo es un cambio de una línea en `buildDefaultDeps()` y un swap de un solo import en `app.ts`. La capa de action no cambia.

### 5.3 Shape de respuesta FX en éxito

La respuesta de éxito de la action es el envelope del spec (BR-ACC-12):

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

Cuando `native.currency === displayCurrency`, se espera que el provider live haga short-circuit y devuelva `{ native, display: { amount: native.amount, currency: native.currency, fxRate: 1, fxAsOf: <now> } }` sin `warnings`. La action no tiene un caso especial para esto; lo hace el provider.

---

## 6. UI smoke slice architecture

El smoke UI **NO** es la UI de producción. Existe para (a) validar la surface de la API end-to-end, (b) darle al futuro cambio `ui-accounts` una referencia de cliente tipado y de patrón de form, y (c) permitir que un developer o PM ejercite la API en menos de cinco minutos a mano. Sin auditoría de accesibilidad, sin i18n, sin design system, sin SSR caching, sin error boundaries más allá del `error.tsx` de Next.js. Cada header de página lleva un comentario `// smoke-minimal, not production`.

### 6.1 Árbol de páginas

```
app/accounts/
├── page.tsx                          # Server Component: list view (BR-ACC-17)
├── accounts-list-table.tsx           # render puro: <table> + footer "Showing first 50 of N"
├── new/
│   ├── page.tsx                      # Server Component shell (resuelve sesión, renderiza el form)
│   └── create-account-form.tsx       # Client Component: form type-driven, reset al cambiar type,
│                                     # openingBalanceMode default FRESH, toast post-201
└── [id]/
    ├── page.tsx                      # Server Component: detail + balance widget
    ├── account-detail.tsx            # render puro: <dl> para la fila completa
    └── balance-widget.tsx            # Client Component: native + select displayCurrency + submit
                                      # + "Last updated: …" / error inline

app/_components/
└── ephemeral-toast.tsx               # Client Component: <div role="status"> con local state;
                                      # auto-dismiss después de 3 s; sin librería, sin context.
```

### 6.2 Patrón de Server Component (las 3 páginas)

```typescript
// app/accounts/page.tsx (list — Server Component)
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/modules/auth';
import { apiClient } from '@/modules/api';
import { AccountsListTable } from './accounts-list-table';
import { EphemeralToast } from '@/app/_components/ephemeral-toast';

export const dynamic = 'force-dynamic'; // session-driven; sin static caching

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/accounts'));
  }

  // El Server Component llama a la API de Hono in-process — sin fetch round-trip.
  // El query del listado siempre lleva archivedAt=null (BR-ACC-17).
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

      {/* Renderiza el toast del search param si está presente (BR-ACC-16, BR-ACC-19).
          La página de detail redirige con ?toast=account-created o
          ?toast=not-found; este componente lee el search param y renderiza
          durante 3 s. */}
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

El patrón de Server Component es el mismo en `/new` y `/[id]`: resolver la sesión vía `auth()`, short-circuit en sesión faltante con `redirect()`, llamar a la API de Hono in-process (vía el wrapper de cliente tipado, no `fetch`), renderizar la página. La llamada in-process evita el round-trip HTTP y la env var `NEXT_PUBLIC_API_URL` para SSR; el cliente tipado se usa directamente con la instancia de honoApp.

**Llamada directa a honoApp vs `fetch`**: el Server Component llama a `honoApp.request(new Request(...))` in-process, con la dep `authjsAuth` inyectando el mismo `auth()` que producción usa. Este es el mismo patrón que usa `meAction` de auth-foundation (recibe `c` desde Hono, no un `Request`). El beneficio: sin env var `NEXT_PUBLIC_API_URL`, sin riesgo de SSRF, y el cliente tipado es el mismo que usan los client components, así que la type safety es uniforme. El costo: el Server Component debe construir un objeto `Request` de Hono a mano con la URL y los headers correctos; esto se envuelve en un helper chico en `src/lib/server-hono.ts`.

### 6.3 Import de `auth()`: el entry point cross-module

Los Server Components importan `auth` desde `@/modules/auth` (la surface pública definida en `src/modules/auth/index.ts`). Este es el mismo import que usa el `middleware.ts` de auth-foundation. Según la regla cross-module de architecture-standards, la UI NO debe importar directamente desde `@/modules/auth/infrastructure/...` o `@/modules/auth/domain/...`; la surface pública es el único path de import permitido. `tsconfig.json#compilerOptions.verbatimModuleSyntax` (ya habilitado en este proyecto) hace que cualquier import no-público sea un error de compilación.

### 6.4 Mecanismo de toast (`<div role="status">` con local state)

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
 * Lee ?toast=<key> de los search params y renderiza el mensaje
 * durante ~3 s, después dismiss. Sin librería, sin context.
 * BR-ACC-16 (create) y BR-ACC-19 (detail 404) redirigen con
 * ?toast=… y dependen de este componente para renderizar la
 * confirmación efímera.
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

El toast se renderiza en la página de listado (`/accounts`), porque tanto el redirect post-create (BR-ACC-16) como el redirect del detail 404 (BR-ACC-19) caen en `/accounts` con un query parameter `?toast=…`. La página de listado es el único lugar donde el toast está montado.

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
      // El Server Component pasa el cliente tipado como prop O el
      // Client Component lo construye desde NEXT_PUBLIC_API_URL. El
      // design elige: pasar vía prop (evita la env var en el bundle del cliente).
      const res = await fetch(`/api/accounts/${accountId}/balance?displayCurrency=${displayCurrency}`, {
        method: 'GET',
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error.message);
        return;
      }
      setResult(json.data.display);
      router.refresh();   // BR-ACC-18: refresca data server-derived
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

El widget renderiza la whitelist completa `{ ARS, USD, EUR }` según BR-ACC-18 (Decisión 8) — la currency native NO se filtra. El texto "Last updated: …" es plano (sin styling de warning) según Decisión 3.

### 6.6 Create form (Client Component) — type-driven

El create form es una discriminated union sobre `type`. Al cambiar `type`, todos los campos type-specific se resetean a defaults (Decisión 6). El default de openingBalanceMode es FRESH (Decisión 5). El input de openingBalanceMinor valida `>= 0` en el cliente (el submit button queda deshabilitado o muestra un error inline) y en el server (Zod schema). En `201`, el form llama a `router.push('/accounts?toast=account-created')` (el toast se renderiza en la página de listado, no en `/new`).

El mapping completo de campos per-tipo es:

| `type`       | Type-specific fields                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| `BANK`       | `bankName` (text, required), `accountKind` (select SAVINGS / CHECKING)                                        |
| `CREDIT`     | `issuer` (text, required), `creditLimit` (number, opcional), `statementDay` (1..31), `paymentDueDay` (1..31)  |
| `INVESTMENT` | `broker` (text, required), `investmentType` (select STOCKS / BONDS / MUTUAL_FUNDS / CERTS_OF_DEPOSIT / OTHER) |
| `CRYPTO`     | `walletAddress` (text, opcional)                                                                              |
| `CASH`       | (none)                                                                                                        |
| `OTHER`      | (none)                                                                                                        |

El Zod schema (`account-create.schema.ts`) es un `z.discriminatedUnion('type', [bankSchema, creditSchema, …])`; el refinement per-tipo enforce que `walletAddress` se setee solo en `CRYPTO`, etc. (según el escenario del spec "type-specific field set for the wrong type is rejected → 400 VALIDATION_ERROR").

---

## 7. Tailwind v4 setup (concreto)

DG-V3-1 (Tailwind in scope) se resolvió el 2026-06-18. Esta sección cierra el follow-up abierto sobre el setup concreto de Tailwind v4 + Next.js 16 + pnpm.

### 7.1 Pinning de versión (según la policy de pnpm-lock.yaml del proyecto)

Tailwind v4 estable + la integración oficial de Next.js es el target. El `package.json` pinea:

```json
{
  "devDependencies": {
    "tailwindcss": "^4.1.0",
    "@tailwindcss/postcss": "^4.1.0",
    "postcss": "^8.4.0"
  }
}
```

El comando de install (PR-A, task A-3):

```bash
pnpm add -D tailwindcss@^4.1.0 @tailwindcss/postcss@^4.1.0 postcss@^8.4.0
```

`pnpm-lock.yaml` DEBE commitearse en el mismo commit (root `AGENTS.md` §5.3; el check de Husky pre-commit lo enforce).

### 7.2 `postcss.config.mjs` (root del proyecto)

```javascript
// postcss.config.mjs
// Next.js 16 + Tailwind v4 PostCSS integration. El plugin oficial
// `@tailwindcss/postcss` reemplaza al plugin PostCSS legacy
// `tailwindcss` que venía con Tailwind v3.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

### 7.3 `app/globals.css` (archivo nuevo, importado una vez en `app/layout.tsx`)

```css
/* app/globals.css — Tailwind v4 single-import directive */
@import 'tailwindcss';
```

Tailwind v4 reemplaza el setup de tres directivas (`@tailwind base; @tailwind components; @tailwind utilities;`) por un único `@import "tailwindcss";` (v4 unificó la surface de import). La detección de content paths es automática en v4 — el plugin escanea el working directory por default; no se requieren content paths explícitos en `tailwind.config.ts` para v4 con el plugin PostCSS. El smoke UI NO necesita un `tailwind.config.ts` para content paths; si el proyecto quiere theme tokens o utilities custom más adelante, ese archivo se agrega en `ui-accounts` (el cambio de UI de producción).

### 7.4 Verificación del install

```bash
pnpm install
pnpm exec next build      # PostCSS debe procesar globals.css; el build falla si está mal configurado
```

Si `next build` pasa, el setup de Tailwind v4 está correcto. La página del smoke UI queda entonces corrida en `pnpm dev` → sign in → `/accounts`. La primera corrida de la página muestra el empty state estilado con el botón `New account`.

### 7.5 Compatibilidad Next.js 16 + Tailwind v4

El pipeline de PostCSS de Next.js 16 acepta el plugin `@tailwindcss/postcss` nativamente. El issue conocido de setups anteriores de Next.js + Tailwind v3 (el `content` glob en `tailwind.config.ts` que no matcheaba el App Router) no aplica a v4 con el import unificado. El apply worker DEBE verificar en el primer build que el import de `globals.css` resuelve y que las utility classes como `bg-blue-600` se aplican. Si hay una incompatibilidad v4/Next 16 (poco común a mitad de 2026 pero posible), el fallback es Tailwind v3 con el setup clásico de tres directivas — flagged en `risks` más abajo.

---

## 8. Validación y errores

### 8.1 Zod schemas (por operación, por tipo)

```typescript
// src/modules/accounts/application/validation/account-create.schema.ts
import { z } from 'zod';

const accountCurrencySchema = z.enum(['ARS', 'USD', 'EUR']);

const openingBalanceSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('FRESH'),
    amount: z.number().int().min(0), // BR-ACC-16 (Decisión 7)
    date: z.null().optional(),
  }),
  z.object({
    mode: z.literal('HISTORICAL'),
    amount: z.number().int().min(0), // BR-ACC-16 (Decisión 7)
    date: z.coerce.date(), // requerido si HISTORICAL
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

`account-update.schema.ts` es un `z.partial()` del create schema (cualquier field opcional, pero con el mismo refinement per-tipo).

`list-accounts.schema.ts`:

```typescript
export const listAccountsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // archivedAt siempre es 'null' para el smoke slice (BR-ACC-17).
  // El schema es permisivo: ?archivedAt=null está permitido, cualquier otra cosa se ignora.
  archivedAt: z.literal('null').optional(),
});
```

`account-balance.schema.ts`:

```typescript
export const accountBalanceSchema = z.object({
  displayCurrency: z.enum(['ARS', 'USD', 'EUR']),
});
```

### 8.2 Envelope estándar de error

El envelope de error es la convención del proyecto (`src/shared/http/error-handler.ts`): `{ error: { code, message, details? } }`. El `code` es el string machine-readable que la UI matchea; el `message` es el string human-facing (español en producción, inglés en el smoke slice según Decisión 1). El field `details` carga la lista de Zod issues cuando `code = VALIDATION_ERROR`.

### 8.3 Adiciones al registry de error codes

`src/shared/errors/error-codes.ts` gana los siguientes codes (aditivo, non-breaking):

```typescript
// src/shared/errors/error-codes.ts — adiciones
export const ErrorCode = {
  // ... codes existentes
  NOT_FOUND: 'NOT_FOUND', // 404
  NAME_TAKEN: 'NAME_TAKEN', // 409 (P2002 unique violation sobre (userId, type, name))
  FX_UNAVAILABLE: 'FX_UNAVAILABLE', // 503 (no hay provider registrado, o provider caído)
  FX_NOT_SUPPORTED: 'FX_NOT_SUPPORTED', // 409 (el provider no soporta el par)
} as const;

export const ErrorStatus: Record<ErrorCode, number> = {
  // ... statuses existentes
  NOT_FOUND: 404,
  NAME_TAKEN: 409,
  FX_UNAVAILABLE: 503,
  FX_NOT_SUPPORTED: 409,
};
```

`FX_UNAVAILABLE` mapea a HTTP 503 (Service Unavailable), consistente con el patrón del skill `api-design` para upstream unavailability (el code `OAUTH_PROVIDER_UNAVAILABLE` usa 502; el FX es una capa diferente así que 503 es más preciso — el subsistema FX está caído, no el provider upstream).

### 8.4 Dónde se tiran los errores

| Capa                               | Tira                                                                                                                                                                                                                                 | Notas                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Hono middleware (`requireSession`) | `AppError(UNAUTHORIZED, ...)`                                                                                                                                                                                                        | Una vez por ruta; short-circuitea el handler.                                            |
| Application action                 | `AppError(VALIDATION_ERROR, ..., details: zodIssues)` cuando el body parseado falla. `AppError(NAME_TAKEN, ...)` cuando la unique constraint se dispara. `AppError(NOT_FOUND, ...)` cuando la row no existe o pertenece a otro user. | La action NO tira en `200` o `201`; devuelve una discriminated union `{ status, body }`. |
| Domain service                     | `AppError(NOT_FOUND, ...)`, `AppError(NAME_TAKEN, ...)`, `AppError(FX_UNAVAILABLE, ...)`, `AppError(FX_NOT_SUPPORTED, ...)`                                                                                                          | Los domain services tiran porque codifican las business rules.                           |
| Infrastructure repository          | `Prisma.PrismaClientKnownRequestError` (P2002 unique violation); convertido a `AppError(NAME_TAKEN, ...)` por la action. Otros errores de Prisma se propagan y los cacha el `errorHandler` central como `INTERNAL_ERROR`.            | El adapter no tira business errors.                                                      |
| FxRateProvider (unconfigured)      | `AppError(FX_UNAVAILABLE, ...)` siempre                                                                                                                                                                                              | Según §5.2.                                                                              |

---

## 9. Auth integration

La capability `auth` es la fuente de invariantes cross-module. El módulo accounts nunca re-implementa la lectura de sesión; llama a `auth()` desde `@/modules/auth` y trata el resultado como la source of truth para `userId`.

### 9.1 El único entry point

`auth` se importa desde `@/modules/auth` (la surface pública en `src/modules/auth/index.ts`). El `authMiddleware` de Hono llama a `deps.authjsAuth()` una vez por request y setea `c.set('user', session?.user ?? null)`. Las rutas y Server Components del módulo accounts consumen el user desde `c.get('user')` (Hono context) o `await auth()` (Server Component). Hay exactamente un path de import; no hay llamadas directas a `getServerSession` o `getToken`.

### 9.2 La invariante cross-module: `FinancialAccount.userId === session.user.id`

La invariante se enforce en DOS capas:

1. **Capa action**: cada action recibe `user` como parámetro desde `c.get('user')` (Hono) o `await auth()` (Server Component). La action NUNCA acepta un `userId` del body del request o de un query parameter. Los Zod schemas para create / update / list no tienen un field `userId`. PATCH sobre una row de otro user devuelve `404 NOT_FOUND` (no se filtra la existencia — escenario del spec "another user's account returns 404").

2. **Capa repository**: cada método de query en `AccountRepositoryPort` acepta `userId` como argumento requerido. La implementación `account.repository.prisma.ts` SIEMPRE incluye `userId` en la cláusula WHERE; no hay un método `findById(id)` que pueda filtrar rows de otros users. La signature `findById(userId, id)` es el contrato. El TypeScript compiler enforce esto; el trabajo del reviewer es verificar que ningún método en el adapter omite el filtro `userId`.

### 9.3 `requireSession` vs `auth()` directo

- **En el Hono catch-all**: middleware `requireSession`. El handler nunca se ejecuta sin un user.
- **En Server Components**: `await auth()` directo, después `if (!session?.user) redirect(...)`. Sin un equivalente de `requireSession`; el Server Component hace el check inline porque el target del redirect es una concern de `next/navigation`.

Ambos paths convergen sobre el mismo `auth()` desde `@/modules/auth`. El setting `verbatimModuleSyntax: true` en `tsconfig.json` hace que cualquier import no-público sea un error de build, así que el entry point no puede derivar.

---

## 10. Test layout (strict TDD)

### 10.1 Adiciones a `vitest.config.ts`

`vitest.config.ts` ya incluye `src/modules/**` y `app/**` (según el setup de auth-foundation). Los tests del módulo accounts viven bajo `src/modules/accounts/**` y los recogen los patrones `include` existentes. No se necesita ningún cambio en `vitest.config.ts` para tests unitarios / application / API. Los tests del smoke UI están explícitamente NO incluidos (el slice se verifica a mano; ver §10.5).

### 10.2 Tests unitarios (domain)

| Archivo                                                             | Cobertura                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/modules/accounts/domain/entities/financial-account.test.ts`    | Exhaustividad de enums (los 6 valores de AccountType, los 5 enums); type-guard para el shape de la entity.                                                                                                                                                                                             |
| `src/modules/accounts/domain/value-objects/opening-balance.test.ts` | Factory `fresh()`; factory `historical(date, amount)`; `amount >= 0`; `date <= now` para HISTORICAL.                                                                                                                                                                                                   |
| `src/modules/accounts/domain/services/account.service.test.ts`      | Todos los métodos del service con fake repo + fake FX provider. Patrón AAA. 7+ escenarios: list omite archivados; getById devuelve 404 en cross-user; create enforce nombre único; create rechaza campos wrong-type; archive / unarchive toggles `archivedAt`; getBalance devuelve native sin cambios. |

### 10.3 Application tests

| Archivo                                                                       | Cobertura                                                                                                                                                             |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/accounts/application/actions/list-accounts.action.test.ts`       | Inyecta fake repo + fake session; asserta que la action devuelve el shape paginado.                                                                                   |
| `src/modules/accounts/application/actions/create-account.action.test.ts`      | Asserta: validación Zod rechaza body malformado → `VALIDATION_ERROR`; Zod per-tipo rechaza campo wrong-type → `VALIDATION_ERROR`; colisión unique → `NAME_TAKEN`.     |
| `src/modules/accounts/application/actions/get-account-balance.action.test.ts` | Asserta: 200 con shape `{ native, display, warnings? }` en éxito; 503 cuando el FX provider tira `FX_UNAVAILABLE`; 409 cuando el FX provider tira `FX_NOT_SUPPORTED`. |

### 10.4 API integration tests

Los 7 endpoints se testan a través de la sub-app de Hono via `honoApp.request(new Request(...))` (el mismo patrón que usa `src/modules/api/app.test.ts` para las rutas de auth). Esto evita el costo de spawear un proceso `next dev`.

| Archivo                                                | Cobertura                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/api/app.accounts.test.ts` (archivo nuevo) | 7 endpoints × ≥2 escenarios cada uno = 14+ tests. Inyecta un `accountService` fake y un `fxRateProvider` fake vía `createHonoApp`. Asserta: 401 cuando no hay sesión; happy path 200/201; error paths 400/404/409/503. La matriz 7-endpoints × 2-escenarios matchea el conteo de Requirements del spec. |

### 10.5 UI smoke slice: SIN tests automatizados

El smoke UI está **explícitamente no testeado por Vitest** (según la sección "Smoke UI is NOT production UI" del spec y los acceptance criteria del spec, que listan la verificación a mano como gate). La rationale:

- El smoke UI es un harness de validación, no una surface de producto. El costo del setup de Playwright/Cypress excede el valor de la cobertura automatizada para un slice que va a ser reemplazado por `ui-accounts` en un cambio futuro.
- El contrato de la API ya está cubierto por los tests de integración de Hono en §10.4; la UI es un shell fino sobre esos endpoints.
- La verificación a mano por el developer o PM (según la tabla "Users and situations" del proposal) es el gate documentado.

Si un reviewer exige tests de UI, la respuesta es: el slice está documentado como hand-verified; el futuro cambio `ui-accounts` va a ser dueño del suite de tests de UI de producción. Agregar tests de UI al smoke slice está fuera de scope y explícitamente fuera de scope en la sección "Non-goals" del proposal.

### 10.6 Patrón AAA + 80% de cobertura

Cada test sigue el patrón AAA (Arrange-Act-Assert) según `testing-standards`. El target de cobertura es **≥80% en `src/modules/accounts/**`** (lines, branches, functions, statements), enforced por el job `test`de CI. El comando de CI es`pnpm test --coverage`. Dev local corre el mismo comando sin `--coverage`por velocidad; el hook de Husky pre-commit está configurado para correr el suite completo + cobertura sobre los archivos de test stagedeados (según la config de strict TDD en`openspec/config.yaml`).

### 10.7 Evidencia strict TDD (por task)

Cada task de `apply` sale con un cuerpo de commit que incluye la evidencia RED → GREEN → TRIANGULATE → REFACTOR de la forma:

```
test(<scope>): <red> add failing test for <X>
feat(<scope>): <green> implement <X> to make the test pass
test(<scope>): <triangulate> add 2 more cases for <X>
refactor(<scope>): <X> extract <Y> for clarity
```

El apply worker sigue la disciplina; el reviewer de verify audita el log de commits.

---

## 11. File-to-requirement traceability matrix

La matriz mapea cada Requirement del spec a los archivos que lo implementan. El reviewer lee esto y sabe dónde mirar. Los Requirements se referencian por el heading de su sección en el spec (truncados para ancho de tabla).

| Spec Requirement                                                                          | Domain                                                                            | Application                                                                                             | Infrastructure                                                                                 | Interface / UI                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FinancialAccount persists the 6-type discriminated model`                                | `domain/entities/financial-account.ts`, `domain/value-objects/opening-balance.ts` | `application/validation/account-create.schema.ts`                                                       | `infrastructure/repositories/account.repository.prisma.ts`, `prisma/schema.prisma` (migration) | —                                                                                                                                                  |
| `GET /api/accounts returns a cursor-paginated list scoped to the authenticated user`      | `domain/services/account.service.ts` (`list`)                                     | `application/actions/list-accounts.action.ts`, `application/validation/list-accounts.schema.ts`         | —                                                                                              | `src/modules/api/app.ts` (route), `app/accounts/page.tsx` (UI)                                                                                     |
| `POST /api/accounts creates a type-driven account`                                        | `domain/services/account.service.ts` (`create`)                                   | `application/actions/create-account.action.ts`, `application/validation/account-create.schema.ts`       | `infrastructure/repositories/account.repository.prisma.ts`                                     | `src/modules/api/app.ts` (route), `app/accounts/new/page.tsx` + `create-account-form.tsx` (UI)                                                     |
| `GET /api/accounts/:id returns one account or 404 on cross-user`                          | `domain/services/account.service.ts` (`getById`)                                  | `application/actions/get-account.action.ts`                                                             | `infrastructure/repositories/account.repository.prisma.ts`                                     | `src/modules/api/app.ts` (route), `app/accounts/[id]/page.tsx` (UI)                                                                                |
| `PATCH /api/accounts/:id applies a partial update`                                        | `domain/services/account.service.ts` (`update`)                                   | `application/actions/update-account.action.ts`, `application/validation/account-update.schema.ts`       | `infrastructure/repositories/account.repository.prisma.ts`                                     | `src/modules/api/app.ts` (route) — la UI no lo llama en el smoke                                                                                   |
| `POST /api/accounts/:id/archive soft-archives the account`                                | `domain/services/account.service.ts` (`archive`)                                  | `application/actions/archive-account.action.ts`                                                         | `infrastructure/repositories/account.repository.prisma.ts`                                     | `src/modules/api/app.ts` (route) — la UI no lo llama en el smoke                                                                                   |
| `POST /api/accounts/:id/unarchive restores the account`                                   | `domain/services/account.service.ts` (`unarchive`)                                | `application/actions/unarchive-account.action.ts`                                                       | `infrastructure/repositories/account.repository.prisma.ts`                                     | `src/modules/api/app.ts` (route) — la UI no lo llama en el smoke                                                                                   |
| `GET /api/accounts/:id/balance returns the display-only FX conversion`                    | `domain/services/account.service.ts` (`getBalance`)                               | `application/actions/get-account-balance.action.ts`, `application/validation/account-balance.schema.ts` | `infrastructure/external/fx-rate-provider.unconfigured.ts` (stub in-change)                    | `src/modules/api/app.ts` (route), `app/accounts/[id]/balance-widget.tsx` (UI)                                                                      |
| `/accounts lists the user's live accounts (Server Component)`                             | —                                                                                 | —                                                                                                       | —                                                                                              | `app/accounts/page.tsx` + `app/accounts/accounts-list-table.tsx`                                                                                   |
| `/accounts/new renders the type-driven create form (Server shell + Client form)`          | —                                                                                 | —                                                                                                       | —                                                                                              | `app/accounts/new/page.tsx` + `app/accounts/new/create-account-form.tsx`                                                                           |
| `/accounts/[id] shows the account detail and the balance widget (Server + Client widget)` | —                                                                                 | —                                                                                                       | —                                                                                              | `app/accounts/[id]/page.tsx` + `app/accounts/[id]/account-detail.tsx` + `app/accounts/[id]/balance-widget.tsx`                                     |
| `All request bodies are validated by Zod schemas`                                         | —                                                                                 | `application/validation/*.schema.ts`                                                                    | —                                                                                              | `src/modules/api/app.ts` (los route handlers llaman schema.parse)                                                                                  |
| `All endpoints require an authenticated session`                                          | —                                                                                 | —                                                                                                       | —                                                                                              | `src/modules/api/middlewares/require-session.ts` (Hono) + `await auth()` (Server Components)                                                       |
| `Errors follow the project's standard error envelope`                                     | —                                                                                 | —                                                                                                       | —                                                                                              | `src/shared/http/error-handler.ts` (existente, reusado) + `src/shared/errors/{app-error,error-codes}.ts` (existente, extendido con 4 codes nuevos) |

La matriz se revisa junto al spec. Si un Requirement del spec no tiene fila en la matriz, el design está incompleto.

---

## 12. Open design decisions (DGs cerradas por este design)

El spec dejó 4 decisiones de design abiertas. Este design las cierra.

### DG-D-1 — Tailwind v4 vs Tailwind v3 (cierra DG-V3-1)

**Decisión**: Tailwind v4 estable (`tailwindcss@^4.1.0`) con el plugin oficial `@tailwindcss/postcss`. Una sola directiva `@import "tailwindcss";` en `app/globals.css`. Sin `tailwind.config.ts` para content paths (v4 detecta automáticamente).

**Rationale**: Tailwind v4 es el major actual; v3 está en mantenimiento. El pipeline de PostCSS de Next.js 16 + v4 es estable a mitad de 2026 y está documentado en los docs oficiales de Tailwind. La directiva única de v4 es más simple que el setup de tres directivas de v3.

**Fallback**: si el apply worker encuentra una incompatibilidad v4/Next 16 en el primer build, cae a Tailwind v3 con el setup clásico de tres directivas + `tailwind.config.ts` con content paths. Documenta el fallback en el handoff de PR-A; el spec no cambia.

**Cerrada por**: §7.

### DG-D-2 — Helper `requireSession` vs `auth()` directo en Hono

**Decisión**: extraer `requireSession` como un factory de middleware Hono chico en `src/modules/api/middlewares/require-session.ts`. Las 7 rutas nuevas lo usan. Las 3 rutas existentes (`/health`, `/me`, `/auth/register`) mantienen su comportamiento actual (`/health` es pública; `/me` y `/auth/register` hacen su propio check de sesión dentro de la action).

**Rationale**: las 7 rutas nuevas tienen la misma lógica de short-circuit 401. Duplicar el check en cada action es un code smell; un factory de middleware es el patrón convencional de Hono. El middleware `requireSession` también es reusable por futuras capabilities (`transactions`, `fx-cache`, `snapshots`, `reports`).

**Cerrada por**: §4.2.

### DG-D-3 — Orden de la cadena de middleware Hono

**Decisión**: `requestId` → `errorHandler` (registrado vía `app.onError`) → `authMiddleware` (setea `c.get('user')`) → `requireSession` per-route → route handler.

**Rationale**: `requestId` tiene que correr primero para que cada log line posterior lo tenga. `errorHandler` tiene que estar registrado antes de las rutas para que los errores thrown caigan ahí. `authMiddleware` tiene que correr antes de `requireSession` para que el user esté en el context. `requireSession` corre per-route (no global) para que las rutas públicas (`/health`, futuros `/api/auth/*` a través del catch-all si los hay) sigan funcionando.

**Cerrada por**: §4.2.

### DG-D-4 — Shape exacto del envelope de error y mapeo de status HTTP

**Decisión**: el envelope es `{ error: { code: string, message: string, details?: unknown } }` (matchea `src/shared/http/error-handler.ts`). Los 4 codes nuevos de error mapean a status HTTP así: `NOT_FOUND → 404`, `NAME_TAKEN → 409`, `FX_NOT_SUPPORTED → 409`, `FX_UNAVAILABLE → 503`. El field `details` carga la lista de Zod issues para `VALIDATION_ERROR`.

**Rationale**: matchea la convención del proyecto desde `auth-foundation`. `FX_UNAVAILABLE → 503` es consistente con el patrón del skill `api-design` para upstream unavailability. `FX_NOT_SUPPORTED → 409` es consistente con el escenario del spec "unsupported pair returns 409".

**Cerrada por**: §8.2, §8.3.

### DG-D-5 — Naming del archivo de migración de Prisma

**Decisión**: la migración se llama `add_financial_account` (`pnpm prisma migrate dev --name add_financial_account`). El prefijo de timestamp lo genera el CLI de Prisma. Una sola migración en este cambio (en PR-A). Los PRs B y C no tocan el schema.

**Rationale**: matchea la convención del proyecto `db/migrations/<timestamp>_<name>/migration.sql` (según el skill `database-strategy`). Un nombre de migración único y focalizado es revisable en un solo diff.

**Cerrada por**: §3.

---

## 13. Riesgos y tradeoffs

| Riesgo                                                                                                                                                                                                                | Mitigación                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Smoke UI confundida con la UI de producción** — un contributor futuro agrega más páginas bajo `app/accounts/*` pensando que el slice es la surface de producción.                                                   | El comentario `// smoke-minimal, not production` en cada header de página. La sección explícita del spec "Smoke UI is NOT production UI". El follow-up `ui-accounts` está documentado como el dueño de la producción.                                                                                                                                              |
| **El stub `FxRateProvider` surface `503 FX_UNAVAILABLE` en dev** — hasta que `fx-cache` salga, cada llamada del balance widget devuelve el error.                                                                     | El copy del error inline del widget es `"FX rate provider unavailable. Try again in a few minutes."` (verbatim de BR-ACC-18). El stub es el comportamiento documentado pre-`fx-cache`. El widget se verifica a mano en PR-C.                                                                                                                                       |
| **Forecast de 1750 líneas según el proposal** — el estimate por PR del proposal es generoso; el diff real puede ser más chico (si el setup de Tailwind queda lean) o más grande (si los Zod schemas crecen).          | Re-forecast en la fase de apply por PR. El split por PR del design es el lower bound del rango del proposal. Tamaños por PR: PR-A ~500 líneas (Prisma + domain + application skeleton + tests), PR-B ~700 líneas (rutas Hono + adapter + integration tests), PR-C ~550 líneas (páginas UI + setup Tailwind + mirror español). Total ~1750, matcheando el proposal. |
| **Compatibilidad Next.js 16 + Tailwind v4** — mismatches v4 / Next 16 son raros pero posibles.                                                                                                                        | §7.5 documenta el fallback (v3 con tres directivas clásico). El apply worker verifica en el primer build.                                                                                                                                                                                                                                                          |
| **`honoApp.request` directo en Server Components** — el Server Component construye un `Request` de Hono a mano. Drift entre la construcción manual y la interface `app.request` de Hono podría romper la integración. | La construcción se envuelve en un único helper en `src/lib/server-hono.ts`. El helper se testea unitariamente con el mismo shape de `app.request` que producción usa.                                                                                                                                                                                              |
| **Colisión de naming con `Account` de Auth.js (OAuth link)**                                                                                                                                                          | El módulo accounts es `src/modules/accounts/` y la entity es `FinancialAccount`. La invariante cross-module del design de auth-foundation (citada en ADR-0001 de slice-c) es que la tabla `Account` de Auth.js es interna al módulo auth y nunca llega a la surface de application. El módulo accounts nunca importa desde `src/modules/auth/infrastructure/`.     |
| **Drift bilingüe** — el mirror español puede quedar atrás del design en inglés.                                                                                                                                       | El mirror se escribe en el mismo PR que la fuente en inglés. El script `check-lockfile.sh` de Husky pre-commit no enforce docs; el reviewer verifica ambos archivos en el PR. El CI del repo no tiene actualmente un job de lint del mirror español; el futuro cambio `ui-accounts` lo agregará.                                                                   |
| **Drift de `pnpm-lock.yaml`** — agregar `tailwindcss` + `@tailwindcss/postcss` + `postcss` a `package.json` requiere commit del lockfile.                                                                             | Según root `AGENTS.md` §5.3: el lockfile es un deliverable. El hook de Husky pre-commit (`scripts/check-lockfile.sh`) falla el commit si `package.json` está staged sin un cambio correspondiente en `pnpm-lock.yaml`.                                                                                                                                             |
| **Drift del conteo de tests en la capability `auth`** (el heredado 132/135 vs 137/137 de FLAG-V1)                                                                                                                     | Este cambio NO agrega tests al módulo `auth`. La cobertura de auth está en su línea base actual de 222/45-archivos (según el HANDOFF de slice-c §"FLAG-V1 status"). El target de cobertura del módulo accounts es su propio ≥80% en `src/modules/accounts/**`.                                                                                                     |

---

## 14. Rollout

### 14.1 Plan por PR (3 PRs chained, `feat/accounts-ledger-a|b|c` → `develop`)

| PR  | Branch                   | Scope                                                                                                                                                                                                                                                                                                                                                       | Líneas aprox. | Gate de acceptance                                                                                                                                                                                                                                                               |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `feat/accounts-ledger-a` | `prisma/schema.prisma` + migration `add_financial_account`; 5 enums; modelo `FinancialAccount`; domain entities + value object + service + ports (sin impl); 2 codes de error nuevos (`NOT_FOUND`, `NAME_TAKEN`); tests unitarios del domain; patrón AAA                                                                                                    | ~500          | `pnpm prisma migrate dev` pasa; `pnpm test` exit 0; ≥80% cobertura en `src/modules/accounts/domain/**`                                                                                                                                                                           |
| B   | `feat/accounts-ledger-b` | `account.repository.prisma.ts` + integration tests; 7 actions + 4 Zod schemas; `FxRateProviderUnconfigured` + 2 codes de error nuevos (`FX_UNAVAILABLE`, `FX_NOT_SUPPORTED`); 7 rutas Hono registradas en `src/modules/api/app.ts`; middleware `requireSession`; extensión de `HonoAppDeps`; wiring de `buildDefaultDeps`; 14+ tests de integración de Hono | ~700          | `pnpm test` exit 0; 401 en cada endpoint sin sesión; happy paths 200/201; error paths 400/404/409/503 cubiertos                                                                                                                                                                  |
| C   | `feat/accounts-ledger-c` | Setup de Tailwind v4 (`package.json` + `postcss.config.mjs` + `app/globals.css`); 3 Server Components (`app/accounts/page.tsx`, `app/accounts/new/page.tsx`, `app/accounts/[id]/page.tsx`); 2 Client Components (`create-account-form.tsx`, `balance-widget.tsx`); `ephemeral-toast.tsx`; mirror español; check de drift bilingüe de PR-A y PR-B            | ~550          | `pnpm dev` → sign in → `/accounts` lista cuentas; form de `/accounts/new` crea una cuenta y redirige con toast; `/accounts/[id]` muestra el detail y el balance widget; el widget muestra el error inline `503` hasta que `fx-cache` salga; mirror español con cero chars chinos |

Total: ~1750 líneas en 3 PRs. Esto matchea el forecast del proposal (auto-forecast aceptado el 2026-06-18). Los PRs están chained: A → B → C; cada PR abre a `develop` solo después de que el anterior esté squash-mergeado.

### 14.2 Disciplina de migración de Prisma

La única migración `add_financial_account` corre en la invocación `pnpm prisma migrate dev` del PR-A. PR-B y PR-C no agregan migraciones. El step `prisma generate` corre en cada PR (CI corre `pnpm install --frozen-lockfile && pnpm prisma generate && pnpm test`). El service de Postgres de CI (ya configurado en `.github/workflows/ci.yml` desde auth-foundation-slice-c, T-028) corre la migración con `pnpm prisma migrate deploy` antes de `pnpm test`.

### 14.3 Disciplina del lockfile

Cada PR que toca `package.json` (PR-A para regeneración de `prisma`; PR-C para `tailwindcss` + `@tailwindcss/postcss` + `postcss`) commitea `pnpm-lock.yaml` en el mismo commit. El check de Husky pre-commit (`scripts/check-lockfile.sh`) falla el commit si el lockfile driftea. CI usa `pnpm install --frozen-lockfile` para validar reproducibilidad en un runner limpio.

### 14.4 Política del mirror español

Los archivos `Documents-es/openspec/changes/accounts-ledger/{design,spec,proposal}.md` se escriben en el mismo commit que su fuente en inglés. El `Documents-es/openspec/changes/accounts-ledger/proposal.md` ya existe (se tradujo en la fase de proposal v3). Los mirrors de spec y design son nuevos en este cambio. La traducción del mirror es fiel (términos técnicos en inglés: `prisma`, `honoApp`, `Auth.js`, `Zod`, `Vitest`, `archivedAt`, `openingBalanceMode`, `displayCurrency`, `fxAsOf`, `cuid`, `BR-ACC-NN`, `patrón AAA`, `RED/GREEN/TRIANGULATE/REFACTOR`, `verbatimModuleSyntax`); la prosa se traduce a voseo rioplatense. El check de chars chinos (`grep -P '[\x{4e00}-\x{9fff}]'`) devuelve cero matches en el mirror.

### 14.5 Disciplina de worktree (según root `AGENTS.md` §5.2)

Cada PR vive en su propio worktree de git:

```bash
git worktree add ../gastos-personales-accounts-ledger-a -b feat/accounts-ledger-a develop
cd ../gastos-personales-accounts-ledger-a
# ... trabajo, commit, push
gh pr create --base develop --title "feat(accounts): add FinancialAccount ledger (PR-A: domain + Prisma)"
# después del squash-merge a develop:
git worktree remove ../gastos-personales-accounts-ledger-a

git worktree add ../gastos-personales-accounts-ledger-b -b feat/accounts-ledger-b develop
# ...
```

Sin writers paralelos sin worktrees aislados (root `AGENTS.md` §2.4, §5.1).

### 14.6 Gate pre-merge

Antes de que cada PR se squash-merge a `develop`, el parent (orchestrator) corre una pasada de `sdd-verify` por slice (o por PR). La pasada de verify usa el agente `sdd-verify` con contexto fresh. El reviewer audita la evidencia TDD, el delta del conteo de tests, la cobertura en `src/modules/accounts/**`, y el mirror bilingüe. El PR se mergea solo después de que `sdd-verify` devuelva `PASS` (o `PASS_WITH_FLAGS` sin CRITICAL).

### 14.7 Post-merge sync + archive

Después de que los 3 PRs mergeen a `develop`, la fase `sdd-sync` promueve el spec de `openspec/changes/accounts-ledger/specs/accounts/spec.md` a `openspec/specs/accounts/spec.md` (canónico). La fase `sdd-archive` mueve `openspec/changes/accounts-ledger/` a `openspec/changes/archive/`. El cambio `fx-cache` se desbloquea después del archive (depende del port `FxRateProvider` declarado acá).

---

## 15. Out of scope (este design)

- Implementación de `fx-cache` (el `FxRateProvider` es un port only; el provider live aterriza en el cambio `fx-cache`).
- `transactions`, `snapshots`, `reports` — cada uno es su propio cambio SDD; van a consumir la capability `accounts`.
- UI de producción (`ui-accounts` o `pwa-shell`).
- Las 61 vulns de `pnpm audit` (issue #7, tracking separado).
- Email notifications, scheduled jobs, background workers.
- Bulk import / CSV upload.
- Hardening de auth de producción (rate limiting sobre endpoints UI-driven).

---

## 16. Next step

La próxima fase de SDD es `sdd-tasks`: producir `openspec/changes/accounts-ledger/tasks.md` con los 3 PRs chained descompuestos en tasks atómicas (una por commit), cada una con las columnas de evidencia strict TDD. Después de `sdd-tasks`: `sdd-apply` (PR-A, PR-B, PR-C en secuencia). Las fases `sdd-verify`, `sdd-sync`, y `sdd-archive` siguen a cada PR.
