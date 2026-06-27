# Diseño — `reports`

**Estado**: borrador · **Autor**: Sebastián Illa · **Creado**: 2026-06-26
**Cambio**: `reports`
**Propuesta**: `openspec/changes/reports/proposal.md` (v1, 2026-06-26)
**Especificación (delta)**: `openspec/changes/reports/specs/reports/spec.md` (REQ-RPT-1 a REQ-RPT-7)
**Especificación (canónica)**: `openspec/specs/reports/spec.md` (se materializa en `sdd-archive`)
**Capacidades afectadas**: `reports` (nueva; la especificación canónica aterriza en `openspec/specs/reports/spec.md` al sincronizar), `transactions` (un delta de enlace cruzado — `TransactionRecorded` ahora tiene al menos un suscriptor), `accounts` (sin cambio de comportamiento; `AccountRepositoryPort.findById` consumido por el endpoint de flujo para la guarda cross-user), `errors` (sin códigos nuevos — reutiliza `VALIDATION_ERROR` y `NOT_FOUND`), `events` (sin miembros nuevos en la unión — `TransactionRecorded` ya existe por REQ-TX-13)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (heredado de `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4
**Preflight**: interactive · `both` (Engram + archivos OpenSpec) · `force-chained` · presupuesto de revisión 400 líneas
**TDD estricto**: habilitado según `openspec/config.yaml`; runner `pnpm test`; ciclo RED → GREEN → TRIANGULATE → REFACTOR

> Este documento NO vuelve a debatir la propuesta ni la
> especificación. Implementa el "qué" del spec con el "cómo" —
> estructura de módulo, invariantes de agregados de dominio, formas
> de puertos y DTOs, esquemas Zod, capa de aplicación, rutas Hono,
> mapeo de errores, cableado del composition root, smoke UI,
> marcadores TDD por slice, y las tres correcciones del
> orquestador que la fase de spec no codificó explícitamente:
> (1) regex de **cuid** (no UUID v4) para validar `accountId`,
> (2) BRs heredadas por referencia (sigue la convención del repo),
> (3) tope superior de 366 días en
> `GET /api/reports/accounts/:accountId/flow` (un año calendario +
> buffer de día bisiesto).

---

## 1. Resumen

`reports` es la **superficie de agregación** de `gastos-personales`.
Es el primer módulo que consume filas de `Transaction` desde la
capacidad `transactions` sin escribir en ellas. El cambio entrega
los tres agregados de lectura (`MonthlySummary`, `CategoryBreakdown`,
`AccountFlow`) como un módulo hexagonal delgado en
`src/modules/reports/` que depende de:

- `TransactionRepositoryPort` (solo lectura) desde el módulo
  `transactions` vía el **núcleo de dominio compartido** en
  `src/shared/domain-kernel/ports/` (así la flecha de dependencia es
  `reports → shared-kernel`, no `reports → transactions`).
- `AccountRepositoryPort` (solo lectura) para la guarda cross-user
  del endpoint de flujo (REQ-RPT-4).
- El `EventDispatcher` central para la suscripción no-op de
  `TransactionRecorded` en tiempo de composition (REQ-RPT-7,
  BR-RPT-5).

`reports` NO importa de `@/modules/transactions/` ni de
`@/modules/accounts/` por la ruta profunda. Los puertos viven en el
núcleo precisamente para que la capa de dominio pueda consumirlos sin
violar `AGENTS.md` raíz §10.5 (módulos aislados). El composition root
(`src/composition/build-app-deps.ts`) es el único archivo que importa
los adaptadores `Prisma` profundos y los cablea en las acciones de
`reports`.

Tres decisiones de diseño atan la implementación:

- **Cálculo perezoso al leer** con un sello `generatedAt` de
  `Clock.now()` en cada agregado (no hay `new Date()` en código de
  dominio).
- **Regex cuid** para validar `accountId`
  (`/^c[a-z0-9]{20,32}$/`), corrigiendo la redacción "UUID v4" del
  spec — el proyecto usa cuid para `FinancialAccount.id` según
  `openspec/specs/transactions/spec.md:184` y el modelo Prisma
  `Transaction` en
  `src/modules/transactions/domain/entities/transaction.ts` usa
  `@default(cuid())` (verificado en
  `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.ts`).
- **Suscriptor no-op de `TransactionRecorded`** cableado exactamente
  una vez en tiempo de composition (BR-RPT-5). La costura existe
  para que un cambio futuro pueda reemplazar el handler por un
  materializador sin tocar la firma del dispatcher.

---

## 2. Estructura del módulo — `src/modules/reports/` (nuevo)

El módulo espeja el diseño hexagonal de `transactions` exactamente:
`domain/` (entidades, servicios, puertos), `application/` (acciones,
DTOs, esquemas, fixtures, errores, rutas), `infrastructure/`
(adaptadores Prisma, suscriptores). El barrel público en
`src/modules/reports/index.ts` reexporta los puertos y la función de
montaje — nunca los adaptadores Prisma ni los fixtures InMemory.

### 2.1 Árbol de archivos

```
src/modules/reports/
├── index.ts                                     # barrel público: mountReportsRoutes, tipos de puerto, DTOs, deps de montaje
├── domain/
│   ├── aggregates/
│   │   ├── monthly-summary.ts                   # MonthlySummary + MonthlyTotals + factory + esquema Zod de entrada + invariantes
│   │   ├── monthly-summary.test.ts              # tests unitarios: vacío, multi-moneda, paths de error del factory
│   │   ├── category-breakdown.ts                # CategoryBreakdown + CategoryBucket + factory + normalización
│   │   ├── category-breakdown.test.ts           # tests unitarios: lowercase + trim, null/empty, orden, tie-break
│   │   ├── account-flow.ts                      # AccountFlow + AccountFlowDay + factory + omisión de días vacíos
│   │   └── account-flow.test.ts                 # tests unitarios: contiguos, días sparse, límites de rango
│   ├── services/
│   │   ├── aggregate-transactions.ts            # funciones puras de agregación consumidas por acciones; cero I/O
│   │   └── aggregate-transactions.test.ts       # tests unitarios: aislamiento cross-user en la salida del agregador
│   ├── ports/
│   │   ├── reports-repository.port.ts           # ReportsRepositoryPort: fuente de datos read-only para agregados
│   │   ├── reports-repository.port.test.ts      # test de contrato en tiempo de compilación: userId primero en cada método
│   │   ├── report-subscriber.port.ts            # ReportSubscriberPort: declara la costura para el handler no-op
│   │   └── report-subscriber.port.test.ts       # test de contrato en tiempo de compilación
│   ├── errors/
│   │   ├── reports-domain-error.ts              # clase base ReportsDomainError (espeja transaction-domain-errors)
│   │   ├── invalid-month-error.ts               # lanzado por acciones cuando falla el regex de mes (defensa en profundidad)
│   │   ├── invalid-account-id-error.ts          # lanzado cuando accountId falla el regex cuid
│   │   ├── invalid-date-range-error.ts          # lanzado cuando toDate - fromDate > 366 o fromDate > toDate
│   │   └── account-not-found-error.ts           # lanzado cuando accountId del flow no pertenece al userId
│   ├── value-objects/
│   │   └── month.ts                             # value object Month (regex /^\d{4}-\d{2}$/, deriva límites from/to UTC)
│   └── index.ts                                 # barrel de dominio: agregados + servicios + puertos + errores
├── application/
│   ├── actions/
│   │   ├── _shared.ts                           # ReportsActionDeps, ActionResult, zodErrorToActionError,
│   │   │                                         #   domainErrorToActionError (copia local — regla de módulos aislados)
│   │   ├── get-monthly-summary.action.ts        # valida { month }, llama al puerto, agrega, devuelve DTO
│   │   ├── get-monthly-summary.action.test.ts   # tests de acción
│   │   ├── get-category-breakdown.action.ts     # valida { month }, llama al puerto, agrega, devuelve DTO
│   │   ├── get-category-breakdown.action.test.ts
│   │   ├── get-account-flow.action.ts           # valida { accountId, month } O { accountId, fromDate, toDate }
│   │   └── get-account-flow.action.test.ts
│   ├── schemas/
│   │   ├── monthly-summary-query.schema.ts      # Zod: month (regex), chequeo de límites
│   │   ├── monthly-summary-query.schema.test.ts
│   │   ├── category-breakdown-query.schema.ts   # Zod: misma forma que monthly-summary-query
│   │   ├── category-breakdown-query.schema.test.ts
│   │   ├── account-flow-query.schema.ts         # Zod: accountId (regex cuid), month OR fromDate+toDate, límite de rango
│   │   └── account-flow-query.schema.test.ts
│   ├── dto/
│   │   ├── monthly-summary.dto.ts               # MonthlySummaryDTO + toMonthlySummaryDto (ISO-8601 generatedAt)
│   │   ├── monthly-summary.dto.test.ts
│   │   ├── category-breakdown.dto.ts            # CategoryBreakdownDTO + CategoryBucketDTO + toCategoryBreakdownDto
│   │   ├── category-breakdown.dto.test.ts
│   │   ├── account-flow.dto.ts                  # AccountFlowDTO + AccountFlowDayDTO + toAccountFlowDto
│   │   └── account-flow.dto.test.ts
│   ├── fixtures/
│   │   ├── reports-repository.inmemory.ts       # InMemoryReportsRepository — implementa ReportsRepositoryPort
│   │   └── reports-repository.inmemory.test.ts
│   ├── routes.ts                                # mountReportsRoutes(protectedApp, deps) — tres rutas
│   └── routes.test.ts                           # integración Hono: 200/400/401/404 contra deps in-memory
└── infrastructure/
    ├── repositories/
    │   ├── reports.repository.prisma.ts         # adaptador Prisma; consume TransactionRepositoryPort.list() y
    │   │                                         #   AccountRepositoryPort.findById() vía inyección del composition-root
    │   └── reports.repository.prisma.test.ts    # test de integración contra testcontainers Postgres (espeja el patrón transactions)
    └── subscribers/
        ├── noop-transaction-recorded.subscriber.ts  # noopHandler: debug-log y return (REQ-RPT-7)
        └── noop-transaction-recorded.subscriber.test.ts  # asegura que el handler está bien tipado para TransactionRecordedPayload
```

El árbol propuesto difiere de la propuesta del spec en dos formas
intencionales (el cache del orquestador las horneó):

1. La especificación del orquestador pide
   `domain/index.test.ts` y `application/actions/*.test.ts`
   co-localizados con el código fuente. La convención del proyecto
   `transactions` también mantiene los tests co-localizados (p.ej.
   `monthly-summary.test.ts` junto a `monthly-summary.ts`). Este
   diseño sigue el patrón co-localizado.
2. La especificación del orquestador pide
   `application/routes.test.ts` dentro de `application/`.
   `transactions` hace lo mismo: las rutas viven en
   `application/routes.ts` y los tests de integración Hono se
   montan al nivel de acción (según el precedente existente en
   `routes.ts`). `reports` sigue la misma forma.

### 2.2 Dirección de dependencia cross-module

```
            src/modules/reports/  (nuevo)
            ├─ domain/aggregates/*.ts
            │       depende de ─→ Clock (shared/clock)
            │                       AccountCurrency (shared/domain-kernel)
            ├─ domain/services/aggregate-transactions.ts
            │       agregador puro: TransactionDTO[] → Aggregate
            │       cero I/O; sin imports de otros módulos
            ├─ domain/ports/reports-repository.port.ts
            │       importa ─→ TransactionDTO, AccountCurrency (shared/domain-kernel)
            │       NO importa de @/modules/transactions ni @/modules/accounts directamente
            ├─ domain/ports/report-subscriber.port.ts
            │       importa ─→ TransactionRecordedPayload (shared/events/event-dispatcher)
            ├─ application/actions/*-*.action.ts
            │       depende de ─→ ReportsRepositoryPort (dominio de este módulo)
            │                       Clock (shared/clock)
            ├─ application/schemas/*-query.schema.ts
            │       importa ─→ AccountCurrency (shared/domain-kernel)
            │                   zod (vendored)
            ├─ application/dto/*.dto.ts
            │       importa ─→ tipos Aggregate (dominio de este módulo)
            ├─ application/fixtures/reports-repository.inmemory.ts
            │       implementa ─→ ReportsRepositoryPort (dominio de este módulo)
            │       usa (solo test) InMemoryTransactionRepository de transactions/application
            ├─ application/routes.ts
            │       monta las 3 rutas Hono en protectedApp
            ├─ infrastructure/repositories/reports.repository.prisma.ts
            │       implementa ─→ ReportsRepositoryPort (dominio de este módulo)
            │       depende de ─→ TransactionRepositoryPort (shared/domain-kernel, puerto estructural)
            │                       AccountRepositoryPort (shared/domain-kernel, puerto estructural)
            │                       cliente Prisma (shared/db)
            └─ index.ts                    (superficie pública — ver §2.3)

src/shared/domain-kernel/ports/transaction-repository-port.ts (AÚN NO PRESENTE — agregado en §2.2.1 abajo)
src/shared/domain-kernel/ports/account-repository.port.ts    ←── reports lee vía el núcleo (puertos estructurales)
```

#### 2.2.1 Adición del puerto al kernel

El núcleo compartido en `src/shared/domain-kernel/ports/` ya
redeclara `AccountRepositoryPort` y `FxRateProvider` desde el
módulo `accounts`. Según el precedente en
`src/shared/domain-kernel/ports/account-repository.port.ts`, el
núcleo expone el **mínimo estructural** (los métodos que el path
de lectura realmente llama). `reports` consume el
`TransactionRepositoryPort` del módulo `transactions` solo para la
llamada `list(userId, { from, to, accountId? })` — nunca `create`,
`update` ni `delete`. El núcleo gana por tanto un archivo nuevo:

```typescript
// src/shared/domain-kernel/ports/transaction-repository-port.ts

/**
 * Puerto del núcleo: `TransactionRepositoryPort` (superficie
 * read-only para el módulo reports).
 *
 * Espeja el puerto completo de transactions en
 * `src/modules/transactions/domain/interfaces/transaction.repository.port.ts`
 * pero expone solo el método `list` que reports necesita. La
 * regla de subtipado estructural (un adaptador Prisma satisface
 * el puerto canónico y por tanto es asignable al puerto más
 * estrecho del núcleo) preserva la seguridad de tipos.
 *
 * El puerto del núcleo vive en `@/shared/domain-kernel` porque
 * es la superficie de contrato cross-module. El puerto canónico
 * en `@/modules/transactions` es la vista del escritor (CRUD
 * completo); el puerto del núcleo es la vista del lector. Los
 * dos son estructuralmente compatibles.
 */
export type {
  ListTransactionsOptions,
  ListTransactionsPage,
} from '@/modules/transactions/domain/interfaces/transaction.repository.port';
export type { Transaction } from '@/modules/transactions/domain/entities/transaction';
```

El `index.ts` del núcleo (`src/shared/domain-kernel/index.ts:1-44`)
gana dos líneas nuevas:

```typescript
export type {
  TransactionRepositoryPort,
  ListTransactionsOptions,
  ListTransactionsPage,
  Transaction,
} from './ports/transaction-repository-port';
```

El núcleo NO es un módulo — `AGENTS.md` raíz §10.5 aísla módulos,
no el núcleo. El rol del núcleo es ser la superficie de contrato
cross-module; importar el núcleo desde cualquier módulo es la
convención existente del proyecto.

### 2.3 Barrel público — `src/modules/reports/index.ts`

Espeja `src/modules/transactions/application/index.ts:33-111`. El
barrel exporta:

- `ReportsRepositoryPort` (tipo de puerto) — la fuente de datos
  read-only.
- `ReportSubscriberPort` (tipo de puerto) — la costura no-op.
- `MonthlySummary`, `MonthlyTotals` (tipos de agregado de dominio)
  — reexportados desde `domain/aggregates/monthly-summary`.
- `CategoryBreakdown`, `CategoryBucket` (tipos de agregado de
  dominio) — reexportados desde
  `domain/aggregates/category-breakdown`.
- `AccountFlow`, `AccountFlowDay` (tipos de agregado de dominio) —
  reexportados desde `domain/aggregates/account-flow`.
- `MonthlySummaryDTO`, `CategoryBreakdownDTO`, `AccountFlowDTO`
  (tipos DTO) — reexportados desde `application/dto`.
- `ReportsActionDeps` — la interfaz del bag de deps de la capa de
  aplicación.
- `mountReportsRoutes` — monta las 3 rutas en el sub-app protegido
  provisto.
- `MountReportsRoutesDeps` — la forma de las deps del montaje.

El barrel NO exporta:

- `ReportsRepositoryPrisma` (adaptador de infraestructura).
- `InMemoryReportsRepository` (fixture de test).
- `NoopTransactionRecordedSubscriber` (handler solo-test; el
  composition root de producción lo construye inline).
- Los esquemas Zod (los consumidores validan en su propio borde).
- Los mappers DTO (`toMonthlySummaryDto` etc.) — son helpers
  internos; los consumidores importan el tipo `*DTO` resultante
  del wire, no el mapper.

---

## 3. Modelo de dominio

La capacidad `reports` es dueña de tres agregados de lectura y un
factory cada uno. Ningún agregado es dueño de una fila Prisma; la
forma de los datos se deriva de filas `TransactionDTO` que el
`ReportsRepositoryPort` retorna. Cada agregado lleva un
`generatedAt: Date` sellado desde `Clock.now()` (no hay
`new Date()` en código de dominio, según
`openspec/specs/transactions/spec.md` §REQ-TX-14 y el patrón
existente del proyecto en
`src/modules/transactions/domain/entities/transaction.ts`).

### 3.1 Enum: `AccountCurrency`

Reusado del núcleo. El módulo `reports` nunca redeclara este enum;
el núcleo es la fuente enum cross-module.

### 3.2 Agregado: `MonthlySummary`

```typescript
// src/modules/reports/domain/aggregates/monthly-summary.ts

export interface MonthlyTotals {
  readonly convertedCurrency: AccountCurrency;
  readonly incomeMinor: number; // suma de convertedAmountMinor donde direction = INCOME (≥ 0)
  readonly expenseMinor: number; // suma de convertedAmountMinor donde direction = EXPENSE (≥ 0)
  readonly netMinor: number; // incomeMinor - expenseMinor (puede ser negativo)
  readonly count: number; // número de transacciones en este bucket (≥ 0)
}

export interface MonthlySummary {
  readonly userId: string; // cuid (invariante cross-module)
  readonly year: number; // año calendario UTC, 2000..2100
  readonly month: number; // mes calendario UTC, 1..12
  readonly totals: MonthlyTotals[]; // una entrada por convertedCurrency
  readonly generatedAt: Date; // Clock.now() al momento del agregado (ISO-8601 en el wire)
}

export interface CreateMonthlySummaryInput {
  readonly userId: string;
  readonly year: number;
  readonly month: number;
  readonly rows: readonly TransactionDTO[]; // entrada pura
  readonly clock: Clock; // inyectado; nunca new Date() en código de dominio
}

export function createMonthlySummary(input: CreateMonthlySummaryInput): MonthlySummary;
```

#### 3.2.1 Invariantes forzadas por el factory

- `totals[i].incomeMinor >= 0` y `totals[i].expenseMinor >= 0`
  (unidades menores con signo; el signo vive en `netMinor`).
- `totals[i].netMinor === totals[i].incomeMinor - totals[i].expenseMinor`
  (el factory calcula, nunca asegura; el test asegura).
- `totals[i].convertedCurrency` es uno de los miembros del enum
  `AccountCurrency`.
- `year ∈ [2000, 2100]` y `month ∈ [1, 12]`; el factory lanza
  `ReportsDomainError` si falla el regex del mes /`^\d{4}-\d{2}$/`
  o si se violan los límites. Defensa en profundidad: el Zod parse
  de la capa de acción es el guard primario.
- `generatedAt === clock.now()` en el momento en que corre el
  factory.
- `rows.filter((r) => r.userId === input.userId)` es implícito — el
  puerto retorna solo las filas del llamador; el factory confía en
  el contrato del puerto. El aislamiento cross-user se fuerza en
  el borde del puerto (`findByUserAndMonth` toma `userId` primero).
- `totals` está vacío cuando la ventana no tiene filas
  (`totals.length === 0`). La respuesta wire lleva
  `{ totals: [], generatedAt }` y `HTTP 200`.

### 3.3 Agregado: `CategoryBreakdown`

```typescript
// src/modules/reports/domain/aggregates/category-breakdown.ts

export interface CategoryBucket {
  readonly category: string | null; // string crudo de Transaction.category, preservado verbatim
  readonly categoryNormalized: string; // lowercase + trim; null/empty → "uncategorized"
  readonly convertedCurrency: AccountCurrency; // clave de agrupación (BR-RPT-1)
  readonly amountMinor: number; // suma de convertedAmountMinor; puede ser negativo (neto de refunds)
  readonly txCount: number; // > 0 (buckets con count cero se descartan)
}

export interface CategoryBreakdown {
  readonly userId: string;
  readonly year: number;
  readonly month: number;
  readonly buckets: readonly CategoryBucket[]; // ordenado por amountMinor DESC, categoryNormalized ASC
  readonly generatedAt: Date;
}

export interface CreateCategoryBreakdownInput {
  readonly userId: string;
  readonly year: number;
  readonly month: number;
  readonly rows: readonly TransactionDTO[];
  readonly clock: Clock;
}

export function createCategoryBreakdown(input: CreateCategoryBreakdownInput): CategoryBreakdown;
```

#### 3.3.1 Invariantes

- `categoryNormalized` se calcula con `normalizeCategory(category)`
  (función libre en el mismo archivo):
  `category?.trim().toLowerCase() ?? 'uncategorized'`; un string
  vacío después de `trim()` también es `'uncategorized'`.
- El factory agrupa por la tupla `(categoryNormalized,
convertedCurrency)` — la moneda es parte de la clave de
  agrupación (BR-RPT-1, REQ-RPT-6).
- Buckets con `txCount === 0` se excluyen.
- El orden es `amountMinor DESC` primario; `categoryNormalized ASC`
  secundario (desempate determinístico).
- El campo `category` es el PRIMER string crudo observado para el
  bucket — el escenario del spec "categorías crudas en mixed-case
  colapsan en un bucket normalizado" acepta cualquier valor crudo.
  El factory usa el primero encontrado; los strings crudos
  subsiguientes se descartan.

### 3.4 Agregado: `AccountFlow`

```typescript
// src/modules/reports/domain/aggregates/account-flow.ts

export interface AccountFlowDay {
  readonly date: string; // YYYY-MM-DD UTC (clave solo-fecha, sin componente horario)
  readonly netMinor: number; // cambio neto solo para `date`
  readonly runningBalanceMinor: number; // neto acumulado hasta e incluyendo `date`
  readonly count: number; // > 0 (días sparse omitidos)
  readonly convertedCurrency: AccountCurrency; // clave de agrupación
}

export interface AccountFlow {
  readonly userId: string;
  readonly accountId: string; // cuid (matches /ˆc[a-z0-9]{20,32}$/)
  readonly fromDate: Date; // límite inferior inclusivo, UTC 00:00:00Z
  readonly toDate: Date; // límite superior inclusivo, UTC 23:59:59.999Z
  readonly days: readonly AccountFlowDay[]; // ordenado por date ASC; días sparse omitidos
  readonly generatedAt: Date;
}

export interface CreateAccountFlowInput {
  readonly userId: string;
  readonly accountId: string;
  readonly fromDate: Date;
  readonly toDate: Date;
  readonly rows: readonly TransactionDTO[]; // solo filas en `accountId` dentro del rango
  readonly clock: Clock;
}

export function createAccountFlow(input: CreateAccountFlowInput): AccountFlow;
```

#### 3.4.1 Invariantes

- `accountId` matches `^c[a-z0-9]{20,32}$` (regex cuid, NO UUID
  v4 — ver §6 corrección del orquestador #1). El factory lanza
  `InvalidAccountIdError` (subclase de `ReportsDomainError`)
  cuando el regex falla. Defensa en profundidad: el Zod parse de
  la capa de acción es el guard primario.
- `fromDate <= toDate` y `toDate - fromDate <= 366 días`
  (BR-RPT-3 codificado en el spec). 366 días = un año calendario
  - buffer de día bisiesto (corrección del orquestador #3,
    rationale: alineación con año bisiesto más holgura de un día
    para absorber redondeos de zona horaria).
- `fromDate` se normaliza a `00:00:00.000Z` UTC; `toDate` a
  `23:59:59.999Z` UTC. El factory quita cualquier componente de
  hora local y re-anccla a medianoche UTC.
- La clave de fecha es `YYYY-MM-DD` UTC; sin componente horario
  (BR-RPT-3 codifica Q4).
- Días sparse (sin transacciones) se omiten de `days` (BR-RPT-3).
- `runningBalanceMinor` es el neto acumulado a través de `days`
  en orden de fecha: `days[0].runningBalanceMinor === days[0].netMinor`
  y `days[i].runningBalanceMinor === days[i-1].runningBalanceMinor + days[i].netMinor`.
- El factory confía en que el puerto haya filtrado por `userId`,
  `accountId` y rango de fechas — el aislamiento cross-user se
  fuerza en el borde del puerto.

### 3.5 Servicio puro de agregación

```typescript
// src/modules/reports/domain/services/aggregate-transactions.ts

/**
 * Agrega las filas para un resumen mensual. Función pura —
 * sin I/O, sin efecto colateral de reloj (el parámetro `clock`
 * se lee dentro del factory).
 *
 * La función agrupa por `convertedCurrency`; una fila por
 * `convertedCurrency` por mes. La capa de acción llama a esto
 * con la salida del puerto.
 */
export function aggregateMonthly(
  rows: readonly TransactionDTO[],
  clock: Clock,
): { totals: MonthlyTotals[]; generatedAt: Date };

/**
 * Agrega las filas para un breakdown de categorías. Agrupa por
 * la tupla (categoryNormalized, convertedCurrency); ordena por
 * amountMinor DESC, categoryNormalized ASC.
 */
export function aggregateCategoryBreakdown(
  rows: readonly TransactionDTO[],
  clock: Clock,
): { buckets: CategoryBucket[]; generatedAt: Date };

/**
 * Agrega las filas para un flujo de cuenta. Agrupa por
 * (date YYYY-MM-DD UTC, convertedCurrency); días sparse
 * omitidos; balance acumulado calculado en orden de fecha.
 */
export function aggregateAccountFlow(
  rows: readonly TransactionDTO[],
  clock: Clock,
): { days: AccountFlowDay[]; generatedAt: Date };
```

El servicio es un módulo de funciones libres (no una clase). La
capa de acción invoca el factory con el reloj; el factory invoca
el servicio internamente para derivar los campos del agregado.

### 3.6 Resumen de invariantes (cross-cutting)

- **Unidades menores con signo**: `inflowMinor` y `outflowMinor`
  son siempre ≥ 0; el signo vive en `netMinor` (que es
  `inflowMinor - outflowMinor`). Filas de refund
  (`convertedAmountMinor` negativo) son raras pero posibles —
  reducen el `netMinor` del bucket, no su `inflow` ni `outflow`.
- **Días sparse preservados**: el array `AccountFlow.days` omite
  días con cero transacciones; los consumidores no pueden inferir
  "sin actividad" desde un día ausente.
- **Categorías normalizadas vía factory**: la función libre
  `normalizeCategory(category)` es el único lugar que hace
  lowercase / trim. La capa de acción nunca reimplementa la regla.
- **`convertedCurrency` (no `currency` cruda)**: cada agrupación
  usa `convertedCurrency` (BR-RPT-1, REQ-RPT-6, BR-ACC-12).
- **Aislamiento cross-user en el borde del puerto**: cada método
  en `ReportsRepositoryPort` toma `userId` primero. El factory no
  re-filtra.

---

## 4. Puertos

### 4.1 `ReportsRepositoryPort`

```typescript
// src/modules/reports/domain/ports/reports-repository.port.ts

import type { TransactionDTO } from '@/shared/domain-kernel/ports/transaction-repository-port';
// TransactionDTO es la forma alineada al wire exportada desde
// el módulo transactions. Reports lee vía este tipo solo —
// nunca el agregado Transaction canónico.

export interface ListForMonthlyOptions {
  readonly year: number;
  readonly month: number; // 1..12
}

export interface ListForBreakdownOptions {
  readonly year: number;
  readonly month: number;
}

export interface ListForFlowOptions {
  readonly accountId: string;
  readonly fromDate: Date;
  readonly toDate: Date;
}

export interface ReportsRepositoryPort {
  /**
   * Retorna las transacciones del llamador en el mes UTC
   * `[year-month-01, year-(month+1)-01)`. El puerto retorna
   * `TransactionDTO[]` (la forma alineada al wire del módulo
   * transactions); el agregador las convierte a filas de
   * dominio para el factory. Filtro opcional `accountId?` para
   * resumen por cuenta futuro (no usado en v1 — presente en la
   * interfaz por compatibilidad hacia adelante).
   */
  findByUserAndMonth(
    userId: string,
    opts: ListForMonthlyOptions,
  ): Promise<readonly TransactionDTO[]>;

  /**
   * Misma forma que monthly. El puerto reusa internamente el
   * mismo code path — ambas llamadas van a través de
   * `list(userId, { from, to })` de transactions. La interfaz
   * expone dos métodos para que la intención de la capa de
   * acción sea explícita en el nivel de tipo.
   */
  findByUserAndMonthForBreakdown(
    userId: string,
    opts: ListForBreakdownOptions,
  ): Promise<readonly TransactionDTO[]>;

  /**
   * Retorna las transacciones del llamador en `accountId`
   * dentro del rango de fechas inclusivo. Lecturas cross-user
   * retornan `[]` (la invariante cross-user en el borde del
   * puerto; la capa de acción verifica cruzadamente vía
   * `AccountRepositoryPort.findById` para producir
   * `404 NOT_FOUND` cuando la cuenta pertenece a otro usuario).
   */
  findByUserAccountAndRange(
    userId: string,
    opts: ListForFlowOptions,
  ): Promise<readonly TransactionDTO[]>;
}
```

**Justificación (los puertos son estables; la fuente de datos es
asunto del composition root).** Los tres métodos son deliberadamente
estrechos — cada uno retorna el slice de datos que el agregador
necesita. La fuente de datos detrás del puerto es el existente
`TransactionRepositoryPort.list` más los dos índices Prisma
existentes (`@@index([userId, transactionDate])` y
`@@index([accountId, transactionDate])`) sobre la tabla
`Transaction`. El composition root
`ReportsRepositoryPrisma.findByUserAndMonth` delega a
`TransactionRepositoryPort.list(userId, { fromDate, toDate })`
dentro de una ventana UTC estrecha (los límites del mes). Esto es
más barato que una query Prisma fresca porque (a) el mismo índice
`[userId, transactionDate]` la cubre, (b) la capa de acción
necesita el payload completo de fila (no un agregado Prisma), y
(c) reusar el puerto mantiene la flecha de dependencia apuntando
`reports → kernel → transactions` — nunca `reports →
transactions` directamente.

**¿Por qué tres métodos y no un único `list(userId, opts)`?** La
interfaz está tipada en el sitio de uso para que la capa de acción
no pueda pasar accidentalmente opciones mensuales al agregador de
flujo (las formas no se superponen). Un único método sobrecargado
forzaría un tipo unión en el call-site; la forma de tres métodos
es el ajuste de screaming-architecture (cada nombre de método es
la intención de la acción).

### 4.2 `ReportSubscriberPort`

```typescript
// src/modules/reports/domain/ports/report-subscriber.port.ts

import type { TransactionRecordedPayload } from '@/shared/events/event-dispatcher';

/** Handle opaco de desuscripción. Retorna `void`. */
export type Unsubscribe = () => void;

export interface ReportSubscriberPort {
  /**
   * Suscribe un handler al evento `TransactionRecorded`. El
   * composition root cablea un handler no-op en v1; el
   * materializador futuro lo intercambia por un consumidor real
   * sin cambio de interfaz.
   *
   * Retorna una función de desuscripción para el teardown de
   * tests.
   */
  onTransactionRecorded(
    handler: (event: TransactionRecordedPayload) => void | Promise<void>,
  ): Unsubscribe;
}
```

La costura se declara para que el spec pueda fijar el contrato
(BR-RPT-5). v1 entrega un `noopHandler` registrado en tiempo de
composition; el test asegura que existe exactamente un suscriptor
para `TransactionRecorded` después de que `buildAppDeps` corre
(§6.2 abajo).

---

## 5. Capa de aplicación — Acciones

### 5.1 `_shared.ts` local

`src/modules/reports/application/actions/_shared.ts` es una copia
local del sobre de la capa de acción — el mismo patrón que
`src/modules/transactions/application/actions/_shared.ts`. Exporta:

- `ActionResult<T> = ActionSuccess<T> | ActionFailure` — unión
  discriminada (`ok: true | false`).
- `ActionFailure = { ok: false; error: AppError | ReportsDomainError }`.
- `ReportsActionDeps` — el bag de deps (ver §5.2 abajo).
- `zodErrorToActionError(err: ZodError): ActionFailure` — sobre
  400 uniforme.
- `domainErrorToActionError(err): ActionFailure` — mapea los
  códigos `ReportsDomainError` a códigos de wire.

La tabla de mapeo:

| Código de dominio           | Código de wire     | HTTP |
| --------------------------- | ------------------ | ---- |
| `INVALID_MONTH`             | `VALIDATION_ERROR` | 400  |
| `INVALID_ACCOUNT_ID`        | `VALIDATION_ERROR` | 400  |
| `INVALID_DATE_RANGE`        | `VALIDATION_ERROR` | 400  |
| `ACCOUNT_NOT_FOUND`         | `NOT_FOUND`        | 404  |
| `OUT_OF_RANGE` (> 366 días) | `VALIDATION_ERROR` | 400  |

El módulo `reports` NO importa
`@/modules/transactions/application/actions/_shared.ts` — según la
regla de módulos aislados (`AGENTS.md` raíz §10.5). Solo copia local.

### 5.2 `ReportsActionDeps`

```typescript
// src/modules/reports/application/actions/_shared.ts

import type { ReportsRepositoryPort } from '../../domain/ports/reports-repository.port';
import type { ReportSubscriberPort } from '../../domain/ports/report-subscriber.port';
import type { AccountRepositoryPort } from '@/shared/domain-kernel';
import type { Clock } from '@/shared/clock/clock.port';
import type { logger as LoggerSingleton } from '@/shared/logger/logger';
import type { EventDispatcher } from '@/shared/events/event-dispatcher';

export type Logger = typeof LoggerSingleton;

export interface ReportsActionDeps {
  readonly reportsRepository: ReportsRepositoryPort;
  readonly accountRepository: AccountRepositoryPort; // para la guarda cross-user del flow (REQ-RPT-4)
  readonly subscriber: ReportSubscriberPort;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly dispatcher: EventDispatcher; // sin uso en acciones v1; mantenido por simetría con transactions
}
```

El campo `dispatcher` se mantiene por simetría con el bag de deps
de transactions y como asiento de compatibilidad hacia adelante (un
materializador futuro despacharía eventos `ReportSnapshotRefreshed`).
Las acciones v1 no lo llaman.

### 5.3 `getMonthlySummaryAction`

```typescript
// src/modules/reports/application/actions/get-monthly-summary.action.ts

export interface GetMonthlySummaryInput {
  readonly userId: string;
  readonly rawQuery: unknown;
}

export type GetMonthlySummaryData = MonthlySummaryDTO;

export async function getMonthlySummaryAction(
  deps: ReportsActionDeps,
  input: GetMonthlySummaryInput,
): Promise<ActionResult<GetMonthlySummaryData>>;
```

**Flujo:**

1. Parsea `rawQuery` con `monthlySummaryQuerySchema` (Zod, ver
   §5.6). En fallo → `zodErrorToActionError`.
2. Calcula la ventana UTC: `fromDate = new Date(Date.UTC(year,
month - 1, 1))`, `toDate = new Date(Date.UTC(year, month, 1))`
   (límite superior exclusivo).
3. Llama a
   `deps.reportsRepository.findByUserAndMonth(userId, { year,
month })`. El puerto abre internamente el year/month al rango
   de fechas y delega a `TransactionRepositoryPort.list`.
4. Llama a `createMonthlySummary({ userId, year, month, rows,
clock })`.
5. Mapea a `MonthlySummaryDTO` vía `toMonthlySummaryDto`.
6. Retorna `{ ok: true, value: dto }`.

**Estado vacío:** `rows.length === 0` → `totals: []`,
`generatedAt: clock.now()`, `HTTP 200`. La ruta retorna 200 sin
importar si el usuario tiene cuentas; la respuesta con totales
vacíos es el centinela v1 para "todavía sin datos" (ver §7.1).

### 5.4 `getCategoryBreakdownAction`

Misma forma que `getMonthlySummaryAction`, pero el agregador agrupa
por `(categoryNormalized, convertedCurrency)` y ordena por
`amountMinor DESC, categoryNormalized ASC`. Estado vacío → 200 con
`buckets: []`. El `rawQuery` de la acción usa la misma forma que
`monthlySummaryQuerySchema` (keyed por mes). Se provee un
`categoryBreakdownQuerySchema` separado (según §5.6) para que
adiciones futuras (p.ej. `?limit=100`) no se filtren al endpoint
monthly.

### 5.5 `getAccountFlowAction`

```typescript
// src/modules/reports/application/actions/get-account-flow.action.ts

export interface GetAccountFlowInput {
  readonly userId: string;
  readonly accountId: string; // crudo del path URL; aún NO validado
  readonly rawQuery: unknown;
}

export type GetAccountFlowData = AccountFlowDTO;

export async function getAccountFlowAction(
  deps: ReportsActionDeps,
  input: GetAccountFlowInput,
): Promise<ActionResult<GetAccountFlowData>>;
```

**Flujo:**

1. Parsea `rawQuery` con `accountFlowQuerySchema` (Zod, §5.6). El
   esquema acepta O `{ month: 'YYYY-MM' }` (deriva `fromDate` /
   `toDate`) O `{ fromDate: 'YYYY-MM-DD', toDate: 'YYYY-MM-DD' }`.
   La capa de ruta es el único llamador que pasa `accountId` por
   separado (el path URL); el esquema lo valida bajo el campo
   `accountId` con el **regex cuid** `/^c[a-z0-9]{20,32}$/`
   (corrección del orquestador #1).
2. Calcula la ventana de fechas desde la salida del esquema. Si
   el rango excede 366 días, retorna
   `{ ok: false, error: domainError(new InvalidDateRangeError(...)) }`.
3. Llama a `deps.accountRepository.findById(userId, accountId)`:
   - `null` (cross-user o cuenta desconocida) → retorna
     `domainErrorToActionError(new AccountNotFoundError(...))`.
     Código de wire es `NOT_FOUND`, HTTP 404 (REQ-RPT-4, BR-RPT-4).
   - Cuenta encontrada → procede.
4. Llama a `deps.reportsRepository.findByUserAccountAndRange(userId,
{ accountId, fromDate, toDate })`.
5. Llama a `createAccountFlow({ userId, accountId, fromDate,
toDate, rows, clock })`.
6. Mapea a `AccountFlowDTO` vía `toAccountFlowDto`.
7. Retorna `{ ok: true, value: dto }`.

**Comportamiento de días sparse:** `rows.length === 0` en el rango
→ `days: []`, `HTTP 200`. La ruta nunca retorna 404 para un rango
vacío — el 404 cross-user es la única ruta de 404.

### 5.6 Esquemas Zod

```typescript
// src/modules/reports/application/schemas/monthly-summary-query.schema.ts

import { z } from 'zod';

export const monthlySummaryQuerySchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, {
        message: 'month must match YYYY-MM',
      })
      .refine(
        (m) => {
          const month = Number.parseInt(m.slice(5, 7), 10);
          return month >= 1 && month <= 12;
        },
        { message: 'month must be 01..12' },
      ),
  })
  .strict();

