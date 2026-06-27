# Spec — capability `reports`

**Autor**: Sebastián Illa
**Capability**: `reports`
**Cambio fuente**: `reports`
**Estado**: active · **Creado**: 2026-06-26 · **Última sync**: 2026-06-26 (reports)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (heredado de `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4

> Primera escritura de la spec de la capability `reports`.
> Operationaliza la propuesta de `reports` v1 (borrador
> 2026-06-26). La spec declara **qué debe ser verdadero**
> después de que el cambio aterrice, no cómo implementarlo. Los
> detalles de implementación (rutas de archivos, sintaxis del
> schema, layout de tests) se limitan a lo que requiere el
> contrato cross-module.
>
> Esta es la **delta spec** de la nueva capability `reports`.
> La capability `reports` aún no existe bajo
> `openspec/specs/` al momento de escribir — vive bajo
> `openspec/changes/reports/specs/reports/` hasta que
> `sdd-archive` la promueva a la ubicación canónica
> `openspec/specs/reports/spec.md`. La canónica y la delta se
> mantienen en lockstep; la canónica es la source of truth.

## Purpose

La capability `reports` es la **superficie de agregación** de
`gastos-personales`. Es un consumer de solo lectura de filas
`Transaction` que devuelve tres vistas derivadas al usuario: el
**monthly summary** (inflow, outflow, net, count por moneda), el
**category breakdown** (totales por categoría ordenados por monto
descendente) y el **account flow** (cambio neto diario por cuenta
en un rango de fechas). La capability garantiza que: (a) cada
lectura scopea al `userId` de la sesión y las lecturas
cross-user devuelven `404 NOT_FOUND` (sin fuga de información);
(b) las agregaciones agrupan por `convertedCurrency` (la base
convertida por FX persistida en la fila al momento de escritura) y
nunca llaman al provider de FX en el read path (BR-ACC-12
heredada); (c) la normalización de categorías es responsabilidad
del factory (`lowercase + trim`, vacío/null → `"uncategorized"`);
(d) el read path es **lazy compute-on-read** en v1 con una
suscripción no-op a `TransactionRecorded` cableada en composition
time para que la migración futura a materialización dirigida por
eventos no sea rompedora.

La capability expone una superficie de lectura estable, de capa
de presentación — `{ month, totals, breakdown, flow }` — que la
página `/dashboard` (y cualquier UI futura, incluyendo
`snapshots`) renderiza sin aprender los detalles upstream de
`Transaction`.

## Scope

### In scope

- Nuevo módulo `src/modules/reports/` espejando la forma de
  `src/modules/transactions/` (`domain/entities`,
  `domain/interfaces/reports.repository.port.ts`,
  `domain/services/{compute-monthly-summary,compute-category-breakdown,compute-account-flow}.ts`,
  `application/actions/{get-monthly-summary,get-category-breakdown,get-account-flow}.action.ts`,
  `application/dto/{monthly-summary,category-breakdown,account-flow}.dto.ts`,
  `application/validation/{monthly-summary-query,category-breakdown-query,account-flow-query}.schema.ts`,
  `application/fixtures/reports.repository.inmemory.ts`).
- Tres endpoints Hono bajo `/api/reports` montados en la
  protectedApp catch-all existente (el archivo
  `app/api/[...path]/route.ts` no se modifica):
  `GET /api/reports/monthly`, `GET /api/reports/breakdown`,
  `GET /api/reports/accounts/:id/flow`.
- Nuevo mapeo de errores: las fallas de dominio
  (`InvalidMonthError`, `InvalidDateRangeError`) heredan de una
  base local `ReportsDomainError` y mapean al código existente
  `VALIDATION_ERROR` (sin nuevos códigos de error).
- Cableado de nueva suscripción a evento de dominio (handler
  no-op) en composition time en
  `src/composition/build-app-deps.ts`. El miembro de la unión
  `TransactionRecorded` queda sin cambios (REQ-TX-13 heredada).
- Adiciones de wiring de DI en
  `src/composition/build-app-deps.ts` y
  `src/composition/create-hono-app.ts`: nueva interfaz
  `ReportsActionDeps` + factory `buildReportsDeps()` + campo
  `reportsDeps` en `HonoAppDeps`.
- Una página de Next.js App Router bajo `app/dashboard/page.tsx`
  (shell Server Component que llama a los tres endpoints en
  paralelo). Tres componentes presentacionales bajo
  `app/_components/dashboard-{monthly-summary,category-breakdown,account-flow}.tsx`.
- Tests: tests unitarios para las tres entidades de dominio y los
  tres servicios puros de agregación; tests de actions para
  empty state, multi-currency y aislamiento cross-user; tests de
  routes para los tres endpoints Hono; un test de composition
  root que aserte la suscripción a `TransactionRecorded`.

### Out of scope

- **Exports** (CSV, PDF, JSON download). Un endpoint
  `GET /api/reports/export` es candidato a v1.1.
- **Reglas de presupuesto / límites de gasto.** Una capability
  futura `budgets` consume el agregado `MonthlySummary`; no en
  v1.
- **Forecasting.** Líneas de tendencia, predicciones, detección
  de anomalías. Sin ML, sin análisis estadístico.
- **Streaming en tiempo real.** WebSockets, SSE, live-reload ante
  `TransactionRecorded`. v1 es request/response; la suscripción a
  eventos es un seam no-op.
- **Conversión de moneda en read time.** Todas las agregaciones
  usan las columnas de snapshot persistidas (`convertedAmountMinor`,
  `convertedCurrency`). Sin llamada viva a FX en el read path
  (BR-ACC-12 heredada).
- **Bucketing por zona horaria del usuario.** v1 agrega por el
  mes calendario UTC de `transactionDate`. La UI muestra la
  etiqueta del mes como `"June 2026 (UTC)"`. Un campo
  `User.timezone` es una migración aditiva futura.
- **Multi-user / dashboards compartidos.** v1 es single-user
  según BR-TX-4 heredada.
- **App mobile / push notifications.** Fuera de v1.
- **UI de calidad de producción.** El dashboard es
  smoke-minimal; un cambio `transactions-ui` (o `reports-ui`)
  suma primitives de design-system, animaciones, auditorías de
  accesibilidad.
- **Librería de charts.** El dashboard renderiza `<table>`s y
  anchos de barra simples basados en `<div>` (CSS `width: %`).
  Sin dependencia de recharts / chartjs / d3 en v1.
- **Tablas de agregación materializadas.** v1 es lazy
  compute-on-read. Un cambio futuro introduce modelos Prisma
  `MonthlySummary` / `CategoryBreakdown` / `AccountFlow` y el
  materializer se suscribe a `TransactionRecorded`.

### Capability boundary

- `reports` es dueña de los tres agregados de lectura, los
  servicios puros de agregación, el `ReportsRepositoryPort`, las
  tres acciones de consulta con validación Zod de query params,
  las tres routes Hono, la suscripción no-op a
  `TransactionRecorded` y la UI del dashboard.
- `reports` lee vía `TransactionRepositoryPort` (dueño
  `transactions`) y `AccountRepositoryPort` (dueño `accounts`,
  usado por el endpoint de flow para cross-checkear que la
  cuenta pertenece al usuario).
- `reports` consume `FxRateProvider` (dueño `accounts`) vía el
  contexto de FX del materializer futuro; v1 sale con cero
  llamadas a FX en el read path.
- Las dependencias apuntan de `reports` hacia `transactions` y
  `accounts` (ports de solo lectura) — nunca al revés,
  preservando el invariante de ports & adapters.
- `reports` MUST NOT importar de `fx` directamente; pasa por el
  port `FxRateProvider` declarado en `accounts`.
- `reports` MUST NOT escribir al data model de ningún otro
  módulo. El módulo es estrictamente de lectura; el único side
  effect es la suscripción al dispatcher (un handler no-op en
  v1).
- `reports` MUST tener su propia copia `_shared.ts` bajo
  `src/modules/reports/application/actions/_shared.ts` (según la
  regla modules-isolated de `AGENTS.md` raíz §10.5). Sin import
  cross-module desde `transactions/application/actions/_shared.ts`.

## Entities

La spec es interface-level. Las formas de abajo son parte del
contrato que cruza la frontera `reports` ↔ consumer (UI,
`snapshots`).

### `MonthlySummary`

El rollup por mes y por moneda. Una fila por `convertedCurrency`
presente en las transacciones del usuario para el mes solicitado.

| Field              | Type                       | Constraints                                                                         |
| ------------------ | -------------------------- | ----------------------------------------------------------------------------------- |
| `userId`           | `string` (cuid)            | Owner. Llevado por trazabilidad; la response lo omite (session-scoped).             |
| `year`             | `number`                   | Año calendario UTC. Integer. `2000..2100`.                                          |
| `month`            | `number`                   | Mes calendario UTC. Integer. `1..12`.                                               |
| `totalsByCurrency` | `MonthlyTotalByCurrency[]` | Una entrada por `convertedCurrency`. Array vacío cuando no hay filas en la ventana. |
| `accountCount`     | `number`                   | Conteo de `accountId` distintos entre las transacciones del usuario en el mes. ≥ 0. |
| `generatedAt`      | `DateTime`                 | `Clock.now()` al momento de agregar. ISO-8601.                                      |

`MonthlyTotalByCurrency`:

| Field          | Type              | Constraints                                                                    |
| -------------- | ----------------- | ------------------------------------------------------------------------------ |
| `currency`     | `AccountCurrency` | Uno de `{ ARS, USD, EUR }`.                                                    |
| `inflowMinor`  | `Int`             | Suma de `convertedAmountMinor` para `direction = INCOME` en esta moneda. ≥ 0.  |
| `outflowMinor` | `Int`             | Suma de `convertedAmountMinor` para `direction = EXPENSE` en esta moneda. ≥ 0. |
| `netMinor`     | `Int`             | `inflowMinor - outflowMinor`. Puede ser negativo.                              |
| `txCount`      | `Int`             | Cantidad de transacciones en esta moneda para el mes. ≥ 0.                     |

Invariantes:

- Bucketing UTC: una transacción está en el mes M si los
  componentes UTC de `transactionDate` caen en
  `[year-M-01, year-(M+1)-01)` (BR-RPT-1 codifica Q1).
- Una fila por `convertedCurrency`, nunca por `currency` raw
  (BR-RPT-1).
- `generatedAt = Clock.now()` (sin `new Date()` en código de
  dominio).

### `CategoryBreakdown`

El rollup por mes y por categoría. Una fila por categoría
normalizada por `convertedCurrency` presente en las transacciones
del usuario para el mes.

| Field         | Type               | Constraints                                                        |
| ------------- | ------------------ | ------------------------------------------------------------------ |
| `userId`      | `string` (cuid)    | Owner. Llevado por trazabilidad; la response lo omite.             |
| `year`        | `number`           | Año calendario UTC. `2000..2100`.                                  |
| `month`       | `number`           | Mes calendario UTC. `1..12`.                                       |
| `buckets`     | `CategoryBucket[]` | Ordenado por `amountMinor` DESC, después `categoryNormalized` ASC. |
| `generatedAt` | `DateTime`         | `Clock.now()` al momento de agregar. ISO-8601.                     |

`CategoryBucket`:

| Field                | Type              | Constraints                                                                             |
| -------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| `category`           | `string \| null`  | El string crudo de categoría de la fila `Transaction`. Preservado verbatim.             |
| `categoryNormalized` | `string`          | `lowercase + trim` de `category`; `null`/vacío → `"uncategorized"`.                     |
| `currency`           | `AccountCurrency` | El `convertedCurrency` de las filas en este bucket.                                     |
| `amountMinor`        | `Int`             | Suma de `convertedAmountMinor` en este bucket. Puede ser negativo (neto de refunds).    |
| `txCount`            | `Int`             | Cantidad de transacciones en este bucket. `> 0` (los buckets con count 0 se descartan). |

Invariantes:

- `category` y `categoryNormalized` están ambos presentes en la
  response. El string crudo se preserva; el normalizado se
  deriva (BR-RPT-2 codifica Q2).
- Los buckets con `txCount === 0` se excluyen.
- Sort: `amountMinor` DESC primario; `categoryNormalized` ASC
  secundario (tie-break determinístico).

### `AccountFlow`

El rollup de flujo diario por cuenta en un rango de fechas. Una
fila por día calendario UTC en el que el usuario tiene al menos
una transacción en la cuenta dentro del rango.

| Field         | Type                 | Constraints                                                                |
| ------------- | -------------------- | -------------------------------------------------------------------------- |
| `userId`      | `string` (cuid)      | Owner. Llevado por trazabilidad; la response lo omite.                     |
| `accountId`   | `string` (cuid)      | La cuenta del flow. Debe pertenecer al caller.                             |
| `fromDate`    | `DateTime`           | Límite inferior inclusivo. UTC `YYYY-MM-DD` parseado como `00:00:00Z`.     |
| `toDate`      | `DateTime`           | Límite superior inclusivo. UTC `YYYY-MM-DD` parseado como `23:59:59.999Z`. |
| `points`      | `AccountFlowPoint[]` | Ordenado por `date` ASC.                                                   |
| `generatedAt` | `DateTime`           | `Clock.now()` al momento de agregar. ISO-8601.                             |

`AccountFlowPoint`:

| Field                 | Type              | Constraints                                                                                                                        |
| --------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `date`                | `string`          | Día calendario UTC `YYYY-MM-DD` (clave solo-fecha, sin componente de hora).                                                        |
| `runningBalanceMinor` | `Int`             | Neto acumulado de `convertedAmountMinor` a lo largo del rango hasta e incluyendo `date`. Signo: INCOME positivo, EXPENSE negativo. |
| `netMinor`            | `Int`             | Cambio neto solo para `date` (suma de `convertedAmountMinor` con signo desde `direction`).                                         |
| `txCount`             | `Int`             | Cantidad de transacciones en `date`. `> 0` (días sparse omitidos).                                                                 |
| `currency`            | `AccountCurrency` | El `convertedCurrency` de las filas en este point.                                                                                 |

Invariantes:

- La clave de fecha es `YYYY-MM-DD` en UTC. Sin componente de
  hora (BR-RPT-3 codifica Q4).
- Los días sparse (sin transacciones) se omiten de `points`
  (BR-RPT-3).
- `toDate - fromDate <= 366` días (BR-RPT-3).
- `fromDate <= toDate` (BR-RPT-3).
- La currency de cada point es igual al `convertedCurrency` de
  las filas de la cuenta padre. v1 asume un único
  `convertedCurrency` por cuenta; mezclas cross-currency dentro
  de una cuenta producen múltiples points con diferentes
  `currency`.

## Business rules

Las reglas de abajo son normativas. Cada regla tiene un ID
estable para trazabilidad a lo largo de spec, design,
implementación y tests. Los BRs heredados se importan verbatim
de `openspec/specs/{accounts,transactions}/spec.md`.

### Carried from other capabilities

- **BR-ACC-12 (carried)** — Storage nunca se convierte. Las
  agregaciones de reports leen las columnas de snapshot
  (`convertedAmountMinor`, `convertedCurrency`) y nunca llaman
  al provider de FX en el read path. (Source:
  `openspec/specs/accounts/spec.md`,
  `openspec/specs/fx/spec.md:314-323`.)
- **BR-TX-4 (carried)** — Toda referencia cross-module a una
  transacción scopea por `userId`. El `ReportsRepositoryPort`
  espeja el invariante del `TransactionRepositoryPort`: todo
  método toma `userId` primero; sin API `findById(id)`.
- **BR-TX-7 (carried)** — Hard-delete en `Transaction` se refleja
  en reports — una transacción borrada simplemente no aparece
  en el próximo agregado. Sin tombstone; sin job de recompute.
- **BR-TX-9 (carried, adapted)** — La normalización de
  categorías del breakdown es responsabilidad del factory:
  `lowercase + trim`. Categorías null/vacías colapsan a
  `"uncategorized"`. Los strings libres siguen siendo libres en
  el write; el breakdown es el único lugar donde pasa la
  normalización.

### New (BR-RPT-N family)

- **BR-RPT-1 (NEW)** — El endpoint de monthly summary devuelve
  una fila por `convertedCurrency` en `totalsByCurrency`. Un
  usuario con cuentas ARS y USD en un mes recibe dos filas en
  la response; la UI muestra ARS primaria, USD secundaria (sin
  auto-conversión en read time). El `currency` raw nunca es la
  clave de agrupación.
- **BR-RPT-2 (NEW)** — El endpoint de category breakdown acepta
  `?year&month` y devuelve a lo sumo 100 buckets ordenados por
  `amountMinor` DESC, después `categoryNormalized` ASC. Los
  buckets con `txCount === 0` se excluyen. El string crudo
  `category` se preserva en cada bucket junto al normalizado
  `categoryNormalized`.
- **BR-RPT-3 (NEW)** — El endpoint de account flow acepta
  `?accountId&fromDate&toDate` con `fromDate <= toDate` y
  `toDate - fromDate <= 366` días. Un rango mayor se rechaza con
  `400 VALIDATION_ERROR`. Un `accountId` cross-user devuelve
  `404 NOT_FOUND` (sin fuga de información). Las claves de fecha
  son `YYYY-MM-DD` UTC. Los días sparse (sin transacciones) se
  omiten.
- **BR-RPT-4 (NEW)** — Las consultas cross-user de reports
  devuelven `404 NOT_FOUND`, nunca `403 FORBIDDEN`. El envelope
  del 404 es idéntico al de un recurso inexistente, así un
  atacante no puede distinguir "no es tuyo" de "no existe" vía
  el status code.
- **BR-RPT-5 (NEW)** — El módulo `reports` sale con un handler
  no-op suscrito a `TransactionRecorded` en composition time.
  La suscripción es el seam de migración futura para
  materialización dirigida por eventos; v1 no materializa nada.
  El test de composition root
  (`build-app-deps.test.ts`) MUST asertar exactamente un
  subscriber para `TransactionRecorded` después de que
  `buildAppDeps` corra. Un subscribe faltante MUST hacer fallar
  el test.

## Operations

La capability expone tres operaciones de lectura a través del
`ReportsRepositoryPort` y tres endpoints Hono. Las operaciones
son interface-level: describen qué debe ser verdadero, no los
nombres de clase ni las rutas de archivo que las implementan.

### `getMonthlySummary(userId, year, month)`

Devuelve el `MonthlySummaryDTO` para las transacciones del
caller en el mes calendario UTC
`[year-month-01, year-(month+1)-01)`. Un usuario sin
transacciones en la ventana recibe
`{ totalsByCurrency: [], accountCount: 0 }` y HTTP 200
(BR-RPT-1, REQ-RPT-1).

### `getCategoryBreakdown(userId, year, month)`

Devuelve el `CategoryBreakdownDTO` para las transacciones del
caller en el mes calendario UTC. Los buckets están ordenados
por `amountMinor` DESC, después `categoryNormalized` ASC
(BR-RPT-2, REQ-RPT-2). Las filas cross-currency producen un
bucket por par (categoría, moneda).

### `getAccountFlow(userId, accountId, fromDate, toDate)`

Devuelve el `AccountFlowDTO` para las transacciones del caller
en `accountId` dentro del rango de fechas inclusivo. La action
cross-checkea que la cuenta pertenece al usuario; cross-user
devuelve `404 NOT_FOUND` (BR-RPT-4). Las claves de fecha son
`YYYY-MM-DD` UTC. Los días sparse se omiten (BR-RPT-3,
REQ-RPT-3). `fromDate > toDate` o un rango > 366 días devuelve
`400 VALIDATION_ERROR`.

## Requirements

### Monthly summary

#### Requirement: monthly summary aggregates by convertedCurrency (REQ-RPT-1)

El sistema MUST devolver un `MonthlySummaryDTO` que contiene
una fila `MonthlyTotalByCurrency` por `convertedCurrency`
presente en las transacciones del caller para el mes UTC
solicitado. El sistema MUST agrupar por `convertedCurrency`,
nunca por `currency` raw. El sistema MUST bucketear las
transacciones por el mes calendario UTC de `transactionDate`
(BR-RPT-1, codifica Q1). Un mes vacío MUST devolver
`{ totalsByCurrency: [], accountCount: 0 }` y HTTP 200.
(Traces: BR-RPT-1, BR-ACC-12, BR-TX-4.)

#### Scenario: mixed-currency month returns one row per convertedCurrency

- GIVEN: el caller tiene 3 transacciones ARS
  (`convertedCurrency = ARS`) AND 2 transacciones USD
  (`convertedCurrency = USD`) en `2026-06` (UTC)
- WHEN: `GET /api/reports/monthly?year=2026&month=6` es llamado
- THEN: el status de la response es `200`
- AND: `totalsByCurrency` tiene 2 entradas
- AND: una entrada tiene `currency = "ARS"`, `inflowMinor`,
  `outflowMinor`, `netMinor`, `txCount: 3`
- AND: una entrada tiene `currency = "USD"`, `inflowMinor`,
  `outflowMinor`, `netMinor`, `txCount: 2`

#### Scenario: empty month returns an empty totals array and accountCount zero

- GIVEN: el caller tiene cero transacciones en `2026-06` (UTC)
- WHEN: `GET /api/reports/monthly?year=2026&month=6` es llamado
- THEN: el status de la response es `200`
- AND: `totalsByCurrency` es `[]`
- AND: `accountCount` es `0`
- AND: `generatedAt` es un timestamp ISO-8601 no nulo

#### Scenario: cross-user transactions are excluded

- GIVEN: el usuario A es dueño de 3 transacciones en `2026-06`
  (UTC)
- AND: el usuario B es dueño de 5 transacciones en `2026-06`
  (UTC)
- WHEN: el usuario A llama a
  `GET /api/reports/monthly?year=2026&month=6`
- THEN: el status de la response es `200`
- AND: los totales reflejan solo las 3 transacciones del
  usuario A
- AND: las 5 transacciones del usuario B contribuyen cero a
  `inflowMinor`, `outflowMinor`, `netMinor` o `txCount`

#### Scenario: invalid month returns 400

- GIVEN: cualquier estado
- WHEN: `GET /api/reports/monthly?year=2026&month=13` es
  llamado
- THEN: el status de la response es `400`
- AND: el `error.code` del body es `VALIDATION_ERROR`

### Category breakdown

#### Requirement: category breakdown normalizes and sorts (REQ-RPT-2)

El sistema MUST devolver un `CategoryBreakdownDTO` cuyos
buckets están ordenados por `amountMinor` DESC, después
`categoryNormalized` ASC. Cada bucket MUST llevar tanto
`category` (el string crudo de la fila `Transaction`) como
`categoryNormalized` (`lowercase + trim`; `null`/vacío →
`"uncategorized"`). El sistema MUST NOT mutar el `category`
crudo en la fila (BR-RPT-2, codifica Q2). Los buckets con
`txCount === 0` MUST excluirse. (Traces: BR-RPT-2, BR-TX-9.)

#### Scenario: mixed-case raw categories collapse to one normalized bucket

- GIVEN: el caller tiene 3 transacciones con `category = "Food"`
  AND 2 transacciones con `category = "food"`
- AND: 1 transacción con `category = "  FOOD  "`
- WHEN: `GET /api/reports/breakdown?year=2026&month=6` es
  llamado
- THEN: el status de la response es `200`
- AND: `buckets` tiene exactamente 1 entrada con
  `categoryNormalized = "food"`
- AND: el `txCount` de la entrada es `6`
- AND: el `amountMinor` de la entrada es la suma de los 6
  valores `convertedAmountMinor`
- AND: el `category` de la entrada es uno de los strings crudos
  (el primer valor observado es aceptable; la spec no requiere
  un valor crudo específico)

#### Scenario: null and empty categories collapse to "uncategorized"

- GIVEN: el caller tiene 1 transacción con `category = null`
  AND 1 transacción con `category = ""`
- AND: 1 transacción con `category = "   "` (solo whitespace)
- WHEN: `GET /api/reports/breakdown?year=2026&month=6` es
  llamado
- THEN: el status de la response es `200`
- AND: `buckets` tiene exactamente 1 entrada con
  `categoryNormalized = "uncategorized"`
- AND: el `txCount` de la entrada es `3`

#### Scenario: buckets are sorted by amountMinor DESC then categoryNormalized ASC

- GIVEN: el caller tiene transacciones en 3 categorías en
  `2026-06` con montos normalizados (Food=10000, Rent=30000,
  Other=5000)
- WHEN: `GET /api/reports/breakdown?year=2026&month=6` es
  llamado
- THEN: `buckets[0].categoryNormalized` es `"rent"`
  (amountMinor 30000)
- AND: `buckets[1].categoryNormalized` es `"food"`
  (amountMinor 10000)
- AND: `buckets[2].categoryNormalized` es `"other"`
  (amountMinor 5000)

#### Scenario: cross-user transactions are excluded

- GIVEN: el usuario A tiene 1 transacción en `category = "Food"`
  en `2026-06`
- AND: el usuario B tiene 1 transacción en `category = "Food"`
  en `2026-06`
- WHEN: el usuario A llama a
  `GET /api/reports/breakdown?year=2026&month=6`
- THEN: el status de la response es `200`
- AND: `buckets[0].txCount` es `1` (solo usuario A)
- AND: la transacción del usuario B contribuye cero a
  `amountMinor` o `txCount`

### Account flow

#### Requirement: account flow emits one point per non-empty UTC day (REQ-RPT-3)

El sistema MUST devolver un `AccountFlowDTO` cuyo array
`points` contiene una entrada por día calendario UTC en el
que el caller tiene al menos una transacción en la cuenta,
ordenado por `date` ASC. La clave `date` MUST ser
`YYYY-MM-DD` en UTC. Los días con cero transacciones MUST NOT
aparecer en el array (representación sparse; BR-RPT-3, codifica
Q4). El endpoint MUST rechazar `fromDate > toDate` o
`toDate - fromDate > 366` días con `400 VALIDATION_ERROR`. El
endpoint MUST rechazar un `accountId` no perteneciente al
caller con `404 NOT_FOUND`. (Traces: BR-RPT-3, BR-RPT-4,
BR-TX-4.)

#### Scenario: contiguous activity emits one point per UTC day

- GIVEN: el caller es dueño de la cuenta `A`
- AND: existen transacciones en `A` para `2026-06-01`,
  `2026-06-02`, `2026-06-03` (UTC)
- WHEN:
  `GET /api/reports/accounts/A/flow?fromDate=2026-06-01&toDate=2026-06-30`
  es llamado
- THEN: el status de la response es `200`
- AND: `points` tiene 3 entradas
- AND: `points[0].date` es `"2026-06-01"`
- AND: `points[1].date` es `"2026-06-02"`
- AND: `points[2].date` es `"2026-06-03"`
- AND: `points[2].runningBalanceMinor` es igual a
  `points[0].netMinor + points[1].netMinor + points[2].netMinor`

#### Scenario: sparse days are omitted

- GIVEN: el caller es dueño de la cuenta `A`
- AND: existen transacciones en `A` para `2026-06-01` y
  `2026-06-03` (sin transacción en `2026-06-02`)
- WHEN:
  `GET /api/reports/accounts/A/flow?fromDate=2026-06-01&toDate=2026-06-30`
  es llamado
- THEN: `points` tiene exactamente 2 entradas
- AND: `points[0].date` es `"2026-06-01"`
- AND: `points[1].date` es `"2026-06-03"`
- AND: la response NOT contiene una entrada `"2026-06-02"`

#### Scenario: cross-user accountId returns 404

- GIVEN: el usuario A es dueño de la cuenta `A`
- AND: el usuario B es dueño de la cuenta `B`
- WHEN: el usuario A llama a
  `GET /api/reports/accounts/B/flow?fromDate=2026-06-01&toDate=2026-06-30`
- THEN: el status de la response es `404`
- AND: el `error.code` del body es `NOT_FOUND`
- AND: el body de la response NOT distingue "no es tuyo" de
  "no existe"

#### Scenario: date range wider than 366 days returns 400

- GIVEN: cualquier estado
- WHEN:
  `GET /api/reports/accounts/A/flow?fromDate=2026-01-01&toDate=2027-01-02`
  es llamado (367 días)
- THEN: el status de la response es `400`
- AND: el `error.code` del body es `VALIDATION_ERROR`

### Authorization and access control

#### Requirement: every read scopes to the session user (REQ-RPT-4)

Todo endpoint bajo `/api/reports/*` MUST requerir una sesión
autenticada resuelta vía `auth()` desde
`src/modules/auth/index.ts`. El sistema MUST derivar `userId`
de la sesión y MUST NOT confiar en ningún `userId` presente
en el body de la request. Toda referencia cross-module a una
fila `Transaction` o `FinancialAccount` MUST scopearse por
`userId`. Las lecturas cross-user MUST devolver
`404 NOT_FOUND`, nunca `403 FORBIDDEN`, para que la response
no pueda usarse para inferir si un recurso existe.
(Traces: BR-RPT-4, BR-TX-4, `auth/spec.md` cross-module
invariant.)

#### Scenario: 401 on every endpoint when no session

- GIVEN: ninguna cookie `authjs.session-token`
- WHEN: se llama a cualquiera de los tres endpoints
- THEN: el status de la response es `401`
- AND: no se devuelve data

#### Scenario: cross-user account read returns 404 (not 403)

- GIVEN: el usuario A es dueño de la cuenta `A`; el usuario B
  es dueño de la cuenta `B`
- WHEN: el usuario A llama a
  `GET /api/reports/accounts/B/flow?fromDate=2026-06-01&toDate=2026-06-30`
- THEN: el status de la response es `404` (nunca `403`)
- AND: el `error.code` del body es `NOT_FOUND`
- AND: el body de la response NOT expone la existencia de la
  cuenta, su dueño ni ningún campo de la cuenta

#### Scenario: port contract requires userId as the first argument

- GIVEN: la interfaz `ReportsRepositoryPort` declara
  `listForMonthly(userId, { year, month })` y las firmas
  análogas para breakdown y flow
- WHEN: un compile-time check (p.ej. un port contract test en
  `reports.repository.port.test.ts`) inspecciona cada método
- THEN: el primer parámetro de cada método es `userId`
- AND: ningún método tiene una firma `findById(id)` sin
  `userId`

### Validation

#### Requirement: every query parameter is Zod-validated (REQ-RPT-5)

Todo endpoint MUST validar sus query parameters con un schema
Zod antes de que cualquier código de dominio corra. `year`
MUST ser un integer en `2000..2100`. `month` MUST ser un
integer en `1..12`. `accountId` MUST ser un string UUID v4.
`fromDate` y `toDate` MUST matchear `^\d{4}-\d{2}-\d{2}$`
(clave de fecha ISO, UTC). Cualquier falla de validación MUST
devolver `400` con el envelope de error estándar:
`{ error: { code: "VALIDATION_ERROR", message, details? } }`.
(Traces: BR-RPT-3, invariante project-wide
Zod-at-the-boundary.)

#### Scenario: malformed month returns 400 with field-level details

- GIVEN: cualquier estado
- WHEN: `GET /api/reports/monthly?year=2026&month=june` es
  llamado
- THEN: el status de la response es `400`
- AND: el `error.code` del body es `VALIDATION_ERROR`
- AND: el `error.details` del body incluye una entrada a nivel
  de campo para `month`

#### Scenario: malformed accountId returns 400

- GIVEN: cualquier estado
- WHEN:
  `GET /api/reports/accounts/not-a-uuid/flow?fromDate=2026-06-01&toDate=2026-06-30`
  es llamado
- THEN: el status de la response es `400`
- AND: el `error.code` del body es `VALIDATION_ERROR`

#### Scenario: malformed date keys return 400

- GIVEN: cualquier estado
- WHEN:
  `GET /api/reports/accounts/A/flow?fromDate=06-01-2026&toDate=06-30-2026`
  es llamado (formato de fecha US)
- THEN: el status de la response es `400`
- AND: el `error.code` del body es `VALIDATION_ERROR`
- AND: `error.details` incluye entradas para `fromDate` y
  `toDate`

### Multi-currency semantics

#### Requirement: aggregates group by convertedCurrency, never raw currency (REQ-RPT-6)

El monthly summary, el category breakdown y el account flow
MUST agrupar totales por la columna de snapshot persistida
`convertedCurrency`. El sistema MUST NOT agrupar por
`currency` raw (BR-RPT-1). Un único mes que contiene filas
ARS y USD MUST producir múltiples filas de resultado (una por
`convertedCurrency` en el summary; una por par
`(category, convertedCurrency)` en el breakdown; una por
`convertedCurrency` por día en el flow). El sistema MUST NOT
convertir monedas en read time; el snapshot de FX es la source
of truth. (Traces: BR-RPT-1, BR-ACC-12.)

#### Scenario: mixed-currency month produces multiple totals rows

- GIVEN: el caller tiene 1 expense ARS
  (`convertedAmountMinor = 1000`, `convertedCurrency = ARS`) y
  1 expense USD (`convertedAmountMinor = 500`,
  `convertedCurrency = USD`) en `2026-06`
- WHEN: `GET /api/reports/monthly?year=2026&month=6` es
  llamado
- THEN: `totalsByCurrency` tiene 2 entradas (ARS y USD)
- AND: el `outflowMinor` de la entrada ARS es `1000` y el
  `txCount` es `1`
- AND: el `outflowMinor` de la entrada USD es `500` y el
  `txCount` es `1`
- AND: no ocurre ninguna conversión automática de moneda en
  read time

### Event-driven seam

#### Requirement: composition root subscribes a no-op TransactionRecorded handler (REQ-RPT-7)

El composition root en `src/composition/build-app-deps.ts`
MUST llamar a
`dispatcher.subscribe('TransactionRecorded', noopHandler)`
exactamente una vez durante la ejecución de `buildAppDeps()`.
El handler es un stub tipado que loggea a `debug` y retorna.
La llamada existe para validar el seam en boot: si la firma
del dispatcher cambia, el composition root MUST fallar al
compilar. El test de composition root
(`src/composition/build-app-deps.test.ts`) MUST asertar que
existe exactamente un subscriber para `TransactionRecorded`
después de que `buildAppDeps` retorne. (Traces: BR-RPT-5.)

#### Scenario: composition-root boot registers the no-op handler

- GIVEN: un `EventDispatcher` fresco sin subscribers
- WHEN: se invoca `buildAppDeps()`
- THEN: `dispatcher.subscriberCount('TransactionRecorded')`
  es `1`
- AND: invocar el subscriber con un payload sample
  `TransactionRecorded` retorna sin tirar excepciones
- AND: el efecto del handler (si alguno) se limita a una única
  línea de log a nivel `debug`

## Error semantics

No se introducen nuevos códigos de error. Las fallas de reports
reusan el enum existente en
`src/shared/errors/error-codes.ts`. El mapeo es normativo.

| Code               | HTTP | Trigger                                                                                                                                           | Caller surface                                                             |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `VALIDATION_ERROR` | 400  | Cualquier falla de schema Zod (`month` fuera de rango, `accountId` no UUID v4, `fromDate > toDate`, rango > 366 días, clave de fecha malformada). | Banner de error inline en el dashboard; primer mensaje de `error.details`. |
| `NOT_FOUND`        | 404  | `accountId` cross-user en el endpoint de flow. Envelope idéntico al de un recurso inexistente.                                                    | CTA de empty-state en el dashboard.                                        |
| `UNAUTHORIZED`     | 401  | Sin sesión, cookie faltante, sesión expirada o usuario desconocido (según `auth/spec.md`).                                                        | Redirect 307 para páginas App Router; 401 JSON para Hono.                  |

El sistema MUST NOT incluir stack traces, objetos de error de
Prisma ni bodies de request en ninguna response de error.

## Migration

Sin migración de Prisma. `reports` es un consumer de solo
lectura de las filas `Transaction` y `FinancialAccount` que ya
existen. El schema de Prisma queda sin cambios. No se
requiere backfill de datos. El schema gate que aserta
`sdd-verify` es que `SELECT count(*) FROM "Transaction"` y
`SELECT count(*) FROM "FinancialAccount"` antes y después del
cambio devuelvan los mismos valores.

## Cross-references

- **Proposal**: `openspec/changes/reports/proposal.md` — el
  cambio upstream que creó esta capability. BR-RPT-1 a
  BR-RPT-5 y los BRs heredados están codificados acá; la
  propuesta carga la rationale, las alternativas consideradas
  y el forecast.
- **Transactions spec**: `openspec/specs/transactions/spec.md`
  — REQ-TX-13 declara el evento `TransactionRecorded` cuya
  suscripción no-op está cableada por REQ-RPT-7. El
  `TransactionRepositoryPort` es el único input que las
  agregaciones de reports consumen (REQ-TX-8). Las columnas de
  snapshot del `TransactionDTO` (`convertedAmountMinor`,
  `convertedCurrency`) son la source determinística de los
  totales (BR-ACC-12).
- **Accounts spec**: `openspec/specs/accounts/spec.md` —
  BR-ACC-12 declara el contrato de FX de solo display que
  `reports` carga (sin FX en read time). El endpoint de flow
  cross-checkea la cuenta padre vía `AccountRepositoryPort`.
- **FX spec**: `openspec/specs/fx/spec.md` — REQ-FX-3 declara
  el invariante de casa-resolution-is-the-caller's-responsibility;
  el materializer futuro lo va a reusar. v1 sale con cero
  llamadas a FX.
- **Auth spec**: `openspec/specs/auth/spec.md` — el invariante
  del helper server-side `auth()` (cross-module contracts
  §"auth() server-side helper") y la regla "todo `WHERE
userId = ?` de cualquier otro módulo MUST scopear al caller".
  La capability `reports` sigue este invariante en todo
  endpoint.
- **Transactions delta**:
  `openspec/changes/transactions/specs/transactions/spec.md`
  — la fuente de REQ-TX-13 y del `TransactionRepositoryPort`.
- **Events dispatcher**: `src/shared/events/event-dispatcher.ts`
  — el miembro de la unión `TransactionRecorded` ya existe
  (REQ-TX-13). La suscripción no-op es un wiring de runtime,
  no un cambio a nivel de tipos.
- **Port interface (stable input)**:
  `src/modules/transactions/domain/interfaces/transaction.repository.port.ts`
  — la interfaz que `ReportsRepositoryPort` consume sin
  cambios.
- **External services**: ninguno. El read path nunca llega a
  un servicio externo. El materializer futuro va a reusar el
  `FxRateProvider` existente (DolarAPI), pero v1 sale con cero
  llamadas a FX.

## History

- **2026-06-26 (v1)** — primera escritura. Creada por el cambio
  `reports`. Cierra las 5 open questions (Q1-Q5) bloqueadas en
  la sesión pre-spec: Q1 bucketing UTC (codificada en BR-RPT-1
  / REQ-RPT-1); Q2 normalización `lowercase + trim` con
  `null`/vacío → `"uncategorized"` (codificada en BR-RPT-2 /
  REQ-RPT-2); Q3 una fila por `convertedCurrency` (codificada
  en BR-RPT-1 / REQ-RPT-6); Q4 granularidad diaria con claves
  de fecha `YYYY-MM-DD` UTC y omisión de días sparse
  (codificada en BR-RPT-3 / REQ-RPT-3); Q5 tres cards vacías
  - CTA en el dashboard (codificada en el escenario cross-user
    de REQ-RPT-4 + la rama empty-state de la página del
    dashboard). Scope: agregaciones lazy compute-on-read sobre las
    filas `Transaction`; sin migración de Prisma; sin nuevos
    códigos de error; sin llamadas a FX en el read path;
    composition-root cablea la suscripción no-op a
    `TransactionRecorded`.

## References

- `openspec/changes/reports/proposal.md` — proposal v1
  (2026-06-26) con BR-RPT-1 a BR-RPT-5.
- `openspec/changes/reports/explore.md` — research upstream
  (5 open questions bloqueadas en la sesión pre-spec).
- `openspec/specs/transactions/spec.md` — capability canónica
  `transactions`; REQ-TX-13 (evento), REQ-TX-8 (endpoint de
  list), BR-TX-4 (scoping por userId), BR-TX-7 (hard-delete).
- `openspec/specs/accounts/spec.md` — capability canónica
  `accounts`; BR-ACC-12 (FX de solo display).
- `openspec/specs/fx/spec.md` — capability canónica `fx`;
  REQ-FX-3 (resolución de casa).
- `openspec/specs/auth/spec.md` — capability canónica `auth`;
  invariante del helper `auth()`, scoping por userId.
- `src/shared/events/event-dispatcher.ts` — `TransactionRecorded`
  en la unión `DomainEvent`.
- `src/shared/clock/clock.port.ts` — `Clock.now()` usado por
  cada factory de agregado para `generatedAt`.
- `openspec/config.yaml` — reglas de strict TDD; runner
  `pnpm test`.
- `AGENTS.md` (raíz) — §5.3 política de `pnpm-lock.yaml`;
  §13 política de mirror de docs en español;
  §10.5 regla modules-isolated.
