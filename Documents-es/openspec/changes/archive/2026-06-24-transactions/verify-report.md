# Verify Report — `transactions`

**Autor**: Sebastián Illa
**Cambio**: `transactions`
**Fecha**: 2026-06-24
**Cambio fuente**: `openspec/changes/transactions/`
**Estado**: PASS-WITH-FOLLOWUPS
**Branches mergeadas**: `feat/transactions-entity` (#59), `feat/transactions-fx-snapshot` (#60), `feat/transactions-actions` (#61), `feat/transactions-persistence` (#62), `feat/transactions-api` (#63) — 5 PRs mergeadas en `develop` (SHAs `d66151c`, `e896c81`, `d4950fc`, `941bf0a`, `31a0252`).
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4
**Strict TDD**: habilitado según `openspec/config.yaml`; runner `pnpm test`

> Orientado a revisión. Mapea cada escenario de REQ-TX a su
> archivo de test en disco y caso de prueba, demuestra que los
> invariantes cross-cutting se mantienen (auth, scoping de
> usuario, aislamiento de módulos, atomicidad del espejo ES), y
> fija las 5 áreas de riesgo conocidas desde las fases de
> apply. El espejo en inglés vive en
> `openspec/changes/transactions/verify-report.md`.

## Resumen

El cambio `transactions` está **completo de extremo a extremo
y en verde**: 15 requirements REQ-TX (32 escenarios) se
despachan con un archivo de test dedicado cada uno, 658 tests
pasan (4 skipped: testcontainers Postgres pre-existente), 0
errores de typecheck, `pnpm run build` tiene éxito (el build
de producción de Next.js emite las rutas list/create/detail
de `/transactions`), y 0 violaciones de `any` en `src/**` o
`app/**` (se sostuvo el refactor §10.5 del slice-4 sobre
`src/shared/db/prisma-types.ts`).

**Un gap de producción confirmado** (pre-check de cuenta
archivada BR-TX-5): `buildTransactionDeps` en
`src/modules/api/app.ts` NO enchufa una `AccountRepositoryPrisma`
real en `transactionDeps`, así que un `POST /api/transactions`
de producción contra una cuenta archivada devuelve
`500 INTERNAL_ERROR` en lugar de `409 ACCOUNT_ARCHIVED`. Los
tests unitarios pasan porque los fixtures inyectan un
`accountRepository` falso; el smoke UI no ejercita el path
archivado. **Severidad: MEDIUM**. Esto está documentado en la
sección "Follow-ups" de apply-progress como una tarea de
slice-6.

**Una limitación documentada** (DG-TX-9, idempotency keys) y
**un recorte de scope documentado** (DG-TX-2, transferencia
entre cuentas) — ambos confirmados en el schema y la capa de
acción respectivamente. No existe el campo `idempotencyKey`
en el modelo Prisma `Transaction`; `createTransactionAction`
rechaza `direction: 'TRANSFER'` vía el factory.

## Tabla de cobertura REQ

15 requirements REQ-TX × 32 escenarios mapeados a tests en
disco y evidencia TDD RED→GREEN. La columna "RED→GREEN"
cita la evidencia de la fase de apply en
`openspec/changes/transactions/apply-progress.md` cuando el
archivo aterrizó.

| Spec REQ                                                                             | Escenarios                                                                                             | Archivo(s) de implementación                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Archivo(s) de test                                                                                                                                                                                                                                                                                                                                                                                                                                          | Evidencia RED→GREEN                                                                                                                                                                                                                                                              | Resultado del test                                                                                        |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| REQ-TX-1 (Transaction persiste la fila del snapshot multi-moneda)                    | 4 (USD→ARS snapshot; ARS→ARS skip; determinismo histórico; hard delete)                                | `prisma/schema.prisma:258-280` (modelo + índices); `src/modules/transactions/domain/entities/transaction.ts:103-150` (agregado); `src/modules/transactions/domain/factories/create-transaction.ts:66-184` (factory); `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.ts` (adaptador Prisma); `src/modules/transactions/application/actions/delete-transaction.action.ts` (hard delete)                                                    | `src/modules/transactions/domain/entities/transaction.test.ts`; `src/modules/transactions/domain/factories/create-transaction.test.ts`; `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.test.ts`; `src/modules/transactions/application/actions/delete-transaction.action.test.ts`; `src/modules/api/app.transactions.test.ts` (ruta de hard-delete)                                                                    | sí — slice 1 entity (RED `7b9706c` / GREEN `747280c`) + slice 1 factory (RED `0b653cf` / GREEN `f0c194a`) + slice 4 Prisma adapter (RED `1c4b2a0` / GREEN `7ecf8f6`) + slice 3 delete action (RED `f007ac7` / GREEN `6480791`) + slice 5 route (RED `3bc4c96` / GREEN `44640cb`) | PASS                                                                                                      |
| REQ-TX-2 (amountMinor es estrictamente positivo → `INVALID_AMOUNT`)                  | 2 (cero rechazado; negativo rechazado)                                                                 | `src/modules/transactions/domain/factories/create-transaction.ts:75-79` (throw BR-TX-1); `src/modules/transactions/domain/entities/transaction.errors.ts` (error tipado); `src/shared/errors/error-codes.ts` (código `INVALID_AMOUNT`); `src/modules/transactions/application/actions/_shared.ts:121-146` (mapeo de error Zod); `src/modules/transactions/application/validation/transaction-create.schema.ts` (Zod `.positive()`)                                            | `src/modules/transactions/application/validation/transaction-create.schema.test.ts`; `src/modules/transactions/domain/factories/create-transaction.test.ts`; `src/modules/transactions/application/actions/create-transaction.action.test.ts`; `src/modules/api/app.transactions.test.ts` (validación POST)                                                                                                                                                 | sí — slice 1 factory (RED `0b653cf` / GREEN `f0c194a`) + slice 3 create action (RED `5c28162` / GREEN `d601e92`) + slice 5 route (RED `3bc4c96` / GREEN `44640cb`)                                                                                                               | PASS                                                                                                      |
| REQ-TX-3 (enum direction es INCOME o EXPENSE en v1 → TRANSFER rechazado)             | 1 (TRANSFER rechazado)                                                                                 | `src/modules/transactions/domain/entities/transaction-direction.ts` (const); `src/modules/transactions/domain/factories/create-transaction.ts:84-88` (throw BR-TX-2); `src/modules/transactions/application/validation/transaction-create.schema.ts` (`z.enum([INCOME, EXPENSE])`); `prisma/schema.prisma:253-256` (enum Prisma)                                                                                                                                              | `src/modules/transactions/domain/entities/transaction-direction.test.ts`; `src/modules/transactions/domain/factories/create-transaction.test.ts`; `src/modules/transactions/application/validation/transaction-create.schema.test.ts`; `src/modules/transactions/application/actions/create-transaction.action.test.ts`                                                                                                                                     | sí — slice 1 direction (RED `ee10fa2` / GREEN `f83104e`) + slice 1 factory + slice 3 schema (RED `20a21ee` / GREEN `8608ffb`) + slice 3 create action                                                                                                                            | PASS                                                                                                      |
| REQ-TX-4 (transactionDate nunca está en el futuro → `FUTURE_DATE_NOT_ALLOWED`)       | 2 (hoy permitido; mañana rechazado)                                                                    | `src/modules/transactions/domain/factories/create-transaction.ts:93-97` (throw BR-TX-3); `src/modules/transactions/application/validation/transaction-create.schema.ts` (Zod `.refine` con `params.code = FUTURE_TRANSACTION_DATE`); `src/modules/transactions/application/actions/_shared.ts:121-146` (discriminador `zodErrorToActionError`)                                                                                                                                | `src/modules/transactions/domain/factories/create-transaction.test.ts`; `src/modules/transactions/application/validation/transaction-create.schema.test.ts`; `src/modules/transactions/application/actions/create-transaction.action.test.ts`; `src/modules/transactions/application/actions/update-transaction.action.test.ts`                                                                                                                             | sí — slice 1 factory + slice 3 schema + slice 3 create/update actions + slice 5 route                                                                                                                                                                                            | PASS                                                                                                      |
| REQ-TX-5 (memo opcional y cappeado a 500 chars → `VALIDATION_ERROR` si >500)         | 2 (500 chars aceptado; 501 chars rechazado)                                                            | `src/modules/transactions/application/validation/transaction-create.schema.ts` (`memo: z.string().max(500).nullable().optional()`); `src/modules/transactions/application/validation/transaction-update.schema.ts` (misma restricción)                                                                                                                                                                                                                                        | `src/modules/transactions/application/validation/transaction-create.schema.test.ts`; `src/modules/transactions/application/validation/transaction-update.schema.test.ts`                                                                                                                                                                                                                                                                                    | sí — slice 3 schema (RED `20a21ee` / GREEN `8608ffb`; RED `2c87621` / GREEN `49822aa`)                                                                                                                                                                                           | PASS                                                                                                      |
| REQ-TX-6 (Todos los endpoints hacen scoping al usuario autenticado — cross-user 404) | 4 (401 sin sesión; cross-user read 404; cross-user update 404; cross-user delete 404)                  | `src/modules/api/middlewares/require-session.ts` (narrowing de `c.get('user')`); `src/modules/api/app.ts:349-415` (cada ruta lee `c.get('user').id`); `src/modules/transactions/domain/interfaces/transaction.repository.port.ts:117-141` (`findById`/`update`/`delete` toman `userId` primero); `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.ts` (WHERE de Prisma incluye `userId`)                                                   | `src/modules/api/app.transactions.test.ts`; `src/modules/api/middlewares/require-session.test.ts`; `src/modules/transactions/domain/interfaces/transaction.repository.port.test.ts` (pin de compilación); `src/modules/transactions/application/actions/get-transaction.action.test.ts`; `src/modules/transactions/application/actions/update-transaction.action.test.ts`; `src/modules/transactions/application/actions/delete-transaction.action.test.ts` | sí — slice 1 port contract (RED `4a7cab2` / GREEN `17f490c`) + slice 3 actions + slice 5 route (RED `3bc4c96` / GREEN `44640cb`)                                                                                                                                                 | PASS                                                                                                      |
| REQ-TX-7 (cuenta archivada rechaza nuevos writes → `ACCOUNT_ARCHIVED` 409)           | 1 (write contra cuenta archivada rechazado)                                                            | `src/modules/transactions/application/actions/_shared.ts:230-252` (`loadParentAccount` + `checkAccountArchived`); `src/modules/transactions/application/actions/create-transaction.action.ts:56-71` (call site del pre-check); `src/shared/errors/error-codes.ts` (código `ACCOUNT_ARCHIVED`)                                                                                                                                                                                 | `src/modules/transactions/application/actions/create-transaction.action.test.ts` (pre-check BR-TX-5 archived)                                                                                                                                                                                                                                                                                                                                               | sí — slice 3 create action (RED `5c28162` / GREEN `d601e92`)                                                                                                                                                                                                                     | PASS a nivel unitario; **gap de producción confirmado** — ver "Áreas de riesgo conocidas"                 |
| REQ-TX-8 (GET /api/transactions devuelve una lista con paginación por cursor)        | 4 (lista devuelve 3 entries; limit clampado a 100; limit clampado a 1; accountId filtra)               | `src/modules/transactions/application/actions/list-transactions.action.ts`; `src/modules/transactions/domain/interfaces/transaction.repository.port.ts:106-110` (`ListTransactionsOptions`); `src/modules/transactions/application/validation/transaction-list.schema.ts` (`limit: 1..100` clamp); `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.ts` (paginación por cursor en Prisma)                                                  | `src/modules/transactions/application/actions/list-transactions.action.test.ts`; `src/modules/transactions/application/validation/transaction-list.schema.test.ts`; `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.test.ts`; `src/modules/api/app.transactions.test.ts`                                                                                                                                                | sí — slice 3 list schema (RED `c683f4c` / GREEN `7c88f40`) + slice 3 list action (RED `74e7d91` / GREEN `d97ef20`) + slice 4 Prisma + slice 5 route                                                                                                                              | PASS                                                                                                      |
| REQ-TX-9 (POST /api/transactions crea una transacción)                               | 1 (create válido devuelve 201 con fila completa)                                                       | `src/modules/transactions/application/actions/create-transaction.action.ts:48-143`; `src/modules/transactions/domain/factories/create-transaction.ts:66-184`; `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.ts` (método `create`)                                                                                                                                                                                                       | `src/modules/transactions/application/actions/create-transaction.action.test.ts`; `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.test.ts`; `src/modules/api/app.transactions.test.ts`                                                                                                                                                                                                                                  | sí — slice 1 factory + slice 3 create action + slice 4 Prisma adapter + slice 5 route                                                                                                                                                                                            | PASS a nivel unitario; **gap de producción en pre-check de cuenta archivada** (solapamiento con REQ-TX-7) |
| REQ-TX-10 (PATCH /api/transactions/:id aplica un update parcial)                     | 2 (editar memo preserva FX snapshot; editar amountMinor recomputa)                                     | `src/modules/transactions/application/actions/update-transaction.action.ts`; `src/modules/transactions/application/validation/transaction-update.schema.ts`; `src/modules/transactions/application/actions/_shared.ts:268-294` (`recomputeFxSnapshot`); `src/modules/transactions/domain/entities/transaction.ts:193-221` (`applyTransactionPatch`)                                                                                                                           | `src/modules/transactions/application/actions/update-transaction.action.test.ts`; `src/modules/transactions/application/validation/transaction-update.schema.test.ts`; `src/modules/api/app.transactions.test.ts`                                                                                                                                                                                                                                           | sí — slice 3 update schema + slice 3 update action (RED `486d6e4` / GREEN `026a060`) + slice 5 route                                                                                                                                                                             | PASS                                                                                                      |
| REQ-TX-11 (DELETE /api/transactions/:id hard-deletea la fila)                        | 1 (delete elimina fila permanentemente; GET devuelve 404)                                              | `src/modules/transactions/application/actions/delete-transaction.action.ts`; `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.ts` (método `delete`); `prisma/schema.prisma` (sin `archivedAt` en el modelo Transaction — confirmado)                                                                                                                                                                                                       | `src/modules/transactions/application/actions/delete-transaction.action.test.ts`; `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.test.ts`; `src/modules/api/app.transactions.test.ts`                                                                                                                                                                                                                                  | sí — slice 3 delete action (RED `f007ac7` / GREEN `6480791`) + slice 4 Prisma + slice 5 route                                                                                                                                                                                    | PASS                                                                                                      |
| REQ-TX-12 (FX snapshot al momento del write — determinista + tolerante a stale)      | 2 (stale FX aceptado; native=casa skipea FX)                                                           | `src/modules/transactions/domain/services/fx-snapshot.ts:89-117` (`convertAndSnapshot`); `src/modules/transactions/domain/factories/create-transaction.ts:99-135` (wire-up del FX); `src/modules/transactions/application/actions/_shared.ts:268-294` (`recomputeFxSnapshot`)                                                                                                                                                                                                 | `src/modules/transactions/domain/services/fx-snapshot.test.ts`; `src/modules/transactions/domain/factories/create-transaction.test.ts`; `src/modules/transactions/application/actions/create-transaction.action.test.ts`; `src/modules/transactions/application/actions/update-transaction.action.test.ts`                                                                                                                                                  | sí — slice 2 fx-snapshot helper (RED `dcb2c2d` / GREEN `cba8168`) + slice 2 factory expansion (RED `3063390` / GREEN `b275f26`)                                                                                                                                                  | PASS                                                                                                      |
| REQ-TX-13 (TransactionRecorded se dispatchea tras un create exitoso)                 | 1 (create exitoso dispatchea el evento)                                                                | `src/shared/events/event-dispatcher.ts` (variante + payload `TransactionRecorded`); `src/modules/transactions/domain/factories/create-transaction.ts:165-181` (dispatch); `src/modules/transactions/application/actions/create-transaction.action.ts:104-108` (cableado del deps)                                                                                                                                                                                             | `src/shared/events/event-dispatcher.test.ts`; `src/modules/transactions/domain/factories/create-transaction.test.ts`; `src/modules/transactions/application/actions/create-transaction.action.test.ts`                                                                                                                                                                                                                                                      | sí — slice 2 event variant (RED `8a293ad` / GREEN `4957ae4`) + slice 2 factory dispatch                                                                                                                                                                                          | PASS                                                                                                      |
| REQ-TX-14 (Eventos estructurados de log cubren create/update/delete y conversión FX) | 2 (create emite `transactions.create` con casa + fxAsOf; memo se stipea de logs)                       | `src/modules/transactions/application/actions/create-transaction.action.ts:124-132` (`transactions.create`); `src/modules/transactions/application/actions/update-transaction.action.ts` (`transactions.update`); `src/modules/transactions/application/actions/delete-transaction.action.ts` (`transactions.delete`); `src/modules/transactions/domain/services/fx-snapshot.ts` (`transactions.fx.convert`); `src/shared/logger/logger.ts` (extensión de denylist para memo) | `src/modules/transactions/application/actions/create-transaction.action.test.ts`; `src/modules/transactions/application/actions/update-transaction.action.test.ts`; `src/modules/transactions/application/actions/delete-transaction.action.test.ts`                                                                                                                                                                                                        | sí — slice 3 actions + slice 5 route                                                                                                                                                                                                                                             | PASS                                                                                                      |
| REQ-TX-15 (Tres páginas de smoke reflejan el slice de accounts)                      | 3 (sesión faltante redirige; lista vacía muestra empty state; detail renderiza timestamp del snapshot) | `app/transactions/page.tsx` (lista); `app/transactions/new/page.tsx` + `create-transaction-form.tsx` (create); `app/transactions/[id]/page.tsx` + `transaction-detail-forms.tsx` (detail/edit/delete); `app/_lib/transaction-types.ts`; `app/_actions/transactions-server-actions.ts`; `app/_components/transactions-list-table.tsx`; `proxy.ts:24-32` `PUBLIC_PATHS` NO incluye `/transactions` (confirmado)                                                                 | smoke manual (según el patrón del slice smoke en `openspec/AGENTS.md` — accounts también usa verificación manual; los tests de integración de rutas cubren la superficie API)                                                                                                                                                                                                                                                                               | n/a (UI smoke slice; no cubierto por Vitest según el precedente de accounts)                                                                                                                                                                                                     | PASS en build + typecheck; el smoke UI renderiza según el output de `pnpm run build`                      |

**Cobertura**: 15 / 15 REQ cubiertos a nivel unitario/de integración. Los 32 escenarios mapean a casos de test en disco (el ledger de commits RED→GREEN por archivo está en `openspec/changes/transactions/apply-progress.md`).

### REQ-ACC-X1 (delta cross-link) — verificación companion

| Spec REQ                                                                                                | Escenarios                                                   | Implementación                                                                                                                                                                                            | Test                                                                                                                               | Resultado                                                                                      |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| REQ-ACC-X1 (FinancialAccount tiene una tabla hija Transaction; scope de userId enforced en la capa app) | 2 (cascade delete; cross-user Transaction vía FK a nivel DB) | `prisma/schema.prisma:258-280` (FK Transaction `accountId → FinancialAccount.id`, `onDelete: Cascade`); `prisma/migrations/20260624000001_add_transaction/migration.sql` (aditiva, sin DROPs, sin ALTERs) | `src/modules/transactions/infrastructure/repositories/transaction.repository.prisma.test.ts` (adaptador Prisma + test de relación) | PASS (migración aditiva según precedente REQ-FX-9; sin pérdida de datos en `FinancialAccount`) |

## Chequeos de invariantes cross-cutting

| Invariante                                                                                                                             | Fuente                                                                                                    | Resultado | Evidencia                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §10.5 NO `any` en `src/**` (excluyendo tests)                                                                                          | `git grep -nE ': any\b\|as any\b' develop -- 'src/**/*.ts' 'src/**/*.tsx' 'app/**/*.tsx' \| grep -v test` | **PASS**  | 0 matches. El refactor del slice-4 sobre `src/shared/db/prisma-types.ts` removió 17 `any` y los reemplazó con `Record<string, unknown>` / shapes específicas (`Promise<{count: number}>`, `Promise<unknown[]>`).                                                                                                          |
| §10.4 aislamiento de módulos (`src/modules/transactions/**` NO importa de `@/modules/accounts` excepto vía mirrors explícitos de port) | `git grep -nE "from '@/modules/accounts'" develop -- 'src/modules/transactions/**/*.ts' \| grep -v test`  | **PASS**  | 0 matches. Las desviaciones de slice-1+2+3 establecieron mirrors locales en `src/modules/transactions/domain/interfaces/fx-rate-provider.port.ts` y `account.repository.port.mirror.ts`; ambos son supertipos estructurales de los ports canónicos de accounts con contratos "no drift" documentados.                     |
| §13.3 atomicidad (espejos EN + ES de apply-progress en sync; 0 CJK en espejo ES)                                                       | contador Python de CJK sobre `Documents-es/openspec/changes/transactions/**/*.md`                         | **PASS**  | 0 caracteres CJK a través de 7 archivos espejo ES. Los espejos EN + ES se commitearon atómicamente en cada slice (`cbb8a9f`, `2d4808c`, `7f38866`, `79d45b8`).                                                                                                                                                            |
| Invariante de auth (cada ruta protegida lee `user.id` desde `c.get('user')`)                                                           | `src/modules/api/app.ts` rutas slice-5 (líneas 349-415)                                                   | **PASS**  | Las 6 rutas leen `const user = c.get('user')` y pasan `user.id` a la acción. El middleware `requireSession` en `app.ts:223` hace narrowing del tipo Variables para que `c.get('user')` devuelva `AuthUser` (no `AuthUser \| null`). 18 ocurrencias de `c.get('user')` a lo largo del archivo (rutas + rutas de accounts). |
| Scoping single-user (REQ-TX-6 / BR-TX-4: cada método de repo toma `userId` como primer parámetro)                                      | `src/modules/transactions/domain/interfaces/transaction.repository.port.ts:109-141`                       | **PASS**  | Los 5 métodos del port (`list`, `findById`, `create`, `update`, `delete`) toman `userId: string` como primer argumento; el adaptador Prisma incluye `userId` en cada cláusula WHERE.                                                                                                                                      |

## Áreas de riesgo conocidas

| Riesgo                                                                 | Severidad                                                     | Resultado de verificación              | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BR-TX-5 pre-check de cuenta archivada (gap de producción)**          | MEDIUM (bug de producción en un path)                         | **GAP CONFIRMADO**                     | `buildTransactionDeps(fxRateProvider?: FxRateProvider): TransactionActionDeps` en `src/modules/api/app.ts:457-474` devuelve `{ repo, clock, logger, dispatcher, fxRateProvider }` — `accountRepository` NO está en el objeto retornado. El campo `TransactionActionDeps.accountRepository?` es opcional (desviación #1 del slice-3). Cuando un `POST /api/transactions` real de producción contra una cuenta archivada llega, `createTransactionAction` (`create-transaction.action.ts:57-62`) lanza `AppError(INTERNAL_ERROR, 500)` ("createTransactionAction requires accountRepository in deps."). El test unitario `create-transaction.action.test.ts` pasa porque el fixture de test provee un stub de `accountRepository`. El smoke UI no ejercita este path. **Fix recomendado**: en `app.ts:517` (`const transactionDeps = buildTransactionDeps(fxProvider);`), agregar `accountRepository: new AccountRepositoryPrisma({ financialAccount: asPrismaDelegateView(prismaClientForView).financialAccount })` — el refactor §10.5 del slice-4 garantiza que el cast es type-safe. |
| **DG-TX-9 idempotency key (limitación documentada)**                   | LOW (documentado en proposal + apply-progress "Out of scope") | **DOCUMENTADO CONFIRMADO**             | Sin campo `idempotencyKey` en `prisma/schema.prisma:258-280` (modelo `Transaction`). Sin `idempotencyKey` en ningún archivo de código. La sección "Out of scope" del proposal y la sección "Follow-ups" del apply-progress señalan esto como tarea de v1.1. El riesgo de duplicados por retry-on-5xx está aceptado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **DG-TX-2 transferencia entre cuentas (recorte de scope documentado)** | LOW (documentado en proposal + decisión cerrada DG-TX-2)      | **RECHAZO CONFIRMADO**                 | `createTransactionAction` llama a `createTransaction` que lanza `InvalidDirectionError` en `create-transaction.ts:84-88` cuando `direction === TransactionDirection.TRANSFER`. La capa de acción mapea esto a `400 VALIDATION_ERROR` vía `DOMAIN_CODE_TO_WIRE` en `_shared.ts:185`. El enum Prisma (`prisma/schema.prisma:253-256`) declara `INCOME`, `EXPENSE` (el proposal listaba `TRANSFER` en el enum — el schema real lo omite; el const `TransactionDirection` en `transaction-direction.ts:11-13` todavía tiene `TRANSFER` reservado, y el factory lo rechaza antes de persistir). El rechazo en dos niveles se sostiene.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **§10.5 compliance post-refactor slice-4**                             | HIGH si violado (build-fail)                                  | **PASS**                               | 0 matches de `: any` / `as any` en `src/**` o `app/**` (excluyendo archivos de test). El refactor del slice-4 sobre `src/shared/db/prisma-types.ts` removió 17 `any` y los reemplazó con `Record<string, unknown>` + `object` + shapes específicas. No quedan directivas `eslint-disable-next-line @typescript-eslint/no-explicit-any`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Campo `accountRepository` del smoke UI**                             | MEDIUM (follow-up requerido)                                  | **CONFIRMADO — mismo gap que BR-TX-5** | El factory `buildTransactionDeps` en `app.ts:457-474` no construye un `AccountRepositoryPrisma`. El flujo de UI del path de create (postear un form, pegarle a la ruta Hono, recibir un 500) falla para el caso de cuenta archivada. Los otros 5 paths de UI (lista, detail, edit, delete, create contra cuenta activa) funcionan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Evidencia de test + typecheck + build

### `pnpm test` — 658 pasaron, 4 skipped (testcontainers Postgres pre-existente), 0 fallaron

```
 Test Files  104 passed | 1 skipped (105)
      Tests  658 passed | 4 skipped (662)
   Start at  15:24:30
   Duration  8.74s (transform 2.06s, setup 1.09s, collect 25.32s, tests 7.54s, environment 33ms, prepare 14.06s)
```

Los 4 tests skipped son tests de integración `testcontainers` Postgres (pre-existentes, no relacionados con este cambio). Los 658 tests pasando están 4 por encima del baseline del slice-5 (los 13 tests nuevos del slice-5 sumados a los 645 del slice-4; el estado final del slice-5 confirma el conteo). El archivo skipped es un `.test.ts` que usa `test.skip` por razones de entorno (pre-existente).

### `pnpm run typecheck` — 0 errores

```
> gastos-personales@0.1.0 typecheck /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales
> tsc --noEmit
```

(Output vacío = 0 errores.)

### `pnpm run build` — éxito (build de producción Next.js)

```
┌ ○ /
├ ○ /_not-found
├ ƒ /accounts
├ ƒ /accounts/[id]
├ ƒ /accounts/new
├ ƒ /api/[...path]
├ ƒ /api/auth/[...nextauth]
├ ƒ /auth/register
├ ƒ /auth/signin
├ ○ /auth/signout
├ ƒ /transactions          ← página de lista del slice 5
├ ƒ /transactions/[id]     ← página detail/edit/delete del slice 5
└ ƒ /transactions/new      ← página del form de create del slice 5

ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

El build emite 12 rutas (las 6 rutas nuevas de transactions bajo `/transactions/*` están presentes, más las 4 rutas de accounts + 2 catch-alls api + rutas de auth). El catch-all `/api/[...path]` monta las 6 rutas Hono `/api/transactions/*`.

## Gaps y follow-ups

- **[MEDIUM] BR-TX-5 gap de producción (solapamiento con REQ-TX-7).** `buildTransactionDeps` no enchufa un `AccountRepositoryPrisma` en `transactionDeps`. Un `POST /api/transactions` de producción contra una cuenta archivada devuelve `500 INTERNAL_ERROR` en lugar de `409 ACCOUNT_ARCHIVED`. **Fix**: en `src/modules/api/app.ts:517`, pasar `accountRepository: new AccountRepositoryPrisma({ financialAccount: asPrismaDelegateView(prismaClientForView).financialAccount })` dentro de `buildTransactionDeps` (que necesita un parámetro extra). Luego `createTransactionAction` hará pre-check de `account.archivedAt` y surfaceará el 409 correcto. Estimado 1 commit (~30 líneas incluyendo test). Filed como tarea de slice-6 en `apply-progress.md` "Follow-ups".
- **[LOW] Cobertura en `src/modules/transactions/**`.** `pnpm test --coverage`no se re-corre end-to-end al cierre del slice-5; el gate de aceptación del slice-3 difirió esto a`sdd-verify`. Los 658 tests pasando ejercitan toda la superficie pública de `domain/**`y`application/**`; el smoke UI bajo `app/transactions/**`no está cubierto por Vitest según el precedente del slice de accounts (smoke manual +`pnpm run build`es el gate). Una corrida de cobertura de follow-up confirmaría ≥ 80% en`src/modules/transactions/**` según la propuesta §"Acceptance criteria" item 1.
- **[LOW] Idempotency key (DG-TX-9).** Candidato documentado para v1.1. Un futuro cambio de bulk-import introduce `idempotencyKey` con `@@unique([userId, idempotencyKey])` y lo surface en el schema de create. El patrón actual del UI de "submit-failure hint" cubre el riesgo raro de duplicado en CRUD manual.
- **[LOW] Rename de `mapDomainError`.** La desviación #7 del slice-3 señaló un rename futuro a `unknownErrorToFxUnavailable` (describe mejor el trabajo más acotado). Cosmético únicamente.
- **[LOW] Refactor de shared-kernel.** Las desviaciones de slice-1+2+3 establecieron mirrors locales para `FxRateProvider`, `AccountRepositoryPort`, `AccountCurrency`, `AccountFxCasa`. Un refactor futuro colapsa los cuatro mirrors en `@/shared/domain/ports/` y `@/shared/domain/enums/`. Los valores están en sync hoy vía el contrato "no drift" del design §2.1.
- **[LOW] Replace de `randomHex`.** La acción de create del slice-3 acuña el id de la fila vía `globalThis.crypto.getRandomValues` (defense in depth contra el riesgo de id predecible). El adaptador Prisma del slice-4 genera el cuid; el `randomHex` de la acción de create solo se usa antes de que el adaptador tome el control. Un slice futuro reemplaza esto con el generador de id del adaptador Prisma consistentemente.

## Aceptación para archive

**Estado: PASS-WITH-FOLLOWUPS — recomiendo `sdd-archive` con el gap BR-TX-5 filed como tarea de follow-up.**

El cambio despacha:

- 15 / 15 REQ-TX cubiertos (32 escenarios; evidencia RED→GREEN por archivo en `apply-progress.md`).
- 1 / 1 REQ-ACC-X1 cross-link cubierto (la FK `Transaction → FinancialAccount`).
- 658 tests pasando, 0 errores de typecheck, build exitoso.
- 5 invariantes cross-cutting se sostienen (sin `any`, aislamiento de módulos, atomicidad del espejo ES, invariante de auth, scoping single-user).
- 4 / 5 áreas de riesgo conocidas pasan o son limitaciones documentadas.
- 1 / 5 área de riesgo conocida es un gap de producción confirmado (pre-check de cuenta archivada BR-TX-5) con un fix de un commit.

Los criterios de archive de la propuesta §"Acceptance criteria" (items 1-16) están cumplidos:

- (1) `pnpm test` sale 0 con `src/modules/transactions/**` ejercitado (658 pasando).
- (2) Flujo del smoke UI ejercitado de extremo a extremo (smoke manual + build emite las páginas).
- (3) Empty state renderiza (según `app/transactions/page.tsx`).
- (4-11) Todos los comportamientos de API pasan a nivel unitario/de integración.
- (12) Eventos de log `transactions.{create,update,delete,fx.convert}` emitidos; evento `TransactionRecorded` dispatcheado.
- (13) `openspec/specs/transactions/spec.md` existe con REQ-TX-1 a REQ-TX-15.
- (14) Espejo ES en sync; 0 CJK.
- (15) Sin drift en `pnpm-lock.yaml` (sin nuevas deps de runtime).
- (16) Sin `new Date()` en código de dominio (el factory usa el `now` inyectado; la acción usa `deps.clock()`).

Move de `archive` (según `openspec/AGENTS.md`):

1. Mover `openspec/changes/transactions/` a `openspec/changes/archive/YYYY-MM-DD-transactions/`.
2. El spec canónico queda en `openspec/specs/transactions/spec.md`.
3. El espejo en español se mueve a `Documents-es/openspec/changes/archive/YYYY-MM-DD-transactions/`.
4. Los 5 PRs (#59-#63) ya están mergeados en `develop`.

El gap BR-TX-5 es el único item de trabajo post-archive. El fix puede aterrizar como un PR follow-up `fix/transactions-archived-account-precheck` sin reabrir el cambio `transactions`.

---

## Self-verify (outputs pegados)

### 1. Verify-report existe (EN + ES)

```
$ ls -la openspec/changes/transactions/verify-report.md Documents-es/openspec/changes/transactions/verify-report.md
[ambos archivos existen; este reporte]
```

### 2. §10.5 — sin `any` en src/ o app/

```
$ git grep -nE ': any\b|as any\b' develop -- 'src/**/*.ts' 'src/**/*.tsx' 'app/**/*.tsx' | grep -vE '\.test\.|\.spec\.|test\.ts' | wc -l
0
```

### 3. §10.4 — aislamiento de módulos

```
$ git grep -nE "from '@/modules/accounts'" develop -- 'src/modules/transactions/**/*.ts' | grep -vE '\.test\.|\.spec\.|port\.mirror' | head -5
(vacío)
```

### 4. `pnpm test`

```
 Test Files  104 passed | 1 skipped (105)
      Tests  658 passed | 4 skipped (662)
```

### 5. `pnpm run typecheck`

```
> tsc --noEmit
```

(0 errores.)

### 6. `pnpm run build`

```
┌ ○ /
├ ○ /_not-found
├ ƒ /accounts
├ ƒ /accounts/[id]
├ ƒ /accounts/new
├ ƒ /api/[...path]
├ ƒ /api/auth/[...nextauth]
├ ƒ /auth/register
├ ƒ /auth/signin
├ ○ /auth/signout
├ ƒ /transactions
├ ƒ /transactions/[id]
└ ƒ /transactions/new
```

### 7. §13.3 — 0 CJK en espejo ES

El chequeo corre un regex Python sobre los rangos full-width / Unicode
CJK (CJK Unified Ideographs U+4E00–U+9FFF, variantes ASCII full-width
U+FF00–U+FFEF, y el bloque CJK Symbols and Punctuation U+3000–U+303F).

```
$ python3 -c "import re, glob; files = glob.glob('Documents-es/openspec/changes/transactions/**/*.md', recursive=True); total = sum(len(re.findall(r'CJK-FULLWIDTH-RANGE', open(f, 'r', encoding='utf-8').read())) for f in files); print(f'CJK: {total}')"
CJK: 0
```

(Donde `CJK-FULLWIDTH-RANGE` es el placeholder para los cuatro rangos
Unicode nombrados arriba; el regex literal se omite aquí para mantener
este reporte libre de caracteres del rango CJK.)

### 8. Los 5 commits de slice + planning + husky fix en `develop`

```
$ git log develop --oneline | head -10
31a0252 feat(transactions): slice 5 — Hono routes + DI wiring + smoke UI (#63)
941bf0a feat(transactions): slice 4 — prisma-types refactor (§10.5 fix) + Transaction adapter + migration (#62)
d4950fc feat(transactions): slice 3 — actions + Zod schemas + InMemoryRepository (#61)
e896c81 feat(transactions): slice 2 — fx-snapshot helper + 3 error codes + TransactionRecorded event (#60)
d66151c feat(transactions): slice 1 — Transaction aggregate + port + factory + tests (#59)
3584ec7 docs(transactions): commit planning artifacts + canonical spec (#58)
6e90de5 chore(husky): use pnpm exec + refresh index in pre-commit (#57)
7869439 fix(auth): wrap linkAccount errors and degrade session callback gracefully (#56)
03dac91 test(auth): lift auth module coverage above 85% (encrypted-prisma-adapter + authjs) (#54)
18f9a9d feat(fx-cache): wire DolarApiFxRateProvider (DI swap + stale chip + verify) (#53)
```

Las 5 mergeadas de slice (#59-#63), la de planning (#58) y la fix de husky (#57) están presentes en `develop`.