export type MonthlySummaryQuery = z.infer<typeof monthlySummaryQuerySchema>;
```

```typescript
// src/modules/reports/application/schemas/category-breakdown-query.schema.ts

export const categoryBreakdownQuerySchema = monthlySummaryQuerySchema.extend({}).strict();
```

Mismo contrato de parse Zod que monthly (keyed por mes). El esquema
es un archivo separado para que filtros futuros (`?limit=`,
`?category=`) se peguen al endpoint de breakdown sin filtrarse al
monthly.

```typescript
// src/modules/reports/application/schemas/account-flow-query.schema.ts

import { z } from 'zod';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CUID_RE = /^c[a-z0-9]{20,32}$/;

const baseAccountFlow = z
  .object({
    accountId: z.string().regex(CUID_RE, {
      message: 'accountId must be a cuid (^c[a-z0-9]{20,32}$)',
    }),
  })
  .strict();

const monthShape = baseAccountFlow
  .extend({
    month: z.string().regex(/^\d{4}-\d{2}$/),
  })
  .strict();

const rangeShape = baseAccountFlow
  .extend({
    fromDate: z.string().regex(ISO_DATE, { message: 'fromDate must be YYYY-MM-DD' }),
    toDate: z.string().regex(ISO_DATE, { message: 'toDate must be YYYY-MM-DD' }),
  })
  .strict()
  .refine((q) => q.fromDate <= q.toDate, {
    message: 'fromDate must be <= toDate',
    path: ['toDate'],
  });

