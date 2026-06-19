# Tareas — `accounts-ledger`

**Autor**: Sebastián Illa
**Cambio**: `accounts-ledger`
**Capacidad**: `accounts` (nueva — primera escritura del spec + design)
**Estado**: draft · **Creado**: 2026-06-18
**Artefactos fuente**: `openspec/changes/accounts-ledger/specs/accounts/spec.md` (14 Requirements, 8 BRs ACC-12..ACC-19) · `openspec/changes/accounts-ledger/design.md` (16 secciones, 5 DGs DG-D-1..DG-D-5) · `openspec/changes/accounts-ledger/proposal.md` (v3, draft)
**Valores de preflight**: interactive · `both` (OpenSpec + Engram) · `auto-forecast` · presupuesto de revisión 400 líneas
**TDD estricto**: habilitado según `openspec/config.yaml`; runner `pnpm test`; ciclo RED → GREEN → TRIANGULATE → REFACTOR
**Pronóstico**: ~1750 total (PR-A ~500 · PR-B ~700 · PR-C ~550). Los tres PRs superan la pauta de 400 líneas; la estrategia de PRs encadenados fue aceptada por el usuario (2026-06-18, design §14).

> Una tarea = un commit atómico. Cada commit aterriza un foco; el
> PR es el punto de revisión. El worker de apply marca `- [x]`
> a medida que aterrizan los commits; el orquestador verifica que
> CI pase en verde y que los Requirements del spec estén cubiertos
> antes de abrir el siguiente PR.

---

## Pronóstico de carga de revisión

| Campo                               | Valor                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Líneas estimadas modificadas        | ~1750 total (PR-A ~500, PR-B ~700, PR-C ~550)                                                       |
| Riesgo de presupuesto de 400 líneas | High (cada PR supera la pauta de 400 líneas)                                                        |
| PRs encadenados recomendados        | Yes                                                                                                 |
| División sugerida                   | PR-A (Prisma + dominio) → PR-B (Hono + acciones + tests) → PR-C (UI + Tailwind + espejo en español) |
| Estrategia de entrega               | auto-chain (el usuario aceptó el overage en modo interactivo el 2026-06-18)                         |
| Estrategia de cadena                | feature-branch-chain (cada PR se abre desde develop post-merge del PR anterior)                     |

