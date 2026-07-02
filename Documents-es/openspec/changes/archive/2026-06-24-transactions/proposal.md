# Propuesta — `transactions`

**Estado**: implementado · **Autor**: Sebastián Illa · **Creado**: 2026-06-22 · **Implementado**: 2026-06-24 (slices 1-5 de `feat/transactions-entity (or -fx-snapshot, -actions, -persistence, -api)` mergeados en `develop` vía #59, #60, #61, #62, #63; archivado como 2026-06-24-transactions)
**Slice objetivo**: MVP-2 (libro mayor de transacciones)
**Upstream**: `openspec/changes/transactions/explore.md` (2026-06-22)
**Upstream**: preflight SDD global (interactive, both, auto-forecast, 400 líneas)
**Vacíos de decisión**: DG-TX-1, DG-TX-4, DG-TX-5, DG-TX-6, DG-TX-7, DG-TX-8,
DG-TX-9, DG-TX-10, DG-TX-12, DG-TX-13, DG-TX-14, DG-TX-15 **cerrados (2026-06-22)**.
DG-TX-2, DG-TX-3, DG-TX-11 **bloqueados en el grill de pre-propose (2026-06-22)** —
se trasladan como input vinculante. Ver
[Decisiones cerradas](#decisiones-cerradas-dg-tx-n--2026-06-22) para el resumen
de auditoría.

> Primera escritura de la propuesta de `transactions`. El cambio introduce la
> capability **libro mayor de transacciones**: registro manual de gastos (CRUD)
> más multi-moneda vía el `FxRateProvider` del módulo `fx`, con alcance de una
> sola cuenta por transacción. **v1 envía el núcleo CRUD + ruta multi-moneda;
> adjuntos y recurrencia se difieren a v1.1+ del mismo cambio.** Una smoke UI
> de v1 espeja el patrón de `app/accounts/` para poder validar el flujo manual
> de punta a punta sin curl. El agregado `Transaction` es nuevo; el snapshot de
> FX vive en la fila (`originalAmount`, `originalCurrency`, `convertedAmount`,
> `convertedCurrency`, `fxAsOfSnapshot`, `casaSnapshot`) para que los totales
> históricos sean determinísticos. El módulo es `src/modules/transactions/`,
> siguiendo la forma de `src/modules/accounts/` (domain / application /
> infrastructure; ports & adapters; barrel público).

## Por qué

`accounts-ledger` y `fx-cache` enviaron el registro de cuentas y una superficie
de FX de display read-only. El hueco de producto de finanzas personales es el
**libro mayor de transacciones** en sí: no hay manera de registrar un gasto o
un ingreso contra una cuenta. La spec de `fx-cache` en
`openspec/specs/fx/spec.md:95-98` lo contempla explícitamente:

> "a future `transactions` capability MAY store the FX rate used at write time
> on each transaction row, but for v1 the FX surface stays read-only and
> display-only per BR-ACC-12."

La consecuencia para el usuario es concreta: no hay dónde anotar lo que se
gastó ni lo que se cobró. Hasta un widget smoke que muestra el balance de una
cuenta no se puede sanity-checkear contra un historial real de transacciones.
Esto bloquea `reports` (sin agregaciones posibles), bloquea `snapshots` (sin
trazabilidad de patrimonio en el tiempo) y bloquea cualquier narrativa de
producto para la app.

Dos decisiones de producto guían la forma de v1:

1. **Una sola cuenta por transacción en v1.** Los transfers entre dos cuentas
   (el agregado `Transfer` o el link `transferGroupId`) se difieren a v1.1.
   Esto mantiene el schema, el servicio y la ruta de escritura chicos y sin
   ambigüedad; además difiere la pregunta de consistencia más difícil
   (escritura atómica de dos filas) hasta que el patrón núcleo de CRUD haya
   aterrizado y lo hayamos visto funcionar.
2. **Snapshot de FX al momento de escritura.** La fila de `Transaction` carga
   el monto convertido junto al original. Esto vuelve determinísticos los
   totales históricos — un balance computado para el mes pasado usa la misma
   tasa con la que se escribió la transacción — y NO muta el balance nativo de
   la cuenta (BR-ACC-12 heredada). La llamada de conversión pasa por el port
   `FxRateProvider` existente en
   `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts:90-100`,
   reusando el call site de resolución de casa en
   `src/modules/accounts/application/actions/get-account-balance.action.ts:67-100`.

El scope bloqueado del Slice 1 es **el agregado `Transaction` + CRUD +
multi-moneda vía el módulo `fx` + smoke UI**. Adjuntos y recurrencia vienen
después de que el Slice 1 aterrice (slices separados del mismo cambio).

## Qué

Seis cambios aterrizan en el Slice 1 de `transactions`. El cambio se envía a
través de **dos PRs encadenados** (ver Forecast): PR-1A es la entidad +
repositorio + servicio + tests; PR-1B son las rutas Hono + wiring de DI +
smoke UI.

### Cambio 1 — Agregado `Transaction` y almacenamiento

- Nuevo modelo Prisma `Transaction` en `prisma/schema.prisma` con los campos
  mínimos de v1 (la fase de spec codifica el schema completo, los BRs y los
  escenarios):
  - Identidad: `id: String @id @default(cuid())`.
  - Ownership: `userId` (FK a `User.id`, `onDelete: Cascade` según el invariante
    `FinancialAccount.userId` en `prisma/schema.prisma:214`), `accountId` (FK a
    `FinancialAccount.id`, `onDelete: Cascade`).
  - Direction: `direction: TransactionDirection` (enum Prisma,
    `INCOME | EXPENSE`; `TRANSFER` queda reservado para v1.1 y no se usa en
    escrituras de v1 — DG-TX-12).
  - Monto (nativo): `amountMinor: Int`, **siempre positivo**; el `direction`
    carga el signo. La convención sigue la regla "sin montos negativos" de los
    value objects de dinero (positivo = magnitud, signo desde `direction`).
  - Monto (convertido): `convertedAmountMinor: Int` más
    `convertedCurrency: AccountCurrency` pobladas por la llamada FX al momento
    de escritura. Cuando la moneda nativa coincide con la `casa` de la cuenta,
    la columna convertida espeja la nativa y la llamada FX se saltea.
  - Snapshot de FX: `fxAsOfSnapshot: DateTime` y `casaSnapshot: AccountFxCasa`
    (la forma UPPERCASE de Prisma), ambos poblados solo cuando ocurre una
    conversión.
  - Campos libres: `memo: String?` (opcional, ≤ 500 chars por Zod — sin
    denylist de PII en v1 según DG-TX-11).
  - Categorización: `category: String?` (string libre en v1 según DG-TX-4; sin
    tabla `TransactionCategory`).
  - Lifecycle: `transactionDate: DateTime` (NO en el futuro según DG-TX-13),
    `createdAt: DateTime`, `updatedAt: DateTime`.
  - **Sin columna `archivedAt`.** v1 envía **hard delete** según DG-TX-15 (la
    fila se va; sin recuperación). La consulta de listado no tiene filtro
    `archivedAt: null`. La decisión es el camino más barato; `accounts` hace
    soft-archive porque las cuentas sobreviven a las transacciones, pero las
    transacciones son descartables.
- Índices (DG-TX-14):
  - `@@index([userId, transactionDate])` — endpoint de listado.
  - `@@index([accountId, transactionDate])` — listado por cuenta.
- La migración es no destructiva (sin drops de columnas, sin reescrituras de
  filas, según el mismo patrón de `add_account_fx_casa`; ver
  `openspec/specs/fx/spec.md:474-484` para el precedente).

### Cambio 2 — Esqueleto del módulo (`src/modules/transactions/`)

El nuevo módulo sigue la forma de `accounts` exactamente
(`src/modules/accounts/`):

- `domain/entities/transaction.ts` — entidad + constructor + schema Zod.
  Espeja `financial-account.ts:78-86` para el patrón del enum. No carga tipos
  de infraestructura.
- `domain/interfaces/transaction.repository.port.ts` — espeja
  `src/modules/accounts/domain/interfaces/account.repository.port.ts` (4-5
  métodos: `findById`, `list`, `count`, `create`, `update`, `delete`). Cada
  método toma `userId` como argumento requerido y lo incluye en toda cláusula
  WHERE (el invariante cross-module de `account.repository.port.ts:117-155`).
- `domain/services/transaction.service.ts` — lógica de dominio pura; depende
  del port del repositorio + `Clock` (de `src/shared/clock/clock.port.ts:22-24`)
  - `FxRateProvider` (de `@/modules/accounts`). Lanza `AppError` para fallas
    de dominio (`NOT_FOUND`, `INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`,
    `ACCOUNT_ARCHIVED`).
- `application/actions/{list,get,create,update,delete}-transaction.action.ts` —
  cinco acciones; cada una sigue la forma canónica en
  `src/modules/accounts/application/actions/create-account.action.ts`
  (`safeParse → leer userId del contexto Hono → llamar servicio → catch
AppError → ActionResult`). Los helpers de
  `src/modules/accounts/application/actions/_shared.ts`
  (`zodErrorToActionError`, `appErrorToActionError`, `ActionResult`) NO se
  importan directamente (regla de módulos aislados, `AGENTS.md` raíz §10.5);
  el archivo nuevo tiene su propia copia de `_shared.ts`.
- `application/dto/transaction.dto.ts` — `toTransactionDto(row)` espejando
  `src/modules/accounts/application/dto/financial-account.dto.ts`.
- `application/validation/transaction-create.schema.ts` —
  `z.discriminatedUnion` sobre `direction` (INCOME / EXPENSE) para que las
  reglas por dirección puedan divergir más adelante (espeja
  `account-create.schema.ts:38-49`).
- `infrastructure/repositories/transaction.repository.prisma.ts` — el adapter
  Prisma. Usa `asPrismaDelegateView(prisma()).transaction` (helper en
  `src/shared/db/prisma-types.ts`). Traduce
  `Prisma.PrismaClientKnownRequestError` con `code: 'P2002'` a
  `AppError(NAME_TAKEN)` si se agrega una unique constraint más adelante (no
  en v1; las transacciones no tienen clave única natural más allá de
  `(userId, idempotencyKey)` que es opt-in — DG-TX-9).
- `index.ts` — barrel mínimo: la entidad, la interfaz del port, la clase del
  servicio, las constantes del enum. Sin exports de infraestructura (la regla
  de `src/modules/accounts/index.ts:27-64`).

### Cambio 3 — Rutas Hono (montadas en la sub-app protegida)

Cinco rutas bajo `/api/transactions`, más una ruta de listado filtrado por
cuenta. Todas se montan en el `protectedApp` existente
(`src/modules/api/app.ts:192-312`) para heredar `requireSession` y el
estrechamiento de `c.get('user')` a `AuthUser`. El patrón espeja las siete
rutas de `accounts` en `src/modules/api/app.ts:222-306`.

| Método   | Path                                   | Comportamiento                                                                                                                   |
| -------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/transactions`                    | Listado cursor-paginado (`?cursor=...&limit=...&accountId=...`); espeja la forma cursor de `list-accounts.action.ts` (DG-TX-14). |
| `POST`   | `/api/transactions`                    | Crea una transacción. Devuelve la fila + un `convertedAmount` no nulo en la `casa` de la cuenta.                                 |
| `GET`    | `/api/transactions/:id`                | Lee una. 404 en cross-user.                                                                                                      |
| `PATCH`  | `/api/transactions/:id`                | Update parcial. Recompila el snapshot FX solo si `amountMinor` o `currency` cambiaron.                                           |
| `DELETE` | `/api/transactions/:id`                | Hard delete. Sin recuperación (DG-TX-15).                                                                                        |
| `GET`    | `/api/transactions/account/:accountId` | Listado filtrado, misma forma cursor.                                                                                            |

El archivo de rutas es `app/api/[...path]/route.ts` (ya montado en el
catch-all; `transactions` NO agrega archivo nuevo allí según la restricción
en `openspec/changes/transactions/explore.md:81`).

### Cambio 4 — Wiring de DI

El composition root en `src/modules/api/app.ts:317-352` (`buildDefaultDeps`)
gana dos entradas nuevas:

- `transactionService`: construido desde un `TransactionRepositoryPrisma`
  respaldado por Prisma más el `fxRateProvider` existente (ya en `deps`,
  líneas 89-97) más `systemClock` (ya importado en la línea 74).
- `transactionRepository`: pasado al `transactionService` (el servicio se
  construye al startup de la misma forma que `AccountService`,
  `app.ts:116-124`).

El protectedApp monta las seis rutas nuevas después de las siete rutas de
accounts (entre la línea 306 y la línea 312). El test de DI
(`src/modules/api/app.deps.test.ts`) y el test del protectedApp
(`src/modules/api/app.accounts.test.ts`) ganan un `app.transactions.test.ts`
paralelo que cubre las seis rutas contra fakes en memoria (según el patrón
de `accounts`).

### Cambio 5 — Smoke UI

Tres páginas espejando el patrón de `app/accounts/`
(`app/accounts/page.tsx`, `app/accounts/new/page.tsx`,
`app/accounts/[id]/page.tsx`):

- `app/transactions/page.tsx` — página de listado; mismo comentario de header
  `// smoke-minimal, not production`.
- `app/transactions/new/page.tsx` — formulario de creación; consume el
  listado de cuentas + la `casa` resuelta por el FX-provider por cuenta para
  mostrar el preview del monto convertido.
- `app/transactions/[id]/page.tsx` — página de detalle; renderiza
  `originalAmount`, `originalCurrency`, `convertedAmount`,
  `convertedCurrency`, y `fxAsOfSnapshot`.

Las páginas llaman a la API Hono vía `serverHonoRequest` (el helper de
fetch server-side in-process). Ninguna de las páginas nuevas se agrega a
`PUBLIC_PATHS` en `proxy.ts:24-32`; el 307 redirect a
`/auth/signin?callbackUrl=...` es la puerta de auth.

### Cambio 6 — Códigos de error, observabilidad y superficie de eventos

- **Nuevos códigos de error** agregados a
  `src/shared/errors/error-codes.ts:12-43`:
  - `INVALID_AMOUNT` → 400 (`amountMinor` no positivo, negativo después de
    derivar el signo desde `direction`, o no finito).
  - `FUTURE_DATE_NOT_ALLOWED` → 400 (`transactionDate > now()`).
  - `ACCOUNT_ARCHIVED` → 409 (el `FinancialAccount` padre está archivado; v1
    rechaza escrituras nuevas contra cuentas archivadas).
  - `ACCOUNT_NOT_FOUND` (pre-check de la capa de acción) reusa `NOT_FOUND`;
    sin código nuevo.
- **Sin nuevos HTTP status codes.** Todos los códigos nuevos mapean a status
  existentes (400, 409). El handler central
  `src/shared/http/error-handler.ts:34-103` los toma sin cambios.
- **Eventos estructurados de log** agregados a
  `src/shared/logger/logger.ts` según la convención en
  `fx-rate-provider.dolar-api.ts:66-128`:
  - `transactions.create` — `{ userId, accountId, direction, amountMinor, currency, casa, fxAsOf }`.
  - `transactions.update` — `{ userId, id, fieldsChanged[], fxRecomputed }`.
  - `transactions.delete` — `{ userId, id }`.
  - `transactions.fx.convert` — `{ userId, casa, native, display, fxAsOf, stale }`.
- **Evento de dominio** `TransactionRecorded` agregado a la unión en
  `src/shared/events/event-dispatcher.ts:3-5`. El payload carga
  `{ userId, transactionId, accountId, direction, amountMinor, currency, casa,
convertedAmountMinor, convertedCurrency, occurredAt }`. Sin subscriber en
  v1; la unión crece para que los futuros `reports` / `snapshots` puedan
  subscribirse sin un cambio de interfaz.

### Fuera de scope (este cambio)

- **Transfers entre dos cuentas** (DG-TX-2 bloqueado a v1.1). v1 es solo
  cuenta única; el agregado `Transfer` o el link `transferGroupId` no se
  diseñan.
- **Adjuntos** (recibos, facturas). La tabla `Attachment`, el port
  `AttachmentStorage`, el adapter `LocalDiskAttachmentStorage`, y la env var
  `ATTACHMENTS_DIR` no se envían en v1.
- **Recurrencia** (DG-TX-6, DG-TX-7 diferidos a v1.1). Sin tabla
  `RecurrenceRule`, sin generador on-demand, sin worker Cron. La recurrencia
  usa **frecuencia a nivel de dominio** (`frequency`, `interval`,
  `byMonthDay`, `byDay`) generada **on-demand en la carga del dashboard**
  cuando se envíe.
- **Idempotency keys** (DG-TX-9 — ver Decisiones cerradas más abajo para la
  forma de v1).
- **Importación bancaria / CSV upload.** Un endpoint de import bulk con
  idempotencia es candidato a v1.1.
- **OCR en recibos.** Fuera de v1.
- **Push notifications.** Fuera de v1.
- **Multi-user / cuentas compartidas / visor read-only** (DG-TX-10 confirmado
  single-user).
- **App mobile.** Fuera de v1.
- **Background workers / BullMQ.** Fuera de v1.
- **Archivo histórico de FX para transacciones back-dated.** El snapshot de
  DolarAPI al momento de escritura es la tasa del momento del write; no hay
  lookup de tasa back-dated. Una transacción back-dated usa la tasa de hoy,
  no la tasa en la fecha de la transacción (esto es comportamiento
  documentado; la UI muestra `fxAsOfSnapshot` para que el usuario vea cuándo
  se capturó la tasa).
- **Categorización con IA.** Fuera de v1.
- **Reglas de presupuesto / límites de gasto.** Fuera de v1 (territorio de
  `reports`).
- **UI de producción.** La smoke UI bajo `app/transactions/` es smoke-minimal;
  una UI de calidad de producción es `transactions-ui`, un cambio separado.

## No-objetivos

- **No es un motor de conversión de dinero.** El snapshot de FX se captura
  una vez, al momento de escritura. No hay job de re-conversión, ni archivo
  histórico de FX, ni re-rateo retroactivo.
- **No es un nuevo provider de FX.** El `FxRateProvider` se consume sin
  cambios. Sin nuevas fuentes de tasas, sin nuevos pares, sin resiliencia
  multi-fuente.
- **No es un nuevo framework HTTP ni de DI.** El catch-all de Hono en
  `app/api/[...path]/route.ts:7-25` y el grafo de DI en
  `src/modules/api/app.ts` se extienden, no se reemplazan.
- **No es un nuevo modelo de auth.** Cada endpoint escopa a `userId` (sin
  row-level security en MVP según `openspec/specs/auth/spec.md:644-647`); sin
  permiso `viewer`.
- **No es un nuevo framework de migración.** La migración Prisma es un único
  archivo aditivo (espeja el precedente `add_account_fx_casa`).
- **No es un re-diseño del schema de `accounts`.** La nueva tabla
  `Transaction` es el único cambio de schema en este cambio.

## Usuarios y situaciones

| Usuario                     | Situación                                                                                                                                                                                                    | Touchpoint                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Usuario autenticado         | Registra un gasto: abre `app/transactions/new`, elige la cuenta bancaria, tipea el monto en USD, elige la fecha, envía. La fila se crea con el monto ARS convertido y snapshotteado al momento de escritura. | Smoke UI; `POST /api/transactions`              |
| Usuario autenticado         | Revisa los gastos de la semana pasada: abre `app/transactions`, filtra por cuenta y rango de fechas.                                                                                                         | Smoke UI; `GET /api/transactions?accountId=...` |
| Usuario autenticado         | Corrige un typo: abre la transacción, edita el `memo`, guarda. El monto y la moneda no cambian así que el snapshot FX NO se recompila.                                                                       | Smoke UI; `PATCH /api/transactions/:id`         |
| Usuario autenticado         | Borra una transacción duplicada: abre la página de detalle, hace clic en delete. La fila se va; sin archivo, sin recuperación (DG-TX-15).                                                                    | Smoke UI; `DELETE /api/transactions/:id`        |
| Futuro autor de `reports`   | Se subscribe a `TransactionRecorded` para recomputar totales mensuales.                                                                                                                                      | `src/shared/events/event-dispatcher.ts`         |
| Futuro autor de `snapshots` | Lee filas de `Transaction` a fin de mes para escribir un snapshot de patrimonio.                                                                                                                             | `TransactionRepositoryPort`                     |

## Reglas de negocio

El cambio traslada los BRs existentes de `accounts` y `fx` verbatim y agrega
una nueva familia de BRs (`BR-TX-N`) para el agregado `Transaction`. La lista
de abajo nombra las reglas vinculantes; la fase de spec escribe los Escenarios
completos.

1. **BR-ACC-12 (trasladado).** El storage nunca se convierte. El
   `FinancialAccount.openingBalanceMinor` nativo y el
   `Transaction.amountMinor` se almacenan tal cual. El monto convertido en
   una transacción es un snapshot, no una mutación del valor nativo.
   (Fuente: `openspec/specs/accounts/spec.md`,
   `openspec/specs/fx/spec.md:314-323`.)
2. **BR-ACC-13 (trasladado).** FX stale no es un 5xx. El `FxRateProvider`
   devuelve la tasa con `fxAsOf` incluso cuando está stale; la escritura de
   la transacción muestra el timestamp del snapshot en la respuesta.
3. **BR-FX-3 (trasladado).** La resolución de casa es responsabilidad del
   caller. El `TransactionService` resuelve
   `account.casa ?? env.FX_DEFAULT_CASA` en el call site de la acción, nunca
   dentro del provider.
4. **BR-TX-1 (NUEVO).** `Transaction.amountMinor` es siempre positivo; el
   signo viene de `direction`. Un valor no positivo en la frontera de la API
   se rechaza con `INVALID_AMOUNT` (400).
5. **BR-TX-2 (NUEVO).** `direction` es uno de `INCOME | EXPENSE` en v1. El
   valor de enum `TRANSFER` queda reservado para v1.1 y se rechaza en la
   frontera de la API en v1.
6. **BR-TX-3 (NUEVO).** `Transaction.transactionDate` nunca está en el
   futuro relativo a `Clock.now()`. Una fecha futura en la frontera de la API
   se rechaza con `FUTURE_DATE_NOT_ALLOWED` (400).
7. **BR-TX-4 (NUEVO).** Cada referencia cross-module a una transacción
   escopa a `userId`. No existe la API `findById(id)`; `findById(userId, id)`
   devuelve `null` en miss O cross-user.
8. **BR-TX-5 (NUEVO).** No se puede crear una `Transaction` contra un
   `FinancialAccount` archivado. La capa de acción pre-chequea
   `account.archivedAt` y rechaza con `ACCOUNT_ARCHIVED` (409).
9. **BR-TX-6 (NUEVO).** El monto convertido se captura al momento de
   escritura. Cuando `transaction.currency === casa currency`, la llamada FX
   se saltea y `convertedAmountMinor` espeja `amountMinor` y
   `fxAsOfSnapshot` es `null`.
10. **BR-TX-7 (NUEVO).** Hard delete es la política de v1. No hay columna
    `archivedAt` en `Transaction`; `DELETE` remueve la fila permanentemente.
11. **BR-TX-8 (NUEVO).** `memo` es opcional. Sin largo mínimo, sin denylist
    de PII en v1. Largo máximo 500 chars enforced por Zod.
12. **BR-TX-9 (NUEVO).** `category` es un string libre (sin tabla
    `TransactionCategory` en v1).
13. **BR-TX-10 (NUEVO).** La paginación es cursor-based
    (`?cursor=...&limit=...`), espejando `list-accounts.action.ts`. `limit`
    se clamp a `1..100` en la frontera de la API.
14. **BR-TX-11 (NUEVO).** El evento de dominio `TransactionRecorded` se emite
    después de un create exitoso. El payload incluye el monto convertido y
    el timestamp del snapshot.

## Áreas afectadas

| Área                                                       | Impacto            | Descripción                                                                                                                             |
| ---------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                     | Modificado         | Nuevo modelo `Transaction` + nuevo enum `TransactionDirection` + índices.                                                               |
| `prisma/migrations/<ts>_add_transaction/migration.sql`     | Nuevo              | Aditivo: nueva tabla, nuevo enum, nuevos índices. No destructivo.                                                                       |
| `src/modules/transactions/`                                | Nuevo              | Nuevo módulo espejando la forma de `src/modules/accounts/`.                                                                             |
| `src/modules/api/app.ts`                                   | Modificado         | Wiring de DI (`buildDefaultDeps`) agrega `transactionService` + `transactionRepository`; el protectedApp monta seis rutas nuevas.       |
| `src/modules/api/app.transactions.test.ts`                 | Nuevo              | Tests de rutas contra fakes en memoria (espeja `app.accounts.test.ts`).                                                                 |
| `app/transactions/page.tsx`                                | Nuevo              | Página de listado smoke-minimal.                                                                                                        |
| `app/transactions/new/page.tsx`                            | Nuevo              | Formulario de creación smoke-minimal.                                                                                                   |
| `app/transactions/[id]/page.tsx`                           | Nuevo              | Página de detalle smoke-minimal.                                                                                                        |
| `src/shared/errors/error-codes.ts`                         | Modificado         | Nuevos códigos `INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED`; statuses `400`, `400`, `409`.                           |
| `src/shared/events/event-dispatcher.ts`                    | Modificado         | Nuevo miembro de la unión `TransactionRecorded` con tipo de payload.                                                                    |
| `src/shared/logger/logger.ts`                              | Modificado         | Nuevos nombres de eventos `transactions.{create,update,delete}`, `transactions.fx.convert`.                                             |
| `openspec/specs/transactions/spec.md`                      | Nuevo              | Spec canónica de capability, promovida desde el delta por `sdd-archive`.                                                                |
| `openspec/changes/transactions/specs/transactions/spec.md` | Nuevo (delta)      | Delta spec escrita por `sdd-spec`.                                                                                                      |
| `openspec/changes/transactions/specs/accounts/spec.md`     | Nuevo (delta)      | Delta opcional: anota la nueva FK `Transaction.accountId → FinancialAccount` para lectores cross-module.                                |
| `Documents-es/openspec/...`                                | Nuevo + Modificado | Mirror en español de cada Markdown inglés de arriba. Mismo commit por `AGENTS.md` raíz §13.3.                                           |
| `package.json` + `pnpm-lock.yaml`                          | Modificado         | No se esperan nuevas deps de runtime. Si la fase de spec agrega alguna, el lockfile se commitea en el mismo PR (`AGENTS.md` raíz §5.3). |

## Decisiones cerradas (DG-TX-N — 2026-06-22)

Los 15 vacíos de decisión están **cerrados**. El detalle vive en la
sección correspondiente de abajo o en el artefacto de explore; esto es el
resumen de auditoría.

| Vacío    | Decisión                                                                                                                                                                                                                                                                                                                                                                   | Rationale                                                                                                                                                                                                                           | Dónde se codifica                                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| DG-TX-1  | Hard delete; campos requeridos = `id, userId, accountId, direction, amountMinor, currency, transactionDate, createdAt, updatedAt`; opcionales = `memo, category, convertedAmountMinor, convertedCurrency, fxAsOfSnapshot, casaSnapshot`; sin columnas `createdBy`/`updatedBy`.                                                                                             | Hard delete es el camino más barato; `accounts` hace soft-archive porque las cuentas sobreviven a las transacciones, pero las transacciones son descartables. Sin columnas de auditoría espeja a `accounts` (que no tiene ninguna). | Cambio 1, BR-TX-7                                                                                                                                                   |
| DG-TX-2  | Single-account únicamente en v1. El agregado `Transfer` y `transferGroupId` se difieren a v1.1.                                                                                                                                                                                                                                                                            | **Bloqueado en el grill de pre-propose.** Camino más barato; difiere la escritura atómica de dos filas hasta que aterrice el patrón núcleo de CRUD.                                                                                 | BR-TX-2                                                                                                                                                             |
| DG-TX-3  | Snapshot al momento de escritura: la fila carga `originalAmount` + `originalCurrency` Y `convertedAmount` + `convertedCurrency` + `fxAsOfSnapshot` + `casa`.                                                                                                                                                                                                               | **Bloqueado en el grill de pre-propose.** Totales históricos determinísticos; sin job de re-conversión. La spec de `fx-cache` líneas 95-98 contempla explícitamente esta forma.                                                     | Cambio 1, BR-TX-6                                                                                                                                                   |
| DG-TX-4  | String libre `category: String?` en `Transaction`. Sin tabla `TransactionCategory` en v1.                                                                                                                                                                                                                                                                                  | Mínima fricción para v1; se puede promover a tabla tipada más adelante sin migración destructiva (el string es un superconjunto libre).                                                                                             | Cambio 1, BR-TX-9                                                                                                                                                   |
| DG-TX-5  | Port `AttachmentStorage` con `put / get / delete / signUrl`; `LocalDiskAttachmentStorage` para dev/CI; env var `ATTACHMENTS_DIR`; diferido a v1.1 (Slice 2 de este cambio).                                                                                                                                                                                                | **Bloqueado en el grill de pre-propose.** Interfaz adapter desde el día 1 para que un swap futuro a S3/R2 sea no rompedor. Diferir está bien: el port no está en la ruta de escritura de v1.                                        | Candidato v1.1                                                                                                                                                      |
| DG-TX-6  | Frecuencia a nivel de dominio (`frequency`, `interval`, `byMonthDay`, `byDay`). Las instancias generadas son filas nuevas con FK `recurrenceTemplateId: string                                                                                                                                                                                                             | null`; cada instancia generada carga un `idempotencyKey`de`{ templateId, dueDate }`. Diferido a v1.1 (Slice 3 de este cambio).                                                                                                      | Sin dep de parser iCal; sin expresión Cron. El motor resuelve "próxima corrida" determinísticamente desde los campos tipados.                                       | Candidato v1.1   |
| DG-TX-7  | Generación on-demand en la carga del dashboard. Sin Cron, sin BullMQ. Diferido a v1.1.                                                                                                                                                                                                                                                                                     | **Bloqueado en el grill de pre-propose.** Cutoff para v1; los background jobs están out.                                                                                                                                            | Candidato v1.1                                                                                                                                                      |
| DG-TX-8  | Redondeo half-up a 2 decimales para display. La aritmética existente del FX provider `(amount / 100) * fxRate` es la convención; si un futuro cambio de `reports` necesita una regla distinta, ese cambio la introduce explícitamente.                                                                                                                                     | Alinea con la convención half-up implícita en `fx-rate-provider.dolar-api.ts`. `Transaction.convertedAmountMinor` almacena los centavos enteros directamente así que no se necesita redondeo al leer.                               | BR-TX-6                                                                                                                                                             |
| DG-TX-9  | Sin idempotency key en v1. CRUD de una sola fila en v1; reintentos en `5xx` PUEDEN crear un duplicado. La UI muestra un hint de "¿salió bien esto?" en falla de submit. Un campo `idempotencyKey` con `@@unique([userId, idempotencyKey])` es candidato a v1.1 (se agrega cuando aterriza el bulk import, que es cuando el riesgo de duplicados pasa de "raro" a "común"). | Más barato para v1; el hint de UI cierra el gap de UX. La idempotencia importa más para el endpoint de bulk import que se envía en v1.1.                                                                                            | Cerrado ahora; revisitado en v1.1                                                                                                                                   |
| DG-TX-10 | Single-user únicamente. Sin permiso `viewer` en v1; el scoping por `userId` es el único control de acceso.                                                                                                                                                                                                                                                                 | **Bloqueado en el grill de pre-propose.** Alinea con `openspec/specs/auth/spec.md:644-647`.                                                                                                                                         | BR-TX-4                                                                                                                                                             |
| DG-TX-11 | `memo` es opcional, sin largo mínimo, sin denylist de PII en v1. Largo máximo 500 chars (Zod). La denylist del logger se extiende para droppear contenido de `memo` (la higiene de PII es el BR, no una denylist sobre las escrituras).                                                                                                                                    | **Bloqueado en el grill de pre-propose.** Mínima fricción; la denylist del logger cierra el gap de PII-a-Sentry sin restringir la superficie de escritura.                                                                          | BR-TX-8                                                                                                                                                             |
| DG-TX-12 | El enum `direction` es `INCOME                                                                                                                                                                                                                                                                                                                                             | EXPENSE`en v1. El valor`TRANSFER`queda reservado pero se rechaza en la API. Regla de signo:`amountMinor`es siempre positivo;`direction` carga el signo.                                                                             | Los enteros siempre positivos son el invariante más simple de testear; `direction` es la fuente explícita del signo. Alinea con convenciones de money-value-object. | BR-TX-1, BR-TX-2 |
| DG-TX-13 | Rechazar `transactionDate` futuro con `FUTURE_DATE_NOT_ALLOWED` (400).                                                                                                                                                                                                                                                                                                     | Las fechas futuras son un error de autoría en v1 (sin pagos programados, sin recurrencia); un rechazo duro es la guarda más barata. El slice de recurrencia (v1.1) introduce la excepción de fecha futura cuando aterrice.          | BR-TX-3                                                                                                                                                             |
| DG-TX-14 | Paginación cursor: `?cursor=...&limit=...&accountId=...`. `limit` clamp a `1..100`. Espeja `list-accounts.action.ts` exactamente.                                                                                                                                                                                                                                          | Misma forma que el patrón existente; la smoke UI reusa el mismo footer de paginación.                                                                                                                                               | Cambio 3, BR-TX-10                                                                                                                                                  |
| DG-TX-15 | Hard delete en v1. Sin columna `archivedAt` en `Transaction`.                                                                                                                                                                                                                                                                                                              | **Cerrado por el proposer.** Las transacciones son descartables; hard delete es el camino más barato. Soft delete se puede agregar en un cambio futuro sin romper la FK ni el índice.                                               | BR-TX-7                                                                                                                                                             |

## Criterios de aceptación

El cambio está hecho cuando:

1. `pnpm test` corre la nueva suite de dominio + integración de
   `transactions` y sale 0 con **≥ 80% de cobertura en
   `src/modules/transactions/**`\*\* (capas domain + application).
2. `pnpm dev` → login → abrir `app/transactions/new` → elegir una cuenta USD
   → ingresar un monto en USD → enviar → la fila se crea con
   `convertedAmount` en la `casa` de la cuenta. La página de detalle
   renderiza `fxAsOfSnapshot` como `"Rate as of: <ISO>"`.
3. Un usuario sin cuentas ve el empty state en
   `app/transactions/page.tsx` (sin crash, sin footer roto).
4. `POST /api/transactions` con un `transactionDate` futuro devuelve
   `400 FUTURE_DATE_NOT_ALLOWED`.
5. `POST /api/transactions` con `direction: TRANSFER` devuelve
   `400 VALIDATION_ERROR` (el valor de enum está reservado para v1.1).
6. `POST /api/transactions` contra un `FinancialAccount` archivado devuelve
   `409 ACCOUNT_ARCHIVED`.
7. `GET /api/transactions/:id` para una transacción de otro usuario devuelve
   `404 NOT_FOUND` (sin leak de información).
8. `DELETE /api/transactions/:id` remueve la fila; un `GET /api/transactions/:id`
   siguiente devuelve `404`. No hay columna `archivedAt` en la tabla.
9. `GET /api/transactions?cursor=...&limit=20&accountId=...` devuelve hasta
   20 filas ordenadas por `transactionDate DESC` y un `nextCursor` cuando hay
   más filas.
10. La migración Prisma agrega el modelo `Transaction` y el enum
    `TransactionDirection` sobre una base de datos poblada. Las filas
    existentes de `FinancialAccount` y `User` quedan sin cambios. Verificado
    con `SELECT count(*) FROM "FinancialAccount"` antes y después de la
    migración.
11. El `TransactionService` está wired en `buildDefaultDeps` en
    `src/modules/api/app.ts:317`; el protectedApp monta las seis rutas entre
    las líneas 306 y 312.
12. Los eventos `transactions.create`, `transactions.update`,
    `transactions.delete`, y `transactions.fx.convert` se emiten vía el
    logger central; el evento `TransactionRecorded` se dispatcha vía el
    event dispatcher central (no se requiere subscriber en v1; sí la
    membresía de la unión).
13. `openspec/specs/transactions/spec.md` existe y declara BR-TX-1 a
    BR-TX-11 con al menos un Escenario cada uno.
14. Existen `./Documents-es/openspec/changes/transactions/proposal.md` y
    `./Documents-es/openspec/changes/transactions/explore.md` con estructura
    idéntica. Sin debris de caracteres chinos según el check de mirror de
    `AGENTS.md` raíz §13.3.
15. Sin drift de `pnpm-lock.yaml` después de stagear `package.json` (check
    de pre-commit de Husky según `AGENTS.md` raíz §5.3). Si v1 se envía sin
    nuevas deps, el lockfile queda sin cambios.
16. **Sin `new Date()` en código de dominio.** Cada servicio usa `Clock`
    (`src/shared/clock/clock.port.ts:22-24`); cada escritura pasa
    `clock.now()` para el default de `transactionDate` y el argumento
    `asOf` del FX.

## Riesgos

| Riesgo                                                                                                                                                  | Probabilidad | Mitigación                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La tabla `transactions` crece sin tope; la estrategia de paginación + índices debe estar en v1.                                                         | Media        | Paginación cursor + `@@index([userId, transactionDate])` y `@@index([accountId, transactionDate])`. Espeja `accounts` `@@index([userId, createdAt])`.                                                   |
| El snapshot FX al momento de escritura se desincroniza de la tasa actual (DG-TX-3).                                                                     | Baja         | La fila carga `fxAsOfSnapshot` así que la UI muestra "Rate as of: <ISO>" (según BR-TX-6). El endpoint de balance sigue siendo display-only y usa la tasa viva (BR-ACC-12).                              |
| Hard delete (DG-TX-15) borra por accidente una transacción que el usuario quería conservar.                                                             | Media        | La smoke UI muestra un diálogo de confirmación antes del `DELETE`. Una futura columna de soft-delete se puede agregar sin migración destructiva (aditiva).                                              |
| Sin idempotencia en `POST /api/transactions` (DG-TX-9): un reintento en `5xx` PUEDE crear un duplicado.                                                 | Baja–Media   | La smoke UI muestra un hint de submit-failure. v1.1 envía `idempotencyKey` cuando aterrice el bulk import.                                                                                              |
| El chequeo de `archivedAt` del módulo `accounts` en la capa de acción agrega un round-trip en cada create de transacción.                               | Baja         | El servicio carga la fila de cuenta una vez por escritura; el costo es un lookup indexado de PK por escritura, aceptable para CRUD manual.                                                              |
| El barrel público del nuevo módulo `transactions` crece con el tiempo y se desincroniza de la forma mínima de `accounts/index.ts`.                      | Baja         | El barrel se valida con un `index.test.ts` mínimo (espeja `src/modules/auth/index.test.ts`).                                                                                                            |
| El mirror en español se desincroniza del original en inglés.                                                                                            | Media        | Aplicar atomicidad de §13.3; el `reviewer` valida ambos archivos en el mismo commit.                                                                                                                    |
| Se salta el paso RED de strict TDD y falla el reviewer.                                                                                                 | Media        | `sdd-tasks` es dueña de la estructura de tareas; `sdd-apply` enforceza RED → GREEN → REFACTOR por tarea.                                                                                                |
| El nuevo modelo `Transaction` agrega un `@@index([accountId, transactionDate])` que no matchea el patrón de consulta eventual del slice de recurrencia. | Baja         | El slice de recurrencia v1.1 introduce su propia query; si necesita un índice distinto, la migración aditiva lo agrega.                                                                                 |
| PII en `memo` se filtra a logs / Sentry.                                                                                                                | Baja         | Agregar `memo` (y cualquier campo libre futuro) a la denylist del logger. La lista de strip es la superficie de contrato BR-AUTH-11 (`fx-rate-provider.dolar-api.ts` ya strippea payloads de DolarAPI). |

## Rollback

- **PR-1A no mergeado**: `git worktree remove ../gastos-personales-transactions-1A`,
  `git branch -D feat/transactions-1A`. Aún no hay callers.
- **PR-1A mergeado, PR-1B todavía no**: revertir PR-1A. El nuevo módulo
  `src/modules/transactions/` es aditivo; la eliminación es limpia porque
  nada lo importa todavía.
- **PR-1B mergeado, pre-release**: revertir PR-1B. Re-wire
  `buildDefaultDeps` para skipear `transactionService`; remover las rutas
  del protectedApp. La migración Prisma es aditiva y reversible (`DROP TABLE
"Transaction"` + drop del enum). El módulo `transactions` puede quedarse
  en disco (sin callers) o eliminarse como un paso separado.
- **PR enviado a producción**: stop. Los releases de producción están
  gobernados por el flow de release (`AGENTS.md` raíz §5.5) que requiere
  aprobación del usuario. Acá no se documenta ningún path automático de
  rollback.

## Dependencias

- **Inbound**: `accounts-ledger` (enviado) provee `FinancialAccount`,
  `AccountFxCasa`, `AccountCurrency`, y la forma de `AccountRepositoryPort`.
- **Inbound**: `fx-cache` (enviado) provee el port `FxRateProvider` (vive
  en `accounts` en
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts:90-100`),
  la forma `FxConversionRequest` / `FxConversionResult`, y la regla de
  resolución `account.casa ?? env.FX_DEFAULT_CASA` en
  `src/modules/accounts/application/actions/get-account-balance.action.ts:67-100`.
- **Inbound**: `auth-foundation` (enviado) provee el `authMiddleware` y
  `requireSession` (usado por la sub-app protegida en
  `src/modules/api/app.ts:131-184`) y el invariante `c.get('user')`
  (`AuthUser` no es nullable dentro del protectedApp).
- **Outbound**: `reports`, `snapshots` (futuros) consumen
  `TransactionRepositoryPort` y se subscriben a `TransactionRecorded`.
- **Externo**: ninguno. DolarAPI se accede vía el `FxRateProvider`
  existente; sin nuevo servicio externo.
- **Sin co-PRs**: `transactions` no bloquea ningún cambio en curso.

## Capabilities

> Esta sección es el CONTRATO entre esta propuesta y `sdd-spec`. La
> próxima fase lo lee para saber exactamente qué archivos de spec
> crear o actualizar.

### Nuevas capabilities

- `transactions`: dueña del agregado `Transaction`, del
  `TransactionRepositoryPort`, del `TransactionService`, de las cinco
  acciones CRUD, de la lógica de snapshot FX al momento de escritura, y
  del evento `TransactionRecorded`. La capability es read+write; su
  dependencia apunta al port `FxRateProvider` de `accounts` (nunca al
  revés), preservando el invariante de ports & adapters. La capability
  vive en `src/modules/transactions/` y envía su propia spec en
  `openspec/specs/transactions/spec.md`.

### Capabilities modificadas

- `accounts`: la spec gana un delta de una línea que anota la nueva FK
  `Transaction.accountId → FinancialAccount`. Sin cambio de comportamiento;
  el delta es un puntero cross-link para el lector de la spec.
- `errors`: el enum `ErrorCode` en
  `src/shared/errors/error-codes.ts:12-43` gana tres valores nuevos
  (`INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED`). La
  tabla de mapping en líneas 52-66 gana tres filas. Ningún código existente
  cambia de status.
- `events`: la unión `DomainEvent` en
  `src/shared/events/event-dispatcher.ts:3-5` gana un miembro
  (`TransactionRecorded`). Ningún payload de evento existente cambia.

## Alternativas consideradas

1. **Agregado `Transfer` en v1.** Dos filas de `Transaction` linkeadas por
   `transferGroupId`, escritas atómicamente. Rechazado: difiere la pregunta
   más cara (semántica de escritura atómica de dos filas) hasta que el
   patrón CRUD de cuenta única haya aterrizado y lo hayamos visto funcionar.
   v1.1 introduce `Transfer`.
2. **Sin snapshot FX en la fila (DG-TX-3 opción a).** Rechazado: totales
   históricos no determinísticos. Un balance computado para el mes pasado
   usaría la tasa de hoy, lo que es engañoso en períodos de alta inflación.
3. **Ambos original + convertido cacheado (DG-TX-3 opción c).** Rechazado:
   costo de storage y complejidad de reconciliación. El snapshot ES el
   valor convertido; sin segunda copia.
4. **Tabla `TransactionCategory` desde el día 1 (DG-TX-4 opción a).**
   Rechazado: el string libre es el mínimo de v1. Un cambio futuro promueve
   los strings más usados a una tabla tipada sin migración destructiva (la
   columna string se vuelve el label nullable; la FK de la tabla es aditiva).
5. **iCal RRULE para recurrencia (DG-TX-6 opción b).** Diferido: sin
   dependencia de parser cuando se envía v1. La forma tipada
   `frequency`/`interval`/`byMonthDay`/`byDay` alcanza para los casos de
   finanzas personales (mensual el día N, semanal el día-de-semana,
   quincenal, etc.).
6. **Cron warmup para recurrencia (DG-TX-7 opción b).** Diferido: la
   generación on-demand en la carga del dashboard alcanza para el ritmo
   manual-CRUD del usuario de v1.
7. **Idempotency keys desde el día 1 (DG-TX-9 opción a).** Diferido: el
   riesgo de duplicados en CRUD manual es raro. El hint de UI cierra el
   gap para v1; v1.1 envía la key cuando el bulk import vuelve real el
   riesgo.
8. **Soft delete vía `archivedAt` (DG-TX-15 opción a).** Rechazado para
   v1: las transacciones son descartables; hard delete es el camino más
   barato. Un cambio futuro puede introducir `archivedAt` aditivamente sin
   romper la FK ni el índice.

## Forecast (auto-chain, budget de 400 líneas)

| PR  | Scope                                                                                                                                                                                                                                                                                                                                     | Líneas aprox. | Status |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| 1A  | Módulo `src/modules/transactions/`: entidad + port + servicio + acciones + DTO + Zod + adapter Prisma + fixture InMemoryRepository + tests de servicio + tests de acción + smoke de integración (`spec-scenarios.test.ts`). Modelo Prisma + enum + migración.                                                                             | ~450          | Auto   |
| 1B  | Rutas Hono montadas en `protectedApp`; `buildDefaultDeps` wirea el servicio + repositorio; `app.transactions.test.ts`; smoke UI (`app/transactions/{page,new/page,[id]/page}.tsx`); adiciones de códigos de error; nombres de eventos del logger; evento `TransactionRecorded`; delta de spec + spec canónica; mirror de `Documents-es/`. | ~350          | Auto   |
|     | **Total**                                                                                                                                                                                                                                                                                                                                 | **~800**      |        |

PR-1A excede por un margen chico el budget de review de 400 líneas (la
fixture InMemoryRepository + 12+ tests de servicio dominan). La estrategia
auto-chain mantiene el foco de review ajustado: PR-1A es self-contained (sin
rutas, sin UI); PR-1B lo wirea.

## Audit trail

- **v1** (esta propuesta, 2026-06-22) — primera escritura de la propuesta
  de `transactions`. Cierra DG-TX-1, DG-TX-4, DG-TX-5, DG-TX-6, DG-TX-7,
  DG-TX-8, DG-TX-9, DG-TX-10, DG-TX-12, DG-TX-13, DG-TX-14, DG-TX-15 (12
  decisiones cerradas por el proposer). Traslada DG-TX-2, DG-TX-3, DG-TX-11
  como inputs bloqueados del grill de pre-propose. Scope: agregado
  `Transaction` + CRUD + multi-moneda vía `fx` + smoke UI. Adjuntos y
  recurrencia diferidos a v1.1.

Refs:

- `openspec/changes/transactions/explore.md` — el artefacto de explore
  upstream (15 DG-TX-N + 4 preguntas abiertas, ~50 citas file:line).
- `openspec/specs/accounts/spec.md` — BR-ACC-12 (storage nunca convertido),
  BR-ACC-13 (stale no es 5xx), el cross-link de `casa`. Todos trasladados
  verbatim.
- `openspec/specs/fx/spec.md` — REQ-FX-3 (la resolución de casa es
  responsabilidad del caller), REQ-FX-9 (migración aditiva). Todos
  trasladados verbatim; las líneas 95-98 contemplan explícitamente esta
  capability.
- `openspec/specs/auth/spec.md` — invariante del helper server-side
  `auth()`, superficie pública de 7 exports. Invariante cross-module para
  cada endpoint de `transactions`.
- `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts:90-100` —
  el port que el nuevo `TransactionService` consume sin cambios.
- `src/modules/accounts/application/actions/get-account-balance.action.ts:67-100` —
  el call site canónico de resolución de casa + conversión que el
  `TransactionService` espeja para la ruta de create.
- `src/modules/accounts/domain/interfaces/account.repository.port.ts` —
  la forma de `AccountRepositoryPort` que el nuevo
  `TransactionRepositoryPort` espeja.
- `src/modules/api/app.ts:192-312` — el protectedApp donde se montan las
  seis rutas nuevas.
- `src/shared/events/event-dispatcher.ts:3-5` — la unión a la que se suma
  el evento `TransactionRecorded`.
- `src/shared/errors/error-codes.ts:12-43` — el enum al que se suman los
  tres códigos nuevos.
- `openspec/AGENTS.md:42-67` — regla de atribución de autoría.
- `AGENTS.md` raíz §13 — política de mirror documental en doble idioma.