export const accountFlowQuerySchema = z.union([monthShape, rangeShape]);
```

La unión Zod colapsa a una forma `month`-O-`fromDate`+`toDate`. La
capa de ruta dispatcha sobre la forma del output parseado y deriva
el rango de fechas. El esquema también fuerza `fromDate <= toDate`
(REQ-RPT-3). El tope de 366 días es un chequeo a nivel de servicio
(§5.5 paso 2) — Zod no tiene primitivo de math de fechas, así que
la comparación vive en la acción.

### 5.7 Mapeo de errores

| Disparador                                            | Código de wire     | HTTP |
| ----------------------------------------------------- | ------------------ | ---- |
| Falla de parse Zod (mes inválido, accountId inválido) | `VALIDATION_ERROR` | 400  |
| Rango > 366 días o `fromDate > toDate`                | `VALIDATION_ERROR` | 400  |
| Cross-user o `accountId` desconocido en flow          | `NOT_FOUND`        | 404  |
| Sin sesión                                            | `UNAUTHORIZED`     | 401  |
| Error interno (Prisma caído, etc.)                    | `INTERNAL_ERROR`   | 500  |

---

## 6. Infraestructura

### 6.1 `ReportsRepositoryPrisma`

```typescript
// src/modules/reports/infrastructure/repositories/reports.repository.prisma.ts

