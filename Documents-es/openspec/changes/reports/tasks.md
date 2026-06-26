# Tareas — `reports`

**Autor**: Sebastián Illa
**Cambio**: `reports`
**Capacidad**: `reports` (nueva — primera escritura del spec + design canónicos); un delta aditivo en `transactions` (`TransactionRecorded` gana al menos un suscriptor); sin cambio de comportamiento en `accounts`, `errors`, `events` (la unión del dispatcher ya tiene `TransactionRecorded`)
**Estado**: tareas pendientes (apply no ha comenzado) · **Creado**: 2026-06-26
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (heredado de `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4
**Artefactos fuente**: `openspec/changes/reports/proposal.md` (v1) · `openspec/changes/reports/specs/reports/spec.md` (REQ-RPT-1..7) · `openspec/changes/reports/design.md` (1947 líneas; 15 secciones) — entrada para esta fase
**Valores de preflight**: interactive · `both` (OpenSpec + Engram) · `force-chained` · presupuesto de revisión 400 líneas
**TDD estricto**: habilitado según `openspec/config.yaml:27-30`; runner `pnpm test`; ciclo RED → GREEN → TRIANGULATE → REFACTOR

> Una tarea = un commit atómico. Cada commit aterriza un foco; el
> PR es el checkpoint de revisión. El worker de apply marca `- [x]`
> a medida que aterrizan los commits; el orquestador verifica que
> CI pasa en verde y que los Requirements del spec están cubiertos
> antes de abrir el siguiente PR.
>
> Disciplina de commits según la convención `work-unit-commits`
> del proyecto (commit por comportamiento, tests-con-código,
> docs-con-cambio, sin `Co-authored-by`, formato conventional
> commit). Las dependencias cross-module (T-RPT-001 puerto del
> kernel, T-RPT-002 contrato del puerto, T-RPT-009 ports) aterrizan
> ANTES de las tareas que las consumen; el servicio agregador
> (T-RPT-007) aterriza DESPUÉS de las tres fábricas de agregados
> (T-RPT-002, T-RPT-004, T-RPT-006) para que el servicio compile
> contra los tipos canónicos.
>
> **Procedencia de resolución de skills.** El orquestador pasó
> cinco rutas canónicas de `SKILL.md`; esta fase cargó las cinco
> (`sdd-tasks`, `work-unit-commits`, `chained-pr`,
> `test-driven-development`, `verification-before-completion`).
> `skill_resolution: paths-injected`.

---

## Pronóstico de Carga de Revisión

| Campo | Valor |
| --- | --- |
| Líneas estimadas a cambiar | ~760–1200 totales en 4 PRs encadenados; LoC por slice `reports-domain` 180–280, `reports-application` 220–340, `reports-routes` 160–260, `dashboard-ui` 200–320 |
| Riesgo de presupuesto 400 líneas por slice | **Bajo** (la banda de LoC de cada slice queda por debajo de 400 adiciones netas) |
| Riesgo de presupuesto 400 líneas si se colapsa | **Alto** — colapsar las cuatro slices en un único PR produciría 760–1200 líneas cambiadas, muy por encima del presupuesto de revisión de 400 líneas |
| PRs encadenados recomendados | **Sí** (4 PRs encadenados contra `develop`) |
| Split propuesto | `feat/reports-1-domain` → `feat/reports-2-application` → `feat/reports-3-routes` → `feat/reports-4-dashboard-ui` |
| Estrategia de entrega | `force-chained` (bloqueada en design §10) |
| Estrategia de cadena | `stacked-to-main` (cada PR mergea a `develop`; el flujo de release es explícito) |
| Decisión necesaria antes de apply | **No** (plan de slices, estrategia encadenada y fallback de sub-PR están bloqueados en design §10; el orquestador no vuelve a preguntar) |

```
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low (per slice) · High (collapsed)
```

> El design §10 pronostica 180–280 / 220–340 / 160–260 / 200–320
> LoC por slice (todas por debajo de 400 adiciones netas). La
> mitigación (4 PRs encadenados contra `develop`, cada uno su
> propio checkpoint de revisión por squash-merge) está bloqueada
> en el design. El worker de apply DEBE mostrar `git diff --stat`
> por PR al momento de abrir el PR para que el revisor vea el
> conteo real de líneas.

---

## Objetivo

`sdd-apply` para `reports` aterriza la capacidad `reports` completa (canónica en `openspec/specs/reports/spec.md` después del sync) más un delta aditivo sobre la capacidad `transactions` — el evento `TransactionRecorded` gana al menos un suscriptor — en cuatro PRs encadenados contra `develop`:

- **PR-1 `reports-domain`** aterriza el esqueleto de agregados de lectura: el nuevo puerto del kernel compartido `TransactionRepositoryPort` (superficie read-only; §2.2.1 del design), las interfaces `ReportsRepositoryPort` y `ReportSubscriberPort`, las tres fábricas de agregados (`MonthlySummary`, `CategoryBreakdown`, `AccountFlow`) con tests co-localizados, el servicio agregador puro `aggregate-transactions.ts`, las cinco clases de errores de dominio, el value object `Month`, y el barrel `domain/index.ts`. Sin capa de aplicación, sin rutas, sin cambio en el composition root. Tras el PR-1 el módulo es una librería completamente testeada sin consumidores.

- **PR-2 `reports-application`** aterriza la capa de acción: tres esquemas Zod (`monthlySummaryQuerySchema`, `categoryBreakdownQuerySchema`, `accountFlowQuerySchema` — el último aplicando la regex de cuid según la corrección #1 del orquestador), las tres acciones (`getMonthlySummaryAction`, `getCategoryBreakdownAction`, `getAccountFlowAction`), los tres mappers de DTO, la fixture `InMemoryReportsRepository` (compuesta sobre `InMemoryTransactionRepository`), el `_shared.ts` local (bolsa de deps + helpers; regla de módulos aislados), el barrel `application/index.ts`, y el stub de rutas. Las rutas Hono NO se montan todavía — eso aterriza en el PR-3.

- **PR-3 `reports-routes`** aterriza el wire-up: la factory `mountReportsRoutes(protectedApp, deps)`, las tres rutas montadas en `protectedApp` vía `createHonoApp`, el adapter `ReportsRepositoryPrisma`, el `NoopTransactionRecordedSubscriber`, el wireado del composition root (`buildAppDeps` + `buildReportsDeps`), y la aserción de conteo de suscriptores en `build-app-deps.test.ts` (REQ-RPT-7). El test del adapter Prisma usa testcontainers Postgres (replica el patrón de transactions; se salta si no hay DB).

- **PR-4 `dashboard-ui`** aterriza la UI smoke: `app/dashboard/page.tsx` (RSC, grilla de tres tarjetas + CTA de estado vacío), los tres Server Components presentacionales (`MonthlySummaryCard`, `CategoryBreakdownCard`, `AccountFlowCard`), los tipos de wire en `app/_lib/report-types.ts`, y los tests de snapshot para las cuatro superficies UI. El dashboard NO deep-linkea al endpoint de flow en v1 — la tarjeta `flow` queda vacía hasta que un cambio futuro agregue un selector de cuenta.

Tras los cuatro PR mergeando a `develop`, el spec canónico aterriza en `openspec/specs/reports/spec.md` vía `sdd-sync`, y `reports` se archiva.

---

## Estructura por sub-slice

### Slice 1 — `reports-domain`

- **Branch**: `feat/reports-1-domain`
- **Base**: `develop`
- **Alcance (dentro)**:
  - Nuevo puerto del kernel compartido `src/shared/domain-kernel/ports/transaction-repository-port.ts` (≤ 30 líneas) + adición de 4 líneas a `src/shared/domain-kernel/index.ts`.
  - `src/modules/reports/domain/aggregates/monthly-summary.ts` — `MonthlySummary` + `MonthlyTotals` + factory `createMonthlySummary` + invariantes. La factory llama a `Clock.now()` (sin `new Date()` en código de dominio).
  - `src/modules/reports/domain/aggregates/category-breakdown.ts` — `CategoryBreakdown` + `CategoryBucket` + factory `createCategoryBreakdown` + la función libre `normalizeCategory(category)` (`lowercase + trim`, null/empty → `'uncategorized'`).
  - `src/modules/reports/domain/aggregates/account-flow.ts` — `AccountFlow` + `AccountFlowDay` + factory `createAccountFlow` + omisión de días sparse + saldo acumulado + anclaje a medianoche UTC.
  - `src/modules/reports/domain/services/aggregate-transactions.ts` — funciones puras `aggregateMonthly`, `aggregateCategoryBreakdown`, `aggregateAccountFlow` (cero I/O; consumidas por las acciones en slice 2).
  - `src/modules/reports/domain/ports/reports-repository.port.ts` — `ReportsRepositoryPort` (3 métodos, todos con `userId` primero).
  - `src/modules/reports/domain/ports/report-subscriber.port.ts` — `ReportSubscriberPort` (1 método `onTransactionRecorded`).
  - `src/modules/reports/domain/value-objects/month.ts` — value object `Month` (regex `YYYY-MM`; deriva bounds UTC `fromDate` / `toDate`).
  - `src/modules/reports/domain/errors/{reports-domain-error,invalid-month-error,invalid-account-id-error,invalid-date-range-error,account-not-found-error}.ts` — clase base + 4 subclases; carga referencias a `BR-ACC-12` / `BR-TX-4`.
  - `src/modules/reports/domain/index.ts` — barrel público de dominio.
  - **Grafo DI sin cambios.** `buildAppDeps` en `src/composition/build-app-deps.ts` NO se toca en slice 1.
- **Alcance (fuera)**: capa de aplicación, rutas, adapter Prisma, suscriptor noop, wireado del composition root, UI del dashboard, sync del spec canónico.
- **Archivos tocados** (rutas concretas):
  - `src/shared/domain-kernel/ports/transaction-repository-port.ts` (nuevo, ~30 líneas)
  - `src/shared/domain-kernel/index.ts` (~4 líneas añadidas)
  - `src/modules/reports/domain/aggregates/monthly-summary.ts` (nuevo, ~80 líneas)
  - `src/modules/reports/domain/aggregates/monthly-summary.test.ts` (nuevo, ~110 líneas)
  - `src/modules/reports/domain/aggregates/category-breakdown.ts` (nuevo, ~90 líneas)
  - `src/modules/reports/domain/aggregates/category-breakdown.test.ts` (nuevo, ~120 líneas)
  - `src/modules/reports/domain/aggregates/account-flow.ts` (nuevo, ~110 líneas)
  - `src/modules/reports/domain/aggregates/account-flow.test.ts` (nuevo, ~140 líneas)
  - `src/modules/reports/domain/services/aggregate-transactions.ts` (nuevo, ~70 líneas)
  - `src/modules/reports/domain/services/aggregate-transactions.test.ts` (nuevo, ~80 líneas)
  - `src/modules/reports/domain/ports/reports-repository.port.ts` (nuevo, ~80 líneas)
  - `src/modules/reports/domain/ports/reports-repository.port.test.ts` (nuevo, ~40 líneas)
  - `src/modules/reports/domain/ports/report-subscriber.port.ts` (nuevo, ~30 líneas)
  - `src/modules/reports/domain/ports/report-subscriber.port.test.ts` (nuevo, ~20 líneas)
  - `src/modules/reports/domain/value-objects/month.ts` (nuevo, ~50 líneas)
  - `src/modules/reports/domain/value-objects/month.test.ts` (nuevo, ~40 líneas)
  - `src/modules/reports/domain/errors/reports-domain-error.ts` (nuevo, ~30 líneas)
  - `src/modules/reports/domain/errors/invalid-month-error.ts` (nuevo, ~15 líneas)
  - `src/modules/reports/domain/errors/invalid-account-id-error.ts` (nuevo, ~15 líneas)
  - `src/modules/reports/domain/errors/invalid-date-range-error.ts` (nuevo, ~15 líneas)
  - `src/modules/reports/domain/errors/account-not-found-error.ts` (nuevo, ~15 líneas)
  - `src/modules/reports/domain/index.ts` (nuevo, ~30 líneas)
- **Compuerta de verificación (slice 1)**:
  ```bash
  pnpm test src/modules/reports/domain
  # → todos los tests unitarios + de contrato pasan (≥ 80% de cobertura en la capa de dominio)
  pnpm test src/shared/domain-kernel
  # → las adiciones del puerto del kernel compilan + pasan
  pnpm run typecheck
  # → 0 errores (sin `any`, modo strict)
  pnpm run lint
  # → 0 errores (max-warnings 0)
  ```
- **Política de espejo en español**: este slice NO toca ningún Markdown user-facing más allá del par `tasks.md` (que vive en la ruta canónica; el espejo se produce como parte de esta fase). No se requieren actualizaciones de `Documents-es/` en slice 1.

### Slice 2 — `reports-application`

- **Branch**: `feat/reports-2-application`
- **Base**: `develop` (post-merge de slice 1)
- **Alcance (dentro)**:
  - **Esquemas Zod** en `src/modules/reports/application/schemas/`:
    - `monthly-summary-query.schema.ts` — regex `month` `/^\d{4}-\d{2}$/` + refine `1..12` + `.strict()`.
    - `category-breakdown-query.schema.ts` — extiende monthly (costura de forward-compatibility).
    - `account-flow-query.schema.ts` — regex cuid en `accountId` `/^c[a-z0-9]{20,32}$/` (corrección #1 del orquestador), unión `month` OR `fromDate` + `toDate`, refine `fromDate <= toDate`.
  - **Acciones** en `src/modules/reports/application/actions/`:
    - `_shared.ts` — copia local del `_shared.ts` (regla de módulos aislados, root `AGENTS.md` §10.5). Exporta `ReportsActionDeps`, `ActionResult<T>`, `zodErrorToActionError`, `domainErrorToActionError`.
    - `get-monthly-summary.action.ts` — Zod parse → llamada al port → factory → mapper a DTO → `ActionResult`.
    - `get-category-breakdown.action.ts` — misma forma.
    - `get-account-flow.action.ts` — Zod parse → `accountRepository.findById(userId, accountId)` (404 si null) → verificación de rango 366 días → llamada al port → factory → mapper a DTO → `ActionResult`.
  - **DTOs** en `src/modules/reports/application/dto/`:
    - `monthly-summary.dto.ts` — `MonthlySummaryDTO` + `toMonthlySummaryDto` (Date → string ISO-8601).
    - `category-breakdown.dto.ts` — `CategoryBreakdownDTO` + `CategoryBucketDTO` + `toCategoryBreakdownDto`.
    - `account-flow.dto.ts` — `AccountFlowDTO` + `AccountFlowDayDTO` + `toAccountFlowDto` (Date → string `YYYY-MM-DD`).
  - **Fixtures** en `src/modules/reports/application/fixtures/`:
    - `reports-repository.inmemory.ts` — clase `InMemoryReportsRepository` que implementa `ReportsRepositoryPort`. Compone `InMemoryTransactionRepository` del módulo de transactions como fuente de datos subyacente.
  - **Stub de rutas** en `src/modules/reports/application/routes.ts` — factory exportada pero NO montada todavía (slice 3 la monta).
  - **Barrel** `src/modules/reports/application/index.ts` — exporta las tres acciones, los tres tipos de DTO, `ReportsActionDeps`, `MountReportsRoutesDeps`, `mountReportsRoutes`.
- **Alcance (fuera)**: montaje Hono en `protectedApp` (slice 3), adapter Prisma (slice 3), wireado del suscriptor noop (slice 3), UI smoke (slice 4), sync del spec canónico.
- **Archivos tocados** (rutas concretas):
  - `src/modules/reports/application/schemas/monthly-summary-query.schema.ts` (nuevo, ~30 líneas)
  - `src/modules/reports/application/schemas/monthly-summary-query.schema.test.ts` (nuevo, ~40 líneas)
  - `src/modules/reports/application/schemas/category-breakdown-query.schema.ts` (nuevo, ~25 líneas)
  - `src/modules/reports/application/schemas/category-breakdown-query.schema.test.ts` (nuevo, ~30 líneas)
  - `src/modules/reports/application/schemas/account-flow-query.schema.ts` (nuevo, ~50 líneas)
  - `src/modules/reports/application/schemas/account-flow-query.schema.test.ts` (nuevo, ~70 líneas)
  - `src/modules/reports/application/actions/_shared.ts` (nuevo, ~80 líneas)
  - `src/modules/reports/application/actions/get-monthly-summary.action.ts` (nuevo, ~60 líneas)
  - `src/modules/reports/application/actions/get-monthly-summary.action.test.ts` (nuevo, ~110 líneas)
  - `src/modules/reports/application/actions/get-category-breakdown.action.ts` (nuevo, ~60 líneas)
  - `src/modules/reports/application/actions/get-category-breakdown.action.test.ts` (nuevo, ~110 líneas)
  - `src/modules/reports/application/actions/get-account-flow.action.ts` (nuevo, ~80 líneas)
  - `src/modules/reports/application/actions/get-account-flow.action.test.ts` (nuevo, ~140 líneas)
  - `src/modules/reports/application/dto/monthly-summary.dto.ts` (nuevo, ~40 líneas)
  - `src/modules/reports/application/dto/monthly-summary.dto.test.ts` (nuevo, ~30 líneas)
  - `src/modules/reports/application/dto/category-breakdown.dto.ts` (nuevo, ~40 líneas)
  - `src/modules/reports/application/dto/category-breakdown.dto.test.ts` (nuevo, ~30 líneas)
  - `src/modules/reports/application/dto/account-flow.dto.ts` (nuevo, ~50 líneas)
  - `src/modules/reports/application/dto/account-flow.dto.test.ts` (nuevo, ~40 líneas)
  - `src/modules/reports/application/fixtures/reports-repository.inmemory.ts` (nuevo, ~80 líneas)
  - `src/modules/reports/application/routes.ts` (nuevo, ~70 líneas — factory exportada, aún no montada)
  - `src/modules/reports/application/index.ts` (nuevo, ~30 líneas)
- **Compuerta de verificación (slice 2)**:
  ```bash
  pnpm test src/modules/reports/application
  # → todos los tests de esquema + acción + DTO + fixture pasan (≥ 80% de cobertura en la capa de aplicación)
  pnpm test src/modules/reports/domain
  # → los tests del slice 1 siguen pasando
  pnpm run typecheck
  pnpm run lint
  ```
- **Política de espejo en español**: igual que en slice 1.

### Slice 3 — `reports-routes`

- **Branch**: `feat/reports-3-routes`
- **Base**: `develop` (post-merge de slice 2)
- **Alcance (dentro)**:
  - **Infraestructura** en `src/modules/reports/infrastructure/`:
    - `repositories/reports.repository.prisma.ts` — adapter `ReportsRepositoryPrisma`. Reusa `TransactionRepositoryPort.list(userId, { fromDate, toDate, accountId? })` para el camino de lectura (más barato que una consulta Prisma fresca según design §6.1). Construye ventanas mensuales UTC vía `Date.UTC(year, month - 1, 1)` / `Date.UTC(year, month, 1)`.
    - `subscribers/noop-transaction-recorded.subscriber.ts` — factory `createNoopHandler(logger)`. Loguea en debug `reports.noop.transaction-recorded` y retorna `void`. Retorna `Promise<void>`.
  - **Composition root** en `src/composition/`:
    - `build-app-deps.ts` — añade la factory `buildReportsDeps({ txRepo, accountRepo, dispatcher, logger, clock })`; wirea `ReportsRepositoryPrisma`; wirea `dispatcher.subscribe('TransactionRecorded', createNoopHandler(logger))` exactamente una vez (REQ-RPT-7, BR-RPT-5).
    - `create-hono-app.ts` — añade la llamada `mountReportsRoutes(protectedApp, { reportsDeps: deps.reportsDeps })` después del montaje de transactions y antes de `app.route('/', protectedApp)`.
    - `build-app-deps.test.ts` (+~30 líneas) — asegura que `dispatcher.subscriberCount('TransactionRecorded')` sea exactamente `before + 1` después de que `buildAppDeps` retorna.
  - **Barrel público** `src/modules/reports/index.ts` — replica `src/modules/transactions/application/index.ts`. Exporta los tipos de los ports, los tipos de los agregados, los tipos de los DTOs, `ReportsActionDeps`, `mountReportsRoutes`. NO exporta el adapter Prisma, la fixture InMemory, ni el handler noop.
  - **Barrel del kernel** `src/shared/domain-kernel/index.ts` — reexporta `TransactionRepositoryPort` (ya añadido en slice 1).
- **Alcance (fuera)**: UI smoke (slice 4), sync del spec canónico.
- **Archivos tocados** (rutas concretas):
  - `src/modules/reports/infrastructure/repositories/reports.repository.prisma.ts` (nuevo, ~110 líneas)
  - `src/modules/reports/infrastructure/repositories/reports.repository.prisma.test.ts` (nuevo, ~150 líneas; testcontainers, se salta si no hay DB)
  - `src/modules/reports/infrastructure/subscribers/noop-transaction-recorded.subscriber.ts` (nuevo, ~30 líneas)
  - `src/modules/reports/infrastructure/subscribers/noop-transaction-recorded.subscriber.test.ts` (nuevo, ~40 líneas)
  - `src/modules/reports/index.ts` (nuevo, ~50 líneas)
  - `src/composition/build-app-deps.ts` (~40 líneas añadidas; `buildReportsDeps` + llamada a `subscribe`)
  - `src/composition/create-hono-app.ts` (~3 líneas añadidas; llamada de montaje)
  - `src/composition/build-app-deps.test.ts` (~30 líneas añadidas; aserción de conteo de suscriptores)
  - `src/modules/reports/application/routes.test.ts` (nuevo, ~180 líneas — test de integración Hono con deps in-memory)
- **Compuerta de verificación (slice 3)**:
  ```bash
  pnpm test src/modules/reports/application/routes.test.ts
  # → 401 sin auth / 200 con seed / 400 mes inválido / 404 cross-user / 400 rango > 366 días
  pnpm test src/composition/build-app-deps.test.ts
  # → subscriber count = before + 1 después de buildAppDeps
  pnpm test src/modules/reports/
  # → todos los tests de slices 1 + 2 + 3 pasan (≥ 80% de cobertura en el módulo)
  pnpm run typecheck
  pnpm run lint
  pnpm run build
  # Verificación manual end-to-end (terminal del desarrollador):
  pnpm dev
  # 1. Iniciar sesión vía /auth/signin
  # 2. curl -H "Cookie: authjs.session-token=..." 'http://localhost:3000/api/reports/monthly?month=2026-06' → 200 JSON
  # 3. curl -H "Cookie: authjs.session-token=..." 'http://localhost:3000/api/reports/breakdown?month=2026-06' → 200 JSON
  # 4. curl -H "Cookie: authjs.session-token=..." 'http://localhost:3000/api/reports/accounts/<cuenta-de-otro-usuario>/flow' → 404
  ```
- **Política de espejo en español**: igual que en slice 1.

### Slice 4 — `dashboard-ui`

- **Branch**: `feat/reports-4-dashboard-ui`
- **Base**: `develop` (post-merge de slice 3)
- **Alcance (dentro)**:
  - **Tipos de wire** `app/_lib/report-types.ts` — `MonthlySummaryDTO`, `CategoryBreakdownDTO`, `AccountFlowDTO`, `ErrorEnvelope`. Replica `app/_lib/transaction-types.ts`. Sin lógica, solo tipos para consumo del RSC.
  - **Server Components presentacionales** en `app/_components/`:
    - `dashboard-monthly-summary.tsx` — `<MonthlySummaryCard summary={...} />`. Renderiza la tabla de totales con columnas `Ingresos / Gastos / Neto / #`. El estado vacío muestra "Sin datos".
    - `dashboard-category-breakdown.tsx` — `<CategoryBreakdownCard breakdown={...} />`. Renderiza la tabla de buckets ordenada por `amountMinor DESC`.
    - `dashboard-account-flow.tsx` — `<AccountFlowCard flow={...} />`. Renderiza la tabla de días; v1 siempre renderiza vacía porque el dashboard no deep-linkea a una cuenta.
  - **Página del dashboard** `app/dashboard/page.tsx` — RSC, `force-dynamic`. Resuelve la sesión vía `auth()`; llama a `/api/reports/monthly` y `/api/reports/breakdown` en paralelo vía `serverHonoRequest`; renderiza las tres tarjetas (o el CTA de estado vacío que linkea a `/transactions/new`). Cada tarjeta muestra la etiqueta del mes UTC.
  - **Tests de snapshot** para cada componente + la página del dashboard (usando `renderToStaticMarkup` de `react-dom/server`, el seam de tests existente del proyecto).
- **Alcance (fuera)**: UI de producción (primitivas del sistema de diseño, auditorías de accesibilidad) — esas aterrizan en un cambio futuro `transactions-ui`.
- **Archivos tocados** (rutas concretas):
  - `app/_lib/report-types.ts` (nuevo, ~80 líneas)
  - `app/_components/dashboard-monthly-summary.tsx` (nuevo, ~70 líneas)
  - `app/_components/dashboard-monthly-summary.test.tsx` (nuevo, ~50 líneas)
  - `app/_components/dashboard-category-breakdown.tsx` (nuevo, ~70 líneas)
  - `app/_components/dashboard-category-breakdown.test.tsx` (nuevo, ~50 líneas)
  - `app/_components/dashboard-account-flow.tsx` (nuevo, ~60 líneas)
  - `app/_components/dashboard-account-flow.test.tsx` (nuevo, ~40 líneas)
  - `app/dashboard/page.tsx` (nuevo, ~100 líneas)
  - `app/dashboard/page.test.tsx` (nuevo, ~80 líneas)
- **Compuerta de verificación (slice 4)**:
  ```bash
  pnpm test app/_components/dashboard-monthly-summary.test.tsx
  pnpm test app/_components/dashboard-category-breakdown.test.tsx
  pnpm test app/_components/dashboard-account-flow.test.tsx
  pnpm test app/dashboard/page.test.tsx
  # → todos los tests de snapshot pasan (estados vacío + poblado para monthly + breakdown; estado vacío para flow; CTA de estado vacío para la página)
  pnpm run typecheck
  pnpm run lint
  pnpm run build
  # Verificación manual end-to-end (terminal del desarrollador):
  pnpm dev
  # 1. Iniciar sesión vía /auth/signin
  # 2. Visitar /dashboard sin transacciones → ver tres tarjetas "Sin datos" + el CTA "Registrar primera transacción"
  # 3. Click en el CTA → /transactions/new → enviar un gasto válido → aterrizar en /transactions
  # 4. Volver a /dashboard → ver las tarjetas de monthly + breakdown pobladas + la tarjeta de flow vacía
  ```
- **Política de espejo en español**: `app/` NO tiene espejo en `Documents-es/` (según la convención existente del proyecto — solo `docs/` y `openspec/` se reflejan). No se requieren actualizaciones de `Documents-es/` en slice 4.

---

## Tareas por slice

### Slice 1 — `reports-domain` (12 tareas)

> Ordenadas para que un solo commit aterrice un foco. Cada tarea
> codificadora de comportamiento tiene un test RED antes de la
> implementación GREEN.

| ID | Título | Slice | Archivo(s) | Tipo | Descripción | Comando de test | Aceptación | Commit | Dependencia | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-RPT-001 | Añadir puerto del kernel compartido para `TransactionRepositoryPort` (superficie read-only) | reports-domain | `src/shared/domain-kernel/ports/transaction-repository-port.ts` (nuevo) · `src/shared/domain-kernel/index.ts` (modificado, +4 líneas) | infra | Nuevo puerto del kernel en `src/shared/domain-kernel/ports/transaction-repository-port.ts` que reexporta la forma `list` del puerto de transactions (read-only — nunca `create` / `update` / `delete`). Añade 4 líneas al barrel del kernel. §2.2.1 del design. La regla de sub-tipado estructural mantiene el puerto de transactions completo asignable al puerto del kernel más estrecho. | `pnpm test src/shared/domain-kernel` | (1) `pnpm typecheck` sale con 0; (2) el barrel del kernel exporta `TransactionRepositoryPort`; (3) sin test de runtime (seam en tiempo de compilación). | `feat(reports-domain): add kernel port for transaction read surface` | — | pendiente |
| T-RPT-002 | RED: test de contrato del puerto asegura `userId` primero en cada método de `ReportsRepositoryPort` | reports-domain | `src/modules/reports/domain/ports/reports-repository.port.test.ts` (nuevo) | red | Test de contrato en tiempo de compilación. El test importa `ReportsRepositoryPort` y construye un mock `vi.fn()` que satisface la interfaz; `tsc` enforce el contrato. El test falla porque el archivo del puerto aún no existe. | `pnpm test src/modules/reports/domain/ports/reports-repository.port.test.ts` | (1) El test falla con "cannot find module"; (2) la razón de la falla es "feature missing", no un typo. | `test(reports-domain): port contract test asserts userId-first on every method` | T-RPT-001 | pendiente |
| T-RPT-003 | GREEN: declarar `ReportsRepositoryPort` (3 métodos, todos con `userId` primero) | reports-domain | `src/modules/reports/domain/ports/reports-repository.port.ts` (nuevo) | green | Implementa el tipo del puerto con `findByUserAndMonth`, `findByUserAndMonthForBreakdown`, `findByUserAccountAndRange`. Los tres retornan `Promise<readonly TransactionDTO[]>`. Los tres reciben `userId` primero (invariente cross-module BR-TX-4, transportada). | `pnpm test src/modules/reports/domain/ports/reports-repository.port.test.ts` | (1) El test de contrato del puerto pasa; (2) `pnpm typecheck` sale con 0. | `feat(reports-domain): add ReportsRepositoryPort interface` | T-RPT-002 | pendiente |
| T-RPT-004 | GREEN: declarar `ReportSubscriberPort` (1 método `onTransactionRecorded`) | reports-domain | `src/modules/reports/domain/ports/report-subscriber.port.ts` (nuevo) · `src/modules/reports/domain/ports/report-subscriber.port.test.ts` (nuevo) | green | Handle opaco `Unsubscribe = () => void`. El método único `onTransactionRecorded(handler: (event: TransactionRecordedPayload) => void \| Promise<void>): Unsubscribe` declara el seam para el handler noop (REQ-RPT-7). Incluye test de contrato en tiempo de compilación. | `pnpm test src/modules/reports/domain/ports/report-subscriber.port.test.ts` | (1) El test de contrato pasa; (2) `pnpm typecheck` sale con 0. | `feat(reports-domain): add ReportSubscriberPort interface` | T-RPT-001 | pendiente |
| T-RPT-005 | RED: test de la factory `MonthlySummary` asegura agrupación + invariantes | reports-domain | `src/modules/reports/domain/aggregates/monthly-summary.test.ts` (nuevo) | red | Tests (según §11.1 del design): (1) agrupa por `convertedCurrency`; (2) retorna `totals: []` sin filas; (3) invariante `incomeMinor >= 0`, `expenseMinor >= 0`, `netMinor === incomeMinor - expenseMinor`; (4) `generatedAt === clock.now()`; (5) lanza `ReportsDomainError` cuando el mes está fuera de rango. El test falla porque la factory no existe. | `pnpm test src/modules/reports/domain/aggregates/monthly-summary.test.ts` | (1) El test falla con "cannot find module"; (2) `pnpm typecheck` sale con 0. | `test(reports-domain): monthly-summary factory test asserts grouping + invariants` | T-RPT-003 | pendiente |
| T-RPT-006 | GREEN: implementar el agregado `MonthlySummary` + factory | reports-domain | `src/modules/reports/domain/aggregates/monthly-summary.ts` (nuevo) | green | Implementa las interfaces `MonthlySummary` + `MonthlyTotals` y la factory `createMonthlySummary` según §3.2 del design. La factory llama a `Clock.now()` (sin `new Date()` en código de dominio). | `pnpm test src/modules/reports/domain/aggregates/monthly-summary.test.ts` | (1) Los 5 tests pasan; (2) `pnpm typecheck` sale con 0. | `feat(reports-domain): add MonthlySummary aggregate with factory` | T-RPT-005 | pendiente |
| T-RPT-007 | TRIANGULATE: casos de borde (multi-moneda, Feb bisiesto, filas sparse) | reports-domain | `src/modules/reports/domain/aggregates/monthly-summary.test.ts` (modificado, +5 casos) | triangulate | Añade (1) Feb bisiesto (29 días); (2) fila sparse (transacción única en mes de 31 días); (3) peso cross-moneda (totales ARS + USD distintos); (4) unidades menores con signo (`convertedAmountMinor` negativo por un refund reduce `netMinor`); (5) `null` memo + `null` category se preservan verbatim en la fila pero no aparecen en `MonthlyTotals` (memo/category es por fila, no por bucket). | `pnpm test src/modules/reports/domain/aggregates/monthly-summary.test.ts` | (1) Los 10 tests pasan; (2) cobertura sobre `monthly-summary.ts` ≥ 80%. | `test(reports-domain): monthly-summary edge cases — leap-year, sparse, cross-currency` | T-RPT-006 | pendiente |
| T-RPT-008 | RED → GREEN: agregado `CategoryBreakdown` con `normalizeCategory` | reports-domain | `src/modules/reports/domain/aggregates/category-breakdown.ts` (nuevo) · `src/modules/reports/domain/aggregates/category-breakdown.test.ts` (nuevo) | red+green | Tests: (1) lowercase + trim vía `normalizeCategory`; (2) categoría null/empty → `'uncategorized'`; (3) agrupa por tupla `(categoryNormalized, convertedCurrency)`; (4) ordena por `amountMinor DESC` primario, `categoryNormalized ASC` secundario; (5) buckets con count 0 se descartan. RED primero, luego GREEN implementa la factory + la función libre. | `pnpm test src/modules/reports/domain/aggregates/category-breakdown.test.ts` | (1) Todos los tests pasan; (2) `pnpm typecheck` sale con 0. | `feat(reports-domain): add CategoryBreakdown aggregate with normalization + sort` | T-RPT-006 | pendiente |
| T-RPT-009 | RED → GREEN: agregado `AccountFlow` con omisión de días sparse + saldo acumulado | reports-domain | `src/modules/reports/domain/aggregates/account-flow.ts` (nuevo) · `src/modules/reports/domain/aggregates/account-flow.test.ts` (nuevo) | red+green | Tests: (1) anclaje a medianoche UTC (`fromDate → 00:00:00.000Z`, `toDate → 23:59:59.999Z`); (2) regex cuid sobre `accountId` (defense in depth); (3) días sparse omitidos; (4) saldo acumulado = `prev.running + this.net`; (5) lanza `InvalidDateRangeError` cuando `toDate - fromDate > 366 días`; (6) lanza `InvalidAccountIdError` cuando `accountId` falla la regex cuid. | `pnpm test src/modules/reports/domain/aggregates/account-flow.test.ts` | (1) Todos los tests pasan; (2) regex cuid enforce; (3) `pnpm typecheck` sale con 0. | `feat(reports-domain): add AccountFlow aggregate with sparse-day omission + running balance` | T-RPT-006 | pendiente |
| T-RPT-010 | GREEN: servicio agregador puro `aggregateMonthly` / `aggregateCategoryBreakdown` / `aggregateAccountFlow` | reports-domain | `src/modules/reports/domain/services/aggregate-transactions.ts` (nuevo) · `src/modules/reports/domain/services/aggregate-transactions.test.ts` (nuevo) | green | Funciones puras; cero I/O; consumidas por las acciones en slice 2. Cada función toma `readonly TransactionDTO[]` + `Clock` y retorna la forma `{ field, generatedAt }`. Test co-localizado asegura aislamiento cross-user en la salida del agregador (el puerto filtra, el agregador confía — pero el test asegura el contrato de confianza). | `pnpm test src/modules/reports/domain/services/aggregate-transactions.test.ts` | (1) Todos los tests pasan; (2) no hay `new Date()` en `aggregate-transactions.ts` (solo `clock.now()`). | `feat(reports-domain): add pure aggregator services + cross-user isolation test` | T-RPT-006, T-RPT-008, T-RPT-009 | pendiente |
| T-RPT-011 | GREEN: errores de dominio + value object `Month` | reports-domain | `src/modules/reports/domain/errors/*.ts` (5 archivos nuevos) · `src/modules/reports/domain/value-objects/month.ts` (nuevo) · `src/modules/reports/domain/value-objects/month.test.ts` (nuevo) | green | Clase base `ReportsDomainError` + 4 subclases (`InvalidMonthError`, `InvalidAccountIdError`, `InvalidDateRangeError`, `AccountNotFoundError`). Value object `Month` (regex `YYYY-MM` + bounds; deriva `fromDate` / `toDate` UTC). `month.test.ts` co-localizado asegura la regex + los bounds. | `pnpm test src/modules/reports/domain/value-objects/month.test.ts` | (1) Todos los tests de month pasan; (2) los errores extienden `ReportsDomainError`; (3) `pnpm typecheck` sale con 0. | `feat(reports-domain): add domain errors and Month value object` | T-RPT-003 | pendiente |
| T-RPT-012 | GREEN: barrel de dominio + test de contrato de superficie del barrel | reports-domain | `src/modules/reports/domain/index.ts` (nuevo) · `src/modules/reports/domain/index.test.ts` (nuevo) | green | Barrel público de dominio: reexporta los tres agregados + sus tipos, los dos puertos, las cinco clases de error, el value object `Month`, y el servicio agregador. Test de contrato de superficie del barrel (replica `src/modules/auth/index.test.ts`) asegura el conjunto exacto de nombres exportados. | `pnpm test src/modules/reports/domain/index.test.ts` | (1) El test de superficie del barrel pasa; (2) no hay exports de infraestructura desde el barrel de dominio. | `feat(reports-domain): add domain barrel + barrel surface contract test` | T-RPT-006, T-RPT-008, T-RPT-009, T-RPT-010, T-RPT-011 | pendiente |

### Slice 2 — `reports-application` (12 tareas)

> Todos los esquemas y acciones siguen RED → GREEN → TRIANGULATE.
> La fixture InMemoryReportsRepository reusa `InMemoryTransactionRepository`
> del módulo de transactions.

| ID | Título | Slice | Archivo(s) | Tipo | Descripción | Comando de test | Aceptación | Commit | Dependencia | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-RPT-101 | RED: test de `monthlySummaryQuerySchema` asegura regex de mes + bounds | reports-application | `src/modules/reports/application/schemas/monthly-summary-query.schema.test.ts` (nuevo) | red | Tests (según §5.6 del design): (1) parsea `{ month: '2026-06' }`; (2) rechaza `{ month: '2026-13' }` (fuera de bounds); (3) rechaza `{ month: 'foo' }` (falla la regex); (4) rechaza claves desconocidas (`.strict()`); (5) rechaza `{ month: '' }`. El test falla porque el esquema no existe. | `pnpm test src/modules/reports/application/schemas/monthly-summary-query.schema.test.ts` | (1) El test falla con "cannot find module"; (2) `pnpm typecheck` sale con 0. | `test(reports-application): monthly-summary-query schema test` | — | pendiente |
| T-RPT-102 | GREEN: implementar `monthlySummaryQuerySchema` | reports-application | `src/modules/reports/application/schemas/monthly-summary-query.schema.ts` (nuevo) | green | Implementa el esquema Zod según §5.6: `month: z.string().regex(/^\d{4}-\d{2}$/).refine((m) => { const month = Number.parseInt(m.slice(5, 7), 10); return month >= 1 && month <= 12; }, { message: 'month must be 01..12' })`. Modificador `.strict()`. | `pnpm test src/modules/reports/application/schemas/monthly-summary-query.schema.test.ts` | (1) Los 5 tests pasan; (2) `pnpm typecheck` sale con 0. | `feat(reports-application): monthly-summary-query schema` | T-RPT-101 | pendiente |
| T-RPT-103 | RED: test de `accountFlowQuerySchema` asegura regex cuid + unión month/range | reports-application | `src/modules/reports/application/schemas/account-flow-query.schema.test.ts` (nuevo) | red | Tests: (1) `{ accountId: 'c<20-char-cuid>', month: '2026-06' }` parsea; (2) `{ accountId: 'not-a-cuid', month: '2026-06' }` falla con `VALIDATION_ERROR`; (3) `{ accountId, fromDate, toDate }` parsea; (4) `{ fromDate: '2026-12-01', toDate: '2026-01-01' }` falla (fromDate > toDate); (5) `{ month: '2026-06', fromDate: '2026-06-01' }` falla (no se puede mezclar month + range). | `pnpm test src/modules/reports/application/schemas/account-flow-query.schema.test.ts` | (1) Todos los tests fallan porque el esquema no existe; (2) `pnpm typecheck` sale con 0. | `test(reports-application): account-flow-query schema test asserts cuid + union` | T-RPT-102 | pendiente |
| T-RPT-104 | GREEN: implementar `accountFlowQuerySchema` con regex cuid + unión month/range | reports-application | `src/modules/reports/application/schemas/account-flow-query.schema.ts` (nuevo) | green | Implementa según §5.6: `accountId: z.string().regex(/^c[a-z0-9]{20,32}$/)` (corrección #1 del orquestador), unión `month` OR `fromDate` + `toDate`, refine `fromDate <= toDate`. El límite superior de 366 días es una verificación a nivel de servicio (T-RPT-108); Zod no tiene una primitiva de date-math incorporada. | `pnpm test src/modules/reports/application/schemas/account-flow-query.schema.test.ts` | (1) Los 5 tests pasan; (2) regex cuid enforce; (3) `pnpm typecheck` sale con 0. | `feat(reports-application): account-flow-query schema (cuid regex per orchestrator correction #1)` | T-RPT-103 | pendiente |
| T-RPT-105 | GREEN: `categoryBreakdownQuerySchema` + tests | reports-application | `src/modules/reports/application/schemas/category-breakdown-query.schema.ts` (nuevo) · `src/modules/reports/application/schemas/category-breakdown-query.schema.test.ts` (nuevo) | green | Misma forma que monthly (keyed por mes) pero en archivo separado para forward-compatibility (un futuro filtro `?limit=100` se adosa aquí sin sangrar hacia monthly). Test co-localizado asegura los mismos 5 casos que T-RPT-101. | `pnpm test src/modules/reports/application/schemas/category-breakdown-query.schema.test.ts` | (1) Todos los tests pasan; (2) `pnpm typecheck` sale con 0. | `feat(reports-application): category-breakdown-query schema` | T-RPT-102 | pendiente |
| T-RPT-106 | RED: test de la fixture `InMemoryReportsRepository` | reports-application | `src/modules/reports/application/fixtures/reports-repository.inmemory.test.ts` (nuevo) | red | Tests sobre la fixture in-memory: (1) delega `findByUserAndMonth` a `InMemoryTransactionRepository.list`; (2) filas cross-user no se retornan (contrato de confianza-en-el-puerto); (3) `findByUserAccountAndRange` filtra por `accountId` + rango de fechas; (4) rango vacío retorna `[]`. El test falla porque la fixture no existe. | `pnpm test src/modules/reports/application/fixtures/reports-repository.inmemory.test.ts` | (1) El test falla; (2) `pnpm typecheck` sale con 0. | `test(reports-application): in-memory reports repository fixture test` | T-RPT-001 (puerto del kernel) | pendiente |
| T-RPT-107 | GREEN: implementar la fixture `InMemoryReportsRepository` | reports-application | `src/modules/reports/application/fixtures/reports-repository.inmemory.ts` (nuevo) | green | Compone `InMemoryTransactionRepository` del módulo de transactions como fuente de datos subyacente. Implementa `ReportsRepositoryPort`. NO se exporta desde el barrel público (según design §2.3). | `pnpm test src/modules/reports/application/fixtures/reports-repository.inmemory.test.ts` | (1) Todos los tests pasan; (2) aislamiento cross-user verificado. | `feat(reports-application): in-memory reports repository fixture` | T-RPT-106 | pendiente |
| T-RPT-108 | RED: tests de `getMonthlySummaryAction` cubren vacío / multi-moneda / cross-user | reports-application | `src/modules/reports/application/actions/get-monthly-summary.action.test.ts` (nuevo) | red | Tests (según §5.3 del design + §11.2): (1) retorna `200` + `MonthlySummaryDTO` en mes válido; (2) retorna `200 { totals: [] }` para usuario vacío; (3) retorna `400 VALIDATION_ERROR` en mes inválido; (4) filas cross-user no aparecen en la respuesta. El test falla porque la acción no existe. | `pnpm test src/modules/reports/application/actions/get-monthly-summary.action.test.ts` | (1) Los 4 tests fallan con "cannot find module"; (2) `pnpm typecheck` sale con 0. | `test(reports-application): get-monthly-summary action tests` | T-RPT-102, T-RPT-107 | pendiente |
| T-RPT-109 | GREEN: implementar `getMonthlySummaryAction` + `_shared.ts` local | reports-application | `src/modules/reports/application/actions/get-monthly-summary.action.ts` (nuevo) · `src/modules/reports/application/actions/_shared.ts` (nuevo) | green | La acción sigue §5.3: parse → llamada al port → factory → mapper a DTO → `ActionResult`. El `_shared.ts` local exporta `ReportsActionDeps`, `ActionResult<T>`, `zodErrorToActionError`, `domainErrorToActionError`. Regla de módulos aislados (root `AGENTS.md` §10.5): NO importa `@/modules/transactions/application/actions/_shared.ts`. | `pnpm test src/modules/reports/application/actions/get-monthly-summary.action.test.ts` | (1) Los 4 tests pasan; (2) `pnpm typecheck` sale con 0. | `feat(reports-application): get-monthly-summary action + local _shared.ts` | T-RPT-108 | pendiente |
| T-RPT-110 | RED → GREEN: `getCategoryBreakdownAction` + `getAccountFlowAction` | reports-application | `src/modules/reports/application/actions/get-category-breakdown.action.ts` (nuevo) · `src/modules/reports/application/actions/get-category-breakdown.action.test.ts` (nuevo) · `src/modules/reports/application/actions/get-account-flow.action.ts` (nuevo) · `src/modules/reports/application/actions/get-account-flow.action.test.ts` (nuevo) | red+green | Según §5.4 y §5.5. Los tests de la acción de flow cubren (1) 404 cross-user (`AccountRepositoryPort.findById` retorna null); (2) días sparse; (3) rango > 366 días retorna `VALIDATION_ERROR`; (4) mes válido retorna `200 + AccountFlowDTO`; (5) rango válido retorna `200 + AccountFlowDTO`. RED primero, luego GREEN implementa ambas acciones. | `pnpm test src/modules/reports/application/actions/get-category-breakdown.action.test.ts` `pnpm test src/modules/reports/application/actions/get-account-flow.action.test.ts` | (1) Todos los tests pasan; (2) `pnpm typecheck` sale con 0; (3) verificación de 366 días enforce en la acción de flow. | `feat(reports-application): get-category-breakdown + get-account-flow actions` | T-RPT-104, T-RPT-107, T-RPT-109 | pendiente |
| T-RPT-111 | GREEN: mappers de DTO + tests (3 mappers, 3 tests) | reports-application | `src/modules/reports/application/dto/{monthly-summary,category-breakdown,account-flow}.dto.ts` (3 archivos nuevos) · `src/modules/reports/application/dto/*.test.ts` (3 archivos nuevos) | green | Mappers según §3 + §5.7 del design: Date → string ISO-8601 en el wire; `convertedCurrency` preservado; `null` memo/category preservados verbatim. Tests co-localizados aseguran (1) stringificación de fecha; (2) preservación de null; (3) round-trip a través de la factory. | `pnpm test src/modules/reports/application/dto/` | (1) Todos los tests de mapper pasan; (2) la forma del wire coincide con el ejemplo §9.2 del design. | `feat(reports-application): DTO mappers + tests` | T-RPT-109, T-RPT-110 | pendiente |
| T-RPT-112 | TRIANGULATE: test de integración que ejercita las tres acciones contra `InMemoryReportsRepository` | reports-application | `src/modules/reports/application/integration.test.ts` (nuevo) | triangulate | Test estilo end-to-end: siembra `InMemoryTransactionRepository` con filas multi-moneda para user `u1` + filas cross-user para user `u2`; asegura que las tres acciones retornan los DTOs esperados sin filtración cross-user. Esta es la compuerta de aceptación para la capa de aplicación. | `pnpm test src/modules/reports/application/integration.test.ts` | (1) El test de integración pasa; (2) cobertura sobre `src/modules/reports/application/` ≥ 80%. | `test(reports-application): integration test for all three actions against InMemoryReportsRepository` | T-RPT-110, T-RPT-111 | pendiente |

### Slice 3 — `reports-routes` (10 tareas)

> Wireado a través del composition root. El test del adapter Prisma usa
> testcontainers Postgres (se salta si no hay DB, según el patrón
> existente de transactions).

| ID | Título | Slice | Archivo(s) | Tipo | Descripción | Comando de test | Aceptación | Commit | Dependencia | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-RPT-201 | RED: test del handler `noop-transaction-recorded` | reports-routes | `src/modules/reports/infrastructure/subscribers/noop-transaction-recorded.subscriber.test.ts` (nuevo) | red | Tests según §11.3: (1) retorna `void` sin lanzar sobre un `TransactionRecordedPayload` de muestra; (2) llama a `logger.debug` con el nombre de evento `reports.noop.transaction-recorded` + payload `{ userId, transactionId }`. El test falla porque el handler no existe. | `pnpm test src/modules/reports/infrastructure/subscribers/noop-transaction-recorded.subscriber.test.ts` | (1) El test falla; (2) `pnpm typecheck` sale con 0. | `test(reports-routes): noop handler test asserts void + debug log` | T-RPT-004 | pendiente |
| T-RPT-202 | GREEN: implementar `createNoopHandler` | reports-routes | `src/modules/reports/infrastructure/subscribers/noop-transaction-recorded.subscriber.ts` (nuevo) | green | Según §6.2 del design. La factory retorna `async (event: TransactionRecordedPayload): Promise<void> => { logger.debug('reports.noop.transaction-recorded', { userId, transactionId }); }`. Sin efectos colaterales más allá del log debug. | `pnpm test src/modules/reports/infrastructure/subscribers/noop-transaction-recorded.subscriber.test.ts` | (1) El test pasa; (2) `pnpm typecheck` sale con 0. | `feat(reports-routes): noop transaction-recorded handler` | T-RPT-201 | pendiente |
| T-RPT-203 | GREEN: el composition root wirea el handler noop | reports-routes | `src/composition/build-app-deps.ts` (modificado, +5 líneas) | wiring | Añade `dispatcher.subscribe('TransactionRecorded', createNoopHandler(logger))` exactamente una vez en `buildAppDeps` después de que `buildReportsDeps` retorna. Según BR-RPT-5. | `pnpm test src/composition/build-app-deps.test.ts` (después de que T-RPT-205 aterrice) | (1) La aserción de conteo de suscriptores (T-RPT-205) pasa; (2) `pnpm typecheck` sale con 0. | `feat(reports-routes): composition-root wires noop handler exactly once` | T-RPT-202 | pendiente |
| T-RPT-204 | RED: aserción de conteo de suscriptores en `build-app-deps.test.ts` | reports-routes | `src/composition/build-app-deps.test.ts` (modificado, +30 líneas) | red | El test asegura `dispatcher.subscriberCount('TransactionRecorded') === before + 1` después de que `buildAppDeps()` retorna. El test falla porque o bien el accesor de conteo de suscriptores aún no existe (T-RPT-205) o bien el wireado (T-RPT-203) falta. | `pnpm test src/composition/build-app-deps.test.ts` | (1) El test falla; (2) `pnpm typecheck` sale con 0. | `test(reports-routes): subscriber-count assertion in build-app-deps.test.ts` | T-RPT-203 | pendiente |
| T-RPT-205 | GREEN: accesor de conteo de suscriptores en `EventDispatcher` (o adaptador solo de tests) | reports-routes | `src/shared/events/event-dispatcher.ts` (modificado, +1 método) OR `src/composition/build-app-deps.test.ts` (modificado, +5 línea adaptador) | green | El implementador elige el camino más liviano: (a) añadir un método `subscriberCount(type: DomainEventType): number` a `EventDispatcher` (cambio de código de producción, una sola línea); o (b) mantener el dispatcher privado y añadir un adaptador solo de tests dentro de `build-app-deps.test.ts` (código solo de tests, sin cambio en producción). El design §6.3 prefiere (a) pero marca (b) como aceptable. | `pnpm test src/composition/build-app-deps.test.ts` | (1) La aserción de conteo de suscriptores pasa; (2) sin cambio de comportamiento en la API pública del dispatcher más allá del accesor de conteo. | `feat(reports-routes): subscriberCount accessor on EventDispatcher` | T-RPT-204 | pendiente |
| T-RPT-206 | RED: test de integración `ReportsRepositoryPrisma` (testcontainers) | reports-routes | `src/modules/reports/infrastructure/repositories/reports.repository.prisma.test.ts` (nuevo) | red | Tests contra testcontainers Postgres (replica el patrón de transactions en `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.test.ts`). Se salta si no hay DB. Tests: (1) `findByUserAndMonth` delega a `TransactionRepositoryPort.list` con la ventana del mes UTC; (2) cross-user retorna `[]`; (3) `findByUserAccountAndRange` filtra por `accountId` + rango de fechas. El test falla porque el adapter no existe. | `pnpm test src/modules/reports/infrastructure/repositories/reports.repository.prisma.test.ts` | (1) El test pasa cuando la DB está disponible; (2) se salta limpiamente cuando no hay DB; (3) `pnpm typecheck` sale con 0. | `test(reports-routes): ReportsRepositoryPrisma integration test (testcontainers)` | T-RPT-003 | pendiente |
| T-RPT-207 | GREEN: implementar `ReportsRepositoryPrisma` | reports-routes | `src/modules/reports/infrastructure/repositories/reports.repository.prisma.ts` (nuevo) | green | Según §6.1 del design. Construye ventanas mensuales UTC vía `Date.UTC(year, month - 1, 1)` / `Date.UTC(year, month, 1)`. Delega a `TransactionRepositoryPort.list` + `AccountRepositoryPort.findById`. | `pnpm test src/modules/reports/infrastructure/repositories/reports.repository.prisma.test.ts` | (1) El test de integración pasa; (2) `pnpm typecheck` sale con 0. | `feat(reports-routes): ReportsRepositoryPrisma adapter` | T-RPT-206 | pendiente |
| T-RPT-208 | RED: test de integración Hono — 401 sin auth / 200 con seed / 400 mes inválido / 404 cross-user | reports-routes | `src/modules/reports/application/routes.test.ts` (nuevo) | red | Según §7.3 del design. El test monta `mountReportsRoutes(protectedApp, { reportsDeps: inMemoryDeps })` contra una instancia Hono en proceso; usa `honoApp.request(new Request(...))`. Cubre: (1) `GET /api/reports/monthly` 401 sin sesión; (2) `GET /api/reports/monthly?month=2026-06` 200 + forma correcta; (3) `GET /api/reports/monthly?month=foo` 400 `VALIDATION_ERROR`; (4) `GET /api/reports/breakdown?month=2026-06` 200; (5) `GET /api/reports/accounts/<cross-user-account>/flow` 404; (6) `GET /api/reports/accounts/<own-account>/flow?month=2026-06` 200; (7) rango > 366 días 400. El test falla porque `mountReportsRoutes` aún no se exporta. | `pnpm test src/modules/reports/application/routes.test.ts` | (1) Los 7 tests fallan; (2) `pnpm typecheck` sale con 0. | `test(reports-routes): Hono integration test — 401 / 200 / 400 / 404 paths` | T-RPT-104, T-RPT-110, T-RPT-111, T-RPT-107 | pendiente |
| T-RPT-209 | GREEN: implementar la factory `mountReportsRoutes(protectedApp, deps)` | reports-routes | `src/modules/reports/application/routes.ts` (modificado, factory exportada) | green | Según §7.2 del design. La factory monta las tres rutas en `protectedApp`. El composition root la llama en `createHonoApp` (T-RPT-210). `deps.reportsDeps` es opcional — replica el patrón de transactions para que las configuraciones legacy solo-cuentas sigan compilando. | `pnpm test src/modules/reports/application/routes.test.ts` | (1) Los 7 tests pasan; (2) `pnpm typecheck` sale con 0. | `feat(reports-routes): mountReportsRoutes factory + Hono integration test passes` | T-RPT-208 | pendiente |
| T-RPT-210 | WIRING + DOCS: montar rutas en `createHonoApp` + barrel del módulo + JSDoc inline en cada handler de ruta | reports-routes | `src/composition/create-hono-app.ts` (modificado, +3 líneas) · `src/modules/reports/index.ts` (nuevo) | wiring+docs | (1) `createHonoApp` llama a `mountReportsRoutes(protectedApp, { reportsDeps: deps.reportsDeps })` después del montaje de transactions y antes de `app.route('/', protectedApp)`. (2) `src/modules/reports/index.ts` reexporta `mountReportsRoutes`, `MountReportsRoutesDeps`, `ReportsActionDeps`, los tipos de los ports, los tipos de los agregados, los tipos de los DTOs. NO exporta el adapter Prisma, la fixture InMemory, ni el handler noop. (3) JSDoc inline en cada handler de ruta apuntando de vuelta a REQ-RPT-N. | `pnpm test src/modules/reports/application/routes.test.ts` `pnpm run typecheck` `pnpm run lint` | (1) `pnpm run build` sale con 0; (2) `pnpm run typecheck` sale con 0; (3) `pnpm test src/composition/build-app-deps.test.ts` pasa. | `feat(reports-routes): wire mount into createHonoApp + module barrel + inline JSDoc` | T-RPT-203, T-RPT-205, T-RPT-209 | pendiente |

### Slice 4 — `dashboard-ui` (8 tareas)

> Componentes presentacionales puros + una página RSC. Sin directivas
> `'use client'`; sin hooks de cliente.

| ID | Título | Slice | Archivo(s) | Tipo | Descripción | Comando de test | Aceptación | Commit | Dependencia | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-RPT-301 | RED: test de `report-types.ts` asegura formas del wire | dashboard-ui | `app/_lib/report-types.test.ts` (nuevo) | red | Tests aseguran que los tipos de wire coinciden con los DTOs de la capa de acción: `MonthlySummaryDTO` tiene `{ totals: MonthlyTotalsDTO[]; generatedAt: string }`; `CategoryBreakdownDTO` tiene `{ buckets: CategoryBucketDTO[]; generatedAt: string }`; `AccountFlowDTO` tiene `{ days: AccountFlowDayDTO[]; generatedAt: string }`. El test falla porque el archivo no existe. | `pnpm test app/_lib/report-types.test.ts` | (1) El test falla; (2) `pnpm typecheck` sale con 0. | `test(dashboard-ui): report-types wire shape test` | T-RPT-111 | pendiente |
| T-RPT-302 | GREEN: implementar `report-types.ts` (espejo de DTOs para RSC) | dashboard-ui | `app/_lib/report-types.ts` (nuevo) | green | Replica los DTOs de la capa de aplicación verbatim. Sin lógica, solo tipos para consumo del RSC. Replica `app/_lib/transaction-types.ts`. | `pnpm test app/_lib/report-types.test.ts` | (1) El test de forma del wire pasa; (2) los tipos coinciden con los DTOs de la capa de acción. | `feat(dashboard-ui): report-types.ts wire shapes` | T-RPT-301 | pendiente |
| T-RPT-303 | RED → GREEN: snapshot de `MonthlySummaryCard` (vacío + poblado) | dashboard-ui | `app/_components/dashboard-monthly-summary.tsx` (nuevo) · `app/_components/dashboard-monthly-summary.test.tsx` (nuevo) | red+green | Según §9.3 del design. Server Component. Dos tests de snapshot: `totals: []` vacío (asegura "Sin datos" + "Resumen mensual" en HTML) y poblado (dos filas, ARS + USD, asegurando la forma del `<table>` y la etiqueta del mes UTC). RED primero, luego GREEN. | `pnpm test app/_components/dashboard-monthly-summary.test.tsx` | (1) Ambos snapshots pasan; (2) la etiqueta UTC aparece en el HTML renderizado; (3) `pnpm typecheck` sale con 0. | `feat(dashboard-ui): MonthlySummaryCard with empty + populated snapshots` | T-RPT-302 | pendiente |
| T-RPT-304 | RED → GREEN: snapshot de `CategoryBreakdownCard` (vacío + poblado, ordenado DESC) | dashboard-ui | `app/_components/dashboard-category-breakdown.tsx` (nuevo) · `app/_components/dashboard-category-breakdown.test.tsx` (nuevo) | red+green | Server Component. Renderiza la tabla de buckets ordenada por `amountMinor DESC`. Dos snapshots: vacío + poblado (3 buckets, asegura el orden de ordenamiento). | `pnpm test app/_components/dashboard-category-breakdown.test.tsx` | (1) Ambos snapshots pasan; (2) orden de ordenamiento asegurado; (3) `pnpm typecheck` sale con 0. | `feat(dashboard-ui): CategoryBreakdownCard with empty + populated snapshots` | T-RPT-302 | pendiente |
| T-RPT-305 | RED → GREEN: snapshot de `AccountFlowCard` (siempre vacío en v1) | dashboard-ui | `app/_components/dashboard-account-flow.tsx` (nuevo) · `app/_components/dashboard-account-flow.test.tsx` (nuevo) | red+green | Server Component. v1 siempre renderiza vacío (`days: []`) porque el dashboard NO deep-linkea a una cuenta en v1. Único test de snapshot asegura el estado vacío "Sin datos". | `pnpm test app/_components/dashboard-account-flow.test.tsx` | (1) El snapshot pasa; (2) `pnpm typecheck` sale con 0. | `feat(dashboard-ui): AccountFlowCard empty snapshot (v1 does not deep-link)` | T-RPT-302 | pendiente |
| T-RPT-306 | RED: `app/dashboard/page.test.tsx` — snapshots de fixture vacío + con seed | dashboard-ui | `app/dashboard/page.test.tsx` (nuevo) | red | Tests usan una fixture que inyecta una sesión + tres DTOs pre-sembrados (`MonthlySummaryDTO`, `CategoryBreakdownDTO`, `AccountFlowDTO`). Dos snapshots: usuario vacío (tres tarjetas "Sin datos" + CTA) y usuario con seed (tres tarjetas pobladas). El test falla porque `page.tsx` no existe. | `pnpm test app/dashboard/page.test.tsx` | (1) El test falla; (2) `pnpm typecheck` sale con 0. | `test(dashboard-ui): dashboard page empty + seeded snapshot test` | T-RPT-303, T-RPT-304, T-RPT-305 | pendiente |
| T-RPT-307 | GREEN: implementar `app/dashboard/page.tsx` RSC | dashboard-ui | `app/dashboard/page.tsx` (nuevo) | green | Según §9.2 del design. RSC, `force-dynamic`. Resuelve la sesión vía `auth()`; llama a `/api/reports/monthly` y `/api/reports/breakdown` en paralelo vía `serverHonoRequest`; renderiza las tres tarjetas o el CTA de estado vacío. Cada tarjeta muestra la etiqueta "(UTC)". El CTA linkea a `/transactions/new`. | `pnpm test app/dashboard/page.test.tsx` | (1) Ambos snapshots pasan; (2) `pnpm run build` sale con 0; (3) `pnpm typecheck` sale con 0. | `feat(dashboard-ui): app/dashboard/page.tsx RSC with three-card grid + empty CTA` | T-RPT-306 | pendiente |
| T-RPT-308 | DOCS: mostrar etiqueta "(UTC)" en cada tarjeta; CTA linkeando a `/transactions/new` | dashboard-ui | `app/_components/dashboard-monthly-summary.tsx` (modificado, +2 líneas) · `app/_components/dashboard-category-breakdown.tsx` (modificado, +2 líneas) · `app/_components/dashboard-account-flow.tsx` (modificado, +2 líneas) · `app/dashboard/page.tsx` (modificado, +1 línea) | docs | Comentarios inline en cada tarjeta explicando la decisión de bucketing "(UTC)" (según design §3.6 y BR-RPT-3). El CTA ya linkea a `/transactions/new` según §9.2; la tarea de docs confirma que el link está en su lugar. | `pnpm test app/dashboard/page.test.tsx` `pnpm test app/_components/dashboard-*.test.tsx` | (1) La etiqueta UTC aparece en los snapshots de las tres tarjetas; (2) el link del CTA es `/transactions/new`; (3) `pnpm typecheck` sale con 0. | `docs(dashboard-ui): surface (UTC) label on each card + CTA doc comment` | T-RPT-307 | pendiente |

---

## Resumen por slice

| Slice | Branch | Tareas | Rango LoC | Título de PR (conventional) | Compuerta de verificación | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| 1 — `reports-domain` | `feat/reports-1-domain` | 12 (4 red, 5 green, 1 red+green, 1 triangulate, 1 infra) | 180–280 | `feat(reports-domain): add reports domain layer (aggregates, ports, errors, value objects)` | `pnpm test src/modules/reports/domain` sale con 0; cobertura ≥ 80% | `git revert <merge-sha>` (la eliminación del puerto del kernel no rompe nada; solo `reports` lo importa) |
| 2 — `reports-application` | `feat/reports-2-application` | 12 (5 red, 6 green, 1 red+green, 1 triangulate) | 220–340 | `feat(reports-application): add reports application layer (schemas, actions, DTOs, fixtures)` | `pnpm test src/modules/reports/application` sale con 0; cobertura ≥ 80% | `git revert <merge-sha>` (la capa de aplicación es aditiva; sin consumidores hasta slice 3) |
| 3 — `reports-routes` | `feat/reports-3-routes` | 10 (4 red, 4 green, 1 wiring, 1 wiring+docs) | 160–260 | `feat(reports-routes): wire reports routes + composition root + noop subscriber` | `pnpm test src/modules/reports/application/routes.test.ts` sale con 0; `pnpm test src/composition/build-app-deps.test.ts` sale con 0 con la aserción de conteo de suscriptores | `git revert <merge-sha>` (las rutas son aditivas; sin consumidores hasta slice 4) |
| 4 — `dashboard-ui` | `feat/reports-4-dashboard-ui` | 8 (3 red, 4 green, 1 red+green, 1 docs) | 200–320 | `feat(dashboard-ui): add dashboard RSC with three reports cards + empty CTA` | `pnpm test app/_components/dashboard-*.test.tsx app/dashboard/page.test.tsx` sale con 0; smoke manual con `pnpm dev` | `git revert <merge-sha>` (la ruta del dashboard es aditiva; 404s si se visita cuando se revierte el slice) |
| **Total** | — | **42** | **760–1200** | — | — | — |

---

## Pronóstico (consumido por el Review Workload Guard del orquestador)

```
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low (per slice) · High (collapsed)
```

- **PRs encadenados recomendados**: Sí
- **Riesgo de presupuesto 400 líneas por slice**: Bajo (la banda de LoC de cada slice queda por debajo de 400 adiciones netas)
- **Riesgo de presupuesto 400 líneas si se colapsa en un único PR**: Alto (760–1200 LoC)
- **Decisión necesaria antes de apply**: No (alcance bloqueado en design §10)
- **Nombres de branch por slice**: `feat/reports-1-domain`, `feat/reports-2-application`, `feat/reports-3-routes`, `feat/reports-4-dashboard-ui`
- **Títulos de PR por slice** (forma conventional commit):
  - Slice 1: `feat(reports-domain): add reports domain layer (aggregates, ports, errors, value objects)`
  - Slice 2: `feat(reports-application): add reports application layer (schemas, actions, DTOs, fixtures)`
  - Slice 3: `feat(reports-routes): wire reports routes + composition root + noop subscriber`
  - Slice 4: `feat(dashboard-ui): add dashboard RSC with three reports cards + empty CTA`
- **Compuerta de verificación por slice** (los comandos de test que deben pasar):
  - Slice 1: `pnpm test src/modules/reports/domain` (cobertura ≥ 80%)
  - Slice 2: `pnpm test src/modules/reports/application` (cobertura ≥ 80%)
  - Slice 3: `pnpm test src/modules/reports/application/routes.test.ts` + `pnpm test src/composition/build-app-deps.test.ts` (aserción de conteo de suscriptores)
  - Slice 4: `pnpm test app/_components/dashboard-*.test.tsx app/dashboard/page.test.tsx` (tests de snapshot) + smoke manual con `pnpm dev`
- **Estrategia de rollback**: `git revert <merge-sha>` por slice. Cada slice es aditivo; el rollback elimina solo los cambios de ese slice.

---

## Disciplina de TDD estricto (guardas por slice)

- Cada tarea `green` está precedida por una tarea `red` coincidente en el mismo slice (ver T-RPT-005→006, T-RPT-101→102, T-RPT-103→104, T-RPT-108→109, T-RPT-201→202, T-RPT-204→205, T-RPT-206→207, T-RPT-208→209, T-RPT-301→302, T-RPT-306→307).
- Cada tarea codificadora de comportamiento tiene un paso `triangulate` (T-RPT-007, T-RPT-112).
- El test RED corre y FALLA por la razón correcta ("cannot find module" / "feature missing", no un typo). La tarea GREEN corre y PASA sin romper los tests existentes.
- `pnpm run typecheck` sale con 0 en cada límite de commit (TypeScript modo strict; sin `any`).
- `pnpm run lint` sale con 0 en cada límite de commit (max-warnings 0).
- `pnpm run build` sale con 0 antes de que cada PR se abra.

---

## Riesgos cross-cutting (señalados para el worker de apply)

1. **BRs transportadas por referencia** (design §12.1). El spec conserva BR-ACC-12, BR-TX-4, BR-TX-7, BR-TX-9 por **referencia** en lugar de inlinear su texto. Esta es una convención intencional (replica el archive de transactions). Se señala para que el revisor no lo marque como drift.
2. **Límite superior de rango 366 días** (design §12.2). El esquema Zod NO enforce el cap de 366 días — es una verificación a nivel de servicio dentro de `getAccountFlowAction`. El worker de apply DEBE añadir la aserción en T-RPT-110.
3. **Regex cuid sobre `accountId`** (design §12.3, corrección #1 del orquestador). El esquema Zod en `account-flow-query.schema.ts` valida `accountId` con `/^c[a-z0-9]{20,32}$/`. La factory en `account-flow.ts` también enforce la regex (defense in depth).
4. **El suscriptor noop podría enmascarar un bug de wireado** (design §12.5). La aserción de conteo de suscriptores en `build-app-deps.test.ts` (T-RPT-204/205) es la única red de seguridad.
5. **Riesgo de TDD estricto** (design §12.6). El worker de apply DEBE observar cada test RED fallar antes de escribir la implementación GREEN. La plantilla de PR (`.github/pull_request_template.md`) requiere que el revisor confirme que el commit RED aterrizó antes del commit GREEN.
6. **Centinela de cero-cuentas** (design §12.7). `GET /api/reports/monthly` retorna `200 { totals: [] }` para un usuario sin cuentas (NO 404). La rama de estado vacío del dashboard maneja cero-cuentas y cero-transacciones de forma uniforme.
7. **Normalización del barrel público** (design §12.8). `src/modules/reports/index.ts` es la superficie pública; el módulo de transactions usa `src/modules/transactions/application/index.ts`. Fuera de alcance para v1; se señala para que el revisor no lo marque como inconsistencia.

---

## Prerrequisitos de infraestructura de tests

Antes de que cualquier tarea del slice 1 pueda aterrizar, deben existir los siguientes seams de tests. Cada entrada cita el archivo:línea donde vive el patrón existente.

| Prerrequisito | Dónde vive hoy | Qué tarea lo crea |
| --- | --- | --- |
| `InMemoryTransactionRepository` (usada por la composición de fixtures del slice 2) | `src/modules/transactions/infrastructure/fixtures/in-memory-transaction.repository.ts` | Sin archivo nuevo; importada directamente por T-RPT-107. |
| Importación de `systemClock` para inyección de `Clock` en tests | `src/shared/clock/system-clock.ts` | Importada directamente en T-RPT-005/006; sin setup nuevo. |
| Accesor `EventDispatcher.subscriberCount` o adaptador solo de tests | No existe hoy. `src/shared/events/event-dispatcher.ts:55-84` expone `subscribers` como un mapa privado. | T-RPT-205 (el implementador elige el camino más liviano). |
| Helper `asPrismaDelegateView` para el adapter Prisma | `src/shared/db/prisma-types.ts` | Importado directamente en T-RPT-207; sin setup nuevo. |
| `react-dom/server.renderToStaticMarkup` para tests de snapshot | Ya es dev-dependency según `package.json` | Importado directamente en T-RPT-303/304/305/306; sin setup nuevo. |
| Fixture de testcontainers Postgres (para el test del repositorio Prisma) | El test del repositorio Prisma de `accounts` usa una fixture similar en `src/modules/accounts/infrastructure/repositories/account.repository.prisma.migration.test.ts` | Reusar la fixture existente de `account.repository.prisma.migration.test.ts` (copiar el helper en T-RPT-206). |

---

## Preguntas abiertas para el worker de apply

Ninguna. Las cinco preguntas del design bloqueadas en la sesión pre-design (proposal §"Open questions" Q1-Q5) están codificadas en el spec y el design las transporta verbatim. Las tres correcciones del orquestador (regex cuid, BRs transportadas, 366 días) están horneadas en las tareas sin renegociación.
