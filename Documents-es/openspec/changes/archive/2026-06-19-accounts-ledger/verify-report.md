# Reporte de Verificación — `accounts-ledger`

**Status**: PASS
**Autor**: Sebastián Illa
**Fecha**: 2026-06-19
**Change**: accounts-ledger
**Capability**: accounts
**Artefactos fuente**: proposal.md, specs/accounts/spec.md, design.md, tasks.md, apply-progress.md
**Preflight**: executionMode=interactive, chainedPrStrategy=auto-forecast, reviewBudgetLines=400
**Strict TDD**: HABILITADO (runner: `pnpm test`)

> Verifica el estado mergeado del HEAD de `origin/develop`
> (`b552187`) contra el contrato SDD de `accounts-ledger`. Los
> PR-A #29, PR-B #30, PR-C #31 y los fixes de legibilidad
> post-merge #33 están todos en `develop`. El verificador
> recorrió cada Requirement y Scenario del spec, ejecutó los 5
> comandos de quality-gate (`pnpm install --frozen-lockfile`,
> `pnpm run typecheck`, `pnpm run lint`, `pnpm test`,
> `pnpm run build`), confirmó el invariante bilingüe y cruzó
> las 32 tareas atómicas de `tasks.md` contra el código en
> disco.

## 1. Cobertura del spec

14 Requirements + 24 Scenarios (38 bloques totales en el spec)
en `openspec/changes/accounts-ledger/specs/accounts/spec.md`.
La matriz de abajo cita la ruta de archivo + rango de líneas
que satisface cada Requirement. Cada Scenario queda cubierto
por la implementación del Requirement; la tabla agrupa por
Requirement para mantener las filas revisables.