import type { PrismaClient } from '@prisma/client';
import type { TransactionRepositoryPort } from '@/shared/domain-kernel';
import type { AccountRepositoryPort } from '@/shared/domain-kernel';
import type { ReportsRepositoryPort } from '../../domain/ports/reports-repository.port';

export class ReportsRepositoryPrisma implements ReportsRepositoryPort {
  constructor(
    private readonly deps: {
      transactionRepository: TransactionRepositoryPort;
      prismaView: PrismaDelegateView;
    },
  ) {}

  async findByUserAndMonth(userId, opts): Promise<readonly TransactionDTO[]>;
  async findByUserAndMonthForBreakdown(userId, opts): Promise<readonly TransactionDTO[]>;
  async findByUserAccountAndRange(userId, opts): Promise<readonly TransactionDTO[]>;
}
```

**Por qué reusar `TransactionRepositoryPort.list` en lugar de una
query Prisma fresca.** El `list(userId, { fromDate, toDate,
accountId? })` del puerto ya implementa:

1. La invariante de `userId` como primer argumento (BR-TX-4).
2. El `ORDER BY transactionDate DESC` paginado por cursor con el
   índice compuesto `[userId, transactionDate]` (REQ-TX-8).
3. El path de filtro `accountId` (índice `[accountId,
transactionDate]`).
4. El mapeo a `TransactionDTO` (la forma alineada al wire).

El agregado `reports` necesita el payload completo de fila (no un
agregado Prisma), así que reusar el puerto es estrictamente más
barato que una query Prisma paralela que necesitaría su propia capa
de mapeo. El adaptador Prisma construye una ventana de un mes
(p.ej. `[2026-06-01, 2026-07-01)`) y delega.

**Construcción de la ventana.** La capa de acción pasa `year` y
`month`; el adaptador Prisma construye:

```typescript
const fromDate = new Date(Date.UTC(opts.year, opts.month - 1, 1));
const toDate = new Date(Date.UTC(opts.year, opts.month, 1));
// Nota: toDate es exclusivo; el listado de transactions lo
// trata como inclusivo en el wire pero exclusivo a nivel SQL (el
// puerto clampea `toDate < nextMonth` para evitar el borde).
```

Para el endpoint de flujo el rango de fechas viene de la URL
(`fromDate` / `toDate`) — el adaptador Prisma los pasa tal cual.
El chequeo de 366 días ocurre en la capa de acción (§5.5 paso 2)
antes de llamar al repositorio.

### 6.2 `NoopTransactionRecordedSubscriber`

```typescript
// src/modules/reports/infrastructure/subscribers/noop-transaction-recorded.subscriber.ts

import type { TransactionRecordedPayload } from '@/shared/events/event-dispatcher';
import type { Logger } from '@/shared/logger/logger';