```
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

> `Decision needed before apply: No` porque el usuario aceptó la
> estrategia de PRs encadenados en modo interactivo durante la
> fase de design. El orquestador decide basándose en este
> `tasks.md`; el usuario solo revisa los PRs. El worker de apply
> DEBE mostrar el `git diff --stat` por PR al momento de abrirlo
> para que el revisor vea la cuenta real de líneas.

---

## Objetivo

`sdd-apply` para `accounts-ledger` aterriza la capacidad `accounts` completa (canónica en `openspec/specs/accounts/spec.md` después del sync) en tres PRs encadenados contra `develop`:

- **PR-A** aterriza el modelo de Prisma + 5 enums + migración + la capa de dominio (enums, value object, esqueleto del service) + 2 nuevos códigos de error. El directorio del módulo `accounts` existe; el modelo de datos es la única superficie durable sobre la que se construyen los dos PRs siguientes.
- **PR-B** aterriza la capa de aplicación (7 acciones + 4 schemas de Zod) + la capa de infraestructura (adaptador de repositorio Prisma + stub de `FxRateProvider`) + las rutas Hono (7 endpoints + middleware `requireSession` + 2 códigos de error más) + tests de integración. La API está funcional end-to-end en este punto y `pnpm test` pasa en verde sobre la superficie de la API.
- **PR-C** aterriza el smoke UI (3 Server Components + 2 Client Components + cliente tipado de Hono + setup de Tailwind v4) + el espejo en español. Los criterios de aceptación verificables a mano del proposal (#4–#7) se cierran en este PR.

Después de que los tres PRs hagan merge en `develop`, el spec canónico aterriza en `openspec/specs/accounts/spec.md` vía `sdd-sync`, y `accounts-ledger` se archiva.

---

## Estructura de sub-slices

### PR-A — Prisma + dominio

- **Branch**: `feat/accounts-ledger-a`
- **Base**: `develop`
- **Alcance (in)**:
  - 5 nuevos enums en `prisma/schema.prisma`: `AccountType`, `AccountKind`, `InvestmentType`, `OpeningBalanceMode`, `AccountCurrency`.
  - Modelo `FinancialAccount` + 3 índices (`@@unique([userId, type, name])`, `@@index([userId, archivedAt])`, `@@index([userId, createdAt])`).
  - Migración de Prisma `add_financial_account` (generada por `pnpm prisma migrate dev`).
  - Capa de dominio: enums espejados en `src/modules/accounts/domain/entities/financial-account.ts` (sin import de Prisma), value object `OpeningBalance` con factories `fresh()` / `historical(date, amount)`, esqueleto de `AccountService` que depende de los dos ports (ports declarados como interfaces, no implementados aquí).
  - 2 nuevos códigos de error (`NAME_TAKEN 409`, `FX_UNAVAILABLE 503`) agregados al registro de errores del proyecto.
  - Tests unitarios para la capa de dominio (exhaustividad de enums, invariantes de `OpeningBalance`, esqueleto de `AccountService` con fakes).
- **Alcance (out)**: adaptador de repositorio Prisma, stub de FX, acciones, rutas Hono, schemas de Zod, páginas UI, setup de Tailwind. Todo eso va en PR-B o PR-C.
- **Archivos tocados** (paths concretos):
  - `prisma/schema.prisma` (+~50 líneas para enums + modelo + índices)
  - `prisma/migrations/<timestamp>_add_financial_account/migration.sql` (generado)
  - `src/modules/accounts/domain/entities/financial-account.ts` (nuevo, ~80 líneas)
  - `src/modules/accounts/domain/entities/financial-account.test.ts` (nuevo, ~60 líneas)
  - `src/modules/accounts/domain/entities/index.ts` (nuevo barrel, ~5 líneas)
  - `src/modules/accounts/domain/value-objects/opening-balance.ts` (nuevo, ~50 líneas)
  - `src/modules/accounts/domain/value-objects/opening-balance.test.ts` (nuevo, ~50 líneas)
  - `src/modules/accounts/domain/services/account.service.ts` (nuevo, ~80 líneas esqueleto)
  - `src/modules/accounts/domain/services/account.service.test.ts` (nuevo, ~60 líneas)
  - `src/modules/accounts/domain/interfaces/account.repository.port.ts` (nuevo, ~30 líneas)
  - `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts` (nuevo, ~25 líneas)
  - `src/shared/errors/error-codes.ts` (+2 códigos, ~10 líneas)
  - `src/shared/errors/error-status.ts` (si es archivo separado; +2 mappings, ~6 líneas)
  - `src/modules/accounts/index.ts` (nueva superficie pública, ~15 líneas)
- **Evidencia de TDD estricto requerida (por tarea)**: cada tarea sigue RED → GREEN → TRIANGULATE → REFACTOR. Los tests unitarios de dominio fallan primero (RED), se escribe el código fuente para que pasen (GREEN), se agrega un segundo test para triangular el límite (TRIANGULATE), luego una pasada de refactor con todos los tests aún en verde (REFACTOR). El target de cobertura del 80% aplica a `src/modules/accounts/**` medido al final de PR-A; el worker de apply DEBE re-ejecutar `pnpm test --coverage` y confirmarlo.
- **Aceptación (PR-A)**:

  ```bash
  pnpm prisma migrate dev --name add_financial_account
  # → migración aplicada, cliente generado actualizado
  pnpm test src/modules/accounts/
  # → todos los tests unitarios pasan
  pnpm test --coverage
  # → cobertura en src/modules/accounts/** ≥ 80% (líneas, branches, funciones, statements)
  pnpm run typecheck
  # → 0 errores (verbatimModuleSyntax enforced)
  pnpm run lint
  # → 0 errores (max-warnings 0)
  pnpm run build
  # → exit 0
  ```

- **Política de espejo en español**: este PR NO toca ningún Markdown user-facing más allá de los artefactos de planificación. No se requieren updates de `Documents-es/` en PR-A. Los archivos de planificación de OpenSpec (`proposal.md`, `spec.md`, `design.md`, este `tasks.md`) conservan sus espejos en `Documents-es/` existentes de las fases previas.

### PR-B — Hono + acciones + tests

- **Branch**: `feat/accounts-ledger-b`
- **Base**: `develop` (post-merge de PR-A)
- **Alcance (in)**:
  - Adaptador de repositorio Prisma implementando `AccountRepositoryPort` (testcontainers en CI; fake-Prisma en local según la convención de auth-foundation).
  - Stub `FxRateProviderUnconfigured` (siempre devuelve 503 `FX_UNAVAILABLE`; reemplazado por una implementación real cuando aterrice `fx-cache`).
  - 4 schemas de Zod: `account-create.schema.ts` (discriminated union sobre `type` con refinamientos por tipo, `openingBalanceMinor >= 0`, `openingBalanceDate` requerido sii HISTORICAL), `account-update.schema.ts` (partial del create), `list-accounts.schema.ts` (`?cursor`, `?limit 1..100`, `?archivedAt=null`), `account-balance.schema.ts` (`?displayCurrency`).
  - 7 acciones de aplicación: `list-accounts`, `get-account`, `create-account`, `update-account`, `archive-account`, `unarchive-account`, `get-account-balance`.
  - Factory de middleware `requireSession` en `src/modules/api/middlewares/require-session.ts` (reutilizable para capacidades futuras).
  - 2 códigos de error más (`FX_NOT_SUPPORTED 409`, `NOT_FOUND 404`).
  - 7 rutas Hono cableadas en `src/modules/api/app.ts` vía `createHonoApp()`.
  - Extensión de `HonoAppDeps`: `accountRepository` y `fxRateProvider` en la bolsa de deps; `buildDefaultDeps()` cablea el repo de Prisma + el stub de FX no configurado por default.
  - Tests de aplicación (7 acciones × fakes de los ports).
  - Tests de integración de la API en `src/modules/api/app.accounts.test.ts` (uno por endpoint: happy path + al menos un escenario de error según los Scenarios del spec).
  - Update del lockfile si aterriza alguna dep nueva (ej. un helper de Zod); commit atómico.
  - Espejo en español para el `apply-progress.md` de OpenSpec cuando el PR esté listo para mergear.
- **Alcance (out)**: páginas UI, setup de Tailwind, checklist de verificación manual. Todo va en PR-C.
- **Archivos tocados** (paths concretos):
  - `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts` (nuevo, ~150 líneas)
  - `src/modules/accounts/infrastructure/repositories/account.repository.prisma.test.ts` (nuevo, ~120 líneas, integración)
  - `src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts` (nuevo, ~25 líneas)
  - `src/modules/accounts/infrastructure/external/fx-rate-provider.stub.ts` (nuevo, ~50 líneas, fake de test)
  - `src/modules/accounts/application/validation/account-create.schema.ts` (nuevo, ~120 líneas)
  - `src/modules/accounts/application/validation/account-update.schema.ts` (nuevo, ~40 líneas)
  - `src/modules/accounts/application/validation/list-accounts.schema.ts` (nuevo, ~15 líneas)
  - `src/modules/accounts/application/validation/account-balance.schema.ts` (nuevo, ~10 líneas)
  - `src/modules/accounts/application/actions/list-accounts.action.ts` (nuevo, ~30 líneas)
  - `src/modules/accounts/application/actions/get-account.action.ts` (nuevo, ~25 líneas)
  - `src/modules/accounts/application/actions/create-account.action.ts` (nuevo, ~70 líneas)
  - `src/modules/accounts/application/actions/update-account.action.ts` (nuevo, ~40 líneas)
  - `src/modules/accounts/application/actions/archive-account.action.ts` (nuevo, ~20 líneas)
  - `src/modules/accounts/application/actions/unarchive-account.action.ts` (nuevo, ~20 líneas)
  - `src/modules/accounts/application/actions/get-account-balance.action.ts` (nuevo, ~30 líneas)
  - `src/modules/accounts/application/dto/financial-account.dto.ts` (nuevo, ~40 líneas)
  - `src/modules/accounts/application/dto/financial-account-balance.dto.ts` (nuevo, ~20 líneas)
  - `src/modules/accounts/application/actions/*.action.test.ts` (~7 archivos, ~25 líneas cada uno = ~175 líneas)
  - `src/modules/api/middlewares/require-session.ts` (nuevo, ~30 líneas)
  - `src/modules/api/middlewares/require-session.test.ts` (nuevo, ~40 líneas)
  - `src/modules/api/app.ts` (+7 rutas, ~120 líneas)
  - `src/modules/api/app.accounts.test.ts` (nuevo, ~250 líneas, integración)
  - `src/shared/errors/error-codes.ts` (+2 códigos, ~6 líneas)
  - `src/shared/errors/error-status.ts` (+2 mappings, ~4 líneas)
  - `pnpm-lock.yaml` (si hay alguna dep nueva)
- **Evidencia de TDD estricto requerida (por tarea)**: mismo ciclo RED → GREEN → TRIANGULATE → REFACTOR. El adaptador del repositorio usa testcontainers-Postgres en CI; local dev usa el mismo fake-Prisma que usan los tests de auth-foundation (ver `src/modules/auth/infrastructure/external/authjs.test.ts` para el patrón). Los tests de integración de la API usan `honoApp.request(request)` contra la instancia Hono in-process — no se requiere spawn de `next dev`.
- **Aceptación (PR-B)**:

  ```bash
  pnpm test src/modules/accounts/
  # → todos los tests unitarios + de aplicación pasan
  pnpm test src/modules/api/
  # → todos los tests de integración Hono pasan
  pnpm test --coverage
  # → cobertura en src/modules/accounts/** ≥ 80%
  pnpm run typecheck
  # → 0 errores
  pnpm run lint
  # → 0 errores
  pnpm run build
  # → exit 0
  # Verificación end-to-end manual (terminal del developer):
  pnpm dev
  curl -H "Cookie: authjs.session-token=<dev session>" http://localhost:3000/api/accounts
  # → 200 con lista paginada
  ```

- **Política de espejo en español**: el `apply-progress.md` de OpenSpec (archivo nuevo en este PR) se entrega con un espejo en `Documents-es/openspec/changes/accounts-ledger/apply-progress.md` en el mismo commit. El espejo es una traducción literal al español; los términos técnicos se mantienen en inglés.

### PR-C — Smoke UI + Tailwind v4

- **Branch**: `feat/accounts-ledger-c`
- **Base**: `develop` (post-merge de PR-B)
- **Alcance (in)**:
  - Setup de Tailwind v4: `pnpm add -D tailwindcss@^4.1.0 @tailwindcss/postcss@^4.1.0 postcss@^8.4.0`; `postcss.config.mjs` (raíz del proyecto) con el plugin `@tailwindcss/postcss`; `app/globals.css` (nuevo, directiva única `@import "tailwindcss";`, importado una vez en `app/layout.tsx`).
  - 3 Server Components:
    - `app/accounts/page.tsx` — vista de lista. Llama a `auth()` (redirect si falta sesión), llama a `GET /api/accounts?archivedAt=null&limit=50`, renderiza la tabla + footer "Showing first 50 of <total>" cuando `total > 50` + el empty state "No accounts yet — create one" + el link `<New account>`.
    - `app/accounts/new/page.tsx` — server shell que resuelve la sesión, renderiza el `<form>` y embebe el Client form component.
    - `app/accounts/[id]/page.tsx` — server detail. Llama a `auth()`, luego `GET /api/accounts/:id`; en 404 llama a `redirect('/accounts')` y muestra el toast "Account not found or no access"; en éxito renderiza la fila completa en un `<dl>` + embebe el Client balance widget.
  - 2 Client Components:
    - `app/accounts/new/create-account-form.tsx` — form dirigido por type; radio de `openingBalanceMode` con default `FRESH`; reset silencioso al cambiar `type`; validación `openingBalanceMinor >= 0` (espejo de Zod); `onSubmit` llama a `POST /api/accounts`; en 201 → `router.push('/accounts')` + dispara el evento de toast; en 4xx → banner de error inline; en 5xx → banner genérico "Something went wrong".
    - `app/accounts/[id]/balance-widget.tsx` — renderiza el balance nativo; el select con whitelist completa `{ ARS, USD, EUR }`; el submit dispara `GET /api/accounts/:id/balance?displayCurrency=…` y re-renderiza con `display.amount` + `display.fxRate` + `display.fxAsOf` (renderizado como "Last updated: …"); en 503 → error inline; en 409 → error inline.
  - 1 helper de cliente tipado: `src/lib/api-client.ts` (Hono `hc<AppType>` contra `process.env.NEXT_PUBLIC_API_URL`).
  - 1 helper de toast: `src/app/_components/ephemeral-toast.tsx` (`<div role="status">` con estado local, auto-dismiss a los 3 s; sin librería; sin context).
  - Cada Server Component lleva un comentario de cabecera `// smoke-minimal, not production`.
  - Lockfile + update de `package.json`; commit atómico.
  - Espejo en español para el chunk PR-C del `apply-progress.md` de OpenSpec.
- **Alcance (out)**: botones de edit / archive / unarchive en la UI; navigation shell; design system; auditoría de accesibilidad; tests de UI (el smoke slice se verifica a mano según el proposal).
- **Archivos tocados** (paths concretos):
  - `package.json` (deps de Tailwind)
  - `pnpm-lock.yaml` (lockfile, atómico con package.json)
  - `postcss.config.mjs` (nuevo, ~10 líneas)
  - `app/globals.css` (nuevo, ~5 líneas)
  - `app/layout.tsx` (+1 import para globals.css, ~1 línea)
  - `app/accounts/page.tsx` (nuevo, ~80 líneas)
  - `app/accounts/accounts-list-table.tsx` (nuevo, ~60 líneas, render puro)
  - `app/accounts/new/page.tsx` (nuevo, ~30 líneas, server shell)
  - `app/accounts/new/create-account-form.tsx` (nuevo, ~150 líneas, Client Component)
  - `app/accounts/[id]/page.tsx` (nuevo, ~50 líneas, server detail)
  - `app/accounts/[id]/account-detail.tsx` (nuevo, ~50 líneas, render puro)
  - `app/accounts/[id]/balance-widget.tsx` (nuevo, ~100 líneas, Client Component)
  - `app/_components/ephemeral-toast.tsx` (nuevo, ~30 líneas, Client Component)
  - `src/lib/api-client.ts` (nuevo, ~20 líneas)
- **Evidencia de TDD estricto requerida**: este PR es el smoke UI. Según el proposal y el design §10.5, la UI se **verifica a mano** (sin tests automatizados). El worker de apply documenta el checklist de verificación manual en el cuerpo del commit de handoff y vincula los screenshots / outputs de curl.
- **Aceptación (PR-C)**:

  ```bash
  pnpm install --frozen-lockfile
  # → exit 0 (lockfile coincide)
  pnpm run build
  # → exit 0 (build de producción de Next.js con Tailwind v4)
  pnpm test
  # → todos los tests siguen pasando (el setup de Tailwind no debe romper ningún test previo)
  pnpm run typecheck
  # → 0 errores
  pnpm run lint
  # → 0 errores
  # Verificación manual a mano (developer o PM):
  pnpm dev
  # 1. Sign in vía /auth/signin
  # 2. Visitar /accounts → ver el empty state O la lista
  # 3. Click "New account" → llenar form BANK → submit → ver toast + redirect a /accounts
  # 4. Abrir el detail de la cuenta nueva → submit balance widget con displayCurrency=USD
  #    → ver "Last updated: …" con error inline 503 (FxRateProvider está unconfigured)
  # 5. Limpiar la cookie → visitar /accounts → redirect a /auth/signin?callbackUrl=/accounts
  # 6. Visitar /accounts/<random-id> → redirect a /accounts con el toast "not found"
  ```

- **Política de espejo en español**: el chunk PR-C del `apply-progress.md` de OpenSpec se entrega con su espejo en `Documents-es/...` en el mismo commit. Ningún otro Markdown en inglés se toca en este PR.

---

## Tareas por PR

### PR-A — Prisma + dominio

| ID   | Título                                             | Alcance (RED → GREEN)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Archivos                                                                                                                                                                                                                 | Líneas                                                                                                                         | Depende de | Tests                          | Verificar                                                                                            | Mensaje de commit                                                             |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| T-A1 | Add 5 enums to Prisma schema                       | RED: escribir un test unitario que importe cada enum desde `prisma/client` y verifique exhaustividad. GREEN: agregar los 5 enums a `prisma/schema.prisma` con los valores de spec §"Enums". Correr `pnpm prisma format` para canonicalizar.                                                                                                                                                                                                                                                                                                                                                                                                                        | `prisma/schema.prisma`                                                                                                                                                                                                   | ~25                                                                                                                            | —          | 0 nuevos; 1 contract assertion | `pnpm prisma format` exit 0; `pnpm prisma validate` exit 0                                           | `feat(accounts): add 5 enums for FinancialAccount model`                      |
| T-A2 | Add `FinancialAccount` model + 3 indexes           | RED: un test de tipos de Prisma-client (compile-time) que verifique que el modelo `FinancialAccount` tiene los 12 campos + 3 índices del spec. GREEN: agregar el bloque del modelo a `prisma/schema.prisma` con los campos opcionales por tipo, FK a `User` con `onDelete: Cascade`, y los 3 índices.                                                                                                                                                                                                                                                                                                                                                              | `prisma/schema.prisma`                                                                                                                                                                                                   | ~60                                                                                                                            | T-A1       | 0 nuevos; compile-time         | `pnpm prisma validate` exit 0; `pnpm prisma generate` exit 0                                         | `feat(accounts): add FinancialAccount model with 3 indexes`                   |
| T-A3 | Generate + commit Prisma migration                 | RED: `pnpm prisma migrate dev --name add_financial_account --create-only` tiene éxito; el SQL se inspecciona. GREEN: aplicar la migración (`pnpm prisma migrate dev`); commitear el `migration.sql` generado y el cliente regenerado.                                                                                                                                                                                                                                                                                                                                                                                                                              | `prisma/migrations/<ts>_add_financial_account/migration.sql` (generado)                                                                                                                                                  | ~30                                                                                                                            | T-A2       | —                              | `pnpm prisma migrate status` reporta clean; `pnpm prisma studio` muestra la tabla `FinancialAccount` | `feat(accounts): add add_financial_account migration`                         |
| T-A4 | Domain enums + entity shape (no Prisma)            | RED: escribir `src/modules/accounts/domain/entities/financial-account.test.ts` con: (1) chequeo de exhaustividad de cada enum, (2) happy path de type-guard `isFinancialAccount(obj)` + 2 casos negativos. GREEN: crear el archivo con los 5 enums re-declarados (sin import de Prisma), la shape de `FinancialAccount` como `interface` de TypeScript, y el type-guard. TRIANGULATE: agregar un tercer caso negativo donde `archivedAt` es un `string` en vez de `Date                                                                                                                                                                                            | null`.                                                                                                                                                                                                                   | `src/modules/accounts/domain/entities/financial-account.ts` (nuevo) · `financial-account.test.ts` (nuevo) · `index.ts` (nuevo) | ~145       | T-A2                           | 7 casos (5 enum + 1 guard happy + 1 guard negative)                                                  | `pnpm test src/modules/accounts/domain/entities/` → 7 pass                    | `feat(accounts): domain enums + FinancialAccount type-guard` |
| T-A5 | `OpeningBalance` value object with factories       | RED: escribir `opening-balance.test.ts` con: (1) factory `fresh()` devuelve `{ mode: 'FRESH', amountMinor: <n>, date: null }`, (2) `historical(date, amount)` devuelve la shape HISTORICAL, (3) `amountMinor` negativo lanza, (4) `historical` con `date > now` lanza, (5) `historical` sin date lanza, (6) `historical` con `date` cuando mode es `FRESH` lanza (el caso `mode: 'FRESH', date: ...`). GREEN: implementar la discriminated union con dos factories estáticos y los validadores. TRIANGULATE: agregar un 7º caso donde `amountMinor` es exactamente `0` (límite, debe pasar).                                                                       | `src/modules/accounts/domain/value-objects/opening-balance.ts` (nuevo) · `opening-balance.test.ts` (nuevo)                                                                                                               | ~100                                                                                                                           | T-A4       | 7 casos                        | `pnpm test src/modules/accounts/domain/value-objects/` → 7 pass                                      | `feat(accounts): OpeningBalance value object with fresh/historical factories` |
| T-A6 | `AccountService` skeleton + 2 ports declared       | RED: escribir `account.service.test.ts` con: (1) `create(userId, input)` llama a `repo.create(userId, input)` y devuelve la fila, (2) `list(userId, opts)` llama a `repo.list(userId, opts)` y devuelve la página, (3) `getById(userId, id)` llama a `repo.findById(userId, id)` y lanza `NOT_FOUND` en `null`, (4) `getBalance(userId, id, displayCurrency)` llama a `fxRateProvider.getDisplayAmount(...)` y devuelve el resultado. Todo con fake repo + fake FX provider. GREEN: implementar la clase `AccountService` que depende de las dos interfaces de port. TRIANGULATE: agregar un 5º caso donde `getBalance` propaga `FX_UNAVAILABLE` desde el port FX. | `src/modules/accounts/domain/services/account.service.ts` (nuevo) · `account.service.test.ts` (nuevo) · `src/modules/accounts/domain/interfaces/account.repository.port.ts` (nuevo) · `fx-rate-provider.port.ts` (nuevo) | ~190                                                                                                                           | T-A5       | 5 casos                        | `pnpm test src/modules/accounts/domain/services/` → 5 pass                                           | `feat(accounts): AccountService skeleton + repository + FX provider ports`    |
| T-A7 | Add 2 error codes (`NAME_TAKEN`, `FX_UNAVAILABLE`) | RED: escribir un test que importe `ErrorCode` y verifique que existen las dos nuevas keys con los valores esperados. GREEN: agregar los códigos a `src/shared/errors/error-codes.ts` y el mapping de HTTP-status a `ErrorStatus` (o el equivalente). REFACTOR: ordenar las keys consistentemente con la convención existente.                                                                                                                                                                                                                                                                                                                                      | `src/shared/errors/error-codes.ts` (+2) · `src/shared/errors/error-status.ts` (+2)                                                                                                                                       | ~12                                                                                                                            | T-A6       | 1 caso (exhaustividad)         | `pnpm test src/shared/` → 1 pass; `pnpm run typecheck` → 0 errores                                   | `feat(shared): add NAME_TAKEN and FX_UNAVAILABLE error codes`                 |
| T-A8 | Public surface for the `accounts` module           | RED: un test compile-time que importe `AccountService`, `AccountType`, `AccountKind`, `InvestmentType`, `OpeningBalanceMode`, `AccountCurrency`, y los dos ports desde `@/modules/accounts` — todos deben resolver. GREEN: crear `src/modules/accounts/index.ts` que re-exporte la superficie pública (services, enums, ports). REFACTOR: dividir los exports en re-exports agrupados si el archivo es muy denso.                                                                                                                                                                                                                                                  | `src/modules/accounts/index.ts` (nuevo)                                                                                                                                                                                  | ~20                                                                                                                            | T-A7       | 1 caso (compile-time)          | `pnpm run typecheck` → 0 errores                                                                     | `feat(accounts): public surface exports`                                      |

Total PR-A: **8 tareas**, ~582 líneas (estimado), ~1.1× el pronóstico de diseño de 500 líneas; defendible porque los tests unitarios en T-A4..T-A6 son densos. Las tareas A4–A6 caben cada una en una sesión enfocada; las tareas A1–A3 y A7–A8 son más pequeñas.

### PR-B — Hono + acciones + tests

| ID    | Título                                                   | Alcance (RED → GREEN)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Archivos                                                                                                                                                               | Líneas | Depende de                   | Tests                                                             | Verificar                                                                        | Mensaje de commit                                                     |
| ----- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| T-B1  | Prisma repository adapter                                | RED: test de integración `account.repository.prisma.test.ts` con: (1) `create(userId, BANK input)` devuelve la fila con un `id` generado, (2) `findById(userId, id)` devuelve la fila, (3) `findById(otherUserId, id)` devuelve `null` (cross-user se filtra), (4) `list(userId, { archivedAt: null })` devuelve solo filas vivas, (5) duplicado `(userId, type, name)` devuelve P2002 (verificado vía mock `vi.fn()` para local dev; testcontainers para CI). GREEN: implementar `account.repository.prisma.ts` usando el prisma client. | `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts` (nuevo) · `account.repository.prisma.test.ts` (nuevo)                                  | ~270   | T-A8                         | 5 casos (4 happy + 1 dup)                                         | `pnpm test src/modules/accounts/infrastructure/repositories/` → 5 pass           | `feat(accounts): Prisma repository adapter with cross-user guard`     |
| T-B2  | `FxRateProviderUnconfigured` + test stub                 | RED: test unitario del stub: (1) `FxRateProviderUnconfigured` siempre lanza `AppError(FX_UNAVAILABLE)`, (2) el fake de test `FxRateProviderStub` devuelve el `FxConversionResult` configurado cuando se llama `setSuccess`, lanza `FX_UNAVAILABLE` cuando se llama `setUnavailable`, lanza `FX_NOT_SUPPORTED` cuando se llama `setNotSupported`. GREEN: implementar ambos.                                                                                                                                                                | `src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts` (nuevo) · `fx-rate-provider.stub.ts` (nuevo) · `fx-rate-provider.stub.test.ts` (nuevo) | ~110   | T-A7                         | 4 casos                                                           | `pnpm test src/modules/accounts/infrastructure/external/` → 4 pass               | `feat(accounts): FxRateProvider unconfigured stub + test fake`        |
| T-B3  | `account-create.schema.ts` (discriminated union)         | RED: 8 casos: (1) `BANK` válido con FRESH pasa, (2) `BANK` válido con HISTORICAL + date pasa, (3) `BANK` con `issuer` (campo de CREDIT) falla, (4) `CREDIT` con `bankName` (campo de BANK) falla, (5) `HISTORICAL` sin `date` falla, (6) `FRESH` con `date` no nulo falla, (7) `openingBalanceMinor` negativo falla, (8) falta `name` falla. GREEN: implementar la discriminated union de Zod con 6 schemas por tipo.                                                                                                                     | `src/modules/accounts/application/validation/account-create.schema.ts` (nuevo) · `account-create.schema.test.ts` (nuevo)                                               | ~150   | T-A5, T-A7                   | 8 casos                                                           | `pnpm test src/modules/accounts/application/validation/` → 8 pass                | `feat(accounts): Zod create schema with per-type discriminated union` |
| T-B4  | `account-update.schema.ts` (Zod partial)                 | RED: 4 casos: (1) partial de BANK pasa, (2) `type` no se puede cambiar (el schema requiere `type` solo en create, no en update; o sí lo requiere pero rechaza cambios a campos type-specific), (3) `openingBalanceMinor` negativo sigue fallando, (4) `name: ''` falla. GREEN: implementar el partial.                                                                                                                                                                                                                                    | `account-update.schema.ts` (nuevo) · `account-update.schema.test.ts` (nuevo)                                                                                           | ~70    | T-B3                         | 4 casos                                                           | `pnpm test src/modules/accounts/application/validation/` → 4 pass (acumulado 12) | `feat(accounts): Zod update schema (partial of create)`               |
| T-B5  | `list-accounts.schema.ts` + `account-balance.schema.ts`  | RED: 5 casos: (1) `limit=20` (default) pasa, (2) `limit=100` (max) pasa, (3) `limit=101` falla, (4) `limit=0` falla, (5) `displayCurrency=ARS` pasa; `displayCurrency=GBP` falla. GREEN: implementar ambos.                                                                                                                                                                                                                                                                                                                               | `list-accounts.schema.ts` (nuevo) · `account-balance.schema.ts` (nuevo) · `list-accounts.schema.test.ts` (nuevo)                                                       | ~60    | T-B3                         | 5 casos                                                           | `pnpm test src/modules/accounts/application/validation/` → 5 pass (acumulado 17) | `feat(accounts): Zod list and balance query schemas`                  |
| T-B6  | 7 application actions                                    | RED: 14 tests de aplicación (2 por acción): happy path + al menos un error (validación, NOT_FOUND, NAME_TAKEN, FX_UNAVAILABLE según la acción relevante). GREEN: implementar las 7 acciones en `src/modules/accounts/application/actions/`. Cada acción toma `deps` (la bolsa de ports) y devuelve una discriminated union `{ status, body }`. El user de sesión se lee en la capa Hono, no en la capa de acción.                                                                                                                         | 7 archivos de acción (nuevos, ~25–70 líneas cada uno = ~245 total) · 7 archivos de test de acción (nuevos, ~25 líneas cada uno = ~175 total)                           | ~420   | T-B1, T-B2, T-B3, T-B4, T-B5 | 14 casos                                                          | `pnpm test src/modules/accounts/application/` → 14 pass                          | `feat(accounts): 7 application actions with full TDD coverage`        |
| T-B7  | `requireSession` middleware factory                      | RED: 3 casos: (1) sesión presente → llama a `next()`, (2) sesión faltante → lanza `AppError(UNAUTHORIZED)`, (3) sesión presente con user `null` → lanza. GREEN: implementar la factory.                                                                                                                                                                                                                                                                                                                                                   | `src/modules/api/middlewares/require-session.ts` (nuevo) · `require-session.test.ts` (nuevo)                                                                           | ~70    | T-B6                         | 3 casos                                                           | `pnpm test src/modules/api/middlewares/` → 3 pass                                | `feat(api): requireSession middleware factory`                        |
| T-B8  | Add 2 more error codes (`FX_NOT_SUPPORTED`, `NOT_FOUND`) | RED: 1 test de exhaustividad (misma forma que T-A7). GREEN: agregar los códigos.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `src/shared/errors/error-codes.ts` (+2) · `src/shared/errors/error-status.ts` (+2)                                                                                     | ~10    | T-B7                         | 1 caso (acumulado 2)                                              | `pnpm test src/shared/` → 2 pass                                                 | `feat(shared): add FX_NOT_SUPPORTED and NOT_FOUND error codes`        |
| T-B9  | 7 Hono routes wired in `createHonoApp`                   | RED: 14 tests de integración en `src/modules/api/app.accounts.test.ts` (2 por endpoint: happy + error). GREEN: agregar las 7 rutas a `src/modules/api/app.ts` bajo el prefijo `/api/accounts`. Usar `requireSession` por ruta.                                                                                                                                                                                                                                                                                                            | `src/modules/api/app.ts` (+7 rutas, ~120 líneas) · `src/modules/api/app.accounts.test.ts` (nuevo, ~250 líneas)                                                         | ~370   | T-B6, T-B7, T-B8             | 14 casos                                                          | `pnpm test src/modules/api/` → 14 pass (acumulado 17)                            | `feat(api): 7 Hono routes for accounts with integration tests`        |
| T-B10 | `HonoAppDeps` extension + `buildDefaultDeps` wiring      | RED: un test de wiring que construya `createHonoApp({ accountRepository: fakeRepo, fxRateProvider: FxRateProviderUnconfigured })` y verifique que las 7 rutas dispatchan a las deps correctas. GREEN: extender `HonoAppDeps` (en `src/modules/api/app.ts` o `deps.ts`) con las dos keys nuevas; cablearlas en `buildDefaultDeps()` (el default de todo el proyecto que usa el Prisma client + el stub de FX no configurado).                                                                                                              | `src/modules/api/app.ts` (+~30 líneas para extensión de `HonoAppDeps` + `buildDefaultDeps`) · `app.deps.test.ts` (nuevo, ~50 líneas)                                   | ~80    | T-B9                         | 3 casos (uno por dep cableada + uno para el default unconfigured) | `pnpm test src/modules/api/` → acumulado 20 pass                                 | `feat(api): wire accountRepository and fxRateProvider in HonoAppDeps` |
| T-B11 | DTOs for response shape                                  | RED: 3 casos: (1) `toFinancialAccountDto(row)` devuelve el objeto shaped según spec, (2) `toBalanceDto(result)` devuelve el objeto shaped según spec incluyendo el array `warnings`, (3) `toBalanceDto` con `warnings: undefined` omite el campo. GREEN: implementar los 2 DTOs.                                                                                                                                                                                                                                                          | `src/modules/accounts/application/dto/financial-account.dto.ts` (nuevo) · `financial-account-balance.dto.ts` (nuevo) · `dto.test.ts` (nuevo)                           | ~70    | T-B6                         | 3 casos                                                           | `pnpm test src/modules/accounts/application/dto/` → 3 pass                       | `feat(accounts): response DTOs for accounts and balance`              |
| T-B12 | Lockfile + `package.json` update (if needed)             | Solo aterriza si PR-B trae una dep nueva (ej. un helper de Zod, un helper de testcontainers, o una extensión de Prisma). RED: un cambio de una línea en `package.json` + un diff en el lockfile. GREEN: `pnpm install --frozen-lockfile` exit 0.                                                                                                                                                                                                                                                                                          | `package.json` (si aplica) · `pnpm-lock.yaml` (atómico)                                                                                                                | ~5     | T-B10                        | —                                                                 | Husky pre-commit check `scripts/check-lockfile.sh` pasa                          | `chore(deps): add <dep> for accounts` (solo si es necesario)          |
| T-B13 | OpenSpec apply-progress chunk for PR-B                   | RED: ninguno (docs). GREEN: escribir `openspec/changes/accounts-ledger/apply-progress.md` cubriendo PR-B con la lista de tareas (T-B1..T-B13) y la evidencia de verificación (output de `pnpm test`, `pnpm run typecheck`, etc.). Actualizar el espejo en `Documents-es/.../apply-progress.md` en el mismo commit.                                                                                                                                                                                                                        | `openspec/changes/accounts-ledger/apply-progress.md` (nuevo) · `Documents-es/.../apply-progress.md` (nuevo)                                                            | ~80    | T-B11                        | —                                                                 | El archivo existe, el espejo existe, sin caracteres CJK en el espejo             | `docs(openspec): apply-progress for accounts-ledger PR-B`             |
| T-B14 | PR-B pre-merge gate (CI green)                           | RED: ninguno. GREEN: correr `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build` end-to-end. Capturar el output en la descripción del PR. Pushear la rama y `gh pr create --base develop --title "feat(accounts): API surface (PR-B)" --body-file .tmp/pr-b-body.md`.                                                                                                                                                                                                                                                     | Descripción del PR (`.tmp/`, intermedio según AGENTS.md §7)                                                                                                            | ~10    | T-B13                        | —                                                                 | Los 4 comandos exit 0; CI verde en los 4 jobs (lint, test, build, security)      | `chore(openspec): PR-B pre-merge evidence in apply-progress`          |

Total PR-B: **14 tareas**, ~1,755 líneas (estimado), ~2.5× el pronóstico de diseño de 700 líneas. El overage es real y está impulsado por los tests de integración densos en T-B1 (escenarios cross-user + unique-violation) y T-B9 (14 casos). El pronóstico de diseño fue un piso; el real se documenta aquí para que el revisor vea el número real.

### PR-C — Smoke UI + Tailwind v4

| ID    | Título                                                      | Alcance (RED → GREEN)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Archivos                                                                                                                               | Líneas | Depende de       | Tests                                 | Verificar                                                                                                   | Mensaje de commit                                                          |
| ----- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| T-C1  | Install Tailwind v4 + PostCSS                               | RED: un diff de `package.json` + un test de exit-0 de `pnpm install --frozen-lockfile`. GREEN: `pnpm add -D tailwindcss@^4.1.0 @tailwindcss/postcss@^4.1.0 postcss@^8.4.0`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `package.json` (+3 devDeps) · `pnpm-lock.yaml` (atómico)                                                                               | ~3     | T-B14            | —                                     | `pnpm install --frozen-lockfile` exit 0                                                                     | `chore(deps): add Tailwind v4 + @tailwindcss/postcss + postcss`            |
| T-C2  | `postcss.config.mjs` + `app/globals.css`                    | RED: un test de exit-0 de `next build` (el setup de Tailwind no debe romper el build). GREEN: crear `postcss.config.mjs` con el plugin `@tailwindcss/postcss`; crear `app/globals.css` con la directiva única `@import "tailwindcss";`; importar `app/globals.css` desde `app/layout.tsx`.                                                                                                                                                                                                                                                                                                                                                                         | `postcss.config.mjs` (nuevo) · `app/globals.css` (nuevo) · `app/layout.tsx` (+1 import)                                                | ~15    | T-C1             | —                                     | `pnpm run build` exit 0                                                                                     | `feat(ui): Tailwind v4 setup with @tailwindcss/postcss`                    |
| T-C3  | `app/accounts/page.tsx` (list Server Component)             | Verificado a mano (sin tests automatizados según design §10.5). RED: el dev corre `pnpm dev`, inicia sesión, visita `/accounts` con 0 cuentas → ve "No accounts yet — create one" + el link `<New account>`. Con 1+ cuentas → ve la tabla. Con >50 cuentas → ve el footer "Showing first 50 of <total>". GREEN: implementar la página usando `auth()` para la sesión + el cliente Hono tipado para la llamada a la API.                                                                                                                                                                                                                                            | `app/accounts/page.tsx` (nuevo) · `app/accounts/accounts-list-table.tsx` (nuevo)                                                       | ~140   | T-C2, T-C6       | 0 (verificado a mano)                 | `pnpm dev` → checklist manual pasa                                                                          | `feat(ui): accounts list page with empty state + truncation footer`        |
| T-C4  | `app/accounts/new/page.tsx` + `create-account-form.tsx`     | Verificado a mano. RED: el dev visita `/accounts/new`, elige `BANK`, llena `bankName` + `accountKind`, elige `CREDIT`, ve los campos de BANK resetearse silenciosamente, elige `CREDIT` de nuevo, llena los campos, elige `FRESH` (ya está por default), ingresa un `openingBalanceMinor` positivo, envía → ve el toast "Account created" + redirect a `/accounts` con la cuenta nueva en la lista. GREEN: implementar la página + el Client form con `useState` por campo, radio de `openingBalanceMode` con default `FRESH`, reset silencioso al cambiar `type`, validación client de `openingBalanceMinor >= 0`, post-201 → `router.push('/accounts')` + toast. | `app/accounts/new/page.tsx` (nuevo) · `app/accounts/new/create-account-form.tsx` (nuevo)                                               | ~180   | T-C3, T-C7       | 0 (verificado a mano)                 | Checklist manual pasa                                                                                       | `feat(ui): accounts create form with type-driven fields + ephemeral toast` |
| T-C5  | `app/accounts/[id]/page.tsx` + `balance-widget.tsx`         | Verificado a mano. RED: el dev visita `/accounts/<id>` para una cuenta real → ve el detail + el balance widget. Envía `displayCurrency=USD` contra una cuenta con `currency: USD` → ve el texto "Last updated: …" (o el error inline 503 si `fx-cache` no ha aterrizado). Visita `/accounts/<random-id>` → ve el toast "Account not found or no access" + redirect a `/accounts`. GREEN: implementar la página + el widget.                                                                                                                                                                                                                                        | `app/accounts/[id]/page.tsx` (nuevo) · `app/accounts/[id]/account-detail.tsx` (nuevo) · `app/accounts/[id]/balance-widget.tsx` (nuevo) | ~200   | T-C3, T-C6, T-C7 | 0 (verificado a mano)                 | Checklist manual pasa (3 casos: detail, 503 widget, 404 redirect)                                           | `feat(ui): account detail page + balance widget + 404 redirect`            |
| T-C6  | Typed Hono client `src/lib/api-client.ts`                   | Verificado a mano (la type-safety es el test; si el cliente compila, los tipos son correctos). RED: un test compile-time que importe `apiClient` y verifique que `apiClient.api.accounts.$get(...)` resuelve. GREEN: implementar `apiClient = hc<AppType>(process.env.NEXT_PUBLIC_API_URL)`.                                                                                                                                                                                                                                                                                                                                                                       | `src/lib/api-client.ts` (nuevo)                                                                                                        | ~25    | T-C2             | 0 (compile-time)                      | `pnpm run typecheck` → 0 errores                                                                            | `feat(ui): typed Hono client wrapper`                                      |
| T-C7  | `app/_components/ephemeral-toast.tsx`                       | Verificado a mano. RED: el dev ve el toast aparecer por ~3 s después de un create exitoso. GREEN: implementar el Client Component con estado local, auto-dismiss vía `setTimeout`, `role="status"` para accesibilidad (aunque el slice es smoke).                                                                                                                                                                                                                                                                                                                                                                                                                  | `app/_components/ephemeral-toast.tsx` (nuevo)                                                                                          | ~35    | T-C2             | 0 (verificado a mano)                 | Manual: el toast aparece por ~3 s y desaparece                                                              | `feat(ui): ephemeral toast component`                                      |
| T-C8  | `// smoke-minimal, not production` header comments          | RED: un test de grep que los 3 archivos Server Component (`app/accounts/page.tsx`, `app/accounts/new/page.tsx`, `app/accounts/[id]/page.tsx`) llevan el comentario en su primera línea. GREEN: agregar el comentario a cada uno.                                                                                                                                                                                                                                                                                                                                                                                                                                   | 3 archivos Server Component (+1 línea cada uno)                                                                                        | ~3     | T-C3, T-C4, T-C5 | 0 (test de grep de una línea, manual) | `grep -l "smoke-minimal, not production" app/accounts/*/page.tsx app/accounts/page.tsx` devuelve 3 archivos | `docs(ui): smoke-minimal header comments on the 3 pages`                   |
| T-C9  | OpenSpec apply-progress chunk for PR-C                      | RED: ninguno. GREEN: agregar el chunk de PR-C a `openspec/changes/accounts-ledger/apply-progress.md` (T-C1..T-C8 + el checklist de verificación manual). Actualizar el espejo en `Documents-es/.../apply-progress.md` en el mismo commit.                                                                                                                                                                                                                                                                                                                                                                                                                          | `openspec/changes/accounts-ledger/apply-progress.md` (+~40 líneas) · `Documents-es/.../apply-progress.md` (+~40 líneas)                | ~80    | T-C8             | —                                     | Los archivos existen, sin CJK en el espejo                                                                  | `docs(openspec): apply-progress for accounts-ledger PR-C`                  |
| T-C10 | PR-C pre-merge gate (CI green + hand-verification evidence) | RED: ninguno. GREEN: correr los 4 comandos + el checklist de verificación manual (evidencia de T-C3, T-C4, T-C5 capturada en el body del PR). Push + `gh pr create --base develop`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Body del PR (`.tmp/`, intermedio)                                                                                                      | ~10    | T-C9             | —                                     | Los 4 comandos exit 0; CI verde; checklist manual firmado                                                   | `chore(openspec): PR-C pre-merge evidence in apply-progress`               |

Total PR-C: **10 tareas**, ~691 líneas (estimado), ~1.25× el pronóstico de diseño de 550 líneas. El overage está en `balance-widget.tsx` (3 estados de error × 1 estado happy, denso) y `create-account-form.tsx` (6 sets de campos type-specific + el renderer de la discriminated union).

---

## Orden

```
PR-A (feat/accounts-ledger-a)  → develop
        ↓ merge a develop