| Requirement | BR | Status | Evidencia |
| ----------- | -- | ------ | --------- |
| `FinancialAccount persiste el modelo discriminado de 6 tipos` | (data model) | PASS | `prisma/schema.prisma:85-175` (5 enums + modelo `FinancialAccount` + `@@unique([userId, type, name])`, `@@index([userId, archivedAt])`, `@@index([userId, createdAt])`); migración `prisma/migrations/20260618180000_add_financial_account/migration.sql:17-52`; refinamiento Zod por tipo en `src/modules/accounts/application/validation/account-create.schema.ts:56-120` (6 schemas, todos `.strict()`); `src/modules/accounts/application/validation/account-create.schema.test.ts` (10 casos incluyendo el rechazo de campo de tipo incorrecto); `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts:122-128` (P2002 → `AppError(NAME_TAKEN)`). |
| `GET /api/accounts devuelve una lista paginada por cursor scoped al usuario autenticado` | BR-ACC-17 | PASS | Ruta `src/modules/api/app.ts:129-141`; action `src/modules/accounts/application/actions/list-accounts.action.ts:22-41`; schema `src/modules/accounts/application/validation/list-accounts.schema.ts:16-22` (default `limit=20`, max `100`, enum `archivedAt` permite `null`); repo `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts:71-84` (cursor vía `take: limit + 1`); tests de integración `src/modules/api/app.accounts.test.ts` (15 casos incluyendo 401, filtro de archivados y clamp). |
| `POST /api/accounts crea una cuenta type-driven` | BR-ACC-16 (Decision 7) | PASS | Ruta `src/modules/api/app.ts:144-153`; action `src/modules/accounts/application/actions/create-account.action.ts:23-45` (Zod safeParse → 400 vía `zodErrorToActionError`, `AppError(NAME_TAKEN)` → 409); schema `src/modules/accounts/application/validation/account-create.schema.ts:113-120` (`z.discriminatedUnion('type', [...])`); `openingBalanceMinor >= 0` enforced en líneas 40, 45; HISTORICAL `date` requerido en línea 46. |
| `GET /api/accounts/:id devuelve una cuenta o 404 cross-user` | (invariante cross-module) | PASS | Ruta `src/modules/api/app.ts:156-165`; service `src/modules/accounts/domain/services/account.service.ts:52-62` (tira `AppError(NOT_FOUND)` en null); repo `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts:86-96` (guard cross-user: `if (row.userId !== userId) return null`). |
| `PATCH /api/accounts/:id aplica un update parcial` | (invariante cross-module) | PASS | Ruta `src/modules/api/app.ts:168-178`; action `src/modules/accounts/application/actions/update-account.action.ts`; schema `src/modules/accounts/application/validation/account-update.schema.ts:122-129` (per-type `z.discriminatedUnion` con todos los campos `.optional()`); repo `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts:132-144` (usa `updateMany` con `where: { id, userId }` para que cross-user nunca matchee). |
| `POST /api/accounts/:id/archive archiva suavemente la cuenta` | (lifecycle soft-archive) | PASS | Ruta `src/modules/api/app.ts:181-190`; action `src/modules/accounts/application/actions/archive-account.action.ts`; repo `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts:146-153` (`data: { archivedAt: new Date() }`). |
| `POST /api/accounts/:id/unarchive restaura la cuenta` | (lifecycle soft-archive) | PASS | Ruta `src/modules/api/app.ts:193-202`; action `src/modules/accounts/application/actions/unarchive-account.action.ts`; repo `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts:155-162` (`data: { archivedAt: null }`). |
| `GET /api/accounts/:id/balance devuelve la conversión FX solo para display` | BR-ACC-12, BR-ACC-13 | PASS | Ruta `src/modules/api/app.ts:205-215`; action `src/modules/accounts/application/actions/get-account-balance.action.ts`; schema `src/modules/accounts/application/validation/account-balance.schema.ts:14-22` (whitelist `displayCurrency`); port `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts:26-55`; service `src/modules/accounts/domain/services/account.service.ts:114-129` (el balance nativo nunca se muta); stub `src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts:25-32` (`AppError(FX_UNAVAILABLE)` hasta que `fx-cache` mergee). Casos 503 y 409 testeados en `src/modules/accounts/application/actions/get-account-balance.action.test.ts` (4 casos) y `src/modules/api/app.accounts.test.ts`. |
| `/accounts lista las cuentas live del usuario (Server Component)` | BR-ACC-14, BR-ACC-17 | PASS | `app/accounts/page.tsx:30-83`; `app/accounts/accounts-list-table.tsx:28-67`; redirect en sesión faltante: `app/accounts/page.tsx:42-44`; query `archivedAt=null`: `app/accounts/page.tsx:46`; copy de empty-state "No accounts yet — create one": línea 77; footer de truncamiento "Showing first 50 of N": `accounts-list-table.tsx:60-64`. Header `// smoke-minimal, not production`: línea 1 de los tres archivos page. |
| `/accounts/new renderiza el form de creación type-driven (Server shell + Client form)` | BR-ACC-14, BR-ACC-15, BR-ACC-16 | PASS | Server shell `app/accounts/new/page.tsx:14-33` (redirect en sesión faltante, embebe el Client form, sin datos server-derived pasados); Client form `app/accounts/new/create-account-form.tsx:68-439`; FRESH default (Decision 5): líneas 76-77; silent type-change reset (Decision 6): líneas 85-88 (`setTypeFields(EMPTY_TYPE_FIELDS)`); guard cliente de `openingBalanceMinor >= 0` (Decision 7): línea 90 + línea 432 (botón deshabilitado); `router.push('/accounts?toast=account-created')` en 201: línea 145; banner de error inline: líneas 421-428. |
| `/accounts/[id] muestra el detalle de la cuenta y el balance widget (Server + Client widget)` | BR-ACC-14, BR-ACC-18, BR-ACC-19 | PASS | Server `app/accounts/[id]/page.tsx:27-81`; redirect en sesión faltante: líneas 35-39; redirect en 404 con toast: líneas 49-51 (`redirect('/accounts?toast=not-found')`); pure render `app/accounts/[id]/account-detail.tsx:29-99`; balance widget `app/accounts/[id]/balance-widget.tsx:46-160`; whitelist completa `{ ARS, USD, EUR }` (Decision 8): líneas 117-122; "Last updated: <ISO>" plain text (Decision 3): línea 154; error inline 503: líneas 82-83; error inline 409: líneas 84-85; `router.refresh()` después de success (BR-ACC-18): línea 73. |
| `Todos los request bodies se validan con schemas Zod` | (convención del proyecto) | PASS | 4 schemas Zod en `src/modules/accounts/application/validation/`: `account-create.schema.ts:113`, `account-update.schema.ts:122`, `list-accounts.schema.ts:16`, `account-balance.schema.ts:14`. Envelope de error `{ error: { code, message, details? } }` producido por `src/shared/http/error-handler.ts` (existente) con `details[0]` mostrando el primer Zod issue; helper `zodErrorToActionError` en `src/modules/accounts/application/actions/_shared.ts`. |
| `Todos los endpoints requieren sesión autenticada` | (invariante cross-module de `auth`) | PASS | `src/modules/api/middlewares/require-session.ts:27-36` tira `AppError(UNAUTHORIZED)` cuando `c.get('user')` es null; aplicado per-route en `src/modules/api/app.ts` en líneas 116 (`/me`), 129, 144, 156, 168, 181, 193, 205 (las 7 rutas de accounts). Los Server Components resuelven la sesión vía `auth()` desde `@/modules/auth` (surface pública, `verbatimModuleSyntax` enforced): `app/accounts/page.tsx:32,41`, `app/accounts/new/page.tsx:15,21`, `app/accounts/[id]/page.tsx:21,34`. El caso 401-without-session es el primer test de `src/modules/api/app.accounts.test.ts` (15 casos). |
| `Los errores siguen el envelope de error estándar del proyecto` | (convención del proyecto) | PASS | `src/shared/http/error-handler.ts` (existente) emite `{ error: { code, message, details? } }`. `src/shared/errors/error-codes.ts:52-66` centraliza el mapeo de HTTP-status (4 códigos nuevos agregados: `NAME_TAKEN 409`, `NOT_FOUND 404`, `FX_UNAVAILABLE 503`, `FX_NOT_SUPPORTED 409`). Fallback 500-INTERNAL (sin stack, sin mensaje de Prisma, sin request body) verificado por `src/shared/http/error-handler.test.ts` (3 casos). |