export function createNoopHandler(logger: Logger) {
  return async (event: TransactionRecordedPayload): Promise<void> => {
    logger.debug('reports.noop.transaction-recorded', {
      userId: event.userId,
      transactionId: event.transactionId,
    });
  };
}
```

**Cableado del composition root** (§8 abajo): `buildAppDeps`
llama a `dispatcher.subscribe('TransactionRecorded', noopHandler)`
exactamente una vez. La costura se registra para que el
materializador futuro reemplace el handler in-place; la firma del
dispatcher queda sin cambios.

### 6.3 Costura de test — aserción de conteo de suscriptores

`src/composition/build-app-deps.test.ts` (el archivo de tests
existente para `buildAppDeps`) gana un test nuevo:

```typescript
it('subscribes exactly one noop handler for TransactionRecorded', () => {
  // El dispatcher es process-wide; captura conteos antes/después
  // para no interferir con otros setups de test.
  const before = dispatcher.subscriberCount('TransactionRecorded');
  const deps = buildAppDeps();
  const after = dispatcher.subscriberCount('TransactionRecorded');
  expect(after).toBe(before + 1);
  // ...invoca el suscriptor con un payload de muestra; asegura que no lance
});
```

El método `EventDispatcher.subscriberCount(type)` es la costura
de test existente — la clase dispatcher en
`src/shared/events/event-dispatcher.ts:55-84` expone `subscribers`
como un map privado; este accesor solo-test expone el conteo vía
un pequeño adaptador dentro del archivo de test (sin cambios en
código de producción). Si el suite de tests tiene una convención
distinta (p.ej. exportar un método `subscriberCount` en
`EventDispatcher`), el test sigue esa convención.

---

## 7. Superficie de API

Las tres rutas montan en el `protectedApp` existente (el sub-app en
`src/composition/create-hono-app.ts:126-128` con middleware
`requireSession`). La costura de composition agrega una llamada
`mountReportsRoutes(protectedApp, { reportsDeps })` después del
montaje de transactions (línea 165) y antes de
`app.route('/', protectedApp)`.

### 7.1 Tabla de rutas

| Método | Path                                    | Acción                       | Validador                      | Éxito (200)                      | Códigos de error                                                         |
| ------ | --------------------------------------- | ---------------------------- | ------------------------------ | -------------------------------- | ------------------------------------------------------------------------ |
| `GET`  | `/api/reports/monthly`                  | `getMonthlySummaryAction`    | `monthlySummaryQuerySchema`    | `{ data: MonthlySummaryDTO }`    | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`                               |
| `GET`  | `/api/reports/breakdown`                | `getCategoryBreakdownAction` | `categoryBreakdownQuerySchema` | `{ data: CategoryBreakdownDTO }` | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`                               |
| `GET`  | `/api/reports/accounts/:accountId/flow` | `getAccountFlowAction`       | `accountFlowQuerySchema`       | `{ data: AccountFlowDTO }`       | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `404 NOT_FOUND` (cross-user) |

**Centinela para "usuario sin cuentas"** (decisión del orquestador,
documentada en la propuesta §"Open questions" Q5 follow-up):
`GET /api/reports/monthly` retorna `200` con `totals: []` para un
usuario sin cuentas. El dashboard (§9 abajo) interpreta esto como
"sin datos todavía" y renderiza el CTA de estado vacío. **No** `404`
para zero-accounts en los endpoints de summary o breakdown — el
camino `404 NOT_FOUND` está reservado exclusivamente para acceso
cross-user en el endpoint de flujo, según BR-RPT-4 (sin filtración
de información).

### 7.2 Forma del handler (un ejemplo)

```typescript
// src/modules/reports/application/routes.ts

import type { OpenAPIHono } from '@hono/zod-openapi';
import { ErrorStatus } from '@/shared/errors/error-codes';
import { getMonthlySummaryAction } from './actions/get-monthly-summary.action';
import { getCategoryBreakdownAction } from './actions/get-category-breakdown.action';
import { getAccountFlowAction } from './actions/get-account-flow.action';
import type { ReportsActionDeps } from './actions/_shared';
import type { AuthUser } from '@/modules/api/middlewares/variables';

type ReportsProtectedVariables = { user: AuthUser; requestId: string };

export interface MountReportsRoutesDeps {
  reportsDeps?: ReportsActionDeps; // opcional — espeja el patrón de transactions
}

export function mountReportsRoutes(
  protectedApp: OpenAPIHono<{ Variables: ReportsProtectedVariables }>,
  deps: MountReportsRoutesDeps,
): void {
  if (!deps.reportsDeps) return; // setups legacy solo-accounts siguen compilando
  const rDeps = deps.reportsDeps;
  const statusFor = (code: string): never => ErrorStatus[code as keyof typeof ErrorStatus] as never;

  protectedApp.get('/api/reports/monthly', async (c) => {
    const user = c.get('user');
    const query = Object.fromEntries(new URL(c.req.url).searchParams);
    const res = await getMonthlySummaryAction(rDeps, { userId: user.id, rawQuery: query });
    if (res.ok) return c.json({ data: res.value }, 200);
    return c.json({ error: res.error }, statusFor(res.error.code));
  });

  protectedApp.get('/api/reports/breakdown', async (c) => {
    const user = c.get('user');
    const query = Object.fromEntries(new URL(c.req.url).searchParams);
    const res = await getCategoryBreakdownAction(rDeps, { userId: user.id, rawQuery: query });
    if (res.ok) return c.json({ data: res.value }, 200);
    return c.json({ error: res.error }, statusFor(res.error.code));
  });

  protectedApp.get('/api/reports/accounts/:accountId/flow', async (c) => {
    const user = c.get('user');
    const accountId = c.req.param('accountId');
    const query = Object.fromEntries(new URL(c.req.url).searchParams);
    const res = await getAccountFlowAction(rDeps, { userId: user.id, accountId, rawQuery: query });
    if (res.ok) return c.json({ data: res.value }, 200);
    return c.json({ error: res.error }, statusFor(res.error.code));
  });
}
```

### 7.3 Tests de rutas

`src/modules/reports/application/routes.test.ts` cubre, por ruta:

- `401 UNAUTHORIZED` cuando no hay sesión.
- `200` + forma correcta en request válido (sembrado con
  `InMemoryReportsRepository` + `InMemoryTransactionRepository`).
- `400 VALIDATION_ERROR` en query inválido (p.ej. `?month=foo`).
- `404 NOT_FOUND` en `accountId` cross-user para la ruta de flow.
- `400 VALIDATION_ERROR` en rango > 366 días para la ruta de flow.

Los tests usan el fixture in-memory (`InMemoryReportsRepository`)
respaldado por el fixture in-memory de transactions
(`InMemoryTransactionRepository`) como fuente de datos subyacente.
La composición de fixtures reusa el patrón existente en
`src/modules/transactions/application/fixtures/in-memory-transaction.repository.ts`.

---

## 8. Cableado del composition root

### 8.1 Adiciones a `buildAppDeps`

```typescript
// src/composition/build-app-deps.ts — adiciones

import { ReportsRepositoryPrisma } from '@/modules/reports/infrastructure/repositories/reports.repository.prisma';
import { createNoopHandler } from '@/modules/reports/infrastructure/subscribers/noop-transaction-recorded.subscriber';
import type { ReportsActionDeps, MountReportsRoutesDeps } from '@/modules/reports';

export interface HonoAppDeps {
  // ... campos existentes sin cambios ...
  /**
   * Slice 3 (reports): el bag de deps de la capa de acción
   * para la capacidad reports. La factory construye el real
   * (adaptador Prisma + InMemoryReportsRepository para la
   * costura del SubscriberPort + handler no-op del dispatcher);
   * los tests inyectan uno fake con un repositorio in-memory.
   */
  reportsDeps?: ReportsActionDeps;
}

export function buildAppDeps(): HonoAppDeps {
  // ... cableado existente sin cambios ...
  const reportsDeps = buildReportsDeps({
    txRepo,
    accountRepo,
    dispatcher,
    logger,
    clock: systemClock,
  });

  // BR-RPT-5: cablea el handler no-op en tiempo de composition.
  dispatcher.subscribe('TransactionRecorded', createNoopHandler(logger));

  return {
    // ... campos existentes sin cambios ...
    reportsDeps,
  };
}

export function buildReportsDeps(args: {
  txRepo: TransactionRepositoryPort;
  accountRepo: AccountRepositoryPort;
  dispatcher: EventDispatcher;
  logger: Logger;
  clock: Clock;
}): ReportsActionDeps {
  const reportsRepo = new ReportsRepositoryPrisma({
    transactionRepository: args.txRepo,
    prismaView: asPrismaDelegateView(
      prisma() as unknown as Parameters<typeof asPrismaDelegateView>[0],
    ),
  });
  const subscriber: ReportSubscriberPort = {
    onTransactionRecorded: (handler) => {
      args.dispatcher.subscribe('TransactionRecorded', handler);
      return () => args.dispatcher.unsubscribe?.('TransactionRecorded', handler);
    },
  };
  return {
    reportsRepository: reportsRepo,
    accountRepository: args.accountRepo,
    subscriber,
    clock: args.clock,
    logger: args.logger,
    dispatcher: args.dispatcher,
  };
}
```

### 8.2 Montaje en `createHonoApp`

```typescript
// src/composition/create-hono-app.ts — adiciones después de línea 165

mountReportsRoutes(protectedApp, { reportsDeps: deps.reportsDeps });
```

### 8.3 Aserción de conteo de suscriptores en `build-app-deps.test.ts`

§6.3 arriba. El test asegura exactamente un suscriptor para
`TransactionRecorded` después de que `buildAppDeps` retorna. Un
suscribe faltante falla el test (REQ-RPT-7 escenario "composition-root
boot registers the no-op handler").

---

## 9. UI — `app/dashboard/`

El dashboard es un Server Component que resuelve la sesión vía
`auth()` y llama a los tres endpoints de reports en paralelo. Tres
Server Components presentacionales renderizan las tarjetas. Sin
hooks de cliente, sin directiva `'use client'`. Smoke-minimal, no
producción.

### 9.1 Árbol de archivos

```
app/dashboard/
├── page.tsx                       # RSC: resuelve sesión, llama 3 endpoints en paralelo, renderiza 3 cards
└── (helpers viven en app/_components/ y app/_lib/)

app/_components/
├── dashboard-monthly-summary.tsx       # Server Component: recibe MonthlySummaryDTO, renderiza card
├── dashboard-category-breakdown.tsx    # Server Component: recibe CategoryBreakdownDTO, renderiza card
└── dashboard-account-flow.tsx          # Server Component: recibe AccountFlowDTO, renderiza card

app/_lib/
├── report-types.ts                     # MonthlySummaryDTO, CategoryBreakdownDTO, AccountFlowDTO (formas wire)
└── (reuse formatMinor de format-minor.ts; sin formateador nuevo)
```

### 9.2 `app/dashboard/page.tsx`

```typescript
// smoke-minimal, not production
import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth';
import { serverHonoRequest } from '@/lib/server-hono';
import { MonthlySummaryCard } from '../_components/dashboard-monthly-summary';
import { CategoryBreakdownCard } from '../_components/dashboard-category-breakdown';
import { AccountFlowCard } from '../_components/dashboard-account-flow';
import type { MonthlySummaryDTO, CategoryBreakdownDTO, AccountFlowDTO, ErrorEnvelope } from '../_lib/report-types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/dashboard'));
  }

  // Llamadas en paralelo — los tres endpoints son independientes.
  const [summaryRes, breakdownRes] = await Promise.all([
    serverHonoRequest('/api/reports/monthly?month=' + currentUtcMonth()),
    serverHonoRequest('/api/reports/breakdown?month=' + currentUtcMonth()),
  ]);

  // El card de flow está vacío en v1 — el dashboard no hace
  // deep-link a una cuenta específica. Un cambio futuro agrega
  // un selector de cuenta que llame a /api/reports/accounts/:id/flow.
  const summary: MonthlySummaryDTO = summaryRes.ok
    ? (await summaryRes.json()).data
    : { totals: [], generatedAt: new Date().toISOString() };
  const breakdown: CategoryBreakdownDTO = breakdownRes.ok
    ? (await breakdownRes.json()).data
    : { buckets: [], generatedAt: new Date().toISOString() };
  const flow: AccountFlowDTO = { days: [], generatedAt: new Date().toISOString() };

  // Centinela de estado vacío: sin totales Y sin buckets.
  const isEmpty = summary.totals.length === 0 && breakdown.buckets.length === 0;

  return (
    <main className="p-6">
      <header className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <span className="text-sm text-gray-500">{summaryMonthLabel()}</span>
      </header>
      {isEmpty ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MonthlySummaryCard summary={summary} />
          <CategoryBreakdownCard breakdown={breakdown} />
          <AccountFlowCard flow={flow} />
        </div>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <EmptyCard title="Sin datos" />
      <EmptyCard title="Sin datos" />
      <EmptyCard title="Sin datos" />
      <div className="md:col-span-3 text-center mt-4">
        <a href="/transactions/new" className="rounded bg-blue-600 text-white px-4 py-2">
          Registrar primera transacción
        </a>
      </div>
    </div>
  );
}
```

### 9.3 Componentes presentacionales (esbozo)

```typescript
// app/_components/dashboard-monthly-summary.tsx
// Server Component — sin 'use client'.
import { formatMinor } from '../_lib/format-minor';
import type { MonthlySummaryDTO } from '../_lib/report-types';

