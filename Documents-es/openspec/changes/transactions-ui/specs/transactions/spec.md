# Spec — Capability `transactions`

**Autor**: Sebastián Illa
**Capability**: `transactions`
**Cambio fuente**: `transactions-ui`
**Estado**: draft · **Creado**: 2022-06-22 · **Última sincronización**: 2026-06-27 (transactions-ui)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (heredado de `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4

> **Spec delta — REQ-TX-15 REEMPLAZADO.** Este archivo es un
> espejo del spec canónico de la capability `transactions` en
> `openspec/specs/transactions/spec.md` y aplica un único
> delta: **REQ-TX-15 (el requirement de "tres páginas smoke") se
> REEMPLAZA** por una referencia fina a la nueva capability
> `ui` (`openspec/specs/ui/spec.md`), que es dueña de los
> requisitos de la UI de producción. Todos los demás
> requirements (REQ-TX-1 a REQ-TX-14) se preservan verbatim del
> canónico. Sin cambios de BR; sin cambios de comportamiento en
> las rutas Hono; sin cambios de data model. `sdd-archive`
> levanta este delta al canónico en
> `openspec/specs/transactions/spec.md` y elimina el wording
> smoke de REQ-TX-15.
>
> El spec declara **lo que DEBE ser verdadero** después de que
> el cambio aterrice, no cómo implementarlo. Los detalles de
> implementación (paths de archivo, sintaxis de schemas, layout
> de tests) se limitan a lo que requiere el contrato
> cross-module.

## Cambios en `transactions-ui`

| Requirement  | Cambio      | Detalle                                                                                                                                                                                  |
| ------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-TX-15    | REEMPLAZADO | Era "Three smoke pages mirror the accounts slice" (smoke UI). Reemplazado por un puntero fino a `openspec/specs/ui/spec.md` REQ-UI-1 a REQ-UI-11, que son dueños de la UI de producción. |
| REQ-TX-1..14 | SIN CAMBIOS | Todos los demás requirements se preservan verbatim de `openspec/specs/transactions/spec.md` (última sincronización 2026-06-22, transactions).                                            |

El reemplazo desacopla la superficie user-facing de este spec
para que la evolución futura de UI (`ui-dark-mode`, `ui-i18n`,
`ui-charts`) aterrice como adiciones a la capability `ui`, no
como nuevas revisiones de REQ-TX-N acá.

## Decisiones cerradas (DG-TX-1 a DG-TX-15 — 2026-06-22)

Los 15 decision gaps son autoritativos donde modifican o
extienden la propuesta. El spec los refleja como Requirements y
BRs, no como una sección separada de "decisiones". Los IDs de
decisión se referencian inline en los cuerpos de los Scenarios
relevantes.

| Gap      | Decisión                                                                                               | Rationale                                                                                                  | Codificado en    |
| -------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------- |
| DG-TX-1  | Hard delete; `amountMinor` siempre positivo; campos required vs. optional como en propuesta §Change 1. | Las transacciones son descartables; el path más barato. Sin columnas de audit que espejen `accounts`.      | BR-TX-1, BR-TX-7 |
| DG-TX-2  | Single-account solo en v1. Sin aggregate `Transfer`.                                                   | **Lockeado en el grill de pre-propose.** Difiera los writes atómicos de dos filas hasta que aterrice CRUD. | BR-TX-2          |
| DG-TX-3  | Snapshot en write time: la fila lleva original + converted + `fxAsOfSnapshot` + `casa`.                | **Lockeado en el grill de pre-propose.** Totales históricos determinísticos.                               | BR-TX-6          |
| DG-TX-4  | String libre-form `category: String?`. Sin tabla `TransactionCategory`.                                | Mínima fricción para v1. Una tabla tipada es una migración aditiva futura.                                 | BR-TX-9          |
| DG-TX-5  | Port `AttachmentStorage` + `LocalDiskAttachmentStorage` para dev/CI. Diferido a v1.1.                  | **Lockeado en el grill de pre-propose.** Interface adapter desde el día 1; swap non-breaking después.      | candidato v1.1   |
| DG-TX-6  | Frequency a nivel de domain (`frequency`, `interval`, `byMonthDay`, `byDay`). Diferido a v1.1.         | **Lockeado en el grill de pre-propose.** Sin dep de iCal parser; sin Cron.                                 | candidato v1.1   |
| DG-TX-7  | Generación on-demand en carga del dashboard. Diferido a v1.1.                                          | **Lockeado en el grill de pre-propose.** Cutoff para v1; background jobs afuera.                           | candidato v1.1   |
| DG-TX-8  | Redondeo half-up a 2 decimales para display.                                                           | Se alinea con la convención half-up implícita en `fx-rate-provider.dolar-api.ts`.                          | BR-TX-6          |
| DG-TX-9  | Sin `idempotencyKey` en v1. La UI expone un hint de submit-failure.                                    | v1 más barato; el riesgo de duplicados en CRUD manual es raro.                                             | (candidato v1.1) |
| DG-TX-10 | Single-user solo. El scoping por `userId` es el único access control.                                  | **Lockeado en el grill de pre-propose.** Se alinea con la invariante cross-module de `auth/spec.md`.       | BR-TX-4          |
| DG-TX-11 | `memo` opcional, max 500 chars; sin denylist de PII; el logger strippea `memo`.                        | **Lockeado en el grill de pre-propose.** Mínima fricción; la denylist del logger cierra PII-to-Sentry.     | BR-TX-8          |
| DG-TX-12 | Enum `direction` = `INCOME \| EXPENSE` en v1. `TRANSFER` reservado; rechazado en API.                  | Los integers siempre positivos son la invariante más simple; `direction` es la fuente del signo.           | BR-TX-1, BR-TX-2 |
| DG-TX-13 | Rechazar `transactionDate` futuro con `FUTURE_DATE_NOT_ALLOWED` (400).                                 | Las fechas futuras son un error de autoría en v1 (sin scheduled payments, sin recurrencia).                | BR-TX-3          |
| DG-TX-14 | Paginación cursor `?cursor=...&limit=...&accountId=...`. `limit` clampeado a `1..100`.                 | Mismo shape que `list-accounts.action.ts`; la UI smoke reusa el mismo footer.                              | BR-TX-10         |
| DG-TX-15 | Hard delete en v1. Sin columna `archivedAt` en `Transaction`.                                          | **Cerrado por el proposer.** Las transacciones son descartables; hard delete es el path más barato.        | BR-TX-7          |

Las alternativas consideradas para cada gap están registradas
en la propuesta §"Alternatives considered" y §"Closed
decisions". Attachments, recurrence e idempotency keys quedan
fuera de v1 según la propuesta §"Out of scope".

## Propósito

La capability `transactions` es el **transaction ledger** de
`gastos-personales`. Es dueña del registro manual de expenses e
incomes del usuario (CRUD) más una superficie de display
multi-currency que llama al port `FxRateProvider` de la
capability `fx` en write time. La capability garantiza que:
(a) cada transacción es owned por exactamente un `User`
autenticado y exactamente un `FinancialAccount` (las invariantes
cross-module heredadas de `auth` y `accounts`); (b) el snapshot
multi-currency se captura **una vez, en write time**, y se
persiste en la fila para que los totales históricos sean
determinísticos; (c) la superficie de FX es **display-only en
write time** — el `amountMinor` nativo es el número autoritativo
de la fila, y el `convertedAmountMinor` es un snapshot, nunca
una mutación del estado nativo; (d) la superficie de UI de
producción es owned por la capability `ui`
(`openspec/specs/ui/spec.md`), no por este spec.

La capability expone una superficie estable de write de
presentation-layer — `{ amountMinor, currency, accountId,
direction, transactionDate, memo?, category?,
convertedAmountMinor, convertedCurrency, fxAsOfSnapshot? }` —
que cualquier consumer (`reports`, `snapshots`, la capability
`ui`) puede leer o subscribirse vía `TransactionRepositoryPort`
y el domain event `TransactionRecorded` sin aprender los
detalles upstream.

## Alcance

### In scope

- Nuevo Prisma model `Transaction` y un enum
  (`TransactionDirection`).
- Nuevo módulo `src/modules/transactions/` espejando el shape
  de `accounts` (`domain/entities`,
  `domain/interfaces/transaction.repository.port.ts`,
  `domain/services/transaction.service.ts`,
  `application/actions/{list,get,create,update,delete}-transaction.action.ts`,
  `application/dto/transaction.dto.ts`,
  `application/validation/transaction-create.schema.ts`,
  `infrastructure/repositories/transaction.repository.prisma.ts`).
- Seis endpoints Hono bajo `/api/transactions` montados en el
  protectedApp catch-all existente (el archivo
  `app/api/[...path]/route.ts` no se modifica).
- Tres nuevos códigos de error (`INVALID_AMOUNT`,
  `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED`) agregados a
  `src/shared/errors/error-codes.ts`.
- Un nuevo domain event (`TransactionRecorded`) agregado a la
  unión `DomainEvent` en
  `src/shared/events/event-dispatcher.ts`.
- Cuatro nuevos nombres de structured log events
  (`transactions.create`, `transactions.update`,
  `transactions.delete`, `transactions.fx.convert`).
- Adiciones de DI wiring en
  `src/modules/api/app.ts:317-352` (`buildDefaultDeps`) — un
  nuevo service, un nuevo repository.
- **Superficie de UI user-facing**: owned por la capability
  `ui` (`openspec/specs/ui/spec.md`). Este spec ya no define
  requisitos a nivel de página; ver `Cambios en
transactions-ui` arriba para el delta sobre REQ-TX-15.
- Extensión de la denylist del logger para droppear el contenido
  de `memo` (BR-TX-8; la BR es la higiene de PII).

### Out of scope

- **Transfers entre dos cuentas.** Diferido a v1.1 (sin
  aggregate `Transfer`, sin `transferGroupId`).
- **Attachments** (recibos, facturas). Diferido a v1.1; sin
  modelo `Attachment`, sin port `AttachmentStorage`.
- **Recurrence.** Diferido a v1.1; sin modelo
  `RecurrenceRule`, sin generador on-demand, sin Cron, sin
  BullMQ.
- **Idempotency keys.** Diferido a v1.1 (introducido cuando
  aterrice bulk import; el riesgo de duplicados en CRUD manual
  es raro).
- **Bank import / CSV upload.** Out of v1.
- **OCR en recibos.** Out of v1.
- **Multi-user / cuentas compartidas / viewer read-only.** v1
  es single-user según BR-TX-4.
- **Push notifications.** Out of v1.
- **Archivo histórico de FX para transacciones back-dated.** El
  rate es el rate al momento del write; la fila lleva
  `fxAsOfSnapshot` así la UI expone "Rate as of: <ISO>".
- **AI categorization.** Out of v1.
- **Budget rules / spending limits.** Out of v1 (territorio de
  `reports`).
- **UI de producción.** Owned por la capability `ui`
  (`openspec/specs/ui/spec.md`). Este spec referencia los REQs
  de `ui` pero no los duplica.
- **Mobile app.** Out of v1.

### Capability boundary

- `transactions` es dueña del aggregate `Transaction`, del
  `TransactionRepositoryPort`, del `TransactionService`, de las
  cinco acciones de CRUD, de la lógica de snapshot de FX en
  write time, y del event `TransactionRecorded`.
- `ui` (capability separada) es dueña de las primitivas del
  design system (`app/_ui/`) y los renders de producción de las
  páginas (`app/transactions/**`, `app/dashboard/**`,
  `app/accounts/**`). Los dos flags `include=lastActivity` e
  `include=accountName` son aditivos sobre los GET endpoints
  existentes (ver `ui/spec.md` REQ-UI-1 y REQ-UI-2); los
  endpoints sin el flag quedan sin cambios.
- `accounts` es dueña del modelo `FinancialAccount`, del port
  interface `FxRateProvider`, y de los enums `AccountCurrency` /
  `AccountFxCasa`.
- `fx` es dueña de la implementación concreta de
  `FxRateProvider` y del cache de rates.
- La dependencia apunta desde `transactions` al
  `FxRateProvider` port de `accounts` y al modelo
  `FinancialAccount` de `accounts` (read-only) — nunca al
  revés, preservando la invariante de ports & adapters.
- `transactions` NO DEBE importar de `fx` directamente; va
  a través del port `FxRateProvider` declarado en `accounts`.
- `transactions` NO DEBE leer el repository port de cualquier
  otro módulo para write paths; la fila padre de
  `FinancialAccount` se carga por `transactions` a través de
  `AccountRepositoryPort` (pre-check de BR-TX-5).

## Entidades

El spec es a nivel de interface. Los shapes de abajo son parte
del contrato que cruza el límite `transactions` ↔ consumer (UI,
`reports`, `snapshots`).

### `Transaction`

La entity single source-of-truth para las transacciones del
usuario. Una fila por entrada manual. Una fila es owned por
exactamente un `User` (invariante cross-module heredada de
`auth`) y referencia exactamente un `FinancialAccount`
(invariante cross-module heredada de `accounts`).

| Field                  | Type                    | Constraints                                                                                 |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| `id`                   | `string` (cuid)         | Primary key. Server-generated. Immutable.                                                   |
| `userId`               | `string` (cuid)         | FK a `User.id`. `onDelete: Cascade`. Invariante cross-module (capability `auth`).           |
| `accountId`            | `string` (cuid)         | FK a `FinancialAccount.id`. `onDelete: Cascade`. Invariante cross-module (`accounts`).      |
| `direction`            | `TransactionDirection`  | Uno de `INCOME \| EXPENSE` en v1. `TRANSFER` reservado para v1.1 (rechazado en API).        |
| `amountMinor`          | `Int`                   | Minor units. Siempre positivo; el signo viene de `direction`. No-positivo → 400.            |
| `currency`             | `AccountCurrency`       | Uno de `ARS \| USD \| EUR`.                                                                 |
| `memo`                 | `string \| null`        | Opcional. Max 500 chars (Zod). Sin min length. Sin denylist de PII en v1 (BR-TX-8).         |
| `category`             | `string \| null`        | Opcional. String libre-form. Sin tabla `TransactionCategory` en v1 (BR-TX-9).               |
| `transactionDate`      | `DateTime`              | NO en el futuro relativo a `Clock.now()`. Futuro → 400 `FUTURE_DATE_NOT_ALLOWED`.           |
| `convertedAmountMinor` | `Int`                   | Display amount en la currency de la `casa` de la cuenta padre. Snapshotteado en write time. |
| `convertedCurrency`    | `AccountCurrency`       | La currency de la `casa` de la cuenta padre en write time. Siempre populada.                |
| `fxAsOfSnapshot`       | `DateTime \| null`      | Timestamp del snapshot. `null` iff `currency === convertedCurrency` (sin call a FX).        |
| `casaSnapshot`         | `AccountFxCasa \| null` | La casa usada en write time. `null` iff `currency === convertedCurrency`.                   |
| `createdAt`            | `DateTime`              | Server-set en insert.                                                                       |
| `updatedAt`            | `DateTime`              | Server-set en cada mutación.                                                                |

Invariantes:

- `amountMinor > 0` se enforce en el action boundary
  (BR-TX-1).
- `direction ∈ { INCOME, EXPENSE }` en writes de v1 (BR-TX-2).
- `transactionDate <= Clock.now()` en el action boundary
  (BR-TX-3).
- `convertedCurrency` siempre igual a la currency de la
  `FinancialAccount.casa` padre en write time.
- `convertedAmountMinor` es el resultado en integer-cents de
  aplicar el rate del snapshot a `amountMinor` (BR-TX-6).
- `fxAsOfSnapshot IS NULL` iff
  `currency === convertedCurrency`.
- El acceso cross-user retorna `404 NOT_FOUND` (sin leak de
  información), según la invariante cross-module de
  `auth/spec.md`.
- La fila no lleva columna `archivedAt` (BR-TX-7).

Índices:

- `@@index([userId, transactionDate])` — list endpoint.
- `@@index([accountId, transactionDate])` — list por cuenta.

### Enums

- `TransactionDirection`: `INCOME \| EXPENSE \| TRANSFER`.
  Solo `INCOME` y `EXPENSE` se aceptan en la API en v1
  (BR-TX-2). `TRANSFER` está reservado para v1.1.

## Reglas de negocio

Las reglas de abajo son normativas. Cada regla tiene un ID
estable para trazabilidad entre spec, design, implementación y
tests. Los BRs cargados (BR-ACC-12, BR-ACC-13, BR-FX-3) se
importan verbatim de `openspec/specs/accounts/spec.md` y
`openspec/specs/fx/spec.md`.

- **BR-ACC-12 (cargada)** — El storage nunca se convierte. El
  `amountMinor` nativo es el número autoritativo de la fila.
  El `convertedAmountMinor` es un snapshot, no una mutación
  del valor nativo. (Fuente:
  `openspec/specs/accounts/spec.md`,
  `openspec/specs/fx/spec.md:314-323`.)
- **BR-ACC-13 (cargada)** — FX stale no es un 5xx. El
  `FxRateProvider` retorna el rate con `fxAsOf` aún cuando
  está stale; el write de la transacción expone el timestamp
  del snapshot en la respuesta para que la UI pueda renderizar
  "Rate as of: <ISO>".
- **BR-FX-3 (cargada)** — La resolución de la casa es
  responsabilidad del caller. El `TransactionService` resuelve
  `account.casa ?? env.FX_DEFAULT_CASA` en el action site,
  nunca dentro del provider.
- **BR-TX-1 (NUEVA)** — `Transaction.amountMinor` es siempre
  positivo; el signo viene de `direction`. Un valor
  no-positivo en el API boundary se rechaza con
  `INVALID_AMOUNT` (400).
- **BR-TX-2 (NUEVA)** — `direction` es uno de
  `INCOME | EXPENSE` en v1. El valor del enum `TRANSFER` está
  reservado para v1.1 y se rechaza en el API boundary en v1.
- **BR-TX-3 (NUEVA)** — `Transaction.transactionDate` nunca
  está en el futuro relativo a `Clock.now()`. Una fecha futura
  en el API boundary se rechaza con `FUTURE_DATE_NOT_ALLOWED`
  (400).
- **BR-TX-4 (NUEVA)** — Toda referencia cross-module a una
  transacción scopea a `userId`. No hay API `findById(id)`;
  `findById(userId, id)` retorna `null` en miss O cross-user.
- **BR-TX-5 (NUEVA)** — Una `Transaction` no puede crearse
  contra una `FinancialAccount` archivada. El action layer
  pre-chequea `account.archivedAt` y rechaza con
  `ACCOUNT_ARCHIVED` (409).
- **BR-TX-6 (NUEVA)** — El converted amount se captura en
  write time. Cuando `transaction.currency === currency de la
casa de la account`, el call a FX se skipea y
  `convertedAmountMinor` espeja `amountMinor` y
  `fxAsOfSnapshot` es `null`.
- **BR-TX-7 (NUEVA)** — Hard delete es la policy de v1. No hay
  columna `archivedAt` en `Transaction`; `DELETE` remueve la
  fila permanentemente.
- **BR-TX-8 (NUEVA)** — `memo` es opcional. Sin min length,
  sin denylist de PII en v1. Max length 500 chars enforced
  por Zod. El structured logger strippea el contenido de `memo`
  de los log events.
- **BR-TX-9 (NUEVA)** — `category` es un string libre-form (sin
  tabla `TransactionCategory` en v1).
- **BR-TX-10 (NUEVA)** — La paginación es cursor-based
  (`?cursor=...&limit=...&accountId=...`). `limit` se clampea
  a `1..100` en el API boundary.
- **BR-TX-11 (NUEVA)** — El domain event `TransactionRecorded`
  se emite después de un create exitoso. El payload incluye
  el converted amount y el timestamp del snapshot.

## Operaciones

La capability expone cinco operaciones a través del
`TransactionRepositoryPort` y cinco endpoints Hono. Las
operaciones son a nivel de interface: describen lo que DEBE ser
verdadero, no los nombres de clase ni los file paths que las
implementan.

### `create(userId, input)`

Persiste una nueva fila `Transaction` owned por `userId`
contra la `FinancialAccount` padre. Pasos:

1. Validar el input a través del Zod `transactionCreateSchema`
   (direction validado, amount positivo, transactionDate no
   futuro).
2. Cargar la `FinancialAccount` padre vía
   `AccountRepositoryPort.findById(userId, accountId)`.
3. Rechazar con `ACCOUNT_ARCHIVED` (409) si `account.archivedAt`
   es no-null (BR-TX-5).
4. Resolver la casa vía
   `account.casa ?? env.FX_DEFAULT_CASA` (BR-FX-3 cargada).
5. Computar el converted amount:
   - Si `transaction.currency === currency de la casa`: skipear
     el call a FX; setear
     `convertedAmountMinor = amountMinor`,
     `convertedCurrency = transaction.currency`,
     `fxAsOfSnapshot = null`, `casaSnapshot = null`.
   - Else: llamar a `FxRateProvider.getDisplayAmount({ casa })`;
     almacenar el resultado como `convertedAmountMinor` /
     `convertedCurrency` / `fxAsOfSnapshot` /
     `casaSnapshot`. Stale está permitido (BR-ACC-13
     cargada).
6. Persistir la fila.
7. Emitir el structured log event `transactions.create`
   (`{ userId, accountId, direction, amountMinor, currency,
casa, fxAsOf }`).
8. Emitir el structured log event `transactions.fx.convert`
   cuando un call a FX realmente ocurrió
   (`{ userId, casa, native, display, fxAsOf, stale }`).
9. Despachar el domain event `TransactionRecorded`
   (`{ userId, transactionId, accountId, direction,
amountMinor, currency, casa, convertedAmountMinor,
convertedCurrency, occurredAt }`).
10. Retornar la nueva fila.

### `getById(userId, id)`

Retorna la fila `Transaction` owned por `userId` con el `id`
dado, o `null` en miss O cross-user (BR-TX-4). El action layer
mapea `null` a `404 NOT_FOUND`.

### `list(userId, { cursor, limit, accountId? })`

Retorna una página cursor-paginated de filas `Transaction`
owned por `userId`, ordenadas por `transactionDate`
descendente. Cuando se provee `accountId`, la página se filtra
a esa cuenta. `limit` se clampea a `1..100` (BR-TX-10).

### `update(userId, id, patch)`

Aplica un patch parcial (`amountMinor`, `currency`,
`transactionDate`, `memo`, `category`) a la fila owned por
`userId` con el `id` dado. El snapshot de FX se recomputa
**solo si** `amountMinor` o `currency` cambió; en caso
contrario, el snapshot existente se preserva. Retorna la fila
actualizada, o `null` en miss O cross-user.

### `delete(userId, id)`

Hard-deletea la fila `Transaction` owned por `userId` con el
`id` dado (BR-TX-7). Retorna `null` en miss O cross-user. No
hay archive; la fila desaparece.

## Requisitos

### Data model

#### Requirement: Transaction persiste la fila multi-currency snapshot (REQ-TX-1)

El sistema DEBE persistir una fila `Transaction` cuyo shape
matchee la tabla de entity. El sistema DEBE enforce los dos
índices (`@@index([userId, transactionDate])` y
`@@index([accountId, transactionDate])`). El sistema NO DEBE
agregar una columna `archivedAt` al modelo `Transaction`.
(Traces: BR-TX-6, BR-TX-7, DG-TX-1, DG-TX-3.)

#### Scenario: write USD contra casa ARS snapshotea la conversión

- GIVEN: un usuario es dueño de una `FinancialAccount` con
  `currency = ARS` AND `casa = oficial`
- WHEN: el usuario postea `POST /api/transactions` con
  `direction = EXPENSE`, `amountMinor = 1000`, `currency = USD`,
  `accountId = <esa cuenta>`
- THEN: el status de la respuesta es `201`
- AND: el `amountMinor` de la fila es `1000`
- AND: el `convertedAmountMinor` de la fila es no-null y en ARS
- AND: la `convertedCurrency` de la fila es `ARS`
- AND: el `fxAsOfSnapshot` de la fila es un ISO timestamp no-null
- AND: el `casaSnapshot` de la fila es `OFICIAL`

#### Scenario: write ARS contra casa ARS skipea el call a FX

- GIVEN: un usuario es dueño de una `FinancialAccount` con
  `currency = ARS` AND `casa = oficial`
- WHEN: el usuario postea `POST /api/transactions` con
  `direction = INCOME`, `amountMinor = 5000`, `currency = ARS`,
  `accountId = <esa cuenta>`
- THEN: el status de la respuesta es `201`
- AND: el `convertedAmountMinor` de la fila es igual a
  `amountMinor`
- AND: el `fxAsOfSnapshot` de la fila es `null`
- AND: el `casaSnapshot` de la fila es `null`
- AND: no se emitió ningún call a `FxRateProvider`

#### Scenario: el schema preserva el determinismo histórico

- GIVEN: una fila `Transaction` creada hace 6 meses con
  `amountMinor = 1000`, `currency = USD`,
  `convertedAmountMinor = 1100000`, `convertedCurrency = ARS`,
  `fxAsOfSnapshot = <ISO>`
- WHEN: el rate de FX de hoy es `1200000` ARS/USD (un valor
  diferente)
- THEN: el `convertedAmountMinor` de la fila histórica sigue
  siendo `1100000` (el snapshot en write time, no el rate live)

#### Scenario: hard delete remueve la fila

- GIVEN: existe una fila `Transaction` con `id = X` y
  `userId = <caller>`
- WHEN: el owner llama a `DELETE /api/transactions/X`
- THEN: el status de la respuesta es `204` (o `200`)
- AND: un `GET /api/transactions/X` de seguimiento retorna `404`
- AND: no existe columna `archivedAt` en la tabla `Transaction`

### Validación

#### Requirement: amountMinor es estrictamente positivo (REQ-TX-2)

El sistema DEBE rechazar un body de `POST /api/transactions`
cuyo `amountMinor <= 0` con `400 INVALID_AMOUNT`. El signo
viene de `direction`, nunca de un `amountMinor` negativo.
(Traces: BR-TX-1, DG-TX-12.)

#### Scenario: el monto cero se rechaza

- GIVEN: cualquier sesión autenticada
- WHEN: se llama a `POST /api/transactions` con
  `amountMinor = 0`
- THEN: el status de la respuesta es `400`
- AND: el `error.code` del body de la respuesta es
  `INVALID_AMOUNT`
- AND: no se crea ninguna fila

#### Scenario: el monto negativo se rechaza

- GIVEN: cualquier sesión autenticada
- WHEN: se llama a `POST /api/transactions` con
  `amountMinor = -100`
- THEN: el status de la respuesta es `400`
- AND: el `error.code` del body de la respuesta es
  `INVALID_AMOUNT`
- AND: no se crea ninguna fila

#### Requirement: el enum direction es INCOME o EXPENSE en v1 (REQ-TX-3)

El sistema DEBE aceptar `direction ∈ { INCOME, EXPENSE }` en
el API boundary. El sistema DEBE rechazar `direction = TRANSFER`
con `400 VALIDATION_ERROR` (el valor del enum está reservado
para v1.1). El sistema DEBE almacenar el valor de `direction`
verbatim. (Traces: BR-TX-2, DG-TX-12.)

#### Scenario: TRANSFER se rechaza

- GIVEN: cualquier sesión autenticada
- WHEN: se llama a `POST /api/transactions` con
  `direction = TRANSFER`
- THEN: el status de la respuesta es `400`
- AND: el `error.code` del body de la respuesta es
  `VALIDATION_ERROR`
- AND: no se crea ninguna fila

#### Requirement: transactionDate nunca está en el futuro (REQ-TX-4)

El sistema DEBE rechazar un body de `POST /api/transactions`
cuyo `transactionDate > Clock.now()` con `400
FUTURE_DATE_NOT_ALLOWED`. El campo `transactionDate` es
requerido. (Traces: BR-TX-3, DG-TX-13.)

#### Scenario: hoy está permitido

- GIVEN: `Clock.now()` retorna hoy
- WHEN: se llama a `POST /api/transactions` con
  `transactionDate = <hoy>`
- THEN: el status de la respuesta es `201` (o `400` por una
  falla de validación no relacionada)

#### Scenario: mañana se rechaza

- GIVEN: `Clock.now()` retorna hoy
- WHEN: se llama a `POST /api/transactions` con
  `transactionDate = <mañana>`
- THEN: el status de la respuesta es `400`
- AND: el `error.code` del body de la respuesta es
  `FUTURE_DATE_NOT_ALLOWED`
- AND: no se crea ninguna fila

#### Requirement: memo es opcional y está capeado en 500 chars (REQ-TX-5)

El sistema DEBE aceptar un campo `memo` que sea null O un
string de 1–500 chars. El sistema DEBE rechazar un `memo` de
más de 500 chars con `400 VALIDATION_ERROR`. El sistema NO DEBE
deny-listear ningún contenido de `memo` en el write boundary.
(Traces: BR-TX-8, DG-TX-11.)

#### Scenario: el memo de 500 chars se acepta

- GIVEN: una sesión autenticada
- WHEN: se llama a `POST /api/transactions` con un `memo` de
  500 chars
- THEN: el status de la respuesta es `201`

#### Scenario: el memo de 501 chars se rechaza

- GIVEN: una sesión autenticada
- WHEN: se llama a `POST /api/transactions` con un `memo` de
  501 chars
- THEN: el status de la respuesta es `400`
- AND: el `error.code` del body de la respuesta es
  `VALIDATION_ERROR`

### Authorization and access control

#### Requirement: todos los endpoints scopean al usuario autenticado (REQ-TX-6)

Cada endpoint bajo `/api/transactions/*` DEBE requerir una
sesión autenticada resuelta vía `auth()` desde
`src/modules/auth/index.ts`. El sistema DEBE derivar `userId`
de la sesión y NO DEBE confiar en ningún `userId` en los
request bodies. Cada referencia cross-module a una fila
`Transaction` DEBE scopear a `userId`; los reads cross-user
retornan `404 NOT_FOUND` (sin leak de información).
(Traces: BR-TX-4, DG-TX-10; invariante cross-module de
`auth/spec.md`.)

#### Scenario: 401 en cada endpoint cuando no hay sesión

- GIVEN: no hay cookie `authjs.session-token`
- WHEN: se llama a cualquiera de los seis endpoints
- THEN: el status de la respuesta es `401 UNAUTHORIZED`
- AND: no se retorna ningún dato

#### Scenario: el read cross-user retorna 404

- GIVEN: el usuario A es dueño de una `Transaction` con
  `id = X`
- WHEN: el usuario B llama a `GET /api/transactions/X`
- THEN: el status de la respuesta es `404 NOT_FOUND`
- AND: el body de la respuesta no leak-ea la existencia de la
  fila

#### Scenario: el update cross-user retorna 404

- GIVEN: el usuario A es dueño de una `Transaction` con
  `id = X`
- WHEN: el usuario B llama a `PATCH /api/transactions/X`
- THEN: el status de la respuesta es `404 NOT_FOUND`
- AND: la fila no se modifica

#### Scenario: el delete cross-user retorna 404

- GIVEN: el usuario A es dueño de una `Transaction` con
  `id = X`
- WHEN: el usuario B llama a `DELETE /api/transactions/X`
- THEN: el status de la respuesta es `404 NOT_FOUND`
- AND: la fila no se elimina

#### Requirement: una cuenta archivada rechaza los writes nuevos (REQ-TX-7)

El action layer DEBE pre-chequear el `archivedAt` de la
`FinancialAccount` padre. Si `archivedAt` es no-null, el
sistema DEBE rechazar `POST /api/transactions` y `PATCH
/api/transactions` (que cambia `accountId`) con `409
ACCOUNT_ARCHIVED`. (Traces: BR-TX-5.)

#### Scenario: un write contra una cuenta archivada se rechaza

- GIVEN: una `FinancialAccount` owned por el caller con
  `archivedAt = <ISO>` (no-null)
- WHEN: el caller postea `POST /api/transactions` con
  `accountId = <esa cuenta>`
- THEN: el status de la respuesta es `409`
- AND: el `error.code` del body de la respuesta es
  `ACCOUNT_ARCHIVED`
- AND: no se crea ninguna fila

### Endpoints

#### Requirement: GET /api/transactions retorna una lista cursor-paginated (REQ-TX-8)

El sistema DEBE retornar una lista paginada de las
transacciones del usuario autenticado, ordenadas por
`transactionDate` descendente. El endpoint DEBE soportar
`?cursor=<opaque>&limit=<n>&accountId=<id>`. El `limit` default
es 20, el mínimo es 1, el máximo es 100. Cuando se provee
`accountId`, la lista DEBE filtrarse a esa cuenta. (Traces:
BR-TX-10, DG-TX-14.)

#### Scenario: la lista retorna las transacciones del usuario

- GIVEN: el usuario autenticado tiene 3 transacciones
- WHEN: se llama a `GET /api/transactions`
- THEN: el status de la respuesta es `200`
- AND: el body de la respuesta contiene un array `data` con 3
  entries, ordenadas por `transactionDate` descendente
- AND: el body de la respuesta contiene `nextCursor` (null
  cuando quedan menos de `limit` filas)

#### Scenario: limit se clampea a 1..100

- GIVEN: cualquier estado
- WHEN: el caller pasa `?limit=500`
- THEN: el server clampea el limit a `100`
- AND: la respuesta es `200`

#### Scenario: limit por debajo de 1 se clampea a 1

- GIVEN: cualquier estado
- WHEN: el caller pasa `?limit=0`
- THEN: el server clampea el limit a `1`
- AND: la respuesta es `200`

#### Scenario: accountId filtra la lista

- GIVEN: el usuario tiene 3 transacciones en la cuenta A y 2 en
  la cuenta B
- WHEN: se llama a `GET /api/transactions?accountId=<A>`
- THEN: el body de la respuesta contiene exactamente las 3
  transacciones de la cuenta A

#### Requirement: POST /api/transactions crea una transacción (REQ-TX-9)

El sistema DEBE validar el body de create vía Zod, persistir
una fila `Transaction` owned por el session user, y retornar
`201` con la fila completa creada. El sistema DEBE rechazar
con los códigos definidos en `Error semantics` abajo. (Traces:
BR-TX-1 a BR-TX-11, DG-TX-9.)

#### Scenario: el body de create válido retorna 201 con la fila

- GIVEN: una sesión autenticada y una `FinancialAccount` padre
  con `currency = ARS`, `casa = oficial`
- WHEN: se llama a `POST /api/transactions` con un body válido
  `{ direction: EXPENSE, amountMinor: 1000, currency: ARS,
accountId: <A>, transactionDate: <hoy>, memo: "coffee" }`
- THEN: el status de la respuesta es `201`
- AND: el body de la respuesta contiene la fila completa
  (incluyendo `convertedAmountMinor`, `convertedCurrency`,
  `fxAsOfSnapshot`, `casaSnapshot`)
- AND: el `userId` de la fila es igual al id del session user

#### Requirement: PATCH /api/transactions/:id aplica un update parcial (REQ-TX-10)

El sistema DEBE aceptar un body parcial de los fields
updateables (`amountMinor`, `currency`, `transactionDate`,
`memo`, `category`) y retornar `200` con la fila actualizada.
El sistema DEBE recomputar el snapshot de FX si y solo si
`amountMinor` o `currency` cambió; en caso contrario, el
snapshot existente se preserva. (Traces: BR-TX-4, BR-TX-6.)

#### Scenario: editar memo preserva el snapshot de FX

- GIVEN: una fila `Transaction` con un `fxAsOfSnapshot` no-null
- WHEN: el owner llama a `PATCH /api/transactions/:id` con
  `{ memo: "updated memo" }`
- THEN: el status de la respuesta es `200`
- AND: el `memo` de la fila es `"updated memo"`
- AND: el `fxAsOfSnapshot` de la fila no cambia

#### Scenario: editar amountMinor recomputa el snapshot de FX

- GIVEN: una transacción USD contra una casa ARS, snapshot
  presente
- WHEN: el owner llama a `PATCH /api/transactions/:id` con
  `{ amountMinor: 2000 }`
- THEN: el status de la respuesta es `200`
- AND: se emite un nuevo call a FX
- AND: el `fxAsOfSnapshot` de la fila se actualiza al
  timestamp del nuevo call

#### Requirement: DELETE /api/transactions/:id hard-deletea la fila (REQ-TX-11)

El sistema DEBE hard-delear la fila owned por el caller. El
sistema DEBE retornar `204` (o `200`). Un `GET
/api/transactions/:id` de seguimiento DEBE retornar `404`.
(Traces: BR-TX-7, DG-TX-15.)

#### Scenario: el delete remueve la fila permanentemente

- GIVEN: una fila `Transaction` owned por el caller
- WHEN: se llama a `DELETE /api/transactions/:id`
- THEN: el status de la respuesta es `204`
- AND: un `GET /api/transactions/:id` de seguimiento retorna
  `404`
- AND: la fila no existe en la base de datos

### Multi-currency semantics

#### Requirement: el snapshot de FX en write time es determinístico y stale-tolerant (REQ-TX-12)

El sistema DEBE llamar a `FxRateProvider.getDisplayAmount({
casa })` en write time cuando `transaction.currency !== currency
de la casa`. El sistema DEBE persistir el `fxAsOf` del rate
como `fxAsOfSnapshot` aún cuando el rate esté stale. Stale no
es un 5xx (BR-ACC-13 cargada). Cuando la currency nativa
matchea la currency de la casa, el sistema DEBE skipear el call
a FX y setear `convertedAmountMinor = amountMinor`,
`convertedCurrency = transaction.currency`,
`fxAsOfSnapshot = null`, `casaSnapshot = null`. (Traces:
BR-TX-6, BR-ACC-12, BR-ACC-13, DG-TX-3, DG-TX-8.)

#### Scenario: FX stale se acepta en write

- GIVEN: el `FxRateProvider` retorna un rate con
  `stale: true` para la casa resuelta
- WHEN: una transacción USD se escribe contra una casa ARS
- THEN: el status de la respuesta es `201`
- AND: el `fxAsOfSnapshot` de la fila es el `fxAsOf` del
  provider
- AND: el body de la respuesta NO lleva `stale: true` a nivel
  del envelope (el timestamp del snapshot es la surface)

#### Scenario: native=casa skipea FX

- GIVEN: una `FinancialAccount` con `currency = USD` y
  `casa = oficial` (la currency de la casa es ARS por default
  — para el scenario, la currency de la cuenta iguala la
  currency de la casa)
- WHEN: el owner postea una transacción USD con la misma casa
  USD
- THEN: el call a FX se skipea
- AND: `convertedAmountMinor = amountMinor`

### Domain event

#### Requirement: TransactionRecorded se despacha después de un create exitoso (REQ-TX-13)

El sistema DEBE despachar el domain event `TransactionRecorded`
en el in-process event dispatcher en
`src/shared/events/event-dispatcher.ts` después de un create
exitoso. El payload del evento DEBE llevar
`{ userId, transactionId, accountId, direction, amountMinor,
currency, casa, convertedAmountMinor, convertedCurrency,
occurredAt }`. El sistema NO DEBE requerir un subscriber en
v1; la membresía en la unión es el contrato. (Traces:
BR-TX-11.)

#### Scenario: un create exitoso despacha el evento

- GIVEN: una sesión autenticada y un body de create válido
- WHEN: `POST /api/transactions` retorna `201`
- THEN: el event dispatcher central publicó un evento
  `TransactionRecorded` con el payload del create
- AND: futuros consumers de `reports` y `snapshots` pueden
  subscribirse sin un cambio de interface

### Observabilidad

#### Requirement: los structured log events cubren create/update/delete y la conversión de FX (REQ-TX-14)

El sistema DEBE emitir los siguientes structured log events con
los fields listados vía `src/shared/logger/logger.ts`:

- `transactions.create` — `{ userId, accountId, direction,
amountMinor, currency, casa, fxAsOf }`.
- `transactions.update` — `{ userId, id, fieldsChanged[],
fxRecomputed: boolean }`.
- `transactions.delete` — `{ userId, id }`.
- `transactions.fx.convert` — `{ userId, casa, native, display,
fxAsOf, stale }` (solo se emite cuando un call a FX realmente
  ocurrió).

El sistema DEBE strippear el contenido de `memo` de cualquier
payload de log capturado (BR-TX-8, BR-AUTH-11 cargada de
`auth/spec.md`).

(Traces: BR-TX-8, BR-TX-11.)

#### Scenario: un create emite transactions.create con casa y fxAsOf

- GIVEN: una cuenta ARS y una transacción USD
- WHEN: el create succeede
- THEN: se captura un evento `transactions.create` con
  `casa = OFICIAL` y `fxAsOf = <ISO>` (el timestamp del
  snapshot)
- AND: el campo `memo` NO está presente en el payload
  capturado

#### Scenario: memo se strippea de los logs

- GIVEN: un body de create con `memo = "secret name"`
- WHEN: cualquier structured log event se captura
- THEN: el payload capturado NO contiene el string literal
  `"secret name"` ni la key `memo`

### Superficie de UI de producción (ex REQ-TX-15)

#### Requirement: la superficie de UI de producción es owned por la capability ui (REQ-TX-15)

El sistema DEBE renderizar la superficie user-facing de calidad
de producción para `/transactions`, `/transactions/[id]`,
`/transactions/new`, `/accounts`, `/accounts/[id]`,
`/accounts/new`, y `/dashboard` a través de la capability
`ui` en `openspec/specs/ui/spec.md`. La UI de producción DEBE
satisfacer todo Requirement codificado en `ui/spec.md`
REQ-UI-1 a REQ-UI-11, incluyendo:

- Los dos flags aditivos de query sobre los GET endpoints
  existentes (`include=lastActivity` sobre `/api/accounts`,
  REQ-UI-1; `include=accountName` sobre `/api/transactions`,
  REQ-UI-2).
- La máquina de estados de página de lista cubriendo empty /
  loading / error / success (REQ-UI-3).
- El floor de accesibilidad WCAG 2.2 AA (REQ-UI-4 a
  REQ-UI-8).
- La restricción de tema light único (REQ-UI-9).
- Los deliverables de docs y QA
  (`docs/architecture/ui.md`, `docs/qa/transactions-ui.md`,
  REQ-UI-10 y REQ-UI-11).

Las tres páginas bajo `app/transactions/` (list, detail, create)
y los componentes presentacionales a nivel de página
correspondientes (`TransactionsListTable`, `TransactionDetail`,
`CreateTransactionForm`) DEBEN mantener el gate de Server
Component `auth()`, el data path `serverHonoRequest`, y las
rutas Hono existentes (`/api/transactions/*`); solo cambia la
capa de render. Los dos flags de query son aditivos sobre los
GET endpoints existentes — el endpoint sin el flag DEBE
mantenerse byte-identical al contrato actual (REQ-UI-1,
REQ-UI-2). No se introduce ninguna ruta nueva bajo
`app/transactions/**` ni código nuevo de framework HTTP.

(Traces: `ui/spec.md` REQ-UI-1 a REQ-UI-11. Reemplaza el
wording original "Three smoke pages mirror the accounts slice"
que vivía en este spec en la última sincronización 2026-06-22.)

#### Scenario: sesión faltante redirige a /auth/signin

- GIVEN: no hay cookie de sesión
- WHEN: el usuario visita `/transactions`
- THEN: la respuesta es un 302 a
  `/auth/signin?callbackUrl=%2Ftransactions`

#### Scenario: la lista vacía muestra el empty state con CTA

- GIVEN: un usuario autenticado con cero transacciones
- WHEN: el usuario visita `/transactions`
- THEN: la página renderiza la primitiva `EmptyState`
  (REQ-UI-3)
- AND: la página renderiza un botón `New transaction`
  linkeando a `/transactions/new`

#### Scenario: el detail renderiza el timestamp del snapshot

- GIVEN: una fila `Transaction` owned por el usuario
  autenticado con `fxAsOfSnapshot = <ISO>`
- WHEN: el usuario visita `/transactions/:id`
- THEN: la página renderiza la fila en un layout basado en
  `Card` (REQ-UI-3)
- AND: la página renderiza `fxAsOfSnapshot` como el texto
  plano `"Rate as of: <ISO>"`

#### Scenario: el account picker dirige la flow card del dashboard

- GIVEN: una sesión autenticada
- AND: existe la cuenta `A` con un flow no vacío
- WHEN: el usuario visita `/dashboard?accountId=<A>`
- THEN: la flow card fetcha
  `/api/reports/accounts/<A>/flow`
- AND: la flow card renderiza el flow diario por cuenta
  (REQ-UI-3)

## Error semantics

La capability `transactions` introduce tres nuevos códigos
que se unen al enum existente en
`src/shared/errors/error-codes.ts:12-43`. Todas las demás
fallas reusan códigos existentes (`VALIDATION_ERROR`,
`UNAUTHORIZED`, `NOT_FOUND`, etc.). El mapping es normativo.

| Code                      | HTTP | Trigger                                                                                     | Caller surface                                                      |
| ------------------------- | ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `INVALID_AMOUNT`          | 400  | `amountMinor <= 0`, negativo después de derivar el signo de `direction`, o non-finite.      | Inline error banner en `POST /api/transactions`.                    |
| `FUTURE_DATE_NOT_ALLOWED` | 400  | `transactionDate > Clock.now()`.                                                            | Inline error banner en `POST /api/transactions`.                    |
| `ACCOUNT_ARCHIVED`        | 409  | El `archivedAt` de la `FinancialAccount` padre es no-null en write time.                    | Inline error banner en `POST /api/transactions`.                    |
| `VALIDATION_ERROR`        | 400  | Cualquier otra falla de schema (p. ej. `direction = TRANSFER`, `memo > 500 chars`).         | Inline error banner; primer mensaje de `details`.                   |
| `UNAUTHORIZED`            | 401  | Sin sesión, cookie faltante, sesión expirada, o usuario desconocido (según `auth/spec.md`). | 307 redirect para App Router pages; 401 JSON para Hono.             |
| `NOT_FOUND`               | 404  | Acceso cross-user a `Transaction`, o `id` no existente (sin leak de información).           | `redirect('/transactions')` para la detail page (patrón BR-ACC-19). |

El sistema NO DEBE incluir stack traces, objetos de error de
Prisma, ni request bodies en ninguna respuesta de error.

## Migración

La migración de Prisma para el modelo `Transaction` es el único
cambio persistente de schema en este cambio.

```sql
-- non-destructive; additive; sin backfill; sin row rewrite
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
`FinancialAccount` y `User` quedan sin cambios. **Sin pérdida
de datos.** El schema gate assertado por `sdd-verify` es
`SELECT count(*) FROM "FinancialAccount"` antes y después de
la migración retornando el mismo valor.

Los cambios de schema de Prisma son aditivos:

- Nuevo enum `TransactionDirection` con valores `INCOME`,
  `EXPENSE`, `TRANSFER`.
- Nuevo modelo `Transaction` con la lista de fields e índices
  de arriba.

## Out of scope (este cambio)

Cargado verbatim de la propuesta; ver
`openspec/changes/transactions/proposal.md` §"Out of scope"
para detalle.

- Transfers entre dos cuentas (aggregate `Transfer` o link
  `transferGroupId`).
- Attachments (modelo `Attachment`, port `AttachmentStorage`,
  `LocalDiskAttachmentStorage`).
- Recurrence (`RecurrenceRule`, generador on-demand).
- Idempotency keys en `POST /api/transactions`.
- Bank import / CSV upload.
- OCR en recibos.
- Multi-user / cuentas compartidas / viewer read-only.
- Push notifications.
- Archivo histórico de FX para transacciones back-dated.
- AI categorization.
- Budget rules / spending limits.
- UI de producción (la capability `ui` es dueña de la
  superficie de producción; este spec la referencia pero no la
  duplica).
- Mobile app.

## Cross-references

- **Propuesta**: `openspec/changes/transactions/proposal.md` —
  el cambio upstream que creó esta capability. BR-TX-1 a
  BR-TX-11 y los BRs cargados están codificados acá; la
  propuesta carga la rationale, las alternativas consideradas y
  el forecast.
- **Propuesta (delta)**: `openspec/changes/transactions-ui/proposal.md`
  — el cambio upstream que introdujo la UI de producción y
  agregó BR-UI-1 a BR-UI-9. El spec de la capability `ui`
  vive en `openspec/changes/transactions-ui/specs/ui/spec.md`
  y se promueve a canónico vía `sdd-archive`. REQ-TX-15 en
  este spec apunta a REQ-UI-1 a REQ-UI-11 en ese spec; la
  evolución futura de UI aterriza como adiciones a la
  capability `ui`.
- **Spec de la capability ui**: `openspec/specs/ui/spec.md` —
  REQ-UI-1 a REQ-UI-11 son dueños de la superficie de UI de
  producción, incluyendo los dos flags aditivos de query y el
  floor de accesibilidad WCAG 2.2 AA.
- **Spec de accounts**: `openspec/specs/accounts/spec.md` —
  BR-ACC-12 declara el contrato de FX display-only;
  BR-ACC-13 cubre la frescura de FX; BR-ACC-18 cubre el render
  del widget smoke. El nuevo FK `Transaction.accountId` es un
  cross-link point.
- **Delta spec de per-account casa**:
  `openspec/changes/fx-cache/specs/accounts/spec.md` (o su
  sucesor canónico si está archivado) — la regla de resolución
  de casa en el call site (BR-FX-3) vive acá.
- **Spec de FX**: `openspec/specs/fx/spec.md` — REQ-FX-3
  declara la invariante de "resolución de casa es
  responsabilidad del caller" que `transactions` carga.
  REQ-FX-9 documenta el precedente de migración aditiva que la
  migración de `Transaction` sigue.
- **Spec de auth**: `openspec/specs/auth/spec.md` — la
  invariante del helper server-side `auth()` (cross-module
  contracts §"auth() server-side helper") y la regla "toda
  query `WHERE userId = ?` de cualquier otro módulo DEBE
  scopear al caller". La capability `transactions` sigue esta
  invariante en cada endpoint.
- **Delta spec de transactions accounts**:
  `openspec/changes/transactions/specs/accounts/spec.md` — el
  spec delta sibling que anota el nuevo FK
  `Transaction.accountId` a `FinancialAccount` para lectores
  cross-module.
- **Port interface (input estable)**:
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`
  — la interface que consume `TransactionService`. Vive en
  `accounts`; `transactions` depende de ella (la dirección del
  port es `transactions → accounts`, no al revés).
- **Servicios externos**: ninguno. DolarAPI se alcanza vía el
  `FxRateProvider` existente; sin nuevo servicio externo.

## Historial

- **2026-06-22 (v1)** — primera escritura. Creada por el
  cambio `transactions`. Cierra DG-TX-1 a DG-TX-15 (15
  decisiones cerradas por el proposer + el grill de
  pre-propose). Scope: aggregate `Transaction` + CRUD +
  multi-currency vía la capability `fx` + smoke UI. Attachments,
  recurrence e idempotency keys se difieren a v1.1+ del mismo
  cambio.
- **2026-06-27 (transactions-ui)** — REQ-TX-15 REEMPLAZADO. El
  wording "Three smoke pages mirror the accounts slice" se
  reemplaza por una referencia fina a la nueva capability
  `ui`, que es dueña de REQ-UI-1 a REQ-UI-11. REQ-TX-1 a
  REQ-TX-14 se preservan verbatim. Sin cambios de BR; sin
  cambios de comportamiento en las rutas Hono; sin cambios de
  data model; sin nuevas dependencias top-level. La capability
  `ui` se promueve desde
  `openspec/changes/transactions-ui/specs/ui/spec.md` a
  `openspec/specs/ui/spec.md` por `sdd-archive`.

## Referencias

- `openspec/changes/transactions/proposal.md` — propuesta v1
  (2026-06-22) con DG-TX-1 a DG-TX-15 cerradas.
- `openspec/changes/transactions/explore.md` — investigación
  upstream (15 DG-TX-N + 4 open questions, ~50
  file:line citations).
- `openspec/changes/transactions-ui/proposal.md` — propuesta
  v1 (2026-06-27) con BR-UI-1 a BR-UI-9 y las cuatro open
  questions lockeadas.
- `openspec/specs/accounts/spec.md` — capability canónica
  `accounts`; BR-ACC-12, BR-ACC-13, BR-ACC-18.
- `openspec/specs/fx/spec.md` — capability canónica `fx`;
  REQ-FX-3 (resolución de casa), REQ-FX-9 (migración
  aditiva).
- `openspec/specs/auth/spec.md` — capability canónica `auth`;
  invariante del helper `auth()`, userId scoping.
- `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`
  — el port que `TransactionService` consume sin cambios.
- `src/modules/accounts/application/actions/get-account-balance.action.ts:67-100`
  — el call site canónico de conversión que `TransactionService`
  espeja para el create path.
- `src/shared/errors/error-codes.ts` — `INVALID_AMOUNT`,
  `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED` se unen al
  enum existente.
- `src/shared/events/event-dispatcher.ts` —
  `TransactionRecorded` se une a la unión `DomainEvent`.
- `openspec/config.yaml` — reglas de TDD estricto; runner
  `pnpm test`.
- `AGENTS.md` (raíz) — §5.3 política de `pnpm-lock.yaml`;
  §13 política de mirror de docs en dos idiomas.