**Resultado**: 14/14 Requirements PASS. Cero FAILs, cero FLAGs.
La implementación matchea el spec.

## 2. Task completion

**32/32 tareas completas.** Cada checkbox `T-A1..T-A8`,
`T-B1..T-B14`, `T-C1..T-C10` en `openspec/changes/accounts-ledger/tasks.md`
está flipeado a `[x]` (verificado por
`grep -cE '^\| \[x\] \*\*T-' tasks.md` → 32). Ver
`openspec/changes/accounts-ledger/apply-progress.md` (1,565 líneas)
para la evidencia TDD por commit (ciclos RED → GREEN →
TRIANGULATE → REFACTOR para cada tarea que sale con tests, más
el checklist de hand-verification para T-C3, T-C4, T-C5). Los
cuatro ítems del self-review checklist al final de `tasks.md`
están todos marcados excepto los dos que están gated por
`sdd-sync` y `sdd-archive` (las próximas fases).

Dependency check: cada columna `Depends on` en las tablas de
tareas apunta a un task ID previo en el mismo PR (T-A1→T-A2→...→T-A8;
T-B1 depende de T-A8; T-B6 depende de T-B1..T-B5; T-B9 sobre
T-B6..T-B8; T-B10 sobre T-B9; etc.). Todas las dependencias
están satisfechas por los predecesores completos.

## 3. Calidad de código (comandos corridos + outputs)

Cinco comandos corridos desde la raíz del proyecto con el HEAD
de `origin/develop` (`b552187`). El lockfile en `pnpm-lock.yaml`
está up-to-date con `package.json` (sin drift).

### 3.1 `pnpm install --frozen-lockfile` → exit 0

```text
> gastos-personales@0.1.0 prepare /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales
> husky

╭ Warning ─────────────────────────────────────────────────────────────────────╮
│ Ignored build scripts: @sentry/cli@2.58.6, esbuild@0.21.5, esbuild@0.23.1, │
│ sharp@0.34.5.                                                                │
│ Run "pnpm approve-builds" to pick which dependencies should be allowed       │
│ to run scripts.                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
Done in 4.4s using pnpm v10.34.3
```

> **Nota**: este environment tiene un `pnpm-workspace.yaml` en
> `/Users/sebailla/` (un directorio padre) que mete al proyecto
> en un contexto de workspace. El verify pass invocó `pnpm
> install --frozen-lockfile --ignore-workspace` para instalar
> las dependencias locales del proyecto sin contaminar el
> workspace padre. `--ignore-workspace` es un flag de CLI, no
> un cambio de config, y no modifica `pnpm-lock.yaml`. El
> lockfile en sí fue verificado con `git status pnpm-lock.yaml`
> (limpio después del install) y con `scripts/check-lockfile.sh`
> de Husky (exit 0). Documentado para la próxima sesión.