export function MonthlySummaryCard({ summary }: { summary: MonthlySummaryDTO }) {
  // Expone la etiqueta UTC para que el usuario sepa que el bucketing es UTC.
  return (
    <article className="rounded border p-4">
      <h2 className="text-lg font-semibold mb-2">Resumen mensual</h2>
      <p className="text-xs text-gray-500 mb-3">{summaryMonthLabel(summary.generatedAt)}</p>
      <table className="w-full text-sm">
        <thead>
          <tr><th>Moneda</th><th>Ingresos</th><th>Gastos</th><th>Neto</th><th>#</th></tr>
        </thead>
        <tbody>
          {summary.totals.map((t) => (
            <tr key={t.convertedCurrency}>
              <td>{t.convertedCurrency}</td>
              <td>{formatMinor(t.incomeMinor, t.convertedCurrency)}</td>
              <td>{formatMinor(t.expenseMinor, t.convertedCurrency)}</td>
              <td>{formatMinor(t.netMinor, t.convertedCurrency)}</td>
              <td>{t.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

// dashboard-category-breakdown.tsx — mismo patrón; renderiza los buckets como tabla ordenada por amountMinor DESC.
// dashboard-account-flow.tsx — mismo patrón; renderiza los días como tabla o gráfico de barras CSS-width.
```

Los tres componentes son Server Components puros. Sin hooks de
cliente, sin `useState`, sin `useEffect`. El gráfico de barras CSS
`width: %` se renderiza en server; sin librería de charts en v1.

### 9.4 Tests de UI

Tests de snapshot Vitest para los tres componentes
presentacionales, ejercidos vía `renderToStaticMarkup` de
`react-dom/server` (la costura de test existente del proyecto —
`react-dom/server` ya es dev dependency según `package.json`):

```typescript
// app/_components/dashboard-monthly-summary.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { MonthlySummaryCard } from './dashboard-monthly-summary';
import type { MonthlySummaryDTO } from '../_lib/report-types';

it('renders an empty state when totals is empty', () => {
  const summary: MonthlySummaryDTO = {
    totals: [],
    generatedAt: '2026-06-15T12:00:00.000Z',
  };
  const html = renderToStaticMarkup(<MonthlySummaryCard summary={summary} />);
  expect(html).toMatchSnapshot();
});

it('renders one row per convertedCurrency', () => {
  const summary: MonthlySummaryDTO = {
    totals: [
      { convertedCurrency: 'ARS', incomeMinor: 100000, expenseMinor: 50000, netMinor: 50000, count: 3 },
      { convertedCurrency: 'USD', incomeMinor: 0, expenseMinor: 2500, netMinor: -2500, count: 1 },
    ],
    generatedAt: '2026-06-15T12:00:00.000Z',
  };
  const html = renderToStaticMarkup(<MonthlySummaryCard summary={summary} />);
  expect(html).toMatchSnapshot();
});
```

Más un snapshot para `app/dashboard/page.tsx` mismo (chequeo
smoke; la página es un RSC).

---

## 10. Desglose por slices (4 PRs encadenados, force-chained)

El orquestador pre-cacheó `delivery_strategy: force-chained` y
`review_budget_lines: 400`. Cada slice DEBE ser un PR
auto-contenido con inicio, fin, verificación y rollback claros.

### 10.1 Slice 1 — `reports-domain`

| Campo             | Valor                                                                                                                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch            | `feat/reports-1-domain`                                                                                                                                                                                                                                                                             |
| Alcance           | `src/modules/reports/domain/` (esqueleto de dominio completo, sin rutas, sin capa de aplicación, sin cambios Hono)                                                                                                                                                                                  |
| Archivos (nuevos) | Todos los archivos bajo `src/modules/reports/domain/` (agregados × 3, servicios × 1, puertos × 2, errores × 5, value-objects × 1, barrel × 1) + tests co-localizados + puerto de kernel nuevo `src/shared/domain-kernel/ports/transaction-repository-port.ts` + actualización del barrel del kernel |
| LoC bajo          | 180                                                                                                                                                                                                                                                                                                 |
| LoC alto          | 280                                                                                                                                                                                                                                                                                                 |
| Verificación      | `pnpm test src/modules/reports/domain` sale 0; test de contrato del puerto asegura aislamiento cross-user; ≥ 80% coverage en la capa de dominio                                                                                                                                                     |
| Rollback          | `git revert <merge-sha>`; la eliminación del puerto del kernel es no-breaking (solo `reports` lo importa)                                                                                                                                                                                           |
| Follow-up         | Slice 2 consume el puerto; sin dependencia externa de cambios del slice 1 después del merge                                                                                                                                                                                                         |

**Plan de commits** (atómicos, conventional; espeja el patrón
work-unit-commits):

1. `feat(reports-domain): add kernel port for transaction read surface`
   — agrega
   `src/shared/domain-kernel/ports/transaction-repository-port.ts`
   y actualiza `src/shared/domain-kernel/index.ts` (≤ 30 líneas).
2. `test(reports-domain): port contract test asserts userId-first on every method`
   — agrega `reports-repository.port.test.ts` (RED).
3. `feat(reports-domain): add ReportsRepositoryPort and ReportSubscriberPort interfaces`
   — agrega los dos archivos de puerto (GREEN).
4. `feat(reports-domain): add MonthlySummary aggregate with factory + tests`
   — entidad + tests (RED → GREEN → TRIANGULATE → REFACTOR).
5. `feat(reports-domain): add CategoryBreakdown aggregate with factory + tests`
   — entidad + tests.
6. `feat(reports-domain): add AccountFlow aggregate with factory + tests`
   — entidad + tests.
7. `feat(reports-domain): add pure aggregator services + tests`
   — `aggregate-transactions.ts` + tests.
8. `feat(reports-domain): add domain errors and value objects + tests`
   — clases de error + `month.ts`.
9. `docs(reports-domain): design + Spanish mirror` — ya entregado
   en esta fase de diseño; sin commit necesario.

**Ciclo TDD para commit #4** (el primer test de entidad). Ver §11.1.

### 10.2 Slice 2 — `reports-application`

| Campo             | Valor                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch            | `feat/reports-2-application`                                                                                                                     |
| Alcance           | `src/modules/reports/application/` (acciones × 3, esquemas × 3, DTOs × 3, fixtures × 1, stub de rutas × 1, barrel × 1, tests co-localizados)     |
| Archivos (nuevos) | Todos los archivos bajo `src/modules/reports/application/`                                                                                       |
| LoC bajo          | 220                                                                                                                                              |
| LoC alto          | 340                                                                                                                                              |
| Verificación      | `pnpm test src/modules/reports/application` sale 0; tests de acción cubren estado vacío, multi-moneda, aislamiento cross-user, paths 400/401/404 |
| Rollback          | `git revert <merge-sha>`; la capa de aplicación es aditiva (sin llamadores hasta el slice 3)                                                     |
| Follow-up         | Slice 3 monta las rutas en `protectedApp` y cablea el composition root                                                                           |

**Plan de commits**:

1. `test(reports-application): monthly-summary-query schema RED`
   — tests de parse de esquema sin implementación (RED).
2. `feat(reports-application): monthly-summary-query schema`
   — implementación del esquema (GREEN).
3. `test(reports-application): category-breakdown-query schema RED`
4. `feat(reports-application): category-breakdown-query schema`
5. `test(reports-application): account-flow-query schema RED`
6. `feat(reports-application): account-flow-query schema` (regex
   cuid en `accountId` según corrección del orquestador #1).
7. `test(reports-application): in-memory reports repository fixture RED`
8. `feat(reports-application): in-memory reports repository fixture`
9. `test(reports-application): get-monthly-summary action RED`
10. `feat(reports-application): get-monthly-summary action`
11. `test(reports-application): get-category-breakdown action RED`
12. `feat(reports-application): get-category-breakdown action`
13. `test(reports-application): get-account-flow action RED`
14. `feat(reports-application): get-account-flow action`
15. `feat(reports-application): DTO mappers + tests`
16. `feat(reports-application): _shared.ts + barrel + ApplicationLayer`

**Ciclo TDD para commit #9**. Ver §11.2.

### 10.3 Slice 3 — `reports-routes`

| Campo                  | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch                 | `feat/reports-3-routes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Alcance                | `src/modules/reports/application/routes.ts` (función de montaje), `src/composition/build-app-deps.ts` (cableado de deps + subscribe noop), `src/composition/create-hono-app.ts` (llamada de montaje), `src/modules/reports/infrastructure/repositories/reports.repository.prisma.ts` (adaptador Prisma), `src/modules/reports/infrastructure/subscribers/noop-transaction-recorded.subscriber.ts` (handler noop), `src/modules/reports/index.ts` (barrel público), `src/shared/domain-kernel/index.ts` (re-export del puerto), `src/composition/build-app-deps.test.ts` (aserción de conteo de suscriptores) |
| Archivos (nuevos)      | `routes.ts`, `routes.test.ts`, `reports.repository.prisma.ts`, `reports.repository.prisma.test.ts`, `noop-transaction-recorded.subscriber.ts`, `noop-transaction-recorded.subscriber.test.ts`, `src/modules/reports/index.ts`                                                                                                                                                                                                                                                                                                                                                                                |
| Archivos (modificados) | `src/composition/build-app-deps.ts`, `src/composition/create-hono-app.ts`, `src/shared/domain-kernel/index.ts`, `src/composition/build-app-deps.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| LoC bajo               | 160                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| LoC alto               | 260                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Verificación           | `pnpm test src/modules/reports/application/routes.test.ts` sale 0; `pnpm test src/composition/build-app-deps.test.ts` asegura el conteo de suscriptores (REQ-RPT-7); `curl` manual smoke contra `pnpm dev` con datos sembrados                                                                                                                                                                                                                                                                                                                                                                               |
| Rollback               | `git revert <merge-sha>`; las tres rutas son aditivas (sin llamadores hasta el slice 4); el subscribe noop es removible sin llamadores hasta un cambio futuro                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Follow-up              | Slice 4 consume las rutas desde `app/dashboard/page.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Plan de commits**:

1. `test(reports-routes): noop handler RED` — el handler retorna
   `void`; asegura no-throw en payload de muestra.
2. `feat(reports-routes): noop handler + test` (GREEN).
3. `feat(reports-routes): composition-root wires the noop handler`
   — agrega la llamada `dispatcher.subscribe` en `buildAppDeps`.
4. `test(reports-routes): subscriber-count assertion RED`
   — `build-app-deps.test.ts` asegura el conteo.
5. `feat(reports-routes): subscriber-count assertion passes` (GREEN).
6. `test(reports-routes): Prisma reports repository integration RED`
   — test de integración testcontainers Postgres.
7. `feat(reports-routes): Prisma reports repository` (GREEN).
8. `test(reports-routes): Hono integration RED`
   — tres rutas con deps in-memory.
9. `feat(reports-routes): mount function + Hono integration` (GREEN).
10. `feat(reports-routes): wire mount into createHonoApp`
    — adición de una línea en `create-hono-app.ts`.
11. `docs(reports-routes): barrel + module README`

**Ciclo TDD para commit #1** (el test del noop handler). Ver §11.3.

### 10.4 Slice 4 — `dashboard-ui`

| Campo             | Valor                                                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch            | `feat/reports-4-dashboard-ui`                                                                                                                                                                                                                                                        |
| Alcance           | `app/dashboard/page.tsx`, `app/_components/dashboard-*.tsx` (× 3), `app/_lib/report-types.ts`, tests co-localizados                                                                                                                                                                  |
| Archivos (nuevos) | `app/dashboard/page.tsx`, `app/_components/dashboard-monthly-summary.tsx`, `app/_components/dashboard-category-breakdown.tsx`, `app/_components/dashboard-account-flow.tsx`, `app/_lib/report-types.ts`, `app/dashboard/page.test.tsx`, `app/_components/dashboard-*.test.tsx` (× 3) |
| LoC bajo          | 200                                                                                                                                                                                                                                                                                  |
| LoC alto          | 320                                                                                                                                                                                                                                                                                  |
| Verificación      | Smoke manual `pnpm dev`: sign in → visitar `/dashboard` → ver tres cards. Tests de snapshot Vitest para los tres componentes presentacionales + la página dashboard.                                                                                                                 |
| Rollback          | `git revert <merge-sha>`; la ruta dashboard es aditiva (404 si se visita cuando el slice está revertido; ninguna otra ruta la referencia)                                                                                                                                            |
| Follow-up         | El `transactions-ui` futuro agrega primitivas de design-system y auditorías de accesibilidad                                                                                                                                                                                         |

**Plan de commits**:

1. `feat(dashboard-ui): report-types.ts wire shapes`
   — DTOs espejando las formas de respuesta wire (≤ 40 líneas).
2. `test(dashboard-ui): MonthlySummaryCard empty state snapshot RED`
3. `feat(dashboard-ui): MonthlySummaryCard`
4. `test(dashboard-ui): CategoryBreakdownCard empty + populated snapshots RED`
5. `feat(dashboard-ui): CategoryBreakdownCard`
6. `test(dashboard-ui): AccountFlowCard empty state snapshot RED`
7. `feat(dashboard-ui): AccountFlowCard`
8. `test(dashboard-ui): dashboard page empty state snapshot RED`
9. `feat(dashboard-ui): app/dashboard/page.tsx`
10. `docs(dashboard-ui): Spanish mirror update` — `app/` no tiene
    mirror `Documents-es/` (según la convención existente del
    proyecto; el mirror cubre `docs/` y `openspec/` solamente).
    Sin commit necesario.

**Ciclo TDD para commit #2** (el primer snapshot de card). Ver §11.4.

---

## 11. Plan TDD por slice — RED → GREEN → TRIANGULATE → REFACTOR

TDD estricto según `openspec/config.yaml`. Cada primer commit
test-driven de cada slice sigue el ciclo de abajo.

### 11.1 Slice 1 — Agregado `MonthlySummary`

**RED.** Escribir primero el test fallido:

```typescript
// src/modules/reports/domain/aggregates/monthly-summary.test.ts
import { describe, it, expect } from 'vitest';
import { createMonthlySummary } from './monthly-summary';
import type { TransactionDTO } from '@/shared/domain-kernel/ports/transaction-repository-port';
import { systemClock } from '@/shared/clock/system-clock';

describe('createMonthlySummary', () => {
  it('agrupa por convertedCurrency y retorna una fila por moneda', () => {
    // GIVEN: 3 transacciones ARS + 2 USD en 2026-06 (UTC)
    const rows: TransactionDTO[] = [
      {
        id: 'a',
        userId: 'u1',
        accountId: 'a1',
        direction: 'INCOME',
        amountMinor: 100000,
        currency: 'ARS',
        convertedAmountMinor: 100000,
        convertedCurrency: 'ARS',
        transactionDate: new Date('2026-06-01T00:00:00Z'),
        fxAsOfSnapshot: null,
        casaSnapshot: null,
        memo: null,
        category: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // ... 4 filas más
    ];

    // WHEN: el factory se llama con las filas + el reloj del sistema
    const summary = createMonthlySummary({
      userId: 'u1',
      year: 2026,
      month: 6,
      rows,
      clock: systemClock,
    });

    // THEN: dos filas de totales (una por convertedCurrency)
    expect(summary.totals).toHaveLength(2);
    expect(summary.totals).toContainEqual({
      convertedCurrency: 'ARS',
      incomeMinor: expect.any(Number),
      expenseMinor: expect.any(Number),
      netMinor: expect.any(Number),
      count: 3,
    });
    // ... aserción fila USD
    expect(summary.generatedAt).toBeInstanceOf(Date);
  });
});
```

El test falla porque `createMonthlySummary` aún no existe.

**GREEN.** Implementar el factory mínimo:

```typescript
export function createMonthlySummary(input: CreateMonthlySummaryInput): MonthlySummary {
  const buckets = new Map<AccountCurrency, MonthlyTotals>();
  for (const row of input.rows) {
    const existing = buckets.get(row.convertedCurrency) ?? {
      convertedCurrency: row.convertedCurrency,
      incomeMinor: 0,
      expenseMinor: 0,
      netMinor: 0,
      count: 0,
    };
    if (row.direction === 'INCOME') existing.incomeMinor += row.convertedAmountMinor;
    else existing.expenseMinor += row.convertedAmountMinor;
    existing.count += 1;
    buckets.set(row.convertedCurrency, existing);
  }
  const totals = [...buckets.values()].map((b) => ({
    ...b,
    netMinor: b.incomeMinor - b.expenseMinor,
  }));
  return {
    userId: input.userId,
    year: input.year,
    month: input.month,
    totals,
    generatedAt: input.clock.now(),
  };
}
```

**TRIANGULATE.** Agregar un segundo test que pruebe un ángulo
diferente:

```typescript
it('retorna un array de totales vacío cuando no hay filas', () => {
  const summary = createMonthlySummary({
    userId: 'u1',
    year: 2026,
    month: 6,
    rows: [],
    clock: systemClock,
  });
  expect(summary.totals).toEqual([]);
  expect(summary.generatedAt).toBeInstanceOf(Date);
});

it('lanza cuando el mes está fuera de rango', () => {
  expect(() =>
    createMonthlySummary({ userId: 'u1', year: 2026, month: 13, rows: [], clock: systemClock }),
  ).toThrow(ReportsDomainError);
});
```

**REFACTOR.** Extraer el bucketing en un helper privado, extraer
la validación del mes en una función libre en `month.ts`,
compartir la alocación del `Map` con `aggregateMonthly`. Re-correr
tests; todo verde.

### 11.2 Slice 2 — `getMonthlySummaryAction`

**RED.** Escribir primero el test fallido:

```typescript
// src/modules/reports/application/actions/get-monthly-summary.action.test.ts
import { describe, it, expect } from 'vitest';
import { getMonthlySummaryAction } from './get-monthly-summary.action';
import { InMemoryReportsRepository } from '../fixtures/reports-repository.inmemory';
import { InMemoryTransactionRepository } from '@/modules/transactions/application/fixtures/in-memory-transaction.repository';
import { systemClock } from '@/shared/clock/system-clock';

describe('getMonthlySummaryAction', () => {
  it('retorna 200 con totales mensuales para un query de mes válido', async () => {
    // GIVEN: repo in-memory con 2 transacciones ARS en 2026-06
    const txRepo = new InMemoryTransactionRepository();
    txRepo.seed(/* sembrar 2 filas ARS */);
    const reportsRepo = new InMemoryReportsRepository(txRepo);
    const deps = { reportsRepository: reportsRepo /* ... */ } as any;

    // WHEN: la acción se llama con month=2026-06
    const result = await getMonthlySummaryAction(deps, {
      userId: 'u1',
      rawQuery: { month: '2026-06' },
    });

    // THEN: ok=true y totals tiene 1 fila ARS
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totals).toHaveLength(1);
      expect(result.value.totals[0].convertedCurrency).toBe('ARS');
    }
  });
});
```

**GREEN.** Implementar la acción mínima: parsear, llamar al
puerto, llamar al factory, retornar DTO.

**TRIANGULATE.** Agregar test de aislamiento cross-user (las
filas del usuario B no aparecen), test de estado vacío (sin filas
→ totales vacíos), y test de mes inválido (`?month=foo` →
`VALIDATION_ERROR`).

**REFACTOR.** Extraer la derivación de la ventana
`month → fromDate/toDate` en `month.ts` (compartida con la acción
de breakdown). Extraer el mapeo a DTO en `monthly-summary.dto.ts`.

### 11.3 Slice 3 — `NoopTransactionRecordedSubscriber`

**RED.** Escribir primero el test fallido:

```typescript
// src/modules/reports/infrastructure/subscribers/noop-transaction-recorded.subscriber.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createNoopHandler } from './noop-transaction-recorded.subscriber';

describe('createNoopHandler', () => {
  it('retorna void sin lanzar en un payload TransactionRecorded de muestra', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const handler = createNoopHandler(logger as any);
    const payload = {
      userId: 'u1',
      transactionId: 't1',
      accountId: 'a1',
      direction: 'INCOME' as const,
      amountMinor: 1000,
      currency: 'ARS' as const,
      casa: null,
      convertedAmountMinor: 1000,
      convertedCurrency: 'ARS' as const,
      occurredAt: '2026-06-15T00:00:00.000Z',
    };
    await expect(handler(payload)).resolves.toBeUndefined();
    expect(logger.debug).toHaveBeenCalledWith(
      'reports.noop.transaction-recorded',
      expect.objectContaining({ userId: 'u1' }),
    );
  });
});
```

**GREEN.** Implementar:

```typescript
export function createNoopHandler(logger: Logger) {
  return async (event: TransactionRecordedPayload): Promise<void> => {
    logger.debug('reports.noop.transaction-recorded', {
      userId: event.userId,
      transactionId: event.transactionId,
    });
  };
}
```

**TRIANGULATE.** Agregar un test que asegure que el handler acepta
la forma canónica del payload (sin campos extra, sin campos
faltantes) — un test de type-narrowing que falla si la interfaz
`TransactionRecordedPayload` cambia.

**REFACTOR.** Sin refactor necesario para v1; el handler es un
one-liner.

### 11.4 Slice 4 — Snapshot de estado vacío de `MonthlySummaryCard`

**RED.** Escribir primero el test de snapshot fallido:

```typescript
// app/_components/dashboard-monthly-summary.test.tsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MonthlySummaryCard } from './dashboard-monthly-summary';

describe('MonthlySummaryCard', () => {
  it('renderiza un estado vacío cuando totals está vacío', () => {
    const html = renderToStaticMarkup(
      <MonthlySummaryCard
        summary={{ totals: [], generatedAt: '2026-06-15T12:00:00.000Z' }}
      />,
    );
    expect(html).toContain('Sin datos');
    expect(html).toContain('Resumen mensual');
  });
});
```

El test falla porque `MonthlySummaryCard` aún no existe.

**GREEN.** Implementar el componente como un Server Component puro
(ver esbozo en §9.3).

**TRIANGULATE.** Agregar un test de snapshot de estado poblado
(dos filas: ARS + USD), y un test de snapshot que asegure que la
etiqueta de mes UTC aparece en el HTML renderizado.

**REFACTOR.** Extraer un shell `<Card>` de los tres componentes
presentacionales para deduplicar borde / padding / tipografía;
re-correr snapshots; todo verde.

---

## 12. Riesgos y desviaciones

### 12.1 BRs heredadas por referencia

El diseño mantiene BR-ACC-12, BR-TX-4, BR-TX-7 y BR-TX-9 por
**referencia** en lugar de inlinear su texto. Esto sigue la
convención del repo en
`openspec/changes/transactions/specs/transactions/spec.md` §"Carried
from other capabilities" — el spec nombra el ID de la BR y el
archivo fuente, no el texto completo. El diseño carga la misma
convención en sus callouts de "BRs heredadas" (§1, §3.6, §4.1).

Esto es una convención intencional, NO una anti-pattern §10.3.
Marcándolo aquí para que el reviewer no lo marque como drift.

### 12.2 Tope superior de 366 días

El spec codificó 366 días como el tope superior para el endpoint de
flujo de cuenta. El diseño lo mantiene. Rationale (corrección del
orquestador #3): un año calendario + buffer de día bisiesto. El
buffer absorbe:

- Redondeo de zona horaria en el borde de medianoche UTC (un
  `toDate=2026-12-31` en UTC es `2027-01-01` en UTC+1).
- Alineación con año bisiesto (un rango
  `fromDate=2024-01-01 toDate=2025-01-01` son 366 días porque 2024
  es bisiesto).
- Holgura de un día para el reloj del usuario levemente adelante
  de UTC.

Un cambio futuro puede ajustar a 365 días si el feedback del
usuario indica que el cap de 366 es demasiado laxo; el límite está
centralizado en el chequeo de rango de la acción (§5.5 paso 2), así
que el cambio es una edición de una línea.

### 12.3 cuid vs UUID v4 — corregido aquí vs el spec

El spec dijo "`accountId` MUST be a UUID v4 string" en REQ-RPT-5.
El proyecto usa **cuid** para `FinancialAccount.id` según
`openspec/specs/transactions/spec.md:184` y la declaración del
esquema Prisma `Transaction.id` (`@id @default(cuid())`). El
diseño aplica la corrección: el esquema Zod en
`account-flow-query.schema.ts` valida `accountId` con el regex
cuid `/^c[a-z0-9]{20,32}$/`.

`sdd-apply` DEBE usar el regex cuid. La fase de spec debería tomar
esto en el próximo delta (una edición de una línea en REQ-RPT-5).
El diseño carga la redacción corregida aquí para que la
implementación aterrice en el regex correcto.

### 12.4 Rendimiento del cálculo perezoso al leer

La propuesta §"Snapshot strategy" documenta el trade-off de
lectura perezosa. Las funciones de agregado corren in-memory al
tiempo de query; los dos índices Prisma existentes
(`@@index([userId, transactionDate])` y
`@@index([accountId, transactionDate])`) hacen que la lectura sea
O(rows-in-window). A escala de filas v1 (bajos cientos por usuario
por mes), el agregado in-memory es sub-100ms.

El riesgo es que conforme crezca el conteo de filas del usuario, el
agregado se vuelva lento. El camino de mitigación es la migración
de materialización event-driven: el suscriptor no-op (§6.2) se
convierte en el materializador; el path de lectura cambia de
`TransactionRepositoryPort.list` a la tabla de materialización; sin
cambio de interfaz para los llamadores.

### 12.5 El suscriptor no-op podría enmascarar un bug de cableado

Un handler no-op que retorna `void` se ve idéntico a un handler
ausente desde la perspectiva del dispatcher. El riesgo es que una
regresión de cableado (p.ej. alguien remueve la llamada
`dispatcher.subscribe` en `buildAppDeps`) pase desapercibida.

Mitigación: `build-app-deps.test.ts` asegura que
`dispatcher.subscriberCount('TransactionRecorded')` sea exactamente
`before + 1` después de que `buildAppDeps` retorna (§6.3, §8.3).
Un subscribe faltante falla el test (escenario REQ-RPT-7).

### 12.6 Riesgo de TDD estricto

El paso RED del TDD estricto es fácil de saltear bajo presión de
tiempo. El riesgo es que la implementación aterrice con un test no
rojo o con tests escritos después del código. La mitigación:

- `sdd-tasks` es dueño de la estructura de tareas; las tareas
  documentan el test RED por commit antes de la implementación
  GREEN.
- `sdd-apply` enforce RED → GREEN → TRIANGULATE → REFACTOR por
  tarea (según `openspec/config.yaml` y la referencia
  `~/.pi/agent/gentle-ai/support/strict-tdd.md`).
- El template de PR (`.github/pull_request_template.md`) requiere
  que el reviewer confirme que el commit RED aterrizó antes del
  commit GREEN.

### 12.7 Centinela de "usuario sin cuentas" en el endpoint de summary

El diseño retorna `200 { totals: [] }` para un usuario sin cuentas
en `GET /api/reports/monthly` (orquestador §7.1). La alternativa
sería `404 NOT_FOUND`, pero eso confunde "el usuario tiene cuentas,
ninguna transaccionó este mes" con "el usuario no tiene cuentas
todavía". Ambos son estados vacíos legítimos; la rama de estado
vacío del dashboard (§9.2) maneja ambos uniformemente.

Marcando esto como decisión de diseño porque el escenario REQ-RPT-4
del spec solo especifica `404` para lecturas cross-user, no para
zero-accounts. El centinela de estado vacío del dashboard (§9.2)
es el consumidor de esta decisión.

### 12.8 El `src/modules/transactions/index.ts` existente no existe

El árbol de diseño del orquestador (§2.1 arriba) pide
`src/modules/reports/index.ts` como el barrel público. El módulo
`transactions` no sigue esta convención — su barrel público es
`src/modules/transactions/application/index.ts` (reexportando la
superficie de dominio). El diseño sigue la especificación del
orquestador para `reports` porque el orquestador es la fuente
canónica para la estructura del cambio. Un refactor futuro podría
normalizar ambos módulos a un único barrel raíz, pero está fuera
del scope v1.

### 12.9 Convención de signo para `convertedAmountMinor`

**Convención (verificada contra el código del slice 1 en
`src/modules/reports/domain/services/aggregate-transactions.ts`,
que refleja verbatim las factories originales de
`monthly-summary.ts` y `account-flow.ts`):**

- `convertedAmountMinor` lleva SIGNO: positivo para INCOME,
  negativo para EXPENSE. (Heredado de BR-ACC-12 / REQ-TX-1.)
- `TransactionDirection` es el campo explícito del DTO; el signo
  del monto es **redundante pero se preserva** por conveniencia
  aritmética y para permitir que el agregador caiga al signo si
  `direction` llegara a estar ausente.
- `aggregateMonthly` separa income y expense por `direction`, y
  luego quita el signo con `Math.abs` antes de sumar en
  `incomeMinor` / `expenseMinor` (ambos `>= 0`). `netMinor` se
  calcula como `incomeMinor - expenseMinor` y puede ser negativo.
  El `Math.abs` es **load-bearing** en este camino — hace que las
  filas de fixture que pasan magnitudes positivas (sin signo) y
  las filas que pasan magnitudes negativas (con signo, según la
  convención) funcionen correctamente.
- `aggregateAccountFlow` y `aggregateCategoryBreakdown` suman el
  `convertedAmountMinor` con signo directamente (sin `Math.abs`)
  porque esos agregados tratan income como contribución positiva
  y expense como contribución negativa — `runningBalanceMinor` y
  `amountMinor` llevan el signo natural.

**Invariante bajo la convención:**

```
netMinor == sum(signed convertedAmountMinor del mes)
        == incomeMinor - expenseMinor
```

ambas expresiones evalúan al mismo valor porque las filas de income
contribuyen positivamente y las de expense negativamente una vez que
`Math.abs` quita el signo para la separación.

**Regla para fixtures de test:** los fixtures DEBEN seguir la
convención — una fila con `direction: 'EXPENSE'` y
`convertedAmountMinor` positivo funciona bajo la implementación
actual (gracias a `Math.abs`), pero una fila con
`direction: 'INCOME'` y `convertedAmountMinor` negativo sería
**sumada incorrectamente en `expenseMinor`** porque `Math.abs`
quitaría el signo y la separación rutearía por `direction`.
Siempre parear `direction` con el signo correspondiente.

---

## 13. Preguntas abiertas para el usuario

Ninguna. Las cinco preguntas bloqueadas en la sesión de pre-spec
(propuesta §"Open questions" Q1-Q5) están codificadas en el spec y
el diseño las carga verbatim. Las correcciones del orquestador
(regex cuid, BRs heredadas, 366 días) están horneadas en el diseño
sin renegociación.

---

## 14. Criterios de aceptación

El orquestador puede correr estos chequeos binarios después de que
`sdd-apply` completa:

1. `pnpm test src/modules/reports/` sale 0 (dominio + aplicación +
   infraestructura).
2. `pnpm test src/composition/build-app-deps.test.ts` sale 0 con
   la aserción de conteo de suscriptores (REQ-RPT-7, BR-RPT-5).
3. `pnpm typecheck` sale 0 (TypeScript strict mode, sin `any`).
4. `pnpm test:coverage` reporta ≥ 80% en `src/modules/reports/`
   (capas dominio + aplicación + infraestructura).
5. `curl -H "Cookie: authjs.session-token=..." 'http://localhost:3000/api/reports/monthly?month=2026-06'`
   retorna `200` con la forma JSON esperada (o `401` si no hay
   sesión).
6. `app/dashboard/page.tsx` renderiza los tres cards vacíos
   cuando no hay transacciones (test de snapshot) y los tres cards
   poblados cuando hay transacciones (test de snapshot).
7. Sin caracteres CJK en `Documents-es/` (según `AGENTS.md` raíz
   §13.3 chequeo de mirror); sin atribución de IA en los commits
   (según `AGENTS.md` raíz §4.5 y regla de autor en
   `openspec/AGENTS.md`); sin `--no-verify` en ningún commit
   (según `AGENTS.md` raíz §5.3 gate de pre-commit).

---

## 15. Referencias cruzadas

- **Propuesta**: `openspec/changes/reports/proposal.md` — BR-RPT-1
  a BR-RPT-5; BRs heredadas (BR-ACC-12, BR-TX-4, BR-TX-7, BR-TX-9);
  decisión de lectura perezosa; rationale del suscriptor no-op.
- **Spec (delta)**: `openspec/changes/reports/specs/reports/spec.md`
  — REQ-RPT-1 a REQ-RPT-7; escenarios; BRs heredadas.
- **Spec (canónica, post-archive)**:
  `openspec/specs/reports/spec.md` — promovida por `sdd-archive`.
- **Diseño de transactions (template)**:
  `openspec/changes/archive/2026-06-24-transactions/design.md` —
  template estructural; layout de PR; convenciones de barrel.
- **Spec de transactions (precedente cuid)**:
  `openspec/specs/transactions/spec.md` — REQ-TX-1 (cuid id),
  BR-TX-4 (scopeo por userId), BR-TX-7 (semántica de hard-delete).
- **Puertos del núcleo**:
  `src/shared/domain-kernel/ports/account-repository.port.ts` —
  patrón de puerto estructural espejado por el nuevo
  `transaction-repository-port.ts`.
- **Dispatcher de eventos**:
  `src/shared/events/event-dispatcher.ts` — forma del payload
  `TransactionRecorded`; API de subscribe / dispatch.
- **Composition root**: `src/composition/build-app-deps.ts` —
  patrón de factory; `dispatcher` es el singleton process-wide;
  `systemClock` es el reloj canónico.
- **Costura de composition**: `src/composition/create-hono-app.ts`
  — patrón `mountXxxRoutes`; sitio de registro de `protectedApp`.
- **Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js
  v5 + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4.
- **Preflight**: interactive · `both` · `force-chained` ·
  presupuesto de revisión 400 líneas.
- **TDD estricto**: habilitado según `openspec/config.yaml:27-30`;
  runner `pnpm test`; ciclo RED → GREEN → TRIANGULATE → REFACTOR.
- **Autor / atribución**: `Sebastián Illa` según
  `openspec/AGENTS.md` §"Author attribution (docs metadata)".
