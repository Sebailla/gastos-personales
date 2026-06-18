# Propuesta — `accounts-ledger`

**Estado**: borrador (corregido) — corregido por review del usuario · **Autor**: Sebastián Illa
**Creado**: 2026-06-18 · **Slice objetivo**: MVP-2 (capacidad post-auth) · **Capacidad**: `accounts`
**Upstream**: preflight SDD global (interactive, both, auto-forecast, 400 líneas)
**Depende de**: `auth` (cerrada por la sync del 2026-06-14; PRs #19, #20, #22, #23, #24, #25)
**Slot de spec canónica**: `openspec/specs/accounts/spec.md` (no existe todavía — este change la escribe)
**TDD estricto**: activado (la capa de dominio tiene muchas reglas; RED → GREEN → REFACTOR por `tasks.md`)

> **Nota de naming (leer primero)**: el modelo Prisma
> `Account` en `prisma/schema.prisma` es el **link OAuth de
> Auth.js** (`provider` + `providerAccountId`). La entidad
> de cuenta financiera en este change es **`FinancialAccount`**
> en la capa Prisma y **`Account`** en la capa de la API/DTO
> pública. El mismatch Prisma-vs-API es una decisión
> deliberada de namespace — ver el callout `Naming
collision` en `### Data model` más abajo. La fase
> `sdd-design` es la dueña del mapeo field-by-field final.

## Por qué

`gastos-personales` es una app de finanzas multi-usuario.
La capacidad `auth`, ya cerrada, le da a cada request un
`userId` confiable. La siguiente entidad en el modelo
mental del usuario es la **cuenta** — el contenedor que
guarda dinero (efectivo en mano, una cuenta bancaria, una
tarjeta de crédito). Sin cuentas no hay transactions, no
hay snapshots, no hay reports, no hay net worth; cada
capacidad posterior depende de esta.

Hacer cuentas antes que transactions es también la única
forma de hacer bien la **semántica del saldo inicial
(opening balance)**. Si transactions llega primero, el
saldo inicial queda como un campo derivado; si accounts
llega primero con un opening balance manual, el diseño es
honesto sobre el límite ("no hay transactions antes de
`openingBalanceDate`"), mantiene abierta la opción de
derivar después, y aísla la complejidad de reglas de
ownership (cada entidad keyed por `userId`, cada ruta
scopeada por `WHERE userId = ?`) en este change para que
`transactions` se pueda concentrar en la contabilidad
estilo double-entry.

Los cross-module contracts del spec de `auth` ya nombran
a este change como el consumer del evento
`UserRegistered` para sembrar cuentas por defecto (ver
`openspec/specs/auth/spec.md` §"Cross-module contracts >
`UserRegistered` event"). Esa costura se cierra acá: el
módulo `accounts` se suscribe al evento pero hace **un
no-op que loggea** en este change; el seed por defecto se
difiere al change `ui-accounts` (que puede flippear una
preferencia por usuario).

## Qué

Un módulo `accounts` autocontenido sobre el Hono catch-all
de `auth`, siguiendo la arquitectura modular + por capas
del proyecto (Domain NO conoce Application/Infrastructure/
UI; la dirección de dependencias es estricta; ver skill
`architecture-standards`). El módulo es dueño de una tabla
Prisma (`FinancialAccount`), cinco rutas Hono bajo
`/api/accounts/*`, una superficie de DTOs validada con
Zod, y una suscripción no-op a `UserRegistered`.

### Ronda de preguntas de la propuesta (4 decisiones de producto, 3 corregidas)

La ronda de preguntas pre-propuesta timed-out sin
respuesta de la sesión supervisora. Por la regla de
fallback del contrato, esta propuesta avanzó
originalmente con **defaults explícitos** documentados
abajo. Las preguntas Q1, Q2 y Q3 fueron **corregidas** en
el mismo ciclo SDD después de que el user revisó la
propuesta y proveyó las respuestas corregidas. Q4 quedó
confirmada sin cambios. Las correcciones se reflejan a
lo largo de toda la propuesta (data model, reglas de
negocio, edge cases, brechas de decisión, implicaciones).

| #   | Pregunta                   | Default aceptado (esta propuesta)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Dónde aparece                                                                              |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Tipos de cuenta en día 1   | **Los cinco tipos canónicos + Other** (`type` enum: `CASH \| BANK \| CREDIT \| INVESTMENT \| CRYPTO \| OTHER`). Set de campos por tipo: `CASH` / `BANK` / `OTHER` no aceptan campos específicos requeridos; `CREDIT` requiere `creditLimit`, `statementDay`, `paymentDueDay` (prohibidos en cualquier otro tipo); `INVESTMENT` acepta un `broker: string` opcional (nullable en la DB, opcional en el DTO); `CRYPTO` acepta un `walletAddress: string` opcional (nullable en la DB, opcional en el DTO); `OTHER` es totalmente free-form. Enforzado por un Zod discriminated union sobre `type` (BR-ACC-8).                                                                                                                                                         | `Business rules BR-ACC-1`, `BR-ACC-8`, `Data model`, `Edge cases`                          |
| 2   | Multi-moneda desde día 1   | **Cada cuenta elige su propia moneda.** `FinancialAccount.currency` se elige en la creación (sin herencia de ningún default a nivel user; este change **no** agrega `User.baseCurrency` — esa columna vive en el futuro change `user-preferences`). El set de monedas soportadas queda restringido a `{ ARS, USD }` en este change, enforzado por un Zod refine sobre el DTO; `fx-cache` ampliará la whitelist después. Sin modificaciones de tablas de auth en este change (BR-ACC-9).                                                                                                                                                                                                                                                                             | `Business rules BR-ACC-2`, `BR-ACC-9`, `Implicaciones e impacto`, `Brechas de decisión #1` |
| 3   | Manejo del opening balance | **Híbrido — discriminated union sobre `openingBalanceMode: 'historical' \| 'fresh'`.** El schema de Zod tiene dos variantes: `fresh` (sin campos de opening balance; aplican los defaults `openingBalanceAmount = 0` y `openingBalanceDate = createdAt` en la capa de DB) e `historical` (ambos `openingBalanceAmount` y `openingBalanceDate` son requeridos). PATCH muta los campos subyacentes `openingBalanceAmount` y `openingBalanceDate` directamente (sin discriminator — el mode es una concern de intención de creación). `currentBalance` se deriva en código (`openingBalanceAmount + sum(transactions >= openingBalanceDate)`); la fase de design decide si materializar un cache `currentBalance`. Rationale de la elección documentado en `BR-ACC-3`. | `Business rules BR-ACC-3`, `Data model`, `Edge cases`                                      |
| 4   | Semántica de soft-archive  | **Soft archive vía `archivedAt DateTime?`** (confirmado sin cambios, no se corrige). `DELETE /api/accounts/:id` **no** se expone en este change; el endpoint de lifecycle es `POST /api/accounts/:id/archive` (setea `archivedAt`) y `POST /api/accounts/:id/unarchive` (la limpia). Las cuentas archivadas siguen en historial y reports.                                                                                                                                                                                                                                                                                                                                                                                                                          | `Business rules BR-ACC-4`, `Endpoints`, `Edge cases`                                       |

### Endpoints

Todas las rutas viven bajo el Hono catch-all existente en
`app/api/[...path]/route.ts`. Cada endpoint que muta
re-valida el header `Origin` contra la allowlist
`env.APP_URL` (mitigación CSRF; misma regla que usa el
módulo `auth`). Cada endpoint enforce el scope `WHERE
userId = ?` usando `auth().user.id` desde `@/modules/auth`.

| Método | Ruta                          | Auth    | Comportamiento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ----------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/accounts`               | session | Lista cuentas owned por el caller. Query params: `includeArchived` (default `false`), `type` (filtro opcional). Paginación: `?limit=50&cursor=<id>` (cursor sobre `createdAt, id`). Devuelve `{ data: AccountSummary[] }`.                                                                                                                                                                                                                                                                          |
| POST   | `/api/accounts`               | session | Crea una cuenta. Body validado por Zod. En éxito devuelve `201 { data: AccountDetail }` y no despacha evento (la creación es user-initiated, no system-initiated).                                                                                                                                                                                                                                                                                                                                  |
| GET    | `/api/accounts/:id`           | session | Trae una cuenta owned por el caller. `404 NOT_FOUND` si no existe O si es owned por otro user (mismo shape de respuesta — sin enumeración).                                                                                                                                                                                                                                                                                                                                                         |
| PATCH  | `/api/accounts/:id`           | session | Actualiza campos mutables: `name`, campos type-dependent (`creditLimit`, `statementDay`, `paymentDueDay`, `broker`, `walletAddress` — los últimos dos sólo en `INVESTMENT` / `CRYPTO` respectivamente), `currency`, `openingBalanceAmount`, `openingBalanceDate`. `type` y `userId` **no** son mutables; el discriminator `openingBalanceMode` es una concern de intención de creación y **no** se acepta en PATCH (mutar los campos subyacentes directamente). Devuelve `{ data: AccountDetail }`. |
| DELETE | `/api/accounts/:id`           | session | **No se expone en este change.** Ver `BR-ACC-4` y la nota de `### Endpoints` abajo.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| POST   | `/api/accounts/:id/archive`   | session | Soft archive: setea `archivedAt = now()`. Idempotente (un segundo call devuelve la fila sin cambios, sin error). Devuelve `{ data: AccountDetail }`.                                                                                                                                                                                                                                                                                                                                                |
| POST   | `/api/accounts/:id/unarchive` | session | Limpia `archivedAt`. Idempotente. Devuelve `{ data: AccountDetail }`.                                                                                                                                                                                                                                                                                                                                                                                                                               |

**Nota sobre endpoints — no hay `DELETE /api/accounts/:id`**:
el default de soft-archive (Q4) significa que "cerrar"
una cuenta es `POST /archive`, no un delete. Hard delete
queda reservado para el futuro change `user-deletion`
(que `onDelete: Cascade` la fila `FinancialAccount` junto
con el `User`). Si el user prefiere un endpoint de
hard-delete en review, esta propuesta se corrige; la
matriz de comportamiento es la misma (`409 ACCOUNT_HAS_TRANSACTIONS`
cuando hay transactions, `204` en caso contrario).

### Data model

Un nuevo modelo Prisma + una columna agregada a `User`.
El modelo `FinancialAccount` vive en `prisma/schema.prisma`
al lado de los modelos de auth; el namespace es
deliberado (ver la `Naming note` arriba de esta
propuesta).

```prisma
// prisma/schema.prisma — additions for accounts-ledger

model FinancialAccount {
  id                   String        @id @default(cuid())
  userId               String

  // identity
  name                 String        // user-chosen display name (e.g. "Galicia cuenta sueldo")
  type                 AccountType   // enum: CASH | BANK | CREDIT | INVESTMENT | CRYPTO | OTHER

  // currency (elegida en la creación; restringida a { ARS, USD } en este change — BR-ACC-2)
  currency             String        @db.Char(3)  // ISO-4217; uppercase; Zod-normalized; Zod refine a { ARS, USD }

  // opening balance (BR-ACC-3 — discriminated union sobre openingBalanceMode en el DTO;
  // ambas columnas tienen defaults a nivel DB para que la variante 'fresh' se resuelva limpio)
  openingBalanceAmount Decimal       @default(0)  @db.Decimal(19, 4)
  openingBalanceDate   DateTime      @db.Date     // UTC date; sin componente de hora; defaulted a createdAt en código

  // campos type-dependent (null salvo que el tipo correspondiente lo requiera — BR-ACC-8)
  creditLimit          Decimal?      @db.Decimal(19, 4)  // CREDIT únicamente (requerido)
  statementDay         Int?          // 1..28 (upper bound seguro); CREDIT únicamente
  paymentDueDay        Int?          // 1..28; CREDIT únicamente
  broker               String?       // INVESTMENT únicamente (opcional, nullable)
  walletAddress        String?       // CRYPTO únicamente (opcional, nullable)

  // lifecycle
  archivedAt           DateTime?     // soft-archive (BR-ACC-4)

  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt

  user                 User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])     // acceso primario del endpoint de list
  @@index([userId, archivedAt])                // el filtro default del list excluye archivadas
  @@unique([userId, name])                     // (BR-ACC-5) los nombres de cuenta son únicos por user
}

enum AccountType {
  CASH
  BANK
  CREDIT
  INVESTMENT
  CRYPTO
  OTHER
}
```

`User` **no** se modifica en este change. La columna
`User.baseCurrency` del draft previo se retira; la
preferencia de moneda a nivel user vive en el futuro
change `user-preferences`. Ver `BR-ACC-2` y `BR-ACC-9`
para el framing revisado.

**Set de campos por tipo (BR-ACC-8, Zod discriminated
union sobre `type`)**:

| `type`       | Extras requeridos                              | Extras opcionales       |
| ------------ | ---------------------------------------------- | ----------------------- |
| `CASH`       | —                                              | —                       |
| `BANK`       | —                                              | —                       |
| `CREDIT`     | `creditLimit`, `statementDay`, `paymentDueDay` | —                       |
| `INVESTMENT` | —                                              | `broker: string`        |
| `CRYPTO`     | —                                              | `walletAddress: string` |
| `OTHER`      | —                                              | —                       |

El schema de Zod rechaza cualquier campo extra cuyo
tipo no lo admita (ej. `creditLimit` en una cuenta
`CASH`, `broker` en una cuenta `CRYPTO`, `walletAddress`
en una cuenta `INVESTMENT`, cualquier extra en `OTHER`).

**Callout del naming collision**: el modelo Prisma es
`FinancialAccount` porque el modelo `Account` del Auth.js
adapter (link OAuth) es de la capacidad `auth` y NO
debe ser modificado a mano (spec de auth, §"Entities").
La API pública, los DTOs, y los nombres de eventos usan
el nombre sin cualificar `Account` para que el URL space
quede `/api/accounts/...` y el modelo mental del user no
se contamine con la capa OAuth. El mapeo Prisma-vs-API
(`FinancialAccount` ↔ DTO `Account`) vive en
`src/modules/accounts/infrastructure/repositories/financial-account.repository.ts`
como un mapper privado. El Hono client
(`hc<typeof honoApp>`) exporta únicamente tipos `Account`.
La fase `sdd-design` finaliza los campos del mapper.

**Precisión Decimal**: `Decimal(19, 4)` aguanta hasta
9.999.999.999.999,9999 en cualquier moneda. La escala de
finanzas personales está bien adentro de esto; las
agregaciones de reports nunca overflowean. El dinero se
guarda como `Decimal`, nunca `Float`.

**Indexes**:

- `@@index([userId, createdAt(sort: Desc)])` — acceso
  primario para `GET /api/accounts` (cursor pagination).
- `@@index([userId, archivedAt])` — el filtro default
  del list (`includeArchived=false`) hace
  `WHERE userId = ? AND archivedAt IS NULL`; el partial
  scan es rápido con este index.
- `@@unique([userId, name])` — ver `BR-ACC-5`.

**Cascade**: `FinancialAccount.user` usa
`onDelete: Cascade`. Cuando el change `user-deletion`
borre un `User`, todas las filas `FinancialAccount` se
van con él.

**Invariantes de dinero**:

- `currency` es ISO-4217 en mayúsculas, length 3,
  validado por Zod en cada action boundary.
- `openingBalanceAmount` puede ser negativo (los saldos
  de tarjeta de crédito arrancan negativos cuando el
  user le debe al banco; efectivo en mano arranca en
  cero o positivo).
- `openingBalanceDate` es una fecha (sin componente de
  hora); `transactions` la va a usar como lower bound
  para "movimientos que cuentan para el current balance".

### Estructura del módulo

```
src/modules/accounts/
├── domain/
│   ├── entities/
│   │   └── account.entity.ts          # Account, AccountType, CreateAccountInput, UpdateAccountInput
│   ├── services/
│   │   └── accounts.service.ts        # list / create / get / update / archive / unarchive
│   └── errors.ts                      # AccountError, NotFoundError, ConflictError, ValidationError (thin wrappers over shared AppError)
├── application/
│   ├── actions/
│   │   ├── list-accounts.action.ts
│   │   ├── create-account.action.ts
│   │   ├── get-account.action.ts
│   │   ├── update-account.action.ts
│   │   ├── archive-account.action.ts
│   │   └── unarchive-account.action.ts
│   ├── dto/
│   │   ├── account.dto.ts             # Zod schemas + inferred TS types
│   │   └── list-accounts.dto.ts
│   └── routes.ts                      # OpenAPIHono sub-app, exported for the auth module's honoApp to mount
├── infrastructure/
│   ├── repositories/
│   │   └── financial-account.repository.ts  # Prisma impl; private mapper FinancialAccount ↔ Account DTO
│   └── events/
│       └── user-registered.subscriber.ts    # no-op logger.info in this change
└── index.ts                            # public exports: Account (entity + DTO), AccountsService, accountsRouter
```

El `src/modules/accounts/index.ts` es la superficie
pública del módulo: tipos de dominio + handle del
service + `accountsRouter` (el sub-app de Hono). El
`honoApp` del módulo `auth` monta
`accountsRouter.route("/accounts", ...)` en la capa de
wiring (el wiring exacto es decisión de `sdd-design` —
la propuesta sólo requiere que las rutas
`/api/accounts/*` resuelvan por el Hono catch-all
existente).

### Cross-module integration

- **Identidad**: cada action llama a `auth()` desde
  `@/modules/auth` y usa `session.user.id` como scope
  key. Ningún módulo lee la cookie, el header, o la
  tabla `Session` directamente (spec de auth
  §"Cross-module contracts > `auth()` server-side helper").
- **User.email**: no se duplica en `FinancialAccount`.
  El email pertenece a `User` (spec de auth,
  §"`User` is the single source of truth for identity").
- **Evento `UserRegistered`**: el módulo se suscribe vía
  el in-process dispatcher en `src/shared/events/`. En
  este change el handler es un **no-op**:
  `logger.info({ eventType: 'UserRegistered', userId })`.
  El seed de cuentas por defecto se difiere al change
  `ui-accounts` (que puede flippear una preferencia por
  usuario; este change todavía no introduce esa
  preferencia).
- **Mounting de `OpenAPIHono`**: el módulo `auth`
  exporta `honoApp` (typed `OpenAPIHono<{ Variables:
{ user: PublicUser | null } }>`). El módulo `accounts`
  exporta `accountsRouter` (typed `OpenAPIHono`). El
  wiring en `app/api/[...path]/route.ts` (o un módulo
  dedicado `api` — `sdd-design` decide) monta
  `accountsRouter.route("/accounts", ...)` sobre la
  instancia `honoApp`. El catch-all entonces resuelve
  `/api/accounts/*` a este módulo sin tocar las rutas
  específicas de auth.

### Comportamiento (business rules)

El set completo de reglas vive en `## Business rules`
abajo. Las reglas más consequentes se listan acá para
que las secciones de data-model + endpoints las
puedan referenciar:

- **BR-ACC-1**: `type ∈ { CASH, BANK, CREDIT, INVESTMENT, CRYPTO, OTHER }`. `type` es
  inmutable después de la creación (re-type es
  delete + create).
- **BR-ACC-2**: el `currency` de cada cuenta DEBE ser un
  código ISO-4217 en mayúsculas, restringido a la
  whitelist `{ ARS, USD }` en este change (Zod refine
  sobre el DTO). La moneda se elige en la creación (sin
  default a nivel user; este change **no** agrega
  `User.baseCurrency`). Mutable vía `PATCH` solo si no
  hay transactions que referencien la cuenta (chequeo
  futuro; este change todavía no gatea con transactions).
- **BR-ACC-3**: el opening balance es un **híbrido vía
  un Zod discriminated union sobre `openingBalanceMode:
'historical' | 'fresh'`**. La variante `'fresh'` no
  requiere campos de opening balance; la aplicación setea
  `openingBalanceAmount = 0` y `openingBalanceDate =
createdAt` (los defaults a nivel DB respaldan esto). La
  variante `'historical'` requiere ambos
  `openingBalanceAmount` (Decimal como string, puede ser
  negativo) y `openingBalanceDate` (UTC date, sin
  componente de hora). `PATCH` muta `openingBalanceAmount`
  y `openingBalanceDate` directamente (sin discriminator
  — el mode es una concern de intención de creación).
  `currentBalance` se deriva
  (`openingBalanceAmount + sum(tx >= openingBalanceDate)`);
  la fase de design decide si materializar un cache
  `currentBalance`.
- **BR-ACC-4**: archive es una transición de estado vía
  `archivedAt DateTime?`. No hay hard delete en este
  change.
- **BR-ACC-5**: `name` de cuenta es único por `userId`
  (enforzado por `@@unique([userId, name])`).
- **BR-ACC-6**: `WHERE userId = ?` se enforce en cada
  action y cada método de repository; la DB no tiene
  row-level security en MVP, así que la capa de
  aplicación es la única línea de defensa (matchea la
  spec de auth).
- **BR-ACC-7**: requests con mismatch de `WHERE userId = ?`
  devuelven `404 NOT_FOUND`, nunca `403 FORBIDDEN` —
  mismo shape entre "no existe" y "no es tuyo" para que
  un user no pueda enumerar IDs de otros users.
- **BR-ACC-8**: un Zod discriminated union sobre `type`
  enforce el set de campos por tipo: `CASH` / `BANK` /
  `OTHER` no aceptan campos type-specific; `CREDIT`
  requiere `creditLimit`, `statementDay`, `paymentDueDay`
  (todos prohibidos en cualquier otro tipo); `INVESTMENT`
  acepta un `broker: string` opcional; `CRYPTO` acepta un
  `walletAddress: string` opcional. La tabla completa por
  tipo vive en `### Data model`.
- **BR-ACC-9**: **sin modificaciones de tablas de auth en
  este change.** Las 4 tablas owned por auth (`User`,
  `Account`, `Session`, `VerificationToken`) no se
  tocan. La columna `User.baseCurrency` del draft previo
  se retira; ese path de escritura vive en el futuro
  change `user-preferences`.
- **BR-ACC-10**: el middleware `origin-check` (CSRF)
  corre en cada endpoint que muta. Misma regla que
  `POST /api/auth/register`. Mismatch → `403 FORBIDDEN`.

## Fuera de alcance (este change)

- **Transactions** (change `transactions` aparte).
  La derivación de `currentBalance` se esboza en
  `BR-ACC-3` pero no se implementa.
- **Conversión multi-moneda / FX** (change `fx-cache`
  aparte). Este change shippea con la whitelist de currency
  `{ ARS, USD }`; `fx-cache` amplía el set cuando llegue.
- **Net-worth snapshots** (change `networth-snapshot`).
- **Reports** (change `reports-mvp`).
- **UI** (change `ui-accounts` — sign-in + onboarding +
  pantallas CRUD). Este change sólo shippea el HTTP API.
- **Loan accounts** (el enum queda cerrado en
  `CASH | BANK | CREDIT | INVESTMENT | CRYPTO | OTHER` en
  este change; un futuro change puede agregar `LOAN` o
  un modelo hermano si hace falta).
- **Seed de cuentas por defecto en `UserRegistered`** —
  suscrito pero con un no-op logger. El comportamiento
  de seeding se decide en `ui-accounts` (preferencia por
  user).
- **Hard delete** (`DELETE /api/accounts/:id`) — diferido
  a `user-deletion` (cascade) o a un follow-up si el
  user lo prefiere en review.
- **Sharing / joint accounts** — fuera de alcance para
  MVP. Cada cuenta es owned por exactamente un `userId`.
- **Snapshots de historial de saldo a nivel de cuenta** —
  los snapshots de net-worth viven en su propia capacidad.
- **Transactions recurrentes / movimientos programados**
  — owned por el change `transactions`.
- **Formateo de moneda en el output** — la API devuelve
  `Decimal` crudo como string (por convención JSON); la
  UI formatea para display.

## No-objetivos

- **No estamos construyendo un agregador bancario.** Sin
  sync de Plaid / Belvo / bank-API. Las cuentas son
  datos tipeados por el user únicamente.
- **No estamos implementando sync de balance en tiempo
  real.** Los balances se derivan del opening balance +
  (futuras) transactions. Sin push notifications, sin
  webhooks bancarios.
- **No introducimos un primitivo de ledger nuevo.** Este
  change es CRUD de cuenta con opening balance; la
  semántica de double-entry ledger vive en `transactions`.
- **No extendemos el modelo `Account` de Auth.js.** La
  cuenta financiera es `FinancialAccount` en Prisma
  precisamente para mantener las tablas de auth sin
  tocar.

## Usuarios y situaciones

| User                                      | Situación                                                                                          | Touchpoint                                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| User nuevo, recién registrado             | Quiere empezar a trackear su efectivo + cuentas bancarias                                          | `POST /api/accounts` (UI es `ui-accounts`); abre una cuenta `CASH` con `openingBalanceMode: 'fresh'` (aplican los defaults) |
| User activo, agregando tarjeta            | Tiene 2 cuentas bancarias, quiere trackear una tarjeta de crédito nueva                            | `POST /api/accounts` con `type = CREDIT`, `creditLimit`, `statementDay`, `paymentDueDay`                                    |
| User activo, agregando investment account | Tiene cash + bank + tarjetas, quiere trackear una brokerage (ej. Balanz) en ARS o USD              | `POST /api/accounts` con `type = INVESTMENT`, `broker: "Balanz"`, `currency: "ARS"` (o `"USD"`), opening balance histórico  |
| User activo, agregando crypto wallet      | Trackea una wallet self-custody junto con sus cuentas bancarias                                    | `POST /api/accounts` con `type = CRYPTO`, `walletAddress: "0xABC..."`, `currency: "USD"`                                    |
| User activo, agregando generic / other    | Tiene un receivable de un amigo que quiere trackear fuera de las categorías estándar               | `POST /api/accounts` con `type = OTHER` y un `name` descriptivo (sin extras type-specific)                                  |
| User recurrente, listando                 | Quiere ver sus cuentas activas                                                                     | `GET /api/accounts` (default: `includeArchived = false`)                                                                    |
| User recurrente, editando                 | Renombra una cuenta, actualiza el límite de crédito tras un aumento                                | `PATCH /api/accounts/:id`                                                                                                   |
| User recurrente, corrigiendo backfill     | Se dio cuenta de que el saldo histórico estaba mal por unos centavos                               | `PATCH /api/accounts/:id` con `{ openingBalanceAmount: "5000.50" }` (date sin cambios)                                      |
| User recurrente, cerrando                 | Canceló una tarjeta de crédito, la quiere fuera de la lista activa pero visible en reports pasados | `POST /api/accounts/:id/archive` (soft archive; recuperable vía `POST /api/accounts/:id/unarchive`)                         |
| User en un segundo device                 | Mismo `userId`, sesión fresca; lista cuentas y obtiene el mismo set                                | Todas las rutas son stateless excepto por el `auth()`; la consistencia cross-device es automática                           |
| User multi-moneda (en este change)        | Tiene cuentas en ARS y USD                                                                         | Cada cuenta tiene su propio `currency`; la conversión se difiere a `fx-cache` (whitelist `{ ARS, USD }` en este change)     |
| User con 50+ cuentas                      | Quiere paginación en el list                                                                       | Cursor pagination en `?limit=50&cursor=<id>`; el index soporta el scan                                                      |
| User intenta acceder a la cuenta de otro  | Ingresa un `accountId` adivinado                                                                   | `404 NOT_FOUND` — sin leak de enumeración                                                                                   |

## Reglas de negocio

1. **BR-ACC-1 — `type` es uno de `CASH`, `BANK`, `CREDIT`,
   `INVESTMENT`, `CRYPTO`, `OTHER`.** El enum queda
   cerrado en este change. `type` es inmutable después de
   la creación; cambiar de tipo es `delete + create` (y
   delete no se expone en este change, así que el user
   tiene que archivar y crear una nueva).
2. **BR-ACC-2 — `currency` es un código ISO-4217 en
   mayúsculas, restringido a la whitelist
   `{ ARS, USD }` en este change.** Length 3. Validado
   por Zod (`z.string().length(3).regex(/^[A-Z]{3}$/)`)
   más un `.refine()` que acepta solo `"ARS"` o `"USD"`.
   La moneda se **elige en la creación** por el caller;
   no se hereda ningún default a nivel user (este change
   **no** agrega `User.baseCurrency`). Mutable vía
   `PATCH`; este change no gatea con transactions (el
   gate se agrega cuando `transactions` llegue — ver
   `Decision gaps #3`).
3. **BR-ACC-3 — El opening balance es un híbrido vía un
   Zod discriminated union sobre `openingBalanceMode:
'historical' | 'fresh'`.**
   - La variante **`fresh`** no requiere campos de
     opening balance en el input. La aplicación setea
     `openingBalanceAmount = 0` y `openingBalanceDate =
createdAt`; ambas columnas de la DB tienen defaults
     equivalentes (`@default(0)` para el amount, y la
     date defaulta a `createdAt` en la capa de aplicación
     al insert) para que la fila sea válida incluso antes
     de que la capa de aplicación corra.
   - La variante **`historical`** requiere ambos
     `openingBalanceAmount` (Decimal como string, puede
     ser negativo para deuda de tarjeta) y
     `openingBalanceDate` (UTC date, sin componente de
     hora, debe ser ≤ hoy).
   - `PATCH /api/accounts/:id` muta `openingBalanceAmount`
     y `openingBalanceDate` directamente (sin
     discriminator — el mode es una concern de intención
     de creación; una vez que la fila existe, los edits
     son a nivel de campo).
   - `currentBalance` se deriva (`openingBalanceAmount +
sum(tx.amount where tx.accountId = id and tx.date >=
openingBalanceDate)`) en la capa de aplicación. El
     change `transactions` es dueño de la implementación
     de la derivación; este change expone `currentBalance`
     como `null` en el DTO hasta que ese change llegue
     (el campo está reservado, no poblado).
   - **Por qué un discriminated union, no un único shape
     con defaults**: los dos paths expresan intención
     genuinamente distinta del user (backfill vs
     start-fresh) y el discriminator hace el contrato
     explícito en el borde de la API, eliminando la
     ambigüedad de input parcial (proveer solo `amount`
     sin `date`, o viceversa) a nivel de schema en vez
     de via defaults implícitos.
4. **BR-ACC-4 — Soft archive vía `archivedAt`.** Sin
   hard delete. `POST /api/accounts/:id/archive` setea
   `archivedAt = now()`; `POST /api/accounts/:id/unarchive`
   la limpia. Las cuentas archivadas se excluyen de
   `GET /api/accounts` salvo `?includeArchived=true`. Las
   cuentas archivadas se siguen contando en cualquier
   agregación futura de snapshot/reports (porque la fila
   sigue ahí). Las transiciones idempotentes no son
   errores.
5. **BR-ACC-5 — `name` es único por `userId`.** Enforced
   por `@@unique([userId, name])`. El schema de Zod corre
   un pre-check antes del insert; la constraint única es
   el gate autoritativo (agarra las race conditions).
   Unicidad case-sensitive (Argentina usa "MercadoPago" y
   "Mercadopago" como nombres distintos — respetamos la
   intención del user).
6. **BR-ACC-6 — `WHERE userId = ?` en todos lados.** Cada
   action y cada método de repository toma el `userId`
   de `auth()` y lo aplica como `where` de Prisma. La DB
   no tiene row-level security en MVP; la capa de
   aplicación es la única línea de defensa (misma regla
   que la spec de auth).
7. **BR-ACC-7 — 404, no 403, en acceso cross-user.** Un
   request por el `accountId` de otro user devuelve
   `404 NOT_FOUND` con el mismo shape de respuesta que
   una cuenta que realmente no existe. Sin leak de
   enumeración.
8. **BR-ACC-8 — Discriminated union sobre `type`**
   enforce el set de campos por tipo documentado en
   `### Data model`: `CASH` / `BANK` / `OTHER` no aceptan
   campos type-specific; `CREDIT` requiere `creditLimit`,
   `statementDay`, `paymentDueDay` (todos prohibidos en
   cualquier otro tipo); `INVESTMENT` acepta un
   `broker: string` opcional (prohibido en cualquier otro
   tipo); `CRYPTO` acepta un `walletAddress: string`
   opcional (prohibido en cualquier otro tipo).
   `statementDay` y `paymentDueDay` son
   `z.number().int().min(1).max(28)` (28 es el upper
   bound seguro para cualquier mes). `creditLimit` es un
   string Decimal; `broker` y `walletAddress` son strings
   no vacíos cuando se proveen. El schema de Zod es
   `z.discriminatedUnion("type", [...])`, una rama por
   valor del enum.
9. **BR-ACC-9 — Sin modificaciones de tablas de auth en
   este change.** Las 4 tablas owned por auth (`User`,
   `Account`, `Session`, `VerificationToken`) no se
   tocan. La columna `User.baseCurrency` del draft previo
   se retira; la preferencia de moneda a nivel user vive
   en el futuro change `user-preferences`. Este change
   es dueño de cero columnas sobre la tabla `User` owned
   por auth.
10. **BR-ACC-10 — Middleware `origin-check` en cada
    endpoint que muta.** Misma regla que
    `POST /api/auth/register`. `Origin` faltante o que
    no matchea devuelve `403 FORBIDDEN`. El middleware se
    reuse del middleware Hono del módulo auth (exportado
    como `originCheck` desde `@/modules/auth` si todavía
    no está exportado — la fase de design lo confirma;
    si no está exportado, este change lo exporta).

## Implicaciones e impacto

| Área                           | Impacto                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Base de datos**              | 1 nuevo modelo Prisma (`FinancialAccount`) + 1 enum extendido (`AccountType` crece de 3 a 6 valores: `CASH`, `BANK`, `CREDIT`, `INVESTMENT`, `CRYPTO`, `OTHER`). Una migración: `2026XXXXXX_add_financial_accounts`. Las 4 tablas owned por auth quedan completamente intactas (BR-ACC-9).                                                                                                |
| **Migraciones**                | `prisma migrate dev` local; `prisma migrate deploy` en CI / producción. Idempotente.                                                                                                                                                                                                                                                                                                      |
| **Superficie de API**          | 6 rutas Hono bajo `/api/accounts/*`. Las rutas se montan vía `accountsRouter` sobre el `honoApp` existente de `@/modules/auth`. Sin router top-level nuevo. Sin middleware nuevo (origin-check se reuse).                                                                                                                                                                                 |
| **Wiring de Hono**             | Nuevo sub-app `accountsRouter` (`OpenAPIHono`) exportado desde `src/modules/accounts/application/routes.ts`. El sitio de montaje (la instancia `honoApp` en el catch-all del módulo auth vs. un Hono host dedicado en `src/modules/api/`) es decisión de `sdd-design`. Cualquiera de las dos opciones mantiene el URL space en `/api/accounts/*`.                                         |
| **Cross-module events**        | Se suscribe a `UserRegistered` vía `src/shared/events/`; el handler es un no-op `logger.info` en este change. La spec de auth ya nombra a `accounts-ledger` como consumer.                                                                                                                                                                                                                |
| **Impacto en tablas de auth**  | Ninguno. Este change no modifica ninguna tabla owned por auth. El path de escritura de `User.baseCurrency` vive en el futuro change `user-preferences`.                                                                                                                                                                                                                                   |
| **TDD estricto**               | Activado. Los services de dominio y los schemas de DTO se testean con unit tests (RED → GREEN → REFACTOR por `tasks.md`). Los métodos de repository reciben integration tests contra un testcontainer de Postgres en CI (matchea la desviación de slice-c noted en `auth-foundation-slice-c/verify-report.md`: Postgres real en CI es parte de la estrategia de tests going forward).     |
| **Cobertura**                  | ≥ 80% en `src/modules/accounts/{domain,application,infrastructure}/**` (líneas, branches, funciones, statements). Enforzado en `vitest.config.ts#coverage.include` (el path se agrega; los thresholds se quedan en 80/80/80/80 según la spec de auth).                                                                                                                                    |
| **Manejo de dinero**           | Columnas `Decimal(19, 4)`; nunca `Float`. La serialización JSON es el valor `Decimal` como string (default del Prisma client para `Decimal`); la UI parsea con la misma library. Sin redondeo silencioso.                                                                                                                                                                                 |
| **Indexes**                    | `@@index([userId, createdAt(sort: Desc)])`, `@@index([userId, archivedAt])`, `@@unique([userId, name])`. Los primeros dos están scopeados a `userId` (sin full-table scans; el user-fanout es el patrón de acceso dominante).                                                                                                                                                             |
| **Cursor pagination**          | `GET /api/accounts` usa cursor opaco (`base64({"createdAt":"...","id":"..."})`); la fase de design es dueña del encoding. Limit inicial 50, max 200.                                                                                                                                                                                                                                      |
| **CI**                         | Sin jobs de CI nuevos. La CI de 4 jobs existente (`lint`, `test`, `build`, `security`) de `auth-foundation-slice-c` cubre este change. Se agregan security tests si la fase de design surface alguno (probablemente ninguno en este change — la postura de seguridad es la misma que la spec de auth; la enumeración cross-user es la preocupación principal y se testea con unit tests). |
| **Docs bilingües**             | Esta propuesta mirroreada en `Documents-es/openspec/changes/accounts-ledger/proposal.md` en el mismo commit (por AGENTS.md §13.3).                                                                                                                                                                                                                                                        |
| **Invariantes del stack**      | Stack v2 cerrado (Next.js 16 + Auth.js v5 + Prisma 6 + Postgres + Hono + Zod + Vitest + pnpm + Fly.io). Sin deps de runtime nuevos; `decimal.js` no se agrega (el `Decimal` de Prisma alcanza para serialización).                                                                                                                                                                        |
| **Riesgo de naming collision** | `FinancialAccount` (Prisma) vs `Account` (DTO/API) es un foot-gun conocido. Mitigado por: un mapper privado en el repository, un chequeo estático en `index.test.ts` que asserta que ningún símbolo `FinancialAccount` se filtra fuera de `src/modules/accounts/`, y un item en el checklist de code review.                                                                              |

## Casos borde (product)

| Escenario                                                                                                  | Comportamiento                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create con `type = CREDIT` pero sin `creditLimit`                                                          | `400 VALIDATION_ERROR` (BR-ACC-8; Zod discriminated union).                                                                                                                             |
| Create con `type = CASH` y un `creditLimit`                                                                | `400 VALIDATION_ERROR` (BR-ACC-8).                                                                                                                                                      |
| Create con `type = INVESTMENT` y un `walletAddress`                                                        | `400 VALIDATION_ERROR` (BR-ACC-8; `walletAddress` está prohibido en `INVESTMENT`).                                                                                                      |
| Create con `type = CRYPTO` y un `broker`                                                                   | `400 VALIDATION_ERROR` (BR-ACC-8; `broker` está prohibido en `CRYPTO`).                                                                                                                 |
| Create con `type = OTHER` y cualquier campo type-specific (`creditLimit`, `broker`, `walletAddress`)       | `400 VALIDATION_ERROR` (BR-ACC-8; `OTHER` no acepta extras).                                                                                                                            |
| Create con `type = INVESTMENT` y `broker: "Balanz"` (sin amount/date)                                      | `400 VALIDATION_ERROR` (BR-ACC-3; la variante `historical` requiere ambos campos, la variante `fresh` los omite — los campos parciales se rechazan).                                    |
| Create con `currency = "ars"` (minúsculas)                                                                 | `400 VALIDATION_ERROR` (BR-ACC-2; Zod rechaza no-mayúsculas).                                                                                                                           |
| Create con `currency = "EUR"`                                                                              | `400 VALIDATION_ERROR` (BR-ACC-2; solo `{ ARS, USD }` se aceptan en este change).                                                                                                       |
| Create con `openingBalanceMode: 'fresh'` sin campos de opening balance                                     | `201`; se crea la fila con `openingBalanceAmount = 0` y `openingBalanceDate = createdAt` (BR-ACC-3).                                                                                    |
| Create con `openingBalanceMode: 'historical'` y ambos campos provistos                                     | `201`; se crea la fila con los valores provistos (BR-ACC-3).                                                                                                                            |
| Create con `openingBalanceMode: 'historical'` pero solo `openingBalanceAmount` (sin date)                  | `400 VALIDATION_ERROR` (BR-ACC-3; los campos parciales se rechazan; "ambos-o-ninguno" enforzado por el discriminated union).                                                            |
| Create con `openingBalanceMode: 'historical'` y un `openingBalanceDate` futuro                             | `400 VALIDATION_ERROR` (BR-ACC-3; el `openingBalanceDate` debe ser ≤ hoy para la variante `historical`).                                                                                |
| Create con `openingBalanceDate` en el pasado (sin `openingBalanceMode` especificado)                       | Permitido solo con `openingBalanceMode: 'historical'`; en caso contrario se rechaza.                                                                                                    |
| `PATCH` actualizando solo `openingBalanceAmount`                                                           | Permitido (BR-ACC-3; PATCH muta el campo directamente, sin discriminator).                                                                                                              |
| `PATCH` actualizando solo `openingBalanceDate`                                                             | Permitido (BR-ACC-3).                                                                                                                                                                   |
| Create con `openingBalanceAmount` negativo en `type = CASH`                                                | `400 VALIDATION_ERROR` (efectivo en mano no puede arrancar negativo; enforzado por Zod refine).                                                                                         |
| Create con `openingBalanceAmount` negativo en `type = CREDIT`                                              | Permitido (la deuda de tarjeta de crédito es negativa desde la perspectiva del user).                                                                                                   |
| Create con `name` duplicado (mismo `userId`)                                                               | `409 ACCOUNT_NAME_TAKEN` desde la unique constraint.                                                                                                                                    |
| Create con `name` que existe bajo otro `userId`                                                            | Permitido; la unicidad es per-user (BR-ACC-5).                                                                                                                                          |
| List cuando el user tiene 0 cuentas                                                                        | `200 { data: [] }`.                                                                                                                                                                     |
| List cuando el user tiene 50 cuentas, default pagination                                                   | Devuelve 50, con `nextCursor` en `meta.nextCursor` (la fase de design es dueña del shape del envelope).                                                                                 |
| Get con el `accountId` de otro user                                                                        | `404 NOT_FOUND` (BR-ACC-7; idéntico a "no existe").                                                                                                                                     |
| Get de una cuenta archivada sin `?includeArchived=true`                                                    | `404 NOT_FOUND`. Con `?includeArchived=true`, `200` con la fila.                                                                                                                        |
| `PATCH` con intento de cambio de `type`                                                                    | `400 VALIDATION_ERROR` (`type` es inmutable; BR-ACC-1).                                                                                                                                 |
| `PATCH` con intento de cambio de `userId`                                                                  | `400 VALIDATION_ERROR` (Zod strippea campos desconocidos; el update de Prisma no toca `userId`).                                                                                        |
| `POST /archive` sobre una cuenta ya archivada                                                              | Idempotente; devuelve la fila sin cambios (BR-ACC-4).                                                                                                                                   |
| `POST /unarchive` sobre una cuenta activa                                                                  | Idempotente; devuelve la fila sin cambios.                                                                                                                                              |
| Header `Origin` faltante en `POST /api/accounts`                                                           | `403 FORBIDDEN` (BR-ACC-10).                                                                                                                                                            |
| Header `Origin` de `https://evil.com` en `POST /api/accounts`                                              | `403 FORBIDDEN` (BR-ACC-10).                                                                                                                                                            |
| Sesión expirada mid-request                                                                                | `401 UNAUTHORIZED` (lo maneja el `auth()` del módulo auth devolviendo `null`).                                                                                                          |
| Create concurrente con el mismo `name` desde dos devices                                                   | Uno gana, el otro recibe `409 ACCOUNT_NAME_TAKEN` (la constraint única resuelve la race).                                                                                               |
| Cambio de `currency` en `PATCH` después de que la cuenta tiene transactions (futuro change `transactions`) | El futuro change bloquea el cambio de `currency` cuando hay `Transaction` rows que referencian la cuenta. Este change no gatea; el flag de `Decision gaps #3` cubre el diseño del gate. |

## Brechas de decisión (abiertas para la próxima ronda proposal/spec)

| #   | Pregunta                                                                                                                                                                 | Default si no se contesta                                                                                                                                                                                                                                                         | Cómo se resuelve                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | ¿Cuándo llega `fx-cache` relativo a `accounts-ledger`? ¿Es suficiente la whitelist `{ ARS, USD }` para MVP?                                                              | `fx-cache` llega después. `accounts-ledger` shippea con la whitelist `{ ARS, USD }` (Q2 respuesta corregida); `fx-cache` amplía la whitelist cuando llegue.                                                                                                                       | `sdd-spec` para `accounts` re-confirma; el user lo aclara en review.                                                        |
| 2   | ¿Debe `currentBalance` ser una columna denormalizada o puramente derivada?                                                                                               | Puramente derivada en la capa de aplicación (sin columna). El change `transactions` decide si materializar un cache.                                                                                                                                                              | `sdd-design` decide según el ratio read/write que el change `transactions` surface.                                         |
| 3   | Cuando `transactions` llegue, ¿se puede mutar `currency` mientras hay transactions?                                                                                      | No. El change `transactions` agrega un gate: `PATCH /api/accounts/:id { currency }` devuelve `409 CURRENCY_LOCKED` si alguna fila `Transaction` referencia la cuenta.                                                                                                             | Tracked en el futuro change.                                                                                                |
| 4   | Cursor pagination — ¿opaque base64 o cursor firmado?                                                                                                                     | Opaque base64 de `{ createdAt, id }`. Sin firma en MVP (el cursor no es security-sensitive — solo filtra; un cursor forjado devuelve otra página).                                                                                                                                | `sdd-design` decide.                                                                                                        |
| 5   | ¿Debe el middleware `origin-check` exportarse desde `@/modules/auth` (para reuso) o duplicarse acá?                                                                      | Exportado desde `@/modules/auth` (el símbolo `originCheck` se agrega en `sdd-design` si no está exportado). Sin duplicación.                                                                                                                                                      | Confirmado por el chequeo estático `index.test.ts` de la spec de auth (que falla si se reach-in a internals no exportados). |
| 6   | ¿Dónde vive el Hono catch-all — el `honoApp` del módulo auth o un host dedicado `src/modules/api/`?                                                                      | La spec de auth dice que `honoApp` se exporta desde `src/modules/auth/index.ts`. El diagrama de `docs/architecture.md` lo muestra en `src/modules/api/`. La discrepancia se resuelve en `sdd-design` (probable: se queda en `src/modules/auth` y el architecture doc se corrige). | `sdd-design` reconcilia las dos fuentes.                                                                                    |
| 7   | (Eliminada — `User.baseCurrency` no se agrega en este change. La preferencia de currency a nivel user vive en el futuro change `user-preferences`. Tracked ahí, no acá.) | —                                                                                                                                                                                                                                                                                 | —                                                                                                                           |
| 8   | ¿Preocupaciones de multi-device / CRDT?                                                                                                                                  | Fuera de alcance en MVP. La app es last-write-wins en `PATCH`. Edits concurrentes en devices distintos se pueden pisar; el próximo change puede agregar un check de optimistic-concurrency basado en `updatedAt` (header `If-Match`) si el user lo quiere.                        | `sdd-design` lo flagea. Fuera de alcance de este change.                                                                    |
| 9   | ¿Qué pasa con las cuentas archivadas en reports / net-worth snapshots (futuro)?                                                                                          | Las cuentas archivadas se siguen contando (la fila está ahí, `archivedAt` es metadata, no hard delete).                                                                                                                                                                           | `networth-snapshot` y `reports-mvp` lo confirman en sus propios specs.                                                      |

## Aceptación (evidencia que el reviewer va a ver)

1. **Tests verde**: `pnpm test` sale con exit 0 con las
   6 actions cubiertas por domain unit tests + repository
   integration tests. Cobertura en `src/modules/accounts/**`
   ≥ 80% (líneas, branches, funciones, statements). El
   test de enumeración (BR-ACC-7) y los tests de
   discriminated-union (BR-ACC-8) son nombres de test
   explícitos.
2. **Smoke manual**: `pnpm run dev` →
   - Sign in vía el slice de auth (flujo existente).
   - `POST /api/accounts` con `{ name: "Efectivo",
type: "CASH", currency: "ARS", openingBalanceMode:
"historical", openingBalanceAmount: "5000.00",
openingBalanceDate: "2026-06-01" }` →
     `201 { data: AccountDetail }`.
   - `POST /api/accounts` con `{ name: "Caja USD",
type: "CASH", currency: "USD", openingBalanceMode:
"fresh" }` → `201` (la fila se crea con
     `openingBalanceAmount = 0`, `openingBalanceDate =
createdAt`).
   - `POST /api/accounts` con `{ name: "Balanz",
type: "INVESTMENT", currency: "ARS", broker: "Balanz",
openingBalanceMode: "historical", openingBalanceAmount:
"150000.00", openingBalanceDate: "2026-01-15" }` →
     `201`.
   - `GET /api/accounts` → devuelve la fila.
   - `GET /api/accounts/<id>` → devuelve la fila.
   - `POST /api/accounts/<id>/archive` → se setea
     `archivedAt`; `GET /api/accounts` la excluye.
   - `POST /api/accounts/<id>/unarchive` → se limpia.
   - `POST /api/accounts` con `type = "CREDIT"` y sin
     `creditLimit` → `400 VALIDATION_ERROR`.
   - `POST /api/accounts` con `type = "CASH"` y
     `creditLimit` → `400 VALIDATION_ERROR`.
   - `POST /api/accounts` con `type = "INVESTMENT"` y
     `walletAddress` → `400 VALIDATION_ERROR`.
   - `POST /api/accounts` con `currency = "EUR"` →
     `400 VALIDATION_ERROR` (no está en `{ ARS, USD }`).
   - `POST /api/accounts` con `openingBalanceMode:
"historical"` y sin `openingBalanceAmount` →
     `400 VALIDATION_ERROR`.
   - `GET /api/accounts/<other-user-id>` → `404`.
   - `POST /api/accounts` sin header `Origin` → `403`.
3. **Review adversarial**: un subagent `reviewer` audita
   el diff con foco en:
   - Enumeración cross-user (BR-ACC-7; tests en la capa
     de service y la capa HTTP).
   - Correctitud del discriminated-union sobre `type`
     (BR-ACC-8; tests en cada path `CASH` / `BANK` /
     `CREDIT` / `INVESTMENT` / `CRYPTO` / `OTHER` con los
     extras por tipo correspondientes).
   - Correctitud del discriminated-union sobre
     `openingBalanceMode` (BR-ACC-3; tests en ambas
     variantes `fresh` y `historical` y en el rechazo de
     input parcial).
   - Invariantes de dinero (Decimal únicamente, sin
     Float, serialización JSON como string).
   - Disciplina de `WHERE userId = ?` (BR-ACC-6; chequeo
     estático en `accounts.service.test.ts` que falla si
     un método de repository se llama sin `userId`).
   - Leak del namespace `FinancialAccount` vs `Account`
     (test estático en `index.test.ts`).
   - Sin modificaciones de tablas de auth (BR-ACC-9); el
     change sólo toca el nuevo modelo `FinancialAccount`
     y el enum `AccountType` extendido.
4. **GGA**: `gga run` sale con exit 0. Output pegado en
   el handoff. (Por AGENTS.md §2.6, si el self-review del
   harness falla con `openrouter`, la verificación
   on-disk es el gate.)
5. **Docs bilingües**:
   `openspec/changes/accounts-ledger/proposal.md` y
   `Documents-es/openspec/changes/accounts-ledger/proposal.md`
   están en sync. La detección de drift corre en el mismo
   commit.
6. **Doc de arquitectura actualizado**:
   `docs/architecture.md` gana una sección "Accounts" a
   la que esta propuesta linkea (mirroreada en
   `Documents-es/docs/architecture.md`).

## Riesgos (mitigados)

| Riesgo                                                                                   | Mitigación                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leak del namespace `FinancialAccount` ↔ `Account`                                       | Mapper privado en `financial-account.repository.ts`; test estático en `index.test.ts` grepea por `FinancialAccount` afuera de `src/modules/accounts/` y falla si lo encuentra. Item del checklist de code review.                                                                                                                                                           |
| Sin modificaciones de tablas de auth en este change                                      | BR-ACC-9 explicita que las 4 tablas owned por auth no se tocan. La regla "Auth.js-owned tables MUST NOT be modified by hand" de la spec de auth queda totalmente satisfecha. El path de escritura de `User.baseCurrency` vive en el futuro change `user-preferences`. El default `User.baseCurrency` del draft previo se retiró.                                            |
| Redondeo de dinero                                                                       | `Decimal(19, 4)` únicamente. Sin `Float`. La serialización JSON es el `Decimal` como string. La derivación de `currentBalance` suma `Decimal`s y devuelve un `Decimal`. Sin conversión silenciosa a centavos; sin `parseFloat`.                                                                                                                                             |
| Enumeración cross-user                                                                   | BR-ACC-7 + 404-not-403 + mismo shape de respuesta. Unit-testeado en la capa de service y HTTP.                                                                                                                                                                                                                                                                              |
| Regresión de discriminated-union sobre `type`                                            | BR-ACC-8 enforzado por Zod en el action boundary. Los tests cubren todas las transiciones a lo largo de los 6 valores del enum × tiene-extras / le-faltan-extras (la matriz está en `### Data model`).                                                                                                                                                                      |
| Creates concurrentes con `name` duplicado                                                | `@@unique([userId, name])` es el gate autoritativo. Pre-check + insert race-safe (el unique-violation surface como `P2002`, mapeado a `409 ACCOUNT_NAME_TAKEN`).                                                                                                                                                                                                            |
| La ronda de preguntas de la propuesta timed-out; los defaults pueden no matchear al user | Esta propuesta carga una sección `## Proposal question round` flageando explícitamente los 4 defaults. Q1, Q2 y Q3 se corrigieron en el mismo ciclo SDD después de que el user proveyó las correcciones; Q4 quedó confirmada sin cambios. Si el user disiente con las correcciones en una segunda review, las secciones afectadas se corrigen otra vez antes de `sdd-spec`. |
| Las lecturas de cursor pagination son O(N) en `createdAt` + `id`                         | El índice compuesto `@@index([userId, createdAt(sort: Desc)])` mantiene el scan ajustado por user. La fase de design confirma que el encoding del cursor matchea el índice.                                                                                                                                                                                                 |
| `origin-check` no está actualmente exportado desde `@/modules/auth`                      | `sdd-design` agrega el export (o documenta la duplicación si el export se rechaza). Los tests del middleware `originCheck` viven en el módulo auth; los tests de este change assertean que el símbolo es importable.                                                                                                                                                        |
| Velocidad del strict-TDD                                                                 | RED → GREEN → REFACTOR por task. La capa de dominio es rule-heavy (10 BRs, mayormente Zod-validated); los unit tests son chicos. Los integration tests corren en CI contra testcontainers (por resolución de desviación de slice-c).                                                                                                                                        |

## Pronóstico de carga de review (mandatory)

3 PRs chained a `develop`, **todos por encima del budget
de 400 líneas**. El user aceptó explícitamente el overage
en la planificación de `auth-foundation` (`HANDOFF.md`
§"Forecast of chained PRs"). Lo mismo aplica acá. El
primer slice es el más grande (lleva el modelo Prisma, la
migración, los DTOs de Zod, y el grueso de la capa de
dominio). Los slices 2 y 3 son el wiring de Hono + los
tests cross-cutting.

| Slice                                         | Tasks (est.) | Líneas (est.) | Overage vs 400 |
| --------------------------------------------- | ------------ | ------------- | -------------- |
| A — Data model + domain + application + DTOs  | T-A01..T-A12 | ~700          | 1.75×          |
| B — Hono routes + origin-check + auth wiring  | T-B01..T-B06 | ~500          | 1.25×          |
| C — Integration tests + security tests + docs | T-C01..T-C08 | ~600          | 1.5×           |
| **Total**                                     | **~26**      | **~1,800**    | —              |

El worker de la fase apply surface los números reales de
`git diff --stat` en el momento del apply; el parent
decide si re-forecast a 4 slices si un reviewer empuja
para atrás.

## Orden downstream del change

Después de este change, quedan unblocked:

1. **`transactions`** — la siguiente capacidad de alta
   prioridad. Es dueña del modelo `Transaction`, la
   contabilidad estilo double-entry, y la derivación de
   `currentBalance` (BR-ACC-3). Depende de `accounts` +
   `auth`.
2. **`fx-cache`** — es dueña de las FX rates + el API de
   conversión. Unblocks la conversión multi-moneda en
   `accounts` y `reports`. Depende de `auth` (independiente
   de `accounts-ledger`, pero ordenada acá porque los
   reports consumen FX).
3. **`networth-snapshot`** — es dueña del cómputo periódico
   de net worth. Depende de `accounts` + `fx-cache`.
4. **`reports-mvp`** — depende de `accounts` +
   `transactions` + `fx-cache` + `networth-snapshot`.
5. **`ui-accounts`** — es dueña de las pantallas CRUD de
   cuentas, el flujo de onboarding (seed de cuentas por
   defecto por `UserRegistered` según la spec de auth), y
   la UI de preferencia de `User.baseCurrency`.
6. **`pwa-shell`** — depende de al menos un recurso
   protegido (`ui-accounts` es el fit natural).
7. **`fly-deploy`** — independiente; llega al final.

## Próximo paso

Después de que el user apruebe esta propuesta (Q1, Q2 y
Q3 se corrigieron según el review del user; Q4 quedó
confirmada sin cambios — ver la sección
`## Ronda de preguntas de la propuesta`), la próxima fase
es `sdd-spec`:

- Producir `openspec/changes/accounts-ledger/spec.md` con
  las entradas de delta-spec (las reglas BR-ACC-1..10,
  los shapes de los endpoints, los schemas Zod de los
  DTOs, el cross-module contract con `auth`), mirroreado
  en `Documents-es/openspec/changes/accounts-ledger/spec.md`.
- Después `sdd-design` (mapper Prisma-vs-API, el wiring
  del sub-app de Hono, el encoding del cursor, la decisión
  del export de `originCheck`, el stub de derivación de
  `currentBalance`, el alcance de los security tests).
- Después `sdd-tasks` (T-A01..T-A12, T-B01..T-B06,
  T-C01..T-C08 con columnas de evidencia TDD).
- Después `sdd-apply` (3 PRs chained a `develop`: Slice A
  data + domain, Slice B routes + wiring, Slice C
  integration + security + docs).
- Después `sdd-verify`, `sdd-sync` (se escribe el
  `openspec/specs/accounts/spec.md` canónico),
  `sdd-archive` (se mueve
  `openspec/changes/accounts-ledger/` a
  `openspec/changes/archive/`).