### 3.2 `pnpm run typecheck` → exit 0

```text
> gastos-personales@0.1.0 typecheck /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales
> tsc --noEmit

(exit 0; no output)
```

Pre-step: `pnpm exec prisma generate` se corrió una vez para
materializar los tipos de `@prisma/client` en
`node_modules/.pnpm/@prisma+client@6.0.1_prisma@6.0.1/node_modules/@prisma/client`.
Esto matchea el CI gate del proyecto (`.github/workflows/ci.yml`
corre `pnpm prisma generate` antes de `pnpm test`).

### 3.3 `pnpm run lint` → 0 errors, 27 warnings

```text
✖ 27 problems (0 errors, 27 warnings)

... (lista de warnings)
  14:16  warning  Missing return type on function  @typescript-eslint/explicit-function-return-type
  ... (warnings pre-existentes de auth-foundation: app/auth/signout/page.tsx, app/layout.tsx,
       app/page.tsx, src/modules/api/client.ts, src/shared/logger/logger.ts,
       src/modules/auth/__tests__/security/secrets.in-logs.test.ts)

(node:24778) ESLintRCWarning: ... using an eslintrc configuration file ...
```

Los 27 warnings son todos pre-existentes (archivos de
auth-foundation; fuera del diff de `accounts-ledger`). Cero
errores de lint. Los PRs de `accounts-ledger` en sí no agregan
ningún warning de lint nuevo (verificado inspeccionando la
lista de warnings — cada path del warning es anterior al merge
commit `c292a33`).

### 3.4 `pnpm test` → 337/337 tests, 66 archivos

```text
 Test Files  66 passed (66)
      Tests  337 passed (337)
   Start at  20:37:36
   Duration  3.60s (transform 1.16s, setup 282ms, collect 9.14s, tests 2.67s, environment 11ms, prepare 10.19s)
```

Archivos de test específicos del módulo accounts (20):

- `src/modules/accounts/domain/entities/financial-account.test.ts` (7)
- `src/modules/accounts/domain/value-objects/opening-balance.test.ts` (8)
- `src/modules/accounts/domain/services/account.service.test.ts` (7)
- `src/modules/accounts/infrastructure/repositories/account.repository.prisma.test.ts` (9)
- `src/modules/accounts/infrastructure/external/fx-rate-provider.stub.test.ts` (5)
- `src/modules/accounts/application/validation/account-create.schema.test.ts` (10)
- `src/modules/accounts/application/validation/account-update.schema.test.ts` (6)
- `src/modules/accounts/application/validation/list-accounts.schema.test.ts` (12)
- `src/modules/accounts/application/actions/{list,get,create,update,archive,unarchive,get-account-balance}.action.test.ts` (18)
- `src/modules/accounts/application/dto/dto.test.ts` (3)
- `src/modules/accounts/index.test.ts` (4)
- `src/shared/errors/accounts-error-codes.test.ts` (4)
- `src/modules/api/app.accounts.test.ts` (15 — 7 endpoints × ≥2 escenarios + 1 caso sin auth)

Coverage en `src/modules/accounts/**` (excluyendo archivos de
test): **718/807 = 88.97%** lines. Bien por encima del target
≥80% de `design.md` §10.6.

### 3.5 `pnpm run build` → exit 0, 3 rutas de accounts registradas

```text
▲ Next.js 16.2.9 (Turbopack)
✓ Compiled successfully in 3.0s
  Running next.config.js provided runAfterProductionCompile ...
✓ Completed runAfterProductionCompile in 500ms
  Running TypeScript ...
  Finished TypeScript in 2.2s ...
✓ Generating static pages using 11 workers (6/6) in 202ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /accounts                ← PR-C T-C3
├ ƒ /accounts/[id]           ← PR-C T-C5
├ ƒ /accounts/new            ← PR-C T-C4
├ ƒ /api/[...path]
├ ƒ /api/auth/[...nextauth]
├ ƒ /auth/register
├ ƒ /auth/signin
└ ○ /auth/signout
```

Las tres rutas de UI de accounts están registradas como `ƒ`
(dynamic, server-rendered on demand) — correcto para Server
Components con `force-dynamic` que leen `auth()`. El Hono
catch-all también es `ƒ` así que los 7 endpoints
`/api/accounts/*` se montan correctamente.