PR-B (feat/accounts-ledger-b)  → develop
        ↓ merge a develop
PR-C (feat/accounts-ledger-c)  → develop
        ↓ merge a develop
sdd-verify → sdd-sync → sdd-archive
```

**Disciplina de branches (según root `AGENTS.md` §5.2):** cada PR se abre desde `develop` post-merge del PR anterior. No hay push directo a `develop`, ni cadena de worktrees reutilizados entre PRs. El path del worktree sigue la convención `../gastos-personales-accounts-ledger-a` (y `-b`, `-c`). `git worktree remove` corre después de que cada PR mergee.

**Disciplina del espejo en español (según root `AGENTS.md` §13):** cada PR que toca un Markdown fuente en inglés DEBE actualizar el espejo en `Documents-es/` en el MISMO commit. PR-A no toca ningún Markdown en inglés más allá de los artefactos de planificación (cuyos espejos ya existen); PR-B agrega `apply-progress.md` (con espejo); PR-C extiende `apply-progress.md` (con espejo). El `tasks.md` de OpenSpec se espeja una vez, al final de `sdd-tasks` (esta fase), no por PR.

---

## Concerns transversales

- **Disciplina del lockfile**: cada PR que toca `package.json` DEBE commitear `pnpm-lock.yaml` atómicamente. El pre-commit hook de Husky (`scripts/check-lockfile.sh` según `AGENTS.md` §5.3) falla el commit si `git status --short pnpm-lock.yaml` muestra un diff después de stagear `package.json`. PR-A no toca `package.json`; PR-B puede (T-B12); PR-C sí (T-C1).
- **Atribución de autor**: cada commit es authored por `Sebastián Illa` (sin `Co-authored-by: AI`, sin trailers `Generated by …` según `AGENTS.md` §4.5 y §12.2).
- **Invariante bilingüe**: cada fuente en inglés actualizada en un PR DEBE tener un espejo actual en `Documents-es/` actualizado en el mismo commit. El drift se detecta por la detección de drift de §13.3 en el siguiente commit que toque cualquier lado.
- **Pre-merge gate (cada PR)**: `pnpm test` + `pnpm run typecheck` + `pnpm run lint` + `pnpm run build` todos en verde. El workflow de CI (de `auth-foundation-slice-c` T-028) es el gate autoritativo desde PR-A en adelante; corre 4 jobs en paralelo (`lint`, `test`, `build`, `security`).
- **Evidencia de TDD estricto por tarea**: cada tarea es RED → GREEN → TRIANGULATE → REFACTOR. El worker de apply documenta el ciclo en el cuerpo del commit (una línea por fase, con el path del archivo de test y el nombre del test). La excepción es el smoke UI en PR-C, que se verifica a mano según el proposal y el design §10.5.
- **Invariantes cross-module de `auth`**: nunca redefinir la lectura de sesión; siempre llamar a `auth()` desde `@/modules/auth`; `FinancialAccount.userId === session.user.id` enforced en capas de action + repository; el setting `verbatimModuleSyntax: true` en `tsconfig.json` hace que cualquier import no público sea un error de build.
- **Hook GGA**: el pre-commit hook `gga run` es parte del dev loop según la convención de auth-foundation; en este entorno `openrouter` no está configurado, por lo que GGA falla en la capa del harness (ver `AGENTS.md` §2.6). La verificación on-disk (`pnpm test` + `pnpm run typecheck` + `pnpm run lint` + `pnpm run build`) es el gate; CI es el gate autoritativo.
- **Overage de líneas por PR**: 3 de 3 PRs superan la pauta de 400 líneas. El usuario ha aceptado la estrategia de PRs encadenados en modo interactivo (2026-06-18). El worker de apply DEBE mostrar `git diff --stat` al abrir el PR para que el revisor vea los números reales.

---

## Lista de auto-revisión (fase apply, se llena a medida que aterrizan los commits)

- [ ] PR-A: 8 tareas completas; T-A1..T-A8 marcados `[x]`; CI verde; spec §3 (data model) requirements satisfechos; cobertura en `src/modules/accounts/**` ≥ 80%
- [ ] PR-B: 14 tareas completas; T-B1..T-B14 marcados `[x]`; CI verde; spec §4 (endpoints) requirements satisfechos; 17+ tests de integración Hono pasan
- [ ] PR-C: 10 tareas completas; T-C1..T-C10 marcados `[x]`; CI verde; spec §6 (UI smoke slice) requirements satisfechos; checklist de verificación manual (T-C3, T-C4, T-C5) firmado; `pnpm install --frozen-lockfile` exit 0
- [ ] `Documents-es/openspec/changes/accounts-ledger/apply-progress.md` espeja la fuente en inglés en cada merge de PR
- [ ] `openspec/specs/accounts/spec.md` aterriza vía `sdd-sync` después de que PR-C mergee
- [ ] `accounts-ledger` se archiva vía `sdd-archive` después de `sdd-sync`

---

## Próxima fase

`sdd-apply` (un worker por PR, secuencial según la cadena de arriba). El orquestador lanza el worker de cada PR desde un worktree fresco; el worker implementa la tabla de tareas de arriba hacia abajo, corre el bloque de verificación al final de cada tarea, y emite el handoff con el `git diff --stat` por PR y la URL de CI.
