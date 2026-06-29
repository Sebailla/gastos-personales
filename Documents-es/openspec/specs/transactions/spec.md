# Spec — capability `transactions`

**Autor**: Sebastián Illa
**Capability**: `transactions`
**Cambio fuente**: `transactions`
**Estado**: active · **Creado**: 2026-06-22 · **Última sync**: 2026-06-22 (transactions)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (heredado de `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4

> Primera escritura de la spec de la capability `transactions`.
> Operationaliza la propuesta de `transactions` (borrador
> 2026-06-22) más las 15 decisiones de producto cerradas en la
> misma sesión (DG-TX-1 a DG-TX-15, ver "Closed decisions" más
> abajo). La spec declara **qué debe ser verdadero** después
> de que el cambio aterrice, no cómo implementarlo. Los
> detalles de implementación (rutas de archivos, sintaxis del
> schema, layout de tests) se limitan a lo que requiere el
> contrato cross-module.
>
> Esta es la spec canónica de la capability `transactions`. La
> carpeta del cambio es `openspec/changes/transactions/`; el
> espejo delta vive en
> `openspec/changes/transactions/specs/transactions/spec.md`.
> Los dos archivos se mantienen en lockstep; la canónica es la
> source of truth y la delta la espeja. `sdd-archive` mueve la
> carpeta del cambio a
> `openspec/changes/archive/YYYY-MM-DD-transactions/` después
> de que la verificación cierre; esta spec canónica queda en
> `openspec/specs/transactions/spec.md`.

## Closed decisions (DG-TX-1 a DG-TX-15 — 2026-06-22)

Los 15 vacíos de decisión son autoritativos cuando modifican o
extienden la propuesta. La spec los refleja como Requirements y
BRs, no como una sección separada de "decisiones". Los IDs de
decisión se referencian inline en los Scenario bodies
correspondientes.

| Vacío    | Decisión                                                                                                   | Rationale                                                                                                       | Codificado en    |
| -------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------- |
| DG-TX-1  | Hard delete; `amountMinor` siempre positivo; campos requeridos vs. opcionales como en propuesta §Change 1. | Las transacciones son descartables; camino más barato. Sin columnas de auditoría espeja `accounts`.             | BR-TX-1, BR-TX-7 |
| DG-TX-2  | Solo una cuenta en v1. Sin agregado `Transfer`.                                                            | **Bloqueado en el grill de pre-propose.** Difiere la escritura atómica de dos filas hasta que aterrice el CRUD. | BR-TX-2          |
| DG-TX-3  | Snapshot al momento de escritura: la fila carga original + convertido + `fxAsOfSnapshot` + `casa`.         | **Bloqueado en el grill de pre-propose.** Totales históricos determinísticos.                                   | BR-TX-6          |
| DG-TX-4  | String libre `category: String?`. Sin tabla `TransactionCategory`.                                         | Mínima fricción para v1. Una tabla tipada es una migración aditiva futura.                                      | BR-TX-9          |
| DG-TX-5  | Port `AttachmentStorage` + `LocalDiskAttachmentStorage` para dev/CI. Diferido a v1.1.                      | **Bloqueado en el grill de pre-propose.** Interfaz adapter desde el día 1; swap no rompedor.                    | Candidato v1.1   |
| DG-TX-6  | Frecuencia a nivel de dominio (`frequency`, `interval`, `byMonthDay`, `byDay`). Diferido a v1.1.           | **Bloqueado en el grill de pre-propose.** Sin dep de parser iCal; sin Cron.                                     | Candidato v1.1   |
| DG-TX-7  | Generación on-demand en la carga del dashboard. Diferido a v1.1.                                           | **Bloqueado en el grill de pre-propose.** Cutoff para v1; background jobs fuera.                                | Candidato v1.1   |
| DG-TX-8  | Redondeo half-up a 2 decimales para display.                                                               | Alinea con la convención half-up implícita en `fx-rate-provider.dolar-api.ts`.                                  | BR-TX-6          |
| DG-TX-9  | Sin `idempotencyKey` en v1. La UI muestra un hint de submit-failure.                                       | Más barato en v1; el riesgo de duplicados en CRUD manual es raro.                                               | (Candidato v1.1) |
| DG-TX-10 | Single-user únicamente. Scoping por `userId` es el único control de acceso.                                | **Bloqueado en el grill de pre-propose.** Alinea con invariante cross-module de `auth/spec.md`.                 | BR-TX-4          |
| DG-TX-11 | `memo` opcional, máximo 500 chars; sin denylist de PII; el logger strippea `memo`.                         | **Bloqueado en el grill de pre-propose.** Mínima fricción; denylist del logger cierra PII-a-Sentry.             | BR-TX-8          |
| DG-TX-12 | Enum `direction` = `INCOME \| EXPENSE` en v1. `TRANSFER` reservado; rechazado en API.                      | Enteros siempre positivos son el invariante más simple; `direction` es la fuente del signo.                     | BR-TX-1, BR-TX-2 |
| DG-TX-13 | Rechazar `transactionDate` futuro con `FUTURE_DATE_NOT_ALLOWED` (400).                                     | Fechas futuras son un error de autoría en v1 (sin pagos programados, sin recurrencia).                          | BR-TX-3          |
| DG-TX-14 | Paginación cursor `?cursor=...&limit=...&accountId=...`. `limit` clamp a `1..100`.                         | Misma forma que `list-accounts.action.ts`; la smoke UI reusa el mismo footer.                                   | BR-TX-10         |
| DG-TX-15 | Hard delete en v1. Sin columna `archivedAt` en `Transaction`.                                              | **Cerrado por el proposer.** Las transacciones son descartables; hard delete es el camino más barato.           | BR-TX-7          |

Las alternativas consideradas para cada vacío están registradas
en la propuesta §"Alternatives considered" y §"Closed
decisions". Adjuntos, recurrencia e idempotencia quedan fuera
de v1 según la propuesta §"Out of scope".

## Purpose

La capability `transactions` es el **libro mayor de
transacciones** de `gastos-personales`. Es dueña del registro
manual de gastos e ingresos del usuario (CRUD) más una
superficie de display multi-moneda que llama al port
`FxRateProvider` de la capability `fx` al momento de escritura.
La capability garantiza que: (a) cada transacción es dueña de
exactamente un `User` autenticado y exactamente un
`FinancialAccount` (los invariantes cross-module heredados de
`auth` y `accounts`); (b) el snapshot multi-moneda se captura
**una vez, al momento de escritura**, y se persiste en la fila
para que los totales históricos sean determinísticos; (c) la
superficie FX es **solo display al momento de escritura** — el
`amountMinor` nativo es el número autoritativo en la fila, y el
`convertedAmountMinor` es un snapshot, nunca una mutación del
estado nativo; (d) la smoke UI permite a un developer o PM
ejercer el flujo CRUD end-to-end sin curl en menos de cinco
minutos, espejando la smoke slice de `accounts`.

La capability expone una superficie de escritura estable, de
capa de presentación — `{ amountMinor, currency, accountId,
direction, transactionDate, memo?, category?,
convertedAmountMinor, convertedCurrency, fxAsOfSnapshot? }` —
que cualquier consumer (`reports`, `snapshots`) puede leer o
suscribirse vía `TransactionRepositoryPort` y el evento de
dominio `TransactionRecorded` sin aprender los detalles
upstream.

## Scope

### In scope

- Nuevo modelo Prisma `Transaction` y un enum
  (`TransactionDirection`).
- Nuevo módulo `src/modules/transactions/` espejando la forma
  de `accounts` (`domain/entities`,
  `domain/interfaces/transaction.repository.port.ts`,
  `domain/services/transaction.service.ts`,
  `application/actions/{list,get,create,update,delete}-transaction.action.ts`,
  `application/dto/transaction.dto.ts`,
  `application/validation/transaction-create.schema.ts`,
  `infrastructure/repositories/transaction.repository.prisma.ts`).
- Seis endpoints Hono bajo `/api/transactions` montados en la
  protectedApp catch-all existente (el archivo
  `app/api/[...path]/route.ts` no se modifica).
- Tres nuevos códigos de error (`INVALID_AMOUNT`,
  `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED`) agregados a
  `src/shared/errors/error-codes.ts`.
- Un nuevo evento de dominio (`TransactionRecorded`) agregado
  a la unión `DomainEvent` en
  `src/shared/events/event-dispatcher.ts`.
- Cuatro nuevos nombres de eventos estructurados de log
  (`transactions.create`, `transactions.update`,
  `transactions.delete`, `transactions.fx.convert`).
- Adiciones de wiring de DI en
  `src/modules/api/app.ts:317-352` (`buildDefaultDeps`) — un
  nuevo servicio, un nuevo repositorio.
- Tres páginas de Next.js App Router bajo
  `app/transactions/*` (smoke UI; espeja `app/accounts/*`).
- Extensión de la denylist del logger para droppear contenido
  de `memo` (BR-TX-8; higiene de PII es el BR).

### Out of scope

- **Transfers entre dos cuentas.** Diferido a v1.1 (sin
  agregado `Transfer`, sin `transferGroupId`).
- **Adjuntos** (recibos, facturas). Diferido a v1.1; sin
  modelo `Attachment`, sin port `AttachmentStorage`.
- **Recurrencia.** Diferido a v1.1; sin modelo
  `RecurrenceRule`, sin generador on-demand, sin Cron, sin
  BullMQ.
- **Idempotency keys.** Diferido a v1.1 (introducido cuando
  aterrice el bulk import; el riesgo de duplicados en CRUD
  manual es raro).
- **Importación bancaria / CSV upload.** Fuera de v1.
- **OCR en recibos.** Fuera de v1.
- **Multi-user / cuentas compartidas / visor read-only.** v1
  es single-user según BR-TX-4.
- **Push notifications.** Fuera de v1.
- **Archivo histórico de FX para transacciones back-dated.** La
  tasa es la tasa al momento de escritura; la fila carga
  `fxAsOfSnapshot` así que la UI muestra "Rate as of: <ISO>".
- **Categorización con IA.** Fuera de v1.
- **Reglas de presupuesto / límites de gasto.** Fuera de v1
  (territorio de `reports`).
- **UI de producción.** La smoke UI bajo `app/transactions/`
  es smoke-minimal; una UI de producción es el cambio
  `transactions-ui`.
- **App mobile.** Fuera de v1.

### Capability boundary

- `transactions` es dueña del agregado `Transaction`, del
  `TransactionRepositoryPort`, del `TransactionService`, de las
  cinco acciones CRUD, de la lógica de snapshot FX al momento
  de escritura, y del evento `TransactionRecorded`.
- `accounts` es dueña del modelo `FinancialAccount`, de la
  interfaz del port `FxRateProvider`, y de los enums
  `AccountCurrency` / `AccountFxCasa`.
- `fx` es dueña de la implementación concreta de
  `FxRateProvider` y del cache de tasas.
- La dependencia apunta desde `transactions` al port
  `FxRateProvider` de `accounts` y al modelo
  `FinancialAccount` de `accounts` (read-only) — nunca al
  revés, preservando el invariante de ports & adapters.
- `transactions` NO debe importar desde `fx` directamente; va
  a través del port `FxRateProvider` declarado en `accounts`.
- `transactions` NO debe leer el repository port de otro
  módulo para rutas de escritura; la fila padre de
  `FinancialAccount` la carga `transactions` a través de
  `AccountRepositoryPort` (pre-check BR-TX-5).

## Entities

La spec es a nivel de interfaz. Las formas de abajo son parte
del contrato que cruza la frontera `transactions` ↔ consumer
(UI, `reports`, `snapshots`).

### `Transaction`

La entidad única de source-of-truth para las transacciones del
usuario. Una fila por entrada manual. Una fila es dueña de
exactamente un `User` (invariante cross-module heredado de
`auth`) y referencia exactamente un `FinancialAccount`
(invariante cross-module heredado de `accounts`).

| Field                  | Tipo                    | Constraints                                                                                  |
| ---------------------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| `id`                   | `string` (cuid)         | Primary key. Generada server-side. Inmutable.                                                |
| `userId`               | `string` (cuid)         | FK a `User.id`. `onDelete: Cascade`. Invariante cross-module (capability `auth`).            |
| `accountId`            | `string` (cuid)         | FK a `FinancialAccount.id`. `onDelete: Cascade`. Invariante cross-module (`accounts`).       |
| `direction`            | `TransactionDirection`  | Uno de `INCOME \| EXPENSE` en v1. `TRANSFER` reservado para v1.1 (rechazado en API).         |
| `amountMinor`          | `Int`                   | Unidades menores. Siempre positivo; el signo viene de `direction`. No positivo → 400.        |
| `currency`             | `AccountCurrency`       | Uno de `ARS \| USD \| EUR`.                                                                  |
| `memo`                 | `string \| null`        | Opcional. Máximo 500 chars (Zod). Sin largo mínimo. Sin denylist de PII en v1 (BR-TX-8).     |
| `category`             | `string \| null`        | Opcional. String libre. Sin tabla `TransactionCategory` en v1 (BR-TX-9).                     |
| `transactionDate`      | `DateTime`              | NO en el futuro relativo a `Clock.now()`. Futuro → 400 `FUTURE_DATE_NOT_ALLOWED`.            |
| `convertedAmountMinor` | `Int`                   | Monto display en la moneda `casa` de la cuenta padre. Snapshotteado al momento de escritura. |
| `convertedCurrency`    | `AccountCurrency`       | La moneda `casa` de la cuenta padre al momento de escritura. Siempre poblada.                |
| `fxAsOfSnapshot`       | `DateTime \| null`      | Timestamp del snapshot. `null` sii `currency === convertedCurrency` (no se llamó FX).        |
| `casaSnapshot`         | `AccountFxCasa \| null` | La casa usada al momento de escritura. `null` sii `currency === convertedCurrency`.          |
| `createdAt`            | `DateTime`              | Server-set en el insert.                                                                     |
| `updatedAt`            | `DateTime`              | Server-set en cada mutación.                                                                 |

Invariantes:

- `amountMinor > 0` se enforceza en la frontera de la acción
  (BR-TX-1).
- `direction ∈ { INCOME, EXPENSE }` en escrituras de v1
  (BR-TX-2).
- `transactionDate <= Clock.now()` en la frontera de la acción
  (BR-TX-3).
- `convertedCurrency` siempre es igual a la moneda del
  `casa` del `FinancialAccount` padre al momento de escritura.
- `convertedAmountMinor` es el resultado en centavos enteros
  de aplicar la tasa del snapshot a `amountMinor` (BR-TX-6).
- `fxAsOfSnapshot IS NULL` sii
  `currency === convertedCurrency`.
- Acceso cross-user devuelve `404 NOT_FOUND` (sin leak de
  información), según invariante cross-module de `auth/spec.md`.
- La fila NO carga columna `archivedAt` (BR-TX-7).

Indexes:

- `@@index([userId, transactionDate])` — endpoint de listado.
- `@@index([accountId, transactionDate])` — listado por cuenta.

### Enums

- `TransactionDirection`: `INCOME \| EXPENSE \| TRANSFER`.
  Solo `INCOME` y `EXPENSE` se aceptan en la API en v1
  (BR-TX-2). `TRANSFER` está reservado para v1.1.

## Business rules

Las reglas de abajo son normativas. Cada regla tiene un ID
estable para trazabilidad a través de spec, design,
implementación y tests. Los BRs trasladados (BR-ACC-12,
BR-ACC-13, BR-FX-3) se importan verbatim de
`openspec/specs/accounts/spec.md` y `openspec/specs/fx/spec.md`.

- **BR-ACC-12 (trasladado)** — El storage nunca se convierte.
  El `amountMinor` nativo es el número autoritativo en la fila.
  El `convertedAmountMinor` es un snapshot, no una mutación
  del valor nativo. (Fuente: `openspec/specs/accounts/spec.md`,
  `openspec/specs/fx/spec.md:314-323`.)
- **BR-ACC-13 (trasladado)** — FX stale no es un 5xx. El
  `FxRateProvider` devuelve la tasa con `fxAsOf` incluso
  cuando está stale; la escritura de la transacción muestra el
  timestamp del snapshot en la respuesta para que la UI pueda
  renderizar "Rate as of: <ISO>".
- **BR-FX-3 (trasladado)** — La resolución de casa es
  responsabilidad del caller. El `TransactionService` resuelve
  `account.casa ?? env.FX_DEFAULT_CASA` en el call site de la
  acción, nunca dentro del provider.
- **BR-TX-1 (NUEVO)** — `Transaction.amountMinor` es siempre
  positivo; el signo viene de `direction`. Un valor no positivo
  en la frontera de la API se rechaza con `INVALID_AMOUNT`
  (400).
- **BR-TX-2 (NUEVO)** — `direction` es uno de `INCOME |
EXPENSE` en v1. El valor de enum `TRANSFER` queda reservado
  para v1.1 y se rechaza en la frontera de la API en v1.
- **BR-TX-3 (NUEVO)** — `Transaction.transactionDate` nunca
  está en el futuro relativo a `Clock.now()`. Una fecha futura
  en la frontera de la API se rechaza con
  `FUTURE_DATE_NOT_ALLOWED` (400).
- **BR-TX-4 (NUEVO)** — Cada referencia cross-module a una
  transacción escopa a `userId`. No existe la API
  `findById(id)`; `findById(userId, id)` devuelve `null` en
  miss O cross-user.
- **BR-TX-5 (NUEVO)** — No se puede crear una `Transaction`
  contra un `FinancialAccount` archivado. La capa de acción
  pre-chequea `account.archivedAt` y rechaza con
  `ACCOUNT_ARCHIVED` (409).
- **BR-TX-6 (NUEVO)** — El monto convertido se captura al
  momento de escritura. Cuando `transaction.currency === casa`
  currency, la llamada FX se saltea y `convertedAmountMinor`
  espeja `amountMinor` y `fxAsOfSnapshot` es `null`.
- **BR-TX-7 (NUEVO)** — Hard delete es la política de v1. No
  hay columna `archivedAt` en `Transaction`; `DELETE` remueve
  la fila permanentemente.
- **BR-TX-8 (NUEVO)** — `memo` es opcional. Sin largo mínimo,
  sin denylist de PII en v1. Largo máximo 500 chars enforceado
  por Zod. El logger estructurado strippea el contenido de
  `memo` de los eventos de log.
- **BR-TX-9 (NUEVO)** — `category` es un string libre (sin
  tabla `TransactionCategory` en v1).
- **BR-TX-10 (NUEVO)** — La paginación es cursor-based
  (`?cursor=...&limit=...&accountId=...`). `limit` se clamp a
  `1..100` en la frontera de la API.
- **BR-TX-11 (NUEVO)** — El evento de dominio
  `TransactionRecorded` se emite después de un create exitoso.
  El payload incluye el monto convertido y el timestamp del
  snapshot.

## Operations

La capability expone cinco operaciones a través del
`TransactionRepositoryPort` y cinco endpoints Hono. Las
operaciones son a nivel de interfaz: describen qué debe ser
verdadero, no los nombres de clase o las rutas de archivos que
las implementan.

### `create(userId, input)`

Persiste una nueva fila de `Transaction` owned por `userId`
contra el `FinancialAccount` padre. Pasos:

1. Validar el input con la `transactionCreateSchema` de Zod
   (direction validado, amount positivo, transactionDate no
   futuro).
2. Cargar el `FinancialAccount` padre vía
   `AccountRepositoryPort.findById(userId, accountId)`.
3. Rechazar con `ACCOUNT_ARCHIVED` (409) si
   `account.archivedAt` es no-null (BR-TX-5).
4. Resolver la casa vía
   `account.casa ?? env.FX_DEFAULT_CASA` (BR-FX-3 trasladado).
5. Computar el monto convertido:
   - Si `transaction.currency === casa currency`: saltear la
     llamada FX; setear `convertedAmountMinor = amountMinor`,
     `convertedCurrency = transaction.currency`,
     `fxAsOfSnapshot = null`, `casaSnapshot = null`.
   - Else: llamar `FxRateProvider.getDisplayAmount({ casa })`;
     almacenar el resultado como `convertedAmountMinor` /
     `convertedCurrency` / `fxAsOfSnapshot` /
     `casaSnapshot`. Stale está permitido (BR-ACC-13
     trasladado).
6. Persistir la fila.
7. Emitir el evento estructurado de log `transactions.create`
   (`{ userId, accountId, direction, amountMinor, currency,
casa, fxAsOf }`).
8. Emitir el evento estructurado de log
   `transactions.fx.convert` cuando efectivamente ocurrió una
   llamada FX (`{ userId, casa, native, display, fxAsOf,
stale }`).
9. Despachar el evento de dominio `TransactionRecorded`
   (`{ userId, transactionId, accountId, direction,
amountMinor, currency, casa, convertedAmountMinor,
convertedCurrency, occurredAt }`).
10. Devolver la nueva fila.

### `getById(userId, id)`

Devuelve la fila de `Transaction` owned por `userId` con el
`id` dado, o `null` en miss O cross-user (BR-TX-4). La capa de
acción mapea `null` a `404 NOT_FOUND`.

### `list(userId, { cursor, limit, accountId? })`

Devuelve una página cursor-paginada de filas de `Transaction`
owned por `userId`, ordenadas por `transactionDate`
descendente. Cuando se provee `accountId`, la página se filtra
a esa cuenta. `limit` se clamp a `1..100` (BR-TX-10).

### `update(userId, id, patch)`

Aplica un patch parcial (`amountMinor`, `currency`,
`transactionDate`, `memo`, `category`) a la fila owned por
`userId` con el `id` dado. El snapshot FX se recompila **solo
si** cambió `amountMinor` o `currency`; en caso contrario se
preserva el snapshot existente. Devuelve la fila actualizada, o
`null` en miss O cross-user.

### `delete(userId, id)`

Hard-deletea la fila de `Transaction` owned por `userId` con el
`id` dado (BR-TX-7). Devuelve `null` en miss O cross-user. No
hay archive; la fila se va.

## Requirements

### Data model

#### Requirement: Transaction persiste la fila de snapshot multi-moneda (REQ-TX-1)

El sistema DEBE persistir una fila de `Transaction` cuya forma
matchee la tabla de la entidad. El sistema DEBE enforcezar los
dos indexes (`@@index([userId, transactionDate])` y
`@@index([accountId, transactionDate])`). El sistema NO DEBE
agregar una columna `archivedAt` al modelo `Transaction`.
(Traces: BR-TX-6, BR-TX-7, DG-TX-1, DG-TX-3.)

#### Scenario: Escritura en USD contra una casa ARS snappea la conversión

- GIVEN: un usuario es dueño de un `FinancialAccount` con
  `currency = ARS` AND `casa = oficial`
- WHEN: el usuario postea `POST /api/transactions` con
  `direction = EXPENSE`, `amountMinor = 1000`,
  `currency = USD`, `accountId = <esa cuenta>`
- THEN: el response status es `201`
- AND: el `amountMinor` de la fila es `1000`
- AND: el `convertedAmountMinor` de la fila es no-null y está
  en ARS
- AND: el `convertedCurrency` de la fila es `ARS`
- AND: el `fxAsOfSnapshot` de la fila es un timestamp ISO
  no-null
- AND: el `casaSnapshot` de la fila es `OFICIAL`

#### Scenario: Escritura en ARS contra una casa ARS saltea la llamada FX

- GIVEN: un usuario es dueño de un `FinancialAccount` con
  `currency = ARS` AND `casa = oficial`
- WHEN: el usuario postea `POST /api/transactions` con
  `direction = INCOME`, `amountMinor = 5000`,
  `currency = ARS`, `accountId = <esa cuenta>`
- THEN: el response status es `201`
- AND: el `convertedAmountMinor` de la fila es igual a
  `amountMinor`
- AND: el `fxAsOfSnapshot` de la fila es `null`
- AND: el `casaSnapshot` de la fila es `null`
- AND: no se emitió ninguna llamada a `FxRateProvider`

#### Scenario: El schema preserva determinismo histórico

- GIVEN: una fila de `Transaction` creada hace 6 meses con
  `amountMinor = 1000`, `currency = USD`,
  `convertedAmountMinor = 1100000`, `convertedCurrency = ARS`,
  `fxAsOfSnapshot = <ISO>`
- WHEN: la tasa FX de hoy es `1200000` ARS/USD (un valor
  distinto)
- THEN: el `convertedAmountMinor` de la fila histórica sigue
  siendo `1100000` (el snapshot al momento de escritura, no la
  tasa viva)

#### Scenario: Hard delete remueve la fila

- GIVEN: existe una fila de `Transaction` con `id = X` y
  `userId = <caller>`
- WHEN: el owner llama `DELETE /api/transactions/X`
- THEN: el response status es `204` (o `200`)
- AND: un `GET /api/transactions/X` siguiente devuelve `404`
- AND: no existe columna `archivedAt` en la tabla
  `Transaction`

### Validation

#### Requirement: amountMinor es estrictamente positivo (REQ-TX-2)

El sistema DEBE rechazar un body de `POST /api/transactions`
cuyo `amountMinor <= 0` con `400 INVALID_AMOUNT`. El signo
viene de `direction`, nunca de un `amountMinor` negativo.
(Traces: BR-TX-1, DG-TX-12.)

#### Scenario: Monto cero es rechazado

- GIVEN: cualquier sesión autenticada
- WHEN: `POST /api/transactions` se llama con
  `amountMinor = 0`
- THEN: el response status es `400`
- AND: el `error.code` del response body es `INVALID_AMOUNT`
- AND: no se crea ninguna fila

#### Scenario: Monto negativo es rechazado

- GIVEN: cualquier sesión autenticada
- WHEN: `POST /api/transactions` se llama con
  `amountMinor = -100`
- THEN: el response status es `400`
- AND: el `error.code` del response body es `INVALID_AMOUNT`
- AND: no se crea ninguna fila

#### Requirement: El enum direction es INCOME o EXPENSE en v1 (REQ-TX-3)

El sistema DEBE aceptar `direction ∈ { INCOME, EXPENSE }` en
la frontera de la API. El sistema DEBE rechazar
`direction = TRANSFER` con `400 VALIDATION_ERROR` (el valor de
enum está reservado para v1.1). El sistema DEBE almacenar el
valor de `direction` verbatim. (Traces: BR-TX-2, DG-TX-12.)

#### Scenario: TRANSFER es rechazado

- GIVEN: cualquier sesión autenticada
- WHEN: `POST /api/transactions` se llama con
  `direction = TRANSFER`
- THEN: el response status es `400`
- AND: el `error.code` del response body es `VALIDATION_ERROR`
- AND: no se crea ninguna fila

#### Requirement: transactionDate nunca está en el futuro (REQ-TX-4)

El sistema DEBE rechazar un body de `POST /api/transactions`
cuyo `transactionDate > Clock.now()` con `400
FUTURE_DATE_NOT_ALLOWED`. El campo `transactionDate` es
requerido. (Traces: BR-TX-3, DG-TX-13.)

#### Scenario: Hoy está permitido

- GIVEN: `Clock.now()` devuelve hoy
- WHEN: `POST /api/transactions` se llama con
  `transactionDate = <hoy>`
- THEN: el response status es `201` (o `400` por una falla de
  validación no relacionada)

#### Scenario: Mañana es rechazado

- GIVEN: `Clock.now()` devuelve hoy
- WHEN: `POST /api/transactions` se llama con
  `transactionDate = <mañana>`
- THEN: el response status es `400`
- AND: el `error.code` del response body es
  `FUTURE_DATE_NOT_ALLOWED`
- AND: no se crea ninguna fila

#### Requirement: memo es opcional y capeado a 500 chars (REQ-TX-5)

El sistema DEBE aceptar un campo `memo` que sea null O un
string de 1–500 chars. El sistema DEBE rechazar un `memo` de
más de 500 chars con `400 VALIDATION_ERROR`. El sistema NO
DEBE deny-listar ningún contenido de `memo` en la frontera de
escritura. (Traces: BR-TX-8, DG-TX-11.)

#### Scenario: memo de 500 chars es aceptado

- GIVEN: una sesión autenticada
- WHEN: `POST /api/transactions` se llama con un `memo` de
  500 chars
- THEN: el response status es `201`

#### Scenario: memo de 501 chars es rechazado

- GIVEN: una sesión autenticada
- WHEN: `POST /api/transactions` se llama con un `memo` de
  501 chars
- THEN: el response status es `400`
- AND: el `error.code` del response body es `VALIDATION_ERROR`

### Authorization and access control

#### Requirement: Todos los endpoints escopan al usuario autenticado (REQ-TX-6)

Cada endpoint bajo `/api/transactions/*` DEBE requerir una
sesión autenticada resuelta vía `auth()` desde
`src/modules/auth/index.ts`. El sistema DEBE derivar `userId`
de la sesión y NO DEBE confiar en ningún `userId` de los
bodies de request. Cada referencia cross-module a una fila de
`Transaction` DEBE escopar a `userId`; lecturas cross-user
devuelven `404 NOT_FOUND` (sin leak de información).
(Traces: BR-TX-4, DG-TX-10; invariante cross-module de
`auth/spec.md`.)

#### Scenario: 401 en cada endpoint cuando no hay sesión

- GIVEN: no hay cookie `authjs.session-token`
- WHEN: cualquiera de los seis endpoints se llama
- THEN: el response status es `401 UNAUTHORIZED`
- AND: no se devuelve data

#### Scenario: Lectura cross-user devuelve 404

- GIVEN: el usuario A es dueño de una `Transaction` con
  `id = X`
- WHEN: el usuario B llama `GET /api/transactions/X`
- THEN: el response status es `404 NOT_FOUND`
- AND: el response body no leakea la existencia de la fila

#### Scenario: Update cross-user devuelve 404

- GIVEN: el usuario A es dueño de una `Transaction` con
  `id = X`
- WHEN: el usuario B llama `PATCH /api/transactions/X`
- THEN: el response status es `404 NOT_FOUND`
- AND: la fila no se modifica

#### Scenario: Delete cross-user devuelve 404

- GIVEN: el usuario A es dueño de una `Transaction` con
  `id = X`
- WHEN: el usuario B llama `DELETE /api/transactions/X`
- THEN: el response status es `404 NOT_FOUND`
- AND: la fila no se borra

#### Requirement: Cuenta archivada rechaza escrituras nuevas (REQ-TX-7)

La capa de acción DEBE pre-chequear el `archivedAt` del
`FinancialAccount` padre. Si `archivedAt` es no-null, el
sistema DEBE rechazar `POST /api/transactions` y `PATCH
/api/transactions` (que cambia `accountId`) con `409
ACCOUNT_ARCHIVED`. (Traces: BR-TX-5.)

#### Scenario: Escritura contra una cuenta archivada es rechazada

- GIVEN: un `FinancialAccount` owned por el caller con
  `archivedAt = <ISO>` (no-null)
- WHEN: el caller postea `POST /api/transactions` con
  `accountId = <esa cuenta>`
- THEN: el response status es `409`
- AND: el `error.code` del response body es `ACCOUNT_ARCHIVED`
- AND: no se crea ninguna fila

### Endpoints

#### Requirement: GET /api/transactions devuelve un listado cursor-paginado (REQ-TX-8)

El sistema DEBE devolver un listado paginado de las
transacciones del usuario autenticado, ordenado por
`transactionDate` descendente. El endpoint DEBE soportar
`?cursor=<opaque>&limit=<n>&accountId=<id>`. El `limit` por
defecto es 20, el mínimo es 1, el máximo es 100. Cuando se
provee `accountId`, el listado DEBE filtrarse a esa cuenta.
(Traces: BR-TX-10, DG-TX-14.)

#### Scenario: El listado devuelve las transacciones del usuario

- GIVEN: el usuario autenticado tiene 3 transacciones
- WHEN: `GET /api/transactions` se llama
- THEN: el response status es `200`
- AND: el response body contiene un array `data` con 3
  entries, ordenadas por `transactionDate` descendente
- AND: el response body contiene `nextCursor` (null cuando
  quedan menos de `limit` filas)

#### Scenario: limit se clamp a 1..100

- GIVEN: cualquier estado
- WHEN: el caller pasa `?limit=500`
- THEN: el server clampea el limit a `100`
- AND: el response es `200`

#### Scenario: limit por debajo de 1 se clampea a 1

- GIVEN: cualquier estado
- WHEN: el caller pasa `?limit=0`
- THEN: el server clampea el limit a `1`
- AND: el response es `200`

#### Scenario: accountId filtra el listado

- GIVEN: el usuario tiene 3 transacciones en la cuenta A y 2
  en la cuenta B
- WHEN: `GET /api/transactions?accountId=<A>` se llama
- THEN: el response body contiene exactamente las 3
  transacciones de la cuenta A

#### Requirement: POST /api/transactions crea una transacción (REQ-TX-9)

El sistema DEBE validar el body de create vía Zod, persistir
una fila de `Transaction` owned por el usuario de la sesión, y
devolver `201` con la fila completa creada. El sistema DEBE
rechazar con los códigos definidos en `Error semantics` más
abajo. (Traces: BR-TX-1 a BR-TX-11, DG-TX-9.)

#### Scenario: Body de create válido devuelve 201 con la fila

- GIVEN: una sesión autenticada y un `FinancialAccount` padre
  con `currency = ARS`, `casa = oficial`
- WHEN: `POST /api/transactions` se llama con un body válido
  `{ direction: EXPENSE, amountMinor: 1000, currency: ARS,
accountId: <A>, transactionDate: <hoy>, memo: "coffee" }`
- THEN: el response status es `201`
- AND: el response body contiene la fila completa (incluyendo
  `convertedAmountMinor`, `convertedCurrency`,
  `fxAsOfSnapshot`, `casaSnapshot`)
- AND: el `userId` en la fila es igual al id del usuario de la
  sesión

#### Requirement: PATCH /api/transactions/:id aplica un update parcial (REQ-TX-10)

El sistema DEBE aceptar un body parcial de campos updatables
(`amountMinor`, `currency`, `transactionDate`, `memo`,
`category`) y devolver `200` con la fila actualizada. El
sistema DEBE recompilar el snapshot FX si y solo si cambiaron
`amountMinor` o `currency`; en caso contrario se preserva el
snapshot existente. (Traces: BR-TX-4, BR-TX-6.)

#### Scenario: Editar memo preserva el snapshot FX

- GIVEN: una fila de `Transaction` con un `fxAsOfSnapshot`
  no-null
- WHEN: el owner llama `PATCH /api/transactions/:id` con
  `{ memo: "updated memo" }`
- THEN: el response status es `200`
- AND: el `memo` de la fila es `"updated memo"`
- AND: el `fxAsOfSnapshot` de la fila no cambia

#### Scenario: Editar amountMinor recompila el snapshot FX

- GIVEN: una transacción en USD contra una casa ARS, snapshot
  presente
- WHEN: el owner llama `PATCH /api/transactions/:id` con
  `{ amountMinor: 2000 }`
- THEN: el response status es `200`
- AND: se emite una nueva llamada FX
- AND: el `fxAsOfSnapshot` de la fila se actualiza al
  timestamp de la nueva llamada

#### Requirement: DELETE /api/transactions/:id hard-deletea la fila (REQ-TX-11)

El sistema DEBE hard-delear la fila owned por el caller. El
sistema DEBE devolver `204` (o `200`). Un `GET
/api/transactions/:id` siguiente DEBE devolver `404`.
(Traces: BR-TX-7, DG-TX-15.)

#### Scenario: Delete remueve la fila permanentemente

- GIVEN: una fila de `Transaction` owned por el caller
- WHEN: `DELETE /api/transactions/:id` se llama
- THEN: el response status es `204`
- AND: un `GET /api/transactions/:id` siguiente devuelve `404`
- AND: la fila no existe en la base de datos

### Multi-currency semantics

#### Requirement: El snapshot FX al momento de escritura es determinístico y stale-tolerant (REQ-TX-12)

El sistema DEBE llamar a `FxRateProvider.getDisplayAmount({
casa })` al momento de escritura cuando `transaction.currency
!== casa currency`. El sistema DEBE persistir el `fxAsOf` de
la tasa como `fxAsOfSnapshot` incluso cuando la tasa está
stale. Stale no es un 5xx (BR-ACC-13 trasladado). Cuando la
moneda nativa matchea la moneda de la casa, el sistema DEBE
saltear la llamada FX y setear `convertedAmountMinor =
amountMinor`, `convertedCurrency = transaction.currency`,
`fxAsOfSnapshot = null`, `casaSnapshot = null`. (Traces:
BR-TX-6, BR-ACC-12, BR-ACC-13, DG-TX-3, DG-TX-8.)

#### Scenario: FX stale es aceptado en la escritura

- GIVEN: el `FxRateProvider` devuelve una tasa con
  `stale: true` para la casa resuelta
- WHEN: se escribe una transacción en USD contra una casa ARS
- THEN: el response status es `201`
- AND: el `fxAsOfSnapshot` de la fila es el `fxAsOf` del
  provider
- AND: el response body NO carga `stale: true` a nivel del
  envelope (el timestamp del snapshot es la superficie)

#### Scenario: native=casa saltea FX

- GIVEN: un `FinancialAccount` con `currency = USD` y
  `casa = oficial` (la moneda de la casa es ARS por default —
  para el escenario, la moneda de la cuenta es igual a la
  moneda de la casa)
- WHEN: el owner postea una transacción en USD con la misma
  casa USD
- THEN: la llamada FX se saltea
- AND: `convertedAmountMinor = amountMinor`

### Domain event

#### Requirement: TransactionRecorded se despacha después de un create exitoso (REQ-TX-13)

El sistema DEBE despachar el evento de dominio
`TransactionRecorded` en el event dispatcher in-process en
`src/shared/events/event-dispatcher.ts` después de un create
exitoso. El payload del evento DEBE cargar `{ userId,
transactionId, accountId, direction, amountMinor, currency,
casa, convertedAmountMinor, convertedCurrency, occurredAt }`.
El sistema NO DEBE requerir un subscriber en v1; la membresía
de la unión es el contrato. (Traces: BR-TX-11.)

#### Scenario: Un create exitoso despacha el evento

- GIVEN: una sesión autenticada y un body de create válido
- WHEN: `POST /api/transactions` devuelve `201`
- THEN: el event dispatcher central publicó un evento
  `TransactionRecorded` con el payload del create
- AND: futuros consumers de `reports` y `snapshots` pueden
  suscribirse sin un cambio de interfaz

### Observability

#### Requirement: Los eventos estructurados de log cubren create/update/delete y conversión FX (REQ-TX-14)

El sistema DEBE emitir los siguientes eventos estructurados de
log con los campos listados vía
`src/shared/logger/logger.ts`:

- `transactions.create` — `{ userId, accountId, direction,
amountMinor, currency, casa, fxAsOf }`.
- `transactions.update` — `{ userId, id, fieldsChanged[],
fxRecomputed: boolean }`.
- `transactions.delete` — `{ userId, id }`.
- `transactions.fx.convert` — `{ userId, casa, native, display,
fxAsOf, stale }` (solo se emite cuando efectivamente ocurrió
  una llamada FX).

El sistema DEBE strippear el contenido de `memo` de cualquier
payload capturado por el log (BR-TX-8, BR-AUTH-11 trasladado
de `auth/spec.md`). (Traces: BR-TX-8, BR-TX-11.)

#### Scenario: Un create emite transactions.create con casa y fxAsOf

- GIVEN: una cuenta con casa ARS y una transacción en USD
- WHEN: el create sale exitoso
- THEN: se captura un evento `transactions.create` con
  `casa = OFICIAL` y `fxAsOf = <ISO>` (el timestamp del
  snapshot)
- AND: el campo `memo` NO está presente en el payload
  capturado

#### Scenario: memo se strippea de los logs

- GIVEN: un body de create con `memo = "secret name"`
- WHEN: cualquier evento estructurado de log se captura
- THEN: el payload capturado NO contiene el string literal
  `"secret name"` ni la key `memo`

### Production UI surface (formerly REQ-TX-15)

#### Requirement: la superficie de UI de producción es owned por la capability ui (REQ-TX-15)

El sistema DEBE renderizar la superficie user-facing de grado de
producción para `/transactions`, `/transactions/[id]`,
`/transactions/new`, `/accounts`, `/accounts/[id]`,
`/accounts/new`, y `/dashboard` mediante la capability `ui` en
`openspec/specs/ui/spec.md`. La UI de producción DEBE satisfacer
cada Requirement codificado en `ui/spec.md` REQ-UI-1 a
REQ-UI-11, incluyendo:

- Los dos flags aditivos de query sobre los GET endpoints
  existentes (`include=lastActivity` en `/api/accounts`,
  REQ-UI-1; `include=accountName` en `/api/transactions`,
  REQ-UI-2).
- La state machine de página de listado cubriendo empty /
  loading / error / success (REQ-UI-3).
- El piso de accesibilidad WCAG 2.2 AA (REQ-UI-4 a REQ-UI-8).
- La restricción de single-light-theme (REQ-UI-9).
- Los deliverables de docs y QA
  (`docs/architecture/ui.md`, `docs/qa/transactions-ui.md`,
  REQ-UI-10 y REQ-UI-11).

Las tres páginas bajo `app/transactions/` (listado, detalle,
create) y los correspondientes componentes presentacionales a
nivel de página (`TransactionsListTable`, `TransactionDetail`,
`CreateTransactionForm`) TIENEN QUE mantener el gate de Server
Component `auth()`, el data path `serverHonoRequest`, y las
rutas Hono existentes (`/api/transactions/*`); solo cambia la
capa de render. Los dos query flags son aditivos sobre los GET
endpoints existentes — el endpoint sin el flag TIENE QUE
mantenerse byte-identical al contrato actual (REQ-UI-1,
REQ-UI-2). No se introduce nueva ruta `app/transactions/**` ni
nuevo código de framework HTTP.

(Traces: `ui/spec.md` REQ-UI-1 a REQ-UI-11. Reemplaza el
wording original "Three smoke pages mirror the accounts slice"
que vivía en este spec en el último sync 2026-06-22.)

#### Scenario: Sesión faltante redirige a /auth/signin

- GIVEN: no hay cookie de sesión
- WHEN: el usuario visita `/transactions`
- THEN: la respuesta es un 302 a
  `/auth/signin?callbackUrl=%2Ftransactions`

#### Scenario: Listado vacío muestra el empty state con CTA

- GIVEN: un usuario autenticado con cero transacciones
- WHEN: el usuario visita `/transactions`
- THEN: la página renderiza el primitive `EmptyState`
  (REQ-UI-3)
- AND: la página renderiza un botón `New transaction`
  linkeando a `/transactions/new`

#### Scenario: Detalle renderiza el timestamp del snapshot

- GIVEN: una fila de `Transaction` owned por el usuario
  autenticado con `fxAsOfSnapshot = <ISO>`
- WHEN: el usuario visita `/transactions/:id`
- THEN: la página renderiza la fila en un layout basado en
  `Card` (REQ-UI-3)
- AND: la página renderiza `fxAsOfSnapshot` como texto plano
  `"Rate as of: <ISO>"`

#### Scenario: el account picker dirige la flow card del dashboard

- GIVEN: una sesión autenticada
- AND: existe la cuenta `A` con un flujo no vacío
- WHEN: el usuario visita `/dashboard?accountId=<A>`
- THEN: la flow card fetcha `/api/reports/accounts/<A>/flow`
- AND: la flow card renderiza el flujo diario por cuenta
  (REQ-UI-3)

## Error semantics

La capability `transactions` introduce tres nuevos códigos que
se suman al enum existente en
`src/shared/errors/error-codes.ts:12-43`. Todas las demás
fallas reusan códigos existentes (`VALIDATION_ERROR`,
`UNAUTHORIZED`, `NOT_FOUND`, etc.). El mapping es normativo.

| Código                    | HTTP | Trigger                                                                                     | Superficie del caller                                                     |
| ------------------------- | ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `INVALID_AMOUNT`          | 400  | `amountMinor <= 0`, negativo después de derivar el signo desde `direction`, o no finito.    | Banner de error inline en `POST /api/transactions`.                       |
| `FUTURE_DATE_NOT_ALLOWED` | 400  | `transactionDate > Clock.now()`.                                                            | Banner de error inline en `POST /api/transactions`.                       |
| `ACCOUNT_ARCHIVED`        | 409  | El `archivedAt` del `FinancialAccount` padre es no-null al momento de escritura.            | Banner de error inline en `POST /api/transactions`.                       |
| `VALIDATION_ERROR`        | 400  | Cualquier otra falla de schema (ej. `direction = TRANSFER`, `memo > 500 chars`).            | Banner de error inline; primer mensaje de `details`.                      |
| `UNAUTHORIZED`            | 401  | Sin sesión, cookie faltante, sesión expirada, o usuario desconocido (según `auth/spec.md`). | 307 redirect para App Router pages; 401 JSON para Hono.                   |
| `NOT_FOUND`               | 404  | Acceso cross-user a `Transaction`, o `id` no existente (sin leak de información).           | `redirect('/transactions')` para la página de detalle (patrón BR-ACC-19). |

El sistema NO DEBE incluir stack traces, objetos de error de
Prisma, o bodies de request en ninguna respuesta de error.

## Migration

La migración Prisma para el modelo `Transaction` es el único
cambio de schema persistente en este cambio.

```sql
-- non-destructive; additive; no backfill; no row rewrite
CREATE TYPE "TransactionDirection" AS ENUM
  ('INCOME', 'EXPENSE', 'TRANSFER');

CREATE TABLE "Transaction" (
  "id"                    TEXT PRIMARY KEY,
  "userId"                TEXT NOT NULL,
  "accountId"             TEXT NOT NULL,
  "direction"             "TransactionDirection" NOT NULL,
  "amountMinor"           INTEGER NOT NULL CHECK ("amountMinor" > 0),
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

La migración es aditiva. Las filas existentes de
`FinancialAccount` y `User` no se modifican. **Sin pérdida de
datos.** El schema gate assertado por `sdd-verify` es `SELECT
count(*) FROM "FinancialAccount"` antes y después de la
migración devuelve el mismo valor.

Los cambios de schema de Prisma son aditivos:

- Nuevo enum `TransactionDirection` con valores `INCOME`,
  `EXPENSE`, `TRANSFER`.
- Nuevo modelo `Transaction` con la lista de campos e indexes
  de arriba.

## Out of scope (this change)

Trasladado verbatim de la propuesta; ver
`openspec/changes/transactions/proposal.md` §"Out of scope"
para detalle.

- Transfers entre dos cuentas (agregado `Transfer` o link
  `transferGroupId`).
- Adjuntos (modelo `Attachment`, port `AttachmentStorage`,
  `LocalDiskAttachmentStorage`).
- Recurrencia (`RecurrenceRule`, generador on-demand).
- Idempotency keys en `POST /api/transactions`.
- Importación bancaria / CSV upload.
- OCR en recibos.
- Multi-user / cuentas compartidas / visor read-only.
- Push notifications.
- Archivo histórico de FX para transacciones back-dated.
- Categorización con IA.
- Reglas de presupuesto / límites de gasto.
- UI de producción (`transactions-ui` es un cambio separado).
- App mobile.

## Cross-references

- **Propuesta**: `openspec/changes/transactions/proposal.md` —
  el cambio upstream que creó esta capability. BR-TX-1 a
  BR-TX-11 y los BRs trasladados están codificados acá; la
  propuesta carga el rationale, las alternativas consideradas
  y el forecast.
- **Spec de accounts**: `openspec/specs/accounts/spec.md` —
  BR-ACC-12 declara el contrato de FX display-only;
  BR-ACC-13 cubre freshness de FX; BR-ACC-18 cubre el
  rendering del smoke widget. La nueva FK
  `Transaction.accountId` es un cross-link point.
- **Delta spec per-account casa**:
  `openspec/changes/fx-cache/specs/accounts/spec.md` (o su
  sucesor canónico si está archivado) — la regla de
  resolución de casa en el call site (BR-FX-3) vive acá.
- **Spec de FX**: `openspec/specs/fx/spec.md` — REQ-FX-3
  declara el invariante "la resolución de casa es
  responsabilidad del caller" que `transactions` traslada.
  REQ-FX-9 documenta el precedente de migración aditiva que
  la migración de `Transaction` sigue.
- **Spec de auth**: `openspec/specs/auth/spec.md` — el
  invariante del helper server-side `auth()` (cross-module
  contracts §"auth() server-side helper") y la regla "todo
  otro módulo `WHERE userId = ?` query DEBE escopar al
  caller". La capability `transactions` sigue este invariante
  en cada endpoint.
- **Delta accounts de transactions**:
  `openspec/changes/transactions/specs/accounts/spec.md` —
  la delta spec hermana que anota la nueva FK
  `Transaction.accountId → FinancialAccount` para lectores
  cross-module.
- **Interfaz del port (input estable)**:
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts` —
  la interfaz que `TransactionService` consume. Vive en
  `accounts`; `transactions` depende de ella (la dirección del
  port es `transactions → accounts`, no al revés).
- **Servicios externos**: ninguno. DolarAPI se accede vía el
  `FxRateProvider` existente; sin nuevo servicio externo.

## History

- **2026-06-22 (v1)** — primera escritura. Creada por el
  cambio `transactions`. Cierra DG-TX-1 a DG-TX-15 (15
  decisiones cerradas por el proposer + el grill de
  pre-propose). Scope: agregado `Transaction` + CRUD +
  multi-moneda vía la capability `fx` + smoke UI. Adjuntos,
  recurrencia e idempotency keys diferidos a v1.1+ del mismo
  cambio.

## References

- `openspec/changes/transactions/proposal.md` — propuesta v1
  (2026-06-22) con DG-TX-1 a DG-TX-15 cerrados.
- `openspec/changes/transactions/explore.md` — research
  upstream (15 DG-TX-N + 4 preguntas abiertas, ~50 citas
  file:line).
- `openspec/specs/accounts/spec.md` — capability canónica
  `accounts`; BR-ACC-12, BR-ACC-13, BR-ACC-18.
- `openspec/specs/fx/spec.md` — capability canónica `fx`;
  REQ-FX-3 (resolución de casa), REQ-FX-9 (migración
  aditiva).
- `openspec/specs/auth/spec.md` — capability canónica `auth`;
  invariante del helper `auth()`, scoping por userId.
- `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts` —
  el port que `TransactionService` consume sin cambios.
- `src/modules/accounts/application/actions/get-account-balance.action.ts:67-100` —
  el call site canónico de conversión que `TransactionService`
  espeja para la ruta de create.
- `src/shared/errors/error-codes.ts` — `INVALID_AMOUNT`,
  `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED` se suman al
  enum existente.
- `src/shared/events/event-dispatcher.ts` — `TransactionRecorded`
  se suma a la unión `DomainEvent`.
- `openspec/config.yaml` — reglas de strict TDD; runner
  `pnpm test`.
- `AGENTS.md` (raíz) — §5.3 política de `pnpm-lock.yaml`;
  §13 política de mirror documental en doble idioma.