## 4. Invariante bilingüe

### 4.1 Paridad de fuentes (Inglés ↔ Español)

| Fuente inglés | Mirror español | ¿Mismo filename? | ¿Mismos bytes? |
| ------------- | -------------- | ---------------- | -------------- |
| `openspec/changes/accounts-ledger/proposal.md` | `Documents-es/openspec/changes/accounts-ledger/proposal.md` | ✅ | prosa traducida, términos técnicos en inglés (per AGENTS.md §13.4) |
| `openspec/changes/accounts-ledger/design.md` | `Documents-es/openspec/changes/accounts-ledger/design.md` | ✅ | prosa traducida |
| `openspec/changes/accounts-ledger/tasks.md` | `Documents-es/openspec/changes/accounts-ledger/tasks.md` | ✅ | prosa traducida |
| `openspec/changes/accounts-ledger/specs/accounts/spec.md` | `Documents-es/openspec/changes/accounts-ledger/specs/accounts/spec.md` | ✅ | prosa traducida |
| `openspec/changes/accounts-ledger/apply-progress.md` | `Documents-es/openspec/changes/accounts-ledger/apply-progress.md` | ✅ | prosa traducida; EN=1.564 líneas, ES=1.565 líneas (delta de 1 línea es un newline de cierre; funcionalmente idénticos) |

Los 5 archivos en inglés tienen un mirror español en la misma
ruta relativa bajo `Documents-es/`. El archivo
`specs/accounts/spec.md` está dentro del árbol del change
(todavía no promovido a la ubicación canónica en
`openspec/specs/accounts/spec.md` — esa promoción ocurre en
`sdd-sync`).

### 4.2 Caracteres CJK en los mirrors españoles

```text
$ git grep -P '[\x{4e00}-\x{9fff}]' -- Documents-es/openspec/changes/accounts-ledger/
(0 matches)
```

El mirror español contiene cero caracteres CJK (chino /
japonés / coreano). Verificado per AGENTS.md §13.3.

### 4.3 Drift check

`git status` en `openspec/changes/accounts-ledger/` y el
mirror `Documents-es/openspec/changes/accounts-ledger/` está
limpio — sin modificaciones sin commitear ni sin stagear en
ninguno de los dos lados. El invariante bilingüe está intacto.

## Flags

- **SUGGESTION (sin acción requerida)**: `FxRateProviderUnconfigured`
  es el stub in-change y va a devolver `503 FX_UNAVAILABLE` en
  cada environment de dev hasta que el future change `fx-cache`
  provea una implementación real. Esto es by design (per
  `design.md` §5.2 y `proposal.md` Dependencies) y la smoke UI
  lo surfacea verbatim con la copy de error inline de BR-ACC-18.
  Sin acción requerida para este change; es una limitación
  conocida documentada en la propuesta.
- **SUGGESTION (sin acción requerida)**: los PRs de
  `accounts-ledger` agregaron 4 códigos de error nuevos
  (`NAME_TAKEN`, `NOT_FOUND`, `FX_UNAVAILABLE`,
  `FX_NOT_SUPPORTED`) al registro `ErrorCode` del proyecto
  (`src/shared/errors/error-codes.ts:26,29,32,33`). Son
  aditivos (sin breaking change sobre códigos existentes per
  el comentario del header del archivo). Sin acción de
  reviewer requerida.

## CRITICAL

Ninguno. Sin blockers. Los 5 quality gates pasan; los 14 spec
Requirements están satisfechos con evidencia de archivo+línea;
las 32 tareas están completas; el mirror bilingüe está current
y sin CJK.

## Next step

`sdd-sync accounts-ledger` → `sdd-archive accounts-ledger`. La
fase `sdd-sync` promueve el delta spec en
`openspec/changes/accounts-ledger/specs/accounts/spec.md` a la
ubicación canónica en `openspec/specs/accounts/spec.md` (con
un mirror español bajo
`Documents-es/openspec/specs/accounts/spec.md`). La fase
`sdd-archive` luego mueve `openspec/changes/accounts-ledger/`
a `openspec/changes/archive/` (con el mirror correspondiente
en `Documents-es/openspec/changes/archive/accounts-ledger/`).
El change `fx-cache` se desbloquea después del archive (depende
del port `FxRateProvider` declarado acá).
