# Propuesta — `reports`

**Estado**: borrador · **Autor**: Sebastián Illa
**Creado**: 2026-06-26 · **Slice objetivo**: MVP-3 (superficie de agregación)
**Upstream**: `openspec/AGENTS.md` (ciclo de vida del proyecto) · `openspec/config.yaml` (slot de capability `reports` reservado; TDD estricto; auto-forecast, 400 líneas)
**Upstream**: preflight SDD global (interactive, both, auto-forecast, 400 líneas; review budget 400)
**Upstream**: contrato del proyecto (`AGENTS.md` raíz §2, §4.7, §5.4, §13; `openspec/AGENTS.md` autor/dependencias)

> Primera escritura de la propuesta de `reports`. El cambio introduce
> la **superficie de agregación**: consumidor read-only de filas de
> `Transaction` que devuelve resúmenes mensuales, breakdowns por
> categoría y flujo por cuenta a una sola página `app/dashboard`.
> **v1 envía cómputo on-read perezoso** — cada agregación corre en
> memoria al momento de la consulta. El seam del evento
> `TransactionRecorded` se conecta en composition time con un handler
> no-op para que la migración futura a materialización dirigida por
> eventos no rompa el contrato (ver
> [Estrategia de snapshot](#estrategia-de-snapshot)). El módulo es
> `src/modules/reports/`, siguiendo la forma de
> `src/modules/transactions/` (domain / application /
> infrastructure; ports & adapters; barrel público mínimo).

## Por qué

`auth-foundation`, `accounts-ledger`, `fx-cache` y `transactions`
enviaron CRUD completo con smoke UIs pero **sin superficie de
agregación**. El hueco de producto de finanzas personales es
concreto: el usuario puede registrar gastos, pero no puede ver qué
gastó el mes pasado, cuáles fueron sus categorías top, ni cómo
evolucionó el balance de una cuenta en el tiempo.

Tres señales a nivel de seam confirman que el cambio está listo para
enviarse ahora:

1. **El seam de eventos está pidiendo un consumidor.** El miembro
   de la unión `TransactionRecorded` se agregó en `transactions`
   (REQ-TX-13, BR-TX-11) con el contrato explícito de que _"futuros
   consumidores `reports` y `snapshots` pueden suscribirse sin un
   cambio de interfaz"_
   (`src/shared/events/event-dispatcher.ts:21-39`). La pertenencia
   a la unión es el contrato — un módulo `reports` se envía sin
   tocar el archivo del event-dispatcher en absoluto.
2. **El seam de lectura es estable.** El
   `TransactionRepositoryPort.list(userId, { cursor, limit,
accountId? })` (REQ-TX-8) es el único input que `reports`
   necesita. La paginación + filtrado por cuenta ya están
   implementados; la forma `TransactionDTO` (`convertedAmountMinor`,
   `convertedCurrency`, `fxAsOfSnapshot`, `casaSnapshot`) es la
   fuente determinística de totales — BR-ACC-12 heredada.
3. **La superficie de producto es el placeholder vacío.**
   `app/page.tsx` todavía renderiza _"Auth foundation ready. The
   application surface ships in Slice B."_ No existe la ruta
   `/dashboard`. El usuario tiene una herramienta de registro sin
   herramienta de consumo.

Las consecuencias downstream (diferidas, mencionadas acá para
trazabilidad): `snapshots` (patrimonio en el tiempo) reusará el
mismo patrón de agregado perezoso con una forma distinta;
`transactions-ui` (UI de producción) reusará los componentes
presentacionales del dashboard con el slice de formularios encima.

## Qué

El cambio se envía en **cuatro slices encadenados**, cada uno un PR
auto-contenido que apunta a `develop` y que gatea con la merge del
slice previo:

### Slice 1 — `reports-domain` (PR #1)

- **Esqueleto del nuevo módulo** en `src/modules/reports/`,
  espejando `src/modules/transactions/`:
  - `domain/entities/monthly-summary.ts` — agregado:
    `{ userId, year, month, totalsByCurrency: { currency,
inflowMinor, outflowMinor, netMinor, txCount }[], generatedAt }`.
    Factory puro + esquema Zod de input + invariantes (sin
    magnitudes negativas; `currency` es uno del enum
    `AccountCurrency`).
  - `domain/entities/category-breakdown.ts` — agregado:
    `{ userId, year, month, buckets: { category: string,
amountMinor: number, currency: AccountCurrency, txCount }[],
generatedAt }`. La normalización de categoría es trabajo de la
    factory: lowercase + trim; null/empty → `"uncategorized"`.
  - `domain/entities/account-flow.ts` — agregado:
    `{ userId, accountId, fromDate, toDate, points: { date,
inflowMinor, outflowMinor, netMinor, currency:
AccountCurrency }[], generatedAt }`. Granularidad diaria.
  - `domain/services/` — funciones puras de agregación:
    `computeMonthlySummary`, `computeCategoryBreakdown`,
    `computeAccountFlow`. Cada una toma `(rows: Transaction[],
filters: {...})` y devuelve el agregado. Zero I/O; el
    servicio es una función, no una clase.
  - `domain/interfaces/reports.repository.port.ts` — port que
    declara los métodos de lectura (`listForMonthly`,
    `listForBreakdown`, `listForFlow`); cada uno toma `userId`
    como primer argumento (aislamiento cross-user, BR-TX-4
    heredada).
  - `domain/interfaces/report-subscriber.port.ts` — port para el
    futuro materializador dirigido por eventos (no-op en v1; el
    seam se declara para que el spec pueda lockear el contrato).
  - `domain/index.ts` — barrel público mínimo: entities, port
    interfaces, funciones de servicio. Sin exports de
    infrastructure (precedente de `accounts/index.ts:27-64`).
- **Tests**:
  - `monthly-summary.test.ts` — invariantes, paths de error de la
    factory, rollup multi-moneda, input vacío.
  - `category-breakdown.test.ts` — normalización, ordenamiento,
    input vacío, bucketing de categoría null.
  - `account-flow.test.ts` — bucketing diario cruzando límites de
    mes, caso single-day, input vacío, mix de monedas.
  - `reports.repository.port.test.ts` —assertion de contrato en
    compile-time (espeja `transaction.repository.port.test.ts`).
- **Sin modelo Prisma nuevo.** v1 lee filas `Transaction` a través
  del `TransactionRepositoryPort` existente; sin cambio de schema.
- **Sin códigos de error nuevos.** Las fallas de dominio
  (`InvalidMonthError`, `InvalidDateRangeError`) heredan de una
  base local `ReportsDomainError` y se mapean a `VALIDATION_ERROR`
  en el wire (espeja el mapeo del action-layer de transactions).

### Slice 2 — `reports-application` (PR #2)

- **Application layer** en `src/modules/reports/application/`:
  - `actions/get-monthly-summary.action.ts`,
    `actions/get-category-breakdown.action.ts`,
    `actions/get-account-flow.action.ts` — tres acciones de
    lectura, cada una con validación Zod de query-params
    (`?year=YYYY&month=MM` o `?fromDate=...&toDate=...`).
  - `actions/_shared.ts` — espejo local del patrón
    `transactions/application/actions/_shared.ts` (`ActionResult<T>`,
    `zodErrorToActionError`, `domainErrorToActionError`, bag
    `ReportsActionDeps`). Por la regla de módulos aislados (root
    `AGENTS.md` §10.5), el archivo nuevo tiene su propia copia de
    `_shared.ts` — sin import cross-module.
  - `dto/` — DTOs que matchean los agregados de dominio con
    timestamps ISO-8601.
  - `validation/` — tres esquemas Zod:
    `monthly-summary-query.schema.ts` (`{ year: 2000-2100, month:
1-12 }`), `category-breakdown-query.schema.ts` (misma forma),
    `account-flow-query.schema.ts` (`{ accountId: cuid,
fromDate: ISO date, toDate: ISO date, fromDate <= toDate }`).
  - `fixtures/reports.repository.inmemory.ts` — implementación
    InMemory del port respaldada por una fixture de
    `TransactionRepositoryPort` inyectada (**la composición de la
    fixture in-memory de reports reusa el helper `seed()` de la
    fixture InMemory de transactions** — ver el patrón in-memory
    del proyecto en
    `src/modules/transactions/application/fixtures/`).
- **Tests**:
  - `get-monthly-summary.action.test.ts` — estado vacío, un solo
    mes, multi-moneda, aislamiento cross-user (las filas del
    usuario A nunca sangran al agregado del usuario B).
  - `get-category-breakdown.action.test.ts` — normalización
    (`"Food"` y `"food"` colapsan), caso multi-moneda.
  - `get-account-flow.action.test.ts` — bucketing diario,
    validación de rango de fechas, aislamiento cross-user.

### Slice 3 — `reports-routes` (PR #3)

- **Rutas Hono** montadas en `protectedApp`:
  | Método | Path | Comportamiento |
  |---|---|---|
  | `GET` | `/api/reports/monthly` | `?year&month` → `MonthlySummaryDTO`. 200 + `{ data }`; 400 `VALIDATION_ERROR` en query inválido. |
  | `GET` | `/api/reports/breakdown` | `?year&month` → `CategoryBreakdownDTO`. Mismo envelope de error. |
  | `GET` | `/api/reports/accounts/:id/flow` | `?fromDate&toDate` → `AccountFlowDTO`. 404 `NOT_FOUND` en cuenta cross-user; 400 si `fromDate > toDate`. |
- **Archivo de rutas** `src/modules/reports/application/routes.ts`
  exportando `mountReportsRoutes(protectedApp, deps)`. El
  composition root en `src/composition/create-hono-app.ts` agrega
  un llamado `mountReportsRoutes(protectedApp, { reportsDeps:
deps.reportsDeps })` después del mount de transactions, antes
  de que el sub-app se monte en `/`.
- **Wiring de DI** en `src/composition/build-app-deps.ts`:
  - Nueva interfaz `ReportsActionDeps` (paralela a
    `TransactionActionDeps`).
  - Nueva factory `buildReportsDeps(...)` que espeja
    `buildTransactionDeps` (consume la MISMA instancia de
    `fxRateProvider` para el contexto FX del futuro path dirigido
    por eventos; cero llamadas FX en v1).
  - `buildAppDeps()` devuelve `reportsDeps` en el bag.
- **Wiring del seam dirigido por eventos (no-op v1)**:
  `buildReportsDeps` llama a `dispatcher.subscribe('TransactionRecorded',
noopHandler)`. El `noopHandler` es un stub tipado que loguea a
  `debug` y retorna. **El llamado existe para validar el seam en
  boot** — si la firma del dispatcher cambia, el composition root
  falla al compilar. El handler se vuelve un materializador real
  en un cambio futuro.
- **Tests**:
  - `src/modules/reports/application/routes.test.ts` — tres rutas
    contra deps in-memory; 200 + shape del payload, 400 en query
    inválido, 401 sin sesión, 404 en cuenta cross-user.
  - `src/composition/build-app-deps.test.ts` gana una assertion
    paralela: `reportsDeps` está presente y el dispatcher tiene
    exactamente un suscriptor para `TransactionRecorded`.

### Slice 4 — `dashboard-ui` (PR #4)

- **Página nueva** `app/dashboard/page.tsx` — Server Component
  que resuelve la sesión vía `auth()`, llama los tres endpoints
  de reports en paralelo, y renderiza los tres componentes
  presentacionales de abajo. Comentario de header
  `// smoke-minimal, not production` (misma convención que las
  páginas de transactions). El estado vacío renderiza tres cards
  vacías + un CTA a `/transactions/new`.
- **Componentes presentacionales** en
  `app/_components/dashboard-{monthly-summary,category-breakdown,
account-flow}.tsx`. Cada uno es un Server Component puro (sin
  client hooks, sin directiva `'use client'`). Tokens de Tailwind
  v4 vía la tabla de clases existente del proyecto; sin tokens
  nuevos de color ni espaciado.
- **Definiciones de tipo** en `app/_lib/report-types.ts`
  espejando `app/_lib/transaction-types.ts`. El helper `formatMinor`
  en `app/_lib/format-minor.ts` se reusa; sin formateador nuevo.
- **Sin layout nuevo, sin CSS global nuevo.** El dashboard reusa
  `app/layout.tsx` y el `globals.css` existente.
- **Tests**: cobertura Vitest mínima de los componentes
  presentacionales (renderizar estado vacío, renderizar con data
  seeded); el path de integración es el smoke check manual vía
  `pnpm dev`.

## Fuera de scope (este cambio)

- **Exports** (CSV, PDF, descarga JSON). Un endpoint
  `GET /api/reports/export` es candidato a v1.1. La página de
  dashboard es display read-only.
- **Reglas de presupuesto / límites de gasto.** Una capability
  futura `budgets` consume el agregado `MonthlySummary` y agrega
  tracking de límites; no en v1.
- **Forecasting.** Líneas de tendencia, predicciones, detección
  de anomalías. Estrictamente fuera de v1 — sin ML, sin análisis
  estadístico.
- **Streaming real-time.** WebSockets, SSE, live-reload sobre
  `TransactionRecorded`. v1 es request/response; la suscripción
  al evento es un seam no-op.
- **Conversión de moneda en tiempo de lectura.** Todos los
  agregados usan las columnas de snapshot persistidas
  (`convertedAmountMinor`, `convertedCurrency`). Sin llamada FX
  viva en el path de lectura (BR-ACC-12 heredada).
- **Bucketing por timezone del usuario.** v1 agrega por mes
  calendario UTC de `transactionDate`. Un campo `User.timezone`
  es una migración aditiva futura (el spec codifica la
  simplificación de v1 y la flaggea para feedback del usuario).
- **Multi-user / dashboards compartidos.** v1 es single-user por
  `BR-TX-4` heredada.
- **App móvil / push notifications.** Fuera de v1.
- **UI de calidad de producción.** El dashboard es smoke-minimal;
  un cambio `reports-ui` (o `transactions-ui`) agrega primitivas
  de design system, animaciones, auditorías de accesibilidad.
- **Librería de charts.** El dashboard renderiza `<table>`s y
  anchos de barra simples con `<div>` (CSS `width: %`). Sin
  dependencia de recharts / chartjs / d3 en v1. Un cambio futuro
  introduce la librería de charts una vez que la dirección de UX
  esté lockeada.

## Non-goals

- **No es una superficie de escritura.** `reports` nunca persiste;
  solo lee. El único side effect es la suscripción al dispatcher
  (un handler no-op en v1).
- **No es un nuevo FX provider.** `reports` reusa el
  `FxRateProvider` existente para el contexto FX del futuro
  materializador (v1 envía cero llamadas FX en el path de
  lectura).
- **No es un nuevo modelo de auth.** Cada endpoint scopea a
  `userId` de la sesión; sin row-level security.
- **No es un nuevo framework HTTP.** El catch-all de Hono en
  `app/api/[...path]/route.ts:7-25` se extiende, no se reemplaza.
- **No es una nueva base de datos.** Sin modelo Prisma nuevo; las
  lecturas van por el `TransactionRepositoryPort` existente.
- **No es un nuevo framework de migración.** Sin entrada en
  `prisma/migrations` en v1.
- **No es una re-arquitectura de `transactions`.** El port de
  reports lee el `TransactionRepositoryPort` existente; sin
  cambios en `src/modules/transactions/`.

## Usuarios y situaciones

| Usuario                           | Situación                                                                                                                                       | Touchpoint                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Usuario autenticado               | Abre `/dashboard` para ver los totales de este mes. Ve la `MonthlySummaryCard` con inflow/outbreak/net por moneda.                              | `app/dashboard/page.tsx` + `GET /api/reports/monthly`                    |
| Usuario autenticado               | Scrollea hasta el breakdown para encontrar su categoría top de gasto. Ve la `CategoryBreakdownTable` ordenada por monto DESC.                   | `GET /api/reports/breakdown`                                             |
| Usuario autenticado               | Elige una cuenta bancaria en el dashboard para ver el flujo diario. Navega a `/accounts/:id` → ve el `AccountFlowChart` de los últimos 30 días. | `GET /api/reports/accounts/:id/flow?fromDate&toDate`                     |
| Usuario nuevo (sin transacciones) | Abre `/dashboard`. Ve tres cards vacías + un CTA "Registrar tu primera transacción" que linkea a `/transactions/new`.                           | Rama de estado vacío en `app/dashboard/page.tsx`                         |
| Futuro autor de `snapshots`       | Se suscribe al agregado `MonthlySummary` para patrimonio-en-el-tiempo.                                                                          | `src/modules/reports/domain/entities/monthly-summary.ts` (input estable) |

## Reglas de negocio

El cambio carga las BRs existentes de `accounts`, `fx` y
`transactions` verbatim y agrega una nueva familia de BRs
(`BR-RPT-N`) para los agregados y el path de lectura. La fase de
spec escribe los Scenarios completos.

1. **BR-ACC-12 (heredada).** El storage nunca se convierte. Los
   agregados de reports leen las columnas de snapshot
   (`convertedAmountMinor`, `convertedCurrency`) y nunca llaman al
   FX provider en el path de lectura.
2. **BR-TX-4 (heredada).** Cada referencia cross-module scopea a
   `userId`. El `ReportsRepositoryPort` espeja el invariante del
   `TransactionRepositoryPort`: cada método toma `userId` primero;
   sin API `findById(id)`.
3. **BR-TX-7 (heredada).** El hard-delete en `Transaction` se
   refleja en reports — una transacción borrada simplemente no
   aparece en el próximo agregado. Sin tombstone; sin job de
   recómputo.
4. **BR-TX-9 (heredada, adaptada).** La normalización de
   categoría del breakdown es trabajo de la factory: lowercase +
   trim. Las categorías null/empty colapsan a `"uncategorized"`.
   Los strings libres siguen siendo libres al escribir; el
   breakdown es el único lugar donde la normalización ocurre.
5. **BR-RPT-1 (NEW).** El endpoint de resumen mensual devuelve una
   fila por `convertedCurrency` en `totalsByCurrency`. Un usuario
   con cuentas ARS + USD recibe dos filas en la respuesta; la UI
   muestra ARS como primary, USD como secondary (sin
   auto-conversión en tiempo de lectura).
6. **BR-RPT-2 (NEW).** El endpoint de breakdown por categoría
   acepta `?year&month` y devuelve como máximo 100 buckets
   ordenados por `amountMinor` DESC. Los buckets con
   `txCount === 0` se excluyen.
7. **BR-RPT-3 (NEW).** El endpoint de flujo de cuenta acepta
   `?accountId&fromDate&toDate` con `fromDate <= toDate` y
   `toDate - fromDate <= 366 días`. Un rango más amplio se rechaza
   con `400 VALIDATION_ERROR`. `accountId` cross-user devuelve
   `404 NOT_FOUND` (sin fuga de información).
8. **BR-RPT-4 (NEW).** El dashboard renderiza solo la superficie
   para la que el usuario tiene datos. Un usuario con una
   transacción en ARS recibe un summary solo-ARS; la sección USD
   renderiza un estado vacío "No hay transacciones en USD este
   mes" (sin crash, sin layout roto).
9. **BR-RPT-5 (NEW).** El módulo `reports` envía un handler no-op
   suscrito a `TransactionRecorded` en composition time. La
   suscripción es el seam de migración futuro; v1 no materializa
   nada.

## Áreas afectadas

| Área                                                                                        | Impacto          | Descripción                                                                                                                                                |
| ------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/reports/`                                                                      | Nuevo            | Nuevo módulo espejando la forma de `src/modules/transactions/`. Domain / application / infrastructure; ports & adapters; barrel público mínimo.            |
| `src/composition/build-app-deps.ts`                                                         | Modificado       | Agrega interfaz `ReportsActionDeps` + factory `buildReportsDeps()` + campo `reportsDeps` en `HonoAppDeps`. Suscribe `noopHandler` a `TransactionRecorded`. |
| `src/composition/create-hono-app.ts`                                                        | Modificado       | Monta `mountReportsRoutes(protectedApp, { reportsDeps: deps.reportsDeps })` después del mount de transactions.                                             |
| `src/shared/events/event-dispatcher.ts`                                                     | Ninguno          | El miembro de la unión `TransactionRecorded` ya existe (REQ-TX-13). Sin cambio de archivo.                                                                 |
| `prisma/schema.prisma`                                                                      | Ninguno          | Sin modelo nuevo. Las lecturas van por `TransactionRepositoryPort`.                                                                                        |
| `app/dashboard/page.tsx`                                                                    | Nuevo            | Shell de Server Component; llama los tres endpoints de reports en paralelo.                                                                                |
| `app/_components/dashboard-*.tsx`                                                           | Nuevo            | Tres Server Components presentacionales (render puro).                                                                                                     |
| `app/_lib/report-types.ts`                                                                  | Nuevo            | Espejos de DTO para los tres endpoints.                                                                                                                    |
| `openspec/specs/reports/spec.md`                                                            | Nuevo (canónico) | Creado por `sdd-archive` desde el delta spec. Ya reservado en `openspec/config.yaml:14`.                                                                   |
| `openspec/changes/reports/{specs,design,tasks,apply-progress,verify-report,sync-report}.md` | Nuevo (por fase) | Cada fase SDD escribe su artefacto en la carpeta del cambio.                                                                                               |
| `Documents-es/openspec/changes/reports/proposal.md`                                         | Nuevo            | Espejo en español de este archivo. Mismo commit por root `AGENTS.md` §13.3.                                                                                |

## Acceptance (evidencia que verá el reviewer)

1. `pnpm test` corre la nueva suite de `reports` y sale 0 con
   **≥ 80% de cobertura en `src/modules/reports/**`** (capas
domain + application; espeja la barra de `transactions`).
2. `pnpm dev` → sign in → visitar `/dashboard` con 3
   transacciones en ARS + 2 en USD a través de 2 cuentas. La card
   de summary muestra dos filas (ARS primary, USD secondary). La
   tabla de breakdown muestra las top 3 categorías por monto. La
   card de flow de cuenta está vacía (no se seleccionó ningún
   `?accountId` aún — el dashboard v1 no deep-linkea a una cuenta
   específica).
3. Un usuario con cero transacciones visita `/dashboard`. La
   página renderiza tres cards vacías + un CTA "Registrar tu
   primera transacción". Sin crash. Sin footer roto.
4. `GET /api/reports/monthly?year=2026&month=13` devuelve
   `400 VALIDATION_ERROR`.
5. `GET /api/reports/monthly?year=2026&month=06` para el usuario
   A devuelve solo las transacciones del usuario A. Las filas del
   usuario B no aparecen (aislamiento cross-user, BR-TX-4
   heredada).
6. `GET /api/reports/accounts/<cuenta-del-usuario-B>/flow?fromDate=...&toDate=...`
   para el usuario A devuelve `404 NOT_FOUND` (sin fuga de
   información).
7. `GET /api/reports/accounts/<A>/flow?fromDate=2026-06-01&toDate=2027-01-01`
   (> 366 días) devuelve `400 VALIDATION_ERROR`.
8. El composition root suscribe un handler no-op a
   `TransactionRecorded`. `dispatcher.dispatch({ type:
'TransactionRecorded', payload: ... })` devuelve count = 1 (el
   handler no-op corrió). La fila de transacción queda sin
   cambios.
9. `openspec/specs/reports/spec.md` existe con al menos 5
   Requirements y un Scenario cada uno después de que `sdd-archive`
   corre.
10. El espejo `./Documents-es/openspec/changes/reports/proposal.md`
    existe con estructura idéntica. Sin debris de caracteres
    chinos por el check de espejo de root `AGENTS.md` §13.3.
11. Sin drift de `pnpm-lock.yaml` después de stagear `package.json`
    (check de Husky pre-commit por root `AGENTS.md` §5.3). Si v1
    se envía sin deps nuevas, el lockfile queda sin cambios.
12. **Sin `new Date()` en código de dominio.** Cada factory de
    agregado usa `Clock.now()` desde
    `src/shared/clock/clock.port.ts:22-24` para el timestamp
    `generatedAt`.

## Riesgos

| Riesgo                                                                                      | Likelihood | Mitigación                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El cómputo on-read perezoso se vuelve lento a medida que crecen las filas de `Transaction`. | Medium     | Los dos índices (`@@index([userId, transactionDate])` y `@@index([accountId, transactionDate])`) hacen que la lectura sea O(rows-in-window). La ventana es a lo sumo un mes para summary/breakdown y 366 días para flow. A la escala de filas de v1 (centenas bajas por usuario por mes), el agregado en memoria es sub-100ms. El path de migración dirigido por eventos está documentado para el futuro. |
| Regresión de aislamiento cross-user en el port de reports.                                  | Low        | El test de contrato del port (`reports.repository.port.test.ts`) assertea que `userId` es el primer argumento de cada método. Los tests de actions seedean filas del usuario A y B y verifican que las queries del usuario A nunca vean filas del usuario B.                                                                                                                                              |
| El bucketing UTC vs timezone-del-usuario sorprende a un usuario basado en Argentina.        | Medium     | El spec codifica v1 como UTC. La UI muestra el label del mes como `"Junio 2026 (UTC)"` para que el usuario pueda corregir manualmente. Un campo `User.timezone` es una migración aditiva futura gateada en feedback del usuario.                                                                                                                                                                          |
| El handler de evento no-op enmascara silenciosamente un bug de wiring.                      | Low        | El test del composition root assertea exactamente un suscriptor para `TransactionRecorded` después de que `buildAppDeps` corre. Un subscribe faltante falla el test.                                                                                                                                                                                                                                      |
| La normalización case-fold del breakdown pierde información que el usuario quiere.          | Low        | La normalización es responsabilidad de la factory; el spec documenta la regla. El string crudo `category` se preserva en la fila de `Transaction` — el breakdown es una vista derivada, nunca la fuente de verdad.                                                                                                                                                                                        |
| El espejo en español driftea del original inglés.                                           | Medium     | Aplicar atomicidad de §13.3; el `reviewer` chequea ambos archivos en el mismo commit.                                                                                                                                                                                                                                                                                                                     |
| El step RED del TDD estricto se saltea, fallando al reviewer.                               | Medium     | `sdd-tasks` es dueña de la estructura de tareas; `sdd-apply` enforce RED → GREEN → REFACTOR por tarea.                                                                                                                                                                                                                                                                                                    |

## Estrategia de snapshot

**Decisión: cómputo on-read perezoso en v1; materialización dirigida
por eventos es el path de migración futuro, no rompedor.**

| Path                      | v1                                                                       | Migración futura                                                                            |
| ------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **Path de lectura**       | Agrega en cada request desde la página `TransactionRepositoryPort.list`. | Lee de una tabla de materialización `MonthlySummary` / `CategoryBreakdown` / `AccountFlow`. |
| **Path de escritura**     | Ninguno. `reports` nunca escribe.                                        | El materializador se suscribe a `TransactionRecorded` y actualiza las filas del rollup.     |
| **Consistencia**          | Siempre consistente (lee la fuente de verdad).                           | Eventualmente consistente; el materializador tiene que catch-up después de un restart.      |
| **Suscripción al evento** | Handler no-op en composition time (valida el seam).                      | El no-op se vuelve el materializador.                                                       |

Por qué perezoso para v1:

- **No hay story de consistencia que diseñar.** El agregado lee la
  fuente de verdad; no hay materializador que mantener en sync.
- **El path más barato.** Sin modelo Prisma nuevo, sin migración,
  sin background job. El budget de slices es 760 – 1200 líneas a
  lo largo de cuatro PRs; la alternativa agrega ~400 líneas.
- **La migración no es rompedora.** El seam se wirea en
  composition time. La migración futura agrega el materializador;
  el path de lectura cambia de `TransactionRepositoryPort.list` a
  la tabla de materialización; sin cambio de interfaz para los
  callers.
- **El rendimiento es aceptable a escala v1.** Los índices hacen
  que la lectura sea O(rows-in-window); a la escala de filas de
  v1 el agregado en memoria es sub-100ms.

El test del composition root (acceptance #8) pinea el seam en boot
time para que la migración futura tenga un único punto de cambio
validado.

## Capabilities

> Esta sección es el CONTRATO entre esta propuesta y `sdd-spec`. La
> próxima fase lee esto para saber exactamente qué archivos de spec
> crear o actualizar.

### Nuevas capabilities

- `reports`: dueña de los tres agregados de lectura
  (`MonthlySummary`, `CategoryBreakdown`, `AccountFlow`), los
  servicios puros de agregación, el `ReportsRepositoryPort`
  (consumiendo el `TransactionRepositoryPort`), las tres acciones
  de query con validación Zod de query-params, las tres rutas
  Hono, la suscripción no-op a `TransactionRecorded`, y la UI del
  dashboard. La capability vive en `src/modules/reports/` y envía
  su propio spec en `openspec/specs/reports/spec.md`.

### Capabilities modificadas

- `transactions`: el spec gana una delta de una línea que nota
  que `TransactionRecorded` tiene al menos un suscriptor en
  composition time (el handler no-op desde `reports`). Sin cambio
  de comportamiento del lado de transactions; la delta es un
  puntero cross-link para el lector del spec.
- `errors`: sin códigos nuevos. Las fallas de reports reusan
  `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`. El enum
  `ErrorCode` y la tabla de mapeo en
  `src/shared/errors/error-codes.ts:12-43,52-66` quedan sin
  cambios.
- `events`: sin nuevos miembros de la unión. `TransactionRecorded`
  ya está en la unión en `src/shared/events/event-dispatcher.ts:6`.
  La suscripción no-op es wiring de runtime, no un cambio a
  nivel de tipos.

## Alternativas consideradas

1. **Snapshots materializados dirigidos por eventos en v1.**
   Rechazado para v1. Agrega un path de escritura (el
   materializador), un story de consistencia (consistencia
   eventual en restart), y una migración Prisma (tablas nuevas
   `MonthlySummary` / `CategoryBreakdown`). El path perezoso es
   el primer corte más barato. La migración futura no es
   rompedora porque el seam se wirea en composition time.
2. **Rollups pre-agregados en una Postgres MATERIALIZED VIEW.**
   Rechazado para v1. Mismo downside que #1 más una dependencia
   pesada a nivel DB. El path perezoso es el primer corte más
   barato.
3. **Sin UI en este cambio; enviar solo la API.** Rechazado. La
   promesa de cara al usuario de `reports` es el dashboard;
   enviar la API sin consumidor deja el mismo hueco de producto.
   El slice del dashboard es acotado (200-320 líneas) y reusa
   las primitivas de UI existentes.
4. **Librería de charts en v1 (recharts / chartjs / d3).**
   Rechazado para v1. Una librería de charts agrega dependencia,
   una decisión SSR-vs-CSR, y una curva de aprendizaje. El
   dashboard v1 renderiza tablas + barras con CSS `width: %`.
   La librería de charts es un cambio futuro una vez que la
   dirección de UX esté lockeada.
5. **Un endpoint compuesto `/dashboard`.** Rechazado. Las tres
   superficies (summary, breakdown, flow) tienen filtros
   distintos y consumidores distintos. Tres endpoints finos +
   tres componentes presentacionales es el fit de screaming
   architecture; un mega-endpoint acopla las superficies.

## Forecast (force-chained, budget de 400 líneas)

El orchestrator pre-cacheó `delivery_strategy: force-chained` y
`review_budget_lines: 400`. Por la guarda §E de carga de review,
cada slice DEBE ser un PR auto-contenido con start, finish,
verificación y rollback claros. Las líneas de forecast son
**líneas cambiadas (additions + deletions)** por slice.

| PR        | Slice                 | LoC low | LoC high | Gate de verificación                                                                                                                          |
| --------- | --------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| #1        | `reports-domain`      | 180     | 280      | `pnpm test src/modules/reports/domain` sale 0; el test de contrato del port assertea aislamiento cross-user.                                  |
| #2        | `reports-application` | 220     | 340      | `pnpm test src/modules/reports/application` sale 0; tests de actions cubren estado vacío, multi-moneda, cross-user.                           |
| #3        | `reports-routes`      | 160     | 260      | `pnpm test src/modules/reports/application/routes.test.ts` sale 0; `build-app-deps.test.ts` assertea la suscripción al dispatcher.            |
| #4        | `dashboard-ui`        | 200     | 320      | Smoke manual con `pnpm dev`: sign in → visitar `/dashboard` → ver tres cards. Snapshots de Vitest para los tres componentes presentacionales. |
| **Total** | —                     | **760** | **1200** | Los cuatro PRs mergeados; `pnpm test` verde; el dashboard renderiza los datos del usuario.                                                    |

- Decisión necesaria antes de apply: **No** (scope lockeado en
  pre-propose).
- PRs encadenados recomendados: **Sí** (force-chained por el cache
  del orchestrator; cada slice está sobre el budget de 400 líneas
  si se entrega como un solo PR).
- Riesgo de budget de 400 líneas: **Low** por slice; **High** si
  se colapsa en un solo PR.

## Preguntas abiertas

Estas cinco preguntas se grillearán en la sesión de pre-spec. Los
defaults de abajo son la forma propuesta para v1; la fase de spec
lockea el wording final.

1. **Timezone para bucketing mensual.** Default: UTC. Lockear la
   simplificación de v1 en el spec; mostrar "Junio 2026 (UTC)" en
   el dashboard.
2. **Normalización de categoría.** Default: lowercase + trim +
   `null/empty → "uncategorized"`. Lockear la regla en el spec.
3. **Mix de monedas en el resumen mensual.** Default: una fila
   por `convertedCurrency` en la respuesta; la UI muestra ARS
   primary, USD secondary. Lockear la forma de la respuesta en el
   spec.
4. **Granularidad del flujo de cuenta.** Default: diaria.
   Lockear el formato de la date-key (`YYYY-MM-DD` UTC) en el
   spec.
5. **Comportamiento de estado vacío.** Default: tres cards
   vacías + CTA a `/transactions/new`. Lockear la UX en el spec.

## Dependencias

- **Inbound**: `transactions` (enviado) provee
  `TransactionRepositoryPort`, `TransactionDTO`, evento
  `TransactionRecorded`, y el patrón de fixture in-memory.
- **Inbound**: `accounts` (enviado) provee `AccountRepositoryPort`
  (el endpoint de flujo cross-checkea que la cuenta pertenece al
  usuario).
- **Inbound**: `fx-cache` (enviado) provee el port
  `FxRateProvider` (consumido por el futuro materializador; cero
  llamadas en v1).
- **Inbound**: `auth-foundation` (enviado) provee el session gate
  (`requireSession`) y el invariante `AuthUser` que usa cada
  ruta.
- **Outbound**: `snapshots` (futuro) consume el agregado
  `MonthlySummary` como input estable.
- **External**: ninguno. Sin servicio externo nuevo en v1.
- **Sin co-PRs**: `reports` no bloquea ningún cambio en curso.

## Próximo paso

`/sdd-spec reports` — escribir el delta spec en
`openspec/changes/reports/specs/reports/spec.md` y levantarlo al
canónico `openspec/specs/reports/spec.md` por el flujo de
`sdd-archive`. La fase de spec lockeará las cinco preguntas
abiertas y escribirá los Requirements + Scenarios para BR-RPT-1 a
BR-RPT-5.
